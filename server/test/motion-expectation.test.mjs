import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { classify, windows, assess } = require('../../skills/produce/references/motion-expectation.js');
const frozen = { samples: 20, seconds: 5, mean: 0, frozenShare: 1, longestStillSeconds: 5, onsetSeconds: null };
const moving = { ...frozen, mean: 8, frozenShare: 0, longestStillSeconds: 0, onsetSeconds: .25 };

test('Kim Gu image plus renderedFile does not exempt planned generated motion', () => {
  const scene = { duration: 5, shot: { render: { mode: 'generated_video' } }, visual: { picture: 'asset', src: 'accounts.png', renderedFile: 'accounts.mp4' } };
  const result = assess('accounts.mp4', scene, { measure: () => frozen });
  assert.equal(result.windows[0].kind, 'video');
  assert.match(result.warnings.join(), /image source/);
  assert.match(result.warnings.join(), /reads as a still/);
});
test('moving neighbors cannot mask an unexplained static graphic; source seek is not timeline time', () => {
  const calls = [];
  const scene = { duration: 10, shot: { render: { mode: 'generated_video' } }, productionPlan: { cuts: [
    { kind: 'motion', path: 'person.mp4', start: 42, seconds: 5 }, { kind: 'graphic', path: 'accounts.png', seconds: 5 }
  ] } };
  const result = assess('master.mp4', scene, { start: 100, measure: (_, w) => { calls.push(w); return w.start === 100 ? moving : frozen; } });
  assert.deepEqual(calls, [{ start: 100, seconds: 5 }, { start: 105, seconds: 5 }]);
  assert.equal(result.windows[1].kind, 'explanatory');
  assert.match(result.warnings.join(), /105.000s cut 1.*reads as a still/);
  assert.match(result.warnings.join(), /planned generated_video differs/);
});
test('a reasoned static quotation avoids motion warnings but is not a semantic pass', () => {
  const scene = { duration: 5, productionPlan: { cuts: [{ kind: 'graphic', path: 'quote.png', seconds: 5,
    motionIntent: { type: 'intentional_still', reason: 'Hold the original quotation for reading.' } }] } };
  const result = assess('quote.mp4', scene, { measure: () => frozen });
  assert.deepEqual(result.warnings, []);
  assert.equal(result.semanticReview, 'not_reviewed');
  delete scene.productionPlan.cuts[0].motionIntent.reason;
  assert.match(assess('quote.mp4', scene, { measure: () => frozen }).warnings.join(), /no reason/);
});
test('background motion and a real animated timeline both require semantic inspection', () => {
  for (const mode of ['data_graph', 'object_html', 'character_html']) {
    const result = assess('clip.mp4', { duration: 5, shot: { render: { mode } } }, { measure: () => moving });
    assert.equal(result.status, 'no-proxy-findings');
    assert.equal(result.windows[0].semanticReview, 'not_reviewed');
  }
});
test('unknown graphic cannot escape diagnostics and camera motion has its own expectation', () => {
  assert.equal(classify({ visual: { renderedFile: 'unknown.mp4' } }).kind, 'unknown');
  assert.equal(classify({ visual: { slide: { kind: 'camera', motion: true } } }).kind, 'still_camera');
  assert.match(assess('unknown.mp4', { duration: 5 }, { measure: () => frozen }).warnings.join(), /reads as a still/);
});
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

test('moving still/archive cuts and camera wrappers cannot satisfy an explanatory plan', () => {
  for (const mode of ['data_graph', 'object_html', 'character_html']) {
    for (const kind of ['still', 'archive']) {
      const scene = { duration: 5, shot: { render: { mode } }, productionPlan: {
        cuts: [{ kind, path: 'explanation.png', seconds: 5 }]
      } };
      const result = assess('panning-image.mp4', scene, { measure: () => moving });
      assert.equal(result.windows[0].kind, 'still_camera');
      assert.equal(result.status, 'needs-review');
      assert.match(result.warnings.join(), new RegExp(`planned ${mode} differs from actual still_camera cut`));
      assert.equal(result.semanticReview, 'not_reviewed');
      assert.doesNotMatch(result.warnings.join(), /reads as a still/);
    }
    const scene = { duration: 5, shot: { render: { mode } }, visual: {
      slide: { kind: 'camera', motion: true }, renderedFile: 'pan.mp4'
    } };
    const result = assess('pan.mp4', scene, { measure: () => moving });
    assert.equal(result.windows[0].kind, 'still_camera');
    assert.equal(result.status, 'needs-review');
    assert.match(result.warnings.join(), new RegExp(`planned ${mode} differs from actual still_camera handoff`));
    assert.equal(result.windows[0].semanticReview, 'not_reviewed');
  }
});
