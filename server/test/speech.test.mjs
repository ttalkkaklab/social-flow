import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {manageSpeech,speechVideoPlan} from '../dist/speech.js';
const require=createRequire(import.meta.url);
const voice={engine:'gemini',voiceId:'Kore',language:'ko',speed:1};
const caps={provider:'replaceable',model:'first',audioConditioning:true,lipSync:true,postLipSync:false,evidence:'fixture adapter contract'};
function setup(t){
 const dir=mkdtempSync(path.join(tmpdir(),'shot-speech-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 mkdirSync(path.join(dir,'storyboard'));mkdirSync(path.join(dir,'.work'));
 const target=path.join(dir,'storyboard');
 const board={SB_DOC:{narratorCharacterId:'narrator',characters:[{id:'narrator',name:'Narrator',tts:voice},{id:'hero',name:'Hero',tts:voice}]},SCENES:[{type:'points',narration:[{tts:'Hello',sub:'Hello',speaker:'hero'}],visual:{video:{src:'old.mp4'}}},{type:'points',narration:[{tts:'Outside',sub:'Outside'}]}]};
 writeFileSync(path.join(target,'scenes.js'),Object.entries(board).map(([k,v])=>`window.${k}=${JSON.stringify(v)};`).join('\n'));
 let r=manageSpeech({path:target,action:'list'});r=manageSpeech({path:target,action:'prepare',expectedRevision:r.revision});
 return {dir,target,r};
}
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
test('video adapters select by capabilities, never a provider name',()=>{
 const lines=[{id:'a',speaker:'hero',delivery:'on_screen',tts:'Hello'}];
 assert.equal(speechVideoPlan(lines,caps).mode,'audio_conditioned');
 assert.equal(speechVideoPlan(lines,{...caps,provider:'another',model:'second'}).mode,'audio_conditioned');
 assert.equal(speechVideoPlan(lines,{...caps,audioConditioning:false,postLipSync:true}).mode,'post_lipsync');
 assert.throws(()=>speechVideoPlan(lines,{...caps,audioConditioning:false}),/cannot synchronize/);
 assert.equal(speechVideoPlan([{...lines[0],delivery:'voiceover'}],caps).mode,'voiceover');
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
test('production requires neither an AI review nor human approval; missing files still fail',t=>{
 const {dir,target}=setup(t);writeFileSync(path.join(target,'scenes.js'),"window.SCENES=[{type:'points',narration:[{tts:'Hello'}]}];");
 const work=path.join(dir,'.work'),audio=path.join(work,'c0.wav');writeFileSync(audio,'audio');writeFileSync(path.join(work,'cards.tsv'),'0\tc0.wav\t1\n');
 const checker=require('../../skills/produce/references/check-tts-quality.js');assert.ok(checker.check(work,target)[audio]);
 assert.equal(checker.lastReport(work).status,'not_reviewed');
 const final=require('../../skills/produce/references/check-final-tts.js');writeFileSync(path.join(work,'reel-fast.mp4'),'video');
 final.review(work);const record=final.evidence(path.join(work,'reel-fast.mp4'),'Hello',work);
 assert.equal(record.status,'not_reviewed');assert.equal(final.verifyEvidence(record,path.join(work,'reel-fast.mp4'),'Hello'),record);
 assert.throws(()=>final.verifyEvidence(record,path.join(work,'reel-fast.mp4'),'Other'),/other media/);
 rmSync(audio);assert.throws(()=>checker.check(work,target),/ENOENT/);
});
test('same-text audio retake invalidates bound lip-sync video until rebound',t=>{
 const {dir,target,r}=setup(t),line=r.lines[0];
 const audio=path.join(dir,'take1.wav'),retake=path.join(dir,'take2.wav'),video=path.join(dir,'clip.mp4');
 writeFileSync(audio,'first audio');writeFileSync(retake,'different timing');writeFileSync(video,'video fixture');
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
 execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','sine=frequency=440:duration=1','-c:a','pcm_s16le',audio]);writeFileSync(video,'video fixture');
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
