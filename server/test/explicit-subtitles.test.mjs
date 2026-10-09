import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync,execFileSync} from 'node:child_process';
const require=createRequire(import.meta.url);
const ref=path.resolve(import.meta.dirname,'../../skills/produce/references');
const subs=require(path.join(ref,'explicit-subtitles.js'));
const gate=require(path.join(ref,'assembly-video-gate.js'));
const plan=require(path.join(ref,'verify-build-plan.js'));
const reel=readFileSync(path.join(ref,'build-reel.sh'),'utf8');
const stage=reel.slice(reel.indexOf('  # ── 8)'),reel.indexOf('  echo "$IDX"',reel.indexOf('  # ── 8)')));
const inputStage=reel.slice(reel.indexOf('  # Subtitle inputs use'),reel.indexOf('  SAMPLES=',reel.indexOf('  # Subtitle inputs use')));
const hash=f=>createHash('sha256').update(readFileSync(f)).digest('hex');
function fixture(t,texts=['그대로의 자막입니다.']) {
  const dir=realpathSync(mkdtempSync(path.join(tmpdir(),'explicit-subs-')));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const work=path.join(dir,'.work'),board=path.join(dir,'storyboard');
  mkdirSync(work);mkdirSync(board);mkdirSync(path.join(work,'work'));
  const scenes=[{type:'cover',duration:2,narration:texts.map(sub=>({tts:sub,sub}))}];
  const file=path.join(work,'one.tsv');
  const source=path.join(board,'scenes.js');
  writeFileSync(source,`window.SCENES=${JSON.stringify(scenes)};`);
  writeFileSync(path.join(work,'segs.tsv'),texts.map((s,i)=>`0\t${i}\tclip.mp4\t${s}\t${s}\n`).join(''));
  const cards=opts=>writeFileSync(path.join(work,'cards.tsv'),`0\tvoice.wav\t2\tnone${opts?'\t'+opts:''}\n`);
  cards('subs=one.tsv,subs-mode=replace');
  const write=text=>writeFileSync(file,text);
  write(texts.map((s,i)=>`${i}\t${i+.8}\t${s}\n`).join(''));
  const proof=()=>{
    const p={storyboard:board,scenesSha256:hash(source),cardsSha256:hash(path.join(work,'cards.tsv')),segsSha256:hash(path.join(work,'segs.tsv')),mediaSha256:subs.media(work,scenes)};
    writeFileSync(path.join(work,'build-plan-check.json'),JSON.stringify(p));return p;
  };
  const render=({mode='replace',subMode='sentence',duration=2,offset=0}={})=>{
    for(const n of ['subs.body','subs.srtbody'])writeFileSync(path.join(work,'work',n),'');
    const shell=`set -eu
SUB=1; TOTF=${offset*30}; FPS=30; FRAMES=${duration*30}; CPRE=0; M=${texts.length}; SUB_MODE=${subMode}; SUBS_MODE=${mode}; MUTE=1; L=1.8; D=${duration}; IDX=0; SRTN=0
BARR=(1); SARR=(${texts.map(s=>"'"+s.replaceAll("'","'\\''")+"'").join(' ')}); TARR=("${texts.join(' ')}"); SUBSF=${mode==='auto'?"''":'one.tsv'}
HERE='${ref}'; STORYBOARD='${board}'; SUB_WORD_MIN=0.10; WSTYLE=Word; PHRASE_ARG=''; SUB_ACCENT=''; ALIGN_PID=''
say() { :; }
asstime() { awk -v t="$1" 'BEGIN{h=int(t/3600);m=int((t-h*3600)/60);s=t-h*3600-m*60;printf "%d:%02d:%05.2f",h,m,s}'; }
srttime() { awk -v t="$1" 'BEGIN{h=int(t/3600);m=int((t-h*3600)/60);s=t-h*3600-m*60;printf "%02d:%02d:%06.3f",h,m,s}' | tr '.' ','; }
${inputStage}
${stage}`;
    const run=spawnSync('bash',['-c',shell],{cwd:work,encoding:'utf8'});
    return {...run,ass:readFileSync(path.join(work,'work/subs.body'),'utf8'),srt:readFileSync(path.join(work,'work/subs.srtbody'),'utf8')};
  };
  return {work,board,scenes,file,source,write,cards,proof,render};
}
test('original 1-segment/1-file repro stays additive by default; replace emits one identical sentence in both outputs',t=>{
  const f=fixture(t);
  f.write('0\t2\t그대로의 자막입니다.\n');
  f.cards('subs=one.tsv');f.proof();
  const append=f.render({mode:'append'});
  assert.equal(append.status,0,append.stderr);
  const ass='Dialogue: 0,0:00:00.00,0:00:02.00,Sub,,0,0,0,,{\\fad(160,120)}그대로의 자막입니다.\n';
  assert.equal(append.ass,ass.repeat(2));
  assert.equal(append.srt,'1\n00:00:00,000 --> 00:00:02,000\n그대로의 자막입니다.\n\n2\n00:00:00,000 --> 00:00:02,000\n그대로의 자막입니다.\n\n');
  f.cards('subs=one.tsv,subs-mode=replace');f.proof();
  for(const subMode of ['sentence','word','phrase']){
    const r=f.render({subMode});assert.equal(r.status,0,r.stderr);
    assert.equal(r.ass,ass);assert.equal(r.srt,append.srt.slice(0,append.srt.indexOf('\n\n2')+2));
  }
  f.cards('');f.proof();
  const auto=f.render({mode:'auto'});assert.equal(auto.status,0,auto.stderr);assert.equal(auto.ass,ass);
});
test('replacement keeps exact ordered texts and offsets, even without final newline; adjacent card stays automatic',t=>{
  const f=fixture(t,['첫 문장.','두 번째 문장.']);
  f.write('# reviewed\n0.1\t0.9\t첫 문장.\n1\t1.8\t두 번째 문장.');f.proof();
  const r=f.render({offset:10});assert.equal(r.status,0,r.stderr);
  assert.equal((r.ass.match(/^Dialogue:/gm)||[]).length,2);assert.equal((r.srt.match(/ --> /g)||[]).length,2);
  assert.match(r.ass,/0:00:10.10,0:00:10.90.*첫 문장/);assert.match(r.srt,/00:00:11,000 --> 00:00:11,800\n두 번째 문장/);
  f.cards('');f.proof();
  const next=f.render({mode:'auto',offset:12});assert.equal(next.status,0,next.stderr);
  assert.equal((next.ass.match(/^Dialogue:/gm)||[]).length,2);assert.match(next.srt,/00:00:12,000/);
});
test('exact fractional-frame card boundary rejects V1 overshoot and keeps V2 outputs inside both clocks',t=>{
  const f=fixture(t);f.scenes[0].duration=12.7;
  writeFileSync(f.source,`window.SCENES=${JSON.stringify(f.scenes)};`);
  f.write('8.32\t12.667\t그대로의 자막입니다.\n');f.proof();
  const bad=f.render({duration:380/30,offset:478/30});assert.notEqual(bad.status,0);assert.match(bad.stderr,/outside card/);assert.equal(bad.ass,'');
  f.write('8.32\t12.666\t그대로의 자막입니다.\n');f.proof();
  const good=f.render({duration:380/30,offset:478/30});assert.equal(good.status,0,good.stderr);
  assert.match(good.ass,/0:00:24.26,0:00:28.59/);assert.match(good.srt,/00:00:24,260 --> 00:00:28,590/);
});
test('replacement input errors stop preflight before HITL and before output; scene/segment source cannot be bypassed',t=>{
  const f=fixture(t,['첫 문장.','두 문장.']);
  for(const text of [
    'NaN\t.8\t첫 문장.\n1\t1.8\t두 문장.\n',
    '0\tInfinity\t첫 문장.\n1\t1.8\t두 문장.\n',
    '-1\t.8\t첫 문장.\n1\t1.8\t두 문장.\n',
    '1\t0\t첫 문장.\n1\t1.8\t두 문장.\n',
    '0\t1.1\t첫 문장.\n1\t1.8\t두 문장.\n',
    '0\t0.001\t첫 문장.\n1\t1.8\t두 문장.\n',
    '0\t0.8\t다른 문장.\n1\t1.8\t두 문장.\n',
    '0\t0.8\t두 문장.\n1\t1.8\t첫 문장.\n',
    '0\t0.8\t첫 문장.\n1\t1.8\t첫 문장.\n',
    '0\t0.8\t첫 문장.\n',
    '0\t0.8\t첫 문장.\n1\t1.8\t두 문장.\textra\n'
  ]){
    f.write(text);assert.throws(()=>plan.verify(f.work,f.board),/subtitle/i);
  }
  f.write('0\t0.8\t첫 문장.\n1\t1.8\t두 문장.\n');
  f.proof();const short=f.render({duration:1.5});assert.notEqual(short.status,0);assert.equal(short.ass,'');assert.equal(short.srt,'');
  f.write('0\t0.8\t첫 문장.\n1\t2.1\t두 문장.\n');f.proof();
  const overflow=f.render();assert.notEqual(overflow.status,0);assert.equal(overflow.ass,'');assert.equal(overflow.srt,'');
  f.write('0\t0.8\t첫 문장.\n1\t1.8\t두 문장.\n');f.proof();
  writeFileSync(path.join(f.work,'segs.tsv'),'0\t0\tclip.mp4\t첫 문장.\t\n0\t1\tclip.mp4\t두 문장.\t\n');
  const changed=f.render();assert.notEqual(changed.status,0);assert.match(changed.stderr,/source plan changed/);
  assert.throws(()=>plan.verifyManifest(f.work,f.board,f.scenes,'youtube-long-16x9'),/narration\/order/);
});
test('missing/mutated subtitle bytes invalidate checked input, output and warning approval in both modes',t=>{
  const f=fixture(t);
  for(const mode of ['append','replace']) {
    f.cards('subs=one.tsv,subs-mode='+mode);f.write('0\t1.8\t그대로의 자막입니다.\n');
    const p=f.proof(),snapshot=gate.snapshot(f.work,f.board);
    assert.equal(p.mediaSha256[f.file],hash(f.file));
    assert.throws(()=>gate.decide(f.work,f.board,['fixture warning'],snapshot),/HITL/);
    gate.approve(f.work,'Fixture explicit warning approval');
    assert.equal(gate.decide(f.work,f.board,['fixture warning'],snapshot).approved,true);
    f.write('0\t1.7\t그대로의 자막입니다.\n');
    assert.throws(()=>subs.match(f.work,f.scenes,p),/stale subtitle/);
    const r=f.render({mode});assert.notEqual(r.status,0);assert.equal(r.srt,'');assert.equal(r.ass,'');
    assert.throws(()=>gate.decide(f.work,f.board,['fixture warning'],gate.snapshot(f.work,f.board)),/HITL/);
    const stale={...p,mediaSha256:{}};assert.throws(()=>subs.match(f.work,f.scenes,stale),/missing or stale/);
    rmSync(f.file);assert.throws(()=>subs.media(f.work,f.scenes),/ENOENT/);
  }
});
test('legacy append retains clamping, text independent of narration and word/phrase splitting',t=>{
  const f=fixture(t);f.cards('subs=one.tsv');
  f.write('-1\t4\t추가한 파일 문장입니다.\n');f.proof();
  const sentence=f.render({mode:'append'});assert.equal(sentence.status,0,sentence.stderr);
  assert.match(sentence.srt,/00:00:00,000 --> 00:00:02,000\n추가한 파일 문장입니다/);
  for(const subMode of ['word','phrase']){
    const r=f.render({mode:'append',subMode});assert.equal(r.status,0,r.stderr);
    assert.ok((r.ass.match(/^Dialogue:/gm)||[]).length>=2);assert.equal((r.srt.match(/ --> /g)||[]).length,2);
  }
});
test('mode/file options, UTF-8, rendering controls and finite duration fail closed; TTS fallback stays exact',t=>{
  const f=fixture(t);
  for(const opts of ['subs-mode=replace','subs=','subs=one.tsv,subs-mode=','subs=one.tsv,subs-mode=typo','subs=one.tsv,subs=one.tsv']){
    f.cards(opts);assert.throws(()=>subs.inputs(f.work,f.scenes));
  }
  f.cards('subs=one.tsv,subs-mode=replace');
  f.write(Buffer.from([0xff]));assert.throws(()=>subs.inputs(f.work,f.scenes));
  for(const sub of ['{tag}','back\\slash','control\x01']){
    f.scenes[0].narration=[{sub}];f.write(`0\t1\t${sub}\n`);assert.throws(()=>subs.inputs(f.work,f.scenes),/rendering/);
  }
  f.scenes[0].narration=[{tts:'음성 본문.'}];f.write('0\t1\t음성 본문.\n');
  assert.equal(subs.inputs(f.work,f.scenes)[0].rows[0][2],'음성 본문.');
  for(const duration of [0,NaN,Infinity])assert.throws(()=>subs.replacement(readFileSync(f.file),f.scenes[0],duration),/duration/);
});
test('fresh build-plan CLI binds the file; final assembly rejects removed proof entries and changed/missing inputs',t=>{
  const f=fixture(t),clip=path.join(f.work,'source.mp4');
  execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=size=160x90:rate=30:duration=2','-c:v','libx264','-pix_fmt','yuv420p',clip]);
  writeFileSync(path.join(f.work,'voice.wav'),'fixture silent source');
  f.scenes[0].transition='cut';f.scenes[0].visual={renderedFile:clip};
  f.scenes[0].narration[0].tts='';
  writeFileSync(f.source,`window.FORMAT='youtube-long-16x9';window.PRODUCTION={mode:'full_video'};window.SCENES=${JSON.stringify(f.scenes)};`);
  writeFileSync(path.join(f.work,'segs.tsv'),`0\t0\t${clip}\t\t그대로의 자막입니다.\n`);
  const run=name=>spawnSync(process.execPath,[path.join(ref,name),f.work,f.board],{encoding:'utf8',env:{...process.env,W:'160',H:'90'}});
  let r=run('verify-build-plan.js');assert.notEqual(r.status,0);assert.match(r.stderr,/HITL/);
  gate.approve(f.work,'Synthetic integration fixture warning approval');
  r=run('verify-build-plan.js');assert.equal(r.status,0,r.stdout+r.stderr);
  const record=path.join(f.work,'build-plan-check.json'),proof=JSON.parse(readFileSync(record));
  assert.equal(proof.mediaSha256[f.file],hash(f.file));
  const final=()=>spawnSync(process.execPath,[path.join(ref,'verify-assembled.js'),f.work],{encoding:'utf8'});
  const noSubs={...proof,mediaSha256:{...proof.mediaSha256}};delete noSubs.mediaSha256[f.file];
  writeFileSync(record,JSON.stringify(noSubs));
  r=final();assert.notEqual(r.status,0);assert.match(r.stderr,/missing or stale subtitle input provenance/);
  writeFileSync(record,JSON.stringify(proof));f.write('0\t1.7\t그대로의 자막입니다.\n');
  r=final();assert.notEqual(r.status,0);assert.match(r.stderr,/checked output was replaced.*one.tsv/);
  rmSync(f.file);r=final();assert.notEqual(r.status,0);assert.match(r.stderr,/checked output was replaced.*one.tsv/);
});
