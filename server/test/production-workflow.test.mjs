import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { manageWorkflow } from '../dist/production-workflow.js';
function fixture(t) {
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'workflow-')));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const episode=path.join(root,'data/c/episodes/e');fs.mkdirSync(path.join(episode,'storyboard'),{recursive:true});
 return {episode,call:args=>manageWorkflow({episode,...args})};
}
test('stages record in any order; a story-v2 text storyboard completes only with every shot story and its characters',t=>{
 const f=fixture(t),notes=path.join(f.episode,'notes.md');fs.writeFileSync(notes,'s0001: Mina finds the cup.');
 f.call({action:'begin',stage:'video',entries:[{id:'s0001',text:notes}]});
 assert.deepEqual(f.call({action:'complete',stage:'video'}).completed.map(r=>r.stage),['video']);
 const shot={id:'s0001',type:'points',scene:1,summary:'Mina finds the cup.'};
 const write=s=>fs.writeFileSync(path.join(f.episode,'storyboard/scenes.js'),'window.STORY={"version":"story-v2"};window.STRUCTURE='+JSON.stringify({version:'structure-v1',sequences:[{id:'q1',title:'Opening',purpose:'Meet',scenes:[1]}],scenes:[{no:1,place:'Room',time:'Day',event:'A cup',summary:'Mina finds a cup.'}]})+';window.SCENES='+JSON.stringify([s])+';');
 write(shot);
 f.call({action:'begin',stage:'text_storyboard',entries:[{id:'board',text:notes}]});
 assert.throws(()=>f.call({action:'complete',stage:'text_storyboard'}),/story_outline_required: shot s0001 has no characters/);
 write({...shot,visual:{character:null}});
 assert.deepEqual(f.call({action:'complete',stage:'text_storyboard'}).completed.map(r=>r.stage),['video','text_storyboard']);
});
