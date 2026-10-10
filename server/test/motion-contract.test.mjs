import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const motion = require('../../skills/produce/references/measure-motion.js');
const { checkQuality } = require('../../skills/storyboard/references/slide-quality.js');
const W = 1080, H = 1920, frames = 13;
const cases = ['thin-line', 'static', 'flicker', 'background-only', 'subject-action'];

function renderedFrames(kind) {
  const all = Buffer.alloc(W * H * frames, 24);
  const rectangle = (frame, x, y, width, height, color) => {
    for (let row = y; row < y + height; row++) frame.fill(color, row * W + x, row * W + x + width);
  };
  for (let i = 0; i < frames; i++) {
    const frame = all.subarray(i * W * H, (i + 1) * W * H);
    if (kind === 'background-only') {
      for (let x = 0; x < W; x += 90) rectangle(frame, x, 0, 90, H, (x / 90 + i) % 2 ? 80 : 160);
    }
    rectangle(frame, 300, 850, 400, 200, 96);
    if (kind === 'thin-line') rectangle(frame, 0, 1100, Math.round(W * i / (frames - 1)), 6, 240);
    if (kind === 'flicker') rectangle(frame, 500, 900, 20, 20, i % 2 ? 97 : 96);
    if (kind === 'subject-action') rectangle(frame, 50, 750, Math.round(900 * i / (frames - 1)), 600, 240);
  }
  return all;
}
function ffmpeg(args, input) {
  const result = spawnSync('ffmpeg', ['-y', '-v', 'error', ...args], { input, encoding: 'utf8', timeout: 60_000, maxBuffer: 32 * 1024 * 1024 });
  assert.equal(result.status, 0, result.error?.message || result.stderr);
}

test('lossless rendered comparisons and final H.264 preserve the motion contract and its semantic limit', () => {
  const dir = mkdtempSync(join(tmpdir(), 'motion-contract-'));
  try {
    for (const kind of cases) {
      const source = join(dir, `${kind}.mkv`), encoded = join(dir, `${kind}.mp4`);
      ffmpeg(['-f', 'rawvideo', '-pixel_format', 'gray', '-video_size', `${W}x${H}`, '-framerate', '4', '-i', '-', '-c:v', 'ffv1', source], renderedFrames(kind));
      ffmpeg(['-i', source, '-r', '30', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '18', '-pix_fmt', 'yuv420p', encoded]);
      for (const file of [source, encoded]) {
        const evidence = motion.slideEvidence(file);
        assert.equal(evidence.semanticReview, 'required', kind);
        assert.equal(evidence.findings.length > 0, !['background-only', 'subject-action'].includes(kind), `${kind}: ${JSON.stringify(evidence)}`);
        assert.deepEqual(evidence.findings, motion.findings(motion.measure(file), 'card', { stillLimit: 8 }));
        if (kind === 'static') {
          const limited = motion.slideEvidence(file, { stillLimit: motion.plateStillLimit({ max_static_ground_seconds: 2 }) });
          assert.ok(limited.findings.some(f => f.includes('limit 2s')));
        }
      }
    }
    // The background counterexample has plenty of pixels moving but no valid subject change.
    const plan = driver => ({ treatment: 'editorial', quality: 'object-state-v1', subject: {
      kind: 'data', changes: [{ group: 1, before: 'empty measure', after: 'filled measure', driver }],
    } });
    assert.ok(checkQuality(plan('camera'), 1).some(f => f.includes('not subject changes')));
    assert.ok(checkQuality(plan('settle'), 1).some(f => f.includes('not subject changes')));
    assert.deepEqual(checkQuality(plan('value'), 1), []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the slide renderer records the shared metric without using it as an approval', () => {
  const renderer = readFileSync(new URL('../../skills/produce/references/render-motion-slide.mjs', import.meta.url), 'utf8');
  assert.match(renderer, /motion\.slideEvidence\(r\.mp4, \{ stillLimit: motion\.plateStillLimit\(global\.window\.MOTION_POLICY\) \}\)/);
  assert.match(renderer, /rendered_motion: renderedMotion/);
  assert.match(renderer, /opt\.pngOnly \|\| opt\.previz \? null/);
});

// Optional real HTML helper capture on macOS:
// node server/test/fixtures/render-motion-contract.mjs /tmp/social-flow-motion-html
// Uses the repository capture-frames.sh lane; produces PNGs, lossless source and H.264 evidence.
