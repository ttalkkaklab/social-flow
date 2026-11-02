import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { manageSpeech } from '../dist/speech.js';

const require = createRequire(import.meta.url);
const { prepare } = require('../../skills/produce/references/prepare-astra-shot.js');
const ff = args => execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-y', ...args], { timeout: 30000 });
function fixture(t, onScreen = false) {
  const dir = mkdtempSync(path.join(tmpdir(), 'astra-shot-input-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  ff(['-f', 'lavfi', '-i', 'color=red:s=128x128', '-frames:v', '1', path.join(dir, 'start.png')]);
  const audio = path.join(dir, 'speech.wav');
  ff(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.5', '-ac', '2', audio]);
  const scene = { id: 's0001', type: 'points', scene: 1, duration: 25 / 24, narration: [],
    performance: [{ kind: 'action', character: 'woman', text: 'She holds the tray steady.', durationSeconds: 1 }],
    shot: { render: { mode: 'generated_video' }, videoDesign: {
      look: 'realistic', before: 'The woman stands outside the doorway holding a tray.',
      action: 'She holds the tray steady.', after: 'She still stands outside with the tray.' } },
    visual: { bg: 'start.png', camera: { movement: 'static', framing: 'Medium view.', end: 'Same framing.' },
      video: { engine: 'astra', resolution: '128x128', numFrames: 25, frameRate: 24,
        prompt: 'Obsolete prompt: walk into the room.' } } };
  const win = { STORY: { version: 'story-v2' }, SB_DOC: { characters: [{ id: 'woman',
    tts: { engine: 'gemini', voiceId: 'Kore', language: 'ko', speed: 1 } }] }, SCENES: [scene] };
  if (onScreen) {
    scene.narration = [{ id: 'line-1', speaker: 'woman', delivery: 'on_screen', tts: 'Hello' }];
    scene.performance = [{ kind: 'action', character: 'woman', text: 'She holds the tray steady.', withGroup: 1 },
      { kind: 'dialogue', character: 'woman', group: 1 }];
  }
  const save = () => writeFileSync(path.join(dir, 'scenes.js'), Object.entries(win)
    .map(([key, value]) => `window.${key}=${JSON.stringify(value)};`).join('\n'));
  save();
  if (onScreen) {
    const listing = manageSpeech({ path: dir, action: 'list' });
    manageSpeech({ path: dir, action: 'attach_audio', lineId: 'line-1', expectedRevision: listing.revision,
      audioPath: audio, generation: { generator: 'tts_generate', language: 'ko', text: 'Hello',
        voiceSettings: { voiceName: 'Kore', speed: 1 } } });
  }
  return { dir, win, scene, save, audio };
}

test('audio handoff uses the resolved whole-shot prompt and exactly one authored opening', async t => {
  const { dir, audio } = fixture(t, true);
  const before = readFileSync(path.join(dir, 'scenes.js'), 'utf8');
  const result = await prepare(dir, { shotId: 's0001', audioPath: audio });
  assert.equal(result.tool, 'astra_audio2video');
  assert.equal(result.arguments.imagePath, path.join(dir, 'start.png'));
  assert.equal(result.arguments.audioPath, audio);
  assert.equal(result.arguments.expectLipSync, true, 'every line is on screen, so the speech sync check runs');
  assert.match(result.arguments.negativePrompt, /subtitles, captions/);
  assert.match(result.arguments.prompt, /outside the doorway/);
  assert.match(result.arguments.prompt, /She holds the tray steady/);
  assert.doesNotMatch(result.arguments.prompt, /Obsolete prompt|walk into the room|Hello/);
  assert.equal(result.arguments.lastFramePath, undefined);
  assert.match(result.source.sha256, /^[a-f0-9]{64}$/);
  assert.equal(result.review, 'not_reviewed');
  assert.equal(readFileSync(path.join(dir, 'scenes.js'), 'utf8'), before);
});

test('silent action uses first/last image inputs and refuses an action-truncating request', async t => {
  const { dir, scene, save } = fixture(t);
  scene.visual.frames = { end: 'start.png' }; save();
  const result = await prepare(dir, { shotId: 's0001' });
  assert.equal(result.tool, 'astra_img2video');
  assert.equal(result.arguments.firstFramePath, path.join(dir, 'start.png'));
  assert.equal(result.arguments.lastFramePath, path.join(dir, 'start.png'));
  assert.equal(result.arguments.audioPath, undefined);
  assert.equal(result.arguments.negativePrompt, undefined, 'generate mode cannot receive negative_prompt');
  scene.performance[0].durationSeconds = 2; save();
  await assert.rejects(prepare(dir, { shotId: 's0001' }), /truncate the planned action/);
  scene.performance[0].durationSeconds = 1; scene.visual.reuse = { clip: 'old.mp4' }; save();
  await assert.rejects(prepare(dir, { shotId: 's0001' }), /do not switch or regenerate/);
});

test('on-screen handoff refuses mono or truncated sound without inventing an endpoint input', async t => {
  const { dir, audio } = fixture(t, true);
  const mono = path.join(dir, 'mono.wav'), long = path.join(dir, 'long.wav');
  ff(['-i', audio, '-ac', '1', mono]);
  await assert.rejects(prepare(dir, { shotId: 's0001', audioPath: mono }), /stereo/);
  ff(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-ac', '2', long]);
  await assert.rejects(prepare(dir, { shotId: 's0001', audioPath: long }), /truncate/);
  const win = require('../../skills/_shared/scenes-vm.js').evaluateWindowScript(readFileSync(path.join(dir, 'scenes.js'), 'utf8'));
  win.SCENES[0].visual.frames = { end: 'start.png' };
  writeFileSync(path.join(dir, 'scenes.js'), Object.entries(win).map(([k, v]) => `window.${k}=${JSON.stringify(v)};`).join('\n'));
  const result = await prepare(dir, { shotId: 's0001', audioPath: audio });
  assert.equal(result.arguments.lastFramePath, undefined);
  assert.ok(result.warnings.some(message => message.includes('no last-image input')));
});

test('new ASTRA requests discard oversized stored frames and include edit coverage', async t => {
  const { dir, scene, save } = fixture(t);
  scene.duration = 3.2;
  scene.visual.video.numFrames = 193;
  scene.edit = { in: .5, pre: 0, post: .12 };
  scene.shot.videoDesign.motion = { beats: [{ at: 8, state: 'A stale delayed action.' }] };
  save();
  const result = await prepare(dir, { shotId: 's0001' });
  assert.equal(result.arguments.numFrames, 89);
  assert.ok(result.requestedSeconds >= 3.7);
  assert.ok(result.warnings.some(message => message.includes('Stored numFrames')));
  assert.ok(result.warnings.some(message => message.includes('8s falls outside')));
  assert.doesNotMatch(result.arguments.prompt, /stale delayed action/);
  assert.equal(result.quote.quantity, result.requestedSeconds);
});

test('audio-conditioned source trim cannot silently remove speech', async t => {
  const { dir, audio } = fixture(t, true);
  const file = path.join(dir, 'scenes.js');
  const win = require('../../skills/_shared/scenes-vm.js').evaluateWindowScript(readFileSync(file, 'utf8'));
  win.SCENES[0].edit = { in: .5 };
  writeFileSync(file, Object.entries(win).map(([key, value]) => `window.${key}=${JSON.stringify(value)};`).join('\n'));
  await assert.rejects(prepare(dir, { shotId: 's0001', audioPath: audio }), /source trimming/);
});

test('measured planner returns final billing quantity after margins cross an integer boundary', async t => {
  const { dir, scene, audio, save } = fixture(t);
  scene.duration = 3.9; save();
  ff(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=3.9', '-ac', '2', audio]);
  const { plan } = require('../../skills/produce/references/plan-video-duration.js');
  const result = await plan(dir, { shotId: 's0001', tool: 'seedance_img2video', audioPath: audio });
  assert.equal(result.arguments.durationSeconds, 5);
  assert.equal(result.quote.quantity, 5);
});

test('authored intermediate contact frame selects keyframe adapter and pins final optimized frame', async t => {
  const { dir, scene, save } = fixture(t);
  scene.duration = 3.2;
  scene.edit = { in: .5, pre: 0, post: .12 };
  scene.visual.frames = { mode: 'first_last', end: 'start.png', keyframes: [
    { atSeconds: 1, image: 'start.png', state: 'Tray contacts desk while both hands still grip.', strength: .95 },
    { atSeconds: 1.5, image: 'start.png', state: 'Hands begin release.' },
  ] }; save();
  const result = await prepare(dir, { shotId: 's0001' });
  assert.equal(result.tool, 'astra_keyframe_video');
  assert.equal(result.arguments.numFrames, 89);
  assert.deepEqual(result.arguments.images.map(image => image.frameIdx), [0, 24, 36, 88]);
  assert.equal(result.arguments.images[1].strength, .95);
  assert.equal(result.arguments.generateAudio, false);
  assert.equal(result.arguments.firstFramePath, undefined);
  assert.equal(result.keyframes[1].state, 'Tray contacts desk while both hands still grip.');
  assert.match(result.keyframes[1].sha256, /^[a-f0-9]{64}$/);
  assert.equal(result.quote.quantity, result.requestedSeconds);
});

test('intermediate frames reject out-of-shot times, duplicate frame slots, missing files and excess count', async t => {
  const { dir, scene, save } = fixture(t);
  for (const keys of [
    [{ atSeconds: 0, image: 'start.png' }], [{ atSeconds: 2, image: 'start.png' }],
    [{ atSeconds: .001, image: 'start.png' }],
    [{ atSeconds: .5, image: 'start.png' }, { atSeconds: .51, image: 'start.png' }],
    [{ atSeconds: .7, image: 'start.png' }, { atSeconds: .5, image: 'start.png' }],
    [{ atSeconds: .5, image: 'missing.png' }],
    Array.from({length: 7}, (_, i) => ({ atSeconds: .1 + i / 10, image: 'start.png' })),
  ]) {
    scene.visual.frames = { mode: 'first_last', end: 'start.png', keyframes: keys }; save();
    await assert.rejects(prepare(dir, { shotId: 's0001' }));
  }
});

test('audio-conditioned shots refuse silently dropping authored intermediate constraints', async t => {
  const { dir, audio } = fixture(t, true);
  const file = path.join(dir, 'scenes.js');
  const win = require('../../skills/_shared/scenes-vm.js').evaluateWindowScript(readFileSync(file, 'utf8'));
  win.SCENES[0].visual.frames = { mode: 'first_last', end: 'start.png', keyframes: [{ atSeconds: .2, image: 'start.png' }] };
  writeFileSync(file, Object.entries(win).map(([k, v]) => `window.${k}=${JSON.stringify(v)};`).join('\n'));
  await assert.rejects(prepare(dir, { shotId: 's0001', audioPath: audio }), /does not support intermediate keyframes/);
});

test('renderer dispatches prepared keyframes to their own adapter and rejects unknown tools before generation', async () => {
  const { submitPrepared } = require('../../skills/produce/references/render-astra-shot.js');
  const calls = [];
  const parse = args => ({ ...args, validated: true });
  const client = {
    astraKeyframeVideoSchema: { parse }, astraImg2VideoSchema: { parse }, astraAudio2VideoSchema: { parse },
    generateFromKeyframes: args => { calls.push(['keyframe', args]); return 'candidate'; },
    generateFromImage: args => { calls.push(['image', args]); },
    generateFromAudio: args => { calls.push(['audio', args]); },
  };
  const args = { images: [{ frameIdx: 0 }, { frameIdx: 24 }, { frameIdx: 48 }] };
  assert.equal(await submitPrepared(client, 'astra_keyframe_video', args), 'candidate');
  assert.deepEqual(calls, [['keyframe', { ...args, validated: true }]]);
  await assert.rejects(submitPrepared(client, 'unknown', args), /Unsupported prepared ASTRA tool/);
  assert.equal(calls.length, 1);
});

test('keyframe handoff carries guided controls and rejects unsupported tier instead of dropping it', async t => {
  const { dir, scene, save } = fixture(t);
  scene.visual.frames = { mode: 'first_last', end: 'start.png', keyframes: [{ atSeconds: .5, image: 'start.png' }] };
  Object.assign(scene.visual.video, { guidance: { videoCfgGuidanceScale: 3 }, numInferenceSteps: 12, generateAudio: false });
  save();
  const result = await prepare(dir, { shotId: scene.id });
  assert.equal(result.tool, 'astra_keyframe_video');
  assert.deepEqual(result.arguments.guidance, { videoCfgGuidanceScale: 3 });
  assert.equal(result.arguments.numInferenceSteps, 12);
  assert.equal(result.arguments.generateAudio, false);
  scene.visual.video.tier = 'hq'; save();
  await assert.rejects(prepare(dir, { shotId: scene.id }), /tier is not supported by keyframe/);
});

test('audio handoff forwards controls and rejects unsupported LoRA without editing the board', async t => {
  const { dir, audio } = fixture(t, true);
  const file = path.join(dir, 'scenes.js');
  const win = require('../../skills/_shared/scenes-vm.js').evaluateWindowScript(readFileSync(file, 'utf8'));
  const video = win.SCENES[0].visual.video;
  const save = () => writeFileSync(file, Object.entries(win).map(([k, v]) => `window.${k}=${JSON.stringify(v)};`).join('\n'));
  Object.assign(video, { guidance: { a2vGuidanceScale: 3 }, numInferenceSteps: 20, generateAudio: false }); save();
  const before = readFileSync(file, 'utf8');
  const result = await prepare(dir, { shotId: 's0001', audioPath: audio });
  assert.deepEqual(result.arguments.guidance, { a2vGuidanceScale: 3 });
  assert.equal(result.arguments.numInferenceSteps, 20);
  assert.equal(result.arguments.generateAudio, false);
  assert.equal(readFileSync(file, 'utf8'), before);
  video.lora = ['slow-motion']; save();
  await assert.rejects(prepare(dir, { shotId: 's0001', audioPath: audio }), /lora is not supported by audio2video/);
});

test('keyframe sound planning distinguishes authored mute from legacy defaults, including empty effects', async t => {
  const {dir,scene,save}=fixture(t);
  scene.visual.frames={mode:'first_last',end:'start.png',keyframes:[{atSeconds:.5,image:'start.png'}]};
  for(const effects of [[],[{delivery:'auto',description:'Tray clack',trigger:'At desk contact'}],[{delivery:'native',description:'Tray clack',trigger:'At desk contact'}]]) {
    scene.sound={audioSource:'video',effects};save();
    const result=await prepare(dir,{shotId:scene.id});
    assert.equal(result.arguments.generateAudio,true);assert.equal(result.soundPlan.sound.audioSource,'video');
  }
  scene.sound={effects:[{delivery:'auto',description:'Tray clack',trigger:'At desk contact'}]};save();
  assert.equal((await prepare(dir,{shotId:scene.id})).soundPlan.sound.effects[0].delivery,'native');
  scene.visual.video.generateAudio=false;scene.sound={audioSource:'video',effects:[]};save();
  await assert.rejects(prepare(dir,{shotId:scene.id}),/silent output/);
});
