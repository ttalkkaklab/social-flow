#!/usr/bin/env node
'use strict';
/* Measured visible motion — the number behind "it reads as a still".
 *
 * ffmpeg samples the picture four times a second on a 270x480 proxy and reports the mean
 * absolute luma difference between each sample and the one 0.25s before it (0–255 scale).
 * Codec noise and a light flicker stay under 1.5; a miniature figure gesturing on a wide
 * stage reads 2–3; a camera move over a set reads 5–20. Calibrated 2026-09-09 on ep402
 * (frozen Seedance clips 0.85–1.16, every sample under 1.5), ep411 (the quietest accepted
 * clips 2.15–2.8) and the pundago slides (85–97% of samples under 1.5).
 *
 * A Ken Burns still moves a few pixels per second, which this proxy cannot see — the still
 * lane is not gated here (build-reel.sh already refuses a still card without a camera move).
 */
const { spawnSync } = require('node:child_process');
const SAMPLE_FPS = 4;
const STILL_DIFF = 1.5;   // a sample this close to the previous one repeats it
const MOVE_DIFF = 2.0;    // the first sample past this is where visible motion starts
const STILL_CEILING_SECONDS = 8;   // the longest any authored plate may stand still, whatever the channel says
const LIMITS = {
  video: { longestStillSeconds: 2, frozenShare: .5, mean: 1.8 },   // a generated or imported clip
  card: { frozenShare: .6 }                                          // an authored slide card on the assembled reel
};
const round = n => Math.round(n * 100) / 100;

function samples(file, { start = 0, seconds = null } = {}) {
  const args = ['-v', 'error', '-nostdin'];
  if (start) args.push('-ss', String(start));
  if (seconds !== null) args.push('-t', String(seconds));
  args.push('-i', file, '-vf', `scale=270:480,fps=${SAMPLE_FPS},tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-`,
    '-f', 'null', '-');
  const run = spawnSync('ffmpeg', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (run.status !== 0) throw new Error('ffmpeg could not measure ' + file + ': ' + (run.stderr || '').trim());
  const out = [];
  let time = null;
  for (const line of run.stdout.split('\n')) {
    const t = /pts_time:([\d.]+)/.exec(line);
    if (t) { time = Number(t[1]); continue; }
    const y = /YAVG=([\d.]+)/.exec(line);
    if (y && time !== null) out.push({ time, diff: Number(y[1]) });
  }
  return out;
}

function summarize(frames) {
  if (!frames.length) return { samples: 0, seconds: 0, mean: 0, frozenShare: 1, longestStillSeconds: 0, onsetSeconds: null };
  const step = 1 / SAMPLE_FPS;
  let sum = 0, frozen = 0, run = 0, longest = 0, onset = null;
  for (const f of frames) {
    sum += f.diff;
    if (f.diff < STILL_DIFF) { frozen += 1; run += 1; longest = Math.max(longest, run); } else run = 0;
    if (onset === null && f.diff >= MOVE_DIFF) onset = f.time;
  }
  return { samples: frames.length, seconds: round(frames.length * step), mean: round(sum / frames.length),
    frozenShare: round(frozen / frames.length), longestStillSeconds: round(longest * step),
    onsetSeconds: onset === null ? null : round(onset) };
}

function measure(file, window) { return summarize(samples(file, window)); }

/* kind: 'video' for a generated/imported clip, 'card' for an authored slide card on the reel. */
function findings(s, kind = 'video', { stillLimit = null } = {}) {
  const out = [];
  const limit = kind === 'video' ? LIMITS.video.longestStillSeconds : stillLimit;
  if (limit !== null && s.longestStillSeconds > limit + .01)
    out.push(`the picture stands still for ${s.longestStillSeconds}s (limit ${limit}s)`);
  const share = kind === 'video' ? LIMITS.video.frozenShare : LIMITS.card.frozenShare;
  if (s.frozenShare > share)
    out.push(`${Math.round(s.frozenShare * 100)}% of the samples repeat the previous picture; it reads as a still`);
  if (kind === 'video' && s.mean < LIMITS.video.mean)
    out.push(`mean visible change ${s.mean} is under ${LIMITS.video.mean}; too little motion for a generated clip`);
  return out;
}

/* The channel may lower the plate ceiling, never lift it: 'off' and a missing value mean the ceiling. */
function plateStillLimit(policy) {
  const raw = policy?.max_static_ground_seconds ?? policy?.maxStaticGroundSeconds;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.min(n, STILL_CEILING_SECONDS) : STILL_CEILING_SECONDS;
}

module.exports = { samples, summarize, measure, findings, plateStillLimit, LIMITS, STILL_DIFF, MOVE_DIFF, SAMPLE_FPS, STILL_CEILING_SECONDS };

if (require.main === module) {
  try {
    const args = process.argv.slice(2), file = args[0];
    if (!file) throw new Error('usage: measure-motion.js <video> [--start S] [--seconds N] [--kind video|card]');
    const opt = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
    const s = measure(file, { start: Number(opt('--start') || 0), seconds: opt('--seconds') === undefined ? null : Number(opt('--seconds')) });
    const kind = opt('--kind') || 'video';
    const problems = findings(s, kind, { stillLimit: kind === 'card' ? STILL_CEILING_SECONDS : null });
    console.log(JSON.stringify({ ...s, kind, findings: problems }, null, 2));
    process.exitCode = problems.length ? 1 : 0;
  } catch (e) { console.error('measure-motion: ' + e.message); process.exitCode = 1; }
}
