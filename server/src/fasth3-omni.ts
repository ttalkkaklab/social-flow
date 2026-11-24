import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { bareFilenameSchema } from './media-utils.js';
import { readImageMetadata } from './image-media.js';

export const FASTH3_OMNI_MODEL = 'ddalcu/FastH3-Omni-MLX-Serve-8bit';
export const FASTH3_FRAME_LIMITS = { min: 124, max: 362, step: 17, frameRate: 24, frameOffset: 5 };
/** The raw take includes the shortest tail that covers the authored 24 fps edit. */
export function fasth3RenderFrames(editFrames: number): number {
  const { min, max, frameOffset, step } = FASTH3_FRAME_LIMITS;
  const frames = Math.max(min, frameOffset + step * Math.ceil((editFrames - frameOffset) / step));
  if (frames > max) throw new Error('FastH3 scene exceeds 362 frames; split the shot before planning');
  return frames;
}
export const FASTH3_MAX_RGB_BYTES = 256 * 1024 * 1024;
const MAX_REQUEST_BYTES = 60 * 1024 * 1024;
const dimension = z.number().int().min(256).max(1536).refine(n => n % 32 === 0, 'Dimensions must be multiples of 32');
const paths = (max: number) => z.array(z.string().min(1)).max(max).default([]);
export const fasth3OmniSchema = z.object({
  prompt: z.string().min(1).max(32_000).describe('Scene and sound, e.g. The person in <Picture 1> waves; birds chirp. References are numbered per type.'),
  model: z.literal(FASTH3_OMNI_MODEL).default(FASTH3_OMNI_MODEL).describe('Installed FastH3 Omni MLX-Serve pack.'),
  width: dimension.default(768).describe('Output width in pixels, e.g. 768.'),
  height: dimension.default(448).describe('Output height in pixels, e.g. 448.'),
  numFrames: z.number().int().min(124).max(362).default(124).describe('Exact 17k+5 frame count at 24 fps, e.g. 124, 243, 362; RGB output must fit 256 MiB.'),
  steps: z.literal(8).default(8).describe('The trained eight-step schedule.'),
  seed: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional().describe('Reproducible seed, e.g. 2026.'),
  referenceImagePaths: paths(9).describe('Ordered PNG/JPEG paths, e.g. ["/tmp/character.png"]; <Picture 1> etc.'),
  referenceVideoPaths: paths(3).describe('Ordered local video paths, e.g. ["/tmp/motion.mp4"]; 2–15 seconds each, 15 seconds total. Video sound is included.'),
  referenceAudioPaths: paths(3).describe('Ordered voice/music paths, e.g. ["/tmp/voice.wav"]; 2–15 seconds each and 15 seconds total. Voice imitation does not preserve exact speech timing.'),
  trimReferenceVideos: z.boolean().default(false).describe('Allow trimming reference video tails to output length and the 17k+5 ladder; false refuses any trim.'),
  referenceSize: z.enum(['match', 'max']).default('match').describe('match caps references to output area; max preserves more detail at higher memory/time cost.'),
  outputPath: z.string().optional().describe('Output directory, e.g. /tmp/video-test.'),
  filename: bareFilenameSchema('video').optional().describe('MP4 filename, e.g. fasth3.mp4.'),
}).strict().superRefine((v, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  if (!(v.referenceImagePaths.length + v.referenceVideoPaths.length)) issue('FastH3 Omni needs at least one image or video reference');
  if (v.referenceImagePaths.length + v.referenceVideoPaths.length + v.referenceAudioPaths.length > 12) issue('At most twelve reference files are supported');
  if ((v.numFrames - 5) % 17) issue('FastH3 frame counts must be 17k+5');
  if (v.width * v.height * v.numFrames * 3 > FASTH3_MAX_RGB_BYTES) issue('Decoded RGB exceeds the adapter 256 MiB compatibility limit; reduce dimensions or frames');
});
export type Fasth3OmniRequest = z.infer<typeof fasth3OmniSchema>;

function probe(file: string): { duration: number; hasAudio: boolean } {
  const data = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', file], { encoding: 'utf8', timeout: 15_000 }));
  const duration = Number(data.format?.duration);
  if (!Number.isFinite(duration) || duration < 2 || duration > 15) throw new Error('Reference media must be 2–15 seconds: ' + file);
  return { duration, hasAudio: data.streams?.some((s: { codec_type: string }) => s.codec_type === 'audio') === true };
}
/** Soundtracks occupy audio-reference indices before standalone voice samples. */
export function fasth3VideoAudioCount(files: string[]): number {
  return files.filter(file => probe(file).hasAudio).length;
}

function ffmpeg(args: string[]): void {
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', ...args], { timeout: 120_000, maxBuffer: 1024 * 1024 });
}

/** Detect a replay of a voice sample in a take before using it for a speaker comparison. */
export function checkFasth3VoiceReplay(video: string, references: {path: string; audioIndex: number; speaker: string; sha256: string}[]) {
  if (!references.length) return {status: 'no_voice_references' as const};
  const rate = 2000;
  const pcm = (file: string) => {
    const bytes = execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-i', file, '-map', '0:a:0',
      '-t', '16', '-ac', '1', '-af', 'highpass=f=80,lowpass=f=650', '-ar', String(rate), '-f', 'f32le', '-'],
      {timeout: 20_000, maxBuffer: 140_000, stdio: ['ignore', 'pipe', 'pipe']});
    return new Float32Array(Uint8Array.from(bytes).buffer);
  };
  try {
    const take = pcm(video);
    const matches = [];
    for (const reference of references) {
      if (createHash('sha256').update(readFileSync(reference.path)).digest('hex') !== reference.sha256)
        return {status: 'unmeasured' as const};
      const ref = pcm(reference.path);
      if (ref.length < rate || ref.length > take.length) continue;
      // Rank offsets with a sparse sample, then measure the full waveform at the strongest offsets.
      const stride = Math.max(1, Math.floor(ref.length / 256));
      const candidates: {offset: number; score: number}[] = [];
      const correlate = (offset: number, step: number) => {
        let dot = 0, sourceEnergy = 0, takeEnergy = 0;
        for (let i = 0; i < ref.length; i += step) {
          const a = ref[i], b = take[offset + i];
          dot += a * b; sourceEnergy += a * a; takeEnergy += b * b;
        }
        return Math.abs(dot) / Math.sqrt(Math.max(1e-12, sourceEnergy * takeEnergy));
      };
      for (let offset = 0; offset <= take.length - ref.length; offset++) {
        const score = correlate(offset, stride);
        if (score < 0.4 || (candidates.length === 8 && score <= candidates[7].score)) continue;
        candidates.push({offset, score});
        candidates.sort((a, b) => b.score - a.score);
        if (candidates.length > 8) candidates.pop();
      }
      const best = candidates.map(({offset}) => ({offset, score: correlate(offset, 1)})).sort((a,b) => b.score - a.score)[0];
      if (best && best.score >= 0.55) matches.push({audioIndex: reference.audioIndex, speaker: reference.speaker, startSeconds: best.offset / rate,
        durationSeconds: ref.length / rate, waveformCorrelation: Number(best.score.toFixed(3))});
    }
    return {status: matches.length ? 'possible_reference_replay' as const : 'no_full_sample_match' as const, matches};
  } catch {
    return {status: 'unmeasured' as const};
  }
}

/** Convert bounded local references to the backend wire format before loading any weights. */
export function buildFasth3Body(raw: Fasth3OmniRequest): Record<string, unknown> {
  const r = fasth3OmniSchema.parse(raw);
  const temp = mkdtempSync(join(tmpdir(), 'fasth3-refs-'));
  let encodedBytes = 0;
  const encode = (file: string) => {
    encodedBytes += 4 * Math.ceil(statSync(file).size / 3);
    if (encodedBytes > MAX_REQUEST_BYTES - 64_000) throw new Error('Reference payload exceeds the 60 MiB upload limit');
    return readFileSync(file).toString('base64');
  };
  const audio = (file: string, name: string, seconds?: number) => {
    const target = join(temp, name + '.wav');
    ffmpeg(['-i', file, '-vn', '-ar', '32000', '-ac', '2', '-c:a', 'pcm_s16le', ...(seconds === undefined ? [] : ['-t', String(seconds)]), target]);
    return encode(target);
  };
  try {
    const images = r.referenceImagePaths.map(file => {
      if (statSync(file).size * 4 / 3 > MAX_REQUEST_BYTES - 64_000) throw new Error('Reference image exceeds upload limit');
      const meta = readImageMetadata(file);
      if (!['image/png', 'image/jpeg'].includes(meta.mimeType)) throw new Error('FastH3 reference images must be PNG or JPEG');
      return encode(file);
    });
    let videoSeconds = 0;
    const videos = r.referenceVideoPaths.map((file, i) => {
      const meta = probe(file); videoSeconds += meta.duration;
      if (videoSeconds > 15) throw new Error('Reference videos exceed fifteen seconds total');
      const prefix = `video-${i}-`;
      ffmpeg(['-i', file, '-an', '-vf', 'fps=24,scale=768:768:force_original_aspect_ratio=decrease', '-frames:v', '362', join(temp, prefix + '%04d.jpg')]);
      const files = readdirSync(temp).filter(f => f.startsWith(prefix)).sort();
      const count = Math.min(files.length, r.numFrames);
      const accepted = count - ((count - 5) % 17);
      if (accepted < 5) throw new Error('Reference video has too few decoded frames');
      if (accepted < files.length && !r.trimReferenceVideos) throw new Error('Reference video must fit the requested output frame count and 17k+5 ladder; trim it explicitly before submitting');
      return { frames: files.slice(0, accepted).map(f => encode(join(temp, f))), ...(meta.hasAudio ? { audio: audio(file, `video-audio-${i}`, accepted / 24) } : {}) };
    });
    const audioSeconds = r.referenceAudioPaths.reduce((sum, file) => sum + probe(file).duration, 0);
    if (audioSeconds > 15) throw new Error('Reference audio clips exceed fifteen seconds total');
    const audios = r.referenceAudioPaths.map((file, i) => audio(file, `audio-${i}`));
    return { stream: true, model: r.model, prompt: r.prompt, width: r.width, height: r.height, num_frames: r.numFrames,
      steps: r.steps, ...(r.seed === undefined ? {} : { seed: r.seed }), ref_image_size: r.referenceSize,
      ref_images: images, ref_videos: videos, ref_audios: audios };
  } finally { rmSync(temp, { recursive: true, force: true }); }
}
