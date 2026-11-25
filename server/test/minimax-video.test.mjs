import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildMinimaxBody, generateMinimaxVideo, minimaxImg2VideoSchema, minimaxReferenceSchema, minimaxStatus } from '../dist/minimax-video.js';
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
function files(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-minimax-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const image = path.join(dir, 'a.png'); fs.writeFileSync(image, PNG);
  const voice = path.join(dir, 'v.wav');
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=d=3', voice]);
  return { image, voice };
}

test('frames and references go out under their roles; Max keeps the prompt as written', t => {
  const { image, voice } = files(t);
  const frames = buildMinimaxBody(minimaxImg2VideoSchema.parse({ prompt: 'x', sourceImagePath: image, lastImagePath: image }));
  assert.deepEqual(frames.content.map(c => c.role ?? c.type), ['text', 'first_frame', 'last_frame']);
  assert.equal(frames.ratio, undefined);
  assert.equal(Object.hasOwn(frames, 'generate_audio'), false);
  assert.equal(buildMinimaxBody(minimaxImg2VideoSchema.parse({ prompt: 'x', sourceImagePath: image, generateAudio: false })).generate_audio, false);
  const refs = buildMinimaxBody(minimaxReferenceSchema.parse({ prompt: 'x', model: 'MiniMax-H3-Max', ratio: '16:9', durationSeconds: 5, referenceImagePaths: [image], referenceAudioPaths: [voice] }));
  assert.deepEqual(refs.content.map(c => c.role ?? c.type), ['text', 'reference_image', 'reference_audio']);
  assert.deepEqual(refs.extra, { prompt_expansion_mode: 'disabled' });
  assert.equal(refs.duration, 5);
  assert.throws(() => minimaxReferenceSchema.parse({ prompt: 'x', model: 'MiniMax-H3-Max', durationSeconds: 4, referenceImagePaths: [image] }), /at least 5/);
  assert.throws(() => minimaxReferenceSchema.parse({ prompt: 'x', resolution: '2K', model: 'MiniMax-H3-Lite', ratio: '16:9', referenceImagePaths: [image] }), /renders/);
});

test('a voice sample outside 2–15 s fails before anything is sent', t => {
  const { image } = files(t);
  const short = path.join(path.dirname(image), 's.wav');
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=d=1', short]);
  assert.throws(() => buildMinimaxBody(minimaxReferenceSchema.parse({ prompt: 'x', referenceImagePaths: [image], referenceAudioPaths: [short] })), /2–15 s/);
});

test('task status maps to running, done with the URL, or a failure', () => {
  assert.deepEqual(minimaxStatus({ task: { status: 'running' } }), { state: 'running' });
  assert.equal(minimaxStatus({ task: { status: 'succeeded', content: { url: 'https://cdn/x.mp4' } } }).url, 'https://cdn/x.mp4');
  assert.deepEqual(minimaxStatus({ task: { status: 'failed', error: { message: 'sensitive' } } }), { state: 'failed', error: 'sensitive' });
});

test('one paid POST with the bearer key, then polls and saves the clip', async t => {
  const { image } = files(t);
  const old = config.minimaxApiKey; config.minimaxApiKey = 'mm-key'; t.after(() => { config.minimaxApiKey = old; });
  const calls = vendor(t, [{ task_id: 't1' }, { task: { status: 'running' } }, { task: { status: 'succeeded', content: { url: 'https://cdn/x.mp4' } } }, 'mp4']);
  const result = await generateMinimaxVideo(minimaxImg2VideoSchema.parse({ prompt: 'x', sourceImagePath: image, outputPath: path.dirname(image), filename: 'out.mp4' }));
  assert.equal(result.success, true);
  assert.equal(fs.readFileSync(result.videoPath, 'utf8'), 'mp4');
  assert.deepEqual(calls.map(c => c.method + ' ' + c.url.replace('https://api.minimax.io', '')),
    ['POST /v2/video_generation', 'GET /v2/query/video_generation/t1', 'GET /v2/query/video_generation/t1', 'GET https://cdn/x.mp4']);
  assert.equal(calls[0].headers.Authorization, 'Bearer mm-key');
  assert.equal(calls[3].headers.Authorization, undefined);
});
