import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function fixture(t, committed = '// clean\n') {
  const root = mkdtempSync(join(tmpdir(), 'check-dist-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'server/dist'), { recursive: true });
  copyFileSync(new URL('../check-dist.mjs', import.meta.url), join(root, 'server/check-dist.mjs'));
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
  const write = text => writeFileSync(join(root, 'server/dist/bundle.js'), text);
  git('init');
  write(committed);
  git('add', '.');
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid',
    '-c', 'commit.gpgsign=false', 'commit', '-m', 'fixture');
  return { root, git, write, run: () => spawnSync(process.execPath, ['server/check-dist.mjs'], {
    cwd: root, encoding: 'utf8',
  }) };
}

test('dist freshness accepts a clean tree', t => {
  const result = fixture(t).run();
  assert.equal(result.status, 0, result.stderr);
});

test('dist freshness diagnoses the committed bundle after a clean rebuild', t => {
  const f = fixture(t, '// node_modules/../lib node_modules/../other /Volumes/disk /Users/test\n');
  f.write('// clean rebuild\n');
  const result = f.run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /HEAD .*node_modules\/\.\.\/=2, \/Volumes=1, \/Users=1/);
  assert.match(result.stderr, /Working tree .*node_modules\/\.\.\/=0, \/Volumes=0, \/Users=0/);
  assert.match(result.stderr, /워크트리 안에서 npm ci 뒤 다시 빌드/);
});

test('dist freshness diagnoses paths introduced by the local build', t => {
  const f = fixture(t);
  f.write('// /Users/test\n');
  const result = f.run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Working tree .*\/Users=1/);
  assert.match(result.stderr, /워크트리 안에서 npm ci 뒤 다시 빌드/);
});

test('ordinary staged drift fails with zero counts and no symlink hint', t => {
  const f = fixture(t);
  f.write('// changed source\n');
  f.git('add', 'server/dist/bundle.js');
  const result = f.run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /HEAD .*\/Users=0/);
  assert.doesNotMatch(result.stderr, /워크트리 안에서/);
});

test('untracked dist output fails freshness', t => {
  const f = fixture(t);
  writeFileSync(join(f.root, 'server/dist/extra.js'), '// new output\n');
  const result = f.run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /extra\.js/);
});

test('a missing bundle still fails and preserves committed path evidence', t => {
  const f = fixture(t, '// /Volumes/disk\n');
  rmSync(join(f.root, 'server/dist/bundle.js'));
  const result = f.run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Working tree .*unable to read/);
  assert.match(result.stderr, /워크트리 안에서 npm ci 뒤 다시 빌드/);
});
