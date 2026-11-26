'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { section, rows } = require('./check-research.js');
const { orderedPerformance } = require('./story-performance.js');
const ENGINES = ['curiosity', 'fear', 'intrigue', 'comedy', 'empathy', 'awe', 'discovery'];
const text = x => typeof x === 'string' && !!x.trim();
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);

function readContract(body) {
  const blocks = [...body.matchAll(/^```scenario-json\s*\n([^]*?)^```\s*$/gm)];
  if (blocks.length !== 1) throw new Error('exactly one scenario-json block is required');
  const data = JSON.parse(blocks[0][1]);
  if (!object(data)) throw new Error('scenario-json must contain an object');
  return data;
}

// Compare only delivered events, not declared premise, engine, intent or difference.
// Exact normalized text catches copied openings without pretending to judge story similarity.
function observableBeat(beat, audienceOnly = false) {
  if (!Array.isArray(beat?.events) || !beat.events.length || beat.events.some(e =>
    !object(e) || !text(e.text) || (e.kind !== 'action' && !text(e.character)) || !['action', 'dialogue', 'narration'].includes(e.kind))) return null;
  return beat.events.map(e => [e.kind, (audienceOnly ? e.audience?.speaker : e.character) || null,
    (audienceOnly ? e.audience?.listener : e.to) || null, e.text.trim().replace(/\s+/g, ' ')]);
}
function audienceBeat(beat) {
  const evidence = observableBeat(beat, true);
  if (!evidence) return null;
  const ordered = orderedPerformance(beat.events);
  return ordered.map(({e, j, together}, i) => [...evidence[j], e.delivery || null,
    together !== undefined && ordered[i - 1]?.together === together]);
}
function observableOpeningSignature(data) {
  if (!Array.isArray(data?.beats)) return null;
  const opening = data.beats.filter(b => b?.item !== 'CTA').slice(0, 4).map(audienceBeat);
  return opening.length === 4 && opening.every(Boolean) ? JSON.stringify(opening) : null;
}

function checkScenarioV2(meta, body, research, opts = {}) {
  const findings = [], bad = what => findings.push({ level: 'bad', where: opts.where || 'scenario', what: 'V2 ' + what });
  const warn = what => findings.push({ level: 'warn', where: opts.where || 'scenario', what: 'V2 ' + what });
  let data;
  try { data = readContract(body); } catch (e) { bad(e.message); return { meta, findings }; }
  if (opts.authoring || Object.hasOwn(data, 'primaryHookType')) {
    const issue = require('./opening-hook.js').selectionFinding(data.primaryHookType, (opts.where || 'scenario') + '.primaryHookType');
    if (issue) findings.push(issue);
  }
  if (!['evidence', 'fiction', 'adapted'].includes(data.kind)) bad('kind must be evidence, fiction or adapted');
  for (const key of ['premise', 'viewerExperience', 'message', 'endingReason'])
    if (!text(data[key])) bad(key + ' is required');
  // A single settled scenario has nothing to differ from; the sentence matters when alternatives exist.
  if (!text(data.difference)) warn('difference could state how this candidate differs from the alternatives in situation, choice or payoff');
  if (!ENGINES.includes(data.engine)) bad('unknown viewer engine');
  if (!['narration', 'dialogue', 'visual', 'mixed'].includes(data.expression)) bad('unknown expression mode');
  if (!['held', 'upfront', 'none'].includes(data.reveal)) bad('reveal must be held, upfront or none');
  // As many directions as the decision needs: D1, D2, … (not a fixed three).
  if (!/^D[1-9]\d*$/.test(String(meta.direction || ''))) bad('direction must be D<n> (D1, D2, …)');
  if (!text(meta.channel) || !text(meta.topic)) bad('channel and topic are required');
  const cast = Array.isArray(data.cast) ? data.cast : [];
  const ids = new Set();
  for (const c of cast) {
    if (!object(c) || !text(c.id) || ids.has(c.id)) { bad('cast requires unique character IDs'); continue; }
    ids.add(c.id);
    for (const key of ['role', 'want', 'voice', 'reason']) if (!text(c[key])) bad('cast ' + c.id + ' needs ' + key);
  }
  if (!cast.length) bad('select at least one character from the channel pool');
  if (!Array.isArray(opts.pool)) bad('cast.json with a characters array is required');
  else {
    const poolIds = new Set();
    for (const c of opts.pool) {
      if (!object(c) || !text(c.id) || poolIds.has(c.id) || !text(c.source)) { bad('character pool needs unique IDs and identity source paths'); continue; }
      poolIds.add(c.id);
      if (opts.directory) {
        try { if (!fs.statSync(path.resolve(opts.directory, c.source)).isFile()) bad('character identity source is not a file: ' + c.source); }
        catch (_) { bad('missing character identity source: ' + c.source); }
      }
    }
    for (const id of ids) if (!poolIds.has(id)) bad('character is not in channel pool: ' + id);
  }
  const verified = new Set(rows(section(research || '', /^##\s+(?:\d+[.)]\s*)?(?:[\w가-힣]{1,8}\s)?(?:Verified|검증\s*(?:표|통과))/i))
    .filter(r => /^\**\s*★?\s*\d+\s*★?\s*\**$/.test(r[0])).map(r => Number(r[0].replace(/\D/g, ''))));
  if (!Array.isArray(data.beats)) bad('beats must be an array');
  const beats = Array.isArray(data.beats) ? data.beats : [];
  if (!beats.some(b => b && b.item !== 'CTA')) warn('No narrative beat to read');
  let previousPerformance;
  const used = new Set(), factual = [];
  beats.forEach((b, i) => {
    if (!object(b)) { bad('beat must be an object'); return; }
    if (b.item !== 'CTA') for (const key of ['expectation', 'change', 'necessity']) if (!text(b[key])) warn(b.item + ' could explain ' + key);
    if (b.item !== 'CTA') {
      const performed = audienceBeat(b);
      const signature = performed && JSON.stringify(performed);
      if (signature && signature === previousPerformance)
        warn('Beat ' + (i + 1) + ' repeats the preceding observable events exactly. Check what new evidence, cost or choice the viewer receives, or group the hold with that beat.');
      previousPerformance = signature;
    }
    if (b.item === 'CTA' && b.events === undefined) return;
    if (!Array.isArray(b.events)) { bad(b.item + ' needs events'); return; }
    if (!b.events.length && b.item !== 'CTA') warn(b.item + ' has no observable event; review whether the empty beat is useful');
    const groups = new Set();
    for (const e of b.events) {
      if (!object(e) || e.group === undefined) continue;
      if (!['dialogue','narration'].includes(e.kind) || !Number.isInteger(e.group) || e.group < 1 || groups.has(e.group))
        bad('give each linked speech a unique positive group inside its beat');
      else groups.add(e.group);
    }
    b.events.forEach(e => {
      if (!object(e) || !['action', 'dialogue', 'narration'].includes(e.kind) || !text(e.text)) { bad('events need kind and text'); return; }
      if ((e.kind !== 'action' || e.character !== undefined) && !ids.has(e.character)) bad('event character is not cast: ' + e.character);
      if (e.withGroup !== undefined && (e.kind !== 'action' || !groups.has(e.withGroup)))
        bad('withGroup must identify speech in the same beat as the action');
      if (e.delivery !== undefined && (e.kind === 'action' || !['on_screen','off_screen','voiceover'].includes(e.delivery)))
        bad('speech delivery must be on_screen, off_screen or voiceover');
      used.add(e.character);
      if (e.kind === 'dialogue' && !text(e.to)) bad('dialogue needs an addressee (character ID, self, audience or unidentified)');
      if (e.to && !ids.has(e.to) && !['self', 'audience', 'unidentified'].includes(e.to)) bad('unknown dialogue addressee: ' + e.to);
      if (!['fact', 'invented', 'interpretation'].includes(e.basis)) bad('each event needs fact, invented or interpretation basis');
      if (e.basis === 'fact' || e.basis === 'interpretation') {
        factual.push(e);
        if (!Array.isArray(e.claims) || !e.claims.length || e.claims.some(n => !Number.isInteger(n) || !verified.has(n))) bad('factual events require existing Verified claim IDs');
      }
      if (data.kind === 'evidence' && e.basis === 'invented') bad('invented events require fiction or adapted kind');
    });
  });
  for (const id of ids) if (!used.has(id)) bad('unused cast member: ' + id);
  if (data.kind !== 'fiction' && !factual.length) bad('evidence/adapted candidates need a factual basis');
  if (data.kind === 'adapted' && !text(data.adaptationBoundary)) bad('adapted stories require adaptationBoundary');
  if (!Array.isArray(data.setups)) bad('setups must be an array (empty for stories without plants)');
  else data.setups.forEach(s => {
    if (!object(s) || !Number.isInteger(s.open) || !Number.isInteger(s.pay) || s.open < 1 || s.pay > beats.length || s.pay <= s.open ||
      !beats[s.open - 1] || !beats[s.pay - 1] || beats[s.open - 1].item === 'CTA' || beats[s.pay - 1].item === 'CTA' ||
      !text(s.detail) || !text(s.reinterpretation)) bad('setup needs detail, reinterpretation and ordered 1-based beat open/pay referencing existing narrative beats');
  });
  const spoken = beats.flatMap(b => Array.isArray(b?.events) ? b.events : []).filter(e => object(e) && e.kind !== 'action');
  if (data.expression === 'visual' && spoken.length) bad('visual expression must not contain speech');
  if (data.expression === 'dialogue' && spoken.some(e => e.kind === 'narration')) bad('dialogue expression must not contain narrator speech');
  if (data.expression === 'narration' && spoken.some(e => e.kind === 'dialogue')) bad('narration expression must not contain dialogue');
  if (data.reveal === 'held' && !data.setups?.length) bad('held reveals need a planted detail and payoff');
  if (opts.chosen && opts.hasScenes && !text(meta.frozen)) warn('selected scenario has no freeze stamp; record provenance when useful without blocking board authoring');
  return { meta: { ...meta, engine_primary: data.engine }, findings, data };
}
module.exports = { readContract, checkScenarioV2, observableBeat, observableOpeningSignature, ENGINES };
