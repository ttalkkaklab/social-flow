'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { section, rows } = require('./check-research.js');
const ITEMS = ['주제', '훅', '전개 #1', '전개 #2', '전개 #3', '마무리', 'CTA'];
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

function checkScenarioV2(meta, body, research, opts = {}) {
  const findings = [], bad = what => findings.push({ level: 'bad', where: opts.where || 'scenario', what: 'V2 ' + what });
  let data;
  try { data = readContract(body); } catch (e) { bad(e.message); return { meta, findings }; }
  if (!['evidence', 'fiction', 'adapted'].includes(data.kind)) bad('kind must be evidence, fiction or adapted');
  for (const key of ['premise', 'viewerExperience', 'message', 'endingReason', 'difference'])
    if (!text(data[key])) bad(key + ' is required');
  if (!ENGINES.includes(data.engine)) bad('unknown viewer engine');
  if (!['narration', 'dialogue', 'visual', 'mixed'].includes(data.expression)) bad('unknown expression mode');
  if (!['held', 'upfront', 'none'].includes(data.reveal)) bad('reveal must be held, upfront or none');
  if (!['D1', 'D2', 'D3'].includes(meta.direction)) bad('direction must be D1, D2 or D3');
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
  const beats = Array.isArray(data.beats) ? data.beats : [];
  if (beats.length !== 6 || beats.some((b, i) => b?.item !== ITEMS[i + 1])) bad('beats must cover hook, three developments, ending and optional CTA in order');
  const used = new Set(), factual = [];
  beats.forEach((b, i) => {
    if (!object(b)) { bad('beat must be an object'); return; }
    for (const key of ['expectation', 'change', 'necessity']) if (!text(b[key])) bad(b.item + ' needs ' + key);
    if (!Array.isArray(b.events)) { bad(b.item + ' needs events'); return; }
    if (!b.events.length && !(b.item === 'CTA' && data.cta === 'none')) bad(b.item + ' needs an observable event');
    b.events.forEach(e => {
      if (!object(e) || !['action', 'dialogue', 'narration'].includes(e.kind) || !text(e.text)) { bad('events need kind and text'); return; }
      if (!ids.has(e.character)) bad('event character is not cast: ' + e.character);
      used.add(e.character);
      if (e.kind === 'dialogue' && !text(e.to)) bad('dialogue needs an addressee (character ID, self or audience)');
      if (e.to && !ids.has(e.to) && !['self', 'audience'].includes(e.to)) bad('unknown dialogue addressee: ' + e.to);
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
  if (!['none', 'question', 'action', 'next'].includes(data.cta)) bad('invalid CTA');
  if (!Array.isArray(data.setups)) bad('setups must be an array (empty for stories without plants)');
  else data.setups.forEach(s => {
    if (!object(s) || !Number.isInteger(s.open) || !Number.isInteger(s.pay) || s.open < 1 || s.pay > 5 || s.pay <= s.open || !text(s.detail) || !text(s.reinterpretation)) bad('setup needs detail, reinterpretation and ordered 1-based beat open/pay');
  });
  const spoken = beats.flatMap(b => Array.isArray(b?.events) ? b.events : []).filter(e => object(e) && e.kind !== 'action');
  if (data.expression === 'visual' && spoken.length) bad('visual expression must not contain speech');
  if (data.expression === 'dialogue' && spoken.some(e => e.kind === 'narration')) bad('dialogue expression must not contain narrator speech');
  if (data.expression === 'narration' && spoken.some(e => e.kind === 'dialogue')) bad('narration expression must not contain dialogue');
  if (data.cta === 'none' && beats[5]?.events?.length) bad('CTA none must not contain an ask; put closing events in the ending');
  if (data.reveal === 'held' && !data.setups?.length) bad('held reveals need a planted detail and payoff');
  if (opts.chosen && opts.hasScenes && !text(meta.frozen)) bad('selected scenario must freeze before board authoring');
  return { meta: { ...meta, engine_primary: data.engine }, findings, data };
}
module.exports = { readContract, checkScenarioV2, ENGINES };
