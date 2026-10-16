'use strict';
const { createHash } = require('node:crypto');

/** One revision contract for editing, attachment and assembly. */
function speechRevision(line, character) {
  return createHash('sha256').update(JSON.stringify({ tts: line.tts, sub: line.sub, speaker: line.speaker, delivery: line.delivery, voice: character?.tts, ...(line.acting ? { acting: line.acting } : {}) })).digest('hex');
}

/** Provider prompt formatting shared by request planning and provenance validation. */
function compileActing(text, acting, voice) {
  const performance = acting || {};
  if (typeof performance !== 'object' || Array.isArray(performance) || Object.keys(performance).some(key => !['direction','tags'].includes(key))) throw new Error('Invalid acting fields');
  if (performance.direction !== undefined && (typeof performance.direction !== 'string' || !performance.direction.trim() || performance.direction.length > 500 || /[<>\[\]|\r\n]/.test(performance.direction))) throw new Error('Invalid acting direction');
  if (performance.tags !== undefined && (!Array.isArray(performance.tags) || performance.tags.length > 6 || performance.tags.some(tag => typeof tag !== 'string' || !tag.trim() || tag.length > 60 || !/^[A-Za-z][A-Za-z ,'-]*$/.test(tag)))) throw new Error('Invalid acting tags');
  const tags = performance.tags || [];
  if (voice.engine === 'elevenlabs') {
    if (voice.model !== undefined && voice.model !== 'eleven_v4') throw new Error('Explicitly update this character to eleven_v4 before generating new speech');
    const controls = [performance.direction, ...tags].filter(Boolean).map(tag => `[${tag}]`).join(' ');
    return { generator: 'tts_elevenlabs_generate', generation: {
      text: controls ? `${controls} ${text}` : text, voiceId: voice.voiceId,
      model: 'eleven_v4', languageCode: voice.language,
      ...(voice.stability !== undefined ? { stability: voice.stability } : {}),
      ...(voice.similarity !== undefined ? { similarity: voice.similarity } : {}),
    } };
  }
  if (voice.engine === 'gemini' && String(voice.model).startsWith('gemini-3.8-')) {
    const events = tags.map(tag => `<${tag}>`).join(' ');
    return { generator: 'tts_gemini_38', generation: {
      model: voice.model, voice: voice.voiceId,
      turns: [{ text: events ? `${events} ${text}` : text, ...(performance.direction ? { style: performance.direction } : {}) }],
    } };
  }
  if (voice.engine === 'gemini') {
    if (tags.length) throw new Error('Inline acting events require Gemini 3.8; choose its model explicitly or omit tags');
    const stylePrompt = [voice.stylePrompt, performance.direction].filter(Boolean).join('\n');
    return { generator: 'tts_generate', generation: {
      text, voiceName: voice.voiceId, model: voice.model,
      ...(stylePrompt ? { stylePrompt } : {}),
    } };
  }
  throw new Error('Speech supports Gemini and ElevenLabs v4 only; local TTS has been removed');
}

module.exports = { speechRevision, compileActing };
