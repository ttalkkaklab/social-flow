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

// The rules file lives in the plugin tree and is read at runtime; a copy of the bundle with no
// skills/ beside it (a broken install) still has to boot and list every tool — only the three
// storyboard tools fail, at call time.
test('dist/bundle.js boots and lists tools without the skills tree', async () => {
  const { mkdtempSync, mkdirSync, copyFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(join(tmpdir(), 'sf-bundle-'));
  mkdirSync(join(dir, 'server', 'dist'), { recursive: true });
  const copy = join(dir, 'server', 'dist', 'bundle.js');
  copyFileSync(bundle, copy);
  const { spawn } = await import('node:child_process');
  const out = await new Promise((resolve) => {
    const p = spawn(process.execPath, [copy], { cwd: dir, env: process.env });
    let buf = '';
    // The tools/list reply is one long line; wait for that line to finish, not for its first bytes.
    p.stdout.on('data', (d) => { buf += d; if (/"id":2\}\r?\n/.test(buf)) { p.kill(); resolve(buf); } });
    p.on('exit', () => resolve(buf));
    const msgs = [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0' } } },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
    ];
    p.stdin.write(msgs.map((m) => JSON.stringify(m)).join('\n') + '\n');
    setTimeout(() => { p.kill(); resolve(buf); }, 8000);
  });
  assert.match(out, /"name":"storyboard_apply"/, 'tools/list did not include the storyboard tools:\n' + out.slice(0, 500));
});
