'use strict';

// Casting evidence is separate from the compact controls a synthesizer accepts.
function characterVoiceTarget(source, override = {}) {
  const blocks = [...source.matchAll(/```json\s*\n([\s\S]*?)```/g)].map(m => JSON.parse(m[1]));
  const identities = blocks.filter(value => value && typeof value.character === 'object' && value.character);
  if (identities.length !== 1) throw new Error('identity.md needs exactly one character JSON block');
  const document = identities[0], character = document.character;
  const value = (group, key) => character[group]?.[key]?.status === 'confirmed' ? character[group][key].value : undefined;
  const profile = { ...document.voiceProfile, ...override };
  const timbre = value('speech', 'timbre');
  const genderText = typeof timbre === 'string' ? timbre : '';
  const female = /여성|여자|\bfemale\b|\bfeminine\b/i.test(genderText);
  const male = /남성|남자|\bmale\b|\bmasculine\b/i.test(genderText);
  const qualifiedGender = /\b(?:not|non|neither|without|no)[ -]+(?:a\s+)?(?:female|male|feminine|masculine)\b|(?:여성|남성|여자|남자)(?:적)?(?:이)?지\s*않|(?:여성|남성|여자|남자)[^.;。]{0,12}(?:아닌|아니다)|중성|성별\s*중립|androgynous|gender[ -]neutral/i.test(genderText);
  const derivedGender = female !== male && !qualifiedGender;
  // The required identity.gender is an explicit statement, unlike a name or appearance; a voice-specific timbre, including an explicitly neutral one, still wins.
  const stated = { 여성: 'female', 여자: 'female', female: 'female', 남성: 'male', 남자: 'male', male: 'male' }[String(value('identity', 'gender') || '').trim().toLowerCase()];
  const vocalGender = profile.vocalGender || (derivedGender ? (female ? 'female' : 'male') : !qualifiedGender && stated || 'unspecified');
  const age = profile.perceivedAge || value('identity', 'age');
  const pace = [value('speech', 'pace'), value('speech', 'accent')].filter(Boolean).join(' ') || undefined;
  const register = value('speech', 'register'), habits = value('speech', 'habits');
  const baselineDirection = profile.baselineDirection || [
    pace && `Phrasing: ${pace}`, register && `Register: ${register}`,
    habits && habits !== register && `Speech habit: ${habits}`,
  ].filter(Boolean).join('\n');
  // The body behind the voice — species, height, weight, build — is casting evidence for the base
  // voice (size and resonance), like age and gender; it never becomes a delivery control.
  const height = value('physical', 'heightCm'), weight = value('physical', 'weightKg');
  const body = [value('identity', 'species'), height && `${height} cm`, weight && `about ${weight} kg`, value('physical', 'build')].filter(Boolean).join(', ');
  return {
    vocalGender, perceivedAge: age || null, timbre: timbre || null, body: body || null, pace: pace || null,
    register: register || null, traits: value('personality', 'traits') || [],
    habits: value('speech', 'habits') || null, emotionalRange: value('speech', 'emotion') || null,
    baselineDirection,
    sources: { vocalGender: profile.vocalGender ? 'voiceProfile.vocalGender' : derivedGender ? 'character.speech.timbre' : !qualifiedGender && stated ? 'character.identity.gender' : null,
      perceivedAge: profile.perceivedAge ? 'voiceProfile.perceivedAge' : age ? 'character.identity.age' : null,
      body: body ? 'character.identity.species and physical height, weight and build' : null,
      baselineDirection: profile.baselineDirection ? 'voiceProfile.baselineDirection' : 'confirmed speech pace, accent, register and habits' },
    warnings: [
      'Age, vocal gender and stable timbre are casting constraints. Match the base voice or use tts_voice_design to create/remix it; Gemini 3.8 turn style cannot change immutable speaker traits; Voice Design is a separate identity creation API.',
      ...(vocalGender === 'unspecified' ? ['Vocal gender is unspecified; do not infer it from a name, role or appearance.'] : []),
      ...(!age ? ['Perceived voice age is unspecified.'] : []),
      ...(!timbre ? ['Vocal timbre is unspecified.'] : []),
      ...(baselineDirection.length > 400 ? ['Derived voice direction exceeds 400 characters. Author a compact voiceProfile.baselineDirection; do not truncate identity evidence.'] : []),
    ],
  };
}

function compareVoiceMetadata(target, metadata) {
  const matched = [], conflicts = [], unknown = [];
  if (!metadata) return { matched, conflicts, unknown: ['No provider voice metadata supplied; character fit is unverified.'] };
  if (target.vocalGender !== 'unspecified') {
    const gender = String(metadata.gender || '').toLowerCase();
    if (!gender) unknown.push('Provider does not report vocal gender.');
    else if (gender === target.vocalGender) matched.push('vocalGender');
    else conflicts.push(`Vocal gender: target ${target.vocalGender}, provider ${gender}.`);
  }
  const numericAge = text => /(?:^|\s)(\d{1,3})(?:[ -]*(?:세|years? old|year-old|살)|$)/i.exec(String(text || ''))?.[1];
  const expectedAge = numericAge(target.perceivedAge), actualAge = numericAge(metadata.age || metadata.description);
  if (expectedAge && actualAge) {
    const band = age => age < 18 ? 'minor' : age >= 65 ? 'senior' : 'adult';
    if (band(Number(expectedAge)) === band(Number(actualAge)) && Math.abs(Number(expectedAge) - Number(actualAge)) <= 10) matched.push('ageDescriptionProximity');
    else conflicts.push(`Age description: target ${expectedAge}, provider ${actualAge}; audition actual age impression.`);
  } else if (target.perceivedAge) unknown.push('Provider does not establish an age match.');
  unknown.push('Timbre, personality and native delivery require actual audio; metadata is not listening evidence.');
  return { matched, conflicts, unknown };
}

module.exports = { characterVoiceTarget, compareVoiceMetadata };
