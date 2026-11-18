import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const { spanOf, measure, suggestTrim } = createRequire(import.meta.url)('../../skills/_shared/speech-span.js');

test('the span is the first and last sustained loud stretch; a click or a silent track is not a line', () => {
  const levels = (...runs) => runs.flatMap(([steps, db]) => Array(steps).fill(db)); // 20 ms steps
  assert.deepEqual(spanOf(levels([100, -75], [150, -12], [50, -75])), { startSeconds: 2, endSeconds: 5 });
  assert.deepEqual(spanOf(levels([20, -75], [3, -10], [77, -75], [150, -12], [50, -75])), { startSeconds: 2, endSeconds: 5 });
  assert.equal(spanOf(levels([300, -80])), null);
});

test('a trim keeps the authored anticipation and reaction and skips an end the author left open', () => {
  const span = { startSeconds: 2.44, endSeconds: 5.8, clipSeconds: 9 };
  const line = { narration: [{ id: 'l1', acting: { leadInSeconds: 1 } }] };
  assert.deepEqual(suggestTrim(span, line), { edit: { in: 1.417, out: 6.333 }, durationSeconds: 4.916 });
  const reaction = { ...line, performance: [{ kind: 'dialogue', group: 1 }, { kind: 'action', text: 'She waits for the answer.' }] };
  assert.deepEqual(suggestTrim(span, reaction).edit, { in: 1.417 });
  assert.equal(suggestTrim({ startSeconds: 0.3, endSeconds: 3.8, clipSeconds: 4 }, line), null);
});

test('a clip is measured from its own soundtrack', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sf-speech-span-'));
  try {
    const clip = join(dir, 'clip.mp4');
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=black:size=64x64:rate=24:duration=3', '-f', 'lavfi', '-i',
      'aevalsrc=if(between(t\\,1.5\\,2.5)\\,0.3*sin(2*PI*440*t)\\,0):s=48000:d=3', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', clip]);
    const span = measure(clip);
    assert.ok(Math.abs(span.startSeconds - 1.5) < 0.06 && Math.abs(span.endSeconds - 2.5) < 0.06, JSON.stringify(span));
    assert.ok(Math.abs(span.leadSilenceSeconds - 1.5) < 0.06);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
