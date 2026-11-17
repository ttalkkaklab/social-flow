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

test('the direction plan reads as counts: scene order, runs, lengths by size and copied reasons', () => {
  const shot = (id, size, move, duration, why, extra = {}) => ({ id, scene: 1, duration, shot: { size, angle: 'eye', why,
    techniques: move ? [{ id: 'camera.' + move, reason: 'm ' + id }] : [] }, visual: { camera: move ? { movement: move === 'static' ? 'static' : 'dolly in' } : {} }, ...extra });
  const win = { SCENES: [shot('s0001', 'ls', 'dolly-in', 4, 'the room'), shot('s0002', 'cu', 'static', 2, 'same', { narration: [{ tts: 'x' }] }),
    shot('s0003', 'cu', 'static', 2, 'same'), shot('s0004', 'insert', 'static', 2, 'same', { performance: [{ kind: 'action' }, { kind: 'action' }, { kind: 'speech' }] }),
    { id: 's0005', scene: 2, duration: 3, shot: { size: 'ms' }, visual: {} }] };
  const before = JSON.stringify(win), facts = direction.facts(win);
  assert.equal(JSON.stringify(win), before, 'reading changes nothing');
  assert.deepEqual([facts.shots, facts.seconds, facts.sizes, facts.moves], [5, 13, { ls: 1, cu: 2, insert: 1, ms: 1 }, { 'dolly-in': 1, static: 3, unset: 1 }]);
  assert.deepEqual(facts.scenes[0], { scene: 1, seconds: 10, shots: ['s0001 ls eye dolly-in 4s', 's0002 cu eye static 2s line', 's0003 cu eye static 2s', 's0004 insert eye static 2s'] });
  assert.deepEqual(facts.runs, { size: [{ value: 'cu', shots: 2, from: 's0002', to: 's0003' }], held: [{ value: 'held', shots: 3, from: 's0002', to: 's0004' }] });
  assert.deepEqual(facts.lengths.bySize.map((row) => [row.size, row.shots, row.median]), [['ls', 1, 4], ['ms', 1, 3], ['cu', 2, 2], ['insert', 1, 2]]);
  assert.deepEqual([facts.lengths.common[0], facts.lengths.longest[0]], [{ seconds: 2, shots: 3 }, { id: 's0001', seconds: 4, actions: 0, lines: 0 }]);
  assert.deepEqual(facts.reasons, { copied: [{ field: 'shot.why', text: 'same', shots: ['s0002', 's0003', 's0004'] }], sizeWithoutWhy: ['s0005'], whyEqualsViewReason: [] });
  // A sentence shared by two shots is listed in the reading, and reported as a copy only from three.
  assert.deepEqual(direction.copiedReasons(win.SCENES.slice(0, 3)), []);
  assert.equal(direction.copiedReasons(win.SCENES)[0].shots.length, 3);
  // Held shots are counted by size; only a wide hold with no reason of its own is listed.
  assert.deepEqual(facts.held, { sizes: { cu: 2, insert: 1 }, wideWithoutReason: [] });
  const hold = (id, size, reason) => ({ id, shot: { size, techniques: [{ id: 'camera.static', ...(reason ? { reason } : {}) }] }, visual: { camera: { movement: 'static' } } });
  assert.deepEqual(direction.held([hold('s0001', 'ls'), hold('s0002', 'fs', 'the frame he walks out of'), hold('s0003', 'cu'), hold('s0004', 'els')]),
    { sizes: { ls: 1, fs: 1, cu: 1, els: 1 }, wideWithoutReason: ['s0001', 's0004'] });
});
