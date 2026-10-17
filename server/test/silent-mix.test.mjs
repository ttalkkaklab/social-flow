import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const script=new URL('../../skills/produce/references/silent-mix.sh',import.meta.url).pathname;
test('explicit silent mix preserves fractional-frame audio clock and rejects sound',t=>{
 const dir=mkdtempSync(path.join(tmpdir(),'sf-silent-mix-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const zero=path.join(dir,'zero.wav'),tone=path.join(dir,'tone.wav'),out=path.join(dir,'mix.wav');
 for(const [input,file] of [['anullsrc=r=48000:cl=mono',zero],['sine=frequency=440:sample_rate=48000',tone]]){
  const r=spawnSync('ffmpeg',['-v','error','-y','-f','lavfi','-i',input,'-af','atrim=end_sample=290000','-c:a','pcm_s16le',file],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);
 }
 let r=spawnSync('bash',[script,zero,out],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);
 const probe=spawnSync('ffprobe',['-v','error','-show_entries','stream=duration_ts,time_base,channels','-of','json',out],{encoding:'utf8'});
 const s=JSON.parse(probe.stdout).streams[0];assert.equal(s.duration_ts,290000);assert.equal(s.time_base,'1/48000');assert.equal(s.channels,2);
 rmSync(out);r=spawnSync('bash',[script,tone,out],{encoding:'utf8'});assert.notEqual(r.status,0);assert.equal(existsSync(out),false);
 r=spawnSync('bash',[script,zero,out,tone],{encoding:'utf8'});assert.notEqual(r.status,0);assert.equal(existsSync(out),false);
});

import silentPlan from '../../skills/produce/references/silent-plan.js';
test('silent film refuses authored speech and legacy or extended sound cues',()=>{
 assert.doesNotThrow(()=>silentPlan.checkSilentPlan({SCENES:[{narration:[],sound:{effects:[]}}]}));
 for(const key of ['cue','sfx','ambience','effects'])
  assert.throws(()=>silentPlan.checkSilentPlan({MUSIC:{base:{}},SCENES:[{sound:{[key]:key==='effects'?['door']:'rain'}}]}),/conflicts/);
 assert.throws(()=>silentPlan.checkSilentPlan({SCENES:[{narration:[{tts:'Hello'}]}]}),/spoken text/);
});
