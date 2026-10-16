import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {manageSpeech,speechAudioPlan,speechVideoPlan,speechManageSchema,speechRevision} from '../dist/speech.js';
import {ttsGenerateSchema,gemini38TtsSchema} from '../dist/tts-client.js';
import {elevenLabsGenerateSchema} from '../dist/elevenlabs-client.js';
const require=createRequire(import.meta.url),voice={engine:'gemini',voiceId:'Kore',model:'gemini-2.5-flash-preview-tts',language:'ko',speed:1,stylePrompt:'Bright confident sales smile.'};
const caps={provider:'fixture',model:'acting',audioConditioning:true,lipSync:true,postLipSync:false,evidence:'test adapter'};
function wav(seconds){const b=Buffer.alloc(44+48000*seconds*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(48000,24);b.writeUInt32LE(96000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(b.length-44,40);return b;}
function fixture(t,lines=[{tts:'What did I pass?',speaker:'host',delivery:'on_screen'}]) {
 const dir=mkdtempSync(path.join(tmpdir(),'acting-contract-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const board=path.join(dir,'storyboard'),work=path.join(dir,'.work');mkdirSync(board);mkdirSync(work);
 const win={STORY:{version:'story-v2'},SB_DOC:{characters:[{id:'host',tts:voice}]},SCENES:[{type:'points',narration:lines,visual:{video:{}}}]};
 writeFileSync(path.join(board,'scenes.js'),Object.entries(win).map(([k,v])=>`window.${k}=${JSON.stringify(v)};`).join('\n'));
 let r=manageSpeech({path:board,action:'list'});r=manageSpeech({path:board,action:'prepare',expectedRevision:r.revision});
 return {dir,board,work,r};
}
const proof=line=>({generator:line.generationPlan.generator,voiceSettings:line.generationPlan.arguments,text:line.tts,language:line.generationPlan.language});
test('scene acting replaces cheerful baseline, rejects old style and keeps voice pinned',t=>{
 const {dir,board,r}=fixture(t),line=r.lines[0],audio=path.join(dir,'line.wav');writeFileSync(audio,wav(1));
 let next=manageSpeech({path:board,action:'update',lineId:line.id,expectedRevision:r.revision,patch:{acting:{context:'Unexpected result',emotion:'Confused',vocal:'Ask quietly, no smile',visual:'Smile fades; look at partner'}}});
 const planned=manageSpeech({path:board,action:'plan_audio',lineId:line.id});assert.equal(planned.audioPlans.length,1);
 assert.doesNotMatch(planned.audioPlans[0].arguments.stylePrompt,/sales smile/);assert.match(planned.audioPlans[0].arguments.stylePrompt,/Confused/);
 assert.throws(()=>manageSpeech({path:board,action:'attach_audio',lineId:line.id,expectedRevision:next.revision,audioPath:audio,generation:proof(line)}),/Acting generation differs|resolved line acting/);
 const current=next.lines[0],generation=proof(current);
 assert.throws(()=>manageSpeech({path:board,action:'attach_audio',lineId:line.id,expectedRevision:next.revision,audioPath:audio,generation:{...generation,voiceSettings:{...generation.voiceSettings,voiceName:'Puck'}}}),/voiceId/);
 next=manageSpeech({path:board,action:'attach_audio',lineId:line.id,expectedRevision:next.revision,audioPath:audio,generation});
 const video=path.join(dir,'clip.mp4');writeFileSync(video,'fixture video');
 next=manageSpeech({path:board,action:'attach_video',shotId:line.shotId,expectedRevision:next.revision,videoPath:video,capabilities:caps});
 next=manageSpeech({path:board,action:'update',lineId:line.id,expectedRevision:next.revision,patch:{acting:{emotion:'Relieved'}}});
 assert.ok(next.invalidated.audio);assert.equal(next.invalidated.video.speechStatus,'stale');assert.equal(next.lines[0].audioCurrent,false);
 assert.doesNotMatch(next.lines[0].generationPlan.arguments.stylePrompt,/sales smile/);
 next=manageSpeech({path:board,action:'update',lineId:line.id,expectedRevision:next.revision,patch:{acting:null}});
 assert.equal(next.lines[0].acting,undefined);assert.equal(next.lines[0].generationPlan.arguments.stylePrompt,voice.stylePrompt);
});
test('raw audio plans satisfy each adapter schema without unsupported style parameters',()=>{
 const line={tts:'Hello',acting:{emotion:'Concerned',vocal:'Quiet measured question'}};
 const variants=[['gemini',voice,ttsGenerateSchema],['gemini38',{...voice,model:'gemini-3.8-flash-tts',stylePrompt:undefined},gemini38TtsSchema],['eleven',{engine:'elevenlabs',voiceId:'voice123',language:'ko',speed:1,model:'eleven_v4',stability:0.4,similarity:0.8},elevenLabsGenerateSchema]];
 for(const [name,tts,schema] of variants){const plan=speechAudioPlan(line,{id:'a',tts});assert.ok(schema.safeParse(plan.arguments).success,name);assert.deepEqual(plan.arguments,plan.generation);if(name==='eleven'){assert.equal(plan.direction.supported,false);assert.ok(plan.direction.warnings.length);assert.equal(plan.arguments.stability,0.4);assert.equal(plan.arguments.similarity,0.8);assert.equal(plan.arguments.text,line.tts);}else assert.equal(plan.direction.supported,true);}
 for(const engine of ['supertonic','mlx'])assert.throws(()=>speechAudioPlan(line,{id:'a',tts:{engine,voiceId:'old',language:'ko',speed:1}}),/supported engine/);
 const tooLong=speechAudioPlan({tts:'Hello',acting:{vocal:'a'.repeat(600)}},{id:'a',tts:{...voice,stylePrompt:undefined,model:'gemini-3.8-flash-tts'}});
 assert.equal(tooLong.direction.supported,false);assert.equal(tooLong.arguments.turns[0].style,undefined);assert.ok(gemini38TtsSchema.safeParse(tooLong.arguments).success);
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
 const plan=manageSpeech({path:board,action:'plan_video',shotId:r.lines[0].shotId,capabilities:caps}).plan;
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
test('baseline generation receipts cannot substitute another spoken line or tagged turn',()=>{
 const {generationVoiceErrors}=require('../../skills/_shared/character-voice.js'),line={tts:'Original line'};
 const single={generator:'tts_generate',language:'ko',text:line.tts,voiceSettings:{model:voice.model,voiceName:voice.voiceId,stylePrompt:voice.stylePrompt,text:'Different line'}};
 assert.match(generationVoiceErrors(voice,single,line).join(),/Generation text differs/);
 const v38={...voice,model:'gemini-3.8-flash-tts',stylePrompt:undefined};
 const turns={generator:'tts_gemini_38',language:'ko',text:line.tts,voiceSettings:{model:v38.model,voice:v38.voiceId,turns:[{text:'Different line'}]}};
 assert.match(generationVoiceErrors(v38,turns,line).join(),/Generation turns differ/);
 turns.voiceSettings.turns=[{text:'<sigh> '+line.tts}];assert.match(generationVoiceErrors(v38,turns,line).join(),/Generation turns differ/);
 delete single.voiceSettings.text;assert.deepEqual(generationVoiceErrors(voice,single,line),[]);
});


test('composer supports multiple speakers with optional acting omitted',t=>{
 const {board,work,r}=fixture(t,[{tts:'First',speaker:'host',delivery:'voiceover'},{tts:'Second',speaker:'host',delivery:'voiceover'}]);
 const file=path.join(board,'scenes.js'),win={};new Function('window',readFileSync(file,'utf8'))(win);
 win.SB_DOC.characters.push({id:'guest',tts:{...voice,voiceId:'Puck'}});win.SCENES[0].narration[1].speaker='guest';
 writeFileSync(file,Object.entries(win).map(([k,v])=>`window.${k}=${JSON.stringify(v)};`).join('\n'));
 let state=manageSpeech({path:board,action:'list'});const lines=state.lines;
 for(const [i,line] of lines.entries()){const audio=path.join(work,`raw${i}.wav`);writeFileSync(audio,wav(1));state=manageSpeech({path:board,action:'attach_audio',lineId:line.id,expectedRevision:state.revision,audioPath:audio,generation:proof(line)});}
 writeFileSync(path.join(work,'cards.tsv'),'0\traw0.wav\t1\n');
 const {compose,duration}=require('../../skills/produce/references/compose-speech.js'),checker=require('../../skills/produce/references/check-tts-quality.js');
 const result=compose(work,board);assert.equal(result.length,1);assert.equal(duration(result[0].audioPath),2);assert.deepEqual(result[0].lineIds,lines.map(n=>n.id));assert.ok(checker.check(work,board)[result[0].audioPath]);
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


test('every video speech route is text-free while exact dialogue stays available for verification',()=>{
 const spoken='무슨 합격이요?';
 const cases=[{delivery:'on_screen',capabilities:caps,mode:'audio_conditioned'},
  {delivery:'on_screen',capabilities:{...caps,audioConditioning:false,lipSync:false,postLipSync:true},mode:'post_lipsync'},
  {delivery:'off_screen',capabilities:caps,mode:'voiceover'}];
 for(const item of cases){
  const line={id:'d-confused',speaker:'host',tts:spoken,delivery:item.delivery,acting:{context:'She heard '+spoken,intent:'Clarify the result',emotion:'Confused',visual:'Lower hands and look at the applicant',leadInSeconds:0.25,tailOutSeconds:0.4}};
  const before=JSON.stringify(line),plan=speechVideoPlan([line],item.capabilities);
  assert.equal(plan.mode,item.mode);assert.equal(plan.textPolicy,'no_visible_text');
  assert.match(plan.instructions,/no subtitles, captions/);assert.match(plan.videoPrompt,/text-free surfaces/);
  assert.match(plan.videoPrompt,/Lower hands/);assert.equal(plan.videoPrompt.includes(spoken),false);
  assert.equal(plan.performance[0].text,spoken);assert.equal(JSON.stringify(line),before);
 }
 const silent=speechVideoPlan([],caps);assert.match(silent.videoPrompt,/no subtitles, captions/);
});

test('legacy direction and vocal tags reach video beats without copying the transcript',()=>{
 const spoken='무슨 합격이요?';
 for(const acting of [{direction:'quiet, confused'}, {direction:'quiet, confused',tags:['sigh']}]){
  const plan=speechVideoPlan([{id:'legacy',speaker:'host',tts:spoken,delivery:'on_screen',acting}],caps);
  assert.match(plan.videoPrompt,/direction: quiet, confused/);
  if(acting.tags)assert.match(plan.videoPrompt,/vocal events: sigh/);
  assert.equal(plan.videoPrompt.includes(spoken),false);
  assert.equal(plan.performance[0].text,spoken);
  assert.deepEqual(plan.performance[0].acting,acting);
 }
});

test('mixed video speech preserves speaker identities and confines mouth sync to on-screen lines',()=>{
 const lines=[
  {id:'a',speaker:'host',delivery:'on_screen',tts:'무슨 합격이요?',acting:{direction:'quiet, confused'}},
  {id:'b',speaker:'applicant',delivery:'off_screen',tts:'면접 말입니다.'},
  {id:'c',speaker:'narrator',delivery:'voiceover',tts:'서로 다른 생각이었다.'},
 ];
 const plan=speechVideoPlan(lines,caps);
 assert.equal(plan.mode,'audio_conditioned');
 const beats=plan.videoPrompt.split('\n').filter(row=>row.startsWith('Beat '));
 assert.match(beats[0],/speaker: host; delivery: on_screen/);
 assert.match(beats[0],/synchronize only this speaker's mouth/);
 assert.match(beats[1],/speaker: applicant; delivery: off_screen/);
 assert.match(beats[1],/speaker stays off screen.*visible mouths stay closed/);
 assert.match(beats[2],/speaker: narrator; delivery: voiceover/);
 assert.match(beats[2],/voiceover or narration.*visible mouths stay closed/);
 assert.deepEqual(plan.performance.map(line=>line.text),lines.map(line=>line.tts));
 assert.ok(lines.every(line=>!plan.videoPrompt.includes(line.tts)));
});
