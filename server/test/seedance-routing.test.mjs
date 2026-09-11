import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEEDANCE_MODEL_SPECS } from '../dist/seedance-client.js';
import { priceOf, PRICED_VIDEO_KEYS } from '../dist/usage-ledger.js';
const require = createRequire(import.meta.url);
const { MODELS, PRICED, scenePlan } = require('../../skills/produce/references/seedance-route.js');
const preview = fileURLToPath(new URL('../../skills/autoproduce/references/cost-preview.js', import.meta.url));
const scene = (video = {}, duration = 5) => ({ type: 'cover', duration, visual: { video: { prompt: 'A masked adult turns.', ...video } } });
const action = { modelPurpose: 'complex-motion', modelReason: 'Catch then pass the box', realFaceInput: false };

test('planning model constraints match the server', () => {
  for (const [id, spec] of Object.entries(MODELS)) {
    const api = SEEDANCE_MODEL_SPECS[id];
    assert.deepEqual(spec.duration, [...api.duration]);
    assert.deepEqual(spec.resolutions, [...api.resolutions]);
    assert.equal(spec.images, api.referenceImages ? api.referenceImages[1] : 0);
    assert.equal(spec.videos, api.referenceVideos ? api.referenceVideos.maxClips : 0);
    assert.equal(spec.audio, api.audio);
  }
});

test('ordinary hook stays silent 1.5; action selects 2.0; invalid escalations fail', () => {
  const ordinary = scenePlan(scene({}, 3));
  assert.equal(ordinary.model, 'seedance-1-5-pro-251215');
  assert.equal(ordinary.durationSeconds, 4);
  assert.equal(ordinary.generateAudio, false);
  assert.equal(scenePlan(scene(action)).model, 'dreamina-seedance-2-0-260128');
  assert.equal(scenePlan(scene({}, 4.2)).durationSeconds, 5);
  assert.throws(() => scenePlan(scene({}, 13)), /at most 12/);
  assert.throws(() => scenePlan(scene({ ...action, realFaceInput: true })), /realFaceInput:false/);
  assert.throws(() => scenePlan(scene({ modelPurpose: 'complex-motion', realFaceInput: false })), /modelReason/);
  assert.throws(() => scenePlan(scene({ ...action, model: 'dreamina-seedance-2-0-mini-260615' })), /1080p/);
});

test('reference and voice requirements select a compatible tool and model', () => {
  const refs = { modelPurpose: 'reference', modelReason: 'Keep both character panels', realFaceInput: false,
    referenceImagePaths: ['face.png', 'body.png'] };
  assert.equal(scenePlan(scene(refs)).tool, 'seedance_reference');
  assert.equal(scenePlan(scene({ ...refs, referenceImagePaths: Array(10).fill('panel.png') })).model, 'dreamina-seedance-2-5-260628');
  assert.throws(() => scenePlan(scene({ ...refs, model: 'seedance-1-5-pro-251215' })), /does not accept/);
  const voice = { ...refs, engine: 'seedance', modelPurpose: 'fixed-voice', referenceAudioPaths: ['voice.wav'] };
  assert.throws(() => scenePlan(scene(voice)), /discard audio/);
  const speaking = scenePlan({ type: 'quote', duration: 6, visual: { clip: voice } });
  assert.equal(speaking.model, 'dreamina-seedance-2-5-260628');
  assert.equal(speaking.generateAudio, true);
  assert.equal(priceOf(speaking.tool, speaking).key, speaking.priceKey);
});

test('forecast reflects model cost and snapshot changes; video budget excludes stills', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sf-routing-'));
  try {
    writeFileSync(join(dir, 'profile.md'), '---\nvideo_budget_usd: 0.30\n---\n');
    const board = join(dir, 'episodes', 'test', 'storyboard');
    mkdirSync(board, { recursive: true });
    const input = join(board, 'scenes.js');
    const run = video => {
      const s = scene(video); s.visual.bgPrompt = 'Source still';
      writeFileSync(input, 'window.SCENES=' + JSON.stringify([s]) + ';');
      const r = spawnSync(process.execPath, [preview, input, '--json'], { encoding: 'utf8' });
      return { code: r.status, data: JSON.parse(r.stdout) };
    };
    const base = run({});
    assert.equal(base.code, 0);
    assert.equal(base.data.videoBudget.forecastUsd, 0.29);
    const upgraded = run(action);
    assert.equal(upgraded.code, 1);
    assert.equal(upgraded.data.videoBudget.over, true);
    assert.equal(upgraded.data.videoBudget.forecastUsd, 1.87);
    assert.notEqual(base.data.fingerprint, upgraded.data.fingerprint);
    const row = upgraded.data.forecast.rows.find(r => r.engine === 'seedance');
    assert.equal(row.key, 'seedance.2-0.1080p');
    assert.equal(row.generation.model, 'dreamina-seedance-2-0-260128');
    assert.equal(run({ ...action, model: 'dreamina-seedance-2-5-260628' }).data.videoBudget.forecastUsd, 2.845);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('cost fingerprint matches the storyboard template', () => {
  execFileSync(process.execPath, [preview, '--selftest'], { stdio: 'pipe' });
});

test('every routable price key is priced, and an unpriced resolution is refused', () => {
  // scenePlan may only emit a key the ledger can price — an unpriced row would drop out of
  // the forecast and read as headroom. Walk every model × resolution the capability table allows.
  for (const [model, spec] of Object.entries(MODELS)) {
    for (const resolution of spec.resolutions) {
      for (const kind of ['motion', 'broll']) {
        const visual = kind === 'motion'
          ? { video: { prompt: 'A masked adult turns.', engine: 'seedance', model, resolution, ...(spec.images ? { realFaceInput: false } : {}), ...(model === 'seedance-1-5-pro-251215' ? {} : { modelReason: 'fixture' }) } }
          : { engine: 'seedance', model, resolution, ...(spec.images ? { realFaceInput: false } : {}), ...(model === 'seedance-1-5-pro-251215' ? {} : { modelReason: 'fixture' }) };
        const shot = { type: kind === 'broll' ? 'broll' : 'cover', after: 0, duration: 5, visual };
        let plan = null;
        try { plan = scenePlan(shot); } catch (e) {
          assert.match(e.message, /has no price|cannot supply the audio|does not accept|requires realFaceInput|photoreal faces/,
            `${model} ${resolution} ${kind}: ${e.message}`);
          continue;
        }
        if (plan && plan.engine === 'seedance')
          assert.ok(priceOf(plan.priceKey), `${plan.priceKey} is routable but has no price row`);
      }
    }
  }
});

test('a filmed shot is not a generated slot, but produce\'s output record does not make one', () => {
  // visual.source is the user's own file — nothing to route or bill.
  assert.equal(scenePlan({ type: 'cover', duration: 6, visual: { source: 'recording', clip: 'hook/desk.mp4' } }), null);
  // visual.video.clip is where produce writes the file it just made, so a rebuilt board is
  // still a generated slot — the checkers must not read the record as a supplied file.
  const rebuilt = scenePlan({ type: 'cover', duration: 6, visual: { video: {
    prompt: 'A masked adult turns.', clip: '.work/motion/motion-i0.mp4' } } });
  assert.equal(rebuilt.kind, 'motion');
  assert.equal(rebuilt.priceKey, 'seedance.1-5-pro-silent.1080p');
});

test('the planning price set does not drift from the ledger', () => {
  // Both sides are hand-written lists of the same rows; compare them directly rather than
  // trusting a rejection message, which cannot tell a real gap from a copy that lost a row.
  const seedance = set => [...set].filter(k => k.startsWith('seedance.')).sort();
  assert.deepEqual(seedance(PRICED), seedance(PRICED_VIDEO_KEYS));
});

test('Seedance settings on a Veo slot are refused instead of silently skipped', () => {
  assert.throws(() => scenePlan({ type: 'quote', duration: 6, visual: { clip: {
    modelPurpose: 'fixed-voice', referenceAudioPaths: ['voice.wav'] } } }),
    /only applies to Seedance/);
});

test('a previz on the host lane is not a Seedance field, and on the Seedance route it must travel as Video 1', () => {
  const previz = { renderer: 'blender', clip: 'previz/s4.mp4', firstFrame: 'previz/s4-f0001.png', sha256: 'a'.repeat(64), fps: 24, seconds: 5, camera: { movement: 'arc shot' } };
  const host = { type: 'cover', duration: 5, visual: { bg: 'images/scene-4.png', video: { engine: 'host', prompt: 'x', previz: { ...previz, handoff: 'frame_and_prompt' } } } };
  assert.deepEqual(scenePlan(host), { kind: 'motion', engine: 'host' });
  // The lane implies the handoff (render-routing previzHandoff), so an omitted handoff passes here too (review H2).
  assert.deepEqual(scenePlan({ ...host, visual: { ...host.visual, video: { engine: 'host', prompt: 'x', previz } } }), { kind: 'motion', engine: 'host' });
  assert.throws(() => scenePlan({ ...host, visual: { ...host.visual, video: { ...host.visual.video, previz: { ...previz, handoff: 'reference_video' } } } }), /only applies to Seedance/);
  const api = { type: 'cover', duration: 5, visual: { bg: 'images/scene-4.png', video: { engine: 'seedance', modelPurpose: 'previz', modelReason: 'r',
    realFaceInput: false, referenceImagePaths: ['images/scene-4.png'], prompt: 'x', previz: { ...previz, handoff: 'frame_and_prompt' } } } };
  assert.throws(() => scenePlan(api), /must be reference_video/);
});

test('a previz cut rides the reference route as Video 1 and bills input + output seconds', () => {
  const previz = { renderer: 'blender', clip: 'previz/s4.mp4', firstFrame: 'previz/s4-f0001.png', sha256: 'a'.repeat(64), fps: 24, seconds: 5, camera: { movement: 'arc shot' } };
  const base = { engine: 'seedance', modelPurpose: 'previz', modelReason: 'The orbit must end on the sentence',
    realFaceInput: false, referenceImagePaths: ['images/scene-4.png', 'characters/porter/body.png'], previz };
  const shot = { type: 'cover', duration: 5, visual: { bg: 'images/scene-4.png', video: { prompt: 'x', ...base } } };
  const plan = scenePlan(shot);
  assert.equal(plan.tool, 'seedance_reference');
  assert.equal(plan.model, 'dreamina-seedance-2-0-260128');
  assert.deepEqual(plan.referenceVideoPaths, ['previz/s4.mp4']);
  assert.equal(plan.priceKey, 'seedance.2-0-video.1080p');
  assert.equal(plan.billedSeconds, 10);
  assert.equal(priceOf('seedance_reference', { model: plan.model, resolution: plan.resolution, durationSeconds: plan.durationSeconds,
    referenceVideoUrls: ['https://host/previz.mp4'] }).key, plan.priceKey);
  // The clip is rendered at the billed length — a 4.2 s cut bills 5 s, so a 5 s previz fits and a 4 s one is refused.
  assert.equal(scenePlan({ ...shot, duration: 4.2 }).billedSeconds, 10);
  assert.throws(() => scenePlan({ ...shot, visual: { ...shot.visual, video: { ...shot.visual.video, previz: { ...previz, seconds: 4 } } } }), /must equal the billed length/);
  // Image 1 is the source still; the reference lane carries no end frame; the field needs its purpose.
  assert.throws(() => scenePlan({ ...shot, visual: { ...shot.visual, video: { ...shot.visual.video, referenceImagePaths: ['characters/porter/body.png'] } } }), /referenceImagePaths\[0\]/);
  assert.throws(() => scenePlan({ ...shot, visual: { ...shot.visual, video: { ...shot.visual.video, lastImagePath: 'images/scene-4-end.png' } } }), /no end frame/);
  assert.throws(() => scenePlan({ ...shot, visual: { ...shot.visual, video: { ...shot.visual.video, modelPurpose: 'reference' } } }), /modelPurpose:"previz"/);
  assert.throws(() => scenePlan({ ...shot, visual: { ...shot.visual, video: { ...shot.visual.video, previz: { ...previz, fps: 23.976 } } } }), /24–60/);
  for (const clip of ['/abs/s4.mp4', '../s4.mp4', 'previz/../../x.mp4'])
    assert.throws(() => scenePlan({ ...shot, visual: { ...shot.visual, video: { ...shot.visual.video, previz: { ...previz, clip } } } }), /no absolute path, no \.\./);
  // More than nine reference images escalates to 2.5, whose with-video rows are priced too.
  const many = scenePlan({ ...shot, visual: { ...shot.visual, video: { ...shot.visual.video,
    referenceImagePaths: ['images/scene-4.png', ...Array(10).fill('characters/porter/body.png')] } } });
  assert.equal(many.model, 'dreamina-seedance-2-5-260628');
  assert.equal(many.priceKey, 'seedance.2-5-video.1080p');
  assert.equal(many.billedSeconds, 10);
  // A previz belongs to a motion background only — the checkers and the approval page read visual.video.previz.
  assert.throws(() => scenePlan({ type: 'quote', duration: 6, visual: { bg: 'images/scene-4.png', clip: { ...base, prompt: 'x',
    previz: { ...previz, seconds: 6 } } } }), /motion-background/);
});
