/**
 * `portal_*` tool handlers — the ttalkkakstory portal called by workspace API key.
 *
 * One tool = one portal route, plus the file reads and writes around it. The tools take an
 * episode directory wherever they can and read the channel (and so the key) off its path —
 * `data/<channel>/episodes/<topic>`; the ones with no directory take an optional `channel`.
 * Every write travels with the holder (`<key prefix>@<host>`), so the portal can tell two
 * machines on one key apart when a lease is held.
 *
 * Nothing here is a gate: when no key is configured the handler answers one line
 * (`portalUnavailable`) and the skill carries on in local-file mode.
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { imageUploadSchema, uploadEpisodeImages } from './portal-images.js';
export { imageUploadSchema } from './portal-images.js';
import { portalCredentialFile, PORTAL_CREDENTIAL_FILENAME } from './config.js';
import { describePortalError, PortalError, portalClientFor, SAFE_DOCUMENT_NAME, type FetchLike, type PortalClient, type PortalRevisionDiff } from './portal-client.js';
import {
  buildImportPayload,
  channelOfEpisodeDir,
  DOCUMENT_FILES,
  EPISODE_STAGES,
  EPISODE_STATUSES,
  episodeDirOf,
  readDocuments,
  readPortalState,
  SCENARIO_CANDIDATES,
  writePortalState,
} from './portal-episode.js';

export const PORTAL_TOOL_NAMES = [
  'portal_images_upload',
  'portal_workspace_check',
  'portal_storyboard_save',
  'portal_storyboard_list',
  'portal_storyboard_pull',
  'portal_episode_status',
  'portal_episode_create',
  'portal_episode_checkpoint',
  'portal_episode_revisions',
  'portal_episode_restore',
  'portal_episode_lease',
  'portal_scenario_save',
  'portal_scenario_pull',
  'portal_scenario_choose',
  'portal_render_allocation',
] as const;

const channelArg = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/, 'kebab-case channel slug').optional();
const uuid = z.string().uuid();
const stage = z.enum(EPISODE_STAGES);
const candidate = z.enum(SCENARIO_CANDIDATES);

export const renderAllocationSchema = z.object({
  episodeId: uuid.optional(), episodeDir: z.string().optional(), channel: channelArg,
  requestId: uuid.optional(), baseRevisionNo: z.number().int().min(0).optional(),
  assignments: z.array(z.object({ id: uuid,
    mode: z.enum(['still_camera','character_html','object_html','data_graph','generated_video','editorial_html','stock_video']),
    purpose: z.string().trim().min(1).max(200), reason: z.string().trim().min(1).max(2000),
  })).min(1).max(500).optional(),
}).refine(a => !a.assignments || (a.requestId && a.baseRevisionNo !== undefined), 'Submitting requires requestId and baseRevisionNo from the latest read');

export const workspaceCheckSchema = z.object({ channel: channelArg, episodeDir: z.string().optional() });
export const storyboardSaveSchema = z.object({
  episodeDir: z.string().min(1),
  project: z.string().min(1).optional(),
  storyboardTitle: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  stage: stage.optional(),
  baseRevisionNo: z.number().int().min(0).optional(),
  note: z.string().max(500).optional(),
});
export const storyboardListSchema = z.object({
  channel: channelArg,
  storyboardId: uuid.optional(),
  query: z.string().optional(),
  projectId: uuid.optional(),
  page: z.number().int().min(1).optional(),
});
export const storyboardPullSchema = z.object({
  episodeId: uuid,
  targetDir: z.string().min(1),
  includeDocuments: z.boolean().optional(),
  revision: z.number().int().min(1).optional(),
  mode: z.enum(['replace', 'side']).optional(),
});
export const episodeStatusSchema = z.object({
  episodeId: uuid.optional(),
  episodeDir: z.string().optional(),
  channel: channelArg,
  status: z.enum(EPISODE_STATUSES).optional(),
  stage: stage.optional(),
  title: z.string().min(1).max(200).optional(),
});
export const episodeCreateSchema = z.object({
  storyboardId: uuid,
  slug: z.string().min(1).max(120),
  title: z.string().min(1).max(200),
  format: z.enum(['shorts-9x16', 'youtube-long-16x9']).optional(),
  stage: stage.optional(),
  sourceChannelSlug: z.string().max(120).optional(),
  episodeDir: z.string().optional(),
  channel: channelArg,
});
export const episodeCheckpointSchema = z.object({
  stage,
  episodeId: uuid.optional(),
  episodeDir: z.string().optional(),
  channel: channelArg,
  baseRevisionNo: z.number().int().min(0).optional(),
  note: z.string().max(500).optional(),
  documents: z.array(z.string()).optional(),
});
export const episodeRevisionsSchema = z.object({
  episodeId: uuid.optional(),
  episodeDir: z.string().optional(),
  channel: channelArg,
  revisionNo: z.number().int().min(1).optional(),
  compareTo: z.union([z.number().int().min(1), z.literal('head')]).optional(),
});
export const episodeRestoreSchema = z.object({
  revisionNo: z.number().int().min(1),
  episodeId: uuid.optional(),
  episodeDir: z.string().optional(),
  channel: channelArg,
  note: z.string().max(500).optional(),
});
export const episodeLeaseSchema = z.object({
  action: z.enum(['acquire', 'release', 'status']),
  episodeId: uuid.optional(),
  episodeDir: z.string().optional(),
  channel: channelArg,
  ttlMinutes: z.number().int().min(1).max(1440).optional(),
  force: z.boolean().optional(),
});
export const scenarioSaveSchema = z.object({
  candidate,
  file: z.string().optional(),
  markdown: z.string().optional(),
  chosen: z.boolean().optional(),
  episodeId: uuid.optional(),
  episodeDir: z.string().optional(),
  channel: channelArg,
});
export const scenarioPullSchema = z.object({
  targetDir: z.string().optional(),
  candidate: candidate.optional(),
  episodeId: uuid.optional(),
  episodeDir: z.string().optional(),
  channel: channelArg,
});
export const scenarioChooseSchema = z.object({
  candidate,
  episodeId: uuid.optional(),
  episodeDir: z.string().optional(),
  channel: channelArg,
});

export interface PortalToolResult {
  text: string;
  isError: boolean;
}

const ok = (payload: unknown): PortalToolResult => ({ text: JSON.stringify(payload, null, 2), isError: false });
const failed = (error: unknown): PortalToolResult => ({ text: describePortalError(error), isError: true });

/** One line a skill reads before deciding what to re-apply — "scenes +1 −0 ~2(3·5) · documents script.md changed". */
export function summarizeRevisionDiff(d: PortalRevisionDiff): string {
  if (d.identical) return `#${d.from.revisionNo} and #${d.to.revisionNo} have the same content.`;
  const parts: string[] = [];
  const s = d.scenes;
  const keys = s.changed.map((c) => `${c.key}[${c.fields.join(',')}]`);
  parts.push(
    `scenes +${s.added.length} −${s.removed.length} ~${s.changed.length}` +
      (keys.length ? ` (${keys.slice(0, 8).join(' · ')}${keys.length > 8 ? ' …' : ''})` : '') +
      (s.added.length ? ` added ${s.added.slice(0, 8).join('·')}` : '') +
      (s.removed.length ? ` removed ${s.removed.slice(0, 8).join('·')}` : '') +
      (s.reordered ? ' reordered' : ''),
  );
  const meta = [...d.meta.added.map((k) => `+${k}`), ...d.meta.removed.map((k) => `−${k}`), ...d.meta.changed.map((k) => `~${k}`)];
  if (meta.length) parts.push(`meta ${meta.join(' ')}`);
  const docs = Object.entries(d.documents)
    .filter(([, c]) => c.status !== 'same')
    .map(([name, c]) => `${name} ${c.status}`);
  if (docs.length) parts.push(`documents ${docs.join(', ')}`);
  return parts.join(' · ');
}

/**
 * A 409 head_moved answered to a write that carried a base: fetch what the *other* side changed
 * between that base and the portal's head and put it under the error (loop R3). It is the remote
 * change list, not a to-do list — the local edits since the base are all re-applied on the pulled
 * head, and the list only says where the two sides touched the same shot or document (review P1:
 * "re-apply only what it names" would drop the local edits it does not name). Any failure to
 * fetch the diff leaves the original 409 text alone — the diff is help, not a second gate.
 */
async function withHeadMovedDiff(client: PortalClient, episodeId: string, base: number | undefined, error: unknown): Promise<PortalToolResult> {
  const result = failed(error);
  if (!(error instanceof PortalError) || error.code !== 'head_moved' || base === undefined) return result;
  const head = (error.detail as { head?: { revisionNo?: number } } | undefined)?.head?.revisionNo;
  if (typeof head !== 'number' || head < 1 || head === base) return result;
  try {
    const { data } = await client.revisionDiff(episodeId, base, head);
    return {
      isError: true,
      text:
        `${result.text}\nWhat the other side changed since your base #${base} (portal head is now #${head}): ${summarizeRevisionDiff(data)}\n` +
        `Keep your local edits: copy the directory aside, portal_storyboard_pull the head, then re-apply ALL of your changes since #${base} on it — ` +
        `the list above is where both sides touched the same shot or document, so resolve those by hand (ask the user if unsure). ` +
        `The list is cut at 8 items; portal_episode_revisions compareTo gives the full diff.`,
    };
  } catch {
    return result;
  }
}

/** The one line a skill reads to fall back to local-file mode — where a key would go, and how to get one. */
export function portalUnavailable(channel?: string): string {
  const where = channel ? `${portalCredentialFile(channel)} (or ${portalCredentialFile()})` : portalCredentialFile();
  return (
    `No ttalkkakstory portal key configured — the episode stays a local file. ` +
    `To mirror it, issue a workspace API key on the portal (/{workspace}/settings/api-keys) and save it as ${where} ` +
    `as { "apiUrl", "workspace", "apiKey" } (${PORTAL_CREDENTIAL_FILENAME}), or set TTALKKAKSTORY_API_URL · TTALKKAKSTORY_WORKSPACE · TTALKKAKSTORY_API_KEY.`
  );
}

/** Channel argument first, then the episode directory's path. */
function channelFor(explicit: string | undefined, ...dirs: Array<string | undefined>): string | undefined {
  if (explicit) return explicit;
  for (const dir of dirs) {
    const channel = channelOfEpisodeDir(dir);
    if (channel) return channel;
  }
  return undefined;
}

type ClientResolution = { client: PortalClient; channel?: string } | { error: PortalToolResult };

function resolveClient(fetchImpl: FetchLike | undefined, explicit: string | undefined, ...dirs: Array<string | undefined>): ClientResolution {
  const channel = channelFor(explicit, ...dirs);
  let client: PortalClient | null;
  try {
    client = portalClientFor(channel, fetchImpl);
  } catch (error) {
    return { error: failed(error) };
  }
  if (!client) return { error: { text: portalUnavailable(channel), isError: true } };
  return { client, channel };
}

/**
 * The directory's `.portal.json` names the workspace it is a copy of. A write with a key for
 * another workspace would not fail — the portal would create a second, unrelated episode
 * there and the topic would fork silently (loop R1). So every tool that writes, or that
 * overwrites the directory, refuses when the two differ; a directory with no record passes.
 */
export function workspaceMismatch(client: PortalClient, dir: string | undefined): string | null {
  if (!dir) return null;
  const recorded = readPortalState(dir)?.workspace;
  if (!recorded || recorded === client.workspace) return null;
  return (
    `Workspace mismatch — ${episodeDirOf(dir)}/.portal.json says this directory is a copy of workspace "${recorded}", ` +
    `but the key in use (${client.source}) opens workspace "${client.workspace}". Nothing was sent. ` +
    `Fix the key file for this channel, or — to start the topic over in "${client.workspace}" — delete .portal.json first.`
  );
}

function refuseMismatch(client: PortalClient, ...dirs: Array<string | undefined>): PortalToolResult | null {
  for (const dir of dirs) {
    const message = workspaceMismatch(client, dir);
    if (message) return { text: message, isError: true };
  }
  return null;
}

/** A recorded copy must name the revision its local contents are based on. */
function saveBase(dir: string | undefined, explicit: number | undefined, required = false): number | undefined {
  const state = dir ? readPortalState(dir) : null;
  const base = explicit ?? state?.headRevisionNo;
  if (base !== undefined && Number.isSafeInteger(base) && base >= 0) return base;
  if (!required && !state && base === undefined) return undefined;
  throw new Error('Missing or invalid base revision. Nothing was sent. Pull portal_storyboard_pull with mode "side", merge the portal head with your local edits, then save with baseRevisionNo from that result. Keep .portal.json and your local files.');
}

let lastBackupTimeMs = 0;

function backupStamp(): string {
  const now = Math.max(Date.now(), lastBackupTimeMs + 1);
  lastBackupTimeMs = now;
  return new Date(now).toISOString().replace(/[:.]/g, '-');
}

/** What R4 may have left in the directory: a half-merged side pull (`.portal-head/`) and how many backups sit in `.portal-local/`. */
function pendingOf(dir: string): { sideDir: boolean; backups: number } {
  const sb = path.join(episodeDirOf(dir), 'storyboard');
  const side = path.join(sb, '.portal-head');
  const local = path.join(sb, '.portal-local');
  let backups = 0;
  try {
    backups = readdirSync(local, { withFileTypes: true }).filter((e) => e.isDirectory()).length;
  } catch {
    backups = 0;
  }
  return { sideDir: existsSync(side), backups };
}

/** Episode id — the argument, or `episodeDir/.portal.json`. */
function resolveEpisodeId(episodeId: string | undefined, episodeDir: string | undefined): string {
  if (episodeId) return episodeId;
  const state = episodeDir ? readPortalState(episodeDir) : null;
  if (state?.episodeId) return state.episodeId;
  throw new Error(
    'episodeId is missing — pass it, or pass an episodeDir that holds .portal.json (portal_storyboard_pull · portal_storyboard_save · portal_episode_create write it).',
  );
}

export interface PortalHandlers {
  imagesUpload(a: z.infer<typeof imageUploadSchema>): Promise<PortalToolResult>;
  renderAllocation(a: z.infer<typeof renderAllocationSchema>): Promise<PortalToolResult>;
  workspaceCheck(a: z.infer<typeof workspaceCheckSchema>): Promise<PortalToolResult>;
  storyboardSave(a: z.infer<typeof storyboardSaveSchema>): Promise<PortalToolResult>;
  storyboardList(a: z.infer<typeof storyboardListSchema>): Promise<PortalToolResult>;
  storyboardPull(a: z.infer<typeof storyboardPullSchema>): Promise<PortalToolResult>;
  episodeStatus(a: z.infer<typeof episodeStatusSchema>): Promise<PortalToolResult>;
  episodeCreate(a: z.infer<typeof episodeCreateSchema>): Promise<PortalToolResult>;
  episodeCheckpoint(a: z.infer<typeof episodeCheckpointSchema>): Promise<PortalToolResult>;
  episodeRevisions(a: z.infer<typeof episodeRevisionsSchema>): Promise<PortalToolResult>;
  episodeRestore(a: z.infer<typeof episodeRestoreSchema>): Promise<PortalToolResult>;
  episodeLease(a: z.infer<typeof episodeLeaseSchema>): Promise<PortalToolResult>;
  scenarioSave(a: z.infer<typeof scenarioSaveSchema>): Promise<PortalToolResult>;
  scenarioPull(a: z.infer<typeof scenarioPullSchema>): Promise<PortalToolResult>;
  scenarioChoose(a: z.infer<typeof scenarioChooseSchema>): Promise<PortalToolResult>;
}

/** The handlers, with fetch injectable so the tests never touch a network. */
export function portalHandlers(fetchImpl?: FetchLike): PortalHandlers {
  return {
    async imagesUpload(args) {
      const r = resolveClient(fetchImpl, undefined, args.episodeDir);
      if ('error' in r) return r.error;
      const refused = refuseMismatch(r.client, args.episodeDir);
      if (refused) return refused;
      try {
        if (!readPortalState(args.episodeDir)?.episodeId) throw new Error('Save with portal_storyboard_save first to create/link the episode, then upload images. Nothing was sent.');
        return await uploadEpisodeImages(r.client, args, saveBase(args.episodeDir, args.baseRevisionNo, true)!);
      } catch (error) { return failed(error); }
    },
    async renderAllocation({ episodeId, episodeDir, channel, assignments, requestId, baseRevisionNo }) {
      const r = resolveClient(fetchImpl, channel, episodeDir);
      if ('error' in r) return r.error;
      const refused = refuseMismatch(r.client, episodeDir);
      if (refused) return refused;
      try {
        const id = resolveEpisodeId(episodeId, episodeDir);
        const { data } = await r.client.renderAllocation(id, assignments ? { assignments, requestId, baseRevisionNo } : undefined);
        return ok({ ...data, ...(assignments ? { next: 'portal_storyboard_pull before any local save; server updated the revision and shot modes.' } : {}) });
      } catch (error) { return failed(error); }
    },
    async workspaceCheck({ channel, episodeDir }) {
      const r = resolveClient(fetchImpl, channel, episodeDir);
      if ('error' in r) return r.error;
      try {
        const { data } = await r.client.me();
        const state = episodeDir ? readPortalState(episodeDir) : null;
        const mismatch = workspaceMismatch(r.client, episodeDir);
        // Loop R5 — the one call at the top of a session also answers "is the portal ahead, who
        // holds it, is there a half-merged side pull or a backup lying around", so the skill does
        // not walk into the first checkpoint's 409. A portal lookup that fails leaves portal:null
        // with a warning; the check itself still answers.
        let portalPart: Record<string, unknown> = {};
        if (episodeDir && !mismatch) {
          portalPart = { pending: pendingOf(episodeDir) };
          if (state?.episodeId) {
            try {
              const { data: ep } = await r.client.getEpisode(state.episodeId);
              const lease = (ep.lease ?? null) as { holder?: string; expiresAt?: string; mine?: boolean } | null;
              const portalHead = ep.headRevisionNo ?? 0;
              const localHead = state.headRevisionNo ?? 0;
              const sync = portalHead > localHead ? 'portal_ahead' : portalHead < localHead ? 'local_ahead' : 'in_sync';
              portalPart = {
                ...portalPart,
                portal: {
                  headRevisionNo: portalHead,
                  stage: ep.stage ?? null,
                  status: (ep as { status?: string }).status ?? null,
                  // "mine" follows the lease rule (portal leases.ts): same subject (the portal's `mine`, which
                  // knows the key) AND same holder. A second machine on the same key reads as someone else, and
                  // a portal that did not say `mine` gets no guess from the holder string alone.
                  lease: lease && lease.holder ? { holder: lease.holder, until: lease.expiresAt ?? null, mine: lease.mine === true && lease.holder === r.client.holder } : null,
                },
                sync,
                // local_ahead never happens in the normal flow — the portal assigns revision numbers. A record
                // above the portal's head means the record was edited by hand or the portal lost revisions.
                // The only way back is through the portal: never tell the caller to drop headRevisionNo — a
                // record without it sends no baseRevisionNo, and the portal skips the head check without one
                // (review P1: that would reopen the stale-overwrite door R2/R4 closed).
                ...(sync === 'local_ahead'
                  ? { syncWarning: `.portal.json records head #${localHead} but the portal's head is #${portalHead} — the record is ahead of the portal. Pull mode "side", merge the portal's head into the local files, then save with baseRevisionNo ${portalHead} (the headRevisionNo the pull returned). Do not delete headRevisionNo from .portal.json — a save without a base skips the portal's conflict check.` }
                  : {}),
              };
            } catch (error) {
              portalPart = { ...portalPart, portal: null, sync: 'unknown', portalWarning: describePortalError(error) };
            }
          } else {
            portalPart = { ...portalPart, portal: null, sync: 'unknown' };
          }
        }
        return ok({
          channel: r.channel ?? null,
          workspace: r.client.workspace,
          source: r.client.source,
          holder: r.client.holder,
          ...(episodeDir
            ? {
                episodeDir: episodeDirOf(episodeDir),
                copyOf: state ? { workspace: state.workspace ?? null, episodeId: state.episodeId ?? null, headRevisionNo: state.headRevisionNo ?? null } : null,
                workspaceMatches: !mismatch,
                ...(mismatch ? { warning: mismatch } : {}),
                ...portalPart,
              }
            : {}),
          ...(data as object),
        });
      } catch (error) {
        return failed(error);
      }
    },

    async storyboardSave({ episodeDir, project, storyboardTitle, title, stage: stageArg, baseRevisionNo, note }) {
      const r = resolveClient(fetchImpl, undefined, episodeDir);
      if ('error' in r) return r.error;
      const refused = refuseMismatch(r.client, episodeDir);
      if (refused) return refused;
      try {
        const payload = buildImportPayload(episodeDir, { project, storyboard: storyboardTitle, title });
        const state = readPortalState(episodeDir);
        const base = saveBase(episodeDir, baseRevisionNo);
        payload.episode = {
          ...payload.episode,
          ...(state?.episodeId ? { id: state.episodeId } : {}),
          ...(stageArg ? { stage: stageArg } : {}),
          ...(base !== undefined ? { baseRevisionNo: base } : {}),
          ...(note ? { note } : {}),
          sourceHost: r.client.holder,
        };
        let response: Awaited<ReturnType<typeof r.client.importStoryboard>>;
        try {
          response = await r.client.importStoryboard(payload);
        } catch (error) {
          const id = state?.episodeId;
          return id ? await withHeadMovedDiff(r.client, id, base, error) : failed(error);
        }
        const { status, data } = response;
        writePortalState(episodeDir, {
          workspace: r.client.workspace,
          storyboardId: data.storyboardId,
          episodeId: data.episodeId,
          headRevisionNo: data.revisionNo,
        });
        return ok({
          result: status === 201 ? 'created' : 'updated',
          ...data,
          pageUrl: r.client.pageUrl(data.url),
          uploaded: {
            scenes: payload.scenes.length,
            characters: payload.characters.map((c) => c.id),
            documents: payload.documents.map((d) => d.filename),
          },
        });
      } catch (error) {
        return failed(error);
      }
    },

    async storyboardList({ channel, storyboardId, query, projectId, page }) {
      const r = resolveClient(fetchImpl, channel);
      if ('error' in r) return r.error;
      try {
        if (storyboardId) return ok((await r.client.listEpisodes(storyboardId)).data);
        return ok((await r.client.listStoryboards({ q: query, projectId, page })).data);
      } catch (error) {
        return failed(error);
      }
    },

    async storyboardPull({ episodeId, targetDir, includeDocuments = true, revision, mode = 'replace' }) {
      const r = resolveClient(fetchImpl, undefined, targetDir);
      if ('error' in r) return r.error;
      const refused = refuseMismatch(r.client, targetDir);
      if (refused) return refused;
      try {
        const c = r.client;
        const { data: episode } = await c.getEpisode(episodeId);
        const dir = episodeDirOf(targetDir);
        const sb = path.join(dir, 'storyboard');
        const fileContents = new Map<string, string>();
        fileContents.set('scenes.js', await c.scenesJs(episodeId, revision));

        if (revision) {
          // A named revision writes that revision's documents — mixing head's documents under old shots
          // puts today's script on yesterday's board. A document the revision lacks is not fetched.
          if (includeDocuments) {
            const { data: rev } = await c.getRevision(episodeId, revision);
            for (const [filename, content] of Object.entries(rev.documents ?? {})) {
              if (filename === 'scenes.js' || !SAFE_DOCUMENT_NAME.test(filename)) continue;
              fileContents.set(filename, content);
            }
          }
        } else {
          if (includeDocuments) {
            for (const doc of episode.documents ?? []) {
              if (doc.filename === 'scenes.js') continue; // the rebuilt one is the source of truth
              if (!SAFE_DOCUMENT_NAME.test(doc.filename)) continue;
              fileContents.set(doc.filename, await c.document(episodeId, doc.filename));
            }
          }
          // The chosen scenario rides along — the board checker reads scenario.md next to scenes.js.
          const chosen = (episode.scenarios ?? []).find((s) => s.chosen);
          if (chosen) {
            fileContents.set('scenario.md', await c.scenarioMd(episodeId, chosen.candidate));
          }
        }
        const files = [...fileContents].map(([filename, content]) => ({ filename, content }));
        const headRevisionNo = revision ?? episode.headRevisionNo ?? 0;
        const written = files.map(({ filename }) => filename);
        let backupDir: string | null = null;
        let sideDir: string | null = null;
        const replaced: string[] = [];

        if (mode === 'side') {
          sideDir = path.join(sb, '.portal-head');
          rmSync(sideDir, { recursive: true, force: true });
          mkdirSync(sideDir, { recursive: true });
          for (const { filename, content } of files) writeFileSync(path.join(sideDir, filename), content);
        } else {
          mkdirSync(sb, { recursive: true });
          const changed = files.filter(({ filename, content }) => {
            const target = path.join(sb, filename);
            return existsSync(target) && !readFileSync(target).equals(Buffer.from(content));
          });
          if (changed.length > 0) {
            const state = readPortalState(dir);
            backupDir = path.join(sb, '.portal-local', `${backupStamp()}-r${state?.headRevisionNo ?? 0}`);
            mkdirSync(backupDir, { recursive: true });
            for (const { filename } of changed) {
              copyFileSync(path.join(sb, filename), path.join(backupDir, filename));
              replaced.push(filename);
            }
          }
          for (const { filename, content } of files) writeFileSync(path.join(sb, filename), content);
          writePortalState(dir, {
            workspace: c.workspace,
            storyboardId: episode.storyboardId,
            episodeId,
            headRevisionNo,
          });
        }
        return ok({
          episode: {
            id: episode.id,
            slug: episode.slug,
            title: episode.title,
            sceneCount: episode.sceneCount,
            stage: episode.stage,
            headRevisionNo: episode.headRevisionNo,
            lease: episode.lease,
          },
          mode,
          revision: revision ?? null,
          headRevisionNo,
          dir: mode === 'side' ? sideDir : sb,
          written,
          backupDir,
          replaced,
          sideDir,
        });
      } catch (error) {
        return failed(error);
      }
    },

    async episodeStatus({ episodeId, episodeDir, channel, status, stage: stageArg, title }) {
      const r = resolveClient(fetchImpl, channel, episodeDir);
      if ('error' in r) return r.error;
      const refused = refuseMismatch(r.client, episodeDir);
      if (refused) return refused;
      try {
        const patch = { ...(status ? { status } : {}), ...(stageArg ? { stage: stageArg } : {}), ...(title ? { title } : {}) };
        if (Object.keys(patch).length === 0) throw new Error('one of status · stage · title is required.');
        const id = resolveEpisodeId(episodeId, episodeDir);
        return ok((await r.client.updateEpisode(id, patch)).data);
      } catch (error) {
        return failed(error);
      }
    },

    async episodeCreate({ storyboardId, episodeDir, channel, ...body }) {
      const r = resolveClient(fetchImpl, channel, episodeDir);
      if ('error' in r) return r.error;
      const refused = refuseMismatch(r.client, episodeDir);
      if (refused) return refused;
      try {
        const { data } = await r.client.createEpisode(storyboardId, body);
        if (episodeDir) {
          mkdirSync(episodeDirOf(episodeDir), { recursive: true });
          writePortalState(episodeDir, { workspace: r.client.workspace, storyboardId, episodeId: data.id, headRevisionNo: 0 });
        }
        return ok({ ...data, pageUrl: r.client.pageUrl(data.url) });
      } catch (error) {
        return failed(error);
      }
    },

    async episodeCheckpoint({ stage: stageArg, episodeId, episodeDir, channel, baseRevisionNo, note, documents }) {
      const r = resolveClient(fetchImpl, channel, episodeDir);
      if ('error' in r) return r.error;
      const refused = refuseMismatch(r.client, episodeDir);
      if (refused) return refused;
      try {
        const id = resolveEpisodeId(episodeId, episodeDir);
        const base = saveBase(episodeDir, baseRevisionNo, true);
        const body: Record<string, unknown> = {
          stage: stageArg,
          note,
          sourceHost: r.client.holder,
          baseRevisionNo: base,
        };
        let uploadedDocuments: string[] = [];
        let uploadedScenes = 0;
        if (episodeDir) {
          const dir = episodeDirOf(episodeDir);
          const sb = path.join(dir, 'storyboard');
          if (existsSync(path.join(sb, 'scenes.js'))) {
            const payload = buildImportPayload(dir);
            body.scenes = payload.scenes;
            body.meta = payload.episode.meta;
            body.characters = payload.characters;
            uploadedScenes = payload.scenes.length;
          }
          const docs = readDocuments(sb, documents ?? DOCUMENT_FILES);
          body.documents = docs;
          uploadedDocuments = docs.map((d) => d.filename);
        }
        let response: Awaited<ReturnType<typeof r.client.checkpoint>>;
        try {
          response = await r.client.checkpoint(id, body);
        } catch (error) {
          return await withHeadMovedDiff(r.client, id, body.baseRevisionNo as number | undefined, error);
        }
        const { status, data } = response;
        if (episodeDir) writePortalState(episodeDir, { episodeId: id, headRevisionNo: data.revisionNo });
        return ok({
          result: status === 201 ? 'new revision' : 'unchanged (stage only)',
          ...data,
          uploaded: { scenes: uploadedScenes, documents: uploadedDocuments },
        });
      } catch (error) {
        return failed(error);
      }
    },

    async episodeRevisions({ episodeId, episodeDir, channel, revisionNo, compareTo }) {
      const r = resolveClient(fetchImpl, channel, episodeDir);
      if ('error' in r) return r.error;
      try {
        const id = resolveEpisodeId(episodeId, episodeDir);
        if (compareTo !== undefined) {
          // compare from revisionNo, or from the directory's recorded head, to compareTo
          const from = revisionNo ?? (episodeDir ? readPortalState(episodeDir)?.headRevisionNo : undefined);
          if (!from) throw new Error('compareTo needs revisionNo, or an episodeDir whose .portal.json records headRevisionNo.');
          const { data } = await r.client.revisionDiff(id, from, compareTo);
          return ok({ summary: summarizeRevisionDiff(data), ...data });
        }
        const { data } = revisionNo ? await r.client.getRevision(id, revisionNo) : await r.client.listRevisions(id);
        return ok(data);
      } catch (error) {
        return failed(error);
      }
    },

    async episodeRestore({ revisionNo, episodeId, episodeDir, channel, note }) {
      const r = resolveClient(fetchImpl, channel, episodeDir);
      if ('error' in r) return r.error;
      const refused = refuseMismatch(r.client, episodeDir);
      if (refused) return refused;
      try {
        const id = resolveEpisodeId(episodeId, episodeDir);
        const { data } = await r.client.restoreRevision(id, revisionNo, { note, sourceHost: r.client.holder });
        if (episodeDir) writePortalState(episodeDir, { episodeId: id, headRevisionNo: data.revisionNo });
        return ok(data);
      } catch (error) {
        return failed(error);
      }
    },

    async episodeLease({ action, episodeId, episodeDir, channel, ttlMinutes, force }) {
      const r = resolveClient(fetchImpl, channel, episodeDir);
      if ('error' in r) return r.error;
      const refused = refuseMismatch(r.client, episodeDir);
      if (refused) return refused;
      try {
        const id = resolveEpisodeId(episodeId, episodeDir);
        const me = r.client.holder;
        if (action === 'status') return ok({ holder: me, ...((await r.client.getLease(id)).data as object) });
        if (action === 'acquire') {
          const { data } = await r.client.acquireLease(id, { holder: me, ...(ttlMinutes ? { ttlMinutes } : {}) });
          if (episodeDir) writePortalState(episodeDir, { episodeId: id, holder: me });
          return ok(data);
        }
        return ok((await r.client.releaseLease(id, { holder: me, ...(force ? { force } : {}) })).data);
      } catch (error) {
        return failed(error);
      }
    },

    async scenarioSave({ candidate: cand, file, markdown, chosen, episodeId, episodeDir, channel }) {
      // candidates/dN.md sits two levels under the episode directory; scenario.md one level (storyboard/).
      const dirFromFile = file ? (path.basename(path.dirname(file)) === 'candidates' ? path.dirname(path.dirname(file)) : path.dirname(file)) : undefined;
      const r = resolveClient(fetchImpl, channel, episodeDir, dirFromFile);
      if ('error' in r) return r.error;
      const refused = refuseMismatch(r.client, episodeDir, dirFromFile);
      if (refused) return refused;
      try {
        const id = resolveEpisodeId(episodeId, episodeDir ?? dirFromFile);
        const source = markdown ?? (file ? readFileSync(file, 'utf8') : null);
        if (source === null) throw new Error('one of file · markdown is required.');
        const { status, data } = await r.client.saveScenario(id, cand, {
          markdown: source,
          sourceHost: r.client.holder,
          ...(chosen !== undefined ? { chosen } : {}),
        });
        return ok({
          result: status === 201 ? 'created' : 'updated',
          candidate: data.candidate,
          chosen: data.chosen,
          findings: data.findings,
          updatedAt: data.updatedAt,
        });
      } catch (error) {
        return failed(error);
      }
    },

    async scenarioPull({ targetDir, candidate: cand, episodeId, episodeDir, channel }) {
      const r = resolveClient(fetchImpl, channel, episodeDir, targetDir);
      if ('error' in r) return r.error;
      const refused = refuseMismatch(r.client, episodeDir, targetDir);
      if (refused) return refused;
      try {
        const id = resolveEpisodeId(episodeId, episodeDir ?? targetDir);
        if (cand && !targetDir) return { text: await r.client.scenarioMd(id, cand), isError: false };
        const { data } = await r.client.listScenarios(id);
        const written: string[] = [];
        if (targetDir) {
          const dir = episodeDirOf(targetDir);
          const sb = path.join(dir, 'storyboard');
          const candDir = path.join(sb, 'candidates');
          mkdirSync(candDir, { recursive: true });
          for (const s of data.scenarios) {
            if (cand && s.candidate !== cand) continue;
            const file = path.join(candDir, `${s.candidate.toLowerCase()}.md`);
            writeFileSync(file, s.markdown);
            written.push(path.relative(dir, file));
            if (s.chosen) {
              writeFileSync(path.join(sb, 'scenario.md'), s.markdown);
              written.push('storyboard/scenario.md');
            }
          }
        }
        return ok({
          scenarios: data.scenarios.map((s) => ({
            candidate: s.candidate,
            chosen: s.chosen,
            score: s.meta?.score ?? null,
            p0: s.meta?.p0 ?? null,
            findings: s.findings.length,
          })),
          written,
        });
      } catch (error) {
        return failed(error);
      }
    },

    async scenarioChoose({ candidate: cand, episodeId, episodeDir, channel }) {
      const r = resolveClient(fetchImpl, channel, episodeDir);
      if ('error' in r) return r.error;
      const refused = refuseMismatch(r.client, episodeDir);
      if (refused) return refused;
      try {
        const id = resolveEpisodeId(episodeId, episodeDir);
        const { data } = await r.client.chooseScenario(id, cand);
        return ok({ candidate: data.candidate, chosen: data.chosen, findings: data.findings });
      } catch (error) {
        return failed(error);
      }
    },
  };
}
