#!/usr/bin/env node
'use strict';
// Read local bytes and emit import metadata. This never generates media or review evidence.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { spawnSync } = require('child_process');
function inspectReuse(file, sourceEpisode, start) {
  if (!sourceEpisode || !sourceEpisode.trim()) throw new Error('Supply the known source episode or an honest provenance description');
  if (!Number.isFinite(start) || start < 0) throw new Error('Supply the known original start in seconds; do not guess');
  const clip = path.resolve(file);
  const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries',
    'stream=width,height:format=duration', '-of', 'json', clip], { encoding: 'utf8' });
  if (probe.status !== 0) throw new Error('ffprobe could not read the existing clip');
  const media = JSON.parse(probe.stdout), stream = media.streams?.[0], duration = Number(media.format?.duration);
  if (!stream || !(duration > 0) || !Number.isFinite(duration)) throw new Error('A video stream and finite positive duration are required');
  return { duration, sourceDimensions: { width: stream.width, height: stream.height }, reuse: {
    clip, sha256: crypto.createHash('sha256').update(fs.readFileSync(clip)).digest('hex'),
    sourceEpisode, sourceRange: { start, end: start + duration }
  } };
}
module.exports = { inspectReuse };
if (require.main === module) {
  try {
    const [file, episode, start] = process.argv.slice(2);
    if (!file || start === undefined) throw new Error('usage: inspect-reuse.js <trimmed local clip> <source episode/provenance> <original start seconds>');
    console.log(JSON.stringify(inspectReuse(file, episode, Number(start)), null, 2));
  } catch (e) { console.error('inspect-reuse: ' + e.message); process.exitCode = 1; }
}
