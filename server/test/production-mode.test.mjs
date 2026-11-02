import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '../..');
const runtimeMode = require('../../skills/storyboard/references/production-mode.js');
// Existing policy cases inspect diagnostics, not whether automatic execution must stop.
const mode = {...runtimeMode, cameraErrors:(scene)=>{const advice=[];return runtimeMode.cameraErrors(scene,{advice}).concat(advice);}, check:(win,options={})=>{const advice=[];return runtimeMode.check(win,{...options,advice}).concat(advice);}};
const { quote, digest, comparisonResolution } = require('../../skills/autoproduce/references/production-cost.js');
const production = require('../../skills/produce/references/check-production.js');
const {shotDigest}=production;
const check=(...args)=>{const result=production.check(...args);return {...result,errors:result.errors.concat(result.warnings||[])};};
const { assemble } = require('../../skills/storyboard/references/spatial-prompts.js');
const routing = require('../../skills/storyboard/references/render-routing.js');
const checkScene=(scene,options={})=>{const advice=[];return routing.checkScene(scene,{...options,advice}).concat(advice);};
const { scenePlan } = require('../../skills/produce/references/seedance-route.js');
function fixture(n = 3) {
  const win = { FORMAT: 'shorts-9x16', PRODUCTION: { mode: 'full_video', imageProvider: 'host',
    maxAttempts: 3, videoBudgetUsd: 15,
    // The two HITL choices every generated cut needs (user directive 2026-09-11).
    previz: { renderer: 'threejs', selection: { kind: 'user', reference: 'User chose the three.js previz (no Blender on this machine).' } },
    videoModel: { model: 'dreamina-seedance-2-0-260128', resolution: '1080p', selection: { kind: 'user', reference: 'User chose Seedance 2.0 at 1080p with the displayed table.' } },
    style: { preset: 'spatial-explainer', reference: 'https://www.youtube.com/shorts/LQZjvQ5W2ck',
      world: 'A granite valley with a river.', materials: 'Matte concrete and granite.', palette: 'Grey, green and blue.',
      lighting: 'Soft daylight with contact shadows.', camera: 'Elevated spatial reveals.' } }, SCENES: [] };
  win.SCENES = Array.from({ length: n }, (_, i) => ({ type: i ? 'points' : 'cover', duration: 5,
    title: '', narration: [{ tts: 'The buildings rise.', sub: 'The buildings rise.' }],
    shot: { infoType: 'principle', render: { mode: 'generated_video', purpose: 'physical_state',
      reason: 'Reveal the stream.', action: 'The buildings rise.' }, videoDesign: {
      motion: {kind:'subject_action',subject:'Buildings',visibleChange:'Buildings rise away from the stream.',beats:[{at:0,state:'Buildings enclose the stream.'},{at:4,state:'Buildings clear the river bed.'}]},
      look: 'miniature', worldId: 'valley', before: 'Buildings enclose the stream.', action: 'Buildings rise vertically.',
      continuity: 'The river and mountain retain their original shape.', reject: 'Reject unstable buildings and changing trees.' } },
    visual: { why: 'Physical removal exposes the stream.', action: 'The buildings rise.', bg: `images/scene-${i + 1}.png`,
      // One static set-up in three: the camera moves on two of every three full-video shots.
      camera: { purpose: `Keep building ${i + 1} and its newly exposed stream section readable`, framing: ['Elevated three-quarter view', 'Low wide view of the valley', 'Close view of the stream bed'][i % 3],
        movement: ['static', 'dolly in', 'truck right'][i % 3], speed: i % 3 ? 'slow' : 'steady', end: i < 2 ? 'The open stream' : `The open stream. Section ${i + 1} is exposed.` },
      video: { engine: 'seedance', model: 'dreamina-seedance-2-0-mini-260615', resolution: '720p', generateAudio: false, realFaceInput: false } } }));
  for (let i = 0; i < n; i++) {
    const prompts = assemble(win, i); win.SCENES[i].visual.bgPrompt = prompts.sourcePrompt;
    win.SCENES[i].visual.video.prompt = prompts.motionPrompt;
  }
  approve(win);
  return win;
}
function approve(win) { win.PRODUCTION.approval = { kind: 'user', at: '2026-09-06T12:00:00+09:00',
  reference: 'User selected full video with the displayed budget.', quoteFingerprint: quote(win).quoteFingerprint }; }
test('ASTRA oversized motion plans fail before generation without truncating the action', () => {
  const win = fixture(1);
  win.SCENES[0].visual.video = { engine: 'astra' };
  win.SCENES[0].shot.videoDesign.action = 'A person carefully moves a parcel. '.repeat(80);
  assert.throws(() => assemble(win, 0), /ASTRA.*2000/);
});
// A deterministic moving clip — a window panning over a testsrc2 field — validates media
// contracts and clears the measured-motion gate; it is not claimed as a visual-quality sample.
function movingClip(file, { seconds = 5, frozenHead = 0 } = {}) {
  const pan = "crop=540:960:x='(iw-540)*(0.5+0.5*sin(t*2))':y='(ih-960)*(0.5+0.5*cos(t*2))',scale=1080:1920";
  const filters = ['-vf', frozenHead ? `${pan},tpad=start_duration=${frozenHead}:start_mode=clone` : pan];
  const render = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `testsrc2=s=1080x1920:r=24:d=${seconds}`, ...filters,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', file], { encoding: 'utf8' });
  assert.equal(render.status, 0, render.stderr);
  return file;
}
function withBoard(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), 'sf-production-')), board = path.join(dir, 'storyboard'), work = path.join(dir, '.work');
  mkdirSync(path.join(board, 'images'), { recursive: true }); mkdirSync(work);
  const save = win => writeFileSync(path.join(board, 'scenes.js'), Object.entries(win).map(([k, v]) => `window.${k}=${JSON.stringify(v)};`).join('\n'));
  try { return fn({ dir, board, work, save }); } finally { rmSync(dir, { recursive: true, force: true }); }
}
test('quotes six choices with billed seconds, retry range and API rates, excluding recordings', () => {
  const win = fixture(15), q = quote(win);
  assert.deepEqual(Object.keys(q.options), mode.CHOICES);
  assert.equal(q.options.video_50.clips, 8);
  assert.equal(q.options.video_30.clips, 5);
  assert.equal(q.options.video_80.clips, 12);
  assert.equal(q.options.no_video.firstPassUsd, 0);
  assert.equal(q.options.full_video.firstPassUsd, 5.7);
  assert.equal(q.options.full_video.retryHighUsd, 17.1);
  assert.equal(q.options.full_video.retryHighKrw, 23940);
  assert.equal(q.exchangeRateIsAssumption, true);
  win.SCENES[0].duration = 1.5;
  assert.equal(quote(win).options.full_video.rows[0].seconds, 4);
  win.SCENES.push({ type: 'broll', duration: 20, visual: { source: 'recording', clip: 'evidence.mp4' } });
  assert.equal(quote(win).options.full_video.clips, 15);
  win.PRODUCTION.comparison = { resolution: '480p' };
  assert.throws(() => quote(win), /has no price/);
});
// Every generated cut carries its 3D previz (blender-previz.md §6, user directive 2026-09-11): the
// Seedance fields of the reference route, the record, and the motion prompt the assembler writes
// from it — the same board once its previz is rendered.
function withPreviz(win, i, over = {}) {
  const scene = win.SCENES[i];
  // The shot carries the model the user chose (the fixture pinned 1.5 Pro, which takes no reference video).
  Object.assign(scene.visual.video, { model: win.PRODUCTION.videoModel.model, resolution: win.PRODUCTION.videoModel.resolution, modelPurpose: 'previz', modelReason: 'the previz carries the camera', realFaceInput: false,
    referenceImagePaths: [scene.visual.bg], previz: { renderer: 'threejs', clip: `previz/s${i + 1}.mp4`, firstFrame: `previz/s${i + 1}-f0001.png`,
      sha256: 'c'.repeat(64), fps: 24, seconds: 5, camera: { movement: scene.visual.camera.movement },
      actors: [{ color: 'red', is: 'the buildings', image: 2 }], ...over } });
  const prompts = assemble(win, i, '/board');
  scene.visual.bgPrompt = prompts.sourcePrompt; scene.visual.video.prompt = prompts.motionPrompt;
  return prompts;
}
// A channel whose generated-video cap is 0 records its visual style through stills_only, and the
// four-option cost comparison stays exactly four — there is no video to buy on such a board
// (인물을 푼다고 EP08, 2026-09-20). This case carries the mode into `npm test`; the checkers'
// own --selftest runs cover the same ground at a finer grain.
function stillsBoard(n = 9, policy = { generatedVideoMax: 0, videoBudgetUsd: 0 }) {
  const win = fixture(n);
  win.MOTION_POLICY = policy;
  win.PRODUCTION = { ...win.PRODUCTION, mode: 'stills_only', videoBudgetUsd: 0, maxAttempts: 1 };
  delete win.PRODUCTION.approval;
  for (const scene of win.SCENES) {
    scene.shot.render.mode = 'still_camera';
    scene.shot.render.camera = {effect: 'push', target: scene.visual.camera.end, reason: scene.visual.camera.purpose};
    delete scene.visual.video;
  }
  return win;
}
test('stills_only accepts nine still cuts, keeps the four cost choices and preserves the channel cap', () => {
  const win = stillsBoard();
  assert.deepEqual(mode.coverageErrors(win), []);
  assert.deepEqual(mode.check(win), []);
  assert.equal(mode.RATIOS.stills_only, undefined);
  // The HITL surface is the owner directive of 2026-09-06 and does not grow a fifth option.
  assert.deepEqual(Object.keys(quote(win).options), mode.CHOICES);
  assert.deepEqual(mode.policy({ generatedVideoMax: 0, videoBudgetUsd: 7 }, win.PRODUCTION, win.SCENES),
    { generatedVideoMax: 0, videoBudgetUsd: 0 });
  // The cap is read in the profile's spelling too, and from the policy the caller resolved.
  assert.deepEqual(mode.check(stillsBoard(9, { generated_video_max: 0 })), []);
  const capless = stillsBoard(); delete capless.MOTION_POLICY;
  assert.match(mode.check(capless).join(), /needs the channel cap on the board/);
  assert.deepEqual(mode.check(capless, { generatedVideoMax: 0 }), []);
  assert.match(mode.check(stillsBoard(9, { generatedVideoMax: 2 })).join(), /generated_video_max is 0/);
  const withCut = stillsBoard();
  withCut.SCENES[4].visual.video = { engine: 'host' };
  assert.match(mode.check(withCut).join(), /stills_only carries no generated clip/);
  const withImport = stillsBoard();
  withImport.SCENES[4].visual.reuse = { clip: 'clips/old.mp4' };
  assert.match(mode.check(withImport).join(), /stills_only plays no video at all/);
});
test('the production gate clears a stills_only board with no quote and refuses a video call', () => withBoard(({ board, save }) => {
  save(stillsBoard());
  const gate = production.check(board);
  assert.ok(gate.imageReview.some(f => f.code === 'unverified_source_image'));
  assert.deepEqual(gate.errors, []);
  assert.equal(gate.active, true);
  assert.equal(gate.quote, null);
  assert.deepEqual(gate.generatedShots, []);
  assert.match(check(board, { beforeCall: 2 }).errors.join(), /no shot can be selected for a video API call/);
}));
test('cast sheets and cut types affect validation and quote fingerprints', () => {
  const win = fixture(1), before = quote(win).quoteFingerprint;
  win.PRODUCTION.cast = { yi: { name: 'Yi Sun-sin', sheet: 'A lean officer in dark armor.' } };
  win.SCENES[0].shot.cutType = 'action';
  assert.notEqual(quote(win).quoteFingerprint, before);
  const first = quote(win).quoteFingerprint;
  win.PRODUCTION.cast.yi.sheet = 'A broad officer in a blue robe.';
  assert.notEqual(quote(win).quoteFingerprint, first);
  win.PRODUCTION.cast.yi.image = '/absolute/cast.png';
  win.SCENES[0].shot.cutType = 'portrait';
  const errors = mode.check(win, { draft: true }).join('\n');
  assert.match(errors, /image must be a relative path/);
  assert.match(errors, /shot\.cutType must be one of/);
});
test('approval is bound to actual plan and prices but recording a generated output does not stale it', () => withBoard(({ board, save }) => {
  const win = fixture(); save(win); assert.deepEqual(production.check(board, { requireSelection: true }).errors, []);
  win.SCENES[0].visual.video.clip = '.work/accepted.mp4'; save(win);
  assert.deepEqual(production.check(board).errors, []);
  win.SCENES[0].duration = 6; save(win); assert.match(check(board).errors.join(), /quote is stale/);
  approve(win); save(win); assert.deepEqual(production.check(board).errors, []);
  win.PRODUCTION.approval.quoteFingerprint = 'old-price-table'; save(win); assert.match(check(board).errors.join(), /quote is stale/);
  delete win.PRODUCTION; save(win); assert.match(check(board, { requireSelection: true }).errors.join(), /Choose a production mode/);
}));
test('retry-inclusive budget, per-shot attempt limit and actual spend block new calls', () => withBoard(({ board, work, save }) => {
  const win = fixture(); win.PRODUCTION.videoBudgetUsd = .5; approve(win); save(win);
  assert.match(check(board).errors.join(), /Retry-inclusive/);
  win.PRODUCTION.videoBudgetUsd = 4; approve(win); save(win);
  writeFileSync(path.join(work, 'cost-tally.tsv'), [1, 2, 3].map(n => `seedance.1-5-pro-silent.1080p\t5\tvideo:shot=1:attempt=${n}`).join('\n'));
  assert.match(check(board, { beforeCall: 1 }).errors.join(), /attempt limit/);
  assert.deepEqual(production.check(board, { beforeCall: 2 }).errors, []);
  writeFileSync(path.join(work, 'cost-tally.tsv'), 'seedance.1-5-pro-silent.1080p\t100\tvideo:shot=1:attempt=1\n');
  assert.match(check(board, { beforeCall: 2 }).errors.join(), /Actual video spend/);
}));
test('approved revisions count their own retries while retaining historical spend',()=>withBoard(({board,work,save})=>{
 const win=fixture(1);win.PRODUCTION.generationRevision='content-v3';approve(win);save(win);
 const ledger=path.join(work,'cost-tally.tsv');
 const old=Array.from({length:3},(_,i)=>`seedance.1-5-pro-silent.1080p\t5\tvideo:shot=1:attempt=${i+1}\n`).join('');
 writeFileSync(ledger,old);assert.deepEqual(production.check(board,{beforeCall:1}).errors, []);
 const current=Array.from({length:3},(_,i)=>`seedance.1-5-pro-silent.1080p\t5\tvideo:shot=1:attempt=${i+1} revision=content-v3\n`).join('');
 writeFileSync(ledger,old+current);assert.ok(check(board,{beforeCall:1}).errors.some(x=>x.includes('attempt limit')));
 win.PRODUCTION.generationRevision='content-v4';save(win);assert.ok(check(board,{beforeCall:1}).errors.some(x=>x.includes('stale')));
 approve(win);save(win);writeFileSync(ledger,old+'seedance.1-5-pro-silent.1080p\t300\tvideo:shot=1:attempt=1 revision=content-v2\n');
 assert.ok(check(board,{beforeCall:1}).errors.some(x=>x.includes('spend exceeds')));
}));
test('large storyboard cost snapshots flush fully when captured through a pipe',()=>withBoard(({board,save})=>{
 const win=fixture(1);win.PRODUCTION.style.world='A detailed miniature valley. '.repeat(6000);approve(win);save(win);
 const r=spawnSync(process.execPath,[path.join(root,'skills/autoproduce/references/cost-preview.js'),board,'--sbdoc'],{encoding:'utf8',maxBuffer:8*1024*1024});
 assert.equal(r.status,0,r.stderr);assert.ok(r.stdout.length>65536);
 const sandbox={};vm.runInNewContext('result={'+r.stdout+'}',sandbox);
 assert.equal(sandbox.result.cost.productionCost.selected,'full_video');
}));

test('upstream assembly accepts the full-video source and rejects a different clip',()=>withBoard(({board,work})=>{
 const {verifyManifest}=require('../../skills/produce/references/verify-build-plan.js');
 const s=fixture(1).SCENES[0];s.visual.video.clip='.work/accepted.mp4';
 writeFileSync(path.join(work,'accepted.mp4'),'source bytes');writeFileSync(path.join(work,'wrong.mp4'),'other bytes');
 const line='0\t0\taccepted.mp4\tThe buildings rise.\tThe buildings rise.\n';
 writeFileSync(path.join(work,'segs.tsv'),line);assert.equal(Object.keys(verifyManifest(work,board,[s])).length,1);
 writeFileSync(path.join(work,'segs.tsv'),line.replace('accepted.mp4','wrong.mp4'));
 assert.throws(()=>verifyManifest(work,board,[s]),/differs from the declared/);
}));
test('explicit workdir checks its actual manifest and cost ledger',()=>withBoard(({board,work,save})=>{
 const w=fixture(1);save(w);const custom=path.join(work,'custom');mkdirSync(custom);
 writeFileSync(path.join(custom,'cost-tally.tsv'),'seedance.1-5-pro-silent.1080p\t999\tvideo:shot=1:attempt=1\n');
 assert.match(check(board,{workdir:custom}).errors.join(),/Actual video spend/);
}));
// Offline media validates the import contract, not the visual quality of generated footage.
function reuseFixture(video) {
 const w=fixture(4); w.PRODUCTION={mode:'hybrid',videoBudgetUsd:0,maxAttempts:2,style:{preset:'photoreal',selection:{kind:'user',reference:'User chose photoreal for the imported clips.'}}};
 const lines=['Why is the box moving?','The table shakes.','A fan moves the table.','Check the table before the box.'];
 const ref=shot=>({shot,group:1,quote:lines[shot-1]});
 w.COMPREHENSION={mode:'narrative',question:'Why does the box move?',answer:'A fan moves the table.',takeaway:'Check the support.',branches:[],terms:[]};
 w.SCENES.forEach((s,i)=>{
  s.transition='cut';s.beat=['hook','drip','drip','cta'][i];s.narration=[{tts:lines[i],sub:lines[i]}];
  s.shot={...s.shot,feel:'curious',size:'mcu',angle:'eye',info:lines[i],infoType:'other',render:{mode:'generated_video',purpose:'live_action',motionEssential:true,
   reason:['Observe the box drift.','Follow the shaking support.','Reveal the fan contact.','Trace the cause back.'][i],action:'The box slides.',whyNotStill:'The changing position shows the motion.'}};
  // A short's close carries the forwardable thing; the ask stays optional, the trigger does not.
  if(s.beat==='cta'){s.shot.share=lines[i];s.shot.shareType='checklist';}
  s.shot.videoDesign={motion:{kind:'subject_action',subject:'Box',visibleChange:'The box slides across the table.',beats:[{at:0,state:'Box at the left.'},{at:4,state:'Box at the right.'}]}};
  s.visual={picture:'ai-video',overlay:'none',why:'Movement is the evidence.',action:'The box slides.',reuse:{clip:video,sha256:digest(readFileSync(video)),sourceEpisode:'archived-episode-7 (provenance only)',sourceRange:{start:10,end:15}}};
 });
 w.SCENES[0].hookType='curiosity';w.SCENES[0].hookForm='gap';
 w.STORY={version:'story-v1',kind:'fiction',viewerNeed:'Solve the moving-box puzzle',thesis:'Check the table before the box.',basis:'An explicitly fictional demonstration',opening:ref(1),payoff:ref(3),ending:ref(4),endingReason:'Return to the initial mistaken attribution',cta:'none',beats:[1,2,3,4].map(shot=>({shot,change:`New clue ${shot}`,necessity:`Required step ${shot}`}))};
 w.STORY.review={hash:require('../../skills/storyboard/references/story-contract.js').storyHash(w),verdict:'pass',unresolved:[],...Object.fromEntries(['meaning','progression','payoff','grounding'].map(k=>[k,{reason:`${k} evidence in fictional premise`,refs:[ref(3)]}]))};
 approve(w);return w;
}
test('explicit imports pass scene and production gates at zero generation cost, but never a new API call',()=>withBoard(({board,work,save})=>{
 const originalVideo=movingClip(path.join(work,'original.mp4'));
 const video=path.join(work,'import.mp4');
 assert.equal(spawnSync('ffmpeg',['-v','error','-i',originalVideo,'-vf','scale=720:1280','-c:v','libx264','-preset','ultrafast',video],{encoding:'utf8'}).status,0);
 const {inspectReuse}=require('../../skills/produce/references/inspect-reuse.js');
 const imported=inspectReuse(video,'original episode',10);
 assert.deepEqual(imported.sourceDimensions,{width:720,height:1280});
 assert.equal(imported.reuse.sha256,digest(readFileSync(video)));
 assert.equal(imported.reuse.sourceRange.end,10+imported.duration);
 assert.equal(imported.reuse.sourceRange.start,10);
 assert.equal(imported.reuse.sourceEpisode,'original episode');
 assert.equal(imported.reuse.clip,video);
 assert.ok(Math.abs(imported.duration-5)<.05);
 assert.equal(imported.playback,undefined);
 assert.throws(()=>inspectReuse(video,'original episode',NaN),/do not guess/);
 const w=reuseFixture(video);save(w);
 const run=spawnSync(process.execPath,[path.join(root,'skills/storyboard/references/check-scenes.js'),board,'--json'],{encoding:'utf8'});
 assert.equal(run.status,0,run.stdout+run.stderr);
 assert.match(run.stdout+run.stderr,/4 generated-video slots[\s\S]*cap at 2/);
 const p=check(board,{requireSelection:true});assert.deepEqual(p.errors,[]);
 assert.equal(p.quote.options.hybrid.clips,0);assert.equal(p.quote.options.hybrid.reusedClips,4);
 assert.equal(p.quote.options.hybrid.firstPassUsd,0);assert.equal(p.quote.options.hybrid.retryHighUsd,0);assert.equal(p.quote.options.hybrid.provisional,false);
 assert.deepEqual(p.reusedShots,[0,1,2,3]);assert.deepEqual(p.generatedShots,[]);
 assert.equal(scenePlan(w.SCENES[0]),null);
 assert.match(check(board,{beforeCall:1}).errors.join(),/cannot be selected/);
 assert.match(check(board,{ready:true}).errors.join(),/review is required/);
 const reviews=w.SCENES.map((s,i)=>({shot:i+1,planDigest:shotDigest(w,i),videoSha256:s.visual.reuse.sha256,reviewer:'Synthetic contract fixture; not a quality approval',at:'2026-09-07T00:00:00Z',playback:true,seeks:[.1,2.5,4.8],defects:[],motionEvidence:{...s.shot.videoDesign.motion,cameraOnly:false,observedChange:'The box moves from left to right.'},...Object.fromEntries(['composition','materials','continuity','action','camera','referenceMatch'].map(k=>[k,'Synthetic contract evidence for '+k]))}));
 const saveReviews=()=>writeFileSync(path.join(work,'video-review.json'),JSON.stringify({shots:reviews}));saveReviews();
 writeFileSync(path.join(work,'cards.tsv'),w.SCENES.map((s,i)=>`${i}\tvoice.wav\t5\tnone\n`).join(''));
 writeFileSync(path.join(work,'segs.tsv'),w.SCENES.map((s,i)=>`${i}\t0\t${video}\t${s.narration[0].tts}\t${s.narration[0].sub}\n`).join(''));
 assert.deepEqual(production.check(board,{ready:true,manifest:true}).errors, []);
 const {verifyManifest}=require('../../skills/produce/references/verify-build-plan.js');
 assert.equal(Object.keys(verifyManifest(work,board,w.SCENES,w.FORMAT)).length,1);
 const manifest=readFileSync(path.join(work,'segs.tsv'),'utf8');
 writeFileSync(path.join(work,'segs.tsv'),manifest.replace(video,video+'::overlay.png'));
 assert.match(check(board,{manifest:true}).errors.join(),/without overlays/);
 assert.throws(()=>verifyManifest(work,board,w.SCENES,w.FORMAT),/differs from the declared/);
 writeFileSync(path.join(work,'segs.tsv'),manifest);
 const low=path.join(work,'low.mp4');
 assert.equal(spawnSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=gray:s=320x240:r=1:d=5','-c:v','libx264','-preset','ultrafast',low],{encoding:'utf8'}).status,0);
 const lowScene=structuredClone(w.SCENES[0]);lowScene.visual.reuse.clip=low;lowScene.visual.reuse.sha256=digest(readFileSync(low));
 const {validateReuseAsset}=require('../../skills/produce/references/check-production.js');
 assert.throws(()=>validateReuseAsset(board,lowScene,w.FORMAT),/720p source minimum/);
 lowScene.visual.reuse.clip=path.join(work,'missing.mp4');assert.throws(()=>validateReuseAsset(board,lowScene,w.FORMAT),/ENOENT/);
 reviews[0].playback=false;saveReviews();assert.match(check(board,{ready:true}).errors.join(),/full playback/);reviews[0].playback=true;
 reviews[0].videoSha256='0'.repeat(64);saveReviews();assert.match(check(board,{ready:true}).errors.join(),/review is stale/);
 const mixed=structuredClone(w);
 mixed.SCENES.slice(1).forEach((s,i)=>{
  s.shot.render={mode:'still_camera',purpose:'portrait',reason:['Inspect the support.','Identify the fan.','Recall the object.'][i],camera:{effect:'push',target:'subject',reason:'Make the subject clear.'}};
  s.visual={bg:'images/portrait.png',camera:{movement:'dolly in'},slide:{kind:'camera',motion:true,file:`slides/body-${i}.html`}};
 });
 mixed.STORY.review.hash=require('../../skills/storyboard/references/story-contract.js').storyHash(mixed);approve(mixed);save(mixed);
 const single=spawnSync(process.execPath,[path.join(root,'skills/storyboard/references/check-scenes.js'),board,'--json'],{encoding:'utf8'});
 assert.equal(single.status,0,single.stdout+single.stderr);
 const mixedResult=production.check(board,{requireSelection:true});
 assert.deepEqual(mixedResult.errors,[]);
 assert.ok(mixedResult.warnings.some(message=>message.includes('same source image reference')));
 assert.equal(quote(mixed).options.hybrid.reusedClips,1);assert.equal(quote(mixed).options.hybrid.firstPassUsd,0);
 mixed.SCENES[1]=fixture(1).SCENES[0];mixed.SCENES[1].shot.render={mode:'generated_video',purpose:'live_action',motionEssential:true,reason:'Watch the buildings rise.',action:'Buildings rise.',whyNotStill:'The removal is continuous.'};
 assert.equal(quote(mixed).options.hybrid.clips,1);assert.equal(quote(mixed).options.hybrid.firstPassUsd,.38);assert.equal(quote(mixed).options.hybrid.retryHighUsd,.76);
 assert.equal(quote(mixed).options.hybrid.rows[0].shot,2);
 save(w);
 const s=w.SCENES[0],original=structuredClone(s);
 for (const field of ['bgPrompt','bg']) {
  const invalid=structuredClone(w);invalid.PRODUCTION.imageProvider='gpt';
  invalid.SCENES[0].visual[field]=field==='bgPrompt'?'Generate a background.':'images/background.png';
  save(invalid);
  assert.match(check(board).errors.join(),/cannot also declare/);
  assert.throws(()=>scenePlan(invalid.SCENES[0]),/cannot also declare/);
  assert.throws(()=>quote(invalid),/cannot also declare/);
 }
 save(w);
 s.visual.video={clip:video};save(w);assert.match(check(board).errors.join(),/cannot also declare/);assert.throws(()=>scenePlan(s),/cannot also declare/);assert.throws(()=>quote(w),/cannot also declare/);
 w.SCENES[0]=structuredClone(original);w.SCENES[0].visual.reuse.sha256='0'.repeat(64);approve(w);save(w);assert.match(check(board).errors.join(),/SHA-256 differs/);
 w.SCENES[0]=structuredClone(original);w.SCENES[0].duration=4;w.SCENES[0].visual.reuse.sourceRange.end=14;approve(w);save(w);assert.match(check(board).errors.join(),/duration differs/);
 w.SCENES[0]=structuredClone(original);w.SCENES[0].visual.reuse.sourceEpisode='relocated provenance';save(w);assert.match(check(board).errors.join(),/quote is stale/);
 for(const invalid of [null,{clip:'https://example.com/a.mp4'}, {...original.visual.reuse,sourceRange:{start:NaN,end:5}}]){
  w.SCENES[0]=structuredClone(original);w.SCENES[0].visual.reuse=invalid;assert.ok(mode.check(w).length);
 }
 for(const x of w.SCENES)delete x.visual.reuse;
 assert.match(mode.check(w).join(),/hybrid needs/);
}));
test('generation output existence never discounts a new generation or its retries',()=>withBoard(({work})=>{
 const w=fixture(1);w.PRODUCTION.mode='hybrid';const before=quote(w);
 const video=path.join(work,'existing.mp4');writeFileSync(video,'already exists');w.SCENES[0].visual.video.clip=video;
 assert.deepEqual(quote(w),before);
 assert.equal(before.options.hybrid.firstPassUsd,.38);assert.equal(before.options.hybrid.retryHighUsd,1.14);
}));
test('the previz renderer and the video model are HITL choices recorded before any render or call', () => {
  const win = fixture();
  assert.deepEqual(mode.check(win, { requireApproval: true }), []);
  const without = key => { const w = fixture(); delete w.PRODUCTION[key]; return mode.check(w).join(); };
  assert.match(without('previz'), /3D previz can help/);
  assert.match(without('videoModel'), /Copy the saved video selection into PRODUCTION.videoModel/);
  const w = fixture(); delete w.PRODUCTION.previz.selection; assert.match(mode.check(w).join(), /Record where the previz renderer came from/);
  w.PRODUCTION.previz = { renderer: 'maya', selection: { kind: 'user', reference: 'x' } }; assert.match(mode.check(w).join(), /Unsupported PRODUCTION.previz.renderer/);
  const r = fixture(); r.PRODUCTION.videoModel.resolution = '480p'; assert.doesNotMatch(mode.check(r).join(), /resolution must be one of/);
  r.PRODUCTION.videoModel = { model: 'dreamina-seedance-2-0-fast-260128', resolution: '720p', selection: { kind: 'user', reference: 'x' } };
  assert.doesNotMatch(mode.check(r).join(), /Copy the saved video selection/);
  // The draft pass has no generated cuts settled yet; a board with no generated cut never asks.
  assert.doesNotMatch(mode.check(without.call(null, 'previz') && fixture(), { draft: true }).join(), /Copy the saved video selection/);
  const still = fixture(); delete still.PRODUCTION.previz; delete still.PRODUCTION.videoModel;
  for (const s of still.SCENES) { s.shot.render.mode = 'still_camera'; delete s.visual.video; }
  assert.doesNotMatch(mode.check(still).join(), /Copy the saved video selection/);
  // The host lane: the tool is the model, so the record says host or stays absent.
  const host = fixture(); host.PRODUCTION.videoProvider = 'host'; delete host.PRODUCTION.videoModel;
  assert.doesNotMatch(mode.check(host).join(), /Copy the saved video selection|videoModel/);
  host.PRODUCTION.videoModel = { model: 'dreamina-seedance-2-0-260128', resolution: '1080p', selection: { kind: 'user', reference: 'x' } };
  assert.match(mode.check(host).join(), /must be host under videoProvider host/);
  // A 720p grade the table offers must pass the full-video checks on the shots that carry it (review H1).
  const mini = fixture(); mini.PRODUCTION.videoModel = { model: 'dreamina-seedance-2-0-mini-260615', resolution: '720p', selection: { kind: 'user', reference: 'User chose 2.0 mini at 720p.' } };
  for (let i = 0; i < mini.SCENES.length; i++) { const v = mini.SCENES[i].visual.video; v.resolution = '720p'; }
  assert.deepEqual(mode.check(mini, { requireApproval: true }).filter(m => /resolution|1080p/.test(m)), []);
  mini.SCENES[0].visual.video.model = mini.PRODUCTION.videoModel.model; mini.SCENES[0].visual.video.resolution = '720p';
  Object.assign(mini.SCENES[0].visual.video, { modelPurpose: 'previz', modelReason: 'r', realFaceInput: false, referenceImagePaths: [mini.SCENES[0].visual.bg],
    previz: { renderer: 'threejs', clip: 'previz/s1.mp4', firstFrame: 'previz/s1-f0001.png', sha256: 'e'.repeat(64), fps: 24, seconds: 5, camera: { movement: 'static' } } });
  mini.SCENES[0].visual.video.prompt = assemble(mini, 0, '/board').motionPrompt;
  assert.deepEqual(checkScene(mini.SCENES[0], { production: mini.PRODUCTION }), []);
  assert.equal(scenePlan(mini.SCENES[0]).priceKey, 'seedance.2-0-mini-video.720p');
  // Every model the table offers has a with-video price row on the route (drift guard).
  const { PRICED } = require('../../skills/produce/references/seedance-route.js');
  for (const [m, spec] of Object.entries(mode.VIDEO_MODELS)) for (const res of spec.resolutions)
    assert.ok(PRICED.has('seedance.' + m.replace(/^dreamina-seedance-|-\d{6}$/g, '').replace(/^(\d)-(\d)/, '$1-$2') + '-video.' + res) ||
      [...PRICED].some(k => k.endsWith('-video.' + res) && k.includes(m.includes('mini') ? 'mini' : m.includes('fast') ? 'fast' : m.includes('2-5') ? '2-5' : '2-0.') ), m + ' ' + res);
  // The options table quotes the same board once per model, with the numbers the approval will bind.
  const { options, text } = require('../../skills/produce/references/video-model-options.js');
  const table = options(fixture());
  assert.equal(table.cuts, 3);
  assert.ok(table.rows.every(row => !row.error), JSON.stringify(table.rows));
  const rows = Object.fromEntries(table.rows.map(x => [x.model + '@' + x.resolution, x]));
  assert.ok(rows['dreamina-seedance-2-0-260128@1080p'].firstPassUsd > rows['dreamina-seedance-2-0-mini-260615@720p'].firstPassUsd);
  assert.equal(rows['dreamina-seedance-2-0-260128@1080p'].firstPassUsd, +(3 * 10 * 0.228).toFixed(2));
  assert.match(text(table), /Seedance 2\.0 mini 720p/);
  assert.match(text(options(host)), /videoProvider host/);
  // No mode yet → a clear error, not a TypeError; a hybrid board with no cut yet is marked provisional (review M7).
  const noMode = fixture(); delete noMode.PRODUCTION.mode;
  assert.throws(() => options(noMode), /Choose full_video, video_50, video_30 or hook_only first/);
  const hybrid = fixture(); hybrid.PRODUCTION.mode = 'hybrid'; hybrid.PRODUCTION.comparison = { model: 'dreamina-seedance-2-0-fast-260128', resolution: '720p', hybridShots: [1, 2] };
  for (const s of hybrid.SCENES) { s.shot.render.mode = 'still_camera'; delete s.visual.video; }
  const ht = options(hybrid); assert.equal(ht.cuts, 0);
  assert.ok(ht.rows.every(r => r.error || r.provisional === true), JSON.stringify(ht.rows[0]));
});
test('a supplied stock clip is outside the generated set; a stock photograph may still source a generated cut', () => {
  const license = { provider: 'pexels', url: 'https://www.pexels.com/video/1', license: 'Pexels License', licenseUrl: 'https://www.pexels.com/license/',
    attributionRequired: false, commercial: true, modify: true, retrievedAt: '2026-09-07' };
  const clip = { type: 'points', duration: 6, visual: { source: 'stock', clip: 'footage/s2-pexels-1.mp4', license } };
  const photo = { type: 'points', duration: 6, visual: { source: 'stock', bg: 'images/stock/s3-met-1.jpg', license, video: { engine: 'seedance' } } };
  assert.equal(mode.eligible(clip), false);
  assert.equal(mode.eligible(photo), true);
  const sig = mode.signature({ SCENES: [photo, clip], PRODUCTION: { mode: 'hybrid' } });
  assert.match(sig, /"license"/, 'the approval fingerprint covers the license record');
  assert.equal(mode.policy({ generatedVideoMax: 2 }, { mode: 'full_video', videoBudgetUsd: 1 }, [clip, photo]).generatedVideoMax, 1);
});


test('the quote runs the ratio over cuts and bills b-roll outside it', () => {
  const scenes = [{ type: 'cover', duration: 4, visual: {} }];
  for (let i = 0; i < 8; i++) scenes.push({ type: 'points', duration: 5, visual: {} });
  scenes.push({ type: 'broll', duration: 4, visual: {} }, { type: 'broll', duration: 4, visual: {} });
  const q = quote({ SCENES: scenes, PRODUCTION: { videoProvider: 'host' } });
  assert.equal(q.options.video_50.clips, 5 + 2);   // ceil(9 × .5) cuts + both b-rolls
  assert.equal(q.options.video_30.clips, 3 + 2);
  assert.equal(q.options.full_video.clips, 9 + 2);
  assert.equal(q.options.video_lt10.clips, 0);
});

test('three 2.5 hook cuts can mix with 2.0 mini body cuts and retain per-cut pricing', () => {
  const win = fixture(6);
  win.PRODUCTION.videoModel = { model: 'mixed', selection: { kind: 'user', reference: 'First three cuts 2.5, remaining cuts 2.0 mini.' } };
  for (let i = 0; i < 6; i++) {
    withPreviz(win, i);
    const v = win.SCENES[i].visual.video;
    v.model = i < 3 ? 'dreamina-seedance-2-5-260628' : 'dreamina-seedance-2-0-mini-260615';
    v.resolution = i < 3 ? '1080p' : '720p';
    delete v.modelReason;
    v.prompt = assemble(win, i, '/board').motionPrompt;
    assert.deepEqual(checkScene(win.SCENES[i], { production: win.PRODUCTION }), []);
    const plan = scenePlan(win.SCENES[i]);
    assert.equal(plan.tool, 'seedance_reference');
    assert.equal(plan.priceKey, i < 3 ? 'seedance.2-5-video.1080p' : 'seedance.2-0-mini-video.720p');
  }
  approve(win);
  assert.deepEqual(mode.check(win, { requireApproval: true }), []);
  const fingerprint = quote(win).quoteFingerprint;
  win.SCENES[5].visual.video.model = 'dreamina-seedance-2-0-fast-260128';
  assert.notEqual(quote(win).quoteFingerprint, fingerprint);
});

test('an unchanged four-choice approval retains its quote fingerprint; new contracts bind their version', () => {
  const win=fixture(10);
  win.PRODUCTION.approval.quoteFingerprint=quote(win,{legacy:true}).quoteFingerprint;
  assert.equal(quote(win).quoteFingerprint,win.PRODUCTION.approval.quoteFingerprint);
  assert.deepEqual(Object.keys(quote(win).options),['full_video','video_50','video_30','hook_only']);
  const old=mode.signature(win);
  win.PRODUCTION.renderRatioVersion=1;
  assert.notEqual(mode.signature(win),old);
  assert.deepEqual(Object.keys(quote(win).options),mode.CHOICES);
});

test('the astra lane is a provider of its own: our own box, no price record, the one grid size it renders', () => {
  // Our LTX-2.5 box stands next to host and the API vendors (video-model-selection §ASTRA).
  const astra = fixture(); astra.PRODUCTION.videoProvider = 'astra'; delete astra.PRODUCTION.videoModel;
  // There is no priced tier to pick, so nothing asks which model — the exemption host already had.
  assert.doesNotMatch(mode.check(astra).join(), /Ask which video model|videoModel/);
  astra.PRODUCTION.videoModel = { model: 'dreamina-seedance-2-0-260128', resolution: '1080p', selection: { kind: 'user', reference: 'x' } };
  assert.match(mode.check(astra).join(), /must be astra under videoProvider astra/);
  // Naming our box needs no HITL reference: the record exists to say who chose among prices.
  astra.PRODUCTION.videoModel = { model: 'astra' };
  assert.doesNotMatch(mode.check(astra).join(), /videoModel\.selection/);
  // A board that says astra and leaves its cuts on the Seedance route is refused, not quietly rerouted —
  // a silently-ignored provider would have billed a vendor for every cut.
  const stale = mode.check(astra, { requireApproval: true }).join('\n');
  assert.match(stale, /routes every full_video cut to engine:"astra"/);
  assert.match(stale, /write resolution:"1024x1920"/);
  // 1080x1920 is refused by the box itself — 1080 is a multiple of neither 64 nor 32 — so the board
  // carries the grid size it can render and the edit widens it to the 1080-wide canvas.
  assert.equal(mode.ASTRA_RESOLUTION, '1024x1920');
  for (const s of astra.SCENES) {
    Object.assign(s.visual.video, { engine: 'astra', resolution: mode.ASTRA_RESOLUTION, generateAudio: false });
    delete s.visual.video.model;            // a Seedance planning field has no meaning on this lane
  }
  const clean = mode.check(astra, { requireApproval: true }).join('\n');
  assert.doesNotMatch(clean, /engine:"astra"|resolution/, clean);
  // The quote prices wall clock at nothing, and says which lane it priced.
  const q = quote(astra);
  assert.equal(q.videoProvider, 'astra');
  assert.equal(q.options.full_video.firstPassUsd, 0);
  assert.equal(q.options.full_video.clips, astra.SCENES.length);
  // The comparison table has nothing to compare, and says so rather than printing an empty grid.
  const { options, text } = require('../../skills/produce/references/video-model-options.js');
  const table = options(astra);
  assert.equal(table.rows.length, 0);
  assert.equal(table.provider, 'astra');
  assert.match(text(table), /videoProvider astra/);
  assert.match(text(table), /wall clock/);
  // Negative control: the host lane still reads as host, not as our box.
  const host = fixture(); host.PRODUCTION.videoProvider = 'host'; delete host.PRODUCTION.videoModel;
  assert.equal(options(host).provider, 'host');
  assert.match(text(options(host)), /videoProvider host/);
  assert.equal(quote(host).videoProvider, 'host');
  // There is no image lane on our box, so astra is not a value imageProvider accepts.
  const img = fixture(); img.PRODUCTION.imageProvider = 'astra';
  assert.match(mode.check(img).join(), /imageProvider must be host or api/);
});

test('a 16:9 astra board and its quote use the landscape grid size while 9:16 stays unchanged', () => {
  const portrait = fixture(); portrait.PRODUCTION.videoProvider = 'astra'; portrait.PRODUCTION.videoModel = { model: 'astra' };
  assert.equal(mode.astraResolution(portrait), mode.ASTRA_RESOLUTION);
  assert.equal(comparisonResolution(portrait), '1024x1920');

  const wide = fixture(); wide.FORMAT = 'youtube-long-16x9'; wide.PRODUCTION.videoProvider = 'astra'; wide.PRODUCTION.videoModel = { model: 'astra' };
  assert.equal(mode.astraResolution(wide), mode.ASTRA_WIDE_RESOLUTION);
  assert.equal(comparisonResolution(wide), '1920x1024');
  assert.match(mode.check(wide, { requireApproval: true }).join('\n'), /write resolution:"1920x1024"/);
  for (const s of wide.SCENES) {
    Object.assign(s.visual.video, { engine: 'astra', resolution: mode.ASTRA_WIDE_RESOLUTION, generateAudio: false });
    delete s.visual.video.model;
  }
  assert.doesNotMatch(mode.check(wide, { requireApproval: true }).join('\n'), /engine:"astra"|resolution/);
});

// Captured verbatim from ep10c on 2026-10-06: the report must keep the BGM
// exclusion and exit 1 while a separately approved free ASTRA call can proceed.
const ep10cLedger = readFileSync(new URL('./fixtures/ep10c-cost-tally.tsv', import.meta.url), 'utf8');
function freeAstraBoard() {
  const win = fixture(1);
  win.PRODUCTION.videoProvider = 'astra';
  win.PRODUCTION.videoModel = { model: 'astra' };
  win.PRODUCTION.videoBudgetUsd = 0;
  Object.assign(win.SCENES[0].visual.video, { engine: 'astra', resolution: mode.ASTRA_RESOLUTION, generateAudio: false, clip: 'video/s1.mp4' });
  delete win.SCENES[0].visual.video.model;
  approve(win);
  return win;
}
function costGateFixture(t, win = freeAstraBoard(), ledgerText = ep10cLedger) {
  const dir = mkdtempSync(path.join(tmpdir(), 'production-cost-gate-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const board = path.join(dir, 'storyboard'), work = path.join(dir, '.work');
  mkdirSync(board); mkdirSync(work);
  const ledger = path.join(work, 'cost-tally.tsv');
  writeFileSync(ledger, ledgerText);
  writeFileSync(path.join(work, 'cards.tsv'), '');
  writeFileSync(path.join(work, 'segs.tsv'), '');
  const save = () => writeFileSync(path.join(board, 'scenes.js'),
    Object.entries(win).map(([k, v]) => `window.${k} = ${JSON.stringify(v)};`).join('\n'));
  save();
  return { board, ledger, save, win };
}
test('ep10c Lyria exclusion permits only a verified free ASTRA before-call, with its cost warning intact', t => {
  const { board, ledger } = costGateFixture(t);
  const { runReport } = require('../../skills/autoproduce/references/cost-preview.js');
  const report = runReport(ledger);
  assert.equal(report.exit, 1);
  assert.deepEqual(report.unresolved, ['!! price unconfirmed: music.lyria-realtime (unconfirmed)']);
  const result = production.check(board, { beforeCall: 1 });
  assert.deepEqual(result.errors, []);
  assert.equal(result.costReport.exit, 1);
  assert.deepEqual(result.costReport.unresolved, report.unresolved);
  assert.match(result.warnings.join(), /music.lyria-realtime.*episode cost report still exits 1/);
  assert.equal(readFileSync(ledger, 'utf8'), ep10cLedger);
  const cli = spawnSync(process.execPath, [path.join(root, 'skills/produce/references/check-production.js'), board, '--before-call', '1'], { encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr);
  assert.match(cli.stdout, /Warning: !! price unconfirmed: music.lyria-realtime/);
  for (const opts of [{}, { requireSelection: true }, { beforeCall: 1, requireSelection: true }, { ready: true }, { beforeCall: 1, ready: true }, { beforeCall: 1, manifest: true }, { beforeCall: 2 }])
    assert.match(check(board, opts).errors.join(), /Actual cost ledger has unresolved prices/);
});
test('free ASTRA cannot excuse unknown keys, other missing prices or malformed historical ledger rows', t => {
  for (const ledger of [
    ep10cLedger + 'unknown.video\t1\tproduce: invalid key\n',
    ep10cLedger + 'veo.not-a-tier\t1\tproduce: unknown video price\n',
    ep10cLedger.replace('\t480\t', '\tnope\t'),
    ep10cLedger.replace('\t480\t', '\t-480\t'),
    ep10cLedger.replace('\t480\t', '\t\t'),
    ep10cLedger.replace('\t480\t', '\t' + '9'.repeat(400) + '\t'),
    ep10cLedger + 'tts.elevenlabs\tbad\tproduce: bad quantity\n',
    ep10cLedger + '\t1\tproduce: empty key\n',
    ep10cLedger + 'tts.elevenlabs\t1\tproduce: memo\textra\n',
    ep10cLedger.replace('\t480\t', '\t480 extra\t')
  ]) {
    const { board } = costGateFixture(t, freeAstraBoard(), ledger);
    assert.match(check(board, { beforeCall: 1 }).errors.join(), /Actual cost ledger has unresolved prices/, ledger);
  }
});
test('the BGM exception never permits a paid or host video lane', t => {
  for (const provider of ['api', 'host']) {
    const win = provider === 'api' ? fixture(1) : freeAstraBoard();
    if (provider === 'host') {
      win.PRODUCTION.videoProvider = 'host'; delete win.PRODUCTION.videoModel;
      win.SCENES[0].visual.video.engine = 'host'; win.SCENES[0].visual.video.resolution = '720p';
    }
    approve(win);
    const { board } = costGateFixture(t, win);
    assert.match(check(board, { beforeCall: 1 }).errors.join(), /Actual cost ledger has unresolved prices/);
  }
});
test('free ASTRA still requires current approval, sufficient video budget and a valid generation plan', t => {
  for (const mutate of [
    win => { delete win.PRODUCTION.approval; },
    win => { win.PRODUCTION.approval.quoteFingerprint = '0'.repeat(64); },
    win => { win.PRODUCTION.approval.reference = ''; },
    win => { win.SCENES[0].visual.video.engine = 'seedance'; },
    win => { win.PRODUCTION.generationRevision = 'invalid revision'; }
  ]) {
    const win = freeAstraBoard(); mutate(win);
    const { board } = costGateFixture(t, win);
    assert.ok(check(board, { beforeCall: 1 }).errors.length);
  }
  const { board } = costGateFixture(t, freeAstraBoard(), ep10cLedger +
    'veo.lite.1080p\t8\tproduce: video:shot=1:attempt=1\n');
  assert.match(check(board, { beforeCall: 1 }).errors.join(), /Actual video spend exceeds the approved budget/);
});

test('a changed or unconfirmed ASTRA price cannot enter the free-call exclusion', t => {
  const { board, ledger } = costGateFixture(t);
  const isolated = mkdtempSync(path.join(tmpdir(), 'production-price-gate-'));
  t.after(() => rmSync(isolated, { recursive: true, force: true }));
  // Copy only reference code and price data; neither the real table nor ep10c is edited.
  cpSync(path.join(root, 'skills'), path.join(isolated, 'skills'), { recursive: true,
    filter: file => !path.extname(file) || /\.(?:js|json|sh|tsv)$/.test(file) });
  const priceFile = path.join(isolated, 'skills/autoproduce/references/prices.tsv');
  const original = readFileSync(priceFile, 'utf8');
  const checker = path.join(isolated, 'skills/produce/references/check-production.js');
  for (const price of ['?', '0.10', '0.00000001']) {
    const altered = original.replace(/^(video\.astra\tsecond\t)[^\t\n]+/m, '$1' + price);
    assert.notEqual(altered, original);
    writeFileSync(priceFile, altered);
    const call = spawnSync(process.execPath, [checker, board, '--before-call', '1'], { encoding: 'utf8' });
    assert.equal(call.status, 1, call.stdout + call.stderr);
    assert.match(call.stdout + call.stderr, /Price unavailable|unresolved prices|quote is stale|exceeds/);
  }
  assert.equal(readFileSync(ledger, 'utf8'), ep10cLedger);
  assert.equal(readFileSync(path.join(root, 'skills/autoproduce/references/prices.tsv'), 'utf8'), original);
});

test('structured ending handoff always attaches opening, with empty or omitted extra references',()=>{
 for(const references of [[],undefined]) {
  const win=fixture(),s=win.SCENES[0];
  delete s.visual.bg;s.visual.frames={mode:'first_last',start:'start.png',end:'end.png'};
  if(references!==undefined)s.visual.references=references;
  const output=assemble(win,0,'/board');
  assert.deepEqual(output.endFrameImageArgs,{referenced_image_paths:['/board/start.png']});
  assert.equal(output.endFrameReady,true);
 }
});
