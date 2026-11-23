import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { localDesktopCatalog, pollLocalDesktop } from '../dist/ltx-desktop-local.js';
import { HOSTED_VIDEO_ROUTES } from '../dist/hosted-video-routes.js';
import { ROUTES } from '../dist/handlers.js';
import { setupProject, png } from './workflow-fixture.mjs';
import settings from '../../skills/_shared/model-settings.js';

const model = 'ltx-2.5-fast';
const matrix = { '270p': { fps_to_durations: { 24: [2, 3] }, aspect_ratios: ['16:9', '9:16'] } };
const specs = {
  active_offering: model,
  api_models: [{ model: 'api-only' }],
  local_unavailable_reason: null,
  downloaded_local_models: [
    {
      model,
      spec: {
        capabilities: { t2v: true, i2v: true, a2v: true },
        supported_resolutions_durations: matrix,
        a2v_supported_resolutions_durations: matrix,
      },
    },
  ],
};
const json = (data) => Response.json(data);
const mp4 = Buffer.from('000000146674797069736f6d0000000069736f6d', 'hex');
function local(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-native-desktop-'));
  process.env.LTX_DESKTOP_API_KEY = 'desktop-test';
  t.after(() => {
    delete process.env.LTX_DESKTOP_API_KEY;
    delete process.env.LTX_DESKTOP_BASE_URL;
    fs.rmSync(root, { recursive: true, force: true });
  });
  return root;
}

test('local catalog returns only downloaded models and refuses non-loopback and missing credentials before fetching', async (t) => {
  local(t);
  const calls = t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, 'http://127.0.0.1:41954/api/generate/models-specs');
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, 'Bearer desktop-test');
    return json(specs);
  });
  const result = JSON.parse((await ROUTES.video_catalog({ engine: 'ltx-desktop-local' })).content[0].text);
  assert.deepEqual(
    result.models.map((m) => m.id),
    [model]
  );
  process.env.LTX_DESKTOP_BASE_URL = 'https://example.com';
  await assert.rejects(localDesktopCatalog(), /loopback/);
  delete process.env.LTX_DESKTOP_BASE_URL;
  delete process.env.LTX_DESKTOP_API_KEY;
  await assert.rejects(localDesktopCatalog(), /LTX_DESKTOP_API_KEY/);
  assert.equal(calls.mock.callCount(), 1);
});

test('project snapshot plans local frames at zero cost and checks the downloaded model before approval', async (t) => {
  const root = local(t);
  const video = { engine: 'ltx-desktop-local', model, resolution: '270p' };
  setupProject(root, { video });
  const episode = path.join(root, 'data/c/episodes/test');
  const boardDir = path.join(episode, 'storyboard');
  fs.mkdirSync(boardDir, { recursive: true });
  settings.snapshotSettings(root, episode);
  fs.writeFileSync(path.join(boardDir, 'first.png'), png);
  fs.writeFileSync(path.join(boardDir, 'last.png'), png);
  const shot = {
    id: 's1',
    scene: 1,
    duration: 2,
    visual: { frames: { mode: 'first_last', start: 'first.png', end: 'last.png' } },
  };
  const scene = { no: 1, videoDirection: { openingPositions: [], emotion: 'Calm.' } };
  fs.writeFileSync(
    path.join(boardDir, 'scenes.js'),
    'window.FORMAT="shorts-9x16";window.SCENES=' +
      JSON.stringify([shot]) +
      ';window.STRUCTURE=' +
      JSON.stringify({ scenes: [scene] }) +
      ';'
  );
  let downloaded = true;
  t.mock.method(globalThis, 'fetch', async () =>
    json(downloaded ? specs : { ...specs, downloaded_local_models: [] })
  );
  const request = { episode, sceneNo: 1, requestId: 'local-frame' };
  const plan = JSON.parse((await ROUTES.video_plan(request)).content[0].text);
  assert.equal(plan.tool, 'ltx_desktop_img2video');
  assert.equal(plan.args.aspectRatio, '9:16');
  assert.equal(plan.quote.reserveUsd, 0);
  assert.deepEqual(
    [plan.args.imagePath, plan.args.lastFramePath].map((f) => path.basename(f)),
    ['first.png', 'last.png']
  );
  downloaded = false;
  await assert.rejects(ROUTES.video_plan({ ...request, requestId: 'missing' }), /unavailable/);
});

test('native image and audio jobs register the local assets once, retain their job ID and download Desktop bytes', async (t) => {
  const root = local(t);
  const picture = path.join(root, 'first.png');
  fs.writeFileSync(picture, png);
  const track = path.join(root, 'track.wav');
  execFileSync('ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'anullsrc=r=24000:cl=mono',
    '-t',
    '2.375',
    track,
  ]);
  const requests = [];
  const timer = globalThis.setTimeout;
  t.mock.method(globalThis, 'setTimeout', (fn, ms, ...args) => timer(fn, ms === 2500 ? 0 : ms, ...args));
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    const endpoint = new URL(url).pathname;
    assert.equal(init.redirect, 'error');
    const body = init.body && JSON.parse(init.body);
    requests.push({ endpoint, method: init.method, body });
    if (endpoint.endsWith('models-specs')) return json(specs);
    if (endpoint === '/api/assets') return json({ id: body.path === picture ? 'frame' : 'track' });
    if (init.method === 'POST') return json({ id: 'job-1', lane: 'local' });
    if (endpoint.endsWith('/bytes')) return new Response(mp4);
    return json({
      id: 'job-1',
      status: 'succeeded',
      lane: 'local',
      outputs: [{ id: 'output', media_kind: 'video' }],
    });
  });
  for (const [tool, input, native, assets] of [
    [
      'ltx_desktop_img2video',
      { imagePath: picture, lastFramePath: picture },
      'image-to-video',
      { startFrame: { assetId: 'frame' }, endFrame: { assetId: 'frame' } },
    ],
    [
      'ltx_desktop_audio2video',
      { imagePath: picture, audioPath: track },
      'audio-to-video',
      { startFrame: { assetId: 'frame' }, audio: { assetId: 'track' } },
    ],
  ]) {
    requests.length = 0;
    const result = await HOSTED_VIDEO_ROUTES[tool].generate({
      model,
      resolution: '270p',
      prompt: 'A boat floats.',
      ...input,
      outputPath: root,
      filename: tool + '.mp4',
    });
    assert.equal(result.success, true, JSON.stringify(result));
    assert.deepEqual(fs.readFileSync(result.videoPath), mp4);
    assert.equal(result.providerId, 'job-1');
    const submits = requests.filter(
      (r) => r.method === 'POST' && r.endpoint.startsWith('/api/generations/')
    );
    assert.equal(
      requests.filter((r) => r.endpoint === '/api/assets').length,
      native === 'image-to-video' ? 1 : 2
    );
    assert.equal(submits.length, 1);
    assert.equal(submits[0].endpoint, '/api/generations/' + native);
    assert.deepEqual(submits[0].body.inputs, assets);
    assert.equal(submits[0].body.params.model, model);
    requests.length = 0;
    assert.equal((await pollLocalDesktop('job-1')).state, 'done');
    assert.ok(requests.every((r) => r.method === 'GET'));
  }
});

test('unavailable models, incompatible settings and ambiguous submits cannot trigger a fallback', async (t) => {
  local(t);
  let postCount = 0;
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    if (init.method === 'GET') return json(specs);
    postCount++;
    throw new TypeError('connection closed');
  });
  const route = HOSTED_VIDEO_ROUTES.ltx_desktop_text2video;
  const args = { model, resolution: '270p', prompt: 'Water ripples.' };
  for (const change of [{ model: 'ltx-not-downloaded' }, { durationSeconds: 8 }]) {
    const result = await route.generate({ ...args, ...change });
    assert.equal(result.terminal, true);
  }
  assert.equal(postCount, 0);
  const result = await route.generate(args);
  assert.equal(result.terminal, false);
  assert.equal(postCount, 1);
});

test('managed recovery completes the original Desktop request after interrupted polling', async (t) => {
  const root = local(t);
  setupProject(root, { video: { engine: 'ltx-desktop-local', model, resolution: '270p' } });
  const episode = path.join(root, 'data/c/episodes/recovery');
  fs.mkdirSync(path.join(episode, 'storyboard'), { recursive: true });
  settings.snapshotSettings(root, episode);
  const production = {
    videoAuthorization: { reference: 'local test', maxUsd: 0, maxConcurrent: 1, maxAttempts: 1 },
  };
  fs.writeFileSync(
    path.join(episode, 'storyboard/scenes.js'),
    'window.PRODUCTION=' + JSON.stringify(production) + ';window.STRUCTURE={scenes:[{no:1}]};window.SCENES=[{id:"s1",scene:1,duration:3,visual:{}}];'
  );
  const timer = globalThis.setTimeout;
  t.mock.method(globalThis, 'setTimeout', (fn, ms, ...args) => timer(fn, ms === 2500 ? 0 : ms, ...args));
  let submissions = 0,
    interrupted = true;
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    if (url.endsWith('/models-specs')) {
      const localSpecs = structuredClone(specs);
      localSpecs.downloaded_local_models[0].spec.supported_resolutions_durations[
        '270p'
      ].fps_to_durations[24] = [2, 4];
      return json(localSpecs);
    }
    if (init.method === 'POST') {
      submissions++;
      return json({ id: 'native-id', lane: 'local' });
    }
    if (interrupted) throw new TypeError('Desktop is restarting');
    if (url.endsWith('/bytes')) return new Response(mp4);
    assert.ok(url.endsWith('/generations/native-id'));
    return json({
      id: 'native-id',
      lane: 'local',
      status: 'succeeded',
      outputs: [{ id: 'clip', media_kind: 'video' }],
    });
  });
  const request = { episode, requestId: 'resume' };
  const plan = JSON.parse(
    (await ROUTES.video_plan({ ...request, sceneNo: 1, args: { prompt: 'A boat floats.' } })).content[0]
      .text
  );
  assert.equal(plan.args.durationSeconds, 4);
  await assert.rejects(
    ROUTES.video_plan({ ...request, sceneNo: 1, args: { prompt: 'A boat floats.', durationSeconds: 3 } }),
    /unavailable/
  );
  await ROUTES.video_approve({ episode, planIds: [plan.id], request: 'Approve local test' });
  const execute = () => ROUTES.video_execute({ episode, planId: plan.id });
  assert.equal((await execute()).isError, true);
  await assert.rejects(execute(), /pending/);
  interrupted = false;
  const status = JSON.parse((await ROUTES.video_status({ ...request, action: 'refresh' })).content[0].text);
  assert.deepEqual([status.status, status.providerId], ['completed', 'native-id']);
  assert.deepEqual(fs.readFileSync(JSON.parse((await execute()).content[0].text).videoPath), mp4);
  assert.equal(submissions, 1);
});
