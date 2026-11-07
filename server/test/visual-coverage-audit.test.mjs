import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const { audit } = require('../../skills/storyboard/references/visual-coverage-audit.js');
function fixture(run) {
  const dir = mkdtempSync(join(tmpdir(), 'visual-coverage-'));
  try { run(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('inventories every cut without treating a representative as later video evidence', () => fixture(dir => {
  writeFileSync(join(dir, 'intro.png'), 'image bytes');
  const win = { SCENES: [{ id: 'stable-7', visual: { src: 'intro.png' }, productionPlan: {
    cuts: [{ kind: 'graphic', path: 'intro.png', seconds: 1 },
      { kind: 'motion', path: 'school.mp4', seconds: 7 },
      { kind: 'motion', path: 'end.mp4', sourceImage: 'missing.png' }],
  } }] };
  const before = JSON.stringify(win);
  const result = audit(win, dir);
  assert.equal(result.shots[0].shotId, 'stable-7');
  assert.equal(result.shots[0].cuts.length, 3);
  assert.equal(result.shots[0].cuts[0].image.status, 'bytes_available');
  assert.equal(result.shots[0].cuts[1].image.path, null);
  assert.equal(result.shots[0].cuts[1].playback, 'unverified');
  assert.equal(result.shots[0].cuts[2].image.reason, 'unreadable_source_image');
  assert.ok(result.findings.some(f => f.code === 'video_only_unverified'));
  assert.equal(JSON.stringify(win), before);
}));

test('CLI is read-only, keeps legacy IDs absent, and never fetches remote sources', () => fixture(dir => {
  const file = join(dir, 'scenes.js');
  const content = 'window.SCENES = [{ visual: { src: "https://invalid.example/image.png" } }];\n';
  writeFileSync(file, content);
  const processResult = spawnSync(process.execPath,
    [fileURLToPath(new URL('../../skills/storyboard/references/visual-coverage-audit.js', import.meta.url)), dir], { encoding: 'utf8' });
  assert.equal(processResult.status, 0, processResult.stderr);
  const result = JSON.parse(processResult.stdout);
  assert.equal(result.shots[0].shotId, null);
  assert.equal(result.shots[0].cuts[0].image.reason, 'remote_not_fetched');
  assert.equal(readFileSync(file, 'utf8'), content);
}));

test('missing scenes and malformed rows are reported without fabricating coverage', () => fixture(dir => {
  for (const win of [undefined, {}, { SCENES: null }, { SCENES: {} }]) {
    const result = audit(win, dir);
    assert.equal(result.shots.length, 0);
    assert.ok(result.findings.some(f => f.code === 'scenes_unavailable'));
  }
  const result = audit({ SCENES: [null, { id: 's2', productionPlan: { cuts: [null] } }] }, dir);
  assert.equal(result.shots.length, 2);
  assert.ok(result.findings.some(f => f.code === 'invalid_scene'));
  assert.ok(result.findings.some(f => f.code === 'invalid_cut'));
  assert.equal(result.shots[1].cuts[0].image.status, 'unverified');
  assert.equal(result.score, undefined);
}));

test('reports repeated images within one block and does not read protocol-relative sources', () => fixture(dir => {
  writeFileSync(join(dir, 'same.png'), 'same bytes');
  const result = audit({ SCENES: [{ id: 's1', productionPlan: { cuts: [
    { path: 'same.png' }, { path: 'same.png' }, { path: '//example.invalid/image.png' },
  ] } }] }, dir);
  const duplicate = result.findings.find(f => f.code === 'identical_image_bytes');
  assert.deepEqual(duplicate.shotIds, ['s1']);
  assert.deepEqual(duplicate.detail.uses.map(use => use.cut), [1, 2]);
  assert.equal(result.shots[0].cuts[2].image.reason, 'remote_not_fetched');
}));
