import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// blenderBin() is what capability_status reports under 3d_generation and what bake-blender.py
// spawns — the two must agree on the search order: BLENDER first, then the known install paths.
test('BLENDER env wins when it points at an existing file', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blender-bin-'));
  const fake = path.join(dir, 'Blender');
  fs.writeFileSync(fake, '#!/bin/sh\n', { mode: 0o755 });   // blenderBin only accepts an executable
  const saved = process.env.BLENDER;
  process.env.BLENDER = fake;
  try {
    const { blenderBin } = await import('../dist/config.js');
    assert.equal(blenderBin(), fake);
  } finally {
    if (saved === undefined) delete process.env.BLENDER; else process.env.BLENDER = saved;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a BLENDER path that exists but cannot be executed is not reported as the binary', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blender-noexec-'));
  const fake = path.join(dir, 'Blender');
  fs.writeFileSync(fake, '#!/bin/sh\n', { mode: 0o644 });
  const saved = process.env.BLENDER;
  process.env.BLENDER = fake;
  try {
    const { blenderBin } = await import('../dist/config.js');
    assert.notEqual(blenderBin(), fake);
  } finally {
    if (saved === undefined) delete process.env.BLENDER; else process.env.BLENDER = saved;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a missing BLENDER path falls through to the install search, never to the bogus value', async () => {
  const saved = process.env.BLENDER;
  process.env.BLENDER = '/nonexistent/blender-for-test';
  try {
    const { blenderBin } = await import('../dist/config.js');
    assert.notEqual(blenderBin(), '/nonexistent/blender-for-test');
  } finally {
    if (saved === undefined) delete process.env.BLENDER; else process.env.BLENDER = saved;
  }
});

test('3d_generation lists blender as a local provider with an install hint', async () => {
  const { capabilityStatus } = await import('../dist/capability-status.js');
  const cap = capabilityStatus().capabilities.find((c) => c.capability === '3d_generation');
  const blender = cap.providers.find((p) => p.provider.startsWith('blender'));
  assert.ok(blender, 'blender provider present');
  assert.match(blender.needs, /brew install --cask blender|BLENDER=/);
  assert.match(blender.note, /bake-blender\.py/);
  // A local install is not a one-env-var offer, so it never appears in setupOffers.
  assert.ok(!capabilityStatus().setupOffers.some((o) => /Blender/i.test(o.env)));
});
