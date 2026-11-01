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

test('private media rejects foreign origins and non-asset routes before sending credentials',async()=>{
 const {requestGenaiMedia}=await import('../dist/astra-genai-client.js');
 for(const route of ['https://other.example/v1/ltx/desktop/assets/id/bytes','//other.example/a','/v1/ltx/desktop/assets/../secret/bytes','/v1/ltx/desktop/generations/id'])
   await assert.rejects(requestGenaiMedia(route),/Unsupported/);
});

test('image and speech routes use their own gateway override; video stays on ASTRA_GENAI_URL', async t => {
  const original = globalThis.fetch, key = config.astraGenaiApiKey, env = { ...process.env };
  t.after(() => { globalThis.fetch = original; config.astraGenaiApiKey = key; process.env = env; });
  config.astraGenaiApiKey = 'remote-key'; process.env.ASTRA_GENAI_URL = 'https://remote.example';
  process.env.ASTRA_GENAI_SPEECH_URL = 'http://127.0.0.1:18081/'; delete process.env.ASTRA_GENAI_SPEECH_API_KEY;
  await assert.rejects(requestGenai('GET', '/v1/audio/models'), /ASTRA_GENAI_SPEECH_API_KEY/);
  process.env.ASTRA_GENAI_SPEECH_API_KEY = 'local-key'; const seen = [];
  globalThis.fetch = async (url, options) => { seen.push([url, options.headers.Authorization]); return new Response('{}'); };
  await requestGenai('GET', '/v1/audio/models');
  await requestGenai('GET', '/v1/images/models');
  await requestGenai('GET', '/v1/ltx/desktop/models');
  assert.deepEqual(seen, [['http://127.0.0.1:18081/v1/audio/models', 'Bearer local-key'],
    ['https://remote.example/v1/images/models', 'Bearer remote-key'], ['https://remote.example/v1/ltx/desktop/models', 'Bearer remote-key']]);
});
