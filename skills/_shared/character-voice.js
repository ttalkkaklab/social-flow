'use strict';

const GEMINI_VOICES = new Set('Zephyr Puck Charon Kore Fenrir Leda Orus Aoede Callirrhoe Autonoe Enceladus Iapetus Umbriel Algieba Despina Erinome Algenib Rasalgethi Laomedeia Achernar Alnilam Schedar Gacrux Pulcherrima Achird Zubenelgenubi Vindemiatrix Sadachbia Sadaltager Sulafat'.split(' '));

const SUPERTONIC_LANGUAGES = new Set('ko en ja ar bg cs da de el es et fi fr hi hr hu id it lt lv nl pl pt ro ru sk sl sv tr uk vi na'.split(' '));
const GEMINI_MODELS = new Set(['gemini-2.5-flash-preview-tts','gemini-2.5-pro-preview-tts','gemini-3.1-flash-tts-preview','gemini-3.8-flash-tts','gemini-3.8-flash-lite-tts']);
const ELEVENLABS_MODELS = new Set(['eleven_multilingual_v2','eleven_v3','eleven_v3_conversational','eleven_flash_v2_5','eleven_turbo_v2_5']);
function normalizeLanguage(value) {
  const raw=typeof value==='string'?value.trim().toLowerCase():'';
  return ({korean:'ko',english:'en',japanese:'ja',chinese:'zh',spanish:'es',french:'fr',portuguese:'pt'})[raw]||raw;
}

function voiceErrors(tts) {
  if (!tts || typeof tts !== 'object' || Array.isArray(tts)) return ['tts is required'];
  const errors = [];
  tts = { ...tts };
  for (const [field, max] of [['voiceId',128],['language',32],['model',128],['stylePrompt',1000]]) {
    if (tts[field] === undefined && ['model','stylePrompt'].includes(field)) continue;
    if (typeof tts[field] !== 'string' || !tts[field].trim() || tts[field].trim().length > max) errors.push(`tts.${field} must be a non-empty string of at most ${max} characters`);
    else tts[field] = tts[field].trim();
  }
  if (!['gemini', 'supertonic', 'elevenlabs', 'mlx'].includes(tts.engine)) errors.push('tts.engine must name a supported engine');
  if (typeof tts.voiceId !== 'string' || !tts.voiceId.trim()) errors.push('tts.voiceId is required');
  if (typeof tts.language !== 'string' || !tts.language.trim()) errors.push('tts.language is required');
  if (typeof tts.speed !== 'number' || !Number.isFinite(tts.speed) || tts.speed < 0.7 || tts.speed > 1.2) errors.push('tts.speed must be between 0.7 and 1.2');
  if (tts.engine === 'supertonic' && !/^[MF][1-5]$/.test(tts.voiceId)) errors.push('Supertonic voiceId must be M1–M5 or F1–F5');
  if (tts.engine === 'gemini' && !GEMINI_VOICES.has(tts.voiceId)) errors.push('Unknown Gemini voiceId');
  const language=normalizeLanguage(tts.language);
  if (!/^[a-z]{2}$/.test(language)) errors.push('tts.language must be a two-letter language code or supported language name');
  if (tts.engine === 'supertonic' && !SUPERTONIC_LANGUAGES.has(language)) errors.push('Unsupported Supertonic language');
  if (['gemini','mlx'].includes(tts.engine) && tts.speed !== 1) errors.push('This engine supports character speed 1 only');
  if (tts.engine === 'supertonic' && tts.model !== undefined) errors.push('Supertonic has no selectable model');
  if (tts.engine === 'gemini' && tts.model !== undefined && !GEMINI_MODELS.has(tts.model)) errors.push('Unsupported Gemini model');
  if (tts.engine === 'elevenlabs' && tts.model !== undefined && !ELEVENLABS_MODELS.has(tts.model)) errors.push('Unsupported ElevenLabs model');
  if (tts.engine === 'elevenlabs' && !/^[A-Za-z0-9_-]{1,64}$/.test(tts.voiceId)) errors.push('Invalid ElevenLabs voiceId');
  if (tts.stylePrompt !== undefined && (tts.engine !== 'gemini' || (typeof tts.model === 'string' && tts.model.startsWith('gemini-3.8-')))) errors.push('This engine does not accept stylePrompt');
  return errors;
}

/** Compare actual generator arguments and declared text language, without listening. */
function generationVoiceErrors(expected, proof) {
  const errors = voiceErrors(expected);
  if (errors.length) return errors;
  const settings = proof?.voiceSettings;
  if (!settings) return ['Character speech requires recorded generation voiceSettings'];
  const engines = {tts_generate:'gemini',tts_gemini_38:'gemini',tts_local_generate:'supertonic',tts_elevenlabs_generate:'elevenlabs',mlx_tts_generate:'mlx'};
  if (!engines[proof.generator] || settings.speakers || settings.inputs) return ['Character speech requires a single-speaker generation proof'];
  const actual = {engine:engines[proof.generator],voiceId:settings.voiceId||settings.voiceName||settings.voice,language:normalizeLanguage(settings.lang||settings.languageCode||settings.language||proof.language),speed:settings.speed??1};
  for (const key of ['engine','voiceId','language','speed']) {
    const wanted = key==='language' ? normalizeLanguage(expected[key]) : typeof expected[key]==='string' ? expected[key].trim() : expected[key];
    if (actual[key] !== wanted) errors.push(key+' differs from pinned character voice');
  }
  if (proof.language && normalizeLanguage(proof.language)!==normalizeLanguage(expected.language)) errors.push('Declared text language differs from pinned character voice');
  for (const key of ['model','stylePrompt']) if (expected[key]!==undefined && settings[key]!==expected[key].trim()) errors.push(key+' differs from pinned character voice');
  return errors;
}

function identityVoice(source) {
  const blocks = [...source.matchAll(/```json\s*\n([\s\S]*?)```/g)];
  const voices = [];
  for (const block of blocks) {
    let value;
    try { value = JSON.parse(block[1]); } catch { throw new Error('Invalid JSON in character identity'); }
    if (value && Object.hasOwn(value, 'tts')) voices.push(value.tts);
  }
  if (voices.length !== 1) throw new Error('identity.md must contain exactly one JSON block with tts');
  const errors = voiceErrors(voices[0]);
  if (errors.length) throw new Error(errors.join('; '));
  const result = { ...voices[0], language: normalizeLanguage(voices[0].language) };
  for (const field of ['voiceId','model','stylePrompt']) if (typeof result[field] === 'string') result[field] = result[field].trim();
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
  if (win.SB_DOC?.speechPlanVersion === 1 && !win.SB_DOC.narratorCharacterId) errors.push('Speech plan needs narratorCharacterId');
  for (const scene of win.SCENES || []) {
    if (!scene || typeof scene !== 'object') { errors.push('Scene must be an object'); continue; }
    const raw = scene.visual?.character;
    for (const c of raw ? (Array.isArray(raw) ? raw : [raw]) : []) ids.add(typeof c === 'string' ? c : c?.id);
    if (scene.narration != null && !Array.isArray(scene.narration)) { errors.push('Scene narration must be an array'); continue; }
    for (const n of scene.narration || []) {
      if (!n || typeof n !== 'object') { errors.push('Narration segment must be an object'); continue; }
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
    else errors.push(...voiceErrors(matches[0].tts).map(e => `Character ${id}: ${e}`));
  }
  return errors;
}
module.exports = { normalizeLanguage, voiceErrors, generationVoiceErrors, identityVoice, boardVoiceErrors };
