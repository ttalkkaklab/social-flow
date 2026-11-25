import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { pcmToWav } from '../dist/media-utils.js';
import { generateStableAudio } from '../dist/stable-audio-mlx.js';

test('Stable Audio runs the Medium CLI offline with an absolute source and publishes a measured WAV', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'sa3-'));
  process.env.STABLE_AUDIO_MLX_DIR = dir;
  t.after(() => { delete process.env.STABLE_AUDIO_MLX_DIR; rmSync(dir, { recursive: true, force: true }); });
  for (const sub of ['.venv/bin', 'scripts', 'models/mlx']) mkdirSync(join(dir, sub), { recursive: true });
  symlinkSync(process.execPath, join(dir, '.venv/bin/python'));
  for (const name of ['dit_medium_f16', 't5gemma_f16', 'same_l_decoder_f32'])
    writeFileSync(join(dir, 'models/mlx', name + '.npz'), 'fixture');
  const source = join(dir, 'input.wav');
  writeFileSync(source, pcmToWav(Buffer.alloc(44100 * 4), 44100, 2));
  // Stand in for the upstream CLI and capture its real argv and working directory.
  writeFileSync(join(dir, 'scripts/sa3_mlx.py'), `
    const fs = require('node:fs');
    const args = process.argv.slice(2);
    fs.writeFileSync('argv.json', JSON.stringify({ args, offline: process.env.HF_HUB_OFFLINE }));
    fs.copyFileSync(args[args.indexOf('--init-audio') + 1], args[args.indexOf('--out') + 1]);
  `);
  const args = { prompt: '--a literal caption', durationSeconds: 1, seed: 0, steps: 6, cfg: 2, negativePrompt: 'vocals',
    apg: 0.5, initAudioPath: source, initNoiseLevel: 0.6, inpaintRange: [0, 0.5], outputPath: dir, filename: 'output.wav' };
  await assert.rejects(generateStableAudio(args), /same_l_encoder/);
  assert.ok(!existsSync(join(dir, 'argv.json')));
  writeFileSync(join(dir, 'models/mlx/same_l_encoder_f32.npz'), 'fixture');
  const result = await generateStableAudio(args);
  assert.equal(result.durationSeconds, 1);
  assert.equal(result.seed, 0);
  assert.deepEqual(readFileSync(result.audioPath), readFileSync(source));
  const { args: argv, offline } = JSON.parse(readFileSync(join(dir, 'argv.json'), 'utf8'));
  assert.equal(offline, '1');
  assert.deepEqual(argv.slice(0, 10), ['--dit', 'medium', '--decoder', 'same-l', '--prompt=--a literal caption',
    '--seconds', '1', '--steps', '6', '--seed']);
  assert.equal(argv[10], '0');
  assert.deepEqual(argv.slice(argv.indexOf('--negative-prompt=vocals')), ['--negative-prompt=vocals',
    '--apg', '0.5', '--init-audio', source, '--init-noise-level', '0.6', '--inpaint-range', '0,0.5']);
  assert.ok(argv.includes('--cfg=2'));
});
