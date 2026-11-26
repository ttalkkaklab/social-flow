import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { config } from '../dist/config.js';
import { buildNativeImageBody, generateNativeImage, recoverNativeImage } from '../dist/astra-genai-native-image.js';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=', 'base64');
test('model-bound edits preserve ten reference order, zero LoRA scale and strict provider fields', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'native-image-'));
  t.after(() => fs.rmSync(dir, {recursive:true,force:true}));
  const imagePath = path.join(dir, 'source.png'); fs.writeFileSync(imagePath,png);
  const args = {model:'qwen',prompt:'Change the ball',imagePath,refImagePaths:Array(9).fill(imagePath),loras:[{id:'a',scale:0}],refResolution:512};
  const body = buildNativeImageBody(args,true);
  assert.equal(body.ref_images.length,9); assert.equal(body.image,png.toString('base64')); assert.equal(body.mode,'edit');
  assert.deepEqual(body.loras,[{id:'a',scale:0}]); assert.equal(body.ref_resolution,512); assert.equal(body.imagePath,undefined);
  for (const extra of [{refImagePaths:Array(10).fill(imagePath)},{loras:[{path:'/secret'}]},{loras:[{id:'a'},{id:'a'}]},{maskPath:imagePath},{strength:0}])
    assert.throws(()=>buildNativeImageBody({...args,...extra},true));
});
test('inline response is recoverable without another POST, origin changes and ambiguous submissions fail closed', async t => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'native-image-')), original=globalThis.fetch, key=config.astraGenaiApiKey;
  const url=process.env.ASTRA_GENAI_URL; config.astraGenaiApiKey='fixture';
  t.after(()=>{globalThis.fetch=original;config.astraGenaiApiKey=key;if(url===undefined)delete process.env.ASTRA_GENAI_URL;else process.env.ASTRA_GENAI_URL=url;fs.rmSync(dir,{recursive:true,force:true});});
  let posts=0; globalThis.fetch=async(url,opts)=>{posts++;assert.ok(String(url).endsWith('/v1/images/generations'));assert.equal(opts.headers.Authorization,'Bearer fixture');return Response.json({data:[{b64_json:png.toString('base64')}]});};
  const args={model:'qwen',prompt:'ball',outputPath:dir,filename:'a.png'};
  const out=await generateNativeImage(args); assert.equal(out.output.width,1);
  const receipt=out.imagePath+'.astra-genai.json'; await recoverNativeImage(receipt); assert.equal(posts,1);
  await assert.rejects(generateNativeImage(args),/exists/);
  process.env.ASTRA_GENAI_URL='http://different.example';await assert.rejects(recoverNativeImage(receipt),/origin/);
  globalThis.fetch=async()=>{throw new Error('lost response');};
  await assert.rejects(generateNativeImage({...args,filename:'b.png'}),/lost/);
  await assert.rejects(recoverNativeImage(path.join(dir,'b.png.astra-genai.json')),/unknown/);
});

test('a single-picture edit sends no empty ref_images (the gateway rejects [])', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'native-image-'));
  t.after(() => fs.rmSync(dir, {recursive:true,force:true}));
  const imagePath = path.join(dir, 'face.png'); fs.writeFileSync(imagePath, png);
  const body = buildNativeImageBody({ model:'qwen-image-fast', prompt:'front body', imagePath, refImagePaths:[] }, true);
  assert.equal('ref_images' in body, false);
});

test('H3 edits use the queued format with ordered references and keep the old binding on a separate image gateway', async t => {
  const { parseImageArgs } = await import('../dist/image-registry.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'h3-image-'));
  const env = { ...process.env };
  process.env.ASTRA_GENAI_IMAGE_URL = 'https://separate-image.example';
  t.after(() => { process.env = env; fs.rmSync(dir, { recursive: true, force: true }); });
  const imagePath = path.join(dir, 'source.png');
  fs.writeFileSync(imagePath, png);
  const args = {model:'h3-image',prompt:'Keep the actor',imagePath};
  const body = buildNativeImageBody(args, true);
  assert.equal(body.size, undefined);
  assert.equal(body.image, png.toString('base64'));
  for (const extra of [{steps:6},{mode:'variation'},{size:'512x512'},{guidanceScale:1},{refImagePaths:Array(10).fill(imagePath)}])
    assert.throws(() => parseImageArgs('astra_genai_image_edit', {...args, ...extra}));

  const queued = { ...args, model: 'minimax-h3-image', size: '256x512', seed: 0, refImagePaths: [imagePath],
    prompt: 'Keep {picture1.image} and use the colors in {picture2.image}' };
  assert.deepEqual(buildNativeImageBody(queued, true), {
    kind: 'image', mode: 'scene', model: 'minimax-h3-image',
    input: { prompt: queued.prompt, references: [1, 2].map(n => ({
      id: 'picture' + n, role: 'object', uri: 'data:image/png;base64,' + png.toString('base64'),
    })) },
    parameters: { width: 256, height: 512, seed: 0 },
  });
  assert.throws(() => buildNativeImageBody({ ...queued, refImagePaths: Array(7).fill(imagePath) }, true));
  assert.throws(() => buildNativeImageBody({ ...queued, size: '258x512' }, true));
});

test('old H3 receipts recover only the provider bytes bound to their distinct request IDs', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'h3-recovery-'));
  const previousFetch = globalThis.fetch;
  const env = { ...process.env };
  process.env.ASTRA_GENAI_IMAGE_URL = 'https://separate-image.example';
  process.env.ASTRA_GENAI_IMAGE_API_KEY = 'fixture';
  t.after(() => { globalThis.fetch = previousFetch; process.env = env; fs.rmSync(dir, {recursive:true,force:true}); });
  const ids = [];
  globalThis.fetch = async (_url, options) => {
    ids.push(options.headers['X-Request-ID']);
    throw new Error('lost response');
  };
  for (const filename of ['a.png','b.png'])
    await assert.rejects(generateNativeImage({model:'h3-image', prompt:filename, requestId:'s001', filename, outputPath:dir}), /lost response/);
  assert.equal(new Set(ids).size, 2);
  const file = path.join(dir,'a.png.astra-genai.json');
  const saved = JSON.parse(fs.readFileSync(file,'utf8'));
  let fingerprint = 'different';
  globalThis.fetch = async (url, options) => {
    assert.equal(options.method, 'GET');
    assert.ok(String(url).endsWith('/requests/' + ids[0]));
    return Response.json({request_id:ids[0], status:'succeeded', submission_sha256:fingerprint, data:[{b64_json:png.toString('base64')}]});
  };
  await assert.rejects(recoverNativeImage(file));
  fingerprint = saved.fingerprint;
  const out = await recoverNativeImage(file);
  assert.equal(out.requestId,ids[0]); assert.equal(out.output.width,1);
});

test('queued H3 submits to the main gateway and recovers a verified signed PNG without another POST', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'h3-common-image-'));
  const previousFetch = globalThis.fetch;
  const key = config.astraGenaiApiKey;
  const env = { ...process.env };
  const base = 'https://main.example';
  config.astraGenaiApiKey = 'main-key';
  process.env.ASTRA_GENAI_URL = base;
  const args = { model: 'minimax-h3-image', prompt: 'yellow mug', size: '256x256', filename: 'a.png', outputPath: dir };
  // Old saved names reach the common API when there is no separate image gateway.
  assert.deepEqual(buildNativeImageBody({ ...args, model: 'h3-image' }), buildNativeImageBody(args));
  process.env.ASTRA_GENAI_IMAGE_URL = 'https://separate-image.example';
  process.env.ASTRA_GENAI_IMAGE_API_KEY = 'separate-key';
  t.after(() => {
    globalThis.fetch = previousFetch; config.astraGenaiApiKey = key; process.env = env;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const imagePath = path.join(dir, args.filename);
  const receiptPath = imagePath + '.astra-genai.json';
  const createdAt = '2026-11-26T10:00:00Z';
  const job = { id: 'a'.repeat(32), kind: 'image', mode: 'scene', model: args.model,
    status: 'queued', created_at: createdAt, outputs: [] };
  const jobPath = '/v1/generations/' + job.id;
  const signed = base + '/v1/files/' + job.id + '.png?exp=12&sig=signed';
  const square = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAQAAAAEAAQAAAAB0CZXLAAAAH0lEQVR4nO3BAQ0AAADCoPdPbQ43oAAAAAAAAAAAvg0hAAAB8Wch7gAAAABJRU5ErkJggg==', 'base64');
  const calls = [];
  let reachable = false;
  globalThis.fetch = async (target, opts) => {
    const url = String(target);
    calls.push([url, opts.method]);
    if (url === signed) {
      assert.equal(opts.headers, undefined);
      return new Response(square);
    }
    assert.equal(opts.headers.Authorization, 'Bearer main-key');
    if (opts.method === 'POST') {
      assert.equal(url, base + '/v1/generations');
      const saved = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
      assert.equal(saved.baseUrl, base);
      assert.equal(saved.requestId, opts.headers['X-Request-ID']);
      assert.deepEqual(JSON.parse(opts.body), {
        kind: 'image', mode: 'scene', model: 'minimax-h3-image',
        input: { prompt: args.prompt }, parameters: { width: 256, height: 256 },
      });
      return Response.json(job, { status: 202 });
    }
    assert.equal(url, base + jobPath);
    assert.equal(JSON.parse(fs.readFileSync(receiptPath, 'utf8')).jobId, job.id);
    if (!reachable) throw new Error('disconnected after acknowledgement');
    return Response.json({ ...job, status: 'succeeded', completed_at: '2026-11-26T10:00:20Z',
      outputs: [{ kind: 'image', mime_type: 'image/png', authentication: 'signed_url', url: signed }],
      usage: { quantity: 1, unit: 'image' },
    });
  };
  await assert.rejects(generateNativeImage(args), /disconnected/);
  await assert.rejects(generateNativeImage(args), /exists/);
  assert.equal(fs.existsSync(imagePath), false);
  reachable = true;
  const result = await recoverNativeImage(receiptPath);
  assert.equal(result.jobId, job.id);
  assert.equal(result.output.width, 256);
  assert.equal(result.output.height, 256);
  assert.deepEqual(result.usage, { quantity: 1, unit: 'image' });
  assert.deepEqual(fs.readFileSync(imagePath), square);
  assert.deepEqual(await recoverNativeImage(receiptPath), result);
  assert.deepEqual(calls, [[base + '/v1/generations', 'POST'], [base + jobPath, 'GET'],
    [base + jobPath, 'GET'], [signed, undefined]]);
});

test('lost H3 acknowledgement replays only the exact request while its key is retained', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'h3-replay-image-'));
  const original = globalThis.fetch;
  const key = config.astraGenaiApiKey;
  config.astraGenaiApiKey = 'fixture';
  t.after(() => {
    globalThis.fetch = original; config.astraGenaiApiKey = key;
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const model = 'minimax-h3-image';
  const job = { id: 'b'.repeat(32), kind: 'image', mode: 'scene', model,
    status: 'queued', created_at: '2026-11-26T10:00:00Z', outputs: [] };
  const receiptPath = path.join(dir, 'a.png.astra-genai.json');
  const submissions = [];
  globalThis.fetch = async (url, opts) => {
    if (opts.method === 'POST') {
      assert.ok(url.endsWith('/v1/generations'));
      submissions.push([opts.headers['X-Request-ID'], opts.body]);
      if (submissions.length === 1) throw new Error('lost acknowledgement');
      assert.deepEqual(submissions[1], submissions[0]);
      return Response.json(job, { status: 202 });
    }
    assert.ok(url.endsWith('/v1/generations/' + job.id));
    return Response.json(job);
  };
  await assert.rejects(generateNativeImage({ model, prompt: 'yellow mug', outputPath: dir, filename: 'a.png' }), /lost acknowledgement/);
  const saved = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  const put = receipt => fs.writeFileSync(receiptPath, JSON.stringify(receipt));
  put({ ...saved, submittedAt: new Date(Date.now() - 24 * 3600_000).toISOString() });
  await assert.rejects(recoverNativeImage(receiptPath), /replay window/);
  put(saved);
  config.astraGenaiApiKey = 'other-key';
  await assert.rejects(recoverNativeImage(receiptPath), /credential changed/);
  config.astraGenaiApiKey = 'fixture';
  assert.equal(submissions.length, 1);
  await assert.rejects(recoverNativeImage(receiptPath), /queued or running/);
  await assert.rejects(recoverNativeImage(receiptPath), /queued or running/);
  const linked = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  assert.equal(linked.jobId, job.id);
  assert.equal(linked.requestBody, undefined);
  assert.equal(submissions.length, 2);
});
