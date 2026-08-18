/**
 * Google Lyria music generation client — ported from the fect-mcp-server music module.
 *
 * Wraps both branches of the Lyria API, which differ in character:
 * - Lyria 3 Clip (batch): single interactions call · fixed 30s · MP3 44.1kHz stereo.
 *   The default path for short-form BGM — cheap and one call.
 * - Lyria RealTime (WebSocket): streaming PCM 48kHz stereo · variable 5~300s length.
 *   Used when the length must match the narration exactly or when seed reproducibility is needed.
 *
 * Both APIs lean instrumental and the results are nondeterministic — a signature
 * BGM must be saved as an asset and reused (RealTime is reproducible only via seed).
 *
 * The API key is validated at call time, not at startup (config.requireGeminiKey).
 */

import type {
  LiveMusicGenerationConfig,
  LiveMusicServerMessage,
  LiveMusicSession,
  MusicGenerationMode,
  Scale,
} from '@google/genai';
import { z } from 'zod';
import { requireGeminiKey } from './config.js';
import { bareFilenameSchema, pcmToWav, saveAudioFile } from './media-utils.js';

/** Lyria model IDs */
export const LYRIA_CLIP_MODEL = 'lyria-3-clip-preview';          // batch · fixed 30s · MP3
export const LYRIA_REALTIME_MODEL = 'models/lyria-realtime-exp'; // WebSocket · streaming PCM

/** Clip is always fixed at 30s (API constraint) */
const CLIP_DURATION_SECONDS = 30;

/** Lyria RealTime output spec — also used to derive duration from received bytes. */
const REALTIME_SAMPLE_RATE = 48_000;
const REALTIME_CHANNELS = 2;
const REALTIME_BYTES_PER_SAMPLE = 2; // 16-bit
const REALTIME_BYTES_PER_SECOND = REALTIME_SAMPLE_RATE * REALTIME_CHANNELS * REALTIME_BYTES_PER_SAMPLE;

/** Slack for when the target length isn't reached — wait only up to requested length + this. */
const REALTIME_TIMEOUT_MARGIN_MS = 30_000;
const REALTIME_POLL_INTERVAL_MS = 100;

/** Suggested genre list (not an API-enforced enum — Lyria accepts free text) */
export const MUSIC_GENRES = [
  'Acid Jazz', 'Afrobeat', 'Ambient', 'Blues', 'Bossa Nova', 'Breakbeat', 'Classical',
  'Country', 'Disco', 'Drum and Bass', 'Dub', 'Dubstep', 'EDM', 'Electronic', 'Funk',
  'Gospel', 'Hip Hop', 'House', 'Jazz', 'Latin', 'Lo-Fi', 'Metal', 'Minimal Techno',
  'Pop', 'R&B', 'Reggae', 'Rock', 'Soul', 'Synthwave', 'Techno', 'Trance', 'World Music',
] as const;

/** Suggested mood list (free text allowed) */
export const MUSIC_MOODS = [
  'Ambient', 'Atmospheric', 'Calm', 'Cheerful', 'Cinematic', 'Dark', 'Dreamy', 'Emotional',
  'Energetic', 'Epic', 'Experimental', 'Happy', 'Hopeful', 'Intense', 'Melancholic',
  'Mysterious', 'Nostalgic', 'Peaceful', 'Playful', 'Powerful', 'Relaxing', 'Romantic',
  'Sad', 'Suspenseful', 'Uplifting',
] as const;

/** Suggested instrument list (free text allowed) */
export const MUSIC_INSTRUMENTS = [
  '303 Acid Bass', 'Acoustic Guitar', 'Bass Guitar', 'Cello', 'Drums', 'Electric Guitar',
  'Flute', 'Harp', 'Keyboard', 'Orchestra', 'Organ', 'Percussion', 'Piano', 'Saxophone',
  'Strings', 'Synth', 'Synth Bass', 'Synth Lead', 'Synth Pad', 'Trumpet', 'Violin',
  'Vocal Chops',
] as const;

/** Key/scale enum — the model doesn't distinguish relative keys, so each value maps to both the major and its relative minor. */
export const MUSIC_SCALES = [
  'C_MAJOR_A_MINOR', 'D_FLAT_MAJOR_B_FLAT_MINOR', 'D_MAJOR_B_MINOR', 'E_FLAT_MAJOR_C_MINOR',
  'E_MAJOR_D_FLAT_MINOR', 'F_MAJOR_D_MINOR', 'G_FLAT_MAJOR_E_FLAT_MINOR', 'G_MAJOR_E_MINOR',
  'A_FLAT_MAJOR_F_MINOR', 'A_MAJOR_G_FLAT_MINOR', 'B_FLAT_MAJOR_G_MINOR', 'B_MAJOR_A_FLAT_MINOR',
  'SCALE_UNSPECIFIED',
] as const;

/** Generation mode enum */
export const MUSIC_GENERATION_MODES = ['QUALITY', 'DIVERSITY', 'VOCALIZATION'] as const;

// ── Request schemas ──────────────────────────────────────────────

const durationSchema = z.number().min(5).max(300).default(30);

/** weight is any non-zero value (the API spec has no ±1 bounds) */
const weightedPromptSchema = z.object({
  text: z.string().min(1, 'Prompt text is required'),
  weight: z.number().refine((v) => v !== 0, 'Weight must be a non-zero value').default(1.0),
});

/** Lyria RealTime MusicGenerationConfig */
const musicConfigSchema = z.object({
  guidance: z.number().min(0).max(6).optional(),
  bpm: z.number().min(60).max(200).optional(),
  scale: z.enum(MUSIC_SCALES).optional(),
  density: z.number().min(0).max(1).optional(),
  brightness: z.number().min(0).max(1).optional(),
  temperature: z.number().min(0).max(3).optional(), // model default 1.1 when unspecified
  topK: z.number().int().min(1).max(1000).optional(),
  seed: z.number().int().min(0).max(2_147_483_647).optional(), // the only reproducibility control
  muteBass: z.boolean().optional(),
  muteDrums: z.boolean().optional(),
  onlyBassAndDrums: z.boolean().optional(),
  musicGenerationMode: z.enum(MUSIC_GENERATION_MODES).optional(),
});

/** Generate from a single prompt (RealTime) */
export const musicGenerateSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required'),
  genre: z.string().optional(),
  mood: z.string().optional(),
  instruments: z.array(z.string()).optional(),
  durationSeconds: durationSchema,
  bpm: z.number().min(60).max(200).optional(),
  outputPath: z.string().optional(),
  filename: bareFilenameSchema('audio').optional(),
});

/** Weighted prompt blend + fine-grained control (RealTime) */
export const musicAdvancedSchema = z.object({
  prompts: z.array(weightedPromptSchema).min(1, 'At least one prompt is required'),
  durationSeconds: durationSchema,
  config: musicConfigSchema.optional(),
  outputPath: z.string().optional(),
  filename: bareFilenameSchema('audio').optional(),
});

/**
 * Lyria 3 Clip (batch · fixed 30s).
 * There are no structured parameters for BPM, key, instruments, etc., so describe
 * them in natural language in the prompt body.
 */
export const musicClipSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required'),
  outputPath: z.string().optional(),
  filename: bareFilenameSchema('audio').optional(),
});

export type MusicGenerateRequest = z.infer<typeof musicGenerateSchema>;
export type MusicAdvancedRequest = z.infer<typeof musicAdvancedSchema>;
export type MusicClipRequest = z.infer<typeof musicClipSchema>;
export type MusicConfig = z.infer<typeof musicConfigSchema>;
export type WeightedPrompt = z.infer<typeof weightedPromptSchema>;

/**
 * Music generation response.
 *
 * error holds only the cause message — prefixes like "Music generation failed:"
 * are added by the handler (same convention as video-client), so adding one here
 * would print it twice.
 */
export interface MusicResponse {
  success: boolean;
  audioPath?: string;
  error?: string;
  prompt?: string;
  durationSeconds?: number;
  model?: string;
}

// ── Lyria 3 Clip (batch) ─────────────────────────────────────────

/**
 * Generate a fixed 30s clip — a single call.
 *
 * The result is nondeterministic and there is no seed, so a signature BGM must be
 * saved as an asset and reused.
 */
export async function generateClip(request: MusicClipRequest): Promise<MusicResponse> {
  try {
    const { GoogleGenAI } = await import('@google/genai');
    const genai = new GoogleGenAI({ apiKey: requireGeminiKey() });

    console.error(`[Lyria] Generating 30s clip... (model: ${LYRIA_CLIP_MODEL})`);
    console.error(`[Lyria] Prompt: ${request.prompt.substring(0, 100)}...`);

    const interaction = await genai.interactions.create({
      model: LYRIA_CLIP_MODEL,
      input: request.prompt,
    });

    // The 2026-05 schema overhaul of the Interactions API replaced the flat
    // outputs[] with steps[].content[] (SDK below 2.0 is rejected by the server
    // outright). The audio lives inside the model_output step.
    for (const step of interaction.steps ?? []) {
      if (step.type !== 'model_output') continue;

      for (const content of step.content ?? []) {
        if (content.type !== 'audio' || !content.data) continue;

        const mimeType = content.mime_type || 'audio/mp3';
        const ext = mimeType.includes('wav') ? 'wav' : 'mp3';
        const audioPath = saveAudioFile(
          request.outputPath || process.cwd(),
          request.filename || `music_clip_${Date.now()}.${ext}`,
          Buffer.from(content.data, 'base64'),
        );

        console.error(`[Lyria] Clip saved to: ${audioPath}`);
        return {
          success: true,
          audioPath,
          prompt: request.prompt,
          durationSeconds: CLIP_DURATION_SECONDS,
          model: LYRIA_CLIP_MODEL,
        };
      }
    }

    return { success: false, error: `No audio in interaction response (status: ${interaction.status})` };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Lyria] Error: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
}

// ── Lyria RealTime (streaming) ───────────────────────────────────

/**
 * Generate a given length from a simple prompt.
 *
 * Folds genre/mood/instruments into the prompt string and delegates to
 * generateAdvanced — the RealTime API has no such structured fields.
 */
export async function generateSimple(request: MusicGenerateRequest): Promise<MusicResponse> {
  const promptParts = [request.prompt];
  if (request.genre) promptParts.push(request.genre);
  if (request.mood) promptParts.push(request.mood);
  if (request.instruments && request.instruments.length > 0) {
    promptParts.push(`with ${request.instruments.join(', ')}`);
  }

  return generateAdvanced({
    prompts: [{ text: promptParts.join(', '), weight: 1.0 }],
    durationSeconds: request.durationSeconds ?? 30,
    config: request.bpm ? { bpm: request.bpm } : undefined,
    outputPath: request.outputPath,
    filename: request.filename,
  });
}

/** Move the zod-validated config into the SDK type (explicit keys only — respect model defaults). */
function toLiveMusicConfig(config: MusicConfig): LiveMusicGenerationConfig {
  const result: LiveMusicGenerationConfig = {};
  if (config.guidance !== undefined) result.guidance = config.guidance;
  if (config.bpm !== undefined) result.bpm = config.bpm;
  if (config.scale !== undefined) result.scale = config.scale as Scale;
  if (config.density !== undefined) result.density = config.density;
  if (config.brightness !== undefined) result.brightness = config.brightness;
  if (config.temperature !== undefined) result.temperature = config.temperature;
  if (config.topK !== undefined) result.topK = config.topK;
  if (config.seed !== undefined) result.seed = config.seed;
  if (config.muteBass !== undefined) result.muteBass = config.muteBass;
  if (config.muteDrums !== undefined) result.muteDrums = config.muteDrums;
  if (config.onlyBassAndDrums !== undefined) result.onlyBassAndDrums = config.onlyBassAndDrums;
  if (config.musicGenerationMode !== undefined) {
    result.musicGenerationMode = config.musicGenerationMode as MusicGenerationMode;
  }
  return result;
}

/**
 * Weighted prompt blend + fine-grained control generation (WebSocket streaming).
 *
 * Once the target length's worth of PCM bytes has arrived, the session is closed
 * and the audio is wrapped as WAV and saved. The stream never signals an end, so
 * "how much we've received" is the termination condition.
 */
export async function generateAdvanced(request: MusicAdvancedRequest): Promise<MusicResponse> {
  const targetDuration = request.durationSeconds ?? 30;
  const targetBytes = targetDuration * REALTIME_BYTES_PER_SECOND;

  const audioChunks: Buffer[] = [];
  const state: { received: number; done: boolean; error: Error | null } = {
    received: 0,
    done: false,
    error: null,
  };
  let session: LiveMusicSession | undefined;

  const weightedPrompts = request.prompts.map((p) => ({ text: p.text, weight: p.weight ?? 1.0 }));

  try {
    const { GoogleGenAI } = await import('@google/genai');
    // RealTime (live.music) is exposed only under v1alpha.
    const genai = new GoogleGenAI({ apiKey: requireGeminiKey(), apiVersion: 'v1alpha' });

    console.error(`[Lyria] Streaming ${targetDuration}s... (model: ${LYRIA_REALTIME_MODEL})`);
    console.error(`[Lyria] Prompts: ${weightedPrompts.map((p) => `"${p.text}"(${p.weight})`).join(', ')}`);

    session = await genai.live.music.connect({
      model: LYRIA_REALTIME_MODEL,
      callbacks: {
        onmessage: (message: LiveMusicServerMessage) => {
          if (state.done) return;
          for (const chunk of message.serverContent?.audioChunks ?? []) {
            if (!chunk.data) continue;
            const buffer = Buffer.from(chunk.data, 'base64');
            audioChunks.push(buffer);
            state.received += buffer.length;
          }
        },
        onerror: (error: unknown) => {
          console.error('[Lyria] Session error:', error);
          state.error = error instanceof Error ? error : new Error(String(error));
        },
        onclose: () => {
          // shutdown is handled by the receive-wait loop below.
        },
      },
    });

    await session.setWeightedPrompts({ weightedPrompts });

    if (request.config) {
      const musicGenerationConfig = toLiveMusicConfig(request.config);
      if (Object.keys(musicGenerationConfig).length > 0) {
        await session.setMusicGenerationConfig({ musicGenerationConfig });
      }
    }

    await session.play();

    // wait until the target bytes arrive (timeout: requested length + 30s)
    const startTime = Date.now();
    const timeoutMs = targetDuration * 1000 + REALTIME_TIMEOUT_MARGIN_MS;
    while (state.received < targetBytes && Date.now() - startTime < timeoutMs) {
      if (state.error) throw state.error;
      await new Promise((resolve) => setTimeout(resolve, REALTIME_POLL_INTERVAL_MS));
    }
    state.done = true;

    closeQuietly(session);
    session = undefined;

    if (audioChunks.length === 0) {
      return { success: false, error: 'No audio data received from Lyria RealTime' };
    }

    // The last chunk arrives past the target, so trim exactly to the requested
    // length — this tool exists because "you can specify the length", and a 31s
    // result breaks that contract. Trim on a sample boundary (channels × 2 bytes)
    // or the stereo phase drifts apart.
    const rawPcm = Buffer.concat(audioChunks);
    const frameBytes = REALTIME_CHANNELS * REALTIME_BYTES_PER_SAMPLE;
    const trimTo = Math.floor(Math.min(rawPcm.length, targetBytes) / frameBytes) * frameBytes;
    const pcmData = rawPcm.subarray(0, trimTo);

    const audioPath = saveAudioFile(
      request.outputPath || process.cwd(),
      request.filename || `music_${Date.now()}.wav`,
      pcmToWav(pcmData, REALTIME_SAMPLE_RATE, REALTIME_CHANNELS),
    );

    const durationSeconds = Math.round(pcmData.length / REALTIME_BYTES_PER_SECOND);
    console.error(`[Lyria] Music saved to: ${audioPath} (${durationSeconds}s)`);

    return {
      success: true,
      audioPath,
      prompt: weightedPrompts.map((p) => p.text).join(', '),
      durationSeconds,
      model: LYRIA_REALTIME_MODEL,
    };
  } catch (error) {
    state.done = true;
    if (session) closeQuietly(session);
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Lyria] Error: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
}

/** A failed session close doesn't overturn an already-decided result — swallow it and just log. */
function closeQuietly(session: LiveMusicSession): void {
  try {
    session.close();
  } catch (error) {
    console.error(`[Lyria] Session close failed (ignored): ${error instanceof Error ? error.message : String(error)}`);
  }
}
