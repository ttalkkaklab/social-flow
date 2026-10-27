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
  if (!['gemini','elevenlabs'].includes(voice.engine)) throw new Error('Choose a supported engine: Gemini or ElevenLabs v4; local TTS has been removed');
  if (voice.engine==='elevenlabs' && voice.model!==undefined && voice.model!=='eleven_v4') throw new Error('Explicitly update this character to eleven_v4 before generating new speech');
  const contract=resolveTtsModel(voice.engine,voice.model);
  const performance = acting || {};
  const {actingErrors,resolvedStyle,directionSupport}=require('./scene-acting.js');
  const errors=actingErrors(acting);if(errors.length)throw new Error(errors.join('; '));
  const direction=resolvedStyle(voice,acting),support=directionSupport(voice,acting);
  if (!support.supported && voice.engine === 'gemini') throw new Error(support.warnings.join('; '));
  const tags = performance.tags || [];
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

module.exports = { speechRevision, compileActing };
