import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { bindRegisteredPanels, bindSceneAdapter, checkSceneDeployment, inspectSceneInputContract, prepareSceneRequest, mapSceneInputs, SceneInputError } from '../dist/scene-video.js';
import { readCapture, captureScene } from './fixtures/scene-capture.mjs';
import { approveVideo, executeVideo, planManagedVideo, planVideo, videoStatus } from '../dist/video-routing.js';
import { config } from '../dist/config.js';
import { ROUTES } from '../dist/handlers.js';
import { buildGenaiAudioBody } from '../dist/astra-genai-video.js';
import { buildVeoBody } from '../dist/veo-video.js';
import { buildDesktopBody } from '../dist/astra-genai-desktop.js';
import { png, setupProject } from './workflow-fixture.mjs';

function busking(t) {
 const episode = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ears-up-')));
 t.after(()=>fs.rmSync(episode,{recursive:true,force:true}));
 setupProject(episode);
 const dir = path.join(episode,'storyboard');
 const {scene,shots} = JSON.parse(fs.readFileSync(new URL('./fixtures/ears-up-ep01.json',import.meta.url)));
 fs.mkdirSync(path.join(dir,'images'),{recursive:true});
 fs.mkdirSync(path.join(dir,'audio'));
 const members = shots.map((card,i)=>({
   ...card, id:'s000'+(i+1), duration:(card.timeline.endFrame-card.timeline.startFrame)/scene.fps,
   visual:{video:{engine:'astra-genai',model:'ltx-2.5-22b-dev',resolution:'576x1024'}},
 }));
 for (const m of members) for (const p of m.timeline.images) fs.writeFileSync(path.join(dir,p.path),png);
 // 15 seconds of mono 8 kHz PCM, with a transient on the first kick.
 const data = Buffer.alloc(44+15*8000*2);
 data.write('RIFF'); data.writeUInt32LE(data.length-8,4); data.write('WAVEfmt ',8);
 data.writeUInt32LE(16,16); data.writeUInt16LE(1,20); data.writeUInt16LE(1,22);
 data.writeUInt32LE(8000,24); data.writeUInt32LE(16000,28); data.writeUInt16LE(2,32); data.writeUInt16LE(16,34);
 data.write('data',36); data.writeUInt32LE(data.length-44,40); for (let sample=14000; sample<18000; sample++) data.writeInt16LE(Math.round(9000*Math.sin(sample/4)),44+sample*2);
 fs.writeFileSync(path.join(dir,scene.audio.path),data);
 const save = () => fs.writeFileSync(path.join(dir,'scenes.js'),
   'window.STRUCTURE='+JSON.stringify({scenes:[{no:1,videoDirection:scene}]})+';\nwindow.SCENES='+JSON.stringify(members)+';');
 save();
 const input = {episode,sceneNo:1,requestId:'ep01',args:{reserveUsd:0}};
 const capture = mapper => prepareSceneRequest(1,members,scene,episode,[],{bindDialogue:false,bindOpening:false,suffix:''},mapper);
 return {episode,dir,scene,members,input,save,capture};
}

test('EP01 delivers one multipart request with three shots, six file parts and one uninterrupted music cue',async t=>{
 const f=busking(t);
 let calls=0;
 const {mapped,request}=f.capture(input=>{calls++;return captureScene(input)});
 const final=await readCapture(mapped);
 assert.equal(calls,1);
 assert.equal(final.fps,24); assert.equal(final.frameCount,360);
 assert.deepEqual(final.shotIds,['s0001','s0002','s0003']);
 assert.deepEqual(final.cuts.map(c=>[c.to,c.frame,c.transition]),[['s0002',42,'hard_cut'],['s0003',52,'hard_cut']]);
 assert.deepEqual(final.images.map(i=>[i.shotId,i.frame,i.role,i.filename]),[
   ['s0001',0,'start','opening.png'],['s0002',42,'start','play-contact.png'],['s0003',52,'start','solo.png'],
   ['s0003',112,'keyframe','duo.png'],['s0003',191,'keyframe','trio.png'],['s0003',336,'end','ending.png'],
 ]);
 assert.ok(final.images.every(image=>image.bytes===png.length));
 assert.match(final.prompt,/s0001 [\s\S]*s0002 [\s\S]*s0003 [\s\S]*Seorin steps[\s\S]*Mai An joins[\s\S]*Tu Vi enters/);
 assert.deepEqual([final.audio.startFrame,final.audio.endFrame,final.audio.cues[0].frame],[0,360,42]);
 assert.equal(final.audio.sha256,createHash('sha256').update(fs.readFileSync(path.join(f.dir,f.scene.audio.path))).digest('hex'));
 await assert.rejects(ROUTES.video_plan({...f.input,operation:'audio'}), /scene_speech_route/);
 assert.ok(!fs.existsSync(path.join(f.episode,'.work/video-routing/plans')));
 assert.throws(()=>mapSceneInputs(request,'astra_genai_audio2video'), e =>
   e.missing.filter(m=>m.input==='transition').length===2);
 f.members[2].visual.camera={movement:'pan right',target:'the dancers',end:'The dancers fill the frame.'};
 f.save();
 const moved=f.capture(input=>input);
 assert.match(moved.request.prompt,/s0003 [^\n]*?pan[^\n]*Closing frame: The dancers fill the frame/i);
 f.scene.oneTake=true;
 assert.throws(()=>f.capture(input=>input),/scene_one_take/);
});

test('EP2 keeps the dolly in one shot and binds Miran’s line, position and references at the cut', async t => {
  const f = busking(t);
  f.members.splice(2);
  delete f.scene.audio;
  const [accusation, answer] = f.members;
  const people = [
    {character:'nephew', images:[1], position:'Seated at the far desk on the right.'},
    {character:'miran', images:[], position:'Standing at the near left witness rail.'},
  ];
  f.scene.openingPositions = people;
  const setups = [
    [accusation, 's0002', 0, 171, 'nephew', '그 건물 달라고 했죠?', 'opening', 'solo', people, 'He hits his desk once and rises. Dolly forward and settle before the question.'],
    [answer, 's0001', 171, 276, 'miran', '이 백억짜리 유언장, 제가 찢었습니다.', 'duo', 'trio',
      [{character:'miran', images:[1], position:'Hands on the witness rail, facing the bench.'}], 'She raises her eyes from the rail.'],
  ];
  for (const [card,id,start,end,speaker,words,opening,face,positions,action] of setups) {
    card.id = id;
    card.duration = (end-start)/24;
    card.visual.video.model = 'ltx-2.5-22b-distilled';
    card.visual.video.promptSource = {sound:start ? 'Quiet courtroom room tone.' : 'A single desk thud and chair scrape.'};
    card.timeline = {startFrame:start,endFrame:end,transition:start ? 'hard_cut' : 'open',framing:'Eye level.',action,
      openingPositions:positions, images:[{role:'start',frame:start,path:'images/'+opening+'.png'},
        {role:'face',character:speaker,frame:start,path:'images/'+face+'.png'}]};
    card.narration = [{id:id+'-l1',speaker,tts:words,delivery:'on_screen'}];
    card.performance = [{kind:'dialogue',group:1,character:speaker,videoDirection:'Keep the gaze steady.'}];
  }
  accusation.timeline.images.push({role:'end', frame:170,path:'images/ending.png'});
  answer.timeline.dialogueCues = [{lineId:'s0001-l1',frame:171}];
  f.save();
  const {request, mapped, providerPrompt} = prepareSceneRequest(1,f.members,f.scene,f.episode,f.members.flatMap(m=>m.narration),
    {bindDialogue:false,bindOpening:false,suffix:''},captureScene);
  const wire = await readCapture(mapped);
  assert.deepEqual(wire.cuts,[{from:'s0002',to:'s0001',frame:171,transition:'hard_cut'}]);
  assert.deepEqual(wire.images.map(p=>[p.shotId,p.role,p.frame]),[
    ['s0002','start',0],['s0002','face',0],['s0002','end',170],['s0001','start',171],['s0001','face',171],
  ]);
  for (const [i, shot] of wire.shots.entries()) {
    assert.equal(shot.dialogue[0].speaker, setups[i][4]);
    assert.equal(shot.dialogue[0].text, setups[i][5]);
    assert.equal(shot.dialogue[0].lineId, setups[i][1]+'-l1');
    assert.deepEqual(shot.openingPositions,setups[i][8]);
    assert.equal(wire.prompt.split(shot.dialogue[0].text).length,2);
    assert.equal(wire.prompt.split(shot.sound).length,2);
  }
  assert.match(providerPrompt, /Keep the gaze steady/);
  assert.doesNotMatch(providerPrompt, /s000[12]|Frame 171/);
  assert.equal(wire.shots[1].dialogue[0].frame,171);
  // Scene mode opens the second shot on its start picture and paces the cut itself. It leaves the ending picture out
  // and names it in the plan, but a line pinned to a frame is refused for the scene adapter before anything is uploaded.
  assert.throws(()=>planVideo(f.input), error=>{
    assert.equal(error.tool,'astra_genai_scene');
    assert.deepEqual(error.sceneRequest.cuts,request.cuts);
    assert.deepEqual(error.sceneRequest.shotIds,request.shotIds);
    assert.deepEqual(error.sceneRequest.images.filter(i=>i.reference?.scope==='scene').map(i=>i.character), ['nephew','miran','nephew','miran']);
    assert.ok(error.missing.some(m=>m.lineId==='s0001-l1' && m.frame===171 && m.speaker==='miran'));
    assert.deepEqual(error.missing.filter(m=>m.input==='image'),[]);
    assert.deepEqual(error.missing.filter(m=>m.input==='position'),[]);
    return true;
  });
  assert.equal(fs.existsSync(path.join(f.episode,'.work/video-routing/plans')),false);
  const legacy = structuredClone(request);
  const panel = legacy.images.find(i=>i.role==='face');
  delete panel.character;
  panel.role = 'character';
  const cast = {SB_DOC:{characters:[{id:'nephew',panels:{face:panel.path}}]}};
  bindRegisteredPanels(legacy,f.episode,cast);
  assert.equal(panel.character,'nephew');
  delete panel.character;
  cast.SB_DOC.characters.push({id:'other',panels:{face:panel.path}});
  bindRegisteredPanels(legacy,f.episode,cast);
  assert.equal(panel.character,undefined);
  answer.timeline.dialogueCues[0].lineId='missing-line'; f.save();
  assert.throws(()=>planVideo(f.input),/scene_dialogue_timing/);
});

function pinnedActor(dir, id, face, frequency) {
  const sample = path.join(dir, id + '.wav');
  execFileSync('ffmpeg', ['-v','error','-f','lavfi','-i',`sine=frequency=${frequency}:duration=0.5`,sample]);
  const tts = {engine:'gemini', voiceId:id, language:'vi', speed:1};
  const sha256 = createHash('sha256').update(fs.readFileSync(sample)).digest('hex');
  return {id, panels:{face}, tts, voiceReference:{path:sample,tts,sha256}};
}

test('a GenAI scene counts its speakers and leaves a scene-wide silent face out', async t => {
  const f = busking(t);
  delete f.scene.audio;
  const cast = ['seorin','mai-an','tu-vi'].map((id,i)=>pinnedActor(f.dir,id,'images/'+['solo','duo','trio'][i]+'.png',400+i*150));
  const line = (speaker,id) => ({id,speaker,delivery:'on_screen',tts:'Your turn.'});
  for (const [i,shot] of f.members.entries()) {
    shot.visual.video.model = 'ltx-2.5-22b-distilled';
    shot.timeline.openingPositions = f.scene.openingPositions;
    shot.narration = [line(cast[i].id,shot.id+'-l1')];
  }
  f.members[0].narration.push(line(cast[1].id,'reply'));
  const listener = {id:'listener',panels:{face:'images/listener.png'}};
  execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=red:s=16x16','-frames:v','1',path.join(f.dir,listener.panels.face)]);
  cast.push(listener);
  // Only the scene opening stages this silent person. The child cards have no local hint.
  f.scene.openingPositions = [...f.scene.openingPositions,{character:listener.id,images:[],position:'Near the witness rail.'}];
  const save = () => {
    f.save();
    fs.appendFileSync(path.join(f.dir,'scenes.js'),'\nwindow.SB_DOC='+JSON.stringify({characters:cast})+
      '; window.STRUCTURE.scenes[0].speakerReferences='+JSON.stringify([{character:listener.id,path:listener.panels.face}])+';');
  };
  save();
  // Three speakers exceed the two referenced identities; the silent witness is not one of them.
  assert.throws(()=>planVideo(f.input,false),e=>e.report?.code==='scene_cast_exceeded' &&
    e.report.characters.join()==='seorin,mai-an,tu-vi' && e.report.splitBefore.join()===f.members[2].id);
  f.members.splice(1);
  f.scene.oneTake = true;
  f.members[0].narration.push(line('tu-vi','third'));
  save();
  assert.throws(()=>planVideo(f.input,false),e=>e.report?.shotId==='s0001' && !e.report.splitBefore.length);
});

test('a refused GenAI scene reads what scene mode takes from the common catalog without submitting media',async t=>{
  const key=config.astraGenaiApiKey, fetch=globalThis.fetch;
  config.astraGenaiApiKey='fixture';
  t.after(()=>{config.astraGenaiApiKey=key;globalThis.fetch=fetch});
  const scene={pipeline:'msr',voices:{max:2,max_seconds:10},shots:{max:8,cuts:'model_paced'}};
  const routes=[];
  globalThis.fetch=async(url,options)=>{
    routes.push(new URL(url).pathname);
    assert.equal(options.method,'GET'); assert.equal(options.body,undefined);
    return Response.json({data:[{id:'ltx-2.5-22b-distilled',kind:'video',scene}]});
  };
  const refusal=new SceneInputError('astra_genai_scene',{images:[{role:'face'}]},[],'ltx-2.5-22b-distilled');
  const contract=await inspectSceneInputContract(refusal);
  assert.deepEqual(routes,['/v1/models']);
  assert.deepEqual([contract.status,contract.endpoint,contract.mode],['verified','/v1/generations','scene']);
  assert.deepEqual(contract.scene,scene);
  assert.equal(await inspectSceneInputContract(new SceneInputError('seedance_reference',{images:[]},[])),undefined);
  globalThis.fetch=async()=>Response.json({},{status:503});
  assert.equal((await inspectSceneInputContract(refusal)).status,'unverified');
});

test('Desktop keyframes receive each asset index only on an active compatible deployment',async t=>{
 const f=busking(t);
 delete f.scene.audio; f.scene.oneTake=true; f.members.splice(1);
 const m=f.members[0]; m.duration=4; m.timeline.endFrame=96;
 m.visual.video={engine:'astra-genai-desktop',model:'ltx-2.5-fast',resolution:'720p'};
 m.timeline.images.push({role:'keyframe',frame:42,path:'images/play-contact.png'},{role:'end',frame:83,path:'images/ending.png'});
 f.save();
 const key=config.astraGenaiApiKey,fetch=globalThis.fetch; config.astraGenaiApiKey='fixture';
 t.after(()=>{config.astraGenaiApiKey=key;globalThis.fetch=fetch});
 let enabled=false;
 globalThis.fetch=async (url,options)=>{
   assert.equal(options.method,'GET');
   assert.ok(String(url).endsWith('/v1/ltx/desktop/models'));
   return Response.json({active_model:'ltx-2.5-fast',data:enabled?[{
     id:'ltx-2.5-fast',features:['keyframes'],audio_combinations:{},
     generation_combinations:{'720p':{fps_to_durations:{24:[4]},aspect_ratios:['16:9']}},
   }]:[]});
 };
 const {request}=f.capture(input=>input);
 const tool = 'astra_genai_desktop_keyframes';
 assert.throws(()=>planVideo({...f.input,operation:'keyframe'}),/scene_speech_route/);
 assert.throws(()=>planVideo(f.input),/scene_inputs_unsupported/);
 const mapped=bindSceneAdapter(request,tool,m.visual.video.model,m,{duration:4},f.episode);
 const args={...mapped.args,prompt:request.prompt,reserveUsd:0,model:m.visual.video.model,resolution:'720p',aspectRatio:'16:9',fps:24};
 await assert.rejects(checkSceneDeployment(request,tool,args),e=>e.missing[0].input==='deployment');
 enabled=true;
 await checkSceneDeployment(request,tool,args);
 const ids=Object.fromEntries(args.keyframes.map(pin=>[pin.imagePath,path.basename(pin.imagePath)]));
 const body=buildDesktopBody('keyframes',args,ids);
 assert.deepEqual(body.keyframes.map(p=>[p.assetId,p.frameIndex]),[['opening.png',0],['play-contact.png',42],['ending.png',83]]);
 assert.throws(()=>mapSceneInputs({...request,cuts:[{from:'s1',to:'s2',frame:42,transition:'hard_cut'}]},tool),
   error=>error.missing.length===1 && error.missing[0].input==='transition');
});

test('a distilled GenAI scene keeps a prop separate from the opening image and silent dancers',t=>{
 const f=busking(t), m=f.members[0];
 delete f.scene.audio; f.members.splice(1);
 m.duration=3; m.timeline.endFrame=72;
 m.timeline.action='The plaza stays empty until Mai An enters from the left.';
 m.visual.video.model='ltx-2.5-22b-distilled';
 m.visual.references = [{id:'bag',role:'prop',use:'video',purpose:'A canvas bag.',path:'images/duo.png'}];
 f.save();
 const plan=planVideo(f.input,false);
 assert.equal(plan.tool,'astra_genai_scene');
 // The prop is a subject of its own, and the opening picture opens the only shot.
 assert.deepEqual(plan.args.references.map(ref=>[ref.role,path.basename(ref.imagePath)]),[['object','duo.png']]);
 assert.deepEqual(plan.args.cast,[]);
 assert.deepEqual(plan.args.shots.map(shot=>[shot.id,shot.frames,path.basename(shot.imagePath)]),[['s0001',72,'opening.png']]);
 assert.match(plan.args.prompt,/mai-an: Off screen/);
 assert.match(plan.args.prompt,/no subtitles/);
 m.timeline.images[0].strength=0.25; f.save();
 assert.throws(()=>planVideo(f.input,false), /scene_inputs_unsupported/);
});

test('a 25-frame silent one-take sends none of the faces its shot names and names each of them', t => {
  const f = busking(t), shot = f.members[0];
  delete f.scene.audio;
  f.scene.oneTake = true;
  f.members.splice(1);
  shot.duration = 25/24;
  shot.timeline.endFrame = 25;
  shot.visual.video.model = 'ltx-2.5-22b-distilled';
  for (const [i,owner] of f.scene.openingPositions.entries()) {
    owner.images = [i+1];
    shot.timeline.images.push({role:'face',character:owner.character,frame:0,path:'images/'+['solo','duo','trio'][i]+'.png'});
  }
  f.save();
  // Nobody speaks, so three faces neither split the one-take nor reach the gateway; the opening carries the people.
  const image = planVideo({...f.input,operation:'image'});
  assert.equal(image.tool,'astra_genai_scene');
  assert.deepEqual(image.args.shots.map(shot=>shot.frames),[25]);
  assert.deepEqual(image.args.cast,[]);
  assert.deepEqual(image.args.references.map(ref=>ref.role),['object']);
  assert.deepEqual(image.directionWarnings.filter(w=>w.startsWith('scene_reference_omitted')).map(w=>w.split(' ').slice(1,3).join(' ')),
    ['s0001 images/solo.png','s0001 images/duo.png','s0001 images/trio.png']);
  shot.timeline.images = [];
  for (const owner of f.scene.openingPositions) owner.images = [];
  f.save();
  assert.throws(()=>planVideo({...f.input,operation:'text'}),/scene_speech_route/);
});

test('Veo image-to-video identifies unsupported silent cast panels and keeps the opening frame', t => {
  const f = busking(t), shot = f.members[0];
  delete f.scene.audio;
  f.members.splice(1);
  shot.duration = 8;
  shot.timeline.endFrame = 192;
  shot.timeline.images = ['face','outfit'].map((role,i) => ({
    role, character:'mai-an', frame:0, path:'images/' + ['solo.png','duo.png'][i],
  }));
  shot.timeline.action = 'Mai An enters from the left after the spectators turn.';
  f.scene.openingPositions[1].images = [1,2];
  shot.visual.video = {engine:'veo',model:'veo-3.1-fast-generate-001',resolution:'720p'};
  shot.visual.frames = {mode:'reference', start:'images/opening.png'};
  f.save();
  assert.throws(()=>planVideo({...f.input,args:{}}), error=>{
    assert.deepEqual(error.missing.map(p=>[p.shotId,p.frame,p.role,path.basename(p.path)]),
      [['s0001',0,'face','solo.png'],['s0001',0,'outfit','duo.png']]);
    return true;
  });
  shot.timeline.images=[];
  f.scene.openingPositions[1].images=[];
  f.save();
  const plan=planVideo({...f.input,args:{}});
  const [wire]=buildVeoBody(plan.args).instances;
  assert.ok(wire.image.bytesBase64Encoded);
  assert.equal(wire.referenceImages,undefined);
  shot.visual.references=[{id:'wheel',role:'prop',use:'video',purpose:'Bicycle wheel.',path:'images/solo.png'}];
  f.save();
  assert.throws(()=>planVideo({...f.input,operation:'reference',args:{}}),/scene_speech_route/);
  assert.throws(()=>planVideo({...f.input,args:{}}),/scene_inputs_unsupported/);
});


test('a GenAI scene with a supplied soundtrack is refused, because scene mode renders its own', async t => {
  for (const mode of ['mix','conditioning']) {
    const f=busking(t);
    f.scene.audio.mode=mode;
    f.members[0].narration=[{id:'line',speaker:'seorin',delivery:mode==='conditioning'?'on_screen':'off_screen',tts:'Ready?'}];
    for (const shot of f.members) shot.visual.video.model='ltx-2.5-22b-distilled';
    f.save();
    assert.throws(()=>planVideo(f.input,false),/scene_mode_audio_unsupported/);
  }
});

test('declaring the scene cast without endpoint images still allows model-paced cuts', () => {
  const owner = {no:1, speakers:[]};
  const board = {STRUCTURE:{scenes:[owner]}};
  const scene = {emotion:'Anticipation.', fps:24, openingPositions:[]};
  const cards = ['A cart rolls.', 'The wheel stops.'].map((action, index) => ({
    id:'s'+index, scene:1, duration:1, visual:{action},
  }));
  const options = {bindDialogue:false, bindOpening:false, suffix:''};
  const compile = () => prepareSceneRequest(1,cards,scene,'/unused',[],options,()=>null,board).request;
  assert.equal(compile().modelPacedCuts, true);
  cards[1].timeline = {startFrame:24,endFrame:48,transition:'hard_cut',framing:'Close up.',action:'The wheel stops.'};
  assert.equal(compile().modelPacedCuts, undefined);
});

test('scene camera returns to its default after the insert and every shot cue reaches its shot', async () => {
  const scene = {emotion:'Suspicion turns to relief.', openingPositions:[], fps:24};
  const defaults = {camera:'camera.static', axis:'Stay on the window side.', lighting:'Dusk light.', attention:'Watch the lamp.'};
  const board = {STRUCTURE:{scenes:[{no:1,directionDefaults:defaults}]}};
  const cards = ['Open the letter.','Read the seal.','Lower the letter.'].map((action,i) => ({
    id:'s'+i, scene:1, duration:1, timeline:{startFrame:i*24,endFrame:(i+1)*24,
      transition:i?'hard_cut':'open', framing:'Eye level.',action},
  }));
  cards[1].visual = {camera:{movement:'dolly in',target:'the broken seal',speed:'slow',end:'Settle on the seal.',
    view:{mode:'profile-right',subject:'the witness',crop:'Only the cheek and the eye.',reason:'Fear'}},
    expression:{witness:'The lower eyelid tightens.'},action:'Press the signet into the wax.',
    video:{promptSource:{action:'Press the signet into the wax.',end:'She folds the letter.'}}};
  cards[1].performance = [{kind:'action',text:'Tap the brass bell twice.',durationSeconds:1}];
  cards[1].shot = {size:'cu',angle:'eye',techniques:[{id:'camera.rack-focus',from:'the seal',to:'the lamp'}], space:{light:'A passing shadow.'},
    videoDesign:{motion:{beats:[{at:0.5,state:'A hairline crack opens in the wax.'}]}}};
  const build = list => prepareSceneRequest(1,list,scene,'/unused',[],{bindDialogue:false,bindOpening:false,suffix:''},()=>null,board);
  // What the scene compiles for each shot: the framing and action its part of the one scene prompt is written from.
  const shotText = (compiled, i) => [compiled.shots[i].framing, compiled.shots[i].action].join(' ');
  const {request,providerPrompt} = build(cards);
  assert.match(providerPrompt,/window side/);
  for (const i of [0,2]) {
    assert.match(shotText(request,i),/static frame/);
    assert.match(providerPrompt,/Dusk light/);
    assert.match(providerPrompt,/Watch the lamp/);
  }
  for (const phrase of ['slowly pushes','broken seal','Settle on the seal','right profile','Close-up','eye level','Tap the brass bell twice','Rack focus from the seal to the lamp','lower eyelid','folds the letter','passing shadow']) {
    assert.ok(shotText(request,1).includes(phrase),phrase);
    assert.ok(providerPrompt.includes(phrase),phrase);
  }
  assert.doesNotMatch(shotText(request,1),/static frame|Dusk/);
  assert.match(shotText(request,1),/Read the seal.*Press the signet.*At 0.5 s into this shot: A hairline crack/);
  assert.equal(shotText(request,1).match(/Press the signet/g).length,1);
  assert.doesNotMatch(shotText(request,2),/Press the signet|hairline crack/);
  const single = build([cards[0]]).providerPrompt;
  assert.match(single,/Suspicion turns to relief/);
  assert.match(single,/static frame/);
  const acting = {context:'The clerk is watching.',intent:'Make the guard underestimate her.',emotion:'Panic gives way to defiance.',
    visual:'Her hand grips the lock.',direction:'Stammer on the first syllable.',vocal:'Drop to a whisper.',tags:['sighs','Sighs.'],leadInSeconds:1.5,tailOutSeconds:0.75};
  const line = {id:'l1',speaker:'miran',delivery:'on_screen',tts:'Not yet.',acting};
  const spoken = {...cards[0], narration:[line], timeline:{...cards[0].timeline,dialogueCues:[{lineId:'l1',frame:0}]}};
  for (const list of [[spoken], [spoken,...cards.slice(1)]]) {
    const directed = build(list).request;
    const first = directed.shots[0];
    for (const cue of [acting.intent,acting.emotion,acting.context,acting.visual,'Anticipation 1.5 seconds','reaction 0.75 seconds'])
      assert.ok(shotText(directed,0).includes(cue),cue);
    assert.equal(first.dialogue[0].text,line.tts);
    assert.equal(first.dialogue[0].direction,'Stammer on the first syllable. Drop to a whisper. sighs');
    assert.ok(build(list).providerPrompt.includes(first.dialogue[0].direction));
    assert.ok(!shotText(directed,0).includes(acting.vocal));
    assert.ok(!shotText(directed,0).includes(line.tts));
    assert.ok(!directed.shots.slice(1).some((_,i)=>shotText(directed,i+1).includes(acting.visual)));
  }
  const exchange = {...cards[0], narration:[
    {id:'answer',speaker:'miran',delivery:'on_screen',tts:'Locked.'},
    {id:'question',speaker:'miran',delivery:'on_screen',tts:'Is it open?'}],
    timeline:{...cards[0].timeline,dialogueCues:[{lineId:'question',frame:1},{lineId:'answer',frame:20}]},
    performance:[{kind:'dialogue',group:2,character:'miran'},{kind:'action',text:'Touch the latch.'},{kind:'dialogue',group:1,character:'miran'}]};
  for (const list of [[exchange],[exchange,...cards.slice(1)]]) {
    const {request} = build(list);
    assert.deepEqual(request.shots[0].dialogue.map(l=>[l.lineId,l.text,l.frame]),[['question','Is it open?',1],['answer','Locked.',20]]);
    assert.match(shotText(request,0),/As miran speaks\. Touch the latch\. As miran speaks\./);
    assert.doesNotMatch(shotText(request,0), /question|answer/);
    assert.doesNotMatch(shotText(request,0),/Is it open\?|Locked\./);
  }
  const film = (await import('../../skills/storyboard/references/film-techniques.js')).default;
  for (const entry of film.entries.filter(e=>e.fields.movement && e.fields.speed)) {
    defaults.camera = entry.id;
    assert.match(build([cards[0]]).providerPrompt, entry.fields.speed === 'slow' ? /slowly/ : /quickly/,entry.id);
  }
  defaults.camera = 'camera.static';
  delete cards[1].visual.camera.view;
  delete cards[1].visual.video.promptSource.end;
  cards[1].visual.frames = {mode:'first_last', endState:'The raven closes its claw around the sapphire.'};
  cards[1].shot.depth = {mode:'shallow',reads:1,focus:'the brass bell',sound:'near'};
  for (const subject of ['Rack focus from the seal to the lamp', 'the brass bell']) {
    const checked = build(cards).request;
    assert.match(checked.sceneDirection.staging, /Attention: Watch the lamp/);
    assert.ok(shotText(checked,1).includes(subject));
    assert.match(shotText(checked,1) + ' ' + (checked.shots[1].closingState ?? ''),/claw around the sapphire/);
    cards[1].shot.techniques = [];
  }
  delete board.STRUCTURE.scenes[0].directionDefaults;
  scene.camera='Keep the camera locked throughout.';
  const legacy = build(cards).request;
  assert.equal(legacy.sceneDirection.camera,undefined);
  assert.match(legacy.shots[0].framing,/camera locked/);
  assert.match(legacy.shots[2].framing,/camera locked/);
  assert.doesNotMatch(legacy.shots[1].framing,/camera locked/);
  assert.match(legacy.shots[1].framing,/slowly pushes/);
});


test('an inherited move keeps its shot-specific target, cue and speed and new blocking carries forward', () => {
  const defaults = {camera:'camera.dolly-in', continuity:'The witness stands beside the window.'};
  const board = {STRUCTURE:{scenes:[{no:1,directionDefaults:defaults}]}};
  const cards = ['Open the door.','Show the mark.','Step away.'].map((action,i) => ({
    id:'s'+i,scene:1,duration:1,timeline:{startFrame:i*24,endFrame:(i+1)*24,transition:i ? 'hard_cut':'open',framing:'Eye level.',action}
  }));
  cards[1].visual = {camera:{target:'the red latch',cue:'the desk bell rings',speed:'fast',end:'The red latch fills the frame.'}};
  cards[1].shot = {space:{continuity:'The witness now stands behind the door.'}};
  const {request} = prepareSceneRequest(1,cards,{emotion:'Surprise.',openingPositions:[],fps:24},'/unused',[],
    {bindDialogue:false,bindOpening:false,suffix:''},()=>null,board);
  assert.match(request.shots[1].framing,/desk bell rings.*quickly pushes in toward the red latch/);
  assert.match(request.shots[2].framing,/behind the door/);
  assert.match(request.shots[0].framing,/beside the window/);
  assert.doesNotMatch(request.shots[2].framing,/bell rings|red latch|beside the window/);
});

test('private words stay out of speech instructions while a visual object can share a short thought', async t => {
  const f = busking(t), card = f.members[0];
  delete f.scene.audio;
  const line = {id:'private', speaker:'mai-an', delivery:'voiceover', voiceoverKind:'inner_thought', tts:'Stop.'};
  card.narration = [line];
  const plan = () => prepareSceneRequest(1,[card],f.scene,f.episode,[line],
    {bindDialogue:false,bindOpening:false,suffix:''},()=>null).request;
  // The words the scene's one prompt is written from for this shot.
  const shotWords = () => { const shot = plan().shots[0]; return [shot.framing, shot.action].join(' '); };
  const sceneAction = f.scene.action;
  card.timeline.action = 'She talks to Ben in a low voice.';
  assert.throws(plan, /video_voiceover_embedded/);
  card.timeline.action = 'She leans toward Ben.';
  f.scene.action = 'In the opening shot she says: “Goodbye.”';
  assert.throws(plan, /video_voiceover_embedded/);
  f.scene.action = sceneAction;
  card.timeline.action = 'She mutters Stop.';
  assert.throws(plan, /video_voiceover_embedded/);
  card.timeline.action = 'She hisses stop.';
  assert.throws(plan, /video_voiceover_embedded/);
  card.timeline.action = 'She whispers under her breath, stop.';
  assert.throws(plan, /video_voiceover_embedded/);
  card.timeline.action = 'Stop, she whispers under her breath.';
  assert.throws(plan, /video_voiceover_embedded/);
  card.timeline.action = 'Her lips form Stop slowly.';
  assert.throws(plan, /video_voiceover_embedded/);
  card.timeline.action = 'She pushes the stop button as the radio whispers.';
  assert.match(shotWords(),/stop button/);
  line.tts = 'Wait.';
  for (const action of ['She sings Wait twice.', 'She shapes Wait with her lips.',
    'His mouth forms Wait.', 'Her lips shape Wait.', 'Her voice repeats Wait.']) {
    card.timeline.action = action;
    assert.throws(plan, /video_voiceover_embedded/);
  }
  card.timeline.action = 'Two friends wait at the door.';
  assert.match(shotWords(),/Two friends wait at the door/);
  card.timeline.action = 'Mia and Ben wait at the door.';
  assert.match(shotWords(),/Mia and Ben wait at the door/);
  line.tts = 'Stop.';
  card.timeline.action = 'She watches the second hand stop.';
  const clock = shotWords();
  assert.match(clock, /She watches the second hand stop/);
  line.tts = "I can't trust him.";
  card.timeline.action = 'She whispers, “I can’t trust him.”';
  assert.throws(plan, /video_voiceover_embedded/);
  line.tts = 'Please, stop.';
  card.timeline.action = 'She whispers “Please stop.”';
  assert.throws(plan, /video_voiceover_embedded/);
  line.tts = 'Stop.';
  card.timeline.action = 'She looks at the door.';
  line.acting = {visual:'She mutters Stop.'};
  assert.throws(plan, /video_voiceover_embedded/);
  delete line.acting;
  line.tts = 'The door.';
  card.timeline.action = 'She closes the door.';
  const compiled = plan();
  assert.match(shotWords(),/She closes the door/);
  assert.equal(compiled.shots[0].dialogue,undefined);
  line.tts = 'The red front door.';
  card.timeline.action = 'She closes the red front door.';
  const longerObject = shotWords();
  assert.match(longerObject,/She closes the red front door/);
});

test('keeps simultaneous actions with the correct spoken turn in provider prose', async () => {
  const {default: {notes: sceneDirectionNotes}} = await import('../../skills/storyboard/references/scene-direction.js');
  const card = { narration: [{ speaker: 'Mochi', tts: 'Wait.' }, { speaker: 'Mochi', tts: 'Come back.' }],
    performance: [{kind:'action', character:'Bo', text:'Lower the crate.', withGroup:2},
      {kind:'dialogue', group:1}, {kind:'dialogue', group:2},
      {kind:'action', character:'Bo', text:'Hold the door.', withGroup:1,durationSeconds:38/24}] };
  const notes = sceneDirectionNotes(card, Boolean, true, true, true);
  assert.deepEqual(notes.beats, ['As Mochi speaks: Bo: Hold the door.', 'As Mochi speaks: Bo: Lower the crate.']);
  card.performance[1].to = 'Bo';
  assert.equal(sceneDirectionNotes(card, Boolean, true, true, true).beats[0], 'While Bo listens, Mochi speaks: Bo: Hold the door.');
});

test('object inserts and rear close-ups use the same crop in opening images and every scene writer', async () => {
  const {scenePromptProfile} = await import('../dist/scene-prompt-profile.js');
  const {assemble,frameOptions} = (await import('../../skills/storyboard/references/assemble-bg-prompt.js')).default;
  const owner = {emotion:'Anticipation.',openingPositions:[],fps:24};
  const cases = [
    {shot:{size:'cu',cutRole:'insert'},visual:{character:[]},framing:'Only the watch is visible.',crop:/close-up of the subject/i},
    {shot:{size:'cu'},visual:{character:['mina'],camera:{view:{mode:'rear',subject:'Mina',crop:'Crown and nape',reason:'Withhold her identity.'}}},
      framing:'Crown and nape.',crop:/back of the head/i},
    {shot:{size:'choker'},visual:{character:['mina'],camera:{rear:true}},framing:'The nape.',crop:/back of the head/i}
  ];
  for (const {shot,visual,framing,crop} of cases) {
    const card = {id:'s0001',scene:1,type:'points',duration:4,shot:{...shot,render:{mode:'generated_video'}},visual,
      timeline:{startFrame:0,endFrame:96,transition:'open',framing,action:'A reflection crosses the wall.'}};
    const prompts = [assemble(frameOptions(card)).prompt];
    for (const tool of ['seedance_img2video','astra_genai_scene','veo_img2video','fasth3_omni_reference']) {
      const plan = prepareSceneRequest(1,[card],owner,'/unused',[],{profile:scenePromptProfile(tool),bindOpening:false,bindDialogue:false,suffix:''},()=>null,{});
      prompts.push(plan.providerPrompt);
    }
    for (const prompt of prompts) {
      assert.match(prompt,crop);
      assert.doesNotMatch(prompt,/the face and the top of the shoulders|forehead to chin/i);
    }
  }
});
