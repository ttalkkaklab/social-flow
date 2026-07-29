/**
 * Google Veo 3.1 비디오 생성 클라이언트 — fect-mcp-server video 모듈 이식.
 *
 * Google Gen AI SDK를 사용하여 비디오를 생성한다.
 * - 모델: veo-3.1-generate-preview(기본) / veo-3.1-fast-generate-preview / veo-3.1-lite-generate-preview
 * - Text-to-Video, Image-to-Video, Video Extension, Reference Images 지원
 * - 해상도 720p/1080p/4k, 길이 4/6/8초 (제약은 스키마 검증 준거)
 * - Extension 은 +7초 증분 · 720p 고정 (3.1 / 3.1 Fast 전용)
 *
 * 생성은 비동기 long-running operation — REST 폴링(10초 간격, 최대 10분)으로
 * 완료를 기다린 뒤 mp4 를 로컬에 저장하고 경로만 반환한다 (원본 4중 중복
 * 폴링 루프를 awaitVideoAndSave 헬퍼 하나로 접었다 — 동작 동일).
 *
 * API 키는 기동 시가 아니라 호출 시점에 검증한다 (config.requireGeminiKey).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { GenerateVideosConfig, VideoGenerationReferenceImage } from '@google/genai';
import { z } from 'zod';
import { requireGeminiKey } from './config.js';
import { ALLOWED_EXTENSIONS, mimeFromExtension, validateFilePath } from './media-utils.js';

// 지원되는 Veo 모델 (2026-07 기준 — Gemini API 에서 호출 가능한 현역 모델 3종)
// veo-3.0-* / veo-2.0-* 계열은 2026-06-30 자로 셧다운되어 호출할 수 없다.
export const VALID_VIDEO_MODELS = [
  'veo-3.1-generate-preview',      // 최고 품질 (기본값) — 720p $0.40/초
  'veo-3.1-fast-generate-preview', // 저지연·저가 — 720p $0.10/초 (기본 대비 4배 절감)
  'veo-3.1-lite-generate-preview', // 최저가 — 720p $0.05/초 (8배 절감). 4K/Extension/Reference 미지원
] as const;
export type VideoModel = (typeof VALID_VIDEO_MODELS)[number];

export const DEFAULT_VIDEO_MODEL: VideoModel = 'veo-3.1-generate-preview';

export const VALID_VIDEO_ASPECT_RATIOS = ['16:9', '9:16'] as const;
export const VALID_VIDEO_RESOLUTIONS = ['720p', '1080p', '4k'] as const;
export type VideoResolution = (typeof VALID_VIDEO_RESOLUTIONS)[number];

const DEFAULT_DURATION_SECONDS = 8;
const EXTENSION_ADDED_SECONDS = 7; // extension 1회당 추가되는 길이 (공식 문서)
const POLL_INTERVAL_MS = 10_000;
const MAX_POLLS = 60; // 10분 최대 대기 (10초 * 60)
const API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

const DurationSchema = z.union([z.literal(4), z.literal(6), z.literal(8)]).optional().default(8);

/**
 * 해상도 × 길이 × 모델 교차 제약 검증 (공식 문서 준거)
 * - 1080p / 4k 는 8초 전용.
 * - 4k 는 lite 미지원.
 */
function validateResolutionConstraints(
  model: VideoModel,
  resolution: VideoResolution,
  durationSeconds: number,
  ctx: z.RefinementCtx,
): void {
  if ((resolution === '1080p' || resolution === '4k') && durationSeconds !== 8) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['durationSeconds'],
      message: `${resolution} 해상도는 8초 길이에서만 지원됩니다 (요청: ${durationSeconds}초).`,
    });
  }
  if (resolution === '4k' && model === 'veo-3.1-lite-generate-preview') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['resolution'],
      message: 'veo-3.1-lite-generate-preview 는 4k 를 지원하지 않습니다 (720p/1080p 만).',
    });
  }
}

/** lite 모델이 지원하지 않는 기능(extension·reference)에 대한 공통 검증 */
function rejectLiteModel(feature: string, model: VideoModel, ctx: z.RefinementCtx): void {
  if (model === 'veo-3.1-lite-generate-preview') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['model'],
      message: `${feature} 은(는) veo-3.1-lite-generate-preview 에서 지원되지 않습니다. veo-3.1-generate-preview 또는 veo-3.1-fast-generate-preview 를 사용하세요.`,
    });
  }
}

// Text-to-Video 요청 스키마
export const text2VideoSchema = z
  .object({
    prompt: z.string().min(1, 'Prompt is required'),
    model: z.enum(VALID_VIDEO_MODELS).optional().default(DEFAULT_VIDEO_MODEL),
    aspectRatio: z.enum(VALID_VIDEO_ASPECT_RATIOS).optional().default('16:9'),
    resolution: z.enum(VALID_VIDEO_RESOLUTIONS).optional().default('720p'),
    durationSeconds: DurationSchema,
    outputPath: z.string().optional(),
    filename: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    validateResolutionConstraints(data.model, data.resolution, data.durationSeconds, ctx);
  });

// Image-to-Video 요청 스키마
export const img2VideoSchema = z
  .object({
    prompt: z.string().min(1, 'Prompt is required'),
    sourceImagePath: z.string().min(1, 'Source image path is required'),
    lastImagePath: z.string().optional(),
    model: z.enum(VALID_VIDEO_MODELS).optional().default(DEFAULT_VIDEO_MODEL),
    aspectRatio: z.enum(VALID_VIDEO_ASPECT_RATIOS).optional().default('16:9'),
    resolution: z.enum(VALID_VIDEO_RESOLUTIONS).optional().default('720p'),
    durationSeconds: DurationSchema,
    outputPath: z.string().optional(),
    filename: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    validateResolutionConstraints(data.model, data.resolution, data.durationSeconds, ctx);
  });

// Video Extension 요청 스키마
// 제약(공식 문서): 3.1 / 3.1 Fast 전용, 입력 영상은 Veo 생성물 · 720p · 141초 이하,
// 결과는 +7초 증분. 해상도는 720p 고정이며 aspect ratio 는 입력 영상을 따른다.
export const videoExtensionSchema = z
  .object({
    prompt: z.string().min(1, 'Prompt is required'),
    sourceVideoPath: z.string().min(1, 'Source video path is required'),
    model: z.enum(VALID_VIDEO_MODELS).optional().default(DEFAULT_VIDEO_MODEL),
    outputPath: z.string().optional(),
    filename: z.string().optional(),
  })
  .superRefine((data, ctx) => rejectLiteModel('video extension', data.model, ctx));

// Reference Image Video 요청 스키마
// 제약(공식 문서): 3.1 / 3.1 Fast 전용, 참조 이미지 최대 3장, 길이 8초 고정.
export const referenceVideoSchema = z
  .object({
    prompt: z.string().min(1, 'Prompt is required'),
    referenceImagePaths: z
      .array(z.string())
      .min(1, 'At least one reference image is required')
      .max(3, 'Maximum 3 reference images allowed'),
    model: z.enum(VALID_VIDEO_MODELS).optional().default(DEFAULT_VIDEO_MODEL),
    aspectRatio: z.enum(VALID_VIDEO_ASPECT_RATIOS).optional().default('16:9'),
    resolution: z.enum(VALID_VIDEO_RESOLUTIONS).optional().default('720p'),
    outputPath: z.string().optional(),
    filename: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    rejectLiteModel('reference images', data.model, ctx);
    // 길이는 8초 고정이므로 4k 여부만 확인하면 된다
    validateResolutionConstraints(data.model, data.resolution, 8, ctx);
  });

export type Text2VideoRequest = z.infer<typeof text2VideoSchema>;
export type Img2VideoRequest = z.infer<typeof img2VideoSchema>;
export type VideoExtensionRequest = z.infer<typeof videoExtensionSchema>;
export type ReferenceVideoRequest = z.infer<typeof referenceVideoSchema>;

// 비디오 생성 응답
export interface VideoGenerationResponse {
  success: boolean;
  videoPath?: string;
  error?: string;
  prompt?: string;
  model?: string;
  aspectRatio?: string;
  resolution?: string;
  duration?: number;
  sourceImage?: string;
  lastImage?: string;
  sourceVideo?: string;
  referenceImages?: string[];
}

// ── 공통 폴링·저장 헬퍼 ──────────────────────────────────────────

interface OperationStatus {
  done?: boolean;
  response?: {
    // 새로운 API 형식 (generateVideoResponse.generatedSamples)
    generateVideoResponse?: {
      generatedSamples?: Array<{ video?: { uri?: string } }>;
      // RAI (Responsible AI) 콘텐츠 필터링 관련 필드
      raiMediaFilteredCount?: number;
      raiMediaFilteredReasons?: string[];
    };
    // 레거시 API 형식 (호환성)
    generatedVideos?: Array<{ video?: { uri?: string } }>;
  };
  error?: { code?: number; message?: string };
}

/** REST API를 통해 operation 상태 조회 */
async function getOperationStatus(apiKey: string, operationName: string): Promise<OperationStatus> {
  const url = `${API_BASE_URL}/${operationName}?key=${apiKey}`;
  const response = await fetch(url);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get operation status: ${response.status} - ${error}`);
  }

  return response.json() as Promise<OperationStatus>;
}

/** 비디오 파일 다운로드 */
async function downloadVideo(apiKey: string, videoUri: string): Promise<Buffer> {
  // videoUri에 API 키가 필요한 경우 추가
  const url = videoUri.includes('?') ? `${videoUri}&key=${apiKey}` : `${videoUri}?key=${apiKey}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to download video: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * operation 완료 폴링 → RAI 필터링 확인 → 비디오 다운로드 → 로컬 저장.
 * 성공 시 저장된 절대 경로를, 실패 시 error 메시지를 반환한다.
 */
async function awaitVideoAndSave(
  apiKey: string,
  operationName: string,
  outputPath: string,
  filename: string,
  label: string,
): Promise<{ videoPath: string } | { error: string }> {
  let pollCount = 0;

  while (pollCount < MAX_POLLS) {
    console.error(`[Veo] ${label} in progress... (polling ${++pollCount}/${MAX_POLLS})`);
    await sleep(POLL_INTERVAL_MS);

    const status = await getOperationStatus(apiKey, operationName);

    if (status.error) {
      return { error: `Generation error: ${status.error.message || 'Unknown error'}` };
    }

    if (!status.done) continue;

    // RAI 필터링 확인
    const raiReasons = status.response?.generateVideoResponse?.raiMediaFilteredReasons;
    if (raiReasons && raiReasons.length > 0) {
      const reason = raiReasons.join('; ');
      console.error(`[Veo] Content filtered: ${reason}`);
      return { error: `Content policy violation: ${reason}` };
    }

    // 생성된 비디오 확인 (새로운/레거시 형식 모두 지원)
    const generatedVideos =
      status.response?.generateVideoResponse?.generatedSamples ?? status.response?.generatedVideos;
    if (!generatedVideos || generatedVideos.length === 0) {
      return { error: 'No video generated in response' };
    }

    const videoUri = generatedVideos[0].video?.uri;
    if (!videoUri) {
      return { error: 'No video URI in response' };
    }

    // 디렉토리 생성 + 다운로드·저장
    const fullPath = path.join(outputPath, filename);
    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath, { recursive: true });
    }
    const videoBuffer = await downloadVideo(apiKey, videoUri);
    fs.writeFileSync(fullPath, videoBuffer);

    console.error(`[Veo] Video saved to: ${fullPath}`);
    return { videoPath: fullPath };
  }

  return { error: 'Video generation timed out (10 minutes)' };
}

/** 로컬 이미지 파일을 base64 인라인 이미지 객체로 읽는다. */
function readInlineImage(filePath: string): { imageBytes: string; mimeType: string } {
  const buffer = fs.readFileSync(filePath);
  return { imageBytes: buffer.toString('base64'), mimeType: mimeFromExtension(filePath, 'image') };
}

/** 로컬 비디오 파일을 base64 인라인 비디오 객체로 읽는다. */
function readInlineVideo(filePath: string): { videoBytes: string; mimeType: string } {
  const buffer = fs.readFileSync(filePath);
  return { videoBytes: buffer.toString('base64'), mimeType: mimeFromExtension(filePath, 'video') };
}

// ── 생성 함수 4종 ────────────────────────────────────────────────

/** 텍스트 프롬프트로 비디오 생성 */
export async function generateFromText(request: Text2VideoRequest): Promise<VideoGenerationResponse> {
  const apiKey = requireGeminiKey();
  const model = request.model || DEFAULT_VIDEO_MODEL;
  const resolution = request.resolution || '720p';
  const durationSeconds = request.durationSeconds ?? DEFAULT_DURATION_SECONDS;

  try {
    const { GoogleGenAI } = await import('@google/genai');
    const genai = new GoogleGenAI({ apiKey });

    console.error(`[Veo] Starting text-to-video generation... (model: ${model})`);
    console.error(`[Veo] Prompt: ${request.prompt.substring(0, 100)}...`);

    const config: GenerateVideosConfig = {
      aspectRatio: request.aspectRatio || '16:9',
      resolution,
      durationSeconds,
    };
    const operation = await genai.models.generateVideos({ model, prompt: request.prompt, config });

    if (!operation.name) return { success: false, error: 'No operation name returned from API' };

    const saved = await awaitVideoAndSave(
      apiKey,
      operation.name,
      request.outputPath || process.cwd(),
      request.filename || `video_${Date.now()}.mp4`,
      'Generation',
    );
    if ('error' in saved) return { success: false, error: saved.error };

    return {
      success: true,
      videoPath: saved.videoPath,
      prompt: request.prompt,
      model,
      aspectRatio: request.aspectRatio || '16:9',
      resolution,
      duration: durationSeconds,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Veo] Error: ${errorMessage}`);
    return { success: false, error: `Video generation failed: ${errorMessage}` };
  }
}

/**
 * 이미지에서 비디오 생성
 * 시작 이미지만 사용하거나, 시작/종료 이미지 둘 다 사용하여 프레임 보간 비디오 생성
 */
export async function generateFromImage(request: Img2VideoRequest): Promise<VideoGenerationResponse> {
  const apiKey = requireGeminiKey();
  const model = request.model || DEFAULT_VIDEO_MODEL;
  const resolution = request.resolution || '720p';
  const durationSeconds = request.durationSeconds ?? DEFAULT_DURATION_SECONDS;

  try {
    // 소스·종료 이미지 경로 검증
    validateFilePath(request.sourceImagePath, { allowedExtensions: ALLOWED_EXTENSIONS.image });
    if (!fs.existsSync(request.sourceImagePath)) {
      return { success: false, error: `Source image not found: ${request.sourceImagePath}` };
    }
    if (request.lastImagePath) {
      validateFilePath(request.lastImagePath, { allowedExtensions: ALLOWED_EXTENSIONS.image });
      if (!fs.existsSync(request.lastImagePath)) {
        return { success: false, error: `Last frame image not found: ${request.lastImagePath}` };
      }
    }

    const { GoogleGenAI } = await import('@google/genai');
    const genai = new GoogleGenAI({ apiKey });

    console.error(`[Veo] Starting image-to-video generation... (model: ${model})`);
    console.error(`[Veo] First frame image: ${request.sourceImagePath}`);
    if (request.lastImagePath) console.error(`[Veo] Last frame image: ${request.lastImagePath}`);
    console.error(`[Veo] Prompt: ${request.prompt.substring(0, 100)}...`);

    const config: GenerateVideosConfig = {
      aspectRatio: request.aspectRatio || '16:9',
      resolution,
      durationSeconds,
    };
    // 종료 이미지가 제공된 경우 lastFrame 추가
    if (request.lastImagePath) {
      config.lastFrame = readInlineImage(request.lastImagePath);
    }

    const operation = await genai.models.generateVideos({
      model,
      prompt: request.prompt,
      image: readInlineImage(request.sourceImagePath),
      config,
    });

    if (!operation.name) return { success: false, error: 'No operation name returned from API' };

    const saved = await awaitVideoAndSave(
      apiKey,
      operation.name,
      request.outputPath || process.cwd(),
      request.filename || `video_${Date.now()}.mp4`,
      'Generation',
    );
    if ('error' in saved) return { success: false, error: saved.error };

    return {
      success: true,
      videoPath: saved.videoPath,
      prompt: request.prompt,
      model,
      aspectRatio: request.aspectRatio || '16:9',
      resolution,
      duration: durationSeconds,
      sourceImage: request.sourceImagePath,
      lastImage: request.lastImagePath,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Veo] Error: ${errorMessage}`);
    return { success: false, error: `Video generation from image failed: ${errorMessage}` };
  }
}

/**
 * 비디오 확장
 *
 * 공식 제약: Veo 로 생성된 720p · 141초 이하 영상만 입력 가능하며, 결과는 +7초 증분.
 * config 는 공식 샘플과 동일하게 numberOfVideos + resolution(720p 고정)만 전달한다
 * (durationSeconds / aspectRatio 는 extension 에서 유효하지 않음 — 비율은 입력 영상을 따름).
 */
export async function extendVideo(request: VideoExtensionRequest): Promise<VideoGenerationResponse> {
  const apiKey = requireGeminiKey();
  const model = request.model || DEFAULT_VIDEO_MODEL;

  try {
    // 소스 비디오 경로 검증
    validateFilePath(request.sourceVideoPath, { allowedExtensions: ALLOWED_EXTENSIONS.video });
    if (!fs.existsSync(request.sourceVideoPath)) {
      return { success: false, error: `Source video not found: ${request.sourceVideoPath}` };
    }

    const { GoogleGenAI } = await import('@google/genai');
    const genai = new GoogleGenAI({ apiKey });

    console.error(`[Veo] Starting video extension... (model: ${model})`);
    console.error(`[Veo] Source video: ${request.sourceVideoPath}`);
    console.error(`[Veo] Prompt: ${request.prompt.substring(0, 100)}...`);

    // 비디오 확장 요청 (공식 샘플 준거: durationSeconds / aspectRatio 미전달)
    const config: GenerateVideosConfig = {
      numberOfVideos: 1,
      resolution: '720p',
    };
    const operation = await genai.models.generateVideos({
      model,
      prompt: request.prompt,
      video: readInlineVideo(request.sourceVideoPath),
      config,
    });

    if (!operation.name) return { success: false, error: 'No operation name returned from API' };

    const saved = await awaitVideoAndSave(
      apiKey,
      operation.name,
      request.outputPath || process.cwd(),
      request.filename || `video_extended_${Date.now()}.mp4`,
      'Extension',
    );
    if ('error' in saved) return { success: false, error: saved.error };

    return {
      success: true,
      videoPath: saved.videoPath,
      prompt: request.prompt,
      model,
      resolution: '720p',
      duration: EXTENSION_ADDED_SECONDS, // 추가된 길이(+7초). 전체 길이 아님
      sourceVideo: request.sourceVideoPath,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Veo] Error: ${errorMessage}`);
    return { success: false, error: `Video extension failed: ${errorMessage}` };
  }
}

/**
 * 참조 이미지를 사용한 비디오 생성
 * 최대 3개의 참조 이미지로 캐릭터/제품 일관성을 유지하는 비디오 생성
 */
export async function generateWithReferences(request: ReferenceVideoRequest): Promise<VideoGenerationResponse> {
  const apiKey = requireGeminiKey();
  const model = request.model || DEFAULT_VIDEO_MODEL;
  const resolution = request.resolution || '720p';

  try {
    // 참조 이미지 경로 검증
    for (const imagePath of request.referenceImagePaths) {
      validateFilePath(imagePath, { allowedExtensions: ALLOWED_EXTENSIONS.image });
      if (!fs.existsSync(imagePath)) {
        return { success: false, error: `Reference image not found: ${imagePath}` };
      }
    }

    const { GoogleGenAI, VideoGenerationReferenceType } = await import('@google/genai');
    const genai = new GoogleGenAI({ apiKey });

    console.error(`[Veo] Starting video generation with reference images... (model: ${model})`);
    console.error(`[Veo] Reference images: ${request.referenceImagePaths.join(', ')}`);
    console.error(`[Veo] Prompt: ${request.prompt.substring(0, 100)}...`);

    const referenceImages: VideoGenerationReferenceImage[] = request.referenceImagePaths.map(
      (imagePath) => ({
        image: readInlineImage(imagePath),
        // SDK enum 값은 대문자 "ASSET" (소문자 'asset' 은 서버의 관대 처리에 기대는 비공식 값)
        referenceType: VideoGenerationReferenceType.ASSET,
      }),
    );

    // 비디오 생성 요청 (reference images 사용 시 durationSeconds 는 8초 강제)
    const config: GenerateVideosConfig = {
      aspectRatio: request.aspectRatio || '16:9',
      resolution,
      durationSeconds: DEFAULT_DURATION_SECONDS,
      referenceImages,
    };
    const operation = await genai.models.generateVideos({ model, prompt: request.prompt, config });

    if (!operation.name) return { success: false, error: 'No operation name returned from API' };

    const saved = await awaitVideoAndSave(
      apiKey,
      operation.name,
      request.outputPath || process.cwd(),
      request.filename || `video_ref_${Date.now()}.mp4`,
      'Generation',
    );
    if ('error' in saved) return { success: false, error: saved.error };

    return {
      success: true,
      videoPath: saved.videoPath,
      prompt: request.prompt,
      model,
      aspectRatio: request.aspectRatio || '16:9',
      resolution,
      duration: DEFAULT_DURATION_SECONDS,
      referenceImages: request.referenceImagePaths,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Veo] Error: ${errorMessage}`);
    return { success: false, error: `Video generation with references failed: ${errorMessage}` };
  }
}
