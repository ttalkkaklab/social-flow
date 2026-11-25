import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { applyPatch, storyboardApplySchema } from '../dist/storyboard.js';
import { TOOLS } from '../dist/tools.js';
import structure from '../../skills/storyboard/references/structure-contract.js';

describe('eyeline', () => {
  const eye = (extra = {}) => ({ mode: 'exchange', subject: 'A', target: 'B', horizontal: 'right', vertical: 'up', targetDistance: 'near', matchShot: 2, ...extra });
  const shot = (eyeline) => ({ type: 'points', scene: 1, shot: { size: 'mcu', space: { line: 'A left, B right' }, ...(eyeline === undefined ? {} : { eyeline }) } });
  const pair = () => [shot(eye()), shot(eye({ subject: 'B', target: 'A', horizontal: 'left', vertical: 'down', matchShot: 1 }))];
  test('insert remaps references without mutating input and removal refuses dangling references', () => {
    const win = { SCENES: pair() }, before = JSON.stringify(win);
    const r = applyPatch(win, storyboardApplySchema.parse({ path: 'unused', insertShots: [{ after: 0, shots: [{ type: 'points', scene: 1, shot: { size: 'ls' } }] }] }));
    assert.equal(r.win.SCENES[1].shot.eyeline.matchShot, 3);
    assert.equal(r.win.SCENES[2].shot.eyeline.matchShot, 2);
    assert.equal(JSON.stringify(win), before);
    assert.throws(() => applyPatch(win, storyboardApplySchema.parse({ path: 'unused', removeShots: [2] })), /target was removed/);
  });
  test('removeShotIds remaps references like a positional remove and refuses a dropped target (R7)', () => {
    const ids = (xs) => xs.map((s, i) => ({ ...s, id: `s000${i + 1}` }));
    // [s0001, s0002, s0003(matchShot:2)] — dropping s0001 by id must move the reference to 1, not leave it at 2 (itself).
    const base = { SCENES: ids([shot(undefined), shot(undefined), shot(eye({ mode: 'reaction', subject: 'B', target: 'A', matchShot: 2 }))]) };
    const r = applyPatch(base, storyboardApplySchema.parse({ path: 'unused', removeShotIds: ['s0001'] }));
    assert.deepEqual(r.win.SCENES.map((s) => s.id), ['s0002', 's0003']);
    assert.equal(r.win.SCENES[1].shot.eyeline.matchShot, 1);
    assert.throws(() => applyPatch(base, storyboardApplySchema.parse({ path: 'unused', removeShotIds: ['s0002'] })), /target was removed/);
  });
  test('draft rejects a supplied dangling reference while omitted creative metadata stays optional', () => {
    const xs = pair(); xs[0].shot.eyeline.matchShot = 9;
    const STRUCTURE = { version: 'structure-v1', sequences: [{ id: 'q1', title: 'Conversation', purpose: 'Will B answer?', scenes: [1] }], scenes: [{ no: 1, place: 'Kitchen', time: 'Day', event: 'B refuses the request', charge: { open: '+', close: '-' }, turn: 'A loses trust' }] };
    const r = applyPatch({ SCENES: xs, STRUCTURE }, storyboardApplySchema.parse({ path: 'unused', draft: true }));
    assert.ok(r.findings.some(f => f.level === 'bad' && f.what.includes('matchShot')));
  });
});

test('composition, depth and eyeline MCP schemas are shared across every write route', () => {
  const p = TOOLS.find(t => t.name === 'storyboard_apply').inputSchema.properties;
  for (const s of [p.set.properties.shots.items, p.shots.items.properties.shot, p.insertShots.items.properties.shots.items]) {
    const fields = s.properties.shot.properties;
    assert.equal(fields.composition.additionalProperties, true);
    assert.equal(fields.depth.additionalProperties, true);
    assert.equal(fields.eyeline.properties.matchShot.minimum, 1);
  }
});

describe('shot ids', () => {
  const board = ids => ({ SCENES: ids.map(id => ({ ...(id === undefined ? {} : { id }), type: 'points', narration: [] })) });
  const idFindings = findings => findings.filter(f => /^id:/.test(f.what));
  test('shared ID syntax matches the server for defined IDs, including spliced shots and absent structure', () => {
    const invalid = ['return', 's123', 42, null, '', 's0001x', 'S0001'];
    const win = board(invalid); win.SCENES[0].type = 'broll';
    const original = JSON.stringify(win);
    const findings = idFindings(structure.check(win, { draft: true }));
    assert.equal(findings.length, invalid.length);
    assert.ok(findings.every(f => f.level === 'bad'));
    assert.equal(JSON.stringify(win), original);
    assert.deepEqual(idFindings(structure.check(board([undefined, 's0001', 's12345']), { draft: true })), []);
    const duplicate = idFindings(structure.check(board(['s0002', 's0002']), { draft: true }));
    assert.equal(duplicate.length, 1);
    assert.equal(duplicate[0].where, 'shot 2');
    assert.match(duplicate[0].what, /duplicate s0002 \(already used by shot 1\)/);
  });
});


test('shared English staging words do not certify duplicated story information', () => {
  const win = { STORY: { version: 'story-v2' }, STRUCTURE: { version: 'structure-v1',
    sequences: [{ id: 'q1', scenes: [1], title: 'Night', purpose: 'Find a friend' }],
    scenes: [{ no: 1, place: 'Club', time: 'Night', event: 'A friend arrives', summary: 'A friend arrives' }] }, SCENES: [
    { id: 's0001', type: 'points', scene: 1, shot: { info: 'Jeong-eun faces the lens of her tripod camcorder, standing left of the nightclub entrance at night; the closed heavy door is visible behind her right shoulder.' } },
    { id: 's0002', type: 'points', scene: 1, shot: { info: 'Tight close-up of Kang Jin-su speaking seriously to a person outside frame, then glancing toward his friend outside frame. Only Jin-su face and shoulders are visible, warm lounge lights blurred behind him.' } },
  ] };
  const findings = structure.check(win, { draft: true });
  assert.ok(!findings.some(f => /shot.info.*(already|repeats|repeated|says)/.test(f.what)));
  win.SCENES[1].shot.info = win.SCENES[0].shot.info;
  assert.ok(structure.check(win, { draft: true }).some(f => /repeated shot.info text/.test(f.what)));
});

test('a medium shot that lists its characters has a person on screen whatever language its layout uses', () => {
  const shot = (id, cast, layout) => ({ id, type: 'points', scene: 1, visual: { character: cast }, shot: { size: 'ms', space: { layout } } });
  const win = { STORY: { version: 'story-v2' }, STRUCTURE: { version: 'structure-v1',
    sequences: [{ id: 'q1', scenes: [1], title: 'Night', purpose: 'Find a friend' }],
    scenes: [{ no: 1, place: 'Club', time: 'Night', event: 'A friend arrives', summary: 'A friend arrives' }] },
    SCENES: [shot('s0001', ['mina'], 'Mina stands left of the door, waist up'), shot('s0002', [], 'two cups on a table by the window')] };
  const noPerson = structure.check(win, { draft: true }).filter(f => /layout has no person/.test(f.what)).map(f => f.where);
  assert.deepEqual(noPerson, ['shot 2']);
});

test('a shot with a structured opening view owes no composition record', () => {
  const shot = (camera) => ({ type: 'points', scene: 1, visual: { camera }, shot: { size: 'cu' } });
  assert.deepEqual([structure.compositionNeeded(shot({})), structure.compositionNeeded(shot({ view: { subject: 's', reason: 'r', crop: 'c', mode: 'front' } }))], [true, false]);
});

test('a scene sentence is matched by wording only against performance text in the same script', () => {
  const board = (event, out) => ({ STORY: { version: 'story-v2' }, STRUCTURE: { version: 'structure-v1',
    sequences: [{ id: 'q1', scenes: [1], title: 'Night', purpose: 'Find a friend' }],
    scenes: [{ no: 1, place: 'Club', time: 'Night', event, out, summary: 's' }] },
    SCENES: [{ id: 's0001', type: 'points', scene: 1, visual: { character: ['mina'], action: 'Mina opens the door.' },
      performance: [{ kind: 'action', character: 'mina', text: 'Mina opens the door.', durationSeconds: 2 }], shot: { size: 'ms', space: { layout: 'Mina at the door' } } }] });
  const flagged = (win) => structure.check(win, { draft: true }).filter(f => /has no matching layout|is absent from the last shot/.test(f.what)).length;
  assert.deepEqual([flagged(board('미나가 문을 연다', '미나가 문을 연다')), flagged(board('A storm floods the harbour', 'The roof caves in'))], [0, 2]);
});

test('coverage checks respect frame scale, participant arrangement, viewpoint and cut role independently', () => {
  const card = (shot, view) => ({type:'points', scene:1, shot, visual:{camera:view ? {view} : {}}});
  const checks = s => [structure.compositionNeeded(s), structure.depthNeeded(s), structure.eyelineNeeded(s)];
  for (const arrangement of ['two','three']) {
    assert.deepEqual(checks(card({size:'ms',arrangement})), checks(card({size:arrangement})));
    assert.deepEqual(checks(card({size:'ms',arrangement})), [true,true,false]);
  }
  assert.deepEqual(checks(card({size:'ms',cutRole:'reaction'})), checks(card({size:'reaction'})));
  assert.deepEqual(checks(card({size:'ms',cutRole:'insert'})), checks(card({size:'insert'})));
  assert.deepEqual(checks(card({size:'ms'}, {mode:'ots'})), [false,true,true]);
  const view = id => ({subjectId:id, subject:id, mode:'front', crop:'waist up', reason:'recognition'});
  const shots = [card({size:'ms'},view('mina')), card({size:'ms'},view('jun'))];
  const board = {STRUCTURE:{version:'structure-v1',scenes:[{no:1}],sequences:[{id:'q1',scenes:[1]}]},SCENES:shots};
  const cuts = () => structure.check(board, {draft:true}).filter(f => /adjacent picture cut/.test(f.what)).length;
  assert.equal(cuts(), 0);
  shots[1].visual.camera.view = view('mina');
  assert.equal(cuts(), 1);
  shots[1].shot.coverage = {action:'She turns the page.'};
  assert.equal(cuts(), 0);
});
