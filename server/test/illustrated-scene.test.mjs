import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {sample,mount}=require('../../skills/storyboard/references/illustrated-scene-runtime.js');
test('illustrated motion is bounded, rests at endpoints and does not depend on seek order',()=>{
  const c={joints:[{region:[.3,.4,.1,.2],angle:.02,dy:.005,breath:.001,start:2,duration:3}]};
  const before=sample(c,0,10), middle=sample(c,3,10), end=sample(c,10,10);
  sample(c,8,10);sample(c,1,10);assert.deepEqual(sample(c,3,10),middle);
  assert.deepEqual(sample(c,-5,10),before);assert.deepEqual(sample(c,100,10),end);
  assert.equal(before.joints[0].delta[2],0);assert.equal(end.joints[0].delta[2],.02);
  for(let t=0;t<=10;t+=.05){const s=sample(c,t,10);assert.ok(s.zoom>=1.025&&s.zoom<=1.05);assert.ok(Math.abs(s.joints[0].delta[1])<=.007);}
});
test('illustrated motion rejects missing pictures, unbounded time and rubber-like large transforms',()=>{
  const image={complete:true,naturalWidth:1024};
  const canvas={getContext(){throw Error('unexpected GL initialization')}};
  assert.throws(()=>mount(canvas,{complete:false},{duration:10}),/not decoded/);
  for(const duration of [Infinity,NaN,-1,0])assert.throws(()=>mount(canvas,image,{duration}),/timeline/);
  for(const delta of [{angle:.2},{dx:.1},{dy:.1},{breath:.01},{angle:NaN},{duration:0}])
    assert.throws(()=>mount(canvas,image,{duration:10,joints:[{region:[.3,.4,.1,.2],...delta}]}),/limit|parameter|duration/);
});
