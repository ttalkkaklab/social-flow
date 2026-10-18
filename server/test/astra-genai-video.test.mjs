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
