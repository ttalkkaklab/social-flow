import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const {checkRecipe, sampleRecipe, poseFor} = require('../../skills/storyboard/references/mesh-contract.js');
const {checkQuality} = require('../../skills/storyboard/references/slide-quality.js');
const recipe = () => ({version:1, style:'illustration3d', camera:{position:[3,2,5],target:[0,0,0],fov:35},
  nodes:[{id:'hinge'}, {id:'lid',parent:'hinge',geometry:{type:'roundedBox',size:[2,.2,1]}}],
  states:[{pose:{hinge:{rotation:[0,0,0]}}},{pose:{hinge:{rotation:[0,0,70]}}},{pose:{hinge:{rotation:[0,0,20]}}}],
  groups:[{group:1,durationMs:3000,ease:'smoother'},{group:2,durationMs:3000,ease:'smoother'}]});
test('mesh planning admits 3D styles without legacy bake keys', () => {
  const s={kind:'diagram',treatment:'editorial',quality:'object-state-v1',
    subject:{kind:'object',changes:[{group:1,before:'closed',after:'open',driver:'articulation'}]},
    object:{renderer:'mesh',style:'illustration3d',file:'slides/assets/s2-box.json',plan:'hinge lifts lid'}};
  assert.deepEqual(checkQuality(s,1),[]);
  s.object.file='https://example.com/model.glb'; assert.match(checkQuality(s,1).join(),/object.file/);
});
test('recipe rejects missing actors, unsafe assets, fake photoreal and static changes', () => {
  assert.deepEqual(checkRecipe(recipe(),2),[]);
  for(const source of ['../model.glb','https://host/model.glb','/model.glb','a.gltf']) {
    const r=recipe(); r.nodes[0].source=source; assert.match(checkRecipe(r).join(),/local GLB/);
  }
  const r=recipe(); r.style='photoreal3d'; assert.match(checkRecipe(r).join(),/imported GLB/);
  r.style='illustration3d'; r.states[1]=structuredClone(r.states[0]); assert.match(checkRecipe(r).join(),/unchanged/);
  r.states[1]={pose:{missing:{position:[1,2,3]}}}; assert.match(checkRecipe(r).join(),/unknown target/);
  r.states[1]={pose:{lid:{scale:[0,1,1]}}}; assert.match(checkRecipe(r).join(),/positive/);
});
test('seek endpoints are continuous and independent of visit order', () => {
  const r=recipe();
  const end=sampleRecipe(r,1,1), start=sampleRecipe(r,2,0);
  assert.deepEqual(end.to,start.from); assert.equal(end.u,1); assert.equal(start.u,0);
  const mid=sampleRecipe(r,1,.5); sampleRecipe(r,2,1); sampleRecipe(r,0,0);
  assert.deepEqual(sampleRecipe(r,1,.5),mid); assert.equal(mid.u,.5);
  assert.deepEqual(poseFor(r,{pose:{}},'lid').scale,[1,1,1]);
  assert.equal(sampleRecipe(r,1,-1).u,0); assert.equal(sampleRecipe(r,99,0).u,1);
});
test('scene lighting accepts bounded art direction and rejects invalid render values',()=>{
  const r=recipe();r.lighting={exposure:.8,environment:.25,key:1.8,fill:.2,rim:.4,shadowOpacity:.5,keyColor:'#ffd5a3',keyPosition:[-4,5,2]};
  assert.deepEqual(checkRecipe(r,2),[]);
  for(const change of [{exposure:Infinity},{key:-1},{shadowOpacity:2},{keyColor:'invalid'},{keyPosition:[0,0,0]}]){
    const copy=structuredClone(r);Object.assign(copy.lighting,change);assert.match(checkRecipe(copy).join(),/lighting/);
  }
});
test('physical actions can occupy a bounded part of narration without breaking the seam',()=>{
  const r=recipe();r.groups[0].motionWindow=[.2,.7];
  assert.equal(sampleRecipe(r,1,.1).u,0);assert.equal(sampleRecipe(r,1,.8).u,1);
  assert.ok(Math.abs(sampleRecipe(r,1,.45).u-.5)<1e-10);
  assert.deepEqual(sampleRecipe(r,1,1).to,sampleRecipe(r,2,0).from);
  r.groups[0].motionWindow=[.8,.2];assert.match(checkRecipe(r).join(),/motionWindow/);
});
