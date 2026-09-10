/**
 * Storyboard tools — the sequence → scene → shot schemas, the in-memory patch, the file
 * round trip, and the check runner over check-scenes.js. No API is called; every board
 * lives in a temp directory.
 */

import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

import {
  CHECK_SCENES_FILE,
  CONTRACT_FILE,
  STRUCTURE_VERSION,
  applyPatch,
  applyStoryboard,
  checkStoryboard,
  contract,
  readBoard,
  sceneSchema,
  sequenceSchema,
  serializeBoard,
  shotSchema,
  storyboardApplySchema,
  structureSchema,
} from '../dist/storyboard.js';
import { TOOLS } from '../dist/tools.js';
import { ROUTES } from '../dist/handlers.js';

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
  it('a scene needs place, time, event, a charge and a turn — and nothing unknown', () => {
    assert.ok(sceneSchema.safeParse(scene(1)).success);
    assert.ok(!sceneSchema.safeParse({ ...scene(1), place: '' }).success);
    assert.ok(!sceneSchema.safeParse({ ...scene(1), charge: { open: '+', close: 'up' } }).success);
    assert.ok(!sceneSchema.safeParse({ ...scene(1), mood: 'x' }).success, 'a typo key is refused');
  });
  it('a sequence binds scenes under one purpose', () => {
    assert.ok(sequenceSchema.safeParse({ id: 'q1', title: 't', purpose: 'p', scenes: [1] }).success);
    assert.ok(!sequenceSchema.safeParse({ id: 'q1', title: 't', purpose: 'p', scenes: [] }).success);
    assert.ok(!sequenceSchema.safeParse({ id: 'q1', title: 't', scenes: [1] }).success, 'purpose is required');
  });
  it('the shot grammar is a closed vocabulary; the visual plan passes through', () => {
    assert.ok(shotSchema.safeParse(board()[1]).success);
    assert.ok(!shotSchema.safeParse({ ...board()[1], shot: { size: 'wide' } }).success);
    assert.ok(!shotSchema.safeParse({ ...board()[1], transition: 'push:left' }).success);
    assert.ok(!shotSchema.safeParse({ ...board()[1], beat: 'middle' }).success);
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
  it('a full set validates, syncs the shot labels and reports no violation', () => {
    const r = applyPatch({}, storyboardApplySchema.parse({ path: 'x', set: { structure: structure([scene(1), scene(2, { place: '부엌', time: '밤' })]), shots: board() } }));
    assert.deepEqual(r.findings.filter((f) => f.level === 'bad'), []);
    assert.equal(r.synced, 4);
    assert.equal(r.win.SCENES[2].sceneSlug, '부엌 / 밤');
    assert.equal(r.win.SCENES[2].sequence, undefined, 'one sequence writes no shot label');
  });
  it('a violation in the structure comes back as findings, one per issue', () => {
    const r = applyPatch({}, storyboardApplySchema.parse({ path: 'x', set: { structure: structure([scene(1)]), shots: board() } }));
    assert.ok(r.findings.some((f) => f.level === 'bad' && /scene 2 is not in STRUCTURE/.test(f.what)));
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
    const win = { SCENES: board(), STRUCTURE: structure([scene(1), scene(2)]), FORMAT: 'shorts-9x16', THEME: { accent: '#fff' }, ZZZ: 1 };
    const src = serializeBoard(win, ['// approved: 2026-09-01', '// note']);
    assert.ok(src.startsWith('// note\n'));
    assert.ok(!/approved/.test(src));
    const order = [...src.matchAll(/^window\.([A-Z_]+) =/gm)].map((m) => m[1]);
    assert.deepEqual(order, ['FORMAT', 'THEME', 'STRUCTURE', 'SCENES', 'ZZZ']);
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
});

describe('tool surface', () => {
  it('the three tools exist with handlers and local hints', () => {
    for (const name of ['storyboard_read', 'storyboard_apply', 'storyboard_check']) {
      const tool = TOOLS.find((t) => t.name === name);
      assert.ok(tool, `missing tool ${name}`);
      assert.equal(typeof ROUTES[name], 'function');
      assert.equal(tool.annotations.openWorldHint, false);
      assert.match(tool.description, /Use it/);
      assert.match(tool.description, /Do NOT/);
      assert.match(tool.description, /Returns:/);
    }
    assert.equal(TOOLS.find((t) => t.name === 'storyboard_apply').annotations.readOnlyHint, false);
    assert.equal(TOOLS.find((t) => t.name === 'storyboard_read').annotations.readOnlyHint, true);
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
