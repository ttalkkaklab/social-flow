import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runInNewContext } from 'node:vm';
const require = createRequire(import.meta.url);
const { FONT_ASSETS } = require('../../skills/channel/references/review-fonts.js');
const { storyboardHtml } = require('../../skills/storyboard/references/storyboard-html.js');

test('HTML creation and refresh keep one design while preserving episode metadata', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sf-board-html-'));
  try {
    // No scenes, credentials, or network are required to create the review shell.
    assert.equal(storyboardHtml(dir).length, 17 + FONT_ASSETS.length);
    const file = join(dir, 'storyboard.html');
    const original = readFileSync(file, 'utf8');
    const title = '<title>Episode $& — 로컬 검토</title>';
    const metadata = '/* ✎ SB_DOC BEGIN */\nwindow.SB_DOC = { core: "$& keeps its text" };\n/* ✎ SB_DOC END */';
    const edited = original.replace(/^<title>[^]*?<\/title>/m, () => title)
      .replace(/\/\* ✎ SB_DOC BEGIN[^]*?\/\* ✎ SB_DOC END \*\//, () => metadata);
    writeFileSync(file, edited);
    assert.deepEqual(storyboardHtml(dir, true), []);
    writeFileSync(file, edited.replace('--bg: #fcfcfd', '--bg: #000000'));
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

test('review resolves existing channel portraits without changing dialogue or inventing missing images', () => {
  const root = mkdtempSync(join(tmpdir(), 'sf-board-portraits-'));
  try {
    const board = join(root, 'episodes', 'example', 'storyboard');
    const character = join(root, 'assets', 'characters', 'mina');
    mkdirSync(board, { recursive: true });
    mkdirSync(character, { recursive: true });
    writeFileSync(join(character, 'face.png'), 'fixture');
    const scenes = 'window.SB_DOC={characters:{mina:{name:"Mina"},missing:{name:"No image"}}}; window.SCENES=[];';
    writeFileSync(join(board, 'scenes.js'), scenes);
    storyboardHtml(board);
    const context = { window: {} };
    runInNewContext(readFileSync(join(board, 'review-files.js'), 'utf8'), context);
    assert.equal(context.window.REVIEW_CHARACTER_PORTRAITS.mina, '../../../assets/characters/mina/face.png');
    assert.equal(context.window.REVIEW_CHARACTER_PORTRAITS.missing, undefined);
    assert.equal(context.window.REVIEW_VIDEO_TYPES.drama.ko, '드라마');
    assert.equal(readFileSync(join(board, 'scenes.js'), 'utf8'), scenes);
    assert.deepEqual(storyboardHtml(board, true), []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('check is read-only and malformed existing metadata is preserved for repair', () => {
  const root = mkdtempSync(join(tmpdir(), 'sf-board-html-check-'));
  try {
    const dir = join(root, 'storyboard');
    assert.equal(storyboardHtml(dir, true).length, 17 + FONT_ASSETS.length);
    assert.equal(existsSync(dir), false);
    storyboardHtml(dir);
    const file = join(dir, 'storyboard.html');
    const broken = '<title>Keep this</title>\ncustom metadata without markers';
    writeFileSync(file, broken);
    assert.throws(() => storyboardHtml(dir), /SB_DOC/);
    assert.equal(readFileSync(file, 'utf8'), broken);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('dialogue portrait honors the episode cast image before channel images', () => {
  const template = readFileSync(new URL('../../skills/storyboard/references/storyboard-html-template.html', import.meta.url), 'utf8');
  const start = template.indexOf('  function speechHtml(');
  const end = template.indexOf('  /** One line of screen text', start);
  const context = {
    DOC: { speechPlanVersion: 1 },
    CAST: [{ id: 'mina', name: 'Mina', panels: { face: 'channel-face.png' } }],
    window: { PRODUCTION: { cast: { mina: { image: 'episode-mina.png' } } }, REVIEW_CHARACTER_PORTRAITS: { mina: 'resolved-face.png' } },
    T: { speechDelivery: { on_screen: 'On-screen dialogue' }, chars: n => `${n} chars` },
    castName: id => id, esc: value => String(value ?? ''), strip: value => String(value ?? ''), netLen: value => String(value ?? '').length,
  };
  const render = () => runInNewContext(template.slice(start, end) + '\nspeechHtml({speaker:"mina",delivery:"on_screen",tts:"Hello",sub:"Hello"},0)', context);
  assert.match(render(), /src="episode-mina.png"/);
  delete context.window.PRODUCTION.cast.mina.image;
  assert.match(render(), /src="channel-face.png"/);
  delete context.CAST[0].panels.face;
  assert.match(render(), /src="resolved-face.png"/);
});

test('review shows every production cut, timing and motion file without substituting the representative', () => {
  const template = readFileSync(new URL('../../skills/storyboard/references/storyboard-html-template.html', import.meta.url), 'utf8');
  const start = template.indexOf('  function productionCutsHtml(');
  const end = template.indexOf('  function camOf(', start);
  const context = {
    LANG: 'en',
    esc: value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;'),
    scene: { visual: { src: 'unrelated-representative.png' }, productionPlan: { cuts: [
      { kind: 'still', path: '../media/first.png', seconds: 2 },
      { kind: 'motion', path: '../media/second.mp4', seconds: 3, start: 1 },
      { kind: 'still', path: '../media/third.jpg', seconds: 4 },
      { kind: 'still', seconds: 1 },
    ] } },
  };
  const render = () => runInNewContext(template.slice(start, end) + '\nproductionCutsHtml(scene)', context);
  const html = render();
  assert.equal((html.match(/data-cut-index=/g) || []).length, 4);
  assert.match(html, /src="\.\.\/media\/first.png"/);
  assert.match(html, /<video src="\.\.\/media\/second.mp4" controls/);
  assert.match(html, /src="\.\.\/media\/third.jpg"/);
  assert.match(html, /Cut 2 · motion · 3s · Start 1s/);
  assert.match(html, /Missing path/);
  assert.match(html, /Display does not mean review approval/);
  assert.doesNotMatch(html, /unrelated-representative/);
  context.scene = { visual: { src: 'legacy.png' } };
  assert.equal(render(), '');
  context.scene = { productionPlan: { cuts: [{ path: 'javascript:alert(1)', seconds: -1 }] } };
  assert.doesNotMatch(render(), /(?:src|href)="javascript:/);
  assert.match(render(), /Duration unknown/);
});

test('motion review honors its source range and exposes missing or short media', () => {
  const template = readFileSync(new URL('../../skills/storyboard/references/storyboard-html-template.html', import.meta.url), 'utf8');
  const start = template.indexOf('  function productionCutsHtml(');
  const end = template.indexOf('  function camOf(', start);
  const html = runInNewContext(template.slice(start, end) + '\nproductionCutsHtml(scene)', {
    LANG: 'en', esc: value => String(value ?? ''),
    scene: { productionPlan: { cuts: [{ kind: 'motion', path: 'source.mp4', start: 7, seconds: 3 }] } },
  });
  const handlers = Object.fromEntries([...html.matchAll(/(onloadedmetadata|onplay|ontimeupdate|onerror)="([^"]+)"/g)]
    .map(([, name, code]) => [name, code.replaceAll('&lt;', '<')]));
  const player = { dataset: { start: '7', end: '10', error: 'missing media' }, duration: 20,
    currentTime: 0, nextElementSibling: { hidden: true }, pause() { this.paused = true; } };
  const fire = name => new Function(handlers[name]).call(player);
  fire('onloadedmetadata');
  assert.equal(player.currentTime, 7);
  player.currentTime = 10.2;
  fire('ontimeupdate');
  assert.equal(player.currentTime, 10);
  assert.equal(player.paused, true);
  fire('onplay');
  assert.equal(player.currentTime, 7);
  player.currentTime = 2;
  fire('ontimeupdate');
  assert.equal(player.currentTime, 7);
  player.duration = 8;
  fire('onloadedmetadata');
  assert.equal(player.nextElementSibling.hidden, false);
  player.nextElementSibling.hidden = true;
  fire('onerror');
  assert.equal(player.nextElementSibling.hidden, false);
  assert.equal(player.nextElementSibling.textContent, 'missing media');
  assert.match(html, /final edit effects are not included/);
});
