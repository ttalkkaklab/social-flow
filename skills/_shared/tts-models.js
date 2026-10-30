'use strict';

// Implemented contracts only. Research candidates must not become callable models.
const models = [
  ['gemini-2.5-flash-preview-tts', 'gemini', 'legacy', 'tts_generate', 'tts_multi_speaker'],
  ['gemini-2.5-pro-preview-tts', 'gemini', 'legacy', 'tts_generate', 'tts_multi_speaker'],
  ['gemini-3.1-flash-tts-preview', 'gemini', 'legacy', 'tts_generate', 'tts_multi_speaker'],
  ['gemini-3.8-flash-tts', 'gemini', 'metadata', 'tts_gemini_38', 'tts_gemini_38'],
  ['gemini-3.8-flash-lite-tts', 'gemini', 'metadata', 'tts_gemini_38', 'tts_gemini_38'],
  ['eleven_v4', 'elevenlabs', 'inline', 'tts_elevenlabs_generate', 'tts_elevenlabs_dialogue'],
].map(([model, provider, direction, single, dialogue]) => Object.freeze({
  model, provider, direction, single, dialogue,
  maxSpeakers: provider === 'elevenlabs' ? 10 : 2,
  maxCharacters: provider === 'elevenlabs' ? 10000 : 16000,
  recommendedDialogueCharacters: provider === 'elevenlabs' ? 2000 : null,
  maxStyleCharacters: direction === 'metadata' ? 500 : null,
  vocalEvents: direction !== 'legacy',
  customVoice: direction !== 'legacy',
  numericSpeed: false,
  timestamps: provider === 'elevenlabs',
  evidence: provider === 'elevenlabs'
    ? 'https://elevenlabs.io/docs/api-reference/text-to-dialogue/convert'
    : 'https://ai.google.dev/gemini-api/docs/speech-generation',
}));
const TTS_MODELS = Object.freeze(models);
const TTS_DEFAULT_MODELS = Object.freeze({gemini:'gemini-2.5-flash-preview-tts',elevenlabs:'eleven_v4'});
function resolveTtsModel(provider, model) {
  if (provider === 'astra-genai') {
    if (typeof model !== 'string' || !model.trim() || model.length > 200) throw new Error('Gateway speech requires an explicit model alias');
    return Object.freeze({model,provider,direction:'gateway',single:'tts_astra_genai',dialogue:'',maxSpeakers:1,maxCharacters:16000,
      recommendedDialogueCharacters:null,maxStyleCharacters:2000,vocalEvents:false,customVoice:false,numericSpeed:true,timestamps:false,
      evidence:'Transport envelope only; discover actual voices, speed and instructions at /v1/audio/models. No arbitrary voice upload.'});
  }
  const selected = model === undefined ? TTS_DEFAULT_MODELS[provider] : model;
  const entry = TTS_MODELS.find(item => item.provider === provider && item.model === selected);
  if (!entry) throw new Error(`Unsupported TTS provider/model: ${provider}/${String(selected)}; no model fallback`);
  return entry;
}
module.exports = {TTS_MODELS,TTS_DEFAULT_MODELS,resolveTtsModel};
