import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildSceneWire, parseSceneCapabilities, sceneRequestIssues, SCENE_LIMITS } from '../dist/genai-scene.js';
import { png } from './workflow-fixture.mjs';

// The keys every gateway returns. One deployed before 2026-11-24 reports no limits and no seed.
const deployed = {version:1, execution:'per_shot', transitions:['hard_cut']};

function scene(t, shots) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'genai-scene-')));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file = name => { const target = path.join(dir,name); fs.writeFileSync(target,png); return target; };
  let cursor = 0;
  const cards = shots.map(({frames,references=[],voiced=[]},i) => {
    const card = {shotId:'s'+i, startFrame:cursor, endFrame:cursor+frames, transition:i ? 'hard_cut' : 'open', framing:'Eye level.', action:'Hold.',
      references, dialogue:voiced.map(speaker => ({lineId:speaker+i, speaker, delivery:'on_screen', text:'Hello.', voice:{path:file(speaker+'.wav')}}))};
    cursor += frames;
    return card;
  });
  return {sceneNo:1, prompt:'Hold.', fps:24, frameCount:cursor, shotIds:cards.map(card => card.shotId), cuts:[],
    shots:cards.map(({references:_references,...card}) => card),
    images:cards.flatMap(card => [{shotId:card.shotId, role:'start', frame:card.startFrame, path:file(card.shotId+'.png')},
      ...card.references.map((role,i) => ({shotId:card.shotId, role, frame:card.startFrame, character:'c'+i, path:file(card.shotId+'-'+i+'.png')}))])};
}

test('a gateway that reports no limits keeps the reference slots planning already checks', () => {
  const old = parseSceneCapabilities(deployed);
  assert.deepEqual(old.limits, SCENE_LIMITS);
  assert.deepEqual([old.motionPrefix, old.timedDialogue, old.audioModes, old.seedModes], [false, null, {}, []]);
  const current = parseSceneCapabilities({...deployed, motion_prefix:true, timed_dialogue:'supplied_performance',
    scene_audio_modes:{mix:'ltx-2.5-22b-distilled'}, seed:['msr'], voice_binding:'speaker',
    limits:{shots:{min:2,max:48}, shot_frames:{max:241}, references:{subjects:3,backgrounds:1}, voice:{speakers_per_shot:1,max_seconds:10}}});
  assert.deepEqual(current.limits, {subjects:3, backgrounds:1, voiceSpeakers:1, shots:{min:2,max:48}, shotFrames:241});
  assert.deepEqual([current.motionPrefix, current.timedDialogue, current.seedModes], [true, 'supplied_performance', ['msr']]);
  // A key this client cannot read counts as absent; the three keys of version 1 stay required.
  assert.deepEqual(parseSceneCapabilities({...deployed, limits:'many', seed:true}).limits, SCENE_LIMITS);
  assert.throws(() => parseSceneCapabilities({...deployed, version:2}));
  assert.throws(() => parseSceneCapabilities({...deployed, execution:null}));
});

test('a scene outside the advertised limits is named by shot before anything is uploaded', t => {
  const fits = scene(t, [{frames:240, references:['face','outfit','location'], voiced:['anna','ben']}, {frames:361}]);
  assert.deepEqual(sceneRequestIssues(fits, parseSceneCapabilities(deployed)), []);
  const tight = parseSceneCapabilities({...deployed, limits:{shot_frames:{max:241}, references:{subjects:1,backgrounds:0}, voice:{speakers_per_shot:1}}});
  assert.deepEqual(sceneRequestIssues(fits, tight).map(issue => issue.split(':')[0]),
    ['s0@0 references', 's0@0 voice', 's1@240 length']);
  // The shot count is the gateway's to refuse until it reports the range.
  const single = scene(t, [{frames:48}]);
  assert.deepEqual(sceneRequestIssues(single, parseSceneCapabilities(deployed)), []);
  assert.match(sceneRequestIssues(single, parseSceneCapabilities({...deployed, limits:{shots:{min:2,max:32}}}))[0], /^scene 1: 1 shots/);
});

test('a shot seed reaches the body only where the gateway takes one for that render mode', async t => {
  const request = scene(t, [{frames:48, references:['face']}, {frames:48}]);
  const bindings = [{shotId:'s0', seed:7}, {shotId:'s1', seed:9}];
  const model = 'ltx-2.5-22b-distilled';
  const plain = await buildSceneWire(request, model, '720p');
  assert.ok(plain.body.shots.every(shot => !('seed' in shot)));
  const seeded = await buildSceneWire(request, model, '720p', false, bindings);
  assert.deepEqual(seeded.body.shots.map(shot => shot.seed), [7, 9]);
  const {seed:_first, ...first} = seeded.body.shots[0];
  assert.equal(JSON.stringify(first), JSON.stringify(plain.body.shots[0]));

  const seedIssues = caps => sceneRequestIssues(request, parseSceneCapabilities({...deployed, ...caps}), {bindings}).map(issue => issue.split(':')[0]);
  assert.deepEqual(seedIssues({}), ['s0@0 seed', 's1@48 seed']);
  assert.deepEqual(seedIssues({seed:['msr']}), ['s1@48 seed']);
  assert.deepEqual(seedIssues({seed:['generate','msr']}), []);
  // A dev scene whose track drives the picture renders every shot as audio2video.
  const driven = {...request, audio:{path:'/unused.wav', startFrame:0, endFrame:96, cues:[]}};
  assert.equal(sceneRequestIssues(driven, parseSceneCapabilities({...deployed, seed:['msr','generate']}), {bindings, model:'ltx-2.5-22b-dev'}).length, 2);
});
