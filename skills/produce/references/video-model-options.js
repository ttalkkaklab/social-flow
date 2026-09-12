#!/usr/bin/env node
'use strict';
/* video-model-options.js — the video-model HITL table (production-mode.md §When to ask).
 *
 *   node video-model-options.js <storyboard dir|scenes.js> [--json]
 *
 * Every generated cut carries a 3D previz and rides Seedance 2.x as a reference-video cut
 * (blender-previz.md §6), so the model is a choice the user makes, not a default: the same
 * board costs ten times more on 2.0 at 1080p than on 1.5 Pro did, and 2.0 mini at 720p sits in
 * between. This prints one row per model the price table prices with a reference video —
 * first-pass and retry-inclusive USD for the whole board, computed by the same quote() the
 * approval binds — so the question is asked with real numbers. Read-only; calls no API.
 */
const fs = require('fs'), path = require('path');
const { readScenes } = require('../../autoproduce/references/cost-preview.js');
const { quote } = require('../../autoproduce/references/production-cost.js');
const mode = require('../../storyboard/references/production-mode.js');

function previzCuts(win) {
  return (win.SCENES || []).map((s, i) => ({ s, i })).filter(({ s }) =>
    mode.eligible(s) && !mode.reused(s) && s.visual?.video && s.shot?.render?.mode === 'generated_video' && (s.visual.video.engine || 'seedance') !== 'host');
}
/* One quote per model: the board with every previz cut routed to that model and resolution. */
function options(win, { krwPerUsd = 1400 } = {}) {
  const cuts = previzCuts(win), rows = [];
  if (!mode.MODES[win.PRODUCTION?.mode]) throw new Error('Choose full_video, video_50, video_30 or hook_only first (PRODUCTION.mode is missing)');
  if (win.PRODUCTION.videoProvider === 'host') return { host: true, cuts: cuts.length, rows: [] };
  for (const [model, spec] of Object.entries(mode.VIDEO_MODELS)) {
    for (const resolution of spec.resolutions) {
      const clone = JSON.parse(JSON.stringify(win));
      for (const { i } of cuts) {
        const v = clone.SCENES[i].visual.video;
        Object.assign(v, { model, resolution, modelPurpose: 'previz', engine: 'seedance', realFaceInput: false,
          modelReason: v.modelReason || 'the previz carries the camera (user-chosen model)',
          referenceImagePaths: v.referenceImagePaths && v.referenceImagePaths.length ? v.referenceImagePaths : [clone.SCENES[i].visual.bg || 'images/scene-' + (i + 1) + '.png'] });
        if (!v.previz) v.previz = { renderer: clone.PRODUCTION.previz?.renderer || 'blender', clip: 'previz/s' + (i + 1) + '.mp4', firstFrame: 'previz/s' + (i + 1) + '-f0001.png',
          sha256: '0'.repeat(64), fps: 24, seconds: Math.max(4, Math.ceil(Number(clone.SCENES[i].duration) || 4)), camera: { movement: clone.SCENES[i].visual.camera?.movement || 'static' } };
      }
      let q;
      try { q = quote(clone, { krwPerUsd }).options[clone.PRODUCTION.mode]; }
      catch (e) { rows.push({ model, resolution, label: spec.label, error: e.message }); continue; }
      if (!q) { rows.push({ model, resolution, label: spec.label, error: 'no quote for mode ' + clone.PRODUCTION.mode }); continue; }
      rows.push({ model, resolution, label: spec.label, clips: q.clips, generatedSeconds: q.generatedSeconds,
        firstPassUsd: q.firstPassUsd, retryLowUsd: q.retryLowUsd, retryHighUsd: q.retryHighUsd, maxAttempts: q.maxAttempts,
        firstPassKrw: q.firstPassKrw, retryHighKrw: q.retryHighKrw, provisional: q.provisional });
    }
  }
  return { host: false, cuts: cuts.length, budgetUsd: win.PRODUCTION.videoBudgetUsd, rows };
}
function text(result) {
  if (result.host) return `videoProvider host — the CLI's own video tool makes the ${result.cuts} cuts at $0 on its allowance; the model question does not apply.`;
  const lines = [`${result.cuts} generated cut(s), budget cap $${result.budgetUsd}`];
  for (const r of result.rows) {
    if (r.error) { lines.push(`  ${r.label} ${r.resolution}: !! ${r.error}`); continue; }
    lines.push(`  ${r.label} ${r.resolution} (${r.model}): 최초 $${r.firstPassUsd.toFixed(2)} (약 ${r.firstPassKrw.toLocaleString('ko-KR')}원) · ${Math.min(2, r.maxAttempts)}–${r.maxAttempts}회 시도 $${r.retryLowUsd.toFixed(2)}–$${r.retryHighUsd.toFixed(2)}` +
      (r.retryHighUsd > result.budgetUsd + 1e-9 ? ` · 예산 상한 $${result.budgetUsd} 초과` : '') +
      (r.provisional ? ' · 아직 컷이 없어 비교 모델 기준 — 컷을 쓰고 다시 뽑는다' : ''));
  }
  return lines.join('\n');
}
module.exports = { options, previzCuts, text };
if (require.main === module) {
  try {
    const args = process.argv.slice(2), target = args.find(a => !a.startsWith('--'));
    if (!target) throw new Error('usage: video-model-options.js <storyboard dir|scenes.js> [--json]');
    const win = readScenes(fs.statSync(target).isDirectory() ? path.join(target, 'scenes.js') : target);
    const result = options(win);
    console.log(args.includes('--json') ? JSON.stringify(result, null, 2) : text(result));
  } catch (e) { console.error('video-model-options: ' + e.message); process.exitCode = 1; }
}
