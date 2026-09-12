import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ref = path.resolve(import.meta.dirname, '../../skills/produce/references');
const reel = readFileSync(path.join(ref, 'build-reel.sh'), 'utf8');
const outro = readFileSync(path.join(ref, 'build-outro.sh'), 'utf8');

test('assembly preserves source audio and alignment tempo with legacy rate settings', t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'assembly-tempo-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(path.join(dir, 'work'));
  const source = Buffer.from('unchanged narration samples');
  writeFileSync(path.join(dir, 'work/t0.wav'), source);
  // Execute the production audio stage; fail if it attempts a tempo filter.
  const stage = reel.slice(reel.indexOf('  # ── 3)'), reel.indexOf('  L=$(ffprobe', reel.indexOf('  # ── 3)')));
  assert.ok(stage.includes('work/s$IDX.wav'));
  for (const rate of ['2', '5.2', '9', '0']) {
    const run = spawnSync('bash', ['-c', `set -eu\nffmpeg() { return 99; }\nIDX=0\n${stage}\nprintf '%s' "$F"`], {
      cwd: dir, encoding: 'utf8',
      env: { ...process.env, TARGET: '5.2', R0: rate, RATE_TOL: '0.05', ATEMPO_MIN: '0.88', ATEMPO_MAX: '1.128', MUTE: '0' },
    });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, '1.0000');
    assert.deepEqual(readFileSync(path.join(dir, 'work/s0.wav')), source);
  }
  assert.doesNotMatch(reel, /-af\s+"atempo=/);
});

test('outro reports speech rate without stretching even with legacy bounds', () => {
  const stage = outro.slice(outro.indexOf('# ── 1.5)'), outro.indexOf('# ── 2)'));
  assert.ok(stage.includes('CHARS'));
  const run = spawnSync('bash', ['-c', `set -eu\nffmpeg() { return 99; }\n${stage}`], {
    encoding: 'utf8',
    env: { ...process.env, CHARS: '26', L: '5', TARGET_RATE: '4.4', ATEMPO_MIN: '0.88', ATEMPO_MAX: '1.128' },
  });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /5.20 chars\/s → atempo x1.0000/);
  assert.doesNotMatch(outro, /-af\s+"atempo=/);
});

test('assembly and final speed pass do not forward obsolete per-card bounds', () => {
  for (const name of ['build-reel.sh', 'speedup.sh']) {
    const script = readFileSync(path.join(ref, name), 'utf8');
    assert.match(script, /checkTempo\(process.cwd\(\),speed\)/);
    assert.doesNotMatch(script, /\$\{ATEMPO_(MIN|MAX)/);
  }
});
