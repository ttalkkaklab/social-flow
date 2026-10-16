import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '../../skills/storyboard/references');
const { checkScenarioV2, observableOpeningSignature } = require(path.join(root, 'scenario-v2.js'));
const { checkStory: inspectStory, storyHash, storySpeech } = require(path.join(root, 'story-contract.js'));
// These unit cases explicitly exercise optional review diagnostics.
const checkStory = (win, options = {}) => inspectStory(win, { requireReview: true, ...options });
const { storyPerformance } = require(path.join(root, 'story-performance.js'));
const meta = { version: 'scenario-v2', channel: 'test', topic: 'bowl', direction: 'D1' };
const pool = [{ id: 'father', source: 'identity.md' }, { id: 'child', source: 'identity.md' }];
function candidate() {
  return { kind: 'fiction', expression: 'mixed', engine: 'empathy', reveal: 'none',
    premise: 'A child notices a parent going hungry.', viewerExperience: 'Recognize care in a small action.',
    message: 'Care becomes mutual.', endingReason: 'The child reciprocates.', difference: 'Recognition through the empty pot.',
    cta: 'none', setups: [], cast: pool.map(c => ({ id: c.id, role: c.id, want: 'Protect the other', voice: 'Reserved', reason: 'The relationship changes' })),
    beats: ['훅', '전개 #1', '전개 #2', '전개 #3', '마무리', 'CTA'].map((item, i) => ({ item,
      expectation: 'The parent has eaten', change: 'The child notices', necessity: 'Build recognition',
      events: i === 5 ? [] : [{ kind: 'action', character: i % 2 ? 'child' : 'father', text: 'Shares the last bowl of rice.', basis: 'invented' }] })) };
}
const body = c => '```scenario-json\n' + JSON.stringify(c) + '\n```\n';
const run = (c, research) => checkScenarioV2(meta, body(c), research, { pool }).findings;
test('fiction works without research, a factual wow, a narrator or a second engine', () => {
  assert.deepEqual(run(candidate()), []);
});
test('CTA row and metadata are optional and never prescribe placement or wording', () => {
  const c = candidate(); delete c.cta; c.beats.pop();
  assert.deepEqual(run(c), []);
  c.cta = 'custom invitation';
  c.beats.splice(1, 0, { item: 'CTA', events: [{kind:'dialogue', character:'child', to:'audience', text:'Please subscribe.', basis:'invented'}] });
  assert.deepEqual(run(c), []);
  c.beats[1].events = 'broken';
  assert.ok(run(c).some(f => f.level === 'bad' && /needs events/.test(f.what)));
});
test('creative outline and freeze differences guide authoring without weakening readable event shapes', () => {
  const c = candidate(); c.beats[0].item = 'A different opening';
  const result = checkScenarioV2(meta, body(c), null, { pool, chosen:true, hasScenes:true }).findings;
  assert.equal(result.filter(f => f.level === 'bad').length, 0);
  assert.ok(result.some(f => /Suggested structure/.test(f.what)));
  assert.ok(result.some(f => /freeze stamp/.test(f.what)));
  c.beats[0].events = { text: 'Not an array' };
  assert.ok(run(c).some(f => f.level === 'bad' && /needs events/.test(f.what)));
});
test('factual and adapted claims cannot bypass evidence; inventions stay explicitly marked', () => {
  const c = candidate(); c.kind = 'evidence';
  assert.match(JSON.stringify(run(c)), /invented events/);
  c.kind = 'fiction'; c.beats[0].events[0].basis = 'fact'; c.beats[0].events[0].claims = [1];
  assert.match(JSON.stringify(run(c)), /Verified/);
  const research = '## Verified\n| # | Claim | Source |\n|---|---|---|\n| 1 | Real event | official record |\n';
  assert.deepEqual(run(c, research), []);
  c.kind = 'adapted'; assert.match(JSON.stringify(run(c, research)), /adaptationBoundary/);
  c.adaptationBoundary = 'First event documented; the family and dialogue are invented.';
  assert.deepEqual(run(c, research), []);
});
test('unknown cast, missing events and unearned held reveals fail', () => {
  const c = candidate(); c.beats[0].events[0].character = 'stranger';
  assert.match(JSON.stringify(run(c)), /not cast/);
  c.beats[0].events = []; assert.match(JSON.stringify(run(c)), /observable/);
  c.reveal = 'held'; assert.match(JSON.stringify(run(c)), /planted/);
});
test('candidate CLI accepts three distinct stories sharing an engine and rejects broken pool paths', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'scenario-v2-'));
  try {
    mkdirSync(path.join(dir, 'candidates')); writeFileSync(path.join(dir, 'identity.md'), '# Character');
    writeFileSync(path.join(dir, 'cast.json'), JSON.stringify({ characters: pool }));
    for (let i = 1; i <= 3; i++) writeFileSync(path.join(dir, 'candidates', `d${i}.md`),
      `---\nversion: scenario-v2\nchannel: test\ntopic: bowl\ndirection: D${i}\nfrozen:\n---\n` + body({ ...candidate(), premise: 'Distinct situation ' + i }));
    const cli = () => spawnSync(process.execPath, [path.join(root, 'check-scenario.js'), path.join(dir, 'candidates'), '--json'], { encoding: 'utf8' });
    assert.equal(cli().status, 0, cli().stdout);
    writeFileSync(path.join(dir, 'cast.json'), JSON.stringify({ characters: [{ id: 'father', source: 'missing.md' }] }));
    assert.equal(cli().status, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('candidate CLI warns on copied first four event sequences despite different premises and endings', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'scenario-openings-'));
  try {
    mkdirSync(path.join(dir, 'candidates')); writeFileSync(path.join(dir, 'identity.md'), '# Character');
    writeFileSync(path.join(dir, 'cast.json'), JSON.stringify({ characters: pool }));
    const candidates = [1, 2, 3].map(i => {
      const c = candidate(); c.premise = 'Different author intention ' + i;
      c.difference = 'Claimed different choice ' + i;
      c.beats[4].events[0].text = 'Ending demand ' + i;
      return c;
    });
    const check = () => {
      candidates.forEach((c, i) => writeFileSync(path.join(dir, 'candidates', `d${i + 1}.md`),
        `---\nversion: scenario-v2\nchannel: test\ntopic: bowl\ndirection: D${i + 1}\nfrozen:\n---\n` + body(c)));
      const result = spawnSync(process.execPath, [path.join(root, 'check-scenario.js'), path.join(dir, 'candidates'), '--json'], { encoding: 'utf8' });
      assert.equal(result.status, 0, result.stdout);
      return JSON.parse(result.stdout);
    };
    let result = check();
    assert.equal(result.violations, 0);
    assert.equal(result.findings.filter(f => f.what.startsWith('V2 shared causal opening')).length, 1);
    assert.match(result.findings.find(f => f.what.startsWith('V2 shared causal opening')).what, /d1.md, d2.md, d3.md/);
    // A shared cast/setup is not enough: different observable developments avoid this exact-copy warning.
    candidates[1].beats[2].events[0].text = 'The child refuses the bowl and leaves.';
    candidates[2].beats[1].events[0].text = 'The parent brings a second bowl from the kitchen.';
    result = check();
    assert.equal(result.findings.filter(f => f.what.startsWith('V2 shared causal opening')).length, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('candidate CLI accepts one readable candidate despite creative metadata gaps but rejects unreadable input', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'scenario-guidance-'));
  try {
    mkdirSync(path.join(dir,'candidates')); writeFileSync(path.join(dir,'identity.md'),'# Character');
    writeFileSync(path.join(dir,'cast.json'),JSON.stringify({characters:pool}));
    const file=path.join(dir,'candidates/d1.md'), c=candidate();
    delete c.viewerExperience; delete c.message; c.beats.pop();
    const save = value => writeFileSync(file,'---\nversion: scenario-v2\nchannel: test\ntopic: bowl\ndirection: D1\n---\n'+body(value));
    const cli=()=>spawnSync(process.execPath,[path.join(root,'check-scenario.js'),path.dirname(file),'--json'],{encoding:'utf8'});
    save(c); let result=cli(); assert.equal(result.status,0,result.stdout);
    assert.equal(JSON.parse(result.stdout).files.length,1);
    assert.ok(JSON.parse(result.stdout).warnings > 0);
    c.beats[0].events = 'not an array'; save(c); result=cli();
    assert.equal(result.status,1); assert.match(result.stdout,/needs events/);
    writeFileSync(file,'---\nversion: scenario-v2\n---\n```scenario-json\n{broken\n```');
    assert.equal(cli().status,1);
  } finally {rmSync(dir,{recursive:true,force:true});}
});
test('opening comparison ignores only metadata/whitespace and retains actor, order, recipient and event kind', () => {
  const original = candidate(), changed = candidate();
  changed.beats[0].expectation = 'Different expectation';
  changed.beats[0].events[0].text = ' Shares  the last\n bowl of rice. ';
  assert.equal(observableOpeningSignature(original), observableOpeningSignature(changed));
  for (const key of ['kind', 'character', 'to']) {
    const other = candidate(); other.beats[0].events[0][key] = key === 'kind' ? 'dialogue' : 'child';
    assert.notEqual(observableOpeningSignature(original), observableOpeningSignature(other));
  }
  const ordered = candidate(); ordered.beats[0].events.push({ kind: 'action', character: 'child', text: 'Refuses the bowl.' });
  const reversed = structuredClone(ordered); reversed.beats[0].events.reverse();
  assert.notEqual(observableOpeningSignature(ordered), observableOpeningSignature(reversed));
  assert.equal(observableOpeningSignature({ beats: [] }), null);
  const malformed = candidate(); malformed.beats[0].events = [];
  assert.equal(observableOpeningSignature(malformed), null);
});
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
    endingReason: 'A reciprocal action resolves the question.', cast: candidate().cast.map(c => ({...c, source: 'identity.md'})),
    beats: [1, 2, 3].map(shot => ({shot, change: 'Recognition develops', necessity: 'Connect care to action'})) }
  };
  const events = storyPerformance(w), ref = e => ({ shot: e.shot, event: e.event, quote: e.quote });
  w.STORY.opening = ref(events[0]); w.STORY.payoff = ref(events[2]); w.STORY.ending = ref(events[3]);
  w.STORY.review = { hash: storyHash(w), verdict: 'pass', unresolved: [],
    ...Object.fromEntries(['meaning','progression','payoff','grounding','character'].map(k => [k, { reason: 'Observed reciprocal care', refs: [ref(events[3])] }])) };
  return w;
}
test('dialogue and silent action deliver meaning without a spoken thesis', () => {
  assert.deepEqual(checkStory(board()), []);
});

test('automatic story checks never demand or fabricate a reviewed pass', () => {
  const w = board(); delete w.STORY.review;
  assert.deepEqual(inspectStory(w), []);
  assert.equal(w.STORY.review, undefined);
  assert.match(inspectStory(w, {requireReview:true}).join(), /review is absent/);
  w.STORY.review = {hash:'old', verdict:'fail', unresolved:['Needs improvement']};
  const before = JSON.stringify(w);
  assert.deepEqual(inspectStory(w), []);
  assert.match(inspectStory(w, {requireReview:true}).join(), /stale|unresolved/);
  assert.equal(JSON.stringify(w), before);
});
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
test('whole-story extraction attributes speech and includes silent actions, never author intent', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'performance-'));
  try {
    const w = board(); writeFileSync(path.join(dir, 'scenes.js'), Object.entries(w).map(([k,v]) => `window.${k}=${JSON.stringify(v)};`).join('\n'));
    const r = spawnSync(process.execPath, [path.join(root, 'check-story.js'), dir, '--text'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /dialogue · child → father/);
    assert.match(r.stdout, /empty pot/); assert.doesNotMatch(r.stdout, /Care becomes mutual/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('unknown speakers, duplicate/missing speech and fabricated action quotes fail', () => {
  let w = board(); w.SCENES[0].narration[0].speaker = 'other';
  assert.match(checkStory(w).join(), /speaker/);
  w = board(); w.SCENES[0].performance.push({...w.SCENES[0].performance[0]});
  assert.match(checkStory(w).join(), /unique narration/);
  w = board(); w.STORY.ending.quote = 'They fly away.';
  assert.match(checkStory(w).join(), /exact observable/);
});
test('action and cast edits stale the review; camera changes do not', () => {
  for (const edit of [w => w.SCENES[2].performance[0].text += ' Again.', w => w.STORY.cast[0].want = 'Hide the food',
    w => w.SCENES[0].narration[0].speaker = 'father', w => w.SCENES[1].visual = {action: 'Changed action'}]) {
    const w = board(); edit(w); assert.match(checkStory(w).join(), /stale/);
  }
  const w = board(); w.SCENES[0].visual = {camera: {movement: 'dolly'}};
  assert.deepEqual(checkStory(w), []);
});

test('speech production receipts do not invalidate editorial review, delivery changes do', () => {
  const w = board();
  w.SCENES[0].narration[0].audio = {path: 'take.wav', status: 'not_reviewed'};
  w.SCENES[0].narration[0].mediaStatus = 'ready';
  assert.deepEqual(checkStory(w), []);
  w.SCENES[0].narration[0].delivery = 'off_screen';
  assert.match(checkStory(w).join(), /stale/);
});
test('all-visual fiction can be reviewed and live transcript errors fail cleanly', () => {
  const w = board();
  w.SCENES.forEach((s, i) => { s.duration = 3; s.narration = []; s.performance = [{kind: 'action', character: i === 0 ? 'father' : 'child', text: 'The family exchanges food and looks.'}]; });
  w.STORY.expression = 'visual';
  for (const [key, shot] of [['opening',1], ['payoff',2], ['ending',3]]) w.STORY[key] = {shot,event:1,quote:w.SCENES[shot-1].performance[0].text};
  assert.deepEqual(checkStory(w, {requireReview:false}), []);
  w.STORY.transcripts = [{shot:2,groups:{}}];
  assert.match(checkStory(w, {requireReview:false}).join(), /transcript/);
});

test('malformed event text and invalid expression fail without throwing', () => {
  for (const expression of ['dialogue', 'narration']) {
    const malformed = candidate(); malformed.expression = expression; malformed.beats[0].events = [null];
    assert.match(JSON.stringify(run(malformed)), /events need kind and text/);
  }
  const w = board(); w.SCENES[2].performance[0].text = 12;
  assert.match(checkStory(w).join(), /action requires|exact observable/);
  const c = candidate(); c.expression = 'visual';
  c.beats[0].events[0] = {kind:'dialogue',character:'father',to:'child',text:'Eat.',basis:'invented'};
  assert.match(JSON.stringify(run(c)), /must not contain speech/);
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

test('wording extraction preserves speaker and addressee while excluding actions', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'speech-only-'));
  try {
    const w = board(); writeFileSync(path.join(dir, 'scenes.js'), Object.entries(w).map(([k,v]) => `window.${k}=${JSON.stringify(v)};`).join('\n'));
    const r = spawnSync(process.execPath, [path.join(root, 'check-story.js'), dir, '--text', '--speech'], {encoding:'utf8'});
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /child → father/); assert.doesNotMatch(r.stdout, /empty pot|shares the rice/);
  } finally { rmSync(dir, {recursive:true,force:true}); }
});

test('scene checker permits a visual close but requires the action in the production plan', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'visual-close-'));
  try {
    const w = board();
    const save = () => writeFileSync(path.join(dir,'scenes.js'), Object.entries(w).map(([k,v]) => `window.${k}=${JSON.stringify(v)};`).join('\n'));
    const cli = () => spawnSync(process.execPath,[path.join(root,'check-scenes.js'),dir,'--json'],{encoding:'utf8'});
    save(); let result = cli();
    assert.notEqual(result.status, 3, result.stderr);
    assert.doesNotMatch(result.stdout, /last narrated shot has no narration/);
    assert.match(result.stdout, /performance action is missing/);
    w.SCENES.forEach(s => {s.visual = {action:s.performance.filter(e=>e.kind==='action').map(e=>e.text).join(' ')};});
    save(); result = cli();
    assert.doesNotMatch(result.stdout, /performance action is missing/);
    // Visual/format advice does not stop this deliberately minimal draft.
    assert.equal(result.status,0);
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('CLI and browser never require CTA presence, speech, metadata or terminal placement', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'narrative-ending-'));
  const template = readFileSync(path.join(root, 'storyboard-html-template.html'), 'utf8');
  const start = template.indexOf('    mainOrder.forEach(function (o, pos) {');
  const end = template.indexOf('    // A short-form cover', start);
  assert.ok(start >= 0 && end > start);
  const checkBrowser = w => {
    const findings = [];
    runInNewContext(template.slice(start, end), { window: w, mainOrder: w.SCENES.map((s, i) => ({s, i})),
      beatOf: s => s.beat, compactLetters: s => s.replace(/\s/g, ''), flag: (level, where, what) => findings.push(what),
      T: { where: { order: 'order', share: 'share' } }, orderOk: true, orderBad: false });
    return findings.join('\n');
  };
  try {
    const w = board(); w.SCENES[2].beat = 'drip';
    const checkCli = () => {
      writeFileSync(path.join(dir, 'scenes.js'), Object.entries(w).map(([k,v]) => `window.${k}=${JSON.stringify(v)};`).join('\n'));
      const result = spawnSync(process.execPath, [path.join(root, 'check-scenes.js'), dir, '--draft', '--json'], { encoding: 'utf8' });
      assert.notEqual(result.status, 3, result.stderr);
      return JSON.parse(result.stdout).findings.map(f => f.what).join('\n');
    };
    for (const silent of [true, false]) {
      w.SCENES[2].narration = silent ? [] : [{ speaker: 'child', tts: 'Let us share.' }];
      w.SCENES[2].performance = silent ? [{kind: 'action', character: 'child', text: 'The child shares the rice.'}]
        : [{kind: 'dialogue', character: 'child', to: 'father', group: 1}];
      assert.doesNotMatch(checkCli(), /spoken CTA|share trigger/);
      assert.equal(checkBrowser(w), '');
    }
    w.STORY.cta = 'question';
    assert.doesNotMatch(checkCli(), /spoken CTA|after the cta|share trigger/);
    assert.equal(checkBrowser(w), '');
    w.SCENES[1].beat = 'cta';
    assert.doesNotMatch(checkCli(), /spoken CTA|after the cta|share trigger/);
    assert.equal(checkBrowser(w), '');
    w.STORY.version = 'story-v1'; delete w.STORY.cta;
    assert.doesNotMatch(checkCli(), /spoken CTA|after the cta|share trigger/);
    assert.equal(checkBrowser(w), '');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
