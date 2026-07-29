import { config } from './config.js';
/**
 * 공용 fetch 래퍼 — 타임아웃 + 네트워크 오류를 구조화된 결과로 변환.
 * 응답 본문은 파싱하지 않고 원문으로 반환한다 (LLM 소비자가 직접 읽음).
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
