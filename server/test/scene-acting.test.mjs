import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {sceneDirection, sceneVideoPrompt} = require('../../skills/_shared/scene-acting.js');

test('gateway reference voices work without voice-design instructions', () => {
  const {directionSupport} = require('../../skills/_shared/scene-acting.js');
  const {compileActing} = require('../../skills/_shared/speech-contract.js');
  const voice = {engine:'astra-genai', model:'voxcpm2', voiceId:'actor', speed:1};
  for (const acting of [undefined, {visual:'Facing the board', leadInSeconds:0}]) {
    assert.equal(directionSupport(voice, acting).supported, true);
    assert.deepEqual(compileActing('Hello.', acting, voice).generation,
      {model:'voxcpm2', text:'Hello.', voice:'actor', speed:1});
  }
});

test('speech planning uses the same detail view as image generation', () => {
  const prompt = sceneDirection({ shot: { techniques: [{id:'camera.rear'}, {id:'framing.cu'}] }, visual: { camera: {
    view: {subject:'Mina’s hand',crop:'Only fingers and the key fill the frame',reason:'Reveal the hidden grip',mode:'profile-left'},
    framing:'frontal portrait', movement:'static'
  } } });
  assert.match(prompt,/Only fingers and the key/);
  assert.match(prompt,/left profile/);
  assert.doesNotMatch(prompt,/frontal portrait|from behind/);
});

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
