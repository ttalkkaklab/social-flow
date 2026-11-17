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

test('addressed speech preserves an insert instead of adding the listener or a speaking face', () => {
  const {performanceBeats} = require('../../skills/_shared/scene-acting.js');
  const scene = {visual: {character: ['hero'], camera: {movement: 'static', view: {
    subject: 'The employee gripping a bag strap', subjectType: 'detail', mode: 'profile-left',
    crop: 'Only the hands and bag strap; both faces outside frame', reason: 'The grip betrays fear'
  }}}};
  const performance = [{kind: 'dialogue', speaker: 'hero', to: 'manager', delivery: 'off_screen',
    text: 'I will check it.', leadInSeconds: 0, tailOutSeconds: 0}];
  const prompt = sceneVideoPrompt(performance, 'native', scene);
  assert.match(prompt, /Only the hands and bag strap/);
  assert.match(prompt, /Addressed to manager/);
  assert.match(prompt, /retain any planned hands or body detail/);
  assert.doesNotMatch(prompt, /Preserve this eyeline and the listener|speakers unseen|speaker stays off screen/);
  // The MSR compiler consumes these beats without quoted dialogue, too.
  const mapped = performanceBeats(performance, 'native', false).join('\n');
  assert.match(mapped, /the addressee need not appear in frame/);
  assert.doesNotMatch(mapped, /I will check it/);
  const onScreen = performanceBeats([{...performance[0], delivery: 'on_screen'}], 'native').join('\n');
  assert.match(onScreen, /Show this speaker physically saying/);
  assert.match(onScreen, /every other visible mouth stays closed/);
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

test('a native line is timed from its Hangul syllables and pauses; other scripts stay unknown', () => {
  const {estimateSpeechSeconds, planScenePerformance} = require('../../skills/_shared/scene-acting.js');
  assert.equal(estimateSpeechSeconds('너도 담배냐?'), 1.51);
  assert.ok(estimateSpeechSeconds('자진신고해라. 안 하면 정학이다.') > estimateSpeechSeconds('자진신고해라 안 하면 정학이다'));
  assert.equal(estimateSpeechSeconds('Hello there'), null);
  assert.equal(estimateSpeechSeconds(undefined), null);
  const shot = {narration: [{id: 'l1', speaker: 'a', tts: '너도 담배냐?', acting: {tailOutSeconds: 0.5}}],
    performance: [{kind: 'dialogue', character: 'a', group: 1}, {kind: 'action', text: 'He waits.', durationSeconds: 0.7}]};
  assert.equal(planScenePerformance(shot, line => estimateSpeechSeconds(line.tts)).durationSeconds, 1.51 + 0.5 + 0.7);
});
