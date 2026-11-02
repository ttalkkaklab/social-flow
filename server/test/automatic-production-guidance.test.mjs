import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const production=require('../../skills/storyboard/references/production-mode.js');
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
