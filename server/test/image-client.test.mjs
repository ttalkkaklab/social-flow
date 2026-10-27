import { test } from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../dist/config.js';
import { generateFromText, text2ImageSchema } from '../dist/image-client.js';

test('OpenAI preserves returned usage/request identity and disables implicit retries', async t => {
  const oldFetch = globalThis.fetch, oldKey = config.openaiApiKey;
  config.openaiApiKey = 'test-only';
  t.after(() => { globalThis.fetch = oldFetch; config.openaiApiKey = oldKey; });
  let calls = 0;
  const usage = { input_tokens_details: { text_tokens: 12, image_tokens: 0 }, output_tokens: 200 };
  globalThis.fetch = async (_url, options) => {
    calls++;
    const body = JSON.parse(options.body);
    assert.equal(body.background, 'transparent');
    return new Response(JSON.stringify({ data: [{ b64_json: 'cG5n' }], usage, size: '1024x1024', quality: 'low' }), { headers: { 'content-type': 'application/json', 'x-request-id': 'req-1' } });
  };
  const request = text2ImageSchema.parse({ prompt: 'cup', background: 'transparent' });
  const result = await generateFromText(request);
  assert.deepEqual(result.usage, usage); assert.equal(result.requestId, 'req-1');
  assert.equal(result.size, '1024x1024'); assert.equal(result.quality, 'low');
  globalThis.fetch = async () => { calls++; return new Response('{"error":{"message":"unavailable"}}', { status: 503, headers: { 'content-type': 'application/json' } }); };
  assert.equal((await generateFromText(request)).success, false);
  assert.equal(calls, 2);
});
