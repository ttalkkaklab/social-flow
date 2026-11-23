import {describe,test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path,{join} from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {manageSpeech,speechAudioPlan,speechVideoPlan,speechManageSchema,speechRevision} from '../dist/speech.js';
import {ttsGenerateSchema,gemini38TtsSchema} from '../dist/tts-client.js';
import {elevenLabsGenerateSchema} from '../dist/elevenlabs-client.js';
import {ASTRA_VIDEO_MAX_PROMPT_CHARS} from '../dist/astra-video-client.js';
import {TOOLS} from '../dist/tools.js';
import {ROUTES} from '../dist/handlers.js';
import {setupProject} from './workflow-fixture.mjs';
const require=createRequire(import.meta.url);
const voice={engine:'gemini',voiceId:'Kore',language:'ko',speed:1};
const caps={provider:'replaceable',model:'first',audioConditioning:true,lipSync:true,postLipSync:false,evidence:'fixture adapter contract'};
function spokenClip(file, frequency = 440) {
  execFileSync('ffmpeg',['-v','error','-y','-f','lavfi','-i','color=s=16x16:r=24','-f','lavfi','-i',`sine=frequency=${frequency}:sample_rate=48000`,
    '-t','0.25','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',file]);
}
function setup(t){
 const dir=mkdtempSync(path.join(tmpdir(),'shot-speech-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 mkdirSync(path.join(dir,'storyboard'));mkdirSync(path.join(dir,'.work'));
 const target=path.join(dir,'storyboard');
 const board={SB_DOC:{narratorCharacterId:'narrator',characters:[{id:'narrator',name:'Narrator',tts:voice},{id:'hero',name:'Hero',tts:voice}]},SCENES:[{type:'points',narration:[{tts:'Hello',sub:'Hello',speaker:'hero'}],visual:{video:{src:'old.mp4'}}},{type:'points',narration:[{tts:'Outside',sub:'Outside'}]}]};
 writeFileSync(path.join(target,'scenes.js'),Object.entries(board).map(([k,v])=>`window.${k}=${JSON.stringify(v)};`).join('\n'));
 let r=manageSpeech({path:target,action:'list'});r=manageSpeech({path:target,action:'prepare',expectedRevision:r.revision});
 return {dir,target,r};
}
test('binding a generated clip creates player cuts, replaces its source, and preserves authored multi-cut edits',t=>{
 const {dir,target,r}=setup(t),file=join(target,'scenes.js'),video=join(dir,'generated.mp4');
 require('node:child_process').execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=s=16x16:r=24','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','0.25','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',video]);
 const native={...caps,audioConditioning:false,lipSync:false,nativeSpeech:true};
 const attach=()=>manageSpeech({path:target,action:'attach_video',shotId:r.lines[0].shotId,
  expectedRevision:manageSpeech({path:target,action:'list'}).revision,videoPath:video,capabilities:native});
 const board=()=>require('../../skills/_shared/scenes-vm.js').evaluateWindowScript(readFileSync(file,'utf8'));
 attach();let win=board();
 assert.deepEqual(win.SCENES[0].productionPlan.cuts,[{kind:'generated_video',path:'../generated.mp4',start:0,seconds:0.25}]);
 attach();assert.deepEqual(board().SCENES[0].productionPlan.cuts,win.SCENES[0].productionPlan.cuts);
 win.SCENES[0].productionPlan.cuts.push({kind:'image',path:'ending.png',seconds:1});
 writeFileSync(file,Object.entries(win).map(([k,v])=>`window.${k}=${JSON.stringify(v)};`).join('\n'));
 attach();assert.deepEqual(board().SCENES[0].productionPlan.cuts,win.SCENES[0].productionPlan.cuts);
});
test('stable dialogue addresses survive prepare; edits target one character and mark dependent media',t=>{
 const {target,r}=setup(t),first=r.lines[0],second=r.lines[1];
 assert.equal(second.speaker,'narrator');assert.equal(second.delivery,'voiceover');
 let next=manageSpeech({path:target,action:'prepare',expectedRevision:r.revision});
 assert.deepEqual(next.lines.map(l=>l.id),r.lines.map(l=>l.id));
 assert.throws(()=>manageSpeech({path:target,action:'update',lineId:first.id,expectedRevision:'old',patch:{tts:'Changed'}}),/revision/i);
 next=manageSpeech({path:target,action:'update',lineId:first.id,expectedRevision:next.revision,patch:{tts:'Changed',sub:'Changed'}});
 assert.ok(next.invalidated.video);assert.equal(next.lines[0].mediaStatus,'needs_audio');
 assert.equal(manageSpeech({path:target,action:'list',speaker:'narrator'}).lines[0].tts,'Outside');
 assert.throws(()=>manageSpeech({path:target,action:'update',lineId:first.id,expectedRevision:next.revision,patch:{speaker:'missing'}}),/Unknown speaker/);
});
test('a speechless replacement binds audible effects and reports missing or silent tracks',t=>{
 const {dir,target,r}=setup(t),file=join(target,'scenes.js');
 const read=()=>require('../../skills/_shared/scenes-vm.js').evaluateWindowScript(readFileSync(file,'utf8'));
 const win=read();win.SCENES[0].narration=[];win.SCENES[0].sound={room:'classroom'};
 writeFileSync(file,Object.entries(win).map(([k,v])=>`window.${k}=${JSON.stringify(v)};`).join('\n'));
 const withAudio=join(dir,'ambient.mp4'),silent=join(dir,'silent.mp4'),noAudio=join(dir,'no-audio.mp4');
 const ff=require('node:child_process').execFileSync;
 const picture=['-v','error','-f','lavfi','-i','color=s=16x16:r=24'];
 const encode=['-t','0.25','-c:v','libx264','-pix_fmt','yuv420p'];
 ff('ffmpeg',[...picture,'-f','lavfi','-i','sine=frequency=90:sample_rate=48000',...encode,'-c:a','aac',withAudio]);
 ff('ffmpeg',[...picture,'-f','lavfi','-i','anullsrc=r=48000:cl=mono',...encode,'-c:a','aac',silent]);
 ff('ffmpeg',[...picture,...encode,noAudio]);
 const attach=videoPath=>manageSpeech({path:target,action:'attach_video',shotId:r.lines[0].shotId,expectedRevision:manageSpeech({path:target,action:'list'}).revision,videoPath,capabilities:{...caps,audioConditioning:false,lipSync:false}});
 attach(withAudio);assert.equal(read().SCENES[0].sound.audioSource,'video');
 const quiet=attach(silent);assert.equal(read().SCENES[0].sound.audioSource,undefined);assert.equal(read().SCENES[0].sound.room,'classroom');
 assert.match(quiet.plan.warnings.join(),/silent audio stream/);
 const missing=attach(noAudio);assert.match(missing.plan.warnings.join(),/no audio stream/);
 assert.equal(read().SCENES[0].visual.video.speechBinding.quality.review,'not_reviewed');
 const save=board=>writeFileSync(file,Object.entries(board).map(([k,v])=>`window.${k}=${JSON.stringify(v)};`).join('\n'));
 const withJoin=read();
 withJoin.SCENES[0].duration=0.2;
 withJoin.SCENES[1].transition='dissolve';
 save(withJoin);
 assert.match(attach(withAudio).plan.warnings.join(),/separate assembly audio/);
 assert.equal(read().SCENES[0].sound.audioSource,undefined);
 const withoutJoin=read();withoutJoin.SCENES[1].transition='cut';save(withoutJoin);
 attach(withAudio);
 assert.equal(read().SCENES[0].sound.audioSource,'video');
 assert.equal(read().SCENES[0].edit.out,0.2);
 assert.throws(()=>attach(silent),/revise the authored soundtrack and trim/);
 const shorter=join(dir,'shorter.mp4');
 ff('ffmpeg',['-v','error','-i',withAudio,'-t','0.125',shorter]);
 assert.throws(()=>attach(shorter),/cannot cover edit.out/);
 assert.equal(read().SCENES[0].visual.video.clip,withAudio);
 const exactFit=read();
 exactFit.SCENES[0].duration=0.25;
 delete exactFit.SCENES[0].edit;
 delete exactFit.SCENES[0].sound.audioSource;
 save(exactFit);
 attach(noAudio);attach(withAudio);
 assert.equal(read().SCENES[0].edit.out,0.25);
 assert.throws(()=>attach(shorter),/cannot cover edit.out/);
});
test('video adapters select by capabilities, never a provider name',()=>{
 const lines=[{id:'a',speaker:'hero',delivery:'on_screen',tts:'Hello'}];
 assert.equal(speechVideoPlan(lines,caps).mode,'audio_conditioned');
 assert.equal(speechVideoPlan(lines,{...caps,provider:'another',model:'second'}).mode,'audio_conditioned');
 assert.throws(()=>speechVideoPlan(lines,{...caps,audioConditioning:false,postLipSync:true}),/post_lipsync_forbidden/);
 assert.throws(()=>speechVideoPlan(lines,{...caps,audioConditioning:false}),/cannot synchronize/);
 assert.equal(speechVideoPlan([{...lines[0],delivery:'voiceover'}],caps).mode,'voiceover');
 const native={...caps,audioConditioning:false,lipSync:false,nativeSpeech:true},msr=speechVideoPlan(lines,native);
 assert.throws(()=>speechVideoPlan([...lines,{...lines[0],id:'thought',delivery:'voiceover'}],native),/msr_speech_route/);
 assert.equal(msr.mode,'native');assert.equal(msr.audioFirst,false);assert.equal(msr.timing,'model_timed');
 assert.match(msr.videoPrompt,/physically saying "Hello"/);
 for (const delivery of ['off_screen','voiceover']) {
  const outside=speechVideoPlan([{...lines[0],delivery}],native);
  assert.equal(outside.mode,delivery==='voiceover'?'voiceover':'native');assert.equal(outside.audioFirst,delivery==='voiceover');
  if(delivery==='off_screen')assert.match(outside.videoPrompt,/Speak "Hello"/);
  else {assert.equal(outside.timing,'needs_audio_duration');assert.doesNotMatch(outside.videoPrompt,/Hello/);}
  assert.doesNotMatch(outside.videoPrompt,/Show this speaker physically saying/);
 }
});
test('public speech planning and attachment reject post lip sync on boards without a model snapshot',async t=>{
 const {dir,target,r}=setup(t); setupProject(dir);
 const file=join(target,'scenes.js'), candidate=join(dir,'renamed.mp4');
 spokenClip(candidate);
 const board=require('../../skills/_shared/scenes-vm.js').evaluateWindowScript(readFileSync(file,'utf8'));
 board.SCENES[0].visual.video.speechBinding={mode:'post_lipsync',videoPath:'old.mp4',
   videoSha256:createHash('sha256').update(readFileSync(candidate)).digest('hex')};
 const original=Object.entries(board).map(([key,value])=>`window.${key}=${JSON.stringify(value)};`).join('\n');
 writeFileSync(file,original);
 const base={path:target,shotId:r.lines[0].shotId,capabilities:caps}, expectedRevision=manageSpeech({path:target,action:'list'}).revision;
 await assert.rejects(ROUTES.speech_manage({...base,action:'plan_video',capabilities:{...caps,postLipSync:true}}),/post_lipsync_forbidden/);
 await assert.rejects(ROUTES.speech_manage({...base,action:'plan_video',tool:'post_lipsync'}),/post_lipsync_forbidden/);
 await assert.rejects(ROUTES.speech_manage({...base,action:'plan_video',tool:'astra_video_retake',capabilities:{...caps,provider:'astra',model:'astra'}}),/capabilities disagree/);
 await assert.rejects(ROUTES.speech_manage({...base,action:'attach_video',expectedRevision,videoPath:candidate}),/post_lipsync_forbidden/);
 assert.equal(readFileSync(file,'utf8'),original);
 delete board.SCENES[0].visual.video.speechBinding.videoSha256;
 writeFileSync(join(target,'old.mp4'),readFileSync(candidate));
 writeFileSync(file,Object.entries(board).map(([key,value])=>`window.${key}=${JSON.stringify(value)};`).join('\n'));
 await assert.rejects(ROUTES.speech_manage({...base,action:'attach_video',expectedRevision:manageSpeech({path:target,action:'list'}).revision,videoPath:candidate}),/post_lipsync_forbidden/);
 assert.equal(manageSpeech({...base,action:'plan_video'}).plan.mode,'audio_conditioned');
});
test('public speech planning and attachment share the model voice limit for each authored render',async t=>{
 const {dir,target}=setup(t); setupProject(dir);
 const file=join(target,'scenes.js'),candidate=join(dir,'take.mp4');
 spokenClip(candidate);
 const actors=['one','two','three'];
 const lines=actors.map((id,i)=>({id:'line'+i,speaker:id,delivery:'on_screen',tts:'Line '+i+'.'}));
 const ltx={engine:'astra-genai',model:'ltx-2.5-22b-distilled',operation:'reference'};
 const board={SB_DOC:{characters:actors.map(id=>({id,tts:voice}))},PRODUCTION:{videoModel:ltx},
   STRUCTURE:{scenes:[{no:1,speakers:actors,videoDirection:{oneTake:true}}]},SCENES:[]};
 const card=(id,narration)=>({id,scene:1,duration:0.25,narration,visual:{}});
 const save=(path=file)=>writeFileSync(path,Object.entries(board).map(([key,value])=>'window.'+key+'='+JSON.stringify(value)+';').join('\n'));
 const call=async(action,path=target,options={})=>{
   const expectedRevision=manageSpeech({path,action:'list'}).revision;
   const result=await ROUTES.speech_manage({path,action,shotId:'shot1',expectedRevision,videoPath:candidate,...options});
   return JSON.parse(result.content[0].text);
 };
 const rejectOverflow=async(path,options)=>{
   const bytes=readFileSync(join(path,'scenes.js'));
   for(const action of ['plan_video','attach_video']){
     await assert.rejects(call(action,path,options),/scene_render_voice_limit: .* needs 3 pinned voices.* accepts 2 per render/);
     assert.deepEqual(readFileSync(join(path,'scenes.js')),bytes);
   }
 };
 board.SCENES=[card('shot1',lines)];
 save();
 await rejectOverflow(target);
 const standalone=join(dir,'import'); mkdirSync(standalone);
 save(join(standalone,'scenes.js'));
 await rejectOverflow(standalone,{tool:'astra_genai_msr'});
 board.SCENES=lines.map((line,i)=>card('shot'+(i+1),[line]));
 save();
 await rejectOverflow(target);
 board.PRODUCTION.videoModel={...ltx,operation:'image'};
 board.STRUCTURE.scenes[0].videoDirection.oneTake=false;
 save();
 assert.equal((await call('plan_video')).plan.mode,'native');
 assert.equal((await call('attach_video')).changed,true);
 board.SCENES=[card('shot1',lines)];
 board.PRODUCTION.videoModel={engine:'seedance',model:'dreamina-seedance-2-0-fast-260128',operation:'reference'};
 save();
 assert.equal((await call('plan_video')).plan.mode,'native');
 assert.equal((await call('attach_video')).changed,true);
 board.PRODUCTION.videoModel={...ltx,operation:'audio'};
 save();
 assert.equal((await call('plan_video')).plan.mode,'audio_conditioned');
 delete board.STRUCTURE;
 board.PRODUCTION.videoModel=ltx;
 save(join(standalone,'scenes.js'));
 await rejectOverflow(standalone);
});
test('public native attachment verifies its source and registered operation even without a snapshot',async t=>{
 const {dir,target,r}=setup(t); setupProject(dir);
 const file=join(target,'scenes.js'),candidate=join(dir,'unbound.mp4'),sha=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
 spokenClip(candidate);
 const board=require('../../skills/_shared/scenes-vm.js').evaluateWindowScript(readFileSync(file,'utf8'));
 const shot=board.SCENES[0],model='ltx-2.5-22b-distilled',tool='astra_genai_msr';
 const native={...caps,provider:'astra-genai',model,audioConditioning:false,lipSync:false,nativeSpeech:true};
 const save=()=>writeFileSync(file,Object.entries(board).map(([key,value])=>'window.'+key+'='+JSON.stringify(value)+';').join('\n'));
 const call=(action,options)=>ROUTES.speech_manage({path:target,action,shotId:r.lines[0].shotId,
   expectedRevision:manageSpeech({path:target,action:'list'}).revision,videoPath:candidate,...options});
 const original=readFileSync(file);
 await assert.rejects(call('attach_video',{capabilities:{...native,provider:'fictional'}}),/video_operation_missing/);
 await assert.rejects(call('attach_video',{tool,capabilities:{...native,model:'ltx-2.5-22b-dev'}}),/scene_speech_references/);
 const receipt=candidate+'.astra-genai.json';
 writeFileSync(receipt,JSON.stringify({operation:'post_lipsync',sha256:sha(candidate),videoPath:candidate}));
 await assert.rejects(call('attach_video',{tool,capabilities:native}),/post_lipsync_forbidden/);
 assert.deepEqual(readFileSync(file),original);
 Object.assign(shot.visual.video,{engine:'astra-genai',model,operation:'reference'});
 save();
 await assert.rejects(call('attach_video',{}),/post_lipsync_forbidden/);
 await assert.rejects(call('attach_video',{capabilities:{...native,provider:'fictional'}}),/capabilities disagree/);
 writeFileSync(receipt,JSON.stringify({operation:'audio-to-video',sha256:sha(candidate),videoPath:candidate}));
 await assert.rejects(call('attach_video',{}),/speech_video_source_mismatch/);
 shot.visual.video.generateAudio=false;save();
 const muted=readFileSync(file);
 for(const action of ['plan_video','attach_video'])await assert.rejects(call(action,{}),/scene_dialogue_audio_required/);
 assert.deepEqual(readFileSync(file),muted);
 delete shot.visual.video.generateAudio;
 save();rmSync(receipt);
 const ok=JSON.parse((await call('attach_video',{})).content[0].text);
 assert.equal(ok.plan.mode,'native');assert.equal(ok.changed,true);
});
test('a silent A2V replacement binds only its generation-time driver WAV',t=>{
 const {dir,target,r}=setup(t), line=r.lines[0], audio=join(dir,'driver.wav'), candidate=join(dir,'fresh.mp4');
 execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','sine=frequency=440:duration=0.25','-c:a','pcm_s16le',audio]);
 execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=s=16x16:r=24:d=0.25','-c:v','libx264','-pix_fmt','yuv420p',candidate]);
 const state=manageSpeech({path:target,action:'attach_audio',expectedRevision:r.revision,lineId:line.id,audioPath:audio,
   generation:{generator:'tts_generate',language:'ko',voiceSettings:{voiceName:'Kore',speed:1},text:line.tts}});
 const attach=(revision=state.revision)=>manageSpeech({path:target,action:'attach_video',expectedRevision:revision,shotId:line.shotId,videoPath:candidate,tool:'astra_audio2video'});
 assert.throws(attach,/conditioning_audio_unverified/);
 const digest=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
 const proof={status:'completed',jobId:'fresh-a2v',mode:'audio2video',videoPath:candidate,sha256:digest(candidate),
   conditioningAudioSha256:digest(audio),submittedRequest:{mode:'audio2video',audio_upload_id:'original-wav'}};
 writeFileSync(candidate+'.astra-job.json',JSON.stringify(proof));
 const accepted=attach();
 const card=require('../../skills/_shared/scenes-vm.js').evaluateWindowScript(readFileSync(join(target,'scenes.js'),'utf8')).SCENES[0];
 assert.equal(card.sound.audioSource,'speech');
 assert.equal(card.visual.video.speechBinding.conditioningAudioSha256,digest(audio));
 assert.equal(card.visual.video.speechBinding.conditioningAudioPath,audio);
 const replacement=join(dir,'replacement.wav');
 execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','sine=frequency=660:duration=0.25','-c:a','pcm_s16le',replacement]);
 const changed=manageSpeech({path:target,action:'attach_audio',expectedRevision:accepted.revision,lineId:line.id,audioPath:replacement,
   generation:{generator:'tts_generate',language:'ko',voiceSettings:{voiceName:'Kore',speed:1},text:line.tts}});
 writeFileSync(join(dir,'.work/cards.tsv'),`0\t${audio}\t1\n`);
 const stale=readFileSync(join(target,'scenes.js'),'utf8');
 assert.throws(()=>attach(changed.revision),/conditioning_audio_unverified/);
 assert.equal(readFileSync(join(target,'scenes.js'),'utf8'),stale);
});
test('a native-speech clip binds line revisions and assembles from its soundtrack without line audio',t=>{
 const {dir,target,r}=setup(t),line=r.lines[0],file=path.join(target,'scenes.js'),win={};
 new Function('window',readFileSync(file,'utf8'))(win);win.SCENES=[win.SCENES[0]];
 writeFileSync(file,Object.entries(win).map(([k,v])=>`window.${k}=${JSON.stringify(v)};`).join('\n'));
 const native={...caps,audioConditioning:false,lipSync:false,nativeSpeech:true};
 const work=path.join(dir,'.work'),audio=path.join(work,'c0.wav');writeFileSync(audio,'extracted soundtrack');
 writeFileSync(path.join(work,'cards.tsv'),'0\tc0.wav\t1\n');
 const hash=f=>require('node:crypto').createHash('sha256').update(readFileSync(f)).digest('hex');
 const clip=(name,frequency)=>{const video=path.join(dir,name);spokenClip(video,frequency);
  writeFileSync(path.join(work,'source-audio.json'),JSON.stringify([{card:'0',video,sourceSha256:hash(video),audio,audioSha256:hash(audio)}]));return video;};
 const attach=video=>manageSpeech({path:target,action:'attach_video',shotId:line.shotId,expectedRevision:manageSpeech({path:target,action:'list'}).revision,videoPath:video,capabilities:native});
 const checker=require('../../skills/produce/references/check-tts-quality.js'),shot=()=>require('../../skills/_shared/scenes-vm.js').evaluateWindowScript(readFileSync(file,'utf8')).SCENES[0];
 const first=clip('msr-1.mp4',440);
 assert.throws(()=>checker.check(work,target),/post_lipsync_forbidden/);
 attach(first);assert.equal(shot().visual.video.speechBinding.mode,'native');assert.equal(shot().sound.audioSource,'video');
 assert.ok(checker.check(work,target)[audio]);
 const edited=manageSpeech({path:target,action:'update',lineId:line.id,expectedRevision:manageSpeech({path:target,action:'list'}).revision,patch:{tts:'Changed',sub:'Changed'}});
 assert.equal(edited.lines[0].mediaStatus,undefined);assert.throws(()=>checker.check(work,target),/video is stale/);
 attach(first);assert.throws(()=>checker.check(work,target),/video is stale/); // these bytes spoke the old words
 attach(clip('msr-2.mp4',660));assert.ok(checker.check(work,target)[audio]);
 assert.equal(manageSpeech({path:target,action:'list'}).lines[0].audioProvenanceStatus,'native_speech');
 const board={};new Function('window',readFileSync(file,'utf8'))(board);board.SCENES[0].sound.audioSource='speech';
 writeFileSync(file,Object.entries(board).map(([k,v])=>`window.${k}=${JSON.stringify(v)};`).join('\n'));
 assert.throws(()=>checker.check(work,target),/post_lipsync_forbidden/);
 // A clip that opens on silent acting comes back with where its line sits and a trim to listen to.
 const voiced=path.join(dir,'msr-3.mp4');
 require('node:child_process').execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=s=16x16:r=24:d=4','-f','lavfi','-i','aevalsrc=if(between(t\\,2\\,3.5)\\,0.3*sin(2*PI*440*t)\\,0):s=48000:d=4','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest',voiced]);
 board.SCENES[0].sound.audioSource='video';writeFileSync(file,Object.entries(board).map(([k,v])=>`window.${k}=${JSON.stringify(v)};`).join('\n'));
 const {soundtrack}=attach(voiced);
 assert.ok(Math.abs(soundtrack.leadSilenceSeconds-2)<.06,JSON.stringify(soundtrack));
 assert.ok(soundtrack.suggestedEdit.in>1.5&&soundtrack.suggestedEdit.in<2);assert.equal(shot().edit?.in,undefined);
 // A trim belongs to the clip it was measured on: other footage drops it instead of cutting at the old points.
 const trimmed={};new Function('window',readFileSync(file,'utf8'))(trimmed);trimmed.SCENES[0].edit={...trimmed.SCENES[0].edit,in:1.7,out:3.9};
 writeFileSync(file,Object.entries(trimmed).map(([k,v])=>`window.${k}=${JSON.stringify(v)};`).join('\n'));
 assert.equal(attach(voiced).clearedTrim,undefined);assert.equal(shot().edit.in,1.7);
 const other=path.join(dir,'msr-4.mp4');
 require('node:child_process').execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=s=16x16:r=24:d=1','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=1','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest',other]);
 assert.deepEqual({in:attach(other).clearedTrim.in,kept:shot().edit.in,out:shot().edit.out},{in:1.7,kept:undefined,out:undefined});
 // EP07: an AAC stream with only near-zero samples is not generated dialogue.
 const silent=path.join(dir,'msr-silent.mp4');
 require('node:child_process').execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=s=16x16:r=24:d=1','-f','lavfi','-i','anullsrc=r=48000:cl=stereo','-t','1','-c:v','libx264','-c:a','aac',silent]);
 const before=readFileSync(file,'utf8');
 assert.throws(()=>attach(silent),/native_speech_silent/);
 const noAudio=path.join(dir,'msr-no-audio.mp4');
 require('node:child_process').execFileSync('ffmpeg',['-v','error','-i',silent,'-an','-c:v','copy',noAudio]);
 assert.throws(()=>attach(noAudio),/native_speech_missing/);
 assert.equal(readFileSync(file,'utf8'),before);
});
test('id-only story-first speakers use their character voice when listing and binding native video',t=>{
 const {dir,target,r}=setup(t),file=join(target,'scenes.js'),win={};
 new Function('window',readFileSync(file,'utf8'))(win);win.SCENES=[win.SCENES[0]];
 win.SB_DOC.characters=[{id:'hero',name:'Hero'}];delete win.SB_DOC.narratorCharacterId;
 writeFileSync(file,Object.entries(win).map(([k,v])=>`window.${k}=${JSON.stringify(v)};`).join('\n'));
 writeFileSync(join(dir,'profile.md'),'# Channel');const folder=join(dir,'assets/characters/hero');mkdirSync(folder,{recursive:true});
 const example=readFileSync(new URL('../../skills/channel/references/character-identity-example.md',import.meta.url),'utf8');
 const doc=JSON.parse(example.match(/```json\s*\n([\s\S]*?)```/)[1]);doc.tts=voice;
 writeFileSync(join(folder,'identity.md'),'# Hero\n\n```json\n'+JSON.stringify(doc)+'\n```');
 const listed=manageSpeech({path:target,action:'list'});assert.deepEqual(listed.lines[0].voice,voice);
 const video=join(dir,'native.mp4');writeFileSync(video,'native clip');
 const attached=manageSpeech({path:target,action:'attach_video',shotId:r.lines[0].shotId,expectedRevision:listed.revision,
  videoPath:video,capabilities:{...caps,audioConditioning:false,lipSync:false,nativeSpeech:true}});
 assert.equal(attached.plan.mode,'native');assert.equal(attached.lines[0].audioProvenanceStatus,'native_speech');
 assert.equal(attached.lines[0].speechRevision,speechRevision(listed.lines[0],{id:'hero',tts:voice}));
});
test('generation binding rejects wrong voices and invalidates old audio after edits',t=>{
 const {dir,target,r}=setup(t),line=r.lines[0];const audio=path.join(dir,'voice.wav');writeFileSync(audio,'fixture audio bytes');
 const generation={generator:'tts_generate',language:'ko',voiceSettings:{voiceName:'Kore',speed:1},text:'Hello'};
 assert.throws(()=>manageSpeech({path:target,action:'attach_audio',lineId:line.id,expectedRevision:r.revision,audioPath:audio,generation:{...generation,voiceSettings:{voiceName:'Puck'}}}),/pinned/);
 let next=manageSpeech({path:target,action:'attach_audio',lineId:line.id,expectedRevision:r.revision,audioPath:audio,generation});
 assert.equal(next.lines[0].audioCurrent,true);assert.equal(next.lines[0].audio.status,'not_reviewed');
 writeFileSync(audio,'changed bytes');assert.equal(manageSpeech({path:target,action:'list',lineId:line.id}).lines[0].audioCurrent,false);
 next=manageSpeech({path:target,action:'update',lineId:line.id,expectedRevision:next.revision,patch:{tts:'New'}});assert.equal(next.lines[0].audioCurrent,false);
});
test('same-text audio retake invalidates bound lip-sync video until rebound',t=>{
 const {dir,target,r}=setup(t),line=r.lines[0];
 const audio=path.join(dir,'take1.wav'),retake=path.join(dir,'take2.wav'),video=path.join(dir,'clip.mp4');
 writeFileSync(audio,'first audio');writeFileSync(retake,'different timing');spokenClip(video);
 const generation={generator:'tts_generate',language:'ko',voiceSettings:{voiceName:'Kore',speed:1},text:'Hello'};
 let next=manageSpeech({path:target,action:'attach_audio',lineId:line.id,expectedRevision:r.revision,audioPath:audio,generation});
 next=manageSpeech({path:target,action:'attach_video',shotId:line.shotId,expectedRevision:next.revision,videoPath:video,capabilities:caps});
 next=manageSpeech({path:target,action:'attach_audio',lineId:line.id,expectedRevision:next.revision,audioPath:audio,generation});
 assert.equal(next.invalidated,undefined);
 next=manageSpeech({path:target,action:'attach_audio',lineId:line.id,expectedRevision:next.revision,audioPath:retake,generation});
 assert.equal(next.invalidated.video.speechStatus,'stale');assert.equal(next.invalidated.edit,true);
 assert.equal(next.lines[0].audioCurrent,true);
 assert.match(readFileSync(path.join(target,'scenes.js'),'utf8'),/"speechStatus": "stale"/);
});
for(const generator of ['tts_generate','tts_gemini_38','tts_elevenlabs_generate'])test(generator+' raw API arguments attach and pass assembly provenance without invented language arguments',t=>{
 const {dir,target,r}=setup(t),line=r.lines[1];
 const board=path.join(target,'scenes.js');let source=readFileSync(board,'utf8');
 const replacement={engine:generator==='tts_elevenlabs_generate'?'elevenlabs':'gemini',voiceId:generator==='tts_elevenlabs_generate'?'actor-one':generator==='tts_gemini_38'?'voice_custom':'Kore',model:generator==='tts_elevenlabs_generate'?'eleven_v4':generator==='tts_gemini_38'?'gemini-3.8-flash-tts':'gemini-2.5-flash-preview-tts',language:'Korean',speed:1};
 source=source.replaceAll(JSON.stringify(voice,null,2),JSON.stringify(replacement,null,2));
 // serializeBoard indents nested fields; use its parsed object to change the pinned identity.
 const win={};new Function('window',source)(win);win.SB_DOC.characters.forEach(c=>c.tts=replacement);
 win.SCENES=[win.SCENES[1]];writeFileSync(board,Object.entries(win).map(([k,v])=>`window.${k}=${JSON.stringify(v)};`).join('\n'));
 const audio=path.join(dir,'.work','c0.wav');writeFileSync(audio,'fixture bytes');
 const revision=manageSpeech({path:target,action:'list'}).revision;
 const voiceSettings={model:replacement.model,...(generator==='tts_generate'?{voiceName:replacement.voiceId}:generator==='tts_gemini_38'?{voice:replacement.voiceId,turns:[{text:'Outside',style:'calm'}]}:{voiceId:replacement.voiceId})};
 const generation={generator,voiceSettings,language:'ko',text:'Outside'};
 const attached=manageSpeech({path:target,action:'attach_audio',lineId:line.id,expectedRevision:revision,audioPath:audio,generation});
 assert.equal(attached.lines[0].audioCurrent,true);
 writeFileSync(path.join(dir,'.work','cards.tsv'),'0\tc0.wav\t1\n');
 const checker=require('../../skills/produce/references/check-tts-quality.js');
 assert.ok(checker.check(path.join(dir,'.work'),target)[audio]);
 assert.throws(()=>manageSpeech({path:target,action:'attach_audio',lineId:line.id,expectedRevision:attached.revision,audioPath:audio,generation:{...generation,language:'ja'}}),/language/);
});

test('story-v2 prepares explicit dialogue and silent shots without an unused narrator',t=>{
 const {target}=setup(t),file=path.join(target,'scenes.js');
 const voiceContract=require('../../skills/_shared/character-voice.js');
 for(const silent of [false,true]){
  const win={STORY:{version:'story-v2'},SB_DOC:{characters:[{id:'hero',tts:voice}]},SCENES:[{type:'points',narration:silent?[]:[{tts:'Hello',sub:'Hello',speaker:'hero'}]}]};
  const save=()=>writeFileSync(file,Object.entries(win).map(([k,v])=>`window.${k}=${JSON.stringify(v)};`).join('\n'));
  save();let current=manageSpeech({path:target,action:'list'});
  const result=manageSpeech({path:target,action:'prepare',expectedRevision:current.revision});
  assert.equal(result.lines.length,silent?0:1);
  const prepared={};new Function('window',readFileSync(file,'utf8'))(prepared);
  assert.deepEqual(voiceContract.boardVoiceErrors(prepared),[]);
  if(!silent){
   assert.equal(result.lines[0].speaker,'hero');assert.equal(result.lines[0].delivery,'on_screen');
   delete win.SCENES[0].narration[0].speaker;save();current=manageSpeech({path:target,action:'list'});
   assert.throws(()=>manageSpeech({path:target,action:'prepare',expectedRevision:current.revision}),/narratorCharacterId/);
  }
  delete win.STORY;save();current=manageSpeech({path:target,action:'list'});
  assert.throws(()=>manageSpeech({path:target,action:'prepare',expectedRevision:current.revision}),/narratorCharacterId/);
 }
});

test('story-v2 speaker edits synchronize performance without changing its addressee',t=>{
 const {target,r}=setup(t),file=path.join(target,'scenes.js'),win={};
 new Function('window',readFileSync(file,'utf8'))(win);
 win.STORY={version:'story-v2'};
 win.SCENES[0].performance=[{kind:'dialogue',character:'hero',to:'audience',group:1},{kind:'action',character:'hero',text:'Waves.'}];
 writeFileSync(file,Object.entries(win).map(([k,v])=>`window.${k}=${JSON.stringify(v)};`).join('\n'));
 const revision=manageSpeech({path:target,action:'list'}).revision;
 manageSpeech({path:target,action:'update',lineId:r.lines[0].id,expectedRevision:revision,patch:{speaker:'narrator'}});
 const edited={};new Function('window',readFileSync(file,'utf8'))(edited);
 assert.deepEqual(edited.SCENES[0].performance,[{kind:'dialogue',character:'narrator',to:'audience',group:1},{kind:'action',character:'hero',text:'Waves.'}]);
});

test('retime is a revisioned tool operation; safe tail reuse preserves speech and changed audio cannot be relabelled', async t => {
 const {execFileSync}=await import('node:child_process');
 const {dir,target,r}=setup(t),line=r.lines[0],file=path.join(target,'scenes.js');
 const win=require('../../skills/_shared/scenes-vm.js').evaluateWindowScript(readFileSync(file,'utf8'));
 win.SCENES[0].performance=[{kind:'action',text:'Speak on phone',withGroup:1,durationSeconds:4},{kind:'dialogue',character:line.speaker,group:1}];
 win.SCENES[0].duration=4;writeFileSync(file,Object.entries(win).map(([k,v])=>`window.${k}=${JSON.stringify(v)};`).join('\n'));
 const audio=path.join(dir,'timed.wav'),video=path.join(dir,'video.mp4');
 execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','sine=frequency=440:duration=1','-c:a','pcm_s16le',audio]);spokenClip(video);
 let next=manageSpeech({path:target,action:'list'});
 const generation={generator:'tts_generate',language:'ko',voiceSettings:{voiceName:'Kore',speed:1},text:'Hello'};
 next=manageSpeech({path:target,action:'attach_audio',lineId:line.id,expectedRevision:next.revision,audioPath:audio,generation});
 assert.equal(next.timing.measuredSeconds,4);assert.ok(next.timing.warnings.length);
 next=manageSpeech({path:target,action:'attach_video',shotId:line.shotId,expectedRevision:next.revision,videoPath:video,capabilities:caps});
 const {createHash}=await import('node:crypto');
 writeFileSync(video+'.astra-job.json',JSON.stringify({sha256:createHash('sha256').update(readFileSync(video)).digest('hex'),speechSync:{status:'no_sync'},selection:{status:'provisional'}}));
 next=manageSpeech({path:target,action:'attach_video',shotId:line.shotId,expectedRevision:next.revision,videoPath:video,capabilities:caps});
 let bound=require('../../skills/_shared/scenes-vm.js').evaluateWindowScript(readFileSync(file,'utf8')).SCENES[0].visual.video.speechBinding;
 assert.equal(bound.quality.speechSync.status,'no_sync');assert.equal(bound.quality.selection.status,'provisional');
 const check=require('../../skills/produce/references/check-production.js').check(target,{assemblyOnly:true});
 assert.ok(check.warnings.some(w=>w.includes('unresolved speech-motion')));
 assert.ok(check.warnings.some(w=>w.includes('automatic candidate selection is provisional')));
 const originalHash=next.lines[0].audio.sha256;
 assert.throws(()=>manageSpeech({path:target,action:'retime',shotId:line.shotId,expectedRevision:'stale'}),/revision/i);
 next=manageSpeech({path:target,action:'retime',shotId:line.shotId,expectedRevision:next.revision,timingPatch:{speechBoundActions:true}});
 assert.equal(next.timing.durationSeconds,1);assert.equal(next.lines[0].audio.sha256,originalHash);
 const retimedSource=readFileSync(file,'utf8');
 for (const sourceChange of ['background','character','location','legacy']) {
  const changed=require('../../skills/_shared/scenes-vm.js').evaluateWindowScript(retimedSource);
  const shot=changed.SCENES[0];
  if(sourceChange==='background')shot.visual.bg='different-room.png';
  if(sourceChange==='character')shot.visual.character='different-actor';
  if(sourceChange==='location')shot.shot={...shot.shot,location:'different-room'};
  if(sourceChange==='legacy')delete shot.visual.video.speechBinding.reuseContextRevision;
  writeFileSync(file,Object.entries(changed).map(([k,v])=>`window.${k}=${JSON.stringify(v)};`).join('\n'));
  const revision=manageSpeech({path:target,action:'list'}).revision;
  assert.throws(()=>manageSpeech({path:target,action:'attach_video',shotId:line.shotId,expectedRevision:revision,videoPath:video,capabilities:caps,reuse:'tail_trim'}),/identical bound audio/,sourceChange);
 }
 writeFileSync(file,retimedSource);
 next=manageSpeech({path:target,action:'attach_video',shotId:line.shotId,expectedRevision:next.revision,videoPath:video,capabilities:caps,reuse:'tail_trim'});
 assert.equal(next.invalidated,undefined);
 assert.match(readFileSync(file,'utf8'),/"kind": "tail_trim"/);
 assert.match(readFileSync(file,'utf8'),/"speechStatus": "current"/);
 const retake=path.join(dir,'retake.wav');execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','sine=frequency=880:duration=1','-c:a','pcm_s16le',retake]);
 next=manageSpeech({path:target,action:'attach_audio',lineId:line.id,expectedRevision:next.revision,audioPath:retake,generation});
 assert.throws(()=>manageSpeech({path:target,action:'attach_video',shotId:line.shotId,expectedRevision:next.revision,videoPath:video,capabilities:caps,reuse:'tail_trim'}),/identical bound audio/);
});

// speech_manage MCP surface must expose the same acting contract the runtime schema accepts.
test('MCP clients can discover scene acting planning and send the runtime contract', () => {
  const surface = TOOLS.find(tool => tool.name === 'speech_manage').inputSchema;
  assert.ok(surface.properties.action.enum.includes('plan_audio'));
  assert.equal(speechManageSchema.safeParse({ path: '/tmp/board', action: 'plan_audio', lineId: 'd-question' }).success, true);
  const acting = {
    direction: 'quiet question', tags: ['sigh'], context: 'A celebration was mistaken for a job offer.', intent: 'Clarify the misunderstanding.',
    emotion: 'Confused', vocal: 'Quiet question, no sales smile.',
    visual: 'Lower hands and look at the applicant.', leadInSeconds: 0.25, tailOutSeconds: 0.4,
  };
  const exposed = surface.properties.patch.properties.acting;
  assert.deepEqual(Object.keys(exposed.properties).sort(), Object.keys(acting).sort());
  assert.equal(exposed.additionalProperties, false);
  assert.ok(exposed.type.includes('null'));
  for (const value of [acting, null]) {
    assert.equal(speechManageSchema.safeParse({ path: '/tmp/board', action: 'update', lineId: 'd-question', patch: { acting: value } }).success, true);
  }
});

test('acting-only edits invalidate audio and video; attachment must match the planned performance', t => {
  const voice = { engine: 'elevenlabs', voiceId: 'actor-one', model: 'eleven_v4', speed: 1, language: 'ko', stability: 0.5 };
  const dir = mkdtempSync(join(tmpdir(),'speech-acting-')); t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const board = {SB_DOC:{speechPlanVersion:1,narratorCharacterId:'actor',characters:[{id:'actor',tts:voice}]},SCENES:[{id:'s0001',type:'points',narration:[{id:'d-one',speaker:'actor',delivery:'on_screen',tts:'괜찮아.'}],visual:{video:{src:'old.mp4'}}}]};
  writeFileSync(join(dir,'scenes.js'),Object.entries(board).map(([k,v])=>`window.${k}=${JSON.stringify(v)};`).join('\n'));
  let state = manageSpeech({path:dir,action:'list'});
  const oldRevision=state.lines[0].speechRevision;
  state=manageSpeech(speechManageSchema.parse({path:dir,action:'update',lineId:'d-one',expectedRevision:state.revision,patch:{acting:{direction:'reassuring',tags:['sigh']}}}));
  assert.notEqual(oldRevision,state.lines[0].speechRevision);
  assert.ok(state.invalidated.video);assert.equal(state.lines[0].tts,'괜찮아.');
  const plan=manageSpeech({path:dir,action:'plan_audio',lineId:'d-one'}).audioPlans[0];
  assert.equal(plan.expectedText,'괜찮아.');
  const audio=join(dir,'take.wav');writeFileSync(audio,'fixture-audio');
  const generation={generator:plan.generator,text:plan.expectedText,voiceSettings:plan.generation};
  assert.throws(()=>manageSpeech({path:dir,action:'attach_audio',lineId:'d-one',expectedRevision:state.revision,audioPath:audio,generation:{...generation,voiceSettings:{...plan.generation,text:'괜찮아.'}}}),/Acting generation differs/);
  state=manageSpeech({path:dir,action:'attach_audio',lineId:'d-one',expectedRevision:state.revision,audioPath:audio,generation});
  assert.equal(state.lines[0].audioCurrent,true);
  assert.equal(state.lines[0].audio.status,'not_reviewed');
  const line={tts:'Hi',speaker:'actor'};
  assert.equal(speechRevision(line),speechRevision({...line,acting:null}));
});

// Acted audio provenance is compared again at assembly for each engine family.
const checker = require('../../skills/produce/references/check-tts-quality.js');
const cases = [
  { engine:'elevenlabs',voiceId:'actor-one',model:'eleven_v4',speed:1,language:'ko',stability:0.5 },
  { engine:'gemini',voiceId:'Kore',model:'gemini-2.5-flash-preview-tts',speed:1,language:'ko',stylePrompt:'warm narrator' },
  { engine:'gemini',voiceId:'achernar',model:'gemini-3.8-flash-tts',speed:1,language:'ko' },
];
for (const voice of cases) test(`${voice.model} acted audio survives attachment and assembly with identical provenance checks`, t => {
  const dir=mkdtempSync(join(tmpdir(),'acted-assembly-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const file=join(dir,'scenes.js'),audio=join(dir,'take.wav');
  const board={SB_DOC:{speechPlanVersion:1,narratorCharacterId:'actor',characters:[{id:'actor',tts:voice}]},SCENES:[{id:'s1',type:'points',narration:[{id:'d1',speaker:'actor',delivery:'voiceover',tts:'괜찮아.',acting:{direction:'reassuring'}}]}]};
  const save=value=>writeFileSync(file,Object.entries(value).map(([k,v])=>`window.${k}=${JSON.stringify(v)};`).join('\n'));
  const read=()=>{const win={};new Function('window',readFileSync(file,'utf8'))(win);return win;};
  save(board);writeFileSync(audio,'fixture spoken audio');writeFileSync(join(dir,'cards.tsv'),'0\ttake.wav\t1\n');
  const state=manageSpeech({path:dir,action:'list'}),plan=manageSpeech({path:dir,action:'plan_audio',lineId:'d1'}).audioPlans[0];
  const generation={generator:plan.generator,text:plan.expectedText,language:'ko',voiceSettings:plan.generation};
  manageSpeech({path:dir,action:'attach_audio',lineId:'d1',expectedRevision:state.revision,audioPath:audio,generation});
  assert.ok(checker.check(dir,dir)[audio]);
  const attached=read(),line=attached.SCENES[0].narration[0];
  assert.equal(line.audio.revision,speechRevision(line,attached.SB_DOC.characters[0]));
  // Updating only the board cannot reuse audio generated for the original performance.
  line.acting.direction='angry';save(attached);
  assert.throws(()=>checker.check(dir,dir),/Dialogue or voice changed/);
  // Even a recomputed revision cannot hide generation arguments for different acting.
  line.audio.revision=speechRevision(line,attached.SB_DOC.characters[0]);save(attached);
  assert.throws(()=>checker.check(dir,dir),/Acting generation differs/);
  // Original board + altered receipt also fails the same shared comparison.
  line.acting.direction='reassuring';line.audio.revision=speechRevision(line,attached.SB_DOC.characters[0]);
  if(voice.engine==='elevenlabs')line.audio.generation.voiceSettings.text='[angry] 괜찮아.';
  else if(voice.model.startsWith('gemini-3.8'))line.audio.generation.voiceSettings.turns[0].style='angry';
  else line.audio.generation.voiceSettings.stylePrompt='warm narrator\nangry';
  save(attached);assert.throws(()=>checker.check(dir,dir),/Acting generation differs/);
});

// Scene direction: acting → provider audio plans, whole-shot video plans and composed speech timing.
describe('scene direction', () => {
 const voice={engine:'gemini',voiceId:'Kore',model:'gemini-2.5-flash-preview-tts',language:'ko',speed:1,stylePrompt:'Bright confident sales smile.'};
 const caps={provider:'fixture',model:'acting',audioConditioning:true,lipSync:true,postLipSync:false,evidence:'test adapter'};
 function wav(seconds){const b=Buffer.alloc(44+48000*seconds*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(48000,24);b.writeUInt32LE(96000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(b.length-44,40);return b;}
 function fixture(t,lines=[{tts:'What did I pass?',speaker:'host',delivery:'on_screen'}],tts=voice) {
  const dir=mkdtempSync(path.join(tmpdir(),'acting-contract-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const board=path.join(dir,'storyboard'),work=path.join(dir,'.work');mkdirSync(board);mkdirSync(work);
  const win={STORY:{version:'story-v2'},SB_DOC:{characters:[{id:'host',tts}]},SCENES:[{type:'points',narration:lines,visual:{video:{}}}]};
  writeFileSync(path.join(board,'scenes.js'),Object.entries(win).map(([k,v])=>`window.${k}=${JSON.stringify(v)};`).join('\n'));
  let r=manageSpeech({path:board,action:'list'});r=manageSpeech({path:board,action:'prepare',expectedRevision:r.revision});
  return {dir,board,work,r};
 }
 const proof=line=>({generator:line.generationPlan.generator,voiceSettings:line.generationPlan.arguments,text:line.tts,language:line.generationPlan.language});
 test('one speaker identifies himself, listens and questions in one shot with isolated TTS directions',t=>{
  const phone=JSON.parse(readFileSync(new URL('./fixtures/telephone-speech-intent.json',import.meta.url),'utf8'));
  const pinned={engine:'gemini',voiceId:'Orus',model:'gemini-3.8-flash-tts',language:'ko',speed:1};
  const {dir,board,work}=fixture(t,phone.narration,pinned),file=path.join(board,'scenes.js'),win={};
  new Function('window',readFileSync(file,'utf8'))(win);
  win.SB_DOC.performanceTimingVersion=1;win.SCENES[0].performance=phone.performance;win.SCENES[0].duration=3;
  win.MUSIC={$timeline:[]};
  writeFileSync(file,Object.entries(win).map(([k,v])=>`window.${k}=${JSON.stringify(v)};`).join('\n'));
  let state=manageSpeech({path:board,action:'list'});
  const plans=manageSpeech({path:board,action:'plan_audio'}).audioPlans;
  assert.equal(plans.length,2);
  for(const [index,plan] of plans.entries()){
   assert.equal(plan.generator,'tts_gemini_38');assert.equal(plan.generation.voice,'Orus');
   assert.equal(plan.generation.turns.length,1);assert.equal(plan.generation.turns[0].text,phone.narration[index].tts);
   assert.ok(gemini38TtsSchema.safeParse(plan.generation).success);
  }
  assert.match(plans[0].generation.turns[0].style,/self-identification|identifying himself/);
  assert.match(plans[0].generation.turns[0].style,/falling|downward/);
  assert.doesNotMatch(plans[0].generation.turns[0].style,/skeptical confirmation/);
  assert.match(plans[1].generation.turns[0].style,/skeptical confirmation/);
  assert.doesNotMatch(plans[1].generation.turns[0].style,/self-identification/);
  // Constant nonzero PCM identifies the two inputs; the listener interval must be actual silence.
  for(const [index,line] of state.lines.entries()){
   const audio=path.join(dir,`phone-${index}.wav`),bytes=wav(1);
   for(let offset=44;offset<bytes.length;offset+=2)bytes.writeInt16LE((index+1)*1000,offset);
   writeFileSync(audio,bytes);
   state=manageSpeech({path:board,action:'attach_audio',lineId:line.id,expectedRevision:state.revision,audioPath:audio,generation:proof(line)});
  }
  const shotId=state.lines[0].shotId,plan=manageSpeech({path:board,action:'plan_video',shotId,capabilities:caps}).plan;
  assert.deepEqual(plan.performance.map(event=>event.kind),['dialogue','action','dialogue']);
  assert.equal(plan.durationSeconds,3);assert.equal(plan.performance[2].speechStartSeconds,2);
  assert.match(plan.videoPrompt,/listens to the caller/);
  // The supplied track carries the voice; its vocal direction stays in the TTS style, not the video prompt.
  assert.doesNotMatch(plan.videoPrompt,/falling|downward/);
  writeFileSync(path.join(work,'cards.tsv'),'0\tphone-0.wav\t1\n');
  const {compose,duration}=require('../../skills/produce/references/compose-speech.js');
  const output=compose(work,board)[0];assert.equal(duration(output.audioPath),3);
  assert.deepEqual(output.lineIds,['identify','confirm']);
  const {execFileSync}=require('node:child_process');
  const pcm=execFileSync('ffmpeg',['-v','error','-i',output.audioPath,'-f','s16le','-ac','1','-ar','48000','pipe:1']);
  const sample=seconds=>pcm.readInt16LE(Math.round(seconds*48000)*2);
  assert.equal(sample(.5),1000);assert.equal(sample(1.5),0);assert.equal(sample(2.5),2000);
  const silent=path.join(dir,'phone-silent.mp4');
  execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=s=16x16:r=24:d=3','-an','-c:v','libx264',silent]);
  const stereo=path.join(work,'phone-driver.wav');
  execFileSync('ffmpeg',['-v','error','-i',output.audioPath,'-ac','2','-c:a','pcm_s16le',stereo]);
  const stereoSha=createHash('sha256').update(readFileSync(stereo)).digest('hex');
  writeFileSync(silent+'.astra-job.json',JSON.stringify({status:'completed',jobId:'phone',mode:'audio2video',videoPath:silent,
    sha256:createHash('sha256').update(readFileSync(silent)).digest('hex'),conditioningAudioSha256:stereoSha,
    submittedRequest:{mode:'audio2video',audio_upload_id:'timed-phone-wav'}}));
  const attachSilent=()=>manageSpeech({path:board,action:'attach_video',shotId,expectedRevision:state.revision,videoPath:silent,tool:'astra_audio2video'});
  assert.throws(attachSilent,/conditioning_audio_unverified/,'the mono composition was not the uploaded file');
  writeFileSync(path.join(work,'cards.tsv'),'0\tphone-driver.wav\t1\tnone\n');
  state=attachSilent();
  const bound=require('../../skills/_shared/scenes-vm.js').evaluateWindowScript(readFileSync(file,'utf8')).SCENES[0].visual.video.speechBinding;
  assert.equal(bound.conditioningAudioPath,stereo);assert.equal(bound.conditioningAudioSha256,stereoSha);
  const cards=path.join(work,'cards.tsv');
  writeFileSync(path.join(work,'segs.tsv'),phone.narration.map((line,index)=>[0,index,silent,line.tts,line.sub].join('\t')).join('\n')+'\n');
  assert.deepEqual(compose(work,board),[]);
  require('../../skills/produce/references/prepare-source-audio.js').prepare(work,board);
  const selected=readFileSync(cards,'utf8');
  assert.equal(selected.split('\t')[1],'phone-driver.wav');assert.match(selected,/sync=1/);
  assert.equal(checker.check(work,board)[stereo],stereoSha);
  assert.deepEqual(checker.lastReport(work).actedIntervals[0].map(i=>[i.speechStartSeconds,i.speechEndSeconds]),[[0,1],[2,3]]);
  // The old mono composition and its valid sidecar cannot replace the stereo driver.
  writeFileSync(cards,selected.replace('phone-driver.wav','c0-speech.wav'));
  for(const run of [compose,checker.check])assert.throws(()=>run(work,board),/post_lipsync_forbidden/);
  writeFileSync(cards,selected);
  const original=readFileSync(file,'utf8'),revised=require('../../skills/_shared/scenes-vm.js').evaluateWindowScript(original);
  revised.SCENES[0].performance.find(e=>e.kind==='action').durationSeconds=0.5;
  writeFileSync(file,Object.entries(revised).map(([k,v])=>'window.'+k+'='+JSON.stringify(v)+';').join('\n'));
  for(const run of [compose,checker.check])assert.throws(()=>run(work,board),/conditioning_audio_unverified/);
  writeFileSync(file,original);
  setupProject(dir);
  const rendered=require('node:child_process').spawnSync('bash',[require.resolve('../../skills/produce/references/build-reel.sh'),work,board],{
    encoding:'utf8',timeout:60000,maxBuffer:8*1024*1024,env:{...process.env,W:'128',H:'224',FPS:'24',OUTRO:'0',COVER_TS:'1',SUB:'1'}});
  assert.equal(rendered.status,0,rendered.stdout+rendered.stderr);
  assert.equal(readFileSync(cards,'utf8'),selected);
  assert.equal(createHash('sha256').update(readFileSync(stereo)).digest('hex'),stereoSha);
  assert.deepEqual(readFileSync(path.join(work,'subs.srt'),'utf8').match(/\d\d:\d\d:\d\d,\d{3} --> \d\d:\d\d:\d\d,\d{3}/g),
    ['00:00:00,000 --> 00:00:01,000','00:00:02,000 --> 00:00:03,000']);
  const streams=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','stream=codec_type,duration','-of','json',path.join(work,'reel.mp4')])).streams;
  assert.deepEqual(streams.map(s=>[s.codec_type,Number(s.duration)]),[['video',3],['audio',3]]);
  const video=path.join(dir,'phone.mp4');spokenClip(video);
  state=manageSpeech({path:board,action:'attach_video',shotId,expectedRevision:state.revision,videoPath:video,capabilities:caps});
  const secondAudio=state.lines[1].audio;
  state=manageSpeech({path:board,action:'update',lineId:'identify',expectedRevision:state.revision,patch:{acting:{...phone.narration[0].acting,vocal:'Firm low falling self-identification, with natural connected Korean phrasing.'}}});
  assert.equal(state.invalidated.video.speechStatus,'stale');
  const current=manageSpeech({path:board,action:'list'}).lines;
  assert.equal(current[0].audioCurrent,false);assert.equal(current[1].audioCurrent,true);
  assert.deepEqual(current[1].audio,secondAudio);
  assert.deepEqual(compose(work,board),[], 'changed speech cannot be laid over the previous speaking take');
 });
 test('raw audio plans satisfy each adapter schema without unsupported style parameters',()=>{
  const line={tts:'Hello',acting:{emotion:'Concerned',vocal:'Quiet measured question'}};
  const variants=[['gemini',voice,ttsGenerateSchema],['gemini38',{...voice,model:'gemini-3.8-flash-tts',stylePrompt:undefined},gemini38TtsSchema],['eleven',{engine:'elevenlabs',voiceId:'voice123',language:'ko',speed:1,model:'eleven_v4',stability:0.4,similarity:0.8},elevenLabsGenerateSchema]];
  for(const [name,tts,schema] of variants){const plan=speechAudioPlan(line,{id:'a',tts});assert.ok(schema.safeParse(plan.arguments).success,name);assert.deepEqual(plan.arguments,plan.generation);if(name==='eleven'){assert.equal(plan.direction.supported,false);assert.ok(plan.direction.warnings.length);assert.equal(plan.arguments.stability,0.4);assert.equal(plan.arguments.similarity,0.8);assert.equal(plan.arguments.text,line.tts);}else assert.equal(plan.direction.supported,true);}
  for(const engine of ['supertonic','mlx'])assert.throws(()=>speechAudioPlan(line,{id:'a',tts:{engine,voiceId:'old',language:'ko',speed:1}}),/supported engine/);
  assert.throws(()=>speechAudioPlan({tts:'Hello',acting:{vocal:'a'.repeat(600)}},{id:'a',tts:{...voice,stylePrompt:undefined,model:'gemini-3.8-flash-tts'}}),/500 characters/);
  const {generationVoiceErrors}=require('../../skills/_shared/character-voice.js');
  const v38={...voice,stylePrompt:undefined,model:'gemini-3.8-flash-tts'},plan=speechAudioPlan(line,{id:'a',tts:v38});
  assert.deepEqual(generationVoiceErrors(v38,{generator:plan.generator,voiceSettings:plan.arguments,text:line.tts,language:'ko'},line),[]);
  assert.match(generationVoiceErrors(v38,{generator:plan.generator,voiceSettings:{...plan.arguments,turns:[{text:line.tts,style:'Happy'}]},text:line.tts,language:'ko'},line).join(),/Acting generation differs|resolved line acting/);
 });
 test('timing fields are finite bounded and legacy revisions stay unchanged',()=>{
  for(const acting of [{leadInSeconds:NaN},{tailOutSeconds:Infinity},{leadInSeconds:-1},{tailOutSeconds:5.1},{vocal:''},{unknown:'value'}])assert.equal(speechManageSchema.safeParse({path:'.',action:'update',patch:{acting}}).success,false);
  const line={tts:'Hello',speaker:'a',delivery:'on_screen'},character={id:'a',tts:voice};
  const {createHash}=require('node:crypto');assert.equal(speechRevision(line,character),createHash('sha256').update(JSON.stringify({...line,voice})).digest('hex'));
  assert.notEqual(speechRevision({...line,acting:{visual:'Look away'}},character),speechRevision(line,character));
 });
 test('composition preserves measured per-line anticipation/reaction, binds provenance and rejects stale acting',t=>{
  const {board,work,r}=fixture(t,[{tts:'First',speaker:'host',delivery:'voiceover',acting:{emotion:'Confused',leadInSeconds:0.25,tailOutSeconds:0.5}},{tts:'Second',speaker:'host',delivery:'voiceover',acting:{emotion:'Relieved',leadInSeconds:0.1,tailOutSeconds:0.2}}]);
  let next=r;
  for(const [i,line] of r.lines.entries()){const audio=path.join(work,`raw${i}.wav`);writeFileSync(audio,wav(i+1));next=manageSpeech({path:board,action:'attach_audio',lineId:line.id,expectedRevision:next.revision,audioPath:audio,generation:proof(line)});}
  const stored={};new Function('window',readFileSync(path.join(board,'scenes.js'),'utf8'))(stored);
  stored.SCENES[0].sound={audioSource:'video'};
  writeFileSync(path.join(board,'scenes.js'),Object.entries(stored).map(([k,v])=>`window.${k}=${JSON.stringify(v)};`).join('\n'));
  const candidate=path.join(work,'thought.mp4');writeFileSync(candidate,'image2video candidate');
  const attached=manageSpeech({path:board,action:'attach_video',shotId:r.lines[0].shotId,
   expectedRevision:manageSpeech({path:board,action:'list'}).revision,videoPath:candidate,
   capabilities:{...caps,nativeSpeech:true}});
  assert.equal(attached.plan.mode,'voiceover');assert.equal(attached.plan.audioFirst,true);
  const bound={};new Function('window',readFileSync(path.join(board,'scenes.js'),'utf8'))(bound);
  assert.equal(bound.SCENES[0].sound.audioSource,'speech');
  const plan=attached.plan;
  assert.equal(plan.boundary,'one_shot_per_generation');assert.equal(plan.timing,'measured');assert.equal(plan.durationSeconds,4.05);assert.equal(plan.performance[1].startSeconds,1.75);assert.equal(plan.performance[1].speechStartSeconds,1.85);
  writeFileSync(path.join(work,'cards.tsv'),'0\traw0.wav\t1\n');
  const {compose,duration}=require('../../skills/produce/references/compose-speech.js'),checker=require('../../skills/produce/references/check-tts-quality.js');
  const result=compose(work,board);assert.equal(result.length,1);assert.ok(Math.abs(duration(result[0].audioPath)-4.05)<0.001);assert.equal(result[0].status,'not_reviewed');assert.ok(checker.check(work,board)[result[0].audioPath]);
  const receiptFile=result[0].audioPath+'.generation.json',receipt=JSON.parse(readFileSync(receiptFile));receipt.lineSources[0].leadInSeconds=0;writeFileSync(receiptFile,JSON.stringify(receipt));assert.throws(()=>checker.check(work,board),/composition is stale/);
  compose(work,board);
  const wrongIntervals=JSON.parse(readFileSync(receiptFile));wrongIntervals.intervals[1].startSeconds=0;writeFileSync(receiptFile,JSON.stringify(wrongIntervals));assert.throws(()=>checker.check(work,board),/timing intervals are stale/);compose(work,board);
  const file=path.join(board,'scenes.js'),win={};new Function('window',readFileSync(file,'utf8'))(win);win.SCENES[0].narration[0].acting.emotion='Angry';writeFileSync(file,Object.entries(win).map(([k,v])=>`window.${k}=${JSON.stringify(v)};`).join('\n'));assert.throws(()=>checker.check(work,board),/Dialogue or voice changed/);assert.throws(()=>compose(work,board),/Acting generation differs|resolved line acting/);
 });

 test('historical recordings remain inspectable without reopening removed generators',t=>{
  const {board,work}=fixture(t),file=path.join(board,'scenes.js'),audio=path.join(work,'historical.wav');
  writeFileSync(audio,wav(1));const {createHash}=require('node:crypto');
  const variants=[{engine:'supertonic',voiceId:'M1',language:'ko',speed:1},{engine:'mlx',voiceId:'speaker',language:'ko',speed:1},{engine:'elevenlabs',model:'eleven_v3',voiceId:'old-actor',language:'ko',speed:1}];
  for(const tts of variants){
   const character={id:'actor',tts},line={id:'old-line',speaker:'actor',delivery:'voiceover',tts:'Existing recording'};
   line.audio={path:audio,sha256:createHash('sha256').update(readFileSync(audio)).digest('hex'),revision:speechRevision(line,character),status:'not_reviewed',generation:{generator:tts.engine==='supertonic'?'tts_local_generate':tts.engine==='mlx'?'mlx_tts_generate':'tts_elevenlabs_generate',text:line.tts,voiceSettings:{voiceId:tts.voiceId,model:tts.model},language:'ko'}};
   const before=JSON.stringify(line.audio),win={STORY:{version:'story-v2'},SB_DOC:{speechPlanVersion:1,characters:[character]},SCENES:[{id:'s1',type:'points',narration:[line]}]};
   writeFileSync(file,Object.entries(win).map(([k,v])=>`window.${k}=${JSON.stringify(v)};`).join('\n'));
   let state=manageSpeech({path:board,action:'list'});assert.equal(state.lines[0].generationPlan.available,false);assert.ok(state.lines[0].generationPlan.warnings.length);assert.equal(state.lines[0].audioCurrent,false);assert.equal(state.lines[0].audioProvenanceStatus,'preserved_historical_recording_unverified');assert.equal(JSON.stringify(state.lines[0].audio),before);
   state=manageSpeech({path:board,action:'prepare',expectedRevision:state.revision});assert.equal(JSON.stringify(state.lines[0].audio),before);assert.equal(state.lines[0].audioProvenanceStatus,'preserved_historical_recording_unverified');
   assert.throws(()=>manageSpeech({path:board,action:'plan_audio',lineId:line.id}),/supported engine|Unsupported ElevenLabs model/);
  }
 });
 test('ElevenLabs emits only authored compact cues while Gemini keeps rich scene direction',()=>{
  const tts={engine:'elevenlabs',voiceId:'actor123',model:'eleven_v4',language:'ko',speed:1,stability:0.4,similarity:0.8};
  const line={tts:'What?',acting:{direction:'confused',tags:['sigh'],context:'A long explanation of a surprising result at the live sales event.',intent:'Ask the partner to explain the unexpected result.',emotion:'Surprised and doubtful.',vocal:'Start softly after a brief breath; avoid the former cheerful sales presentation.',visual:'Look at the partner.'}};
  const plan=speechAudioPlan(line,{id:'a',tts});
  assert.equal(plan.arguments.text,'[confused] [sigh] What?');assert.equal(plan.direction.stylePrompt,'confused');assert.equal(plan.direction.supported,true);assert.deepEqual(plan.direction.inlineCues,['confused','sigh']);
  const {generationVoiceErrors}=require('../../skills/_shared/character-voice.js');
  assert.deepEqual(generationVoiceErrors(tts,{generator:plan.generator,text:line.tts,language:'ko',voiceSettings:plan.arguments},line),[]);
  assert.match(generationVoiceErrors(tts,{generator:plan.generator,text:line.tts,language:'ko',voiceSettings:{...plan.arguments,text:'['+line.acting.context+'] '+line.tts}},line).join(),/Acting generation differs/);
  const gemini=speechAudioPlan({...line,acting:{...line.acting,tags:[]}},{id:'a',tts:voice});assert.match(gemini.arguments.stylePrompt,/long explanation/);assert.match(gemini.arguments.stylePrompt,/Start softly/);
  const withoutCue={...line,acting:{...line.acting}};delete withoutCue.acting.direction;delete withoutCue.acting.tags;
  const missing=speechAudioPlan(withoutCue,{id:'a',tts});assert.equal(missing.arguments.text,line.tts);assert.equal(missing.direction.supported,false);assert.equal(missing.direction.stylePrompt,undefined);assert.match(missing.direction.warnings.join(),/short acting.direction/);
 });

 test('concurrent action shares speech time, longer action delays next speaker, and composition preserves silent reaction',t=>{
  const {board,work,r}=fixture(t,[{tts:'First',speaker:'host',delivery:'off_screen'},{tts:'Second',speaker:'host',delivery:'off_screen'}]);
  let state=r;
  for(const [i,line] of r.lines.entries()){const audio=path.join(work,`raw${i}.wav`);writeFileSync(audio,wav(1));state=manageSpeech({path:board,action:'attach_audio',lineId:line.id,expectedRevision:state.revision,audioPath:audio,generation:proof(line)});}
  const file=path.join(board,'scenes.js'),win={};new Function('window',readFileSync(file,'utf8'))(win);
  win.SCENES[0].performance=[{kind:'action',character:'host',text:'Opens the door.',durationSeconds:0.5},
   {kind:'action',character:'host',text:'Slides parcel across table while speaking.',withGroup:1,durationSeconds:2},
   {kind:'dialogue',character:'host',to:'self',group:1},
   {kind:'dialogue',character:'host',to:'self',group:2},
   {kind:'action',character:'host',text:'Recoils from the parcel.',durationSeconds:0.75}];
  writeFileSync(file,Object.entries(win).map(([k,v])=>`window.${k}=${JSON.stringify(v)};`).join('\n'));
  const plan=manageSpeech({path:board,action:'plan_video',shotId:r.lines[0].shotId,capabilities:caps}).plan;
  assert.equal(plan.durationSeconds,4.25);assert.equal(plan.timing,'planned_actions_with_measured_audio');
  assert.equal(plan.performance[2].speechStartSeconds,0.5);assert.equal(plan.performance[3].speechStartSeconds,2.5);
  assert.equal(plan.performance[1].startSeconds,0.5);assert.equal(plan.performance[1].endSeconds,2.5);
  writeFileSync(path.join(work,'cards.tsv'),'0\traw0.wav\t1\n');
  const {compose,duration}=require('../../skills/produce/references/compose-speech.js'),checker=require('../../skills/produce/references/check-tts-quality.js');
  const result=compose(work,board);assert.ok(Math.abs(duration(result[0].audioPath)-4.25)<0.001);assert.ok(checker.check(work,board)[result[0].audioPath]);
  win.SCENES[0].performance[4].durationSeconds=1;
  writeFileSync(file,Object.entries(win).map(([k,v])=>`window.${k}=${JSON.stringify(v)};`).join('\n'));
  assert.throws(()=>checker.check(work,board),/preserve planned acting timing/);
 });

 test('performance references fail clearly and unplaced speech is exposed rather than dropped',()=>{
  const {planScenePerformance}=require('../../skills/_shared/scene-acting.js');
  const narration=[{speaker:'a',tts:'One'},{speaker:'b',tts:'Two'}];
  assert.throws(()=>planScenePerformance({narration,performance:[{kind:'dialogue',character:'b',group:1}]}),/differs/);
  assert.throws(()=>planScenePerformance({narration,performance:[{kind:'action',character:'a',text:'Moves',withGroup:3}]}),/reference/);
  const result=planScenePerformance({narration,performance:[{kind:'dialogue',character:'a',to:'b',group:1}]},()=>1);
  assert.equal(result.performance.length,2);assert.match(result.warnings.join(),/group 2 is absent/);assert.equal(result.durationSeconds,2);
 });

 test('new scene timing version refuses unresolved independent actions while silent plans stay truthful',()=>{
  const {sceneTiming}=require('../../skills/produce/references/compose-speech.js');
  const scene={narration:[],performance:[{kind:'action',character:'host',text:'Opens the door.'}]};
  assert.throws(()=>sceneTiming(scene,'.',1),/finite action timing/);
  scene.performance[0].durationSeconds=2;
  const plan=speechVideoPlan(scene,caps);assert.equal(plan.durationSeconds,2);assert.equal(plan.timing,'planned_actions');
  assert.match(plan.videoPrompt,/without invented speech or voiceover/);assert.doesNotMatch(plan.videoPrompt,/separately supplied voiceover plays/);
 });

 test('ASTRA video plans diagnose the exact adapter prompt limit without truncating performance',()=>{
  const scene={narration:[],performance:[{kind:'action',character:'host',text:'x',durationSeconds:2}]};
  const astra={...caps,provider:'astra'};
  const base=speechVideoPlan(scene,astra).videoPrompt.length;
  for(const length of [ASTRA_VIDEO_MAX_PROMPT_CHARS-1,ASTRA_VIDEO_MAX_PROMPT_CHARS,ASTRA_VIDEO_MAX_PROMPT_CHARS+1]){
   scene.performance[0].text='x'.repeat(length-base+1);
   const before=JSON.stringify(scene),plan=speechVideoPlan(scene,astra);
   assert.equal(plan.videoPrompt.length,length);
   assert.deepEqual(plan.promptLength,{characters:length,maxCharacters:ASTRA_VIDEO_MAX_PROMPT_CHARS,exceeded:length>ASTRA_VIDEO_MAX_PROMPT_CHARS});
   assert.equal(plan.warnings.some(message=>message.includes('adapter limit')),length>ASTRA_VIDEO_MAX_PROMPT_CHARS);
   assert.equal(plan.performance[0].text,scene.performance[0].text);
   assert.equal(JSON.stringify(scene),before);
   assert.equal(plan.review,'not_reviewed');
  }
 });

 test('reattaching unchanged video preserves stale performance evidence until footage changes',t=>{
  const {board,work}=fixture(t,[]),file=path.join(board,'scenes.js'),video=path.join(work,'clip.mp4');
  const read=()=>{const w={};new Function('window',readFileSync(file,'utf8'))(w);return w;};
  const save=w=>writeFileSync(file,Object.entries(w).map(([k,v])=>`window.${k}=${JSON.stringify(v)};`).join('\n'));
  const w=read(),shotId=w.SCENES[0].id;
  w.SCENES[0].performance=[{kind:'action',character:'host',text:'Opens the parcel.',durationSeconds:1}];save(w);
  writeFileSync(video,'first clip');
  const attach=()=>manageSpeech({path:board,action:'attach_video',shotId,expectedRevision:manageSpeech({path:board,action:'list'}).revision,videoPath:video,capabilities:caps});
  attach();const original=read().SCENES[0].visual.video.speechBinding;
  assert.equal(attach().invalidated,undefined);
  const revised=read();revised.SCENES[0].performance[0].text='Throws the parcel away.';save(revised);
  const result=attach(),stale=read().SCENES[0].visual.video;
  assert.equal(stale.speechStatus,'stale');assert.deepEqual(stale.speechBinding,original);
  assert.match(result.plan.warnings.join(),/Unchanged video bytes/);
  writeFileSync(video,'new action clip');attach();
  const current=read().SCENES[0].visual.video;
  assert.equal(current.speechStatus,'current');assert.notEqual(current.speechBinding.performanceRevision,original.performanceRevision);
 });

 test('public video attachment cannot rebind unchanged lip sync to a regenerated same-line audio take',t=>{
  const {board,work,r}=fixture(t),line=r.lines[0],audio=path.join(work,'take.wav'),video=path.join(work,'clip.mp4');
  const read=()=>{const w={};new Function('window',readFileSync(path.join(board,'scenes.js'),'utf8'))(w);return w.SCENES[0].visual.video;};
  const revision=()=>manageSpeech({path:board,action:'list'}).revision;
  const attachAudio=()=>manageSpeech({path:board,action:'attach_audio',lineId:line.id,expectedRevision:revision(),audioPath:audio,generation:proof(line)});
  const attachVideo=()=>manageSpeech({path:board,action:'attach_video',shotId:line.shotId,expectedRevision:revision(),videoPath:video,capabilities:caps});
  writeFileSync(audio,wav(1));spokenClip(video);attachAudio();attachVideo();
  const original=read().speechBinding;
  writeFileSync(audio,wav(2));attachAudio();assert.equal(read().speechStatus,'stale');
  const result=attachVideo();
  assert.equal(read().speechStatus,'stale');assert.deepEqual(read().speechBinding,original);
  assert.equal(result.plan.performanceRevision,original.performanceRevision);
  assert.match(result.plan.warnings.join(),/Unchanged video bytes.*audio binding/);
  spokenClip(video,660);attachVideo();
  assert.equal(read().speechStatus,'current');assert.notDeepEqual(read().speechBinding.audio,original.audio);
  assert.equal(read().speechBinding.durationSeconds,2);
 });

 test('silent action execution needs finite timing and enough audio time but allows padding and legacy clocks',t=>{
  const {board,work}=fixture(t,[]),file=path.join(board,'scenes.js'),w={};new Function('window',readFileSync(file,'utf8'))(w);
  const save=()=>writeFileSync(file,Object.entries(w).map(([k,v])=>`window.${k}=${JSON.stringify(v)};`).join('\n'));
  w.SB_DOC.performanceTimingVersion=1;w.SCENES[0].duration=0.5;
  w.SCENES[0].performance=[{kind:'action',character:'host',text:'Opens the door.'}];save();
  writeFileSync(path.join(work,'silent.wav'),wav(1));writeFileSync(path.join(work,'cards.tsv'),'0\tsilent.wav\t1\n');
  const {compose}=require('../../skills/produce/references/compose-speech.js'),checker=require('../../skills/produce/references/check-tts-quality.js');
  for(const run of [()=>compose(work,board),()=>checker.check(work,board)])assert.throws(run,/finite action timing/);
  w.SCENES[0].performance[0].durationSeconds=2;save();
  for(const run of [()=>compose(work,board),()=>checker.check(work,board)])assert.throws(run,/shorter than planned action timing/);
  writeFileSync(path.join(work,'silent.wav'),wav(3));assert.deepEqual(compose(work,board),[]);assert.ok(checker.check(work,board));
  delete w.SB_DOC.performanceTimingVersion;delete w.SCENES[0].performance[0].durationSeconds;save();
  assert.deepEqual(compose(work,board),[]);assert.ok(checker.check(work,board));
  w.SB_DOC.performanceTimingVersion=1;
  w.SCENES[0].performance.push({kind:'dialogue',character:'host',group:1});
  w.STORY.transcripts=[{shot:1,source:'recording.mp4',groups:[{speaker:'host',text:'Hello',start:0,end:1}]}];save();
  assert.deepEqual(compose(work,board),[]);assert.ok(checker.check(work,board));
 });

 test('video direction translates only adapter visuals and participates in performance provenance',()=>{
  const scene={narration:[{id:'a',speaker:'host',delivery:'off_screen',tts:'Hello',acting:{visual:'문 쪽을 본다.'}}],performance:[
   {kind:'action',character:'host',text:'소포를 내려놓는다.',durationSeconds:1,videoDirection:'Places the parcel down.'},
   {kind:'dialogue',character:'host',to:'self',group:1,videoDirection:'Looks toward the door.'}]};
  const plan=speechVideoPlan(scene,caps);
  assert.match(plan.videoPrompt,/Places the parcel down/);assert.match(plan.videoPrompt,/Looks toward the door/);
  assert.doesNotMatch(plan.videoPrompt,/소포|문 쪽/);assert.equal(plan.performance[0].text,'소포를 내려놓는다.');
  scene.performance[0].videoDirection='Sets the parcel on the floor.';
  assert.notEqual(speechVideoPlan(scene,caps).performanceRevision,plan.performanceRevision);
  scene.performance[0].videoDirection=' ';assert.throws(()=>speechVideoPlan(scene,caps),/non-empty text/);
 });
});
