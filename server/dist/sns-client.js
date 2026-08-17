import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync as nodeMkdirSync, readFileSync as nodeReadFileSync, rmSync as nodeRmSync, writeFileSync as nodeWriteFileSync, } from 'node:fs';
import { open as nodeOpen, readFile, stat } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import { SNS_PLATFORMS, listChannelDirs, snsCredentialFile, snsTokenDir } from './config.js';
/**
 * 자사 SNS 직접 게시 클라이언트 — 로컬 자격증명 파일(config.snsCredentialFile 로
 * 채널·플랫폼 해석)로 각 플랫폼 API 를 직접 호출해 **즉시 공개 게시**한다.
 *
 * 멀티 채널: 모든 게시·댓글 입력이 선택 인자 `channel`(브랜드 slug)을 받는다 —
 * 지정 시 <SNS_TOKEN_DIR>/<slug>/ 토큰만 쓰고 기본(평면) 토큰으로 폴백하지 않는다
 * (오계정 게시 방지). 미지정 시 기본 토큰(단일 채널·레거시 경로)을 쓴다.
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
/**
 * 자격증명 파일이 존재하는 플랫폼(기본 토큰 ∪ 채널 디렉토리) — 플랫폼별 게시 툴의
 * ListTools 노출 게이트. 어느 채널이든 토큰이 있으면 그 플랫폼 툴은 노출돼야 한다.
 */
export function enabledPlatforms() {
    const channelDirs = listChannelDirs();
    return SNS_PLATFORMS.filter((platform) => existsSync(snsCredentialFile(platform)) || channelDirs.some((dir) => dir.platforms.includes(platform)));
}
/** 해당 채널(미지정 시 기본 토큰) 기준으로 자격증명 파일이 존재하는 플랫폼. */
function availablePlatformsFor(channel) {
    return SNS_PLATFORMS.filter((platform) => existsSync(snsCredentialFile(platform, channel)));
}
/**
 * Meta Graph API 버전 — 한 곳에서만 관리한다.
 *
 * 최신은 v25.0(2026-02)이지만 v23.0(2025-05)에 고정해 둔다. Meta 버전은 릴리스 후
 * 약 2년간 유효하므로 v23.0 은 2027년까지 살아 있고, 버전을 고정해야 상위 버전의
 * 파괴적 변경이 게시를 조용히 깨뜨리지 않는다. 올릴 때는 이 상수 하나만 바꾼다.
 */
const GRAPH_VERSION = 'v23.0';
const THREADS_BASE = 'https://graph.threads.net/v1.0'; // Threads 는 자체 버전 체계
const IG_BASE = `https://graph.instagram.com/${GRAPH_VERSION}`;
const FB_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
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
/** 토큰 부재 안내 — 채널 지정 시 폴백하지 않는 이유와 사용 가능 채널 목록을 함께 싣는다. */
function missingTokenMessage(platform, channel, filePath) {
    if (!channel) {
        return (`Token file not found: ${filePath} — ${platform} 게시에는 로컬 토큰이 필요하다 ` +
            `(채널별 토큰은 channel 인자 + <SNS_TOKEN_DIR>/<slug>/ 디렉토리, 위치 변경은 SNS_TOKEN_DIR env).`);
    }
    const channels = listChannelDirs()
        .map((dir) => `${dir.channel}(${dir.platforms.join(',')})`)
        .join(', ');
    return (`Token file not found: ${filePath} — 채널 "${channel}" 에 ${platform} 토큰이 없다. ` +
        `기본(평면) 토큰으로 폴백하지 않는다(오계정 게시 방지). 사용 가능 채널: ${channels || '없음'}`);
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
 * Graph 계열 공통 fetch — GET/DELETE 는 쿼리스트링, POST 는 form 본문. 실패는 구조화
 * 결과로. 토큰 값은 오류 메시지에 싣지 않는다.
 *
 * POST 파라미터를 URL 에 실으면 캡션 상한(IG 2,200자 · FB 5,000자)이 %-인코딩(한글
 * ×9배)되어 URL 이 수십 KB 가 되고, 요청 라인 길이 한계에 걸려 스키마가 허용한
 * 입력이 전송 계층에서 실패할 수 있다. 본문 전송은 Graph API 표준 방식이며
 * access_token 이 URL 에 남지 않는 부수 효과도 있다.
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
    // 미디어 유무와 무관하게 컨테이너가 FINISHED 가 될 때까지 기다린다.
    // 텍스트 컨테이너도 status 를 보고하며, 특히 **남의 글에 다는 답글**
    // (reply_to_id 가 우리 게시물이 아닌 경우)은 생성 직후 발행하면
    // code 24 / subcode 4279009 "미디어를 찾을 수 없음" 으로 실패한다
    // (2026-08-11 실측 — 실패한 컨테이너도 잠시 뒤 조회하면 FINISHED).
    // 자기 답글·일반 글은 대개 첫 조회에서 FINISHED 라 비용이 GET 1회다.
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
// ── Threads 성장 조회 (인사이트·키워드 검색 — 읽기 전용) ─────────
/**
 * 스코프 부족 에러에 재발급 안내를 얹는다 — 인사이트·검색 스코프
 * (threads_manage_insights·threads_keyword_search)는 게시용으로 발급한 기존
 * 토큰에 없을 수 있고, 그 원문만으로는 다음 행동을 알 수 없다.
 *
 * 스코프 부족이 명시적 permission 에러로만 오지 않는다 — keyword_search 는
 * 스코프·기능 미승인 시 code 1 "An unknown error occurred"(HTTP 500)로
 * 온다(2026-08-11 실측). 그 형태도 스코프 후보로 취급한다.
 */
function withScopeHint(res, scope) {
    if (res.ok)
        return res;
    const scopeLike = /permission|scope|not authorized|OAuthException/i.test(res.body) ||
        (/"code"\s*:\s*1\b/.test(res.body) && /unknown error/i.test(res.body));
    if (!scopeLike)
        return res;
    return fail(res.status, `${res.body}\n→ 이 엔드포인트는 ${scope} 스코프가 필요하다. 기존 토큰은 이 스코프 없이 발급됐을 수 있다 — ` +
        `동의 플로우에서 스코프 체크박스를 추가로 켜고 토큰을 재발급할 것 (절차: skills/publish/references/token-setup.md).`);
}
/** 게시물(media) 인사이트 지표 — views·shares 는 플랫폼이 "개발 중"으로 표시하는 값 */
const THREADS_MEDIA_METRICS = 'views,likes,replies,reposts,quotes,shares';
/**
 * Threads 성과 스냅샷 — 계정 지표(threads_insights)와 최근 루트 게시물별
 * 지표(/insights)를 한 번에 정규화해 반환한다. grow-threads 루프가 틱마다 찍어
 * 전 틱 대비 증감을 판단하는 용도라, 호출 시점 값만 반환하고 저장은
 * 호출자(data/<채널>/growth/threads/) 몫이다.
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
    // followers_count 는 since/until 미지원 — 구간 지표와 분리해 병렬 호출한다
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
            // views 는 일 단위 시계열 — 합계와 시계열을 함께 싣는다
            const daily = item.values.map((v) => ({
                date: str(v.end_time).slice(0, 10),
                value: numOrNull(v.value) ?? 0,
            }));
            userMetrics[name] = { total: daily.reduce((sum, v) => sum + v.value, 0), daily };
        }
    }
    // 최근 루트 게시물별 지표 — 게시물당 /insights 1회 왕복 (postLimit 로 상한)
    const postLimit = input.postLimit ?? 10;
    let posts = [];
    if (postLimit > 0) {
        const list = await graphRequest('get', `${THREADS_BASE}/${uid}/threads`, {
            fields: 'id,text,timestamp,permalink,is_reply',
            limit: String(postLimit * 2), // is_reply(자기 답글) 제외분 여유
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
 * Threads 공개 게시물 키워드 검색 — 채널 관심 키워드로 참여할 대화를 찾는다.
 * 쿼터는 계정당 24시간 롤링 2,200회(결과 없는 쿼리 미포함). 결과 postId 를
 * threads_publish 의 replyToId 로 넘기면 그 글에 답글로 참여한다.
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
/**
 * 계정 인사이트 — 전부 metric_type=total_value 로 구간 합계를 받는다.
 * total_value 없이 부르면 views 처럼 시계열을 지원하지 않는 지표가 **에러 없이
 * 응답에서 빠진다**(실측). 팔로워 수는 여기 넣지 않는다 — follower_count 는
 * 팔로워 100 미만 계정에서 빈 배열을 돌려주므로(실측) 콜드 스타트 채널에서
 * 무용지물이고, /me 의 followers_count 프로필 필드로 읽는다.
 */
const IG_USER_METRICS = 'reach,views,profile_views,accounts_engaged,total_interactions,likes,comments,shares,saves,profile_links_taps';
/** 미디어 공통 지표 — 계정 쪽 saves 와 달리 미디어는 saved 단수형이다(실측). */
const IG_MEDIA_METRICS = 'views,reach,likes,comments,shares,saved,total_interactions';
/**
 * 릴스에만 붙는 지표. FEED(이미지·캐러셀)에 요청하면 400 으로 응답 전체가
 * 실패하므로 media_product_type 으로 갈라 붙인다(실측).
 * reels_skip_rate 는 훅 판정의 유일한 1차 지표다 — 랭킹 모델이 "3초 미만 시청
 * 확률"을 직접 예측하는데, 이탈률을 API 로 주는 건 이 플랫폼뿐이다.
 */
const IG_REELS_METRICS = 'ig_reels_avg_watch_time,ig_reels_video_view_total_time,reels_skip_rate';
/**
 * FEED(이미지·캐러셀)에만 붙는 지표 — 위 릴스 함정의 대칭이다. 릴스에 요청하면
 * `does not support the follows, profile_visits metric` 400 이 나면서 **응답
 * 전체가 실패해** 릴스 지표가 통째로 비어 온다(실측). 공통 지표에 섞지 않는다.
 */
const IG_FEED_METRICS = 'follows,profile_visits';
/**
 * Instagram 성과 스냅샷 — 계정 구간 지표와 최근 미디어별 지표를 한 번에
 * 정규화해 반환한다. grow-instagram 루프가 틱마다 찍어 전 틱 대비 증감을
 * 판단하는 용도라, 호출 시점 값만 반환하고 저장은 호출자
 * (data/<채널>/growth/instagram/) 몫이다.
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
    // 최근 미디어별 지표 — 미디어당 /insights 1회 왕복 (mediaLimit 로 상한)
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
            // 표면 전용 지표는 서로 배타적이다 — 반대쪽에 요청하면 400 으로 응답 전체가
            // 날아가므로, 아는 두 표면만 붙이고 그 밖(STORY 등)은 공통 지표만 요청한다.
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
    // 자막은 영상 게시에서만 의미가 있다 — 이미지·텍스트 게시에 붙이면 조용히 버려지므로 막는다
    if (input.captionFilePath && !input.videoUrl) {
        return fail(400, 'captionFilePath requires videoUrl (captions attach to a video, not to photos or text posts)');
    }
    const captionLocale = input.captionLocale ?? 'ko_KR';
    if (input.captionFilePath && !/^[a-z]{2}_[A-Z]{2}$/.test(captionLocale)) {
        return fail(400, `captionLocale must look like ko_KR / en_US / vi_VN: ${captionLocale}`);
    }
    let captionBytes;
    if (input.captionFilePath) {
        // 게시 전에 검증한다 — 200K 초과나 경로 오타를 게시 뒤에 발견하면 되돌릴 수 없다
        const caption = await readCaptionFile(input.captionFilePath, CAPTION_MAX_BYTES_FB);
        if (!caption.bytes)
            return caption.error;
        captionBytes = caption.bytes;
    }
    const { token, error } = await loadTokenFile('FACEBOOK', input.channel);
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
    // 영상 게시의 postId 는 곧 video_id 라 captions 엣지에 그대로 넘어간다.
    // 실패해도 게시는 유효하므로 경고로만 보고한다(재게시 금지 — 게시 API 는 비멱등).
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
/** 페이지 명의로 자기 게시물에 댓글 작성 — "원문 링크는 첫 댓글로" 플랫폼 규칙용 (scope: pages_manage_engagement). */
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
async function loadYoutubeClient(channel) {
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
/**
 * 자막 파일 상한 — YouTube 는 captions.insert 문서의 100MB, Facebook 은 captions
 * 엣지 문서의 200K 다. 쇼트폼 SRT 는 수 KB 라 실질 제약은 아니지만, 잘못된 파일을
 * 게시 뒤에 발견하는 것보다 호출 전에 막는 편이 낫다(게시 API 는 비멱등).
 */
const CAPTION_MAX_BYTES_YT = 100 * 1024 * 1024;
const CAPTION_MAX_BYTES_FB = 200 * 1024;
/**
 * 게시용 자막 파일(.srt)을 읽어 검증한다. 이 파이프라인은 자막을 영상에 태우지 않고
 * 따로 올리는 것이 원칙이라(플랫폼이 자막 파일을 받는 경우) 게시 툴이 이 경로를 탄다.
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
 * captions.insert — 메타데이터(JSON)와 SRT 바이트를 multipart/related 한 요청에 싣는다
 * (`uploadType=multipart`). 두 가지가 videos.insert 와 다르다: 스코프가
 * **youtube.force-ssl** 이고(게시용 youtube.upload 로는 거부된다) 쿼터가 **400유닛**이다.
 * 영상 업로드가 이미 성공한 뒤에 호출되므로 실패는 전체 실패로 만들지 않고 경고로 돌려준다
 * — 재업로드는 비멱등이고 쿼터만 태운다.
 */
async function uploadYoutubeCaption(token, videoId, caption) {
    const boundary = `sfcap${randomUUID().replace(/-/g, '')}`;
    // name 은 트랙 표시명 — 빈 문자열이 기본 트랙이다(플레이어에 언어명만 뜬다)
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
                ? ' → 이 호출은 youtube.force-ssl 스코프가 필요하다(게시용 youtube.upload 로는 안 된다).' +
                    ' 영상 업로드는 이미 성공했으므로 스코프를 추가해 토큰을 재발급한 뒤 자막만 수동으로 올리면 된다' +
                    ' (절차: skills/publish/references/token-setup.md).'
                : ''));
    }
    catch (error) {
        return `captions.insert failed: ${error instanceof Error ? error.message : String(error)}`;
    }
}
/**
 * POST /{video_id}/captions — SRT 를 multipart/form-data 로 첨부한다. **파일명이 계약**이라
 * `<이름>.<locale>.srt` 형식이 아니면 error 386 으로 거부된다(locale 은 `ko_KR` 꼴).
 * 영상 게시(`/{pageId}/videos`)의 응답 id 가 곧 video_id 라 그대로 넘길 수 있다.
 * 다만 FB 는 file_url 영상을 비동기로 처리하므로, 게시 직후 호출이 처리 중 상태에 걸리면
 * 실패할 수 있다 — 그때도 게시는 유효하니 경고로만 보고하고 자막만 다시 올리면 된다.
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
 * YouTube resumable 업로드 — 청크 PUT + 재개
 *
 * 오늘 코드도 `uploadType=resumable` 로 세션을 연다. 없는 것은 프로토콜이 아니라
 * **재개 사용**이다 — 단일 PUT 으로 전체를 밀어 넣고 600초 타임아웃을 건다.
 * 8분 이상 롱폼(수백 MB)에서 그 한 번의 PUT 이 끊기면 처음부터 다시 올린다.
 *
 * 크기 임계 분기를 만들지 않는다. 근거 셋 —
 *   ① 위험한 경로는 드물게 도는 경로다. 쇼트폼이 매일 밟으면 회귀가 롱폼 파일럿이
 *      아니라 그날 쇼트폼 게시에서 드러난다.
 *   ② 두 경로는 곧 두 벌의 재시도·중복방지 규칙이고 단일 PUT 쪽은 둘 다 못 갖는다.
 *   ③ 청크 3~7회의 추가 왕복이 keep-alive 에서 회당 100~300ms, 합쳐 2초 안쪽이다.
 * ──────────────────────────────────────────────────────────────────────────── */
/** 프로토콜이 마지막 청크를 뺀 모든 청크에 256KiB 배수를 요구한다. */
const YT_CHUNK_MIN = 256 * 1024;
/** 재개 세션의 수명. 유튜브는 7일을 주지만 우리는 24시간만 믿는다(아래 주석). */
const YT_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
function ytChunkSize() {
    const mb = Number(process.env.SOCIAL_FLOW_YT_CHUNK_MB ?? 8);
    const raw = Math.floor((Number.isFinite(mb) && mb > 0 ? mb : 8) * 1024 * 1024);
    return Math.max(YT_CHUNK_MIN, raw - (raw % YT_CHUNK_MIN));
}
/**
 * Range 헤더에서 서버가 받은 다음 오프셋을 뽑는다.
 *
 * 308 응답의 `Range: bytes=0-8388607` 은 **받은 마지막 바이트**이므로 다음 오프셋은
 * +1 이다. 헤더가 아예 없으면 서버가 0바이트를 받은 것이다 — 이 두 경우를 뭉뚱그리면
 * 첫 청크를 건너뛰거나 한 바이트를 겹쳐 보낸다.
 */
function parseResumeOffset(range) {
    if (!range)
        return 0;
    const m = /bytes=0-(\d+)/.exec(range);
    return m ? Number(m[1]) + 1 : 0;
}
function sessionStateFile(filePath) {
    // 상태는 토큰과 같은 디렉토리 아래 둔다 — 사용자 소유이고 이미 gitignore 밖이다.
    const key = createHash('sha256').update(filePath).digest('hex').slice(0, 16);
    return join(snsTokenDir, '.yt-upload', `${key}.json`);
}
/**
 * 상태 저장은 **최선 노력**이다. 디렉토리가 없거나 쓰기가 막히면 조용히 건너뛰고
 * 오늘과 같은 무재개 동작으로 내려간다 — 상태 저장 실패가 게시 실패가 되면 안 된다.
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
        /* 저장 못 해도 업로드는 계속한다 */
    }
}
/**
 * 세션 URL 로 파일을 청크 PUT 한다. 308 이면 서버가 말한 오프셋에서 이어 간다.
 *
 * `bytes` 를 인자로 안 받는 것이 핵심이다 — 파일 핸들 하나와 청크 버퍼 하나만 쓴다.
 * 호출부가 `readFile` 로 전체를 힙에 올려 두면 청크로 바꿔도 피크가 "파일 크기 +
 * 청크" 그대로다(512MB 파일이면 약 560MB).
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
                // 전송 실패 — 서버가 어디까지 받았는지 물어보고 이어 간다. 바이트는 도달했는데
                // 응답만 끊긴 경우가 있어서 오프셋을 우리가 추정하면 안 된다.
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
        // 루프가 끝났는데 최종 응답을 못 받았다 — 상태를 물어본다.
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
 * 빈 PUT 으로 서버가 받은 오프셋을 묻는다. `Content-Range: bytes * /TOTAL`.
 *
 * **완료 상태를 반드시 구분한다.** 마지막 청크는 도달했는데 응답만 유실된 경우
 * 서버가 200/201 + 영상 JSON 을 돌려준다. 이걸 못 알아보면 같은 파일을 통째로
 * 다시 올려 중복 영상이 생긴다.
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
        // 404/410 = 세션이 죽었다. 재개 불가이므로 즉시 중단한다(재업로드는 호출부 판단).
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
    // 크기와 mtime 만 읽는다 — 바이트는 uploadResumable 안에서 청크로만 읽는다.
    // readFile 로 전체를 힙에 올리면 청크 PUT 으로 바꿔도 피크가 "파일 크기 + 청크"라
    // 512MB 파일에 약 560MB 다. stat 은 오늘의 400 조기 검증도 그대로 지킨다.
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
    // 썸네일은 업로드 전에 검증 — 업로드 후에 거부하면 이미 소모된 업로드 쿼터와
    // 전송 시간(수십 MB)이 통째로 낭비된다
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
    // 자막도 업로드 **전에** 읽어 검증한다 — 경로 오타를 게시 뒤에 발견하면 되돌릴 수 없다
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
    // 살아 있는 재개 세션이 있으면 그것을 쓴다. 키가 (경로, 크기, mtime) 이라
    // 재빌드로 파일이 바뀌면 자동으로 새 세션을 연다 — 옛 세션에 새 바이트를 이어
    // 붙이는 사고를 막는다.
    const prior = readState(input.videoFilePath);
    const reusable = prior && prior.size === videoSize && prior.mtimeMs === videoMtimeMs ? prior : null;
    // resumable 세션 개시 → Location 에 청크 PUT (콘솔 어댑터와 동일 계약)
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
                    // 프로토콜이 요구하는 두 줄 — 없으면 서버가 청크 재개를 지원하지 않는다.
                    'X-Upload-Content-Length': String(videoSize),
                    'X-Upload-Content-Type': mimeType,
                },
                body: JSON.stringify({
                    snippet: {
                        title: input.title,
                        description: input.description,
                        // 22 = People & Blogs. 카테고리는 추천·탐색 분류에 쓰이므로 일반 콘텐츠
                        // 채널의 영상을 25(News & Politics)로 올리면 엉뚱한 관심사 집단에 노출된다.
                        categoryId: input.categoryId ?? '22',
                    },
                    status: {
                        privacyStatus: input.privacyStatus ?? 'public',
                        // COPPA 자기 선언 — 하드코딩하면 아동 대상 콘텐츠가 허위 선언되므로 입력으로 받는다
                        selfDeclaredMadeForKids: input.madeForKids ?? false,
                        // 합성 미디어 고지 — 이 파이프라인의 영상·음악은 생성형이므로 기본 true
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
        // 재사용 세션이면 서버가 어디까지 받았는지 먼저 묻는다. 우리가 기억한 오프셋을
        // 믿으면 안 된다 — 바이트는 도달했는데 응답만 끊긴 경우가 있다.
        let startOffset = 0;
        if (reusable) {
            const sync = await queryResumeOffset(location, videoSize, mimeType);
            if (sync.done) {
                // 마지막 청크가 이미 도달해 있었다. 재업로드하면 중복 영상이 생긴다.
                const doneId = String(parseJson(sync.body)?.id ?? '');
                if (doneId) {
                    writeState(input.videoFilePath, null);
                    return okJson({
                        platform: 'YOUTUBE',
                        videoId: doneId,
                        permalink: `https://www.youtube.com/watch?v=${doneId}`,
                        fileName: basename(input.videoFilePath),
                        resumed: true,
                        note: `이 파일은 ${new Date(sessionStartedAt).toISOString()} 에 시작한 업로드로 이미 올라가 있다. 재업로드하지 않았다.`,
                    });
                }
            }
            if (sync.offset === null) {
                // 세션이 죽었다(404/410). 상태를 지우고 새 세션으로 다시 부르게 한다.
                writeState(input.videoFilePath, null);
                return fail(502, `YouTube resumable session expired — 같은 인자로 다시 호출하면 새 세션으로 올린다`);
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
        // 업로드가 끝났으니 재개 상태를 지운다 — 남겨 두면 같은 파일 재게시가
        // "이미 올라가 있다"로 옛 videoId 를 돌려준다.
        writeState(input.videoFilePath, null);
        // 썸네일 실패는 경고로만 — 업로드는 이미 성공했고 재게시는 비멱등·쿼터 소모라 전체 실패로 만들지 않는다
        const thumbnailWarning = thumb ? await setYoutubeThumbnail(token, videoId, thumb) : undefined;
        // 자막도 같은 규칙 — 실패해도 게시는 성공이다(경고로 보고하고 자막만 다시 올린다)
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
 * YouTube API 호출 — 액세스 토큰은 **헤더로만** 싣는다. 쿼리스트링에 넣으면
 * 에러 본문·로그에 토큰이 그대로 실린다.
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
 * 구글 OAuth 의 스코프 부족은 403 `insufficientPermissions` 또는 401 로 온다 —
 * Meta 형식(withScopeHint)과 본문이 달라 별도 판정이 필요하다. 이 플러그인의
 * 기존 YouTube 토큰은 `youtube.upload` 단일 스코프로 발급됐을 가능성이 높아,
 * 새 스코프를 요구하는 툴은 첫 호출에서 반드시 이 안내를 만난다.
 */
function withYoutubeScopeHint(res, scope) {
    if (res.ok)
        return res;
    const scopeLike = res.status === 401 ||
        res.status === 403 ||
        /insufficient|scope|forbidden|unauthorized/i.test(res.body);
    if (!scopeLike)
        return res;
    return fail(res.status, `${res.body}\n→ 이 엔드포인트는 ${scope} 스코프가 필요하다. 게시(youtube.upload)만으로 발급한 기존 ` +
        `refresh_token 에는 없다 — 동의 플로우에서 스코프를 추가로 켜고 재발급할 것 ` +
        `(절차: skills/publish/references/token-setup.md). 재발급 후 youtube-oauth-client.json 의 refresh_token 을 교체한다.`);
}
/** 채널 단위 Analytics 지표 — engagedViews 는 "초반을 넘겨 본" 조회로, 2025-03 이후 views 와 분리됐다. */
const YT_CHANNEL_METRICS = 'views,engagedViews,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained,subscribersLost,likes,comments,shares';
/** 영상 단위 — 영상별 리포트는 지원 지표가 더 좁다(구독 증감은 채널 리포트에만 안정적). */
const YT_VIDEO_METRICS = 'views,engagedViews,averageViewDuration,averageViewPercentage,likes,comments,shares';
const ytDate = (ms) => new Date(ms).toISOString().slice(0, 10);
/**
 * 게시된 영상의 공개 범위·메타데이터를 고친다 (`videos.update`).
 *
 * 롱폼이 이 툴을 요구하는 이유는 2단 게시다 — 8~15분 영상을 `private` 로 올려
 * watch 페이지에서 사람이 확인한 뒤 공개로 돌린다. 쇼트폼처럼 바로 공개하면
 * 인코딩 실패·자막 어긋남을 시청자가 먼저 본다.
 *
 * **`videos.update` 는 덮어쓰기다 — 부분 갱신이 아니다.** `part` 에 넣은 리소스의
 * 필드를 통째로 교체하므로, `snippet` 을 보내면서 `title` 을 빼면 제목이 지워진다.
 * 그래서 이 함수는 **먼저 `videos.list` 로 현재 값을 읽어 병합한다.** 이 한 단계가
 * 없으면 "공개로만 바꾸려다 제목과 설명을 날리는" 사고가 난다.
 *
 * `status.selfDeclaredMadeForKids` 도 같은 함정이다. 빼고 보내면 기본값으로 되돌아가
 * COPPA 선언이 조용히 뒤집힌다 — 그래서 읽어 온 값을 그대로 다시 싣는다.
 */
export async function youtubeUpdate(input) {
    const { client, error: clientError } = await loadYoutubeClient(input.channel);
    if (!client)
        return clientError;
    const { token, error: tokenError } = await exchangeYoutubeAccessToken(client);
    if (!token)
        return tokenError;
    // ── 1) 현재 값을 읽는다. 병합의 기준선이다.
    const cur = await youtubeRequest('get', `${YT_DATA_BASE}/videos`, { part: 'snippet,status', id: input.videoId }, token);
    if (!cur.ok)
        return withYoutubeScopeHint(cur, 'https://www.googleapis.com/auth/youtube');
    const items = parseJson(cur.body)?.items;
    if (!Array.isArray(items) || items.length === 0) {
        return fail(404, `영상을 못 찾았다: ${input.videoId} (다른 채널의 영상이거나 삭제됐다)`);
    }
    const snippet = (items[0]?.snippet ?? {});
    const status = (items[0]?.status ?? {});
    // ── 2) 병합. 인자로 안 준 필드는 읽어 온 값을 그대로 다시 싣는다.
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
    // publishAt 은 privacyStatus 가 private 일 때만 유효하다 — 아니면 API 가 조용히 무시한다.
    if (input.publishAt && nextStatus.privacyStatus !== 'private') {
        return fail(400, 'publishAt 은 privacyStatus 가 private 일 때만 예약이 걸린다. 공개 예약이면 privacyStatus: "private" 을 함께 준다.');
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
    // ── 3) 덮어쓴다.
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
    // Analytics 데이터는 2~3일 지연이 정상이다 — endDate 를 오늘로 두면 최근 구간이 0 으로 보인다
    const startDate = ytDate(now - days * 86_400_000);
    const endDate = ytDate(now);
    const mine = await youtubeRequest('get', `${YT_DATA_BASE}/channels`, { part: 'id,snippet,statistics,contentDetails', mine: 'true' }, token);
    if (!mine.ok)
        return withYoutubeScopeHint(mine, 'youtube.readonly (또는 youtube)');
    const channelItem = parseJson(mine.body)?.items?.[0];
    if (!channelItem)
        return fail(502, `YouTube channels.list returned no channel: ${mine.body}`);
    const stats = channelItem.statistics ?? {};
    const uploadsPlaylist = str(channelItem.contentDetails?.relatedPlaylists?.uploads);
    const analytics = await youtubeRequest('get', `${YT_ANALYTICS_BASE}/reports`, { ids: 'channel==MINE', startDate, endDate, metrics: YT_CHANNEL_METRICS }, token);
    if (!analytics.ok)
        return withYoutubeScopeHint(analytics, 'yt-analytics.readonly');
    const channelMetrics = ytReportRow(analytics.body);
    // 수익은 스코프가 하나 더 필요하다 — 실패해도 나머지 지표를 죽이지 않는다
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
    // 영상 조회가 실패해도 채널 지표는 살린다 — 다만 빈 배열을 "업로드가 없다"로
    // 오해하지 않도록 사유를 함께 싣는다
    const videoErrors = [];
    if (videoLimit > 0 && !uploadsPlaylist)
        videoErrors.push('채널에 uploads 플레이리스트가 없다');
    if (videoLimit > 0 && uploadsPlaylist) {
        const list = await youtubeRequest('get', `${YT_DATA_BASE}/playlistItems`, { part: 'snippet,contentDetails', playlistId: uploadsPlaylist, maxResults: String(videoLimit) }, token);
        if (!list.ok)
            videoErrors.push(`playlistItems HTTP ${list.status}: ${list.body.slice(0, 200)}`);
        if (list.ok) {
            const items = parseJson(list.body)?.items ?? [];
            const ids = items.map((item) => str(item.contentDetails?.videoId)).filter(Boolean);
            // 영상별 Analytics 는 filters=video==a,b,c 로 한 번에 받는다 — 영상마다 왕복하면 쿼터가 배로 든다
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
                videoErrors.push(`videos.list HTTP ${detail.status}: ${detail.body.slice(0, 200)} (lifetime 이 0 으로 보인다)`);
            if (!perVideo.ok)
                videoErrors.push(`영상별 Analytics HTTP ${perVideo.status}: ${perVideo.body.slice(0, 200)} (period 가 null 이다)`);
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
                    // ISO8601 기간에서 초를 뽑아 Shorts(3분 이하 세로) 여부 판단에 쓴다
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
            // 채널이 구독자 수를 비공개로 두면 API 가 반올림 값을 준다 — 증감 판단이 무의미해진다
            subscriberCountHidden: stats.hiddenSubscriberCount === true,
        },
        period: { startDate, endDate, days },
        metrics: channelMetrics,
        ...(revenue ? { revenue } : {}),
        ...(revenueError ? { revenueError } : {}),
        videos,
        ...(videoErrors.length ? { videosError: videoErrors.join(' · ') } : {}),
        note: '스와이프 이탈률("How many chose to view")은 Analytics API 가 제공하지 않는다 — 훅 판정은 averageViewPercentage 로 하고, 스와이프 지표는 YouTube Studio 에서 확인할 것.',
    });
}
/** Analytics 응답의 단일 행을 {메트릭명: 값} 으로 — rows 가 비면 0 이 아니라 빈 객체다(데이터 지연과 진짜 0 을 구분). */
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
/** dimensions 가 붙은 Analytics 응답 — 첫 열(차원 값)을 키로 나머지 메트릭을 묶는다. */
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
/** ISO8601 duration(PT1M30S) → 초. 파싱 실패는 null 이다(0 으로 만들면 Shorts 로 오판한다). */
function ytDurationSeconds(duration) {
    const match = /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(duration);
    if (!match)
        return null;
    const [, d, h, m, s] = match;
    return Number(d ?? 0) * 86_400 + Number(h ?? 0) * 3_600 + Number(m ?? 0) * 60 + Number(s ?? 0);
}
// ── 댓글 인박스 · 답글 · 모더레이션 ──────────────────────────────
/**
 * 받은 댓글 관리 경로. 읽기(인박스)는 부작용이 없지만 **답글·모더레이션은 게시와
 * 똑같이 호출 즉시 외부 공개**다 — 툴 설명의 HITL 규칙이 유일한 게이트다.
 *
 * 플랫폼 능력이 비대칭이다 (2026-07-26 토큰 실측):
 *   THREADS   읽기 `/conversation`(깊이 무관 평면화) · 답글 `reply_to_id` · 숨김 `manage_reply` · 좋아요 API 없음
 *   INSTAGRAM 읽기 `/comments{replies}` · 답글 `/{comment}/replies`(최상위 댓글에만) · 숨김 `hide` · 좋아요 API 없음
 *   FACEBOOK  읽기 `/comments?filter=stream` · 답글 `/{comment}/comments` · 숨김 `is_hidden` · 좋아요 O
 *   YOUTUBE   읽기 `commentThreads.list`(영상별) · 답글 `comments.insert` · 숨김·좋아요 미지원(범위 밖)
 *
 * "우리가 이미 답했는가"는 플랫폼 필드로 판정한다(THREADS `is_reply_owned_by_me`,
 * IG username 일치, FB `from.id == pageId`, YT `authorChannelId == 내 채널 id`) —
 * 추측하지 않으므로 중복 답글이 나가지 않는다.
 *
 * YouTube 만 답글 대상이 다르다: `comments.insert` 의 parentId 는 **최상위 댓글**만
 * 받는다(대댓글에 직접 답글을 달 수 없다). 이 비대칭은 replyToComment 가 흡수한다.
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
    // is_reply 인 항목은 우리 자기 답글 — 게시물이 아니라 답글이므로 인박스 루트가 아니다
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
                likeCount: null, // Threads 답글에는 공개 좋아요 수 필드가 없다
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
 * YouTube 댓글 인박스 — 최근 업로드를 훑어 영상별 댓글 스레드를 정규화한다.
 *
 * "이미 답했는가"는 스레드 안 **우리 마지막 답글 시각**으로 판정한다: 그보다 먼저
 * 달린 댓글은 응대 완료, 뒤에 달린 댓글은 미응대다. 스레드 단위로 뭉뚱그리면
 * 우리 답글 뒤에 붙은 새 댓글을 놓치고, 댓글 단위로만 보면 이미 답한 스레드에
 * 또 답한다.
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
        return { error: withYoutubeScopeHint(mine, 'youtube.readonly (또는 youtube)') };
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
            // 댓글 사용 중지된 영상은 403 — 영상 하나의 실패가 인박스를 죽이지 않는다
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
            // replies part 는 최대 5건만 준다 — 잘렸으면 전체를 다시 받는다.
            // 우리 답글이 잘려 안 보이면 미응대로 오판해 **중복 답글**이 나간다.
            const totalReplies = Number(threadSnippet.totalReplyCount ?? 0);
            let replies = thread.replies?.comments ?? [];
            let repliesIncomplete = false;
            if (totalReplies > replies.length) {
                const full = await youtubeRequest('get', `${YT_DATA_BASE}/comments`, { part: 'snippet', parentId: topId, maxResults: '100', textFormat: 'plainText' }, token);
                if (full.ok) {
                    replies = parseJson(full.body)?.items ?? [];
                    // 100건을 넘는 스레드는 여전히 잘린다 — 판정 근거가 불완전하다
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
            // 우리 마지막 답글 시각 — 이 뒤에 달린 댓글만 미응대다
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
                    // 답글 목록이 불완전하면 "아직 안 답했다"를 주장할 근거가 없다 — 우리 답글이
                    // 잘려 안 보이는 것일 수 있으므로 응대됨으로 처리해 기본 필터에서 뺀다.
                    // 놓친 댓글은 다음 틱에 잡히지만, 반대로 틀리면 중복 답글이 공개로 나간다.
                    answeredByUs: repliesIncomplete || (myLastReplyMs > 0 && publishedMs(comment) <= myLastReplyMs),
                    text: str(commentSnippet.textOriginal || commentSnippet.textDisplay),
                    timestamp,
                    ageMinutes: minutesSince(timestamp, now),
                    likeCount: numOrNull(commentSnippet.likeCount),
                    // 숨김 댓글은 API 응답에 아예 오지 않는다 — 공개된 것만 보인다
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
 * 플랫폼 횡단 댓글 인박스 — 최근 게시물의 댓글을 정규화해 모으고, 기본값으로
 * **우리가 아직 답하지 않은 남의 댓글만** 싣는다. 플랫폼 하나가 실패해도 나머지는
 * 그대로 반환하고 실패 사유를 skipped 에 싣는다(부분 실패가 전체를 막지 않는다).
 */
export async function commentInbox(input = {}) {
    const now = Date.now();
    const limits = {
        postLimit: Math.min(Math.max(input.postLimit ?? 5, 1), 25),
        commentLimit: Math.min(Math.max(input.commentLimit ?? 50, 1), 100),
    };
    // 가용성은 채널 스코프로 판정한다 — 채널 지정 시 그 채널 디렉토리의 토큰만 본다
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
    // 플랫폼별 수집은 서로 다른 API 라 병렬로 돌린다 — 최대 75회(25게시물×3)의 직렬
    // 왕복을 플랫폼 단위로 겹쳐 체감 지연을 1/3 로 줄인다. 결과 순서는 requested 유지.
    const collected = await Promise.all(requested.map(async (platform) => ({
        platform,
        inbox: available.has(platform) ? await collectors[platform](limits, now, input.channel) : null,
    })));
    for (const { platform, inbox } of collected) {
        if (!inbox) {
            skipped.push({ platform, reason: `자격증명 파일 없음 (${snsCredentialFile(platform, input.channel)})` });
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
    // 상한(25 게시물 × 100 댓글)을 다 채우면 응답이 호출자 컨텍스트를 크게 잠식한다.
    // 잘라야 할 때는 **오래된 것부터** 버린다 — 골든타임(첫 60분) 댓글이 남아야 한다.
    // summary 의 집계는 자르기 **전** 값을 유지한다: 잘린 목록으로 다시 세면
    // "미응대 3건"처럼 실제보다 적게 보고되어 남은 응대를 놓친다.
    const { posts: trimmedPosts, dropped } = capInboxPayload(filtered);
    return okJson({
        channel: input.channel ?? null,
        accounts,
        summary: {
            postsScanned: posts.length,
            commentsFetched: fetched,
            actionable: actionable.length,
            byPlatform,
            // 골든타임(첫 60분) 안에 남은 미응대 — 우선순위 판단의 1순위 신호
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
                    truncated: `응답 크기 상한으로 오래된 댓글 ${dropped}건을 목록에서 제외했다(위 집계는 제외 전 기준). 전부 보려면 sinceHours 로 기간을 좁히거나 commentLimit/postLimit 을 줄여 재조회할 것.`,
                }
                : {}),
        },
        posts: trimmedPosts,
        skipped,
    });
}
/** 인박스 응답 직렬화 상한 — 초과분은 오래된 댓글부터 버린다. */
const INBOX_MAX_CHARS = 60_000;
function capInboxPayload(posts) {
    if (JSON.stringify(posts).length <= INBOX_MAX_CHARS)
        return { posts, dropped: 0 };
    // 전 게시물의 댓글을 한 줄로 세워 최신순 정렬 → 상한에 들어가는 만큼만 싣는다.
    // ageMinutes 가 없는(타임스탬프 미제공) 댓글은 판단 근거가 없으므로 뒤로 보낸다.
    const ranked = posts
        .flatMap((post) => post.comments)
        .sort((a, b) => (a.ageMinutes ?? Number.MAX_SAFE_INTEGER) - (b.ageMinutes ?? Number.MAX_SAFE_INTEGER));
    // 직렬화 크기는 유지 수에 단조 증가하므로 이분 탐색으로 "상한에 들어가는 최대
    // 유지 수"를 찾는다 — 절반씩 버리는 방식은 필요 이상(최대 2배)을 버렸다.
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
/** 받은 댓글에 답글 작성 — 호출 즉시 공개. 플랫폼별 답글 엔드포인트 차이를 흡수한다. */
export async function replyToComment(input) {
    if (input.platform === 'THREADS') {
        // Threads 답글은 별도 엔드포인트가 없다 — reply_to_id 를 단 새 게시물이 곧 답글이다
        return publishThreads({ caption: input.message, replyToId: input.commentId, channel: input.channel });
    }
    if (input.platform === 'FACEBOOK') {
        // FB 는 댓글 id 에 댓글을 달면 대댓글 — 게시물 첫 댓글과 같은 엔드포인트다
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
 * YouTube 답글 — `comments.insert` 의 parentId 는 **최상위 댓글만** 받는다.
 * 대댓글 id 를 그대로 넘기면 실패하므로, 먼저 그 댓글의 부모를 조회해 스레드
 * 루트로 바꿔 단다. 인박스가 대댓글도 응대 대상으로 내놓기 때문에 필요한 단계다.
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
        // 대댓글 id 로 요청이 오면 실제 부모가 달라진다 — 어디에 붙었는지 알린다
        parentCommentId: parentId,
        permalink: null,
    });
}
/**
 * 댓글 숨김/해제와 FB 댓글 좋아요. **삭제는 의도적으로 제공하지 않는다** —
 * 숨김은 되돌릴 수 있고 작성자에게는 계속 보이지만 삭제는 비가역이라,
 * 스팸·어뷰징 대응에는 숨김이 브랜드 리스크가 더 낮다 (2026-07-26 사용자 확정).
 */
export async function moderateComment(input) {
    const { platform, commentId, action, channel } = input;
    const hide = action === 'hide';
    if (action === 'like' || action === 'unlike') {
        if (platform !== 'FACEBOOK') {
            return fail(400, `${platform} 는 댓글 좋아요 API 가 없다 — 답글(sns_comment_reply)로만 반응할 수 있다.`);
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
        // YouTube 의 숨김은 `setModerationStatus`(rejected/heldForReview)로 의미가 다르고,
        // 이 툴이 약속한 "되돌릴 수 있는 숨김"과 어긋난다 — 잘못 매핑하느니 거부한다
        return fail(400, 'YouTube 댓글 숨김은 이 툴이 지원하지 않는다 — 의미가 다른 검토 보류/거부(setModerationStatus)뿐이라 ' +
            '되돌릴 수 있는 숨김으로 매핑할 수 없다. YouTube Studio > 댓글에서 처리할 것.');
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
// ── 계정 점검 ────────────────────────────────────────────────────
/**
 * 한 자격증명 세트(채널 하나 또는 기본 토큰)의 4개 플랫폼 점검 — 토큰 값은 절대
 * 싣지 않는다. 플랫폼 점검은 서로 독립이라 병렬로 돌린다(4회 직렬 왕복 → 1회 체감).
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
 * SNS 게시 자격증명 일괄 점검 — channel 지정 시 그 채널 세트만, 미지정 시
 * 모든 채널 디렉토리 + 기본(평면) 토큰을 함께 점검한다. 계정 식별 정보만 반환.
 */
export async function checkAccounts(channel) {
    if (channel) {
        const body = { channel, platforms: await checkPlatformSet(channel) };
        return { ok: true, status: 200, body: JSON.stringify(body, null, 2) };
    }
    const channelEntries = await Promise.all(listChannelDirs().map(async (dir) => [dir.channel, await checkPlatformSet(dir.channel)]));
    const channels = Object.fromEntries(channelEntries);
    // 기본(평면) 토큰은 존재할 때만 점검한다 — 채널 디렉토리로 전부 이전한 구성에서
    // 전부-실패 노이즈를 만들지 않기 위해서다.
    const hasDefaults = availablePlatformsFor().length > 0;
    const body = {
        channels,
        defaultTokens: hasDefaults
            ? await checkPlatformSet()
            : '없음 — 채널 미지정(channel 인자 생략) 게시는 불가하다. 게시 툴에 channel 을 지정할 것.',
    };
    // 점검이 완료되면 그 자체로 성공이다 — 플랫폼 구성은 선택적이므로 미설정 플랫폼의
    // ok:false 는 body 상세로만 보고하고 툴 결과 전체를 실패로 표시하지 않는다.
    return { ok: true, status: 200, body: JSON.stringify(body, null, 2) };
}
