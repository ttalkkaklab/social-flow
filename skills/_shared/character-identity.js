'use strict';

// One field catalog drives validation, review HTML and generation handoffs.
// Tuple: [key, ko, en, type]. The sheet's top block (REQUIRED) must be present;
// every other field is optional and may be omitted, pending or not_applicable.
const GROUPS = [
  ['identity', '기본 설정', 'Identity', [
    ['gender', '성별', 'Gender'], ['species', '종족 · 유형', 'Species / type'], ['age', '나이 · 연령대', 'Age'],
    ['role', '역할', 'Role'], ['summary', '한 줄 소개', 'Summary'],
  ]],
  ['physical', '신체와 외형', 'Body and appearance', [
    ['heightCm', '키 (cm)', 'Height (cm)', 'number'], ['weightKg', '몸무게 (kg)', 'Weight (kg)', 'number'],
    ['relativeScale', '상대 크기', 'Relative scale'], ['build', '체형', 'Build'],
    ['proportions', '등신 · 비율', 'Proportions'], ['appearance', '색 · 재질 · 식별 특징', 'Colors, materials and landmarks'],
    ['outfit', '기본 의상', 'Default outfit'], ['props', '대표 소품', 'Props', 'list'],
  ]],
  ['personality', '성격과 동기', 'Personality and motivation', [
    ['traits', '성향', 'Traits', 'list'],
    ['goal', '목표', 'Goal'], ['motivation', '동기', 'Motivation'], ['flaw', '약점', 'Flaw'], ['fear', '두려움', 'Fear'],
  ]],
  ['speech', '말투와 음성 연기', 'Speech and voice direction', [
    ['register', '존댓말 · 반말', 'Register'], ['vocabulary', '어휘 · 문장 길이', 'Vocabulary and sentence length'],
    ['habits', '말버릇', 'Speech habits'], ['avoid', '피하는 표현', 'Avoided expressions', 'list'],
    ['examples', '예시 대사', 'Example dialogue', 'list'], ['timbre', '음색 · 높낮이', 'Timbre / pitch'],
    ['pace', '속도', 'Pace'], ['accent', '억양', 'Accent'],
    ['emotion', '감정별 음성 변화', 'Emotional delivery'],
  ]],
  ['acting', '표정과 동작', 'Expressions and movement', [
    ['baseline', '기본 표정 · 자세', 'Default expression / posture'], ['reactions', '감정별 반응', 'Emotional reactions', 'list'],
    ['movement', '걸음걸이 · 몸짓', 'Gait / gestures'],
  ]],
  ['story', '관계와 배경', 'Relationships and background', [
    ['relationships', '관계 · 호칭 · 태도', 'Relationships, address and attitude', 'list'],
    ['background', '배경', 'Background'], ['past', '과거', 'Past'],
    ['arc', '성장 · 변화', 'Character arc'],
  ]],
  ['continuity', '설정 유지', 'Continuity', [
    ['invariants', '변경 금지 특징', 'Invariants', 'list'],
    ['variants', '허용하는 변형', 'Allowed variants', 'list'],
  ]],
];
// The required basics; the name is the identity.md `# Name` heading.
const REQUIRED = { identity: ['gender', 'species', 'age', 'role', 'summary'], physical: ['heightCm'] };
const required = (group, key) => (REQUIRED[group] || []).includes(key);
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = v => typeof v === 'string' && v.trim().length > 0 && v.length <= 2000;
const placeholder = v => typeof v === 'string' && /^(?:tbd|todo|unknown|미정|추후|<[^>]+>|\{\{.*\}\})$/i.test(v.trim());

function identityErrors(character, { ready = true } = {}) {
  if (!object(character)) return ['character: structured identity is required (migrate legacy identity.md explicitly)'];
  const errors = [];
  if (character.schemaVersion !== 1) errors.push('character.schemaVersion must be 1');
  if (!Number.isInteger(character.version) || character.version < 1) errors.push('character.version must be a positive integer');
  for (const key of Object.keys(character)) if (!['schemaVersion', 'version', ...GROUPS.map(g => g[0])].includes(key)) errors.push(`character.${key}: unknown field`);
  for (const [group, , , fields] of GROUPS) {
    if (character[group] === undefined && !REQUIRED[group]) continue;
    if (!object(character[group])) { errors.push(`character.${group}: required group`); continue; }
    for (const key of Object.keys(character[group])) if (!fields.some(f => f[0] === key)) errors.push(`${group}.${key}: unknown field`);
    for (const [key, , , type = 'text'] of fields) {
      const p = `${group}.${key}`, f = character[group][key], must = required(group, key);
      if (f === undefined && !must) continue;
      if (!object(f)) { errors.push(`${p}: expected {status, value, reason?}`); continue; }
      for (const k of Object.keys(f)) if (!['status', 'value', 'reason'].includes(k)) errors.push(`${p}.${k}: unknown field`);
      if (!['confirmed', 'pending', 'not_applicable'].includes(f.status)) { errors.push(`${p}: invalid status`); continue; }
      if (f.status !== 'confirmed') {
        if (f.value !== null || !text(f.reason)) errors.push(`${p}: unresolved or inapplicable fields need value:null and a reason`);
        if (f.status === 'pending' && ready && must) errors.push(`${p}: pending`);
        if (f.status === 'not_applicable' && must) errors.push(`${p}: required basic field cannot be not_applicable`);
        continue;
      }
      const valid = type === 'number' ? typeof f.value === 'number' && Number.isFinite(f.value) && f.value > 0
        : type === 'list' ? Array.isArray(f.value) && f.value.length > 0 && f.value.length <= 20 && f.value.every(v => text(v) && !placeholder(v))
          : text(f.value) && !placeholder(f.value);
      if (!valid) errors.push(`${p}: expected ${type === 'number' ? 'a positive finite number' : type}, without placeholders`);
      if (f.reason !== undefined && !text(f.reason)) errors.push(`${p}: reason must be nonempty text`);
    }
  }
  return errors;
}

function identityCharacter(source, options) {
  const values = [];
  for (const m of source.matchAll(/```json\s*\n([\s\S]*?)```/g)) {
    let v;
    try { v = JSON.parse(m[1]); } catch { throw new Error('Invalid JSON in character identity'); }
    if (object(v) && Object.hasOwn(v, 'character')) values.push(v.character);
  }
  if (values.length !== 1) throw new Error('identity.md must contain exactly one JSON block with character');
  const errors = identityErrors(values[0], options);
  if (errors.length) throw new Error(errors.join('; '));
  return values[0];
}

function direction(character, options) {
  const errors = identityErrors(character, options);
  if (errors.length) throw new Error(errors.join('; '));
  const lines = groups => GROUPS.filter(g => groups.includes(g[0])).flatMap(([group, , , fields]) => fields.flatMap(([key, , label]) => {
    const field = character[group]?.[key];
    return field?.status === 'confirmed' ? [`${label}: ${Array.isArray(field.value) ? field.value.join('; ') : field.value}`] : [];
  })).join('\n');
  return {
    image: lines(['identity', 'physical', 'continuity']),
    video: lines(['physical', 'personality', 'acting', 'continuity']),
    dialogue: lines(['identity', 'personality', 'speech', 'story']),
    voice: lines(['speech']),
  };
}

// The English prompt words for one sheet panel. The face close-up carries the head (appearance);
// the headless front and back carry the body: height, weight, build, proportions, outfit.
// Image prompts are English, so a text value in another script is named in `skipped`, not sent.
// A headless panel never names the head: relativeScale ("measured to the top of the head; ears not
// included") and clauses such as "head not oversized" drew a head and ears back onto the body panels.
const BODY_FIELDS = ['heightCm', 'weightKg', 'build', 'proportions', 'outfit'];
const HEAD_WORDS = /\b(head|face|hair|ears?|eyes?|tusks?|helmet)\b/i;
function panelPrompt(character, view) {
  const physical = character?.physical || {}, skipped = [];
  const words = (view === 'face' ? ['appearance'] : BODY_FIELDS).flatMap(key => {
    const field = physical[key];
    if (field?.status !== 'confirmed') return [];
    if (key === 'heightCm') return [`${field.value} cm tall`];
    if (key === 'weightKg') return [`about ${field.value} kg`];
    const value = (Array.isArray(field.value) ? field.value.join(', ') : String(field.value)).trim();
    if (/[^\P{L}\p{Script=Latin}]/u.test(value)) { skipped.push(`physical.${key}`); return []; }
    if (view === 'face') return [value];
    const body = value.split(/\s*[,;]\s*/).filter(clause => clause && !HEAD_WORDS.test(clause)).join(', ');
    return body ? [body] : [];
  });
  return { text: words.join('; '), skipped };
}

function requiresSpeech(win, id) {
  if (win?.STORY?.version !== 'story-v2' || !Array.isArray(win.SCENES)) return true;
  return win.SCENES.some(s => Array.isArray(s?.narration) && s.narration.some(n =>
    typeof n?.tts === 'string' && n.tts.trim() && (!n.speaker || n.speaker === id)));
}

function boardIdentityErrors(win) {
  const entries = win?.SB_DOC?.characters;
  const chars = Array.isArray(entries) ? entries : Object.entries(entries || {}).map(([id, c]) => ({ ...c, id }));
  const required = win?.SB_DOC?.characterSchemaVersion === 1;
  const errors = [];
  if (win?.SB_DOC?.characterSchemaVersion !== undefined && !required) errors.push('Unsupported SB_DOC.characterSchemaVersion');
  for (const c of chars) {
    if (!required && c?.character === undefined) continue; // Legacy boards remain readable.
    const issues = identityErrors(c?.character);
    errors.push(...issues.map(e => `Character ${c?.id}: ${e}`));
    if (!issues.length && Object.entries(direction(c.character)).some(([key, value]) => c.direction?.[key] !== value)) errors.push(`Character ${c.id}: direction does not match structured identity; regenerate handoff`);
    if (!/^[a-f0-9]{64}$/.test(c?.identitySha256 || '')) errors.push(`Character ${c?.id}: identitySha256 is required`);
  }
  return errors;
}

module.exports = { GROUPS, REQUIRED, identityErrors, identityCharacter, direction, panelPrompt, boardIdentityErrors, requiresSpeech };
