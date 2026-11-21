// Reuse the installed smoke fixture, add exactly one post effect, then run the complete builder.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
const root=resolve(process.argv[2]),output=resolve(process.argv[3]);
const work=join(output,'work'),board=join(output,'storyboard'),refs=join(root,'skills/produce/references');
const require=createRequire(import.meta.url);
const {evaluateWindowScript}=require(join(root,'skills/_shared/scenes-vm.js'));
const {boardClock}=require(join(root,'skills/storyboard/references/audience-effects.js'));
const silent=process.argv.includes('--silent');
const win=evaluateWindowScript(readFileSync(join(board,'scenes.js'),'utf8'));
if(silent){
  execFileSync('ffmpeg',['-v','error','-y','-f','lavfi','-i','testsrc2=size=128x224:rate=24:duration=3','-f','lavfi','-i','anullsrc=r=48000:cl=stereo','-t','3','-c:v','libx264','-c:a','aac',join(work,'source.mp4')]);
  win.SCENES[0].sound.effects=[];
}
const assets=join(output,'assets/audio/sfx');mkdirSync(assets,{recursive:true});
execFileSync('ffmpeg',['-v','error','-y','-f','lavfi','-i','sine=frequency=1400:sample_rate=48000:duration=0.4','-af','afade=t=out:st=0.15:d=0.25',join(assets,'click.wav')]);
const shot = win.SCENES[0];
const cue = {id:'surprise', delivery:'post', sfx:'click', atSeconds:2.2, separationLu:12,
  trigger:'eyebrows rise', description:'short audience pulse', audience:{intent:'surprise'}};
shot.sound.effects.push(cue, {id:'old-footstep',delivery:'post',sfx:'missing-foley',atSeconds:1.9});
cue.audience.timingBasis = boardClock(win, board, output).basis(shot.id, cue);
const legacy = `0\t0\t${join(assets,'click.wav')}\toff\t1.9\t12\n`;
writeFileSync(join(work,'sfx.tsv'), legacy);
writeFileSync(join(board,'scenes.js'),Object.entries(win).map(([k,v])=>`window.${k}=${JSON.stringify(v)};`).join('\n'));
const log=execFileSync('bash',[join(refs,'build-reel.sh'),work,board],{encoding:'utf8',maxBuffer:16*1024*1024,timeout:120000,
  env:{...process.env,W:'128',H:'224',FPS:'24',OUTRO:'0',COVER_TS:'1'}});
writeFileSync(join(output,'post-build.log'),log);
const effects = JSON.parse(readFileSync(join(work,'sfx-spans.json'),'utf8')).spans;
assert.equal(effects.length,1);assert.equal(effects[0].start.atSeconds,2.2);
assert.match(log,/skipped legacy sfx\.tsv audio rows/);
assert.equal(readFileSync(join(work,'sfx.tsv'),'utf8'),legacy);
const samples=execFileSync('ffmpeg',['-v','error','-i',join(work,'reel.mp4'),'-map','0:a:0','-af','pan=mono|c0=c0','-ar','48000','-f','f32le','-']);
function rms(a,b){let sum=0,n=0;for(let i=Math.round(a*48000);i<Math.round(b*48000);i++){sum+=samples.readFloatLE(i*4)**2;n++;}return Math.sqrt(sum/n);}
if(silent)assert.ok(rms(1.52,1.62)<.0001,'silent source stays silent');else assert.ok(rms(1.52,1.62)>.01,'source event retained');assert.ok(rms(2.23,2.3)>.001,'post event placed');assert.ok(rms(1.9,2.1)<.0001,'post event not placed early');
const report={passed:true,root,silent,postRows:effects.length,atSeconds:2.2,nativeRms:rms(1.52,1.62),postRms:rms(2.23,2.3),beforePostRms:rms(1.9,2.1),review:'not_reviewed',coverage:'Signal-level final MP4 placement and source retention; no listening claim'};
writeFileSync(process.argv[4],JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
