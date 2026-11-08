import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { checkedSpeechSchema, prepareGeneration, generateCheckedSpeech } from '../dist/tts-quality.js';
import { pcmToWav } from '../dist/media-utils.js';
import { config } from '../dist/config.js';
const require=createRequire(import.meta.url);
const legacyChecker=require('../../skills/produce/references/check-tts-quality.js');
const checker={...legacyChecker,check:legacyChecker.checkLegacy};
const script='오늘은 맑고 따뜻한 날입니다.';
const episodeTexts=['오늘의 이야기를 시작합니다.','다음 문장도 같은 목소리로 읽어요.','이렇게 이야기를 마칩니다.'];
const episodeRequest=(dir,index=1)=>checkedSpeechSchema.parse({generator:'tts_elevenlabs_generate',generation:{text:episodeTexts[index],voiceId:'voice',model:'eleven_v4',speed:1},expectedText:episodeTexts[index],language:'Korean',delivery:'Calm connected narration.',outputPath:dir,filename:`c${index}.wav`,episode:{texts:episodeTexts,index,seed:210836}});
function setup(t){
  const dir=mkdtempSync(path.join(tmpdir(),'tts-quality-'));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  mkdirSync(path.join(dir,'storyboard'));mkdirSync(path.join(dir,'.work/pcm'),{recursive:true});
  writeFileSync(path.join(dir,'storyboard/scenes.js'),`window.SCENES=[{type:'points',narration:[{tts:${JSON.stringify(script)}}]}];`);
  const request=checkedSpeechSchema.parse({generator:'tts_generate',generation:{text:script,voiceName:'Kore'},expectedText:script,language:'Korean',delivery:'Calm and conversational.',outputPath:path.join(dir,'.work/pcm'),filename:'c0.wav'});
  const file=path.join(request.outputPath,request.filename);
  writeFileSync(path.join(dir,'.work/cards.tsv'),`0\t${file}\t4.5\tin\n`);
  return {dir,request,file};
}
test('the production take records its spend under the generator, with the metered characters',async t=>{
  const f=setup(t);const request=episodeRequest(path.join(f.dir,'.work/pcm'));
  const savedFetch=globalThis.fetch,savedKey=config.elevenLabsApiKey;config.elevenLabsApiKey='test-key';
  const alignment={characters:['안'],character_start_times_seconds:[0],character_end_times_seconds:[0.1]};
  globalThis.fetch=async()=>new Response(JSON.stringify({audio_base64:pcmToWav(Buffer.alloc(48000),24000,1).toString('base64'),alignment,normalized_alignment:alignment}),{headers:{'content-type':'application/json','character-cost':'12'}});
  try{
    const result=await generateCheckedSpeech(request);
    assert.equal(result.success,true,result.error);assert.equal(result.status,'not_reviewed');
  }finally{globalThis.fetch=savedFetch;config.elevenLabsApiKey=savedKey;}
  const events=readFileSync(path.join(f.dir,'.work/events.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(events.length,1);assert.equal(events[0].tool,'tts_elevenlabs_generate');
  assert.equal(events[0].key,'tts.elevenlabs');assert.equal(events[0].quantity,0.012);
});
test('generation args bind the whole spoken text and preserve voice settings',t=>{
  const f=setup(t);const prepared=prepareGeneration(f.request);
  assert.equal(prepared.args.voiceName,'Kore');assert.equal(prepared.args.text,script);
  assert.throws(()=>prepareGeneration({...f.request,expectedText:'다른 대본'}),/match the complete/);
  const eleven={...f.request,generator:'tts_elevenlabs_generate',generation:{text:'[whispers] '+script,voiceId:'21m00Tcm4TlvDq8ikWAM',model:'eleven_v4'}};
  assert.equal(prepareGeneration(eleven).args.voiceId,eleven.generation.voiceId);
  assert.throws(()=>prepareGeneration({...f.request,filename:'../outside.wav'}));
});
test('voice binding rejects mixed speakers, missing proofs, and changed required settings',()=>{
  const tts={engine:'gemini',voiceId:'Kore',language:'ko',speed:1};
  const win={SB_DOC:{characters:[{id:'a',tts},{id:'b',tts}],narratorCharacterId:'a'}};
  const scene={narration:[{tts:script,speaker:'a'}]};
  const proof={generator:'tts_generate',language:'Korean',voiceSettings:{voiceName:'Kore',speed:1}};
  assert.equal(checker.characterVoice(win,scene,proof),'a');
  for(const patch of [{voiceName:'Puck'},{language:'en'},{speed:0.9}]) assert.throws(()=>checker.characterVoice(win,scene,{...proof,voiceSettings:{...proof.voiceSettings,...patch}}),/differs/);
  assert.throws(()=>checker.characterVoice(win,scene,{}),/voiceSettings/);
  assert.throws(()=>checker.characterVoice(win,{narration:[...scene.narration,{tts:script,speaker:'b'}]},proof),/one speaker per scene/);
  assert.equal(checker.characterVoice({},{narration:[{tts:script}]},{}),null);
});
test('episode derives bounded v4 context and retains its seed at native speed',t=>{
  const {dir}=setup(t);
  for(let i=0;i<episodeTexts.length;i++){
    const p=prepareGeneration(episodeRequest(dir,i));assert.equal(p.args.previousText,episodeTexts.slice(0,i).join(' ').slice(-100)||undefined);assert.equal(p.args.nextText,episodeTexts.slice(i+1).join(' ').slice(0,100)||undefined);assert.equal(p.args.seed,210836);assert.equal(p.args.speed,1);
  }
  const r=episodeRequest(dir);
  assert.throws(()=>prepareGeneration({...r,generation:{...r.generation,seed:1}}),/seed/);
  assert.throws(()=>prepareGeneration({...r,generation:{...r.generation,previousText:'wrong'}}),/previousText/);
  assert.throws(()=>prepareGeneration({...r,generation:{...r.generation,model:'eleven_v3'}}));
  assert.equal(checkedSpeechSchema.safeParse({...r,episode:{...r.episode,index:99}}).success,false);
  assert.equal(checkedSpeechSchema.safeParse({...r,playbackSpeed:1.2}).success,false);
});
test('a preserved soundtrack repair binds the actual sources and current lines without claiming adapter speech',t=>{
  const f=setup(t),board=path.join(f.dir,'storyboard');
  const video=path.join(board,'repair.mp4'),source=path.join(board,'source.mp4');
  writeFileSync(video,'repaired picture and preserved soundtrack');writeFileSync(source,'original native speech');
  const sha=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
  const {speechRevision}=require('../../skills/_shared/speech-contract.js');
  const line={id:'s0001-l1',speaker:'a',delivery:'on_screen',tts:'다시.'},cast=[{id:'a',tts:{engine:'astra-genai',voiceId:'pinned',language:'ko',speed:1}}];
  const repair={kind:'preserved_soundtrack',videoPath:video,videoSha256:sha(video),lines:[{lineId:line.id,revision:speechRevision(line,{tts:cast[0].tts})}],sources:[{kind:'native_video',path:source,sha256:sha(source),lineIds:[line.id]}],review:'not_reviewed'};
  const scene={narration:[line],sound:{audioSource:'video'},visual:{video:{clip:video,soundtrackRepair:repair}}};
  const media={};assert.equal(legacyChecker.retainedSoundtrack(scene,board,cast,media),true);assert.equal(media[source],sha(source));assert.equal(repair.review,'not_reviewed');
  const work=path.join(f.dir,'.work'),other=path.join(board,'other-shot.mp4');
  writeFileSync(f.file,pcmToWav(Buffer.alloc(4800),24000,1));writeFileSync(other,'another shot soundtrack');
  writeFileSync(path.join(board,'scenes.js'),`window.SB_DOC=${JSON.stringify({speechPlanVersion:1,characters:cast})};window.SCENES=${JSON.stringify([scene])};`);
  const extraction={card:'0',video,sourceSha256:sha(video),audio:f.file,audioSha256:sha(f.file)};
  const extractionFile=path.join(work,'source-audio.json');
  writeFileSync(extractionFile,JSON.stringify([extraction]));
  assert.equal(legacyChecker.check(work,board)[video],sha(video));
  writeFileSync(extractionFile,JSON.stringify([{...extraction,video:other,sourceSha256:sha(other)}]));
  assert.throws(()=>legacyChecker.check(work,board),/Source soundtrack differs from retained repaired video/);
  assert.throws(()=>legacyChecker.retainedSoundtrack({...scene,narration:[{...line,tts:'바뀐 대사.'}]},board,cast,{}),/dialogue or voice changed/);
  assert.throws(()=>legacyChecker.retainedSoundtrack(scene,board,[{...cast[0],tts:{...cast[0].tts,voiceId:'other'}}],{}),/dialogue or voice changed/);
  assert.throws(()=>legacyChecker.retainedSoundtrack({...scene,visual:{video:{...scene.visual.video,speechBinding:{mode:'native'}}}},board,cast,{}),/no adapter speech binding/);
  repair.sources[0].lineIds=[];assert.throws(()=>legacyChecker.retainedSoundtrack(scene,board,cast,{}),/cover the current lines/);repair.sources[0].lineIds=[line.id];
  writeFileSync(source,'changed source');assert.throws(()=>legacyChecker.retainedSoundtrack(scene,board,cast,{}),/source changed/);
  writeFileSync(video,'changed output');assert.throws(()=>legacyChecker.retainedSoundtrack(scene,board,cast,{}),/video changed/);
});
