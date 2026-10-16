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
  return direction.length ? direction.join('\n') : acting?.tags?.length ? undefined : voice?.stylePrompt?.trim();
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
  const supported=!stylePrompt || (voice?.engine==='gemini' && (!gemini38 || stylePrompt.length<=500));
  return {stylePrompt,supported,warnings:supported?[]:[gemini38?'Resolved acting exceeds the Gemini 3.8 turn style limit of 500 characters; shorten it before generation.':`The selected ${voice?.engine} adapter cannot carry free-text acting direction; review delivery or explicitly choose a capable adapter.`]};
}
// Omit absent acting to retain revisions of existing episodes byte-for-byte.
function speechRevisionPayload(line, voice) {
  return {tts:line.tts,sub:line.sub,speaker:line.speaker,delivery:line.delivery,voice,...(line.acting!=null?{acting:line.acting}:{})};
}
const VIDEO_TEXT_POLICY = 'Keep the entire video image text-free: no subtitles, captions, dialogue text, typography, letters, logos or watermarks, including during speech.';
function sceneVideoPrompt(performance, mode) {
  const route = mode === 'audio_conditioned'
    ? 'Use the supplied audio as the sole source of spoken words. Synchronize visible mouths only during each on_screen speech interval; follow the delivery instruction for every beat. Do not transcribe speech into the image.'
    : mode === 'post_lipsync'
      ? 'Animate the planned action; the selected post lip-sync adapter supplies mouth synchronization from the original audio.'
      : 'Perform the planned action while the separately supplied voiceover plays; do not turn narration into visible writing.';
  const dialogue = performance.map(line => line.text).filter(text => typeof text === 'string' && text.length);
  const visualDirection = value => {
    let text = String(value);
    for (const words of dialogue) text = text.split(words).join('the supplied speech');
    return text;
  };
  const beats = performance.map((line, index) => {
    const acting = line.acting || {};
    const delivery = line.delivery || 'voiceover';
    const mouth = delivery === 'on_screen'
      ? 'Show this speaker physically speaking; synchronize only this speaker\'s mouth to their supplied audio during this interval using the selected synchronization route.'
      : delivery === 'off_screen'
        ? 'This speaker stays off screen. All visible mouths stay closed during this interval; show the planned listener reaction or action.'
        : 'This is voiceover or narration, not visible physical speech. All visible mouths stay closed during this interval; show the planned action.';
    const fields = ['direction', 'context', 'intent', 'emotion', 'vocal', 'visual'].filter(key => acting[key])
      .map(key => `${key}: ${visualDirection(acting[key])}`);
    if (acting.tags?.length) fields.push(`vocal events: ${acting.tags.map(visualDirection).join(', ')}`);
    const timing = line.speechStartSeconds == null || line.speechEndSeconds == null
      ? 'Use the measured speech interval once audio is attached.'
      : `Speech interval ${line.speechStartSeconds}–${line.speechEndSeconds} seconds.`;
    return `Beat ${index + 1} (speaker: ${visualDirection(line.speaker || 'unspecified')}; delivery: ${delivery}): ${mouth} ${fields.join(' ')} ${timing} Anticipation ${line.leadInSeconds || 0} seconds; reaction ${line.tailOutSeconds || 0} seconds.`;
  });
  return ['A clean cinematic image with an unobstructed scene and text-free surfaces.', route, ...beats, VIDEO_TEXT_POLICY].join('\n');
}
module.exports={actingErrors,resolvedStyle,directionSupport,speechRevisionPayload,VIDEO_TEXT_POLICY,sceneVideoPrompt};
