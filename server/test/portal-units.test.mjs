import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const root=mkdtempSync(join(tmpdir(),'portal-units-'));
process.env.SNS_TOKEN_DIR=root;
for(const key of ['TTALKKAKSTORY_API_URL','TTALKKAKSTORY_WORKSPACE','TTALKKAKSTORY_API_KEY']) delete process.env[key];
mkdirSync(join(root,'test'));
writeFileSync(join(root,'test','ttalkkakstory.json'),JSON.stringify({apiUrl:'https://portal.test',workspace:'lab',apiKey:'tks_0123456789abcdefghijklmnopqrstuvwxyzABCDEF'}));
after(()=>rmSync(root,{recursive:true,force:true}));
const {editUnit}=await import('../dist/portal-unit-edit.js');
const {runPortalUnit}=await import('../dist/portal-unit-routes.js');
const {UNIT_TOOL_NAMES}=await import('../dist/portal-unit-tools.js');
const {TOOLS}=await import('../dist/tools.js');
const {ROUTES}=await import('../dist/handlers.js');
const ep='11111111-1111-4111-8111-111111111111';
const args=(patch={})=>({episodeId:ep,baseRevisionNo:3,draft:true,...patch});
const board=()=>({STORY:{review:{score:7},premise:'old'},MUSIC:{$mix:{LUFS:-16,dBTP:-1,LU:4},bed:{file:'music.mp3'}},STRUCTURE:{version:'structure-v1',sequences:[{id:'q1',title:'one',purpose:'one',scenes:[1,2]}],scenes:[{no:1,place:'a',time:'day',event:'a',charge:{open:'-',close:'+'},turn:'a'},{no:2,place:'b',time:'day',event:'b',charge:{open:'-',close:'+'},turn:'b'}]},SCENES:[{id:'s0001',type:'points',scene:1,narration:[{tts:'first',speaker:'n',portalTtsId:'keep'},{tts:'second'}],visual:{frames:{end:'keep'}},portalMedia:{video:'keep'},shot:{}},{id:'s0002',type:'points',scene:2,narration:[{tts:'third'}],shot:{}}]});
test('all unit tools are discoverable and routed once',()=>{for(const name of UNIT_TOOL_NAMES){assert.equal(TOOLS.filter(t=>t.name===name).length,1,name);assert.equal(typeof ROUTES[name],'function',name)}});
test('nested field updates preserve other teams media/review fields and do not mutate input',()=>{
 const input=board();
 const meta=editUnit(input,'episode_meta','update',args({key:'STORY',value:{premise:'new'}}));
 assert.equal(meta.board.STORY.review.score,7);assert.equal(input.STORY.premise,'old');
 const shot=editUnit(input,'shot','update',args({id:'s0001',value:{visual:{bgPrompt:'new'}}})).board.SCENES[0];
 assert.equal(shot.visual.frames.end,'keep');assert.equal(shot.portalMedia.video,'keep');
 const line=editUnit(input,'shot_narration','update',args({shotId:'s0001',index:0,value:{tts:'new'}})).board.SCENES[0].narration[0];
 assert.equal(line.portalTtsId,'keep');assert.equal(line.speaker,'n');
});
test('narration reorder is exact and scene delete needs explicit cascade',()=>{
 assert.throws(()=>editUnit(board(),'shot_narration','reorder',args({shotId:'s0001',order:[0,0]})),/every/);
 const out=editUnit(board(),'shot_narration','reorder',args({shotId:'s0001',order:[1,0]}));assert.equal(out.board.SCENES[0].narration[0].tts,'second');
 assert.throws(()=>editUnit(board(),'scene','delete',args({no:1})),/cascade/);
 const deleted=editUnit(board(),'scene','delete',args({no:1,cascade:true}));assert.deepEqual(deleted.board.SCENES.map(s=>s.id),['s0002']);assert.deepEqual(deleted.board.STRUCTURE.sequences[0].scenes,[2]);
});
test('reorder remaps eyeline relation and refuses removal of referenced targets',()=>{
 const input=board();input.SCENES[1].shot.eyeline={matchShot:1};
 const out=editUnit(input,'shot','reorder',args({order:['s0002','s0001']}));assert.equal(out.board.SCENES[0].shot.eyeline.matchShot,2);
 assert.throws(()=>editUnit(input,'shot','delete',args({id:'s0001'})),/eyeline/);
});
test('transition input shares producer vocabulary and duration bounds',()=>{
 for(const value of [{transition:'fade',reason:'x'},{transition:'dip',transitionSeconds:.2,reason:'x'},{transition:'jcut',transitionSeconds:9,reason:'x'}])assert.throws(()=>editUnit(board(),'shot_transition','update',args({shotId:'s0002',value})));
});
test('stale base and checker failure never send writes; read returns revision',async()=>{
 const calls=[];const state=board();
 const fetch=async(url,init={})=>{calls.push(init.method??'GET');if(url.includes('/api/token'))return Response.json({success:true,data:{workspaceSlug:'lab',workspaceName:'Lab',role:'member'}});return Response.json({success:true,data:{id:ep,headRevisionNo:3,stage:'board',meta:state,characters:[{id:'n',tts:{engine:'elevenlabs',voiceId:'v'}}],narratorCharacterId:'n',scenes:state.SCENES.map(extra=>({extra})),documents:[]}})};
 const stale=await runPortalUnit('portal_shot_update',{...args({id:'s0001',value:{title:'changed'},baseRevisionNo:2}),channel:'test'},fetch);assert.equal(stale.isError,true);assert.match(stale.content[0].text,/head_moved/);
 const invalid=await runPortalUnit('portal_shot_update',{...args({id:'s0001',value:{type:'invalid'}}),channel:'test'},fetch);assert.equal(invalid.isError,true);
 const read=await runPortalUnit('portal_shot_get',{episodeId:ep,id:'s0001',channel:'test'},fetch);assert.equal(read.isError,false);assert.equal(JSON.parse(read.content[0].text).headRevisionNo,3);
 assert.ok(calls.every(method=>method==='GET'));
});

test('narration insertion/deletion and explicit parent transfers preserve surviving records',()=>{
 const input=board();
 const added=editUnit(input,'shot_narration','create',args({shotId:'s0001',index:1,value:{tts:'inserted'}}));
 assert.equal(added.board.SCENES[0].narration[1].tts,'inserted');
 const deleted=editUnit(added.board,'shot_narration','delete',args({shotId:'s0001',index:1}));
 assert.deepEqual(deleted.board.SCENES[0].narration,input.SCENES[0].narration);
 const moved=editUnit(input,'sequence','create',args({moveScenes:true,value:{id:'q2',title:'two',purpose:'two',scenes:[2]}}));
 assert.deepEqual(moved.board.STRUCTURE.sequences[0].scenes,[1]);
 const restored=editUnit(moved.board,'sequence','delete',args({id:'q2',targetSequenceId:'q1'}));
 assert.deepEqual(restored.board.STRUCTURE.sequences[0].scenes,[1,2]);
 assert.equal(restored.board.SCENES.length,2);
 assert.throws(()=>editUnit(input,'shot','delete',args()),/id is required/);
});
