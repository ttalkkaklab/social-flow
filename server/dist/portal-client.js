/**
 * ttalkkakstory portal client — the HTTP side of the `portal_*` tools.
 *
 * One workspace API key is the whole authentication: `Authorization: Bearer tks_…`, no cookie,
 * no Origin (portal §5.1). The key comes from `portalCredential()` in config.ts — per channel,
 * flat, or env — and every call carries the channel it resolved for, so a wrong-workspace
 * write is visible in the response (`workspace` · `source`).
 *
 * The portal answers with an envelope `{ success, data, error, error_code?, detail? }`; a
 * failed envelope becomes a PortalError with the status and, on 409, the `detail` (which
 * revision is head · who holds the lease until when) so the skill can pull or wait instead
 * of retrying blind. Route list = the portal's `docs/API.md`; one method per route.
 */
import { hostname } from 'node:os';
import { config, portalCredential } from './config.js';
export class PortalError extends Error {
    status;
    code;
    detail;
    constructor(status, message, code, detail) {
        super(message);
        this.name = 'PortalError';
        this.status = status;
        if (code)
            this.code = code;
        if (detail !== undefined)
            this.detail = detail;
    }
}
/** Lease/revision holder — `<key prefix>@<host>`; a human reads it as "who touched this last". */
export function defaultHolder(apiKey) {
    return `${apiKey.slice(0, 8)}@${hostname()}`;
}
/** Portal timeout — a checkpoint carries a whole board (scenes + five documents); 15 s is too tight for a slow link. */
export const PORTAL_TIMEOUT_MS = 60_000;
/** A filename the portal may hand back that is safe to write next to scenes.js — no path parts, not `.`/`..`. */
export const SAFE_DOCUMENT_NAME = /^(?!\.\.?$)[^/\\\0]+$/;
/**
 * Resolve the credential for a channel and build the client. `null` when nothing is
 * configured — the tool turns that into the one-line "no portal key" answer.
 */
export function portalClientFor(channel, fetchImpl) {
    const credential = portalCredential(channel);
    if (!credential)
        return null;
    return createPortalClient(credential, fetchImpl);
}
export function createPortalClient(credential, fetchImpl = fetch) {
    const root = credential.apiUrl.replace(/\/+$/, '');
    const base = `${root}/api/workspaces/${encodeURIComponent(credential.workspace)}`;
    const headers = { authorization: `Bearer ${credential.apiKey}` };
    const holder = credential.holder || defaultHolder(credential.apiKey);
    const timeoutMs = Math.max(config.requestTimeoutMs, PORTAL_TIMEOUT_MS);
    async function json(method, path, body, binaryMime, extraHeaders = {}) {
        let response;
        try {
            response = await fetchImpl(`${base}${path}`, {
                method,
                headers: body === undefined ? headers : { ...headers, ...extraHeaders, 'content-type': binaryMime ?? 'application/json', ...(binaryMime ? { 'content-length': String(body.byteLength) } : {}) },
                body: body === undefined ? undefined : binaryMime ? body : JSON.stringify(body),
                redirect: 'error',
                signal: AbortSignal.timeout(timeoutMs),
            });
        }
        catch (error) {
            throw new PortalError(502, `portal unreachable (${base}${path}): ${error instanceof Error ? error.message : String(error)}`);
        }
        let envelope;
        try {
            envelope = (await response.json());
        }
        catch {
            throw new PortalError(response.status, `portal answered ${response.status} without a JSON body (${method} ${path}).`);
        }
        if (!envelope.success) {
            throw new PortalError(response.status, envelope.error ?? `request failed (${response.status})`, envelope.error_code, envelope.detail);
        }
        return { status: response.status, data: envelope.data };
    }
    async function text(path) {
        let response;
        try {
            response = await fetchImpl(`${base}${path}`, { headers, signal: AbortSignal.timeout(timeoutMs) });
        }
        catch (error) {
            throw new PortalError(502, `portal unreachable (${base}${path}): ${error instanceof Error ? error.message : String(error)}`);
        }
        if (!response.ok)
            throw new PortalError(response.status, `request failed (${response.status}): GET ${path}`);
        return response.text();
    }
    const withHolder = (path) => `${path}?holder=${encodeURIComponent(holder)}`;
    return {
        base,
        workspace: credential.workspace,
        source: credential.source,
        holder,
        me: () => json('GET', '/me'),
        listStoryboards: (query = {}) => {
            const sp = new URLSearchParams();
            for (const [k, v] of Object.entries(query))
                if (v !== undefined && v !== '')
                    sp.set(k, String(v));
            const qs = sp.toString();
            return json('GET', `/storyboards${qs ? `?${qs}` : ''}`);
        },
        listEpisodes: (storyboardId) => json('GET', `/storyboards/${storyboardId}/episodes`),
        getEpisode: (episodeId) => json('GET', `/episodes/${episodeId}`),
        // holder travels on every write — a lease held by another machine on the same key is still someone else's.
        updateEpisode: (episodeId, patch) => json('PATCH', withHolder(`/episodes/${episodeId}`), patch),
        importStoryboard: (payload) => json('POST', '/storyboards/import', payload),
        scenesJs: (episodeId, revision) => text(`/episodes/${episodeId}/scenes.js${revision ? `?revision=${revision}` : ''}`),
        document: (episodeId, filename) => text(`/episodes/${episodeId}/documents/${encodeURIComponent(filename)}`),
        createEpisode: (storyboardId, body) => json('POST', `/storyboards/${storyboardId}/episodes`, body),
        listRevisions: (episodeId) => json('GET', `/episodes/${episodeId}/revisions`),
        getRevision: (episodeId, no) => json('GET', `/episodes/${episodeId}/revisions/${no}`),
        revisionDiff: (episodeId, from, to) => json('GET', `/episodes/${episodeId}/revisions/${from}/diff/${to}`),
        renderAllocation: (episodeId, body) => json(body ? 'PUT' : 'GET', `/episodes/${episodeId}/render-allocation`, body ? { ...body, sourceHost: holder } : undefined),
        uploadImage: (episodeId, bytes, mime) => json('POST', withHolder(`/episodes/${episodeId}/images`), bytes, mime),
        listAttachments: (episodeId) => json('GET', `/episodes/${episodeId}/attachments`),
        uploadAttachment: (episodeId, relativePath, bytes, mime, provenance) => json('POST', `${withHolder(`/episodes/${episodeId}/attachments`)}&path=${encodeURIComponent(relativePath)}`, bytes, mime, provenance ? { 'x-attachment-provenance': encodeURIComponent(JSON.stringify(provenance)) } : {}),
        downloadAttachment: async (episodeId, id) => {
            const response = await fetchImpl(`${base}/episodes/${episodeId}/attachments/${id}`, { headers, redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
            if (!response.ok)
                throw new PortalError(response.status, 'Attachment download failed');
            const reader = response.body?.getReader();
            if (!reader)
                throw new Error('Attachment download has no body');
            const chunks = [];
            let size = 0;
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done)
                        break;
                    size += value.length;
                    if (size > 10 * 1024 * 1024)
                        throw new Error('Attachment exceeds 10 MiB');
                    chunks.push(value);
                }
            }
            finally {
                await reader.cancel().catch(() => { });
                reader.releaseLock();
            }
            return Buffer.concat(chunks);
        },
        checkpoint: (episodeId, body) => json('POST', `/episodes/${episodeId}/revisions`, body),
        restoreRevision: (episodeId, no, body = {}) => json('POST', `/episodes/${episodeId}/revisions/${no}/restore`, body),
        getLease: (episodeId) => json('GET', `/episodes/${episodeId}/lease`),
        acquireLease: (episodeId, body) => json('POST', `/episodes/${episodeId}/lease`, body),
        releaseLease: (episodeId, body) => json('DELETE', `/episodes/${episodeId}/lease`, body),
        listScenarios: (episodeId) => json('GET', `/episodes/${episodeId}/scenarios`),
        saveScenario: (episodeId, candidate, body) => json('PUT', `/episodes/${episodeId}/scenarios/${candidate}`, body),
        chooseScenario: (episodeId, candidate) => json('POST', withHolder(`/episodes/${episodeId}/scenarios/${candidate}/choose`)),
        scenarioMd: (episodeId, candidate) => text(`/episodes/${episodeId}/scenarios/${candidate}/scenario.md`),
        pageUrl: (relative) => `${root}${relative}`,
    };
}
/** One line for the tool result — status, message, and the 409 detail when the portal sent one. */
export function describePortalError(error) {
    if (error instanceof PortalError) {
        const head = `portal ${error.status}${error.code ? ` ${error.code}` : ''}: ${error.message}`;
        return error.detail === undefined ? head : `${head}\n${JSON.stringify(error.detail)}`;
    }
    return error instanceof Error ? error.message : String(error);
}
