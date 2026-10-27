import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const require=createRequire(import.meta.url);
const ref=path.resolve(import.meta.dirname,'../../skills/produce/references');
const {bound}=require(path.join(ref,'subtitle-clock.js'));
const builder=readFileSync(path.join(ref,'build-reel.sh'),'utf8');
const functions=builder.split('\n').filter(l=>/^(asstime|srttime|autotimes)\(\)/.test(l)).join('\n');
const stage=builder.slice(builder.indexOf('  # ── 8)'),builder.indexOf('  echo "$IDX"',builder.indexOf('  # ── 8)')));
function fixture(t){
  const dir=mkdtempSync(path.join(tmpdir(),'subtitle-clock-'));
  mkdirSync(path.join(dir,'work'));t.after(()=>rmSync(dir,{recursive:true,force:true}));return dir;
}
function render(t,{fps=30,start=1,frames=91,mode='sentence',text='원래 문장 시각을 유지합니다.',min='.1',speech}={}){
  const dir=fixture(t);for(const n of ['subs.body','subs.srtbody'])writeFileSync(path.join(dir,'work',n),'');
  const q=s=>"'"+s.replaceAll("'","'\\''")+"'";
  const script=`set -euo pipefail
${functions}
HERE=${q(ref)}; FPS=${fps}; TOTF=${start}; FRAMES=${frames}; D=$(awk -v n="$FRAMES" -v f="$FPS" 'BEGIN{printf "%.6f",n/f}'); L=${speech??'"$D"'}
SUB=1; SUBS_MODE=append; SUBSF=''; CPRE=0; M=1; MUTE=1; IDX=0; SRTN=0; SUB_MODE=${mode}; BARR=(); SARR=(${q(text)}); TARR=(${q(text)})
SUB_WORD_MIN=${min}; WSTYLE=Word; PHRASE_ARG=''; SUB_ACCENT=''; ALIGN_PID=''; say() { printf '%s\\n' "$1" >&2; }
${mode==='phrase'?"PHRASE_ARG='--phrase 6'":''}
${stage}`;
  const r=spawnSync('bash',['-c',script],{cwd:dir,encoding:'utf8'});
  return {...r,srt:readFileSync(path.join(dir,'work/subs.srtbody'),'utf8'),ass:readFileSync(path.join(dir,'work/subs.body'),'utf8')};
}
const ticks=(s,k)=>{const [h,m,sec]=s.replace(',','.').split(':');return Math.round((Number(h)*3600+Number(m)*60+Number(sec))*k);};
for(const fps of [24,25,30,60])test(`automatic sentence output stays inside the integer ${fps}fps clock`,t=>{
  for(const start of [0,1,fps*60+1,fps*3600+1]){
    const frames=fps*3+1,r=render(t,{fps,start,frames});assert.equal(r.status,0,r.stderr);
    const srt=r.srt.split('\n')[1].split(' --> '),ass=r.ass.split(',').slice(1,3);
    for(const [times,k] of [[srt,1000],[ass,100]]){
      const [a,b]=times.map(s=>ticks(s,k));assert.ok(a*fps>=start*k);assert.ok(b*fps<=(start+frames)*k);assert.ok(a<b);
    }
    assert.equal((r.srt.match(/ --> /g)||[]).length,1);assert.equal((r.ass.match(/^Dialogue:/gm)||[]).length,1);
    assert.match(r.ass,/\{\\fad\(160,120\)\}/);
  }
});
test('inside ticks and aligned one-tick windows remain unchanged; only outside endpoints move',()=>{
  assert.deepEqual(bound(1,60,30,'00:00:00,033','00:00:02,033','0:00:00.03','0:00:02.03'),['00:00:00,034','00:00:02,033','0:00:00.04','0:00:02.03']);
  assert.deepEqual(bound(0,2,30,'00:00:00,000','00:00:00,067','0:00:00.00','0:00:00.07'),['00:00:00,000','00:00:00,066','0:00:00.00','0:00:00.06']);
  assert.deepEqual(bound(0,180,30,'00:00:00,280','00:00:05,280','0:00:00.28','0:00:05.28'),['00:00:00,280','00:00:05,280','0:00:00.28','0:00:05.28']);
  assert.deepEqual(bound(1,1,100,'00:00:00,010','00:00:00,020','0:00:00.01','0:00:00.02'),['00:00:00,010','00:00:00,020','0:00:00.01','0:00:00.02']);
});
test('minute/hour carry uses integer ticks, including a legacy printf rounding seconds to 60',()=>{
  assert.deepEqual(bound(1799,2,30,'00:00:59,967','00:01:00,033','0:00:59.97','0:01:00.03'),['00:00:59,967','00:01:00,033','0:00:59.97','0:01:00.03']);
  assert.deepEqual(bound(107999,2,30,'00:59:59,967','01:00:00,033','0:59:59.97','1:00:00.03'),['00:59:59,967','01:00:00,033','0:59:59.97','1:00:00.03']);
  assert.deepEqual(bound(1799,2,30,'00:00:60,000','00:01:00,030','0:00:60.00','0:01:00.03'),['00:01:00,000','00:01:00,030','0:01:00.00','0:01:00.03']);
});
test('frame bounds use integer arithmetic for cumulative cards and the builder integer-FPS form',()=>{
  for(const fps of ['24','25','30','60','48','120']){
    const n=BigInt(fps)*3600n+1n;
    const got=bound(String(n),String(BigInt(fps)*2n),fps,'01:00:00,000','01:00:01,999','1:00:00.00','1:00:01.99');
    assert.ok(ticks(got[0],1000)*Number(fps)>=Number(n)*1000);
    assert.ok(ticks(got[2],100)*Number(fps)>=Number(n)*100);
    assert.equal(got[1],'01:00:01,999');assert.equal(got[3],'1:00:01.99');
  }
  // build-reel.sh uses integer shell FPS for SPF and frame arithmetic. This
  // helper does not introduce fractional/decimal FPS support into that builder.
  for(const fps of ['0','-30','30.0','30000/1001','NaN'])assert.throws(()=>bound(0,30,fps,'00:00:00,000','00:00:01,000','0:00:00.00','0:00:01.00'),/frame clock/);
});
test('newly collapsed automatic windows fail in the real shell section instead of losing a cue',t=>{
  const r=render(t,{fps:120,start:1,frames:1});assert.notEqual(r.status,0);assert.match(r.stderr,/collapses at ASS precision/);
  assert.equal(r.srt,'');assert.equal(r.ass,'');
  const cli=spawnSync(process.execPath,[path.join(ref,'subtitle-clock.js'),'1','1','120','00:00:00,008','00:00:00,017','0:00:00.01','0:00:00.02'],{encoding:'utf8'});
  assert.equal(cli.status,1);assert.equal(cli.stdout,'');assert.match(cli.stderr,/collapses/);
});
for(const mode of ['word','phrase'])test(`automatic ${mode} keeps sentence SRT and token/phrase ASS inside the card`,t=>{
  const text='첫 낱말 다음 낱말 마지막 낱말.',r=render(t,{mode,text});assert.equal(r.status,0,r.stderr);
  assert.equal((r.srt.match(/ --> /g)||[]).length,1);assert.match(r.srt,new RegExp(text));
  const events=r.ass.trim().split('\n');assert.ok(events.length>1);
  for(const event of events){const [s,e]=event.split(',').slice(1,3).map(v=>ticks(v,100));assert.ok(s*30>=100);assert.ok(e*30<=9200);assert.ok(s<e);}
  assert.doesNotMatch(r.ass,/\\fad/);
});
test('automatic word-loop failures propagate through pipefail without a success result',t=>{
  const r=render(t,{fps:60,start:0,frames:61,mode:'word',text:'가'.repeat(200)+' 나',min:'0',speech:'1.015'});
  assert.notEqual(r.status,0);assert.match(r.stderr,/automatic word subtitle clock failed/);assert.match(r.stderr,/collapses/);
});
test('31 characters/5 seconds stay at cap; the official checker rejects a boundary-shortened window',t=>{
  const dir=fixture(t),file=path.join(dir,'rate.srt'),text='가'.repeat(31);
  const check=(s,e)=>{writeFileSync(file,`1\n${s} --> ${e}\n${text}\n\n`);return spawnSync('python3',[path.join(ref,'check-final-speech-rate.py'),file,'--json'],{encoding:'utf8'});};
  const aligned=bound(0,180,30,'00:00:00,280','00:00:05,280','0:00:00.28','0:00:05.28');
  const pass=check(...aligned.slice(0,2));assert.equal(pass.status,0);assert.equal(JSON.parse(pass.stdout).peakCueRate,6.2);
  const baseline=check('00:00:00,033','00:00:05,033');assert.equal(baseline.status,0);
  const clipped=bound(1,200,30,'00:00:00,033','00:00:05,033','0:00:00.03','0:00:05.03');
  const fail=check(...clipped.slice(0,2));assert.equal(fail.status,1);assert.equal(JSON.parse(fail.stdout).peakCueRate,6.201);
});

for(const mode of ['sentence','word','phrase'])test(`composed ${mode} subtitles exclude anticipation and reaction gaps`,t=>{
  const dir=fixture(t),board=path.join(dir,'storyboard');mkdirSync(board);
  const {createHash}=require('node:crypto'),{compose}=require(path.join(ref,'compose-speech.js'));
  const {speechRevision}=require(path.join(ref,'../../_shared/speech-contract.js'));
  const voice={engine:'gemini',voiceId:'Kore',language:'ko',speed:1},character={id:'actor',tts:voice};
  const texts=['첫 번째 문장을 말합니다.','두 번째 대사를 답합니다.'];
  const lines=texts.map((tts,i)=>{
    const audio=path.join(dir,`raw${i}.wav`),bytes=Buffer.alloc(44+96000);
    bytes.write('RIFF');bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(48000,24);bytes.writeUInt32LE(96000,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(bytes.length-44,40);
    // A measured one-second audio take; sound quality is outside this timing test.
    writeFileSync(audio,bytes);
    const line={id:`line${i}`,speaker:character.id,delivery:'voiceover',tts,acting:i?{leadInSeconds:1,tailOutSeconds:.5}:{leadInSeconds:5,tailOutSeconds:2}};
    line.audio={path:audio,sha256:createHash('sha256').update(bytes).digest('hex'),revision:speechRevision(line,character),status:'not_reviewed',generation:{generator:'tts_generate',text:tts,language:'ko',voiceSettings:{text:tts,voiceName:voice.voiceId}}};
    return line;
  });
  const win={SB_DOC:{speechPlanVersion:1,characters:[character]},SCENES:[{id:'shot',narration:lines}]};
  writeFileSync(path.join(board,'scenes.js'),Object.entries(win).map(([k,v])=>`window.${k}=${JSON.stringify(v)};`).join('\n'));
  writeFileSync(path.join(dir,'cards.tsv'),'0\traw0.wav\t1\n');
  const composed=compose(dir,board)[0];assert.equal(composed.durationSeconds,10.5);
  for(const n of ['subs.body','subs.srtbody'])writeFileSync(path.join(dir,'work',n),'');
  const q=s=>"'"+s.replaceAll("'","'\\''")+"'";
  const script=`set -euo pipefail
${functions}
HERE=${q(ref)}; FPS=30; TOTF=300; FRAMES=321; D=10.7; L=10.5; SRC=${q(composed.audioPath)}; ACTED_AUDIO=1
SUB=1; SUBS_MODE=append; SUBSF=''; CPRE=.2; M=2; MUTE=1; IDX=0; SRTN=0; SUB_MODE=${mode}; BARR=(8); SARR=(${texts.map(q).join(' ')}); TARR=(${texts.map(q).join(' ')})
SUB_WORD_MIN=.1; WSTYLE=Word; PHRASE_ARG=${mode==='phrase'?"'--phrase 6'":"''"}; SUB_ACCENT=''; ALIGN_PID=''; say() { printf '%s\\n' "$1" >&2; }
${stage}`;
  const result=spawnSync('bash',['-c',script],{cwd:dir,encoding:'utf8'});assert.equal(result.status,0,result.stderr);
  const srt=readFileSync(path.join(dir,'work/subs.srtbody'),'utf8'),ass=readFileSync(path.join(dir,'work/subs.body'),'utf8');
  const expected=[[15200,16200],[19200,20200]];
  const srtIntervals=[...srt.matchAll(/([^\n]+) --> ([^\n]+)/g)].map(m=>[ticks(m[1],1000),ticks(m[2],1000)]);
  assert.deepEqual(srtIntervals,expected);
  const events=ass.trim().split('\n').map(row=>row.split(',').slice(1,3).map(v=>ticks(v,1000)));
  assert.ok(events.length>=(mode==='sentence'?2:4));
  for(const [start,end] of events)assert.ok(expected.some(([lo,hi])=>start>=lo&&end<=hi&&start<end),`caption ${start}..${end} leaks into acting silence`);
  assert.equal(events[0][0],expected[0][0]);assert.equal(events.at(-1)[1],expected[1][1]);
});
