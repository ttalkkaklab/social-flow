import { manageProject } from '../dist/project.js';
export const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=', 'base64');
export function setupProject(root) {
  return manageProject({ action:'init', workspace:root, request:'Use these fixture choices', profileMarkdown:'---\nname: Fixture\nslug: c\n---\n# Fixture channel\n', settings:{
    project:{name:'Fixture',channel:'c'}, videoType:{id:'drama'},
    models:{image:{engine:'host',host:'codex',model:'host-managed'},video:{engine:'seedance',model:'dreamina-seedance-2-0-260128',resolution:'720p'},speech:{engine:'none'}},
    style:{preset:'webtoon'},production:{mode:'video_50',renderRatioVersion:1,format:'shorts-9x16',episodeBudgetUsd:5},
    sns:Object.fromEntries(['threads','instagram','facebook','youtube'].map(p=>[p,{enabled:false,status:'disabled'}])),
  }});
}
