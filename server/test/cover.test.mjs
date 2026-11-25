/**
 * cover.test.mjs — episode_cover: what set refuses, what read reports, and one real render.
 * The render cases need Chrome and skip without it; everything else runs on ffmpeg alone.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { setCover, renderCover, readCover, chromePath, encodeJpeg, injectConfig, cutPreviews } = await import('../dist/cover.js');

function episode(t, { storyFirst = true, format = 'shorts-9x16', size = '1080x1920', shots, inChannel = false } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'sf-cover-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const channel = join(root, 'test-channel');
  const dir = inChannel ? join(channel, 'episodes', 'ep01-test') : root;
  const sb = join(dir, 'storyboard');
  mkdirSync(join(sb, 'images'), { recursive: true });
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', `color=c=0x2a4a6a:s=${size}`, '-frames:v', '1', join(sb, 'images', 's0001.png')]);
  const scenes = shots ?? [
    { id: 's0001', visual: { frames: { start: 'images/s0001.png' } } },
    { id: 's0002', visual: {} },
    { id: 's0003', visual: { frames: { start: 'images/s0001.png', mode: 'reference' } } },
  ];
  writeFileSync(join(sb, 'scenes.js'), [
    `window.FORMAT = ${JSON.stringify(format)};`,
    `window.STORY = ${JSON.stringify(storyFirst ? { version: 'story-v2', authoring: 'story-first', language: 'ko' } : { language: 'ko' })};`,
    `window.SCENES = ${JSON.stringify(scenes)};`,
  ].join('\n'));
  return { dir, sb, channel };
}
const decision = (over = {}) => ({ reason: 'the decision in scene 3', source: { kind: 'shot', shotId: 's0001' }, copy: null, variants: [], ...over });

test('set refuses sources it cannot trust', t => {
  const { dir, sb } = episode(t);
  assert.throws(() => setCover(sb, decision({ source: { kind: 'shot', shotId: 's0099' } })), /cover_shot_unknown/);
  assert.throws(() => setCover(sb, decision({ source: { kind: 'shot', shotId: 's0002' } })), /cover_shot_no_image/);
  assert.throws(() => setCover(sb, decision({ source: { kind: 'image', requestId: 'nope' } })), /cover_image_receipt_missing/);
  const outside = join(dir, '..', `outside-${Date.now()}.mp4`);
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=64x64:d=1', outside]);
  t.after(() => rmSync(outside, { force: true }));
  assert.throws(() => setCover(sb, decision({ source: { kind: 'frame', video: outside, seconds: 0.2 } })), /cover_source_outside/);
  assert.throws(() => setCover(sb, decision({ source: { kind: 'frame', video: '../' + outside.split('/').pop(), seconds: 0.2 } })), /cover_source_outside/);
  assert.throws(() => setCover(sb, decision({ copy: { text: 'ภาษาไทย' }, language: 'th' })), /cover_font_missing/);
  assert.throws(() => setCover(sb, decision({ copy: { text: '찢을까', emphasis: '말까' } })), /cover_emphasis_missing/);
  assert.throws(() => setCover(sb, decision({ variants: [{ copy: null }] })), /cover_variants_longform_only/);
});

test('set reports, never refuses, long copy, small sources and MSR start images', t => {
  const { sb } = episode(t, { size: '540x960' });
  const r = setCover(sb, decision({ source: { kind: 'shot', shotId: 's0003' }, copy: { text: '하나 둘 셋 넷' } }));
  assert.deepEqual(r.warnings.map(w => w.code).sort(), ['cover_copy_long', 'cover_source_reference_frame', 'cover_source_small']);
  assert.equal(r.decision.language, 'ko');
  assert.equal(readCover(sb).status, 'unrendered');
});

test('a frame source must lie inside its video', t => {
  const { dir, sb } = episode(t);
  mkdirSync(join(dir, 'output', 'video'), { recursive: true });
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=s=1080x1920:d=1:r=10', '-pix_fmt', 'yuv420p', join(dir, 'output', 'video', 'video.mp4')]);
  assert.throws(() => setCover(sb, decision({ source: { kind: 'frame', video: 'output/video/video.mp4', seconds: 5 } })), /cover_frame_outside/);
  assert.throws(() => setCover(sb, decision({ source: { kind: 'frame', video: 'output/video/video.mp4', seconds: 0.999 } })), /cover_frame_outside/);
  const r = setCover(sb, decision({ source: { kind: 'frame', video: 'output/video/video.mp4', seconds: 0.5, shotId: 's0001' } }));
  assert.equal(r.decision.source.path, 'output/video/video.mp4');
});

test('a shot cover reaches the library and reports a changed source', { skip: !chromePath() && 'no Chrome' }, async t => {
  const { dir, sb, channel } = episode(t, { inChannel: true });
  writeFileSync(join(sb, 'storyboard.html'), '<html><head></head><body></body></html>');
  writeFileSync(join(sb, 'storyboard.md'), '# EP1 · Example');
  const scenes = join(sb, 'scenes.js');
  writeFileSync(scenes, readFileSync(scenes, 'utf8') + '\nwindow.STORY.titlePlan = ' + JSON.stringify({
    episodeNumber: 1, type: 'choice', headline: 'Should I ask?', thumbnailCue: 'Show the letter before opening',
  }) + ';');
  setCover(sb, decision({ copy: { text: '찢을까 말까', emphasis: '찢을까' }, focus: { x: 0.5, y: 0.4 } }));
  const { render, libraryWarning } = await renderCover(sb);
  assert.equal(libraryWarning, undefined);
  const index = readFileSync(join(channel, 'storyboards', 'index.html'), 'utf8');
  assert.ok(index.includes('EP01 · Should I ask?'));
  assert.match(index, /src="\.\.\/episodes\/ep01-test\/output\/cover\/cover-9x16\.jpg"/);
  const main = render.files.find(f => f.role === 'main');
  assert.deepEqual([main.name, main.width, main.height], ['cover-9x16.jpg', 1080, 1920]);
  assert.ok(main.bytes <= 8 * 1024 * 1024);
  assert.deepEqual(render.copied, ['output/video/cover.jpg']);
  assert.ok(existsSync(join(dir, 'output', 'video', 'cover.jpg')));
  assert.equal(render.measurements['9x16'].font, 'paperlogy');
  const fresh = readCover(sb);
  assert.equal(fresh.status, 'fresh');
  assert.equal(fresh.publish.instagram, join(dir, 'output', 'cover', 'cover-9x16.jpg'));
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=white:s=1080x1920', '-frames:v', '1', join(sb, 'images', 's0001.png')]);
  const stale = readCover(sb);
  assert.equal(stale.status, 'stale');
  assert.deepEqual(stale.changed, ['source']);
  assert.equal(stale.publish.stale, true);
  await assert.rejects(renderCover(sb), /cover_source_changed/);

});

test('a cover carries the board brief and requires a new decision after an editorial change', async t => {
  const { sb } = episode(t);
  const file = join(sb, 'scenes.js');
  const original = readFileSync(file, 'utf8');
  const brief = { episodeNumber: 101, type: 'reason', headline: 'Why this chair?', thumbnailCue: 'Show the empty seat' };
  const writePlan = extra => writeFileSync(file, original + '\nwindow.STORY.titlePlan = ' + JSON.stringify({ ...brief, ...extra }) + ';');
  writePlan({});
  assert.equal(readCover(sb).plan.title, 'EP101 · Why this chair?');
  assert.equal(readCover(sb).plan.type, 'reason');
  assert.equal(readCover(sb).plan.thumbnailCue, brief.thumbnailCue);
  const result = setCover(sb, decision({ copy: { text: 'chair' } }));
  assert.deepEqual(result.decision.titleBrief, brief);
  assert.ok(result.warnings.some(w => w.code === 'cover_copy_repeats_title'));
  writePlan({ searchTerm: 'chair' });
  assert.equal(readCover(sb).status, 'unrendered');
  for (const edit of [{ type: 'choice' }, { headline: 'Another chair?' }, { thumbnailCue: 'Show the listener' }]) {
    writePlan(edit);
    assert.equal(readCover(sb).publish.stale, true);
    await assert.rejects(renderCover(sb), /cover_title_changed/);
  }
  setCover(sb, decision());
  assert.equal(readCover(sb).status, 'unrendered');
});

test('the configuration stays a literal whatever the copy holds', () => {
  const page = injectConfig('<script>const CONFIG = /*COVER_CONFIG*/null;</script>', { text: "$& $' $` </script> \u2028" });
  assert.equal(page.includes('/*COVER_CONFIG*/'), false);
  assert.equal(page.match(/<\/script>/g).length, 1);
  const literal = page.slice(page.indexOf('= ') + 2, page.lastIndexOf(';</script>'));
  assert.equal(JSON.parse(literal).text, "$& $' $` </script> \u2028");
});

test('a JPEG is fitted under its byte limit, or refused and removed', t => {
  const dir = mkdtempSync(join(tmpdir(), 'sf-cover-jpeg-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const png = join(dir, 'noise.png'), out = join(dir, 'out.jpg');
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'nullsrc=s=640x640,geq=random(1)*255:128:128', '-frames:v', '1', png]);
  const best = encodeJpeg(png, out, 1 << 30);
  assert.equal(best.quality, 2);
  const fitted = encodeJpeg(png, out, best.bytes - 1);
  assert.ok(fitted.quality > 2 && fitted.bytes < best.bytes);
  assert.throws(() => encodeJpeg(png, out, 100), /cover_file_too_large/);
  assert.equal(existsSync(out), false);
});

test('legacy frame covers render literal copy, keep the existing cover and reject an edited path', { skip: !chromePath() && 'no Chrome' }, async t => {
  const { dir, sb } = episode(t, { storyFirst: false });
  mkdirSync(join(dir, 'output', 'video'), { recursive: true });
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=s=1080x1920:d=1:r=10', '-pix_fmt', 'yuv420p', join(dir, 'output', 'video', 'video.mp4')]);
  const existing = join(dir, 'output', 'video', 'cover.jpg');
  writeFileSync(existing, 'existing cover');
  setCover(sb, decision({ source: { kind: 'frame', video: 'output/video/video.mp4', seconds: 0.5 }, copy: { text: "$& $' 끝", emphasis: '끝' } }));
  const { render } = await renderCover(sb);
  assert.ok(render.measurements['9x16'].fontPx > 0);
  assert.equal(render.measurements['9x16'].minTileFontPx, 10);
  assert.deepEqual(render.copied, []);
  assert.equal(readFileSync(existing, 'utf8'), 'existing cover');
  const file = join(sb, 'cover.json');
  const edited = JSON.parse(readFileSync(file, 'utf8'));
  edited.source.path = '../../../../../../etc/hosts';
  writeFileSync(file, JSON.stringify(edited));
  assert.ok(readCover(sb).changed.includes('source'));
  await assert.rejects(renderCover(sb), /cover_source_(outside|missing)/);
});

test('a hand-edited decision is reported unreadable, and a page that never finished is refused', async t => {
  const { sb } = episode(t);
  setCover(sb, decision());
  const file = join(sb, 'cover.json');
  writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, 'utf8')), extra: 1 }));
  assert.equal(readCover(sb).status, 'unreadable');
  await assert.rejects(renderCover(sb), /cover_decision_unreadable/);
  setCover(sb, decision({ copy: { text: '찢을까' } }));
  const fake = join(sb, '..', 'fake-chrome.sh');
  writeFileSync(fake, '#!/bin/sh\necho \'<script type="application/json" id="measure">{}</script>\'\n', { mode: 0o755 });
  const before = process.env.CHROME;
  process.env.CHROME = fake;
  t.after(() => { if (before === undefined) delete process.env.CHROME; else process.env.CHROME = before; });
  await assert.rejects(renderCover(sb), /cover_chrome_failed: the cover page did not finish/);
});

test('long-form renders the thumbnail and its Test & Compare variants', { skip: !chromePath() && 'no Chrome' }, async t => {
  const { dir, sb } = episode(t, { format: 'youtube-long-16x9', size: '1920x1080', shots: [
    { id: 's0001', visual: { frames: { start: 'images/s0001.png' } } }, { id: 's0002', visual: { frames: { start: 'images/s0002.png' } } }] });
  const r = setCover(sb, decision({ copy: { text: '사장님 이거 진짜예요?', emphasis: '진짜' }, focus: { x: 0.7, y: 0.5 }, variants: [{ copy: { text: '찢은 날' } }] }));
  const { render } = await renderCover(sb);
  assert.equal(r.decisionSha256, render.decisionSha256);
  assert.deepEqual(render.files.map(f => [f.name, f.width, f.height, f.role]), [['thumbnail-16x9.jpg', 1920, 1080, 'main'], ['thumbnail-16x9-b.jpg', 1920, 1080, 'variant b']]);
  assert.deepEqual(render.copied, ['output/video/cover.jpg', 'output/video/thumbnail.jpg']);
  const box = render.measurements['16x9'].box;
  assert.ok(box.x1 <= 0.5, 'the copy sits on the side away from the subject');
  assert.equal(render.warnings.some(w => w.code === 'cover_copy_badge'), false);
  const read = readCover(sb);
  assert.equal(read.status, 'fresh');
  assert.deepEqual(read.publish.variants, [join(dir, 'output', 'cover', 'thumbnail-16x9-b.jpg')]);
  const renderFile = join(dir, 'output', 'cover', 'render.json');
  const recorded = JSON.parse(readFileSync(renderFile, 'utf8'));
  writeFileSync(renderFile, JSON.stringify({ ...recorded, fonts: Object.fromEntries(Object.keys(recorded.fonts).map(k => [k, '0'.repeat(64)])) }));
  assert.deepEqual(readCover(sb).changed, ['font']);
  const out = join(dir, 'output', 'cover');
  writeFileSync(join(out, 'thumbnail-16x9-c.jpg'), 'mine');
  writeFileSync(join(out, 'previews', 'notes.png'), 'mine');
  setCover(sb, decision({ copy: { text: '사장님 이거 진짜예요?' }, focus: { x: 0.7, y: 0.5 } }));
  await renderCover(sb);
  assert.equal(existsSync(join(out, 'thumbnail-16x9-b.jpg')), false, 'a removed variant leaves with the next render');
  assert.equal(existsSync(join(out, 'previews', '16x9-b-sheet.png')), false);
  assert.deepEqual([readFileSync(join(out, 'thumbnail-16x9-c.jpg'), 'utf8'), readFileSync(join(out, 'previews', 'notes.png'), 'utf8')], ['mine', 'mine'], 'files the tool never recorded stay');

  // A render that fails part-way leaves the previous files, render.json and output/video copy as they were.
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=green:s=1920x1080', '-frames:v', '1', join(sb, 'images', 's0002.png')]);
  const before = ['thumbnail-16x9.jpg', 'render.json'].map(n => readFileSync(join(out, n)));
  const copyBefore = readFileSync(join(dir, 'output', 'video', 'thumbnail.jpg'));
  setCover(sb, decision({ copy: { text: '바뀐 문구' }, variants: [{ source: { kind: 'shot', shotId: 's0002' } }] }));
  writeFileSync(join(sb, 'images', 's0002.png'), readFileSync(join(sb, 'images', 's0001.png')));
  await assert.rejects(renderCover(sb), /cover_source_changed/);
  assert.deepEqual(['thumbnail-16x9.jpg', 'render.json'].map(n => readFileSync(join(out, n))), before);
  assert.deepEqual(readFileSync(join(dir, 'output', 'video', 'thumbnail.jpg')), copyBefore);

  // The board's format changed under the decision.
  writeFileSync(join(sb, 'scenes.js'), readFileSync(join(sb, 'scenes.js'), 'utf8').replace('youtube-long-16x9', 'shorts-9x16'));
  assert.ok(readCover(sb).changed.includes('format'));
  await assert.rejects(renderCover(sb), /cover_format_changed/);
});

test('a failed re-render changes nothing, and a missing preview reads stale', { skip: !chromePath() && 'no Chrome' }, async t => {
  const { dir, sb } = episode(t);
  setCover(sb, decision());
  const { render } = await renderCover(sb);
  const out = join(dir, 'output', 'cover');
  const kept = ['cover-9x16.jpg', 'render.json'].map(n => readFileSync(join(out, n)));
  const fake = join(dir, 'failing-chrome.sh');
  writeFileSync(fake, '#!/bin/sh\nexit 3\n', { mode: 0o755 });
  const before = process.env.CHROME;
  process.env.CHROME = fake;
  try { await assert.rejects(renderCover(sb), /cover_chrome_failed/); } finally { if (before === undefined) delete process.env.CHROME; else process.env.CHROME = before; }
  assert.deepEqual(['cover-9x16.jpg', 'render.json'].map(n => readFileSync(join(out, n))), kept, 'a render that fails in Chrome changes nothing');
  assert.equal(readCover(sb).status, 'fresh');
  rmSync(join(out, render.previews[0]));
  assert.deepEqual(readCover(sb).changed, ['files']);
});

test('once Shorts landscape surfaces keep 9:16, no landscape crop is previewed', t => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'sf-cover-prev-')));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const shot = join(dir, 'shot.png');
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=gray:s=540x960', '-frames:v', '1', shot]);
  mkdirSync(join(dir, 'previews'));
  const spec = (crop) => ({ canvases: [{ id: '9x16', w: 2160, h: 3840, min: [1080, 1920] }], copyMax: { words: 3, chars: 8 },
    bands: { core: { y0: 0.342, y1: 0.658 }, support: { y0: 0.219, y1: 0.781 }, outer: { y0: 0.125, y1: 0.875 }, x: { x0: 0.06, x1: 0.94 } },
    unverified: { shortsLandscapeCrop: crop } });
  assert.deepEqual(cutPreviews(shot, join(dir, 'previews'), 'a', 'vertical', spec('3:2')).map(p => p.split('-').slice(1).join('-')), ['grid-3x4.png', 'feed-1x1.png', 'landscape-16x9.png', 'sheet.png']);
  assert.deepEqual(cutPreviews(shot, join(dir, 'previews'), 'b', 'vertical', spec('9:16')).map(p => p.split('-').slice(1).join('-')), ['grid-3x4.png', 'feed-1x1.png', 'sheet.png']);
});
