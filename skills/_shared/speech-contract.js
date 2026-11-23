'use strict';
const { createHash } = require('node:crypto');

/** One revision contract for editing, attachment and assembly. */
function speechRevision(line, character) {
  return createHash('sha256').update(JSON.stringify(require('./scene-acting.js').speechRevisionPayload(line,character?.tts))).digest('hex');
}

/** Provider prompt formatting shared by request planning and provenance validation. */
function compileActing(text, acting, voice) {
  voice={...voice};
  for(const key of ['voiceId','model','stylePrompt','voiceDirection'])if(typeof voice[key]==='string')voice[key]=voice[key].trim();
  if(typeof voice.language==='string')voice.language=require('./character-voice.js').normalizeLanguage(voice.language);
  const {resolveTtsModel}=require('./tts-models.js');
  if (!['gemini','elevenlabs','astra-genai'].includes(voice.engine)) throw new Error('Choose a supported engine: Gemini or ElevenLabs v4; local TTS has been removed');
  if (voice.engine==='elevenlabs' && voice.model!==undefined && voice.model!=='eleven_v4') throw new Error('Explicitly update this character to eleven_v4 before generating new speech');
  const contract=resolveTtsModel(voice.engine,voice.model);
  const performance = acting || {};
  const {actingErrors,resolvedStyle,directionSupport}=require('./scene-acting.js');
  const errors=actingErrors(acting);if(errors.length)throw new Error(errors.join('; '));
  const direction=resolvedStyle(voice,acting),support=directionSupport(voice,acting);
  if (!support.supported && voice.engine === 'gemini') throw new Error(support.warnings.join('; '));
  const tags = performance.tags || [];
  if (contract.direction === 'gateway') {
    if (tags.length) throw new Error('Gateway speech does not support inline acting tags');
    return {generator:'tts_astra_genai',generation:{model:voice.model,text,voice:voice.voiceId,speed:voice.speed ?? 1,
      ...(direction ? {instructions:direction} : {})}};
  }
  if (contract.direction === 'inline') {
    if (voice.model !== undefined && voice.model !== 'eleven_v4') throw new Error('Explicitly update this character to eleven_v4 before generating new speech');
    const controls = [performance.direction?.trim(), ...tags].filter(Boolean).map(tag => `[${tag}]`).join(' ');
    return { generator: 'tts_elevenlabs_generate', generation: {
      text: controls ? `${controls} ${text}` : text, voiceId: voice.voiceId,
      model: 'eleven_v4', languageCode: voice.language,
      ...(voice.stability !== undefined ? { stability: voice.stability } : {}),
      ...(voice.similarity !== undefined ? { similarity: voice.similarity } : {}),
    } };
  }
  if (contract.direction === 'metadata') {
    const events = tags.map(tag => `<${tag}>`).join(' ');
    return { generator: 'tts_gemini_38', generation: {
      model: voice.model, voice: voice.voiceId,
      turns: [{ text: events ? `${events} ${text}` : text, ...(direction && support.supported ? { style: direction } : {}) }],
    } };
  }
  if (voice.engine === 'gemini') {
    if (tags.length) throw new Error('Inline acting events require Gemini 3.8; choose its model explicitly or omit tags');
    const stylePrompt = direction;
    return { generator: 'tts_generate', generation: {
      text, voiceName: voice.voiceId, model: voice.model,
      ...(stylePrompt ? { stylePrompt } : {}),
    } };
  }
  throw new Error('Choose a supported engine: Gemini or ElevenLabs v4; local TTS has been removed');
}

// Reject executable legacy modes and caller-supplied capabilities, including nested saved plans.
function hasPostLipSync(value) {
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, entry]) => {
    if ((key === 'postLipSync' || key === 'post_lipsync') && entry === true) return true;
    if (typeof entry === 'string' && ['mode', 'operation', 'strategy', 'route', 'tool', 'provider', 'model'].includes(key))
      return /^(?:post[-_ ]?lip[-_ ]?sync|musetalk|wav2lip)$/i.test(entry);
    return hasPostLipSync(entry);
  });
}
function assertNoPostLipSync(value) {
  if (hasPostLipSync(value)) throw new Error('post_lipsync_forbidden: generate a new speaking take from the approved inputs');
}

const receiptSuffixes = ['.astra-job.json','.astra-genai.json'];
function verifyReceiptOperation(receipt,suffix,plan,hashBound) {
  assertNoPostLipSync(receipt);
  if (!hashBound || !['native','audio_conditioned'].includes(plan.mode)) return;
  const operation = receipt.operation ?? receipt.mode;
  if (!operation) return;
  const provider = suffix === '.astra-job.json' ? 'astra' :
    receipt.protocol === 'gateway-desktop-v1' ? 'astra-genai-desktop' : 'astra-genai';
  const conditioned = ['audio-to-video','audio2video','scene-to-video'].includes(operation);
  const native = provider === 'astra-genai' && ['image-to-video','scene-to-video','msr'].includes(operation);
  if (provider !== plan.provider || (plan.mode === 'native' ? !native : !conditioned) ||
      typeof receipt.model === 'string' && receipt.model !== plan.model)
    throw new Error('speech_video_source_mismatch: the recorded generation operation or model disagrees with the speech attachment');
}

// Index the episode's known media folders once. A receipt belongs to the source
// bytes, so copying a video away from its sidecar cannot erase a known operation.
function episodeVideoReceipts(shots,board,extra) {
  const fs = require('node:fs'), path = require('node:path');
  const dirs = new Set([path.resolve(board,'../.work/video'),path.resolve(board,'../output/video/scenes')]);
  const hashes = new Map(), forbidden = [];
  function directory(file) {
    if (typeof file === 'string' && file) dirs.add(path.dirname(path.resolve(board,file)));
  }
  directory(extra);
  for (const shot of shots) {
    const video = shot.visual?.video ?? {}, binding = video.speechBinding;
    for (const file of [video.clip,binding?.videoPath,video.soundtrackRepair?.videoPath]) directory(file);
    for (const source of video.soundtrackRepair?.sources ?? []) directory(source.path);
    if (binding?.videoSha256 && hasPostLipSync(binding)) forbidden.push({sha:binding.videoSha256,
      file:typeof binding.videoPath === 'string' && path.resolve(board,binding.videoPath),picture:binding.performanceSource?.picture});
  }
  for (const dir of dirs) {
    let entries;
    try { entries = fs.readdirSync(dir,{withFileTypes:true}); }
    catch (error) { if (error.code === 'ENOENT' || error.code === 'ENOTDIR') continue; throw error; }
    for (const entry of entries) {
      const suffix = receiptSuffixes.find(s => entry.name.endsWith(s));
      if (!suffix || !entry.isFile()) continue;
      const sidecar = path.join(dir,entry.name);
      let receipt;
      try { receipt = JSON.parse(fs.readFileSync(sidecar,'utf8')); } catch { continue; }
      const file = sidecar.slice(0,-suffix.length);
      let sha = receipt?.sha256;
      if (!sha && receipt?.videoPath === file && hasPostLipSync(receipt) && fs.existsSync(file))
        sha = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
      if (!/^[a-f0-9]{64}$/.test(sha)) continue;
      if (!hashes.has(sha)) hashes.set(sha,[]);
      hashes.get(sha).push({receipt,suffix});
      if (hasPostLipSync(receipt)) forbidden.push({sha,file});
    }
  }
  return {hashes,forbidden};
}

// Imported native clips may have no local receipt. A matching recorded operation
// takes precedence over an attachment label, including after a copy or remux.
function assertVideoSpeechProvenance(videoPath, sha256, plan = {}, index) {
  const fs = require('node:fs');
  const digest = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  for (const suffix of receiptSuffixes) {
    let receipt;
    try {
      receipt = JSON.parse(fs.readFileSync(videoPath + suffix, 'utf8'));
      if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) throw new Error('Invalid receipt');
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw new Error('speech_video_receipt_invalid: cannot verify the generation receipt for ' + videoPath);
    }
    sha256 ??= digest(videoPath);
    if (receipt.sha256 ? receipt.sha256 !== sha256 : receipt.videoPath !== videoPath) continue;
    verifyReceiptOperation(receipt,suffix,plan,receipt.sha256 === sha256);
  }
  if (!index || !(index.hashes.size || index.forbidden.length) || !fs.existsSync(videoPath)) return;
  sha256 ??= digest(videoPath);
  for (const {receipt,suffix} of index.hashes.get(sha256) ?? []) verifyReceiptOperation(receipt,suffix,plan,true);
  let picture;
  for (const source of index.forbidden) {
    if (source.sha === sha256) throw new Error('post_lipsync_forbidden: the bound video belongs to a known post-render lip-sync source');
    if (!source.picture && source.file && fs.existsSync(source.file) && digest(source.file) === source.sha)
      source.picture = videoPerformanceSource(source.file,true).picture;
    if (!source.picture) continue;
    picture ??= videoPerformanceSource(videoPath,true).picture;
    if (source.picture === picture)
      throw new Error('post_lipsync_forbidden: these video frames belong to a known post-render lip-sync source');
  }
}

// Keep the stream identities even when an editor saves new bytes over the same path.
function videoPerformanceSource(file, silentConditioned = false) {
  const picture = require('node:child_process').execFileSync('ffmpeg', ['-nostdin','-v','error','-xerror',
    '-i',file,'-map','0:V:0','-fps_mode','passthrough','-c:v','rawvideo','-pix_fmt','yuv420p',
    '-f','hash','-hash','sha256','-'], {encoding:'utf8',timeout:120000}).trim();
  return {picture, ...(!silentConditioned && {audio:require('./audio-signal.js').decodedAudioHash(file)})};
}

// One source interval can only carry one spoken performance. Adjacent authored
// trims may share the same scene render. Keep checks local to an episode.
function assertVideoPerformanceOwnership(shots, boardDir, candidate) {
  const fs = require('node:fs'), path = require('node:path');
  const media = new Map();
  function source(shot) {
    const binding = shot.visual?.video?.speechBinding;
    if (!['native','audio_conditioned'].includes(binding?.mode) || !binding.videoSha256 || !binding.audio?.length) return;
    const start = shot.edit?.in ?? 0, end = shot.edit?.out ?? Infinity;
    if (!Number.isFinite(start) || start < 0 || !(end > start) || (end !== Infinity && !Number.isFinite(end)))
      throw new Error('speech_video_performance_conflict: invalid dialogue source interval for ' + shot.id);
    const visible = shot.narration?.some(line => line.delivery === 'on_screen' && line.tts?.trim());
    return {id:shot.id, start, end, visible, binding, revisions:JSON.stringify(binding.audio.map(line => [line.revision,line.sha256]))};
  }
  function identity(entry) {
    const {videoPath,videoSha256,performanceSource,conditioningAudioSha256} = entry.binding;
    if (!media.has(videoSha256)) {
      const file = typeof videoPath === 'string' && path.resolve(boardDir,videoPath);
      const original = file && fs.existsSync(file) && createHash('sha256').update(fs.readFileSync(file)).digest('hex') === videoSha256;
      // New bindings retain the original streams when an editor has replaced the file.
      // Recompute historical or assembled claims whenever the bound bytes are present.
      media.set(videoSha256,original ? videoPerformanceSource(file,Boolean(conditioningAudioSha256)) : performanceSource);
    }
    return media.get(videoSha256);
  }
  function check(left,right) {
    if (left.end <= right.start || right.end <= left.start) return;
    const samePlan = left.binding.mode === right.binding.mode && left.revisions === right.revisions &&
      left.binding.conditioningAudioSha256 === right.binding.conditioningAudioSha256;
    if (samePlan && left.binding.videoSha256 === right.binding.videoSha256) return;
    const a = identity(left), b = identity(right);
    const samePicture = (left.visible || right.visible) && a?.picture && a.picture === b?.picture;
    const changedSoundtrack = samePicture && a.audio !== b.audio;
    const sameMedia = samePicture || (a?.audio && a.audio === b?.audio) || left.binding.videoSha256 === right.binding.videoSha256;
    if (changedSoundtrack || (!samePlan && sameMedia))
      throw new Error('speech_video_performance_conflict: ' + left.id + ' and ' + right.id +
        ' assign a different recording or performance to the same footage or soundtrack over an overlapping source interval');
  }
  const prior = [];
  const next = candidate && source(candidate);
  for (const shot of shots) {
    const entry = source(shot);
    if (!entry) continue;
    if (candidate) {
      if (next && (entry.id !== next.id || entry.binding.videoSha256 !== next.binding.videoSha256)) check(entry,next);
    } else {
      if (entry.binding.performanceSource) {
        const current = identity(entry), recorded = entry.binding.performanceSource;
        if (current?.picture !== recorded.picture || current?.audio !== recorded.audio)
          throw new Error('speech_video_performance_conflict: the source streams for ' + entry.id + ' changed after attachment');
      }
      for (const earlier of prior) check(earlier,entry);
      prior.push(entry);
    }
  }
}

module.exports = { speechRevision, compileActing, hasPostLipSync, assertNoPostLipSync, assertVideoSpeechProvenance, episodeVideoReceipts, assertVideoPerformanceOwnership, videoPerformanceSource };
