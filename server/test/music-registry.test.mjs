import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMusicArgs, musicCatalog, musicAdapterContracts } from '../dist/music-registry.js';
import { TOOLS } from '../dist/tools.js';
import { isBillableTool } from '../dist/usage-ledger.js';
test('Suno V6 validates native requirements and refuses retired models without substitution', () => {
  const parse = args => parseMusicArgs('suno_generate', args);
  assert.equal(parse({ model: 'V6', style: 'piano', customMode: true, instrumental: true, duration: 30 }).duration, 30);
  assert.equal(parse({ model: 'V6_MINI', lyrics: '안녕' }).lyrics, '안녕');
  assert.throws(() => parse({ prompt: 'piano' }), /requires style or lyrics/);
  assert.throws(() => parse({ style: 'piano', duration: 30 }), /Custom-only/);
  assert.throws(() => parse({ style: 'piano', model: 'V5' }), /model_retired/);
  assert.equal(parse({ style: 'piano', customMode: true, variety: 2, styleWeight: 0.6 }).variety, 2);
  assert.throws(() => parse({ style: 'piano', variety: 2 }), /Custom-only/);
  assert.throws(() => parse({ style: 'p'.repeat(1001) }));
  assert.throws(() => parseMusicArgs('suno_generate_sound', { prompt: 'rain loop' }), /music_adapter_unverified/);
  assert.throws(() => parseMusicArgs('music_generate_advanced', { prompts: [{ text: 'piano' }], config: { unsupported: true } }));
});
test('routing tools are exposed once and do not produce duplicate ledger charges', () => {
  for (const name of ['music_catalog', 'music_plan', 'music_execute', 'music_status']) {
    assert.equal(TOOLS.filter(t => t.name === name).length, 1); assert.equal(isBillableTool(name), false);
  }
  assert.ok(musicCatalog().models.every(m => TOOLS.some(t => t.name === m.tool)));
  assert.ok(musicCatalog().unimplemented.some(p => p.engine === 'suno-official'));
});
test('the catalog describes each adapter and scopes Lyria RealTime to its two instrumental tools', () => {
  const { adapters } = musicCatalog();
  assert.ok(adapters.every(row => row.engine && row.purpose.trim()));
  const realtime = musicAdapterContracts('lyria', 'models/lyria-realtime-exp').adapters;
  assert.deepEqual(realtime.map(row => row.tool).sort(), ['music_generate', 'music_generate_advanced']);
  for (const row of realtime) assert.equal(row.purpose, adapters.find(adapter => adapter.tool === row.tool).purpose);
});

test('local catalogs and planned arguments follow the selected runtime', () => {
  const model = 'ddalcu/MiniMax-Music3-MLX-Serve-8bit';
  const mini = args => parseMusicArgs('mlx_music_generate', { model, prompt: 'piano', ...args });
  assert.equal(mini({ durationSeconds: 1, steps: 4, bpm: 30 }).durationSeconds, 1);
  for (const args of [{ durationSeconds: 361 }, { steps: 3 }, { bpm: 301 }, { instrumental: false },
    { instrumental: true, lyrics: 'sing' }, { refAudioPath: 'source.wav' }, { filename: 'clip.mp3' }, { timesignature: '4/4' }]) {
    assert.throws(() => mini(args));
  }
  const options = musicAdapterContracts('mlx', model).adapters[0].parameters.options.properties;
  assert.equal(options.durationSeconds.maximum, 360);
  assert.equal(options.steps.minimum, 4);
  assert.ok(!options.refAudioPath);
  const legacy = musicAdapterContracts('mlx', 'existing-pack').adapters[0].parameters.options.properties;
  assert.equal(legacy.durationSeconds.minimum, 10);
  assert.ok(legacy.refAudioPath && !legacy.bpm);

  const stable = args => parseMusicArgs('music_stable_audio_generate', { prompt: 'piano', ...args });
  assert.equal(stable({ durationSeconds: 8.5, cfg: 2, negativePrompt: 'vocals' }).steps, 8);
  for (const args of [{ durationSeconds: 381 }, { seed: -1 }, { negativePrompt: 'vocals' },
    { inpaintRange: [1, 3] }, { initAudioPath: 'a.wav', inpaintRange: [1, 31] },
    { filename: 'song.mp3' }, { model }, { lyrics: 'sing' }]) assert.throws(() => stable(args));
});
