import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {locationSchema} from '../dist/location.js';
const require=createRequire(import.meta.url);
const L=require('../../skills/storyboard/references/location-assets.js');
const C=require('../../skills/storyboard/references/location-contract.js');
const {spec,example}=require('../../skills/storyboard/references/location-example.js');
const {readScenes}=require('../../skills/autoproduce/references/cost-preview.js');
function fixture(fn){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sf-location-'));try{const files=example(dir),win=readScenes(files.board);const asset=path.join(dir,'asset');fs.mkdirSync(asset);const m=structuredClone(spec);m.assets={};for(const [k,n]of [['blend','source.blend'],['glb','preview.glb']]){fs.writeFileSync(path.join(asset,n),k);m.assets[k]={path:n,sha256:L.fileHash(path.join(asset,n))};}const manifest=path.join(asset,'location.json');fs.writeFileSync(manifest,JSON.stringify(m));const boardDir=path.dirname(files.board);L.bind(win,0,boardDir,{manifest,stateId:'day',cameraId:'wide',mustShow:['door']});fn({dir,boardDir,win,manifest,m});}finally{fs.rmSync(dir,{recursive:true,force:true});}}
function ready(f){const fingerprint=L.signature(L.context(f.win,0,f.boardDir));fs.mkdirSync(path.join(f.boardDir,'locations'));const frames={};for(const k of ['start','end']){const name='locations/'+k+'.png';fs.writeFileSync(path.join(f.boardDir,name),'fixture '+k);frames[k]={path:name,sha256:L.fileHash(path.join(f.boardDir,name))};}f.win.SCENES[0].visual.location={fingerprint,frames};L.approve(f.win,0,f.boardDir,{reviewer:'test',notes:'Synthetic fixture, not visual evidence'});}
test('generation requires renders but permits honestly unreviewed references',()=>fixture(f=>{assert.throws(()=>L.references(f.win,0,f.boardDir),/stale/);ready(f);delete f.win.SCENES[0].visual.location.approval;assert.equal(L.references(f.win,0,f.boardDir).approved,false);assert.deepEqual(L.check(f.win,f.boardDir,{ready:true}).map(x=>x.level),['warn']);}));
test('changed mesh, manifest or reference bytes cannot keep approval',()=>fixture(f=>{ready(f);fs.appendFileSync(path.join(f.boardDir,'locations/start.png'),'tamper');assert.throws(()=>L.references(f.win,0,f.boardDir),/bytes changed/);fs.appendFileSync(path.join(f.dir,'asset/preview.glb'),'tamper');assert.throws(()=>L.plan(f.win,0,f.boardDir),/changed location/);}));
test('state and textual camera changes invalidate reference fingerprint',()=>fixture(f=>{ready(f);f.win.SCENES[0].shot.location.stateId='night';assert.throws(()=>L.references(f.win,0,f.boardDir),/stale/);f.win.SCENES[0].shot.location.stateId='day';f.win.SCENES[0].visual.camera.framing='different';assert.throws(()=>L.references(f.win,0,f.boardDir),/stale/);}));
test('manifest asset traversal is refused',()=>fixture(f=>{f.m.assets.glb.path='../outside';fs.writeFileSync(f.manifest,JSON.stringify(f.m));assert.throws(()=>L.load(f.manifest),/escapes/);}));
test('prototype keys and null transforms cannot pass the location contract',()=>{const m=structuredClone(spec);m.states.day.objects.door={position:null};assert.ok(C.validate(m).length);const b={id:m.id,revision:1,manifestSha256:'a'.repeat(64),stateId:'constructor',cameraId:'constructor',mustShow:[]};assert.equal(C.bindingErrors(b,m).length,2);});
function blocking(){return {axis:['A','B'],actors:[
  {id:'A',height:1.7,color:'#d0342c',start:{position:[-1,0,0],rotationZDeg:90,gazeTarget:'B'},end:{position:[-.5,0,0],rotationZDeg:90,gazeTarget:'B',holds:['toolbox']}},
  {id:'B',height:1.7,color:'#346cbe',start:{position:[1,0,0],rotationZDeg:-90,gazeTarget:'A'}}
]};}
test('MCP location schema accepts shared blocking/previz and refuses malformed endpoint poses',()=>{
  assert.ok(locationSchema.safeParse({action:'bind',blocking:blocking(),endStateId:'open',continuityGroup:'conversation'}).success);
  assert.ok(locationSchema.safeParse({action:'previz',seconds:2,fps:24}).success);
  const b=blocking();b.actors[0].end.position=[0,1];
  assert.equal(locationSchema.safeParse({action:'bind',blocking:b}).success,false);
  assert.equal(locationSchema.safeParse({action:'previz',seconds:Infinity}).success,false);
});
test('blocking validates actor identity, floor poses, gaze targets and held object IDs',()=>{
  assert.deepEqual(C.blockingErrors(blocking(),spec),[]);
  for(const mutate of [b=>b.actors.push(b.actors[0]),b=>b.actors[0].start.position=[NaN,0,0],b=>b.actors[0].height=0,b=>b.actors[0].start.gazeTarget='missing',b=>b.actors[0].start.gazeTarget='A',b=>b.actors[0].start.holds=['missing'],b=>b.axis=['A','A'],b=>b.actors[0].id='door']){
    const b=blocking();mutate(b);assert.ok(C.blockingErrors(b,spec).length);
  }
});
const blenderBin=process.env.BLENDER||'/Applications/Blender.app/Contents/MacOS/Blender';
test('real Blender renders one shared set, moving actors, gaze and matching previz endpoints',
  {skip:!fs.existsSync(blenderBin),timeout:120000},()=>{
    const kept=process.env.SOCIAL_FLOW_LOCATION_TEST_OUTPUT;
    if(kept)fs.mkdirSync(kept,{recursive:true});
    const dir=fs.mkdtempSync(kept?path.join(kept,'run-'):path.join(os.tmpdir(),'sf-location-render-'));
    try{
      const m=structuredClone(spec);
      m.objects=m.objects.filter(o=>['floor','door','door-handle','desk-top','toolbox'].includes(o.id));
      m.objects.push({id:'gaze-wall',label:'Gaze occluder',kind:'box',position:[0,0,1],size:[.1,.5,2],color:'#aaaaaa'});
      m.states.open.objects['gaze-wall']={visible:false};
      m.states.day.objects.toolbox={position:[-4,1.15,1.12]};
      m.states.open.objects.toolbox={position:[4,1.15,1.12]};
      m.cameras={wide:{position:[3,-5,3],target:[0,.5,.9],lensMm:35,width:480,height:270,end:{position:[2.5,-4.5,2.8],target:[.2,.5,.9]}}};
      const built=L.build({spec:m,root:path.join(dir,'sets')}),boardDir=path.join(dir,'storyboard');fs.mkdirSync(boardDir);
      const win={FORMAT:'youtube-long-16x9',PRODUCTION:{previz:{renderer:'blender'}},SCENES:[{id:'s0001',visual:{video:{engine:'host'},camera:{movement:'dolly in'}}}]};
      const actors=blocking();actors.actors[0].end.holds=[];
      actors.actors[1].start.gazeTarget='toolbox';
      L.bind(win,0,boardDir,{manifest:built.manifest,stateId:'day',endStateId:'open',cameraId:'wide',blocking:actors,continuityGroup:'conversation'});
      const sourceHash=L.fileHash(path.join(path.dirname(built.manifest),'source.blend'));
      const stills=L.render(win,0,boardDir);
      for(const f of Object.values(stills.frames))assert.ok(fs.statSync(path.join(boardDir,f.path)).size>1000);
      const spatial=L.references(win,0,boardDir);
      assert.equal(spatial.spatialPaths.length,6);
      assert.equal(spatial.spatial.fingerprint,stills.fingerprint);
      assert.equal(spatial.spatial.views.start.actors.length,2);
      assert.equal(spatial.spatial.views.start.actors[0].cameraSamples.length,5);
      assert.equal(spatial.spatial.views.end.stateId,'open');
      assert.equal(spatial.spatial.views.start.actors[0].gaze.target,'B');
      assert.equal(spatial.spatial.views.start.actors[0].gaze.blockedBy,'gaze-wall');
      assert.equal(spatial.spatial.views.end.actors[0].gaze.blockedBy,null);
      assert.ok(spatial.spatial.views.start.actorDistances[0].floorOriginDistanceMetres>0);
      const record=L.previz(win,0,boardDir,{seconds:2,fps:24});
      assert.deepEqual(L.references(win,0,boardDir).spatial,spatial.spatial);
      assert.equal(record.firstFrame,win.SCENES[0].visual.location.frames.start.path);
      assert.equal(record.locationBinding.fingerprint,win.SCENES[0].visual.location.fingerprint);
      assert.equal(L.fileHash(path.join(path.dirname(built.manifest),'source.blend')),sourceHash);
      assert.equal(L.references(win,0,boardDir).paths[0],path.join(boardDir,record.firstFrame));
      const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-show_streams','-of','json',path.join(boardDir,record.clip)],{encoding:'utf8'}));
      assert.equal(probe.streams.length,1);assert.equal(probe.streams[0].codec_name,'h264');
      assert.equal(Number(probe.streams[0].nb_read_frames),48);assert.equal(Number(probe.streams[0].duration),2);
      assert.equal(probe.streams[0].width,480);assert.equal(probe.streams[0].height,270);
      const py="import bpy,json; from mathutils import Vector; rows=[]\nfor f in [1,13,48]:\n bpy.context.scene.frame_set(f); a=bpy.data.objects['actor-A']; h=bpy.data.objects['head-A']; b=bpy.data.objects['head-B']; prop=bpy.data.objects['toolbox']; direction=(b.matrix_world.translation-h.matrix_world.translation).normalized(); forward=h.matrix_world.to_quaternion()@Vector((0,-1,0)); prop_direction=(prop.matrix_world.translation-b.matrix_world.translation).normalized(); prop_forward=b.matrix_world.to_quaternion()@Vector((0,-1,0)); rows.append({'position':list(a.location),'yaw':a.rotation_euler.z,'gaze':forward.dot(direction),'propGaze':prop_forward.dot(prop_direction),'propX':prop.location.x,'door':bpy.data.objects['door'].hide_render})\nprint('SPATIAL_RESULT:'+json.dumps(rows))";
      const result=execFileSync(blenderBin,['--background',path.join(boardDir,record.blend),'--python-expr',py],{encoding:'utf8',timeout:30000});
      const rows=JSON.parse(result.match(/SPATIAL_RESULT:(.+)/)[1]);
      assert.equal(rows[0].position[0],-1);assert.equal(rows[2].position[0],-.5);
      assert.ok(rows.every(row=>row.gaze>.99));assert.ok(rows.every(row=>row.propGaze>.9999));
      assert.ok(Math.abs(rows[1].propX-(-4+8*12/47))<1e-5);
      assert.equal(rows[0].door,false);assert.equal(rows[2].door,true);
      L.saveBoard(path.join(boardDir,'scenes.js'),win);
      if(kept)console.log('Spatial render evidence: '+boardDir);
    }finally{if(!kept)fs.rmSync(dir,{recursive:true,force:true});}
  });

// Where a world point lands in a shotCamera frame: [-1, 1] on both axes is inside, +y is up.
function project(camera,point){
  const sub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const norm=v=>v.map(x=>x/Math.hypot(...v)),forward=norm(sub(camera.target,camera.position)),right=norm(cross(forward,[0,0,1])),up=cross(right,forward),v=sub(point,camera.position);
  const tanH=18/camera.lensMm,tanV=tanH*camera.height/camera.width;
  return [dot(v,right)/dot(v,forward)/tanH,dot(v,up)/dot(v,forward)/tanV];
}
const mina=(extra={})=>({id:'mina',height:1.7,color:'#d0342c',position:[0,0,0],rotationZDeg:0,...extra});
const frameOf=(size,angle='eye',actors=[mina()],cast=['mina'],width=960,height=540)=>L.shotCamera(spec,{stateId:'day',actors,cast,size,angle,width,height});
test('shot sizes frame the blocked person by their crop lines',()=>{
  const at=(size,z)=>project(frameOf(size).camera,[0,0,z])[1];
  const fs_=frameOf('fs').camera,ms=frameOf('ms').camera,cu=frameOf('cu').camera;
  assert.ok(at('fs',1.7)<1&&at('fs',1.7)>.7&&at('fs',0)>-1&&at('fs',0)<-.7,'full shot: crown and feet both in, near the edges');
  assert.ok(at('ms',1.7)<1&&at('ms',.95)>-1.05&&at('ms',.95)<-.8&&at('ms',.4)<-1,'medium shot: waist at the bottom edge, knees out');
  assert.ok(at('cu',1.58)<1&&at('cu',1.58)>-1&&at('cu',1.2)<-1,'close-up: eyes in, chest out');
  assert.ok(at('ecu',1.58)>-1&&at('ecu',1.58)<1&&at('ecu',1.45)<-1,'extreme close-up: the eyes alone');
  assert.ok(fs_.lensMm<ms.lensMm&&ms.lensMm<cu.lensMm);
  // The camera stands in front of her: zero rotation faces -Y, +90 faces +X.
  assert.ok(fs_.position[1]<-1);
  assert.ok(frameOf('ms','eye',[mina({rotationZDeg:90})]).camera.position[0]>1);
  assert.ok(frameOf('back').camera.position[1]>1,'back: from behind');
  // A vertical frame keeps the crop lines.
  const tall=frameOf('fs','eye',[mina()],['mina'],540,960).camera;
  assert.ok(project(tall,[0,0,1.7])[1]<1&&project(tall,[0,0,0])[1]>-1);
});
test('angles set the camera height and pitch; dutch says the render stays level',()=>{
  const eye=frameOf('ms').camera,high=frameOf('ms','high').camera,low=frameOf('ms','low').camera,ground=frameOf('ms','ground').camera,top=frameOf('ms','overhead').camera;
  assert.ok(Math.abs(eye.position[2]-1.581)<.01);
  assert.ok(high.position[2]>eye.position[2]+.5&&high.target[2]<high.position[2]);
  assert.ok(low.position[2]<low.target[2]);
  assert.equal(ground.position[2],.15);
  assert.ok(Math.hypot(top.position[0]-top.target[0],top.position[1]-top.target[1])<.01&&top.position[2]>top.target[2]+.5);
  for(const camera of [high,low,ground])assert.ok(Math.abs(project(camera,[0,0,1.6])[1])<1,'the face stays in frame');
  assert.ok(frameOf('ms','dutch').warnings.some(w=>/no camera roll/.test(w)));
});
test('two people keep the reference camera side; over the shoulder and pov stand at the named person',()=>{
  const a=mina({position:[-1,0,0],rotationZDeg:90,gazeTarget:'jun'}),b={id:'jun',height:1.8,color:'#346cbe',position:[1,0,0],rotationZDeg:-90,gazeTarget:'mina'};
  // Facing each other along X: square to their line on the side the wide camera (y -5.8) stands.
  const two=frameOf('mfs','eye',[a,b],['mina','jun']).camera;
  assert.ok(two.position[1]<0&&Math.abs(two.position[0])<.01);
  for(const p of [[-1,0,1.6],[1,0,1.7]])assert.ok(Math.abs(project(two,p)[0])<1,'both in frame');
  const ots=frameOf('ots','over',[a,b],['mina','jun']).camera;
  assert.ok(ots.position[0]>1.3&&Math.abs(project(ots,[-1,0,1.58])[0])<.5,'behind jun, onto mina');
  // A single of mina while jun stands in front of her: the camera swings round her until he is out of the line to her face.
  const single=frameOf('fs','eye',[a,b],['mina']);
  assert.ok(single.warnings.some(w=>/turned \d+° round the subject so jun/.test(w)));
  const p=single.camera.position,t=Math.max(0,Math.min(1,((1-p[0])*(-1-p[0])+(0-p[1])*(0-p[1]))/((-1-p[0])**2+p[1]**2)));
  assert.ok(Math.hypot(p[0]+(-1-p[0])*t-1,p[1]-p[1]*t)>.3,'jun is off the line to her face');
  const pov=frameOf('pov','eye',[a,b],['jun']).camera;
  assert.ok(Math.abs(pov.position[0]+1)<.35&&Math.abs(pov.position[2]-1.58)<.05&&pov.target[0]===1,'from mina\'s eyes onto jun');
});
test('nobody blocked frames the set from the first camera\'s side and says the prompt places the cast',()=>{
  const {camera,warnings}=frameOf('ls','eye',[],['mina']);
  assert.ok(warnings.some(w=>/mina is not blocked/.test(w)));
  assert.ok(camera.position[1]<camera.target[1],'on the wide camera\'s side');
  assert.ok(camera.position[1]<-2.5,'the open south side lets the camera stand back');
  // A wall behind the camera's place brings it in short of the wall and widens the lens to keep the framing.
  const walled=frameOf('fs','eye',[mina({position:[-1,-1.5,0],rotationZDeg:-90})]);
  assert.ok(walled.camera.position[0]>-2.92&&walled.camera.lensMm<28&&walled.warnings.some(w=>/walls hold the camera/.test(w)));
  assert.ok(Math.abs(walled.camera.position[2]-1.581)<.01,'at the same eye height');
  assert.ok(project(walled.camera,[-1,-1.5,1.7])[1]<1&&project(walled.camera,[-1,-1.5,0])[1]>-1,'still head to toe');
});
test('shotFrame renders the set once per camera and reuses the render',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sf-shot-frame-'));
  const blender=process.env.BLENDER;
  try{
    // A stand-in Blender writes one PNG per camera and counts its runs.
    const fake=path.join(dir,'blender');
    fs.writeFileSync(fake,`#!/usr/bin/env node\nconst fs=require('fs'),path=require('path');const job=JSON.parse(fs.readFileSync(process.argv.at(-1),'utf8'));\nfs.appendFileSync(${JSON.stringify(path.join(dir,'runs'))},'x');for(const k of Object.keys(job.cameras))fs.writeFileSync(path.join(job.output,k+'.png'),JSON.stringify(job.cameras[k]));\n`,{mode:0o755});
    process.env.BLENDER=fake;
    const asset=path.join(dir,'set');fs.mkdirSync(asset);const m=structuredClone(spec);m.assets={};
    for(const [k,n] of [['blend','source.blend'],['glb','preview.glb']]){fs.writeFileSync(path.join(asset,n),k);m.assets[k]={path:n,sha256:L.fileHash(path.join(asset,n))};}
    fs.writeFileSync(path.join(asset,'location.json'),JSON.stringify(m));
    const board=path.join(dir,'storyboard');fs.mkdirSync(board);
    const win={FORMAT:'youtube-long-16x9',SCENES:[{id:'s0001',shot:{size:'cu'}}]};
    const ask=()=>L.shotFrame(win,0,board,{manifest:'../set/location.json',cast:['mina'],size:'cu',angle:'eye',width:1536,height:1024});
    const first=ask();
    assert.match(first.start.path,/^locations\/s0001-frame-[0-9a-f]{16}\/start\.png$/);
    assert.deepEqual([first.camera.width,first.camera.height],[1280,854]);   // the picture's 3:2, not the set camera's 16:9
    assert.ok(first.warnings.some(w=>/not blocked/.test(w))&&first.warnings.some(w=>/first state/.test(w)));
    ask();
    assert.equal(fs.readFileSync(path.join(dir,'runs'),'utf8'),'x');
    fs.writeFileSync(fake,'#!/bin/sh\nexit 3\n',{mode:0o755});
    assert.throws(()=>L.shotFrame(win,0,board,{manifest:'../set/location.json',cast:['mina'],size:'fs',angle:'eye',width:1536,height:1024}),/location_render_failed/);
  }finally{if(blender===undefined)delete process.env.BLENDER;else process.env.BLENDER=blender;fs.rmSync(dir,{recursive:true,force:true});}
});
