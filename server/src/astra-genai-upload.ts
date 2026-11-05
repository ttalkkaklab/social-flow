/**
 * Chunked gateway uploads. An MSR body with base64 pictures and voice ran to ~20 MB, and on a slow
 * link through Cloudflare it did not arrive within the edge's wait, which answered 524 (2026-11-05).
 * Local sources now go up in chunks of at most chunk_size, each resent on its own, and the MSR body
 * carries the returned `genai-file://` id.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { z } from 'zod';
import { GenaiRequestError, astraGenaiBaseUrl, requireAstraGenaiKey } from './astra-genai-client.js';
import { imageMetadata } from './image-media.js';

export const GENAI_FILE_SCHEME = 'genai-file://';
/** Tests set retryDelayMs to 0; a chunk of 5 MiB at 0.4 MB/s takes about 13 s, well inside chunkTimeoutMs. */
export const genaiUploadSettings = { attempts: 4, retryDelayMs: 2000, chunkTimeoutMs: 120_000 };
/** Gateway upload contract (2026-11-05): these types only, at most 32 MiB a file. */
const UPLOAD_TYPES = new Set(['image/png', 'image/jpeg', 'audio/wav', 'audio/mpeg', 'audio/mp4', 'audio/ogg']);
const UPLOAD_MAX_BYTES = 32 * 1024 * 1024;
/** The MSR 400 message for an unknown, expired or foreign `genai-file://` id; upload again and resubmit once. */
export const GENAI_FILE_GONE = /genai-file not found or expired/;

const sessionSchema = z.object({ upload_id: z.string().min(1), chunk_size: z.number().int().positive().max(5 * 1024 * 1024),
  chunks: z.number().int().positive() }).passthrough();
const fileSchema = z.object({ file_id: z.string().min(1), uri: z.string().startsWith(GENAI_FILE_SCHEME), expires_at: z.string().optional() }).passthrough();
const statusSchema = z.object({ missing: z.array(z.number().int().nonnegative()) }).passthrough();

/** One gateway call with its own timeout; the token never appears in an error. */
async function call(method: 'GET' | 'POST' | 'PUT', route: string, body?: Buffer | object, headers: Record<string, string> = {}, timeoutMs = 60_000) {
  const key = requireAstraGenaiKey(route);
  const raw = Buffer.isBuffer(body);
  const response = await fetch(astraGenaiBaseUrl(route) + route, {
    method, redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
    headers: { Authorization: `Bearer ${key}`, ...(body === undefined ? {} : { 'Content-Type': raw ? 'application/octet-stream' : 'application/json' }), ...headers },
    ...(body === undefined ? {} : { body: raw ? new Uint8Array(body) : JSON.stringify(body) }),
  });
  const text = await response.text();
  if (!response.ok) throw new GenaiRequestError(`ASTRA GenAI HTTP ${response.status}: ${text.replaceAll(key, '[redacted]').slice(0, 2000)}`,
    response.status >= 400 && response.status < 500 && ![408, 409, 425, 429].includes(response.status), response.status);
  try { return text ? JSON.parse(text) as unknown : {}; }
  catch { throw new Error(`ASTRA GenAI ${route} returned a non-JSON response`); }
}

/**
 * Every upload step is safe to repeat: a chunk overwrites itself and complete returns the same file id.
 * Only a dropped connection, a timeout or a 5xx/408/425/429 is retried; a 409 from complete is an answer.
 */
async function retried<T>(step: () => Promise<T>, final: number[] = []): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try { return await step(); }
    catch (error) {
      const transient = !(error instanceof GenaiRequestError) || !final.includes(error.httpStatus) && (error.httpStatus >= 500 || [408, 425, 429].includes(error.httpStatus));
      if (!transient || attempt >= genaiUploadSettings.attempts) throw error;
      await new Promise(resolve => setTimeout(resolve, genaiUploadSettings.retryDelayMs * attempt));
    }
  }
}

const uploaded = new Map<string, { uri: string; expiresAt: number }>();

/** Forget every cached id, after the gateway answered that one of them is gone. */
export function forgetGenaiUploads() { uploaded.clear(); }

/** Whether the gateway takes this file at all; a file it does not take says nothing about the upload API. */
export function genaiUploadable(bytes: Buffer, contentType: string) { return UPLOAD_TYPES.has(contentType) && bytes.length <= UPLOAD_MAX_BYTES; }

// Create answers these when the caller should keep its data URI: no upload API (404/405), over a limit (429), disk full (507).
const FALL_BACK = [404, 405, 429, 507];

/**
 * Upload bytes and return their `genai-file://` URI, or undefined when the caller should keep its
 * data URI: a type or size the gateway does not take, or a create answer in FALL_BACK.
 */
export async function uploadGenaiFile(bytes: Buffer, contentType: string): Promise<string | undefined> {
  if (!genaiUploadable(bytes, contentType)) return undefined;
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const cacheKey = `${astraGenaiBaseUrl()} ${sha256}`, cached = uploaded.get(cacheKey);
  // Reuse an id only while it outlives a long render.
  if (cached && cached.expiresAt > Date.now() + 60 * 60_000) return cached.uri;
  // complete answers 422 when the joined file does not match sha256 and drops the upload; start over once.
  for (let attempt = 1; ; attempt++) {
    try { return await uploadOnce(bytes, contentType, sha256, cacheKey); }
    catch (error) {
      if (error instanceof Restart && attempt < 2) continue;
      throw error instanceof Restart ? error.original : error;
    }
  }
}

class Restart extends Error { constructor(readonly original: unknown) { super('restart upload'); } }

async function uploadOnce(bytes: Buffer, contentType: string, sha256: string, cacheKey: string): Promise<string | undefined> {
  let session: z.infer<typeof sessionSchema>;
  try { session = sessionSchema.parse(await retried(() => call('POST', '/v1/uploads', { size: bytes.length, sha256, content_type: contentType }), FALL_BACK)); }
  catch (error) {
    if (error instanceof GenaiRequestError && FALL_BACK.includes(error.httpStatus)) return undefined;
    throw error;
  }
  if (session.chunks !== Math.ceil(bytes.length / session.chunk_size)) throw new Error('GenAI upload session chunk count does not match the file size');
  const route = `/v1/uploads/${encodeURIComponent(session.upload_id)}`;
  const put = (n: number) => retried(() => {
    const chunk = bytes.subarray(n * session.chunk_size, (n + 1) * session.chunk_size);
    return call('PUT', `${route}/chunks/${n}`, chunk, { 'X-Chunk-SHA256': createHash('sha256').update(chunk).digest('hex') }, genaiUploadSettings.chunkTimeoutMs);
  });
  for (let n = 0; n < session.chunks; n++) await put(n);
  const complete = async () => {
    try { return await retried(() => call('POST', `${route}/complete`)); }
    catch (error) { throw error instanceof GenaiRequestError && error.httpStatus === 422 ? new Restart(error) : error; }
  };
  let done: unknown;
  try { done = await complete(); }
  catch (error) {
    // A chunk acknowledged in transit may still be missing; read which from GET (not the 409 body), send those and finish once more.
    if (!(error instanceof GenaiRequestError) || error.httpStatus !== 409) throw error;
    for (const n of statusSchema.parse(await retried(() => call('GET', route))).missing) await put(n);
    done = await complete();
  }
  const file = fileSchema.parse(done);
  const expiresAt = file.expires_at ? Date.parse(file.expires_at) : NaN;
  if (Number.isFinite(expiresAt)) uploaded.set(cacheKey, { uri: file.uri, expiresAt });
  return file.uri;
}

/** Fit a PNG/JPEG inside width x height without upscaling; on any ffmpeg failure the original bytes stay. */
export function shrinkImageToFit(bytes: Buffer, width: number, height: number): Buffer {
  const meta = imageMetadata(bytes);
  if (meta.width <= width && meta.height <= height) return bytes;
  const ext = meta.mimeType === 'image/png' ? '.png' : meta.mimeType === 'image/jpeg' ? '.jpg' : undefined;
  if (!ext) return bytes;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'genai-shrink-'));
  try {
    const input = path.join(dir, `in${ext}`), output = path.join(dir, `out${ext}`);
    fs.writeFileSync(input, bytes);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', input, '-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease:flags=lanczos`,
      '-frames:v', '1', ...(ext === '.jpg' ? ['-q:v', '2'] : []), output], { timeout: 60_000, stdio: 'pipe' });
    const shrunk = fs.readFileSync(output), out = imageMetadata(shrunk);
    return out.mimeType === meta.mimeType && out.width <= width && out.height <= height ? shrunk : bytes;
  } catch { return bytes; }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
