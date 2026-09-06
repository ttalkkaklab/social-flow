'use strict';
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function inputs(html){
  html=path.resolve(html);const board=path.resolve(path.dirname(html),'..');
  const files=[html,path.join(board,'scenes.js')];
  const walk=dir=>{if(!fs.existsSync(dir))return;for(const ent of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,ent.name);if(ent.isDirectory())walk(file);else if(ent.isFile())files.push(file)}};
  walk(path.join(board,'slides/assets'));walk(path.join(board,'images'));
  return Object.fromEntries(files.sort().map(file=>[file,hash(file)]));
}
function writeProof(html,out,source,rows,fps){
  if(JSON.stringify(inputs(html))!==JSON.stringify(source))throw new Error('slide sources changed during capture; render again');
  const outputs=rows.map(r=>({group:r.k,file:path.basename(r.mp4),sha256:hash(r.mp4),frames:r.nF,duration:r.nF/fps}));
  fs.writeFileSync(path.join(out,'render-proof.json'),JSON.stringify({version:1,html:path.resolve(html),inputs:source,outputs},null,2)+'\n');
}
function verifyClip(clip,html,group){
  const proofFile=path.join(path.dirname(clip),'render-proof.json');
  if(!fs.existsSync(proofFile))throw new Error('missing render-proof.json for '+clip+'; render the checked slide with render-motion-slide.mjs');
  const proof=JSON.parse(fs.readFileSync(proofFile,'utf8'));
  if(proof.version!==1||proof.html!==path.resolve(html)||JSON.stringify(proof.inputs)!==JSON.stringify(inputs(html)))throw new Error('stale or unrelated slide sources for '+clip);
  const output=proof.outputs?.find(r=>r.group===group&&r.file===path.basename(clip));
  if(!output||!fs.existsSync(clip)||output.sha256!==hash(clip))throw new Error('rendered clip differs from its source proof: '+clip);
  return output;
}
module.exports={inputs,writeProof,verifyClip};
