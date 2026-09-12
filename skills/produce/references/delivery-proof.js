#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const pairs=[['reel-fast.mp4','video.mp4'],['reel-sub-fast.mp4','video-sub.mp4'],['subs-fast.srt','subs.srt']];
function record(work,speed){
  if(!Number.isFinite(speed)||speed<=0)throw new Error('Invalid delivery speed');
  let provenance;
  const sourceProof=path.join(work,'build-plan-check.json');
  if(fs.existsSync(sourceProof)){
    const spliced=fs.existsSync(path.join(work,'reel-spliced.mp4'));
    require('./verify-assembled.js').check(work,...(spliced?['reel-spliced.mp4','reel-sub-spliced.mp4','subs-spliced.srt']:['reel.mp4','reel-sub.mp4','subs.srt']));
    const source=JSON.parse(fs.readFileSync(sourceProof,'utf8'));
    provenance={kind:'storyboard',scenesSha256:source.scenesSha256,editCheckSha256:hash(path.join(work,'edit-check.json')),assembledSha256:hash(path.join(work,'assembled-check.json'))};
  }else{
    const edit=path.join(work,'edit.json');
    if(!fs.existsSync(edit))throw new Error('Delivery requires the common builder proof (or a shooting edit.json)');
    JSON.parse(fs.readFileSync(edit,'utf8'));
    const board=path.resolve(work,'../storyboard/scenes.js');
    if(fs.existsSync(board)){
      const win=require('../../autoproduce/references/cost-preview.js').readScenes(board);
      if(win.SCENES.some(s=>!['broll','outro'].includes(s.type)&&!['recording','screencast'].includes(s.visual?.source)))
        throw new Error('Generated/mixed scenes require the common builder; edit.json cannot waive assembly checks');
    }
    provenance={kind:'screencast',editSha256:hash(edit),scenesSha256:fs.existsSync(board)?hash(board):null};
  }
  const board=path.resolve(work,'../storyboard/scenes.js');
  let finalSpeech;
  if(fs.existsSync(board)){
    const gate=require('./check-final-tts.js'),n=gate.narration(board);
    if(n.generated){
      const media=path.join(work,'reel-fast.mp4');
      finalSpeech=gate.verify(media,n.text);
    }
  }
  const outputs=Object.fromEntries(pairs.map(([src,dst])=>[dst,fs.existsSync(path.join(work,src))?hash(path.join(work,src)):null]));
  if(!outputs['video.mp4']||!outputs['subs.srt'])throw new Error('Delivery needs the checked video and subtitle set');
  fs.writeFileSync(path.join(work,'delivery-proof.json'),JSON.stringify({version:1,speed,...provenance,outputs,requiresFinalSpeech:!!finalSpeech,...(finalSpeech?{finalSpeech}:{})},null,2)+'\n');
}
function check(episode){
  try{
    const out=path.join(episode,'output/video'),proof=JSON.parse(fs.readFileSync(path.join(out,'delivery-proof.json'),'utf8'));
    if(proof.version!==1||!proof.outputs?.['video.mp4']||!proof.outputs?.['subs.srt'])throw new Error('missing output hashes');
    if(!['storyboard','screencast'].includes(proof.kind)||proof.kind==='storyboard'&&(!proof.editCheckSha256||!proof.assembledSha256)||proof.kind==='screencast'&&!proof.editSha256)throw new Error('missing assembly provenance');
    for(const [,dst] of pairs){
      const f=path.join(out,dst);
      if(!Object.hasOwn(proof.outputs,dst)||(fs.existsSync(f)?hash(f):null)!==proof.outputs[dst])throw new Error('output changed: '+dst);
    }
    const board=path.join(episode,'storyboard/scenes.js');
    if(proof.kind==='storyboard'&&!fs.existsSync(board))throw new Error('storyboard missing after delivery review');
    if(proof.requiresFinalSpeech&&!proof.finalSpeech)throw new Error('required final speech evidence missing');
    if(fs.existsSync(board)){
      const gate=require('./check-final-tts.js'),n=gate.narration(board);
      if(n.generated||proof.requiresFinalSpeech){
        if(!proof.finalSpeech||proof.finalSpeech.mediaSha256!==proof.outputs['video.mp4'])throw new Error('missing final speech proof');
        // Validate embedded evidence with the same verifier without creating output artifacts.
        gate.verifyReport(proof.finalSpeech,path.join(out,'video.mp4'),n.text);
      }
    }
    if(fs.existsSync(board)&&hash(board)!==proof.scenesSha256)throw new Error('storyboard changed after assembly');
    return null;
  }catch(e){return 'Delivery has no current assembly proof: '+e.message+'; rebuild through build-reel.sh and speedup.sh, then copy delivery-proof.json with the final files';}
}
module.exports={record,check};
if(require.main===module){try{record(path.resolve(process.argv[2]||'.'),Number(process.argv[3]||1));}catch(e){console.error(e.message);process.exitCode=1;}}
