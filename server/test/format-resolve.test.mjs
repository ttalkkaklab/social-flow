import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const HERE = fileURLToPath(new URL('.', import.meta.url));
const REF = resolve(HERE, '../../skills/platform-guide/references');
const RESOLVE = join(REF, 'format-resolve.js');
const SCENES_VM = resolve(HERE, '../../skills/_shared/scenes-vm.js');

const run = (...args) =>
  execFileSync(process.execPath, [RESOLVE, ...args], { encoding: 'utf8' });

/** Digs the emission block out as {key: value}. */
function parseEnv(sh) {
  const out = {};
  for (const m of sh.matchAll(/:\s*"\$\{([A-Z_]+):=([^}]*)\}"/g)) out[m[1]] = m[2];
  return out;
}

test('emitted values are not empty — blocks wiring that leaks null as an empty string', () => {
  for (const key of ['shorts-9x16', 'youtube-long-16x9']) {
    const env = parseEnv(run('--format', key, '--sh'));
    for (const [k, v] of Object.entries(env)) {
      assert.notEqual(v, '', `${key}: the ${k} emission value is empty`);
    }
  }
});

test('no scene cap for landscape filming → MAX_SCENE 999999 (neither 0 nor empty)', () => {
  const env = parseEnv(run('--format', 'youtube-long-16x9', '--sh'));
  assert.equal(env.MAX_SCENE, '999999');
  // At 0 the d>m comparison at build-screencast.sh:136 turns the warning on for every scene.
  assert.notEqual(env.MAX_SCENE, '0');
  assert.equal(env.TOTAL_HARD, '1200');
  assert.equal(env.BURN, '0', 'landscape is the clean-master + subs.srt contract');
  assert.equal(env.URL_FMT, 'wide');
  assert.equal(env.SUB_SIZE, undefined, 'with BURN=0 the six subtitle keys are not emitted');
});

test('URL fragment — empty string for portrait, &format=wide for landscape', () => {
  assert.equal(run('--format', 'shorts-9x16', '--url'), '');
  assert.equal(run('--format', 'youtube-long-16x9', '--url'), '&format=wide');
});

test('presets that have typesetting coordinates produce --json', () => {
  // Since the 2026-08-17 safe-zone measurements, landscape passes too. Whether the
  // rejection wiring is still alive is checked by the separate test below with a fake
  // preset — assert the rejection with a real preset and the test dies the moment the
  // values get filled in, and then someone fixes it by deleting the wiring.
  for (const [key, w] of [['shorts-9x16', 1080], ['youtube-long-16x9', 1920]]) {
    const j = JSON.parse(run('--format', key, '--json'));
    assert.equal(j.format, key);
    assert.equal(j.canvas.w, w);
    assert.ok(j.zone && j.fonts, `${key}: --json only comes out when typesetting coordinates exist`);
  }
});
test('presets without typesetting coordinates still reject --json', () => {
  // Regression test for the rejection wiring. Checked with a temporary copy, not the real preset.
  const dir = mkdtempSync(join(tmpdir(), 'fmt-'));
  const fake = join(dir, 'formats.js');
  writeFileSync(fake, [
    `const { FORMATS } = require(${JSON.stringify(join(REF, 'formats.js'))});`,
    'const F = JSON.parse(JSON.stringify(FORMATS));',
    "F['shorts-9x16'].zone = null;",
    "module.exports = { FORMATS: F, DEFAULT_FORMAT: 'shorts-9x16' };",
  ].join('\n'));
  const copy = join(dir, 'format-resolve.js');
  writeFileSync(copy, readFileSync(RESOLVE, 'utf8')
    .replace("require('./formats.js')", `require(${JSON.stringify(fake)})`)
    .replace("require('../../_shared/scenes-vm.js')", `require(${JSON.stringify(SCENES_VM)})`));
  assert.throws(
    () => execFileSync(process.execPath, [copy, '--format', 'shorts-9x16', '--json'],
      { encoding: 'utf8', stdio: 'pipe' }),
    /provisional|null/,
    'with zone null, --json must exit 1',
  );
});

test('both formats reject explicit burn-in and default to optional separate subtitles', () => {
  const { FORMATS } = require(join(REF, 'formats.js'));
  for (const format of Object.keys(FORMATS)) {
  const env = parseEnv(run('--format', format, '--sh'));
  assert.equal(env.SUB, '0');
  assert.equal(env.BURN, '0');
  assert.equal(FORMATS[format].burn, false);
  assert.ok(!FORMATS[format].outputs.includes('reel-sub.mp4'));
  assert.ok(!FORMATS[format].outputs.includes('subs.srt'));
  assert.ok(FORMATS[format].optionalOutputs.includes('subs.srt'));
  assert.throws(
    () => run('--format', format, '--burn', '1', '--sh'),
    /BURN=1.*subtitle-free/,
    'no format can enable burned captions',
  );
  }
});

test('an unknown FORMAT value does not quietly fall back to portrait', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fmt-'));
  const scenes = join(dir, 'scenes.js');
  writeFileSync(scenes, 'window.FORMAT="tiktok-9x16";window.SCENES=[];\n');
  assert.throws(() => run(scenes, '--sh'), /unknown value/);
});
