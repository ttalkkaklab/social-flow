#!/usr/bin/env node
'use strict';
// Preserve an authored video soundtrack as the card's single audio source, never as a second mix.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { createHash } = require('crypto');
const { evaluateWindowScript } = require('../../_shared/scenes-vm.js');
const speechSpan = require('../../_shared/speech-span.js');

function checkAssemblyRoutes(win,board) {
  const {assertNoPostLipSync,assertVideoSpeechProvenance,episodeVideoReceipts} = require('../../_shared/speech-contract.js');
  const receipts = episodeVideoReceipts(win.SCENES ?? [],board);
  for (const scene of win.STRUCTURE?.scenes ?? []) assertNoPostLipSync(scene.videoDirection);
  for (const shot of win.SCENES ?? []) {
    const video = shot.visual?.video ?? {};
    assertNoPostLipSync({mode:video.mode, operation:video.operation, tool:video.tool, strategy:video.strategy, route:video.route,
      postLipSync:video.postLipSync, post_lipsync:video.post_lipsync, capabilities:video.capabilities, speechBinding:video.speechBinding,
      soundtrackRepair:video.soundtrackRepair, reuse:shot.visual?.reuse, sound:shot.sound});
    for (const file of new Set([video.clip, video.speechBinding?.videoPath, video.soundtrackRepair?.videoPath])) {
      if (typeof file === 'string') assertVideoSpeechProvenance(path.resolve(board,file),null,video.speechBinding,receipts);
    }
    for (const source of video.soundtrackRepair?.sources ?? []) {
      if (source.kind === 'native_video' && typeof source.path === 'string')
        assertVideoSpeechProvenance(path.resolve(board,source.path),null,{},receipts);
    }
  }
  return receipts;
}

function usesConditioningTrack(scene, board, audio) {
  if (scene?.sound?.audioSource === 'video' || !(scene?.narration || []).some(line => line.delivery === 'on_screen' && line.tts?.trim())) return false;
  const visual = scene.visual ?? {};
  if (!visual.video && !visual.reuse && !visual.clip && !visual.renderedFile && scene.shot?.render?.mode !== 'generated_video') return false;
  const clip = visual.video?.clip;
  const file = clip && require('./check-production.js').assetPath(board, clip);
  const driver = file && require('../../_shared/character-speech.js').conditioningAudioSha256(file);
  if (!driver || visual.video?.groupPlan || visual.reuse ||
      !fs.existsSync(audio) || createHash('sha256').update(fs.readFileSync(audio)).digest('hex') !== driver ||
      !['missing','silent'].includes(require('../../_shared/audio-signal.js').inspect(file).status)) {
    throw new Error('post_lipsync_forbidden: on-screen dialogue needs sound.audioSource video or the original WAV from its silent audio-to-video render');
  }
  return true;
}

function prepare(work, board) {
  work = path.resolve(work); board = path.resolve(board);
  const win = evaluateWindowScript(fs.readFileSync(path.join(board, 'scenes.js'), 'utf8'));
  checkAssemblyRoutes(win,board);
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
      if (usesConditioningTrack(scene, board, path.resolve(work, fields[1]))) {
        const options = (fields[4] || '').split(',').filter(option => option && !option.startsWith('sync='));
        fields[4] = [...options,'sync=1'].join(',');
        rows[i] = fields.join('\t'); changed = true;
      }
      continue;
    }
    const visuals = [...new Set(segs.filter(seg => seg[0] === fields[0]).map(seg => seg[2]))];
    if (visuals.length !== 1 || /[|@]|::/.test(visuals[0]))
      throw new Error('audioSource=video needs one continuous, unprefixed source video per card');
    const video = path.resolve(work, visuals[0]);
    const options = (fields[4] || '').split(',').filter(Boolean);
    if (Number(scene.edit?.pre || 0) || Number(scene.edit?.post || 0) ||
        options.some(option => /^(pre|post)=/.test(option) && Number(option.split('=')[1]) !== 0))
      throw new Error('audioSource=video requires pre/post=0; trim the card with edit.in and edit.out, which move picture and sound together');
    const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', video], { encoding: 'utf8' }));
    const picture = probe.streams.find(stream => stream.codec_type === 'video');
    if (!picture || !probe.streams.some(stream => stream.codec_type === 'audio'))
      throw new Error('audioSource=video requires both video and audio streams: ' + video);
    const clipSeconds = Number(picture.duration ?? probe.format.duration);
    if (!Number.isFinite(clipSeconds) || clipSeconds <= 0) throw new Error('Unmeasurable source video duration');
    // The build opens the picture at the first source frame at or after edit.in; the sound starts on that same frame.
    const [num, den] = String(picture.avg_frame_rate).split('/').map(Number), fps = num / den;
    const requested = Number(scene.edit?.in || 0);
    const sourceIn = Number.isFinite(fps) && fps > 0 ? Math.ceil(requested * fps - 1e-6) / fps : requested;
    const sourceOut = scene.edit?.out === undefined ? clipSeconds : Number(scene.edit.out);
    if (!(sourceIn >= 0) || !(sourceOut > sourceIn) || sourceOut > clipSeconds + 1 / (fps || 24))
      throw new Error(`shot ${Number(fields[0]) + 1}: edit.in ${requested} / edit.out ${scene.edit?.out ?? 'end'} fall outside the ${clipSeconds}s clip`);
    const seconds = Math.min(sourceOut, clipSeconds) - sourceIn;
    const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    const sourceSha256 = hash(video);
    const audioDir = path.join(work, '.source-audio'); fs.mkdirSync(audioDir, { recursive: true });
    const trimmed = sourceIn > 0 || seconds < clipSeconds;
    const audio = path.join(audioDir, sourceSha256 + (trimmed ? `-${sourceIn.toFixed(4)}-${seconds.toFixed(4)}` : '') + '.wav');
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', video, '-map', '0:a:0', '-af', trimmed ? `atrim=start=${sourceIn},asetpts=PTS-STARTPTS,apad` : 'apad', '-t', String(seconds), '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', audio]);
    // Silent acting around the line is reported, not cut: the trim is the author's (edit.in / edit.out).
    let speech = null;
    try { speech = speechSpan.measure(audio); } catch { /* measurement is advisory */ }
    if (speech && (speech.leadSilenceSeconds >= 1 || speech.tailSilenceSeconds >= 1.5))
      console.error(`⚠ shot ${Number(fields[0]) + 1} (${scene.id}): ${speech.leadSilenceSeconds}s before the line and ${speech.tailSilenceSeconds}s after it are silent; trim the card with edit.in / edit.out if the pause is not the story's`);
    const originalAudio = old && fields[1] === old.audio ? old.originalAudio : fields[1];
    const originalSync = old && fields[1] === old.audio ? old.originalSync : options.filter(option => option.startsWith('sync='));
    fields[1] = audio;
    fields[4] = [...options.filter(option => !option.startsWith('sync=')), 'sync=1'].join(',');
    rows[i] = fields.join('\t');
    changed = true;
    receipts.push({ card: fields[0], shotId: scene.id, originalAudio, originalSync, video, sourceSha256, audio, audioSha256: hash(audio), seconds, sourceIn, ...(speech ? { speech } : {}), review: 'not_reviewed' });
  }
  if (changed) fs.writeFileSync(cards, rows.join('\n'));
  fs.writeFileSync(receiptFile, JSON.stringify(receipts, null, 2) + '\n');
  return receipts;
}
module.exports = { prepare, usesConditioningTrack, checkAssemblyRoutes };
if (require.main === module) {
  try { console.log(JSON.stringify(prepare(process.argv[2], process.argv[3]))); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
