import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { manageCharacter } from '../dist/character-manage.js';
import { TOOLS } from '../dist/tools.js';
import { ROUTES } from '../dist/handlers.js';

const channel = (t) => {
  const root = mkdtempSync(join(tmpdir(), 'sf-character-manage-')), dir = join(root, 'ch');
  mkdirSync(dir); writeFileSync(join(dir, 'profile.md'), '# Channel');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return join(dir, 'assets/characters/mina/identity.md');
};
const basics = { name: '미나', gender: '여성', species: '인간', age: '20대 후반', role: '주인공', summary: '작은 서점을 지키는 주인', heightCm: 165 };
const block = (file) => JSON.parse(readFileSync(file, 'utf8').match(/```json\s*\n([\s\S]*?)```/)[1]);

test('the basics are required arguments and every other catalog field is an optional one', () => {
  const schema = TOOLS.find((tool) => tool.name === 'character_manage').inputSchema;
  assert.deepEqual(schema.required, ['identityPath', 'name', 'gender', 'species', 'age', 'role', 'summary', 'heightCm']);
  assert.ok(ROUTES.character_manage);
  const fields = schema.properties.fields.properties;
  assert.equal(fields.identity, undefined);
  assert.deepEqual(Object.keys(fields.physical.properties).includes('heightCm'), false);
  assert.ok(fields.personality.properties.motivation && fields.story.properties.past);
});

test('basics alone create a valid draft, and the result lists the missing panels and voice', (t) => {
  const file = channel(t);
  const result = manageCharacter({ identityPath: file, ...basics, age: { status: 'pending', reason: '나이를 아직 정하지 않았다.' } });
  assert.equal(result.created, true); assert.equal(result.version, 1);
  assert.deepEqual(result.missing, { basics: ['identity.age'], images: ['face', 'front', 'back'], voice: 'missing' });
  const doc = block(file);
  assert.equal(doc.tts, null);
  assert.deepEqual(Object.keys(doc.character).sort(), ['identity', 'physical', 'schemaVersion', 'version']);
  assert.match(readFileSync(file, 'utf8'), /^# 미나\n/);
  assert.ok(existsSync(result.sheet.path));
  assert.ok(result.sheet.warnings.some((w) => w.includes('identity.age')));
});

test('an update merges optional fields, removes a null one and keeps tts and prose', (t) => {
  const file = channel(t);
  manageCharacter({ identityPath: file, ...basics, fields: { story: { past: '서점을 물려받았다.' }, personality: { traits: ['신중함'] } } });
  const doc = block(file); doc.tts = { engine: 'gemini', voiceId: 'Kore', language: 'ko', speed: 1 };
  writeFileSync(file, readFileSync(file, 'utf8').replace(/```json[\s\S]*?```/, '```json\n' + JSON.stringify(doc, null, 2) + '\n```') + '\n메모: 손님 이름을 잘 기억한다.\n');
  const result = manageCharacter({ identityPath: file, ...basics, name: '한미나', fields: { story: { past: null }, speech: { accent: { status: 'not_applicable', reason: '따로 정한 억양이 없다.' } } } });
  const next = block(file);
  assert.equal(result.version, 2); assert.equal(result.missing.voice, 'selected');
  assert.deepEqual(next.tts, doc.tts);
  assert.equal(next.character.story, undefined, 'an emptied optional group is dropped');
  assert.deepEqual(next.character.personality.traits.value, ['신중함']);
  assert.equal(next.character.speech.accent.status, 'not_applicable');
  assert.match(readFileSync(file, 'utf8'), /^# 한미나\n[\s\S]*메모: 손님 이름을 잘 기억한다\./);
});

test('a basic passed as a field, an unknown field, a bad path or a legacy file is refused without writing', (t) => {
  const file = channel(t);
  assert.throws(() => manageCharacter({ identityPath: file, ...basics, fields: { identity: { gender: '남성' } } }), /character_field_basic/);
  assert.throws(() => manageCharacter({ identityPath: file, ...basics, fields: { story: { secret: 'x' } } }), /character_field_unknown/);
  assert.throws(() => manageCharacter({ identityPath: file, ...basics, fields: { story: { past: 'TBD' } } }), /character_identity_invalid/);
  assert.equal(existsSync(file), false);
  const { gender, ...noGender } = basics;
  assert.throws(() => manageCharacter({ identityPath: file, ...noGender }));
  assert.throws(() => manageCharacter({ identityPath: join(file, '../../mina.md'), ...basics }), /character_path_invalid/);
  mkdirSync(join(file, '..'), { recursive: true }); writeFileSync(file, '# 미나\n\n오래된 설명');
  assert.throws(() => manageCharacter({ identityPath: file, ...basics }), /character_identity_legacy/);
  assert.equal(readFileSync(file, 'utf8'), '# 미나\n\n오래된 설명');
});
