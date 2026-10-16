import {createRequire} from 'node:module';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync,copyFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync,execFileSync} from 'node:child_process';
const ref=path.resolve(import.meta.dirname,'../../skills/produce/references');
const q=s=>"'"+s.replaceAll("'","'\\''")+"'";
function fixture(t){const dir=mkdtempSync(path.join(tmpdir(),'clean-video-'));mkdirSync(path.join(dir,'work'));t.after(()=>rmSync(dir,{recursive:true,force:true}));return dir;}
for(const filename of ['build-reel.sh','build-screencast.sh']){
 const source=readFileSync(path.join(ref,filename),'utf8');
 test(`${filename} defaults to no captions and ignores legacy burn settings`,()=>{
  const defaults=source.split('\n').filter(line=>/^(SUB|BURN)=/.test(line)).join('\n');
  for(const [subtitle,expected] of [['','0'],['1','1']]){
   const result=spawnSync('bash',['-c',`unset SUB; BURN=1; ${subtitle?'SUB='+subtitle+';':''}\n${defaults}\nprintf '%s %s' "$SUB" "$BURN"`],{encoding:'utf8'});
   assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,expected+' 0');
  }
 });
 test(`${filename} final mux preserves audio without rendering or embedding existing subtitle data`,t=>{
  const dir=fixture(t);
  execFileSync('ffmpeg',['-y','-v','error','-f','lavfi','-i','color=c=blue:s=160x90:r=30:d=1','-c:v','libx264','-pix_fmt','yuv420p',path.join(dir,'work/video.mp4')]);
  execFileSync('ffmpeg',['-y','-v','error','-f','lavfi','-i','sine=frequency=440:duration=1:sample_rate=48000',path.join(dir,'work/mix.wav')]);
  writeFileSync(path.join(dir,'subs.ass'),'INVALID ASS: this file must never be read by the video renderer');
  writeFileSync(path.join(dir,'reel-sub.mp4'),'stale burned copy');
  const start=source.indexOf('render() {'),end=source.indexOf('\n# ──',start),stage=source.slice(start,end);
  const script=`set -euo pipefail
BURN=1; SUB=1; SUBFILTER='subtitles=subs.ass'; AUDSRC=work/mix.wav; FPS=30; OUTRO=0
VENC=(-c:v libx264 -preset ultrafast -crf 18 -pix_fmt yuv420p); AENC=(-c:a aac); ENC=("\${VENC[@]}" "\${AENC[@]}")
say(){ :; }; outro_on(){ return 1; }
ffmpeg(){ printf '%s\\n' "$*" >> ffmpeg-arguments.txt; command ffmpeg "$@"; }
${stage}`;
  const result=spawnSync('bash',['-c',script],{cwd:dir,encoding:'utf8'});assert.equal(result.status,0,result.stderr);
  assert.ok(existsSync(path.join(dir,'reel.mp4')));assert.equal(existsSync(path.join(dir,'reel-sub.mp4')),false);
  const args=readFileSync(path.join(dir,'ffmpeg-arguments.txt'),'utf8');assert.doesNotMatch(args,/subtitles=|\bass=|\.ass\b|\.srt\b/);assert.match(args,/-map 1:a/);assert.match(args,/-sn/);
  const streams=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','stream=codec_type','-of','json',path.join(dir,'reel.mp4')],{encoding:'utf8'})).streams;
  assert.deepEqual(streams.map(s=>s.codec_type),['video','audio']);
  const rgb=execFileSync('ffmpeg',['-v','error','-ss','0.5','-i',path.join(dir,'reel.mp4'),'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1']);
  for(let i=3;i<rgb.length;i++)assert.equal(rgb[i],rgb[i%3],'caption pixels appeared on the flat blue source');
 });
 test(`${filename} outro filter cannot consume a subtitle filter`,t=>{
  const dir=fixture(t),stage=source.slice(source.indexOf('render() {'),source.indexOf('\nrender reel.mp4',source.indexOf('render() {')));
  const script=`set -euo pipefail
AUDSRC=work/mix.wav; OUTRO_ASSET=outro.mp4; XFADE=.2; XFADE_T=fade; FO=.8; OFF=.8; VENC=(-c:v libx264); AENC=(-c:a aac); ENC=("\${VENC[@]}" "\${AENC[@]}")
outro_on(){ return 0; }; ffmpeg(){ printf '%s\\n' "$*" >> ffmpeg-arguments.txt; }
${stage}
render reel.mp4 'subtitles=old.ass'`;
  const result=spawnSync('bash',['-c',script],{cwd:dir,encoding:'utf8'});assert.equal(result.status,0,result.stderr);assert.doesNotMatch(readFileSync(path.join(dir,'ffmpeg-arguments.txt'),'utf8'),/subtitles=|\bass=|\.ass\b/);
 });
}
test('default pace pass drops historical burned derivatives and permits absent optional captions',t=>{
 const dir=fixture(t),source=readFileSync(path.join(ref,'speedup.sh'),'utf8');
 const rate=source.slice(source.indexOf('check_final_rate() {'),source.indexOf('\n# The opening cue',source.indexOf('check_final_rate() {')));
 const stage=source.slice(source.indexOf('# Remove derived files'),source.indexOf('\nTOT=$(dur'));
 writeFileSync(path.join(dir,'reel.mp4'),'clean video fixture');writeFileSync(path.join(dir,'reel-sub.mp4'),'old burned video');writeFileSync(path.join(dir,'reel-sub-fast.mp4'),'stale delivery');
 const script=`set -euo pipefail
HERE=${q(ref)}; SPEED=1; VIN=reel.mp4; SIN=reel-sub.mp4; TIN=subs.srt; REPORT=build-report.txt
say(){ :; }; check_first_cue(){ :; }; node(){ :; }
${rate}
${stage}`;
 const result=spawnSync('bash',['-c',script],{cwd:dir,encoding:'utf8'});assert.equal(result.status,0,result.stderr);assert.equal(readFileSync(path.join(dir,'reel-fast.mp4'),'utf8'),'clean video fixture');assert.equal(existsSync(path.join(dir,'reel-sub-fast.mp4')),false);assert.equal(existsSync(path.join(dir,'subs-fast.srt')),false);
 const calls=source.slice(source.indexOf('speed_one "$VIN"'),source.indexOf('# ── 4)'));assert.doesNotMatch(calls,/speed_one.*\$SIN|reel-sub-fast/);
});

const delivery=createRequire(import.meta.url)(path.join(ref,'delivery-proof.js'));
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
test('splice executes without captions and never propagates an old burned video',t=>{
 const dir=fixture(t);
 for(const [name,duration,color] of [['reel.mp4',2,'blue'],['insert.mp4',0.5,'green']])execFileSync('ffmpeg',['-y','-v','error','-f','lavfi','-i',`color=c=${color}:s=160x90:r=30:d=${duration}`,'-f','lavfi','-i',`sine=frequency=440:duration=${duration}:sample_rate=48000`,'-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest',path.join(dir,name)]);
 writeFileSync(path.join(dir,'format.env'),'W=160\nH=90\n');writeFileSync(path.join(dir,'reel-sub.mp4'),'invalid obsolete burned input');writeFileSync(path.join(dir,'reel-sub-spliced.mp4'),'stale derivative');writeFileSync(path.join(dir,'subs-spliced.srt'),'stale sidecar');
 const result=spawnSync('bash',[path.join(ref,'splice-clip.sh'),dir,path.join(dir,'insert.mp4'),'1'],{encoding:'utf8'});assert.equal(result.status,0,result.stdout+result.stderr);
 assert.ok(existsSync(path.join(dir,'reel-spliced.mp4')));assert.equal(existsSync(path.join(dir,'reel-sub-spliced.mp4')),false);assert.equal(existsSync(path.join(dir,'subs-spliced.srt')),false);
 const streams=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries','stream=codec_type','-of','json',path.join(dir,'reel-spliced.mp4')],{encoding:'utf8'})).streams;assert.deepEqual(streams.map(s=>s.codec_type),['video','audio']);
});
