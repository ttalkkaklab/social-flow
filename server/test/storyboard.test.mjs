/**
 * Storyboard tools — the sequence → scene → shot schemas, the in-memory patch, the file
 * round trip, and the check runner over check-scenes.js. No API is called; every board
 * lives in a temp directory.
 */

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { after, describe, it } from 'node:test';

import {
  STRUCTURE_VERSION,
  applyPatch,
  applyStoryboard,
  checkScenario,
  checkStoryboard,
  contract,
  readBoard,
  readStoryboard,
  scenarioCheckSchema,
  serializeBoard,
  shotSchema,
  storyboardApplySchema,
  storyboardReadSchema,
  writeShotCharacters,
  writeShotDialogue,
  writeShotIcons,
  shotIconsSchema,
  writeShotPrompt,
  shotImageRequest,
  recordShotImage,
  storySceneSchema,
  writeStoryScenes,
  writeStorySequences,
  storySequenceSchema,
  writeStoryShots,
  storyMusicSchema,
  writeStoryMusic,
  storyClicheSchema,
  writeStoryCliches,
  firstLineReading,
  openingReading,
} from '../dist/storyboard.js';
import * as storyboardImages from '../dist/storyboard.js';
import { TOOLS } from '../dist/tools.js';
import { ROUTES } from '../dist/handlers.js';
import { buildNativeImageBody } from '../dist/astra-genai-native-image.js';
import { readImageMetadata } from '../dist/image-media.js';
import editPlan from '../../skills/produce/references/edit-plan.js';
import { setupProject, png } from './workflow-fixture.mjs';
import { manageProject } from '../dist/project.js';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const dirs = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'sb-')); dirs.push(d); setupProject(d); return d; };
// storyboard/cast.json for these ids, each with identity.md and, unless voiceOnly, its face, front and back panels
// under <root>/assets/characters/<id>/.
const castFile = (dir, ids, { root = dir, voiceOnly = [] } = {}) => {
  const characters = ids.map((id) => {
    const sheet = join(root, 'assets/characters', id);
    mkdirSync(sheet, { recursive: true });
    writeFileSync(join(sheet, 'identity.md'), `# ${id}\n`);
    if (!voiceOnly.includes(id)) {
      for (const view of ['face', 'front', 'back']) writeFileSync(join(sheet, view + '.png'), png);
      writeFileSync(join(sheet, 'panels.json'), JSON.stringify({ panels: { face: { file: 'face.png' }, front: { file: 'front.png' }, back: { file: 'back.png' } } }));
    }
    return { id, source: relative(dir, join(sheet, 'identity.md')), ...(voiceOnly.includes(id) ? { voiceOnly: true } : {}) };
  });
  writeFileSync(join(dir, 'cast.json'), JSON.stringify({ characters }));
};
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
  it('shot adapter values stay typed while creative vocabulary passes through', () => {
    assert.ok(shotSchema.safeParse(board()[1]).success);
    assert.ok(shotSchema.safeParse({ ...board()[1], id: 's0007' }).success);
    assert.ok(!shotSchema.safeParse({ ...board()[1], id: 's007' }).success);
    assert.ok(shotSchema.safeParse({ ...board()[1], shot: { size: 'wide' } }).success);
    assert.ok(!shotSchema.safeParse({ ...board()[1], transition: 'push:left' }).success);
    const extra = shotSchema.safeParse({ ...board()[1], visual: { video: { engine: 'veo' } }, edit: { reason: 'x' } });
    assert.ok(extra.success && extra.data.edit.reason === 'x');
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
  it('a board records its story language once and keeps it', () => {
    const dir = tmp(), sequences = [{ id: 'q1', title: 'Opening', purpose: 'They meet' }];
    writeStorySequences({ path: dir, sequences });
    assert.equal(readBoard(dir).win.STORY.language, undefined);   // a board nobody named a language for reads as before
    writeStorySequences({ path: dir, language: 'ja', sequences });
    assert.deepEqual(readBoard(dir).win.STORY, { version: 'story-v2', authoring: 'story-first', language: 'ja', audienceSoundVersion: 1 });
    const other = writeStorySequences({ path: dir, language: 'en', sequences });
    assert.equal(readBoard(dir).win.STORY.language, 'ja');
    assert.ok(other.findings.some((f) => f.level === 'warn' && /^story_language/.test(f.what)));
    // A board written before the record existed is in the language of its shots, not of today's request.
    const old = tmp();
    writeStorySequences({ path: old, sequences: [{ id: 'q1', title: '발단', purpose: '만남' }] });
    writeStoryScenes({ path: old, scenes: [{ sequence: 'q1', no: 1, place: '숲', time: '낮', event: 'e', summary: '씬' }] });
    writeStoryShots({ path: old, shots: [{ scene: 1, summary: '샷' }] });
    const resumed = writeStorySequences({ path: old, language: 'en', sequences: [{ id: 'q1', title: '발단', purpose: '만남' }] });
    assert.equal(readBoard(old).win.STORY.language, undefined);
    assert.ok(resumed.findings.some((f) => f.level === 'warn' && /^story_language/.test(f.what)));
  });

  it('story_sequence records the opening plan, a new plan replaces it, and the read returns its reading', () => {
    const dir = tmp(), sequences = [{ id: 'q1', title: '발단', purpose: '만남' }];
    const plan = { promise: '그가 사직서를 냈다', firstFrame: 'a resignation letter lands on the desk' };
    const first = writeStorySequences(storySequenceSchema.parse({ path: dir, sequences, opening: plan }));
    assert.deepEqual(readBoard(dir).win.STORY.opening, plan);
    assert.ok(first.board.includes('opening (short-form): promise "그가 사직서를 냈다" · first frame: a resignation letter lands on the desk'));
    writeStorySequences({ path: dir, sequences, opening: { promise: 'p2', firstFrame: 'f2' } });
    writeStorySequences({ path: dir, sequences });   // a write without a plan keeps the recorded one
    assert.deepEqual(readBoard(dir).win.STORY.opening, { promise: 'p2', firstFrame: 'f2' });
    const read = readStoryboard(storyboardReadSchema.parse({ path: dir }));
    assert.deepEqual([read.opening.plan, read.opening.format, read.opening.platforms], [{ promise: 'p2', firstFrame: 'f2' }, 'shorts-9x16', []]);
    assert.throws(() => storySequenceSchema.parse({ path: dir, sequences, opening: { promise: 'p' } }));
  });

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
  it('story_scene writes the scene charge and refuses a sign the contract does not read', () => {
    const dir = tmp();
    writeStorySequences({ path: dir, sequences: [{ id: 'q1', title: '발단', purpose: '만남' }] });
    const scene = { sequence: 'q1', no: 1, place: '숲', time: '낮', event: 'e', summary: '씬', turn: '믿음이 깨진다' };
    writeStoryScenes(storySceneSchema.parse({ path: dir, scenes: [{ ...scene, charge: { open: '-', close: '--' } }] }));
    assert.deepEqual(readBoard(dir).win.STRUCTURE.scenes[0].charge, { open: '-', close: '--' });
    const direction = { openingPositions: [], emotion: 'The empty courtroom falls quiet.' };
    writeStoryScenes(storySceneSchema.parse({path:dir,scenes:[{...scene,videoDirection:direction}]}));
    writeStoryScenes({path:dir,scenes:[scene]});
    assert.deepEqual(readBoard(dir).win.STRUCTURE.scenes[0].videoDirection,direction);
    assert.equal(storySceneSchema.safeParse({ path: dir, scenes: [{ ...scene, charge: { open: '+', close: '+++' } }] }).success, false);
    assert.deepEqual(TOOLS.find((t) => t.name === 'story_scene').inputSchema.properties.scenes.items.properties.charge.properties.close.enum, ['+', '-', '++', '--']);
  });
  it('characters wait for a complete story; lines wait for the shot\'s characters', () => {
    const dir = tmp();
    writeStorySequences({ path: dir, sequences: [{ id: 'q1', title: '발단', purpose: '만남' }] });
    writeStoryScenes({ path: dir, scenes: [1, 2].map((no) => ({ sequence: 'q1', no, place: '숲', time: '낮', event: 'e', summary: '씬 ' + no })) });
    writeStoryShots({ path: dir, shots: [{ scene: 1, summary: 'a' }] });
    castFile(dir, ['mina', 'joon', 'narrator'], { voiceOnly: ['narrator'] });
    assert.throws(() => writeShotCharacters({ path: dir, shots: [{ id: 's0001', characters: ['mina'] }] }), /story_order.*scene 2 has no shot/);
    writeStoryShots({ path: dir, shots: [{ scene: 2, summary: 'b' }] });
    assert.throws(() => writeShotDialogue({ path: dir, shots: [{ id: 's0001', lines: [{ speaker: 'mina', tts: '안녕' }] }] }), /story_order/);
    assert.throws(() => writeShotCharacters({ path: dir, shots: [{ id: 's0001', characters: ['ghost'] }] }), /cast_unknown/);
    assert.throws(() => writeShotCharacters({ path: dir, shots: [{ id: 's0001', characters: ['narrator'] }] }), /cast_voice_only/);
    // A story-first board takes its cast from cast.json alone, and every entry keeps its identity and panels.
    applyStoryboard({ path: dir, draft: true, globals: { SB_DOC: { characters: [{ id: 'ghost' }] } } });
    assert.throws(() => writeShotCharacters({ path: dir, shots: [{ id: 's0001', characters: ['ghost'] }] }), /cast_unknown/);
    rmSync(join(dir, 'assets/characters/joon/identity.md'));
    assert.throws(() => writeShotCharacters({ path: dir, shots: [{ id: 's0001', characters: ['mina'] }] }), /cast_source_missing: joon/);
    assert.throws(() => writeShotDialogue({ path: dir, shots: [{ id: 's0001', lines: [{ speaker: 'mina', tts: '안녕' }] }] }), /cast_source_missing: joon/);
    castFile(dir, ['mina', 'joon', 'narrator'], { voiceOnly: ['narrator'] });
    // An older snapshot keyed by id reads the same.
    const keyed = Object.fromEntries(JSON.parse(readFileSync(join(dir, 'cast.json'), 'utf8')).characters.map(({ id, ...rest }) => [id, rest]));
    writeFileSync(join(dir, 'cast.json'), JSON.stringify({ characters: keyed }));
    writeShotCharacters({ path: dir, shots: [{ id: 's0001', characters: ['mina'] }, { id: 's0002', characters: [] }] });
    assert.throws(() => writeShotDialogue({ path: dir, shots: [{ id: 's0001', lines: [{ speaker: 'joon', tts: '야', delivery: 'on_screen' }] }] }), /story_order/);
    assert.throws(() => writeShotDialogue({ path: dir, shots: [{ id: 's0001', lines: [{ speaker: 'mina', tts: '안녕' }, { speaker: 'narrator', tts: '그날 밤.' }] }] }), /shot_speaker_limit/);
    writeShotDialogue({ path: dir, shots: [{ id: 's0001', lines: [{ speaker: 'mina', tts: '안녕' }, { speaker: 'mina', tts: '괜찮아?' }] }, { id: 's0002', lines: [{ speaker: 'narrator', tts: '그날 밤.' }] }] });
    const shot = readBoard(dir).win.SCENES[0];
    assert.deepEqual(shot.visual.character, ['mina']);
    assert.deepEqual(shot.narration.map((l) => [l.id, l.speaker, l.delivery]), [['s0001-l1', 'mina', 'on_screen'], ['s0001-l2', 'mina', 'on_screen']]);
    const recast = writeShotCharacters({ path: dir, shots: [{ id: 's0001', characters: ['joon'] }] });
    assert.equal(recast.written, true);
    assert.deepEqual(recast.findings.filter((f) => f.where === 's0001' && !f.code).map((f) => f.level), ['warn']);
    assert.deepEqual(readBoard(dir).win.SCENES[0].narration.map((l) => [l.speaker, l.delivery]), [['mina', 'off_screen'], ['mina', 'off_screen']]);
    const back = writeShotCharacters({ path: dir, shots: [{ id: 's0001', characters: ['mina'] }] });
    assert.ok(back.findings.some((f) => f.where === 's0001' && /off_screen lines/.test(f.what)));
    const bad = (patch) => applyStoryboard({ path: dir, draft: true, dryRun: true, ...patch }).findings.filter((f) => f.level === 'bad').map((f) => f.what);
    assert.match(bad({ shotsById: [{ id: 's0001', shot: { ...shot, visual: {} } }] }).join(), /story_order: lines before characters/);
    assert.match(bad({ insertShots: [{ after: 0, shots: [{ type: 'points', title: 'no story' }] }] }).join(), /story_order: no summary/);
  });
});

describe('music is decided scene by scene', () => {
  // Three scenes in one sequence whose question scene 2 answers; shots s0001 · s0002 s0003 · s0004.
  const outline = (dir = tmp()) => {
    writeStorySequences({ path: dir, sequences: [{ id: 'q1', title: '발단', purpose: '만남', question: '편지는 누가 썼나', payoff: 2 }] });
    writeStoryScenes({ path: dir, scenes: [1, 2, 3].map((no) => ({ sequence: 'q1', no, place: '숲', time: '낮', event: 'e', summary: '씬 ' + no })) });
    writeStoryShots({ path: dir, shots: [{ scene: 1, summary: 'a' }, { scene: 2, summary: 'b' }, { scene: 2, summary: 'c' }, { scene: 3, summary: 'd' }] });
    return dir;
  };
  const tension = { name: 'tension', prompt: 'low strings, 76 BPM, leaves room for speech', reason: '오해가 깊어진다' };

  it('records score or none with its reason, writes the span, and lists what is still open', () => {
    const dir = outline();
    const open = writeStoryMusic({ path: dir });
    assert.equal(open.written, false);
    assert.deepEqual(open.spotting.undecided, [1, 2, 3]);
    assert.match(open.findings.find((f) => f.where === 'music').what, /3 scene\(s\) have no music decision — 1, 2 \(payoff\), 3/);
    assert.deepEqual(readStoryboard({ path: dir, level: 'outline' }).musicSpotting.undecided, [1, 2, 3]);

    const r = writeStoryMusic(storyMusicSchema.parse({ path: dir, cues: [tension], spots: [
      { scenes: [1], decision: 'none', reason: '대사만 듣게 한다' },
      { scenes: [2, 3], decision: 'score', cue: 'tension', reason: '오해가 풀릴 때까지', sourceStartSeconds: 4, gainDb: -2 }] }));
    assert.equal(r.written, true);
    const { win } = readBoard(dir);
    assert.deepEqual(win.MUSIC.$timeline, [{ id: 'scene-2-3', cue: 'tension', start: { shotId: 's0002', atSeconds: 0 }, end: { shotId: 's0004', atSeconds: 'end' },
      sourceStartSeconds: 4, fadeInSeconds: 0.5, fadeOutSeconds: 1, gain: [{ atSeconds: 0, gainDb: -2 }] }]);
    assert.deepEqual(win.STRUCTURE.scenes.map((s) => s.music), [{ decision: 'none', reason: '대사만 듣게 한다' },
      { decision: 'score', reason: '오해가 풀릴 때까지', span: 'scene-2-3' }, { decision: 'score', reason: '오해가 풀릴 때까지', span: 'scene-2-3' }]);
    assert.deepEqual(r.spotting.undecided, []);
    assert.deepEqual(r.spotting.cues, [{ name: 'tension', source: 'generated', reason: '오해가 깊어진다' }]);

    // Spotting one scene of a shared span again takes the span away and reopens the other scene.
    const again = writeStoryMusic({ path: dir, spots: [{ scenes: [2], decision: 'none', reason: '침묵이 답이다' }] });
    assert.deepEqual(readBoard(dir).win.MUSIC.$timeline, []);
    assert.deepEqual(again.spotting.undecided, [3]);
    assert.ok(again.findings.some((f) => f.where === 'cue tension' && /no span plays this cue/.test(f.what)));
  });

  it('refuses a cue nobody defined, scenes that do not follow each other and an anchor outside the scene', () => {
    const dir = outline();
    const spot = { scenes: [2], decision: 'score', cue: 'tension', reason: 'r' };
    assert.throws(() => writeStoryMusic({ path: dir, spots: [spot] }), /a scored spot names a cue defined in cues/);
    assert.throws(() => writeStoryMusic({ path: dir, cues: [tension], spots: [{ ...spot, scenes: [1, 3] }] }), /follow each other/);
    assert.throws(() => writeStoryMusic({ path: dir, cues: [tension], spots: [{ ...spot, start: { shotId: 's0001', atSeconds: 0 } }] }), /s0001 is not a shot of scenes 2/);
    assert.throws(() => writeStoryMusic({ path: dir, spots: [{ scenes: [9], decision: 'none', reason: 'r' }] }), /story_order: scene 9/);
    assert.equal(storyMusicSchema.safeParse({ path: dir, cues: [{ ...tension, asset: 'default' }] }).success, false);
    assert.equal(readBoard(dir).win.MUSIC, undefined, 'a refused call writes nothing');
    // A hand-broken STRUCTURE: the report still answers, and a write says what is wrong instead of a TypeError.
    writeFileSync(join(dir, 'scenes.js'), 'window.STRUCTURE={version:"structure-v1",sequences:{},scenes:[null]};window.SCENES=[{id:"s0001",type:"points",scene:1}];');
    assert.deepEqual(writeStoryMusic({ path: dir }).spotting.undecided, []);
    assert.throws(() => writeStoryMusic({ path: dir, spots: [{ scenes: [1], decision: 'none', reason: 'r' }] }), /story_music: STRUCTURE\.sequences and STRUCTURE\.scenes are arrays of objects/);
  });

  it('a scene replaced through storyboard_apply keeps the music decision story_music recorded', () => {
    const dir = outline();
    writeStoryMusic(storyMusicSchema.parse({ path: dir, spots: [{ scenes: [1], decision: 'none', reason: '대사만 듣게 한다' }] }));
    applyStoryboard({ path: dir, draft: true, scenes: [{ no: 1, place: '숲', time: '밤', event: 'e', summary: '씬 1', out: '문이 닫힌다' }] });
    const first = readBoard(dir).win.STRUCTURE.scenes.find((s) => s.no === 1);
    assert.deepEqual([first.time, first.music], ['밤', { decision: 'none', reason: '대사만 듣게 한다' }]);
  });

  it('shows the channel\'s saved music direction when new music is disabled', () => {
    const root = tmp(), dir = join(root, 'drafts/storyboard');
    const ready = setupProject(root);
    const note = '2026-11-08 user: music under every shot is too much; score the turns';
    manageProject({ action: 'update', workspace: root, expectedRevision: ready.revision, request: 'Record the music feedback',
      settings: { production: { ...ready.config.production, musicDirection: [note] } } });
    mkdirSync(dir, { recursive: true });
    outline(dir);
    const r = writeStoryMusic({ path: dir, cues: [tension], spots: [{ scenes: [1, 2, 3], decision: 'score', cue: 'tension', reason: 'r' }] });
    assert.deepEqual(r.spotting.direction, [note]);
    assert.deepEqual(ready.config.models.music, { engine: 'none' });
  });
});

describe('clichés are chosen for the story and recorded on the board', () => {
  const lib = createRequire(import.meta.url)('../../skills/storyboard/references/cliches.js');
  const entries = lib.catalog().items;
  const plain = entries.find((item) => item.layer === 'device' && !item.caution && !item.quote && !item.analysis);
  const coercive = entries.find((item) => item.caution === 'coercion' && !item.analysis);
  const quoted = entries.find((item) => item.quote && !item.caution);
  // An episode board of the fixture project (video type drama) with mina in its cast.
  const episode = (root, topic) => {
    const dir = join(manageProject({ action: 'episode', workspace: root, topic }).episode, 'storyboard');
    castFile(dir, ['mina'], { root: join(root, 'data/c') });
    writeStorySequences({ path: dir, sequences: [{ id: 'q1', title: '발단', purpose: '만남' }] });
    return dir;
  };
  const recorded = (dir) => readBoard(dir).win.CLICHES;

  it('a new drama board starts undecided, takes uses with their shift and scenes, and reads none with its reason', () => {
    const root = tmp();
    setupProject(root);
    const dir = episode(root, 'e1');
    assert.deepEqual(recorded(dir), { version: 1, uses: [] });
    const open = writeStoryCliches({ path: dir });
    assert.deepEqual([open.written, open.cliches.mode, open.cliches.decision], [false, 'apply', 'undecided']);
    assert.ok(open.findings.some((f) => f.code === 'cliche_undecided'));

    // Recorded at the synopsis, before any scene exists: the name, layer and need come from the catalogue.
    const r = writeStoryCliches(storyClicheSchema.parse({ path: dir, uses: [
      { id: plain.id, shift: '숨기는 쪽이 아버지다' }, { name: '돌려받은 우산', need: 'reunion', character: 'mina' }] }));
    assert.equal(r.written, true);
    assert.deepEqual(recorded(dir).uses, [
      { id: plain.id, name: plain.name, layer: plain.layer, need: plain.needs[0], shift: '숨기는 쪽이 아버지다', basis: 'default' },
      { name: '돌려받은 우산', need: 'reunion', character: 'mina', basis: 'default' }]);
    assert.match(r.board.find((line) => line.startsWith('clichés:')), /^clichés: 2 in the story/);
    // Sent again with its scene, a use keeps its shift.
    const scene = writeStoryScenes({ path: dir, scenes: [{ sequence: 'q1', no: 1, place: '숲', time: '낮', event: 'e', summary: '씬 1' }] });
    assert.match(scene.board.find((line) => line.startsWith('clichés:')), /^clichés: 2 in the story/, 'every board write prints the decision');
    writeStoryCliches({ path: dir, uses: [{ id: plain.id, scenes: [1] }] });
    assert.deepEqual(recorded(dir).uses[0], { id: plain.id, name: plain.name, layer: plain.layer, need: plain.needs[0], shift: '숨기는 쪽이 아버지다', scenes: [1], basis: 'default' });
    assert.equal(readStoryboard({ path: dir, level: 'outline' }).cliches.decision, 'use');

    const removed = writeStoryCliches({ path: dir, remove: ['돌려받은 우산', 9999] });
    assert.equal(recorded(dir).uses.length, 1);
    assert.deepEqual(removed.findings.filter((f) => f.code === 'cliche_not_recorded').map((f) => /#9999/.test(f.what)), [true]);
    const none = writeStoryCliches({ path: dir, none: '조용한 대화 한 번이 전부라 장치가 끼어들 자리가 없다' });
    assert.deepEqual([none.cliches.decision, recorded(dir).uses.length], ['none', 0]);
    assert.match(none.board.find((line) => line.startsWith('clichés:')), /^clichés: none — 조용한 대화/);
    assert.equal(storyClicheSchema.safeParse({ path: dir, none: 'r', uses: [{ id: plain.id }] }).success, false);
  });

  it('on a type that recommends, a cliché enters the story only with the user\'s pick', () => {
    const dir = tmp();
    // The board's PRODUCTION as the episode snapshot hands it over: the type and the channel's saved choice.
    const type = (production) => { const { win, header } = readBoard(dir); writeFileSync(join(dir, 'scenes.js'), serializeBoard({ ...win, PRODUCTION: production }, header)); };
    writeStorySequences({ path: dir, language: 'en', sequences: [{ id: 'q1', title: 'Intro', purpose: 'what it is' }] });
    type({ videoType: { id: 'explainer' } });
    assert.equal(recorded(dir), undefined, 'no open record on a type that only recommends');
    assert.throws(() => writeStoryCliches({ path: dir, uses: [{ id: plain.id }] }), /cliche_user_choice: this episode recommends clichés/);
    assert.equal(recorded(dir), undefined, 'a refused call writes nothing');

    const offered = writeStoryCliches({ path: dir, uses: [{ id: plain.id, offered: true }] });
    assert.deepEqual([offered.cliches.mode, offered.cliches.decision], ['offer', 'offer']);
    // An English story takes the catalogue's English name; a recommendation carries no basis.
    assert.deepEqual(recorded(dir).uses, [{ id: plain.id, name: plain.en, layer: plain.layer, need: plain.needs[0], offered: true }]);
    assert.match(offered.board.find((line) => line.startsWith('clichés:')), /none applied, 1 offered/);

    // The user picked it. A later revision of that use needs no second pick.
    writeStoryCliches({ path: dir, uses: [{ id: plain.id }], basis: 'user' });
    assert.deepEqual([recorded(dir).uses[0].basis, recorded(dir).uses[0].offered], ['user', undefined]);
    writeStoryCliches({ path: dir, uses: [{ id: plain.id, shift: 'the one who hides it is the father' }] });
    assert.deepEqual([recorded(dir).uses[0].shift, recorded(dir).uses[0].basis], ['the one who hides it is the father', 'user']);

    // The channel's saved choice overrides the type: off refuses the same way, on applies as the user's standing pick.
    type({ videoType: { id: 'drama' }, clicheUse: 'off' });
    assert.throws(() => writeStoryCliches({ path: dir, uses: [{ name: 'a borrowed umbrella' }] }), /cliche_user_choice: the channel's saved choice/);
    type({ videoType: { id: 'explainer' }, clicheUse: 'on' });
    writeStoryCliches({ path: dir, uses: [{ name: 'a borrowed umbrella' }] });
    assert.equal(recorded(dir).uses.find((use) => use.name === 'a borrowed umbrella').basis, 'user');

    // Nor can the saved choice be turned on from the board: a PRODUCTION patch keeps the value the snapshot gave.
    type({ videoType: { id: 'explainer' } });
    const forged = applyStoryboard({ path: dir, draft: true, globals: { PRODUCTION: { videoType: { id: 'explainer' }, clicheUse: 'on' } } }, { outline: true });
    assert.deepEqual([forged.findings.some((f) => f.code === 'cliche_choice_kept'), readBoard(dir).win.PRODUCTION.clicheUse], [true, undefined]);
    assert.throws(() => writeStoryCliches({ path: dir, uses: [{ name: 'another' }] }), /cliche_user_choice/);
    // A type change for one episode stays possible, since the user may ask for it; the write says what it does to clichés.
    const retyped = applyStoryboard({ path: dir, draft: true, globals: { PRODUCTION: { videoType: { id: 'drama' } } } }, { outline: true });
    assert.deepEqual([retyped.findings.some((f) => f.code === 'cliche_mode_changed'), writeStoryCliches({ path: dir }).cliches.mode], [true, 'apply']);
    // A change that leaves the mode alone says nothing.
    const same = applyStoryboard({ path: dir, draft: true, globals: { PRODUCTION: { videoType: { id: 'comedy' } } } }, { outline: true });
    assert.equal(same.findings.some((f) => f.code === 'cliche_mode_changed'), false);
    type({ videoType: { id: 'explainer' } });

    // storyboard_apply cannot put an applied use on the board: story_cliche owns the record. The block carried unchanged passes.
    const before = recorded(dir);
    assert.throws(() => applyStoryboard({ path: dir, draft: true, globals: { CLICHES: { version: 1, uses: [{ id: plain.id, name: 'unpicked' }] } } }, { outline: true }), /cliche_record/);
    assert.equal(applyStoryboard({ path: dir, draft: true, globals: { CLICHES: { uses: before.uses, version: before.version } } }, { outline: true }).written, true);
    assert.deepEqual(recorded(dir), before);
    // A hand-edited file is not refused, so it is reported: the use with no pick is named by the tool and by every board write.
    const file = join(dir, 'scenes.js');
    writeFileSync(file, readFileSync(file, 'utf8') + `window.CLICHES = ${JSON.stringify({ version: 1, uses: [{ id: plain.id, name: 'hand edit' }] })};\n`);
    assert.deepEqual(writeStoryCliches({ path: dir }).findings.filter((f) => f.code === 'cliche_unpicked').map((f) => f.where), [`#${plain.id} hand edit`]);
    assert.match(applyStoryboard({ path: dir, draft: true, globals: { THEME: { accent: '#123456' } } }, { outline: true }).board.join('\n'), /is in the story without the user's pick/);
  });

  it('warns about caution entries, quoted lines and a repeat on the channel, and refuses only input it cannot use', () => {
    const root = tmp();
    setupProject(root);
    const first = episode(root, 'e1'), second = episode(root, 'e2');
    writeStoryCliches({ path: first, uses: [{ id: plain.id }] });
    const r = writeStoryCliches({ path: second, uses: [{ id: plain.id }, { id: coercive.id }, { id: quoted.id, offered: true }] });
    const codes = (result) => result.findings.filter((f) => f.level === 'warn' && f.code?.startsWith('cliche_')).map((f) => `${f.code} ${f.where}`);
    assert.equal(r.written, true, 'a warning never stops the write');
    assert.deepEqual(codes(r), [`cliche_caution #${coercive.id} ${coercive.name}`, `cliche_quote #${quoted.id} ${quoted.name}`, `cliche_repeat #${plain.id} ${plain.name}`]);
    assert.deepEqual(recorded(second).uses.map((use) => [use.caution, use.quote]), [[undefined, undefined], ['coercion', undefined], [undefined, true]]);

    assert.throws(() => writeStoryCliches({ path: second, uses: [{ id: 99999 }] }), /cliche_unknown: the catalogue has no entry #99999/);
    assert.throws(() => writeStoryCliches({ path: second, uses: [{ id: plain.id, scenes: [9] }] }), /story_order: scene 9 does not exist/);
    assert.throws(() => writeStoryCliches({ path: second, uses: [{ id: plain.id, need: 'fame' }] }), /cliche_need: "fame" is not a need/);
    assert.throws(() => writeStoryCliches({ path: second, uses: [{ id: plain.id, character: 'nobody' }] }), /cliche_character: nobody is not in storyboard\/cast\.json/);
    assert.equal(storyClicheSchema.safeParse({ path: second, uses: [{ shift: 'no id and no name' }] }).success, false);
    // A catalogue number given as a name would sit beside the same entry by id; blank text is no name. A direct call is parsed too.
    for (const name of [`#${plain.id}`, `＃${plain.id}`, '#٥', 'bell\u0007', 'flip\u202e', 'next\u0085line', 'x'.repeat(121), '\u3164', '\u2800\u2800', 'soft\u00adhyphen', 'two\u2028lines'])
      assert.equal(storyClicheSchema.safeParse({ path: second, uses: [{ name }] }).success, false, JSON.stringify(name));
    for (const name of ['傘を返す', 'Chiếc ô trả lại', '#5번 약속', '"우산" — 돌려받은 것', '👨‍👩‍👧 가족 식사'])
      assert.equal(storyClicheSchema.safeParse({ path: second, uses: [{ name }] }).success, true, name);
    assert.equal(storyClicheSchema.safeParse({ path: second, uses: [{ id: plain.id, shift: 'x'.repeat(301) }] }).success, false);
    assert.throws(() => writeStoryCliches({ path: second, uses: [{ name: '   ' }] }));
    assert.equal(recorded(second).uses.length, 3, 'a refused call writes nothing');

    // A name that spells a catalogue entry is recorded as that entry, so its caution is still read.
    const byName = writeStoryCliches({ path: second, uses: [{ name: coercive.en.toUpperCase(), offered: true }] });
    assert.deepEqual(codes(byName).filter((code) => code.startsWith('cliche_matched')).length, 1);
    assert.equal(recorded(second).uses.filter((use) => use.id === coercive.id).length, 1, 'the same entry, not a second one');
    // Entries a hand edit left unreadable are counted before a write drops them.
    const file = join(second, 'scenes.js'), text = readFileSync(file, 'utf8');
    writeFileSync(file, text + `window.CLICHES = ${JSON.stringify({ version: 1, uses: [{ id: plain.id, name: plain.name, basis: 'default' }, null, 'loose text'] })};\n`);
    assert.deepEqual(codes(writeStoryCliches({ path: second })).filter((code) => code.startsWith('cliche_unreadable')), ['cliche_unreadable clichés']);
    // A use a hand edit recorded by a catalogue name alone is carried into the id entry, and that name removes it.
    writeFileSync(file, text + `window.CLICHES = ${JSON.stringify({ version: 1, uses: [{ name: quoted.name, shift: 'keep me', offered: true }] })};\n`);
    writeStoryCliches({ path: second, uses: [{ name: quoted.name, offered: true }] });
    assert.deepEqual(recorded(second).uses.map((use) => [use.id, use.shift]), [[quoted.id, 'keep me']]);
    assert.deepEqual(codes(writeStoryCliches({ path: second, remove: [quoted.en] })).filter((code) => code.startsWith('cliche_not_recorded')), []);
    assert.equal(recorded(second).uses.length, 0);
    writeFileSync(file, text);

    // A scene removed later leaves a reference the report and the digest name.
    writeStoryScenes({ path: second, scenes: [{ sequence: 'q1', no: 1, place: '숲', time: '낮', event: 'e', summary: '씬 1' }] });
    writeStoryCliches({ path: second, uses: [{ id: plain.id, scenes: [1] }] });
    const gone = applyStoryboard({ path: second, draft: true, removeScenes: [1] }, { outline: true });
    assert.match(gone.board.join('\n'), /names scene 1, which is not on the board/);
    assert.ok(writeStoryCliches({ path: second }).findings.some((f) => f.code === 'cliche_scene_missing' && /scene 1/.test(f.what)));
  });
});

describe('icon attributes come after every shot\'s characters', () => {
  // A story-first board with two shots in one scene and mina in the cast.
  const storyBoard = () => {
    const dir = tmp();
    writeStorySequences({ path: dir, sequences: [{ id: 'q1', title: '발단', purpose: '만남' }] });
    writeStoryScenes({ path: dir, scenes: [{ sequence: 'q1', no: 1, place: '숲', time: '낮', event: 'e', summary: '씬' }] });
    writeStoryShots({ path: dir, shots: [{ scene: 1, summary: 'a' }, { scene: 1, summary: 'b' }] });
    castFile(dir, ['mina']);
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
  it('speed, rack focus subjects and a still hold land where the prompts and the renderer read them; a 9:16 board gets vertical notes', () => {
    const dir = storyBoard();
    writeShotCharacters({ path: dir, shots: [{ id: 's0001', characters: ['mina'] }, { id: 's0002', characters: [] }] });
    const tall = writeShotIcons({ path: dir, shots: [
      { id: 's0001', render: { mode: 'generated_video', reason: 'r' }, size: 'ls', move: { id: 'camera.side-tracking', reason: 'r', speed: 'slow', target: 'Mina' },
        focus: { id: 'camera.rack-focus', reason: 'r', from: 'the key', to: 'Mina' } },
      { id: 's0002', render: { mode: 'still_camera', reason: 'r' }, move: { id: 'hold', reason: 'the line lands', speed: 'slow' } },
    ] });
    const [video, still] = readBoard(dir).win.SCENES;
    assert.equal(video.visual.camera.speed, 'slow');
    assert.deepEqual(video.shot.techniques.find((t) => t.id === 'camera.rack-focus'), { id: 'camera.rack-focus', reason: 'r', from: 'the key', to: 'Mina' });
    assert.deepEqual([still.shot.render.camera.effect, still.visual.camera.speed], ['hold', 'slow']);
    assert.deepEqual(still.shot.render.motionIntent, { type: 'intentional_still', reason: 'the line lands' });
    // the vertical notes come back as warnings, one per chosen value that has one
    const notes = (r) => r.findings.filter((f) => f.level === 'warn' && f.what.startsWith('9:16 note')).map((f) => [f.where, f.what.match(/^9:16 note, ([^:]+):/)[1]]);
    assert.deepEqual(notes(tall), [['s0001', 'size ls'], ['s0001', 'move camera.side-tracking']]);
    assert.ok(!tall.findings.some((f) => /names no subjects/.test(f.what)));
    assert.throws(() => writeShotIcons({ path: dir, shots: [{ id: 's0001', move: { id: 'camera.dolly-in', reason: 'r', speed: 'very slow' } }] }), /speed is slow, steady, fast/);
    assert.throws(() => writeShotIcons({ path: dir, shots: [{ id: 's0002', move: { id: 'push', reason: 'r', speed: 'steady' } }] }), /speed is very slow, slow, fast, very fast/);
    // the prompts quote a video move's target and the focus subjects, so another language is refused up front
    assert.throws(() => writeShotIcons({ path: dir, shots: [{ id: 's0001', move: { id: 'camera.dolly-in', reason: 'r', target: '문' } }] }), /video_prompt_language: shot_icons s0001 move.target/);
    assert.throws(() => writeShotIcons({ path: dir, shots: [{ id: 's0001', focus: { id: 'camera.rack-focus', reason: 'r', from: '열쇠', to: 'Mina' } }] }), /focus.from/);
    assert.equal(writeShotIcons({ path: dir, shots: [{ id: 's0002', move: { id: 'hold', reason: 'the line lands', target: '편지' } }] }).written, true);
    // a still cut racks focus with its own effect, not a focus technique beside it
    assert.throws(() => writeShotIcons({ path: dir, shots: [{ id: 's0002', focus: { id: 'camera.rack-focus', reason: 'r', from: 'the key', to: 'Mina' } }] }), /still_camera cut moves its focus with the still effect/);
    // another effect drops the hold's intentional still
    writeShotIcons({ path: dir, shots: [{ id: 's0002', move: { id: 'push', reason: 'settle in' } }] });
    assert.equal(readBoard(dir).win.SCENES[1].shot.render.motionIntent, undefined);
    // a 16:9 board gets no vertical notes; a rack focus without its subjects is reported, not refused
    applyStoryboard({ path: dir, draft: true, globals: { FORMAT: 'youtube-long-16x9' } });
    const wide = writeShotIcons({ path: dir, shots: [{ id: 's0001', size: 'ls', focus: { id: 'camera.rack-focus', reason: 'r' } }] });
    assert.deepEqual([wide.written, notes(wide)], [true, []]);
    assert.ok(wide.findings.some((f) => f.level === 'warn' && f.where === 's0001' && /camera.rack-focus names no subjects/.test(f.what)));
  });
  it('beat accents ride on the move: set, replaced and removed without touching it, refused on a still cut', () => {
    const dir = storyBoard();
    writeShotCharacters({ path: dir, shots: [{ id: 's0001', characters: ['mina'] }, { id: 's0002', characters: [] }] });
    const set = writeShotIcons({ path: dir, shots: [
      { id: 's0001', render: { mode: 'generated_video', reason: 'r' }, move: { id: 'camera.static', reason: 'the frame she falls into' },
        accents: [{ id: 'camera.impact-shake', reason: 'the landing has weight', on: 'the landing' }, { id: 'camera.speed-ramp', reason: 'r' }] },
      { id: 's0002', render: { mode: 'still_camera', reason: 'r' } },
    ] });
    assert.deepEqual(readBoard(dir).win.SCENES[0].shot.techniques, [{ id: 'camera.static', reason: 'the frame she falls into' },
      { id: 'camera.impact-shake', reason: 'the landing has weight', on: 'the landing' }, { id: 'camera.speed-ramp', reason: 'r' }]);
    // an accent without its moment is reported, not refused
    assert.deepEqual(set.findings.filter((f) => /names no moment/.test(f.what)).map((f) => [f.level, f.where]), [['warn', 's0001']]);
    writeShotIcons({ path: dir, shots: [{ id: 's0001', move: { id: 'camera.crash-zoom', reason: 'the lens lights up', target: 'the drone lens' }, accents: [] }] });
    const snapped = readBoard(dir).win.SCENES[0];
    assert.deepEqual(snapped.shot.techniques.map((t) => t.id), ['camera.crash-zoom']);
    assert.deepEqual(snapped.visual.camera, { movement: 'zoom in crash', speed: 'fast', target: 'the drone lens' });
    assert.throws(() => writeShotIcons({ path: dir, shots: [{ id: 's0001', accents: [{ id: 'camera.dolly-in', reason: 'r' }] }] }), /not a beat accent/);
    assert.throws(() => writeShotIcons({ path: dir, shots: [{ id: 's0001', accents: [{ id: 'camera.speed-ramp', reason: 'r', on: '발차기' }] }] }), /video_prompt_language: shot_icons s0001 accents.on/);
    assert.throws(() => writeShotIcons({ path: dir, shots: [{ id: 's0002', accents: [{ id: 'camera.speed-ramp', reason: 'r' }] }] }), /still_camera cut takes no beat accent/);
  });
  it('next writes the join into the following shot, where the builder reads it', () => {
    const dir = storyBoard();
    writeShotCharacters({ path: dir, shots: [{ id: 's0001', characters: ['mina'] }, { id: 's0002', characters: [] }] });
    writeShotIcons({ path: dir, shots: [{ id: 's0001', next: { transition: 'whip:l2r', transitionSeconds: .3, reason: 'the answer is outside', continuity: 'her glance' } }] });
    const [first, second] = readBoard(dir).win.SCENES;
    assert.equal(first.transition, undefined);
    assert.deepEqual([second.transition, second.edit], ['whip:l2r', { reason: 'the answer is outside', transitionSeconds: .3, continuity: 'her glance' }]);
    writeShotIcons({ path: dir, shots: [{ id: 's0001', next: { transition: 'dip', reason: 'night falls' } }] });
    assert.deepEqual([readBoard(dir).win.SCENES[1].transition, readBoard(dir).win.SCENES[1].edit.transitionSeconds], ['dip', undefined]);
    assert.throws(() => writeShotIcons({ path: dir, shots: [{ id: 's0002', next: { transition: 'cut', reason: 'r' } }] }), /last shot has no next shot/);
    assert.throws(() => shotIconsSchema.parse({ path: dir, shots: [{ id: 's0001', next: { transition: 'cut', transitionSeconds: .2, reason: 'r' } }] }), /cut and dip do not accept transitionSeconds/);
  });
  it('board writes copy the cast identity, so the sheet height and name reach the board', () => {
    const dir = storyBoard();
    const f = (value) => ({ status: 'confirmed', value });
    const character = { schemaVersion: 1, version: 1, physical: { heightCm: f(160) },
      identity: { gender: f('female'), species: f('human'), age: f('20s'), role: f('lead'), summary: f('a young archer') } };
    writeFileSync(join(dir, 'assets/characters/mina/identity.md'), `# Mina\n\n\`\`\`json\n${JSON.stringify({ character })}\n\`\`\`\n`);
    writeShotCharacters({ path: dir, shots: [{ id: 's0001', characters: ['mina'] }] });
    const entry = readBoard(dir).win.SB_DOC.characters.find((c) => c.id === 'mina');
    assert.deepEqual([entry.name, entry.character.physical.heightCm.value, Object.keys(entry.panels).sort()], ['Mina', 160, ['back', 'face', 'front']]);
  });
  it('a shot that gets a new predecessor loses the join written for the old one', () => {
    const dir = storyBoard();
    writeShotCharacters({ path: dir, shots: [{ id: 's0001', characters: ['mina'] }, { id: 's0002', characters: [] }] });
    writeShotIcons({ path: dir, shots: [{ id: 's0001', next: { transition: 'whip:l2r', transitionSeconds: .3, reason: 'the answer is outside' } }] });
    // A new shot between the two: s0002's whip was the cut out of s0001, not out of the new shot.
    const r = applyStoryboard({ path: dir, draft: true, insertShots: [{ after: 1, shots: [{ type: 'points', scene: 1, summary: 'n' }] }] });
    const moved = readBoard(dir).win.SCENES.find((s) => s.id === 's0002');
    assert.deepEqual([moved.transition, moved.edit], [undefined, undefined]);
    assert.ok(r.findings.some((f) => f.level === 'warn' && f.where === 's0002' && /join \(whip:l2r\) was cleared/.test(f.what)));
    // A join set in the same patch stays.
    const kept = applyStoryboard({ path: dir, draft: true, removeShotIds: ['s0003'], transitions: [{ no: 2, transition: 'dip', reason: 'night' }] });
    assert.equal(kept.written, true);
    assert.equal(readBoard(dir).win.SCENES[1].transition, 'dip');
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
    const start = () => writeStorySequences({ path: dir, sequences: [{ id: 'q1', title: '발단', purpose: '만남' }] });
    assert.throws(start, /cast_required/);
    writeFileSync(join(dir, 'scenes.js'), 'window.SCENES = [];\n');   // a hand-made empty board waits for the cast too
    assert.throws(start, /cast_required/);
    rmSync(join(dir, 'scenes.js'));
    castFile(dir, ['mina', 'narrator'], { root: join(root, 'data/c'), voiceOnly: ['narrator'] });
    rmSync(join(root, 'data/c/assets/characters/mina/back.png'));
    assert.throws(start, /character_panel_missing: mina has no back sheet panel/);
    writeFileSync(join(dir, 'cast.json'), JSON.stringify({ characters: [{ id: 'mina', source: '../../../assets/characters/narrator/identity.md' }] }));
    assert.throws(start, /cast_source_missing: mina/);
    castFile(dir, ['mina', 'narrator'], { root: join(root, 'data/c'), voiceOnly: ['narrator'] });
    assert.equal(start().written, true);
    rmSync(join(root, 'data/c/assets/characters/mina/face.png'));
    assert.throws(() => writeStoryScenes({ path: dir, scenes: [{ sequence: 'q1', no: 1, place: '숲', time: '낮', event: 'e', summary: '씬' }] }), /character_panel_missing: mina has no face/);
  });
  it('direct story writes wait for the target project even inside a ready parent workspace', () => {
    const parent = tmp(), root = join(parent, 'another project');
    const board = join(root, 'data/c/episodes/test/storyboard');
    const write = () => writeStorySequences({ path: board, sequences: [{ id: 'opening', title: 'Opening', purpose: 'Introduce the guide' }] });
    assert.throws(write, /project_setup_required: workspace/);
    assert.throws(() => readFileSync(root), { code: 'ENOENT' });
    mkdirSync(board, { recursive: true });
    castFile(board, ['guide'], { root: join(root, 'data/c'), voiceOnly: ['guide'] });
    assert.throws(write, /project_setup_required/);
    const source = join(parent, 'scenes.js');
    writeFileSync(source, 'window.SCENES = [];\n');
    const link = join(board, 'scenes.js');
    symlinkSync(source, link);
    assert.throws(write, /project_setup_required/);
    assert.throws(() => applyStoryboard({ path: link, draft: true, globals: { FORMAT: 'shorts-9x16' } }), /project_setup_required/);
    rmSync(link);
    manageProject({ action: 'select', workspace: root, request: 'Use another project' });
    assert.throws(write, /models\.image/);
    assert.throws(() => readFileSync(join(board, 'scenes.js')), { code: 'ENOENT' });
    const ready = setupProject(root);
    assert.equal(write().written, true);
    const captured = JSON.parse(readFileSync(join(board, '../.work/model-settings.json')));
    assert.equal(captured.config.workspace, ready.workspace);
    assert.deepEqual(readBoard(board).win.PRODUCTION.modelSettings.models, captured.config.models);
    const prior = readFileSync(join(board, 'scenes.js'));
    rmSync(join(root, '.social-flow/models.json'));
    assert.throws(write, /project_setup_required/);
    assert.deepEqual(readFileSync(join(board, 'scenes.js')), prior);
  });
  it('a story-first board inside an episode starts on the canvas and production its snapshot hands off', () => {
    const root = tmp();
    const ready = setupProject(root);
    const sns = { ...ready.config.sns, instagram: { ...ready.config.sns.instagram, enabled: true, status: 'pending' } };
    manageProject({ action: 'update', workspace: root, expectedRevision: ready.revision, request: 'Plan Reels for this episode', settings: { sns } });
    const dir = join(manageProject({ action: 'episode', workspace: root, topic: 'e1' }).episode, 'storyboard');
    castFile(dir, ['mina'], { root: join(root, 'data/c') });
    const started = writeStorySequences({ path: dir, sequences: [{ id: 'q1', title: '발단', purpose: '만남' }] });
    assert.match(started.board.find((l) => l.startsWith('opening (')), /^opening \(short-form · Reels: skip rate counts the first 3 s\): no plan/);
    const { win } = readBoard(dir);
    assert.deepEqual([win.FORMAT, win.PRODUCTION?.mode, win.STORY.authoring], ['shorts-9x16', 'video_50', 'story-first']);
    // The saved languages.speech becomes the next board's story language.
    const { revision } = manageProject({ action: 'status', workspace: root });
    manageProject({ action: 'update', workspace: root, expectedRevision: revision, request: 'Vietnamese stories', settings: { languages: { speech: 'vi', subtitles: [], review: [] } } });
    const next = join(manageProject({ action: 'episode', workspace: root, topic: 'e2' }).episode, 'storyboard');
    castFile(next, ['mina'], { root: join(root, 'data/c') });
    writeStorySequences({ path: next, sequences: [{ id: 'q1', title: 'Mở đầu', purpose: 'Gặp nhau' }] });
    assert.equal(readBoard(next).win.STORY.language, 'vi');
  });
});

describe('images and the video prompt follow the icon attributes', () => {
  // A project whose episode board has an MSR shot and a first_last shot with mina, her sheet panels and a room.
  const pictureBoard = () => {
    const root = tmp(), dir = join(root, 'data/c/episodes/e/storyboard'), sheet = join(root, 'data/c/assets/characters/mina');
    mkdirSync(sheet, { recursive: true }); mkdirSync(join(dir, 'places'), { recursive: true });
    for (const name of ['face', 'body', 'back']) writeFileSync(join(sheet, name + '.png'), png);
    writeFileSync(join(sheet, 'panels.json'), JSON.stringify({ panels: { face: { file: 'face.png' }, front: { file: 'body.png' }, back: { file: 'back.png' } } }));
    writeFileSync(join(sheet, 'identity.md'), '# mina\n');
    writeFileSync(join(dir, 'cast.json'), JSON.stringify({ characters: [{ id: 'mina', source: '../../../assets/characters/mina/identity.md' }] }));
    writeFileSync(join(dir, 'places/room.png'), png);
    writeFileSync(join(dir, 'places/key.png'), png);
    writeStorySequences({ path: dir, sequences: [{ id: 'q1', title: '발단', purpose: '만남' }] });
    writeStoryScenes({ path: dir, scenes: [{ sequence: 'q1', no: 1, place: '방', time: '밤', event: 'e', summary: '씬' }] });
    writeStoryShots({ path: dir, shots: [{ scene: 1, summary: 'a' }, { scene: 1, summary: 'b' }] });
    applyStoryboard({ path: dir, draft: true, expectedSha256: readBoard(dir).sha256, globals: { SB_DOC: { locations: [{ id: 'room', name: '방', imageUrl: 'places/room.png' }],
      props: [{ id: 'key', name: '열쇠', imageUrl: 'places/key.png' }] } } });
    writeShotCharacters({ path: dir, shots: [{ id: 's0001', characters: ['mina'] }, { id: 's0002', characters: ['mina'] }] });
    writeShotDialogue({ path: dir, shots: [{ id: 's0002', lines: [{ speaker: 'mina', tts: '안녕' }] }] });
    return { root, dir };
  };
  const chooseEpisodeImage = (dir, image, request) => {
    const production = readBoard(dir).win.PRODUCTION;
    const models = production.modelSettings;
    const changes = [...(models.overrides ?? []), { scope: 'episode', image, request }];
    applyStoryboard({ path: dir, draft: true, globals: {
      PRODUCTION: { ...production, modelSettings: { ...models, overrides: changes } },
    } });
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
  it('separates face clothing from outfit references and describes confirmed relative height without flattening poses', () => {
    const { root, dir } = pictureBoard(); icons(dir);
    const sheet = join(root, 'data/c/assets/characters');
    mkdirSync(join(sheet, 'ally'));
    for (const name of ['face', 'body', 'back']) writeFileSync(join(sheet, 'ally', name + '.png'), png);
    writeFileSync(join(sheet, 'ally/panels.json'), readFileSync(join(sheet, 'mina/panels.json')));
    for (const [id, height] of [['mina', 190], ['ally', 178]])
      writeFileSync(join(sheet, id, 'identity.md'), '# ' + id + '\n```json\n' + JSON.stringify({ character: { schemaVersion: 1, version: 1, physical: { heightCm: { status: 'confirmed', value: height } },
        identity: { gender: { status: 'confirmed', value: 'male' }, species: { status: 'confirmed', value: 'human' }, age: { status: 'confirmed', value: '20s' }, role: { status: 'confirmed', value: 'lead' }, summary: { status: 'confirmed', value: 'a student' } } } }) + '\n```');
    writeFileSync(join(dir, 'cast.json'), JSON.stringify({ characters: ['mina', 'ally'].map(id => ({ id, source: '../../../assets/characters/' + id + '/identity.md' })) }));
    writeShotCharacters({ path: dir, shots: [{ id: 's0001', characters: ['mina', 'ally'] }] });
    const request = shotImageRequest({ path: dir, id: 's0001', frame: 'start', prompt: 'Mina stands beside seated Ally.' });
    assert.match(request.prompt, /12 cm taller than ally \(height ratio 1.067\)/);
    assert.match(request.prompt, /do not equalize head levels or compare seated and standing head heights/);
    assert.match(request.prompt, /ignore clothing in this panel/);
    assert.match(request.prompt, /including collar, tie and sleeve state/);
  });
  it('draws a bystander and extras into the start image, keeps them out of the video references and prints the board first', () => {
    const { root, dir } = pictureBoard();
    const sheet = join(root, 'data/c/assets/characters');
    mkdirSync(join(sheet, 'ally'));
    for (const name of ['face', 'body', 'back']) writeFileSync(join(sheet, 'ally', name + '.png'), png);
    writeFileSync(join(sheet, 'ally/panels.json'), readFileSync(join(sheet, 'mina/panels.json')));
    writeFileSync(join(sheet, 'ally/identity.md'), '# ally\n');
    writeFileSync(join(dir, 'cast.json'), JSON.stringify({ characters: ['mina', 'ally'].map(id => ({ id, source: '../../../assets/characters/' + id + '/identity.md' })) }));
    const set = (shot) => writeShotCharacters({ path: dir, shots: [{ id: 's0001', characters: ['mina'], ...shot }] });
    assert.throws(() => set({ bystanders: ['mina'] }), /shot_bystander_listed/);
    assert.throws(() => set({ characters: ['mina', 'ally'], bystanders: ['x', 'y'] }), /character_limit/);
    assert.throws(() => set({ extras: '아이들 넷' }), /image_prompt_language/);
    assert.throws(() => writeShotCharacters({ path: dir, shots: [{ id: 's0002', characters: ['ally'], bystanders: ['mina'] }] }), /shot_bystander_speaks/);
    set({ bystanders: ['ally'], extras: 'four children in orange bibs chase a ball', expression: { ally: 'arms folded, watching' } });
    set({});   // a later call keeps both
    const printed = storyboardImages.renderApply(icons(dir));
    assert.match(printed, /Board as written[^\n]*\n  2 shots — on screen: one 1 · two 1 · with extras 1[\s\S]*sizes ms 1 · mcu 1[\s\S]*Findings:/);
    const request = shotImageRequest({ path: dir, id: 's0001', frame: 'start', prompt: 'Mina waits by the window while Ally watches from the door.' });
    assert.deepEqual(request.refs.filter(ref => ref.role === 'bystander').map(ref => [ref.id, ref.use]), [['s0001-ally-face', 'image'], ['s0001-ally-front', 'image']]);
    assert.match(request.prompt, /Also in this frame, without a line: ally, drawn from the reference images/);
    assert.match(request.prompt, /Unnamed people in the frame, drawn without a reference: four children in orange bibs chase a ball\./);
    assert.match(request.prompt, /ally: arms folded, watching/);
    assert.deepEqual(readBoard(dir).win.SCENES[0].visual.character, ['mina'], 'the video call still references the one character');
    set({ bystanders: [], extras: '' });
    assert.deepEqual([readBoard(dir).win.SCENES[0].visual.bystanders, readBoard(dir).win.SCENES[0].visual.extras], [undefined, undefined]);
    // The same note on several shots prints once.
    assert.equal(storyboardImages.renderFindings([{ level: 'warn', where: 's0001', what: 'x' }, { level: 'warn', where: 's0002', what: 'x' }]), '  · s0001, s0002 x');
  });
  it('puts each character\'s shot expression into the image prompt and reports a face without one', () => {
    const { dir } = pictureBoard(); icons(dir);
    const set = (shot) => writeShotCharacters({ path: dir, shots: [{ id: 's0001', characters: ['mina'], ...shot }] });
    assert.throws(() => set({ expression: { ghost: 'brows drawn together' } }), /shot_expression_unknown/);
    assert.throws(() => set({ expression: { mina: '찡그린 눈썹' } }), /image_prompt_language/);
    const args = { path: dir, id: 's0001', frame: 'start', prompt: 'Mina waits by the window.' };
    assert.ok(shotImageRequest(args).warnings.some(w => w.code === 'expression_missing'));
    set({ expression: { mina: 'brows drawn together, lips pressed shut' } });
    set({});   // a later call without expression keeps it
    const request = shotImageRequest(args);
    assert.match(request.prompt, /Expressions in this frame: mina: brows drawn together, lips pressed shut\./);
    assert.doesNotMatch(request.prompt, /smile/);
    assert.equal(request.warnings.some(w => w.code === 'expression_missing'), false);
    writeShotCharacters({ path: dir, shots: [{ id: 's0001', characters: [] }] });
    assert.equal(readBoard(dir).win.SCENES[0].visual.expression, undefined, 'a character who leaves takes the state along');
  });
  it('tracks physical opening, performance and prompt changes without certifying inherited images', () => {
    const { dir } = pictureBoard(); icons(dir); make(dir, 's0001');
    const status = () => readStoryboard(storyboardReadSchema.parse({ path: dir, includeTechniques: false })).imageFraming[0];
    assert.equal(status().status, 'current');
    for (const change of [
      s => { s.shot.videoDesign = { before: 'Left hand holds the guard', after: 'Left hand releases' }; },
      s => { s.visual.action = 'She turns before he arrives'; },
      s => { s.performance = [{ kind: 'action', character: 'mina', text: 'She kneels', durationSeconds: 2 }]; },
      s => { s.visual.bgPrompt = 'A contradictory revised opening'; },
    ]) {
      const s = readBoard(dir).win.SCENES[0], image = s.visual.frames.start;
      change(s); applyStoryboard({ path: dir, shotsById: [{ id: s.id, shot: s }] });
      assert.equal(status().status, 'stale');
      assert.equal(readBoard(dir).win.SCENES[0].visual.frames.start, image);
      make(dir, 's0001'); assert.equal(status().status, 'current');
    }
    const s = readBoard(dir).win.SCENES[0];
    delete s.visual.frames.startPromptSha256;
    applyStoryboard({ path: dir, shotsById: [{ id: s.id, shot: s }] });
    assert.equal(status().status, 'unknown');
  });
  it('does not replace a usable start/end pair with an absent or invalid generated output', () => {
    const { dir } = pictureBoard(); icons(dir);
    make(dir, 's0002'); make(dir, 's0002', 'end');
    const before = readFileSync(join(dir, 'scenes.js'), 'utf8');
    const args = { path: dir, id: 's0002', frame: 'start', prompt: 'Mina returns.' };
    const request = shotImageRequest(args);
    assert.throws(() => recordShotImage(args, request), /shot_image_output_missing/);
    assert.equal(readFileSync(join(dir, 'scenes.js'), 'utf8'), before);
    writeFileSync(request.file, 'not an image');
    assert.throws(() => recordShotImage(args, request), /image_invalid/);
    assert.equal(readFileSync(join(dir, 'scenes.js'), 'utf8'), before);
  });
  it('reserves distinct host requests and completes exactly the saved output without another generation', () => {
    const { dir } = pictureBoard(); icons(dir);
    make(dir, 's0002'); make(dir, 's0002', 'end');
    const before = readFileSync(join(dir, 'scenes.js'), 'utf8');
    const args = { path: dir, id: 's0002', frame: 'start', prompt: 'Mina returns.' };
    const request = shotImageRequest(args);
    storyboardImages.deferShotImage(args, request);
    const next = shotImageRequest(args);
    storyboardImages.deferShotImage(args, next);
    assert.notEqual(next.file, request.file);
    assert.equal(readFileSync(join(dir, 'scenes.js'), 'utf8'), before);
    const complete = { path: dir, id: args.id, frame: args.frame, action: 'complete', requestId: request.requestId };
    assert.throws(() => storyboardImages.completeShotImage(complete), /shot_image_output_missing/);
    writeFileSync(request.file, png);
    assert.equal(storyboardImages.completeShotImage(complete).written, true);
    const shot = readBoard(dir).win.SCENES[1];
    assert.equal(shot.visual.frames.start, relative(dir, request.file));
    assert.equal(shot.visual.frames.end, undefined);
    assert.equal(shot.visual.frames.startBasis, request.startBasis);
    assert.throws(() => storyboardImages.completeShotImage(complete), /already_completed/);
    writeFileSync(next.file, png);
    assert.throws(() => storyboardImages.completeShotImage({ ...complete, requestId: next.requestId }), /request_stale/);
  });
  it('the host route preserves active frames and completes without generation options', async () => {
    const { dir } = pictureBoard(); icons(dir);
    make(dir, 's0001');
    const before = readFileSync(join(dir, 'scenes.js'), 'utf8');
    const args = { path: dir, id: 's0001', prompt: 'Mina waits by the window.' };
    const response = await ROUTES.shot_image(args);
    assert.equal(response.isError, false);
    const text = response.content[0].text;
    const requestId = /Pending host request: ([^;]+)/.exec(text)[1];
    assert.equal(readFileSync(join(dir, 'scenes.js'), 'utf8'), before);
    writeFileSync(join(dir, 'images', requestId + '.png'), png);
    // An unrelated asset change must not discard this valid pending output.
    const doc = readBoard(dir).win.SB_DOC;
    applyStoryboard({ path: dir, draft: true, globals: { SB_DOC: { ...doc, locations: [...doc.locations, { id: 'elsewhere', name: 'Other' }] } } });
    const completed = await ROUTES.shot_image({ path: dir, id: args.id, action: 'complete', requestId });
    assert.equal(completed.isError, false);
    assert.equal(readBoard(dir).win.SCENES[0].visual.frames.start, 'images/' + requestId + '.png');
  });
  it('refuses host completion after a plan or reference changes without relabelling its framing', () => {
    const { dir } = pictureBoard(); icons(dir);
    const args = { path: dir, id: 's0001', frame: 'start', prompt: 'Mina waits.' };
    const request = shotImageRequest(args);
    storyboardImages.deferShotImage(args, request); writeFileSync(request.file, png);
    writeShotIcons({ path: dir, shots: [{ id: args.id, size: 'cu' }] });
    const complete = { path: dir, id: args.id, frame: args.frame, action: 'complete', requestId: request.requestId };
    assert.throws(() => storyboardImages.completeShotImage(complete), /request_stale/);
    const current = shotImageRequest(args);
    storyboardImages.deferShotImage(args, current); writeFileSync(current.file, png);
    writeFileSync(current.inputs[0], Buffer.concat([png, Buffer.from('changed')]));
    assert.throws(() => storyboardImages.completeShotImage({ ...complete, requestId: current.requestId }), /input_changed/);
    assert.throws(() => storyboardImages.completeShotImage({ ...complete, requestId: '../outside' }), /request_required/);
    assert.throws(() => storyboardImages.completeShotImage({ ...complete, prompt: 'different' }), /completion_scope/);
  });
  it('rejects a changed canonical panel selection while preserving the active pair, but keeps direct edits source-only', () => {
    const { root, dir } = pictureBoard(); icons(dir);
    make(dir, 's0002'); make(dir, 's0002', 'end');
    const args = { path: dir, id: 's0002', frame: 'start', prompt: 'Mina waits.' };
    const request = shotImageRequest(args);
    storyboardImages.deferShotImage(args, request); writeFileSync(request.file, png);
    const before = readFileSync(join(dir, 'scenes.js'), 'utf8');
    const panelDir = join(root, 'data/c/assets/characters/mina');
    const registry = join(panelDir, 'panels.json');
    const panels = JSON.parse(readFileSync(registry, 'utf8'));
    writeFileSync(join(panelDir, 'new-face.png'), png);
    panels.panels.face.file = 'new-face.png';
    writeFileSync(registry, JSON.stringify(panels));
    assert.ok(shotImageRequest(args).inputs.includes(join(panelDir, 'new-face.png')));
    assert.throws(() => storyboardImages.completeShotImage({ path: dir, id: args.id, frame: args.frame, action: 'complete', requestId: request.requestId }), /request_stale/);
    assert.equal(readFileSync(join(dir, 'scenes.js'), 'utf8'), before);
    const edit = shotImageRequest({ ...args, editExisting: true, prompt: 'Make the coat blue.' });
    storyboardImages.deferShotImage(args, edit); writeFileSync(edit.file, png);
    panels.panels.face.file = 'face.png';
    writeFileSync(registry, JSON.stringify(panels));
    assert.equal(storyboardImages.completeShotImage({ path: dir, id: args.id, frame: args.frame, action: 'complete', requestId: edit.requestId }).written, true);
  });
  it('rejects completion after the effective production style changes', () => {
    const { dir } = pictureBoard(); icons(dir);
    const args = { path: dir, id: 's0001', frame: 'start', prompt: 'Mina waits.' };
    const request = shotImageRequest(args);
    storyboardImages.deferShotImage(args, request); writeFileSync(request.file, png);
    const production = readBoard(dir).win.PRODUCTION ?? {};
    applyStoryboard({ path: dir, draft: true, globals: { PRODUCTION: { ...production, style: { ...production.style, preset: 'cinematic' } } } });
    assert.throws(() => storyboardImages.completeShotImage({ path: dir, id: args.id, frame: args.frame, action: 'complete', requestId: request.requestId }), /request_stale/);
  });
  it('shows host generation warnings before the pending output is generated', async () => {
    const { dir } = pictureBoard(); icons(dir);
    const response = await ROUTES.shot_image({ path: dir, id: 's0001', prompt: 'Mina waits.', location: 'room' });
    assert.equal(response.isError, false);
    assert.match(response.content[0].text, /Warnings:/);
    assert.match(response.content[0].text, /background_view_missing/);
  });
  it('reports a missing active image independently of unchanged framing inputs', () => {
    const { dir } = pictureBoard(); icons(dir);
    const request = make(dir, 's0001');
    rmSync(request.file);
    const evidence = readStoryboard({ path: dir }).imageFraming.find(row => row.id === 's0001');
    assert.equal(evidence.status, 'current');
    assert.equal(evidence.availability, 'missing');
    assert.equal(evidence.visualReview, 'not_reviewed');
  });
  it('selects the opening camera background panel and preserves the choice across icon edits', () => {
    const { dir } = pictureBoard();
    icons(dir);
    writeFileSync(join(dir, 'places/back.png'), png);
    const doc = readBoard(dir).win.SB_DOC;
    applyStoryboard({ path: dir, draft: true, globals: { SB_DOC: { ...doc,
      locations: [{ id: 'room', panels: { front: 'places/room.png', back: 'places/back.png' } }] } } });
    const args = { path: dir, id: 's0001', frame: 'start', prompt: 'Mina waits.', location: 'room' };
    assert.equal(shotImageRequest(args).inputs[0], join(dir, 'places/room.png'));
    assert.match(shotImageRequest(args).prompt, /front directional geography/);
    assert.doesNotMatch(shotImageRequest(args).prompt, /preserve this view and its landmark arrangement/);
    make(dir, 's0001', 'start', { location: 'room' });
    const changed = writeShotIcons({ path: dir, shots: [{ id: 's0001', backgroundView: 'back' }] });
    assert.ok(changed.findings.some(f => f.level === 'warn' && /remake/.test(f.what)));
    writeShotIcons({ path: dir, shots: [{ id: 's0001', angle: 'high', view: { subject: 'Mina', reason: 'Watch her reaction', crop: 'Her face fills the frame', mode: 'profile-left' } }] });
    const back = shotImageRequest(args);
    assert.equal(back.inputs[0], join(dir, 'places/back.png'));
    assert.match(back.prompt, /back directional geography/);
    assert.match(back.prompt, /authored crop, camera height and subject viewpoint control the output/);
    assert.match(back.prompt, /Landmarks outside that crop stay outside the frame/);
    assert.doesNotMatch(back.prompt, /Keep the background's back viewing direction and landmark arrangement/);
    assert.doesNotMatch(back.prompt, /sheet pose and camera do not constrain/);
    assert.equal(back.refs.filter(r => r.role === 'background').length, 1);
    assert.ok(!back.inputs.includes(join(dir, 'places/room.png')));
    assert.equal(readBoard(dir).win.SCENES[0].visual.camera.backgroundView, 'back');
    rmSync(join(dir, 'places/back.png'));
    assert.throws(() => shotImageRequest(args), /image_input_missing/);
  });
  it('refuses a missing reverse background and keeps end images based on their start', () => {
    const { dir } = pictureBoard();
    icons(dir);
    writeShotIcons({ path: dir, shots: [{ id: 's0002', backgroundView: 'back' }] });
    assert.throws(() => shotImageRequest({ path: dir, id: 's0002', frame: 'start', prompt: 'Mina waits.', location: 'room' }), /background_view_missing/);
    writeShotIcons({ path: dir, shots: [{ id: 's0002', backgroundView: 'front' }] });
    const start = make(dir, 's0002', 'start', { location: 'room' });
    assert.equal(start.inputs[0], join(dir, 'places/room.png'));
    assert.ok(start.warnings.some(f => /background_view_missing/.test(f.what)));
    const end = shotImageRequest({ path: dir, id: 's0002', frame: 'end', prompt: 'Mina leaves.' });
    assert.equal(end.inputs[0], start.file);
    assert.ok(!end.inputs.includes(join(dir, 'places/room.png')));
    assert.equal(shotIconsSchema.safeParse({ path: dir, shots: [{ id: 's0002', backgroundView: 'left' }] }).success, false);
  });
  it('content-led view survives icon writes and image planning, replaces legacy direction and invalidates saved media', () => {
    const { dir } = pictureBoard();
    icons(dir);
    const view = { subject: 'Mina’s clenched hand', reason: 'The hand betrays the calm words', crop: 'Only the hand and key fill the frame', mode: 'profile-left', subjectId: 'mina' };
    writeShotIcons({ path: dir, shots: [{ id: 's0001', size: 'insert', view }] });
    let shot = readBoard(dir).win.SCENES[0];
    assert.deepEqual(shot.visual.camera.view, view);
    const request = make(dir, 's0001', 'start', { location: 'room', prompt: 'The fingers tighten around the key.' });
    assert.match(request.prompt, /Only the hand and key fill the frame/);
    assert.match(request.prompt, /left profile.*facing camera-left/);
    assert.match(request.prompt, /appearance and identity only/);
    assert.doesNotMatch(request.prompt, /waist up|face from forehead/);
    make(dir, 's0002'); make(dir, 's0002', 'end');
    writeShotPrompt({ path: dir, id: 's0001', action: 'The fingers tighten around the key.' });
    const change = writeShotIcons({ path: dir, shots: [{ id: 's0001', view: { ...view, mode: 'profile-right' } }] });
    assert.ok(change.findings.some(f => /remake it/.test(f.what)));
    assert.ok(change.findings.some(f => /rewrite it with shot_prompt/.test(f.what)));
    shot = readBoard(dir).win.SCENES[0];
    assert.match(shotImageRequest({ path: dir, id: 's0001', frame: 'start', prompt: 'The fingers tighten.' }).prompt, /right profile.*facing camera-right/);
    assert.throws(() => shotIconsSchema.parse({ path: dir, shots: [{ id: 's0001', view: { ...view, mode: 'pov' } }] }), /viewerId/);
  });
  it('shot_icons names video shots it leaves without a camera move, and never refuses them', () => {
    const { dir } = pictureBoard();
    const unset = icons(dir).findings.filter((f) => /camera_move_unset/.test(f.what));
    assert.deepEqual(unset.map((f) => f.what.split(' — ')[0]), ['camera_move_unset on s0002']);
    writeShotIcons({ path: dir, shots: [{ id: 's0002', move: { id: 'camera.static' } }] });
    assert.equal(readBoard(dir).win.SCENES[1].visual.camera.movement, 'static');
  });
  it('a shot_icons call with both why and view keeps both reasons', () => {
    const { dir } = pictureBoard();
    icons(dir);
    const view = { subject: 'Mina’s clenched hand', reason: 'From the side the fingers show their grip', crop: 'Only the hand and key fill the frame', mode: 'profile-left', subjectId: 'mina' };
    writeShotIcons({ path: dir, shots: [{ id: 's0001', size: 'insert', why: 'The hand is the whole beat', view }] });
    assert.equal(readBoard(dir).win.SCENES[0].shot.why, 'The hand is the whole beat');
    // Without a why the size keeps none: the view reason is not copied in, and the result names the shot.
    const bare = writeShotIcons({ path: dir, shots: [{ id: 's0001', size: 'cu', view }] });
    assert.equal(readBoard(dir).win.SCENES[0].shot.why, undefined);
    assert.ok(bare.findings.some((f) => f.level === 'warn' && f.where === 'shot_icons' && /no why on s0001/.test(f.what)));
  });
  it('a reason is asked of a choice: a hold and a plain cut go without, a move and another join do not, and a copied sentence is named', () => {
    const { dir } = pictureBoard();
    const parse = (shot) => shotIconsSchema.safeParse({ path: dir, shots: [{ id: 's0001', ...shot }] }).success;
    assert.deepEqual([parse({ move: { id: 'camera.static' } }), parse({ move: { id: 'camera.dolly-in' } }),
      parse({ next: { transition: 'cut' } }), parse({ next: { transition: 'dissolve' } })], [true, false, true, false]);
    writeShotIcons({ path: dir, shots: [{ id: 's0001', render: { mode: 'generated_video' }, size: 'ms', why: 'w', move: { id: 'camera.static' }, next: { transition: 'dissolve', reason: 'time passes' } }] });
    let board = readBoard(dir).win.SCENES;
    assert.deepEqual([board[0].shot.techniques, board[1].edit.reason], [[{ id: 'camera.static' }], 'time passes']);
    writeShotIcons({ path: dir, shots: [{ id: 's0001', next: { transition: 'cut' } }] });
    assert.equal(readBoard(dir).win.SCENES[1].edit.reason, undefined, 'a cut does not keep the dissolve\'s reason');
    // A wide shot held with no reason is written and named in the result; with its reason, or closer, it is not.
    const heldWide = (shot) => writeShotIcons({ path: dir, shots: [{ id: 's0001', why: 'w', ...shot }] }).findings.filter((f) => f.level === 'warn' && /wide shots held with no reason: s0001/.test(f.what)).length;
    assert.deepEqual([heldWide({ size: 'ls', move: { id: 'camera.static' } }), heldWide({ size: 'ls', move: { id: 'camera.static', reason: 'the doorway he leaves through' } }),
      heldWide({ size: 'cu', move: { id: 'camera.static' } })], [1, 0, 0]);
    assert.equal(readBoard(dir).win.SCENES[0].shot.size, 'cu');
    // The same sentence as one kind of reason on three shots is reported with its shots, not refused.
    writeStoryShots({ path: dir, shots: [{ scene: 1, summary: 'c' }] });
    writeShotCharacters({ path: dir, shots: [{ id: 's0003', characters: [] }] });
    const same = { size: 'cu', why: 'Her face carries the beat' };
    const copied = writeShotIcons({ path: dir, shots: ['s0001', 's0002', 's0003'].map((id) => ({ id, ...same })) });
    assert.ok(copied.written && copied.findings.some((f) => f.level === 'warn' && /shot\.why stands on 3 shots \(s0001, s0002, s0003\)/.test(f.what)));
  });
  it('a finding repeated across shots prints once with its shots, and the direction read returns the plan alone', () => {
    const { dir } = pictureBoard(); icons(dir);
    const text = storyboardImages.renderFindings([{ level: 'warn', where: 'shot 1', what: 'w' }, { level: 'warn', where: 'shot 2', what: 'w' },
      { level: 'warn', where: 'shot 4', what: 'w' }, { level: 'bad', where: 'shot 2', what: 'w' }, { level: 'warn', where: 'scene 1', what: 'w' }]);
    assert.deepEqual(text.split('\n').map((line) => line.trim().replace(/\s+/g, ' ')), ['· shots 1–2, 4 w', '! shot 2 w', '· scene 1 w']);
    const read = readStoryboard({ path: dir, level: 'direction' });
    assert.deepEqual(Object.keys(read), ['file', 'sha256', 'format', 'direction']);
    assert.deepEqual([read.direction.shots, read.direction.sizes], [2, { ms: 1, mcu: 1 }]);
  });
  it('a route and a frame plan are accepted without reasons, and a new mode does not inherit the old reason', () => {
    const { dir } = pictureBoard();
    writeShotIcons({ path: dir, shots: [{ id: 's0001', render: { mode: 'generated_video' }, frames: { mode: 'first_last', reason: 'the arrival must be pinned', endState: 'She stands at the door.' } }] });
    let shot = readBoard(dir).win.SCENES[0];
    assert.deepEqual([shot.shot.render.reason, shot.visual.frames.reason], [undefined, 'the arrival must be pinned']);
    writeShotIcons({ path: dir, shots: [{ id: 's0001', frames: { mode: 'first_last' } }] });
    assert.equal(readBoard(dir).win.SCENES[0].visual.frames.reason, 'the arrival must be pinned', 'the same mode keeps its reason');
    writeShotIcons({ path: dir, shots: [{ id: 's0001', frames: { mode: 'first' } }] });
    assert.equal(readBoard(dir).win.SCENES[0].visual.frames.reason, undefined);
    writeShotIcons({ path: dir, shots: [{ id: 's0001', render: { mode: 'still_camera', reason: 'a quiet place' }, move: { id: 'push', reason: 'settle in' } }] });
    writeShotIcons({ path: dir, shots: [{ id: 's0001', render: { mode: 'generated_video' } }] });
    shot = readBoard(dir).win.SCENES[0];
    assert.deepEqual([shot.shot.render.mode, shot.shot.render.reason], ['generated_video', undefined]);
  });
  it('MSR cast and frame changes synchronize sheet panels without waiting for shot_image', () => {
    const { root, dir } = pictureBoard();
    castFile(dir, ['mina', 'friend'], { root: join(root, 'data/c') });
    icons(dir);
    writeShotCharacters({ path: dir, shots: [{ id: 's0001', characters: ['mina', 'friend'] }] });
    let win = readBoard(dir).win;
    assert.deepEqual(win.SCENES[0].visual.references.map(r => r.id), [
      's0001-mina-face', 's0001-friend-face', 's0001-mina-front', 's0001-friend-front']);
    assert.ok(win.SCENES[0].visual.references.every(r => r.use === 'both'));
    assert.ok(win.SB_DOC.characters.find(c => c.id === 'friend').panels.face.endsWith('/friend/face.png'));
    writeShotIcons({ path: dir, shots: [{ id: 's0001', frames: { mode: 'first', reason: 'Frame route' } }] });
    writeShotCharacters({ path: dir, shots: [{ id: 's0001', characters: ['friend'] }] });
    writeShotIcons({ path: dir, shots: [{ id: 's0001', frames: { mode: 'reference', reason: 'MSR route' } }] });
    win = readBoard(dir).win;
    assert.deepEqual(win.SCENES[0].visual.references.map(r => r.id), ['s0001-friend-face', 's0001-friend-front', 's0001-friend-back']);
  });
  it('known Qwen routes use identity reference roles without repeating appearance prose', () => {
    const { root, dir } = pictureBoard();
    icons(dir);
    const board = readBoard(dir).win;
    board.SB_DOC.characters[0].character = { physical: { appearance: { status: 'confirmed', value: 'distinctive amber eyes' }, outfit: { status: 'confirmed', value: 'a long wool coat' } } };
    const panels = join(root, 'data/c/assets/characters/mina/panels.json');
    const manifest = JSON.parse(readFileSync(panels));
    for (const view of ['front', 'back']) manifest.panels[view].wardrobe = 'fitting';
    writeFileSync(panels, JSON.stringify(manifest));
    writeFileSync(join(dir, 'scenes.js'), serializeBoard(board));
    const normal = shotImageRequest({ path: dir, id: 's0001', frame: 'start', prompt: 'Mina waits.' });
    assert.match(normal.prompt, /distinctive amber eyes/);
    chooseEpisodeImage(dir, { engine: 'astra-genai-native', model: 'qwen-image-fast' }, 'Fixture: Qwen references');
    const qwen = shotImageRequest({ path: dir, id: 's0001', frame: 'start', prompt: 'Mina waits.' });
    assert.doesNotMatch(qwen.prompt, /distinctive amber eyes/);
    assert.match(qwen.prompt, /mina's face and hair/);
    assert.ok(qwen.warnings.some(w => w.code === 'head_count_missing'), 'a sheet without a head count is reported, never refused');
    assert.deepEqual(qwen.inputs, normal.inputs);
    for (const request of [normal, qwen]) {
      assert.match(request.prompt, /mina normally wears a long wool coat/);
      assert.match(request.prompt, /Ignore the fitting clothes/);
      assert.doesNotMatch(request.prompt, /including collar, tie and sleeve state/);
    }
    const wire = buildNativeImageBody({ ...qwen.args, model: 'qwen-image-fast' }, true);
    assert.equal(wire.prompt, qwen.prompt);
    assert.equal(wire.size, '864x1536');
    // A sheet can be newer than the board's cast snapshot.
    writeFileSync(join(root, 'data/c/assets/characters/mina/identity.md'), readFileSync(new URL('../../skills/channel/references/character-identity-example.md', import.meta.url)));
    delete board.SB_DOC.characters[0].character;
    writeFileSync(join(dir, 'scenes.js'), serializeBoard(board));
    const olderBoard = shotImageRequest({ path: dir, id: 's0001', frame: 'start', prompt: 'Mina waits.' });
    const sheetOutfit = olderBoard.refs.find(r => r.wardrobe === 'fitting').defaultOutfit;
    assert.ok(sheetOutfit);
    assert.ok(olderBoard.prompt.includes('mina normally wears ' + sheetOutfit));
  });
  it('sizes the head against the body from the sheet head count, on the Qwen route too, wherever the crop shows a body', () => {
    const { root, dir } = pictureBoard();
    icons(dir);
    const board = readBoard(dir).win;
    board.SB_DOC.characters[0].character = { physical: { heightCm: { status: 'confirmed', value: 165 }, proportions: { status: 'confirmed', value: 'about 7.5 heads tall' } } };
    writeFileSync(join(dir, 'scenes.js'), serializeBoard(board));
    chooseEpisodeImage(dir, { engine: 'astra-genai-native', model: 'qwen-image-fast' }, 'Fixture: Qwen references');
    const waist = shotImageRequest({ path: dir, id: 's0001', frame: 'start', prompt: 'Mina waits.' });
    assert.match(waist.prompt, /mina is 7\.5 heads tall: .*22 cm of the 165 cm standing height/);
    assert.equal(waist.warnings.some(w => w.code === 'head_count_missing'), false);
    // A close-up shows no body to size the head against.
    writeShotIcons({ path: dir, shots: [{ id: 's0001', size: 'cu' }] });
    assert.doesNotMatch(shotImageRequest({ path: dir, id: 's0001', frame: 'start', prompt: 'Mina waits.' }).prompt, /heads tall/);
  });
  it('sends canonical framing at delivery aspect and retains stale evidence across targeted edits', () => {
    const { root, dir } = pictureBoard();
    icons(dir);
    const view = { subject: 'Mina', reason: 'Read the reaction', crop: 'Mina centered', mode: 'front' };
    writeShotIcons({ path: dir, shots: [{ id: 's0001', size: 'mcu', view }] });
    const args = { path: dir, id: 's0001', frame: 'start', prompt: 'Mina waits.' };
    const start = make(dir, 's0001');
    assert.equal(start.args.prompt, start.prompt);
    assert.equal(start.args.size, '864x1536');
    assert.match(start.prompt, /chest up, frame bottom at mid-chest/);
    const status = () => readStoryboard({ path: dir, level: 'shot' }).imageFraming.find(row => row.id === 's0001');
    assert.equal(status().status, 'current');
    assert.equal(status().visualReview, 'not_reviewed');
    writeShotIcons({ path: dir, shots: [{ id: 's0001', size: 'cu', view: { ...view, crop: 'Full body, head to toe' } }] });
    assert.equal(status().status, 'stale');
    assert.throws(() => shotImageRequest(args), /shot_framing_conflict/);
    writeShotIcons({ path: dir, shots: [{ id: 's0001', view: { ...view, crop: 'Face and shoulder tops fill the frame' } }] });
    assert.throws(() => shotImageRequest({ ...args, prompt: 'Wide shot of the room.' }), /shot_framing_conflict/);
    const editArgs = { ...args, editExisting: true, prompt: 'Make the coat blue.' };
    const edit = shotImageRequest(editArgs);
    assert.equal(edit.startBasis, start.startBasis);
    assert.ok(edit.warnings.some(f => /image_framing_stale/.test(f.what)));
    writeFileSync(edit.file, png); recordShotImage(editArgs, edit);
    assert.equal(status().status, 'stale');
    const reframeArgs = { ...args, editExisting: true, reframe: true, prompt: 'Mina looks left with closed relaxed lips.' };
    const reframe = shotImageRequest(reframeArgs);
    assert.deepEqual(reframe.inputs, [edit.file]);
    assert.match(reframe.prompt, /Opening crop: Face and shoulder tops/);
    assert.match(reframe.prompt, /looks left with closed relaxed lips/);
    assert.equal(reframe.args.prompt, reframe.prompt);
    assert.equal(reframe.args.size, '864x1536');
    assert.equal(reframe.startBasis, start.startBasis);
    assert.ok(reframe.warnings.some(f => /image_framing_stale/.test(f.what)));
    assert.throws(() => shotImageRequest({ ...reframeArgs, prompt: 'Full body, head to toe.' }), /shot_framing_conflict/);
    assert.throws(() => shotImageRequest({ ...args, reframe: true }), /image_edit_scope/);
    make(dir, 's0001');
    assert.equal(status().status, 'current');
    const bound = readBoard(dir).win.SCENES.find(shot => shot.id === 's0001');
    bound.shot.location = { id: 'room', revision: 1, stateId: 'day', cameraId: 'wide', mustShow: [],
      blocking: { actors: [{ id: 'mina', height: 1.7, start: { position: [0, 0, 0], rotationZDeg: 0 } }] } };
    applyStoryboard({ path: dir, shotsById: [{ id: bound.id, shot: bound }] });
    make(dir, 's0001');
    assert.equal(status().status, 'current');
    bound.shot.location.blocking.actors[0].start.position = [1, 0, 0];
    applyStoryboard({ path: dir, shotsById: [{ id: bound.id, shot: { ...readBoard(dir).win.SCENES.find(shot => shot.id === bound.id), shot: bound.shot } }] });
    assert.equal(status().status, 'stale');
    assert.ok(shotImageRequest(editArgs).warnings.some(f => /image_framing_stale/.test(f.what)));
    make(dir, 's0001');
    applyStoryboard({ path: dir, globals: { FORMAT: 'youtube-long-16x9' } });
    assert.equal(status().status, 'stale');
    assert.equal(shotImageRequest(args).args.size, '1536x864');
    chooseEpisodeImage(dir, { engine: 'gpt-image', model: 'gpt-image-1.5' }, 'Fixture: fixed size model');
    const fixed = shotImageRequest(args);
    assert.equal(fixed.args.size, '1536x1024');
    assert.ok(fixed.warnings.some(f => /image_aspect_mismatch/.test(f.what)));
  });
  it('targeted edits use the saved frame and preserve its metadata without rebuilding the scene', () => {
    const { dir } = pictureBoard();
    icons(dir);
    assert.throws(() => shotImageRequest({ path: dir, id: 's0001', frame: 'start', editExisting: true, prompt: 'Make the coat blue.' }), /image_edit_source_missing/);
    const start = make(dir, 's0001', 'start', { location: 'room' });
    const edit = shotImageRequest({ path: dir, id: 's0001', frame: 'start', editExisting: true, prompt: 'Make the coat blue.', preserve: 'Keep the face unchanged.' });
    assert.deepEqual(edit.inputs, [start.file]);
    assert.deepEqual(edit.refs, start.refs);
    assert.equal(edit.location, 'room');
    assert.match(edit.prompt, /Change only: Make the coat blue/);
    assert.match(edit.prompt, /Keep the face unchanged/);
    assert.doesNotMatch(edit.prompt, /Compose one picture|Opening attention|even brightness/);
    assert.notEqual(edit.file, start.file);
    assert.throws(() => shotImageRequest({ path: dir, id: 's0001', frame: 'start', preserve: 'face', prompt: 'x' }), /image_edit_required/);
    assert.throws(() => shotImageRequest({ path: dir, id: 's0001', frame: 'start', editExisting: true, props: [], prompt: 'x' }), /image_edit_scope/);
  });
  it('prepares an inspected crop as the generation input without replacing the saved output', () => {
    const { dir } = pictureBoard();
    icons(dir);
    const start = make(dir, 's0001');
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=red:s=32x64', '-vf', 'drawbox=x=4:y=4:w=18:h=32:color=blue:t=fill', '-frames:v', '1', start.file]);
    const original = readFileSync(start.file);
    const args = { path: dir, id: 's0001', frame: 'start', editExisting: true, reframe: true,
      sourceCrop: { x: 4, y: 4, width: 18, height: 32 }, prompt: 'Mina waits.' };
    const request = shotImageRequest(args), prepared = request.inputs[0];
    assert.notEqual(prepared, start.file);
    assert.notEqual(prepared, request.file);
    assert.deepEqual(readFileSync(start.file), original);
    assert.equal(request.operation, 'edit');
    assert.equal(readImageMetadata(prepared).width, 864);
    assert.equal(readImageMetadata(prepared).height, 1536);
    const provenance = JSON.parse(readFileSync(prepared + '.source.json', 'utf8'));
    assert.deepEqual(provenance.crop, args.sourceCrop);
    assert.equal(provenance.sourceSha256, readImageMetadata(start.file).sha256);
    const pixel = execFileSync('ffmpeg', ['-v', 'error', '-i', prepared, '-vf', 'scale=1:1', '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
    assert.ok(pixel[2] > 200 && pixel[0] < 25 && pixel[1] < 25, 'the selected blue region, not the surrounding red, reaches generation');
    assert.throws(() => shotImageRequest({ ...args, reframe: false }), /image_edit_scope/);
    assert.throws(() => shotImageRequest({ ...args, sourceCrop: { ...args.sourceCrop, x: 20 } }), /image_crop_bounds/);
    assert.throws(() => shotImageRequest({ ...args, sourceCrop: { ...args.sourceCrop, width: 20 } }), /image_crop_aspect/);
    storyboardImages.deferShotImage(args, request); writeFileSync(request.file, png);
    writeFileSync(start.file, Buffer.concat([original, Buffer.from('changed')]));
    assert.throws(() => storyboardImages.completeShotImage({ path: dir, id: args.id, frame: args.frame, action: 'complete', requestId: request.requestId }), /input_changed/);
  });
  it('a sheet panel missing from panels.json or disk stops the frame instead of being dropped', () => {
    const { root, dir } = pictureBoard();
    icons(dir);
    const sheet = join(root, 'data/c/assets/characters/mina');
    rmSync(join(sheet, 'back.png'));
    assert.throws(() => shotImageRequest({ path: dir, id: 's0001', frame: 'start', prompt: 'p', location: 'room' }), /character_panel_missing: mina has no back panel/);
    writeFileSync(join(sheet, 'panels.json'), JSON.stringify({ panels: { face: { file: 'face.png' }, back: { file: 'back.png' } } }));
    assert.throws(() => shotImageRequest({ path: dir, id: 's0001', frame: 'start', prompt: 'p', location: 'room' }), /character_panel_missing: mina has no front panel/);
    // The sheet cast.json points at wins over the one found upward from the board.
    castFile(dir, ['mina'], { root: join(root, 'library') });
    assert.match(shotImageRequest({ path: dir, id: 's0001', frame: 'start', prompt: 'p', location: 'room' }).inputs[1], /library\/assets\/characters\/mina\/face\.png$/);
  });
  it('a frame composes the place, then the sheet panels, after every shot has its icons', () => {
    const { root, dir } = pictureBoard();
    assert.throws(() => shotImageRequest({ path: dir, id: 's0001', frame: 'start', prompt: 'p', location: 'room' }), /story_order.*no render route/);
    icons(dir);
    const start = make(dir, 's0001', 'start', { location: 'room' });
    assert.deepEqual(start.inputs.map((f) => f.split('/').slice(-2).join('/')), ['places/room.png', 'mina/face.png', 'mina/body.png', 'mina/back.png']);
    assert.match(start.prompt, /Image 1 shows the room location[;.].*Image 2 shows mina's face and hair\..*Medium shot, waist up, at eye level/);
    const shot = readBoard(dir).win.SCENES[0];
    assert.equal(shot.visual.frames.start, 'images/s0001-start-v1.png');
    assert.equal(shot.visual.bg, shot.visual.frames.start);
    assert.deepEqual(shot.visual.references.map((r) => [r.role, r.use]), [['character', 'both'], ['character', 'both'], ['character', 'both'], ['background', 'image']]);
    assert.throws(() => shotImageRequest({ path: dir, id: 's0001', frame: 'end', prompt: 'p' }), /story_order.*first_last/);
    assert.equal(make(dir, 's0001').requestId, 's0001-start-v2');
    chooseEpisodeImage(dir, { engine: 'astra-genai', model: 'z-image-turbo' }, 'Fixture: a one-picture image model');
    assert.throws(() => shotImageRequest({ path: dir, id: 's0002', frame: 'start', prompt: 'p', location: 'room' }), /image_references_unsupported/);
    chooseEpisodeImage(dir, { engine: 'mlx', model: 'FLUX.2-klein-4B' }, 'Fixture: an MLX edit pack with three references');
    assert.equal(shotImageRequest({ path: dir, id: 's0002', frame: 'start', prompt: 'p', location: 'room' }).inputs.length, 4);
    assert.throws(() => shotImageRequest({ path: dir, id: 's0002', frame: 'start', prompt: 'p', location: 'room', props: ['key'] }), /image_references_unsupported.*takes 4/);
    chooseEpisodeImage(dir, { engine: 'mlx', model: 'Qwen-Image-2.1' }, 'Fixture: an MLX edit pack with nine references');
    assert.equal(shotImageRequest({ path: dir, id: 's0002', frame: 'start', prompt: 'p', location: 'room', props: ['key'] }).inputs.length, 5);
    writeShotIcons({ path: dir, shots: [{ id: 's0002', render: { mode: 'motion_html', reason: 'a diagram' } }] });
    assert.throws(() => shotImageRequest({ path: dir, id: 's0002', frame: 'start', prompt: 'p' }), /shot_image: s0002 is a motion_html cut/);
  });
  it('image requests carry composition, gaze and move preparation, and a still canvas keeps both crop endpoints', () => {
    const { dir } = pictureBoard();
    icons(dir);
    const board = readBoard(dir), shot = board.win.SCENES[0];
    const patched = { ...shot, shot: { ...shot.shot,
      space: { layout: 'Mina on the left third, window on the right', facing: 'Mina faces camera-right' },
      composition: { mode: 'standard', subject: 'mina', subjectKind: 'face', position: 'left', eyeHeight: .33,
        headroom: 'tight', lookRoom: 'right', movement: 'stationary', leadRoom: 'none' },
      eyeline: { mode: 'lens', subject: 'mina', target: 'camera', horizontal: 'center', vertical: 'level', targetDistance: 'medium' } },
      visual: { ...shot.visual, camera: { ...shot.visual.camera, framing: 'Mina beside the window with her hands visible', rear: true } } };
    assert.equal(applyStoryboard({ path: dir, draft: true, shotsById: [{ id: shot.id, shot: patched }] }).written, true);
    const first = make(dir, 's0001');
    assert.match(first.prompt, /Mina on the left third/);
    assert.match(first.prompt, /Mina faces camera-right/);
    assert.match(first.prompt, /headroom tight, look room right/);
    assert.match(first.prompt, /directly into the camera lens/);
    assert.match(first.prompt, /Opening composition: Mina beside the window with her hands visible/);
    assert.match(first.prompt, /View the subject from behind/);
    assert.match(first.prompt, /margin for the closer landing/);
    const changed = writeShotIcons({ path: dir, shots: [{ id: 's0001', move: { id: 'camera.pan-right', reason: 'find the door', target: 'the door', speed: 'slow' } }] });
    assert.ok(changed.findings.some(f => f.where === 's0001' && /start image/.test(f.what)));
    const panned = shotImageRequest({ path: dir, id: 's0001', frame: 'start', prompt: 'Mina waits.' });
    assert.match(panned.prompt, /slow pan right, with movement target the door/);
    assert.match(panned.prompt, /Frame the starting target/);
    assert.doesNotMatch(panned.prompt, /margin for the closer landing/);
    writeShotIcons({ path: dir, shots: [{ id: 's0001', render: { mode: 'still_camera', reason: 'scan the source' }, move: { id: 'pan', reason: 'reveal the door', target: 'the door' } }] });
    const still = shotImageRequest({ path: dir, id: 's0001', frame: 'start', prompt: 'Mina waits.' });
    assert.match(still.prompt, /both the opening and closing regions in one continuous source canvas/);
    assert.doesNotMatch(still.prompt, /slow pan right/);
  });
  it('end images use the closing crop, story state and final focus rather than opening instructions', () => {
    const { dir } = pictureBoard();
    icons(dir);
    const old = readBoard(dir).win.SCENES[1];
    const patch = { ...old, shot: { ...old.shot, depth: { mode: 'shallow', reads: 1, focus: 'Mina eyes' },
      techniques: [{ id: 'camera.rack-focus', reason: 'find the key', from: 'Mina eyes', to: 'the key' }, { id: 'framing.mcu', reason: 'opening crop' }] },
      visual: { ...old.visual, camera: { movement: 'pan right', speed: 'slow', target: 'the key',
        framing: 'Mina at the window', end: 'an overhead close-up of the key on the table' },
        frames: { ...old.visual.frames, endState: 'the key lies on the table' } } };
    assert.equal(applyStoryboard({ path: dir, draft: true, shotsById: [{ id: old.id, shot: patch }] }).written, true);
    const start = make(dir, 's0002');
    assert.match(start.prompt, /Mina eyes in sharp focus/);
    const end = make(dir, 's0002', 'end');
    assert.match(end.prompt, /Closing composition: an overhead close-up of the key on the table/);
    assert.match(end.prompt, /Closing story state: the key lies on the table/);
    assert.match(end.prompt, /the key in sharp focus/);
    assert.match(end.prompt, /only the key is sharp/);
    assert.doesNotMatch(end.prompt, /chest up|at eye level|Mina eyes in sharp focus|only Mina eyes is sharp|Opening composition/);
    const changed = writeShotIcons({ path: dir, shots: [{ id: 's0002', focus: { id: 'camera.rack-focus', reason: 'find the window', from: 'Mina eyes', to: 'the window' } }] });
    assert.ok(changed.findings.some(f => f.where === 's0002' && /start image/.test(f.what)));
  });
  it('a frame takes each visible prop\'s picture in its condition at that end of the shot, with its description and state', () => {
    const { dir } = pictureBoard();
    for (const name of ['watch-intact', 'watch-cracked']) writeFileSync(join(dir, `places/${name}.png`), png);
    const board = readBoard(dir), { win } = board;
    const watch = { id: 'watch', name: '시계', tracking: 'continuity', description: 'a silver pocket watch', appearanceVersion: 'v2', references: [
      { path: 'places/key.png', version: 'v1' }, { path: 'places/watch-cracked.png', version: 'v2', condition: 'cracked' }, { path: 'places/watch-intact.png', version: 'v2', condition: 'intact' }] };
    const props = [watch, { id: 'key', imageUrl: 'places/key.png' }, { id: 'note', description: '접힌 쪽지', research: { sources: [{ url: 'https://example.test/note' }], observed: 'a folded lined page' } },
      { id: 'cup', references: [{ path: 'places/key.png', version: 'v1', condition: 'full' }] }];
    const continuity = { version: 1, timelineId: 'main', initial: [{ propId: 'watch', at: { day: 1, order: 0 }, state: { ownerId: 'mina', holderId: 'mina', location: 'left hand', condition: 'intact' } }],
      events: [{ id: 'drop', propId: 'watch', kind: 'damage', at: { day: 1, order: 2 }, from: { condition: 'intact' }, to: { condition: 'cracked' }, shotIds: ['s0002'],
        reason: 'Mina drops it', recordedAt: '2026-11-02T00:00:00Z', recordedBy: 'author' }] };
    const visual = (id, extra) => ({ ...win.SCENES.find((s) => s.id === id).visual, ...extra });
    applyStoryboard({ path: dir, draft: true, expectedSha256: board.sha256, globals: { SB_DOC: { ...win.SB_DOC, characters: [{ id: 'mina' }] } }, propSheet: { props, continuity }, shotsById: [
      { id: 's0001', shot: { ...win.SCENES[0], visual: visual('s0001', { props: ['key', 'note', 'cup'], propUsage: [{ propId: 'key', start: { day: 1, order: 0 }, end: { day: 1, order: 0 }, visible: false }] }) } },
      { id: 's0002', shot: { ...win.SCENES[1], visual: visual('s0002', { props: ['watch'], propUsage: [{ propId: 'watch', start: { day: 1, order: 1 }, end: { day: 1, order: 2 } }] }) } }] });
    icons(dir);
    // A hidden prop stays out quietly; a prop without a picture is drawn from the prompt, its Korean description left out;
    // a prop with no state still sends its one reference, though that reference names a condition.
    const first = shotImageRequest({ path: dir, id: 's0001', frame: 'start', prompt: 'p', location: 'room' });
    assert.deepEqual(first.refs.filter((r) => r.role === 'prop').map((r) => [r.id, r.path]), [['s0001-prop-cup', 'places/key.png']]);
    assert.match(first.prompt, /Also show the note prop\./);
    assert.deepEqual(first.warnings.map((w) => w.what.split(' ').slice(0, 3).join(' ')).filter((w) => /prop/.test(w)), ["the note prop's", 'the note prop', 'prop_research_missing: cup goes']);   // the hidden key is not drawn, so its missing look-up is not this frame's
    // The opening holds the intact watch of the current version; the closing, after the drop, the cracked one.
    const start = make(dir, 's0002', 'start', { location: 'room' });
    const prop = (request) => request.refs.find((r) => r.role === 'prop');
    assert.deepEqual([prop(start).path, prop(start).purpose], ['places/watch-intact.png', 'the watch prop: a silver pocket watch; held by mina; at left hand; condition intact']);
    assert.match(start.prompt, /Image 5 shows the watch prop: a silver pocket watch; held by mina; at left hand; condition intact\./);
    const end = make(dir, 's0002', 'end', { props: ['watch'] });
    assert.deepEqual([prop(end).path, /condition cracked/.test(prop(end).purpose)], ['places/watch-cracked.png', true]);
    // An error on another shot leaves this one's state alone.
    const other = readBoard(dir);
    applyStoryboard({ path: dir, draft: true, expectedSha256: other.sha256, shotsById: [{ id: 's0001', shot: { ...other.win.SCENES[0],
      visual: { ...other.win.SCENES[0].visual, props: [...other.win.SCENES[0].visual.props, 'watch'] } } }] });
    const unaffected = shotImageRequest({ path: dir, id: 's0002', frame: 'start', prompt: 'p', location: 'room' });
    assert.deepEqual([prop(unaffected).path, unaffected.warnings.some((w) => /ledger/.test(w.what))], ['places/watch-intact.png', false]);
    // An error on this prop is reported and it still goes in, by its unconditioned picture and without a state.
    const broken = readBoard(dir);
    applyStoryboard({ path: dir, draft: true, expectedSha256: broken.sha256, propSheet: { props, continuity: { ...continuity, events: [{ ...continuity.events[0], from: { condition: 'cracked' } }] } } });
    const fallback = shotImageRequest({ path: dir, id: 's0002', frame: 'start', prompt: 'p', location: 'room' });
    assert.equal(prop(fallback).path, 'places/key.png');
    assert.ok(fallback.warnings.some((w) => /^the prop ledger has errors for the watch prop/.test(w.what)));
    assert.doesNotMatch(prop(fallback).purpose, /held by/);
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
    const prompted = writeShotPrompt({ path: dir, id: 's0001', action: 'Mina turns to the door.' }), msr = prompted.prompt;
    // The clip is about to be made, so an open music decision on its scene is said here (warning only).
    assert.ok(prompted.written && prompted.findings.some((f) => f.level === 'warn' && /scene 1 has no music decision/.test(f.what)));
    assert.match(msr, /^Medium shot, waist up, at eye level\. The camera pushes in toward the subject/);
    assert.match(msr, /Mina turns to the door\. Audio: no music\./);
    assert.match(msr, /Keep the entire video image text-free/);
    writeShotPrompt({ path: join(dir, 'scenes.js'), id: 's0001', action: 'Mina turns to the door.', openingPositions: [{ character: 'mina', images: [1], position: 'by the door on the left' }], speakerBindings: [
      { speaker: 'mina', screenPosition: 'left', description: 'the woman in blue' }
    ] });
    const bound = readBoard(dir).win.SCENES[0].visual.video;
    assert.deepEqual(bound.promptSource, { action: 'Mina turns to the door.' });
    assert.equal(bound.speakerBindings[0].screenPosition, 'left');
    assert.equal(bound.openingPositions[0].position, 'by the door on the left');
    assert.equal(bound.openingImageSha256, bound.speakerBindingImageSha256);
    assert.match(bound.speakerBindingImageSha256, /^[a-f0-9]{64}$/);
    const framed = writeShotPrompt({ path: dir, id: 's0002', action: 'Mina looks up.', end: 'she smiles' }).prompt;
    assert.match(framed, /^Start from the given first frame\. Mina looks up\./);
    assert.match(framed, /speaker: mina; delivery: on_screen.*physically saying "안녕"/);
    assert.match(framed, /End on the given last frame: she smiles\. Audio: no music\./);
    assert.match(writeShotPrompt({ path: dir, id: 's0002', action: 'Mina looks up.', sound: 'rain on the window' }).prompt, /Audio: rain on the window, no music\./);
    assert.match(writeShotPrompt({ path: dir, id: 's0002', action: 'Mina looks up.', sound: 'a radio plays a song' }).prompt, /Audio: a radio plays a song\./);
    writeShotPrompt({ path: dir, id: 's0002', action: 'Mina looks up.', end: 'she smiles' });
    assert.equal(readBoard(dir).win.SCENES[1].visual.video.prompt, framed);
    const relined = writeShotDialogue({ path: dir, shots: [{ id: 's0002', lines: [{ speaker: 'mina', tts: '잠깐!' }] }] });
    assert.ok(relined.findings.some((f) => f.where === 's0002' && /video prompt predates a change of on-screen lines/.test(f.what)));
    assert.match(writeShotPrompt({ path: dir, id: 's0002', action: 'Mina looks up.' }).prompt, /physically saying "잠깐!"/);
    assert.deepEqual(contract().promptDrift(readBoard(dir).win.SCENES[1], () => false), []);
    assert.throws(() => writeShotPrompt({ path: dir, id: 's0002', action: '미나가 웃는다' }), /video_prompt_language/);
    // A new start image takes the end image edited from the old one off the shot.
    const again = { path: dir, id: 's0002', frame: 'start', prompt: 'Mina waits by the door.' };
    const remade = shotImageRequest(again);
    writeFileSync(remade.file, png);
    assert.deepEqual(recordShotImage(again, remade).findings.filter((f) => f.where === 's0002' && /end image/.test(f.what)).map((f) => f.level), ['warn']);
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
    chooseEpisodeImage(dir, { engine: 'gpt-image', model: 'gpt-image-2', quality: 'low' }, 'Fixture: GPT Image');
    const ask = () => shotImageRequest({ path: dir, id: 's0001', frame: 'start', prompt: 'Mina in the yard.', location: 'yard' });
    const path = process.env.PATH;
    process.env.PATH = '';
    try { assert.throws(ask, /image_inputs_mixed_format/); } finally { process.env.PATH = path; }
    const request = ask();
    assert.match(request.inputs[0], /images\/inputs\/[0-9a-f]{16}\.png$/);
    assert.equal(request.args.sourceMimeType, 'image/png');
    const original = join(dir, 'places/yard.jpg');
    writeFileSync(request.file, png);
    writeFileSync(original, Buffer.concat([readFileSync(original), Buffer.from('changed')]));
    assert.throws(() => recordShotImage({ path: dir, id: 's0001', frame: 'start' }, request), /input_changed/);
  });
});

describe('tool surface', () => {
  it('the four tools exist with handlers and local hints', () => {
    for (const name of ['storyboard_read', 'storyboard_apply', 'storyboard_check', 'scenario_check',
      'story_sequence', 'story_scene', 'story_shot', 'story_music', 'story_cliche', 'shot_characters', 'shot_dialogue', 'shot_icons', 'shot_image', 'shot_prompt']) {
      const tool = TOOLS.find((t) => t.name === name);
      assert.ok(tool, `missing tool ${name}`);
      assert.equal(typeof ROUTES[name], 'function');
      assert.equal(tool.annotations.openWorldHint, name === 'shot_image');
      assert.match(tool.description, /Use it/);
      assert.match(tool.description, /Do NOT/);
      assert.match(tool.description, /Returns:/);
    }
    assert.deepEqual(TOOLS.find((t) => t.name === 'shot_icons').inputSchema.properties.shots.items.properties.backgroundView.enum, ['front', 'back']);
    // The needs the tool advertises are the ones the skill module picks by.
    assert.deepEqual(TOOLS.find((t) => t.name === 'story_cliche').inputSchema.properties.uses.items.properties.need.enum,
      Object.keys(createRequire(import.meta.url)('../../skills/storyboard/references/cliches.js').NEEDS));
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
  it('invalid performance group is visible and never silently receives invented dialogue', () => {
    const win = readWin(); win.SCENES[1].performance[1].group = 99;
    const event = contract().outline(win, 'shots').unplacedShots[1].performance[1];
    assert.equal(event.unresolvedGroup, true);
    assert.equal(event.text, null);
    assert.equal(event.speaker, null);
  });
  it('boundary evidence preserves the whole performance without deciding or mutating the edit', () => {
    const win = readWin();
    win.SCENES[0].narration = [{ id: 'line-1', speaker: 'child', tts: 'I brought it back.', delivery: 'on_screen' }];
    win.SCENES[0].performance.push({ kind: 'dialogue', character: 'child', to: 'father', group: 1 });
    for (const row of win.SCENES) {
      row.scene = 1;
      row.visual = { character: ['child', 'father'], locationId: 'room', camera: {
        movement: 'static', view: { mode: 'front', subject: 'Both listen and answer', crop: 'waist up' }, end: 'Father looks away' } };
      row.shot = { size: 'ms', angle: 'eye', depth: { mode: 'deep' } };
    }
    win.SCENES[1].narration[0].speaker = 'child';
    win.SCENES[1].narration[0].acting = { intent: 'Wait for an answer' };
    win.SCENES[1].edit = { reason: 'The reply reveals a hidden fear', continuity: 'Keep their positions' };
    withBoard(dir => {
      const file = join(dir, 'scenes.js'), before = readFileSync(file, 'utf8');
      const report = readStoryboard(storyboardReadSchema.parse({ path: dir, level: 'outline', includeContext: false, includeTechniques: false })).boundaryReview;
      assert.equal(report.version, 'shot-boundaries-v1');
      assert.equal(report.status, 'not_reviewed');
      assert.equal(report.boundaries.length, 1);
      assert.deepEqual(report.boundaries[0].signals, ['continuing_speaker', 'same_principals']);
      assert.equal(report.boundaries[0].decision, 'needs_editorial_review');
      assert.equal(report.boundaries[0].incoming.reason, 'The reply reveals a hidden fear');
      assert.deepEqual(report.shots.map(row => row.narration), win.SCENES.map(row => row.narration));
      assert.deepEqual(report.shots.map(row => row.performance), win.SCENES.map(row => row.performance));
      assert.deepEqual(report.shots[1].camera, win.SCENES[1].visual.camera);
      assert.equal(readFileSync(file, 'utf8'), before);
    }, win);
  });
  it('boundary review covers changed speakers, silent action, reverse views and explicit scene changes', () => {
    const win = readWin(), first = win.SCENES[0];
    win.SCENES = Array.from({ length: 5 }, (_, i) => ({ ...structuredClone(first), id: `s000${i + 1}`, scene: i === 4 ? 2 : 1,
      narration: i === 2 || i === 3 ? [] : [{ id: `line-${i}`, speaker: i === 1 ? 'father' : 'child', tts: 'A complete line', delivery: 'on_screen' }],
      visual: { character: ['child', 'father'], locationId: 'room', camera: { view: {
        mode: i === 1 ? 'ots' : 'front', subjectId: i === 1 ? 'father' : 'child', viewerId: i === 1 ? 'child' : undefined } } },
      edit: { reason: i === 4 ? 'The next morning' : 'Continue the action' },
    }));
    withBoard(dir => {
      const { boundaries, shots } = readStoryboard(storyboardReadSchema.parse({ path: dir })).boundaryReview;
      assert.equal(boundaries.length, 4);
      assert.equal(boundaries[0].continuingSpeaker, false);
      assert.ok(boundaries[0].signals.includes('same_principals'));
      assert.equal(shots[1].camera.view.viewerId, 'child');
      assert.equal(shots[1].camera.view.subjectId, 'father');
      assert.ok(boundaries[2].signals.includes('consecutive_silent_actions'));
      assert.ok(boundaries[2].signals.includes('repeated_reason'));
      assert.equal(boundaries[3].sameScene, false);
      assert.deepEqual(boundaries[3].signals, []);
      assert.equal(boundaries[3].incoming.reason, 'The next morning');
    }, win);
  });
  it('missing evidence and duplicate ids remain unknown rather than matching or borrowing timing', () => {
    const win = readWin();
    win.SCENES[1].id = win.SCENES[0].id;
    for (const row of win.SCENES) {
      delete row.scene; delete row.visual;
      row.duration = undefined;
      row.narration = [{ tts: 'Unknown speaker' }];
    }
    withBoard(dir => {
      const { shots, boundaries } = readStoryboard(storyboardReadSchema.parse({ path: dir })).boundaryReview;
      assert.ok(shots.every(row => row.identity === 'missing_or_duplicate' && row.timing === null && row.estimatedSeconds === null));
      assert.equal(boundaries[0].sameScene, null);
      assert.equal(boundaries[0].sameLocation, null);
      assert.equal(boundaries[0].samePrincipals, null);
      assert.equal(boundaries[0].continuingSpeaker, null);
      assert.equal(boundaries[0].decision, 'needs_editorial_review');
    }, win);
    for (const row of win.SCENES) { delete row.narration; row.scene = 1; }
    withBoard(dir => {
      const { shots, boundaries } = readStoryboard(storyboardReadSchema.parse({ path: dir })).boundaryReview;
      assert.ok(shots.every(row => row.narration === null));
      assert.ok(!boundaries[0].signals.includes('consecutive_silent_actions'));
    }, win);
  });
  it('duplicate shot IDs fail targeted inspection instead of inspecting the wrong shot', () => {
    const win = readWin(); win.SCENES[1].id = 's0001';
    withBoard(dir => assert.throws(() => readStoryboard(storyboardReadSchema.parse({ path: dir, shotId: 's0001' })), /found 2/), win);
  });
  it('inspection neighbors follow b-roll placement and the closing outro, not storage order', () => {
    const win = readWin();
    win.SCENES.push({ id: 's0003', type: 'broll', after: 0, narration: [], performance: [{ kind: 'action', character: 'child', text: 'The watch falls.' }] });
    win.SCENES.push({ id: 's0004', type: 'outro', narration: [] });
    win.SCENES.push({ id: 's0005', type: 'broll', after: 99, narration: [] });
    withBoard(dir => {
      const result = readStoryboard(storyboardReadSchema.parse({ path: dir, shotId: 's0003' }));
      assert.deepEqual(result.playback.map(row => row.id), ['s0001','s0003','s0002','s0004']);
      assert.deepEqual(result.boundaryReview.shots.map(row => row.id), ['s0001','s0003','s0002','s0004']);
      assert.deepEqual(result.boundaryReview.boundaries.map(row => [row.from.id, row.to.id]),
        [['s0001','s0003'],['s0003','s0002'],['s0002','s0004']]);
      assert.ok(result.boundaryReview.boundaries.every(row => row.incoming === null && row.joinEvidence === 'inspect_splice_edit'));
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

describe('first spoken line reading', () => {
  const line = (extra = {}) => ({ id: 'l1', speaker: 'a', delivery: 'on_screen', tts: 'x', estimatedSeconds: 2, ...extra });
  it('adds the lengths before the first line to its lead-in and names the silence a longer shot holds', () => {
    const win = { SCENES: [
      { id: 's0001', duration: 2.5 },
      { id: 's0002', duration: 6, narration: [line({ acting: { leadInSeconds: 0.5 } })] },
      { id: 's0003', duration: 2, narration: [line({ id: 'l2' })] }] };
    assert.deepEqual(firstLineReading(win), ["first spoken line: s0002, about 3 s in — that shot's length holds 3.5 s beyond its performance; "
      + 'a natively voiced clip plays them as silence, mostly before the line']);
    // A line that fills its shot reads as its start alone, and so does a narrator's line in a longer shot: composed TTS places it.
    assert.deepEqual(firstLineReading({ SCENES: [{ id: 's0001', duration: 2, narration: [line()] }] }), ['first spoken line: s0001, about 0 s in']);
    assert.deepEqual(firstLineReading({ SCENES: [{ id: 's0001', duration: 9, narration: [line({ delivery: 'voiceover' })] }] }), ['first spoken line: s0001, about 0 s in']);
  });
  it('prints nothing without a line or with an unknown length before it', () => {
    assert.deepEqual(firstLineReading({ SCENES: [{ id: 's0001', duration: 3 }] }), []);
    assert.deepEqual(firstLineReading({ SCENES: [{ id: 's0001' }, { id: 's0002', duration: 2, narration: [line()] }] }), []);
  });
});

describe('opening reading', () => {
  const story = { version: 'story-v2', authoring: 'story-first' };
  const line = { id: 'l1', speaker: 'a', delivery: 'on_screen', tts: 'x', estimatedSeconds: 2 };
  it('short-form names a missing plan, the shots inside 0–3 s and a first line after the window', () => {
    const win = { STORY: story, SCENES: [{ id: 's0001', duration: 2 }, { id: 's0002', duration: 2.5, narration: [line] }, { id: 's0003', duration: 1 }] };
    const reading = openingReading(win, ['instagram', 'tiktok', 'threads', 'constructor', 'toString']);   // inherited names are not platforms
    assert.match(reading[0], /^opening \(short-form · Reels: skip rate counts the first 3 s · TikTok: the offer in 3 s, the hook in 6 s \(ad guidance\)\): no plan/);
    assert.ok(reading.includes('opening window 0–3 s: s0001 0–2 s, s0002 2–4.5 s'));
    assert.ok(!reading.some((l) => /after the 3 s window/.test(l)));   // the line starts at 2 s, inside the window
    win.SCENES[0].duration = 4;
    assert.ok(openingReading(win).includes('opening: the first spoken line starts about 4 s in, after the 3 s window — until then the pictures carry the promise alone'));
  });
  it('long-form names the missing packaging and reads a 30 s window; boards that are not story-first print nothing', () => {
    const win = { FORMAT: 'youtube-long-16x9', STORY: { ...story, opening: { promise: 'p', firstFrame: 'f', title: 't' } },
      SCENES: [{ id: 's0001', duration: 20 }, { id: 's0002', duration: 20 }] };
    const reading = openingReading(win, ['youtube', 'facebook']);
    assert.equal(reading[0], 'opening (long-form · YouTube: Intro = still watching at 30 s, 50% or more is above typical · Facebook: one-minute views): promise "p" · first frame: f');
    assert.ok(reading.includes('opening: no thumbnail, bigger question — the first 30 s confirms the title and thumbnail, then opens a bigger question'));
    assert.ok(reading.includes('opening window 0–30 s: s0001 0–20 s, s0002 20–40 s'));
    for (const duration of [undefined, Infinity]) {   // a length unknown or unusable inside the window: no shot list
      win.SCENES[0].duration = duration;
      assert.ok(!openingReading(win).some((l) => l.startsWith('opening window')));
    }
    win.STORY.opening.promise = '\t\n ';   // a hand-edited blank promise reads as no plan
    assert.match(openingReading(win)[0], /: no plan/);
    assert.deepEqual(openingReading({ SCENES: [{ id: 's0001', duration: 2 }] }), []);
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
});


describe('edit impact and uninterrupted scene evidence', () => {
  const fixture = () => ({ FORMAT: 'youtube-long-16x9', SCENES: [
    { id: 's0001', type: 'points', scene: 1, duration: 3,
      narration: [{ id: 'a', speaker: 'alice', delivery: 'on_screen', tts: 'Wait.', estimatedSeconds: 2, acting: { visual: 'Hold still' } }],
      performance: [{ kind: 'dialogue', character: 'alice', group: 1 }, { kind: 'action', character: 'alice', text: 'Turn', durationSeconds: 1 }],
      visual: { frames: { start: 'old.png' }, action: 'Turn' } },
    { id: 's0002', type: 'points', scene: 1, duration: 4,
      narration: [{ id: 'b', speaker: 'bob', delivery: 'on_screen', tts: 'I know.', estimatedSeconds: 3 }],
      performance: [{ kind: 'dialogue', character: 'bob', group: 1 }, { kind: 'action', character: 'bob', text: 'Nod', durationSeconds: 1 }] },
  ] });
  it('reports changed speech, inherited staging and dangling props but preserves an intact merge', () => {
    const win = fixture(), merged = structuredClone(win.SCENES[0]);
    merged.narration.push(...structuredClone(win.SCENES[1].narration));
    merged.performance.push(...structuredClone(win.SCENES[1].performance).map(e => e.kind === 'dialogue' ? { ...e, group: 2 } : e));
    const patch = { path: 'unused', shotsById: [{ id: merged.id, shot: merged }], removeShotIds: ['s0002'] };
    const r = applyPatch(win, patch);
    assert.ok(!r.findings.some(f => f.code === 'edit_speech_changed'));
    assert.ok(r.findings.some(f => f.code === 'edit_staging_changed'));
    assert.ok(r.findings.some(f => f.code === 'edit_image_inherited'));
    assert.equal(r.win.SCENES[0].visual.frames.start, 'old.png');
    assert.equal(win.SCENES.length, 2);
    const reordered = structuredClone(merged);
    const unmapped = structuredClone(merged);
    unmapped.performance = [{ kind: 'action', text: 'Wave', durationSeconds: 1 }];
    assert.ok(applyPatch({ SCENES: [merged] }, { path: 'unused', shotsById: [{ id: merged.id, shot: unmapped }] }).findings.some(f => f.code === 'edit_speech_order_unresolved'));
    reordered.performance = [merged.performance[2], merged.performance[0], merged.performance[1], merged.performance[3]];
    assert.ok(applyPatch({ SCENES: [merged] }, { path: 'unused', shotsById: [{ id: merged.id, shot: reordered }] }).findings.some(f => f.code === 'edit_speech_changed'));
    merged.narration[1].acting = { visual: 'Wave' };
    assert.ok(applyPatch(win, patch).findings.some(f => f.code === 'edit_speech_changed'));
    const drop = applyPatch({ ...win, SB_DOC: { propContinuity: { events: [{ id: 'handoff', shotIds: ['s0002'] }] } } }, { path: 'unused', removeShotIds: ['s0002'] });
    for (const code of ['edit_speech_changed', 'edit_action_removed', 'edit_prop_reference'])
      assert.ok(drop.findings.some(f => f.code === code), code);
    const legacy = { SCENES: [{ id: 's0001', type: 'points', narration: [], visual: { action: 'Pack the camera' } }, { id: 's0002', type: 'points' }] };
    assert.ok(applyPatch(legacy, { path: 'unused', removeShotIds: ['s0001'] }).findings.some(f => f.code === 'edit_action_removed'));

  });
  it('returns ordered resolved events, estimate mismatches and running-module identity', () => {
    const dir = tmp(), win = fixture();
    win.SCENES[0].duration = 1;
    writeFileSync(join(dir, 'scenes.js'), serializeBoard(win));
    const r = readStoryboard(storyboardReadSchema.parse({ path: dir, includeTechniques: false }));
    assert.equal(r.runtime.loadedModuleSha256, r.runtime.diskModuleSha256);
    assert.match(r.runtime.loadedModuleSha256, /^[a-f0-9]{64}$/);
    assert.ok(r.runtime.features.includes('boundaryReview'));
    assert.deepEqual(r.boundaryReview.sceneRuns[0].events.map(e => e.text), ['Wait.', 'Turn', 'I know.', 'Nod']);
    assert.equal(r.boundaryReview.shots[0].performanceTiming.durationSeconds, 3);
    assert.equal(r.boundaryReview.shots[0].performanceTiming.differsFromStored, true);
    assert.equal(r.boundaryReview.shots[0].performanceTiming.physicalFeasibility, 'not_reviewed');
    win.SCENES[0].narration = []; delete win.SCENES[0].performance;
    writeFileSync(join(dir, 'scenes.js'), serializeBoard(win));
    const legacy = readStoryboard(storyboardReadSchema.parse({ path: dir, includeTechniques: false })).boundaryReview;
    assert.equal(legacy.sceneRuns[0].events[0].text, 'Turn');
    assert.equal(legacy.sceneRuns[0].events[0].order, 'unresolved');
    assert.equal(legacy.shots[0].performanceTiming.durationSeconds, null);
    win.SCENES[0].narration = [{ id: 'legacy-voice', tts: 'Earlier that day.', speaker: 'a', delivery: 'voiceover', acting: { vocal: 'quietly' } }];
    writeFileSync(join(dir, 'scenes.js'), serializeBoard(win));
    const speech = readStoryboard(storyboardReadSchema.parse({ path: dir, includeTechniques: false })).boundaryReview.sceneRuns[0].events[1];
    assert.equal(speech.kind, 'narration');
    assert.equal(speech.delivery, 'voiceover');
    assert.deepEqual(speech.acting, { vocal: 'quietly' });
    // A line nobody timed is estimated from its syllables; the stored duration reads against it.
    win.SCENES[0].narration = [{ id: 'k1', tts: '너도 담배냐?', speaker: 'a', delivery: 'on_screen' }];
    win.SCENES[0].performance = [{ kind: 'dialogue', character: 'a', group: 1 }];
    win.SCENES[0].duration = 4;
    writeFileSync(join(dir, 'scenes.js'), serializeBoard(win));
    const timed = readStoryboard(storyboardReadSchema.parse({ path: dir, includeTechniques: false })).boundaryReview.shots[0].performanceTiming;
    assert.equal(timed.durationSeconds, 1.51);
    assert.equal(timed.storedExcessSeconds, 2.49);
  });
});

it('keeps scene sound decisions through story and structure writes without marking old boards', () => {
  const dir = tmp(), sequences = [{ id: 'q1', title: 'The visit', purpose: 'Find the letter' }];
  const scenes = [1, 2].map(no => ({ ...scene(no), sequence: 'q1', summary: 'A hand reaches for the envelope.' }));
  const use = { decision: 'use', reason: 'A sustained tone carries the suspicion.' };
  const none = { decision: 'none', reason: 'Her answer lands in the room tone.' };
  const read = () => readStoryboard({ path: dir, level: 'outline', includeTechniques: false }).audienceSpotting;
  writeStorySequences({ path: dir, sequences });
  const added = writeStoryScenes(storySceneSchema.parse({ path: dir, scenes: [scenes[0], { ...scenes[1], audienceSound: none }] }));
  assert.equal(added.written, true);
  assert.deepEqual(read().undecided, [1]);
  assert.deepEqual(readBoard(dir).win.STRUCTURE.scenes.map(s => s.audienceSound), [{ decision: 'undecided' }, none]);
  assert.equal(storySceneSchema.safeParse({ path: dir, scenes: [{ ...scenes[0], audienceSound: { decision: 'use' } }] }).success, false);
  writeStoryScenes({ path: dir, scenes: [{ ...scenes[0], audienceSound: use }] });
  const pending = writeStoryScenes({ path: dir, scenes });
  assert.ok(pending.board.some(line => line.includes('chosen but no cue')));
  assert.deepEqual(read().needsCue, [1]);
  const stripped = readBoard(dir).win.STRUCTURE;
  stripped.scenes = stripped.scenes.map(({ audienceSound, ...rest }) => rest);
  applyStoryboard({ path: dir, draft: true, structure: stripped });
  assert.deepEqual(read().scenes.map(s => s.reason), [use.reason, none.reason]);

  const old = tmp(), legacy = { STRUCTURE: structure([scene(1), scene(2)]), SCENES: board() };
  writeFileSync(join(old, 'scenes.js'), serializeBoard(legacy));
  const update = applyStoryboard({ path: old, scenes: [scene(1, { time: 'night' })] });
  assert.equal(update.written, true);
  assert.equal(readBoard(old).win.STORY, undefined);
  assert.equal(readBoard(old).win.STRUCTURE.scenes[0].audienceSound, undefined);
  const report = readStoryboard({ path: old, level: 'outline', includeTechniques: false }).audienceSpotting;
  assert.deepEqual(report.undecided, []);
  assert.deepEqual(report.scenes.map(s => s.decision), ['unrecorded', 'unrecorded']);
});

it('round-trips perspective, shift and exit only while the scene uses audience sound', () => {
  const dir = tmp(), story = { ...scene(1), sequence: 'q1', summary: 'She recognises the handwriting.' };
  const use = { decision: 'use', reason: 'Share her growing suspicion.', perspective: 'The reader of the letter',
    shift: 'Room tone thins as she reads her own name.', exit: 'The envelope slips from her hand.' };
  const save = audienceSound => writeStoryScenes(storySceneSchema.parse({ path: dir, scenes: [{ ...story, audienceSound }] }));
  const apply = audienceSound => applyStoryboard(storyboardApplySchema.parse({ path: dir, draft: true, scenes: [scene(1, { summary: story.summary, audienceSound })] }));
  const stored = () => readBoard(dir).win.STRUCTURE.scenes[0].audienceSound;
  const spotted = level => readStoryboard({ path: dir, level, includeTechniques: false }).audienceSpotting.scenes[0];
  writeFileSync(join(dir, 'scenes.js'), serializeBoard({ STRUCTURE: structure([scene(1), scene(2, { summary: 'She lays the letter down.' })]),
    SCENES: board().map(shot => ({ ...shot, visual: { character: 'reader' }, narration: [], summary: 'She reads the letter.' })) }));
  assert.equal(save({ ...use, perspective: '  ' + use.perspective + '  ' }).written, true);
  assert.deepEqual(stored(), use);
  assert.equal(apply().written, true);
  for (const level of ['outline', 'shots', 'full'])
    assert.deepEqual(spotted(level), { no: 1, ...use, cues: [], needsCue: true });

  const none = { decision: 'none', reason: 'Leave the pause after the line clear.' };
  for (const tool of ['story_scene', 'storyboard_apply']) {
    const schema = TOOLS.find(t => t.name === tool).inputSchema.properties.scenes.items.properties.audienceSound;
    const branch = schema.anyOf.find(option => option.properties.decision.const === 'use');
    for (const field of ['perspective', 'shift', 'exit']) assert.equal(branch.properties[field].type, 'string');
  }
  assert.throws(() => save({ ...use, shift: '  ' }));
  assert.throws(() => apply({ ...none, exit: 'Old cue' }));
  assert.throws(() => save({ decision: 'undecided', perspective: 'Old point of view' }));
  assert.deepEqual(stored(), use);
  assert.equal(apply(none).written, true);
  assert.deepEqual(stored(), none);
  assert.deepEqual(spotted('outline'), { no: 1, ...none, cues: [], needsCue: false });

  // A replacement use plan may supply just one of the three notes.
  const newPlan = { decision: 'use', reason: use.reason, shift: use.shift };
  assert.equal(apply(newPlan).written, true);
  assert.equal(save(undefined).written, true);
  assert.deepEqual(stored(), newPlan);
  assert.deepEqual(spotted('outline'), { no: 1, ...newPlan, cues: [], needsCue: true });
});

it('adds music to one legacy event while an earlier catalog cue stays placed over the original soundtrack', () => {
  const episode = tmp(), dir = join(episode, 'storyboard'), work = join(episode, '.work');
  const catalog = join(episode, 'assets/audio/sfx');
  mkdirSync(dir); mkdirSync(catalog, { recursive: true });
  writeFileSync(join(catalog, 'hum.wav'), 'old catalog hum');
  const native = { id: 'hinge', sfx: 'hinge', delivery: 'native', trigger: 'door opens', description: 'a squeak' };
  const old = { id: 'prior', sfx: 'hum', delivery: 'post', trigger: 'door closes', description: 'air hiss',
    audience: { intent: 'she feels alone' }, atSeconds: 1 };
  const shots = board().map((s, i) => ({ ...s, id: 's000' + (i + 1) }));
  shots[0].sound = { audioSource: 'video', effects: [native, old] };
  const legacy = { STRUCTURE: structure([scene(1), scene(2)]), SCENES: shots };
  const { boardClock } = createRequire(import.meta.url)('../../skills/storyboard/references/audience-effects.js');
  old.audience.timingBasis = boardClock(legacy, dir).basis(shots[0].id, old);
  writeFileSync(join(dir, 'scenes.js'), serializeBoard(legacy));
  const apply = extra => applyStoryboard(storyboardApplySchema.parse({ path: dir, expectedSha256: readBoard(dir).sha256, ...extra }));
  const read = () => readStoryboard(storyboardReadSchema.parse({ path: dir, level: 'shots', includeTechniques: false })).audienceEffects;
  const plan = { op: 'plan', id: 'recognition', shotId: shots[0].id, sfx: 'hum', source: 'music',
    description: 'low rising drone', trigger: 'a second name comes into view', intent: 'share her suspicion' };
  assert.equal(apply({ scenes: [scene(1, { audienceSound: { decision: 'use', reason: 'She recognises the signature.' } })],
    audienceEffects: [plan] }).written, true);
  const previewFile = join(dir, 'audience-review-data.js');
  assert.throws(() => readFileSync(previewFile), { code: 'ENOENT' });
  writeFileSync(previewFile, '// Previously exported board.');
  const preview = () => createRequire(import.meta.url)('../../skills/_shared/scenes-vm.js').evaluateWindowScript(readFileSync(previewFile, 'utf8'));
  let [prior, added] = read();
  assert.deepEqual([prior.status, prior.source.kind, added.status, added.source.kind], ['placed', 'catalog', 'planned', 'music']);
  assert.equal(added.source.prompt, plan.description);
  mkdirSync(join(work, 'music/audience'), { recursive: true });
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=180:duration=0.5', added.source.path]);
  const key = { shotId: plan.shotId, id: plan.id };
  const place = { op: 'place', ...key, atSeconds: 1.5, timingBasis: read()[1].currentTimingBasis };
  assert.throws(() => apply({ audienceEffects: [{ ...place, sourceStartSeconds: .25, fadeInSeconds: .4 }] }), /entrance fade/);
  apply({ audienceEffects: [{ ...place, sourceStartSeconds: .25, fadeInSeconds: .12 }] });
  const placedPreview = preview();
  assert.equal(placedPreview.AUDIENCE_CUES.find(c => c.id === plan.id).status, 'placed');
  assert.ok(Object.values(placedPreview.AUDIENCE_PREVIEWS).some(scene => scene.file && scene.entries.some(c => c.id === plan.id)));
  assert.equal(placedPreview.AUDIENCE_PREVIEW_STAMP, createRequire(import.meta.url)('../../skills/storyboard/references/audience-spotting.js').previewStamp(readBoard(dir).win));
  apply({ audienceEffects: [place] });
  assert.equal(read()[1].sourceStartSeconds, .25);
  assert.equal(read()[1].fadeInSeconds, .12);
  const compiler = createRequire(import.meta.url).resolve('../../skills/produce/references/compile-sound-plan.js');
  execFileSync(process.execPath, [compiler, join(dir, 'scenes.js'), work, episode], { stdio: 'pipe' });
  const spans = JSON.parse(readFileSync(join(work, 'sfx-spans.json'))).spans;
  assert.deepEqual(spans.map(s => [s.id, s.assetPath]), [[old.id, prior.source.path], [plan.id, added.source.path]]);
  assert.equal(spans[1].sourceStartSeconds, .25);
  assert.equal(spans[1].fadeInSeconds, .12);
  apply({ audienceEffects: [{ ...place, sourceStartSeconds: null, fadeInSeconds: null }] });
  assert.equal(read()[1].sourceStartSeconds, undefined);
  assert.equal(read()[1].fadeInSeconds, undefined);
  const result = readBoard(dir).win;
  assert.equal(result.STORY, undefined);
  assert.deepEqual(result.SCENES[0].sound.effects.slice(0, 2), [native, old]);
  assert.equal(result.SCENES[0].sound.audioSource, 'video');
  assert.equal(result.SCENES[0].sound.effects[2].audience.source, 'music');
  apply({ audienceEffects: [{ op: 'plan', ...key, intent: 'recognition' }] });
  assert.equal(read()[1].status, 'placed');
  apply({ audienceEffects: [{ op: 'plan', ...key, source: null }] });
  [prior, added] = read();
  assert.deepEqual([prior.status, added.status, added.source.kind], ['placed', 'stale', 'catalog']);
});

it('plans, retimes and removes only the audience event; take bytes and end shots bind the placement', () => {
  const dir = tmp(), shots = board();
  shots[0].visual = {video:{clip:'selected.mp4'}};
  shots[0].sound = {audioSource:'video',drop:true,effects:[{id:'door',sfx:'door'}]};
  writeFileSync(join(dir,'selected.mp4'),'take 1');
  applyStoryboard(storyboardApplySchema.parse({path:dir,set:{structure:structure([scene(1),scene(2, { audienceSound: { decision: 'none', reason: 'An unscored reply' } })]),shots}}));
  assert.deepEqual(readBoard(dir).win.STRUCTURE.scenes[0].audienceSound, {decision:'undecided'});
  const read = (extra = {}) => readStoryboard(storyboardReadSchema.parse({path:dir,includeTechniques:false,...extra}));
  const apply = (extra) => applyStoryboard(storyboardApplySchema.parse({path:dir,expectedSha256:readBoard(dir).sha256,...extra}));
  const source=readFileSync(new URL('../../skills/storyboard/references/audience-sound/comedy.md',import.meta.url),'utf8');
  const example=source.split('\n').find(line=>line.startsWith('| 063 |'));
  assert.match(example,/실수/);
  const key = {shotId:'s0001',id:'late'}, plan = {...key,op:'plan',sfx:'bend',intent:'embarrassment',trigger:'smile falls',description:'dry descending pluck',caseId:'063'};
  const raw = {...shots[0],sound:{effects:[{id:'late',audience:{intent:plan.intent},delivery:'auto'}]}};
  assert.equal(shotSchema.parse(raw).sound.effects[0].delivery,'post');
  raw.sound.effects[0].delivery='input';assert.throws(()=>shotSchema.parse(raw),/audience_delivery_conflict/);
  const data = {sfxEntries:{bend:{asset:'bend'}},audienceEffects:[plan]};
  const initial = readBoard(dir).sha256;
  assert.equal(apply({...data,dryRun:true}).written,false);
  assert.equal(readBoard(dir).sha256,initial);
  assert.equal(apply(data).written,true);
  assert.deepEqual(apply(data).changed,[]);
  assert.equal(apply(data).written,false);
  assert.throws(() => apply({...data,expectedSha256:initial}),/head_moved/);
  assert.equal(read().audienceEffects[0].status,'planned');
  const row=read({audienceEndFor:{...key,endShotId:'s0003'}}).audienceEffects[0];
  const placement = {...key,op:'place',atSeconds:1.4,timingBasis:row.proposedTimingBasis,end:{shotId:'s0003',atSeconds:1},fadeOutSeconds:0.2};
  apply({audienceEffects:[placement]});
  assert.equal(read().audienceEffects[0].status,'placed');
  assert.deepEqual(read().audienceSpotting.conflicts, [2]);
  assert.equal(read().audienceSpotting.scenes[1].cues[0].status, 'placed');
  assert.equal(read({level:'outline'}).audienceSpotting.scenes[1].cues[0].status, 'timing_unchecked');
  apply({audienceEffects:[{...placement, end:{shotId:'s0003',atSeconds:0}}]});
  assert.deepEqual(read().audienceSpotting.conflicts, []);
  apply({audienceEffects:[placement]});
  assert.equal(apply({audienceEffects:[placement]}).written,false);
  const placed=readBoard(dir).win;
  const timing=createRequire(import.meta.url)('../../skills/storyboard/references/audience-effects.js');
  // The mixer derives the outgoing handle from the next incoming transition length.
  placed.SCENES[1].edit={transitionSeconds:.48};
  assert.equal(timing.read(placed,dir)[0].status,'stale');
  writeFileSync(join(dir,'selected.mp4'),'take 2');
  assert.equal(read().audienceEffects[0].status,'stale');
  assert.throws(() => apply({audienceEffects:[placement]}),/audience_timing_stale/);
  const fresh = read({audienceEndFor:{...key,endShotId:null}}).audienceEffects[0];
  apply({audienceEffects:[{...placement,atSeconds:1.6,end:null,fadeOutSeconds:null,timingBasis:fresh.proposedTimingBasis}]});
  assert.equal(read().audienceEffects[0].atSeconds,1.6);
  const before = readBoard(dir).sha256;
  assert.throws(() => apply({audienceEffects:[{...key,op:'remove'},{...key,id:'door',op:'remove'}]}),/audience_id_conflict/);
  assert.equal(readBoard(dir).sha256,before);
  assert.throws(() => apply({sfxEntries:{bend:{asset:'other'}}}),/audience_id_conflict/);
  apply({audienceEffects:[{...key,op:'remove'}]});
  assert.equal(apply({audienceEffects:[{...key,op:'remove'}]}).written,false);
  assert.deepEqual(readBoard(dir).win.SCENES[0].sound,shots[0].sound);
});

it('ships 120 distinct audience situations, ten per linked category, with source definitions', () => {
  const dir = new URL('../../skills/storyboard/references/audience-sound/',import.meta.url);
  const index=readFileSync(new URL('index.md',dir),'utf8');
  const files=[...index.matchAll(/\]\(([a-z]+\.md)\)/g)].map(m=>m[1]);
  assert.equal(new Set(files).size,12);
  const all=files.flatMap(name=>{
    const text=readFileSync(new URL(name,dir),'utf8');
    for(const [,source] of text.matchAll(/\]\[([a-z]+)\]/g)) assert.ok(text.includes('['+source+']: https://'));
    const ids=[...text.matchAll(/^\| (\d{3}) \|/gm)].map(m=>Number(m[1]));
    assert.equal(ids.length,10);return ids;
  });
  assert.deepEqual(all.sort((a,b)=>a-b),Array.from({length:120},(_,i)=>i+1));
});
