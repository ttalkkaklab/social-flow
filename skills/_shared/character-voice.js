'use strict';

const GEMINI_VOICES = new Set('Zephyr Puck Charon Kore Fenrir Leda Orus Aoede Callirrhoe Autonoe Enceladus Iapetus Umbriel Algieba Despina Erinome Algenib Rasalgethi Laomedeia Achernar Alnilam Schedar Gacrux Pulcherrima Achird Zubenelgenubi Vindemiatrix Sadachbia Sadaltager Sulafat'.split(' '));

const {TTS_MODELS}=require('./tts-models.js');
const GEMINI_MODELS=new Set(TTS_MODELS.filter(m=>m.provider==='gemini').map(m=>m.model));
const ELEVENLABS_MODELS=new Set(TTS_MODELS.filter(m=>m.provider==='elevenlabs').map(m=>m.model));
function normalizeLanguage(value) {
  const raw=typeof value==='string'?value.trim().toLowerCase():'';
  return ({korean:'ko',english:'en',japanese:'ja',chinese:'zh',spanish:'es',french:'fr',portuguese:'pt'})[raw]||raw;
}

function voiceErrors(tts) {
  if (!tts || typeof tts !== 'object' || Array.isArray(tts)) return ['tts is required'];
  const errors = [];
  tts = { ...tts };
  for (const [field, max] of [['voiceId',300],['language',32],['model',128],['stylePrompt',1000],['voiceDirection',400]]) {
    if (tts[field] === undefined && ['model','stylePrompt','voiceDirection'].includes(field)) continue;
    if (typeof tts[field] !== 'string' || !tts[field].trim() || tts[field].trim().length > max) errors.push(`tts.${field} must be a non-empty string of at most ${max} characters`);
    else tts[field] = tts[field].trim();
  }
  if (!['gemini', 'elevenlabs', 'astra-genai'].includes(tts.engine)) errors.push('tts.engine must name a supported engine');
  if (typeof tts.voiceId !== 'string' || !tts.voiceId.trim()) errors.push('tts.voiceId is required');
  if (typeof tts.language !== 'string' || !tts.language.trim()) errors.push('tts.language is required');
  if (typeof tts.speed !== 'number' || !Number.isFinite(tts.speed) || tts.speed < 0.7 || tts.speed > 1.2) errors.push('tts.speed must be between 0.7 and 1.2');
  if (tts.engine === 'astra-genai' && !tts.model) errors.push('Gateway speech requires a model alias');
  if (tts.engine === 'gemini' && !GEMINI_VOICES.has(tts.voiceId) && !(typeof tts.model === 'string' && tts.model.startsWith('gemini-3.8-') && /^[A-Za-z][A-Za-z0-9_-]*$/.test(tts.voiceId))) errors.push('Unknown Gemini voiceId');
  const language=normalizeLanguage(tts.language);
  if (!/^[a-z]{2}$/.test(language)) errors.push('tts.language must be a two-letter language code or supported language name');
  if (['gemini','elevenlabs'].includes(tts.engine) && tts.speed !== 1) errors.push('This engine supports character speed 1 only');
  if (tts.engine === 'gemini' && tts.model !== undefined && !GEMINI_MODELS.has(tts.model)) errors.push('Unsupported Gemini model');
  if (tts.engine === 'elevenlabs' && tts.model !== undefined && !ELEVENLABS_MODELS.has(tts.model)) errors.push('Unsupported ElevenLabs model');
  if (tts.engine === 'elevenlabs' && !/^[A-Za-z0-9_-]{1,64}$/.test(tts.voiceId)) errors.push('Invalid ElevenLabs voiceId');
  for (const key of ['stability','similarity']) if (tts[key] !== undefined && (tts.engine !== 'elevenlabs' || typeof tts[key] !== 'number' || !Number.isFinite(tts[key]) || tts[key] < 0 || tts[key] > 1)) errors.push(`tts.${key} requires ElevenLabs and a number between 0 and 1`);
  if (tts.stylePrompt !== undefined && (tts.engine !== 'gemini' || (typeof tts.model === 'string' && tts.model.startsWith('gemini-3.8-')))) errors.push('This engine does not accept stylePrompt');
  if (tts.voiceDirection !== undefined && !['gemini', 'astra-genai'].includes(tts.engine)) errors.push('Stable voiceDirection is supported by Gemini only');
  return errors;
}

/** Compare actual generator arguments and declared text language, without listening. */
function generationVoiceErrors(expected, proof, line) {
  const errors = voiceErrors(expected);
  if (errors.length) return errors;
  const settings = proof?.voiceSettings;
  if (!settings) return ['Character speech requires recorded generation voiceSettings'];
  const engines = {tts_astra_genai:'astra-genai',tts_generate:'gemini',tts_gemini_38:'gemini',tts_elevenlabs_generate:'elevenlabs'};
  if (!engines[proof.generator] || settings.speakers || settings.inputs) return ['Character speech requires a single-speaker generation proof'];
  if (engines[proof.generator] === 'elevenlabs' && settings.model !== undefined && settings.model !== 'eleven_v4') errors.push('Unsupported ElevenLabs generation model');
  let compiled;
  if (line?.acting || expected.voiceDirection !== undefined) {
    try { compiled = require('./speech-contract.js').compileActing(line?.tts ?? proof.text, line?.acting, expected); }
    catch (error) { return ['Invalid acting: ' + error.message]; }
    if (proof.generator !== compiled.generator) errors.push('Acting generator differs from plan_audio');
    for (const [key, value] of Object.entries(compiled.generation)) {
      if (value !== undefined && JSON.stringify(settings[key]) !== JSON.stringify(value)) errors.push('Acting generation differs from plan_audio: ' + key);
    }
  }
  if (!compiled) {
    const text=typeof line?.tts==='string'?line.tts:proof.text;
    if (typeof text==='string' && settings.text!==undefined && settings.text!==text) errors.push('Generation text differs from the clean speech line');
    if (settings.turns!==undefined) {
      if (!Array.isArray(settings.turns) || settings.turns.length!==1 || settings.turns[0]?.speaker!==undefined || (typeof text==='string' && settings.turns[0]?.text!==text)) errors.push('Generation turns differ from the clean single-speaker line');
    }
  }
  const voiceField={tts_astra_genai:'voice',tts_generate:'voiceName',tts_gemini_38:'voice',tts_elevenlabs_generate:'voiceId'}[proof.generator];
  const actualVoice=settings[voiceField]===undefined && engines[proof.generator]==='gemini' ? 'Kore' : settings[voiceField];
  for(const alias of ['voiceId','voiceName','voice']) if(alias!==voiceField && settings[alias]!==undefined && settings[alias]!==actualVoice) errors.push('Conflicting voice alias: '+alias+' differs from '+voiceField);
  const actualLanguage=normalizeLanguage(proof.generator==='tts_elevenlabs_generate' && settings.languageCode!==undefined ? settings.languageCode : proof.language);
  for(const alias of ['lang','language','languageCode']) if(settings[alias]!==undefined && normalizeLanguage(settings[alias])!==actualLanguage) errors.push('Conflicting language alias: '+alias+' differs from provider language');
  const actual = {engine:engines[proof.generator],voiceId:actualVoice,language:actualLanguage,speed:settings.speed??1};
  for (const key of ['engine','voiceId','language','speed']) {
    const wanted = key==='language' ? normalizeLanguage(expected[key]) : typeof expected[key]==='string' ? expected[key].trim() : expected[key];
    if (actual[key] !== wanted) errors.push(key+' differs from pinned character voice');
  }
  if (proof.language && normalizeLanguage(proof.language)!==normalizeLanguage(expected.language)) errors.push('Declared text language differs from pinned character voice');
  for (const key of ['model','stylePrompt']) {
    const wanted = key === 'stylePrompt' && compiled ? compiled.generation.stylePrompt : expected[key]?.trim();
    if ((wanted !== undefined || key==='stylePrompt') && settings[key] !== wanted) errors.push(key==='stylePrompt'?'stylePrompt differs from resolved line acting':key+' differs from pinned character voice');
  }
  for (const key of ['stability','similarity']) if (expected[key] !== undefined && settings[key] !== expected[key]) errors.push(key+' differs from pinned character voice');
  return errors;
}

function identityVoice(source, { optional = false } = {}) {
  const blocks = [...source.matchAll(/```json\s*\n([\s\S]*?)```/g)];
  const voices = [];
  for (const block of blocks) {
    let value;
    try { value = JSON.parse(block[1]); } catch { throw new Error('Invalid JSON in character identity'); }
    if (value && Object.hasOwn(value, 'tts')) voices.push(value.tts);
  }
  if (voices.length !== 1) throw new Error('identity.md must contain exactly one JSON block with tts');
  if (optional && voices[0] === null) return null;
  const errors = voiceErrors(voices[0]);
  if (errors.length) throw new Error(errors.join('; '));
  const result = { ...voices[0], language: normalizeLanguage(voices[0].language) };
  for (const field of ['voiceId','model','stylePrompt','voiceDirection']) if (typeof result[field] === 'string') result[field] = result[field].trim();
  return result;
}

function boardVoiceErrors(win) {
  if (!win || typeof win !== 'object') return ['Storyboard must be an object'];
  const errors = require('./character-identity.js').boardIdentityErrors(win);
  const entries = win.SB_DOC?.characters;
  if (entries != null && (typeof entries !== 'object')) return ['SB_DOC.characters must be an array or object'];
  if (win.SCENES != null && !Array.isArray(win.SCENES)) return ['SCENES must be an array'];
  const characters = Array.isArray(entries) ? entries : Object.entries(entries || {}).map(([id, c]) => ({ ...c, id }));
  const ids = new Set(Object.keys(win.PRODUCTION?.cast || {}));
  const lineIds = new Set();
  if (win.SB_DOC?.speechPlanVersion === 1 && win.STORY?.version !== 'story-v2' && !win.SB_DOC.narratorCharacterId) errors.push('Speech plan needs narratorCharacterId');
  for (const scene of win.SCENES || []) {
    if (!scene || typeof scene !== 'object') { errors.push('Scene must be an object'); continue; }
    const raw = scene.visual?.character;
    for (const c of raw ? (Array.isArray(raw) ? raw : [raw]) : []) ids.add(typeof c === 'string' ? c : c?.id);
    if (scene.narration != null && !Array.isArray(scene.narration)) { errors.push('Scene narration must be an array'); continue; }
    for (const n of scene.narration || []) {
      if (!n || typeof n !== 'object') { errors.push('Narration segment must be an object'); continue; }
      errors.push(...require('./scene-acting.js').actingErrors(n.acting));
      if (n.speaker) ids.add(n.speaker);
      if (win.SB_DOC?.speechPlanVersion === 1) {
        if (typeof n.id !== 'string' || !n.id.trim() || lineIds.has(n.id)) errors.push('Every speech line needs a unique stable id');
        lineIds.add(n.id);
        if (typeof n.speaker !== 'string' || !n.speaker.trim()) errors.push('Every speech line needs an explicit speaker, including narrator');
        if (!['voiceover','on_screen','off_screen'].includes(n.delivery)) errors.push('Every speech line needs delivery: voiceover, on_screen or off_screen');
      }
    }
  }
  for (const c of characters) ids.add(c?.id);
  if (win.SB_DOC?.narratorCharacterId) ids.add(win.SB_DOC.narratorCharacterId);
  for (const id of ids) {
    const matches = characters.filter(c => c?.id === id);
    if (!id || matches.length !== 1) errors.push(`Character ${id || '(missing id)'} needs exactly one SB_DOC.characters entry with its own tts`);
    else if (require('./character-identity.js').requiresSpeech(win, id) || matches[0].tts != null)
      errors.push(...voiceErrors(matches[0].tts).map(e => `Character ${id}: ${e}`));
  }
  return errors;
}
module.exports = { normalizeLanguage, voiceErrors, generationVoiceErrors, identityVoice, boardVoiceErrors };
