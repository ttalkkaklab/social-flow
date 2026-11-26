import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { checkSceneValidation, checkSceneVoices, genaiSceneBody, genaiSceneFrames, genaiSceneSchema, h3StepAdvice, resolveScenePrompt, sceneArgsFromComposed, sceneLabels } from '../dist/genai-scene.js';
import { videoCatalog } from '../dist/video-registry.js';

const sceneArgs = (overrides = {}) => genaiSceneSchema.parse({ model:'ltx-2.5-22b-distilled', resolution:'576x1024', reserveUsd:0,
  prompt:'{hero.face} waves.', cast:[{id:'hero', images:[{role:'face', imagePath:'/tmp/hero.png'}]}],
  shots:[{id:'s1', frames:57, imagePath:'/tmp/open.png'}, {id:'s2', frames:56}], ...overrides });

test('a composed request becomes named placeholders that the gateway numbers voiced cast first', () => {
  // The planner numbered a silent guest first and the speaking hero second; the gateway puts the voice in slot 1.
  const composed = {
    prompt:'Image 1: guest. Image 2: hero. Audio 2: hero\'s voice. hero (Image 2, Audio 2): "Look at Image 1 {here}."',
    references:[{imagePath:'/tmp/guest.png'}, {imagePath:'/tmp/hero.png', audioPath:'/tmp/hero.wav'}, {imagePath:'/tmp/room.png', background:true}],
    slots:[{key:'guest.face', label:'Image 1'}, {key:'guest.image', label:'Image 1'}, {key:'hero.face', label:'Image 2'}, {key:'hero.voice', label:'Audio 2'}, {key:'s1.image', label:'Image 3'}],
    script:['Look at Image 1 {here}.'], shots:[{id:'s1', frames:24, imagePath:'/tmp/open.png'}],
  };
  const {keys, ...projected} = sceneArgsFromComposed(composed);
  // Each planner number maps to the name the scene request uses for it.
  assert.deepEqual(keys.map(item => [item.label, item.key]), [['Image 1','guest.face'], ['Audio 2','hero.voice'], ['Image 2','hero.face'], ['Image 3','s1-ref1.image']]);
  // The background guide is named after its shot, which scene mode reserves for the shot itself.
  assert.deepEqual(projected.references, [{id:'s1-ref1', role:'background', imagePath:'/tmp/room.png'}]);
  assert.deepEqual(projected.cast, [{id:'guest', images:[{role:'face', imagePath:'/tmp/guest.png'}]},
    {id:'hero', images:[{role:'face', imagePath:'/tmp/hero.png'}], voicePath:'/tmp/hero.wav'}]);
  assert.equal(projected.prompt, '{guest.face}: guest. {hero.face}: hero. {hero.voice}: hero\'s voice. hero ({hero.face}, {hero.voice}): "Look at Image 1 {{here}}."');
  const args = sceneArgs({...projected, prompt:projected.prompt});
  assert.deepEqual(sceneLabels(args), {'hero.face':'Image 1', 'hero.voice':'Audio 1', 'guest.face':'Image 2', 's1-ref1.image':'Image 3',
    'guest.image':'Image 2', 'hero.image':'Image 1'});
  // The spoken line keeps its words and its literal braces.
  assert.equal(resolveScenePrompt(args.prompt, sceneLabels(args)),
    'Image 2: guest. Image 1: hero. Audio 1: hero\'s voice. hero (Image 1, Audio 1): "Look at Image 1 {here}."');
  assert.throws(() => resolveScenePrompt('{nobody.face} waits.', sceneLabels(args)), /placeholder_unresolved/);
});

test('a scene without a cast picture gives its opening as an object reference', () => {
  const projected = sceneArgsFromComposed({prompt:'A quiet harbor.', references:[], slots:[], script:[],
    shots:[{id:'opening', frames:48, imagePath:'/tmp/harbor.png'}]});
  assert.deepEqual(projected.references, [{id:'opening-ref1', role:'object', imagePath:'/tmp/harbor.png'}]);
  assert.match(projected.prompt, /^\{opening-ref1\.image\}: /);
  assert.throws(() => sceneArgsFromComposed({prompt:'Dark.', references:[], slots:[], script:[], shots:[{id:'s1', frames:24}]}), /genai_scene_subject/);
});

test('scene arguments keep LTX scene limits and the 8k+1 render grid', () => {
  assert.deepEqual([24, 25, 26, 169, 170].map(genaiSceneFrames), [25, 25, 33, 169, 177]);
  const refused = [
    {shots:[{id:'hero', frames:24}]},
    {cast:[{id:'a', images:[1,2,3].map(n => ({role:'p'+n, imagePath:'/x.png'}))}, {id:'b', images:[{role:'face', imagePath:'/x.png'}, {role:'back', imagePath:'/x.png'}]}]},
    {cast:['a','b','c'].map(id => ({id, images:[{role:'face', imagePath:'/x.png'}], voicePath:'/x.wav'}))},
    {cast:[{id:'hero', images:[{role:'image', imagePath:'/x.png'}]}]},
    {shots:[{id:'s1', frames:300}, {id:'s2', frames:62}]},
  ];
  for (const overrides of refused) assert.equal(genaiSceneSchema.safeParse({...sceneArgs(), ...overrides}).success, false, JSON.stringify(overrides));
  const body = genaiSceneBody(sceneArgs({seed:7, shots:[{id:'s1', frames:57, imagePath:'/tmp/open.png'}, {id:'s2', frames:56, imagePath:'/tmp/two.png', strength:0.5}]}),
    (file, kind) => kind + ':' + file);
  assert.deepEqual(body.input.shots, [{id:'s1', seconds:57/24, image:{uri:'image:/tmp/open.png'}}, {id:'s2', seconds:56/24, image:{uri:'image:/tmp/two.png', strength:0.5}}]);
  assert.deepEqual(body.parameters, {width:576, height:1024, fps:24, seed:7});
});

test('a compilation that moves labels, length or cuts is refused before approval and before submission', () => {
  const args = sceneArgs();
  const resolved = {num_frames:113, prompt:'Image 1 waves.', labels:{'hero.face':'Image 1'}, shots:[{id:'s1', start_frame:0}, {id:'s2', start_frame:57}]};
  assert.equal(checkSceneValidation(args, {resolved, warnings:[]}).numFrames, 113);
  assert.throws(() => checkSceneValidation(args, {resolved:{...resolved, prompt:'Image 2 waves.'}}), /genai_scene_labels/);
  assert.throws(() => checkSceneValidation(args, {resolved:{...resolved, num_frames:121}}), /genai_scene_frames/);
  assert.throws(() => checkSceneValidation(args, {resolved:{...resolved, shots:[{id:'s1', start_frame:0}, {id:'s2', start_frame:56}]}}), /genai_scene_cuts/);
});

test('direct scene requests enforce two identities and two character images before upload', () => {
  const person = id => ({id, images:[{role:'face',imagePath:id+'.png'}]});
  const cast = ['a','b','c'].map(person);
  assert.throws(() => sceneArgs({cast}), /scene_cast_exceeded/);
  const pair = cast.slice(0,2);
  assert.equal(sceneArgs({cast:pair, references:[{id:'key',role:'object',imagePath:'key.png'}]}).cast.length,2);
  pair[0].images.push({role:'front',imagePath:'front.png'});
  assert.throws(() => sceneArgs({cast:pair}), /scene_character_image_limit/);
  assert.equal(sceneArgs({cast:pair.slice(0,1)}).cast[0].images.length,2);
});

test('a voice sample longer than scene mode takes is refused before anything is reserved', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'genai-voice-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const sample = seconds => { const file = path.join(dir, seconds + '.wav'); execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=duration=' + seconds, file]); return file; };
  const cast = voicePath => [{ id: 'hero', images: [{ role: 'face', imagePath: '/x.png' }], voicePath }];
  checkSceneVoices({ cast: cast(sample(9)) });
  assert.throws(() => checkSceneVoices({ cast: cast(sample(12)) }), /scene_voice_too_long: hero's voice sample runs 12\.0 s/);
  assert.throws(() => checkSceneVoices({ cast: cast(path.join(dir, 'missing.wav')) }), /scene_voice_unreadable/);
});

test('H3 validates its own frame grid and numbers all shot pictures separately from voices', () => {
  const cast=['a','b'].map(id=>({id,images:[{role:'face',imagePath:id+'.png'}],voicePath:id+'.wav'}));
  const shots=[{id:'s1',frames:78,imagePath:'wide.png'},{id:'s2',frames:90,imagePath:'reverse.png'}];
  const input=sceneArgs({model:'minimax-h3',cast,shots,prompt:'{s1.image} then {s2.image}. {b.face} with {b.voice}.'});
  const labels=sceneLabels(input),prompt='<Picture 3> then <Picture 4>. <Picture 2> with <Audio 2>.';
  assert.equal(resolveScenePrompt(input.prompt,labels),prompt);
  assert.equal(checkSceneValidation(input,{resolved:{labels,prompt,num_frames:175,shots:[{id:'s1',start_frame:0},{id:'s2',start_frame:78}]}}).numFrames,175);
  const sized = {...input,referenceImageShortEdge:1536};
  const wire = args => genaiSceneBody(args, file=>file);
  assert.deepEqual(wire(sized).input, wire(input).input);
  assert.deepEqual(wire(sized).parameters.model_options, {h3:{reference_image_short_edge:1536}});
  assert.equal(wire(input).parameters.model_options, undefined);
  assert.deepEqual(wire({...input,numInferenceSteps:24}).parameters.model_options,{h3:{num_inference_steps:24}});
  const resolved={labels,prompt,num_frames:175,shots:[{id:'s1',start_frame:0},{id:'s2',start_frame:78}]};
  assert.throws(()=>checkSceneValidation(sized,{resolved}),/genai_scene_reference_size/);
  assert.equal(checkSceneValidation(sized,{resolved:{...resolved,reference_image_short_edge:1536}}).referenceImageShortEdge,1536);
  assert.equal(genaiSceneSchema.safeParse({...sized,referenceImageShortEdge:2049}).success,false);
  assert.equal(genaiSceneSchema.safeParse({...input,shots:[{id:'s1',frames:346}]}).success,false);
  assert.equal(genaiSceneSchema.safeParse({...input,shots:[{id:'s1',frames:60}]}).success,false);
  const short=genaiSceneSchema.parse({...input,holdToMinDuration:true,shots:[{id:'s1',frames:78,imagePath:'wide.png'}]});
  assert.equal(short.shots[0].frames,78);
  assert.equal(wire(short).input.shots[0].seconds,124/24);
  const shortLabels=sceneLabels(short), shortPrompt='{s1.image}';
  assert.equal(checkSceneValidation({...short,prompt:shortPrompt},{resolved:{labels:shortLabels,prompt:resolveScenePrompt(shortPrompt,shortLabels),num_frames:124,shots:[{id:'s1',start_frame:0}]}}).numFrames,124);
  assert.equal(genaiSceneSchema.safeParse({...input,cast:[...cast,{...cast[0],id:'d'}]}).success,false);
});

test('H3 binds two pinned voices and advises fewer sampling steps where the backend would stop the job', () => {
  const scene = videoCatalog().adapters.find(adapter => adapter.tool === 'astra_genai_scene');
  assert.deepEqual(scene.voice.maxPinnedVoicesPerRender, {'ltx-2.5-22b-distilled':2, 'minimax-h3':2});
  const h3 = (resolution, frames, numInferenceSteps) => sceneArgs({model:'minimax-h3', resolution, shots:[{id:'s1', frames, imagePath:'/tmp/open.png'}],
    ...(numInferenceSteps === undefined ? {} : {numInferenceSteps})});
  // 736x1280 and 345 frames ran 66 s a step on production, where about 18 steps fit the 1,800 s job limit.
  const [advice, ...more] = h3StepAdvice(h3('736x1280', 345));
  assert.equal(more.length, 0);
  assert.equal(advice.code, 'h3_step_budget');
  assert.match(advice.detail, /50 sampling steps \(the model default\) at 736x1280 and 345 frames run about 3300 s of sampling.*Set numInferenceSteps to 18 or fewer\./);
  assert.deepEqual(h3StepAdvice(h3('736x1280', 345, 18)), []);
  assert.equal(h3StepAdvice(h3('736x1280', 345, 19)).length, 1);
  assert.deepEqual(h3StepAdvice(h3('576x1024', 124)), []);
  assert.deepEqual(h3StepAdvice(sceneArgs()), []);
});
