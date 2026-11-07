import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { windows, assess } = require('../../skills/produce/references/motion-expectation.js');
const frozen = { samples: 20, seconds: 5, mean: 0, frozenShare: 1, longestStillSeconds: 5, onsetSeconds: null };

test('invalid timing fails while uncovered or truncated cut ranges are reported', () => {
  for (const seconds of [NaN, Infinity, 0, -1, '5'])
    assert.throws(() => windows({ productionPlan: { cuts: [{ seconds }] } }, 5), /finite seconds/);
  const tail = windows({ productionPlan: { cuts: [{ kind: 'motion', seconds: 2 }] } }, 5);
  assert.equal(tail[1].start, 2);
  assert.match(tail[1].findings.join(), /tail outside/);
  assert.match(windows({ productionPlan: { cuts: [{ seconds: 6 }] } }, 5)[0].findings.join(), /extends beyond/);
  assert.match(assess('short.mp4', { duration: .1 }, { measure: () => ({ ...frozen, samples: 0 }) }).warnings.join(), /no motion samples/);
});

test('frame rounding stays in the final cut and unknown cut kinds cannot inherit a still exemption', () => {
  const parts = windows({ productionPlan: { cuts: [{ kind: 'motion', seconds: 5.54 }] } }, 5.566667);
  assert.equal(parts.length, 1);
  assert.equal(parts[0].seconds, 5.566667);
  assert.equal(windows({ productionPlan: { cuts: [{ kind: 'motion', seconds: 5.54 }] } }, 5.566667, { fps: 60 }).length, 2);
  assert.throws(() => windows({}, 5, { fps: 0 }), /frame rate/);
  const result = assess('clip.mp4', { duration: 5, shot: { render: { mode: 'still_camera' } },
    productionPlan: { cuts: [{ kind: 'typo', seconds: 5 }] } }, { measure: () => frozen });
  assert.equal(result.windows[0].kind, 'unknown');
  assert.match(result.warnings.join(), /unrecognized production cut kind/);
  assert.match(result.warnings.join(), /reads as a still/);
});
