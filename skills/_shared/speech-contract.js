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

// Imported native clips may have no local receipt. When a receipt identifies the bytes,
// its recorded generation operation takes precedence over an attachment label.
function assertVideoSpeechProvenance(videoPath, sha256, plan = {}) {
  const fs = require('node:fs');
  for (const suffix of ['.astra-job.json','.astra-genai.json']) {
    let receipt;
    try {
      receipt = JSON.parse(fs.readFileSync(videoPath + suffix, 'utf8'));
      if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) throw new Error('Invalid receipt');
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw new Error('speech_video_receipt_invalid: cannot verify the generation receipt for ' + videoPath);
    }
    sha256 ??= createHash('sha256').update(fs.readFileSync(videoPath)).digest('hex');
    if (receipt.sha256 ? receipt.sha256 !== sha256 : receipt.videoPath !== videoPath) continue;
    assertNoPostLipSync(receipt);
    if (receipt.sha256 !== sha256 || !['native','audio_conditioned'].includes(plan.mode)) continue;
    const operation = receipt.operation ?? receipt.mode;
    if (!operation) continue;
    const provider = suffix === '.astra-job.json' ? 'astra' :
      receipt.protocol === 'gateway-desktop-v1' ? 'astra-genai-desktop' : 'astra-genai';
    const conditioned = ['audio-to-video','audio2video','scene-to-video'].includes(operation);
    const native = provider === 'astra-genai' && ['image-to-video','scene-to-video','msr'].includes(operation);
    if (provider !== plan.provider || (plan.mode === 'native' ? !native : !conditioned) ||
        typeof receipt.model === 'string' && receipt.model !== plan.model)
      throw new Error('speech_video_source_mismatch: the recorded generation operation or model disagrees with the speech attachment');
  }
}

// Keep the stream identities even when an editor saves new bytes over the same path.
function videoPerformanceSource(file, silentConditioned = false) {
  const picture = require('node:child_process').execFileSync('ffmpeg', ['-nostdin','-v','error','-xerror',
    '-i',file,'-map','0:V:0','-c:v','copy','-f','hash','-hash','sha256','-'], {encoding:'utf8',timeout:30000}).trim();
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
    return {id:shot.id, start, end, visible, binding, revisions:JSON.stringify(binding.audio.map(line => line.revision))};
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
  function samePerformanceMedia(left,right) {
    if (left.binding.videoSha256 === right.binding.videoSha256) return true;
    const a = identity(left), b = identity(right);
    if (!a || !b) return false;
    if ((left.visible || right.visible) && a.picture && a.picture === b.picture) return true;
    return a.audio && a.audio === b.audio;
  }
  function check(left,right) {
    if (left.end <= right.start || right.end <= left.start) return;
    if (left.binding.mode === right.binding.mode && left.revisions === right.revisions) return;
    if (samePerformanceMedia(left,right))
      throw new Error('speech_video_performance_conflict: ' + left.id + ' and ' + right.id +
        ' assign different dialogue to the same footage or soundtrack over an overlapping source interval');
  }
  const prior = [];
  const next = candidate && source(candidate);
  for (const shot of shots) {
    const entry = source(shot);
    if (!entry) continue;
    if (candidate) {
      if (next && (entry.id !== next.id || entry.binding.videoSha256 !== next.binding.videoSha256)) check(entry,next);
    } else {
      for (const earlier of prior) check(earlier,entry);
      prior.push(entry);
    }
  }
}

module.exports = { speechRevision, compileActing, hasPostLipSync, assertNoPostLipSync, assertVideoSpeechProvenance, assertVideoPerformanceOwnership, videoPerformanceSource };
