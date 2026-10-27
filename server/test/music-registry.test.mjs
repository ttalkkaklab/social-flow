import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMusicArgs, musicCatalog } from '../dist/music-registry.js';
import { TOOLS } from '../dist/tools.js';
import { isBillableTool } from '../dist/usage-ledger.js';
test('Suno V6 validates native requirements and refuses retired models without substitution', () => {
  const parse = args => parseMusicArgs('suno_generate', args);
  assert.equal(parse({ model: 'V6', style: 'piano', customMode: true, instrumental: true, duration: 30 }).duration, 30);
  assert.equal(parse({ model: 'V6_MINI', lyrics: '안녕' }).lyrics, '안녕');
  assert.throws(() => parse({ prompt: 'piano' }), /requires style or lyrics/);
  assert.throws(() => parse({ style: 'piano', duration: 30 }), /Custom-only/);
  assert.throws(() => parse({ style: 'piano', model: 'V5' }), /model_retired/);
  assert.throws(() => parseMusicArgs('music_generate_advanced', { prompts: [{ text: 'piano' }], config: { unsupported: true } }));
});
test('routing tools are exposed once and do not produce duplicate ledger charges', () => {
  for (const name of ['music_catalog', 'music_plan', 'music_execute', 'music_status']) {
    assert.equal(TOOLS.filter(t => t.name === name).length, 1); assert.equal(isBillableTool(name), false);
  }
  assert.ok(musicCatalog().models.every(m => TOOLS.some(t => t.name === m.tool)));
  assert.ok(musicCatalog().unimplemented.some(p => p.engine === 'suno-official'));
});
