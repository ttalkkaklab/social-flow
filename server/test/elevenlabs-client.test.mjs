/** ElevenLabs v4 schema, payload and mocked provider contracts. No paid network calls. */

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import { config } from '../dist/config.js';
import {
  DEFAULT_ELEVENLABS_MODEL,
  DEFAULT_ELEVENLABS_OUTPUT_FORMAT,
  ELEVENLABS_DIALOGUE_MAX_INPUTS,
  ELEVENLABS_DIALOGUE_MAX_VOICES,
  ELEVENLABS_OUTPUT_FORMATS,
  ELEVENLABS_PRO_ONLY_FORMATS,
  MAX_ELEVENLABS_DIALOGUE_CHARS,
  createElevenLabsDictionary,
  describeElevenLabsError,
  elevenLabsDialogueSchema,
  elevenLabsDialogueRequestBody,
  elevenLabsGenerateSchema,
  elevenLabsVoicesSchema,
  extensionForFormat,
  generateElevenLabsDialogue,
  generateElevenLabsSpeech,
  listElevenLabsVoices,
  sampleRateForFormat,
  wavDurationSeconds,
  DEFAULT_ELEVENLABS_SFX_OUTPUT_FORMAT,
  ELEVENLABS_SFX_MODEL,
  ELEVENLABS_SFX_OUTPUT_FORMATS,
  ELEVENLABS_SFX_USD_PER_MINUTE,
  MAX_ELEVENLABS_SFX_TEXT_CHARS,
  elevenLabsSfxSchema,
  generateElevenLabsSoundEffect,
  sfxExtensionForFormat,
  sfxSampleRateForFormat,
  soundEffectRequestBody,
} from '../dist/elevenlabs-client.js';
import { pcmToWav } from '../dist/media-utils.js';
import { TOOLS } from '../dist/tools.js';

config.elevenLabsApiKey = 'test-key-never-sent';
const VOICE = '21m00Tcm4TlvDq8ikWAM';

describe('ElevenLabs constants', () => {
  it('the default output format is RIFF WAV at 24kHz — the builder sniffs RIFF and the Gemini lane is 24kHz', () => {
    assert.equal(DEFAULT_ELEVENLABS_OUTPUT_FORMAT, 'wav_24000');
    assert.equal(extensionForFormat(DEFAULT_ELEVENLABS_OUTPUT_FORMAT), '.wav');
    assert.equal(sampleRateForFormat(DEFAULT_ELEVENLABS_OUTPUT_FORMAT), 24_000);
  });

  it('every exposed format maps to .wav or .mp3 — the only audio containers the pipeline reads', () => {
    for (const format of ELEVENLABS_OUTPUT_FORMATS) {
      const ext = extensionForFormat(format);
      assert.ok(ext === '.wav' || ext === '.mp3', `${format} → ${ext}`);
      assert.equal(ext, format.startsWith('wav_') ? '.wav' : '.mp3');
      assert.ok(Number.isInteger(sampleRateForFormat(format)) && sampleRateForFormat(format) >= 16_000, `${format} sample rate`);
    }
    // no pcm_* (container-less) and no opus/m4a in the exposed list
    assert.ok(ELEVENLABS_OUTPUT_FORMATS.every((f) => !f.startsWith('pcm_') && !f.startsWith('opus_') && !f.startsWith('m4a_')));
  });

  it('the Pro-only gate list is a subset of the exposed formats (measured 403 on wav_44100)', () => {
    for (const format of ELEVENLABS_PRO_ONLY_FORMATS) assert.ok(ELEVENLABS_OUTPUT_FORMATS.includes(format), format);
    assert.ok(ELEVENLABS_PRO_ONLY_FORMATS.includes('wav_44100'));
    assert.ok(!ELEVENLABS_PRO_ONLY_FORMATS.includes(DEFAULT_ELEVENLABS_OUTPUT_FORMAT), 'the default must work on every plan');
  });
});

describe('ElevenLabs generate schema — guards that run before the paid call', () => {
  it('accepts the minimal request and fills the defaults', () => {
    const parsed = elevenLabsGenerateSchema.parse({ text: '안녕하세요.', voiceId: VOICE });
    assert.equal(parsed.model, DEFAULT_ELEVENLABS_MODEL);
    assert.equal(parsed.outputFormat, DEFAULT_ELEVENLABS_OUTPUT_FORMAT);
    assert.equal(parsed.timestamps, false);
    assert.equal(parsed.stability, undefined, 'vendor defaults apply when no voice setting is given');
  });

  it('voiceId is required and must be a path-safe identifier', () => {
    assert.equal(elevenLabsGenerateSchema.safeParse({ text: 'x' }).success, false, 'no default voice');
    for (const bad of ['bad/../id', 'a b', 'id?x=1', '']) {
      assert.equal(elevenLabsGenerateSchema.safeParse({ text: 'x', voiceId: bad }).success, false, `accepted "${bad}"`);
    }
    assert.ok(elevenLabsGenerateSchema.safeParse({ text: 'x', voiceId: 'eLDc7xhWxG2FElT3kUTj' }).success);
  });

  it('accepts only v4 and checks its 10,000-character cap', () => {
    assert.ok(elevenLabsGenerateSchema.safeParse({ text: 'x'.repeat(10_000), voiceId: VOICE }).success);
    assert.equal(elevenLabsGenerateSchema.safeParse({ text: 'x'.repeat(10_001), voiceId: VOICE }).success, false);
    for (const model of ['eleven_v3', 'eleven_multilingual_v2', 'eleven_flash_v2_5', 'eleven_v4_turbo']) {
      assert.equal(elevenLabsGenerateSchema.safeParse({ text: 'x', voiceId: VOICE, model }).success, false, model);
    }
  });

  it('bounds continuity context to 100 characters', () => {
    for (const field of ['previousText', 'nextText']) {
      assert.ok(elevenLabsGenerateSchema.safeParse({ text: 'x', voiceId: VOICE, [field]: '앞 문장.' }).success);
      assert.equal(elevenLabsGenerateSchema.safeParse({ text: 'x', voiceId: VOICE, [field]: 'x'.repeat(101) }).success, false);
    }
  });

  it('rejects SSML and unsupported controls instead of silently ignoring them', () => {
    for (const extra of [{ style: 0 }, { useSpeakerBoost: false }, { speed: 1.2 }, { speed: 0.8 }, { similarity: 0.7, similarityBoost: 0.8 }]) {
      assert.equal(elevenLabsGenerateSchema.safeParse({ text: 'x', voiceId: VOICE, ...extra }).success, false);
    }
    assert.equal(elevenLabsGenerateSchema.safeParse({ text: '<break time="1s"/>hi', voiceId: VOICE }).success, false);
    assert.ok(elevenLabsGenerateSchema.safeParse({ text: '[whispers] 안녕.', voiceId: VOICE, speed: 1 }).success);
  });

  it('the filename extension has to match the format — a mislabeled file is misread by the builder', () => {
    const mp3Name = elevenLabsGenerateSchema.safeParse({ text: 'x', voiceId: VOICE, filename: 'c1.mp3' });
    assert.equal(mp3Name.success, false);
    assert.deepEqual(mp3Name.error.issues[0].path, ['filename']);
    assert.ok(elevenLabsGenerateSchema.safeParse({ text: 'x', voiceId: VOICE, filename: 'c1.mp3', outputFormat: 'mp3_44100_128' }).success);
    assert.equal(elevenLabsGenerateSchema.safeParse({ text: 'x', voiceId: VOICE, filename: 'c1.wav', outputFormat: 'mp3_44100_128' }).success, false);
    assert.equal(elevenLabsGenerateSchema.safeParse({ text: 'x', voiceId: VOICE, filename: '../c1.wav' }).success, false, 'traversal');
  });

  it('voice settings, seed and language code keep the vendor ranges', () => {
    assert.ok(elevenLabsGenerateSchema.safeParse({ text: 'x', voiceId: VOICE, stability: 0, similarity: 1, speed: 1, seed: 4_294_967_295, languageCode: 'ko' }).success);
    assert.equal(elevenLabsGenerateSchema.safeParse({ text: 'x', voiceId: VOICE, speed: 1.3 }).success, false);
    assert.equal(elevenLabsGenerateSchema.safeParse({ text: 'x', voiceId: VOICE, seed: -1 }).success, false);
    assert.equal(elevenLabsGenerateSchema.safeParse({ text: 'x', voiceId: VOICE, languageCode: 'kor' }).success, false);
    assert.equal(elevenLabsGenerateSchema.safeParse({ text: 'x', voiceId: VOICE, applyTextNormalization: 'maybe' }).success, false);
  });
});

describe('ElevenLabs dialogue schema', () => {
  const line = (voiceId, text = '한 줄.') => ({ text, voiceId });

  it('caps lines, distinct voices and total characters at the plugin bounds', () => {
    assert.ok(elevenLabsDialogueSchema.safeParse({ inputs: [line(VOICE), line('JBFqnCBsd6RMkjVDRZzb')] }).success);
    const tooManyVoices = elevenLabsDialogueSchema.safeParse({
      inputs: Array.from({ length: ELEVENLABS_DIALOGUE_MAX_VOICES + 1 }, (_, i) => line(`voice${i}`)),
    });
    assert.equal(tooManyVoices.success, false);
    assert.match(tooManyVoices.error.issues[0].message, /distinct voices/);
    // the same voice repeated is fine — lines, not voices, are what repeats
    assert.ok(elevenLabsDialogueSchema.safeParse({ inputs: Array.from({ length: 12 }, () => line(VOICE)) }).success);
    assert.equal(elevenLabsDialogueSchema.safeParse({ inputs: Array.from({ length: ELEVENLABS_DIALOGUE_MAX_INPUTS + 1 }, () => line(VOICE)) }).success, false);
    const tooLong = elevenLabsDialogueSchema.safeParse({ inputs: [line(VOICE, 'x'.repeat(MAX_ELEVENLABS_DIALOGUE_CHARS)), line(VOICE, 'x')] });
    assert.equal(tooLong.success, false);
    assert.match(tooLong.error.issues[0].message, /at most 10000/);
  });

  it('fixes dialogue to eleven_v4 and refuses legacy model arguments', () => {
    const parsed = elevenLabsDialogueSchema.parse({ inputs: [line(VOICE)] });
    assert.equal(parsed.model, 'eleven_v4');
    assert.equal(elevenLabsDialogueSchema.safeParse({ inputs: [line(VOICE)], model: 'eleven_v3' }).success, false);
    assert.equal(parsed.outputFormat, DEFAULT_ELEVENLABS_OUTPUT_FORMAT);
  });

  it('filename/format mismatch is rejected here too', () => {
    assert.equal(elevenLabsDialogueSchema.safeParse({ inputs: [line(VOICE)], filename: 'd.mp3' }).success, false);
  });
});

describe('ElevenLabs voices schema', () => {
  it('uses the server-wide `limit` name with the vendor page_size bounds', () => {
    assert.equal(elevenLabsVoicesSchema.parse({}).limit, 30);
    assert.equal(elevenLabsVoicesSchema.safeParse({ limit: 101 }).success, false);
    assert.equal(elevenLabsVoicesSchema.safeParse({ category: 'library' }).success, false);
    assert.ok(elevenLabsVoicesSchema.safeParse({ search: 'korean', category: 'professional', limit: 100 }).success);
  });
});

describe('describeElevenLabsError — the three body shapes seen in the wild', () => {
  const current = (status, message, http) =>
    describeElevenLabsError(http, JSON.stringify({ detail: { type: 'x', code: status, message, status, request_id: 'r' } }));

  it('current shape: status string decides the hint, not the HTTP code', () => {
    assert.match(current('invalid_api_key', 'Invalid API key', 401), /ELEVENLABS_API_KEY/);
    assert.match(current('needs_authorization', 'Neither authorization header…', 401), /ELEVENLABS_API_KEY/);
    assert.match(current('missing_permissions', 'missing the permission voices_read', 401), /restricted key.*voices_read/);
    assert.match(current('quota_exceeded', 'quota', 401), /character allowance/);
    assert.match(current('payment_required', 'no credits', 402), /character allowance/);
    assert.match(current('too_many_concurrent_requests', 'busy', 429), /concurrency\/rate limit/);
    assert.match(current('concurrent_limit_exceeded', 'busy', 429), /concurrency allowance/);
    assert.match(current('unauthorized', 'Invalid API key', 401), /ELEVENLABS_API_KEY/);
    assert.match(current('output_format_not_allowed', "Output format 'wav_44100' is only available on the Pro tier and above.", 403), /wav_24000 or wav_48000/);
    assert.match(current('voice_not_found', "A voice with voice_id 'NOPE' was not found.", 404), /tts_elevenlabs_voices/);
    assert.match(current('model_does_not_support_dialogue', "Model 'eleven_v4' does not support dialogue.", 400), /eleven_v4 only/);
  });

  it('legacy shape ({detail:{status,message}}) still maps — model_not_found uses it', () => {
    const message = describeElevenLabsError(400, JSON.stringify({ detail: { status: 'model_not_found', message: 'A model with model ID eleven_bogus does not exist' } }));
    assert.match(message, /does not exist/);
    assert.match(message, /eleven_v4/);
  });

  it('422 list shape joins the field paths without the "body" prefix', () => {
    const message = describeElevenLabsError(422, JSON.stringify({ detail: [{ type: 'string_type', loc: ['body', 'text'], msg: 'Input should be a valid string', input: 123 }] }));
    assert.equal(message, 'Invalid request (HTTP 422): text: Input should be a valid string');
  });

  it('unknown status and non-JSON bodies still surface the HTTP code and text', () => {
    assert.equal(describeElevenLabsError(500, JSON.stringify({ detail: { status: 'weird', message: 'boom' } })), 'HTTP 500 weird: boom');
    assert.equal(describeElevenLabsError(502, '<html>bad gateway</html>'), 'HTTP 502: <html>bad gateway</html>');
    assert.equal(describeElevenLabsError(500, ''), 'HTTP 500: (empty body)');
  });
});

describe('wavDurationSeconds', () => {
  it('reads a plain 44-byte-header WAV (mono 24kHz) exactly', () => {
    const oneSecond = pcmToWav(Buffer.alloc(24_000 * 2), 24_000, 1);
    assert.equal(wavDurationSeconds(oneSecond), 1);
    assert.equal(wavDurationSeconds(pcmToWav(Buffer.alloc(12_000), 24_000, 1)), 0.25);
  });

  it('walks past a LIST chunk before data — the vendor WAV carries one (measured)', () => {
    const plain = pcmToWav(Buffer.alloc(48_000), 24_000, 1); // 1s
    const list = Buffer.alloc(8 + 26);
    list.write('LIST', 0);
    list.writeUInt32LE(26, 4);
    list.write('INFOISFT', 8);
    // splice LIST between the fmt chunk (ends at byte 36) and the data chunk
    const withList = Buffer.concat([plain.subarray(0, 36), list, plain.subarray(36)]);
    withList.writeUInt32LE(withList.length - 8, 4);
    assert.equal(wavDurationSeconds(withList), 1);
  });

  it('returns undefined for anything that is not RIFF/WAVE (mp3, truncated, junk)', () => {
    assert.equal(wavDurationSeconds(Buffer.from('ID3  ')), undefined);
    assert.equal(wavDurationSeconds(Buffer.from('RIFF')), undefined);
    assert.equal(wavDurationSeconds(Buffer.alloc(0)), undefined);
    // RIFF/WAVE with no data chunk
    assert.equal(wavDurationSeconds(pcmToWav(Buffer.alloc(0), 24_000, 1).subarray(0, 36)), undefined);
  });
});

/**
 * Sound effects — POST /v1/sound-generation. The endpoint's output_format enum has no wav_*
 * entry (docs, read 2026-09-16), so the lane asks for PCM and wraps it itself; what is pinned
 * here is the request mapping and the pre-call guards.
 */
describe('ElevenLabs sound effects (sfx_elevenlabs_generate)', () => {
  it('defaults: PCM 48 kHz wrapped as WAV, no loop, the vendor picks the length', () => {
    const r = elevenLabsSfxSchema.parse({ text: 'short soft whoosh, fabric through air, no tail' });
    assert.equal(r.outputFormat, DEFAULT_ELEVENLABS_SFX_OUTPUT_FORMAT);
    assert.equal(r.outputFormat, 'pcm_48000');
    assert.equal(r.loop, false);
    assert.equal(r.durationSeconds, undefined);
    assert.equal(sfxExtensionForFormat(r.outputFormat), '.wav');
    assert.equal(sfxSampleRateForFormat(r.outputFormat), 48000);
  });

  it('no format in the enum is wav_* — the endpoint has none, the server writes the RIFF header', () => {
    for (const format of ELEVENLABS_SFX_OUTPUT_FORMATS) {
      assert.match(format, /^(pcm|mp3)_/);
      assert.equal(sfxExtensionForFormat(format), format.startsWith('mp3_') ? '.mp3' : '.wav');
    }
    assert.equal(sfxSampleRateForFormat('pcm_24000'), 24000);
    assert.equal(sfxSampleRateForFormat('mp3_44100_128'), 44100);
  });

  it('the vendor body carries the model and only the fields that were asked for', () => {
    assert.deepEqual(soundEffectRequestBody(elevenLabsSfxSchema.parse({ text: 'x' })), {
      text: 'x',
      model_id: ELEVENLABS_SFX_MODEL,
    });
    assert.deepEqual(
      soundEffectRequestBody(elevenLabsSfxSchema.parse({ text: 'room tone', durationSeconds: 12, promptInfluence: 0.7, loop: true })),
      { text: 'room tone', model_id: 'eleven_text_to_sound_v2', duration_seconds: 12, prompt_influence: 0.7, loop: true },
    );
  });

  it('rejects a length outside 0.5–30 s, an over-long prompt and an influence outside 0–1 before the call', () => {
    assert.equal(elevenLabsSfxSchema.safeParse({ text: 'x', durationSeconds: 0.2 }).success, false);
    assert.equal(elevenLabsSfxSchema.safeParse({ text: 'x', durationSeconds: 31 }).success, false);
    assert.equal(elevenLabsSfxSchema.safeParse({ text: 'x', promptInfluence: 1.2 }).success, false);
    assert.equal(elevenLabsSfxSchema.safeParse({ text: 'y'.repeat(MAX_ELEVENLABS_SFX_TEXT_CHARS + 1) }).success, false);
    assert.equal(elevenLabsSfxSchema.safeParse({ text: 'x', durationSeconds: 0.5 }).success, true);
    assert.equal(elevenLabsSfxSchema.safeParse({ text: 'x', durationSeconds: 30 }).success, true);
  });

  it('a loop under 5 s is refused — it seams under narration', () => {
    const short = elevenLabsSfxSchema.safeParse({ text: 'hum', loop: true, durationSeconds: 2 });
    assert.equal(short.success, false);
    assert.match(short.error.issues[0].message, /loop/);
    assert.equal(elevenLabsSfxSchema.safeParse({ text: 'hum', loop: true, durationSeconds: 10 }).success, true);
    assert.equal(elevenLabsSfxSchema.safeParse({ text: 'hum', loop: true }).success, true);
  });

  it('the filename extension has to match the format', () => {
    const wrong = elevenLabsSfxSchema.safeParse({ text: 'x', filename: 'whoosh.mp3' });
    assert.equal(wrong.success, false);
    assert.match(wrong.error.issues[0].message, /\.wav/);
    assert.equal(elevenLabsSfxSchema.safeParse({ text: 'x', filename: 'whoosh.wav' }).success, true);
    assert.equal(elevenLabsSfxSchema.safeParse({ text: 'x', filename: 'whoosh.mp3', outputFormat: 'mp3_44100_128' }).success, true);
    assert.equal(elevenLabsSfxSchema.safeParse({ text: 'x', filename: '../whoosh.wav' }).success, false);
  });

  it('the rate is the pricing/api figure — per minute of generated audio, every plan', () => {
    assert.equal(ELEVENLABS_SFX_USD_PER_MINUTE, 0.12);
  });
});

/** Mocked provider boundary: paid calls are replaced with deterministic responses. */
describe('ElevenLabs provider boundary (mocked fetch)', () => {
  const VOICE = 'test_voice';

  const alignment = { characters: ['안', '녕'], character_start_times_seconds: [0, 0.1], character_end_times_seconds: [0.1, 0.2] };
  const segments = [{ voice_id: VOICE, start_time_seconds: 0, end_time_seconds: 0.2, character_start_index: 0, character_end_index: 2, dialogue_input_index: 0 }];

  function audioResponse(timestamps = false) {
    const wav = pcmToWav(Buffer.alloc(24_000 * 2), 24_000, 1);
    return timestamps
      ? new Response(JSON.stringify({ audio_base64: wav.toString('base64'), alignment, normalized_alignment: alignment, voice_segments: segments }), { headers: { 'content-type': 'application/json', 'character-cost': '2', 'request-id': 'mock-v4' } })
      : new Response(wav, { headers: { 'content-type': 'audio/wav', 'character-cost': '2' } });
  }

  it('v4 payload uses dialogue settings and preserves inline audio directions', () => {
    const request = elevenLabsDialogueSchema.parse({ inputs: [{ text: '[whispers] 안녕.', voiceId: VOICE }], stability: 0.4, similarity: 0.8, speed: 1, previousText: '앞말', nextText: '뒷말', seed: 42, languageCode: 'ko', pronunciationDictionaryLocators: [{ pronunciationDictionaryId: 'dict', versionId: 'v1' }] });
    assert.deepEqual(elevenLabsDialogueRequestBody(request), {
      inputs: [{ text: '[whispers] 안녕.', voice_id: VOICE }], model_id: 'eleven_v4', settings: { stability: 0.4, similarity: 0.8 },
      previous_text: '앞말', future_text: '뒷말', seed: 42, language_code: 'ko', pronunciation_dictionary_locators: [{ pronunciation_dictionary_id: 'dict', version_id: 'v1' }],
    });
    const legacy = elevenLabsDialogueSchema.parse({ inputs: [{ text: '안녕.', voiceId: VOICE }], similarityBoost: 0.6 });
    assert.deepEqual(elevenLabsDialogueRequestBody(legacy).settings, { similarity: 0.6 });
  });

  it('single-voice synthesis calls v4 dialogue and keeps timestamp/voice provenance', async () => {
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

  it('direct adapter calls reject old models and unsupported controls before fetch', async () => {
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

  it('provider refusal returns an error without switching models or endpoints', async () => {
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

  it('voice discovery preserves filters, pagination and preview URL', async () => {
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

  it('v4 supports documented language exceptions and slash IPA without accepting SSML', () => {
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

  it('both schemas bound request IDs and reject zero-retention stitching before fetch', async () => {
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

  it('continuity and clone controls reach both routes in provider field names', async () => {
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

  it('Dialogue recommendation warns above 2000 without overriding the model cap', async () => {
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

  it('MCP tool surfaces expose the same v4 controls as runtime validation', () => {
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

  it('a paid sound effect and a dictionary POST are submitted once, even on a 5xx', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'eleven-once-'));
    const savedFetch = globalThis.fetch, savedKey = config.elevenLabsApiKey;
    let calls = 0;
    config.elevenLabsApiKey = 'test-key';
    globalThis.fetch = async () => { calls++; return new Response('busy', { status: 503 }); };
    try {
      const sfx = await generateElevenLabsSoundEffect(elevenLabsSfxSchema.parse({ text: 'whoosh', outputPath: dir }));
      assert.equal(sfx.success, false);
      assert.equal(calls, 1);
      await assert.rejects(createElevenLabsDictionary({ name: 'test', rules: [{ stringToReplace: 'a', alias: 'b' }] }));
      assert.equal(calls, 2);
    } finally {
      globalThis.fetch = savedFetch;
      config.elevenLabsApiKey = savedKey;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('dictionaries retain versions and reject silent malformed locators', () => {
    const base = { text: '어을우동', voiceId: 'voice', pronunciationDictionaryLocators: [{ pronunciationDictionaryId: 'dict', versionId: 'v1' }] };
    assert.deepEqual(elevenLabsGenerateSchema.parse(base).pronunciationDictionaryLocators, base.pronunciationDictionaryLocators);
    for (const locators of [[{ pronunciationDictionaryId: 'dict' }], Array(4).fill(base.pronunciationDictionaryLocators[0]), [{ pronunciationDictionaryId: '', versionId: 'v1' }]]) assert.equal(elevenLabsGenerateSchema.safeParse({ ...base, pronunciationDictionaryLocators: locators }).success, false);
  });

  it('dictionary and v4 context reach the real HTTP serialization without a speed control', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'eleven-v4-dict-'));
    const savedFetch = globalThis.fetch;
    const requests = [];
    globalThis.fetch = async (url, init) => {
      requests.push({ url: String(url), body: JSON.parse(init.body) });
      return String(url).includes('add-from-rules') ? new Response(JSON.stringify({ id: 'dict', version_id: 'v1' })) : new Response(pcmToWav(Buffer.alloc(48000), 24000, 1));
    };
    try {
      const dict = await createElevenLabsDictionary({ name: 'test', rules: [{ stringToReplace: '어을우동', alias: '어으루동' }] });
      const result = await generateElevenLabsSpeech(elevenLabsGenerateSchema.parse({ text: '어을우동', voiceId: 'voice', outputPath: dir, filename: 'out.wav', seed: 210836, speed: 1, previousText: '앞 문장', nextText: '뒷 문장', pronunciationDictionaryLocators: [dict] }));
      assert.equal(result.success, true, result.error);
      const [d, r] = requests;
      assert.deepEqual(d.body.rules, [{ type: 'alias', string_to_replace: '어을우동', alias: '어으루동' }]);
      assert.equal(r.body.inputs[0].text, '어을우동'); assert.equal(r.body.model_id, 'eleven_v4'); assert.equal(r.body.seed, 210836); assert.equal(r.body.voice_settings?.speed, undefined); assert.equal(r.body.previous_text, '앞 문장'); assert.equal(r.body.future_text, '뒷 문장');
      assert.deepEqual(r.body.pronunciation_dictionary_locators, [{ pronunciation_dictionary_id: 'dict', version_id: 'v1' }]);
    } finally {
      globalThis.fetch = savedFetch;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
