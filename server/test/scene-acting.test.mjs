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

test('a native line is timed from its syllables and pauses in its own language; only Korean is calibrated', () => {
  const {estimateSpeech, estimateSpeechSeconds, planScenePerformance} = require('../../skills/_shared/scene-acting.js');
  assert.equal(estimateSpeechSeconds('너도 담배냐?'), 1.51);
  assert.ok(estimateSpeechSeconds('자진신고해라. 안 하면 정학이다.') > estimateSpeechSeconds('자진신고해라 안 하면 정학이다'));
  assert.equal(estimateSpeechSeconds(undefined), null);
  assert.equal(estimateSpeechSeconds('...', 'en'), null);
  assert.equal(estimateSpeechSeconds('[laughs]', 'en'), null);   // an acting tag is a direction, not speech
  assert.equal(estimateSpeech('너도 담배냐?', 'en').calibrated, true);   // the script wins over the board's language
  // units / rate + 0.35 per inner pause + 0.4
  for (const [text, language, detected, units, rate, pauses] of [
    ['Give me your hand.', 'en', 'en', 4, 3.7, 0],              // "give" drops its silent e
    ['The table is mine.', 'en', 'en', 5, 3.7, 0],              // "table" keeps -le, "mine" drops its e
    ['手、貸して。', 'ja', 'ja', 6, 4.7, 1],                      // two kanji at two morae, two kana
    ['学校', 'ja', 'ja', 4, 4.7, 0],                             // kanji alone reads as Japanese on a Japanese board
    ['学校', undefined, 'zh', 2, 3.1, 0],                        // and as Chinese without one
    ['把手给我。', 'zh-Hans', 'zh', 4, 3.1, 0],
    ['Đưa tay đây.', undefined, 'vi', 3, 3.1, 0],               // one written word is one syllable
    ['Dame la mano, por favor.', 'es', 'es', 8, 4.7, 1],
    ['Elle parle encore.', 'fr', 'fr', 4, 4.3, 0],              // el-le drops to one, par-le to one, en-core to two
    ['Gib mir deine Hand, bitte.', 'de', 'de', 7, 3.6, 1],      // German keeps every final e
    ['Hello there', undefined, 'latin', 4, 3.6, 0],             // an unnamed Latin-script language: no silent letters, the slowest rate
  ]) assert.deepEqual(estimateSpeech(text, language), {seconds: Math.round((units / rate + 0.35 * pauses + 0.4) * 100) / 100, language: detected, calibrated: false}, text);
  const shot = {narration: [{id: 'l1', speaker: 'a', tts: '너도 담배냐?', acting: {tailOutSeconds: 0.5}}],
    performance: [{kind: 'dialogue', character: 'a', group: 1}, {kind: 'action', text: 'He waits.', durationSeconds: 0.7}]};
  assert.equal(planScenePerformance(shot, line => estimateSpeechSeconds(line.tts)).durationSeconds, 1.51 + 0.5 + 0.7);
});

test('a beat says each thing once and gives voice direction only to a model that voices the line', () => {
  const {performanceBeats} = require('../../skills/_shared/scene-acting.js');
  const plan = [{kind:'action',character:'bin',text:'Bin points at the cafe.',withGroup:1,startSeconds:null,endSeconds:null},
    {kind:'dialogue',group:1,speaker:'bin',to:'bo',delivery:'on_screen',text:'Look.',leadInSeconds:0,tailOutSeconds:0,
      acting:{context:'Bin points at the cafe.',intent:'Get his attention.',vocal:'Bright and quick.',visual:'Bin points at the cafe.'}}];
  const supplied = performanceBeats(plan, 'audio_conditioned').join(' ');
  assert.equal((supplied.match(/Bin points at the cafe/g) || []).length, 1);
  assert.match(supplied, /intent: Get his attention\./);
  assert.doesNotMatch(supplied, /vocal:|Preserve the authored crop|Timing unresolved|Anticipation 0/);
  assert.match(performanceBeats(plan, 'native').join(' '), /vocal: Bright and quick\./);
  assert.doesNotMatch(performanceBeats(plan, 'native', true, {brief:true}).join(' '), /intent:|vocal:/);
});
