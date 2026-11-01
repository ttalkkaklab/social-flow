import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { prepareVideoImages } from '../dist/video-image-inputs.js';
import { parseVideoArgs } from '../dist/video-registry.js';
import { createRequire } from 'node:module';
import { png } from './workflow-fixture.mjs';
function fixture(t) {
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'image-inputs-')));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.mkdirSync(path.join(root,'storyboard'));
 for(const name of ['start','end','hero','room','mid'])fs.writeFileSync(path.join(root,'storyboard',name+'.png'),png);
 return root;
}
const ref=(id='hero',use='video',role='character')=>({id,path:id+'.png',role,use,purpose:'Preserve '+id+' appearance'});
const shot=(mode='first_last',references=[])=>({visual:{frames:{mode,...(mode==='reference'?{}:{start:'start.png'}),...(mode==='first_last'?{end:'end.png'}:{})},references}});
test('frame mappings use board-relative files, decoded metadata and explicit use:image references',t=>{
 const root=fixture(t),s=shot('first_last',[ref('hero','image')]);
 for(const [tool,start,end] of [['seedance_img2video','sourceImagePath','lastImagePath'],['astra_img2video','firstFramePath','lastFramePath'],['astra_genai_audio2video','imagePath','lastFramePath'],['mlx_video_generate','firstFrameImagePath','lastFrameImagePath']]) {
  const p=prepareVideoImages(tool,{prompt:'Move'},s,root);
  assert.equal(p.args[start],path.join(root,'storyboard/start.png'));assert.equal(p.args[end],path.join(root,'storyboard/end.png'));
  assert.equal(p.imageBindings.length,3);assert.equal(p.imageBindings[2].submitted,false);
  assert.equal(p.imageBindings[0].width,1);assert.match(p.imageBindings[0].sha256,/^[a-f0-9]{64}$/);
 }
 const genai=prepareVideoImages('astra_genai_img2video',{prompt:'Move',model:'ltx-2.5-22b-dev',resolution:'720p',duration:5,reserveUsd:0},s,root);
 assert.match(genai.args.imageUri,/^data:image\/png;base64,/);assert.match(genai.args.lastFrameUri,/^data:image\/png;base64,/);
 assert.doesNotThrow(()=>parseVideoArgs('astra_genai_img2video',genai.args));
});
test('reference-only inputs keep order and roles; installed adapters enforce their actual limits',t=>{
 const root=fixture(t),s=shot('reference',[ref(),ref('room','both','background')]);
 const p=prepareVideoImages('seedance_reference',{prompt:'Walk',model:'dreamina-seedance-2-0-260128'},s,root);
 assert.deepEqual(p.args.referenceImagePaths,['hero','room'].map(n=>path.join(root,'storyboard',n+'.png')));
 assert.match(p.args.prompt,/Image 2 \(room, background\)/);assert.equal(p.args.lastImagePath,undefined);
 assert.doesNotThrow(()=>parseVideoArgs('seedance_reference',p.args));
 // MSR's background slot carries the start image; the plain background only conditioned that image.
 s.visual.frames.start='start.png';
 const msr=prepareVideoImages('astra_genai_msr',{prompt:'Walk',width:768,height:1280,duration:5,reserveUsd:0},s,root);
 msr.args.references[0].audioUri='https://example.com/voice.wav';
 assert.deepEqual(msr.args.references.map(r=>[path.basename(r.imagePath),!!r.background]),[['hero.png',false],['start.png',true]]);
 assert.doesNotThrow(()=>parseVideoArgs('astra_genai_msr',msr.args));
 s.visual.references=Array.from({length:10},(_,i)=>({...ref(),id:'hero'+i}));
 const tooMany=prepareVideoImages('seedance_reference',{prompt:'Walk',model:'dreamina-seedance-2-0-260128'},s,root);
 assert.throws(()=>parseVideoArgs('seedance_reference',tooMany.args),/at most 9/);
});
test('MSR names the character-sheet panels of one character as one subject',t=>{
 const root=fixture(t),sheet=path.join(root,'assets/characters/kardum');fs.mkdirSync(sheet,{recursive:true});
 for(const name of ['face','body','back'])fs.writeFileSync(path.join(sheet,name+'.png'),png);
 fs.writeFileSync(path.join(sheet,'panels.json'),JSON.stringify({panels:{front:{file:'body.png'},back:{file:'back.png'},face:{file:'face.png'}}}));
 const panel=(id,file)=>({id,path:'../assets/characters/kardum/'+file,role:'character',use:'video',purpose:'Kardum '+id});
 const s=shot('reference',[panel('face','face.png'),ref(),panel('front','body.png'),panel('back','back.png'),ref('room','video','background')]);
 s.visual.frames.start='start.png';
 const msr=prepareVideoImages('astra_genai_msr',{prompt:'Walk',width:768,height:1280,duration:5,reserveUsd:0},s,root);
 assert.match(msr.args.prompt,/^Image 1: character, Kardum face\nImage 2: character, Preserve hero appearance\n/);
 assert.match(msr.args.prompt,/\nImage 5: the opening picture, the characters, place and props as the shot begins\nImage 1 \(face\), Image 3 \(headless front body\), Image 4 \(headless back body\) show one character, kardum.*\n\nWalk$/);
 assert.doesNotMatch(prepareVideoImages('seedance_reference',{prompt:'Walk',model:'dreamina-seedance-2-0-260128'},s,root).args.prompt,/show one character/);
 s.visual.references.splice(2,0,{...ref('mid','video','character'),id:'ally'},{...ref('end','video','character'),id:'rival'});
 assert.throws(()=>prepareVideoImages('astra_genai_msr',{prompt:'Walk',width:768,height:1280,duration:5,reserveUsd:0},s,root),/msr_character_limit: references show 4 characters/);
});
test('missing, corrupt, conflicting, extra and unsupported image constraints fail without dispatch',t=>{
 const root=fixture(t);
 assert.throws(()=>prepareVideoImages('seedance_reference',{prompt:'x'},shot('first_last',[ref()]),root),/cannot combine/);
 assert.throws(()=>prepareVideoImages('astra_audio2video',{},shot(),root),/cannot carry/);
 assert.throws(()=>prepareVideoImages('seedance_img2video',{},shot('reference',[ref()]),root),/needs a reference adapter/);
 assert.throws(()=>prepareVideoImages('seedance_text2video',{},shot('first'),root),/cannot carry/);
 assert.throws(()=>prepareVideoImages('seedance_img2video',{sourceImagePath:'storyboard/hero.png'},shot(),root),/mismatch/);
 assert.throws(()=>prepareVideoImages('seedance_img2video',{lastImagePath:'storyboard/end.png'},shot('first'),root),/unplanned/);
 const missing=shot('reference',[{...ref(),path:'absent.png'}]);assert.throws(()=>prepareVideoImages('seedance_reference',{},missing,root),/ENOENT/);
 fs.writeFileSync(path.join(root,'storyboard/hero.png'),'corrupt');assert.throws(()=>prepareVideoImages('seedance_reference',{},shot('reference',[ref()]),root),/image_invalid/);
});
test('timed intermediate frames bind exact indices; duplicates and unsupported adapters are refused',t=>{
 const root=fixture(t),s=shot();s.visual.frames.keyframes=[{image:'mid.png',atSeconds:1,state:'Contact established',strength:.8}];
 const p=prepareVideoImages('astra_keyframe_video',{prompt:'Move',numFrames:121,frameRate:24},s,root);
 assert.deepEqual(p.args.images.map(i=>i.frameIdx),[0,24,120]);assert.doesNotThrow(()=>parseVideoArgs('astra_keyframe_video',p.args));
 assert.throws(()=>prepareVideoImages('astra_img2video',{},s,root),/intermediate/);
 s.visual.frames.keyframes[0].atSeconds=5;assert.throws(()=>prepareVideoImages('astra_keyframe_video',{numFrames:121},s,root),/inside/);
});
test('host plans expose a hashed inventory without claiming provider submission; old raw calls stay unchanged',t=>{
 const root=fixture(t),p=prepareVideoImages('host_external',{prompt:'Move'},shot('first_last',[ref()]),root);
 assert.equal(p.imageBindings.length,3);assert.ok(p.imageBindings.every(i=>!i.submitted));assert.match(p.imageHandoff,/unverified/);
 // The set render the start image was composed from is not a video input.
 assert.equal(prepareVideoImages('host_external',{prompt:'Move'},shot('first_last',[ref(),ref('room','image','composition')]),root).imageBindings.length,3);
 const legacy={visual:{bg:'old.png',frames:{mode:'first'},video:{referenceImagePaths:['old.png']}}};
 assert.deepEqual(prepareVideoImages('seedance_reference',{referenceImagePaths:['old.png']},legacy,root).args,{referenceImagePaths:['old.png']});
 const raw={prompt:'legacy',sourceImagePath:'external.png'};assert.equal(prepareVideoImages('seedance_img2video',raw,{},root).args,raw);
});

test('ASTRA ending frame uses the adapter duration conversion rather than a second rounding rule',t=>{
 const root=fixture(t),s=shot();s.visual.frames.keyframes=[{image:'mid.png',atSeconds:1,state:'Contact'}];
 const p=prepareVideoImages('astra_keyframe_video',{prompt:'Move',duration:4.2,frameRate:24},s,root);
 assert.deepEqual(p.args.images.map(i=>i.frameIdx),[0,24,96]);
 assert.equal(parseVideoArgs('astra_keyframe_video',p.args).numFrames,97);
});


test('compiled intermediate inputs agree with the existing ASTRA preparation helper including strengths',t=>{
 const root=fixture(t),s=shot();s.duration=5;s.visual.video={strength:.75};
 s.visual.frames.keyframes=[{image:'mid.png',atSeconds:1,state:'Contact'}];
 const {keyframeImages}=createRequire(import.meta.url)('../../skills/produce/references/prepare-astra-shot.js');
 const images=keyframeImages(s,path.join(root,'storyboard'),121,24);
 const p=prepareVideoImages('astra_keyframe_video',{prompt:'Move',numFrames:121,frameRate:24,images},s,root);
 assert.deepEqual(p.args.images,images);
 s.visual.frames.keyframes[0].atSeconds=5;
 assert.throws(()=>prepareVideoImages('astra_keyframe_video',{numFrames:129},s,root),/time and state/);
});
