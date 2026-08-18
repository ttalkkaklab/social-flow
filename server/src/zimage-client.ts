/**
 * Z-Image Turbo local image generation client — invokes the mflux CLI as a subprocess.
 *
 * The **second image path, and the default one**, sitting alongside gpt_image
 * (image-client.ts). Network, API key, and per-image billing all drop out; in
 * exchange, mflux and the model weights must be present locally.
 *
 * Division of labor between the two paths (per the 2026-08-12 field study —
 * docs/research/2026-08-12-local-image-generation):
 *   - Text-free images (cover backgrounds, b-roll, draft exploration) → this one. Zero cost per image
 *   - Images that carry text, or need a quality boost                 → gpt_image_text2img.
 *     Measured Korean rendering: "딸깍연구소" came out as "달닥연구소" (broken jamo, lookalike glyphs).
 *
 * ## Why a subprocess
 *
 * mflux is an Apple MLX-based Python package with no Node bindings. Same judgment
 * as Supertonic (supertonic-client.ts) — a resident model worker takes on lifecycle
 * management and memory residency (measured peak 32~39GB), so until the need is
 * proven by measurement, a stateless subprocess is the right call. Unlike
 * Supertonic we use the CLI directly rather than an inline snippet, because the
 * uv tool install of mflux is an executable with its own isolated venv — there's
 * no interpreter to pick — and the CLI has no extra information (like a duration)
 * to return beyond the result file path.
 *
 * Measured figures (M4 Max 128GB, at load average 74 overload — conservative floor):
 *   1024×1024 @9 steps diffusion 116~197s · 1088×1920 @9 steps 443s · peak memory 31.9~38.9GB
 */

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { mfluxZImageBin } from './config.js';
import { bareFilenameSchema, resolveOutputFile } from './media-utils.js';

/** Z-Image Turbo recommended steps — 8 NFE per the model card (specifying steps=9 runs 8 DiT forwards). */
export const DEFAULT_ZIMAGE_STEPS = 9;

/** Quantization widths used in the field test — 8-bit is the default; 4-bit halves memory with a slight quality drop. */
export const ZIMAGE_QUANTIZE_OPTIONS = [4, 6, 8] as const;
export const DEFAULT_ZIMAGE_QUANTIZE = 8;

/**
 * Resolution constraint — edges must be multiples of 16 (latent patch unit).
 * 9:16 portrait is **1088×1920**, not 1080×1920 — 1080 is not a multiple of 16.
 */
export const ZIMAGE_DIMENSION_STEP = 16;
export const MIN_ZIMAGE_DIMENSION = 256;
export const MAX_ZIMAGE_DIMENSION = 2048;

const dimensionSchema = z
  .number()
  .int()
  .min(MIN_ZIMAGE_DIMENSION)
  .max(MAX_ZIMAGE_DIMENSION)
  .refine((v) => v % ZIMAGE_DIMENSION_STEP === 0, {
    message: `width/height must be a multiple of ${ZIMAGE_DIMENSION_STEP} (for 9:16 that's 1088×1920, not 1080×1920)`,
  });

/**
 * Subprocess timeout.
 *
 * Measured: 1024² (1.05MP) at 9 steps takes 149~210s depending on load, and
 * 1088×1920 (2.09MP) at 9 steps takes 462s (at load average 74). Scale linearly
 * with pixel count and steps with slack for load swings: 120s of model-load and
 * quantization startup allowance plus 45s per step×MP, cut off at 30 minutes.
 */
export function zimageTimeoutMs(width: number, height: number, steps: number): number {
  const megapixels = (width * height) / 1_000_000;
  return Math.min(30 * 60_000, 120_000 + Math.ceil(steps * megapixels * 45_000));
}

/**
 * Weight cache directory — used to detect the first call.
 *
 * The timeout above times only generation, so on a new machine the first call's
 * 31GB download can't finish inside it and execFile would kill the process
 * mid-download. When the cache is missing we add a download allowance (60
 * minutes) — zimageTimeoutMs itself stays a generation-time contract.
 */
function weightCacheDir(): string {
  const hfHome = process.env.HF_HOME || join(homedir(), '.cache', 'huggingface');
  return join(hfHome, 'hub', 'models--Tongyi-MAI--Z-Image-Turbo');
}

const WEIGHT_DOWNLOAD_ALLOWANCE_MS = 60 * 60_000;

/** Turn an execution failure into guidance the user can act on. */
function installHint(detail: string): string {
  return (
    `${detail}\n\n` +
    `Local image generation requires mflux (Apple Silicon only, MLX):\n` +
    `  uv tool install --python 3.12 mflux\n` +
    `If it's installed elsewhere, point MFLUX_ZIMAGE_BIN at the executable ` +
    `(e.g. MFLUX_ZIMAGE_BIN=~/.venvs/mflux/bin/mflux-generate-z-image-turbo).\n` +
    `The first call downloads the ~31GB Z-Image Turbo weight repository to ~/.cache/huggingface.\n` +
    `Until it's installed, use gpt_image_text2img — that one only needs OPENAI_API_KEY.`
  );
}

// ── Request schema ───────────────────────────────────────────────

export const zimageGenerateSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required').max(32_000),
  width: dimensionSchema.optional().default(1024),
  height: dimensionSchema.optional().default(1024),
  steps: z.number().int().min(1).max(50).optional().default(DEFAULT_ZIMAGE_STEPS),
  seed: z.number().int().min(0).optional(),
  quantize: z
    .union([z.literal(4), z.literal(6), z.literal(8)])
    .optional()
    .default(DEFAULT_ZIMAGE_QUANTIZE),
  outputPath: z.string().optional(),
  filename: bareFilenameSchema('image').optional(),
});

export type ZImageGenerateRequest = z.infer<typeof zimageGenerateSchema>;

export interface ZImageResponse {
  success: boolean;
  imagePath?: string;
  error?: string;
  width?: number;
  height?: number;
  steps?: number;
  seed?: number;
  quantize?: number;
  elapsedSeconds?: number;
}

// ── Generation ──────────────────────────────────────────────────

/** Text → image, generated locally — cover backgrounds, b-roll, drafts (text-free images only) */
export async function generateLocalImage(request: ZImageGenerateRequest): Promise<ZImageResponse> {
  const bin = mfluxZImageBin();
  if (!existsSync(bin)) {
    return { success: false, error: installHint(`mflux binary not found: "${bin}"`) };
  }

  const outFile = resolveOutputFile(
    request.outputPath || process.cwd(),
    request.filename || `zimage_${Date.now()}.png`,
    'image',
  );

  // Assemble exactly the flags used in the field test (--prompt/--width/--height/--steps/-q/--output[/--seed]).
  const cliArgs = [
    '--prompt', request.prompt,
    '--width', String(request.width),
    '--height', String(request.height),
    '--steps', String(request.steps),
    '-q', String(request.quantize),
    '--output', outFile,
  ];
  if (request.seed !== undefined) cliArgs.push('--seed', String(request.seed));

  const firstCall = !existsSync(weightCacheDir());
  if (firstCall) {
    console.error('[Z-Image] First call — downloading ~31GB of weights to the huggingface cache first. This can take a long time.');
  }
  console.error(
    `[Z-Image] Generating locally... (${request.width}x${request.height}, ${request.steps} steps, q${request.quantize})`,
  );

  const startedAt = Date.now();
  try {
    await new Promise<void>((resolve, reject) => {
      execFile(
        bin,
        cliArgs,
        {
          timeout:
            zimageTimeoutMs(request.width, request.height, request.steps) +
            (firstCall ? WEIGHT_DOWNLOAD_ALLOWANCE_MS : 0),
          // The first call accumulates several MB of tqdm progress output from the
          // 31GB download — reusing Supertonic's 1MB would die on maxBuffer mid-download.
          maxBuffer: 16 * 1024 * 1024,
        },
        (error, _out, errOut) => {
          if (error) {
            const code = (error as NodeJS.ErrnoException).code;
            if (code === 'ENOENT') {
              reject(new Error(installHint(`mflux binary not found: "${bin}"`)));
              return;
            }
            // Only include the stderr tail minus progress bars — tqdm lines are noise, not the cause.
            const tail = errOut
              .split('\n')
              .filter((line) => line.trim() && !line.includes('it/s]') && !line.includes('%|'))
              .slice(-5)
              .join('\n');
            reject(new Error(`${error.message}${tail ? `\n${tail}` : ''}`));
            return;
          }
          resolve();
        },
      );
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Z-Image] Error: ${message.split('\n')[0]}`);
    return { success: false, error: message };
  }

  // mflux can exit 0 silently even on success, so the output file's existence is the authoritative verdict.
  if (!existsSync(outFile)) {
    return {
      success: false,
      error: `mflux exited without producing the output file: ${outFile}`,
    };
  }

  const elapsed = Math.round((Date.now() - startedAt) / 100) / 10;
  console.error(`[Z-Image] Image saved to: ${outFile} (${elapsed}s)`);
  return {
    success: true,
    imagePath: outFile,
    width: request.width,
    height: request.height,
    steps: request.steps,
    seed: request.seed,
    quantize: request.quantize,
    elapsedSeconds: elapsed,
  };
}
