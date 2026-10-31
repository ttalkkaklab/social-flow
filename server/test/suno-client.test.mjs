import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { config } from '../dist/config.js';
import { generateMusic } from '../dist/suno-client.js';

// The client polls every 15 s; run that clock forward instead of waiting (astra-video-client.test.mjs).
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms = 0, ...args) => realSetTimeout(fn, ms < 1_000 ? ms : 0, ...args);

function setup(t, replies) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'suno-client-'));
  const old = config.sunoApiKey; config.sunoApiKey = 'test-only';
  t.after(() => { config.sunoApiKey = old; fs.rmSync(dir, { recursive: true, force: true }); });
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    calls.push({ url: String(url), options });
    assert.ok(options.signal instanceof AbortSignal, 'every request carries a timeout');
    if (String(url).startsWith('https://cdn.test/')) return new Response('audio:' + String(url).slice(-5));
    const reply = replies.shift();
    if (reply instanceof Error) throw reply;
    return reply;
  });
  return { dir, calls };
}
const record = (status, ...urls) => Response.json({ code: 200, data: { status, response: { sunoData: urls.map((audioUrl, i) => ({ id: 't' + i, audioUrl })) } } });
const request = (dir, extra = {}) => ({ model: 'V6', style: 'calm piano', instrumental: true, customMode: false, pickTrack: 0, outputPath: dir, filename: 'bed.mp3', ...extra });

test('FIRST_SUCCESS keeps polling until the picked second track has audio', async t => {
  const { dir } = setup(t, [
    Response.json({ code: 200, data: { taskId: 'task-1' } }),
    record('FIRST_SUCCESS', 'https://cdn.test/a.mp3'),
    record('SUCCESS', 'https://cdn.test/a.mp3', 'https://cdn.test/b.mp3'),
  ]);
  const result = await generateMusic(request(dir, { pickTrack: 1 }));
  assert.equal(result.success, true);
  assert.equal(fs.readFileSync(result.audioPath, 'utf8'), 'audio:b.mp3');
});

test('a picked track that never gets audio fails instead of returning track 0', async t => {
  const { dir } = setup(t, [
    Response.json({ code: 200, data: { taskId: 'task-1' } }),
    ...Array.from({ length: 3 }, () => record('SUCCESS', 'https://cdn.test/a.mp3')),
  ]);
  const result = await generateMusic(request(dir, { pickTrack: 1 }));
  assert.equal(result.success, false); assert.equal(result.taskId, 'task-1'); assert.equal(result.terminal, false);
});

test('transient poll errors are retried; a billed task is not dropped on one failure', async t => {
  const { dir } = setup(t, [
    Response.json({ code: 200, data: { taskId: 'task-1' } }),
    Response.json({ code: 455, msg: 'maintenance' }),
    new TypeError('fetch failed'),
    record('SUCCESS', 'https://cdn.test/a.mp3', 'https://cdn.test/b.mp3'),
  ]);
  assert.equal((await generateMusic(request(dir))).success, true);
});

test('only a rejected create call with no task ID is terminal', async t => {
  const { dir } = setup(t, [
    Response.json({ code: 400, msg: 'bad style' }),
    new Response('gateway', { status: 502 }),
  ]);
  const rejected = await generateMusic(request(dir));
  assert.equal(rejected.success, false); assert.equal(rejected.taskId, undefined); assert.equal(rejected.terminal, true);
  // A gateway error says nothing about whether a task was created.
  assert.equal((await generateMusic(request(dir))).terminal, false);
});
