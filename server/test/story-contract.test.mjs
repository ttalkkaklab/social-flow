import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '../../skills/storyboard/references');
const { checkStory: inspectStory, storyHash, storySpeech } = require(path.join(root, 'story-contract.js'));
const { storyPerformance } = require(path.join(root, 'story-performance.js'));
// These unit cases explicitly exercise optional review diagnostics.
const checkStory = (win, options = {}) => inspectStory(win, { requireReview: true, ...options });
const ref = shot => ({ shot, group: 1, quote: ['Why is the box moving?', 'The table shakes.', 'A fan moves the table.', 'Check the table before the box.'][shot - 1] });
function fixture() {
  const w = { COMPREHENSION: { question: 'Why?', answer: 'A fan.', takeaway: 'Check the support.' },
    SCENES: [1, 2, 3, 4].map(i => ({ type: i === 1 ? 'cover' : 'points',
      beat: i === 1 ? 'hook' : i === 4 ? 'cta' : 'drip', narration: [{ tts: ref(i).quote, sub: ref(i).quote }] })),
    STORY: { version: 'story-v1', kind: 'fiction', viewerNeed: 'Solve the moving-box puzzle',
      thesis: 'Check the table before the box.', basis: 'An explicitly fictional demonstration',
      opening: ref(1), payoff: ref(3), ending: ref(4), endingReason: 'Return to the initial mistaken attribution',
      cta: 'none', beats: [1, 2, 3, 4].map(shot => ({ shot, change: `New clue ${shot}`, necessity: `Required step ${shot}` })) }
  };
  w.STORY.review = { hash: storyHash(w), verdict: 'pass', unresolved: [],
    ...Object.fromEntries(['meaning', 'progression', 'payoff', 'grounding'].map(k => [k, { reason: `${k} evidence in fictional premise`, refs: [ref(3)] }])) };
  return w;
}
test('rejects fabricated evidence, invalid indices and an ending before payoff', () => {
  const w = fixture(); w.STORY.payoff.quote = 'invented';
  assert.match(checkStory(w).join(), /not in the referenced narration/);
  w.STORY.payoff = { ...ref(3), group: 0 };
  assert.match(checkStory(w).join(), /1-based/);
  w.STORY.payoff = ref(3); w.STORY.ending = ref(2);
  assert.match(checkStory(w).join(), /cannot precede/);
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
// story-v2: checkStory delegates to story-performance.js; meaning comes from ordered performance.
function board() {
  const w = { SCENES: [
    { type: 'cover', beat: 'hook', narration: [{tts: 'Have you eaten?', sub: 'Have you eaten?', speaker: 'child'}],
      performance: [{kind: 'dialogue', character: 'child', to: 'father', group: 1}] },
    { type: 'points', beat: 'drip', narration: [{tts: 'I ate earlier.', sub: 'I ate earlier.', speaker: 'father'}],
      performance: [{kind: 'dialogue', character: 'father', to: 'child', group: 1},
        {kind: 'action', character: 'child', text: 'The child sees the empty pot.'}] },
    { type: 'points', beat: 'cta', duration: 3, narration: [],
      performance: [{kind: 'action', character: 'child', text: 'The child shares the rice with the father.'}] }
  ], STORY: { version: 'story-v2', kind: 'fiction', expression: 'mixed', reveal: 'none', cta: 'none',
    viewerNeed: 'Recognize quiet care', thesis: 'Care becomes mutual.', basis: 'Invented family; consistent actions.',
    endingReason: 'A reciprocal action resolves the question.',
    cast: ['father', 'child'].map(id => ({ id, role: id, want: 'Protect the other', voice: 'Reserved', reason: 'The relationship changes', source: 'identity.md' })),
    beats: [1, 2, 3].map(shot => ({shot, change: 'Recognition develops', necessity: 'Connect care to action'})) }
  };
  const events = storyPerformance(w), ref = e => ({ shot: e.shot, event: e.event, quote: e.quote });
  w.STORY.opening = ref(events[0]); w.STORY.payoff = ref(events[2]); w.STORY.ending = ref(events[3]);
  w.STORY.review = { hash: storyHash(w), verdict: 'pass', unresolved: [],
    ...Object.fromEntries(['meaning','progression','payoff','grounding','character'].map(k => [k, { reason: 'Observed reciprocal care', refs: [ref(events[3])] }])) };
  return w;
}
test('readers retain original indices through invalid slots and never invent unresolved speech', () => {
  const win = { STORY:{version:'story-v2'}, SCENES:[null,
    { narration:[null, {tts:'Actual line'}], performance:[null, {kind:'dialogue',group:2,character:'child'},
      {kind:'dialogue',group:99}, {kind:'action',text:{intent:'Not observable text'}}, {kind:'unknown',group:2}] },
    42, {type:'broll', after:1, narration:[{tts:'Insert line'}], performance:[{kind:'dialogue',group:1,character:'child'}]}] };
  const rows = storyPerformance(win);
  assert.deepEqual(rows.map(r=>[r.shot,r.event]), [[2,1],[2,2],[2,3],[2,4],[2,5],[4,1]]);
  assert.equal(rows[1].quote,'Actual line');
  assert.ok([0,2,3,4].every(i=>rows[i].unresolved === true && rows[i].quote === ''));
  assert.deepEqual(storySpeech(win).map(r=>[r.shot,r.group]), [[2,2],[4,1]]);
});
test('unknown speakers, duplicate/missing speech, fabricated action quotes and malformed action text fail', () => {
  let w = board(); w.SCENES[0].narration[0].speaker = 'other';
  assert.match(checkStory(w).join(), /speaker/);
  w = board(); w.SCENES[0].performance.push({...w.SCENES[0].performance[0]});
  assert.match(checkStory(w).join(), /unique narration/);
  w = board(); w.STORY.ending.quote = 'They fly away.';
  assert.match(checkStory(w).join(), /exact observable/);
  w = board(); w.SCENES[2].performance[0].text = 12;
  assert.match(checkStory(w).join(), /action requires|exact observable/);
});
test('reused shot transcripts cannot cite speech beyond the clip duration', () => {
  const w = board();
  w.SCENES[0].duration = 3;
  w.SCENES[0].visual = {reuse: {clip: 'recording.mp4'}};
  w.SCENES[0].narration = [];
  w.STORY.transcripts = [{shot: 1, source: 'recording.mp4', groups: [
    {text: 'Have you eaten?', speaker: 'child', start: 0, end: 3}
  ]}];
  assert.deepEqual(checkStory(w, {requireReview: false}), []);
  Object.assign(w.STORY.transcripts[0].groups[0], {start: 30, end: 35});
  assert.match(checkStory(w, {requireReview: false}).join(), /within the reused clip/);
});
