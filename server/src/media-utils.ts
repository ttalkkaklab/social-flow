/**
 * Generated-media file utilities — ported from fect-mcp-server shared/path-utils.ts
 * (images, video, audio).
 *
 * Handles path validation (traversal blocking + extension whitelist) and saving base64
 * images and audio.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';

/** Allowed file extensions (per module) */
export const ALLOWED_EXTENSIONS = {
  image: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'],
  video: ['.mp4', '.webm', '.mov', '.avi'],
  audio: ['.wav', '.mp3', '.ogg', '.webm', '.aac', '.flac'],
  json: ['.json'],
} as const;

/**
 * Validates that a file path is safe.
 *
 * - Blocks path traversal (../) attacks.
 * - Lets only allowed extensions through.
 */
export function validateFilePath(
  filePath: string,
  options?: { allowedExtensions?: readonly string[] },
): void {
  const resolved = path.resolve(filePath);

  // check for the path traversal pattern
  if (filePath.includes('..')) {
    throw new Error(`Path traversal detected: ${filePath}`);
  }

  // check against the extension whitelist
  if (options?.allowedExtensions) {
    const ext = path.extname(resolved).toLowerCase();
    if (!options.allowedExtensions.includes(ext)) {
      throw new Error(
        `File extension "${ext}" is not allowed. Allowed: ${options.allowedExtensions.join(', ')}`,
      );
    }
  }
}

/** Extracts the error message. */
export function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Formats a byte count in human-readable units (B/KB/MB). */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * Saves base64 image data to a file.
 *
 * - Creates the parent directory automatically.
 * - Throws if the extension isn't an image format.
 * - Returns the absolute path and size (bytes) of the saved file.
 */
export async function saveBase64Image(
  base64Data: string,
  filePath: string,
): Promise<{ filePath: string; size: number }> {
  validateFilePath(filePath, { allowedExtensions: ALLOWED_EXTENSIONS.image });

  const resolved = path.resolve(filePath);
  await fs.promises.mkdir(path.dirname(resolved), { recursive: true });

  const buffer = Buffer.from(base64Data, 'base64');
  await fs.promises.writeFile(resolved, buffer);

  const stats = await fs.promises.stat(resolved);
  return { filePath: resolved, size: stats.size };
}

/**
 * Wraps container-less 16-bit raw PCM in a WAV.
 *
 * This folds the identical header-building code TTS (mono 24kHz) and music (stereo 48kHz)
 * each carried into one parameterized function — only channel count and sample rate differ.
 */
export function pcmToWav(pcmData: Buffer, sampleRate: number, numChannels: number): Buffer {
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmData.length;

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmData]);
}

/**
 * Safely assembles the save path for generated media (creates the directory too).
 *
 * filename must be a bare file name — path.join normalizes `../` away, so validating after
 * assembly can't catch traversal. The separator itself has to be rejected.
 */
export function resolveOutputFile(
  outputDir: string,
  filename: string,
  kind: keyof typeof ALLOWED_EXTENSIONS,
): string {
  if (/[/\\]/.test(filename) || filename.includes('..')) {
    throw new Error(`filename must be a bare file name without path separators: "${filename}"`);
  }
  validateFilePath(filename, { allowedExtensions: ALLOWED_EXTENSIONS[kind] });

  const dir = path.resolve(outputDir);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, filename);
}

/** Saves a generated media buffer to <directory>/<filename> and returns the absolute path. */
export function saveMediaFile(
  outputDir: string,
  filename: string,
  data: Buffer,
  kind: keyof typeof ALLOWED_EXTENSIONS,
): string {
  const fullPath = resolveOutputFile(outputDir, filename, kind);
  fs.writeFileSync(fullPath, data);
  return fullPath;
}

/** Audio-only shorthand — used by the TTS and music clients. */
export function saveAudioFile(outputDir: string, filename: string, data: Buffer): string {
  return saveMediaFile(outputDir, filename, data, 'audio');
}

/**
 * zod schema for the filename argument — applies the same rules as resolveOutputFile,
 * but **before the call**.
 *
 * With validation only at save time, a generation that takes 1-6 minutes like Veo finishes
 * completely before the filename gets rejected, throwing away the time and the money.
 * Save-time validation stays as the backstop.
 */
export function bareFilenameSchema(kind: keyof typeof ALLOWED_EXTENSIONS) {
  const allowed = ALLOWED_EXTENSIONS[kind];
  return z
    .string()
    .min(1)
    .refine((name) => !/[/\\]/.test(name) && !name.includes('..'), {
      message: 'filename must be a bare file name without path separators (use outputPath for the directory)',
    })
    .refine((name) => (allowed as readonly string[]).includes(path.extname(name).toLowerCase()), {
      message: `filename extension must be one of: ${allowed.join(', ')}`,
    });
}

/** Determines the input media MIME type from the file extension. */
export function mimeFromExtension(filePath: string, kind: 'image' | 'video'): string {
  const ext = path.extname(filePath).toLowerCase();
  if (kind === 'image') {
    return ext === '.png' ? 'image/png'
      : ext === '.gif' ? 'image/gif'
      : ext === '.webp' ? 'image/webp'
      : 'image/jpeg';
  }
  return ext === '.webm' ? 'video/webm'
    : ext === '.mov' ? 'video/quicktime'
    : 'video/mp4';
}
