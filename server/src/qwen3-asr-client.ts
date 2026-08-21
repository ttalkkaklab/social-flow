/**
 * Qwen3-ASR on-device STT client — spawns the mlx-qwen3-asr CLI as a subprocess.
 *
 * The local transcription path where Korean is a first-class training language.
 * It sits alongside whisper.cpp (the ingest fallback) and is the one to use when
 * Korean quality matters. No network, no API key, no per-minute billing.
 *
 * Evidence (2026-08-17 research): the Qwen3-ASR paper reports Korean CER of
 * 5.88% on Common Voice / 2.57% on FLEURS for the 1.7B. On the same Mac
 * (M4 Max 128GB) the 1.7B fp16 is ~3.4GB, small enough to keep resident.
 * The NVIDIA Parakeet family has no Korean.
 *
 * ## Why a CLI subprocess
 *
 * mlx-qwen3-asr is an Apple MLX-based Python package with no Node bindings.
 * Same call as zimage-client — a uv tool install is a self-contained executable
 * with its own isolated venv, so there is no interpreter to pick, and the CLI
 * returns JSON (text/language/segments) as a file, so no inline snippet is needed.
 */

import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, extname, join } from 'node:path';
import { z } from 'zod';
import { qwen3AsrBin } from './config.js';
import { bareFilenameSchema, resolveOutputFile } from './media-utils.js';

export const QWEN3_ASR_MODELS = ['Qwen/Qwen3-ASR-1.7B', 'Qwen/Qwen3-ASR-0.6B'] as const;
export type Qwen3AsrModel = (typeof QWEN3_ASR_MODELS)[number];

/** Korean quality is why this tool exists, so 1.7B is the default. 0.6B only when speed matters. */
export const DEFAULT_QWEN3_ASR_MODEL: Qwen3AsrModel = 'Qwen/Qwen3-ASR-1.7B';

/**
 * The 14 canonical names published by mlx-qwen3-asr --list-languages.
 * Aliases (ko, ko-kr, korean) are folded to canonical names before reaching the CLI.
 */
export const QWEN3_ASR_LANGUAGES = [
  'Korean',
  'English',
  'Chinese',
  'Japanese',
  'Arabic',
  'German',
  'French',
  'Spanish',
  'Portuguese',
  'Russian',
  'Hindi',
  'Italian',
  'Turkish',
  'Dutch',
] as const;
export type Qwen3AsrLanguage = (typeof QWEN3_ASR_LANGUAGES)[number];

export const DEFAULT_QWEN3_ASR_LANGUAGE: Qwen3AsrLanguage = 'Korean';

const LANGUAGE_ALIASES: Record<string, Qwen3AsrLanguage> = {
  ko: 'Korean',
  'ko-kr': 'Korean',
  korean: 'Korean',
  en: 'English',
  'en-us': 'English',
  'en-gb': 'English',
  english: 'English',
  zh: 'Chinese',
  'zh-cn': 'Chinese',
  'zh-tw': 'Chinese',
  cmn: 'Chinese',
  mandarin: 'Chinese',
  chinese: 'Chinese',
  ja: 'Japanese',
  'ja-jp': 'Japanese',
  japanese: 'Japanese',
  ar: 'Arabic',
  'ar-eg': 'Arabic',
  arabic: 'Arabic',
  de: 'German',
  'de-de': 'German',
  german: 'German',
  fr: 'French',
  'fr-fr': 'French',
  french: 'French',
  es: 'Spanish',
  'es-es': 'Spanish',
  'es-419': 'Spanish',
  spanish: 'Spanish',
  pt: 'Portuguese',
  'pt-br': 'Portuguese',
  'pt-pt': 'Portuguese',
  portuguese: 'Portuguese',
  ru: 'Russian',
  'ru-ru': 'Russian',
  russian: 'Russian',
  hi: 'Hindi',
  'hi-in': 'Hindi',
  hindi: 'Hindi',
  it: 'Italian',
  'it-it': 'Italian',
  italian: 'Italian',
  tr: 'Turkish',
  'tr-tr': 'Turkish',
  turkish: 'Turkish',
  nl: 'Dutch',
  'nl-nl': 'Dutch',
  dutch: 'Dutch',
};

export function canonicalizeLanguage(value: string): Qwen3AsrLanguage {
  if ((QWEN3_ASR_LANGUAGES as readonly string[]).includes(value)) {
    return value as Qwen3AsrLanguage;
  }
  const mapped = LANGUAGE_ALIASES[value.trim().toLowerCase()];
  if (!mapped) {
    throw new Error(
      `Unsupported language "${value}". Use one of: ${QWEN3_ASR_LANGUAGES.join(', ')} (aliases like ko/en/ja also work).`,
    );
  }
  return mapped;
}

const AUDIO_INPUT_EXTENSIONS = [
  '.wav',
  '.mp3',
  '.m4a',
  '.flac',
  '.ogg',
  '.aac',
  '.mp4',
  '.mov',
  '.webm',
  '.mkv',
] as const;

/**
 * Subprocess timeout.
 *
 * mlx-qwen3-asr bench (M4 Pro): the 1.7B takes ~4s on a 10s clip. With headroom
 * for long recordings, timestamp alignment, and machine load: 2s per audio
 * second + 90s startup, capped at 30 minutes.
 */
export function qwen3AsrTimeoutMs(audioSeconds: number): number {
  return Math.min(30 * 60_000, 90_000 + Math.ceil(Math.max(audioSeconds, 1) * 2_000));
}

const WEIGHT_DOWNLOAD_ALLOWANCE_MS = 60 * 60_000;

function weightCacheDir(model: Qwen3AsrModel): string {
  const hfHome = process.env.HF_HOME || join(homedir(), '.cache', 'huggingface');
  const slug = model.replaceAll('/', '--');
  return join(hfHome, 'hub', `models--${slug}`);
}

function alignerCacheDir(): string {
  const hfHome = process.env.HF_HOME || join(homedir(), '.cache', 'huggingface');
  return join(hfHome, 'hub', 'models--Qwen--Qwen3-ForcedAligner-0.6B');
}

function installHint(detail: string): string {
  return (
    `${detail}\n\n` +
    `Local STT requires mlx-qwen3-asr (Apple Silicon only, MLX):\n` +
    `  uv tool install --python 3.12 "mlx-qwen3-asr[aligner]"\n` +
    `If installed elsewhere, point QWEN3_ASR_BIN at the executable ` +
    `(e.g. QWEN3_ASR_BIN=~/.local/bin/mlx-qwen3-asr).\n` +
    `The first call downloads ~3.4GB of Qwen3-ASR-1.7B weights (plus the ForcedAligner) ` +
    `to ~/.cache/huggingface. Until it is installed, ingest uses the whisper.cpp fallback.`
  );
}

// ── Request schema ──────────────────────────────────────────────

export const qwen3AsrTranscribeSchema = z.object({
  audioPath: z
    .string()
    .min(1, 'audioPath is required')
    .refine((p) => !p.includes('..'), { message: 'audioPath must not contain ".."' })
    .refine((p) => (AUDIO_INPUT_EXTENSIONS as readonly string[]).includes(extname(p).toLowerCase()), {
      message: `audioPath extension must be one of: ${AUDIO_INPUT_EXTENSIONS.join(', ')}`,
    }),
  language: z
    .string()
    .optional()
    .default(DEFAULT_QWEN3_ASR_LANGUAGE)
    .transform((value) => canonicalizeLanguage(value)),
  model: z.enum(QWEN3_ASR_MODELS).optional().default(DEFAULT_QWEN3_ASR_MODEL),
  context: z.string().max(4_000).optional(),
  timestamps: z.boolean().optional().default(true),
  outputPath: z.string().optional(),
  filename: bareFilenameSchema('json').optional(),
});

export type Qwen3AsrTranscribeRequest = z.infer<typeof qwen3AsrTranscribeSchema>;

export interface Qwen3AsrSegment {
  text: string;
  start: number;
  end: number;
}

export interface Qwen3AsrResponse {
  success: boolean;
  transcriptPath?: string;
  text?: string;
  language?: string;
  model?: string;
  segments?: Qwen3AsrSegment[];
  elapsedSeconds?: number;
  error?: string;
}

interface QwenCliJson {
  text?: string;
  language?: string;
  segments?: Array<{ text?: string; start?: number; end?: number }>;
}

function probeDurationSeconds(audioPath: string): Promise<number> {
  return new Promise((resolve) => {
    execFile(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', audioPath],
      { timeout: 15_000 },
      (error, out) => {
        const seconds = Number.parseFloat((out || '').trim());
        if (error || !Number.isFinite(seconds) || seconds <= 0) {
          resolve(60);
          return;
        }
        resolve(seconds);
      },
    );
  });
}

function parseCliJson(raw: string): QwenCliJson {
  return JSON.parse(raw) as QwenCliJson;
}

function normalizeSegments(data: QwenCliJson): Qwen3AsrSegment[] {
  return (data.segments ?? [])
    .map((seg) => ({
      text: (seg.text ?? '').trim(),
      start: Number(seg.start ?? 0),
      end: Number(seg.end ?? 0),
    }))
    .filter((seg) => seg.text.length > 0);
}

/** Folds the result into the whisper.cpp JSON shape that ingest's build-timeline.py reads. */
export function toWhisperTranscript(data: { text?: string; segments?: Qwen3AsrSegment[] }): {
  transcription: Array<{ text: string; offsets: { from: number; to: number } }>;
} {
  const segs = data.segments ?? [];
  if (segs.length === 0 && data.text?.trim()) {
    return {
      transcription: [{ text: data.text.trim(), offsets: { from: 0, to: 0 } }],
    };
  }
  return {
    transcription: segs.map((seg) => ({
      text: seg.text,
      offsets: {
        from: Math.round(seg.start * 1000),
        to: Math.round(seg.end * 1000),
      },
    })),
  };
}

// ── Transcription ───────────────────────────────────────────────

export async function transcribeLocal(request: Qwen3AsrTranscribeRequest): Promise<Qwen3AsrResponse> {
  const bin = qwen3AsrBin();
  if (!existsSync(bin)) {
    return { success: false, error: installHint(`mlx-qwen3-asr binary not found: "${bin}"`) };
  }
  if (!existsSync(request.audioPath)) {
    return { success: false, error: `Audio file not found: ${request.audioPath}` };
  }

  const outFile = resolveOutputFile(
    request.outputPath || process.cwd(),
    request.filename || `stt_${Date.now()}.json`,
    'json',
  );

  // The CLI names its output <audio basename>.json inside -o. Point -o at a scratch
  // subdirectory so a user file with that name in the output directory is never clobbered;
  // the JSON is renamed to outFile (same volume) afterwards.
  const outDir = request.outputPath || process.cwd();
  mkdirSync(outDir, { recursive: true });
  const scratchDir = mkdtempSync(join(outDir, '.qwen3-asr-'));

  const firstCall = !existsSync(weightCacheDir(request.model)) || (request.timestamps && !existsSync(alignerCacheDir()));
  if (firstCall) {
    console.error(
      '[Qwen3-ASR] First call — downloading ~3.4GB of weights (plus ForcedAligner if timestamps) to the huggingface cache. This can take a while.',
    );
  }

  const duration = await probeDurationSeconds(request.audioPath);
  const cliArgs = [
    request.audioPath,
    '--model',
    request.model,
    '--language',
    request.language,
    '-f',
    'json',
    '-o',
    scratchDir,
    '--quiet',
  ];
  if (request.timestamps) cliArgs.push('--timestamps');
  if (request.context?.trim()) cliArgs.push('--context', request.context.trim());

  console.error(
    `[Qwen3-ASR] Transcribing locally... (${request.model}, ${request.language}, ${duration.toFixed(1)}s audio)`,
  );

  const startedAt = Date.now();
  try {
    await new Promise<void>((resolve, reject) => {
      execFile(
        bin,
        cliArgs,
        {
          timeout: qwen3AsrTimeoutMs(duration) + (firstCall ? WEIGHT_DOWNLOAD_ALLOWANCE_MS : 0),
          maxBuffer: 16 * 1024 * 1024,
        },
        (error, _out, errOut) => {
          if (error) {
            const code = (error as NodeJS.ErrnoException).code;
            if (code === 'ENOENT') {
              reject(new Error(installHint(`mlx-qwen3-asr binary not found: "${bin}"`)));
              return;
            }
            const tail = (errOut || '')
              .split('\n')
              .filter((line) => line.trim() && !line.includes('%|') && !line.includes('it/s]'))
              .slice(-8)
              .join('\n');
            // Not a missing binary — a timeout or runtime failure. An install hint here
            // would misdirect users whose install is fine, so pass the cause through.
            reject(new Error(`${error.message}${tail ? `\n${tail}` : ''}`));
            return;
          }
          resolve();
        },
      );
    });
  } catch (error) {
    rmSync(scratchDir, { recursive: true, force: true });
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Qwen3-ASR] Error: ${message.split('\n')[0]}`);
    return { success: false, error: message };
  }

  const cliJsonPath = join(scratchDir, `${basename(request.audioPath, extname(request.audioPath))}.json`);
  if (!existsSync(cliJsonPath)) {
    rmSync(scratchDir, { recursive: true, force: true });
    return { success: false, error: `mlx-qwen3-asr exited without producing JSON (looked for ${cliJsonPath})` };
  }

  let parsed: QwenCliJson;
  try {
    parsed = parseCliJson(readFileSync(cliJsonPath, 'utf8'));
  } catch (error) {
    rmSync(scratchDir, { recursive: true, force: true });
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: `Failed to parse CLI JSON: ${message}` };
  }

  renameSync(cliJsonPath, outFile);
  rmSync(scratchDir, { recursive: true, force: true });

  const segments = normalizeSegments(parsed);
  const text = (parsed.text ?? segments.map((s) => s.text).join('')).trim();
  const elapsed = Math.round((Date.now() - startedAt) / 100) / 10;
  console.error(`[Qwen3-ASR] Transcript saved to: ${outFile} (${segments.length} segments in ${elapsed}s)`);

  return {
    success: true,
    transcriptPath: outFile,
    text,
    language: parsed.language || request.language,
    model: request.model,
    segments,
    elapsedSeconds: elapsed,
  };
}
