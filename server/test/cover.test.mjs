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

const { setCover, renderCover, readCover, chromePath } = await import('../dist/cover.js');

function episode(t, { storyFirst = true, format = 'shorts-9x16', size = '1080x1920', shots } = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'sf-cover-')));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
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
  return { dir, sb };
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
  const r = setCover(sb, decision({ source: { kind: 'frame', video: 'output/video/video.mp4', seconds: 0.5, shotId: 's0001' } }));
  assert.equal(r.decision.source.path, 'output/video/video.mp4');
});

test('render makes the platform files, read tracks the source, a legacy board keeps its cover.jpg', { skip: !chromePath() && 'no Chrome' }, async t => {
  const { dir, sb } = episode(t);
  setCover(sb, decision({ copy: { text: '찢을까 말까', emphasis: '찢을까' }, focus: { x: 0.5, y: 0.4 } }));
  const { render } = await renderCover(sb);
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

  const legacy = episode(t, { storyFirst: false });
  setCover(legacy.sb, decision());
  const r = await renderCover(legacy.sb);
  assert.deepEqual(r.render.copied, []);
  assert.equal(existsSync(join(legacy.dir, 'output', 'video', 'cover.jpg')), false);
  assert.ok(JSON.parse(readFileSync(join(legacy.dir, 'output', 'cover', 'render.json'), 'utf8')).files.length >= 1);
});
