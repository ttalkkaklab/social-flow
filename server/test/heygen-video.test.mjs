import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildHeygenBody, generateHeygenVideo, heygenImg2VideoSchema, heygenReferenceSchema, heygenStatus } from '../dist/heygen-video.js';
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


const upload = async (file) => ({ type: 'asset_id', asset_id: 'id-' + file });

test('each mode sends its own fields with prompt enhancement off', async () => {
  const image = await buildHeygenBody(heygenImg2VideoSchema.parse({ prompt: 'x', sourceImagePath: 'a.png', lastImagePath: 'b.png' }), upload);
  assert.deepEqual([image.mode, image.image.asset_id, image.end_image.asset_id, image.prompt_enhancement], ['image_to_video', 'id-a.png', 'id-b.png', 'disabled']);
  assert.equal(image.reference_images, undefined);
  const refs = await buildHeygenBody(heygenReferenceSchema.parse({ prompt: 'x', ratio: '9:16', referenceImagePaths: ['a.png', 'b.png'], referenceAudioPaths: ['v.wav'] }), upload);
  assert.deepEqual([refs.mode, refs.aspect_ratio, refs.reference_images.length, refs.reference_audio[0].asset_id], ['reference_to_video', '9:16', 2, 'id-v.wav']);
  assert.equal(refs.image, undefined);
  // 1080p and 2k have no published standard price, and over 15 s needs prompt rewriting.
  assert.throws(() => heygenImg2VideoSchema.parse({ prompt: 'x', sourceImagePath: 'a.png', resolution: '1080p' }));
  assert.throws(() => heygenImg2VideoSchema.parse({ prompt: 'x', sourceImagePath: 'a.png', durationSeconds: 20 }));
});

test('status maps completed, failed and pending', () => {
  assert.equal(heygenStatus({ data: { status: 'completed', video_url: 'https://cdn/x.mp4' } }).url, 'https://cdn/x.mp4');
  assert.deepEqual(heygenStatus({ data: { status: 'failed', failure_code: 'usage_limit_reached' } }), { state: 'failed', error: 'usage_limit_reached' });
  assert.deepEqual(heygenStatus({ data: { status: 'pending' } }), { state: 'running' });
});

test('files upload as assets, then one video POST carries their ids; an upload failure sends no video request', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-heygen-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const image = path.join(dir, 'a.png'); fs.writeFileSync(image, 'png');
  const old = config.heygenApiKey; config.heygenApiKey = 'hg-key'; t.after(() => { config.heygenApiKey = old; });
  const calls = vendor(t, [{ data: { asset_id: 'asset-1' } }, { data: { video_id: 'v1' } }, { data: { status: 'completed', video_url: 'https://cdn/v.mp4' } }, 'mp4']);
  const result = await generateHeygenVideo(heygenImg2VideoSchema.parse({ prompt: 'x', sourceImagePath: image, outputPath: dir, filename: 'out.mp4' }));
  assert.equal(result.success, true);
  assert.deepEqual(calls.map(c => c.method + ' ' + c.url.replace('https://api.heygen.com', '')), ['POST /v3/assets', 'POST /v3/models/videos', 'GET /v3/models/videos/v1', 'GET https://cdn/v.mp4']);
  assert.equal(calls[1].headers['X-Api-Key'], 'hg-key');
  assert.deepEqual(JSON.parse(calls[1].body).image, { type: 'asset_id', asset_id: 'asset-1' });
  globalThis.fetch.mock.restore();
  const failed = vendor(t, [{ data: {} }]);
  const refused = await generateHeygenVideo(heygenImg2VideoSchema.parse({ prompt: 'x', sourceImagePath: image, outputPath: dir, filename: 'out2.mp4' }));
  assert.deepEqual([refused.success, refused.terminal, failed.length], [false, true, 1]);
});
