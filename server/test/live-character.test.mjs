import test from 'node:test';
import assert from 'node:assert/strict';
import { ChatQueue, mouthLevel, liveConfig, RATE, synthesize } from '../dist/live-character.js';
import { pcmToWav } from '../dist/media-utils.js';

test('chat deduplicates per platform, caps pending events and refuses malformed messages', () => {
  const q = new ChatQueue(),
    first = { source: 'youtube', id: '42', text: 'shade?' };
  assert.ok(q.add(first));
  assert.equal(q.add(first), false);
  assert.ok(q.add({ ...first, source: 'tiktok' }));
  assert.equal(q.add({ ...first, source: 'bogus' }), false);
  assert.equal(q.add({ ...first, id: 'huge', text: 'x'.repeat(501) }), false);
  for (let i = 0; i < 6; i++) assert.ok(q.add({ ...first, id: String(i) }));
  assert.equal(q.add({ ...first, id: 'overflow' }), false);
  assert.deepEqual(q.next(), first);
  assert.equal(q.next().source, 'tiktok');
});
test('audio frame loudness drives multiple distinct mouth positions', () => {
  const levels = [0, 800, 2300, 11000].map((v) => {
    const b = Buffer.alloc(2000);
    for (let i = 0; i < b.length; i += 2) b.writeInt16LE(v, i);
    return mouthLevel(b);
  });
  assert.deepEqual(levels, [0, 1, 2, 3]);
});

test('speech accepts a complete 30-second utterance and rejects one extra sample before playback', async (t) => {
  const url = process.env.ASTRA_GENAI_SPEECH_URL;
  const key = process.env.ASTRA_GENAI_SPEECH_API_KEY;
  t.after(() => {
    if (url === undefined) delete process.env.ASTRA_GENAI_SPEECH_URL;
    else process.env.ASTRA_GENAI_SPEECH_URL = url;
    if (key === undefined) delete process.env.ASTRA_GENAI_SPEECH_API_KEY;
    else process.env.ASTRA_GENAI_SPEECH_API_KEY = key;
  });
  process.env.ASTRA_GENAI_SPEECH_URL = 'http://localhost.invalid';
  process.env.ASTRA_GENAI_SPEECH_API_KEY = 'test-only';
  let samples = RATE * 30;
  t.mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response(pcmToWav(Buffer.alloc(samples * 2, 64), RATE, 1), {
        headers: { 'content-type': 'audio/wav' }
      })
  );
  const speaker = { model: 'test', voice: 'test' };
  assert.equal((await synthesize(speaker, 'boundary')).length, samples * 2);
  samples++;
  await assert.rejects(synthesize(speaker, 'over boundary'), /30-second/);
});
test('live config rejects offsets outside the canvas and path traversal in channel slug', () => {
  const cfg = {
    project: '/tmp',
    channel: 'test',
    character: 'actor',
    mouth: { x: 0.5, y: 0.45, width: 0.08, height: 0.04 },
    opening: 'Hello',
    chatModel: 'local'
  };
  assert.ok(liveConfig.safeParse(cfg).success);
  assert.equal(liveConfig.safeParse({ ...cfg, channel: '../secrets' }).success, false);
  assert.equal(liveConfig.safeParse({ ...cfg, mouth: { ...cfg.mouth, x: 1.1 } }).success, false);
});

test('a prepared question matches NFC case and punctuation, free-form questions go to the model', async () => {
  const { preparedReply } = await import('../dist/live-character.js');
  const config = { reactions: [{ questions: ['Chào Mochi!'], answer: 'Chào bạn!' }] };
  assert.equal(preparedReply(config, 'chào Mochi'.normalize('NFD')), 'Chào bạn!');
  assert.equal(preparedReply(config, 'Chào Mochi! Áo bạn màu gì?'), undefined);
});
