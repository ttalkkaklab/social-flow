import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';
import { writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root=resolve(process.argv[2]);
const file=join(root,'server/dist/astra-shot-runtime.bundle.js');
const {prepareVideoSound}=await import(pathToFileURL(file));
const effect={id:'contact',delivery:'auto',description:'Dry Bakelite clack',trigger:'Receiver contacts cradle once'};
const checks=[];
for (const [tool,args,expected] of [
  ['veo_text2video',{},'native'],['omni_text2video',{},'native'],
  ['seedance_text2video',{},'native'],
  ['seedance_text2video',{model:'seedance-1-0-pro-250528'},'post'],
  ['seedance_text2video',{generateAudio:false},'post'],
  ['astra_text2video',{},'native'],
  ['astra_audio2video',{audioPath:'/tmp/composed.wav'},'post'],
]) {
  const plan=prepareVideoSound(tool,{prompt:'Man puts receiver down.',...args},{effects:[effect]});
  assert.equal(plan.sound.effects[0].delivery,expected);
  checks.push({tool,args,expected,passed:true});
}
const input=prepareVideoSound('astra_audio2video',{prompt:'Man puts receiver down.',audioPath:'/tmp/composed.wav'},
  {effects:[{...effect,delivery:'input'}]});
assert.equal(input.sound.audioSource,'video');assert.match(input.arguments.prompt,/not mouths/);
checks.push({case:'explicit input ownership and physical sound prompt',passed:true});
for (const effects of [[],[{delivery:'post',sfx:'click',atSeconds:1}]]) {
  assert.equal(prepareVideoSound('seedance_text2video',{prompt:'Man'},{audioSource:'video',effects}).arguments.generateAudio,true);
  assert.throws(()=>prepareVideoSound('seedance_text2video',{prompt:'Man',generateAudio:false},{audioSource:'video',effects}),/silent output/);
  checks.push({case:effects.length?'explicit video soundtrack with post-only effects':'explicit video soundtrack with no effects',passed:true});
}
for (const tool of ['veo_text2video','seedance_reference','omni_text2video']) {
  assert.throws(()=>prepareVideoSound(tool,{prompt:'Man'},{effects:[{...effect,delivery:'input'}]}),/Input SFX/);
  checks.push({tool,case:'reference is not preserved input',passed:true});
}
const report={root,passed:true,checks,bundleSha256:createHash('sha256').update(readFileSync(file)).digest('hex'),
  coverage:'Installed adapter planning only; no cloud rendering, upload or perceptual judgment.'};
if(process.argv[3])writeFileSync(process.argv[3],JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
