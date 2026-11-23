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
    '-map', '0:a:0', '-af', `silencedetect=n=${SILENCE_DB}dB:d=0.01,astats=measure_perchannel=none:measure_overall=Peak_level`, '-f', 'null', '-'],
  { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (result.error || result.status !== 0 || !/^out_time_us=[1-9]\d*$/m.test(result.stdout))
    throw new Error('cannot decode audio signal');
  const spans = [];
  let start = 0;
  for (const [, event, time] of result.stderr.matchAll(/silence_(start|end):\s*(-?[\d.]+(?:e[+-]?\d+)?)/gi)) {
    if (event === 'start') start = Number(time);
    else spans.push([start, Number(time)]);
  }
  // A complete clip may be shorter than the ten-millisecond window used for spans.
  const peak = /Peak level dB: (-inf|[+-]?[\d.]+)\s*$/m.exec(result.stderr)?.[1];
  if (peak === undefined) throw new Error('cannot measure decoded audio peak');
  const silent = peak === '-inf' || Number(peak) <= SILENCE_DB;
  return { status: silent ? 'silent' : 'signal', spans, duration };
}

function covers(spans, start, seconds, tolerance = 0) {
  return spans.some(([from, to]) => from <= start + tolerance && to >= start + seconds - tolerance);
}

// Decode to a fixed PCM format so a renamed or remuxed file retains its performance identity.
function decodedAudioHash(file) {
  return execFileSync('ffmpeg', ['-nostdin','-v','error','-xerror','-i',file,'-map','0:a:0',
    '-ac','2','-ar','16000','-c:a','pcm_s16le','-f','hash','-hash','sha256','-'], {encoding:'utf8',timeout:30000}).trim();
}

function pcmToWav(pcmData, sampleRate, numChannels) {
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmData.length;

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmData]);
}

module.exports = { inspect, covers, SILENCE_DB, decodedAudioHash, pcmToWav };
