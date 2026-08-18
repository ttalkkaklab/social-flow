/**
 * resumable.test.mjs — verifies YouTube chunked upload against a mock server.
 *
 * Without this test, §5.11's verdict of "don't add a size-threshold branch" falls apart,
 * because the reason for going down a single path is that "every build verifies the chunk
 * path". Treat the two as one bundle.
 *
 * Seven scenarios covered —
 *   ① normal multi-chunk      ② resume after a mid-upload drop  ③ bytes arrive, response lost
 *   ④ last chunk's response lost  ⑤ session 404                 ⑥ chunk-boundary accuracy
 *   ⑦ single chunk (short-form size) — the path that runs daily, so it must not break here
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { uploadResumable } = await import('../dist/sns-client.js');

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

test('① normal multi-chunk — all 5 chunks upload and a videoId comes back', async () => {
  const total = CHUNK * 5;
  const f = tmpFile(total);
  const s = await mockServer(total, []);
  try {
    const r = await uploadResumable(s.url, f.path, 'video/mp4', { total });
    assert.equal(r.ok, true, r.ok ? '' : r.body);
    assert.equal(JSON.parse(r.body).id, 'VID_OK');
    assert.equal(s.received.puts, 5, 'should be 5 PUTs');
    assert.equal(r.resumed, false);
  } finally { s.close(); }
});

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

test('③ bytes arrived but the response was cut — we do not guess the offset', async () => {
  const total = CHUNK * 4;
  const f = tmpFile(total);
  const s = await mockServer(total, ['accept', 'drop']);
  try {
    const r = await uploadResumable(s.url, f.path, 'video/mp4', { total });
    assert.equal(r.ok, true, r.ok ? '' : r.body);
    // The server says it got 2 chunks, so we send from the 3rd — the 2nd isn't sent again on top.
    const starts = s.received.ranges.map((cr) => Number(/^bytes (\d+)-/.exec(cr)[1]));
    assert.deepEqual([...new Set(starts)].sort((a, b) => a - b), starts.slice().sort((a, b) => a - b),
      'the same offset was sent twice');
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

test('⑥ Content-Range respects the protocol format and the chunk boundaries', async () => {
  const total = CHUNK * 3 + 12345; // only the last chunk is under 256KiB
  const f = tmpFile(total);
  const s = await mockServer(total, []);
  try {
    const r = await uploadResumable(s.url, f.path, 'video/mp4', { total });
    assert.equal(r.ok, true, r.ok ? '' : r.body);
    assert.equal(s.received.ranges.length, 4);
    for (const cr of s.received.ranges) {
      assert.match(cr, /^bytes \d+-\d+\/\d+$/, `format violation: ${cr}`);
    }
    // Every chunk but the last has to be a multiple of 256KiB — the protocol requires it.
    for (const cr of s.received.ranges.slice(0, -1)) {
      const [, a, b] = /^bytes (\d+)-(\d+)\//.exec(cr);
      assert.equal((Number(b) - Number(a) + 1) % CHUNK, 0, `chunk is not a multiple of 256KiB: ${cr}`);
    }
    const last = s.received.ranges.at(-1);
    assert.match(last, new RegExp(`-${total - 1}/${total}$`), 'the last chunk does not end at the end of the file');
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
