/** Transport shared by the GenAI provider adapters, separate from legacy ASTRA jobs. */
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { imageMetadata } from './image-media.js';
import { config } from './config.js';

/** Model-bound images and speech may run on another gateway (e.g. a local Mac one); everything else uses ASTRA_GENAI_URL. */
function override(route: string): { url?: string; key?: string } {
  if (route.startsWith('/v1/images/')) return { url: process.env.ASTRA_GENAI_IMAGE_URL, key: process.env.ASTRA_GENAI_IMAGE_API_KEY };
  if (route.startsWith('/v1/audio/')) return { url: process.env.ASTRA_GENAI_SPEECH_URL, key: process.env.ASTRA_GENAI_SPEECH_API_KEY };
  return {};
}

export function astraGenaiBaseUrl(route = ''): string {
  return (override(route).url || process.env.ASTRA_GENAI_URL || 'https://genai.astravision.co.kr').replace(/\/+$/, '');
}

export function requireAstraGenaiKey(route = ''): string {
  const { url, key } = override(route);
  if (url) {
    if (!key) throw new Error(`${route.startsWith('/v1/images/') ? 'ASTRA_GENAI_IMAGE_API_KEY' : 'ASTRA_GENAI_SPEECH_API_KEY'} is required with its gateway URL override.`);
    return key;
  }
  if (!config.astraGenaiApiKey) throw new Error('ASTRA_GENAI_API_KEY is required: issue a gateway token in the GenAI console; ASTRA_VIDEO is a separate credential.');
  return config.astraGenaiApiKey;
}

/** Only explicit rejection or terminal provider evidence releases a generation slot. */
export class GenaiRequestError extends Error {
  constructor(message: string, readonly terminal: boolean, readonly httpStatus: number) { super(message); }
}

/** No automatic POST retries: a disconnected request may already be generating. */
export async function requestGenai(method: 'GET' | 'POST', route: string, body?: unknown, timeoutMs = 60_000, onResponse?: (headers: Headers) => void): Promise<unknown> {
  const key = requireAstraGenaiKey(route);
  const response = await fetch(astraGenaiBaseUrl(route) + route, {
    method, redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
    headers: { Authorization: `Bearer ${key}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  if (!response.ok) {
    const detail = text.replaceAll(key, '[redacted]').slice(0, 2000);
    let terminal = response.status >= 400 && response.status < 500 && ![408, 409, 425].includes(response.status);
    try {
      const evidence = JSON.parse(text);
      terminal ||= typeof evidence.request_id === 'string' && ['failed', 'FAILED', 'error'].includes(evidence.status ?? evidence.output?.task_status);
    } catch { /* A gateway error page is not terminal provider evidence. */ }
    throw new GenaiRequestError(`ASTRA GenAI HTTP ${response.status}: ${detail}`, terminal, response.status);
  }
  onResponse?.(response.headers);
  try { return JSON.parse(text); }
  catch { throw new Error('ASTRA GenAI returned a non-JSON response; inspect the existing request before retrying.'); }
}

/**
 * Poll a submitted job every 5 s for up to 30 minutes. One transient 5xx on the status GET is
 * retried, and an HTTP error on the GET never counts as terminal job evidence; only a job the
 * gateway reports failed (thrown as GenaiRequestError with HTTP 200) does. Never wraps a POST.
 */
export async function pollGenaiJob<T extends { downloaded: boolean }>(check: () => Promise<T>, pending: string): Promise<T> {
  const deadline = Date.now() + 30 * 60_000;
  let retried = false;
  do {
    try {
      const result = await check();
      if (result.downloaded) return result;
      retried = false;
    } catch (error) {
      if (!(error instanceof GenaiRequestError) || error.httpStatus === 200) throw error;
      if (error.httpStatus < 500 || retried) throw new Error(error.message);
      retried = true;
    }
    await new Promise(resolve => setTimeout(resolve, 5000));
  } while (Date.now() < deadline);
  throw new Error(pending);
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

/** Authenticated private gateway media; never attach this token to result/CDN URLs. */
export async function requestGenaiMedia(route: string, body?: FormData | Record<string, unknown>): Promise<Buffer> {
  if (!/^\/v1\/(audio\/speech|ltx\/desktop\/assets(?:\/[A-Za-z0-9_-]+\/bytes)?)$/.test(route))
    throw new Error('Unsupported private gateway media route');
  const key = requireAstraGenaiKey(route);
  const form = body instanceof FormData;
  const response = await fetch(astraGenaiBaseUrl(route) + route, {
    method: body === undefined ? 'GET' : 'POST', redirect: 'error', signal: AbortSignal.timeout(30 * 60_000),
    headers: { Authorization: `Bearer ${key}`, ...(body && !form ? { 'Content-Type': 'application/json' } : {}) },
    ...(body === undefined ? {} : { body: form ? body : JSON.stringify(body) }),
  });
  if (!response.ok) throw new GenaiRequestError(`ASTRA GenAI HTTP ${response.status}: ${(await response.text()).replaceAll(key, '[redacted]').slice(0, 2000)}`,
    response.status >= 400 && response.status < 500 && ![408, 409, 425].includes(response.status), response.status);
  return Buffer.from(await response.arrayBuffer());
}

/** Read deployment configuration without performing inference. */
export async function genaiCatalog(kind: 'image' | 'speech' | 'video' | 'loras' | 'contracts') {
  const routes = { image: '/v1/images/models', speech: '/v1/audio/models', video: '/v1/ltx/desktop/models',
    loras: '/v1/ltx/desktop/loras', contracts: '/v1/ltx/desktop/contracts' };
  return requestGenai('GET', routes[kind]);
}
