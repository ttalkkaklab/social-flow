import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
const require = createRequire(import.meta.url);
const { exportChannel } = require('../../skills/channel/references/review-library.js');
const { storyboardHtml } = require('../../skills/storyboard/references/storyboard-html.js');

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'sf-library-'));
  const dir = join(root, 'channel');
  const write = (file, value) => { const p = join(dir, file); mkdirSync(join(p, '..'), { recursive: true }); writeFileSync(p, value); };
  write('profile.md', '---\nname: Test channel\n---\n');
  write('assets/characters/hero/identity.md', '# Hero\n\n**역할**: Guide <script>alert(1)</script>\n**생김새**: Blue coat\n**목소리**: M1');
  for (const name of ['body.png', 'face.png', 'back.png', 'extra.png']) write('assets/characters/hero/' + name, 'fixture');
  write('episodes/one/storyboard/storyboard.md', '---\nstatus: draft\nseries: Series (1/2)\n---\n# Episode one');
  write('episodes/one/storyboard/scenes.js', 'window.SCENES = [];');
  storyboardHtml(join(dir, 'episodes/one/storyboard'));
  return { root, dir, write, clean: () => rmSync(root, { recursive: true, force: true }) };
}

test('exports offline characters, indexes and the SAME storyboard shell with relative dependencies', () => {
  const f = fixture();
  try {
    const source = join(f.dir, 'episodes/one/storyboard/storyboard.html');
    const before = readFileSync(source, 'utf8');
    const result = exportChannel(f.dir);
    assert.equal(result.characters, 1);
    assert.equal(result.episodes, 1);
    assert.deepEqual(result.warnings, []);
    const detail = readFileSync(join(f.dir, 'assets/characters/hero/index.html'), 'utf8');
    for (const name of ['body.png', 'back.png', 'face.png', 'extra.png']) assert.ok(detail.includes(`src="${name}"`));
    assert.ok(detail.includes('Guide &lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(detail.includes('Blue coat'));
    assert.ok(detail.includes('M1'));
    assert.ok(!detail.includes('fetch('));
    assert.ok(existsSync(join(f.dir, 'assets/review/WantedSansVariable.woff2')));
    assert.ok(readFileSync(join(f.dir, 'assets/characters/index.html'), 'utf8').includes('href="hero/index.html"'));
    const alias = readFileSync(join(f.dir, 'storyboards/one/index.html'), 'utf8');
    assert.ok(alias.includes('<base href="../../episodes/one/storyboard/">'));
    assert.equal(alias.replace(/\n<!-- social-flow:review-library:v1 -->\n<base href="[^"]+">/, ''), before);
    assert.equal(readFileSync(source, 'utf8'), before);
    assert.deepEqual(exportChannel(f.dir, { check: true }).changed, []);
    f.write('assets/characters/hero/identity.md', '# Renamed hero');
    assert.ok(exportChannel(f.dir, { check: true }).changed.length > 0);
    assert.equal(readFileSync(join(f.dir, 'assets/characters/hero/index.html'), 'utf8'), detail);
    exportChannel(f.dir);
    assert.ok(readFileSync(join(f.dir, 'assets/characters/index.html'), 'utf8').includes('Renamed hero'));
  } finally { f.clean(); }
});

test('preflight refuses unowned HTML and symlinked outputs before writing anything', () => {
  const f = fixture();
  try {
    f.write('assets/characters/hero/index.html', '<h1>My handwritten sheet</h1>');
    assert.throws(() => exportChannel(f.dir), /hand-authored/);
    assert.ok(!existsSync(join(f.dir, 'assets/review')));
    rmSync(join(f.dir, 'assets/characters/hero/index.html'));
    mkdirSync(join(f.root, 'outside'));
    symlinkSync(join(f.root, 'outside'), join(f.dir, 'storyboards'));
    assert.throws(() => exportChannel(f.dir), /symlink/);
    assert.ok(!existsSync(join(f.dir, 'assets/review')));
  } finally { f.clean(); }
});

test('missing HTML is reported and not linked; no-key export never needs credentials', () => {
  const f = fixture();
  try {
    rmSync(join(f.dir, 'episodes/one/storyboard/storyboard.html'));
    const result = exportChannel(f.dir);
    assert.equal(result.warnings.length, 1);
    assert.ok(!existsSync(join(f.dir, 'storyboards/one/index.html')));
    assert.ok(!readFileSync(join(f.dir, 'storyboards/index.html'), 'utf8').includes('href="one/index.html"'));
  } finally { f.clean(); }
});

test('review pass is separate from asset presence and becomes stale when an input changes', () => {
  const f = fixture();
  try {
    const folder = join(f.dir, 'assets/characters/hero');
    const inputHashes = Object.fromEntries(['identity.md', 'body.png', 'back.png', 'face.png'].map(name => [name, createHash('sha256').update(readFileSync(join(folder, name))).digest('hex')]));
    f.write('assets/characters/hero/review.json', JSON.stringify({ score: 95, iteration: 2, critical: 0, inputHashes }));
    exportChannel(f.dir);
    assert.ok(readFileSync(join(folder, 'index.html'), 'utf8').includes('Review passed'));
    assert.ok(readFileSync(join(folder, '../index.html'), 'utf8').includes('95/100'));
    f.write('assets/characters/hero/face.png', 'revised image');
    exportChannel(f.dir);
    const html = readFileSync(join(folder, 'index.html'), 'utf8');
    assert.ok(html.includes('independent review needed'));
    assert.ok(!html.includes('Review passed'));
    assert.ok(html.includes('Available'));
  } finally { f.clean(); }
});
test('review uses the recorded threshold while preserving the legacy threshold and critical gate', () => {
  const f = fixture();
  try {
    const folder = join(f.dir, 'assets/characters/hero');
    const inputHashes = Object.fromEntries(['identity.md', 'body.png', 'back.png', 'face.png'].map(name => [name, createHash('sha256').update(readFileSync(join(folder, name))).digest('hex')]));
    const render = extra => {
      f.write('assets/characters/hero/review.json', JSON.stringify({ score: 92, iteration: 1, critical: 0, inputHashes, ...extra }));
      exportChannel(f.dir);
      return readFileSync(join(folder, 'index.html'), 'utf8');
    };
    assert.ok(render({ threshold: 90 }).includes('Review passed'));
    assert.ok(render({ threshold: 90 }).includes('threshold 90'));
    assert.ok(render({}).includes('Revision required'));
    assert.ok(render({ threshold: 90, critical: 1 }).includes('Revision required'));
    assert.ok(render({ threshold: null }).includes('no independent review'));
  } finally { f.clean(); }
});
