import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
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
  repair.sources[0].kind='selected_line_audio';
  assert.throws(()=>legacyChecker.retainedSoundtrack(scene,board,cast,{}),/post_lipsync_forbidden/);
  repair.sources[0].kind='native_video';
  writeFileSync(extractionFile,JSON.stringify([{...extraction,video:other,sourceSha256:sha(other)}]));
  assert.throws(()=>legacyChecker.check(work,board),/Source soundtrack differs from retained repaired video/);
  assert.throws(()=>legacyChecker.retainedSoundtrack({...scene,narration:[{...line,tts:'바뀐 대사.'}]},board,cast,{}),/dialogue or voice changed/);
  assert.throws(()=>legacyChecker.retainedSoundtrack(scene,board,[{...cast[0],tts:{...cast[0].tts,voiceId:'other'}}],{}),/dialogue or voice changed/);
  assert.throws(()=>legacyChecker.retainedSoundtrack({...scene,visual:{video:{...scene.visual.video,speechBinding:{mode:'native'}}}},board,cast,{}),/no adapter speech binding/);
  repair.sources[0].lineIds=[];assert.throws(()=>legacyChecker.retainedSoundtrack(scene,board,cast,{}),/cover the current lines/);repair.sources[0].lineIds=[line.id];
  writeFileSync(source,'changed source');assert.throws(()=>legacyChecker.retainedSoundtrack(scene,board,cast,{}),/source changed/);
  writeFileSync(video,'changed output');assert.throws(()=>legacyChecker.retainedSoundtrack(scene,board,cast,{}),/video changed/);
});

test('assembly blocks on-screen overdubs and preserves the exact driver of a silent A2V output',t=>{
  const f=setup(t), work=path.join(f.dir,'.work'), board=path.join(f.dir,'storyboard');
  const video=path.join(board,'take.mp4'), scenes=path.join(board,'scenes.js');
  const cards=path.join(work,'cards.tsv'), line={id:'l1',delivery:'on_screen',speaker:'a',tts:'Wait.'};
  const shot={id:'s1',scene:1,narration:[line],visual:{video:{clip:video}}};
  const save=()=>writeFileSync(scenes,'window.SCENES='+JSON.stringify([shot])+';');
  const prepare=()=>require('../../skills/produce/references/prepare-source-audio.js').prepare(work,board);
  const sha=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
  execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=s=16x16:r=24:d=0.25','-c:v','libx264',video]);
  writeFileSync(f.file,pcmToWav(Buffer.alloc(12000,15),24000,1));
  writeFileSync(path.join(work,'segs.tsv'),'0\t0\t'+video+'\tWait.\tWait.\n');
  save();
  assert.throws(prepare,/post_lipsync_forbidden/);
  line.delivery='off_screen'; save(); prepare();
  shot.visual.video.speechBinding={mode:'post_lipsync'}; save();
  assert.throws(prepare,/post_lipsync_forbidden/);
  delete shot.visual.video.speechBinding;
  shot.visual.video.candidates=[{mode:'post_lipsync'}];
  line.delivery='on_screen'; save();
  const receipt={version:1,status:'completed',jobId:'native-a2v',operation:'audio-to-video',fingerprint:'f'.repeat(64),
    videoPath:video,sha256:sha(video),conditioningAudioSha256:sha(f.file)};
  writeFileSync(video+'.astra-genai.json',JSON.stringify(receipt));
  prepare();
  assert.match(readFileSync(cards,'utf8'),/sync=1/);
  assert.equal(legacyChecker.check(work,board)[f.file],receipt.conditioningAudioSha256);
  writeFileSync(f.file,pcmToWav(Buffer.alloc(12000,30),24000,1));
  assert.throws(prepare,/post_lipsync_forbidden/);
});

test('historical native voice bindings must fit each selected render at assembly',t=>{
  const {dir}=setup(t), board=path.join(dir,'storyboard'), work=path.join(dir,'.work');
  const picture=path.join(board,'speech.mp4'), sha=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
  execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=s=16x16:r=24:d=0.25','-f','lavfi','-i','sine=duration=0.25','-c:v','libx264','-c:a','aac',picture]);
  const voices=['a','b','c'], distilled={engine:'astra-genai',model:'ltx-2.5-22b-distilled'};
  const seedance={engine:'seedance',model:'dreamina-seedance-2-0-260128'};
  const {speechRevision}=require('../../skills/_shared/speech-contract.js');
  const actors=voices.map(id=>({id,tts:{engine:'gemini',voiceId:'Kore',language:'en',speed:1}}));
  const owner={no:1,speakers:voices,videoDirection:{oneTake:true}};
  function stage(groups,selected,recorded=selected,video={}) {
    const shots=groups.map((speakers,index)=>{
      const narration=speakers.map((speaker,line)=>({id:'line-'+index+'-'+line,speaker,delivery:'on_screen',tts:speaker+' speaks.'}));
      const audio=narration.map(n=>({lineId:n.id,revision:speechRevision(n,actors.find(a=>a.id===n.speaker))}));
      const binding={mode:'native',provider:recorded.engine,model:recorded.model,operation:recorded.operation,videoPath:picture,videoSha256:sha(picture),audio};
      const edit={in:index*0.25/groups.length,out:(index+1)*0.25/groups.length};
      return {id:'shot-'+index,scene:1,type:'points',narration,edit,visual:{video:{clip:picture,speechStatus:'current',speechBinding:binding,...video}},sound:{audioSource:'video'}};
    });
    const win={SB_DOC:{characters:actors},SCENES:shots,STRUCTURE:{scenes:[owner]},PRODUCTION:{videoModel:selected}};
    writeFileSync(path.join(board,'scenes.js'),Object.entries(win).map(([k,v])=>'window.'+k+'='+JSON.stringify(v)+';').join('\n'));
    writeFileSync(path.join(work,'cards.tsv'),shots.map((_,i)=>[i,'placeholder.wav',0,'none'].join('\t')).join('\n')+'\n');
    writeFileSync(path.join(work,'segs.tsv'),shots.flatMap((shot,i)=>shot.narration.map((n,j)=>[i,j,picture,n.tts,n.tts].join('\t'))).join('\n')+'\n');
    require('../../skills/produce/references/prepare-source-audio.js').prepare(work,board);
  }
  const check=()=>legacyChecker.check(work,board);
  stage([voices],distilled);
  assert.throws(check,/scene_render_voice_limit/);
  stage([voices],distilled,seedance);
  assert.throws(check,/scene_render_voice_limit/,'the current model selection also applies');
  stage([voices],seedance,distilled);
  assert.throws(check,/scene_render_voice_limit/,'the recorded model still applies after a board selection change');
  stage([voices],seedance);assert.ok(check()[picture]);
  const veo={engine:'veo',model:'veo-3.1-generate-001'};
  stage([voices],veo);assert.throws(check,/scene_speech_route/);
  owner.videoDirection.dialogueVoice='model_generated';
  stage([voices],veo);assert.ok(check()[picture]);
  stage([voices],veo,veo,{generateAudio:false});assert.throws(check,/scene_dialogue_audio_required/);
  stage([voices],{engine:'veo',model:'unknown'},veo);assert.throws(check,/scene_speech_route/);
  delete owner.videoDirection.dialogueVoice;
  stage([voices],{engine:'ltx-api',model:'ltx-2-5-pro',operation:'audio'});
  assert.throws(check,/scene_speech_route/);
  stage([voices],{...seedance,operation:'extend'},seedance);assert.throws(check,/scene_speech_route/);
  owner.videoDirection.oneTake=false;
  // A GenAI scene is one render, so three speakers across its cuts exceed two voices.
  stage([['a','b'],['c']],distilled);assert.throws(check,/scene_render_voice_limit/);
  // A clip the retired per-shot route made rendered each card apart and still fits.
  writeFileSync(picture+'.astra-genai.json',JSON.stringify({version:1,operation:require('../../skills/_shared/scene-speech-receipt.js').PER_SHOT_SCENE_OPERATION,status:'completed'}));
  stage([['a','b'],['c']],distilled);assert.ok(check()[picture]);
  stage([voices,['a']],distilled);assert.throws(check,/scene_render_voice_limit/);
});
