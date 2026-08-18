import { z } from 'zod';
import * as datago from './datago-client.js';
import * as image from './image-client.js';
import * as music from './music-client.js';
import * as naver from './naver-client.js';
import * as seedance from './seedance-client.js';
import * as serp from './serp-client.js';
import * as sns from './sns-client.js';
import * as supertonic from './supertonic-client.js';
import * as zimage from './zimage-client.js';
import * as tts from './tts-client.js';
import * as video from './video-client.js';
import { contentFeedback } from './content-feedback.js';
import { youtubeTopicScout } from './youtube-topic-scout.js';
import * as snsScout from './sns-issue-scout.js';
import { formatError, formatFileSize, saveBase64Image } from './media-utils.js';
import type { ApiResult } from './http.js';

/** MCP content 블록 — 생성 이미지는 base64 image 블록으로 함께 반환한다. */
export type ToolContent =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string };

export interface ToolResult {
  [key: string]: unknown;
  content: ToolContent[];
  /** outputSchema 를 선언한 툴의 성공 응답에만 싣는다 (MCP: 스키마 준수가 MUST). */
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

function text(message: string, isError = false): ToolResult {
  return { content: [{ type: 'text', text: message }], isError };
}

/** 생성 이미지 응답 — base64 이미지 블록 + 요약 텍스트 블록 (fect-mcp 계약 승계). */
function imageResult(message: string, base64Data: string, mimeType: string): ToolResult {
  return {
    content: [
      { type: 'image', data: base64Data, mimeType },
      { type: 'text', text: message },
    ],
  };
}

/**
 * Seedance 결과의 공통 메타 줄 — 세 툴이 같은 형식으로 보고한다.
 *
 * 토큰 수를 싣는 이유는 이 값이 곧 청구서이기 때문이다. 단가표로 환산한 추정치는
 * 벤더가 요금을 바꾸면 조용히 틀리지만, completion_tokens 는 호출마다 실측이다.
 */
function seedanceMeta(result: {
  model?: string;
  ratio?: string;
  resolution?: string;
  duration?: number;
  completionTokens?: number;
  taskId?: string;
}): string {
  const tokens =
    result.completionTokens === undefined
      ? ''
      : `\nBilled tokens: ${result.completionTokens.toLocaleString('en-US')} (completion_tokens — 과금 근거)`;
  return `Model: ${result.model}\nRatio: ${result.ratio}\nResolution: ${result.resolution}\nDuration: ${result.duration} seconds${tokens}\nTask ID: ${result.taskId}`;
}

/**
 * 플랫폼 API 결과 → MCP 툴 결과.
 *
 * 성공 시 본문이 JSON 객체면 structuredContent 로도 실어 outputSchema 계약을
 * 만족시킨다(스펙은 직렬화 JSON 을 텍스트 블록으로도 함께 실으라고 권한다).
 * 실패 시에는 structuredContent 를 채우지 않는다 — 실패 본문은 플랫폼 원문
 * 에러라 우리 스키마를 만족하지 않으며, isError 로 이미 구분된다.
 */
function fromApi(result: ApiResult, note?: string): ToolResult {
  if (!result.ok) {
    return text(`HTTP ${result.status}\n${result.body}`, true);
  }
  // 노트는 성공 경로에만 붙인다 — 게시 실패에 "게시 완료" 안내가 실리면
  // 호출자가 실패를 성공으로 보고하고 후속 절차(FB 첫 댓글 등)를 건너뛴다.
  const out = text(note ? `${note}\n${result.body}` : result.body);
  const parsed = tryParseObject(result.body);
  if (parsed) out.structuredContent = parsed;
  return out;
}

function tryParseObject(body: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(body);
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Zod 파싱 실패를 모델이 교정 가능한 메시지로 변환한다.
 *
 * 스키마에 없는 최상위 인자는 **거절한다**. zod 의 기본 object 는 미지의 키를
 * 조용히 벗겨내는데, 그 침묵이 정확히 이 서버가 없애려는 실패 모드다 — 예컨대
 * 네이버 공식 문서를 읽은 모델이 `filter`(우리 툴에서는 `imageSize`)를 그대로
 * 보내면, 필터가 걸리지 않은 결과를 받고도 걸렸다고 믿는다. 스키마마다
 * `.strict()` 를 다는 대신 여기 한 곳에서 잡아 새 스키마가 규약을 빠뜨릴 수 없게
 * 한다.
 */
function parseArgs<T extends z.ZodTypeAny>(schema: T, args: unknown): z.infer<T> {
  const parsed = schema.safeParse(args);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
    throw new Error(`Invalid arguments — ${issues}`);
  }
  const known = knownKeys(schema);
  if (known && args && typeof args === 'object' && !Array.isArray(args)) {
    const unknown = Object.keys(args as Record<string, unknown>).filter((k) => !known.has(k));
    if (unknown.length > 0) {
      throw new Error(
        `Invalid arguments — 알 수 없는 인자: ${unknown.join(', ')}. ` +
          `이 툴이 받는 인자: ${[...known].join(', ')}. ` +
          '인자를 무시하고 진행하면 걸리지 않은 필터를 걸렸다고 오해하게 되므로 거절한다.',
      );
    }
  }
  return parsed.data;
}

/** 스키마의 최상위 키 집합 — object 가 아니면 undefined(검사 생략) */
function knownKeys(schema: z.ZodTypeAny): Set<string> | undefined {
  const def = (schema as { _def?: { typeName?: string; shape?: () => Record<string, unknown> } })._def;
  if (def?.typeName !== 'ZodObject' || typeof def.shape !== 'function') return undefined;
  return new Set(Object.keys(def.shape()));
}

// ── 조사 스키마 ──────────────────────────────────────────────────

/**
 * 검색 툴 공통 인자 — 이름을 하나로 묶어 두면 모델이 툴을 갈아탈 때 인자를
 * 다시 배우지 않는다. 검색어는 query, 결과 수는 limit, 페이지는 page 다.
 * (백엔드 API 의 q/display/num/start 로의 환산은 각 클라이언트가 맡는다.)
 */
const searchQuery = z.string().min(1).max(300);
const searchPage = z.number().int().min(1).max(5).optional();
const countryCode = z.string().regex(/^[a-z]{2}$/i, 'must be a 2-letter country code, e.g. kr, us').optional();
const langCode = z.string().min(2).max(7).optional();

const serpWebSchema = z.object({
  query: searchQuery,
  gl: countryCode,
  hl: langCode,
  location: z.string().max(120).optional(),
  // 이 엔진은 한 페이지가 10건 고정이다(num 이 구글로 전달되지 않는다 — 실측).
  // 20 을 받아 두면 지킬 수 없는 약속이 되므로 상한을 실제 페이지 크기에 맞춘다
  limit: z.number().int().min(1).max(10).optional(),
  page: searchPage,
  recency: z.enum(['hour', 'day', 'week', 'month', 'year']).optional(),
});

const serpNewsSchema = z.object({
  query: searchQuery,
  gl: countryCode,
  hl: langCode,
  limit: z.number().int().min(1).max(serp.SERP_NEWS_MAX_LIMIT).optional(),
});

const serpNaverSchema = z.object({
  query: searchQuery,
  where: z.enum(['web', 'news', 'image', 'video']).optional(),
  page: searchPage,
  sort: z.enum(['relevance', 'latest', 'oldest']).optional(),
  period: z.enum(serp.SERP_NAVER_PERIODS).optional(),
  limit: z.number().int().min(1).max(serp.SERP_NAVER_MAX_LIMIT).optional(),
});

const serpImageSchema = z.object({
  query: searchQuery,
  gl: countryCode,
  hl: langCode,
  limit: z.number().int().min(1).max(serp.SERP_IMAGE_MAX_LIMIT).optional(),
  page: searchPage,
  size: z.enum(serp.IMAGE_SIZES).optional(),
  aspect: z.enum(serp.IMAGE_ASPECTS).optional(),
  imageType: z.enum(serp.IMAGE_TYPES).optional(),
  license: z.enum(serp.IMAGE_LICENSES).optional(),
  color: z
    .enum(['bw', 'trans', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink', 'white', 'gray', 'black', 'brown'])
    .optional(),
  safe: z.boolean().optional(),
});

const serpTrendingSchema = z.object({
  geo: countryCode,
  hours: z.union([z.literal(4), z.literal(24), z.literal(48), z.literal(168)]).optional(),
  categoryId: z.number().int().min(1).max(30).optional(),
  onlyActive: z.boolean().optional(),
  hl: langCode,
  limit: z.number().int().min(1).max(serp.SERP_TRENDING_MAX_LIMIT).optional(),
});

const naverSearchSchema = z.object({
  query: searchQuery,
  type: z
    .enum(naver.NAVER_SEARCH_TYPES as [string, ...string[]], {
      // 종료된 API 안내를 여기 실어야 모델에게 도달한다. 클라이언트의 같은 안내는
      // zod 가 먼저 자르므로 실행되지 않는다 — 네이버 공식 문서를 읽고 type:"book"
      // 을 보내는 것이 가장 흔한 오호출이라, 그 순간 왜 없는지를 알려줘야 한다.
      errorMap: () => ({
        message:
          `사용 가능: ${naver.NAVER_SEARCH_TYPES.join(' | ')}. ` +
          'book(책)·doc(전문자료)·shop(쇼핑)·movie(영화)는 네이버가 종료한 API 라 ' +
          '공식 문서에 남아 있어도 호출하면 404 다 — 재시도 대신 serp_web_search 로 대체할 것.',
      }),
    })
    .optional(),
  limit: z.number().int().min(1).max(30).optional(),
  // page 는 항목 오프셋이 아니라 페이지다 — 클라이언트가 (page-1)*limit+1 로
  // 환산하며, API start 상한 1000 초과는 환산 후 거절한다(limit 에 따라 달라짐)
  page: z.number().int().min(1).max(1000).optional(),
  sort: z.enum(naver.NAVER_SORTS as [string, ...string[]]).optional(),
  imageSize: z.enum(naver.NAVER_IMAGE_FILTERS).optional(),
});

// ── 공공데이터포털 스키마 ────────────────────────────────────────

const datagoTypeSchema = z.enum(['API', 'FILE']);

const datagoSearchSchema = z.object({
  query: z.string().min(1).max(100),
  type: datagoTypeSchema.optional(),
  page: z.number().int().min(1).max(50).optional(),
  limit: z.number().int().min(1).max(20).optional(),
});

const datagoDetailSchema = z.object({
  publicDataPk: z.string().regex(/^\d+$/, 'publicDataPk is the numeric id from datago_search'),
  type: datagoTypeSchema,
});

const datagoDownloadSchema = z.object({
  publicDataPk: z.string().regex(/^\d+$/),
  publicDataDetailPk: z.string().min(1).max(200),
  saveDir: z
    .string()
    .regex(/^\//, 'saveDir must be an absolute path')
    .optional(),
});

const datagoFileFetchSchema = z.object({
  publicDataPk: z.string().regex(/^\d+$/),
  uddi: z.string().min(1).max(200),
  page: z.number().int().min(1).max(100_000).optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

const datagoApiCallSchema = z.object({
  path: z
    .string()
    .min(1)
    .max(300)
    .regex(/^[\w.\-/]+$/, 'path is the segment after apis.data.go.kr/, e.g. 1360000/VilageFcstInfoService_2.0/getUltraSrtNcst'),
  params: z
    .record(z.union([z.string().max(500), z.number(), z.boolean()]))
    .refine((p) => !Object.keys(p).some((k) => /^servicekey$/i.test(k)), {
      message: 'serviceKey is injected by the server — do not pass it',
    })
    .optional(),
});

// ── SNS 게시 스키마 ──────────────────────────────────────────────

const SNS_PUBLISHED_NOTE = '게시 완료 — 이미 외부에 공개된 상태다. permalink 를 사용자에게 보고할 것.';

const isVideoUrl = (u: string) => /\.(mp4|mov)(\?|#|$)/i.test(u);

/** 채널(브랜드) slug — data/<slug> 규약과 동일. 지정 시 채널 토큰만 사용(기본 토큰 폴백 없음). */
const channelSlugSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,63}$/, 'channel must be a kebab-case slug (same as data/<slug>)')
  .optional();

/**
 * Threads 본문 길이 — 플랫폼은 500자 상한을 세되 **이모지는 UTF-8 바이트로** 센다.
 *
 * JS 의 `.length`(UTF-16 코드 유닛)는 이모지를 2로 세어 플랫폼(대개 4)보다 적게
 * 잡는다. 즉 이 검증을 통과한 캡션이 플랫폼에서 거부될 수 있다. BMP 밖 문자만
 * 실제 UTF-8 바이트 수로 세어 과소 계산을 없앤다 (한글·ASCII 는 그대로 1).
 */
export function threadsTextLength(text: string): number {
  let count = 0;
  for (const ch of text) {
    count += (ch.codePointAt(0) ?? 0) > 0xffff ? Buffer.byteLength(ch, 'utf8') : 1;
  }
  return count;
}

const THREADS_MAX_CHARS = 500;

const threadsPublishSchema = z
  .object({
    caption: z
      .string()
      .min(1)
      .refine((value) => threadsTextLength(value) <= THREADS_MAX_CHARS, (value) => ({
        message: `THREADS caption must be ≤${THREADS_MAX_CHARS} chars (got ${threadsTextLength(value)} — 이모지는 UTF-8 바이트로 계산된다)`,
      })),
    imageUrl: z.string().url().optional(),
    linkUrl: z.string().url().optional(),
    replyToId: z.string().min(1).optional(),
    channel: channelSlugSchema,
  })
  .superRefine((v, ctx) => {
    // link_attachment 는 media_type=TEXT 전용 — 이미지와 같이 보내면 플랫폼이 거부한다
    if (v.linkUrl && v.imageUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['linkUrl'],
        message: 'linkUrl is for text-only posts (mutually exclusive with imageUrl)',
      });
    }
  });

const instagramPublishSchema = z
  .object({
    caption: z.string().min(1).max(2200, 'INSTAGRAM caption must be ≤2200 chars'),
    imageUrls: z.array(z.string().url()).min(1).max(10).optional(),
    videoUrl: z.string().url().optional(),
    channel: channelSlugSchema,
  })
  .superRefine((v, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
    if (!v.imageUrls && !v.videoUrl) issue('imageUrls', 'INSTAGRAM requires imageUrls (1-10) or videoUrl (reel)');
    if (v.imageUrls && v.videoUrl) issue('videoUrl', 'imageUrls and videoUrl are mutually exclusive');
    if (v.videoUrl && !isVideoUrl(v.videoUrl)) issue('videoUrl', 'videoUrl must be a .mp4/.mov URL');
  });

const facebookPublishSchema = z
  .object({
    caption: z.string().min(1).max(5000),
    imageUrls: z.array(z.string().url()).min(1).max(10).optional(),
    videoUrl: z.string().url().optional(),
    captionFilePath: z.string().min(1).optional(),
    captionLocale: z
      .string()
      .regex(/^[a-z]{2}_[A-Z]{2}$/, 'captionLocale must look like ko_KR / en_US / vi_VN')
      .optional(),
    linkUrl: z.string().url().optional(),
    channel: channelSlugSchema,
  })
  .superRefine((v, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
    if (v.imageUrls && v.videoUrl) issue('videoUrl', 'imageUrls and videoUrl are mutually exclusive');
    if (v.videoUrl && !isVideoUrl(v.videoUrl)) issue('videoUrl', 'videoUrl must be a .mp4/.mov URL');
    if (v.linkUrl && (v.imageUrls || v.videoUrl)) issue('linkUrl', 'linkUrl is for text-only posts (no media)');
    // 자막은 영상에만 붙는다 — 이미지·텍스트 게시에 딸려 오면 조용히 버려지므로 여기서 막는다
    if (v.captionFilePath && !v.videoUrl) issue('captionFilePath', 'captionFilePath requires videoUrl');
    if (v.captionLocale && !v.captionFilePath) issue('captionLocale', 'captionLocale requires captionFilePath');
  });

const facebookCommentSchema = z.object({
  postId: z.string().min(1),
  message: z.string().min(1).max(8000, 'FACEBOOK comment must be ≤8000 chars'),
  channel: channelSlugSchema,
});

/** YouTube description 은 5000 **바이트** 상한이다. 한국어는 글자당 3바이트다. */
const YT_DESCRIPTION_MAX_BYTES = 5000;
const ytDescription = z
  .string()
  .min(1)
  .refine((v) => Buffer.byteLength(v, 'utf8') <= YT_DESCRIPTION_MAX_BYTES, (v) => ({
    message:
      `설명이 ${Buffer.byteLength(v, 'utf8')}바이트다 — YouTube 상한은 ${YT_DESCRIPTION_MAX_BYTES}바이트다(글자 수가 아니다). ` +
      `한국어는 글자당 3바이트라 실효 한도가 약 ${Math.floor(YT_DESCRIPTION_MAX_BYTES / 3)}자다.`,
  }));

const youtubePublishSchema = z.object({
  videoFilePath: z.string().min(1),
  title: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[^<>]*$/, 'YouTube rejects angle brackets in titles'),
  // YouTube 는 description 을 **바이트**로 잰다(5000 bytes) — 글자가 아니다.
  // z.string().max(5000) 은 UTF-16 코드 단위를 세므로 한국어 5000자를 통과시키는데
  // 그게 15,000바이트라 API 가 거절한다. 롱폼은 챕터 목록까지 실어 설명이 가장
  // 길어지는 경로라 여기서 막는다 — 업로드를 다 태운 뒤 400 을 받으면 쿼터가 날아간다.
  caption: ytDescription,
  privacyStatus: z.enum(['public', 'unlisted', 'private']).optional(),
  // 썸네일은 필수다 — 미지정 업로드는 임의 프레임이 커버가 되고, 게시 후에는
  // 쇼츠 세로 표면을 API 로 되돌릴 수 없다(2026-08-13 사용자 지시로 강제).
  thumbnailFilePath: z.string().min(1),
  captionFilePath: z.string().min(1).optional(),
  captionLanguage: z
    .string()
    .regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/, 'captionLanguage is a BCP-47 tag, e.g. ko / en / vi / zh-Hant')
    .optional(),
  categoryId: z
    .string()
    .regex(/^\d{1,3}$/, 'categoryId is a numeric YouTube category id, e.g. 22 (People & Blogs)')
    .optional(),
  madeForKids: z.boolean().optional(),
  containsSyntheticMedia: z.boolean().optional(),
  channel: channelSlugSchema,
});

// ── 받은 댓글 관리 스키마 (인박스는 읽기 전용, 답글·숨김은 즉시 공개) ─────

const commentPlatform = z.enum(['THREADS', 'INSTAGRAM', 'FACEBOOK', 'YOUTUBE']);

/**
 * 숨김·좋아요 대상 플랫폼 — YouTube 는 제외한다. API 가 주는 것은 의미가 다른
 * 검토 보류/거부(setModerationStatus)뿐이라 "되돌릴 수 있는 숨김"으로 매핑할 수 없다.
 */
const moderatePlatform = z.enum(['THREADS', 'INSTAGRAM', 'FACEBOOK']);

/** 플랫폼별 답글 길이 상한 — 게시 본문 상한과 같다(플랫폼 하드 리밋). */
const REPLY_MAX_CHARS = { THREADS: 500, INSTAGRAM: 2200, FACEBOOK: 8000, YOUTUBE: 10_000 } as const;

const commentInboxSchema = z.object({
  platforms: z.array(commentPlatform).min(1).optional(),
  channel: channelSlugSchema,
  postLimit: z.number().int().min(1).max(25).optional(),
  commentLimit: z.number().int().min(1).max(100).optional(),
  sinceHours: z.number().min(0.1).max(720).optional(),
  includeAnswered: z.boolean().optional(),
  includeOwn: z.boolean().optional(),
});

const commentReplySchema = z
  .object({
    platform: commentPlatform,
    commentId: z.string().min(1),
    message: z.string().min(1),
    channel: channelSlugSchema,
  })
  .superRefine((v, ctx) => {
    const max = REPLY_MAX_CHARS[v.platform];
    // THREADS 는 게시 본문과 같은 이모지 바이트 규칙을 쓴다 (답글 = 새 게시물)
    const length = v.platform === 'THREADS' ? threadsTextLength(v.message) : v.message.length;
    if (length > max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['message'],
        message: `${v.platform} reply must be ≤${max} chars (got ${length})`,
      });
    }
  });

const commentModerateSchema = z.object({
  platform: moderatePlatform,
  commentId: z.string().min(1),
  action: z.enum(['hide', 'unhide', 'like', 'unlike']),
  channel: channelSlugSchema,
});

const accountCheckSchema = z.object({
  channel: channelSlugSchema,
});

// ── Threads 성장 조회 스키마 (읽기 전용) ─────────────────────────

const threadsInsightsSchema = z.object({
  days: z.number().int().min(1).max(90).optional(),
  postLimit: z.number().int().min(0).max(25).optional(),
  channel: channelSlugSchema,
});

const threadsSearchSchema = z.object({
  query: z.string().min(1).max(200),
  searchType: z.enum(['TOP', 'RECENT']).optional(),
  searchMode: z.enum(['KEYWORD', 'TAG']).optional(),
  sinceHours: z.number().min(0.5).max(720).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  channel: channelSlugSchema,
});

// ── Instagram 성장 조회 스키마 (읽기 전용) ───────────────────────

const instagramInsightsSchema = z.object({
  days: z.number().int().min(1).max(90).optional(),
  mediaLimit: z.number().int().min(0).max(25).optional(),
  channel: channelSlugSchema,
});

// ── YouTube 성장 조회 스키마 (읽기 전용) ─────────────────────────

const youtubeUpdateSchema = z.object({
  videoId: z.string().min(1),
  privacyStatus: z.enum(['public', 'unlisted', 'private']).optional(),
  title: z.string().max(100).optional(),
  description: ytDescription.optional(),
  categoryId: z.string().optional(),
  madeForKids: z.boolean().optional(),
  containsSyntheticMedia: z.boolean().optional(),
  publishAt: z.string().optional(),
  dryRun: z.boolean().optional(),
  channel: channelSlugSchema,
});

const youtubeInsightsSchema = z.object({
  days: z.number().int().min(1).max(365).optional(),
  videoLimit: z.number().int().min(0).max(50).optional(),
  includeRevenue: z.boolean().optional(),
  channel: channelSlugSchema,
});

const contentFeedbackSchema = z.object({
  channel: channelSlugSchema,
  limit: z.number().int().min(1).max(10).optional(),
  days: z.number().int().min(7).max(365).optional(),
  outputPath: z.string().min(1).max(500).optional(),
});

const youtubeTopicScoutSchema = z.object({
  query: searchQuery,
  extraQueries: z.array(z.string().min(1).max(300)).max(3).optional(),
  channel: channelSlugSchema,
  excludeChannelId: z.string().min(2).max(40).optional(),
  regionCode: z.string().regex(/^[a-z]{2}$/i, 'must be a 2-letter region code, e.g. US').optional(),
  language: z.string().min(2).max(7).optional(),
  publishedAfterDays: z.number().int().min(7).max(365).optional(),
  channelLimit: z.number().int().min(5).max(40).optional(),
  videosPerChannel: z.number().int().min(5).max(30).optional(),
  minMultiplier: z.number().min(1.5).max(100).optional(),
  minViews: z.number().int().min(0).max(10_000_000).optional(),
  duration: z.enum(['short', 'any']).optional(),
  includeComments: z.boolean().optional(),
  limit: z.number().int().min(3).max(30).optional(),
});

const snsIssueScoutSchema = z.object({
  query: searchQuery,
  extraQueries: z.array(z.string().min(1).max(300)).max(3).optional(),
  platforms: z.array(z.enum(snsScout.SNS_SCOUT_PLATFORMS)).min(1).max(3).optional(),
  recency: z.enum(snsScout.SNS_SCOUT_RECENCIES).optional(),
  gl: countryCode,
  hl: langCode,
  pagesPerQuery: z.number().int().min(1).max(snsScout.MAX_SNS_PAGES_PER_QUERY).optional(),
  includeTrending: z.boolean().optional(),
  trendingHours: z.union([z.literal(4), z.literal(24), z.literal(48), z.literal(168)]).optional(),
  limit: z.number().int().min(3).max(30).optional(),
});

// ── 라우팅 ───────────────────────────────────────────────────────

export const ROUTES: Record<string, (args: unknown) => Promise<ToolResult>> = {
  serp_web_search: async (args) => {
    const result = await serp.webSearch(parseArgs(serpWebSchema, args));
    return text(result.text, result.isError);
  },
  serp_news_search: async (args) => {
    const result = await serp.newsSearch(parseArgs(serpNewsSchema, args));
    return text(result.text, result.isError);
  },
  serp_naver_search: async (args) => {
    const result = await serp.naverSearch(parseArgs(serpNaverSchema, args));
    return text(result.text, result.isError);
  },
  serp_image_search: async (args) => {
    const result = await serp.imageSearch(parseArgs(serpImageSchema, args));
    return text(result.text, result.isError);
  },
  serp_trending_now: async (args) => {
    const result = await serp.trendingNow(parseArgs(serpTrendingSchema, args));
    return text(result.text, result.isError);
  },
  naver_search: async (args) => {
    const result = await naver.naverSearch(parseArgs(naverSearchSchema, args) as naver.NaverSearchInput);
    return text(result.text, result.isError);
  },

  // ── 공공데이터포털 (검색·상세·다운로드는 무인증 / fetch·api_call 은 키+활용신청) ──
  datago_search: async (args) => {
    const result = await datago.searchDatasets(parseArgs(datagoSearchSchema, args));
    return text(result.text, result.isError);
  },
  datago_detail: async (args) => {
    const result = await datago.datasetDetail(parseArgs(datagoDetailSchema, args));
    return text(result.text, result.isError);
  },
  datago_file_download: async (args) => {
    const result = await datago.downloadFile(parseArgs(datagoDownloadSchema, args));
    return text(result.text, result.isError);
  },
  datago_file_fetch: async (args) => {
    const result = await datago.fetchFileRows(parseArgs(datagoFileFetchSchema, args));
    return text(result.text, result.isError);
  },
  datago_api_call: async (args) => {
    const result = await datago.callOpenApi(parseArgs(datagoApiCallSchema, args));
    return text(result.text, result.isError);
  },

  // ── 이미지 생성 (OpenAI GPT Image) — base64 이미지 블록 + 요약 텍스트 반환 ──
  gpt_image_text2img: async (args) => {
    const request = parseArgs(image.text2ImageSchema, args);
    const result = await image.generateFromText(request);
    if (!result.success || !result.base64) {
      return text(`Image generation failed: ${result.error}`, true);
    }
    let summary = `Image generated successfully\n\nModel: ${result.model}\nSize: ${result.size ?? 'auto'}\nQuality: ${result.quality ?? 'auto'}\nMIME Type: ${result.mimeType}\nPrompt: ${result.prompt}`;
    if (result.revisedPrompt) summary += `\nRevised Prompt: ${result.revisedPrompt}`;
    if (request.savePath) {
      try {
        const saved = await saveBase64Image(result.base64, request.savePath);
        summary += `\nSaved to: ${saved.filePath} (${formatFileSize(saved.size)})`;
      } catch (saveError) {
        summary += `\nFile save failed: ${formatError(saveError)}`;
      }
    }
    return imageResult(summary, result.base64, result.mimeType);
  },
  gpt_image_img2img: async (args) => {
    const request = parseArgs(image.img2ImgSchema, args);
    const result = await image.generateFromImage(request);
    if (!result.success || !result.base64) {
      return text(`Image editing failed: ${result.error}`, true);
    }
    let summary = `Image edited successfully\n\nModel: ${result.model}\nSize: ${result.size ?? 'auto'}\nQuality: ${result.quality ?? 'auto'}\nReference Images: ${request.sourceImagesBase64.length}\nMask: ${request.maskBase64 ? 'yes' : 'no'}\nInput Fidelity: ${request.inputFidelity ?? 'default'}\nMIME Type: ${result.mimeType}\nPrompt: ${result.prompt}`;
    if (result.revisedPrompt) summary += `\nRevised Prompt: ${result.revisedPrompt}`;
    if (request.savePath) {
      try {
        const saved = await saveBase64Image(result.base64, request.savePath);
        summary += `\nSaved to: ${saved.filePath} (${formatFileSize(saved.size)})`;
      } catch (saveError) {
        summary += `\nFile save failed: ${formatError(saveError)}`;
      }
    }
    return imageResult(summary, result.base64, result.mimeType);
  },
  // 로컬 생성(Z-Image Turbo) — 서브프로세스로 온디바이스 실행. 키·네트워크·과금 없음.
  // gpt_image 와 달리 base64 블록을 싣지 않는다 — 이 툴은 항상 로컬 파일을 쓰므로
  // 호출자는 경로로 읽으면 되고, 9:16 PNG 를 base64 로 반향하면 컨텍스트만 태운다.
  image_local_generate: async (args) => {
    const request = parseArgs(zimage.zimageGenerateSchema, args);
    const result = await zimage.generateLocalImage(request);
    if (!result.success) return text(`Local image generation failed: ${result.error}`, true);
    return text(
      `Image generated locally!\n\nFile: ${result.imagePath}\nEngine: Z-Image Turbo via mflux (on-device)\n` +
        `Size: ${result.width}x${result.height}\nSteps: ${result.steps}\nSeed: ${result.seed ?? 'random'}\n` +
        `Quantization: ${result.quantize}-bit\nGeneration time: ${result.elapsedSeconds}s`,
    );
  },

  // ── 영상 생성 (Veo 3.1) — mp4 로컬 저장 후 경로·메타 텍스트 반환 ──
  veo_text2video: async (args) => {
    const result = await video.generateFromText(parseArgs(video.text2VideoSchema, args));
    if (!result.success) return text(`Video generation failed: ${result.error}`, true);
    return text(
      `Video generated successfully!\n\nFile: ${result.videoPath}\nModel: ${result.model}\nAspect Ratio: ${result.aspectRatio}\nResolution: ${result.resolution}\nDuration: ${result.duration} seconds\nPrompt: ${result.prompt}`,
    );
  },
  veo_img2video: async (args) => {
    const result = await video.generateFromImage(parseArgs(video.img2VideoSchema, args));
    if (!result.success) return text(`Video generation from image failed: ${result.error}`, true);
    const lastImageInfo = result.lastImage ? `\nLast Frame Image: ${result.lastImage}` : '';
    const modeInfo = result.lastImage ? ' (frame interpolation mode)' : '';
    return text(
      `Video generated from image${modeInfo} successfully!\n\nOutput: ${result.videoPath}\nFirst Frame Image: ${result.sourceImage}${lastImageInfo}\nModel: ${result.model}\nAspect Ratio: ${result.aspectRatio}\nResolution: ${result.resolution}\nDuration: ${result.duration} seconds\nPrompt: ${result.prompt}`,
    );
  },
  veo_extension: async (args) => {
    const result = await video.extendVideo(parseArgs(video.videoExtensionSchema, args));
    if (!result.success) return text(`Video extension failed: ${result.error}`, true);
    return text(
      `Video extended successfully!\n\nOutput: ${result.videoPath}\nSource Video: ${result.sourceVideo}\nModel: ${result.model}\nResolution: ${result.resolution}\nAdded Duration: +${result.duration} seconds\nPrompt: ${result.prompt}`,
    );
  },
  veo_reference: async (args) => {
    const result = await video.generateWithReferences(parseArgs(video.referenceVideoSchema, args));
    if (!result.success) return text(`Video generation with references failed: ${result.error}`, true);
    const refImagesInfo = result.referenceImages?.join('\n  - ') || '';
    return text(
      `Video generated with reference images successfully!\n\nOutput: ${result.videoPath}\nReference Images (${result.referenceImages?.length || 0}):\n  - ${refImagesInfo}\nModel: ${result.model}\nAspect Ratio: ${result.aspectRatio}\nResolution: ${result.resolution}\nDuration: ${result.duration} seconds\nPrompt: ${result.prompt}`,
    );
  },

  // ── 영상 생성 (Seedance) — mp4 로컬 저장 후 경로·메타 텍스트 반환 ──
  // 과금 토큰(completionTokens)을 함께 돌려준다 — 예상 단가 환산이 아니라 이
  // 값이 벤더 청구 기준이라, 회차 비용 집계는 이쪽을 적어야 맞는다.
  seedance_text2video: async (args) => {
    const result = await seedance.generateFromText(parseArgs(seedance.seedanceText2VideoSchema, args));
    if (!result.success) return text(`Seedance video generation failed: ${result.error}`, true);
    return text(`Video generated successfully!\n\nFile: ${result.videoPath}\n${seedanceMeta(result)}\nPrompt: ${result.prompt}`);
  },
  seedance_img2video: async (args) => {
    const result = await seedance.generateFromImage(parseArgs(seedance.seedanceImg2VideoSchema, args));
    if (!result.success) return text(`Seedance video generation from image failed: ${result.error}`, true);
    const lastImageInfo = result.lastImage ? `\nLast Frame Image: ${result.lastImage}` : '';
    const modeInfo = result.lastImage ? ' (frame interpolation mode)' : '';
    return text(
      `Video generated from image${modeInfo} successfully!\n\nOutput: ${result.videoPath}\nFirst Frame Image: ${result.sourceImage}${lastImageInfo}\n${seedanceMeta(result)}\nPrompt: ${result.prompt}`,
    );
  },
  seedance_reference: async (args) => {
    const result = await seedance.generateWithReferences(parseArgs(seedance.seedanceReferenceSchema, args));
    if (!result.success) return text(`Seedance video generation with references failed: ${result.error}`, true);
    const refImagesInfo = result.referenceImages?.join('\n  - ') || '';
    return text(
      `Video generated with reference images successfully!\n\nOutput: ${result.videoPath}\nReference Images (${result.referenceImages?.length || 0}):\n  - ${refImagesInfo}\n${seedanceMeta(result)}\nPrompt: ${result.prompt}`,
    );
  },

  // ── 음성 합성 (Gemini TTS) — wav 로컬 저장 후 경로·메타 텍스트 반환 ──
  // 대본 전문이 아니라 길이만 돌려준다 — 16k 자 대본을 그대로 반향하면
  // 호출자 컨텍스트만 태우고, 이미 자기가 보낸 문자열이라 정보가 없다.
  tts_generate: async (args) => {
    const request = parseArgs(tts.ttsGenerateSchema, args);
    const result = await tts.generateSpeech(request);
    if (!result.success) return text(`TTS generation failed: ${result.error}`, true);
    const style = request.stylePrompt ? `\nStyle: ${request.stylePrompt}` : '';
    return text(
      `Audio generated successfully!\n\nFile: ${result.audioPath}\nVoice: ${result.voiceName}\nModel: ${result.model}\nTemperature: ${request.temperature}${style}\nText length: ${request.text.length} chars`,
    );
  },
  tts_multi_speaker: async (args) => {
    const request = parseArgs(tts.ttsMultiSpeakerSchema, args);
    const result = await tts.generateDialogue(request);
    if (!result.success) return text(`Multi-speaker TTS generation failed: ${result.error}`, true);
    const speakerInfo = request.speakers.map((s) => `  - ${s.speakerName}: ${s.voiceName}`).join('\n');
    return text(
      `Multi-speaker audio generated successfully!\n\nFile: ${result.audioPath}\nModel: ${result.model}\nSpeakers:\n${speakerInfo}\nScript length: ${request.script.length} chars`,
    );
  },
  // 로컬 합성(Supertonic) — 서브프로세스로 온디바이스 실행. 키·네트워크·쿼터 없음.
  tts_local_generate: async (args) => {
    const request = parseArgs(supertonic.supertonicGenerateSchema, args);
    const result = await supertonic.generateLocalSpeech(request);
    if (!result.success) return text(`Local TTS generation failed: ${result.error}`, true);
    return text(
      `Audio generated locally!\n\nFile: ${result.audioPath}\nEngine: Supertonic 3 (on-device)\n` +
        `Voice: ${result.voice}\nLanguage: ${result.lang}\nSpeed: ${request.speed}\n` +
        `Duration: ${result.durationSeconds}s\nSample rate: ${result.sampleRate} Hz\n` +
        `Synthesis time: ${result.elapsedSeconds}s\nText length: ${request.text.length} chars`,
    );
  },
  tts_list_voices: async () => {
    const voiceList = Object.entries(tts.TTS_VOICES)
      .map(([voice, characteristic]) => `  - ${voice}: ${characteristic}`)
      .join('\n');
    return text(
      `Gemini TTS — ${tts.TTS_VOICE_NAMES.length} voices (tts_generate / tts_multi_speaker):\n\n${voiceList}\n\n` +
        `Tips for choosing a voice:\n` +
        `- For professional/business: Kore, Charon, Rasalgethi, Alnilam\n` +
        `- For friendly/casual: Achird, Puck, Zubenelgenubi, Sulafat\n` +
        `- For calm/gentle: Achernar, Vindemiatrix, Umbriel\n` +
        `- For energetic/lively: Fenrir, Sadachbia, Laomedeia\n` +
        `- For clear narration: Iapetus, Erinome, Schedar\n\n` +
        `Supertonic 3 — ${supertonic.SUPERTONIC_VOICE_NAMES.length} voices, on-device (tts_local_generate):\n\n` +
        `  ${supertonic.SUPERTONIC_VOICE_NAMES.join(', ')}\n` +
        `  F1–F5 는 여성, M1–M5 는 남성이라는 것 외에 공급사가 공개한 성격 라벨은 없다.\n` +
        `  들어보고 고를 것 — 같은 문장을 두세 개 보이스로 뽑아 비교하면 된다.\n\n` +
        `엔진 선택: 나레이션 본문·긴 대본은 tts_local_generate(비용 0, 실시간 6.3배), ` +
        `연기가 필요한 짧은 컷은 tts_generate(stylePrompt 가 있는 쪽은 여기뿐).\n` +
        `채널 프로파일(data/<slug>/profile.md)에 보이스가 지정돼 있으면 그 값을 그대로 쓸 것 — ` +
        `회차마다 목소리가 바뀌면 채널 정체성이 깨진다.`,
    );
  },

  // ── 음악 생성 (Lyria) — 30초 배치 클립 / 길이 지정 스트리밍 ──
  music_generate_clip: async (args) => {
    const result = await music.generateClip(parseArgs(music.musicClipSchema, args));
    if (!result.success) return text(`Clip music generation failed: ${result.error}`, true);
    return text(
      `Music clip generated successfully!\n\nFile: ${result.audioPath}\nModel: ${result.model}\nDuration: 30 seconds (fixed)\nPrompt: ${result.prompt}\n\n` +
        `44.1kHz stereo MP3. Lyria 3 는 비결정론적이다 — 재사용할 BGM 이면 이 파일을 에셋으로 보관할 것(같은 프롬프트로 같은 곡이 다시 나오지 않는다).`,
    );
  },
  music_generate: async (args) => {
    const request = parseArgs(music.musicGenerateSchema, args);
    const result = await music.generateSimple(request);
    if (!result.success) return text(`Music generation failed: ${result.error}`, true);
    const settings = [
      request.genre && `genre: ${request.genre}`,
      request.mood && `mood: ${request.mood}`,
      request.instruments?.length && `instruments: ${request.instruments.join(', ')}`,
      request.bpm && `bpm: ${request.bpm}`,
    ].filter(Boolean);
    const settingsInfo = settings.length > 0 ? `\nSettings: ${settings.join(', ')}` : '';
    return text(
      `Music generated successfully!\n\nFile: ${result.audioPath}\nModel: ${result.model}\nDuration: ${result.durationSeconds} seconds\nPrompt: ${result.prompt}${settingsInfo}\n\n48kHz stereo 16-bit WAV.`,
    );
  },
  music_generate_advanced: async (args) => {
    const request = parseArgs(music.musicAdvancedSchema, args);
    const result = await music.generateAdvanced(request);
    if (!result.success) return text(`Advanced music generation failed: ${result.error}`, true);
    const promptInfo = request.prompts.map((p) => `  - "${p.text}" (weight: ${p.weight ?? 1.0})`).join('\n');
    const configInfo = request.config
      ? `\nConfig: ${Object.entries(request.config)
          .filter(([, value]) => value !== undefined)
          .map(([key, value]) => `${key}: ${value}`)
          .join(', ')}`
      : '';
    return text(
      `Advanced music generated successfully!\n\nFile: ${result.audioPath}\nModel: ${result.model}\nDuration: ${result.durationSeconds} seconds\n\nWeighted Prompts:\n${promptInfo}${configInfo}\n\n48kHz stereo 16-bit WAV.`,
    );
  },
  music_list_options: async () => {
    const bullets = (items: readonly string[]) => items.map((item) => `  - ${item}`).join('\n');
    return text(
      `Suggested Music Generation Options (non-exhaustive — free text is accepted everywhere):\n\n` +
        `GENRES (${music.MUSIC_GENRES.length} suggestions):\n${bullets(music.MUSIC_GENRES)}\n\n` +
        `MOODS (${music.MUSIC_MOODS.length} suggestions):\n${bullets(music.MUSIC_MOODS)}\n\n` +
        `INSTRUMENTS (${music.MUSIC_INSTRUMENTS.length} suggestions):\n${bullets(music.MUSIC_INSTRUMENTS)}\n\n` +
        `TIPS for better results:\n` +
        `- Combine genre + mood for more specific output (e.g., "calm jazz", "energetic techno")\n` +
        `- Specify instruments for desired sound palette\n` +
        `- Use BPM to control tempo (60=slow, 120=moderate, 180=fast)\n` +
        `- For 30s short-form BGM, prefer music_generate_clip (Lyria 3 — describe BPM/key/mood in the prompt)\n` +
        `- For exact durations (5-300s), use music_generate (Lyria RealTime)\n` +
        `- For BGM under narration, ask for space in the vocal frequency range\n\n` +
        `ADVANCED CONTROLS (music_generate_advanced):\n` +
        `- guidance (0-6): How closely to follow the prompt (higher = more faithful)\n` +
        `- density (0-1): Note density (0=sparse, 1=dense)\n` +
        `- brightness (0-1): Tonal brightness (0=dark, 1=bright)\n` +
        `- temperature (0-3, model default 1.1): Creativity level (higher = more experimental)\n` +
        `- scale: Musical key (e.g., C_MAJOR_A_MINOR — each value covers a major key and its relative minor)\n` +
        `- topK (1-1000, model default 40): Sampling constraint\n` +
        `- seed (0-2147483647): Reproducibility — the ONLY way to regenerate the same music\n` +
        `- muteBass/muteDrums/onlyBassAndDrums: Rhythm section control\n` +
        `- musicGenerationMode: QUALITY (default) | DIVERSITY | VOCALIZATION`,
    );
  },

  // ── 자사 SNS 직접 게시 (플랫폼별 툴 — 즉시 공개, HITL 승인 후 호출) ──
  threads_publish: async (args) => {
    const input = parseArgs(threadsPublishSchema, args);
    return fromApi(await sns.publishThreads(input), SNS_PUBLISHED_NOTE);
  },
  instagram_publish: async (args) => {
    const input = parseArgs(instagramPublishSchema, args);
    return fromApi(
      await sns.publishInstagram(
        input.videoUrl
          ? { caption: input.caption, videoUrl: input.videoUrl, channel: input.channel }
          : { caption: input.caption, imageUrls: input.imageUrls, channel: input.channel },
      ),
      SNS_PUBLISHED_NOTE,
    );
  },
  facebook_publish: async (args) => {
    const input = parseArgs(facebookPublishSchema, args);
    return fromApi(
      await sns.publishFacebook(
        input.videoUrl
          ? {
              caption: input.caption,
              videoUrl: input.videoUrl,
              captionFilePath: input.captionFilePath,
              captionLocale: input.captionLocale,
              channel: input.channel,
            }
          : { caption: input.caption, imageUrls: input.imageUrls, linkUrl: input.linkUrl, channel: input.channel },
      ),
      SNS_PUBLISHED_NOTE,
    );
  },
  facebook_comment: async (args) => {
    const input = parseArgs(facebookCommentSchema, args);
    return fromApi(await sns.commentFacebook(input), SNS_PUBLISHED_NOTE);
  },
  youtube_publish: async (args) => {
    const input = parseArgs(youtubePublishSchema, args);
    return fromApi(
      await sns.publishYoutube({
        videoFilePath: input.videoFilePath,
        title: input.title,
        description: input.caption,
        privacyStatus: input.privacyStatus,
        thumbnailFilePath: input.thumbnailFilePath,
        captionFilePath: input.captionFilePath,
        captionLanguage: input.captionLanguage,
        categoryId: input.categoryId,
        madeForKids: input.madeForKids,
        containsSyntheticMedia: input.containsSyntheticMedia,
        channel: input.channel,
      }),
      SNS_PUBLISHED_NOTE,
    );
  },
  youtube_update: async (args) => {
    const input = parseArgs(youtubeUpdateSchema, args);
    // dryRun 은 아무것도 안 바꾸므로 게시 주의 문구를 붙이지 않는다.
    return fromApi(await sns.youtubeUpdate(input), input.dryRun ? undefined : SNS_PUBLISHED_NOTE);
  },
  youtube_insights: async (args) => {
    const input = parseArgs(youtubeInsightsSchema, args);
    return fromApi(await sns.youtubeInsights(input));
  },

  // ── Instagram 성장 조회 (읽기 전용 — grow-instagram 스킬이 틱마다 호출) ──
  instagram_insights: async (args) => {
    const input = parseArgs(instagramInsightsSchema, args);
    return fromApi(await sns.instagramInsights(input));
  },
  content_feedback: async (args) => {
    const input = parseArgs(contentFeedbackSchema, args);
    return fromApi(await contentFeedback(input));
  },
  youtube_topic_scout: async (args) => {
    const input = parseArgs(youtubeTopicScoutSchema, args);
    return fromApi(await youtubeTopicScout(input));
  },
  sns_issue_scout: async (args) => {
    const input = parseArgs(snsIssueScoutSchema, args);
    return fromApi(await snsScout.snsIssueScout(input));
  },
  sns_account_check: async (args) => {
    const input = parseArgs(accountCheckSchema, args);
    return fromApi(await sns.checkAccounts(input.channel));
  },

  // ── 받은 댓글 관리 (인박스는 읽기 전용, 답글·숨김은 즉시 공개) ──
  sns_comment_inbox: async (args) => {
    const input = parseArgs(commentInboxSchema, args);
    return fromApi(await sns.commentInbox(input));
  },
  sns_comment_reply: async (args) => {
    const input = parseArgs(commentReplySchema, args);
    return fromApi(await sns.replyToComment(input), SNS_PUBLISHED_NOTE);
  },
  sns_comment_moderate: async (args) => {
    const input = parseArgs(commentModerateSchema, args);
    return fromApi(await sns.moderateComment(input), '모더레이션 반영 완료 — 이미 플랫폼에 적용된 상태다.');
  },

  // ── Threads 성장 조회 (읽기 전용 — grow-threads 스킬이 틱마다 호출) ──
  threads_insights: async (args) => {
    const input = parseArgs(threadsInsightsSchema, args);
    return fromApi(await sns.threadsInsights(input));
  },
  threads_search: async (args) => {
    const input = parseArgs(threadsSearchSchema, args);
    return fromApi(await sns.threadsKeywordSearch(input));
  },
};
