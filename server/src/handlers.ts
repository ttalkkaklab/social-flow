import { z } from 'zod';
import * as datago from './datago-client.js';
import * as image from './image-client.js';
import * as naver from './naver-client.js';
import * as serp from './serp-client.js';
import * as sns from './sns-client.js';
import * as video from './video-client.js';
import { formatError, formatFileSize, saveBase64Image } from './media-utils.js';
import type { ApiResult } from './http.js';

/** MCP content 블록 — 생성 이미지는 base64 image 블록으로 함께 반환한다. */
export type ToolContent =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string };

export interface ToolResult {
  [key: string]: unknown;
  content: ToolContent[];
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

function fromApi(result: ApiResult, note?: string): ToolResult {
  const body = `HTTP ${result.status}\n${result.body}`;
  // 노트는 성공 경로에만 붙인다 — 게시 실패에 "게시 완료" 안내가 실리면
  // 호출자가 실패를 성공으로 보고하고 후속 절차(링크 답글 등)를 건너뛴다.
  return text(note && result.ok ? `${note}\n${body}` : body, !result.ok);
}

/** Zod 파싱 실패를 모델이 교정 가능한 메시지로 변환 */
function parseArgs<T extends z.ZodTypeAny>(schema: T, args: unknown): z.infer<T> {
  const parsed = schema.safeParse(args);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
    throw new Error(`Invalid arguments — ${issues}`);
  }
  return parsed.data;
}

// ── 조사 스키마 ──────────────────────────────────────────────────

const serpWebSchema = z.object({
  q: z.string().min(1).max(300),
  gl: z.string().regex(/^[a-z]{2}$/i, 'must be a 2-letter country code, e.g. kr, us').optional(),
  hl: z.string().min(2).max(7).optional(),
  location: z.string().max(120).optional(),
  num: z.number().int().min(1).max(20).optional(),
  page: z.number().int().min(1).max(5).optional(),
  recency: z.enum(['hour', 'day', 'week', 'month', 'year']).optional(),
});

const serpNewsSchema = z.object({
  q: z.string().min(1).max(300),
  gl: z.string().regex(/^[a-z]{2}$/i, 'must be a 2-letter country code, e.g. kr, us').optional(),
  hl: z.string().min(2).max(7).optional(),
  max_results: z.number().int().min(1).max(20).optional(),
});

const serpNaverSchema = z.object({
  query: z.string().min(1).max(300),
  where: z.enum(['web', 'news']).optional(),
  page: z.number().int().min(1).max(5).optional(),
  sort_by: z.enum(['relevance', 'latest']).optional(),
  max_results: z.number().int().min(1).max(20).optional(),
});

const naverSearchSchema = z.object({
  query: z.string().min(1).max(300),
  type: z.enum(['news', 'blog', 'web', 'cafe']).optional(),
  display: z.number().int().min(1).max(30).optional(),
  start: z.number().int().min(1).max(1000).optional(),
  sort: z.enum(['sim', 'date']).optional(),
});

// ── 공공데이터포털 스키마 ────────────────────────────────────────

const datagoTypeSchema = z.enum(['API', 'FILE']);

const datagoSearchSchema = z.object({
  keyword: z.string().min(1).max(100),
  type: datagoTypeSchema.optional(),
  page: z.number().int().min(1).max(50).optional(),
  perPage: z.number().int().min(1).max(20).optional(),
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
  perPage: z.number().int().min(1).max(50).optional(),
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

const threadsPublishSchema = z.object({
  caption: z.string().min(1).max(500, 'THREADS caption must be ≤500 chars'),
  imageUrl: z.string().url().optional(),
  replyToId: z.string().min(1).optional(),
});

const instagramPublishSchema = z
  .object({
    caption: z.string().min(1).max(2200, 'INSTAGRAM caption must be ≤2200 chars'),
    imageUrls: z.array(z.string().url()).min(1).max(10).optional(),
    videoUrl: z.string().url().optional(),
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
    linkUrl: z.string().url().optional(),
  })
  .superRefine((v, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
    if (v.imageUrls && v.videoUrl) issue('videoUrl', 'imageUrls and videoUrl are mutually exclusive');
    if (v.videoUrl && !isVideoUrl(v.videoUrl)) issue('videoUrl', 'videoUrl must be a .mp4/.mov URL');
    if (v.linkUrl && (v.imageUrls || v.videoUrl)) issue('linkUrl', 'linkUrl is for text-only posts (no media)');
  });

const facebookCommentSchema = z.object({
  postId: z.string().min(1),
  message: z.string().min(1).max(8000, 'FACEBOOK comment must be ≤8000 chars'),
});

const youtubePublishSchema = z.object({
  videoFilePath: z.string().min(1),
  title: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[^<>]*$/, 'YouTube rejects angle brackets in titles'),
  caption: z.string().min(1).max(5000),
  privacyStatus: z.enum(['public', 'unlisted', 'private']).optional(),
  thumbnailFilePath: z.string().min(1).optional(),
});

// ── 받은 댓글 관리 스키마 (인박스는 읽기 전용, 답글·숨김은 즉시 공개) ─────

const commentChannel = z.enum(['THREADS', 'INSTAGRAM', 'FACEBOOK']);

/** 채널별 답글 길이 상한 — 게시 본문 상한과 같다(플랫폼 하드 리밋). */
const REPLY_MAX_CHARS = { THREADS: 500, INSTAGRAM: 2200, FACEBOOK: 8000 } as const;

const commentInboxSchema = z.object({
  channels: z.array(commentChannel).min(1).optional(),
  postLimit: z.number().int().min(1).max(25).optional(),
  commentLimit: z.number().int().min(1).max(100).optional(),
  sinceHours: z.number().min(0.1).max(720).optional(),
  includeAnswered: z.boolean().optional(),
  includeOwn: z.boolean().optional(),
});

const commentReplySchema = z
  .object({
    channel: commentChannel,
    commentId: z.string().min(1),
    message: z.string().min(1),
  })
  .superRefine((v, ctx) => {
    const max = REPLY_MAX_CHARS[v.channel];
    if (v.message.length > max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['message'],
        message: `${v.channel} reply must be ≤${max} chars (got ${v.message.length})`,
      });
    }
  });

const commentModerateSchema = z.object({
  channel: commentChannel,
  commentId: z.string().min(1),
  action: z.enum(['hide', 'unhide', 'like', 'unlike']),
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
  naver_search: async (args) => {
    const result = await naver.naverSearch(parseArgs(naverSearchSchema, args));
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

  // ── 자사 SNS 직접 게시 (채널별 툴 — 즉시 공개, HITL 승인 후 호출) ──
  threads_publish: async (args) => {
    const input = parseArgs(threadsPublishSchema, args);
    return fromApi(await sns.publishThreads(input), SNS_PUBLISHED_NOTE);
  },
  instagram_publish: async (args) => {
    const input = parseArgs(instagramPublishSchema, args);
    return fromApi(
      await sns.publishInstagram(
        input.videoUrl
          ? { caption: input.caption, videoUrl: input.videoUrl }
          : { caption: input.caption, imageUrls: input.imageUrls },
      ),
      SNS_PUBLISHED_NOTE,
    );
  },
  facebook_publish: async (args) => {
    const input = parseArgs(facebookPublishSchema, args);
    return fromApi(
      await sns.publishFacebook(
        input.videoUrl
          ? { caption: input.caption, videoUrl: input.videoUrl }
          : { caption: input.caption, imageUrls: input.imageUrls, linkUrl: input.linkUrl },
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
      }),
      SNS_PUBLISHED_NOTE,
    );
  },
  sns_account_check: async () => {
    return fromApi(await sns.checkAccounts());
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
    return fromApi(await sns.moderateComment(input), '모더레이션 반영 완료 — 이미 채널에 적용된 상태다.');
  },
};
