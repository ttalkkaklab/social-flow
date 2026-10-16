import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { contract, readStoryboard, storyboardReadSchema } from '../dist/storyboard.js';

function board() {
  return {
    STORY: { version: 'story-v2', thesis: 'Trust is shown by returning a borrowed watch', review: { hash: 'old', verdict: 'pass' } },
    PRODUCTION: { cast: [{ id: 'child', image: 'characters/child.png' }] },
    SB_DOC: { characters: [{ id: 'child', source: 'identity.md' }], props: [{ id: 'watch', description: 'Silver watch' }] },
    SCENES: [
      { id: 's0001', type: 'points', narration: [], performance: [{ kind: 'action', character: 'child', text: 'She returns the watch.' }],
        shot: { location: { manifest: 'locations/workshop/location.json', stateId: 'day' } },
        visual: { character: 'child', props: ['watch'], propUsage: [{ propId: 'watch', start: { day: 1, order: 1 }, end: { day: 1, order: 2 } }], bg: 'images/scene-1.png' } },
      { id: 's0002', type: 'points', narration: [{ id: 'line-2', speaker: 'father', tts: 'I knew you would.', delivery: 'on_screen' }],
        performance: [{ kind: 'action', character: 'father', text: 'He smiles.' }, { kind: 'dialogue', character: 'father', to: 'child', group: 1 }] },
    ],
  };
}

function withBoard(fn, win = board()) {
  const dir = mkdtempSync(join(tmpdir(), 'storyboard-inspect-'));
  try {
    writeFileSync(join(dir, 'scenes.js'), Object.entries(win).map(([key, value]) => `window.${key}=${JSON.stringify(value)};`).join('\n'));
    return fn(dir);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('default shot summary preserves silent action, ordered dialogue and all asset domains', () => {
  const tree = contract().outline(board(), 'shots');
  const [silent, dialogue] = tree.unplacedShots;
  assert.equal(silent.id, 's0001');
  assert.equal(silent.narration, '');
  assert.equal(silent.performance[0].text, 'She returns the watch.');
  assert.deepEqual(dialogue.performance.map(e => e.kind), ['action', 'dialogue']);
  assert.equal(dialogue.performance[1].speaker, 'father');
  assert.equal(dialogue.performance[1].text, 'I knew you would.');
  assert.equal(dialogue.performance[1].lineId, 'line-2');
  assert.equal(silent.references.characters, 'child');
  assert.equal(silent.references.location.stateId, 'day');
  assert.deepEqual(silent.references.props, ['watch']);
  assert.equal(silent.references.propUsage[0].propId, 'watch');
  assert.equal(silent.media.bg, 'images/scene-1.png');
});

test('invalid performance group is visible and never silently receives invented dialogue', () => {
  const win = board(); win.SCENES[1].performance[1].group = 99;
  const event = contract().outline(win, 'shots').unplacedShots[1].performance[1];
  assert.equal(event.unresolvedGroup, true);
  assert.equal(event.text, null);
  assert.equal(event.speaker, null);
});

test('read includes scenario, cast, settings and existing review without claiming verification', () => withBoard(dir => {
  const result = readStoryboard(storyboardReadSchema.parse({ path: dir }));
  assert.equal(result.reviewContext.story.review.verdict, 'pass');
  assert.equal(result.reviewContext.evidenceStatus, 'not_verified');
  assert.equal(result.inspection.mediaViewed, false);
  assert.equal(result.reviewContext.document.characters[0].id, 'child');
  assert.equal(result.reviewContext.production.cast[0].image, 'characters/child.png');
  assert.equal(result.mediaBaseDirectory, dir);
  assert.match(result.sha256, /^[a-f0-9]{64}$/);
  assert.equal(result.propSheet.props[0].id, 'watch');
  assert.equal(readStoryboard(storyboardReadSchema.parse({ path: dir, includeContext: false })).reviewContext, undefined);
}));

test('stable shot inspection preserves the whole flow and finds neighbors after reorder', () => {
  const win = board(); win.SCENES.reverse();
  withBoard(dir => {
    const result = readStoryboard(storyboardReadSchema.parse({ path: dir, shotId: 's0001' }));
    assert.equal(result.selectedShot.no, 2);
    assert.equal(result.selectedShot.shot.id, 's0001');
    assert.deepEqual(result.selectedShot.previous, { id: 's0002', no: 1 });
    assert.equal(result.selectedShot.next, null);
    assert.equal(result.unplacedShots.length, 2);
    assert.throws(() => readStoryboard(storyboardReadSchema.parse({ path: dir, shotId: 'missing' })), /found 0/);
  }, win);
});

test('duplicate shot IDs fail targeted inspection instead of inspecting the wrong shot', () => {
  const win = board(); win.SCENES[1].id = 's0001';
  withBoard(dir => assert.throws(() => readStoryboard(storyboardReadSchema.parse({ path: dir, shotId: 's0001' })), /found 2/), win);
});

test('legacy narration stays visible without invented performance ordering or speakers', () => {
  const row = contract().outline({ SCENES: [{ type: 'points', narration: [{ sub: 'Legacy line' }] }] }, 'shots').unplacedShots[0];
  assert.equal(row.id, null);
  assert.equal(row.narration, 'Legacy line');
  assert.equal(row.speech[0].speaker, null);
  assert.deepEqual(row.performance, []);
});

test('inspection neighbors follow b-roll placement and the closing outro, not storage order', () => {
  const win = board();
  win.SCENES.push({ id: 's0003', type: 'broll', after: 0, narration: [], performance: [{ kind: 'action', character: 'child', text: 'The watch falls.' }] });
  win.SCENES.push({ id: 's0004', type: 'outro', narration: [] });
  win.SCENES.push({ id: 's0005', type: 'broll', after: 99, narration: [] });
  withBoard(dir => {
    const result = readStoryboard(storyboardReadSchema.parse({ path: dir, shotId: 's0003' }));
    assert.deepEqual(result.playback.map(row => row.id), ['s0001','s0003','s0002','s0004']);
    assert.deepEqual(result.unscheduledShots.map(row => row.id), ['s0005']);
    assert.deepEqual(result.selectedShot.previous, { id: 's0001', no: 1 });
    assert.deepEqual(result.selectedShot.next, { id: 's0002', no: 2 });
    assert.equal(result.selectedShot.playbackPosition, 2);
    const orphan = readStoryboard(storyboardReadSchema.parse({ path: dir, shotId: 's0005' }));
    assert.equal(orphan.selectedShot.playbackPosition, null);
    assert.equal(orphan.selectedShot.previous, null);
  }, win);
});
