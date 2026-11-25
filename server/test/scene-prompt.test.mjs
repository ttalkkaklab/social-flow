import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { scenePromptProfile, sceneWritingGuide, referenceLabel, promptGuidance, referenceAdvice } from '../dist/scene-prompt-profile.js';
import { SceneEditGrammar } from '../dist/scene-edit-grammar.js';
import { sceneTimelineWords, scenePromptSlots, resolveScenePrompt, assertSceneDialogue } from '../dist/scene-prompt.js';

test('provider syntax preserves the shot, speaker and closing action with each quote', () => {
  const timeline = {fps:24, images:[], shots:[
    {shotId:'s1', startFrame:0, endFrame:36, transition:'open', action:'The guest holds the rail.',
      dialogue:[{speaker:'guest',delivery:'on_screen',text:'Look.'}], closingState:'Both hands clear the rail.'},
    {shotId:'s2', startFrame:36, endFrame:96, transition:'hard_cut', action:'The cart rolls.'},
  ]};
  for (const [tool, expected] of [['veo_img2video','[0–1.5s]'],['astra_genai_msr','Hold this view for about 1.5 seconds.'],['seedance_reference','The guest holds the rail.']]) {
    const words = sceneTimelineWords(timeline, {}, {modelFacing:true, modelPacedCuts:true, describeDelivery:true, cutTiming:scenePromptProfile(tool).cutTiming});
    const [opening, reaction] = words.split('\n');
    assert.ok(opening.startsWith(expected));
    assert.match(opening, /The guest holds the rail\..*"Look\." End on Both hands clear the rail\.$/);
    assert.match(reaction, /Then cut directly\..*The cart rolls\..*No foreground dialogue/);
    assert.equal(words.split('"Look."').length, 2);
  }
  assert.equal(referenceLabel('seedance_reference','image',2,'dreamina-seedance-2-5-flash-261115'),'@Image 2');
  assert.equal(referenceLabel('seedance_reference','audio',1,'dreamina-seedance-2-0-mini-260615'),'Audio 1');
});

test('model writers use the scene clock, reference dialect and supplied performance', async () => {
  const {scenePromptText} = await import('../dist/video-prompt.js');
  const scene = {emotion:'Relief.', action:'Mina releases the key.', sound:'The fan hums.'};
  const text = tool => scenePromptText(scene,'Medium on Mina.','Jun takes it.',[],false,scenePromptProfile(tool));
  assert.match(text('minimax_reference'), /Medium on Mina\.[\s\S]+Jun takes it\.[\s\S]+Environmental sound: The fan hums/);
  assert.match(text('fasth3_omni_reference'), /^Mina releases the key/);
  assert.match(text('veo_img2video'), /^Medium on Mina\.[\s\S]+Sound: The fan hums/);
  assert.match(sceneWritingGuide(scenePromptProfile('astra_genai_msr')), /face and voice/);
  assert.match(sceneWritingGuide(scenePromptProfile('heygen_reference')), /contained location/);
  const timeline = {fps:24,images:[],shots:[],audio:{cues:[{frame:24,action:'Jun looks up.'}]}};
  const profile = scenePromptProfile('ltx_api_audio2video');
  assert.match(sceneTimelineWords(timeline,scene,{modelFacing:true,writer:profile.writer}), /supplied recording[\s\S]+At 1 seconds: Jun looks up/);
});

test('two panels of the same role bind by asset identity across reorderings', () => {
  const bind = ids => scenePromptSlots('indexed',ids.map((id,i) => ({owner:'mina',id,role:'face',number:i+1})));
  const first = bind(['profile','frontal']), reversed = bind(['frontal','profile']);
  const draft = 'Use {mina.face-profile}.';
  assert.equal(resolveScenePrompt(draft,first).prompt,'Use Image 1.');
  assert.equal(resolveScenePrompt(draft,reversed).prompt,'Use Image 2.');
  assert.ok(resolveScenePrompt('Use {mina.face}.',reversed).issues.some(issue => issue.level === 'error'));
  assert.ok(resolveScenePrompt(draft,bind(['profile','profile'])).issues.some(issue => issue.code === 'placeholder_ambiguous'));
  // A cast id equal to a shot id never takes the name of that shot's own picture, which travels as a timed frame.
  const clash = scenePromptSlots('indexed', [{number:1, owner:'s2', role:'face'}, {shotId:'s2', guide:true}]);
  assert.deepEqual([clash.slots.map(slot => slot.key), clash.unlabeled], [['s2.face'], ['s2.image']]);
});

test('named clip ownership is independent of cast IDs and normalized cue whitespace', () => {
  const grammar = new SceneEditGrammar([{speaker:'hero',name:'Hero'}]);
  for (const cue of ['Track {hero.motion} AND  ITS {hero.soundtrack}', 'Track {hero.soundtrack} and its {hero.motion}', 'Follow the camera movement in {hero.motion}', 'Match the rhythm in {hero.soundtrack}', 'Hold on the latch'])
    assert.doesNotThrow(() => grammar.checkStageDirection(cue,true));
  for (const cue of ['Track {hero.motion} AND  ITS {wide.soundtrack}', 'Track {wide.soundtrack} and its {hero.motion}'])
    assert.throws(() => grammar.checkStageDirection(cue,true),/scene_media_owner/);
  for (const cue of ['Use {hero.soundtrack} for camera movement and motion timing','Track the camera move in {wide.soundtrack}',
    'Match the motion in {hero.soundtrack}','Follow the soundtrack in {hero.motion}','Hold on {hero.soundtrack}'])
    assert.throws(() => grammar.checkStageDirection(cue,true),/scene_media_type/);
});

test('guidance follows the model and reports each count outside the range its vendor recommends', () => {
  const [two, twoFive] = ['dreamina-seedance-2-0-fast-260128','dreamina-seedance-2-5-260628'].map(model => promptGuidance('seedance_reference', model));
  assert.notEqual(two.guide, twoFive.guide);
  assert.deepEqual([two.recommended.people, two.recommended.assets, twoFive.recommended.people, twoFive.recommended.voices, twoFive.recommended.voiceSeconds], [4, 5, 8, 5, [5, 10]]);
  for (const tool of ['seedance_reference','minimax_reference','fasth3_omni_reference','astra_genai_msr','astra_genai_img2video'])
    assert.ok(fs.existsSync(new URL('../../' + promptGuidance(tool).reference, import.meta.url)), tool);
  assert.deepEqual([promptGuidance('veo_img2video').reference, promptGuidance('seedance_reference').recommended], [undefined, undefined]);
  const codes = (ranges, counts) => referenceAdvice(ranges, counts).map(item => item.code);
  assert.deepEqual(codes(two.recommended, {people:4, assets:5}), []);
  assert.deepEqual(codes(two.recommended, {people:5, assets:6}), ['reference_people_over_recommended','reference_assets_over_recommended']);
  assert.deepEqual(codes(twoFive.recommended, {people:9, voices:6, voiceSeconds:[{speaker:'a',seconds:4.9},{speaker:'b',seconds:5},{speaker:'c',seconds:10.1}]}),
    ['reference_people_over_recommended','voice_subjects_over_recommended','voice_sample_length','voice_sample_length']);
  const local = promptGuidance('fasth3_omni_reference').recommended;
  assert.deepEqual([codes(local, {frames:345}), codes(local, {frames:362}), codes(undefined, {people:99})], [[], ['frames_over_reference_pipeline'], []]);
});

test('Seedance shots are numbered and an authored prompt keeps, drops or renumbers the label', () => {
  const shots = [
    {shotId:'s1', startFrame:0, endFrame:36, transition:'open', framing:'Medium shot.'},
    {shotId:'s2', startFrame:36, endFrame:96, transition:'hard_cut', framing:'Close on the latch.'}];
  const words = list => sceneTimelineWords({fps:24, images:[], shots:list}, {}, {modelFacing:true, modelPacedCuts:true, writer:'seedance', cutTiming:'action_beats'});
  assert.deepEqual(words(shots).split('\n'), ['Shot 1: Medium shot.', 'Shot 2: Close on the latch.']);
  assert.equal(words(shots.slice(0,1)), 'Medium shot.');
  const lines = [{speaker:'hero', tts:'Look.', delivery:'on_screen'}], cast = [{speaker:'hero', name:'Hero'}];
  const composed = 'Shot 1: Medium shot. hero: "Look."\nShot 2: Close on the latch.';
  for (const draft of [composed, 'Medium shot. hero: "Look."\nThen cut directly. Close on the latch.', 'Shot 1: Close on the latch.\nShot 2: hero: "Look."'])
    assert.doesNotThrow(() => assertSceneDialogue(draft, lines, cast, composed), draft);
  assert.throws(() => assertSceneDialogue('Shot 1: Medium shot. hero: "Look."\nShot 2: The latch explodes.', lines, cast, composed), /scene_direction_unverified/);
  // A prompt whose planner version has no numbered shots takes no typed label.
  const plain = 'Medium shot. hero: "Look."\nThen cut directly. Close on the latch.';
  assert.throws(() => assertSceneDialogue('Shot 1: Medium shot. hero: "Look."', lines, cast, plain), /scene_direction_unverified/);
});
