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
    if(!lines.length||(lines.length===1&&!lines.some(n=>n.acting!=null)&&!scene.performance?.some(event=>event.kind==='action')))continue;
    const inputs=[],filters=[];
    lines.forEach((line,i)=>{
      const errors=actingErrors(line.acting),voice=cast.find(c=>c.id===line.speaker)?.tts;
      errors.push(...generationVoiceErrors(voice,line.audio?.generation,line));
      if(errors.length)throw new Error(line.id+': '+errors.join('; '));
      if(!line.audio || line.audio.generation.text!==line.tts || line.audio.revision!==hash(JSON.stringify(speechRevisionPayload(line,voice))))throw new Error('Attach current audio for '+line.id);
      const source=path.resolve(board,line.audio.path);
      if(hash(fs.readFileSync(source))!==line.audio.sha256)throw new Error('Audio changed for '+line.id);
      inputs.push('-i',source);
    });
    const timing=sceneTiming(scene,board,win.SB_DOC?.performanceTimingVersion),intervals=timing.intervals;
    lines.forEach((line,i)=>{
      const interval=intervals.find(item=>item.lineId===line.id);
      filters.push(`[${i}:a]aresample=48000,aformat=sample_fmts=s16:channel_layouts=mono,adelay=${Math.round(interval.speechStartSeconds*48000)}S:all=1[a${i}]`);
    });
    filters.push(lines.map((_,i)=>`[a${i}]`).join('')+`amix=inputs=${lines.length}:normalize=0,apad,atrim=duration=${timing.durationSeconds}[out]`);
    const output=path.join(work,`c${fields[0]}-speech.wav`),tmp=output+'.tmp.wav';
    try {execFileSync('ffmpeg',['-y','-v','error',...inputs,'-filter_complex',filters.join(';'),'-map','[out]','-c:a','pcm_s16le',tmp],{timeout:120000});fs.renameSync(tmp,output);} finally {if(fs.existsSync(tmp))fs.unlinkSync(tmp);}
    const receipt={generator:'speech_compose',audioSha256:hash(fs.readFileSync(output)),lineIds:lines.map(n=>n.id),lineSources:lineSources(lines),expectedText:lines.map(n=>n.tts).join('. '),durationSeconds:duration(output),intervals,timing:timing.timing,warnings:timing.warnings,status:'not_reviewed'};
    fs.writeFileSync(output+'.generation.json',JSON.stringify(receipt,null,2)+'\n');
    fields[1]=path.basename(output);rows[row]=fields.join('\t');outputs.push({shotId:scene.id,audioPath:output,...receipt});
  }
  if(outputs.length)fs.writeFileSync(cards,rows.join('\n'));
  return outputs;
}
module.exports={compose,lineSources,duration,sceneTiming,checkSilentTiming};
if(require.main===module){try{console.log(JSON.stringify(compose(process.argv[2],process.argv[3]),null,2));}catch(e){console.error(e.message);process.exitCode=1;}}
