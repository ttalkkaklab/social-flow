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
test('failed video checks await HITL; explicit approval resumes without rewriting the failures',()=>fixture(({work,board})=>{
 const warnings=['shot 1: unresolved visual defects'],inputs={'clip.mp4':'abc'};
 assert.throws(()=>decide(work,board,warnings,inputs),/need HITL/);
 assert.throws(()=>approve(work,''),/explicit user/);
 approve(work,'User: proceed with the displayed defects');
 const result=decide(work,board,warnings,inputs);
 assert.equal(result.status,'approved-with-warnings');
 assert.deepEqual(result.warnings,warnings);
 assert.equal(decide(work,board,warnings,inputs).approved,true);
 assert.throws(()=>decide(work,board,['shot 1: new defect'],inputs),/need HITL/);
 assert.throws(()=>decide(work,board,warnings,{'clip.mp4':'changed'}),/need HITL/);
}));
test('a clean check needs no approval; a standing or malformed approval cannot waive warnings',()=>fixture(({work,board})=>{
 assert.equal(decide(work,board,[],{}).status,'pass');
 assert.throws(()=>approve(work,'generic permission'),/present the warnings/);
 assert.throws(()=>decide(work,board,['defect'],{}),/need HITL/);
 approve(work,'User message');
 const file=path.join(work,'assembly-video-approval.json');
 const a=JSON.parse(readFileSync(file));
 for(const change of [{kind:'standing'},{at:'invalid'},{reference:' '},{fingerprint:'stale'}]){
  writeFileSync(file,JSON.stringify({...a,...change}));
  assert.throws(()=>decide(work,board,['defect'],{}),/need HITL/);
 }
}));
test('approval tracks actual video bytes and source images, not just their paths',()=>fixture(({work,board})=>{
 writeFileSync(path.join(board,'scenes.js'),'window.SCENES=[{visual:{video:{clip:".work/clip.mp4"},image:"source.png"}}];');
 writeFileSync(path.join(work,'clip.mp4'),'first clip');
 writeFileSync(path.join(board,'source.png'),'first image');
 writeFileSync(path.join(work,'segs.tsv'),'0\t0\tclip.mp4\t\t\n');
 const initial=snapshot(work,board);
 assert.throws(()=>decide(work,board,['defect'],initial),/need HITL/);
 approve(work,'User approved this clip');
 assert.equal(decide(work,board,['defect'],snapshot(work,board)).approved,true);
 writeFileSync(path.join(work,'clip.mp4'),'replacement');
 assert.throws(()=>decide(work,board,['defect'],snapshot(work,board)),/need HITL/);
 writeFileSync(path.join(work,'clip.mp4'),'first clip');
 writeFileSync(path.join(board,'source.png'),'replacement image');
 assert.notDeepEqual(snapshot(work,board),initial);
}));
test('real preflight aggregates checker failures and resumes after HITL',()=>fixture(({work,board})=>{
 writeFileSync(path.join(board,'scenes.js'),'window.SCENES=[];window.PRODUCTION={mode:"full_video"};');
 assert.throws(()=>check(work,board),/need HITL/);
 const report=JSON.parse(readFileSync(path.join(work,'assembly-video-warnings.json')));
 assert.ok(report.warnings.some(w=>w.startsWith('check-scenes.js:')));
 assert.ok(report.warnings.some(w=>w.startsWith('check-production:')));
 approve(work,'User approved the displayed assembly warnings');
 assert.equal(check(work,board).approved,true);
 assert.ok(JSON.parse(readFileSync(path.join(work,'production-preflight.json'))).errors.length);
}));
test('unusable manifest wiring reports its error before encoding even with a generic approval',()=>fixture(({work,board})=>{
 writeFileSync(path.join(board,'scenes.js'),'window.SCENES=[];window.PRODUCTION={mode:"full_video"};');
 writeFileSync(path.join(work,'cards.tsv'),'9\tvoice.wav\t4\tnone\n');
 assert.throws(()=>check(work,board),/Edit plan card order differs/);
}));
