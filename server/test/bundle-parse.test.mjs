// The bundle is the only entry point a marketplace install runs (.mcp.json → server/dist/bundle.js),
// and no other test imports it — so a syntax error in it (a banner identifier redeclared by a
// source import, say) reached a release once. This is the parse gate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, copyFileSync, cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const bundle = join(here, '..', 'dist', 'bundle.js');

test('installed server and shot runtime bundles parse as modules (node --check)', () => {
  for (const file of [bundle, join(here, '..', 'dist', 'astra-shot-runtime.bundle.js')]) {
    const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    assert.equal(r.status, 0, `node --check failed for ${file}:\n${r.stderr}`);
  }
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


test('a running installed bundle reports disk replacement without claiming it reloaded', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sf-runtime-'));
  mkdirSync(join(dir, 'server', 'dist'), { recursive: true });
  const copy = join(dir, 'server', 'dist', 'bundle.js');
  copyFileSync(bundle, copy);
  cpSync(join(here, '../../skills'), join(dir, 'skills'), { recursive: true });
  const board = join(dir, 'board'); mkdirSync(board);
  writeFileSync(join(board, 'scenes.js'), 'window.SCENES = [{id:"s0001",type:"points",narration:[]}];');
  const p = spawn(process.execPath, [copy], { cwd: dir, env: process.env });
  const send = message => p.stdin.write(JSON.stringify(message) + '\n');
  try {
    const responses = await new Promise((resolve, reject) => {
      const results = []; let buffer = '';
      const timer = setTimeout(() => reject(new Error('runtime smoke timed out')), 10000);
      const call = id => send({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'storyboard_read', arguments: { path: board, includeTechniques: false } } });
      p.on('error', error => { clearTimeout(timer); reject(error); });
      p.stdout.on('data', data => {
        buffer += data;
        let end;
        while ((end = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
          let reply; try { reply = JSON.parse(line); } catch { continue; }
          if (reply.id === 1) { send({ jsonrpc: '2.0', method: 'notifications/initialized' }); call(2); }
          if (reply.id === 2 || reply.id === 3) {
            try {
              assert.ok(!reply.result.isError);
              results.push(JSON.parse(reply.result.content[0].text));
              if (reply.id === 2) { appendFileSync(copy, '\n// disk-only replacement\n'); call(3); }
              else { clearTimeout(timer); resolve(results); }
            } catch (error) { clearTimeout(timer); reject(error); }
          }
        }
      });
      send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'runtime-test', version: '1' } } });
    });
    assert.equal(responses[0].runtime.loadedModuleSha256, responses[0].runtime.diskModuleSha256);
    assert.equal(responses[1].runtime.loadedModuleSha256, responses[0].runtime.loadedModuleSha256);
    assert.notEqual(responses[1].runtime.loadedModuleSha256, responses[1].runtime.diskModuleSha256);
    assert.equal(responses[1].boundaryReview.status, 'not_reviewed');
  } finally { p.kill(); rmSync(dir, { recursive: true, force: true }); }
});
