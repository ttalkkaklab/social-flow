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
    style: { preset: 'spatial-explainer', reference: 'https://www.youtube.com/shorts/LQZjvQ5W2ck',
      world: 'A granite valley with a river.', materials: 'Matte concrete and granite.', palette: 'Grey, green and blue.',
      lighting: 'Soft daylight with contact shadows.', camera: 'Elevated spatial reveals.' } }, SCENES: [] };
  win.SCENES = Array.from({ length: n }, (_, i) => ({ type: i ? 'points' : 'cover', duration: 5,
    title: '', narration: [{ tts: 'The buildings rise.', sub: 'The buildings rise.' }],
    shot: { infoType: 'principle', render: { mode: 'generated_video', purpose: 'physical_state',
      reason: 'Reveal the stream.', action: 'The buildings rise.' }, videoDesign: {
      motion: {kind:'subject_action',subject:'Buildings',visibleChange:'Buildings rise away from the stream.',beats:[{at:0,state:'Buildings enclose the stream.'},{at:4,state:'Buildings clear the river bed.'}]},
      look: 'miniature', worldId: 'valley', before: 'Buildings enclose the stream.', action: 'Buildings rise vertically.',
      after: 'The full stream is visible.', camera: 'The camera holds a three-quarter view.',
      continuity: 'The river and mountain retain their original shape.', reject: 'Reject unstable buildings and changing trees.' } },
    visual: { why: 'Physical removal exposes the stream.', action: 'The buildings rise.', bg: `images/scene-${i + 1}.png`,
      camera: { framing: 'Elevated three-quarter view', movement: 'static', speed: 'steady', end: 'The open stream' },
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
function withBoard(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), 'sf-production-')), board = path.join(dir, 'storyboard'), work = path.join(dir, '.work');
  mkdirSync(path.join(board, 'images'), { recursive: true }); mkdirSync(work);
  const save = win => writeFileSync(path.join(board, 'scenes.js'), Object.entries(win).map(([k, v]) => `window.${k}=${JSON.stringify(v)};`).join('\n'));
  try { return fn({ dir, board, work, save }); } finally { rmSync(dir, { recursive: true, force: true }); }
}
test('quotes both modes with billed seconds, retry range and API rates, excluding recordings', () => {
  const win = fixture(15), q = quote(win);
  assert.equal(q.options.hybrid.firstPassUsd, .58);
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
test('hybrid and full video retain distinct semantic and policy rules', () => {
  const win = fixture(), scene = win.SCENES[0];
  assert.deepEqual(mode.check(win, { requireApproval: true }), []);
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
  assert.match(p.motionPrompt, /Preserve identity/);
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
  delete win.PRODUCTION; save(win); assert.match(check(board, { requireSelection: true }).errors.join(), /Choose hybrid/);
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
  const win = fixture(1), video = path.join(work, 'accepted.mp4');
  // A deterministic synthetic clip tests media validation; it is not claimed as a visual-quality sample.
  const render = spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=gray:s=1080x1920:r=1:d=5', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', video], { encoding: 'utf8' });
  assert.equal(render.status, 0, render.stderr);
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
}));
test('browser and CLI share signatures and the template loads a cost comparison', () => {
  const sandbox = { window: {} };
  vm.runInNewContext(readFileSync(path.join(root, 'skills/storyboard/references/production-mode.js'), 'utf8'), sandbox);
  const win = fixture(); assert.equal(sandbox.window.PRODUCTION_MODE.signature(win), mode.signature(win));
  const html = readFileSync(path.join(root, 'skills/storyboard/references/storyboard-html-template.html'), 'utf8');
  assert.match(html, /src="\.\/production-mode.js"/);
  assert.match(html, /PCOST\.options\[key\]/);
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
