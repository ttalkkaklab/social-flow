import { config } from './config.js';
/**
 * Shared fetch wrapper — turns timeouts and network errors into a structured result.
 * The response body is returned verbatim, unparsed (the LLM consumer reads it directly).
 */
export async function requestRaw(method, url, headers, body, timeoutMs) {
    const effectiveTimeoutMs = timeoutMs ?? config.requestTimeoutMs;
    try {
        const res = await fetch(url, {
            method: method.toUpperCase(),
            headers: {
                ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
                ...headers,
            },
            body: body !== undefined ? JSON.stringify(body) : undefined,
            signal: AbortSignal.timeout(effectiveTimeoutMs),
        });
        const text = await res.text();
        return { ok: res.ok, status: res.status, body: text };
    }
    catch (error) {
        if (error instanceof Error && error.name === 'TimeoutError') {
            return { ok: false, status: 504, body: `Request timed out after ${effectiveTimeoutMs}ms: ${url}` };
        }
        const message = error instanceof Error ? error.message : String(error);
        return { ok: false, status: 502, body: `Upstream unreachable (${url}): ${message}` };
    }
}
export function buildQuery(params) {
    const sp = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== '')
            sp.set(key, String(value));
    }
    const qs = sp.toString();
    return qs ? `?${qs}` : '';
}
