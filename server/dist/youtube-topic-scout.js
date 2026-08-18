/**
 * Market topic scout — finds YouTube topics that have already taken off in my niche.
 *
 * Reproduces the VidIQ-style "multiple of channel average" with the Data API.
 * Absolute view counts have a different baseline for every channel size, so they
 * can't serve as the yardstick for picking topics. Only videos that reach 5x or
 * more of the same channel's recent-upload median count as outliers, and topic
 * phrases are extracted from their titles.
 *
 * YOUTUBE_API_KEY takes priority for auth — it's public data, so no OAuth is
 * needed and the publishing quota stays untouched. Without a key, the same
 * endpoints are called with the channel's OAuth (youtube.readonly).
 */
import { config } from './config.js';
import { buildQuery } from './http.js';
import { exchangeYoutubeAccessToken, loadYoutubeClient } from './sns-client.js';
const YT_DATA_BASE = 'https://www.googleapis.com/youtube/v3';
export const DEFAULT_MIN_MULTIPLIER = 5;
export const DEFAULT_MIN_VIEWS = 1_000;
export const DEFAULT_CHANNEL_LIMIT = 20;
export const DEFAULT_VIDEOS_PER_CHANNEL = 15;
export const DEFAULT_PUBLISHED_AFTER_DAYS = 90;
export const DEFAULT_KEYWORD_LIMIT = 15;
export const MIN_BASELINE_SAMPLES = 3;
export const COMMENT_HINT_CAP = 5;
const SEARCH_UNITS = 100;
const LIST_UNITS = 1;
function fail(status, message) {
    return { ok: false, status, body: message };
}
function okJson(payload) {
    return { ok: true, status: 200, body: JSON.stringify(payload) };
}
function parseJson(body) {
    try {
        const value = JSON.parse(body);
        return typeof value === 'object' && value !== null ? value : null;
    }
    catch {
        return null;
    }
}
function str(value) {
    return typeof value === 'string' ? value : value == null ? '' : String(value);
}
function maskKey(text) {
    return text.replace(/key=[^&\s"']+/g, 'key=***');
}
export function median(values) {
    const nums = values.filter((n) => Number.isFinite(n) && n >= 0).sort((a, b) => a - b);
    if (nums.length === 0)
        return null;
    const mid = Math.floor(nums.length / 2);
    return nums.length % 2 === 0 ? (nums[mid - 1] + nums[mid]) / 2 : nums[mid];
}
/** ISO-8601 duration (PT#H#M#S) → seconds. Parse failure is null. */
export function parseIsoDurationSeconds(iso) {
    if (!iso)
        return null;
    const match = iso.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
    if (!match)
        return null;
    const days = Number(match[1] || 0);
    const hours = Number(match[2] || 0);
    const minutes = Number(match[3] || 0);
    const seconds = Number(match[4] || 0);
    const total = days * 86_400 + hours * 3_600 + minutes * 60 + seconds;
    return total > 0 ? total : null;
}
/** Tokens that can't be topic phrases in titles/bodies. sns-issue-scout uses the same list. */
export const STOP = new Set([
    '그',
    '이',
    '저',
    '것',
    '수',
    '등',
    '및',
    '또',
    '더',
    '좀',
    '잘',
    '진짜',
    '그냥',
    '영상',
    '유튜브',
    'youtube',
    'shorts',
    'short',
    '쇼츠',
    '하는',
    '하는법',
    '총정리',
    '완벽',
    '정리',
    '후기',
    '리뷰',
    '꿀팁',
    '방법',
    '이유',
    '최신',
    '공개',
    '비법',
    '필수',
    '절대',
    '무조건',
    'the',
    'a',
    'to',
    'of',
    'and',
    'in',
    'on',
    'for',
    'with',
    'is',
    'you',
    'my',
    'your',
    'how',
    'why',
    'what',
]);
/** Strip particles and symbols from a title and extract tokens. */
export function tokenizeTitle(title) {
    return title
        .toLowerCase()
        .replace(/[#|[\]()【】「」]/g, ' ')
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter((token) => token.length >= 2 && !STOP.has(token) && !/^\d{4}$/.test(token));
}
/** 1~3-gram phrases. Duplicates within the same title count once. */
export function extractPhrases(title) {
    const tokens = tokenizeTitle(title);
    const phrases = new Set();
    for (let n = 1; n <= 3; n++) {
        for (let i = 0; i <= tokens.length - n; i++) {
            phrases.add(tokens.slice(i, i + n).join(' '));
        }
    }
    return [...phrases];
}
const QUESTION_RE = /[?？]|나요|가요|인가요|할까요|어떻게|왜 |어디서|언제 |얼마/;
export function looksLikeQuestion(text) {
    return QUESTION_RE.test(text);
}
export function scoreKeywords(outliers, limit) {
    const byPhrase = new Map();
    const add = (phrase, video, weight) => {
        const cur = byPhrase.get(phrase) ?? { score: 0, count: 0, best: 0, evidence: [] };
        cur.score += video.multiplier * weight;
        cur.count += 1;
        if (video.multiplier > cur.best)
            cur.best = video.multiplier;
        if (cur.evidence.length < 3 && !cur.evidence.some((e) => e.videoId === video.videoId)) {
            cur.evidence.push({ videoId: video.videoId, title: video.title, multiplier: round1(video.multiplier) });
        }
        byPhrase.set(phrase, cur);
    };
    for (const video of outliers) {
        for (const phrase of extractPhrases(video.title)) {
            const grams = phrase.split(' ').length;
            // single tokens are noisy — lower the score so they survive only when two or more videos share them
            const weight = grams >= 2 ? 1 : 0.35;
            add(phrase, video, weight);
        }
        for (const tag of video.tags ?? []) {
            const cleaned = tokenizeTitle(tag).join(' ');
            if (cleaned)
                add(cleaned, video, 0.4);
        }
    }
    const ranked = [...byPhrase.entries()]
        .map(([phrase, value]) => ({
        phrase,
        score: round1(value.score),
        outlierCount: value.count,
        bestMultiplier: round1(value.best),
        evidence: value.evidence,
    }))
        .filter((row) => row.phrase.split(' ').length >= 2 || row.outlierCount >= 2)
        .sort((a, b) => b.score - a.score ||
        b.phrase.split(' ').length - a.phrase.split(' ').length ||
        b.outlierCount - a.outlierCount);
    // on equal scores keep the longer phrase, and drop substrings of longer phrases already picked
    const kept = [];
    for (const row of ranked) {
        if (kept.some((k) => k.phrase.includes(row.phrase) && k.phrase !== row.phrase))
            continue;
        kept.push(row);
        if (kept.length >= limit)
            break;
    }
    return kept;
}
function round1(n) {
    return Math.round(n * 10) / 10;
}
function publishedAfterIso(days) {
    return new Date(Date.now() - days * 86_400_000).toISOString();
}
function isShortEnough(seconds, duration) {
    if (duration === 'any')
        return true;
    if (seconds == null)
        return true;
    return seconds <= 180;
}
async function youtubeGet(path, params, auth) {
    const query = auth.kind === 'key' ? { ...params, key: auth.key } : params;
    const url = `${YT_DATA_BASE}/${path}${buildQuery(query)}`;
    try {
        const res = await fetch(url, {
            method: 'GET',
            headers: auth.kind === 'bearer' ? { Authorization: `Bearer ${auth.token}` } : {},
            signal: AbortSignal.timeout(30_000),
        });
        const text = await res.text();
        if (res.ok)
            return { ok: true, status: res.status, body: text };
        return { ok: false, status: res.status, body: maskKey(text) };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return fail(502, `YouTube Data API call failed (${path}): ${maskKey(message)}`);
    }
}
function chunk(items, size) {
    const out = [];
    for (let i = 0; i < items.length; i += size)
        out.push(items.slice(i, i + size));
    return out;
}
async function resolveAuth(channel) {
    if (config.youtubeApiKey)
        return { auth: { kind: 'key', key: config.youtubeApiKey }, via: 'api_key' };
    const { client, error: clientError } = await loadYoutubeClient(channel);
    if (!client) {
        return {
            via: 'none',
            error: fail(400, (clientError?.body ?? 'No YouTube credentials.') +
                '\n→ youtube_topic_scout reads public data, so it needs YOUTUBE_API_KEY (recommended) or ' +
                'youtube.readonly in youtube-oauth-client.json. ' +
                'Issue the API key in the Google Cloud Console after enabling YouTube Data API v3. ' +
                'For OAuth, a token that only has the publishing youtube.upload scope gets search (100 units) rejected.'),
        };
    }
    const { token, error: tokenError } = await exchangeYoutubeAccessToken(client);
    if (!token)
        return { via: 'oauth', error: tokenError };
    return { auth: { kind: 'bearer', token }, via: 'oauth' };
}
async function ownChannelId(auth) {
    if (auth.kind !== 'bearer')
        return undefined;
    const res = await youtubeGet('channels', { part: 'id', mine: 'true' }, auth);
    if (!res.ok)
        return undefined;
    const id = str((parseJson(res.body)?.items?.[0] ?? {}).id);
    return id || undefined;
}
async function searchChannels(queries, auth, opts) {
    const hits = [];
    const errors = [];
    let units = 0;
    for (const query of queries) {
        const params = {
            part: 'snippet',
            type: 'video',
            q: query,
            maxResults: '25',
            order: 'viewCount',
            regionCode: opts.regionCode,
            relevanceLanguage: opts.language,
            publishedAfter: opts.publishedAfter,
            safeSearch: 'moderate',
        };
        if (opts.duration === 'short')
            params.videoDuration = 'short';
        const res = await youtubeGet('search', params, auth);
        units += SEARCH_UNITS;
        if (!res.ok) {
            errors.push(`search "${query}" HTTP ${res.status}: ${res.body.slice(0, 220)}`);
            continue;
        }
        for (const item of parseJson(res.body)?.items ?? []) {
            const snippet = item.snippet ?? {};
            const channelId = str(snippet.channelId);
            if (!channelId)
                continue;
            hits.push({ channelId, channelTitle: str(snippet.channelTitle) });
        }
    }
    return { hits, units, errors };
}
async function loadChannelUploads(channelIds, auth, videosPerChannel) {
    const byChannel = new Map();
    const errors = [];
    let units = 0;
    const playlistByChannel = new Map();
    for (const group of chunk(channelIds, 50)) {
        const res = await youtubeGet('channels', { part: 'snippet,statistics,contentDetails', id: group.join(',') }, auth);
        units += LIST_UNITS;
        if (!res.ok) {
            errors.push(`channels.list HTTP ${res.status}: ${res.body.slice(0, 200)}`);
            continue;
        }
        for (const item of parseJson(res.body)?.items ?? []) {
            const channelId = str(item.id);
            const snippet = item.snippet ?? {};
            const stats = item.statistics ?? {};
            const uploads = str(item.contentDetails?.relatedPlaylists?.uploads);
            const hidden = stats.hiddenSubscriberCount === true || stats.hiddenSubscriberCount === 'true';
            byChannel.set(channelId, {
                title: str(snippet.title),
                subscriberCount: hidden ? null : Number(stats.subscriberCount ?? 0),
                uploads: [],
            });
            if (uploads)
                playlistByChannel.set(channelId, uploads);
        }
    }
    const videoIds = [];
    const ownerByVideo = new Map();
    const playlistEntries = [...playlistByChannel.entries()];
    for (const group of chunk(playlistEntries, 5)) {
        const results = await Promise.all(group.map(([, playlistId]) => youtubeGet('playlistItems', { part: 'contentDetails', playlistId, maxResults: String(Math.min(videosPerChannel, 50)) }, auth)));
        units += results.length * LIST_UNITS;
        results.forEach((res, index) => {
            const channelId = group[index][0];
            if (!res.ok) {
                errors.push(`playlistItems ${channelId} HTTP ${res.status}: ${res.body.slice(0, 160)}`);
                return;
            }
            for (const item of parseJson(res.body)?.items ?? []) {
                const videoId = str(item.contentDetails?.videoId);
                if (!videoId)
                    continue;
                videoIds.push(videoId);
                ownerByVideo.set(videoId, channelId);
            }
        });
    }
    for (const group of chunk(videoIds, 50)) {
        const res = await youtubeGet('videos', { part: 'snippet,statistics,contentDetails', id: group.join(',') }, auth);
        units += LIST_UNITS;
        if (!res.ok) {
            errors.push(`videos.list HTTP ${res.status}: ${res.body.slice(0, 200)}`);
            continue;
        }
        for (const item of parseJson(res.body)?.items ?? []) {
            const videoId = str(item.id);
            const channelId = ownerByVideo.get(videoId) ?? str(item.snippet?.channelId);
            const bucket = byChannel.get(channelId);
            if (!bucket)
                continue;
            const snippet = item.snippet ?? {};
            const stats = item.statistics ?? {};
            const tags = Array.isArray(snippet.tags) ? snippet.tags.map((t) => str(t)).filter(Boolean) : [];
            bucket.uploads.push({
                videoId,
                title: str(snippet.title),
                channelId,
                channelTitle: bucket.title || str(snippet.channelTitle),
                views: Number(stats.viewCount ?? 0),
                publishedAt: snippet.publishedAt ? str(snippet.publishedAt) : null,
                durationSeconds: parseIsoDurationSeconds(str(item.contentDetails?.duration)),
                commentCount: Number(stats.commentCount ?? 0),
                tags,
            });
        }
    }
    return { byChannel, units, errors };
}
async function loadCommentGaps(outliers, auth) {
    const targets = outliers.slice(0, COMMENT_HINT_CAP);
    let units = 0;
    const results = await Promise.all(targets.map((video) => youtubeGet('commentThreads', { part: 'snippet', videoId: video.videoId, order: 'relevance', maxResults: '8', textFormat: 'plainText' }, auth)));
    units += results.length * LIST_UNITS;
    results.forEach((res, index) => {
        if (!res.ok)
            return;
        const gaps = [];
        for (const item of parseJson(res.body)?.items ?? []) {
            const top = item.snippet?.topLevelComment?.snippet;
            const text = str(top?.textDisplay || top?.textOriginal).replace(/\s+/g, ' ').trim();
            if (!text || !looksLikeQuestion(text))
                continue;
            if (gaps.length >= 3)
                break;
            gaps.push(text.slice(0, 140));
        }
        targets[index].gaps = gaps;
    });
    return units;
}
function collectQueries(input) {
    const extra = (input.extraQueries ?? []).map((q) => q.trim()).filter(Boolean);
    const seen = new Set();
    const out = [];
    for (const query of [input.query.trim(), ...extra]) {
        if (!query)
            continue;
        const key = query.toLowerCase();
        if (seen.has(key))
            continue;
        seen.add(key);
        out.push(query);
        if (out.length >= 4)
            break;
    }
    return out;
}
/**
 * Scout market topics. On success an ApiResult with a JSON body; on failure one carrying guidance.
 */
export async function youtubeTopicScout(input) {
    const queries = collectQueries(input);
    if (queries.length === 0)
        return fail(400, 'query is empty — pass a search term drawn from the channel\'s topic area.');
    const { auth, error, via } = await resolveAuth(input.channel);
    if (!auth)
        return error;
    const regionCode = (input.regionCode ?? 'US').toUpperCase();
    const language = (input.language ?? 'en').toLowerCase();
    const publishedAfterDays = clamp(input.publishedAfterDays ?? DEFAULT_PUBLISHED_AFTER_DAYS, 7, 365);
    const channelLimit = clamp(input.channelLimit ?? DEFAULT_CHANNEL_LIMIT, 5, 40);
    const videosPerChannel = clamp(input.videosPerChannel ?? DEFAULT_VIDEOS_PER_CHANNEL, 5, 30);
    const minMultiplier = input.minMultiplier ?? DEFAULT_MIN_MULTIPLIER;
    const minViews = input.minViews ?? DEFAULT_MIN_VIEWS;
    const duration = input.duration ?? 'short';
    const keywordLimit = clamp(input.limit ?? DEFAULT_KEYWORD_LIMIT, 3, 30);
    const includeComments = input.includeComments ?? false;
    let quotaUnits = 0;
    const errors = [];
    const exclude = new Set();
    if (input.excludeChannelId)
        exclude.add(input.excludeChannelId);
    const mine = await ownChannelId(auth);
    if (mine)
        exclude.add(mine);
    const found = await searchChannels(queries, auth, {
        regionCode,
        language,
        publishedAfter: publishedAfterIso(publishedAfterDays),
        duration,
    });
    quotaUnits += found.units;
    errors.push(...found.errors);
    const uniqueIds = [];
    const seenChannel = new Set();
    for (const hit of found.hits) {
        if (exclude.has(hit.channelId) || seenChannel.has(hit.channelId))
            continue;
        seenChannel.add(hit.channelId);
        uniqueIds.push(hit.channelId);
        if (uniqueIds.length >= channelLimit)
            break;
    }
    if (uniqueIds.length === 0) {
        return fail(404, `Found no channels for the search terms (${queries.join(', ')}). ` +
            (found.errors[0] ?? 'Trim the search term to a single topic-area line, or check regionCode.'));
    }
    const loaded = await loadChannelUploads(uniqueIds, auth, videosPerChannel);
    quotaUnits += loaded.units;
    errors.push(...loaded.errors);
    const channels = [];
    const outliers = [];
    for (const channelId of uniqueIds) {
        const bucket = loaded.byChannel.get(channelId);
        if (!bucket) {
            channels.push({
                channelId,
                title: '',
                subscriberCount: null,
                videoCount: 0,
                baseline: null,
                outlierCount: 0,
                skipped: 'not in channels.list',
            });
            continue;
        }
        const views = bucket.uploads.map((v) => v.views).filter((n) => n > 0);
        const baseline = views.length >= MIN_BASELINE_SAMPLES ? median(views) : null;
        if (baseline == null || baseline <= 0) {
            channels.push({
                channelId,
                title: bucket.title,
                subscriberCount: bucket.subscriberCount,
                videoCount: bucket.uploads.length,
                baseline: null,
                outlierCount: 0,
                skipped: `${bucket.uploads.length} recent uploads — computing the median needs at least ${MIN_BASELINE_SAMPLES} videos with views`,
            });
            continue;
        }
        const channelOutliers = [];
        for (const video of bucket.uploads) {
            if (video.views < minViews)
                continue;
            if (!isShortEnough(video.durationSeconds, duration))
                continue;
            const multiplier = video.views / baseline;
            if (multiplier < minMultiplier)
                continue;
            channelOutliers.push({
                videoId: video.videoId,
                permalink: `https://www.youtube.com/watch?v=${video.videoId}`,
                title: video.title,
                channelId,
                channelTitle: video.channelTitle,
                views: video.views,
                baseline: Math.round(baseline),
                multiplier: round1(multiplier),
                publishedAt: video.publishedAt,
                durationSeconds: video.durationSeconds,
                commentCount: video.commentCount,
                tags: video.tags.slice(0, 8),
                gaps: [],
            });
        }
        channelOutliers.sort((a, b) => b.multiplier - a.multiplier);
        outliers.push(...channelOutliers);
        channels.push({
            channelId,
            title: bucket.title,
            subscriberCount: bucket.subscriberCount,
            videoCount: bucket.uploads.length,
            baseline: Math.round(baseline),
            outlierCount: channelOutliers.length,
        });
    }
    outliers.sort((a, b) => b.multiplier - a.multiplier);
    if (includeComments && outliers.length > 0) {
        quotaUnits += await loadCommentGaps(outliers, auth);
    }
    const keywords = scoreKeywords(outliers, keywordLimit);
    return okJson({
        channel: input.channel ?? null,
        queries,
        method: {
            baseline: 'channel_median_views',
            minMultiplier,
            minViews,
            publishedAfterDays,
            duration,
            regionCode,
            language,
            via,
            note: 'Not absolute views but the multiple over that channel\'s recent-upload median. ' +
                '100k views on a big channel and 100k on a brand-new one mean different things. ' +
                'Take only the topic — don\'t copy titles, thumbnails, or scripts.',
        },
        scanned: {
            channels: uniqueIds.length,
            videos: [...loaded.byChannel.values()].reduce((sum, b) => sum + b.uploads.length, 0),
            outliers: outliers.length,
        },
        quotaUnits,
        keywords,
        outliers: outliers.slice(0, 40),
        channels,
        errors: errors.length > 0 ? errors : undefined,
        excludedOwnChannelId: mine ?? null,
    });
}
function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
}
