import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtempSync,writeFileSync,readFileSync,copyFileSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const require=createRequire(import.meta.url),root=path.resolve(import.meta.dirname,'../..');
const ref=path.join(root,'skills/storyboard/references');
const {checkEpisode,checkScene}=require(path.join(ref,'render-routing.js'));
const {render}=require(path.join(ref,'chart-runtime.js'));
const graph=()=>({type:'points',duration:8,title:'Measured comparison',narration:[{tts:'A has sixteen; B has thirty-two.'}],shot:{infoType:'statistic',render:{mode:'data_graph',purpose:'comparison',reason:'Show how much larger B is.',data:{source:'Fixture measurements',unit:'units',chart:'bar',baseline:0,values:[{label:'A',value:16},{label:'B',value:32}],beats:[{group:1,focus:['B'],insight:'B is twice A.'}]}}},visual:{slide:{file:'slides/s1-chart.html',kind:'diagram',motion:true,treatment:'editorial',role:'statistic',motif:'value on a shared scale',quality:'object-state-v1',chartRenderer:'svg-v1',motionBeats:[{group:1,primitive:'chart-reveal'}],subject:{kind:'data',changes:[{group:1,before:'No values visible',after:'Both values share a zero baseline',driver:'value'}]}}}});
const quote=()=>({type:'points',duration:5,narration:[{tts:'The quoted evidence.'}],shot:{infoType:'other',render:{mode:'editorial_html',purpose:'evidence_quote',reason:'Read the exact admission.',evidence:{source:'The letter',quote:'The quoted evidence.'}}},visual:{slide:{kind:'diagram',motion:true,treatment:'editorial',subject:{kind:'type'}}}});
test('text-led plans have an explicit route, a source and an episode limit',()=>{
 const s=quote();assert.deepEqual(checkScene(s),[]);
 delete s.shot.render.evidence;assert.match(checkScene(s).join(),/exact evidence.quote/);
 const scenes=Array.from({length:9},(_,i)=>{const s=quote();s.shot.render.reason='Explain evidence '+i;s.visual.slide.motionBeats=[{group:1,primitive:'state-transform'}];return s});
 assert.match(checkEpisode({SCENES:scenes}).join(),/text-led slides dominate/);
 assert.deepEqual(checkEpisode({SCENES:scenes.slice(0,2)}),[]);
});
test('copying direction across different scene types is blocked without a mode quota',()=>{
 const scenes=[graph(),graph(),graph()];assert.match(checkEpisode({SCENES:scenes}).join(),/repeated render reason/);
 scenes.forEach((s,i)=>s.shot.render.reason='Specific comparison '+i);assert.deepEqual(checkEpisode({SCENES:scenes}),[]);
 assert.match(checkEpisode({SCENES:scenes,PRELUDE:{duration:2.8}}).join(),/outside the checked timeline/);
});
test('changing text to motionBeats cannot evade the text limit',()=>{
 const s=quote();s.shot.render.mode='object_html';s.visual.slide.motionBeats=[{group:1,primitive:'object-move'}];
 assert.match(checkEpisode({SCENES:[s]}).join(),/must use editorial_html/);
});
test('charts require source-linked, changing focus and valid temporal geometry',()=>{
 const s=graph();assert.deepEqual(checkScene(s),[]);
 const untitled=graph();untitled.title='';assert.match(checkScene(untitled).join(),/data.title/);
 untitled.shot.render.data.title='Measured comparison';assert.deepEqual(checkScene(untitled),[]);
 s.shot.render.data.beats=[];assert.match(checkScene(s,{draft:true}).join(),/one group, focus/);
 const t=graph();t.shot.render.purpose='trend';t.shot.render.data.chart='line';
 assert.match(checkScene(t,{draft:true}).join(),/ISO dates/);
 const d=graph();d.narration.push({tts:'Another line.'});d.shot.render.data.beats.push({...d.shot.render.data.beats[0],group:2});
 assert.match(checkScene(d,{draft:true}).join(),/same focus/);
});
test('SVG rendering keeps true proportions, source labels and repeatable frames',()=>{
 const d=graph().shot.render.data;
 const full=render(d),half=render(d,{progress:.3});
 assert.notEqual(half,full);assert.equal(render(d),full);
 assert.match(full,/width="308"/);assert.match(full,/width="616"/);
 assert.match(full,/>16<\/text>/);assert.match(full,/>32<\/text>/);
 d.decimals=0;d.values=[{label:'A',value:1},{label:'B',value:2}];assert.match(render(d),/>0\.5<\/text>/);
 d.values[0].label='<script>';d.beats[0].focus=['<script>'];assert.ok(!render(d).includes('<script>'));
});
test('focus changes do not restart bars at a narration boundary',()=>{
 const d=graph().shot.render.data;d.beats.push({group:2,focus:['A'],insight:'Inspect A.'});
 assert.equal(render(d,{group:1,progress:1}),render(d,{group:2,progress:0}).replace('aria-label="Inspect A."','aria-label="B is twice A."'));
});
test('production accepts the real chart template and rejects a number-card substitution or stale runtime',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'chart-production-'));
 try{
  mkdirSync(path.join(dir,'slides/assets'),{recursive:true});writeFileSync(path.join(dir,'scenes.js'),'window.SCENES='+JSON.stringify([graph()])+';');
  const html=path.join(dir,'slides/s1-chart.html');copyFileSync(path.join(ref,'chart-slide-template.html'),html);
  for(const name of ['chart-runtime.js','render-routing.js'])copyFileSync(path.join(ref,name),path.join(dir,'slides/assets',name));
  const run=()=>spawnSync(process.execPath,[path.join(ref,'check-slide.js'),dir,'--require-all'],{encoding:'utf8'});
  let r=run();assert.equal(r.status,0,r.stdout+r.stderr);
  writeFileSync(html,readFileSync(html,'utf8').replace('CHART_RUNTIME.render(D,','fakeChart(D,'));r=run();assert.notEqual(r.status,0);assert.match(r.stderr,/must match chart-slide-template/);
  copyFileSync(path.join(ref,'chart-slide-template.html'),html);writeFileSync(path.join(dir,'slides/assets/chart-runtime.js'),'old runtime');
  assert.match(run().stderr,/stale chart runtime/);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
test('builder cannot encode a detached manifest without its source plan',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'build-plan-'));
 try{
  writeFileSync(path.join(dir,'cards.tsv'),'0\tvoice.wav\t4\tnone\n');
  const r=spawnSync('bash',[path.join(root,'skills/produce/references/build-reel.sh'),dir],{encoding:'utf8'});
  assert.notEqual(r.status,0);assert.match(r.stderr,/source storyboard\/scenes.js is required/);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
test('focus is a set and invalid calendar dates cannot move the evidence',()=>{
 const s=graph();s.narration.push({tts:'Second line.'});s.shot.render.data.beats=[{group:1,focus:['A','B'],insight:'Both values.'},{group:2,focus:['B','A'],insight:'Same values.'}];
 assert.match(checkScene(s).join(),/same focus/);
 const t=graph();t.shot.infoType='timeline';t.shot.render.purpose='timeline';Object.assign(t.shot.render.data,{chart:'timeline',values:[{label:'A',date:'2025-02-30'},{label:'B',date:'2025-06-01'}]});
 assert.match(checkScene(t).join(),/ISO dates/);
});
test('small positive shares keep their true geometric width',()=>{
 const d=graph().shot.render.data;Object.assign(d,{chart:'stacked-bar',total:100,values:[{label:'A',value:.1},{label:'B',value:99.9}]});
 const svg=render(d);assert.match(svg,/width="0.728"/);assert.doesNotMatch(svg,/width="0"/);
});
test('checked slide outputs are bound to sources, bytes and segment narration',()=>{
 const {inputs,writeProof,verifyClip}=require(path.join(root,'skills/produce/references/slide-render-proof.js'));
 const {verifyManifest}=require(path.join(root,'skills/produce/references/verify-build-plan.js'));
 const dir=mkdtempSync(path.join(tmpdir(),'slide-proof-'));
 try{
  const board=path.join(dir,'storyboard'),work=path.join(dir,'.work'),out=path.join(work,'motion/slide-s1');
  mkdirSync(path.join(board,'slides/assets'),{recursive:true});mkdirSync(out,{recursive:true});
  const s=graph(),html=path.join(board,s.visual.slide.file),clip=path.join(out,'r1.mp4');
  writeFileSync(path.join(board,'scenes.js'),'window.SCENES='+JSON.stringify([s])+';');writeFileSync(html,'checked HTML');writeFileSync(clip,'rendered clip bytes');
  assert.throws(()=>verifyClip(clip,html,1),/missing render-proof/);
  writeProof(html,out,inputs(html),[{k:1,mp4:clip,nF:240}],30);assert.equal(verifyClip(clip,html,1).duration,8);
  const line='0\t0\t@motion/slide-s1/r1.mp4\t'+s.narration[0].tts+'\t'+s.narration[0].tts+'\n';
  writeFileSync(path.join(work,'segs.tsv'),line);assert.doesNotThrow(()=>verifyManifest(work,board,[s]));
  writeFileSync(path.join(work,'segs.tsv'),line.replace('A has sixteen','Unapproved statement'));assert.throws(()=>verifyManifest(work,board,[s]),/narration\/order/);
  writeFileSync(clip,'old number card');assert.throws(()=>verifyClip(clip,html,1),/differs from its source proof/);
  writeFileSync(clip,'rendered clip bytes');writeFileSync(html,'changed HTML');assert.throws(()=>verifyClip(clip,html,1),/stale or unrelated/);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
test('raw still-camera paths and unrelated source clips cannot bypass the selected renderer',()=>{
 const s={duration:5,shot:{infoType:'other',render:{mode:'still_camera',purpose:'portrait',reason:'Identify the rider.',camera:{effect:'push',target:'face',reason:'Introduce the rider.'}}},visual:{bg:'images/rider.png',camera:{movement:'dolly in'}}};
 assert.match(checkScene(s).join(),/shared camera HTML runtime/);
 const {verifyManifest}=require(path.join(root,'skills/produce/references/verify-build-plan.js'));
 const dir=mkdtempSync(path.join(tmpdir(),'source-binding-'));
 try{
  writeFileSync(path.join(dir,'source.mp4'),'declared');writeFileSync(path.join(dir,'old.mp4'),'stale');
  const clip={type:'quote',visual:{clip:'source.mp4'},narration:[]};
  writeFileSync(path.join(dir,'segs.tsv'),'0\t0\t@old.mp4\t\t\n');assert.throws(()=>verifyManifest(dir,dir,[clip]),/differs from the declared/);
  writeFileSync(path.join(dir,'segs.tsv'),'0\t0\t@source.mp4\t\t\n');assert.equal(Object.keys(verifyManifest(dir,dir,[clip])).length,1);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
test('delivery rejects a replaced burned master even when clean master is unchanged',()=>{
 const {check}=require(path.join(root,'skills/produce/references/verify-assembled.js'));
 const {createHash}=require('node:crypto'),hash=s=>createHash('sha256').update(s).digest('hex');
 const dir=mkdtempSync(path.join(tmpdir(),'burned-proof-'));
 try{
  const source='window.SCENES=[];';writeFileSync(path.join(dir,'scenes.js'),source);writeFileSync(path.join(dir,'cards.tsv'),'');writeFileSync(path.join(dir,'segs.tsv'),'');
  writeFileSync(path.join(dir,'build-plan-check.json'),JSON.stringify({storyboard:dir,scenesSha256:hash(source),cardsSha256:hash(''),segsSha256:hash(''),mediaSha256:{}}));
  writeFileSync(path.join(dir,'reel.mp4'),'clean');writeFileSync(path.join(dir,'reel-sub.mp4'),'replaced');writeFileSync(path.join(dir,'subs.srt'),'subtitles');
  writeFileSync(path.join(dir,'assembled-check.json'),JSON.stringify({duration:5,outputs:{'reel.mp4':hash('clean'),'reel-sub.mp4':hash('original'),'subs.srt':hash('subtitles')}}));
  assert.throws(()=>check(dir,'reel.mp4','reel-sub.mp4','subs.srt'),/checked output was replaced: reel-sub/);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
test('clean-only builds record absence and reject a later stale burned copy',t=>{
 const ff=spawnSync('ffmpeg',['-version']);if(ff.error)return t.skip('ffmpeg is unavailable');
 const {check}=require(path.join(root,'skills/produce/references/verify-assembled.js'));
 const {createHash}=require('node:crypto'),hash=s=>createHash('sha256').update(s).digest('hex');
 const dir=mkdtempSync(path.join(tmpdir(),'clean-only-proof-'));
 try{
  mkdirSync(path.join(dir,'work'));
  const clip=path.join(dir,'reel.mp4'),r=spawnSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=black:s=320x180:r=30:d=1','-c:v','libx264','-y',clip]);assert.equal(r.status,0,r.stderr?.toString());
  copyFileSync(clip,path.join(dir,'work/v0.mp4'));
  const source='window.SCENES=[{duration:1,type:"points"}];';writeFileSync(path.join(dir,'scenes.js'),source);writeFileSync(path.join(dir,'cards.tsv'),'');writeFileSync(path.join(dir,'segs.tsv'),'');writeFileSync(path.join(dir,'subs.srt'),'');
  writeFileSync(path.join(dir,'build-plan-check.json'),JSON.stringify({storyboard:dir,scenesSha256:hash(source),cardsSha256:hash(''),segsSha256:hash(''),mediaSha256:{},cards:[0]}));
  assert.doesNotThrow(()=>check(dir));assert.doesNotThrow(()=>check(dir,'reel.mp4','reel-sub.mp4','subs.srt'));
  copyFileSync(clip,path.join(dir,'reel-sub.mp4'));
  assert.throws(()=>check(dir,'reel.mp4','reel-sub.mp4','subs.srt'),/checked output was replaced/);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
