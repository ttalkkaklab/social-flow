import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
const require=createRequire(import.meta.url);
const review=require('../../skills/storyboard/references/video-production.js');

test('offline generation icons follow the request adapter and subject inputs', () => {
 const adapters=require('../../skills/_shared/video-catalog.json').adapters;
 const mode=(tool,inputs)=>review.generationMode({engine:'astra-genai',operation:'text'},tool,inputs,adapters);
 assert.equal(mode('astra_genai_img2video',[{imagePath:'face.png'}]),'MSR');
 assert.equal(mode('astra_genai_img2video',[{imagePath:'place.png',background:true}]),'I2V');
 assert.equal(mode('astra_genai_msr',[]),'MSR');
 assert.equal(mode('astra_genai_audio2video',[]),'A2V');
 assert.equal(mode('astra_genai_text2video',[]),'T2V');
 assert.equal(mode('seedance_reference',[]),'reference');
 assert.equal(review.generationMode(null,null,[]),null);
});

test('an ungrouped silent shot displays the canonical image route even in a reference project', t => {
 const episode=fs.mkdtempSync(path.join(os.tmpdir(),'offline-shot-mode-'));
 t.after(()=>fs.rmSync(episode,{recursive:true,force:true}));
 const dir=path.join(episode,'storyboard');
 fs.mkdirSync(dir);
 const board={PRODUCTION:{videoModel:{engine:'astra-genai',model:'ltx-2.5-22b-distilled',operation:'reference',resolution:'720x1280'}},
  SCENES:[{id:'silent',duration:2,narration:[],shot:{render:{mode:'generated_video'}},visual:{frames:{mode:'first',start:'start.png'}}},
   {id:'old-quote',type:'quote',duration:2,narration:[{delivery:'on_screen',speaker:'actor',tts:'Hi'}],visual:{clip:{prompt:'A greeting.'}}}]};
 fs.writeFileSync(path.join(dir,'scenes.js'),Object.entries(board).map(([key,value])=>'window.'+key+'='+JSON.stringify(value)+';').join('\n'));
 assert.deepEqual(review.read(dir,board).shotModes,{silent:'I2V','old-quote':'MSR'});
});

test('local review preserves ambiguous jobs and strips provider secrets; export and rendering escape authored text',t=>{
 const episode=fs.mkdtempSync(path.join(os.tmpdir(),'sf-production-'));
 t.after(()=>fs.rmSync(episode,{recursive:true,force:true}));
 const board=path.join(episode,'storyboard'),store=path.join(episode,'.work/video-routing');
 fs.mkdirSync(board,{recursive:true});fs.mkdirSync(path.join(store,'plans'),{recursive:true});
 fs.writeFileSync(path.join(board,'scenes.js'),'window.SCENES=[{id:"s0001"}];');
 const id='a'.repeat(64),output=path.join(episode,'take.mp4');
 const plan={id,episode,tool:'astra_genai_img2video',shotId:'s0001',requestId:'a',args:{prompt:'</script><img src=x onerror=alert(1)>',apiKey:'never-export-this',outputPath:episode,filename:'take.mp4'},selection:{engine:'astra-genai'},inputs:{},quote:{reserveUsd:0,basis:'local'}};
 fs.writeFileSync(path.join(store,'plans',id+'.json'),JSON.stringify(plan));
 fs.writeFileSync(output+'.astra-genai.json',JSON.stringify({baseUrl:'http://user:secret@localhost:18081/?apiKey=hidden',status:'submitted',jobId:'provider-job'}));
 fs.writeFileSync(path.join(store,'state.json'),JSON.stringify({jobs:{a:{planId:id,requestId:'a',shotId:'s0001',status:'submission_unknown',tool:'astra_genai_img2video',reserveUsd:0}}}));
 const report=review.read(board);
 assert.equal(report.summary.completedShots,0);assert.equal(report.summary.unknownRequests,1);
 const c=report.candidates[0];assert.equal(c.endpoint,'http://localhost:18081');assert.equal(c.clip,null);
 assert.equal(c.recovery.action,'refresh');assert.equal(c.recovery.requestId,'a');
 assert.doesNotMatch(JSON.stringify(report),/never-export-this|apiKey=hidden|user:secret/);
 review.write(episode);
 const script=fs.readFileSync(path.join(board,'video-production-data.js'),'utf8');
 assert.doesNotMatch(script,/<\/script>/);assert.match(script,/\\u003c/);
 const html=review.render(report,'s0001','en');
 assert.doesNotMatch(html,/<img src=x/);assert.match(html,/&lt;img/);
 c.sceneNo=2; c.shotIds=['s0001','s0002']; c.clip='take.mp4';
 assert.match(review.render(report,null,'en',2),/<video/);
 assert.doesNotMatch(review.render(report,null,'en',2),/attach_video/);
 assert.equal(review.render(report,'s0001','en'),'');
 delete c.sceneNo;
 c.clip='javascript:alert(1)';assert.doesNotMatch(review.render(report,'s0001','en'),/<video/);
 fs.writeFileSync(path.join(store,'plans','b'.repeat(64)+'.json'),'broken');
 assert.equal(review.read(board).warnings.length,1);
 const stateFile=path.join(store,'state.json'),state=JSON.parse(fs.readFileSync(stateFile));
 Object.assign(state.jobs.a,{providerId:'provider-job',observedAt:'2026-01-02T03:04:05Z'});
 for (const [remote,label] of [['pending','Queued by provider'],['processing','Generating on provider']]) {
  state.jobs.a.providerStatus=remote;
  fs.writeFileSync(stateFile,JSON.stringify(state));
  const observed=review.read(board);
  assert.equal(observed.candidates[0].status,'submission_unknown');
  assert.deepEqual([observed.summary.pendingRequests,observed.summary.unknownRequests],[1,0]);
  assert.ok(review.render(observed,'s0001','en').includes(label));
 }
 state.jobs.a.status='failed';
 fs.writeFileSync(stateFile,JSON.stringify(state));
 assert.match(review.render(review.read(board),'s0001','en'),/ · Failed<\/h4>/);
});

test('canonical reviews keep completed remote history and recognise a separately edited shot',t=>{
 const episode=fs.mkdtempSync(path.join(os.tmpdir(),'sf-edit-history-'));
 t.after(()=>fs.rmSync(episode,{recursive:true,force:true}));
 const board=path.join(episode,'storyboard'),store=path.join(episode,'.work/video-routing');
 const relative='.work/render',root=path.join(episode,relative),archive=path.join(root,'.work/video-routing');
 fs.mkdirSync(board);fs.mkdirSync(store,{recursive:true});fs.mkdirSync(path.join(archive,'plans'),{recursive:true});
 fs.writeFileSync(path.join(store,'archives.json'),JSON.stringify([relative,relative,'../another-episode']));
 const id='e'.repeat(64);
 fs.writeFileSync(path.join(archive,'plans',id+'.json'),JSON.stringify({id,episode:root,shotId:'s1',requestId:'render',args:{outputPath:root,filename:'take.mp4'},inputs:{}}));
 fs.writeFileSync(path.join(archive,'state.json'),JSON.stringify({jobs:{render:{planId:id,status:'completed',settledUsd:1}}}));
 fs.writeFileSync(path.join(root,'take.mp4'),'provider source');
 fs.writeFileSync(path.join(episode,'edit.mp4'),'trimmed picture');
 const win={SCENES:[{id:'s1',visual:{video:{clip:'../edit.mp4'}},productionPlan:{cuts:[null,{kind:'generated_video',path:'../edit.mp4'}]}}]};
 const result=review.read(board,win);
 assert.equal(result.candidates.length,1);assert.equal(result.candidates[0].selected,false);
 assert.equal(result.candidates[0].clip,'../.work/render/take.mp4');
 assert.equal(result.summary.attachedShots,1);assert.equal(result.summary.reservedOrSpentUsd,1);
 assert.equal(result.summary.completedShots,1);assert.equal(result.summary.reviewedShots,0);
 const liveId='1'.repeat(64),revisionId='2'.repeat(64);
 fs.mkdirSync(path.join(store,'plans'));
 const live={id:liveId,episode,shotId:'s1',requestId:'render',args:{prompt:'live take'},inputs:{}};
 fs.writeFileSync(path.join(store,'plans',liveId+'.json'),JSON.stringify(live));
 fs.writeFileSync(path.join(store,'state.json'),JSON.stringify({jobs:{render:{planId:liveId,status:'completed',settledUsd:2}}}));
 fs.writeFileSync(path.join(archive,'plans',revisionId+'.json'),JSON.stringify({id:revisionId,episode:root,shotId:'s1',requestId:'revision',basedOnRequestId:'render',args:{},inputs:{}}));
 fs.writeFileSync(path.join(archive,'state.json'),JSON.stringify({jobs:{render:{planId:id,status:'completed',settledUsd:1},revision:{planId:revisionId,status:'completed',settledUsd:3}}}));
 const combined=review.read(board,win);
 assert.equal(combined.candidates.length,3);assert.equal(combined.summary.reservedOrSpentUsd,6);
 assert.deepEqual(combined.candidates.find(c=>c.planId===revisionId).changes,[]);
 fs.writeFileSync(path.join(archive,'state.json'),JSON.stringify({jobs:{render:{planId:id,status:'submission_unknown'}}}));
 assert.deepEqual(review.read(board,win).candidates.map(c=>c.planId),[liveId]);
 const scenePlan={id,episode:root,sceneNo:1,shotId:'s1',shotIds:['s1'],requestId:'render',args:{},inputs:{}};
 fs.writeFileSync(path.join(archive,'plans',id+'.json'),JSON.stringify(scenePlan));
 const observed=review.read(board,{SCENES:win.SCENES.map(card=>({...card,scene:1}))});
 assert.equal(observed.candidates.find(c=>c.planId===id).recovery.episode,root);
 assert.equal(observed.summary.pendingRequests,1);
});

test('a scene moved by a split keeps its take and receipt; the old combined scene stays in history',t=>{
 const ep=fs.mkdtempSync(path.join(os.tmpdir(),'sf-scene-numbers-'));t.after(()=>fs.rmSync(ep,{recursive:true,force:true}));
 const board=path.join(ep,'storyboard'),store=path.join(ep,'.work/video-routing');
 fs.mkdirSync(board);fs.mkdirSync(path.join(store,'plans'),{recursive:true});
 const original='a'.repeat(64),moved='b'.repeat(64);
 const plan=(id,sceneNo,shotIds)=>({id,episode:ep,requestId:id,sceneNo,shotId:shotIds[0],shotIds,args:{prompt:'A full take.',outputPath:ep,filename:id+'.mp4'},inputs:{}});
 for(const p of [plan(original,1,['s1','s2']),plan(moved,2,['s3','s4'])]){
  fs.writeFileSync(path.join(store,'plans',p.id+'.json'),JSON.stringify(p));
  fs.writeFileSync(path.join(ep,p.id+'.mp4'),'fixture');
 }
 fs.writeFileSync(path.join(store,'state.json'),JSON.stringify({jobs:Object.fromEntries([original,moved].map(id=>[id,{planId:id,status:'completed'}]))}));
 fs.writeFileSync(path.join(store,'approvals.json'),JSON.stringify({plans:{[moved]:{at:'2026-01-02'}}}));
 const shots=[{id:'s1',scene:1},{id:'s2',scene:2},{id:'s3',scene:3},{id:'s4',scene:3}];
 const r=review.read(board,{SCENES:shots});
 assert.equal(r.candidates.find(c=>c.planId===original).historicalScene,true);
 const take=r.candidates.find(c=>c.planId===moved);
 assert.deepEqual([take.sceneNo,take.submittedSceneNo,take.requestId],[3,2,moved]);
 assert.equal(r.sceneApprovals[3].planId,moved);
 assert.doesNotMatch(review.render(r,null,'en',1),/<video/);
 assert.doesNotMatch(review.render(r,null,'en',2),/<video/);
 assert.match(review.render(r,null,'en',3),/<video/);
 assert.equal(JSON.parse(fs.readFileSync(path.join(store,'plans',moved+'.json'))).sceneNo,2);
});

test('background snapshots distinguish unchecked review evidence from zero passed reviews',t=>{
 const episode=fs.mkdtempSync(path.join(os.tmpdir(),'sf-reviewed-'));
 t.after(()=>fs.rmSync(episode,{recursive:true,force:true}));
 const board=path.join(episode,'storyboard'),store=path.join(episode,'.work/video-routing');
 fs.mkdirSync(board,{recursive:true});fs.mkdirSync(path.join(store,'plans'),{recursive:true});
 const bytes=Buffer.from('reviewed fixture'),id='b'.repeat(64);
 fs.writeFileSync(path.join(episode,'take.mp4'),bytes);
 fs.writeFileSync(path.join(board,'scenes.js'),'window.SCENES='+JSON.stringify([{id:'s1',visual:{video:{clip:'../take.mp4',speechBinding:{videoSha256:createHash('sha256').update(bytes).digest('hex'),quality:{review:'pass'}}}}}])+';');
 fs.writeFileSync(path.join(store,'plans',id+'.json'),JSON.stringify({id,episode,shotId:'s1',requestId:'r1',args:{outputPath:episode,filename:'take.mp4'},inputs:{}}));
 fs.writeFileSync(path.join(store,'state.json'),JSON.stringify({jobs:{r1:{planId:id,status:'completed'}}}));
 assert.equal(review.read(board).summary.reviewedShots,1);
 review.write(episode);
 const snapshot=JSON.parse(fs.readFileSync(path.join(board,'video-production-data.js'),'utf8').slice('window.VIDEO_PRODUCTION = '.length,-2));
 assert.equal(snapshot.summary.reviewedShots,null);
 assert.equal(snapshot.candidates[0].review,'unverified');
 assert.match(review.renderSummary(snapshot,'ko'),/검수 통과 미확인/);
 fs.writeFileSync(path.join(episode,'take.mp4'),'changed bytes');
 assert.equal(review.read(board).summary.reviewedShots,0);
});

test('scene playback matches the complete ordered group and prefers its edited delivery',()=>{
 const ids=['one','two'],stored={shots:ids,path:'video/mixed.mp4'};
 const take={sceneNo:4,shotIds:ids,selected:true,status:'completed',clip:'video/original.mp4'};
 const report={candidates:[take]};
 assert.equal(review.scenePlayback(report,stored,4,ids),stored.path);
 assert.equal(review.scenePlayback(report,undefined,4,ids),take.clip);
 assert.equal(review.scenePlayback(report,stored,4,['two','one']),undefined);
 assert.equal(review.scenePlayback({candidates:[{...take,historicalScene:true}]},null,4,ids),undefined);
});
