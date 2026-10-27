import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
const require = createRequire(import.meta.url);
const direction = require('../../skills/storyboard/references/shot-direction.js');
const { storyboardHtml } = require('../../skills/storyboard/references/storyboard-html.js');

test('camera labels distinguish physical motion, lens changes, custom moves and still effects', () => {
  for (const [movement, expected] of [['static', 'static'], ['dolly in', 'dolly'], ['zoom in', 'zoom'],
    ['dolly zoom out', 'dolly-zoom'], ['crash zoom', 'crash'], ['whip pan', 'whip'],
    ['crane up', 'crane'], ['handheld', 'handheld'], ['helix orbit', 'helix'],
    ['truck left', 'tracking'], ['pan left', 'pan'], ['tilt up', 'tilt'], ['strange move', 'other'], ['', 'other']]) {
    const scene = { visual: { camera: { movement, speed: '' } } };
    assert.equal(direction.cameraOf(scene, 'en').key, expected, movement);
    assert.equal(direction.cameraOf(scene, 'en').raw, movement);
  }
  const scene = { shot: { render: { mode: 'still_camera', camera: { effect: 'rack-focus' } } },
    visual: { camera: { movement: 'static' } } };
  assert.equal(direction.cameraOf(scene, 'en').key, 'focus');
  assert.equal(direction.cameraOf(scene, 'en').medium, 'Still effect');
  assert.equal(direction.cameraOf({ visual: { camera: { movement: 'mystery' } } }, 'en').label, 'Custom move');
});

test('unknown timing never creates an invented duration or cumulative clock', () => {
  const values = [undefined, 0, -1, NaN, Infinity, '3', null];
  for (const duration of values) assert.equal(direction.secondsOf({ duration }), null);
  assert.equal(direction.secondsOf({ duration: 1.25 }), 1.25);
  const html = direction.timeline([{ duration: 1.25 }, {}, { duration: 2 }], 'en');
  assert.match(html, /Unknown 1/);
  assert.doesNotMatch(html, /Planned total|NaN|Infinity/);
  assert.match(html, /length unknown/);
  assert.match(direction.timeline([{ duration: 1.25 }, { duration: 2 }], 'en'), /Planned total 3.25s/);
  const scenes = Object.freeze([Object.freeze({type:'cover',duration:3}), Object.freeze({type:'outro'})]);
  const doc = Object.freeze({outro:Object.freeze({seconds:9})});
  assert.match(direction.timeline(scenes, 'en', doc), /Planned total 12s/);
  assert.match(direction.timeline(scenes, 'en', doc), /Shot 2: 9s/);
  assert.match(direction.summary(scenes[1], 1, scenes[0], 'en', doc), /Planned 9s/);
  assert.match(direction.timeline(scenes, 'en', {outro:{seconds:'9'}}), /Unknown 1/);
});

test('playback links keep original shot numbers when an outro precedes an interleaved b-roll', () => {
  const scenes = [{ type: 'cover', duration: 3 }, { type: 'outro' }, { type: 'points' }, { type: 'broll', after: 2 }];
  assert.deepEqual(direction.playbackEntries(scenes).map(entry => entry.i), [0, 2, 3, 1]);
  assert.deepEqual([...direction.timeline(scenes, 'en').matchAll(/href="#shot-(\d+)"/g)].map(m => +m[1]), [1, 3, 4, 2]);
});

test('incoming join remains independent of movement and preserves authored direction', () => {
  const previous = { shot: { size: 'ms' }, visual: { camera: { movement: 'static' } } };
  const scene = { transition: 'cut', visual: { camera: { movement: 'whip pan' } } };
  assert.match(direction.summary(scene, 1, previous, 'en'), /Hard cut/);
  assert.match(direction.summary({ transition: 'whip:left', visual: { camera: { movement: 'static' } } }, 1, previous, 'en'), /Whip · left/);
  assert.match(direction.summary({ transition: 'dip' }, 0, null, 'en'), />Dip</);
  assert.match(direction.summary({}, 1, previous, 'en'), /Join not planned/);
  assert.match(direction.summary({ type: 'broll', transition: 'cut' }, 2, previous, 'en'), /Assembly join/);
  assert.match(direction.summary({ type: 'outro' }, 3, previous, 'en'), /Assembly join/);
});

test('summary is read-only, escaped, visibly labeled and links to keyboard-accessible details', () => {
  const scene = Object.freeze({ duration: 4, transition: 'cut',
    shot: Object.freeze({ cutType: 'reaction' }),
    visual: Object.freeze({ camera: Object.freeze({ movement: 'dolly in' }) }),
    edit: Object.freeze({ continuity: '<script>alert(1)</script>' }) });
  const before = JSON.stringify(scene);
  const html = direction.summary(scene, 2, {}, 'en');
  assert.match(html, /href="#direction-shot-3"/);
  assert.match(html, />Dolly</);
  assert.match(html, />Reaction</);
  assert.match(html, /Planned 4s/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.equal(JSON.stringify(scene), before);
});

test('exported helper executes offline and refresh preserves source plan', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sf-direction-'));
  try {
    const source = 'window.SCENES=[];';
    writeFileSync(join(dir, 'scenes.js'), source);
    storyboardHtml(dir);
    const html = readFileSync(join(dir, 'storyboard.html'), 'utf8');
    assert.match(html, /script src="\.\/shot-direction\.js"/);
    const runtime = readFileSync(join(dir, 'shot-direction.js'), 'utf8');
    const context = { window: {} };
    runInNewContext(runtime, context);
    assert.match(context.window.SHOT_DIRECTION.timeline([{ duration: 2 }], 'ko'), /계획 합계 2s/);
    writeFileSync(join(dir, 'shot-direction.js'), 'stale');
    assert.deepEqual(storyboardHtml(dir, true), ['shot-direction.js']);
    assert.equal(readFileSync(join(dir, 'shot-direction.js'), 'utf8'), 'stale');
    storyboardHtml(dir);
    assert.equal(readFileSync(join(dir, 'scenes.js'), 'utf8'), source);
    assert.deepEqual(storyboardHtml(dir, true), []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
