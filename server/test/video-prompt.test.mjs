import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileVideoPrompt, sceneCameraDirection } from '../dist/video-prompt.js';

test('MSR and frame video prompts keep the authored detail view instead of old portrait instructions', () => {
  const view = { subject: 'Mina’s fingers', crop: 'Only the fingers and the key fill the frame', reason: 'The grip reveals her fear', mode: 'profile-right' };
  for (const mode of ['reference', 'first']) {
    const shot = { shot: { size: 'cu', angle: 'eye', techniques: [{ id: 'camera.rear' }] },
      visual: { frames: { mode }, camera: { view, framing: 'a frontal portrait', rear: true, movement: 'static' } } };
    const compiled = compileVideoPrompt(shot, { action: 'The fingers tighten.' });
    assert.match(compiled.prompt, /Only the fingers and the key/);
    assert.match(compiled.prompt, /right profile.*facing camera-right/);
    assert.doesNotMatch(compiled.prompt, /from behind|frontal portrait|face and/);
    assert.equal(compiled.directionBindings.find(b => b.attribute === 'view').via, 'prompt');
  }
});

test('an action move and its beat accents compile into the prompt, each accent on its named moment', () => {
  const shot = { shot: { render: { mode: 'generated_video' }, techniques: [{ id: 'camera.crash-zoom' },
    { id: 'camera.speed-ramp', on: 'the moment the kick lands' }, { id: 'camera.impact-shake' }] },
    visual: { frames: { mode: 'first' }, camera: { movement: 'zoom in crash', speed: 'fast', target: 'the drone lens' } } };
  const { prompt, directionBindings, warnings } = compileVideoPrompt(shot, { action: 'The courier stops.' });
  assert.match(prompt, /The camera quickly crash zooms onto the drone lens in under half a second/);
  assert.match(prompt, /slows almost to a stop at the moment the kick lands, then snaps back/);
  assert.match(prompt, /jolts once on each impact and settles/); // no moment given: the accent's own default
  assert.doesNotMatch(prompt, /\{(cue|target)\}/);
  assert.equal(directionBindings.find(b => b.value === 'camera.speed-ramp').via, 'prompt');
  assert.deepEqual(warnings, []);
});

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

test('temporal action, measured speech and reactions use one timeline; MSR dialogue stays slot-bound', () => {
  const shot = { performance: [{kind:'action',character:'hero',text:'Opens the door.',durationSeconds:1},
    {kind:'dialogue',character:'hero',group:1},{kind:'action',character:'hero',text:'Turns away.',durationSeconds:2}],
    narration:[{id:'l1',speaker:'hero',delivery:'on_screen',tts:'Wait.',acting:{leadInSeconds:.2,tailOutSeconds:.3}}],
    visual:{frames:{mode:'reference'}},shot:{videoDesign:{motion:{beats:[{state:'The handle is fully released.'}]}}} };
  const compiled=compileVideoPrompt(shot,{action:'The hero enters.'},{},{mode:'native'});
  assert.equal(compiled.performance.timing,'model_timed');
  assert.equal(compiled.performance.performance[2].startSeconds,null);
  assert.doesNotMatch(compiled.prompt,/"Wait\."/);
  assert.match(compiled.prompt,/Opens the door/);
  assert.match(compiled.prompt,/Visible state: The handle is fully released/);
  const measured=compileVideoPrompt(shot,{action:'The hero enters.'},{},{mode:'audio_conditioned',measureAudio:()=>2});
  assert.equal(measured.performance.durationSeconds,5.5);
  assert.equal(measured.performance.performance[1].speechStartSeconds,1.2);
  assert.equal(measured.performance.performance[2].startSeconds,3.5);
  assert.match(measured.prompt,/Speech interval 1.2–3.2/);
  assert.doesNotMatch(measured.prompt,/"Wait\."/);
});

test('a one-word thought can coincide with the standard subtitle and audio policies', () => {
  for (const tts of ['No.', 'No music.', 'Closed.']) {
    const shot = { narration: [{speaker:'hero', delivery:'voiceover', voiceoverKind:'inner_thought', tts}] };
    const {prompt} = compileVideoPrompt(shot, {action:'She hides the key.',sound:'Gentle wind'});
    assert.match(prompt, /She hides the key/);
    assert.doesNotMatch(prompt, /["“]No\./i);
  }
});

test('the shot expression is named and held in the video prompt', () => {
  const shot = { shot: { size: 'mcu', angle: 'eye' }, visual: { frames: { mode: 'first' }, camera: { movement: 'static' },
    expression: { 'na-ri': 'brows drawn together, lips pressed shut.' } } };
  const { prompt } = compileVideoPrompt(shot, { action: 'She nods once.' }, { 'na-ri': 'Na-ri' });
  assert.match(prompt, /She nods once\. Expressions, held to the last frame unless the action changes them: Na-ri: brows drawn together, lips pressed shut\./);
});

test('a bystander and extras stay in the video prompt as people the opening picture shows', () => {
  const shot = { shot: { size: 'ls', angle: 'eye' }, visual: { frames: { mode: 'reference' }, character: ['coach'], bystanders: ['bin'], extras: 'four children in orange bibs chase a ball' } };
  const { prompt } = compileVideoPrompt(shot, { action: 'The coach points at the far goal.' });
  assert.match(prompt, /The opening picture also shows bin, who stays in the frame and never speaks\./);
  assert.match(prompt, /Unnamed people in the frame: four children in orange bibs chase a ball\./);
  assert.doesNotMatch(compileVideoPrompt({ ...shot, visual: { frames: { mode: 'reference' }, character: ['coach'] } }, { action: 'x' }).prompt, /opening picture also|Unnamed people/);
});

test('a movement written without its technique takes the catalogue sentence; an unchosen move is named', () => {
  const shot = { shot: {}, visual: { frames: { mode: 'first' }, camera: { movement: 'dolly in', speed: 'slow', target: 'the gate' } } };
  const { prompt, warnings } = compileVideoPrompt(shot, { action: 'She stops.' });
  assert.match(prompt, /The camera slowly pushes in toward the gate/);
  shot.visual.camera.movement = 'dolly in along the left rail after the latch opens';
  const detailed = compileVideoPrompt(shot, { action: 'She stops.' }).prompt;
  assert.match(detailed, /along the left rail after the latch opens/);
  assert.match(detailed, /the gate/);
  const locked = compileVideoPrompt(shot, { action: 'Preserve the opening image composition. She stops.' });
  assert.ok(locked.warnings.some(w => w.startsWith('camera_move_contradicted')));
  assert.doesNotMatch(prompt, /Camera: /);
  assert.ok(!warnings.some(w => w.startsWith('camera_move_unset')));
  assert.ok(compileVideoPrompt({ shot: {}, visual: { frames: { mode: 'first' } } }, { action: 'x' }).warnings.some(w => w.startsWith('camera_move_unset')));
});

test('a prompt over the limit lets design notes, acting fields and expressions go before the camera, action or lines', () => {
  const long = word => (word + ' ').repeat(60).trim();
  const shot = { shot: { techniques: [{ id: 'camera.dolly-in' }], videoDesign: { before: long('lamp'), continuity: long('rain') } },
    visual: { frames: { mode: 'first' }, camera: { movement: 'dolly in', speed: 'slow', target: 'Bo' }, expression: { bo: long('calm') } },
    performance: [{ kind: 'action', character: 'bo', text: 'Bo turns.', withGroup: 1 }, { kind: 'dialogue', character: 'bo', group: 1 }],
    narration: [{ id: 'l1', speaker: 'bo', delivery: 'on_screen', tts: 'Wait.', acting: { context: long('cafe'), intent: 'Stop her.' } }] };
  const full = compileVideoPrompt(shot, { action: 'Bo turns.' }, {}, { mode: 'native' });
  const fitted = compileVideoPrompt(shot, { action: 'Bo turns.' }, {}, { mode: 'native', maxCharacters: 700 });
  assert.ok(full.prompt.length > 700 && fitted.prompt.length <= 700, `${full.prompt.length} → ${fitted.prompt.length}`);
  assert.match(fitted.prompt, /The camera slowly pushes in toward Bo/);
  assert.match(fitted.prompt, /Bo turns\..*"Wait\."/);
  assert.doesNotMatch(fitted.prompt, /lamp|rain|cafe/);
  assert.ok(fitted.warnings.some(w => w.startsWith('prompt_fitted')));
  // The action an action beat already carries is said once.
  assert.equal((full.prompt.match(/Bo turns/g) || []).length, 1);
});

test('cameraDrift names a hand-written prompt that drops or locks the board move', async () => {
  const { cameraDrift } = await import('../dist/video-prompt.js');
  assert.equal(cameraDrift('Camera: dolly in. Bo points.', 'dolly in'), null);
  assert.equal(cameraDrift('The camera slowly zooms in on the subject from a fixed position.', 'zoom in'), null);
  assert.equal(cameraDrift('Camera stays locked so their movements are unmistakable.', 'dolly in'), 'contradicted');
  assert.equal(cameraDrift('Keep close camera and clean image.', 'zoom in'), 'missing');
  assert.equal(cameraDrift('The camera does not move. Then the camera approaches the card.', 'dolly in'), null);
  assert.equal(cameraDrift('Static camera.', 'static'), null);
  assert.equal(cameraDrift('The camera pans left.', 'pan right'), 'contradicted');
  assert.equal(cameraDrift('Pan right to the cafe counter.', 'pan right'), null);
  assert.equal(cameraDrift('She says "the camera pans right." She walks toward the camera.', 'pan right'), 'missing');
  assert.equal(cameraDrift('Preserve the opening image composition and screen sides.', 'tracking from behind'), 'contradicted');
  assert.equal(cameraDrift('The subject approaches the camera.', 'dolly in'), 'missing');
  assert.equal(cameraDrift('The camera pushes in on the locked door.', 'dolly in'), null);
  assert.equal(cameraDrift('The camera zooms in.', 'pan right'), 'contradicted');
  assert.equal(cameraDrift('The camera never pans right.', 'pan right'), 'contradicted');
  assert.equal(cameraDrift('Push in on her face as she turns toward the camera.', 'dolly in'), null);
  assert.equal(cameraDrift('The camera stays with the hand as she pushes the button.', 'dolly in'), 'missing');
  assert.equal(cameraDrift('The camera pushes in.', 'static'), 'contradicted');
  assert.equal(cameraDrift('Continuous forward walking, camera tracks backward.', 'truck parallel to the subject'), 'contradicted');
  assert.equal(cameraDrift('A steady shot tracking the pupils at a walk.', 'truck parallel to the subject'), null);
});

test('scene camera preserves shared direction, a single deliberate hold and unspecified coverage', () => {
  const card = (id, camera) => ({ id, duration: 3, visual: { camera } });
  const tracking = { movement: 'tracking from behind', target: 'Follow Mochi through the doorway; settle beside the bed.' };
  const move = sceneCameraDirection([card('a', tracking), card('b', tracking)]);
  assert.deepEqual(move.bindings[0].value.shotIds, ['a', 'b']);
  assert.equal(move.instruction.match(/Follow Mochi/g).length, 1);
  assert.doesNotMatch(move.instruction, /behind Follow|From 0/);
  assert.match(sceneCameraDirection([card('a', {movement:'static'})]).instruction, /static frame/);
  assert.equal(sceneCameraDirection([card('a', {movement:'static'}), card('b', {})]).instruction, '');
  assert.equal(sceneCameraDirection([card('a', {})]).instruction, '');
  const foreign = sceneCameraDirection([card('a', { movement:'pan left', end:'창문' })]);
  assert.equal(foreign.instruction, '');
  assert.match(foreign.warnings[0], /scene_camera_unresolved.*a \(pan left\)/);
});
