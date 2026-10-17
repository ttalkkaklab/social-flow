import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {manageSpeech,speechAudioPlan,speechVideoPlan,speechManageSchema,speechRevision} from '../dist/speech.js';
import {ttsGenerateSchema,gemini38TtsSchema} from '../dist/tts-client.js';
import {elevenLabsGenerateSchema} from '../dist/elevenlabs-client.js';
import {ASTRA_VIDEO_MAX_PROMPT_CHARS} from '../dist/astra-video-client.js';
const require=createRequire(import.meta.url),voice={engine:'gemini',voiceId:'Kore',model:'gemini-2.5-flash-preview-tts',language:'ko',speed:1,stylePrompt:'Bright confident sales smile.'};
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
 win.SB_DOC.performanceTimingVersion=1;win.SCENES[0].performance=phone.performance;
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
 assert.match(plan.videoPrompt,/listens to the caller/);assert.match(plan.videoPrompt,/falling|downward/);
 writeFileSync(path.join(work,'cards.tsv'),'0\tphone-0.wav\t1\n');
 const {compose,duration}=require('../../skills/produce/references/compose-speech.js');
 const output=compose(work,board)[0];assert.equal(duration(output.audioPath),3);
 assert.deepEqual(output.lineIds,['identify','confirm']);
 const {execFileSync}=require('node:child_process');
 const pcm=execFileSync('ffmpeg',['-v','error','-i',output.audioPath,'-f','s16le','-ac','1','-ar','48000','pipe:1']);
 const sample=seconds=>pcm.readInt16LE(Math.round(seconds*48000)*2);
 assert.equal(sample(.5),1000);assert.equal(sample(1.5),0);assert.equal(sample(2.5),2000);
 const video=path.join(dir,'phone.mp4');writeFileSync(video,'previous synchronized media');
 state=manageSpeech({path:board,action:'attach_video',shotId,expectedRevision:state.revision,videoPath:video,capabilities:caps});
 const secondAudio=state.lines[1].audio;
 state=manageSpeech({path:board,action:'update',lineId:'identify',expectedRevision:state.revision,patch:{acting:{...phone.narration[0].acting,vocal:'Firm low falling self-identification, with natural connected Korean phrasing.'}}});
 assert.equal(state.invalidated.video.speechStatus,'stale');
 const current=manageSpeech({path:board,action:'list'}).lines;
 assert.equal(current[0].audioCurrent,false);assert.equal(current[1].audioCurrent,true);
 assert.deepEqual(current[1].audio,secondAudio);assert.throws(()=>compose(work,board),/identify: Character speech requires recorded generation voiceSettings/);
});
test('speech intent boundaries preserve a sustained multi-sentence line and provider-specific controls',()=>{
 const text='괜찮아. 내가 옆에 있어. 천천히 해.';
 const gemini={engine:'gemini',voiceId:'Orus',model:'gemini-3.8-flash-tts',language:'ko',speed:1};
 const plan=speechAudioPlan({tts:text,acting:{context:'A friend is frightened.',intent:'Reassure the friend.',vocal:'Warm, calm reassurance throughout.'}},{id:'host',tts:gemini});
 assert.equal(plan.generation.turns.length,1);assert.equal(plan.generation.turns[0].text,text);
 const eleven={engine:'elevenlabs',voiceId:'pinned-voice',model:'eleven_v4',language:'ko',speed:1};
 const identify=speechAudioPlan({tts:'경찰서 다나카 경부요.',acting:{direction:'firm declarative statement',intent:'State his own identity.'}},{id:'host',tts:eleven});
 const confirm=speechAudioPlan({tts:'독립운동가를 잡게 해주겠다고?',acting:{direction:'restrained skeptical question',intent:'Verify the offer.'}},{id:'host',tts:eleven});
 assert.equal(identify.generation.text,'[firm declarative statement] 경찰서 다나카 경부요.');
 assert.equal(confirm.generation.text,'[restrained skeptical question] 독립운동가를 잡게 해주겠다고?');
 for(const p of [identify,confirm])assert.ok(elevenLabsGenerateSchema.safeParse(p.generation).success);
});
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

test('whole-shot plan preserves decisive actions, listeners and start/end state with unknown draft timing',()=>{
 const scene={narration:[{id:'a',speaker:'courier',delivery:'on_screen',tts:'I know you.'}],performance:[
  {kind:'dialogue',character:'courier',to:'bride',group:1},
  {kind:'action',character:'uncle',text:'Uncle turns toward the bride.'},
  {kind:'action',character:'bride',text:'The bride freezes and drops the parcel.'}],
  shot:{videoDesign:{before:'Courier alone at the open door; bride holds parcel.',action:'Courier points toward bride.',after:'Parcel lies at bride feet.'}},
  visual:{camera:{framing:'Courier foreground, uncle and bride behind.',end:'Hold both listeners and parcel.'}}};
 const plan=speechVideoPlan(scene,caps);
 assert.equal(plan.performance.length,3);assert.equal(plan.durationSeconds,null);assert.equal(plan.timing,'needs_action_timing');
 for(const text of ['Uncle turns toward the bride','bride freezes','Addressed to bride','Courier alone','Parcel lies','Hold both listeners'])assert.ok(plan.videoPrompt.includes(text),text);
 assert.equal(plan.videoPrompt.includes('I know you.'),false);
 assert.equal(plan.review,'not_reviewed');
});

test('silent actions are plannable through the public tool without lip sync or fabricated duration',t=>{
 const {board}=fixture(t,[]),file=path.join(board,'scenes.js'),win={};
 new Function('window',readFileSync(file,'utf8'))(win);
 win.SCENES[0].performance=[{kind:'action',character:'host',text:'Places the key under the cup.'}];
 writeFileSync(file,Object.entries(win).map(([k,v])=>`window.${k}=${JSON.stringify(v)};`).join('\n'));
 const plan=manageSpeech({path:board,action:'plan_video',shotId:win.SCENES[0].id,capabilities:{...caps,audioConditioning:false,lipSync:false}}).plan;
 assert.match(plan.videoPrompt,/Places the key/);assert.equal(plan.durationSeconds,null);assert.equal(plan.audioFirst,false);
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

test('legacy untimed story-v2 actions keep the existing speech clock and disclose unverified action timing',t=>{
 const {board,work,r}=fixture(t,[{tts:'First',speaker:'host',delivery:'voiceover'}]);
 const audio=path.join(work,'raw0.wav');writeFileSync(audio,wav(1));
 manageSpeech({path:board,action:'attach_audio',lineId:r.lines[0].id,expectedRevision:r.revision,audioPath:audio,generation:proof(r.lines[0])});
 const file=path.join(board,'scenes.js'),win={};new Function('window',readFileSync(file,'utf8'))(win);
 win.SCENES[0].performance=[{kind:'action',character:'host',text:'Opens the parcel.'},{kind:'narration',character:'host',group:1}];
 writeFileSync(file,Object.entries(win).map(([k,v])=>`window.${k}=${JSON.stringify(v)};`).join('\n'));
 writeFileSync(path.join(work,'cards.tsv'),'0\traw0.wav\t1\n');
 const {compose,duration}=require('../../skills/produce/references/compose-speech.js'),checker=require('../../skills/produce/references/check-tts-quality.js');
 const result=compose(work,board);assert.equal(duration(result[0].audioPath),1);assert.equal(result[0].timing,'legacy_speech_only');assert.match(result[0].warnings.join(),/unverified/);
 assert.ok(checker.check(work,board)[result[0].audioPath]);
 const plan=manageSpeech({path:board,action:'plan_video',shotId:r.lines[0].shotId,capabilities:caps}).plan;
 assert.equal(plan.durationSeconds,null);assert.match(plan.videoPrompt,/Opens the parcel/);
});

test('new scene timing version refuses unresolved independent actions while silent plans stay truthful',()=>{
 const {sceneTiming}=require('../../skills/produce/references/compose-speech.js');
 const scene={narration:[],performance:[{kind:'action',character:'host',text:'Opens the door.'}]};
 assert.throws(()=>sceneTiming(scene,'.',1),/finite action timing/);
 scene.performance[0].durationSeconds=2;
 const plan=speechVideoPlan(scene,caps);assert.equal(plan.durationSeconds,2);assert.equal(plan.timing,'planned_actions');
 assert.match(plan.videoPrompt,/silent scene/);assert.doesNotMatch(plan.videoPrompt,/separately supplied voiceover plays/);
});

test('bound video becomes stale when action, addressee, timing or source composition changes',t=>{
 const {board,work,r}=fixture(t,[{tts:'First',speaker:'host',delivery:'on_screen'}]);
 const audio=path.join(work,'raw0.wav'),video=path.join(work,'clip.mp4');writeFileSync(audio,wav(1));writeFileSync(video,'fixture clip');
 let state=manageSpeech({path:board,action:'attach_audio',lineId:r.lines[0].id,expectedRevision:r.revision,audioPath:audio,generation:proof(r.lines[0])});
 const file=path.join(board,'scenes.js'),win={};new Function('window',readFileSync(file,'utf8'))(win);
 win.SCENES[0].performance=[{kind:'dialogue',character:'host',to:'self',group:1},{kind:'action',character:'host',text:'Opens parcel.',durationSeconds:1}];
 const save=value=>writeFileSync(file,Object.entries(value).map(([k,v])=>`window.${k}=${JSON.stringify(v)};`).join('\n'));
 save(win);state=manageSpeech({path:board,action:'list'});
 manageSpeech({path:board,action:'attach_video',shotId:r.lines[0].shotId,expectedRevision:state.revision,videoPath:video,capabilities:caps});
 const bound={};new Function('window',readFileSync(file,'utf8'))(bound);
 writeFileSync(path.join(work,'cards.tsv'),'0\traw0.wav\t1\n');
 const {compose}=require('../../skills/produce/references/compose-speech.js'),checker=require('../../skills/produce/references/check-tts-quality.js');
 compose(work,board);assert.ok(checker.check(work,board));
 for(const change of [s=>s.performance[1].text='Drops parcel.',s=>s.performance[0].to='audience',s=>s.performance[1].durationSeconds=2,s=>s.visual.camera={framing:'Close on parcel.'}]) {
  const changed=JSON.parse(JSON.stringify(bound));change(changed.SCENES[0]);save(changed);compose(work,board);
  assert.throws(()=>checker.check(work,board),/Video performance binding is stale/);
 }
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

test('other video adapters do not inherit ASTRA prompt limits or lose existing timing warnings',()=>{
 const scene={narration:[],performance:[{kind:'action',character:'host',text:'x'.repeat(ASTRA_VIDEO_MAX_PROMPT_CHARS)}]};
 const baseline=speechVideoPlan(scene,caps),astra=speechVideoPlan(scene,{...caps,provider:'astra'});
 assert.equal(astra.promptLength.exceeded,true);
 assert.ok(baseline.warnings.length>0);
 assert.deepEqual(astra.warnings.filter(message=>!message.includes('adapter limit')),baseline.warnings);
 for(const provider of ['seedance','veo','fixture']){
  const plan=speechVideoPlan(scene,{...caps,provider,model:'astra'});
  assert.equal(plan.promptLength,undefined);
  assert.equal(plan.videoPrompt,astra.videoPrompt);
  assert.equal(plan.warnings.some(message=>message.includes('adapter limit')),false);
  assert.deepEqual(plan.warnings,baseline.warnings);
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
 writeFileSync(audio,wav(1));writeFileSync(video,'original synchronized clip');attachAudio();attachVideo();
 const original=read().speechBinding;
 writeFileSync(audio,wav(2));attachAudio();assert.equal(read().speechStatus,'stale');
 const result=attachVideo();
 assert.equal(read().speechStatus,'stale');assert.deepEqual(read().speechBinding,original);
 assert.equal(result.plan.performanceRevision,original.performanceRevision);
 assert.match(result.plan.warnings.join(),/Unchanged video bytes.*audio binding/);
 writeFileSync(video,'new synchronized clip');attachVideo();
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
