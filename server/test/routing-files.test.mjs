import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { atomicJson } from '../dist/routing-files.js';

test('atomicJson writes, syncs and renames without a read-only fsync', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-json-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'nested', 'receipt.json');
  atomicJson(file, { status: 'submitting' });
  atomicJson(file, { status: 'submitted', jobId: 'j1' });
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { status: 'submitted', jobId: 'j1' });
  assert.deepEqual(fs.readdirSync(path.dirname(file)), ['receipt.json']);
  if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o777, 0o600);
});
