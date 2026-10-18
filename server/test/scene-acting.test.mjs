import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {sceneDirection, sceneVideoPrompt} = require('../../skills/_shared/scene-acting.js');

test('a static camera preserves framing without freezing the planned actor action', () => {
  const scene = {
    shot: {videoDesign: {action: 'The woman walks left with the tea tray.'}},
    visual: {camera: {
      framing: 'Medium view of the woman and doorway.',
      movement: 'static',
      speed: 'walking speed',
      end: 'The woman stops outside the same doorway.'
    }}
  };
  const prompt = sceneVideoPrompt([], 'voiceover', scene);
  assert.match(prompt, /preserve the opening framing, camera angle, focal length and background scale/);
  assert.match(prompt, /The woman walks left with the tea tray/);
  assert.doesNotMatch(prompt, /Camera speed:|walking speed/);
});

test('all supported static aliases suppress speed and keep the framing lock', () => {
  for (const movement of ['static', 'fixed camera', 'locked camera', 'locked-off camera', 'locked off camera']) {
    const prompt = sceneDirection({visual: {camera: {movement, speed: 'walking speed'}}});
    assert.match(prompt, /Locked camera:/, movement);
    assert.doesNotMatch(prompt, /Camera speed:|walking speed/, movement);
  }
});

test('a travelling camera retains its authored speed and endpoint without a static lock', () => {
  const scene = {visual: {camera: {
    framing: 'Wide veranda with woman at right.',
    movement: 'dolly in',
    speed: 'slow',
    end: 'Closer view of the doorway and listener.'
  }}};
  const prompt = sceneDirection(scene);
  assert.match(prompt, /Camera movement: dolly in/);
  assert.match(prompt, /Camera speed: slow/);
  assert.match(prompt, /Camera end: Closer view of the doorway and listener/);
  assert.doesNotMatch(prompt, /Locked camera:/);
  assert.doesNotMatch(sceneDirection({}), /Locked camera:/);
});
