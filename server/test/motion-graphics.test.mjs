import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
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
test('trend points and fractional ticks use the same scale',()=>{
 const window={MOTION_GRAPHICS:registry,MOTION_FONTS:require('../../skills/storyboard/references/motion-fonts.js')};vm.runInNewContext(fs.readFileSync(new URL('../../skills/storyboard/references/motion-graphic-runtime.js',import.meta.url),'utf8'),{window});
 const s=sample();s.shot.motionGraphic.type='trend';s.shot.motionGraphic.content.values=[{label:'A',value:.2},{label:'B',value:.4}];const svg=window.MOTION_GRAPHIC_RUNTIME.render(s,1);
 assert.match(svg,/>0\.2<\/text>/);assert.match(svg,/>0\.4<\/text>/);assert.match(svg,/cx="1512" cy="295"/);
});
test('dense composition limits and correspondence errors are actionable',()=>{
 const s=sample();s.shot.motionGraphic.type='part_whole';s.shot.motionGraphic.content={title:'Parts',unit:'%',source:'test',total:100,values:Array.from({length:5},(_,i)=>({label:String(i),value:20}))};assert.match(registry.validateContent(s).join(),/at most 4/);
 s.shot.motionGraphic.type='input_output';s.shot.motionGraphic.content={title:'Convert',input:'A',output:'B',mappings:[null]};assert.match(registry.validateContent(s).join(),/correspondences/);
});

test('theme selection follows context, honors explicit overrides and retains old boards',()=>{
 const s=sample(),m=s.shot.motionGraphic;
 assert.equal(registry.resolveTheme(m),null);
 m.style.theme={id:'auto'};
 assert.equal(registry.resolveTheme(m).id,'report');
 m.style.theme.context='software';assert.equal(registry.resolveTheme(m).id,'product');
 m.style.theme={id:'learning',context:'software',reason:'Explain the procedure'};
 assert.equal(registry.resolveTheme(m).id,'learning');assert.equal(registry.resolveTheme(m).selectedBy,'explicit');
 m.style.theme={id:'auto'};m.type='kinetic_type';assert.equal(registry.resolveTheme(m).id,'campaign');
 m.type='process';assert.equal(registry.resolveTheme(m).id,'learning');
 m.style.theme={id:'no-such-theme'};assert.match(registry.inspect(s).errors.join(),/unknown motion theme/);
 m.style.theme={id:'auto',context:'unknown'};assert.match(registry.inspect(s).errors.join(),/context/);
});
test('storyboard patch persists theme provenance without mutating caller input and refreshes auto selection',async()=>{
 const {applyPatch}=await import('../dist/storyboard.js');
 const s=sample();s.shot.motionGraphic.style={theme:{id:'auto'}};
 const result=applyPatch({}, {path:'/unused',set:{shots:[s]},draft:true});
 assert.equal(result.win.SCENES[0].shot.motionGraphic.style.theme.resolved.id,'report');
 assert.equal(s.shot.motionGraphic.style.theme.resolved,undefined);
 const changed=structuredClone(result.win.SCENES[0]);changed.shot.motionGraphic.style.theme.context='software';
 const next=applyPatch(result.win,{path:'/unused',shots:[{no:1,shot:changed}],draft:true});
 assert.equal(next.win.SCENES[0].shot.motionGraphic.style.theme.resolved.id,'product');
 assert.equal(next.win.SCENES[0].shot.motionGraphic.style.theme.resolved.systemVersion,1);
});
test('theme affects geometry, typography and choreography; arbitrary seeks stay deterministic',()=>{
 const window={MOTION_GRAPHICS:registry,MOTION_FONTS:require('../../skills/storyboard/references/motion-fonts.js')};vm.runInNewContext(fs.readFileSync(new URL('../../skills/storyboard/references/motion-graphic-runtime.js',import.meta.url),'utf8'),{window});
 const render=window.MOTION_GRAPHIC_RUNTIME.render,s=sample();
 const outputs=[];
 for(const id of Object.keys(registry.THEMES)){
   s.shot.motionGraphic.style={theme:{id}};
   assert.deepEqual(registry.validateContent(s),[]);
   const a=render(s,.4);render(s,1);render(s,0);assert.equal(render(s,.4),a);
   assert.match(a,new RegExp(`data-theme="${id}"`));assert.doesNotMatch(a,/NaN|undefined/);
   assert.ok(render(s,1).includes('>80</text>'));outputs.push(a);
 }
 assert.equal(new Set(outputs).size,Object.keys(registry.THEMES).length);
});

test('bundled font coverage detects missing glyphs and records whole-text fallback',()=>{
 const fonts=require('../../skills/storyboard/references/motion-fonts.js');
 assert.equal(fonts.choose('아이디어를 움직이다','paperlogy').fallback,false);
 assert.equal(fonts.choose('한글 설명','spacegrotesk').id,'pretendard');
 assert.equal(fonts.choose('한글 설명','spacegrotesk').fallback,true);
 assert.throws(()=>fonts.choose('\u{10FFFF}','paperlogy'),/lack glyphs/);
 assert.equal(fonts.choose('한글','paperlogy').fallback,false);
 for(const [id,f] of Object.entries(fonts.DATA)){
   // Resolve relative to this test, independent of runner cwd.
   const absolute=new URL(id==='pretendard'?'../../skills/channel/references/review-assets/fonts/'+f.file:'../../skills/storyboard/references/motion-fonts/'+f.file,import.meta.url);
   assert.ok(fs.statSync(absolute).size>10000);
   assert.equal(createHash('sha256').update(fs.readFileSync(absolute)).digest('hex'),f.sha256);
 }
});
test('contextual font roles are stored with the selected theme',()=>{
 for(const [context,expected] of [['campaign','blackhansans'],['friendly','jua'],['storytelling','gowunbatang'],['research','paperlogy']]){
   const s=sample();s.shot.motionGraphic.style={theme:{id:'auto',context}};
   const result=registry.applyTheme(s).shot.motionGraphic.style.theme.resolved;
   assert.equal(result.typography.title,expected);assert.equal(result.typography.body,'pretendard');
 }
});
test('preparation records the actual numeric-unit fallback used by rendered labels',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'motion-fonts-'));
 try{
   const s=sample();s.shot.motionGraphic.style={theme:{id:'report'}};
   s.shot.motionGraphic.content.values=[10,20,30,40].map(value=>({value,label:'항목 '+value}));
   fs.writeFileSync(path.join(dir,'scenes.js'),'window.SCENES='+JSON.stringify([s])+';');
   const result=prepare(dir,1);
   assert.ok(result.fontFallbacks.some(f=>f.text==='20 건'&&f.requested==='spacegrotesk'));
   assert.ok(result.fontUsage.some(f=>f.role==='title'&&f.id==='paperlogy'));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('storyboard common theme persists, refreshes and yields to an explicit shot override',async()=>{
 const {applyPatch}=await import('../dist/storyboard.js');
 const s=sample();s.shot.motionGraphic.style={theme:{id:'auto'}};
 const a=applyPatch({}, {path:'/unused',globals:{THEME:{motionGraphicTheme:{id:'story'}}},set:{shots:[s]},draft:true});
 assert.equal(a.win.SCENES[0].shot.motionGraphic.style.theme.resolved.id,'story');
 assert.equal(a.win.SCENES[0].shot.motionGraphic.style.theme.resolved.selectedBy,'storyboard');
 const b=applyPatch(a.win,{path:'/unused',globals:{THEME:{motionGraphicTheme:{id:'product'}}},draft:true});
 assert.equal(b.win.SCENES[0].shot.motionGraphic.style.theme.resolved.id,'product');
 const c=structuredClone(b.win.SCENES[0]);c.shot.motionGraphic.style.theme={id:'report'};
 assert.equal(applyPatch(b.win,{path:'/unused',shots:[{no:1,shot:c}],draft:true}).win.SCENES[0].shot.motionGraphic.style.theme.resolved.id,'report');
 assert.throws(()=>applyPatch({}, {path:'/unused',globals:{THEME:{motionGraphicTheme:{id:'bad'}}},set:{shots:[s]},draft:true}),/unknown motion theme/);
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
test('legacy portrait processes preserve v0.116 artifact cards and handoff geometry',()=>{
 const runtime=require('../../skills/storyboard/references/motion-graphic-runtime.js');
 const scene={"shot":{"motionGraphic":{"type":"process","style":{"palette":"editorial"},"content":{"title":"Process","items":[{"label":"First","artifact":"Legacy metadata"},{"label":"Second"}]}}}};
 const expected=["01cbedf91f23bb8b3178c7d7a2465084a8c112d3b9f743185eaabce1b0556ed2","af682ca6d7eca934b3d3482d74d557928f94ead965f002112348732179518ab7","87d376575869f5efeff2af9d734a3ebe26af7c7e6851f21f567ed34ad3134fa5"];
 const normalize=s=>s.replace(/ data-theme="legacy"/,'').replace(/<g letter-spacing="0">([\s\S]*?)<\/g>/,'$1').replace(/ {2,}/g,' ');
 [.3,.4,.5].forEach((p,i)=>assert.equal(createHash('sha256').update(normalize(runtime.render(scene,p,{portrait:true}))).digest('hex'),expected[i]));
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
