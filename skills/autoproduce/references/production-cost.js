#!/usr/bin/env node
'use strict';
// Read-only quotes. Reuse the production router and ledger calculator, never UI subscription prices.
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
const cost = require('./cost-preview.js');
const mode = require('../../storyboard/references/production-mode.js');
const { DEFAULT_MODEL } = require('../../produce/references/seedance-route.js');
const PRICES = path.join(__dirname, 'prices.tsv');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');

function pricedRows(scenes) {
  const rows = cost.forecastRows(cost.videoSlots(scenes));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'production-cost-'));
  try {
    const file = path.join(dir, 'quote.tsv');
    fs.writeFileSync(file, rows.map(r => [r.key, r.qty, r.memo].join('\t')).join('\n') + '\n');
    const report = rows.length ? cost.runReport(file) : { exit: 0, total: 0, items: [], unresolved: [] };
    if (report.exit) throw new Error('Price unavailable: ' + report.unresolved.join('; '));
    return { totalUsd: report.total, rows: rows.map(r => {
      const item = report.items.find(i => i.key === r.key);
      return { shot: r.slot.shot, seconds: r.qty, key: r.key, unitUsd: item.unitUsd,
        usd: +(item.unitUsd * r.qty).toFixed(6), generation: r.slot.plan || null };
    }) };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

function quote(win, { krwPerUsd = 1400 } = {}) {
  if (!Number.isFinite(krwPerUsd) || krwPerUsd <= 0) throw new Error('krwPerUsd must be positive');
  const p = win.PRODUCTION || {}, attempts = p.maxAttempts ?? 3;
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 5) throw new Error('maxAttempts must be 1–5');
  const reuseErrors = (win.SCENES || []).flatMap(mode.reuseErrors);
  if (reuseErrors.length) throw new Error(reuseErrors.join('; '));
  const reusedClips = (win.SCENES || []).filter(mode.reused).length;
  const inputs = (win.SCENES || []).filter(s => mode.eligible(s) && !mode.reused(s));
  // Under the host lane (owner directive 2026-09-07) the comparison is the CLI's own image_to_video at $0;
  // the Seedance planning fields exist only on the API lane.
  const hostVideo = p.videoProvider === 'host';
  const model = p.comparison?.model || DEFAULT_MODEL;
  const resolution = p.comparison?.resolution || (hostVideo ? '720p' : '1080p');
  const candidate = inputs.map(s => ({ type: 'points', duration: s.duration,
    visual: { video: hostVideo ? { engine: 'host', resolution, generateAudio: false }
      : { engine: 'seedance', model, modelReason: 'HITL comparison', realFaceInput: false, resolution, generateAudio: false } } }));
  const selectedHybrid = p.comparison?.hybridShots || inputs.slice(0, 2).map((_, i) => i + 1);
  if (!Array.isArray(selectedHybrid) || selectedHybrid.length < (inputs.length ? 1 : 0) || selectedHybrid.length > 2 ||
      new Set(selectedHybrid).size !== selectedHybrid.length || selectedHybrid.some(n => !Number.isInteger(n) || n < 1 || n > inputs.length))
    throw new Error('comparison.hybridShots must name 1–2 distinct eligible shots, numbered from 1');
  const options = {};
  for (const key of [...mode.CHOICES, ...(p.mode === 'hybrid' ? ['hybrid'] : [])]) {
    const provisional = key !== p.mode || (!reusedClips && !inputs.some(s => s.visual?.video || s.type === 'broll'));
    const hookIndex = inputs.indexOf(mode.hookScene(win.SCENES || []));
    // Ratios run over cuts (production-mode.js newCut); b-roll is outside the ratio but billed all the same.
    const cutIndexes = inputs.map((s, i) => (s.type === 'broll' ? -1 : i)).filter(i => i >= 0);
    const brollIndexes = inputs.map((s, i) => (s.type === 'broll' ? i : -1)).filter(i => i >= 0);
    const planned = key === 'hybrid' ? candidate.filter((_, i) => selectedHybrid.includes(i + 1))
      : key === 'hook_only' ? candidate.filter((_, i) => i === hookIndex)
      : cutIndexes.slice(0, Math.ceil(cutIndexes.length * mode.RATIOS[key])).concat(brollIndexes).map(i => candidate[i]);
    const scenes = provisional ? planned : win.SCENES;
    const estimate = pricedRows(scenes);
    options[key] = { label: mode.MODES[key], provisional, clips: estimate.rows.length,
      ...(reusedClips ? { reusedClips } : {}),
      generatedSeconds: estimate.rows.reduce((sum, r) => sum + r.seconds, 0),
      firstPassUsd: estimate.totalUsd, retryLowUsd: +(estimate.totalUsd * Math.min(2, attempts)).toFixed(6),
      retryHighUsd: +(estimate.totalUsd * attempts).toFixed(6), maxAttempts: attempts,
      firstPassKrw: Math.round(estimate.totalUsd * krwPerUsd),
      retryLowKrw: Math.round(estimate.totalUsd * Math.min(2, attempts) * krwPerUsd),
      retryHighKrw: Math.round(estimate.totalUsd * attempts * krwPerUsd), rows: estimate.rows };
  }
  const result = { version: 1, selected: p.mode || null, videoProvider: hostVideo ? 'host' : 'api', planSignature: mode.signature(win),
    priceDigest: digest(fs.readFileSync(PRICES)), krwPerUsd, exchangeRateIsAssumption: true,
    scope: 'Video API generation only; images, narration, music, editing, tax and payment fees excluded.',
    priceSource: 'skills/autoproduce/references/prices.tsv',
    vendorSource: 'https://docs.byteplus.com/docs/ModelArk/1099320', options };
  result.quoteFingerprint = digest(JSON.stringify(result));
  return result;
}

function main() {
  const args = process.argv.slice(2), value = name => args[args.indexOf(name) + 1];
  let win;
  if (args.includes('--seconds')) {
    const seconds = Number(value('--seconds')), clip = args.includes('--clip-seconds') ? Number(value('--clip-seconds')) : 5;
    if (!(seconds > 0 && seconds <= 3600 && clip >= 4 && clip <= 12)) throw new Error('Use --seconds 1–3600 and --clip-seconds 4–12');
    win = { PRODUCTION: { maxAttempts: 3 }, SCENES: Array.from({ length: Math.ceil(seconds / clip) }, (_, i) =>
      ({ type: 'points', duration: Math.min(clip, seconds - i * clip), visual: {} })) };
  } else {
    const target = args[0];
    if (!target || target.startsWith('--')) throw new Error('usage: production-cost.js <storyboard dir|scenes.js> [--json] or --seconds 75');
    win = cost.readScenes(fs.statSync(target).isDirectory() ? path.join(target, 'scenes.js') : target);
  }
  const result = quote(win, { krwPerUsd: args.includes('--krw-per-usd') ? Number(value('--krw-per-usd')) : 1400 });
  if (args.includes('--json')) return console.log(JSON.stringify(result, null, 2));
  console.log('영상 제작 방식 · API 영상 생성비 예상 (이미지·음성·편집·세금 제외)');
  const routes = [...new Set(Object.values(result.options).flatMap(o => o.rows.map(r => {
    const g = r.generation;
    return g ? `${g.model} · ${g.resolution} · ${g.generateAudio ? '음성 포함' : '무음'}` : r.key;
  })))];
  console.log('생성 조건: ' + routes.join(' / '));
  for (const option of Object.values(result.options)) console.log(
    `${option.label}: ${option.clips}개 / 생성 ${option.generatedSeconds}초 · 최초 $${option.firstPassUsd.toFixed(2)} (약 ${option.firstPassKrw.toLocaleString('ko-KR')}원)` +
    ` · 평균 ${Math.min(2, option.maxAttempts)}–${option.maxAttempts}회 시도 $${option.retryLowUsd.toFixed(2)}–$${option.retryHighUsd.toFixed(2)} (약 ${option.retryLowKrw.toLocaleString('ko-KR')}–${option.retryHighKrw.toLocaleString('ko-KR')}원)` +
    (option.provisional ? ' · 장면 확정 전 추산' : ' · 현재 장면 계획 기준'));
  console.log(`원화는 1달러=${result.krwPerUsd}원 가정. 모델·해상도·생성 시간은 --json의 rows에 표시합니다.`);
}
module.exports = { quote, pricedRows, digest };
if (require.main === module) {
  try { main(); } catch (e) { console.error('production-cost: ' + e.message); process.exitCode = 1; }
}
