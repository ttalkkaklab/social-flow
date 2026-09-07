#!/usr/bin/env node
'use strict';
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const mode = require('../../storyboard/references/production-mode.js');
const { framePlan } = require('../../storyboard/references/render-routing.js');
const cost = require('../../autoproduce/references/cost-preview.js');
const { quote, digest } = require('../../autoproduce/references/production-cost.js');

function assetPath(storyboard, file) {
  if (typeof file !== 'string' || !file.trim() || /^https?:/.test(file)) throw new Error('A local asset path is required');
  return path.resolve(file.startsWith('.work/') ? path.dirname(storyboard) : storyboard, file);
}
function hashFile(storyboard, file) { return digest(fs.readFileSync(assetPath(storyboard, file))); }
function shotDigest(win, index) {
  return digest(mode.signature({ ...win, SCENES: [win.SCENES[index]] }));
}
function readReviews(work) {
  const file = path.join(work, 'video-review.json');
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { shots: [] };
}
function videoFile(scene) { return mode.reused(scene) ? scene.visual.reuse.clip : scene.visual.video.clip; }
function accepted(win, index, storyboard, review) {
  const scene = win.SCENES[index];
  if (mode.reused(scene)) return review && review.planDigest === shotDigest(win, index) &&
    review.videoSha256 === scene.visual.reuse.sha256 && review.videoSha256 === hashFile(storyboard, videoFile(scene));
  return review && review.planDigest === shotDigest(win, index) &&
    review.sourceSha256 === hashFile(storyboard, scene.visual.bg) &&
    (!framePlan(scene).end || review.endSha256 === hashFile(storyboard, framePlan(scene).end)) &&
    review.videoSha256 === hashFile(storyboard, scene.visual.video.clip);
}
function motionReviewErrors(scene, review) {
  const m = scene.shot?.videoDesign?.motion, e = review.motionEvidence, errors = [];
  if (!e || e.kind !== m?.kind || typeof e.observedChange !== 'string' || e.observedChange.trim().length < 12)
    return ['review needs motionEvidence matching the planned motion kind and an observed change'];
  if (m.kind === 'subject_action') {
    if (e.cameraOnly !== false) errors.push('Camera-only motion cannot pass a subject-action review');
    if (!Array.isArray(e.beats) || e.beats.length < 2 || e.beats.some(b => !b || !Number.isFinite(b.at) || b.at < 0 || b.at > scene.duration || typeof b.state !== 'string' || b.state.trim().length < 12) ||
        e.beats.some((b, i) => i && b.at <= e.beats[i - 1].at) || new Set(e.beats.map(b => b.state.trim())).size < 2)
      errors.push('Motion review needs distinct observed subject states at ordered playback times');
  }
  return errors;
}
// The imported file is already cut; the source range is provenance, never an edit instruction.
function validateReuseAsset(storyboard, scene, format) {
  const errors = mode.reuseErrors(scene);
  if (errors.length) throw new Error(errors.join('; '));
  if (hashFile(storyboard, videoFile(scene)) !== scene.visual.reuse.sha256)
    throw new Error('reused clip SHA-256 differs from the declared input');
  const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries',
    'stream=width,height:format=duration', '-of', 'json', assetPath(storyboard, videoFile(scene))], { encoding: 'utf8' });
  if (probe.status !== 0) throw new Error('ffprobe could not read the reused video');
  const media = JSON.parse(probe.stdout), stream = media.streams?.[0], wide = format === 'youtube-long-16x9';
  if (!stream || stream.width < (wide ? 1920 : 1080) || stream.height < (wide ? 1080 : 1920))
    throw new Error('reused clip is below the approved 1080p canvas');
  const seconds = Number(media.format?.duration), range = scene.visual.reuse.sourceRange;
  if (!Number.isFinite(seconds) || Math.abs(seconds - (range.end - range.start)) > .05)
    throw new Error('reused clip duration differs from sourceRange; import an already trimmed clip (0.05s tolerance)');
}
function check(storyboard, { requireSelection = false, ready = false, beforeCall = null, manifest = false, workdir = null } = {}) {
  storyboard = path.resolve(storyboard);
  const win = cost.readScenes(path.join(storyboard, 'scenes.js'));
  const errors = mode.check(win, { requireSelection, requireApproval: true });
  if (!win.PRODUCTION) return { errors, active: false };
  if (errors.length) return { errors, active: true };
  if (beforeCall !== null && win.SCENES[beforeCall - 1] && mode.reused(win.SCENES[beforeCall - 1]))
    return { active: true, errors: ['A reused clip cannot be selected for a new video API call'] };
  // Imports already exist at selection time. Check bytes and dimensions even before other assets.
  for (const [index, scene] of win.SCENES.entries()) {
    if (!mode.reused(scene)) continue;
    try { validateReuseAsset(storyboard, scene, win.FORMAT); }
    catch (e) { errors.push('shot ' + (index + 1) + ': ' + e.message); }
  }
  const work = workdir ? path.resolve(workdir) : path.join(path.dirname(storyboard), '.work'), p = win.PRODUCTION;
  const current = quote(win), option = current.options[p.mode];
  if (option.provisional) errors.push('The selected mode still has a provisional quote; finish its shot plan before approval');
  if (p.approval.quoteFingerprint !== current.quoteFingerprint)
    errors.push('Approved cost quote is stale: re-quote the changed plan/prices and obtain approval before generation');
  if (option.retryHighUsd > p.videoBudgetUsd + 1e-9)
    errors.push('Retry-inclusive video estimate exceeds the approved episode budget');
  const ledger = path.join(work, 'cost-tally.tsv');
  const spent = fs.existsSync(ledger) ? cost.runReport(ledger) : { exit: 0, items: [] };
  if (spent.exit) errors.push('Actual cost ledger has unresolved prices');
  if (cost.videoSpent(spent.items) > p.videoBudgetUsd + 1e-9) errors.push('Actual video spend exceeds the approved budget');
  const reviews = readReviews(work);
  if (!Array.isArray(reviews.shots)) errors.push('video-review.json needs a shots array');
  if (beforeCall !== null) {
    const row = option.rows.find(r => r.shot === beforeCall);
    if (!row) errors.push('Requested shot has no priced video generation');
    const lines = fs.existsSync(ledger) ? fs.readFileSync(ledger, 'utf8').split(/\r?\n/).filter(l => /^(seedance|veo)\./.test(l)) : [];
    if (lines.some(l => !/video:shot=\d+:attempt=\d+/.test(l))) errors.push('Every video ledger line needs video:shot=N:attempt=M for retry accounting');
    // Revised boards retain all historic spend, but count retries within their approved revision.
    const revision = p.generationRevision;
    if (revision !== undefined && !/^[a-zA-Z0-9_-]+$/.test(revision)) errors.push('Invalid generationRevision');
    const attempts = lines.filter(l => l.includes(`video:shot=${beforeCall}:`) &&
      (!revision || l.split(/\s+/).includes(`revision=${revision}`))).length;
    if (attempts >= p.maxAttempts) errors.push('This shot has exhausted the approved attempt limit');
    const pending = option.rows.filter(r => {
      if (r.shot === beforeCall) return true;
      try { return !accepted(win, r.shot - 1, storyboard, (reviews.shots || []).find(x => x.shot === r.shot)); }
      catch { return true; }
    });
    if (cost.videoSpent(spent.items) + pending.reduce((sum, r) => sum + r.usd, 0) > p.videoBudgetUsd + 1e-9)
      errors.push('Spent video plus the next call and unfinished shots exceeds the approved budget');
  }
  if (ready) {
    win.SCENES.forEach((scene, index) => {
      if (!mode.reused(scene) && !(mode.full(p) && mode.eligible(scene))) return;
      const prefix = 'shot ' + (index + 1) + ': ', bad = msg => errors.push(prefix + msg);
      const matches = (reviews.shots || []).filter(r => r.shot === index + 1), review = matches[0];
      if (matches.length !== 1) { bad('one current video review is required'); return; }
      try {
        if (!accepted(win, index, storyboard, review)) bad('review is stale; inspect the current image, clip and shot plan');
        const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries',
          'stream=width,height:format=duration', '-of', 'json', assetPath(storyboard, videoFile(scene))], { encoding: 'utf8' });
        if (probe.status !== 0) throw new Error('ffprobe could not read the video');
        const media = JSON.parse(probe.stdout), stream = media.streams?.[0];
        const wide = win.FORMAT === 'youtube-long-16x9';
        if (!stream || stream.width < (wide ? 1920 : 1080) || stream.height < (wide ? 1080 : 1920)) bad('clip is below the approved 1080p canvas');
        if (!(Number(media.format?.duration) + .05 >= scene.duration)) bad('clip is shorter than the shot; never loop, reverse or freeze-pad');
        if (review.playback !== true || !review.reviewer || !Number.isFinite(Date.parse(review.at))) bad('record full playback inspection, reviewer and time');
        for (const key of ['composition', 'materials', 'continuity', 'action', 'camera', 'referenceMatch'])
          if (typeof review[key] !== 'string' || review[key].trim().length < 12) bad('review needs concrete evidence for ' + key);
        motionReviewErrors(scene, review).forEach(bad);
        if (!Array.isArray(review.defects) || review.defects.length) bad('unresolved visual defects block production');
        const seeks = review.seeks;
        if (!Array.isArray(seeks) || seeks.length < 3 || seeks.some(t => !Number.isFinite(t) || t < 0 || t > scene.duration) ||
            !seeks.some(t => t <= scene.duration * .15) || !seeks.some(t => t >= scene.duration * .85) ||
            !seeks.some(t => t >= scene.duration * .4 && t <= scene.duration * .6)) bad('inspect start, middle and end frames with valid seek times');
      } catch (e) { bad(e.message); }
    });
  }
  const generatedShots = option.rows.map(r => r.shot - 1);
  const reusedShots = Array.from(win.SCENES).flatMap((s, i) => mode.reused(s) ? [i] : []);
  const plainVideoShots = [...(mode.full(p) ? generatedShots : []), ...reusedShots];
  if (manifest && plainVideoShots.length) {
    const cards = fs.readFileSync(path.join(work, 'cards.tsv'), 'utf8').split(/\r?\n/).filter(l => l && !l.startsWith('#')).map(l => l.split('\t'));
    const segments = fs.readFileSync(path.join(work, 'segs.tsv'), 'utf8').split(/\r?\n/).filter(l => l && !l.startsWith('#')).map(l => l.split('\t'));
    for (const index of plainVideoShots) {
      const card = cards.filter(r => Number(r[0]) === index), segs = segments.filter(r => Number(r[0]) === index);
      if (card.length !== 1 || card[0][3] !== 'none' || !segs.length) errors.push('Plain-video manifest needs one zoom=none card with segments for shot ' + (index + 1));
      const expected = assetPath(storyboard, videoFile(win.SCENES[index]));
      if (segs.some(r => !r[2] || /::|\||^@/.test(r[2]) || path.resolve(work, r[2]) !== expected))
        errors.push('Plain-video segments must use only the approved clip, without overlays or freeze/palindrome wrappers: shot ' + (index + 1));
    }
  }
  return { active: true, mode: p.mode, generatedShots, reusedShots, plainVideoShots, errors, quote: current };
}
module.exports = { check, shotDigest, hashFile, assetPath, motionReviewErrors, videoFile, validateReuseAsset };
if (require.main === module) {
  try {
    const args = process.argv.slice(2), target = args[0];
    if (!target) throw new Error('usage: check-production.js <storyboard dir> [--selection|--ready|--before-call N]');
    const result = check(target, { requireSelection: args.includes('--selection'), ready: args.includes('--ready'), manifest: args.includes('--manifest'), workdir: args.includes('--workdir') ? args[args.indexOf('--workdir') + 1] : null,
      beforeCall: args.includes('--before-call') ? Number(args[args.indexOf('--before-call') + 1]) : null });
    if (args.includes('--json')) console.log(JSON.stringify(result, null, 2));
    else console.log(result.errors.length ? result.errors.join('\n') : 'Production mode, approved quote and requested checks OK');
    process.exitCode = result.errors.length ? 1 : 0;
  } catch (e) { console.error('check-production: ' + e.message); process.exitCode = 1; }
}
