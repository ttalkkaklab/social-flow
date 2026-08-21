/**
 * Suno music client — sunoapi.org REST (Kie.ai family).
 *
 * Suno Inc. has no public self-serve API as of 2026-08 (the official product
 * is the consumer app and Studio). This module wraps the third-party REST
 * that fills that gap — Bearer key, async generate (POST → taskId → poll →
 * mp3). MCP stdio has no webhook server, so callBackUrl is a dummy and we
 * finish by polling.
 *
 * Same slot as Lyria (music-client), different job:
 * - Lyria 3 Clip: fixed 30s instrumental BGM, $0.04/clip, one call
 * - Suno generate: two sung tracks, 2–8 min, ~12 credits/call (≈$0.06)
 * - Suno sounds: loopable bed/ambience with BPM and key (V5 only)
 *
 * Result URLs expire after 15 days, so files are saved locally as soon as
 * polling finishes. The API key is checked at call time (config.requireSunoKey).
 */

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import { requireSunoKey, sunoBaseUrl } from './config.js';
import { bareFilenameSchema, saveAudioFile } from './media-utils.js';

export const SUNO_MODELS = ['V4', 'V4_5', 'V4_5PLUS', 'V4_5ALL', 'V5', 'V5_5'] as const;
export type SunoModel = (typeof SUNO_MODELS)[number];
export const DEFAULT_SUNO_MODEL: SunoModel = 'V5';

/** Sounds tasks accept V5 only (vendor constraint). */
export const SUNO_SOUND_MODEL = 'V5' as const;

export const SUNO_SOUND_KEYS = [
  'Any', 'Cm', 'C#m', 'Dm', 'D#m', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'A#m', 'Bm',
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
] as const;

export const SUNO_VOCAL_GENDERS = ['m', 'f'] as const;
export const SUNO_PERSONA_MODELS = ['style_persona', 'voice_persona'] as const;

/** Poll interval — the vendor suggests 30s, which is sparse for a 2–3 min job. */
const POLL_INTERVAL_MS = 15_000;
const MAX_POLLS = 40; // 10 minutes
const LYRICS_POLL_INTERVAL_MS = 5_000;
const LYRICS_MAX_POLLS = 36; // 3 minutes
const SOUND_POLL_INTERVAL_MS = 10_000;
const SOUND_MAX_POLLS = 36; // 6 minutes

/**
 * Dummy callback for MCP stdio, which has no webhook server.
 *
 * The OpenAPI spec marks callBackUrl required, so an empty value is a 400.
 * httpbin answers POST with 200 and avoids CALLBACK_EXCEPTION. If the
 * exception still fires, a present audio URL is treated as success — the
 * generate finished; only the notify failed.
 */
const DUMMY_CALLBACK_URL = 'https://httpbin.org/post';

const FAILED_STATUSES = new Set([
  'CREATE_TASK_FAILED',
  'GENERATE_AUDIO_FAILED',
  'GENERATE_LYRICS_FAILED',
  'SENSITIVE_WORD_ERROR',
  'FAILED',
]);

const DONE_STATUSES = new Set(['SUCCESS', 'FIRST_SUCCESS']);

// ── schemas ────────────────────────────────────────────────────

export const sunoGenerateSchema = z.object({
  prompt: z.string().min(1).optional(),
  customMode: z.boolean().default(false),
  instrumental: z.boolean().default(false),
  style: z.string().optional(),
  title: z.string().optional(),
  model: z.enum(SUNO_MODELS).default(DEFAULT_SUNO_MODEL),
  duration: z.number().int().min(10).max(360).optional(),
  negativeTags: z.string().optional(),
  vocalGender: z.enum(SUNO_VOCAL_GENDERS).optional(),
  personaId: z.string().min(1).optional(),
  personaModel: z.enum(SUNO_PERSONA_MODELS).optional(),
  pickTrack: z.number().int().min(0).max(1).default(0),
  outputPath: z.string().optional(),
  filename: bareFilenameSchema('audio').optional(),
});

export const sunoSoundSchema = z.object({
  prompt: z.string().min(1).max(500),
  soundLoop: z.boolean().default(true),
  soundTempo: z.number().int().min(1).max(300).optional(),
  soundKey: z.enum(SUNO_SOUND_KEYS).optional(),
  pickTrack: z.number().int().min(0).max(1).default(0),
  outputPath: z.string().optional(),
  filename: bareFilenameSchema('audio').optional(),
});

export const sunoLyricsSchema = z.object({
  prompt: z.string().min(1).max(200),
});

export type SunoGenerateRequest = z.infer<typeof sunoGenerateSchema>;
export type SunoSoundRequest = z.infer<typeof sunoSoundSchema>;
export type SunoLyricsRequest = z.infer<typeof sunoLyricsSchema>;

export interface SunoTrack {
  id: string;
  audioPath: string;
  audioUrl?: string;
  title?: string;
  tags?: string;
  durationSeconds?: number;
  imageUrl?: string;
  prompt?: string;
}

export interface SunoGenerateResponse {
  success: boolean;
  error?: string;
  taskId?: string;
  model?: string;
  tracks?: SunoTrack[];
  audioPath?: string;
}

export interface SunoLyricsVariant {
  title?: string;
  text: string;
}

export interface SunoLyricsResponse {
  success: boolean;
  error?: string;
  taskId?: string;
  lyrics?: SunoLyricsVariant[];
}

export interface SunoCreditsResponse {
  success: boolean;
  error?: string;
  credits?: number;
}

interface SunoApiEnvelope {
  code?: number;
  msg?: string;
  data?: unknown;
}

interface RecordInfo {
  taskId?: string;
  status?: string;
  errorMessage?: string;
  errorCode?: number | null;
  response?: {
    taskId?: string;
    sunoData?: unknown[];
    data?: unknown[];
  };
}

// ── HTTP ────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function describeSunoError(code: number | undefined, msg: string | undefined, httpStatus?: number): string {
  const text = (msg || '').trim() || '(no message)';
  switch (code) {
    case 400:
      return `Invalid parameters: ${text}`;
    case 401:
      return `Unauthorized — SUNO_API_KEY is missing or expired (https://sunoapi.org/api-key). ${text}`;
    case 405:
      return `Rate limit exceeded (20 req / 10s): ${text}`;
    case 413:
      return `Prompt or style too long: ${text}`;
    case 429:
      return `Insufficient credits — top up at the sunoapi.org dashboard. ${text}`;
    case 430:
      return `Call frequency too high, retry later: ${text}`;
    case 455:
      return `Suno API under maintenance: ${text}`;
    default:
      if (httpStatus && httpStatus >= 400) return `HTTP ${httpStatus} (code ${code ?? '?'}): ${text}`;
      return `Suno API error (code ${code ?? '?'}): ${text}`;
  }
}

async function sunoFetch(pathName: string, init: RequestInit = {}): Promise<SunoApiEnvelope> {
  const apiKey = requireSunoKey();
  const url = `${sunoBaseUrl()}${pathName}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.body) headers['Content-Type'] = 'application/json';

  const response = await fetch(url, { ...init, headers });
  const bodyText = await response.text();
  let parsed: SunoApiEnvelope;
  try {
    parsed = JSON.parse(bodyText) as SunoApiEnvelope;
  } catch {
    throw new Error(
      response.ok
        ? `Suno API returned non-JSON: ${bodyText.slice(0, 400)}`
        : `HTTP ${response.status} — ${bodyText.slice(0, 400)}`,
    );
  }
  if (!response.ok || (parsed.code !== undefined && parsed.code !== 200)) {
    throw new Error(describeSunoError(parsed.code, parsed.msg, response.status));
  }
  return parsed;
}

function taskIdFrom(data: unknown): string {
  if (typeof data === 'string' && data.length > 0) return data;
  if (data && typeof data === 'object' && 'taskId' in data) {
    const id = (data as { taskId?: unknown }).taskId;
    if (typeof id === 'string' && id.length > 0) return id;
  }
  throw new Error('Suno API returned no taskId');
}

// ── track parsing (camelCase and snake_case mixed) ──────────────

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function str(record: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

function num(record: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return undefined;
}

function parseTrack(raw: unknown, index: number): {
  id: string;
  audioUrl: string;
  title?: string;
  tags?: string;
  durationSeconds?: number;
  imageUrl?: string;
  prompt?: string;
} | undefined {
  const record = asRecord(raw);
  if (!record) return undefined;
  const audioUrl = str(record, 'audioUrl', 'audio_url', 'sourceAudioUrl', 'source_audio_url');
  if (!audioUrl) return undefined;
  return {
    id: str(record, 'id') || `track-${index}`,
    audioUrl,
    title: str(record, 'title'),
    tags: str(record, 'tags'),
    durationSeconds: num(record, 'duration'),
    imageUrl: str(record, 'imageUrl', 'image_url'),
    prompt: str(record, 'prompt'),
  };
}

function tracksFromRecord(info: RecordInfo): ReturnType<typeof parseTrack>[] {
  const payload = info.response;
  const list = payload?.sunoData ?? payload?.data ?? [];
  if (!Array.isArray(list)) return [];
  return list.map((item, index) => parseTrack(item, index)).filter((t): t is NonNullable<typeof t> => t !== undefined);
}

function lyricsFromRecord(info: RecordInfo): SunoLyricsVariant[] {
  const list = info.response?.data ?? [];
  if (!Array.isArray(list)) return [];
  const out: SunoLyricsVariant[] = [];
  for (const item of list) {
    const record = asRecord(item);
    if (!record) continue;
    const text = str(record, 'text');
    if (!text) continue;
    out.push({ text, title: str(record, 'title') });
  }
  return out;
}

// ── download · wav transcode ───────────────────────────────────

async function downloadBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download audio: HTTP ${response.status} (URLs expire after 15 days)`);
  }
  return Buffer.from(await response.arrayBuffer());
}

function stemFromFilename(filename: string): string {
  return filename.replace(/\.[^.]+$/, '');
}

function extOf(filename: string): string {
  return path.extname(filename).toLowerCase();
}

function transcodeToWav(src: string, dest: string): void {
  const result = spawnSync(
    'ffmpeg',
    ['-y', '-v', 'error', '-i', src, '-acodec', 'pcm_s16le', '-ar', '48000', '-ac', '2', dest],
    { encoding: 'utf8', timeout: 120_000 },
  );
  if (result.error) {
    throw new Error(
      `ffmpeg failed to start (${result.error.message}). This plugin requires ffmpeg — brew install ffmpeg.`,
    );
  }
  if (result.status !== 0) {
    throw new Error(`ffmpeg convert failed: ${(result.stderr || result.stdout || `exit ${result.status}`).slice(0, 400)}`);
  }
}

async function saveTracks(
  parsed: NonNullable<ReturnType<typeof parseTrack>>[],
  outputDir: string,
  filename: string | undefined,
  pickTrack: number,
): Promise<SunoTrack[]> {
  if (parsed.length === 0) throw new Error('Task succeeded but no audio URL in response');

  const primaryName = filename || `suno_${Date.now()}.mp3`;
  const stem = stemFromFilename(primaryName);
  const wantWav = extOf(primaryName) === '.wav';
  const tracks: SunoTrack[] = [];

  for (let i = 0; i < parsed.length; i += 1) {
    const item = parsed[i];
    const isPick = i === pickTrack || (pickTrack >= parsed.length && i === 0);
    const mp3Name = isPick && !wantWav ? (extOf(primaryName) === '.mp3' ? primaryName : `${stem}.mp3`) : `${stem}_${i === 0 ? 'a' : 'b'}.mp3`;
    const buffer = await downloadBuffer(item.audioUrl);
    const mp3Path = saveAudioFile(outputDir, mp3Name, buffer);

    let audioPath = mp3Path;
    if (isPick && wantWav) {
      const wavPath = path.join(path.dirname(mp3Path), primaryName);
      transcodeToWav(mp3Path, wavPath);
      audioPath = wavPath;
    }

    tracks.push({
      id: item.id,
      audioPath,
      audioUrl: item.audioUrl,
      title: item.title,
      tags: item.tags,
      durationSeconds: item.durationSeconds,
      imageUrl: item.imageUrl,
      prompt: item.prompt,
    });
  }

  // Move pickTrack to the front so callers that take tracks[0] get the chosen one.
  if (pickTrack > 0 && pickTrack < tracks.length) {
    const [picked] = tracks.splice(pickTrack, 1);
    tracks.unshift(picked);
  }
  return tracks;
}

// ── polling ────────────────────────────────────────────────────

function isTerminalFailure(status: string | undefined): boolean {
  return !!status && FAILED_STATUSES.has(status);
}

function isDone(status: string | undefined, tracksReady: boolean): boolean {
  if (!status) return false;
  if (DONE_STATUSES.has(status) && tracksReady) return true;
  // Generate finished, callback failed — treat as success when audio is present.
  if (status === 'CALLBACK_EXCEPTION' && tracksReady) return true;
  return false;
}

async function pollRecord(
  taskId: string,
  opts: { intervalMs: number; maxPolls: number; label: string },
): Promise<RecordInfo> {
  let last: RecordInfo = {};
  for (let poll = 1; poll <= opts.maxPolls; poll += 1) {
    console.error(`[Suno] ${opts.label} in progress... (polling ${poll}/${opts.maxPolls}, task ${taskId})`);
    await sleep(opts.intervalMs);
    const envelope = await sunoFetch(`/api/v1/generate/record-info?taskId=${encodeURIComponent(taskId)}`);
    last = (asRecord(envelope.data) ?? {}) as RecordInfo;
    const status = last.status;
    const tracks = tracksFromRecord(last);
    if (isTerminalFailure(status)) {
      throw new Error(`Generation ${status}: ${last.errorMessage || last.errorCode || status}`);
    }
    if (isDone(status, tracks.length > 0)) return last;
    if (status === 'SUCCESS' || status === 'CALLBACK_EXCEPTION') {
      // Status is success but the URL is not there yet — wait one or two more polls.
      if (poll > 2) {
        throw new Error(`Task ${status} but no audio URL yet (task ${taskId})`);
      }
    }
  }
  throw new Error(
    `${opts.label} timed out (${(opts.maxPolls * opts.intervalMs) / 60_000} minutes). ` +
      `Task ${taskId} may still be running — check the sunoapi.org dashboard.`,
  );
}

async function pollLyrics(taskId: string): Promise<RecordInfo> {
  let last: RecordInfo = {};
  for (let poll = 1; poll <= LYRICS_MAX_POLLS; poll += 1) {
    console.error(`[Suno] Lyrics in progress... (polling ${poll}/${LYRICS_MAX_POLLS}, task ${taskId})`);
    await sleep(LYRICS_POLL_INTERVAL_MS);
    const envelope = await sunoFetch(`/api/v1/lyrics/record-info?taskId=${encodeURIComponent(taskId)}`);
    last = (asRecord(envelope.data) ?? {}) as RecordInfo;
    const status = last.status;
    const lyrics = lyricsFromRecord(last);
    if (isTerminalFailure(status)) {
      throw new Error(`Lyrics ${status}: ${last.errorMessage || last.errorCode || status}`);
    }
    if (status === 'SUCCESS' && lyrics.length > 0) return last;
    if (status === 'CALLBACK_EXCEPTION' && lyrics.length > 0) return last;
  }
  throw new Error(
    `Lyrics timed out (${(LYRICS_MAX_POLLS * LYRICS_POLL_INTERVAL_MS) / 60_000} minutes). Task ${taskId}`,
  );
}

// ── public API ─────────────────────────────────────────────────

function assertGenerateArgs(request: SunoGenerateRequest): void {
  const custom = request.customMode === true;
  const instrumental = request.instrumental === true;
  if (!custom) {
    if (!request.prompt) throw new Error('prompt is required when customMode is false');
    return;
  }
  if (!request.style) throw new Error('style is required when customMode is true');
  if (!request.title) throw new Error('title is required when customMode is true');
  if (!instrumental && !request.prompt) {
    throw new Error('prompt (lyrics) is required when customMode is true and instrumental is false');
  }
  if (request.duration !== undefined && (request.model !== 'V5_5' || !custom)) {
    throw new Error('duration is only supported when model is V5_5 and customMode is true');
  }
}

/**
 * Full song — exactly two tracks per call.
 *
 * customMode=false: the model writes lyrics and style from prompt alone.
 * customMode=true + instrumental=false: prompt is sung as the lyrics.
 * customMode=true + instrumental=true: no vocals; style and title required.
 */
export async function generateMusic(request: SunoGenerateRequest): Promise<SunoGenerateResponse> {
  try {
    assertGenerateArgs(request);
    const model = request.model ?? DEFAULT_SUNO_MODEL;
    const customMode = request.customMode === true;
    const body: Record<string, unknown> = {
      customMode,
      instrumental: request.instrumental === true,
      model,
      callBackUrl: DUMMY_CALLBACK_URL,
    };
    if (request.prompt) body.prompt = request.prompt;
    if (customMode) {
      if (request.style) body.style = request.style;
      if (request.title) body.title = request.title;
    }
    if (request.duration !== undefined) body.duration = request.duration;
    if (request.negativeTags) body.negativeTags = request.negativeTags;
    if (request.vocalGender) body.vocalGender = request.vocalGender;
    if (request.personaId) body.personaId = request.personaId;
    if (request.personaModel) body.personaModel = request.personaModel;

    console.error(`[Suno] Generating music... (model: ${model}, customMode: ${customMode}, instrumental: ${body.instrumental})`);
    const created = await sunoFetch('/api/v1/generate', { method: 'POST', body: JSON.stringify(body) });
    const taskId = taskIdFrom(created.data);
    const info = await pollRecord(taskId, {
      intervalMs: POLL_INTERVAL_MS,
      maxPolls: MAX_POLLS,
      label: 'Music generation',
    });
    const parsed = tracksFromRecord(info).filter((t): t is NonNullable<typeof t> => t !== undefined);
    const tracks = await saveTracks(
      parsed,
      request.outputPath || process.cwd(),
      request.filename,
      request.pickTrack ?? 0,
    );
    console.error(`[Suno] Saved ${tracks.length} track(s): ${tracks.map((t) => t.audioPath).join(', ')}`);
    return { success: true, taskId, model, tracks, audioPath: tracks[0]?.audioPath };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Suno] Error: ${message}`);
    return { success: false, error: message };
  }
}

/**
 * Loopable bed/ambience — Sounds task (V5 only).
 *
 * A better fit for short-form BGM than a full sung track. Returns a loop
 * without intro/outro, with optional BPM and key. The builder stretches it
 * with `-stream_loop -1`.
 */
export async function generateSound(request: SunoSoundRequest): Promise<SunoGenerateResponse> {
  try {
    const body: Record<string, unknown> = {
      prompt: request.prompt,
      model: SUNO_SOUND_MODEL,
      soundLoop: request.soundLoop !== false,
      callBackUrl: DUMMY_CALLBACK_URL,
    };
    if (request.soundTempo !== undefined) body.soundTempo = request.soundTempo;
    if (request.soundKey) body.soundKey = request.soundKey;

    console.error(`[Suno] Generating sound loop... (tempo: ${request.soundTempo ?? 'auto'}, key: ${request.soundKey ?? 'Any'})`);
    const created = await sunoFetch('/api/v1/generate/sounds', { method: 'POST', body: JSON.stringify(body) });
    const taskId = taskIdFrom(created.data);
    const info = await pollRecord(taskId, {
      intervalMs: SOUND_POLL_INTERVAL_MS,
      maxPolls: SOUND_MAX_POLLS,
      label: 'Sound generation',
    });
    const parsed = tracksFromRecord(info).filter((t): t is NonNullable<typeof t> => t !== undefined);
    const tracks = await saveTracks(
      parsed,
      request.outputPath || process.cwd(),
      request.filename,
      request.pickTrack ?? 0,
    );
    console.error(`[Suno] Sound saved: ${tracks.map((t) => t.audioPath).join(', ')}`);
    return { success: true, taskId, model: SUNO_SOUND_MODEL, tracks, audioPath: tracks[0]?.audioPath };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Suno] Error: ${message}`);
    return { success: false, error: message };
  }
}

/** Lyrics only — pass the chosen text as prompt to custom-mode generate. */
export async function generateLyrics(request: SunoLyricsRequest): Promise<SunoLyricsResponse> {
  try {
    console.error(`[Suno] Generating lyrics...`);
    const created = await sunoFetch('/api/v1/lyrics', {
      method: 'POST',
      body: JSON.stringify({ prompt: request.prompt, callBackUrl: DUMMY_CALLBACK_URL }),
    });
    const taskId = taskIdFrom(created.data);
    const info = await pollLyrics(taskId);
    const lyrics = lyricsFromRecord(info);
    if (lyrics.length === 0) return { success: false, error: 'Lyrics task succeeded but returned no text', taskId };
    return { success: true, taskId, lyrics };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Suno] Error: ${message}`);
    return { success: false, error: message };
  }
}

/** Remaining credits. Check before a batch of generates. */
export async function getCredits(): Promise<SunoCreditsResponse> {
  try {
    const envelope = await sunoFetch('/api/v1/generate/credit');
    const credits =
      typeof envelope.data === 'number'
        ? envelope.data
        : num(asRecord(envelope.data) ?? {}, 'credits', 'credit');
    if (credits === undefined) {
      return { success: false, error: `Unexpected credits payload: ${JSON.stringify(envelope.data)}` };
    }
    return { success: true, credits };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

/** Model card — no API call. suno_credits / music_list_options style text. */
export function modelGuide(): string {
  return [
    'Suno models (sunoapi.org — third-party REST, not an official Suno Inc. API):',
    '',
    '  V4        Best audio quality, up to 4 minutes. Prompt 3000 / style 200 / title 80 chars.',
    '  V4_5      Smarter prompts, up to 8 minutes. Prompt 5000 / style 1000 / title 100.',
    '  V4_5PLUS  Richer tones, up to 8 minutes. Same limits as V4_5.',
    '  V4_5ALL   Better song structure, up to 8 minutes. Title 80 chars.',
    `  V5        Default. Faster generation, up to 8 minutes. Same limits as V4_5.`,
    '  V5_5      Voice-customized. Only this model accepts duration (10–360s) in customMode.',
    '',
    'WHEN TO USE WHICH TOOL',
    '- Vocal song / jingle / original track as the content itself → suno_generate (customMode true, prompt = lyrics).',
    '- Narration-under BGM bed, looping → suno_generate_sound (loop + optional BPM/key) or Lyria music_generate_clip ($0.04, 30s, no extra key).',
    '- Exact duration 5–300s or seed reproducibility → music_generate / music_generate_advanced (Lyria RealTime). Suno cannot hit an exact second except V5_5 customMode duration.',
    '',
    'Each suno_generate call returns TWO tracks. Files stay on sunoapi.org for 15 days — this tool downloads them immediately.',
    'Credits: generate ≈ 12 credits/call (≈ $0.06 at $0.005/credit). Check suno_credits before a batch.',
  ].join('\n');
}

export const SUNO_DUMMY_CALLBACK_URL = DUMMY_CALLBACK_URL;
