import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
const {framePlan,checkFrames}=require('../../skills/storyboard/references/render-routing.js');
const {scenePlan}=require('../../skills/produce/references/seedance-route.js');
const {signature}=require('../../skills/storyboard/references/production-mode.js');
const shot=()=>({type:'points',duration:5,visual:{bg:'images/start.png',frames:{mode:'first_last',reason:'Arrive at the doorway.',endState:'The same figure stands at the threshold.',end:'images/end.png'},video:{engine:'seedance',model:'seedance-1-5-pro-251215',generateAudio:false}}});
test('conditional frames preserve legacy images and forward the actual end image',()=>{
 assert.equal(framePlan({visual:{bg:'a.png'}}).mode,'first');
 const s=shot();assert.deepEqual(checkFrames(s),[]);assert.equal(scenePlan(s).lastImagePath,s.visual.frames.end);
 delete s.visual.frames.end;assert.deepEqual(checkFrames(s,{draft:true}),[]);assert.match(checkFrames(s).join(' '),/both start and end/);assert.throws(()=>scenePlan(s),/both start and end/);
});
test('contradictory frame inputs and unsupported end-frame models cannot generate',()=>{
 const s=shot();s.visual.video.lastImagePath='different.png';assert.throws(()=>scenePlan(s),/disagree/);
 delete s.visual.video.lastImagePath;s.visual.frames.mode='first';assert.throws(()=>scenePlan(s),/first-only/);
 s.visual.frames.mode='first_last';s.visual.frames.end=s.visual.bg;assert.throws(()=>scenePlan(s),/distinct/);
 s.visual.frames.end='images/end.png';s.visual.video.model='seedance-1-0-pro-fast-251015';s.visual.video.modelReason='fixture';assert.throws(()=>scenePlan(s),/supported image-to-video/);
});
test('frame edits stale approval and the browser uses the same plan contract',()=>{
 const w={SCENES:[shot()]};const before=signature(w);w.SCENES[0].visual.frames.endState='Different arrival';assert.notEqual(signature(w),before);
 const ctx={window:{}};vm.runInNewContext(fs.readFileSync(new URL('../../skills/storyboard/references/render-routing.js',import.meta.url),'utf8'),ctx);
 assert.equal(ctx.window.RENDER_ROUTING.framePlan(shot()).end,'images/end.png');
 const html=fs.readFileSync(new URL('../../skills/storyboard/references/storyboard-html-template.html',import.meta.url),'utf8');
 assert.match(html,/has-frame-pair/);assert.match(html,/이미지 생성 예정/);assert.match(html,/window.RENDER_ROUTING.framePlan\(s\)/);
});
