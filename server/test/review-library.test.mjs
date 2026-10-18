import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const { exportChannel } = require('../../skills/channel/references/review-library.js');
const example = readFileSync(new URL('../../skills/channel/references/character-identity-example.md', import.meta.url), 'utf8');
const identityBlock = example.match(/```json\s*\n([\s\S]*?)```/)[1];
const { storyboardHtml } = require('../../skills/storyboard/references/storyboard-html.js');

test('character catalogue uses reference artwork without claiming panel readiness and exposes separate voice controls', () => {
  const f = fixture();
  try {
    for (const name of ['body.png', 'face.png', 'back.png']) rmSync(join(f.dir, 'assets/characters/hero', name));
    f.write('assets/characters/hero/reference-v2.png', 'older');
    f.write('assets/characters/hero/reference-v10.png', 'latest');
    exportChannel(f.dir);
    const index = join(f.dir, 'assets/characters/index.html');
    let html = readFileSync(index, 'utf8');
    assert.ok(html.includes('src="hero/reference-v10.png"'));
    assert.ok(html.includes('Reference image'));
    assert.ok(!html.includes('review-ok'));
    assert.match(html, /class="review-play"[^>]* disabled/);
    assert.ok(!html.includes('<audio'));
    f.write('assets/characters/hero/voice.wav', 'sample');
    exportChannel(f.dir);
    html = readFileSync(index, 'utf8');
    assert.match(html, /<audio[^>]+src="hero\/voice.wav"/);
    assert.ok(html.includes('data-audio-toggle="voice-hero"'));
    assert.ok(!/<a\b[^>]*>(?:(?!<\/a>)[\s\S])*<button/.test(html), 'play button must not navigate');
    rmSync(join(f.dir, 'assets/characters/hero/voice.wav'));
    symlinkSync(join(f.root, 'outside.wav'), join(f.dir, 'assets/characters/hero/voice.wav'));
    writeFileSync(join(f.root, 'outside.wav'), 'outside');
    exportChannel(f.dir);
    html = readFileSync(index, 'utf8');
    assert.ok(!html.includes('<audio'), 'out-of-channel audio must not be exposed');
    f.write('assets/characters/hero/body.png', 'canonical');
    exportChannel(f.dir);
    html = readFileSync(index, 'utf8');
    assert.ok(html.includes('src="hero/body.png"'));
    assert.ok(!html.includes('Reference image'));
    f.write('assets/characters/hero/face.png', 'portrait');
    exportChannel(f.dir);
    html = readFileSync(index, 'utf8');
    assert.ok(html.includes('src="hero/face.png"'));
    assert.ok(html.includes('review-character-portrait'));
    assert.ok(!html.includes('src="hero/body.png"'));
    rmSync(join(f.dir, 'assets/characters/hero/face.png'));
    writeFileSync(join(f.root, 'outside.png'), 'outside');
    symlinkSync(join(f.root, 'outside.png'), join(f.dir, 'assets/characters/hero/face.png'));
    exportChannel(f.dir);
    html = readFileSync(index, 'utf8');
    assert.ok(!html.includes('src="hero/face.png"'));
    assert.ok(!html.includes('review-character-portrait'));
    assert.ok(html.includes('src="hero/body.png"'));
  } finally { f.clean(); }
});

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
    assert.deepEqual(result.structuralWarnings, []);
    assert.ok(result.contentWarnings.some(w => w.domain === 'image-framing'));
    const detail = readFileSync(join(f.dir, 'assets/characters/hero/index.html'), 'utf8');
    for (const name of ['body.png', 'back.png', 'face.png', 'extra.png']) assert.ok(detail.includes(`src="${name}"`));
    assert.ok(detail.includes('Guide &lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(detail.includes('Blue coat'));
    assert.ok(detail.includes('M1'));
    assert.ok(!detail.includes('fetch('));
    assert.ok(detail.includes('캐릭터 시트 목록'));
    assert.ok(detail.includes('Template match does not certify image readiness'));
    assert.ok(detail.includes('review-panel-face'));
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

test('missing HTML is reported and not linked; no-key export never needs credentials', () => {
  const f = fixture();
  try {
    rmSync(join(f.dir, 'episodes/one/storyboard/storyboard.html'));
    const result = exportChannel(f.dir);
    assert.equal(result.structuralWarnings.length, 1);
    assert.ok(!existsSync(join(f.dir, 'storyboards/one/index.html')));
    assert.ok(!readFileSync(join(f.dir, 'storyboards/index.html'), 'utf8').includes('href="one/index.html"'));
  } finally { f.clean(); }
});

test('design CLI separates legacy content readiness from shell drift; content readiness remains advisory on both entry points', () => {
  const f = fixture();
  const board = join(f.dir, 'episodes/one/storyboard');
  const designCli = require.resolve('../../skills/storyboard/references/storyboard-html.js');
  const libraryCli = require.resolve('../../skills/channel/references/review-library.js');
  const run = (cli, target) => spawnSync(process.execPath, [cli, target, '--check'], { encoding: 'utf8' });
  try {
    f.write('assets/characters/hero/identity.md', '# Legacy hero\n\n**역할**: Guide\n');
    const exported = exportChannel(f.dir);
    assert.ok(exported.contentWarnings.some(w => w.domain === 'voice' && w.characterId === 'hero'));
    assert.ok(exported.contentWarnings.some(w => w.domain === 'identity' && w.characterId === 'hero'));
    assert.deepEqual(exported.structuralWarnings, []);
    assert.deepEqual(exported.warnings, exported.contentWarnings.map(w => w.message));
    const clean = run(designCli, board);
    assert.equal(clean.status, 0, clean.stdout + clean.stderr);
    assert.match(clean.stderr, /Content readiness \[identity\]/);
    const strict = run(libraryCli, f.dir);
    assert.equal(strict.status, 0);
    const report = JSON.parse(strict.stdout);
    assert.deepEqual(report.changed, []);
    assert.ok(report.warnings.length > 0);
    assert.equal(readFileSync(join(f.dir, 'assets/characters/hero/identity.md'), 'utf8'), '# Legacy hero\n\n**역할**: Guide\n');

    f.write('episodes/one/storyboard/render-routing.js', 'stale helper');
    assert.equal(run(designCli, board).status, 1);
    storyboardHtml(board); exportChannel(f.dir);
    // A structurally missing neighboring board must still fail even after indexes are refreshed.
    f.write('episodes/two/storyboard/storyboard.md', '---\nstatus: draft\n---\n# Missing HTML');
    exportChannel(f.dir);
    const missing = run(designCli, board);
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /Library structure: two: missing\/unsupported storyboard.html/);
    assert.deepEqual(exportChannel(f.dir, { check: true }).changed, []);
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
    const passed = render({ threshold: 90 });
    assert.ok(passed.includes('Review passed') && passed.includes('threshold 90'));
    assert.ok(render({}).includes('Revision required'));
    assert.ok(render({ threshold: 90, critical: 1 }).includes('Revision required'));
    assert.ok(render({ threshold: null }).includes('no independent review'));
  } finally { f.clean(); }
});

test('missing character voice is visible and makes the delivery check fail even after export', () => {
  const f = fixture();
  try {
    f.write('assets/characters/hero/identity.md', '# Hero\n**목소리**: use channel profile');
    const result = exportChannel(f.dir);
    assert.ok(result.warnings.some(w => /hero.*tts/.test(w)));
    const html = readFileSync(join(f.dir, 'assets/characters/hero/index.html'), 'utf8');
    assert.ok(html.includes('Character settings incomplete'));
    assert.ok(!html.includes('Voice settings follow'));
    assert.ok(exportChannel(f.dir, { check: true }).warnings.length);
  } finally { f.clean(); }
});


test('a review passes on its recorded input hashes; a changed image, voice sample or transcript, or a removed sample, makes it stale', () => {
  const f = fixture();
  try {
    const folder = join(f.dir, 'assets/characters/hero');
    for (const name of ['voice.wav', 'sample.txt', 'voice-accuracy.json']) f.write('assets/characters/hero/' + name, 'reviewed fixture');
    const names = ['identity.md', 'body.png', 'back.png', 'face.png', 'voice.wav', 'sample.txt', 'voice-accuracy.json'];
    const inputHashes = Object.fromEntries(names.map(name => [name, createHash('sha256').update(readFileSync(join(folder, name))).digest('hex')]));
    f.write('assets/characters/hero/review.json', JSON.stringify({ score: 95, iteration: 1, critical: 0, inputHashes }));
    const html = () => { exportChannel(f.dir); return readFileSync(join(folder, 'index.html'), 'utf8'); };
    assert.ok(html().includes('Review passed'));
    assert.ok(readFileSync(join(folder, '../index.html'), 'utf8').includes('95/100'));
    for (const name of ['face.png', 'voice.wav', 'sample.txt', 'voice-accuracy.json']) {
      const reviewed = readFileSync(join(folder, name));
      f.write('assets/characters/hero/' + name, 'different speaker or text');
      const stale = html();
      assert.ok(stale.includes('independent review needed') && !stale.includes('Review passed') && stale.includes('Available'), name);
      f.write('assets/characters/hero/' + name, reviewed);
    }
    rmSync(join(folder, 'voice.wav'));
    assert.ok(html().includes('independent review needed'));
  } finally { f.clean(); }
});

test('structured updates render every field, escape values and make prior reviews stale', () => {
  const f=fixture();
  try {
    const folder=join(f.dir,'assets/characters/hero');
    const d=JSON.parse(identityBlock);
    const writeDoc=()=>f.write('assets/characters/hero/identity.md','# Hero\n```json\n'+JSON.stringify(d)+'\n```');
    writeDoc();
    const names=['identity.md','body.png','back.png','face.png'];
    const inputHashes=Object.fromEntries(names.map(n=>[n,createHash('sha256').update(readFileSync(join(folder,n))).digest('hex')]));
    f.write('assets/characters/hero/review.json',JSON.stringify({score:96,iteration:1,critical:0,inputHashes}));
    exportChannel(f.dir);assert.ok(readFileSync(join(folder,'index.html'),'utf8').includes('Review passed'));
    d.character.version++;d.character.speech.habits.value='Changed <script>bad()</script>';writeDoc();exportChannel(f.dir);
    let html=readFileSync(join(folder,'index.html'),'utf8');
    assert.ok(html.includes('Changed &lt;script&gt;bad()&lt;/script&gt;'));
    assert.ok(html.includes('independent review needed'));
    for(const [,ko] of require('../../skills/_shared/character-identity.js').GROUPS)assert.ok(html.includes(ko));
    d.character.physical.weightKg={status:'pending',value:null,reason:'Waiting on author'};writeDoc();
    assert.ok(exportChannel(f.dir).warnings.some(x=>x.includes('weightKg')));
    html=readFileSync(join(folder,'index.html'),'utf8');
    assert.match(html, /data-en="Pending"[^>]*>.*?<\/span><\/span><span class="character-field-reason">Waiting on author<\/span>/);
    assert.ok(!html.includes('Review passed'));
  }finally{f.clean();}
});

test('character detail keeps structured facts and lists, local transcript and reachable fallback sections', () => {
  const f = fixture();
  try {
    f.write('assets/characters/hero/sample.txt', 'Sample <script>bad()</script>');
    exportChannel(f.dir);
    const file = join(f.dir, 'assets/characters/hero/index.html');
    let html = readFileSync(file, 'utf8');
    const groups = require('../../skills/_shared/character-identity.js').GROUPS;
    for (const [group, , , fields] of groups) {
      for (const [key] of fields) assert.ok(html.includes(`data-character-field="${group}.${key}"`));
    }
    assert.match(html, /<dd><ul><li>/);
    assert.ok(html.includes('Sample &lt;script&gt;bad()&lt;/script&gt;'));
    assert.ok(!html.includes('<script>bad()'));
    assert.equal((html.match(/class="character-group" open/g) || []).length, groups.length);
    assert.equal((html.match(/class="character-icon"/g) || []).length, groups.length + 4);
    f.write('assets/characters/hero/identity.md', '# Legacy hero\n**역할**: Guide');
    rmSync(join(f.dir, 'assets/characters/hero/sample.txt'));
    exportChannel(f.dir);
    html = readFileSync(file, 'utf8');
    for (const id of ['appearance', 'identity', 'voice']) assert.ok(html.includes(`id="${id}"`));
    assert.ok(html.includes('Sample transcript not supplied'));
    assert.ok(html.includes('Voice sample not supplied'));
    assert.ok(html.includes('Full character identity'));
  } finally { f.clean(); }
});

test('prop and background catalogues preserve episode scope, local media and navigation', () => {
  const f = fixture();
  try {
    const doc = { props: [{ id: 'cup', name: 'Cup <script>', description: 'Ceramic', imageUrl: 'cup.png' }], locations: [{ id: 'room', name: 'Room', layout: 'Door on left', invariants: ['Window'], imageUrl: '../../../../outside.png' }] };
    f.write('episodes/one/storyboard/scenes.js', 'window.SCENES = []; window.SB_DOC = ' + JSON.stringify(doc));
    f.write('episodes/one/storyboard/cup.png', 'fixture');
    writeFileSync(join(f.root, 'outside.png'), 'outside');
    f.write('episodes/two/storyboard/storyboard.md', '# Episode two');
    f.write('episodes/two/storyboard/scenes.js', 'window.SCENES = []; window.SB_DOC = ' + JSON.stringify(doc));
    storyboardHtml(join(f.dir, 'episodes/one/storyboard'));
    storyboardHtml(join(f.dir, 'episodes/two/storyboard'));
    exportChannel(f.dir);
    for (const kind of ['props', 'locations']) {
      const html = readFileSync(join(f.dir, 'assets', kind, 'index.html'), 'utf8');
      assert.equal((html.match(/class="review-card" data-card/g) || []).length, 2);
      assert.ok(html.includes('aria-current="page"'));
      assert.ok(html.includes('../../episodes/one/storyboard/storyboard.html#'));
      assert.ok(html.includes('../../episodes/two/storyboard/storyboard.html#'));
      assert.ok(!html.includes('src="../../../../outside.png"'));
      assert.ok(html.includes('../characters/index.html'));
    }
    const props = readFileSync(join(f.dir, 'assets/props/index.html'), 'utf8');
    assert.ok(props.includes('Cup &lt;script&gt;'));
    assert.ok(props.includes('src="../../episodes/one/storyboard/cup.png"'));
    const backgrounds = readFileSync(join(f.dir, 'assets/locations/index.html'), 'utf8');
    assert.ok(backgrounds.includes('Door on left'));
    assert.ok(backgrounds.includes('Reference image pending'));
    const layout = readFileSync(join(f.dir, 'episodes/one/storyboard/review-layout.js'), 'utf8');
    for (const kind of ['props', 'locations']) assert.ok(layout.includes(`../../../assets/${kind}/index.html`));
    assert.deepEqual(exportChannel(f.dir, { check: true }).changed, []);
    for (const episode of ['one', 'two']) f.write(`episodes/${episode}/storyboard/scenes.js`, 'window.SCENES = [];');
    exportChannel(f.dir);
    assert.ok(readFileSync(join(f.dir, 'assets/props/index.html'), 'utf8').includes('No sheets yet.'));
  } finally { f.clean(); }
});
