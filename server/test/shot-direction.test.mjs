import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const direction = require('../../skills/storyboard/references/shot-direction.js');

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
