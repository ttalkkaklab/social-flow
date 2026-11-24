import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { selectPlatforms } from '../dist/live-platform-registry.js';

test('selection rejects unknown adapters and opens each selected destination only once', () => {
  assert.deepEqual(selectPlatforms(['tiktok', 'youtube', 'tiktok']), ['youtube', 'tiktok']);
  assert.throws(() => selectPlatforms(['toString']));
  assert.throws(() => selectPlatforms(['missing']));
});

test('shipped CLI routes TikTok-only recovery locally and requires a selection for mixed receipts', t => {
  const cli = fileURLToPath(new URL('../dist/character-live.bundle.js', import.meta.url));
  const dir = mkdtempSync(join(tmpdir(), 'live-room-status-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const cfg = join(dir, 'config.json');
  writeFileSync(cfg, JSON.stringify({ project: dir, character: 'host', channel: 'my-room', opening: 'Hello', chatModel: 'local', speechLanguage: 'EN-us' }));
  const receipt = { platform: 'tiktok', channel: 'my-room', state: 'encoder_finished', broadcastState: 'unverified' };
  writeFileSync(join(dir, 'tiktok.json'), JSON.stringify(receipt));
  const run = (...args) => spawnSync(process.execPath, [cli, ...args, '--out', dir, '--config', cfg], { encoding: 'utf8' });
  assert.deepEqual(JSON.parse(run('status').stdout), receipt);
  assert.match(run('end', '--tiktok').stderr, /does not support end/);
  writeFileSync(join(dir, 'youtube.json'), '{}');
  assert.match(run('status').stderr, /Choose one --platform/);
  assert.deepEqual(JSON.parse(run('status', '--platform', 'tiktok', '--tiktok').stdout), receipt);
  assert.deepEqual(JSON.parse(run('run', '--platform', 'tiktok', '--start', 'cancel').stdout), { state: 'cancelled' });
});
