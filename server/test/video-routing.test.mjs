import { setupProject, png } from './workflow-fixture.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { planVideo, executeVideo, routeLegacyVideo, routingContext, approveVideo, readShotVideoTiming, videoStatus } from '../dist/video-routing.js';
import { buildLtxApiBody } from '../dist/ltx-api-video.js';
import { buildVeoBody } from '../dist/veo-video.js';
import { buildGenaiVideoBody } from '../dist/astra-genai-video.js';
import { VIDEO_ADAPTERS, videoCatalog, speechVideoCapabilities } from '../dist/video-registry.js';
import { videoTransaction } from '../dist/video-state.js';
import { recordVideoSubmission, recordVideoTokens } from '../dist/video-events.js';
import { config } from '../dist/config.js';
import { refreshGenaiMsrVoice } from '../dist/astra-genai-video.js';
import { ROUTES } from '../dist/handlers.js';
import { TOOLS } from '../dist/tools.js';
const require = createRequire(import.meta.url);
const settings = require('../../skills/_shared/model-settings.js');
const selection = { engine:'seedance', model:'dreamina-seedance-2-0-fast-260128', resolution:'720p' };
test('a snapshot or a saved plan cannot authorize work in an unconfigured directory', async t => {
  const f = fixture(t), plan = f.plan();
  fs.unlinkSync(path.join(f.root, '.social-flow/models.json'));
  assert.throws(() => f.plan('another'), /project_setup_required/);
  assert.throws(() => approveVideo({ episode: f.episode, auto: true, request: 'Approve' }), /project_setup_required/);
  const unused = async () => assert.fail('must stop before the provider');
  await assert.rejects(executeVideo({ episode: f.episode, planId: plan.id }, unused), /project_setup_required/);
  await assert.rejects(routeLegacyVideo('seedance_text2video', { prompt: 'A bird', outputPath: f.episode }, unused), /project_setup_required/);
});
function fixture(t, video = selection, auth = {}) {
 const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'sf-router-')));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 setupProject(root);
 settings.saveSettings(root,{video,speech:{engine:'gemini',model:'gemini-2.5-flash-preview-tts'},image:{engine:'host',model:'host-managed',host:'codex'}},{expectedRevision:settings.readSettings(root).revision,videoType:{id:'drama'},request:'Fixture selection'});
 const episode = path.join(root,'data/c/episodes/e'); fs.mkdirSync(path.join(episode,'storyboard'),{recursive:true});
 settings.snapshotSettings(root,episode);
 approveVideo({episode,auto:true,request:'Fixture: approve every shot'});
 const board = {PRODUCTION:{videoAuthorization:{reference:'Explicit fixture spending instruction',maxUsd:10,maxConcurrent:3,maxAttempts:3,...auth}},SCENES:[{id:'s1',visual:{video:{...video}}},{id:'s2',visual:{video:{...video}}}]};
 const save = ()=>fs.writeFileSync(path.join(episode,'storyboard/scenes.js'),Object.entries(board).map(([k,v])=>'window.'+k+'='+JSON.stringify(v)+';').join('\n'));
 save();
 const old=config.arkApiKey; config.arkApiKey='fixture'; t.after(()=>{config.arkApiKey=old;});
 const plan = (requestId='a',args={},shotId='s1')=>planVideo({episode,shotId,requestId,operation:'text',args:{prompt:'A boat crosses a lake.',durationSeconds:8,...args}});
 const execute = (p,dispatch)=>executeVideo({episode,planId:p.id},dispatch);
 const state=()=>JSON.parse(fs.readFileSync(path.join(episode,'.work/video-routing/state.json')));
 return {root,episode,board,save,plan,execute,state};
}
test('single-shot scene keeps the performance and sound with and without frame-addressed planning', t => {
  const f = fixture(t,{engine:'astra-genai',model:'ltx-2.5-22b-distilled',operation:'image',resolution:'576x1024'});
  const shot = f.board.SCENES[0];
  f.board.SCENES = [shot];
  shot.scene = 1; shot.duration = 2;
  shot.shot = {size:'cu',angle:'low',videoDesign:{before:'The envelope rests against the lamp.'}};
  shot.visual.frames = {mode:'first',start:'start.png'};
  shot.visual.video.promptSource = {action:'Flip the envelope.',sound:'Paper rustles.'};
  shot.performance = [{kind:'action',text:'종을 친다.',videoDirection:'Tap the brass bell twice.',durationSeconds:1}];
  fs.writeFileSync(path.join(f.episode,'storyboard/start.png'),png);
  const sc = {no:1, directionDefaults:{camera:'camera.static', lighting:'Soft window light.'},
    videoDirection:{openingPositions:[],emotion:'Doubt turns to hope.'}};
  f.board.STRUCTURE = {scenes:[sc]};
  for (const timed of [false,true]) {
    if (timed) sc.videoDirection.fps = 24;
    f.save();
    const plan = planVideo({episode:f.episode,sceneNo:1,requestId:'single',args:{reserveUsd:0}},false);
    for (const cue of ['Flip the envelope','Paper rustles','The envelope rests','Tap the brass bell twice','Soft window light','static frame','Close-up'])
      assert.ok(plan.args.prompt.includes(cue), cue + ' timed=' + timed + ': ' + plan.args.prompt);
  }
});
const result={content:[{type:'text',text:'fixture media'}]};
function writeTinyMp4(dir, filename, seconds = 1) {
  fs.mkdirSync(dir, {recursive:true});
  const file = path.join(dir, filename);
  execFileSync('ffmpeg', ['-loglevel','error','-f','lavfi','-i','color=s=64x64:r=24:d='+seconds,
    '-c:v','libx264','-threads','1','-movflags','+faststart',file]);
  return fs.readFileSync(file);
}
test('managed voice guidance is sent once; changed dialogue or pinned voice invalidates the saved plan',async t=>{
 const f=fixture(t);const img=path.join(f.episode,'hero.png');fs.writeFileSync(img,'image');
 f.board.SB_DOC={characters:[{id:'hero',tts:{engine:'gemini',voiceId:'Kore',language:'ko',speed:1,voiceDirection:'Low dry Seoul voice.'}}]};
 f.board.SCENES[0].narration=[{id:'line-1',speaker:'hero',delivery:'on_screen',tts:'Hello'}];f.save();
 assert.throws(()=>f.plan(),/voice_lane_required/);
 f.plan=(requestId='a')=>planVideo({episode:f.episode,shotId:'s1',requestId,operation:'reference',args:{prompt:'Hero says hello.',generateAudio:true,referenceImagePaths:[img]}});
 const p=f.plan();let calls=0;
 await f.execute(p,async(tool,args)=>{calls++;assert.equal((args.prompt.match(/Voice continuity guidance/g)||[]).length,1);return result;});
 await f.execute(p,async()=>{calls++;return result;});assert.equal(calls,1);
 const q=f.plan('next');f.board.SCENES[0].narration[0].tts='Changed words';f.save();
 await assert.rejects(f.execute(q,async()=>{calls++;return result;}),/stale/);assert.equal(calls,1);
 const r=f.plan('next');f.board.SB_DOC.characters[0].tts.voiceId='Orus';f.save();
 await assert.rejects(f.execute(r,async()=>result),/stale/);
});
test('auto-added samples still obey 2.0 reference image requirements and audio-count limits',t=>{
 const f=fixture(t,{engine:'seedance',model:'dreamina-seedance-2-0-260128',resolution:'720p'});
 const audio=path.join(f.episode,'hero.wav'),img=path.join(f.episode,'hero.png');fs.writeFileSync(audio,'voice');fs.writeFileSync(img,'image');
 f.board.SB_DOC={characters:[{id:'hero',tts:{engine:'gemini',voiceId:'Kore',language:'ko',speed:1},voiceReference:{path:audio}}]};
 f.board.SCENES[0].narration=[{id:'l1',speaker:'hero',delivery:'on_screen',tts:'Hello'}];f.save();
 const plan=args=>planVideo({episode:f.episode,shotId:'s1',requestId:'limits',operation:'reference',args:{prompt:'Hero speaks.',generateAudio:true,...args}});
 assert.throws(()=>plan({}),/reference image/);
 const extras=[1,2,3].map(n=>{const p=path.join(f.episode,`extra-${n}.wav`);fs.writeFileSync(p,'audio');return p;});
 assert.throws(()=>plan({referenceImagePaths:[img],referenceAudioPaths:extras}),/at most 3/);
});
test('planning recompiles saved action from current icons and reports explicit prompt overrides', t => {
 const f=fixture(t);
 f.board.SCENES[0].visual={video:{prompt:'Old camera wording.',promptSource:{action:'A boat crosses the lake.'}},camera:{movement:'dolly in',speed:'slow',target:'the boat'}};
 f.board.SCENES[0].shot={...f.board.SCENES[0].shot,techniques:[{id:'camera.dolly-in'}]};
 f.save();
 const before=planVideo({episode:f.episode,shotId:'s1',requestId:'direction-a',operation:'text',args:{generateAudio:false}});
 assert.match(before.args.prompt,/slowly pushes in toward the boat/);
 // A hand-written prompt that drops or locks the board's move is named with the sentence to carry, never refused.
 assert.match(f.plan('no-move').directionWarnings.join(),/camera_move_missing.*slowly pushes in toward the boat/);
 assert.match(f.plan('locked',{prompt:'A boat crosses a lake. Camera stays locked.'}).directionWarnings.join(),/camera_move_contradicted/);
 assert.doesNotMatch(f.plan('carried',{prompt:'A boat crosses a lake. The camera pushes in.'}).directionWarnings.join(),/camera_move_/);
 delete f.board.SCENES[0].visual.video.promptSource;
 f.board.SCENES[0].visual.video.prompt='The camera pulls back.';
 f.save();
 const legacy=planVideo({episode:f.episode,shotId:'s1',requestId:'legacy',operation:'text'});
 assert.match(legacy.directionWarnings.join(),/camera_move_contradicted/);
 assert.equal(legacy.args.prompt,'The camera pulls back.');
 f.board.SCENES[0].visual.video.promptSource={action:'A boat crosses the lake.'};
 f.board.SCENES[0].visual.camera={movement:'static'}; f.save();
 const after=planVideo({episode:f.episode,shotId:'s1',requestId:'direction-b',operation:'text',args:{generateAudio:false}});
 assert.match(after.args.prompt,/holds a static frame/);
 assert.doesNotMatch(after.args.prompt,/Old camera|pushes in/);
 assert.equal(after.directionBindings.find(b=>b.attribute==='move').via,'prompt');
 assert.match(f.plan('manual').directionWarnings.join(),/Explicit args.prompt/);
});
test('snapshot wins over current defaults; explicit shot replaces episode override', t=>{
 const f=fixture(t); const current=settings.readSettings(f.root);
 settings.saveSettings(f.root,{video:{...selection,model:'dreamina-seedance-2-0-260128'}},{expectedRevision:current.revision,request:'Change future defaults'});
 assert.equal(f.plan().selection.model,selection.model);
 f.board.PRODUCTION.modelSettings={overrides:[{scope:'episode',request:'episode change',video:{...selection,model:'dreamina-seedance-2-0-260128'}},{scope:'shot',shotId:'s1',request:'shot change',video:{...selection,model:'dreamina-seedance-2-0-mini-260615'}}]};f.save();
 assert.equal(f.plan().source,'shot_override'); assert.equal(f.plan().selection.model,'dreamina-seedance-2-0-mini-260615');
 assert.equal(f.plan('b',{},'s2').source,'episode_override');
});
test('plan validates selection, unsupported options, cross-field constraints and missing files before dispatch',t=>{
 const f=fixture(t);
 assert.throws(()=>f.plan('a',{model:'dreamina-seedance-2-0-260128'}),/mismatch/);
 assert.throws(()=>f.plan('a',{resolution:'1080p'}),/mismatch/);
 assert.throws(()=>f.plan('a',{fakeOption:true}),/Unsupported/);
 assert.throws(()=>f.plan('a',{durationSeconds:3}),/supports durations/);
 assert.throws(()=>planVideo({episode:f.episode,shotId:'s1',requestId:'a',operation:'audio',args:{prompt:'x'}}),/no adapter/);
 assert.throws(()=>planVideo({episode:f.episode,shotId:'s1',requestId:'a',operation:'image',args:{prompt:'x',sourceImagePath:'missing.png'}}),/ENOENT/);
 assert.throws(()=>f.plan('a',{outputPath:os.tmpdir()}),/inside/);
 assert.throws(()=>f.plan('ko',{prompt:'A boat crosses a lake. 배가 호수를 건넌다.'}),/video_prompt_language/);
 assert.ok(f.plan('ko-quote',{prompt:'The rower says "건너자" and pushes off.'}).id);
});
test('completed request is reused and altered request ID payload is rejected',async t=>{
 const f=fixture(t); let calls=0; const dispatch=async(_tool,args)=>{calls++;recordVideoSubmission('op-1');writeTinyMp4(args.outputPath,args.filename);return result;}; const p=f.plan();
 await f.execute(p,dispatch); await f.execute(p,dispatch); assert.equal(calls,1);
 assert.equal(f.state().jobs.a.providerId,'op-1'); assert.equal(f.state().jobs.a.status,'completed');
 await assert.rejects(f.execute(f.plan('a',{prompt:'Different'}),dispatch),/request_id_conflict/);
});
test('a shot video runs only after the user approves its plan or every shot; the plan sends the shot prompt',async t=>{
 const f=fixture(t); let calls=0; const dispatch=async()=>{calls++;return result;};
 approveVideo({episode:f.episode,auto:false,request:'Ask me before each shot'});
 f.board.SCENES[0].visual.video.prompt='A heron lands on the dock.';f.save();
 const p=planVideo({episode:f.episode,shotId:'s1',requestId:'a',operation:'text',args:{durationSeconds:8}});
 assert.equal(p.args.prompt,'A heron lands on the dock.');
 await assert.rejects(f.execute(p,dispatch),/video_approval_required/);
 approveVideo({episode:f.episode,planIds:[p.id],request:'Shot 1 looks right'});
 const view=()=>JSON.parse(fs.readFileSync(path.join(f.episode,'storyboard/video-approvals.js'),'utf8').replace(/^window\.VIDEO_APPROVALS = |;\n$/g,''));
 assert.deepEqual(view().shots.s1,{planId:p.id,at:JSON.parse(fs.readFileSync(path.join(f.episode,'.work/video-routing/approvals.json'))).plans[p.id].at,shown:{prompt:'A heron lands on the dock.',lines:[]}});
 await f.execute(p,dispatch); assert.equal(calls,1);
 // A plan with its own prompt is marked so; a plan whose shot changed before the yes takes none.
 approveVideo({episode:f.episode,planIds:[f.plan('c').id],request:'That prompt is fine'});
 assert.equal(view().shots.s1.shown.callPrompt,true);
 const stale=planVideo({episode:f.episode,shotId:'s1',requestId:'d',operation:'text',args:{durationSeconds:8}});
 f.board.SCENES[0].visual.video.prompt='A heron takes off.';f.save();
 assert.throws(()=>approveVideo({episode:f.episode,planIds:[stale.id],request:'Yes'}),/video_plan_stale/);
 const spoken=f.plan('e');f.board.SCENES[0].narration=[{speaker:'hero',delivery:'on_screen',tts:'Over here!'}];f.save();
 assert.throws(()=>approveVideo({episode:f.episode,planIds:[spoken.id],request:'Yes'}),/video_plan_stale/);delete f.board.SCENES[0].narration;f.save();
 await assert.rejects(f.execute(f.plan('b'),dispatch),/video_approval_required/);
 approveVideo({episode:f.episode,auto:true,request:'Make every shot without asking'});
 assert.equal(view().auto,JSON.parse(fs.readFileSync(path.join(f.episode,'.work/video-routing/approvals.json'))).auto.at);
 await f.execute(f.plan('b'),dispatch); assert.equal(calls,2);
});
test('budget and attempts gate before dispatch and include prior successful reservations',async t=>{
 const f=fixture(t,selection,{maxUsd:1.5,maxAttempts:2});let calls=0;
 await f.execute(f.plan(),async()=>{calls++;return result;});
 await assert.rejects(f.execute(f.plan('b'),async()=>{calls++;return result;}),/budget/);assert.equal(calls,1);
 f.board.PRODUCTION.videoAuthorization.maxUsd=10;f.board.PRODUCTION.videoAuthorization.maxAttempts=1;f.save();
 await assert.rejects(f.execute(f.plan('c'),async()=>result),/attempt/);
});
test('spoken Seedance reference scene requests native audio and the off-screen speaker sample', t => {
 const f=fixture(t,{...selection,operation:'reference'});
 const dir=path.join(f.episode,'storyboard');
 for (const image of ['room.png','hero.png']) fs.writeFileSync(path.join(dir,image),png);
 fs.writeFileSync(path.join(dir,'voice.wav'),'fixture');
 f.board.STRUCTURE={scenes:[{no:1,videoDirection:{openingPositions:[{character:'hero',images:[1],position:'outside the frame beyond the side door'}],emotion:'His voice trembles.'}}]};
 f.board.SB_DOC={characters:[{id:'hero',tts:{language:'en',voiceId:'Kore'},voiceReference:{path:'voice.wav',imagePaths:['hero.png']}}]};
 const shot=f.board.SCENES[0];
 Object.assign(shot,{scene:1,duration:5,narration:[{speaker:'hero',delivery:'off_screen',tts:'Wait for me.'}]});
 Object.assign(shot.visual,{frames:{mode:'reference',start:'room.png'},references:[{id:'hero',role:'character',use:'video',path:'hero.png',purpose:'The speaker.'}]});
 f.save();
 const input={episode:f.episode,sceneNo:1,requestId:'seedance-dialogue'};
 const p=planVideo(input);
 assert.equal(p.args.generateAudio,true);
 assert.deepEqual(p.args.referenceAudioPaths,[path.join(dir,'voice.wav')]);
 assert.match(p.args.prompt,/Wait for me/);
 assert.throws(()=>planVideo({...input,args:{generateAudio:false}}),/scene_dialogue_audio_required/);
 assert.equal(speechVideoCapabilities('seedance', selection.model, 'reference').nativeSpeech, true);
 f.board.STRUCTURE.scenes[0].videoDirection.fps = 24;
 f.save();
 const timed = planVideo({...input, requestId:'timed-reference'});
 assert.deepEqual(timed.args.referenceImagePaths, [path.join(dir,'hero.png')]);
 assert.deepEqual(p.args.referenceImagePaths, timed.args.referenceImagePaths);
 shot.visual.references.push({id:'opening',role:'composition',use:'both',path:'room.png',purpose:'Opening composition.'});
 f.save();
 assert.deepEqual(planVideo({...input,requestId:'named-opening'}).args.referenceImagePaths, [path.join(dir,'hero.png'),path.join(dir,'room.png')]);
 assert.deepEqual(timed.args.referenceAudioPaths, [path.join(dir,'voice.wav')]);
 assert.equal(timed.sceneRequest.frameCount, 120);
});
test('overlapping scene and shot requests share the member attempt limit', async t => {
 for (const sceneFirst of [false,true]) {
  const f=fixture(t,selection,{maxAttempts:1});
  f.board.STRUCTURE={scenes:[{no:1,videoDirection:{openingPositions:[],emotion:'The lake is calm.'}}]};
  fs.writeFileSync(path.join(f.episode,'storyboard','lake.png'),png);
  for (const shot of f.board.SCENES) {
   shot.scene=shot.id === 's2' ? 1 : 2; shot.duration=4;
   shot.visual.frames={mode:'first',start:'lake.png'};
   shot.visual.video.prompt='The lake is calm.';
  }
  f.save();
  const make = target => planVideo({episode:f.episode,operation:'image',args:{generateAudio:false},...target});
  const scene=make({sceneNo:1,requestId:'lake-scene'}), shot=make({shotId:'s2',requestId:'second-shot'});
  await f.execute(sceneFirst ? scene : shot,async()=>result);
  await assert.rejects(f.execute(sceneFirst ? shot : scene,async()=>assert.fail('limit bypassed')),/video_attempt_limit: s2/);
 }
});
test('concurrent execution reserves once; duplicate in-flight call never dispatches',async t=>{
 const f=fixture(t,selection,{maxConcurrent:1});let release;const wait=new Promise(r=>release=r);let calls=0;const p=f.plan();
 const first=f.execute(p,async()=>{calls++;await wait;return result;});
 await assert.rejects(f.execute(p,async()=>result),/pending/);
 await assert.rejects(f.execute(f.plan('b',{},'s2'),async()=>result),/concurrency/);
 release();await first;assert.equal(calls,1);
});
test('ambiguous failure retains budget and ID across process-like reentry',async t=>{
 const f=fixture(t);const p=f.plan();let calls=0;
 await assert.rejects(f.execute(p,async()=>{calls++;recordVideoSubmission('accepted-1');throw new Error('connection lost');}),/connection/);
 assert.equal(f.state().jobs.a.status,'submission_unknown');assert.equal(f.state().jobs.a.providerId,'accepted-1');
 await assert.rejects(f.execute(p,async()=>{calls++;return result;}),/pending/);assert.equal(calls,1);
});
test('a board prompt longer than the GenAI image lane takes is fitted with its camera move whole', t=>{
 const f=fixture(t,{engine:'astra-genai',model:'ltx-2.5-22b-distilled',resolution:'1280x704',operation:'image'});
 fs.writeFileSync(path.join(f.episode,'image.png'),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=','base64'));
 const long=word=>(word+' ').repeat(80).trim()+'.';
 f.board.SCENES[0].shot={techniques:[{id:'camera.dolly-in',reason:'The realization lands while the shot runs.'}],videoDesign:{before:long('lamp'),after:long('door'),continuity:long('rain')}};
 f.board.SCENES[0].visual={frames:{mode:'first',start:'../image.png'},camera:{movement:'dolly in',speed:'slow',target:'the letter'},
  expression:{hero:long('still')},video:{prompt:'stale',promptSource:{action:'The hero reads the letter.'}}};
 f.save();
 const p=planVideo({episode:f.episode,shotId:'s1',requestId:'fit',operation:'image',args:{duration:5,reserveUsd:0}});
 assert.equal(p.tool,'astra_genai_img2video');
 assert.ok(p.args.prompt.length<=2000,String(p.args.prompt.length));
 assert.match(p.args.prompt,/The camera slowly pushes in toward the letter/);
 assert.match(p.args.prompt,/The hero reads the letter\..*No speech or vocalization/);
 assert.match(p.directionWarnings.join(),/prompt_fitted/);
});
test('an MSR prompt is fitted again when its reference and audio lines push it over the limit', t=>{
 const f=fixture(t,{engine:'astra-genai',model:'ltx-2.5-22b-distilled',resolution:'1792x1024',operation:'reference'});
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=','base64');
 fs.writeFileSync(path.join(f.episode,'image.png'),png);fs.writeFileSync(path.join(f.episode,'face.png'),png);
 const long=word=>(word+' ').repeat(70).trim()+'.';
 f.board.SB_DOC={characters:[{id:'hero',name:'Hero',tts:{engine:'gemini',voiceId:'Kore',language:'ko',speed:1}}]};
 f.board.SCENES[0].narration=[{id:'line-1',speaker:'hero',delivery:'on_screen',tts:'Hello',acting:{context:long('cafe')}}];
 f.board.SCENES[0].shot={size:'ms',angle:'eye',techniques:[{id:'camera.dolly-in',reason:'r'}]};
 f.board.SCENES[0].visual={character:['hero'],frames:{mode:'reference',start:'../image.png'},
  references:[{id:'hero',path:'../face.png',role:'character',use:'video',purpose:'Preserve appearance'}],
  camera:{movement:'dolly in',speed:'slow',target:'the hero'},
  video:{openingPositions:[{character:'hero',images:[1],position:'standing by the left window'}],prompt:'stale',promptSource:{action:'The hero looks up from the letter. '+'Rain taps the glass. '.repeat(40)}}};
 f.save();
 // Fitted to 2,000 the prompt still fits; the reference and Audio lines then push it over, so it is fitted again.
 const p=planVideo({episode:f.episode,shotId:'s1',requestId:'msr-fit',operation:'reference',args:{reserveUsd:0}});
 assert.equal(p.tool,'astra_genai_msr');
 assert.ok(p.args.prompt.length<=2000,String(p.args.prompt.length));
 assert.match(p.args.prompt,/The camera slowly pushes in toward the hero/);
 assert.match(p.args.prompt,/hero \(Image 1\): standing by the left window/);
 assert.doesNotMatch(p.args.prompt,/cafe cafe/);
});
test('I2V reference capability refusals release managed budget and concurrency before any submission',async t=>{
 const {generateGenaiVideo}=await import('../dist/astra-genai-video.js');
 const f=fixture(t,{engine:'astra-genai',model:'ltx-2.5-22b-distilled',resolution:'1280x704',operation:'image'},{maxConcurrent:1});
 const oldFetch=globalThis.fetch,oldKey=config.astraGenaiApiKey;config.astraGenaiApiKey='fixture';
 t.after(()=>{globalThis.fetch=oldFetch;config.astraGenaiApiKey=oldKey;});
 fs.writeFileSync(path.join(f.episode,'image.png'),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=','base64'));
 f.board.SCENES[0].visual={frames:{mode:'first',start:'../image.png'},video:{openingPositions:[{character:'hero',images:[1],position:'seated on the right'}]},references:[{id:'hero',path:'../image.png',role:'character',use:'video',purpose:'Preserve appearance'}]};
 f.save();let calls=0;
 for(const failure of ['unsupported','network','schema']){
  globalThis.fetch=async(url,options)=>{
   calls++;assert.ok(String(url).endsWith('/msr/capabilities'));assert.equal(options.method,'GET');
   if(failure==='network')throw new Error('Network unavailable');
   return Response.json({image_conditioning:failure==='unsupported'?false:'invalid'});
  };
  const p=planVideo({episode:f.episode,shotId:'s1',requestId:failure,operation:'image',args:{prompt:'The hero walks.',duration:5,reserveUsd:0.25}});
  await assert.rejects(f.execute(p,async(tool,args)=>{assert.equal(tool,'astra_genai_img2video');return generateGenaiVideo('image-to-video',args);}),error=>error.terminal===true);
  const job=f.state().jobs[failure];
  assert.equal(job.status,'failed');assert.equal(job.settledUsd,0);assert.equal(job.providerId,undefined);
 }
 assert.equal(calls,3);
});
test('a terminal adapter failure closes as failed and frees the slot; reconcile settles an unknown request',async t=>{
 const { videoStatus } = await import('../dist/video-routing.js');
 const { GenaiRequestError } = await import('../dist/astra-genai-client.js');
 const f=fixture(t,selection,{maxConcurrent:1});
 const rejected={isError:true,terminal:true,content:[{type:'text',text:'HTTP 400 InvalidParameter'}]};
 assert.equal((await f.execute(f.plan(),async()=>rejected)).isError,true);
 assert.equal(f.state().jobs.a.status,'failed');assert.equal(f.state().jobs.a.settledUsd,0);
 await assert.rejects(f.execute(f.plan(),async()=>result),/video_request_failed/);
 await assert.rejects(f.execute(f.plan('b'),async()=>{throw new GenaiRequestError('ASTRA GenAI HTTP 422',true,422);}),/422/);
 assert.equal(f.state().jobs.b.status,'failed');
 await assert.rejects(f.execute(f.plan('c'),async()=>{recordVideoSubmission('task-9');throw new Error('connection lost');}),/connection/);
 assert.equal(f.state().jobs.c.status,'submission_unknown');
 await assert.rejects(f.execute(f.plan('d',{},'s2'),async()=>result),/concurrency/);
 await assert.rejects(videoStatus({episode:f.episode,requestId:'c',action:'reconcile'}),/billing_evidence/);
 const settled=await videoStatus({episode:f.episode,requestId:'c',action:'reconcile',evidence:'ModelArk task-9 failed, not billed',spentUsd:0});
 assert.equal(settled.status,'failed');assert.equal(settled.settledUsd,0);
 assert.deepEqual((await f.execute(f.plan('d',{},'s2'),async()=>result)).content,result.content);
});
test('a lock left by a dead process is recovered; a reconciled opening spend replaces unpriced history',async t=>{
 const f=fixture(t,selection,{openingSpendUsd:1});
 fs.writeFileSync(path.join(f.episode,'.work/events.jsonl'),JSON.stringify({tool:'astra_genai_text2video',key:'video.astra-genai',quantity:5})+'\n');
 const lock=path.join(f.episode,'.work/video-routing/state.lock');fs.mkdirSync(path.dirname(lock),{recursive:true});
 const dead=spawnSync(process.execPath,['-e','']).pid;fs.writeFileSync(lock,`${dead}@${os.hostname()}`);
 await f.execute(f.plan(),async()=>result);
 assert.equal(f.state().openingSpendUsd,1);assert.equal(f.state().jobs.a.status,'completed');assert.equal(fs.existsSync(lock),false);
});
test('disabled tool, missing key, changed input and changed authorization fail before execution',async t=>{
 const f=fixture(t);const p=f.plan();let calls=0;const dispatch=async()=>{calls++;return result;};
 process.env.SOCIAL_FLOW_TOOL_SEEDANCE_TEXT2VIDEO='off';
 try { await assert.rejects(f.execute(p,dispatch),/disabled/); } finally {delete process.env.SOCIAL_FLOW_TOOL_SEEDANCE_TEXT2VIDEO;}
 config.arkApiKey='';await assert.rejects(f.execute(p,dispatch),/unconfigured/);config.arkApiKey='fixture';
 f.board.PRODUCTION.videoAuthorization.maxUsd=9;f.save();await assert.rejects(f.execute(p,dispatch),/stale/);
 const image=path.join(f.episode,'image.png');fs.writeFileSync(image,'original');
 const q=planVideo({episode:f.episode,shotId:'s1',requestId:'i',operation:'image',args:{prompt:'x',sourceImagePath:image}});
 fs.writeFileSync(image,'changed');await assert.rejects(f.execute(q,dispatch),/stale/);assert.equal(calls,0);
});
test('configured legacy route requires context and explicit mismatch cannot bypass it',async t=>{
 const f=fixture(t); let calls=0;const dispatch=async()=>{calls++;return result;};
 await assert.rejects(routeLegacyVideo('seedance_text2video',{prompt:'x',outputPath:f.episode},dispatch),/context_required/);
 await assert.rejects(routeLegacyVideo('astra_genai_text2video',{prompt:'x',videoContext:{episode:f.episode,shotId:'s1',requestId:'a'}},dispatch),/mismatch/);
 await routeLegacyVideo('seedance_text2video',{prompt:'x',videoContext:{episode:f.episode,shotId:'s1',requestId:'a'}},dispatch);assert.equal(calls,1);
});
test('channel assets under data/<channel>/assets/ need no context but follow the saved video model',async t=>{
 const f=fixture(t); let seen=null; const dispatch=async(tool,args)=>{seen={tool,args};return result;};
 const intro=path.join(f.root,'data/c/assets/intro'); fs.mkdirSync(intro,{recursive:true});
 await routeLegacyVideo('seedance_text2video',{prompt:'x',outputPath:intro},dispatch);
 assert.equal(seen.tool,'seedance_text2video'); assert.equal(seen.args.model,selection.model); assert.equal(seen.args.resolution,selection.resolution);
 assert.equal(seen.args.outputPath,intro); assert.equal(seen.args.videoContext,undefined);
 await assert.rejects(routeLegacyVideo('astra_genai_text2video',{prompt:'x',outputPath:intro},dispatch),/model_selection_mismatch/);
 await assert.rejects(routeLegacyVideo('seedance_text2video',{prompt:'x',model:'dreamina-seedance-2-0-260128',outputPath:intro},dispatch),/model_selection_mismatch/);
 const log=fs.readFileSync(path.join(f.root,'data/c/assets/.work/video-requests.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
 assert.equal(log.length,1); assert.equal(log[0].kind,'channel_asset'); assert.equal(log[0].tool,'seedance_text2video'); assert.equal(log[0].selection.engine,'seedance'); assert.equal(log[0].ok,true);
 // Episode outputs and every other workspace path still need videoContext.
 await assert.rejects(routeLegacyVideo('seedance_text2video',{prompt:'x',outputPath:path.join(f.episode,'.work')},dispatch),/context_required/);
 await assert.rejects(routeLegacyVideo('seedance_text2video',{prompt:'x',outputPath:path.join(f.root,'data/c/other')},dispatch),/context_required/);
});
test('public MCP legacy handler validates context before reaching a real provider',async t=>{
 const f=fixture(t);
 await assert.rejects(ROUTES.astra_genai_text2video({prompt:'x',videoContext:{episode:f.episode,shotId:'s1',requestId:'a'}}),/mismatch/);
 for(const name of Object.keys(VIDEO_ADAPTERS)) assert.ok(TOOLS.find(t=>t.name===name)?.inputSchema.properties.videoContext,name);
 for(const name of ['video_catalog','video_plan','video_execute']) assert.ok(ROUTES[name]);
});
test('host remains an explicit external handoff; no API switch',async t=>{
 const f=fixture(t,{engine:'host',model:'host-managed',host:'grok'});const p=f.plan();
 assert.equal(p.execution,'host_handoff');await assert.rejects(f.execute(p,async()=>result),/host_handoff/);
});
test('malformed snapshot and non-explicit overrides do not fall back',t=>{
 const f=fixture(t);f.board.PRODUCTION.modelSettings={overrides:[{scope:'shot',shotId:'s1',video:selection}]};f.save();
 assert.throws(()=>f.plan(),/actual user request/);
 fs.writeFileSync(path.join(f.episode,'.work/model-settings.json'),'{}');assert.throws(()=>routingContext(f.episode,'s1'));
});
test('cross-process lock refuses a competing transaction without removing the owner lock',async t=>{
 const f=fixture(t);const lock=path.join(f.episode,'.work/video-routing/state.lock');fs.mkdirSync(path.dirname(lock),{recursive:true});fs.writeFileSync(lock,'owner');
 const moduleUrl=new URL('../dist/video-state.js',import.meta.url).href;
 const script=`import {videoTransaction} from ${JSON.stringify(moduleUrl)};try{videoTransaction(${JSON.stringify(f.episode)},()=>{});process.exit(1)}catch(e){if(!e.message.includes('video_state_busy'))throw e}`;
 const code=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['--input-type=module','-e',script],{stdio:'pipe'});child.on('error',reject);child.on('exit',resolve);});
 assert.equal(code,0);assert.equal(fs.readFileSync(lock,'utf8'),'owner');fs.unlinkSync(lock);
});
test('unknown ledger values fail closed without resetting spend',t=>{
 const f=fixture(t);const file=path.join(f.episode,'.work/video-routing/state.json');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify({version:1,jobs:{x:{reserveUsd:-1,status:'completed'}}}));
 assert.throws(()=>videoTransaction(f.episode,()=>{}),/Invalid video job/);
});
test('pre-existing per-cut choice survives the episode snapshot',t=>{
 const f=fixture(t);f.board.SCENES[0].visual.video.model='dreamina-seedance-2-0-260128';f.save();
 assert.equal(f.plan().selection.model,'dreamina-seedance-2-0-260128');assert.equal(f.plan().source,'board_shot');
 assert.throws(()=>planVideo({episode:f.episode,shotId:'s1',requestId:'m',tool:'seedance_text2video',operation:'image',args:{prompt:'x'}}),/disagree/);
});
test('provider tokens settle once; status exposes receipt and legacy events are not duplicated',async t=>{
 const f=fixture(t,{engine:'seedance',model:'dreamina-seedance-2-0-260128',resolution:'720p'});
 const old=config.arkApiKey;config.arkApiKey='fixture';t.after(()=>config.arkApiKey=old);
 const p=f.plan();const dispatch=async(_tool,args)=>{recordVideoSubmission('task-2');recordVideoTokens(10000);writeTinyMp4(args.outputPath,args.filename);return result;};
 await f.execute(p,dispatch);await f.execute(p,dispatch);
 assert.equal(f.state().jobs.a.settledUsd,0.07);
 const status=JSON.parse((await ROUTES.video_status({episode:f.episode,requestId:'a'})).content[0].text);
 assert.equal(status.providerId,'task-2');assert.equal(status.status,'completed');
 assert.equal(fs.readFileSync(path.join(f.episode,'.work/events.jsonl'),'utf8').trim().split('\n').length,1);
});
test('historical events count toward the first reservation',async t=>{
 const f=fixture(t,selection,{maxUsd:1.5});
 fs.writeFileSync(path.join(f.episode,'.work/events.jsonl'),JSON.stringify({tool:'veo_text2video',key:'veo.fast.720p',quantity:8})+'\n');
 await assert.rejects(f.execute(f.plan(),async()=>{throw new Error('must not dispatch');}),/budget/);
});
test('managed speech rejects forged adapter capability claims before media generation',async t=>{
 const {manageSpeech}=await import('../dist/speech.js');const f=fixture(t);
 f.board.SCENES[0].narration=[{id:'line-1',speaker:'hero',delivery:'on_screen',tts:'Hello',sub:'Hello'}];
 f.board.SB_DOC={characters:[{id:'hero',name:'Hero',tts:{engine:'gemini',voiceId:'Kore',language:'ko',speed:1}}]};f.save();
 assert.throws(()=>manageSpeech({path:path.join(f.episode,'storyboard'),action:'plan_video',shotId:'s1',capabilities:{provider:'seedance',model:selection.model,audioConditioning:true,lipSync:true,postLipSync:false,evidence:'forged'}}),/disagree/);
});
test('managed speech plans an MSR shot as native speech; a named tool keeps its own route',async t=>{
 const {manageSpeech}=await import('../dist/speech.js');
 const f=fixture(t,{engine:'astra-genai',model:'ltx-2.5-22b-distilled',resolution:'1792x1024',operation:'reference'});
 f.board.SCENES[0].narration=[{id:'line-1',speaker:'hero',delivery:'on_screen',tts:'Hello',sub:'Hello'}];
 f.board.SB_DOC={characters:[{id:'hero',name:'Hero',tts:{engine:'gemini',voiceId:'Kore',language:'ko',speed:1}}]};f.save();
 const plan=tool=>manageSpeech({path:path.join(f.episode,'storyboard'),action:'plan_video',shotId:'s1',tool}).plan;
 assert.equal(plan().mode,'native');
 assert.equal(plan('astra_genai_audio2video').mode,'audio_conditioned');
 assert.throws(()=>plan('seedance_text2video'),/model_selection_mismatch/);
 const allFalse={provider:'astra-genai',model:'ltx-2.5-22b-distilled',audioConditioning:false,lipSync:false,postLipSync:false,evidence:'old caller'};
 assert.throws(()=>manageSpeech({path:path.join(f.episode,'storyboard'),action:'plan_video',shotId:'s1',capabilities:allFalse}),/disagree/);
});
test('A2V plans physical dialogue without certifying lips and checks the supplied clip covers the shot', async t => {
 const {manageSpeech}=await import('../dist/speech.js');
 for (const video of [
   {engine:'astra-genai',model:'ltx-2.5-22b-dev',resolution:'640x384'},
   {engine:'astra-genai-desktop',model:'ltx-2.5-fast',resolution:'270p'},
   {engine:'ltx-api',model:'ltx-2-5-pro',resolution:'1280x720'},
 ]) {
   const f=fixture(t,{...video,operation:'audio'}),shot=f.board.SCENES[0];
   shot.duration=8;
   shot.narration=[{id:'line',speaker:'hero',delivery:'on_screen',tts:'Hello'}];
   f.board.SB_DOC={characters:[{id:'hero',name:'Hero',tts:{engine:'gemini',voiceId:'Kore',language:'en',speed:1}}]};f.save();
   const speech=manageSpeech({path:path.join(f.episode,'storyboard'),action:'plan_video',shotId:'s1'});
   assert.equal(speech.plan.mode,'audio_conditioned');
   assert.equal(speech.plan.capabilities.lipSync,false);
   const audioPath=path.join(f.episode,'short.wav');
   execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','sine=d=3',audioPath]);
   assert.throws(()=>planVideo({episode:f.episode,shotId:'s1',requestId:'short-track',
     args:{prompt:'Hero speaks.',audioPath,...(video.engine==='astra-genai-desktop'?{allowAudioTruncation:true}:{}),...(video.engine==='ltx-api'?{}:{reserveUsd:0})}}),/video_duration_short/);
 }
});
test('historical tally cannot hide costs absent from the event stream',async t=>{
 const f=fixture(t);fs.writeFileSync(path.join(f.episode,'.work/events.jsonl'),'');
 fs.writeFileSync(path.join(f.episode,'.work/cost-tally.tsv'),'veo.fast.720p\t80\timported generation\n');
 await assert.rejects(f.execute(f.plan(),async()=>result),/absent from events/);
});
test('host and local selection preserve narrator voiceover without invented lip-sync support',async t=>{
 const {speechVideoCapabilities}=await import('../dist/video-registry.js');
 const {speechVideoPlan}=await import('../dist/speech.js');
 for(const engine of ['host','mlx']) {
  const caps=speechVideoCapabilities(engine,'selected');
  assert.equal(speechVideoPlan([{id:'n',speaker:'narrator',delivery:'voiceover',tts:'Hello'}],caps).mode,'voiceover');
  assert.throws(()=>speechVideoPlan([{id:'n',speaker:'hero',delivery:'on_screen',tts:'Hello'}],caps),/cannot synchronize/);
 }
});
test('ASTRA retake inherits verified source dimensions without unsupported payload fields',async t=>{
 const f=fixture(t,{engine:'astra',resolution:'64x64'});const file=path.join(f.episode,'source.mp4');
 execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=red:s=64x64:r=24','-t','1','-c:v','mpeg4',file]);
 const old=config.astraVideoApiKey;config.astraVideoApiKey='fixture';t.after(()=>config.astraVideoApiKey=old);
 const p=planVideo({episode:f.episode,shotId:'s1',requestId:'retake',operation:'retake',args:{prompt:'A boat',sourceVideoPath:file,startTime:0,endTime:1}});
 assert.equal(p.args.width,undefined);assert.equal(p.args.height,undefined);
 await f.execute(p,async(tool,args)=>{assert.equal(tool,'astra_video_retake');assert.equal(args.width,undefined);return result;});
 f.board.SCENES[0].visual.video.resolution='128x64';f.save();
 assert.throws(()=>planVideo({episode:f.episode,shotId:'s1',requestId:'wrong',operation:'retake',args:{prompt:'A boat',sourceVideoPath:file,startTime:0,endTime:1}}),/inherits source/);
});
test('managed ASTRA audio disables internal generations and never completes a hidden ambiguous child',async t=>{
 const f=fixture(t,{engine:'astra',resolution:'1024x1920'});
 const old=config.astraVideoApiKey;config.astraVideoApiKey='fixture';t.after(()=>config.astraVideoApiKey=old);
 const args={prompt:'A speaker moves',audioUploadId:'audio-existing',expectLipSync:true};
 assert.throws(()=>planVideo({episode:f.episode,shotId:'s1',requestId:'multi',operation:'audio',args:{...args,maxAttempts:2}}),/one submission/);
 const p=planVideo({episode:f.episode,shotId:'s1',requestId:'a',operation:'audio',args});
 assert.equal(p.args.maxAttempts,1);
 await assert.rejects(f.execute(p,async()=>{
   recordVideoSubmission('first-completed');
   // Defensive envelope: an adapter that swallows a later poll failure still cannot complete.
   recordVideoSubmission('second-accepted-poll-failed');
   return result;
 }),/multiple provider submissions/);
 assert.equal(f.state().jobs.a.status,'submission_unknown');
 assert.deepEqual(f.state().jobs.a.providerIds,['first-completed','second-accepted-poll-failed']);
 await assert.rejects(f.execute(p,async()=>result),/pending/);
});
test('unrelated billable tools retain normal accounting with stray videoContext',async()=>{
 const {isManagedVideoCall}=await import('../dist/video-registry.js');
 const {isBillableTool}=await import('../dist/usage-ledger.js');
 for(const tool of ['gpt_image_text2img','tts_generate','music_generate']) {
  assert.equal(isBillableTool(tool),true);assert.equal(isManagedVideoCall(tool,{videoContext:{episode:'/tmp/e'}}),false);
 }
 assert.equal(isManagedVideoCall('seedance_text2video',{videoContext:{episode:'/tmp/e'}}),true);
 assert.equal(isManagedVideoCall('seedance_text2video',{prompt:'Standalone'}),false);
});

test('GenAI selection binds its model and reservation; managed recovery completes without another submission', async t => {
 const { videoStatus } = await import('../dist/video-routing.js');
 const { createHash } = await import('node:crypto');
 const { astraGenaiBaseUrl } = await import('../dist/astra-genai-client.js');
 const f=fixture(t,{engine:'astra-genai',model:'ltx-2.5-22b-distilled',resolution:'1280x704'});
 const old=config.astraGenaiApiKey;config.astraGenaiApiKey='fixture';t.after(()=>config.astraGenaiApiKey=old);
 const args={prompt:'A boat crosses a lake.',duration:5,reserveUsd:0.25};
 const make=extra=>planVideo({episode:f.episode,shotId:'s1',requestId:'genai',operation:'text',args:{...args,...extra}});
 assert.throws(()=>make({reserveUsd:undefined}));
 const p=make();assert.equal(p.tool,'astra_genai_text2video');assert.equal(p.quote.reserveUsd,0.25);
 assert.equal(p.args.model,'ltx-2.5-22b-distilled');assert.equal(p.args.resolution,'1280x704');
 // A stale preset conversion must not replace the explicitly selected geometry.
 for (const [saved,v2] of [['1792x1024','1792x1024'],['1024x1792','1024x1792'],['1080x720','1080x720']]) {
  const g=fixture(t,{engine:'astra-genai',model:'ltx-2.5-22b-dev',resolution:saved});
  assert.equal(planVideo({episode:g.episode,shotId:'s1',requestId:'v2',operation:'text',args}).args.resolution,v2);
 }
 // Audio-to-video exists on GenAI but has no duration; its length comes from the audio.
 assert.throws(()=>planVideo({episode:f.episode,shotId:'s1',requestId:'speech',operation:'audio',args}),/Unsupported astra_genai_audio2video argument: duration/);
 // A negative prompt in video_plan.args reaches the guided dev lanes and survives the replan; distilled has no negative pass.
 const dev=fixture(t,{engine:'astra-genai',model:'ltx-2.5-22b-dev',resolution:'1280x704'}),negativePrompt='has_subtitles, captions';
 const wav=path.join(dev.episode,'line.wav');fs.writeFileSync(wav,'RIFF');
 for (const [operation,tool,extra] of [['text','astra_genai_text2video',args],['audio','astra_genai_audio2video',{prompt:args.prompt,audioPath:wav,reserveUsd:0.25}]]) {
  const n=planVideo({episode:dev.episode,shotId:'s1',requestId:'negative-'+operation,operation,args:{...extra,negativePrompt}});
  assert.equal(n.tool,tool);assert.equal(n.args.negativePrompt,negativePrompt);
  const stored=JSON.parse(fs.readFileSync(path.join(dev.episode,'.work/video-routing/plans',n.id+'.json')));
  assert.equal(planVideo({episode:dev.episode,shotId:n.shotId,requestId:n.requestId,tool:n.tool,args:stored.sourceArgs}).id,n.id);
 }
 assert.throws(()=>make({negativePrompt}),/negativePrompt requires ltx-2.5-22b-dev/);
 let calls=0;
 await assert.rejects(f.execute(p,async (_tool,input)=>{
   calls++;recordVideoSubmission('recover-1');fs.mkdirSync(input.outputPath,{recursive:true});
   const file=path.join(input.outputPath,input.filename);fs.writeFileSync(file,'verified-adapter-result');
   fs.writeFileSync(file+'.astra-genai.json',JSON.stringify({version:1,baseUrl:astraGenaiBaseUrl(),operation:'text-to-video',fingerprint:'fixture',videoPath:file,jobId:'recover-1',status:'completed',sha256:createHash('sha256').update(fs.readFileSync(file)).digest('hex')}));
   throw new Error('caller interrupted');
 }),/interrupted/);
 assert.equal((await videoStatus({episode:f.episode,requestId:'genai',action:'refresh'})).status,'completed');
 await f.execute(p,async()=>assert.fail('must reuse recovered result'));assert.equal(calls,1);
});

test('a saved reference operation plans MSR with the speaker sample, dimensions and local references', async t => {
  const f = fixture(t, { engine: 'astra-genai', model: 'ltx-2.5-22b-distilled', resolution: '1792x1024', operation: 'reference' });
  const ref = path.join(f.episode, 'person.png'); fs.writeFileSync(ref, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=', 'base64'));
  const voice = path.join(f.episode, 'hero.wav'); fs.writeFileSync(voice, 'voice');
  f.board.SB_DOC = { characters: [{ id: 'hero', tts: { engine: 'gemini', voiceId: 'Kore', language: 'ko', speed: 1 }, voiceReference: { path: voice, imagePaths: [ref] } }] };
  f.board.SCENES[0].narration = [{ id: 'l1', speaker: 'hero', delivery: 'on_screen', tts: '안녕하세요' }]; f.save();
  const key = config.astraGenaiApiKey, fetch = globalThis.fetch; config.astraGenaiApiKey = 'fixture';
  t.after(() => { config.astraGenaiApiKey = key; globalThis.fetch = fetch; });
  globalThis.fetch = async () => Response.json({ msr: true, voice_references: true });
  await refreshGenaiMsrVoice(true);
  fs.writeFileSync(path.join(f.episode, 'invalid.png'), 'not an image');
  assert.throws(() => planVideo({ episode: f.episode, shotId: 's1', requestId: 'invalid', args: { prompt: 'Walk.', openingPositions: [{ character:'hero', images:[1], position:'on the left beside the desk' }], references: [{ imagePath: 'person.png' }, { imagePath: 'invalid.png', background: true }], reserveUsd: 0.25 } }), /image_invalid/);
  assert.equal(fs.existsSync(path.join(f.episode, '.work/video-routing/state.json')), false);
  const p = planVideo({ episode: f.episode, shotId: 's1', requestId: 'msr', args: {
    prompt: 'Person in image 1 says hello.', openingPositions: [{ character:'hero', images:[1], position:'on the left beside the desk' }], references: [{ imagePath: 'person.png' }], duration: 5, reserveUsd: 0.25,
    negativePrompt: 'subtitles', guidanceScale: 1, nagScale: 11, nagAlpha: 0.25, nagTau: 2.5,
  } });
  assert.equal(p.tool, 'astra_genai_msr'); assert.equal(p.args.model, undefined); assert.equal(p.args.resolution, undefined);
  assert.equal(p.args.width, 1792); assert.equal(p.args.height, 1024); assert.equal(p.args.references[0].imagePath, ref);
  assert.match(p.args.prompt, /hero \(Image 1\): on the left beside the desk/); assert.equal(p.args.references[0].audioPath, voice); assert.equal(p.quote.reserveUsd, 0.25);
  const stored = JSON.parse(fs.readFileSync(path.join(f.episode, '.work/video-routing/plans', p.id + '.json')));
  assert.deepEqual([stored.args.nagScale, stored.args.nagAlpha, stored.args.nagTau], [11, 0.25, 2.5]);
  const replanned = planVideo({ episode: f.episode, shotId: p.shotId, requestId: p.requestId, tool: p.tool, args: stored.sourceArgs });
  assert.equal(replanned.id, p.id);
  assert.deepEqual(replanned.args, stored.args);
  fs.appendFileSync(ref, 'changed');
  await assert.rejects(f.execute(p, async () => assert.fail('stale reference must not generate')), /stale/);
});

test('native gateway video settings select the Desktop adapter and preserve audio loss policy',t=>{
 const f=fixture(t,{engine:'astra-genai-desktop',model:'ltx-2.5-fast',resolution:'270p'});
 const audio=path.join(f.episode,'line.wav');fs.writeFileSync(audio,'fixture');
 const p=planVideo({episode:f.episode,shotId:'s1',requestId:'desktop',operation:'audio',args:{prompt:'A speaker',audioPath:audio,reserveUsd:0}});
 assert.equal(p.tool,'astra_genai_desktop_audio2video');assert.equal(p.args.allowAudioTruncation,false);assert.equal(p.args.model,'ltx-2.5-fast');assert.equal(p.args.resolution,'270p');assert.ok(p.inputs[audio]);
 assert.throws(()=>planVideo({episode:f.episode,shotId:'s1',requestId:'wrong',operation:'image',args:{prompt:'ball',imagePath:audio,duration:2,loras:[{ref:'x'}],reserveUsd:0}}));
});
test('a saved engine that cannot keep a voice is refused by name, not as a missing adapter',t=>{
 const f=fixture(t);
 for (const video of [{engine:'veo',model:'veo-3.1-fast-generate-preview',resolution:'720p'},{engine:'seedance',model:'seedance-1-5-pro-251215',resolution:'720p'}]) {
  f.board.PRODUCTION.modelSettings={overrides:[{scope:'shot',shotId:'s1',request:'Old choice',video}]};f.save();
  assert.throws(()=>f.plan(),/video_engine_unsupported/);
 }
 assert.throws(()=>speechVideoCapabilities('veo','veo-3.1-fast-generate-preview'),/video_engine_unsupported/);
});


test('storyboard timing follows snapshot, scoped overrides, source trim and outgoing handles before media', async t => {
  const f = fixture(t, { engine: 'astra-genai', model: 'ltx-2.5-22b-distilled', resolution: '1792x1024', operation: 'reference' });
  f.board.SCENES[0].narration = [{ id: 'l1', speaker: 'hero', delivery: 'on_screen', tts: 'Hello' }];
  Object.assign(f.board.SCENES[0], { duration: 14, edit: { in: .5 }, shot: { render: { mode: 'generated_video' } } });
  f.board.SCENES[1].transition = 'dissolve';
  f.save();
  const fit = readShotVideoTiming(f.episode, 's1');
  assert.equal(fit.status, 'fits');
  assert.equal(fit.maxSeconds, 361 / 24);
  assert.ok(Math.abs(fit.requiredSeconds - 14.9) < 1e-9);
  assert.equal(fit.request.numFrames, 361);
  const { readStoryboard, storyboardReadSchema } = await import('../dist/storyboard.js');
  assert.equal(readStoryboard(storyboardReadSchema.parse({ path: path.join(f.episode, 'storyboard') })).videoTiming[0].status, 'fits');
  f.board.SCENES[0].duration = 21; f.save();
  assert.equal(readShotVideoTiming(f.episode, 's1').status, 'split_required');
  assert.throws(() => planVideo({ episode: f.episode, shotId: 's1', requestId: 'over', args: {} }), /video_duration_exceeded/);
  assert.equal(fs.existsSync(path.join(f.episode, '.work/video-routing/plans')), false);
  f.board.PRODUCTION.modelSettings = { overrides: [{ scope: 'shot', shotId: 's1', request: 'Fixture route change',
    video: { engine: 'seedance', model: 'dreamina-seedance-2-0-260128', resolution: '720p', operation: 'reference' } }] };
  // Use the registered 30-second model, not a family-wide limit.
  const { SEEDANCE_MODEL_SPECS } = await import('../dist/seedance-client.js');
  f.board.PRODUCTION.modelSettings.overrides[0].video.model = Object.entries(SEEDANCE_MODEL_SPECS).find(([, spec]) => spec.duration[1] === 30)[0];
  delete f.board.SCENES[0].visual.video;
  f.save();
  const changed = readShotVideoTiming(f.episode, 's1');
  assert.equal(changed.source, 'shot_override');
  assert.equal(changed.maxSeconds, 30);
  assert.equal(changed.status, 'fits');
});

test('MSR plans cover the whole shot, reject short exact requests and recheck changed timing', async t => {
  const f = fixture(t, { engine: 'astra-genai', model: 'ltx-2.5-22b-distilled', resolution: '1792x1024', operation: 'reference' });
  const ref = path.join(f.episode, 'person.png');
  fs.writeFileSync(ref, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=', 'base64'));
  f.board.SCENES[0].narration = [{ id: 'l1', speaker: 'hero', delivery: 'on_screen', tts: 'Hello' }];
  f.board.SCENES[0].duration = 5.1; f.save();
  const args = { prompt: 'A person listens.', openingPositions: [{character:'hero',images:[1],position:'seated on the left'}], references: [{ imagePath: ref }], reserveUsd: .25 };
  const plan = extra => planVideo({ episode: f.episode, shotId: 's1', requestId: 'timed', args: { ...args, ...extra } });
  const p = plan({});
  assert.equal(p.args.numFrames, 129);
  assert.equal(p.args.duration, undefined);
  assert.equal(p.durationPlan.status, 'fits');
  assert.throws(() => plan({ duration: 5.1 }), /video_duration_short/); // nearest-frame legacy duration rounds down
  assert.throws(() => plan({ numFrames: 121 }), /video_duration_short/);
  assert.throws(() => plan({ requiredSeconds: 5, duration: 6 }), /mutually exclusive/);
  assert.equal(plan({ requiredSeconds: 1 }).args.numFrames, 129); // cannot understate board coverage
  // A request longer than its lines is reported with the shortest covering one, never refused.
  f.board.SCENES[0].narration[0].tts = '너도 담배냐?'; f.board.SCENES[0].duration = 4; f.save();
  const padded = plan({});
  assert.equal(padded.args.numFrames, 97);
  assert.deepEqual(padded.speechFit.shortestRequest, { numFrames: 41, seconds: 1.71 });
  assert.equal(padded.speechFit.excessSeconds, 2.53);
  assert.match(padded.speechFit.warning, /numFrames 41/);
  f.board.SCENES[0].duration = 1.6; f.save();
  assert.equal(plan({}).speechFit.warning, undefined);
  // EP07: a two-second board clock must not truncate an unmeasured Vietnamese line.
  f.board.STORY = { language: 'vi' };
  f.board.SCENES[0].duration = 2;
  f.board.SCENES[0].narration[0].tts = 'Cuối tuần này em có rảnh không?'; f.save();
  const spoken = plan({ requiredSeconds: 2 });
  assert.ok(spoken.args.numFrames / 24 >= spoken.speechFit.estimatedSeconds);
  assert.ok(spoken.args.numFrames > 49);
  assert.equal(spoken.durationPlan.speech.speechRate, 'uncalibrated');
  assert.throws(() => plan({ numFrames: 49 }), /video_duration_short/);
  f.board.SCENES[0].narration[0].tts = 'Khoan đã. Khi nào tôi khỏe, mình đi ăn một bữa nhé.'; f.save();
  assert.ok(plan({}).args.numFrames > 81);
  f.board.SCENES[0].duration = 21; f.save();
  await assert.rejects(f.execute(p, async () => assert.fail('Over-limit revision must not submit')), /video_duration_exceeded|stale/);
});


test('MSR projects route silent and thought shots to I2V and split speaker changes before planning', async t => {
 const {manageSpeech}=await import('../dist/speech.js');
 const f=fixture(t,{engine:'astra-genai',model:'ltx-2.5-22b-distilled',resolution:'1792x1024',operation:'reference'});
 const img=path.join(f.episode,'opening.png');
 fs.writeFileSync(img,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=','base64'));
 const shot=f.board.SCENES[0];
 shot.visual.frames={mode:'reference',start:'../opening.png'};
 shot.visual.video.promptSource={action:'The character notices the open door.'};
 f.board.SB_DOC={characters:[{id:'hero',tts:{engine:'gemini',voiceId:'Kore',language:'ko',speed:1}}]};
 const plan=(generateAudio)=>planVideo({episode:f.episode,shotId:'s1',requestId:'thought',args:{duration:5,reserveUsd:0.25,generateAudio}});
 for(const narration of [[],[{id:'l1',speaker:'hero',delivery:'voiceover',tts:'A secret thought.'}]]) {
  shot.narration=narration;
  shot.performance=narration.length ? undefined : [{kind:'action',character:'hero',text:'Glances toward the open door.',durationSeconds:1}];
  f.save();
  const p=plan();
  assert.equal(p.tool,'astra_genai_img2video');assert.equal(p.selection.operation,'image');
  assert.equal(p.selection.model,'ltx-2.5-22b-distilled');assert.equal(p.args.resolution,'1792x1024');
  assert.equal(p.args.generateAudio,narration.length===0);assert.equal(p.args.imageUri,'data:image/png;base64,'+fs.readFileSync(img).toString('base64'));
  assert.equal(p.args.prompt.includes('natural ambience'),narration.length===0);
  const withEffects = plan(true);
  assert.equal(withEffects.args.generateAudio,narration.length===0);
  assert.equal(withEffects.args.prompt.includes('sound effects from the visible actions'),narration.length===0);
  assert.doesNotMatch(withEffects.args.prompt,/silent scene/);
  const withPostSound = plan(false);
  assert.equal(withPostSound.args.generateAudio,false);
  assert.doesNotMatch(withPostSound.args.prompt,/natural ambience/);
  assert.equal(p.imageBindings.find(b=>b.id==='start').path,img);
  assert.match(p.args.prompt,/Start from the given first frame/);assert.match(p.args.prompt,/mouths stay closed/);
  assert.doesNotMatch(p.args.prompt,/A secret thought/);
  assert.equal(p.args.references,undefined);
  assert.equal(manageSpeech({path:path.join(f.episode,'storyboard'),action:'plan_video',shotId:'s1'}).plan.mode,'voiceover');
  assert.throws(()=>planVideo({episode:f.episode,shotId:'s1',requestId:'wrong',tool:'astra_genai_msr'}),/msr_speech_route/);
 }
 shot.duration=5.1;f.save();
 assert.throws(plan,/video_duration_short/);
 const timed=planVideo({episode:f.episode,shotId:'s1',requestId:'timed-thought',args:{reserveUsd:0.25}});
 assert.equal(timed.args.duration,6);assert.ok(Math.abs(timed.durationPlan.requiredSeconds-5.1)<1e-9);
 const required=seconds=>planVideo({episode:f.episode,shotId:'s1',requestId:'required-thought',args:{requiredSeconds:seconds,reserveUsd:0.25}});
 assert.equal(required(5.1).args.duration,6);assert.equal(required(8.1).args.duration,9);
 assert.equal(required(1).args.duration,6);assert.equal(required(5.1).args.requiredSeconds,undefined);
 assert.throws(()=>planVideo({episode:f.episode,shotId:'s1',requestId:'conflict',args:{requiredSeconds:5.1,duration:6,reserveUsd:0.25}}),/mutually exclusive/);
 shot.narration=[];delete shot.duration;
 shot.visual.video.promptSource.sound='Silent; narration is supplied separately.';
 f.save();
 assert.equal(plan().args.generateAudio,false);
 shot.narration=[{id:'l1',speaker:'hero',delivery:'on_screen',tts:'Hello'},{id:'l2',speaker:'friend',delivery:'on_screen',tts:'Hi'}];f.save();
 assert.throws(plan,/shot_speaker_limit/);
 shot.narration[1]={id:'l2',speaker:'hero',delivery:'voiceover',tts:'A thought'};f.save();
 assert.throws(plan,/msr_speech_route/);
});

test('candidate lineage survives revalidation; overview is local and output files cannot be reused',async t=>{
 const f=fixture(t);
 const first=planVideo({episode:f.episode,shotId:'s1',requestId:'draft-a',purpose:'draft',operation:'text',args:{prompt:'Open the door.',durationSeconds:8}});
 await f.execute(first,async(_tool,args)=>{fs.mkdirSync(args.outputPath,{recursive:true});fs.writeFileSync(path.join(args.outputPath,args.filename),'fixture');return result;});
 const second=planVideo({episode:f.episode,shotId:'s1',requestId:'final-b',purpose:'final',basedOnRequestId:'draft-a',changeNote:'End on the doorway.',operation:'text',args:{prompt:'Hold on the doorway.',durationSeconds:8}});
 await f.execute(second,async()=>result);
 const report=await videoStatus({episode:f.episode});
 assert.equal(report.candidates.length,2);
 assert.equal(report.summary.completedShots,1);
 const candidate=report.candidates.find(c=>c.requestId==='final-b');
 assert.equal(candidate.purpose,'final');assert.ok(candidate.changes.includes('prompt'));
 assert.equal(candidate.status,'completed');assert.equal(candidate.review,'not_reviewed');
 assert.ok(candidate.finishedAt);assert.ok(candidate.startedAt);
 assert.throws(()=>planVideo({episode:f.episode,shotId:'s2',requestId:'wrong',basedOnRequestId:'draft-a',operation:'text',args:{prompt:'x'}}),/video_parent_missing/);
 const conflict=f.plan('conflict',{filename:first.args.filename});
 await assert.rejects(f.execute(conflict,async()=>{assert.fail('must not dispatch');}),/video_output_conflict/);
 await assert.rejects(videoStatus({episode:f.episode,action:'refresh'}),/requestId is required/);
 assert.ok(fs.readFileSync(path.join(f.episode,'storyboard/video-production-data.js'),'utf8').startsWith('window.VIDEO_PRODUCTION = '));
});
test('a hosted reference lane takes the spoken shot from the board: panels, the start image last, the voice sample and the price', t => {
 const f=fixture(t,{engine:'minimax',model:'MiniMax-H3',resolution:'768P',operation:'reference'});
 const png=(name,size)=>{const file=path.join(f.episode,name);execFileSync('ffmpeg',['-v','error','-f','lavfi','-i',`color=c=gray:s=${size}`,'-frames:v','1',file]);return file;};
 png('face.png','32x32');png('place.png','64x36');png('start.png','64x36');
 execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','sine=d=3',path.join(f.episode,'hero.wav')]);
 f.board.SB_DOC={characters:[{id:'hero',name:'Hero',tts:{engine:'gemini',voiceId:'Kore',language:'en'},voiceReference:{path:'../hero.wav',imagePaths:['../face.png']}}]};
 f.board.SCENES[0]={id:'s1',narration:[{id:'l1',speaker:'hero',delivery:'on_screen',tts:'Hello there'}],visual:{frames:{mode:'reference',start:'../start.png'},
  references:[{id:'hero-face',path:'../face.png',role:'character',use:'both',purpose:'Hero face'},{id:'street',path:'../place.png',role:'background',use:'both',purpose:'the street'}],video:{prompt:'Hero greets the viewer.'}}};
 f.board.SCENES[1]={id:'s2',visual:{frames:{mode:'first',start:'../start.png'},references:[],video:{prompt:'Hero walks on.'}}};f.save();
 const p=planVideo({episode:f.episode,shotId:'s1',requestId:'ref'});
 assert.equal(p.tool,'minimax_reference');
 assert.deepEqual(p.args.referenceImagePaths.map(file=>path.basename(file)),['face.png','start.png']);
 assert.equal(p.args.ratio,'16:9');
 assert.deepEqual(p.args.referenceAudioPaths.map(file=>path.basename(file)),['hero.wav']);
 assert.match(p.args.prompt,/reference image 2 \(start/);
 assert.match(p.args.prompt,/reference image 1, uses reference audio 1/);
 assert.equal(p.quote.reserveUsd,0.32);
 assert.match(p.args.prompt,/reference image 1 \(Hero\) speaks using reference audio 1.*"Hello there"/);
 assert.throws(()=>planVideo({episode:f.episode,shotId:'s2',requestId:'forced',operation:'reference'}),/reference_speech_route/);
 const silent=planVideo({episode:f.episode,shotId:'s2',requestId:'silent'});
 assert.equal(silent.tool,'minimax_img2video');
 assert.match(silent.args.prompt,/No speech/);
 assert.equal(path.basename(silent.args.sourceImagePath),'start.png');
});

test('sceneNo refuses a frame-addressed cut on I2V and preserves ordered dialogue on a legacy single-shot board', async t => {
 const f = fixture(t, {engine:'astra-genai',model:'ltx-2.5-22b-distilled',resolution:'576x1024',operation:'reference'});
 const positions = [
  {character:'witness',images:[1],position:'standing at the near witness rail'},
  {character:'heir',images:[2],position:'seated at the far-right desk'},
 ];
 const direction = {openingPositions:positions,emotion:'The heir is angry. The witness feels ashamed.'};
 f.board.STRUCTURE = {version:'1',sequences:[{id:'q',scenes:[1]}],scenes:[{no:1,videoDirection:direction}]};
 const dir = path.join(f.episode,'storyboard');
 for (const name of ['opening','witness','heir'])
  fs.writeFileSync(path.join(dir,name+'.png'),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=','base64'));
 f.board.SB_DOC = {characters:positions.map(p=>({id:p.character,tts:{language:'ko',voiceId:'fixture'},voiceReference:{imagePaths:[p.character+'.png']}}))};
 const oldKey=config.astraGenaiApiKey, oldFetch=globalThis.fetch;
 config.astraGenaiApiKey='fixture';
 globalThis.fetch=async()=>Response.json({msr:true,voice_references:true});
 t.after(()=>{config.astraGenaiApiKey=oldKey;globalThis.fetch=oldFetch;});
 await refreshGenaiMsrVoice(true);
 for (const person of f.board.SB_DOC.characters) {
  person.voiceReference.path=path.join(dir,person.id+'.wav');
  execFileSync('ffmpeg',['-loglevel','error','-f','lavfi','-i','sine=duration=0.12',person.voiceReference.path]);
 }
 const words = ['왜 그랬어요?', '제가 찢었습니다.'];
 for (const [i,shot] of f.board.SCENES.entries()) {
  shot.scene=1; shot.duration=4+i; shot.visual.frames={mode:'first',start:'opening.png'};
  shot.visual.character=[positions[i].character];
  shot.visual.references=[{id:'p'+i,path:positions[i].character+'.png',use:'both',role:'character',purpose:'Face and clothing.'}];
  shot.narration=[{id:'l'+i,speaker:positions[1-i].character,tts:words[i],delivery:'on_screen',acting:{direction:'Walk over to the witness.',vocal:'Whisper the answer.'}}];
 }
 f.save();
 const input={episode:f.episode,sceneNo:1,requestId:'whole-scene',args:{reserveUsd:0.1}};
 assert.throws(()=>planVideo(input),error => {
   assert.ok(error.missing.some(m => m.shotId === 's2' && m.input === 'transition' && m.frame === 96));
   assert.deepEqual(error.missing.filter(m => m.input === 'image').map(m => [m.shotId,m.frame,m.role]), [['s2',96,'start']]);
   for (const [i,card] of error.sceneRequest.shots.entries()) {
     const speaker = positions[1-i].character;
     assert.equal(card.dialogue[0].text,words[i]);
     assert.equal(card.dialogue[0].voice.path,path.join(dir,speaker+'.wav'));
     assert.ok(error.missing.some(m=>m.input==='voice' && m.shotId===card.shotId && m.speaker===speaker));
   }
   return true;
 });
 delete f.board.STRUCTURE.scenes[0].videoDirection;
 f.save();
 assert.throws(()=>planVideo(input),error=>error.sceneRequest.cuts[0].frame===96 &&
   error.missing.some(m=>m.role==='scene_direction') && error.missing.some(m=>m.lineId==='l1'));
 f.board.STRUCTURE.scenes[0].videoDirection=direction;
 f.save();
 assert.throws(()=>planVideo({...input,sceneNo:undefined,shotId:'s2'}),/scene_video_scope/);
 // The older single-camera board has one shot with both turns and both opening reference panels.
 const [first, second] = f.board.SCENES;
 first.duration += second.duration;
 first.narration.push(...second.narration);
 first.visual.character.push(...second.visual.character);
 first.visual.references.push(...second.visual.references);
 f.board.SCENES = [first];
 f.save();
 const plan=planVideo(input);
 assert.deepEqual(plan.shotIds,['s1']);
 assert.equal(plan.args.duration,9); assert.equal(plan.sceneNo,1);
 assert.equal(plan.tool,'astra_genai_img2video'); assert.match(plan.args.imageUri,/^data:image\/png/);
 assert.equal(plan.args.references.length,3);
 assert.ok(plan.args.prompt.startsWith('Opening frame'));
 assert.match(plan.args.prompt,/heir \(Image 2, Audio 2\): "왜 그랬어요\?"[\s\S]+witness \(Image 1, Audio 1\): "제가 찢었습니다\."/);
 assert.equal(plan.args.prompt.split(words[0]).length,2);
 assert.match(plan.args.prompt,/Whisper the answer/);
 assert.doesNotMatch(plan.args.prompt,/hard cut|camera holds|tripod|gets to his feet|walk over/i);
 assert.throws(()=>planVideo({...input,shotId:'s1'}),/sceneNo or shotId/);
 assert.throws(()=>planVideo({...input,args:{duration:3}}),/video_duration_short/);
 approveVideo({episode:f.episode,planIds:[plan.id],request:'Approve this whole scene'});
 let calls=0;
 await f.execute(plan,async (tool,args)=>{
  calls++;
  assert.equal(tool,plan.tool); assert.equal(args.prompt,plan.args.prompt);
  assert.equal(args.references[1].audioPath,path.join(dir,'heir.wav'));
  return result;
 });
 await assert.rejects(f.execute(plan,async()=>assert.fail('duplicate scene submission')), /ENOENT/);
 assert.equal(calls,1);
 first.performance=[{kind:'dialogue',group:2,character:first.narration[1].speaker},
   {kind:'action',text:'Touch the latch.'},{kind:'dialogue',group:1,character:first.narration[0].speaker}];
 f.save();
 const reordered=planVideo({...input,requestId:'reordered'},false);
 const prompt=reordered.args.prompt;
 assert.ok(prompt.indexOf(words[1])>=0 && prompt.indexOf(words[1])<prompt.indexOf(words[0]));
 assert.match(prompt,/Beat 1 with line 2[\s\S]*Touch the latch[\s\S]*Beat 3 with line 1/);
 f.board.STRUCTURE.scenes[0].directionDefaults={camera:'camera.static'};
 first.narration[0].acting={direction:'Stammer on the first syllable.',vocal:'Whisper the answer.',tags:['sighs']};
 f.save();
 const directed=planVideo({...input,requestId:'scene-direction'},false);
 assert.match(directed.args.prompt,/Stammer on the first syllable\. Whisper the answer\. sighs/);
 f.board.SCENES[0].narration[1].tts='다른 대사'; f.save();
 assert.throws(()=>approveVideo({episode:f.episode,planIds:[plan.id],request:'old'}),/stale/);
 await assert.rejects(f.execute(plan,async()=>assert.fail('stale scene submitted')),/stale/);
});

test('the same managed call maps storyboard frames to the saved LTX or Veo deployment', async t => {
  const calls = [];
  const oldKey = config.astraGenaiApiKey, oldUrl = process.env.ASTRA_GENAI_URL;
  config.astraGenaiApiKey = 'fixture';
  process.env.ASTRA_GENAI_URL = 'http://gateway.fixture.invalid';
  t.after(() => {
    config.astraGenaiApiKey = oldKey;
    if (oldUrl === undefined) delete process.env.ASTRA_GENAI_URL;
    else process.env.ASTRA_GENAI_URL = oldUrl;
  });
  t.mock.method(globalThis, 'fetch', async url => {
    calls.push(String(url));
    return Response.json({ voice_references: false });
  });
  const first = png;
  const last = execFileSync('ffmpeg', ['-v','error','-f','lavfi','-i','color=red:s=2x2','-frames:v','1','-f','image2pipe','-vcodec','png','pipe:1']);
  const variants = [
    [{ engine:'veo', model:'veo-3.1-fast-generate-001', resolution:'720p' }, 'veo_img2video'],
    [{ engine:'ltx-api', model:'ltx-2-5-pro', resolution:'1280x720' }, 'ltx_api_img2video'],
    [{ engine:'astra-genai', model:'ltx-2.5-22b-distilled', resolution:'1792x1024' }, 'astra_genai_img2video'],
  ];
  for (const [video, tool] of variants) {
    const f = fixture(t, video);
    const shot = f.board.SCENES[0];
    delete shot.visual.video;
    shot.scene = 1;
    shot.duration = 8;
    shot.visual.frames = {mode:'first_last', start:'first.png', end:'last.png'};
    shot.visual.video = {prompt:'An envelope opens.'};
    f.board.STRUCTURE = {scenes:[{no:1,videoDirection:{emotion:'Calm.',action:'Open the envelope.',openingPositions:[],fps:24}}]};
    for (const [file, bytes] of [['first.png',first], ['last.png',last]])
      fs.writeFileSync(path.join(f.episode,'storyboard',file),bytes);
    f.save();

    for (const scope of [{sceneNo:1},{shotId:'s1'}]) {
      if (scope.shotId) {
        delete f.board.STRUCTURE.scenes[0].videoDirection.fps;
        f.save();
      }
      const input = {episode:f.episode,...scope,requestId:'auto',maxCostUsd:3};
      const response = await ROUTES.video_plan(input);
      const plan = JSON.parse(response.content[0].text);
      assert.equal(plan.tool, tool);
      assert.equal(plan.sceneNo, scope.sceneNo);
      assert.equal(plan.args.model, video.model);
      assert.equal(plan.maxCostUsd, 3);
      const first64 = first.toString('base64'), last64 = last.toString('base64');
      if (tool === 'veo_img2video') {
        const {instances:[instance], parameters} = buildVeoBody(plan.args);
        assert.equal(instance.image.bytesBase64Encoded, first64);
        assert.equal(instance.lastFrame.bytesBase64Encoded, last64);
        assert.equal(parameters.durationSeconds, 8);
      } else {
        const wire = tool === 'ltx_api_img2video' ? buildLtxApiBody(plan.args).body : buildGenaiVideoBody(plan.args);
        assert.equal(wire.image_uri, 'data:image/png;base64,' + first64);
        assert.equal(wire.last_frame_uri, 'data:image/png;base64,' + last64);
        assert.equal(wire.duration, 8);
        assert.equal(wire.reserveUsd, undefined);
      }
      if (video.engine !== 'astra-genai') {
        assert.equal(calls.length, 0);
        assert.throws(() => planVideo({...input,maxCostUsd:0}), /video_quote_exceeded/);
      }
    }
    shot.visual = {bg:'first.png',video:{lastImagePath:'last.png',prompt:'An envelope opens.'}};
    f.save();
    const gateway = video.engine === 'astra-genai';
    const firstFile = path.join(f.episode, 'storyboard/first.png'), lastFile = path.join(f.episode, 'storyboard/last.png');
    const explicitFirst = {[gateway ? 'imagePath' : 'sourceImagePath']:firstFile};
    const explicitLast = {[gateway ? 'lastFramePath' : 'lastImagePath']:lastFile};
    for (const [opening, args] of [['first.png',explicitFirst], ['first.png',explicitLast], [undefined,explicitFirst]]) {
      shot.visual.bg = opening;
      f.save();
      const response = await ROUTES.video_plan({episode:f.episode,shotId:'s1',requestId:'legacy-pair',maxCostUsd:3,args});
      const plan = JSON.parse(response.content[0].text);
      if (video.engine === 'veo') {
        const {instances:[wire]} = buildVeoBody(plan.args);
        assert.equal(wire.image.bytesBase64Encoded, first.toString('base64'));
        assert.equal(wire.lastFrame.bytesBase64Encoded, last.toString('base64'));
      } else {
        const wire = gateway ? buildGenaiVideoBody(plan.args) : buildLtxApiBody(plan.args).body;
        assert.equal(wire.image_uri, 'data:image/png;base64,' + first.toString('base64'));
        assert.equal(wire.last_frame_uri, 'data:image/png;base64,' + last.toString('base64'));
      }
    }
    if (video.engine === 'veo') {
      shot.visual.bg = 'first.png';
      f.board.PRODUCTION.modelSettings = {overrides:[{scope:'episode',request:'Use Veo text.',video:{...video,operation:'text'}}]};
      for (const end of ['last.png',undefined]) {
        shot.visual.video.lastImagePath = end;
        f.save();
        for (const scope of [{shotId:'s1'}, {sceneNo:1}])
          await assert.rejects(ROUTES.video_plan({episode:f.episode,...scope,requestId:'text-frames'}), /image_plan_unsupported/);
      }
    }
  }
  assert.ok(calls.some(url => url.endsWith('/v1/ltx/msr/capabilities')));
});

test('legacy subject paths feed the same Veo reference request for shots and scenes with or without fps', async t => {
  const f = fixture(t, {engine:'veo', model:'veo-3.1-generate-001', resolution:'720p'});
  const card = f.board.SCENES[0];
  card.scene = 1;
  card.duration = 8;
  card.visual = {video:{referenceImagePaths:['ref.png'], prompt:'The animal turns its head.'}};
  const direction = {emotion:'Calm.', action:'The animal turns its head.', openingPositions:[]};
  f.board.STRUCTURE = {scenes:[{no:1, videoDirection:direction}]};
  fs.writeFileSync(path.join(f.episode,'storyboard/ref.png'), png);
  for (const [scope, fps] of [[{shotId:'s1'}], [{sceneNo:1}], [{sceneNo:1}, 24]]) {
    direction.fps = fps;
    f.save();
    const response = await ROUTES.video_plan({episode:f.episode,...scope,requestId:'legacy-ref',maxCostUsd:4});
    const plan = JSON.parse(response.content[0].text);
    assert.equal(plan.tool, 'veo_reference');
    const {instances:[instance],parameters} = buildVeoBody(plan.args);
    assert.deepEqual(instance.referenceImages, [{ referenceType:'asset', image:{mimeType:'image/png', bytesBase64Encoded:png.toString('base64')} }]);
    assert.equal(parameters.durationSeconds, 8);
    assert.equal(instance.image, undefined);
    assert.equal(instance.lastFrame, undefined);
  }
  delete direction.fps;
  const guidance = ['Preserve the rabbit seal on the envelope.', 'Keep the red wax seal.', 'Do not copy the blue background.'];
  const legacyVisual = card.visual;
  card.visual = {frames:{mode:'reference'},references:[{id:'envelope',path:'ref.png',role:'prop',use:'video',
    purpose:guidance[0],preserve:[guidance[1]],avoid:[guidance[2]]}],video:{prompt:'The envelope opens.'}};
  for (const [scope, fps] of [[{shotId:'s1'}], [{sceneNo:1}], [{sceneNo:1},24]]) {
    direction.fps = fps;
    f.save();
    const response = await ROUTES.video_plan({episode:f.episode,...scope,requestId:'envelope',maxCostUsd:4});
    const plan = JSON.parse(response.content[0].text);
    const [instance] = buildVeoBody(plan.args).instances;
    assert.equal(instance.referenceImages[0].image.bytesBase64Encoded,png.toString('base64'));
    for (const words of guidance) assert.equal(instance.prompt.split(words).length - 1, 1, words);
    if (fps) assert.equal(plan.imageBindings[0].parameter, 'referenceImagePaths[0]');
  }
  card.visual = legacyVisual;
  delete direction.fps;
  f.board.SCENES[1].transition = 'dissolve';
  const structured = {frames:{mode:'reference'}, references:[{id:'animal', path:'ref.png', role:'character', use:'video', purpose:'The animal.'}], video:{prompt:card.visual.video.prompt}};
  for (const visual of [card.visual, structured]) {
    card.visual = visual;
    f.save();
    await assert.rejects(ROUTES.video_plan({episode:f.episode,shotId:'s1',requestId:'dissolve',maxCostUsd:4}), /video_duration_exceeded: s1 needs 8\.4s/);
  }
  delete f.board.SCENES[1].transition;
  const refs = ['characters/a/face.png','characters/b/face.png'];
  for (const ref of refs) {
    const file = path.join(f.episode,'storyboard',ref);
    fs.mkdirSync(path.dirname(file), {recursive:true});
    fs.writeFileSync(file, png);
  }
  card.visual = {video:{referenceImagePaths:refs, prompt:'The animal turns.'}};
  for (const [scope, fps] of [[{shotId:'s1'}], [{sceneNo:1},24]]) {
    direction.fps = fps;
    f.save();
    const call = ROUTES.video_plan({episode:f.episode,...scope,requestId:'different-subjects',maxCostUsd:4});
    if (scope.shotId) await assert.rejects(call, /same subject/);
    else {
      const refusal = await call;
      assert.equal(refusal.isError, true);
      const detail = JSON.parse(refusal.content[0].text);
      assert.equal(detail.executable, false);
      assert.ok(detail.missing.some(issue => issue.reason.includes('same subject')));
    }
  }
});

test('Veo matches submitted references to registered subjects across shots, timed scenes and raw arguments', async t => {
  const f = fixture(t, {engine:'veo',model:'veo-3.1-generate-001',resolution:'720p'});
  f.board.SB_DOC = {props:[{id:'clock',imageUrl:'clock.png',references:[{path:'clock-side.png'}]},
    {id:'phone',imageUrl:'phone.png'}]};
  const card = f.board.SCENES[0];
  Object.assign(card, {scene:1,duration:8});
  card.visual = {frames:{mode:'reference'},video:{prompt:'The clock ticks.'}};
  const direction = {emotion:'Calm.',action:'The clock ticks.',openingPositions:[]};
  f.board.STRUCTURE = {scenes:[{no:1,videoDirection:direction}]};
  const dir = path.join(f.episode,'storyboard');
  for (const file of ['clock.png','clock-side.png','phone.png']) fs.writeFileSync(path.join(dir,file),png);
  fs.symlinkSync('clock-side.png',path.join(dir,'side-alias.png'));
  const input = {episode:f.episode,requestId:'prop-identity',maxCostUsd:4};
  const refs = paths => paths.map((file,i) => ({id:'view-'+i,path:file,role:'prop',use:'video',purpose:'Match this view.'}));
  for (const [scope,fps] of [[{shotId:'s1'}],[{sceneNo:1},24]]) {
    direction.fps = fps;
    card.visual.references = refs(['clock.png','side-alias.png']);
    f.save();
    const ok = await ROUTES.video_plan({...input,...scope});
    const [instance] = buildVeoBody(JSON.parse(ok.content[0].text).args).instances;
    assert.equal(instance.referenceImages.length,2);
    card.visual.references = refs(['side-alias.png','phone.png']);
    f.save();
    await assert.rejects(ROUTES.video_plan({...input,...scope}), /same subject/);
  }
  delete direction.fps;
  card.visual = {video:{prompt:'Show the subject.'}};
  f.save();
  await assert.rejects(ROUTES.video_plan({...input,shotId:'s1',operation:'reference',
    args:{referenceImagePaths:['storyboard/clock.png','storyboard/phone.png']}}), /same subject/);
});

test('Google Cloud Veo uses saved settings, model-specific budgets, voice policy and polling recovery', async t => {
  const video = { engine: 'veo', model: 'veo-3.1-fast-generate-001', resolution: '720p', operation: 'text' };
  const f = fixture(t, video);
  f.board.FORMAT = 'shorts-9x16';
  f.save();
  const old = config.googleCloudProject;
  config.googleCloudProject = 'test-project';
  const plan = f.plan('veo-recover');
  assert.equal(plan.providerProject, 'test-project');
  assert.equal(plan.tool, 'veo_text2video');
  assert.equal(plan.args.aspectRatio, '9:16');
  assert.equal(plan.quote.reserveUsd, 0.8);
  assert.equal(f.plan('quiet', { generateAudio: false }).quote.reserveUsd, 0.64);
  f.board.SCENES[0].narration = [{ speaker:'hero', delivery:'off_screen', tts:'Hello' }];
  f.save();
  assert.throws(() => f.plan('spoken'), /voice_lane_required/);
  delete f.board.SCENES[0].narration;
  f.save();
  process.env.GOOGLE_OAUTH_ACCESS_TOKEN = 'fixture';
  t.after(() => { config.googleCloudProject = old; delete process.env.GOOGLE_OAUTH_ACCESS_TOKEN; });
  const id = 'projects/test-project/locations/us-central1/publishers/google/models/' + video.model + '/operations/abc';
  const { recordVideoSubmission } = await import('../dist/video-events.js');
  await f.execute(plan, async () => { recordVideoSubmission(id); return { isError:true, content:[{type:'text',text:'status connection lost'}] }; });
  let polls = 0;
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.ok(url.endsWith(':fetchPredictOperation')); assert.deepEqual(JSON.parse(init.body), { operationName:id }); polls++;
    return Response.json({ done:true, response:{ videos:[{ mimeType:'video/mp4',bytesBase64Encoded:'AAAAFGZ0eXBpc29tAAAAAGlzb20=' }] } });
  });
  const recovery = { episode:f.episode, requestId:plan.requestId, action:'refresh' };
  assert.equal((await videoStatus(recovery)).status, 'completed');
  assert.equal((await videoStatus(recovery)).status, 'completed'); assert.equal(polls, 1);
  assert.equal(fs.readFileSync(path.join(plan.args.outputPath, plan.args.filename)).toString('ascii', 4, 8), 'ftyp');
  assert.throws(() => settings.validateModels({video:{engine:'host',host:'grok',model:video.model}},true), /engine veo/);
});

test('registered hosted tools require episode context and video_execute dispatches one paid request', async t => {
  const model = 'veo-3.1-fast-generate-001';
  const f = fixture(t, { engine: 'veo', model, resolution: '720p', operation: 'text' });
  for (const name of ['veo_text2video', 'veo_img2video', 'veo_reference', 'veo_extend', 'ltx_api_img2video', 'ltx_api_audio2video'])
    await assert.rejects(ROUTES[name]({ outputPath: f.episode }), /video_context_required/);
  const previous = config.googleCloudProject;
  config.googleCloudProject = 'test-project';
  process.env.GOOGLE_OAUTH_ACCESS_TOKEN = 'fixture';
  t.after(() => { config.googleCloudProject = previous; delete process.env.GOOGLE_OAUTH_ACCESS_TOKEN; });
  const timer = globalThis.setTimeout;
  t.mock.method(globalThis, 'setTimeout', (fn, ms, ...args) => timer(fn, ms === 10000 ? 0 : ms, ...args));
  const calls = [];
  const operation = 'projects/test-project/locations/us-central1/publishers/google/models/' + model + '/operations/run';
  t.mock.method(globalThis, 'fetch', async (url) => {
    calls.push(url.split(':').at(-1));
    return Response.json(url.endsWith(':predictLongRunning') ? { name: operation } :
      { done: true, response: { videos: [{ mimeType: 'video/mp4', bytesBase64Encoded: 'AAAAFGZ0eXBpc29tAAAAAGlzb20=' }] } });
  });
  const plan = f.plan('public-route');
  const request = { episode: f.episode, planId: plan.id };
  config.googleCloudProject = 'changed-project';
  await assert.rejects(ROUTES.video_execute(request), /video_plan_stale/);
  config.googleCloudProject = 'test-project';
  const result = await ROUTES.video_execute(request);
  assert.ok(!result.isError);
  await ROUTES.video_execute(request);
  assert.deepEqual(calls, ['predictLongRunning', 'fetchPredictOperation']);
  assert.equal(f.state().jobs['public-route'].status, 'completed');
});

test('managed video plans can resume an active snapshot after a workspace Veo preview retires', t => {
  const f = fixture(t, { engine: 'veo', model: 'veo-3.1-fast-generate-001', resolution: '720p', operation: 'text' });
  const { file, config: saved } = settings.readSettings(f.root);
  saved.models.video.model = 'veo-3.1-fast-generate-preview';
  fs.writeFileSync(file, JSON.stringify(saved));
  assert.equal(f.plan('resumed').args.model, 'veo-3.1-fast-generate-001');
  delete saved.workspace;
  fs.writeFileSync(file, JSON.stringify(saved));
  assert.throws(() => f.plan('missing-workspace'), /project_setup_required/);
});

test('the saved Flash model selects text, paired frames and asset references, and refreshes the existing provider ID', async t => {
 const model='dreamina-seedance-2-5-flash-261115', f=fixture(t,{engine:'seedance',model,resolution:'720p'});
 const card=f.board.SCENES[0], dir=path.join(f.episode,'storyboard');
 const plan=(id,args={})=>planVideo({episode:f.episode,shotId:'s1',requestId:id,args:{prompt:'The umbrella opens.',...args}});
 assert.throws(()=>settings.validateModels({video:{engine:'seedance',model,resolution:'1080p'}},true),/resolution/);
 assert.throws(()=>settings.validateModels({video:{engine:'seedance',model,operation:'audio'}},true),/operation/);
 f.board.FORMAT='shorts-9x16'; f.save();
 const first=plan('flash-text');
 assert.equal(first.args.generateAudio, false);
 card.sound = {audioSource:'video', effects:[{delivery:'native'}]}; f.save();
 assert.equal(plan('flash-effects').args.generateAudio, true);
 delete card.sound;
 assert.equal(first.tool,'seedance_text2video'); assert.equal(first.args.model,model); assert.equal(first.args.ratio,'9:16');
 for (const file of ['open.png','close.png']) fs.writeFileSync(path.join(dir,file),png);
 card.visual.frames={mode:'first_last',start:'open.png',end:'close.png',reason:'Keep both states.',endState:'Open umbrella.'}; f.save();
 const image=plan('flash-image');
 assert.equal(image.tool,'seedance_img2video'); assert.equal(image.args.lastImagePath,path.join(dir,'close.png')); assert.equal(image.args.ratio,'adaptive');
 card.visual.frames={mode:'reference'}; card.visual.references=[{id:'umbrella',role:'prop',use:'video',path:'open.png',purpose:'Match the umbrella.'}]; f.save();
 const reference=plan('flash-reference'); assert.equal(reference.tool,'seedance_reference');
 assert.deepEqual(reference.args.referenceImagePaths,[path.join(dir,'open.png')]);
 const pending=await f.execute(reference,async()=>{recordVideoSubmission('cgt-test');return {isError:true,content:[{type:'text',text:'poll interrupted'}]};});
 assert.equal(pending.isError,true);
 const fetch=globalThis.fetch, methods=[]; t.after(()=>{globalThis.fetch=fetch;});
 const bytes = writeTinyMp4(dir, 'fixture.mp4');
 const bodies = [Buffer.from('<html>upstream error</html>'), bytes.subarray(0, Math.floor(bytes.length * .8)), bytes];
 globalThis.fetch = async (url, init) => {
   methods.push(init.method || 'GET');
   return url.endsWith('/cgt-test')
     ? Response.json({status:'succeeded',content:{video_url:'https://example.org/recovered'},usage:{completion_tokens:100000}})
     : new Response(bodies.shift());
 };
 const refresh = () => videoStatus({episode:f.episode,requestId:'flash-reference',action:'refresh'});
 const target = path.join(reference.args.outputPath, reference.args.filename);
 for (let i = 0; i < 2; i++) {
   const invalid = await refresh();
   assert.equal(invalid.status, 'submission_unknown');
   assert.equal(invalid.settledUsd, .7);
   assert.equal(fs.existsSync(target), false);
 }
 const recovered = await refresh();
 assert.equal(recovered.status,'completed'); assert.equal(recovered.tokens,100000); assert.equal(recovered.settledUsd,.7);
 assert.equal((await refresh()).status,'completed');
 assert.deepEqual(methods,Array(6).fill('GET'));
 fs.unlinkSync(target); bodies.push(bytes);
 await assert.rejects(f.execute(reference, () => assert.fail('duplicate POST')), /video_output_unverified/);
 assert.equal((await refresh()).status,'completed');
 assert.deepEqual(fs.readFileSync(target),bytes);
 assert.deepEqual(methods,Array(8).fill('GET'));
});

test('an authored Flash edit keeps its video input, charges actual usage and rejects short footage', async t => {
  const model = 'dreamina-seedance-2-5-flash-261115';
  const f = fixture(t, {engine:'seedance', model, resolution:'720p'}, {maxUsd:100});
  const card = f.board.SCENES[0];
  Object.assign(card.visual.video, {
    omniReferenceTaskType:'edit', referenceVideoUrls:['https://example.org/original.mp4']
  });
  f.save();
  const plan = planVideo({episode:f.episode, shotId:'s1', requestId:'short-edit',
    args:{prompt:'In @Video 1 keep the umbrella open.', requiredSeconds:5}});
  assert.equal(plan.tool, 'seedance_reference');
  assert.equal(plan.args.durationSeconds, -1);
  assert.deepEqual(plan.args.referenceVideoUrls, card.visual.video.referenceVideoUrls);
  const result = await f.execute(plan, async (_tool, args) => {
    recordVideoSubmission('cgt-edit');
    recordVideoTokens(100000);
    writeTinyMp4(args.outputPath, args.filename);
    return {content:[{type:'text',text:'Provider finished'}]};
  });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /needs 5s/);
  const job = f.state().jobs['short-edit'];
  assert.equal(job.status, 'failed');
  assert.equal(job.settledUsd, .43);
  assert.ok(fs.existsSync(path.join(plan.args.outputPath, plan.args.filename)));
  await assert.rejects(f.execute(plan, () => assert.fail('duplicate submission')), /video_request_failed/);
});

test('approved Seedance media, task type and audio changes invalidate both approval and dispatch', async t => {
  const f = fixture(t, {engine:'seedance',model:'dreamina-seedance-2-5-flash-261115',resolution:'720p'});
  const slot = f.board.SCENES[0].visual.video;
  const original = {referenceVideoUrls:['asset://original'], omniReferenceTaskType:'extend', generateAudio:false};
  Object.assign(slot, original); f.save();
  const plan = planVideo({episode:f.episode,shotId:'s1',requestId:'approved',args:{prompt:'Extend @Video 1 as the leaves fall.'}});
  assert.equal(plan.sourceArgs.referenceVideoUrls, undefined);
  approveVideo({episode:f.episode,planIds:[plan.id],request:'Use the original clip'});
  for (const change of [{referenceVideoUrls:['asset://other']},{referenceVideoUrls:undefined},{omniReferenceTaskType:'edit'},{generateAudio:true}]) {
    Object.assign(slot, original, change); f.save();
    assert.throws(() => approveVideo({episode:f.episode,planIds:[plan.id],request:'Old approval'}), /video_plan_stale/);
    await assert.rejects(f.execute(plan, () => assert.fail('stale paid call')), /video_plan_stale/);
  }
});

test('Seedance moderation releases the budget on normal polling and recovery', async t => {
  const f = fixture(t, selection, {maxUsd:1.2,maxAttempts:3});
  const timer = globalThis.setTimeout;
  t.mock.method(globalThis, 'setTimeout', (fn, ms, ...args) => timer(fn, ms === 10000 ? 0 : ms, ...args));
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push(init.method || 'GET');
    return Response.json(init.method === 'POST' ? { id:'cgt-normal' } : {status:'failed',error:{message:'moderation'}});
  });
  const first = f.plan('normal');
  assert.ok(first.quote.reserveUsd * 2 > 1.2);
  await ROUTES.video_execute({episode:f.episode,planId:first.id});
  assert.equal(f.state().jobs.normal.settledUsd, 0);
  const second = f.plan('interrupted');
  await f.execute(second, () => {
    recordVideoSubmission('cgt-interrupted');
    return {isError:true,content:[{type:'text',text:'poll interrupted'}]};
  });
  assert.equal(f.state().jobs.interrupted.settledUsd, undefined);
  const job = await videoStatus({episode:f.episode,requestId:'interrupted',action:'refresh'});
  assert.equal(job.status,'failed'); assert.equal(job.settledUsd,0);
  await ROUTES.video_execute({episode:f.episode,planId:f.plan('next').id});
  assert.deepEqual(calls,['POST','GET','GET','POST','GET']);
});

test('Seedance quotes, plans and dispatches the authored model and prompt on every video slot', async t => {
  const {scenePlan} = require('../../skills/produce/references/seedance-route.js');
  const flash = 'dreamina-seedance-2-5-flash-261115';
  for (const type of ['points', 'broll', 'quote']) {
    const f = fixture(t, selection, {maxUsd:100, maxAttempts:5});
    const slot = {engine:'seedance',model:flash,resolution:'720p',omniReferenceTaskType:'extend',
      referenceVideoUrls:['asset://source'],prompt:'Extend @Video 1 with a blue light.'};
    const card = {id:'s1',type,duration:5,summary:'The actor walks home.',visual:type === 'broll' ? slot : type === 'quote' ? {clip:slot} : {video:slot}};
    f.board.SCENES = [card]; f.save();
    const quote = scenePlan(card, {modelSettings:{models:{video:selection}}});
    const planned = planVideo({episode:f.episode,shotId:'s1',requestId:'authored'});
    assert.equal(quote.model,flash); assert.equal(planned.args.model,quote.model);
    assert.equal(planned.args.prompt,slot.prompt);
    await f.execute(planned, (tool, args) => {
      assert.equal(tool,quote.tool); assert.equal(args.model,flash);
      assert.deepEqual(args.referenceVideoUrls,['asset://source']); return result;
    });
    card.scene=1;
    if (type === 'quote') { card.visual.frames={mode:'reference'}; card.visual.references=[]; }
    f.board.STRUCTURE={scenes:[{no:1,videoDirection:{openingPositions:[],emotion:'A calm walk home.'}}]};
    for (const fps of [undefined,24]) {
      f.board.STRUCTURE.scenes[0].videoDirection.fps=fps;
      for (const task of ['edit','extend']) {
        slot.omniReferenceTaskType=task;
        slot.prompt = task === 'edit' ? 'Edit @Video 1 to turn the jacket blue.' : 'Extend @Video 1 until the jacket catches the light.';
        f.save();
        const plan=planVideo({episode:f.episode,sceneNo:1,requestId:'scene-'+task+(fps||'legacy')});
        assert.equal(plan.args.model,flash); assert.equal(plan.tool,'seedance_reference');
        assert.ok(plan.args.prompt.includes(slot.prompt));
        assert.ok(plan.args.prompt.includes('A calm walk home.'));
        assert.equal(plan.args.omniReferenceTaskType,task);
        assert.equal(plan.args.durationSeconds,task==='edit' ? -1 : 5);
        assert.deepEqual(plan.args.referenceVideoUrls,['asset://source']);
        approveVideo({episode:f.episode,planIds:[plan.id],request:'Same scene'});
        await f.execute(plan, (tool,args) => {
          assert.equal(tool,'seedance_reference'); assert.ok(args.prompt.includes(slot.prompt));
          assert.ok(args.prompt.includes('A calm walk home.')); assert.deepEqual(args.referenceVideoUrls,['asset://source']);
          writeTinyMp4(args.outputPath,args.filename,5); return result;
        });
        slot.referenceVideoUrls=['asset://changed']; f.save();
        await assert.rejects(f.execute(plan, () => assert.fail('stale scene')), /video_plan_stale/);
        slot.referenceVideoUrls=['asset://source'];
      }
      delete slot.referenceVideoUrls;
      delete slot.omniReferenceTaskType;
      slot.referenceAudioPaths=['voice.wav']; slot.generateAudio=true;
      fs.writeFileSync(path.join(f.episode,'storyboard','voice.wav'),'planning fixture');
      f.save();
      const voice=planVideo({episode:f.episode,sceneNo:1,requestId:'voice'+(fps||'legacy')});
      assert.deepEqual(voice.args.referenceAudioPaths,[path.join(f.episode,'storyboard','voice.wav')]);
      assert.equal(voice.args.generateAudio,true);
      delete slot.referenceAudioPaths; slot.referenceVideoUrls=['asset://source']; delete slot.generateAudio;
    }
  }
});

test('Seedance submits only named video references in shot, legacy scene and timed scene requests', async t => {
  for (const use of [undefined,'image','both']) {
    const f=fixture(t,{engine:'seedance',model:'dreamina-seedance-2-5-flash-261115',resolution:'720p'},{maxUsd:100});
    const dir=path.join(f.episode,'storyboard');
    for (const name of ['prop.png','open.png']) fs.writeFileSync(path.join(dir,name),png);
    const card=f.board.SCENES[0];
    card.duration=5;
    card.visual.frames={mode:'reference',start:'open.png'};
    card.visual.references=[{id:'prop',use:'video',role:'prop',path:'prop.png',purpose:'Keep the red umbrella.'}];
    if (use) card.visual.references.push({id:'display',use,role:'composition',path:'open.png',purpose:'The opening composition.'});
    card.visual.video.prompt='Follow the red umbrella.';
    const expected=(use==='both'?['prop.png','open.png']:['prop.png']).map(name=>path.join(dir,name));
    for (const route of ['shot','legacy','timed']) {
      if (route!=='shot') {
        card.scene=1;
        f.board.STRUCTURE={scenes:[{no:1,videoDirection:{openingPositions:[],emotion:'A calm walk.',...(route==='timed'?{fps:24}:{})}}]};
      }
      f.save();
      const plan=planVideo({episode:f.episode,...(route==='shot'?{shotId:'s1'}:{sceneNo:1}),requestId:route});
      await f.execute(plan, (tool,args)=>{
        assert.equal(tool,'seedance_reference');
        assert.deepEqual(args.referenceImagePaths,expected);
        return result;
      });
    }
  }
});

test('a blocked ModelArk portrait releases the reservation so the same approved plan can execute', async t => {
  const f = fixture(t, selection, {maxAttempts:1, maxConcurrent:1});
  const plan = f.plan();
  const detail = {code:'modelark_asset_entitlement_required', stage:'modelark_portrait', providerCode:'SubscriptionRequired', videoSubmitted:false};
  const blocked = await f.execute(plan, async () => ({isError:true, terminal:true, structuredContent:detail, content:[{type:'text',text:JSON.stringify(detail)}]}));
  assert.deepEqual(blocked.structuredContent,detail);
  assert.deepEqual(f.state().jobs,{});
  let calls=0;
  await f.execute(plan,async()=>{calls++;recordVideoSubmission('cgt-after-activation');return result;});
  assert.equal(calls,1);
  assert.equal(f.state().jobs.a.providerId,'cgt-after-activation');
});

test('the same character contract selects the camera-facing panel and binds the actor voice on each route', async t => {
  const cases = [
    {engine:'seedance', model:'dreamina-seedance-2-0-260128', resolution:'480p'},
    {engine:'astra-genai', model:'ltx-2.5-22b-distilled', resolution:'576x1024', operation:'reference'},
    {engine:'veo', model:'veo-3.1-generate-001', resolution:'720p'},
  ];
  const key = config.astraGenaiApiKey;
  config.astraGenaiApiKey = 'fixture';
  t.after(() => { config.astraGenaiApiKey = key; });
  t.mock.method(globalThis, 'fetch', async () => Response.json({voice_references:true}));
  await refreshGenaiMsrVoice(true);
  for (const video of cases) {
    const f = fixture(t, video);
    const board = path.join(f.episode, 'storyboard'), folder = path.join(f.root,'assets/characters/hero');
    fs.mkdirSync(folder, {recursive:true});
    const panels = {};
    for (const view of ['face','front','back']) {
      fs.writeFileSync(path.join(folder, view+'.png'), png);
      panels[view] = {file:view+'.png',view,purpose:'character_reference'};
    }
    fs.writeFileSync(path.join(folder,'panels.json'), JSON.stringify({panels}));
    const tts = {engine:'gemini',voiceId:'Kore',language:'ko',speed:1};
    const wav = path.join(board, 'speaker.wav');
    execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','sine=440:duration=2','-ar','16000',wav]);
    const {createHash} = await import('node:crypto');
    const sha256 = createHash('sha256').update(fs.readFileSync(wav)).digest('hex');
    f.board.SB_DOC = {characters:[{id:'hero',tts,voiceReference:{path:wav,tts,sha256}}]};
    const card = f.board.SCENES[0];
    card.visual.character = 'hero';
    card.visual.frames = {mode:'reference'};
    card.visual.video.prompt = 'A person waves from a doorway.';
    card.visual.video.openingPositions = [{character:'hero',images:[1,2],position:'standing in the doorway'}];
    card.narration = [{id:'spoken',speaker:'hero',delivery:'on_screen',tts:'문 앞이야.'}];
    const plan = () => planVideo({episode:f.episode,shotId:'s1',requestId:'cast',maxCostUsd:4}, false);
    for (const [mode,bodyView] of [['front','front'], ['rear','back']]) {
      card.visual.camera = {view:{mode,subjectId:'hero',subjectType:'person'}};
      f.save();
      if (video.engine === 'veo') {
        assert.throws(plan, /voice_lane_required/);
        card.narration = [];
        f.save();
      }
      const p = plan();
      assert.equal(p.characterInputs[0].bodyView, bodyView);
      assert.deepEqual(p.imageBindings.filter(ref => ref.submitted).map(ref => path.basename(ref.path)), ['face.png',bodyView+'.png']);
      if (video.engine === 'astra-genai') assert.equal(p.args.references[0].audioPath, wav);
      if (video.engine === 'seedance') assert.deepEqual(p.args.referenceAudioPaths, [wav]);
      if (video.engine !== 'veo') {
        assert.equal(p.voiceContinuity.speakers[0].reference.sha256, sha256);
        assert.match(p.args.prompt, /문 앞이야/);
      }
      card.narration = [{id:'spoken',speaker:'hero',delivery:'on_screen',tts:'문 앞이야.'}];
    }
    if (video.engine === 'seedance') {
      fs.writeFileSync(path.join(board,'bag.png'),png);
      card.visual.references = [
        {id:'prop',path:'bag.png',role:'prop',use:'video',purpose:'A green bag.'},
        {id:'portrait',path:path.join(folder,'face.png'),role:'character',use:'both',purpose:'Preserve the scar.'},
      ];
      card.visual.video.realFaceInput = true;
      card.visual.video.prompt = 'Image 1 is the green bag. Image 2 is the face.';
      f.save();
      const ordered = plan();
      assert.deepEqual(ordered.args.referenceImagePaths.map(file=>path.basename(file)), ['bag.png','face.png','back.png']);
      assert.deepEqual(ordered.imageBindings.map(r=>r.id), ['prop','portrait','s1-hero-back']);
      assert.match(ordered.args.prompt,/Preserve the scar/);
      assert.throws(() => planVideo({episode:f.episode,shotId:'s1',requestId:'bypass',args:{realFaceInput:false}}), /character_inputs_mismatch/);
      delete f.board.SB_DOC.characters[0].voiceReference;
      f.save();
      assert.throws(plan, /character_voice_required/);
    }
  }
});

test('Seedance original face IDs are checked on the account before saving a plan and never persist a signed URL', async t => {
  const f = fixture(t, {engine:'seedance',model:'dreamina-seedance-2-0-260128',resolution:'480p'});
  const board = path.join(f.episode,'storyboard'), sheet = path.join(f.root,'assets/characters/hero');
  fs.mkdirSync(sheet,{recursive:true});
  fs.writeFileSync(path.join(sheet,'body.png'),png);
  fs.writeFileSync(path.join(sheet,'panels.json'),JSON.stringify({panels:{front:{file:'body.png'}}}));
  const card = f.board.SCENES[0];
  card.visual = {character:'hero', frames:{mode:'reference'}, video:{prompt:'A full-length dancer taps one shoe.'},
    characterInputs:[{character:'hero',bodyView:'front',faceTaskId:'cgt-original'}]};
  f.save();
  const model = 'dreamina-seedance-2-0-260128', original = 'https://example.org/file?signature=private';
  const task = {id:'cgt-original',model,status:'succeeded',duration:4,created_at:Math.floor(Date.now()/1000),content:{video_url:original}};
  let remote = task;
  const calls = [];
  t.mock.method(globalThis,'fetch',async (url, options) => {
    assert.ok(url.endsWith('/cgt-original')); assert.ok(options.headers.Authorization);
    calls.push(options.method ?? 'GET');
    return Response.json(remote, {status:remote.status === 'missing' ? 404 : 200});
  });
  const {planManagedVideo} = await import('../dist/video-routing.js');
  const args = {episode:f.episode,shotId:'s1',requestId:'trusted',args:{durationSeconds:4}};
  for (const bad of [{status:'running'}, {id:'other'}, {created_at:0}, {status:'missing'}, {duration:90}]) {
    remote = {...task,...bad};
    await assert.rejects(planManagedVideo(args), /seedance_original_|different task ID|404/);
  }
  remote = task;
  const p = await planManagedVideo(args);
  assert.deepEqual(p.args.referenceVideoTaskIds,[task.id]);
  assert.ok(p.quote.tokenRate > 0);
  assert.match(p.args.prompt,/Video 1 only for hero/);
  assert.ok(!JSON.stringify(p).includes(original));
  assert.deepEqual(calls,Array(6).fill('GET'));
  assert.ok(fs.existsSync(path.join(board,'scenes.js')));
  remote = {...task,status:'missing'};
  const blocked = await ROUTES.video_execute({episode:f.episode,planId:p.id});
  assert.equal(blocked.structuredContent.stage,'seedance_original_lookup');
  assert.equal(blocked.structuredContent.videoSubmitted,false);
  assert.deepEqual(f.state().jobs,{});
  const again = await ROUTES.video_execute({episode:f.episode,planId:p.id});
  assert.equal(again.structuredContent.videoSubmitted,false);
  assert.deepEqual(calls,Array(8).fill('GET'));
});
