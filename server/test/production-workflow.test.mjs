import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { manageWorkflow, requireWorkflow } from '../dist/production-workflow.js';
import { planVideo } from '../dist/video-routing.js';
import { planImage, executeImage } from '../dist/image-routing.js';
import { setupProject, completeWorkflow, png } from './workflow-fixture.mjs';
function fixture(t) {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'workflow-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const episode=path.join(root,'data/c/episodes/e');fs.mkdirSync(episode,{recursive:true});
 return {root,episode,call:args=>manageWorkflow({episode,...args})};
}
test('setup and sequential stages are required; missing and corrupt media cannot complete a stage',t=>{
 const f=fixture(t);
 assert.throws(()=>f.call({action:'begin',stage:'characters',entries:[]}),/project_setup_required/);
 setupProject(f.root);
 assert.throws(()=>f.call({action:'begin',stage:'props',entries:[]}),/out_of_order/);
 assert.throws(()=>planVideo({episode:f.episode,shotId:'s1',requestId:'a',args:{}}),/out_of_order/);
 assert.throws(()=>planImage({directory:f.episode,assetId:'hero',requestId:'a',args:{}}),/out_of_order/);
 fs.writeFileSync(path.join(f.episode,'hero.md'),'Character identity');
 f.call({action:'begin',stage:'characters',entries:[{id:'hero',text:'hero.md',image:'hero.png'}]});
 requireWorkflow(f.episode,'image','hero',path.join(f.episode,'hero.png'));
 assert.throws(()=>requireWorkflow(f.episode,'image','other'),/out_of_order/);
 assert.throws(()=>requireWorkflow(f.episode,'image','hero',path.join(f.episode,'wrong.png')),/output_mismatch/);
 assert.throws(()=>f.call({action:'complete',stage:'characters'}));
 fs.writeFileSync(path.join(f.episode,'hero.png'),'not an image');
 assert.throws(()=>f.call({action:'complete',stage:'characters'}),/image_invalid/);
 fs.writeFileSync(path.join(f.episode,'hero.png'),png);
 f.call({action:'complete',stage:'characters'});
 assert.equal(f.call({action:'status'}).next,'text_storyboard');
 requireWorkflow(f.episode,'text');
});
test('completed artifacts permit video; changes and rewind invalidate downstream work',t=>{
 const f=fixture(t);setupProject(f.root);completeWorkflow(f.episode);
 requireWorkflow(f.episode,'video');
 fs.appendFileSync(path.join(f.episode,'workflow/text_storyboard.md'),' revised dialogue');
 assert.throws(()=>requireWorkflow(f.episode,'video'),/workflow_stale/);
 const state=f.call({action:'rewind',stage:'text_storyboard'});
 assert.equal(state.completed.length,1);assert.equal(state.next,'text_storyboard');
 assert.throws(()=>requireWorkflow(f.episode,'video'),/out_of_order/);
 assert.ok(fs.existsSync(path.join(f.episode,'workflow/image_storyboard.png')));
});
test('not applicable is limited to genuinely empty asset categories; receipts cannot be omitted',t=>{
 const f=fixture(t);setupProject(f.root);
 f.call({action:'begin',stage:'characters',entries:[],notApplicable:'Object-only demonstration'});
 f.call({action:'complete',stage:'characters'});
 assert.throws(()=>f.call({action:'begin',stage:'text_storyboard',entries:[],notApplicable:'skip'}),/invalid_not_applicable/);
 fs.rmSync(path.join(f.episode,'.work/production-workflow.json'));
 assert.throws(()=>requireWorkflow(f.episode,'text'),/out_of_order/);
});

test('execution rechecks prerequisites even after a plan was prepared',async t=>{
 const f=fixture(t);setupProject(f.root);
 f.call({action:'begin',stage:'characters',entries:[],notApplicable:'Object-only demonstration'});
 f.call({action:'complete',stage:'characters'});
 fs.writeFileSync(path.join(f.episode,'story.md'),'The cup moves. Narrator: watch the cup.');
 f.call({action:'begin',stage:'text_storyboard',entries:[{id:'story',text:'story.md'}]});
 f.call({action:'complete',stage:'text_storyboard'});
 fs.writeFileSync(path.join(f.episode,'cup.md'),'A blue cup');
 f.call({action:'begin',stage:'props',entries:[{id:'cup',text:'cup.md',image:'cup.png'}]});
 const plan=planImage({directory:f.episode,assetId:'cup',requestId:'a',args:{prompt:'blue cup'}});
 fs.appendFileSync(path.join(f.episode,'story.md'),' Changed action');
 await assert.rejects(executeImage({directory:f.episode,planId:plan.id},async()=>assert.fail('must not dispatch')),/workflow_stale/);
});
