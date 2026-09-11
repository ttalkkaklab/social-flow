import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtempSync,readFileSync,writeFileSync,mkdirSync,rmSync,copyFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
const require=createRequire(import.meta.url);
const root=path.resolve(import.meta.dirname,'../..');
const {compile}=require(path.join(root,'skills/produce/references/edit-plan.js'));
const cards='0\tvoice.wav\t0\tnone\n1\tvoice.wav\t0\tnone\n';
const scenes=()=>[{type:'cover'},{type:'points',transition:'dissolve'}];
test('source transitions compile automatically with live handles and short audio margins',()=>{
 const r=compile(scenes(),cards);
 assert.equal(r.plan[0].handle,.4);assert.equal(r.plan[1].enter,'dissolve');
 assert.match(r.cards,/enter=dissolve/);assert.equal(r.plan[0].pre,0);assert.equal(r.plan[0].post,.12);
});
test('contradictory, missing and malformed edits fail instead of falling back',()=>{
 assert.throws(()=>compile(scenes(),cards.replace('1\tvoice.wav\t0\tnone','1\tvoice.wav\t0\tnone\tenter=cut')),/contradicts/);
 assert.throws(()=>compile([{},{}],cards),/choose a transition/);
 for(const edit of [{transitionSeconds:NaN},{in:-1},{post:'0.2'},{unknown:1},{transitionSeconds:0}]){
  const s=scenes();s[1].edit=edit;assert.throws(()=>compile(s,cards));
 }
 assert.throws(()=>compile(scenes(),cards.replace('0\tvoice.wav\t0\tnone','0\tvoice.wav\t0\tnone\tsync=1')),/Sync|sync/);
});
test('dip halves, source trims, authored breathing room and durations survive compilation',()=>{
 const s=scenes();s[1].transition='dip:white';s[1].edit={in:.5,post:.3};
 const r=compile(s,cards);assert.equal(r.plan[0].exit,'white');assert.equal(r.plan[1].enter,'white');assert.equal(r.plan[1].in,.5);
 const a=scenes();a[1].edit={transitionSeconds:.2};assert.equal(compile(a,cards).plan[0].handle,.2);
});

const ff=(args,options={})=>execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y',...args],{maxBuffer:16*1024*1024,...options});
const probe=f=>JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=nb_read_frames,duration','-of','json',f],{encoding:'utf8'})).streams[0];
// Execute the production renderer itself, including its source-length and frame-count gates.
const builder=readFileSync(path.join(root,'skills/produce/references/build-reel.sh'),'utf8');
const render=builder.slice(builder.indexOf('  INS=(); FILT=""; NIN=0'),builder.indexOf('  # ── 7.5)'));
const common=`set -euo pipefail
say(){ echo "$1"; }
W=160; H=90; FPS=30; FULL_VIDEO_SHOTS='0 1'; REUSED_VIDEO_SHOTS=''; MV=1; FOFF=(0); FDUR=(0.35)
SPANSET=1; SPAN=0.035; ZOOM_SPAN=0.035; PAN=''; EASE=linear; KB_EASE=linear
DRIFT=0; FX=0.5; FY=0.5; ZDIR=none; N=1; ZB=240:135; SCENE_FADE=0.3
WHIP_BLUR=9; ZOOM_THRU=0.3; PREVEXIT=''; EXITM=''; PUSH_DIR=''; WARN=0
FRAMES=60; D=2; D1=2; SOURCE_IN=0; TOTF=0; JOIN=0; ENTER=cut; PREVIDX=''
`;
function runRender(dir,settings){
 writeFileSync(path.join(dir,'render.sh'),common+'\n'+settings+'\n'+render);
 return spawnSync('bash',['render.sh'],{cwd:dir,encoding:'utf8',timeout:60000});
}
function gray(file,ss=0,d=.4){return ff(['-ss',String(ss),'-i',file,'-t',String(d),'-vf','scale=80:45,format=gray','-f','rawvideo','-'],{encoding:null});}
function mae(a,b){assert.equal(a.length,b.length);let d=0;for(let i=0;i<a.length;i++)d+=Math.abs(a[i]-b[i]);return d/a.length;}
test('live outgoing frames continue across J-cut; every transition preserves frame count', {timeout:120000},()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'cinematic-edit-'));
 try{
  mkdirSync(path.join(dir,'work'));
  ff(['-f','lavfi','-i','testsrc2=size=160x90:rate=30:duration=3','-c:v','libx264','-pix_fmt','yuv420p',path.join(dir,'a.mp4')]);
  ff(['-f','lavfi','-i','color=blue:size=160x90:rate=30:duration=3','-c:v','libx264','-pix_fmt','yuv420p',path.join(dir,'b.mp4')]);
  let r=runRender(dir,"IDX=0; FVIS=(a.mp4); HANDLE_FRAMES=12; RENDER_FRAMES=72; RENDER_D=2.4");
  assert.equal(r.status,0,r.stdout+r.stderr);
  assert.equal(Number(probe(path.join(dir,'work/handle0.mp4')).nb_read_frames),12);
  const handle=gray(path.join(dir,'work/handle0.mp4'));
  assert.ok(mae(handle,gray(path.join(dir,'a.mp4'),2))<3,'handle must contain unseen source frames after the boundary');
  assert.ok(mae(handle.subarray(0,3600),handle.subarray(9*3600,10*3600))>1,'handle must move');
  for(const mode of ['jcut','dissolve','iris','blur','zoom','push','whip','cut','black','white']){
   r=runRender(dir,`IDX=1; FVIS=(b.mp4); HANDLE_FRAMES=0; RENDER_FRAMES=60; RENDER_D=2; PREVIDX=0; TOTF=60; ENTER=${mode}; JOIN=0.4; PUSH_DIR=l2r`);
   assert.equal(r.status,0,mode+': '+r.stdout+r.stderr);
   assert.equal(Number(probe(path.join(dir,'work/v1.mp4')).nb_read_frames),60,mode);
   assert.ok(Math.abs(Number(probe(path.join(dir,'work/v1.mp4')).duration)-2)<.00001,mode+' must preserve duration as well as frame count');
   if(mode==='jcut'){
    copyFileSync(path.join(dir,'work/v1.mp4'),path.join(dir,'jcut.mp4'));
    assert.ok(mae(gray(path.join(dir,'work/v1.mp4')),handle)<3,'J-cut must show moving outgoing footage');
    assert.ok(mae(gray(path.join(dir,'work/v1.mp4'),.5,.2),gray(path.join(dir,'b.mp4'),.5,.2))<3);
   }
  }
  copyFileSync(path.join(dir,'jcut.mp4'),path.join(dir,'work/v1.mp4'));
  const edit=require(path.join(root,'skills/produce/references/edit-plan.js'));
  const checker=require(path.join(root,'skills/produce/references/check-edit-timeline.js'));
  writeFileSync(path.join(dir,'cards.tsv'),cards);
  edit.write(dir,[{}, {transition:'jcut',edit:{transitionSeconds:.4}}]);
  writeFileSync(path.join(dir,'work/edit-timeline.tsv'),'0\t0\t60\tcut\t0\t12\t0\n1\t60\t60\tjcut\t0.4\t0\t0\n');
  writeFileSync(path.join(dir,'join.txt'),"file 'work/v0.mp4'\nfile 'work/v1.mp4'\n");
  ff(['-f','concat','-safe','0','-i',path.join(dir,'join.txt'),'-c','copy',path.join(dir,'reel.mp4')]);
  assert.equal(checker.check(dir).samples.length,1);
  ff(['-f','lavfi','-i','color=black:size=160x90:rate=30:duration=4','-c:v','libx264',path.join(dir,'reel.mp4')]);
  assert.throws(()=>checker.check(dir),/bypassed/);
  r=runRender(dir,'IDX=0; FVIS=(a.mp4); HANDLE_FRAMES=8; RENDER_FRAMES=68; RENDER_D=2.266667; SOURCE_IN=0.2');
  assert.equal(r.status,0,r.stdout+r.stderr);
  assert.ok(mae(gray(path.join(dir,'work/v0.mp4'),0,.2),gray(path.join(dir,'a.mp4'),.2,.2))<3,'authored in-point must reach the rendered picture');
  assert.equal(Number(probe(path.join(dir,'work/handle0.mp4')).nb_read_frames),8);
  r=runRender(dir,'IDX=0; FVIS=(a.mp4); HANDLE_FRAMES=12; RENDER_FRAMES=72; RENDER_D=2.4; SOURCE_IN=1');
  assert.notEqual(r.status,0);assert.match(r.stdout,/including live handle/);
  r=runRender(dir,"IDX=0; FVIS=(a.mp4); REUSED_VIDEO_SHOTS='0'; HANDLE_FRAMES=0; RENDER_FRAMES=90; RENDER_D=3; FRAMES=90; D=3; D1=3");
  assert.equal(r.status,0,r.stdout+r.stderr);
  assert.equal(Number(probe(path.join(dir,'work/v0.mp4')).nb_read_frames),90);
  for(const change of ['SOURCE_IN=0','SOURCE_IN=0.2','HANDLE_FRAMES=12; RENDER_FRAMES=72; RENDER_D=2.4']){
   r=runRender(dir,"IDX=0; FVIS=(a.mp4); REUSED_VIDEO_SHOTS='0'; HANDLE_FRAMES=0; RENDER_FRAMES=60; RENDER_D=2; "+change);
   assert.notEqual(r.status,0);assert.match(r.stdout,/Reused card/);
  }

 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('short narration uses authored breathing room and remains sample-exact',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'cinematic-audio-'));
 try{
  mkdirSync(path.join(dir,'work'));
  ff(['-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=1.5','-c:a','pcm_s16le',path.join(dir,'work/s0.wav')]);
  const block=builder.slice(builder.indexOf('  D0=$(awk'),builder.indexOf('  # ── 6)'));
  writeFileSync(path.join(dir,'audio.sh'),`set -euo pipefail
say(){ echo "$1"; }
CPRE=0; CPOST=0.12; CMIN=0; L=1.5; FPS=30; SPF=1600; HANDLE=0.24; JOIN=0; MAX_DUR=13; IDX=0
`+block);
  const r=spawnSync('bash',['audio.sh'],{cwd:dir,encoding:'utf8'});assert.equal(r.status,0,r.stdout+r.stderr);
  const samples=Number(execFileSync('ffprobe',['-v','error','-show_entries','stream=duration_ts','-of','csv=p=0',path.join(dir,'work/n0.wav')],{encoding:'utf8'}).trim());
  assert.equal(samples,49*1600);assert.ok(samples/48000<2,'no forced four-second hold or 0.4-second pre-roll');
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('delivery gate rejects ad hoc exports, stale media and changed storyboards',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'cinematic-delivery-'));
 const {createHash}=require('node:crypto'),hash=s=>createHash('sha256').update(s).digest('hex');
 const delivery=require(path.join(root,'skills/produce/references/delivery-proof.js'));
 try{
  mkdirSync(path.join(dir,'output/video'),{recursive:true});mkdirSync(path.join(dir,'storyboard'));mkdirSync(path.join(dir,'.work'));
  const source='window.SCENES=[{type:"points",transition:"cut"}];';writeFileSync(path.join(dir,'storyboard/scenes.js'),source);
  const out=path.join(dir,'output/video');writeFileSync(path.join(out,'video.mp4'),'master');writeFileSync(path.join(out,'subs.srt'),'subtitles');
  assert.match(delivery.check(dir),/no current assembly proof/);
  const proof={version:1,kind:'storyboard',scenesSha256:hash(source),editCheckSha256:hash('edit'),assembledSha256:hash('assembly'),outputs:{'video.mp4':hash('master'),'video-sub.mp4':null,'subs.srt':hash('subtitles')}};
  writeFileSync(path.join(out,'delivery-proof.json'),JSON.stringify(proof));assert.equal(delivery.check(dir),null);
  writeFileSync(path.join(out,'video-sub.mp4'),'stale burn');assert.match(delivery.check(dir),/output changed/);rmSync(path.join(out,'video-sub.mp4'));
  writeFileSync(path.join(dir,'storyboard/scenes.js'),source+'\n');assert.match(delivery.check(dir),/storyboard changed/);
  assert.throws(()=>delivery.record(path.join(dir,'.work'),1),/common builder proof/);
  writeFileSync(path.join(dir,'.work/edit.json'),'{}');assert.throws(()=>delivery.record(path.join(dir,'.work'),1),/cannot waive/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
