import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { SNS_CHANNELS, snsCredentialFiles } from './config.js';
/**
 * 자사 SNS 직접 게시 클라이언트 — 채널별 로컬 자격증명 파일(config.snsCredentialFiles)로
 * 각 플랫폼 API 를 직접 호출해 **즉시 공개 게시**한다.
 *
 * HITL 계약: 이 모듈에는 별도 검토 게이트가 없다 — 호출 = 게시다. 도구 설명에 명시된
 * 대로, 사람이 최종 문안·미디어를 승인한 직후에만 호출해야 한다.
 *
 * 계정 결정: 계정 ID 를 설정으로 받지 않고 토큰의 `/me` 로 조회한다 — 토큰과 계정의
 * 불일치(잘못된 계정으로 게시)가 원천적으로 불가능하다.
 *
 * 토큰 파일(사용자 소유, 커밋 금지):
 *   THREADS/INSTAGRAM/FACEBOOK — 60일 갱신형(FB 페이지는 무기한) 평문 1줄
 *   YOUTUBE — { client_id, client_secret, refresh_token } JSON
 */
/** 자격증명 파일이 존재하는 채널 — 채널별 게시 툴의 ListTools 노출 게이트. */
export function enabledChannels() {
    return SNS_CHANNELS.filter((channel) => existsSync(snsCredentialFiles[channel]));
}
const THREADS_BASE = 'https://graph.threads.net/v1.0';
const IG_BASE = 'https://graph.instagram.com/v23.0';
const FB_BASE = 'https://graph.facebook.com/v23.0';
const DEFAULT_POLL_INTERVAL_MS = 2_000;
const DEFAULT_POLL_MAX_TRIES = 60; // 릴스 영상 처리 여유 (2s × 60 = 2분)
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
async function loadTokenFile(channel) {
    const filePath = snsCredentialFiles[channel];
    try {
        const token = (await readFile(filePath, 'utf8')).trim();
        if (!token)
            return { error: fail(400, `Token file is empty: ${filePath}`) };
        return { token };
    }
    catch {
        return {
            error: fail(400, `Token file not found: ${filePath} — ${channel} 게시에는 로컬 토큰이 필요하다 (SNS_TOKEN_DIR 또는 채널별 *_TOKEN_FILE env 로 위치 변경 가능).`),
        };
    }
}
/** Graph 계열 공통 fetch — 파라미터는 쿼리스트링, 실패는 구조화 결과로. 토큰 값은 오류 메시지에 싣지 않는다. */
async function graphRequest(method, baseUrl, params, timeoutMs = 30_000) {
    const sp = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== '')
            sp.set(key, value);
    }
    const url = `${baseUrl}?${sp.toString()}`;
    try {
        const res = await fetch(url, { method: method.toUpperCase(), signal: AbortSignal.timeout(timeoutMs) });
        const text = await res.text();
        return { ok: res.ok, status: res.status, body: text };
    }
    catch (error) {
        const redacted = baseUrl; // 토큰이 실린 전체 URL 은 노출 금지
        if (error instanceof Error && error.name === 'TimeoutError') {
            return fail(504, `Request timed out after ${timeoutMs}ms: ${redacted}`);
        }
        return fail(502, `Upstream unreachable (${redacted}): ${error instanceof Error ? error.message : String(error)}`);
    }
}
/** 컨테이너 상태 폴링 — statusField 가 FINISHED 가 될 때까지. ERROR/EXPIRED 는 즉시 실패. */
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
/** /me 로 토큰 소유 계정 조회 — 반환 body 는 플랫폼 원문 JSON. */
async function fetchMe(baseUrl, accessToken, fields) {
    return graphRequest('get', `${baseUrl}/me`, { fields, access_token: accessToken });
}
function okJson(payload) {
    return { ok: true, status: 200, body: JSON.stringify(payload) };
}
export async function publishThreads(input, opts) {
    const { token, error } = await loadTokenFile('THREADS');
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
        reply_to_id: input.replyToId,
        access_token: token,
    });
    if (!create.ok)
        return create;
    const creationId = String(parseJson(create.body)?.id ?? '');
    if (!creationId)
        return fail(502, `Threads container create returned no id: ${create.body}`);
    if (input.imageUrl) {
        const pollFailure = await pollContainer(THREADS_BASE, creationId, token, 'status', opts);
        if (pollFailure)
            return pollFailure;
    }
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
export async function publishInstagram(input, opts) {
    const { token, error } = await loadTokenFile('INSTAGRAM');
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
        // 캐러셀 — 자식 컨테이너를 만들고 전부 FINISHED 후 묶는다
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
export async function publishFacebook(input) {
    const { token, error } = await loadTokenFile('FACEBOOK');
    if (!token)
        return error;
    // 페이지 토큰의 /me = 페이지 자신
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
    const permalink = await graphRequest('get', `${FB_BASE}/${postId}`, {
        fields: 'permalink_url',
        access_token: token,
    });
    return okJson({
        platform: 'FACEBOOK',
        postId,
        permalink: permalink.ok ? (parseJson(permalink.body)?.permalink_url ?? null) : null,
    });
}
/** 페이지 명의로 자기 게시물에 댓글 작성 — "원문 링크는 첫 댓글로" 채널 규칙용 (scope: pages_manage_engagement). */
export async function commentFacebook(input) {
    const { token, error } = await loadTokenFile('FACEBOOK');
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
async function loadYoutubeClient() {
    const filePath = snsCredentialFiles.YOUTUBE;
    let raw;
    try {
        raw = await readFile(filePath, 'utf8');
    }
    catch {
        return { error: fail(400, `Token file not found: ${filePath}`) };
    }
    const parsed = parseJson(raw);
    const client = parsed;
    if (!client?.client_id || !client.client_secret || !client.refresh_token) {
        return { error: fail(400, `youtube-oauth-client.json requires client_id/client_secret/refresh_token: ${filePath}`) };
    }
    return { client };
}
async function exchangeYoutubeAccessToken(client) {
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
export async function publishYoutube(input) {
    const mimeType = YT_VIDEO_MIME_BY_EXT[extname(input.videoFilePath).toLowerCase()];
    if (!mimeType)
        return fail(400, `Unsupported video extension: ${input.videoFilePath} (.mp4/.mov)`);
    let bytes;
    try {
        bytes = await readFile(input.videoFilePath);
    }
    catch (error) {
        return fail(400, `Cannot read video file: ${error instanceof Error ? error.message : String(error)}`);
    }
    // 썸네일은 업로드 전에 검증 — videos.insert 는 1,600유닛/호출이라 실패를 뒤로 미루면 쿼터가 탄다
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
    const { client, error: clientError } = await loadYoutubeClient();
    if (!client)
        return clientError;
    const { token, error: tokenError } = await exchangeYoutubeAccessToken(client);
    if (!token)
        return tokenError;
    // resumable 세션 개시 → Location 에 바이트 PUT (콘솔 어댑터와 동일 계약)
    let location;
    try {
        const init = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                snippet: {
                    title: input.title,
                    description: input.description,
                    categoryId: input.categoryId ?? '25',
                },
                status: { privacyStatus: input.privacyStatus ?? 'public', selfDeclaredMadeForKids: false },
            }),
            signal: AbortSignal.timeout(30_000),
        });
        if (!init.ok)
            return { ok: false, status: init.status, body: await init.text() };
        location = init.headers.get('location');
    }
    catch (error) {
        return fail(502, `YouTube resumable init failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!location)
        return fail(502, 'YouTube resumable init returned no Location header');
    try {
        const view = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const upload = await fetch(location, {
            method: 'PUT',
            headers: { 'Content-Type': mimeType },
            body: view,
            signal: AbortSignal.timeout(600_000),
        });
        const text = await upload.text();
        if (!upload.ok)
            return { ok: false, status: upload.status, body: text };
        const videoId = String(parseJson(text)?.id ?? '');
        if (!videoId)
            return fail(502, `YouTube upload returned no video id: ${text}`);
        // 썸네일 실패는 경고로만 — 업로드는 이미 성공했고 재게시는 비멱등·쿼터 소모라 전체 실패로 만들지 않는다
        const thumbnailWarning = thumb ? await setYoutubeThumbnail(token, videoId, thumb) : undefined;
        return okJson({
            platform: 'YOUTUBE',
            videoId,
            permalink: `https://www.youtube.com/watch?v=${videoId}`,
            fileName: basename(input.videoFilePath),
            ...(thumb ? { thumbnailSet: !thumbnailWarning } : {}),
            ...(thumbnailWarning ? { thumbnailWarning } : {}),
        });
    }
    catch (error) {
        return fail(502, `YouTube upload failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}
// ── 댓글 인박스 · 답글 · 모더레이션 ──────────────────────────────
/**
 * 받은 댓글 관리 경로. 읽기(인박스)는 부작용이 없지만 **답글·모더레이션은 게시와
 * 똑같이 호출 즉시 외부 공개**다 — 툴 설명의 HITL 규칙이 유일한 게이트다.
 *
 * 채널 능력이 비대칭이다 (2026-07-26 토큰 실측):
 *   THREADS   읽기 `/conversation`(깊이 무관 평면화) · 답글 `reply_to_id` · 숨김 `manage_reply` · 좋아요 API 없음
 *   INSTAGRAM 읽기 `/comments{replies}` · 답글 `/{comment}/replies`(최상위 댓글에만) · 숨김 `hide` · 좋아요 API 없음
 *   FACEBOOK  읽기 `/comments?filter=stream` · 답글 `/{comment}/comments` · 숨김 `is_hidden` · 좋아요 O
 *   YOUTUBE   토큰 scope 에 `youtube.force-ssl` 이 없어 댓글 API 자체가 불가 — 인박스에서 제외한다
 *
 * "우리가 이미 답했는가"는 채널 필드로 판정한다(THREADS `is_reply_owned_by_me`,
 * IG username 일치, FB `from.id == pageId`) — 추측하지 않으므로 중복 답글이 나가지 않는다.
 */
export const COMMENT_CHANNELS = ['THREADS', 'INSTAGRAM', 'FACEBOOK'];
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
async function inboxThreads(input, now) {
    const { token, error } = await loadTokenFile('THREADS');
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
    // is_reply 인 항목은 우리 자기 답글 — 게시물이 아니라 답글이므로 인박스 루트가 아니다
    for (const item of rawList(list.body).filter((item) => item.is_reply !== true)) {
        const postId = str(item.id);
        if (!postId)
            continue;
        const post = {
            channel: 'THREADS',
            postId,
            permalink: item.permalink ? str(item.permalink) : null,
            excerpt: excerpt(str(item.text)),
            timestamp: item.timestamp ? str(item.timestamp) : null,
            comments: [],
        };
        // conversation 은 깊이와 무관하게 전체 답글을 평면화해 준다 — 대댓글 체인 추적에 필수
        const conv = await graphRequest('get', `${THREADS_BASE}/${postId}/conversation`, {
            fields: 'id,text,username,timestamp,permalink,is_reply_owned_by_me,hide_status,replied_to',
            // 최신순 — limit 로 잘릴 때 남겨야 하는 건 오래된 댓글이 아니라 골든아워 댓글이다
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
                channel: 'THREADS',
                postId,
                commentId,
                parentCommentId: parentId && parentId !== postId ? parentId : null,
                author: str(reply.username),
                isOwn: reply.is_reply_owned_by_me === true,
                answeredByUs: answered.has(commentId),
                text: str(reply.text),
                timestamp,
                ageMinutes: minutesSince(timestamp, now),
                likeCount: null, // Threads 답글에는 공개 좋아요 수 필드가 없다
                hidden: str(reply.hide_status) === 'HIDDEN',
                permalink: reply.permalink ? str(reply.permalink) : null,
            });
        }
        posts.push(post);
    }
    return { account, posts };
}
async function inboxInstagram(input, now) {
    const { token, error } = await loadTokenFile('INSTAGRAM');
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
            channel: 'INSTAGRAM',
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
                    channel: 'INSTAGRAM',
                    postId,
                    commentId,
                    parentCommentId,
                    author,
                    isOwn: !!ourName && author === ourName,
                    // IG 는 답글도 최상위 댓글에 매달리므로, 자식 중 우리 것이 있으면 응대 완료
                    answeredByUs: parentCommentId === null && nested.some((reply) => !!ourName && str(reply.username) === ourName),
                    text: str(node.text),
                    timestamp,
                    ageMinutes: minutesSince(timestamp, now),
                    likeCount: numOrNull(node.like_count),
                    hidden: node.hidden === true,
                    permalink: null, // IG 댓글에는 permalink 필드가 없다 — 게시물 permalink 로 이동
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
async function inboxFacebook(input, now) {
    const { token, error } = await loadTokenFile('FACEBOOK');
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
            channel: 'FACEBOOK',
            postId,
            permalink: item.permalink_url ? str(item.permalink_url) : null,
            excerpt: excerpt(str(item.message)),
            timestamp: item.created_time ? str(item.created_time) : null,
            comments: [],
        };
        // filter=stream 이어야 대댓글까지 평면 목록으로 온다 (toplevel 은 최상위만)
        const comments = await graphRequest('get', `${FB_BASE}/${postId}/comments`, {
            filter: 'stream',
            // 최신순 — limit 로 잘릴 때 남겨야 하는 건 오래된 댓글이 아니라 골든아워 댓글이다
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
                channel: 'FACEBOOK',
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
 * 채널 횡단 댓글 인박스 — 최근 게시물의 댓글을 정규화해 모으고, 기본값으로
 * **우리가 아직 답하지 않은 남의 댓글만** 남긴다. 채널 하나가 실패해도 나머지는
 * 그대로 반환하고 실패 사유를 skipped 에 싣는다(부분 실패가 전체를 막지 않는다).
 */
export async function commentInbox(input = {}) {
    const now = Date.now();
    const limits = {
        postLimit: Math.min(Math.max(input.postLimit ?? 5, 1), 25),
        commentLimit: Math.min(Math.max(input.commentLimit ?? 50, 1), 100),
    };
    const available = new Set(enabledChannels());
    const requested = input.channels?.length ? input.channels : [...COMMENT_CHANNELS];
    const collectors = {
        THREADS: inboxThreads,
        INSTAGRAM: inboxInstagram,
        FACEBOOK: inboxFacebook,
    };
    const accounts = {};
    const skipped = [];
    const posts = [];
    for (const channel of requested) {
        if (!available.has(channel)) {
            skipped.push({ channel, reason: `자격증명 파일 없음 (${snsCredentialFiles[channel]})` });
            continue;
        }
        const result = await collectors[channel](limits, now);
        if (result.account)
            accounts[channel] = result.account;
        if (result.error) {
            skipped.push({ channel, reason: `HTTP ${result.error.status}: ${result.error.body.slice(0, 300)}` });
            continue;
        }
        posts.push(...(result.posts ?? []));
    }
    if (available.has('YOUTUBE')) {
        skipped.push({
            channel: 'YOUTUBE',
            reason: '토큰 scope 에 youtube.force-ssl 이 없어 댓글 조회·작성 불가 — YouTube Studio 에서 수동 응대',
        });
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
    const byChannel = {};
    for (const comment of actionable)
        byChannel[comment.channel] = (byChannel[comment.channel] ?? 0) + 1;
    return okJson({
        accounts,
        summary: {
            postsScanned: posts.length,
            commentsFetched: fetched,
            actionable: actionable.length,
            byChannel,
            // 골든타임(첫 60분) 안에 남은 미응대 — 우선순위 판단의 1순위 신호
            withinGoldenHour: actionable.filter((c) => c.ageMinutes !== null && c.ageMinutes <= 60).length,
            oldestActionableMinutes: actionable.reduce((max, c) => (c.ageMinutes === null ? max : max === null ? c.ageMinutes : Math.max(max, c.ageMinutes)), null),
            filters: {
                includeOwn: input.includeOwn ?? false,
                includeAnswered: input.includeAnswered ?? false,
                sinceHours: input.sinceHours ?? null,
                ...limits,
            },
        },
        posts: filtered,
        skipped,
    });
}
/** 받은 댓글에 답글 작성 — 호출 즉시 공개. 채널별 답글 엔드포인트 차이를 흡수한다. */
export async function replyToComment(input) {
    if (input.channel === 'THREADS') {
        // Threads 답글은 별도 엔드포인트가 없다 — reply_to_id 를 단 새 게시물이 곧 답글이다
        return publishThreads({ caption: input.message, replyToId: input.commentId });
    }
    if (input.channel === 'FACEBOOK') {
        // FB 는 댓글 id 에 댓글을 달면 대댓글 — 게시물 첫 댓글과 같은 엔드포인트다
        return commentFacebook({ postId: input.commentId, message: input.message });
    }
    const { token, error } = await loadTokenFile('INSTAGRAM');
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
 * 댓글 숨김/해제와 FB 댓글 좋아요. **삭제는 의도적으로 제공하지 않는다** —
 * 숨김은 되돌릴 수 있고 작성자에게는 계속 보이지만 삭제는 비가역이라,
 * 스팸·어뷰징 대응에는 숨김이 브랜드 리스크가 더 낮다 (2026-07-26 사용자 확정).
 */
export async function moderateComment(input) {
    const { channel, commentId, action } = input;
    const hide = action === 'hide';
    if (action === 'like' || action === 'unlike') {
        if (channel !== 'FACEBOOK') {
            return fail(400, `${channel} 는 댓글 좋아요 API 가 없다 — 답글(sns_comment_reply)로만 반응할 수 있다.`);
        }
        const { token, error } = await loadTokenFile('FACEBOOK');
        if (!token)
            return error;
        const res = await graphRequest(action === 'like' ? 'post' : 'delete', `${FB_BASE}/${commentId}/likes`, {
            access_token: token,
        });
        if (!res.ok)
            return res;
        return okJson({ platform: channel, commentId, action, done: true });
    }
    if (channel === 'THREADS') {
        const { token, error } = await loadTokenFile('THREADS');
        if (!token)
            return error;
        const res = await graphRequest('post', `${THREADS_BASE}/${commentId}/manage_reply`, {
            hide: String(hide),
            access_token: token,
        });
        if (!res.ok)
            return res;
        return okJson({ platform: channel, commentId, action, done: true });
    }
    if (channel === 'INSTAGRAM') {
        const { token, error } = await loadTokenFile('INSTAGRAM');
        if (!token)
            return error;
        const res = await graphRequest('post', `${IG_BASE}/${commentId}`, {
            hide: String(hide),
            access_token: token,
        });
        if (!res.ok)
            return res;
        return okJson({ platform: channel, commentId, action, done: true });
    }
    const { token, error } = await loadTokenFile('FACEBOOK');
    if (!token)
        return error;
    const res = await graphRequest('post', `${FB_BASE}/${commentId}`, {
        is_hidden: String(hide),
        access_token: token,
    });
    if (!res.ok)
        return res;
    return okJson({ platform: channel, commentId, action, done: true });
}
// ── 계정 점검 ────────────────────────────────────────────────────
/** SNS 게시 자격증명 일괄 점검 — 계정 식별 정보만 반환, 토큰 값은 절대 싣지 않는다. */
export async function checkAccounts() {
    const summary = {};
    for (const [key, channel, baseUrl, fields] of [
        ['threads', 'THREADS', THREADS_BASE, 'id,username'],
        ['instagram', 'INSTAGRAM', IG_BASE, 'id,username'],
        ['facebook', 'FACEBOOK', FB_BASE, 'id,name'],
    ]) {
        const { token, error } = await loadTokenFile(channel);
        if (!token) {
            summary[key] = { ok: false, reason: error.body };
            continue;
        }
        const me = await fetchMe(baseUrl, token, fields);
        summary[key] = me.ok
            ? { ok: true, account: parseJson(me.body) }
            : { ok: false, status: me.status, reason: me.body.slice(0, 300) };
    }
    const { client, error: clientError } = await loadYoutubeClient();
    if (!client) {
        summary.youtube = { ok: false, reason: clientError.body };
    }
    else {
        const { token, error } = await exchangeYoutubeAccessToken(client);
        if (!token) {
            summary.youtube = { ok: false, status: error.status, reason: error.body.slice(0, 300) };
        }
        else {
            try {
                const res = await fetch('https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true', {
                    headers: { Authorization: `Bearer ${token}` },
                    signal: AbortSignal.timeout(30_000),
                });
                const text = await res.text();
                const items = parseJson(text)?.items ?? [];
                summary.youtube = res.ok
                    ? {
                        ok: true,
                        channels: items.map((item) => ({
                            id: item.id,
                            title: item.snippet?.title,
                        })),
                    }
                    : { ok: false, status: res.status, reason: text.slice(0, 300) };
            }
            catch (error) {
                summary.youtube = { ok: false, reason: error instanceof Error ? error.message : String(error) };
            }
        }
    }
    // 점검이 완료되면 그 자체로 성공이다 — 채널 구성은 선택적이므로 미설정 채널의
    // ok:false 는 body 상세로만 보고하고 툴 결과 전체를 실패로 표시하지 않는다.
    return { ok: true, status: 200, body: JSON.stringify(summary, null, 2) };
}
