import { test } from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../dist/config.js';
import { requestGenai, downloadGenaiResult } from '../dist/astra-genai-client.js';

test('gateway authentication is separate, POST errors are redacted and never retried, downloads carry no token', async t => {
  const original = globalThis.fetch, key = config.astraGenaiApiKey, legacy = config.astraVideoApiKey;
  t.after(() => { globalThis.fetch = original; config.astraGenaiApiKey = key; config.astraVideoApiKey = legacy; });
  config.astraGenaiApiKey = ''; config.astraVideoApiKey = 'legacy-only';
  await assert.rejects(requestGenai('POST', '/v1/ltx/v2/text-to-video', {}), /ASTRA_GENAI_API_KEY/);
  config.astraGenaiApiKey = 'fixture-gateway-key'; let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++; assert.equal(options.headers.Authorization, 'Bearer fixture-gateway-key');
    assert.equal(options.redirect, 'error');
    return new Response(JSON.stringify({ error: { type: 'unsupported_parameter', message: 'fixture-gateway-key' } }), { status: 422 });
  };
  await assert.rejects(requestGenai('POST', '/v1/ltx/v2/text-to-video', {}), error => /422.*unsupported_parameter/.test(error.message) && !error.message.includes('fixture-gateway-key'));
  assert.equal(calls, 1);
  globalThis.fetch = async (_url, options) => { assert.equal(options.headers, undefined); return new Response('media'); };
  assert.equal((await downloadGenaiResult('https://results.example/video.mp4?sig=signed')).toString(), 'media');
});
