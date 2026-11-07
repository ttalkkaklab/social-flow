import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const routing=require('../../skills/storyboard/references/render-routing.js');
const {checkMap}=routing;
const checkScene=(scene,options={})=>{const advice=[];return routing.checkScene(scene,{...options,advice}).concat(advice);};
const checkData=(data,segments,options={})=>{const advice=[];return routing.checkData(data,segments,{...options,advice}).concat(advice);};
const {render,sectorPath,mapGeometry,project}=require('../../skills/storyboard/references/chart-runtime.js');
const data=()=>({chart:'donut',unit:'%',baseline:0,total:100,title:'Composition',source:'Test fixture',values:[{label:'A',value:25},{label:'B',value:75}],beats:[{group:1,focus:['A'],insight:'A is one quarter.'},{group:2,focus:['B'],insight:'B is three quarters.'}]});
const scene=d=>({type:'points',duration:6,narration:d.beats.map(b=>({tts:b.insight})),shot:{infoType:'statistic',render:{mode:'data_graph',purpose:d.chart==='map'?'geographic':'share',reason:'Explain the source relationship.',data:d}}});
const feature=(id,coordinates)=>({type:'Feature',id,properties:{},geometry:{type:'Polygon',coordinates}});
const ring=[[0,0],[2,0],[2,2],[0,2],[0,0]];
const map=()=>({...data(),chart:'map',values:[{label:'A',regionId:'a',value:25},{label:'B',regionId:'b',value:null}],map:{mode:'choropleth',projection:'equal-area',measure:'rate',source:'Fixture geography',license:'Synthetic test data',geojson:{type:'FeatureCollection',features:[feature('a',[ring]),feature('b',[ring.map(([x,y])=>[x+2,y])])]}}});
test('donut and pie follow the shared share contract and reject false totals',()=>{
 for(const chart of ['donut','pie']){
  const d=data();d.chart=chart;assert.deepEqual(checkScene(scene(d),{draft:true}),[]);
  d.total=99;assert.match(checkScene(scene(d),{draft:true}).join(),/sum|total 100/);
  d.total=100;d.values[0].value=-25;assert.match(checkScene(scene(d),{draft:true}).join(),/sum/);
  d.values[0].value=25;d.baseline=10;assert.match(checkScene(scene(d),{draft:true}).join(),/baseline 0/);
 }
});
test('slice paths keep exact tiny, zero and whole-circle areas and escape labels',()=>{
 assert.equal(sectorPath(0,0,10,0,0,0),'');
 const quarter=sectorPath(0,0,10,0,0,Math.PI/2);assert.equal((quarter.match(/ A/g)||[]).length,2);assert.match(quarter,/L0,0 Z$/);
 const whole=sectorPath(0,0,10,6,0,Math.PI*2);assert.equal((whole.match(/ A/g)||[]).length,4);assert.doesNotMatch(whole,/NaN|Infinity/);
 const d=data();d.values=[{label:'A',value:.01},{label:'B',value:99.99}];assert.match(render(d),/data-share="0.0001"/);
 d.values[0].value=0;d.values[1].value=100;assert.match(render(d),/data-share="0" d=""/);
 d.values[0].label='<script>';d.beats[0].focus=['<script>'];assert.doesNotMatch(render(d),/<script>/);
});
test('maps accept missing measurements and enforce geometry, source and truthful joins',()=>{
 const d=map();assert.deepEqual(checkScene(scene(d),{draft:true}),[]);assert.match(render(d),/fill="url\(#map-missing\)"/);
 const edits=[
  [x=>delete x.map.source,/source/],
  [x=>delete x.map.license,/license/],
  [x=>x.map.measure='count',/normalized/],
  [x=>x.values[0].regionId='unknown',/regionId/],
  [x=>x.values[1].regionId='a',/unique regionId/],
  [x=>x.values[0].value=-1,/nonnegative/],
  [x=>x.values[0].value=101,/exceed 100/],
  [x=>x.values[0].value=null,/at least one/],
  [x=>x.map.geojson.features[0].geometry.coordinates[0][0]=[200,0],/WGS84/],
  [x=>x.map.geojson.features[0].geometry.coordinates[0].pop(),/close/],
  [x=>x.map.geojson.features[0].geometry.coordinates=[[[179,0],[-179,0],[-179,2],[179,2],[179,0]]],/antimeridian/],
  [x=>x.map.geojson.features[0].geometry.coordinates=[[[0,0],[1,0],[2,0],[0,0]]],/area/],
  [x=>x.map.geojson.crs={type:'name'},/WGS84/]
 ];
 for(const [edit,pattern] of edits){const x=structuredClone(d);edit(x);assert.match(checkScene(scene(x),{draft:true}).join(),pattern)}
 d.beats[0].focus=['A','B'];assert.match(checkData(d,2).join(),/one location/);
});
test('geometry preserves holes and islands, fits uniformly and validates malformed input without throwing',()=>{
 const geo=map().map.geojson;geo.features[0].geometry={type:'MultiPolygon',coordinates:[[ring,[[.5,.5],[.5,1],[1,1],[1,.5],[.5,.5]]],[ring.map(([x,y])=>[x+5,y])]]};
 const g=mapGeometry(geo,728,470);assert.equal((g.paths[0].path.match(/M/g)||[]).length,3);
 const a=g.locate([0,0]),b=g.locate([2,0]);assert.ok(b[0]>a[0]);assert.equal(b[1],a[1]);
 const projected=project([30,30]);assert.ok(Math.abs(projected[0]-Math.PI/6*Math.cos(Math.PI/6))<1e-12);
 for(const malformed of [null,{},[],[null],[feature('a',[null])]]){const d=map();d.map.geojson.features=malformed;assert.doesNotThrow(()=>checkMap(d));assert.ok(checkMap(d).length)}
});
test('symbols encode area rather than radius; geography and scale stay fixed',()=>{
 const d=map();d.map.mode='symbol';d.unit='items';d.values=[{label:'A',value:100,longitude:1,latitude:1},{label:'B',value:25,longitude:3,latitude:1}];
 assert.deepEqual(checkScene(scene(d),{draft:true}),[]);
 const svg=render(d);const symbols=[...svg.matchAll(/data-mark="symbol"[^>]* r="([^"]+)"/g)].map(m=>Number(m[1]));assert.deepEqual(symbols,[24,12]);assert.equal(symbols[0]**2/symbols[1]**2,4);
 d.values[0].longitude=200;assert.match(checkMap(d).join(),/longitude|extent/);
 d.values[0].longitude=20;assert.match(checkMap(d).join(),/extent/);
 d.values[0].longitude=1;d.values[0].value=0;d.values[1].value=null;assert.doesNotMatch(render(d),/data-mark="symbol"/);
});

test('tiny non-percent totals cannot accept zero area as a complete whole',()=>{
 const d=data();d.unit='kg';d.total=1e-10;d.values.forEach(v=>v.value=0);
 assert.match(checkScene(scene(d),{draft:true}).join(),/sum/);
 d.values[0].value=2.5e-11;d.values[1].value=7.5e-11;assert.deepEqual(checkScene(scene(d),{draft:true}),[]);
});

test('derived percentages and map keys do not inherit integer source precision',()=>{
 const d=data();d.unit='items';d.decimals=0;d.total=1000;d.values[0].value=1;d.values[1].value=999;
 assert.match(render(d),/>0\.1%<\/text>/);assert.match(render(d),/>99\.9%<\/text>/);
 assert.doesNotMatch(render(d),/>0%<\/text>|>100%<\/text>/);
 const m=map();m.unit='rate';m.decimals=0;m.values[0].value=.001;assert.match(render(m),/>0\.001<\/text>/);
});
const staged=()=>({chart:'stacked-bar',title:'Accounts',source:'Fixture',unit:'nyang',baseline:0,total:200,values:[{label:'Spent',value:70},{label:'Balance',value:130}],beats:[{group:1,focus:['Spent'],insight:'70 of 200 was spent.'}],reveal:{totalLabel:'Received',total:{startMs:0,endMs:1200},parts:[{label:'Spent',startMs:2600,endMs:4200},{label:'Balance',startMs:4400,endMs:4900}]}});
const draw=(d,t)=>render(d,{width:1000,height:440,wide:true,elapsedMs:t});
const parts=svg=>[...svg.matchAll(/data-mark="part" data-label="([^"]+)" x="([^"]+)" y="[^"]+" width="([^"]+)"/g)].map(m=>({label:m[1],x:+m[2],width:+m[3]}));
test('staged shares reveal total before parts and keep the exact 35/65 scale',()=>{
 const d=staged();assert.deepEqual(checkData(d,1),[]);
 assert.deepEqual(parts(draw(d,1500)).map(p=>p.width),[0,0]);
 const halfway=parts(draw(d,3400));assert.ok(halfway[0].width>0&&halfway[0].width<350);assert.equal(halfway[1].width,0);
 assert.deepEqual(parts(draw(d,5000)),[{label:'Spent',x:0,width:350},{label:'Balance',x:350,width:650}]);
 assert.doesNotMatch(draw(d,1500),/>70 nyang</);assert.match(draw(d,5000),/>70 nyang</);assert.match(draw(d,5000),/>130 nyang</);
});
test('random seeks produce the same state and never overshoot or change source figures',()=>{
 const d=staged(),expected=new Map();
 for(let t=0;t<=5540;t+=33) {const svg=draw(d,t);expected.set(t,svg);const p=parts(svg);assert.ok(p[0].width>=0&&p[0].width<=350);assert.ok(p[1].width>=0&&p[1].width<=650);assert.doesNotMatch(svg,/NaN|Infinity/);}
 for(const t of [...expected.keys()].reverse())assert.equal(draw(d,t),expected.get(t));
 assert.equal(draw(d,5000),draw(d,5500));
});
test('invalid and overlapping reveal windows are rejected',()=>{
 for(const edit of [d=>d.reveal.parts[0].endMs=0,d=>d.reveal.parts[1].startMs=2700,d=>d.reveal.parts[1].label='unknown',d=>d.reveal.total.endMs=NaN,d=>d.chart='bar']){
  const d=staged();edit(d);assert.ok(checkData(d,1).length);
 }
});
test('measured segment timing replaces estimates before reveal validation',async()=>{
 const {readFileSync}=await import('node:fs');const vm=await import('node:vm');
 const d=staged();d.reveal.parts[1].endMs=6000;d.beats.push({group:2,focus:['Balance'],insight:'Balance'});
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
