import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, cpSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { readStoryboard } from '../dist/storyboard.js';
import { manageSpeech } from '../dist/speech.js';

const require = createRequire(import.meta.url);
const C = require('../../skills/storyboard/references/shot-continuity.js');
const root = path.resolve(import.meta.dirname, '../..');
const ff = args => execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-y', ...args], { timeout: 30000 });
const shot = id => ({ id, type: 'points', scene: 1, duration: .5, narration: [], transition: 'cut',
  shot: { render: { mode: 'generated_video' }, videoDesign: {
    look: 'realistic', before: 'The woman holds the tray just above the desk.',
    action: 'The woman puts down the tray.', after: 'The tray rests on the desk; both hands are free.',
    continuity: 'The desk and telephone keep their positions.',
    motion: { kind: 'subject_action', subject: 'The woman', visibleChange: 'The tray contacts the desk.',
      beats: [{ at: 0, state: 'The tray is above the desk.' }, { at: .5, state: 'The tray rests on the desk; both hands are free.' }] }
  } }, visual: { bg: 'start.png', character: ['woman'], camera: {
    framing: 'Medium side view of the desk.', movement: 'static', speed: '', end: 'The tray on the desk.'
  }, video: { engine: 'astra' } } });
function fixture(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'shot-continuity-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function save(dir, win, header = '') {
  writeFileSync(path.join(dir, 'scenes.js'), header + Object.entries(win)
    .map(([key, value]) => `window.${key}=${JSON.stringify(value)};`).join('\n'));
}
function clip(dir) {
  const file = path.join(dir, 'clip.mp4');
  ff(['-f', 'lavfi', '-i', 'color=red:size=64x96:rate=24:duration=1', '-f', 'lavfi', '-i',
    'color=blue:size=64x96:rate=24:duration=1', '-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', file]);
  return file;
}

test('playback inserts, explicit scene/place changes and intentional breaks retain their boundaries', () => {
  const a = shot('s0001'), b = shot('s0002'), insert = { id: 's0003', type: 'broll', after: 0 };
  let win = { SCENES: [a, b, insert] };
  assert.deepEqual(C.connections(win).map(p => p.index), [0, 2, 1]);
  assert.equal(C.plan(win, 1).previous, null);
  win = { SCENES: [a, b] };
  b.scene = 2;
  assert.equal(C.plan(win, 1).previous, null);
  b.scene = 1; a.shot.location = { id: 'study' }; b.shot.location = { id: 'police-office' };
  assert.equal(C.plan(win, 1).previous, null);
  a.shot.location.continuityGroup = b.shot.location.continuityGroup = 'phone-call';
  b.shot.location.continuityBreak = 'Later that day.';
  assert.equal(C.plan(win, 1).previous, null);
});

test('explicit groups continue across an intercut but do not turn planned end art into observed footage', () => {
  const a = shot('s0001'), unrelated = shot('s0002'), b = shot('s0003');
  a.shot.location = b.shot.location = { continuityGroup: 'study' };
  unrelated.scene = 2;
  a.visual.frames = { mode: 'first_last', end: 'planned-ending.png', endState: 'A completed gesture.' };
  const p = C.plan({ SCENES: [a, unrelated, b] }, 2);
  assert.equal(p.previous.shotId, 's0001');
  assert.equal(p.scope, 'explicit_group');
  assert.equal(p.observedEnd.status, 'missing');
  assert.deepEqual(p.referenceImages, []);
});

test('capture selects the trimmed endpoint rather than the file tail, and invalidates changed inputs', t => {
  const dir = fixture(t), a = shot('s0001'), win = { SCENES: [a, shot('s0002')] };
  a.visual.video.clip = clip(dir); a.edit = { in: .25 }; a.duration = .5;
  const record = C.capture(win, 0, dir);
  assert.equal(record.frame, 17); assert.equal(record.sourceTime, 17 / 24);
  const rgb = ff(['-i', path.join(dir, record.path), '-vf', 'scale=1:1', '-frames:v', '1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-']);
  assert.ok(rgb[0] > 200 && rgb[2] < 20, 'selected endpoint must be red; unused tail is blue');
  assert.equal(C.plan(win, 1, dir).observedEnd.status, 'captured_not_reviewed');
  for (const change of [() => { a.edit.in = .5; }, () => { a.duration = .75; },
    () => { a.visual.camera.framing = 'New crop'; }]) {
    const old = structuredClone(a); change();
    assert.equal(C.observed(a, dir).status, 'stale');
    assert.deepEqual(C.plan(win, 1, dir).referenceImages, []);
    Object.keys(a).forEach(key => delete a[key]); Object.assign(a, old);
  }
  writeFileSync(path.join(dir, record.path), 'replaced image');
  assert.equal(C.observed(a, dir).status, 'stale');
  assert.ok(C.check(win, dir).some(f => f.code === 'stale_observed_end'));
});

test('capture CLI preserves board globals/header and MCP reads/speech plans expose the same connection', t => {
  const dir = fixture(t), a = shot('s0001'); a.visual.video.clip = clip(dir);
  const win = { STORY: { version: 'story-v2' }, SB_DOC: { characters: [] }, CUSTOM: { untouched: true },
    SCENES: [a, shot('s0002')] };
  save(dir, win, '// authored fixture\n');
  execFileSync(process.execPath, ['skills/storyboard/references/shot-continuity.js', dir, '--shot', '1', '--capture', '--apply'],
    { cwd: root, encoding: 'utf8' });
  assert.match(readFileSync(path.join(dir, 'scenes.js'), 'utf8'), /^\/\/ authored fixture/);
  const board = readStoryboard({ path: dir, level: 'full', includeContext: true, shotId: 's0002' });
  assert.equal(board.reviewContext.document.characters.length, 0);
  assert.equal(board.selectedShot.continuity.observedEnd.status, 'captured_not_reviewed');
  const speech = manageSpeech({ path: dir, action: 'plan_video', shotId: 's0002', capabilities: {
    provider: 'astra', model: 'astra', audioConditioning: true, lipSync: true, postLipSync: false, evidence: 'Fixture only.'
  } });
  assert.equal(speech.plan.continuity.previous.shotId, 's0001');
  assert.equal(speech.plan.continuity.observedEnd.review, 'not_reviewed');
  assert.match(readFileSync(path.join(dir, 'scenes.js'), 'utf8'), /"untouched": true/);
});

test('capture refuses unusable selections and grouped footage without inventing an endpoint', t => {
  const dir = fixture(t), s = shot('s0001'), win = { SCENES: [s] };
  s.visual.video.clip = clip(dir);
  for (const duration of [NaN, -1, 3]) {
    s.duration = duration;
    assert.throws(() => C.capture(win, 0, dir), /finite|available source frames/);
  }
  s.edit = { in: .01 }; s.duration = .001;
  assert.throws(() => C.capture(win, 0, dir), /available source frames/, 'a sub-frame selection must not capture outside its interval');
  delete s.edit;
  s.duration = .5; s.visual.video.groupPlan = {};
  assert.throws(() => C.capture(win, 0, dir), /one generated clip/);
  assert.equal(s.visual.video.observedEnd, undefined);
});
test('installed capture and ASTRA planning run without node_modules', t => {
  const dir = fixture(t), install = path.join(dir, 'install'), board = path.join(dir, 'board');
  mkdirSync(board);
  for (const name of ['skills/_shared', 'skills/storyboard/references', 'skills/produce/references'])
    cpSync(path.join(root, name), path.join(install, name), { recursive: true });
  mkdirSync(path.join(install, 'server/dist'), { recursive: true });
  copyFileSync(path.join(root, 'server/dist/astra-shot-runtime.bundle.js'), path.join(install, 'server/dist/astra-shot-runtime.bundle.js'));
  writeFileSync(path.join(install, 'server/package.json'), '{"type":"module"}');
  const a = shot('s0001'); a.visual.video.clip = clip(dir);
  save(board, { STORY: { version: 'story-v2' }, SB_DOC: { characters: [] }, SCENES: [a] });
  execFileSync(process.execPath, [path.join(install, 'skills/storyboard/references/shot-continuity.js'), board,
    '--shot', '1', '--capture', '--apply'], { encoding: 'utf8' });
  const saved = require('../../skills/_shared/scenes-vm.js').evaluateWindowScript(readFileSync(path.join(board, 'scenes.js'), 'utf8'));
  assert.equal(saved.SCENES[0].visual.video.observedEnd.frame, 11);
  const planned = spawnSync(process.execPath, [path.join(install, 'skills/produce/references/prepare-astra-shot.js'),
    board, '--shot', 's0001'], { encoding: 'utf8' });
  assert.doesNotMatch(planned.stderr, /ERR_MODULE_NOT_FOUND|Cannot find package/);
  assert.match(planned.stderr, /ENOENT/, 'missing authored image is an input error, not an install failure');
});
