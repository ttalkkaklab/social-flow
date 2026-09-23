/** Local recovery copies only. Preview is read-only; pruning requires the unchanged preview token. */
import { createHash } from 'node:crypto';
import { lstatSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { episodeDirOf } from './portal-episode.js';
import { safeAttachmentTarget } from './portal-attachments.js';

export const backupSchema = z.object({
  episodeDir: z.string().min(1),
  keep: z.number().int().min(1).max(1000).default(10),
  apply: z.boolean().default(false),
  confirm: z.string().regex(/^[a-f0-9]{64}$/).optional(),
}).refine(a => !a.apply || a.confirm, { message: 'Preview first, then pass its plan token as confirm to apply.' });

type Kind = 'board' | 'scenarios' | 'images' | 'attachments';
type Entry = { path: string; kind: Kind; timestamp: string; files: number; bytes: number };
const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const dated = /^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)-(r\d+|scenarios)$/;

function kindOf(name: string, root: string): { kind: Kind; time?: number } | null {
  const stamp = dated.exec(name);
  if (root === 'storyboard/.portal-local' && stamp) {
    const iso = stamp[1].replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, 'T$1:$2:$3.$4Z');
    const time = Date.parse(iso);
    if (Number.isFinite(time) && new Date(time).toISOString() === iso) return { kind: stamp[2] === 'scenarios' ? 'scenarios' : 'board', time };
  }
  if (root === 'storyboard/.portal-local' && new RegExp(`^images-${uuid}$`).test(name)) return { kind: 'images' };
  if (root === '.portal-local' && new RegExp(`^attachments-${uuid}$`).test(name)) return { kind: 'attachments' };
  return null;
}

function statIfPresent(file: string) {
  try { return lstatSync(file); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}

export function manageBackups(input: z.input<typeof backupSchema>) {
  const args = backupSchema.parse(input);
  // Reuse the existing ancestor/symlink checks and macOS /tmp alias normalization.
  const dir = path.dirname(safeAttachmentTarget(episodeDirOf(args.episodeDir), 'backup-root-check'));
  const entries: Entry[] = [], ignored: string[] = [], fingerprint: unknown[] = [];
  let visited = 0;
  function scan(relative: string): { files: number; bytes: number } {
    if (++visited > 100000) throw new Error('Backup inventory exceeds 100000 entries; no backups were pruned.');
    const stat = lstatSync(path.join(dir, relative));
    if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) throw new Error(`Unsafe backup entry: ${relative}`);
    fingerprint.push([relative, stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs]);
    if (stat.isFile()) return { files: 1, bytes: stat.size };
    let files = 0, bytes = 0;
    for (const name of readdirSync(path.join(dir, relative)).sort()) {
      const child = scan(`${relative}/${name}`); files += child.files; bytes += child.bytes;
    }
    return { files, bytes };
  }
  for (const root of ['storyboard/.portal-local', '.portal-local']) {
    if (root.startsWith('storyboard/')) safeAttachmentTarget(dir, 'storyboard/backup-root-check');
    const rootStat = statIfPresent(path.join(dir, root));
    if (!rootStat) continue;
    if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) throw new Error(`Unsafe backup root: ${root}`);
    fingerprint.push([root, rootStat.dev, rootStat.ino]);
    for (const name of readdirSync(path.join(dir, root)).sort()) {
      const relative = `${root}/${name}`, type = kindOf(name, root);
      if (!type) { ignored.push(relative); continue; }
      const stat = lstatSync(path.join(dir, relative));
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Unsafe backup directory: ${relative}`);
      const sizes = scan(relative);
      entries.push({ path: relative, kind: type.kind, timestamp: new Date(type.time ?? stat.mtimeMs).toISOString(), ...sizes });
    }
  }
  entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp) || a.path.localeCompare(b.path));
  const counts = new Map<Kind, number>();
  const remove = entries.filter(entry => {
    const n = (counts.get(entry.kind) ?? 0) + 1; counts.set(entry.kind, n); return n > args.keep;
  });
  const plan = createHash('sha256').update(JSON.stringify({ dir, keep: args.keep, entries, ignored, fingerprint })).digest('hex');
  if (args.apply && args.confirm !== plan) throw new Error('Backup inventory changed or confirmation does not match. Preview again; nothing was pruned.');
  const deleted: string[] = [];
  let error: string | undefined;
  if (args.apply) {
    try {
      for (const entry of remove) { rmSync(path.join(dir, entry.path), { recursive: true }); deleted.push(entry.path); }
    } catch (cause) { error = `Pruning stopped: ${cause instanceof Error ? cause.message : String(cause)}`; }
  }
  return { episodeDir: dir, keep: args.keep, dryRun: !args.apply, plan, entries, ignored,
    remove: remove.map(e => e.path), reclaimBytes: remove.reduce((n, e) => n + e.bytes, 0), deleted,
    ...(error ? { error } : {}) };
}
