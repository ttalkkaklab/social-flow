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
  /** The workspace-scoped API base, e.g. https://story.example/api/workspaces/lab */
  base: string;
  workspace: string;
  source: string;
  holder: string;
  me(): Promise<PortalResponse>;
  listStoryboards(query?: Record<string, string | number | undefined>): Promise<PortalResponse>;
  listEpisodes(storyboardId: string): Promise<PortalResponse>;
  getEpisode(episodeId: string): Promise<PortalResponse<PortalEpisode>>;
  updateEpisode(episodeId: string, patch: Record<string, unknown>): Promise<PortalResponse>;
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
}

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
export function portalClientFor(channel?: string, fetchImpl?: FetchLike): PortalClient | null {
  const credential = portalCredential(channel);
  if (!credential) return null;
  return createPortalClient(credential, fetchImpl);
}

export function createPortalClient(credential: PortalCredential, fetchImpl: FetchLike = fetch): PortalClient {
  const root = credential.apiUrl.replace(/\/+$/, '');
  const base = `${root}/api/workspaces/${encodeURIComponent(credential.workspace)}`;
  const headers: Record<string, string> = { authorization: `Bearer ${credential.apiKey}` };
  const holder = credential.holder || defaultHolder(credential.apiKey);
  const timeoutMs = Math.max(config.requestTimeoutMs, PORTAL_TIMEOUT_MS);

  async function json<T = unknown>(method: string, path: string, body?: unknown, binaryMime?: string, extraHeaders: Record<string, string> = {}): Promise<PortalResponse<T>> {
    let response: Response;
    try {
      response = await fetchImpl(`${base}${path}`, {
        method,
        headers: body === undefined ? headers : { ...headers, ...extraHeaders, 'content-type': binaryMime ?? 'application/json', ...(binaryMime ? { 'content-length': String((body as Uint8Array).byteLength) } : {}) },
        body: body === undefined ? undefined : binaryMime ? body as BodyInit : JSON.stringify(body),
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new PortalError(502, `portal unreachable (${base}${path}): ${error instanceof Error ? error.message : String(error)}`);
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
    base,
    workspace: credential.workspace,
    source: credential.source,
    holder,
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
  };
}

/** One line for the tool result — status, message, and the 409 detail when the portal sent one. */
export function describePortalError(error: unknown): string {
  if (error instanceof PortalError) {
    const head = `portal ${error.status}${error.code ? ` ${error.code}` : ''}: ${error.message}`;
    return error.detail === undefined ? head : `${head}\n${JSON.stringify(error.detail)}`;
  }
  return error instanceof Error ? error.message : String(error);
}
