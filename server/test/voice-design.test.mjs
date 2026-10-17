import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.GEMINI_API_KEY = 'mock-key-never-sent';
const { designGeminiVoice } = await import('../dist/voice-design.js');
const { listTtsVoices, ttsVoicesSchema } = await import('../dist/tts-client.js');

test('live voice filters survive pagination and encode repeated values', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async url => {
    const q = new URL(url).searchParams;
    assert.deepEqual(q.getAll('language_code'), ['ko-KR', 'ja-JP']);
    assert.equal(q.get('gender'), 'male');
    assert.equal(q.get('pitch'), 'low');
    assert.equal(q.get('search'), '55-year-old');
    assert.equal(q.get('page_token'), 'next+');
    return new Response(JSON.stringify({ voices: [] }));
  };
  try {
    const result = await listTtsVoices(ttsVoicesSchema.parse({ source: 'library', languageCode: ['ko-KR','ja-JP'], gender: ['male'], pitch: ['low'], search: '55-year-old', pageToken: 'next+' }));
    assert.equal(result.success, true);
    assert.equal(ttsVoicesSchema.safeParse({ gender: ['male'] }).success, false);
  } finally { globalThis.fetch = original; }
});

for (const valid of [true, false]) test(`voice design preserves remote identity and prevents duplicate creation (valid preview: ${valid})`, async () => {
  const root = mkdtempSync(join(tmpdir(), 'voice-design-'));
  const original = globalThis.fetch;
  let calls = 0;
  const wav = Buffer.alloc(48); wav.write('RIFF'); wav.write('WAVE', 8);
  globalThis.fetch = async (url, init) => {
    calls++;
    assert.equal(new URL(url).pathname, '/v1beta/voices');
    const body = JSON.parse(init.body);
    assert.equal(body.store, true);
    assert.equal(body.voice.type, 'prompted');
    assert.equal(body.voice.prompted.base_voice, 'Charon');
    assert.equal(body.voice.prompted.input, 'Korean man aged 50, textured baritone.');
    return new Response(JSON.stringify({ id: 'voice_test', sample_audio: { mime_type: 'audio/wav', data: valid ? wav.toString('base64') : 'invalid' }, usage: { total_tokens: 20 } }));
  };
  try {
    const args = { model: 'gemini-3.8-flash-tts', displayName: 'Uncle', prompt: 'Korean man aged 50, textured baritone.', gender: 'male', languageCode: 'ko-KR', baseVoice: 'Charon', outputPath: root };
    const result = await designGeminiVoice(args);
    assert.equal(result.success, valid);
    assert.equal(result.voiceId, 'voice_test');
    if (valid) assert.deepEqual(readFileSync(result.samplePath), wav);
    const receipt = JSON.parse(readFileSync(result.receiptPath));
    assert.equal(receipt.voice.id, 'voice_test');
    assert.equal(receipt.reviewStatus, 'not_reviewed');
    assert.equal(receipt.voice.sample_audio, undefined);
    await assert.rejects(designGeminiVoice(args));
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; rmSync(root, { recursive: true, force: true }); }
});
