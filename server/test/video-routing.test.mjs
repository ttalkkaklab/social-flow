import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawn, execFileSync } from 'node:child_process';
import { planVideo, executeVideo, routeLegacyVideo, routingContext } from '../dist/video-routing.js';
import { VIDEO_ADAPTERS, videoCatalog } from '../dist/video-registry.js';
import { videoTransaction } from '../dist/video-state.js';
import { recordVideoSubmission, recordVideoTokens } from '../dist/video-events.js';
import { config } from '../dist/config.js';
import { ROUTES } from '../dist/handlers.js';
import { TOOLS } from '../dist/tools.js';
const require = createRequire(import.meta.url);
const settings = require('../../skills/_shared/model-settings.js');
const selection = { engine:'veo', model:'veo-3.1-fast-generate-preview', resolution:'720p' };
function fixture(t, video = selection, auth = {}) {
 const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'sf-router-')));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 settings.saveSettings(root,{video,speech:{engine:'gemini',model:'gemini-2.5-flash-preview-tts'},image:{engine:'host',model:'host-managed',host:'codex'}},{videoType:{id:'drama'},request:'Fixture selection'});
 const episode = path.join(root,'data/c/episodes/e'); fs.mkdirSync(path.join(episode,'storyboard'),{recursive:true});
 settings.snapshotSettings(root,episode);
 const board = {PRODUCTION:{videoAuthorization:{reference:'Explicit fixture spending instruction',maxUsd:10,maxConcurrent:3,maxAttempts:3,...auth}},SCENES:[{id:'s1',visual:{video:{...video}}},{id:'s2',visual:{video:{...video}}}]};
 const save = ()=>fs.writeFileSync(path.join(episode,'storyboard/scenes.js'),Object.entries(board).map(([k,v])=>'window.'+k+'='+JSON.stringify(v)+';').join('\n'));
 save();
 const old=config.geminiApiKey; config.geminiApiKey='fixture'; t.after(()=>{config.geminiApiKey=old;});
 const plan = (requestId='a',args={},shotId='s1')=>planVideo({episode,shotId,requestId,operation:'text',args:{prompt:'A boat crosses a lake.',durationSeconds:8,...args}});
 const execute = (p,dispatch)=>executeVideo({episode,planId:p.id},dispatch);
 const state=()=>JSON.parse(fs.readFileSync(path.join(episode,'.work/video-routing/state.json')));
 return {root,episode,board,save,plan,execute,state};
}
const result={content:[{type:'text',text:'fixture media'}]};
test('snapshot wins over current defaults; explicit shot replaces episode override', t=>{
 const f=fixture(t); const current=settings.readSettings(f.root);
 settings.saveSettings(f.root,{video:{...selection,model:'veo-3.1-generate-preview'}},{expectedRevision:current.revision,request:'Change future defaults'});
 assert.equal(f.plan().selection.model,selection.model);
 f.board.PRODUCTION.modelSettings={overrides:[{scope:'episode',request:'episode change',video:{...selection,model:'veo-3.1-generate-preview'}},{scope:'shot',shotId:'s1',request:'shot change',video:{...selection,model:'veo-3.1-lite-generate-preview'}}]};f.save();
 assert.equal(f.plan().source,'shot_override'); assert.equal(f.plan().selection.model,'veo-3.1-lite-generate-preview');
 assert.equal(f.plan('b',{},'s2').source,'episode_override');
});
test('plan validates selection, unsupported options, cross-field constraints and missing files before dispatch',t=>{
 const f=fixture(t);
 assert.throws(()=>f.plan('a',{model:'veo-3.1-generate-preview'}),/mismatch/);
 assert.throws(()=>f.plan('a',{resolution:'1080p'}),/mismatch/);
 assert.throws(()=>f.plan('a',{fakeOption:true}),/Unsupported/);
 assert.throws(()=>f.plan('a',{durationSeconds:5}),/Invalid/);
 assert.throws(()=>planVideo({episode:f.episode,shotId:'s1',requestId:'a',operation:'audio',args:{prompt:'x'}}),/no adapter/);
 assert.throws(()=>planVideo({episode:f.episode,shotId:'s1',requestId:'a',operation:'image',args:{prompt:'x',sourceImagePath:'missing.png'}}),/ENOENT/);
 assert.throws(()=>f.plan('a',{outputPath:os.tmpdir()}),/inside/);
});
test('completed request is reused and altered request ID payload is rejected',async t=>{
 const f=fixture(t); let calls=0; const dispatch=async()=>{calls++;recordVideoSubmission('op-1');return result;}; const p=f.plan();
 await f.execute(p,dispatch); await f.execute(p,dispatch); assert.equal(calls,1);
 assert.equal(f.state().jobs.a.providerId,'op-1'); assert.equal(f.state().jobs.a.status,'completed');
 await assert.rejects(f.execute(f.plan('a',{prompt:'Different'}),dispatch),/request_id_conflict/);
});
test('budget and attempts gate before dispatch and include prior successful reservations',async t=>{
 const f=fixture(t,selection,{maxUsd:1,maxAttempts:2});let calls=0;
 await f.execute(f.plan(),async()=>{calls++;return result;});
 await assert.rejects(f.execute(f.plan('b'),async()=>{calls++;return result;}),/budget/);assert.equal(calls,1);
 f.board.PRODUCTION.videoAuthorization.maxUsd=10;f.board.PRODUCTION.videoAuthorization.maxAttempts=1;f.save();
 await assert.rejects(f.execute(f.plan('c'),async()=>result),/attempt/);
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
test('disabled tool, missing key, changed input and changed authorization fail before execution',async t=>{
 const f=fixture(t);const p=f.plan();let calls=0;const dispatch=async()=>{calls++;return result;};
 process.env.SOCIAL_FLOW_TOOL_VEO_TEXT2VIDEO='off';
 try { await assert.rejects(f.execute(p,dispatch),/disabled/); } finally {delete process.env.SOCIAL_FLOW_TOOL_VEO_TEXT2VIDEO;}
 config.geminiApiKey='';await assert.rejects(f.execute(p,dispatch),/unconfigured/);config.geminiApiKey='fixture';
 f.board.PRODUCTION.videoAuthorization.maxUsd=9;f.save();await assert.rejects(f.execute(p,dispatch),/stale/);
 const image=path.join(f.episode,'image.png');fs.writeFileSync(image,'original');
 const q=planVideo({episode:f.episode,shotId:'s1',requestId:'i',operation:'image',args:{prompt:'x',sourceImagePath:image}});
 fs.writeFileSync(image,'changed');await assert.rejects(f.execute(q,dispatch),/stale/);assert.equal(calls,0);
});
test('configured legacy route requires context and explicit mismatch cannot bypass it',async t=>{
 const f=fixture(t); let calls=0;const dispatch=async()=>{calls++;return result;};
 await assert.rejects(routeLegacyVideo('veo_text2video',{prompt:'x',outputPath:f.episode},dispatch),/context_required/);
 await assert.rejects(routeLegacyVideo('seedance_text2video',{prompt:'x',videoContext:{episode:f.episode,shotId:'s1',requestId:'a'}},dispatch),/mismatch/);
 await routeLegacyVideo('veo_text2video',{prompt:'x',videoContext:{episode:f.episode,shotId:'s1',requestId:'a'}},dispatch);assert.equal(calls,1);
});
test('public MCP legacy handler validates context before reaching a real provider',async t=>{
 const f=fixture(t);
 await assert.rejects(ROUTES.seedance_text2video({prompt:'x',videoContext:{episode:f.episode,shotId:'s1',requestId:'a'}}),/mismatch/);
 for(const name of Object.keys(VIDEO_ADAPTERS)) assert.ok(TOOLS.find(t=>t.name===name)?.inputSchema.properties.videoContext,name);
 for(const name of ['video_catalog','video_plan','video_execute']) assert.ok(ROUTES[name]);
 assert.ok(videoCatalog().unimplemented.includes('ltx-official-api'));
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
 const f=fixture(t);f.board.SCENES[0].visual.video.model='veo-3.1-generate-preview';f.save();
 assert.equal(f.plan().selection.model,'veo-3.1-generate-preview');assert.equal(f.plan().source,'board_shot');
 assert.throws(()=>planVideo({episode:f.episode,shotId:'s1',requestId:'m',tool:'veo_text2video',operation:'image',args:{prompt:'x'}}),/disagree/);
});
test('provider tokens settle once; status exposes receipt and legacy events are not duplicated',async t=>{
 const f=fixture(t,{engine:'seedance',model:'dreamina-seedance-2-0-260128',resolution:'720p'});
 const old=config.arkApiKey;config.arkApiKey='fixture';t.after(()=>config.arkApiKey=old);
 const p=f.plan();const dispatch=async()=>{recordVideoSubmission('task-2');recordVideoTokens(10000);return result;};
 await f.execute(p,dispatch);await f.execute(p,dispatch);
 assert.equal(f.state().jobs.a.settledUsd,0.07);
 const status=JSON.parse((await ROUTES.video_status({episode:f.episode,requestId:'a'})).content[0].text);
 assert.equal(status.providerId,'task-2');assert.equal(status.status,'completed');
 assert.equal(fs.readFileSync(path.join(f.episode,'.work/events.jsonl'),'utf8').trim().split('\n').length,1);
});
test('historical events count toward the first reservation',async t=>{
 const f=fixture(t,selection,{maxUsd:1});
 fs.writeFileSync(path.join(f.episode,'.work/events.jsonl'),JSON.stringify({tool:'veo_text2video',key:'veo.fast.720p',quantity:8})+'\n');
 await assert.rejects(f.execute(f.plan(),async()=>{throw new Error('must not dispatch');}),/budget/);
});
test('managed speech rejects forged adapter capability claims before media generation',async t=>{
 const {manageSpeech}=await import('../dist/speech.js');const f=fixture(t);
 f.board.SCENES[0].narration=[{id:'line-1',speaker:'hero',delivery:'on_screen',tts:'Hello',sub:'Hello'}];
 f.board.SB_DOC={characters:[{id:'hero',name:'Hero',tts:{engine:'gemini',voiceId:'Kore',language:'ko',speed:1}}]};f.save();
 assert.throws(()=>manageSpeech({path:path.join(f.episode,'storyboard'),action:'plan_video',shotId:'s1',capabilities:{provider:'veo',model:selection.model,audioConditioning:true,lipSync:true,postLipSync:false,evidence:'forged'}}),/disagree/);
});
test('frame-based Seedance plans remain valid after schema normalization',async t=>{
 const f=fixture(t,{engine:'seedance',model:'seedance-1-0-pro-fast-251015',resolution:'720p'});
 const old=config.arkApiKey;config.arkApiKey='fixture';t.after(()=>config.arkApiKey=old);
 const p=planVideo({episode:f.episode,shotId:'s1',requestId:'frames',operation:'text',args:{prompt:'A boat',frames:121,generateAudio:false}});
 assert.equal(p.args.durationSeconds,undefined);await f.execute(p,async()=>result);
});
test('historical tally cannot hide costs absent from the event stream',async t=>{
 const f=fixture(t);fs.writeFileSync(path.join(f.episode,'.work/events.jsonl'),'');
 fs.writeFileSync(path.join(f.episode,'.work/cost-tally.tsv'),'veo.fast.720p\t80\timported generation\n');
 await assert.rejects(f.execute(f.plan(),async()=>result),/absent from events/);
});
test('host and local selection preserve narrator voiceover without invented lip-sync support',async t=>{
 const {speechVideoCapabilities}=await import('../dist/video-registry.js');
 const {speechVideoPlan}=await import('../dist/speech.js');
 for(const engine of ['host','mlx','omni']) {
  const caps=speechVideoCapabilities(engine,'selected');
  assert.equal(speechVideoPlan([{id:'n',speaker:'narrator',delivery:'voiceover',tts:'Hello'}],caps).mode,'voiceover');
  assert.throws(()=>speechVideoPlan([{id:'n',speaker:'hero',delivery:'on_screen',tts:'Hello'}],caps),/cannot synchronize/);
 }
});
test('public planning preserves the existing ASTRA board provider marker',async t=>{
 const f=fixture(t,{engine:'astra',resolution:'1024x1920'});
 f.board.PRODUCTION.videoProvider='astra';f.board.PRODUCTION.videoModel={model:'astra',resolution:'1024x1920'};f.save();
 const response=await ROUTES.video_plan({episode:f.episode,shotId:'s1',requestId:'legacy',operation:'text',args:{prompt:'A boat crosses a lake.'}});
 const plan=JSON.parse(response.content[0].text);assert.equal(plan.selection.engine,'astra');assert.equal(plan.selection.model,undefined);
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
test('production and execution share per-cut and scoped selection decisions',t=>{
 const mode=require('../../skills/storyboard/references/production-mode.js');
 const f=fixture(t,{engine:'seedance',model:'dreamina-seedance-2-0-260128',resolution:'720p'});
 f.board.PRODUCTION.modelSettings={models:{video:{engine:'seedance',model:'dreamina-seedance-2-0-260128',resolution:'720p'}},overrides:[]};
 f.board.SCENES[0].visual.video={...selection,generateAudio:true};f.save();
 const selected=()=>mode.resolveVideoChoice(f.board.PRODUCTION,f.board.SCENES[0],f.board.PRODUCTION.modelSettings.models.video);
 assert.deepEqual(selected().selection,routingContext(f.episode,'s1').selection);assert.equal(selected().selection.engine,'veo');
 f.board.PRODUCTION.modelSettings.overrides=[{scope:'episode',request:'Use ASTRA',video:{engine:'astra',resolution:'1024x1920'}},{scope:'shot',shotId:'s1',request:'Use Veo',video:selection}];f.save();
 assert.deepEqual(selected().selection,routingContext(f.episode,'s1').selection);assert.equal(selected().source,'shot_override');
 f.board.PRODUCTION.mode='full_video';
 const findings=mode.check(f.board).join('\n');assert.doesNotMatch(findings,/selected deployed video engine|generateAudio:false/);
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
 assert.equal(isManagedVideoCall('veo_text2video',{videoContext:{episode:'/tmp/e'}}),true);
 assert.equal(isManagedVideoCall('veo_text2video',{prompt:'Standalone'}),false);
});
