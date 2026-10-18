// The bundle is the only entry point a marketplace install runs (.mcp.json → server/dist/bundle.js),
// and no other test imports it — so a syntax error in it (a banner identifier redeclared by a
// source import, say) reached a release once. This is the parse gate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
// storyboard tools fail, at call time, and they say so in words a person can act on, not as a
// zod enum built from a placeholder vocabulary.
test('dist/bundle.js boots without the skills tree; the storyboard routes name the missing structure-contract.js', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sf-bundle-'));
  mkdirSync(join(dir, 'server', 'dist'), { recursive: true });
  const copy = join(dir, 'server', 'dist', 'bundle.js');
  copyFileSync(bundle, copy);
  // Replies are long single lines; only a newline-terminated line is complete.
  const reply = (buf, id) => buf.split('\n').slice(0, -1)
    .find((l) => l.includes('"id":' + id + '}') || l.includes('"id":' + id + ','));
  const out = await new Promise((resolve) => {
    const p = spawn(process.execPath, [copy], { cwd: dir, env: process.env });
    let buf = '';
    const finish = () => { clearTimeout(timer); p.kill(); resolve(buf); };
    const timer = setTimeout(finish, 8000);
    p.stdout.on('data', (d) => { buf += d; if ([2, 3, 4, 5].every((id) => reply(buf, id))) finish(); });
    p.on('exit', finish);
    const call = (id, name) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: { path: dir } } });
    const msgs = [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0' } } },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
      call(3, 'storyboard_read'), call(4, 'storyboard_apply'), call(5, 'storyboard_check'),
    ];
    p.stdin.write(msgs.map((m) => JSON.stringify(m)).join('\n') + '\n');
  });
  const list = reply(out, 2) ?? '';
  assert.match(list, /"name":"storyboard_apply"/, 'tools/list did not include the storyboard tools:\n' + out.slice(0, 500));
  assert.match(list, /"name":"scenario_check"/, 'tools/list did not include scenario_check:\n' + out.slice(0, 500));
  for (const id of [3, 4, 5]) {
    const line = reply(out, id);
    assert.ok(line, 'no reply for call ' + id + ':\n' + out.slice(0, 400));
    assert.match(line, /structure-contract\.js/, 'call ' + id + ' did not name the missing file: ' + line.slice(0, 300));
    assert.doesNotMatch(line, /__contract-missing__/, 'call ' + id + ' leaked the placeholder vocabulary');
  }
});
