import { setupProject, png } from './workflow-fixture.mjs';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { planManagedVideo, planVideo, executeVideo, routeLegacyVideo, routingContext, approveVideo, readShotVideoTiming, videoStatus } from '../dist/video-routing.js';
import { buildLtxApiBody } from '../dist/ltx-api-video.js';
import { generateWithReferences, seedanceReferenceSchema } from '../dist/seedance-client.js';
import { buildVeoBody } from '../dist/veo-video.js';
import { buildGenaiVideoBody, buildGenaiMsrBody, genaiMsrSchema } from '../dist/astra-genai-video.js';
import { openingPrompt, sceneCastProse } from '../dist/msr-opening.js';
import { VIDEO_ADAPTERS, videoCatalog, speechVideoCapabilities } from '../dist/video-registry.js';
import { videoTransaction } from '../dist/video-state.js';
import { recordVideoSubmission, recordVideoTokens } from '../dist/video-events.js';
import { manageSpeech } from '../dist/speech.js';
import { config } from '../dist/config.js';
import { refreshGenaiMsrVoice } from '../dist/astra-genai-video.js';
import { dispatchVideo, ROUTES } from '../dist/handlers.js';
import { TOOLS } from '../dist/tools.js';
const require = createRequire(import.meta.url);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
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
 fs.writeFileSync(path.join(episode,'storyboard/opening.png'),png);
 const board = {PRODUCTION:{videoAuthorization:{reference:'Explicit fixture spending instruction',maxUsd:10,maxConcurrent:3,maxAttempts:3,...auth}},
   SCENES:['s1','s2'].map(id=>({id,visual:{frames:{mode:'first',start:'opening.png'},video:{...video,prompt:'A boat crosses a lake.'}}}))};
 const save = () => {
   for (const [index, card] of board.SCENES.entries()) card.scene ??= index + 1;
   board.STRUCTURE ??= {scenes:[{no:1},{no:2}]};
   fs.writeFileSync(path.join(episode,'storyboard/scenes.js'),Object.entries(board).map(([k,v])=>'window.'+k+'='+JSON.stringify(v)+';').join('\n'));
 };
 save();
 const old=config.arkApiKey; config.arkApiKey='fixture'; t.after(()=>{config.arkApiKey=old;});
 const plan = (requestId='a',args={},shotId='s1')=>planVideo({episode,sceneNo:board.SCENES.find(card=>card.id===shotId).scene,requestId,operation:'image',args:{durationSeconds:8,...args}});
 const execute = (p,dispatch)=>executeVideo({episode,planId:p.id},dispatch);
 const state=()=>JSON.parse(fs.readFileSync(path.join(episode,'.work/video-routing/state.json')));
 return {root,episode,board,save,plan,execute,state};
}

function singleSpeakerScene(f, seconds, trackSeconds = seconds) {
 const dir = path.join(f.episode, 'storyboard');
 const audio = path.join(dir, 'dialogue.wav');
 execFileSync('ffmpeg', ['-y','-v','error','-f','lavfi','-i','sine=duration='+trackSeconds,'-ar','48000',audio]);
 const shot = f.board.SCENES[0];
 Object.assign(shot, {duration:seconds, narration:[{id:'line',speaker:'hero',delivery:'on_screen',tts:'Hello'}]});
 f.board.STRUCTURE.scenes[0] = {no:1,speakers:['hero'],frames:{start:'opening.png'},videoDirection:{
   emotion:'Relief.',openingPositions:[{character:'hero',images:[],position:'By the desk.'}],audio:{path:'dialogue.wav',cues:[]}}};
 f.board.SB_DOC = {characters:[{id:'hero',name:'Hero',tts:{engine:'gemini',voiceId:'Kore',language:'en',speed:1}}]};
 f.save();
 return audio;
}

async function pinnedSpeakerScene(t, operation, ids = ['hero','guest'], video = {engine:'astra-genai',model:'ltx-2.5-22b-distilled',resolution:'576x1024'}, frames = [57,56], sampleSeconds = 1) {
 const f = fixture(t,{...video,...(operation?{operation}:{})});
 const dir = path.join(f.episode,'storyboard');
 const actors = ids.map((id,i) => {
   const tts = {engine:'gemini',voiceId:i?'Orus':'Kore',language:'en',speed:1};
   const face = id+'.png', wav = id+'.wav';
   execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color='+ ['blue','red','green'][i] +':s=32x32','-frames:v','1',path.join(dir,face)]);
   execFileSync('ffmpeg',['-v','error','-f','lavfi','-i',`sine=frequency=${400+200*i}:duration=${sampleSeconds}`,path.join(dir,wav)]);
   return {id,tts,panels:{face},voiceReference:{path:wav,tts,sha256:digest(fs.readFileSync(path.join(dir,wav))),imagePaths:[face]}};
 });
 f.board.SB_DOC = {characters:actors};
 f.board.STRUCTURE = {scenes:[{no:1,speakers:actors.map(a=>a.id),frames:{start:'opening.png'},
   speakerReferences:actors.map(a=>({character:a.id,path:a.panels.face})),videoDirection:{emotion:'Relief.',
   openingPositions:actors.map((a,i)=>({character:a.id,images:[i+1],position:i?'By the left door.':'By the right lamp.'}))}}]};
 f.board.SCENES = actors.map((actor,i) => ({id:'s'+(i+1),scene:1,duration:(frames[i] ?? 56)/24,shot:{size:'ms',angle:'eye'},
   visual:{action:i?'The guest looks up.':'The host greets the visitor.'},
   narration:[{id:'line-'+i,speaker:actor.id,delivery:'on_screen',tts:['You came.','I stayed.','Wait for me.'][i]}]}));
 f.save();
 const key = config.astraGenaiApiKey;
 config.astraGenaiApiKey = 'fixture';
 t.after(()=>{config.astraGenaiApiKey=key;});
 t.mock.method(globalThis,'fetch',async (url,options)=>{
   assert.equal(options.method,'GET');
   if (String(url).endsWith('/v1/models'))
     return Response.json({data:[{id:'ltx-2.5-22b-distilled',parameters_by_mode:{image2video:['num_frames']}}]});
   assert.ok(String(url).endsWith('/msr/capabilities'));
   return Response.json({msr:true,voice_references:true,image_conditioning:true});
 });
 await refreshGenaiMsrVoice(true);
 return f;
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
test('two pinned voices reach the scene once and a later dialogue or voice edit invalidates approval',async t=>{
 const f = await pinnedSpeakerScene(t);
 const make = id => planVideo({episode:f.episode,sceneNo:1,requestId:id,args:{reserveUsd:0}});
 const p = make('dialogue');
 assert.deepEqual(p.voiceContinuity.speakers.map(s=>[s.speaker,s.audioIndex]),[['hero',1],['guest',2]]);
 for (const card of f.board.SCENES) assert.equal(p.args.prompt.split(card.narration[0].tts).length,2);
 const noCall = async()=>assert.fail('stale input reached dispatch');
 f.board.SCENES[0].narration[0].tts = 'New words';f.save();
 await assert.rejects(f.execute(p,noCall),/video_plan_stale/);
 const next = make('next');
 fs.appendFileSync(path.join(f.episode,'storyboard/guest.wav'),'changed');
 await assert.rejects(f.execute(next,noCall),/voice_reference_stale|video_plan_stale/);
});

test('standalone MSR uses the composed opening as its background and accepts the authored scene frame count',async t=>{
 const f=await pinnedSpeakerScene(t,'reference');
 const p=planVideo({episode:f.episode,sceneNo:1,requestId:'standalone',args:{reserveUsd:0}});
 assert.equal(p.tool,'astra_genai_msr');
 assert.equal(p.args.numFrames,113);
 const [first,second,background]=p.args.references;
 assert.deepEqual([path.basename(first.audioPath),path.basename(second.audioPath)],['hero.wav','guest.wav']);
 assert.equal(background.background,true);
 assert.equal(background.imagePath,path.join(f.episode,'storyboard/opening.png'));
});
test('one pinned speaker reaches distilled first-frame I2V with the voice on the subject',async t=>{
 const f=await pinnedSpeakerScene(t,'image',['hero']);
 const response=await ROUTES.video_plan({episode:f.episode,sceneNo:1,requestId:'solo',args:{reserveUsd:0}});
 const plan=JSON.parse(response.content[0].text);
 assert.equal(plan.tool,'astra_genai_img2video');
 assert.equal(plan.voiceContinuity.strategy,'reference_voice');
 assert.equal(plan.args.imageUri,'data:image/png;base64,'+png.toString('base64'));
 const body=buildGenaiVideoBody(plan.args);
 assert.equal(body.references.length,1);
 assert.match(body.references[0].audio_uri,/^data:audio\//);
 assert.match(body.prompt,/hero \(Image 1, Audio 1\): "You came\."/);
});

test('three speaking subjects exceed one distilled MSR render, including an uninterrupted take',async t=>{
 const f=await pinnedSpeakerScene(t,'reference',['hero','guest','friend']);
 const input={episode:f.episode,sceneNo:1,requestId:'three-voices',args:{reserveUsd:0}};
 const check=()=>planVideo(input);
 assert.throws(check,/scene_render_voice_limit:.*3 pinned voices.*accepts 2.*split/i);
 const [shot]=f.board.SCENES;
 shot.narration=f.board.SCENES.flatMap(card=>card.narration);
 shot.duration=169/24;
 f.board.SCENES=[shot];
 f.board.STRUCTURE.scenes[0].videoDirection.oneTake=true;
 f.save();
 assert.throws(check,/scene_render_voice_limit:.*3 pinned voices.*accepts 2.*one.take/i);
 assert.equal(fs.existsSync(path.join(f.episode,'.work/video-routing/plans')),false);
});
test('remuxing the same recording cannot authorize a second speaker',async t=>{
 const f = await pinnedSpeakerScene(t);
 const [first, second] = f.board.SB_DOC.characters;
 const voiceDir=path.join(f.episode,'storyboard');
 const secondFile = path.join(voiceDir,second.voiceReference.path);
 execFileSync('ffmpeg',['-y','-v','error','-i',path.join(voiceDir,first.voiceReference.path),
   '-c:a','copy','-metadata','title=Guest',secondFile]);
 second.voiceReference.sha256=digest(fs.readFileSync(secondFile));
 assert.notEqual(second.voiceReference.sha256,first.voiceReference.sha256);
 f.save();
 assert.throws(()=>planVideo({episode:f.episode,sceneNo:1,requestId:'shared',args:{reserveUsd:0}}),/scene_speech_references/);
 assert.ok(!fs.existsSync(path.join(f.episode,'.work/video-routing/plans')));
});

test('planning compiles camera direction and refuses a caller replacing the scene prompt', t => {
 const f=fixture(t);
 f.board.SCENES[0].visual={...f.board.SCENES[0].visual,video:{prompt:'Old camera wording.',promptSource:{action:'A boat crosses the lake.'}},camera:{movement:'dolly in',speed:'slow',target:'the boat'}};
 f.board.SCENES[0].shot={...f.board.SCENES[0].shot,techniques:[{id:'camera.dolly-in'}]};
 f.save();
 const before=planVideo({episode:f.episode,sceneNo:1,requestId:'direction-a',operation:'image',args:{generateAudio:false}});
 assert.match(before.args.prompt,/slowly pushes in toward the boat/);
 assert.throws(()=>f.plan('manual',{prompt:'A boat crosses a lake. Camera stays locked.'}),/scene_video_prompt/);
 // An authored prompt is sent in place of the planner's: the plan names it as the source and reports no reading of the prompt it replaces.
 const own=(requestId,args={})=>planVideo({episode:f.episode,sceneNo:1,requestId,operation:'image',args,prompt:'A boat sits still. The camera holds.'},false);
 const sent=own('own-a',{generateAudio:false});
 assert.ok(before.directionBindings.some(binding=>binding.via==='prompt'));
 assert.deepEqual([sent.sourcePrompt,sent.directionWarnings,sent.directionBindings.filter(binding=>binding.via==='prompt')],['A boat sits still. The camera holds.',[],[]]);
 delete f.board.SCENES[0].visual.video.promptSource;
 f.board.SCENES[0].visual.video.prompt='The camera pulls back.';
 f.save();
 const legacy=planVideo({episode:f.episode,sceneNo:1,requestId:'legacy',operation:'image'});
 assert.match(legacy.directionWarnings.join(),/camera_move_contradicted/);
 assert.ok(legacy.args.prompt.startsWith('The camera pulls back.'));
 assert.deepEqual(own('own-b').directionWarnings,[]);
 f.board.SCENES[0].visual.video.promptSource={action:'A boat crosses the lake.'};
 f.board.SCENES[0].visual.camera={movement:'static'}; f.save();
 const after=planVideo({episode:f.episode,sceneNo:1,requestId:'direction-b',operation:'image',args:{generateAudio:false}});
 assert.match(after.args.prompt,/holds a static frame/);
 assert.doesNotMatch(after.args.prompt,/Old camera|pushes in/);
 assert.equal(after.directionBindings.find(b=>b.attribute==='move').via,'prompt');
 assert.throws(()=>f.plan('raw-shots',{shots:[{description:'A different scene.'}]}),/scene_video_prompt/);
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
 assert.throws(()=>planVideo({episode:f.episode,sceneNo:1,requestId:'a',operation:'audio',args:{prompt:'x'}}),/scene_speech_route/);
 assert.throws(()=>planVideo({episode:f.episode,sceneNo:1,requestId:'a',operation:'image',args:{sourceImagePath:'missing.png'}}),/ENOENT/);
 assert.throws(()=>f.plan('a',{outputPath:os.tmpdir()}),/inside/);
 f.board.SCENES[0].visual.video.prompt='A boat crosses a lake. 배가 호수를 건넌다.';f.save();
 assert.throws(()=>f.plan('ko'),/video_prompt_language/);
 assert.throws(()=>f.plan('invented-dialogue',{prompt:'The rower says "건너자" and pushes off.'}),/scene_video_prompt/);
});
test('completed request is reused and altered request ID payload is rejected',async t=>{
 const f=fixture(t); let calls=0; const dispatch=async(_tool,args)=>{calls++;recordVideoSubmission('op-1');writeTinyMp4(args.outputPath,args.filename);return result;}; const p=f.plan();
 await f.execute(p,dispatch); await f.execute(p,dispatch); assert.equal(calls,1);
 assert.equal(f.state().jobs.a.providerId,'op-1'); assert.equal(f.state().jobs.a.status,'completed');
 await assert.rejects(f.execute(f.plan('a',{filename:'different.mp4'}),dispatch),/request_id_conflict/);
});
test('a shot video runs only after the user approves its plan or every shot; the plan sends the shot prompt',async t=>{
 const f=fixture(t); let calls=0; const dispatch=async()=>{calls++;return result;};
 approveVideo({episode:f.episode,auto:false,request:'Ask me before each shot'});
 f.board.SCENES[0].visual.video.prompt='A heron lands on the dock.';f.save();
 const p=planVideo({episode:f.episode,sceneNo:1,requestId:'a',operation:'image',args:{durationSeconds:8}});
 assert.ok(p.args.prompt.startsWith('A heron lands on the dock.'));
 await assert.rejects(f.execute(p,dispatch),/video_approval_required/);
 approveVideo({episode:f.episode,planIds:[p.id],request:'Shot 1 looks right'});
 const view=()=>JSON.parse(fs.readFileSync(path.join(f.episode,'storyboard/video-approvals.js'),'utf8').replace(/^window\.VIDEO_APPROVALS = |;\n$/g,''));
 assert.deepEqual(view().scenes[1],{planId:p.id,requestId:"a",at:JSON.parse(fs.readFileSync(path.join(f.episode,'.work/video-routing/approvals.json'))).plans[p.id].at,shown:{prompt:p.args.prompt,start:'opening.png',callPrompt:true,lines:[]}});
 await f.execute(p,dispatch); assert.equal(calls,1);
 // A plan with its own prompt is marked so; a plan whose shot changed before the yes takes none.
 approveVideo({episode:f.episode,planIds:[f.plan('c').id],request:'That prompt is fine'});
 assert.equal(view().scenes[1].shown.callPrompt,true);
 const stale=planVideo({episode:f.episode,sceneNo:1,requestId:'d',operation:'image',args:{durationSeconds:8}});
 f.board.SCENES[0].visual.video.prompt='A heron takes off.';f.save();
 assert.throws(()=>approveVideo({episode:f.episode,planIds:[stale.id],request:'Yes'}),/video_plan_stale/);
 const spoken=f.plan('e');f.board.SCENES[0].narration=[{speaker:'hero',delivery:'on_screen',tts:'Over here!'}];f.save();
 assert.throws(()=>approveVideo({episode:f.episode,planIds:[spoken.id],request:'Yes'}),/video_plan_stale/);delete f.board.SCENES[0].narration;f.save();
 await assert.rejects(f.execute(f.plan('b'),dispatch),/video_approval_required/);
 approveVideo({episode:f.episode,auto:true,request:'Make every shot without asking'});
 assert.equal(view().auto,JSON.parse(fs.readFileSync(path.join(f.episode,'.work/video-routing/approvals.json'))).auto.at);
 await f.execute(f.plan('b'),dispatch); assert.equal(calls,2);
});
function saveHistoricalPlan(episode,current,edit) {
 const directory=path.join(episode,'.work/video-routing/plans');
 const {id:currentId,...historical}=JSON.parse(fs.readFileSync(path.join(directory,current.id+'.json')));
 assert.equal(currentId,current.id);
 edit(historical);
 const serialized=JSON.stringify(historical,(_,value)=>value && typeof value==='object' && !Array.isArray(value)
   ? Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))) : value);
 const id=digest(serialized);
 fs.writeFileSync(path.join(directory,id+'.json'),JSON.stringify({...historical,id}));
 return id;
}
test('a signed historical plan without a speaker route cannot be approved or dispatched', async t => {
 const f=fixture(t), current=f.plan();
 const id=saveHistoricalPlan(f.episode,current,plan=>{delete plan.speechRoute;});
 assert.throws(()=>approveVideo({episode:f.episode,planIds:[id],request:'Approve the old plan'}),/video_plan_stale/);
 await assert.rejects(executeVideo({episode:f.episode,planId:id},()=>assert.fail('historical plan dispatched')),/video_plan_stale/);
 assert.equal(fs.existsSync(path.join(f.episode,'.work/video-routing/state.json')),false);
});
test('budget and attempts gate before dispatch and include prior successful reservations',async t=>{
 const f=fixture(t,selection,{maxUsd:1.5,maxAttempts:2});let calls=0;
 await f.execute(f.plan(),async()=>{calls++;return result;});
 await assert.rejects(f.execute(f.plan('b'),async()=>{calls++;return result;}),/budget/);assert.equal(calls,1);
 f.board.PRODUCTION.videoAuthorization.maxUsd=10;f.board.PRODUCTION.videoAuthorization.maxAttempts=1;f.save();
 await assert.rejects(f.execute(f.plan('c'),async()=>result),/attempt/);
});
test('off-screen-only Seedance dialogue keeps the supplied voice outside the picture', t => {
 const f=fixture(t,{...selection,operation:'reference'}), shot=f.board.SCENES[0];
 f.board.SB_DOC={characters:[{id:'hero',tts:{language:'en',voiceId:'Kore'}}]};
 Object.assign(shot,{duration:5,narration:[{speaker:'hero',delivery:'off_screen',tts:'Wait for me.'}]});
 f.board.STRUCTURE.scenes[0]={no:1,speakers:['hero'],frames:{start:'opening.png'},
   videoDirection:{openingPositions:[],emotion:'The listener hesitates.'}};
 f.save();
 const input={episode:f.episode,sceneNo:1,requestId:'offscreen'};
 const p=planVideo(input);
 assert.equal(p.tool,'seedance_img2video');
 assert.equal(p.voiceContinuity.strategy,'external_tts');
 assert.equal(p.args.referenceAudioPaths,undefined);
 assert.equal(p.args.sourceImagePath,path.join(f.episode,'storyboard/opening.png'));
 assert.doesNotMatch(p.args.prompt,/Wait for me/);
 assert.throws(()=>planVideo({...input,operation:'reference'}),/scene_speech_route/);
 f.board.STRUCTURE.scenes[0].videoDirection.audio={path:'caller.wav',mode:'conditioning',cues:[]};
 f.save();
 assert.throws(()=>planVideo(input),/scene_speech_route/);
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
  const scene=make({sceneNo:1,requestId:'lake-scene'}), shot=make({sceneNo:1,requestId:'second-scene-attempt'});
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
 const p=planVideo({episode:f.episode,sceneNo:1,requestId:'fit',operation:'image',args:{duration:5,reserveUsd:0}});
 assert.equal(p.tool,'astra_genai_img2video');
 assert.ok(p.args.prompt.length<=2000,String(p.args.prompt.length));
 assert.match(p.args.prompt,/The camera slowly pushes in toward the letter/);
 assert.match(p.args.prompt,/The hero reads the letter\..*No speech or vocalization/);
 assert.match(p.directionWarnings.join(),/prompt_fitted/);
});
test('distilled dialogue uses the two pinned voices and keeps each line in its own shot',async t=>{
 const f=await pinnedSpeakerScene(t);
 const p=planVideo({episode:f.episode,sceneNo:1,requestId:'msr-fit',args:{reserveUsd:0}});
 assert.equal(p.tool,'astra_genai_img2video');
 const [first,second]=p.args.prompt.split('Then cut directly.');
 assert.match(first,/hero \(Image 1, Audio 1\): "You came\."/);
 assert.match(second,/guest \(Image 2, Audio 2\): "I stayed\."/);
 assert.ok(p.args.prompt.length<=2000);
});

test('a flexible three-shot exchange approves the resolved MSR mode and keeps the returning voice', async t => {
 const f = await pinnedSpeakerScene(t);
 const cards = f.board.SCENES;
 cards.push({...structuredClone(cards[0]), id:'s3', narration:[{...cards[0].narration[0],id:'line-3',tts:'Found it.'}]});
 cards[0].referenceImage = 'opening.png';
 for (const card of cards.slice(1)) card.referenceImage = card.narration[0].speaker + '.png';
 f.save();
 const route='/v1/ltx/v2/scene-to-video', requests=[];
 const previous=globalThis.fetch;
 t.mock.method(globalThis,'fetch',async (url, opts) => {
   const path=new URL(url).pathname;
   if (path===route+'/capabilities') return Response.json({version:1,execution:'per_shot',transitions:['hard_cut'],execution_modes:['auto','single_msr','per_shot']});
   if (path==='/v1/uploads') return Response.json({upload_id:JSON.parse(opts.body).sha256.slice(0,32),chunk_size:1048576,chunks:1});
   if (opts.method==='PUT') return Response.json({});
   if (path.endsWith('/complete')) {
     const id=path.split('/').at(-2);
     return Response.json({file_id:id,uri:'genai-file://'+id});
   }
   if (path===route+'/validate') {
     const body=JSON.parse(opts.body);
     requests.push(body);
     return Response.json({schema_valid:true,model:body.model,shots:3,execution:'single_msr'});
   }
   return previous(url,opts);
 });
 const input={episode:f.episode,sceneNo:1,requestId:'three-turns',sceneRendering:'auto',maxCostUsd:0};
 const selected=await planManagedVideo(input);
 assert.equal(selected.sceneRendering,'single_msr');
 assert.equal(requests[0].execution,'auto');
 const lines=requests[0].shots.map(card=>card.dialogue[0]);
 assert.deepEqual(lines.map(line=>line.speaker),['hero','guest','hero']);
 assert.equal(lines[0].voice_uri,lines[2].voice_uri);
 assert.notEqual(lines[0].voice_uri,lines[1].voice_uri);
 for (const [i,card] of requests[0].shots.entries()) {
   const face=card.images.find(img=>img.role==='face' && img.character===lines[i].speaker);
   assert.ok(face?.image_uri.startsWith('genai-file://'));
 }
 const required=await planManagedVideo({...input,sceneRendering:'single_msr'});
 assert.equal(required.id,selected.id);
 assert.deepEqual(requests[1],{...requests[0],execution:'single_msr'});
 cards.forEach(card=>card.duration=10);
 f.save();
 const long=planVideo({...input,requestId:'long-exchange'},false);
 assert.equal(long.sceneRendering,'per_shot');
 assert.equal(long.sceneRequest.frameCount,720);
});

test('I2V reference capability refusals release managed budget and concurrency before any submission',async t=>{
 const {generateGenaiVideo}=await import('../dist/astra-genai-video.js');
 const f=fixture(t,{engine:'astra-genai',model:'ltx-2.5-22b-distilled',resolution:'1280x704',operation:'image'},{maxConcurrent:1});
 const oldFetch=globalThis.fetch,oldKey=config.astraGenaiApiKey;config.astraGenaiApiKey='fixture';
 t.after(()=>{globalThis.fetch=oldFetch;config.astraGenaiApiKey=oldKey;});
 fs.writeFileSync(path.join(f.episode,'image.png'),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=','base64'));
 f.board.SCENES[0].visual={frames:{mode:'first',start:'../image.png'},video:{prompt:'The hero walks.',openingPositions:[{character:'hero',images:[1],position:'seated on the right'}]},references:[{id:'dock',path:'../image.png',role:'prop',use:'video',purpose:'Preserve appearance'}]};
 f.save();let calls=0;
 for(const failure of ['unsupported','network','schema']){
  globalThis.fetch=async(url,options)=>{
   calls++;assert.ok(String(url).endsWith('/msr/capabilities'));assert.equal(options.method,'GET');
   if(failure==='network')throw new Error('Network unavailable');
   return Response.json({image_conditioning:failure==='unsupported'?false:'invalid'});
  };
  const p=planVideo({episode:f.episode,sceneNo:1,requestId:failure,operation:'image',args:{prompt:'The hero walks.',duration:5,reserveUsd:0.25}});
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
 process.env.SOCIAL_FLOW_TOOL_SEEDANCE_IMG2VIDEO='off';
 try { await assert.rejects(f.execute(p,dispatch),/disabled/); } finally {delete process.env.SOCIAL_FLOW_TOOL_SEEDANCE_IMG2VIDEO;}
 config.arkApiKey='';await assert.rejects(f.execute(p,dispatch),/unconfigured/);config.arkApiKey='fixture';
 f.board.PRODUCTION.videoAuthorization.maxUsd=9;f.save();await assert.rejects(f.execute(p,dispatch),/stale/);
 const image=path.join(f.episode,'storyboard/opening.png');
 const q=f.plan('i');
 execFileSync('ffmpeg',['-y','-v','error','-f','lavfi','-i','color=red:s=32x32','-frames:v','1',image]);await assert.rejects(f.execute(q,dispatch),/stale/);assert.equal(calls,0);
});
test('configured legacy route requires context and explicit mismatch cannot bypass it',async t=>{
 const f=fixture(t); let calls=0;const dispatch=async()=>{calls++;return result;};
 await assert.rejects(routeLegacyVideo('seedance_text2video',{prompt:'x',outputPath:f.episode},dispatch),/context_required/);
 await assert.rejects(routeLegacyVideo('astra_genai_text2video',{prompt:'x',videoContext:{episode:f.episode,sceneNo:1,requestId:'a'}},dispatch),/mismatch/);
 await assert.rejects(routeLegacyVideo('seedance_text2video',{prompt:'x',videoContext:{episode:f.episode,sceneNo:1,requestId:'a'}},dispatch),/scene_speech_route/);
 await routeLegacyVideo('seedance_img2video',{videoContext:{episode:f.episode,sceneNo:1,requestId:'a'}},dispatch);assert.equal(calls,1);
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
 await assert.rejects(ROUTES.astra_genai_text2video({prompt:'x',videoContext:{episode:f.episode,sceneNo:1,requestId:'a'}}),/mismatch/);
 for(const name of Object.keys(VIDEO_ADAPTERS)) assert.ok(TOOLS.find(t=>t.name===name)?.inputSchema.properties.videoContext,name);
 for(const name of ['video_catalog','video_plan','video_execute']) assert.ok(ROUTES[name]);
});
test('a host without a verifiable episode adapter cannot hand off the scene',t=>{
 const f=fixture(t,{engine:'host',model:'host-managed',host:'grok'});
 assert.throws(()=>f.plan(),/scene_speech_route/);
 assert.ok(!fs.existsSync(path.join(f.episode,'.work/video-routing/plans')));
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
 assert.throws(()=>planVideo({episode:f.episode,sceneNo:1,requestId:'m',tool:'seedance_text2video',operation:'image',args:{prompt:'x'}}),/disagree/);
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
 const {manageSpeech}=await import('../dist/speech.js');const f=fixture(t,{engine:'ltx-api',model:'ltx-2-5-pro',resolution:'1280x720'});
 singleSpeakerScene(f,4);
 assert.throws(()=>manageSpeech({path:path.join(f.episode,'storyboard'),action:'plan_video',shotId:'s1',capabilities:{provider:'ltx-api',model:'ltx-2-5-pro',audioConditioning:true,lipSync:true,postLipSync:false,evidence:'forged'}}),/disagree/);
});
test('speech preparation uses the finished performance on a model with audio conditioning',async t=>{
 const {manageSpeech}=await import('../dist/speech.js');
 const f=fixture(t,{engine:'astra-genai',model:'ltx-2.5-22b-dev',resolution:'1792x1024',operation:'image'});
 singleSpeakerScene(f,5);
 const plan=tool=>manageSpeech({path:path.join(f.episode,'storyboard'),action:'plan_video',shotId:'s1',tool}).plan;
 assert.equal(plan().mode,'audio_conditioned');
 assert.throws(()=>plan('astra_genai_msr'),/scene_speech_route/);
 assert.equal(plan('astra_genai_audio2video').mode,'audio_conditioned');
 assert.throws(()=>plan('seedance_text2video'),/model_selection_mismatch/);
 const allFalse={provider:'astra-genai',model:'ltx-2.5-22b-dev',audioConditioning:false,lipSync:false,postLipSync:false,evidence:'old caller'};
 assert.throws(()=>manageSpeech({path:path.join(f.episode,'storyboard'),action:'plan_video',shotId:'s1',capabilities:allFalse}),/disagree/);
});
test('a visual reference does not turn an off-screen-only scene into model dialogue', t => {
 const f=fixture(t,{engine:'astra-genai',model:'ltx-2.5-22b-distilled',operation:'image',resolution:'576x1024'});
 const shot=f.board.SCENES[0];
 shot.narration=[{id:'line',speaker:'caller',delivery:'off_screen',tts:'Wait for me.'}];
 shot.visual.references=[{id:'phone',role:'prop',use:'video',path:'phone.png'}];
 f.board.SB_DOC={characters:[{id:'caller',name:'Caller',tts:{engine:'gemini',voiceId:'Kore',language:'en',speed:1}}]};
 f.save();
 const {plan}=manageSpeech({path:path.join(f.episode,'storyboard'),action:'plan_video',shotId:shot.id});
 assert.equal(plan.mode,'voiceover');
 assert.equal(plan.audioFirst,true);
});
test('local LTX accepts an explicit image operation together with its multi-operation tool', t => {
 const f=fixture(t,{engine:'mlx',model:'LTX-2.3',resolution:'320x320'});
 const input={episode:f.episode,sceneNo:1,requestId:'local-opening',tool:'ltx_video_generate',operation:'image'};
 const plan=planVideo(input,false);
 assert.equal(plan.tool,input.tool);
 assert.ok(plan.imageBindings.some(image=>image.id==='start' && image.submitted));
});
test('FastH3 speech preparation uses the two-speaker reference capability on both shots', t => {
 const f=fixture(t,{engine:'mlx',model:'ddalcu/FastH3-Omni-MLX-Serve-8bit',operation:'reference'});
 const cast=['hero','guest'];
 f.board.SB_DOC={characters:cast.map(id=>({id,name:id,tts:{engine:'gemini',voiceId:'Kore',language:'en',speed:1}}))};
 f.board.SCENES.forEach((card,i)=>Object.assign(card,{scene:1,narration:[{id:'line'+i,speaker:cast[i],delivery:'on_screen',tts:'Ready.'}]}));
 f.save();
 for (const card of f.board.SCENES) {
   const speech=manageSpeech({path:path.join(f.episode,'storyboard'),action:'plan_video',shotId:card.id});
   assert.equal(speech.plan.mode,'native');
 }
});
test('A2V plans physical dialogue without certifying lips and checks the supplied clip covers the shot', async t => {
 const {manageSpeech}=await import('../dist/speech.js');
 for (const video of [
   {engine:'astra-genai',model:'ltx-2.5-22b-dev',resolution:'640x384'},
   {engine:'astra-genai-desktop',model:'ltx-2.5-fast',resolution:'270p'},
   {engine:'ltx-api',model:'ltx-2-5-pro',resolution:'1280x720'},
 ]) {
   const f=fixture(t,{...video,operation:'audio'});
   const track=singleSpeakerScene(f,8,3);
   const speech=manageSpeech({path:path.join(f.episode,'storyboard'),action:'plan_video',shotId:'s1'});
   assert.equal(speech.plan.mode,'audio_conditioned');
   assert.equal(speech.plan.capabilities.lipSync,false);
   const input={episode:f.episode,sceneNo:1,requestId:'short-track',args:video.engine==='ltx-api'?{}:{reserveUsd:0}};
   assert.throws(()=>planVideo(input),/scene_audio_timing/);
   execFileSync('ffmpeg',['-y','-v','error','-f','lavfi','-i','anullsrc=r=48000:cl=mono','-t','8',track]);
   assert.throws(()=>planVideo({...input,requestId:'silent-track'}),/scene_speech_audio/);
   assert.equal(fs.existsSync(path.join(f.episode,'.work/video-routing/plans')),false);
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
test('an episode retake cannot substitute for the required scene operation',t=>{
 const f=fixture(t,{engine:'astra',resolution:'64x64'});
 assert.throws(()=>planVideo({episode:f.episode,sceneNo:1,requestId:'retake',operation:'retake',args:{sourceVideoPath:'source.mp4',startTime:0,endTime:1}}),/scene_speech_route/);
});

test('managed ASTRA audio disables internal generations and never completes a hidden ambiguous child',async t=>{
 const f=fixture(t,{engine:'astra',resolution:'1024x1920'});
 const old=config.astraVideoApiKey;config.astraVideoApiKey='fixture';t.after(()=>config.astraVideoApiKey=old);
 singleSpeakerScene(f,49/24);
 const args={expectLipSync:true};
 assert.throws(()=>planVideo({episode:f.episode,sceneNo:1,requestId:'multi',operation:'audio',args:{...args,maxAttempts:2}}),/one submission/);
 const p=planVideo({episode:f.episode,sceneNo:1,requestId:'a',operation:'audio',args});
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
 const make=extra=>planVideo({episode:f.episode,sceneNo:1,requestId:'genai',operation:'image',args:{...args,...extra}});
 assert.throws(()=>make({reserveUsd:undefined}));
 const p=make();assert.equal(p.tool,'astra_genai_img2video');assert.equal(p.quote.reserveUsd,0.25);
 assert.equal(p.args.model,'ltx-2.5-22b-distilled');assert.equal(p.args.resolution,'1280x704');
 // A stale preset conversion must not replace the explicitly selected geometry.
 for (const [saved,v2] of [['1792x1024','1792x1024'],['1024x1792','1024x1792'],['1080x720','1080x720']]) {
  const g=fixture(t,{engine:'astra-genai',model:'ltx-2.5-22b-dev',resolution:saved});
  assert.equal(planVideo({episode:g.episode,sceneNo:1,requestId:'v2',operation:'image',args}).args.resolution,v2);
 }
 // Audio-to-video exists on GenAI but has no duration; its length comes from the audio.
 assert.throws(()=>planVideo({episode:f.episode,sceneNo:1,requestId:'speech',operation:'audio',args}),/scene_speech_route/);
 // A negative prompt in video_plan.args reaches the guided dev lanes and survives the replan; distilled has no negative pass.
 const dev=fixture(t,{engine:'astra-genai',model:'ltx-2.5-22b-dev',resolution:'1280x704'}),negativePrompt='has_subtitles, captions';
 for (const operation of ['image','audio']) {
  if (operation==='audio') singleSpeakerScene(dev,5);
  const n=planVideo({episode:dev.episode,sceneNo:1,requestId:'negative-'+operation,operation,
    args:{...(operation==='image'?args:{reserveUsd:.25}),negativePrompt}});
  assert.equal(n.args.negativePrompt,negativePrompt);
  const stored=JSON.parse(fs.readFileSync(path.join(dev.episode,'.work/video-routing/plans',n.id+'.json')));
  assert.equal(planVideo({episode:dev.episode,sceneNo:n.sceneNo,requestId:n.requestId,tool:n.tool,args:stored.sourceArgs}).id,n.id);
 }
 assert.throws(()=>make({negativePrompt}),/negativePrompt requires ltx-2.5-22b-dev/);
 let calls=0;
 await assert.rejects(f.execute(p,async (_tool,input)=>{
   calls++;recordVideoSubmission('recover-1');fs.mkdirSync(input.outputPath,{recursive:true});
   const file=path.join(input.outputPath,input.filename);fs.writeFileSync(file,'verified-adapter-result');
   fs.writeFileSync(file+'.astra-genai.json',JSON.stringify({version:1,baseUrl:astraGenaiBaseUrl(),operation:'image-to-video',fingerprint:'fixture',videoPath:file,jobId:'recover-1',status:'completed',sha256:createHash('sha256').update(fs.readFileSync(file)).digest('hex')}));
   throw new Error('caller interrupted');
 }),/interrupted/);
 assert.equal((await videoStatus({episode:f.episode,requestId:'genai',action:'refresh'})).status,'completed');
 await f.execute(p,async()=>assert.fail('must reuse recovered result'));assert.equal(calls,1);
});

test('the paired scene pins the opening and both samples, rejects a missing voice and reproduces the approved request', async t => {
 const f=await pinnedSpeakerScene(t);
 const input={episode:f.episode,sceneNo:1,requestId:'msr',args:{reserveUsd:.25}};
 const p=planVideo(input);
 assert.equal(p.tool,'astra_genai_img2video');
 assert.equal(p.args.resolution,'576x1024');
 assert.equal(p.args.imageUri,'data:image/png;base64,'+png.toString('base64'));
 assert.deepEqual(p.args.references.map(r=>path.basename(r.audioPath)),['hero.wav','guest.wav']);
 assert.ok(p.imageBindings.some(i=>i.id==='start' && i.submitted));
 assert.equal(p.quote.reserveUsd,.25);
 const stored=JSON.parse(fs.readFileSync(path.join(f.episode,'.work/video-routing/plans',p.id+'.json')));
 assert.equal(planVideo({...input,tool:p.tool,args:stored.sourceArgs}).id,p.id);
 delete f.board.SB_DOC.characters[1].voiceReference;f.save();
 assert.throws(()=>planVideo({...input,requestId:'missing-voice'}),/scene_speech_references/);
});

test('native gateway video settings select the Desktop adapter and preserve audio loss policy',t=>{
 const f=fixture(t,{engine:'astra-genai-desktop',model:'ltx-2.5-fast',resolution:'270p'});
 const audio=singleSpeakerScene(f,121/24);
 const shot=f.board.SCENES[0], scene=f.board.STRUCTURE.scenes[0];
 scene.speakers.push('guest');
 scene.videoDirection.openingPositions.push({character:'guest',images:[],position:'Across the desk.'});
 f.board.SB_DOC.characters.push({id:'guest'});
 shot.narration.push({id:'reply',speaker:'guest',delivery:'on_screen',tts:'Welcome.'});
 f.save();
 const p=planVideo({episode:f.episode,sceneNo:1,requestId:'desktop',args:{reserveUsd:0}});
 assert.equal(p.tool,'astra_genai_desktop_audio2video');assert.equal(p.args.allowAudioTruncation,false);assert.equal(p.args.model,'ltx-2.5-fast');assert.equal(p.args.resolution,'270p');assert.ok(p.inputs[audio]);
 assert.equal(p.voiceContinuity.strategy,'supplied_audio');
 assert.deepEqual(p.speechRoute.speakers,['hero','guest']);
 assert.throws(()=>planVideo({episode:f.episode,sceneNo:1,requestId:'wrong',operation:'image',args:{prompt:'ball',imagePath:audio,duration:2,loras:[{ref:'x'}],reserveUsd:0}}));
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
  const f = fixture(t, selection);
  Object.assign(f.board.SCENES[0], { duration: 14, edit: { in: .5 }, shot: { render: { mode: 'generated_video' } } });
  f.board.SCENES[0].visual.bg = 'opening.png';
  fs.writeFileSync(path.join(f.episode,'storyboard','opening.png'),png);
  f.board.SCENES[1].transition = 'dissolve';
  f.save();
  const fit = readShotVideoTiming(f.episode, 's1');
  assert.equal(fit.status, 'fits');
  assert.equal(fit.maxSeconds, 15);
  assert.ok(Math.abs(fit.requiredSeconds - 14.9) < 1e-9);
  assert.equal(fit.request.durationSeconds, 15);
  const { readStoryboard, storyboardReadSchema } = await import('../dist/storyboard.js');
  assert.equal(readStoryboard(storyboardReadSchema.parse({ path: path.join(f.episode, 'storyboard') })).videoTiming[0].status, 'fits');
  f.board.SCENES[0].duration = 21; f.save();
  assert.equal(readShotVideoTiming(f.episode, 's1').status, 'split_required');
  assert.throws(() => planVideo({ episode: f.episode, sceneNo:1, requestId: 'over', args: {} }), /video_duration_exceeded/);
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

test('two-speaker planning preserves the exact scene duration and refuses a stale performance',async t=>{
 const f=await pinnedSpeakerScene(t);
 const input={episode:f.episode,sceneNo:1,requestId:'timed',args:{reserveUsd:0}};
 const plan=planVideo(input);
 assert.equal(plan.args.numFrames,113);
 assert.equal(plan.sceneRequest.frameCount,113);
 assert.deepEqual(plan.sceneRequest.shots.map(s=>[s.startFrame,s.endFrame]),[[0,57],[57,113]]);
 assert.throws(()=>planVideo({...input,args:{...input.args,numFrames:49}}),/scene_video_timing/);
 f.board.SCENES[1].duration=64/24;f.save();
 await assert.rejects(f.execute(plan,async()=>assert.fail('stale scene reached provider')),/video_plan_stale/);
 const next=planVideo({...input,requestId:'longer'});
 assert.equal(next.args.numFrames,121);
});

test('MSR projects use I2V for silent and thought shots and require bindings for a second speaking face', async t => {
 const {manageSpeech}=await import('../dist/speech.js');
 const f=fixture(t,{engine:'astra-genai',model:'ltx-2.5-22b-distilled',resolution:'1792x1024',operation:'reference'});
 const img=path.join(f.episode,'opening.png');
 fs.writeFileSync(img,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=','base64'));
 const shot=f.board.SCENES[0];
 shot.visual.frames={mode:'reference',start:'../opening.png'};
 shot.visual.video.promptSource={action:'The character notices the open door.'};
 f.board.SB_DOC={characters:[{id:'hero',tts:{engine:'gemini',voiceId:'Kore',language:'ko',speed:1}}]};
 const plan=(generateAudio)=>planVideo({episode:f.episode,sceneNo:1,requestId:'thought',args:{duration:5,reserveUsd:0.25,generateAudio}});
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
  assert.throws(()=>planVideo({episode:f.episode,sceneNo:1,requestId:'wrong',tool:'astra_genai_msr'}),/scene_speech_route/);
 }
 shot.visual.video.promptSource.action='She thinks: “A secret thought.”';
 f.save();
 assert.throws(plan,/video_voiceover_embedded/);
 shot.visual.video.promptSource.action='The character notices the open door.';
 shot.duration=5.1;f.save();
 assert.throws(plan,/video_duration_short/);
 const timed=planVideo({episode:f.episode,sceneNo:1,requestId:'timed-thought',args:{reserveUsd:0.25}});
 assert.equal(timed.args.duration,6);assert.ok(Math.abs(timed.durationPlan.requiredSeconds-5.1)<1e-9);
 const required=seconds=>planVideo({episode:f.episode,sceneNo:1,requestId:'required-thought',args:{requiredSeconds:seconds,reserveUsd:0.25}});
 assert.equal(required(5.1).args.duration,6);assert.equal(required(8.1).args.duration,9);
 assert.equal(required(1).args.duration,6);assert.equal(required(5.1).args.requiredSeconds,undefined);
 assert.throws(()=>planVideo({episode:f.episode,sceneNo:1,requestId:'conflict',args:{requiredSeconds:5.1,duration:6,reserveUsd:0.25}}),/mutually exclusive/);
 shot.narration=[];delete shot.duration;
 shot.visual.video.promptSource.sound='Silent; narration is supplied separately.';
 f.save();
 assert.equal(plan().args.generateAudio,false);
 shot.narration=[{id:'l1',speaker:'hero',delivery:'on_screen',tts:'Hello'},{id:'l2',speaker:'friend',delivery:'on_screen',tts:'Hi'}];f.save();
 assert.throws(plan,/video_speaker_binding_required/);
 shot.narration[1]={id:'l2',speaker:'hero',delivery:'voiceover',tts:'A thought'};f.save();
 assert.throws(plan,/msr_speech_route|scene_video_mixed_delivery/);
});

test('candidate lineage survives revalidation; overview is local and output files cannot be reused',async t=>{
 const f=fixture(t);
 f.board.SCENES[0].visual.video.prompt='Open the door.';f.save();
 const first=planVideo({episode:f.episode,sceneNo:1,requestId:'draft-a',purpose:'draft',operation:'image',args:{durationSeconds:8}});
 await f.execute(first,async(_tool,args)=>{fs.mkdirSync(args.outputPath,{recursive:true});fs.writeFileSync(path.join(args.outputPath,args.filename),'fixture');return result;});
 f.board.SCENES[0].visual.video.prompt='Hold on the doorway.';f.save();
 const second=planVideo({episode:f.episode,sceneNo:1,requestId:'final-b',purpose:'final',basedOnRequestId:'draft-a',changeNote:'End on the doorway.',operation:'image',args:{durationSeconds:8}});
 await f.execute(second,async()=>result);
 const report=await videoStatus({episode:f.episode});
 assert.equal(report.candidates.length,2);
 assert.equal(report.summary.completedShots,1);
 const candidate=report.candidates.find(c=>c.requestId==='final-b');
 assert.equal(candidate.purpose,'final');assert.ok(candidate.changes.includes('prompt'));
 assert.equal(candidate.status,'completed');assert.equal(candidate.review,'not_reviewed');
 assert.ok(candidate.finishedAt);assert.ok(candidate.startedAt);
 assert.throws(()=>planVideo({episode:f.episode,sceneNo:2,requestId:'wrong',basedOnRequestId:'draft-a',operation:'image',args:{}}),/video_parent_missing/);
 const conflict=f.plan('conflict',{filename:first.args.filename});
 await assert.rejects(f.execute(conflict,async()=>{assert.fail('must not dispatch');}),/video_output_conflict/);
 await assert.rejects(videoStatus({episode:f.episode,action:'refresh'}),/requestId is required/);
 assert.ok(fs.readFileSync(path.join(f.episode,'storyboard/video-production-data.js'),'utf8').startsWith('window.VIDEO_PRODUCTION = '));
});
// A second cast voice, heard on the phone, gives reference adapters a two-speaker scene.
function addPhoneReply(f, card, opening='opening.png') {
  const dir = path.join(f.episode, 'storyboard');
  const tts = {engine:'gemini',voiceId:'Puck',language:'en',speed:1};
  const voice = path.join(dir,'caller.wav');
  execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','sine=750:duration=2',voice]);
  f.board.SB_DOC.characters.push({id:'caller',voiceOnly:true,tts,
    voiceReference:{path:voice,tts,sha256:digest(fs.readFileSync(voice))}});
  const lead = card.narration[0].speaker;
  card.narration.push({id:'reply',speaker:'caller',delivery:'off_screen',tts:'Yes.'});
  card.duration ??= 5;
  card.shot ??= {size:'ms',angle:'eye'};
  card.visual.frames={mode:'reference',start:opening};
  f.board.STRUCTURE.scenes[0].videoDirection = {emotion:'A warm reply.',openingPositions:[
    {character:lead,images:[],position:'At the door.'},{character:'caller',images:[],position:'Off screen on the phone.'}]};
}

test('hosted reference video binds one or two voices and ends its image list with the opening', t => {
 const f=fixture(t,{engine:'minimax',model:'MiniMax-H3',resolution:'768P',operation:'reference'});
 const png=(name,size)=>{const file=path.join(f.episode,name);execFileSync('ffmpeg',['-v','error','-f','lavfi','-i',`color=c=gray:s=${size}`,'-frames:v','1',file]);return file;};
 png('face.png','32x32');png('place.png','64x36');png('start.png','64x36');
 execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','sine=d=3',path.join(f.episode,'hero.wav')]);
 f.board.SB_DOC={characters:[{id:'hero',name:'Hero',tts:{engine:'gemini',voiceId:'Kore',language:'en'},voiceReference:{path:'../hero.wav',imagePaths:['../face.png']}}]};
 f.board.SCENES[0]={id:'s1',narration:[{id:'l1',speaker:'hero',delivery:'on_screen',tts:'Hello there'}],visual:{frames:{mode:'reference',start:'../start.png'},
  references:[{id:'hero-face',path:'../face.png',role:'character',use:'both',purpose:'Hero face'},{id:'street',path:'../place.png',role:'background',use:'both',purpose:'the street'}],video:{prompt:'Hero greets the viewer.'}}};
 f.board.SCENES[1]={id:'s2',visual:{frames:{mode:'first',start:'../start.png'},references:[],video:{prompt:'Hero walks on.'}}};const hero=f.board.SB_DOC.characters[0];
 Object.assign(hero.voiceReference,{tts:hero.tts,sha256:digest(fs.readFileSync(path.join(f.episode,'hero.wav')))});
 addPhoneReply(f,f.board.SCENES[0],'../start.png');
 f.save();
 const p=planVideo({episode:f.episode,sceneNo:1,requestId:'ref'});
 assert.equal(p.tool,'minimax_reference');
 assert.deepEqual(p.args.referenceImagePaths.map(file=>path.basename(file)),['face.png','start.png']);
 assert.equal(p.args.ratio,'16:9');
 assert.deepEqual(p.args.referenceAudioPaths.map(file=>path.basename(file)),['hero.wav','caller.wav']);
 assert.match(p.args.prompt,/reference image 2 \(start/);
 assert.match(p.args.prompt,/reference image 1, uses reference audio 1/);
 assert.ok(p.quote.reserveUsd>0);
 assert.match(p.args.prompt,/"Hello there"/);
 assert.match(p.args.prompt,/"Yes\."/);
 f.board.SCENES[0].narration.pop();
 f.board.STRUCTURE.scenes[0].videoDirection.openingPositions.pop();
 f.save();
 const solo=planVideo({episode:f.episode,sceneNo:1,requestId:'one-voice'});
 assert.equal(solo.tool,'minimax_reference');
 assert.deepEqual(solo.args.referenceAudioPaths,[path.join(f.episode,'hero.wav')]);
 assert.doesNotMatch(solo.args.prompt,/"Yes\."/);
 assert.throws(()=>planVideo({episode:f.episode,sceneNo:2,requestId:'forced',operation:'reference'}),/scene_speech_route/);
 const silent=planVideo({episode:f.episode,sceneNo:2,requestId:'silent'});
 assert.equal(silent.tool,'minimax_img2video');
 assert.match(silent.args.prompt,/No speech/);
 assert.equal(path.basename(silent.args.sourceImagePath),'start.png');
});

test('sceneNo refuses a frame-addressed cut on I2V and preserves ordered dialogue on a legacy single-shot board', async t => {
 const f = fixture(t, {engine:'astra-genai',model:'ltx-2.5-22b-distilled',resolution:'576x1024',operation:'image'});
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
 globalThis.fetch=async()=>Response.json({msr:true,voice_references:true,image_conditioning:true});
 t.after(()=>{config.astraGenaiApiKey=oldKey;globalThis.fetch=oldFetch;});
 await refreshGenaiMsrVoice(true);
 for (const [index, person] of f.board.SB_DOC.characters.entries()) {
  person.voiceReference.path=path.join(dir,person.id+'.wav');
  execFileSync('ffmpeg',['-loglevel','error','-f','lavfi','-i','sine='+[450,800][index]+':duration=0.12',person.voiceReference.path]);
  Object.assign(person.voiceReference,{tts:person.tts,sha256:digest(fs.readFileSync(person.voiceReference.path))});
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
 assert.throws(()=>planVideo({...input,sceneNo:undefined,shotId:'s2'}),/sceneNo|shotId/);
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
 assert.match(plan.args.prompt,/heir \(Image 1, Audio 1\): "왜 그랬어요\?"[\s\S]+witness \(Image 2, Audio 2\): "제가 찢었습니다\."/);
 assert.equal(plan.args.prompt.split(words[0]).length,2);
 assert.match(plan.args.prompt,/Whisper the answer/);
 assert.doesNotMatch(plan.args.prompt,/hard cut|camera holds|tripod|gets to his feet|walk over/i);
 assert.throws(()=>planVideo({...input,shotId:'s1'}),/shotId/);
 assert.throws(()=>planVideo({...input,args:{duration:3}}),/video_duration_short/);
 approveVideo({episode:f.episode,planIds:[plan.id],request:'Approve this whole scene'});
 let calls=0;
 await f.execute(plan,async (tool,args)=>{
  calls++;
  assert.equal(tool,plan.tool); assert.equal(args.prompt,plan.args.prompt);
  assert.equal(args.references[0].audioPath,path.join(dir,'heir.wav'));
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
 assert.match(prompt,/As witness speaks\. Touch the latch\. As heir speaks\./);
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

    for (const scope of [{sceneNo:1}]) {
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
    delete f.board.STRUCTURE.scenes[0].videoDirection;
    shot.visual = {bg:'first.png',video:{lastImagePath:'last.png',prompt:'An envelope opens.'}};
    f.save();
    const gateway = video.engine === 'astra-genai';
    const firstFile = path.join(f.episode, 'storyboard/first.png'), lastFile = path.join(f.episode, 'storyboard/last.png');
    const explicitFirst = {[gateway ? 'imagePath' : 'sourceImagePath']:firstFile};
    const explicitLast = {[gateway ? 'lastFramePath' : 'lastImagePath']:lastFile};
    for (const [opening, args] of [['first.png',explicitFirst], ['first.png',explicitLast]]) {
      shot.visual.bg = opening;
      f.save();
      const response = await ROUTES.video_plan({episode:f.episode,sceneNo:1,requestId:'legacy-pair',maxCostUsd:3,args});
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
        for (const scope of [{sceneNo:1}])
          await assert.rejects(ROUTES.video_plan({episode:f.episode,...scope,requestId:'text-frames',operation:'text'}), /scene_speech_route/);
      }
    }
  }
  assert.ok(calls.some(url => url.endsWith('/v1/ltx/msr/capabilities')));
});

test('a Veo reference picture cannot replace the authored opening on a silent legacy scene', async t => {
  const f = fixture(t,{engine:'veo',model:'veo-3.1-generate-001',resolution:'720p'});
  const card = f.board.SCENES[0];
  card.duration = 8;
  card.visual = {video:{referenceImagePaths:['ref.png'],prompt:'The animal turns.'}};
  fs.writeFileSync(path.join(f.episode,'storyboard/ref.png'),png);
  f.save();
  await assert.rejects(ROUTES.video_plan({episode:f.episode,sceneNo:1,requestId:'ref-only'}), /opening|scene_speech_route/);
  card.visual.frames = {mode:'first',start:'opening.png'};
  f.save();
  await assert.rejects(ROUTES.video_plan({episode:f.episode,sceneNo:1,requestId:'force-reference',tool:'veo_reference'}), /scene_speech_route/);
});

test('Veo refuses extra subject files on a silent scene with an authored opening', t => {
  const f = fixture(t,{engine:'veo',model:'veo-3.1-generate-001',resolution:'720p'});
  const card = f.board.SCENES[0]; card.duration = 8;
  card.visual.references = [{id:'clock',path:'clock.png',role:'prop',use:'video',purpose:'Keep the red clock.'}];
  fs.writeFileSync(path.join(f.episode,'storyboard/clock.png'),png);
  f.save();
  assert.throws(()=>planVideo({episode:f.episode,sceneNo:1,requestId:'extra-prop'}),/unsupported|cannot combine/i);
});

test('Veo keeps off-screen voices external, honors native dialogue authorization and rejects saved post-lip-sync', async t => {
  const f = fixture(t, {engine:'veo',model:'veo-3.1-fast-generate-001',resolution:'720p'});
  const scene = {no:1,speakers:['guest'],frames:{start:'opening.png'},videoDirection:{
    openingPositions:[],emotion:'The listener recognizes a friend.'}};
  f.board.STRUCTURE = {scenes:[scene]};
  const card=f.board.SCENES[0]; f.board.SCENES=[card];
  card.duration=4; card.shot={size:'ms',angle:'eye'}; card.visual.action='The listener looks up.';
  card.narration=[{speaker:'guest',delivery:'off_screen',tts:'Come in.'}];
  const plan=()=>planVideo({episode:f.episode,sceneNo:1,requestId:'phone'});
  f.save();
  const accepted=plan();
  assert.equal(accepted.tool,'veo_img2video');
  assert.equal(accepted.voiceContinuity.strategy,'external_tts');
  assert.doesNotMatch(buildVeoBody(accepted.args).instances[0].prompt,/Come in\./);
  card.narration[0].delivery='on_screen';
  scene.videoDirection.openingPositions.push({character:'guest',images:[],position:'At the door.'});
  f.save();
  assert.throws(plan,/scene_speech_references|voice_lane_required/);
  scene.videoDirection.dialogueVoice='model_generated';
  f.save();
  const generated=plan();
  assert.equal(generated.tool,'veo_img2video');
  assert.equal(generated.voiceContinuity.strategy,'model_generated');
  const body=buildVeoBody(generated.args);
  assert.equal(body.parameters.generateAudio,true);
  assert.match(body.instances[0].prompt,/Come in\./);
  const id=saveHistoricalPlan(f.episode,generated,plan=>{plan.args.postLipSync=true;});
  const fetch=t.mock.method(globalThis,'fetch',()=>assert.fail('Historical post-lip-sync plan reached the provider'));
  await assert.rejects(ROUTES.video_approve({episode:f.episode,planIds:[id],request:'Approve the historical take'}),/post_lipsync_forbidden/);
  await assert.rejects(ROUTES.video_execute({episode:f.episode,planId:id}),/post_lipsync_forbidden/);
  assert.equal(fetch.mock.callCount(),0);
  assert.equal(fs.existsSync(path.join(f.episode,'.work/video-routing/state.json')),false);
});

test('choosing a generated voice on Seedance Mini still requires the visible character’s identity', t => {
  const f = fixture(t,{engine:'seedance',model:'dreamina-seedance-2-0-mini-260615',resolution:'480p'});
  const card=f.board.SCENES[0];
  card.narration=[{speaker:'guest',delivery:'on_screen',tts:'Wait.'}];
  card.duration=4;
  f.board.STRUCTURE.scenes[0]={no:1,speakers:['guest'],frames:{start:'opening.png'},
    videoDirection:{dialogueVoice:'model_generated',openingPositions:[{character:'guest',images:[],position:'At the door.'}],emotion:'She hesitates.'}};
  f.save();
  const plan=()=>planVideo({episode:f.episode,sceneNo:1,requestId:'generated-voice'},false);
  assert.throws(plan,/character_input_required/);
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
  assert.equal(plan.tool, 'veo_img2video');
  assert.equal(plan.args.aspectRatio, '9:16');
  assert.equal(plan.quote.reserveUsd, 0.8);
  assert.equal(f.plan('quiet', { generateAudio: false }).quote.reserveUsd, 0.64);
  f.board.SCENES[0].narration = [{ speaker:'hero', delivery:'on_screen', tts:'Hello' }];
  f.save();
  assert.throws(() => f.plan('spoken'), /scene_speech_route|Unsupported Veo operation/);
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

test('the saved Flash model keeps its paired frames and recovers the original provider job', async t => {
 const model='dreamina-seedance-2-5-flash-261115', f=fixture(t,{engine:'seedance',model,resolution:'720p'});
 const card=f.board.SCENES[0], dir=path.join(f.episode,'storyboard');
 card.visual.video.prompt='The umbrella opens.';
 const plan=(id,args={})=>planVideo({episode:f.episode,sceneNo:1,requestId:id,args});
 assert.throws(()=>settings.validateModels({video:{engine:'seedance',model,resolution:'1080p'}},true),/resolution/);
 assert.throws(()=>settings.validateModels({video:{engine:'seedance',model,operation:'audio'}},true),/operation/);
 f.board.FORMAT='shorts-9x16'; f.save();
 card.sound = {audioSource:'speech'}; f.save();
 const first=plan('flash-silent');
 assert.equal(first.args.generateAudio, false);
 card.sound = {audioSource:'video', effects:[{delivery:'native'}]}; f.save();
 assert.equal(plan('flash-effects').args.generateAudio, true);
 delete card.sound;
 assert.equal(first.tool,'seedance_img2video'); assert.equal(first.args.model,model); assert.equal(first.args.ratio,'adaptive');
 for (const file of ['open.png','close.png']) fs.writeFileSync(path.join(dir,file),png);
 card.visual.frames={mode:'first_last',start:'open.png',end:'close.png',reason:'Keep both states.',endState:'Open umbrella.'}; f.save();
 const image=plan('flash-image');
 assert.equal(image.tool,'seedance_img2video'); assert.equal(image.args.lastImagePath,path.join(dir,'close.png')); assert.equal(image.args.ratio,'adaptive');
 const reference=image;
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
 const refresh = () => videoStatus({episode:f.episode,requestId:'flash-image',action:'refresh'});
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

test('a Flash edit cannot substitute for generation and a paid short render still settles actual usage', async t => {
  const f=fixture(t,{engine:'seedance',model:'dreamina-seedance-2-5-flash-261115',resolution:'720p'});
  const card=f.board.SCENES[0], slot=card.visual.video;
  Object.assign(slot,{omniReferenceTaskType:'edit',referenceVideoUrls:['asset://original']}); f.save();
  assert.throws(()=>planVideo({episode:f.episode,sceneNo:1,requestId:'edit'}),/scene_speech_route/);
  assert.equal(fs.existsSync(path.join(f.episode,'.work/video-routing/state.json')),false);
  delete slot.omniReferenceTaskType; delete slot.referenceVideoUrls;
  slot.prompt='An umbrella opens.'; card.duration=5; f.save();
  const plan=planVideo({episode:f.episode,sceneNo:1,requestId:'short-render',args:{durationSeconds:-1}});
  const response=await f.execute(plan, async (_tool,args) => {
    recordVideoSubmission('cgt-short');
    recordVideoTokens(100000);
    writeTinyMp4(args.outputPath,args.filename);
    return result;
  });
  assert.ok(response.isError);
  assert.match(response.content[0].text,/needs 5s|shorter than|duration/);
  assert.equal(f.state().jobs['short-render'].settledUsd,0.7);
  await assert.rejects(f.execute(plan,()=>assert.fail('duplicate submission')),/video_request_failed/);
});

test('approved Seedance media, task type and audio changes invalidate both approval and dispatch', async t => {
  const f = fixture(t, {engine:'seedance',model:'dreamina-seedance-2-5-flash-261115',resolution:'720p'});
  const slot = f.board.SCENES[0].visual.video;
  const original = {generateAudio:false};
  Object.assign(slot, original); f.save();
  const plan = planVideo({episode:f.episode,sceneNo:1,requestId:'approved',args:{}});
  assert.equal(plan.sourceArgs.referenceVideoUrls, undefined);
  approveVideo({episode:f.episode,planIds:[plan.id],request:'Use the original clip'});
  for (const change of [{referenceVideoUrls:['asset://other']},{omniReferenceTaskType:'edit'},{generateAudio:true}]) {
    delete slot.referenceVideoUrls; delete slot.omniReferenceTaskType;
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
  execFileSync('ffmpeg',['-y','-v','error','-f','lavfi','-i','color=s=320x320','-frames:v','1',path.join(f.episode,'storyboard/opening.png')]);
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

test('Seedance episode slots cannot use editing or extension to bypass the scene operation', t => {
  const flash = 'dreamina-seedance-2-5-flash-261115';
  for (const type of ['points','broll','quote']) {
    const f = fixture(t,selection);
    const slot={engine:'seedance',model:flash,resolution:'720p',referenceVideoUrls:['asset://source']};
    const card={id:'s1',scene:1,type,duration:5,shot:{size:'ms',angle:'eye'},
      visual:type==='broll'?slot:type==='quote'?{clip:slot}:{video:slot}};
    card.visual.frames={mode:'first',start:'opening.png'};
    f.board.SCENES=[card];
    for (const task of ['edit','extend']) {
      slot.omniReferenceTaskType=task; f.save();
      assert.throws(()=>planVideo({episode:f.episode,sceneNo:1,requestId:'task',tool:'seedance_reference'}),/scene_speech_route/);
    }
  }
});

test('a direct Seedance reference call cannot substitute prop references for silent image-to-video', async t => {
  const f=fixture(t,{engine:'seedance',model:'dreamina-seedance-2-5-flash-261115',resolution:'720p'});
  await assert.rejects(routeLegacyVideo('seedance_reference',{videoContext:{episode:f.episode,sceneNo:1,requestId:'direct'},
    referenceImagePaths:['prop.png'],prompt:'A red umbrella.'},()=>assert.fail('unexpected dispatch')),/scene_speech_route/);
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

function registeredFace(t, folder, assetId) {
  for (const name of ['BYTEPLUS_ACCESS_KEY_ID','BYTEPLUS_SECRET_ACCESS_KEY','BYTEPLUS_PROJECT_NAME']) {
    const prior = process.env[name];
    process.env[name] = 'fixture';
    t.after(() => { if (prior === undefined) delete process.env[name]; else process.env[name] = prior; });
  }
  const scope = digest('fixture\nfixture').slice(0,20);
  const shelf = {project:'fixture',groupType:'AIGC',groupId:'group-'+path.basename(folder),
    assets:{'face.png':{id:assetId,status:'Active',sha256:digest(fs.readFileSync(path.join(folder,'face.png')))}}};
  const doc = {character:{version:1},modelArk:{kind:'AIGC', libraries:{[scope]:shelf}}};
  fs.writeFileSync(path.join(folder,'identity.md'),'```json\n'+JSON.stringify(doc)+'\n```\n');
}

test('a workshop and a voice cannot buy an on-screen principal for either legacy selector', async t => {
  const f = fixture(t, selection, {maxAttempts:1});
  const shot = f.board.SCENES[0], character = 'han-seoyun';
  Object.assign(shot,{id:'s0001',scene:1,duration:5,shot:{size:'fs',angle:'eye'},
    narration:[{speaker:character,delivery:'on_screen',tts:'Come in.'}],
    visual:{character:[character],camera:{movement:'static'},video:{realFaceInput:false,prompt:'Use Image 1 for the workshop. She speaks to the lens.'}}});
  f.board.STRUCTURE={scenes:[{no:1,videoDirection:{openingPositions:[{character,images:[],position:'In the center.'}],emotion:'A warm welcome.'}}]};
  f.board.SB_DOC={characters:[{id:character}]};
  addPhoneReply(f,shot);
  f.save();
  const post = t.mock.method(globalThis,'fetch',()=>assert.fail('unexpected provider call'));
  const args={generateAudio:true,referenceImagePaths:['workshop-front.png'],referenceAudioPaths:['voice.wav']};
  const input={episode:f.episode,requestId:'incident',tool:'seedance_reference',args};
  for (const selector of [{sceneNo:1}]) {
    const result = await ROUTES.video_plan({...input,...selector});
    assert.equal(result.structuredContent.character,character);
    assert.equal(result.structuredContent.role,'face');
    assert.equal(result.structuredContent.shotId,'s0001');
    assert.equal(result.structuredContent.executable,false);
    assert.equal(result.structuredContent.videoSubmitted,false);
  }
  await assert.rejects(routeLegacyVideo('seedance_reference',{...args,videoContext:{episode:f.episode,sceneNo:1,requestId:'direct'}},()=>assert.fail()),/character_input_required/);
  assert.equal(post.mock.callCount(),0);
  const {render,read}=require('../../skills/storyboard/references/video-production.js');
  assert.match(render(read(path.join(f.episode,'storyboard')),null,'en',1),/han-seoyun.*face/);
  // A second principal's appearance is evaluated on their own scene interval.
  const later={...shot,id:'s0002',visual:{character:'later-actor'},narration:[{speaker:'later-actor',delivery:'on_screen',tts:'Wait.'}]};
  delete shot.visual.character; shot.narration=[{speaker:character,delivery:'on_screen',tts:'Come in.'},{speaker:'caller',delivery:'off_screen',tts:'Yes.'}];
  fs.writeFileSync(path.join(f.episode,'storyboard/cast.json'),JSON.stringify({characters:{[character]:{}}}));
  for (const [view,role] of [
    [{mode:'front',subjectId:character},'face'],
    [{mode:'ots',subjectType:'object',subjectId:'workbench',viewerId:character},'body']
  ]) {
    shot.visual.camera.view=view;
    f.save();
    const camera=await ROUTES.video_plan({...input,sceneNo:shot.scene,requestId:'camera-'+view.mode});
    assert.equal(camera.structuredContent.character,character);
    assert.equal(camera.structuredContent.role,role);
    assert.equal(camera.structuredContent.videoSubmitted,false);
  }
  delete shot.visual.camera.view; shot.narration=[];
  f.board.SCENES.push(later);f.save();
  const blocked=await ROUTES.video_plan({...input,sceneNo:1,requestId:'second-shot'});
  assert.equal(blocked.structuredContent.shotId,'s0002');
  assert.equal(blocked.structuredContent.character,'later-actor');
  for (const name of ['plans','state.json']) assert.equal(fs.existsSync(path.join(f.episode,'.work/video-routing',name)),false);
  // Establish a previously valid silent plan and add an on-screen line to the same card.
  f.board.SCENES = [shot]; f.board.STRUCTURE = {scenes:[{no:1}]};
  shot.visual={frames:{mode:'first',start:'opening.png'},video:{prompt:'A still workshop.'}};
  f.save();
  const historical=planVideo({episode:f.episode,sceneNo:1,requestId:'old-approval'});
  shot.visual.character=character; shot.narration=[{speaker:character,delivery:'on_screen',tts:'Come in.'}];
  f.save();
  assert.throws(()=>approveVideo({episode:f.episode,planIds:[historical.id],request:'Reuse the old plan'}),/character_input_required|scene_speech_route|Unsupported Seedance operation/);
  await assert.rejects(f.execute(historical,()=>assert.fail('old plan reached dispatch')),/character_input_required|scene_speech_route|Unsupported Seedance operation/);
  assert.equal(fs.existsSync(path.join(f.episode,'.work/video-routing/state.json')),false);
});

test('the paid Seedance body matches the approved set, face, wardrobe and voice slots', async t => {
  const f = fixture(t,{...selection,model:'dreamina-seedance-2-0-260128'}, {maxAttempts:1});
  const dir=path.join(f.episode,'storyboard'), character='han-seoyun', sheet=path.join(f.root,'assets/characters',character);
  fs.mkdirSync(sheet,{recursive:true});
  const room=path.join(dir,'workshop.png'), face=path.join(sheet,'face.png'), front=path.join(sheet,'front.png'), voice=path.join(dir,'voice.wav');
  for(const [file,color] of [[room,'red'],[face,'blue'],[front,'green']])
    execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color='+color+':s=320x320','-frames:v','1',file]);
  execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','sine=440:duration=2','-ar','16000',voice]);
  fs.writeFileSync(path.join(sheet,'panels.json'), JSON.stringify({panels:{face:{file:'face.png'},front:{file:'front.png'}}}));
  const tts={engine:'gemini',voiceId:'Kore',language:'en',speed:1};
  f.board.SB_DOC={characters:[{id:character,tts,voiceReference:{path:voice,sha256:digest(fs.readFileSync(voice)),tts}}]};
  const shot=f.board.SCENES[0];
  shot.visual={character,characterInputs:[{character,bodyView:'front'}],
    video:{realFaceInput:false,prompt:'In the workshop she waves at the camera.'}};
  shot.narration=[{speaker:character,delivery:'on_screen',tts:'Come in.'}];
  addPhoneReply(f,shot,'workshop.png');
  f.save();
  const input={episode:f.episode,sceneNo:1,requestId:'preview',args:{durationSeconds:5}};
  registeredFace(t,sheet,'asset-seoyun');
  const bodies=[];
  let remoteGroup='group-'+character;
  t.mock.method(globalThis,'fetch', async (url,options={})=>{
    if(new URL(url).searchParams.get('Action')==='GetAsset')
      return Response.json({Result:{Id:'asset-seoyun',Name:'sf-'+digest(fs.readFileSync(face)).slice(0,48),GroupId:remoteGroup,AssetType:'Image',Status:'Active'}});
    if(options.method==='POST') {bodies.push(JSON.parse(options.body));return Response.json({id:'cgt-preview'});}
    return Response.json({status:'failed',error:{message:'offline test stop'}});
  });
  const timer=setTimeout;
  t.mock.method(globalThis,'setTimeout',(fn,ms,...args)=>timer(fn,ms===10000?0:ms,...args));
  const planned=await ROUTES.video_plan(input);
  const plan=JSON.parse(planned.content[0].text);
  assert.deepEqual(plan.args.referenceImagePaths,[face,front,room]);
  assert.deepEqual(plan.characterBindings.filter(b=>b.character).map(b=>[b.role,b.slot,b.character]),
    [['face',1,character],['front',2,character],['voice',1,character],['voice',2,'caller']]);
  approveVideo({episode:f.episode,planIds:[plan.id],request:'Use the reviewed sheet.'});
  // Swap the serialized files after plan revalidation, as a faulty adapter might.
  const other=path.join(f.root,'assets/characters/guest');
  fs.mkdirSync(other,{recursive:true});
  fs.copyFileSync(room,path.join(other,'face.png'));
  fs.copyFileSync(front,path.join(other,'front.png'));
  fs.copyFileSync(path.join(sheet,'panels.json'),path.join(other,'panels.json'));
  registeredFace(t,other,'asset-guest');

  const duet=planVideo({...input,requestId:'duet'});
  const faces=duet.characterBindings.filter(b=>b.role==='face');
  assert.deepEqual(faces.map(b=>[b.character,b.slot,b.asset.assetId]),[[character,1,'asset-seoyun']]);
  const swapped=await f.execute(duet,async (_tool,args)=>{
    const paths=[...args.referenceImagePaths];
    paths[0] = path.join(other,'face.png');
    const result=await generateWithReferences(seedanceReferenceSchema.parse({...args,referenceImagePaths:paths}));
    assert.equal(result.portraitProblem.code,'modelark_asset_stale');
    return {isError:true,terminal:true,structuredContent:result.portraitProblem,content:[]};
  });
  assert.equal(swapped.structuredContent.videoSubmitted,false);
  assert.equal(bodies.length,0);
  assert.deepEqual(f.state().jobs,{});

  remoteGroup='group-other';
  const execute=()=>ROUTES.video_execute({episode:f.episode,planId:plan.id});
  const rejected=await execute();
  assert.equal(rejected.structuredContent.code,'modelark_asset_identity_conflict');
  assert.equal(bodies.length,0);
  assert.deepEqual(f.state().jobs,{});
  remoteGroup='group-'+character;
  // Exercise the cap on the final JSON without allocating a 64 MiB media fixture.
  const byteLength=Buffer.byteLength;
  const size=t.mock.method(Buffer,'byteLength',(value,...rest)=>
    typeof value==='string' && value.includes('"content":[') && value.includes('"model":"dreamina-seedance')
      ? 64*1024*1024+1 : byteLength(value,...rest));
  for (const [tool,frames] of [['seedance_text2video',{}],['seedance_img2video',{sourceImagePath:room,lastImagePath:room}]]) {
    const result=await dispatchVideo(tool,{model:plan.args.model,prompt:'The workshop doors open.',...frames});
    assert.match(result.structuredContent.message,/exceeds 64 MB/);
    assert.equal(result.structuredContent.videoSubmitted,false);
  }
  const oversized=await execute();
  size.mock.restore();
  assert.equal(oversized.structuredContent.stage,'seedance_inputs');
  assert.equal(oversized.structuredContent.videoSubmitted,false);
  assert.equal(bodies.length,0);
  assert.deepEqual(f.state().jobs,{});
  await execute();
  assert.equal(bodies.length,1);
  const parts=bodies[0].content.filter(p=>p.type!=='text');
  assert.deepEqual(parts.map(p=>p.role),['reference_image','reference_image','reference_image','reference_audio','reference_audio']);
  const hashUri=uri=>digest(Buffer.from(uri.split(',')[1],'base64'));
  assert.equal(parts[0].image_url.url,'asset://asset-seoyun');
  assert.equal(hashUri(parts[1].image_url.url),digest(fs.readFileSync(front)));
  assert.equal(hashUri(parts[2].image_url.url),digest(fs.readFileSync(room)));
  assert.equal(hashUri(parts[3].audio_url.url),digest(fs.readFileSync(voice)));
  assert.equal(hashUri(parts[4].audio_url.url),digest(fs.readFileSync(path.join(dir,'caller.wav'))));
  assert.deepEqual(f.state().jobs.preview.characterBindings,plan.characterBindings);
});

test('Seedance keeps the camera-facing body panel, ordered props and both pinned voices', t => {
  const f=fixture(t,{engine:'seedance',model:'dreamina-seedance-2-0-260128',resolution:'480p'});
  const board = path.join(f.episode, 'storyboard'), folder = path.join(f.root,'assets/characters/hero');
  fs.mkdirSync(folder, {recursive:true});
  const panels = {};
  for (const view of ['face','front','back']) {
    fs.writeFileSync(path.join(folder, view+'.png'), png);
    panels[view] = {file:view+'.png',view,purpose:'character_reference'};
  }
  fs.writeFileSync(path.join(folder,'panels.json'), JSON.stringify({panels}));
  registeredFace(t,folder,'asset-hero');
  const tts = {engine:'gemini',voiceId:'Kore',language:'ko',speed:1};
  const wav = path.join(board, 'speaker.wav');
  execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','sine=440:duration=2','-ar','16000',wav]);
  const sha256=digest(fs.readFileSync(wav));
  f.board.SB_DOC = {characters:[{id:'hero',tts,voiceReference:{path:wav,tts,sha256}}]};
  const card = f.board.SCENES[0];
  card.visual.character = 'hero';
  card.visual.frames = {mode:'reference'};
  card.visual.video.prompt = 'A person waves from a doorway.';
  card.visual.video.openingPositions = [{character:'hero',images:[1,2],position:'standing in the doorway'}];
  card.narration = [{id:'spoken',speaker:'hero',delivery:'on_screen',tts:'문 앞이야.'}];
  addPhoneReply(f,card);
  const plan = () => planVideo({episode:f.episode,sceneNo:1,requestId:'cast',maxCostUsd:4}, false);
  for (const [mode,bodyView] of [['front','front'], ['rear','back']]) {
    card.visual.camera = {view:{mode,subjectId:'hero',subject:'The visitor',reason:'Show the moving body.',crop:'Waist up.',subjectType:'person'}};
    f.save();
    const p=plan();
    assert.equal(p.characterInputs[0].bodyView, bodyView);
    assert.deepEqual(p.imageBindings.filter(ref=>ref.submitted).map(ref=>path.basename(ref.path)),
      mode==='rear'?['back.png','opening.png']:['face.png','front.png','opening.png']);
    assert.deepEqual(p.args.referenceAudioPaths,[wav,path.join(board,'caller.wav')]);
    assert.equal(p.voiceContinuity.speakers[0].reference.sha256,sha256);
    assert.match(p.args.prompt,/문 앞이야/);
  }
  fs.writeFileSync(path.join(board,'bag.png'),png);
  card.visual.references = [
    {id:'prop',path:'bag.png',role:'prop',use:'video',purpose:'A green bag.'},
    {id:'portrait',path:path.join(folder,'face.png'),role:'character',use:'both',purpose:'Preserve the scar.'},
  ];
  card.visual.characterInputs = [{character:'hero', bodyView:'back', visibility:'face_visible'}];
  card.visual.video.realFaceInput = true;
  card.visual.video.prompt = 'Image 1 is the green bag. Image 2 is the face.';
  f.save();
  const ordered = plan();
  assert.deepEqual(ordered.args.referenceImagePaths.map(file=>path.basename(file)), ['bag.png','face.png','back.png','opening.png']);
  assert.deepEqual(ordered.imageBindings.map(r=>r.id), ['prop','portrait','s1-hero-back','start']);
  assert.match(ordered.args.prompt,/Preserve the scar/);
  assert.throws(() => planVideo({episode:f.episode,sceneNo:1,requestId:'bypass',args:{realFaceInput:false}}), /character_inputs_mismatch/);
  delete f.board.SB_DOC.characters[0].voiceReference;
  f.save();
  assert.throws(plan, /character_voice_required|scene_speech_references/);
});

test('Seedance original face IDs are checked on the account before saving a plan and never persist a signed URL', async t => {
  const f = fixture(t, {engine:'seedance',model:'dreamina-seedance-2-0-260128',resolution:'480p'});
  const board = path.join(f.episode,'storyboard'), sheet = path.join(f.root,'assets/characters/hero');
  fs.mkdirSync(sheet,{recursive:true});
  fs.writeFileSync(path.join(sheet,'body.png'),png);
  fs.writeFileSync(path.join(sheet,'panels.json'),JSON.stringify({panels:{front:{file:'body.png'}}}));
  const card = f.board.SCENES[0];
  const tts = {engine:'gemini',voiceId:'Kore',language:'en',speed:1};
  const wav = path.join(board,'hero.wav');
  execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','sine=440:duration=2','-ar','16000',wav]);
  f.board.SB_DOC = {characters:[{id:'hero',tts,voiceReference:{path:wav,tts,sha256:digest(fs.readFileSync(wav))}}]};
  card.narration = [{speaker:'hero',delivery:'on_screen',tts:'Hello.'}];
  card.visual = {character:'hero', frames:{mode:'reference'}, video:{prompt:'A full-length dancer taps one shoe.'},
    characterInputs:[{character:'hero',bodyView:'front',faceTaskId:'cgt-original',faceReviewPath:'cast-review.json'}]};
  addPhoneReply(f,card); card.duration=4;
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
  const args = {episode:f.episode,sceneNo:1,requestId:'trusted',args:{durationSeconds:4}};
  const review={character:'hero',providerJob:task.id,status:'failed'};
  for (const invalid of [review,{...review,status:'passed',character:'other'}]) {
    fs.writeFileSync(path.join(board,'cast-review.json'),JSON.stringify(invalid));
    await assert.rejects(planManagedVideo(args), /character_face_review_required/);
  }
  fs.writeFileSync(path.join(board,'cast-review.json'),JSON.stringify({...review,status:'passed'}));
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

test('one Seedance scene binds all three original characters and their voices in speaking order', t => {
  const f = fixture(t,{engine:'seedance', model:'dreamina-seedance-2-0-260128', resolution:'480p'});
  const dir=path.join(f.episode,'storyboard');
  const speakers=['ada','bo','cy'];
  f.board.SCENES.push({id:'s3'});
  f.board.SB_DOC={characters:[]};
  f.board.STRUCTURE={scenes:[{no:1,speakers,frames:{start:'opening.png'},videoDirection:{emotion:'Hope returns.',openingPositions:speakers.map((character,i)=>({character,images:[],position:i?'At the gate.':'On the bike.'}))}}]};
  for (const [i,id] of speakers.entries()) {
    const tts={engine:'gemini',voiceId:i?'Kore':'Puck',language:'en',speed:1};
    const wav=path.join(dir,id+'.wav'),sheet=path.join(f.root,'assets/characters',id);
    fs.mkdirSync(sheet,{recursive:true});
    fs.writeFileSync(path.join(sheet,'face.png'),png); fs.writeFileSync(path.join(sheet,'front.png'),png);
    fs.writeFileSync(path.join(sheet,'panels.json'),JSON.stringify({panels:{face:{file:'face.png'},front:{file:'front.png'}}}));
    execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','sine='+[400,650,900][i]+':duration=2','-ar','16000',wav]);
    f.board.SB_DOC.characters.push({id,tts,voiceReference:{path:wav,tts,sha256:digest(fs.readFileSync(wav))}});
    fs.writeFileSync(path.join(dir,id+'.json'),JSON.stringify({status:'passed',character:id,providerJob:'cgt-'+id}));
    Object.assign(f.board.SCENES[i],{scene:1,duration:2,shot:{size:'ms',angle:'eye'},narration:[{speaker:id,tts:['Wait.','Go.','Ready.'][i],delivery:'on_screen'}],
      visual:{character:id,video:{promptSource:{action:'The rider looks at the gate.'}},characterInputs:[{character:id,bodyView:'front',faceTaskId:'cgt-'+id,faceReviewPath:id+'.json'}]}});
  }
  f.save();
  fs.writeFileSync(path.join(dir,'guide.png'),png);
  f.board.SCENES[1].referenceImage = 'guide.png';
  f.save();
  const plan=planVideo({episode:f.episode,sceneNo:1,requestId:'three-originals'},false);
  const shots = plan.args.prompt.split('Then cut directly.');
  assert.equal(shots.length, 3);
  assert.match(shots[0], /ada[^"\n]*Audio 1[^"\n]*"Wait\."/);
  assert.doesNotMatch(shots[0], /"Go\."/);
  assert.match(shots[1], /bo[^"\n]*Audio 2[^"\n]*"Go\."/);
  assert.doesNotMatch(shots[1], /"Wait\."/);
  assert.match(shots[2], /cy[^"\n]*Audio 3[^"\n]*"Ready\."/);
  assert.doesNotMatch(plan.args.prompt, /Hold this view for about|\[\d+–\d+s\]/);
  assert.equal(plan.characterBindings.find(binding=>binding.role==='composition').shotId,'s2');
  assert.deepEqual(plan.args.referenceVideoTaskIds,speakers.map(id=>'cgt-'+id));
  assert.deepEqual(plan.args.referenceAudioPaths,speakers.map(id=>path.join(dir,id+'.wav')));
  assert.deepEqual(plan.args.referenceImagePaths.map(file=>path.basename(file)),['front.png','front.png','front.png','guide.png','opening.png']);
  assert.deepEqual(plan.characterBindings.filter(item=>item.role==='face').map(item=>[item.character,item.taskId]),speakers.map(id=>[id,'cgt-'+id]));
  const input={episode:f.episode,sceneNo:1,requestId:'changed-voices'};
  assert.throws(()=>planVideo({...input,operation:'audio'},false),/scene_speech_route/);
  f.board.SCENES[2].narration=[];
  f.board.STRUCTURE.scenes[0].speakers=speakers.slice(0,2);
  f.save();
  const listener=planVideo(input,false);
  assert.deepEqual(listener.args.referenceVideoTaskIds,plan.args.referenceVideoTaskIds);
  assert.deepEqual(listener.args.referenceAudioPaths,plan.args.referenceAudioPaths.slice(0,2));
  assert.ok(listener.characterBindings.some(binding=>binding.character==='cy' && binding.role==='front'));
  assert.doesNotMatch(listener.args.prompt,/"Ready\."/);
  const [first,second]=f.board.SB_DOC.characters;
  execFileSync('ffmpeg',['-y','-v','error','-f','lavfi','-i','anullsrc=r=16000:cl=mono','-t','0.005',second.voiceReference.path]);
  second.voiceReference.sha256=digest(fs.readFileSync(second.voiceReference.path));
  f.save();
  assert.throws(()=>planVideo(input,false),/scene_speech_references/);
  second.voiceReference={...first.voiceReference,tts:second.tts};
  f.save();
  assert.throws(()=>planVideo(input,false),/scene_speech_references/);
  delete f.board.STRUCTURE.scenes[0].frames.start;
  f.save();
  assert.throws(()=>planVideo(input,false),/scene_speech_opening/);
});
test('scene submission requires shot images and distinguishes soft references from temporal endpoints', t => {
  const f = fixture(t,{engine:'seedance',model:'dreamina-seedance-2-0-260128',resolution:'480p'});
  const dir = path.join(f.episode,'storyboard');
  const scene = {no:1,speakers:[],frames:{},videoDirection:{openingPositions:[],emotion:'The rider relaxes.',action:'The blue bike rounds a bend.'}};
  f.board.STRUCTURE = {scenes:[scene]};
  const input = {episode:f.episode,sceneNo:1,requestId:'whole-scene'};
  for (const [i,card] of f.board.SCENES.entries()) {
    card.scene = 1; card.duration = 2; card.shot = {size:'ms',angle:'eye',render:{mode:'generated_video'}};
    card.visual = {video:{promptSource:{action:i ? 'The wheels clear the bend.' : 'The rider grips the bars.'}}};
    card.referenceImage = 'guide'+i+'.png';
    if (i === 0) card.transition = 'dip'; // The incoming scene edit precedes the first frame of this request.
    execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c='+['blue','red'][i]+':s=320x320','-frames:v','1',path.join(dir,card.referenceImage)]);
  }
  f.save();
  assert.throws(()=>planVideo(input,false),/scene_speech_opening/);
  assert.throws(()=>planVideo({...input,shotId:'s2'}),/shotId/);
  scene.frames = {start:'guide1.png',end:'guide0.png'};
  f.board.SCENES[0].visual.frames = {mode:'first',start:'obsolete.png'};
  delete f.board.SCENES[0].referenceImage;
  delete f.board.SCENES[1].referenceImage;
  f.save();
  assert.throws(()=>planVideo(input,false), /shot_image_required:.*shot s2 has no shot image/);
  f.board.SCENES[1].referenceImage = 'corrupted.png';
  fs.writeFileSync(path.join(dir,'corrupted.png'),'not a picture');
  f.save();
  assert.throws(()=>planVideo(input,false), /shot_image_required:.*shot s2 has an unreadable shot image/);
  f.board.SCENES[1].referenceImage = 'later.png';
  fs.copyFileSync(path.join(dir,'guide0.png'),path.join(dir,'later.png'));
  f.save();
  const anchored = planVideo({...input,requestId:'anchored'},false);
  assert.equal(anchored.tool,'seedance_img2video');
  assert.deepEqual(anchored.sceneRequest.images.map(image=>[image.role,image.frame]),[['start',0],['end',95]]);
  const [guide] = anchored.sceneRequest.shotReferenceImages;
  assert.equal(guide.shotId,'s2');
  assert.equal(guide.submitted,false);
  assert.ok(guide.reason);
  f.board.SCENES[0].referenceImage = scene.frames.start;
  f.save();
  assert.deepEqual(planVideo(input,false).sceneRequest.shotReferenceImages.map(g=>g.shotId),['s2']);
  assert.equal(anchored.args.referenceImagePaths,undefined);
  for (const [index,id] of ['ada','bo','cy'].entries()) {
    const card = f.board.SCENES[index % 2];
    (card.narration ??= []).push({speaker:id,tts:'Hello.',delivery:index===2?'voiceover':'off_screen'});
  }
  scene.speakers=['ada','bo','cy']; f.save();
  const external=planVideo(input,false);
  assert.equal(external.tool,'seedance_img2video');
  assert.equal(external.voiceContinuity.strategy,'external_tts');
  assert.equal(external.args.referenceAudioPaths,undefined);
  assert.doesNotMatch(external.args.prompt,/Hello\./);
});

test('a voice-only phone caller counts as a scene speaker without a face or a blocking position', () => {
  const {projectSceneCast} = require('../../skills/_shared/scene-cast.js');
  const board = {SB_DOC:{characters:[{id:'caller',voiceOnly:true,panels:{face:'caller.png'}}]}};
  const scene = {no:9,speakers:['caller'],frames:{},videoDirection:{openingPositions:[]}};
  const card = {id:'call',narration:[{speaker:'caller',delivery:'off_screen',tts:'Hello.'}]};
  const projection = projectSceneCast(scene,[card],board,os.tmpdir(),'astra-genai');
  assert.deepEqual(projection.speakers,[]);
  assert.deepEqual(projection.members[0].narration,card.narration);
  scene.speakerReferences = [{character:'caller',path:'caller.png'}];
  assert.throws(()=>projectSceneCast(scene,[card],board,os.tmpdir(),'astra-genai'),/scene_reference_owner/);
});

test('audio conditioning reports an explicit speaker reference it cannot submit', () => {
  const {projectSceneCast} = require('../../skills/_shared/scene-cast.js');
  const board={SB_DOC:{characters:[{id:'rider'}]}};
  const scene={no:1,speakers:['rider'],frames:{},speakerReferences:[{character:'rider',path:'rider.png'}],
    videoDirection:{audio:{mode:'conditioning'},openingPositions:[{character:'rider',images:[1],position:'On the bike.'}]}};
  const card={id:'s1',narration:[{speaker:'rider',delivery:'on_screen',tts:'Wait.'}]};
  assert.throws(()=>projectSceneCast(scene,[card],board,os.tmpdir(),'astra-genai'),/scene_inputs_unsupported/);
  delete scene.speakerReferences;
  const projection=projectSceneCast(scene,[card],board,os.tmpdir(),'astra-genai');
  assert.deepEqual(projection.direction.openingPositions[0].images,[]);
});

test('per-shot rendering binds the visible cast and any off-screen speaker for that shot', () => {
  const {projectSceneCast} = require('../../skills/_shared/scene-cast.js');
  const characters = ['caller','rider'].map(id => ({id,panels:{face:id+'.png'}}));
  const scene = {no:1,speakers:['caller','rider'],frames:{},
    speakerReferences:characters.map(actor => ({character:actor.id,path:actor.panels.face}))};
  const cards = [
    {id:'greeting',visual:{character:['caller','rider']},narration:[{speaker:'rider',delivery:'on_screen',tts:'Hello.'}]},
    {id:'exit',visual:{character:['rider']},timeline:{openingPositions:[{character:'caller',images:[],position:'Off screen.'}]}},
    {id:'call',visual:{character:['rider']},narration:[{speaker:'caller',delivery:'off_screen',tts:'Wait.'}]},
    {id:'serve',visual:{character:['caller','rider']},timeline:{openingPositions:[{character:'rider',images:[],position:'Seated in the opening image.'}]},
      narration:[{speaker:'caller',delivery:'on_screen',tts:'Thank you.'}]},
    {id:'legacy',visual:{}},
  ];
  const refs = perShot => projectSceneCast(scene,cards,{SB_DOC:{characters}},os.tmpdir(),'astra-genai',false,perShot)
    .members.map(card => card.visual.references.map(ref => ref.character));
  const both = ['caller','rider'];
  assert.deepEqual(refs(true),[both,['rider'],both,['caller'],both]);
  assert.deepEqual(refs(false),[both,both,both,both,both]);
});

test('an optional guide cannot prevent silent distilled I2V when the background slot requires a subject', t => {
  const f=fixture(t,{engine:'astra-genai',model:'ltx-2.5-22b-distilled',resolution:'576x1024'});
  const [shot]=f.board.SCENES;
  f.board.SCENES=[shot]; shot.duration=5;
  const scene={no:1,speakers:[],frames:{start:'opening.png'},videoDirection:{openingPositions:[],emotion:'The dust settles.'}};
  f.board.STRUCTURE={scenes:[scene]};
  const dir=path.join(f.episode,'storyboard');
  fs.writeFileSync(path.join(dir,'opening.png'),png);
  fs.writeFileSync(path.join(dir,'guide.png'),png);
  const input={episode:f.episode,sceneNo:1,requestId:'silent-guide',args:{reserveUsd:0}};
  f.save();
  const original=planVideo(input,false);
  shot.referenceImage='guide.png'; f.save();
  const plan=planVideo(input,false);
  assert.deepEqual(plan.args,original.args);
  assert.deepEqual(plan.sceneRequest.images.map(image=>image.role),['start']);
  const [guide]=plan.sceneRequest.shotReferenceImages;
  assert.equal(guide.submitted,false);
  assert.match(guide.reason,/requires a separate subject/);
  assert.ok(plan.directionWarnings.some(message => message.startsWith('shot_reference_omitted: ' + guide.shotId)));
});

test('distilled I2V sends four silent subjects, one background and both endpoints, and refuses a fifth subject', async t => {
  const f=fixture(t,{engine:'astra-genai',model:'ltx-2.5-22b-distilled',resolution:'576x1024'});
  const directory=path.join(f.episode,'storyboard');
  execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','testsrc=size=64x64:rate=1',
    '-frames:v','8',path.join(directory,'source-%d.png')]);
  const uri=file=>'data:image/png;base64,'+fs.readFileSync(path.join(directory,file)).toString('base64');
  const characters=['ada','bo','cy','dan','eve'].map((id,i)=>({id,panels:{face:'source-'+(i+1)+'.png'}}));
  const [ada,bo,cy,dan,eve]=characters;
  const subject=actor=>({id:actor.id+'-face',role:'character',character:actor.id,path:actor.panels.face,
    use:'video',purpose:'Preserve the face of '+actor.id+'.'});
  const position=actor=>({character:actor.id,images:[],position:'Standing by the door.'});
  const frames={start:'source-6.png',end:'source-7.png'}, background='source-8.png';
  const scene={no:1,speakers:[],frames,speakerReferences:[ada,bo].map(actor=>({character:actor.id,path:actor.panels.face})),
    videoDirection:{openingPositions:characters.slice(0,4).map(position),emotion:'The visitors relax.'}};
  const shot={id:'s1',scene:1,duration:121/24,narration:[],visual:{character:characters.slice(0,4).map(actor=>actor.id),
    references:[subject(cy),{id:'hall',role:'background',path:background,use:'video',purpose:'Keep the tiled hall.'}]},
    timeline:{startFrame:0,endFrame:121,transition:'open',framing:'Wide shot.',action:'The visitors enter the hall.',
      images:[{frame:0,path:dan.panels.face,role:'face',character:dan.id}]}};
  f.board.SCENES=[shot];
  f.board.STRUCTURE={scenes:[scene]};
  f.board.SB_DOC={characters};
  f.save();
  const key=config.astraGenaiApiKey;
  config.astraGenaiApiKey='fixture';
  t.after(()=>{config.astraGenaiApiKey=key;});
  const posts=[];
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    const endpoint=new URL(url).pathname;
    if (endpoint==='/v1/ltx/msr/capabilities')
      return Response.json({msr:true,image_conditioning:true,voice_references:true});
    if (endpoint==='/v1/models')
      return Response.json({data:[{id:'ltx-2.5-22b-distilled',parameters_by_mode:{image2video:['num_frames']}}]});
    if (endpoint==='/v1/uploads') return Response.json({error:'No upload route'},{status:404});
    assert.equal(endpoint,'/v1/ltx/v2/image-to-video');
    assert.equal(options.method,'POST');
    posts.push(JSON.parse(options.body));
    return Response.json({error:'Fixture stopped after capture'},{status:422});
  });
  const input={episode:f.episode,sceneNo:1,requestId:'crowd',args:{reserveUsd:0}};
  const planned=await ROUTES.video_plan(input), plan=JSON.parse(planned.content[0].text);
  assert.equal(plan.tool,'astra_genai_img2video');
  await assert.rejects(ROUTES.video_execute({episode:f.episode,planId:plan.id}),error=>error.httpStatus===422);
  assert.equal(posts.length,1);
  const [body]=posts;
  assert.equal(body.image_uri,uri(frames.start));
  assert.equal(body.last_frame_uri,uri(frames.end));
  assert.equal(body.references.length,5);
  assert.deepEqual(body.references.filter(ref=>ref.background),[{background:true,image_uri:uri(background)}]);
  for (const actor of [ada,bo,cy,dan]) {
    const [slot]=plan.args.openingPositions.find(row=>row.character===actor.id).images;
    assert.deepEqual(body.references[slot-1],{background:false,image_uri:uri(actor.panels.face)});
    assert.ok(body.prompt.includes(actor.id+' (Image '+slot+')'));
  }
  shot.visual.character.push(eve.id);
  shot.visual.references.push(subject(eve));
  scene.videoDirection.openingPositions.push(position(eve));
  f.save();
  assert.throws(()=>planVideo(input),error=>error.missing?.some(issue=>issue.input==='reference' &&
    issue.path===path.join(directory,eve.panels.face) && issue.shotId===shot.id && issue.frame===0 && /4 subject/.test(issue.reason)));
  assert.deepEqual(fs.readdirSync(path.join(f.episode,'.work/video-routing/plans')),[plan.id+'.json']);
});

test('a scene dip and two fractional shot lengths still fit exactly 113 frames', t => {
  const f = fixture(t, {engine:'astra-genai', model:'ltx-2.5-22b-distilled', resolution:'576x1024'});
  f.board.STRUCTURE = {scenes:[{no:1, speakers:[], frames:{start:'opening.png'},
    videoDirection:{fps:24, openingPositions:[], emotion:'The cart picks up speed.'}}]};
  fs.writeFileSync(path.join(f.episode, 'storyboard', 'opening.png'), png);
  for (const [i, card] of f.board.SCENES.entries()) {
    Object.assign(card, {id:i ? 's0002' : 's0001', scene:1, duration:[56,57][i]/24, transition:i ? 'cut' : 'dip',
      narration:[], shot:{size:i ? 'insert' : 'ms', angle:'eye'},
      visual:{action:i ? 'The wheel hits the curb.' : 'The cart rolls.'}});
  }
  f.save();
  const plan = planVideo({episode:f.episode, sceneNo:1, requestId:'fractional-coverage', args:{reserveUsd:0}}, false);
  assert.equal(plan.args.numFrames, 113);
  assert.equal(plan.sceneRequest.modelPacedCuts, true);
  assert.ok(plan.directionWarnings.some(warning => warning.startsWith('scene_cut_timing_model_paced:')));
  assert.deepEqual(plan.sceneRequest.cuts.map(cut => [cut.frame,cut.transition]), [[56,'hard_cut']]);
  assert.match(plan.args.prompt, /The cart rolls\.[\s\S]*Then cut directly\.[\s\S]*The wheel hits the curb\./);
  assert.doesNotMatch(plan.args.prompt, /s\d{4}|Frame numbers start|Scene at \d+ fps|At \d+(?:\.\d+)? seconds/);
  assert.deepEqual(plan.sceneRequest.shotIds, f.board.SCENES.map(card => card.id));
});

test('intermediate action states travel in one scene video request', t => {
  const f = fixture(t, {engine:'astra-genai', model:'ltx-2.5-22b-distilled', resolution:'576x1024'});
  const frames = {start:'opening.png', end:'ending.png'};
  const direction = {openingPositions:[], emotion:'The load slips.', keyframes:[{frame:63,path:'release.png',strength:0.8}]};
  const directory = path.join(f.episode, 'storyboard');
  for (const name of [frames.start,frames.end,'release.png']) fs.writeFileSync(path.join(directory,name),png);
  f.board.STRUCTURE = {scenes:[{no:1,speakers:[],frames,videoDirection:direction}]};
  for (const [i,card] of f.board.SCENES.entries()) {
    Object.assign(card,{id:'shot'+i,scene:1,duration:[56,57][i]/24,transition:'cut',narration:[],
      shot:{size:'ms',angle:'eye'},visual:{action:i ? 'The rail leaves her hands.' : 'She grips the rail.'}});
  }
  const plan = () => planVideo({episode:f.episode,sceneNo:1,requestId:'action-states',args:{reserveUsd:0}},false);
  f.save();
  const take = plan();
  const body = buildGenaiVideoBody(take.args);
  assert.equal(take.sceneRendering,undefined);
  assert.equal(take.sceneRequest.modelPacedCuts,true);
  assert.equal(body.num_frames,113);
  assert.ok(body.image_uri && body.last_frame_uri);
  assert.deepEqual(body.keyframes,[{frame_idx:63,strength:0.8,image_uri:'data:image/png;base64,'+png.toString('base64')}]);
  assert.ok(take.inputs[path.join(directory,'release.png')]);
  direction.keyframes[0].frame=113;
  f.save();
  assert.throws(plan,/scene_image_timing/);
});

test('scene prompt uses a cast name without changing quoted speech or doubling the opening', () => {
  const positions = [{character:'ep13-linh',images:[1],position:'On the right.'}];
  const line = 'ep13-linh says "ep13-linh" to her friend.';
  const spoken = sceneCastProse(openingPrompt(line,positions),positions,[{speaker:'ep13-linh',name:'Linh'}]);
  assert.equal(openingPrompt(spoken.prompt,spoken.positions),spoken.prompt);
  assert.match(spoken.prompt,/Linh \(Image 1\): On the right/);
  assert.ok(spoken.prompt.endsWith('Linh says "ep13-linh" to her friend.'));
});

test('model-paced MSR scenes keep bound dialogue inside the corresponding shot', async t => {
  const oldKey = config.astraGenaiApiKey;
  config.astraGenaiApiKey = 'fixture';
  t.after(() => { config.astraGenaiApiKey = oldKey; });
  t.mock.method(globalThis,'fetch',async () => Response.json({msr:true,voice_references:true}));
  await refreshGenaiMsrVoice(true);
  const f = fixture(t, {engine:'astra-genai',model:'ltx-2.5-22b-distilled',resolution:'576x1024'});
  const dir = path.join(f.episode,'storyboard');
  const tts = {engine:'gemini',voiceId:'Kore',language:'vi',speed:1};
  const wav = path.join(dir,'speaker.wav');
  execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','sine=400:duration=1',wav]);
  for (const file of ['opening.png','face.png']) fs.writeFileSync(path.join(dir,file),png);
  f.board.SB_DOC = {characters:[{id:'speaker',name:'Rowan',tts,voiceReference:{path:wav,tts,sha256:digest(fs.readFileSync(wav)),imagePaths:[path.join(dir,'face.png')]}}]};
  f.board.STRUCTURE = {scenes:[{no:1,speakers:['speaker'],frames:{start:'opening.png'},
    speakerReferences:[{character:'speaker',path:'face.png'}],videoDirection:{emotion:'Hope.',openingPositions:[{character:'speaker',images:[1],position:'On the right.'}]}}]};
  const words = ['Will you marry me?', '', "It costs $&."];
  f.board.SCENES = words.map((line,i) => ({id:'card'+i,scene:1,duration:[56,32,25][i]/24,
    shot:{size:'ms',angle:'eye'},visual:{action:['She proposes.','The listener lets go.','She opens the door.'][i]},
    narration:line?[{id:'line'+i,speaker:'speaker',delivery:'on_screen',tts:line}]:[]}));
  // Repeated words still belong to two distinct people in the correct shots.
  fs.writeFileSync(path.join(dir,'second.png'),png);
  const secondVoice = path.join(dir,'second.wav');
  execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','sine=600:duration=1',secondVoice]);
  f.board.SB_DOC.characters.push({id:'guest',name:'Guest',tts,voiceReference:{path:secondVoice,tts,sha256:digest(fs.readFileSync(secondVoice)),imagePaths:[path.join(dir,'second.png')]}});
  const scene = f.board.STRUCTURE.scenes[0];
  scene.speakers.push('guest');
  scene.speakerReferences.push({character:'guest',path:'second.png'});
  scene.videoDirection.openingPositions.push({character:'guest',images:[2],position:'On the left.'});
  f.board.SCENES[2].narration[0].speaker='guest';
  f.save();
  const plan = planVideo({episode:f.episode,sceneNo:1,requestId:'native-turn-placement',args:{reserveUsd:0}},false);
  const {prompt} = buildGenaiVideoBody(plan.args);
  const [opening,reaction,ending] = prompt.split('Then cut directly.');
  assert.ok(opening.includes('speaker (Image 1, Audio 1): "'+words[0]+'"'),opening);
  assert.doesNotMatch(reaction,/marry|costs/);
  assert.ok(ending.includes('guest (Image 2, Audio 2): "'+words[2]+'"'));
  assert.equal(prompt.split(words[0]).length,2);
  assert.equal(prompt.split(words[2]).length,2);
  assert.match(opening,/Hold this view for about 2.33 seconds/);
  assert.match(opening,/Only the named on-screen speaker/);
  assert.match(reaction,/No foreground dialogue/);
  f.board.SCENES[2].narration[0].delivery = 'off_screen';
  f.save();
  const next = planVideo({episode:f.episode,sceneNo:1,requestId:'phone',args:{reserveUsd:0}},false);
  const call = buildGenaiVideoBody(next.args).prompt.split('Then cut directly.').at(-1);
  assert.ok(call.includes('The voice stays off screen. Visible mouths stay closed.'));
  assert.ok(call.includes('Audio 2, off screen): "'+words[2]+'"'));

  Object.assign(f.board.SCENES[2].narration[0],{speaker:'guest',delivery:'on_screen',tts:words[0]});
  f.save();
  const second = planVideo({episode:f.episode,sceneNo:1,requestId:'echo',args:{reserveUsd:0}},false);
  const echo = buildGenaiVideoBody(second.args).prompt.split('Then cut directly.');
  assert.ok(echo[0].includes('speaker (Image 1, Audio 1): "'+words[0]+'"'));
  assert.ok(echo[2].includes('guest (Image 2, Audio 2): "'+words[0]+'"'));
  f.board.SCENES[2].narration.push({id:'phone',speaker:'speaker',delivery:'off_screen',tts:'Come in.'});
  f.save();
  const mixed = planVideo({episode:f.episode,sceneNo:1,requestId:'offscreen-reply',args:{reserveUsd:0}},false);
  const lastShot = mixed.args.prompt.split('Then cut directly.').at(-1);
  assert.match(lastShot,/Visible mouths stay still for off-screen voices/);
  assert.ok(lastShot.indexOf('guest (Image 2, Audio 2)') < lastShot.indexOf('speaker (Image 1, Audio 1, off screen)'));
  f.board.SCENES[2].narration.pop();
  // A nearly full prompt drops optional pacing prose before sacrificing either bound quote.
  const padding = 'The lane is wet. '.repeat(Math.max(0,Math.floor((2050-second.args.prompt.length)/17)));
  f.board.SCENES[0].visual.action += ' ' + padding;
  f.save();
  const compact = planVideo({episode:f.episode,sceneNo:1,requestId:'tight-budget',args:{reserveUsd:0}},false);
  assert.doesNotMatch(compact.args.prompt,/Hold this view for about/);
  assert.equal(compact.args.prompt.split(words[0]).length,3);
  assert.ok(compact.args.prompt.length <= 2000);

});

test('an authored scene prompt names its references and takes the numbers of the submitted request',async t=>{
 const f=await pinnedSpeakerScene(t,'reference');
 const input={episode:f.episode,sceneNo:1,requestId:'authored',args:{reserveUsd:0}};
 const compiled=planVideo(input,false);
 // The returned template is the submitted prompt with names for numbers, so sending it back changes nothing.
 assert.match(compiled.promptTemplate,/\{hero\.face\}.*\{guest\.voice\}/s);
 assert.doesNotMatch(compiled.promptTemplate,/Image \d|Audio \d|Opening frame/);
 assert.ok(compiled.args.prompt.startsWith(compiled.promptHeader));
 const again=planVideo({...input,prompt:compiled.promptTemplate},false);
 assert.equal(again.args.prompt,compiled.args.prompt);
 assert.equal(again.promptIssues,undefined);
 // The author's sentences go out as written; only the names change, after the opening positions this lane always states.
 const own='{hero.face} waits by the left door and says with {hero.voice}, "You came." {guest.image} answers with {guest.voice}, "I stayed."';
 const authored=planVideo({...input,prompt:own});
 assert.equal(authored.args.prompt,compiled.promptHeader+'Image 1 waits by the left door and says with Audio 1, "You came." Image 2 answers with Audio 2, "I stayed."');
 assert.deepEqual(authored.promptIssues.map(issue=>issue.code).sort(),['reference_unmentioned','text_policy_missing']);
 assert.equal(authored.sceneRequest.prompt,authored.args.prompt);
 // The names follow the request itself: the picture's place in the list and the sample riding on it.
 const [guest]=authored.args.references.flatMap((ref,i)=>path.basename(ref.imagePath)==='guest.png'?[{image:i+1,audio:path.basename(ref.audioPath)}]:[]);
 assert.deepEqual(guest,{image:2,audio:'guest.wav'});
 assert.deepEqual(authored.voiceContinuity.speakers.find(s=>s.speaker==='guest').imageIndices,[2]);
 // A saved plan keeps the author's text, so a later rebuild resolves it again.
 const saved=JSON.parse(fs.readFileSync(path.join(f.episode,'.work/video-routing/plans',authored.id+'.json'),'utf8'));
 assert.equal(saved.authoredPrompt,own);
 assert.equal(saved.promptTemplate,undefined);
 let sent;
 await f.execute(authored,async(tool,args)=>{sent=args.prompt;return result;});
 assert.equal(sent,authored.args.prompt);
 // The author can retrieve the original edit. Approval uses the adapter's canonical bytes.
 const spaced=' \n'+own.replace(' waits','  waits\n')+'  \n';
 const normalized=planVideo({...input,prompt:spaced},false);
 assert.equal(normalized.authoredPrompt,spaced);
 assert.ok(normalized.promptIssues.some(issue => issue.code === 'prompt_whitespace_normalized'));
 assert.equal(normalized.args.prompt,compiled.promptHeader+authored.args.prompt.slice(compiled.promptHeader.length).replace(' waits','  waits\n'));
 assert.equal(buildGenaiMsrBody(genaiMsrSchema.parse(normalized.args)).prompt,normalized.sceneRequest.prompt);
 assert.throws(()=>planVideo({...input,prompt:' \n '},false),/^Error: scene_prompt_empty: /);
 assert.throws(()=>planVideo({...input,prompt:'{friend.face} speaks.'},false),/placeholder_unresolved: \{friend\.face\}/);
 assert.throws(()=>planVideo({...input,prompt:own+' {sigh}'},false),/placeholder_unresolved: \{sigh\} is not a reference name/);
 assert.throws(()=>planVideo({...input,prompt:own+' '+'x'.repeat(9000)},false),/prompt_too_long: \d+ characters with the \d+-character opening header/);
 assert.throws(()=>planVideo({...input,prompt:own+' 문이 열린다.'},false),/video_prompt_language/);
 assert.throws(()=>planVideo({...input,prompt:own,sceneRendering:'per_shot'},false),/scene_prompt_unsupported/);
 assert.throws(()=>planVideo({...input,args:{reserveUsd:0,prompt:own}},false),/scene_video_prompt/);
 // A spoken line with braces or a number in it is the board's text: the template keeps it and the round trip holds.
 f.board.SCENES[0].narration[0].tts='{a} Image 1';f.save();
 const braced=planVideo(input,false);
 assert.ok(braced.promptTemplate.includes('"{a} Image 1"'));
 const back=planVideo({...input,prompt:braced.promptTemplate},false);
 assert.deepEqual([back.args.prompt,back.promptIssues],[braced.args.prompt,undefined]);
 // A scene without direction takes an authored prompt the same way; the silent-picture sentence it leaves out is reported.
 const plain=fixture(t);
 const quiet=planVideo({episode:plain.episode,sceneNo:1,requestId:'quiet',operation:'image',args:{durationSeconds:8},prompt:'A calm street at dawn.'},false);
 assert.equal(quiet.args.prompt,'A calm street at dawn.');
 assert.deepEqual(quiet.promptIssues.map(issue=>issue.code),['silent_direction_missing']);
});

test('storyboard edits are scoped to the selected scene model and operation', async t => {
  const f = await pinnedSpeakerScene(t,'reference');
  const input = {episode:f.episode, sceneNo:1, requestId:'whole-storyboard', wholeScene:true, args:{reserveUsd:0}};
  const preview = planVideo(input, false);
  const owner = f.board.STRUCTURE.scenes[0].videoDirection;
  const draft = {engine:preview.selection.engine, model:preview.selection.model, operation:'reference',
    prompt:preview.promptTemplate + '\nHold on the brass key.'};
  const other = {...draft, model:'other-model', prompt:'Other approved scene.'};
  owner.promptDrafts = [other];
  f.save();
  assert.equal(planVideo(input, false).args.prompt, preview.args.prompt);
  owner.promptDrafts.push(draft);
  f.save();
  const saved = planVideo(input);
  assert.equal(saved.wholeScene, true);
  assert.equal(saved.shotIds.length, 2);
  assert.equal(saved.sceneRendering, undefined);
  assert.equal(saved.sceneRequest.prompt, saved.args.prompt);
  assert.ok(saved.args.prompt.endsWith('Hold on the brass key.'));
  assert.equal(saved.authoredPrompt, draft.prompt);
  const submissions = [];
  const dispatch = async (tool, args) => {
    submissions.push({tool, prompt:args.prompt});
    return result;
  };
  await f.execute(saved, dispatch);
  assert.deepEqual(submissions, [{tool:saved.tool, prompt:saved.args.prompt}]);
  assert.throws(() => planVideo({...input,prompt:draft.prompt.replace('You came.','Wrong line.')}, false), /scene_dialogue_mismatch/);
  assert.throws(() => planVideo({...input,prompt:draft.prompt + ' {missing.face}'}, false), /placeholder_unresolved/);
  assert.throws(() => planVideo({...input,prompt:'{guest.face} with {guest.voice}: "You came." {hero.face} with {hero.voice}: "I stayed."'}, false), /scene_dialogue_speaker/);
  for (const changed of [
    '{guest.face} speaks with {guest.voice}, "You came." {hero.face} answers with {hero.voice}, "I stayed."',
    '{guest.face} speaks with {hero.voice}: "You came." {guest.face} answers with {guest.voice}: "I stayed."',
    'Guest says, "You came." Hero answers, "I stayed."',
  ]) assert.throws(() => planVideo({...input,prompt:changed},false), /scene_dialogue_speaker/);
  assert.throws(() => planVideo({...input,prompt:draft.prompt + ' Hero says, "Extra."'},false), /scene_dialogue_mismatch/);
  assert.throws(() => planVideo({...input,prompt:draft.prompt + ' Match Audio 99 and Image 88.'},false), /reference_unknown/);
  assert.throws(() => planVideo({...input,prompt:draft.prompt + ' Match Image 1.'},false), /label_literal/);
  const padded = planVideo({...input,prompt:draft.prompt + '  '},false);
  assert.equal(buildGenaiMsrBody(genaiMsrSchema.parse(padded.args)).prompt, padded.sceneRequest.prompt);
  const sameTurns = 'Hero looks at Guest and asks, “You came.” Guest replies to Hero, “I stayed.”';
  assert.ok(planVideo({...input,prompt:sameTurns}, false).args.prompt.endsWith(sameTurns));
  assert.throws(() => planVideo({...input,prompt:'Use {guest.voice} for Hero in {hero.face}. Use {hero.voice} for Guest in {guest.face}. ' + sameTurns},false), /scene_dialogue_speaker/);
  for (const extra of ["Guest whispers, ‘Come inside.’", "Guest adds: Come inside.", "Guest says, 'Come inside.'"])
    assert.throws(() => planVideo({...input,prompt:sameTurns + ' ' + extra},false), /scene_dialogue_mismatch/);
  assert.equal(owner.promptDrafts[0].prompt, 'Other approved scene.');
  for (const cue of ["Hero speaks in Guest's voice.", "Use {guest.face} for Hero's face.", "Guest says goodbye."])
    assert.throws(() => planVideo({...input,prompt:preview.promptTemplate + '\n' + cue},false), /scene_dialogue_/);
  const blocking = "Use a wide shot of Hero and Guest. Hero is standing behind Guest. Hero watches Guest's face.";
  assert.ok(planVideo({...input,prompt:blocking + ' ' + sameTurns},false).args.prompt.includes(blocking));
  const addressed = sameTurns.replace('Hero looks at Guest and asks,','Hero reassures Guest, using {hero.voice}:');
  assert.ok(planVideo({...input,prompt:addressed},false).args.prompt.includes('Hero reassures Guest, using Audio 1:'));
  const nested = 'Did he say "wait here by Image 1"?';
  f.board.SCENES[0].narration[0].tts = nested;
  delete owner.promptDrafts;
  f.save();
  const nestedPreview = planVideo(input,false);
  const nestedEdit = planVideo({...input,prompt:nestedPreview.promptTemplate},false);
  assert.ok(nestedEdit.args.prompt.includes(nested));
  assert.equal(buildGenaiMsrBody(genaiMsrSchema.parse(nestedEdit.args)).prompt,nestedPreview.args.prompt);
});

test('a shot image sent as a timed frame has no name in the prompt',async t=>{
 const f=await pinnedSpeakerScene(t,'image',['hero']);
 const input={episode:f.episode,sceneNo:1,requestId:'pin',args:{reserveUsd:0}};
 const compiled=planVideo(input,false);
 assert.equal(compiled.tool,'astra_genai_img2video');
 assert.throws(()=>planVideo({...input,prompt:'{hero.face} speaks with {hero.voice}: "You came." Open on {s1.image}.'},false),/placeholder_unlabeled: \{s1\.image\}/);
 const own=planVideo({...input,prompt:'{hero.face} speaks with {hero.voice}: "You came."'},false);
 assert.equal(buildGenaiVideoBody(own.args).prompt,compiled.promptHeader+'Image 1 speaks with Audio 1: "You came."');
 assert.equal(buildGenaiVideoBody(planVideo({...input,prompt:compiled.promptTemplate},false).args).prompt,buildGenaiVideoBody(compiled.args).prompt);
});
test('the same authored names take picture and audio tags on the H3 reference lane',async t=>{
 // The transport is injected. Its configuration must be independent of the host's installed apps.
 const priorUrl = process.env.MLX_SERVE_URL;
 process.env.MLX_SERVE_URL = 'http://127.0.0.1:1';
 t.after(() => { if (priorUrl === undefined) delete process.env.MLX_SERVE_URL; else process.env.MLX_SERVE_URL = priorUrl; });
 const f=await pinnedSpeakerScene(t,'reference',['hero','guest'],{engine:'mlx',model:'ddalcu/FastH3-Omni-MLX-Serve-8bit'},[62,62],2);
 const input={episode:f.episode,sceneNo:1,requestId:'h3',args:{}};
 const compiled=planVideo(input,false);
 const motion = path.join(f.episode,'storyboard','motion-with-audio.mp4');
 execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=s=64x64:r=12','-f','lavfi','-i','sine=frequency=330',
   '-t','2','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',motion]);
 f.board.STRUCTURE.scenes[0].videoDirection.motionReferencePaths = [path.basename(motion)];
 f.save();
 const shifted = planVideo({...input,wholeScene:true,args:{trimReferenceVideos:true}},false);
 const voiceMap = shifted.voiceContinuity.speakers.map(s => [s.speaker, s.audioIndex]);
 assert.deepEqual(voiceMap, [['hero',2],['guest',3]]);
 const rebound = planVideo({...input,wholeScene:true,prompt:shifted.promptTemplate,args:{trimReferenceVideos:true}},false);
 assert.equal(rebound.args.prompt,shifted.args.prompt);
 const clips = f.board.STRUCTURE.scenes[0].videoDirection;
 const dolly = path.join(path.dirname(motion),'dolly.mp4');
 fs.copyFileSync(motion,dolly);
 clips.motionReferencePaths.push('dolly.mp4');
 const edit = shifted.promptTemplate + '\nFollow {motion-with-audio.motion}. Match {motion-with-audio.soundtrack}.';
 clips.promptDrafts = [{...compiled.selection,operation:'reference',prompt:edit}];
 f.save();
 const options = {...input,wholeScene:true,args:{trimReferenceVideos:true}};
 assert.match(planVideo(options,false).args.prompt,/Follow <Video 1>. Match <Audio 1>/);
 clips.motionReferencePaths.reverse();
 f.save();
 const reordered = planVideo(options);
 assert.match(reordered.args.prompt,/Follow <Video 2>. Match <Audio 2>/);
 assert.equal(reordered.args.referenceVideoPaths[1],motion);
 for (const direction of ['Track {dolly.motion} and its {motion-with-audio.soundtrack}.',
   'Track {dolly.motion} and  its {motion-with-audio.soundtrack}.',
   'Track {motion-with-audio.soundtrack} AND ITS {dolly.motion}.']) {
   assert.throws(() => planVideo({...options,prompt:edit + '\n' + direction},false),/scene_media_owner/);
 }
 assert.throws(() => planVideo({...options,prompt:edit + '\nFollow the camera movement in {dolly.soundtrack}.'},false),/scene_media_type/);
 const paired = planVideo({...options,prompt:edit + '\nTrack {motion-with-audio.soundtrack} and  its {motion-with-audio.motion}.'},false);
 assert.ok(paired.args.prompt.endsWith('Track <Audio 2> and  its <Video 2>.'));
 let submitted;
 await f.execute(reordered,async (_tool,args) => {submitted=args; return result;});
 assert.equal(submitted.prompt, reordered.sceneRequest.prompt);
 assert.deepEqual(submitted.referenceVideoPaths,reordered.args.referenceVideoPaths);
 assert.ok(reordered.promptSlots.some(slot => slot.key === 'dolly.motion' && slot.label === '<Video 1>'));
 assert.throws(() => planVideo({...options,prompt:edit + ' Follow <Video 1>.'},false), /label_literal/);
 delete clips.promptDrafts;
 delete f.board.STRUCTURE.scenes[0].videoDirection.motionReferencePaths;
 f.save();
 assert.equal(compiled.tool,'fasth3_omni_reference');
 assert.doesNotMatch(compiled.promptTemplate,/<(Picture|Audio) \d+>/);
 assert.equal(planVideo({...input,prompt:compiled.promptTemplate},false).args.prompt,compiled.args.prompt);
 const authored=planVideo({...input,prompt:'{hero.face} speaks with {hero.voice}: "You came." {guest.face} replies with {guest.voice}: "I stayed." Match {s1.image}.'},false);
 assert.match(authored.args.prompt,/^<Picture 1> speaks with <Audio 1>: "You came\." <Picture 2> replies with <Audio 2>: "I stayed\." Match <Picture \d>\.$/);
});

test('Seedance scene previews bind local motion to the selected model dialect', async t => {
  for (const [model,prefix] of [['dreamina-seedance-2-0-260128',''],['dreamina-seedance-2-5-flash-261115','@']]) {
    await t.test(model, async t => {
      const f = await pinnedSpeakerScene(t,'reference',['hero','guest'],{engine:'seedance',model,resolution:'720p'},[60,60],3);
      for (const card of f.board.SCENES) {
        const character = card.narration[0].speaker;
        const sheet = path.join(f.root,'assets/characters',character);
        fs.mkdirSync(sheet,{recursive:true});
        for (const view of ['face','front']) fs.copyFileSync(path.join(f.episode,'storyboard',character+'.png'),path.join(sheet,view+'.png'));
        fs.writeFileSync(path.join(sheet,'panels.json'),JSON.stringify({panels:{face:{file:'face.png'},front:{file:'front.png'}}}));
        registeredFace(t,sheet,'asset-'+character);
        f.board.SB_DOC.characters.find(person => person.id === character).voiceReference.imagePaths = [path.join(sheet,'face.png')];
        card.visual.character = character;
        card.visual.characterInputs = [{character,bodyView:'front'}];
      }
      delete f.board.STRUCTURE.scenes[0].speakerReferences;
      writeTinyMp4(path.join(f.episode,'storyboard'),'pan.mp4',3);
      f.board.STRUCTURE.scenes[0].videoDirection.motionReferencePaths = ['pan.mp4'];
      f.save();
      const input = {episode:f.episode, sceneNo:1, requestId:'scene-dialect', wholeScene:true};
      const preview = planVideo(input,false);
      for (const [key,label] of [['hero.face','Image 1'],['guest.voice','Audio 2'],['pan.motion','Video 1']])
        assert.ok(preview.promptSlots.some(slot => slot.key === key && slot.label === prefix + label),key);
      assert.ok(preview.promptTemplate.includes('{pan.motion}'));
      assert.equal(planVideo({...input,prompt:preview.promptTemplate},false).args.prompt,preview.args.prompt);
    });
  }
});

test('a stored cast declaration cannot silently reverse the submitted face bindings', async t => {
  const f=await pinnedSpeakerScene(t,'reference');
  const dir=path.join(f.episode,'storyboard');
  const characters=['hero','guest'].map(id=>{
    const sheet=path.join(f.root,'assets','characters',id);
    fs.mkdirSync(sheet,{recursive:true});fs.writeFileSync(path.join(sheet,'identity.md'),'# '+id);
    const panels={};
    for(const k of ['face','front','back']) {fs.copyFileSync(path.join(dir,id+'.png'),path.join(sheet,k+'.png'));panels[k]={file:k+'.png'};}
    fs.writeFileSync(path.join(sheet,'panels.json'),JSON.stringify({panels}));
    return {id,source:path.relative(dir,path.join(sheet,'identity.md'))};
  });
  fs.writeFileSync(path.join(dir,'cast.json'),JSON.stringify({characters}));
  f.board.STRUCTURE.version='structure-v1';
  f.board.STRUCTURE.sequences=[{id:'q1',title:'The visitor',purpose:'A reunion',scenes:[1]}];
  f.board.SCENES.forEach((s,i)=>{s.id='s000'+(i+1);s.summary=s.visual.action;s.type='hooking';s.visual.character=s.narration[0].speaker;});
  f.save();
  const input={episode:f.episode,sceneNo:1,wholeScene:true,args:{reserveUsd:0}};
  const get=async id=>JSON.parse((await ROUTES.video_plan({...input,requestId:id})).content[0].text);
  const original = await get('opening');
  const wire = buildGenaiMsrBody(genaiMsrSchema.parse(original.args));
  assert.equal(wire.prompt,original.sceneRequest.prompt);
  assert.deepEqual(original.args.references.slice(0,2).map(ref => path.basename(ref.imagePath)),['hero.png','guest.png']);
  const swapped = original.promptTemplate.replace('{hero.face}: character, hero','{guest.face}: character, hero')
    .replace('{guest.face}: character, guest','{hero.face}: character, guest');
  assert.notEqual(swapped,original.promptTemplate);
  const scene = f.board.STRUCTURE.scenes[0];
  async function saveDraft(prompt) {
    const draft = {engine:original.selection.engine,model:original.selection.model,operation:'reference',prompt};
    const stored = await ROUTES.story_scene({path:dir,scenes:[{...scene,sequence:'q1',place:'Doorway',time:'Night',
      event:'The guest returns',summary:'The guest comes home.',videoDirection:{...scene.videoDirection,promptDrafts:[draft]}}]});
    assert.ok(!stored.isError);
  }
  const edit = text => original.promptTemplate + '\n' + text;
  for (const [invalid,reason] of [
    [swapped,/scene_dialogue_speaker/],
    [edit('Hero ({guest.face}) waits by the door. Guest ({hero.face}) stands beside the lamp.'),/scene_dialogue_speaker/],
    [edit('Hero — {guest.face}\nGuest — {hero.face}'),/scene_dialogue_speaker/],
    [edit('Hero:\n{guest.face} waits by the door.'),/scene_dialogue_speaker/],
    [edit('Hero takes on Guest’s voice throughout.'),/scene_dialogue_speaker/],
    [edit('The actor in {guest.face} delivers the first spoken line. The actor in {hero.face} delivers the second spoken line.'),/scene_dialogue_mismatch/],
    [edit('Give line two to Hero. The opening words belong to Guest.'),/scene_dialogue_mismatch/],
    [edit('Guest mouths Hero’s words. Hero recites Guest’s lines.'),/scene_dialogue_mismatch/],
    [edit('Switch the faces of Hero and Guest for every shot.'),/scene_dialogue_speaker/],
    [edit('Cast Hero as Guest and Guest as Hero throughout.'),/scene_dialogue_speaker/],
    [edit('Hero is played by Guest. Guest is played by Hero.'),/scene_dialogue_speaker/],
    [edit('Hero plays the part of Guest.'),/scene_dialogue_speaker/],
    [edit("The first person delivers the second person's quotation."),/scene_direction_unverified/],
    [edit('Have the two people dub each other throughout the scene.'),/scene_direction_unverified/],
    [edit('Show the actors swapping voices.'),/scene_dialogue_speaker/],
    [edit('Show the two performers exchanging faces.'),/scene_dialogue_speaker/],
    [edit('Give all of Hero’s lines to Guest and all of Guest’s lines to Hero.'),/scene_dialogue_mismatch/],
    [original.promptTemplate.replace('hero ({hero.face}, {hero.voice}):','Hero (off screen):'),/scene_dialogue_speaker/],
    [edit('Exchange their roles.'),/scene_dialogue_speaker/],
    [edit('Hero plays Guest. Guest plays Hero.'),/scene_dialogue_speaker/],
    [edit('Reverse the dialogue order.'),/scene_dialogue_mismatch/],
    [original.promptTemplate.replace('hero ({hero.face}, {hero.voice}):','Hero waits, listening to Guest, who says:')
      .replace('guest ({guest.face}, {guest.voice}):','Guest turns to Hero, who replies:'),/scene_dialogue_speaker/],
  ]) {
    await saveDraft(invalid);
    await assert.rejects(get('refused'),reason);
  }
  const focus = 'Keep Hero’s face sharp as Guest steps back. Hero and Guest exchange a glance across the doorway. ' +
    'Hold on Guest after the first spoken line. Hold on Hero until Guest finishes her last line. Hero raises a hand to answer the door.';
  await saveDraft(edit(focus + ' Hero ({hero.face}) waits by the door.')
    .replace('hero ({hero.face}, {hero.voice}):','Hero says to Guest:')
    .replace('guest ({guest.face}, {guest.voice}):','Guest replies to Hero:'));
  const accepted = await get('focus');
  assert.equal(buildGenaiMsrBody(genaiMsrSchema.parse(accepted.args)).prompt,accepted.sceneRequest.prompt);
  assert.ok(accepted.args.prompt.endsWith(focus + ' Hero (Image 1) waits by the door.'));
});
