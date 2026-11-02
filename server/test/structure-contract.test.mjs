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
