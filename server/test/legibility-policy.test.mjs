import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {roleFontFloor,measureSlideDOM,groupTextRows} from '../../skills/produce/references/slide-legibility.mjs';
import {contrastWarning} from '../../skills/produce/references/render-evidence.mjs';

const floors={foot:[28,24],kicker:[34,26],description:[44,32],label:[54,40],title:[76,56],word:[124,92],word2:[68,50]};
// Only foot/description are currently emitted as data-type-role. Other explicit roles
// are value-contract locks; kicker/word/word2 behavior is covered by selectors below.
for(const [role,pair] of Object.entries(floors))test(`${['foot','description'].includes(role)?'emitted font role':'font value contract'} ${role} stays ${pair.join('/')}`,()=>{
 for(const [i,wide] of [false,true].entries()){
  assert.equal(roleFontFloor(role,wide),pair[i]);
  if(!['foot','description'].includes(role))continue;
  const el={id:'sample',dataset:{typeRole:role},parentElement:null,closest:s=>s==='[data-type-role]'?el:null,matches:()=>false};
  const node={textContent:'A',parentElement:el};let read=false;
  const context={window:{FORMAT:wide?'youtube-long-16x9':'shorts-9x16'},NodeFilter:{SHOW_TEXT:4},document:{getElementById:()=>({querySelectorAll:()=>[]}),createTreeWalker:()=>({nextNode:()=>read?null:(read=true,node)}),createRange:()=>({setStart(){},setEnd(){},getBoundingClientRect:()=>({x:0,y:0,width:10,height:20})})},getComputedStyle:()=>({display:'block',visibility:'visible',opacity:'1',fontSize:String(pair[i])})};
  const measured=vm.runInNewContext(`(${measureSlideDOM})(${groupTextRows},${roleFontFloor})`,context);
  assert.equal(measured.textSamples[0].floor,pair[i]);
  assert.equal(measured.min_text_px.px,pair[i]);
  assert.equal(measured.textSamples.filter(s=>s.px<s.floor).length,0);
 }
});
for(const [px,ratio,warn] of [[65,4.49,true],[65,4.51,false],[66,2.99,true],[66,3.01,false]])test(`contrast px ${px} ratio ${ratio} warning ${warn}`,()=>{
 const message=contrastWarning(ratio,px,'#sample');
 assert.equal(message!==null,warn);
 if(warn)assert.match(message,new RegExp(`below ${px===65?'4.5':'3'}:1`));
});
test('exact contrast boundaries pass; unmeasured contrast is not a low contrast warning',()=>{
 assert.equal(contrastWarning(4.5,65,'x'),null);
 assert.equal(contrastWarning(3,66,'x'),null);
 assert.equal(contrastWarning(null,65,'x'),null);
});
test('renderer serializes the tested font policy and uses the tested contrast decision',()=>{
 const source=fs.readFileSync(new URL('../../skills/produce/references/render-motion-slide.mjs',import.meta.url),'utf8');
 assert.ok(source.includes('${measureSlideDOM.toString()})(${groupTextRows.toString()},${roleFontFloor.toString()})'));
 assert.match(source,/const contrastProblem=contrastWarning\(ratio,row\.px,item\.sel\)/);
 assert.match(source,/if \(contrastProblem\) warn\.push\(contrastProblem\)/);
 assert.match(source,/if \(item\.px < item\.floor\)/);
});

function measureElement(selectors, role, wide, px) {
 const el={id:'sample',dataset:role?{typeRole:role}:{},parentElement:null,closest:s=>s==='[data-type-role]'?(role?el:null):s.split(',').some(part=>selectors.includes(part))?el:null,matches:s=>selectors.includes(s)};
 const node={textContent:'A',parentElement:el};let read=false;
 const context={window:{FORMAT:wide?'youtube-long-16x9':'shorts-9x16'},NodeFilter:{SHOW_TEXT:4},document:{getElementById:()=>({querySelectorAll:()=>[]}),createTreeWalker:()=>({nextNode:()=>read?null:(read=true,node)}),createRange:()=>({setStart(){},setEnd(){},getBoundingClientRect:()=>({x:0,y:0,width:10,height:20})})},getComputedStyle:()=>({display:'block',visibility:'visible',opacity:'1',fontSize:String(px)})};
 return vm.runInNewContext(`(${measureSlideDOM})(${groupTextRows},${roleFontFloor})`,context);
}
for(const [selector,pair] of [['#source',[28,24]],['.foot',[28,24]],['#eyebrow',[34,26]],['.kicker',[34,26]],['#insight',[44,32]],['.desc',[44,32]],['.sub',[44,32]],['.word2',[68,50]],['.word',[124,92]],['unclassified',[28,24]]])test(`font selection branch ${selector} picks the role floor in both formats`,()=>{
 for(const [i,wide] of [false,true].entries()){
  const normal=measureElement([selector],undefined,wide,pair[i]);
  assert.equal(normal.textSamples[0].floor,pair[i]);
  assert.equal(normal.textSamples.filter(s=>s.px<s.floor).length,0);
  const small=measureElement([selector],undefined,wide,pair[i]-1);
  assert.equal(small.textSamples.filter(s=>s.px<s.floor).length,1);
 }
});
test('explicit role contract precedence and reachable unknown-role fallback',()=>{
 assert.equal(measureElement(['.word'],'label',false,54).textSamples[0].floor,54);
 assert.equal(measureElement(['.word'],'unknown',true,92).textSamples[0].floor,92);
});

import {rowContrast} from '../../skills/produce/references/render-evidence.mjs';
function runRendererContrast(pixels, text) {
 const source=fs.readFileSync(new URL('../../skills/produce/references/render-motion-slide.mjs',import.meta.url),'utf8');
 const start=source.indexOf('    const contrastFrame=');
 const end=source.indexOf('    // Crossfade remnants',start);
 assert.ok(start>=0&&end>start);
 let decodes=0;
 const context={legibility:{text},path:{join:(...parts)=>parts.join('/')},OUT:'out',N:1,W:2,H:3,readContrastFrame:()=>{decodes++;return {pixels,error:null};},rowContrast,contrastWarning};
 const result=vm.runInNewContext('let minContrast=null;const warn=[];'+source.slice(start,end)+';({minContrast,warn})',context);
 return {...result,decodes};
}
const textRows=()=>[0,1,2].map(y=>({sel:'#row'+y,rows:[{x:0,y,w:2,h:1,px:65}]}));
test('renderer contrast gate measures visible rows and produces low-contrast evidence',()=>{
 const result=runRendererContrast(Uint8Array.from([100,100,0,255,0,255]),textRows());
 assert.equal(result.decodes,1);
 assert.equal(result.minContrast.ratio,1);
 assert.equal(result.warn.length,1);
 assert.match(result.warn[0],/contrast #row0: 1.00:1 below 4.5:1/);
});
test('renderer min_contrast keeps the lowest row and normal rows have zero warnings',()=>{
 const result=runRendererContrast(Uint8Array.from([0,255,0,180,0,230]),textRows());
 assert.equal(result.decodes,1);
 assert.equal(result.minContrast.sel,'#row1');
 assert.ok(result.minContrast.ratio>4.5&&result.minContrast.ratio<21);
 assert.equal(result.warn.length,0);
});
