import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { generateLocalSpeech, supertonicGenerateSchema } from '../dist/supertonic-client.js';
import { generateElevenLabsSpeech, elevenLabsGenerateSchema } from '../dist/elevenlabs-client.js';
import { generateCheckedSpeech, checkedSpeechSchema } from '../dist/tts-quality.js';
const require = createRequire(import.meta.url);
const { authorizeSpeed } = require('../../skills/produce/references/tts-speed-policy.js');
const { checkTempo } = require('../../skills/produce/references/check-tts-quality.js');
const approval = { source: 'explicit-user-request', scope: 'generation', factor: 1.2, request: 'Please read this episode at 1.2x.', requestedAt: '2026-09-12T00:00:00Z' };
function setup(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'tts-speed-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function save(dir, requests) { writeFileSync(path.join(dir, 'speed-authorization.json'), JSON.stringify({ version: 1, requests })); }

test('1.0 works without approval; exact scope and explicit request are required otherwise', t => {
  const dir = setup(t);
  assert.equal(supertonicGenerateSchema.parse({ text: 'Hello.' }).speed, 1);
  assert.equal(authorizeSpeed(dir, 'generation', 1), null);
  for (const factor of [0.88, 1.05, 1.2]) assert.throws(() => authorizeSpeed(dir, 'generation', factor), /explicit user request/);
  for (const mutation of [{ source: 'channel-profile' }, { scope: 'final' }, { factor: 1.1 }, { request: '' }, { requestedAt: 'invalid' }]) {
    save(dir, [{ ...approval, ...mutation }]);
    assert.throws(() => authorizeSpeed(dir, 'generation', 1.2), /explicit user request/);
  }
  save(dir, [approval]);
  assert.deepEqual(authorizeSpeed(dir, 'generation', 1.2), approval);
  assert.throws(() => authorizeSpeed(dir, 'final', 1.2), /explicit user request/);
});

test('direct and checked generators block before synthesis or paid preflight', async t => {
  const dir = setup(t);
  await assert.rejects(generateLocalSpeech(supertonicGenerateSchema.parse({ text: 'Hello.', speed: 1.2, outputPath: dir })), /explicit user request/);
  await assert.rejects(generateElevenLabsSpeech(elevenLabsGenerateSchema.parse({ text: 'Hello.', voiceId: 'voice', speed: 1.2, outputPath: dir })), /explicit user request/);
  let called = false;
  const req = checkedSpeechSchema.parse({ generator: 'tts_local_generate', generation: { text: 'Hello.', speed: 1.2 }, expectedText: 'Hello.', language: 'English', delivery: 'Calm.', outputPath: dir, filename: 'test.wav' });
  await assert.rejects(generateCheckedSpeech(req, { preflight: async () => { called = true; } }), /explicit user request/);
  assert.equal(called, false);
  await assert.rejects(generateCheckedSpeech({ ...req, generation: { text: 'Hello.' }, playbackSpeed: 1.2 }, { preflight: async () => { called = true; } }), /explicit user request/);
  assert.equal(called, false);
});

test('final speed cannot bypass approval through missing cards or a different engine', t => {
  const dir = setup(t);
  assert.doesNotThrow(() => checkTempo(dir, 1));
  assert.throws(() => checkTempo(dir, 1.2), /explicit user request/);
  save(dir, [{ ...approval, scope: 'final' }]);
  assert.doesNotThrow(() => checkTempo(dir, 1.2));
  assert.throws(() => checkTempo(dir, 1.1), /explicit user request/);
  assert.throws(() => checkTempo(dir, 1, 0.88, 1.128), /Per-card tempo/);
  writeFileSync(path.join(dir, 'cards.tsv'), '0\tvoice.wav\t5.2\tin\n');
  writeFileSync(path.join(dir, 'voice.wav.quality.json'), JSON.stringify({ generator: 'tts_elevenlabs_generate' }));
  assert.throws(() => checkTempo(dir, 1.2), /ElevenLabs/);
});
