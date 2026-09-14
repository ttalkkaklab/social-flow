import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as THREE from 'three';
import {blenderCameraSetSchema} from '../dist/blender-bridge.js';
const require=createRequire(import.meta.url);
const mode=require('../../skills/storyboard/references/production-mode.js');
const {prepare,page}=require('../../skills/storyboard/references/drone-previz.js');
const contract=require('../../skills/storyboard/references/previz-contract.js');
const {checkScene}=require('../../skills/storyboard/references/render-routing.js');
const {scenePlan}=require('../../skills/produce/references/seedance-route.js');
const {assemble}=require('../../skills/storyboard/references/spatial-prompts.js');
function shot() {
  return {type:'cover',duration:4,narration:[{tts:'Follow the valley to the bridge.'}],
    shot:{infoType:'place',render:{mode:'generated_video',purpose:'place',reason:'Travel reveals the bridge behind the ridge.',motionEssential:true,whyNotStill:'Passing the ridge reveals a hidden connection.',action:'The bridge appears beyond the ridge.'},
      videoDesign:{look:'realistic',worldId:'valley',before:'Trees enclose the valley.',after:'The bridge fills the view.',action:'Travel reveals the bridge.',continuity:'The river and bridge keep their geometry.',reject:'Landmarks warp or the camera cuts.',motion:{kind:'spatial_reveal',subject:'Valley',visibleChange:'The hidden bridge comes into view.',reason:'Travel exposes the route around the ridge.'}}},
    visual:{why:'Travel exposes the bridge behind the ridge.',bg:'images/start.png',camera:{preset:'drone-flythrough',variant:'fpv',trajectory:{coordinateSpace:'local-meters',seconds:4,lensMm:24,keys:[
      {at:0,position:[0,-20,8],target:[0,0,4],rollDeg:0,label:'the valley entrance'},
      {at:2,position:[8,-5,7],target:[2,10,4],rollDeg:20,label:'the ridge'},
      {at:4,position:[0,15,6],target:[0,25,3],rollDeg:0,label:'the bridge'}],
      proxies:[{name:'bridge',kind:'box',size:[12,2,4],keys:[{frame:1,position:[0,25,0]}]}, {name:'ridge',kind:'box',size:[8,8,8],keys:[{frame:1,position:[-6,5,0]}]}]}},
      video:{engine:'seedance',modelPurpose:'previz',model:'seedance-1-5-pro-251215',resolution:'720p',generateAudio:false}}};
}
function planned(){const s=shot(), p=prepare(s);s.visual.camera=p.camera;s.visual.video.previz={renderer:'threejs',clip:'previz/drone.mp4',firstFrame:'previz/start.png',sha256:'a'.repeat(64),seconds:4,fps:24,camera:p.previzCamera,handoff:'frame_and_prompt'};return {s,p};}
test('one trajectory produces a continuous path, slots, and compatible Blender/three.js keys',()=>{
 const {s,p}=planned(); assert.deepEqual(contract.checkSpec(p.spec),[]);
 assert.equal(p.spec.camera.keys[0].frame,1); assert.equal(p.spec.camera.keys.at(-1).frame,96);
 assert.deepEqual(p.spec.camera.keys[0].position,s.visual.camera.trajectory.keys[0].position);
 assert.deepEqual(p.spec.camera.keys.at(-1).position,s.visual.camera.trajectory.keys.at(-1).position);
 assert.equal(mode.droneSample(s.visual.camera,2).rollDeg,20);
 const left=mode.droneSample(s.visual.camera,1.999).position,right=mode.droneSample(s.visual.camera,2.001).position;
 assert.ok(Math.hypot(...left.map((v,i)=>right[i]-v))>.001,'does not stop at a waypoint');
 assert.equal(blenderCameraSetSchema.safeParse({...p.blenderCamera,blendPath:'/tmp/drone.blend'}).success,true);
 assert.deepEqual(checkScene(s),[]);
});
test('malformed trajectories, mismatched slots, and stale previz bindings fail',()=>{
 for(const mutate of [c=>c.trajectory.keys[1].at=0,c=>c.trajectory.keys[1].position=[NaN,0,1],c=>c.trajectory.keys[1].rollDeg=60,c=>c.variant='cinematic',c=>c.trajectory.keys[1]=null,c=>c.trajectory.coordinateSpace='wgs84']){
  const s=shot();mutate(s.visual.camera);assert.throws(()=>prepare(s));
 }
 const {s}=planned();s.visual.camera.trajectory.keys[1].position[0]=9;
 assert.ok(checkScene(s).some(e=>/stale/.test(e)));
 s.visual.camera={...s.visual.camera,...mode.droneSlots(s.visual.camera)};
 assert.ok(checkScene(s).some(e=>/trajectoryBinding/.test(e)));
});
test('drone eligibility does not turn every place or every wide shot into an exception',()=>{
 const {s}=planned();s.shot.render.whyNotStill='';assert.ok(checkScene(s,{draft:true}).some(e=>/whyNotStill/.test(e)));
 const ordinary=shot();delete ordinary.visual.camera.preset;delete ordinary.visual.camera.trajectory;
 assert.ok(checkScene(ordinary,{draft:true}).some(e=>/requires still_camera/.test(e)));
 const flat=planned().s;flat.shot.videoDesign.look='arcade';assert.ok(checkScene(flat).some(e=>/volumetric/.test(e)));
});
test('browser contract and prompt assembly consume the same authored camera',()=>{
 const {s,p}=planned(), win={PRODUCTION:{mode:'video_30',style:{preset:'photoreal',world:'A forest valley.',materials:'Stone and trees.',palette:'Green and grey.',lighting:'Daylight.',camera:'Continuous aerial travel.'}},SCENES:[s]};
 const prompts=assemble(win,0);assert.match(prompts.motionPrompt,/drone fly-through/);assert.match(prompts.motionPrompt,/the ridge/);
 const sandbox={};vm.runInNewContext(readFileSync(new URL('../../skills/storyboard/references/production-mode.js',import.meta.url),'utf8'),sandbox);
 assert.equal(sandbox.PRODUCTION_MODE.droneBinding(s.visual.camera),mode.droneBinding(s.visual.camera));
 assert.match(page(p.spec),/rollDeg/);
});
test('banked camera seeks are deterministic and cinematic stays level',()=>{
 const {p}=planned(), camera=new THREE.PerspectiveCamera();
 const seek=frame=>{const c=contract.sampleCamera(p.spec,frame);camera.position.fromArray(contract.toThree(c.position));camera.up.set(0,1,0);camera.lookAt(new THREE.Vector3(...contract.toThree(c.target)));camera.rotateZ(c.rollDeg*Math.PI/180);return camera.quaternion.toArray();};
 const mid=seek(48);seek(96);assert.deepEqual(seek(48),mid);
 const s=shot();s.visual.camera.variant='cinematic';s.visual.camera.trajectory.keys.forEach(k=>k.rollDeg=0);assert.ok(prepare(s).spec.camera.keys.every(k=>k.rollDeg===0));
});
test('old previz specs keep zero bank and long paths fit the bridge key budget',()=>{
 const {p}=planned();p.spec.camera.keys.forEach(k=>delete k.rollDeg);assert.equal(contract.sampleCamera(p.spec,10).rollDeg,0);
 const s=shot();s.visual.camera.trajectory.seconds=30;s.visual.camera.trajectory.keys[1].at=15;s.visual.camera.trajectory.keys[2].at=30;
 assert.ok(prepare(s,{fps:60}).blenderCamera.keys.length<=500);
});
test('a route edit changes the approval signature and mismatched billed duration fails',()=>{
 const {s}=planned(),win={PRODUCTION:{mode:'video_30'},SCENES:[s]};
 const before=mode.signature(win);s.visual.camera.trajectory.keys[1].rollDeg=10;
 assert.notEqual(mode.signature(win),before);
 assert.equal(scenePlan(s).durationSeconds,4);
 s.visual.camera.trajectory.seconds=5;
 assert.throws(()=>scenePlan(s),/resolved billed duration/);
});
export {shot};
