import { z } from 'zod';
import * as datago from './datago-client.js';
import * as elevenlabs from './elevenlabs-client.js';
import * as image from './image-client.js';
import * as music from './music-client.js';
import * as qwen3asr from './qwen3-asr-client.js';
import * as suno from './suno-client.js';
import * as naver from './naver-client.js';
import * as seedance from './seedance-client.js';
import * as serp from './serp-client.js';
import * as sns from './sns-client.js';
import * as supertonic from './supertonic-client.js';
import * as zimage from './zimage-client.js';
import * as mlx from './mlx-serve-client.js';
import * as tts from './tts-client.js';
import * as video from './video-client.js';
import { contentFeedback } from './content-feedback.js';
import { youtubeTopicScout } from './youtube-topic-scout.js';
import * as snsScout from './sns-issue-scout.js';
import { formatError, formatFileSize, saveBase64Image } from './media-utils.js';
import type { ApiResult } from './http.js';
import { renderCapabilityStatus } from './capability-status.js';

/** MCP content blocks — generated images are also returned as base64 image blocks. */
export type ToolContent =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string };

export interface ToolResult {
  [key: string]: unknown;
  content: ToolContent[];
  /** Only set on successful responses of tools that declare outputSchema (MCP: schema conformance is a MUST). */
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

function text(message: string, isError = false): ToolResult {
  return { content: [{ type: 'text', text: message }], isError };
}

/** Generated-image response — base64 image block + summary text block (contract inherited from fect-mcp). */
function imageResult(message: string, base64Data: string, mimeType: string): ToolResult {
  return {
    content: [
      { type: 'image', data: base64Data, mimeType },
      { type: 'text', text: message },
    ],
  };
}

/**
 * Common meta lines for Seedance results — all three tools report in the same format.
 *
 * The token count is included because it IS the bill. An estimate converted from a
 * price sheet silently drifts when the vendor changes rates, but completion_tokens
 * is measured on every call.
 */
/** Format footnote for ElevenLabs results — the builder cares about RIFF vs not. */
function elevenlabsFormatNote(format: string | undefined): string {
  if (!format) return '';
  return format.startsWith('wav_')
    ? ` (mono 16-bit WAV ${Number(format.split('_')[1]) / 1000}kHz — RIFF, builder-ready)`
    : ' (mp3 — not for build-reel.sh narration input)';
}

/** Common meta lines for ElevenLabs results — duration, the measured bill, trace id, alignment sidecar. */
function elevenlabsMeta(result: {
  durationSeconds?: number;
  speechEndSeconds?: number;
  characterCost?: number;
  requestId?: string;
  latencyMs?: number;
  alignmentPath?: string;
  alignedCharacters?: number;
}): string {
  return (
    (result.durationSeconds !== undefined ? `Duration: ${result.durationSeconds}s\n` : '') +
    (result.characterCost !== undefined ? `Character cost: ${result.characterCost} (vendor-metered characters — the billing quantity; log this ÷ 1000 in the cost ledger)\n` : '') +
    (result.latencyMs !== undefined ? `Vendor latency: ${result.latencyMs} ms\n` : '') +
    (result.requestId ? `Request ID: ${result.requestId}\n` : '') +
    (result.alignmentPath
      ? `Alignment: ${result.alignmentPath} (${result.alignedCharacters ?? '?'} characters` +
        `${result.speechEndSeconds !== undefined ? `, speech ends at ${result.speechEndSeconds}s` : ''})\n`
      : '')
  );
}

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
      : `\nBilled tokens: ${result.completionTokens.toLocaleString('en-US')} (completion_tokens — what the vendor bills on)`;
  return `Model: ${result.model}\nRatio: ${result.ratio}\nResolution: ${result.resolution}\nDuration: ${result.duration} seconds${tokens}\nTask ID: ${result.taskId}`;
}

/**
 * Platform API result → MCP tool result.
 *
 * On success, if the body is a JSON object it also goes into structuredContent to
 * satisfy the outputSchema contract (the spec recommends carrying the serialized
 * JSON in a text block as well). On failure structuredContent stays empty — the
 * failure body is the platform's raw error, which doesn't satisfy our schema,
 * and isError already marks it.
 */
function fromApi(result: ApiResult, note?: string): ToolResult {
  if (!result.ok) {
    return text(`HTTP ${result.status}\n${result.body}`, true);
  }
  // The note attaches to the success path only — if a failed publish carried a
  // "published" notice, the caller would report the failure as success and skip
  // the follow-up steps (FB first comment, etc.).
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
 * Turns a Zod parse failure into a message the model can correct from.
 *
 * Top-level arguments not in the schema are **rejected**. Zod's default object
 * silently strips unknown keys, and that silence is exactly the failure mode this
 * server is built to remove — e.g. a model that read Naver's official docs sends
 * `filter` (our tool calls it `imageSize`) as-is, gets unfiltered results, and
 * believes the filter was applied. Instead of adding `.strict()` to every schema,
 * catch it here in one place so a new schema can't miss the rule.
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
        `Invalid arguments — unknown argument(s): ${unknown.join(', ')}. ` +
          `This tool accepts: ${[...known].join(', ')}. ` +
          'Proceeding while ignoring an argument would make you believe a filter was applied when it was not, so the call is rejected.',
      );
    }
  }
  return parsed.data;
}

/** Set of the schema's top-level keys — undefined when not an object (check skipped) */
function knownKeys(schema: z.ZodTypeAny): Set<string> | undefined {
  // ZodEffects (superRefine / refine / transform) wrap the object; looking only
  // at the outer typeName would skip the unknown-key check for mlx_music,
  // mlx_video, and the seedance family.
  let current: unknown = schema;
  for (let i = 0; i < 4; i++) {
    const def = (current as { _def?: { typeName?: string; shape?: unknown; schema?: unknown; innerType?: unknown } })._def;
    if (!def) return undefined;
    if (def.typeName === 'ZodObject' && typeof def.shape === 'function') {
      return new Set(Object.keys((def.shape as () => Record<string, unknown>)()));
    }
    current = def.schema ?? def.innerType;
  }
  return undefined;
}

// ── research schemas ─────────────────────────────────────────────

/**
 * Shared search-tool arguments — keeping the names unified means the model doesn't
 * relearn arguments when switching tools. The search term is query, result count is
 * limit, and the page is page. (Each client owns the mapping to the backend API's
 * q/display/num/start.)
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
  // This engine returns a fixed 10 results per page (num is not passed through to
  // Google — measured in practice). Accepting 20 would be a promise we can't keep,
  // so the cap matches the actual page size
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
      // The retired-API notice has to live here to reach the model. The client's
      // copy of the same notice never runs because zod cuts the call first —
      // reading Naver's official docs and sending type:"book" is the most common
      // miscall, so the moment it happens the model must learn why it's gone.
      errorMap: () => ({
        message:
          `Available: ${naver.NAVER_SEARCH_TYPES.join(' | ')}. ` +
          'book, doc, shop, and movie are APIs Naver has retired — they linger in the official docs ' +
          'but calling them returns 404. Do not retry; use serp_web_search instead.',
      }),
    })
    .optional(),
  limit: z.number().int().min(1).max(30).optional(),
  // page is a page, not an item offset — the client converts it as (page-1)*limit+1
  // and rejects values that exceed the API's start cap of 1000 after conversion
  // (which depends on limit)
  page: z.number().int().min(1).max(1000).optional(),
  sort: z.enum(naver.NAVER_SORTS as [string, ...string[]]).optional(),
  imageSize: z.enum(naver.NAVER_IMAGE_FILTERS).optional(),
});

// ── data.go.kr (Korea open-data portal) schemas ──────────────────

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

// ── SNS publish schemas ──────────────────────────────────────────

const SNS_PUBLISHED_NOTE = 'Published — this is already publicly visible. Report the permalink to the user.';

const isVideoUrl = (u: string) => /\.(mp4|mov)(\?|#|$)/i.test(u);

/** Channel (brand) slug — same convention as data/<slug>. When given, only the channel token is used (no fallback to the default token). */
const channelSlugSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,63}$/, 'channel must be a kebab-case slug (same as data/<slug>)')
  .optional();

/**
 * Threads body length — the platform enforces a 500-char cap but counts **emoji as
 * UTF-8 bytes**.
 *
 * JS `.length` (UTF-16 code units) counts an emoji as 2, less than the platform
 * (usually 4). So a caption that passes this validation could still be rejected by
 * the platform. Only characters outside the BMP are counted as their actual UTF-8
 * byte length, removing the undercount (Hangul and ASCII stay 1).
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
        message: `THREADS caption must be ≤${THREADS_MAX_CHARS} chars (got ${threadsTextLength(value)} — emoji are counted as UTF-8 bytes)`,
      })),
    imageUrl: z.string().url().optional(),
    videoUrl: z.string().url().optional(),
    linkUrl: z.string().url().optional(),
    replyToId: z.string().min(1).optional(),
    channel: channelSlugSchema,
  })
  .superRefine((v, ctx) => {
    // One media_type per post — VIDEO, IMAGE or TEXT(link_attachment). The platform
    // rejects two together, so catch it before the call is spent.
    const media = (['imageUrl', 'videoUrl', 'linkUrl'] as const).filter((k) => v[k]);
    if (media.length > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [media[1]],
        message: `imageUrl, videoUrl and linkUrl are mutually exclusive (got ${media.join(', ')})`,
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
    captionFiles: z
      .array(
        z.object({
          filePath: z.string().min(1),
          locale: z.string().regex(/^[a-z]{2}_[A-Z]{2}$/, 'locale must look like ko_KR / en_US / vi_VN'),
        }),
      )
      .min(1)
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
    // Captions attach to video only — sent with an image or text post they're silently dropped, so block them here
    if (v.captionFilePath && !v.videoUrl) issue('captionFilePath', 'captionFilePath requires videoUrl');
    if (v.captionLocale && !v.captionFilePath) issue('captionLocale', 'captionLocale requires captionFilePath');
    if (v.captionFiles && !v.videoUrl) issue('captionFiles', 'captionFiles requires videoUrl');
    if (v.captionFiles && v.captionFilePath) {
      issue('captionFiles', 'captionFiles and captionFilePath are mutually exclusive');
    }
  });

const facebookCommentSchema = z.object({
  postId: z.string().min(1),
  message: z.string().min(1).max(8000, 'FACEBOOK comment must be ≤8000 chars'),
  channel: channelSlugSchema,
});

/** YouTube caps the description at 5000 **bytes**. Korean is 3 bytes per character. */
const YT_DESCRIPTION_MAX_BYTES = 5000;
const ytDescription = z
  .string()
  .min(1)
  .refine((v) => Buffer.byteLength(v, 'utf8') <= YT_DESCRIPTION_MAX_BYTES, (v) => ({
    message:
      `The description is ${Buffer.byteLength(v, 'utf8')} bytes — YouTube's cap is ${YT_DESCRIPTION_MAX_BYTES} bytes (not characters). ` +
      `Korean is 3 bytes per character, so the effective limit is about ${Math.floor(YT_DESCRIPTION_MAX_BYTES / 3)} characters.`,
  }));

const youtubePublishSchema = z.object({
  videoFilePath: z.string().min(1),
  title: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[^<>]*$/, 'YouTube rejects angle brackets in titles'),
  // YouTube measures the description in **bytes** (5000) — not characters.
  // z.string().max(5000) counts UTF-16 code units, so it would pass 5000 Korean
  // characters — which is 15,000 bytes and the API rejects it. Long-form carries the
  // chapter list too, making it the longest-description path, so block it here —
  // getting a 400 after burning the whole upload costs the quota.
  caption: ytDescription,
  privacyStatus: z.enum(['public', 'unlisted', 'private']).optional(),
  // The thumbnail is required — without one an arbitrary frame becomes the cover,
  // and after publishing the Shorts portrait surface can't be reverted via the API
  // (enforced by user directive, 2026-08-13).
  thumbnailFilePath: z.string().min(1),
  captionFilePath: z.string().min(1).optional(),
  captionLanguage: z
    .string()
    .regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/, 'captionLanguage is a BCP-47 tag, e.g. ko / en / vi / zh-Hant')
    .optional(),
  captionTracks: z
    .array(
      z.object({
        filePath: z.string().min(1),
        language: z
          .string()
          .regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/, 'language is a BCP-47 tag, e.g. ko / en / vi / zh-Hant'),
      }),
    )
    .min(1)
    .optional(),
  categoryId: z
    .string()
    .regex(/^\d{1,3}$/, 'categoryId is a numeric YouTube category id, e.g. 22 (People & Blogs)')
    .optional(),
  madeForKids: z.boolean().optional(),
  containsSyntheticMedia: z.boolean().optional(),
  channel: channelSlugSchema,
});

// ── incoming-comment schemas (inbox is read-only; replies and hides go public immediately) ─────

const commentPlatform = z.enum(['THREADS', 'INSTAGRAM', 'FACEBOOK', 'YOUTUBE']);

/**
 * Platforms for hide/like — YouTube is excluded. All its API offers is
 * hold-for-review/reject (setModerationStatus), which means something different
 * and can't be mapped to a "reversible hide".
 */
const moderatePlatform = z.enum(['THREADS', 'INSTAGRAM', 'FACEBOOK']);

/** Per-platform reply length caps — same as the post body caps (platform hard limits). */
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
    // THREADS uses the same emoji-byte rule as post bodies (a reply = a new post)
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

// ── Threads growth query schemas (read-only) ─────────────────────

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

// ── Instagram growth query schemas (read-only) ───────────────────

const instagramInsightsSchema = z.object({
  days: z.number().int().min(1).max(90).optional(),
  mediaLimit: z.number().int().min(0).max(25).optional(),
  channel: channelSlugSchema,
});

// ── YouTube growth query schemas (read-only) ─────────────────────

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

// ── routing ──────────────────────────────────────────────────────

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

  // ── data.go.kr (search/detail/download need no auth; fetch/api_call need a key + per-API use application) ──
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

  // ── image generation (OpenAI GPT Image) — returns base64 image block + summary text ──
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
  // Local generation (Z-Image Turbo) — runs on-device as a subprocess. No key, network, or billing.
  // Unlike gpt_image it carries no base64 block — this tool always writes a local
  // file, so the caller reads it by path; echoing a 9:16 PNG as base64 just burns context.
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

  mlx_image_generate: async (args) => {
    const request = parseArgs(mlx.mlxImageGenerateSchema, args);
    const result = await mlx.generateMlxImage(request);
    if (!result.success) return text(`MLX Core image generation failed:\n${result.error}`, true);
    return text(
      `Image generated via MLX Core.\n\nFile: ${result.path}\nModel: ${result.model}\n` +
        `Size: ${result.width}x${result.height}\nSteps: ${result.steps ?? 'model default'}\n` +
        `Seed: ${result.seed ?? 'random'}\nGeneration time: ${result.elapsedSeconds}s`,
    );
  },
  mlx_image_edit: async (args) => {
    const request = parseArgs(mlx.mlxImageEditSchema, args);
    const result = await mlx.editMlxImage(request);
    if (!result.success) return text(`MLX Core image edit failed:\n${result.error}`, true);
    return text(
      `Image edited via MLX Core.\n\nFile: ${result.path}\nModel: ${result.model}\n` +
        (result.width && result.height ? `Size: ${result.width}x${result.height}\n` : '') +
        `Steps: ${result.steps ?? 'model default'}\nSeed: ${result.seed ?? 'random'}\n` +
        `Generation time: ${result.elapsedSeconds}s`,
    );
  },
  mlx_tts_generate: async (args) => {
    const request = parseArgs(mlx.mlxTtsGenerateSchema, args);
    const result = await mlx.generateMlxTts(request);
    if (!result.success) return text(`MLX Core TTS failed:\n${result.error}`, true);
    return text(
      `Audio generated via MLX Core.\n\nFile: ${result.path}\nModel: ${result.model}\n` +
        `Synthesis time: ${result.elapsedSeconds}s\nText length: ${request.input.length} chars`,
    );
  },
  mlx_music_generate: async (args) => {
    const request = parseArgs(mlx.mlxMusicGenerateSchema, args);
    const result = await mlx.generateMlxMusic(request);
    if (!result.success) return text(`MLX Core music generation failed:\n${result.error}`, true);
    return text(
      `Music generated via MLX Core.\n\nFile: ${result.path}\nModel: ${result.model}\n` +
        `Duration: ${result.durationSeconds} seconds\nInstrumental: ${request.instrumental}\n` +
        `Generation time: ${result.elapsedSeconds}s`,
    );
  },
  mlx_video_generate: async (args) => {
    const request = parseArgs(mlx.mlxVideoGenerateSchema, args);
    const result = await mlx.generateMlxVideo(request);
    if (!result.success) return text(`MLX Core video generation failed:\n${result.error}`, true);
    return text(
      `Video generated via MLX Core.\n\nFile: ${result.path}\nModel: ${result.model}\n` +
        `Size: ${result.width}x${result.height}\nFrames: ${result.frames} @ ${result.fps} fps\n` +
        `Duration: ${result.durationSeconds?.toFixed(2)} seconds\n` +
        `Audio: ${result.hasAudio ? 'muxed PCM' : 'none'}\n` +
        `Generation time: ${result.elapsedSeconds}s\n\n` +
        `Output is ${mlx.MLX_VIDEO_FPS} fps; produce's builder is 30 fps, so a splice re-encodes.`,
    );
  },
  mlx_3d_generate: async (args) => {
    const request = parseArgs(mlx.mlx3dGenerateSchema, args);
    const result = await mlx.generateMlx3d(request);
    if (!result.success) return text(`MLX Core 3D generation failed:\n${result.error}`, true);
    return text(
      `Mesh generated via MLX Core.\n\nFile: ${result.path}\nModel: ${result.model}\n` +
        `Generation time: ${result.elapsedSeconds}s\n\n` +
        `GLB. This pipeline has no mesh consumer — produce/storyboard/autoproduce never read this file.`,
    );
  },

  // ── video generation (Veo 3.1) — saves the mp4 locally, returns path + meta text ──
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

  // ── video generation (Seedance) — saves the mp4 locally, returns path + meta text ──
  // The billed tokens (completionTokens) come back too — this value is the vendor's
  // billing basis, not a rate-sheet estimate, so per-episode cost tallies should
  // record this number.
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
    const refImagesInfo = result.referenceImages?.length
      ? `\nReference Images (${result.referenceImages.length}):\n  - ${result.referenceImages.join('\n  - ')}`
      : '';
    const refAudioInfo = result.referenceAudios?.length
      ? `\nReference Audio (${result.referenceAudios.length}):\n  - ${result.referenceAudios.join('\n  - ')}`
      : '';
    return text(
      `Video generated with references successfully!\n\nOutput: ${result.videoPath}${refImagesInfo}${refAudioInfo}\n${seedanceMeta(result)}\nPrompt: ${result.prompt}`,
    );
  },

  // ── speech synthesis (Gemini TTS) — saves the wav locally, returns path + meta text ──
  // Returns the script length, not the full text — echoing a 16k-char script back
  // just burns the caller's context, and it's a string they already sent, so it
  // carries no information.
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
  // Local synthesis (Supertonic) — runs on-device as a subprocess. No key, network, or quota.
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
        `  Beyond F1–F5 being female and M1–M5 male, the vendor publishes no character labels.\n` +
        `  Pick by listening — render the same sentence with two or three voices and compare.\n\n` +
        `ElevenLabs — account-specific voices (tts_elevenlabs_generate / tts_elevenlabs_dialogue):\n\n` +
        `  Not listed here: premade, cloned and Voice Library voices differ per account. Call tts_elevenlabs_voices ` +
        `(needs the voices_read permission on the key) and pin the voice_id in the channel profile.\n\n` +
        `Engine choice: narration bodies and long scripts go to tts_local_generate (zero cost, 6.3x realtime); ` +
        `short cuts that need acting go to tts_generate (stylePrompt) or tts_elevenlabs_generate on eleven_v3 ` +
        `(inline audio tags, the dearer of the two); scenes with 3+ speakers go to tts_elevenlabs_dialogue.\n` +
        `If the channel profile (data/<slug>/profile.md) names a voice, use that value as-is — ` +
        `a voice that changes every episode breaks the channel's identity.`,
    );
  },

  // ── speech synthesis (ElevenLabs) — REST, saves the file locally, returns path + measured cost ──
  // character-cost is the vendor's billing header, so it is reported as measured rather
  // than estimated from a price sheet (the same reasoning as Seedance's token count).
  tts_elevenlabs_generate: async (args) => {
    const request = parseArgs(elevenlabs.elevenLabsGenerateSchema, args);
    const result = await elevenlabs.generateElevenLabsSpeech(request);
    if (!result.success) return text(`ElevenLabs TTS generation failed: ${result.error}`, true);
    return text(
      `Audio generated successfully!\n\nFile: ${result.audioPath}\nEngine: ElevenLabs ${result.model}\n` +
        `Voice: ${request.voiceId}\nFormat: ${result.outputFormat}${elevenlabsFormatNote(result.outputFormat)}\n` +
        elevenlabsMeta(result) +
        `Text length: ${request.text.length} chars`,
    );
  },
  tts_elevenlabs_dialogue: async (args) => {
    const request = parseArgs(elevenlabs.elevenLabsDialogueSchema, args);
    const result = await elevenlabs.generateElevenLabsDialogue(request);
    if (!result.success) return text(`ElevenLabs dialogue generation failed: ${result.error}`, true);
    const voices = new Set(request.inputs.map((line) => line.voiceId));
    const totalChars = request.inputs.reduce((sum, line) => sum + line.text.length, 0);
    return text(
      `Dialogue audio generated successfully!\n\nFile: ${result.audioPath}\nEngine: ElevenLabs ${result.model}\n` +
        `Lines: ${request.inputs.length} (${voices.size} voices)\nFormat: ${result.outputFormat}${elevenlabsFormatNote(result.outputFormat)}\n` +
        elevenlabsMeta(result) +
        (result.voiceSegments !== undefined ? `Voice segments: ${result.voiceSegments}\n` : '') +
        `Script length: ${totalChars} chars`,
    );
  },
  tts_elevenlabs_voices: async (args) => {
    const request = parseArgs(elevenlabs.elevenLabsVoicesSchema, args);
    const result = await elevenlabs.listElevenLabsVoices(request);
    if (!result.success) return text(`ElevenLabs voice listing failed: ${result.error}`, true);
    const voices = result.voices ?? [];
    const lines = voices.map((voice) => {
      const labels = Object.entries(voice.labels)
        .map(([key, value]) => `${key}=${value}`)
        .join(' ');
      const langs = voice.verifiedLanguages.length ? ` · languages: ${voice.verifiedLanguages.join(',')}` : '';
      const desc = voice.description ? ` — ${voice.description.slice(0, 120)}` : '';
      return `  - ${voice.name} — ${voice.voiceId} · ${voice.category ?? 'unknown'}${labels ? ` · ${labels}` : ''}${langs}${desc}`;
    });
    const filter = [request.search ? `search="${request.search}"` : '', request.category ? `category=${request.category}` : '']
      .filter(Boolean)
      .join(', ');
    const sub = result.subscription;
    const subLine = sub
      ? `Plan: ${sub.tier ?? '?'} (${sub.status ?? '?'}) — ${sub.characterCount ?? '?'} / ${sub.characterLimit ?? '?'} characters used this cycle` +
        `${sub.resetsAt ? `, resets ${sub.resetsAt.slice(0, 10)}` : ''}` +
        `${sub.tier === 'free' ? ' — FREE tier: output is non-commercial and needs attribution' : ''}\n`
      : 'Plan: not readable with this key (needs user_read) — check the tier at https://elevenlabs.io/app/subscription before publishing commercially\n';
    return text(
      `ElevenLabs voices — ${voices.length} shown${result.totalCount !== undefined ? ` of ${result.totalCount}` : ''}${filter ? ` (${filter})` : ''}` +
        `${result.hasMore ? ', more pages exist — narrow with search/category' : ''}:\n\n${lines.join('\n') || '  (none)'}\n\n` +
        subLine +
        `Pin the chosen voice_id in data/<slug>/profile.md §2 — the legacy premade voices retire 2026-12-31.`,
    );
  },

  // Local transcription (Qwen3-ASR) — on-device via subprocess. No key, no network, no billing.
  stt_local_transcribe: async (args) => {
    const request = parseArgs(qwen3asr.qwen3AsrTranscribeSchema, args);
    const result = await qwen3asr.transcribeLocal(request);
    if (!result.success) return text(`Local transcription failed: ${result.error}`, true);
    const preview = (result.text || '').length > 4000 ? `${(result.text || '').slice(0, 4000)}\n…(truncated — full text in the JSON)` : result.text || '';
    return text(
      `Audio transcribed locally!\n\nFile: ${result.transcriptPath}\nEngine: Qwen3-ASR via mlx-qwen3-asr (on-device)\n` +
        `Model: ${result.model}\nLanguage: ${result.language}\n` +
        `Segments: ${result.segments?.length ?? 0}\n` +
        `Elapsed: ${result.elapsedSeconds}s\n\nTranscript:\n${preview}`,
    );
  },

  // ── music generation (Lyria) — 30s batch clip / streaming with an exact duration ──
  music_generate_clip: async (args) => {
    const result = await music.generateClip(parseArgs(music.musicClipSchema, args));
    if (!result.success) return text(`Clip music generation failed: ${result.error}`, true);
    return text(
      `Music clip generated successfully!\n\nFile: ${result.audioPath}\nModel: ${result.model}\nDuration: 30 seconds (fixed)\nPrompt: ${result.prompt}\n\n` +
        `44.1kHz stereo MP3. Lyria 3 is non-deterministic — if this BGM will be reused, keep this file as an asset (the same prompt won't produce the same track again).`,
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
  capability_status: async () => text(renderCapabilityStatus()),
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

  // ── music generation (Suno / sunoapi.org) ──
  suno_generate: async (args) => {
    const request = parseArgs(suno.sunoGenerateSchema, args);
    const result = await suno.generateMusic(request);
    if (!result.success) return text(`Suno generation failed: ${result.error}`, true);
    const tracks = result.tracks ?? [];
    const lines = tracks.map(
      (track, index) =>
        `  ${index + 1}. ${track.audioPath}` +
        (track.title ? `  "${track.title}"` : '') +
        (track.durationSeconds ? `  ${Math.round(track.durationSeconds)}s` : '') +
        (track.tags ? `  [${track.tags}]` : ''),
    );
    return text(
      `Suno tracks generated.\n\nPrimary: ${result.audioPath}\nModel: ${result.model}\nTask: ${result.taskId}\nTracks (${tracks.length}):\n${lines.join('\n')}\n\n` +
        `Remote URLs expire in 15 days — these local files are the keepers. ` +
        `For a bed under narration, pick the instrumental variant and set filename to .wav so it matches .work/bgm.wav.`,
    );
  },
  suno_generate_sound: async (args) => {
    const request = parseArgs(suno.sunoSoundSchema, args);
    const result = await suno.generateSound(request);
    if (!result.success) return text(`Suno sound generation failed: ${result.error}`, true);
    const tracks = result.tracks ?? [];
    const lines = tracks.map((track, index) => `  ${index + 1}. ${track.audioPath}`);
    return text(
      `Suno sound generated.\n\nFile: ${result.audioPath}\nModel: ${result.model}\nTask: ${result.taskId}\nTracks:\n${lines.join('\n')}\n\n` +
        `Loop-friendly bed. The builder stretches it with -stream_loop.`,
    );
  },
  suno_generate_lyrics: async (args) => {
    const request = parseArgs(suno.sunoLyricsSchema, args);
    const result = await suno.generateLyrics(request);
    if (!result.success) return text(`Suno lyrics generation failed: ${result.error}`, true);
    const blocks = (result.lyrics ?? []).map((item, index) => {
      const heading = item.title ? `Variant ${index + 1} — ${item.title}` : `Variant ${index + 1}`;
      return `${heading}\n${item.text}`;
    });
    return text(
      `Suno lyrics generated (${result.lyrics?.length ?? 0} variants). Task: ${result.taskId}\n\n${blocks.join('\n\n---\n\n')}\n\n` +
        `To sing them in custom mode, pass the chosen lyrics as suno_generate prompt (customMode=true, instrumental=false, style+title required).`,
    );
  },
  suno_credits: async () => {
    const result = await suno.getCredits();
    if (!result.success) return text(`Suno credits lookup failed: ${result.error}`, true);
    return text(
      `Suno remaining credits: ${result.credits}\n\n` +
        `suno_generate uses about 12 credits per call (≈ $0.06 at the $5/1000 pack). Less than that means top up first.`,
    );
  },

  // ── direct SNS publishing to our own accounts (per-platform tools — public immediately; call after HITL approval) ──
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
              captionFiles: input.captionFiles,
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
        captionTracks: input.captionTracks,
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
    // dryRun changes nothing, so the publish notice is not attached.
    return fromApi(await sns.youtubeUpdate(input), input.dryRun ? undefined : SNS_PUBLISHED_NOTE);
  },
  youtube_insights: async (args) => {
    const input = parseArgs(youtubeInsightsSchema, args);
    return fromApi(await sns.youtubeInsights(input));
  },

  // ── Instagram growth queries (read-only — the grow-instagram skill calls these every tick) ──
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

  // ── incoming-comment management (inbox is read-only; replies and hides go public immediately) ──
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
    return fromApi(await sns.moderateComment(input), 'Moderation applied — this is already live on the platform.');
  },

  // ── Threads growth queries (read-only — the grow-threads skill calls these every tick) ──
  threads_insights: async (args) => {
    const input = parseArgs(threadsInsightsSchema, args);
    return fromApi(await sns.threadsInsights(input));
  },
  threads_search: async (args) => {
    const input = parseArgs(threadsSearchSchema, args);
    return fromApi(await sns.threadsKeywordSearch(input));
  },
};
