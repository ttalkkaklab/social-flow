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
  for (const extra of [{ prompt: 'x'.repeat(801) }, { seed: 2147483648 }, { steps: 13 }, { sourceImage: 'x' }]) assert.equal(genaiImageSchema.safeParse({ ...base, ...extra }).success, false);
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

test('editing preserves omitted size, encodes local source/mask and rejects incompatible inputs', async t => {
  const { genaiImageEditSchema } = await import('../dist/astra-genai-image.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'genai-edit-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const imagePath = path.join(dir, 'source.png'); fs.writeFileSync(imagePath, png);
  const args = { ...base, mode: 'inpaint', imagePath, maskPath: imagePath, strength: 0.9, steps: 12 };
  const body = buildGenaiImageBody(genaiImageEditSchema.parse(args));
  assert.equal(body.input.messages[0].content[1].image, 'data:image/png;base64,' + png.toString('base64'));
  assert.equal(body.input.mask, body.input.messages[0].content[1].image);
  assert.deepEqual(body.parameters, { prompt_extend: false, num_inference_steps: 12, mode: 'inpaint', strength: 0.9 });
  for (const extra of [{ maskPath: undefined }, { imageUri: 'https://example.com/a.png' }, { mode: 'img2img' }, { strength: 0 }, { steps: 13 }, { imagePath: undefined, imageUri: 'file:///a.png' }])
    assert.equal(genaiImageEditSchema.safeParse({ ...args, ...extra }).success, false);
});

test('prompt expansion evidence survives completed image recovery', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'genai-prompt-'));
  const original = globalThis.fetch, key = config.astraGenaiApiKey; config.astraGenaiApiKey = 'fixture';
  t.after(() => { globalThis.fetch = original; config.astraGenaiApiKey = key; fs.rmSync(dir, { recursive: true, force: true }); });
  for (const state of ['applied', 'fallback']) {
    const usedPrompt = state === 'applied' ? 'A red cup under warm light.' : base.prompt;
    globalThis.fetch = async (_url, options) => options.method === 'POST'
      ? Response.json({ request_id: state, output: { choices: [{ message: { content: [{ image: 'https://example.com/out.png' }, { text: usedPrompt }] } }] } }, { headers: { 'x-prompt-extend': state } })
      : new Response(png);
    const result = await generateGenaiImage({ ...base, promptExtend: true, outputPath: dir, filename: state + '.png' });
    assert.equal(result.promptExtension, state); assert.equal(result.usedPrompt, usedPrompt);
    globalThis.fetch = async () => assert.fail('cached image must not regenerate');
    assert.equal((await recoverGenaiImage(result.imagePath + '.astra-genai.json')).promptExtension, state);
  }
});

test('rejected and ambiguous submissions persist distinct durable statuses without retries', async t => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'genai-failure-'));
  const original=globalThis.fetch,key=config.astraGenaiApiKey;config.astraGenaiApiKey='fixture';
  t.after(()=>{globalThis.fetch=original;config.astraGenaiApiKey=key;fs.rmSync(dir,{recursive:true,force:true});});
  for (const [name,status,body,expected] of [
    ['rejected',400,{code:'InvalidParameter'},'failed'],
    ['terminal',500,{request_id:'r1',status:'failed'},'failed'],
    ['gateway',502,{error:'bad gateway'},'submission_unknown'],
    ['timeout',408,{},'submission_unknown'],
  ]) {
    let calls=0;globalThis.fetch=async()=>{calls++;return Response.json(body,{status});};
    const args={...base,outputPath:dir,filename:name+'.png'};
    await assert.rejects(generateGenaiImage(args));
    assert.equal(JSON.parse(fs.readFileSync(joinReceipt(dir,name))).status,expected);
    await assert.rejects(generateGenaiImage(args));assert.equal(calls,1);
  }
});
function joinReceipt(dir,name) { return path.join(dir,name+'.png.astra-genai.json'); }
