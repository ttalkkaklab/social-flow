'use strict';
const TEXT_FIELDS = ['context', 'intent', 'emotion', 'vocal', 'visual'];
function actingErrors(acting) {
  if (acting === undefined || acting === null) return [];
  if (!acting || typeof acting !== 'object' || Array.isArray(acting)) return ['acting must be an object'];
  const errors=[];
  for (const key of Object.keys(acting)) {
    if (TEXT_FIELDS.includes(key)) {
      if (typeof acting[key] !== 'string' || !acting[key].trim() || acting[key].length>1000) errors.push(`acting.${key} needs 1–1000 characters`);
    } else if (key==='direction') {
      if(typeof acting[key]!=='string'||!acting[key].trim()||acting[key].length>500||/[<>\[\]|\r\n]/.test(acting[key]))errors.push('Invalid acting direction');
    } else if(key==='tags') {
      if(!Array.isArray(acting.tags)||acting.tags.length>6||acting.tags.some(tag=>typeof tag!=='string'||!tag.trim()||tag.length>60||!/^[A-Za-z][A-Za-z ,'-]*$/.test(tag)))errors.push('Invalid acting tags');
    } else if (['leadInSeconds','tailOutSeconds'].includes(key)) {
      if (typeof acting[key] !== 'number' || !Number.isFinite(acting[key]) || acting[key]<0 || acting[key]>5) errors.push(`acting.${key} must be finite and between 0 and 5 seconds`);
    } else errors.push('Unknown acting field: '+key);
  }
  return errors;
}
function resolvedStyle(voice, acting) {
  const errors=actingErrors(acting); if(errors.length)throw new Error(errors.join('; '));
  const direction=[...(acting?.direction?[acting.direction.trim()]:[]),...['context','intent','emotion','vocal'].filter(key=>acting?.[key]).map(key=>`${key}: ${acting[key].trim()}`)];
  const performance = direction.length ? direction.join('\n') : acting?.tags?.length ? undefined : voice?.stylePrompt?.trim();
  return [voice?.voiceDirection?.trim(), performance].filter(Boolean).join('\n') || undefined;
}
function directionSupport(voice, acting) {
  // ElevenLabs inline cues are deliberately authored controls, not scene prose.
  if(voice?.engine==='elevenlabs') {
    const errors=actingErrors(acting);if(errors.length)throw new Error(errors.join('; '));
    const stylePrompt=acting?.direction?.trim(),tags=acting?.tags||[];
    const hasCue=Boolean(stylePrompt||tags.length);
    const richFields=['context','intent','emotion','vocal'].filter(key=>acting?.[key]);
    const supported=hasCue||richFields.length===0;
    return {stylePrompt,inlineCues:[stylePrompt,...tags].filter(Boolean),supported,warnings:supported?[]:['ElevenLabs does not convert scene context or vocal paragraphs into inline cues. Author a short acting.direction or acting.tags cue; rich scene direction remains available for video and review.']};
  }
  const stylePrompt=resolvedStyle(voice,acting);
  const gemini38=voice?.engine==='gemini' && voice.model?.trim().startsWith('gemini-3.8-');
  const supported=!stylePrompt || (voice?.engine==='astra-genai' && stylePrompt.length<=2000) || (voice?.engine==='gemini' && (!gemini38 || stylePrompt.length<=500));
  return {stylePrompt,supported,warnings:supported?[]:[gemini38?'Resolved acting exceeds the Gemini 3.8 turn style limit of 500 characters; shorten it before generation.':`The selected ${voice?.engine} adapter cannot carry free-text acting direction; review delivery or explicitly choose a capable adapter.`]};
}
// Omit absent acting to retain revisions of existing episodes byte-for-byte.
function speechRevisionPayload(line, voice) {
  return {tts:line.tts,sub:line.sub,speaker:line.speaker,delivery:line.delivery,voice,...(line.acting!=null?{acting:line.acting}:{})};
}
// A native-speech line has no audio to measure before its clip exists. Fitted on 150 MSR clips
// that had room to spare (2026-11-16): 4.5 Hangul syllables a second, 0.35 s for each pause
// inside the line and 0.4 s of margin, which covered 85% of the measured spans. It errs long so
// a line is not planned shorter than it is spoken.
// Only Korean is measured. The other rates are the read-speech syllable rates of Pellegrino,
// Coupé & Marsico 2011 (Language 87(3), table 1) times 0.6, the factor that puts English near
// 150 words a minute: uncalibrated, and slow on purpose. Refit a rate when its clips are measured.
const SPEECH_RATES = { ko: 4.5, ja: 4.7, es: 4.7, fr: 4.3, en: 3.7, de: 3.6, zh: 3.1, vi: 3.1, latin: 3.6 };
const LATIN_RULES = ['en', 'es', 'fr', 'de', 'vi'];
const count = (words, pattern) => (words.match(pattern) || []).length;
// The script decides first; the board's language (BCP-47) separates what a script cannot:
// kanji-only Japanese from Chinese, and the Latin-script languages from each other.
function speechLanguage(text, hint) {
  const words = typeof text === 'string' ? text : '';
  const tag = typeof hint === 'string' ? hint.trim().toLowerCase().split(/[-_]/)[0] : '';
  if (/[가-힣]/.test(words)) return 'ko';
  if (/[぀-ヿ]/.test(words)) return 'ja';
  if (/\p{Script=Han}/u.test(words)) return tag === 'ja' ? 'ja' : 'zh';
  // A line of digits alone is read in the board's language.
  if (!/\p{Script=Latin}/u.test(words)) return /[0-9]/.test(words) && SPEECH_RATES[tag] ? tag : null;
  if (LATIN_RULES.includes(tag)) return tag;
  return /[ăơưđẠ-ỹ]/i.test(words) ? 'vi' : 'latin';
}
function latinSyllables(words, language) {
  return (words.match(/[\p{Script=Latin}'’]+/gu) || []).reduce((total, word) => {
    const groups = count(word.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase(), /[aeiouyæœø]+/g);
    // A final unaccented e is silent in English and French, except English consonant + le (table).
    const silent = (language === 'en' || language === 'fr') && groups > 1 && /[^aeiouy]es?$/i.test(word) && !(language === 'en' && /[^aeiouy]le$/i.test(word));
    return total + Math.max(1, groups - (silent ? 1 : 0));
  }, 0);
}
function speechUnits(words, language) {
  const digits = count(words, /[0-9]/g);
  if (language === 'ko') return count(words, /[가-힣0-9]/g);
  // Morae: a kana is one, a small ゃ-row kana joins the one before it, a kanji or a digit averages two.
  if (language === 'ja') return count(words, /[぀-ヿ]/g) - count(words, /[ぁぃぅぇぉゃゅょゎァィゥェォャュョヮ]/g) + 2 * (count(words, /\p{Script=Han}/gu) + digits);
  if (language === 'zh') return count(words, /\p{Script=Han}/gu) + digits;
  // A Vietnamese word is written one syllable at a time.
  if (language === 'vi') return count(words, /\p{Script=Latin}+/gu) + digits;
  return latinSyllables(words, language) + 2 * digits;
}
/** Seconds a line takes to say, its detected language and whether that rate was measured; null when nothing is spoken. */
function estimateSpeech(text, language) {
  // Bracketed acting tags ([whispers], [laughs]) are directions, not spoken text.
  const words = typeof text === 'string' ? text.replace(/\[[^\]]*\]/g, '') : '';
  const spoken = speechLanguage(words, language);
  const units = spoken ? speechUnits(words, spoken) : 0;
  if (!units) return null;
  const pauses = count(words, /[.?!…,。、？！，；：;:]+(?=\s*\S)/g);
  return { seconds: Math.round((units / SPEECH_RATES[spoken] + 0.35 * pauses + 0.4) * 100) / 100, language: spoken, calibrated: spoken === 'ko' };
}
const estimateSpeechSeconds = (text, language) => estimateSpeech(text, language)?.seconds ?? null;
// One performance timeline serves video prompts and audio composition. Drafts retain
// unknown durations; production must supply measured speech and authored action timing.
function planScenePerformance(input, measureAudio = () => null) {
  const scene = Array.isArray(input) ? {narration:input} : input;
  const lines = scene.narration || [], warnings = [];
  const explicit = Array.isArray(scene.performance) && scene.performance.length > 0;
  const events = explicit ? scene.performance.map(event => ({...event}))
    : lines.map((line, index) => ({kind:line.delivery === 'voiceover' ? 'narration' : 'dialogue', character:line.speaker, group:index + 1}));
  const groups = new Set();
  for (const event of events) {
    if (event.videoDirection !== undefined && (typeof event.videoDirection !== 'string' || !event.videoDirection.trim())) throw new Error('performance.videoDirection must be non-empty text');
    if (event.kind === 'action') {
      if (typeof event.text !== 'string' || !event.text.trim()) throw new Error('Performance action needs visible action text');
      if (event.durationSeconds !== undefined && (!Number.isFinite(event.durationSeconds) || event.durationSeconds <= 0)) throw new Error('Action durationSeconds must be finite and positive');
      if (event.withGroup !== undefined && (!Number.isInteger(event.withGroup) || !lines[event.withGroup - 1])) throw new Error('Action withGroup must reference a speech group');
      continue;
    }
    if (!['dialogue','narration'].includes(event.kind) || !Number.isInteger(event.group) || !lines[event.group - 1] || groups.has(event.group)) throw new Error('Performance needs valid unique speech group references');
    if (event.character !== lines[event.group - 1].speaker) throw new Error('Performance character differs from speech speaker');
    groups.add(event.group);
  }
  // Legacy/incomplete boards keep every line audible and expose the missing mapping.
  for (const [index,line] of lines.entries()) if (!groups.has(index + 1)) {
    warnings.push('Speech group '+(index + 1)+' is absent from performance; appended for planning. Place it in the intended event order.');
    events.push({kind:line.delivery === 'voiceover' ? 'narration' : 'dialogue',character:line.speaker,group:index + 1});
  }
  let cursor = 0;
  const speech = new Map();
  const add = (a,b) => a === null || b === null ? null : a + b;
  const performance = events.map(event => {
    if (event.kind === 'action') {
      if (event.withGroup !== undefined) return {...event,startSeconds:null,endSeconds:null};
      const startSeconds = cursor;
      cursor = add(cursor,event.durationSeconds ?? null);
      if (event.durationSeconds === undefined) warnings.push('Action timing unresolved: '+event.text);
      return {...event,startSeconds,endSeconds:cursor};
    }
    const line = lines[event.group - 1], acting = line.acting || {};
    const errors = actingErrors(acting); if (errors.length) throw new Error(errors.join('; '));
    const leadInSeconds = acting.leadInSeconds ?? 0, tailOutSeconds = acting.tailOutSeconds ?? 0;
    const measured = measureAudio(line);
    const audioSeconds = Number.isFinite(measured) && measured > 0 ? measured : null;
    const startSeconds = cursor, speechStartSeconds = add(cursor,leadInSeconds);
    const speechEndSeconds = add(speechStartSeconds,audioSeconds);
    cursor = add(speechEndSeconds,tailOutSeconds);
    for (const action of events.filter(item => item.kind === 'action' && item.withGroup === event.group)) {
      const end = action.durationSeconds === undefined ? speechEndSeconds : add(speechStartSeconds,action.durationSeconds);
      cursor = cursor === null || end === null ? null : Math.max(cursor,end);
    }
    const beat = {...event,lineId:line.id,speaker:line.speaker,text:line.tts,delivery:line.delivery,acting,resolvedVocal:resolvedStyle(undefined,acting),leadInSeconds,tailOutSeconds,audioSeconds,startSeconds,speechStartSeconds,speechEndSeconds,endSeconds:cursor};
    speech.set(event.group,beat);
    return beat;
  });
  for (const event of performance) if (event.kind === 'action' && event.withGroup !== undefined) {
    const anchor = speech.get(event.withGroup);
    event.startSeconds = anchor.speechStartSeconds;
    event.endSeconds = event.durationSeconds === undefined ? anchor.speechEndSeconds : add(event.startSeconds,event.durationSeconds);
  }
  const hasActions = performance.some(event => event.kind === 'action');
  const timing = cursor === null ? (warnings.some(item => item.startsWith('Action timing')) ? 'needs_action_timing' : 'needs_audio_duration') : hasActions ? (speech.size ? 'planned_actions_with_measured_audio' : 'planned_actions') : 'measured';
  for (const event of performance.filter(e => e.kind !== 'action')) {
    const gap = event.endSeconds - event.speechEndSeconds;
    if (gap > 0.75) warnings.push('Speech ' + event.lineId + ' ends ' + gap.toFixed(3) + 's before its action ends; review inherited action duration after replacing speech.');
  }
  return {performance,durationSeconds:cursor,timing,warnings};
}
function scenePerformancePayload(scene) {
  return {performance:scene.performance, narration:(scene.narration || []).map(line => ({id:line.id,speaker:line.speaker,tts:line.tts,delivery:line.delivery,acting:line.acting})), videoDesign:scene.shot?.videoDesign,techniques:scene.shot?.techniques,camera:scene.visual?.camera,source:{bg:scene.visual?.bg,character:scene.visual?.character,location:scene.shot?.location}};
}
function cameraLock(camera = {}) {
  return require('../storyboard/references/production-mode.js').moveOf(camera)?.family === 'static'
    ? 'Locked camera: preserve the opening framing, camera angle, focal length and background scale throughout; animate the planned subject action.'
    : '';
}
function sceneDirection(scene = {}, performance = []) {
  const design = scene.shot?.videoDesign || {}, camera = scene.visual?.camera || {};
  const view = require('../storyboard/references/shot-view.js').checked(camera.view);
  const catalogue = require('../storyboard/references/film-techniques.js');
  const directed = view ? {...scene, shot:{...scene.shot, techniques:(scene.shot?.techniques || []).filter(t =>
    catalogue.byId[t.id]?.category !== 'framing' && !catalogue.byId[t.id]?.fields.viewpoint)}} : scene;
  const lock = cameraLock(camera);
  const actions = new Set(performance.filter(event => event.kind === 'action').map(event => event.videoDirection || event.text));
  const keys = ['before','action','after','continuity'].filter(key => design[key] && !(key === 'action' && actions.has(design[key])));
  const seen = new Set(keys.map(key => design[key]));
  const states = [];
  for (const beat of design.motion?.beats || []) {
    if (beat.state && !seen.has(beat.state)) { states.push(`Visible state: ${beat.state}`); seen.add(beat.state); }
  }
  return [
    ...keys.map(key => `${key}: ${design[key]}`),
    ...states,
    catalogue.instructions(directed),
    ...(view ? [require('../storyboard/references/shot-view.js').instructions(view)] : []),
    ...[...(view ? [] : ['framing']),'movement',...(lock ? [] : ['speed']),'end'].filter(key => camera[key]).map(key => `Camera ${key}: ${camera[key]}`),
    ...(lock ? [lock] : []),
  ].join('\n');
}
const VIDEO_TEXT_POLICY = 'Keep the entire video image text-free: no subtitles, captions, dialogue text, typography, letters, logos or watermarks, including during speech.';
// Shared temporal instructions; native MSR dialogue is mapped to image/audio slots later.
function performanceBeats(performance, mode, includeDialogue = true) {
  const dialogue = performance.filter(line => line.kind !== 'action').map(line => line.text).filter(text => typeof text === 'string' && text.length);
  const visualDirection = value => {
    let text = String(value);
    for (const words of dialogue) text = text.split(words).join('the supplied speech');
    return text;
  };
  return performance.map((line, index) => {
    if (line.kind === 'action') {
      const relation = line.withGroup === undefined ? 'in this event order' : `concurrently with speech group ${line.withGroup}; do not add a separate pause`;
      const timing = line.startSeconds === null || line.endSeconds === null ? 'Timing unresolved; preserve this action when timing is planned.' : `Action interval ${line.startSeconds}–${line.endSeconds} seconds.`;
      return `Beat ${index + 1} (action by ${visualDirection(line.character || 'unspecified')}): ${visualDirection(line.videoDirection || line.text)}; ${relation}. ${timing}`;
    }
    const acting = {...line.acting, ...(line.videoDirection ? {visual:line.videoDirection} : {})};
    const delivery = line.delivery || 'voiceover';
    const mouth = delivery === 'on_screen' && mode === 'native' && includeDialogue
      ? `Show this speaker physically saying "${line.text}"; every other visible mouth stays closed.`
      : delivery === 'on_screen' && mode === 'native'
      ? 'Only this speaker speaks the separately mapped authored line; other visible mouths stay closed.'
      : delivery === 'on_screen'
      ? 'Show this speaker physically speaking; synchronize only this speaker\'s mouth to their supplied audio during this interval using the selected synchronization route.'
      : delivery === 'off_screen'
        ? 'Keep the speaking face outside the authored crop; retain any planned hands or body detail. All visible mouths stay closed during this interval; show the planned reaction, detail or action without adding a portrait.'
        : 'This is voiceover or narration, not visible physical speech. All visible mouths stay closed during this interval; show the planned action.';
    const fields = ['direction', 'context', 'intent', 'emotion', 'vocal', 'visual'].filter(key => acting[key])
      .map(key => `${key}: ${visualDirection(acting[key])}`);
    if (acting.tags?.length) fields.push(`vocal events: ${acting.tags.map(visualDirection).join(', ')}`);
    const timing = line.speechStartSeconds == null || line.speechEndSeconds == null
      ? (mode === 'native' ? 'The model paces this line within the shot.' : 'Use the measured speech interval once audio is attached.')
      : `Speech interval ${line.speechStartSeconds}–${line.speechEndSeconds} seconds.`;
    return `Beat ${index + 1} (speaker: ${visualDirection(line.speaker || 'unspecified')}; delivery: ${delivery}): ${mouth} ${includeDialogue && mode === 'native' && delivery !== 'on_screen' ? 'Speak "'+line.text+'". ' : ''}${line.to ? 'Addressed to '+visualDirection(line.to)+'. Preserve the authored crop and any planned eyeline; the addressee need not appear in frame.' : ''} ${fields.join(' ')} ${timing} Anticipation ${line.leadInSeconds || 0} seconds; reaction ${line.tailOutSeconds || 0} seconds.`;
  });
}
function sceneVideoPrompt(performance, mode, scene = {}) {
  const route = !performance.some(event => event.kind !== 'action')
    ? 'This is a silent scene. Perform the ordered visible actions without invented speech or voiceover.'
    : mode === 'native'
    ? 'Speak each authored line in its speaker\'s voice from the quoted words; no audio is supplied. Only on_screen lines move a visible mouth. Keep off_screen speaking faces outside the authored crop and voiceover separate from physical speech. Do not transcribe speech into the image.'
    : mode === 'audio_conditioned'
    ? 'Use the supplied audio as the sole source of spoken words. Synchronize visible mouths only during each on_screen speech interval; follow the delivery instruction for every beat. Do not transcribe speech into the image.'
    : mode === 'post_lipsync'
      ? 'Animate the planned action; the selected post lip-sync adapter supplies mouth synchronization from the original audio.'
      : 'Perform the planned action while the separately supplied voiceover plays; do not turn narration into visible writing.';
  const beats = performanceBeats(performance, mode);
  const visualDirection = value => performance.filter(line => line.kind !== 'action' && line.text).reduce((text,line) => text.split(line.text).join('the supplied speech'), String(value));
  return ['A clean cinematic image with an unobstructed scene and text-free surfaces.', route, visualDirection(sceneDirection(scene, performance)), ...beats, VIDEO_TEXT_POLICY].join('\n');
}
module.exports={estimateSpeechSeconds,estimateSpeech,speechLanguage,actingErrors,resolvedStyle,directionSupport,speechRevisionPayload,VIDEO_TEXT_POLICY,sceneVideoPrompt,planScenePerformance,sceneDirection,scenePerformancePayload,cameraLock,performanceBeats};
