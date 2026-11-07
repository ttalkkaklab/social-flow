/**
 * character_manage — writes a shared character's identity.md: the sheet's basics are required
 * arguments, every other catalog field is optional. The tts block, voice records and prose stay.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { z } from 'zod';

const load = createRequire(import.meta.url);
type Field = { status: 'confirmed' | 'pending' | 'not_applicable'; value: unknown; reason?: string };
type Group = [string, string, string, [string, string, string, string?][]];
const catalog = () => load('../../skills/_shared/character-identity.js') as {
  GROUPS: Group[]; REQUIRED: Record<string, string[]>;
  identityErrors(character: unknown, options?: { ready?: boolean }): string[];
};

const pending = z.object({ status: z.literal('pending'), reason: z.string().trim().min(1).max(2000) }).strict();
const basic = z.union([z.string().trim().min(1).max(2000), pending]);
const field = z.union([
  z.string().trim().min(1).max(2000),
  z.array(z.string().trim().min(1).max(2000)).min(1).max(20),
  z.number().positive().finite(),
  z.object({ status: z.enum(['pending', 'not_applicable']), reason: z.string().trim().min(1).max(2000) }).strict(),
  z.null(),
]);
export const characterManageSchema = z.object({
  identityPath: z.string().min(1),
  name: z.string().trim().min(1).max(200),
  gender: basic, species: basic, age: basic, role: basic, summary: basic,
  heightCm: z.union([z.number().positive().finite(), pending]),
  fields: z.record(z.string(), z.record(z.string(), field)).optional(),
}).strict();
export type CharacterManageInput = z.infer<typeof characterManageSchema>;

const toField = (value: unknown): Field => value !== null && typeof value === 'object' && !Array.isArray(value)
  ? { ...(value as { status: Field['status']; reason: string }), value: null }
  : { status: 'confirmed', value };

const JSON_BLOCK = /```json\s*\n([\s\S]*?)```/g;

/** Create or update identity.md, then refresh the channel's character sheets. */
export function manageCharacter(raw: unknown) {
  const args = characterManageSchema.parse(raw);
  const file = path.resolve(args.identityPath);
  const folder = path.dirname(file), id = path.basename(folder);
  if (path.basename(file) !== 'identity.md' || path.basename(path.dirname(folder)) !== 'characters' || path.basename(path.dirname(path.dirname(folder))) !== 'assets')
    throw new Error('character_path_invalid: identityPath must be <channel>/assets/characters/<id>/identity.md');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new Error('character_path_invalid: the character folder needs a kebab-case id');
  const { GROUPS, REQUIRED, identityErrors } = catalog();

  const created = !existsSync(file);
  let source = created ? `# ${args.name}\n\n\`\`\`json\n{}\n\`\`\`\n` : readFileSync(file, 'utf8');
  const blocks = [...source.matchAll(JSON_BLOCK)].filter(m => { try { return created || Object.hasOwn(JSON.parse(m[1]), 'character'); } catch { return false; } });
  if (blocks.length !== 1) throw new Error('character_identity_legacy: identity.md needs exactly one JSON block with character; migrate it explicitly before writing');
  const block = blocks[0];
  const doc = created ? { character: { schemaVersion: 1, version: 0 }, tts: null } : JSON.parse(block[1]);
  const character = doc.character as Record<string, unknown> & { version: number };

  const set = (group: string, key: string, value: unknown) => {
    const target = (character[group] ??= {}) as Record<string, Field>;
    if (value === null) delete target[key]; else target[key] = toField(value);
  };
  for (const key of REQUIRED.identity) set('identity', key, args[key as 'gender']);
  set('physical', 'heightCm', args.heightCm);
  for (const [group, values] of Object.entries(args.fields ?? {})) {
    const fields = GROUPS.find(g => g[0] === group)?.[3];
    if (!fields) throw new Error(`character_field_unknown: ${group} is not a catalog group`);
    for (const [key, value] of Object.entries(values)) {
      if (!fields.some(f => f[0] === key)) throw new Error(`character_field_unknown: ${group}.${key} is not in the catalog`);
      if (REQUIRED[group]?.includes(key)) throw new Error(`character_field_basic: ${group}.${key} is a required argument, not an optional field`);
      set(group, key, value);
    }
  }
  for (const [group] of GROUPS) if (!REQUIRED[group] && character[group] && !Object.keys(character[group] as object).length) delete character[group];
  character.version += 1;

  const errors = identityErrors(character, { ready: false });
  if (errors.length) throw new Error('character_identity_invalid: ' + errors.join('; '));
  const start = block.index! + block[0].indexOf(block[1]);
  source = source.slice(0, start) + JSON.stringify(doc, null, 2) + '\n' + source.slice(start + block[1].length);
  source = /^#\s+.+$/m.test(source) ? source.replace(/^#\s+.+$/m, () => `# ${args.name}`) : `# ${args.name}\n\n${source}`;
  mkdirSync(folder, { recursive: true });
  writeFileSync(file, source);

  // What the sheet still needs before production: the pending basics, the three panels and the voice.
  const basics = [...REQUIRED.identity.map(k => ['identity', k]), ['physical', 'heightCm']]
    .filter(([g, k]) => ((character[g] as Record<string, Field>)[k]).status === 'pending').map(([g, k]) => `${g}.${k}`);
  const { inspectPanels } = load('../../skills/channel/references/character-panels.js') as { inspectPanels(folder: string): { slots: Record<string, string> } };
  const images = ['face', 'front', 'back'].filter(view => !inspectPanels(folder).slots[view]);
  let voice: 'selected' | 'missing' | 'invalid' = 'missing';
  try { voice = (load('../../skills/_shared/character-voice.js') as { identityVoice(s: string, o: { optional: boolean }): unknown }).identityVoice(source, { optional: true }) ? 'selected' : 'missing'; }
  catch { voice = 'invalid'; }

  const channel = path.resolve(folder, '../../..');
  let sheet: { path: string; warnings: string[] } | { error: string };
  try {
    const result = (load('../../skills/channel/references/review-library.js') as { exportChannel(dir: string): { contentWarnings: { characterId: string; message: string }[] } }).exportChannel(channel);
    sheet = { path: path.join(folder, 'index.html'), warnings: result.contentWarnings.filter(w => w.characterId === id).map(w => w.message) };
  } catch (error) { sheet = { error: (error as Error).message }; }
  return { identityPath: file, id, name: args.name, created, version: character.version, missing: { basics, images, voice }, sheet };
}

/** JSON schema of the optional fields, one property per catalog entry outside the required basics. */
export function characterFieldsProperty() {
  const description = 'Optional fields by group; omitted fields stay as they are. A value confirms the field, {status,reason} marks it pending or not_applicable, null removes it.';
  let loaded: ReturnType<typeof catalog>;
  // tools/list must still boot without the skills tree; the call itself reports the missing catalog.
  try { loaded = catalog(); } catch { return { type: 'object', description }; }
  const { GROUPS, REQUIRED } = loaded;
  const state = { type: 'object', additionalProperties: false, required: ['status', 'reason'], description: 'Unresolved (pending) or inapplicable field with its reason', properties: {
    status: { type: 'string', enum: ['pending', 'not_applicable'], description: 'pending = not decided yet; not_applicable = does not apply to this character' },
    reason: { type: 'string', minLength: 1, maxLength: 2000, description: 'Why, e.g. 따로 정한 과거가 없다.' } } };
  const remove = { type: 'null', description: 'null removes the field' };
  const kinds: Record<string, object> = {
    text: { type: 'string', minLength: 1, maxLength: 2000, description: 'Confirmed value' },
    list: { type: 'array', minItems: 1, maxItems: 20, description: 'Confirmed list', items: { type: 'string', minLength: 1, maxLength: 2000, description: 'One item' } },
    number: { type: 'number', exclusiveMinimum: 0, description: 'Confirmed positive number' },
  };
  const groups = GROUPS.map(([group, , groupEn, fields]) => [group, fields.filter(([key]) => !REQUIRED[group]?.includes(key)), groupEn] as const).filter(([, fields]) => fields.length);
  return {
    type: 'object', additionalProperties: false, description,
    properties: Object.fromEntries(groups.map(([group, fields, groupEn]) => [group, { type: 'object', additionalProperties: false, description: groupEn, properties:
      Object.fromEntries(fields.map(([key, , en, type = 'text']) => [key, { description: en, anyOf: [kinds[type], state, remove] }])) }])),
  };
}
