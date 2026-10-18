/** Transport shared by the GenAI provider adapters, separate from legacy ASTRA jobs. */
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { imageMetadata } from './image-media.js';
import { config } from './config.js';

export function astraGenaiBaseUrl(): string {
  return (process.env.ASTRA_GENAI_URL || 'https://genai.astravision.co.kr').replace(/\/+$/, '');
}

export function requireAstraGenaiKey(): string {
  if (!config.astraGenaiApiKey) throw new Error('ASTRA_GENAI_API_KEY is required: issue a gateway token in the GenAI console; ASTRA_VIDEO is a separate credential.');
  return config.astraGenaiApiKey;
}

/** No automatic POST retries: a disconnected request may already be generating. */
export async function requestGenai(method: 'GET' | 'POST', route: string, body?: unknown, timeoutMs = 60_000, onResponse?: (headers: Headers) => void): Promise<unknown> {
  const key = requireAstraGenaiKey();
  const response = await fetch(astraGenaiBaseUrl() + route, {
    method, redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
    headers: { Authorization: `Bearer ${key}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  if (!response.ok) {
    const detail = text.replaceAll(key, '[redacted]').slice(0, 2000);
    throw new Error(`ASTRA GenAI HTTP ${response.status}: ${detail}`);
  }
  onResponse?.(response.headers);
  try { return JSON.parse(text); }
  catch { throw new Error('ASTRA GenAI returned a non-JSON response; inspect the existing request before retrying.'); }
}

/** Signed result URLs carry their own authorization. Never send the gateway token. */
export async function downloadGenaiResult(uri: string): Promise<Buffer> {
  const url = new URL(uri, astraGenaiBaseUrl() + '/');
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid GenAI result URL');
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`ASTRA GenAI result download failed (HTTP ${response.status}); reuse the existing job, do not regenerate.`);
  return Buffer.from(await response.arrayBuffer());
}

/** Gateway fetches public HTTPS sources; local assets travel as PNG/JPEG data URIs. */
export const genaiImageUriSchema = z.string().min(1).refine(value => {
  if (/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(value)) return true;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; }
  catch { return false; }
}, 'Use a public HTTPS PNG/JPEG URL or PNG/JPEG data URI');
export function genaiSourceUri(uri?: string, file?: string): string {
  if (uri !== undefined) {
    genaiImageUriSchema.parse(uri);
    if (uri.startsWith('https:')) return uri;
  }
  if (!uri && !file) throw new Error('GenAI source requires an image URI or local path');
  const bytes = uri ? Buffer.from(uri.slice(uri.indexOf(',') + 1), 'base64') : readFileSync(file!), meta = imageMetadata(bytes);
  if (uri && !uri.startsWith(`data:${meta.mimeType};base64,`)) throw new Error('GenAI data URI MIME does not match image');
  if (!['image/png', 'image/jpeg'].includes(meta.mimeType) || meta.bytes > 32 * 1024 * 1024 || meta.width > 4096 || meta.height > 4096)
    throw new Error('GenAI source must be PNG/JPEG, at most 32 MiB and 4096 pixels per side');
  return `data:${meta.mimeType};base64,${bytes.toString('base64')}`;
}
