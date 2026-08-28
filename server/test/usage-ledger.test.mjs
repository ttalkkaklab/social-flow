/**
 * usage-ledger.test.mjs — the server-side cost record.
 *
 * Two things have to hold, and neither is visible by reading the code alone.
 *
 * ① **Every price key the server can emit is a real row in `prices.tsv`.** The mapping from a
 *    tool call to a price key lives in usage-ledger.ts; the prices live in the skills tree.
 *    Nothing links the two at runtime, so a renamed price row would only surface as
 *    `!! unknown key` on somebody's episode weeks later. This test is that link.
 *
 * ② **The episode is found from `outputPath`, and only when it really is an episode.** A
 *    branding or intro call must not get filed against whichever episode sits nearby.
 */

import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { findEpisodeDir, isBillableTool, priceOf, recordUsage } from '../dist/usage-ledger.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PRICES = path.resolve(HERE, '../../skills/autoproduce/references/prices.tsv');

function priceKeys() {
  return new Set(
    readFileSync(PRICES, 'utf8')
      .split('\n')
      .filter((line) => line.trim() && !line.trimStart().startsWith('#'))
      .map((line) => line.split('\t')[0].trim())
      .filter(Boolean),
  );
}

/** A throwaway episode tree: <root>/data/<ch>/episodes/<topic>/storyboard/scenes.js */
function makeEpisode() {
  const root = mkdtempSync(path.join(tmpdir(), 'sf-ledger-'));
  const ep = path.join(root, 'data', 'ch', 'episodes', 'tp');
  mkdirSync(path.join(ep, 'storyboard'), { recursive: true });
  writeFileSync(path.join(ep, 'storyboard', 'scenes.js'), 'window.SCENES = [];\n');
  return { root, ep };
}

test('every price key the mapping can emit exists in prices.tsv', () => {
  const known = priceKeys();
  const calls = [
    // Veo — three tiers x the resolutions each supports
    ['veo_text2video', { model: 'veo-3.1-lite-generate-preview', resolution: '720p' }],
    ['veo_img2video', { model: 'veo-3.1-lite-generate-preview', resolution: '1080p' }],
    ['veo_text2video', { model: 'veo-3.1-fast-generate-preview', resolution: '720p' }],
    ['veo_img2video', { model: 'veo-3.1-fast-generate-preview', resolution: '1080p' }],
    ['veo_text2video', { model: 'veo-3.1-fast-generate-preview', resolution: '4k' }],
    ['veo_text2video', { model: 'veo-3.1-generate-preview', resolution: '720p' }],
    ['veo_text2video', { model: 'veo-3.1-generate-preview', resolution: '1080p' }],
    ['veo_text2video', { model: 'veo-3.1-generate-preview', resolution: '4k' }],
    ['veo_reference', { model: 'veo-3.1-fast-generate-preview', resolution: '1080p' }],
    // Seedance — 1.5 pro splits on audio, the rest are one row per resolution
    ['seedance_img2video', { model: 'seedance-1-5-pro-251215', resolution: '1080p' }],
    ['seedance_img2video', { model: 'seedance-1-5-pro-251215', resolution: '720p' }],
    ['seedance_img2video', { model: 'seedance-1-5-pro-251215', resolution: '1080p', generateAudio: true }],
    ['seedance_text2video', { model: 'seedance-1-0-pro-fast-251015', resolution: '1080p' }],
    ['seedance_text2video', { model: 'seedance-1-0-pro-fast-251015', resolution: '720p' }],
    ['seedance_text2video', { model: 'seedance-1-0-pro-250528', resolution: '1080p' }],
    ['seedance_reference', { model: 'dreamina-seedance-2-0-260128', resolution: '1080p' }],
    ['seedance_reference', { model: 'dreamina-seedance-2-5-260628', resolution: '720p' }],
    ['seedance_text2video', { model: 'dreamina-seedance-2-0-fast-260128', resolution: '720p' }],
    ['seedance_text2video', { model: 'dreamina-seedance-2-0-mini-260615', resolution: '720p' }],
    // Images
    ['gpt_image_text2img', { quality: 'low' }],
    ['gpt_image_text2img', { quality: 'medium' }],
    ['gpt_image_img2img', { quality: 'high' }],
    ['image_local_generate', {}],
    // Speech
    ['tts_local_generate', { text: 'x' }],
    ['tts_generate', { text: 'x', model: 'gemini-2.5-flash-preview-tts' }],
    ['tts_generate', { text: 'x', model: 'gemini-2.5-pro-preview-tts' }],
    ['tts_elevenlabs_generate', { text: 'x', model: 'eleven_multilingual_v2' }],
    ['tts_elevenlabs_generate', { text: 'x', model: 'eleven_flash_v2_5' }],
    ['tts_elevenlabs_dialogue', { text: 'x', model: 'eleven_v3' }],
    // Music
    ['music_generate_clip', {}],
    ['music_generate', { durationSeconds: 90 }],
    ['suno_generate', {}],
    ['suno_generate_sound', {}],
    ['suno_generate_lyrics', {}],
  ];
  const missing = [];
  for (const [tool, args] of calls) {
    const { key } = priceOf(tool, args);
    assert.ok(key, `${tool} ${JSON.stringify(args)} produced no price key`);
    if (!known.has(key)) missing.push(`${tool} → ${key}`);
  }
  assert.deepEqual(missing, [], 'price keys absent from prices.tsv');
});

test('Veo bills the generated length, not the requested one', () => {
  // 1080p and 4k generate 8 seconds whatever was asked for; veo_reference is pinned to 8.
  assert.equal(priceOf('veo_img2video', { resolution: '1080p', durationSeconds: 4 }).quantity, 8);
  assert.equal(priceOf('veo_img2video', { resolution: '4k', durationSeconds: 4 }).quantity, 8);
  assert.equal(priceOf('veo_reference', { resolution: '720p', durationSeconds: 4 }).quantity, 8);
  // 720p on the image/text lanes really does take the grid length.
  assert.equal(priceOf('veo_img2video', { resolution: '720p', durationSeconds: 4 }).quantity, 4);
});

test('Seedance bills exactly the seconds requested, and 1.5 pro splits on audio', () => {
  const silent = priceOf('seedance_img2video', {
    model: 'seedance-1-5-pro-251215', resolution: '1080p', durationSeconds: 6,
  });
  assert.equal(silent.key, 'seedance.1-5-pro-silent.1080p');
  assert.equal(silent.quantity, 6);
  const audio = priceOf('seedance_img2video', {
    model: 'seedance-1-5-pro-251215', resolution: '1080p', durationSeconds: 6, generateAudio: true,
  });
  assert.equal(audio.key, 'seedance.1-5-pro-audio.1080p');
});

test('speech is recorded per 1,000 characters, not per character', () => {
  const text = 'x'.repeat(412);
  assert.equal(priceOf('tts_local_generate', { text }).quantity, 0.412);
  // A multi-speaker call adds its turns up.
  const turns = [{ text: 'a'.repeat(600) }, { text: 'b'.repeat(400) }];
  assert.equal(priceOf('tts_multi_speaker', { turns }).quantity, 1);
});

test('an unmeasurable quantity is left null rather than guessed', () => {
  // ElevenLabs meters below the raw length and only reports it in a response header.
  const el = priceOf('tts_elevenlabs_generate', { text: 'x'.repeat(100), model: 'eleven_v3' });
  assert.equal(el.key, 'tts.elevenlabs');
  assert.equal(el.quantity, null);
  assert.match(el.note, /character-cost/);
  // Lyria RealTime has a quantity but no published price — the note says so.
  const lyria = priceOf('music_generate', { durationSeconds: 90 });
  assert.equal(lyria.quantity, 90);
  assert.match(lyria.note, /unconfirmed/);
});

test('the episode is found by walking up from outputPath', () => {
  const { ep } = makeEpisode();
  assert.equal(findEpisodeDir(path.join(ep, '.work', 'broll')), ep);
  assert.equal(findEpisodeDir(path.join(ep, 'storyboard', 'images')), ep);
  assert.equal(findEpisodeDir(ep), ep);
});

test('a path outside any episode records nothing', () => {
  const { root } = makeEpisode();
  // A branding or intro call — no storyboard/scenes.js above it, so it is not an episode cost.
  const assets = path.join(root, 'data', 'ch', 'assets', 'branding');
  mkdirSync(assets, { recursive: true });
  assert.equal(findEpisodeDir(assets), null);
  assert.equal(recordUsage(assets, { ts: 'x', tool: 't', ok: true, ms: 1, key: null, quantity: null }), null);
  assert.equal(findEpisodeDir(undefined), null);
});

test('events append as whole JSON lines', () => {
  const { ep } = makeEpisode();
  const out = path.join(ep, '.work', 'broll');
  const ev = (n) => ({ ts: `2026-08-28T00:00:0${n}Z`, tool: 'veo_img2video', ok: true, ms: n,
                       key: 'veo.lite.1080p', quantity: 8 });
  const file = recordUsage(out, ev(1));
  recordUsage(out, ev(2));
  assert.ok(file && existsSync(file));
  const lines = readFileSync(file, 'utf8').trim().split('\n');
  assert.equal(lines.length, 2);
  assert.equal(JSON.parse(lines[0]).ms, 1);
  assert.equal(JSON.parse(lines[1]).ms, 2);
});

test('only generation tools are recorded', () => {
  for (const t of ['veo_img2video', 'seedance_text2video', 'gpt_image_text2img',
                   'image_local_generate', 'tts_generate', 'tts_elevenlabs_generate',
                   'music_generate_clip', 'suno_generate']) {
    assert.ok(isBillableTool(t), `${t} should be billable`);
  }
  for (const t of ['naver_search', 'threads_publish', 'youtube_insights', 'datago_search',
                   'stt_local_transcribe', 'content_feedback']) {
    assert.ok(!isBillableTool(t), `${t} should not be billable`);
  }
});
