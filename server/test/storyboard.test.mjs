/**
 * Storyboard tools — the sequence → scene → shot schemas, the in-memory patch, the file
 * round trip, and the check runner over check-scenes.js. No API is called; every board
 * lives in a temp directory.
 */

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

import {
  CHECK_SCENES_FILE,
  CONTRACT_FILE,
  STRUCTURE_VERSION,
  applyPatch,
  applyStoryboard,
  checkScenario,
  checkStoryboard,
  contract,
  readBoard,
  readStoryboard,
  sceneSchema,
  scenarioCheckSchema,
  serializeBoard,
  shotSchema,
  storyboardApplySchema,
  storyboardReadSchema,
  structureSchema,
  writeShotCharacters,
  writeShotDialogue,
  writeShotIcons,
  writeShotPrompt,
  shotImageRequest,
  recordShotImage,
  writeStoryScenes,
  writeStorySequences,
  writeStoryShots,
} from '../dist/storyboard.js';
import { TOOLS } from '../dist/tools.js';
import { ROUTES } from '../dist/handlers.js';
import editPlan from '../../skills/produce/references/edit-plan.js';
import { setupProject, png } from './workflow-fixture.mjs';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
const settings = createRequire(import.meta.url)('../../skills/_shared/model-settings.js');

const dirs = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'sb-')); dirs.push(d); return d; };
after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

const scene = (no, extra = {}) => ({ no, place: '작업실', time: '낮', event: '한 사건이 벌어진다', charge: { open: '-', close: '+' }, turn: '모르던 것을 알게 된다', ...extra });
const structure = (scenes, sequences) => ({
  version: STRUCTURE_VERSION, scenes,
  sequences: sequences || [{ id: 'q1', title: '한 대목', purpose: '한 목적', scenes: scenes.map((s) => s.no) }],
});
const shot = (type, beat, no, extra = {}) => ({
  type, beat, duration: 6, scene: no, transition: 'jcut',
  shot: { feel: '궁금함', size: 'mcu', angle: 'eye', info: '새 정보 ' + Math.random().toString(36).slice(2, 6), infoType: 'other' },
  narration: [{ tts: '가', sub: '가' }], visual: {}, ...extra,
});
const board = () => [
  shot('cover', 'hook', 1, { hookType: 'curiosity', hookForm: 'gap', transition: undefined }),
  shot('points', 'drip', 1, { shot: { feel: '놀람', size: 'ls', angle: 'eye', info: '다른 정보', infoType: 'other' } }),
  shot('points', 'drip', 2),
  shot('points', 'cta', 2, { shot: { feel: '안심', size: 'ls', angle: 'eye', info: '마지막 정보', infoType: 'other', share: '하루 한 번이면 충분해요', shareType: 'line' } }),
];
const comprehension = { mode: 'informational', question: '무엇이 달라졌나요?', answer: '한 가지가 달라졌어요.', takeaway: '한 가지만 기억하면 돼요.', branches: [], terms: [] };

describe('storyboard schemas', () => {
  it('scene creative fields are optional; typed identity and unknown keys stay checked', () => {
    assert.ok(sceneSchema.safeParse(scene(1)).success);
    assert.ok(sceneSchema.safeParse({ ...scene(1), place: '' }).success);
    assert.ok(!sceneSchema.safeParse({ ...scene(1), mood: 'x' }).success, 'a typo key is refused');
  });
  it('shot adapter values stay typed while creative vocabulary passes through', () => {
    assert.ok(shotSchema.safeParse(board()[1]).success);
    assert.ok(shotSchema.safeParse({ ...board()[1], id: 's0007' }).success);
    assert.ok(!shotSchema.safeParse({ ...board()[1], id: 's007' }).success);
    assert.ok(shotSchema.safeParse({ ...board()[1], shot: { size: 'wide' } }).success);
    assert.ok(!shotSchema.safeParse({ ...board()[1], transition: 'push:left' }).success);
    const extra = shotSchema.safeParse({ ...board()[1], visual: { video: { engine: 'veo' } }, edit: { reason: 'x' } });
    assert.ok(extra.success && extra.data.edit.reason === 'x');
  });
  it('the vocabularies come from structure-contract.js, the file check-scenes.js pins', () => {
    assert.ok(existsSync(CONTRACT_FILE));
    assert.ok(existsSync(CHECK_SCENES_FILE));
    assert.equal(structureSchema.safeParse(structure([scene(1)])).success, true);
    assert.deepEqual(contract().VOCAB.SIZES.slice(0, 3), ['els', 'ls', 'ws']);
  });
});

describe('applyPatch', () => {
  it('patches only the incoming effect, clears stale duration and preserves source objects', () => {
    const shots = board();
    shots[2].edit = { transitionSeconds: .4, in: .2, post: .12, continuity: 'Same subject' };
    const win = { STRUCTURE: structure([scene(1), scene(2)]), SCENES: shots };
    const patch = storyboardApplySchema.parse({ path: 'x', transitions: [{ no: 3, transition: 'dip', reason: 'Night begins' }] });
    const r = applyPatch(win, patch);
    assert.equal(r.findings.filter(f => f.level === 'bad').length, 0);
    assert.equal(r.win.SCENES[2].transition, 'dip');
    assert.deepEqual(r.win.SCENES[2].edit, { in: .2, post: .12, continuity: 'Same subject', reason: 'Night begins' });
    assert.deepEqual(r.win.SCENES[2].visual, shots[2].visual);
    assert.deepEqual(r.win.SCENES[2].narration, shots[2].narration);
    assert.equal(shots[2].transition, 'jcut');
    assert.equal(shots[2].edit.transitionSeconds, .4);
    const compiled = editPlan.compile(r.win.SCENES, r.win.SCENES.map((_, i) => `${i}\tvoice.wav\t0\tnone`).join('\n'));
    assert.equal(compiled.plan[1].exit, 'black');
    assert.equal(compiled.plan[2].enter, 'black');
    assert.equal(compiled.plan[2].join, 0);

  });
  it('refuses moving joins across reused, inserted and sync footage before saving', () => {
    const parse = transition => storyboardApplySchema.parse({ path: 'x', transitions: [{ no: 3, transition, reason: 'Scene changes' }] });
    for (const fixture of ['reuse', 'broll', 'syncBefore', 'syncAfter']) {
      const shots = board().map(s => ({ ...s, transition: 'cut' }));
      if (fixture === 'reuse') shots[1].visual = { reuse: { clip: 'old.mp4' } };
      if (fixture === 'broll') shots[1].type = 'broll';
      if (fixture === 'syncBefore') shots[1].visual = { sync: true };
      if (fixture === 'syncAfter') shots[2].visual = { sync: true };
      const win = { STRUCTURE: structure([scene(1), scene(2)]), SCENES: shots };
      assert.throws(() => applyPatch(win, parse('dissolve')), /carry|handles/, fixture);
      assert.equal(shots[2].transition, 'cut', 'a rejected patch leaves the source intact');
      if (fixture !== 'broll') {
        const result = applyPatch(win, parse('dip'));
        assert.equal(result.win.SCENES[2].transition, 'dip');
        const plan = editPlan.preview(result.win.SCENES);
        assert.equal(plan[1].exit, 'black');
        assert.equal(plan[2].enter, 'black');
      }
    }
  });
  it('rejects ambiguous or invalid transition patches', () => {
    const parse = transitions => storyboardApplySchema.parse({ path: 'x', transitions });
    assert.throws(() => parse([{ no: 2, transition: 'dip', reason: 'Night', transitionSeconds: .4 }]));
    assert.throws(() => parse([{ no: 2, transition: 'fade', reason: 'Night' }]));
    const win = { STRUCTURE: structure([scene(1), scene(2)]), SCENES: board() };
    assert.throws(() => applyPatch(win, parse([{ no: 99, transition: 'dip', reason: 'Night' }])));
    assert.throws(() => applyPatch(win, parse([{ no: 1, transition: 'dissolve', reason: 'Night' }])));
    const change = { no: 3, transition: 'dip', reason: 'Night' };
    assert.throws(() => applyPatch(win, parse([change, change])));
    const schema = TOOLS.find(t => t.name === 'storyboard_apply').inputSchema.properties.transitions;
    assert.ok(schema.items.properties.transition.enum.includes('dip'));
  });

  it('a full set validates, syncs the shot labels and reports no violation', () => {
    const r = applyPatch({}, storyboardApplySchema.parse({ path: 'x', set: { structure: structure([scene(1, { summary: '둘이 처음 만난다.' }), scene(2, { place: '부엌', time: '밤' })]), shots: board() } }));
    assert.deepEqual(r.findings.filter((f) => f.level === 'bad'), []);
    assert.equal(r.win.STRUCTURE.scenes[0].summary, '둘이 처음 만난다.');
    assert.equal(r.synced, 4);
    assert.equal(r.win.SCENES[2].sceneSlug, '부엌 / 밤');
    assert.equal(r.win.SCENES[2].sequence, undefined, 'one sequence writes no shot label');
  });
  it('assigns stable ids to every shot in a full set', () => {
    const r = applyPatch({}, storyboardApplySchema.parse({ path: 'x', set: { structure: structure([scene(1), scene(2)]), shots: board() } }));
    assert.deepEqual(r.win.SCENES.map((s) => s.id), ['s0001', 's0002', 's0003', 's0004']);
    assert.equal(r.win.STRUCTURE.nextShotId, 5);
  });
  it('backfills a legacy board once from its current shot count', () => {
    const legacy = { STRUCTURE: structure([scene(1), scene(2)]), SCENES: board() };
    const r = applyPatch(legacy, storyboardApplySchema.parse({ path: 'x', globals: { FORMAT: 'shorts-9x16' } }));
    assert.deepEqual(r.win.SCENES.map((s) => s.id), ['s0005', 's0006', 's0007', 's0008']);
    assert.equal(r.win.STRUCTURE.nextShotId, 9);
    const again = applyPatch(r.win, storyboardApplySchema.parse({ path: 'x', globals: { FORMAT: 'shorts-9x16' } }));
    assert.deepEqual(again.win.SCENES.map((s) => s.id), ['s0005', 's0006', 's0007', 's0008']);
    assert.equal(again.win.STRUCTURE.nextShotId, 9);
  });
  it('positional upsert without id inherits the id at that position', () => {
    const base = applyPatch({}, storyboardApplySchema.parse({ path: 'x', set: { structure: structure([scene(1), scene(2)]), shots: board() } })).win;
    const changed = applyPatch(base, storyboardApplySchema.parse({ path: 'x', shots: [{ no: 2, shot: board()[1] }] }));
    assert.equal(changed.win.SCENES[1].id, 's0002');
    assert.equal(changed.win.STRUCTURE.nextShotId, 5);
  });
  it('positional upsert with an explicit different id replaces the id', () => {
    const base = applyPatch({}, storyboardApplySchema.parse({ path: 'x', set: { structure: structure([scene(1), scene(2)]), shots: board() } })).win;
    const changed = applyPatch(base, storyboardApplySchema.parse({ path: 'x', shots: [{ no: 2, shot: { ...board()[1], id: 's0042' } }] }));
    assert.equal(changed.win.SCENES[1].id, 's0042');
    assert.equal(changed.win.STRUCTURE.nextShotId, 43);
  });
  it('shotsById replaces a shot by its id and keeps the id; an unknown id or a renamed id writes nothing (R7)', () => {
    const base = applyPatch({}, storyboardApplySchema.parse({ path: 'x', set: { structure: structure([scene(1), scene(2)]), shots: board() } })).win;
    const edited = applyPatch(base, storyboardApplySchema.parse({ path: 'x', shotsById: [{ id: 's0002', shot: { ...board()[1], title: 'edited by id' } }] }));
    assert.deepEqual(edited.win.SCENES.map((s) => s.id), ['s0001', 's0002', 's0003', 's0004']);
    assert.equal(edited.win.SCENES[1].title, 'edited by id');
    assert.equal(edited.win.STRUCTURE.nextShotId, 5, 'no id was spent');
    assert.throws(() => applyPatch(base, storyboardApplySchema.parse({ path: 'x', shotsById: [{ id: 's0099', shot: board()[1] }] })), /no shot with id s0099/);
    assert.throws(() => applyPatch(base, storyboardApplySchema.parse({ path: 'x', shotsById: [{ id: 's0002', shot: { ...board()[1], id: 's0003' } }] })), /not renamed through an upsert/);
    assert.throws(() => storyboardApplySchema.parse({ path: 'x', shotsById: [{ id: 'shot-2', shot: board()[1] }] }));
  });
  it('afterId inserts after that shot and removeShotIds drops by id — positions may shift, ids do not (R7)', () => {
    const base = applyPatch({}, storyboardApplySchema.parse({ path: 'x', set: { structure: structure([scene(1), scene(2)]), shots: board() } })).win;
    const r = applyPatch(base, storyboardApplySchema.parse({ path: 'x', removeShotIds: ['s0001'], insertShots: [{ afterId: 's0003', shots: [board()[0]] }] }));
    assert.deepEqual(r.win.SCENES.map((s) => s.id), ['s0002', 's0003', 's0005', 's0004']);
    assert.throws(() => applyPatch(base, storyboardApplySchema.parse({ path: 'x', removeShotIds: ['s0042'] })), /removeShotIds: no shot with id s0042/);
    assert.throws(() => applyPatch(base, storyboardApplySchema.parse({ path: 'x', insertShots: [{ afterId: 's0042', shots: [board()[0]] }] })), /insertShots.afterId: no shot with id s0042/);
    // an insert entry names exactly one anchor
    assert.throws(() => storyboardApplySchema.parse({ path: 'x', insertShots: [{ after: 1, afterId: 's0001', shots: [board()[0]] }] }), /exactly one of after/);
    assert.throws(() => storyboardApplySchema.parse({ path: 'x', insertShots: [{ shots: [board()[0]] }] }), /exactly one of after/);
  });
  it('a patch addresses shots by position or by id, never both (R7)', () => {
    const base = applyPatch({}, storyboardApplySchema.parse({ path: 'x', set: { structure: structure([scene(1), scene(2)]), shots: board() } })).win;
    assert.throws(() => applyPatch(base, storyboardApplySchema.parse({ path: 'x', shots: [{ no: 1, shot: board()[0] }], removeShotIds: ['s0002'] })), /not both/);
    assert.throws(() => applyPatch(base, storyboardApplySchema.parse({ path: 'x', removeShots: [1], insertShots: [{ afterId: 's0002', shots: [board()[0]] }] })), /not both/);
    const ok = applyPatch(base, storyboardApplySchema.parse({ path: 'x', shotsById: [{ id: 's0001', shot: board()[0] }], transitions: undefined }));
    assert.equal(ok.win.SCENES[0].id, 's0001');
  });
  it('assigns ids to inserts and never reuses a deleted number', () => {
    const base = applyPatch({}, storyboardApplySchema.parse({ path: 'x', set: { structure: structure([scene(1), scene(2)]), shots: board() } })).win;
    const inserted = applyPatch(base, storyboardApplySchema.parse({ path: 'x', insertShots: [{ after: 0, shots: [board()[0]] }] }));
    assert.equal(inserted.win.SCENES[0].id, 's0005');
    const removed = applyPatch(inserted.win, storyboardApplySchema.parse({ path: 'x', removeShots: [1] }));
    const insertedAgain = applyPatch(removed.win, storyboardApplySchema.parse({ path: 'x', insertShots: [{ after: 0, shots: [board()[0]] }] }));
    assert.equal(insertedAgain.win.SCENES[0].id, 's0006');
    assert.equal(insertedAgain.win.STRUCTURE.nextShotId, 7);
  });
  it('preserves duplicate ids and reports one finding for the repeated shot', () => {
    const shots = board().map((s, i) => ({ ...s, id: `s${String(i + 1).padStart(4, '0')}` }));
    shots[2].id = 's0002';
    const r = applyPatch({}, storyboardApplySchema.parse({ path: 'x', set: { structure: structure([scene(1), scene(2)]), shots } }));
    const duplicates = r.findings.filter((f) => /duplicate s0002/.test(f.what));
    assert.equal(duplicates.length, 1);
    assert.equal(r.win.SCENES[2].id, 's0002');
  });
  it('a violation in the structure comes back as findings, one per issue', () => {
    const r = applyPatch({}, storyboardApplySchema.parse({ path: 'x', set: { structure: structure([scene(1)]), shots: board() } }));
    assert.ok(r.findings.some((f) => f.level === 'bad' && /scene reference does not exist/.test(f.what)));
  });
  it('upserts by key and removes by key', () => {
    const base = applyPatch({}, storyboardApplySchema.parse({ path: 'x', set: { structure: structure([scene(1), scene(2)]), shots: board() } })).win;
    const r = applyPatch(base, storyboardApplySchema.parse({
      path: 'x',
      scenes: [scene(2, { place: '옥상', time: '새벽' })],
      sequences: [{ id: 'q1', title: '앞', purpose: 'p', scenes: [1] }, { id: 'q2', title: '뒤', purpose: 'p2', question: '왜?', payoff: 2, scenes: [2] }],
    }));
    assert.deepEqual(r.findings.filter((f) => f.level === 'bad'), []);
    assert.equal(r.win.STRUCTURE.sequences.length, 2);
    assert.equal(r.win.SCENES[3].sceneSlug, '옥상 / 새벽');
    assert.equal(r.win.SCENES[3].sequence, '뒤');
    const gone = applyPatch(r.win, storyboardApplySchema.parse({ path: 'x', removeScenes: [2], removeSequences: ['q2'], removeShots: [3, 4] }));
    assert.equal(gone.win.SCENES.length, 2);
    assert.deepEqual(gone.win.STRUCTURE.scenes.map((s) => s.no), [1]);
    assert.deepEqual(gone.findings.filter((f) => f.level === 'bad'), []);
  });
  it('insertShots and positional upsert keep the playback order', () => {
    const base = applyPatch({}, storyboardApplySchema.parse({ path: 'x', set: { structure: structure([scene(1), scene(2)]), shots: board() } })).win;
    const added = shot('points', 'drip', 1, { shot: { feel: '의심', size: 'cu', angle: 'eye', info: '끼운 정보', infoType: 'other' } });
    const r = applyPatch(base, storyboardApplySchema.parse({ path: 'x', insertShots: [{ after: 2, shots: [added] }], shots: [{ no: 5, shot: shot('points', 'drip', 2, { shot: { feel: '기대', size: 'cu', angle: 'eye', info: '덧붙인 정보', infoType: 'other' } }) }] }));
    assert.equal(r.win.SCENES.length, 6);
    assert.equal(r.win.SCENES[2].shot.info, '끼운 정보');
    assert.throws(() => applyPatch(base, storyboardApplySchema.parse({ path: 'x', shots: [{ no: 9, shot: added }] })), /appends/);
  });
  it('globals set the other window blocks but never SCENES or STRUCTURE', () => {
    const base = applyPatch({}, storyboardApplySchema.parse({ path: 'x', set: { structure: structure([scene(1), scene(2)]), shots: board() } })).win;
    const r = applyPatch(base, storyboardApplySchema.parse({ path: 'x', globals: { FORMAT: 'shorts-9x16', COMPREHENSION: comprehension } }));
    assert.equal(r.win.FORMAT, 'shorts-9x16');
    assert.throws(() => applyPatch(base, storyboardApplySchema.parse({ path: 'x', globals: { SCENES: [] } })), /dedicated fields/);
  });
});

describe('file round trip', () => {
  it('serialises every global in schema order and keeps the header, minus the approval line', () => {
    const shots = board();
    shots[0] = { type: shots[0].type, id: 's0001', ...shots[0] };
    const win = { SCENES: shots, STRUCTURE: structure([scene(1), scene(2)]), FORMAT: 'shorts-9x16', THEME: { accent: '#fff' }, ZZZ: 1 };
    const src = serializeBoard(win, ['// approved: 2026-09-01', '// note']);
    assert.ok(src.startsWith('// note\n'));
    assert.ok(!/approved/.test(src));
    const order = [...src.matchAll(/^window\.([A-Z_]+) =/gm)].map((m) => m[1]);
    assert.deepEqual(order, ['FORMAT', 'THEME', 'STRUCTURE', 'SCENES', 'ZZZ']);
    assert.match(src, /window\.SCENES = \[\n  \{\n    "id": "s0001",/);
  });
  it('creates a board with set, refuses a patch on a missing file, patches an existing one, and drops the approval line', () => {
    const dir = tmp();
    assert.throws(() => applyStoryboard(storyboardApplySchema.parse({ path: dir, scenes: [scene(1)] })), /new board is written with `set`/);
    const created = applyStoryboard(storyboardApplySchema.parse({ path: dir, set: { structure: structure([scene(1), scene(2)]), shots: board() }, globals: { FORMAT: 'shorts-9x16', COMPREHENSION: comprehension } }));
    assert.ok(created.written && created.created);
    const file = join(dir, 'scenes.js');
    writeFileSync(file, '// approved: 2026-09-10\n' + readFileSync(file, 'utf8'));
    const read = readBoard(dir);
    assert.deepEqual(read.header, ['// approved: 2026-09-10']);
    assert.equal(read.win.SCENES.length, 4);
    const patched = applyStoryboard(storyboardApplySchema.parse({ path: file, scenes: [scene(2, { place: '옥상', time: '밤' })] }));
    assert.ok(patched.written && patched.approvalDropped);
    assert.ok(!/approved/.test(readFileSync(file, 'utf8')));
    assert.equal(readBoard(dir).win.SCENES[3].sceneSlug, '옥상 / 밤');
  });
  it('a violation writes nothing; a dry run writes nothing', () => {
    const dir = tmp();
    applyStoryboard(storyboardApplySchema.parse({ path: dir, set: { structure: structure([scene(1), scene(2)]), shots: board() }, globals: { FORMAT: 'shorts-9x16', COMPREHENSION: comprehension } }));
    const before = readFileSync(join(dir, 'scenes.js'), 'utf8');
    const bad = applyStoryboard(storyboardApplySchema.parse({ path: dir, removeScenes: [2] }));
    assert.ok(!bad.written && bad.findings.some((f) => f.level === 'bad'));
    const dry = applyStoryboard(storyboardApplySchema.parse({ path: dir, dryRun: true, scenes: [scene(2, { place: '옥상', time: '밤' })] }));
    assert.ok(!dry.written && !dry.findings.some((f) => f.level === 'bad'));
    assert.equal(readFileSync(join(dir, 'scenes.js'), 'utf8'), before);
  });
  it('a sparse plan without STRUCTURE saves and checks clean; an invalid eyeline reference is refused', () => {
    const dir = tmp();
    const r = applyStoryboard(storyboardApplySchema.parse({ path: dir, set: { shots: [{ type: 'points', duration: 5, narration: [{ tts: 'The door closes.' }], beat: 'quiet-ending', shot: { size: 'invented-framing' } }] } }));
    assert.ok(!r.findings.some(f => f.level === 'bad'), JSON.stringify(r));
    assert.equal(checkStoryboard({ path: dir, draft: true }).violations, 0);
    const invalid = applyStoryboard(storyboardApplySchema.parse({ path: dir, set: { shots: [{ type: 'points', shot: { eyeline: { matchShot: 9 } } }] } }));
    assert.ok(invalid.findings.some(f => f.level === 'bad' && f.what.includes('matchShot')));
  });
  it('a dry run never writes into the caller\'s shot objects', () => {
    const shots = board();
    const win = { FORMAT: 'shorts-9x16', COMPREHENSION: comprehension, STRUCTURE: structure([scene(1), scene(2)]), SCENES: shots };
    const r = applyPatch(win, storyboardApplySchema.parse({ path: '.', dryRun: true, scenes: [scene(2, { place: '옥상', time: '밤' })] }));
    assert.ok(!r.findings.some((f) => f.level === 'bad'));
    assert.equal(r.win.SCENES[3].sceneSlug, '옥상 / 밤');
    assert.equal(shots[3].sceneSlug, undefined);
    assert.equal(win.STRUCTURE.scenes[1].place, '작업실');
  });
  it('an older STRUCTURE.version is kept and reported, never silently stamped', () => {
    const win = { FORMAT: 'shorts-9x16', COMPREHENSION: comprehension, STRUCTURE: { ...structure([scene(1), scene(2)]), version: 'structure-v0' }, SCENES: board() };
    const r = applyPatch(win, storyboardApplySchema.parse({ path: '.', globals: { FORMAT: 'shorts-9x16' } }));
    assert.equal(r.win.STRUCTURE.version, 'structure-v0');
    assert.ok(r.findings.some((f) => f.level === 'bad' && /version/.test(f.what)));
  });
  it('a hand-broken STRUCTURE is a finding, not a TypeError, in apply and outline', () => {
    const win = { FORMAT: 'shorts-9x16', COMPREHENSION: comprehension, STRUCTURE: { version: STRUCTURE_VERSION, sequences: {}, scenes: [null] }, SCENES: board() };
    const r = applyPatch(win, storyboardApplySchema.parse({ path: '.', globals: { FORMAT: 'shorts-9x16' } }));
    assert.ok(r.findings.some((f) => f.level === 'bad' && /arrays of objects/.test(f.what)));
    assert.doesNotThrow(() => contract().outline(win, 'full'));
  });
  it('shot positions may arrive in any order', () => {
    const win = { FORMAT: 'shorts-9x16', COMPREHENSION: comprehension, STRUCTURE: structure([scene(1), scene(2)]), SCENES: board() };
    const extra = (no) => ({ ...board()[1], scene: 2, shot: { ...board()[1].shot, info: '정보 ' + no } });
    const r = applyPatch(win, storyboardApplySchema.parse({ path: '.', shots: [{ no: 6, shot: extra(6) }, { no: 5, shot: extra(5) }] }));
    assert.equal(r.win.SCENES.length, 6);
  });
  it('storyboard_apply is not advertised as idempotent — inserts and appends repeat', () => {
    const apply = TOOLS.find((t) => t.name === 'storyboard_apply');
    assert.equal(apply.annotations.idempotentHint, false);
  });
  it('the version fallback in storyboard.ts equals the contract VERSION', () => {
    assert.equal(STRUCTURE_VERSION, contract().VERSION);
    assert.equal(STRUCTURE_VERSION, 'structure-v1');
  });
  it('a repeated sequence.title warns', () => {
    const st = structure([scene(1), scene(2)]);
    st.sequences = [{ id: 'q1', title: '같은 제목', purpose: '한 목적', scenes: [1] }, { id: 'q2', title: '같은 제목', purpose: '다른 목적', scenes: [2] }];
    const f = contract().check({ FORMAT: 'shorts-9x16', COMPREHENSION: comprehension, STRUCTURE: st, SCENES: board() });
    assert.ok(f.some((x) => /repeats another sequence's/.test(x.what)));
  });
});

describe('checkStoryboard', () => {
  it('runs the structure rules and check-scenes.js on a written board', () => {
    const dir = tmp();
    applyStoryboard(storyboardApplySchema.parse({ path: dir, set: { structure: structure([scene(1), scene(2)]), shots: board() }, globals: { FORMAT: 'shorts-9x16', COMPREHENSION: comprehension } }));
    const r = checkStoryboard({ path: dir, draft: true });
    assert.equal(r.format, 'shorts-9x16');
    assert.equal(r.shots, 4);
    assert.ok(Array.isArray(r.structure) && Array.isArray(r.contract));
    assert.ok(!r.structure.some((f) => f.level === 'bad'), JSON.stringify(r.structure));
    // The contract half still speaks: this fixture has no STORY / PRODUCTION / render modes.
    assert.ok(r.contract.length > 0);
  });
  it('a write runs no creative rule; storyboard_check reports it and the story pass defers camera continuity', () => {
    // Two same-size adjacent picture shots with no coverage — the 30° rule applies in the full check only.
    const shots = board();
    shots[1].shot.size = 'mcu';
    const dir = tmp();
    const draft = applyStoryboard(storyboardApplySchema.parse({ path: dir, draft: true, set: { structure: structure([scene(1), scene(2)]), shots }, globals: { FORMAT: 'shorts-9x16', COMPREHENSION: comprehension } }));
    assert.ok(draft.written && !draft.findings.some((f) => /adjacent picture cut/.test(f.what)), JSON.stringify(draft.findings));
    assert.ok(checkStoryboard({ path: dir }).structure.some((f) => f.level === 'warn' && /adjacent picture cut/.test(f.what)));
    const r = checkStoryboard({ path: dir, draft: true });
    assert.ok(!r.structure.some((f) => f.level === 'bad'), JSON.stringify(r.structure));
    assert.ok(r.structure.some((f) => f.level === 'later' && /adjacent picture cut/.test(f.what)));
    // No duplicate: the deferred finding lands once, not as bad in one list and later in the other.
    assert.ok(!r.contract.some((f) => /adjacent picture cut/.test(f.what)), JSON.stringify(r.contract));
  });
  it('counts an unsupported render route or a negative duration as a violation', () => {
    const dir = tmp();
    for (const shot of [{ type: 'points', shot: { render: { mode: 'made_up' } } }, { type: 'points', duration: -1 }]) {
      writeFileSync(join(dir, 'scenes.js'), 'window.SCENES=' + JSON.stringify([shot]) + ';');
      assert.ok(checkStoryboard({ path: dir, draft: true }).violations > 0, JSON.stringify(shot));
    }
  });
  it('allows missing shot ids but reports one duplicate id', () => {
    const dir = tmp();
    const base = { FORMAT: 'shorts-9x16', COMPREHENSION: comprehension, STRUCTURE: structure([scene(1), scene(2)]), SCENES: board() };
    writeFileSync(join(dir, 'scenes.js'), serializeBoard(base));
    const missing = checkStoryboard({ path: dir, draft: true });
    assert.equal([...missing.structure, ...missing.contract].filter((f) => /\bid:/.test(f.what)).length, 0);
    const duplicate = board().map((s, i) => ({ ...s, id: `s${String(i === 2 ? 2 : i + 1).padStart(4, '0')}` }));
    writeFileSync(join(dir, 'scenes.js'), serializeBoard({ ...base, SCENES: duplicate }));
    const checked = checkStoryboard({ path: dir, draft: true });
    assert.equal([...checked.structure, ...checked.contract].filter((f) => /duplicate s0002/.test(f.what)).length, 1);
    for (const id of ['return', 42, null]) {
      const malformed = board().map((s, i) => i ? s : { ...s, id });
      writeFileSync(join(dir, 'scenes.js'), serializeBoard({ ...base, SCENES: malformed }));
      const invalid = checkStoryboard({ path: dir, draft: true });
      const findings = [...invalid.structure, ...invalid.contract].filter(f => /^id:/.test(f.what));
      assert.equal(findings.length, 1, JSON.stringify(findings));
      assert.equal(findings[0].level, 'bad');
      assert.match(findings[0].what, /at least four digits/);
    }
  });
});

describe('story first, then characters and lines', () => {
  it('each layer needs the one before it, and a new shot plays at the end of its scene', () => {
    const dir = tmp();
    assert.throws(() => writeStoryScenes({ path: dir, scenes: [{ sequence: 'q1', no: 1, place: '숲', time: '낮', event: 'e', summary: '씬' }] }), /story_order/);
    writeStorySequences({ path: dir, sequences: [{ id: 'q1', title: '발단', purpose: '만남' }] });
    assert.throws(() => writeStoryShots({ path: dir, shots: [{ scene: 1, summary: '샷' }] }), /story_order/);
    writeStoryScenes({ path: dir, scenes: [1, 2].map((no) => ({ sequence: 'q1', no, place: '숲', time: '낮', event: 'e', summary: '씬 ' + no })) });
    writeStoryShots({ path: dir, shots: [{ scene: 2, summary: 'b' }, { scene: 1, summary: 'a1' }, { scene: 1, summary: 'a2' }] });
    const { win } = readBoard(dir);
    assert.equal(win.STORY.version, 'story-v2');
    assert.deepEqual(win.SCENES.map((s) => s.summary), ['a1', 'a2', 'b']);
    assert.deepEqual(win.STRUCTURE.sequences[0].scenes, [1, 2]);
    const outside = writeStorySequences({ path: dir, sequences: [{ id: 'q1', title: '발단', purpose: '만남', question: '누가 오나', payoff: 9 }] });
    assert.deepEqual(outside.findings.filter((f) => /payoff/.test(f.what)).map((f) => f.level), ['warn']);
    writeStorySequences({ path: dir, sequences: [{ id: 'q1', title: '발단', purpose: '만남', question: '누가 오나', payoff: 2 }] });
    assert.deepEqual([readBoard(dir).win.STRUCTURE.sequences[0].payoff, readBoard(dir).win.STRUCTURE.sequences[0].scenes], [2, [1, 2]]);
    writeStoryShots({ path: dir, shots: [{ id: 's0001', scene: 2, summary: 'a1 moved' }] });
    assert.deepEqual(readBoard(dir).win.SCENES.map((s) => [s.id, s.scene]), [['s0002', 1], ['s0003', 2], ['s0001', 2]]);
    // s0001 looks at s0003 (position 2); a shot added to scene 1 pushes s0003 to position 3.
    applyStoryboard({ path: dir, draft: true, shotsById: [{ id: 's0001', shot: { ...readBoard(dir).win.SCENES[2], shot: { eyeline: { matchShot: 2 } } } }] });
    writeStoryShots({ path: dir, shots: [{ scene: 1, summary: 'a3' }] });
    const moved = readBoard(dir).win.SCENES;
    assert.equal(moved.find((s) => s.id === 's0001').shot.eyeline.matchShot, moved.findIndex((s) => s.id === 's0003') + 1);
    assert.deepEqual(readStoryboard(storyboardReadSchema.parse({ path: dir })).playback.map((row) => row.summary), ['a2', 'a3', 'b', 'a1 moved']);
  });
  it('characters wait for a complete story; lines wait for the shot\'s characters', () => {
    const dir = tmp();
    writeStorySequences({ path: dir, sequences: [{ id: 'q1', title: '발단', purpose: '만남' }] });
    writeStoryScenes({ path: dir, scenes: [1, 2].map((no) => ({ sequence: 'q1', no, place: '숲', time: '낮', event: 'e', summary: '씬 ' + no })) });
    writeStoryShots({ path: dir, shots: [{ scene: 1, summary: 'a' }] });
    writeFileSync(join(dir, 'cast.json'), JSON.stringify({ characters: [{ id: 'mina' }, { id: 'joon' }, { id: 'narrator' }] }));
    assert.throws(() => writeShotCharacters({ path: dir, shots: [{ id: 's0001', characters: ['mina'] }] }), /story_order.*scene 2 has no shot/);
    writeStoryShots({ path: dir, shots: [{ scene: 2, summary: 'b' }] });
    assert.throws(() => writeShotDialogue({ path: dir, shots: [{ id: 's0001', lines: [{ speaker: 'mina', tts: '안녕' }] }] }), /story_order/);
    assert.throws(() => writeShotCharacters({ path: dir, shots: [{ id: 's0001', characters: ['ghost'] }] }), /cast_unknown/);
    writeShotCharacters({ path: dir, shots: [{ id: 's0001', characters: ['mina'] }, { id: 's0002', characters: [] }] });
    assert.throws(() => writeShotDialogue({ path: dir, shots: [{ id: 's0001', lines: [{ speaker: 'joon', tts: '야', delivery: 'on_screen' }] }] }), /story_order/);
    writeShotDialogue({ path: dir, shots: [{ id: 's0001', lines: [{ speaker: 'mina', tts: '안녕' }, { speaker: 'narrator', tts: '그날 밤.' }] }] });
    const shot = readBoard(dir).win.SCENES[0];
    assert.deepEqual(shot.visual.character, ['mina']);
    assert.deepEqual(shot.narration.map((l) => [l.id, l.speaker, l.delivery]), [['s0001-l1', 'mina', 'on_screen'], ['s0001-l2', 'narrator', 'voiceover']]);
    const recast = writeShotCharacters({ path: dir, shots: [{ id: 's0001', characters: ['joon'] }] });
    assert.equal(recast.written, true);
    assert.deepEqual(recast.findings.filter((f) => f.where === 's0001').map((f) => f.level), ['warn']);
    assert.deepEqual(readBoard(dir).win.SCENES[0].narration.map((l) => [l.speaker, l.delivery]), [['mina', 'off_screen'], ['narrator', 'voiceover']]);
    const back = writeShotCharacters({ path: dir, shots: [{ id: 's0001', characters: ['mina'] }] });
    assert.ok(back.findings.some((f) => f.where === 's0001' && /off_screen lines/.test(f.what)));
    const bad = (patch) => applyStoryboard({ path: dir, draft: true, dryRun: true, ...patch }).findings.filter((f) => f.level === 'bad').map((f) => f.what);
    assert.match(bad({ shotsById: [{ id: 's0001', shot: { ...shot, visual: {} } }] }).join(), /story_order: lines before characters/);
    assert.match(bad({ insertShots: [{ after: 0, shots: [{ type: 'points', title: 'no story' }] }] }).join(), /story_order: no summary/);
  });
});

describe('icon attributes come after every shot\'s characters', () => {
  // A story-first board with two shots in one scene and mina in the cast.
  const storyBoard = () => {
    const dir = tmp();
    writeStorySequences({ path: dir, sequences: [{ id: 'q1', title: '발단', purpose: '만남' }] });
    writeStoryScenes({ path: dir, scenes: [{ sequence: 'q1', no: 1, place: '숲', time: '낮', event: 'e', summary: '씬' }] });
    writeStoryShots({ path: dir, shots: [{ scene: 1, summary: 'a' }, { scene: 1, summary: 'b' }] });
    writeFileSync(join(dir, 'cast.json'), JSON.stringify({ characters: [{ id: 'mina' }] }));
    return dir;
  };
  it('a move is a camera technique on a video cut and the still effect on a still cut', () => {
    const dir = storyBoard();
    writeShotCharacters({ path: dir, shots: [{ id: 's0001', characters: ['mina'] }] });
    assert.throws(() => writeShotIcons({ path: dir, shots: [{ id: 's0001', size: 'ms' }] }), /story_order.*s0002 has no characters/);
    writeShotCharacters({ path: dir, shots: [{ id: 's0002', characters: [] }] });
    assert.throws(() => writeShotIcons({ path: dir, shots: [{ id: 's0001', move: { id: 'camera.low', reason: 'x' } }] }), /not a camera move/);
    writeShotIcons({ path: dir, shots: [
      { id: 's0001', render: { mode: 'generated_video', reason: 'continuous action' }, size: 'ms', angle: 'eye',
        move: { id: 'camera.dolly-in', reason: 'approach the reaction' }, depth: { mode: 'shallow', reads: 1, focus: 'eyes' },
        frames: { mode: 'reference', reason: 'MSR keeps identity' } },
      { id: 's0002', render: { mode: 'still_camera', reason: 'quiet place' }, move: { id: 'push', reason: 'settle in' } },
    ] });
    const [video, still] = readBoard(dir).win.SCENES;
    assert.deepEqual(video.shot.techniques.map((t) => t.id), ['camera.dolly-in']);
    assert.equal(video.visual.camera.movement, 'dolly in');
    assert.equal(video.visual.frames.mode, 'reference');
    assert.equal(still.shot.render.camera.effect, 'push');
    assert.equal(still.shot.techniques, undefined);
    writeShotIcons({ path: dir, shots: [{ id: 's0001', move: { id: 'camera.whip-pan', reason: 'snap to the door', target: 'the door' }, size: 'ms', why: 'her whole reaction' }] });
    writeShotIcons({ path: dir, shots: [{ id: 's0001', move: { id: 'camera.dolly-in', reason: 'approach the reaction' }, size: 'cu' }] });
    assert.deepEqual([readBoard(dir).win.SCENES[0].visual.camera, readBoard(dir).win.SCENES[0].shot.why], [{ movement: 'dolly in' }, undefined]);
    writeShotIcons({ path: dir, shots: [{ id: 's0001', move: { id: 'camera.dolly-in', reason: 'closer', target: 'her eyes' } }] });
    writeShotIcons({ path: dir, shots: [{ id: 's0001', move: { id: 'camera.dolly-in', reason: 'closer still' } }] });
    assert.equal(readBoard(dir).win.SCENES[0].visual.camera.target, 'her eyes');
    writeShotIcons({ path: dir, shots: [
      { id: 's0001', render: { mode: 'still_camera', reason: 'a held look' }, frames: { mode: 'first', reason: 'one picture' } },
      { id: 's0002', render: { mode: 'generated_video', reason: 'the door opens' } },
    ] });
    const [held, opened] = readBoard(dir).win.SCENES;
    assert.deepEqual([held.shot.techniques, held.visual.camera, opened.shot.render.camera], [[], undefined, undefined]);
    // An authored camera move with no technique yet is the same move: its speed and target stay.
    applyStoryboard({ path: dir, draft: true, shotsById: [{ id: 's0002', shot: { ...opened, visual: { ...opened.visual, camera: { movement: 'dolly in', speed: 'slow', target: 'her eyes' } } } }] });
    writeShotIcons({ path: dir, shots: [{ id: 's0002', move: { id: 'camera.dolly-in', reason: 'approach her' } }] });
    assert.deepEqual(readBoard(dir).win.SCENES[1].visual.camera, { movement: 'dolly in', speed: 'slow', target: 'her eyes' });
    // A still effect keeps its target only while the effect stays the same.
    writeShotIcons({ path: dir, shots: [{ id: 's0001', move: { id: 'push', reason: 'settle in', target: 'the window' } }] });
    writeShotIcons({ path: dir, shots: [{ id: 's0001', move: { id: 'push', reason: 'settle in slowly' } }] });
    assert.equal(readBoard(dir).win.SCENES[0].shot.render.camera.target, 'the window');
    writeShotIcons({ path: dir, shots: [{ id: 's0001', move: { id: 'pan', reason: 'scan the room' } }] });
    assert.equal(readBoard(dir).win.SCENES[0].shot.render.camera.target, undefined);
  });
  it('only a board started with story_sequence holds every writer to the order', () => {
    const dir = storyBoard();
    const shot = readBoard(dir).win.SCENES[0];
    const bad = (path, patch) => applyStoryboard({ path, draft: true, dryRun: true, ...patch }).findings.filter((f) => f.level === 'bad').map((f) => f.what).join();
    assert.match(bad(dir, { shotsById: [{ id: 's0001', shot: { ...shot, shot: { size: 'ms' } } }] }), /story_order: icon attributes before characters/);
    assert.match(bad(dir, { globals: { STORY: { version: 'story-v2' } } }), /story_order: STORY.authoring/);
    const legacy = tmp();
    applyStoryboard(storyboardApplySchema.parse({ path: legacy, set: { structure: structure([scene(1)]), shots: [{ type: 'points', scene: 1, shot: { size: 'ms' } }] }, globals: { STORY: { version: 'story-v2' } } }));
    assert.doesNotMatch(bad(legacy, { transitions: [{ no: 1, transition: 'cut', reason: 'opening' }] }), /story_order/);
  });
  it('a new board inside an episode starts with story_sequence', () => {
    const root = tmp(), episode = join(root, 'data/c/episodes/e'), dir = join(episode, 'storyboard');
    mkdirSync(dir, { recursive: true });
    assert.throws(() => applyStoryboard(storyboardApplySchema.parse({ path: dir, set: { structure: structure([scene(1)]), shots: [{ type: 'points', scene: 1 }] } })), /story_order: a new episode board/);
    assert.equal(writeStorySequences({ path: dir, sequences: [{ id: 'q1', title: '발단', purpose: '만남' }] }).written, true);
  });
});

describe('images and the video prompt follow the icon attributes', () => {
  // A project whose episode board has an MSR shot and a first_last shot with mina, her sheet panels and a room.
  const pictureBoard = () => {
    const root = tmp(), dir = join(root, 'data/c/episodes/e/storyboard'), sheet = join(root, 'data/c/assets/characters/mina');
    mkdirSync(sheet, { recursive: true }); mkdirSync(join(dir, 'places'), { recursive: true });
    setupProject(root);
    for (const name of ['face', 'body', 'back']) writeFileSync(join(sheet, name + '.png'), png);
    writeFileSync(join(sheet, 'panels.json'), JSON.stringify({ panels: { face: { file: 'face.png' }, front: { file: 'body.png' }, back: { file: 'back.png' } } }));
    writeFileSync(join(dir, 'places/room.png'), png);
    writeFileSync(join(dir, 'places/key.png'), png);
    writeStorySequences({ path: dir, sequences: [{ id: 'q1', title: '발단', purpose: '만남' }] });
    writeStoryScenes({ path: dir, scenes: [{ sequence: 'q1', no: 1, place: '방', time: '밤', event: 'e', summary: '씬' }] });
    writeStoryShots({ path: dir, shots: [{ scene: 1, summary: 'a' }, { scene: 1, summary: 'b' }] });
    writeFileSync(join(dir, 'cast.json'), JSON.stringify({ characters: [{ id: 'mina' }] }));
    applyStoryboard({ path: dir, draft: true, expectedSha256: readBoard(dir).sha256, globals: { SB_DOC: { locations: [{ id: 'room', name: '방', imageUrl: 'places/room.png' }],
      props: [{ id: 'key', name: '열쇠', imageUrl: 'places/key.png' }] } } });
    writeShotCharacters({ path: dir, shots: [{ id: 's0001', characters: ['mina'] }, { id: 's0002', characters: ['mina'] }] });
    writeShotDialogue({ path: dir, shots: [{ id: 's0002', lines: [{ speaker: 'mina', tts: '안녕' }] }] });
    return { root, dir };
  };
  const icons = (dir) => writeShotIcons({ path: dir, shots: [
    { id: 's0001', render: { mode: 'generated_video', reason: 'r' }, size: 'ms', angle: 'eye', move: { id: 'camera.dolly-in', reason: 'r' }, frames: { mode: 'reference', reason: 'MSR' } },
    { id: 's0002', render: { mode: 'generated_video', reason: 'r' }, size: 'mcu', angle: 'eye', frames: { mode: 'first_last', reason: 'r', endState: 'e' } },
  ] });
  const make = (dir, id, frame = 'start', extra = {}) => {
    const args = { path: dir, id, frame, prompt: 'Mina waits by the window.', ...extra };
    const request = shotImageRequest(args);
    writeFileSync(request.file, png);   // the picture the image model returns
    recordShotImage(args, request);
    return request;
  };
  it('a frame composes the place, then the sheet panels, after every shot has its icons', () => {
    const { root, dir } = pictureBoard();
    assert.throws(() => shotImageRequest({ path: dir, id: 's0001', frame: 'start', prompt: 'p', location: 'room' }), /story_order.*no render route/);
    icons(dir);
    const start = make(dir, 's0001', 'start', { location: 'room' });
    assert.deepEqual(start.inputs.map((f) => f.split('/').slice(-2).join('/')), ['places/room.png', 'mina/face.png', 'mina/body.png', 'mina/back.png']);
    assert.match(start.prompt, /Image 1 shows the room location\. Image 2 shows mina's face and hair\..*Medium shot, waist up, at eye level/);
    const shot = readBoard(dir).win.SCENES[0];
    assert.equal(shot.visual.frames.start, 'images/s0001-start-v1.png');
    assert.equal(shot.visual.bg, shot.visual.frames.start);
    assert.deepEqual(shot.visual.references.map((r) => [r.role, r.use]), [['character', 'both'], ['character', 'both'], ['character', 'both'], ['background', 'image']]);
    assert.throws(() => shotImageRequest({ path: dir, id: 's0001', frame: 'end', prompt: 'p' }), /story_order.*first_last/);
    assert.equal(make(dir, 's0001').requestId, 's0001-start-v2');
    settings.saveSettings(root, { image: { engine: 'astra-genai', model: 'z-image-turbo' }, video: { engine: 'seedance', model: 'dreamina-seedance-2-0-260128', resolution: '720p' }, speech: { engine: 'none' } },
      { expectedRevision: settings.readSettings(root).revision, request: 'Fixture: a one-picture image model' });
    assert.throws(() => shotImageRequest({ path: dir, id: 's0002', frame: 'start', prompt: 'p', location: 'room' }), /image_references_unsupported/);
    settings.saveSettings(root, { image: { engine: 'mlx', model: 'FLUX.2-klein-4B' }, video: { engine: 'seedance', model: 'dreamina-seedance-2-0-260128', resolution: '720p' }, speech: { engine: 'none' } },
      { expectedRevision: settings.readSettings(root).revision, request: 'Fixture: an MLX edit pack with three references' });
    assert.equal(shotImageRequest({ path: dir, id: 's0002', frame: 'start', prompt: 'p', location: 'room' }).inputs.length, 4);
    assert.throws(() => shotImageRequest({ path: dir, id: 's0002', frame: 'start', prompt: 'p', location: 'room', props: ['key'] }), /image_references_unsupported.*takes 4/);
    settings.saveSettings(root, { image: { engine: 'mlx', model: 'Qwen-Image-2.1' }, video: { engine: 'seedance', model: 'dreamina-seedance-2-0-260128', resolution: '720p' }, speech: { engine: 'none' } },
      { expectedRevision: settings.readSettings(root).revision, request: 'Fixture: an MLX edit pack with nine references' });
    assert.equal(shotImageRequest({ path: dir, id: 's0002', frame: 'start', prompt: 'p', location: 'room', props: ['key'] }).inputs.length, 5);
    writeShotIcons({ path: dir, shots: [{ id: 's0002', render: { mode: 'motion_html', reason: 'a diagram' } }] });
    assert.throws(() => shotImageRequest({ path: dir, id: 's0002', frame: 'start', prompt: 'p' }), /shot_image: s0002 is a motion_html cut/);
  });
  it('the video prompt reads the icon attributes after every picture exists', () => {
    const { dir } = pictureBoard();
    icons(dir);
    make(dir, 's0001', 'start', { location: 'room' });
    assert.throws(() => writeShotPrompt({ path: dir, id: 's0001', action: 'Mina turns.' }), /story_order.*s0002 has no start image/);
    make(dir, 's0002', 'start', { location: 'room' });
    assert.throws(() => writeShotPrompt({ path: dir, id: 's0001', action: 'Mina turns.' }), /s0002 has no end image/);
    assert.throws(() => shotImageRequest({ path: dir, id: 's0002', frame: 'end', prompt: 'p', location: 'room' }), /keeps its place/);
    const ended = make(dir, 's0002', 'end', { props: ['key'] });
    assert.match(ended.inputs[0], /images\/s0002-start-v1\.png$/);
    assert.deepEqual([ended.inputs.length, readBoard(dir).win.SCENES[1].visual.frames.endProps], [5, ['key']]);
    const msr = writeShotPrompt({ path: dir, id: 's0001', action: 'Mina turns to the door.' }).prompt;
    assert.match(msr, /^Medium shot, waist up, at eye level\. Camera: dolly in.*Mina turns to the door\. Audio: no music\.$/);
    const framed = writeShotPrompt({ path: dir, id: 's0002', action: 'Mina looks up.', end: 'she smiles' }).prompt;
    assert.equal(framed, 'Start from the given first frame. Mina looks up. Mina says: "안녕". End on the given last frame: she smiles. Audio: no music.');
    assert.match(writeShotPrompt({ path: dir, id: 's0002', action: 'Mina looks up.', sound: 'rain on the window' }).prompt, /Audio: rain on the window, no music\.$/);
    assert.match(writeShotPrompt({ path: dir, id: 's0002', action: 'Mina looks up.', sound: 'a radio plays a song' }).prompt, /Audio: a radio plays a song\.$/);
    writeShotPrompt({ path: dir, id: 's0002', action: 'Mina looks up.', end: 'she smiles' });
    assert.equal(readBoard(dir).win.SCENES[1].visual.video.prompt, framed);
    const relined = writeShotDialogue({ path: dir, shots: [{ id: 's0002', lines: [{ speaker: 'mina', tts: '잠깐!' }] }] });
    assert.ok(relined.findings.some((f) => f.where === 's0002' && /video prompt predates a change of on-screen lines/.test(f.what)));
    assert.match(writeShotPrompt({ path: dir, id: 's0002', action: 'Mina looks up.' }).prompt, /Mina says: "잠깐!" End on/);
    assert.deepEqual(contract().promptDrift(readBoard(dir).win.SCENES[1], () => false), []);
    assert.throws(() => writeShotPrompt({ path: dir, id: 's0002', action: '미나가 웃는다' }), /video_prompt_language/);
    // A new start image takes the end image edited from the old one off the shot.
    const again = { path: dir, id: 's0002', frame: 'start', prompt: 'Mina waits by the door.' };
    const remade = shotImageRequest(again);
    writeFileSync(remade.file, png);
    assert.deepEqual(recordShotImage(again, remade).findings.filter((f) => f.where === 's0002').map((f) => f.level), ['warn']);
    assert.deepEqual([readBoard(dir).win.SCENES[1].visual.frames.end, readBoard(dir).win.SCENES[1].visual.frames.endProps, readBoard(dir).win.SCENES[1].visual.endPrompt], [undefined, undefined, undefined]);
    assert.throws(() => writeShotPrompt({ path: dir, id: 's0002', action: 'Mina looks up.' }), /s0002 has no end image/);
    make(dir, 's0002', 'end');
    const replanned = writeShotIcons({ path: dir, shots: [{ id: 's0002', frames: { mode: 'reference', reason: 'MSR now' } }] });
    const msrShot = readBoard(dir).win.SCENES[1];
    assert.deepEqual(replanned.findings.filter((f) => f.where === 's0002').map((f) => /end image/.test(f.what) ? 'end' : /video prompt predates a change of frame plan/.test(f.what) ? 'prompt' : f.what), ['end', 'prompt']);
    assert.deepEqual([msrShot.visual.frames.end, msrShot.visual.frames.endState, msrShot.visual.endPrompt], [undefined, undefined, undefined]);
    assert.deepEqual([...new Set(msrShot.visual.references.filter((r) => r.role === 'character').map((r) => r.use))], ['both']);
    // A new cast leaves the start image behind; the tool says so. A departed panel goes by its folder or its shot_image id.
    const moved = readBoard(dir).win.SCENES[1];
    applyStoryboard({ path: dir, draft: true, shotsById: [{ id: 's0002', shot: { ...moved, visual: { ...moved.visual,
      references: moved.visual.references.map((r) => r.id === 's0002-mina-face' ? { ...r, path: 'references/mina-face.png' } : r) } } }] });
    const recast = writeShotCharacters({ path: dir, shots: [{ id: 's0002', characters: [] }] });
    assert.ok(recast.findings.some((f) => f.where === 's0002' && /start image/.test(f.what)));
    assert.ok(recast.findings.some((f) => f.where === 's0002' && /video prompt predates a change of frame plan, characters/.test(f.what)));
    assert.deepEqual(readBoard(dir).win.SCENES[1].visual.references.filter((r) => r.role === 'character'), []);
    const hand = readBoard(dir).win.SCENES[1];
    applyStoryboard({ path: dir, draft: true, shotsById: [{ id: 's0002', shot: { ...hand, visual: { ...hand.visual, video: { ...hand.visual.video, prompt: 'Start from the given first frame. Mina looks up slowly.' } } } }] });
    assert.equal(readBoard(dir).win.SCENES[1].visual.video.promptBasis, undefined);
    // A new size after the start image leaves that picture behind; the tool says so.
    const resized = writeShotIcons({ path: dir, shots: [{ id: 's0001', size: 'ecu' }] });
    assert.ok(resized.findings.some((f) => f.where === 's0001' && /start image was made for the previous size/.test(f.what)));
  });
  it('GPT Image gets a mixed PNG and JPEG set as PNG copies', () => {
    const { root, dir } = pictureBoard();
    icons(dir);
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=gray:s=16x16', '-frames:v', '1', join(dir, 'places/yard.jpg')]);
    const doc = readBoard(dir).win.SB_DOC;
    applyStoryboard({ path: dir, draft: true, globals: { SB_DOC: { ...doc, locations: [...doc.locations, { id: 'yard', name: '마당', imageUrl: 'places/yard.jpg' }] } } });
    settings.saveSettings(root, { image: { engine: 'gpt-image', model: 'gpt-image-2', quality: 'low' }, video: { engine: 'seedance', model: 'dreamina-seedance-2-0-260128', resolution: '720p' }, speech: { engine: 'none' } },
      { expectedRevision: settings.readSettings(root).revision, request: 'Fixture: GPT Image' });
    const ask = () => shotImageRequest({ path: dir, id: 's0001', frame: 'start', prompt: 'Mina in the yard.', location: 'yard' });
    const path = process.env.PATH;
    process.env.PATH = '';
    try { assert.throws(ask, /image_inputs_mixed_format/); } finally { process.env.PATH = path; }
    const request = ask();
    assert.match(request.inputs[0], /images\/inputs\/[0-9a-f]{16}\.png$/);
    assert.equal(request.args.sourceMimeType, 'image/png');
  });
});

describe('tool surface', () => {
  it('the four tools exist with handlers and local hints', () => {
    for (const name of ['storyboard_read', 'storyboard_apply', 'storyboard_check', 'scenario_check',
      'story_sequence', 'story_scene', 'story_shot', 'shot_characters', 'shot_dialogue', 'shot_icons', 'shot_image', 'shot_prompt']) {
      const tool = TOOLS.find((t) => t.name === name);
      assert.ok(tool, `missing tool ${name}`);
      assert.equal(typeof ROUTES[name], 'function');
      assert.equal(tool.annotations.openWorldHint, name === 'shot_image');
      assert.match(tool.description, /Use it/);
      assert.match(tool.description, /Do NOT/);
      assert.match(tool.description, /Returns:/);
    }
    assert.equal(TOOLS.find((t) => t.name === 'storyboard_apply').annotations.readOnlyHint, false);
    assert.equal(TOOLS.find((t) => t.name === 'storyboard_read').annotations.readOnlyHint, true);
    assert.equal(TOOLS.find((t) => t.name === 'scenario_check').annotations.readOnlyHint, true);
  });
  it('storyboard_read returns the tree; storyboard_apply rejects an unknown argument', async () => {
    const dir = tmp();
    applyStoryboard(storyboardApplySchema.parse({ path: dir, set: { structure: structure([scene(1), scene(2)]), shots: board() }, globals: { FORMAT: 'shorts-9x16' } }));
    const out = await ROUTES.storyboard_read({ path: dir, level: 'scenes' });
    const tree = JSON.parse(out.content[0].text);
    assert.equal(tree.sequences[0].scenes[1].shots.length, 2);
    await assert.rejects(ROUTES.storyboard_apply({ path: dir, scene: [scene(1)] }), /unknown argument/);
  });
});

describe('storyboard_read inspection', () => {
  const readWin = () => ({
    STORY: { version: 'story-v2', thesis: 'Trust is shown by returning a borrowed watch', review: { hash: 'old', verdict: 'pass' } },
    PRODUCTION: { cast: [{ id: 'child', image: 'characters/child.png' }] },
    SB_DOC: { characters: [{ id: 'child', source: 'identity.md' }], props: [{ id: 'watch', description: 'Silver watch' }] },
    SCENES: [
      { id: 's0001', type: 'points', narration: [], performance: [{ kind: 'action', character: 'child', text: 'She returns the watch.' }],
        shot: { location: { manifest: 'locations/workshop/location.json', stateId: 'day' } },
        visual: { character: 'child', props: ['watch'], propUsage: [{ propId: 'watch', start: { day: 1, order: 1 }, end: { day: 1, order: 2 } }], bg: 'images/scene-1.png' } },
      { id: 's0002', type: 'points', narration: [{ id: 'line-2', speaker: 'father', tts: 'I knew you would.', delivery: 'on_screen' }],
        performance: [{ kind: 'action', character: 'father', text: 'He smiles.' }, { kind: 'dialogue', character: 'father', to: 'child', group: 1 }] },
    ],
  });
  const withBoard = (fn, win = readWin()) => {
    const dir = tmp();
    writeFileSync(join(dir, 'scenes.js'), Object.entries(win).map(([key, value]) => `window.${key}=${JSON.stringify(value)};`).join('\n'));
    return fn(dir);
  };
  it('default shot summary preserves silent action, ordered dialogue and all asset domains', () => {
    const tree = contract().outline(readWin(), 'shots');
    const [silent, dialogue] = tree.unplacedShots;
    assert.equal(silent.id, 's0001');
    assert.equal(silent.narration, '');
    assert.equal(silent.performance[0].text, 'She returns the watch.');
    assert.deepEqual(dialogue.performance.map(e => e.kind), ['action', 'dialogue']);
    assert.equal(dialogue.performance[1].speaker, 'father');
    assert.equal(dialogue.performance[1].text, 'I knew you would.');
    assert.equal(dialogue.performance[1].lineId, 'line-2');
    assert.equal(silent.references.characters, 'child');
    assert.equal(silent.references.location.stateId, 'day');
    assert.deepEqual(silent.references.props, ['watch']);
    assert.equal(silent.references.propUsage[0].propId, 'watch');
    assert.equal(silent.media.bg, 'images/scene-1.png');
  });
  it('invalid performance group is visible and never silently receives invented dialogue', () => {
    const win = readWin(); win.SCENES[1].performance[1].group = 99;
    const event = contract().outline(win, 'shots').unplacedShots[1].performance[1];
    assert.equal(event.unresolvedGroup, true);
    assert.equal(event.text, null);
    assert.equal(event.speaker, null);
  });
  it('read includes scenario, cast, settings and existing review without claiming verification', () => withBoard(dir => {
    const result = readStoryboard(storyboardReadSchema.parse({ path: dir }));
    assert.equal(result.reviewContext.story.review.verdict, 'pass');
    assert.equal(result.reviewContext.evidenceStatus, 'not_verified');
    assert.equal(result.inspection.mediaViewed, false);
    assert.equal(result.reviewContext.document.characters[0].id, 'child');
    assert.equal(result.reviewContext.production.cast[0].image, 'characters/child.png');
    assert.equal(result.mediaBaseDirectory, dir);
    assert.match(result.sha256, /^[a-f0-9]{64}$/);
    assert.equal(result.propSheet.props[0].id, 'watch');
    assert.equal(readStoryboard(storyboardReadSchema.parse({ path: dir, includeContext: false })).reviewContext, undefined);
  }));
  it('stable shot inspection preserves the whole flow and finds neighbors after reorder', () => {
    const win = readWin(); win.SCENES.reverse();
    withBoard(dir => {
      const result = readStoryboard(storyboardReadSchema.parse({ path: dir, shotId: 's0001' }));
      assert.equal(result.selectedShot.no, 2);
      assert.equal(result.selectedShot.shot.id, 's0001');
      assert.deepEqual(result.selectedShot.previous, { id: 's0002', no: 1 });
      assert.equal(result.selectedShot.next, null);
      assert.equal(result.unplacedShots.length, 2);
      assert.throws(() => readStoryboard(storyboardReadSchema.parse({ path: dir, shotId: 'missing' })), /found 0/);
    }, win);
  });
  it('duplicate shot IDs fail targeted inspection instead of inspecting the wrong shot', () => {
    const win = readWin(); win.SCENES[1].id = 's0001';
    withBoard(dir => assert.throws(() => readStoryboard(storyboardReadSchema.parse({ path: dir, shotId: 's0001' })), /found 2/), win);
  });
  it('legacy narration stays visible without invented performance ordering or speakers', () => {
    const row = contract().outline({ SCENES: [{ type: 'points', narration: [{ sub: 'Legacy line' }] }] }, 'shots').unplacedShots[0];
    assert.equal(row.id, null);
    assert.equal(row.narration, 'Legacy line');
    assert.equal(row.speech[0].speaker, null);
    assert.deepEqual(row.performance, []);
  });
  it('inspection neighbors follow b-roll placement and the closing outro, not storage order', () => {
    const win = readWin();
    win.SCENES.push({ id: 's0003', type: 'broll', after: 0, narration: [], performance: [{ kind: 'action', character: 'child', text: 'The watch falls.' }] });
    win.SCENES.push({ id: 's0004', type: 'outro', narration: [] });
    win.SCENES.push({ id: 's0005', type: 'broll', after: 99, narration: [] });
    withBoard(dir => {
      const result = readStoryboard(storyboardReadSchema.parse({ path: dir, shotId: 's0003' }));
      assert.deepEqual(result.playback.map(row => row.id), ['s0001','s0003','s0002','s0004']);
      assert.deepEqual(result.unscheduledShots.map(row => row.id), ['s0005']);
      assert.deepEqual(result.selectedShot.previous, { id: 's0001', no: 1 });
      assert.deepEqual(result.selectedShot.next, { id: 's0002', no: 2 });
      assert.equal(result.selectedShot.playbackPosition, 2);
      const orphan = readStoryboard(storyboardReadSchema.parse({ path: dir, shotId: 's0005' }));
      assert.equal(orphan.selectedShot.playbackPosition, null);
      assert.equal(orphan.selectedShot.previous, null);
    }, win);
  });
});

describe('scenario_check runner', () => {
  it('returns the checker JSON on exit 1 and turns exit 3 stderr into an input error', () => {
    const dir = tmp();
    const checker = join(dir, 'check-scenario-fixture.js');
    writeFileSync(checker, `
const target = process.argv[2];
if (target === 'input-error') { console.error('check-scenario: target must be candidates/ or scenario.md'); process.exit(3); }
const result = { files: [target], violations: 1, warnings: 1, findings: [
  { level: 'bad', where: target, what: 'S1 missing direction' },
  { level: 'warn', where: target, what: 'S12 hook exceeds the length band' }
] };
console.log(JSON.stringify(result));
process.exit(1);
`);
    const parsed = checkScenario(scenarioCheckSchema.parse({ path: 'scenario.md' }), checker);
    assert.equal(parsed.violations, 1);
    assert.equal(parsed.warnings, 1);
    assert.match(parsed.findings[0].what, /^S1 /);
    assert.throws(
      () => checkScenario(scenarioCheckSchema.parse({ path: 'input-error' }), checker),
      /check-scenario\.js failed: check-scenario: target must be candidates\/ or scenario\.md/,
    );
  });
});

describe('shot camera MCP input', () => {
  const drone = () => ({ preset: 'drone-flythrough', variant: 'fpv', trajectory: {
    coordinateSpace: 'local-meters', seconds: 4, lensMm: 24,
    keys: [
      { at: 0, position: [0, -20, 8], target: [0, 0, 4], rollDeg: 0, label: 'the entrance' },
      { at: 2, position: [8, -5, 7], target: [2, 10, 4], rollDeg: 20, label: 'the ridge' },
      { at: 4, position: [0, 15, 6], target: [0, 25, 3], rollDeg: 0, label: 'the bridge' },
    ],
  } });
  it('creation, upsert and insertion all advertise the production route and drone schema', () => {
    const props = TOOLS.find(t => t.name === 'storyboard_apply').inputSchema.properties;
    const shapes = [props.set.properties.shots.items, props.shots.items.properties.shot, props.insertShots.items.properties.shots.items];
    for (const schema of shapes) {
      assert.deepEqual(schema.properties.type.enum, contract().VOCAB.TYPES);
      assert.deepEqual(schema.properties.shot.properties.render.properties.mode.enum, contract().VOCAB.RENDER_MODES);
      assert.equal(schema.properties.shot.properties.render.properties.purpose.type, 'string');
      assert.ok(schema.properties.shot.properties.videoDesign.properties.motion.properties.kind.enum.includes('spatial_reveal'));
      const camera = schema.properties.visual.properties.camera;
      assert.deepEqual(camera.properties.preset.enum, ['drone-flythrough']);
      assert.deepEqual(camera.properties.variant.enum, ['cinematic', 'fpv']);
      assert.deepEqual(camera.properties.trajectory.properties.coordinateSpace.enum, ['local-meters']);
      assert.deepEqual(camera.properties.trajectory.properties.keys.items.required, ['at', 'position', 'target', 'rollDeg', 'label']);
      assert.deepEqual(camera.allOf[0].then.required, ['variant', 'trajectory']);
      assert.equal(camera.allOf[1].then.properties.trajectory.properties.keys.items.properties.rollDeg.const, 0);
      // L13–L15: the move vocabulary rides the schema, and the still lane's window move is an item of its own.
      assert.ok(camera.properties.movement.description.includes('tilt up/down'));
      const stillCamera = schema.properties.shot.properties.render.properties.camera;
      assert.deepEqual(stillCamera.required, ['effect']);
      assert.deepEqual(stillCamera.properties.effect.enum, ['focus-in', 'rack-focus', 'approach', 'pull', 'pan', 'tilt', 'push', 'reveal', 'parallax']);
      assert.equal(schema.additionalProperties, true);
      assert.equal(schema.properties.visual.additionalProperties, true);
    }
    assert.deepEqual(shapes[0], shapes[1]); assert.deepEqual(shapes[1], shapes[2]);
  });
  it('accepts a camera draft before derived prompt slots and preserves visual handoff fields', () => {
    const visual = { camera: drone(), video: { engine: 'seedance', previz: { camera: { trajectoryBinding: 'kept' } } }, custom: { keep: true } };
    const parsed = shotSchema.parse({ ...board()[1], visual });
    assert.deepEqual(parsed.visual, visual);
    const win = { FORMAT: 'shorts-9x16', COMPREHENSION: comprehension, STRUCTURE: structure([scene(1), scene(2)]), SCENES: board() };
    const result = applyPatch(win, storyboardApplySchema.parse({ path: '.', shots: [{ no: 2, shot: parsed }] }));
    assert.ok(!result.findings.some(f => f.level === 'bad'), JSON.stringify(result.findings));
    assert.deepEqual(result.win.SCENES[1].visual, visual);
  });
  it('rejects malformed cameras on the actual MCP request paths, without stripping other fields', () => {
    for (const mutate of [
      c => c.preset = 'unknown', c => delete c.preset, c => c.variant = 'unknown', c => delete c.trajectory,
      c => c.trajectory.keys[1].at = 0, c => c.trajectory.keys[1].position = [1, 2],
      c => c.trajectory.keys[1].rollDeg = 80, c => c.variant = 'cinematic',
      c => c.trajectory.keys[1] = null, c => c.trajectory.seconds = 2.5,
    ]) {
      const c = drone(); mutate(c);
      const s = { ...board()[1], visual: { camera: c } };
      for (const patch of [
        { shots: [{ no: 2, shot: s }] }, { insertShots: [{ after: 1, shots: [s] }] },
        { set: { structure: structure([scene(1)]), shots: [s] } },
      ]) assert.equal(storyboardApplySchema.safeParse({ path: '.', ...patch }).success, false);
    }
  });
  it('ordinary cameras keep extra fields and do not require the drone preset', () => {
    for (const visual of [{}, { camera: { movement: 'dolly in', speed: 'steady', framing: 'medium', end: 'the window', effect: 'push', custom: [1, 2] } }, { video: { engine: 'veo' } }])
      assert.deepEqual(shotSchema.parse({ ...board()[1], visual }).visual, visual);
    const c = drone(); c.variant = 'cinematic'; c.trajectory.keys.forEach(k => k.rollDeg = 0);
    assert.ok(shotSchema.safeParse({ ...board()[1], visual: { camera: c } }).success);
  });
});

it('production vocabulary and apply schema support all six ratios and reject unknown modes', () => {
  const bands=JSON.parse(readFileSync(new URL('../../skills/storyboard/references/render-ratios.json',import.meta.url),'utf8'));
  assert.deepEqual(contract().VOCAB.PRODUCTION_MODES,Object.keys(bands));
  for(const mode of [...Object.keys(bands),'hook_only','stills_only','hybrid']) {
    assert.equal(storyboardApplySchema.safeParse({path:'x',globals:{PRODUCTION:{mode,renderRatioVersion:1}}}).success,true);
  }
  assert.equal(storyboardApplySchema.safeParse({path:'x',globals:{PRODUCTION:{mode:'video_99'}}}).success,false);
  assert.equal(storyboardApplySchema.safeParse({path:'x',globals:{PRODUCTION:{mode:'no_video',renderRatioVersion:2}}}).success,false);
});

it('readiness separates configuration, corrupt files, missing cast links and unreviewed visuals', () => {
  const root=tmp(),dir=join(root,'episodes/one/storyboard'),shared=join(root,'assets/characters/hero');
  mkdirSync(dir,{recursive:true});mkdirSync(shared,{recursive:true});
  writeFileSync(join(shared,'identity.md'),'# Hero');writeFileSync(join(shared,'face.png'),'broken');
  writeFileSync(join(shared,'panels.json'),JSON.stringify({schemaVersion:1,panels:{face:{file:'face.png',purpose:'character_reference',view:'face'}}}));
  const win={SCENES:[],PRODUCTION:{cast:{hero:{}}},SB_DOC:{characters:[]}};
  writeFileSync(join(dir,'scenes.js'),serializeBoard(win));
  let result=readStoryboard(storyboardReadSchema.parse({path:dir})).readiness;
  assert.notEqual(result.configuration.status,'ready');
  assert.equal(result.references.status,'needs_attention');
  assert.equal(result.references.findings[0].domain,'image-reference-missing');
  win.SB_DOC.characters=[{id:'hero',panels:{face:'../../../assets/characters/hero/face.png'}}];
  writeFileSync(join(dir,'scenes.js'),serializeBoard(win));
  result=readStoryboard(storyboardReadSchema.parse({path:dir})).readiness;
  assert.equal(result.assets[0].file,'present');assert.equal(result.assets[0].decoding,'failed');
  assert.equal(result.visualReview,'not_reviewed');
});


it('read and draft check expose camera choices missing from a production shot', () => {
  const dir = tmp(), file = join(dir, 'scenes.js');
  writeFileSync(file, 'window.SCENES=[{id:"s0001",type:"points",shot:{render:{mode:"generated_video"}},visual:{camera:{framing:"Desk"}}}];');
  const read = readStoryboard({path: dir, level: 'shot'});
  assert.ok(read.cameraDirectionFindings.some(f => f.what.startsWith('[camera-plan-missing]')));
  const checked = checkStoryboard({path: dir, draft: true});
  assert.ok(checked.contract.some(f => f.level === 'warn' && f.what.startsWith('[camera-plan-missing]')));
});
