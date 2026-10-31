#!/usr/bin/env node
'use strict';
// Execute the prepared adapter request without promoting a candidate to reviewed footage.
const fs = require('node:fs'), path = require('node:path');
const { pathToFileURL } = require('node:url');
const { execFileSync } = require('node:child_process');
const { prepare } = require('./prepare-astra-shot.js');

function conditioningAudio(source, output, seconds) {
  if (path.resolve(source) === path.resolve(output)) throw new Error('Never overwrite canonical speech with transport padding');
  const measured = require('./compose-speech.js').duration(source);
  if (!Number.isFinite(seconds) || seconds < measured - 1 / 48000)
    throw new Error('Transport duration cannot truncate supplied speech');
  execFileSync('ffmpeg', ['-v','error','-y','-i',source,'-af',`aresample=48000,apad=whole_len=${Math.ceil(seconds * 48000)},atrim=end_sample=${Math.ceil(seconds * 48000)}`,
    '-ar','48000','-ac','2','-c:a','pcm_s16le',output], { timeout:120000 });
  return {source,output,canonicalSeconds:measured,transportSeconds:seconds};
}

function reserveCandidate(out, metadata = {}) {
  const record = out + '.render.json';
  if ([out,record,out+'.astra-job.json'].some(file=>fs.existsSync(file)))
    throw new Error('Candidate or submission already exists; reconcile its receipt before another request');
  fs.mkdirSync(path.dirname(out), {recursive:true});
  try {
    fs.writeFileSync(record, JSON.stringify({status:'preparing',review:'not_reviewed',...metadata})+'\n', {flag:'wx'});
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error('Candidate or submission already exists; reconcile its receipt before another request');
    throw error;
  }
}

function reserveRetryCandidates(out, maxAttempts) {
  for (let attempt = 2; attempt <= maxAttempts; attempt++) {
    const retry = out.replace(/(\.[^.]+)?$/, ext => `-attempt${attempt}${ext}`);
    reserveCandidate(retry, {parentCandidate:out,attempt});
  }
}

async function render(target, options) {
  if (!options.outputPath || !options.filename) throw new Error('Supply an output directory and unique candidate filename');
  if (path.basename(options.filename) !== options.filename || !options.filename.endsWith('.mp4'))
    throw new Error('Use a plain .mp4 candidate filename');
  const out = path.resolve(options.outputPath, options.filename);
  const record = out + '.render.json';
  // Reserve before preparing audio: concurrent invocations must not submit the same candidate.
  reserveCandidate(out);
  const workflow = await import(pathToFileURL(path.resolve(__dirname,'../../../server/dist/astra-shot-runtime.bundle.js')).href);
  workflow.requireWorkflow(target, 'video');

  const input = {...options};
  if (options.audioPath) {
    input.audioPath = out + '.stereo.wav';
    execFileSync('ffmpeg',['-v','error','-y','-i',options.audioPath,'-ar','48000','-ac','2','-c:a','pcm_s16le',input.audioPath],{timeout:120000});
  }
  const prepared = await prepare(target, input);
  const client = await import(pathToFileURL(path.resolve(__dirname,'../../../server/dist/astra-shot-runtime.bundle.js')).href);
  const args = prepared.tool === 'astra_audio2video'
    ? client.astraAudio2VideoSchema.parse(prepared.arguments) : {...prepared.arguments};
  // Retries share the provider's filename convention. Claim their paths before any submission,
  // including the schema's default attempt count; keep claims if preparation/submission fails.
  if (prepared.tool === 'astra_audio2video' && args.expectLipSync)
    reserveRetryCandidates(out, args.maxAttempts);
  let transport;
  if (prepared.tool === 'astra_audio2video') {
    const audio = out + '.conditioning.wav';
    transport = conditioningAudio(args.audioPath, audio, args.numFrames / args.frameRate);
    args.audioPath = audio;
  }
  const request = {shotId:prepared.shotId,tool:prepared.tool,arguments:args,transport,keyframes:prepared.keyframes,
    canonicalCoverage:prepared.coverage,quote:prepared.quote,review:'not_reviewed',status:'submitting'};
  fs.writeFileSync(record, JSON.stringify(request,null,2)+'\n');
  const result = await submitPrepared(client, prepared.tool, args);
  const response = {...request,status:'generated',result,selection:{status:'provisional',
    review:{camera:'not_reviewed',blocking:'not_reviewed',phonemeLipSync:'not_reviewed'}},
    nextAction:'Inspect candidate and neighbours, then attach_video with the selected file. Findings are advisory; this renderer neither attaches nor certifies output.'};
  fs.writeFileSync(record,JSON.stringify(response,null,2)+'\n');
  return response;
}
async function submitPrepared(client, tool, args) {
  if (tool === 'astra_audio2video') return client.generateFromAudio(client.astraAudio2VideoSchema.parse(args));
  if (tool === 'astra_img2video') return client.generateFromImage(client.astraImg2VideoSchema.parse(args));
  if (tool === 'astra_keyframe_video') return client.generateFromKeyframes(client.astraKeyframeVideoSchema.parse(args));
  throw new Error('Unsupported prepared ASTRA tool: ' + tool);
}
module.exports = { render, conditioningAudio, reserveRetryCandidates, submitPrepared };
if (require.main === module) (async()=>{
  const args=process.argv.slice(2),target=args.shift(),options={};
  const names={'--shot':'shotId','--audio':'audioPath','--output':'outputPath','--filename':'filename'};
  while(args.length){const key=names[args.shift()];if(!key||!args.length)throw new Error('Use BOARD --shot ID [--audio WAV] --output DIR --filename UNIQUE.mp4');options[key]=args.shift();}
  if(!target||!options.shotId)throw new Error('Supply BOARD and stable shot ID');
  console.log(JSON.stringify(await render(target,options),null,2));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
