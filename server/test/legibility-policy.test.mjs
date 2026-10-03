import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {roleFontFloor,measureSlideDOM,groupTextRows} from '../../skills/produce/references/slide-legibility.mjs';
import {contrastWarning} from '../../skills/produce/references/render-evidence.mjs';

const floors={foot:[28,24],kicker:[34,26],description:[44,32],label:[54,40],title:[76,56],word:[124,92],word2:[68,50]};
for(const [role,pair] of Object.entries(floors))test(`font floor ${role} stays ${pair.join('/')} and reaches DOM evidence`,()=>{
 for(const [i,wide] of [false,true].entries()){
  assert.equal(roleFontFloor(role,wide),pair[i]);
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
