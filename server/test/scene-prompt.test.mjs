import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scenePromptProfile, referenceLabel } from '../dist/scene-prompt-profile.js';
import { sceneTimelineWords, scenePromptSlots, resolveScenePrompt, scenePromptTemplate } from '../dist/scene-prompt.js';

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

test('an authored prompt takes the numbers of the submitted references and is otherwise left alone', () => {
  const images = [
    {number:1, owner:'mi-ran', role:'face', id:'s1-mi-ran-face'}, {number:2, owner:'mi-ran', role:'outfit', id:'coat'},
    {number:3, owner:'jun', role:'face', id:'s1-jun-face'}, {number:4, id:'hallway', role:'background'},
    {number:10, shotId:'s1', id:'start', guide:true}, {shotId:'s2', id:'s2-composition', guide:true}];
  const voices = [{speaker:'mi-ran', audioIndex:1}, {speaker:'jun', audioIndex:2}, {speaker:'caller'}];
  const named = scenePromptSlots('indexed', images, voices);
  assert.deepEqual(Object.fromEntries(named.slots.map(slot => [slot.key, slot.label])), {
    'mi-ran.face':'Image 1', 'mi-ran.outfit':'Image 2', 'jun.face':'Image 3', 'jun.image':'Image 3',
    'hallway.image':'Image 4', 's1.image':'Image 10', 'mi-ran.voice':'Audio 1', 'jun.voice':'Audio 2'});
  assert.deepEqual(named.unlabeled, ['s2.image']);

  const own = '{mi-ran.face} in {mi-ran.outfit} turns in {hallway.image}; {jun.image} answers with {jun.voice}: "가자."  Open on {s1.image}. {mi-ran.voice}';
  const sent = resolveScenePrompt(own, named, {lines:['가자.'], limit:200});
  assert.equal(sent.prompt, 'Image 1 in Image 2 turns in Image 4; Image 3 answers with Audio 2: "가자."  Open on Image 10. Audio 1');
  assert.deepEqual(sent.issues, []);
  // Turning the numbers back into names gives the author's text again; "Image 10" is not read as "Image 1".
  assert.equal(scenePromptTemplate(sent.prompt, named).promptTemplate, own.replace('{jun.image}', '{jun.face}'));
  const label = (style, key) => scenePromptSlots(style, images, voices).slots.find(slot => slot.key === key).label;
  assert.equal(label('picture_audio_tags', 'mi-ran.face'), '<Picture 1>');
  assert.equal(label('at_indexed', 'jun.voice'), '@Audio 2');

  const codes = (prompt, checks) => resolveScenePrompt(prompt, named, checks).issues.map(issue => issue.level + ':' + issue.code).sort();
  assert.deepEqual(codes('{mi-ran.image} waits.'), ['error:placeholder_unresolved', ...Array(7).fill('warning:reference_unmentioned')].sort());
  assert.ok(codes('{s2.image}').includes('error:placeholder_unlabeled'));
  // A cast member whose id equals a shot id keeps the role name; the short name stays the shot picture's.
  const clash = scenePromptSlots('indexed', [{number:1, owner:'s2', role:'face'}, {shotId:'s2', guide:true}]);
  assert.deepEqual([clash.slots.map(slot => slot.key), clash.unlabeled], [['s2.face'], ['s2.image']]);
  // Braces are kept for names: anything else in them, and a brace without its pair, is refused.
  for (const wrong of ['{nobody.face}', '{mi-ran face}', '{}', '{mi-ran.face', 'mi-ran.face}', '{{mi-ran.face}}', '{jun.face} says "I {sigh}."', '{jun.face} says "I {sigh."'])
    assert.ok(codes(wrong).includes('error:placeholder_unresolved'), wrong);
  // A spoken line keeps its words. Its numbers are speech, and braces the planner's own prompt carries are the board's.
  const spoken = 'Image 3 says "Image 1 {sigh} {jun.face}" in KeyImage 1 for Image 1.5 s, twice Image 3';
  const kept = resolveScenePrompt(spoken, named, {composed:'x "Image 1 {sigh} {jun.face}"'});
  assert.equal(kept.prompt, spoken);
  assert.deepEqual(kept.issues.filter(issue => issue.code !== 'reference_unmentioned').map(issue => issue.code + ' ' + issue.detail.slice(0, 9)), ['label_literal "Image 3"']);
  assert.equal(scenePromptTemplate(spoken, named).promptTemplate, spoken.replaceAll('Image 3', '{jun.face}'));
  // A stray quotation mark stays on its own line: the names after it are still filled in and turned back.
  const stray = 'A 5" plate.\n{jun.face} waits.';
  assert.equal(resolveScenePrompt(stray, named).prompt, 'A 5" plate.\nImage 3 waits.');
  assert.equal(scenePromptTemplate('A 5" plate.\nImage 3 waits by "the door".', named).promptTemplate, 'A 5" plate.\n{jun.face} waits by "the door".');
  assert.ok(codes(own, {lines:['가자.', '안 가.']}).includes('warning:line_missing'));
  assert.ok(codes(own, {sentences:[{code:'text_policy_missing', text:'No text.'}]}).includes('warning:text_policy_missing'));
  // A fixed header is counted and mentioned once, whether or not the author repeats it.
  const header = 'Opening frame:\njun (Image 3): By the door.\n\n';
  const headed = resolveScenePrompt('{mi-ran.face} waits.', named, {header, limit:header.length + 15});
  assert.deepEqual([headed.prompt, headed.body], [header + 'Image 1 waits.', 'Image 1 waits.']);
  assert.ok(!headed.issues.some(issue => issue.code === 'prompt_too_long' || issue.detail.includes('{jun.face}')));
  assert.equal(resolveScenePrompt(headed.prompt, named, {header}).prompt, headed.prompt);
  assert.ok(codes('{mi-ran.face} waits.', {header, limit:header.length + 13}).includes('error:prompt_too_long'));
  assert.deepEqual(scenePromptTemplate(headed.prompt, named, header), {promptTemplate:'{mi-ran.face} waits.', promptHeader:header});
  // The model's limit counts characters; the adapter's own schema counts UTF-16 units.
  assert.ok(!codes('{mi-ran.face} 😀😀', {limit:10, schemaLimit:12}).includes('error:prompt_too_long'));
  assert.ok(codes('{mi-ran.face} 😀😀', {limit:10, schemaLimit:11}).includes('error:prompt_too_long'));
  assert.ok(codes('{mi-ran.face} 😀😀', {limit:9, schemaLimit:12}).includes('error:prompt_too_long'));
});
