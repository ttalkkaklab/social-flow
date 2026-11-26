import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const require = createRequire(import.meta.url);
const cli = require.resolve('../../skills/storyboard/references/revise-story-documents.js');
const { prepare } = require(cli);
const { version } = require('../../.claude-plugin/plugin.json');
const sha = content => createHash('sha256').update(content).digest('hex');
const run = promisify(execFile);

function board(t) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'story-docs-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const directory = path.join(root, 'storyboard');
  mkdirSync(directory);
  const scenes = 'window.SCENES = [];\n';
  writeFileSync(path.join(directory, 'scenes.js'), scenes);
  writeFileSync(path.join(directory, 'index.html'), '<title>Preview</title>');
  writeFileSync(path.join(directory, 'cast.json'), JSON.stringify({ characters: [{ id: 'clerk', source: 'identity.md' }] }));
  writeFileSync(path.join(directory, 'identity.md'), 'The night clerk.');
  writeFileSync(path.join(root, 'research.md'), '## Verified\n| # | Claim | Source |\n|---|---|---|\n| 7 | The lock was changed. | Work order |\n');
  return { directory, scenes, request: documents => ({ expectedStoryboardSha256: sha(scenes), documents }) };
}

function scenario(character = 'clerk', claim = 7) {
  const data = {
    kind: 'fiction', expression: 'visual', engine: 'curiosity', primaryHookType: 'in_medias_res', reveal: 'none',
    premise: 'A key fails.', message: 'A familiar key can mislead.', viewerExperience: 'Recognize the new lock.',
    endingReason: 'The clerk finds the work order.', difference: 'The lock provides the answer.',
    cast: [{ id: character, role: 'Keeper', want: 'Enter', voice: 'Quiet', reason: 'Owns the key' }], setups: [],
    beats: [{ item: 'Lock', expectation: 'The key fits', change: 'It stops', necessity: 'Prompts a search',
      events: [{ kind: 'action', character, text: 'The clerk traces the new lock.', basis: 'fact', claims: [claim] }] }],
  };
  return '---\nversion: scenario-v2\nchannel: test\ntopic: key\ndirection: D1\n---\n```scenario-json\n' + JSON.stringify(data) + '\n```\n';
}

test('the installed command previews, writes and resumes a partially applied document request', t => {
  const { directory, scenes, request } = board(t);
  const original = 'Original scene plan\n';
  writeFileSync(path.join(directory, 'storyboard.md'), original);
  const documents = [
    { name: 'scenario.md', content: scenario(), expectedSha256: null },
    { name: 'storyboard.md', content: 'Revised scene plan\n', expectedSha256: sha(original) },
    { name: 'script.md', content: 'The key sticks.\n', expectedSha256: null },
    { name: 'review-localization.json', content: JSON.stringify({ version: 1, sourceLanguage: 'en', languages: ['en', 'ko'],
      entries: [{ source: 'The key sticks.', translations: { ko: '열쇠가 걸린다.' } }] }), expectedSha256: null },
  ];
  const json = JSON.stringify(request(documents));
  const invoke = (input, ...flags) => {
    const result = spawnSync(process.execPath, [cli, directory, input, ...flags], { input: json, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };
  const filesBefore = readdirSync(directory).sort();
  const preview = invoke('-', '--dry-run');
  assert.equal(preview.pluginVersion, version);
  assert.equal(preview.boardSha256, sha(scenes));
  assert.equal(preview.dryRun, true);
  assert.deepEqual(preview.files, documents.map(doc => ({ path: path.join(directory, doc.name),
    beforeSha256: doc.expectedSha256, afterSha256: sha(doc.content), status: 'wouldWrite' })));
  assert.deepEqual(readdirSync(directory).sort(), filesBefore);
  assert.equal(readFileSync(path.join(directory, 'storyboard.md'), 'utf8'), original);

  writeFileSync(path.join(directory, 'scenario.md'), documents[0].content);
  const file = path.join(path.dirname(directory), 'request.json');
  writeFileSync(file, json);
  const saved = invoke(file);
  assert.equal(saved.dryRun, false);
  assert.deepEqual(saved.files.map(row => row.status), ['current', 'written', 'written', 'written']);
  for (const doc of documents) assert.equal(readFileSync(path.join(directory, doc.name), 'utf8'), doc.content);
  assert.ok(invoke('-').files.every(row => row.status === 'current' && row.beforeSha256 === row.afterSha256));
  assert.equal(readFileSync(path.join(directory, 'scenes.js'), 'utf8'), scenes);
  assert.equal(readFileSync(path.join(directory, 'index.html'), 'utf8'), '<title>Preview</title>');
});

test('preflight rejects stale heads, out-of-scope names, symlinks and invalid episode inputs', t => {
  const { directory, request } = board(t);
  const draft = { name: 'storyboard.md', expectedSha256: null, content: 'First revision.' };
  const attempts = [
    { ...request([draft]), expectedStoryboardSha256: '0'.repeat(64) },
    request([draft, { name: 'script.md', content: 'Stale', expectedSha256: '0'.repeat(64) }]),
    request([draft, draft]),
    ...['../file', 'scenes.js', 'index.html'].map(name => request([{ ...draft, name }])),
    request([draft, { name: 'scenario.md', content: scenario('outsider'), expectedSha256: null }]),
    request([draft, { name: 'scenario.md', content: scenario('clerk', 8), expectedSha256: null }]),
    request([draft, { name: 'review-localization.json', content: '{}', expectedSha256: null }]),
  ];
  for (const attempt of attempts) assert.throws(() => prepare(directory, attempt));
  symlinkSync(path.join(directory, 'index.html'), path.join(directory, 'script.md'));
  assert.throws(() => prepare(directory, request([draft, { ...draft, name: 'script.md' }])));
  assert.ok(!readdirSync(directory).includes('storyboard.md'));
});

test('concurrent commands with the same expected hashes commit one complete revision', async t => {
  const { directory, request } = board(t);
  const names = ['storyboard.md', 'script.md'];
  const writers = ['First', 'Second'].map(content => {
    const input = path.join(path.dirname(directory), content + '.json');
    writeFileSync(input, JSON.stringify(request(names.map(name => ({ name, content, expectedSha256: null })))));
    return run(process.execPath, [cli, directory, input], { encoding: 'utf8' });
  });
  const finished = await Promise.allSettled(writers);
  assert.equal(finished.filter(result => result.status === 'fulfilled').length, 1);
  const conflict = finished.find(result => result.status === 'rejected');
  assert.match(JSON.parse(conflict.reason.stderr).error, /head_moved/);
  const contents = names.map(name => readFileSync(path.join(directory, name), 'utf8'));
  assert.equal(contents[0], contents[1]);
  assert.ok(['First', 'Second'].includes(contents[0]));
});
