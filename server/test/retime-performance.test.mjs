import { setupProject } from './workflow-fixture.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { retime } = require('../../skills/produce/references/retime-performance.js');
const scene = {duration: 8.041667, narration:[{id:'line', speaker:'actor', tts:'Line', acting:{leadInSeconds:0.12,tailOutSeconds:0.35}}], performance:[{kind:'action',text:'Speak',withGroup:1,durationSeconds:7.9},{kind:'dialogue',character:'actor',group:1}]};
test('explicit speech-bound retiming removes inherited length without changing speech or the input', () => {
  const result = retime(scene, {speechBoundActions:true}, () => 2.13);
  assert.equal(result.scene.duration, 2.6);
  assert.deepEqual(result.scene.narration, scene.narration);
  assert.equal(scene.performance[0].durationSeconds, 7.9);
});
test('default retiming preserves authored action and standalone action edits are explicit', () => {
  assert.equal(retime(scene, {}, () => 2.13).scene.duration, 8.02);
  const silent = {performance:[{kind:'action',text:'Leave',durationSeconds:8.041667}]};
  assert.equal(retime(silent, {actions:[[0,4]]}, () => null).scene.duration, 4);
  assert.throws(() => retime(scene,{actions:[[1,2]]},()=>2), /action index/);
});

const { prefixCompatible } = require('../../skills/_shared/performance-retiming.js');
const { planScenePerformance, sceneVideoPrompt, scenePerformancePayload } = require('../../skills/_shared/scene-acting.js');
function plan(s) { const t=planScenePerformance(s,()=>2.13); const {performance,narration,...context}=scenePerformancePayload(s); return {...t,reuseContextRevision:JSON.stringify(context),videoPrompt:sceneVideoPrompt(t.performance,'audio_conditioned',s)}; }
test('prefix reuse permits a shorter tail but rejects shifted speech, changed direction and longer footage', () => {
  const prior=plan(scene), shorter=retime(scene,{speechBoundActions:true},()=>2.13).scene;
  assert.equal(prefixCompatible(prior,plan(shorter)),true);
  const moved=structuredClone(shorter);moved.narration[0].acting.leadInSeconds=0.2;
  assert.equal(prefixCompatible(prior,plan(moved)),false);
  const changed=structuredClone(shorter);changed.performance[0].text='Turn away';
  assert.equal(prefixCompatible(prior,plan(changed)),false);
  assert.equal(prefixCompatible(plan(shorter),prior),false);
  for (const patch of [{visual:{bg:'changed.png'}},{visual:{character:'different-actor'}},{shot:{location:'different-room'}}]) {
    const changedSource={...structuredClone(shorter),...patch};
    assert.equal(prefixCompatible(prior,plan(changedSource)),false);
  }
  const legacy={...prior};delete legacy.reuseContextRevision;
  assert.equal(prefixCompatible(legacy,plan(shorter)),false);
});

test('historical shot renderer refuses before touching a candidate or contacting a provider', async () => {
  const {render} = require('../../skills/produce/references/render-astra-shot.js');
  await assert.rejects(render('board', {shotId:'s0001'}), /scene_video_scope/);
});
