import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';

import { config } from '../dist/config.js';
import { pcmToWav } from '../dist/media-utils.js';
import {
  DEFAULT_GEMINI_38_TTS_MODEL,
  buildGemini38InteractionBody,
  describeGemini38Error,
  extractGemini38Audio,
  gemini38TtsSchema,
  generateGemini38Speech,
} from '../dist/tts-client.js';
import { prepareGeneration } from '../dist/tts-quality.js';

const originalFetch = globalThis.fetch;
const originalKey = config.geminiApiKey;

afterEach(() => {
  globalThis.fetch = originalFetch;
  config.geminiApiKey = originalKey;
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

  it('is available through the checked narration wrapper and excludes vocal tags from expected text', () => {
    const prepared = prepareGeneration({
      generator: 'tts_gemini_38',
      generation: { turns: [{ text: '잠깐만요. <short pause> 들었어요?', style: 'quietly' }] },
      expectedText: '잠깐만요. 들었어요?',
      language: 'Korean',
      delivery: 'quiet and tense',
      outputPath: '/tmp',
      filename: 'c0.wav',
      maxAttempts: 1,
      playbackSpeed: 1,
      sentencePause: 0.5,
    });
    assert.equal(prepared.spacing, true);
    assert.equal(prepared.args.model, 'gemini-3.8-flash-tts');
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

  it('maps official error envelopes to actionable messages', () => {
    assert.match(
      describeGemini38Error(402, JSON.stringify({ error: { code: 'payment_required', message: 'credits depleted' } })),
      /Add Gemini prepayment credits before retrying/,
    );
    assert.match(
      describeGemini38Error(404, JSON.stringify({ error: { code: 'model_not_found', message: 'missing' } })),
      /gemini-3\.8-flash-lite-tts/,
    );
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
