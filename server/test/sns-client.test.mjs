/**
 * sns-client.test.mjs — uploadResumable: verifies YouTube chunked upload against a mock server.
 *
 * Without this test, §5.11's verdict of "don't add a size-threshold branch" falls apart,
 * because the reason for going down a single path is that "every build verifies the chunk
 * path". Treat the two as one bundle.
 *
 * Scenarios covered —
 *   ② resume after a mid-upload drop  ④ last chunk's response lost  ⑤ session 404
 *   ⑦ single chunk (short-form size) — the path that runs daily, so it must not break here
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { uploadResumable } = await import('../dist/sns-client.js');
const { facebookCaptions } = await import('../dist/sns-client.js');
const { snsCredentialFile } = await import('../dist/config.js');

test('existing Facebook captions check ownership, preserve defaults and recover uncertainty', async t => {
  const channel = 'caption-test';
  const tokenPath = snsCredentialFile('FACEBOOK', channel);
  mkdirSync(join(tokenPath, '..'), { recursive: true });
  writeFileSync(tokenPath, 'fixture-token');
  const dir = mkdtempSync(join(tmpdir(), 'sf-caption-'));
  const filePath = join(dir, 'en.srt');
  writeFileSync(filePath, '1\n00:00:00,000 --> 00:00:01,000\nHello\n');
  t.after(() => { rmSync(dir, { recursive: true, force: true }); rmSync(join(tokenPath, '..'), { recursive: true, force: true }); });
  let page = '12', owner = '12', writes = 0, loseResponse = false, invalidVerification = false;
  const tracks = [{ locale: 'ko_KR', is_default: true }];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const path = new URL(url).pathname;
    if (options.method === 'POST') {
      writes++;
      assert.equal(options.body.get('default_locale'), null);
      assert.equal(options.body.get('captions_file').name, 'caption.en_US.srt');
      tracks.push({ locale: 'en_US', is_default: false });
      if (loseResponse) throw new Error('response lost');
      return Response.json({ success: true });
    }
    if (path.endsWith('/me')) return Response.json({ id: page });
    if (path.endsWith('/captions')) return invalidVerification && tracks.length > 1 ? new Response('not-json') : Response.json({ data: tracks });
    return Response.json({ id: '34', from: { id: owner } });
  });
  const input = { action: 'add', channel, videoId: '34', expectedPageId: '12', tracks: [{ filePath, locale: 'en_US' }] };
  page = '99'; assert.equal((await facebookCaptions(input)).status, 409);
  page = '12'; owner = '99'; assert.equal((await facebookCaptions(input)).status, 409);
  assert.equal(writes, 0); owner = '12';
  loseResponse = true;
  const uncertain = JSON.parse((await facebookCaptions(input)).body);
  assert.equal(uncertain.results[0].status, 'unconfirmed');
  assert.equal(writes, 1);
  assert.equal(JSON.parse((await facebookCaptions({ ...input, action: 'list', tracks: undefined })).body).tracks.length, 2);
  assert.equal(JSON.parse((await facebookCaptions(input)).body).results[0].status, 'already_exists');
  assert.equal(writes, 1);
  tracks.pop(); loseResponse = false;
  assert.equal(JSON.parse((await facebookCaptions(input)).body).results[0].status, 'verified');
  assert.equal(tracks[0].is_default, true);
  tracks.pop(); invalidVerification = true;
  const receipt = JSON.parse((await facebookCaptions(input)).body);
  assert.equal(receipt.results[0].status, 'accepted');
  assert.match(receipt.results[0].sha256, /^[a-f0-9]{64}$/);
  assert.match(receipt.verificationError, /invalid JSON/);
  assert.equal(writes, 3);
});

/** The test picks the chunk size — at the 8MiB default the fixture gets needlessly large. */
process.env.SOCIAL_FLOW_YT_CHUNK_MB = String(256 * 1024 / (1024 * 1024)); // 256KiB = the minimum unit

const CHUNK = 256 * 1024;

function tmpFile(size) {
  const dir = mkdtempSync(join(tmpdir(), 'yt-'));
  const p = join(dir, 'reel.mp4');
  // Fill each position with a different byte so offsets can be verified.
  const b = Buffer.allocUnsafe(size);
  for (let i = 0; i < size; i++) b[i] = i % 251;
  writeFileSync(p, b);
  return { path: p, bytes: b };
}

/**
 * Mock upload server. `plan` decides how each PUT is answered.
 *   'accept'  308 + Range for however much arrived
 *   'drop'    kills the socket (the server has already taken the bytes)
 *   'gone'    404
 */
function mockServer(total, plan) {
  const received = { bytes: 0, puts: 0, ranges: [] };
  const server = createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const cr = req.headers['content-range'] || '';
      const query = /^bytes \*\//.test(cr);
      if (!query) {
        received.puts += 1;
        received.ranges.push(cr);
        const m = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(cr);
        if (m) received.bytes = Math.max(received.bytes, Number(m[2]) + 1);
      }
      const action = query ? 'accept' : (plan.shift() ?? 'accept');
      if (action === 'drop') {
        req.socket.destroy();
        return;
      }
      if (action === 'gone') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('session gone');
        return;
      }
      if (received.bytes >= total) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: 'VID_OK' }));
        return;
      }
      res.writeHead(308, { Range: `bytes=0-${received.bytes - 1}` });
      res.end();
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ url: `http://127.0.0.1:${port}/upload`, received, close: () => server.close() });
    });
  });
}

test('② mid-upload drop — asks the server and continues (0 bytes re-uploaded)', async () => {
  const total = CHUNK * 5;
  const f = tmpFile(total);
  // Drop the 3rd PUT. The server already took those bytes.
  const s = await mockServer(total, ['accept', 'accept', 'drop']);
  try {
    const r = await uploadResumable(s.url, f.path, 'video/mp4', { total });
    assert.equal(r.ok, true, r.ok ? '' : r.body);
    assert.equal(JSON.parse(r.body).id, 'VID_OK');
    assert.equal(r.resumed, true, 'continuing after a drop should set resumed');
    // The dropped chunk's bytes stayed on the server, so that chunk isn't sent again.
    assert.ok(s.received.puts <= 6, `${s.received.puts} PUTs — should not be a full re-send`);
  } finally { s.close(); }
});

test('④ last chunk response lost — the status query recognizes completion', async () => {
  const total = CHUNK * 2;
  const f = tmpFile(total);
  const s = await mockServer(total, ['accept', 'drop']);
  try {
    const r = await uploadResumable(s.url, f.path, 'video/mp4', { total });
    assert.equal(r.ok, true, r.ok ? '' : r.body);
    assert.equal(JSON.parse(r.body).id, 'VID_OK', 'missing the completed state creates a duplicate video');
  } finally { s.close(); }
});

test('⑤ session 404 — stops immediately (no infinite retry)', async () => {
  const total = CHUNK * 3;
  const f = tmpFile(total);
  const s = await mockServer(total, ['gone']);
  try {
    const r = await uploadResumable(s.url, f.path, 'video/mp4', { total });
    assert.equal(r.ok, false);
    assert.equal(r.status, 404);
  } finally { s.close(); }
});

test('⑦ short-form size (single chunk) — the daily path finishes in 1 PUT', async () => {
  const total = 100 * 1024; // smaller than a chunk
  const f = tmpFile(total);
  const s = await mockServer(total, []);
  try {
    const r = await uploadResumable(s.url, f.path, 'video/mp4', { total });
    assert.equal(r.ok, true, r.ok ? '' : r.body);
    assert.equal(s.received.puts, 1, 'a small file must not pick up extra round trips');
    assert.equal(s.received.ranges[0], `bytes 0-${total - 1}/${total}`);
  } finally { s.close(); }
});
