import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {dependencyTracker, runtimeInputs, readCachedRender, writeRenderCache} from '../../skills/produce/references/motion-render-cache.mjs';
const proof = createRequire(import.meta.url)('../../skills/produce/references/slide-render-proof.js');
function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'motion-cache-'));
  t.after(() => fs.rmSync(root, {recursive:true, force:true}));
  const slides = path.join(root, 'slides'), out = path.join(root, 'render');
  fs.mkdirSync(slides); fs.mkdirSync(out);
  const html = path.join(slides, 's1-test.html'), dependency = path.join(slides, 'runtime.js');
  fs.writeFileSync(html, '<script src="runtime.js"></script>');
  fs.writeFileSync(path.join(root, 'scenes.js'), 'window.SCENES=[]');
  fs.writeFileSync(dependency, 'window.duration=1000');
  const mp4 = path.join(out, 'r1.mp4'), summary = path.join(out, 'summary.json');
  fs.writeFileSync(mp4, 'encoded fixture bytes');
  fs.writeFileSync(summary, '{"warnings":["subject action not reviewed"]}');
  const dependencies = dependencyTracker();
  dependencies.observe(pathToFileURL(html).href); dependencies.observe(pathToFileURL(dependency).href);
  const key = {runtime:runtimeInputs(slides), groups:[{dur:1000}], segs:{1:1000}, options:{fps:30, grain:6}};
  proof.writeProof(html, out, proof.inputs(html), [{k:1, mp4, nF:31}], 30);
  writeRenderCache({out, key, dependencies, artifacts:[summary]});
  return {root, out, html, dependency, mp4, summary, key, dependencies};
}
test('matching content reuses proof and preserves quality warnings', t => {
  const f = setup(t);
  assert.deepEqual(readCachedRender(f), {warnings:['subject action not reviewed']});
  assert.equal(proof.verifyClip(f.mp4, f.html, 1).frames, 31);
});
for (const kind of ['html', 'dependency', 'timing', 'missing', 'corrupt', 'summary', 'remote', 'new dependency']) {
  test(`cache invalidates on ${kind}`, t => {
    const f = setup(t);
    if (kind === 'html') fs.appendFileSync(f.html, '<p>changed</p>');
    if (kind === 'dependency') fs.appendFileSync(f.dependency, ';changed()');
    if (kind === 'timing') f.key.segs[1] = 1200;
    if (kind === 'missing') fs.unlinkSync(f.mp4);
    if (kind === 'corrupt') fs.writeFileSync(f.mp4, 'truncated');
    if (kind === 'summary') fs.writeFileSync(f.summary, '{"warnings":[]}');
    if (kind === 'remote') f.dependencies.observe('https://example.org/font.woff');
    if (kind === 'new dependency') {
      const file = path.join(f.root, 'new.png'); fs.writeFileSync(file, 'image');
      f.dependencies.observe(pathToFileURL(file).href);
    }
    assert.equal(readCachedRender(f), null);
  });
}
test('dependencies changed while capturing do not receive cache metadata', t => {
  const f = setup(t);
  fs.appendFileSync(f.dependency, ';changed()');
  assert.equal(writeRenderCache({...f, artifacts:[f.summary]}), false);
});
test('bad proof and missing artifacts rerender without trusting a file name', t => {
  const f = setup(t);
  fs.unlinkSync(f.summary);
  assert.equal(readCachedRender(f), null);
  fs.writeFileSync(path.join(f.out, 'render-proof.json'), '{broken');
  assert.equal(readCachedRender(f), null);
});
