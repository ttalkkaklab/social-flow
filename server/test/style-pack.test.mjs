import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const require=createRequire(import.meta.url);
const root=path.resolve(import.meta.dirname,'../..');
const {resolveStylePack,ROLES}=require('../../skills/storyboard/references/style-pack.js');
const {assemble}=require('../../skills/storyboard/references/spatial-prompts.js');
const {signature}=require('../../skills/storyboard/references/production-mode.js');
const plan=()=>({FORMAT:'shorts-9x16',PRODUCTION:{mode:'full_video',style:{world:'A contemporary machine workshop.',materials:'Brushed steel.',palette:'Ivory and blue.',lighting:'Soft light.',camera:'Readable medium shots.'}},SCENES:[{duration:5,narration:[{tts:'A worker closes the valve.'}],shot:{videoDesign:{motion:{kind:'subject_action',subject:'Worker',visibleChange:'The worker turns and releases the valve.',beats:[{at:0,state:'Hand reaches for the valve.'},{at:4,state:'Hand releases the closed valve.'}]},look:'miniature',before:'One worker reaches for a valve on a pipe.',action:'Turn the valve.',continuity:'Same worker, pipe and valve.'}},visual:{styleRole:'interaction',camera:{framing:'Show hand and valve.',movement:'dolly in',speed:'slow',end:'the closed valve centred'}}}]});

test('a copied plugin resolves verified image references without its original installation',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'style-pack-'));
 try{
  const ref=path.join(tmp,'skills/storyboard/references');fs.mkdirSync(ref,{recursive:true});
  fs.copyFileSync(path.join(root,'skills/storyboard/references/style-pack.js'),path.join(ref,'style-pack.js'));
  fs.cpSync(path.join(root,'skills/storyboard/assets'),path.join(tmp,'skills/storyboard/assets'),{recursive:true});
  const copy=require(path.join(ref,'style-pack.js'));
  for(const role of ROLES){const p=copy.resolveStylePack({role});assert.ok(p.referenceImagePaths[0].startsWith(fs.realpathSync(tmp)+path.sep));assert.deepEqual(p.binding,resolveStylePack({role}).binding);assert.ok(fs.statSync(p.guidePath).size>1000)}
  const p=copy.resolveStylePack();fs.appendFileSync(p.referenceImagePaths[0],'corrupt');
  assert.throws(()=>copy.resolveStylePack(),/checksum mismatch/);
 }finally{fs.rmSync(tmp,{recursive:true,force:true})}
});
test('assembly includes scene meaning, selected image arguments and a portable approval binding',()=>{
 const w=plan(),p=assemble(w,0);assert.match(p.sourcePrompt,/A worker closes the valve/);
 assert.match(p.sourcePrompt,/STYLE ONLY/);assert.match(p.sourcePrompt,/Brushed steel/);
 assert.equal(p.sourceReferenceImages.length,1);assert.equal(p.sourceImageArgs.referenced_image_paths[0],p.sourceReferenceImages[0]);
 assert.match(p.sourceReferenceImages[0],/conversation\.png$/);assert.ok(p.styleBinding.referenceFiles.every(f=>!path.isAbsolute(f)));
 const before=signature(w);w.SCENES[0].visual.stylePack=p.styleBinding;assert.notEqual(signature(w),before);
 const bound=signature(w);w.SCENES[0].visual.stylePack.digest='changed';assert.notEqual(signature(w),bound);
 w.SCENES[0].visual.styleRole='unknown';assert.throws(()=>assemble(w,0),/Unknown style reference role/);
});
test('style choice and its evidence are checked before assets and bound to the quote',()=>{
 const {check}=require('../../skills/storyboard/references/production-mode.js');
 const w=plan();Object.assign(w.PRODUCTION,{videoBudgetUsd:10,maxAttempts:3});
 w.PRODUCTION.style.preset='photoreal';
 const advice=[]; assert.deepEqual(check(w,{draft:true,advice}),[]);
 assert.ok(advice.some(x=>x.includes('PRODUCTION.style.selection')));
 w.PRODUCTION.style.selection={kind:'user',reference:'User selected photoreal for this episode.'};
 assert.deepEqual(check(w,{draft:true}),[]);
 const before=signature(w);w.PRODUCTION.style.preset='webtoon';assert.notEqual(signature(w),before);
});
