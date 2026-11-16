import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileVideoPrompt } from '../dist/video-prompt.js';

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
