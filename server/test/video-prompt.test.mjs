import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileVideoPrompt } from '../dist/video-prompt.js';

test('current icon values compile with viewpoint and explicit delivery bindings', () => {
  const shot = { shot: { render: { mode: 'generated_video' }, size: 'ms', angle: 'eye',
    techniques: [{ id: 'camera.dolly-in' }, { id: 'camera.rear' }, { id: 'camera.rack-focus', from: 'the pouch', to: 'the leader' }] },
    visual: { frames: { mode: 'reference' }, camera: { movement: 'dolly in', speed: 'slow', target: 'the leader' } }, transition: 'dip' };
  const source = { action: 'The leader weighs the pouch.', sound: 'wind' };
  const before = compileVideoPrompt(shot, source);
  assert.match(before.prompt, /Medium shot, waist up, at eye level/);
  assert.match(before.prompt, /slowly pushes in toward the leader/);
  assert.match(before.prompt, /View the subject from behind/);
  assert.match(before.prompt, /Rack focus from the pouch to the leader/);
  assert.equal(before.directionBindings.find(b => b.attribute === 'framePlan').via, 'adapter');
  assert.equal(before.directionBindings.find(b => b.attribute === 'transition').via, 'assembly');
  shot.visual.camera = { movement: 'static' };
  shot.shot.techniques = [{ id: 'camera.static' }];
  const after = compileVideoPrompt(shot, source);
  assert.match(after.prompt, /holds a static frame/);
  assert.doesNotMatch(after.prompt, /pushes in|Rack focus|from behind/);
  assert.deepEqual(source, { action: 'The leader weighs the pouch.', sound: 'wind' });
  shot.shot.techniques.push({ id: 'unknown.technique' });
  assert.equal(compileVideoPrompt(shot, source).directionBindings.find(b => b.value === 'unknown.technique').via, 'unmapped');
  shot.shot.techniques.push({ id: 'timing.dialogue' });
  assert.equal(compileVideoPrompt(shot, source).directionBindings.find(b => b.value === 'timing.dialogue').via, 'guidance');
});
