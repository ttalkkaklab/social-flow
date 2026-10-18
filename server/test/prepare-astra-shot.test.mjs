import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { manageSpeech } from '../dist/speech.js';

const require = createRequire(import.meta.url);
const { prepare, motionPrompt, motionTimeline } = require('../../skills/produce/references/prepare-astra-shot.js');
const { sceneVideoPrompt } = require('../../skills/_shared/scene-acting.js');
const ff = args => execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-y', ...args], { timeout: 30000 });
test('prompt compaction removes repeated endpoints and actions without losing intermediate states', () => {
  const before = 'She stands outside holding the tray.', after = 'The tray rests on the desk.', action = 'She places the tray once.';
  const prompt = sceneVideoPrompt([{ kind: 'action', character: 'woman', text: action,
    startSeconds: 0, endSeconds: 4 }], 'voiceover', { shot: { videoDesign: { before, action, after,
    motion: { beats: [{ state: before }, { state: 'Her hands touch the desktop.' }, { state: after }] } } } });
  for (const state of [before, after, action]) assert.equal(prompt.split(state).length - 1, 1);
  assert.match(prompt, /Her hands touch the desktop/);
});
test('ASTRA wording retains ordered motion and audio intervals without screenplay labels or literal dialogue', () => {
  const scene = { shot: { videoDesign: { before: 'A woman stands outside.', action: 'She keeps the door open.', after: 'She remains outside.',
    continuity: 'The same door stays open.', motion: { beats: [{ at: 1, state: 'Her hand touches the tray.' }] } } },
    visual: { camera: { movement: 'static', framing: 'Medium doorway view.', end: 'Keep the threshold visible.' } } };
  const prompt = motionPrompt(scene, { mode: 'audio_conditioned', performance: [
    { kind: 'action', character: 'woman', text: 'She raises the tray once.', startSeconds: 0, endSeconds: 1 },
    { kind: 'dialogue', speaker: 'woman', to: 'uncle', delivery: 'on_screen', text: 'Exact dialogue.',
      speechStartSeconds: 1.2, speechEndSeconds: 2.4, acting: { direction: 'Casual and guarded.', visual: 'She conceals alarm.' } },
  ] });
  for (const content of ['raises the tray once', '1.2 to 2.4 seconds', 'woman speaks naturally to uncle',
    'Casual and guarded', 'conceals alarm', 'same door stays open', 'camera stays fixed', 'Keep the threshold visible'])
    assert.ok(prompt.includes(content), content);
  assert.doesNotMatch(prompt, /Beat \d|before:|speaker:|Exact dialogue/);
  const warnings = motionTimeline(scene, { performance: [{ kind: 'action', text: 'She raises the tray once.' }] }).warnings;
  assert.ok(warnings.some(message => message.includes('She keeps the door open')));
  assert.ok(warnings.some(message => message.includes('Her hand touches the tray')));
});

test('resolved four-second action excludes stale eight-second design timing with visible warnings', () => {
  const scene = { duration: 4, shot: { videoDesign: {
    before: 'She holds a tray at the doorway.', action: 'Approach over the first four seconds, then lower the tray.',
    after: 'The tray rests on the desk.', motion: { beats: [
      { at: 4, state: 'She still holds the tray above the desktop.' },
      { at: 6.5, state: 'She releases her hands.' }, { at: 8, state: 'The tray rests on the desk.' },
    ] },
  } } };
  const plan = { performance: [{ kind: 'action', videoDirection: 'Walk for two seconds and release the tray by 3.5 seconds.',
    startSeconds: 0, endSeconds: 4 }] };
  const prompt = motionPrompt(scene, plan), timeline = motionTimeline(scene, plan);
  assert.match(prompt, /From 0 to 4 seconds, Walk for two seconds/);
  assert.match(prompt, /shot finishes with this state and holds it until the cut: The tray rests/);
  assert.doesNotMatch(prompt, /first four|still holds|At 6.5|At 8/);
  assert.ok(timeline.warnings.some(message => message.includes('6.5s falls outside')));
  assert.ok(timeline.warnings.some(message => message.includes('8s falls outside')));
  assert.ok(timeline.warnings.some(message => message.includes('still holds the tray')));
});

test('one fully concurrent audio-conditioned line omits redundant numeric spans without changing the plan', () => {
  const scene = { visual: { camera: { movement: 'static' } } };
  const plan = { mode: 'audio_conditioned', performance: [
    { kind: 'action', text: 'He holds the receiver still.', startSeconds: .12, endSeconds: 2.76 },
    { kind: 'dialogue', speaker: 'uncle', delivery: 'on_screen', text: 'Private script.',
      speechStartSeconds: .12, speechEndSeconds: 2.76 },
  ] };
  const before = JSON.stringify(plan), prompt = motionPrompt(scene, plan);
  assert.equal(prompt.split('During the supplied spoken line,').length - 1, 2);
  assert.doesNotMatch(prompt, /0\.12|2\.76|From .*seconds|Private script/);
  assert.match(prompt, /He holds the receiver still/);
  assert.match(prompt, /Match visible lip movements to the supplied audio/);
  assert.match(prompt, /All surfaces stay unlettered/);
  assert.equal(JSON.stringify(plan), before);
});

test('sequential, partly overlapping, offscreen and multiple spoken intervals retain exact timing', () => {
  const line = { kind: 'dialogue', speaker: 'uncle', delivery: 'on_screen', speechStartSeconds: .12, speechEndSeconds: 2.76 };
  for (const performance of [
    [{ kind: 'action', text: 'Look back first.', startSeconds: 0, endSeconds: .12 }, line],
    [line, { kind: 'action', text: 'React after speaking.', startSeconds: 2.76, endSeconds: 3 }],
    [{ kind: 'action', text: 'Hold a pose through the lead-in.', startSeconds: 0, endSeconds: 2.76 }, line],
    [{ ...line, delivery: 'off_screen' }],
    [line, { ...line, speechStartSeconds: 3, speechEndSeconds: 4 }],
  ]) {
    const prompt = motionPrompt({}, { mode: 'audio_conditioned', performance });
    assert.match(prompt, /From 0.12 to 2.76 seconds/);
    assert.doesNotMatch(prompt, /During the supplied spoken line/);
    if (performance.length === 2 && performance[1].speechStartSeconds === 3)
      assert.match(prompt, /From 3 to 4 seconds/);
  }
  assert.match(motionPrompt({}, { mode: 'voiceover', performance: [line] }), /From 0.12 to 2.76 seconds/);
});

test('design-only action keeps in-range intermediate states and reports impossible timestamps', () => {
  const scene = { duration: 4, shot: { videoDesign: { action: 'Lower the tray once.', motion: { beats: [
    { at: 2, state: 'Hands still support the tray.' }, { at: 6, state: 'Release the tray.' },
  ] } } } };
  const plan = { performance: [] };
  assert.match(motionPrompt(scene, plan), /Lower the tray once.*At 2 seconds, Hands still support/);
  assert.doesNotMatch(motionPrompt(scene, plan), /At 6 seconds/);
  assert.ok(motionTimeline(scene, plan).warnings.some(message => message.includes('Release the tray')));
});
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

test('image handoff preserves HQ controls and default-tier LoRA strength', async t => {
  const { dir, scene, save } = fixture(t);
  Object.assign(scene.visual.video, { tier: 'hq', resolution: '1024x1920', guidance: { videoCfgGuidanceScale: 4 },
    negativePrompt: 'blur', numInferenceSteps: 15, generateAudio: false });
  save();
  const result = await prepare(dir, { shotId: scene.id });
  for (const key of ['tier', 'guidance', 'negativePrompt', 'numInferenceSteps', 'generateAudio'])
    assert.deepEqual(result.arguments[key], scene.visual.video[key]);
  assert.equal(result.arguments.width, 1024);
  assert.equal(result.arguments.height, 1920);
  delete scene.visual.video.guidance;
  delete scene.visual.video.negativePrompt;
  delete scene.visual.video.numInferenceSteps;
  Object.assign(scene.visual.video, { tier: 'default', lora: [{ name: 'cinemagraph', strength: .6 }], numGeneratedKeyframes: 2 });
  save();
  const basic = await prepare(dir, { shotId: scene.id });
  assert.deepEqual(basic.arguments.lora, scene.visual.video.lora);
  assert.equal(basic.arguments.numGeneratedKeyframes, 2);
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
