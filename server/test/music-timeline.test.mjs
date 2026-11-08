import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const refs = path.resolve(import.meta.dirname, '../../skills/produce/references');
const { timelineFindings, compileTimeline, resolveTimeline, renderTimeline } = require(path.join(refs, 'music-timeline.js'));
const shots = [0, 1, 2].map(i => ({ id: `s000${i + 1}`, type: 'points', duration: 99 }));
const rows = shots.map((_, i) => [String(i), String(i * 48), '48']);
const span = { id: 'reaction', cue: 'piano', start: { shotId: 's0001', atSeconds: 1.25 }, end: { shotId: 's0003', atSeconds: 1 } };
const music = extra => ({ piano: { prompt: 'sparse piano' }, $timeline: [{ ...span, ...extra }] });
const ff = args => execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-y', ...args], { maxBuffer: 8 * 1024 * 1024 });
const pcm = file => ff(['-i', file, '-ac', '1', '-f', 'f32le', '-']);
function rms(bytes, start, end) {
  let energy = 0;
  for (let i = Math.round(start * 48000); i < Math.round(end * 48000); i++) energy += bytes.readFloatLE(i * 4) ** 2;
  return Math.sqrt(energy / Math.round((end - start) * 48000));
}

test('anchors follow stable ids and actual frame counts; invalid plans do not resolve', () => {
  const plan = compileTimeline(music(), shots, () => '/cue.wav');
  assert.equal(resolveTimeline(plan, rows, 24, 6)[0].startSeconds, 1.25);
  assert.equal(resolveTimeline(plan, rows, 24, 6)[0].endSeconds, 5);
  const reordered = [shots[2], shots[1], shots[0]];
  const reverse = compileTimeline(music(), reordered, () => '/cue.wav');
  assert.throws(() => resolveTimeline(reverse, rows, 24, 6), /Invalid span/);
  assert.throws(() => resolveTimeline(plan, rows.slice(0, 2), 24, 4), /missing/);
  assert.throws(() => resolveTimeline(plan, rows, 24, 7), /differs/);
  const badOffsets = compileTimeline(music({ start: { shotId: 's0001', atSeconds: 3 } }), shots, () => '/cue.wav');
  assert.throws(() => resolveTimeline(badOffsets, rows, 24, 6), /actual rendered duration/);
  const overlongGain = compileTimeline(music({ gain: [{ atSeconds: 0, gainDb: 0 }, { atSeconds: 5, gainDb: 1 }] }), shots, () => '/cue.wav');
  assert.throws(() => resolveTimeline(overlongGain, rows, 24, 6), /inside the shot/);
  for (const invalid of [null, {}, [null], [{ ...span, cue: '$mix' }], [{ ...span, id: '../bad' }], [{ ...span, start: { shotId: 'missing', atSeconds: 0 } }], [{ ...span, fadeOutSeconds: -1 }], [{ ...span, gain: [] }]])
    assert.ok(timelineFindings({ ...music(), $timeline: invalid }, shots).length, JSON.stringify(invalid));
  assert.ok(timelineFindings(music(), [{ ...shots[0], sound: { cue: 'piano' } }, ...shots.slice(1)]).length);
  assert.deepEqual(timelineFindings({ $timeline: [] }, shots), []);
});

test('real bed starts at source time zero inside a shot and keeps phase and gain across cuts', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'music-clock-'));
  try {
    const source = path.join(dir, 'cue.wav'), output = path.join(dir, 'bed.wav');
    ff(['-f', 'lavfi', '-i', 'sine=frequency=437.3:duration=8:sample_rate=48000', '-ac', '2', source]);
    const gain = [{ atSeconds: 0, gainDb: -12 }, { atSeconds: 3.75, gainDb: 0 }];
    const plan = compileTimeline(music({ gain, fadeOutSeconds: 0.2 }), shots, () => source);
    renderTimeline(plan, rows, 24, 6, -30, output);
    const result = pcm(output), original = pcm(source);
    assert.equal(result.length, 6 * 48000 * 4);
    assert.equal(rms(result, 0, 1.25), 0, 'no default bed before the anchor');
    assert.equal(rms(result, 5, 6), 0, 'music ends independently of the final shot');
    assert.ok(rms(result, 1.3, 1.5) > 0.001);
    assert.ok(rms(result, 4.4, 4.6) > rms(result, 2.1, 2.3) * 1.8, 'one envelope grows through every cut');
    // A restarted source or reset gain at either cut breaks this sample-level reference.
    for (const at of [1.8, 2.03, 3.9, 4.03, 4.6]) {
      const sourceAt = Math.round((at - 1.25) * 48000), outputAt = sourceAt + 60000;
      let xx = 0, yy = 0, xy = 0;
      for (let i = 0; i < 960; i++) {
        const x = original.readFloatLE((sourceAt + i) * 4), y = result.readFloatLE((outputAt + i) * 4);
        xx += x * x; yy += y * y; xy += x * y;
      }
      assert.ok(xy / Math.sqrt(xx * yy) > 0.9999, `continuous source phase at ${at}s`);
    }
    renderTimeline({ version: 1, shots: plan.shots, spans: [] }, rows, 24, 6, -30, output);
    assert.equal(rms(pcm(output), 0, 6), 0, '[] supports dialogue/ambience with no music file');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('compiler owns timeline manifests, validates before writes and removes them on return to legacy', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'music-compile-'));
  try {
    const work = path.join(dir, 'work'), board = path.join(dir, 'scenes.js'); mkdirSync(work);
    writeFileSync(path.join(work, 'bgm-piano.wav'), 'asset');
    const save = value => writeFileSync(board, `window.MUSIC=${JSON.stringify(value)};window.SCENES=${JSON.stringify(shots)};`);
    const run = () => spawnSync(process.execPath, [path.join(refs, 'compile-sound-plan.js'), board, work, dir], { encoding: 'utf8' });
    save(music()); assert.equal(run().status, 0);
    const manifest = readFileSync(path.join(work, 'music-timeline.json'), 'utf8');
    save({ ...music(), $timeline: [{ ...span, cue: 'unknown' }] }); assert.notEqual(run().status, 0);
    assert.equal(readFileSync(path.join(work, 'music-timeline.json'), 'utf8'), manifest);
    save({ $timeline: [] }); assert.equal(run().status, 0);
    assert.deepEqual(JSON.parse(readFileSync(path.join(work, 'music-timeline.json'), 'utf8')).spans, []);
    // Human edits must be preserved, but an orphan is not an active timeline.
    writeFileSync(path.join(work, 'music-timeline.json'), readFileSync(path.join(work, 'music-timeline.json'), 'utf8') + '\n');
    save({}); const edited = run(); assert.equal(edited.status, 0);
    assert.match(edited.stderr, /keeping the human-edited file/);
    const builder = readFileSync(path.join(refs, 'build-reel.sh'), 'utf8');
    const selection = builder.split('\n').find(line => line.startsWith('MUSIC_TIMELINE=$('));
    const selected = spawnSync('bash', ['-c', selection + '\nprintf "%s" "$MUSIC_TIMELINE"'], { cwd: work, encoding: 'utf8' });
    assert.equal(selected.status, 0); assert.equal(selected.stdout, '0');
    save({ $timeline: [] }); assert.equal(run().status, 0);
    save({}); const result = run(); assert.equal(result.status, 0);
    assert.ok(JSON.parse(result.stdout).removed.includes('music-timeline.json'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('full builder adds timeline music after editing without requiring a default bed', { timeout: 60000 }, () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'music-assembly-'));
  try {
    const work = path.join(dir, 'work'), board = path.join(dir, 'storyboard');
    mkdirSync(work); mkdirSync(board);
    const source = path.join(work, 'source.mp4');
    ff(['-f', 'lavfi', '-i', 'testsrc2=size=128x224:rate=24:duration=2', '-f', 'lavfi', '-i',
      'sine=frequency=210:duration=2:sample_rate=48000', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', source]);
    ff(['-f', 'lavfi', '-i', 'sine=frequency=437.3:duration=8:sample_rate=48000', '-ac', '2', path.join(work, 'bgm-piano.wav')]);
    const cards = shots.map(shot => ({ ...shot, duration: 2, narration: [], visual: { clip: source }, sound: { audioSource: 'video' } }));
    const save = timeline => writeFileSync(path.join(board, 'scenes.js'),
      `window.SCENES=${JSON.stringify(cards)};window.MUSIC=${JSON.stringify({ ...music(), $timeline: timeline, $mix: { ducking: { mix: 0 } } })};`);
    writeFileSync(path.join(work, 'cards.tsv'), cards.map((_, i) => `${i}\tbgm-piano.wav\t1\tnone`).join('\n') + '\n');
    writeFileSync(path.join(work, 'segs.tsv'), cards.map((_, i) => `${i}\t0\t${source}\t\t`).join('\n') + '\n');
    writeFileSync(path.join(work, 'music-gain.tsv'), '1\t[{"atSeconds":0,"gainDb":-60}]\n');
    const run = () => spawnSync('bash', [path.join(refs, 'build-reel.sh'), work, board], {
      encoding: 'utf8', timeout: 45000, maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, W: '128', H: '224', FPS: '24', OUTRO: '0', COVER_TS: '1' },
    });
    save([span]);
    let result = run(); assert.equal(result.status, 0, result.stdout + result.stderr);
    const rendered = JSON.parse(readFileSync(path.join(work, 'work/music-timeline-resolved.json'), 'utf8'));
    assert.equal(rendered.spans[0].startSeconds, 1.25);
    assert.equal(rendered.spans[0].endSeconds, 5);
    const bed = pcm(path.join(work, 'work/bed.wav'));
    assert.equal(rms(bed, 0, 1.25), 0); assert.ok(rms(bed, 2, 4) > 0.001); assert.equal(rms(bed, 5, 6), 0);
    const ducked = pcm(path.join(work, 'work/bed-ducked.wav'));
    assert.ok(rms(ducked, 2.1, 2.5) > rms(ducked, 4.1, 4.5) * 0.9, 'stale markerless shot gain must not override a timeline span');
    assert.ok(rms(pcm(path.join(work, 'reel.mp4')), 0.2, 0.8) > 0.01, 'native scene audio survives the music-free opening');
    save([]); result = run(); assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(rms(pcm(path.join(work, 'work/bed.wav')), 0, 6), 0);
    assert.ok(rms(pcm(path.join(work, 'reel.mp4')), 0.2, 0.8) > 0.01, 'no score does not turn the film silent');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
