import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '../../skills/storyboard/references');
const { checkScenarioV2, observableOpeningSignature } = require(path.join(root, 'scenario-v2.js'));
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
test('malformed events and speech in a visual candidate fail without throwing', () => {
  for (const expression of ['dialogue', 'narration']) {
    const malformed = candidate(); malformed.expression = expression; malformed.beats[0].events = [null];
    assert.match(JSON.stringify(run(malformed)), /events need kind and text/);
  }
  const c = candidate(); c.expression = 'visual';
  c.beats[0].events[0] = {kind:'dialogue',character:'father',to:'child',text:'Eat.',basis:'invented'};
  assert.match(JSON.stringify(run(c)), /must not contain speech/);
});
test('candidate CLI accepts three distinct stories sharing an engine and rejects broken pool paths', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'scenario-v2-'));
  try {
    mkdirSync(path.join(dir, 'candidates')); writeFileSync(path.join(dir, 'identity.md'), '# Character');
    writeFileSync(path.join(dir, 'cast.json'), JSON.stringify({ characters: pool }));
    for (let i = 1; i <= 3; i++) writeFileSync(path.join(dir, 'candidates', `d${i}.md`),
      `---\nversion: scenario-v2\nchannel: test\ntopic: bowl\ndirection: D${i}\nfrozen:\n---\n` + body({ ...candidate(), premise: 'Distinct situation ' + i }));
    const cli = () => spawnSync(process.execPath, [path.join(root, 'check-scenario.js'), path.join(dir, 'candidates'), '--json'], { encoding: 'utf8' });
    const accepted = cli();
    assert.equal(accepted.status, 0, accepted.stdout);
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
    writeFileSync(file,'---\nversion: scenario-v2\nchannel: test\ntopic: bowl\ndirection: D1\n---\n'+body(c));
    const cli=()=>spawnSync(process.execPath,[path.join(root,'check-scenario.js'),path.dirname(file),'--json'],{encoding:'utf8'});
    const result=cli(); assert.equal(result.status,0,result.stdout);
    assert.equal(JSON.parse(result.stdout).files.length,1);
    assert.ok(JSON.parse(result.stdout).warnings > 0);
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
