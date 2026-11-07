import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { config } from '../dist/config.js';
import { generateFromText, seedanceText2VideoSchema } from '../dist/seedance-client.js';

test('a rejected task creation is terminal, a lost connection is not, and one failed status read is polled through', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seedance-'));
  const fetch = globalThis.fetch, key = config.arkApiKey, realSetTimeout = globalThis.setTimeout;
  config.arkApiKey = 'fixture';
  // The client waits 10 s between polls; run that clock forward.
  globalThis.setTimeout = (fn, ms = 0, ...args) => realSetTimeout(fn, ms >= 1000 ? 0 : ms, ...args);
  t.after(() => { globalThis.fetch = fetch; config.arkApiKey = key; globalThis.setTimeout = realSetTimeout; fs.rmSync(dir, { recursive: true, force: true }); });
  const request = seedanceText2VideoSchema.parse({ prompt: 'A boat crosses a lake.', model: 'dreamina-seedance-2-0-fast-260128', outputPath: dir, filename: 'a.mp4' });

  globalThis.fetch = async () => Response.json({ error: { code: 'InvalidParameter', message: 'bad ratio' } }, { status: 400 });
  assert.equal((await generateFromText(request)).terminal, true);
  globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
  assert.equal((await generateFromText(request)).terminal, false);

  let gets = 0;
  globalThis.fetch = async (_url, options) => options.method === 'POST' ? Response.json({ id: 'task-1' })
    : ++gets === 1 ? new Response('busy', { status: 503 }) : Response.json({ id: 'task-1', status: 'failed', error: { message: 'moderation' } });
  const failed = await generateFromText(request);
  assert.equal(failed.terminal, true); assert.equal(failed.taskId, 'task-1'); assert.equal(gets, 2);
});
