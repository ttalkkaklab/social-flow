import { GENAI_MSR_FRAMES } from './astra-genai-video.js';
import { FASTH3_MAX_RGB_BYTES } from './fasth3-omni.js';
import { localVideoStrategy } from './local-video-models.js';
import { minimumDuration, type DurationLimits } from '../../skills/_shared/video-duration.js';
import { SEEDANCE_MODEL_SPECS, DEFAULT_SEEDANCE_MODEL, type SeedanceModel } from './seedance-client.js';
import { ASTRA_VIDEO_FRAME_LIMITS, ASTRA_VIDEO_FRAME_STEP, ASTRA_VIDEO_MIN_FRAMES } from './astra-video-client.js';

export const DURATION_TOOLS = [
  'seedance_text2video', 'seedance_img2video', 'seedance_reference',
  'astra_text2video', 'astra_img2video', 'astra_keyframe_video', 'astra_audio2video',
  'astra_genai_msr', 'mlx_video_generate', 'ltx_video_generate', 'fasth3_omni_reference',
] as const;

/** Adapter-owned duration constraints; unknown deployments need discovery, never a guessed cap. */
export function videoDurationLimits(tool: string, input: Record<string, unknown> = {}): DurationLimits | null {
  let limits: DurationLimits;
  if (tool.startsWith('seedance_')) {
    const model = input.model ?? DEFAULT_SEEDANCE_MODEL;
    const spec = SEEDANCE_MODEL_SPECS[model as SeedanceModel];
    if (!spec) throw new Error('Unknown Seedance model: ' + String(model));
    limits = { min: spec.duration[0], max: spec.duration[1] };
  } else if (tool === 'astra_genai_msr') {
    limits = { ...GENAI_MSR_FRAMES, frameRate: input.frameRate as number ?? GENAI_MSR_FRAMES.frameRate };
  } else if ((DURATION_TOOLS as readonly string[]).includes(tool) && tool.startsWith('astra_')) {
    const mode = tool === 'astra_audio2video' ? 'audio2video' : tool === 'astra_keyframe_video' ? 'keyframe'
      : input.tier === 'guided' ? 'guided' : input.tier === 'fast' ? 'guided_fast' : input.tier === 'hq' ? 'guided_hq' : 'generate';
    const frameRate = input.frameRate ?? 24;
    if (typeof frameRate !== 'number' || !Number.isFinite(frameRate) || frameRate < 1 || frameRate > 60)
      throw new Error('frameRate must be finite in 1..60');
    limits = { min: ASTRA_VIDEO_MIN_FRAMES, max: ASTRA_VIDEO_FRAME_LIMITS[mode], step: ASTRA_VIDEO_FRAME_STEP, frameRate };
  } else {
    const local = localVideoStrategy(tool);
    if (!local) return null;
    limits = { ...local.frames };
    if (tool === 'fasth3_omni_reference') {
      const width = input.width ?? 768, height = input.height ?? 448;
      if (typeof width !== 'number' || typeof height !== 'number' || width <= 0 || height <= 0)
        throw new Error('Invalid FastH3 dimensions');
      const offset = limits.frameOffset ?? 1;
      limits.max = offset + limits.step! * Math.floor((Math.min(limits.max!, Math.floor(FASTH3_MAX_RGB_BYTES / (width * height * 3))) - offset) / limits.step!);
    }
  }
  if (limits.frameRate !== undefined && (typeof limits.frameRate !== 'number' || !Number.isFinite(limits.frameRate) || limits.frameRate < 1 || limits.frameRate > 60))
    throw new Error('frameRate must be finite in 1..60');
  return limits;
}

/** Read-only fit assessment, usable before images, prompts or generation exist. */
export function assessVideoDuration(tool: string, input: Record<string, unknown>, requiredSeconds?: number) {
  const limits = videoDurationLimits(tool, input);
  if (!limits) return { status: 'limits_unknown' as const, tool, requiredSeconds, limits: null, maxSeconds: null };
  const maxSeconds = limits.seconds ? Math.max(...limits.seconds) : limits.max! / (limits.frameRate ?? 1);
  const base = { tool, limits, maxSeconds, requiredSeconds };
  if (requiredSeconds === undefined) return { ...base, status: 'timing_unknown' as const };
  if (!Number.isFinite(requiredSeconds) || requiredSeconds <= 0) throw new Error('requiredSeconds must be finite positive seconds');
  if (requiredSeconds > maxSeconds) return { ...base, status: 'split_required' as const };
  return { ...base, status: 'fits' as const, request: minimumDuration(requiredSeconds, limits) };
}

/** Resolve required playback coverage into the shortest supported request, without I/O. */
export function resolveVideoDuration(tool: string, input: Record<string, unknown>) {
  if (input.requiredSeconds === undefined) return { args: input, timing: null };
  if (!(DURATION_TOOLS as readonly string[]).includes(tool)) throw new Error('requiredSeconds is not supported for ' + tool);
  for (const key of ['duration', 'durationSeconds', 'numFrames', 'frames', 'autoDuration', 'audioMaxDuration']) {
    if (input[key] !== undefined) throw new Error('requiredSeconds is mutually exclusive with ' + key + '; supply the shot need or an exact legacy request, not both');
  }
  const timing = minimumDuration(input.requiredSeconds as number, videoDurationLimits(tool, input)!);
  const { requiredSeconds: _required, ...args } = input;
  if (timing.numFrames !== undefined) args.numFrames = timing.numFrames;
  else args.durationSeconds = timing.durationSeconds;
  return { args, timing };
}
