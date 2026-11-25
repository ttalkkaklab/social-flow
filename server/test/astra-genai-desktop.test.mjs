import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildDesktopBody, desktopAudioWindow, DESKTOP_SCHEMAS, generateDesktopVideo, desktopVideoStatus } from '../dist/astra-genai-desktop.js';
import { config } from '../dist/config.js';
const base={model:'ltx-2.5-fast',prompt:'A ball',duration:2,resolution:'270p',reserveUsd:0};
test('native feature bodies separate temporal references, audio opt-in, edit caps and keyframe indices',()=>{
  assert.equal(buildDesktopBody('text-to-video',base,{}).inputs,undefined);
  const image=buildDesktopBody('image-to-video',{...base,imagePath:'a',lastFramePath:'b'},{a:'asset-a',b:'asset-b'});
  assert.deepEqual(image.inputs,{startFrame:{assetId:'asset-a'},endFrame:{assetId:'asset-b'}});
  const {duration,...audio}=base;
  assert.equal(buildDesktopBody('audio-to-video',{...audio,audioPath:'wav'},{wav:'asset-w'}).allowAudioTruncation,false);
  assert.equal(buildDesktopBody('audio-to-video',{...audio,audioPath:'wav',promptProvenance:'enhanced'},{wav:'asset-w'}).params.promptProvenance,'enhanced');
  const {resolution: _size, ...defaultSize} = audio;
  assert.equal(buildDesktopBody('audio-to-video',{...defaultSize,audioPath:'wav'},{wav:'w'}).params.resolution,'540p');
  const controls={negativePrompt:'text',nagScale:8,nagAlpha:0.25,nagTau:2.5,passShape:'parts'};
  const conditioned=buildDesktopBody('audio-to-video',{...audio,...controls,audioPath:'wav',imagePath:'start',prompt:''},{wav:'asset-w',start:'asset-i'});
  for(const [key,value] of Object.entries(controls)) assert.equal(conditioned.params[key],value);
  assert.equal(conditioned.inputs.startFrame.assetId,'asset-i');
  // A written prompt is sent as finished. Only a call naming typed lets the app rewrite it, and an empty prompt names nothing.
  assert.equal(image.params.promptProvenance,'enhanced');
  assert.equal(buildDesktopBody('text-to-video',{...base,promptProvenance:'typed'},{}).params.promptProvenance,'typed');
  assert.equal(conditioned.params.promptProvenance,undefined);
  assert.throws(()=>buildDesktopBody('image-to-video',{...base,imagePath:'a',promptProvenance:'skip'},{a:'asset-a'}));
  assert.throws(()=>buildDesktopBody('audio-to-video',{...base,audioPath:'wav'},{wav:'w'}));
  assert.throws(()=>buildDesktopBody('image-to-video',{...base,imagePath:'a',loras:[{ref:'opaque'}]},{a:'a'}));
  const edit=buildDesktopBody('retake',{model:base.model,sourceVideoPath:'v',startTime:0,duration:2,targetResolution:{width:576,height:320},reserveUsd:0},{v:'video'});
  assert.deepEqual(edit.params.resolution,{width:576,height:320});assert.equal(edit.params.targetResolution,undefined);
  // Retake and extend take no rewrite policy, even with a prompt.
  assert.equal(buildDesktopBody('extend',{model:base.model,prompt:'A ball rolls on',sourceVideoPath:'v',duration:2,reserveUsd:0},{v:'video'}).params.promptProvenance,undefined);
  const pins={...base,keyframes:[{imagePath:'a',frameIndex:0,strength:0},{imagePath:'b',frameIndex:48,strength:1}]};
  const keyframes=buildDesktopBody('keyframes',pins,{a:'a',b:'b'});
  assert.equal(keyframes.params.model,'fast');assert.equal(keyframes.keyframes[0].strength,0);
  assert.equal(keyframes.params.promptProvenance,'enhanced');
  for(const frameIndex of [0,49])assert.equal(DESKTOP_SCHEMAS.keyframes.safeParse({...pins,keyframes:[pins.keyframes[0],{imagePath:'b',frameIndex}]}).success,false);
});
test('explicit source windows honor Desktop milliseconds, grid and remaining audio', () => {
  const args = { ...base, audioPath: 'source.wav' };
  delete args.duration;
  const exact = desktopAudioWindow({ ...args, numFrames: 73, audioStartTime: 1 }, 4.1);
  assert.equal(exact.frames, 73);
  assert.equal(exact.start, 1);
  assert.equal(exact.uploadSeconds, 3.042);
  assert.equal(desktopAudioWindow({ audioMaxDuration: 3, allowAudioTruncation: true }, 8).frames, 65);
  assert.throws(() => desktopAudioWindow({ audioMaxDuration: 3 }, 8), /alignment/);
  assert.throws(() => desktopAudioWindow({ numFrames: 73, audioStartTime: 1 }, 4), /cover/);
  assert.throws(() => desktopAudioWindow({ audioStartTime: 4 }, 3), /outside/);
  assert.throws(() => desktopAudioWindow({ audioMaxDuration: 1.9 }, 8), /at least 2/);
  for (const fields of [{ numFrames: 72 }, { numFrames: 73, audioMaxDuration: 4 }])
    assert.equal(DESKTOP_SCHEMAS['audio-to-video'].safeParse({ ...args, ...fields }).success, false);
  const { params } = buildDesktopBody('audio-to-video', { ...args, audioStartTime: 1, numFrames: 73 }, { 'source.wav': 'audio' });
  assert.ok(!('audioStartTime' in params) && !('numFrames' in params));
});
test('upload, owned download and durable completed recovery use the gateway credential without resubmission',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'desktop-client-')), original=globalThis.fetch,key=config.astraGenaiApiKey;
  t.after(()=>{globalThis.fetch=original;config.astraGenaiApiKey=key;fs.rmSync(dir,{recursive:true,force:true});});config.astraGenaiApiKey='fixture';
  const source=path.join(dir,'input.mp4');execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=blue:s=64x64:r=24','-t','0.1','-pix_fmt','yuv420p',source]);
  const bytes=fs.readFileSync(source);let posts=0,uploads=0;
  globalThis.fetch=async(url,opts)=>{
    assert.equal(opts.headers.Authorization,'Bearer fixture');assert.equal(opts.redirect,'error');
    const route=new URL(url).pathname;
    if(route.endsWith('/assets') && opts.method==='POST'){uploads++;assert.ok(opts.body instanceof FormData);return Response.json({id:'asset-source'});}
    if(route.endsWith('/generations/extend')){posts++;const body=JSON.parse(opts.body);assert.equal(body.inputs.video.assetId,'asset-source');return Response.json({id:'job-1'});}
    if(route.endsWith('/generations/job-1'))return Response.json({id:'job-1',status:'succeeded',outputs:[{media_kind:'video',url:'/v1/ltx/desktop/assets/asset-out/bytes'}]});
    if(route.endsWith('/asset-out/bytes'))return new Response(bytes);
    assert.fail(route);
  };
  const args={model:base.model,duration:2,sourceVideoPath:source,reserveUsd:0,outputPath:dir,filename:'out.mp4'};
  const out=await generateDesktopVideo('extend',args);assert.equal(out.downloaded,true);assert.equal(uploads,1);assert.equal(posts,1);
  await generateDesktopVideo('extend',args);assert.equal(posts,1);assert.equal(uploads,1);
  await desktopVideoStatus(out.receiptPath,true);assert.equal(posts,1);
  await assert.rejects(generateDesktopVideo('extend',{...args,duration:3}),/conflicts/);
});
test('unknown POST result never retries, keyframes refuse a different active offering',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'desktop-unknown-')), original=globalThis.fetch,key=config.astraGenaiApiKey;
  config.astraGenaiApiKey='fixture';t.after(()=>{globalThis.fetch=original;config.astraGenaiApiKey=key;fs.rmSync(dir,{recursive:true,force:true});});
  let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('connection lost');};
  const args={...base,outputPath:dir,filename:'a.mp4'};
  await assert.rejects(generateDesktopVideo('text-to-video',args));await assert.rejects(generateDesktopVideo('text-to-video',args),/unknown/);assert.equal(calls,1);
  const source=path.join(dir,'a.png');fs.writeFileSync(source,'fixture');
  globalThis.fetch=async()=>Response.json({data:[{id:'ltx-2.3-fast'}],active_model:'ltx-2.3-fast'});
  await assert.rejects(generateDesktopVideo('keyframes',{...args,filename:'k.mp4',keyframes:[{imagePath:source,frameIndex:0}]}),/active_model/);
});
