import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {cameraGuard,readContrastFrame,rowContrast} from '../../skills/produce/references/render-evidence.mjs';
const meta=(w,h)=>({zoomPeak:1.32,peakUpscale:Math.max(1080/w,1920/h)*1.32});
test('camera source guard rejects undersized 8-second push but accepts full canvas sources',()=>{
 assert.match(cameraGuard(meta(941,1672),1080,1920),/1.516 exceeds 1.5; minimum source 951x1690/);
 assert.equal(cameraGuard(meta(1088,1920),1080,1920),null);
 assert.equal(cameraGuard({zoomPeak:1.5,peakUpscale:1.5},1080,1920),null);
});
test('the renderer calls the tested camera guard and preserves the fatal error path',()=>{
 const s=fs.readFileSync(new URL('../../skills/produce/references/render-motion-slide.mjs',import.meta.url),'utf8');
 assert.match(s,/isCamera\?cameraGuard\(meta,W,H\):null/);assert.match(s,/if\(cameraProblem\)return die\(cameraProblem\)/);
});
test('one grayscale decode serves multiple row crops',()=>{
 let calls=0;
 const frame=readContrastFrame('sheet.png',4,2,()=>{calls++;return Buffer.from([0,255,80,80,0,255,80,80])});
 assert.equal(frame.error,null);
 assert.equal(rowContrast(frame.pixels,4,2,{x:0,y:0,w:2,h:2}),21);
 assert.equal(rowContrast(frame.pixels,4,2,{x:2,y:0,w:2,h:2}),1);
 assert.equal(calls,1);
 assert.equal(rowContrast(frame.pixels,4,2,{x:10,y:0,w:2,h:2}),null);
});
test('failed or incomplete contrast decoding produces an unmeasured result without throwing',()=>{
 for(const decode of [()=>{throw Error('ffmpeg unavailable')},()=>Buffer.from([0])]){
  const result=readContrastFrame('sheet.png',2,2,decode);assert.equal(result.pixels,null);assert.ok(result.error);
 }
 const source=fs.readFileSync(new URL('../../skills/produce/references/render-motion-slide.mjs',import.meta.url),'utf8');
 assert.match(source,/contrast unmeasured:/);
});
