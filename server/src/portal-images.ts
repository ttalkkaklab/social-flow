/** Bounded local images → portal blobs → one revision. No paths travel into shots. */
import { createHash, randomUUID } from 'node:crypto';
import { closeSync, existsSync, fstatSync, mkdirSync, openSync, readFileSync, readSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { type PortalClient, describePortalError } from './portal-client.js';
import { buildImportPayload, episodeDirOf, EPISODE_STAGES, evaluateScenesJs, normalizeNarrationSpeakers, readPortalState, writePortalState } from './portal-episode.js';

export const imageUploadSchema = z.object({
  episodeDir: z.string().min(1),
  stage: z.enum(EPISODE_STAGES),
  baseRevisionNo: z.number().int().nonnegative().safe().optional(),
  images: z.array(z.object({
    shotId: z.string().min(1).optional(),
    shotNo: z.number().int().min(1).optional(),
    file: z.string().min(1),
  }).refine(a => Number(Boolean(a.shotId)) + Number(a.shotNo !== undefined) === 1, 'Choose shotId or shotNo')).min(1).max(500).optional(),
});
const MAX_BYTES = 5 * 1024 * 1024;
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/** Read at most the limit plus one byte, even if the file grows after fstat. */
export function readImage(file: string): { bytes: Buffer; mime: string; sha256: string } {
  const fd = openSync(file, 'r');
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size === 0 || stat.size > MAX_BYTES) throw new Error('Image must be a regular nonempty file of at most 5 MiB.');
    const buffer = Buffer.allocUnsafe(MAX_BYTES + 1);
    let size = 0;
    while (size < buffer.length) {
      const n = readSync(fd, buffer, size, buffer.length - size, null);
      if (!n) break;
      size += n;
    }
    if (!size || size > MAX_BYTES) throw new Error('Image changed size or exceeds 5 MiB.');
    const bytes = buffer.subarray(0, size);
    const mime = bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) ? 'image/png'
      : bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff ? 'image/jpeg'
      : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' ? 'image/webp' : undefined;
    const extension = path.extname(file).toLowerCase();
    const expected: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
    if (!mime || expected[extension] !== mime) throw new Error('Image must be PNG, JPEG or WebP with a matching extension and signature. The portal also validates decoding.');
    return { bytes, mime, sha256: hash(bytes) };
  } finally { closeSync(fd); }
}

export async function uploadEpisodeImages(client: PortalClient, args: z.infer<typeof imageUploadSchema>, base: number) {
  const dir = episodeDirOf(args.episodeDir);
  const state = readPortalState(dir);
  if (!state?.episodeId) throw new Error('Save with portal_storyboard_save first to create/link the episode, then upload images. Nothing was sent.');
  const sb = path.join(dir, 'storyboard');
  const file = path.join(sb, 'scenes.js');
  const source = readFileSync(file, 'utf8');
  const stateSource = readFileSync(path.join(dir, '.portal.json'), 'utf8');
  const payload = buildImportPayload(dir);
  const shots = payload.scenes as Array<Record<string, unknown>>;
  if (shots.some(s => !s || typeof s !== 'object' || Array.isArray(s))) throw new Error('Every shot must be an object.');
  const ids = shots.map(s => s.id).filter(id => id !== undefined);
  if (ids.some(id => typeof id !== 'string' || !id) || new Set(ids).size !== ids.length) throw new Error('Shot IDs must be unique nonempty strings. Nothing was sent.');
  const skipped: number[] = [];
  const inputs: NonNullable<z.infer<typeof imageUploadSchema>['images']> = args.images ?? shots.flatMap((shot, index) => {
    const files = ['png', 'jpg', 'jpeg', 'webp'].map(ext => `images/scene-${index + 1}.${ext}`).filter(f => existsSync(path.join(sb, f)));
    if (files.length > 1) throw new Error(`Multiple images for shot ${index + 1}; choose one with images[].file.`);
    if (!files.length) { skipped.push(index + 1); return []; }
    return [{ ...(typeof shot.id === 'string' ? { shotId: shot.id } : { shotNo: index + 1 }), file: files[0] }];
  });
  if (inputs.length > 500) throw new Error('At most 500 images per call. Nothing was sent.');
  if (!inputs.length) throw new Error('No shot images found in storyboard/images/scene-N.{png,jpg,jpeg,webp}. Nothing was sent.');
  // Validate every target and file before any HTTP write. Explicit paths stay inside storyboard/.
  const root = realpathSync(sb);
  const seen = new Set<number>();
  const plan = inputs.map(input => {
    const index = input.shotId ? shots.findIndex(s => s.id === input.shotId) : (input.shotNo ?? 0) - 1;
    if (index < 0 || index >= shots.length || seen.has(index)) throw new Error('Unknown or duplicate shot target. Nothing was sent.');
    if (!input.shotId && shots[index].id !== undefined) throw new Error('Use shotId for shots that have an ID. Nothing was sent.');
    seen.add(index);
    const target = realpathSync(path.resolve(sb, input.file));
    if (!target.startsWith(root + path.sep)) throw new Error('Image path must stay inside storyboard/, including symlinks. Nothing was sent.');
    const { mime, sha256 } = readImage(target);
    return { index, file: target, mime, sha256, shotId: input.shotId, shotNo: index + 1 };
  });
  const uploaded: Array<{ shotId?: string; shotNo: number; imageId: string; sha256: string }> = [];
  let phase = 'upload';
  let revisionNo: number | undefined;
  let recoveryFile: string | undefined;
  const unchanged = () => readFileSync(file, 'utf8') === source && readFileSync(path.join(dir, '.portal.json'), 'utf8') === stateSource;
  try {
    if (!unchanged()) throw new Error('Local board or portal state changed during validation.');
    for (const item of plan) {
      const image = readImage(item.file);
      if (image.sha256 !== item.sha256) throw new Error('Image changed during upload; rerun with the intended files.');
      const { data } = await client.uploadImage(state.episodeId, image.bytes, image.mime);
      if (!z.string().uuid().safeParse(data.id).success || data.sha256 !== image.sha256 || data.byteSize !== image.bytes.length || data.mime !== image.mime)
        throw new Error('Portal image response does not match the uploaded bytes.');
      uploaded.push({ shotId: item.shotId, shotNo: item.shotNo, imageId: data.id, sha256: data.sha256 });
    }
    // Preserve authored JS, comments and approval metadata. Append only changed UUID assignments.
    const updates = uploaded.filter(item => shots[item.shotNo - 1].portalImageId !== item.imageId);
    const nextSource = source + (updates.length ? '\n// Portal image references (no local paths).\n' + updates.map(item => {
      const target = item.shotId ? `window.SCENES.find(shot => shot.id === ${JSON.stringify(item.shotId)})` : `window.SCENES[${item.shotNo - 1}]`;
      return `${target}.portalImageId = ${JSON.stringify(item.imageId)};`;
    }).join('\n') + '\n' : '');
    const scenes = normalizeNarrationSpeakers(evaluateScenesJs(nextSource).scenes, payload.characters);
    const documents = payload.documents.map(d => d.filename === 'scenes.js' ? { ...d, content: nextSource } : d);
    if (!unchanged()) throw new Error('Local board or portal state changed; uploaded blobs are not linked.');
    // Write a durable recovery copy before committing remotely; never hide a remote success on local I/O failure.
    const backup = path.join(sb, '.portal-local', `images-${randomUUID()}`);
    mkdirSync(backup, { recursive: true });
    writeFileSync(path.join(backup, 'scenes.js'), source);
    recoveryFile = path.join(backup, 'uploaded-scenes.js');
    writeFileSync(recoveryFile, nextSource);
    phase = 'checkpoint';
    const { data } = await client.checkpoint(state.episodeId, {
      stage: args.stage, baseRevisionNo: base, sourceHost: client.holder,
      scenes, meta: payload.episode.meta, characters: payload.characters,
      narratorCharacterId: payload.narratorCharacterId, documents,
      note: 'Link uploaded shot images',
    });
    if (!Number.isSafeInteger(data.revisionNo) || data.revisionNo <= base)
      throw new Error('Portal checkpoint returned an invalid revision; its outcome is unknown.');
    revisionNo = data.revisionNo;
    phase = 'local';
    if (!unchanged()) throw new Error('Portal revision saved, but local board or portal state changed. Local files were preserved.');
    const temporary = `${file}.${randomUUID()}.tmp`;
    try { writeFileSync(temporary, nextSource); renameSync(temporary, file); }
    finally { rmSync(temporary, { force: true }); }
    writePortalState(dir, { headRevisionNo: revisionNo });
    return { isError: false, text: JSON.stringify({ result: 'images linked', episodeId: state.episodeId, revisionNo, uploaded, skipped, recoveryFile }, null, 2) };
  } catch (error) {
    return { isError: true, text: JSON.stringify({ result: 'incomplete', phase, episodeId: state.episodeId,
      baseRevisionNo: base, revisionNo, uploaded, skipped, recoveryFile, error: describePortalError(error),
      next: phase === 'upload' ? 'No checkpoint sent. Fix the error and rerun; the portal deduplicates identical bytes. Unlinked blobs may be cleaned after 24h.'
        : phase === 'checkpoint' ? 'Checkpoint failed or its outcome is unknown. Keep local files and the recovery copy; side-pull the head, merge all local edits and image UUIDs, then save with that explicit base. Do not blindly retry a 409.'
        : 'Portal revision saved. Keep local edits; side-pull the head and merge with the recovery copy before saving again.',
    }, null, 2) };
  }
}
