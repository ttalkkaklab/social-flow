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
