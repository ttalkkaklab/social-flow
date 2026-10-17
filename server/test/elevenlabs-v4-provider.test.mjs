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
const { TOOLS } = await import('../dist/tools.js');
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

test('v4 supports documented language exceptions and slash IPA without accepting SSML', () => {
  for (const languageCode of ['ko', 'en', 'ast', 'yue', 'ceb', 'fil']) {
    for (const [schema, input] of [
      [elevenLabsGenerateSchema, { text: '/həˈloʊ/', voiceId: VOICE }],
      [elevenLabsDialogueSchema, { inputs: [{ text: '/həˈloʊ/', voiceId: VOICE }] }],
    ]) assert.ok(schema.safeParse({ ...input, languageCode }).success, languageCode);
  }
  for (const languageCode of ['kor', 'eng', 'ko-KR', 'Korean', '']) {
    assert.equal(elevenLabsGenerateSchema.safeParse({ text: '안녕', voiceId: VOICE, languageCode }).success, false);
  }
  assert.equal(elevenLabsGenerateSchema.safeParse({ text: '<phoneme ph="həˈloʊ">hello</phoneme>', voiceId: VOICE }).success, false);
});

test('both schemas bound request IDs and reject zero-retention stitching before fetch', async () => {
  const savedFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('unexpected fetch'); };
  try {
    for (const field of ['previousRequestIds', 'nextRequestIds']) {
      for (const value of [[], [''], [' '], ['a', 'b', 'c', 'd']]) {
        assert.equal(elevenLabsGenerateSchema.safeParse({ text: 'hi', voiceId: VOICE, [field]: value }).success, false);
        assert.equal(elevenLabsDialogueSchema.safeParse({ inputs: [{ text: 'hi', voiceId: VOICE }], [field]: value }).success, false);
      }
      assert.equal((await generateElevenLabsSpeech({ text: 'hi', voiceId: VOICE, enableLogging: false, [field]: ['real-id'] })).success, false);
      assert.equal((await generateElevenLabsDialogue({ inputs: [{ text: 'hi', voiceId: VOICE }], enableLogging: false, [field]: ['real-id'] })).success, false);
    }
    assert.equal(calls, 0);
  } finally { globalThis.fetch = savedFetch; }
});

test('continuity and clone controls reach both routes in provider field names', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'eleven-v4-controls-'));
  const savedFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const parsedUrl = new URL(url);
    calls.push({ url: parsedUrl, body: JSON.parse(init.body) });
    return audioResponse(parsedUrl.pathname.endsWith('/with-timestamps'));
  };
  try {
    for (const timestamps of [false, true]) {
      const controls = { languageCode: 'yue', previousRequestIds: ['oldest', 'closest'], nextRequestIds: ['following', 'latest'], usePvcAsIvc: false, enableLogging: true, timestamps, outputPath: dir, filename: `take-${timestamps}.wav` };
      const result = timestamps
        ? await generateElevenLabsDialogue(elevenLabsDialogueSchema.parse({ inputs: [{ text: '/həˈloʊ/', voiceId: VOICE }, { text: 'hello', voiceId: 'other-voice' }], ...controls }))
        : await generateElevenLabsSpeech(elevenLabsGenerateSchema.parse({ text: '/həˈloʊ/', voiceId: VOICE, ...controls }));
      assert.equal(result.success, true, result.error);
      const { url, body } = calls.at(-1);
      assert.equal(url.searchParams.get('enable_logging'), 'true');
      assert.deepEqual(body.previous_request_ids, ['oldest', 'closest']);
      assert.deepEqual(body.next_request_ids, ['following', 'latest']);
      assert.equal(body.use_pvc_as_ivc, false);
      assert.equal(body.language_code, 'yue');
      assert.equal(body.enable_logging, undefined);
      assert.equal(body.output_format, undefined);
      assert.equal(body.inputs[0].text, '/həˈloʊ/');
      if (timestamps) {
        const sidecar = JSON.parse(readFileSync(result.alignmentPath, 'utf8'));
        assert.deepEqual(sidecar.request, body);
        assert.equal(sidecar.requestId, 'mock-v4');
        assert.equal(sidecar.characterCost, 2);
        assert.equal(sidecar.enable_logging, true);
        assert.equal(sidecar.output_format, 'wav_24000');
        assert.deepEqual(sidecar.normalized_alignment, alignment);
      }
    }
    for (const timestamps of [false, true]) {
      const result = await generateElevenLabsSpeech(elevenLabsGenerateSchema.parse({ text: 'hi', voiceId: VOICE, enableLogging: false, usePvcAsIvc: true, timestamps, outputPath: dir, filename: `private-${timestamps}.wav` }));
      assert.equal(result.success, true, result.error);
      assert.equal(calls.at(-1).url.searchParams.get('enable_logging'), 'false');
      assert.equal(calls.at(-1).body.use_pvc_as_ivc, true);
      if (timestamps) assert.equal(JSON.parse(readFileSync(result.alignmentPath, 'utf8')).enable_logging, false);
    }
    const result = await generateElevenLabsSpeech(elevenLabsGenerateSchema.parse({ text: 'hi', voiceId: VOICE, outputPath: dir, filename: 'defaults.wav' }));
    assert.equal(result.success, true);
    assert.equal(calls.at(-1).url.searchParams.has('enable_logging'), false);
    for (const key of ['previous_request_ids', 'next_request_ids', 'use_pvc_as_ivc']) assert.equal(Object.hasOwn(calls.at(-1).body, key), false);
    assert.equal(calls.length, 5, 'no hidden chunking, audition or fallback requests');
  } finally {
    globalThis.fetch = savedFetch;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Dialogue recommendation warns above 2000 without overriding the model cap', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'eleven-v4-size-'));
  const savedFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return audioResponse(); };
  try {
    const short = await generateElevenLabsSpeech(elevenLabsGenerateSchema.parse({ text: 'x'.repeat(2000), voiceId: VOICE, outputPath: dir, filename: 'short.wav' }));
    assert.equal(short.success, true, short.error);
    assert.deepEqual(short.warnings, []);
    const long = await generateElevenLabsDialogue(elevenLabsDialogueSchema.parse({ inputs: [{ text: 'x'.repeat(1000), voiceId: VOICE }, { text: 'x'.repeat(1001), voiceId: 'other' }], outputPath: dir, filename: 'long.wav' }));
    assert.equal(long.success, true, long.error);
    assert.match(long.warnings[0], /2001.*2000/);
    assert.equal(calls, 2);
    assert.equal(elevenLabsDialogueSchema.safeParse({ inputs: [{ text: 'x'.repeat(10001), voiceId: VOICE }] }).success, false);
  } finally {
    globalThis.fetch = savedFetch;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('MCP tool surfaces expose the same v4 controls as runtime validation', () => {
  for (const name of ['tts_elevenlabs_generate', 'tts_elevenlabs_dialogue']) {
    const tool = TOOLS.find(t => t.name === name);
    const properties = tool.inputSchema.properties;
    const schema = name.endsWith('generate') ? elevenLabsGenerateSchema : elevenLabsDialogueSchema;
    assert.deepEqual(Object.keys(properties).sort(), Object.keys(schema.innerType().shape).sort());
    assert.equal(properties.seed.type, 'integer');
    assert.equal(properties.previousRequestIds.maxItems, 3);
    assert.equal(properties.nextRequestIds.maxItems, 3);
    assert.equal(new RegExp(properties.languageCode.pattern).test('yue'), true);
    assert.equal(new RegExp(properties.languageCode.pattern).test('kor'), false);
    assert.match(tool.description, /paid/);
    assert.match(tool.description, /tts_elevenlabs_voices/);
  }
});
