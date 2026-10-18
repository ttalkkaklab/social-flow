import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { textFindings } = require('../../skills/produce/references/check-clip-artifacts.js');

test('changing captions are found even when OCR reads only one different word per frame', () => {
  // Actual LTX output: large invented subtitles, partially read by OCR at 2s and 3s.
  const findings = textFindings([{ t: 2, words: ['Minjae'] }, { t: 3, words: ['orelitity'] }]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, 'text');
  assert.match(findings[0].what, /2–3s/);
});

test('a single isolated word still needs visual review rather than an automatic text finding', () => {
  assert.deepEqual(textFindings([]), []);
  assert.deepEqual(textFindings([{ t: 2, words: ['Minjae'] }]), []);
  assert.equal(textFindings([{ t: 2, words: ['Hello', 'world'] }]).length, 1);
});
