import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fasth3OmniSchema, buildFasth3Body, FASTH3_OMNI_MODEL } from '../dist/fasth3-omni.js';
import { resolveVideoDuration } from '../dist/video-duration.js';
const request = { prompt: 'The person in <Picture 1> waves.', referenceImagePaths: ['/tmp/person.png'] };
test('FastH3 validates its schedule, visual references and backend output budget', () => {
  assert.equal(fasth3OmniSchema.parse(request).model, FASTH3_OMNI_MODEL);
  for (const patch of [{ steps: 4 }, { numFrames: 121 }, { model: 'ltx' }, { referenceImagePaths: [] }, { firstFrameImagePath: 'a.png' },
    { referenceImagePaths: Array(9).fill('x'), referenceVideoPaths: Array(3).fill('x'), referenceAudioPaths: ['x'] },
    { width: 1536, height: 1536 }]) assert.equal(fasth3OmniSchema.safeParse({ ...request, ...patch }).success, false);
  assert.equal(resolveVideoDuration('fasth3_omni_reference', { requiredSeconds: 5 }).args.numFrames, 124);
  assert.equal(resolveVideoDuration('fasth3_omni_reference', { requiredSeconds: 6 }).args.numFrames, 158);
  assert.throws(() => resolveVideoDuration('fasth3_omni_reference', { requiredSeconds: 16 }));
});
test('FastH3 serializes images, audio and video; video tail trimming is explicit', t => {
  const dir = mkdtempSync(join(tmpdir(), 'fasth3-test-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const img = join(dir, 'ref.png'), wav = join(dir, 'ref.wav'), video = join(dir, 'ref.mp4');
  execFileSync('ffmpeg', ['-v','error','-f','lavfi','-i','color=red:s=64x64','-frames:v','1', img]);
  execFileSync('ffmpeg', ['-v','error','-f','lavfi','-i','sine=frequency=440:duration=2','-ar','32000', wav]);
  execFileSync('ffmpeg', ['-v','error','-f','lavfi','-i','color=blue:s=64x64:r=24','-t','2','-c:v','libx264', video]);
  const input = fasth3OmniSchema.parse({ ...request, referenceImagePaths: [img], referenceAudioPaths: [wav], referenceVideoPaths: [video] });
  assert.throws(() => buildFasth3Body(input), /trim/);
  const body = buildFasth3Body({ ...input, trimReferenceVideos: true });
  assert.equal(body.num_frames, 124); assert.equal(body.steps, 8);
  assert.equal(body.ref_images.length, 1); assert.equal(body.ref_videos[0].frames.length, 39);
  assert.equal(Buffer.from(body.ref_audios[0], 'base64').subarray(0,4).toString(), 'RIFF');
  assert.equal(body.first_frame_image, undefined);
  writeFileSync(img, 'invalid'); assert.throws(() => buildFasth3Body(input));
});
