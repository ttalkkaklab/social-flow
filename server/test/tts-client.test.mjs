import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';

import { config } from '../dist/config.js';
import { pcmToWav } from '../dist/media-utils.js';
import {
  DEFAULT_GEMINI_38_TTS_MODEL,
  GEMINI_38_TTS_MODELS,
  VALID_TTS_MODELS,
  buildGemini38InteractionBody,
  extractGemini38Audio,
  gemini38TtsSchema,
  generateGemini38Speech,
  listTtsVoices,
  ttsVoicesSchema,
} from '../dist/tts-client.js';
import { ELEVENLABS_MODELS } from '../dist/elevenlabs-client.js';
import { getTtsModels } from '../dist/tts-models.js';

const originalFetch = globalThis.fetch;
const originalKey = config.geminiApiKey;

afterEach(() => {
  globalThis.fetch = originalFetch;
  config.geminiApiKey = originalKey;
});

it('client model enums match the shared model contract (skills/_shared/tts-models.js)', () => {
  const shared = (single) => getTtsModels().filter((m) => m.single === single).map((m) => m.model);
  assert.deepEqual(shared('tts_generate'), [...VALID_TTS_MODELS]);
  assert.deepEqual(shared('tts_gemini_38'), [...GEMINI_38_TTS_MODELS]);
  assert.deepEqual(shared('tts_elevenlabs_generate'), [...ELEVENLABS_MODELS]);
});

describe('Gemini 3.8 TTS request contract', () => {
  it('builds turn-level speech_metadata and keeps inline events in verbatim text', () => {
    const request = gemini38TtsSchema.parse({
      turns: [{ text: '잠깐만요. <short pause> 들었어요?', style: 'whispered urgently' }],
    });
    assert.equal(request.model, DEFAULT_GEMINI_38_TTS_MODEL);
    assert.deepEqual(buildGemini38InteractionBody(request), {
      model: 'gemini-3.8-flash-tts',
      input: [{
        type: 'user_input',
        content: [{
          type: 'text',
          text: '잠깐만요. <short pause> 들었어요?',
          annotations: [{ type: 'speech_metadata', style: 'whispered urgently' }],
        }],
      }],
      response_format: { type: 'audio' },
      generation_config: { speech_config: [{ voice: 'Kore' }] },
    });
  });

  it('builds conversational mode with per-turn styles and pipe backchannels', () => {
    const request = gemini38TtsSchema.parse({
      model: 'gemini-3.8-flash-lite-tts',
      turns: [
        { speaker: 'Joe', text: '준비됐죠? |네| 바로 갑니다.', style: 'quick and excited' },
        { speaker: 'Jane', text: '좋아요.', style: 'calm and confident' },
      ],
      speakers: [
        { speaker: 'Joe', voice: 'Puck' },
        { speaker: 'Jane', voice: 'Kore' },
      ],
    });
    const body = buildGemini38InteractionBody(request);
    assert.deepEqual(body.generation_config.speech_config, {
      mode: 'conversational',
      speakers: [
        { speaker: 'Joe', voice: 'Puck' },
        { speaker: 'Jane', voice: 'Kore' },
      ],
    });
    assert.deepEqual(body.input[0].content[0].annotations, [{
      type: 'speech_metadata',
      speaker: 'Joe',
      style: 'quick and excited',
    }]);
    assert.match(body.input[0].content[0].text, /\|네\|/);
  });

  it('rejects missing or unknown dialogue speakers before a paid call', () => {
    const speakers = [
      { speaker: 'Joe', voice: 'Puck' },
      { speaker: 'Jane', voice: 'Kore' },
    ];
    assert.equal(gemini38TtsSchema.safeParse({ turns: [{ text: '안녕' }], speakers }).success, false);
    assert.equal(gemini38TtsSchema.safeParse({ turns: [{ speaker: 'Sam', text: '안녕' }], speakers }).success, false);
    assert.equal(gemini38TtsSchema.safeParse({ turns: [{ speaker: 'Joe', text: '안녕' }] }).success, false);
  });
});

describe('Gemini 3.8 TTS response and HTTP handling', () => {
  it('extracts the last model audio block', () => {
    const audio = extractGemini38Audio({
      steps: [
        { type: 'model_output', content: [{ type: 'audio', data: 'old', mime_type: 'audio/l16' }] },
        { type: 'model_output', content: [{ type: 'audio', data: 'new', mime_type: 'audio/wav' }] },
      ],
    });
    assert.deepEqual(audio, { data: 'new', mimeType: 'audio/wav' });
    assert.throws(() => extractGemini38Audio({ steps: [] }), /without an audio content block/);
  });

  it('posts the official JSON shape and saves the returned WAV without adding a second header', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gemini-38-tts-'));
    const wav = pcmToWav(Buffer.alloc(480), 24_000, 1);
    let observed;
    config.geminiApiKey = 'test-key';
    globalThis.fetch = async (url, options) => {
      observed = { url, options, body: JSON.parse(options.body) };
      return new Response(JSON.stringify({
        object: 'interaction',
        status: 'completed',
        id: 'fixture-interaction',
        usage: { total_input_tokens: 12, total_output_tokens: 25 },
        steps: [{
          type: 'model_output',
          content: [{ type: 'audio', data: wav.toString('base64'), mime_type: 'audio/wav', sample_rate: 24000, channels: 1 }],
        }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    };

    try {
      const request = gemini38TtsSchema.parse({
        turns: [{ text: '안녕하세요.', style: 'warm and friendly' }],
        outputPath: dir,
        filename: 'acted.wav',
      });
      const result = await generateGemini38Speech(request);
      assert.equal(result.success, true);
      assert.equal(result.audioPath, join(dir, 'acted.wav'));
      assert.deepEqual(readFileSync(result.audioPath), wav);
      const usage = JSON.parse(readFileSync(result.usageReceiptPath, 'utf8'));
      assert.deepEqual(usage.usage, { total_input_tokens: 12, total_output_tokens: 25 });
      assert.equal(usage.interactionId, 'fixture-interaction');
      assert.equal(usage.billingStatus, 'not_an_invoice');
      assert.ok(!readFileSync(result.usageReceiptPath, 'utf8').includes('test-key'));
      assert.equal(observed.url, 'https://generativelanguage.googleapis.com/v1beta/interactions');
      assert.equal(observed.options.method, 'POST');
      assert.equal(observed.options.headers['x-goog-api-key'], 'test-key');
      assert.equal(observed.body.input[0].content[0].annotations[0].style, 'warm and friendly');
      assert.deepEqual(observed.body.response_format, { type: 'audio' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('Gemini voice list', () => {
  it('Gemini library maps snake-case wire metadata and pagination without changing IDs', async () => {
    const calls = [];
    config.geminiApiKey = 'mock-key-never-sent';
    globalThis.fetch = async (url, init) => {
      calls.push({ url: new URL(url), method: init.method });
      assert.equal(init.headers['x-goog-api-key'], 'mock-key-never-sent');
      return new Response(JSON.stringify({ voices: [{ id: 'achernar', display_name: 'Achernar', type: 'prebuilt', language_code: 'en-US', description: 'Soft', accent: 'General American' }, { id: 'voice_custom', display_name: 'Actor', type: 'prompted', language_code: 'ko-KR' }], next_page_token: 'next+page=' }));
    };
    const result = await listTtsVoices(ttsVoicesSchema.parse({ source: 'library', limit: 2, pageToken: 'prior+page=' }));
    assert.equal(result.success, true, result.error);
    assert.equal(calls[0].method, 'GET');
    assert.equal(calls[0].url.pathname, '/v1beta/voices');
    assert.equal(calls[0].url.searchParams.get('page_size'), '2');
    assert.equal(calls[0].url.searchParams.get('page_token'), 'prior+page=');
    assert.equal(calls[0].url.searchParams.has('key'), false);
    assert.equal(result.voices[0].id, 'achernar');
    assert.equal(result.voices[0].languageCode, 'en-US');
    assert.equal(result.voices[1].id, 'voice_custom');
    assert.equal(result.nextPageToken, 'next+page=');
    assert.match(result.previewNote, /does not include audio previews/);
  });

  it('pagination and request bounds reject invalid input before calls', () => {
    for (const input of [{ source: 'unknown' }, { limit: 0 }, { limit: 101 }, { pageToken: 'x' }, { source: 'library', pageToken: '' }]) {
      assert.equal(ttsVoicesSchema.safeParse(input).success, false);
    }
    assert.equal(ttsVoicesSchema.parse({ source: 'library' }).limit, 30);
  });
});
