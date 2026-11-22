import { PassThrough } from 'node:stream';
import { listenChatInput } from '../dist/live-character.js';
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
test('chat resumes the paused credential input and detaches when the session ends', async () => {
  const input = new PassThrough();
  input.pause();
  const queue = new ChatQueue();
  const stop = listenChatInput(input, source => source === 'tiktok', queue);
  const write = (source, id) => input.write(JSON.stringify({ source, id, text: 'hello' }) + '\n');
  write('youtube', 'wrong-room');
  write('tiktok', 'viewer-1');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(queue.next()?.id, 'viewer-1');
  stop();
  write('tiktok', 'after-session');
  assert.equal(input.isPaused(), true);
  assert.equal(queue.pending, 0);
  input.destroy();
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
  assert.ok(
    liveConfig.safeParse({ ...cfg, speechLanguage: 'ko', youtubeCredentialChannel: 'destination' }).success
  );
  assert.equal(liveConfig.safeParse({ ...cfg, youtubeCredentialChannel: '../other' }).success, false);
  assert.equal(liveConfig.safeParse({ ...cfg, speechLanguage: 'ko; override' }).success, false);
  assert.equal(liveConfig.safeParse({ ...cfg, channel: '../secrets' }).success, false);
  assert.equal(liveConfig.safeParse({ ...cfg, mouth: { ...cfg.mouth, x: 1.1 } }).success, false);
});

test('a prepared question matches NFC case and punctuation, free-form questions go to the model', async () => {
  const { preparedReply } = await import('../dist/live-character.js');
  const config = { reactions: [{ questions: ['Chào Mochi!'], answer: 'Chào bạn!' }] };
  assert.equal(preparedReply(config, 'chào Mochi'.normalize('NFD')), 'Chào bạn!');
  assert.equal(preparedReply(config, 'Chào Mochi! Áo bạn màu gì?'), undefined);
});

test('room topic opens in Korean with a comment invitation and audience-wide welcome clips', async () => {
  const {broadcastLines} = await import('../dist/live-character.js');
  const raw = {project:'/tmp',channel:'test',character:'host',chatModel:'local',topic:'잠들기 전에 읽는 책'};
  const cfg = liveConfig.parse(raw);
  assert.equal(cfg.maxConcurrentVideos,3);
  assert.equal(liveConfig.parse({...raw,maxConcurrentVideos:1}).maxConcurrentVideos,1);
  assert.equal(liveConfig.safeParse({...raw,maxConcurrentVideos:0}).success,false);
  const lines = await broadcastLines(cfg, {language:'ko-KR'});
  assert.ok(lines.opening.includes(raw.topic) && lines.opening.includes('댓글'));
  assert.ok(lines.standby.includes('안녕하세요. 지금 입장하신 분들 환영해요.'));
  assert.equal(new Set(lines.standby).size,2);
  const legacy = {...raw,topic:undefined,opening:'Welcome back.',standbyLines:['Welcome.','Please join us.']};
  assert.deepEqual(await broadcastLines(legacy,{language:'en'}),{opening:legacy.opening,standby:legacy.standbyLines});
});
