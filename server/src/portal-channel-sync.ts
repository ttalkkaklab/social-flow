import { createHash, randomUUID } from 'node:crypto';
import {
  constants, closeSync, existsSync, fstatSync, lstatSync, mkdirSync, openSync,
  readFileSync, readSync, readdirSync, renameSync, rmSync, unlinkSync, writeFileSync,
} from 'node:fs';
import path from 'node:path';
import type { PortalClient } from './portal-client.js';

const STATE_FORMAT = 'social-flow-channel-sync/v1';
const STATE_FILE = '.portal-channel.json';
const PROFILE_FILE = 'profile.md';
const MAX_PROFILE_BYTES = 1024 * 1024;
const MAX_FILE_BYTES = 100 * 1024 * 1024;
const MAX_TOTAL_BYTES = 500 * 1024 * 1024;
const ALLOWED_ROOTS = ['assets/intro', 'assets/outro', 'assets/branding', 'assets/sfx'] as const;

type RemoteAttachment = {
  id: string; relativePath: string; sha256: string; mime: string; byteSize: number;
  provenance?: Record<string, string>;
};
type SyncState = {
  format: typeof STATE_FORMAT;
  workspace: string;
  projectId: string;
  projectName?: string;
  profileSha256?: string;
  attachments: Record<string, string>;
  updatedAt: string;
};
type Project = { id: string; name: string };

const sha = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const validUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

function channelRoot(channel: string): string {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(channel)) throw new Error('channel must be a kebab-case slug');
  return path.resolve('data', channel);
}

function inside(root: string, relative: string): string {
  const target = path.resolve(root, relative);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) throw new Error(`Unsafe channel asset path: ${relative}`);
  let current = path.parse(target).root;
  for (const part of target.slice(current.length).split(path.sep)) {
    current = path.join(current, part);
    try { if (lstatSync(current).isSymbolicLink()) throw new Error(`Symlink is not allowed: ${relative}`); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  return target;
}

function readBounded(file: string): Buffer {
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) throw new Error(`Channel asset exceeds 100 MiB: ${file}`);
    const out = Buffer.alloc(stat.size);
    let offset = 0;
    while (offset < out.length) offset += readSync(fd, out, offset, out.length - offset, null);
    return out;
  } finally { closeSync(fd); }
}

function readState(root: string): SyncState | null {
  const file = inside(root, STATE_FILE);
  if (!existsSync(file)) return null;
  if (!lstatSync(file).isFile()) throw new Error(`${STATE_FILE} is not a regular file`);
  const value = JSON.parse(readFileSync(file, 'utf8')) as Partial<SyncState>;
  if (value.format !== STATE_FORMAT || typeof value.workspace !== 'string' ||
      typeof value.projectId !== 'string' || !validUuid(value.projectId) ||
      (value.profileSha256 !== undefined && !/^[a-f0-9]{64}$/.test(value.profileSha256)) ||
      !value.attachments || typeof value.attachments !== 'object' || Array.isArray(value.attachments) ||
      Object.entries(value.attachments).some(([relative, hash]) =>
        !ALLOWED_ROOTS.some((allowed) => relative.startsWith(`${allowed}/`)) ||
        typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash))) {
    throw new Error(`${STATE_FILE} has an unsupported format`);
  }
  return value as SyncState;
}

function writeState(root: string, state: Omit<SyncState, 'format' | 'updatedAt'>) {
  mkdirSync(root, { recursive: true });
  const target = inside(root, STATE_FILE);
  const temporary = `${target}.${randomUUID()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify({ ...state, format: STATE_FORMAT, updatedAt: new Date().toISOString() }, null, 2)}\n`, { flag: 'wx' });
  renameSync(temporary, target);
}

function mime(relative: string): string {
  const ext = path.extname(relative).toLowerCase();
  const value: Record<string, string> = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
    '.mp4': 'video/mp4', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4',
    '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.flac': 'audio/flac', '.md': 'text/markdown',
  };
  if (!value[ext]) throw new Error(`Unsupported channel asset type: ${relative}`);
  return value[ext];
}

function localAssets(root: string): Map<string, { bytes: Buffer; sha256: string; mime: string }> {
  const result = new Map<string, { bytes: Buffer; sha256: string; mime: string }>();
  let total = 0;
  const walk = (relative: string) => {
    const dir = inside(root, relative);
    if (!existsSync(dir)) return;
    if (!lstatSync(dir).isDirectory()) throw new Error(`Channel asset root is not a directory: ${relative}`);
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const child = `${relative}/${entry.name}`;
      const target = inside(root, child);
      if (entry.isDirectory()) walk(child);
      else if (!entry.isFile() || lstatSync(target).isSymbolicLink()) throw new Error(`Channel asset is not a regular file: ${child}`);
      else {
        const bytes = readBounded(target);
        if (bytes.length === 0) throw new Error(`Channel asset is empty: ${child}`);
        total += bytes.length;
        if (total > MAX_TOTAL_BYTES || result.size >= 10_000) throw new Error('Channel assets exceed the 500 MiB or 10,000 file limit');
        result.set(child, { bytes, sha256: sha(bytes), mime: mime(child) });
      }
    }
  };
  for (const rootName of ALLOWED_ROOTS) walk(rootName);
  return result;
}

async function json<T>(client: PortalClient, method: 'GET' | 'POST' | 'PUT' | 'DELETE', requestPath: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
  const response = await client.requestRaw({ method, path: requestPath, scope: 'workspace', response: 'json', body, headers });
  return response.data as T;
}

async function resolveProject(client: PortalClient, root: string, channel: string, explicit?: string) {
  const state = readState(root);
  if (state && state.workspace !== client.workspace) throw new Error(`${STATE_FILE} belongs to workspace ${state.workspace}, not ${client.workspace}`);
  if (explicit && !validUuid(explicit)) throw new Error('projectId must be a UUID');
  if (state && explicit && state.projectId !== explicit) throw new Error(`${STATE_FILE} already pins project ${state.projectId}`);
  const projectId = explicit ?? state?.projectId;
  if (projectId) {
    let selected: Project;
    try { selected = await json<Project>(client, 'GET', `/projects/${projectId}`); }
    catch (error) { if ((error as { status?: number }).status === 404) throw new Error(`Project ${projectId} was not found in workspace ${client.workspace}`); throw error; }
    if (selected.id !== projectId || typeof selected.name !== 'string') throw new Error('Portal returned an invalid project');
    return { state, project: selected };
  }
  const projects = await json<Project[]>(client, 'GET', '/projects');
  const matches = projects.filter((item) => validUuid(item.id) && item.name === channel);
  if (matches.length !== 1) throw new Error(matches.length ? `More than one project is named ${channel}; pass projectId` : `No project is named ${channel}; pass projectId once to pin it`);
  return { state, project: matches[0] };
}

async function remoteProfile(client: PortalClient, projectId: string) {
  try { return await json<{ content: string; sha256: string }>(client, 'GET', `/projects/${projectId}/profile`); }
  catch (error) { if ((error as { status?: number }).status === 404) return null; throw error; }
}

async function remoteAttachments(client: PortalClient, projectId: string) {
  return (await json<{ items: RemoteAttachment[] }>(client, 'GET', `/projects/${projectId}/attachments`)).items;
}

function conflict(kind: string, relative: string): never {
  const error = new Error(`${kind} conflict: ${relative}`) as Error & { status?: number; code?: string };
  error.status = 409; error.code = 'channel_sync_conflict';
  throw error;
}

function replaceFile(root: string, relative: string, bytes: Uint8Array, backupRoot?: string) {
  const target = inside(root, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  if (existsSync(target) && backupRoot) {
    const backup = inside(root, `${backupRoot}/${relative}`);
    mkdirSync(path.dirname(backup), { recursive: true });
    writeFileSync(backup, readBounded(target), { flag: 'wx' });
  }
  const temporary = `${target}.${randomUUID()}.tmp`;
  writeFileSync(temporary, bytes, { flag: 'wx' });
  renameSync(temporary, target);
}

export async function channelSync(client: PortalClient, args: { action: 'pull' | 'push' | 'status'; channel: string; projectId?: string }) {
  const root = channelRoot(args.channel);
  mkdirSync(root, { recursive: true });
  const { state, project } = await resolveProject(client, root, args.channel, args.projectId);
  const [profile, attachments] = await Promise.all([remoteProfile(client, project.id), remoteAttachments(client, project.id)]);
  if (profile && (!/^[a-f0-9]{64}$/.test(profile.sha256) || Buffer.byteLength(profile.content) > MAX_PROFILE_BYTES || sha(profile.content) !== profile.sha256)) throw new Error('Portal returned an invalid channel profile');
  if (attachments.length > 10_000 || attachments.reduce((total, item) => total + item.byteSize, 0) > MAX_TOTAL_BYTES ||
      attachments.some((item) => !validUuid(item.id) || !/^[a-f0-9]{64}$/.test(item.sha256) || !Number.isSafeInteger(item.byteSize) || item.byteSize < 1 || item.byteSize > MAX_FILE_BYTES) ||
      new Set(attachments.map((item) => item.relativePath)).size !== attachments.length) throw new Error('Portal returned an invalid channel asset manifest');
  const remote = new Map(attachments.map((item) => [item.relativePath, item]));
  if (attachments.some((item) => !ALLOWED_ROOTS.some((allowed) => item.relativePath.startsWith(`${allowed}/`)))) throw new Error('Portal manifest contains a path outside the channel asset allowlist');
  for (const item of attachments) inside(root, item.relativePath);
  const profilePath = inside(root, PROFILE_FILE);
  const localProfile = existsSync(profilePath) ? readBounded(profilePath) : null;
  const local = localAssets(root);
  const summary = {
    action: args.action, workspace: client.workspace, projectId: project.id, projectName: project.name,
    profile: { local: localProfile ? sha(localProfile) : null, remote: profile?.sha256 ?? null, base: state?.profileSha256 ?? null },
    attachments: { local: local.size, remote: remote.size, base: Object.keys(state?.attachments ?? {}).length },
  };
  if (args.action === 'status') return summary;

  if (args.action === 'pull') {
    const staged = new Map<string, Buffer>();
    const temporaryRoot = path.join(root, '.portal-local', `project-download-${randomUUID()}`);
    mkdirSync(temporaryRoot, { recursive: true });
    try {
      for (const item of attachments) {
        const temporary = path.join(temporaryRoot, `${randomUUID()}.download`);
        const response = await client.requestRaw({ method: 'GET', path: `/projects/${project.id}/attachments/${item.id}`, scope: 'workspace', response: 'binary', targetFile: temporary });
        const bytes = readBounded(temporary);
        if (bytes.length !== item.byteSize || sha(bytes) !== item.sha256) throw new Error(`Attachment download mismatch: ${item.relativePath}`);
        staged.set(item.relativePath, bytes);
      }
      const backupRoot = `.portal-local/project-attachments-${randomUUID()}`;
      const localProfileSha = localProfile ? sha(localProfile) : undefined;
      if (profile) {
        const base = state?.profileSha256;
        if (base && localProfileSha !== base && profile.sha256 !== base && localProfileSha !== profile.sha256) conflict('profile', PROFILE_FILE);
      }
      for (const [relative, item] of remote) {
        const current = local.get(relative)?.sha256;
        const base = state?.attachments[relative];
        if (base && current !== base && item.sha256 !== base && current !== item.sha256) conflict('attachment', relative);
      }
      if (profile) {
        if (localProfileSha !== profile.sha256) replaceFile(root, PROFILE_FILE, Buffer.from(profile.content), localProfile ? backupRoot : undefined);
      }
      for (const [relative, item] of remote) {
        const current = local.get(relative)?.sha256;
        if (current !== item.sha256) replaceFile(root, relative, staged.get(relative)!, current ? backupRoot : undefined);
      }
      for (const [relative, base] of Object.entries(state?.attachments ?? {})) {
        if (remote.has(relative)) continue;
        const current = local.get(relative)?.sha256;
        if (current === base) unlinkSync(inside(root, relative));
      }
      writeState(root, { workspace: client.workspace, projectId: project.id, projectName: project.name, profileSha256: profile?.sha256, attachments: Object.fromEntries(attachments.map((item) => [item.relativePath, item.sha256])) });
      return { ...summary, pulled: attachments.length, backup: existsSync(path.join(root, backupRoot)) ? backupRoot : null };
    } finally { rmSync(temporaryRoot, { recursive: true, force: true }); }
  }

  if (!localProfile) throw new Error(`Missing ${path.relative(process.cwd(), profilePath)}`);
  const localProfileSha = sha(localProfile);
  const baseProfile = state?.profileSha256;
  if (!state && profile && profile.sha256 !== localProfileSha) conflict('profile', PROFILE_FILE);
  if (baseProfile && profile?.sha256 !== baseProfile && localProfileSha !== baseProfile && localProfileSha !== profile?.sha256) conflict('profile', PROFILE_FILE);
  for (const [relative, file] of local) {
    const existing = remote.get(relative);
    const base = state?.attachments[relative];
    if (existing && existing.sha256 !== file.sha256 && existing.sha256 !== base) conflict('attachment', relative);
  }
  if (profile?.sha256 !== localProfileSha) {
    if (baseProfile && profile?.sha256 !== baseProfile && localProfileSha === baseProfile) conflict('profile', PROFILE_FILE);
    await json(client, 'PUT', `/projects/${project.id}/profile`, { content: localProfile.toString('utf8'), sha256: localProfileSha, ...(profile ? { baseSha256: profile.sha256 } : {}) });
  }
  let uploaded = 0, unchanged = 0, deleted = 0, preserved = 0;
  for (const [relative, file] of local) {
    const existing = remote.get(relative);
    const base = state?.attachments[relative];
    if (existing?.sha256 === file.sha256) { unchanged++; continue; }
    const query = new URLSearchParams({ path: relative, sha256: file.sha256 });
    if (existing) query.set('baseSha256', existing.sha256);
    await client.requestRaw({ method: 'POST', path: `/projects/${project.id}/attachments?${query}`, scope: 'workspace', response: 'json', body: file.bytes, contentType: file.mime });
    uploaded++;
  }
  for (const item of attachments) {
    if (local.has(item.relativePath)) continue;
    const base = state?.attachments[item.relativePath];
    if (base === item.sha256) {
      await json(client, 'DELETE', `/projects/${project.id}/attachments/${item.id}?sha256=${item.sha256}`);
      deleted++;
    } else preserved++;
  }
  const nextAttachments = Object.fromEntries([...local].map(([relative, file]) => [relative, file.sha256]));
  writeState(root, { workspace: client.workspace, projectId: project.id, projectName: project.name, profileSha256: localProfileSha, attachments: nextAttachments });
  return { ...summary, uploaded, unchanged, deleted, preserved };
}
