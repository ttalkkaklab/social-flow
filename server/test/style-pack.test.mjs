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
const plan=()=>({FORMAT:'shorts-9x16',PRODUCTION:{mode:'full_video',style:{world:'A contemporary machine workshop.',materials:'Brushed steel.',palette:'Ivory and blue.',lighting:'Soft light.'}},SCENES:[{duration:5,narration:[{tts:'A worker closes the valve.'}],shot:{videoDesign:{motion:{kind:'subject_action',subject:'Worker',visibleChange:'The worker turns and releases the valve.',beats:[{at:0,state:'Hand reaches for the valve.'},{at:4,state:'Hand releases the closed valve.'}]},look:'miniature',before:'One worker reaches for a valve on a pipe.',action:'Turn the valve.',after:'The same valve is closed.',camera:'Small push in.',continuity:'Same worker, pipe and valve.'}},visual:{styleRole:'interaction',camera:{framing:'Show hand and valve.'}}}]});

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
test('archival scenes do not get a generated appearance reference or attachment',()=>{
 const w=plan();w.SCENES[0].shot.videoDesign.look='archive';const p=assemble(w,0);
 assert.deepEqual(p.sourceReferenceImages,[]);assert.deepEqual(p.sourceImageArgs,{});assert.equal(p.styleBinding,null);
 assert.doesNotMatch(p.sourcePrompt,/STYLE ONLY/);
});
test('selected photoreal and webtoon styles reach both frame prompts and motion without miniature images',()=>{
 for(const mode of ['hybrid','full_video']) for(const [preset,look,pattern] of [['photoreal','realistic',/Photoreal live-action/],['webtoon','webtoon',/Korean webtoon/]]){
  const w=plan();w.PRODUCTION.mode=mode;w.PRODUCTION.style.preset=preset;w.SCENES[0].shot.videoDesign.look=look;
  const p=assemble(w,0);
  for(const key of ['sourcePrompt','endFramePrompt','motionPrompt']) assert.match(p[key],pattern);
  assert.deepEqual(p.sourceImageArgs,{});assert.deepEqual(p.sourceReferenceImages,[]);assert.equal(p.styleBinding,null);
  w.PRODUCTION.style.referencePack='tactile-miniature-v1';assert.throws(()=>assemble(w,0),/Remove the miniature/);
 }
});
test('a conflicting shot look cannot silently change the selected episode style',()=>{
 const w=plan();w.PRODUCTION.style.preset='webtoon';assert.throws(()=>assemble(w,0),/conflicts/);
 w.PRODUCTION.style.preset='unknown';assert.throws(()=>assemble(w,0),/Unknown visual style/);
});
test('style choice and its evidence are checked before assets and bound to the quote',()=>{
 const {check}=require('../../skills/storyboard/references/production-mode.js');
 const w=plan();Object.assign(w.PRODUCTION,{videoBudgetUsd:10,maxAttempts:3});
 w.PRODUCTION.style.preset='photoreal';
 assert.ok(check(w,{draft:true}).some(x=>x.includes('HITL')));
 w.PRODUCTION.style.selection={kind:'user',reference:'User selected photoreal for this episode.'};
 assert.deepEqual(check(w,{draft:true}),[]);
 const before=signature(w);w.PRODUCTION.style.preset='webtoon';assert.notEqual(signature(w),before);
});
