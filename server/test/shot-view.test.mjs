import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const V = require('../../skills/storyboard/references/shot-view.js');
const P = require('../../skills/storyboard/references/assemble-bg-prompt.js');

test('one explicit opening view overrides legacy source directions and yields to a moving end frame', () => {
  const view = { subject: 'Mina’s right hand', reason: 'The hand betrays her words', crop: 'Only the hand and key fill the frame', mode: 'profile-left', target: { point: [.3, -.1, .9], span: .25 } };
  const scene = { shot: { size: 'insert', angle: 'high', space: { facing: 'faces the camera' },
    techniques: [{ id: 'camera.rear' }, { id: 'framing.mcu' }] },
    visual: { camera: { view, framing: 'a frontal portrait', rear: true, movement: 'dolly out', end: 'the whole room is visible' } } };
  const start = P.assemble(P.frameOptions(scene)).prompt;
  assert.match(start, /Only the hand and key fill the frame/);
  assert.match(start, /left profile.*facing camera-left/);
  assert.doesNotMatch(start, /from behind|frontal portrait|faces the camera|chest up/);
  const end = P.assemble(P.frameOptions(scene, 'end')).prompt;
  assert.match(end, /whole room is visible/);
  assert.doesNotMatch(end, /Only the hand|left profile/);
  const clip = P.clipAssemble({ camera: scene.visual.camera, techniques: scene.shot.techniques });
  assert.match(clip.prompt, /Only the hand and key/);
  assert.doesNotMatch(clip.prompt, /frontal portrait|from behind|chest up/);
  assert.ok(!clip.missing.includes('framing'));
  for (const bad of [null, { ...view, mode: 'sideways' }, { ...view, target: { point: [0, 0], span: .2 } },
    { ...view, target: { point: [0, 0, Infinity], span: .2 } }, { ...view, target: { point: [0, 0, 0], span: 0 } },
    { ...view, mode: 'pov' }, { ...view, surprise: true }]) assert.ok(V.validate(bad).length);
});


test('opening view preserves actor relationships without flattening authored lighting', () => {
  const scene = { shot: { size: 'two', space: { layout: 'Mina on the left, Jun on the right', facing: 'They look at each other' } },
    visual: { camera: { view: { subject: 'Mina and Jun', reason: 'exchange', crop: 'both waist up', mode: 'front' } } } };
  const prompt = P.assemble({ ...P.frameOptions(scene), scene: 'Overhead spotlight with deep shadows below.' }).prompt;
  assert.match(prompt, /Mina on the left, Jun on the right/);
  assert.match(prompt, /They look at each other/);
  assert.match(prompt, /deep shadows below/);
  assert.doesNotMatch(prompt, /even brightness/);
});

test('person crop boundaries survive an explicit view while detail and object crops stay anatomical-word free', () => {
  const view = { subject: 'Mina', reason: 'Reaction', crop: 'Mina centered, looking camera-left', mode: 'front' };
  for (const [size, expected] of [['fs', /head to toe/], ['ms', /waist up/], ['mcu', /chest up/], ['cu', /face and the top of the shoulders/]]) {
    const result = P.assemble({ size, camera: { view }, techniques: [{ id: 'framing.els' }] });
    assert.match(result.prompt, expected);
    assert.doesNotMatch(result.prompt, /extreme long shot/);
  }
  for (const subjectType of ['object', 'detail']) {
    const prompt = P.assemble({ size: 'cu', camera: { view: { ...view, subjectType, subject: 'The key', crop: 'Only the key fills the frame' } } }).prompt;
    assert.doesNotMatch(prompt, /shoulders|crown|chest up/);
  }
  for (const size of ['cu', 'choker']) {
    const rear = P.assemble({ size, camera: { view: { ...view, mode: 'rear' } } }).prompt;
    assert.match(rear, /back of the head/);
    assert.doesNotMatch(rear, /the face|forehead to chin/);
  }
  assert.ok(V.validate({ ...view, subjectType: 'unknown' }).length);
});

test('contradictory opening crop declarations fail before generation without treating incidental prose as a crop', () => {
  for (const size of ['els', 'ls', 'fs', 'mfs', 'ms', 'mcu', 'cu', 'choker', 'ecu'])
    assert.doesNotThrow(() => P.assemble({ size, scene: P.SIZE_WORDS[size] }), size);
  const view = { subject: 'Mina', reason: 'Reaction', crop: 'Full body, head to toe, both feet visible', mode: 'front' };
  assert.throws(() => P.assemble({ size: 'cu', camera: { view } }), /shot_framing_conflict/);
  assert.throws(() => P.assemble({ size: 'ms', camera: { framing: 'chest-up portrait' } }), /shot_framing_conflict/);
  assert.throws(() => P.assemble({ size: 'insert', scene: 'Wide shot of the entire room.' }), /shot_framing_conflict/);
  assert.doesNotThrow(() => P.assemble({ size: 'cu', scene: 'She examines a full-body portrait. Her feet shuffle.' }));
  assert.doesNotThrow(() => P.assemble({ size: 'cu', camera: { view: { ...view, crop: 'Face fills the frame; no full body' } } }));
  const end = P.assemble(P.frameOptions({ shot: { size: 'cu' }, visual: { camera: { view, movement: 'dolly out', end: 'Full body, head to toe' } } }, 'end'));
  assert.match(end.prompt, /Full body/);
});
