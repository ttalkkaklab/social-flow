#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {evaluateWindowScript}=require('../../_shared/scenes-vm.js');
const {actingErrors,speechRevisionPayload,planScenePerformance,hasCuedThought,withThoughtClock}=require('../../_shared/scene-acting.js');
const {generationVoiceErrors}=require('../../_shared/character-voice.js');
const hash=value=>createHash('sha256').update(value).digest('hex');
function duration(file) {
  const seconds=Number(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',file],{encoding:'utf8',timeout:10000}).trim());
  if(!Number.isFinite(seconds)||seconds<=0)throw new Error('Unusable speech duration: '+file);
  return seconds;
}
function lineSources(lines) {
  return lines.map(n=>({lineId:n.id,sha256:n.audio?.sha256,revision:n.audio?.revision,leadInSeconds:n.acting?.leadInSeconds??0,tailOutSeconds:n.acting?.tailOutSeconds??0}));
}
function sceneTiming(scene, board, performanceTimingVersion, owners) {
  const actions = (scene.performance || []).filter(event => event.kind === 'action');
  const legacy = performanceTimingVersion !== 1 && actions.length > 0 && !actions.some(event => event.durationSeconds !== undefined || event.withGroup !== undefined);
  const card = withThoughtClock(scene,owners);
  const plan = planScenePerformance(legacy ? {...card,performance:undefined} : card,line => duration(path.resolve(board,line.audio.path)));
  if (legacy) {
    plan.timing = 'legacy_speech_only';
    plan.warnings.push('Legacy speech clock preserved; independent action timing is unverified. Stage actions and set durationSeconds/withGroup before adopting scene timing.');
  }
  if (plan.durationSeconds === null) throw new Error('Plan finite action timing before composing speech: '+plan.warnings.join('; '));
  const intervals = plan.performance.filter(event => event.kind !== 'action').map(event => {
    const {lineId,startSeconds,speechStartSeconds,speechEndSeconds,endSeconds} = event;
    return {lineId,startSeconds,speechStartSeconds,speechEndSeconds,endSeconds};
  });
  return {...plan,intervals};
}
function checkSilentTiming(scene, board, performanceTimingVersion, audio) {
  if (performanceTimingVersion !== 1 || (scene.narration || []).length || !scene.performance?.length || scene.performance.some(event => event.kind !== 'action')) return;
  const timing=sceneTiming(scene,board,performanceTimingVersion);
  // Speechless cards use the supplied WAV clock. Extra silence may reserve a
  // provider's frame padding; the board's duration can still be a draft estimate.
  if (duration(audio)+0.03 < timing.durationSeconds) throw new Error('Silent scene audio is shorter than planned action timing');
}
function silentWav(samples,channels=1,rate=48000,bits=16,format=1) {
  const stride=bits/8*channels, size=samples*stride, wav=Buffer.alloc(44+size);
  wav.write('RIFF');wav.writeUInt32LE(36+size,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(format,20);wav.writeUInt16LE(channels,22);
  wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*stride,28);wav.writeUInt16LE(stride,32);wav.writeUInt16LE(bits,34);wav.write('data',36);wav.writeUInt32LE(size,40);
  return wav;
}
function mixLines(lines, sources, timing) {
  const {intervals} = timing;
  // ffmpeg only decodes each take; the delay, sum and length are set here. An amix/apad graph hung
  // or lost its padding on ffmpeg 8.0's threaded CLI (CI 2026-10-31, trac #11061).
  const total=Math.round(timing.durationSeconds*48000),mix=new Int32Array(total);
  lines.forEach((line,i)=>{
    const pcm=execFileSync('ffmpeg',['-v','error','-i',sources[i],'-ac','1','-ar','48000','-f','s16le','-'],{timeout:120000,maxBuffer:1<<30});
    const start=Math.round(intervals.find(item=>item.lineId===line.id).speechStartSeconds*48000);
    for(let k=0;k<pcm.length>>1&&start+k<total;k++)mix[start+k]+=pcm.readInt16LE(k*2);
  });
  const wav=silentWav(total);
  mix.forEach((sample,k)=>wav.writeInt16LE(Math.max(-32768,Math.min(32767,sample)),44+k*2));
  return wav;
}

// The uploaded WAV may have a different header or the stereo layout the adapter requires.
// Compare every channel from sample zero. Only trailing digital silence may extend the take.
function samePerformanceWav(file, mono) {
  const probe = JSON.parse(execFileSync('ffprobe', ['-v','error','-show_entries','stream=codec_name,sample_rate,channels:format=format_name','-of','json',file], {encoding:'utf8'}));
  const stream = probe.streams[0];
  if (probe.format?.format_name !== 'wav' || probe.streams.length !== 1 || stream.codec_name !== 'pcm_s16le' ||
      Number(stream.sample_rate) !== 48000 || ![1,2].includes(stream.channels)) return false;
  const options = {timeout:120000,maxBuffer:1<<30};
  const actual = execFileSync('ffmpeg',['-v','error','-i',file,'-f','s16le','-'],options);
  const matches = expected => expected.length > 0 && actual.length >= expected.length &&
    actual.subarray(0,expected.length).equals(expected) && actual.subarray(expected.length).every(sample => sample === 0);
  if (stream.channels === 1) return matches(mono.subarray(44));
  for (const layout of [['-ac','2'], ['-af','pan=stereo|FL=c0|FR=c0']]) {
    const stereo = execFileSync('ffmpeg',['-v','error','-f','wav','-i','pipe:0',...layout,'-f','s16le','-'],{...options,input:mono});
    if (matches(stereo)) return true;
  }
  // Older uploads have no line manifest. An untouched channel identifies the take;
  // the other channel may be the same samples at one fixed mixer gain.
  const speech=mono.subarray(44);
  if (!speech.length || actual.length<speech.length*2 || actual.subarray(speech.length*2).some(byte=>byte!==0)) return false;
  for (const originalChannel of [0,1]) {
    let low=0, high=Infinity, audible=false;
    for (let i=0;i<speech.length;i+=2) {
      const sample=speech.readInt16LE(i), anchor=actual.readInt16LE(2*i+2*originalChannel);
      const mixed=actual.readInt16LE(2*i+2*(1-originalChannel));
      if (anchor!==sample || !sample && mixed!==0) { high=-1; break; }
      if (!sample) continue;
      audible=true;
      const a=(mixed-0.5)/sample, b=(mixed+0.5)/sample;
      low=Math.max(low,Math.min(a,b));high=Math.min(high,Math.max(a,b));
      if (low>high) break;
    }
    if (audible && low<=high) return true;
  }
  return false;
}

function currentLineSources(lines, board, cast) {
  return lines.map(line => {
    const character=cast.find(c=>c.id===line.speaker);
    const voice=character?.tts ?? require('../../_shared/character-speech.js').characterSpeech(character,{boardDir:board}).tts;
    const errors=actingErrors(line.acting);
    errors.push(...generationVoiceErrors(voice,line.audio?.generation,line));
    if(errors.length)throw new Error(line.id+': '+errors.join('; '));
    if(!line.audio || line.audio.generation?.text!==line.tts || line.audio.revision!==hash(JSON.stringify(speechRevisionPayload(line,voice))))
      throw new Error('Attach current audio for '+line.id);
    const source=path.resolve(board,line.audio.path);
    if(hash(fs.readFileSync(source))!==line.audio.sha256)throw new Error('Audio changed for '+line.id);
    require('../../_shared/character-speech.js').verifiedSpeechGeneration(source,line.audio.generation,voice,line);
    return source;
  });
}

// Archive the selected takes beside the provider request. A mastered mix can
// contain panning, room tone and processing that cannot be recovered from mono stems.
function conditioningInputs(cards, board, shots, characters, timingVersion, driverSha256) {
  const cast=Array.isArray(characters)?characters:Object.entries(characters ?? {}).map(([id,c])=>({...c,id}));
  const spoken=cards.flatMap(card=>(card.narration ?? []).filter(line=>line.tts?.trim()));
  if (!spoken.length || spoken.some(line=>!line.audio?.path)) return undefined;
  const records=shots.map(({shotId,startFrame,endFrame},i)=>{
    const card=cards[i];
    if (card?.id!==shotId || cards.length!==shots.length) throw new Error('conditioning_audio_unverified: storyboard shots differ from the render');
    const lines=(card.narration ?? []).filter(line=>line.tts?.trim());
    currentLineSources(lines,board,cast);
    const timing=sceneTiming(card,board,timingVersion);
    return {shotId,startFrame,endFrame,lines:lines.map(line=>({id:line.id,speaker:line.speaker,text:line.tts,delivery:line.delivery,
      revision:line.audio.revision,sha256:line.audio.sha256})),intervals:timing.intervals,durationSeconds:timing.durationSeconds};
  });
  return {version:1,driverSha256,shots:records};
}

function fullScenePerformance(scene, board, render, cards, characters, timingVersion, driverBytes) {
  const {shots,fps,num_frames:frames}=render;
  if (!Number.isFinite(fps) || fps<=0 || !Number.isSafeInteger(frames) || frames<=0 ||
      !Array.isArray(cards) || cards.length!==shots.length || !cards.some(card=>card.id===scene.id))
    throw new Error('conditioning_audio_unverified: the scene render must cover the current storyboard shots');
  const cast=Array.isArray(characters)?characters:Object.entries(characters ?? {}).map(([id,c])=>({...c,id}));
  const sampleAt=frame=>Math.round(frame*48000/fps);
  if (sampleAt(frames)*2>driverBytes) throw new Error('conditioning_audio_unverified: the original WAV is shorter than the rendered scene');
  const wav=silentWav(sampleAt(frames));
  let cursor=0;
  for (const [i,shot] of shots.entries()) {
    const card=cards[i];
    if (card.id!==shot.shot_id || shot.start_frame!==cursor || !Number.isSafeInteger(shot.end_frame) ||
        shot.end_frame<=cursor || shot.end_frame>frames)
      throw new Error('conditioning_audio_unverified: the rendered frame range differs for '+card.id);
    const lines=(card.narration || []).filter(line=>line.tts?.trim());
    const sources=currentLineSources(lines,board,cast);
    const timing=sceneTiming(card,board,timingVersion);
    const start=sampleAt(cursor), end=sampleAt(shot.end_frame);
    if (Math.round(timing.durationSeconds*48000)>end-start)
      throw new Error('conditioning_audio_unverified: the performance exceeds the rendered shot '+card.id);
    if (lines.length) mixLines(lines,sources,timing).copy(wav,44+start*2,44);
    cursor=shot.end_frame;
  }
  if (cursor!==frames) throw new Error('conditioning_audio_unverified: the rendered shots do not cover the full scene');
  return wav;
}

// build-reel uses the card WAV duration and seeks the picture to edit.in. Keep
// the original driver samples from exactly the source frames shown on this card.
function conditioningSlice(scene, render, driver) {
  const shot=render.shots.find(shot=>shot.shot_id===scene.id), fps=render.fps;
  if (!shot) throw new Error('conditioning_audio_unverified: the shot is absent from the original scene');
  const startFrame=Math.ceil((scene.edit?.in ?? shot.start_frame/fps)*fps-1e-6);
  const endSeconds=scene.edit?.out ?? shot.end_frame/fps;
  if (startFrame<shot.start_frame || endSeconds>shot.end_frame/fps+1e-7 || !(endSeconds>startFrame/fps))
    throw new Error('conditioning_audio_unverified: the edit falls outside the original shot '+scene.id);
  const start=Math.round(startFrame*48000/fps), end=Math.round(endSeconds*48000);
  return {wav:driverSamples(driver,start,end),start,end,offset:(startFrame-shot.start_frame)/fps};
}

function driverSamples(driver,start,end) {
  const stream=JSON.parse(execFileSync('ffprobe',['-v','error','-select_streams','a:0','-show_entries','stream=codec_name,sample_rate,channels',
    '-of','json',driver],{encoding:'utf8'})).streams[0];
  const rate=Number(stream?.sample_rate),channels=stream?.channels;
  if (!Number.isSafeInteger(rate) || rate<=0 || ![1,2].includes(channels))
    throw new Error('conditioning_audio_unverified: unreadable original master');
  const from=Math.round(start*rate/48000),to=Math.round(end*rate/48000);
  const format=({pcm_u8:'u8',pcm_s24le:'s24le',pcm_s32le:'s32le',pcm_f32le:'f32le',pcm_f64le:'f64le'})[stream.codec_name] ?? 's16le';
  const bits=Number(format.match(/\d+/)[0]);
  const pcm=execFileSync('ffmpeg',['-nostdin','-v','error','-i',driver,'-map','0:a:0','-af',
    'atrim=start_sample='+from+':end_sample='+to,'-f',format,'-'],{timeout:120000,maxBuffer:1<<30});
  if (pcm.length!==(to-from)*channels*bits/8) throw new Error('conditioning_audio_unverified: the original WAV does not cover the requested samples');
  const wav=silentWav(to-from,channels,rate,bits,format.startsWith('f')?3:1);
  pcm.copy(wav,44);
  return wav;
}

function matchesConditioningSlice(scene, board, render, audio, driverSha256) {
  const file=scene.visual?.video?.speechBinding?.conditioningAudioPath;
  if (!file || !(render?.shots?.length>1)) return false;
  const driver=path.resolve(board,file);
  return fs.existsSync(driver) && hash(fs.readFileSync(driver))===driverSha256 &&
    fs.readFileSync(audio).equals(conditioningSlice(scene,render,driver).wav);
}

// A previous build may have selected a wider trim. Recover its original WAV
// only when the written file still contains the original samples in its name.
function selectedDriver(scene,board,render,work,audio) {
  const binding=scene.visual.video.speechBinding;
  if (!binding.conditioningAudioPath || !(render?.shots?.length>1)) return audio;
  const outputDir=path.join(work,'.source-audio');
  if (!fs.existsSync(outputDir) || fs.realpathSync(path.dirname(audio))!==fs.realpathSync(outputDir)) return audio;
  const name=/^([a-f0-9]{64})-(\d+)-(\d+)\.wav$/.exec(path.basename(audio));
  if (!name || name[1]!==binding.conditioningAudioSha256) return audio;
  const start=Number(name[2]), end=Number(name[3]), shot=render.shots.find(shot=>shot.shot_id===scene.id);
  if (!shot || !(end>start) || start<Math.round(shot.start_frame*48000/render.fps) || end>Math.round(shot.end_frame*48000/render.fps)) return audio;
  const driver=path.resolve(board,binding.conditioningAudioPath);
  return hash(fs.readFileSync(driver))===name[1] && fs.readFileSync(audio).equals(driverSamples(driver,start,end)) ? driver : audio;
}

function currentConditioningAudio(scene, board, {index, timingVersion, driverSha256, audioPath, sceneAudioPath, includeCardAudio = true,
  sceneRender, sceneCards, characters,
  work = path.resolve(board, '../.work'), timing = sceneTiming(scene, board, timingVersion)}) {
  const lines = (scene.narration || []).filter(line => line.tts?.trim());
  const sources = lines.map(line => path.resolve(board, line.audio.path));
  const interval = timing.intervals[0];
  const multiShot = sceneRender?.shots?.length > 1;
  const direct = !multiShot && lines.length === 1 && timing.intervals.length === 1 && interval.speechStartSeconds === 0 &&
    interval.speechEndSeconds === timing.durationSeconds && hash(fs.readFileSync(sources[0])) === driverSha256;
  const cards = path.join(work, 'cards.tsv');
  const choices = [audioPath, sceneAudioPath].filter(Boolean).map(file => path.resolve(board, file));
  if (includeCardAudio && fs.existsSync(cards)) {
    const rows = fs.readFileSync(cards, 'utf8').split(/\r?\n/).filter(row => row.trim() && !row.startsWith('#'))
      .map(row => row.split('\t')).filter(fields => fields[0].trim() && Number(fields[0]) === index);
    if (rows.length > 1 || rows.length && !rows[0][1]) throw new Error('conditioning_audio_unverified: ambiguous selected WAV in cards.tsv');
    if (rows.length) {
      const selected=path.resolve(work, rows[0][1]);
      const fromOriginal=multiShot && matchesConditioningSlice(scene,board,sceneRender,selected,driverSha256);
      choices.push(fromOriginal ? path.resolve(board,scene.visual.video.speechBinding.conditioningAudioPath) : selected);
    }
  }
  if (!choices.length) choices.push(direct ? sources[0] : path.join(work, `c${index}-speech.wav`));
  for (const file of new Set(choices)) {
    if (!fs.existsSync(file) || hash(fs.readFileSync(file)) !== driverSha256)
      throw new Error('conditioning_audio_unverified: the selected WAV differs from the recorded video driver');
  }
  if (sceneRender?.conditioningInputs) {
    const shots=sceneRender.shots.map(s=>({shotId:s.shot_id,startFrame:s.start_frame,endFrame:s.end_frame}));
    const current=conditioningInputs(sceneCards,board,shots,characters,timingVersion,driverSha256);
    if (!current || !require('node:util').isDeepStrictEqual(current,sceneRender.conditioningInputs))
      throw new Error('conditioning_audio_unverified: the original scene recordings or their timing changed');
  } else if (!direct) {
    const composition = multiShot ? fullScenePerformance(scene,board,sceneRender,sceneCards,characters,timingVersion,fs.statSync(choices[0]).size) : mixLines(lines,sources,timing);
    if (hash(composition) !== driverSha256 && !samePerformanceWav(choices[0], composition))
      throw new Error('conditioning_audio_unverified: the current line takes and timing do not produce the recorded video driver');
  }
  return choices[0];
}

function verifyConditioningPerformance(scene, win, index, board, work, audio, digest, sceneRender) {
  const binding = scene.visual?.video?.speechBinding;
  const driverSha256=binding?.conditioningAudioSha256 ?? digest;
  const multiShot=sceneRender?.shots?.length>1;
  if (binding?.mode !== 'audio_conditioned' || (multiShot
      ? !matchesConditioningSlice(scene,board,sceneRender,audio,driverSha256) : driverSha256 !== digest))
    throw new Error('conditioning_audio_unverified: the binding differs from the original A2V driver');
  const timingVersion=win.SB_DOC?.performanceTimingVersion, timing=sceneTiming(scene,board,timingVersion);
  const owner = win.STRUCTURE?.scenes?.find(row => row.no === scene.scene);
  currentConditioningAudio(scene, board, {index,work,timing,timingVersion,driverSha256,includeCardAudio:!multiShot,
    sceneRender,sceneCards:win.SCENES.filter(card=>card.scene===scene.scene),characters:win.SB_DOC?.characters,
    audioPath:binding.conditioningAudioPath ?? audio, sceneAudioPath:owner?.videoDirection?.audio?.path});
  if (multiShot) {
    const {offset,start,end}=conditioningSlice(scene,sceneRender,path.resolve(board,binding.conditioningAudioPath));
    const shifted=seconds=>Math.max(0,Math.min((end-start)/48000,seconds-offset));
    return timing.intervals.map(({lineId,startSeconds,speechStartSeconds,speechEndSeconds,endSeconds})=>({
      lineId,startSeconds:shifted(startSeconds),speechStartSeconds:shifted(speechStartSeconds),
      speechEndSeconds:shifted(speechEndSeconds),endSeconds:shifted(endSeconds)}));
  }
  return timing.intervals;
}

function compose(work,board) {
  work=path.resolve(work);board=path.resolve(board);
  const file=path.join(board,'scenes.js'),win=evaluateWindowScript(fs.readFileSync(file,'utf8'),{filename:file});
  if(win.SB_DOC?.speechPlanVersion!==1)return [];
  const cast=Array.isArray(win.SB_DOC.characters)?win.SB_DOC.characters:Object.entries(win.SB_DOC.characters||{}).map(([id,c])=>({...c,id}));
  const cards=path.join(work,'cards.tsv'),rows=fs.readFileSync(cards,'utf8').split(/\r?\n/);
  const outputs=[];
  let receipts, sliced=false;
  for(let row=0;row<rows.length;row++) {
    if(!rows[row].trim()||rows[row].startsWith('#'))continue;
    const fields=rows[row].split('\t'),scene=win.SCENES[Number(fields[0])];
    if(scene?.sound?.audioSource==='video')continue; // Its single soundtrack is extracted by prepare-source-audio.js.
    const lines=(scene?.narration||[]).filter(n=>(n.tts||'').trim());
    if(scene)checkSilentTiming(scene,board,win.SB_DOC?.performanceTimingVersion,path.resolve(work,fields[1]));
    // The selected A2V driver may be stereo or include renderer padding. Assembly
    // verifies its bytes and line intervals before mixing it with the picture.
    if(scene?.visual?.video?.speechBinding?.mode==='audio_conditioned' && lines.some(line=>line.delivery==='on_screen')) {
      const sourceAudio=require('./prepare-source-audio.js');
      receipts ??= sourceAudio.checkAssemblyRoutes(win,board);
      const binding=scene.visual.video.speechBinding;
      const clip=path.resolve(board,binding.videoPath ?? scene.visual.video.clip), render=receipts.sceneRenders.get(clip);
      const audio=path.resolve(work,fields[1]), selected=selectedDriver(scene,board,render,work,audio);
      if (!sourceAudio.usesConditioningTrack(scene,board,selected,render,receipts.drivers.get(clip)))
        throw new Error('conditioning_audio_unverified: this shot no longer uses its A2V driver');
      if (render?.shots.length>1) {
        const owner=win.STRUCTURE?.scenes?.find(row=>row.no===scene.scene);
        const driver=currentConditioningAudio(scene,board,{index:Number(fields[0]),work,timingVersion:win.SB_DOC.performanceTimingVersion,
          driverSha256:binding.conditioningAudioSha256,includeCardAudio:selected===audio,audioPath:binding.conditioningAudioPath,sceneAudioPath:owner?.videoDirection?.audio?.path,
          sceneRender:render,sceneCards:win.SCENES.filter(card=>card.scene===scene.scene),characters:cast});
        const {wav,start,end}=conditioningSlice(scene,render,driver);
        const file=path.join(work,'.source-audio',binding.conditioningAudioSha256+'-'+start+'-'+end+'.wav');
        fs.mkdirSync(path.dirname(file),{recursive:true});
        if (!fs.existsSync(file) || !fs.readFileSync(file).equals(wav)) fs.writeFileSync(file,wav);
        fields[1]=file;rows[row]=fields.join('\t');sliced=true;
      } else verifyConditioningPerformance(scene,win,Number(fields[0]),board,work,audio,hash(fs.readFileSync(audio)),render);
      continue;
    }
    if(!lines.length||(lines.length===1&&!hasCuedThought(scene)&&!lines.some(n=>n.acting!=null)&&!scene.performance?.some(event=>event.kind==='action')))continue;
    const sources=currentLineSources(lines,board,cast);
    const timing=sceneTiming(scene,board,win.SB_DOC?.performanceTimingVersion,win.STRUCTURE?.scenes),intervals=timing.intervals;
    const wav = mixLines(lines, sources, timing);
    const output=path.join(work,`c${fields[0]}-speech.wav`),tmp=output+'.tmp.wav';
    try {fs.writeFileSync(tmp,wav);fs.renameSync(tmp,output);} finally {if(fs.existsSync(tmp))fs.unlinkSync(tmp);}
    const receipt={generator:'speech_compose',audioSha256:hash(fs.readFileSync(output)),lineIds:lines.map(n=>n.id),lineSources:lineSources(lines),expectedText:lines.map(n=>n.tts).join('. '),durationSeconds:duration(output),intervals,timing:timing.timing,warnings:timing.warnings,status:'not_reviewed'};
    fs.writeFileSync(output+'.generation.json',JSON.stringify(receipt,null,2)+'\n');
    fields[1]=path.basename(output);rows[row]=fields.join('\t');outputs.push({shotId:scene.id,audioPath:output,...receipt});
  }
  if(outputs.length || sliced)fs.writeFileSync(cards,rows.join('\n'));
  return outputs;
}
module.exports={compose,lineSources,duration,sceneTiming,checkSilentTiming,conditioningInputs,currentConditioningAudio,verifyConditioningPerformance,matchesConditioningSlice};
if(require.main===module){try{console.log(JSON.stringify(compose(process.argv[2],process.argv[3]),null,2));}catch(e){console.error(e.message);process.exitCode=1;}}
