// The bundle is the only entry point a marketplace install runs (.mcp.json → server/dist/bundle.js),
// and no other test imports it — so a syntax error in it (a banner identifier redeclared by a
// source import, say) reached a release once. This is the parse gate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const bundle = join(here, '..', 'dist', 'bundle.js');

test('dist/bundle.js parses as a module (node --check)', () => {
  const r = spawnSync(process.execPath, ['--check', bundle], { encoding: 'utf8' });
  assert.equal(r.status, 0, `node --check failed:\n${r.stderr}`);
});
