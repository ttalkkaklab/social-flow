import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const C = require('../../skills/storyboard/references/previz-contract.js');
const spec = () => ({ fps: 24, seconds: 5, width: 1080, height: 1920,
  camera: { lensMm: 35, keys: [{ frame: 1, position: [0, -4, 1.4], target: [0, 0, 1] }, { frame: 120, position: [2, -2, 1.4], target: [0, 0, 1] }] },
  actors: [{ name: 'porter', kind: 'person', color: '#d0342c', height: 1.75, keys: [{ frame: 1, position: [0, 0, 0] }, { frame: 120, position: [1, 0, 0], rotationZDeg: 90 }] },
    { name: 'gate', kind: 'box', size: [2, .3, 2.5], keys: [{ frame: 1, position: [0, 1.5, 0] }] }] });
test('a previz spec is whole seconds at 24–60 fps on an even canvas, with a lens, keys and actors', () => {
  assert.deepEqual(C.checkSpec(spec()), []);
  const cases = [
    [s => { s.seconds = 4.5; }, /whole number/], [s => { s.fps = 23.976; }, /24–60/], [s => { s.width = 1079; }, /even/],
    [s => { delete s.camera; }, /camera/], [s => { s.camera.lensMm = 4; }, /lensMm/], [s => { s.camera.keys = []; }, /needs keys/],
    [s => { s.camera.keys[1].frame = 1; }, /repeats frame/], [s => { s.camera.keys[1].frame = 200; }, /past the last frame/],
    [s => { s.camera.keys[0].target = s.camera.keys[0].position; }, /differ/], [s => { s.actors = []; }, /at least one/],
    [s => { s.actors[0].kind = 'dragon'; }, /kind must be/], [s => { s.actors[0].color = 'red'; }, /#rrggbb/],
    [s => { delete s.actors[0].height; }, /person needs height/], [s => { s.actors[1].size = [2, 0, 1]; }, /box needs size/],
    [s => { s.actors[1].name = 'porter'; }, /repeats the name/], [s => { s.actors[0].keys[0].position = [0, 0]; }, /position/],
  ];
  for (const [edit, re] of cases) { const s = spec(); edit(s); assert.match(C.checkSpec(s).join('; '), re); }
});
test('keys interpolate linearly by frame and clamp outside their range, like the bridge', () => {
  const s = spec();
  assert.deepEqual(C.sampleCamera(s, 60.5).position, [1, -3, 1.4]);
  assert.deepEqual(C.sampleCamera(s, 1).position, [0, -4, 1.4]);
  assert.deepEqual(C.sampleCamera(s, 400).position, [2, -2, 1.4]);
  assert.equal(C.sampleActor(s.actors[0], 60.5).rotationZDeg, 45);
  assert.deepEqual(C.sampleActor(s.actors[1], 50), { position: [0, 1.5, 0], rotationZDeg: 0 });
  // The page's local time → the 1-based frame: t = 0 is frame 1, the last frame is fps × seconds.
  assert.equal(C.frameAt(s, 0), 1); assert.equal(C.frameAt(s, 1000), 25); assert.equal(C.frameAt(s, 99999), 120);
});
test('Blender coordinates map to three.js and a 36 mm sensor sits on the longer side', () => {
  assert.deepEqual(C.toThree([1, 2, 3]), [1, 3, -2]);
  // Portrait: the vertical is the longer side, so the vertical fov is the sensor fov itself.
  const v = C.fovVertical(35, 1080, 1920);
  assert.ok(Math.abs(v - 2 * Math.atan(18 / 35) * 180 / Math.PI) < 1e-9);
  // Landscape: the horizontal is the longer side; the vertical angle is narrower by the aspect.
  const l = C.fovVertical(35, 1920, 1080);
  assert.ok(l < v && Math.abs(Math.tan(l * Math.PI / 360) * 1920 / 1080 - Math.tan(v * Math.PI / 360)) < 1e-9);
  assert.equal(C.actorExtent({ kind: 'car' }).depth, 4.4);
});
