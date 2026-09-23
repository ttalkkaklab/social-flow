import { createHash, randomUUID } from 'node:crypto';
import { constants, closeSync, existsSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { PortalAttachment, PortalClient } from './portal-client.js';

const LIMIT = 10 * 1024 * 1024;
const MANIFEST = '.portal-attachments.json';
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const ignored = (part: string) => ['.git', 'node_modules', '.portal.json', MANIFEST, '.portal-head', '.portal-local', '.DS_Store'].includes(part) || part === '.env' || part.startsWith('.env.');

export function validateAttachmentPath(value: string): string {
  if (!value || Buffer.byteLength(value) > 1024 || /[\\\x00-\x1f\x7f:]/.test(value) || value.startsWith('/') ||
      value.split('/').some(p => !p || p === '.' || p === '..' || /[. ]$/.test(p) || ignored(p))) throw new Error(`Unsafe attachment path: ${value}`);
  return value;
}

/** Check every existing ancestor, including the episode root, before any I/O. */
export function safeAttachmentTarget(root: string, relative: string): string {
  validateAttachmentPath(relative);
  const absoluteRoot = path.resolve(root);
  const canonicalRoot = process.platform === "darwin" ? absoluteRoot.replace(/^\/var(?=\/|$)/, "/private/var").replace(/^\/tmp(?=\/|$)/, "/private/tmp") : absoluteRoot;
  const target = path.resolve(canonicalRoot, relative);
  let current = path.parse(target).root;
  for (const part of target.slice(current.length).split(path.sep)) {
    current = path.join(current, part);
    try { if (lstatSync(current).isSymbolicLink()) throw new Error(`Symlink is not an attachment target: ${relative}`); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  return target;
}

function readBounded(root: string, relative: string): Buffer {
  const file = safeAttachmentTarget(root, relative);
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > LIMIT) throw new Error(`Not a regular file of at most 10 MiB: ${relative}`);
    const bytes = Buffer.alloc(LIMIT + 1);
    let size = 0, count = 0;
    while ((count = readSync(fd, bytes, size, bytes.length - size, null)) > 0) { size += count; if (size > LIMIT) throw new Error(`File grew past 10 MiB: ${relative}`); }
    return bytes.subarray(0, size);
  } finally { closeSync(fd); }
}

function mime(relative: string): string {
  return ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.mp4': 'video/mp4', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.flac': 'audio/flac', '.html': 'text/html', '.md': 'text/markdown', '.json': 'application/json' } as Record<string, string>)[path.extname(relative).toLowerCase()] ?? 'application/octet-stream';
}

export async function uploadAttachments(client: PortalClient, episodeId: string, root: string) {
  const files: string[] = [], skipped: Array<{ path: string; reason: string }> = [];
  function walk(relative = '') {
    for (const item of readdirSync(path.join(root, relative), { withFileTypes: true })) {
      if (ignored(item.name)) continue;
      const name = relative ? `${relative}/${item.name}` : item.name;
      try {
        const target = safeAttachmentTarget(root, name);
        if (item.isDirectory()) walk(name);
        else if (!item.isFile()) throw new Error('Not a regular file');
        else if (lstatSync(target).size > LIMIT) throw new Error('Exceeds 10 MiB');
        else files.push(name);
      } catch (error) { skipped.push({ path: name, reason: String(error) }); }
    }
  }
  safeAttachmentTarget(root, "root-check");
  walk();
  if (files.length > 10000) throw new Error('Too many episode attachments');
  const metadataFile = path.join(root, MANIFEST);
  if (existsSync(metadataFile) && (lstatSync(metadataFile).isSymbolicLink() || lstatSync(metadataFile).size > LIMIT)) throw new Error('Unsafe attachment metadata file');
  const local = existsSync(metadataFile) ? JSON.parse(readFileSync(metadataFile, 'utf8')) as Record<string, PortalAttachment> : {};
  const { data } = await client.listAttachments(episodeId);
  const remote = new Map(data.items.map(item => [item.relativePath, item]));
  let uploaded = 0, unchanged = 0;
  for (const relative of files.sort()) {
    const bytes = readBounded(root, relative), sha256 = hash(bytes);
    const existing = remote.get(relative), provenance = local[relative]?.provenance;
    if (existing?.sha256 === sha256 && (!provenance || JSON.stringify(existing.provenance) === JSON.stringify(provenance))) { unchanged++; continue; }
    const { data: saved } = await client.uploadAttachment(episodeId, relative, bytes, mime(relative), provenance);
    if (saved.sha256 !== sha256 || saved.byteSize !== bytes.length || saved.relativePath !== relative) throw new Error(`Attachment upload mismatch: ${relative}`);
    uploaded++;
  }
  return { complete: skipped.length === 0, uploaded, unchanged, skipped };
}

/** Download and hash-check all files before replacing anything. Changed local files get a backup. */
export async function restoreAttachments(client: PortalClient, episodeId: string, root: string) {
  const { data } = await client.listAttachments(episodeId);
  if (data.items.length > 10000 || data.items.reduce((sum, item) => sum + item.byteSize, 0) > 500 * 1024 * 1024) throw new Error('Attachment manifest exceeds restore limits');
  const seen = new Set<string>();
  const staged: Array<{ item: PortalAttachment; bytes: Uint8Array }> = [];
  for (const item of data.items) {
    safeAttachmentTarget(root, item.relativePath);
    if (seen.has(item.relativePath) || !/^[a-f0-9]{64}$/.test(item.sha256) || !Number.isSafeInteger(item.byteSize) || item.byteSize < 0 || item.byteSize > LIMIT) throw new Error('Invalid attachment manifest');
    seen.add(item.relativePath);
    const bytes = await client.downloadAttachment(episodeId, item.id);
    if (bytes.length !== item.byteSize || hash(bytes) !== item.sha256) throw new Error(`Attachment hash mismatch: ${item.relativePath}`);
    staged.push({ item, bytes });
  }
  const backup = `.portal-local/attachments-${randomUUID()}`;
  for (const { item, bytes } of staged) {
    const target = safeAttachmentTarget(root, item.relativePath);
    mkdirSync(path.dirname(target), { recursive: true });
    if (existsSync(target) && !readBounded(root, item.relativePath).equals(Buffer.from(bytes))) {
      // Reserved backup roots are never accepted from the remote manifest.
      const backupRoot = path.join(root, backup);
      safeAttachmentTarget(root, '.attachment-backup-check');
      if (existsSync(path.join(root, '.portal-local')) && lstatSync(path.join(root, '.portal-local')).isSymbolicLink()) throw new Error('Unsafe backup directory');
      const backupFile = path.join(backupRoot, item.relativePath);
      mkdirSync(path.dirname(backupFile), { recursive: true });
      writeFileSync(backupFile, readBounded(root, item.relativePath), { flag: 'wx' });
    }
    const temporary = `${target}.${randomUUID()}.tmp`;
    writeFileSync(temporary, bytes, { flag: 'wx' });
    safeAttachmentTarget(root, item.relativePath);
    renameSync(temporary, target);
  }
  mkdirSync(root, { recursive: true });
  const manifest = path.join(root, MANIFEST);
  if (existsSync(manifest) && lstatSync(manifest).isSymbolicLink()) throw new Error('Unsafe attachment metadata file');
  writeFileSync(manifest, JSON.stringify(Object.fromEntries(data.items.map(item => [item.relativePath, item])), null, 2));
  return { restored: staged.length, bytes: staged.reduce((n, file) => n + file.bytes.length, 0) };
}

/** Board writes can succeed before file sync fails. Report both facts without inviting a blind re-save. */
export async function attachmentSyncReport(action: () => Promise<unknown>) {
  try { return await action(); }
  catch (error) { return { complete: false, error: error instanceof Error ? error.message : String(error), next: 'Keep the local episode. The board operation already completed; attachment backup is incomplete. Retry portal_attachments_sync after fixing the error.' }; }
}
