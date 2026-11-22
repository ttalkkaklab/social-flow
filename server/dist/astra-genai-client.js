/** Transport shared by the GenAI provider adapters, separate from legacy ASTRA jobs. */
import { readFileSync, statSync } from 'node:fs';
import { extname } from 'node:path';
import { Agent } from 'undici';
import { z } from 'zod';
import { imageMetadata } from './image-media.js';
import { config } from './config.js';
export function desktopGatewayKey() {
    const url = process.env.ASTRA_GENAI_DESKTOP_URL?.replace(/\/+$/, '');
    if (!url)
        return config.astraGenaiApiKey;
    if (process.env.ASTRA_GENAI_DESKTOP_API_KEY)
        return process.env.ASTRA_GENAI_DESKTOP_API_KEY;
    // Share the local image gateway credential only when both configured roots match exactly.
    if (url === process.env.ASTRA_GENAI_IMAGE_URL?.replace(/\/+$/, ''))
        return process.env.ASTRA_GENAI_IMAGE_API_KEY;
    return undefined;
}
/** Model-bound images and speech may run on another gateway (e.g. a local Mac one); Desktop has its own optional gateway override. */
function override(route) {
    if (route.startsWith('/v1/ltx/desktop/'))
        return { url: process.env.ASTRA_GENAI_DESKTOP_URL, key: desktopGatewayKey() };
    if (route.startsWith('/v1/images/'))
        return { url: process.env.ASTRA_GENAI_IMAGE_URL, key: process.env.ASTRA_GENAI_IMAGE_API_KEY };
    if (route.startsWith('/v1/audio/'))
        return { url: process.env.ASTRA_GENAI_SPEECH_URL, key: process.env.ASTRA_GENAI_SPEECH_API_KEY };
    return {};
}
export function astraGenaiBaseUrl(route = '') {
    return (override(route).url || process.env.ASTRA_GENAI_URL || 'https://genai.astravision.co.kr').replace(/\/+$/, '');
}
export function requireAstraGenaiKey(route = '') {
    const { url, key } = override(route);
    if (url) {
        const lane = route.startsWith('/v1/images/') ? 'IMAGE' : route.startsWith('/v1/audio/') ? 'SPEECH' : 'DESKTOP';
        if (!key)
            throw new Error(`ASTRA_GENAI_${lane}_API_KEY is required with its gateway URL override.`);
        return key;
    }
    if (!config.astraGenaiApiKey)
        throw new Error('ASTRA_GENAI_API_KEY is required: issue a gateway token in the GenAI console; ASTRA_VIDEO is a separate credential.');
    return config.astraGenaiApiKey;
}
/**
 * Synchronous image and speech calls answer only when the picture or audio is done, which can take
 * longer than fetch's built-in 300 s wait for response headers; each request waits as long as its own timeout.
 */
const waiters = new Map();
const waitFor = (ms) => waiters.get(ms) ?? waiters.set(ms, new Agent({ headersTimeout: ms, bodyTimeout: ms })).get(ms);
/** Only explicit rejection or terminal provider evidence releases a generation slot. */
export class GenaiRequestError extends Error {
    terminal;
    httpStatus;
    constructor(message, terminal, httpStatus) {
        super(message);
        this.terminal = terminal;
        this.httpStatus = httpStatus;
    }
}
/** No automatic POST retries: a disconnected request may already be generating. */
export async function requestGenai(method, route, body, timeoutMs = 60_000, onResponse, signal, requestId) {
    const key = requireAstraGenaiKey(route);
    const response = await fetch(astraGenaiBaseUrl(route) + route, {
        method, redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs), ...{ dispatcher: waitFor(timeoutMs) },
        headers: { Authorization: `Bearer ${key}`, ...(requestId ? { 'X-Request-ID': requestId } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    if (!response.ok) {
        const detail = text.replaceAll(key, '[redacted]').slice(0, 2000);
        let terminal = response.status >= 400 && response.status < 500 && ![408, 409, 425].includes(response.status);
        try {
            const evidence = JSON.parse(text);
            terminal ||= typeof evidence.request_id === 'string' && ['failed', 'FAILED', 'error'].includes(evidence.status ?? evidence.output?.task_status);
        }
        catch { /* A gateway error page is not terminal provider evidence. */ }
        throw new GenaiRequestError(`ASTRA GenAI HTTP ${response.status}: ${detail}`, terminal, response.status);
    }
    onResponse?.(response.headers);
    try {
        return JSON.parse(text);
    }
    catch {
        throw new Error('ASTRA GenAI returned a non-JSON response; inspect the existing request before retrying.');
    }
}
/**
 * Poll a submitted job every 5 s for up to 30 minutes. One transient 5xx on the status GET is
 * retried, and an HTTP error on the GET never counts as terminal job evidence; only a job the
 * gateway reports failed (thrown as GenaiRequestError with HTTP 200) does. Never wraps a POST.
 */
export async function pollGenaiJob(check, pending) {
    const deadline = Date.now() + 30 * 60_000;
    let retried = false;
    do {
        try {
            const result = await check();
            if (result.downloaded)
                return result;
            retried = false;
        }
        catch (error) {
            if (!(error instanceof GenaiRequestError) || error.httpStatus === 200)
                throw error;
            if (error.httpStatus < 500 || retried)
                throw new Error(error.message);
            retried = true;
        }
        await new Promise(resolve => setTimeout(resolve, 5000));
    } while (Date.now() < deadline);
    throw new Error(pending);
}
/** Signed result URLs carry their own authorization. Never send the gateway token. */
export async function downloadGenaiResult(uri) {
    const url = new URL(uri, astraGenaiBaseUrl() + '/');
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password)
        throw new Error('Invalid GenAI result URL');
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(120_000) });
    if (!response.ok)
        throw new Error(`ASTRA GenAI result download failed (HTTP ${response.status}); reuse the existing job, do not regenerate.`);
    return Buffer.from(await response.arrayBuffer());
}
/** Gateway fetches public HTTPS sources; local assets travel as PNG/JPEG data URIs. */
export const genaiImageUriSchema = z.string().min(1).refine(value => {
    if (/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(value))
        return true;
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && !url.username && !url.password;
    }
    catch {
        return false;
    }
}, 'Use a public HTTPS PNG/JPEG URL or PNG/JPEG data URI');
export function genaiSourceUri(uri, file) {
    if (uri !== undefined) {
        genaiImageUriSchema.parse(uri);
        if (uri.startsWith('https:'))
            return uri;
    }
    if (!uri && !file)
        throw new Error('GenAI source requires an image URI or local path');
    const bytes = uri ? Buffer.from(uri.slice(uri.indexOf(',') + 1), 'base64') : readFileSync(file), meta = imageMetadata(bytes);
    if (uri && !uri.startsWith(`data:${meta.mimeType};base64,`))
        throw new Error('GenAI data URI MIME does not match image');
    if (!['image/png', 'image/jpeg'].includes(meta.mimeType) || meta.bytes > 32 * 1024 * 1024 || meta.width > 4096 || meta.height > 4096)
        throw new Error('GenAI source must be PNG/JPEG, at most 32 MiB and 4096 pixels per side');
    return `data:${meta.mimeType};base64,${bytes.toString('base64')}`;
}
export const GENAI_AUDIO_TYPES = { '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.opus': 'audio/ogg' };
export const GENAI_AUDIO_DATA_URI_MAX = 15_000_000;
/** Local audio becomes a data URI; HTTPS sources are fetched by the gateway. */
export function genaiAudioUri(uri, file) {
    if (uri !== undefined) {
        if (/^https:/.test(uri)) {
            const url = new URL(uri);
            if (url.username || url.password)
                throw new Error('GenAI audio URL must not carry credentials');
            return uri;
        }
        const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]+=*)$/.exec(uri);
        if (!match || !Object.values(GENAI_AUDIO_TYPES).includes(match[1]))
            throw new Error('GenAI audio must be HTTPS or an audio/wav, audio/mpeg, audio/mp4 or audio/ogg data URI');
        if (match[2].length > GENAI_AUDIO_DATA_URI_MAX)
            throw new Error('GenAI audio data URI exceeds 15,000,000 base64 characters; use an HTTPS URL');
        return uri;
    }
    const type = GENAI_AUDIO_TYPES[extname(file).toLowerCase()];
    if (!type)
        throw new Error('GenAI audioPath must be .wav, .mp3, .m4a, .ogg or .opus');
    // base64 of n bytes is 4*ceil(n/3) characters; reject before reading a large file.
    if (4 * Math.ceil(statSync(file).size / 3) > GENAI_AUDIO_DATA_URI_MAX)
        throw new Error('GenAI audioPath exceeds the 15,000,000-character data URI limit (about 11.25 MB); use audioUri with HTTPS');
    return `data:${type};base64,${readFileSync(file).toString('base64')}`;
}
/** Authenticated private gateway media; never attach this token to result/CDN URLs. */
export async function requestGenaiMedia(route, body, credentialRoute = route, signal) {
    if (!/^\/v1\/(audio\/speech|ltx\/desktop\/assets(?:\/[A-Za-z0-9_-]+\/bytes)?)$/.test(route))
        throw new Error('Unsupported private gateway media route');
    const key = requireAstraGenaiKey(credentialRoute);
    const form = body instanceof FormData;
    const response = await fetch(astraGenaiBaseUrl(credentialRoute) + route, {
        method: body === undefined ? 'GET' : 'POST', redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30 * 60_000)]) : AbortSignal.timeout(30 * 60_000), ...{ dispatcher: waitFor(30 * 60_000) },
        headers: { Authorization: `Bearer ${key}`, ...(body && !form ? { 'Content-Type': 'application/json' } : {}) },
        ...(body === undefined ? {} : { body: form ? body : JSON.stringify(body) }),
    });
    if (!response.ok)
        throw new GenaiRequestError(`ASTRA GenAI HTTP ${response.status}: ${(await response.text()).replaceAll(key, '[redacted]').slice(0, 2000)}`, response.status >= 400 && response.status < 500 && ![408, 409, 425].includes(response.status), response.status);
    return Buffer.from(await response.arrayBuffer());
}
/** Read deployment configuration without performing inference. */
export async function genaiCatalog(kind) {
    const routes = { image: '/v1/images/models', speech: '/v1/audio/models', video: '/v1/models', ltx_video: '/v1/ltx/v2/capabilities',
        desktop_video: '/v1/ltx/desktop/models',
        loras: '/v1/ltx/desktop/loras', contracts: '/v1/ltx/desktop/contracts' };
    return requestGenai('GET', routes[kind]);
}
