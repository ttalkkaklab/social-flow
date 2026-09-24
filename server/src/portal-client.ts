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
import { hostname } from 'node:os';
import { config, portalCredential, type PortalCredential } from './config.js';

export class PortalError extends Error {
  status: number;
  code?: string;
  detail?: unknown;
  constructor(status: number, message: string, code?: string, detail?: unknown) {
    super(message);
    this.name = 'PortalError';
    this.status = status;
    if (code) this.code = code;
    if (detail !== undefined) this.detail = detail;
  }
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface PortalResponse<T = unknown> {
  status: number;
  data: T;
}

/** Lease/revision holder — `<key prefix>@<host>`; a human reads it as "who touched this last". */
export function defaultHolder(apiKey: string): string {
  return `${apiKey.slice(0, 8)}@${hostname()}`;
}

/** Portal timeout — a checkpoint carries a whole board (scenes + five documents); 15 s is too tight for a slow link. */
export const PORTAL_TIMEOUT_MS = 60_000;

export interface PortalClient {
  request(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<PortalResponse>;
  /** The workspace-scoped API base, e.g. https://story.example/api/workspaces/lab */
  base: string;
  workspace: string;
  resolvedBy: "file" | "token";
  source: string;
  holder: string;
  uploadMedia(episodeId: string, kind: string, bytes: Uint8Array, mime: string): Promise<PortalResponse<{ id: string; sha256: string; mime: string; byteSize: number; kind: string }>>;
  me(): Promise<PortalResponse>;
  listStoryboards(query?: Record<string, string | number | undefined>): Promise<PortalResponse>;
  listEpisodes(storyboardId: string): Promise<PortalResponse>;
  getEpisode(episodeId: string): Promise<PortalResponse<PortalEpisode>>;
  updateEpisode(episodeId: string, patch: Record<string, unknown>): Promise<PortalResponse>;
  updateArtifacts(episodeId: string, body: Record<string, unknown>): Promise<PortalResponse>;
  recordPublication(episodeId: string, body: Record<string, unknown>): Promise<PortalResponse>;
  importStoryboard(payload: unknown): Promise<PortalResponse<ImportResult>>;
  scenesJs(episodeId: string, revision?: number): Promise<string>;
  document(episodeId: string, filename: string): Promise<string>;
  createEpisode(storyboardId: string, body: Record<string, unknown>): Promise<PortalResponse<{ id: string; url: string }>>;
  listRevisions(episodeId: string): Promise<PortalResponse>;
  getRevision(episodeId: string, no: number): Promise<PortalResponse<PortalRevision>>;
  /** Two revisions compared — `to` is a number or 'head' (portal loop R3). */
  revisionDiff(episodeId: string, from: number, to: number | 'head'): Promise<PortalResponse<PortalRevisionDiff>>;
  renderAllocation(episodeId: string, body?: Record<string, unknown>): Promise<PortalResponse<Record<string, unknown>>>;
  uploadImage(episodeId: string, bytes: Uint8Array, mime: string): Promise<PortalResponse<PortalImage>>;
  listAttachments(episodeId: string): Promise<PortalResponse<{ items: PortalAttachment[] }>>;
  uploadAttachment(episodeId: string, relativePath: string, bytes: Uint8Array, mime: string, provenance?: Record<string, string>): Promise<PortalResponse<PortalAttachment>>;
  downloadAttachment(episodeId: string, id: string): Promise<Uint8Array>;
  checkpoint(episodeId: string, body: Record<string, unknown>): Promise<PortalResponse<{ revisionNo: number }>>;
  restoreRevision(episodeId: string, no: number, body?: Record<string, unknown>): Promise<PortalResponse<{ revisionNo: number }>>;
  getLease(episodeId: string): Promise<PortalResponse>;
  acquireLease(episodeId: string, body: Record<string, unknown>): Promise<PortalResponse>;
  releaseLease(episodeId: string, body: Record<string, unknown>): Promise<PortalResponse>;
  listScenarios(episodeId: string): Promise<PortalResponse<{ scenarios: PortalScenario[] }>>;
  saveScenario(episodeId: string, candidate: string, body: Record<string, unknown>): Promise<PortalResponse<PortalScenarioSaved>>;
  chooseScenario(episodeId: string, candidate: string): Promise<PortalResponse<PortalScenarioSaved>>;
  scenarioMd(episodeId: string, candidate: string): Promise<string>;
  pageUrl(relative: string): string;
  /** Global asset library (portal `/api/assets`, #87) — outside the workspace; any live key reads the same library. */
  assetsSearch(query: Record<string, string | number | undefined>): Promise<PortalResponse<PortalAssetPage>>;
  assetsGet(id: string): Promise<PortalResponse<PortalAsset>>;
  /** Stream one asset's bytes to `sink`; resolves with the byte count. `maxBytes` aborts an oversized body before it lands on disk. */
  assetsDownload(id: string, sink: (chunk: Uint8Array) => void, maxBytes: number): Promise<number>;
}

export interface PortalAsset {
  id: string; sha256: string; sourceId: string | null; type: 'video' | 'music' | 'sfx' | 'image';
  category: string | null; categoryKo: string | null; title: string | null; descKo: string; descEn: string | null;
  tagsKo: string[]; tagsEn: string[]; prompt: string | null; mime: string; byteSize: number;
  durationMs: number | null; width: number | null; height: number | null; aspect: string | null;
  extra: Record<string, unknown>; binary: { ready: boolean; storedAt: string | null };
  urls: { play: string; download: string }; createdAt: string; updatedAt: string;
}
export interface PortalAssetPage { items: PortalAsset[]; page: number; limit: number; total: number; hasNext: boolean }

export interface PortalAttachment {
  id: string; relativePath: string; sha256: string; byteSize: number; mime: string; provenance: Record<string, string>;
}

export interface PortalImage {
  id: string; sha256: string; mime: string; byteSize: number; created: boolean;
}

export interface PortalEpisode {
  id: string;
  slug: string;
  title: string;
  storyboardId: string;
  sceneCount?: number;
  stage?: string;
  headRevisionNo?: number;
  lease?: unknown;
  documents?: Array<{ filename: string }>;
  scenarios?: Array<{ candidate: string; chosen: boolean }>;
}

export interface ImportResult {
  storyboardId: string;
  episodeId: string;
  revisionNo: number;
  url: string;
  [key: string]: unknown;
}

export interface PortalRevision {
  revisionNo: number;
  documents?: Record<string, string>;
  [key: string]: unknown;
}

export interface PortalRevisionDiff {
  from: { revisionNo: number; stage?: string };
  to: { revisionNo: number; stage?: string };
  identical: boolean;
  scenes: { countA: number; countB: number; added: string[]; removed: string[]; changed: Array<{ key: string; fields: string[] }>; reordered: boolean };
  meta: { added: string[]; removed: string[]; changed: string[] };
  decisions?: { added: string[]; removed: string[]; changed: string[] };
  documents: Record<string, { status: 'same' | 'added' | 'removed' | 'changed'; unified?: string | null; truncated?: boolean; linesA?: number; linesB?: number }>;
}

export interface PortalScenario {
  candidate: string;
  chosen: boolean;
  markdown: string;
  findings: unknown[];
  meta?: { score?: number; p0?: number };
}

export interface PortalScenarioSaved {
  candidate: string;
  chosen: boolean;
  findings: unknown[];
  updatedAt?: string;
}

/** A filename the portal may hand back that is safe to write next to scenes.js — no path parts, not `.`/`..`. */
export const SAFE_DOCUMENT_NAME = /^(?!\.\.?$)[^/\\\0]+$/;

/**
 * Resolve the credential for a channel and build the client. `null` when nothing is
 * configured — the tool turns that into the one-line "no portal key" answer.
 */
type TokenWorkspace = { workspaceSlug: string; workspaceName: string; role: string };
// A process/session cache, isolated by transport and API origin/key. Rejected lookups are retriable.
const tokenWorkspaces = new WeakMap<FetchLike, Map<string, Promise<TokenWorkspace>>>();

async function resolveToken(credential: PortalCredential, fetchImpl: FetchLike): Promise<TokenWorkspace> {
  const root = credential.apiUrl.replace(/\/+$/, '');
  let cache = tokenWorkspaces.get(fetchImpl);
  if (!cache) { cache = new Map(); tokenWorkspaces.set(fetchImpl, cache); }
  const key = createHash('sha256').update(JSON.stringify([root, credential.apiKey])).digest('hex');
  let pending = cache.get(key);
  if (!pending) {
    pending = (async () => {
      let response: Response;
      try {
        response = await fetchImpl(`${root}/api/token`, {
          headers: { authorization: `Bearer ${credential.apiKey}` },
          redirect: 'error', signal: AbortSignal.timeout(Math.max(config.requestTimeoutMs, PORTAL_TIMEOUT_MS)),
        });
      } catch { throw new PortalError(502, 'Token workspace lookup failed. Check the portal URL and connection.'); }
      if (!response.ok) throw new PortalError(response.status, 'Token workspace lookup failed. Check the API key and portal deployment.');
      let envelope: { success?: boolean; data?: TokenWorkspace };
      try { envelope = await response.json() as typeof envelope; }
      catch { throw new PortalError(502, 'Token workspace lookup returned invalid JSON.'); }
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
    if (cache.size > 100) cache.delete(cache.keys().next().value!);
    pending.catch(() => { if (cache.get(key) === pending) cache.delete(key); });
  }
  return pending;
}

export async function portalClientFor(channel?: string, fetchImpl: FetchLike = fetch): Promise<PortalClient | null> {
  const credential = portalCredential(channel);
  if (!credential) return null;
  const token = await resolveToken(credential, fetchImpl);
  if (credential.workspace && credential.workspace !== token.workspaceSlug) {
    throw new PortalError(409, `Workspace mismatch — ${credential.source} specifies "${credential.workspace}", but the API key opens "${token.workspaceSlug}". Fix the credential file or environment. Nothing was sent to a workspace.`);
  }
  return createPortalClient({ ...credential, workspace: token.workspaceSlug }, fetchImpl, credential.workspace ? 'file' : 'token');
}

export function createPortalClient(credential: PortalCredential & { workspace: string }, fetchImpl: FetchLike = fetch, resolvedBy: 'file' | 'token' = 'file'): PortalClient {
  const root = credential.apiUrl.replace(/\/+$/, '');
  const base = `${root}/api/workspaces/${encodeURIComponent(credential.workspace)}`;
  const headers: Record<string, string> = { authorization: `Bearer ${credential.apiKey}` };
  const holder = credential.holder || defaultHolder(credential.apiKey);
  const timeoutMs = Math.max(config.requestTimeoutMs, PORTAL_TIMEOUT_MS);

  async function json<T = unknown>(method: string, path: string, body?: unknown, binaryMime?: string, extraHeaders: Record<string, string> = {}, origin: string = base): Promise<PortalResponse<T>> {
    let response: Response;
    try {
      response = await fetchImpl(`${origin}${path}`, {
        method,
        headers: body === undefined ? headers : { ...headers, ...extraHeaders, 'content-type': binaryMime ?? 'application/json', ...(binaryMime ? { 'content-length': String((body as Uint8Array).byteLength) } : {}) },
        body: body === undefined ? undefined : binaryMime ? body as BodyInit : JSON.stringify(body),
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new PortalError(502, `portal unreachable (${origin}${path}): ${error instanceof Error ? error.message : String(error)}`);
    }
    let envelope: { success?: boolean; data?: T; error?: string; error_code?: string; detail?: unknown };
    try {
      envelope = (await response.json()) as typeof envelope;
    } catch {
      throw new PortalError(response.status, `portal answered ${response.status} without a JSON body (${method} ${path}).`);
    }
    if (!envelope.success) {
      throw new PortalError(
        response.status,
        envelope.error ?? `request failed (${response.status})`,
        envelope.error_code,
        envelope.detail,
      );
    }
    return { status: response.status, data: envelope.data as T };
  }

  async function text(path: string): Promise<string> {
    let response: Response;
    try {
      response = await fetchImpl(`${base}${path}`, { headers, signal: AbortSignal.timeout(timeoutMs) });
    } catch (error) {
      throw new PortalError(502, `portal unreachable (${base}${path}): ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!response.ok) throw new PortalError(response.status, `request failed (${response.status}): GET ${path}`);
    return response.text();
  }

  const withHolder = (path: string): string => `${path}?holder=${encodeURIComponent(holder)}`;

  return {
    request: (method, path, body) => json(method, `${path}${path.includes('?') ? '&' : '?'}holder=${encodeURIComponent(holder)}`, body),
    base,
    workspace: credential.workspace,
    resolvedBy,
    source: credential.source,
    holder,
    uploadMedia: (episodeId, kind, bytes, mime) => json('POST', `${withHolder(`/episodes/${episodeId}/media`)}&kind=${encodeURIComponent(kind)}`, bytes, mime),
    me: () => json('GET', '/me'),
    listStoryboards: (query = {}) => {
      const sp = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== '') sp.set(k, String(v));
      const qs = sp.toString();
      return json('GET', `/storyboards${qs ? `?${qs}` : ''}`);
    },
    listEpisodes: (storyboardId) => json('GET', `/storyboards/${storyboardId}/episodes`),
    getEpisode: (episodeId) => json<PortalEpisode>('GET', `/episodes/${episodeId}`),
    // holder travels on every write — a lease held by another machine on the same key is still someone else's.
    updateEpisode: (episodeId, patch) => json('PATCH', withHolder(`/episodes/${episodeId}`), patch),
    updateArtifacts: (episodeId, body) => json('PUT', withHolder(`/episodes/${episodeId}/artifacts`), body),
    recordPublication: (episodeId, body) => json('POST', withHolder(`/episodes/${episodeId}/publications`), body),
    importStoryboard: (payload) => json<ImportResult>('POST', '/storyboards/import', payload),
    scenesJs: (episodeId, revision) => text(`/episodes/${episodeId}/scenes.js${revision ? `?revision=${revision}` : ''}`),
    document: (episodeId, filename) => text(`/episodes/${episodeId}/documents/${encodeURIComponent(filename)}`),
    createEpisode: (storyboardId, body) => json<{ id: string; url: string }>('POST', `/storyboards/${storyboardId}/episodes`, body),
    listRevisions: (episodeId) => json('GET', `/episodes/${episodeId}/revisions`),
    getRevision: (episodeId, no) => json<PortalRevision>('GET', `/episodes/${episodeId}/revisions/${no}`),
    revisionDiff: (episodeId, from, to) => json<PortalRevisionDiff>('GET', `/episodes/${episodeId}/revisions/${from}/diff/${to}`),
    renderAllocation: (episodeId, body) => json(body ? 'PUT' : 'GET', `/episodes/${episodeId}/render-allocation`, body ? { ...body, sourceHost: holder } : undefined),
    uploadImage: (episodeId, bytes, mime) => json<PortalImage>('POST', withHolder(`/episodes/${episodeId}/images`), bytes, mime),
    listAttachments: (episodeId) => json('GET', `/episodes/${episodeId}/attachments`),
    uploadAttachment: (episodeId, relativePath, bytes, mime, provenance) => json('POST', `${withHolder(`/episodes/${episodeId}/attachments`)}&path=${encodeURIComponent(relativePath)}`, bytes, mime, provenance ? { 'x-attachment-provenance': encodeURIComponent(JSON.stringify(provenance)) } : {}),
    downloadAttachment: async (episodeId, id) => {
      const response = await fetchImpl(`${base}/episodes/${episodeId}/attachments/${id}`, { headers, redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
      if (!response.ok) throw new PortalError(response.status, 'Attachment download failed');
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Attachment download has no body');
      const chunks: Uint8Array[] = []; let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 10 * 1024 * 1024) throw new Error('Attachment exceeds 10 MiB');
          chunks.push(value);
        }
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
      return Buffer.concat(chunks);
    },
    checkpoint: (episodeId, body) => json<{ revisionNo: number }>('POST', `/episodes/${episodeId}/revisions`, body),
    restoreRevision: (episodeId, no, body = {}) =>
      json<{ revisionNo: number }>('POST', `/episodes/${episodeId}/revisions/${no}/restore`, body),
    getLease: (episodeId) => json('GET', `/episodes/${episodeId}/lease`),
    acquireLease: (episodeId, body) => json('POST', `/episodes/${episodeId}/lease`, body),
    releaseLease: (episodeId, body) => json('DELETE', `/episodes/${episodeId}/lease`, body),
    listScenarios: (episodeId) => json<{ scenarios: PortalScenario[] }>('GET', `/episodes/${episodeId}/scenarios`),
    saveScenario: (episodeId, candidate, body) =>
      json<PortalScenarioSaved>('PUT', `/episodes/${episodeId}/scenarios/${candidate}`, body),
    chooseScenario: (episodeId, candidate) =>
      json<PortalScenarioSaved>('POST', withHolder(`/episodes/${episodeId}/scenarios/${candidate}/choose`)),
    scenarioMd: (episodeId, candidate) => text(`/episodes/${episodeId}/scenarios/${candidate}/scenario.md`),
    pageUrl: (relative) => `${root}${relative}`,
    assetsSearch: (query) => {
      const sp = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== '') sp.set(k, String(v));
      const qs = sp.toString();
      return json<PortalAssetPage>('GET', `/api/assets${qs ? `?${qs}` : ''}`, undefined, undefined, {}, root);
    },
    assetsGet: (id) => json<PortalAsset>('GET', `/api/assets/${encodeURIComponent(id)}`, undefined, undefined, {}, root),
    assetsDownload: async (id, sink, maxBytes) => {
      let response: Response;
      try {
        response = await fetchImpl(`${root}/api/assets/${encodeURIComponent(id)}/binary`, { headers, redirect: 'error', signal: AbortSignal.timeout(timeoutMs * 5) });
      } catch (error) {
        throw new PortalError(502, `portal unreachable (asset ${id}): ${error instanceof Error ? error.message : String(error)}`);
      }
      if (!response.ok) {
        let code: string | undefined;
        try { code = ((await response.json()) as { error_code?: string }).error_code; } catch { /* no envelope on a binary route failure */ }
        throw new PortalError(response.status, 'Asset download failed', code);
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Asset download has no body');
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > maxBytes) throw new Error(`Asset exceeds ${maxBytes} bytes`);
          sink(value);
        }
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
      return size;
    },
  };
}

/** One line for the tool result — status, message, and the 409 detail when the portal sent one. */
export function describePortalError(error: unknown): string {
  if (error instanceof PortalError) {
    const head = `portal ${error.status}${error.code ? ` ${error.code}` : ''}: ${error.message}`;
    const detail = error.detail === undefined ? head : `${head}\n${JSON.stringify(error.detail)}`;
    return error.status === 409 && error.code === 'leased'
      ? `${detail}\nUse portal_episode_lease with action:"status" for this episode. Wait for its holder to release or expire, then read and reconcile before writing. Unit tools do not acquire or release leases automatically.`
      : detail;
  }
  return error instanceof Error ? error.message : String(error);
}
