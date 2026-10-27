import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync,execFileSync} from 'node:child_process';
const ref=path.resolve(import.meta.dirname,'../../skills/produce/references');
test('splice executes without captions and never propagates an old burned video',t=>{
 const dir=mkdtempSync(path.join(tmpdir(),'clean-video-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 for(const [name,duration,color] of [['reel.mp4',2,'blue'],['insert.mp4',0.5,'green']])execFileSync('ffmpeg',['-y','-v','error','-f','lavfi','-i',`color=c=${color}:s=160x90:r=30:d=${duration}`,'-f','lavfi','-i',`sine=frequency=440:duration=${duration}:sample_rate=48000`,'-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest',path.join(dir,name)]);
 writeFileSync(path.join(dir,'format.env'),'W=160\nH=90\n');writeFileSync(path.join(dir,'reel-sub.mp4'),'invalid obsolete burned input');writeFileSync(path.join(dir,'reel-sub-spliced.mp4'),'stale derivative');writeFileSync(path.join(dir,'subs-spliced.srt'),'stale sidecar');
 const result=spawnSync('bash',[path.join(ref,'splice-clip.sh'),dir,path.join(dir,'insert.mp4'),'1'],{encoding:'utf8'});assert.equal(result.status,0,result.stdout+result.stderr);
 assert.ok(existsSync(path.join(dir,'reel-spliced.mp4')));assert.equal(existsSync(path.join(dir,'reel-sub-spliced.mp4')),false);assert.equal(existsSync(path.join(dir,'subs-spliced.srt')),false);
 const streams=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','stream=codec_type','-of','json',path.join(dir,'reel-spliced.mp4')],{encoding:'utf8'})).streams;assert.deepEqual(streams.map(s=>s.codec_type),['video','audio']);
});
