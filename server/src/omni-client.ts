/**
 * Gemini Omni 1.1 Flash video client — the Interactions API lane next to Veo 3.1.
 *
 * Omni is one model with a task mode rather than a family of models, and it does not
 * go through `models.generateVideos` at all: every call is `interactions.create`, which
 * returns an interaction id that later calls continue from. What that buys over
 * video-client.ts is generation in 1-second steps from 3 to 10, and editing an existing
 * clip by instruction — a lane Veo has no equivalent for.
 *
 * It is not the cheap lane. Billing is per call, not per second: every call meters exactly
 * 57,920 output video tokens whatever was asked for, and a 3s 360p call moved the project's
 * spend counter by $1.01 (measured 2026-09-06). A short Omni cut costs more than a full
 * 8-second Veo shot, so ask for the seconds you want — a shorter clip refunds nothing.
 *
 * Contract measured against the live API on 2026-09-06 (@google/genai 2.21.0):
 * - `response_format.duration` is the string `"<n>s"`; 11s comes back 400 "exceeds the
 *   maximum allowed 10s".
 * - 360p 9:16 renders 360x640 h264 + AAC at 24 fps — audio is always on, as on Veo.
 * - `previous_interaction_id` and `generation_config.video_config.task` are mutually
 *   exclusive ("previous_interaction_id is not allowed when video task is set"), so the
 *   continue-from-id path sends no task and lets the prompt pick the mode.
 * - `aspect_ratio` is rejected on the extend task ("Aspect ratio cannot be set in response
 *   format for extend task") — extend and edit inherit the ratio of the input video.
 * - Extending returns the whole cut, not the added tail: a 3s clip continued by id came
 *   back 6.016s, and the same clip sent inline with no duration came back 13.013s (the
 *   default 10s appended). Editing returns the same length as the input, 3.008s.
 *
 * Delivery is pinned to `uri`: the mp4 lands in the Files API and is downloaded with the
 * key in the header, the same leak-surface reasoning as video-client.ts. Only the saved
 * path and the interaction id come back to the caller.
 */

import * as fs from 'node:fs';
import { z } from 'zod';
import { requireGeminiKey } from './config.js';
import {
  ALLOWED_EXTENSIONS,
  bareFilenameSchema,
  mimeFromExtension,
  resolveOutputFile,
  validateFilePath,
} from './media-utils.js';

/** The only Omni model callable on the Gemini API. The preview id it replaced shuts down 2026-09-30. */
export const OMNI_MODEL = 'gemini-omni-1.1-flash';

export const VALID_OMNI_ASPECT_RATIOS = ['16:9', '9:16'] as const;
export const VALID_OMNI_RESOLUTIONS = ['360p', '720p', '1080p', '4k'] as const;
export type OmniResolution = (typeof VALID_OMNI_RESOLUTIONS)[number];

const POLL_INTERVAL_MS = 5_000;
const MAX_POLLS = 120; // 10-minute max wait (5s * 120)
const FILES_API_HOST = 'https://generativelanguage.googleapis.com';

/**
 * 3 to 10 seconds, in whole seconds. Veo's 4/6/8 grid does not apply here — the API
 * takes any integer in range and rejects 11s outright.
 */
const durationSchema = z.number().int().min(3).max(10).optional().default(8);

/**
 * 1080p and 4k are upscales of the generated frames, not native renders (Google's own
 * release note calls them upscaled). 360p buys speed, not money — see the header on billing.
 */
const resolutionSchema = z.enum(VALID_OMNI_RESOLUTIONS).optional().default('720p');

const aspectRatioSchema = z.enum(VALID_OMNI_ASPECT_RATIOS).optional().default('16:9');

// Text-to-Video
export const omniText2VideoSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required'),
  aspectRatio: aspectRatioSchema,
  resolution: resolutionSchema,
  durationSeconds: durationSchema,
  seed: z.number().int().optional(),
  outputPath: z.string().optional(),
  filename: bareFilenameSchema('video').optional(),
});

// Image-to-Video — one image is the first frame, two interpolate between them
export const omniImg2VideoSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required'),
  sourceImagePath: z.string().min(1, 'Source image path is required'),
  lastImagePath: z.string().optional(),
  aspectRatio: aspectRatioSchema,
  resolution: resolutionSchema,
  durationSeconds: durationSchema,
  seed: z.number().int().optional(),
  outputPath: z.string().optional(),
  filename: bareFilenameSchema('video').optional(),
});

/**
 * Extend and edit share a shape: either continue from an interaction this session already
 * made, or hand over a local mp4. Exactly one of the two, because the id path forbids the
 * task field and the file path needs it.
 */
const continuationFields = {
  prompt: z.string().min(1, 'Prompt is required'),
  previousInteractionId: z.string().optional(),
  sourceVideoPath: z.string().optional(),
  resolution: resolutionSchema,
  seed: z.number().int().optional(),
  outputPath: z.string().optional(),
  filename: bareFilenameSchema('video').optional(),
};

function requireOneSource(
  data: { previousInteractionId?: string; sourceVideoPath?: string },
  ctx: z.RefinementCtx,
): void {
  const given = [data.previousInteractionId, data.sourceVideoPath].filter(Boolean).length;
  if (given !== 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['previousInteractionId'],
      message:
        'Give exactly one source: previousInteractionId (an interaction from an earlier omni_* call) ' +
        'or sourceVideoPath (a local mp4 of at most 10 seconds).',
    });
  }
}

export const omniExtendSchema = z
  .object({ ...continuationFields, durationSeconds: durationSchema })
  .superRefine(requireOneSource);

export const omniEditSchema = z.object(continuationFields).superRefine(requireOneSource);

export type OmniText2VideoRequest = z.infer<typeof omniText2VideoSchema>;
export type OmniImg2VideoRequest = z.infer<typeof omniImg2VideoSchema>;
export type OmniExtendRequest = z.infer<typeof omniExtendSchema>;
export type OmniEditRequest = z.infer<typeof omniEditSchema>;

export interface OmniVideoResponse {
  success: boolean;
  videoPath?: string;
  error?: string;
  prompt?: string;
  model?: string;
  /** Feed this back as previousInteractionId to extend or edit the result. */
  interactionId?: string;
  aspectRatio?: string;
  resolution?: string;
  duration?: number;
  sourceImage?: string;
  lastImage?: string;
  sourceVideo?: string;
}

// ── shared plumbing ──────────────────────────────────────────────

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mime_type: string }
  | { type: 'video'; data: string; mime_type: string };

interface ResponseFormat {
  type: 'video';
  resolution: OmniResolution;
  delivery: 'uri';
  aspect_ratio?: string;
  duration?: string;
}

interface CreateParams {
  model: string;
  input: string | ContentBlock[];
  response_format: ResponseFormat;
  background: true;
  previous_interaction_id?: string;
  generation_config?: { seed?: number; video_config?: { task: string } };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readInlineFile(filePath: string, kind: 'image' | 'video'): ContentBlock {
  const data = fs.readFileSync(filePath).toString('base64');
  return { type: kind, data, mime_type: mimeFromExtension(filePath, kind) } as ContentBlock;
}

/** Download the finished mp4 — key in the header, never in the URL (see video-client.ts). */
async function downloadVideo(apiKey: string, videoUri: string): Promise<Buffer> {
  if (!videoUri.startsWith(`${FILES_API_HOST}/`)) {
    throw new Error(`Refusing to download from an unexpected host: ${videoUri}`);
  }
  const response = await fetch(videoUri, { headers: { 'x-goog-api-key': apiKey } });
  if (!response.ok) throw new Error(`Failed to download video: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Create the interaction in the background, poll it to completion, save the mp4.
 *
 * A failed interaction reports itself two ways — a non-completed status, and an `errors`
 * array on an otherwise finished one — so both are read before the video is looked for.
 */
async function runInteraction(
  params: CreateParams,
  outputPath: string,
  filename: string,
  label: string,
): Promise<{ videoPath: string; interactionId: string } | { error: string }> {
  const apiKey = requireGeminiKey();
  const { GoogleGenAI } = await import('@google/genai');
  const genai = new GoogleGenAI({ apiKey });

  // The path is resolved before the call: a bad directory must not cost a paid generation.
  const fullPath = resolveOutputFile(outputPath, filename, 'video');

  console.error(`[Omni] ${label} starting... (${params.response_format.resolution})`);
  const created = await genai.interactions.create(params);
  const interactionId = created.id;
  if (!interactionId) return { error: 'No interaction id returned from API' };

  for (let poll = 1; poll <= MAX_POLLS; poll++) {
    await sleep(POLL_INTERVAL_MS);
    const current = await genai.interactions.get(interactionId);

    if (current.status === 'in_progress' || current.status === 'queued') {
      console.error(`[Omni] ${label} in progress... (polling ${poll}/${MAX_POLLS})`);
      continue;
    }

    if (current.status !== 'completed') {
      const detail = current.errors?.map((e) => JSON.stringify(e)).join('; ');
      return { error: `Interaction ${current.status}${detail ? `: ${detail}` : ''}` };
    }
    if (current.errors?.length) {
      return { error: `Interaction reported errors: ${current.errors.map((e) => JSON.stringify(e)).join('; ')}` };
    }

    const videoUri = current.output_video?.uri;
    if (!videoUri) return { error: 'Interaction completed without a video output' };

    fs.writeFileSync(fullPath, await downloadVideo(apiKey, videoUri));
    console.error(`[Omni] Video saved to: ${fullPath}`);
    return { videoPath: fullPath, interactionId };
  }

  return { error: 'Video generation timed out (10 minutes)' };
}

function failure(error: unknown): OmniVideoResponse {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[Omni] Error: ${message}`);
  return { success: false, error: message };
}

const defaults = (request: { outputPath?: string; filename?: string }) => ({
  dir: request.outputPath || process.cwd(),
  name: request.filename || `omni_${Date.now()}.mp4`,
});

// ── the 4 generation functions ───────────────────────────────────

export async function generateFromText(request: OmniText2VideoRequest): Promise<OmniVideoResponse> {
  try {
    const { dir, name } = defaults(request);
    const saved = await runInteraction(
      {
        model: OMNI_MODEL,
        input: request.prompt,
        response_format: {
          type: 'video',
          aspect_ratio: request.aspectRatio,
          resolution: request.resolution,
          duration: `${request.durationSeconds}s`,
          delivery: 'uri',
        },
        background: true,
        generation_config: {
          ...(request.seed === undefined ? {} : { seed: request.seed }),
          video_config: { task: 'text_to_video' },
        },
      },
      dir,
      name,
      'Text-to-video',
    );
    if ('error' in saved) return { success: false, error: saved.error };

    return {
      success: true,
      videoPath: saved.videoPath,
      interactionId: saved.interactionId,
      prompt: request.prompt,
      model: OMNI_MODEL,
      aspectRatio: request.aspectRatio,
      resolution: request.resolution,
      duration: request.durationSeconds,
    };
  } catch (error) {
    return failure(error);
  }
}

/** One image is the first frame; adding lastImagePath interpolates between the two. */
export async function generateFromImage(request: OmniImg2VideoRequest): Promise<OmniVideoResponse> {
  try {
    validateFilePath(request.sourceImagePath, { allowedExtensions: ALLOWED_EXTENSIONS.image });
    if (request.lastImagePath) {
      validateFilePath(request.lastImagePath, { allowedExtensions: ALLOWED_EXTENSIONS.image });
    }

    const input: ContentBlock[] = [
      { type: 'text', text: request.prompt },
      readInlineFile(request.sourceImagePath, 'image'),
    ];
    if (request.lastImagePath) input.push(readInlineFile(request.lastImagePath, 'image'));

    const { dir, name } = defaults(request);
    const saved = await runInteraction(
      {
        model: OMNI_MODEL,
        input,
        response_format: {
          type: 'video',
          aspect_ratio: request.aspectRatio,
          resolution: request.resolution,
          duration: `${request.durationSeconds}s`,
          delivery: 'uri',
        },
        background: true,
        generation_config: {
          ...(request.seed === undefined ? {} : { seed: request.seed }),
          video_config: { task: 'image_to_video' },
        },
      },
      dir,
      name,
      request.lastImagePath ? 'Frame interpolation' : 'Image-to-video',
    );
    if ('error' in saved) return { success: false, error: saved.error };

    return {
      success: true,
      videoPath: saved.videoPath,
      interactionId: saved.interactionId,
      prompt: request.prompt,
      model: OMNI_MODEL,
      aspectRatio: request.aspectRatio,
      resolution: request.resolution,
      duration: request.durationSeconds,
      sourceImage: request.sourceImagePath,
      lastImage: request.lastImagePath,
    };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Build the params for the two continuation modes.
 *
 * Continuing from an interaction id cannot carry a task, so the prompt alone decides
 * whether the model appends or rewrites — say "continue" for extend and "change X to Y"
 * for edit and it lands right. A local file carries the task explicitly. Neither mode
 * may set aspect_ratio; the input video's ratio wins.
 */
function continuationParams(
  request: OmniExtendRequest | OmniEditRequest,
  task: 'extend' | 'edit',
  durationSeconds?: number,
): CreateParams {
  const response_format: ResponseFormat = {
    type: 'video',
    resolution: request.resolution,
    delivery: 'uri',
    ...(durationSeconds === undefined ? {} : { duration: `${durationSeconds}s` }),
  };
  const seed = request.seed === undefined ? {} : { seed: request.seed };

  if (request.previousInteractionId) {
    return {
      model: OMNI_MODEL,
      input: request.prompt,
      response_format,
      background: true,
      previous_interaction_id: request.previousInteractionId,
      ...(request.seed === undefined ? {} : { generation_config: seed }),
    };
  }

  validateFilePath(request.sourceVideoPath as string, { allowedExtensions: ALLOWED_EXTENSIONS.video });
  return {
    model: OMNI_MODEL,
    input: [
      { type: 'text', text: request.prompt },
      readInlineFile(request.sourceVideoPath as string, 'video'),
    ],
    response_format,
    background: true,
    generation_config: { ...seed, video_config: { task } },
  };
}

/**
 * Continue a clip. The result is the whole cut, input included — a 3s clip extended by 8s
 * comes back 11s — and Google caps the cumulative length at 40 seconds.
 */
export async function extendVideo(request: OmniExtendRequest): Promise<OmniVideoResponse> {
  try {
    const { dir, name } = defaults(request);
    const saved = await runInteraction(
      continuationParams(request, 'extend', request.durationSeconds),
      dir,
      name,
      'Extension',
    );
    if ('error' in saved) return { success: false, error: saved.error };

    return {
      success: true,
      videoPath: saved.videoPath,
      interactionId: saved.interactionId,
      prompt: request.prompt,
      model: OMNI_MODEL,
      resolution: request.resolution,
      duration: request.durationSeconds,
      sourceVideo: request.sourceVideoPath,
    };
  } catch (error) {
    return failure(error);
  }
}

/** Rewrite what is in the clip, keeping its length. No duration is sent — the input's wins. */
export async function editVideo(request: OmniEditRequest): Promise<OmniVideoResponse> {
  try {
    const { dir, name } = defaults(request);
    const saved = await runInteraction(continuationParams(request, 'edit'), dir, name, 'Edit');
    if ('error' in saved) return { success: false, error: saved.error };

    return {
      success: true,
      videoPath: saved.videoPath,
      interactionId: saved.interactionId,
      prompt: request.prompt,
      model: OMNI_MODEL,
      resolution: request.resolution,
      sourceVideo: request.sourceVideoPath,
    };
  } catch (error) {
    return failure(error);
  }
}
