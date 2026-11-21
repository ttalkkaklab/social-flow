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

test('localized copy is escaped while media attributes and source stay unchanged', () => {
  const template = readFileSync(new URL('../../skills/storyboard/references/storyboard-html-template.html', import.meta.url), 'utf8');
  const source = template.slice(template.indexOf('  function esc(s)'), template.indexOf('  function strip(s)'));
  const CONTENT = require('../../skills/storyboard/references/review-localization.js').reader({ version: 1, sourceLanguage: 'vi', languages: ['vi', 'ja'], entries: [
    { source: 'Xin chào', translations: { ja: '<img src=x onerror=alert(1)>' } },
    { source: '../speech.wav', translations: { ja: 'wrong-path' } },
  ] }, 'ja');
  const result = runInNewContext(source + '\n[copy("Xin chào"), esc("../speech.wav")]', { CONTENT });
  assert.equal(result[0], '&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(result[1], '../speech.wav');
});

test('review language survives source typography and prepares the selected font', async () => {
  const template = readFileSync(new URL('../../skills/storyboard/references/storyboard-html-template.html', import.meta.url), 'utf8');
  const start = template.indexOf('  window.ReviewTypography.apply(DOC, SCENES);');
  const source = template.slice(start, template.indexOf('  if (fontFailures.length)', start));
  const node = { lang: '', setAttribute(key, value) { this[key] = value; } };
  runInNewContext(source, {
    DOC: { contentLanguage: 'vi' }, SCENES: [], CONTENT: { language: 'ja' },
    app: { querySelectorAll: () => [node] },
    window: { ReviewTypography: { apply: () => { node.lang = 'vi'; } } },
  });
  assert.equal(node.lang, 'ja');
  const loaded = [];
  const context = { document: { documentElement: { lang: 'en' }, fonts: { load: async font => { loaded.push(font); return [{}]; } } } };
  context.window = context;
  runInNewContext(readFileSync(new URL('../../skills/channel/references/review-assets/review-typography.js', import.meta.url), 'utf8'), context);
  await context.ReviewTypography.prepare({ contentLanguage: 'vi' }, [], ['ja', 'zh-Hans']);
  assert.ok(loaded.some(font => font.includes('Noto Sans JP')));
  assert.ok(loaded.some(font => font.includes('Noto Sans SC')));
});

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
  for (const path of ['javascript:evil.mp4', ' https://example.test/x.mp4', '\njavascript:alert(1)//.svg',
    'h\nttps://example.test/x.mp4', '\\\\example.test\\x.mp4', '/\\example.test/x.svg']) {
    assert.doesNotMatch(render({ visual: { video: { clip: path } } }), /<(?:video|a|img)\b/);
    assert.doesNotMatch(render({ productionPlan: { cuts: [{ path, start: 0, seconds: 1 }] } }), /<(?:video|a|img)\b/);
  }
});

test('music lanes show one anchored span across scenes and label the score-free opening', () => {
  const template = readFileSync(new URL('../../skills/storyboard/references/storyboard-html-template.html', import.meta.url), 'utf8');
  const start = template.indexOf('  var cueAt = []');
  const source = template.slice(start, template.indexOf('  var seqNo =', start));
  const SCENES = [1, 2, 3].map(i => ({ id: 's000' + i }));
  const context = { SCENES, MUSIC: { $timeline: [{ cue: 'piano', start: { shotId: 's0002', atSeconds: 0.8 }, end: { shotId: 's0003', atSeconds: 'end' } }] },
    LANG: 'en', esc: value => String(value), T: {}, window: { STORY: { authoring: 'story-first' } } };
  assert.match(runInNewContext(source + '\nmusicLane([{i:0,s:SCENES[0]}])', context), /No score/);
  // A scene header passes its scene: silence nobody decided reads undecided, a decision shows its reason.
  assert.match(runInNewContext(source + '\nmusicLane([{i:0,s:SCENES[0]}], {no:1})', context), /Music undecided/);
  assert.match(runInNewContext(source + '\nmusicLane([{i:0,s:SCENES[0]}], {no:1,music:{decision:"none",reason:"only the line"}})', context), /No score — only the line/);
  assert.match(runInNewContext(source + '\nmusicLane([{i:1,s:SCENES[1]}], {no:2,music:{decision:"score",reason:"regret"}})', context), /piano \(s0002 \+0.8s → s0003 end\) — regret/);
  for (const index of [1, 2]) assert.match(runInNewContext(source + `\nmusicLane([{i:${index},s:SCENES[${index}]}])`, context), /piano \(s0002 \+0.8s → s0003 end\)/);
  context.MUSIC.$timeline[0].start.atSeconds = 'end';
  assert.match(runInNewContext(source + '\nmusicLane([{i:1,s:SCENES[1]}])', context), /No score/);
});

test('the scene links its audience cue to the starting shot and distinguishes a silent choice from pending timing', () => {
  const template = readFileSync(new URL('../../skills/storyboard/references/storyboard-html-template.html', import.meta.url), 'utf8');
  const source = template.slice(template.indexOf('  var audienceRows ='), template.indexOf('  /* Music lane'));
  const words = [...template.matchAll(/^      audienceSound: (\{[^]*?\}),$/gm)].map(m => runInNewContext('(' + m[1] + ')'));
  const esc = text => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const effect = { id: 'doubt', sfx: 'bowed-glass', trigger: 'her hand stills', atSeconds: 0.3,
    end: { shotId: 's0002', atSeconds: 'end' }, audience: { intent: 'doubt' } };
  const SCENES = [{ id: 's0001', scene: 1, sound: { effects: [effect] } }, { id: 's0002', scene: 2 }];
  const window = { SCENES, AUDIENCE_SPOTTING: require('../../skills/storyboard/references/audience-spotting.js'),
    STRUCTURE: { scenes: [{ no: 1 }, { no: 2, audienceSound: { decision: 'use', reason: '<hold her gaze>' } },
      { no: 3, audienceSound: { decision: 'none', reason: 'Keep her breath.' } }, { no: 4 }] } };
  const page = (i, labels) => runInNewContext(source + '\naudienceLane(audiencePlan.scenes[' + i + '])', {
    SCENES, window, T: { audienceSound: labels, shotCap: n => 'Shot ' + n }, esc, copy: esc,
  });
  assert.equal(page(3, words[0]), '');
  window.STORY = { audienceSoundVersion: 1 };
  assert.match(page(3, words[1]), /관객용 심리음<\/strong> · 미정/);
  assert.match(page(1, words[0]), /use cue — &lt;hold her gaze&gt; · <a href="#shot-1">Shot 1 · doubt · timing unverified<\/a>/);
  assert.match(page(2, words[0]), /no cue — Keep her breath/);
});

test('the cliché strip and scene lanes show what is in the story, the user\'s pick and a recommendation', () => {
  const template = readFileSync(new URL('../../skills/storyboard/references/storyboard-html-template.html', import.meta.url), 'utf8');
  const start = template.indexOf('  var CLICHES = window.CLICHES');
  const source = template.slice(start, template.indexOf('  // Character count', start));
  // The page's own strings, English first and Korean second in the template.
  const strings = [...template.matchAll(/^      cliche: \{[^]*?^      \},$/gm)].map(m => runInNewContext('({' + m[0].slice(0, -1) + '})').cliche);
  assert.equal(strings.length, 2);
  const esc = v => String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  const page = (CLICHES, expression, T = strings[0], STRUCTURE) => runInNewContext(source + '\n' + expression, {
    window: { CLICHES, STRUCTURE }, T: { cliche: T }, esc, copy: esc, CONTENT: { text: s => s }, castName: id => id === 'jun' ? 'Jun' : id });
  const record = { version: 1, uses: [
    { id: 45, name: 'Cash envelope', layer: 'scene', need: 'obstacle', scenes: [3], shift: 'the mother is handed it', basis: 'default' },
    { name: '<img src=x onerror=alert(1)>', need: 'status', character: 'jun', basis: 'user' },
    { id: 9, name: 'Contract romance', need: 'bind', scenes: [3, 4], offered: true, caution: 'coercion', quote: true },
    null, 'x', { shift: 'no id and no name' }] };
  const lane = page(record, 'clicheLane(3)');
  assert.match(lane, /<b>#45 Cash envelope<\/b> <small>obstacle · by default<\/small> <span class="cliche-shift">changed — the mother is handed it<\/span>/);
  assert.match(lane, /class="cliche-chip offered caution"><b>#9 Contract romance<\/b> <small>kept together · recommended · not applied · caution · a quoted line<\/small>/);
  assert.equal(page(record, 'clicheLane(2)'), '');
  const strip = page(record, 'clicheStrip()');
  assert.match(strip, /Clichés <small>2 in the story · 1 recommended, waiting for your pick<\/small>/);
  assert.match(strip, /<b>&lt;img src=x onerror=alert\(1\)&gt;<\/b> <small>status · your pick<\/small><\/span><span>Jun<\/span>/);
  assert.match(strip, /<span>S#3, S#4<\/span>/);
  // A scene the board no longer has is marked, and a use with no recorded basis is not given one.
  const edited = page({ uses: [{ id: 5, name: 'Hand edit', scenes: [9, 3, 3, null, 'x', 1e21] }] }, 'clicheStrip()', strings[0], { scenes: [{ no: 3 }] });
  assert.match(edited, /<small>basis not recorded<\/small>/);
  assert.match(edited, /<span>S#3, S#9 <em class="cliche-missing">not on the board<\/em><\/span>/);
  assert.doesNotMatch(strip, /<img/);
  assert.equal((strip.match(/<li>/g) || []).length, 3, 'entries the page cannot read are skipped');
  // An open record, a declined one, and a board with no record at all.
  assert.match(page({ version: 1, uses: [] }, 'clicheStrip()'), /undecided — nothing is recorded yet/);
  assert.match(page({ version: 1, none: 'one quiet exchange', uses: [] }, 'clicheStatus()'), /^none used — one quiet exchange$/);
  assert.equal(page(undefined, 'clicheStrip()'), '');
  assert.equal(page('yes', 'clicheStrip()'), '');
  assert.match(page(record, 'clicheLane(4)', strings[1]), /한곳에 묶기 · 추천 · 적용 전 · 주의 · 실제 대사/);
  assert.match(page({ uses: [] }, 'clicheStatus()', strings[1]), /^미정/);
});

test('HTML creation and refresh keep one design while preserving episode metadata', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sf-board-html-'));
  try {
    // No scenes, credentials, or network are required to create the review shell.
    assert.equal(storyboardHtml(dir).length, 24 + FONT_ASSETS.length);
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
    assert.equal(storyboardHtml(dir, true).length, 24 + FONT_ASSETS.length);
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
