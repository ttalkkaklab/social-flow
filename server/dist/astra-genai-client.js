/** Transport shared by the GenAI provider adapters, separate from legacy ASTRA jobs. */
import { config } from './config.js';
export function astraGenaiBaseUrl() {
    return (process.env.ASTRA_GENAI_URL || 'https://genai.astravision.co.kr').replace(/\/+$/, '');
}
export function requireAstraGenaiKey() {
    if (!config.astraGenaiApiKey)
        throw new Error('ASTRA_GENAI_API_KEY is required: issue a gateway token in the GenAI console; ASTRA_VIDEO is a separate credential.');
    return config.astraGenaiApiKey;
}
/** No automatic POST retries: a disconnected request may already be generating. */
export async function requestGenai(method, route, body, timeoutMs = 60_000) {
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
    try {
        return JSON.parse(text);
    }
    catch {
        throw new Error('ASTRA GenAI returned a non-JSON response; inspect the existing request before retrying.');
    }
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
