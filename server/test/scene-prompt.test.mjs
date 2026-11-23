import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scenePromptProfile, referenceLabel } from '../dist/scene-prompt-profile.js';
import { sceneTimelineWords } from '../dist/scene-prompt.js';

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
