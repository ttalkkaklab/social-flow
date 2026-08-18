/**
 * OpenAI GPT Image generation client — ported from the fect-mcp-server gpt-image module.
 *
 * Uses the official `openai` SDK (v6).
 * - images.generate (text-to-image)
 * - images.edit (image-to-image, up to 16 multi-reference images, optional mask)
 *
 * GPT Image models always respond in b64_json format (response_format unsupported).
 *
 * Accuracy notes (per openai SDK v6 images.d.ts):
 *   - gpt-image-2 supports arbitrary resolutions (WIDTHxHEIGHT), so size is passed through as a string.
 *   - images.edit also supports output_format, so the response MIME follows the requested outputFormat.
 *   - input_fidelity is edit-only and can be passed only on gpt-image-1 / gpt-image-1.5.
 *     gpt-image-2 always runs at high, so the parameter must not be sent (official guide),
 *     and gpt-image-1-mini doesn't support it. (Both are pre-blocked in the schema superRefine.)
 *
 * The API key is validated at call time, not at startup (config.requireOpenAiKey).
 */

import { z } from 'zod';
import { requireOpenAiKey } from './config.js';

// Supported OpenAI image generation models (as of 2026-07, per openai SDK v6 ImageModel)
// - For simplicity only the GPT Image family is exposed (dall-e-* finished shutting down 2026-05-12).
// - EOL schedule: gpt-image-1 → 2026-10-23, gpt-image-1.5 / gpt-image-1-mini → 2026-12-01.
//   After that, gpt-image-2 is the only model left on the Images API.
export const VALID_GPT_IMAGE_MODELS = [
  'gpt-image-2',      // newest · recommended default (photorealism + strong instruction adherence, reasoning-based)
  'gpt-image-1.5',    // quality/cost balance (mid-tier) — shutdown scheduled 2026-12-01
  'gpt-image-1',      // previous generation — shutdown scheduled 2026-10-23
  'gpt-image-1-mini', // cheap, lower-quality option — shutdown scheduled 2026-12-01
] as const;

export type GPTImageModel = (typeof VALID_GPT_IMAGE_MODELS)[number];

const DEFAULT_MODEL: GPTImageModel = 'gpt-image-2';

// Only gpt-image-2 supports arbitrary resolutions (WIDTHxHEIGHT).
const GPT_IMAGE_FLEXIBLE_SIZE_MODELS: readonly GPTImageModel[] = ['gpt-image-2'];

// Standard size presets supported by every GPT Image model.
export const GPT_IMAGE_SIZE_PRESETS = [
  'auto',
  '1024x1024',
  '1536x1024', // landscape
  '1024x1536', // portrait
] as const;

// gpt-image-2 arbitrary-resolution constraints (per openai SDK v6 images.d.ts / image-generation guide)
const WH_SIZE_RE = /^(\d+)x(\d+)$/;
const GPT_IMAGE_MAX_EDGE = 3840; // max edge length (px)
const GPT_IMAGE_MIN_TOTAL_PIXELS = 655_360; // total pixel floor
const GPT_IMAGE_MAX_TOTAL_PIXELS = 8_294_400; // total pixel ceiling
const GPT_IMAGE_MAX_ASPECT = 3; // aspect ratio 1:3 ~ 3:1

/**
 * size field schema: a preset (auto/1024x1024/1536x1024/1024x1536) or a custom
 * "WIDTHxHEIGHT" string (gpt-image-2 only; model-dependent constraints are
 * validated in superRefine).
 */
const GptImageSizeSchema = z.string().refine(
  (s) => (GPT_IMAGE_SIZE_PRESETS as readonly string[]).includes(s) || WH_SIZE_RE.test(s),
  {
    message:
      'size must be one of auto/1024x1024/1536x1024/1024x1536, or a custom "WIDTHxHEIGHT" string (e.g. "1536x864").',
  },
);

export const VALID_GPT_IMAGE_QUALITIES = ['low', 'medium', 'high', 'auto'] as const;
export const VALID_GPT_IMAGE_BACKGROUNDS = ['opaque', 'transparent', 'auto'] as const;
export const VALID_GPT_IMAGE_FORMATS = ['png', 'jpeg', 'webp'] as const;
export type GPTImageFormat = (typeof VALID_GPT_IMAGE_FORMATS)[number];

// Input detail preservation strength (images.edit only)
// - gpt-image-1-mini: unsupported.
// - gpt-image-2: always runs at high and the parameter itself cannot be passed
//   (official guide: "omit this parameter; the API doesn't allow changing it").
export const VALID_GPT_IMAGE_INPUT_FIDELITY = ['high', 'low'] as const;

// input image MIME
export const VALID_GPT_IMAGE_INPUT_MIME = ['image/png', 'image/jpeg', 'image/webp'] as const;

type GPTImageBackground = (typeof VALID_GPT_IMAGE_BACKGROUNDS)[number];

/**
 * Validate the size value against the model's constraints.
 * - Presets are allowed on every model.
 * - Custom WIDTHxHEIGHT is allowed only on gpt-image-2 and must satisfy the
 *   multiple-of-16 / aspect ratio (1:3~3:1) / max edge / total pixel constraints.
 */
function validateSizeAgainstModel(model: GPTImageModel, size: string, ctx: z.RefinementCtx): void {
  if ((GPT_IMAGE_SIZE_PRESETS as readonly string[]).includes(size)) return;

  const match = WH_SIZE_RE.exec(size);
  if (!match) return; // already rejected by the field schema refine

  if (!GPT_IMAGE_FLEXIBLE_SIZE_MODELS.includes(model)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['size'],
      message: `Custom resolutions ("${size}") are only supported on gpt-image-2. On other models use ${GPT_IMAGE_SIZE_PRESETS.join(' / ')} only.`,
    });
    return;
  }

  const width = Number(match[1]);
  const height = Number(match[2]);
  const violations: string[] = [];

  if (width % 16 !== 0 || height % 16 !== 0) {
    violations.push('width and height must be multiples of 16');
  }
  if (Math.max(width, height) > GPT_IMAGE_MAX_EDGE) {
    violations.push(`the longest edge must be at most ${GPT_IMAGE_MAX_EDGE}px`);
  }
  const shortEdge = Math.min(width, height);
  if (shortEdge === 0 || Math.max(width, height) / shortEdge > GPT_IMAGE_MAX_ASPECT) {
    violations.push('the aspect ratio must be within 1:3 ~ 3:1');
  }
  const totalPixels = width * height;
  if (totalPixels < GPT_IMAGE_MIN_TOTAL_PIXELS || totalPixels > GPT_IMAGE_MAX_TOTAL_PIXELS) {
    violations.push(
      `the total pixel count must be within ${GPT_IMAGE_MIN_TOTAL_PIXELS.toLocaleString()}~${GPT_IMAGE_MAX_TOTAL_PIXELS.toLocaleString()}`,
    );
  }

  if (violations.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['size'],
      message: `Custom resolution "${size}" violates constraints: ${violations.join(', ')}`,
    });
  }
}

/**
 * Validate the background value against model/output-format constraints.
 * - gpt-image-2 does not support transparent (documented fact).
 * - transparent is only possible with png/webp output, which support transparency (not jpeg).
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
        'gpt-image-2 does not support transparent backgrounds. Use opaque/auto, or switch to gpt-image-1 (EOL 2026-10-23) / gpt-image-1.5 (EOL 2026-12-01). After EOL no model supports transparency, so consider post-processing (background removal).',
    });
  }
  if (outputFormat === 'jpeg') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['outputFormat'],
      message: 'Transparent backgrounds are only possible with png or webp output (not jpeg).',
    });
  }
}

// Text-to-Image request schema (POST /v1/images/generations)
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

// Image-to-Image (edit / reference composition) request schema (POST /v1/images/edits)
// Note: from openai SDK v6, images.edit also supports output_format / input_fidelity.
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
            'inputFidelity is not supported on gpt-image-1-mini. Use gpt-image-1 / gpt-image-1.5.',
        });
      } else if (data.model === 'gpt-image-2') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['inputFidelity'],
          message:
            'gpt-image-2 always runs at high fidelity and does not accept the inputFidelity parameter. Omit the parameter.',
        });
      }
    }
  });

export type Text2ImageRequest = z.infer<typeof text2ImageSchema>;
export type Img2ImgRequest = z.infer<typeof img2ImgSchema>;

// image generation response
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

// outputFormat → MIME mapping
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

/** Generate an image from a text prompt (POST /v1/images/generations) */
export async function generateFromText(request: Text2ImageRequest): Promise<ImageGenerationResponse> {
  const apiKey = requireOpenAiKey();
  const model = request.model || DEFAULT_MODEL;
  const outputFormat = request.outputFormat || 'png';
  const responseMime = formatToMime(outputFormat);

  try {
    // dynamic import of the openai SDK — loaded only when a generation tool is called
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

/** Edit/compose from reference images + a prompt (POST /v1/images/edits) */
export async function generateFromImage(request: Img2ImgRequest): Promise<ImageGenerationResponse> {
  const apiKey = requireOpenAiKey();
  const model = request.model || DEFAULT_MODEL;
  const sourceMime = request.sourceMimeType || 'image/png';
  const outputFormat = request.outputFormat || 'png';
  const responseMime = formatToMime(outputFormat);

  try {
    const { default: OpenAI, toFile } = await import('openai');
    const client = new OpenAI({ apiKey });

    // Decode base64 and convert to Uploadable sequentially, to ease memory pressure.
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

/** Extract the first image's base64 from an OpenAI response */
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
