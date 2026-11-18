#!/usr/bin/env node
'use strict';

// Resolve music against rendered frame boundaries, then lay each file once across cuts.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
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
      if (!['id', 'cue', 'start', 'end', 'sourceStartSeconds', 'fadeInSeconds', 'fadeOutSeconds', 'gain'].includes(key)) findings.push(`${at}: unknown field ${key}`);
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
    for (const field of ['sourceStartSeconds', 'fadeInSeconds', 'fadeOutSeconds']) {
      if (span[field] !== undefined && !seconds(span[field])) findings.push(`${at}.${field} must use nonnegative whole milliseconds`);
    }
    for (const message of musicEnvelopeFindings(span.gain)) findings.push(`${at}: ${message}`);
  }
  if (shots.some(shot => shot?.sound?.cue !== undefined || shot?.sound?.musicGain !== undefined))
    findings.push('MUSIC.$timeline cannot combine with sound.cue or sound.musicGain; use timeline spans and gain');
  return findings;
}

// Which scenes carry a music decision (STRUCTURE.scenes[].music, written by story_music) and
// whether the timeline agrees. Silence nobody decided reads `undecided`, never `none`.
// A report, so a hand-broken board yields fewer rows, never an exception.
function spottingReport(board) {
  const structure = record(board?.STRUCTURE) ? board.STRUCTURE : {}, shots = Array.isArray(board?.SCENES) ? board.SCENES : [];
  const sequences = (Array.isArray(structure.sequences) ? structure.sequences : []).filter(record);
  const planned = (Array.isArray(structure.scenes) ? structure.scenes : []).filter(record);
  const spans = Array.isArray(board?.MUSIC?.$timeline) ? board.MUSIC.$timeline : [];
  const at = id => shots.findIndex(shot => shot?.id === id);
  const ranges = spans.flatMap(span => {
    let first = at(span?.start?.shotId), last = at(span?.end?.shotId);
    if (first < 0 || last < 0) return [];
    if (span.start.atSeconds === 'end') first++;
    if (span.end.atSeconds === 0) last--;
    return [{ cue: span.cue, first, last }];
  });
  const scenes = [];
  for (const sequence of sequences) for (const no of Array.isArray(sequence.scenes) ? sequence.scenes : []) {
    const scene = planned.find(item => item.no === no) || {};
    const cards = shots.flatMap((shot, index) => shot?.scene === no ? [index] : []);
    const cues = [...new Set(ranges.filter(range => cards.some(index => index >= range.first && index <= range.last)).map(range => range.cue))];
    const decision = ['score', 'none'].includes(scene.music?.decision) ? scene.music.decision : 'undecided';
    const mismatch = decision === 'none' && cues.length ? 'decided none, but a span plays here'
      : decision === 'score' && !cues.length ? 'decided score, but no span plays here' : undefined;
    scenes.push({ scene: no, sequence: sequence.id, ...(sequence.payoff === no ? { payoff: true } : {}), ...(scene.turn ? { turn: true } : {}),
      decision, ...(scene.music?.reason ? { reason: scene.music.reason } : {}), cues, ...(mismatch ? { mismatch } : {}) });
  }
  return { scenes, undecided: scenes.filter(scene => scene.decision === 'undecided').map(scene => scene.scene),
    mismatch: scenes.filter(scene => scene.mismatch).map(scene => scene.scene) };
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

// Integrated loudness of one stretch of a file: -Infinity when nothing reaches the meter, NaN when it could not be read.
function loudness(file, start, duration) {
  const { stderr } = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-ss', String(start), '-t', String(duration), '-i', file,
    '-af', 'loudnorm=print_format=json', '-f', 'null', '-'], { encoding: 'utf8' });
  const value = /"input_i"\s*:\s*"([^"]+)"/.exec(stderr || '')?.[1];
  return value === undefined ? NaN : value === '-inf' ? -Infinity : Number(value);
}

// mix.speechLufs is the measured speech the bed sits under; mix.maximumSeparationLu is the review
// line past which a span is reported as too quiet (our practice, bgm-scoring.md §2).
function renderTimeline(plan, rows, fps, length, target, output, mix = {}) {
  const spans = resolveTimeline(plan, rows, fps, length);
  if (!Number.isFinite(target)) throw new Error('Invalid music loudness target');
  // Resolve every anchor before invoking FFmpeg or touching a previously rendered bed.
  const warnings = [];
  for (const span of spans) {
    if (!fs.statSync(span.file).isFile()) throw new Error(`Missing music cue: ${span.cue}`);
    const total = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', span.file], { encoding: 'utf8' }).trim());
    if (!Number.isFinite(total)) continue;   // an unreadable length is the bed renderer's to report
    const available = total - (span.sourceStartSeconds ?? 0);
    // Less than half a second of cue cannot be laid or looped: say so here, not as a bed-renderer failure.
    if (span.sourceStartSeconds && available < 0.5) throw new Error(`${span.id}: sourceStartSeconds leaves ${Math.max(0, available).toFixed(2)}s of cue ${span.cue} (${total.toFixed(3)}s long) — start it earlier`);
    if (available < span.durationSeconds - 0.001)
      warnings.push(`${span.id}: cue ${span.cue} has ${available.toFixed(1)}s from its start point for a ${span.durationSeconds.toFixed(1)}s span, so it loops — prepare a longer cue or shorten the span`);
  }
  const directory = fs.mkdtempSync(path.join(path.dirname(output), '.music-timeline-'));
  const ffmpeg = args => execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-y', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    const inputs = ['-f', 'lavfi', '-t', String(length), '-i', 'anullsrc=r=48000:cl=stereo'];
    const filters = [], labels = ['[0:a]'];
    for (const [index, span] of spans.entries()) {
      const cueList = path.join(directory, `cue-${index}.tsv`), bed = path.join(directory, `cue-${index}.wav`);
      let source = span.file;
      if (span.sourceStartSeconds) {
        // The span plays the cue from this point; the bed renderer then measures what is played.
        source = path.join(directory, `source-${index}.wav`);
        ffmpeg(['-ss', String(span.sourceStartSeconds), '-i', span.file, '-c:a', 'pcm_f32le', source]);
      }
      fs.writeFileSync(cueList, `0\t${source}\n`);
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
    // What each span measures before ducking. Ducking only lowers it, so a span past the line is quiet everywhere.
    const speech = Number(mix.speechLufs), limit = Number.isFinite(Number(mix.maximumSeparationLu)) ? Number(mix.maximumSeparationLu) : 20;
    for (const span of spans) {
      if (span.durationSeconds < 0.5) continue;   // shorter than the meter's 400 ms block: nothing to claim
      const measured = loudness(temporary, span.startSeconds, span.durationSeconds);
      if (Number.isNaN(measured)) continue;       // unreadable is not the same as quiet
      span.measuredLufs = measured === -Infinity ? null : measured;
      if (measured === -Infinity) { warnings.push(`${span.id}: nothing in this span reaches the loudness meter — the music is absent here`); continue; }
      if (!Number.isFinite(speech)) continue;
      span.separationLu = Number((speech - measured).toFixed(1));
      if (span.separationLu > limit)
        warnings.push(`${span.id}: cue ${span.cue} sits ${span.separationLu} LU under the speech before ducking (review line ${limit} LU) — raise its gain, shorten its fades or start it later in the cue`);
    }
    fs.renameSync(temporary, output);
    return { version: 1, fps, durationSeconds: length, spans, warnings, review: 'not_reviewed' };
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

module.exports = { timelineFindings, spottingReport, compileTimeline, resolveTimeline, renderTimeline };
if (require.main === module) {
  try {
    const [planFile, clockFile, fps, length, target, output, speechLufs, maximumSeparationLu] = process.argv.slice(2);
    const planBytes = fs.readFileSync(planFile), clockBytes = fs.readFileSync(clockFile);
    const plan = JSON.parse(planBytes.toString('utf8'));
    const rows = clockBytes.toString('utf8').trim().split('\n').filter(Boolean).map(line => line.split('\t'));
    const result = renderTimeline(plan, rows, Number(fps), Number(length), Number(target), path.resolve(output),
      { speechLufs: speechLufs === undefined ? NaN : Number(speechLufs), maximumSeparationLu: maximumSeparationLu === undefined ? undefined : Number(maximumSeparationLu) });
    const hash = bytes => createHash('sha256').update(bytes).digest('hex');
    result.planSha256 = hash(planBytes);
    result.renderedClockSha256 = hash(clockBytes);
    result.bedSha256 = hash(fs.readFileSync(output));
    fs.writeFileSync(path.join(path.dirname(output), 'music-timeline-resolved.json'), JSON.stringify(result, null, 2) + '\n');
    console.log(`Music timeline: ${result.spans.length} span(s) resolved against rendered shots; gaps retain no music`);
    for (const warning of result.warnings) console.log(`⚠ music ${warning}`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
