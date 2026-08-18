import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync as nodeMkdirSync, readFileSync as nodeReadFileSync, rmSync as nodeRmSync, writeFileSync as nodeWriteFileSync, } from 'node:fs';
import { open as nodeOpen, readFile, stat } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import { SNS_PLATFORMS, listChannelDirs, snsCredentialFile, snsTokenDir } from './config.js';
/**
 * First-party SNS direct-publish client — calls each platform API with local
 * credential files (channel/platform resolved via config.snsCredentialFile) and
 * publishes **immediately and publicly**.
 *
 * Multi-channel: every publish/comment input takes an optional `channel` (brand
 * slug) argument — when given, only <SNS_TOKEN_DIR>/<slug>/ tokens are used,
 * never falling back to the default (flat) tokens (prevents posting to the
 * wrong account). When omitted, the default tokens (single-channel legacy path)
 * are used.
 *
 * HITL contract: this module has no review gate of its own — a call IS a
 * publish. As the tool descriptions state, call only right after a human has
 * approved the final copy and media.
 *
 * Account resolution: account IDs aren't taken from config but looked up via
 * the token's `/me` — a token/account mismatch (posting to the wrong account)
 * is structurally impossible.
 *
 * Token files (user-owned, never committed):
 *   THREADS/INSTAGRAM/FACEBOOK — 60-day renewable (FB pages: non-expiring), plaintext, one line
 *   YOUTUBE — { client_id, client_secret, refresh_token } JSON
 */
/**
 * Platforms whose credential file exists (default tokens ∪ channel directories)
 * — the ListTools exposure gate for per-platform publish tools. If any channel
 * has a token, that platform's tools must be exposed.
 */
export function enabledPlatforms() {
    const channelDirs = listChannelDirs();
    return SNS_PLATFORMS.filter((platform) => existsSync(snsCredentialFile(platform)) || channelDirs.some((dir) => dir.platforms.includes(platform)));
}
/** Platforms whose credential file exists for the given channel (default tokens when omitted). */
function availablePlatformsFor(channel) {
    return SNS_PLATFORMS.filter((platform) => existsSync(snsCredentialFile(platform, channel)));
}
/**
 * Meta Graph API version — managed in this one place.
 *
 * Latest is v25.0 (2026-02) but we pin v23.0 (2025-05). Meta versions stay
 * valid for about two years after release, so v23.0 lives until 2027, and
 * pinning keeps breaking changes in newer versions from silently breaking
 * publishing. To upgrade, change only this constant.
 */
const GRAPH_VERSION = 'v23.0';
const THREADS_BASE = 'https://graph.threads.net/v1.0'; // Threads has its own versioning scheme
const IG_BASE = `https://graph.instagram.com/${GRAPH_VERSION}`;
const FB_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const DEFAULT_POLL_INTERVAL_MS = 2_000;
const DEFAULT_POLL_MAX_TRIES = 60; // headroom for reels video processing (2s × 60 = 2 min)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function fail(status, message) {
    return { ok: false, status, body: message };
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
/** Missing-token guidance — includes why there's no fallback when a channel is given, plus the available channels. */
function missingTokenMessage(platform, channel, filePath) {
    if (!channel) {
        return (`Token file not found: ${filePath} — ${platform} publishing needs a local token ` +
            `(per-channel tokens: channel argument + <SNS_TOKEN_DIR>/<slug>/ directory; relocate with the SNS_TOKEN_DIR env).`);
    }
    const channels = listChannelDirs()
        .map((dir) => `${dir.channel}(${dir.platforms.join(',')})`)
        .join(', ');
    return (`Token file not found: ${filePath} — channel "${channel}" has no ${platform} token. ` +
        `No fallback to the default (flat) tokens (prevents posting to the wrong account). Available channels: ${channels || 'none'}`);
}
async function loadTokenFile(platform, channel) {
    const filePath = snsCredentialFile(platform, channel);
    try {
        const token = (await readFile(filePath, 'utf8')).trim();
        if (!token)
            return { error: fail(400, `Token file is empty: ${filePath}`) };
        return { token };
    }
    catch {
        return { error: fail(400, missingTokenMessage(platform, channel, filePath)) };
    }
}
/**
 * Shared fetch for Graph-style APIs — GET/DELETE use the query string, POST a
 * form body. Failures come back as structured results. Token values never go
 * into error messages.
 *
 * Putting POST params in the URL lets a caption at the platform cap (IG 2,200
 * chars · FB 5,000) balloon to tens of KB once %-encoded (Korean ×9), hitting
 * request-line length limits so schema-valid input fails at the transport
 * layer. A form body is the standard Graph API way, with the side benefit that
 * access_token stays out of the URL.
 */
async function graphRequest(method, baseUrl, params, timeoutMs = 30_000) {
    const sp = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== '')
            sp.set(key, value);
    }
    const isPost = method === 'post';
    const url = isPost ? baseUrl : `${baseUrl}?${sp.toString()}`;
    try {
        const res = await fetch(url, {
            method: method.toUpperCase(),
            ...(isPost
                ? { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: sp.toString() }
                : {}),
            signal: AbortSignal.timeout(timeoutMs),
        });
        const text = await res.text();
        return { ok: res.ok, status: res.status, body: text };
    }
    catch (error) {
        const redacted = baseUrl; // never expose the full URL carrying the token
        if (error instanceof Error && error.name === 'TimeoutError') {
            return fail(504, `Request timed out after ${timeoutMs}ms: ${redacted}`);
        }
        return fail(502, `Upstream unreachable (${redacted}): ${error instanceof Error ? error.message : String(error)}`);
    }
}
/** Poll container status until statusField reaches FINISHED. ERROR/EXPIRED fail immediately. */
async function pollContainer(baseUrl, containerId, accessToken, statusField, opts) {
    const interval = opts?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    const maxTries = opts?.pollMaxTries ?? DEFAULT_POLL_MAX_TRIES;
    for (let attempt = 0; attempt < maxTries; attempt++) {
        const res = await graphRequest('get', `${baseUrl}/${containerId}`, {
            fields: statusField,
            access_token: accessToken,
        });
        if (!res.ok)
            return res;
        const status = String(parseJson(res.body)?.[statusField] ?? '');
        if (status === 'FINISHED' || status === 'PUBLISHED')
            return null;
        if (status === 'ERROR' || status === 'EXPIRED') {
            return fail(502, `Media container ${containerId} failed: ${status}`);
        }
        await sleep(interval);
    }
    return fail(504, `Media container ${containerId} not FINISHED after ${maxTries} tries`);
}
/** Look up the token's owning account via /me — body is the platform's raw JSON. */
async function fetchMe(baseUrl, accessToken, fields) {
    return graphRequest('get', `${baseUrl}/me`, { fields, access_token: accessToken });
}
function okJson(payload) {
    return { ok: true, status: 200, body: JSON.stringify(payload) };
}
export async function publishThreads(input, opts) {
    if (input.imageUrl && input.linkUrl) {
        return fail(400, 'linkUrl is for text-only posts (link_attachment requires media_type=TEXT)');
    }
    const { token, error } = await loadTokenFile('THREADS', input.channel);
    if (!token)
        return error;
    const me = await fetchMe(THREADS_BASE, token, 'id,username');
    if (!me.ok)
        return me;
    const uid = String(parseJson(me.body)?.id ?? '');
    if (!uid)
        return fail(502, `Threads /me returned no id: ${me.body}`);
    const create = await graphRequest('post', `${THREADS_BASE}/${uid}/threads`, {
        media_type: input.imageUrl ? 'IMAGE' : 'TEXT',
        text: input.caption,
        image_url: input.imageUrl,
        link_attachment: input.linkUrl,
        reply_to_id: input.replyToId,
        access_token: token,
    });
    if (!create.ok)
        return create;
    const creationId = String(parseJson(create.body)?.id ?? '');
    if (!creationId)
        return fail(502, `Threads container create returned no id: ${create.body}`);
    // Wait for the container to reach FINISHED regardless of media.
    // Text containers report status too, and in particular **replies to someone
    // else's post** (reply_to_id not pointing at our own post) fail with
    // code 24 / subcode 4279009 "media not found" when published right after
    // creation (measured 2026-08-11 — the failed container polls as FINISHED
    // moments later). Self-replies and plain posts are usually FINISHED on the
    // first poll, so the cost is one GET.
    const pollFailure = await pollContainer(THREADS_BASE, creationId, token, 'status', opts);
    if (pollFailure)
        return pollFailure;
    const publish = await graphRequest('post', `${THREADS_BASE}/${uid}/threads_publish`, {
        creation_id: creationId,
        access_token: token,
    });
    if (!publish.ok)
        return publish;
    const postId = String(parseJson(publish.body)?.id ?? '');
    const permalink = await graphRequest('get', `${THREADS_BASE}/${postId}`, {
        fields: 'permalink',
        access_token: token,
    });
    return okJson({
        platform: 'THREADS',
        postId,
        permalink: permalink.ok ? (parseJson(permalink.body)?.permalink ?? null) : null,
    });
}
// ── Threads growth reads (insights · keyword search — read-only) ──
/**
 * Attach re-issuance guidance to scope-shortage errors — the insights/search
 * scopes (threads_manage_insights · threads_keyword_search) may be missing from
 * an existing token issued for publishing, and the raw error alone doesn't say
 * what to do next.
 *
 * Scope shortage doesn't always arrive as an explicit permission error —
 * keyword_search returns code 1 "An unknown error occurred" (HTTP 500) when
 * the scope/feature isn't approved (measured 2026-08-11). Treat that shape as
 * a scope candidate too.
 */
function withScopeHint(res, scope) {
    if (res.ok)
        return res;
    const scopeLike = /permission|scope|not authorized|OAuthException/i.test(res.body) ||
        (/"code"\s*:\s*1\b/.test(res.body) && /unknown error/i.test(res.body));
    if (!scopeLike)
        return res;
    return fail(res.status, `${res.body}\n→ This endpoint needs the ${scope} scope. Your existing token may have been issued without it — ` +
        `enable the extra scope checkbox in the consent flow and re-issue the token (procedure: skills/publish/references/token-setup.md).`);
}
/** Post (media) insight metrics — views·shares are flagged "in development" by the platform */
const THREADS_MEDIA_METRICS = 'views,likes,replies,reposts,quotes,shares';
/**
 * Threads performance snapshot — normalizes account metrics (threads_insights)
 * and per-recent-root-post metrics (/insights) in one call. The grow-threads
 * loop snapshots this every tick to judge deltas against the previous tick, so
 * it returns point-in-time values only; persisting them is the caller's job
 * (data/<channel>/growth/threads/).
 */
export async function threadsInsights(input) {
    const { token, error } = await loadTokenFile('THREADS', input.channel);
    if (!token)
        return error;
    const me = await fetchMe(THREADS_BASE, token, 'id,username');
    if (!me.ok)
        return me;
    const account = parseJson(me.body) ?? {};
    const uid = str(account.id);
    if (!uid)
        return fail(502, `Threads /me returned no id: ${me.body}`);
    const days = input.days ?? 7;
    const nowSec = Math.floor(Date.now() / 1000);
    const since = nowSec - days * 86_400;
    // followers_count doesn't support since/until — call it separately, in parallel with the ranged metrics
    const [ranged, followers] = await Promise.all([
        graphRequest('get', `${THREADS_BASE}/${uid}/threads_insights`, {
            metric: 'views,likes,replies,reposts,quotes',
            since: String(since),
            until: String(nowSec),
            access_token: token,
        }),
        graphRequest('get', `${THREADS_BASE}/${uid}/threads_insights`, {
            metric: 'followers_count',
            access_token: token,
        }),
    ]);
    if (!ranged.ok)
        return withScopeHint(ranged, 'threads_manage_insights');
    if (!followers.ok)
        return withScopeHint(followers, 'threads_manage_insights');
    const userMetrics = {};
    for (const item of [...rawList(ranged.body), ...rawList(followers.body)]) {
        const name = str(item.name);
        if (!name)
            continue;
        const totalValue = item.total_value?.value;
        if (totalValue !== undefined) {
            userMetrics[name] = totalValue;
        }
        else if (Array.isArray(item.values)) {
            // views is a daily time series — include both the total and the series
            const daily = item.values.map((v) => ({
                date: str(v.end_time).slice(0, 10),
                value: numOrNull(v.value) ?? 0,
            }));
            userMetrics[name] = { total: daily.reduce((sum, v) => sum + v.value, 0), daily };
        }
    }
    // per-recent-root-post metrics — one /insights round-trip per post (capped by postLimit)
    const postLimit = input.postLimit ?? 10;
    let posts = [];
    if (postLimit > 0) {
        const list = await graphRequest('get', `${THREADS_BASE}/${uid}/threads`, {
            fields: 'id,text,timestamp,permalink,is_reply',
            limit: String(postLimit * 2), // headroom for excluding is_reply (self-reply) items
            access_token: token,
        });
        if (!list.ok)
            return list;
        const roots = rawList(list.body)
            .filter((item) => item.is_reply !== true)
            .slice(0, postLimit);
        posts = await Promise.all(roots.map(async (item) => {
            const postId = str(item.id);
            const ins = await graphRequest('get', `${THREADS_BASE}/${postId}/insights`, {
                metric: THREADS_MEDIA_METRICS,
                access_token: token,
            });
            const metrics = {};
            if (ins.ok) {
                for (const m of rawList(ins.body)) {
                    const values = m.values;
                    metrics[str(m.name)] = numOrNull(values?.[0]?.value ?? m.total_value?.value);
                }
            }
            return {
                postId,
                permalink: item.permalink ? str(item.permalink) : null,
                excerpt: excerpt(str(item.text)),
                timestamp: item.timestamp ? str(item.timestamp) : null,
                metrics: ins.ok ? metrics : null,
                ...(ins.ok ? {} : { metricsError: `HTTP ${ins.status}: ${ins.body.slice(0, 200)}` }),
            };
        }));
    }
    return okJson({
        channel: input.channel ?? null,
        account: { id: uid, username: str(account.username) },
        period: { since: new Date(since * 1000).toISOString(), until: new Date(nowSec * 1000).toISOString(), days },
        user: userMetrics,
        posts,
    });
}
/**
 * Threads public-post keyword search — finds conversations to join for the
 * channel's interest keywords. Quota is 2,200 per rolling 24h per account
 * (queries with no results don't count). Pass a result postId as
 * threads_publish's replyToId to join that post as a reply.
 */
export async function threadsKeywordSearch(input) {
    const { token, error } = await loadTokenFile('THREADS', input.channel);
    if (!token)
        return error;
    const now = Date.now();
    const res = await graphRequest('get', `${THREADS_BASE}/keyword_search`, {
        q: input.query,
        search_type: input.searchType,
        search_mode: input.searchMode,
        since: input.sinceHours ? String(Math.floor(now / 1000) - Math.round(input.sinceHours * 3600)) : undefined,
        limit: String(input.limit ?? 25),
        fields: 'id,text,media_type,permalink,timestamp,username,has_replies,is_quote_post,is_reply',
        access_token: token,
    });
    if (!res.ok)
        return withScopeHint(res, 'threads_keyword_search');
    const results = rawList(res.body).map((item) => {
        const timestamp = item.timestamp ? str(item.timestamp) : null;
        return {
            postId: str(item.id),
            username: str(item.username),
            text: str(item.text),
            mediaType: str(item.media_type) || null,
            permalink: item.permalink ? str(item.permalink) : null,
            timestamp,
            ageMinutes: minutesSince(timestamp, now),
            isReply: item.is_reply === true,
            isQuotePost: item.is_quote_post === true,
            hasReplies: item.has_replies === true,
        };
    });
    return okJson({
        channel: input.channel ?? null,
        query: input.query,
        searchType: input.searchType ?? 'TOP',
        count: results.length,
        results,
    });
}
export async function publishInstagram(input, opts) {
    const { token, error } = await loadTokenFile('INSTAGRAM', input.channel);
    if (!token)
        return error;
    const me = await fetchMe(IG_BASE, token, 'id,username');
    if (!me.ok)
        return me;
    const uid = String(parseJson(me.body)?.id ?? '');
    if (!uid)
        return fail(502, `Instagram /me returned no id: ${me.body}`);
    let creationId;
    if (input.videoUrl) {
        const create = await graphRequest('post', `${IG_BASE}/${uid}/media`, {
            media_type: 'REELS',
            video_url: input.videoUrl,
            caption: input.caption,
            access_token: token,
        });
        if (!create.ok)
            return create;
        creationId = String(parseJson(create.body)?.id ?? '');
    }
    else if ((input.imageUrls?.length ?? 0) === 1) {
        const create = await graphRequest('post', `${IG_BASE}/${uid}/media`, {
            image_url: input.imageUrls[0],
            caption: input.caption,
            access_token: token,
        });
        if (!create.ok)
            return create;
        creationId = String(parseJson(create.body)?.id ?? '');
    }
    else {
        // carousel — create child containers, then bundle once all are FINISHED
        const children = [];
        for (const imageUrl of input.imageUrls ?? []) {
            const child = await graphRequest('post', `${IG_BASE}/${uid}/media`, {
                image_url: imageUrl,
                is_carousel_item: 'true',
                access_token: token,
            });
            if (!child.ok)
                return child;
            const childId = String(parseJson(child.body)?.id ?? '');
            if (!childId)
                return fail(502, `Instagram carousel child returned no id: ${child.body}`);
            children.push(childId);
        }
        for (const childId of children) {
            const pollFailure = await pollContainer(IG_BASE, childId, token, 'status_code', opts);
            if (pollFailure)
                return pollFailure;
        }
        const create = await graphRequest('post', `${IG_BASE}/${uid}/media`, {
            media_type: 'CAROUSEL',
            children: children.join(','),
            caption: input.caption,
            access_token: token,
        });
        if (!create.ok)
            return create;
        creationId = String(parseJson(create.body)?.id ?? '');
    }
    if (!creationId)
        return fail(502, 'Instagram media container returned no id');
    const pollFailure = await pollContainer(IG_BASE, creationId, token, 'status_code', opts);
    if (pollFailure)
        return pollFailure;
    const publish = await graphRequest('post', `${IG_BASE}/${uid}/media_publish`, {
        creation_id: creationId,
        access_token: token,
    });
    if (!publish.ok)
        return publish;
    const mediaId = String(parseJson(publish.body)?.id ?? '');
    const permalink = await graphRequest('get', `${IG_BASE}/${mediaId}`, {
        fields: 'permalink',
        access_token: token,
    });
    return okJson({
        platform: 'INSTAGRAM',
        mediaId,
        permalink: permalink.ok ? (parseJson(permalink.body)?.permalink ?? null) : null,
    });
}
/**
 * Account insights — all requested with metric_type=total_value for range
 * totals. Without total_value, metrics that don't support time series (like
 * views) are **dropped from the response with no error** (measured). Follower
 * count isn't in this list — follower_count returns an empty array for
 * accounts under 100 followers (measured), useless for cold-start channels, so
 * we read the /me followers_count profile field instead.
 */
const IG_USER_METRICS = 'reach,views,profile_views,accounts_engaged,total_interactions,likes,comments,shares,saves,profile_links_taps';
/** Common media metrics — unlike the account-level saves, media uses the singular saved (measured). */
const IG_MEDIA_METRICS = 'views,reach,likes,comments,shares,saved,total_interactions';
/**
 * Reels-only metrics. Requesting them on FEED (images/carousels) fails the
 * whole response with a 400, so they're attached per media_product_type
 * (measured). reels_skip_rate is the only first-party hook-verdict metric —
 * the ranking model directly predicts "probability of watching under 3
 * seconds", and this is the only platform that exposes a drop-off rate via API.
 */
const IG_REELS_METRICS = 'ig_reels_avg_watch_time,ig_reels_video_view_total_time,reels_skip_rate';
/**
 * FEED-only (images/carousels) metrics — the mirror of the reels trap above.
 * Requesting them on reels raises `does not support the follows,
 * profile_visits metric` 400 and **fails the whole response**, leaving the
 * reels metrics entirely empty (measured). Don't mix them into the common set.
 */
const IG_FEED_METRICS = 'follows,profile_visits';
/**
 * Instagram performance snapshot — normalizes account range metrics and
 * per-recent-media metrics in one call. The grow-instagram loop snapshots this
 * every tick to judge deltas against the previous tick, so it returns
 * point-in-time values only; persisting them is the caller's job
 * (data/<channel>/growth/instagram/).
 */
export async function instagramInsights(input) {
    const { token, error } = await loadTokenFile('INSTAGRAM', input.channel);
    if (!token)
        return error;
    const me = await fetchMe(IG_BASE, token, 'id,username,account_type,media_count,followers_count,follows_count');
    if (!me.ok)
        return me;
    const profile = parseJson(me.body) ?? {};
    const uid = str(profile.id);
    if (!uid)
        return fail(502, `Instagram /me returned no id: ${me.body}`);
    const days = input.days ?? 7;
    const nowSec = Math.floor(Date.now() / 1000);
    const since = nowSec - days * 86_400;
    const ranged = await graphRequest('get', `${IG_BASE}/${uid}/insights`, {
        metric: IG_USER_METRICS,
        period: 'day',
        metric_type: 'total_value',
        since: String(since),
        until: String(nowSec),
        access_token: token,
    });
    if (!ranged.ok)
        return withScopeHint(ranged, 'instagram_business_manage_insights');
    const userMetrics = {};
    for (const item of rawList(ranged.body)) {
        const name = str(item.name);
        if (!name)
            continue;
        userMetrics[name] = numOrNull(item.total_value?.value);
    }
    // per-recent-media metrics — one /insights round-trip per media item (capped by mediaLimit)
    const mediaLimit = input.mediaLimit ?? 10;
    let media = [];
    if (mediaLimit > 0) {
        const list = await graphRequest('get', `${IG_BASE}/${uid}/media`, {
            fields: 'id,media_type,media_product_type,caption,permalink,timestamp,like_count,comments_count',
            limit: String(mediaLimit),
            access_token: token,
        });
        if (!list.ok)
            return list;
        media = await Promise.all(rawList(list.body).map(async (item) => {
            const mediaId = str(item.id);
            const productType = str(item.media_product_type) || null;
            // Surface-specific metrics are mutually exclusive — requesting the wrong
            // side 400s the whole response, so attach only the two known surfaces
            // and request just the common set for anything else (STORY etc.).
            const surfaceMetrics = productType === 'REELS' ? IG_REELS_METRICS : productType === 'FEED' ? IG_FEED_METRICS : '';
            const ins = await graphRequest('get', `${IG_BASE}/${mediaId}/insights`, {
                metric: surfaceMetrics ? `${IG_MEDIA_METRICS},${surfaceMetrics}` : IG_MEDIA_METRICS,
                access_token: token,
            });
            const metrics = {};
            if (ins.ok) {
                for (const m of rawList(ins.body)) {
                    const values = m.values;
                    metrics[str(m.name)] = numOrNull(values?.[0]?.value ?? m.total_value?.value);
                }
            }
            return {
                mediaId,
                mediaType: str(item.media_type) || null,
                mediaProductType: productType,
                permalink: item.permalink ? str(item.permalink) : null,
                excerpt: excerpt(str(item.caption)),
                timestamp: item.timestamp ? str(item.timestamp) : null,
                metrics: ins.ok ? metrics : null,
                ...(ins.ok ? {} : { metricsError: `HTTP ${ins.status}: ${ins.body.slice(0, 200)}` }),
            };
        }));
    }
    return okJson({
        channel: input.channel ?? null,
        account: {
            id: uid,
            username: str(profile.username),
            accountType: str(profile.account_type) || null,
            followersCount: numOrNull(profile.followers_count),
            followsCount: numOrNull(profile.follows_count),
            mediaCount: numOrNull(profile.media_count),
        },
        period: { since: new Date(since * 1000).toISOString(), until: new Date(nowSec * 1000).toISOString(), days },
        user: userMetrics,
        media,
    });
}
export async function publishFacebook(input) {
    // Captions only make sense on video posts — on image/text posts they'd be silently dropped, so block it
    if (input.captionFilePath && !input.videoUrl) {
        return fail(400, 'captionFilePath requires videoUrl (captions attach to a video, not to photos or text posts)');
    }
    const captionLocale = input.captionLocale ?? 'ko_KR';
    if (input.captionFilePath && !/^[a-z]{2}_[A-Z]{2}$/.test(captionLocale)) {
        return fail(400, `captionLocale must look like ko_KR / en_US / vi_VN: ${captionLocale}`);
    }
    let captionBytes;
    if (input.captionFilePath) {
        // Validate before publishing — finding a 200K overrun or a path typo after the post is irreversible
        const caption = await readCaptionFile(input.captionFilePath, CAPTION_MAX_BYTES_FB);
        if (!caption.bytes)
            return caption.error;
        captionBytes = caption.bytes;
    }
    const { token, error } = await loadTokenFile('FACEBOOK', input.channel);
    if (!token)
        return error;
    // a page token's /me is the page itself
    const me = await fetchMe(FB_BASE, token, 'id,name');
    if (!me.ok)
        return me;
    const pageId = String(parseJson(me.body)?.id ?? '');
    if (!pageId)
        return fail(502, `Facebook /me returned no id: ${me.body}`);
    let postId;
    if (input.videoUrl) {
        const video = await graphRequest('post', `${FB_BASE}/${pageId}/videos`, { file_url: input.videoUrl, description: input.caption, access_token: token }, 120_000);
        if (!video.ok)
            return video;
        postId = String(parseJson(video.body)?.id ?? '');
    }
    else if ((input.imageUrls?.length ?? 0) > 0) {
        const mediaFbids = [];
        for (const imageUrl of input.imageUrls ?? []) {
            const photo = await graphRequest('post', `${FB_BASE}/${pageId}/photos`, {
                url: imageUrl,
                published: 'false',
                access_token: token,
            });
            if (!photo.ok)
                return photo;
            const photoId = String(parseJson(photo.body)?.id ?? '');
            if (!photoId)
                return fail(502, `Facebook photo upload returned no id: ${photo.body}`);
            mediaFbids.push(photoId);
        }
        const params = { message: input.caption, access_token: token };
        mediaFbids.forEach((fbid, index) => {
            params[`attached_media[${index}]`] = JSON.stringify({ media_fbid: fbid });
        });
        const feed = await graphRequest('post', `${FB_BASE}/${pageId}/feed`, params);
        if (!feed.ok)
            return feed;
        postId = String(parseJson(feed.body)?.id ?? '');
    }
    else {
        const feed = await graphRequest('post', `${FB_BASE}/${pageId}/feed`, {
            message: input.caption,
            link: input.linkUrl,
            access_token: token,
        });
        if (!feed.ok)
            return feed;
        postId = String(parseJson(feed.body)?.id ?? '');
    }
    if (!postId)
        return fail(502, 'Facebook publish returned no id');
    // A video post's postId doubles as the video_id, so it goes straight to the
    // captions edge. A failure still leaves a valid post, so report it as a
    // warning only (no republish — the publish API is non-idempotent).
    const captionWarning = captionBytes
        ? await uploadFacebookCaption(token, postId, { bytes: captionBytes, locale: captionLocale })
        : undefined;
    const permalink = await graphRequest('get', `${FB_BASE}/${postId}`, {
        fields: 'permalink_url',
        access_token: token,
    });
    return okJson({
        platform: 'FACEBOOK',
        postId,
        permalink: permalink.ok ? (parseJson(permalink.body)?.permalink_url ?? null) : null,
        ...(captionBytes ? { captionSet: !captionWarning } : {}),
        ...(captionWarning ? { captionWarning } : {}),
    });
}
/** Comment on our own post as the page — for the "source link goes in the first comment" platform rule (scope: pages_manage_engagement). */
export async function commentFacebook(input) {
    const { token, error } = await loadTokenFile('FACEBOOK', input.channel);
    if (!token)
        return error;
    const create = await graphRequest('post', `${FB_BASE}/${input.postId}/comments`, {
        message: input.message,
        access_token: token,
    });
    if (!create.ok)
        return create;
    const commentId = String(parseJson(create.body)?.id ?? '');
    if (!commentId)
        return fail(502, `Facebook comment returned no id: ${create.body}`);
    const permalink = await graphRequest('get', `${FB_BASE}/${commentId}`, {
        fields: 'permalink_url',
        access_token: token,
    });
    return okJson({
        platform: 'FACEBOOK',
        commentId,
        permalink: permalink.ok ? (parseJson(permalink.body)?.permalink_url ?? null) : null,
    });
}
export async function loadYoutubeClient(channel) {
    const filePath = snsCredentialFile('YOUTUBE', channel);
    let raw;
    try {
        raw = await readFile(filePath, 'utf8');
    }
    catch {
        return { error: fail(400, missingTokenMessage('YOUTUBE', channel, filePath)) };
    }
    const parsed = parseJson(raw);
    const client = parsed;
    if (!client?.client_id || !client.client_secret || !client.refresh_token) {
        return { error: fail(400, `youtube-oauth-client.json requires client_id/client_secret/refresh_token: ${filePath}`) };
    }
    return { client };
}
export async function exchangeYoutubeAccessToken(client) {
    const body = new URLSearchParams({
        client_id: client.client_id,
        client_secret: client.client_secret,
        refresh_token: client.refresh_token,
        grant_type: 'refresh_token',
    });
    try {
        const res = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
            signal: AbortSignal.timeout(30_000),
        });
        const text = await res.text();
        if (!res.ok)
            return { error: { ok: false, status: res.status, body: text } };
        const token = String(parseJson(text)?.access_token ?? '');
        if (!token)
            return { error: fail(502, 'YouTube token exchange returned no access_token') };
        return { token };
    }
    catch (error) {
        return { error: fail(502, `YouTube token exchange failed: ${error instanceof Error ? error.message : String(error)}`) };
    }
}
const YT_VIDEO_MIME_BY_EXT = {
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
};
const YT_THUMB_MIME_BY_EXT = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
};
const YT_THUMB_MAX_BYTES = 2 * 1024 * 1024;
/**
 * Caption file caps — YouTube documents 100MB on captions.insert, Facebook
 * 200K on the captions edge. Short-form SRTs are a few KB so this isn't a
 * real constraint, but catching a bad file before the call beats discovering
 * it after publishing (the publish API is non-idempotent).
 */
const CAPTION_MAX_BYTES_YT = 100 * 1024 * 1024;
const CAPTION_MAX_BYTES_FB = 200 * 1024;
/**
 * Read and validate a caption file (.srt) for publishing. This pipeline uploads
 * captions separately rather than burning them in (where the platform accepts
 * caption files), so the publish tools go through this path.
 */
async function readCaptionFile(path, maxBytes) {
    if (extname(path).toLowerCase() !== '.srt') {
        return { error: fail(400, `Caption file must be .srt (SubRip): ${path}`) };
    }
    let bytes;
    try {
        bytes = await readFile(path);
    }
    catch (error) {
        return { error: fail(400, `Cannot read caption file: ${error instanceof Error ? error.message : String(error)}`) };
    }
    if (bytes.byteLength === 0)
        return { error: fail(400, `Caption file is empty: ${path}`) };
    if (bytes.byteLength > maxBytes) {
        return { error: fail(400, `Caption file exceeds ${maxBytes} bytes: ${path} (${bytes.byteLength} bytes)`) };
    }
    return { bytes };
}
/**
 * captions.insert — metadata (JSON) and SRT bytes in one multipart/related
 * request (`uploadType=multipart`). Two things differ from videos.insert: the
 * scope is **youtube.force-ssl** (the publish scope youtube.upload gets
 * rejected) and the quota is **400 units**. It runs after the video upload
 * already succeeded, so failures come back as warnings instead of failing the
 * whole call — re-uploading is non-idempotent and only burns quota.
 */
async function uploadYoutubeCaption(token, videoId, caption) {
    const boundary = `sfcap${randomUUID().replace(/-/g, '')}`;
    // name is the track's display name — empty string means the default track (the player shows just the language)
    const meta = JSON.stringify({
        snippet: { videoId, language: caption.language, name: '', isDraft: false },
    });
    const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n` +
            `--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`, 'utf8'),
        caption.bytes,
        Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8'),
    ]);
    try {
        const res = await fetch('https://www.googleapis.com/upload/youtube/v3/captions?uploadType=multipart&part=snippet', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': `multipart/related; boundary=${boundary}`,
            },
            body: new Uint8Array(body.buffer, body.byteOffset, body.byteLength),
            signal: AbortSignal.timeout(60_000),
        });
        if (res.ok)
            return null;
        const text = (await res.text()).slice(0, 300);
        const scopeLike = res.status === 401 || res.status === 403 || /insufficient|scope|forbidden/i.test(text);
        return (`captions.insert ${res.status}: ${text}` +
            (scopeLike
                ? ' → this call needs the youtube.force-ssl scope (publish-only youtube.upload is not enough).' +
                    ' The video upload already succeeded, so add the scope, reissue the token, and upload just the captions by hand' +
                    ' (procedure: skills/publish/references/token-setup.md).'
                : ''));
    }
    catch (error) {
        return `captions.insert failed: ${error instanceof Error ? error.message : String(error)}`;
    }
}
/**
 * POST /{video_id}/captions — attaches the SRT as multipart/form-data. **The filename is
 * the contract**: anything other than `<name>.<locale>.srt` is rejected with error 386
 * (locale looks like `ko_KR`). The id returned by the video publish (`/{pageId}/videos`)
 * is the video_id, so it can be passed straight through. FB processes file_url videos
 * asynchronously, though, so a call right after publishing can hit the still-processing
 * state and fail — the publish is still valid then, so report it as a warning only and
 * re-upload just the captions.
 */
async function uploadFacebookCaption(token, videoId, caption) {
    const form = new FormData();
    form.set('access_token', token);
    form.set('default_locale', caption.locale);
    form.set('captions_file', new Blob([new Uint8Array(caption.bytes.buffer, caption.bytes.byteOffset, caption.bytes.byteLength)], {
        type: 'application/octet-stream',
    }), `caption.${caption.locale}.srt`);
    try {
        const res = await fetch(`${FB_BASE}/${videoId}/captions`, {
            method: 'POST',
            body: form,
            signal: AbortSignal.timeout(60_000),
        });
        if (res.ok)
            return null;
        return `captions ${res.status}: ${(await res.text()).slice(0, 300)}`;
    }
    catch (error) {
        return `caption upload failed: ${error instanceof Error ? error.message : String(error)}`;
    }
}
async function setYoutubeThumbnail(token, videoId, thumb) {
    try {
        const view = new Uint8Array(thumb.bytes.buffer, thumb.bytes.byteOffset, thumb.bytes.byteLength);
        const res = await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': thumb.mimeType },
            body: view,
            signal: AbortSignal.timeout(60_000),
        });
        if (!res.ok)
            return `thumbnails.set ${res.status}: ${(await res.text()).slice(0, 300)}`;
        return null;
    }
    catch (error) {
        return `thumbnails.set failed: ${error instanceof Error ? error.message : String(error)}`;
    }
}
/* ────────────────────────────────────────────────────────────────────────────
 * YouTube resumable upload — chunked PUT + resume
 *
 * Today's code already opens the session with `uploadType=resumable`. What's missing
 * isn't the protocol but **actually resuming** — it pushes the whole file through in a
 * single PUT with a 600-second timeout. On long-form of 8 minutes or more (hundreds of
 * MB), if that one PUT drops, the upload restarts from zero.
 *
 * We don't add a size-threshold branch. Three reasons —
 *   ① The risky path would be the rarely-travelled one. When short-form walks it every
 *      day, a regression shows up in that day's short-form publish instead of in a
 *      long-form pilot.
 *   ② Two paths mean two sets of retry and duplicate-prevention rules, and the
 *      single-PUT side can't have either.
 *   ③ The 3-7 extra round trips for chunking cost 100-300ms each over keep-alive,
 *      under 2 seconds total.
 * ──────────────────────────────────────────────────────────────────────────── */
/** The protocol requires every chunk but the last to be a multiple of 256KiB. */
const YT_CHUNK_MIN = 256 * 1024;
/** Resume-session lifetime. YouTube gives 7 days but we only trust 24 hours (see comment below). */
const YT_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
function ytChunkSize() {
    const mb = Number(process.env.SOCIAL_FLOW_YT_CHUNK_MB ?? 8);
    const raw = Math.floor((Number.isFinite(mb) && mb > 0 ? mb : 8) * 1024 * 1024);
    return Math.max(YT_CHUNK_MIN, raw - (raw % YT_CHUNK_MIN));
}
/**
 * Pulls the next offset the server is waiting for out of the Range header.
 *
 * In a 308 response, `Range: bytes=0-8388607` is **the last byte received**, so the next
 * offset is +1. No header at all means the server received 0 bytes — lumping those two
 * cases together either skips the first chunk or resends one byte twice.
 */
function parseResumeOffset(range) {
    if (!range)
        return 0;
    const m = /bytes=0-(\d+)/.exec(range);
    return m ? Number(m[1]) + 1 : 0;
}
function sessionStateFile(filePath) {
    // State lives under the same directory as the tokens — user-owned and already outside git.
    const key = createHash('sha256').update(filePath).digest('hex').slice(0, 16);
    return join(snsTokenDir, '.yt-upload', `${key}.json`);
}
/**
 * Saving state is **best effort**. If the directory is missing or writes are blocked, skip
 * quietly and fall back to today's no-resume behavior — a failed state write must never
 * become a failed publish.
 */
function readState(filePath) {
    try {
        const raw = nodeReadFileSync(sessionStateFile(filePath), 'utf8');
        const s = JSON.parse(raw);
        if (Date.now() - s.startedAt > YT_SESSION_TTL_MS)
            return null;
        return s;
    }
    catch {
        return null;
    }
}
function writeState(filePath, s) {
    const p = sessionStateFile(filePath);
    try {
        if (s === null) {
            nodeRmSync(p, { force: true });
            return;
        }
        nodeMkdirSync(dirname(p), { recursive: true });
        nodeWriteFileSync(p, JSON.stringify(s), 'utf8');
    }
    catch {
        /* the upload continues even if we can't save */
    }
}
/**
 * Chunk-PUTs the file to the session URL. On 308, it picks up at the offset the server named.
 *
 * The key point is that it does NOT take `bytes` as an argument — it uses one file handle
 * and one chunk buffer. If the caller had already pulled the whole file onto the heap with
 * `readFile`, switching to chunks would leave the peak at "file size + chunk" anyway
 * (about 560MB for a 512MB file).
 */
export async function uploadResumable(sessionUrl, filePath, mimeType, opts = { total: 0 }) {
    const total = opts.total;
    const chunk = ytChunkSize();
    let offset = opts.startOffset ?? 0;
    let resumed = offset > 0;
    const fh = await nodeOpen(filePath, 'r');
    const buf = Buffer.allocUnsafe(chunk);
    try {
        while (offset < total) {
            const want = Math.min(chunk, total - offset);
            const { bytesRead } = await fh.read(buf, 0, want, offset);
            if (bytesRead !== want) {
                return { ok: false, status: 500, body: `Short read at ${offset}: ${bytesRead}/${want}` };
            }
            const end = offset + want - 1;
            const view = new Uint8Array(buf.buffer, buf.byteOffset, want);
            let res;
            try {
                res = await fetch(sessionUrl, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': mimeType,
                        'Content-Range': `bytes ${offset}-${end}/${total}`,
                    },
                    body: view,
                    signal: AbortSignal.timeout(300_000),
                });
            }
            catch (error) {
                // Send failed — ask the server how much it got and continue from there. The bytes
                // can arrive with only the response dropped, so we must not guess the offset.
                const sync = await queryResumeOffset(sessionUrl, total, mimeType);
                if (sync.done)
                    return { ok: true, body: sync.body, resumed: true };
                if (sync.offset === null) {
                    return {
                        ok: false,
                        status: 502,
                        body: `YouTube upload chunk failed at ${offset}: ${error instanceof Error ? error.message : String(error)}`,
                    };
                }
                offset = sync.offset;
                resumed = true;
                continue;
            }
            if (res.status === 308) {
                offset = parseResumeOffset(res.headers.get('range'));
                opts.onProgress?.(offset, total);
                continue;
            }
            const text = await res.text();
            if (!res.ok)
                return { ok: false, status: res.status, body: text };
            opts.onProgress?.(total, total);
            return { ok: true, body: text, resumed };
        }
        // The loop ended without a final response — ask for the status.
        const sync = await queryResumeOffset(sessionUrl, total, mimeType);
        if (sync.done)
            return { ok: true, body: sync.body, resumed: true };
        return { ok: false, status: 502, body: 'YouTube upload ended without a final response' };
    }
    finally {
        await fh.close();
    }
}
/**
 * Asks, with an empty PUT, what offset the server received. `Content-Range: bytes * /TOTAL`.
 *
 * **The completed state must be told apart.** When the last chunk arrived and only the
 * response was lost, the server answers 200/201 plus the video JSON. Failing to recognize
 * that re-uploads the whole file and creates a duplicate video.
 */
async function queryResumeOffset(sessionUrl, total, mimeType) {
    try {
        const res = await fetch(sessionUrl, {
            method: 'PUT',
            headers: { 'Content-Range': `bytes */${total}`, 'Content-Type': mimeType },
            signal: AbortSignal.timeout(60_000),
        });
        if (res.status === 308) {
            return { offset: parseResumeOffset(res.headers.get('range')), done: false, body: '' };
        }
        const body = await res.text();
        if (res.ok)
            return { offset: total, done: true, body };
        // 404/410 = the session is dead. Resuming is impossible, so stop right away (re-uploading is the caller's call).
        return { offset: null, done: false, body };
    }
    catch {
        return { offset: null, done: false, body: '' };
    }
}
export async function publishYoutube(input) {
    const mimeType = YT_VIDEO_MIME_BY_EXT[extname(input.videoFilePath).toLowerCase()];
    if (!mimeType)
        return fail(400, `Unsupported video extension: ${input.videoFilePath} (.mp4/.mov)`);
    // Read only size and mtime — the bytes are read chunk by chunk inside uploadResumable.
    // Pulling the whole file onto the heap with readFile would leave the peak at "file size +
    // chunk" even with chunked PUT, about 560MB for a 512MB file. stat also keeps today's
    // early 400 validation intact.
    let videoSize;
    let videoMtimeMs;
    try {
        const st = await stat(input.videoFilePath);
        if (!st.isFile())
            return fail(400, `Not a file: ${input.videoFilePath}`);
        if (st.size === 0)
            return fail(400, `Empty video file: ${input.videoFilePath}`);
        videoSize = st.size;
        videoMtimeMs = st.mtimeMs;
    }
    catch (error) {
        return fail(400, `Cannot read video file: ${error instanceof Error ? error.message : String(error)}`);
    }
    // Validate the thumbnail before uploading — rejecting it afterwards wastes the upload
    // quota already spent plus the transfer time (tens of MB)
    let thumb;
    if (input.thumbnailFilePath) {
        const thumbMime = YT_THUMB_MIME_BY_EXT[extname(input.thumbnailFilePath).toLowerCase()];
        if (!thumbMime) {
            return fail(400, `Unsupported thumbnail extension: ${input.thumbnailFilePath} (.jpg/.jpeg/.png)`);
        }
        let thumbBytes;
        try {
            thumbBytes = await readFile(input.thumbnailFilePath);
        }
        catch (error) {
            return fail(400, `Cannot read thumbnail file: ${error instanceof Error ? error.message : String(error)}`);
        }
        if (thumbBytes.byteLength > YT_THUMB_MAX_BYTES) {
            return fail(400, `Thumbnail exceeds 2MB: ${input.thumbnailFilePath} (${thumbBytes.byteLength} bytes)`);
        }
        thumb = { bytes: thumbBytes, mimeType: thumbMime };
    }
    // Read and validate the captions **before** uploading too — a path typo found after publishing can't be undone
    let captionBytes;
    if (input.captionFilePath) {
        const caption = await readCaptionFile(input.captionFilePath, CAPTION_MAX_BYTES_YT);
        if (!caption.bytes)
            return caption.error;
        captionBytes = caption.bytes;
    }
    const { client, error: clientError } = await loadYoutubeClient(input.channel);
    if (!client)
        return clientError;
    const { token, error: tokenError } = await exchangeYoutubeAccessToken(client);
    if (!token)
        return tokenError;
    // Use a live resume session when there is one. The key is (path, size, mtime), so when a
    // rebuild changes the file it opens a fresh session automatically — that keeps new bytes
    // from being appended to an old session.
    const prior = readState(input.videoFilePath);
    const reusable = prior && prior.size === videoSize && prior.mtimeMs === videoMtimeMs ? prior : null;
    // Start the resumable session → chunk-PUT to Location (same contract as the console adapter)
    let location = reusable ? reusable.sessionUrl : null;
    let sessionStartedAt = reusable ? reusable.startedAt : Date.now();
    try {
        const init = location
            ? null
            : await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    // Two lines the protocol requires — without them the server won't support chunked resume.
                    'X-Upload-Content-Length': String(videoSize),
                    'X-Upload-Content-Type': mimeType,
                },
                body: JSON.stringify({
                    snippet: {
                        title: input.title,
                        description: input.description,
                        // 22 = People & Blogs. The category feeds recommendation and browse classification,
                        // so uploading a general-content channel's video as 25 (News & Politics) surfaces it
                        // to the wrong interest group.
                        categoryId: input.categoryId ?? '22',
                    },
                    status: {
                        privacyStatus: input.privacyStatus ?? 'public',
                        // COPPA self-declaration — hardcoding it would falsely declare kids' content, so it comes from input
                        selfDeclaredMadeForKids: input.madeForKids ?? false,
                        // Synthetic-media disclosure — this pipeline's video and music are generated, so default true
                        containsSyntheticMedia: input.containsSyntheticMedia ?? true,
                    },
                }),
                signal: AbortSignal.timeout(30_000),
            });
        if (init) {
            if (!init.ok)
                return { ok: false, status: init.status, body: await init.text() };
            location = init.headers.get('location');
            sessionStartedAt = Date.now();
        }
    }
    catch (error) {
        return fail(502, `YouTube resumable init failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!location)
        return fail(502, 'YouTube resumable init returned no Location header');
    writeState(input.videoFilePath, {
        sessionUrl: location,
        size: videoSize,
        mtimeMs: videoMtimeMs,
        startedAt: sessionStartedAt,
    });
    try {
        // On a reused session, ask the server how much it got first. We must not trust the
        // offset we remembered — the bytes can arrive with only the response dropped.
        let startOffset = 0;
        if (reusable) {
            const sync = await queryResumeOffset(location, videoSize, mimeType);
            if (sync.done) {
                // The last chunk had already arrived. Re-uploading would create a duplicate video.
                const doneId = String(parseJson(sync.body)?.id ?? '');
                if (doneId) {
                    writeState(input.videoFilePath, null);
                    return okJson({
                        platform: 'YOUTUBE',
                        videoId: doneId,
                        permalink: `https://www.youtube.com/watch?v=${doneId}`,
                        fileName: basename(input.videoFilePath),
                        resumed: true,
                        note: `This file is already up from the upload started at ${new Date(sessionStartedAt).toISOString()}. It was not re-uploaded.`,
                    });
                }
            }
            if (sync.offset === null) {
                // The session is dead (404/410). Clear the state so the next call opens a new session.
                writeState(input.videoFilePath, null);
                return fail(502, `YouTube resumable session expired — call again with the same arguments to upload in a new session`);
            }
            startOffset = sync.offset;
        }
        const up = await uploadResumable(location, input.videoFilePath, mimeType, {
            total: videoSize,
            startOffset,
        });
        if (!up.ok)
            return { ok: false, status: up.status, body: up.body };
        const text = up.body;
        const videoId = String(parseJson(text)?.id ?? '');
        if (!videoId)
            return fail(502, `YouTube upload returned no video id: ${text}`);
        // The upload is done, so clear the resume state — leaving it would make a re-publish of
        // the same file answer "already up" with the old videoId.
        writeState(input.videoFilePath, null);
        // A thumbnail failure is a warning only — the upload already succeeded, and re-publishing is non-idempotent and burns quota, so don't fail the whole call
        const thumbnailWarning = thumb ? await setYoutubeThumbnail(token, videoId, thumb) : undefined;
        // Same rule for captions — a failure still leaves the publish successful (report a warning and re-upload just the captions)
        const captionWarning = captionBytes
            ? await uploadYoutubeCaption(token, videoId, {
                bytes: captionBytes,
                language: input.captionLanguage ?? 'ko',
            })
            : undefined;
        return okJson({
            platform: 'YOUTUBE',
            videoId,
            permalink: `https://www.youtube.com/watch?v=${videoId}`,
            fileName: basename(input.videoFilePath),
            ...(thumb ? { thumbnailSet: !thumbnailWarning } : {}),
            ...(thumbnailWarning ? { thumbnailWarning } : {}),
            ...(captionBytes ? { captionSet: !captionWarning } : {}),
            ...(captionWarning ? { captionWarning } : {}),
        });
    }
    catch (error) {
        return fail(502, `YouTube upload failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}
const YT_DATA_BASE = 'https://www.googleapis.com/youtube/v3';
const YT_ANALYTICS_BASE = 'https://youtubeanalytics.googleapis.com/v2';
/**
 * YouTube API call — the access token goes in **the header only**. Put it in the query
 * string and the token ends up verbatim in error bodies and logs.
 */
async function youtubeRequest(method, url, params, token, body) {
    const target = `${url}?${new URLSearchParams(params).toString()}`;
    try {
        const res = await fetch(target, {
            method: method.toUpperCase(),
            headers: {
                Authorization: `Bearer ${token}`,
                ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
            },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            signal: AbortSignal.timeout(30_000),
        });
        const text = await res.text();
        return res.ok ? { ok: true, status: res.status, body: text } : { ok: false, status: res.status, body: text };
    }
    catch (error) {
        return fail(502, `YouTube API request failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}
/**
 * Google OAuth reports a missing scope as 403 `insufficientPermissions` or 401 — the body
 * differs from Meta's shape (withScopeHint), so it needs its own check. This plugin's
 * existing YouTube tokens were most likely issued with the single `youtube.upload` scope,
 * so any tool needing a new scope always hits this guidance on its first call.
 */
function withYoutubeScopeHint(res, scope) {
    if (res.ok)
        return res;
    const scopeLike = res.status === 401 ||
        res.status === 403 ||
        /insufficient|scope|forbidden|unauthorized/i.test(res.body);
    if (!scopeLike)
        return res;
    return fail(res.status, `${res.body}\n→ this endpoint needs the ${scope} scope. An existing refresh_token issued ` +
        `for publishing only (youtube.upload) does not have it — turn the extra scope on in the ` +
        `consent flow and reissue (procedure: skills/publish/references/token-setup.md). ` +
        `After reissuing, replace the refresh_token in youtube-oauth-client.json.`);
}
/** Channel-level Analytics metrics — engagedViews counts views that got past the opening, split from views since 2025-03. */
const YT_CHANNEL_METRICS = 'views,engagedViews,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained,subscribersLost,likes,comments,shares';
/** Video-level — per-video reports support a narrower metric set (subscriber gain/loss is only reliable in the channel report). */
const YT_VIDEO_METRICS = 'views,engagedViews,averageViewDuration,averageViewPercentage,likes,comments,shares';
const ytDate = (ms) => new Date(ms).toISOString().slice(0, 10);
/**
 * Edits a published video's visibility and metadata (`videos.update`).
 *
 * Long-form needs this tool because it publishes in two stages — upload the 8-15 minute
 * video as `private`, have a human check it on the watch page, then flip it public.
 * Going straight to public the way short-form does means viewers see encoding failures
 * and misaligned subtitles first.
 *
 * **`videos.update` overwrites — it is not a partial update.** It replaces the whole set
 * of fields in the resource named by `part`, so sending `snippet` without `title` wipes
 * the title. That's why this function **reads the current values with `videos.list` first
 * and merges.** Skip that one step and you get the "meant to flip it public, lost the
 * title and description" accident.
 *
 * `status.selfDeclaredMadeForKids` is the same trap. Leave it out and it reverts to the
 * default, quietly flipping the COPPA declaration — so the value we read is sent back as is.
 */
export async function youtubeUpdate(input) {
    const { client, error: clientError } = await loadYoutubeClient(input.channel);
    if (!client)
        return clientError;
    const { token, error: tokenError } = await exchangeYoutubeAccessToken(client);
    if (!token)
        return tokenError;
    // ── 1) Read the current values. This is the merge baseline.
    const cur = await youtubeRequest('get', `${YT_DATA_BASE}/videos`, { part: 'snippet,status', id: input.videoId }, token);
    if (!cur.ok)
        return withYoutubeScopeHint(cur, 'https://www.googleapis.com/auth/youtube');
    const items = parseJson(cur.body)?.items;
    if (!Array.isArray(items) || items.length === 0) {
        return fail(404, `Video not found: ${input.videoId} (it belongs to another channel or was deleted)`);
    }
    const snippet = (items[0]?.snippet ?? {});
    const status = (items[0]?.status ?? {});
    // ── 2) Merge. Fields not passed as arguments go back out with the values we read.
    const nextSnippet = {
        title: input.title ?? snippet.title,
        description: input.description ?? snippet.description,
        categoryId: input.categoryId ?? snippet.categoryId,
        ...(snippet.tags ? { tags: snippet.tags } : {}),
        ...(snippet.defaultLanguage ? { defaultLanguage: snippet.defaultLanguage } : {}),
        ...(snippet.defaultAudioLanguage ? { defaultAudioLanguage: snippet.defaultAudioLanguage } : {}),
    };
    const nextStatus = {
        privacyStatus: input.privacyStatus ?? status.privacyStatus,
        selfDeclaredMadeForKids: input.madeForKids ?? status.selfDeclaredMadeForKids ?? false,
        containsSyntheticMedia: input.containsSyntheticMedia ?? status.containsSyntheticMedia ?? true,
        ...(input.publishAt ? { publishAt: input.publishAt } : {}),
        ...(status.embeddable !== undefined ? { embeddable: status.embeddable } : {}),
        ...(status.license ? { license: status.license } : {}),
        ...(status.publicStatsViewable !== undefined
            ? { publicStatsViewable: status.publicStatsViewable }
            : {}),
    };
    const body = { id: input.videoId, snippet: nextSnippet, status: nextStatus };
    // publishAt only takes effect when privacyStatus is private — otherwise the API ignores it silently.
    if (input.publishAt && nextStatus.privacyStatus !== 'private') {
        return fail(400, 'publishAt only schedules when privacyStatus is private. To schedule a public release, pass privacyStatus: "private" along with it.');
    }
    if (input.dryRun) {
        return okJson({
            platform: 'YOUTUBE',
            videoId: input.videoId,
            dryRun: true,
            current: { snippet, status },
            wouldSend: body,
        });
    }
    // ── 3) Overwrite.
    const res = await youtubeRequest('put', `${YT_DATA_BASE}/videos`, { part: 'snippet,status' }, token, body);
    if (!res.ok)
        return withYoutubeScopeHint(res, 'https://www.googleapis.com/auth/youtube');
    const updated = parseJson(res.body);
    return okJson({
        platform: 'YOUTUBE',
        videoId: input.videoId,
        permalink: `https://www.youtube.com/watch?v=${input.videoId}`,
        privacyStatus: updated?.status?.privacyStatus ?? nextStatus.privacyStatus,
        title: updated?.snippet?.title ?? nextSnippet.title,
        changed: {
            privacyStatus: status.privacyStatus !== nextStatus.privacyStatus,
            title: snippet.title !== nextSnippet.title,
            description: snippet.description !== nextSnippet.description,
        },
    });
}
export async function youtubeInsights(input) {
    const { client, error: clientError } = await loadYoutubeClient(input.channel);
    if (!client)
        return clientError;
    const { token, error: tokenError } = await exchangeYoutubeAccessToken(client);
    if (!token)
        return tokenError;
    const days = Math.min(Math.max(input.days ?? 7, 1), 365);
    const now = Date.now();
    // Analytics data runs 2-3 days behind, which is normal — leaving endDate at today makes the recent window look like 0
    const startDate = ytDate(now - days * 86_400_000);
    const endDate = ytDate(now);
    const mine = await youtubeRequest('get', `${YT_DATA_BASE}/channels`, { part: 'id,snippet,statistics,contentDetails', mine: 'true' }, token);
    if (!mine.ok)
        return withYoutubeScopeHint(mine, 'youtube.readonly (or youtube)');
    const channelItem = parseJson(mine.body)?.items?.[0];
    if (!channelItem)
        return fail(502, `YouTube channels.list returned no channel: ${mine.body}`);
    const stats = channelItem.statistics ?? {};
    const uploadsPlaylist = str(channelItem.contentDetails?.relatedPlaylists?.uploads);
    const analytics = await youtubeRequest('get', `${YT_ANALYTICS_BASE}/reports`, { ids: 'channel==MINE', startDate, endDate, metrics: YT_CHANNEL_METRICS }, token);
    if (!analytics.ok)
        return withYoutubeScopeHint(analytics, 'yt-analytics.readonly');
    const channelMetrics = ytReportRow(analytics.body);
    // Revenue needs one more scope — a failure here must not kill the other metrics
    let revenue = null;
    let revenueError;
    if (input.includeRevenue) {
        const res = await youtubeRequest('get', `${YT_ANALYTICS_BASE}/reports`, { ids: 'channel==MINE', startDate, endDate, metrics: 'estimatedRevenue,estimatedAdRevenue,estimatedRedPartnerRevenue,cpm' }, token);
        if (res.ok)
            revenue = ytReportRow(res.body);
        else
            revenueError = withYoutubeScopeHint(res, 'yt-analytics-monetary.readonly').body.slice(0, 400);
    }
    const videoLimit = Math.min(Math.max(input.videoLimit ?? 10, 0), 50);
    let videos = [];
    // Keep the channel metrics even if the video lookup fails — but include the reason so an
    // empty array isn't read as "there are no uploads"
    const videoErrors = [];
    if (videoLimit > 0 && !uploadsPlaylist)
        videoErrors.push('the channel has no uploads playlist');
    if (videoLimit > 0 && uploadsPlaylist) {
        const list = await youtubeRequest('get', `${YT_DATA_BASE}/playlistItems`, { part: 'snippet,contentDetails', playlistId: uploadsPlaylist, maxResults: String(videoLimit) }, token);
        if (!list.ok)
            videoErrors.push(`playlistItems HTTP ${list.status}: ${list.body.slice(0, 200)}`);
        if (list.ok) {
            const items = parseJson(list.body)?.items ?? [];
            const ids = items.map((item) => str(item.contentDetails?.videoId)).filter(Boolean);
            // Per-video Analytics comes back in one call via filters=video==a,b,c — a round trip per video would double the quota cost
            const [detail, perVideo] = await Promise.all([
                ids.length
                    ? youtubeRequest('get', `${YT_DATA_BASE}/videos`, { part: 'snippet,statistics,contentDetails', id: ids.join(',') }, token)
                    : Promise.resolve(okJson({ items: [] })),
                ids.length
                    ? youtubeRequest('get', `${YT_ANALYTICS_BASE}/reports`, {
                        ids: 'channel==MINE',
                        startDate,
                        endDate,
                        metrics: YT_VIDEO_METRICS,
                        dimensions: 'video',
                        filters: `video==${ids.join(',')}`,
                        maxResults: String(ids.length),
                    }, token)
                    : Promise.resolve(okJson({ rows: [] })),
            ]);
            if (!detail.ok)
                videoErrors.push(`videos.list HTTP ${detail.status}: ${detail.body.slice(0, 200)} (lifetime will look like 0)`);
            if (!perVideo.ok)
                videoErrors.push(`per-video Analytics HTTP ${perVideo.status}: ${perVideo.body.slice(0, 200)} (period will be null)`);
            const detailById = new Map();
            for (const item of parseJson(detail.body)?.items ?? []) {
                detailById.set(str(item.id), item);
            }
            const metricsById = perVideo.ok ? ytReportRowsByKey(perVideo.body) : new Map();
            videos = ids.map((videoId) => {
                const item = detailById.get(videoId);
                const snippet = item?.snippet ?? {};
                const videoStats = item?.statistics ?? {};
                const duration = str(item?.contentDetails?.duration);
                return {
                    videoId,
                    permalink: `https://www.youtube.com/watch?v=${videoId}`,
                    title: excerpt(str(snippet.title), 100),
                    publishedAt: snippet.publishedAt ? str(snippet.publishedAt) : null,
                    duration: duration || null,
                    // Seconds pulled from the ISO8601 duration, used to tell whether it's a Short (portrait, 3 minutes or less)
                    durationSeconds: ytDurationSeconds(duration),
                    lifetime: {
                        views: Number(videoStats.viewCount ?? 0),
                        likes: Number(videoStats.likeCount ?? 0),
                        comments: Number(videoStats.commentCount ?? 0),
                    },
                    period: metricsById.get(videoId) ?? null,
                };
            });
        }
    }
    return okJson({
        channel: input.channel ?? null,
        account: {
            channelId: str(channelItem.id),
            title: str(channelItem.snippet?.title),
            subscriberCount: Number(stats.subscriberCount ?? 0),
            viewCount: Number(stats.viewCount ?? 0),
            videoCount: Number(stats.videoCount ?? 0),
            // When a channel hides its subscriber count the API returns a rounded value — gain/loss becomes meaningless
            subscriberCountHidden: stats.hiddenSubscriberCount === true,
        },
        period: { startDate, endDate, days },
        metrics: channelMetrics,
        ...(revenue ? { revenue } : {}),
        ...(revenueError ? { revenueError } : {}),
        videos,
        ...(videoErrors.length ? { videosError: videoErrors.join(' · ') } : {}),
        note: 'The Analytics API does not provide the swipe-away drop-off rate ("How many chose to view") — judge the hook with averageViewPercentage and check the swipe metric in YouTube Studio.',
    });
}
/** Turns a single Analytics response row into {metricName: value} — empty rows give an empty object, not 0 (tells data lag apart from a real 0). */
function ytReportRow(body) {
    const parsed = parseJson(body);
    const headers = parsed?.columnHeaders ?? [];
    const row = parsed?.rows?.[0];
    if (!row)
        return {};
    const out = {};
    headers.forEach((header, index) => {
        const name = str(header.name);
        if (name)
            out[name] = Number(row[index] ?? 0);
    });
    return out;
}
/** Analytics response with dimensions — groups the remaining metrics under the first column (the dimension value) as key. */
function ytReportRowsByKey(body) {
    const parsed = parseJson(body);
    const headers = parsed?.columnHeaders ?? [];
    const rows = parsed?.rows ?? [];
    const out = new Map();
    for (const row of rows) {
        const key = str(row[0]);
        if (!key)
            continue;
        const metrics = {};
        headers.forEach((header, index) => {
            if (index === 0)
                return;
            const name = str(header.name);
            if (name)
                metrics[name] = Number(row[index] ?? 0);
        });
        out.set(key, metrics);
    }
    return out;
}
/** ISO8601 duration (PT1M30S) → seconds. A parse failure gives null (returning 0 would misjudge it as a Short). */
function ytDurationSeconds(duration) {
    const match = /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(duration);
    if (!match)
        return null;
    const [, d, h, m, s] = match;
    return Number(d ?? 0) * 86_400 + Number(h ?? 0) * 3_600 + Number(m ?? 0) * 60 + Number(s ?? 0);
}
// ── Comment inbox · replies · moderation ─────────────────────────
/**
 * The path for handling received comments. Reading (the inbox) has no side effects, but
 * **replies and moderation go public the moment they're called, exactly like publishing** —
 * the HITL rule in the tool descriptions is the only gate.
 *
 * Platform capabilities are asymmetric (measured against live tokens, 2026-07-26):
 *   THREADS   read `/conversation` (flattened at any depth) · reply `reply_to_id` · hide `manage_reply` · no like API
 *   INSTAGRAM read `/comments{replies}` · reply `/{comment}/replies` (top-level comments only) · hide `hide` · no like API
 *   FACEBOOK  read `/comments?filter=stream` · reply `/{comment}/comments` · hide `is_hidden` · likes yes
 *   YOUTUBE   read `commentThreads.list` (per video) · reply `comments.insert` · hide and like unsupported (out of scope)
 *
 * "Have we already answered this" is decided from platform fields (THREADS
 * `is_reply_owned_by_me`, IG username match, FB `from.id == pageId`, YT
 * `authorChannelId == our channel id`) — nothing is guessed, so no duplicate reply goes out.
 *
 * YouTube alone targets replies differently: the parentId of `comments.insert` accepts
 * **top-level comments only** (you can't reply directly to a nested reply). replyToComment
 * absorbs that asymmetry.
 */
export const COMMENT_PLATFORMS = ['THREADS', 'INSTAGRAM', 'FACEBOOK', 'YOUTUBE'];
const rawList = (body) => {
    const data = parseJson(body)?.data;
    return Array.isArray(data) ? data : [];
};
const str = (value) => (value === undefined || value === null ? '' : String(value));
const numOrNull = (value) => (typeof value === 'number' ? value : null);
const excerpt = (text, max = 140) => (text.length > max ? `${text.slice(0, max)}…` : text);
function minutesSince(timestamp, now) {
    if (!timestamp)
        return null;
    const parsed = Date.parse(timestamp);
    return Number.isNaN(parsed) ? null : Math.max(0, Math.round((now - parsed) / 60_000));
}
async function inboxThreads(input, now, channel) {
    const { token, error } = await loadTokenFile('THREADS', channel);
    if (!token)
        return { error };
    const me = await fetchMe(THREADS_BASE, token, 'id,username');
    if (!me.ok)
        return { error: me };
    const account = parseJson(me.body) ?? {};
    const uid = str(account.id);
    if (!uid)
        return { error: fail(502, `Threads /me returned no id: ${me.body}`) };
    const list = await graphRequest('get', `${THREADS_BASE}/${uid}/threads`, {
        fields: 'id,text,timestamp,permalink,is_reply',
        limit: String(input.postLimit),
        access_token: token,
    });
    if (!list.ok)
        return { account, error: list };
    const posts = [];
    // Entries with is_reply are our own replies — replies, not posts, so they aren't inbox roots
    for (const item of rawList(list.body).filter((item) => item.is_reply !== true)) {
        const postId = str(item.id);
        if (!postId)
            continue;
        const post = {
            platform: 'THREADS',
            postId,
            permalink: item.permalink ? str(item.permalink) : null,
            excerpt: excerpt(str(item.text)),
            timestamp: item.timestamp ? str(item.timestamp) : null,
            comments: [],
        };
        // conversation flattens every reply regardless of depth — required to follow nested reply chains
        const conv = await graphRequest('get', `${THREADS_BASE}/${postId}/conversation`, {
            fields: 'id,text,username,timestamp,permalink,is_reply_owned_by_me,hide_status,replied_to',
            // Newest first — when limit truncates, what has to survive is the golden-hour comments, not the old ones
            reverse: 'true',
            limit: String(input.commentLimit),
            access_token: token,
        });
        if (!conv.ok) {
            post.commentsError = `HTTP ${conv.status}: ${conv.body.slice(0, 200)}`;
            posts.push(post);
            continue;
        }
        const replies = rawList(conv.body);
        const answered = new Set();
        for (const reply of replies) {
            if (reply.is_reply_owned_by_me !== true)
                continue;
            const parent = str(reply.replied_to?.id);
            if (parent)
                answered.add(parent);
        }
        for (const reply of replies) {
            const commentId = str(reply.id);
            if (!commentId)
                continue;
            const timestamp = reply.timestamp ? str(reply.timestamp) : null;
            const parentId = str(reply.replied_to?.id);
            post.comments.push({
                platform: 'THREADS',
                postId,
                commentId,
                parentCommentId: parentId && parentId !== postId ? parentId : null,
                author: str(reply.username),
                isOwn: reply.is_reply_owned_by_me === true,
                answeredByUs: answered.has(commentId),
                text: str(reply.text),
                timestamp,
                ageMinutes: minutesSince(timestamp, now),
                likeCount: null, // Threads replies have no public like-count field
                hidden: str(reply.hide_status) === 'HIDDEN',
                permalink: reply.permalink ? str(reply.permalink) : null,
            });
        }
        posts.push(post);
    }
    return { account, posts };
}
async function inboxInstagram(input, now, channel) {
    const { token, error } = await loadTokenFile('INSTAGRAM', channel);
    if (!token)
        return { error };
    const me = await fetchMe(IG_BASE, token, 'id,username');
    if (!me.ok)
        return { error: me };
    const account = parseJson(me.body) ?? {};
    const uid = str(account.id);
    const ourName = str(account.username);
    if (!uid)
        return { error: fail(502, `Instagram /me returned no id: ${me.body}`) };
    const list = await graphRequest('get', `${IG_BASE}/${uid}/media`, {
        fields: 'id,permalink,caption,timestamp,comments_count',
        limit: String(input.postLimit),
        access_token: token,
    });
    if (!list.ok)
        return { account, error: list };
    const posts = [];
    for (const item of rawList(list.body)) {
        const postId = str(item.id);
        if (!postId)
            continue;
        const post = {
            platform: 'INSTAGRAM',
            postId,
            permalink: item.permalink ? str(item.permalink) : null,
            excerpt: excerpt(str(item.caption)),
            timestamp: item.timestamp ? str(item.timestamp) : null,
            comments: [],
        };
        if (numOrNull(item.comments_count) === 0) {
            posts.push(post);
            continue;
        }
        const comments = await graphRequest('get', `${IG_BASE}/${postId}/comments`, {
            fields: 'id,text,username,timestamp,like_count,hidden,replies{id,text,username,timestamp,like_count,hidden}',
            limit: String(input.commentLimit),
            access_token: token,
        });
        if (!comments.ok) {
            post.commentsError = `HTTP ${comments.status}: ${comments.body.slice(0, 200)}`;
            posts.push(post);
            continue;
        }
        for (const top of rawList(comments.body)) {
            const topId = str(top.id);
            if (!topId)
                continue;
            const nested = Array.isArray(top.replies?.data)
                ? top.replies.data
                : [];
            const push = (node, parentCommentId) => {
                const commentId = str(node.id);
                if (!commentId)
                    return;
                const timestamp = node.timestamp ? str(node.timestamp) : null;
                const author = str(node.username);
                post.comments.push({
                    platform: 'INSTAGRAM',
                    postId,
                    commentId,
                    parentCommentId,
                    author,
                    isOwn: !!ourName && author === ourName,
                    // On IG replies also hang off the top-level comment, so one of ours among the children means it's handled
                    answeredByUs: parentCommentId === null && nested.some((reply) => !!ourName && str(reply.username) === ourName),
                    text: str(node.text),
                    timestamp,
                    ageMinutes: minutesSince(timestamp, now),
                    likeCount: numOrNull(node.like_count),
                    hidden: node.hidden === true,
                    permalink: null, // IG comments have no permalink field — navigate via the post permalink
                });
            };
            push(top, null);
            for (const reply of nested)
                push(reply, topId);
        }
        posts.push(post);
    }
    return { account, posts };
}
async function inboxFacebook(input, now, channel) {
    const { token, error } = await loadTokenFile('FACEBOOK', channel);
    if (!token)
        return { error };
    const me = await fetchMe(FB_BASE, token, 'id,name');
    if (!me.ok)
        return { error: me };
    const account = parseJson(me.body) ?? {};
    const pageId = str(account.id);
    if (!pageId)
        return { error: fail(502, `Facebook /me returned no id: ${me.body}`) };
    const list = await graphRequest('get', `${FB_BASE}/${pageId}/posts`, {
        fields: 'id,message,created_time,permalink_url',
        limit: String(input.postLimit),
        access_token: token,
    });
    if (!list.ok)
        return { account, error: list };
    const posts = [];
    for (const item of rawList(list.body)) {
        const postId = str(item.id);
        if (!postId)
            continue;
        const post = {
            platform: 'FACEBOOK',
            postId,
            permalink: item.permalink_url ? str(item.permalink_url) : null,
            excerpt: excerpt(str(item.message)),
            timestamp: item.created_time ? str(item.created_time) : null,
            comments: [],
        };
        // filter=stream is what brings nested replies back in one flat list (toplevel gives only top-level)
        const comments = await graphRequest('get', `${FB_BASE}/${postId}/comments`, {
            filter: 'stream',
            // Newest first — when limit truncates, what has to survive is the golden-hour comments, not the old ones
            order: 'reverse_chronological',
            fields: 'id,message,from,created_time,like_count,comment_count,is_hidden,permalink_url,parent{id}',
            limit: String(input.commentLimit),
            access_token: token,
        });
        if (!comments.ok) {
            post.commentsError = `HTTP ${comments.status}: ${comments.body.slice(0, 200)}`;
            posts.push(post);
            continue;
        }
        const rows = rawList(comments.body);
        const answered = new Set();
        for (const row of rows) {
            if (str(row.from?.id) !== pageId)
                continue;
            const parent = str(row.parent?.id);
            if (parent)
                answered.add(parent);
        }
        for (const row of rows) {
            const commentId = str(row.id);
            if (!commentId)
                continue;
            const timestamp = row.created_time ? str(row.created_time) : null;
            const from = row.from;
            post.comments.push({
                platform: 'FACEBOOK',
                postId,
                commentId,
                parentCommentId: str(row.parent?.id) || null,
                author: str(from?.name) || str(from?.id),
                isOwn: str(from?.id) === pageId,
                answeredByUs: answered.has(commentId),
                text: str(row.message),
                timestamp,
                ageMinutes: minutesSince(timestamp, now),
                likeCount: numOrNull(row.like_count),
                hidden: row.is_hidden === true,
                permalink: row.permalink_url ? str(row.permalink_url) : null,
            });
        }
        posts.push(post);
    }
    return { account, posts };
}
/**
 * YouTube comment inbox — scans recent uploads and normalizes the comment threads per video.
 *
 * "Already answered" is decided by **the timestamp of our last reply** inside the thread:
 * comments posted before it are handled, comments posted after it are not. Lumping it
 * together per thread misses new comments that arrived after our reply; looking only per
 * comment answers a thread we already answered a second time.
 */
async function inboxYoutube(input, now, channel) {
    const { client, error: clientError } = await loadYoutubeClient(channel);
    if (!client)
        return { error: clientError };
    const { token, error: tokenError } = await exchangeYoutubeAccessToken(client);
    if (!token)
        return { error: tokenError };
    const mine = await youtubeRequest('get', `${YT_DATA_BASE}/channels`, { part: 'id,snippet,contentDetails', mine: 'true' }, token);
    if (!mine.ok)
        return { error: withYoutubeScopeHint(mine, 'youtube.readonly (or youtube)') };
    const channelItem = parseJson(mine.body)?.items?.[0];
    if (!channelItem)
        return { error: fail(502, `YouTube channels.list returned no channel: ${mine.body}`) };
    const myChannelId = str(channelItem.id);
    const account = { id: myChannelId, title: str(channelItem.snippet?.title) };
    const uploads = str(channelItem.contentDetails?.relatedPlaylists?.uploads);
    if (!uploads)
        return { account, error: fail(502, 'YouTube channel has no uploads playlist') };
    const list = await youtubeRequest('get', `${YT_DATA_BASE}/playlistItems`, { part: 'snippet,contentDetails', playlistId: uploads, maxResults: String(input.postLimit) }, token);
    if (!list.ok)
        return { account, error: list };
    const posts = [];
    for (const entry of parseJson(list.body)?.items ?? []) {
        const videoId = str(entry.contentDetails?.videoId);
        if (!videoId)
            continue;
        const snippet = entry.snippet ?? {};
        const post = {
            platform: 'YOUTUBE',
            postId: videoId,
            permalink: `https://www.youtube.com/watch?v=${videoId}`,
            excerpt: excerpt(str(snippet.title)),
            timestamp: snippet.publishedAt ? str(snippet.publishedAt) : null,
            comments: [],
        };
        const threads = await youtubeRequest('get', `${YT_DATA_BASE}/commentThreads`, {
            part: 'snippet,replies',
            videoId,
            maxResults: String(Math.min(input.commentLimit, 100)),
            order: 'time',
            textFormat: 'plainText',
        }, token);
        if (!threads.ok) {
            // A video with comments turned off returns 403 — one video's failure must not kill the inbox
            post.commentsError = `HTTP ${threads.status}: ${threads.body.slice(0, 200)}`;
            posts.push(post);
            continue;
        }
        for (const thread of parseJson(threads.body)?.items ?? []) {
            const threadSnippet = thread.snippet ?? {};
            const top = threadSnippet.topLevelComment ?? {};
            const topId = str(top.id);
            if (!topId)
                continue;
            // The replies part gives at most 5 — when it's truncated, fetch them all again.
            // If our reply is cut off and invisible, we misjudge it as unanswered and a
            // **duplicate reply** goes out.
            const totalReplies = Number(threadSnippet.totalReplyCount ?? 0);
            let replies = thread.replies?.comments ?? [];
            let repliesIncomplete = false;
            if (totalReplies > replies.length) {
                const full = await youtubeRequest('get', `${YT_DATA_BASE}/comments`, { part: 'snippet', parentId: topId, maxResults: '100', textFormat: 'plainText' }, token);
                if (full.ok) {
                    replies = parseJson(full.body)?.items ?? [];
                    // Threads over 100 are still truncated — the evidence for the verdict is incomplete
                    repliesIncomplete = totalReplies > replies.length;
                }
                else {
                    repliesIncomplete = true;
                    post.commentsError = [post.commentsError, `replies HTTP ${full.status}: ${full.body.slice(0, 120)}`]
                        .filter(Boolean)
                        .join(' · ');
                }
            }
            const authorChannelId = (comment) => str(comment.snippet?.authorChannelId?.value);
            const publishedMs = (comment) => {
                const parsed = Date.parse(str(comment.snippet?.publishedAt));
                return Number.isNaN(parsed) ? 0 : parsed;
            };
            // Timestamp of our last reply — only comments posted after it count as unanswered
            const myLastReplyMs = replies
                .filter((reply) => authorChannelId(reply) === myChannelId)
                .reduce((max, reply) => Math.max(max, publishedMs(reply)), 0);
            const push = (comment, parentCommentId) => {
                const commentId = str(comment.id);
                if (!commentId)
                    return;
                const commentSnippet = comment.snippet ?? {};
                const timestamp = commentSnippet.publishedAt ? str(commentSnippet.publishedAt) : null;
                post.comments.push({
                    platform: 'YOUTUBE',
                    postId: videoId,
                    commentId,
                    parentCommentId,
                    author: str(commentSnippet.authorDisplayName),
                    isOwn: authorChannelId(comment) === myChannelId,
                    // With an incomplete reply list there's no basis for claiming "not answered yet" —
                    // our reply may just be cut off, so treat it as handled and drop it from the
                    // default filter. A missed comment gets caught next tick; erring the other way
                    // sends a duplicate reply out in public.
                    answeredByUs: repliesIncomplete || (myLastReplyMs > 0 && publishedMs(comment) <= myLastReplyMs),
                    text: str(commentSnippet.textOriginal || commentSnippet.textDisplay),
                    timestamp,
                    ageMinutes: minutesSince(timestamp, now),
                    likeCount: numOrNull(commentSnippet.likeCount),
                    // Hidden comments never appear in the API response at all — only public ones show up
                    hidden: false,
                    permalink: `https://www.youtube.com/watch?v=${videoId}&lc=${commentId}`,
                });
            };
            push(top, null);
            for (const reply of replies)
                push(reply, topId);
        }
        posts.push(post);
    }
    return { account, posts };
}
/**
 * Cross-platform comment inbox — normalizes and collects comments on recent posts, and by
 * default carries **only other people's comments we haven't answered yet**. If one platform
 * fails, the rest come back as normal with the failure reason in skipped (a partial failure
 * doesn't block the whole thing).
 */
export async function commentInbox(input = {}) {
    const now = Date.now();
    const limits = {
        postLimit: Math.min(Math.max(input.postLimit ?? 5, 1), 25),
        commentLimit: Math.min(Math.max(input.commentLimit ?? 50, 1), 100),
    };
    // Availability is decided at channel scope — when a channel is given, only that channel directory's tokens count
    const available = new Set(availablePlatformsFor(input.channel));
    const requested = input.platforms?.length ? input.platforms : [...COMMENT_PLATFORMS];
    const collectors = {
        THREADS: inboxThreads,
        INSTAGRAM: inboxInstagram,
        FACEBOOK: inboxFacebook,
        YOUTUBE: inboxYoutube,
    };
    const accounts = {};
    const skipped = [];
    const posts = [];
    // Per-platform collection hits different APIs, so run them in parallel — overlapping up to
    // 75 serial round trips (25 posts × 3) by platform cuts the felt latency to a third. The
    // result order follows requested.
    const collected = await Promise.all(requested.map(async (platform) => ({
        platform,
        inbox: available.has(platform) ? await collectors[platform](limits, now, input.channel) : null,
    })));
    for (const { platform, inbox } of collected) {
        if (!inbox) {
            skipped.push({ platform, reason: `no credential file (${snsCredentialFile(platform, input.channel)})` });
            continue;
        }
        if (inbox.account)
            accounts[platform] = inbox.account;
        if (inbox.error) {
            skipped.push({ platform, reason: `HTTP ${inbox.error.status}: ${inbox.error.body.slice(0, 300)}` });
            continue;
        }
        posts.push(...(inbox.posts ?? []));
    }
    const cutoff = input.sinceHours ? now - input.sinceHours * 3_600_000 : null;
    let fetched = 0;
    const filtered = posts.map((post) => {
        fetched += post.comments.length;
        const comments = post.comments.filter((comment) => {
            if (!input.includeOwn && comment.isOwn)
                return false;
            if (!input.includeAnswered && comment.answeredByUs)
                return false;
            if (cutoff !== null && comment.timestamp !== null && Date.parse(comment.timestamp) < cutoff)
                return false;
            return true;
        });
        return { ...post, comments };
    });
    const actionable = filtered.flatMap((post) => post.comments);
    const byPlatform = {};
    for (const comment of actionable)
        byPlatform[comment.platform] = (byPlatform[comment.platform] ?? 0) + 1;
    // Filling the ceiling (25 posts × 100 comments) eats a large slice of the caller's context.
    // When trimming is needed, drop **the oldest first** — the golden-hour (first 60 minutes)
    // comments have to survive. The summary counts stay at their **pre-trim** values: recounting
    // from the trimmed list would under-report, e.g. "3 unanswered", and leave replies undone.
    const { posts: trimmedPosts, dropped } = capInboxPayload(filtered);
    return okJson({
        channel: input.channel ?? null,
        accounts,
        summary: {
            postsScanned: posts.length,
            commentsFetched: fetched,
            actionable: actionable.length,
            byPlatform,
            // Unanswered comments still inside the golden hour (first 60 minutes) — the top priority signal
            withinGoldenHour: actionable.filter((c) => c.ageMinutes !== null && c.ageMinutes <= 60).length,
            oldestActionableMinutes: actionable.reduce((max, c) => (c.ageMinutes === null ? max : max === null ? c.ageMinutes : Math.max(max, c.ageMinutes)), null),
            filters: {
                includeOwn: input.includeOwn ?? false,
                includeAnswered: input.includeAnswered ?? false,
                sinceHours: input.sinceHours ?? null,
                ...limits,
            },
            ...(dropped > 0
                ? {
                    truncated: `The response size ceiling dropped ${dropped} older comment(s) from the list (the counts above are pre-trim). To see them all, narrow the window with sinceHours or lower commentLimit/postLimit and query again.`,
                }
                : {}),
        },
        posts: trimmedPosts,
        skipped,
    });
}
/** Serialization ceiling for the inbox response — anything over it is dropped, oldest comments first. */
const INBOX_MAX_CHARS = 60_000;
function capInboxPayload(posts) {
    if (JSON.stringify(posts).length <= INBOX_MAX_CHARS)
        return { posts, dropped: 0 };
    // Line every post's comments up in one list, sort newest first, then carry as many as fit
    // under the ceiling. Comments without ageMinutes (no timestamp given) offer nothing to
    // judge by, so they go to the back.
    const ranked = posts
        .flatMap((post) => post.comments)
        .sort((a, b) => (a.ageMinutes ?? Number.MAX_SAFE_INTEGER) - (b.ageMinutes ?? Number.MAX_SAFE_INTEGER));
    // Serialized size grows monotonically with the keep count, so binary-search for "the largest
    // keep count that fits under the ceiling" — halving repeatedly threw away more than needed
    // (up to twice as much).
    const keepTop = (count) => {
        const survivors = new Set(ranked.slice(0, count).map((comment) => comment.commentId));
        return posts.map((post) => ({ ...post, comments: post.comments.filter((c) => survivors.has(c.commentId)) }));
    };
    let lo = 0;
    let hi = ranked.length;
    while (lo < hi) {
        const mid = Math.floor((lo + hi + 1) / 2);
        if (JSON.stringify(keepTop(mid)).length <= INBOX_MAX_CHARS)
            lo = mid;
        else
            hi = mid - 1;
    }
    return { posts: keepTop(lo), dropped: ranked.length - lo };
}
/** Replies to a received comment — public the moment it's called. Absorbs the per-platform reply endpoint differences. */
export async function replyToComment(input) {
    if (input.platform === 'THREADS') {
        // Threads has no separate reply endpoint — a new post carrying reply_to_id is the reply
        return publishThreads({ caption: input.message, replyToId: input.commentId, channel: input.channel });
    }
    if (input.platform === 'FACEBOOK') {
        // On FB, commenting on a comment id makes a nested reply — same endpoint as a post's first comment
        return commentFacebook({ postId: input.commentId, message: input.message, channel: input.channel });
    }
    if (input.platform === 'YOUTUBE')
        return replyYoutubeComment(input);
    const { token, error } = await loadTokenFile('INSTAGRAM', input.channel);
    if (!token)
        return error;
    const create = await graphRequest('post', `${IG_BASE}/${input.commentId}/replies`, {
        message: input.message,
        access_token: token,
    });
    if (!create.ok)
        return create;
    const replyId = str(parseJson(create.body)?.id);
    if (!replyId)
        return fail(502, `Instagram reply returned no id: ${create.body}`);
    return okJson({ platform: 'INSTAGRAM', replyId, permalink: null });
}
/**
 * YouTube reply — the parentId of `comments.insert` accepts **top-level comments only**.
 * Passing a nested reply's id straight through fails, so we look up that comment's parent
 * first and attach to the thread root instead. This step is needed because the inbox also
 * surfaces nested replies as things to answer.
 */
async function replyYoutubeComment(input) {
    const { client, error: clientError } = await loadYoutubeClient(input.channel);
    if (!client)
        return clientError;
    const { token, error: tokenError } = await exchangeYoutubeAccessToken(client);
    if (!token)
        return tokenError;
    const lookup = await youtubeRequest('get', `${YT_DATA_BASE}/comments`, { part: 'snippet', id: input.commentId }, token);
    if (!lookup.ok)
        return withYoutubeScopeHint(lookup, 'youtube.force-ssl');
    const found = parseJson(lookup.body)?.items?.[0];
    if (!found)
        return fail(404, `YouTube comment not found: ${input.commentId}`);
    const parentId = str(found.snippet?.parentId) || input.commentId;
    const created = await youtubeRequest('post', `${YT_DATA_BASE}/comments`, { part: 'snippet' }, token, { snippet: { parentId, textOriginal: input.message } });
    if (!created.ok)
        return withYoutubeScopeHint(created, 'youtube.force-ssl');
    const replyId = str(parseJson(created.body)?.id);
    if (!replyId)
        return fail(502, `YouTube comment insert returned no id: ${created.body}`);
    return okJson({
        platform: 'YOUTUBE',
        replyId,
        // A request made with a nested reply's id lands on a different parent — report where it attached
        parentCommentId: parentId,
        permalink: null,
    });
}
/**
 * Hiding/unhiding comments and liking FB comments. **Deletion is deliberately not offered** —
 * hiding is reversible and the author still sees their comment, while deletion is
 * irreversible, so hiding carries less brand risk when handling spam and abuse
 * (confirmed by the user, 2026-07-26).
 */
export async function moderateComment(input) {
    const { platform, commentId, action, channel } = input;
    const hide = action === 'hide';
    if (action === 'like' || action === 'unlike') {
        if (platform !== 'FACEBOOK') {
            return fail(400, `${platform} has no comment-like API — the only way to react is a reply (sns_comment_reply).`);
        }
        const { token, error } = await loadTokenFile('FACEBOOK', channel);
        if (!token)
            return error;
        const res = await graphRequest(action === 'like' ? 'post' : 'delete', `${FB_BASE}/${commentId}/likes`, {
            access_token: token,
        });
        if (!res.ok)
            return res;
        return okJson({ platform, commentId, action, done: true });
    }
    if (platform === 'THREADS') {
        const { token, error } = await loadTokenFile('THREADS', channel);
        if (!token)
            return error;
        const res = await graphRequest('post', `${THREADS_BASE}/${commentId}/manage_reply`, {
            hide: String(hide),
            access_token: token,
        });
        if (!res.ok)
            return res;
        return okJson({ platform, commentId, action, done: true });
    }
    if (platform === 'INSTAGRAM') {
        const { token, error } = await loadTokenFile('INSTAGRAM', channel);
        if (!token)
            return error;
        const res = await graphRequest('post', `${IG_BASE}/${commentId}`, {
            hide: String(hide),
            access_token: token,
        });
        if (!res.ok)
            return res;
        return okJson({ platform, commentId, action, done: true });
    }
    if (platform === 'YOUTUBE') {
        // YouTube's hide is `setModerationStatus` (rejected/heldForReview), which means something
        // else and contradicts the "reversible hide" this tool promises — better to refuse than to
        // map it wrong
        return fail(400, 'This tool does not support hiding YouTube comments — all YouTube offers is hold-for-review/reject ' +
            '(setModerationStatus), which means something different and cannot be mapped to a reversible hide. ' +
            'Handle it in YouTube Studio > Comments.');
    }
    const { token, error } = await loadTokenFile('FACEBOOK', channel);
    if (!token)
        return error;
    const res = await graphRequest('post', `${FB_BASE}/${commentId}`, {
        is_hidden: String(hide),
        access_token: token,
    });
    if (!res.ok)
        return res;
    return okJson({ platform, commentId, action, done: true });
}
// ── Account checks ───────────────────────────────────────────────
/**
 * Checks all four platforms for one credential set (a single channel or the default tokens)
 * — token values are never included. The platform checks are independent, so they run in
 * parallel (4 serial round trips → the latency of one).
 */
async function checkPlatformSet(channel) {
    const metaChecks = [
        ['threads', 'THREADS', THREADS_BASE, 'id,username'],
        ['instagram', 'INSTAGRAM', IG_BASE, 'id,username'],
        ['facebook', 'FACEBOOK', FB_BASE, 'id,name'],
    ].map(async ([key, platform, baseUrl, fields]) => {
        const { token, error } = await loadTokenFile(platform, channel);
        if (!token)
            return [key, { ok: false, reason: error.body }];
        const me = await fetchMe(baseUrl, token, fields);
        return [
            key,
            me.ok
                ? { ok: true, account: parseJson(me.body) }
                : { ok: false, status: me.status, reason: me.body.slice(0, 300) },
        ];
    });
    const youtubeCheck = (async () => {
        const { client, error: clientError } = await loadYoutubeClient(channel);
        if (!client)
            return ['youtube', { ok: false, reason: clientError.body }];
        const { token, error } = await exchangeYoutubeAccessToken(client);
        if (!token)
            return ['youtube', { ok: false, status: error.status, reason: error.body.slice(0, 300) }];
        try {
            const res = await fetch('https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true', {
                headers: { Authorization: `Bearer ${token}` },
                signal: AbortSignal.timeout(30_000),
            });
            const text = await res.text();
            const items = parseJson(text)?.items ?? [];
            return [
                'youtube',
                res.ok
                    ? {
                        ok: true,
                        channels: items.map((item) => ({
                            id: item.id,
                            title: item.snippet?.title,
                        })),
                    }
                    : { ok: false, status: res.status, reason: text.slice(0, 300) },
            ];
        }
        catch (error) {
            return ['youtube', { ok: false, reason: error instanceof Error ? error.message : String(error) }];
        }
    })();
    return Object.fromEntries(await Promise.all([...metaChecks, youtubeCheck]));
}
/**
 * Batch check of the SNS publishing credentials — with channel given, only that channel's
 * set; without it, every channel directory plus the default (flat) tokens. Returns account
 * identification only.
 */
export async function checkAccounts(channel) {
    if (channel) {
        const body = { channel, platforms: await checkPlatformSet(channel) };
        return { ok: true, status: 200, body: JSON.stringify(body, null, 2) };
    }
    const channelEntries = await Promise.all(listChannelDirs().map(async (dir) => [dir.channel, await checkPlatformSet(dir.channel)]));
    const channels = Object.fromEntries(channelEntries);
    // Check the default (flat) tokens only when they exist — otherwise a setup that has moved
    // everything into channel directories would produce all-failed noise.
    const hasDefaults = availablePlatformsFor().length > 0;
    const body = {
        channels,
        defaultTokens: hasDefaults
            ? await checkPlatformSet()
            : 'none — publishing without a channel (omitting the channel argument) is not possible. Pass channel to the publish tools.',
    };
    // Completing the check is itself the success — platform setup is optional, so an unconfigured
    // platform's ok:false is reported in the body detail only and doesn't mark the whole tool result failed.
    return { ok: true, status: 200, body: JSON.stringify(body, null, 2) };
}
