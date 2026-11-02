import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {runInNewContext} from 'node:vm';
const require=createRequire(import.meta.url),ref=path.resolve(import.meta.dirname,'../../skills/storyboard/references');
const routing=require(path.join(ref,'render-routing.js'));
const {framePlan,checkFrames}=routing;
const {scenePlan}=require('../../skills/produce/references/seedance-route.js');
const {signature}=require(path.join(ref,'production-mode.js'));
// Most cases inspect all diagnostics; the cases that pass their own advice array check what blocks.
const checkScene=(scene,options={})=>{const advice=[];return routing.checkScene(scene,{...options,advice}).concat(advice);};
const still=()=>({type:'points',duration:8,narration:[{tts:'A portrait.',sub:'A portrait.'}],shot:{infoType:'other',render:{mode:'still_camera',purpose:'portrait',reason:'Introduce the inventor.',camera:{effect:'push',target:'face',reason:'Make the identity clear.'}}},visual:{bg:'images/portrait.png',camera:{movement:'dolly in'},slide:{kind:'camera',motion:true,file:'slides/s1-camera.html'}}});
// Every generated_video cut carries its 3D previz (blender-previz.md §6, user directive 2026-09-11).
const previzRecord=()=>({renderer:'blender',clip:'previz/s1.mp4',firstFrame:'previz/s1-f0001.png',sha256:'b'.repeat(64),fps:24,seconds:5,camera:{movement:'arc shot'}});
const PREVIZ_PROMPT='Image 1 is the first frame. Use Video 1, a 3D clay-model previz, as the only reference for camera movement, shot rhythm, subject trajectory and blocking; strictly keep its camera path and pacing. Do not reference its visual content. The red model in Video 1 is the porter from Image 2. A stone courtyard at dusk. The porter stays consistent with Image 2.';
const video=()=>({type:'cover',duration:5,shot:{infoType:'other',render:{mode:'generated_video',purpose:'live_action',reason:'The flowing fabric carries the mood.',motionEssential:true,action:'Wind lifts the fabric while the actor turns.',whyNotStill:'The changing silhouette requires continuous natural motion.'}},
 visual:{bg:'images/scene-1.png',camera:{movement:'arc shot',speed:'slow',framing:'medium',end:'the gate'},why:'Continuous cloth and body motion.',
  video:{engine:'seedance',modelPurpose:'previz',modelReason:'The orbit lands on the sentence',realFaceInput:false,referenceImagePaths:['images/scene-1.png','characters/porter/body.png'],previz:previzRecord(),prompt:PREVIZ_PROMPT}}});
test('a previz clip is bound by hash, rendered at whole seconds, and named in the prompt',()=>{
 const checkPreviz=(scene,options={})=>{const advice=[];return routing.checkPreviz(scene,{...options,advice}).concat(advice);};
 const good=video;
 assert.deepEqual(checkScene(good()),[]);
 assert.deepEqual(checkPreviz(video()),[]);
 const edits=[
  [s=>{s.visual.video.previz.renderer='maya'},/renderer must be blender/],
  [s=>{delete s.visual.video.previz.renderer},/renderer must be blender/],
  [s=>{delete s.visual.video.previz.firstFrame},/firstFrame/],
  [s=>{s.visual.video.previz.firstFrame='previz/s1.jpg'},/firstFrame/],
  [s=>{delete s.visual.video.previz.camera},/camera\.movement records/],
  [s=>{s.visual.video.previz.camera.movement='dolly in'},/contradicts visual\.camera\.movement/],
  [s=>{s.visual.video.previz.handoff='mail'},/handoff must be/],
  [s=>{s.visual.video.previz.clip='https://x/s1.mp4'},/mp4\/mov path/],
  [s=>{s.visual.video.previz.clip='/Users/x/s1.mp4'},/no absolute path/],
  [s=>{s.visual.video.previz.clip='../other/s1.mp4'},/no \.\./],
  [s=>{s.visual.video.previz.firstFrame='previz/../../secret.png'},/no \.\./],
  [s=>{delete s.visual.video.previz.sha256},/sha256/],
  [s=>{s.visual.video.previz.seconds=4.5},/whole number/],
  [s=>{s.visual.video.previz.fps=61},/24–60/],
  [s=>{s.visual.video.previz.fps=23.976},/24–60/],
  [s=>{s.visual.video.modelPurpose='reference'},/modelPurpose:"previz"/],
  [s=>{s.visual.video.referenceImagePaths=['characters/porter/body.png']},/referenceImagePaths\[0\]/],
  [s=>{s.visual.video.lastImagePath='images/scene-1-end.png'},/no end frame/],
  [s=>{s.visual.video.prompt=s.visual.video.prompt.replace('Video 1, a','the clip, a').replace('in Video 1','in the clip')},/"Video 1"/],
  [s=>{s.visual.video.prompt=s.visual.video.prompt.replace('Image 1 is the first frame. ','')},/first frame/],
  [s=>{s.visual.video.prompt=s.visual.video.prompt.replace('Do not reference its visual content. ','')},/visual content/],
  [s=>{s.shot.render.mode='still_camera'},/generated_video cut/],
 ];
 for(const [edit,pattern] of edits){const s=good();edit(s);assert.match(checkPreviz(s).join(),pattern)}
 // A draft has no hash and no prompt yet; the shape rules still hold.
 const d=good();delete d.visual.video.previz.sha256;d.visual.video.prompt='';assert.deepEqual(checkPreviz(d,{draft:true}),[]);
 d.visual.video.previz.seconds=0;assert.match(checkPreviz(d,{draft:true}).join(),/whole number/);
 // The camera slot may spell the move with different spacing or case; a different move is the defect.
 const c=good();c.visual.camera.movement=' Arc  Shot ';assert.deepEqual(checkPreviz(c),[]);
 const t=good();t.visual.video.previz.renderer='threejs';assert.deepEqual(checkPreviz(t),[]);
});
test('ASTRA previz keeps the exact frame duration instead of rounding up',()=>{
 const checkPreviz=(scene,options={})=>{const advice=[];return routing.checkPreviz(scene,{...options,advice}).concat(advice);};
 const s=video();s.visual.video.engine='astra';s.visual.video.numFrames=185;s.visual.video.frameRate=24;
 s.visual.video.previz.handoff='frame_and_prompt';s.visual.video.previz.fps=24;s.visual.video.previz.seconds=185/24;
 assert.deepEqual(checkPreviz(s),[]);
 s.visual.video.previz.seconds=8;assert.match(checkPreviz(s).join(),/match numFrames/);
 s.visual.video.previz.seconds=185/24;s.visual.video.previz.fps=30;assert.match(checkPreviz(s).join(),/match numFrames/);
 s.visual.video.previz.fps=24;s.visual.video.numFrames=184;assert.match(checkPreviz(s).join(),/8k\+1/);
 s.visual.video.numFrames=361;s.visual.video.previz.seconds=361/24;assert.deepEqual(checkPreviz(s),[]);   // the server ceiling itself passes
 s.visual.video.numFrames=369;assert.match(checkPreviz(s).join(),/through 361/);
 s.visual.video.previz.seconds=185/24;
 delete s.visual.video.numFrames;assert.match(checkPreviz(s).join(),/fractional seconds require numFrames/);
});
// ── free stock material (scenes-schema §stock material) ──

const stockLicense=()=>({provider:'nasa',url:'https://images.nasa.gov/details/A11',license:'NASA media usage guidelines',licenseUrl:'https://www.nasa.gov/nasa-brand-center/images-and-media/',attributionRequired:false,commercial:true,modify:true,retrievedAt:'2026-09-07'});
test('the license record is checked on every stock source, photo or clip',()=>{
 const lic=stockLicense();
 assert.deepEqual(routing.checkLicense({license:lic}),[]);
 for(const [key,value,re] of [['commercial',false,/commercial must be true/],['modify',false,/modify must be true/],['shareAlike',true,/share-alike/],['url','not a url',/url must be/],['retrievedAt','yesterday',/retrievedAt/],['attributionRequired','yes',/attributionRequired/]])
  assert.match(routing.checkLicense({license:{...lic,[key]:value}}).join('\n'),re,key);
 assert.match(routing.checkLicense({license:{...lic,attributionRequired:true}}).join('\n'),/attribution text/);
 assert.deepEqual(routing.checkLicense({license:{...lic,attributionRequired:true,attribution:'NASA/KSC'}}),[]);
 const photo=still();photo.visual.source='stock';photo.visual.license=lic;
 assert.deepEqual(checkScene(photo),[]);
 photo.visual.bgPrompt='a generated prompt';
 assert.match(checkScene(photo).join('\n'),/drop bgPrompt/);
 delete photo.visual.license;
 assert.match(checkScene(photo).join('\n'),/visual\.license/);
});
test('a still pan or tilt travels between two regions of the actual image (L13)',()=>{
 const s=still();s.shot.render.camera={effect:'tilt',target:'the tower',reason:'Its height is told by the time the eye needs.'};
 assert.deepEqual(checkScene(s,{draft:true}),[]);
 assert.match(checkScene(s).join('\n'),/tilt needs focusFrom and focusTo/);
 s.shot.render.camera.focusFrom=[.5,.9,.4,.2];s.shot.render.camera.focusTo=[.5,.9,.4,.2];
 assert.match(checkScene(s).join('\n'),/starts and ends on the same region/);
 s.shot.render.camera.focusTo=[.5,.1,.4,.2];
 assert.deepEqual(checkScene(s),[]);
 const p=still();p.shot.render.camera={effect:'pan',target:'the room',reason:'One pan leaves the room as a map.',focusFrom:[.2,.5,.3,.3],focusTo:[.8,.5,.3,.3]};
 assert.deepEqual(checkScene(p),[]);
 assert.ok(routing.STILL_CAMERA_EFFECTS.includes('tilt'));
 const cam=require(path.join(ref,'still-camera.js'));
 const spec={template:'tilt',duration:5,focusFrom:[.5,.9,.4,.2],focusTo:[.5,.1,.4,.2]};
 const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,a+' ≠ '+b);
 // named regions: the window centres A, then B, as far as the picture reaches (bottom edge → top edge here)
 near(cam.state(spec,0).fy,1);near(cam.state(spec,5).fy,0);near(cam.state(spec,2.5).fx,.5);
 // the ease holds both ends: a tenth of the way in, the window has barely left A
 assert.ok(cam.state(spec,.5).fy>.98);
 const pan={template:'pan',duration:5,focusFrom:[.2,.5,.3,.3],focusTo:[.8,.5,.3,.3]};
 near(cam.state(pan,0).fx,0);near(cam.state(pan,5).fx,1);near(cam.state(pan,0).zoom,1.2);
 // on a source with the frame's own shape the window travels (zoom − 1) × Δfx of the frame: a fifth, not 5–8%
 const travel=s=>(cam.state(s,0).zoom-1)*Math.abs(cam.state(s,5).fx-cam.state(s,0).fx);
 assert.ok(travel(pan)>=.1,String(travel(pan)));
 assert.ok(travel({template:'pan',duration:5,focusFrom:[.45,.5,.1,.1],focusTo:[.57,.5,.1,.1]})>=.1);
 // the source's own cap (1.5× upscale at most) wins over the travel the regions ask for, down to the classic 1.13:
 // a source already at the limit still pans (the render reports the upscale) instead of freezing
 near(cam.state({...pan,maxZoom:1.15},0).zoom,1.15);near(cam.state({...pan,maxZoom:1.05},0).zoom,1.13);near(cam.state({...pan,maxZoom:.9},0).zoom,1.13);
 assert.ok(cam.state({...pan,maxZoom:.9},5).fx-cam.state({...pan,maxZoom:.9},0).fx>.5);
 // a pan without regions keeps the classic diagonal
 assert.deepEqual([cam.state({template:'pan',duration:5},0).fx,cam.state({template:'pan',duration:5},0).zoom],[.26,1.13]);
});
test('zoom ladder uses whole-cut averages, quintic slow easing and accelerating fast easing',()=>{
 const {state}=require(path.join(ref,'still-camera.js'));
 for(const [speed,rate] of [[undefined,.04],['very slow',.04],['slow',.06],['fast',.14],['very fast',.20]]){
  for(const template of ['push','pull','approach']){
   const spec={template,duration:5,speed,focusTo:[.5,.4,.1,.1]};
   assert.ok(Math.abs(Math.abs(state(spec,5).zoom-state(spec,0).zoom)/5-rate)<1e-12);
  }
 }
 const fast={template:'push',duration:4,speed:'fast'};
 assert.ok(Math.abs(state(fast,2).zoom-1.14)<1e-12);
 assert.equal(state({...fast,ease:'smoothstep'},2).zoom,1.28);
 const slow={template:'push',duration:8};
 assert.ok(Math.abs(state(slow,8/3).zoom-(1+.32*(17/81)))<1e-12);
 for(const template of ['focus-in','rack-focus']){
  const spec={template,duration:8,focusFrom:[.2,.6,.1,.1],focusTo:[.5,.3,.1,.1]};
  assert.deepEqual(state({...spec,speed:'fast'},2),state(spec,2));
 }
});

// ── first/last frames ──
const framed=()=>({type:'points',duration:5,visual:{bg:'images/start.png',frames:{mode:'first_last',reason:'Arrive at the doorway.',endState:'The same figure stands at the threshold.',end:'images/end.png'},video:{engine:'seedance',model:'dreamina-seedance-2-0-260128',generateAudio:false,realFaceInput:false}}});
test('conditional frames preserve legacy images and forward the actual end image',()=>{
 assert.equal(framePlan({visual:{bg:'a.png'}}).mode,'first');
 const s=framed();assert.deepEqual(checkFrames(s),[]);assert.equal(scenePlan(s).lastImagePath,s.visual.frames.end);
 delete s.visual.frames.end;assert.deepEqual(checkFrames(s,{draft:true}),[]);assert.match(checkFrames(s).join(' '),/both start and end/);assert.throws(()=>scenePlan(s),/both start and end/);
});
test('contradictory frame inputs and unsupported end-frame models cannot generate',()=>{
 const s=framed();s.visual.video.lastImagePath='different.png';assert.throws(()=>scenePlan(s),/disagree/);
 delete s.visual.video.lastImagePath;s.visual.frames.mode='first';assert.throws(()=>scenePlan(s),/first-only/);
 s.visual.frames.mode='first_last';s.visual.frames.end=s.visual.bg;assert.throws(()=>scenePlan(s),/distinct/);
});
test('frame edits stale approval and the browser uses the same plan contract',()=>{
 const w={SCENES:[framed()]};const before=signature(w);w.SCENES[0].visual.frames.endState='Different arrival';assert.notEqual(signature(w),before);
 const ctx={window:{}};runInNewContext(readFileSync(path.join(ref,'render-routing.js'),'utf8'),ctx);
 assert.equal(ctx.window.RENDER_ROUTING.framePlan(framed()).end,'images/end.png');
});

test('structured references distinguish draft slots, uses, legacy aliases and explicit frame modes',()=>{
 const s={visual:{frames:{mode:'first_last',start:'start.png',end:'end.png'},references:[{id:'hero',role:'character',use:'image',purpose:'Preserve costume',path:'hero.png'}]}};
 assert.deepEqual(checkFrames(s),[]);assert.equal(framePlan(s).start,'start.png');
 s.visual.bg='different.png';assert.match(checkFrames(s).join(),/start.*disagree/);delete s.visual.bg;
 s.visual.references[0].path='';assert.deepEqual(checkFrames(s,{draft:true}),[]);assert.match(checkFrames(s).join(),/path/);
 s.visual.references[0].path='javascript:alert(1)';assert.match(checkFrames(s,{draft:true}).join(),/local image/);
 s.visual.references[0].path='hero.png';s.visual.references.push({...s.visual.references[0]});assert.match(checkFrames(s).join(),/unique id/);
 s.visual.references.pop();s.visual.frames={mode:'reference'};assert.match(checkFrames(s).join(),/needs video/);
 s.visual.references[0].use='video';assert.deepEqual(checkFrames(s),[]);
 s.visual.video={referenceImagePaths:['wrong.png']};assert.match(checkFrames(s).join(),/disagree/);
 const w={SCENES:[s]},old=signature(w);s.visual.references[0].purpose='Preserve face';assert.notEqual(signature(w),old);
});
