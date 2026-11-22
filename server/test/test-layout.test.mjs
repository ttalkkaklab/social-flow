// Test files are named after the module they test (CLAUDE.md, "Tests — few, one file per module").
// A file named after a task or a directive fails here: add its cases to the module's file instead.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import path from 'node:path';

const here = import.meta.dirname;
const repo = path.resolve(here, '../..');

// Repository-wide contracts and the legacy visual-direction suite spanning chart rendering and assembly.
const CROSS_CUTTING = new Set(['contract', 'check-dist', 'bundle-parse', 'test-layout', 'visual-direction']);

function moduleNames() {
  const names = new Set(readdirSync(path.join(repo, 'server/src')).map(f => f.replace(/\.ts$/, '')));
  for (const f of readdirSync(path.join(repo, 'skills'), { recursive: true })) {
    if (/\.(c?js|mjs|py|sh)$/.test(f)) names.add(path.basename(f).replace(/\.[^.]+$/, ''));
  }
  return names;
}

test('every test file is named after the module it tests', () => {
  const modules = moduleNames();
  const orphans = readdirSync(here)
    .filter(f => f.endsWith('.test.mjs'))
    .map(f => f.slice(0, -'.test.mjs'.length))
    .filter(name => !modules.has(name) && !CROSS_CUTTING.has(name));
  assert.deepEqual(orphans, [], 'move these cases into server/test/<module>.test.mjs of the module they exercise');
});
