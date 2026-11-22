import { test } from 'node:test';
import { setupProject } from './workflow-fixture.mjs';
import modelSettings from '../../skills/_shared/model-settings.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { config } from '../dist/config.js';
import { ensurePortrait, portraitForImage } from '../dist/modelark-assets.js';
import { generateWithReferences, seedanceReferenceSchema } from '../dist/seedance-client.js';
import { ROUTES } from '../dist/handlers.js';

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sf-ark-portrait-'))),
    folder = path.join(root, 'assets/characters/iris');
  fs.mkdirSync(folder, { recursive: true });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const identity = path.join(folder, 'identity.md'),
    image = path.join(folder, 'face.png');
  fs.writeFileSync(
    identity,
    '# Iris\n\n```json\n{"character":{"version":1},"tts":{"language":"ko"}}\n```\nKeep this paragraph.\n',
  );
  fs.writeFileSync(path.join(folder, 'panels.json'), JSON.stringify({ panels: { face: { file: 'face.png' } } }));
  execFileSync('ffmpeg', [
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'color=blue:s=320x320',
    '-frames:v',
    '1',
    image,
  ]);
  t.mock.method(
    globalThis,
    'setTimeout',
    new Proxy(setTimeout, {
      apply(target, receiver, [fn, ms, ...args]) {
        return Reflect.apply(target, receiver, [fn, ms >= 1000 ? 0 : ms, ...args]);
      },
    }),
  );
  const old = config.arkApiKey;
  config.arkApiKey = 'test';
  t.after(() => (config.arkApiKey = old));
  const env = {
    BYTEPLUS_ACCESS_KEY_ID: 'test-AK',
    BYTEPLUS_SECRET_ACCESS_KEY: 'test-secret',
    BYTEPLUS_PROJECT_NAME: 'default',
    MEDIA_UPLOAD_URL: 'https://host.invalid/upload',
    MEDIA_UPLOAD_API_KEY: 'fixture',
  };
  for (const [key, value] of Object.entries(env)) {
    const old = process.env[key];
    process.env[key] = value;
    t.after(() => {
      if (old === undefined) delete process.env[key];
      else process.env[key] = old;
    });
  }
  const counters = {};
  const settings = { status: 'Active', dropAfterCreate: false, denyGroup: false };
  let created = false;
  t.mock.method(globalThis, 'fetch', async (input, opts = {}) => {
    const u = new URL(input),
      action = u.searchParams.get('Action');
    if (u.hostname === 'ark.ap-southeast-1.byteplusapi.com') {
      assert.match(opts.headers.Authorization, /^HMAC-SHA256 Credential=test-AK\//);
      assert.equal(opts.redirect, 'error');
      const args = JSON.parse(opts.body);
      assert.equal(args.ProjectName, 'default');
      counters[action] = (counters[action] ?? 0) + 1;
      const result = (v) => Response.json({ Result: v });
      if (action === 'ListAssetGroups') return result({ Items: [] });
      if (action === 'CreateAssetGroup')
        return settings.denyGroup
          ? Response.json({ ResponseMetadata: { Error: { Code: 'SubscriptionRequired' } } }, { status: 403 })
          : result({ Id: 'group-one' });
      if (action === 'ListAssets')
        return result({ Items: created ? [{ Id: 'asset-first', Name: args.Filter.Name }] : [] });
      if (action === 'CreateAsset') {
        assert.equal(args.GroupId, 'group-one');
        assert.equal(args.AssetType, 'Image');
        assert.equal(args.URL, 'https://host.invalid/blob');
        created = true;
        if (settings.dropAfterCreate) throw new Error('lost response');
        return result({ Id: 'asset-first' });
      }
      if (action === 'GetAsset')
        return result({ Id: 'asset-first', GroupId: 'group-one', Status: settings.status, AssetType: 'Image' });
    }
    if (u.hostname === 'host.invalid')
      return opts.method === 'HEAD'
        ? new Response()
        : Response.json({ data: { url: 'https://host.invalid/blob' } }, { status: 201 });
    if (u.pathname.endsWith('/contents/generations/tasks') && opts.method === 'POST') {
      counters.video = (counters.video ?? 0) + 1;
      const body = JSON.parse(opts.body);
      const url = body.content.find((i) => i.role === 'reference_image').image_url.url;
      if (settings.mixed) {
        const ordered = body.content
          .filter((item) => item.role === 'reference_image')
          .map((item) => item.image_url.url);
        assert.match(ordered[0], /^data:image\/png;base64,/);
        assert.equal(ordered[1], 'asset://asset-first');
      } else if (settings.rawImage) assert.match(url, /^data:image\/png;base64,/);
      else assert.equal(url, 'asset://asset-first');
      return Response.json({ id: 'cgt-mock' });
    }
    if (u.pathname.endsWith('/cgt-mock'))
      return Response.json({
        status: 'failed',
        error: { message: 'mock stop after inspecting the paid request' },
      });
    throw Error('unexpected mock request');
  });
  const run = () => ensurePortrait({ identityPath: identity, groupType: 'AIGC' });
  const generate = (file = image, output = root) =>
    generateWithReferences(
      seedanceReferenceSchema.parse({
        prompt: 'Iris on stage.',
        model: 'dreamina-seedance-2-5-flash-261115',
        referenceImagePaths: [file],
        resolution: '480p',
        durationSeconds: 4,
        outputPath: output,
      }),
    );
  return { root, folder, identity, image, run, generate, settings, counters };
}
test('tool saves an Active portrait, both canonical and exact copied panels reach Seedance as the same ID', async (t) => {
  const f = fixture(t),
    result = await ROUTES.modelark_portrait_register({ identityPath: f.identity, groupType: 'AIGC' });
  assert.equal(JSON.parse(result.content[0].text).uri, 'asset://asset-first');
  const saved = fs.readFileSync(f.identity, 'utf8');
  assert.match(saved, /asset-first/);
  assert.match(saved, /"language": "ko"/);
  assert.ok(saved.endsWith('Keep this paragraph.\n'));
  const board = path.join(f.root, 'episodes', 'test', 'storyboard');
  fs.mkdirSync(board, { recursive: true });
  const copy = path.join(board, 'named.png');
  fs.copyFileSync(f.image, copy);
  fs.writeFileSync(
    path.join(board, 'cast.json'),
    JSON.stringify({ characters: [{ id: 'iris', source: path.relative(board, f.identity) }] }),
  );
  assert.equal(portraitForImage(copy, path.dirname(board)).identityPath, f.identity);
  for (const file of [f.image, copy])
    assert.equal((await f.generate(file, path.dirname(board))).taskId, 'cgt-mock');
  const invalidVoice = path.join(f.root, 'invalid.wav');
  fs.writeFileSync(invalidVoice, 'not a wave');
  const checked = { ...f.counters };
  const invalid = await generateWithReferences(
    seedanceReferenceSchema.parse({
      prompt: 'Iris speaks.',
      model: 'dreamina-seedance-2-5-flash-261115',
      referenceImagePaths: [f.image],
      referenceAudioPaths: [invalidVoice],
      generateAudio: true,
      outputPath: f.root,
    }),
  );
  assert.equal(invalid.terminal, true);
  assert.deepEqual(f.counters, checked);
  const unmapped = path.join(f.root, 'unregistered.png');
  fs.copyFileSync(f.image, unmapped);
  const strict = await generateWithReferences(
    seedanceReferenceSchema.parse({
      prompt: 'Iris on stage.',
      model: 'dreamina-seedance-2-5-flash-261115',
      referenceImagePaths: [unmapped],
      realFaceInput: true,
      outputPath: f.root,
    }),
  );
  assert.equal(strict.portraitProblem.code, 'modelark_asset_sheet_required');
  assert.deepEqual(f.counters, checked);
  assert.equal(f.counters.CreateAssetGroup, 1);
  assert.equal(f.counters.CreateAsset, 1);
  assert.equal(f.counters.video, 2);
  f.settings.status = 'Failed';
  assert.equal((await f.generate()).terminal, true);
  assert.equal(f.counters.video, 2);
});
test('unknown upload recovers by exact name and entitlement failure never reaches video generation', async (t) => {
  const f = fixture(t);
  f.settings.denyGroup = true;
  const refusal = await ROUTES.modelark_portrait_register({ identityPath: f.identity, groupType: 'AIGC' });
  assert.equal(refusal.isError, true);
  assert.equal(refusal.structuredContent.code, 'modelark_asset_entitlement_required');
  assert.equal(refusal.structuredContent.httpStatus, 403);
  assert.equal(refusal.structuredContent.videoSubmitted, false);
  assert.match(refusal.structuredContent.nextAction, /free Advanced Creation Rights/);
  assert.equal(f.counters.CreateAsset, undefined);
  assert.equal(f.counters.video, undefined);
  f.settings.denyGroup = false;
  f.settings.dropAfterCreate = true;
  await assert.rejects(f.run(), /lost response/);
  assert.equal((await f.run()).uri, 'asset://asset-first');
  assert.equal(f.counters.CreateAsset, 1);
  await assert.rejects(ensurePortrait({ identityPath: f.identity, groupType: 'LivenessFace' }), /conflict/);
});
test('real-person registration requires a verified group and an unclassified sheet cannot upload', async (t) => {
  const f = fixture(t);
  await assert.rejects(
    ensurePortrait({ identityPath: f.identity, groupType: 'LivenessFace' }),
    /liveness_required/,
  );
  const result = await f.generate();
  assert.equal(result.terminal, true);
  assert.match(result.error, /kind_required/);
  assert.deepEqual(f.counters, {});
});

test('historical headless panels remain ordinary media and ambiguous portrait copies fail before submission', async (t) => {
  const f = fixture(t),
    back = path.join(f.folder, 'back.png');
  fs.copyFileSync(f.image, back);
  fs.writeFileSync(
    path.join(f.folder, 'panels.json'),
    JSON.stringify({ panels: { face: { file: 'face.png' }, back: { file: 'back.png' } } }),
  );
  f.settings.rawImage = true;
  for (const flag of [false, undefined]) {
    const result = await generateWithReferences(
      seedanceReferenceSchema.parse({
        prompt: 'A fitting panel.',
        model: 'dreamina-seedance-2-5-flash-261115',
        referenceImagePaths: [back],
        realFaceInput: flag,
        outputPath: f.root,
      }),
    );
    assert.equal(result.taskId, 'cgt-mock');
  }
  assert.equal(f.counters.CreateAsset, undefined);
  const clone = path.join(path.dirname(f.folder), 'double');
  fs.cpSync(f.folder, clone, { recursive: true });
  const board = path.join(f.root, 'episodes', 'duet', 'storyboard');
  fs.mkdirSync(board, { recursive: true });
  const file = path.join(board, 'anonymous.png');
  fs.copyFileSync(f.image, file);
  const characters = [f.folder, clone].map((d) => ({
    id: path.basename(d),
    source: path.relative(board, path.join(d, 'identity.md')),
  }));
  fs.writeFileSync(path.join(board, 'cast.json'), JSON.stringify({ characters }));
  const rejected = await generateWithReferences(
    seedanceReferenceSchema.parse({
      prompt: 'The duet.',
      model: 'dreamina-seedance-2-5-flash-261115',
      referenceImagePaths: [file],
      realFaceInput: true,
      outputPath: path.dirname(board),
    }),
  );
  assert.equal(rejected.portraitProblem.code, 'modelark_asset_ambiguous');
  assert.equal(rejected.portraitProblem.videoSubmitted, false);
  assert.equal(f.counters.video, 2);
});

test('registered face and ordinary headless fitting are submitted in their authored order', async (t) => {
  const f = fixture(t);
  await f.run();
  const panel = path.join(f.folder, 'back.png');
  execFileSync('ffmpeg', [
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'color=red:s=320x320',
    '-frames:v',
    '1',
    panel,
  ]);
  fs.writeFileSync(
    path.join(f.folder, 'panels.json'),
    JSON.stringify({ panels: { face: { file: 'face.png' }, back: { file: 'back.png' } } }),
  );
  f.settings.mixed = true;
  const prop = path.join(f.root, 'red-bag.png');
  fs.copyFileSync(panel, prop);
  for (const file of [panel, prop])
    for (const realFaceInput of [true, undefined]) {
      const res = await generateWithReferences(
        seedanceReferenceSchema.parse({
          model: 'dreamina-seedance-2-5-flash-261115',
          prompt: 'A dancer and her bag.',
          referenceImagePaths: [file, f.image],
          realFaceInput,
          outputPath: f.root,
        }),
      );
      assert.equal(res.taskId, 'cgt-mock');
    }
  assert.equal(f.counters.video, 4);
  assert.equal(f.counters.CreateAsset, 1);
});

test('managed portrait ambiguity releases the same approval until the cast copy has one owner', async (t) => {
  const f = fixture(t),
    video = {
      engine: 'seedance',
      model: 'dreamina-seedance-2-5-flash-261115',
      resolution: '480p',
      operation: 'reference',
    };
  setupProject(f.root, { video });
  const episode = path.join(f.root, 'data/c/episodes/solo'),
    board = path.join(episode, 'storyboard');
  fs.mkdirSync(board, { recursive: true });
  modelSettings.snapshotSettings(f.root, episode);
  const clone = path.join(path.dirname(f.folder), 'double');
  fs.cpSync(f.folder, clone, { recursive: true });
  fs.copyFileSync(f.image, path.join(board, 'shot.png'));
  const cast = path.join(board, 'cast.json'),
    characters = [f.folder, clone].map((d) => ({
      id: path.basename(d),
      source: path.relative(board, path.join(d, 'identity.md')),
    }));
  fs.writeFileSync(cast, JSON.stringify({ characters }));
  const shot = {
    id: 's1',
    visual: {
      frames: { mode: 'reference' },
      references: [{ id: 'iris', role: 'character', use: 'video', path: 'shot.png', purpose: 'The dancer.' }],
      video: { ...video, prompt: 'Iris is dancing.' },
    },
  };
  const auth = {
    videoAuthorization: { reference: 'Fixture approval', maxUsd: 1, maxAttempts: 1, maxConcurrent: 1 },
  };
  fs.writeFileSync(
    path.join(board, 'scenes.js'),
    'window.PRODUCTION=' + JSON.stringify(auth) + ';\nwindow.SCENES=' + JSON.stringify([shot]) + ';',
  );
  const planned = await ROUTES.video_plan({
    episode,
    shotId: 's1',
    requestId: 'ambiguous',
    args: { durationSeconds: 4 },
  });
  const planId = JSON.parse(planned.content[0].text).id;
  await ROUTES.video_approve({ episode, planIds: [planId], request: 'Fixture single plan approval' });
  const blocked = await ROUTES.video_execute({ episode, planId });
  assert.equal(blocked.structuredContent.code, 'modelark_asset_ambiguous');
  assert.equal(blocked.structuredContent.videoSubmitted, false);
  assert.deepEqual(f.counters, {});
  const ledger = path.join(episode, '.work/video-routing/state.json');
  assert.deepEqual(JSON.parse(fs.readFileSync(ledger)).jobs, {});
  fs.writeFileSync(cast, JSON.stringify({ characters: characters.slice(0, 1) }));
  await f.run();
  const executed = await ROUTES.video_execute({ episode, planId });
  assert.match(executed.content[0].text, /mock stop after inspecting/);
  assert.equal(JSON.parse(fs.readFileSync(ledger)).jobs.ambiguous.providerId, 'cgt-mock');
  assert.equal(f.counters.video, 1);
});
