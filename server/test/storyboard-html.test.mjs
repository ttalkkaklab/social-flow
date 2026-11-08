import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { tmpdir } from 'node:os';
const require = createRequire(import.meta.url);
const { FONT_ASSETS } = require('../../skills/channel/references/review-fonts.js');
const { storyboardHtml } = require('../../skills/storyboard/references/storyboard-html.js');

test('bound video displays before assembly, while explicit edit cuts retain their ranges', () => {
  const template = readFileSync(new URL('../../skills/storyboard/references/storyboard-html-template.html', import.meta.url), 'utf8');
  const start = template.indexOf('  function productionCutsHtml(s)');
  const source = template.slice(start, template.indexOf('  function camOf(s)', start));
  const render = shot => runInNewContext(source + '\nproductionCutsHtml(shot)', {
    shot, LANG: 'en', WIDE: true,
    esc: v => String(v ?? '').replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;'),
  });
  const shot = { duration: 2, visual: { video: { clip: '../.work/video/native.mp4' } } };
  for (const productionPlan of [undefined, { cuts: [] }]) {
    const html = render({ ...shot, productionPlan });
    assert.match(html, /<video src="\.\.\/\.work\/video\/native\.mp4" controls/);
    assert.match(html, /class="production-cut-error" hidden/);
    assert.doesNotMatch(html, /ontimeupdate=/); // Full source, never truncate to the authored estimate.
  }
  shot.visual.video.clip = '/Volumes/data/replacement.mp4';
  assert.match(render(shot), /src="\/Volumes\/data\/replacement\.mp4"/);
  shot.productionPlan = { cuts: [
    { kind: 'generated_video', path: '../edit/a.mp4', start: 1, seconds: 2 },
    { kind: 'generated_video', path: '../edit/b.mp4', start: 0, seconds: 3 },
  ] };
  const edit = render(shot);
  assert.equal((edit.match(/<video /g) || []).length, 2);
  assert.match(edit, /data-start="1" data-end="3"/);
  assert.doesNotMatch(edit, /replacement\.mp4/);
  shot.productionPlan.cuts[0].seconds = undefined;
  assert.match(render(shot), /class="production-cut-error">/); // Invalid explicit ranges stay visible.
  assert.equal(render({ visual: { video: { prompt: 'planned only' } } }), '');
  assert.doesNotMatch(render({ visual: { video: { clip: 'javascript:evil.mp4' } } }), /<video /);
});

test('HTML creation and refresh keep one design while preserving episode metadata', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sf-board-html-'));
  try {
    // No scenes, credentials, or network are required to create the review shell.
    assert.equal(storyboardHtml(dir).length, 20 + FONT_ASSETS.length);
    const file = join(dir, 'storyboard.html');
    const original = readFileSync(file, 'utf8');
    const title = '<title>Episode $& — 로컬 검토</title>';
    const metadata = '/* ✎ SB_DOC BEGIN */\nwindow.SB_DOC = { core: "$& keeps its text" };\n/* ✎ SB_DOC END */';
    const edited = original.replace(/^<title>[^]*?<\/title>/m, () => title)
      .replace(/\/\* ✎ SB_DOC BEGIN[^]*?\/\* ✎ SB_DOC END \*\//, () => metadata);
    writeFileSync(file, edited);
    assert.deepEqual(storyboardHtml(dir, true), []);
    writeFileSync(file, edited.replace('--bg: var(--ds-canvas)', '--bg: #000000'));
    writeFileSync(join(dir, 'render-routing.js'), 'stale runtime');
    assert.deepEqual(storyboardHtml(dir, true), ['storyboard.html', 'render-routing.js']);
    storyboardHtml(dir);
    assert.equal(readFileSync(file, 'utf8'), edited);
    assert.deepEqual(storyboardHtml(dir, true), []);
    writeFileSync(file, edited.replace('width=device-width', 'width=1920'));
    assert.deepEqual(storyboardHtml(dir, true), ['storyboard.html']);
    storyboardHtml(dir);
    assert.equal(readFileSync(file, 'utf8'), edited);
    assert.ok(readFileSync(file, 'utf8').includes('<meta name="viewport" content="width=device-width, initial-scale=1">'));
    assert.ok(!existsSync(join(dir, 'scenes.js')));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('check is read-only and malformed existing metadata is preserved for repair', () => {
  const root = mkdtempSync(join(tmpdir(), 'sf-board-html-check-'));
  try {
    const dir = join(root, 'storyboard');
    assert.equal(storyboardHtml(dir, true).length, 20 + FONT_ASSETS.length);
    assert.equal(existsSync(dir), false);
    storyboardHtml(dir);
    const file = join(dir, 'storyboard.html');
    const broken = '<title>Keep this</title>\ncustom metadata without markers';
    writeFileSync(file, broken);
    assert.throws(() => storyboardHtml(dir), /SB_DOC/);
    assert.equal(readFileSync(file, 'utf8'), broken);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// Board values come from model output and web research; the review page opens in the owner's browser.
test('review HTML never turns javascript: or data: board values into links', () => {
  const template = readFileSync(new URL('../../skills/storyboard/references/storyboard-html-template.html', import.meta.url), 'utf8');
  const safeSrc = runInNewContext('(' + template.match(/function safeSrc\(src\) \{[^\n]*\}/)[0] + ')');
  for (const bad of ['javascript:alert(1)', 'JAVASCRIPT:x', 'data:text/html,x', '//evil.example/a.png', 'a\u0000.png'])
    assert.equal(safeSrc(bad), '', bad);
  assert.equal(safeSrc('../media/room.png'), '../media/room.png');
  const start = template.indexOf('  function locationSheetsHtml(');
  const sheets = template.slice(start, template.indexOf('  h += locationSheetsHtml', start));
  const context = { window: {}, LANG: 'ko', esc: v => String(v ?? '').replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;'),
    doc: { locations: [{ id: 'room', name: 'room', imageUrl: 'javascript:alert(1)', sheetPath: 'data:text/html,unsafe' }] }, shots: [] };
  const render = () => runInNewContext(sheets + '\nlocationSheetsHtml(doc, shots)', context);
  assert.doesNotMatch(render(), /(?:src|href)="(?:javascript|data):/);
  context.doc.locations[0].imageUrl = '../media/room.png';
  assert.match(render(), /src="\.\.\/media\/room\.png"/);
  context.doc.locations[0].panels = { front: '../media/front.png', back: '../media/back.png' };
  assert.match(render(), /src="\.\.\/media\/front\.png"/);
  assert.match(render(), /src="\.\.\/media\/back\.png"/);
  assert.doesNotMatch(render(), /src="\.\.\/media\/room\.png"/);
  context.doc.locations[0].panels.back = 'javascript:alert(1)';
  assert.doesNotMatch(render(), /(?:src|href)="javascript:/);

});
