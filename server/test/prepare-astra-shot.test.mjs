import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { manageSpeech } from '../dist/speech.js';

const require = createRequire(import.meta.url);
const { prepare, motionPrompt } = require('../../skills/produce/references/prepare-astra-shot.js');
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
    'Casual and guarded', 'conceals alarm', 'hand touches the tray', 'same door stays open', 'camera stays fixed',
    'She keeps the door open', 'Keep the threshold visible'])
    assert.ok(prompt.includes(content), content);
  assert.doesNotMatch(prompt, /Beat \d|before:|speaker:|Exact dialogue/);
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
  save();
  const result = await prepare(dir, { shotId: 's0001' });
  assert.equal(result.arguments.numFrames, 89);
  assert.ok(result.requestedSeconds >= 3.7);
  assert.ok(result.warnings.some(message => message.includes('Stored numFrames')));
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
