import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { characterVoiceTarget, compareVoiceMetadata } from '../dist/voice-target.js';
const source = readFileSync(new URL('../../skills/channel/references/character-identity-example.md', import.meta.url), 'utf8');
const doc = () => JSON.parse(source.match(/```json\s*\n([\s\S]*?)```/)[1]);
const markdown = value => '# Character\n\n```json\n' + JSON.stringify(value) + '\n```';

test('confirmed voice targets carry age and acoustic fields without turning biography into controls', () => {
  const first = characterVoiceTarget(source);
  assert.equal(first.vocalGender, 'male');
  assert.match(first.perceivedAge, /24세|24/);
  assert.doesNotMatch(first.baselineDirection,/Voice age|Vocal gender|Timbre:/);
  assert.ok(first.traits.length);
  assert.doesNotMatch(first.baselineDirection, /Goal|Backstory|Traits|Fear/);
  const changed = doc(); changed.character.identity.age.value = '70세';
  assert.notEqual(characterVoiceTarget(markdown(changed)).perceivedAge,first.perceivedAge);
  assert.equal(characterVoiceTarget(markdown(changed)).baselineDirection,first.baselineDirection,'immutable age belongs to casting, not delivery style');
  changed.character.speech.timbre.value = '낮고 선명한 여성 중음';
  assert.equal(characterVoiceTarget(markdown(changed)).vocalGender,'female','a voice-specific timbre outranks identity.gender');
  changed.character.speech.timbre.value = '부드러운 중음'; changed.character.identity.gender.value = '여성';
  const stated = characterVoiceTarget(markdown(changed));
  assert.equal(stated.vocalGender,'female'); assert.equal(stated.sources.vocalGender,'character.identity.gender');
  const missing = characterVoiceTarget('```json\n{"character":{"name":"Mrs. Smith"}}\n```');
  assert.equal(missing.vocalGender,'unspecified');
  assert.ok(missing.warnings.length);
  assert.equal(characterVoiceTarget(source,{vocalGender:'neutral'}).vocalGender,'neutral');
  for (const timbre of ['not female; androgynous','여성적이지 않은 중성 음색']) {
    const ambiguous=doc();ambiguous.character.speech.timbre.value=timbre;
    assert.equal(characterVoiceTarget(markdown(ambiguous)).vocalGender,'unspecified');
  }
});

test('provider comparisons distinguish known conflicts from missing metadata', () => {
  const target = characterVoiceTarget(source);
  assert.ok(compareVoiceMetadata(target).unknown.length);
  const conflict = compareVoiceMetadata(target,{voiceId:'Kore',source:'gemini-library',retrievedAt:new Date().toISOString(),gender:'female',description:'70-year-old narrator'});
  assert.equal(conflict.conflicts.length,2);
  const match = compareVoiceMetadata(target,{voiceId:'Kore',source:'gemini-library',retrievedAt:new Date().toISOString(),gender:'male',description:'28-year-old actor'});
  assert.deepEqual(match.matched,['vocalGender','ageDescriptionProximity']);
  assert.ok(match.unknown.some(value=>/actual audio/.test(value)));
  for (const [wanted,reported] of [[8,18],[14,24],[59,69]]) {
    const comparison=compareVoiceMetadata({...target,perceivedAge:`${wanted}세`},{voiceId:'Kore',source:'gemini-library',retrievedAt:new Date().toISOString(),age:`${reported}세`});
    assert.equal(comparison.matched.includes('ageDescriptionProximity'),false);
    assert.ok(comparison.conflicts.length);
  }
});
