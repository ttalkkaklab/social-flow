import {test} from 'node:test';import assert from 'node:assert/strict';
import contract from '../../skills/storyboard/references/animation-review-contract.cjs';
import {buildSet} from '../animation-review-runtime.mjs';
import {createRequire} from 'node:module';
const camera=createRequire(import.meta.url)('../../skills/storyboard/references/still-camera.js');
const sample={id:'sample',lane:'object_explanation',template:'gears',title:'기어',caption:'회전 전달',intent:'관계 설명',duration:8,labels:['입력','출력']};
test('review contract distinguishes the three lanes and refuses duplicate ids',()=>{
 const plan={version:1,mode:'animation-review',clips:[sample]};assert.deepEqual(contract.validate(plan),[]);
 assert.ok(contract.validate({...plan,clips:[{...sample,lane:'still_camera'}]}).some(e=>e.includes('template')));
 assert.ok(contract.validate({...plan,clips:[sample,sample]}).some(e=>e.includes('unique')));
 assert.ok(contract.validate({...plan,mode:'episode'}).length);
});
test('gears maintain opposite 2:1 rotation through arbitrary seeks',()=>{
 const set=buildSet('gears'),a=set.scene.getObjectByName('driver'),b=set.scene.getObjectByName('driven');
 for(const t of [0,7,2,8,3.25,3.25]){set.animate(t);assert.ok(Math.abs(a.rotation.z+2*(b.rotation.z-Math.PI/32))<1e-12)}
 set.animate(0);assert.equal(a.rotation.z,0);set.animate(8);assert.ok(Math.abs(a.rotation.z-4*Math.PI)<1e-12);
});
test('fixed pulley conserves straight rope length and opposing displacement',()=>{
 const set=buildSet('pulley'),load=set.scene.getObjectByName('load'),handle=set.scene.getObjectByName('pullHandle'),left=set.scene.getObjectByName('leftRope'),right=set.scene.getObjectByName('rightRope');
 let sum,ends;for(const t of [0,4,8,1,4]){set.animate(t);sum??=left.scale.y+right.scale.y;ends??=load.position.y+handle.position.y;assert.ok(Math.abs(left.scale.y+right.scale.y-sum)<1e-12);assert.ok(Math.abs(load.position.y+handle.position.y-ends)<1e-12);assert.ok(left.scale.y>0&&right.scale.y>0)}
});
test('case lid turns about the fixed hinge and seeks restore its state',()=>{
 const set=buildSet('hinge'),lid=set.scene.getObjectByName('lid'),p=lid.position.clone();set.animate(8);assert.ok(lid.rotation.x<-1.5);assert.deepEqual(lid.position.toArray(),p.toArray());set.animate(0);assert.ok(Math.abs(lid.rotation.x)<1e-12);
});
test('contact actions keep hands attached during manipulation and rewind deterministically',()=>{
 for(const kind of ['alliance','document','supply']){
  const set=buildSet(kind);let count=0;
  for(let t=0;t<=8;t+=.1){set.animate(t);set.scene.updateMatrixWorld(true);for(const c of set.contactDiagnostics()){assert.ok(c.error<1e-6,kind+' '+t+' '+JSON.stringify(c));count++}}
  assert.ok(count>20);
  const snapshot=t=>{set.animate(t);set.scene.updateMatrixWorld(true);const a=[];set.scene.traverse(o=>{if(!o.isMesh)a.push([o.name,o.position.toArray(),o.quaternion.toArray(),o.visible])});return a};
  const initial=snapshot(0),middle=snapshot(3.8);assert.notDeepEqual(initial,middle);snapshot(8);assert.deepEqual(snapshot(3.8),middle);assert.deepEqual(snapshot(0),initial);
 }
});
test('stamp ink appears after contact and disappears when seeking before contact',()=>{
 const set=buildSet('document'),ink=set.scene.getObjectByName('stampImprint'),stamp=set.scene.getObjectByName('stamp');
 set.animate(4.2);assert.ok(ink.visible);assert.ok(Math.abs(stamp.position.y-1.268)<1e-6);
 set.animate(3.8);assert.equal(ink.visible,false);
});
test('camera purposes require actual focus regions and layered moves require assets',()=>{
 const c={...sample,lane:'still_camera',image:'image.png',template:'rack-focus',purpose:'inspect',focusFrom:[.3,.6,.1,.1],focusTo:[.3,.4,.1,.1]};
 const plan=clip=>({version:1,mode:'animation-review',clips:[clip]});
 assert.deepEqual(contract.validate(plan(c)),[]);
 assert.ok(contract.validate(plan({...c,focusFrom:undefined})).length);
 assert.ok(contract.validate(plan({...c,purpose:'introduce'})).length);
 assert.ok(contract.validate(plan({...c,purpose:'depth',template:'parallax'})).length);
 assert.deepEqual(contract.validate(plan({...c,purpose:'depth',template:'parallax',layers:[{image:'foreground.png',depth:.6}]})),[]);
 assert.equal(camera.state(c,0).focus,0);assert.equal(camera.state(c,8).focus,1);
 const middle=camera.state(c,3.7);camera.state(c,8);assert.deepEqual(camera.state(c,3.7),middle);
 assert.deepEqual(camera.state(c,-1),camera.state(c,0));
});
test('annotations default off and require a reason with nonoverlapping short windows',()=>{
 const plan=clip=>({version:1,mode:'animation-review',clips:[clip]});
 assert.deepEqual(contract.validate(plan({...sample,labels:undefined})),[]);
 const annotation={target:0,text:'입력',reason:'회전 수 비교',start:1,end:3};
 assert.deepEqual(contract.validate(plan({...sample,annotations:[annotation]})),[]);
 for(const annotations of [[{...annotation,end:8}],[annotation,{...annotation,target:1}],[{...annotation,reason:''}],null])assert.ok(contract.validate(plan({...sample,annotations})).length);
 assert.ok(contract.validate(plan({...sample,lane:'character_explanation',template:'alliance',annotations:[annotation]})).length);
});
