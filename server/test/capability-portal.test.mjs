import { after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tokenDir = mkdtempSync(join(tmpdir(), 'sf-capability-portal-'));
process.env.SNS_TOKEN_DIR = tokenDir;
const portalEnv = ['TTALKKAKSTORY_API_KEY', 'TTALKKAKSTORY_API_URL', 'TTALKKAKSTORY_WORKSPACE'];
for (const key of portalEnv) delete process.env[key];
const { capabilityStatus, renderCapabilityStatus } = await import('../dist/capability-status.js');
const { ROUTES } = await import('../dist/handlers.js');
const { TOOLS } = await import('../dist/tools.js');
const originalFetch = globalThis.fetch;
globalThis.fetch = () => { throw new Error('Capability detection must not contact the portal'); };
after(() => { globalThis.fetch = originalFetch; rmSync(tokenDir, { recursive: true, force: true }); });
beforeEach(() => {
  rmSync(tokenDir, { recursive: true, force: true });
  mkdirSync(tokenDir);
  for (const key of portalEnv) delete process.env[key];
});

const secret = 'tks_test_never_print_this_key';
function credential(channel, body = { apiKey: secret }) {
  const dir = channel ? join(tokenDir, channel) : tokenDir;
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'ttalkkakstory.json');
  writeFileSync(file, JSON.stringify(body));
  return file;
}

test('no portal key chooses local HTML without any network call', async () => {
  assert.deepEqual(capabilityStatus('my-channel').portal, { channel: 'my-channel', state: 'missing' });
  const result = await ROUTES.capability_status({ channel: 'my-channel' });
  assert.match(result.content[0].text, /storyboard_portal\s+missing/);
  assert.match(result.content[0].text, /local storyboard\.html/);
});

test('another channel can expose portal tools without enabling this channel', async () => {
  credential('other-channel');
  assert.equal(capabilityStatus('my-channel').portal.state, 'missing');
  assert.equal(capabilityStatus().portal.state, 'missing');
  const result = await ROUTES.capability_status({ channel: 'other-channel' });
  assert.match(result.content[0].text, /storyboard_portal\s+configured/);
  assert.match(result.content[0].text, /Ask HITL/);
  assert.ok(!JSON.stringify(result).includes(secret));
});

test('channel credentials take precedence over flat files and env without exposing values', () => {
  process.env.TTALKKAKSTORY_API_KEY = secret + '_env';
  credential(null, { apiKey: secret + '_flat' });
  const source = credential('my-channel');
  assert.deepEqual(capabilityStatus('my-channel').portal, { channel: 'my-channel', state: 'configured', source });
  assert.ok(!renderCapabilityStatus('my-channel').includes(secret));
});

test('flat and environment credentials configure channels without their own file', () => {
  process.env.TTALKKAKSTORY_API_KEY = secret;
  assert.equal(capabilityStatus('my-channel').portal.source, 'env');
  const source = credential(null);
  assert.equal(capabilityStatus('my-channel').portal.source, source);
});

test('broken channel configuration does not use a flat or env key or leak parser input', () => {
  process.env.TTALKKAKSTORY_API_KEY = secret;
  credential(null);
  const file = credential('my-channel');
  for (const body of [secret, JSON.stringify({ apiKey: ' ' }), 'null']) {
    writeFileSync(file, body);
    assert.deepEqual(capabilityStatus('my-channel').portal, { channel: 'my-channel', state: 'invalid' });
    const report = renderCapabilityStatus('my-channel');
    assert.match(report, /configuration is invalid/);
    assert.ok(!report.includes(secret));
  }
});

test('the capability tool exposes an optional channel and old no-argument calls still work', async () => {
  const schema = TOOLS.find(tool => tool.name === 'capability_status').inputSchema;
  assert.equal(schema.properties.channel.type, 'string');
  assert.deepEqual(schema.required, []);
  assert.match((await ROUTES.capability_status({})).content[0].text, /flat\/env only/);
  assert.match((await ROUTES.capability_status()).content[0].text, /flat\/env only/);
  await assert.rejects(() => ROUTES.capability_status({ channel: '../other' }), /Invalid arguments/);
});
