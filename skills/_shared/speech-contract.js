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
    if (typeof entry === 'string' && ['mode', 'operation', 'strategy', 'route', 'tool'].includes(key))
      return /^post[-_ ]?lip[-_ ]?sync$/i.test(entry);
    return hasPostLipSync(entry);
  });
}
function assertNoPostLipSync(value) {
  if (hasPostLipSync(value)) throw new Error('post_lipsync_forbidden: generate a new speaking take from the approved inputs');
}

// Imported native clips may have no local receipt. When a receipt identifies the bytes,
// its recorded generation operation takes precedence over an attachment label.
function assertVideoSpeechProvenance(videoPath, sha256, plan) {
  const fs = require('node:fs');
  for (const suffix of ['.astra-job.json','.astra-genai.json']) {
    let receipt;
    try { receipt = JSON.parse(fs.readFileSync(videoPath + suffix, 'utf8')); } catch { continue; }
    if (!receipt || (receipt.sha256 ? receipt.sha256 !== sha256 : receipt.videoPath !== videoPath)) continue;
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

module.exports = { speechRevision, compileActing, hasPostLipSync, assertNoPostLipSync, assertVideoSpeechProvenance };
