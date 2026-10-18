import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { lyriaSongSchema, elevenMusicSchema, generateElevenMusic, generateLyriaSong } from '../dist/music-song-client.js';
import { config } from '../dist/config.js';
test('native song schemas distinguish prompt convenience from plan-only controls', () => {
  assert.equal(lyriaSongSchema.parse({ prompt: 'p', lyrics: '안녕', instrumental: false }).lyrics, '안녕');
  assert.throws(() => lyriaSongSchema.parse({ prompt: 'p', lyrics: '안녕' }));
  assert.throws(() => lyriaSongSchema.parse({ prompt: 'p', bpm: 90 }));
  assert.throws(() => elevenMusicSchema.parse({ prompt: 'p', seed: 42 }));
  const compositionPlan = { chunks: [{ text: '[Verse]\n안녕', durationMs: 3000, positiveStyles: ['piano'], negativeStyles: [] }] };
  assert.equal(elevenMusicSchema.parse({ compositionPlan, seed: 42 }).seed, 42);
  for (const extra of [{ prompt: 'p' }, { forceInstrumental: true }, { musicLengthMs: 5000 }]) assert.throws(() => elevenMusicSchema.parse({ compositionPlan, ...extra }));
  assert.throws(() => elevenMusicSchema.parse({ compositionPlan: { chunks: [{ ...compositionPlan.chunks[0], text: 'a'.repeat(201) }] } }));
});
test('ElevenLabs sends the documented body once and persists the binary and song id', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eleven-music-')); const old = config.elevenLabsApiKey;
  config.elevenLabsApiKey = 'mock-key'; t.after(() => { config.elevenLabsApiKey = old; fs.rmSync(dir, { recursive: true, force: true }); });
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls++; assert.match(String(url), /\/v1\/music\?output_format=mp3_48000_192$/);
    assert.equal(options.headers['xi-api-key'], 'mock-key');
    assert.deepEqual(JSON.parse(options.body), { model_id: 'music_v2_5', prompt: '조용한 피아노', music_length_ms: 30000, force_instrumental: true, store_for_inpainting: false });
    return new Response(Buffer.from('provider-audio'), { headers: { 'song-id': 'song-1' } });
  });
  const result = await generateElevenMusic({ prompt: '조용한 피아노', musicLengthMs: 30000, forceInstrumental: true, outputPath: dir });
  assert.equal(calls, 1); assert.equal(result.providerId, 'song-1'); assert.equal(fs.readFileSync(result.audioPath, 'utf8'), 'provider-audio');
});
test('Lyria request maps Korean lyrics into input and extracts steps audio without automatic retry', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lyria-song-')); const old = config.geminiApiKey;
  config.geminiApiKey = 'mock-key'; t.after(() => { config.geminiApiKey = old; fs.rmSync(dir, { recursive: true, force: true }); });
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls++; const body = JSON.parse(options?.body ?? await url.text()); assert.equal(body.model, 'lyria-3.5'); assert.match(body.input, /Lyrics:\n안녕/);
    assert.equal(body.lyrics, undefined);
    return new Response(JSON.stringify({ id: 'interaction-1', steps: [{ type: 'model_output', content: [{ type: 'audio', mime_type: 'audio/mp3', data: Buffer.from('audio').toString('base64') }] }] }), { headers: { 'content-type': 'application/json' } });
  });
  const result = await generateLyriaSong({ prompt: 'piano', lyrics: '안녕', instrumental: false, outputPath: dir });
  assert.equal(result.providerId, 'interaction-1'); assert.equal(calls, 1);
  t.mock.method(globalThis, 'fetch', async () => { calls++; return new Response('unavailable', { status: 503 }); });
  await assert.rejects(generateLyriaSong({ prompt: 'piano', outputPath: dir })); assert.equal(calls, 2);
});
