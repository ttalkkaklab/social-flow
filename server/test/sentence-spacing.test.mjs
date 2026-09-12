import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { parseWav, respace, splitSentences, locateSegments, planGaps, SPACING_DEFAULTS } from '../dist/sentence-spacing.js';
import { checkedSpeechSchema, generateCheckedSpeech, prepareGeneration, sentencesPathFor } from '../dist/tts-quality.js';
import { pcmToWav } from '../dist/media-utils.js';
const require = createRequire(import.meta.url);
const checker = require('../../skills/produce/references/check-tts-quality.js');

const SR = 24000;
const SENTENCES = ['오늘은 맑아요.', '내일은 비가 와요.', '모레는 눈이 와요.'];
const TEXT = SENTENCES.join(' ');

/** A take that speaks each letter for 150 ms as a tone burst and pauses `gap` seconds between sentences. */
function fakeTake(gap, letterSeconds = 0.15) {
  const chars = [...TEXT], starts = [], ends = [];
  let t = 0;
  for (const c of chars) {
    if (/[\p{L}\p{N}]/u.test(c)) { starts.push(t); t += letterSeconds; ends.push(t); }
    else if (/[.?!]/.test(c)) { starts.push(t); t += gap; ends.push(t); } // the vendor hangs the pause on the period
    else { starts.push(t); ends.push(t); }
  }
  const total = Math.round((t + 0.2) * SR);
  const pcm = Buffer.alloc(total * 2);
  for (let i = 0; i < chars.length; i++) {
    if (!/[\p{L}\p{N}]/u.test(chars[i])) continue;
    for (let s = Math.round(starts[i] * SR); s < Math.round(ends[i] * SR); s++) pcm.writeInt16LE(Math.round(8000 * Math.sin(s / 7)), s * 2);
  }
  return { wav: pcmToWav(pcm, SR, 1), alignment: { characters: chars, character_start_times_seconds: starts, character_end_times_seconds: ends } };
}
const rms = (pcm, from, to) => { let s = 0, n = 0; for (let i = from; i < to; i++) { const x = pcm.readInt16LE(i * 2); s += x * x; n++; } return n ? Math.sqrt(s / n) : 0; };

test('sentences split after final punctuation and locate inside the alignment', () => {
  assert.deepEqual(splitSentences('하나예요. 둘이에요! 셋… 넷이에요?'), ['하나예요.', '둘이에요!', '셋…', '넷이에요?']);
  const { alignment } = fakeTake(0.1);
  const located = locateSegments(alignment, SENTENCES);
  assert.equal(located.length, 3);
  assert.deepEqual(located.map(s => s.chars), [6, 7, 7]);
  assert.ok(located[1].start > located[0].end);
  assert.throws(() => locateSegments(alignment, ['오늘은 흐려요.', '내일은 비가 와요.', '모레는 눈이 와요.']), /does not follow/);
  assert.throws(() => locateSegments(alignment, SENTENCES.slice(0, 2)), /more text/);
});

test('a short vendor pause becomes the fixed pause and speech samples are untouched', () => {
  const take = fakeTake(0.05);
  const before = parseWav(take.wav);
  const out = respace(take.wav, take.alignment, SENTENCES, { pause: 0.5, playbackSpeed: 1 });
  const after = parseWav(out.wav);
  assert.equal(out.boundaries.length, 2);
  assert.deepEqual(out.inserted.map(x => x > 0), [true, true]);
  // the second sentence starts exactly pause seconds after the first ends
  assert.ok(Math.abs((out.sentences[1].start - out.sentences[0].end) - 0.5) < 0.002, `${out.sentences[1].start - out.sentences[0].end}`);
  // the new WAV is the old one plus the lead plus the inserted silence
  const expected = before.pcm.length / 2 + Math.round(out.lead * SR) + out.inserted.reduce((a, b) => a + Math.round(b * SR), 0) - Math.round(Math.max(0, take.alignment.character_start_times_seconds[0] - SPACING_DEFAULTS.head) * SR);
  assert.equal(after.pcm.length / 2, expected);
  // the laid-in pause is digital silence, and speech is still there on both sides of it
  const s1 = out.sentences[1];
  const pauseFrom = Math.round((s1.start - 0.30) * SR), pauseTo = Math.round((s1.start - 0.05) * SR);
  assert.equal(rms(after.pcm, pauseFrom, pauseTo), 0);
  assert.ok(rms(after.pcm, Math.round((s1.start + 0.05) * SR), Math.round((s1.start + 0.07) * SR)) > 4000);
  // the shifted alignment points at the same letters in the new timeline
  const first = take.alignment.characters.findIndex(c => c === '내');
  assert.ok(Math.abs(out.alignment.character_start_times_seconds[first] - s1.start) < 0.002);
  // the lead is the fixed 0.14 s, whatever the take started with
  assert.equal(rms(after.pcm, 0, Math.round(0.13 * SR)), 0);
  assert.ok(Math.abs(out.sentences[0].start - SPACING_DEFAULTS.lead) < 0.002);
});

test('the cut never lands on the next sentence\'s first letter, and a no-gap take keeps the last letter whole', () => {
  // natural gap 0.05 s < tail 0.12 s: the cut sits head (0.03 s) before the next letter, so every sample
  // of the next sentence is copied verbatim (no fade-in touches it).
  const take = fakeTake(0.05);
  const before = parseWav(take.wav);
  const out = respace(take.wav, take.alignment, SENTENCES, { pause: 0.5, playbackSpeed: 1 });
  const after = parseWav(out.wav);
  const located = locateSegments(take.alignment, SENTENCES);
  for (const k of [1, 2]) {
    const src = Math.round(located[k].start * SR), dst = Math.round(out.sentences[k].start * SR);
    for (let i = 0; i < Math.round(0.15 * SR); i++) assert.equal(after.pcm.readInt16LE((dst + i) * 2), before.pcm.readInt16LE((src + i) * 2), `sentence ${k + 1} sample ${i} changed`);
  }
  // natural gap 0: the cut is on the last letter, the end time stays before the inserted silence, and the gap reads as the pause
  const tight = fakeTake(0);
  const o2 = respace(tight.wav, tight.alignment, SENTENCES, { pause: 0.5, playbackSpeed: 1 });
  assert.ok(Math.abs((o2.sentences[1].start - o2.sentences[0].end) - 0.5) < 0.002, `${o2.sentences[1].start - o2.sentences[0].end}`);
  const l2 = locateSegments(tight.alignment, SENTENCES);
  assert.ok(Math.abs((o2.sentences[0].end - o2.sentences[0].start) - (l2[0].end - l2[0].start)) < 0.002, 'the first sentence did not grow');
});

test('an acting tag echoed into the alignment is skipped, not read as spoken text', () => {
  const take = fakeTake(0.1);
  const tagged = { characters: [...'[whispers] ', ...take.alignment.characters], character_start_times_seconds: [...Array(11).fill(0), ...take.alignment.character_start_times_seconds], character_end_times_seconds: [...Array(11).fill(0), ...take.alignment.character_end_times_seconds] };
  const located = locateSegments(tagged, SENTENCES);
  assert.equal(located.length, 3);
  assert.equal(located[0].start, take.alignment.character_start_times_seconds[0]);
  const trailing = { characters: [...take.alignment.characters, ...' [sighs]'], character_start_times_seconds: [...take.alignment.character_start_times_seconds, ...Array(8).fill(9)], character_end_times_seconds: [...take.alignment.character_end_times_seconds, ...Array(8).fill(9)] };
  assert.equal(locateSegments(trailing, SENTENCES).length, 3);
});

test('a take that already pauses long enough is left alone between those sentences', () => {
  const take = fakeTake(0.7);
  const out = respace(take.wav, take.alignment, SENTENCES, { pause: 0.5, playbackSpeed: 1 });
  assert.deepEqual(out.inserted, [0, 0]);
  assert.ok(Math.abs((out.sentences[1].start - out.sentences[0].end) - 0.7) < 0.002);
});

test('a playback factor widens only the pause a fast cue needs, and never past the cap', () => {
  const take = fakeTake(0.05, 0.12);
  const located = locateSegments(take.alignment, SENTENCES);
  // 6 letters at 0.12 s = 0.72 s spoken; at 1.2x playback the cue needs 6*1.2/6.0 = 1.2 s → gap 0.48 < pause.
  // The 7-letter sentence (0.84 s) needs 1.4 s → its gap grows to 0.56.
  const gaps = planGaps(located, { pause: 0.5, playbackSpeed: 1.2 });
  assert.equal(gaps[0], 0.5); assert.ok(Math.abs(gaps[1] - 0.56) < 1e-9, `${gaps[1]}`);
  // at 2x a 7-letter sentence needs 7*2/6 = 2.33 s against 0.84 s spoken → gap 1.49, capped at 1.0
  const fast = planGaps(located, { pause: 0.5, playbackSpeed: 2 });
  assert.equal(fast[1], 1.0);
  assert.ok(fast[0] > 0.5 && fast[0] <= 1.0);
});

test('the checked ElevenLabs take is re-spaced before it is hashed, and a retake preserves the episode seed', async t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'spacing-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const work = path.join(dir, '.work'), pcmDir = path.join(work, 'pcm');
  const request = checkedSpeechSchema.parse({ generator: 'tts_elevenlabs_generate', generation: { text: TEXT, voiceId: 'vsc8TcxQ3sXV07imIA0f', model: 'eleven_multilingual_v2', seed: 210836 },
    expectedText: TEXT, episode: {texts:[TEXT],index:0,seed:210836}, segments: SENTENCES, playbackSpeed: 1, language: 'Korean', delivery: 'Calm.', outputPath: pcmDir, filename: 'c0.wav' });
  const prepared = prepareGeneration(request);
  assert.equal(prepared.spacing, true); assert.equal(prepared.seed, 210836); assert.equal(prepared.args.timestamps, true);
  const file = path.join(pcmDir, 'c0.wav');
  const seeds = [];
  const deps = { preflight: async () => {}, measure: async () => ({ duration: 3, rmsDb: -18, clippedFraction: 0 }),
    generate: async (o) => { seeds.push(o?.seed); const take = fakeTake(seeds.length === 1 ? 0.05 : 0.06); writeFileSync(file, take.wav); writeFileSync(path.join(pcmDir, 'c0.alignment.json'), JSON.stringify({ engine: 'elevenlabs', alignment: take.alignment, normalized_alignment: null })); return { success: true, audioPath: file }; },
    listen: async () => ({ transcript: TEXT, review: { accuracy: seeds.length === 1 ? 90 : 100, pronunciation: 98, naturalness: 97, clarity: 99, confidence: 0.98, complete: true, evidence: 'Every word and final syllable is clear, with smooth phrase breaks and no audible artifacts.', issues: [] } }) };
  const result = await generateCheckedSpeech(request, deps);
  assert.equal(result.success, true, JSON.stringify(result));
  assert.deepEqual(seeds, [210836, 210836]);
  const proof = JSON.parse(readFileSync(file + '.quality.json', 'utf8'));
  assert.deepEqual(proof.attempts.map(a => a.seed), [210836, 210836]);
  assert.equal(proof.attempts[1].spacing.boundaries.length, 2);
  assert.equal(proof.attempts[1].spacing.playbackSpeed, 1);
  // the sidecar describes the shipped WAV, and the proof hash is that WAV's
  const side = JSON.parse(readFileSync(sentencesPathFor(file), 'utf8'));
  assert.deepEqual(side.boundaries, proof.attempts[1].spacing.boundaries);
  assert.equal(side.audioSha256, proof.audioSha256);
  assert.equal(result.spacing, 'applied');

  assert.equal(side.sentences.length, 3);
  const align = JSON.parse(readFileSync(path.join(pcmDir, 'c0.alignment.json'), 'utf8'));
  assert.ok(align.vendor_alignment && align.respaced.policy === 'sentence-spacing-v1');
  assert.ok(Math.abs(align.alignment.character_start_times_seconds[0] - SPACING_DEFAULTS.lead) < 0.002);
  const board = path.join(dir, 'storyboard'); mkdirSync(board);
  writeFileSync(path.join(board, 'scenes.js'), `window.SCENES=[{type:'points',narration:${JSON.stringify(SENTENCES.map(tts => ({ tts })))}}];`);
  writeFileSync(path.join(work, 'cards.tsv'), `0\t${file}\t4.5\tin\n`);
  assert.ok(checker.check(work, board)[file]);
  // the builder's snap script agrees with the sidecar against the silences the re-spaced take produces
  const silences = side.boundaries.map(b => `${(b - 0.5).toFixed(3)} ${(b + 0.02).toFixed(3)} 0.520`).join('\n') + '\n1.000 1.300 0.300\n';
  const silFile = path.join(work, 'silin0.txt'); writeFileSync(silFile, silences);
  const snapScript = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../skills/produce/references/snap-boundaries.py');
  const snap = spawnSync('python3', [snapScript, sentencesPathFor(file), silFile, '3', '--wav', file], { encoding: 'utf8' });
  assert.equal(snap.status, 0, snap.stderr);
  assert.deepEqual(snap.stdout.trim().split(' ').map(Number), side.boundaries.map(b => Number((b + 0.02).toFixed(3))));
  // a sidecar left from another take of the same filename is refused, not snapped
  const shipped = readFileSync(file);
  writeFileSync(file, fakeTake(0.3).wav);
  const stale = spawnSync('python3', [snapScript, sentencesPathFor(file), silFile, '3', '--wav', file], { encoding: 'utf8' });
  assert.equal(stale.status, 1); assert.match(stale.stderr, /another take/);
  writeFileSync(file, shipped);
  // a changed pause is a changed take: the old PASS is not reused
  const again = await generateCheckedSpeech(request, deps);
  assert.equal(again.reused, true);
  const wider = await generateCheckedSpeech({ ...request, sentencePause: 0.8 }, deps);
  assert.notEqual(wider.reused, true);
  assert.equal(JSON.parse(readFileSync(sentencesPathFor(file), 'utf8')).pause, 0.8);
});

test('a take without an alignment is kept and the reason recorded, so nothing is lost', async t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'spacing-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const pcmDir = path.join(dir, '.work/pcm');
  const request = checkedSpeechSchema.parse({ generator: 'tts_elevenlabs_generate', generation: { text: TEXT, voiceId: 'vsc8TcxQ3sXV07imIA0f', model: 'eleven_multilingual_v2' },
    expectedText: TEXT, language: 'Korean', delivery: 'Calm.', outputPath: pcmDir, filename: 'c0.wav' });
  const file = path.join(pcmDir, 'c0.wav');
  const deps = { preflight: async () => {}, measure: async () => ({ duration: 3, rmsDb: -18, clippedFraction: 0 }),
    generate: async () => { writeFileSync(file, fakeTake(0.05).wav); return { success: true, audioPath: file }; },
    listen: async () => ({ transcript: TEXT, review: { accuracy: 100, pronunciation: 98, naturalness: 97, clarity: 99, confidence: 0.98, complete: true, evidence: 'Every word and final syllable is clear, with smooth phrase breaks and no audible artifacts.', issues: [] } }) };
  const result = await generateCheckedSpeech(request, deps);
  assert.equal(result.success, true);
  const proof = JSON.parse(readFileSync(file + '.quality.json', 'utf8'));
  assert.match(proof.attempts[0].spacing.skipped, /alignment/);
  assert.equal(existsSync(sentencesPathFor(file)), false);
  assert.equal(checkedSpeechSchema.safeParse({ ...request, segments: ['다른 문장이에요.'] }).success, false);
});
