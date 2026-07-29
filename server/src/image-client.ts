/**
 * OpenAI GPT Image 생성 클라이언트 — fect-mcp-server gpt-image 모듈 이식.
 *
 * `openai` 공식 SDK(v6)를 사용한다.
 * - images.generate (text-to-image)
 * - images.edit (image-to-image, 멀티 레퍼런스 최대 16장, optional mask)
 *
 * GPT Image 계열 모델은 항상 b64_json 형식으로 응답한다(response_format 미지원).
 *
 * 정확성 참고(openai SDK v6 images.d.ts 준거):
 *   - gpt-image-2 는 임의 해상도(WIDTHxHEIGHT)를 지원하므로 size 를 문자열 그대로 전달한다.
 *   - images.edit 도 output_format 을 지원하므로 응답 MIME 은 요청한 outputFormat 을 따른다.
 *   - input_fidelity 는 edit 전용이며 gpt-image-1 / gpt-image-1.5 에서만 전달 가능하다.
 *     gpt-image-2 는 항상 high 로 동작하므로 파라미터를 전달하면 안 되고(공식 가이드),
 *     gpt-image-1-mini 는 미지원이다. (둘 다 스키마 superRefine 에서 사전 차단됨)
 *
 * API 키는 기동 시가 아니라 호출 시점에 검증한다 (config.requireOpenAiKey).
 */

import { z } from 'zod';
import { requireOpenAiKey } from './config.js';

// 지원되는 OpenAI 이미지 생성 모델 (2026-07 기준, openai SDK v6 ImageModel 준거)
// - 편의를 위해 GPT Image 계열만 노출한다(dall-e-* 는 2026-05-12 셧다운 완료).
// - EOL 일정: gpt-image-1 → 2026-10-23, gpt-image-1.5 / gpt-image-1-mini → 2026-12-01.
//   그 이후 Images API에 남는 모델은 gpt-image-2 하나뿐이다.
export const VALID_GPT_IMAGE_MODELS = [
  'gpt-image-2',      // 최신 · 권장 기본값 (photorealism + 강한 지시 준수, reasoning 기반)
  'gpt-image-1.5',    // 품질/비용 균형 (mid-tier) — 2026-12-01 셧다운 예정
  'gpt-image-1',      // 이전 세대 — 2026-10-23 셧다운 예정
  'gpt-image-1-mini', // 저가 · 저품질 옵션 — 2026-12-01 셧다운 예정
] as const;

export type GPTImageModel = (typeof VALID_GPT_IMAGE_MODELS)[number];

const DEFAULT_MODEL: GPTImageModel = 'gpt-image-2';

// gpt-image-2 만 임의 해상도(WIDTHxHEIGHT)를 지원한다.
const GPT_IMAGE_FLEXIBLE_SIZE_MODELS: readonly GPTImageModel[] = ['gpt-image-2'];

// 모든 GPT Image 모델이 공통으로 지원하는 표준 크기 프리셋.
export const GPT_IMAGE_SIZE_PRESETS = [
  'auto',
  '1024x1024',
  '1536x1024', // landscape
  '1024x1536', // portrait
] as const;

// gpt-image-2 임의 해상도 제약 (openai SDK v6 images.d.ts / image-generation 가이드 준거)
const WH_SIZE_RE = /^(\d+)x(\d+)$/;
const GPT_IMAGE_MAX_EDGE = 3840; // 최대 변 길이(px)
const GPT_IMAGE_MIN_TOTAL_PIXELS = 655_360; // 총 픽셀 하한
const GPT_IMAGE_MAX_TOTAL_PIXELS = 8_294_400; // 총 픽셀 상한
const GPT_IMAGE_MAX_ASPECT = 3; // 가로세로 비율 1:3 ~ 3:1

/**
 * size 필드 스키마: 프리셋(auto/1024x1024/1536x1024/1024x1536) 또는
 * 커스텀 "WIDTHxHEIGHT" 문자열(gpt-image-2 전용, 모델 종속 제약은 superRefine에서 검증).
 */
const GptImageSizeSchema = z.string().refine(
  (s) => (GPT_IMAGE_SIZE_PRESETS as readonly string[]).includes(s) || WH_SIZE_RE.test(s),
  {
    message:
      'size는 auto/1024x1024/1536x1024/1024x1536 중 하나이거나, 커스텀 "WIDTHxHEIGHT"(예: "1536x864") 형식이어야 합니다.',
  },
);

export const VALID_GPT_IMAGE_QUALITIES = ['low', 'medium', 'high', 'auto'] as const;
export const VALID_GPT_IMAGE_BACKGROUNDS = ['opaque', 'transparent', 'auto'] as const;
export const VALID_GPT_IMAGE_FORMATS = ['png', 'jpeg', 'webp'] as const;
export type GPTImageFormat = (typeof VALID_GPT_IMAGE_FORMATS)[number];

// 입력 디테일 보존 강도 (images.edit 전용)
// - gpt-image-1-mini: 미지원.
// - gpt-image-2: 항상 high 로 동작하며 파라미터 자체를 전달할 수 없다(공식 가이드:
//   "omit this parameter; the API doesn't allow changing it").
export const VALID_GPT_IMAGE_INPUT_FIDELITY = ['high', 'low'] as const;

// 입력 이미지 MIME
export const VALID_GPT_IMAGE_INPUT_MIME = ['image/png', 'image/jpeg', 'image/webp'] as const;

type GPTImageBackground = (typeof VALID_GPT_IMAGE_BACKGROUNDS)[number];

/**
 * size 값을 모델 제약에 맞게 검증한다.
 * - 프리셋은 모든 모델에서 허용.
 * - 커스텀 WIDTHxHEIGHT는 gpt-image-2 에서만 허용하며, 16 배수 / 비율(1:3~3:1) /
 *   최대 변 / 총 픽셀 제약을 만족해야 한다.
 */
function validateSizeAgainstModel(model: GPTImageModel, size: string, ctx: z.RefinementCtx): void {
  if ((GPT_IMAGE_SIZE_PRESETS as readonly string[]).includes(size)) return;

  const match = WH_SIZE_RE.exec(size);
  if (!match) return; // 필드 스키마 refine 에서 이미 거부됨

  if (!GPT_IMAGE_FLEXIBLE_SIZE_MODELS.includes(model)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['size'],
      message: `커스텀 해상도("${size}")는 gpt-image-2 에서만 지원됩니다. 다른 모델은 ${GPT_IMAGE_SIZE_PRESETS.join(' / ')} 만 사용하세요.`,
    });
    return;
  }

  const width = Number(match[1]);
  const height = Number(match[2]);
  const violations: string[] = [];

  if (width % 16 !== 0 || height % 16 !== 0) {
    violations.push('가로·세로는 16의 배수여야 합니다');
  }
  if (Math.max(width, height) > GPT_IMAGE_MAX_EDGE) {
    violations.push(`최대 변은 ${GPT_IMAGE_MAX_EDGE}px 이하여야 합니다`);
  }
  const shortEdge = Math.min(width, height);
  if (shortEdge === 0 || Math.max(width, height) / shortEdge > GPT_IMAGE_MAX_ASPECT) {
    violations.push('가로세로 비율은 1:3 ~ 3:1 범위여야 합니다');
  }
  const totalPixels = width * height;
  if (totalPixels < GPT_IMAGE_MIN_TOTAL_PIXELS || totalPixels > GPT_IMAGE_MAX_TOTAL_PIXELS) {
    violations.push(
      `총 픽셀 수는 ${GPT_IMAGE_MIN_TOTAL_PIXELS.toLocaleString()}~${GPT_IMAGE_MAX_TOTAL_PIXELS.toLocaleString()} 범위여야 합니다`,
    );
  }

  if (violations.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['size'],
      message: `커스텀 해상도 "${size}" 제약 위반: ${violations.join(', ')}`,
    });
  }
}

/**
 * background 값을 모델/출력 포맷 제약에 맞게 검증한다.
 * - gpt-image-2 는 transparent 를 지원하지 않는다(문서화된 사실).
 * - transparent 는 투명도를 지원하는 png/webp 출력에서만 가능하다(jpeg 불가).
 */
function validateBackground(
  model: GPTImageModel,
  background: GPTImageBackground,
  outputFormat: GPTImageFormat,
  ctx: z.RefinementCtx,
): void {
  if (background !== 'transparent') return;

  if (model === 'gpt-image-2') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['background'],
      message:
        'gpt-image-2 는 투명 배경(transparent)을 지원하지 않습니다. opaque/auto 를 쓰거나 gpt-image-1(EOL 2026-10-23) / gpt-image-1.5(EOL 2026-12-01) 로 변경하세요. EOL 이후에는 투명 배경 지원 모델이 없으므로 후처리(배경 제거)를 검토하세요.',
    });
  }
  if (outputFormat === 'jpeg') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['outputFormat'],
      message: '투명 배경(transparent)은 png 또는 webp 출력에서만 가능합니다(jpeg 불가).',
    });
  }
}

// Text-to-Image 요청 스키마 (POST /v1/images/generations)
export const text2ImageSchema = z
  .object({
    prompt: z.string().min(1, 'Prompt is required').max(32_000, 'Prompt exceeds the 32,000-character limit for GPT Image models'),
    model: z.enum(VALID_GPT_IMAGE_MODELS).optional().default(DEFAULT_MODEL),
    size: GptImageSizeSchema.optional().default('auto'),
    quality: z.enum(VALID_GPT_IMAGE_QUALITIES).optional().default('auto'),
    background: z.enum(VALID_GPT_IMAGE_BACKGROUNDS).optional().default('opaque'),
    outputFormat: z.enum(VALID_GPT_IMAGE_FORMATS).optional().default('png'),
    savePath: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    validateSizeAgainstModel(data.model, data.size, ctx);
    validateBackground(data.model, data.background, data.outputFormat, ctx);
  });

// Image-to-Image (edit / reference 합성) 요청 스키마 (POST /v1/images/edits)
// 참고: openai SDK v6 부터 images.edit 도 output_format / input_fidelity 를 지원한다.
export const img2ImgSchema = z
  .object({
    prompt: z.string().min(1, 'Prompt is required').max(32_000, 'Prompt exceeds the 32,000-character limit for GPT Image models'),
    sourceImagesBase64: z
      .array(z.string().min(1))
      .min(1, 'At least one source image is required')
      .max(16, 'At most 16 source images are supported'),
    sourceMimeType: z.enum(VALID_GPT_IMAGE_INPUT_MIME).optional().default('image/png'),
    maskBase64: z.string().optional(),
    model: z.enum(VALID_GPT_IMAGE_MODELS).optional().default(DEFAULT_MODEL),
    size: GptImageSizeSchema.optional().default('auto'),
    quality: z.enum(VALID_GPT_IMAGE_QUALITIES).optional().default('auto'),
    background: z.enum(VALID_GPT_IMAGE_BACKGROUNDS).optional().default('opaque'),
    outputFormat: z.enum(VALID_GPT_IMAGE_FORMATS).optional().default('png'),
    inputFidelity: z.enum(VALID_GPT_IMAGE_INPUT_FIDELITY).optional(),
    savePath: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    validateSizeAgainstModel(data.model, data.size, ctx);
    validateBackground(data.model, data.background, data.outputFormat, ctx);
    if (data.inputFidelity) {
      if (data.model === 'gpt-image-1-mini') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['inputFidelity'],
          message:
            'inputFidelity 는 gpt-image-1-mini 에서 지원되지 않습니다. gpt-image-1 / gpt-image-1.5 를 사용하세요.',
        });
      } else if (data.model === 'gpt-image-2') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['inputFidelity'],
          message:
            'gpt-image-2 는 항상 high fidelity 로 동작하며 inputFidelity 파라미터를 받지 않습니다. 파라미터를 생략하세요.',
        });
      }
    }
  });

export type Text2ImageRequest = z.infer<typeof text2ImageSchema>;
export type Img2ImgRequest = z.infer<typeof img2ImgSchema>;

// 이미지 생성 응답
export interface ImageGenerationResponse {
  success: boolean;
  base64: string;
  mimeType: string;
  prompt: string;
  model: string;
  size?: string;
  quality?: string;
  revisedPrompt?: string;
  error?: string;
}

// outputFormat → MIME 매핑
function formatToMime(format: GPTImageFormat): string {
  switch (format) {
    case 'png':
      return 'image/png';
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
  }
}

function mimeToExt(mime: string): string {
  switch (mime) {
    case 'image/png':
      return 'png';
    case 'image/jpeg':
      return 'jpg';
    case 'image/webp':
      return 'webp';
    default:
      return 'png';
  }
}

/** 텍스트 프롬프트로 이미지 생성 (POST /v1/images/generations) */
export async function generateFromText(request: Text2ImageRequest): Promise<ImageGenerationResponse> {
  const apiKey = requireOpenAiKey();
  const model = request.model || DEFAULT_MODEL;
  const outputFormat = request.outputFormat || 'png';
  const responseMime = formatToMime(outputFormat);

  try {
    // openai SDK 동적 import — 생성 툴 호출 시에만 로드
    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey });

    const response = await client.images.generate({
      model,
      prompt: request.prompt,
      n: 1,
      size: request.size,
      quality: request.quality,
      background: request.background,
      output_format: outputFormat,
    });

    return extractImage(response, request.prompt, {
      model,
      size: request.size,
      quality: request.quality,
      mimeType: responseMime,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false, base64: '', mimeType: responseMime,
      prompt: request.prompt, model,
      error: errorMessage,
    };
  }
}

/** 레퍼런스 이미지 + 프롬프트로 편집/합성 (POST /v1/images/edits) */
export async function generateFromImage(request: Img2ImgRequest): Promise<ImageGenerationResponse> {
  const apiKey = requireOpenAiKey();
  const model = request.model || DEFAULT_MODEL;
  const sourceMime = request.sourceMimeType || 'image/png';
  const outputFormat = request.outputFormat || 'png';
  const responseMime = formatToMime(outputFormat);

  try {
    const { default: OpenAI, toFile } = await import('openai');
    const client = new OpenAI({ apiKey });

    // 메모리 압박 완화를 위해 base64 디코딩과 Uploadable 변환을 순차 처리한다.
    const sourceExt = mimeToExt(sourceMime);
    const imageFiles = [];
    for (let i = 0; i < request.sourceImagesBase64.length; i++) {
      const file = await toFile(
        Buffer.from(request.sourceImagesBase64[i], 'base64'),
        `source-${i}.${sourceExt}`,
        { type: sourceMime },
      );
      imageFiles.push(file);
    }

    const maskFile = request.maskBase64
      ? await toFile(Buffer.from(request.maskBase64, 'base64'), 'mask.png', { type: 'image/png' })
      : undefined;

    const response = await client.images.edit({
      model,
      prompt: request.prompt,
      image: imageFiles.length === 1 ? imageFiles[0] : imageFiles,
      n: 1,
      size: request.size,
      quality: request.quality,
      background: request.background,
      output_format: outputFormat,
      ...(request.inputFidelity ? { input_fidelity: request.inputFidelity } : {}),
      ...(maskFile ? { mask: maskFile } : {}),
    });

    return extractImage(response, request.prompt, {
      model,
      size: request.size,
      quality: request.quality,
      mimeType: responseMime,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false, base64: '', mimeType: responseMime,
      prompt: request.prompt, model,
      error: errorMessage,
    };
  }
}

/** OpenAI 응답에서 첫 번째 이미지의 base64 추출 */
function extractImage(
  response: { data?: Array<{ b64_json?: string; revised_prompt?: string }> },
  prompt: string,
  meta: { model: string; size?: string; quality?: string; mimeType: string },
): ImageGenerationResponse {
  const fail = (error: string): ImageGenerationResponse => ({
    success: false, base64: '', mimeType: meta.mimeType, prompt, model: meta.model, error,
  });

  if (!response || !Array.isArray(response.data) || response.data.length === 0) {
    return fail('No image data returned from OpenAI');
  }

  const first = response.data[0];
  const b64 = first?.b64_json;
  if (!b64 || typeof b64 !== 'string') {
    return fail('Response did not include b64_json');
  }

  return {
    success: true,
    base64: b64,
    mimeType: meta.mimeType,
    prompt,
    model: meta.model,
    size: meta.size,
    quality: meta.quality,
    revisedPrompt: typeof first?.revised_prompt === 'string' ? first.revised_prompt : undefined,
  };
}
