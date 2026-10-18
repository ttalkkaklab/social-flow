import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { config } from '../dist/config.js';
import { genaiTextToVideoSchema, genaiImageToVideoSchema, buildGenaiVideoBody, generateGenaiVideo, getGenaiVideoStatus } from '../dist/astra-genai-video.js';
import { parseVideoArgs, speechVideoCapabilities } from '../dist/video-registry.js';
const base = { prompt: 'Clouds cross the sky.', model: 'ltx-2.5-22b-distilled', duration: 5, resolution: '1280x704', reserveUsd: 0 };
function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'genai-video-'));
  const fetch = globalThis.fetch, key = config.astraGenaiApiKey; config.astraGenaiApiKey = 'fixture';
  t.after(() => { globalThis.fetch = fetch; config.astraGenaiApiKey = key; fs.rmSync(dir, { recursive: true, force: true }); });
  return dir;
}
test('provider body follows the published gateway fields and preserves required null duration', () => {
  const api = JSON.parse(fs.readFileSync(new URL('./fixtures/astra-genai-openapi-20261018.json', import.meta.url)));
  const args = genaiImageToVideoSchema.parse({ ...base, duration: null, imageUri: 'https://example.com/start.png', lastFrameUri: null, cameraMotion: 'static' });
  const body = buildGenaiVideoBody(args), schema = api.components.schemas.ImageVideo;
  assert.ok(schema.required.every(key => Object.hasOwn(body, key)));
  assert.ok(Object.keys(body).every(key => Object.hasOwn(schema.properties, key)));
  assert.equal(body.duration, null); assert.equal(body.generate_audio, true); assert.equal(body.last_frame_uri, null);
  for (const input of [{ ...base, duration: undefined }, { ...base, fps: 30 }, { ...base, seed: 1 }, { ...base, model: 'ltx-2-5-pro' }]) assert.equal(genaiTextToVideoSchema.safeParse(input).success, false);
  assert.throws(() => parseVideoArgs('astra_genai_text2video', { ...base, requiredSeconds: 5 }), /not supported/);
  assert.equal(speechVideoCapabilities('astra-genai', base.model).audioConditioning, false);
});
test('submission is persisted before status failure and the same receipt resumes without another POST', async t => {
  const dir = setup(t), args = { ...base, outputPath: dir, filename: 'clip.mp4' };
  let posts = 0;
  globalThis.fetch = async (url, options) => {
    if (options.method === 'POST') { posts++; return Response.json({ id: 'job-1' }, { status: 202 }); }
    const saved = JSON.parse(fs.readFileSync(path.join(dir, 'clip.mp4.astra-genai.json')));
    assert.equal(saved.jobId, 'job-1');
    return Response.json({ id: 'job-1', status: 'unrecognized' });
  };
  await assert.rejects(generateGenaiVideo('text-to-video', args));
  await assert.rejects(generateGenaiVideo('text-to-video', args));
  assert.equal(posts, 1);
  await assert.rejects(generateGenaiVideo('text-to-video', { ...args, prompt: 'changed' }), /conflicts/);
});
test('completed LTX result downloads verified video and cached recovery needs no network', async t => {
  const dir = setup(t), source = path.join(dir, 'source.mp4');
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=s=64x64:d=0.1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', source]);
  const bytes = fs.readFileSync(source); let posts = 0;
  globalThis.fetch = async (url, options) => {
    if (options.method === 'POST') { posts++; return Response.json({ id: 'job-2' }); }
    if (String(url).includes('/image-to-video/job-2')) return Response.json({ id: 'job-2', status: 'completed', result: { video_url: 'https://results.example/out.mp4' } });
    assert.equal(options.headers, undefined); return new Response(bytes);
  };
  const result = await generateGenaiVideo('image-to-video', { ...base, imageUri: 'https://example.com/start.png', outputPath: dir, filename: 'clip.mp4' });
  assert.equal(result.downloaded, true); assert.equal(posts, 1);
  globalThis.fetch = async () => assert.fail('cached result must not make a request');
  assert.equal((await getGenaiVideoStatus({ receiptPath: result.receiptPath, download: true })).videoPath, result.videoPath);
  fs.writeFileSync(result.videoPath, 'changed');
  await assert.rejects(getGenaiVideoStatus({ receiptPath: result.receiptPath, download: true }), /changed/);
});

test('MSR validates slots, geometry and frame timing against its independent contract', async () => {
  const { genaiMsrSchema, buildGenaiMsrBody } = await import('../dist/astra-genai-video.js');
  const ref = { imageUri: 'https://example.com/person.png' };
  const args = { prompt: 'Person in image 1 walks in image 2.', references: [ref, { ...ref, background: true }], reserveUsd: 0 };
  const body = buildGenaiMsrBody(genaiMsrSchema.parse({ ...args, duration: 5 }));
  const api = JSON.parse(fs.readFileSync(new URL('./fixtures/astra-genai-openapi-20261018.json', import.meta.url)));
  assert.ok(Object.keys(body).every(key => key in api.components.schemas.MsrVideo.properties));
  assert.equal(body.duration, 5); assert.equal(body.num_frames, undefined); assert.equal(body.model, undefined);
  assert.equal(body.references[1].background, true);
  for (const extra of [{ references: Array(5).fill(ref) }, { references: Array(2).fill({ ...ref, background: true }) }, { width: 1920, height: 1920 }, { numFrames: 120 }, { duration: 5, numFrames: 121 }, { duration: 360 }, { model: base.model }, { references: [{ imagePath: 'x', imageUri: ref.imageUri }] }])
    assert.equal(genaiMsrSchema.safeParse({ ...args, ...extra }).success, false);
});

test('MSR recovery uses the MSR route and never submits twice', async t => {
  const dir = setup(t), source = path.join(dir, 'reference.png');
  fs.writeFileSync(source, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=', 'base64'));
  const args = { prompt: 'The person walks.', references: [{ imagePath: source }], reserveUsd: 0, outputPath: dir, filename: 'msr.mp4' };
  let posts = 0;
  globalThis.fetch = async (url, options) => {
    if (options.method === 'POST') {
      posts++; assert.ok(String(url).endsWith('/v1/ltx/msr'));
      assert.match(JSON.parse(options.body).references[0].image_uri, /^data:image\/png;base64,/);
      return Response.json({ id: 'msr-job' }, { status: 202 });
    }
    assert.ok(String(url).endsWith('/v1/ltx/msr/msr-job'));
    return Response.json({ id: 'msr-job', status: 'failed', error: 'fixture' });
  };
  await assert.rejects(generateGenaiVideo('msr', args), /fixture/);
  await assert.rejects(generateGenaiVideo('msr', args), /fixture/);
  assert.equal(posts, 1);
  const receiptPath = path.join(dir, 'msr.mp4.astra-genai.json');
  globalThis.fetch = async url => {
    assert.ok(String(url).endsWith('/v1/ltx/msr/msr-job'));
    return Response.json({ id: 'msr-job', status: 'processing' });
  };
  assert.equal((await getGenaiVideoStatus({ receiptPath, download: false })).status, 'processing');
});
