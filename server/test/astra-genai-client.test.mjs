import { test } from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../dist/config.js';
import { requestGenai, downloadGenaiResult, genaiCatalog, genaiJobs, requestGenaiMedia } from '../dist/astra-genai-client.js';

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

test('chat and media routes keep their gateway credentials separate', async t => {
  const original = globalThis.fetch, key = config.astraGenaiApiKey, env = { ...process.env };
  t.after(() => { globalThis.fetch = original; config.astraGenaiApiKey = key; process.env = env; });
  config.astraGenaiApiKey = 'remote-key'; process.env.ASTRA_GENAI_URL = 'https://remote.example';
  process.env.ASTRA_GENAI_SPEECH_URL = 'http://127.0.0.1:18081/'; delete process.env.ASTRA_GENAI_SPEECH_API_KEY;
  await assert.rejects(requestGenai('GET', '/v1/audio/models'), /ASTRA_GENAI_SPEECH_API_KEY/);
  process.env.ASTRA_GENAI_SPEECH_API_KEY = 'local-key'; const seen = [];
  globalThis.fetch = async (url, options) => { seen.push([url, options.headers.Authorization]); return new Response('{}'); };
  process.env.ASTRA_GENAI_CHAT_URL = 'http://127.0.0.1:18185';
  await assert.rejects(requestGenai('POST', '/v1/chat/completions', {}), /ASTRA_GENAI_CHAT_API_KEY/);
  process.env.ASTRA_GENAI_CHAT_API_KEY = 'chat-key';
  await requestGenai('POST', '/v1/chat/completions', {});
  await requestGenai('GET', '/v1/ltx/msr/capabilities');
  await requestGenai('GET', '/v1/audio/models');
  await requestGenai('GET', '/v1/images/models');
  await requestGenai('GET', '/v1/ltx/desktop/models');
  assert.deepEqual(seen, [['http://127.0.0.1:18185/v1/chat/completions', 'Bearer chat-key'],
    ['https://remote.example/v1/ltx/msr/capabilities', 'Bearer remote-key'], ['http://127.0.0.1:18081/v1/audio/models', 'Bearer local-key'],
    ['https://remote.example/v1/images/models', 'Bearer remote-key'], ['https://remote.example/v1/ltx/desktop/models', 'Bearer remote-key']]);
});

test('a synchronous gateway call waits for headers as long as its own timeout, not fetch\'s 300 s', async t => {
  const { Agent } = await import('undici');
  const original = globalThis.fetch, key = config.astraGenaiApiKey;
  t.after(() => { globalThis.fetch = original; config.astraGenaiApiKey = key; });
  config.astraGenaiApiKey = 'fixture'; const seen = [];
  globalThis.fetch = async (_url, options) => { seen.push(options.dispatcher); return new Response('{}'); };
  await requestGenai('POST', '/v1/images/generations', {}, 30 * 60_000);
  assert.ok(seen[0] instanceof Agent);
});


test('general video catalog works without Desktop; Desktop discovery stays explicit', async t => {
  const original = globalThis.fetch, key = config.astraGenaiApiKey, env = { ...process.env };
  t.after(() => { globalThis.fetch = original; config.astraGenaiApiKey = key; process.env = env; });
  config.astraGenaiApiKey = 'remote-key'; process.env.ASTRA_GENAI_URL = 'https://remote.example';
  process.env.ASTRA_GENAI_IMAGE_URL = 'http://127.0.0.1:18081';
  const seen = [], models = { data: [{ id: 'ltx-msr', kind: 'video' }] };
  globalThis.fetch = async (url, options) => {
    seen.push(url);
    assert.equal(options.headers.Authorization, 'Bearer remote-key');
    if (url === 'https://remote.example/v1/models') return new Response(JSON.stringify(models));
    return new Response(JSON.stringify({ error: 'Desktop is not configured' }), { status: 503 });
  };
  assert.deepEqual(await genaiCatalog('video'), models);
  assert.deepEqual(seen, ['https://remote.example/v1/models']);
  await assert.rejects(genaiCatalog('desktop_video'), /503.*Desktop/);
  assert.equal(seen[1], 'https://remote.example/v1/ltx/desktop/models');
});

test('Desktop discovery and downloads use the configured Desktop origin, v2 downloads retain their own token', async t => {
  const original = globalThis.fetch, key = config.astraGenaiApiKey, env = { ...process.env };
  t.after(() => { globalThis.fetch = original; config.astraGenaiApiKey = key; process.env = env; });
  config.astraGenaiApiKey = 'v2-key';
  process.env.ASTRA_GENAI_URL = 'https://v2.example';
  process.env.ASTRA_GENAI_DESKTOP_URL = 'http://127.0.0.1:18081';
  process.env.ASTRA_GENAI_IMAGE_URL = 'http://127.0.0.1:18082';
  process.env.ASTRA_GENAI_IMAGE_API_KEY = 'local-image-key';
  const seen = [];
  globalThis.fetch = async (url, options) => {
    seen.push([new URL(url).origin, options.headers.Authorization]);
    return Response.json({});
  };
  await assert.rejects(genaiCatalog('desktop_video'), /ASTRA_GENAI_DESKTOP_API_KEY/);
  process.env.ASTRA_GENAI_IMAGE_URL = process.env.ASTRA_GENAI_DESKTOP_URL + '/';
  await genaiCatalog('desktop_video');
  process.env.ASTRA_GENAI_DESKTOP_API_KEY = 'desktop-key';
  const media = '/v1/ltx/desktop/assets/id/bytes';
  await requestGenaiMedia(media);
  await requestGenaiMedia(media, undefined, '/v1/ltx/v2/audio-to-video');
  assert.deepEqual(seen, [
    ['http://127.0.0.1:18081', 'Bearer local-image-key'],
    ['http://127.0.0.1:18081', 'Bearer desktop-key'],
    ['https://v2.example', 'Bearer v2-key'],
  ]);
});

test('job history asks the gateway that took the request and marks an active-only answer', async t => {
  const original = globalThis.fetch, key = config.astraGenaiApiKey, env = { ...process.env };
  t.after(() => { globalThis.fetch = original; config.astraGenaiApiKey = key; process.env = env; });
  config.astraGenaiApiKey = 'remote-key'; process.env.ASTRA_GENAI_URL = 'https://remote.example';
  process.env.ASTRA_GENAI_IMAGE_URL = 'http://127.0.0.1:18081'; process.env.ASTRA_GENAI_IMAGE_API_KEY = 'local-key';
  const seen = [];
  globalThis.fetch = async (url, options) => {
    seen.push([url, options.method, options.headers.Authorization]);
    // The local gateway predates the history route.
    if (url === 'http://127.0.0.1:18081/v1/jobs?limit=5') return new Response('{"detail":"Not Found"}', { status: 404 });
    // The active list is oldest first and ignores limit.
    if (url.includes('active')) return new Response(JSON.stringify({ jobs: ['oldest', 'older', 'old', 'recent', 'newer', 'newest'].map(id => ({ id })) }));
    return new Response(JSON.stringify({ jobs: [{ id: 'finished', status: 'failed' }] }));
  };
  assert.deepEqual(await genaiJobs(), { gateway: 'main', baseUrl: 'https://remote.example', history: true, jobs: [{ id: 'finished', status: 'failed' }] });
  assert.deepEqual(await genaiJobs({ gateway: 'image', limit: 5 }), { gateway: 'image', baseUrl: 'http://127.0.0.1:18081', history: false,
    jobs: ['newest', 'newer', 'recent', 'old', 'older'].map(id => ({ id })) });
  assert.deepEqual(seen, [['https://remote.example/v1/jobs?limit=20', 'GET', 'Bearer remote-key'],
    ['http://127.0.0.1:18081/v1/jobs?limit=5', 'GET', 'Bearer local-key'], ['http://127.0.0.1:18081/v1/jobs/active', 'GET', 'Bearer local-key']]);
  globalThis.fetch = async () => new Response('{"detail":"revoked"}', { status: 401 });
  await assert.rejects(genaiJobs({ gateway: 'speech' }), /HTTP 401/);
  await assert.rejects(genaiJobs({ limit: 101 }));
});
