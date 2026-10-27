#!/usr/bin/env node
// Run the installed bundle over MCP stdio; the checkout supplies only the SDK client.
// node installed-probe.mjs --root CACHE_ROOT --request request.json --output evidence.json
// request.json: {"name":"storyboard_read","arguments":{"path":"/absolute/storyboard"}}
// An array performs sequential calls in one fresh server process. --board supplies a default read.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const checkout = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const sdk = createRequire(resolve(checkout, 'server/package.json'));
const { Client } = await import(pathToFileURL(sdk.resolve('@modelcontextprotocol/sdk/client/index.js')).href);
const { StdioClientTransport } = await import(pathToFileURL(sdk.resolve('@modelcontextprotocol/sdk/client/stdio.js')).href);
const options = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const flag = process.argv[i];
  if (!['--root', '--request', '--output', '--board'].includes(flag) || !process.argv[i + 1]) {
    throw new Error('Usage: --root CACHE_ROOT --request request.json --output evidence.json (or --board PATH instead of --request)');
  }
  options[flag.slice(2)] = process.argv[i + 1];
}
assert.ok(options.root && options.output && (options.request || options.board), 'root, output and request/board are required');
const root = realpathSync(resolve(options.root));
const bundle = resolve(root, 'server/dist/bundle.js');
const output = resolve(options.output);
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const requestInput = options.request ? JSON.parse(readFileSync(resolve(options.request), 'utf8'))
  : { name: 'storyboard_read', arguments: { path: resolve(options.board), level: 'shots', includeContext: true } };
const requests = Array.isArray(requestInput) ? requestInput : [requestInput];
assert.ok(requests.length > 0 && requests.every(r => r && typeof r.name === 'string' && r.arguments && typeof r.arguments === 'object'), 'Each request needs name and arguments');

// Never serialize process.env or server stderr. Redact credential-shaped fields in arbitrary
// requests/responses too, including JSON carried inside MCP text content.
const knownSecrets = Object.entries(process.env).filter(([key, value]) => /token|secret|password|api_?key/i.test(key) && value?.length >= 8).map(([, value]) => value);
function redact(value, key = '') {
  if (/(?:^|_)(?:token|secret|password|authorization|api[_-]?key|access[_-]?key)(?:$|_)/i.test(key) || /(?:ApiKey|AccessToken|RefreshToken|Secret|Password|Authorization)$/.test(key)) return '[REDACTED]';
  if (Array.isArray(value)) return value.map(item => redact(item));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redact(v, k)]));
  if (typeof value === 'string') {
    try { return JSON.stringify(redact(JSON.parse(value))); } catch {}
    for (const secret of knownSecrets) value = value.split(secret).join('[REDACTED]');
    return value.replace(/Bearer\s+[^\s"']+/gi, 'Bearer [REDACTED]')
      .replace(/([?&](?:token|api_key|access_token|key)=)[^&#\s]+/gi, '$1[REDACTED]');
  }
  return value;
}

const evidence = { startedAt: new Date().toISOString(), installedRoot: root, bundle,
  bundleSha256: hash(bundle), transport: 'fresh MCP stdio process', checkoutRole: 'SDK client only; no checkout server module imported',
  checks: {}, calls: [], passed: false };
const client = new Client({ name: 'installed-content-inspection-probe', version: '1.0.0' });
const env = { PATH: process.env.PATH || '', HOME: process.env.HOME || '',
  SOCIAL_FLOW_TOOLS: [...new Set(['storyboard_read', 'storyboard_apply', 'storyboard_check', 'capability_status', ...requests.map(r => r.name)])].join(',') };
if (process.env.SNS_TOKEN_DIR) env.SNS_TOKEN_DIR = process.env.SNS_TOKEN_DIR;
const transport = new StdioClientTransport({ command: process.execPath, args: [bundle], cwd: root, env, stderr: 'pipe' });
let stderrBytes = 0;
transport.stderr?.on('data', chunk => { stderrBytes += chunk.length; });
try {
  const skill = resolve(root, 'skills/inspect-content/SKILL.md');
  assert.ok(existsSync(skill), 'Installed inspect-content/SKILL.md is missing');
  evidence.checks.inspectSkill = { path: skill, sha256: hash(skill), exists: true };
  await client.connect(transport);
  const listed = await client.listTools();
  evidence.listedTools = listed.tools.map(tool => tool.name);
  const read = listed.tools.find(tool => tool.name === 'storyboard_read');
  assert.ok(read?.inputSchema?.properties?.shotId, 'Installed storyboard_read schema lacks shotId');
  assert.ok(read?.inputSchema?.properties?.includeContext, 'Installed storyboard_read schema lacks includeContext');
  evidence.checks.storyboardReadSchema = read.inputSchema;
  assert.ok(!listed.tools.some(tool => tool.name.startsWith('portal_')), 'Local-only build must not restore removed portal tools');
  evidence.checks.localOnly = true;
  for (const request of requests) {
    assert.ok(evidence.listedTools.includes(request.name), `Requested tool is not listed: ${request.name}`);
    const response = await client.callTool(request, undefined, { timeout: 120000 });
    evidence.calls.push({ request: redact(request), response: redact(response), passed: response.isError !== true });
    if (response.isError) throw new Error(`Installed tool returned isError: ${request.name}; see redacted response in evidence`);
  }
  assert.equal(hash(bundle), evidence.bundleSha256, 'Installed bundle changed during probe');
  evidence.passed = true;
} catch (error) {
  evidence.error = redact(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  try { await client.close(); } catch { evidence.closeError = 'Client close failed'; evidence.passed = false; process.exitCode = 1; }
  evidence.finishedAt = new Date().toISOString();
  evidence.stderrBytes = stderrBytes;
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify({ output, passed: evidence.passed, bundleSha256: evidence.bundleSha256, calls: evidence.calls.length }));
}
