import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtempSync,writeFileSync,readFileSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
const require=createRequire(import.meta.url);
const {decide,approve,snapshot,check}=require('../../skills/produce/references/assembly-video-gate.js');
function fixture(fn){
 const root=mkdtempSync(path.join(tmpdir(),'assembly-hitl-'));
 const work=path.join(root,'.work'),board=path.join(root,'storyboard');
 mkdirSync(work);mkdirSync(board);
 try{fn({root,work,board});}finally{rmSync(root,{recursive:true,force:true});}
}
test('quality warnings continue automatically without inventing approval; explicit approval remains traceable',()=>fixture(({work,board})=>{
 const warnings=['shot 1: unresolved visual defects'],inputs={'clip.mp4':'abc'};
 assert.equal(decide(work,board,warnings,inputs).approved,false);
 assert.throws(()=>approve(work,''),/explicit user/);
 approve(work,'User: proceed with the displayed defects');
 const result=decide(work,board,warnings,inputs);
 assert.equal(result.status,'approved-with-warnings');
 assert.deepEqual(result.warnings,warnings);
 assert.equal(decide(work,board,warnings,inputs).approved,true);
 assert.equal(decide(work,board,['shot 1: new defect'],inputs).approved,false);
 assert.equal(decide(work,board,warnings,{'clip.mp4':'changed'}).approved,false);
}));
test('a clean check needs no approval; malformed approval never becomes verified consent',()=>fixture(({work,board})=>{
 assert.equal(decide(work,board,[],{}).status,'pass');
 assert.throws(()=>approve(work,'generic permission'),/present the warnings/);
 assert.equal(decide(work,board,['defect'],{}).status,'continue-with-warnings');
 approve(work,'User message');
 const file=path.join(work,'assembly-video-approval.json');
 const a=JSON.parse(readFileSync(file));
 writeFileSync(file,'{invalid');
 assert.equal(decide(work,board,['defect'],{}).approved,false);
 for(const change of [{kind:'standing'},{at:'invalid'},{reference:' '},{fingerprint:'stale'}]){
  writeFileSync(file,JSON.stringify({...a,...change}));
  assert.equal(decide(work,board,['defect'],{}).status,'continue-with-warnings');
 }
}));
test('approval tracks actual video bytes and source images, not just their paths',()=>fixture(({work,board})=>{
 writeFileSync(path.join(board,'scenes.js'),'window.SCENES=[{visual:{video:{clip:".work/clip.mp4"},image:"source.png"}}];');
 writeFileSync(path.join(work,'clip.mp4'),'first clip');
 writeFileSync(path.join(board,'source.png'),'first image');
 writeFileSync(path.join(work,'segs.tsv'),'0\t0\tclip.mp4\t\t\n');
 const initial=snapshot(work,board);
 assert.equal(decide(work,board,['defect'],initial).approved,false);
 approve(work,'User approved this clip');
 assert.equal(decide(work,board,['defect'],snapshot(work,board)).approved,true);
 writeFileSync(path.join(work,'clip.mp4'),'replacement');
 assert.equal(decide(work,board,['defect'],snapshot(work,board)).approved,false);
 writeFileSync(path.join(work,'clip.mp4'),'first clip');
 writeFileSync(path.join(board,'source.png'),'replacement image');
 assert.notDeepEqual(snapshot(work,board),initial);
}));
test('assembly ignores absent generation metadata but does not invent quality approval',()=>fixture(({work,board})=>{
 writeFileSync(path.join(board,'scenes.js'),'window.SCENES=[{id:"s0001",type:"points",duration:4,narration:[]}];window.PRODUCTION={mode:"full_video"};');
 const report=check(work,board); assert.equal(report.approved,false); assert.equal(report.continueWithWarnings,true);
}));
test('unusable manifest wiring reports its error before encoding even with a generic approval',()=>fixture(({work,board})=>{
 writeFileSync(path.join(board,'scenes.js'),'window.SCENES=[{id:"s0001",type:"points",duration:4,narration:[]}];window.PRODUCTION={mode:"full_video"};');
 writeFileSync(path.join(work,'cards.tsv'),'9\tvoice.wav\t4\tnone\n');
 assert.throws(()=>check(work,board),/check-production:|Edit plan card order differs/);
}));

test('assembly rejects broken execution references before collecting quality warnings',()=>fixture(({work,board})=>{
 const shot={id:'s0001',type:'points',duration:4,narration:[]};
 for(const scenes of [[],[shot,shot],[{...shot,shot:{eyeline:{matchShot:'missing'}}}]]) {
  writeFileSync(path.join(board,'scenes.js'),'window.SCENES='+JSON.stringify(scenes)+';');
  assert.throws(()=>check(work,board),/Invalid assembly inputs:/);
 }
}));
