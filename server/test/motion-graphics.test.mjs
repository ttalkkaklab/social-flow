import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
const registry=require('../../skills/storyboard/references/motion-graphics.js');
const {prepare}=require('../../skills/produce/references/prepare-motion-graphic.js');
const sample=()=>({type:'points',duration:6,narration:[{tts:'Compare quantities'}],shot:{infoType:'statistic',render:{mode:'motion_html',purpose:'comparison',reason:'A common baseline makes the magnitude difference visible'},motionGraphic:{version:1,type:'comparison',intent:'Compare quantities',reason:'Same unit, unlike a flow diagram',evidence:'data',style:{palette:'editorial',reason:'Clear data'},content:{title:'비교',unit:'건',source:'Test data',values:[{label:'A',value:20},{label:'B',value:80}]}}},visual:{slide:{kind:'diagram',motion:true,treatment:'editorial',file:'slides/s1-test.html',renderer:'motion-svg-v1'}}});
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
 const window={MOTION_GRAPHICS:registry,MOTION_FONTS:require('../../skills/storyboard/references/motion-fonts.js')};vm.runInNewContext(fs.readFileSync(new URL('../../skills/storyboard/references/motion-graphic-runtime.js',import.meta.url),'utf8'),{window});
 const s=sample(),render=window.MOTION_GRAPHIC_RUNTIME.render;
 const middle=render(s,.4);render(s,1);render(s,0);assert.equal(render(s,.4),middle);assert.notEqual(render(s,0),render(s,1));
 s.shot.motionGraphic.content.title='<script>alert(1)</script>';const final=render(s,1);assert.ok(final.includes('&lt;script&gt;'));assert.ok(final.includes('>80 건</text>'));
});
test('malformed entries produce findings and mocked footage never claims recording evidence',()=>{
 const s=sample();s.shot.motionGraphic.content.values=[null,null];assert.match(registry.validateContent(s).join(),/values/);
 s.shot.motionGraphic.type='relationship';s.shot.motionGraphic.content={title:'Links',items:[null,null],edges:[[0,1]]};assert.match(registry.validateContent(s).join(),/items/);
 s.shot.motionGraphic.type='ui_demo';s.shot.motionGraphic.evidence='recording';s.visual.src='missing.mp4';s.shot.motionGraphic.content={title:'UI',input:'a',output:'b',action:'go'};assert.match(registry.validateContent(s).join(),/cannot claim recording/);
});
test('dense composition limits and correspondence errors are actionable',()=>{
 const s=sample();s.shot.motionGraphic.type='part_whole';s.shot.motionGraphic.content={title:'Parts',unit:'%',source:'test',total:100,values:Array.from({length:5},(_,i)=>({label:String(i),value:20}))};assert.match(registry.validateContent(s).join(),/at most 4/);
 s.shot.motionGraphic.type='input_output';s.shot.motionGraphic.content={title:'Convert',input:'A',output:'B',mappings:[null]};assert.match(registry.validateContent(s).join(),/correspondences/);
});
test('raw board defaults prepare without shot normalization and await inherited fonts before rendering',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'motion-inherited-'));
 try{
   const s=sample();s.shot.motionGraphic.style={};
   const boardTheme={id:'story'};
   assert.deepEqual(registry.validateContent(s,boardTheme),[]);
   const source='window.THEME='+JSON.stringify({motionGraphicTheme:boardTheme})+';window.SCENES='+JSON.stringify([s])+';';
   fs.writeFileSync(path.join(dir,'scenes.js'),source);
   const result=prepare(dir,1);
   assert.equal(result.theme.id,'story');
   assert.ok(result.fontUsage.some(f=>f.role==='title'&&f.id==='gowunbatang'));
   assert.equal(fs.readFileSync(path.join(dir,'scenes.js'),'utf8'),source);

   let finishFonts,loads=0;
   const fontReady=new Promise(resolve=>{finishFonts=resolve;});
   const renders=[],element=()=>({style:{},dataset:{},append(){}}),stage=element();
   const document={body:element(),head:element(),createElement:element,getElementById:()=>stage,
     fonts:{load:async()=>[],ready:Promise.resolve()}};
   const window={SCENES:[s],THEME:{motionGraphicTheme:boardTheme},FORMAT:'youtube-long-16x9'};
   const template=fs.readFileSync(path.join(dir,'slides/s1-test.html'),'utf8');
   const inline=template.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
   vm.runInNewContext(inline,{window,document,MOTION_GRAPHICS:registry,
     MOTION_FONTS:{css:()=>'',load:()=>{loads++;return fontReady;}},
     MOTION_GRAPHIC_RUNTIME:{render:(scene,p,options)=>{renders.push(options);return '';}}});
   assert.equal(loads,1);
   assert.equal(renders.length,0,'capture must not start while inherited fonts are loading');
   finishFonts();await window.__ready();
   assert.equal(renders.length,1);
   assert.equal(renders[0].boardTheme.id,'story');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('kinetic emphasis must identify exact source text and remains seek deterministic',()=>{
 const s=sample();s.shot.motionGraphic.type='kinetic_type';s.shot.motionGraphic.style={theme:{id:'playful'}};
 s.shot.motionGraphic.content={title:'시작',lines:['먼저 하나 해 봐요'],emphasis:['하나']};
 assert.deepEqual(registry.validateContent(s),[]);
 const runtime=require('../../skills/storyboard/references/motion-graphic-runtime.js');
 const final=runtime.render(s,1,{portrait:true});runtime.render(s,.4,{portrait:true});assert.equal(runtime.render(s,1,{portrait:true}),final);
 assert.match(final,/하나/);assert.match(final,/먼저 /);assert.match(final,/ 해 봐요/);
 s.shot.motionGraphic.content.emphasis=['없는 단어'];assert.match(registry.validateContent(s).join(),/exact substring/);
});
test('field reordering uses shared source text, rejects fabricated fields, and resolves exact output',()=>{
 const s=sample();s.shot.motionGraphic.type='input_output';s.shot.motionGraphic.style={theme:{id:'product'}};
 s.shot.motionGraphic.content={title:'메모 정리',input:'금요일 초안, 지수',output:'지수 → 금요일 초안',mappings:[{from:'금요일 초안, 지수',to:'지수 → 금요일 초안',fields:['금요일 초안','지수']}]};
 assert.deepEqual(registry.validateContent(s),[]);
 const runtime=require('../../skills/storyboard/references/motion-graphic-runtime.js');
 for(const p of [.3,.5,.7,1])assert.doesNotMatch(runtime.render(s,p,{portrait:true}),/NaN|undefined/);
 assert.match(runtime.render(s,1,{portrait:true}),/지수 → 금요일 초안/);
 s.shot.motionGraphic.content.mappings[0].fields=['없는 값'];assert.match(registry.validateContent(s).join(),/exact substrings/);
});
