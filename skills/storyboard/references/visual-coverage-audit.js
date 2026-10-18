#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { framePlan } = require('./render-routing.js');

// Inventory evidence, never infer semantic agreement or award a quality score.
function audit(win, directory) {
  const shots = [], findings = [], hashes = new Map(), records = new Map();
  const warn = (code, shotIds, detail) => findings.push({ code, shotIds, detail });
  function imageEvidence(reference) {
    if (!reference) return { path: null, status: 'unverified', reason: 'no_source_image' };
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(reference)) {
      return { path: reference, status: 'unverified', reason: 'remote_not_fetched' };
    }
    if (!/\.(png|jpe?g|webp|avif|bmp|tiff?|svg)$/i.test(reference)) {
      return { path: reference, status: 'unverified', reason: 'not_a_still_image' };
    }
    try {
      const bytes = fs.readFileSync(path.resolve(directory, reference));
      return { path: reference, status: 'bytes_available', sha256: createHash('sha256').update(bytes).digest('hex') };
    } catch {
      return { path: reference, status: 'unverified', reason: 'unreadable_source_image' };
    }
  }
  const scenes = Array.isArray(win?.SCENES) ? win.SCENES : [];
  if (!Array.isArray(win?.SCENES)) warn('scenes_unavailable', [], { note: 'SCENES is missing or not an array.' });
  for (const [index, rawScene] of scenes.entries()) {
    const validScene = rawScene && typeof rawScene === 'object' && !Array.isArray(rawScene);
    const scene = validScene ? rawScene : {};
    if (!validScene) warn('invalid_scene', [null], { position: index + 1 });
    const id = scene.id ?? null;
    const planned = scene.productionPlan?.cuts;
    const representative = framePlan(scene).start || null;
    const cuts = Array.isArray(planned) && planned.length ? planned : [{ path: representative }];
    const row = { shotId: id, position: index + 1, representative,
      reviewScope: scene.productionPlan?.imageReview?.scope || 'unspecified', cuts: [] };
    for (const [cutIndex, rawCut] of cuts.entries()) {
      const validCut = rawCut && typeof rawCut === 'object' && !Array.isArray(rawCut);
      const cut = validCut ? rawCut : {};
      if (!validCut) warn('invalid_cut', [id], { cut: cutIndex + 1 });
      const media = typeof cut.path === 'string' ? cut.path : null;
      const video = ['motion', 'video', 'stock_video'].includes(cut.kind) || /\.(mp4|mov|webm|mkv)$/i.test(media || '');
      if (video) {
        let mediaStatus = 'missing_media_reference';
        if (media && /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(media)) {
          mediaStatus = 'remote_not_fetched';
        } else if (media) {
          try {
            mediaStatus = fs.statSync(path.resolve(directory, media)).isFile()
              ? 'file_exists' : 'not_a_file';
          } catch { mediaStatus = 'unreadable_media'; }
        }
        if (mediaStatus !== 'file_exists') warn('video_media_unverified', [id],
          { cut: cutIndex + 1, media, reason: mediaStatus });
      }
      // A block thumbnail is not a source frame for every later motion cut.
      const source = cut.sourceImage || cut.image || cut.visual?.bg || cut.visual?.src || (!video ? media : null);
      const evidence = imageEvidence(typeof source === 'string' ? source : null);
      row.cuts.push({ cut: cutIndex + 1, kind: cut.kind || 'legacy', media,
        seconds: cut.seconds ?? null, image: evidence, playback: video ? 'unverified' : 'not_applicable' });
      if (evidence.sha256) {
        const group = hashes.get(evidence.sha256) || [];
        group.push({ shotId: id, position: index + 1, cut: cutIndex + 1, path: evidence.path });
        hashes.set(evidence.sha256, group);
      } else warn(video && !source ? 'video_only_unverified' : 'source_image_unverified', [id],
        { cut: cutIndex + 1, media, reason: evidence.reason });
    }
    if (cuts.length > 1) warn('multi_cut_block', [id],
      { cutCount: cuts.length, note: 'Review every cut; the representative image covers only one instant.' });
    const review = scene.productionPlan?.imageReview;
    if (review) {
      if (!review.scope) warn('review_scope_unspecified', [id], { record: review.record || null });
      if (typeof review.record === 'string') {
        const key = JSON.stringify([review.record, review.score]);
        const group = records.get(key) || [];
        group.push({ shotId: id, position: index + 1, scope: review.scope || 'unspecified' });
        records.set(key, group);
      }
    }
    shots.push(row);
  }
  for (const [sha256, uses] of hashes) {
    if (uses.length > 1) {
      warn('identical_image_bytes', [...new Set(uses.map(use => use.shotId))], { sha256, uses });
    }
  }
  for (const [key, uses] of records) {
    if (uses.length < 2) continue;
    const [record, score] = JSON.parse(key);
    warn('shared_review_score', uses.map(use => use.shotId), { record, score,
      scopes: uses.map(use => use.scope),
      note: 'A shared chapter or batch score does not establish each shot score. Inspect the record and its per-shot evidence.' });
  }
  return { version: 1, scope: 'visual_coverage_inventory', semanticAgreement: 'unverified',
    note: 'Hashes establish byte identity only. Inspect actual pixels and the whole sequence; no quality score is computed.',
    shots, findings };
}

if (require.main === module) {
  try {
    const argument = process.argv[2];
    if (!argument) throw new Error('Usage: node visual-coverage-audit.js <storyboard-directory|scenes.js>');
    const file = argument.endsWith('.js') ? path.resolve(argument) : path.resolve(argument, 'scenes.js');
    const win = require('../../autoproduce/references/cost-preview.js').readScenes(file);
    process.stdout.write(JSON.stringify(audit(win, path.dirname(file))) + '\n');
  } catch (error) {
    process.stderr.write(error.message + '\n');
    process.exitCode = 1;
  }
}

module.exports = { audit };
