import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MotionAvatar, cycleFrame } from '../dist/live-motion.js';

test('camera cycle advances on every step and reverses without repeating the end frames', () => {
  assert.deepEqual(
    Array.from({ length: 9 }, (_, i) => cycleFrame(i, 4)),
    [0, 1, 2, 3, 2, 1, 0, 1, 2]
  );
});
test('live performance rejects a held image and advances while no one is speaking', () => {
  const project = mkdtempSync(join(tmpdir(), 'live-motion-test-'));
  let live;
  try {
    for (const [name, src] of [
      ['still', 'color=c=black:s=90x160:r=25'],
      ['move', 'testsrc2=s=90x160:r=25']
    ]) {
      execFileSync('ffmpeg', [
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        src,
        '-t',
        '1.3',
        '-pix_fmt',
        'yuv420p',
        join(project, name + '.mp4')
      ]);
    }
    assert.throws(
      () => new MotionAvatar({ project, motionVideo: 'still.mp4', idleVideos: [] }),
      /still frame/
    );
    live = new MotionAvatar({ project, motionVideo: 'move.mp4', idleVideos: ['move.mp4'] });
    const first = live.next();
    assert.ok(!first.equals(live.next()));
    for (let n = 0; n < 34; n++) live.next();
    live.startSpeech();
    assert.deepEqual(live.next(), first);
  } finally {
    live?.close();
    rmSync(project, { recursive: true, force: true });
  }
});

test('a live destination requires driving footage before checking credentials or opening a room', () => {
  const project = mkdtempSync(join(tmpdir(), 'live-photo-'));
  try {
    const config = join(project, 'config.json');
    writeFileSync(
      config,
      JSON.stringify({
        project,
        channel: 'test',
        character: 'host',
        panel: 'face',
        opening: 'Hello',
        chatModel: 'test',
        mouth: { x: 0.5, y: 0.5, width: 0.1, height: 0.05 }
      })
    );
    for (const destination of ['--youtube', '--tiktok']) {
      const result = spawnSync(
        process.execPath,
        [
          fileURLToPath(new URL('../dist/character-live.bundle.js', import.meta.url)),
          'check',
          '--config',
          config,
          destination
        ],
        { encoding: 'utf8' }
      );
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /Set motionVideo/);
    }
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});
