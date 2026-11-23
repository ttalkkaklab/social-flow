'use strict';

const fs = require('node:fs');
const {createHash} = require('node:crypto');
const sha = value => createHash('sha256').update(value).digest('hex');
const shaPattern = /^[a-f0-9]{64}$/;
function mismatch(message) { throw new Error('speech_video_source_mismatch: ' + message); }

function readSceneRequest(file,receipt) {
  if (receipt.version !== 1 || receipt.status !== 'completed' || !receipt.jobId || !shaPattern.test(receipt.fingerprint) ||
      receipt.requestId !== 'scene-' + receipt.fingerprint) mismatch('invalid completed scene receipt');
  let wire;
  try { wire = JSON.parse(fs.readFileSync(file + '.scene-request.json','utf8')); }
  catch { mismatch('restore the archived scene request for this clip'); }
  const body = wire?.body, bytes = JSON.stringify(body);
  if (!bytes || wire.bodySha256 !== sha(bytes) || wire.bytes !== Buffer.byteLength(bytes) ||
      receipt.sceneRequestSha256 && receipt.sceneRequestSha256 !== sha(JSON.stringify(wire)) ||
      !Array.isArray(wire.attachments) || !Array.isArray(body.shots) || !body.shots.length ||
      !Number.isFinite(body.fps) || body.fps <= 0 || !Number.isInteger(body.num_frames) || body.num_frames <= 0 ||
      receipt.expected?.frames && receipt.expected.frames !== body.num_frames ||
      receipt.expected?.fps && receipt.expected.fps !== body.fps) mismatch('the archived scene request does not match the completed render');
  let frame = 0;
  const ids = new Set();
  for (const shot of body.shots) {
    if (!shot.shot_id || ids.has(shot.shot_id) || shot.start_frame !== frame || !Number.isInteger(shot.end_frame) || shot.end_frame <= frame)
      mismatch('invalid shot intervals in the archived scene');
    ids.add(shot.shot_id);
    frame = shot.end_frame;
  }
  if (frame !== body.num_frames) mismatch('the archived shots do not cover the video');
  return wire;
}

function audioAttachment(wire,role,uri,shot) {
  const rows = wire.attachments.filter(row => row.role === role && row.shotId === shot?.shot_id);
  const inline = typeof uri === 'string' && /^data:audio\/[^,]+;base64,/.test(uri);
  if (inline && !rows.length) return sha(Buffer.from(uri.slice(uri.indexOf(',') + 1),'base64'));
  if (rows.length !== 1 || rows[0].frame !== (shot?.start_frame ?? 0) || !shaPattern.test(rows[0].sha256) ||
      !Number.isInteger(rows[0].bytes) || rows[0].bytes <= 0 || typeof uri !== 'string' || !uri.startsWith('genai-file://'))
    mismatch('missing archived ' + role + ' upload');
  const id = uri.slice('genai-file://'.length);
  if (!id || shaPattern.test(id) && id !== rows[0].sha256) mismatch('scene audio URI and attachment disagree');
  return rows[0].sha256;
}

function sceneDriver(wire) {
  const {scene_audio:track,num_frames:frames} = wire.body;
  if (!track || track.mode === 'mix') return;
  if (!['conditioning',undefined].includes(track.mode) || track.start_frame !== 0 || track.end_frame !== frames)
    mismatch('invalid full-scene conditioning interval');
  return audioAttachment(wire,'scene_audio',track.audio_uri);
}

// A timed take retains its receipted source. Stage a lossless PCM conversion with the native shot tail.
function performanceWav(source, shotFrames, fps) {
  const sampleRate = 48000, channels = 2, block = 4;
  const nativeFrames = Math.max(25, 1 + 8 * Math.ceil((shotFrames - 1) / 8));
  const samples = Math.ceil(nativeFrames * sampleRate / fps);
  const pcm = require('node:child_process').execFileSync('ffmpeg', ['-nostdin','-v','error','-xerror','-i',source,'-map','0:a:0',
    '-ac',String(channels),'-ar',String(sampleRate),'-f','s16le','pipe:1'], {maxBuffer:32 * 1024 * 1024,timeout:30000});
  const visibleBytes = Math.ceil(shotFrames * sampleRate / fps) * block;
  // A prepared WAV may already contain the renderer's padding. Never trim the spoken take.
  if (pcm.length > visibleBytes && pcm.subarray(visibleBytes).some(byte => byte !== 0))
    throw new Error('scene_speech_performance: the recorded dialogue extends past the shot');
  const padded = Buffer.alloc(samples * block);
  pcm.copy(padded, 0, 0, Math.min(pcm.length, padded.length));
  return require('./audio-signal.js').pcmToWav(padded,sampleRate,channels);
}

function verifySceneSpeech(wire,plan) {
  const body = wire.body, driver = sceneDriver(wire);
  if (body.generate_audio === false && plan.mode === 'native' || plan.model && body.model !== plan.model)
    mismatch('scene model or native audio differs from the selected route');
  if (plan.mode === 'audio_conditioned' && !driver || plan.mode === 'native' && driver)
    mismatch('scene request used a different speech operation');
  const card = plan.sourceShot;
  if (card) {
    const lines = (card.narration ?? []).filter(line => line.tts?.trim() && line.delivery !== 'voiceover');
    const original = body.shots.find(shot => shot.shot_id === card.id) ?? (body.shots.length === 1 && body.shots[0]);
    if (!original) mismatch('the requested shot is absent from the recorded scene');
    const dialogue = original.dialogue ?? [];
    if (original.performance_uri) {
      const file = lines.length === 1 && lines[0].audio?.path;
      if (!file || !plan.boardDir) mismatch('restore the recorded dialogue performance for this shot');
      const bytes = performanceWav(require('node:path').resolve(plan.boardDir,file),original.end_frame-original.start_frame,body.fps);
      if (sha(bytes) !== audioAttachment(wire,'performance_audio',original.performance_uri,original))
        mismatch('the current recording differs from the performance supplied to this shot');
    }
    if (plan.assembly && body.shots.length > 1) {
      const start = card.edit?.in ?? 0, end = card.edit?.out ?? body.num_frames/body.fps;
      if (start < original.start_frame/body.fps - 1e-6 || end > original.end_frame/body.fps + 1e-6 || end <= start)
        mismatch('the selected source interval extends outside the recorded shot');
    }
    if (plan.mode === 'native' || dialogue.length) {
      const spoken = row => [row.speaker,row.text.trim(),row.delivery];
      const assigned = lines.map(line => spoken({speaker:line.speaker,text:line.tts,delivery:line.delivery}));
      if (JSON.stringify(dialogue.map(spoken)) !== JSON.stringify(assigned))
        mismatch('recorded speakers, words or delivery do not match this shot');
    }
  }
  return driver;
}

module.exports = {readSceneRequest,sceneDriver,verifySceneSpeech,performanceWav};
