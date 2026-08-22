/**
 * ElevenLabs client — pure-function and schema tests. No network.
 *
 * The live contract (query-parameter output_format, RIFF wav_24000, romanized
 * normalized_alignment, v3 rejecting previous_text, voice_segments on dialogue
 * timestamps) was measured on 2026-08-23 against api.elevenlabs.io; what is
 * pinned here is everything the server decides BEFORE or AFTER that call —
 * error wording, file naming, the pre-call guards that keep a paid request
 * from being sent when the vendor would reject it anyway.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DEFAULT_ELEVENLABS_MODEL,
  DEFAULT_ELEVENLABS_OUTPUT_FORMAT,
  ELEVENLABS_DIALOGUE_MAX_INPUTS,
  ELEVENLABS_DIALOGUE_MAX_VOICES,
  ELEVENLABS_MODELS,
  ELEVENLABS_MODEL_CHAR_CAPS,
  ELEVENLABS_OUTPUT_FORMATS,
  ELEVENLABS_PRO_ONLY_FORMATS,
  MAX_ELEVENLABS_DIALOGUE_CHARS,
  MAX_ELEVENLABS_INPUT_CHARS,
  describeElevenLabsError,
  elevenLabsDialogueSchema,
  elevenLabsGenerateSchema,
  elevenLabsVoicesSchema,
  extensionForFormat,
  sampleRateForFormat,
  wavDurationSeconds,
} from '../dist/elevenlabs-client.js';
import { pcmToWav } from '../dist/media-utils.js';

const VOICE = '21m00Tcm4TlvDq8ikWAM';

describe('ElevenLabs constants', () => {
  it('the default model is the vendor convert default and its cap is the schema cap', () => {
    assert.equal(DEFAULT_ELEVENLABS_MODEL, 'eleven_multilingual_v2');
    assert.equal(MAX_ELEVENLABS_INPUT_CHARS, ELEVENLABS_MODEL_CHAR_CAPS[DEFAULT_ELEVENLABS_MODEL]);
    assert.ok(ELEVENLABS_MODELS.includes('eleven_v3') && ELEVENLABS_MODELS.includes('eleven_flash_v2_5'));
  });

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

  it('enforces the per-model cap — v3 is lower than the schema cap', () => {
    const atCap = 'x'.repeat(ELEVENLABS_MODEL_CHAR_CAPS.eleven_v3);
    assert.ok(elevenLabsGenerateSchema.safeParse({ text: atCap, voiceId: VOICE, model: 'eleven_v3' }).success);
    const over = elevenLabsGenerateSchema.safeParse({ text: `${atCap}x`, voiceId: VOICE, model: 'eleven_v3' });
    assert.equal(over.success, false);
    assert.match(over.error.issues[0].message, /eleven_v3 takes at most 5000/);
    // the same text passes on the default model (10k cap)
    assert.ok(elevenLabsGenerateSchema.safeParse({ text: `${atCap}x`, voiceId: VOICE }).success);
    assert.equal(elevenLabsGenerateSchema.safeParse({ text: 'x'.repeat(MAX_ELEVENLABS_INPUT_CHARS + 1), voiceId: VOICE }).success, false);
  });

  it('rejects previousText/nextText on eleven_v3 (measured 400 unsupported_model)', () => {
    for (const field of ['previousText', 'nextText']) {
      const result = elevenLabsGenerateSchema.safeParse({ text: 'x', voiceId: VOICE, model: 'eleven_v3', [field]: '앞 문장.' });
      assert.equal(result.success, false, `${field} accepted on v3`);
      assert.deepEqual(result.error.issues[0].path, [field]);
      assert.match(result.error.issues[0].message, /eleven_v3 does not accept/);
    }
    assert.ok(elevenLabsGenerateSchema.safeParse({ text: 'x', voiceId: VOICE, previousText: '앞 문장.', nextText: '뒷 문장.' }).success);
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
    assert.ok(elevenLabsGenerateSchema.safeParse({ text: 'x', voiceId: VOICE, stability: 0, similarityBoost: 1, style: 0.3, speed: 1.2, useSpeakerBoost: false, seed: 4_294_967_295, languageCode: 'ko' }).success);
    assert.equal(elevenLabsGenerateSchema.safeParse({ text: 'x', voiceId: VOICE, speed: 1.3 }).success, false);
    assert.equal(elevenLabsGenerateSchema.safeParse({ text: 'x', voiceId: VOICE, seed: -1 }).success, false);
    assert.equal(elevenLabsGenerateSchema.safeParse({ text: 'x', voiceId: VOICE, languageCode: 'kor' }).success, false);
    assert.equal(elevenLabsGenerateSchema.safeParse({ text: 'x', voiceId: VOICE, applyTextNormalization: 'maybe' }).success, false);
  });
});

describe('ElevenLabs dialogue schema', () => {
  const line = (voiceId, text = '한 줄.') => ({ text, voiceId });

  it('caps lines, distinct voices and total characters at the v3 limits', () => {
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
    assert.match(tooLong.error.issues[0].message, /at most 5000/);
  });

  it('has no model argument — dialogue is eleven_v3 only', () => {
    const parsed = elevenLabsDialogueSchema.parse({ inputs: [line(VOICE)] });
    assert.ok(!('model' in parsed));
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
    assert.match(current('too_many_concurrent_requests', 'busy', 429), /concurrency\/rate limit.*Free 2/);
    assert.match(current('concurrent_limit_exceeded', 'busy', 429), /Free 2/);
    assert.match(current('unauthorized', 'Invalid API key', 401), /ELEVENLABS_API_KEY/);
    assert.match(current('output_format_not_allowed', "Output format 'wav_44100' is only available on the Pro tier and above.", 403), /wav_24000 or wav_48000/);
    assert.match(current('voice_not_found', "A voice with voice_id 'NOPE' was not found.", 404), /tts_elevenlabs_voices/);
    assert.match(current('model_does_not_support_dialogue', "Model 'eleven_multilingual_v2' does not support dialogue.", 400), /eleven_v3 only/);
  });

  it('legacy shape ({detail:{status,message}}) still maps — model_not_found uses it', () => {
    const message = describeElevenLabsError(400, JSON.stringify({ detail: { status: 'model_not_found', message: 'A model with model ID eleven_bogus does not exist' } }));
    assert.match(message, /does not exist/);
    assert.match(message, /eleven_multilingual_v2, eleven_v3/);
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
