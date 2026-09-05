import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '../../skills/storyboard/references');
const { checkStory, storyHash, storySpeech } = require(path.join(root, 'story-contract.js'));
const ref = shot => ({ shot, group: 1, quote: ['Why is the box moving?', 'The table shakes.', 'A fan moves the table.', 'Check the table before the box.'][shot - 1] });
function fixture() {
  const w = { COMPREHENSION: { question: 'Why?', answer: 'A fan.', takeaway: 'Check the support.' },
    SCENES: [1, 2, 3, 4].map(i => ({ type: i === 1 ? 'cover' : 'points',
      beat: i === 1 ? 'hook' : i === 4 ? 'cta' : 'drip', narration: [{ tts: ref(i).quote, sub: ref(i).quote }] })),
    STORY: { version: 'story-v1', kind: 'fiction', viewerNeed: 'Solve the moving-box puzzle',
      thesis: 'The support moves the box.', basis: 'An explicitly fictional demonstration',
      opening: ref(1), payoff: ref(3), ending: ref(4), endingReason: 'Return to the initial mistaken attribution',
      cta: 'none', beats: [1, 2, 3, 4].map(shot => ({ shot, change: `New clue ${shot}`, necessity: `Required step ${shot}` })) }
  };
  w.STORY.review = { hash: storyHash(w), verdict: 'pass', unresolved: [],
    ...Object.fromEntries(['meaning', 'progression', 'payoff', 'grounding'].map(k => [k, { reason: `${k} evidence in fictional premise`, refs: [ref(3)] }])) };
  return w;
}
test('story contract permits an earned close without CTA and no numeric score', () => {
  assert.deepEqual(checkStory(fixture()), []);
});
test('draft requires plan but does not require completed review', () => {
  const w = fixture(); delete w.STORY.review;
  assert.deepEqual(checkStory(w, { requireReview: false }), []);
  assert.match(checkStory(w).join(), /review is required/);
  delete w.STORY;
  assert.match(checkStory(w, { requireReview: false }).join(), /requires version/);
});
test('rejects missing message, scene purpose, duplicate or omitted scenes', () => {
  for (const key of ['thesis', 'basis', 'viewerNeed', 'endingReason']) {
    const w = fixture(); w.STORY[key] = '';
    assert.match(checkStory(w).join(), new RegExp(key));
  }
  const w = fixture(); w.STORY.beats[1].shot = 1; w.STORY.beats[0].necessity = '';
  assert.match(checkStory(w).join(), /unique narrated shot/);
  assert.match(checkStory(w).join(), /necessity/);
  w.STORY.beats.pop(); assert.match(checkStory(w).join(), /one row/);
});
test('rejects fabricated evidence, invalid indices and an ending before payoff', () => {
  const w = fixture(); w.STORY.payoff.quote = 'invented';
  assert.match(checkStory(w).join(), /not in the referenced narration/);
  w.STORY.payoff = { ...ref(3), group: 0 };
  assert.match(checkStory(w).join(), /1-based/);
  w.STORY.payoff = ref(3); w.STORY.ending = ref(2);
  assert.match(checkStory(w).join(), /cannot precede/);
});
test('an optional ask must follow the payoff with its own reason', () => {
  const w = fixture(); w.STORY.cta = 'question'; w.STORY.ask = ref(2);
  assert.match(checkStory(w).join(), /must follow the paid promise/);
  assert.match(checkStory(w).join(), /ctaReason/);
  w.STORY.ask = ref(4); w.STORY.ctaReason = 'Invite a related observation';
  w.STORY.review.hash = storyHash(w); assert.deepEqual(checkStory(w), []);
});
test('review requires all four evidenced judgments; score cannot waive unresolved failures', () => {
  for (const key of ['meaning', 'progression', 'payoff', 'grounding']) {
    const w = fixture(); delete w.STORY.review[key];
    assert.match(checkStory(w).join(), new RegExp(key));
  }
  const w = fixture(); w.STORY.review.score = 100; w.STORY.review.unresolved = ['No supported conclusion'];
  assert.match(checkStory(w).join(), /empty unresolved/);
  w.STORY.review.unresolved = []; w.STORY.review.verdict = 'fail';
  assert.match(checkStory(w).join(), /must pass/);
});
test('narration, subtitles, order, screen copy and thesis invalidate the review; camera does not', () => {
  for (const mutate of [w => w.SCENES[1].narration[0].tts += ' changed',
    w => w.SCENES[1].narration[0].sub += ' changed', w => w.SCENES.reverse(),
    w => w.SCENES[0].title = 'Different promise', w => w.STORY.thesis += ' changed',
    w => w.COMPREHENSION.answer += ' changed']) {
    const w = fixture(); mutate(w); assert.match(checkStory(w).join(), /stale/);
  }
  const w = fixture(); w.SCENES[0].visual = { action: 'camera move' };
  assert.deepEqual(checkStory(w), []);
});
test('malformed fields fail without throwing', () => {
  for (const value of [null, [], 4, 'invalid']) {
    const w = fixture(); w.STORY.review = value;
    assert.ok(checkStory(w).length);
    w.STORY = value; assert.ok(checkStory(w).length);
  }
  const w = fixture(); w.STORY.beats = [null]; assert.ok(checkStory(w).length);
});
test('opening and ending identify actual boundary groups, not an interior sentence', () => {
  const w = fixture();
  w.SCENES[0].narration.unshift({tts: 'An unrelated preamble'}); w.STORY.opening.group = 2;
  assert.match(checkStory(w).join(), /first spoken group/);
  w.SCENES[3].narration.push({tts: 'Another last line'});
  assert.match(checkStory(w).join(), /last spoken group/);
});
test('mixed live speech is reviewed and hashed without adding TTS narration', () => {
  const w = fixture(); w.SCENES[2].narration = [];
  w.SCENES[2].visual = { source: 'recording', clip: 'footage/demo.mp4' };
  w.STORY.transcripts = [{shot: 3, source: 'footage/demo.mp4', groups: [{text: ref(3).quote, start: 0, end: 2}]}];
  w.STORY.review.hash = storyHash(w); assert.deepEqual(checkStory(w), []);
  assert.deepEqual(w.SCENES[2].narration, []);
  w.STORY.transcripts[0].groups[0].text += ' Changed.';
  assert.match(checkStory(w).join(), /stale/);
  w.STORY.transcripts[0].groups[0].start = -1;
  assert.match(checkStory(w).join(), /ordered timed speech/);
  w.STORY.transcripts[0].source = 'wrong.mp4';
  assert.match(checkStory(w).join(), /matching clip/);
});
test('recorded insert speech uses playback order, not the broll array position', () => {
  const w = fixture();
  w.SCENES.push({type: 'broll', after: 0, narration: [], visual: {source: 'recording', clip: 'footage/insert.mp4'}});
  w.STORY.transcripts = [{shot: 5, source: 'footage/insert.mp4', groups: [{text: 'A real observation.', start: 0, end: 1}]}];
  w.STORY.beats.push({shot: 5, change: 'Observation', necessity: 'Shows the initial condition'});
  w.STORY.review.hash = storyHash(w);
  assert.deepEqual(checkStory(w), []);
  assert.deepEqual(storySpeech(w).map(x => x.shot), [1, 5, 2, 3, 4]);
});
test('CLI gates block missing plans in draft and missing review in full production', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'story-contract-'));
  try {
    const file = path.join(dir, 'scenes.js');
    const write = w => writeFileSync(file, Object.entries(w).map(([k,v]) => `window.${k}=${JSON.stringify(v)};`).join('\n'));
    const run = (script, ...args) => spawnSync(process.execPath, [path.join(root, script), dir, ...args], { encoding: 'utf8' });
    const w = fixture(); write(w);
    assert.equal(run('check-story.js').status, 0);
    assert.equal(run('check-story.js', '--hash').stdout.trim(), storyHash(w));
    assert.match(run('check-story.js', '--text').stdout, /^1\. Why is the box moving\?/);
    assert.deepEqual(JSON.parse(run('check-story.js', '--map').stdout).map(x => x.shot), [1, 2, 3, 4]);
    delete w.STORY.review; write(w);
    assert.equal(run('check-story.js', '--draft').status, 0);
    assert.equal(run('check-story.js').status, 1);
    assert.match(run('check-scenes.js', '--json').stdout, /review is required/);
    delete w.STORY; write(w);
    const result = run('check-scenes.js', '--draft', '--json');
    assert.equal(result.status, 1); assert.match(result.stdout, /requires version story-v1/);
    writeFileSync(file, 'invalid syntax'); assert.equal(run('check-story.js').status, 3);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a quote too short to identify the line is refused', () => {
  const w = fixture();
  w.STORY.opening = { shot: 1, group: 1, quote: '?' };
  assert.match(checkStory(w).join(' '), /STORY\.opening quote is too short/);
  // The measure is the line the quote was found in, not the shorter of tts/sub: a five-word
  // subtitle must not vouch for a long spoken sentence.
  const long = 'Why is the box moving across the table all by itself right now?';
  w.SCENES[0].narration = [{ tts: long, sub: 'the box' }];
  w.STORY.opening = { shot: 1, group: 1, quote: 'the box' };
  assert.match(checkStory(w).join(' '), /STORY\.opening quote is too short/);
  w.STORY.opening = { shot: 1, group: 1, quote: 'Why is the box moving across' };
  assert.ok(!checkStory(w).some(e => /STORY\.opening quote/.test(e)));
});

test('rewriting slide copy invalidates the review hash', () => {
  const w = fixture();
  const before = storyHash(w);
  w.SCENES[1].visual = { slide: { labels: ['34 closures'] } };
  assert.notEqual(storyHash(w), before);
  const withLabels = storyHash(w);
  w.SCENES[1].visual.slide.subject = { kind: 'data', changes: [] };
  assert.notEqual(storyHash(w), withLabels);
});
