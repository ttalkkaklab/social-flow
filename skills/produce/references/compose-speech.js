#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {evaluateWindowScript}=require('../../_shared/scenes-vm.js');
const {actingErrors,speechRevisionPayload,planScenePerformance}=require('../../_shared/scene-acting.js');
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
function sceneTiming(scene, board, performanceTimingVersion) {
  const actions = (scene.performance || []).filter(event => event.kind === 'action');
  const legacy = performanceTimingVersion !== 1 && actions.length > 0 && !actions.some(event => event.durationSeconds !== undefined || event.withGroup !== undefined);
  const plan = planScenePerformance(legacy ? scene.narration : scene,line => duration(path.resolve(board,line.audio.path)));
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
  const wav=Buffer.alloc(44+total*2);
  wav.write('RIFF');wav.writeUInt32LE(36+total*2,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);
  wav.writeUInt32LE(48000,24);wav.writeUInt32LE(96000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(total*2,40);
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
  return false;
}

function currentConditioningAudio(scene, board, {index, timingVersion, driverSha256, audioPath, sceneAudioPath, includeCardAudio = true,
  work = path.resolve(board, '../.work'), timing = sceneTiming(scene, board, timingVersion)}) {
  const lines = (scene.narration || []).filter(line => line.tts?.trim());
  const sources = lines.map(line => path.resolve(board, line.audio.path));
  const interval = timing.intervals[0];
  const direct = lines.length === 1 && timing.intervals.length === 1 && interval.speechStartSeconds === 0 &&
    interval.speechEndSeconds === timing.durationSeconds && hash(fs.readFileSync(sources[0])) === driverSha256;
  const cards = path.join(work, 'cards.tsv');
  const choices = [audioPath, sceneAudioPath].filter(Boolean).map(file => path.resolve(board, file));
  if (includeCardAudio && fs.existsSync(cards)) {
    const rows = fs.readFileSync(cards, 'utf8').split(/\r?\n/).filter(row => row.trim() && !row.startsWith('#'))
      .map(row => row.split('\t')).filter(fields => fields[0].trim() && Number(fields[0]) === index);
    if (rows.length > 1 || rows.length && !rows[0][1]) throw new Error('conditioning_audio_unverified: ambiguous selected WAV in cards.tsv');
    if (rows.length) choices.push(path.resolve(work, rows[0][1]));
  }
  if (!choices.length) choices.push(direct ? sources[0] : path.join(work, `c${index}-speech.wav`));
  for (const file of new Set(choices)) {
    if (!fs.existsSync(file) || hash(fs.readFileSync(file)) !== driverSha256)
      throw new Error('conditioning_audio_unverified: the selected WAV differs from the recorded video driver');
  }
  if (!direct) {
    const composition = mixLines(lines, sources, timing);
    if (hash(composition) !== driverSha256 && !samePerformanceWav(choices[0], composition))
      throw new Error('conditioning_audio_unverified: the current line takes and timing do not produce the recorded video driver');
  }
  return choices[0];
}

function verifyConditioningPerformance(scene, win, index, board, work, audio, digest) {
  const binding = scene.visual?.video?.speechBinding;
  if (binding?.mode !== 'audio_conditioned' || binding.conditioningAudioSha256 && binding.conditioningAudioSha256 !== digest)
    throw new Error('conditioning_audio_unverified: the binding differs from the original A2V driver');
  const timing = sceneTiming(scene, board, win.SB_DOC?.performanceTimingVersion);
  const owner = win.STRUCTURE?.scenes?.find(row => row.no === scene.scene);
  currentConditioningAudio(scene, board, {index, work, timing, driverSha256:digest,
    audioPath:binding.conditioningAudioPath ?? audio, sceneAudioPath:owner?.videoDirection?.audio?.path});
  return timing.intervals;
}

function compose(work,board) {
  work=path.resolve(work);board=path.resolve(board);
  const file=path.join(board,'scenes.js'),win=evaluateWindowScript(fs.readFileSync(file,'utf8'),{filename:file});
  if(win.SB_DOC?.speechPlanVersion!==1)return [];
  const cast=Array.isArray(win.SB_DOC.characters)?win.SB_DOC.characters:Object.entries(win.SB_DOC.characters||{}).map(([id,c])=>({...c,id}));
  const cards=path.join(work,'cards.tsv'),rows=fs.readFileSync(cards,'utf8').split(/\r?\n/);
  const outputs=[];
  for(let row=0;row<rows.length;row++) {
    if(!rows[row].trim()||rows[row].startsWith('#'))continue;
    const fields=rows[row].split('\t'),scene=win.SCENES[Number(fields[0])];
    if(scene?.sound?.audioSource==='video')continue; // Its single soundtrack is extracted by prepare-source-audio.js.
    const lines=(scene?.narration||[]).filter(n=>(n.tts||'').trim());
    if(scene)checkSilentTiming(scene,board,win.SB_DOC?.performanceTimingVersion,path.resolve(work,fields[1]));
    // The selected A2V driver may be stereo or include renderer padding. Assembly
    // verifies its bytes and line intervals before mixing it with the picture.
    if(scene?.visual?.video?.speechBinding?.mode==='audio_conditioned' && lines.some(line=>line.delivery==='on_screen')) {
      const audio=path.resolve(work,fields[1]);
      if (!require('./prepare-source-audio.js').usesConditioningTrack(scene,board,audio))
        throw new Error('conditioning_audio_unverified: this shot no longer uses its A2V driver');
      verifyConditioningPerformance(scene,win,Number(fields[0]),board,work,audio,hash(fs.readFileSync(audio)));
      continue;
    }
    if(!lines.length||(lines.length===1&&!lines.some(n=>n.acting!=null)&&!scene.performance?.some(event=>event.kind==='action')))continue;
    const sources=[];
    lines.forEach(line=>{
      const errors=actingErrors(line.acting),voice=cast.find(c=>c.id===line.speaker)?.tts;
      errors.push(...generationVoiceErrors(voice,line.audio?.generation,line));
      if(errors.length)throw new Error(line.id+': '+errors.join('; '));
      if(!line.audio || line.audio.generation.text!==line.tts || line.audio.revision!==hash(JSON.stringify(speechRevisionPayload(line,voice))))throw new Error('Attach current audio for '+line.id);
      const source=path.resolve(board,line.audio.path);
      if(hash(fs.readFileSync(source))!==line.audio.sha256)throw new Error('Audio changed for '+line.id);
      require('../../_shared/character-speech.js').verifiedSpeechGeneration(source,line.audio.generation,voice,line);
      sources.push(source);
    });
    const timing=sceneTiming(scene,board,win.SB_DOC?.performanceTimingVersion),intervals=timing.intervals;
    const wav = mixLines(lines, sources, timing);
    const output=path.join(work,`c${fields[0]}-speech.wav`),tmp=output+'.tmp.wav';
    try {fs.writeFileSync(tmp,wav);fs.renameSync(tmp,output);} finally {if(fs.existsSync(tmp))fs.unlinkSync(tmp);}
    const receipt={generator:'speech_compose',audioSha256:hash(fs.readFileSync(output)),lineIds:lines.map(n=>n.id),lineSources:lineSources(lines),expectedText:lines.map(n=>n.tts).join('. '),durationSeconds:duration(output),intervals,timing:timing.timing,warnings:timing.warnings,status:'not_reviewed'};
    fs.writeFileSync(output+'.generation.json',JSON.stringify(receipt,null,2)+'\n');
    fields[1]=path.basename(output);rows[row]=fields.join('\t');outputs.push({shotId:scene.id,audioPath:output,...receipt});
  }
  if(outputs.length)fs.writeFileSync(cards,rows.join('\n'));
  return outputs;
}
module.exports={compose,lineSources,duration,sceneTiming,checkSilentTiming,currentConditioningAudio,verifyConditioningPerformance};
if(require.main===module){try{console.log(JSON.stringify(compose(process.argv[2],process.argv[3]),null,2));}catch(e){console.error(e.message);process.exitCode=1;}}
