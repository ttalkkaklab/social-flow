import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

import { checkStoryboard } from '../dist/storyboard.js';

const require = createRequire(import.meta.url);
const review = require('../../skills/storyboard/references/shot-image-review.js');
const shot = (id, actor, image, extra = {}) => ({
  id, type: 'points', scene: 'studio', duration: 3,
  visual: { character: actor, bg: image, camera: { framing: `${actor} at table`, movement: 'static' } },
  shot: { size: 'mcu', angle: 'eye', composition: { position: 'center' },
    render: { mode: 'generated_video' } }, ...extra,
});
function fixture(run) {
  const dir = mkdtempSync(join(tmpdir(), 'shot-images-'));
  try { run(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('detects renamed copies by bytes and normalizes local source paths without modifying inputs', () => fixture(dir => {
  writeFileSync(join(dir, 'host.png'), 'same source bytes');
  writeFileSync(join(dir, 'shot-9.png'), 'same source bytes');
  const win = { SCENES: [shot('s1', 'host', 'host.png'), shot('s2', 'guest', './host.png'),
    shot('s9', 'host', 'shot-9.png')] };
  const before = JSON.stringify(win);
  const findings = review.check(win, dir);
  const duplicate = findings.find(f => f.code === 'shared_source_image');
  assert.deepEqual(duplicate.shotIds, ['s1', 's2', 's9']);
  assert.match(duplicate.what, /identical source image bytes/);
  assert.ok(findings.every(f => f.level === 'warn'));
  assert.equal(JSON.stringify(win), before);
}));

function imageFile(dir, name, filter) {
  const result = spawnSync('ffmpeg', ['-nostdin', '-v', 'error', '-f', 'lavfi', '-i',
    'testsrc2=size=192x320:rate=1', '-vf', filter || 'null', '-frames:v', '1', join(dir, name)]);
  assert.equal(result.status, 0, String(result.stderr));
}

test('dense similarity groups retain every shot and pair count without quadratic findings', () => fixture(dir => {
  imageFile(dir, 'original.png');
  const original = readFileSync(join(dir, 'original.png'));
  const scenes = Array.from({ length: 5 }, (_, i) => {
    const name = `image-${i}.png`;
    writeFileSync(join(dir, name), Buffer.concat([original, Buffer.from(`metadata-${i}`)]));
    return shot(`s${String(i + 1).padStart(4, '0')}`, 'host', name);
  });
  const findings = review.check({ SCENES: scenes }, dir).filter(f => f.code === 'similar_source_images');
  assert.equal(findings.length, 1);
  assert.equal(findings[0].references.length, 5);
  assert.equal(findings[0].comparison.matchingPairs, 10);
  assert.equal(findings[0].comparison.examples.length, 8);
  assert.equal(findings[0].comparison.examplesTruncated, true);
  assert.match(findings[0].what, /Not every pair/);
  writeFileSync(join(dir, 'scenes.js'), 'window.SCENES=' + JSON.stringify(scenes) + ';');
  const result = checkStoryboard({ path: dir, draft: true });
  assert.equal(result.shots, 5);
  assert.equal(result.contract.filter(f => f.code === 'similar_source_images').length, 1);
}));

test('piped checker output and storyboard adapter preserve diagnostics larger than one MiB', () => fixture(dir => {
  const scenes = Array.from({ length: 12 }, (_, i) => shot(`s${String(i + 1).padStart(4, '0')}`,
    `actor${i}`, `missing-${i}-${'x'.repeat(48000)}.png`));
  writeFileSync(join(dir, 'scenes.js'), 'window.SCENES=' + JSON.stringify(scenes) + ';');
  const cli = spawnSync(process.execPath, [resolve(import.meta.dirname, '../../skills/storyboard/references/check-scenes.js'),
    dir, '--draft', '--json'], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  assert.equal(cli.status, 0, cli.stderr);
  assert.ok(Buffer.byteLength(cli.stdout) > 1024 * 1024);
  assert.equal(JSON.parse(cli.stdout).shots, 12);
  const result = checkStoryboard({ path: dir, draft: true });
  const unknown = result.contract.filter(f => f.code === 'unverified_source_image');
  assert.equal(unknown.length, 12);
  assert.equal(unknown[11].references[0].image, scenes[11].visual.bg);
}));
