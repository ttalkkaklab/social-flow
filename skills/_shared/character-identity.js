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

// Preserve confirmed attributes, including their original language. Body crops are
// specified by the caller; clothing clauses must not be deleted for naming a body part.
const BODY_FIELDS = ['heightCm', 'weightKg', 'build', 'proportions', 'outfit'];
// The face panel is a neutral identity reference that every shot receives, so a smile written on the
// sheet would be drawn into every shot. Expression belongs to the shot (shot_characters expression).
// ponytail: keyword filter on smile/grin/laugh clauses; widen the list when another expression leaks.
const EXPRESSION = /\b(?:smil|grin|laugh)\w*/i;
function panelPrompt(character, view, { includeOutfit = true } = {}) {
  const physical = character?.physical || {}, skipped = [], expression = [];
  const words = (view === 'face' ? ['appearance'] : BODY_FIELDS).flatMap(key => {
    const field = physical[key];
    if (field?.status !== 'confirmed' || (key === 'outfit' && !includeOutfit)) return [];
    if (key === 'heightCm') return [`${field.value} cm tall`];
    if (key === 'weightKg') return [`about ${field.value} kg`];
    const value = (Array.isArray(field.value) ? field.value.join(', ') : String(field.value)).trim();
    // A standalone crop disclaimer is redundant; an outfit mentioning a hood is not.
    const clauses = view === 'face' ? value.split(/(?<=[.;,])\s+/) : [];
    expression.push(...clauses.filter(clause => EXPRESSION.test(clause)));
    const text = view === 'face' ? clauses.filter(clause => !EXPRESSION.test(clause)).join(' ').replace(/[,;]$/, '.') : value.split(/\s*[,;]\s*/)
      .filter(clause => !/^head not oversized[.!]?$/i.test(clause)).join(', ');
    return text ? [text] : [];
  });
  return { text: words.join('; '), skipped, expression };
}

// The fitting outfit belongs to the turnaround. physical.outfit describes what the character wears in a scene.
function sheetPanelPrompt(character, view, wardrobe, front) {
  if (view === 'face') return panelPrompt(character, view);
  const frontWardrobe = view === 'back' && front?.file ? front.wardrobe ?? 'character' : undefined;
  const unclothed = character.physical?.outfit?.status === 'not_applicable';
  const fitting = (wardrobe ?? frontWardrobe ?? 'fitting') === 'fitting' && !unclothed;
  const words = panelPrompt(character, view, { includeOutfit: !fitting });
  const species = character.identity?.species;
  const clothing = fitting
    ? 'Use a plain opaque fitted T-shirt and short mid-thigh shorts where the anatomy allows. Keep the natural silhouette and limb proportions.'
    : unclothed ? 'Keep the natural body surface and markings unclothed.' : '';
  const selected = fitting ? 'fitting' : 'character';
  const match = frontWardrobe === selected ? 'Match the front panel’s clothing.' : '';
  const description = [species?.status === 'confirmed' && species.value, words.text].filter(Boolean).join('; ').replace(/[.]$/, '');
  return { ...words, text: [description && description + '.', clothing, match].filter(Boolean).join(' '),
    wardrobe: selected };
}

// 등신 (head count): how many of its own head heights the standing figure is tall. The face panel is an
// enlarged close-up and the body panels have no head, so this count is the only thing on the sheet that sizes
// one against the other. It is read from the proportions words ("7.5 heads tall", "seven and a half heads", "3등신");
// nothing is inferred from age, species or style. A wrong count is worse than none, so a number tied to height
// wins, a bare "N heads" counts only when no width or length follows it, and a range or two different counts
// read as no count (reported, never guessed).
const HEADS = String.raw`(?<![\d.])(?<!\d\s*(?:[-–~]|to)\s*)(\d+(?:\.\d+)?)(?:\s+(\d)\/(\d))?[\s-]*`;
const HEIGHT_COUNT = new RegExp(HEADS + String.raw`(?:heads?[\s-]+(?:tall|high)\b|head[\s-]heights?\b|등신|頭身)`, 'gi');
const BARE_COUNT = new RegExp(HEADS + String.raw`(?:heads\b(?![\s-]*(?:wide|long|broad|across|deep|thick|taller|shorter|higher|lower|above|below|more|less))|(?<=-)head\b(?![-\w]))`, 'gi');
// Real sheets spell the count out ("about seven and a half heads tall", "two-head silhouette").
const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const inDigits = text => text.replace(new RegExp(String.raw`\b(?:${NUMBER_WORDS.join('|')})\b`, 'gi'), word => NUMBER_WORDS.indexOf(word.toLowerCase()))
  .replace(/(\d+)[\s-]+and[\s-]+a[\s-]+half\b/gi, '$1.5');
function headsTall(character) {
  const field = character?.physical?.proportions;
  if (field?.status !== 'confirmed') return null;
  const words = inDigits(String(field.value));
  const read = pattern => [...new Set([...words.matchAll(pattern)].map(found => Number(found[1]) + (found[2] ? found[2] / found[3] : 0)))];
  const tall = read(HEIGHT_COUNT), counts = tall.length ? tall : read(BARE_COUNT);
  const count = counts.length === 1 ? counts[0] : NaN;
  // ponytail: 1.5–12 is our sanity range for a typo, not a researched limit; widen it when a real sheet needs to.
  return count >= 1.5 && count <= 12 ? count : null;
}
// Shape words by head count: [counts below this, words]. Geometry only — the head against the body first, then a
// neck, torso or leg cue where a source ties one to that count — and no age or style label (chibi, child, heroic),
// which would change the character's apparent age or fight the style preset. The rows at 1.5–2, 3, 7.5 and 8 heads
// follow the pages read in docs/research/2026-11-21-head-body-proportion; 8.5 and 9 take their count from those
// pages and their leg words from us; 2.5 and 4–7 are our interpolation. None is measured on our models.
// ponytail: one row per count, picked by count alone; pick by the sheet's build too if rows start contradicting sheets.
const HEAD_SHAPES = [
  [1.75, 'a huge head taller than the whole body below it, little or no neck, a tiny body with plump simplified hands and feet'],
  [2.25, 'a huge head about as tall as the whole body below it, little or no neck, a small rounded torso, short limbs'],
  [2.75, 'a very large head, a very short neck, a small rounded torso and short limbs'],
  [3.5, 'a very large head about a third of the height, a short slim neck, a small torso and short legs'],
  [4.5, 'a large head about a quarter of the height, a short torso and short legs'],
  [5.5, 'a large head on a compact body, the legs clearly shorter than half the height'],
  [6.5, 'a slightly large head, the legs a little under half the height'],
  [7.25, 'a small head, the legs just under half the height'],
  [7.75, 'a small head, the legs half the standing height'],
  [8.25, 'a small head, a torso three heads long and legs four heads long'],
  [8.75, 'a small head on a tall body, the legs a little over half the height'],
  [Infinity, 'a very small head on a tall body, the legs well over half the height'],
];
// The sentence a picture that joins the face panel to the headless body needs. A bare head count moved nothing in
// the one published test, so the count comes with plain shape words and the head as a length.
function headRatio(character, name) {
  const count = headsTall(character);
  if (!count) return { headsTall: null, text: '' };
  const shape = HEAD_SHAPES.find(([below]) => count < below)[1];
  const height = character.physical.heightCm, cm = height?.status === 'confirmed' ? height.value : null;
  const num = value => String(Number(value.toFixed(1)));
  const head = cm ? `about ${num(cm / count)} cm of the ${cm} cm standing height` : `one part in ${num(count)} of the standing height`;
  return { headsTall: count, text: `${name} is ${num(count)} heads tall: ${shape}; the head (crown to chin) is ${head}.` };
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
    const options = { ready: !isVoiceOnly(win, c.id) };
    const issues = identityErrors(c?.character, options);
    errors.push(...issues.map(e => `Character ${c?.id}: ${e}`));
    if (!issues.length && Object.entries(direction(c.character, options)).some(([key, value]) => c.direction?.[key] !== value)) errors.push(`Character ${c.id}: direction does not match structured identity; regenerate handoff`);
    if (!/^[a-f0-9]{64}$/.test(c?.identitySha256 || '')) errors.push(`Character ${c?.id}: identitySha256 is required`);
  }
  return errors;
}

function isVoiceOnly(win, id) {
  const entries = win?.SB_DOC?.characters;
  const character = Array.isArray(entries) ? entries.find(c => c.id === id) : entries?.[id];
  return character?.voiceOnly === true && !(win.SCENES || []).some(s => {
    const cast = s.visual?.character;
    return (Array.isArray(cast) ? cast : cast ? [cast] : []).some(c => (typeof c === 'string' ? c : c?.id) === id);
  });
}

module.exports = { GROUPS, REQUIRED, identityErrors, identityCharacter, direction, panelPrompt, sheetPanelPrompt, headsTall, headRatio, boardIdentityErrors, requiresSpeech, isVoiceOnly };
