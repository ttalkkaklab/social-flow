import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

export interface ImageMetadata { width: number; height: number; mimeType: string; bytes: number; sha256: string }
/** Read actual image headers. This establishes dimensions/format, not perceptual quality. */
export function imageMetadata(bytes: Buffer): ImageMetadata {
  let width = 0, height = 0, mimeType = '';
  if (bytes.length >= 33 && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) && bytes.toString('ascii', 12, 16) === 'IHDR') {
    width = bytes.readUInt32BE(16); height = bytes.readUInt32BE(20); mimeType = 'image/png';
  } else if (bytes.length > 12 && bytes[0] === 255 && bytes[1] === 216) {
    mimeType = 'image/jpeg';
    for (let i = 2; i + 8 < bytes.length;) {
      if (bytes[i] !== 255) break;
      const marker = bytes[i + 1];
      if (marker === 0xff) { i++; continue; }
      if (marker === 0xd9 || marker === 0xda) break;
      const length = bytes.readUInt16BE(i + 2);
      if (length < 2 || i + 2 + length > bytes.length) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        height = bytes.readUInt16BE(i + 5); width = bytes.readUInt16BE(i + 7); break;
      }
      i += 2 + length;
    }
  } else if (bytes.length >= 30 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    mimeType = 'image/webp';
    const kind = bytes.toString('ascii', 12, 16);
    if (kind === 'VP8X') { width = bytes.readUIntLE(24, 3) + 1; height = bytes.readUIntLE(27, 3) + 1; }
    if (kind === 'VP8L' && bytes[20] === 0x2f) {
      const bits = bytes.readUInt32LE(21); width = (bits & 0x3fff) + 1; height = ((bits >>> 14) & 0x3fff) + 1;
    }
    if (kind === 'VP8 ' && bytes.subarray(23, 26).equals(Buffer.from([0x9d, 0x01, 0x2a]))) {
      width = bytes.readUInt16LE(26) & 0x3fff; height = bytes.readUInt16LE(28) & 0x3fff;
    }
  }
  if (!width || !height) throw new Error('image_invalid: expected a readable PNG, JPEG or WebP header');
  return { width, height, mimeType, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}
export function readImageMetadata(file: string): ImageMetadata { return imageMetadata(readFileSync(file)); }
/** Decode one frame before marking an output complete; no visual-quality judgment. */
export function verifyImageFile(file: string): ImageMetadata {
  const metadata = readImageMetadata(file);
  execFileSync('ffmpeg', ['-v', 'error', '-xerror', '-i', file, '-frames:v', '1', '-f', 'null', '-'], { timeout: 30_000, stdio: 'pipe' });
  return metadata;
}
export function validateImageBase64(value: string, mime?: string): ImageMetadata {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) throw new Error('image_invalid_base64');
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length >= 50 * 1024 * 1024) throw new Error('image_input_too_large');
  const result = imageMetadata(bytes);
  if (mime && result.mimeType !== mime) throw new Error('image_mime_mismatch');
  return result;
}
