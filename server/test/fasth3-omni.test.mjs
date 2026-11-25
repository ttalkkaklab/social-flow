import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fasth3OmniSchema, buildFasth3Body, checkFasth3VoiceReplay, fasth3RenderFrames, FASTH3_OMNI_MODEL } from '../dist/fasth3-omni.js';
import { resolveVideoDuration } from '../dist/video-duration.js';
const request = { prompt: 'The person in <Picture 1> waves.', referenceImagePaths: ['/tmp/person.png'] };
test('a re-encoded copy of the voice sample is flagged at its playback offset', t => {
  const folder = mkdtempSync(join(tmpdir(), 'h3-voice-replay-'));
  t.after(() => rmSync(folder, {recursive:true, force:true}));
  const wav = join(folder, 'ref.wav'), other = join(folder, 'other.wav'), take = join(folder, 'take.m4a');
  for (const [file, seed] of [[wav, 17], [other, 31]]) {
    execFileSync('ffmpeg', ['-v','error','-f','lavfi','-i',`anoisesrc=d=2:c=pink:r=16000:s=${seed}`,file]);
  }
  execFileSync('ffmpeg', ['-v','error','-i',wav,'-af','adelay=1500:all=1,volume=0.4,apad=pad_dur=1','-c:a','aac',take]);
  const references = [other,wav].map((path, i) => ({path, speaker: 'speaker-' + i, audioIndex: i + 2,
    sha256: createHash('sha256').update(readFileSync(path)).digest('hex')}));
  const report = checkFasth3VoiceReplay(take,references);
  assert.equal(report.status,'possible_reference_replay');
  assert.deepEqual(report.matches.map(m => m.audioIndex),[3]);
  assert.ok(Math.abs(report.matches[0].startSeconds - 1.5) < 0.01);
  assert.equal(checkFasth3VoiceReplay(take,[references[0]]).status,'no_full_sample_match');
  assert.equal(checkFasth3VoiceReplay(take,[{...references[0],sha256:'changed'}]).status,'unmeasured');
});
test('FastH3 validates its schedule, visual references and backend output budget', () => {
  assert.equal(fasth3RenderFrames(240), 243);
  assert.equal(fasth3RenderFrames(243), 243);
  assert.throws(() => fasth3RenderFrames(363), /split/);
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
  const longVoice = join(dir, 'eight.wav');
  execFileSync('ffmpeg', ['-v','error','-f','lavfi','-i','sine=duration=8',longVoice]);
  assert.throws(() => buildFasth3Body({...input, referenceVideoPaths:[], referenceAudioPaths:[longVoice,longVoice]}), /audio clips exceed/);
  writeFileSync(img, 'invalid'); assert.throws(() => buildFasth3Body(input));
});
