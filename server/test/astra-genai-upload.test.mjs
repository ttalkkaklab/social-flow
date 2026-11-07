import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { config } from '../dist/config.js';
import { genaiUploadSettings, shrinkImageToFit, uploadGenaiFile } from '../dist/astra-genai-upload.js';
import { imageMetadata } from '../dist/image-media.js';

function setup(t) {
  const fetch = globalThis.fetch, key = config.astraGenaiApiKey, delay = genaiUploadSettings.retryDelayMs;
  config.astraGenaiApiKey = 'fixture'; genaiUploadSettings.retryDelayMs = 0;
  t.after(() => { globalThis.fetch = fetch; config.astraGenaiApiKey = key; genaiUploadSettings.retryDelayMs = delay; });
}
/** A fake gateway session that cuts `bytes` into `chunkSize` pieces and records every call. */
function gateway(bytes, chunkSize, { failPut = {}, missingOnComplete = [] } = {}) {
  const calls = [], received = new Map();
  let completes = 0;
  globalThis.fetch = async (url, options) => {
    const route = new URL(String(url)).pathname;
    calls.push(`${options.method} ${route}`);
    if (route === '/v1/uploads') {
      const meta = JSON.parse(options.body);
      assert.equal(meta.size, bytes.length); assert.equal(meta.sha256, createHash('sha256').update(bytes).digest('hex'));
      return Response.json({ upload_id: 'up1', chunk_size: chunkSize, chunks: Math.ceil(bytes.length / chunkSize) });
    }
    const chunk = /\/chunks\/(\d+)$/.exec(route);
    if (chunk) {
      const n = Number(chunk[1]);
      if ((failPut[n] ?? 0) > 0) { failPut[n]--; return new Response('bad gateway', { status: 502 }); }
      const body = Buffer.from(options.body);
      assert.equal(options.headers['X-Chunk-SHA256'], createHash('sha256').update(body).digest('hex'));
      received.set(n, body);
      return new Response(null, { status: 204 });
    }
    if (route.endsWith('/complete')) {
      completes++;
      if (completes === 1 && missingOnComplete.length) {
        for (const n of missingOnComplete) received.delete(n);
        return Response.json({ missing: missingOnComplete }, { status: 409 });
      }
      assert.ok(Buffer.concat([...received.keys()].sort((a, b) => a - b).map(n => received.get(n))).equals(bytes));
      return Response.json({ file_id: 'f1', uri: 'genai-file://f1', expires_at: '2099-01-01T00:00:00Z' });
    }
    return Response.json({ missing: missingOnComplete });
  };
  return calls;
}
const puts = calls => calls.filter(call => call.startsWith('PUT')).map(call => Number(call.split('/').pop()));

test('a failed chunk is resent alone and the file comes back as a genai-file id', async t => {
  setup(t);
  const bytes = Buffer.from(Array.from({ length: 25 }, (_, i) => i));
  const calls = gateway(bytes, 10, { failPut: { 1: 2 } });
  assert.equal(await uploadGenaiFile(bytes, 'image/png'), 'genai-file://f1');
  // Chunk 1 failed twice; chunks 0 and 2 went once each, including the short last one.
  assert.deepEqual(puts(calls), [0, 1, 1, 1, 2]);
});

test('chunks complete reports missing are sent again, and only those', async t => {
  setup(t);
  const bytes = Buffer.from('a'.repeat(30) + 'b');
  const calls = gateway(bytes, 10, { missingOnComplete: [2] });
  assert.equal(await uploadGenaiFile(bytes, 'audio/wav'), 'genai-file://f1');
  assert.deepEqual(puts(calls), [0, 1, 2, 3, 2]);
});

test('a terminal chunk rejection stops at once; a gateway without the upload API returns undefined', async t => {
  setup(t);
  let putCount = 0;
  globalThis.fetch = async (url, options) => {
    if (options.method === 'POST') return Response.json({ upload_id: 'up2', chunk_size: 4, chunks: 2 });
    putCount++;
    return new Response('{"detail":"sha mismatch"}', { status: 422 });
  };
  await assert.rejects(uploadGenaiFile(Buffer.from('12345678'), 'image/png'), error => error.terminal === true && error.httpStatus === 422);
  assert.equal(putCount, 1);
  globalThis.fetch = async () => new Response('not found', { status: 404 });
  assert.equal(await uploadGenaiFile(Buffer.from('other'), 'image/png'), undefined);
});

test('pictures shrink to fit the render size without upscaling', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'genai-shrink-test-'));
  try {
    const png = path.join(dir, 'wide.png');
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=256x128', '-frames:v', '1', png]);
    const bytes = fs.readFileSync(png), small = shrinkImageToFit(bytes, 64, 64), meta = imageMetadata(small);
    assert.equal(meta.mimeType, 'image/png'); assert.deepEqual([meta.width, meta.height], [64, 32]);
    assert.equal(shrinkImageToFit(bytes, 512, 512), bytes);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a create answer of 429 or 507, or a type the gateway does not take, keeps the data URI without retrying', async t => {
  setup(t);
  for (const status of [429, 507]) {
    let posts = 0;
    globalThis.fetch = async () => { posts++; return new Response('{}', { status }); };
    assert.equal(await uploadGenaiFile(Buffer.from(`busy ${status}`), 'image/png'), undefined);
    assert.equal(posts, 1);
  }
  globalThis.fetch = async () => assert.fail('no upload for a type the gateway refuses');
  assert.equal(await uploadGenaiFile(Buffer.from('webp'), 'image/webp'), undefined);
});

test('a whole-file sha mismatch on complete starts the upload over once, then gives up', async t => {
  setup(t);
  const bytes = Buffer.from('0123456789abcdef');
  let creates = 0, mismatches = 1;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    const route = new URL(String(url)).pathname;
    calls.push(`${options.method} ${route}`);
    if (route === '/v1/uploads') { creates++; return Response.json({ upload_id: `up${creates}`, chunk_size: 8, chunks: 2 }, { status: 201 }); }
    if (route.endsWith('/complete')) {
      if (mismatches-- > 0) return new Response('{"detail":"sha256 mismatch"}', { status: 422 });
      return Response.json({ file_id: 'f9', uri: 'genai-file://f9', expires_at: '2099-01-01T00:00:00Z' });
    }
    return new Response(null, { status: 204 });
  };
  assert.equal(await uploadGenaiFile(bytes, 'image/jpeg'), 'genai-file://f9');
  assert.equal(creates, 2); assert.deepEqual(puts(calls), [0, 1, 0, 1]);
  mismatches = 5; creates = 0;
  await assert.rejects(uploadGenaiFile(Buffer.from('another file'), 'image/jpeg'), error => error.httpStatus === 422);
  assert.equal(creates, 2);
});
