import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { encode, splitIngest } from '../dist/live-encoder.js';
import { WIDTH, HEIGHT, SAMPLES } from '../dist/live-character.js';
test('RTMPS relay isolates destination key and rejects insecure ingest', () => {
  assert.deepEqual(splitIngest('rtmps://ingest.example/live2/secret?sig=x'), {
    base: 'rtmps://ingest.example/live2',
    key: 'secret?sig=x'
  });
  assert.throws(() => splitIngest('rtmp://ingest.example/live2/key'));
  assert.throws(() => splitIngest('rtmps://user:pass@host/live/key'));
});
test('continuous encoder records live audio, closes utterance and writes decodable vertical H264/AAC', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'live-encoder-'));
  const archive = join(dir, 'test.flv');
  const poses = Array.from({ length: 8 }, (_, i) => Buffer.alloc(WIDTH * HEIGHT * 3, i * 15));
  const log = [];
  const voices = [
    { id: 'probe', source: 'operator', text: 'hello', pcm: Buffer.alloc(SAMPLES * 6, 70) },
    { id: 'cut-short', source: 'operator', text: 'another reply', pcm: Buffer.alloc(SAMPLES * 50, 70) }
  ];
  try {
    await encode(
      poses,
      archive,
      [],
      1,
      new AbortController().signal,
      () => voices.shift(),
      (e, v) => log.push([e, v])
    );
    assert.deepEqual(
      log.map((s) => s[0]),
      ['speech_start', 'speech_end', 'speech_start', 'encoded', 'speech_interrupted']
    );
    assert.equal(log[1][1].frame, 2);
    assert.deepEqual(log.at(-1)[1], {
      source: 'operator',
      id: 'cut-short',
      frame: 24,
      samplesSent: SAMPLES * 21,
      totalSamples: SAMPLES * 25
    });
    const probe = JSON.parse(
      execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', archive])
    );
    assert.ok(probe.streams.some((s) => s.codec_name === 'h264' && s.width === 720 && s.height === 1280));
    assert.ok(probe.streams.some((s) => s.codec_name === 'aac'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
