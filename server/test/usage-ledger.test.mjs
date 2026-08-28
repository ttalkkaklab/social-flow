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

import {
  episodePathArg, findEpisodeDir, isBillableTool, priceOf, recordUsage,
} from '../dist/usage-ledger.js';

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
  // tts_multi_speaker takes `script`, not `text` — reading only `text` filed it as 0 characters.
  assert.equal(priceOf('tts_multi_speaker', { script: 'x'.repeat(1000) }).quantity, 1);
  // The ElevenLabs dialogue lane takes an `inputs` array; its quantity stays null (metered),
  // but the note carries the raw count, so the count still has to be right.
  const dialogue = priceOf('tts_elevenlabs_dialogue', {
    inputs: [{ text: 'a'.repeat(600) }, { text: 'b'.repeat(400) }],
  });
  assert.equal(dialogue.quantity, null);
  assert.match(dialogue.note, /raw 1000 chars/);
});

test('a model and resolution nobody priced comes back null, not as an invented key', () => {
  // The composed key has to exist in prices.tsv or the ledger is unusable: cost-report.sh
  // answers an unknown key with exit 1, which costs the episode its whole cost verdict. Every
  // combination the clients accept is walked here — the vocabularies genuinely do not line up
  // (480p everywhere with no 480p row, 1-5-pro-audio priced at 1080p only, no veo.lite.4k).
  const known = priceKeys();
  const combos = [
    ...['veo-3.1-lite-generate-preview', 'veo-3.1-fast-generate-preview', 'veo-3.1-generate-preview']
      .flatMap((model) => ['720p', '1080p', '4k'].map((resolution) =>
        ['veo_text2video', { model, resolution }])),
    ...['seedance-1-5-pro-251215', 'seedance-1-0-pro-250528', 'seedance-1-0-pro-fast-251015',
        'dreamina-seedance-2-5-260628', 'dreamina-seedance-2-0-260128',
        'dreamina-seedance-2-0-fast-260128', 'dreamina-seedance-2-0-mini-260615']
      .flatMap((model) => ['480p', '720p', '1080p', '4k'].flatMap((resolution) =>
        [false, true].map((generateAudio) =>
          ['seedance_text2video', { model, resolution, generateAudio, durationSeconds: 5 }]))),
  ];
  const invented = [];
  for (const [tool, args] of combos) {
    const { key, note } = priceOf(tool, args);
    if (key === null) {
      assert.match(note, /no price row for/, `${JSON.stringify(args)} left no note saying why`);
      continue;
    }
    if (!known.has(key)) invented.push(`${JSON.stringify(args)} → ${key}`);
  }
  assert.deepEqual(invented, [], 'keys composed that prices.tsv does not carry');
  // And the other direction, or the guard rots silently: a price row added for a combination
  // the mapping does not know about would keep being recorded as an unpriced call forever.
  const reachable = new Set(combos.map(([tool, args]) => priceOf(tool, args).key).filter(Boolean));
  const unreachable = [...known]
    .filter((k) => /^(veo|seedance)\./.test(k))
    .filter((k) => !reachable.has(k));
  assert.deepEqual(unreachable, [], 'priced rows no call can reach — add them to PRICED_VIDEO_KEYS');
  // The guard must not swallow the whole matrix — the routes the skills actually use still price.
  assert.equal(priceOf('seedance_img2video',
    { model: 'seedance-1-5-pro-251215', resolution: '1080p', durationSeconds: 6 }).key,
    'seedance.1-5-pro-silent.1080p');
  assert.equal(priceOf('veo_img2video',
    { model: 'veo-3.1-lite-generate-preview', resolution: '1080p' }).key, 'veo.lite.1080p');
});

test('an extension is billed for the 7 seconds it adds', () => {
  // veo_extension has no durationSeconds in its schema, so the 8s default used to apply —
  // 14% over on every extension call.
  const ext = priceOf('veo_extension', { model: 'veo-3.1-fast-generate-preview' });
  assert.equal(ext.key, 'veo.fast.720p');
  assert.equal(ext.quantity, 7);
  assert.match(ext.note, /unconfirmed/);
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

test('the two gpt-image tools name their path savePath, and it is read', () => {
  // The paid image lane takes a full file path in savePath; everything else takes a directory
  // in outputPath. Reading only outputPath dropped every gpt-image call from the ledger while
  // the free local engine kept recording, so the episode looked like it spent nothing on images.
  const { ep } = makeEpisode();
  const saved = path.join(ep, 'storyboard', 'images', 'scene-1.png');
  assert.equal(episodePathArg({ savePath: saved, quality: 'high' }), saved);
  assert.equal(findEpisodeDir(episodePathArg({ savePath: saved })), ep);
  assert.equal(episodePathArg({ outputPath: path.join(ep, '.work') }), path.join(ep, '.work'));
  assert.equal(episodePathArg({ prompt: 'no path at all' }), undefined);
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
