/**
 * `portal_assets_search` · `portal_assets_get` — the ttalkkakstory **global asset library** (#87):
 * Gemini B-roll, BGM, effects and images the owner collected, stored outside any workspace.
 * Any channel's workspace key reads the same library, so a produce run finds a real clip or a bed
 * there before it pays a generator.
 *
 * `get` with `download` writes the file where the existing supplied-file lanes already look —
 * video under `storyboard/footage/` (a `stock_video` cut), music and effects under `.work/portal/`,
 * an image under `storyboard/images/stock/` — verifies the sha256 the portal declared, and returns
 * the `visual.license` block the storyboard checker requires on a supplied cut. Nothing here is a
 * gate: without a key the handler answers one line and the skill goes on to the paid lane.
 */
import { createHash } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, writeSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { episodeDirOf } from './portal-episode.js';
const channelArg = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/, 'kebab-case channel slug').optional();
const list = z.array(z.string().trim().min(1).max(64)).max(32).optional();
export const ASSET_TYPES = ['video', 'music', 'sfx', 'image'];
export const ASSET_ASPECTS = ['16:9', '9:16', '1:1', '4:3', '3:4', 'other'];
export const ASSET_SORTS = ['relevance', 'newest', 'duration', '-duration'];
export const assetsSearchSchema = z.object({
    channel: channelArg,
    episodeDir: z.string().min(1).optional(),
    query: z.string().trim().min(2).max(64),
    tags: list,
    tagsMode: z.enum(['any', 'all']).optional(),
    type: z.array(z.enum(ASSET_TYPES)).max(4).optional(),
    category: list,
    minDurationMs: z.number().int().min(0).optional(),
    maxDurationMs: z.number().int().min(0).optional(),
    aspect: z.array(z.enum(ASSET_ASPECTS)).max(6).optional(),
    sort: z.enum(ASSET_SORTS).optional(),
    limit: z.number().int().min(1).max(100).optional(),
    page: z.number().int().min(1).optional(),
});
export const assetsGetSchema = z.object({
    channel: channelArg,
    id: z.string().uuid(),
    episodeDir: z.string().min(1).optional(),
    download: z.boolean().optional(),
    shot: z.number().int().min(1).max(999).optional(),
}).refine(a => !a.download || a.episodeDir, 'download needs episodeDir');
/** The maximum the portal stores per file (contract §0-4); a longer body is refused before it lands. */
export const ASSET_MAX_BYTES = 100 * 1024 * 1024;
const EXT = { 'video/mp4': 'mp4', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/mp4': 'm4a', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
/** The search answer keeps the fields a skill decides on; prompt and extra stay on `get`. */
export function summarizeAsset(a) {
    return { id: a.id, sourceId: a.sourceId, type: a.type, category: a.category, categoryKo: a.categoryKo, title: a.title, descKo: a.descKo, descEn: a.descEn,
        tagsKo: a.tagsKo, tagsEn: a.tagsEn, mime: a.mime, byteSize: a.byteSize, durationMs: a.durationMs, width: a.width, height: a.height, aspect: a.aspect, ready: a.binary.ready };
}
export async function searchAssets(client, args) {
    const { data } = await client.assetsSearch({
        q: args.query, tags: args.tags?.join(','), tagsMode: args.tagsMode, type: args.type?.join(','), category: args.category?.join(','),
        minDurationMs: args.minDurationMs, maxDurationMs: args.maxDurationMs, aspect: args.aspect?.join(','), sort: args.sort, limit: args.limit ?? 24, page: args.page,
    });
    return { items: data.items.map(summarizeAsset), total: data.total, page: data.page, limit: data.limit, hasNext: data.hasNext,
        next: data.total ? 'Pick by descKo/tags and duration, then portal_assets_get with download:true and the episodeDir (video: also the shot number).' : 'No library match — go on to the existing lane (stock_search · music_generate_clip · generation).' };
}
/** A name the portal gave (sourceId) or the id head, made safe for a filename. */
function fileStem(a) {
    const raw = a.sourceId ?? a.id.slice(0, 8);
    const safe = raw.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[.-]+|[.-]+$/g, '');
    return safe || a.id.slice(0, 8);
}
/** Where the file goes, relative to the episode directory — the lanes produce already reads. */
export function assetTarget(a, shot) {
    const ext = EXT[a.mime] ?? 'bin';
    const stem = fileStem(a);
    if (a.type === 'video') {
        const clip = `footage/${shot ? `s${shot}-` : ''}portal-${stem}.${ext}`;
        return { relative: `storyboard/${clip}`, clip };
    }
    if (a.type === 'image') {
        const clip = `images/stock/portal-${stem}.${ext}`;
        return { relative: `storyboard/${clip}`, clip };
    }
    return { relative: `.work/portal/${stem}.${ext}` };
}
/** The `visual.license` record a supplied cut carries (render-routing.js checkLicense) — in-house material, no credit line. */
export function assetLicense(client, a) {
    return { provider: 'ttalkkakstory', url: client.pageUrl(a.urls.play), license: 'ttalkkakstory global asset library (in-house, Gemini generated)',
        licenseUrl: client.pageUrl(`/api/assets/${a.id}`), commercial: true, modify: true, attributionRequired: false, retrievedAt: new Date().toISOString().slice(0, 10), assetId: a.id, sha256: a.sha256 };
}
function sha256File(file) {
    return createHash('sha256').update(readFileSync(file)).digest('hex');
}
export async function getAsset(client, args) {
    const { data: asset } = await client.assetsGet(args.id);
    const license = assetLicense(client, asset);
    if (!args.download)
        return { asset, license };
    if (!asset.binary.ready)
        throw new Error(`Asset ${asset.id} has metadata only — its file is not on the portal yet. Nothing was written.`);
    if (!/^[a-f0-9]{64}$/.test(asset.sha256) || !Number.isSafeInteger(asset.byteSize) || asset.byteSize < 1 || asset.byteSize > ASSET_MAX_BYTES)
        throw new Error('Portal asset metadata is invalid.');
    const dir = episodeDirOf(path.resolve(args.episodeDir));
    if (!existsSync(dir) || !statSync(dir).isDirectory())
        throw new Error(`episodeDir is not a directory: ${dir}`);
    const target = assetTarget(asset, args.shot);
    const file = path.join(dir, target.relative);
    const result = { id: asset.id, sourceId: asset.sourceId, type: asset.type, mime: asset.mime, byteSize: asset.byteSize, durationMs: asset.durationMs, width: asset.width, height: asset.height,
        localPath: file, relativePath: target.relative, ...(target.clip ? { clip: target.clip } : {}), sha256: asset.sha256, license };
    if (existsSync(file)) {
        if (!statSync(file).isFile())
            throw new Error(`Target exists and is not a file: ${file}`);
        if (statSync(file).size === asset.byteSize && sha256File(file) === asset.sha256)
            return { ...result, downloaded: false, note: 'Same sha256 already on disk — not downloaded again.' };
        throw new Error(`${target.relative} exists with different contents. Move it aside before downloading asset ${asset.id}.`);
    }
    mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    const fd = openSync(tmp, 'wx');
    const hash = createHash('sha256');
    let size = 0;
    try {
        size = await client.assetsDownload(asset.id, chunk => { hash.update(chunk); writeSync(fd, chunk); }, asset.byteSize);
        closeSync(fd);
        if (size !== asset.byteSize || hash.digest('hex') !== asset.sha256)
            throw new Error(`Downloaded bytes do not match the portal's sha256/byteSize for asset ${asset.id}. Nothing was kept.`);
        renameSync(tmp, file);
    }
    catch (error) {
        try {
            closeSync(fd);
        }
        catch { /* already closed */ }
        rmSync(tmp, { force: true });
        throw error;
    }
    return { ...result, downloaded: true };
}
