import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { config } from '../dist/config.js';
import { genaiImageSchema, buildGenaiImageBody, generateGenaiImage, recoverGenaiImage } from '../dist/astra-genai-image.js';
const base = { model: 'z-image-turbo', prompt: 'A cup on a table.' };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=', 'base64');
test('DashScope request is one user text with strict gateway limits', () => {
  const body = buildGenaiImageBody(genaiImageSchema.parse({ ...base, seed: null }));
  assert.deepEqual(body, { model: base.model, input: { messages: [{ role: 'user', content: [{ text: base.prompt }] }] }, parameters: { size: '1024*1536', prompt_extend: false, seed: null } });
  for (const extra of [{ prompt: 'x'.repeat(801) }, { seed: 2147483648 }, { steps: 9 }, { sourceImage: 'x' }]) assert.equal(genaiImageSchema.safeParse({ ...base, ...extra }).success, false);
});
test('image response is durable before download; recovery downloads without generating again', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'genai-image-'));
  const original = globalThis.fetch, key = config.astraGenaiApiKey; config.astraGenaiApiKey = 'fixture';
  t.after(() => { globalThis.fetch = original; config.astraGenaiApiKey = key; fs.rmSync(dir, { recursive: true, force: true }); });
  const args = { ...base, outputPath: dir, filename: 'image.png' }; let posts = 0;
  globalThis.fetch = async (url, options) => {
    if (options.method === 'POST') { posts++; return Response.json({ request_id: 'image-1', usage: { image_count: 1 }, output: { choices: [{ message: { content: [{ image: 'https://results.example/image.png' }] } }] } }); }
    return new Response('expired', { status: 503 });
  };
  await assert.rejects(generateGenaiImage(args), /503/);
  const receiptPath = path.join(dir, 'image.png.astra-genai.json');
  assert.equal(JSON.parse(fs.readFileSync(receiptPath)).status, 'received');
  globalThis.fetch = async (_url, options) => { assert.equal(options.method, undefined); assert.equal(options.headers, undefined); return new Response(png); };
  const result = await recoverGenaiImage(receiptPath);
  assert.equal(result.output.width, 1); assert.equal(result.usage.image_count, 1); assert.equal(posts, 1);
  await assert.rejects(generateGenaiImage(args), /already exists/);
});
