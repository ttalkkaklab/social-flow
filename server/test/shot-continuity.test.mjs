import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, copyFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readStoryboard } from '../dist/storyboard.js';
import { manageSpeech } from '../dist/speech.js';

const require = createRequire(import.meta.url);
const C = require('../../skills/storyboard/references/shot-continuity.js');
const root = path.resolve(import.meta.dirname, '../..');
const sha = value => createHash('sha256').update(value).digest('hex');
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
const style = { preset: 'photoreal', world: 'An old study.', materials: 'Wood and porcelain.',
  palette: 'Brown and cream.', lighting: 'Daylight.', camera: 'Natural observation.' };

test('legacy missing groups/blocking are visible without becoming execution failures', t => {
  const dir = fixture(t), shots = [shot('s0001'), shot('s0002')];
  for (const s of shots) {
    s.shot.location = { id: 'study', camera: { position: [0, -3, 1.6], target: [0, 0, 1], lensMm: 28 } };
    s.shot.videoDesign.before = '대사와 동작이 시작되기 직전';
  }
  shots[1].visual.camera.framing = 'Reverse view toward the doorway.';
  const win = { SCENES: shots };
  const findings = C.check(win, dir);
  for (const code of ['unspecified_opening_state', 'missing_shared_blocking', 'implicit_continuity',
    'shared_camera_different_framing', 'unspecified_cut_connection']) assert.ok(findings.some(f => f.code === code), code);
  assert.ok(findings.every(f => f.level === 'warn'));
  save(dir, win);
  const result = spawnSync(process.execPath, ['skills/storyboard/references/check-scenes.js', dir, '--draft', '--json'],
    { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.ok(JSON.parse(result.stdout).findings.some(f => f.code === 'missing_shared_blocking'));
});

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

test('source assembler passes the actual endpoint with a state role and drops changed clip evidence', t => {
  const dir = fixture(t), a = shot('s0001'), b = shot('s0002');
  const numeric = { position: [0, -3, 1.6], target: [0, 0, 1], lensMm: 50 };
  // Camera is separate here so no location manifest or render is invented by this fixture.
  const win = { FORMAT: 'shorts-9x16', PRODUCTION: { mode: 'full_video', style }, SCENES: [a, b] };
  a.visual.video.clip = clip(dir); C.capture(win, 0, dir);
  const { assemble } = require('../../skills/storyboard/references/spatial-prompts.js');
  const result = assemble(win, 1, dir);
  const endpoint = path.join(dir, a.visual.video.observedEnd.path);
  assert.ok(result.sourceImageArgs.referenced_image_paths.includes(endpoint));
  assert.match(result.sourcePrompt, /opening instant BEFORE/);
  assert.match(result.sourcePrompt, /captured end of the preceding selected clip/);
  assert.match(result.sourcePrompt, /current shot camera controls the new composition/);
  a.shot.location = { camera: numeric }; b.shot.location = { camera: numeric };
  C.capture(win, 0, dir);
  assert.equal(C.plan(win, 1, dir).suggestedFirstFrame, path.join(dir, a.visual.video.observedEnd.path));
  a.visual.camera.movement = 'dolly in';
  C.capture(win, 0, dir);
  assert.equal(C.plan(win, 1, dir).suggestedFirstFrame, null, 'a moving camera has no inferred unchanged endpoint');
  a.visual.camera.movement = 'static';
  delete a.shot.location; delete b.shot.location;
  C.capture(win, 0, dir);
  ff(['-f', 'lavfi', '-i', 'color=green:size=64x96:rate=24:duration=1', '-c:v', 'libx264', a.visual.video.clip]);
  assert.equal(assemble(win, 1, dir).continuity.observedEnd.status, 'stale');
  assert.deepEqual(assemble(win, 1, dir).sourceImageArgs, {});
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

test('final cut proof exports the actual last/first master frames without aesthetic approval', t => {
  const dir = fixture(t), work = path.join(dir, 'work'); mkdirSync(work);
  const master = clip(dir); copyFileSync(master, path.join(dir, 'reel.mp4'));
  for (let i = 0; i < 2; i++) ff(['-ss', String(i), '-i', master, '-t', '1', '-an', '-c:v', 'libx264', path.join(work, `v${i}.mp4`)]);
  const cards = 'fixture compiled cards'; writeFileSync(path.join(dir, 'cards.resolved.tsv'), cards);
  const shots = [0, 1].map(card => ({ card, transition: 'cut', enter: 'cut', join: 0, handle: 0, in: 0 }));
  writeFileSync(path.join(dir, 'edit-plan.json'), JSON.stringify({ cardsSha256: sha(cards), shots }));
  writeFileSync(path.join(work, 'edit-timeline.tsv'), '0\t0\t24\tcut\t0\t0\t0\n1\t24\t24\tcut\t0\t0\t0\n');
  const result = require('../../skills/produce/references/check-edit-timeline.js').check(dir);
  const pair = result.samples[0].boundaryFrames;
  assert.equal(pair.beforeFrame, 23); assert.equal(pair.afterFrame, 24); assert.equal(pair.review, 'not_reviewed');
  assert.equal(sha(readFileSync(path.join(dir, pair.path))), pair.sha256);
  const pixels = ff(['-i', path.join(dir, pair.path), '-vf', 'scale=2:1', '-frames:v', '1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-']);
  assert.ok(pixels[0] > pixels[2] && pixels[5] > pixels[3], 'left must be outgoing red and right incoming blue');
});
