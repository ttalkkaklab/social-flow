/** Mocked provider boundary: paid calls are replaced with deterministic responses. */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

process.env.ELEVENLABS_API_KEY = 'test-key-never-sent';
const {
  elevenLabsDialogueSchema,
  elevenLabsDialogueRequestBody,
  elevenLabsGenerateSchema,
  elevenLabsVoicesSchema,
  generateElevenLabsSpeech,
  generateElevenLabsDialogue,
  listElevenLabsVoices,
} = await import('../dist/elevenlabs-client.js');
const { pcmToWav } = await import('../dist/media-utils.js');
const VOICE = 'test_voice';

const alignment = { characters: ['안', '녕'], character_start_times_seconds: [0, 0.1], character_end_times_seconds: [0.1, 0.2] };
const segments = [{ voice_id: VOICE, start_time_seconds: 0, end_time_seconds: 0.2, character_start_index: 0, character_end_index: 2, dialogue_input_index: 0 }];

function audioResponse(timestamps = false) {
  const wav = pcmToWav(Buffer.alloc(24_000 * 2), 24_000, 1);
  return timestamps
    ? new Response(JSON.stringify({ audio_base64: wav.toString('base64'), alignment, normalized_alignment: alignment, voice_segments: segments }), { headers: { 'content-type': 'application/json', 'character-cost': '2', 'request-id': 'mock-v4' } })
    : new Response(wav, { headers: { 'content-type': 'audio/wav', 'character-cost': '2' } });
}

test('v4 payload uses dialogue settings and preserves inline audio directions', () => {
  const request = elevenLabsDialogueSchema.parse({ inputs: [{ text: '[whispers] 안녕.', voiceId: VOICE }], stability: 0.4, similarity: 0.8, speed: 1, previousText: '앞말', nextText: '뒷말', seed: 42, languageCode: 'ko', pronunciationDictionaryLocators: [{ pronunciationDictionaryId: 'dict', versionId: 'v1' }] });
  assert.deepEqual(elevenLabsDialogueRequestBody(request), {
    inputs: [{ text: '[whispers] 안녕.', voice_id: VOICE }], model_id: 'eleven_v4', settings: { stability: 0.4, similarity: 0.8 },
    previous_text: '앞말', future_text: '뒷말', seed: 42, language_code: 'ko', pronunciation_dictionary_locators: [{ pronunciation_dictionary_id: 'dict', version_id: 'v1' }],
  });
  const legacy = elevenLabsDialogueSchema.parse({ inputs: [{ text: '안녕.', voiceId: VOICE }], similarityBoost: 0.6 });
  assert.deepEqual(elevenLabsDialogueRequestBody(legacy).settings, { similarity: 0.6 });
});

test('single-voice synthesis calls v4 dialogue and keeps timestamp/voice provenance', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'eleven-v4-'));
  const savedFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: new URL(url), body: JSON.parse(init.body) });
    return audioResponse(true);
  };
  try {
    const result = await generateElevenLabsSpeech(elevenLabsGenerateSchema.parse({ text: '[whispers] 안녕', voiceId: VOICE, timestamps: true, outputPath: dir, filename: 'acted.wav', similarity: 0.85, speed: 1 }));
    assert.equal(result.success, true, result.error);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url.pathname, '/v1/text-to-dialogue/with-timestamps');
    assert.equal(calls[0].url.searchParams.get('output_format'), 'wav_24000');
    assert.deepEqual(calls[0].body, { inputs: [{ text: '[whispers] 안녕', voice_id: VOICE }], model_id: 'eleven_v4', settings: { similarity: 0.85 } });
    assert.equal(result.model, 'eleven_v4');
    assert.equal(result.durationSeconds, 1);
    assert.equal(result.characterCost, 2);
    assert.equal(result.voiceSegments, 1);
    const sidecar = JSON.parse(readFileSync(result.alignmentPath, 'utf8'));
    assert.deepEqual(sidecar.alignment, alignment);
    assert.deepEqual(sidecar.voice_segments, segments);
    assert.equal(sidecar.voice_id, VOICE);
    assert.equal(sidecar.text, '[whispers] 안녕');
    assert.deepEqual(sidecar.request, calls[0].body);
  } finally {
    globalThis.fetch = savedFetch;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('direct adapter calls reject old models and unsupported controls before fetch', async () => {
  const savedFetch = globalThis.fetch;
  let count = 0;
  globalThis.fetch = async () => { count++; throw new Error('unexpected fetch'); };
  try {
    for (const extra of [{ model: 'eleven_v3' }, { model: 'eleven_v4_turbo' }, { speed: 1.2 }, { style: 0 }, { useSpeakerBoost: false }]) {
      const result = await generateElevenLabsSpeech({ text: '안녕', voiceId: VOICE, ...extra });
      assert.equal(result.success, false, JSON.stringify(extra));
    }
    assert.equal((await generateElevenLabsDialogue({ inputs: [{ text: '안녕', voiceId: VOICE }], model: 'eleven_v3' })).success, false);
    assert.equal(count, 0);
  } finally { globalThis.fetch = savedFetch; }
});

test('provider refusal returns an error without switching models or endpoints', async () => {
  const savedFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: new URL(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ detail: { status: 'model_not_found', message: 'Model unavailable' } }), { status: 400 });
  };
  try {
    const result = await generateElevenLabsSpeech(elevenLabsGenerateSchema.parse({ text: '안녕', voiceId: VOICE }));
    assert.equal(result.success, false);
    assert.match(result.error, /eleven_v4/);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.model_id, 'eleven_v4');
    assert.equal(calls[0].url.pathname, '/v1/text-to-dialogue');
  } finally { globalThis.fetch = savedFetch; }
});

test('voice discovery preserves filters, pagination and preview URL', async () => {
  const savedFetch = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(new URL(url));
    if (new URL(url).pathname === '/v1/user/subscription') return new Response('{}');
    return new Response(JSON.stringify({ voices: [{ voice_id: VOICE, name: 'Korean actor', preview_url: 'https://example.test/preview.mp3', labels: { gender: 'male', language: 'ko', accent: 'standard' }, verified_languages: [{ language: 'ko' }] }], has_more: true, next_page_token: 'page+2=', total_count: 7 }));
  };
  try {
    const result = await listElevenLabsVoices(elevenLabsVoicesSchema.parse({ languages: ['ko', 'en'], gender: 'male', accent: 'standard', nextPageToken: 'page+1=', limit: 2 }));
    assert.equal(result.success, true);
    assert.deepEqual(urls[0].searchParams.getAll('language'), ['ko', 'en']);
    assert.equal(urls[0].searchParams.get('gender'), 'male');
    assert.equal(urls[0].searchParams.get('accent'), 'standard');
    assert.equal(urls[0].searchParams.get('next_page_token'), 'page+1=');
    assert.equal(result.nextPageToken, 'page+2=');
    assert.equal(result.hasMore, true);
    assert.equal(result.voices[0].previewUrl, 'https://example.test/preview.mp3');
  } finally { globalThis.fetch = savedFetch; }
});
