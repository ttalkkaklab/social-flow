import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { WebSocketServer } from 'ws';
import { ChatQueue } from '../dist/live-character.js';
import { createTikTokPlatform, tiktokIngest, tikfinityComment } from '../dist/live-tiktok.js';

test('TikTok keeps the issued transport and signed stream key intact', () => {
  const server = 'rtmp://ingest.example:1935/live/';
  const key = 'stream-123?sig=a%2Fb&expires=100';
  const target = tiktokIngest({ TIKTOK_LIVE_SERVER_URL: server, TIKTOK_LIVE_STREAM_KEY: key });
  assert.equal(target.url, server + key);
  assert.equal(target.allowRtmp, true);
  assert.throws(() => tiktokIngest({ TIKTOK_LIVE_RTMPS_URL: target.url }));
  const full = target.url.replace('rtmp:', 'rtmps:');
  assert.equal(tiktokIngest({ TIKTOK_LIVE_RTMPS_URL: full }).url, full);
  for (const env of [
    {}, { TIKTOK_LIVE_SERVER_URL: server },
    { TIKTOK_LIVE_SERVER_URL: server, TIKTOK_LIVE_RTMPS_URL: full },
    { TIKTOK_LIVE_SERVER_URL: server + '?token=x', TIKTOK_LIVE_STREAM_KEY: key }
  ]) assert.throws(() => tiktokIngest(env));
});

test('TikFinity chat requires a stable ID, ignores gifts and isolates speaker aliases by session', () => {
  const raw = JSON.stringify({ event: 'chat', data: { common: { msgId: '7100000099999999999' },
    comment: '  hello  ', user: { uniqueId: 'viewer' } } });
  const event = tikfinityComment(raw, 'room-a');
  assert.equal(event.id, '7100000099999999999');
  assert.equal(event.text, 'hello');
  assert.equal(event.speaker, tikfinityComment(raw, 'room-a').speaker);
  assert.notEqual(event.speaker, tikfinityComment(raw, 'room-b').speaker);
  for (const payload of [null, { event: 'gift', data: { msgId: '1', comment: 'gift' } },
    { event: 'chat', data: { comment: 'missing id' } },
    { event: 'chat', data: { msgId: 2 ** 54, comment: 'rounded' } }
  ]) assert.equal(tikfinityComment(JSON.stringify(payload), 'a'), undefined);
});

test('TikTok takes real WebSocket questions after its own relay connects and closes without leaking the key', async t => {
  const out = mkdtempSync(join(tmpdir(), 'tiktok-live-'));
  const bridge = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  const controller = new AbortController();
  t.after(() => {
    controller.abort();
    for (const socket of bridge.clients) socket.terminate();
    bridge.close();
    delete process.env.TIKTOK_LIVE_RTMPS_URL;
    delete process.env.TIKTOK_LIVE_TIKFINITY_URL;
    rmSync(out, { recursive: true, force: true });
  });
  await once(bridge, 'listening');
  process.env.TIKTOK_LIVE_TIKFINITY_URL = 'ws://127.0.0.1:' + bridge.address().port;
  process.env.TIKTOK_LIVE_RTMPS_URL = 'rtmps://localhost/live/test-secret?sig=fixture';
  const log = [];
  const platform = createTikTokPlatform({ out, config: { channel: 'host', tiktokChat: 'tikfinity' },
    log: (event, fields) => log.push({ event, fields }) });
  assert.equal(platform.check(false).tiktok.ingest, 'configured');
  await platform.prepare(controller.signal);
  platform.onEvent('relay_connected', { platform: 'youtube' });
  assert.equal(platform.ready, false);
  assert.equal(platform.acceptsStdin, false);
  platform.onEvent('relay_connected', { platform: 'tiktok' });
  assert.equal(platform.ready, true);
  const queue = new ChatQueue(event => {
    platform.onEvent('chat_received', event);
    if (event.id === '2') controller.abort();
  });
  bridge.once('connection', ws => {
    for (const id of ['1', '1', '2']) {
      ws.send(JSON.stringify({ event: 'chat', data: { msgId: id, comment: 'hello ' + id } }));
    }
  });
  await platform.observe({ queue, signal: controller.signal, acceptingUntil: Date.now() + 4000 });
  assert.equal(queue.pending, 2);
  assert.equal(queue.next().source, 'tiktok');
  platform.close('finished');
  const receipt = platform.commands.status();
  assert.equal(receipt.receivedComments, 2);
  assert.equal(receipt.bridgeConnections, 1);
  assert.equal(receipt.state, 'encoder_finished');
  assert.equal(receipt.broadcastState, 'unverified');
  assert.equal(platform.problem(), undefined);
  assert.doesNotMatch(JSON.stringify(log) + readFileSync(join(out, 'tiktok.json'), 'utf8'), /test-secret|sig=fixture/);
});

test('journal failure in a WebSocket callback reaches session cleanup', async t => {
  const out = mkdtempSync(join(tmpdir(), 'tiktok-monitor-failure-'));
  const bridge = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  t.after(() => {
    for (const socket of bridge.clients) socket.terminate();
    bridge.close();
    delete process.env.TIKTOK_LIVE_TIKFINITY_URL;
    rmSync(out, { recursive: true, force: true });
  });
  await once(bridge, 'listening');
  process.env.TIKTOK_LIVE_TIKFINITY_URL = 'ws://127.0.0.1:' + bridge.address().port;
  const platform = createTikTokPlatform({ out, config: { channel: 'test', tiktokChat: 'tikfinity' },
    log() { throw Error('journal unavailable'); } });
  await assert.rejects(platform.observe({ queue: new ChatQueue(), signal: new AbortController().signal,
    acceptingUntil: Date.now() + 3000 }), /journal unavailable/);
});
