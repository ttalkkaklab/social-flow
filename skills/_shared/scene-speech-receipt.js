'use strict';

const fs = require('node:fs');
const {createHash} = require('node:crypto');
const sha = value => createHash('sha256').update(value).digest('hex');
const shaPattern = /^[a-f0-9]{64}$/;
function mismatch(message) { throw new Error('speech_video_source_mismatch: ' + message); }
// The operation the gateway's retired per-shot scene route wrote on its receipts (before 2026-11-25). Clips it made are
// still verified and assembled from their archived requests; nothing plans or submits that route any more.
const PER_SHOT_SCENE_OPERATION = 'scene-to-video';
const perShotSceneOperation = operation => operation === PER_SHOT_SCENE_OPERATION;

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

// Old staged records have no owner field. The renderer stages each role in
// the order of the corresponding rows in the submitted shot, including repeats.
function shotAssetDigests(wire,shot,role,assets) {
  const records = wire.attachments.filter(row => row.shotId === shot.shot_id && row.role === role);
  const result = [];
  let index = 0;
  for (const {uri,frame} of assets) {
    if (typeof uri !== 'string') mismatch('missing ' + role + ' URI');
    if (uri.startsWith('data:')) {
      if (!/^data:(?:image|audio)\/[^,]+;base64,/.test(uri)) mismatch('invalid inline ' + role);
      result.push(sha(Buffer.from(uri.slice(uri.indexOf(',')+1),'base64')));
    } else {
      const row = records[index++], id = uri.slice('genai-file://'.length);
      if (!uri.startsWith('genai-file://') || !id || !row || row.frame !== frame ||
          !shaPattern.test(row.sha256) || !Number.isInteger(row.bytes) || row.bytes<=0 ||
          shaPattern.test(id) && id !== row.sha256) mismatch('unbound ' + role + ' upload');
      result.push(row.sha256);
    }
  }
  if (index !== records.length) mismatch('extra ' + role + ' upload in the saved shot');
  return result;
}

function verifyNativeReferences(wire,shot,plan) {
  const {board,boardDir,sourceShot:card} = plan;
  if (!board || !boardDir) mismatch('the current storyboard is required to verify native references');
  const owner = board.STRUCTURE?.scenes?.find(scene => scene.no === card.scene);
  const cards = board.SCENES.filter(item => item.scene === card.scene);
  const members = owner ? require('./scene-cast.js').projectSceneCast(owner,cards,board,boardDir,'astra-genai',false,true).members : [card];
  const member = members.find(item => item.id === card.id) ?? card;
  const dialogue = shot.dialogue ?? [];
  const pinned = dialogue.filter(line => line.voice_uri);
  const hashes = shotAssetDigests(wire,shot,'voice_reference',pinned.map(line=>({uri:line.voice_uri,frame:line.frame ?? shot.start_frame})));
  const {currentSceneVoice} = require('./scene-voice.js');
  let sample = 0;
  for (const line of dialogue) {
    // Managed gateway native dialogue uses the speaker's registered reference.
    const expected = currentSceneVoice(board,boardDir,member,line.speaker);
    if (!line.voice_uri || !expected || hashes[sample++] !== expected.sha256)
      mismatch('the recorded voice reference differs from the current sample for ' + line.speaker);
  }
  const expected = [];
  for (const pin of member?.timeline?.images ?? []) {
    if (pin.character) expected.push(pin);
  }
  for (const ref of member?.visual?.references ?? []) {
    if (ref.use === 'image' || !ref.character || expected.some(pin => pin.path === ref.path && pin.character === ref.character)) continue;
    const role = ref.scope === 'scene' && ref.id?.endsWith('-face') ? 'face' : ref.role;
    expected.push({role,character:ref.character,path:ref.path});
  }
  const images = shot.images ?? [], captured = [], temporal = [];
  for (const role of new Set(images.map(image=>image.role))) {
    const rows = images.filter(image=>image.role===role);
    const digests = shotAssetDigests(wire,shot,role,rows.map(image=>({uri:image.image_uri,frame:image.frame})));
    rows.forEach((image,index)=>{
      if (image.character) captured.push([image.character,image.role,digests[index]]);
      if (['start','end','keyframe'].includes(role)) temporal.push([role,image.frame,digests[index]]);
    });
  }
  const path = require('node:path');
  const frames = require('../storyboard/references/render-routing.js').framePlan(member);
  const pins = [...(member.timeline?.images ?? []).filter(pin=>['start','end','keyframe'].includes(pin.role))];
  if (frames.start && frames.mode !== 'reference') pins.push({role:'start',frame:shot.start_frame,path:frames.start});
  if (frames.end) pins.push({role:'end',frame:shot.end_frame-1,path:frames.end});
  for (const pin of pins) {
    const digest = sha(fs.readFileSync(path.resolve(boardDir,pin.path)));
    if (!temporal.some(([role,frame,hash])=>role===pin.role && frame===pin.frame && hash===digest))
      mismatch('the archived ' + pin.role + ' frame differs from the current storyboard');
  }
  const wanted = expected.map(pin=>[pin.character,pin.role,sha(fs.readFileSync(path.resolve(boardDir,pin.path)))]);
  const keys = items => JSON.stringify([...new Set(items.map(item=>JSON.stringify(item)))].sort());
  if (keys(wanted)!==keys(captured)) mismatch('recorded character images differ from the current shot references');
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
    const {orderedSpeech} = require('../storyboard/references/scene-direction.js');
    const turns = orderedSpeech(card).filter(line => line.tts?.trim());
    const lines = turns.filter(line => line.delivery !== 'voiceover');
    const cues = card.timeline?.dialogueCues ?? [];
    if (cues.some(cue => turns.filter(line => line.id === cue.lineId).length !== 1))
      mismatch('a dialogue cue must identify one authored line');
    const privatePicture = turns.some(line => line.voiceoverKind === 'inner_thought');
    const original = body.shots.find(shot => shot.shot_id === card.id) ?? (!privatePicture && body.shots.length === 1 && body.shots[0]);
    if (!original) mismatch('the requested shot is absent from the recorded scene');
    const dialogue = original.dialogue ?? [];
    if (privatePicture && (driver || original.performance_uri || dialogue.length))
      mismatch('the recorded thought interval contains a speaking performance');
    if (privatePicture) {
      const cues = (body.scene_audio?.cues ?? []).filter(cue => cue.frame == null ||
        cue.frame >= original.start_frame && cue.frame < original.end_frame);
      require('./voiceover-direction.js').checkRecordedThoughtPicture([body.prompt,cues],original,turns);
    }
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
    if (plan.mode === 'native') verifyNativeReferences(wire,original,plan);
    if (plan.mode === 'native' || dialogue.length) {
      if (dialogue.length !== lines.length) mismatch('the recorded dialogue count differs from this shot');
      for (const [index,line] of lines.entries()) {
        const recorded = dialogue[index];
        if (recorded.speaker !== line.speaker || recorded.text?.trim() !== line.tts.trim() || recorded.delivery !== line.delivery ||
            recorded.id && line.id && recorded.id !== line.id) mismatch('recorded speakers, words or delivery do not match this shot');
        const cue = cues.find(item => item.lineId === line.id);
        if (plan.mode === 'native' && cue && recorded.frame !== cue.frame) mismatch('the recorded dialogue frame differs from the authored cue');
      }
    }
  }
  return driver;
}

module.exports = {readSceneRequest,sceneDriver,verifySceneSpeech,performanceWav,perShotSceneOperation,PER_SHOT_SCENE_OPERATION};
