import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtempSync,readFileSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync,spawnSync} from 'node:child_process';
const require=createRequire(import.meta.url),root=path.resolve(import.meta.dirname,'../..');
const groups=require('../../skills/produce/references/video-groups.js');
const {verifyManifest}=require('../../skills/produce/references/verify-build-plan.js');
const edits=require('../../skills/produce/references/edit-plan.js');
const builder=readFileSync(path.join(root,'skills/produce/references/build-reel.sh'),'utf8');
const render=builder.slice(builder.indexOf('  INS=(); FILT=""; NIN=0'),builder.indexOf('  # ── 7.5)'));
const ff=args=>execFileSync('ffmpeg',['-v','error','-y',...args]);
const scene=(a,b)=>({type:'cover',transition:'cut',narration:[{tts:'first',sub:'one'},{tts:'next',sub:'two'}],shot:{render:{mode:'generated_video'}},visual:{video:{groupPlan:{fps:30,bodyFrames:60,groups:[{segment:0,startFrame:0,clip:a,sha256:groups.hash(a),in:1.5},{segment:1,startFrame:30,clip:b,sha256:groups.hash(b),in:2}]}}}});
const withSources=fn=>{
 const dir=mkdtempSync(path.join(tmpdir(),'video-groups-'));mkdirSync(path.join(dir,'work'));
 try{
  const a=path.join(dir,'a.mp4'),b=path.join(dir,'b.mp4');
  ff(['-f','lavfi','-i','testsrc2=size=160x90:rate=24:duration=4','-c:v','libx264','-pix_fmt','yuv420p',a]);
  ff(['-f','lavfi','-i','color=blue:size=160x90:rate=24:duration=4','-c:v','libx264','-pix_fmt','yuv420p',b]);
  fn({dir,a,b,s:scene(a,b)});
 }finally{rmSync(dir,{recursive:true,force:true});}
};
test('groups bind source bytes, ordered manifest, 24fps trims and output30fps handles',()=>withSources(({dir,s})=>{
 const p=groups.compile(s,dir,{handleFrames:8});assert.deepEqual(p.groups.map(g=>g.frames),[30,38]);assert.equal(p.groups[0].sourceIn,1.5);assert.equal(p.groups[0].sourceFps,24);
 const rows=s.narration.map((n,j)=>`0\t${j}\t${p.groups[j].file}\t${n.tts}\t${n.sub}`).join('\n')+'\n';writeFileSync(path.join(dir,'segs.tsv'),rows);
 assert.equal(Object.keys(verifyManifest(dir,dir,[s,{type:'outro'}],'youtube-long-16x9')).length,2);
 for(const change of [x=>x.visual.video.groupPlan.groups.reverse(),x=>x.visual.video.groupPlan.groups[1].startFrame=0,x=>x.visual.video.groupPlan.groups[0].sha256='f'.repeat(64),x=>x.visual.video.groupPlan.groups[1].in=3.9,x=>x.edit={in:1.5}]){
  const x=structuredClone(s);change(x);assert.throws(()=>groups.compile(x,dir,{handleFrames:8}));
 }
 assert.throws(()=>groups.compile(s,dir,{bodyFrames:61}),/clock differs/);
 assert.throws(()=>groups.compile(s,dir,{fps:24}),/clock differs/);
 assert.throws(()=>groups.compile(s,dir,{handleFrames:-1}),/handle/);
 assert.throws(()=>groups.declaration(s,{mode:'hybrid'}),/full_video/);
 writeFileSync(path.join(dir,'segs.tsv'),rows.replace(p.groups[1].file,p.groups[0].file));assert.throws(()=>verifyManifest(dir,dir,[s],'youtube-long-16x9'),/source\/order/);
 s.visual.video.groupPlan.groups[0].in=1.501;
 assert.equal(groups.compile(s,dir).groups[0].sourceIn,37/24,'trim rounds forward to source24fps frame');
 s.visual.video.groupPlan.groups[1].in=3.001;
 assert.throws(()=>groups.compile(s,dir),/too short/,'rounded trim cannot overrun the source');
}));
test('source81 frames covers body95 plus6 output30fps handle, without adding handle twice',()=>withSources(({dir,a,s})=>{
 const file=path.join(dir,'short.mp4');ff(['-i',a,'-frames:v','81','-c:v','libx264',file]);
 s.narration=[s.narration[0]];s.visual.video.groupPlan={fps:30,bodyFrames:95,groups:[{segment:0,startFrame:0,clip:file,sha256:groups.hash(file),in:0}]};
 assert.equal(groups.compile(s,dir,{handleFrames:6}).groups[0].frames,101);
 assert.throws(()=>groups.compile(s,dir,{handleFrames:7}),/too short/);
 const e=edits.preview([s,{type:'points',transition:'jcut',edit:{transitionSeconds:.2}}]);assert.equal(e[0].handle,.2);
 assert.equal(edits.preview([s,{type:'points',transition:'dip',edit:{pre:0}}])[0].handle,0);
}));
test('common builder renders direct group cut, trims and live handle; provenance catches substitutions', {timeout:60000},()=>withSources(({dir,s})=>{
 const plan=groups.compile(s,dir,{handleFrames:8});
 const settings=`set -euo pipefail
say(){ echo "$1"; }
W=160; H=90; FPS=30; FULL_VIDEO_SHOTS='0 1'; REUSED_VIDEO_SHOTS=''; MV=2; FOFF=(0 1); FDUR=(0 0)
FVIS=(${plan.groups.map(g=>g.file).join(' ')}); GIN=(1.5 2); GFR=(30 38); GROUPED=1
SPANSET=1; SPAN=0.035; ZOOM_SPAN=0.035; PAN=''; EASE=linear; KB_EASE=linear; DRIFT=0; FX=0.5; FY=0.5; ZDIR=none; N=1; ZB=240:135; SCENE_FADE=0.3
WHIP_BLUR=9; ZOOM_THRU=0.3; PREVEXIT=''; EXITM=''; PUSH_DIR=''; WARN=0
FRAMES=60; D=2; D1=2; SOURCE_IN=0; TOTF=0; JOIN=0; ENTER=cut; PREVIDX=''; IDX=0; HANDLE_FRAMES=8; RENDER_FRAMES=68; RENDER_D=2.266666667
`;
 writeFileSync(path.join(dir,'render.sh'),settings+render);
 const run=spawnSync('bash',['render.sh'],{cwd:dir,encoding:'utf8'});assert.equal(run.status,0,run.stdout+run.stderr);
 const scenes=[s,{type:'points',transition:'jcut',edit:{transitionSeconds:.24}}];
 // .24s rounds to8 frames: the same compiler and renderer rule as ep10c s01.
 writeFileSync(path.join(dir,'cards.tsv'),'0\tvoice.wav\t0\tnone\n1\tvoice.wav\t0\tnone\n');edits.write(dir,scenes);
 writeFileSync(path.join(dir,'work/groups0.json'),JSON.stringify(plan));
 writeFileSync(path.join(dir,'scenes.js'),'window.PRODUCTION={mode:"full_video"};window.SCENES='+JSON.stringify(scenes)+';');
 writeFileSync(path.join(dir,'segs.tsv'),plan.groups.map((g,j)=>`0\t${j}\t${g.file}\t${s.narration[j].tts}\t${s.narration[j].sub}`).join('\n')+'\n');
 const helper=(frames=60,handle=8)=>spawnSync(process.execPath,[path.join(root,'skills/produce/references/video-groups.js'),dir,dir,'0','30',String(frames),String(handle)],{encoding:'utf8'});
 assert.equal(helper().status,0);
 assert.match(helper(61).stderr,/clock differs/);
 assert.match(helper(60,7).stderr,/handle differs/);
 const resolved=readFileSync(path.join(dir,'cards.resolved.tsv'),'utf8');
 writeFileSync(path.join(dir,'cards.resolved.tsv'),resolved.replace('none','in'));
 assert.match(helper().stderr,/zoom=none/);
 writeFileSync(path.join(dir,'cards.resolved.tsv'),resolved);
 const proof={groupPlans:{0:plan}};
 assert.equal(groups.verifyRendered(dir,dir,scenes,proof).length,1);
 const handleFile=path.join(dir,'work/handle0.mp4'),savedHandle=readFileSync(handleFile);
 ff(['-f','lavfi','-i','color=red:size=160x90:rate=30','-frames:v','8','-c:v','libx264',handleFile]);
 assert.throws(()=>groups.verifyRendered(dir,dir,scenes,proof),/live handle differs/);
 writeFileSync(handleFile,savedHandle);
 const raw=(file,at)=>execFileSync('ffmpeg',['-v','error','-ss',String(at),'-i',file,'-frames:v','1','-vf','scale=80:46,format=gray','-f','rawvideo','-']);
 assert.notDeepEqual(raw(path.join(dir,'work/v0.mp4'),.9),raw(path.join(dir,'work/v0.mp4'),1.1),'direct cut must switch source at output frame30');
 ff(['-f','lavfi','-i','color=red:size=160x90:rate=30:duration=2','-c:v','libx264',path.join(dir,'work/v0.mp4')]);
 assert.throws(()=>groups.verifyRendered(dir,dir,scenes,proof),/differs from declared/);
}));
