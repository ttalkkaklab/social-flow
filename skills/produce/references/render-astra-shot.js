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
  execFileSync('ffmpeg', ['-v','error','-y','-i',source,'-af',`aresample=48000,apad,atrim=end_sample=${Math.ceil(seconds * 48000)}`,
    '-ar','48000','-ac','2','-c:a','pcm_s16le',output], { timeout:120000 });
  return {source,output,canonicalSeconds:measured,transportSeconds:seconds};
}

async function render(target, options) {
  if (!options.outputPath || !options.filename) throw new Error('Supply an output directory and unique candidate filename');
  if (path.basename(options.filename) !== options.filename || !options.filename.endsWith('.mp4'))
    throw new Error('Use a plain .mp4 candidate filename');
  const out = path.resolve(options.outputPath, options.filename);
  const record = out + '.render.json';
  if ([out,record,out+'.astra-job.json'].some(file=>fs.existsSync(file)))
    throw new Error('Candidate or submission already exists; reconcile its receipt before another request');
  fs.mkdirSync(path.dirname(out), {recursive:true});
  const input = {...options};
  if (options.audioPath) {
    input.audioPath = out + '.stereo.wav';
    execFileSync('ffmpeg',['-v','error','-y','-i',options.audioPath,'-ar','48000','-ac','2','-c:a','pcm_s16le',input.audioPath],{timeout:120000});
  }
  const prepared = await prepare(target, input);
  const args = {...prepared.arguments};
  let transport;
  if (prepared.tool === 'astra_audio2video') {
    const audio = out + '.conditioning.wav';
    transport = conditioningAudio(args.audioPath, audio, args.numFrames / args.frameRate);
    args.audioPath = audio;
  }
  const request = {shotId:prepared.shotId,tool:prepared.tool,arguments:args,transport,
    canonicalCoverage:prepared.coverage,quote:prepared.quote,review:'not_reviewed',status:'submitting'};
  fs.writeFileSync(record, JSON.stringify(request,null,2)+'\n');
  const client = await import(pathToFileURL(path.resolve(__dirname,'../../../server/dist/astra-shot-runtime.bundle.js')).href);
  const result = prepared.tool === 'astra_audio2video'
    ? await client.generateFromAudio(args) : await client.generateFromImage(args);
  const response = {...request,status:'generated',result,selection:{status:'provisional',
    review:{camera:'not_reviewed',blocking:'not_reviewed',phonemeLipSync:'not_reviewed'}},
    nextAction:'Inspect candidate and neighbours, then attach_video with the selected file. Findings are advisory; this renderer neither attaches nor certifies output.'};
  fs.writeFileSync(record,JSON.stringify(response,null,2)+'\n');
  return response;
}
module.exports = { render, conditioningAudio };
if (require.main === module) (async()=>{
  const args=process.argv.slice(2),target=args.shift(),options={};
  const names={'--shot':'shotId','--audio':'audioPath','--output':'outputPath','--filename':'filename'};
  while(args.length){const key=names[args.shift()];if(!key||!args.length)throw new Error('Use BOARD --shot ID [--audio WAV] --output DIR --filename UNIQUE.mp4');options[key]=args.shift();}
  if(!target||!options.shotId)throw new Error('Supply BOARD and stable shot ID');
  console.log(JSON.stringify(await render(target,options),null,2));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
