import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { manageWorkflow, requireCompositionReference, requireWorkflow, requireReviewedImages, requireReviewedVideos } from '../dist/production-workflow.js';
import { planVideo } from '../dist/video-routing.js';
import { planImage, executeImage } from '../dist/image-routing.js';
import { setupProject, completeWorkflow, stageFixture, fileHash, png } from './workflow-fixture.mjs';
function fixture(t) {
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'workflow-')));
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
 fs.writeFileSync(path.join(f.episode,'story.md'),'s1: the cup moves. Narrator: watch the cup.');
 f.call({action:'begin',stage:'text_storyboard',entries:[{id:'story',text:'story.md'}]});
 f.call({action:'complete',stage:'text_storyboard'});
 stageFixture(f.episode,'context_review');f.call({action:'complete',stage:'context_review'});
 fs.writeFileSync(path.join(f.episode,'cup.md'),'A blue cup');
 f.call({action:'begin',stage:'props',entries:[{id:'cup',text:'cup.md',image:'cup.png'}]});
 const plan=planImage({directory:f.episode,assetId:'cup',requestId:'a',args:{prompt:'blue cup'}});
 fs.appendFileSync(path.join(f.episode,'story.md'),' Changed action');
 await assert.rejects(executeImage({directory:f.episode,planId:plan.id},async()=>assert.fail('must not dispatch')),/workflow_stale/);
});

test('context review requires an independent audience reconstruction with actual source evidence',t=>{
 const f=fixture(t);setupProject(f.root);
 for(const stage of ['characters','text_storyboard']) {stageFixture(f.episode,stage);f.call({action:'complete',stage});}
 assert.throws(()=>f.call({action:'begin',stage:'camera_review',entries:[]}),/out_of_order/);
 const [entry]=stageFixture(f.episode,'context_review');
 const original=JSON.parse(fs.readFileSync(entry.text));
 const check=(patch,pattern)=>{
   fs.writeFileSync(entry.text,JSON.stringify({...original,...patch}));
   assert.throws(()=>f.call({action:'complete',stage:'context_review'}),pattern);
 };
 check({audienceRead:undefined},/audience_read_required/);
 check({reviewer:'author'},/independent_review_required/);
 check({unresolved:['No shot shows how the character learns the truth.']});
 const wrong=structuredClone(original.audienceRead);wrong.transitions[0].evidence[0].quote='The absent reveal shot';
 check({audienceRead:wrong},/audience_evidence_required/);
 fs.writeFileSync(entry.text,JSON.stringify(original));
 f.call({action:'complete',stage:'context_review'});
 assert.equal(f.call({action:'status'}).next,'props');
});

test('rewind preserves media and evidence but cannot weaken a frozen review rubric',t=>{
 const f=fixture(t);setupProject(f.root);completeWorkflow(f.episode);
 const state=f.call({action:'status'}),review=state.completed.find(r=>r.stage==='image_review');
 const report=JSON.parse(fs.readFileSync(review.entries[0].text));
 f.call({action:'rewind',stage:'image_review'});
 assert.ok(fs.existsSync(path.join(f.episode,'workflow/image_storyboard.png')));
 const history=fs.readdirSync(path.join(f.episode,'.work/production-workflow-history'));
 const archived=JSON.parse(fs.readFileSync(path.join(f.episode,'.work/production-workflow-history',history[0])));
 assert.ok(archived.reports[review.entries[0].text]);
 fs.writeFileSync(report.criteria.path,'A weaker rubric');report.criteria.sha256=fileHash(report.criteria.path);
 fs.writeFileSync(review.entries[0].text,JSON.stringify(report));
 assert.throws(()=>f.call({action:'begin',stage:'image_review',entries:review.entries}),/rubric_changed/);
});

test('Blender inventory, receipt and actual composition reference are required before cut images',async t=>{
 const {requireCompositionReference}=await import('../dist/production-workflow.js');
 const f=fixture(t);setupProject(f.root);completeWorkflow(f.episode);
 f.call({action:'rewind',stage:'blender_composition'});
 assert.throws(()=>f.call({action:'begin',stage:'image_storyboard',entries:[]}),/out_of_order/);
 const entries=stageFixture(f.episode,'blender_composition');
 const original=JSON.parse(fs.readFileSync(entries[0].text));
 fs.writeFileSync(entries[0].text,JSON.stringify({...original,renderer:'threejs'}));
 assert.throws(()=>f.call({action:'complete',stage:'blender_composition'}),/blender_receipt_required/);
 fs.writeFileSync(entries[0].text,JSON.stringify(original));f.call({action:'complete',stage:'blender_composition'});
 assert.throws(()=>f.call({action:'begin',stage:'image_storyboard',entries:[{id:'missing-cut',text:'x.md',image:'x.png'}]}),/inventory_mismatch/);
 stageFixture(f.episode,'image_storyboard');
 assert.throws(()=>requireCompositionReference(f.episode,'s1',{prompt:entries[0].image}),/composition_reference_required/);
 requireCompositionReference(f.episode,'s1',{referenced_image_paths:[entries[0].image]});
 assert.throws(()=>requireWorkflow(f.episode,'video'),/out_of_order/);
});

test('begin video without a requested image review records image_review as skipped over the current images',t=>{
 const f=fixture(t);setupProject(f.root);completeWorkflow(f.episode);f.call({action:'rewind',stage:'image_review'});
 stageFixture(f.episode,'video');
 const skip=f.call({action:'status'}).completed.find(r=>r.stage==='image_review');
 const image=path.join(f.episode,'workflow/image_storyboard.png');
 assert.deepEqual(skip.entries,[]);assert.ok(skip.skipped.request);assert.equal(skip.hashes[image],fileHash(image));
 requireWorkflow(f.episode,'video','s1');
 const sheet=path.join(f.episode,'workflow/characters.png'),loose=path.join(f.episode,'loose.png');fs.writeFileSync(loose,png);fs.appendFileSync(loose,'x');
 requireReviewedImages(f.episode,[sheet,image]);
 assert.throws(()=>requireReviewedImages(f.episode,[loose]),/workflow_image_not_reviewed/);
 fs.appendFileSync(image,'changed');
 assert.throws(()=>f.call({action:'status'}),/workflow_stale: rewind image_storyboard/);
});

test('legacy completion resumes at context review and never inherits old media approvals',t=>{
 const f=fixture(t);setupProject(f.root);completeWorkflow(f.episode);
 const state=f.call({action:'status'});
 const old={version:1,completed:state.completed.filter(r=>['characters','text_storyboard','props','backgrounds','image_storyboard'].includes(r.stage))};
 fs.writeFileSync(path.join(f.episode,'.work/production-workflow.json'),JSON.stringify(old));
 assert.equal(f.call({action:'status'}).next,'context_review');
 assert.ok(fs.existsSync(path.join(f.episode,'workflow/image_storyboard.png')));
 assert.throws(()=>requireWorkflow(f.episode,'video'),/out_of_order/);
});

test('delivery requires complete actual video playback review; sampled frames cannot finish',async t=>{
 const {execFileSync}=await import('node:child_process');
 const f=fixture(t);setupProject(f.root);completeWorkflow(f.episode);
 assert.throws(()=>requireWorkflow(f.episode,'video','unknown'),/unknown_cut/);
 assert.throws(()=>requireWorkflow(f.episode,'delivery'),/out_of_order/);
 const videos=f.call({action:'status'}).active.entries;
 assert.throws(()=>f.call({action:'complete',stage:'video'}));
 execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=black:s=16x16:r=24','-frames:v','2','-c:v','libx264','-pix_fmt','yuv420p',videos[0].video]);
 fs.copyFileSync(videos[0].video,videos[1].video);
 f.call({action:'complete',stage:'video'});
 const [review]=stageFixture(f.episode,'video_review');
 const report=JSON.parse(fs.readFileSync(review.text));
 fs.writeFileSync(review.text,JSON.stringify({...report,coverage:'images'}));
 assert.throws(()=>f.call({action:'complete',stage:'video_review'}),/review_coverage/);
 fs.writeFileSync(review.text,JSON.stringify({...report,cutIds:['s1']}));
 assert.throws(()=>f.call({action:'complete',stage:'video_review'}),/cut_coverage/);
 fs.writeFileSync(review.text,JSON.stringify(report));f.call({action:'complete',stage:'video_review'});
 requireWorkflow(f.episode,'delivery');
 requireReviewedVideos(f.episode,{[videos[0].video]:fileHash(videos[0].video)});
 const unreviewed=path.join(f.episode,'unreviewed.mp4');fs.copyFileSync(videos[0].video,unreviewed);
 assert.throws(()=>requireReviewedVideos(f.episode,{[unreviewed]:fileHash(unreviewed)}),/unreviewed_delivery_media/);
 assert.throws(()=>requireReviewedVideos(f.episode,{}),/delivery_media_required/);
 fs.appendFileSync(videos[0].video,'changed');
 assert.throws(()=>requireWorkflow(f.episode,'delivery'),/stale/);
});

test('image storyboard inventories include every authored frame and reference under its cut ID',t=>{
 const f=fixture(t);setupProject(f.root);completeWorkflow(f.episode);
 f.call({action:'rewind',stage:'image_storyboard'});
 const entries=stageFixture(f.episode,'image_storyboard');
 const dir=path.join(f.episode,'storyboard');fs.mkdirSync(dir,{recursive:true});
 const end=path.join(dir,'end.png'),hero=path.join(dir,'hero.png');fs.writeFileSync(end,png);fs.writeFileSync(hero,png);
 fs.writeFileSync(path.join(dir,'scenes.js'),'window.SCENES='+JSON.stringify([{id:'s1',visual:{frames:{mode:'first_last',start:entries[0].image,end:'end.png'},references:[{id:'hero',path:'hero.png',role:'character',use:'image',purpose:'Keep identity'}]}}])+';');
 assert.throws(()=>f.call({action:'complete',stage:'image_storyboard'}),/inventory_missing/);
 f.call({action:'rewind',stage:'image_storyboard'});entries[0].images=[end,hero];
 f.call({action:'begin',stage:'image_storyboard',entries});
 requireWorkflow(f.episode,'image','s1',end);
 const done=f.call({action:'complete',stage:'image_storyboard'});
 assert.equal(done.completed.at(-1).hashes[end],fileHash(end));assert.equal(done.completed.at(-1).hashes[hero],fileHash(hero));
 stageFixture(f.episode,'image_review');f.call({action:'complete',stage:'image_review'});
 fs.appendFileSync(hero,'changed');assert.throws(()=>f.call({action:'status'}),/workflow_stale/);
});


test('direct image plans cannot omit authored appearance references or the opening source for an endpoint',t=>{
 const f=fixture(t);setupProject(f.root);completeWorkflow(f.episode);f.call({action:'rewind',stage:'image_storyboard'});
 const entries=stageFixture(f.episode,'image_storyboard');
 const state=f.call({action:'status'}),composition=state.completed.find(r=>r.stage==='blender_composition').entries[0].image;
 const dir=path.join(f.episode,'storyboard');fs.mkdirSync(dir,{recursive:true});
 const hero=path.join(dir,'hero.png'),end=path.join(dir,'end.png');fs.writeFileSync(hero,png);
 // Different bytes ensure base64 matching cannot mistake the fixture's identical PNGs for each other.
 fs.appendFileSync(hero,'appearance');
 fs.writeFileSync(path.join(dir,'scenes.js'),'window.SCENES='+JSON.stringify([{id:'s1',visual:{frames:{mode:'first_last',start:entries[0].image,end:'end.png'},references:[{id:'hero',path:'hero.png',role:'character',use:'image',purpose:'Keep identity'}]}}])+';');
 assert.throws(()=>requireCompositionReference(f.episode,'s1',{referenced_image_paths:[composition]},end),/image_reference_required/);
 assert.throws(()=>requireCompositionReference(f.episode,'s1',{referenced_image_paths:[composition,hero]},end),/image_reference_required/);
 assert.doesNotThrow(()=>requireCompositionReference(f.episode,'s1',{referenced_image_paths:[composition,hero,entries[0].image]},end));
 assert.doesNotThrow(()=>requireCompositionReference(f.episode,'s1',{sourceImagesBase64:[composition,hero,entries[0].image].map(file=>fs.readFileSync(file).toString('base64'))},end));
 const boardFile=path.join(dir,'scenes.js');
 fs.writeFileSync(boardFile,'window.SCENES='+JSON.stringify([{id:'s1',visual:{frames:{mode:'first_last',start:entries[0].image,end:'end.png'}}}])+';');
 assert.throws(()=>requireCompositionReference(f.episode,'s1',{referenced_image_paths:[composition]},end),/image_reference_required/);
 assert.doesNotThrow(()=>requireCompositionReference(f.episode,'s1',{referenced_image_paths:[composition,entries[0].image]},end));
});
