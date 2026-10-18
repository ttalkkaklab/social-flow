import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';

const require = createRequire(import.meta.url);
const assets = new URL('../../skills/channel/references/review-assets/', import.meta.url);
const typographySource = readFileSync(new URL('review-typography.js', assets), 'utf8');
const typography = require('../../skills/channel/references/review-assets/review-typography.js');
const manifest = JSON.parse(readFileSync(new URL('fonts/manifest.json', assets), 'utf8'));
const { FONT_ASSETS } = require('../../skills/channel/references/review-fonts.js');
const { storyboardHtml } = require('../../skills/storyboard/references/storyboard-html.js');

test('language routing preserves explicit CJK region independently of reviewer locale', () => {
  const mappings = { ko: 'Pretendard', en: 'Inter', ja: 'Noto Sans JP', 'zh-CN': 'Noto Sans SC',
    'zh-TW': 'Noto Sans TC', 'zh-Hant-TW': 'Noto Sans TC', vi: 'Inter', de: 'Inter', fr: 'Inter', es: 'Inter' };
  for (const [lang, font] of Object.entries(mappings)) assert.equal(typography.family(lang), font);
  const doc = { contentLanguage: 'zh-Hant', shotLanguages: { 2: 'ja' } };
  assert.equal(typography.contentLanguage(doc, { title: '骨直令' }, 0), 'zh-Hant');
  assert.equal(typography.contentLanguage(doc, { title: '骨直令' }, 1), 'ja');
  assert.equal(typography.contentLanguage({}, { title: '骨直令' }, 0), 'und');
  assert.equal(typography.contentLanguage({}, { title: '한글 제목' }, 0), 'ko');
  assert.equal(typography.language('" onmouseover="alert(1)'), '');
});

test('font readiness waits for the selected local face and reports a failed load', async () => {
  let release;
  const loaded = [];
  const window = { document: { documentElement: { lang: 'en' }, fonts: { load: name => {
    loaded.push(name);
    return name.includes('Noto Sans TC') ? new Promise(resolve => { release = resolve; }) : Promise.resolve([{}]);
  } } } };
  runInNewContext(typographySource, { window });
  let done = false;
  const pending = window.ReviewTypography.prepare({ contentLanguage: 'zh-TW' }, [{ title: '臺灣' }]).then(() => { done = true; });
  await Promise.resolve();
  assert.equal(done, false);
  release([{}]); await pending;
  assert.equal(done, true);
  assert.ok(loaded.some(name => name.includes('Noto Sans TC')));
  assert.ok(!loaded.some(name => name.includes('Noto Sans SC')));
  window.document.fonts.load = () => Promise.resolve([]);
  assert.deepEqual(Array.from(await window.ReviewTypography.prepare({}, [])), ['Inter']);
  window.document.fonts.load = () => Promise.reject(new Error('missing local font'));
  assert.deepEqual(Array.from(await window.ReviewTypography.prepare({}, [])), ['Inter']);
});

test('font manifest identifies real WOFF2 files and complete licenses with matching hashes', () => {
  assert.equal(manifest.fonts.length, 5);
  for (const font of manifest.fonts) {
    const buffer = readFileSync(new URL('fonts/' + font.file, assets));
    assert.equal(buffer.subarray(0, 4).toString(), 'wOF2');
    assert.equal(buffer.length, font.bytes);
    assert.equal(createHash('sha256').update(buffer).digest('hex'), font.sha256);
    const license = readFileSync(new URL('fonts/' + font.license.file, assets));
    assert.match(license.toString(), /SIL OPEN FONT LICENSE/i);
    assert.equal(createHash('sha256').update(license).digest('hex'), font.license.sha256);
  }
});

test('standalone refresh copies every typography dependency and detects font drift read-only', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sf-typography-'));
  try {
    storyboardHtml(dir);
    for (const name of FONT_ASSETS) {
      assert.deepEqual(readFileSync(join(dir, name)), readFileSync(new URL(name, assets)), name);
    }
    const name = 'fonts/NotoSansTCVariable.woff2';
    writeFileSync(join(dir, name), 'corrupted');
    assert.deepEqual(storyboardHtml(dir, true), [name]);
    assert.equal(readFileSync(join(dir, name), 'utf8'), 'corrupted');
    storyboardHtml(dir);
    assert.deepEqual(storyboardHtml(dir, true), []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
