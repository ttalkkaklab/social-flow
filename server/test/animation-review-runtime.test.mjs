import {test} from 'node:test';import assert from 'node:assert/strict';
import contract from '../../skills/storyboard/references/animation-review-contract.cjs';
import {createRequire} from 'node:module';
const camera=createRequire(import.meta.url)('../../skills/storyboard/references/still-camera.js');
const sample={id:'sample',lane:'object_explanation',template:'gears',title:'기어',caption:'회전 전달',intent:'관계 설명',duration:8,labels:['입력','출력']};
test('review contract distinguishes the three lanes and refuses duplicate ids',()=>{
 const plan={version:1,mode:'animation-review',clips:[sample]};assert.deepEqual(contract.validate(plan),[]);
 assert.ok(contract.validate({...plan,clips:[{...sample,lane:'still_camera'}]}).some(e=>e.includes('template')));
 assert.ok(!contract.validate({...plan,clips:[{...sample,lane:'still_camera',template:'hold'}]}).some(e=>e.includes('template')));
 assert.ok(contract.validate({...plan,clips:[sample,sample]}).some(e=>e.includes('unique')));
 assert.ok(contract.validate({...plan,mode:'episode'}).length);
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
