import { setupProject } from './workflow-fixture.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, existsSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '../..');
const ref = path.join(root, 'skills/produce/references');
const builder = readFileSync(path.join(ref, 'build-reel.sh'), 'utf8');
const start = builder.indexOf('# ── 9) Main-part concat');
const end = builder.indexOf('# ── 9.5)', start);
assert.ok(start >= 0 && end > start);
const concat = builder.slice(start, end);
const frameGateStart = builder.indexOf('  ACTUAL_FRAMES=$(ffprobe');
const frameGateEnd = builder.indexOf('  if [ "$HANDLE_FRAMES"', frameGateStart);
assert.ok(frameGateStart >= 0 && frameGateEnd > frameGateStart);
const frameGate = builder.slice(frameGateStart, frameGateEnd);
const ff = (args, options = {}) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], {maxBuffer: 16 * 1024 * 1024, ...options});
const audioSamples = file => execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-map', '0:a:0', '-f', 's16le', '-']);
const frameHashes = file => execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-map', '0:v:0', '-f', 'framemd5', '-'], {encoding: 'utf8'})
  .split('\n').filter(line => line && !line.startsWith('#')).map(line => line.split(',').at(-1).trim());
const probe = file => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_packets',
  '-show_data_hash', 'sha256', '-show_entries', 'stream=time_base,duration_ts,nb_frames:packet=pts,dts,duration,data_hash',
  '-of', 'json', file], {encoding: 'utf8', maxBuffer: 4 * 1024 * 1024}));

// Reproduce the observed MP4: complete CFR packets/mdhd, but a millisecond edit
// list ends early. This fixture does not depend on a muxer version's rounding.
function shortenEditList(file, milliseconds) {
  const bytes = readFileSync(file);
  let edits = 0;
  function boxes(begin, end) {
    for (let at = begin; at + 8 <= end;) {
      const size = bytes.readUInt32BE(at);
      assert.ok(size >= 8 && at + size <= end);
      const type = bytes.toString('ascii', at + 4, at + 8);
      if (['moov', 'trak', 'edts'].includes(type)) boxes(at + 8, at + size);
      if (type === 'elst') {
        assert.equal(bytes[at + 8], 0);
        assert.equal(bytes.readUInt32BE(at + 12), 1);
        bytes.writeUInt32BE(milliseconds, at + 16);
        edits++;
      }
      at += size;
    }
  }
  boxes(0, bytes.length);
  assert.equal(edits, 1);
  writeFileSync(file, bytes);
}

function fixture(fps, fn) {
  const dir = mkdtempSync(path.join(tmpdir(), 'main-concat-'));
  const frames = fps + 1, cards = 8;
  try {
    mkdirSync(path.join(dir, 'work'));
    const clip = path.join(dir, 'source.mp4');
    ff(['-f', 'lavfi', '-i', `testsrc2=size=32x32:rate=${fps}`, '-frames:v', String(frames),
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', clip]);
    const original = probe(clip);
    const originalFrames = frameHashes(clip);
    shortenEditList(clip, Math.floor(frames * 1000 / fps));
    assert.deepEqual(probe(clip).packets, original.packets, 'fixture only changes the container edit duration');
    const ids = Array.from({length: cards}, (_, i) => i);
    for (const i of ids) {
      copyFileSync(clip, path.join(dir, `work/v${i}.mp4`));
      ff(['-f', 'lavfi', '-i', `sine=frequency=${220 + i * 37}:sample_rate=48000`, '-af', `atrim=end_sample=${frames * 48000 / fps}`,
        '-c:a', 'pcm_s16le', path.join(dir, `work/n${i}.wav`)]);
    }
    writeFileSync(path.join(dir, 'work/order.txt'), ids.join('\n') + '\n');
    writeFileSync(path.join(dir, 'work/edit-timeline.tsv'), ids.map(i => `${i}\t${i * frames}\t${frames}\tcut\t0\t0\t0`).join('\n') + '\n');
    const run = () => spawnSync('bash', ['-c', `set -euo pipefail
FPS=${fps}
say() { printf '%s\\n' "$1"; }
${concat}`], {cwd: dir, encoding: 'utf8', timeout: 30000});
    fn({dir, clip, originalFrames, fps, frames, cards, run});
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
}

for (const fps of [24, 60]) test(`main concat preserves ${fps}fps packet clock despite shortened MP4 edit lists`, {timeout: 60000}, () => fixture(fps, ({dir, originalFrames, frames, cards, run}) => {
  const result = run();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.doesNotMatch(result.stderr, /Non-monoton/);
  const video = probe(path.join(dir, 'work/video.mp4'));
  const stream = video.streams[0], [num, den] = stream.time_base.split('/').map(Number);
  const tick = den / (num * fps), count = frames * cards;
  assert.equal(video.packets.length, count);
  const pts = video.packets.map(p => p.pts).sort((a, b) => a - b);
  assert.deepEqual(pts, Array.from({length: count}, (_, i) => i * tick), 'every presentation timestamp stays on the declared frame grid');
  assert.ok(video.packets.every(p => p.duration === tick));
  assert.deepEqual(video.packets.map(p => p.dts), Array.from({length: count}, (_, i) => video.packets[0].dts + i * tick), 'decode timestamps remain continuous');
  assert.equal(stream.duration_ts, count * tick);
  // The concat demuxer's H.264 bitstream filter can repeat parameter sets. The
  // decoded frame hashes verify picture content/order across that repackaging.
  assert.deepEqual(frameHashes(path.join(dir, 'work/video.mp4')), Array.from({length: cards}, () => originalFrames).flat(), 'every decoded frame and its order are unchanged');
  const audio = probe(path.join(dir, 'work/narration.wav')).streams[0];
  assert.equal(audio.time_base, '1/48000');
  assert.equal(audio.duration_ts, count * 48000 / fps, 'narration sample clock is unchanged');
  assert.deepEqual(audioSamples(path.join(dir, 'work/narration.wav')), Buffer.concat(Array.from({length: cards}, (_, i) => audioSamples(path.join(dir, `work/n${i}.wav`)))), 'every audio sample and card order are unchanged');
  assert.match(result.stdout, /drift 0\.0000s/);
}));

test('main concat still stops when rendered frames do not cover the declared audio clock', {timeout: 60000}, () => fixture(30, ({dir, frames, run}) => {
  ff(['-f', 'lavfi', '-i', 'color=red:size=32x32:rate=30', '-frames:v', String(frames - 1),
    '-c:v', 'libx264', path.join(dir, 'work/v7.mp4')]);
  const result = run();
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /drift over the 2ms tolerance/);
}));

test('main concat rejects a missing declared frame count', {timeout: 60000}, () => fixture(30, ({dir, run}) => {
  writeFileSync(path.join(dir, 'work/edit-timeline.tsv'), '');
  const result = run();
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /missing frame count for card 0/);
}));

test('the existing per-card frame gate rejects a truncated middle card before concat', {timeout: 60000}, () => fixture(30, ({dir, frames}) => {
  ff(['-f', 'lavfi', '-i', 'color=red:size=32x32:rate=30', '-frames:v', String(frames - 1),
    '-c:v', 'libx264', path.join(dir, 'work/v3.mp4')]);
  const result = spawnSync('bash', ['-c', `set -euo pipefail
IDX=3; FRAMES=${frames}
say() { printf '%s\\n' "$1"; }
${frameGate}`], {cwd: dir, encoding: 'utf8', timeout: 30000});
  assert.equal(result.status, 1);
  assert.match(result.stdout, /card 3: rendered 30 frames, expected 31/);
}));

// ── Per-card renderer: live handles, every transition, authored in-points and reused cards.
const probeFrames=f=>JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=nb_read_frames,duration','-of','json',f],{encoding:'utf8'})).streams[0];
// Execute the production renderer itself, including its source-length and frame-count gates.
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
test('mixed-rate source covers a rounded output clock only while its last sample exists', t=>{
 const dir=mkdtempSync(path.join(tmpdir(),'mixed-rate-card-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 mkdirSync(path.join(dir,'work'));
 ff(['-f','lavfi','-i','testsrc2=size=160x90:rate=16','-frames:v','273','-c:v','libx264','-pix_fmt','yuv420p',path.join(dir,'a.mp4')]);
 const settings='IDX=0; SYNC=1; MV=3; FVIS=(a.mp4 a.mp4 a.mp4); FOFF=(0 9.35 12.69); FDUR=(0.35 0.35 0.35); FPS=24; HANDLE_FRAMES=0; FRAMES=410; RENDER_FRAMES=410; D=17.083333333; D1=$D; RENDER_D=$D';
 let r=runRender(dir,settings);assert.equal(r.status,0,r.stdout+r.stderr);
 assert.equal(Number(probeFrames(path.join(dir,'work/v0.mp4')).nb_read_frames),410);
 assert.ok(mae(gray(path.join(dir,'work/v0.mp4'),409/24,.04),gray(path.join(dir,'a.mp4'),17,.04))<3,'last output sample comes from the final real source frame');
 r=runRender(dir,settings+'; FRAMES=411; RENDER_FRAMES=411; D=17.125; D1=$D; RENDER_D=$D');
 assert.notEqual(r.status,0);assert.match(r.stdout,/including live handle/);
});
test('a sync card trimmed with in= opens on that source frame', t=>{
 const dir=mkdtempSync(path.join(tmpdir(),'sync-trim-card-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 mkdirSync(path.join(dir,'work'));
 ff(['-f','lavfi','-i','testsrc2=size=160x90:rate=24','-frames:v','96','-c:v','libx264','-pix_fmt','yuv420p',path.join(dir,'a.mp4')]);
 const r=runRender(dir,'IDX=0; SYNC=1; MV=1; FVIS=(a.mp4); FOFF=(0); FDUR=(0.35); FPS=24; HANDLE_FRAMES=0; FRAMES=48; RENDER_FRAMES=48; D=2; D1=$D; RENDER_D=$D; SOURCE_IN=1.5');
 assert.equal(r.status,0,r.stdout+r.stderr);
 assert.equal(Number(probeFrames(path.join(dir,'work/v0.mp4')).nb_read_frames),48);
 const first=gray(path.join(dir,'work/v0.mp4'),0,.04);
 assert.ok(mae(first,gray(path.join(dir,'a.mp4'),1.5,.04))<mae(first,gray(path.join(dir,'a.mp4'),0,.04)),'the card starts at the trimmed source frame');
});
test('live outgoing frames continue across J-cut; every transition preserves frame count', {timeout:120000},()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'cinematic-edit-'));
 try{
  mkdirSync(path.join(dir,'work'));
  ff(['-f','lavfi','-i','testsrc2=size=160x90:rate=30:duration=3','-c:v','libx264','-pix_fmt','yuv420p',path.join(dir,'a.mp4')]);
  ff(['-f','lavfi','-i','color=blue:size=160x90:rate=30:duration=3','-c:v','libx264','-pix_fmt','yuv420p',path.join(dir,'b.mp4')]);
  let r=runRender(dir,"IDX=0; FVIS=(a.mp4); HANDLE_FRAMES=12; RENDER_FRAMES=72; RENDER_D=2.4");
  assert.equal(r.status,0,r.stdout+r.stderr);
  assert.equal(Number(probeFrames(path.join(dir,'work/handle0.mp4')).nb_read_frames),12);
  const handle=gray(path.join(dir,'work/handle0.mp4'));
  assert.ok(mae(handle,gray(path.join(dir,'a.mp4'),2))<3,'handle must contain unseen source frames after the boundary');
  assert.ok(mae(handle.subarray(0,3600),handle.subarray(9*3600,10*3600))>1,'handle must move');
  for(const mode of ['jcut','dissolve','iris','blur','zoom','push','whip','cut','black','white']){
   r=runRender(dir,`IDX=1; FVIS=(b.mp4); HANDLE_FRAMES=0; RENDER_FRAMES=60; RENDER_D=2; PREVIDX=0; TOTF=60; ENTER=${mode}; JOIN=0.4; PUSH_DIR=l2r`);
   assert.equal(r.status,0,mode+': '+r.stdout+r.stderr);
   assert.equal(Number(probeFrames(path.join(dir,'work/v1.mp4')).nb_read_frames),60,mode);
   assert.ok(Math.abs(Number(probeFrames(path.join(dir,'work/v1.mp4')).duration)-2)<.00001,mode+' must preserve duration as well as frame count');
   if(mode==='jcut'){
    copyFileSync(path.join(dir,'work/v1.mp4'),path.join(dir,'jcut.mp4'));
    assert.ok(mae(gray(path.join(dir,'work/v1.mp4')),handle)<3,'J-cut must show moving outgoing footage');
    assert.ok(mae(gray(path.join(dir,'work/v1.mp4'),.5,.2),gray(path.join(dir,'b.mp4'),.5,.2))<3);
   }
  }
  copyFileSync(path.join(dir,'jcut.mp4'),path.join(dir,'work/v1.mp4'));
  const edit=require(path.join(ref,'edit-plan.js'));
  const checker=require(path.join(ref,'check-edit-timeline.js'));
  writeFileSync(path.join(dir,'cards.tsv'),'0\tvoice.wav\t0\tnone\n1\tvoice.wav\t0\tnone\n');
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
  assert.equal(Number(probeFrames(path.join(dir,'work/handle0.mp4')).nb_read_frames),8);
  r=runRender(dir,'IDX=0; FVIS=(a.mp4); HANDLE_FRAMES=12; RENDER_FRAMES=72; RENDER_D=2.4; SOURCE_IN=1');
  assert.notEqual(r.status,0);assert.match(r.stdout,/including live handle/);
  r=runRender(dir,"IDX=0; FVIS=(a.mp4); REUSED_VIDEO_SHOTS='0'; HANDLE_FRAMES=0; RENDER_FRAMES=90; RENDER_D=3; FRAMES=90; D=3; D1=3");
  assert.equal(r.status,0,r.stdout+r.stderr);
  assert.equal(Number(probeFrames(path.join(dir,'work/v0.mp4')).nb_read_frames),90);
  for(const change of ['SOURCE_IN=0','SOURCE_IN=0.2','HANDLE_FRAMES=12; RENDER_FRAMES=72; RENDER_D=2.4']){
   r=runRender(dir,"IDX=0; FVIS=(a.mp4); REUSED_VIDEO_SHOTS='0'; HANDLE_FRAMES=0; RENDER_FRAMES=60; RENDER_D=2; "+change);
   assert.notEqual(r.status,0);assert.match(r.stdout,/Reused card/);
   r=runRender(dir,"IDX=0; FVIS=(a.mp4); REUSED_VIDEO_SHOTS='0'; VIDEO_WARNINGS_APPROVED=1; HANDLE_FRAMES=0; RENDER_FRAMES=60; RENDER_D=2; "+change);
   assert.equal(r.status,0,r.stdout+r.stderr);
   assert.equal(Number(probeFrames(path.join(dir,'work/v0.mp4')).nb_read_frames),60);
  }

 }finally{rmSync(dir,{recursive:true,force:true});}
});

// ── Per-card audio: narration tempo and breathing room.
test('assembly preserves source audio and alignment tempo with legacy rate settings', t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'assembly-tempo-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(path.join(dir, 'work'));
  const source = Buffer.from('unchanged narration samples');
  writeFileSync(path.join(dir, 'work/t0.wav'), source);
  // Execute the production audio stage; fail if it attempts a tempo filter.
  const stage = builder.slice(builder.indexOf('  # ── 3)'), builder.indexOf('  L=$(ffprobe', builder.indexOf('  # ── 3)')));
  assert.ok(stage.includes('work/s$IDX.wav'));
  const run = spawnSync('bash', ['-c', `set -eu\nffmpeg() { return 99; }\nIDX=0\n${stage}\nprintf '%s' "$F"`], {
    cwd: dir, encoding: 'utf8',
    env: { ...process.env, TARGET: '5.2', R0: '9', RATE_TOL: '0.05', ATEMPO_MIN: '0.88', ATEMPO_MAX: '1.128', MUTE: '0' },
  });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, '1.0000');
  assert.deepEqual(readFileSync(path.join(dir, 'work/s0.wav')), source);
  assert.doesNotMatch(builder, /-af\s+"atempo=/);
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
  const r=spawnSync('bash',['audio.sh'],{cwd:dir,encoding:'utf8',env:{...process.env,HERE:ref}});assert.equal(r.status,0,r.stdout+r.stderr);
  const samples=Number(execFileSync('ffprobe',['-v','error','-show_entries','stream=duration_ts','-of','csv=p=0',path.join(dir,'work/n0.wav')],{encoding:'utf8'}).trim());
  assert.equal(samples,49*1600);assert.ok(samples/48000<2,'no forced four-second hold or 0.4-second pre-roll');
 }finally{rmSync(dir,{recursive:true,force:true});}
});

// ── Final mux (the same render() contract in the screencast builder).
for(const filename of ['build-reel.sh','build-screencast.sh'])test(`${filename} final mux preserves audio without rendering or embedding existing subtitle data`,t=>{
 const source=readFileSync(path.join(ref,filename),'utf8');
 const dir=mkdtempSync(path.join(tmpdir(),'clean-video-'));mkdirSync(path.join(dir,'work'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
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

test('the float audience stem preserves long delays, excerpt entrances and a second cue on the PCM clock', t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'audience-delay-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const wav = path.join(dir, 'tone.wav');
  ff(['-f','lavfi','-i','sine=frequency=1200:duration=1:sample_rate=48000', wav]);
  const firstSample = 1249600, secondSample = 1344000;
  const list = [[firstSample / 48000,wav,10,.68,0,4800,9600],[secondSample / 48000,wav,10,.20,0,4800,48]];
  writeFileSync(path.join(dir,'events.tsv'), list.map(row => row.join('\t')).join('\n') + '\n');
  const start = builder.indexOf('sfx_measure() {');
  const end = builder.indexOf('\nif [ "$AUDIENCE_PLAN" = 1 ]; then\n  render_sfx', start);
  assert.ok(start >= 0 && end > start);
  const stage = builder.slice(start, end);
  const script = `set -eu
AUDIENCE_PLAN=0; NT=30; MIX_REFERENCE_I=-18; SFX_SEP=10
say(){ :; }
${stage}
render_sfx events.tsv audience.wav pcm_f32le`;
  const result = spawnSync('bash', ['-c',script], {cwd:dir, encoding:'utf8'});
  assert.equal(result.status, 0, result.stderr);
  const pcm = ff(['-i',path.join(dir,'audience.wav'),'-f','f32le','-']);
  const amplitude = sample => Math.abs(pcm.readFloatLE(sample * 4));
  const silence = (start, end) => pcm.subarray(start * 4, end * 4).every(v => v === 0);
  assert.ok(silence(0, firstSample), 'all samples before 26.033333s must be zero');
  assert.ok(amplitude(firstSample + 1) > 0 && amplitude(firstSample + 490) < amplitude(firstSample + 9610) / 10);
  assert.ok(silence(firstSample + .68 * 48000, secondSample));
  assert.ok(amplitude(secondSample + 1) > 0 && amplitude(secondSample + 50) > .001);
  assert.ok(silence(secondSample + .2 * 48000, 30 * 48000));
});

test('legacy room tone plays on still-camera renders and stops at the source clip', t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'room-tone-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  mkdirSync(path.join(dir, 'work'));
  writeFileSync(path.join(dir, 'scenes.js'), `window.SCENES = [
    {shot:{render:{mode:'still_camera'}},visual:{slide:{kind:'camera'}}},
    {shot:{render:{mode:'generated_video'}}},
    {shot:{render:{mode:'still_camera'}}}
  ];`);
  writeFileSync(path.join(dir, 'stillcards.txt'), '');
  writeFileSync(path.join(dir, 'work/cardstart.tsv'), '0\t0.0000\n1\t2.0000\n2\t4.0000\n');
  writeFileSync(path.join(dir, 'amb.tsv'), '0\troom.wav\n1\tunavailable.wav\n');
  ff(['-f','lavfi','-i','sine=frequency=270:duration=3',path.join(dir,'room.wav')]);
  const start = builder.indexOf('AMBIN=""\nif [ -n "$AMBTSV" ]; then');
  const end = builder.indexOf('\n# 10b)', start);
  assert.ok(start >= 0 && end > start);
  const result = spawnSync('bash', ['-c', `set -eu
HERE=$1; STORYBOARD=$PWD; AMBTSV=amb.tsv; NT=6; MIX_REFERENCE_I=-16; BGM_CUE_XF=2; AMB_SEP=15
say(){ :; }
${builder.slice(start, end)}`, 'ambience', ref], {cwd:dir, encoding:'utf8'});
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(readFileSync(path.join(dir,'work/ambcue.list'),'utf8'), '0.0000\troom.wav\n2.0000\t-\n');
});

test('audience preview and final mix preserve the source and place only selected tones across trimmed cards', {timeout:90000}, () => {
  const dir = mkdtempSync(path.join(tmpdir(),'audience-render-'));
  setupProject(dir);
  try {
    const board = path.join(dir,'storyboard'), work = path.join(dir,'work'), library = path.join(dir,'assets/audio/sfx');
    mkdirSync(board); mkdirSync(work); mkdirSync(library,{recursive:true});
    const source = path.join(work,'source.mp4');
    ff(['-f','lavfi','-i','testsrc2=size=128x224:rate=25:duration=3','-f','lavfi','-i','sine=frequency=200:duration=3:sample_rate=48000',
      '-c:v','libx264','-c:a','aac','-shortest',source]);
    for (const [name,pitch,duration] of [['drone',900,3],['foley',1900,.4]])
      ff(['-f','lavfi','-i',`sine=frequency=${pitch}:duration=${duration}:sample_rate=48000`,path.join(library,name+'.wav')]);
    const chirp = path.join(library, 'chirp.wav');
    ff(['-f','lavfi','-i','sine=frequency=1400:duration=0.2:sample_rate=48000','-af','adelay=600',chirp]);
    const shots = ['s0001','s0002'].map(id => ({id,type:'points',duration:2,narration:[],visual:{clip:source},
      edit:{in:.8,out:2.8},sound:{audioSource:'video',effects:[]}}));
    const make = (id,sfx,atSeconds) => ({id,sfx,atSeconds,delivery:'post',description:'synth',trigger:'shoulders lower',audience:{intent:'relief'}});
    const span = {...make('release','drone',2.2-.8),end:{shotId:'s0002',atSeconds:.5},fadeOutSeconds:.15};
    const point = { ...make('answer','chirp',.45), sourceStartSeconds: .6 };
    shots[0].sound.effects=[span]; shots[1].sound.effects=[point,{id:'foley',sfx:'foley',atSeconds:.45,delivery:'post'}];
    const win={SCENES:shots,MUSIC:{$timeline:[]}}, clock=require('../../skills/storyboard/references/audience-effects.js').boardClock(win,board);
    assert.throws(() => clock.bounds('s0002', { ...point, sourceStartSeconds: .8 }), /source audio in-point/);
    for (const [i,e] of [[0,span],[1,point]]) e.audience.timingBasis=clock.basis(shots[i].id,e,e.end?.shotId);
    writeFileSync(path.join(board,'scenes.js'),Object.entries(win).map(([k,v])=>'window.'+k+'='+JSON.stringify(v)+';').join('\n'));
    writeFileSync(path.join(work,'cards.tsv'),shots.map((_,i)=>i+'\tsource.mp4\t1\tnone').join('\n')+'\n');
    writeFileSync(path.join(work,'segs.tsv'),shots.map((_,i)=>i+'\t0\t'+source+'\t\t').join('\n')+'\n');
    writeFileSync(path.join(work,'amb.tsv'), '0\tunused-room-tone.wav\n');
    const result=spawnSync('bash',[path.join(ref,'build-reel.sh'),work,board,'--audience-sfx','compare','--from-shot','s0001','--to-shot','s0002'],{
      encoding:'utf8',timeout:60000,maxBuffer:8*1024*1024,env:{...process.env,W:'128',H:'224',FPS:'25',OUTRO:'0',COVER_TS:'1'}});
    assert.equal(result.status,0,result.stdout+result.stderr);
    assert.equal(readFileSync(path.join(work,'work/ambcue.list'),'utf8'), '');
    const resolved=JSON.parse(readFileSync(path.join(work,'work/audience-resolved.json')));
    assert.deepEqual(resolved.map(e=>e.bodyStartSeconds),[1.4,2.45]);
    assert.ok(Math.abs(resolved[0].bodyEndSeconds-2.5)<1e-6);
    assert.equal(resolved[1].sourceStartSeconds, .6);
    assert.ok(Math.abs(resolved[1].sourceEndSeconds - .8) < 1e-8 && Math.abs(resolved[1].bodyEndSeconds - 2.65) < 1e-8);
    const samples=file=>ff(['-i',path.join(work,file),'-map','0:a:0','-af','pan=mono|c0=c0','-ar','48000','-f','f32le','-']);
    const off=samples('audience-off.mov'),on=samples('audience-on.mov'),final=samples('reel.mp4');
    assert.equal(off.length,on.length);
    assert.deepEqual(frameHashes(path.join(work,'audience-off.mov')),frameHashes(path.join(work,'audience-on.mov')));
    const range=(buf,a,b)=>buf.subarray(Math.round(a*48000)*4,Math.round(b*48000)*4);
    assert.equal(Buffer.compare(range(off,0,1.399),range(on,0,1.399)),0,'before the first cue');
    assert.equal(Buffer.compare(range(off,2.651,3.9),range(on,2.651,3.9)),0,'after the last cue');
    function band(buf,start,hz,sec=.04) {
      const n=Math.round(sec*48000); let x=0,y=0;
      for(let j=0;j<n;j++){const v=buf.readFloatLE(4*(Math.round(start*48000)+j)),a=2*Math.PI*hz*j/48000;x+=v*Math.cos(a);y+=v*Math.sin(a);}
      return 2*Math.hypot(x,y)/n;
    }
    for(const buf of [on,final]) {
      assert.ok(band(buf,1.46,900)>.008 && band(buf,1.32,900)<.001,'drone starts at trimmed time');
      assert.ok(band(buf,2.54,900)<.001 && band(buf,2.54,1400)>.008,'only the drone ends');
      assert.ok(band(buf,2.54,1900)<.001 && band(buf,1,200)>.01,'old scene effect stays out and the original soundtrack survives');
    }
    assert.ok(band(off,2.54,1900)<.001 && band(off,2.54,1400)<.001);
    // Simulated authorization in a disposable test episode exercises the normal speed pass.
    writeFileSync(path.join(work,'speed-authorization.json'),JSON.stringify({version:1,requests:[{
      scope:'final',factor:1.25,source:'explicit-user-request',request:'Test fixture requests 1.25x playback',requestedAt:'2026-11-20T00:00:00Z'}]}));
    const fast=spawnSync('bash',[path.join(ref,'speedup.sh'),work,'1.25'],{encoding:'utf8',timeout:30000,env:{...process.env,OUTRO:'0',FPS:'25'}});
    assert.equal(fast.status,0,fast.stdout+fast.stderr);
    const delivery=JSON.parse(readFileSync(path.join(work,'delivery-proof.json'))).audienceEffects;
    assert.equal(delivery[1].effectiveFadeInSeconds, .001);
    assert.deepEqual([delivery[1].sourceStartSeconds, delivery[1].sourceEndSeconds, delivery[1].sourceSha256],
      [.6, resolved[1].sourceEndSeconds, require('node:crypto').createHash('sha256').update(readFileSync(chirp)).digest('hex')]);
    assert.ok(Math.abs(delivery[0].deliveryStartSeconds-1.12)<1e-9);
    const shipped=samples('reel-fast.mp4');
    assert.ok(band(shipped,1.06,900,.02)<.002 && band(shipped,1.15,900,.02)>.008,'onset in shipped audio within one frame');
    assert.ok(band(shipped,2.04,900,.02)<.002 && band(shipped,2.04,1400,.02)>.008,'shipped fade leaves the other cue audible');

    // Re-edit the same board: a one-second insert interrupts a natural tail.
    const insert=path.join(work,'insert.mp4');
    ff(['-f','lavfi','-i','color=blue:size=128x224:rate=25:duration=1','-f','lavfi','-i','sine=frequency=420:duration=1:sample_rate=48000',
      '-c:v','libx264','-c:a','aac','-shortest',insert]);
    shots.splice(1,0,{id:'s0003',type:'broll',after:0,duration:1,visual:{clip:insert}});
    delete span.end;delete span.fadeOutSeconds;
    point.atSeconds=.45678;
    const updated=require('../../skills/storyboard/references/audience-effects.js').boardClock(win,board);
    span.audience.timingBasis=updated.basis('s0001',span);
    point.audience.timingBasis=updated.basis('s0002',point);
    writeFileSync(path.join(board,'scenes.js'),Object.entries(win).map(([k,v])=>'window.'+k+'='+JSON.stringify(v)+';').join('\n'));
    writeFileSync(path.join(work,'cards.tsv'),[0,2].map(i=>i+'\tsource.mp4\t1\tnone').join('\n')+'\n');
    writeFileSync(path.join(work,'segs.tsv'),[0,2].map(i=>i+'\t0\t'+source+'\t\t').join('\n')+'\n');
    const runPass=(name,args)=>{
      const pass=spawnSync('bash',[path.join(ref,name),work,...args],{encoding:'utf8',timeout:40000,maxBuffer:8*1024*1024,
        env:{...process.env,W:'128',H:'224',OUTRO:'0',FPS:'25',COVER_TS:'1'}});
      assert.equal(pass.status,0,pass.stdout+pass.stderr);
    };
    runPass('build-reel.sh',[board]);runPass('splice-clip.sh',[insert,'2']);runPass('speedup.sh',['1.25']);
    const withInsert=JSON.parse(readFileSync(path.join(work,'delivery-proof.json'))).audienceEffects;
    assert.equal(withInsert[0].bodyEndSeconds,2);assert.ok(Math.abs(withInsert[0].deliveryEndSeconds-1.6)<1e-8);
    assert.ok(Math.abs(withInsert[1].deliveryStartSeconds-(3+.45678)/1.25)<.04);
    const spliced=samples('reel-fast.mp4');
    assert.ok(band(spliced,1.7,420)>.01 && band(spliced,1.7,900)<.002,'insert keeps its own sound and releases the drone');
    assert.ok(band(spliced,withInsert[1].deliveryStartSeconds+.04,1400)>.008,'next reaction uses the measured insert clock');

    // A bounded excerpt at zero contains just the quiet lead-in, even though the full WAV has a loud chirp.
    point.sourceStartSeconds = 0;
    point.end = { shotId: 's0002', atSeconds: .65 };
    point.audience.timingBasis = updated.basis('s0002', point, 's0002');
    writeFileSync(path.join(board,'scenes.js'),Object.entries(win).map(([k,v])=>'window.'+k+'='+JSON.stringify(v)+';').join('\n'));
    const silent = spawnSync('bash', [path.join(ref,'build-reel.sh'),work,board], {
      encoding:'utf8',timeout:40000,env:{...process.env,W:'128',H:'224',OUTRO:'0',FPS:'25',COVER_TS:'1'} });
    assert.notEqual(silent.status, 0);
    assert.match(silent.stdout + silent.stderr, /chirp\.wav is silent/);

  } finally {rmSync(dir,{recursive:true,force:true});}
});
