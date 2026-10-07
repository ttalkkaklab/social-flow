import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const root = path.resolve(import.meta.dirname, '../..');
const builder = readFileSync(path.join(root, 'skills/produce/references/build-reel.sh'), 'utf8');
const start = builder.indexOf('  # Non-ASCII glued right after a variable');
const end = builder.indexOf('\ndone 3< cards.resolved.tsv', start);
assert.ok(start >= 0 && end > start, 'exercise the actual per-card reporting block');
const reporting = builder.slice(start, end);

function report({grouped, visuals, legacyReport}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'build-report-'));
  try {
    mkdirSync(path.join(dir, 'work'));
    if (legacyReport !== undefined) writeFileSync(path.join(dir, 'work/rt0.txt'), legacyReport);
    const run = spawnSync('bash', ['-c', `set -euo pipefail
TOTF=200; FRAMES=100; WARN=0
say() { printf '%s\\n' "$1"; printf '%s\\n' "$1" >> build-report.txt; }
${reporting}
printf '%s %s %s\\n' "$TOTF" "$FRAMES" "$WARN" > state.txt
`], {cwd: dir, encoding: 'utf8', env: {...process.env, GROUPED: String(grouped), MV: String(visuals), IDX: '0'}});
    return {
      ...run,
      report: existsSync(path.join(dir, 'build-report.txt')) ? readFileSync(path.join(dir, 'build-report.txt'), 'utf8') : '',
      state: existsSync(path.join(dir, 'state.txt')) ? readFileSync(path.join(dir, 'state.txt'), 'utf8') : '',
      rtExists: existsSync(path.join(dir, 'work/rt0.txt')),
    };
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
}

for (const visuals of [1, 3]) test(`direct video groups report ${visuals} sources without a legacy rt file`, () => {
  const run = report({grouped: 1, visuals});
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stderr, '');
  assert.equal(run.stdout, `  └ direct video groups ${visuals}\n`);
  assert.equal(run.report, run.stdout);
  assert.equal(run.state, '200 100 0\n', 'reporting must not change the frame clock or warning state');
  assert.equal(run.rtExists, false, 'reporting must not synthesize a timing file');
});

test('direct groups do not consume a stale legacy reveal report', () => {
  const run = report({grouped: 1, visuals: 3, legacyReport: 'STALE REVEAL TIMING\n'});
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stderr, '');
  assert.equal(run.stdout, '  └ direct video groups 3\n');
  assert.equal(run.report, run.stdout);
});

test('legacy multi-visual cards retain their reveal timing report', () => {
  const timing = '        3.96s +0.35s  pause-aligned\n        9.34s +0.29s  pause-aligned\n';
  const run = report({grouped: 0, visuals: 3, legacyReport: timing});
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stderr, '');
  assert.equal(run.stdout, '  └ reveal 3 states\n' + timing);
  assert.equal(run.report, run.stdout);
  assert.equal(run.state, '200 100 0\n');
});

test('legacy single-visual cards do not request a timing report', () => {
  const run = report({grouped: 0, visuals: 1});
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stderr, '');
  assert.equal(run.stdout, '');
  assert.equal(run.report, '');
});
