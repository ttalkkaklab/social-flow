/**
 * Google Gemini TTS speech synthesis client — ported from the fect-mcp-server tts module.
 *
 * Converts text to speech via the Google Gen AI SDK.
 * - Default model: gemini-2.5-flash-preview-tts (swappable per request via model)
 * - Supports single-speaker (narration) and two-person dialogue synthesis
 * - Language is auto-detected from the input text, not a request field (103 languages, zh-TW excluded)
 *
 * The response is container-less raw 16-bit PCM (audio/L16), so we wrap it in a
 * WAV header, save it, and return only the path (the original's class wrapper was
 * folded to match this server's module-function convention — behavior identical).
 *
 * The API key is validated at call time, not at startup (config.requireGeminiKey).
 */

import type { GenerateContentConfig, SpeechConfig } from '@google/genai';
import { z } from 'zod';
import { requireGeminiKey } from './config.js';
import { bareFilenameSchema, pcmToWav, saveAudioFile } from './media-utils.js';

/**
 * The 30 supported voices and their character traits.
 *
 * The original scattered the same 30 across three places: a list (types), a trait
 * table (handlers), and a schema enum (tools). This server treats this one record
 * as the source of truth and derives the rest — when a voice is added, only one
 * place changes.
 */
export const TTS_VOICES = {
  Zephyr: 'Bright',
  Puck: 'Upbeat',
  Charon: 'Informative',
  Kore: 'Firm',
  Fenrir: 'Excitable',
  Leda: 'Youthful',
  Orus: 'Firm',
  Aoede: 'Breezy',
  Callirrhoe: 'Easygoing',
  Autonoe: 'Bright',
  Enceladus: 'Breathy',
  Iapetus: 'Clear',
  Umbriel: 'Easygoing',
  Algieba: 'Smooth',
  Despina: 'Smooth',
  Erinome: 'Clear',
  Algenib: 'Gravelly',
  Rasalgethi: 'Informative',
  Laomedeia: 'Upbeat',
  Achernar: 'Soft',
  Alnilam: 'Firm',
  Schedar: 'Even',
  Gacrux: 'Mature',
  Pulcherrima: 'Forward',
  Achird: 'Friendly',
  Zubenelgenubi: 'Casual',
  Vindemiatrix: 'Gentle',
  Sadachbia: 'Lively',
  Sadaltager: 'Knowledgeable',
  Sulafat: 'Warm',
} as const;

export type VoiceName = keyof typeof TTS_VOICES;

/** Voice name array — single source for the zod enum and the JSON Schema enum. */
export const TTS_VOICE_NAMES = Object.keys(TTS_VOICES) as [VoiceName, ...VoiceName[]];

export const DEFAULT_VOICE: VoiceName = 'Kore';

/** Gemini TTS models (as of 2026-07) */
export const VALID_TTS_MODELS = [
  'gemini-2.5-flash-preview-tts', // has a free tier · cheapest (default)
  'gemini-2.5-pro-preview-tts',   // high quality · no free tier
  'gemini-3.1-flash-tts-preview', // the only TTS model with streaming · 2x the price
] as const;
export type TtsModel = (typeof VALID_TTS_MODELS)[number];

export const DEFAULT_TTS_MODEL: TtsModel = 'gemini-2.5-flash-preview-tts';

/**
 * Conservative cap against the 32k-token session context limit (CJK characters ≈ 1~2 tokens).
 * Quality drift on outputs longer than a few minutes is documented, so split synthesis is recommended.
 */
export const MAX_TTS_INPUT_CHARS = 16_000;

/**
 * TTS is LLM-based, so tone and pace wobble between takes. Content stitched cut
 * by cut, like narration, needs a low temperature, so we default to 0.4 instead
 * of the vendor default (1.0).
 */
export const DEFAULT_TTS_TEMPERATURE = 0.4;

/** Failures where text tokens come back instead of audio occur at random — the vendor docs call for retries. */
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 400;

/** Default spec for the raw PCM response — when the mimeType parameter carries a real value, that wins. */
const PCM_FALLBACK_MIME = 'audio/L16;codec=pcm;rate=24000';
const PCM_CHANNELS = 1;

// ── Request schemas ──────────────────────────────────────────────

const voiceSchema = z.enum(TTS_VOICE_NAMES);
const modelSchema = z.enum(VALID_TTS_MODELS).optional().default(DEFAULT_TTS_MODEL);
const temperatureSchema = z.number().min(0).max(2).optional().default(DEFAULT_TTS_TEMPERATURE);

export const ttsGenerateSchema = z.object({
  text: z
    .string()
    .min(1, 'Text is required')
    .max(MAX_TTS_INPUT_CHARS, `Text exceeds ${MAX_TTS_INPUT_CHARS} characters (32k-token session limit); split the script`),
  voiceName: voiceSchema.optional().default(DEFAULT_VOICE),
  model: modelSchema,
  stylePrompt: z.string().optional(),
  temperature: temperatureSchema,
  outputPath: z.string().optional(),
  filename: bareFilenameSchema('audio').optional(),
});

const speakerSchema = z.object({
  speakerName: z.string().min(1, 'Speaker name is required'),
  voiceName: voiceSchema,
});

export const ttsMultiSpeakerSchema = z.object({
  script: z
    .string()
    .min(1, 'Script is required')
    .max(MAX_TTS_INPUT_CHARS, `Script exceeds ${MAX_TTS_INPUT_CHARS} characters (32k-token session limit); split the script`),
  speakers: z.array(speakerSchema).min(1).max(2, 'Maximum 2 speakers allowed'),
  model: modelSchema,
  stylePrompt: z.string().optional(),
  temperature: temperatureSchema,
  outputPath: z.string().optional(),
  filename: bareFilenameSchema('audio').optional(),
});

export type TtsGenerateRequest = z.infer<typeof ttsGenerateSchema>;
export type TtsMultiSpeakerRequest = z.infer<typeof ttsMultiSpeakerSchema>;
export type SpeakerConfig = z.infer<typeof speakerSchema>;

/**
 * Speech synthesis response.
 *
 * error holds only the cause message — prefixes like "TTS generation failed:" are
 * added by the handler (same convention as video-client), so adding one here
 * would print it twice.
 */
export interface TtsResponse {
  success: boolean;
  audioPath?: string;
  error?: string;
  text?: string;
  voiceName?: string;
  model?: string;
}

// ── Internal helpers ─────────────────────────────────────────────

/** Detect whether a MIME type is container-less raw PCM (Gemini TTS uses audio/L16;codec=pcm;rate=24000). */
export function isRawPcmMimeType(mimeType: string): boolean {
  const normalized = mimeType.toLowerCase();
  return normalized.startsWith('audio/l16') || normalized.includes('codec=pcm');
}

/** Extract the sample rate from the MIME type parameters (default 24000). */
export function parseSampleRate(mimeType: string): number {
  const match = mimeType.match(/rate=(\d+)/);
  return match ? parseInt(match[1], 10) : 24_000;
}

/**
 * Assemble the style directive and transcript into a synthesis prompt.
 *
 * Unlabeled `style: "body"` concatenation has documented failure modes — classifier
 * false rejections (PROHIBITED_CONTENT) or the directive being read aloud verbatim —
 * so we make the preamble and the transcript-start label explicit.
 */
export function buildStyledPrompt(stylePrompt: string | undefined, transcript: string): string {
  if (!stylePrompt) return transcript;
  return [
    'Synthesize the following transcript as speech.',
    `Director's Notes — Style: ${stylePrompt}`,
    '--- TRANSCRIPT BEGINS ---',
    transcript,
  ].join('\n');
}

interface AudioPayload {
  data: string; // base64
  mimeType: string;
}

/** MIME type → file extension (for container-format responses). */
function extensionFromMimeType(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    'audio/wav': 'wav',
    'audio/wave': 'wav',
    'audio/x-wav': 'wav',
    'audio/mp3': 'mp3',
    'audio/mpeg': 'mp3',
    'audio/ogg': 'ogg',
    'audio/webm': 'webm',
    'audio/aac': 'aac',
    'audio/flac': 'flac',
  };
  return mimeToExt[mimeType.split(';')[0]] || 'wav';
}

/**
 * generateContent call + audio extraction (with automatic retries).
 *
 * When all 3 attempts fail, the last error gets a model-swap hint — the failure
 * mode where a script keeps hitting `No content parts in response` on flash but
 * passes on pro in one shot has been measured in practice.
 */
async function synthesizeWithRetry(
  model: string,
  contentText: string,
  speechConfig: SpeechConfig,
  temperature: number | undefined,
): Promise<AudioPayload> {
  const { GoogleGenAI } = await import('@google/genai');
  const genai = new GoogleGenAI({ apiKey: requireGeminiKey() });

  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const config: GenerateContentConfig = {
        responseModalities: ['AUDIO'],
        speechConfig,
        // undefined means the vendor default (1.0). The normal path is the schema default (0.4) being injected.
        ...(temperature !== undefined ? { temperature } : {}),
      };

      const response = await genai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: contentText }] }],
        config,
      });

      const parts = response.candidates?.[0]?.content?.parts;
      if (!parts || parts.length === 0) throw new Error('No content parts in response');

      for (const part of parts) {
        if (part.inlineData?.data) {
          return { data: part.inlineData.data, mimeType: part.inlineData.mimeType || PCM_FALLBACK_MIME };
        }
      }
      // text tokens came back instead of audio — retry this
      throw new Error('No audio data found in response parts');
    } catch (error) {
      lastError = error;
      if (attempt < MAX_ATTEMPTS - 1) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_BASE_DELAY_MS * (attempt + 1)));
      }
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError);
  const hint =
    model === DEFAULT_TTS_MODEL
      ? ' (retried 3x — this script may not pass on flash; retry with model="gemini-2.5-pro-preview-tts")'
      : ' (retried 3x)';
  throw new Error(message + hint);
}

/**
 * Save the audio payload to a file.
 * - Raw PCM (audio/L16 etc.) is saved with a WAV header (mono 16-bit)
 * - Container formats (mp3 etc.) are saved as-is
 */
function saveAudio(
  audio: AudioPayload,
  outputPath: string | undefined,
  filename: string | undefined,
  defaultPrefix: string,
): string {
  const rawBuffer = Buffer.from(audio.data, 'base64');
  const isPcm = isRawPcmMimeType(audio.mimeType);
  const fileBuffer = isPcm ? pcmToWav(rawBuffer, parseSampleRate(audio.mimeType), PCM_CHANNELS) : rawBuffer;
  const ext = isPcm ? 'wav' : extensionFromMimeType(audio.mimeType);

  return saveAudioFile(
    outputPath || process.cwd(),
    filename || `${defaultPrefix}_${Date.now()}.${ext}`,
    fileBuffer,
  );
}

// ── The 2 synthesis functions ────────────────────────────────────

/** Single-speaker synthesis — narration, voiceover */
export async function generateSpeech(request: TtsGenerateRequest): Promise<TtsResponse> {
  const model = request.model || DEFAULT_TTS_MODEL;
  const voiceName = request.voiceName || DEFAULT_VOICE;

  try {
    console.error(`[TTS] Synthesizing... (model: ${model}, voice: ${voiceName}, ${request.text.length} chars)`);

    const speechConfig: SpeechConfig = {
      voiceConfig: { prebuiltVoiceConfig: { voiceName } },
    };
    const audio = await synthesizeWithRetry(
      model,
      buildStyledPrompt(request.stylePrompt, request.text),
      speechConfig,
      request.temperature,
    );
    const audioPath = saveAudio(audio, request.outputPath, request.filename, 'tts');

    console.error(`[TTS] Audio saved to: ${audioPath}`);
    return { success: true, audioPath, text: request.text, voiceName, model };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[TTS] Error: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
}

/** Two-person dialogue synthesis — interview, podcast format */
export async function generateDialogue(request: TtsMultiSpeakerRequest): Promise<TtsResponse> {
  const model = request.model || DEFAULT_TTS_MODEL;

  try {
    const speakerNames = request.speakers.map((s) => s.speakerName).join(', ');
    console.error(`[TTS] Synthesizing dialogue... (model: ${model}, speakers: ${speakerNames})`);

    const speechConfig: SpeechConfig = {
      multiSpeakerVoiceConfig: {
        speakerVoiceConfigs: request.speakers.map((speaker) => ({
          speaker: speaker.speakerName,
          voiceConfig: { prebuiltVoiceConfig: { voiceName: speaker.voiceName } },
        })),
      },
    };
    const audio = await synthesizeWithRetry(
      model,
      buildStyledPrompt(request.stylePrompt, request.script),
      speechConfig,
      request.temperature,
    );
    const audioPath = saveAudio(audio, request.outputPath, request.filename, 'tts_multi');

    console.error(`[TTS] Dialogue audio saved to: ${audioPath}`);
    return { success: true, audioPath, text: `Multi-speaker conversation with: ${speakerNames}`, model };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[TTS] Error: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
}
