import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '../..');
const mode = require('../../skills/storyboard/references/production-mode.js');
const { quote, digest } = require('../../skills/autoproduce/references/production-cost.js');
const { check, shotDigest, hashFile } = require('../../skills/produce/references/check-production.js');
const { assemble } = require('../../skills/storyboard/references/spatial-prompts.js');
const { checkScene } = require('../../skills/storyboard/references/render-routing.js');
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
      camera: { framing: ['Elevated three-quarter view', 'Low wide view of the valley', 'Close view of the stream bed'][i % 3],
        movement: ['static', 'dolly in', 'truck right'][i % 3], speed: i % 3 ? 'slow' : 'steady', end: 'The open stream' },
      video: { engine: 'seedance', model: 'seedance-1-5-pro-251215', resolution: '1080p', generateAudio: false } } }));
  for (let i = 0; i < n; i++) {
    const prompts = assemble(win, i); win.SCENES[i].visual.bgPrompt = prompts.sourcePrompt;
    win.SCENES[i].visual.video.prompt = prompts.motionPrompt;
  }
  approve(win);
  return win;
}
function approve(win) { win.PRODUCTION.approval = { kind: 'user', at: '2026-09-06T12:00:00+09:00',
  reference: 'User selected full video with the displayed budget.', quoteFingerprint: quote(win).quoteFingerprint }; }
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
function stillClip(file, seconds = 5) {
  const render = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `color=c=gray:s=1080x1920:r=24:d=${seconds}`,
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
test('quotes four choices with billed seconds, retry range and API rates, excluding recordings', () => {
  const win = fixture(15), q = quote(win);
  assert.deepEqual(Object.keys(q.options), ['full_video', 'video_50', 'video_30', 'hook_only']);
  assert.equal(q.options.video_50.clips, 8);
  assert.equal(q.options.video_30.clips, 5);
  assert.equal(q.options.hook_only.firstPassUsd, .29);
  assert.equal(q.options.full_video.firstPassUsd, 4.35);
  assert.equal(q.options.full_video.retryHighUsd, 13.05);
  assert.equal(q.options.full_video.retryHighKrw, 18270);
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
test('hybrid and full video retain distinct semantic and policy rules', () => {
  const win = fixture(), scene = win.SCENES[0];
  assert.deepEqual(mode.check(win, { requireApproval: true }), []);
  // The bare fixture has no previz yet: that is the one thing the full check refuses.
  assert.deepEqual(checkScene(scene, { production: win.PRODUCTION }).map(m => m.replace(/ — .*/, '')),
    ['shot.render: every generated_video cut pre-renders its camera and blocking in 3D first']);
  assert.deepEqual(checkScene(scene, { production: win.PRODUCTION, draft: true }), []);
  withPreviz(win, 0);
  assert.deepEqual(checkScene(scene, { production: win.PRODUCTION }), []);
  assert.match(checkScene(scene).join(), /requires object_html/);
  const base = { generatedVideoMax: 2, videoBudgetUsd: 10, minTrueMotion: 1, allowedKinds: ['ai-video'] };
  assert.deepEqual(mode.policy(base, win.PRODUCTION, win.SCENES), { ...base, generatedVideoMax: 3, videoBudgetUsd: 15 });
  assert.equal(mode.policy(base, { mode: 'hybrid', videoBudgetUsd: 8 }, win.SCENES).generatedVideoMax, 2);
  assert.equal(base.generatedVideoMax, 2);
  scene.visual.slide = { kind: 'camera' };
  assert.match(mode.check(win).join(), /no slide\/still/);
  const draft = { PRODUCTION: { mode: 'full_video', videoBudgetUsd: 15, maxAttempts: 3 }, SCENES: [] };
  assert.deepEqual(mode.check(draft, { draft: true }), []);
  assert.match(mode.check(draft).join(), /style/);
});
test('the normal scene CLI permits full-video explanations beyond the hybrid cap', () => withBoard(({ board, save }) => {
  const win = fixture(); save(win);
  const run = spawnSync(process.execPath, [path.join(root, 'skills/storyboard/references/check-scenes.js'), board, '--draft', '--json'], { encoding: 'utf8' });
  assert.equal(run.error, undefined);
  assert.doesNotMatch(run.stdout, /requires object_html|beat has no visual.slide|generated-video slots/);
  // The assembler's own prompts clear the seedance prompt gate, and a silent clip gets no soundtrack warning.
  assert.doesNotMatch(run.stdout, /negative directive|digit seconds|no consistency lock|carries Korean|no visual\.audio/);
  win.PRODUCTION.mode = 'hybrid'; save(win);
  const hybrid = spawnSync(process.execPath, [path.join(root, 'skills/storyboard/references/check-scenes.js'), board, '--draft', '--json'], { encoding: 'utf8' });
  assert.match(hybrid.stdout, /requires object_html|generated-video slots/);
}));
test('full video still requires source-backed quantities and subtitle-only footage', () => {
  const win = fixture(), s = win.SCENES[0];
  s.shot.infoType = 'statistic'; s.shot.render.purpose = 'comparison';
  assert.match(checkScene(s, { production: win.PRODUCTION }).join(), /source/);
  s.stat = '100'; assert.match(mode.check(win).join(), /only burned subtitles/);
  s.stat = ''; s.visual.video.resolution = '720p';
  assert.match(mode.check(win).join(), /1080p/);
});
test('source and motion prompts share style without inventing a person; end-frame route is preserved', () => {
  const win = fixture(), p = assemble(win, 0);
  assert.match(p.sourcePrompt, /Matte concrete/); assert.match(p.sourcePrompt, /miniature/);
  assert.match(p.motionPrompt, /Buildings rise vertically/);
  assert.match(p.motionPrompt, /stays exactly consistent with the input frame/);
  assert.doesNotMatch(p.motionPrompt, /\d+ seconds|Korean woman/);
  win.SCENES[0].visual.video.lastImagePath = 'images/end.png';
  assert.equal(scenePlan(win.SCENES[0]).lastImagePath, 'images/end.png');
});
test('approval is bound to actual plan and prices but recording a generated output does not stale it', () => withBoard(({ board, save }) => {
  const win = fixture(); save(win); assert.deepEqual(check(board, { requireSelection: true }).errors, []);
  win.SCENES[0].visual.video.clip = '.work/accepted.mp4'; save(win);
  assert.deepEqual(check(board).errors, []);
  win.SCENES[0].duration = 6; save(win); assert.match(check(board).errors.join(), /quote is stale/);
  approve(win); save(win); assert.deepEqual(check(board).errors, []);
  win.PRODUCTION.approval.quoteFingerprint = 'old-price-table'; save(win); assert.match(check(board).errors.join(), /quote is stale/);
  delete win.PRODUCTION; save(win); assert.match(check(board, { requireSelection: true }).errors.join(), /Choose a production mode/);
}));
test('retry-inclusive budget, per-shot attempt limit and actual spend block new calls', () => withBoard(({ board, work, save }) => {
  const win = fixture(); win.PRODUCTION.videoBudgetUsd = .5; approve(win); save(win);
  assert.match(check(board).errors.join(), /Retry-inclusive/);
  win.PRODUCTION.videoBudgetUsd = 3; approve(win); save(win);
  writeFileSync(path.join(work, 'cost-tally.tsv'), [1, 2, 3].map(n => `seedance.1-5-pro-silent.1080p\t5\tvideo:shot=1:attempt=${n}`).join('\n'));
  assert.match(check(board, { beforeCall: 1 }).errors.join(), /attempt limit/);
  assert.deepEqual(check(board, { beforeCall: 2 }).errors, []);
  writeFileSync(path.join(work, 'cost-tally.tsv'), 'seedance.1-5-pro-silent.1080p\t100\tvideo:shot=1:attempt=1\n');
  assert.match(check(board, { beforeCall: 2 }).errors.join(), /Actual video spend/);
}));
test('actual media and review hashes gate the full-video manifest', () => withBoard(({ board, work, save }) => {
  const win = fixture(1), video = movingClip(path.join(work, 'accepted.mp4'));
  writeFileSync(path.join(board, 'images/scene-1.png'), 'fixture source bytes');
  win.SCENES[0].visual.video.clip = '.work/accepted.mp4'; save(win);
  assert.match(check(board, { ready: true }).errors.join(), /review is required/);
  const review = { shot: 1, reviewer: 'test fixture, not a human quality verdict', at: '2026-09-06T12:00:00Z',
    planDigest: shotDigest(win, 0), sourceSha256: hashFile(board, win.SCENES[0].visual.bg),
    motionEvidence: {kind:'subject_action',cameraOnly:false,observedChange:'The buildings lift away from the stream.',beats:[{at:0,state:'Buildings stand beside the stream.'},{at:4,state:'Buildings have cleared the stream.'}]},
    videoSha256: digest(readFileSync(video)), playback: true, seeks: [.1, 2.5, 4.8], defects: [],
    ...Object.fromEntries(['composition', 'materials', 'continuity', 'action', 'camera', 'referenceMatch'].map(k => [k, 'Synthetic fixture evidence for the contract: ' + k])) };
  writeFileSync(path.join(work, 'video-review.json'), JSON.stringify({ shots: [review] }));
  writeFileSync(path.join(work, 'cards.tsv'), '0\tvoice.wav\t4.5\tnone\n');
  writeFileSync(path.join(work, 'segs.tsv'), `0\t0\t${video}\tThe buildings rise.\tThe buildings rise.\n`);
  assert.deepEqual(check(board, { ready: true, manifest: true }).errors, []);
  writeFileSync(path.join(work, 'segs.tsv'), `0\t0\t@${video}::overlay.png\tLine\tLine\n`);
  assert.match(check(board, { manifest: true }).errors.join(), /without overlays/);
  writeFileSync(path.join(board, 'images/scene-1.png'), 'changed source');
  assert.match(check(board, { ready: true }).errors.join(), /review is stale/);
  // The clip's own bytes are measured: a frozen picture never enters the timeline even with a clean review.
  writeFileSync(path.join(board, 'images/scene-1.png'), 'fixture source bytes');
  stillClip(video); review.videoSha256 = digest(readFileSync(video)); review.sourceSha256 = hashFile(board, win.SCENES[0].visual.bg);
  writeFileSync(path.join(work, 'video-review.json'), JSON.stringify({ shots: [review] }));
  const still = check(board, { ready: true }).errors.join();
  assert.match(still, /reads as a still/); assert.match(still, /too little motion/);
  assert.ok(JSON.parse(readFileSync(path.join(work, 'motion-metrics.json'), 'utf8'))[review.videoSha256].frozenShare > .9);
}));
test('measured motion gates the in-point and the generated length against the card', () => withBoard(({ board, work, save }) => {
  const { motionGateErrors, motionMetrics } = require('../../skills/produce/references/check-production.js');
  const win = fixture(1), s = win.SCENES[0];
  const late = movingClip(path.join(work, 'late.mp4'), { seconds: 5, frozenHead: 1.5 });
  const m = motionMetrics(work, late, digest(readFileSync(late)));
  assert.ok(m.onsetSeconds >= 1.25 && m.onsetSeconds <= 2, JSON.stringify(m));
  assert.match(motionGateErrors(s, m, 6.5).join(), /visible motion starts at .* edit\.in is 0/);
  s.edit = { in: 1.5 }; assert.deepEqual(motionGateErrors(s, m, 6.5), []);
  const long = movingClip(path.join(work, 'long.mp4'), { seconds: 10 });
  const lm = motionMetrics(work, long, digest(readFileSync(long)));
  delete s.edit; assert.match(motionGateErrors(s, lm, 10).join(), /never reaches the screen/);
  s.edit = { in: 4 }; assert.deepEqual(motionGateErrors(s, lm, 10), []);
  assert.deepEqual(motionGateErrors(s, lm, 5), []);
}));
test('measure-motion summarises samples into frozen share, longest still run and onset', () => {
  const motion = require('../../skills/produce/references/measure-motion.js');
  const frames = [...Array(8).fill(.4), ...Array(8).fill(3), ...Array(4).fill(.9)].map((diff, i) => ({ time: i / 4, diff }));
  const s = motion.summarize(frames);
  assert.deepEqual(s, { samples: 20, seconds: 5, mean: 1.54, frozenShare: .6, longestStillSeconds: 2, onsetSeconds: 2 });
  assert.match(motion.findings(s, 'video').join(), /60% of the samples/);
  assert.deepEqual(motion.findings({ ...s, frozenShare: .2, mean: 2.5, longestStillSeconds: 1 }, 'video'), []);
  assert.deepEqual(motion.findings(s, 'card', { stillLimit: 8 }), []);
  assert.match(motion.findings({ ...s, frozenShare: .7 }, 'card', { stillLimit: 8 }).join(), /reads as a still/);
  assert.match(motion.findings({ ...s, frozenShare: .5, longestStillSeconds: 9 }, 'card', { stillLimit: 8 }).join(), /stands still for 9s/);
  assert.equal(motion.plateStillLimit({ max_static_ground_seconds: 'off' }), 8);
  assert.equal(motion.plateStillLimit({ max_static_ground_seconds: 11 }), 8);
  assert.equal(motion.plateStillLimit({ maxStaticGroundSeconds: 4 }), 4);
  assert.equal(motion.plateStillLimit(undefined), 8);
});
test('the assembled reel is measured card by card: a still-like slide fails, a still card is not gated', () => withBoard(({ work }) => {
  const { cardMotion } = require('../../skills/produce/references/verify-assembled.js');
  const moving = movingClip(path.join(work, 'a.mp4'), { seconds: 4 }), still = stillClip(path.join(work, 'b.mp4'), 4);
  mkdirSync(path.join(work, 'work'));
  const concat = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', moving, '-i', still, '-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0,fps=30[v]', '-map', '[v]',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', path.join(work, 'reel.mp4')], { encoding: 'utf8' });
  assert.equal(concat.status, 0, concat.stderr);
  writeFileSync(path.join(work, 'work/edit-timeline.tsv'), '0\t0\t120\tcut\t0\t0\t0\n1\t120\t120\tcut\t0\t0\t0\n');
  const scenes = [{ visual: { video: { clip: 'a.mp4' } } }, { visual: { slide: { kind: 'diagram', motion: true, file: 'slides/s2.html' } } }];
  assert.throws(() => cardMotion(work, scenes, { max_static_ground_seconds: 'off' }), /card 1: .*repeat the previous picture/);
  scenes[1] = { visual: { bg: 'images/still.png', camera: { movement: 'dolly in' } } };
  const result = cardMotion(work, scenes, { max_static_ground_seconds: 'off' });
  assert.equal(result.plateStillLimit, 8);
  assert.deepEqual(result.cards.map(c => c.kind), ['video', 'still']);
  assert.ok(result.cards[0].frozenShare < .1 && result.cards[1].frozenShare > .9);
  scenes[0] = { visual: { slide: { kind: 'camera', motion: true, file: 'slides/s1.html' } } };
  scenes[1] = { visual: { video: { clip: 'b.mp4' } } };
  assert.throws(() => cardMotion(work, scenes, {}), /card 1: .*stands still/);
}));
test('browser and CLI share signatures and the template loads a cost comparison', () => {
  const sandbox = { window: {} };
  vm.runInNewContext(readFileSync(path.join(root, 'skills/storyboard/references/production-mode.js'), 'utf8'), sandbox);
  const win = fixture(); assert.equal(sandbox.window.PRODUCTION_MODE.signature(win), mode.signature(win));
  const html = readFileSync(path.join(root, 'skills/storyboard/references/storyboard-html-template.html'), 'utf8');
  assert.match(html, /src="\.\/production-mode.js"/);
  assert.match(html, /PCOST\.options\[key\]/);
  // Every label goes through the STRINGS dictionary, the template's one i18n path.
  assert.doesNotMatch(html, /koMode|koFrames/);
  assert.match(html, /prodHead: "Production mode and video cost"/);
  assert.match(html, /prodHead: "제작 방식과 영상 생성비"/);
  for (const block of html.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(block[1]);
});
test('approved revisions count their own retries while retaining historical spend',()=>withBoard(({board,work,save})=>{
 const win=fixture(1);win.PRODUCTION.generationRevision='content-v3';approve(win);save(win);
 const ledger=path.join(work,'cost-tally.tsv');
 const old=Array.from({length:3},(_,i)=>`seedance.1-5-pro-silent.1080p\t5\tvideo:shot=1:attempt=${i+1}\n`).join('');
 writeFileSync(ledger,old);assert.deepEqual(check(board,{beforeCall:1}).errors,[]);
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

test('full-video preflight rejects missing actions and freezing people before a paid call', () => {
 const w=fixture(1),s=w.SCENES[0],m=s.shot.videoDesign.motion;
 delete s.shot.videoDesign.motion;
 assert.match(mode.check(w).join(),/motion.kind/);assert.throws(()=>assemble(w,0),/motion.kind/);
 s.shot.videoDesign.motion=m;s.visual.styleRole='interaction';
 s.visual.video.prompt='Keep every person and bundle fixed in place.';
 assert.match(mode.check(w).join(),/global freeze/);
 s.visual.video.prompt='The worker turns the valve.';
 m.kind='spatial_reveal';m.reason='Approach the hand.';
 assert.match(mode.check(w).join(),/require subject_action/);
 s.visual.styleRole='environment';assert.deepEqual(mode.motionErrors(s),[]);
});
test('subject motion evidence rejects camera-only playback and unchanged states',()=>{
 const {motionReviewErrors}=require('../../skills/produce/references/check-production.js');
 const s=fixture(1).SCENES[0];
 const review={motionEvidence:{kind:'subject_action',cameraOnly:true,observedChange:'The camera approaches the buildings.',beats:[{at:0,state:'Buildings stand beside the river.'},{at:4,state:'Buildings stand beside the river.'}]}};
 assert.equal(motionReviewErrors(s,review).length,2);
 review.motionEvidence.cameraOnly=false;review.motionEvidence.beats[1].state='Buildings rise above the river.';
 assert.deepEqual(motionReviewErrors(s,review),[]);
 review.motionEvidence.beats[1].at=99;assert.match(motionReviewErrors(s,review).join(),/playback times/);
});

test('action timing is validated and changing the plan invalidates approval',()=>{
 const w=fixture(1),s=w.SCENES[0],m=s.shot.videoDesign.motion;
 const signature=mode.signature(w);m.beats[1].state='Buildings move fully out of view.';
 assert.notEqual(mode.signature(w),signature);
 for(const beats of [[null], [{at:0,state:'A hand reaches.'},{at:8,state:'The hand releases.'}], [{at:2,state:'A hand reaches.'},{at:1,state:'The hand releases.'}]]) {
  m.beats=beats;assert.match(mode.motionErrors(s).join(),/motion.beats/);
 }
});

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
test('travelling end images follow the camera endpoint without forcing a fixed viewpoint',()=>{
 const w=fixture(1);w.SCENES[0].visual.camera.end='A closer view beside the river.';
 const p=assemble(w,0);assert.match(p.endFramePrompt,/closer view beside the river/);assert.doesNotMatch(p.endFramePrompt,/Keep the same camera position/);
});

// Offline media validates the import contract, not the visual quality of generated footage.
function reuseFixture(video) {
 const w=fixture(4); w.PRODUCTION={mode:'hybrid',videoBudgetUsd:0,maxAttempts:2};
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
 assert.notEqual(run.status,0,run.stdout+run.stderr);
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
 assert.deepEqual(check(board,{ready:true,manifest:true}).errors,[]);
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
 assert.deepEqual(check(board,{requireSelection:true}).errors,[]);
 assert.equal(quote(mixed).options.hybrid.reusedClips,1);assert.equal(quote(mixed).options.hybrid.firstPassUsd,0);
 mixed.SCENES[1]=fixture(1).SCENES[0];mixed.SCENES[1].shot.render={mode:'generated_video',purpose:'live_action',motionEssential:true,reason:'Watch the buildings rise.',action:'Buildings rise.',whyNotStill:'The removal is continuous.'};
 assert.equal(quote(mixed).options.hybrid.clips,1);assert.equal(quote(mixed).options.hybrid.firstPassUsd,.29);assert.equal(quote(mixed).options.hybrid.retryHighUsd,.58);
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

/* The second cover shape. A short may state the result on the cover: `hookType:"spoiler"` with
   `hookForm:"payoff"`, the cover speaking COMPREHENSION.answer, and the payoff landing on the
   opening group. Only the cover keeps its imported clip so the board stays under the video cap.
   A legal spoiler cover relaxes nothing on the metadata side — the title and the description
   stay under platform-playbook §2, which check-meta.js enforces on its own. */
function spoilerFixture(video) {
 const w=reuseFixture(video);
 const lines=['A fan moves the table.','The table shakes under the box.','The fan sits at the table edge.','Check the table before the box.'];
 const ref=shot=>({shot,group:1,quote:lines[shot-1]});
 w.SCENES.forEach((s,i)=>{s.narration=[{tts:lines[i],sub:lines[i]}];s.shot.info=lines[i];});
 w.SCENES[0].hookType='spoiler';w.SCENES[0].hookForm='payoff';
 w.SCENES[3].shot.share=lines[3];w.SCENES[3].shot.shareType='checklist';
 w.SCENES.slice(1).forEach((s,i)=>{
  s.shot.render={mode:'still_camera',purpose:'portrait',reason:['Hold on the shaking table.','Find the fan.','Return to the table.'][i],camera:{effect:'push',target:'subject',reason:'Make the subject clear.'}};
  s.visual={bg:'images/portrait.png',camera:{movement:'dolly in'},slide:{kind:'camera',motion:true,file:`slides/body-${i}.html`}};
 });
 Object.assign(w.STORY,{opening:ref(1),payoff:ref(1),ending:ref(4),endingReason:'End on the check the answer implies'});
 w.STORY.review={hash:require('../../skills/storyboard/references/story-contract.js').storyHash(w),verdict:'pass',unresolved:[],...Object.fromEntries(['meaning','progression','payoff','grounding'].map(k=>[k,{reason:`${k} evidence in fictional premise`,refs:[ref(1)]}]))};
 approve(w);return w;
}
test('a spoiler cover states the answer and the close still has to be forwardable',()=>withBoard(({board,work,save})=>{
 const originalVideo=movingClip(path.join(work,'original.mp4'));
 const video=path.join(work,'import.mp4');
 assert.equal(spawnSync('ffmpeg',['-v','error','-i',originalVideo,'-vf','scale=720:1280','-c:v','libx264','-preset','ultrafast',video],{encoding:'utf8'}).status,0);
 const gate=()=>spawnSync(process.execPath,[path.join(root,'skills/storyboard/references/check-scenes.js'),board,'--json'],{encoding:'utf8'});
 const w=spoilerFixture(video);save(w);
 const pass=gate();assert.equal(pass.status,0,pass.stdout+pass.stderr);
 assert.deepEqual(check(board,{requireSelection:true}).errors,[]);
 delete w.SCENES[3].shot.share;save(w);
 const missing=gate();
 assert.notEqual(missing.status,0);
 assert.match(missing.stdout+missing.stderr,/share trigger/);
}));
test('generation output existence never discounts a new generation or its retries',()=>withBoard(({work})=>{
 const w=fixture(1);w.PRODUCTION.mode='hybrid';const before=quote(w);
 const video=path.join(work,'existing.mp4');writeFileSync(video,'already exists');w.SCENES[0].visual.video.clip=video;
 assert.deepEqual(quote(w),before);
 assert.equal(before.options.hybrid.firstPassUsd,.29);assert.equal(before.options.hybrid.retryHighUsd,.87);
}));
test('a previz cut gets the clay-model preamble, the composition lock and the first frame as the first still reference', () => {
  const win = fixture(), prompts = withPreviz(win, 1), scene = win.SCENES[1];
  assert.match(prompts.motionPrompt, /^Image 1 is the first frame\. Use Video 1, a 3D clay-model previz, as the only reference for camera movement.*Do not reference its visual content\. The red model in Video 1 is the buildings from Image 2\. Low wide view of the valley, slow dolly in, ending on The open stream\./);
  assert.match(prompts.sourcePrompt, /Composition lock: the first attached image is frame 1 of the 3D previz/);
  assert.equal(prompts.previzFirstFrame, path.resolve('/board', 'previz/s2-f0001.png'));
  // The frame comes first (the composition), the miniature pack image second (the look).
  assert.equal(prompts.sourceImageArgs.referenced_image_paths[0], prompts.previzFirstFrame);
  assert.match(prompts.sourceImageArgs.referenced_image_paths[1], /tactile-miniature-v1/);
  assert.deepEqual(checkScene(scene, { production: win.PRODUCTION }), []);
  const plan = scenePlan(scene);
  assert.equal(plan.tool, 'seedance_reference'); assert.equal(plan.priceKey, 'seedance.2-0-video.1080p'); assert.equal(plan.billedSeconds, 10);
  scene.visual.video.model = 'seedance-1-5-pro-251215';
  assert.throws(() => scenePlan(scene), /takes no reference video — a previz cut is a Seedance 2\.x cut/);
  assert.match(checkScene(scene, { production: win.PRODUCTION }).join(), /not the one the user chose for this episode \(PRODUCTION\.videoModel/);
  scene.visual.video.model = win.PRODUCTION.videoModel.model;
  scene.visual.video.previz.renderer = 'blender';
  assert.match(checkScene(scene, { production: win.PRODUCTION }).join(), /not the one the user chose for this episode \(PRODUCTION\.previz/);
  scene.visual.video.previz.renderer = 'threejs';
  // The host lane: no Seedance fields, the still and the prompt carry the previz, and the preamble is not written.
  const host = fixture(); host.SCENES[2].visual.video = { engine: 'host', previz: { renderer: 'threejs', clip: 'previz/s3.mp4', firstFrame: 'previz/s3-f0001.png',
    sha256: 'd'.repeat(64), fps: 24, seconds: 5, camera: { movement: 'truck right' }, handoff: 'frame_and_prompt' } };
  const hp = assemble(host, 2, '/board'); host.SCENES[2].visual.video.prompt = hp.motionPrompt;
  assert.doesNotMatch(hp.motionPrompt, /Video 1/);
  assert.match(hp.sourcePrompt, /Composition lock/);
  assert.deepEqual(checkScene(host.SCENES[2], { production: host.PRODUCTION }), []);
  assert.deepEqual(scenePlan(host.SCENES[2]), { kind: 'motion', engine: 'host' });
  // A camera slot that contradicts the clip is refused.
  withPreviz(win, 2, { camera: { movement: 'arc shot' } });
  assert.match(checkScene(win.SCENES[2], { production: win.PRODUCTION }).join(), /contradicts visual\.camera\.movement/);
});
test('the previz renderer and the video model are HITL choices recorded before any render or call', () => {
  const win = fixture();
  assert.deepEqual(mode.check(win, { requireApproval: true }), []);
  const without = key => { const w = fixture(); delete w.PRODUCTION[key]; return mode.check(w).join(); };
  assert.match(without('previz'), /Ask which 3D previz renderer/);
  assert.match(without('videoModel'), /Ask which video model/);
  const w = fixture(); delete w.PRODUCTION.previz.selection; assert.match(mode.check(w).join(), /previz renderer HITL choice/);
  w.PRODUCTION.previz = { renderer: 'maya', selection: { kind: 'user', reference: 'x' } }; assert.match(mode.check(w).join(), /Ask which 3D previz renderer/);
  const r = fixture(); r.PRODUCTION.videoModel.resolution = '480p'; assert.match(mode.check(r).join(), /resolution must be one of 1080p/);
  r.PRODUCTION.videoModel = { model: 'seedance-1-5-pro-251215', resolution: '1080p', selection: { kind: 'user', reference: 'x' } };
  assert.match(mode.check(r).join(), /Ask which video model/);
  // The draft pass has no generated cuts settled yet; a board with no generated cut never asks.
  assert.doesNotMatch(mode.check(without.call(null, 'previz') && fixture(), { draft: true }).join(), /Ask which/);
  const still = fixture(); delete still.PRODUCTION.previz; delete still.PRODUCTION.videoModel;
  for (const s of still.SCENES) { s.shot.render.mode = 'still_camera'; delete s.visual.video; }
  assert.doesNotMatch(mode.check(still).join(), /Ask which/);
  // The host lane: the tool is the model, so the record says host or stays absent.
  const host = fixture(); host.PRODUCTION.videoProvider = 'host'; delete host.PRODUCTION.videoModel;
  assert.doesNotMatch(mode.check(host).join(), /Ask which|videoModel/);
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
  const rows = Object.fromEntries(table.rows.map(x => [x.model + '@' + x.resolution, x]));
  assert.ok(rows['dreamina-seedance-2-0-260128@1080p'].firstPassUsd > rows['dreamina-seedance-2-0-mini-260615@720p'].firstPassUsd);
  assert.equal(rows['dreamina-seedance-2-0-260128@1080p'].firstPassUsd, +(3 * 10 * 0.228).toFixed(2));
  assert.match(text(table), /Seedance 2\.0 mini 720p/);
  assert.match(text(options(host)), /videoProvider host/);
  // No mode yet → a clear error, not a TypeError; a hybrid board with no cut yet is marked provisional (review M7).
  const noMode = fixture(); delete noMode.PRODUCTION.mode;
  assert.throws(() => options(noMode), /Choose full_video, video_50, video_30 or hook_only first/);
  const hybrid = fixture(); hybrid.PRODUCTION.mode = 'hybrid'; hybrid.PRODUCTION.comparison = { model: 'seedance-1-5-pro-251215', resolution: '1080p', hybridShots: [1, 2] };
  for (const s of hybrid.SCENES) { s.shot.render.mode = 'still_camera'; delete s.visual.video; }
  const ht = options(hybrid); assert.equal(ht.cuts, 0);
  assert.ok(ht.rows.every(r => r.error || r.provisional === true), JSON.stringify(ht.rows[0]));
});
test('the assembled motion prompt clears the Seedance prompt gate that check-scenes.js runs', () => {
  const PROMPT = require('../../skills/storyboard/references/assemble-bg-prompt.js');
  const win = fixture(), p = assemble(win, 0).motionPrompt;
  assert.match(p, /^Elevated three-quarter view, static camera, ending on The open stream\./);
  assert.match(p, /At first, Buildings enclose the stream\. Finally, Buildings clear the river bed\./);
  assert.match(p, /The episode camera language holds: Elevated spatial reveals/);
  assert.match(p, /Audio: silent; narration is supplied separately\.$/);
  const body = p.slice(0, p.search(/Audio\s*:/));
  assert.deepEqual(PROMPT.negDirectiveHits(body, 'seedance'), []);
  assert.deepEqual(PROMPT.timingHits(body, 'seedance'), []);
  assert.deepEqual(PROMPT.hangulHits(p, 'seedance'), []);
  assert.equal(PROMPT.lockMissing(p, 'seedance'), false);
  for (const style of Object.values(mode.STYLES)) assert.deepEqual(PROMPT.negDirectiveHits(style.prompt, 'seedance'), []);
  const d = win.SCENES[0].shot.videoDesign;
  d.action = 'Do not move the trees while the buildings rise.';
  assert.throws(() => assemble(win, 0), /prompt gate.*negative directive/);
  d.action = 'Buildings rise over 4 seconds.';
  assert.throws(() => assemble(win, 0), /prompt gate.*digit seconds/);
  d.action = '건물이 올라간다.';
  assert.throws(() => assemble(win, 0), /prompt gate.*Korean/);
});
test('one camera contract: the four visual.camera slots, never videoDesign.camera', () => {
  const win = fixture(), s = win.SCENES[0];
  delete s.visual.camera.end;
  assert.throws(() => assemble(win, 0), /Missing visual\.camera\.end/);
  assert.match(mode.check(win).join(), /visual\.camera\.end is required/);
  s.visual.camera.end = 'The open stream'; s.shot.videoDesign.camera = 'A fixed view.';
  assert.throws(() => assemble(win, 0), /videoDesign\.camera is retired/);
  assert.match(mode.check(win).join(), /videoDesign\.camera is retired/);
  delete s.shot.videoDesign.camera; delete s.visual;
  assert.throws(() => assemble(win, 0), /Missing visual/);
});
test('three identical set-ups in a row fail full video; a changed framing passes', () => {
  const win = fixture();
  win.SCENES.forEach(s => { Object.assign(s.visual.camera, { framing: 'Elevated three-quarter view', movement: 'dolly in', speed: 'slow' }); });
  assert.match(mode.check(win).join(), /shots 1, 2, 3: the same framing and camera move/);
  win.SCENES[1].visual.camera.framing = 'Low wide view';
  assert.doesNotMatch(mode.check(win).join(), /three times in a row/);
});
test('the camera carries a full-video episode: visible moves, no provider lock under a move, static and wide in the minority', () => {
  const win = fixture(6);
  assert.deepEqual(mode.check(win), []);
  const s = win.SCENES[1];
  for (const span of [['dolly in', 'very slow'], ['gentle optical focus toward the woman', 'slow'], ['dolly in', 'barely perceptible'], ['hold composition with light variation', 'slow']]) {
    Object.assign(s.visual.camera, { movement: span[0], speed: span[1] });
    assert.match(mode.check(win).join(), /shot 2: visual\.camera asks for a move the viewer cannot see/, span.join(' '));
  }
  Object.assign(s.visual.camera, { movement: 'dolly in', speed: 'slow' });
  s.visual.video.cameraFixed = true;
  assert.match(mode.check(win).join(), /shot 2: visual\.video\.cameraFixed locks the provider camera/);
  s.visual.camera.movement = 'static'; delete s.visual.camera.speed;
  assert.doesNotMatch(mode.check(win).join(), /cameraFixed/);
  // Shots 1 and 2 are now both static: two in a row, and 3 of 6 exceeds one in three.
  assert.match(mode.check(win).join(), /shots 1, 2: two static cameras in a row/);
  assert.match(mode.check(win).join(), /3 of 6 shots hold a static camera/);
  Object.assign(s.visual.camera, { movement: 'arc shot', speed: 'steady' }); delete s.visual.video.cameraFixed;
  assert.deepEqual(mode.check(win), []);
  // Shot 5 is already 'Low wide view'; three more wide framings make four of six.
  win.SCENES.slice(0, 3).forEach(x => { x.visual.camera.framing = 'wide shot with small full-body figures'; });
  assert.match(mode.check(win).join(), /4 of 6 shots are framed wide/);
  win.SCENES[2].visual.camera.framing = 'medium shot from behind';
  assert.deepEqual(mode.check(win), []);
  // Hybrid keeps the per-shot camera rules on its generated clips.
  win.PRODUCTION.mode = 'hybrid'; win.SCENES.splice(2);
  win.SCENES[1].visual.camera.speed = 'imperceptibly slow';
  assert.match(mode.check(win).join(), /shot 2: visual\.camera asks for a move the viewer cannot see/);
});

test('a static camera leaves speed empty, and the final state is written once', () => {
  const win = fixture(), s = win.SCENES[0], d = s.shot.videoDesign;
  delete s.visual.camera.speed;
  assert.deepEqual(mode.check(win), []);
  assert.match(assemble(win, 0).motionPrompt, /^Elevated three-quarter view, static camera, /);
  assert.match(assemble(win, 0).endFramePrompt, /final state: Buildings clear the river bed\./);
  s.visual.camera.movement = 'dolly in';
  assert.match(mode.check(win).join(), /visual\.camera\.speed is required/);
  assert.throws(() => assemble(win, 0), /Missing visual\.camera\.speed/);
  s.visual.camera.movement = 'static';
  d.after = 'A crane now stands where the blocks were.';
  assert.match(mode.check(win).join(), /after must be the last motion beat/);
  assert.throws(() => assemble(win, 0), /after must be the last motion beat/);
  d.after = 'Buildings clear the river bed';
  assert.deepEqual(mode.check(win), []);
  delete d.after; d.motion.kind = 'spatial_reveal'; d.motion.reason = 'The camera carries the reveal.';
  assert.match(mode.check(win).join(), /videoDesign\.after is required/);
  assert.throws(() => assemble(win, 0), /Missing videoDesign\.after/);
});
test('a shot look outside the selected preset fails the full check, not only the draft', () => {
  const win = fixture();
  win.PRODUCTION.style.preset = 'photoreal';
  win.PRODUCTION.style.selection = { kind: 'user', reference: 'User chose photoreal for this episode.' };
  assert.match(mode.check(win).join(), /conflicts with the selected episode style/);
  win.SCENES.forEach(s => { s.shot.videoDesign.look = 'realistic'; });
  assert.deepEqual(mode.check(win), []);
});
test('the arcade-2d preset is prompt-only, carries the arcade look and keeps the HUD out of the picture', () => {
  const { LOOKS } = require('../../skills/storyboard/references/spatial-prompts.js');
  assert.deepEqual(mode.STYLES['arcade-2d'].looks, ['arcade']);
  assert.ok(mode.ALL_LOOKS.includes('arcade') && LOOKS.arcade);
  assert.ok(!mode.packPresets.includes('arcade-2d'));
  const win = fixture();
  win.PRODUCTION.style.preset = 'arcade-2d';
  win.PRODUCTION.style.selection = { kind: 'user', reference: 'User chose arcade-2d for this episode.' };
  assert.match(mode.check(win).join(), /conflicts with the selected episode style/);
  win.SCENES.forEach(s => { s.shot.videoDesign.look = 'arcade'; });
  assert.deepEqual(mode.check(win), []);
  const out = assemble(win, 0);
  assert.match(out.sourcePrompt, /Hand-painted 1990s arcade game art/);
  assert.match(out.motionPrompt, /The look holds: Hand-painted 1990s arcade game art/);
  assert.doesNotMatch(mode.STYLES['arcade-2d'].prompt, /HUD|health bar|lettering|portrait/i);
  assert.deepEqual(out.sourceReferenceImages, []);
});

test('imported clips preserve the whole file through the cinematic edit compiler',()=>{
 const {preview}=require('../../skills/produce/references/edit-plan.js');
 const scenes=[{type:'cover',transition:'cut',visual:{reuse:{clip:'old.mp4'}}},{type:'points',transition:'cut'}];
 assert.equal(preview(scenes)[0].in,0);assert.equal(preview(scenes)[0].handle,0);
 scenes[0].edit={in:1};assert.throws(()=>preview(scenes),/Reused clips cannot/);
 delete scenes[0].edit;scenes[1].transition='dissolve';assert.throws(()=>preview(scenes),/Reused clips cannot/);
 scenes[1].transition='dip';assert.equal(preview(scenes)[0].handle,0);
 delete scenes[0].visual;scenes[1].transition='dissolve';assert.equal(preview(scenes)[0].handle,.4);
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


test('percentage minima round up by new cut count and hook-only rejects extra videos', () => {
  const cuts = Array.from({ length: 7 }, (_, i) => ({ type: i ? 'points' : 'cover', duration: i ? 5 : 20, visual: {} }));
  const win = { PRODUCTION: { mode: 'video_50' }, SCENES: cuts };
  for (const s of cuts.slice(0, 3)) s.visual.video = { engine: 'host' };
  assert.match(mode.coverageErrors(win).join(), /at least 4 of 7/);
  assert.match(mode.check(win).join(), /at least 4 of 7/);
  cuts[3].visual.video = { engine: 'host' };
  assert.deepEqual(mode.coverageErrors(win), []);
  win.SCENES.push({ type: 'outro' }, { visual: { source: 'recording' } }, { visual: { source: 'stock', clip: 'stock.mp4' } }, { visual: { reuse: {} } });
  assert.deepEqual(mode.coverageErrors(win), []);
  win.PRODUCTION.mode = 'video_30';
  delete cuts[3].visual.video;
  assert.deepEqual(mode.coverageErrors(win), []);
  delete cuts[2].visual.video;
  assert.match(mode.coverageErrors(win).join(), /at least 3 of 7/);
  win.PRODUCTION.mode = 'hook_only';
  assert.match(mode.coverageErrors(win).join(), /only the opening hook/);
  delete cuts[1].visual.video;
  assert.deepEqual(mode.coverageErrors(win), []);
  delete cuts[0].visual.video;
  cuts[1].visual.video = {};
  assert.match(mode.coverageErrors(win).join(), /only the opening hook/);
  assert.equal(mode.policy({ generatedVideoMax: 2 }, { mode: 'video_50', videoBudgetUsd: 10 }, cuts).generatedVideoMax, 8);
  // hook_only: the hook plus the one imported clip pushed above — reuse is outside the ratio but still a slot.
  assert.equal(mode.policy({}, win.PRODUCTION, cuts).generatedVideoMax, 2);
  assert.equal(mode.policy({}, win.PRODUCTION, cuts.filter(s => s.visual?.reuse === undefined)).generatedVideoMax, 1);
  // b-roll is spliced by `after`, not a cut: it counts on neither side of the ratio.
  const broll = { type: 'broll', duration: 4, visual: { video: { engine: 'host' } } };
  assert.equal(mode.newCut(broll), false);
  win.PRODUCTION.mode = 'video_30';
  const before = mode.coverageErrors(win).join();
  win.SCENES.push(broll, broll);
  assert.equal(mode.coverageErrors(win).join(), before);
});

test('the quote runs the ratio over cuts and bills b-roll outside it', () => {
  const scenes = [{ type: 'cover', duration: 4, visual: {} }];
  for (let i = 0; i < 8; i++) scenes.push({ type: 'points', duration: 5, visual: {} });
  scenes.push({ type: 'broll', duration: 4, visual: {} }, { type: 'broll', duration: 4, visual: {} });
  const q = quote({ SCENES: scenes, PRODUCTION: { videoProvider: 'host' } });
  assert.equal(q.options.video_50.clips, 5 + 2);   // ceil(9 × .5) cuts + both b-rolls
  assert.equal(q.options.video_30.clips, 3 + 2);
  assert.equal(q.options.full_video.clips, 9 + 2);
  assert.equal(q.options.hook_only.clips, 1);
});

test('long-form hook-only comparison quotes hooking rather than cover', () => {
  const win = { SCENES: [{ type: 'cover', duration: 4, visual: {} }, { type: 'hooking', duration: 8, visual: {} }], PRODUCTION: { videoProvider: 'host' } };
  const q = quote(win);
  assert.equal(q.options.hook_only.clips, 1);
  assert.equal(q.options.hook_only.generatedSeconds, 8);
  win.PRODUCTION.mode = 'hook_only';
  win.SCENES[1].visual.video = { engine: 'host' };
  assert.deepEqual(mode.coverageErrors(win), []);
});


test('partial production choices can assemble generated-cut prompts and model quotes', () => {
  for (const key of ['video_50', 'video_30', 'hook_only']) {
    const win = fixture(1); win.PRODUCTION.mode = key;
    assert.doesNotThrow(() => assemble(win, 0, root));
    assert.equal(quote(win).options[key].provisional, false);
    assert.equal(quote(win).options[key].clips, 1);
  }
});

 test('source resolution follows reuse policy or the selected generation resolution, in either orientation',()=>{
  const {resolutionErrors}=require('../../skills/produce/references/check-production.js');
  for(const wide of [false,true]){
   const format=wide?'youtube-long-16x9':'shorts-9x16';
   const hd=wide?{width:1280,height:720}:{width:720,height:1280};
   const imported={visual:{reuse:{}}};
   assert.deepEqual(resolutionErrors(imported,hd,format),[]);
   assert.ok(resolutionErrors(imported,{width:hd.height,height:hd.width},format).length);
   assert.ok(resolutionErrors(imported,{width:hd.width-1,height:hd.height},format).length);
   assert.ok(resolutionErrors(imported,{},format).length);
   assert.ok(resolutionErrors(imported,null,format).length);
   assert.deepEqual(resolutionErrors({visual:{video:{resolution:'720p'}}},hd,format),[]);
   assert.match(resolutionErrors({visual:{video:{resolution:'1080p'}}},hd,format).join(),/1080p/);
  }
 });
