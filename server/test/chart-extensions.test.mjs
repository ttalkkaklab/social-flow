import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {checkScene,checkData,checkMap}=require('../../skills/storyboard/references/render-routing.js');
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
test('new charts animate deterministically and preserve geometry across spoken groups',()=>{
 for(const chart of ['donut','pie','map']){
  const d=chart==='map'?map():{...data(),chart};
  assert.equal(render(d,{progress:.3}),render(d,{progress:.3}));assert.notEqual(render(d,{progress:.2}),render(d,{progress:1}));
  for(const width of [728,1158])assert.doesNotMatch(render(d,{width,height:650}),/NaN|Infinity|undefined/);
  const paths=svg=>[...svg.matchAll(/ d="([^"]*)"/g)].map(m=>m[1]);
  assert.deepEqual(paths(render(d,{group:1,progress:1})),paths(render(d,{group:2,progress:0})));
 }
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
test('slice fills have no separator stroke that hides a small positive area',()=>{
 const d=data();d.values[0].value=.1;d.values[1].value=99.9;
 const marks=[...render(d).matchAll(/<path data-mark="slice"[^>]*>/g)].map(m=>m[0]);
 assert.equal(marks.length,2);marks.forEach(mark=>assert.doesNotMatch(mark,/stroke=/));
});
test('zero and missing map points have an animated focus indicator',()=>{
 const d=map();d.unit='items';d.map.mode='symbol';d.values=[{label:'A',value:0,longitude:1,latitude:1},{label:'B',value:null,longitude:3,latitude:1},{label:'C',value:100,longitude:2,latitude:1}];
 const a=render(d,{group:1,progress:1}),b=render(d,{group:2,progress:1});
 assert.match(a,/data-focus="A"[^>]*opacity="1"/);assert.match(b,/data-focus="B"[^>]*opacity="1"/);
 assert.match(b,/data-focus="A"[^>]*opacity="0"/);
});
test('circular legend wraps to the available phone width and rejects excessive rows',()=>{
 const d=data();d.values[0].label='가'.repeat(24);d.beats[0].focus=[d.values[0].label];
 assert.deepEqual(checkData(d,2),[]);const labels=[...render(d).matchAll(/>(가+)<\/text>/g)].map(m=>m[1]);assert.deepEqual(labels.map(x=>x.length),[11,11,2]);
 d.values=Array.from({length:6},(_,i)=>({label:'가'.repeat(11)+i,value:100/6}));assert.match(checkData(d,2).join(),/phone-height/);
});
