import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtempSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
const root=resolve(process.argv[2]),dir=mkdtempSync(join(tmpdir(),'sf-installed-handoff-'));
const require=createRequire(import.meta.url),{prepare}=require(join(root,'skills/produce/references/prepare-astra-shot.js'));
execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=red:s=128x128','-frames:v','1',join(dir,'start.png')]);
const scene={id:'s0001',type:'points',scene:1,duration:25/24,narration:[],performance:[{kind:'action',character:'woman',text:'She sets down the tray.',durationSeconds:1}],shot:{render:{mode:'generated_video'},videoDesign:{before:'She holds the tray.',action:'She sets down the tray.',after:'Tray rests on desk.'}},visual:{bg:'start.png',frames:{mode:'first_last',end:'start.png',keyframes:[{atSeconds:.5,image:'start.png'}]},video:{engine:'astra',resolution:'128x128',numFrames:25,frameRate:24}}};
const win={STORY:{version:'story-v2'},SB_DOC:{characters:[]},SCENES:[scene]};
const save=()=>writeFileSync(join(dir,'scenes.js'),Object.entries(win).map(([k,v])=>`window.${k}=${JSON.stringify(v)};`).join('\n'));
for(const effects of [[],[{delivery:'auto',description:'Tray clack',trigger:'Contact'}],[{delivery:'native',description:'Tray clack',trigger:'Contact'}]]){
 scene.sound={audioSource:'video',effects};save();assert.equal((await prepare(dir,{shotId:scene.id})).arguments.generateAudio,true);
}
scene.visual.video.generateAudio=false;scene.sound.effects=[];save();await assert.rejects(prepare(dir,{shotId:scene.id}),/silent output/);
delete scene.sound;delete scene.visual.video.generateAudio;save();assert.equal((await prepare(dir,{shotId:scene.id})).arguments.generateAudio,false);
const report={passed:true,root,fixture:dir,checks:['keyframe empty source sound enabled','keyframe auto native enabled','keyframe explicit native enabled','authored false rejects conflict','legacy keyframe default preserved'],review:'not_reviewed'};
writeFileSync(process.argv[3],JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
