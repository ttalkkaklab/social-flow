import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scenePromptProfile, sceneWritingGuide, referenceLabel } from '../dist/scene-prompt-profile.js';
import { sceneTimelineWords, scenePromptSlots, resolveScenePrompt } from '../dist/scene-prompt.js';

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
});
