'use strict';

const { execFileSync, spawnSync } = require('node:child_process');

const SILENCE_DB = -60;

// Inspect both stereo channels as encoded. A downmix could cancel a real effect.
function inspect(file) {
  const streams = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'a:0',
    '-show_entries', 'stream=duration:format=duration', '-of', 'json', file], { encoding: 'utf8' }));
  if (!streams.streams?.length) return { status: 'missing', spans: [] };
  const duration = Number(streams.streams[0].duration) || Number(streams.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('cannot measure audio duration');
  const result = spawnSync('ffmpeg', ['-hide_banner', '-nostdin', '-nostats', '-xerror',
    '-progress', 'pipe:1', '-i', file,
    '-map', '0:a:0', '-af', `silencedetect=n=${SILENCE_DB}dB:d=0.01`, '-f', 'null', '-'],
  { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (result.error || result.status !== 0 || !/^out_time_us=[1-9]\d*$/m.test(result.stdout))
    throw new Error('cannot decode audio signal');
  const spans = [];
  let start = 0;
  for (const [, event, time] of result.stderr.matchAll(/silence_(start|end):\s*(-?[\d.]+(?:e[+-]?\d+)?)/gi)) {
    if (event === 'start') start = Number(time);
    else spans.push([start, Number(time)]);
  }
  // One millisecond covers timestamp rounding on the last decoded sample.
  return { status: covers(spans, 0, duration, 0.001) ? 'silent' : 'signal', spans };
}

function covers(spans, start, seconds, tolerance = 0) {
  return spans.some(([from, to]) => from <= start + tolerance && to >= start + seconds - tolerance);
}

module.exports = { inspect, covers, SILENCE_DB };
