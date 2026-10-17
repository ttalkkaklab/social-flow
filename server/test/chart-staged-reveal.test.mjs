import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {render}=require('../../skills/storyboard/references/chart-runtime.js');
const {checkData}=require('../../skills/storyboard/references/render-routing.js');
const fixture=()=>({chart:'stacked-bar',title:'Accounts',source:'Fixture',unit:'nyang',baseline:0,total:200,values:[{label:'Spent',value:70},{label:'Balance',value:130}],beats:[{group:1,focus:['Spent'],insight:'70 of 200 was spent.'}],reveal:{totalLabel:'Received',total:{startMs:0,endMs:1200},parts:[{label:'Spent',startMs:2600,endMs:4200},{label:'Balance',startMs:4400,endMs:4900}]}});
const draw=(d,t)=>render(d,{width:1000,height:440,wide:true,elapsedMs:t});
const parts=svg=>[...svg.matchAll(/data-mark="part" data-label="([^"]+)" x="([^"]+)" y="[^"]+" width="([^"]+)"/g)].map(m=>({label:m[1],x:+m[2],width:+m[3]}));
test('staged shares reveal total before parts and keep the exact 35/65 scale',()=>{
 const d=fixture();assert.deepEqual(checkData(d,1),[]);
 assert.deepEqual(parts(draw(d,1500)).map(p=>p.width),[0,0]);
 const halfway=parts(draw(d,3400));assert.ok(halfway[0].width>0&&halfway[0].width<350);assert.equal(halfway[1].width,0);
 assert.deepEqual(parts(draw(d,5000)),[{label:'Spent',x:0,width:350},{label:'Balance',x:350,width:650}]);
 assert.doesNotMatch(draw(d,1500),/>70 nyang</);assert.match(draw(d,5000),/>70 nyang</);assert.match(draw(d,5000),/>130 nyang</);
});
test('random seeks produce the same state and never overshoot or change source figures',()=>{
 const d=fixture(),expected=new Map();
 for(let t=0;t<=5540;t+=33) {const svg=draw(d,t);expected.set(t,svg);const p=parts(svg);assert.ok(p[0].width>=0&&p[0].width<=350);assert.ok(p[1].width>=0&&p[1].width<=650);assert.doesNotMatch(svg,/NaN|Infinity/);}
 for(const t of [...expected.keys()].reverse())assert.equal(draw(d,t),expected.get(t));
 assert.equal(draw(d,5000),draw(d,5500));
});
test('invalid and overlapping reveal windows are rejected',()=>{
 for(const edit of [d=>d.reveal.parts[0].endMs=0,d=>d.reveal.parts[1].startMs=2700,d=>d.reveal.parts[1].label='unknown',d=>d.reveal.total.endMs=NaN,d=>d.chart='bar']){
  const d=fixture();edit(d);assert.ok(checkData(d,1).length);
 }
});
test('liquid-glass preserves exact source widths and changes no unrelated chart',()=>{
 const d=fixture();d.material='liquid-glass';assert.deepEqual(checkData(d,1),[]);
 const final=draw(d,5000);assert.match(final,/glass-specular/);
 assert.deepEqual(parts(final),[{label:'Spent',x:0,width:350},{label:'Balance',x:350,width:650}]);
 assert.doesNotMatch(draw(d,1500),/>70 nyang</);
 const ordinary=fixture();assert.doesNotMatch(draw(ordinary,5000),/glass-specular/);
 for(let t=0;t<5540;t+=33){const p=parts(draw(d,t));assert.ok(p[0].width<=350&&p[1].width<=650);assert.equal(draw(d,t),draw(d,t));}
 const unsupported=fixture();unsupported.material='unknown';assert.match(checkData(unsupported,1).join(),/material/);
 unsupported.material='liquid-glass';delete unsupported.reveal;assert.match(checkData(unsupported,1).join(),/staged/);
});
test('measured segment timing replaces estimates before reveal validation',async()=>{
 const {readFileSync}=await import('node:fs');const vm=await import('node:vm');
 const d=fixture();d.reveal.parts[1].endMs=6000;d.beats.push({group:2,focus:['Balance'],insight:'Balance'});
 const element=()=>({style:{setProperty(){}},classList:{toggle(){}},dataset:{},appendChild(){},parentElement:{appendChild(){}}});
 const elements=new Map(),get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id)};
 const w={FORMAT:'youtube-long-16x9',SCENES:[{duration:10,narration:[{},{}],shot:{render:{data:d}}}]};
 const html=readFileSync(new URL('../../skills/storyboard/references/chart-slide-template.html',import.meta.url),'utf8');
 const script=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
 vm.runInNewContext(script,{window:w,document:{documentElement:element(),body:element(),getElementById:get,createElement:element,fonts:{ready:Promise.resolve()},getAnimations:()=>[]},CHART_RUNTIME:{colors:()=>({}),render:()=>''},RENDER_ROUTING:{checkScene:()=>[]},URLSearchParams,location:{search:''},getComputedStyle:()=>({getPropertyValue:k=>k==='--grow'?'1000':'400'})});
 await w.__ready();
 assert.throws(()=>w.__validateTiming(),/exceeds/);
 w.__setSegs({1:7000,2:3000});assert.doesNotThrow(()=>w.__validateTiming());
 assert.throws(()=>w.__setSegs({1:5000,2:5000}),/exceeds/);
});

test('later staged groups transfer focus while preserving exact shares on random seeks',()=>{
 for(const material of [undefined,'liquid-glass']){
  const d=fixture();d.material=material;d.beats.push({group:2,focus:['Balance'],insight:'Balance'});
  assert.deepEqual(checkData(d,2),[]);
  const frame=t=>render(d,{width:1000,height:440,wide:true,group:2,elapsedMs:t});
  const start=frame(0),middle=frame(200),end=frame(400);
  assert.notEqual(start,middle);assert.notEqual(middle,end);
  for(const svg of [start,middle,end])assert.deepEqual(parts(svg),[{label:'Spent',x:0,width:350},{label:'Balance',x:350,width:650}]);
  const focus=svg=>[...svg.matchAll(/data-mark="focus"[^>]*opacity="([^"]+)"/g)].map(m=>+m[1]);
  assert.deepEqual(focus(start),[.18,0]);assert.deepEqual(focus(end),[0,.18]);
  assert.equal(frame(200),middle);assert.equal(frame(0),start);
 }
});
