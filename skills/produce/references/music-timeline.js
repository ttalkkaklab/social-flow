#!/usr/bin/env node
'use strict';

// Resolve music against rendered frame boundaries, then lay each file once across cuts.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { musicEnvelopeFindings, musicEnvelopeFilter } = require('./sound-mix-contract.js');
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const seconds = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && Number(value.toFixed(3)) === value;
const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);

function timelineFindings(music, shots) {
  if (!own(music, '$timeline')) return [];
  if (!Array.isArray(music.$timeline)) return ['MUSIC.$timeline must be an array; [] means no music'];
  const findings = [], ids = new Set();
  for (const [index, span] of music.$timeline.entries()) {
    const at = `MUSIC.$timeline[${index}]`;
    if (!record(span)) { findings.push(`${at} must be an object`); continue; }
    for (const key of Object.keys(span)) {
      if (!['id', 'cue', 'start', 'end', 'fadeInSeconds', 'fadeOutSeconds', 'gain'].includes(key)) findings.push(`${at}: unknown field ${key}`);
    }
    if (typeof span.id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(span.id) || ids.has(span.id)) findings.push(`${at}: unique id required`);
    ids.add(span.id);
    if (typeof span.cue !== 'string' || span.cue.startsWith('$') || !own(music, span.cue) || !record(music[span.cue])) findings.push(`${at}: unknown cue`);
    for (const edge of ['start', 'end']) {
      const anchor = span[edge];
      if (!record(anchor) || Object.keys(anchor).some(key => !['shotId', 'atSeconds'].includes(key)) ||
          typeof anchor.shotId !== 'string' || !(anchor.atSeconds === 'end' || seconds(anchor.atSeconds))) {
        findings.push(`${at}.${edge} must be { shotId, atSeconds: seconds or "end" }`);
        continue;
      }
      const matches = shots.filter(shot => shot?.id === anchor.shotId);
      if (matches.length !== 1 || ['broll', 'outro'].includes(matches[0]?.type)) findings.push(`${at}.${edge}: anchor needs one rendered card with that shotId`);
    }
    for (const field of ['fadeInSeconds', 'fadeOutSeconds']) {
      if (span[field] !== undefined && !seconds(span[field])) findings.push(`${at}.${field} must use nonnegative whole milliseconds`);
    }
    for (const message of musicEnvelopeFindings(span.gain)) findings.push(`${at}: ${message}`);
  }
  if (shots.some(shot => shot?.sound?.cue !== undefined || shot?.sound?.musicGain !== undefined))
    findings.push('MUSIC.$timeline cannot combine with sound.cue or sound.musicGain; use timeline spans and gain');
  return findings;
}

function compileTimeline(music, shots, cueFile) {
  const findings = timelineFindings(music, shots);
  if (findings.length) throw new Error(findings.join('; '));
  const files = new Map();
  return { version: 1, shots: shots.map((shot, card) => ({ id: shot.id, card })),
    spans: music.$timeline.map(span => {
      if (!files.has(span.cue)) files.set(span.cue, cueFile(span.cue));
      return { ...span, file: files.get(span.cue) };
    }) };
}

function resolveTimeline(plan, rows, fps, length) {
  if (plan.version !== 1 || !Array.isArray(plan.spans) || !Array.isArray(plan.shots) || !Number.isFinite(fps) || fps <= 0 || !Number.isFinite(length) || length <= 0)
    throw new Error('Invalid music timeline or rendered clock');
  const byCard = new Map();
  let nextFrame = 0;
  for (const row of rows) {
    const [card, start, frames] = row.slice(0, 3).map(Number);
    if (![card, start, frames].every(Number.isInteger) || card < 0 || frames <= 0 || start !== nextFrame || byCard.has(card))
      throw new Error('Invalid or discontinuous rendered music clock');
    byCard.set(card, { start: start / fps, duration: frames / fps });
    nextFrame += frames;
  }
  if (Math.abs(nextFrame / fps - length) > 0.002) throw new Error('Music clock differs from assembled audio duration');
  function anchorTime(anchor) {
    const shot = plan.shots.find(item => item.id === anchor.shotId);
    const clock = shot && byCard.get(shot.card);
    if (!clock) throw new Error(`Music anchor ${anchor.shotId} is missing from the rendered edit`);
    const offset = anchor.atSeconds === 'end' ? clock.duration : anchor.atSeconds;
    if (!seconds(offset) && anchor.atSeconds !== 'end') throw new Error('Invalid music anchor offset');
    if (offset > clock.duration + 1e-9) throw new Error(`Music anchor ${anchor.shotId} exceeds its actual rendered duration`);
    return Math.round((clock.start + offset) * 48000) / 48000;
  }
  return plan.spans.map(span => {
    const start = anchorTime(span.start), end = anchorTime(span.end), duration = end - start;
    const fadeIn = span.fadeInSeconds ?? 0, fadeOut = span.fadeOutSeconds ?? 0;
    if (duration <= 0 || fadeIn + fadeOut > duration + 1e-9) throw new Error(`Invalid span or overlapping fades: ${span.id}`);
    const errors = musicEnvelopeFindings(span.gain, duration);
    if (errors.length) throw new Error(`${span.id}: ${errors.join('; ')}`);
    return { ...span, startSeconds: start, endSeconds: end, durationSeconds: duration, fadeInSeconds: fadeIn, fadeOutSeconds: fadeOut };
  });
}

function renderTimeline(plan, rows, fps, length, target, output) {
  const spans = resolveTimeline(plan, rows, fps, length);
  if (!Number.isFinite(target)) throw new Error('Invalid music loudness target');
  // Resolve every anchor before invoking FFmpeg or touching a previously rendered bed.
  for (const span of spans) if (!fs.statSync(span.file).isFile()) throw new Error(`Missing music cue: ${span.cue}`);
  const directory = fs.mkdtempSync(path.join(path.dirname(output), '.music-timeline-'));
  const ffmpeg = args => execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-y', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    const inputs = ['-f', 'lavfi', '-t', String(length), '-i', 'anullsrc=r=48000:cl=stereo'];
    const filters = [], labels = ['[0:a]'];
    for (const [index, span] of spans.entries()) {
      const cueList = path.join(directory, `cue-${index}.tsv`), bed = path.join(directory, `cue-${index}.wav`);
      fs.writeFileSync(cueList, `0\t${span.file}\n`);
      execFileSync('bash', [path.join(__dirname, 'bgm-bed.sh'), bed, String(span.durationSeconds), String(target), cueList], { stdio: ['ignore', 'pipe', 'pipe'] });
      inputs.push('-i', bed);
      const gain = span.gain ? musicEnvelopeFilter([[0, span.durationSeconds, span.gain]]) : '';
      const fades = `${span.fadeInSeconds ? `afade=t=in:st=0:d=${span.fadeInSeconds},` : ''}${span.fadeOutSeconds ? `afade=t=out:st=${span.durationSeconds - span.fadeOutSeconds}:d=${span.fadeOutSeconds},` : ''}`;
      filters.push(`[${index + 1}:a]${gain}${fades}adelay=${Math.round(span.startSeconds * 48000)}S:all=1[m${index}]`);
      labels.push(`[m${index}]`);
    }
    filters.push(`${labels.join('')}amix=inputs=${labels.length}:normalize=0:duration=first,atrim=end_sample=${Math.round(length * 48000)}[out]`);
    const temporary = path.join(directory, 'bed.wav');
    ffmpeg([...inputs, '-filter_complex', filters.join(';'), '-map', '[out]', '-ac', '2', '-ar', '48000', '-c:a', 'pcm_f32le', temporary]);
    fs.renameSync(temporary, output);
    return { version: 1, fps, durationSeconds: length, spans, review: 'not_reviewed' };
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

module.exports = { timelineFindings, compileTimeline, resolveTimeline, renderTimeline };
if (require.main === module) {
  try {
    const [planFile, clockFile, fps, length, target, output] = process.argv.slice(2);
    const planBytes = fs.readFileSync(planFile), clockBytes = fs.readFileSync(clockFile);
    const plan = JSON.parse(planBytes.toString('utf8'));
    const rows = clockBytes.toString('utf8').trim().split('\n').filter(Boolean).map(line => line.split('\t'));
    const result = renderTimeline(plan, rows, Number(fps), Number(length), Number(target), path.resolve(output));
    const hash = bytes => createHash('sha256').update(bytes).digest('hex');
    result.planSha256 = hash(planBytes);
    result.renderedClockSha256 = hash(clockBytes);
    result.bedSha256 = hash(fs.readFileSync(output));
    fs.writeFileSync(path.join(path.dirname(output), 'music-timeline-resolved.json'), JSON.stringify(result, null, 2) + '\n');
    console.log(`Music timeline: ${result.spans.length} span(s) resolved against rendered shots; gaps retain no music`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
