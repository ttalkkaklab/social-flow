import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import contract from '../../skills/storyboard/references/structure-contract.js';

const board = ids => ({ SCENES: ids.map(id => ({ ...(id === undefined ? {} : { id }), type: 'points', narration: [] })) });
const idFindings = findings => findings.filter(f => /^id:/.test(f.what));
test('shared ID syntax matches the server for defined IDs, including spliced shots and absent structure', () => {
  const invalid = ['return', 's123', 42, null, '', 's0001x', 'S0001'];
  const win = board(invalid); win.SCENES[0].type = 'broll';
  const original = JSON.stringify(win);
  const findings = idFindings(contract.check(win, { draft: true }));
  assert.equal(findings.length, invalid.length);
  assert.ok(findings.every(f => f.level === 'bad'));
  assert.equal(JSON.stringify(win), original);
  assert.deepEqual(idFindings(contract.check(board([undefined, 's0001', 's12345']), { draft: true })), []);
  const duplicate = idFindings(contract.check(board(['s0002', 's0002']), { draft: true }));
  assert.equal(duplicate.length, 1);
  assert.equal(duplicate[0].where, 'shot 2');
  assert.match(duplicate[0].what, /duplicate s0002 \(already used by shot 1\)/);
});

test('check-scenes CLI reports malformed/duplicate IDs without modifying boards, while legacy IDs stay optional', () => {
  const dir = mkdtempSync(join(tmpdir(), 'structure-ids-'));
  try {
    const file = join(dir, 'scenes.js');
    const run = ids => {
      const source = 'window.SCENES=' + JSON.stringify(board(ids).SCENES) + ';\n';
      writeFileSync(file, source);
      const result = spawnSync(process.execPath, ['skills/storyboard/references/check-scenes.js', dir, '--draft', '--json'], { encoding: 'utf8', cwd: new URL('../..', import.meta.url) });
      assert.equal(readFileSync(file, 'utf8'), source);
      return { status: result.status, findings: idFindings(JSON.parse(result.stdout).findings) };
    };
    const invalid = run(['return', 8, 's0001', 's0001']);
    assert.equal(invalid.status, 1);
    assert.equal(invalid.findings.length, 3);
    assert.deepEqual(run([undefined, undefined]).findings, []);
    assert.deepEqual(run(['s0001', 's12345']).findings, []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
