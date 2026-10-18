import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {mkdtempSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
const require=createRequire(import.meta.url);
const delivery=require('../../skills/produce/references/delivery-proof.js');
const hash=s=>createHash('sha256').update(s).digest('hex');
test('delivery gate rejects ad hoc exports, stale media and changed storyboards',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'cinematic-delivery-'));
 try{
  mkdirSync(path.join(dir,'output/video'),{recursive:true});mkdirSync(path.join(dir,'storyboard'));mkdirSync(path.join(dir,'.work'));
  const source='window.SCENES=[{type:"points",transition:"cut"}];';writeFileSync(path.join(dir,'storyboard/scenes.js'),source);
  const out=path.join(dir,'output/video');writeFileSync(path.join(out,'video.mp4'),'master');writeFileSync(path.join(out,'subs.srt'),'subtitles');
  assert.match(delivery.check(dir),/no current assembly proof/);
  const proof={version:1,kind:'storyboard',scenesSha256:hash(source),editCheckSha256:hash('edit'),assembledSha256:hash('assembly'),outputs:{'video.mp4':hash('master'),'video-sub.mp4':null,'subs.srt':hash('subtitles')}};
  writeFileSync(path.join(out,'delivery-proof.json'),JSON.stringify(proof));assert.equal(delivery.check(dir),null);
  writeFileSync(path.join(out,'video-sub.mp4'),'stale burn');assert.match(delivery.check(dir),/output changed/);rmSync(path.join(out,'video-sub.mp4'));
  writeFileSync(path.join(dir,'storyboard/scenes.js'),source+'\n');assert.match(delivery.check(dir),/storyboard changed/);
  assert.throws(()=>delivery.record(path.join(dir,'.work'),1),/common builder proof/);
  writeFileSync(path.join(dir,'.work/edit.json'),'{}');assert.throws(()=>delivery.record(path.join(dir,'.work'),1),/cannot waive/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
