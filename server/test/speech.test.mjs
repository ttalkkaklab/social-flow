import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {manageSpeech,speechVideoPlan} from '../dist/speech.js';
const require=createRequire(import.meta.url);
const voice={engine:'supertonic',voiceId:'M1',language:'ko',speed:1};
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
 const generation={generator:'tts_local_generate',voiceSettings:{voice:'M1',lang:'ko',speed:1},text:'Hello'};
 assert.throws(()=>manageSpeech({path:target,action:'attach_audio',lineId:line.id,expectedRevision:r.revision,audioPath:audio,generation:{...generation,voiceSettings:{voice:'F1'}}}),/pinned/);
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
 const generation={generator:'tts_local_generate',voiceSettings:{voice:'M1',lang:'ko',speed:1},text:'Hello'};
 let next=manageSpeech({path:target,action:'attach_audio',lineId:line.id,expectedRevision:r.revision,audioPath:audio,generation});
 next=manageSpeech({path:target,action:'attach_video',shotId:line.shotId,expectedRevision:next.revision,videoPath:video,capabilities:caps});
 next=manageSpeech({path:target,action:'attach_audio',lineId:line.id,expectedRevision:next.revision,audioPath:audio,generation});
 assert.equal(next.invalidated,undefined);
 next=manageSpeech({path:target,action:'attach_audio',lineId:line.id,expectedRevision:next.revision,audioPath:retake,generation});
 assert.equal(next.invalidated.video.speechStatus,'stale');assert.equal(next.invalidated.edit,true);
 assert.equal(next.lines[0].audioCurrent,true);
 assert.match(readFileSync(path.join(target,'scenes.js'),'utf8'),/"speechStatus": "stale"/);
});
for(const engine of ['gemini','mlx'])test(engine+' raw API arguments attach and pass assembly provenance without invented language arguments',t=>{
 const {dir,target,r}=setup(t),line=r.lines[1];
 const board=path.join(target,'scenes.js');let source=readFileSync(board,'utf8');
 const replacement={engine,voiceId:engine==='gemini'?'Kore':'speaker-a',language:'Korean',speed:1};
 source=source.replaceAll(JSON.stringify(voice,null,2),JSON.stringify(replacement,null,2));
 // serializeBoard indents nested fields; use its parsed object to change the pinned identity.
 const win={};new Function('window',source)(win);win.SB_DOC.characters.forEach(c=>c.tts=replacement);
 win.SCENES=[win.SCENES[1]];writeFileSync(board,Object.entries(win).map(([k,v])=>`window.${k}=${JSON.stringify(v)};`).join('\n'));
 const audio=path.join(dir,'.work','c0.wav');writeFileSync(audio,'fixture bytes');
 const revision=manageSpeech({path:target,action:'list'}).revision;
 const generation={generator:engine==='gemini'?'tts_generate':'mlx_tts_generate',voiceSettings:engine==='gemini'?{voiceName:'Kore'}:{voice:'speaker-a'},language:'ko',text:'Outside'};
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
