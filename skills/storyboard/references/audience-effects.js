'use strict';
// Shared by board reads, targeted writes and the final sound compiler.
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { assetPath } = require('../../produce/references/check-production.js');

function canonical(value) {
  return JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
}
function fail(code, shot, id, detail) { throw new Error(`${code}: ${shot}/${id} — ${detail}`); }
function checkDelivery(shot, effect) {
  if (effect.audience && ![undefined, 'auto', 'post'].includes(effect.delivery))
    fail('audience_delivery_conflict', shot, effect.id, 'audience effects play in post');
}
function boardClock(board, dir, channel) {
  const episode = path.dirname(dir), parent = path.dirname(episode);
  channel ??= path.basename(parent) === 'episodes' ? path.dirname(parent) : episode;
  const soundAssets = new Map();
  const files = new Map(), cuts = new Map();
  // verify-assembled and splice-clip insert b-roll at its position in SCENES.
  const order = board.SCENES || [];
  function media(name) {
    if (!name || typeof name !== 'string') return null;
    const file = assetPath(dir, name);
    if (!files.has(file)) {
      let hash = null;
      if (fs.existsSync(file) && fs.statSync(file).isFile()) {
        const fd = fs.openSync(file, 'r'), buf = Buffer.alloc(256 * 1024), digest = createHash('sha256');
        try { let n; while ((n = fs.readSync(fd, buf)) > 0) digest.update(buf.subarray(0, n)); }
        finally { fs.closeSync(fd); }
        hash = digest.digest('hex');
      }
      files.set(file, [name, hash]);
    }
    return files.get(file);
  }
  function cut(id) {
    if (cuts.has(id)) return cuts.get(id);
    const s = order.find(x => x.id === id);
    if (!s) return null;
    const v = s.visual || {}, group = v.video?.groupPlan;
    const selected = v.reuse?.clip || v.video?.clip || v.renderedFile || v.clip || v.slide?.file || v.frames?.start || v.bg;
    const edit = s.edit || {};
    // edit-plan derives this card's outgoing live handle and dip from the following card.
    const following = order.slice(order.indexOf(s) + 1).find(n => !['broll','outro'].includes(n.type));
    const exit = following?.transition || 'cut';
    const inputs = [s.id, s.type, s.duration, s.transition, exit, following?.edit?.transitionSeconds, [edit.in,edit.out,edit.pre,edit.post,edit.transitionSeconds], s.sound?.audioSource, v.sync, v.reuse?.sourceRange,
      board.SB_DOC?.performanceTimingVersion, board.SB_DOC?.speechPlanVersion,
      media(selected), group, group?.groups?.map(g => media(g.clip)), s.performance,
      (s.narration || []).map(n => [n.id, n.tts, n.speaker, n.acting, n.audio?.revision, media(n.audio?.path), n.revealGroups])];
    cuts.set(id, inputs);
    return inputs;
  }
  function basis(shotId, effect, endId) {
    const asset = board.SFX?.[effect.sfx]?.asset || effect.sfx;
    if (!soundAssets.has(asset)) {
      const resolver = path.resolve(__dirname, '../../channel/references/resolve-asset.py');
      const found = spawnSync('python3', [resolver,channel,'sfx',asset], {encoding:'utf8'});
      soundAssets.set(asset, found.status === 0 ? media(found.stdout.trim())?.[1] : null);
    }
    return createHash('sha256').update(canonical([cut(shotId), effect.trigger, effect.audience.release, asset, soundAssets.get(asset),
      endId ? [endId, cut(endId)] : null])).digest('hex');
  }
  function bounds(shotId, effect) {
    const a = order.findIndex(s => s.id === shotId), b = effect.end ? order.findIndex(s => s.id === effect.end.shotId) : a;
    const invalid = reason => fail('audience_span_invalid', shotId, effect.id, reason);
    if (a < 0 || b < a || order.slice(a, b + 1).some(s => ['broll','outro'].includes(s.type))) invalid('missing, reversed or spliced card');
    const s = order[a], last = order[b], start = effect.atSeconds;
    if (!Number.isFinite(start) || start < 0 || (Number.isFinite(s.duration) && start >= s.duration)) invalid('start outside shot');
    if (!effect.end) { if (effect.fadeOutSeconds != null) invalid('a fade needs an end'); return; }
    const offset = effect.end.atSeconds;
    if (offset !== 'end' && (!Number.isFinite(offset) || offset < 0 || (Number.isFinite(last.duration) && offset > last.duration))) invalid('end outside shot');
    const end = offset === 'end' ? last.duration : offset;
    const elapsed = order.slice(a, b).reduce((t, item) => t + (item.duration ?? NaN), 0) + end - start;
    if (elapsed <= 0 || (effect.fadeOutSeconds ?? 0) > elapsed || !(Number.isFinite(effect.fadeOutSeconds ?? 0) && (effect.fadeOutSeconds ?? 0) >= 0)) invalid('empty interval or fade exceeds span');
  }
  function row(shotId, effect) {
    const currentTimingBasis = basis(shotId, effect, effect.end?.shotId);
    let status = effect.atSeconds == null ? 'planned' : effect.audience.timingBasis === currentTimingBasis ? 'placed' : 'stale';
    if (status === 'placed') { try { bounds(shotId, effect); } catch { status = 'stale'; } }
    return { shotId, id: effect.id, intent: effect.audience.intent, trigger: effect.trigger, sfx: effect.sfx,
      atSeconds: effect.atSeconds, end: effect.end, caseId: effect.audience.caseId, status, currentTimingBasis, placedTimingBasis: effect.audience.timingBasis, listening: 'not_reviewed' };
  }
  return { basis, bounds, row };
}
function read(board, dir, prospective, onlyShot) {
  const clock = boardClock(board, dir), result = [];
  for (const shot of board.SCENES || []) {
    if (onlyShot && shot.id !== onlyShot) continue;
    for (const effect of Array.isArray(shot.sound?.effects) ? shot.sound.effects : []) if (effect?.audience) {
      const row = clock.row(shot.id, effect);
      if (prospective?.shotId === shot.id && prospective.id === effect.id) {
        if (prospective.endShotId !== null && !board.SCENES.some(s => s.id === prospective.endShotId)) fail('audience_span_invalid', shot.id, effect.id, 'unknown end shot');
        row.proposedTimingBasis = clock.basis(shot.id, effect, prospective.endShotId);
      }
      result.push(row);
    }
  }
  return result;
}
function patch(board, dir, args) {
  const ops = args.audienceEffects || [], changed = [], seen = new Set(), clock = boardClock(board, dir);
  if ((args.sfxEntries && args.globals?.SFX) || (ops.length && (args.set || args.shots || args.removeShots ||
      ops.some(o => args.shotsById?.some(s => s.id === o.shotId) || args.removeShotIds?.includes(o.shotId)))))
    throw new Error('audience_id_conflict: overlapping board replacements');
  if (args.sfxEntries) {
    const book = { ...board.SFX };
    for (const [id, entry] of Object.entries(args.sfxEntries)) {
      if (Object.hasOwn(book, id)) {
        if (canonical(book[id]) !== canonical(entry)) fail('audience_id_conflict', 'SFX', id, 'choose a new asset variant');
      } else { Object.defineProperty(book, id, { value: entry, enumerable: true, configurable: true, writable: true }); changed.push({ sfx: id }); }
    }
    board.SFX = book;
  }
  for (const op of ops) {
    const { shotId, id } = op, key = JSON.stringify([shotId,id]);
    if (seen.has(key)) fail('audience_id_conflict', shotId, id, 'duplicate operation');
    seen.add(key);
    const shot = board.SCENES.find(s => s.id === shotId);
    if (!shot || ['broll','outro'].includes(shot.type)) fail('audience_span_invalid', shotId, id, 'requires a body shot');
    if (shot.sound?.effects != null && !Array.isArray(shot.sound.effects)) fail('audience_id_conflict', shotId, id, 'existing effects must be an array');
    const effects = [...(shot.sound?.effects || [])], matches = effects.filter(e => e?.id === id);
    const old = matches[0], i = effects.indexOf(old);
    if (matches.length > 1 || (old && !old.audience)) fail('audience_id_conflict', shotId, id, 'id belongs to another event');
    if (op.op === 'remove') {
      if (!old) continue;
      effects.splice(i, 1);
    } else {
      const e = { ...old, id, delivery: 'post', audience: { ...old?.audience } };
      if (op.op === 'plan') {
        for (const k of ['sfx','intent','trigger','description','caseId','release','intensity','separationLu']) {
          const target = ['intent','caseId','release'].includes(k) ? e.audience : e;
          if (op[k] === null) delete target[k]; else if (op[k] !== undefined) target[k] = op[k];
        }
        if (![e.sfx,e.description,e.trigger,e.audience.intent].every(v => typeof v === 'string' && v.trim()))
          fail('audience_plan_invalid', shotId, id, 'new plan needs sfx, description, trigger and intent');
      } else {
        if (!old) fail('audience_plan_invalid', shotId, id, 'plan this effect first');
        for (const k of ['end','fadeOutSeconds']) {
          if (op[k] === null) delete e[k]; else if (op[k] !== undefined) e[k] = op[k];
        }
        e.atSeconds = op.atSeconds;
        clock.bounds(shotId, e);
        const current = clock.basis(shotId, e, e.end?.shotId);
        if (current !== op.timingBasis) fail('audience_timing_stale', shotId, id, 'read the current placement basis');
        e.audience.timingBasis = current;
      }
      if (canonical(old) === canonical(e)) continue;
      if (old) effects[i] = e; else effects.push(e);
    }
    shot.sound = { ...shot.sound, effects };
    changed.push({ shotId, id });
  }
  return { changed, needsPlacement: read(board, dir).filter(e => e.status !== 'placed') };
}
module.exports = { boardClock, read, patch, checkDelivery };
