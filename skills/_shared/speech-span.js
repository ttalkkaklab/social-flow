'use strict';
// Where the voice starts and stops inside a clip's own soundtrack.
//
// A natively voiced clip (MSR) often opens and closes on silent acting: on 299 clips measured
// 2026-11-16 the line began a median 1.4 s in and half of each clip was silence around it. This
// reads the loudness of the speech band in 20 ms steps and reports the first and last sustained
// loud stretch, so the card can be trimmed to its line (edit.in / edit.out).
//
// Ceiling: loudness, not recognition. Checked against Qwen3-ASR word times on 32 clips it agreed
// within 0.1 s on most; a quiet first or last syllable can fall outside the span (up to 0.6 s
// seen) and a loud effect counts as voice. The trim it suggests keeps a margin for that and is
// a suggestion to listen to, never applied by itself.
const { spawnSync } = require('node:child_process');

const STEP = 0.02, RATE = 16000;
const WINDOW = 8, ACTIVE = 6;          // six loud steps in eight: a click or a breath is not a line
const LEAD_KEEP = 0.3, TAIL_KEEP = 0.5; // margin kept around the measured span
const WORTH = 0.3;                      // a shorter trim is not worth a new edit

/** First and last sustained loud stretch of a loudness series (dB per STEP), or null for none. */
function spanOf(levels) {
  if (levels.length < WINDOW) return null;
  const sorted = [...levels].sort((a, b) => a - b);
  const peak = sorted[Math.floor(sorted.length * 0.95)], floor = sorted[Math.floor(sorted.length * 0.10)];
  if (peak < -50) return null; // a silent track has no voice to find
  const threshold = Math.max(peak - 18, floor + 8);
  const loud = levels.map(level => level > threshold);
  const sustained = at => loud.slice(at, at + WINDOW).filter(Boolean).length >= ACTIVE;
  let first = -1, last = -1;
  for (let i = 0; i + WINDOW <= loud.length; i++) if (sustained(i)) { first = i; break; }
  for (let i = loud.length - WINDOW; i >= 0; i--) if (sustained(i)) { last = i + WINDOW; break; }
  if (first < 0) return null;
  while (!loud[first]) first++;
  while (!loud[last - 1]) last--;
  const round = n => Math.round(n * 100) / 100;
  return { startSeconds: round(first * STEP), endSeconds: round(last * STEP) };
}

/** Decode the speech band of a media file's first audio stream and measure its span. */
function inspect(file) {
  const run = spawnSync('ffmpeg', ['-v', 'error', '-nostdin', '-i', file, '-vn', '-ac', '1', '-ar', String(RATE),
    '-af', 'highpass=f=150,lowpass=f=3800', '-f', 's16le', '-'], { maxBuffer: 256 * 1024 * 1024 });
  if (run.error || run.status !== 0 || run.stdout.length < 2) {
    const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'json', file], { encoding: 'utf8' });
    try {
      const streams = JSON.parse(probe.stdout).streams;
      if (probe.status === 0 && streams?.some(s => s.codec_type === 'video') && !streams.some(s => s.codec_type === 'audio'))
        return { status: 'missing', span: null };
    } catch { /* A failed probe is unknown, not proof of missing audio. */ }
    return { status: 'unverified', span: null };
  }
  const samples = new Int16Array(run.stdout.buffer, run.stdout.byteOffset, Math.floor(run.stdout.length / 2));
  const hop = RATE * STEP, levels = [];
  for (let i = 0; i + hop <= samples.length; i += hop) {
    let energy = 0;
    for (let j = i; j < i + hop; j++) energy += samples[j] * samples[j];
    levels.push(10 * Math.log10(energy / hop + 1) - 90.3);
  }
  const span = spanOf(levels);
  const clipSeconds = Math.round(samples.length / RATE * 100) / 100;
  const peakDb = levels.length ? Math.max(...levels) : null;
  return { status: peakDb !== null && peakDb < -60 ? 'silent' : 'unverified', peakDb, clipSeconds,
    span: span && { ...span, clipSeconds,
      leadSilenceSeconds: span.startSeconds, tailSilenceSeconds: Math.round((clipSeconds - span.endSeconds) * 100) / 100 } };
}

function measure(file) { return inspect(file).span; }

/**
 * Seconds the performance itself places before its first line and after its last: timed
 * standalone actions plus the line's leadInSeconds / tailOutSeconds. null when an untimed
 * standalone action sits there — the author asked for acting of unknown length, so that end
 * of the clip is not idle.
 */
function authoredMargins(scene) {
  const lines = scene.narration || [];
  const events = Array.isArray(scene.performance) && scene.performance.length ? scene.performance
    : lines.map((_, index) => ({ kind: 'dialogue', group: index + 1 }));
  const speech = events.map((event, index) => event.kind === 'action' ? -1 : index).filter(index => index >= 0);
  if (!speech.length) return { lead: null, tail: null };
  const standalone = part => part.filter(event => event.kind === 'action' && event.withGroup === undefined)
    .reduce((sum, event) => sum === null || !(event.durationSeconds > 0) ? null : sum + event.durationSeconds, 0);
  const acting = index => lines[events[index].group - 1]?.acting || {};
  const first = speech[0], last = speech[speech.length - 1];
  const lead = standalone(events.slice(0, first)), tail = standalone(events.slice(last + 1));
  return { lead: lead === null ? null : lead + (acting(first).leadInSeconds ?? 0),
    tail: tail === null ? null : tail + (acting(last).tailOutSeconds ?? 0) };
}

/**
 * The source range that keeps the line, its authored anticipation and reaction, and a margin.
 * Whole source frames, so picture and sound start together. Returns only the ends worth cutting.
 */
function suggestTrim(span, scene, frameRate = 24) {
  const { lead, tail } = authoredMargins(scene);
  const edit = {};
  if (lead !== null) {
    const start = Math.floor(Math.max(0, span.startSeconds - Math.max(lead, LEAD_KEEP)) * frameRate) / frameRate;
    if (start >= WORTH) edit.in = Math.round(start * 1000) / 1000;
  }
  if (tail !== null) {
    const end = Math.ceil(Math.min(span.clipSeconds, span.endSeconds + Math.max(tail, TAIL_KEEP)) * frameRate) / frameRate;
    if (span.clipSeconds - end >= WORTH) edit.out = Math.round(end * 1000) / 1000;
  }
  if (edit.in === undefined && edit.out === undefined) return null;
  return { edit, durationSeconds: Math.round(((edit.out ?? span.clipSeconds) - (edit.in ?? 0)) * 1000) / 1000 };
}

module.exports = { spanOf, measure, inspect, authoredMargins, suggestTrim };
