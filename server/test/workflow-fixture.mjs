import fs from 'node:fs';
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
export function completeWorkflow(episode) {
  fs.mkdirSync(path.join(episode,'workflow'),{recursive:true});
  for (const stage of STAGES) {
    const text=path.join(episode,'workflow',stage+'.md');fs.writeFileSync(text,stage+' fixture content');
    const image=path.join(episode,'workflow',stage+'.png');
    if(stage!=='text_storyboard') fs.writeFileSync(image,png);
    manageWorkflow({episode,action:'begin',stage,entries:[{id:stage,text,...(stage!=='text_storyboard'?{image}:{})}]});
    manageWorkflow({episode,action:'complete',stage});
  }
}
