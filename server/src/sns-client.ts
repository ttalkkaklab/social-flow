import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';

import { SNS_PLATFORMS, listChannelDirs, snsCredentialFile, type SnsPlatform } from './config.js';
import type { ApiResult } from './http.js';

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
export function enabledPlatforms(): SnsPlatform[] {
  const channelDirs = listChannelDirs();
  return SNS_PLATFORMS.filter(
    (platform) =>
      existsSync(snsCredentialFile(platform)) || channelDirs.some((dir) => dir.platforms.includes(platform)),
  );
}

/** 해당 채널(미지정 시 기본 토큰) 기준으로 자격증명 파일이 존재하는 플랫폼. */
function availablePlatformsFor(channel?: string): SnsPlatform[] {
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

/** 컨테이너 처리 대기 폴링 기본값 — 테스트는 opts 로 축소한다. */
export interface PollOpts {
  pollIntervalMs?: number;
  pollMaxTries?: number;
}
const DEFAULT_POLL_INTERVAL_MS = 2_000;
const DEFAULT_POLL_MAX_TRIES = 60; // 릴스 영상 처리 여유 (2s × 60 = 2분)

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function fail(status: number, message: string): ApiResult {
  return { ok: false, status, body: message };
}

function parseJson(body: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(body) as unknown;
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** 토큰 부재 안내 — 채널 지정 시 폴백하지 않는 이유와 사용 가능 채널 목록을 함께 싣는다. */
function missingTokenMessage(platform: SnsPlatform, channel: string | undefined, filePath: string): string {
  if (!channel) {
    return (
      `Token file not found: ${filePath} — ${platform} 게시에는 로컬 토큰이 필요하다 ` +
      `(채널별 토큰은 channel 인자 + <SNS_TOKEN_DIR>/<slug>/ 디렉토리, 위치 변경은 SNS_TOKEN_DIR env).`
    );
  }
  const channels = listChannelDirs()
    .map((dir) => `${dir.channel}(${dir.platforms.join(',')})`)
    .join(', ');
  return (
    `Token file not found: ${filePath} — 채널 "${channel}" 에 ${platform} 토큰이 없다. ` +
    `기본(평면) 토큰으로 폴백하지 않는다(오계정 게시 방지). 사용 가능 채널: ${channels || '없음'}`
  );
}

async function loadTokenFile(platform: SnsPlatform, channel?: string): Promise<{ token?: string; error?: ApiResult }> {
  const filePath = snsCredentialFile(platform, channel);
  try {
    const token = (await readFile(filePath, 'utf8')).trim();
    if (!token) return { error: fail(400, `Token file is empty: ${filePath}`) };
    return { token };
  } catch {
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
async function graphRequest(
  method: 'get' | 'post' | 'delete',
  baseUrl: string,
  params: Record<string, string | undefined>,
  timeoutMs = 30_000,
): Promise<ApiResult> {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') sp.set(key, value);
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
  } catch (error) {
    const redacted = baseUrl; // 토큰이 실린 전체 URL 은 노출 금지
    if (error instanceof Error && error.name === 'TimeoutError') {
      return fail(504, `Request timed out after ${timeoutMs}ms: ${redacted}`);
    }
    return fail(502, `Upstream unreachable (${redacted}): ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** 컨테이너 상태 폴링 — statusField 가 FINISHED 가 될 때까지. ERROR/EXPIRED 는 즉시 실패. */
async function pollContainer(
  baseUrl: string,
  containerId: string,
  accessToken: string,
  statusField: 'status' | 'status_code',
  opts?: PollOpts,
): Promise<ApiResult | null> {
  const interval = opts?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const maxTries = opts?.pollMaxTries ?? DEFAULT_POLL_MAX_TRIES;
  for (let attempt = 0; attempt < maxTries; attempt++) {
    const res = await graphRequest('get', `${baseUrl}/${containerId}`, {
      fields: statusField,
      access_token: accessToken,
    });
    if (!res.ok) return res;
    const status = String(parseJson(res.body)?.[statusField] ?? '');
    if (status === 'FINISHED' || status === 'PUBLISHED') return null;
    if (status === 'ERROR' || status === 'EXPIRED') {
      return fail(502, `Media container ${containerId} failed: ${status}`);
    }
    await sleep(interval);
  }
  return fail(504, `Media container ${containerId} not FINISHED after ${maxTries} tries`);
}

/** /me 로 토큰 소유 계정 조회 — 반환 body 는 플랫폼 원문 JSON. */
async function fetchMe(baseUrl: string, accessToken: string, fields: string): Promise<ApiResult> {
  return graphRequest('get', `${baseUrl}/me`, { fields, access_token: accessToken });
}

function okJson(payload: Record<string, unknown>): ApiResult {
  return { ok: true, status: 200, body: JSON.stringify(payload) };
}

// ── Threads ──────────────────────────────────────────────────────

export interface ThreadsPublishInput {
  caption: string;
  imageUrl?: string;
  /** 자기 답글 체인(reply-first 규칙 — 본문 링크 금지, 링크는 답글로) */
  replyToId?: string;
  /** 채널(브랜드) slug — <SNS_TOKEN_DIR>/<slug>/ 토큰 사용, 미지정 시 기본 토큰 */
  channel?: string;
}

export async function publishThreads(input: ThreadsPublishInput, opts?: PollOpts): Promise<ApiResult> {
  const { token, error } = await loadTokenFile('THREADS', input.channel);
  if (!token) return error!;
  const me = await fetchMe(THREADS_BASE, token, 'id,username');
  if (!me.ok) return me;
  const uid = String(parseJson(me.body)?.id ?? '');
  if (!uid) return fail(502, `Threads /me returned no id: ${me.body}`);

  const create = await graphRequest('post', `${THREADS_BASE}/${uid}/threads`, {
    media_type: input.imageUrl ? 'IMAGE' : 'TEXT',
    text: input.caption,
    image_url: input.imageUrl,
    reply_to_id: input.replyToId,
    access_token: token,
  });
  if (!create.ok) return create;
  const creationId = String(parseJson(create.body)?.id ?? '');
  if (!creationId) return fail(502, `Threads container create returned no id: ${create.body}`);

  if (input.imageUrl) {
    const pollFailure = await pollContainer(THREADS_BASE, creationId, token, 'status', opts);
    if (pollFailure) return pollFailure;
  }

  const publish = await graphRequest('post', `${THREADS_BASE}/${uid}/threads_publish`, {
    creation_id: creationId,
    access_token: token,
  });
  if (!publish.ok) return publish;
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

// ── Instagram ────────────────────────────────────────────────────

export interface InstagramPublishInput {
  caption: string;
  /** 이미지 1~10장 — 2장 이상이면 캐러셀 */
  imageUrls?: string[];
  /** 릴스 영상 1개 (imageUrls 와 배타) */
  videoUrl?: string;
  /** 채널(브랜드) slug — <SNS_TOKEN_DIR>/<slug>/ 토큰 사용, 미지정 시 기본 토큰 */
  channel?: string;
}

export async function publishInstagram(input: InstagramPublishInput, opts?: PollOpts): Promise<ApiResult> {
  const { token, error } = await loadTokenFile('INSTAGRAM', input.channel);
  if (!token) return error!;
  const me = await fetchMe(IG_BASE, token, 'id,username');
  if (!me.ok) return me;
  const uid = String(parseJson(me.body)?.id ?? '');
  if (!uid) return fail(502, `Instagram /me returned no id: ${me.body}`);

  let creationId: string;
  if (input.videoUrl) {
    const create = await graphRequest('post', `${IG_BASE}/${uid}/media`, {
      media_type: 'REELS',
      video_url: input.videoUrl,
      caption: input.caption,
      access_token: token,
    });
    if (!create.ok) return create;
    creationId = String(parseJson(create.body)?.id ?? '');
  } else if ((input.imageUrls?.length ?? 0) === 1) {
    const create = await graphRequest('post', `${IG_BASE}/${uid}/media`, {
      image_url: input.imageUrls![0],
      caption: input.caption,
      access_token: token,
    });
    if (!create.ok) return create;
    creationId = String(parseJson(create.body)?.id ?? '');
  } else {
    // 캐러셀 — 자식 컨테이너를 만들고 전부 FINISHED 후 묶는다
    const children: string[] = [];
    for (const imageUrl of input.imageUrls ?? []) {
      const child = await graphRequest('post', `${IG_BASE}/${uid}/media`, {
        image_url: imageUrl,
        is_carousel_item: 'true',
        access_token: token,
      });
      if (!child.ok) return child;
      const childId = String(parseJson(child.body)?.id ?? '');
      if (!childId) return fail(502, `Instagram carousel child returned no id: ${child.body}`);
      children.push(childId);
    }
    for (const childId of children) {
      const pollFailure = await pollContainer(IG_BASE, childId, token, 'status_code', opts);
      if (pollFailure) return pollFailure;
    }
    const create = await graphRequest('post', `${IG_BASE}/${uid}/media`, {
      media_type: 'CAROUSEL',
      children: children.join(','),
      caption: input.caption,
      access_token: token,
    });
    if (!create.ok) return create;
    creationId = String(parseJson(create.body)?.id ?? '');
  }
  if (!creationId) return fail(502, 'Instagram media container returned no id');

  const pollFailure = await pollContainer(IG_BASE, creationId, token, 'status_code', opts);
  if (pollFailure) return pollFailure;

  const publish = await graphRequest('post', `${IG_BASE}/${uid}/media_publish`, {
    creation_id: creationId,
    access_token: token,
  });
  if (!publish.ok) return publish;
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

// ── Facebook 페이지 ──────────────────────────────────────────────

export interface FacebookPublishInput {
  caption: string;
  imageUrls?: string[];
  videoUrl?: string;
  /** 링크 첨부(텍스트 게시에서만) — FB 플랫폼 문법의 "링크 첨부 또는 첫 댓글" 규칙용 */
  linkUrl?: string;
  /** 채널(브랜드) slug — <SNS_TOKEN_DIR>/<slug>/ 토큰 사용, 미지정 시 기본 토큰 */
  channel?: string;
}

export async function publishFacebook(input: FacebookPublishInput): Promise<ApiResult> {
  const { token, error } = await loadTokenFile('FACEBOOK', input.channel);
  if (!token) return error!;
  // 페이지 토큰의 /me = 페이지 자신
  const me = await fetchMe(FB_BASE, token, 'id,name');
  if (!me.ok) return me;
  const pageId = String(parseJson(me.body)?.id ?? '');
  if (!pageId) return fail(502, `Facebook /me returned no id: ${me.body}`);

  let postId: string;
  if (input.videoUrl) {
    const video = await graphRequest(
      'post',
      `${FB_BASE}/${pageId}/videos`,
      { file_url: input.videoUrl, description: input.caption, access_token: token },
      120_000,
    );
    if (!video.ok) return video;
    postId = String(parseJson(video.body)?.id ?? '');
  } else if ((input.imageUrls?.length ?? 0) > 0) {
    const mediaFbids: string[] = [];
    for (const imageUrl of input.imageUrls ?? []) {
      const photo = await graphRequest('post', `${FB_BASE}/${pageId}/photos`, {
        url: imageUrl,
        published: 'false',
        access_token: token,
      });
      if (!photo.ok) return photo;
      const photoId = String(parseJson(photo.body)?.id ?? '');
      if (!photoId) return fail(502, `Facebook photo upload returned no id: ${photo.body}`);
      mediaFbids.push(photoId);
    }
    const params: Record<string, string> = { message: input.caption, access_token: token };
    mediaFbids.forEach((fbid, index) => {
      params[`attached_media[${index}]`] = JSON.stringify({ media_fbid: fbid });
    });
    const feed = await graphRequest('post', `${FB_BASE}/${pageId}/feed`, params);
    if (!feed.ok) return feed;
    postId = String(parseJson(feed.body)?.id ?? '');
  } else {
    const feed = await graphRequest('post', `${FB_BASE}/${pageId}/feed`, {
      message: input.caption,
      link: input.linkUrl,
      access_token: token,
    });
    if (!feed.ok) return feed;
    postId = String(parseJson(feed.body)?.id ?? '');
  }
  if (!postId) return fail(502, 'Facebook publish returned no id');

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

export interface FacebookCommentInput {
  /** publishFacebook 응답의 postId (`<pageId>_<postId>` 형식) */
  postId: string;
  message: string;
  /** 채널(브랜드) slug — <SNS_TOKEN_DIR>/<slug>/ 토큰 사용, 미지정 시 기본 토큰 */
  channel?: string;
}

/** 페이지 명의로 자기 게시물에 댓글 작성 — "원문 링크는 첫 댓글로" 플랫폼 규칙용 (scope: pages_manage_engagement). */
export async function commentFacebook(input: FacebookCommentInput): Promise<ApiResult> {
  const { token, error } = await loadTokenFile('FACEBOOK', input.channel);
  if (!token) return error!;
  const create = await graphRequest('post', `${FB_BASE}/${input.postId}/comments`, {
    message: input.message,
    access_token: token,
  });
  if (!create.ok) return create;
  const commentId = String(parseJson(create.body)?.id ?? '');
  if (!commentId) return fail(502, `Facebook comment returned no id: ${create.body}`);

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

// ── YouTube ──────────────────────────────────────────────────────

interface YoutubeOauthClient {
  client_id: string;
  client_secret: string;
  refresh_token: string;
}

async function loadYoutubeClient(channel?: string): Promise<{ client?: YoutubeOauthClient; error?: ApiResult }> {
  const filePath = snsCredentialFile('YOUTUBE', channel);
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch {
    return { error: fail(400, missingTokenMessage('YOUTUBE', channel, filePath)) };
  }
  const parsed = parseJson(raw);
  const client = parsed as YoutubeOauthClient | null;
  if (!client?.client_id || !client.client_secret || !client.refresh_token) {
    return { error: fail(400, `youtube-oauth-client.json requires client_id/client_secret/refresh_token: ${filePath}`) };
  }
  return { client };
}

async function exchangeYoutubeAccessToken(client: YoutubeOauthClient): Promise<{ token?: string; error?: ApiResult }> {
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
    if (!res.ok) return { error: { ok: false, status: res.status, body: text } };
    const token = String(parseJson(text)?.access_token ?? '');
    if (!token) return { error: fail(502, 'YouTube token exchange returned no access_token') };
    return { token };
  } catch (error) {
    return { error: fail(502, `YouTube token exchange failed: ${error instanceof Error ? error.message : String(error)}`) };
  }
}

export interface YoutubePublishInput {
  videoFilePath: string;
  title: string;
  description: string;
  privacyStatus?: 'public' | 'unlisted' | 'private';
  /** YouTube 카테고리 ID — 미지정 시 22(People & Blogs) */
  categoryId?: string;
  /** 아동용 콘텐츠 자기 선언(COPPA) — 미지정 시 false. 아동 대상 콘텐츠는 반드시 true 로 선언해야 한다 */
  madeForKids?: boolean;
  thumbnailFilePath?: string;
  /** 채널(브랜드) slug — <SNS_TOKEN_DIR>/<slug>/ 토큰 사용, 미지정 시 기본 토큰 */
  channel?: string;
}

const YT_VIDEO_MIME_BY_EXT: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
};

const YT_THUMB_MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
};

const YT_THUMB_MAX_BYTES = 2 * 1024 * 1024;

async function setYoutubeThumbnail(
  token: string,
  videoId: string,
  thumb: { bytes: Buffer; mimeType: string },
): Promise<string | null> {
  try {
    const view = new Uint8Array(thumb.bytes.buffer as ArrayBuffer, thumb.bytes.byteOffset, thumb.bytes.byteLength);
    const res = await fetch(
      `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': thumb.mimeType },
        body: view,
        signal: AbortSignal.timeout(60_000),
      },
    );
    if (!res.ok) return `thumbnails.set ${res.status}: ${(await res.text()).slice(0, 300)}`;
    return null;
  } catch (error) {
    return `thumbnails.set failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export async function publishYoutube(input: YoutubePublishInput): Promise<ApiResult> {
  const mimeType = YT_VIDEO_MIME_BY_EXT[extname(input.videoFilePath).toLowerCase()];
  if (!mimeType) return fail(400, `Unsupported video extension: ${input.videoFilePath} (.mp4/.mov)`);
  let bytes: Buffer;
  try {
    bytes = await readFile(input.videoFilePath);
  } catch (error) {
    return fail(400, `Cannot read video file: ${error instanceof Error ? error.message : String(error)}`);
  }

  // 썸네일은 업로드 전에 검증 — 업로드 후에 거부하면 이미 소모된 업로드 쿼터와
  // 전송 시간(수십 MB)이 통째로 낭비된다
  let thumb: { bytes: Buffer; mimeType: string } | undefined;
  if (input.thumbnailFilePath) {
    const thumbMime = YT_THUMB_MIME_BY_EXT[extname(input.thumbnailFilePath).toLowerCase()];
    if (!thumbMime) {
      return fail(400, `Unsupported thumbnail extension: ${input.thumbnailFilePath} (.jpg/.jpeg/.png)`);
    }
    let thumbBytes: Buffer;
    try {
      thumbBytes = await readFile(input.thumbnailFilePath);
    } catch (error) {
      return fail(400, `Cannot read thumbnail file: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (thumbBytes.byteLength > YT_THUMB_MAX_BYTES) {
      return fail(400, `Thumbnail exceeds 2MB: ${input.thumbnailFilePath} (${thumbBytes.byteLength} bytes)`);
    }
    thumb = { bytes: thumbBytes, mimeType: thumbMime };
  }

  const { client, error: clientError } = await loadYoutubeClient(input.channel);
  if (!client) return clientError!;
  const { token, error: tokenError } = await exchangeYoutubeAccessToken(client);
  if (!token) return tokenError!;

  // resumable 세션 개시 → Location 에 바이트 PUT (콘솔 어댑터와 동일 계약)
  let location: string | null;
  try {
    const init = await fetch(
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
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
          },
        }),
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!init.ok) return { ok: false, status: init.status, body: await init.text() };
    location = init.headers.get('location');
  } catch (error) {
    return fail(502, `YouTube resumable init failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!location) return fail(502, 'YouTube resumable init returned no Location header');

  try {
    const view = new Uint8Array(bytes.buffer as ArrayBuffer, bytes.byteOffset, bytes.byteLength);
    const upload = await fetch(location, {
      method: 'PUT',
      headers: { 'Content-Type': mimeType },
      body: view,
      signal: AbortSignal.timeout(600_000),
    });
    const text = await upload.text();
    if (!upload.ok) return { ok: false, status: upload.status, body: text };
    const videoId = String(parseJson(text)?.id ?? '');
    if (!videoId) return fail(502, `YouTube upload returned no video id: ${text}`);
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
  } catch (error) {
    return fail(502, `YouTube upload failed: ${error instanceof Error ? error.message : String(error)}`);
  }
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
 *   YOUTUBE   토큰 scope 에 `youtube.force-ssl` 이 없어 댓글 API 자체가 불가 — 인박스에서 제외한다
 *
 * "우리가 이미 답했는가"는 플랫폼 필드로 판정한다(THREADS `is_reply_owned_by_me`,
 * IG username 일치, FB `from.id == pageId`) — 추측하지 않으므로 중복 답글이 나가지 않는다.
 */

export const COMMENT_PLATFORMS = ['THREADS', 'INSTAGRAM', 'FACEBOOK'] as const;
export type CommentPlatform = (typeof COMMENT_PLATFORMS)[number];

/** 정규화 댓글 — 플랫폼별 필드명 차이를 흡수해 분류·우선순위 판단만 남긴다. */
export interface InboxComment {
  platform: CommentPlatform;
  postId: string;
  commentId: string;
  /** 최상위 댓글이면 null, 대댓글이면 부모 댓글 id */
  parentCommentId: string | null;
  author: string;
  /** 우리 계정이 쓴 댓글(자기 답글 포함) */
  isOwn: boolean;
  /** 이 댓글에 우리 답글이 이미 달렸는가 */
  answeredByUs: boolean;
  text: string;
  timestamp: string | null;
  /** 골든타임(첫 60분) 판단용 경과 분 */
  ageMinutes: number | null;
  likeCount: number | null;
  hidden: boolean;
  permalink: string | null;
}

export interface InboxPost {
  platform: CommentPlatform;
  postId: string;
  permalink: string | null;
  excerpt: string;
  timestamp: string | null;
  comments: InboxComment[];
  /** 댓글 조회만 실패한 경우 — 게시물 하나의 실패가 인박스 전체를 죽이지 않는다 */
  commentsError?: string;
}

export interface CommentInboxInput {
  platforms?: CommentPlatform[];
  /** 채널(브랜드) slug — <SNS_TOKEN_DIR>/<slug>/ 토큰 사용, 미지정 시 기본 토큰 */
  channel?: string;
  /** 플랫폼당 훑을 최근 게시물 수 */
  postLimit?: number;
  /** 게시물당 가져올 댓글 수 */
  commentLimit?: number;
  /** 이 시간 이내 댓글만 (미지정이면 전체) */
  sinceHours?: number;
  /** 우리가 이미 답한 댓글도 포함 (기본 false) */
  includeAnswered?: boolean;
  /** 우리 계정이 쓴 댓글도 포함 (기본 false) */
  includeOwn?: boolean;
}

type Raw = Record<string, unknown>;

const rawList = (body: string): Raw[] => {
  const data = parseJson(body)?.data;
  return Array.isArray(data) ? (data as Raw[]) : [];
};
const str = (value: unknown): string => (value === undefined || value === null ? '' : String(value));
const numOrNull = (value: unknown): number | null => (typeof value === 'number' ? value : null);
const excerpt = (text: string, max = 140): string => (text.length > max ? `${text.slice(0, max)}…` : text);

function minutesSince(timestamp: string | null, now: number): number | null {
  if (!timestamp) return null;
  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? null : Math.max(0, Math.round((now - parsed) / 60_000));
}

interface ChannelInbox {
  account?: Record<string, unknown>;
  posts?: InboxPost[];
  error?: ApiResult;
}

async function inboxThreads(
  input: Required<Pick<CommentInboxInput, 'postLimit' | 'commentLimit'>>,
  now: number,
  channel?: string,
): Promise<ChannelInbox> {
  const { token, error } = await loadTokenFile('THREADS', channel);
  if (!token) return { error };
  const me = await fetchMe(THREADS_BASE, token, 'id,username');
  if (!me.ok) return { error: me };
  const account = parseJson(me.body) ?? {};
  const uid = str(account.id);
  if (!uid) return { error: fail(502, `Threads /me returned no id: ${me.body}`) };

  const list = await graphRequest('get', `${THREADS_BASE}/${uid}/threads`, {
    fields: 'id,text,timestamp,permalink,is_reply',
    limit: String(input.postLimit),
    access_token: token,
  });
  if (!list.ok) return { account, error: list };

  const posts: InboxPost[] = [];
  // is_reply 인 항목은 우리 자기 답글 — 게시물이 아니라 답글이므로 인박스 루트가 아니다
  for (const item of rawList(list.body).filter((item) => item.is_reply !== true)) {
    const postId = str(item.id);
    if (!postId) continue;
    const post: InboxPost = {
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
    const answered = new Set<string>();
    for (const reply of replies) {
      if (reply.is_reply_owned_by_me !== true) continue;
      const parent = str((reply.replied_to as Raw | undefined)?.id);
      if (parent) answered.add(parent);
    }
    for (const reply of replies) {
      const commentId = str(reply.id);
      if (!commentId) continue;
      const timestamp = reply.timestamp ? str(reply.timestamp) : null;
      const parentId = str((reply.replied_to as Raw | undefined)?.id);
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

async function inboxInstagram(
  input: Required<Pick<CommentInboxInput, 'postLimit' | 'commentLimit'>>,
  now: number,
  channel?: string,
): Promise<ChannelInbox> {
  const { token, error } = await loadTokenFile('INSTAGRAM', channel);
  if (!token) return { error };
  const me = await fetchMe(IG_BASE, token, 'id,username');
  if (!me.ok) return { error: me };
  const account = parseJson(me.body) ?? {};
  const uid = str(account.id);
  const ourName = str(account.username);
  if (!uid) return { error: fail(502, `Instagram /me returned no id: ${me.body}`) };

  const list = await graphRequest('get', `${IG_BASE}/${uid}/media`, {
    fields: 'id,permalink,caption,timestamp,comments_count',
    limit: String(input.postLimit),
    access_token: token,
  });
  if (!list.ok) return { account, error: list };

  const posts: InboxPost[] = [];
  for (const item of rawList(list.body)) {
    const postId = str(item.id);
    if (!postId) continue;
    const post: InboxPost = {
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
      if (!topId) continue;
      const nested = Array.isArray((top.replies as Raw | undefined)?.data)
        ? ((top.replies as Raw).data as Raw[])
        : [];
      const push = (node: Raw, parentCommentId: string | null) => {
        const commentId = str(node.id);
        if (!commentId) return;
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
          answeredByUs:
            parentCommentId === null && nested.some((reply) => !!ourName && str(reply.username) === ourName),
          text: str(node.text),
          timestamp,
          ageMinutes: minutesSince(timestamp, now),
          likeCount: numOrNull(node.like_count),
          hidden: node.hidden === true,
          permalink: null, // IG 댓글에는 permalink 필드가 없다 — 게시물 permalink 로 이동
        });
      };
      push(top, null);
      for (const reply of nested) push(reply, topId);
    }
    posts.push(post);
  }
  return { account, posts };
}

async function inboxFacebook(
  input: Required<Pick<CommentInboxInput, 'postLimit' | 'commentLimit'>>,
  now: number,
  channel?: string,
): Promise<ChannelInbox> {
  const { token, error } = await loadTokenFile('FACEBOOK', channel);
  if (!token) return { error };
  const me = await fetchMe(FB_BASE, token, 'id,name');
  if (!me.ok) return { error: me };
  const account = parseJson(me.body) ?? {};
  const pageId = str(account.id);
  if (!pageId) return { error: fail(502, `Facebook /me returned no id: ${me.body}`) };

  const list = await graphRequest('get', `${FB_BASE}/${pageId}/posts`, {
    fields: 'id,message,created_time,permalink_url',
    limit: String(input.postLimit),
    access_token: token,
  });
  if (!list.ok) return { account, error: list };

  const posts: InboxPost[] = [];
  for (const item of rawList(list.body)) {
    const postId = str(item.id);
    if (!postId) continue;
    const post: InboxPost = {
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
    const answered = new Set<string>();
    for (const row of rows) {
      if (str((row.from as Raw | undefined)?.id) !== pageId) continue;
      const parent = str((row.parent as Raw | undefined)?.id);
      if (parent) answered.add(parent);
    }
    for (const row of rows) {
      const commentId = str(row.id);
      if (!commentId) continue;
      const timestamp = row.created_time ? str(row.created_time) : null;
      const from = row.from as Raw | undefined;
      post.comments.push({
        platform: 'FACEBOOK',
        postId,
        commentId,
        parentCommentId: str((row.parent as Raw | undefined)?.id) || null,
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
 * 플랫폼 횡단 댓글 인박스 — 최근 게시물의 댓글을 정규화해 모으고, 기본값으로
 * **우리가 아직 답하지 않은 남의 댓글만** 남긴다. 플랫폼 하나가 실패해도 나머지는
 * 그대로 반환하고 실패 사유를 skipped 에 싣는다(부분 실패가 전체를 막지 않는다).
 */
export async function commentInbox(input: CommentInboxInput = {}): Promise<ApiResult> {
  const now = Date.now();
  const limits = {
    postLimit: Math.min(Math.max(input.postLimit ?? 5, 1), 25),
    commentLimit: Math.min(Math.max(input.commentLimit ?? 50, 1), 100),
  };
  // 가용성은 채널 스코프로 판정한다 — 채널 지정 시 그 채널 디렉토리의 토큰만 본다
  const available = new Set<string>(availablePlatformsFor(input.channel));
  const requested = input.platforms?.length ? input.platforms : [...COMMENT_PLATFORMS];

  const collectors: Record<CommentPlatform, (l: typeof limits, n: number, c?: string) => Promise<ChannelInbox>> = {
    THREADS: inboxThreads,
    INSTAGRAM: inboxInstagram,
    FACEBOOK: inboxFacebook,
  };

  const accounts: Record<string, unknown> = {};
  const skipped: Array<{ platform: string; reason: string }> = [];
  const posts: InboxPost[] = [];

  // 플랫폼별 수집은 서로 다른 API 라 병렬로 돌린다 — 최대 75회(25게시물×3)의 직렬
  // 왕복을 플랫폼 단위로 겹쳐 체감 지연을 1/3 로 줄인다. 결과 순서는 requested 유지.
  const collected = await Promise.all(
    requested.map(async (platform) => ({
      platform,
      inbox: available.has(platform) ? await collectors[platform](limits, now, input.channel) : null,
    })),
  );
  for (const { platform, inbox } of collected) {
    if (!inbox) {
      skipped.push({ platform, reason: `자격증명 파일 없음 (${snsCredentialFile(platform, input.channel)})` });
      continue;
    }
    if (inbox.account) accounts[platform] = inbox.account;
    if (inbox.error) {
      skipped.push({ platform, reason: `HTTP ${inbox.error.status}: ${inbox.error.body.slice(0, 300)}` });
      continue;
    }
    posts.push(...(inbox.posts ?? []));
  }
  if (available.has('YOUTUBE')) {
    skipped.push({
      platform: 'YOUTUBE',
      reason: '토큰 scope 에 youtube.force-ssl 이 없어 댓글 조회·작성 불가 — YouTube Studio 에서 수동 응대',
    });
  }

  const cutoff = input.sinceHours ? now - input.sinceHours * 3_600_000 : null;
  let fetched = 0;
  const filtered = posts.map((post) => {
    fetched += post.comments.length;
    const comments = post.comments.filter((comment) => {
      if (!input.includeOwn && comment.isOwn) return false;
      if (!input.includeAnswered && comment.answeredByUs) return false;
      if (cutoff !== null && comment.timestamp !== null && Date.parse(comment.timestamp) < cutoff) return false;
      return true;
    });
    return { ...post, comments };
  });

  const actionable = filtered.flatMap((post) => post.comments);
  const byPlatform: Record<string, number> = {};
  for (const comment of actionable) byPlatform[comment.platform] = (byPlatform[comment.platform] ?? 0) + 1;

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
      oldestActionableMinutes: actionable.reduce<number | null>(
        (max, c) => (c.ageMinutes === null ? max : max === null ? c.ageMinutes : Math.max(max, c.ageMinutes)),
        null,
      ),
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

function capInboxPayload(posts: InboxPost[]): { posts: InboxPost[]; dropped: number } {
  if (JSON.stringify(posts).length <= INBOX_MAX_CHARS) return { posts, dropped: 0 };

  // 전 게시물의 댓글을 한 줄로 세워 최신순 정렬 → 상한에 들어가는 만큼만 남긴다.
  // ageMinutes 가 없는(타임스탬프 미제공) 댓글은 판단 근거가 없으므로 뒤로 보낸다.
  const ranked = posts
    .flatMap((post) => post.comments)
    .sort((a, b) => (a.ageMinutes ?? Number.MAX_SAFE_INTEGER) - (b.ageMinutes ?? Number.MAX_SAFE_INTEGER));

  // 직렬화 크기는 유지 수에 단조 증가하므로 이분 탐색으로 "상한에 들어가는 최대
  // 유지 수"를 찾는다 — 절반씩 버리는 방식은 필요 이상(최대 2배)을 버렸다.
  const keepTop = (count: number): InboxPost[] => {
    const survivors = new Set(ranked.slice(0, count).map((comment) => comment.commentId));
    return posts.map((post) => ({ ...post, comments: post.comments.filter((c) => survivors.has(c.commentId)) }));
  };
  let lo = 0;
  let hi = ranked.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    if (JSON.stringify(keepTop(mid)).length <= INBOX_MAX_CHARS) lo = mid;
    else hi = mid - 1;
  }
  return { posts: keepTop(lo), dropped: ranked.length - lo };
}

export interface CommentReplyInput {
  platform: CommentPlatform;
  /** 답글을 달 대상 댓글 id (인박스의 commentId) */
  commentId: string;
  message: string;
  /** 채널(브랜드) slug — <SNS_TOKEN_DIR>/<slug>/ 토큰 사용, 미지정 시 기본 토큰 */
  channel?: string;
}

/** 받은 댓글에 답글 작성 — 호출 즉시 공개. 플랫폼별 답글 엔드포인트 차이를 흡수한다. */
export async function replyToComment(input: CommentReplyInput): Promise<ApiResult> {
  if (input.platform === 'THREADS') {
    // Threads 답글은 별도 엔드포인트가 없다 — reply_to_id 를 단 새 게시물이 곧 답글이다
    return publishThreads({ caption: input.message, replyToId: input.commentId, channel: input.channel });
  }
  if (input.platform === 'FACEBOOK') {
    // FB 는 댓글 id 에 댓글을 달면 대댓글 — 게시물 첫 댓글과 같은 엔드포인트다
    return commentFacebook({ postId: input.commentId, message: input.message, channel: input.channel });
  }

  const { token, error } = await loadTokenFile('INSTAGRAM', input.channel);
  if (!token) return error!;
  const create = await graphRequest('post', `${IG_BASE}/${input.commentId}/replies`, {
    message: input.message,
    access_token: token,
  });
  if (!create.ok) return create;
  const replyId = str(parseJson(create.body)?.id);
  if (!replyId) return fail(502, `Instagram reply returned no id: ${create.body}`);
  return okJson({ platform: 'INSTAGRAM', replyId, permalink: null });
}

export type ModerateAction = 'hide' | 'unhide' | 'like' | 'unlike';

export interface CommentModerateInput {
  platform: CommentPlatform;
  commentId: string;
  action: ModerateAction;
  /** 채널(브랜드) slug — <SNS_TOKEN_DIR>/<slug>/ 토큰 사용, 미지정 시 기본 토큰 */
  channel?: string;
}

/**
 * 댓글 숨김/해제와 FB 댓글 좋아요. **삭제는 의도적으로 제공하지 않는다** —
 * 숨김은 되돌릴 수 있고 작성자에게는 계속 보이지만 삭제는 비가역이라,
 * 스팸·어뷰징 대응에는 숨김이 브랜드 리스크가 더 낮다 (2026-07-26 사용자 확정).
 */
export async function moderateComment(input: CommentModerateInput): Promise<ApiResult> {
  const { platform, commentId, action, channel } = input;
  const hide = action === 'hide';

  if (action === 'like' || action === 'unlike') {
    if (platform !== 'FACEBOOK') {
      return fail(400, `${platform} 는 댓글 좋아요 API 가 없다 — 답글(sns_comment_reply)로만 반응할 수 있다.`);
    }
    const { token, error } = await loadTokenFile('FACEBOOK', channel);
    if (!token) return error!;
    const res = await graphRequest(action === 'like' ? 'post' : 'delete', `${FB_BASE}/${commentId}/likes`, {
      access_token: token,
    });
    if (!res.ok) return res;
    return okJson({ platform, commentId, action, done: true });
  }

  if (platform === 'THREADS') {
    const { token, error } = await loadTokenFile('THREADS', channel);
    if (!token) return error!;
    const res = await graphRequest('post', `${THREADS_BASE}/${commentId}/manage_reply`, {
      hide: String(hide),
      access_token: token,
    });
    if (!res.ok) return res;
    return okJson({ platform, commentId, action, done: true });
  }

  if (platform === 'INSTAGRAM') {
    const { token, error } = await loadTokenFile('INSTAGRAM', channel);
    if (!token) return error!;
    const res = await graphRequest('post', `${IG_BASE}/${commentId}`, {
      hide: String(hide),
      access_token: token,
    });
    if (!res.ok) return res;
    return okJson({ platform, commentId, action, done: true });
  }

  const { token, error } = await loadTokenFile('FACEBOOK', channel);
  if (!token) return error!;
  const res = await graphRequest('post', `${FB_BASE}/${commentId}`, {
    is_hidden: String(hide),
    access_token: token,
  });
  if (!res.ok) return res;
  return okJson({ platform, commentId, action, done: true });
}

// ── 계정 점검 ────────────────────────────────────────────────────

/**
 * 한 자격증명 세트(채널 하나 또는 기본 토큰)의 4개 플랫폼 점검 — 토큰 값은 절대
 * 싣지 않는다. 플랫폼 점검은 서로 독립이라 병렬로 돌린다(4회 직렬 왕복 → 1회 체감).
 */
async function checkPlatformSet(channel?: string): Promise<Record<string, unknown>> {
  const metaChecks = (
    [
      ['threads', 'THREADS', THREADS_BASE, 'id,username'],
      ['instagram', 'INSTAGRAM', IG_BASE, 'id,username'],
      ['facebook', 'FACEBOOK', FB_BASE, 'id,name'],
    ] as const
  ).map(async ([key, platform, baseUrl, fields]) => {
    const { token, error } = await loadTokenFile(platform, channel);
    if (!token) return [key, { ok: false, reason: error!.body }] as const;
    const me = await fetchMe(baseUrl, token, fields);
    return [
      key,
      me.ok
        ? { ok: true, account: parseJson(me.body) }
        : { ok: false, status: me.status, reason: me.body.slice(0, 300) },
    ] as const;
  });

  const youtubeCheck = (async () => {
    const { client, error: clientError } = await loadYoutubeClient(channel);
    if (!client) return ['youtube', { ok: false, reason: clientError!.body }] as const;
    const { token, error } = await exchangeYoutubeAccessToken(client);
    if (!token) return ['youtube', { ok: false, status: error!.status, reason: error!.body.slice(0, 300) }] as const;
    try {
      const res = await fetch('https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true', {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(30_000),
      });
      const text = await res.text();
      const items = (parseJson(text)?.items as Array<Record<string, unknown>> | undefined) ?? [];
      return [
        'youtube',
        res.ok
          ? {
              ok: true,
              channels: items.map((item) => ({
                id: item.id,
                title: (item.snippet as Record<string, unknown> | undefined)?.title,
              })),
            }
          : { ok: false, status: res.status, reason: text.slice(0, 300) },
      ] as const;
    } catch (error) {
      return ['youtube', { ok: false, reason: error instanceof Error ? error.message : String(error) }] as const;
    }
  })();

  return Object.fromEntries(await Promise.all([...metaChecks, youtubeCheck]));
}

/**
 * SNS 게시 자격증명 일괄 점검 — channel 지정 시 그 채널 세트만, 미지정 시
 * 모든 채널 디렉토리 + 기본(평면) 토큰을 함께 점검한다. 계정 식별 정보만 반환.
 */
export async function checkAccounts(channel?: string): Promise<ApiResult> {
  if (channel) {
    const body = { channel, platforms: await checkPlatformSet(channel) };
    return { ok: true, status: 200, body: JSON.stringify(body, null, 2) };
  }

  const channelEntries = await Promise.all(
    listChannelDirs().map(async (dir) => [dir.channel, await checkPlatformSet(dir.channel)] as const),
  );
  const channels: Record<string, unknown> = Object.fromEntries(channelEntries);
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
