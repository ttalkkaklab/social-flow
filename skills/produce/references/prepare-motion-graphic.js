#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {evaluateWindowScript}=require('../../_shared/scenes-vm.js');
const refs=path.resolve(__dirname,'../../storyboard/references');
const catalog=require(path.join(refs,'motion-graphics.js'));
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function safe(file,dir=false){try{const s=fs.lstatSync(file);if(s.isSymbolicLink()||!(dir?s.isDirectory():s.isFile()))throw Error('incompatible output: '+file);}catch(e){if(e.code!=='ENOENT')throw e;}}
function prepare(board,shot){
 if(!Number.isSafeInteger(shot)||shot<1)throw Error('shot must be a positive integer');
 const root=fs.realpathSync(board),source=path.join(root,'scenes.js'),bytes=fs.readFileSync(source),win=evaluateWindowScript(bytes.toString(),{filename:source}),scene=win.SCENES?.[shot-1];
 if(!scene)throw Error('shot not found');
 if(scene.visual?.slide?.renderer!=='motion-svg-v1')throw Error('built-in preparation needs visual.slide.renderer motion-svg-v1');
 const errors=catalog.validateContent(scene);if(errors.length)throw Error(errors.join('; '));
 if(scene.shot.render?.mode!=='motion_html')throw Error('built-in motion scenes require render.mode motion_html; use existing chart/mesh preparation for other routes');
 const registered=scene.visual?.slide?.file;if(!new RegExp('^slides/s'+shot+'-[a-z0-9-]+\\.html$').test(registered||''))throw Error('register a direct slides/*.html file');
 const slides=path.join(root,'slides'),assets=path.join(slides,'assets');safe(slides,true);safe(assets,true);
 const template=fs.readFileSync(path.join(refs,'motion-graphic-template.html'),'utf8');
 const files=[[registered,Buffer.from(template.replace('const SLIDE_SHOT = 1;',`const SLIDE_SHOT = ${shot};`))]];
 for(const name of ['motion-graphics.js','motion-graphic-runtime.js'])files.push(['slides/assets/'+name,fs.readFileSync(path.join(refs,name))]);
 const fonts=path.resolve(__dirname,'../../channel', 'references', 'review-assets', 'fonts');
 for(const name of ['InterVariable.woff2','PretendardVariable.woff2','Inter-OFL.txt','Pretendard-OFL.txt'])files.push(['slides/assets/'+name,fs.readFileSync(path.join(fonts,name))]);
 for(const [name] of files)safe(path.join(root,name));
 fs.mkdirSync(assets,{recursive:true});for(const [name,data] of files)fs.writeFileSync(path.join(root,name),data);
 const proof={shot,type:scene.shot.motionGraphic.type,boardSha256:hash(bytes),pluginRoot:path.resolve(__dirname,'../../..'),files:Object.fromEntries(files.map(([name,data])=>[name,hash(data)])),review:'not_reviewed'};
 const work=path.join(root,'.work');safe(work,true);fs.mkdirSync(work,{recursive:true});const proofPath=path.join(work,`motion-shot-${shot}.json`);safe(proofPath);fs.writeFileSync(proofPath,JSON.stringify(proof,null,2));
 return {...proof,file:path.join(root,registered),renderArgs:['node',path.join(__dirname,'render-motion-slide.mjs'),path.join(root,registered),'--out',path.join(work,`motion-shot-${shot}`),'--grain','0','--sheet']};
}
module.exports={prepare};
if(require.main===module){try{const [board,flag,n,...extra]=process.argv.slice(2);if(board==='--catalog'){console.log(JSON.stringify(catalog.TYPES,null,2));}else{if(flag!=='--shot'||!/^\d+$/.test(n)||extra.length)throw Error('usage: prepare-motion-graphic.js BOARD --shot N | --catalog');console.log(JSON.stringify(prepare(board,Number(n)),null,2));}}catch(e){console.error(e.message);process.exitCode=1;}}
