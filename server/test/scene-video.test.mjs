import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { prepareSceneRequest, mapSceneInputs } from '../dist/scene-video.js';
import { readCapture, captureScene } from './fixtures/scene-capture.mjs';
import { planManagedVideo, planVideo } from '../dist/video-routing.js';
import { config } from '../dist/config.js';
import { ROUTES } from '../dist/handlers.js';
import { buildGenaiAudioBody } from '../dist/astra-genai-video.js';
import { buildVeoBody } from '../dist/veo-video.js';
import { buildDesktopBody } from '../dist/astra-genai-desktop.js';
import { png, setupProject } from './workflow-fixture.mjs';

function busking(t) {
 const episode = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ears-up-')));
 t.after(()=>fs.rmSync(episode,{recursive:true,force:true}));
 setupProject(episode);
 const dir = path.join(episode,'storyboard');
 const {scene,shots} = JSON.parse(fs.readFileSync(new URL('./fixtures/ears-up-ep01.json',import.meta.url)));
 fs.mkdirSync(path.join(dir,'images'),{recursive:true});
 fs.mkdirSync(path.join(dir,'audio'));
 const members = shots.map((card,i)=>({
   ...card, id:'s000'+(i+1), duration:(card.timeline.endFrame-card.timeline.startFrame)/scene.fps,
   visual:{video:{engine:'astra-genai',model:'ltx-2.5-22b-dev',resolution:'576x1024'}},
 }));
 for (const m of members) for (const p of m.timeline.images) fs.writeFileSync(path.join(dir,p.path),png);
 // 15 seconds of mono 8 kHz PCM, with a transient on the first kick.
 const data = Buffer.alloc(44+15*8000*2);
 data.write('RIFF'); data.writeUInt32LE(data.length-8,4); data.write('WAVEfmt ',8);
 data.writeUInt32LE(16,16); data.writeUInt16LE(1,20); data.writeUInt16LE(1,22);
 data.writeUInt32LE(8000,24); data.writeUInt32LE(16000,28); data.writeUInt16LE(2,32); data.writeUInt16LE(16,34);
 data.write('data',36); data.writeUInt32LE(data.length-44,40); data.writeInt16LE(9000,44+14000*2);
 fs.writeFileSync(path.join(dir,scene.audio.path),data);
 const save = () => fs.writeFileSync(path.join(dir,'scenes.js'),
   'window.STRUCTURE='+JSON.stringify({scenes:[{no:1,videoDirection:scene}]})+';\nwindow.SCENES='+JSON.stringify(members)+';');
 save();
 const input = {episode,sceneNo:1,requestId:'ep01',args:{reserveUsd:0}};
 const capture = mapper => prepareSceneRequest(1,members,scene,episode,[],{bindDialogue:false,bindOpening:false,suffix:''},mapper);
 return {episode,dir,scene,members,input,save,capture};
}

test('EP01 delivers one multipart request with three shots, six file parts and one uninterrupted music cue',async t=>{
 const f=busking(t);
 let calls=0;
 const {mapped,request}=f.capture(input=>{calls++;return captureScene(input)});
 const final=await readCapture(mapped);
 assert.equal(calls,1);
 assert.equal(final.fps,24); assert.equal(final.frameCount,360);
 assert.deepEqual(final.shotIds,['s0001','s0002','s0003']);
 assert.deepEqual(final.cuts.map(c=>[c.to,c.frame,c.transition]),[['s0002',42,'hard_cut'],['s0003',52,'hard_cut']]);
 assert.deepEqual(final.images.map(i=>[i.shotId,i.frame,i.role,i.filename]),[
   ['s0001',0,'start','opening.png'],['s0002',42,'start','play-contact.png'],['s0003',52,'start','solo.png'],
   ['s0003',112,'keyframe','duo.png'],['s0003',191,'keyframe','trio.png'],['s0003',336,'end','ending.png'],
 ]);
 assert.ok(final.images.every(image=>image.bytes===png.length));
 assert.match(final.prompt,/s0001 [\s\S]*s0002 [\s\S]*s0003 [\s\S]*Seorin steps[\s\S]*Mai An joins[\s\S]*Tu Vi enters/);
 assert.deepEqual([final.audio.startFrame,final.audio.endFrame,final.audio.cues[0].frame],[0,360,42]);
 assert.equal(final.audio.sha256,createHash('sha256').update(fs.readFileSync(path.join(f.dir,f.scene.audio.path))).digest('hex'));
 const blocked=await ROUTES.video_plan({...f.input,operation:'audio'});
 assert.equal(blocked.isError,true);
 const report=JSON.parse(blocked.content[0].text);
 assert.equal(report.executable,false); assert.equal(report.planId,undefined);
 assert.deepEqual(report.sceneRequest,request);
 assert.deepEqual(report.missing.map(m=>[m.input,m.frame]),[
   ['transition',42],['transition',52],['image',42],['image',52],['image',112],['image',191],['image',336],
 ]);
 assert.ok(!fs.existsSync(path.join(f.episode,'.work/video-routing/plans')));
 f.members[2].visual.camera={movement:'pan right',target:'the dancers',end:'The dancers fill the frame.'};
 f.save();
 const moved=await ROUTES.video_plan({...f.input,operation:'audio'});
 assert.match(JSON.parse(moved.content[0].text).sceneRequest.prompt,/s0003 [^\n]*?pan[^\n]*Closing frame: The dancers fill the frame/i);
 for (const op of ['image','text']) {
   assert.throws(()=>planVideo({...f.input,operation:op}),e=>e.missing.some(m=>m.input==='audio') &&
     e.missing.filter(m=>m.input==='transition').length===2);
 }
 f.scene.oneTake=true; f.save();
 assert.throws(()=>planVideo(f.input),/scene_one_take/);
});

test('one-take endpoint board reaches the A2V body with a single audio file and both endpoint images',t=>{
 const f=busking(t);
 const first=f.members[0];
 f.members.splice(1);
 first.duration=15;
 first.timeline.endFrame=360;
 first.timeline.images.push({role:'end',frame:359,path:'images/ending.png'});
 f.scene.oneTake=true; f.save();
 const plan=planVideo(f.input);
 assert.equal(plan.tool,'astra_genai_audio2video');
 assert.match(plan.args.prompt,/One continuous take/);
 const body=buildGenaiAudioBody(plan.args);
 assert.deepEqual(Object.keys(body).sort(),['audio_uri','fps','image_uri','last_frame_uri','model','prompt','resolution']);
 assert.equal(body.audio_uri,'data:audio/wav;base64,'+fs.readFileSync(path.join(f.dir,f.scene.audio.path)).toString('base64'));
 assert.deepEqual(plan.sceneRequest.cuts,[]);
 assert.deepEqual(plan.imageBindings.map(p=>[p.shotId,p.frame,p.role,p.parameter]),
   [['s0001',0,'start','imagePath'],['s0001',359,'end','lastFramePath']]);
 assert.equal(planVideo({...f.input,sceneNo:undefined,shotId:first.id}).id,plan.id);
 first.timeline.images.push({role:'face',frame:0,path:'images/duo.png',character:'mai-an'});
 f.save();
 assert.throws(()=>planVideo(f.input),err=>err.missing.some(m=>m.role==='face' && m.shotId===first.id));
});

test('Desktop keyframes receive each asset index only on an active compatible deployment',async t=>{
 const f=busking(t);
 delete f.scene.audio; f.scene.oneTake=true; f.members.splice(1);
 const m=f.members[0]; m.duration=4; m.timeline.endFrame=96;
 m.visual.video={engine:'astra-genai-desktop',model:'ltx-2.5-fast',resolution:'720p'};
 m.timeline.images.push({role:'keyframe',frame:42,path:'images/play-contact.png'},{role:'end',frame:83,path:'images/ending.png'});
 f.save();
 const key=config.astraGenaiApiKey,fetch=globalThis.fetch; config.astraGenaiApiKey='fixture';
 t.after(()=>{config.astraGenaiApiKey=key;globalThis.fetch=fetch});
 let enabled=false;
 globalThis.fetch=async (url,options)=>{
   assert.equal(options.method,'GET');
   assert.ok(String(url).endsWith('/v1/ltx/desktop/models'));
   return Response.json({active_model:'ltx-2.5-fast',data:enabled?[{
     id:'ltx-2.5-fast',features:['keyframes'],audio_combinations:{},
     generation_combinations:{'720p':{fps_to_durations:{24:[4]},aspect_ratios:['16:9']}},
   }]:[]});
 };
 const input=f.input;
 assert.throws(()=>planVideo({...input,args:{...input.args,duration:8}}),/scene_video_timing/);
 await assert.rejects(planManagedVideo(input),e=>e.missing[0].input==='deployment');
 assert.ok(!fs.existsSync(path.join(f.episode,'.work/video-routing/plans')));
 enabled=true;
 const plan=await planManagedVideo(input);
 const ids=Object.fromEntries(plan.args.keyframes.map(pin=>[pin.imagePath,path.basename(pin.imagePath)]));
 const body=buildDesktopBody('keyframes',plan.args,ids);
 assert.deepEqual(body.keyframes.map(p=>[p.assetId,p.frameIndex]),[['opening.png',0],['play-contact.png',42],['ending.png',83]]);
 assert.throws(()=>mapSceneInputs({...plan.sceneRequest,cuts:[{from:'s1',to:'s2',frame:42,transition:'hard_cut'}]},plan.tool),
   error=>error.missing.length===1 && error.missing[0].input==='transition');
});

test('a distilled I2V subject panel belongs to an off-screen dancer, separately from the first frame',async t=>{
 const f=busking(t), m=f.members[0];
 delete f.scene.audio; f.members.splice(1);
 m.duration=3; m.timeline.endFrame=72;
 m.timeline.action='The plaza stays empty until Mai An enters from the left.';
 m.visual.video.model='ltx-2.5-22b-distilled';
 m.timeline.images.push({role:'outfit',frame:0,path:'images/duo.png',character:'mai-an'});
 f.scene.openingPositions[1].images=[1]; f.save();
 const key=config.astraGenaiApiKey, fetch=globalThis.fetch;
 config.astraGenaiApiKey='fixture'; t.after(()=>{config.astraGenaiApiKey=key;globalThis.fetch=fetch});
 let enabled=false;
 globalThis.fetch=async (url,opts)=>{
   assert.equal(opts.method,'GET');assert.ok(String(url).endsWith('/msr/capabilities'));
   return Response.json({image_conditioning:enabled});
 };
 await assert.rejects(planManagedVideo(f.input),e=>e.missing[0].input==='deployment');
 enabled=true;
 const plan=await planManagedVideo(f.input);
 assert.deepEqual(plan.args.references.map(p=>path.basename(p.imagePath)),['duo.png']);
 assert.equal(plan.imageBindings.find(i=>i.id==='start').path,path.join(f.dir,'images/opening.png'));
 assert.match(plan.args.prompt,/mai-an \(Image 1\): Off screen/);
});

test('Veo reference-only scenes send owned face and outfit assets without a timed first frame', t => {
  const f = busking(t), shot = f.members[0];
  delete f.scene.audio;
  f.members.splice(1);
  shot.duration = 8;
  shot.timeline.endFrame = 192;
  shot.timeline.images = ['face','outfit'].map((role,i) => ({
    role, character:'mai-an', frame:0, path:'images/' + ['solo.png','duo.png'][i],
  }));
  shot.timeline.action = 'Mai An enters from the left after the spectators turn.';
  f.scene.openingPositions[1].images = [1,2];
  shot.visual.video = {engine:'veo',model:'veo-3.1-fast-generate-001',resolution:'720p',operation:'reference'};
  f.save();
  const plan = planVideo({...f.input,args:{}});
  const body = buildVeoBody(plan.args);
  assert.equal(body.instances[0].referenceImages.length,2);
  assert.ok(body.instances[0].referenceImages.every(p => p.image.bytesBase64Encoded));
  assert.deepEqual(plan.imageBindings.map(b => [b.shotId,b.frame,b.role,b.character]),[
    ['s0001',0,'face','mai-an'],['s0001',0,'outfit','mai-an'],
  ]);
  assert.match(plan.args.prompt,/mai-an \(Image 1, Image 2\): Off screen/);
  shot.timeline.images = [];
  shot.visual.video.operation='text';
  f.scene.openingPositions[1].images=[];
  f.save();
  assert.throws(()=>planVideo({...f.input,args:{durationSeconds:4}}),/scene_video_timing/);
});
