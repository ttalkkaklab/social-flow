import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { appendFileSync, copyFileSync, cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const here = dirname(fileURLToPath(import.meta.url));
const bundle = join(here, '..', 'dist', 'bundle.js');

// The rules file lives in the plugin tree and is read at runtime; a copy of the bundle with no
// skills/ beside it (a broken install) still has to boot and list every tool — only the three
// storyboard tools fail, at call time, and they say so in words a person can act on, not as a
// zod enum built from a placeholder vocabulary.
test('dist/bundle.js boots without the skills tree; the storyboard routes name the missing structure-contract.js', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'sf-bundle-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
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

test('the installed stdio surface validates inline candidates and prepares a blind synopsis without a board', async t => {
  const client = new Client({ name: 'opening-review-contract', version: '1' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [bundle], stderr: 'pipe' });
  t.after(() => client.close());
  await client.connect(transport);
  const { tools } = await client.listTools();
  const publicHooks = tools.find(tool => tool.name === 'story_sequence').inputSchema.properties.primaryHookType.enum;
  assert.equal(new Set(publicHooks).size, 18);
  assert.ok(publicHooks.includes('cause_mystery'));
  assert.ok(tools.find(tool => tool.name === 'story_opening_review'));

  const option = { direction: 'D1', text: 'One row of dumplings is split. A drop runs down the lid.', primaryHookType: 'cause_mystery' };
  const checked = await client.callTool({ name: 'scenario_check', arguments: { synopses: [option] } });
  assert.ok(!checked.isError, checked.content[0].text);
  assert.deepEqual(JSON.parse(checked.content[0].text).synopses, [option]);
  const result = await client.callTool({ name: 'story_opening_review', arguments: {
    action: 'prepare', stage: 'synopsis', surface: 'vertical feed', audience: 'home cooks',
    synopses: [{ ...option, opening: [{ start: 0, end: 2, kind: 'visual', text: 'One row of dumplings is split.' }] }],
  } });
  assert.ok(!result.isError, result.content[0].text);
  const prepared = JSON.parse(result.content[0].text);
  assert.ok(prepared.receipt, 'a synopsis-only handoff carries the shared review budget');
  const packet = prepared.packets[0];
  assert.equal(packet.packet.cues[0].text, 'One row of dumplings is split.');
  assert.doesNotMatch(JSON.stringify(packet.packet), /cause_mystery|A drop runs down the lid/);
  const record = await client.callTool({ name: 'story_opening_review', arguments: {
    action: 'record', stage: 'synopsis', direction: 'D1', receipt: prepared.receipt, runId: prepared.runId,
    sourceRevision: packet.sourceRevision, packetDigest: packet.packetDigest, policyVersion: prepared.policyVersion,
    verdicts: ['read-a', 'read-b', 'read-c'].map(reviewerId => ({
      reviewerId, reasonToLeave: 'The first view gives no comparison with an intact row.',
      ratings: [1, 1, 2, 0, 1].map(score => ({ score, evidence: 'The lone split row is visible for two seconds.' })),
    })),
  } });
  assert.ok(!record.isError, record.content[0].text);
  const reviewed = JSON.parse(record.content[0].text);
  assert.deepEqual([reviewed.status, reviewed.metric.value, reviewed.metric.unit, reviewed.editsUsed], ['high', 50, 'points', 0]);
  const reserved = await client.callTool({ name: 'story_opening_review', arguments: {
    action: 'reserve_revision', stage: 'synopsis', runId: reviewed.runId, receipt: reviewed.receipt,
    requestId: 'revise-dumpling-row', expectedReceiptRevision: reviewed.receiptRevision,
    candidates: [{ direction: 'D1', sourceRevision: packet.sourceRevision }],
  } });
  assert.ok(!reserved.isError, reserved.content[0].text);
  assert.equal(JSON.parse(reserved.content[0].text).editsRemaining, 4);
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
