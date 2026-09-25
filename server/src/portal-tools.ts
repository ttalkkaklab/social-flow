import { REVIEW_TOOL_NAMES } from './portal-review-tools.js';
import { UNIT_TOOL_NAMES } from './portal-unit-tools.js';
import { PORTAL_API_TOOL_NAMES } from './portal-api-contract.js';
import { canonicalPullPaths } from './portal-canonical.js';
import { uploadAttachments, restoreAttachments, prepareAttachmentRestore, attachmentSyncReport, safeAttachmentTarget } from './portal-attachments.js';
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

import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { imageUploadSchema, uploadEpisodeImages } from './portal-images.js';
export { imageUploadSchema } from './portal-images.js';
import { assetsGetSchema, assetsSearchSchema, getAsset, searchAssets } from './portal-assets.js';
export { assetsGetSchema, assetsSearchSchema } from './portal-assets.js';
import { artifactSyncSchema, publicationRecordSchema, recordPublication, syncEpisodeArtifacts } from './portal-artifacts.js';
export { artifactSyncSchema, publicationRecordSchema } from './portal-artifacts.js';
import {
  characterExtraDeleteSchema, characterCreateSchema, characterDeleteSchema, characterGetSchema, characterImageUploadSchema, characterListSchema, characterTtsSetSchema, characterUpdateSchema,
  deleteCharacterExtraImage, createCharacter, deleteCharacter, getCharacter, listCharacters, setCharacterTts, updateCharacter, uploadCharacterImage,
} from './portal-characters.js';
export {
  characterExtraDeleteSchema, characterCreateSchema, characterDeleteSchema, characterGetSchema, characterImageUploadSchema, characterListSchema, characterTtsSetSchema, characterUpdateSchema,
} from './portal-characters.js';
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
  ...PORTAL_API_TOOL_NAMES,
  'portal_assets_search',
  'portal_assets_get',
  ...UNIT_TOOL_NAMES,
  'portal_character_list',
  'portal_character_get',
  'portal_character_create',
  'portal_character_update',
  'portal_character_delete',
  'portal_character_image_upload',
  'portal_character_extra_delete',
  'portal_character_tts_set',
  ...REVIEW_TOOL_NAMES,
  'portal_attachments_sync',
  'portal_images_upload',
  'portal_shot_media_upload',
  'portal_workspace_check',
  'portal_storyboard_save',
  'portal_storyboard_list',
  'portal_storyboard_pull',
  'portal_episode_status',
  'portal_episode_artifacts_sync',
  'portal_publication_record',
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

export const attachmentsSyncSchema = z.object({ episodeDir: z.string().min(1), episodeId: uuid.optional(), channel: channelArg });

export const workspaceCheckSchema = z.object({ channel: channelArg, episodeDir: z.string().optional(), episodeId: uuid.optional() });
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
  if (d.decisions) {
    const decisions = [...d.decisions.added.map((k) => `+${k}`), ...d.decisions.removed.map((k) => `−${k}`), ...d.decisions.changed.map((k) => `~${k}`)];
    if (decisions.length) parts.push(`decisions ${decisions.join(' ')}`);
  }
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

async function resolveClient(fetchImpl: FetchLike | undefined, explicit: string | undefined, ...dirs: Array<string | undefined>): Promise<ClientResolution> {
  const channel = channelFor(explicit, ...dirs);
  let client: PortalClient | null;
  try {
    client = await portalClientFor(channel, fetchImpl);
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
  try {
    for (const dir of dirs) {
      const message = workspaceMismatch(client, dir);
      if (message) return { text: message, isError: true };
    }
    return null;
  } catch (error) { return failed(error); }
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

/** Reserve on disk: the timestamp counter alone cannot coordinate restarted or separate processes. */
function reserveBackupDirectory(root: string, suffix: string): string {
  if (existsSync(root) && lstatSync(root).isSymbolicLink()) throw new Error('Unsafe backup directory');
  mkdirSync(root, { recursive: true });
  for (let attempt = 0; attempt < 100; attempt++) {
    const directory = path.join(root, `${backupStamp()}-${suffix}`);
    try {
      mkdirSync(directory); // Exclusive creation; never reuse an existing file, directory or symlink.
      return directory;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
  }
  throw new Error('Could not reserve a new backup directory. Local files were not replaced. Retry the pull.');
}

/** What R4 may have left in the directory: a half-merged side pull (`.portal-head/`) and how many backups sit in `.portal-local/`. */
function pendingOf(dir: string): { sideDir: boolean | null; backups: number | null; warnings?: { sideDir?: string; backups?: string } } {
  const sb = path.join(episodeDirOf(dir), 'storyboard');
  const side = path.join(sb, '.portal-head');
  const local = path.join(sb, '.portal-local');
  // Test the entry before reading: readdir ENOENT can also mean a dangling link.
  const entries = (target: string) => {
    try { lstatSync(target); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
    return readdirSync(target, { withFileTypes: true });
  };
  let sideDir: boolean | null = null;
  let backups: number | null = null;
  const warnings: { sideDir?: string; backups?: string } = {};
  try { sideDir = entries(side) !== null; }
  catch { warnings.sideDir = 'Cannot read .portal-head; side directory presence is unknown. Keep local files and inspect permissions or links.'; }
  try {
    backups = entries(local)?.filter((e) => e.isDirectory()).length ?? 0;
  } catch {
    warnings.backups = 'Cannot read .portal-local; backup count is unknown. Keep local files and inspect permissions or links.';
  }
  return { sideDir, backups, ...(Object.keys(warnings).length ? { warnings } : {}) };
}

/** Every supplied local copy must agree with the explicit or inferred episode id. */
function resolveEpisodeId(episodeId: string | undefined, ...dirs: Array<string | undefined>): string {
  let id = episodeId;
  for (const dir of dirs) {
    const recorded = dir ? readPortalState(dir)?.episodeId : undefined;
    if (!recorded) continue;
    if (id && id !== recorded) {
      throw new Error('Episode mismatch — episodeId and the supplied local copies identify different episodes. Nothing was sent or written. Use the matching episode directory or a new unlinked target for a pull; for a remote-only call, omit local directories and files. Keep existing .portal.json and local edits.');
    }
    id = recorded;
  }
  if (id) return id;
  throw new Error(
    'episodeId is missing — pass it, or pass an episodeDir that holds .portal.json (portal_storyboard_pull · portal_storyboard_save · portal_episode_create write it).',
  );
}

export interface PortalHandlers {
  assetsSearch(a: z.infer<typeof assetsSearchSchema>): Promise<PortalToolResult>;
  assetsGet(a: z.infer<typeof assetsGetSchema>): Promise<PortalToolResult>;
  characterList(a: z.infer<typeof characterListSchema>): Promise<PortalToolResult>;
  characterGet(a: z.infer<typeof characterGetSchema>): Promise<PortalToolResult>;
  characterCreate(a: z.infer<typeof characterCreateSchema>): Promise<PortalToolResult>;
  characterUpdate(a: z.infer<typeof characterUpdateSchema>): Promise<PortalToolResult>;
  characterDelete(a: z.infer<typeof characterDeleteSchema>): Promise<PortalToolResult>;
  characterExtraDelete(a: z.infer<typeof characterExtraDeleteSchema>): Promise<PortalToolResult>;
  characterImageUpload(a: z.infer<typeof characterImageUploadSchema>): Promise<PortalToolResult>;
  characterTtsSet(a: z.infer<typeof characterTtsSetSchema>): Promise<PortalToolResult>;
  attachmentsSync(a: z.infer<typeof attachmentsSyncSchema>): Promise<PortalToolResult>;
  imagesUpload(a: z.infer<typeof imageUploadSchema>): Promise<PortalToolResult>;
  renderAllocation(a: z.infer<typeof renderAllocationSchema>): Promise<PortalToolResult>;
  workspaceCheck(a: z.infer<typeof workspaceCheckSchema>): Promise<PortalToolResult>;
  storyboardSave(a: z.infer<typeof storyboardSaveSchema>): Promise<PortalToolResult>;
  storyboardList(a: z.infer<typeof storyboardListSchema>): Promise<PortalToolResult>;
  storyboardPull(a: z.infer<typeof storyboardPullSchema>): Promise<PortalToolResult>;
  episodeStatus(a: z.infer<typeof episodeStatusSchema>): Promise<PortalToolResult>;
  episodeArtifactsSync(a: z.infer<typeof artifactSyncSchema>): Promise<PortalToolResult>;
  publicationRecord(a: z.infer<typeof publicationRecordSchema>): Promise<PortalToolResult>;
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
    // The library is global — no workspace record to compare, so no refuseMismatch here.
    async assetsSearch(args) {
      const r = await resolveClient(fetchImpl, args.channel, args.episodeDir);
      if ('error' in r) return r.error;
      try { return ok(await searchAssets(r.client, args)); } catch (error) { return failed(error); }
    },
    async assetsGet(args) {
      const r = await resolveClient(fetchImpl, args.channel, args.episodeDir);
      if ('error' in r) return r.error;
      try { return ok(await getAsset(r.client, args)); } catch (error) { return failed(error); }
    },
    // Characters belong to the workspace the key opens — the channel only names the project (#88/#91).
    async characterList(args) {
      const r = await resolveClient(fetchImpl, args.channel, args.episodeDir);
      if ('error' in r) return r.error;
      try { return ok(await listCharacters(r.client, args)); } catch (error) { return failed(error); }
    },
    async characterGet(args) {
      const r = await resolveClient(fetchImpl, args.channel, args.episodeDir);
      if ('error' in r) return r.error;
      try { return ok(await getCharacter(r.client, args)); } catch (error) { return failed(error); }
    },
    async characterCreate(args) {
      const r = await resolveClient(fetchImpl, args.channel, args.episodeDir);
      if ('error' in r) return r.error;
      try { return ok(await createCharacter(r.client, args, r.channel)); } catch (error) { return failed(error); }
    },
    async characterUpdate(args) {
      const r = await resolveClient(fetchImpl, args.channel, args.episodeDir);
      if ('error' in r) return r.error;
      try { return ok(await updateCharacter(r.client, args)); } catch (error) { return failed(error); }
    },
    async characterDelete(args) {
      const r = await resolveClient(fetchImpl, args.channel, args.episodeDir);
      if ('error' in r) return r.error;
      try { return ok(await deleteCharacter(r.client, args)); } catch (error) { return failed(error); }
    },
    async characterExtraDelete(args) {
      const r = await resolveClient(fetchImpl, args.channel, args.episodeDir);
      if ('error' in r) return r.error;
      try { return ok(await deleteCharacterExtraImage(r.client, args)); } catch (error) { return failed(error); }
    },
    async characterImageUpload(args) {
      const r = await resolveClient(fetchImpl, args.channel, args.episodeDir);
      if ('error' in r) return r.error;
      try { return ok(await uploadCharacterImage(r.client, args)); } catch (error) { return failed(error); }
    },
    async characterTtsSet(args) {
      const r = await resolveClient(fetchImpl, args.channel, args.episodeDir);
      if ('error' in r) return r.error;
      try { return ok(await setCharacterTts(r.client, args)); } catch (error) { return failed(error); }
    },
    async attachmentsSync(args) {
      const r = await resolveClient(fetchImpl, args.channel, args.episodeDir);
      if ('error' in r) return r.error;
      const refused = refuseMismatch(r.client, args.episodeDir);
      if (refused) return refused;
      try {
        const id = resolveEpisodeId(args.episodeId, args.episodeDir);
        return ok(await uploadAttachments(r.client, id, episodeDirOf(args.episodeDir)));
      } catch (error) { return failed(error); }
    },
    async imagesUpload(args) {
      const r = await resolveClient(fetchImpl, undefined, args.episodeDir);
      if ('error' in r) return r.error;
      const refused = refuseMismatch(r.client, args.episodeDir);
      if (refused) return refused;
      try {
        if (!readPortalState(args.episodeDir)?.episodeId) throw new Error('Save with portal_storyboard_save first to create/link the episode, then upload images. Nothing was sent.');
        return await uploadEpisodeImages(r.client, args, saveBase(args.episodeDir, args.baseRevisionNo, true)!);
      } catch (error) { return failed(error); }
    },
    async renderAllocation({ episodeId, episodeDir, channel, assignments, requestId, baseRevisionNo }) {
      const r = await resolveClient(fetchImpl, channel, episodeDir);
      if ('error' in r) return r.error;
      const refused = refuseMismatch(r.client, episodeDir);
      if (refused) return refused;
      try {
        const id = resolveEpisodeId(episodeId, episodeDir);
        const { data } = await r.client.renderAllocation(id, assignments ? { assignments, requestId, baseRevisionNo } : undefined);
        return ok({ ...data, ...(assignments ? { next: 'portal_storyboard_pull before any local save; server updated the revision and shot modes.' } : {}) });
      } catch (error) { return failed(error); }
    },
    async workspaceCheck({ channel, episodeDir, episodeId }) {
      const r = await resolveClient(fetchImpl, channel, episodeDir);
      if ('error' in r) return r.error;
      try {
        let state: ReturnType<typeof readPortalState> = null;
        let mismatch: string | null = null;
        let localWarning: string | undefined;
        try {
          state = episodeDir ? readPortalState(episodeDir) : null;
          mismatch = workspaceMismatch(r.client, episodeDir);
        } catch (error) {
          state = null;
          localWarning = describePortalError(error);
        }
        const episodeMismatch = !!(episodeId && state?.episodeId && episodeId !== state.episodeId);
        const warning = [mismatch, episodeMismatch ? 'Episode mismatch — episodeId and .portal.json identify different episodes. No episode was queried; use the matching ID or omit episodeDir for a remote-only check.' : null].filter(Boolean).join(' ');
        const id = episodeId ?? state?.episodeId;
        const { data } = await r.client.me();
        // Loop R5 — the one call at the top of a session also answers "is the portal ahead, who
        // holds it, is there a half-merged side pull or a backup lying around", so the skill does
        // not walk into the first checkpoint's 409. A portal lookup that fails leaves portal:null
        // with a warning; the check itself still answers.
        let portalPart: Record<string, unknown> = episodeDir ? { pending: pendingOf(episodeDir) } : {};
        if ((episodeDir || episodeId) && !mismatch && !episodeMismatch) {
          if (id) {
            try {
              const { data: ep } = await r.client.getEpisode(id);
              const lease = (ep.lease ?? null) as { holder?: string; expiresAt?: string; mine?: boolean } | null;
              const portalHead = ep.headRevisionNo ?? 0;
              const localHead = state?.headRevisionNo;
              const sync = localHead === undefined ? 'unknown' : portalHead > localHead ? 'portal_ahead' : portalHead < localHead ? 'local_ahead' : 'in_sync';
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
            portalPart = { ...portalPart, portal: null, sync: 'unknown',
              ...(localWarning ? { portalWarning: 'Pass episodeId explicitly to inspect the portal head and lease; the damaged local state cannot identify the episode.' } : {}),
            };
          }
        }
        return ok({
          channel: r.channel ?? null,
          workspace: r.client.workspace,
          resolvedBy: r.client.resolvedBy,
          source: r.client.source,
          holder: r.client.holder,
          ...(episodeDir
            ? {
                episodeDir: episodeDirOf(episodeDir),
                copyOf: state ? { workspace: state.workspace ?? null, episodeId: state.episodeId ?? null, headRevisionNo: state.headRevisionNo ?? null } : null,
                workspaceMatches: localWarning ? null : !mismatch,
                ...(warning ? { warning } : {}),
                ...(localWarning ? { localWarning } : {}),
              }
            : {}),
          ...portalPart,
          ...(data as object),
        });
      } catch (error) {
        return failed(error);
      }
    },

    async storyboardSave({ episodeDir, project, storyboardTitle, title, stage: stageArg, baseRevisionNo, note }) {
      const r = await resolveClient(fetchImpl, undefined, episodeDir);
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
          attachments: await attachmentSyncReport(() => uploadAttachments(r.client, data.episodeId, episodeDirOf(episodeDir))),
          uploaded: {
            scenes: payload.scenes.length,
            characters: payload.characters.map((c) => c.id),
            narratorCharacterId: payload.narratorCharacterId,
            documents: payload.documents.map((d) => d.filename),
          },
        });
      } catch (error) {
        return failed(error);
      }
    },

    async storyboardList({ channel, storyboardId, query, projectId, page }) {
      const r = await resolveClient(fetchImpl, channel);
      if ('error' in r) return r.error;
      try {
        if (storyboardId) return ok((await r.client.listEpisodes(storyboardId)).data);
        return ok((await r.client.listStoryboards({ q: query, projectId, page })).data);
      } catch (error) {
        return failed(error);
      }
    },

    async storyboardPull({ episodeId, targetDir, includeDocuments = true, revision, mode = 'replace' }) {
      const r = await resolveClient(fetchImpl, undefined, targetDir);
      if ('error' in r) return r.error;
      const refused = refuseMismatch(r.client, targetDir);
      if (refused) return refused;
      try {
        const c = r.client;
        resolveEpisodeId(episodeId, targetDir);
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
        for (const filename of fileContents.keys()) safeAttachmentTarget(dir, `storyboard/${filename}`);
        // A historical working copy must not carry newer managed documents into the next save.
        // Unknown local notes are not ours to remove; preserve every removed file in the same backup.
        const removed = revision && includeDocuments && mode === 'replace'
          ? [...new Set<string>([...DOCUMENT_FILES, 'scenario.md', ...(episode.documents ?? []).map(doc => doc.filename)])]
            .filter(filename => SAFE_DOCUMENT_NAME.test(filename) && !fileContents.has(filename))
            .filter(filename => {
              const target = safeAttachmentTarget(dir, `storyboard/${filename}`);
              if (!existsSync(target)) return false;
              if (!lstatSync(target).isFile()) throw new Error(`Not a regular document: ${filename}`);
              return true;
            })
          : [];
        const files = [...fileContents].map(([filename, content]) => ({ filename, content }));
        const headRevisionNo = revision ?? episode.headRevisionNo ?? 0;
        const written = files.map(({ filename }) => filename);
        let backupDir: string | null = null;
        let sideDir: string | null = null;
        const replaced: string[] = [];

        const attachmentRoot = mode === 'side' ? path.join(sb, '.portal-head', 'attachments') : dir;
        const attachmentSnapshot = revision ? undefined : await prepareAttachmentRestore(c, episodeId, attachmentRoot, canonicalPullPaths(episode, fileContents.keys()));
        if (!revision) {
          // Downloads use current endpoints. Check again after staging attachments, before any local writes.
          const { data: latest } = await c.getEpisode(episodeId).catch((error: unknown) => {
            throw new Error(`Could not verify episode head during pull. Pull did not write local files. Retry portal_storyboard_pull. ${error instanceof Error ? error.message : String(error)}`);
          });
          if ((latest.headRevisionNo ?? 0) !== headRevisionNo) {
            throw new Error(`Episode head moved during pull (#${headRevisionNo} → #${latest.headRevisionNo ?? 0}). Pull did not write local files. Retry portal_storyboard_pull.`);
          }
        }
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
          if (changed.length > 0 || removed.length > 0) {
            const state = readPortalState(dir);
            const backupRoot = path.join(sb, '.portal-local');
            backupDir = reserveBackupDirectory(backupRoot, `r${state?.headRevisionNo ?? 0}`);
            for (const filename of [...changed.map(file => file.filename), ...removed]) {
              copyFileSync(path.join(sb, filename), path.join(backupDir, filename));
            }
            replaced.push(...changed.map(file => file.filename));
          }
          for (const filename of removed) rmSync(path.join(sb, filename));
          for (const { filename, content } of files) writeFileSync(path.join(sb, filename), content);

        }
        const attachments = revision ? { skipped: 'Attachments are current episode files, not revision snapshots.' } : await restoreAttachments(c, episodeId, attachmentRoot, attachmentSnapshot);
        if (mode !== 'side') writePortalState(dir, { workspace: c.workspace, storyboardId: episode.storyboardId, episodeId, headRevisionNo });
        return ok({
          attachments,
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
          removed,
          sideDir,
        });
      } catch (error) {
        return failed(error);
      }
    },

    async episodeStatus({ episodeId, episodeDir, channel, status, stage: stageArg, title }) {
      const r = await resolveClient(fetchImpl, channel, episodeDir);
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

    async episodeArtifactsSync(args) {
      try { return ok(await syncEpisodeArtifacts(args, fetchImpl)); }
      catch (error) { return failed(error); }
    },

    async publicationRecord(args) {
      try { return ok(await recordPublication(args, fetchImpl)); }
      catch (error) { return failed(error); }
    },

    async episodeCreate({ storyboardId, episodeDir, channel, ...body }) {
      const r = await resolveClient(fetchImpl, channel, episodeDir);
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
      const r = await resolveClient(fetchImpl, channel, episodeDir);
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
            body.backgrounds = payload.backgrounds;
            body.props = payload.props;
            body.narratorCharacterId = payload.narratorCharacterId;
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
          attachments: episodeDir ? await attachmentSyncReport(() => uploadAttachments(r.client, id, episodeDirOf(episodeDir))) : undefined,
          uploaded: { scenes: uploadedScenes, documents: uploadedDocuments },
        });
      } catch (error) {
        return failed(error);
      }
    },

    async episodeRevisions({ episodeId, episodeDir, channel, revisionNo, compareTo }) {
      const r = await resolveClient(fetchImpl, channel, episodeDir);
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
      const r = await resolveClient(fetchImpl, channel, episodeDir);
      if ('error' in r) return r.error;
      const refused = refuseMismatch(r.client, episodeDir);
      if (refused) return refused;
      try {
        const id = resolveEpisodeId(episodeId, episodeDir);
        const { data } = await r.client.restoreRevision(id, revisionNo, { note, sourceHost: r.client.holder });
        // Restore changes the portal, not the local files. Advancing their base here
        // would let the old board overwrite the restored revision without a conflict.
        return ok(episodeDir ? {
          ...data,
          localCopy: { unchanged: true, syncRequired: true },
          next: 'Local files and .portal.json were not changed. Pull mode "side", review the restored head and merge any intended local edits, then save with the pull result\'s explicit baseRevisionNo. Do not advance the local head without synchronizing the files.',
        } : data);
      } catch (error) {
        return failed(error);
      }
    },

    async episodeLease({ action, episodeId, episodeDir, channel, ttlMinutes, force }) {
      const r = await resolveClient(fetchImpl, channel, episodeDir);
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
      const r = await resolveClient(fetchImpl, channel, episodeDir, dirFromFile);
      if ('error' in r) return r.error;
      const refused = refuseMismatch(r.client, episodeDir, dirFromFile);
      if (refused) return refused;
      try {
        const id = resolveEpisodeId(episodeId, episodeDir, dirFromFile);
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
      const r = await resolveClient(fetchImpl, channel, episodeDir, targetDir);
      if ('error' in r) return r.error;
      const refused = refuseMismatch(r.client, episodeDir, targetDir);
      if (refused) return refused;
      try {
        const id = resolveEpisodeId(episodeId, episodeDir, targetDir);
        if (cand && !targetDir) return { text: await r.client.scenarioMd(id, cand), isError: false };
        const { data } = await r.client.listScenarios(id);
        const written: string[] = [];
        let backupDir: string | null = null;
        const replaced: string[] = [];
        if (targetDir) {
          const dir = episodeDirOf(targetDir);
          const sb = path.join(dir, 'storyboard');
          const candDir = path.join(sb, 'candidates');
          const files = new Map<string, string>();
          for (const s of data.scenarios) {
            if (cand && s.candidate !== cand) continue;
            if (!candidate.safeParse(s.candidate).success)
              throw new Error(`portal_scenario_pull: 알 수 없는 시나리오 후보 ${JSON.stringify(s.candidate)}입니다. 후보를 D1~D3으로 고친 뒤 다시 가져와 주세요.`);
            files.set(`candidates/${s.candidate.toLowerCase()}.md`, s.markdown);
            if (s.chosen) files.set('scenario.md', s.markdown);
          }
          // Validate every target and finish all backups before replacing the first local draft.
          for (const [filename, content] of files) {
            const target = safeAttachmentTarget(dir, `storyboard/${filename}`);
            if (!existsSync(target)) continue;
            if (!lstatSync(target).isFile()) throw new Error(`Not a regular scenario file: ${filename}`);
            if (!readFileSync(target).equals(Buffer.from(content))) replaced.push(`storyboard/${filename}`);
          }
          if (replaced.length > 0) {
            const backupRoot = path.join(sb, '.portal-local');
            backupDir = reserveBackupDirectory(backupRoot, 'scenarios');
            for (const relative of replaced) {
              const backup = path.join(backupDir, path.relative('storyboard', relative));
              mkdirSync(path.dirname(backup), { recursive: true });
              copyFileSync(path.join(dir, relative), backup);
            }
          }
          mkdirSync(candDir, { recursive: true });
          for (const [filename, content] of files) {
            writeFileSync(path.join(sb, filename), content);
            written.push(`storyboard/${filename}`);
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
          backupDir,
          replaced,
        });
      } catch (error) {
        return failed(error);
      }
    },

    async scenarioChoose({ candidate: cand, episodeId, episodeDir, channel }) {
      const r = await resolveClient(fetchImpl, channel, episodeDir);
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
