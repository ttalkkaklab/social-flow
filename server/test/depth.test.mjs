import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { contract, shotSchema } from '../dist/storyboard.js';
import { TOOLS } from '../dist/tools.js';
const require = createRequire(import.meta.url);
const C = contract();
const shallow = extra => ({ mode: 'shallow', reads: 1, focus: "A's eyes", ...extra });
const deep = extra => ({ mode: 'deep', reads: 3, planes: ['the cup', 'A at the table', 'the window'], ...extra });
const shot = (d, size = 'mcu') => ({ type: 'points', scene: 1, shot: { size, ...(d === undefined ? {} : { depth: d }) } });
const bad = xs => C.checkDepths(xs, false).filter(f => f.level === 'bad');
const warns = xs => C.checkDepths(xs, false).filter(f => f.level === 'warn');
test('depth legacy, scene enrollment and draft behavior', () => {
 assert.equal(C.checkDepths([shot()], false)[0].level, 'warn');
 assert.ok(bad([shot(shallow()), shot()]).length);
 assert.ok(C.checkDepths([shot(shallow()), shot()], true).some(f => f.level === 'later'));
 assert.deepEqual(C.checkDepths([shot({ mode: 'none', reason: 'Flat graphic' })], false), []);
 assert.deepEqual(C.checkDepths([{ type: 'points', shot: { size: 'ls' } }], false), []);
 assert.ok(C.depthNeeded({ type: 'points', shot: { size: 'ls', render: { mode: 'still_camera', camera: { effect: 'rack-focus' } } } }));
 assert.equal(C.depthNeeded({ type: 'points', shot: { size: 'cu', render: { mode: 'object_html' } } }), false);
});
test('depth schema rejects invalid values and ties the fields to the mode', () => {
 for (const d of [null, [], {}, shallow({ extra: true }), shallow({ reads: 0 }), deep({ planes: ['one'] }), shallow({ planes: ['a', 'b'] }), deep({ focus: 'x' }), shallow({ reads: 2 }), deep({ reads: 1 }), { mode: 'none' }, { mode: 'none', reason: 'x', reads: 1 }, shallow({ sound: 'loud' })])
  assert.equal(shotSchema.safeParse(shot(d)).success, false, JSON.stringify(d));
 for (const d of [shallow(), deep(), shallow({ reads: 2, reason: 'The letter matters only as a shape' }), deep({ reads: 1, reason: 'The room is the point' }), shallow({ sound: 'near' })])
  assert.equal(shotSchema.safeParse(shot(d)).success, true, JSON.stringify(d));
 assert.deepEqual(C.validateDepth(deep()), []);
});
test('deep focus cannot ride a still-camera focus effect', () => {
 const s = shot(deep(), 'ms'); s.shot.render = { mode: 'still_camera', camera: { effect: 'focus-in' } };
 assert.ok(bad([s]).some(f => /focus-in/.test(f.what)));
 s.shot.depth = shallow(); assert.deepEqual(bad([s]), []);
});
test('depth cross-checks warn on faces, partners and sound perspective', () => {
 const face = shot(shallow({ focus: 'the hands' })); face.shot.composition = { mode: 'standard', subject: 'A', subjectKind: 'face', position: 'left', eyeHeight: .33, headroom: 'natural', lookRoom: 'right', movement: 'stationary', leadRoom: 'none' };
 assert.ok(warns([face]).some(f => /eyes/.test(f.what)));
 assert.ok(warns([shot(shallow(), 'two')]).some(f => /partner/.test(f.what)));
 assert.ok(warns([shot(deep({ sound: 'near' }))]).some(f => /sound/.test(f.what)));
 assert.deepEqual(warns([shot(shallow({ sound: 'near' }))]), []);
});
test('depth MCP schema is shared across every write route', () => {
 const p = TOOLS.find(t => t.name === 'storyboard_apply').inputSchema.properties;
 for (const s of [p.set.properties.shots.items, p.shots.items.properties.shot, p.insertShots.items.properties.shots.items])
  assert.deepEqual(s.properties.shot.properties.depth, C.DEPTH_SCHEMA);
});
test('depth reaches image prompt and respects none', () => {
 const { assemble } = require('../../skills/storyboard/references/assemble-bg-prompt.js');
 assert.match(assemble({ scene: 'A waits', depth: shallow() }).prompt, /Shallow depth of field: only A's eyes is sharp/);
 assert.match(assemble({ scene: 'A waits', depth: deep() }).prompt, /Deep focus: the cup, A at the table, the window/);
 assert.doesNotMatch(assemble({ scene: 'A waits', depth: { mode: 'none', reason: 'Flat' } }).prompt, /focus/);
});
