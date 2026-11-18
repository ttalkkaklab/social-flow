import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { reader, validate } = require('../../skills/storyboard/references/review-localization.js');

test('review translations preserve source, reject duplicates and fall back after edits', () => {
  const bundle = { version: 1, sourceLanguage: 'vi', languages: ['vi', 'ko', 'ja'], entries: [
    { source: 'Đưa tay đây.', translations: { vi: 'Đưa tay đây.', ko: '손 줘 봐.' } },
  ] };
  const original = JSON.stringify(bundle);
  const ko = reader(bundle, 'ko');
  assert.equal(ko.text('Đưa tay đây.'), '손 줘 봐.');
  assert.equal(ko.text('Đưa tay đây!'), 'Đưa tay đây!');
  assert.equal(reader(bundle, 'ja').text('Đưa tay đây.'), 'Đưa tay đây.');
  assert.equal(reader(bundle, 'invalid').language, 'vi');
  assert.equal(JSON.stringify(bundle), original);
  assert.throws(() => validate({ ...bundle, entries: [...bundle.entries, bundle.entries[0]] }), /duplicate/);
  assert.throws(() => validate({ ...bundle, entries: [{ source: 'a', translations: { xx: 'b' } }] }), /Invalid/);
});
