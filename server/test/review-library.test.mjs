import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const require = createRequire(import.meta.url);
const { exportChannel } = require('../../skills/channel/references/review-library.js');
const example = readFileSync(new URL('../../skills/channel/references/character-identity-example.md', import.meta.url), 'utf8');
const identityBlock = example.match(/```json\s*\n([\s\S]*?)```/)[1];
const { storyboardHtml } = require('../../skills/storyboard/references/storyboard-html.js');

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'sf-library-'));
  const dir = join(root, 'channel');
  const write = (file, value) => { const p = join(dir, file); mkdirSync(join(p, '..'), { recursive: true }); writeFileSync(p, value); };
  write('profile.md', '---\nname: Test channel\n---\n');
  write('assets/characters/hero/identity.md', '# Hero\n\n**역할**: Guide <script>alert(1)</script>\n**생김새**: Blue coat\n**목소리**: M1\n\n```json\n{"tts":{"engine":"gemini","voiceId":"Kore","language":"ko","speed":1}}\n```');
  const doc = JSON.parse(identityBlock);
  doc.character.identity.role.value = 'Guide <script>alert(1)</script>';
  doc.character.physical.appearance.value = 'Blue coat';
  write('assets/characters/hero/identity.md', '# Hero\n\n```json\n' + JSON.stringify(doc) + '\n```');
  for (const name of ['body.png', 'face.png', 'back.png', 'extra.png']) write('assets/characters/hero/' + name, name);
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
    assert.deepEqual(result.structuralWarnings, []);
    assert.ok(result.contentWarnings.some(w => w.domain === 'image-framing'));
    const detail = readFileSync(join(f.dir, 'assets/characters/hero/index.html'), 'utf8');
    for (const name of ['body.png', 'back.png', 'face.png', 'extra.png']) assert.ok(detail.includes(`src="${name}"`));
    assert.ok(detail.includes('Guide &lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(detail.includes('M1'));
    assert.ok(!detail.includes('fetch('));
    assert.ok(detail.includes('캐릭터 시트 목록'));
    assert.ok(detail.includes('class="character-stage" data-kind="face"'));
    assert.equal((detail.match(/class="character-thumb"/g) || []).length, 3);
    assert.equal(result.visualReview, 'not_reviewed');
    assert.ok(existsSync(join(f.dir, 'assets/review/fonts/InterVariable.woff2')));
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
