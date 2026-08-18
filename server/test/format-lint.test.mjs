/**
 * format-lint.test.mjs — the wrapper that hangs the linter off `npm run check`.
 *
 * format-lint.js itself lives under skills/ and has nothing to do with the server.
 * But `npm run check` is the only gate in this repo that runs automatically. Without
 * a wrapper the linter becomes a tool that runs when someone remembers, and
 * dual-maintenance drift happens exactly when someone forgets.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const LINT = resolve(HERE, '../../skills/platform-guide/references/format-lint.js');

test('inline mirrors have not drifted from the presets', () => {
  let out = '';
  try {
    out = execFileSync(process.execPath, [LINT], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    // The linter reports drift on stderr — that list should BE the failure message.
    assert.fail('format-lint failed:\n' + (e.stderr || e.stdout || e.message));
  }
  assert.match(out, /\d+ mirrors match/);
});

test('the linter actually holds rules — blocks a vacuous pass', async () => {
  const { RULES } = await import(LINT);
  assert.ok(RULES.length >= 25, `only ${RULES.length} rules — check whether something dropped out of the scan`);
  for (const r of RULES) {
    assert.ok(r.name && r.file && r.re, `a rule is missing a field: ${JSON.stringify(r)}`);
  }
});

test('the YouTube description cap is measured in bytes (5000 Korean chars is 15,000 bytes and the API rejects it)', async () => {
  const { ROUTES } = await import('../dist/handlers.js');
  assert.ok(ROUTES.youtube_publish, 'no youtube_publish route');
  // 2000 Korean chars = 6000 bytes — passes a character count, fails a byte count.
  const tooLong = '가'.repeat(2000);
  await assert.rejects(
    () => ROUTES.youtube_publish({
      videoFilePath: '/tmp/x.mp4', title: 't', caption: tooLong, thumbnailFilePath: '/tmp/x.jpg',
    }),
    /bytes/,
    'it is counting characters only — a Korean long-form description burns the whole upload and then dies on a 400',
  );
});
