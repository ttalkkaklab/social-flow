// Fresh installed CLI + complete FFmpeg builder, with a deterministic audio fixture (no vendor spend).
// Usage: node server/test/installed-video-sound-smoke.mjs PLUGIN_ROOT OUTPUT_DIR
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
const root = resolve(process.argv[2]), output = resolve(process.argv[3]);
const board = join(output,'storyboard'), work = join(output,'work');
mkdirSync(board,{recursive:true});mkdirSync(work,{recursive:true});
const refs=join(root,'skills/produce/references');
const cli=(name,args)=>execFileSync(process.execPath,[join(refs,name),...args],{encoding:'utf8',maxBuffer:8*1024*1024});
const ff=args=>execFileSync('ffmpeg',['-v','error','-y',...args]);
const video=join(work,'source.mp4');
ff(['-f','lavfi','-i','testsrc2=size=128x224:rate=24:duration=3','-f','lavfi','-i',"aevalsrc=if(between(t\\,1.5\\,1.65)\\,0.15*sin(2*PI*800*t)\\,0):s=48000:d=3",'-c:v','libx264','-c:a','aac','-shortest',video]);
// Legacy builder requires a measurable bed; the authored drop mutes it for the whole shot.
ff(['-f','lavfi','-i','sine=frequency=200:sample_rate=48000:duration=3','-ac','2',join(work,'bgm.wav')]);
const effect={id:'hangup',delivery:'auto',description:'Short Bakelite clack',trigger:'When the receiver contacts the cradle'};
const scene={id:'s0001',type:'points',duration:3,narration:[],visual:{clip:video},sound:{drop:true,effects:[effect]}};
const save=()=>writeFileSync(join(board,'scenes.js'),`window.SCENES=${JSON.stringify([scene])};`);
save();
const request=join(output,'request.json');writeFileSync(request,JSON.stringify({prompt:'A man hangs up the telephone.'}));
const planned=JSON.parse(cli('prepare-video-sound.js',[board,'s0001','seedance_text2video',request,'--apply']));
assert.equal(planned.arguments.generateAudio,true);assert.equal(planned.sound.audioSource,'video');
assert.ok(existsSync(join(board,'.sound-history')));
writeFileSync(join(work,'cards.tsv'),'0\tbgm.wav\t1\tnone\n');
writeFileSync(join(work,'segs.tsv'),`0\t0\t${video}\t\t\n`);
// The fixture represents the returned mixed video. It is not a Seedance generation.
const log=join(output,'build.log');
try {
  const result=execFileSync('bash',[join(refs,'build-reel.sh'),work,board],{encoding:'utf8',timeout:120000,maxBuffer:16*1024*1024,
    env:{...process.env,W:'128',H:'224',FPS:'24',OUTRO:'0',BURN_SUBS:'0',COVER_TS:'1',ENC_PRESET:'ultrafast'}});
  writeFileSync(log,result);
} catch(error) {writeFileSync(log,String(error.stdout||'')+'\n'+String(error.stderr||''));throw error;}
assert.ok(existsSync(join(work,'reel.mp4')));
assert.ok(!readFileSync(join(work,'sfx.tsv'),'utf8').split('\n').some(row=>row.split('\t')[2]),'native SFX must not be added again (drop row has no effect asset)');
const samples=execFileSync('ffmpeg',['-v','error','-i',join(work,'reel.mp4'),'-map','0:a:0','-ac','1','-ar','48000','-f','f32le','-']);
function rms(start,end){let sum=0,n=0;for(let i=Math.round(start*48000);i<Math.round(end*48000);i++){const v=samples.readFloatLE(i*4);sum+=v*v;n++;}return Math.sqrt(sum/n);}
assert.ok(rms(1.52,1.62)>0.01,'native impulse survives final assembly');
assert.ok(rms(.5,1)<0.0001,'no unexpected bed/duplicate speech');
const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const report={root,passed:true,fixture:'synthetic timed impulse; not a provider render or perceptual review',review:'not_reviewed',
  checks:['fresh installed request planning and board write','Seedance audio enabled','actual builder source extraction','native cue omitted from post manifest','final MP4 impulse at 1.5s','quiet interval preserved'],
  pulseRms:rms(1.52,1.62),quietRms:rms(.5,1),files:Object.fromEntries(['server/dist/astra-shot-runtime.bundle.js','skills/produce/references/build-reel.sh','skills/produce/references/prepare-source-audio.js'].map(file=>[file,hash(join(root,file))])),
  output:join(work,'reel.mp4'),outputSha256:hash(join(work,'reel.mp4'))};
writeFileSync(join(output,'receipt.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
