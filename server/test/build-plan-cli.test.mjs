import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
const require=createRequire(import.meta.url);
const root=path.resolve(import.meta.dirname,'../..');
const cli=path.join(root,'skills/produce/references/verify-build-plan.js');
const {verifyManifest}=require(cli);
const video=require('../../skills/produce/references/assembly-video-gate.js');
const groups=require('../../skills/produce/references/video-groups.js');

test('grouped manifest import and direct build-plan CLI both run, retaining HITL and input errors',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'build-plan-cli-'));
 const board=path.join(dir,'storyboard'),work=path.join(dir,'.work');
 mkdirSync(board);mkdirSync(work);
 try {
  const clip=path.join(work,'source.mp4'),voice=path.join(work,'voice.wav');
  execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=size=160x90:rate=24:duration=3','-c:v','libx264','-pix_fmt','yuv420p',clip]);
  execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','anullsrc=r=24000:cl=mono','-t','1.88',voice]);
  const s={type:'cover',duration:2,transition:'cut',narration:[{tts:'',sub:''},{tts:'',sub:''}],
   shot:{render:{mode:'generated_video'}},visual:{video:{groupPlan:{fps:30,bodyFrames:60,groups:[
    {segment:0,startFrame:0,clip,sha256:groups.hash(clip),in:.25},
    {segment:1,startFrame:30,clip,sha256:groups.hash(clip),in:1.25}
   ]}}}};
  writeFileSync(path.join(board,'scenes.js'),`window.FORMAT='youtube-long-16x9';window.PRODUCTION={mode:'full_video'};window.SCENES=${JSON.stringify([s])};`);
  writeFileSync(path.join(work,'cards.tsv'),'0\tvoice.wav\t2\tnone\n');
  const rows=`0\t0\t${clip}\t\t\n0\t1\t${clip}\t\t\n`;
  writeFileSync(path.join(work,'segs.tsv'),rows);
  const source=readFileSync(path.join(board,'scenes.js'));
  const run=()=>spawnSync(process.execPath,['--trace-warnings',cli,work,board],{encoding:'utf8',env:{...process.env,W:'160',H:'90',BURN:'1',OUTRO:'0'}});
  // The old implementation passes this API check but fails in the fresh CLI process.
  assert.equal(Object.keys(verifyManifest(work,board,[s],'youtube-long-16x9')).length,1);
  let result=run();
  assert.equal(result.status,1);
  assert.match(result.stderr,/Video checks need HITL/);
  assert.doesNotMatch(result.stderr,/is not a function|circular dependency/);
  const warnings=JSON.parse(readFileSync(path.join(work,'assembly-video-warnings.json'))).warnings;
  assert.ok(warnings.length);
  video.approve(work,'Synthetic CLI fixture: user approved the displayed video warnings');
  const approval=readFileSync(path.join(work,'assembly-video-approval.json'));
  result=run();
  assert.equal(result.status,0,result.stdout+result.stderr);
  assert.match(result.stdout,/Assembly preflight complete/);
  assert.doesNotMatch(result.stderr,/is not a function|circular dependency/);
  const report=JSON.parse(readFileSync(path.join(work,'build-plan-check.json')));
  assert.equal(report.videoGate.approved,true);
  assert.deepEqual(report.videoGate.warnings,warnings);
  assert.equal(report.groupPlans[0].groups.length,2);
  assert.deepEqual(readFileSync(path.join(work,'assembly-video-approval.json')),approval);
  assert.deepEqual(readFileSync(path.join(board,'scenes.js')),source);
  writeFileSync(path.join(work,'segs.tsv'),rows.replace('0\t1\t','0\t0\t'));
  result=run();
  assert.equal(result.status,1);
  assert.match(result.stderr,/manifest source\/order differs/);
  assert.doesNotMatch(result.stderr,/is not a function|circular dependency|Video checks need HITL/);
 } finally {rmSync(dir,{recursive:true,force:true});}
});
