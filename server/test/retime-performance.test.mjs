import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { retime } = require('../../skills/produce/references/retime-performance.js');
const { designDirectionConflict } = require('../../skills/produce/references/prepare-astra-shot.js');
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
test('continuity warning compares the same jamb statement, not arbitrary left and right nouns', () => {
  assert.equal(designDirectionConflict('beyond image-left jamb','beyond image RIGHT jamb'),true);
  assert.equal(designDirectionConflict('desk image-left','door image-right'),false);
  assert.equal(designDirectionConflict('image-left jamb','image LEFT jamb'),false);
});

const { prefixCompatible } = require('../../skills/_shared/performance-retiming.js');
const { planScenePerformance, sceneVideoPrompt } = require('../../skills/_shared/scene-acting.js');
function plan(s) { const t=planScenePerformance(s,()=>2.13); return {...t,videoPrompt:sceneVideoPrompt(t.performance,'audio_conditioned',s)}; }
test('prefix reuse permits a shorter tail but rejects shifted speech, changed direction and longer footage', () => {
  const prior=plan(scene), shorter=retime(scene,{speechBoundActions:true},()=>2.13).scene;
  assert.equal(prefixCompatible(prior,plan(shorter)),true);
  const moved=structuredClone(shorter);moved.narration[0].acting.leadInSeconds=0.2;
  assert.equal(prefixCompatible(prior,plan(moved)),false);
  const changed=structuredClone(shorter);changed.performance[0].text='Turn away';
  assert.equal(prefixCompatible(prior,plan(changed)),false);
  assert.equal(prefixCompatible(plan(shorter),prior),false);
});

test('provider padding uses a separate WAV and cannot change canonical speech or truncate it', async t => {
  const {mkdtempSync,readFileSync,rmSync}=await import('node:fs');
  const {tmpdir}=await import('node:os');const {join}=await import('node:path');
  const {execFileSync}=await import('node:child_process');
  const {conditioningAudio}=require('../../skills/produce/references/render-astra-shot.js');
  const {duration}=require('../../skills/produce/references/compose-speech.js');
  const dir=mkdtempSync(join(tmpdir(),'transport-clock-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const source=join(dir,'canonical.wav'),output=join(dir,'transport.wav');
  execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','sine=frequency=440:duration=1','-c:a','pcm_s16le',source]);
  const before=readFileSync(source);conditioningAudio(source,output,33/24);
  assert.deepEqual(readFileSync(source),before);assert.equal(duration(source),1);
  assert.ok(Math.abs(duration(output)-33/24)<1/48000);
  assert.throws(()=>conditioningAudio(source,source,2),/Never overwrite/);
  assert.throws(()=>conditioningAudio(source,output,0.5),/cannot truncate/);
});

test('shared renderer refuses an existing candidate before any planning or provider call', async t => {
  const {mkdtempSync,writeFileSync,rmSync}=await import('node:fs');
  const {tmpdir}=await import('node:os');const {join}=await import('node:path');
  const {render}=require('../../skills/produce/references/render-astra-shot.js');
  const dir=mkdtempSync(join(tmpdir(),'duplicate-shot-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  writeFileSync(join(dir,'candidate.mp4.render.json'),'{}');
  await assert.rejects(render('missing-board',{outputPath:dir,filename:'candidate.mp4'}),/already exists/);
  await assert.rejects(render('missing-board',{outputPath:dir,filename:'../other.mp4'}),/plain .mp4/);
});
