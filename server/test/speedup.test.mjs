import {createRequire} from 'node:module';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync,copyFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync,execFileSync} from 'node:child_process';
const ref=path.resolve(import.meta.dirname,'../../skills/produce/references');
const delivery=createRequire(import.meta.url)(path.join(ref,'delivery-proof.js'));
function fixture(t){const dir=mkdtempSync(path.join(tmpdir(),'clean-video-'));mkdirSync(path.join(dir,'work'));t.after(()=>rmSync(dir,{recursive:true,force:true}));return dir;}
for(const sidecar of [false,true])test(`full pace pass and delivery support ${sidecar?'an optional separately hashed SRT':'clean audio/video with no SRT'}`,t=>{
 const episode=fixture(t),work=path.join(episode,'work'),out=path.join(episode,'output/video');mkdirSync(out,{recursive:true});
 execFileSync('ffmpeg',['-y','-v','error','-f','lavfi','-i','color=c=blue:s=160x90:r=30:d=1','-f','lavfi','-i','sine=frequency=440:duration=1:sample_rate=48000','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest',path.join(work,'reel.mp4')]);
 writeFileSync(path.join(work,'edit.json'),'{}');writeFileSync(path.join(work,'build-report.txt'),'clean fixture');writeFileSync(path.join(work,'format.env'),'OUTRO=0\n');
 writeFileSync(path.join(work,'reel-sub.mp4'),'obsolete burned source');writeFileSync(path.join(work,'reel-sub-fast.mp4'),'obsolete burned delivery');
 if(sidecar)writeFileSync(path.join(work,'subs.srt'),'1\n00:00:00,000 --> 00:00:01,000\nHi\n');
 const result=spawnSync('bash',[path.join(ref,'speedup.sh'),work,'1'],{encoding:'utf8'});assert.equal(result.status,0,result.stdout+result.stderr);
 const proof=JSON.parse(readFileSync(path.join(work,'delivery-proof.json'),'utf8'));assert.equal(proof.outputs['video-sub.mp4'],null);assert.equal(Boolean(proof.outputs['subs.srt']),sidecar);assert.equal(existsSync(path.join(work,'reel-sub-fast.mp4')),false);
 copyFileSync(path.join(work,'reel-fast.mp4'),path.join(out,'video.mp4'));copyFileSync(path.join(work,'delivery-proof.json'),path.join(out,'delivery-proof.json'));if(sidecar)copyFileSync(path.join(work,'subs-fast.srt'),path.join(out,'subs.srt'));
 assert.equal(delivery.check(episode),null);
 writeFileSync(path.join(out,'subs.srt'),'unapproved or changed captions');assert.match(delivery.check(episode),/output changed: subs.srt/);
 if(sidecar)copyFileSync(path.join(work,'subs-fast.srt'),path.join(out,'subs.srt'));else rmSync(path.join(out,'subs.srt'));
 writeFileSync(path.join(out,'video-sub.mp4'),'stale burn');assert.match(delivery.check(episode),/output changed: video-sub.mp4/);
});
