#!/usr/bin/env node
'use strict';
// Preserve an authored video soundtrack as the card's single audio source, never as a second mix.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { createHash } = require('crypto');
const { evaluateWindowScript } = require('../../_shared/scenes-vm.js');
function prepare(work, board) {
  work = path.resolve(work); board = path.resolve(board);
  const win = evaluateWindowScript(fs.readFileSync(path.join(board, 'scenes.js'), 'utf8'));
  const cards = path.join(work, 'cards.tsv');
  const rows = fs.readFileSync(cards, 'utf8').split(/\r?\n/);
  const receiptFile = path.join(work, 'source-audio.json');
  const previous = fs.existsSync(receiptFile) ? JSON.parse(fs.readFileSync(receiptFile, 'utf8')) : [];
  const segs = fs.readFileSync(path.join(work, 'segs.tsv'), 'utf8').split(/\r?\n/).filter(line => line.trim() && !line.startsWith('#')).map(line => line.split('\t'));
  const receipts = [];
  let changed = false;
  for (let i = 0; i < rows.length; i++) {
    if (!rows[i].trim() || rows[i].startsWith('#')) continue;
    const fields = rows[i].split('\t'), scene = win.SCENES[Number(fields[0])];
    const old = previous.find(item => item.card === fields[0]);
    if (scene?.sound?.audioSource !== 'video') {
      if (old && (fields[1] === old.audio || (fields[4] || '').split(',').includes('sync=1'))) {
        if (fields[1] === old.audio) fields[1] = old.originalAudio;
        fields[4] = (fields[4] || '').split(',').filter(option => option && !option.startsWith('sync=')).concat(old.originalSync || []).join(',');
        rows[i] = fields.join('\t'); changed = true;
      }
      continue;
    }
    const visuals = [...new Set(segs.filter(seg => seg[0] === fields[0]).map(seg => seg[2]))];
    if (visuals.length !== 1 || /[|@]|::/.test(visuals[0]))
      throw new Error('audioSource=video needs one continuous, unprefixed source video per card');
    const video = path.resolve(work, visuals[0]);
    const options = (fields[4] || '').split(',').filter(Boolean);
    if (Number(scene.edit?.in || 0) || Number(scene.edit?.pre || 0) || Number(scene.edit?.post || 0) ||
        options.some(option => /^(in|pre|post)=/.test(option) && Number(option.split('=')[1]) !== 0))
      throw new Error('audioSource=video currently requires in/pre/post=0; trim the source clip explicitly first');
    const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', video], { encoding: 'utf8' }));
    if (!probe.streams.some(stream => stream.codec_type === 'video') || !probe.streams.some(stream => stream.codec_type === 'audio'))
      throw new Error('audioSource=video requires both video and audio streams: ' + video);
    const seconds = Number(probe.streams.find(stream => stream.codec_type === 'video').duration ?? probe.format.duration);
    if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('Unmeasurable source video duration');
    const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    const sourceSha256 = hash(video);
    const audioDir = path.join(work, '.source-audio'); fs.mkdirSync(audioDir, { recursive: true });
    const audio = path.join(audioDir, sourceSha256 + '.wav');
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', video, '-map', '0:a:0', '-af', 'apad=whole_dur=' + seconds, '-t', String(seconds), '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', audio]);
    const originalAudio = old && fields[1] === old.audio ? old.originalAudio : fields[1];
    const originalSync = old && fields[1] === old.audio ? old.originalSync : options.filter(option => option.startsWith('sync='));
    fields[1] = audio;
    fields[4] = [...options.filter(option => !option.startsWith('sync=')), 'sync=1'].join(',');
    rows[i] = fields.join('\t');
    changed = true;
    receipts.push({ card: fields[0], shotId: scene.id, originalAudio, originalSync, video, sourceSha256, audio, audioSha256: hash(audio), seconds, review: 'not_reviewed' });
  }
  if (changed) fs.writeFileSync(cards, rows.join('\n'));
  fs.writeFileSync(receiptFile, JSON.stringify(receipts, null, 2) + '\n');
  return receipts;
}
module.exports = { prepare };
if (require.main === module) {
  try { console.log(JSON.stringify(prepare(process.argv[2], process.argv[3]))); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
