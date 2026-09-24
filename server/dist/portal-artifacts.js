import { closeSync, existsSync, fstatSync, openSync, readFileSync, readSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { channelOfEpisodeDir, episodeDirOf, readPortalState } from './portal-episode.js';
import { portalClientFor } from './portal-client.js';
const platform = z.enum(['youtube', 'instagram', 'threads', 'facebook']);
const output = z.object({
    platform,
    title: z.string().max(300).optional(),
    description: z.string().max(10_000).optional(),
    hashtags: z.array(z.string().min(1).max(100)).max(100).default([]),
    coverMediaId: z.string().uuid().nullable().optional(),
});
export const artifactSyncSchema = z.object({
    episodeDir: z.string().min(1),
    episodeId: z.string().uuid().optional(),
    outputs: z.array(output).max(4).optional(),
    uploadCover: z.boolean().default(true),
});
export const publicationRecordSchema = z.object({
    episodeDir: z.string().min(1).optional(),
    episodeId: z.string().uuid().optional(),
    channel: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/).optional(),
    platform,
    postId: z.string().min(1).max(300),
    permalink: z.string().url().max(2_000),
    approvedBy: z.string().max(300).optional(),
    publishedAt: z.string().datetime().default(() => new Date().toISOString()),
    captionHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
});
function safeRead(file, max = 10_000) {
    if (!existsSync(file))
        return undefined;
    const value = readFileSync(file, 'utf8');
    if (Buffer.byteLength(value) > max)
        throw new Error(`${path.relative(process.cwd(), file)} exceeds ${max} bytes.`);
    return value.trim();
}
function hashtags(value) {
    return [...new Set(value.match(/#[\p{L}\p{N}_-]+/gu) ?? [])];
}
function youtubeMeta(source) {
    const sections = new Map();
    const headings = [...source.matchAll(/^##\s+(title|description|tags|publish)\s*$/gmi)];
    headings.forEach((match, index) => {
        const start = match.index + match[0].length;
        const end = headings[index + 1]?.index ?? source.length;
        sections.set(match[1].toLowerCase(), source.slice(start, end).trim());
    });
    const title = sections.get('title');
    const description = sections.get('description');
    const tags = sections.get('tags') ?? '';
    if (!title || !description)
        throw new Error('output/youtube/meta.md needs ## title and ## description.');
    const parsedTags = hashtags(tags);
    return { platform: 'youtube', title, description, hashtags: parsedTags.length ? parsedTags : tags.split(/[,\n]/).map(v => v.trim()).filter(Boolean).map(v => v.startsWith('#') ? v : `#${v}`) };
}
function readOutputs(dir) {
    const specs = [
        ['instagram', 'caption.md'],
        ['threads', 'post.md'],
        ['facebook', 'post.md'],
    ];
    const outputs = [];
    const yt = safeRead(path.join(dir, 'output', 'youtube', 'meta.md'));
    if (yt)
        outputs.push(youtubeMeta(yt));
    for (const [name, file] of specs) {
        const body = safeRead(path.join(dir, 'output', name, file));
        if (body)
            outputs.push({ platform: name, description: body, hashtags: hashtags(body) });
    }
    return outputs;
}
function readCosts(dir) {
    const tally = path.join(dir, '.work', 'cost-tally.tsv');
    if (!existsSync(tally))
        return undefined;
    const pricesFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../skills/autoproduce/references/prices.tsv');
    const prices = new Map();
    for (const row of readFileSync(pricesFile, 'utf8').split(/\r?\n/)) {
        if (!row.trim() || row.trimStart().startsWith('#'))
            continue;
        const [item, , raw] = row.split('\t');
        if (item && raw)
            prices.set(item.trim(), raw.trim() === '?' ? null : Number(raw));
    }
    const lines = [];
    let actualUsd = 0;
    const unpricedItems = new Set();
    for (const row of readFileSync(tally, 'utf8').split(/\r?\n/)) {
        if (!row.trim() || row.trimStart().startsWith('#'))
            continue;
        const [rawItem, rawQuantity, ...memo] = row.split('\t');
        const item = rawItem.trim(), quantity = Number(rawQuantity);
        if (!item || !Number.isFinite(quantity) || quantity < 0)
            throw new Error(`Invalid cost tally line: ${row}`);
        const unit = prices.get(item);
        const costUsd = typeof unit === 'number' && Number.isFinite(unit) ? unit * quantity : null;
        if (costUsd === null)
            unpricedItems.add(item);
        else
            actualUsd += costUsd;
        lines.push({ item, quantity, note: memo.join('\t').trim(), costUsd });
    }
    return { lines, actualUsd, complete: unpricedItems.size === 0, unpricedItems: [...unpricedItems], source: '.work/cost-tally.tsv' };
}
function readSmallMedia(file) {
    const fd = openSync(file, 'r');
    try {
        const stat = fstatSync(fd);
        if (!stat.isFile() || !stat.size)
            throw new Error('Cover must be a regular nonempty file.');
        if (stat.size > 5 * 1024 * 1024)
            throw new Error('Cover exceeds the 5 MiB image limit.');
        const bytes = Buffer.allocUnsafe(stat.size);
        let size = 0;
        while (size < bytes.length) {
            const n = readSync(fd, bytes, size, bytes.length - size, null);
            if (!n)
                break;
            size += n;
        }
        return bytes.subarray(0, size);
    }
    finally {
        closeSync(fd);
    }
}
function resolveEpisodeId(dir, explicit) {
    const recorded = dir ? readPortalState(dir)?.episodeId : undefined;
    if (recorded && explicit && recorded !== explicit)
        throw new Error('episodeId conflicts with .portal.json.');
    const id = explicit ?? recorded;
    if (!id)
        throw new Error('episodeId or an episodeDir with .portal.json is required.');
    return id;
}
export async function syncEpisodeArtifacts(args, fetchImpl) {
    const dir = episodeDirOf(path.resolve(args.episodeDir));
    const client = await portalClientFor(channelOfEpisodeDir(dir), fetchImpl);
    if (!client)
        return { skipped: true };
    const state = readPortalState(dir);
    if (state?.workspace && state.workspace !== client.workspace)
        throw new Error(`Workspace mismatch — .portal.json names "${state.workspace}" but the key opens "${client.workspace}". Nothing was sent.`);
    const episodeId = resolveEpisodeId(dir, args.episodeId);
    const outputs = args.outputs ?? readOutputs(dir);
    let coverMediaId;
    const cover = path.join(dir, 'output', 'video', 'cover.jpg');
    if (args.uploadCover && existsSync(cover)) {
        const file = realpathSync(cover), root = realpathSync(dir);
        if (!file.startsWith(root + path.sep))
            throw new Error('Cover must stay inside this episode.');
        coverMediaId = (await client.uploadMedia(episodeId, 'image', readSmallMedia(file), 'image/jpeg')).data.id;
    }
    const linked = outputs.map(entry => entry.platform === 'threads' || !coverMediaId ? entry : { ...entry, coverMediaId });
    const costs = readCosts(dir);
    const body = { ...(linked.length ? { outputs: linked } : {}), ...(costs ? { costs } : {}) };
    if (!Object.keys(body).length)
        throw new Error('No platform copy or cost tally found.');
    return (await client.updateArtifacts(episodeId, body)).data;
}
export async function recordPublication(args, fetchImpl) {
    const dir = args.episodeDir ? episodeDirOf(path.resolve(args.episodeDir)) : undefined;
    const channel = dir ? channelOfEpisodeDir(dir) : args.channel;
    const client = await portalClientFor(channel, fetchImpl);
    if (!client)
        return { skipped: true };
    const state = dir ? readPortalState(dir) : null;
    if (state?.workspace && state.workspace !== client.workspace)
        throw new Error(`Workspace mismatch — .portal.json names "${state.workspace}" but the key opens "${client.workspace}". Nothing was sent.`);
    const episodeId = resolveEpisodeId(dir, args.episodeId);
    const { episodeDir: _episodeDir, episodeId: _episodeId, channel: _channel, ...body } = args;
    return (await client.recordPublication(episodeId, body)).data;
}
