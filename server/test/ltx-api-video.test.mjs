import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildLtxApiBody, generateLtxApiVideo, ltxApiImg2VideoSchema, ltxApiAudio2VideoSchema, ltxApiSeconds } from '../dist/ltx-api-video.js';
import { config } from '../dist/config.js';

// Polls really wait seconds; skip that time. Sub-second timers stay real.
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms = 0, ...args) => realSetTimeout(fn, ms < 1000 ? ms : 0, ...args);
/** Answers vendor calls in order; records each request. */
function vendor(t, answers) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method ?? 'GET', headers: init.headers ?? {}, body: init.body });
    const next = answers.shift();
    return typeof next === 'string' ? new Response(next) : new Response(JSON.stringify(next));
  });
  return calls;
}


const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=', 'base64');

test('duration grid follows model, size and frame rate', () => {
  assert.deepEqual(ltxApiSeconds('ltx-2-5-pro', '1920x1080'), [6, 8, 10]);
  assert.equal(Math.max(...ltxApiSeconds('ltx-2-5-fast', '1280x720', 24)), 20);
  assert.equal(Math.max(...ltxApiSeconds('ltx-2-5-fast', '1280x720', 48)), 10);
  assert.throws(() => ltxApiImg2VideoSchema.parse({ prompt: 'x', sourceImagePath: 'a.png', durationSeconds: 12 }), /6, 8, 10/);
  assert.throws(() => ltxApiImg2VideoSchema.parse({ prompt: 'x', sourceImagePath: 'a.png', resolution: '1792x1024' }), /WIDTHxHEIGHT/);
});

test('image and audio bodies go to their endpoints; audio sets the length', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-ltx-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const image = path.join(dir, 'a.png'); fs.writeFileSync(image, PNG);
  const voice = path.join(dir, 'v.wav'); execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=d=3', voice]);
  const still = buildLtxApiBody(ltxApiImg2VideoSchema.parse({ prompt: 'x', sourceImagePath: image }));
  assert.deepEqual([still.endpoint, still.body.duration, still.body.generate_audio], ['image-to-video', 6, false]);
  const spoken = buildLtxApiBody(ltxApiAudio2VideoSchema.parse({ prompt: '', sourceImagePath: image, audioPath: voice }));
  assert.equal(spoken.endpoint, 'audio-to-video');
  assert.match(spoken.body.audio_uri, /^data:audio\/wav;base64,/);
  assert.equal(spoken.body.duration, undefined);
  const withoutImage = buildLtxApiBody(ltxApiAudio2VideoSchema.parse({ prompt: 'A bell rings', audioPath: voice }));
  assert.equal(Object.hasOwn(withoutImage.body, 'image_uri'), false);
  assert.equal(ltxApiAudio2VideoSchema.safeParse({ audioPath: voice, lastImagePath: image, prompt: 'x' }).success, false);
  const long = path.join(dir, 'l.wav'); execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=d=12', long]);
  assert.throws(() => buildLtxApiBody(ltxApiAudio2VideoSchema.parse({ prompt: '', sourceImagePath: image, audioPath: long })), /2–10 s/);
});

test('the job is polled on its own endpoint and saved', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-ltx-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const image = path.join(dir, 'a.png'); fs.writeFileSync(image, PNG);
  const old = config.ltxApiKey; config.ltxApiKey = 'ltx-key'; t.after(() => { config.ltxApiKey = old; });
  const calls = vendor(t, [{ id: 'j1' }, { status: 'processing' }, { status: 'completed', result: { video_url: 'https://cdn/l.mp4' } }, 'mp4']);
  const result = await generateLtxApiVideo(ltxApiImg2VideoSchema.parse({ prompt: 'x', sourceImagePath: image, outputPath: dir, filename: 'out.mp4' }));
  assert.equal(result.success, true);
  assert.deepEqual(calls.map(c => c.method + ' ' + c.url.replace('https://api.ltx.io', '')), ['POST /v2/image-to-video', 'GET /v2/image-to-video/j1', 'GET /v2/image-to-video/j1', 'GET https://cdn/l.mp4']);
  assert.equal(calls[0].headers.Authorization, 'Bearer ltx-key');
});
