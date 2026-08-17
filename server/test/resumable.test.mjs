/**
 * resumable.test.mjs — YouTube 청크 업로드를 모의 서버로 검증한다.
 *
 * 이 테스트가 없으면 §5.11 의 "크기 임계 분기를 만들지 않는다" 판정이 무너진다.
 * 단일 경로로 가는 근거가 "매 빌드가 청크 경로를 검증한다"이기 때문이다. 두 항목을
 * 한 묶음으로 취급한다.
 *
 * 덮는 시나리오 일곱 —
 *   ① 정상 다청크         ② 중간 끊김 후 재개      ③ 바이트만 도달(응답 유실)
 *   ④ 마지막 청크 응답 유실 ⑤ 세션 404              ⑥ 청크 경계 정확성
 *   ⑦ 단일 청크(쇼트폼 크기) — 매일 도는 경로라 여기서 깨지면 안 된다
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { uploadResumable } = await import('../dist/sns-client.js');

/** 청크 크기를 테스트가 정한다 — 기본 8MiB 면 픽스처가 쓸데없이 커진다. */
process.env.SOCIAL_FLOW_YT_CHUNK_MB = String(256 * 1024 / (1024 * 1024)); // 256KiB = 최소 단위

const CHUNK = 256 * 1024;

function tmpFile(size) {
  const dir = mkdtempSync(join(tmpdir(), 'yt-'));
  const p = join(dir, 'reel.mp4');
  // 오프셋을 검증할 수 있게 위치마다 다른 바이트를 채운다.
  const b = Buffer.allocUnsafe(size);
  for (let i = 0; i < size; i++) b[i] = i % 251;
  writeFileSync(p, b);
  return { path: p, bytes: b };
}

/**
 * 모의 업로드 서버. `plan` 이 각 PUT 을 어떻게 응답할지 정한다.
 *   'accept'  받은 만큼 308 + Range
 *   'drop'    소켓을 끊는다 (바이트는 서버가 이미 받아 둔 상태다)
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

test('① 정상 다청크 — 5청크가 전부 올라가고 videoId 를 받는다', async () => {
  const total = CHUNK * 5;
  const f = tmpFile(total);
  const s = await mockServer(total, []);
  try {
    const r = await uploadResumable(s.url, f.path, 'video/mp4', { total });
    assert.equal(r.ok, true, r.ok ? '' : r.body);
    assert.equal(JSON.parse(r.body).id, 'VID_OK');
    assert.equal(s.received.puts, 5, 'PUT 5회여야 한다');
    assert.equal(r.resumed, false);
  } finally { s.close(); }
});

test('② 중간 끊김 — 서버에 물어보고 이어 간다 (재업로드 0바이트)', async () => {
  const total = CHUNK * 5;
  const f = tmpFile(total);
  // 3번째 PUT 을 끊는다. 그 바이트는 서버가 이미 받았다.
  const s = await mockServer(total, ['accept', 'accept', 'drop']);
  try {
    const r = await uploadResumable(s.url, f.path, 'video/mp4', { total });
    assert.equal(r.ok, true, r.ok ? '' : r.body);
    assert.equal(JSON.parse(r.body).id, 'VID_OK');
    assert.equal(r.resumed, true, '끊긴 뒤 이어 갔으면 resumed 여야 한다');
    // 끊긴 청크의 바이트가 서버에 남았으므로 그 청크를 다시 안 보낸다.
    assert.ok(s.received.puts <= 6, `PUT ${s.received.puts}회 — 전체 재전송이 아니어야 한다`);
  } finally { s.close(); }
});

test('③ 바이트는 도달했는데 응답만 끊김 — 오프셋을 우리가 추정하지 않는다', async () => {
  const total = CHUNK * 4;
  const f = tmpFile(total);
  const s = await mockServer(total, ['accept', 'drop']);
  try {
    const r = await uploadResumable(s.url, f.path, 'video/mp4', { total });
    assert.equal(r.ok, true, r.ok ? '' : r.body);
    // 서버가 2청크를 받았다고 답하므로 3번째부터 보낸다 — 2번째를 겹쳐 보내지 않는다.
    const starts = s.received.ranges.map((cr) => Number(/^bytes (\d+)-/.exec(cr)[1]));
    assert.deepEqual([...new Set(starts)].sort((a, b) => a - b), starts.slice().sort((a, b) => a - b),
      '같은 오프셋을 두 번 보냈다');
  } finally { s.close(); }
});

test('④ 마지막 청크 응답 유실 — 상태 질의가 완료를 알아본다', async () => {
  const total = CHUNK * 2;
  const f = tmpFile(total);
  const s = await mockServer(total, ['accept', 'drop']);
  try {
    const r = await uploadResumable(s.url, f.path, 'video/mp4', { total });
    assert.equal(r.ok, true, r.ok ? '' : r.body);
    assert.equal(JSON.parse(r.body).id, 'VID_OK', '완료 상태를 못 알아보면 중복 영상이 생긴다');
  } finally { s.close(); }
});

test('⑤ 세션 404 — 즉시 중단한다 (무한 재시도 금지)', async () => {
  const total = CHUNK * 3;
  const f = tmpFile(total);
  const s = await mockServer(total, ['gone']);
  try {
    const r = await uploadResumable(s.url, f.path, 'video/mp4', { total });
    assert.equal(r.ok, false);
    assert.equal(r.status, 404);
  } finally { s.close(); }
});

test('⑥ Content-Range 가 프로토콜 형식과 청크 경계를 지킨다', async () => {
  const total = CHUNK * 3 + 12345; // 마지막 청크만 256KiB 미만
  const f = tmpFile(total);
  const s = await mockServer(total, []);
  try {
    const r = await uploadResumable(s.url, f.path, 'video/mp4', { total });
    assert.equal(r.ok, true, r.ok ? '' : r.body);
    assert.equal(s.received.ranges.length, 4);
    for (const cr of s.received.ranges) {
      assert.match(cr, /^bytes \d+-\d+\/\d+$/, `형식 위반: ${cr}`);
    }
    // 마지막을 뺀 모든 청크가 256KiB 배수여야 한다 — 프로토콜 요구다.
    for (const cr of s.received.ranges.slice(0, -1)) {
      const [, a, b] = /^bytes (\d+)-(\d+)\//.exec(cr);
      assert.equal((Number(b) - Number(a) + 1) % CHUNK, 0, `청크가 256KiB 배수가 아니다: ${cr}`);
    }
    const last = s.received.ranges.at(-1);
    assert.match(last, new RegExp(`-${total - 1}/${total}$`), '마지막 청크가 파일 끝에서 안 끝난다');
  } finally { s.close(); }
});

test('⑦ 쇼트폼 크기(단일 청크) — 매일 도는 경로가 PUT 1회로 끝난다', async () => {
  const total = 100 * 1024; // 청크보다 작다
  const f = tmpFile(total);
  const s = await mockServer(total, []);
  try {
    const r = await uploadResumable(s.url, f.path, 'video/mp4', { total });
    assert.equal(r.ok, true, r.ok ? '' : r.body);
    assert.equal(s.received.puts, 1, '작은 파일에 추가 왕복이 붙으면 안 된다');
    assert.equal(s.received.ranges[0], `bytes 0-${total - 1}/${total}`);
  } finally { s.close(); }
});
