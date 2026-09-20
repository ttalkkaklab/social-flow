import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { applyPatch, contract, shotSchema, storyboardApplySchema } from '../dist/storyboard.js';
import { TOOLS } from '../dist/tools.js';
const require = createRequire(import.meta.url);
const { assemble } = require('../../skills/storyboard/references/assemble-bg-prompt.js');
const C = contract();
const eye = (extra = {}) => ({ mode: 'exchange', subject: 'A', target: 'B', horizontal: 'right', vertical: 'up', targetDistance: 'near', matchShot: 2, ...extra });
const shot = (eyeline) => ({ type: 'points', scene: 1, shot: { size: 'mcu', space: { line: 'A left, B right' }, ...(eyeline === undefined ? {} : { eyeline }) } });
const pair = () => [shot(eye()), shot(eye({ subject: 'B', target: 'A', horizontal: 'left', vertical: 'down', matchShot: 1 }))];
const errors = shots => C.checkEyelines(shots, false).filter(f => f.level === 'bad');
test('legacy gaps warn; unrelated cuts omit; enrolled gaze cuts require records; draft defers', () => {
  assert.equal(C.checkEyelines([shot(undefined)], false)[0].level, 'warn');
  assert.deepEqual(C.checkEyelines([{ type: 'points', shot: { size: 'ls' } }], false), []);
  const xs = pair(); delete xs[1].shot.eyeline;
  assert.ok(errors(xs).length);
  assert.ok(C.checkEyelines(xs, true).every(f => f.level === 'later'));
  assert.deepEqual(errors([shot({ mode: 'none', reason: 'Axis follows cart motion' })]), []);
});
test('exchange checks actor pairs, horizontal and vertical direction and distance', () => {
  assert.deepEqual(errors(pair()), []);
  for (const change of [{ horizontal: 'right' }, { vertical: 'up' }, { targetDistance: 'far' }, { target: 'C' }, { mode: 'look' }]) {
    const xs = pair(); Object.assign(xs[1].shot.eyeline, change); assert.ok(errors(xs).length);
  }
});
test('POV and reaction link the same owner and target, missing reaction warns', () => {
  const base = eye({ mode: 'look' }); delete base.matchShot;
  const xs = [shot(base), shot({ ...base, mode: 'pov', matchShot: 1 }), shot({ ...base, mode: 'reaction', matchShot: 2 })];
  assert.deepEqual(C.checkEyelines(xs, false), []);
  assert.ok(C.checkEyelines(xs.slice(0, 2), false).some(f => f.level === 'warn'));
  xs[2].shot.eyeline.matchShot = 1; assert.ok(errors(xs).length);
});
test('schema rejects malformed fields and exceptions without reasons', () => {
  for (const e of [null, [], { mode: 'exchange' }, eye({ horizontal: 'back' }), eye({ extra: true }), { mode: 'none' }, { mode: 'lens', subject: 'A', horizontal: 'left' }])
    assert.equal(shotSchema.safeParse(shot(e)).success, false, JSON.stringify(e));
  assert.equal(shotSchema.safeParse(shot({ mode: 'lens', subject: 'A' })).success, true);
});
test('MCP shares nested eyeline schema across set, upsert and insert', () => {
  const p = TOOLS.find(t => t.name === 'storyboard_apply').inputSchema.properties;
  for (const s of [p.set.properties.shots.items, p.shots.items.properties.shot, p.insertShots.items.properties.shots.items])
    assert.deepEqual(s.properties.shot.properties.eyeline, C.EYELINE_SCHEMA);
});
test('references reject self, absent target and cross-scene links', () => {
  for (const n of [1, 3]) { const xs = pair(); xs[0].shot.eyeline.matchShot = n; assert.ok(errors(xs).length); }
  const xs = pair(); xs[1].scene = 2; assert.ok(errors(xs).length);
});
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
test('source prompts use eyeline but skip none', () => {
  assert.match(assemble({ size: 'mcu', eyeline: eye() }).prompt, /A looks at B, screen-right, up, target distance near/);
  assert.doesNotMatch(assemble({ size: 'ls', eyeline: { mode: 'none', reason: 'landscape' } }).prompt, /No gaze/);
});
test('draft can retain an unresolved reference until camera planning', () => {
  const xs = pair(); xs[0].shot.eyeline.matchShot = 9;
  const STRUCTURE = { version: 'structure-v1', sequences: [{ id: 'q1', title: 'Conversation', purpose: 'Will B answer?', scenes: [1] }], scenes: [{ no: 1, place: 'Kitchen', time: 'Day', event: 'B refuses the request', charge: { open: '+', close: '-' }, turn: 'A loses trust' }] };
  const r = applyPatch({ SCENES: xs, STRUCTURE }, storyboardApplySchema.parse({ path: 'unused', draft: true }));
  assert.ok(r.findings.some(f => f.level === 'later' && f.what.includes('matchShot')));
});
test('shared target and explicit artistic exceptions do not impose reciprocal gaze', () => {
  const a = eye({ mode: 'shared', target: 'door' });
  const b = eye({ mode: 'shared', subject: 'B', target: 'door', vertical: 'level', matchShot: 1 });
  assert.deepEqual(errors([shot(a), shot(b)]), []);
  b.target = 'window'; assert.ok(errors([shot(a), shot(b)]).length);
  const intentional = eye({ mode: 'intentional', reason: 'The cut deliberately disorients the viewer' });
  assert.deepEqual(errors([shot(intentional), shot({ mode: 'lens', subject: 'B' })]), []);
});
