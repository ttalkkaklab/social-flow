/** Shot files are uploaded and linked before the next production operation. */
import { createHash, randomUUID } from 'node:crypto';
import { appendFileSync, closeSync, fstatSync, statSync, mkdirSync, openSync, readFileSync, readSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { portalClientFor, describePortalError } from './portal-client.js';
import { buildImportPayload, channelOfEpisodeDir, episodeDirOf, evaluateScenesJs, normalizeNarrationSpeakers, readPortalState, writePortalState } from './portal-episode.js';
const portalShotFields = {
    episodeDir: z.string().min(1),
    shotId: z.string().min(1).optional(),
    shotNo: z.number().int().positive().optional(),
    previzFile: z.string().min(1).optional(),
};
export const portalShotSchema = z.object(portalShotFields).refine(a => Number(Boolean(a.shotId)) + Number(a.shotNo !== undefined) === 1, 'Choose shotId or shotNo');
export const mediaUploadSchema = z.object({
    ...portalShotFields,
    kind: z.enum(['image', 'previz', 'video', 'narration']),
    file: z.string().min(1),
}).refine(a => Number(Boolean(a.shotId)) + Number(a.shotNo !== undefined) === 1, 'Choose shotId or shotNo');
const limits = { image: 5, previz: 10, video: 10, narration: 10 };
const mimeByExt = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.mp4': 'video/mp4', '.wav': 'audio/wav', '.mp3': 'audio/mpeg' };
class MediaTooLarge extends Error {
    bytes;
    constructor(bytes) {
        super('media exceeds upload limit');
        this.bytes = bytes;
    }
}
function recordOversize(dir, file, kind, bytes) {
    const result = { skipped: true, reason: 'oversized', kind, file, byteSize: bytes, limitBytes: limits[kind] * 1024 * 1024 };
    appendFileSync(path.join(dir, '.portal-media-skips.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...result }) + '\n');
    return result;
}
function readMedia(file, kind) {
    const mime = mimeByExt[path.extname(file).toLowerCase()];
    if (!mime || !(kind === 'image' ? mime.startsWith('image/') : kind === 'narration' ? mime.startsWith('audio/') : mime === 'video/mp4'))
        throw new Error('Media extension does not match its kind.');
    const limit = limits[kind] * 1024 * 1024, fd = openSync(file, 'r');
    try {
        const stat = fstatSync(fd);
        if (!stat.isFile() || !stat.size)
            throw new Error(`${kind} must be a regular nonempty file.`);
        if (stat.size > limit)
            throw new MediaTooLarge(stat.size);
        const buffer = Buffer.allocUnsafe(limit + 1);
        let size = 0;
        while (size < buffer.length) {
            const n = readSync(fd, buffer, size, buffer.length - size, null);
            if (!n)
                break;
            size += n;
        }
        if (!size)
            throw new Error('Media is empty.');
        if (size > limit)
            throw new MediaTooLarge(size);
        const bytes = buffer.subarray(0, size);
        return { bytes, mime, sha256: createHash('sha256').update(bytes).digest('hex') };
    }
    finally {
        closeSync(fd);
    }
}
export async function uploadShotMedia(args, fetchImpl) {
    const dir = episodeDirOf(path.resolve(args.episodeDir));
    const client = portalClientFor(channelOfEpisodeDir(dir), fetchImpl);
    if (!client)
        return { skipped: true };
    const state = readPortalState(dir);
    if (!state?.episodeId || state.workspace !== client.workspace || !Number.isSafeInteger(state.headRevisionNo) || state.headRevisionNo < 0)
        throw new Error('Save/pull this episode with the configured workspace first; a matching .portal.json and explicit head revision are required. Nothing was sent.');
    const root = realpathSync(dir), file = realpathSync(path.resolve(dir, args.file));
    if (!file.startsWith(root + path.sep))
        throw new Error('Media must be inside the episode directory, including symlinks.');
    const sb = path.join(dir, 'storyboard'), scenesFile = path.join(sb, 'scenes.js');
    const source = readFileSync(scenesFile, 'utf8'), stateSource = readFileSync(path.join(dir, '.portal.json'), 'utf8');
    const payload = buildImportPayload(dir), shots = payload.scenes;
    if (shots.some(s => !s || typeof s !== 'object' || Array.isArray(s)))
        throw new Error('Every shot must be an object.');
    const index = args.shotId ? shots.findIndex(s => s.id === args.shotId) : (args.shotNo ?? 0) - 1;
    if (index < 0 || index >= shots.length || (args.shotId && shots.filter(s => s.id === args.shotId).length !== 1))
        throw new Error('Unknown or ambiguous shot target.');
    if (!args.shotId && shots[index].id !== undefined)
        throw new Error('Use shotId for a shot that has an ID.');
    const initial = statSync(file);
    if (initial.isFile() && initial.size > limits[args.kind] * 1024 * 1024)
        return recordOversize(dir, file, args.kind, initial.size);
    const unchanged = () => readFileSync(scenesFile, 'utf8') === source && readFileSync(path.join(dir, '.portal.json'), 'utf8') === stateSource;
    const lock = path.join(dir, '.portal-media.lock');
    let fd;
    try {
        fd = openSync(lock, 'wx');
    }
    catch {
        throw new Error('Another media upload is active for this episode. After a crash, inspect .portal-media.lock before removing it.');
    }
    let uploaded, revisionNo, recoveryFile;
    let phase = 'validate';
    try {
        const { data: head } = await client.getEpisode(state.episodeId);
        if (head.headRevisionNo !== state.headRevisionNo)
            throw new Error('Portal head moved. Side-pull and merge before uploading; no blob or checkpoint sent.');
        const media = readMedia(file, args.kind);
        if (!unchanged())
            throw new Error('Local board/state changed before upload.');
        phase = 'upload';
        const { data } = await client.uploadMedia(state.episodeId, args.kind, media.bytes, media.mime);
        uploaded = data;
        if (!z.string().uuid().safeParse(data.id).success || data.sha256 !== media.sha256 || data.byteSize !== media.bytes.length || data.mime !== media.mime || data.kind !== args.kind)
            throw new Error('Portal response does not match uploaded bytes/kind.');
        const target = args.shotId ? `window.SCENES.find(shot => shot.id === ${JSON.stringify(args.shotId)})` : `window.SCENES[${index}]`;
        const existing = args.kind === 'image' ? shots[index].portalImageId : shots[index].portalMedia?.[args.kind];
        const assignment = args.kind === 'image' ? `${target}.portalImageId = ${JSON.stringify(data.id)};`
            : `${target}.portalMedia = { ...${target}.portalMedia, ${JSON.stringify(args.kind)}: ${JSON.stringify(data.id)} };`;
        const next = source + (existing === data.id ? '' : `\n// Portal shot media UUID (no local path).\n${assignment}\n`);
        const backup = path.join(sb, '.portal-local', `media-${randomUUID()}`);
        mkdirSync(backup, { recursive: true });
        writeFileSync(path.join(backup, 'scenes.js'), source);
        recoveryFile = path.join(backup, 'uploaded-scenes.js');
        writeFileSync(recoveryFile, next);
        if (!unchanged())
            throw new Error('Local board/state changed; upload is not linked.');
        phase = 'checkpoint';
        const saved = await client.checkpoint(state.episodeId, { stage: head.stage ?? 'board', sourceHost: client.holder, baseRevisionNo: state.headRevisionNo,
            scenes: normalizeNarrationSpeakers(evaluateScenesJs(next).scenes, payload.characters),
            meta: payload.episode.meta, characters: payload.characters, narratorCharacterId: payload.narratorCharacterId,
            documents: payload.documents.map(d => d.filename === 'scenes.js' ? { ...d, content: next } : d), note: `Link shot ${args.kind}` });
        revisionNo = saved.data.revisionNo;
        if (!Number.isSafeInteger(revisionNo) || revisionNo < state.headRevisionNo)
            throw new Error('Invalid checkpoint revision. Side-pull before proceeding.');
        phase = 'local';
        if (!unchanged())
            throw new Error('Portal saved; local board/state changed and was preserved.');
        const tmp = `${scenesFile}.${randomUUID()}.tmp`;
        try {
            writeFileSync(tmp, next);
            renameSync(tmp, scenesFile);
        }
        finally {
            rmSync(tmp, { force: true });
        }
        writePortalState(dir, { headRevisionNo: revisionNo });
        return { skipped: false, episodeId: state.episodeId, revisionNo, kind: args.kind, id: data.id, sha256: data.sha256 };
    }
    catch (error) {
        if (error instanceof MediaTooLarge)
            return recordOversize(dir, file, args.kind, error.bytes);
        throw new Error(JSON.stringify({ result: 'incomplete', phase, file, uploaded, revisionNo, recoveryFile, error: describePortalError(error),
            next: phase === 'validate' ? 'Resolve the local target or side-pull/merge the head. No generation was called.' : 'Keep the existing media file. Do not regenerate it. Side-pull/merge the head and recovery copy before retrying with an explicit base. Unlinked uploads may be cleaned after 24h.' }));
    }
    finally {
        closeSync(fd);
        rmSync(lock, { force: true });
    }
}
/** This function wraps real generation handlers; awaiting previz upload precedes the vendor callback. */
export async function withShotMedia(args, kind, run, output, fetchImpl) {
    const raw = args?.portal;
    if (!raw)
        return run();
    const dir = raw.episodeDir;
    const configured = portalClientFor(typeof dir === 'string' ? channelOfEpisodeDir(dir) : undefined, fetchImpl);
    if (!configured)
        return run();
    const target = portalShotSchema.parse(raw);
    if (kind === 'video') {
        if (!target.previzFile)
            throw new Error('Pass portal.previzFile. Video generation has not been called.');
        await uploadShotMedia({ ...target, kind: 'previz', file: target.previzFile }, fetchImpl);
    }
    const result = await run(), file = output(result);
    if (!file)
        return result;
    try {
        return { ...result, portalMedia: await uploadShotMedia({ ...target, kind, file }, fetchImpl) };
    }
    catch (error) {
        return { ...result, portalMedia: { error: describePortalError(error), file, next: 'Media already exists. Retry portal_shot_media_upload; do not repeat generation.' } };
    }
}
export function portalMediaReport(result) { return result.portalMedia ? `\n\nPortal media: ${JSON.stringify(result.portalMedia)}` : ''; }
export function withoutPortal(args) {
    if (!args || typeof args !== 'object' || Array.isArray(args))
        return args;
    const { portal: _portal, ...rest } = args;
    return rest;
}
