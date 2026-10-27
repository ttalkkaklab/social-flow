import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { manageProject } from '../dist/project.js';
import { manageWorkflow, STAGES } from '../dist/production-workflow.js';
export const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=', 'base64');
export function setupProject(root) {
  return manageProject({ action:'init', workspace:root, request:'Use these fixture choices', profileMarkdown:'---\nname: Fixture\nslug: c\n---\n# Fixture channel\n', settings:{
    project:{name:'Fixture',channel:'c'}, videoType:{id:'drama'},
    models:{image:{engine:'host',host:'codex',model:'host-managed'},video:{engine:'veo',model:'veo-3.1-fast-generate-preview',resolution:'720p'},speech:{engine:'none'}},
    style:{preset:'webtoon'},production:{mode:'video_50',renderRatioVersion:1,format:'shorts-9x16',episodeBudgetUsd:5},
    sns:Object.fromEntries(['threads','instagram','facebook','youtube'].map(p=>[p,{enabled:false,status:'disabled'}])),
  }});
}
export const fileHash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
export function stageFixture(episode, stage) {
  const dir=path.join(episode,'workflow');fs.mkdirSync(dir,{recursive:true});
  const state=manageWorkflow({episode,action:'status'});
  const review=stage.endsWith('_review');
  const ids=['camera_review','blender_composition','image_storyboard','video'].includes(stage)?['s1','s2']:[stage];
  const entries=ids.map((id,index)=>{
    const base=path.join(dir,stage+(index?'-'+id:''));
    const text=base+(review||stage==='blender_composition'?'.json':'.md');
    const entry={id,text};
    if(review) {
      const criteria=path.join(dir,stage+'-rubric.md');
      if(!fs.existsSync(criteria))fs.writeFileSync(criteria,'Required evidence and unresolved defects');
      const source=stage==='image_review'?'image_storyboard':stage==='video_review'?'video':'text_storyboard';
      const inputs={...state.completed.find(r=>r.stage===source).hashes};
      if(stage==='camera_review') {const plan=path.join(dir,'camera-plan.md');fs.writeFileSync(plan,'s1 held wide; s2 reaction closeup');inputs[plan]=fileHash(plan);}
      const report={stage,author:'author',reviewer:'independent-reader',independent:true,verdict:'pass',
        coverage:stage==='image_review'?'images':stage==='video_review'?'video_playback':'text',
        criteria:{path:criteria,sha256:fileHash(criteria)},inputs,observations:['The visible event supports the next action.'],unresolved:[]};
      if(stage==='context_review')report.audienceRead={blind:true,reconstruction:'A viewer sees the cup move and understands the response.',
        transitions:[{from:'s1',to:'s2',viewerUnderstands:'The visible cup movement triggers the response.',evidence:[{path:Object.keys(inputs)[0],quote:'s1: the cup moves',cutId:'s1'}]}],missingContext:[]};
      else report.cutIds=stage==='camera_review'?ids:state.completed.find(r=>r.stage===source).entries.map(e=>e.id);
      fs.writeFileSync(text,JSON.stringify(report));
    } else fs.writeFileSync(text,'s1: the cup moves. s2: the viewer sees the response.');
    if(['characters','props','backgrounds','blender_composition','image_storyboard'].includes(stage)) {
      entry.image=base+'.png';fs.writeFileSync(entry.image,png);
    }
    if(stage==='blender_composition') {
      entry.blend=base+'.blend';fs.writeFileSync(entry.blend,'BLENDER synthetic test source');
      fs.writeFileSync(text,JSON.stringify({renderer:'blender',shotId:id,blend:{path:entry.blend,sha256:fileHash(entry.blend)},image:{path:entry.image,sha256:fileHash(entry.image)}}));
    }
    if(stage==='video')entry.video=base+'.mp4';
    return entry;
  });
  manageWorkflow({episode,action:'begin',stage,entries});
  return entries;
}
export function completeWorkflow(episode) {
  for(const stage of STAGES) {
    stageFixture(episode,stage);
    if(stage==='video')break;
    manageWorkflow({episode,action:'complete',stage});
  }
}
