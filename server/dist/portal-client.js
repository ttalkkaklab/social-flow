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
import { createHash } from 'node:crypto';
import { closeSync, openSync, unlinkSync, writeSync } from 'node:fs';
import { hostname } from 'node:os';
import path from 'node:path';
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
const PORTAL_MAX_TRANSFER_BYTES = 100 * 1024 * 1024;
/** A filename the portal may hand back that is safe to write next to scenes.js — no path parts, not `.`/`..`. */
export const SAFE_DOCUMENT_NAME = /^(?!\.\.?$)[^/\\\0]+$/;
// A process/session cache, isolated by transport and API origin/key. Rejected lookups are retriable.
const tokenWorkspaces = new WeakMap();
async function resolveToken(credential, fetchImpl) {
    const root = credential.apiUrl.replace(/\/+$/, '');
    let cache = tokenWorkspaces.get(fetchImpl);
    if (!cache) {
        cache = new Map();
        tokenWorkspaces.set(fetchImpl, cache);
    }
    const key = createHash('sha256').update(JSON.stringify([root, credential.apiKey])).digest('hex');
    let pending = cache.get(key);
    if (!pending) {
        pending = (async () => {
            let response;
            try {
                response = await fetchImpl(`${root}/api/token`, {
                    headers: { authorization: `Bearer ${credential.apiKey}` },
                    redirect: 'error', signal: AbortSignal.timeout(Math.max(config.requestTimeoutMs, PORTAL_TIMEOUT_MS)),
                });
            }
            catch {
                throw new PortalError(502, 'Token workspace lookup failed. Check the portal URL and connection.');
            }
            if (!response.ok)
                throw new PortalError(response.status, 'Token workspace lookup failed. Check the API key and portal deployment.');
            let envelope;
            try {
                envelope = await response.json();
            }
            catch {
                throw new PortalError(502, 'Token workspace lookup returned invalid JSON.');
            }
            const data = envelope?.data;
            if (!envelope?.success || !data || typeof data.workspaceSlug !== 'string' ||
                !/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(data.workspaceSlug) ||
                typeof data.workspaceName !== 'string' || data.role !== 'member') {
                throw new PortalError(502, 'Token workspace lookup returned an invalid workspace.');
            }
            return data;
        })();
        cache.set(key, pending);
        // Bound long-lived servers that see frequent key rotations.
        if (cache.size > 100)
            cache.delete(cache.keys().next().value);
        pending.catch(() => { if (cache.get(key) === pending)
            cache.delete(key); });
    }
    return pending;
}
export async function portalClientFor(channel, fetchImpl = fetch) {
    const credential = portalCredential(channel);
    if (!credential)
        return null;
    const token = await resolveToken(credential, fetchImpl);
    if (credential.workspace && credential.workspace !== token.workspaceSlug) {
        throw new PortalError(409, `Workspace mismatch — ${credential.source} specifies "${credential.workspace}", but the API key opens "${token.workspaceSlug}". Fix the credential file or environment. Nothing was sent to a workspace.`);
    }
    return createPortalClient({ ...credential, workspace: token.workspaceSlug }, fetchImpl, credential.workspace ? 'file' : 'token');
}
export function createPortalClient(credential, fetchImpl = fetch, resolvedBy = 'file') {
    const root = credential.apiUrl.replace(/\/+$/, '');
    const base = `${root}/api/workspaces/${encodeURIComponent(credential.workspace)}`;
    const headers = { authorization: `Bearer ${credential.apiKey}` };
    const holder = credential.holder || defaultHolder(credential.apiKey);
    const timeoutMs = Math.max(config.requestTimeoutMs, PORTAL_TIMEOUT_MS);
    async function json(method, path, body, binaryMime, extraHeaders = {}, origin = base) {
        let response;
        try {
            response = await fetchImpl(`${origin}${path}`, {
                method,
                headers: body === undefined ? headers : { ...headers, ...extraHeaders, 'content-type': binaryMime ?? 'application/json', ...(binaryMime ? { 'content-length': String(body.byteLength) } : {}) },
                body: body === undefined ? undefined : binaryMime ? body : JSON.stringify(body),
                redirect: 'error',
                signal: AbortSignal.timeout(timeoutMs),
            });
        }
        catch (error) {
            throw new PortalError(502, `portal unreachable (${origin}${path}): ${error instanceof Error ? error.message : String(error)}`);
        }
        if (response.status === 204 || response.status === 304)
            return { status: response.status, data: null };
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
    const responseHeaders = (response) => {
        const result = {};
        response.headers.forEach((value, key) => { result[key] = value; });
        return result;
    };
    async function raw(request) {
        const origin = request.scope === 'global' ? root : base;
        const binaryBytes = request.body instanceof Uint8Array ? request.body : undefined;
        const binaryBody = binaryBytes !== undefined;
        if (request.response === 'json') {
            return json(request.method, request.path, request.body, binaryBody ? request.contentType : undefined, request.headers, origin);
        }
        let response;
        try {
            response = await fetchImpl(`${origin}${request.path}`, {
                method: request.method,
                headers: {
                    ...headers,
                    ...request.headers,
                    ...(request.body === undefined ? {} : {
                        'content-type': request.contentType ?? (binaryBody ? 'application/octet-stream' : 'application/json'),
                    }),
                    ...(binaryBytes ? { 'content-length': String(binaryBytes.byteLength) } : {}),
                },
                body: request.body === undefined
                    ? undefined
                    : binaryBytes
                        ? binaryBytes
                        : JSON.stringify(request.body),
                redirect: 'error',
                signal: AbortSignal.timeout(timeoutMs * (request.response === 'binary' ? 5 : 1)),
            });
        }
        catch (error) {
            throw new PortalError(502, `portal unreachable (${origin}${request.path}): ${error instanceof Error ? error.message : String(error)}`);
        }
        if (response.status === 204 || response.status === 304)
            return { status: response.status, data: null };
        if (!response.ok) {
            let envelope = {};
            try {
                envelope = await response.json();
            }
            catch { /* binary/text failures may have no JSON body */ }
            throw new PortalError(response.status, envelope.error ?? `request failed (${response.status})`, envelope.error_code, envelope.detail);
        }
        const metadata = responseHeaders(response);
        if (request.response === 'text')
            return { status: response.status, data: await response.text() };
        if (request.method === 'HEAD')
            return { status: response.status, data: { headers: metadata } };
        if (!request.targetFile || !path.isAbsolute(request.targetFile)) {
            throw new Error('A binary GET requires targetFile as an absolute local path.');
        }
        let fd;
        try {
            fd = openSync(request.targetFile, 'wx');
        }
        catch (error) {
            await response.body?.cancel().catch(() => { });
            throw error;
        }
        const reader = response.body?.getReader();
        if (!reader) {
            closeSync(fd);
            unlinkSync(request.targetFile);
            throw new Error('Portal binary response has no body.');
        }
        let bytes = 0;
        let failed = false;
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                bytes += value.byteLength;
                if (bytes > PORTAL_MAX_TRANSFER_BYTES)
                    throw new Error('Portal download exceeds 100 MiB.');
                writeSync(fd, value);
            }
        }
        catch (error) {
            failed = true;
            throw error;
        }
        finally {
            await reader.cancel().catch(() => { });
            reader.releaseLock();
            closeSync(fd);
            if (failed)
                unlinkSync(request.targetFile);
        }
        return { status: response.status, data: { targetFile: request.targetFile, byteSize: bytes, headers: metadata } };
    }
    const withHolder = (path) => `${path}?holder=${encodeURIComponent(holder)}`;
    return {
        request: (method, path, body) => json(method, `${path}${path.includes('?') ? '&' : '?'}holder=${encodeURIComponent(holder)}`, body),
        requestRaw: raw,
        base,
        workspace: credential.workspace,
        resolvedBy,
        source: credential.source,
        holder,
        uploadMedia: (episodeId, kind, bytes, mime) => json('POST', `${withHolder(`/episodes/${episodeId}/media`)}&kind=${encodeURIComponent(kind)}`, bytes, mime),
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
        updateArtifacts: (episodeId, body) => json('PUT', withHolder(`/episodes/${episodeId}/artifacts`), body),
        recordPublication: (episodeId, body) => json('POST', withHolder(`/episodes/${episodeId}/publications`), body),
        importStoryboard: (payload) => json('POST', '/storyboards/import', payload),
        scenesJs: (episodeId, revision) => text(`/episodes/${episodeId}/scenes.js${revision ? `?revision=${revision}` : ''}`),
        document: (episodeId, filename) => text(`/episodes/${episodeId}/documents/${encodeURIComponent(filename)}`),
        createEpisode: (storyboardId, body) => json('POST', `/storyboards/${storyboardId}/episodes`, body),
        listRevisions: (episodeId) => json('GET', `/episodes/${episodeId}/revisions`),
        getRevision: (episodeId, no) => json('GET', `/episodes/${episodeId}/revisions/${no}`),
        revisionDiff: (episodeId, from, to) => json('GET', `/episodes/${episodeId}/revisions/${from}/diff/${to}`),
        renderAllocation: (episodeId, body) => json(body ? 'PUT' : 'GET', `/episodes/${episodeId}/render-allocation`, body ? { ...body, sourceHost: holder } : undefined),
        uploadImage: (episodeId, bytes, mime) => json('POST', withHolder(`/episodes/${episodeId}/images`), bytes, mime),
        listCharacters: (query = {}) => {
            const sp = new URLSearchParams();
            for (const [k, v] of Object.entries(query))
                if (v !== undefined && v !== '')
                    sp.set(k, String(v));
            const qs = sp.toString();
            return json('GET', `/characters${qs ? `?${qs}` : ''}`);
        },
        getCharacter: (id) => json('GET', `/characters/${id}`),
        createCharacter: (body) => json('POST', '/characters', body),
        updateCharacter: (id, patch) => json('PATCH', `/characters/${id}`, patch),
        deleteCharacter: (id) => json('DELETE', `/characters/${id}`),
        uploadCharacterImage: (id, bytes, mime, view, label, sort) => {
            const query = new URLSearchParams();
            if (label !== undefined)
                query.set('label', label);
            if (sort !== undefined)
                query.set('sort', String(sort));
            const suffix = query.size ? `?${query}` : '';
            return json(view === 'extra' ? 'POST' : 'PUT', `/characters/${id}/${view ? `images/${view}` : 'image'}${suffix}`, bytes, mime);
        },
        deleteCharacterExtraImage: (id, imageId) => json('DELETE', `/characters/${id}/images/extra/${imageId}`),
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
        assetsSearch: (query) => {
            const sp = new URLSearchParams();
            for (const [k, v] of Object.entries(query))
                if (v !== undefined && v !== '')
                    sp.set(k, String(v));
            const qs = sp.toString();
            return json('GET', `/api/assets${qs ? `?${qs}` : ''}`, undefined, undefined, {}, root);
        },
        assetsGet: (id) => json('GET', `/api/assets/${encodeURIComponent(id)}`, undefined, undefined, {}, root),
        assetsDownload: async (id, sink, maxBytes) => {
            let response;
            try {
                response = await fetchImpl(`${root}/api/assets/${encodeURIComponent(id)}/binary`, { headers, redirect: 'error', signal: AbortSignal.timeout(timeoutMs * 5) });
            }
            catch (error) {
                throw new PortalError(502, `portal unreachable (asset ${id}): ${error instanceof Error ? error.message : String(error)}`);
            }
            if (!response.ok) {
                let code;
                try {
                    code = (await response.json()).error_code;
                }
                catch { /* no envelope on a binary route failure */ }
                throw new PortalError(response.status, 'Asset download failed', code);
            }
            const reader = response.body?.getReader();
            if (!reader)
                throw new Error('Asset download has no body');
            let size = 0;
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done)
                        break;
                    size += value.length;
                    if (size > maxBytes)
                        throw new Error(`Asset exceeds ${maxBytes} bytes`);
                    sink(value);
                }
            }
            finally {
                await reader.cancel().catch(() => { });
                reader.releaseLock();
            }
            return size;
        },
    };
}
/** One line for the tool result — status, message, and the 409 detail when the portal sent one. */
export function describePortalError(error) {
    if (error instanceof PortalError) {
        const head = `portal ${error.status}${error.code ? ` ${error.code}` : ''}: ${error.message}`;
        const detail = error.detail === undefined ? head : `${head}\n${JSON.stringify(error.detail)}`;
        return error.status === 409 && error.code === 'leased'
            ? `${detail}\nUse portal_episode_lease with action:"status" for this episode. Wait for its holder to release or expire, then read and reconcile before writing. Unit tools do not acquire or release leases automatically.`
            : detail;
    }
    return error instanceof Error ? error.message : String(error);
}
