import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const review = require('../../skills/storyboard/references/shot-image-review.js');
const production = require('../../skills/produce/references/check-production.js');
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

test('finds returning portrait setups across reverse shots despite distinct files and movement labels', () => fixture(dir => {
  const scenes = Array.from({ length: 6 }, (_, i) => shot(`s${i + 1}`, i % 2 ? 'guest' : 'host', `${i}.png`));
  scenes[2].visual.camera.movement = 'push-in';
  scenes[4].shot.render.reason = 'A newly written explanation';
  const findings = review.check({ SCENES: scenes }, dir);
  assert.deepEqual(findings.filter(f => f.code === 'repeated_shot_setup').map(f => f.shots), [[1, 3, 5], [2, 4, 6]]);
  assert.equal(findings.filter(f => f.code === 'shared_source_image').length, 0);
  scenes[4].visual.camera.framing = 'envelope and hands';
  scenes[4].shot.size = 'insert';
  assert.deepEqual(review.check({ SCENES: scenes }, dir).filter(f => f.code === 'repeated_shot_setup').map(f => f.shots), [[1, 3], [2, 4, 6]]);
}));

test('shared cast references alone, missing plans, imported clips and stock are not duplicate generated shots', () => fixture(dir => {
  const scenes = [shot('s1', 'host', 'a.png'), shot('s2', 'host', 'b.png')];
  scenes.push(shot('s3', 'host', 'a.png', { visual: { bg: 'a.png', reuse: { clip: 'old.mp4' } } }));
  scenes.push(shot('s4', 'host', 'a.png', { visual: { bg: 'a.png', source: 'stock' } }));
  scenes.push(shot('s5', 'host', 'a.png', { type: 'outro' }));
  scenes.push({ type: 'points' }, { type: 'points' }, { type: 'points' });
  const findings = review.check({ SCENES: scenes, PRODUCTION: { cast: { host: { image: 'a.png' } } } }, dir);
  assert.equal(findings.filter(f => ['shared_source_image', 'similar_source_images'].includes(f.code)).length, 0);
  assert.deepEqual(findings.filter(f => f.code === 'unverified_source_image').flatMap(f => f.shotIds), ['s1', 's2']);
}));

test('missing and remote repeated references stay explicitly unverified without fetching', () => fixture(dir => {
  for (const image of ['missing.png', 'https://invalid.example/source.png']) {
    const findings = review.check({ SCENES: [shot('s1', 'host', image), shot('s2', 'host', image)] }, dir);
    assert.match(findings[0].what, /pixels unverified/);
    assert.equal(findings[0].level, 'warn');
  }
}));

test('CLI and production preflight surface reuse evidence without creating a quality gate', () => fixture(dir => {
  const win = { SCENES: [shot('s0001', 'host', 'host.png'), shot('s0002', 'host', 'host.png')] };
  writeFileSync(join(dir, 'scenes.js'), 'window.SCENES=' + JSON.stringify(win.SCENES) + ';');
  const cli = spawnSync(process.execPath, [resolve(import.meta.dirname, '../../skills/storyboard/references/check-scenes.js'),
    dir, '--draft', '--json'], { encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stdout + cli.stderr);
  assert.ok(JSON.parse(cli.stdout).findings.some(f => f.code === 'shared_source_image' && f.level === 'warn'));
  for (const options of [{ beforeCall: 1 }, { assemblyOnly: true }]) {
    const result = production.check(dir, options);
    assert.ok(result.warnings.some(f => f.includes('same source image reference')));
    assert.equal(result.errors.length, 0);
    assert.ok(result.imageReview.some(f => f.references.some(r => r.shotId === 's0001' && r.image === 'host.png')));
  }
}));

function imageFile(dir, name, filter) {
  const result = spawnSync('ffmpeg', ['-nostdin', '-v', 'error', '-f', 'lavfi', '-i',
    'testsrc2=size=192x320:rate=1', '-vf', filter || 'null', '-frames:v', '1', join(dir, name)]);
  assert.equal(result.status, 0, String(result.stderr));
}

test('decoded pixels catch reencoded images and small prop edits, with distinct-image negative control', () => fixture(dir => {
  imageFile(dir, 'original.png');
  const encoded = spawnSync('ffmpeg', ['-nostdin', '-v', 'error', '-i', join(dir, 'original.png'),
    '-q:v', '2', join(dir, 'copy.jpg')]);
  assert.equal(encoded.status, 0, String(encoded.stderr));
  imageFile(dir, 'prop.png', 'drawbox=x=80:y=160:w=18:h=20:color=white:t=fill');
  imageFile(dir, 'different.png', 'negate');
  const scenes = ['original.png', 'copy.jpg', 'prop.png', 'different.png'].map((file, i) => shot(`s${i}`, `actor${i}`, file));
  const findings = review.check({ SCENES: scenes }, dir);
  const candidates = findings.filter(f => f.code === 'similar_source_images');
  assert.ok(candidates.some(f => f.shotIds.includes('s0') && f.shotIds.includes('s1')));
  assert.ok(candidates.some(f => f.shotIds.includes('s0') && f.shotIds.includes('s2')));
  assert.ok(candidates.every(f => !f.shotIds.includes('s3')));
  assert.ok(candidates.every(f => f.references.every(r => r.resolvedImage.startsWith(dir) && r.pixelStatus === 'decoded')));
  assert.ok(findings.every(f => f.level === 'warn'));
}));

test('meaningful composition, depth, viewpoint, location and opening-state changes do not claim repeated plans', () => fixture(dir => {
  for (const change of [
    s => { s.shot.composition.headroom = 'cropped'; s.shot.composition.eyeHeight = .1; },
    s => { s.shot.depth = { mode: 'shallow', focus: 'envelope' }; },
    s => { s.shot.angle = 'low'; },
    s => { s.visual.camera.framing = 'hands and envelope'; },
    s => { s.visual.camera.position = { x: 2, y: 1, z: 4 }; },
    s => { s.scene = 'hall'; },
    s => { s.shot.videoDesign = { before: 'envelope open on table' }; },
    s => { s.visual.action = 'holding the opened envelope'; },
  ]) {
    const scenes = [shot('s1', 'host', '1.png'), shot('s2', 'guest', '2.png'), shot('s3', 'host', '3.png')];
    assert.equal(review.check({ SCENES: scenes }, dir).filter(f => f.code === 'repeated_shot_setup').length, 1);
    change(scenes[2]);
    assert.equal(review.check({ SCENES: scenes }, dir).filter(f => f.code === 'repeated_shot_setup').length, 0);
  }
}));

test('unique unavailable or corrupt images and absent source frames explicitly remain unknown', () => fixture(dir => {
  writeFileSync(join(dir, 'corrupt.png'), 'not an image');
  writeFileSync(join(dir, 'unsupported.svg'), '<svg/>');
  const scenes = ['missing.png', 'https://invalid.example/a.png', 'corrupt.png', 'unsupported.svg', null]
    .map((file, i) => shot(`s${i}`, `actor${i}`, file));
  const findings = review.check({ SCENES: scenes }, dir).filter(f => f.code === 'unverified_source_image');
  assert.equal(findings.length, 5);
  assert.ok(findings.every(f => f.references[0].pixelStatus === 'unverified' && /unverified/.test(f.what)));
}));
