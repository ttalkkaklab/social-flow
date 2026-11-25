import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { config } from '../dist/config.js';
import { buildVeoBody, generateVeo, pollVeo, veoStatus, veoImageSchema, veoTextSchema, veoReferenceSchema, veoExtendSchema, VEO_MODELS } from '../dist/veo-video.js';
import { videoEvents } from '../dist/video-events.js';

const [standard, fast, lite] = VEO_MODELS;
const prompt = 'Water flows over the stones.';
function directory(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-veo-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
test('model and operation constrain resolution, references, frames and length independently', t => {
  const dir = directory(t), file = path.join(dir, 'a.jpg');
  fs.writeFileSync(file, 'subject');
  const base = { model: standard, prompt, resolution: '4k', generateAudio: false };
  const image = { mimeType: 'image/jpeg', bytesBase64Encoded: Buffer.from('subject').toString('base64') };
  const two = buildVeoBody(veoImageSchema.parse({ ...base, sourceImagePath: file, lastImagePath: file }));
  assert.deepEqual(two.instances, [{ prompt, image, lastFrame: image }]);
  assert.equal(two.parameters.generateAudio, false);
  assert.equal(two.parameters.enhancePrompt, undefined);
  assert.equal(buildVeoBody(veoImageSchema.parse({ ...base, sourceImagePath: file, enhancePrompt: false })).parameters.enhancePrompt, false);
  const refs = { ...base, referenceImagePaths: [file] };
  assert.deepEqual(buildVeoBody(veoReferenceSchema.parse(refs)).instances, [{ prompt, referenceImages: [{ image, referenceType: 'asset' }] }]);
  for (const extra of [{ sourceImagePath: file }, { lastImagePath: file }, { durationSeconds: 4 }, { referenceImagePaths: Array(4).fill(file) },
    { model: lite, resolution: '720p' }, { referenceAudioPaths: [file] }])
    assert.equal(veoReferenceSchema.safeParse({ ...refs, ...extra }).success, false);
  assert.equal(veoTextSchema.safeParse({ ...base, model: fast }).success, false);
  assert.equal(veoTextSchema.safeParse({ ...base, model: 'veo-3.1-generate-preview' }).success, false);
  assert.equal(veoImageSchema.safeParse({ ...base, model: lite, resolution: '1080p', sourceImagePath: file, lastImagePath: file }).success, true);
  const mp4 = path.join(dir, 'source.mp4');
  execFileSync('ffmpeg', ['-v','error','-f','lavfi','-i','color=s=720x1280:r=24:d=1','-c:v','libx264','-threads','1',mp4]);
  const ext = buildVeoBody(veoExtendSchema.parse({ prompt, sourceVideoPath: mp4 }));
  assert.equal(ext.instances[0].video.mimeType, 'video/mp4');
  assert.equal(ext.parameters.durationSeconds, undefined);
  assert.equal(ext.parameters.aspectRatio, '9:16');
  assert.throws(() => buildVeoBody(veoExtendSchema.parse({ prompt, sourceVideoPath: mp4, aspectRatio: '16:9' })), /aspect ratio/);
});
test('Google Cloud uses one authenticated submit and polls its exact operation for inline video', async t => {
  const dir = directory(t), prior = config.googleCloudProject;
  config.googleCloudProject = 'test-project';
  process.env.GOOGLE_OAUTH_ACCESS_TOKEN = 'fixture';
  t.after(() => { config.googleCloudProject = prior; delete process.env.GOOGLE_OAUTH_ACCESS_TOKEN; });
  const resource = 'projects/test-project/locations/us-central1/publishers/google/models/' + fast;
  const id = resource + '/operations/op-42', urls = [], submitted = [];
  const clip = execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=s=32x32:d=1', '-c:v', 'libx264',
    '-threads', '1', '-movflags', 'frag_keyframe+empty_moov', '-f', 'mp4', 'pipe:1']);
  const answers = [{ name: id }, { done: false }, { done: true, response: { videos: [{ mimeType:'video/mp4', bytesBase64Encoded:clip.toString('base64') }] } }];
  const timer = globalThis.setTimeout;
  t.mock.method(globalThis,'setTimeout',(fn, ms, ...args) => timer(fn, ms === 10000 ? 0 : ms, ...args));
  t.mock.method(globalThis,'fetch',async (url, options) => {
    urls.push(url); assert.equal(options.headers.Authorization, 'Bearer fixture');
    if (urls.length > 1) assert.deepEqual(JSON.parse(options.body), { operationName: id });
    else assert.deepEqual(JSON.parse(options.body).instances, [{ prompt }]);
    return Response.json(answers.shift());
  });
  const result = await videoEvents.run({ submitted: value => submitted.push(value) }, () =>
    generateVeo(veoTextSchema.parse({ prompt, model:fast, filename:'clip.mp4', outputPath:dir })));
  assert.equal(result.success, true); assert.deepEqual(fs.readFileSync(result.videoPath), clip);
  assert.deepEqual(submitted, [id]);
  assert.deepEqual(urls.map(url => url.split(':').pop()), ['predictLongRunning', 'fetchPredictOperation','fetchPredictOperation']);
  await assert.rejects(pollVeo(standard, id), /does not belong/);
  assert.equal(veoStatus({ done:true, response:{ raiMediaFilteredCount:1 } }).state,'failed');
  assert.equal(veoStatus({ done:true, response:{videos:[{mimeType:'video/mp4',bytesBase64Encoded:'YmFk'}]} }).state,'failed');
  assert.equal(veoStatus({ error:{message:'request failed'} }).state,'failed');
});
