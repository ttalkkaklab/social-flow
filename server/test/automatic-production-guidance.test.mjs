import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const routing=require('../../skills/storyboard/references/render-routing.js');
const production=require('../../skills/storyboard/references/production-mode.js');
test('automatic still planning accepts omitted creative rationale and nondefault duration, but rejects unsupported effects',()=>{
 const shot={duration:9,visual:{camera:{speed:'fast'}},shot:{render:{mode:'still_camera',purpose:'portrait',camera:{effect:'push'}}}};
 const advice=[];
 assert.deepEqual(routing.checkScene(shot,{draft:true,advice}),[]);
 assert.ok(advice.some(x=>x.includes('reason')));
 assert.ok(advice.some(x=>x.includes('duration')));
 shot.shot.render.camera.effect='unimplemented';
 assert.ok(routing.checkScene(shot,{draft:true}).some(x=>x.includes('supported effect')));
});
test('creative episode repetition is advice, not a veto',()=>{
 const win={SCENES:[1,2,3].map(()=>({duration:10,shot:{render:{mode:'editorial_html',reason:'same reason'}}}))};
 const advice=[]; assert.deepEqual(routing.checkEpisode(win,{advice}),[]);
 assert.ok(advice.some(x=>x.includes('repeated render reason')));
});
test('style selection provenance is advisory while spending approval and unsupported provider remain blockers',()=>{
 const win={PRODUCTION:{mode:'no_video',videoBudgetUsd:0,maxAttempts:1,style:{preset:'webtoon'}},SCENES:[]};
 const advice=[]; assert.deepEqual(production.check(win,{draft:true,advice}),[]);
 assert.ok(advice.some(x=>x.includes('PRODUCTION.style.selection')));
 // A no_video board owes no spending approval (2026-10-18, like stills_only); a cost mode still does.
 assert.deepEqual(production.check(win,{draft:true,requireApproval:true}),[]);
 assert.ok(production.check({...win,PRODUCTION:{...win.PRODUCTION,mode:'video_50',renderRatioVersion:1,videoBudgetUsd:5}},{draft:true,requireApproval:true}).some(x=>x.includes('PRODUCTION.approval')));
 win.PRODUCTION.videoProvider='invented-provider';
 assert.ok(production.check(win,{draft:true}).some(x=>x.includes('videoProvider')));
});
test('non-draft video routing accepts omitted creative previz and camera phrasing',()=>{
 const shot={type:'points',duration:5,narration:[],shot:{render:{mode:'generated_video',purpose:'physical_state'}},visual:{camera:{movement:'gently drift around the room'},video:{clip:'existing.mp4'}}};
 const advice=[];
 assert.deepEqual(routing.checkScene(shot,{advice}),[]);
 assert.deepEqual(production.cameraErrors(shot,{advice}),[]);
 assert.ok(advice.some(x=>x.includes('previz')));
 assert.ok(advice.some(x=>x.includes('cannot see')));
 const win={PRODUCTION:{mode:'hybrid',videoProvider:'host',maxAttempts:1,videoBudgetUsd:0},SCENES:[shot]};
 assert.deepEqual(production.check(win,{advice}),[]);
 assert.ok(advice.some(x=>x.includes('previzRenderer')));
 win.PRODUCTION.previz={renderer:'unimplemented'};
 assert.ok(production.check(win).some(x=>x.includes('Unsupported PRODUCTION.previz.renderer')));
 shot.visual.video.cameraFixed=true;
 assert.ok(production.cameraErrors(shot).some(x=>x.includes('cameraFixed')));
 delete shot.visual.video;
 assert.ok(routing.checkScene(shot).some(x=>x.includes('video handoff')));
});
