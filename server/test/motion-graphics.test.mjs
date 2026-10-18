import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
const registry=require('../../skills/storyboard/references/motion-graphics.js');
const routing=require('../../skills/storyboard/references/render-routing.js');
const {prepare}=require('../../skills/produce/references/prepare-motion-graphic.js');
const sample=()=>({type:'points',duration:6,narration:[{tts:'Compare quantities'}],shot:{infoType:'statistic',render:{mode:'motion_html',purpose:'comparison',reason:'A common baseline makes the magnitude difference visible'},motionGraphic:{version:1,type:'comparison',intent:'Compare quantities',reason:'Same unit, unlike a flow diagram',evidence:'data',style:{palette:'editorial',reason:'Clear data'},content:{title:'비교',unit:'건',source:'Test data',values:[{label:'A',value:20},{label:'B',value:80}]}}},visual:{slide:{kind:'diagram',motion:true,treatment:'editorial',file:'slides/s1-test.html',renderer:'motion-svg-v1'}}});
test('motion family stays independent of production route and legacy plans',()=>{
 assert.ok(Object.keys(registry.TYPES).length>=20);
 assert.deepEqual(registry.inspect({}).errors,[]);
 assert.deepEqual(routing.checkScene(sample()),[]);
 const s=sample();s.shot.motionGraphic.type='glass';assert.match(registry.inspect(s).errors.join(),/unknown/);
});
test('reject invalid quantities, missing provenance, unsupported recipe and bad edges',()=>{
 const s=sample();s.shot.motionGraphic.type='part_whole';s.shot.motionGraphic.content.total=90;assert.match(registry.validateContent(s).join(),/sum/);
 s.shot.motionGraphic.type='comparison';s.shot.motionGraphic.content.values[0].value=NaN;assert.match(registry.validateContent(s).join(),/finite/);
 s.shot.motionGraphic.type='product_hero';assert.match(registry.validateContent(s).join(),/authored/);
 s.shot.motionGraphic.type='relationship';s.shot.motionGraphic.content={title:'Links',items:[{label:'A'},{label:'B'}],edges:[[0,4]]};assert.match(registry.validateContent(s).join(),/edges/);
});
test('preparer copies installed runtime and real fonts without changing board; rejects symlinks',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'motion-plan-'));
 try{
 const source='window.FORMAT="youtube-long-16x9";window.SCENES='+JSON.stringify([sample()])+';';fs.writeFileSync(path.join(dir,'scenes.js'),source);
 const result=prepare(dir,1);assert.equal(result.type,'comparison');assert.equal(fs.readFileSync(path.join(dir,'scenes.js'),'utf8'),source);
 assert.ok(fs.statSync(path.join(dir,'slides/assets/PretendardVariable.woff2')).size>1000000);
 const target=path.join(dir,'slides/s1-test.html');fs.unlinkSync(target);fs.symlinkSync(path.join(dir,'scenes.js'),target);assert.throws(()=>prepare(dir,1),/incompatible/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('runtime is seek-order independent, escapes content and retains exact final data',()=>{
 const window={MOTION_GRAPHICS:registry};vm.runInNewContext(fs.readFileSync(new URL('../../skills/storyboard/references/motion-graphic-runtime.js',import.meta.url),'utf8'),{window});
 const s=sample(),render=window.MOTION_GRAPHIC_RUNTIME.render;
 const middle=render(s,.4);render(s,1);render(s,0);assert.equal(render(s,.4),middle);assert.notEqual(render(s,0),render(s,1));
 s.shot.motionGraphic.content.title='<script>alert(1)</script>';const final=render(s,1);assert.ok(final.includes('&lt;script&gt;'));assert.ok(final.includes('>80 건</text>'));
});
test('malformed entries produce findings and mocked footage never claims recording evidence',()=>{
 const s=sample();s.shot.motionGraphic.content.values=[null,null];assert.match(registry.validateContent(s).join(),/values/);
 s.shot.motionGraphic.type='relationship';s.shot.motionGraphic.content={title:'Links',items:[null,null],edges:[[0,1]]};assert.match(registry.validateContent(s).join(),/items/);
 s.shot.motionGraphic.type='ui_demo';s.shot.motionGraphic.evidence='recording';s.visual.src='missing.mp4';s.shot.motionGraphic.content={title:'UI',input:'a',output:'b',action:'go'};assert.match(registry.validateContent(s).join(),/cannot claim recording/);
});
test('trend points and fractional ticks use the same scale',()=>{
 const window={MOTION_GRAPHICS:registry};vm.runInNewContext(fs.readFileSync(new URL('../../skills/storyboard/references/motion-graphic-runtime.js',import.meta.url),'utf8'),{window});
 const s=sample();s.shot.motionGraphic.type='trend';s.shot.motionGraphic.content.values=[{label:'A',value:.2},{label:'B',value:.4}];const svg=window.MOTION_GRAPHIC_RUNTIME.render(s,1);
 assert.match(svg,/>0\.2<\/text>/);assert.match(svg,/>0\.4<\/text>/);assert.match(svg,/cx="1512" cy="295"/);
});
test('dense composition limits and correspondence errors are actionable',()=>{
 const s=sample();s.shot.motionGraphic.type='part_whole';s.shot.motionGraphic.content={title:'Parts',unit:'%',source:'test',total:100,values:Array.from({length:5},(_,i)=>({label:String(i),value:20}))};assert.match(registry.validateContent(s).join(),/at most 4/);
 s.shot.motionGraphic.type='input_output';s.shot.motionGraphic.content={title:'Convert',input:'A',output:'B',mappings:[null]};assert.match(registry.validateContent(s).join(),/correspondences/);
});
