import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {groupTextRows, percentileContrast, measureSlideDOM, roleFontFloor} from '../../skills/produce/references/slide-legibility.mjs';

const glyph=(y,h=81.5,char='가',x=176)=>({x,y,w:56.78,h,char,px:68});
test('six overlapping line boxes remain six rows (measured kinetic fixture)',()=>{
  const rows=groupTextRows(Array.from({length:6},(_,i)=>glyph(414.3359375+i*73.4375)));
  assert.equal(rows.length,6);
  for(let i=1;i<rows.length;i++) assert.ok(rows[i-1].y+rows[i-1].h<=rows[i].y);
});
test('three wrapped hero lines remain three rows',()=>{
  assert.equal(groupTextRows([430.78125,564.6953125,698.609375].map(y=>glyph(y,148.5))).length,3);
});
test('a larger baseline-aligned emphasis span shares one row',()=>{
  const rows=groupTextRows([glyph(600),glyph(571,110.5,'강',240),glyph(600,81.5,'끝',330),glyph(600,81.5,' ',400)]);
  assert.equal(rows.length,1);assert.equal(rows[0].chars,3);
});
test('contrast identifies black/white and flat negative controls',()=>{
  assert.equal(percentileContrast(Uint8Array.from({length:100},(_,i)=>i<50?0:255)),21);
  assert.equal(percentileContrast(new Uint8Array(100).fill(80)),1);
  assert.equal(percentileContrast(new Uint8Array()),null);
});

test('different-size adjacent lines stay separate despite partial overlap',()=>{
 assert.equal(groupTextRows([glyph(0,120),glyph(110,60)]).length,2);
});
test('the 50 percent row boundary rejects both zero and full-overlap mutants',()=>{
 const upper=[glyph(0,100),glyph(40,100)]; // 60% overlap: same measured row.
 const lower=Array.from({length:6},(_,i)=>glyph(i*73.4375));
 assert.equal(groupTextRows(upper).length,1);
 const mutant=t=>new Function('return ('+groupTextRows.toString().replace('*.5','*'+t)+')')();
 assert.notEqual(mutant(0)(lower).length,6);
 assert.notEqual(mutant(1)(upper).length,1);
 assert.equal(groupTextRows([glyph(0,100),glyph(49,100)]).length,1);
 assert.equal(groupTextRows([glyph(0,100),glyph(51,100)]).length,2);
 assert.equal(groupTextRows([glyph(0,100),glyph(50,100)]).length,1);
 assert.equal(groupTextRows([glyph(0,100),glyph(50.01,100)]).length,2);
});

function measureStrokes(wide, values) {
 class SVGElement {}
 const elements=values.map(([role,px,name='line'])=>Object.assign(new SVGElement(),{id:role||'fallback',localName:name,dataset:role?{strokeRole:role}:{},px,parentElement:null,getClientRects:()=>[{}]}));
 const stage={querySelectorAll:()=>elements};
 const context={SVGElement,window:{FORMAT:wide?'youtube-long-16x9':'shorts-9x16'},NodeFilter:{SHOW_TEXT:4},document:{getElementById:()=>stage,createTreeWalker:()=>({nextNode:()=>null})},getComputedStyle:el=>({display:'block',visibility:'visible',opacity:'1',stroke:'#000',strokeWidth:String(el.px)})};
 return vm.runInNewContext('('+measureSlideDOM.toString()+')(()=>[])',context).strokeSamples;
}
for(const wide of [false,true])for(const [role,floor] of [['rule',wide?4:6],['hair',wide?2:3]]){
 test(`${wide?'wide':'portrait'} ${role} accepts floor and rejects thinner stroke`,()=>{
  const rows=measureStrokes(wide,[[role,floor],[role,floor-1]]);
  assert.equal(rows[0].floor,floor);assert.equal(rows[0].px<rows[0].floor,false);
  assert.equal(rows[1].px<rows[1].floor,true);
 });
}
test('markers preserve glyph/focus strokes while unclassified lines retain structural protection',()=>{
 for(const wide of [false,true]){
  const rows=measureStrokes(wide,[['marker',1,'circle'],['marker',2],[undefined,1]]);
  assert.equal(rows[0].floor,null);assert.equal(rows[1].floor,null);
  assert.equal(rows[2].floor,wide?4:6);assert.ok(rows[2].px<rows[2].floor);
 }
});

// Only foot/description are emitted as data-type-role; label/title are value-contract locks.
// kicker/word/word2 floors are covered through their selectors below.
const floors={foot:[28,24],description:[44,32],label:[54,40],title:[76,56]};
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
