import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { bareFilenameSchema } from './media-utils.js';
import { readImageMetadata } from './image-media.js';
export const FASTH3_OMNI_MODEL = 'ddalcu/FastH3-Omni-MLX-Serve-8bit';
export const FASTH3_FRAME_LIMITS = { min: 124, max: 362, step: 17, frameRate: 24, frameOffset: 5 };
export const FASTH3_MAX_RGB_BYTES = 256 * 1024 * 1024;
const MAX_REQUEST_BYTES = 60 * 1024 * 1024;
const dimension = z.number().int().min(256).max(1536).refine(n => n % 32 === 0, 'Dimensions must be multiples of 32');
const paths = (max) => z.array(z.string().min(1)).max(max).default([]);
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
    referenceAudioPaths: paths(3).describe('Ordered voice/music paths, e.g. ["/tmp/voice.wav"]; 2–15 seconds each. Voice imitation does not preserve exact speech timing.'),
    trimReferenceVideos: z.boolean().default(false).describe('Allow trimming reference video tails to output length and the 17k+5 ladder; false refuses any trim.'),
    referenceSize: z.enum(['match', 'max']).default('match').describe('match caps references to output area; max preserves more detail at higher memory/time cost.'),
    outputPath: z.string().optional().describe('Output directory, e.g. /tmp/video-test.'),
    filename: bareFilenameSchema('video').optional().describe('MP4 filename, e.g. fasth3.mp4.'),
}).strict().superRefine((v, ctx) => {
    const issue = (message) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    if (!(v.referenceImagePaths.length + v.referenceVideoPaths.length))
        issue('FastH3 Omni needs at least one image or video reference');
    if (v.referenceImagePaths.length + v.referenceVideoPaths.length + v.referenceAudioPaths.length > 12)
        issue('At most twelve reference files are supported');
    if ((v.numFrames - 5) % 17)
        issue('FastH3 frame counts must be 17k+5');
    if (v.width * v.height * v.numFrames * 3 > FASTH3_MAX_RGB_BYTES)
        issue('Decoded RGB exceeds the adapter 256 MiB compatibility limit; reduce dimensions or frames');
});
function probe(file) {
    const data = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', file], { encoding: 'utf8', timeout: 15_000 }));
    const duration = Number(data.format?.duration);
    if (!Number.isFinite(duration) || duration < 2 || duration > 15)
        throw new Error('Reference media must be 2–15 seconds: ' + file);
    return { duration, hasAudio: data.streams?.some((s) => s.codec_type === 'audio') === true };
}
/** Soundtracks occupy audio-reference indices before standalone voice samples. */
export function fasth3VideoAudioCount(files) {
    return files.filter(file => probe(file).hasAudio).length;
}
function ffmpeg(args) {
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', ...args], { timeout: 120_000, maxBuffer: 1024 * 1024 });
}
/** Convert bounded local references to the backend wire format before loading any weights. */
export function buildFasth3Body(raw) {
    const r = fasth3OmniSchema.parse(raw);
    const temp = mkdtempSync(join(tmpdir(), 'fasth3-refs-'));
    let encodedBytes = 0;
    const encode = (file) => {
        encodedBytes += 4 * Math.ceil(statSync(file).size / 3);
        if (encodedBytes > MAX_REQUEST_BYTES - 64_000)
            throw new Error('Reference payload exceeds the 60 MiB upload limit');
        return readFileSync(file).toString('base64');
    };
    const audio = (file, name, seconds) => {
        const target = join(temp, name + '.wav');
        ffmpeg(['-i', file, '-vn', '-ar', '32000', '-ac', '2', '-c:a', 'pcm_s16le', ...(seconds === undefined ? [] : ['-t', String(seconds)]), target]);
        return encode(target);
    };
    try {
        const images = r.referenceImagePaths.map(file => {
            if (statSync(file).size * 4 / 3 > MAX_REQUEST_BYTES - 64_000)
                throw new Error('Reference image exceeds upload limit');
            const meta = readImageMetadata(file);
            if (!['image/png', 'image/jpeg'].includes(meta.mimeType))
                throw new Error('FastH3 reference images must be PNG or JPEG');
            return encode(file);
        });
        let videoSeconds = 0;
        const videos = r.referenceVideoPaths.map((file, i) => {
            const meta = probe(file);
            videoSeconds += meta.duration;
            if (videoSeconds > 15)
                throw new Error('Reference videos exceed fifteen seconds total');
            const prefix = `video-${i}-`;
            ffmpeg(['-i', file, '-an', '-vf', 'fps=24,scale=768:768:force_original_aspect_ratio=decrease', '-frames:v', '362', join(temp, prefix + '%04d.jpg')]);
            const files = readdirSync(temp).filter(f => f.startsWith(prefix)).sort();
            const count = Math.min(files.length, r.numFrames);
            const accepted = count - ((count - 5) % 17);
            if (accepted < 5)
                throw new Error('Reference video has too few decoded frames');
            if (accepted < files.length && !r.trimReferenceVideos)
                throw new Error('Reference video must fit the requested output frame count and 17k+5 ladder; trim it explicitly before submitting');
            return { frames: files.slice(0, accepted).map(f => encode(join(temp, f))), ...(meta.hasAudio ? { audio: audio(file, `video-audio-${i}`, accepted / 24) } : {}) };
        });
        const audios = r.referenceAudioPaths.map((file, i) => { probe(file); return audio(file, `audio-${i}`); });
        return { stream: true, model: r.model, prompt: r.prompt, width: r.width, height: r.height, num_frames: r.numFrames,
            steps: r.steps, ...(r.seed === undefined ? {} : { seed: r.seed }), ref_image_size: r.referenceSize,
            ref_images: images, ref_videos: videos, ref_audios: audios };
    }
    finally {
        rmSync(temp, { recursive: true, force: true });
    }
}
