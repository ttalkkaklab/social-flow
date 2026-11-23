import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { buildSceneWire, bindRegisteredPanels, bindSceneAdapter, checkSceneDeployment, inspectSceneInputContract, prepareSceneRequest, mapSceneInputs, SceneInputError } from '../dist/scene-video.js';
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

test('one-take endpoint board reaches the A2V body with a single audio file and both endpoint images',t=>{
 const f=busking(t);
 const first=f.members[0];
 first.narration=[{id:'line',speaker:'seorin',delivery:'on_screen',tts:'Ready?'}];
 f.members.splice(1);
 first.duration=15;
 first.timeline.endFrame=360;
 first.timeline.images.push({role:'end',frame:359,path:'images/ending.png'});
 f.scene.oneTake=true; f.save();
 const plan=planVideo(f.input);
 assert.equal(plan.tool,'astra_genai_audio2video');
 assert.match(plan.args.prompt,/One continuous take/);
 const body=buildGenaiAudioBody(plan.args);
 assert.deepEqual(Object.keys(body).sort(),['audio_uri','fps','image_uri','last_frame_uri','model','prompt','resolution']);
 assert.equal(body.audio_uri,'data:audio/wav;base64,'+fs.readFileSync(path.join(f.dir,f.scene.audio.path)).toString('base64'));
 assert.deepEqual(plan.sceneRequest.cuts,[]);
 assert.deepEqual(plan.imageBindings.map(p=>[p.shotId,p.frame,p.role,p.parameter]),
   [['s0001',0,'start','imagePath'],['s0001',359,'end','lastFramePath']]);
 assert.throws(()=>planVideo({...f.input,sceneNo:undefined,shotId:first.id}),/sceneNo|shotId/);
 first.timeline.images.push({role:'face',frame:0,path:'images/duo.png',character:'mai-an'});
 f.save();
 assert.throws(()=>planVideo(f.input), error=>{
   assert.deepEqual(error.missing.map(p=>[p.shotId,p.frame,p.role,path.basename(p.path)]),
     [['s0001',0,'face','duo.png']]);
   return true;
 });
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
  assert.throws(()=>planVideo(f.input), error=>{
    assert.deepEqual(error.sceneRequest.cuts,request.cuts);
    assert.deepEqual(error.sceneRequest.shotIds,request.shotIds);
    assert.deepEqual(error.sceneRequest.images.filter(i=>i.reference?.scope==='scene').map(i=>i.character), ['nephew','miran','nephew','miran']);
    assert.ok(error.missing.some(m=>m.lineId==='s0001-l1' && m.frame===171 && m.speaker==='miran'));
    assert.deepEqual(error.missing.filter(m=>m.input==='image').map(m=>[m.shotId,m.role,m.frame]),
      [['s0002','end',170],['s0001','start',171]]);
    assert.deepEqual(error.missing.filter(m=>m.input==='position').map(m=>m.frame),[0,171]);
    return true;
  });
  assert.equal(fs.existsSync(path.join(f.episode,'.work/video-routing/plans')),false);
  const board = path.join(f.dir,'scenes.js');
  fs.appendFileSync(board, '\nwindow.PRODUCTION='+JSON.stringify({videoAuthorization:{
    reference:'Fixture scene spending approval', maxUsd:0, maxConcurrent:1, maxAttempts:1}})+';');
  const castVoices = people.map(({character},i) => {
    const wav = path.join(f.dir,character+'.wav');
    execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','sine=frequency='+(400+100*i)+':duration=1',wav]);
    const tts = {engine:'gemini',voiceId:i?'Kore':'Puck',language:'ko',speed:1};
    return {id:character,tts,voiceReference:{path:wav,tts,sha256:createHash('sha256').update(fs.readFileSync(wav)).digest('hex')}};
  });
  fs.appendFileSync(board,'\nwindow.SB_DOC='+JSON.stringify({characters:castVoices})+';');
  const key = config.astraGenaiApiKey, originalFetch = globalThis.fetch;
  config.astraGenaiApiKey = 'fixture';
  t.after(()=>{globalThis.fetch=originalFetch;config.astraGenaiApiKey=key});
  const route = '/v1/ltx/v2/scene-to-video', submitted = [], validated = [];
  const requestId = f.input.requestId;
  const file = '11'.repeat(16), jobId = '22'.repeat(16);
  let providerStatus = 'processing';
  const stagedWavs=[];
  globalThis.fetch = async (url,options) => {
    const pathname = new URL(url).pathname;
    if (pathname === '/v1/uploads') return Response.json({upload_id:file,chunk_size:1048576,chunks:1});
    if (options.method === 'PUT') {
      const bytes=Buffer.from(options.body);
      if (bytes.toString('ascii',0,4)==='RIFF') stagedWavs.push(bytes);
      return Response.json({});
    }
    if (pathname.endsWith('/complete')) return Response.json({file_id:file,uri:'genai-file://'+file});
    if (pathname === route+'/capabilities') return Response.json({version:1,execution:'per_shot',transitions:['hard_cut'],motion_prefix:true,timed_dialogue:'supplied_performance'});
    if (pathname === route+'/validate') {
      validated.push(JSON.parse(options.body));
      return Response.json({schema_valid:true, model:'ltx-2.5-22b-distilled', shots:2});
    }
    if (pathname === route) {
      assert.equal(options.headers['X-Request-ID'],'scene-'+plan.id);
      submitted.push(JSON.parse(options.body));
      throw new Error('Lost the response after acceptance');
    }
    assert.equal(options.method,'GET');
    assert.ok([route+'/requests/scene-'+plan.id,route+'/'+jobId].includes(pathname));
    return Response.json({request_id:'scene-'+plan.id,id:jobId,status:providerStatus});
  };
  const motionPrefix = path.join(f.episode,'camera.mp4'), performanceAudio = path.join(f.episode,'line.wav');
  execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=size=64x64:rate=24','-frames:v','9',motionPrefix]);
  execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','anullsrc=r=48000:cl=stereo','-t','4.375',performanceAudio]);
  const options = {...f.input,sceneRendering:'per_shot',shotBindings:[{
    shotId:'s0002', keyframes:[{path:'images/trio.png',frame:48}], guidance:{negativePrompt:'captions',guidanceScale:2},
    motionPrefix,
  },{shotId:'s0001',performanceAudio}]};
  await assert.rejects(planManagedVideo(options),/scene_speech_performance/);
  execFileSync('ffmpeg',['-y','-v','error','-f','lavfi','-i','sine=frequency=500:sample_rate=24000','-ac','1','-t','0.75',performanceAudio]);
  await assert.rejects(planManagedVideo(options),/scene_speech_performance/);
  const {speechRevision,compileActing}=await import('../../skills/_shared/speech-contract.js');
  const line=answer.narration[0], actor=castVoices[1], receiptPath=performanceAudio+'.json';
  const {generator,generation}=compileActing(line.tts,line.acting,actor.tts);
  const sha256=createHash('sha256').update(fs.readFileSync(performanceAudio)).digest('hex');
  const receipt={status:'completed',result:{success:true,audioPath:performanceAudio},generator,generation,audioSha256:sha256};
  line.audio={path:performanceAudio,sha256,revision:speechRevision(line,actor),generation:{generator,text:line.tts,language:actor.tts.language,voiceSettings:generation,receiptPath}};
  fs.appendFileSync(board,'\nwindow.SCENES='+JSON.stringify(f.members)+';');
  const before=fs.readFileSync(board);
  fs.writeFileSync(receiptPath,JSON.stringify({...receipt,generation:{...generation,voiceName:castVoices[0].tts.voiceId}}));
  await assert.rejects(planManagedVideo(options),/speech_receipt_voice_mismatch/);
  assert.equal(validated.length,0);
  fs.writeFileSync(receiptPath,JSON.stringify(receipt));
  const plan=await planManagedVideo(options);
  const stagedTake=stagedWavs.find(wav=>wav.length===44+4.375*48000*4);
  assert.equal(stagedTake.readUInt16LE(22),2);
  assert.equal(stagedTake.readUInt32LE(24),48000);
  assert.equal(stagedTake.readUInt16LE(34),16);
  assert.ok(stagedTake.subarray(44,44+48000).some(byte=>byte!==0));
  assert.ok(stagedTake.subarray(44+48000*4).every(byte=>byte===0));
  approveVideo({episode:f.episode,planIds:[plan.id],request:'Generate the two shots under one scene job'});
  const run = () => executeVideo({episode:f.episode,planId:plan.id},()=>assert.fail('unexpected ordinary I2V submission'));
  await assert.rejects(run(), /Lost the response/);
  assert.equal(submitted.length,1);
  assert.deepEqual(validated,[submitted[0],submitted[0]]);
  assert.deepEqual(submitted[0].shots.map(s=>[s.shot_id,s.start_frame,s.end_frame,s.dialogue[0].speaker]),
    [['s0002',0,171,'nephew'],['s0001',171,276,'miran']]);
  assert.equal(submitted[0].shots[1].dialogue[0].frame,171);
  assert.equal(submitted[0].shots[1].performance_uri,'genai-file://'+file);
  assert.equal(submitted[0].shots[0].motion_uri,'genai-file://'+file);
  assert.equal(submitted[0].shots[1].transition,'hard_cut');
  assert.deepEqual(submitted[0].shots.map(s=>s.images.map(i=>i.role)),[['start','keyframe','end','face','face'],['start','face','face']]);
  assert.equal(submitted[0].shots[0].images[1].frame,48);
  assert.deepEqual(submitted[0].shots.map(s=>s.negative_prompt),['captions',undefined]);
  assert.deepEqual(submitted[0].shots.map(s=>[Boolean(s.motion_uri),Boolean(s.performance_uri)]),[[true,false],[false,true]]);
  for (const file of [motionPrefix,performanceAudio]) assert.equal(plan.inputs[file],createHash('sha256').update(fs.readFileSync(file)).digest('hex'));
  assert.deepEqual(submitted[0].shots.map(s=>s.opening_positions),setups.map(s=>s[8].map(row=>({...row,images:[row.character==='nephew'?1:2]}))));
  await videoStatus({episode:f.episode,requestId,action:'refresh'});
  assert.equal((await videoStatus({episode:f.episode,requestId})).providerId,jobId);
  providerStatus = 'failed';
  assert.equal((await videoStatus({episode:f.episode,requestId,action:'refresh'})).status,'failed');
  assert.equal(submitted.length,1);
  assert.deepEqual(fs.readFileSync(board),before);
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

test('EP13 keeps five Linh face pins and only her third-shot voice in one native scene submission', async t => {
  const f = busking(t);
  delete f.scene.audio;
  f.scene.openingPositions = [
    {character:'bo',images:[],position:'At the flower stall.'},
    {character:'ep13-linh',images:[1],position:'In the rear passenger seat.'},
    {character:'mochi',images:[],position:'Off camera.'},
  ];
  execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','testsrc=size=16x16:rate=10',
    '-frames:v','10',path.join(f.dir,'images/ep13-%02d.png')]);
  const linh = pinnedActor(f.dir,'ep13-linh','images/ep13-10.png',450);
  const shots = [
    ['s0040',0,73,1,2,'The sedan stops.'],
    ['s0038',73,146,3,4,'Linh leaves the rear seat.'],
    ['s0002',146,203,5,null,'Linh asks Bơ to marry her.'],
    ['s0003',203,228,6,7,'Mochi releases the cart.'],
    ['s0004',228,267,8,9,'The flowers fall.'],
  ];
  const visible = [['bo'],['bo',linh.id],['bo',linh.id],['mochi'],[]];
  const imagePath = number => 'images/ep13-' + String(number).padStart(2,'0') + '.png';
  const members = shots.map(([id,startFrame,endFrame,first,last,action],i) => {
    const images = [{role:'start',frame:startFrame,path:imagePath(first)}];
    if (last) images.push({role:'end',frame:endFrame-1,path:imagePath(last)});
    return {id, scene:1, duration:(endFrame-startFrame)/24,
      visual:{character:visible[i],video:{engine:'astra-genai',model:'ltx-2.5-22b-distilled',resolution:'720x1280'},
        frames:{mode:last?'first_last':'first',start:imagePath(first),...(last?{end:imagePath(last)}:{})}},
      timeline:{startFrame,endFrame,transition:i?'hard_cut':'open',framing:'Fixed shot.',action,images},
      narration:i===2?[{id:'s0002-l1',speaker:linh.id,delivery:'on_screen',tts:'Anh Bơ, cưới em nha?'}]:[]};
  });
  f.members.splice(0,f.members.length,...members);
  f.save();
  const board = path.join(f.dir,'scenes.js');
  const cast = [linh,{id:'bo',panels:{face:'images/duo.png'}},{id:'mochi',panels:{face:'images/solo.png'}}];
  fs.appendFileSync(board,'\nwindow.SB_DOC='+JSON.stringify({characters:cast})+';\nwindow.PRODUCTION='+
    JSON.stringify({videoAuthorization:{reference:'Fixture scene approval',maxUsd:0,maxConcurrent:1,maxAttempts:1}})+';');

  const selected = 'ltx-2.5-22b-distilled', sceneRoute = '/v1/ltx/v2/scene-to-video';
  const key = config.astraGenaiApiKey, fetch = globalThis.fetch;
  config.astraGenaiApiKey = 'fixture';
  t.after(()=>{config.astraGenaiApiKey=key;globalThis.fetch=fetch});
  const validated = [], submitted = [];
  globalThis.fetch = async (url, options) => {
    const route = new URL(url).pathname;
    if (route === '/v1/ltx/msr/capabilities') return Response.json({voice_references:true});
    if (route === sceneRoute+'/capabilities') return Response.json({version:1,execution:'per_shot',transitions:['hard_cut']});
    if (route === '/v1/uploads') {
      const {sha256} = JSON.parse(options.body);
      return Response.json({upload_id:sha256,chunk_size:1048576,chunks:1});
    }
    const uploadId = route.split('/')[3];
    if (options.method === 'PUT') {
      assert.equal(createHash('sha256').update(options.body).digest('hex'),uploadId);
      return Response.json({});
    }
    if (route.endsWith('/complete')) return Response.json({file_id:uploadId,uri:'genai-file://'+uploadId});
    if (route === sceneRoute+'/validate') {
      validated.push(JSON.parse(options.body));
      return Response.json({schema_valid:true,model:selected,shots:5});
    }
    assert.equal(route,sceneRoute);
    submitted.push(JSON.parse(options.body));
    throw new Error('Captured scene submission');
  };
  const plan = await planManagedVideo({...f.input,requestId:'ep13-s01-right-rear-native-v4'});
  assert.deepEqual([plan.tool,plan.selection.model,plan.selection.operation],['astra_genai_img2video',selected,'image']);
  assert.deepEqual(plan.sceneRequest.shots.map(s=>[s.shotId,s.startFrame,s.endFrame]),shots.map(s=>s.slice(0,3)));
  const face = path.join(f.dir,linh.panels.face);
  const expected = members.flatMap(m=>[
    ...m.timeline.images.map(p=>[m.id,p.role,p.frame,path.join(f.dir,p.path)]),
    [m.id,'face',m.timeline.startFrame,face],
  ]);
  assert.deepEqual(plan.sceneRequest.images.map(p=>[p.shotId,p.role,p.frame,p.path]),expected);
  const voices = plan.sceneRequest.shots.flatMap(s=>(s.dialogue??[]).map(d=>[s.shotId,d.speaker,d.text,d.voice]));
  assert.deepEqual(voices,[['s0002',linh.id,'Anh Bơ, cưới em nha?',{
    path:linh.voiceReference.path,sha256:linh.voiceReference.sha256,provenance:'pinned_settings_and_bytes',
  }]]);
  approveVideo({episode:f.episode,planIds:[plan.id],request:'Generate EP13 scene one'});
  await assert.rejects(executeVideo({episode:f.episode,planId:plan.id},()=>assert.fail('unexpected child submission')),/Captured scene submission/);
  assert.equal(submitted.length,1);
  const [wire] = submitted;
  assert.deepEqual(validated,[wire,wire]);
  assert.deepEqual([wire.model,wire.num_frames,wire.scene_audio],[selected,267,undefined]);
  const pins = wire.shots.flatMap(s=>s.images.map(p=>[s.shot_id,p.role,p.frame,p.image_uri]));
  const uri = file => 'genai-file://' + createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  assert.deepEqual(pins,expected.map(([id,role,frame,file])=>[id,role,frame,uri(file)]));
  assert.equal(new Set(pins.map(pin=>pin[3])).size,10);
  assert.deepEqual(wire.shots.flatMap(s=>(s.dialogue??[]).map(d=>[s.shot_id,d.speaker,d.text,d.voice_uri])),
    [['s0002',linh.id,'Anh Bơ, cưới em nha?',uri(linh.voiceReference.path)]]);
  assert.deepEqual(wire.shots.filter(s=>s.description.includes('All visible mouths stay closed.')).map(s=>s.shot_id),
    ['s0040','s0038','s0003','s0004']);
  assert.ok(wire.shots.every(s=>s.images.find(p=>p.role==='face')?.character===linh.id));
});

test('native scene children bind the active voices locally and reject three speakers in one shot', async t => {
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
  const options = {...f.input,sceneRendering:'per_shot'};
  const plan = planVideo(options,false);
  assert.equal(planVideo(f.input,false).sceneRendering,'per_shot');
  const {body} = await buildSceneWire(plan.sceneRequest,plan.selection.model,plan.selection.resolution);
  const firstFaces = body.shots[0].images.filter(pin => pin.role === 'face');
  const listenerSlot = firstFaces.findIndex(pin => pin.character === listener.id);
  assert.equal(listenerSlot,2);
  assert.equal(firstFaces[listenerSlot].image_uri,'data:image/png;base64,'+fs.readFileSync(path.join(f.dir,listener.panels.face),'base64'));
  assert.deepEqual(body.shots[0].opening_positions.find(row => row.character === listener.id)?.images,[3]);
  assert.deepEqual(body.shots.map(s=>s.dialogue.map(d=>d.speaker)),[['seorin','mai-an'],['mai-an'],['tu-vi']]);
  for (const shot of body.shots) {
    const faces = shot.images.filter(p=>p.role==='face');
    for (const d of shot.dialogue) {
      const actor = cast.find(a=>a.id===d.speaker);
      assert.equal(d.voice_uri,'data:audio/wav;base64,'+fs.readFileSync(actor.voiceReference.path,'base64'));
      const slot = faces.findIndex(p=>p.character===actor.id);
      assert.ok(slot===0 || slot===1);
      assert.deepEqual(shot.opening_positions.find(p=>p.character===actor.id).images,[slot+1]);
    }
  }
  f.members[0].narration.push(line('tu-vi','third'));
  save();
  assert.throws(()=>planVideo(options,false),/scene_render_voice_limit: s0001/);
  f.members.splice(1);
  f.scene.oneTake = true;
  save();
  assert.throws(()=>planVideo(options,false),/scene_render_voice_limit: s0001.*one-take/);
});

test('a refused I2V scene reads the selected endpoint and renderer contract without submitting media',async t=>{
  const key=config.astraGenaiApiKey, fetch=globalThis.fetch;
  config.astraGenaiApiKey='fixture';
  t.after(()=>{config.astraGenaiApiKey=key;globalThis.fetch=fetch});
  const control={descriptions:'prompt',frame_accurate_cuts:false,shot_scoped_references:false,frame_addressed_native_dialogue:false};
  const schema=name=>({$ref:'#/components/schemas/'+name});
  const list=name=>({type:'array',items:schema(name)});
  const definition={paths:{'/v1/ltx/v2/image-to-video':{post:{requestBody:{content:{'application/json':{schema:schema('Input')}}}}}},
    components:{schemas:{Input:{properties:{shots:{anyOf:[{type:'null'},list('Shot')]},keyframes:list('Pin'),references:list('Subject')}},
      Shot:{properties:{description:{},transition:{}}}, Pin:{properties:{frame_idx:{}}},Subject:{properties:{audio_uri:{}}}}}};
  const routes=[];
  globalThis.fetch=async(url,options)=>{
    routes.push(new URL(url).pathname);
    assert.equal(options.method,'GET'); assert.equal(options.body,undefined);
    return Response.json(routes.at(-1)==='/openapi.json'?definition:{pipelines:[{pipeline:'msr',shot_control:control}]});
  };
  const refusal=new SceneInputError('astra_genai_img2video',{images:[{role:'face'}]},[],'ltx-2.5-22b-distilled');
  const contract=await inspectSceneInputContract(refusal);
  assert.deepEqual(routes.sort(),['/openapi.json','/v1/ltx/v2/capabilities']);
  assert.deepEqual(contract.shotControl,control);
  assert.deepEqual(contract.shotFields,['description','transition']);
  assert.deepEqual(contract.temporalImageFields,['frame_idx']);
  assert.deepEqual(contract.referenceFields,['audio_uri']);
  const f=busking(t);
  const compiled=f.capture(request=>request).request;
  const voicePath=path.join(f.dir,f.scene.audio.path);
  compiled.shots[1].dialogue=[{lineId:'reply',speaker:'miran',text:'제가 찢었습니다.',delivery:'on_screen',
    frame:compiled.shots[1].startFrame,voice:{path:voicePath}}];
  const refused=new SceneInputError('astra_genai_img2video',compiled,[],'ltx-2.5-22b-distilled','576x1024');
  const input={requestId:'scene-1',args:{reserveUsd:0}};
  assert.equal((await inspectSceneInputContract(refused,input)).validation.status,'not_sent');
  const endpoint='/v1/ltx/v2/image-to-video/validate';
  definition.paths[endpoint]=definition.paths['/v1/ltx/v2/image-to-video'];
  const discovery=globalThis.fetch;
  let posts=0, wireHash;
  globalThis.fetch=async(url,options)=>{
    if(options.method==='GET') return discovery(url,options);
    assert.equal(new URL(url).pathname,endpoint);
    assert.equal(options.headers['X-Request-ID'],input.requestId);
    wireHash=createHash('sha256').update(options.body).digest('hex');
    const body=JSON.parse(options.body);
    assert.deepEqual(body.shots.map(s=>s.shot_id),compiled.shotIds);
    assert.equal(body.resolution,refused.resolution);
    assert.equal(body.num_frames,compiled.frameCount);
    assert.equal(body.shots[1].transition,'hard_cut');
    assert.equal(body.shots[1].dialogue[0].frame,body.shots[1].start_frame);
    assert.equal(body.shots[1].dialogue[0].voice_uri,'data:audio/wav;base64,'+fs.readFileSync(voicePath,'base64'));
    assert.equal(body.scene_audio.audio_uri,body.shots[1].dialogue[0].voice_uri);
    assert.equal(body.shots.flatMap(s=>s.images).length,compiled.images.length);
    assert.equal(JSON.stringify(body).split('제가 찢었습니다.').length,2);
    posts++;
    return Response.json({error:{message:'body.shots.0.images: extra inputs'}},{status:400});
  };
  const checked=await inspectSceneInputContract(refused,input);
  assert.equal(checked.validation.status,'schema_rejected');
  assert.equal(checked.validation.httpStatus,400);
  assert.equal(checked.validation.bodySha256,wireHash);
  assert.equal(posts,1);
  // A large soundtrack also used as a voice sample travels unchanged through the standard chunked upload.
  fs.appendFileSync(voicePath,Buffer.alloc(4_500_000));
  const sessions=new Map(), finished=new Map();
  globalThis.fetch=async(url,options)=>{
    const route=new URL(url).pathname;
    if(options.method==='GET') return discovery(url,options);
    if(route==='/v1/uploads'){
      const info=JSON.parse(options.body), id=String(sessions.size+1);
      sessions.set(id,info);
      return Response.json({upload_id:id,chunk_size:5*1024*1024,chunks:1});
    }
    if(options.method==='PUT'){
      const id=route.split('/')[3], sha=createHash('sha256').update(options.body).digest('hex');
      assert.equal(sha,sessions.get(id).sha256);
      finished.set(id,sha);
      return Response.json({});
    }
    if(route.endsWith('/complete')){
      const id=route.split('/')[3];
      assert.ok(finished.has(id));
      return Response.json({file_id:id,uri:'genai-file://'+id});
    }
    assert.equal(route,endpoint);
    assert.ok(Buffer.byteLength(options.body)<8000000);
    const body=JSON.parse(options.body);
    assert.equal(body.image_uri,body.shots[0].images.find(p=>p.role==='start').image_uri);
    assert.equal(body.scene_audio.audio_uri,body.shots[1].dialogue[0].voice_uri);
    assert.ok(body.shots.flatMap(s=>s.images).every(p=>p.image_uri.startsWith('genai-file://')));
    return Response.json({error:{message:'unsupported shot inputs'}},{status:400});
  };
  const staged=(await inspectSceneInputContract(refused,input)).validation;
  assert.equal(staged.status,'schema_rejected');
  assert.equal(staged.attachments.length,compiled.images.length+2);
  assert.equal(staged.requestBody.shots[1].dialogue[0].text,'제가 찢었습니다.');
  assert.equal(staged.bodySha256,createHash('sha256').update(JSON.stringify(staged.requestBody)).digest('hex'));
  assert.equal(checked.validation.requestBody,undefined);
  assert.equal(staged.attachments.at(-1).sha256,createHash('sha256').update(fs.readFileSync(voicePath)).digest('hex'));
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

test('a saved one-take A2V request keeps the original audio, five intermediate cues and both endpoint fields', t => {
  const f = busking(t), first = f.members[0];
  first.narration=[{id:'line',speaker:'seorin',delivery:'on_screen',tts:'Ready?'}];
  const cards = f.members.flatMap(m => m.timeline.images);
  f.members.splice(1);
  first.duration = 15;
  first.timeline.endFrame = 360;
  delete first.timeline.images;
  first.visual.frames = {
    mode:'first_last', start:cards[0].path, end:cards.at(-1).path,
    storyboardKeyframes:cards.map(p => ({file:p.path, startFrame:p.frame})),
  };
  f.scene.oneTake = true;
  f.save();
  const args = {...f.input.args, imagePath:path.join(f.dir,cards[0].path),
    lastFramePath:path.join(f.dir,cards.at(-1).path), audioPath:path.join(f.dir,f.scene.audio.path)};
  const plan = planVideo({...f.input,args});
  const body = buildGenaiAudioBody(plan.args);
  assert.deepEqual(body.keyframes.map(p => p.frame_idx), [42,52,112,191,336]);
  assert.deepEqual(plan.imageBindings.filter(p => p.submitted).map(p => p.frame).sort((a,b)=>a-b),[0,42,52,112,191,336,359]);
  assert.equal(body.audio_uri,'data:audio/wav;base64,'+fs.readFileSync(args.audioPath).toString('base64'));
  assert.throws(()=>planVideo({...f.input,args:{...args,imagePath:args.lastFramePath}}),/image_plan_mismatch/);
  first.visual.frames.keyframes = [{image:cards[2].path,atSeconds:42/24,state:'The dancer steps forward.',strength:0.4}];
  f.save();
  const revised = planVideo({...f.input,args});
  assert.deepEqual(revised.args.keyframes.map(p=>[path.basename(p.imagePath),p.frameIdx,p.strength]), [['solo.png',42,0.4]]);
  assert.match(revised.args.prompt,/At 1\.75 seconds: The dancer steps forward/);
});

test('a distilled I2V prop stays separate from the opening image and silent dancers',async t=>{
 const f=busking(t), m=f.members[0];
 delete f.scene.audio; f.members.splice(1);
 m.duration=3; m.timeline.endFrame=72;
 m.timeline.action='The plaza stays empty until Mai An enters from the left.';
 m.visual.video.model='ltx-2.5-22b-distilled';
 m.visual.references = [{id:'bag',role:'prop',use:'video',purpose:'A canvas bag.',path:'images/duo.png'}];
 f.scene.openingPositions[1].images=[1]; f.save();
 const key=config.astraGenaiApiKey, fetch=globalThis.fetch;
 config.astraGenaiApiKey='fixture'; t.after(()=>{config.astraGenaiApiKey=key;globalThis.fetch=fetch});
 let enabled=false;
 globalThis.fetch=async (url,opts)=>{
   assert.equal(opts.method,'GET');assert.ok(String(url).endsWith('/msr/capabilities'));
   return Response.json({image_conditioning:enabled});
 };
 await assert.rejects(planManagedVideo(f.input),e=>e.missing[0].input==='deployment');
 enabled=true;
 const plan=await planManagedVideo(f.input);
 assert.deepEqual(plan.args.references.map(p=>path.basename(p.imagePath)),['duo.png']);
 assert.equal(plan.imageBindings.find(i=>i.id==='start').path,path.join(f.dir,'images/opening.png'));
 assert.match(plan.args.prompt,/mai-an: Off screen/);
 assert.match(plan.args.prompt,/no subtitles/);
 m.timeline.images[0].strength=0.25; f.save();
 assert.throws(()=>planVideo(f.input), /scene_inputs_unsupported/);
});

test('a 25-frame silent scene retains its length and all three authored face references', t => {
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
  const image = planVideo({...f.input,operation:'image'});
  assert.equal(image.args.numFrames,25);
  assert.equal(image.args.duration,undefined);
  assert.deepEqual(image.args.references.map(ref=>path.basename(ref.imagePath)),['solo.png','duo.png','trio.png']);
  assert.ok(image.args.references.every(ref=>!ref.audioPath));
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


test('supplied scene audio binds the selected model and original file to per-shot plans', async t => {
  for (const mode of ['mix','conditioning']) {
    const f=busking(t);
    f.scene.audio.mode=mode;
    f.members[0].narration=[{id:'line',speaker:'seorin',delivery:mode==='conditioning'?'on_screen':'off_screen',tts:'Ready?'}];
    f.members[0].timeline.dialogueCues=[{lineId:'line',frame:0}];
    for (const shot of f.members) {
      shot.visual.video.operation=mode==='mix' ? 'image' : 'audio';
      shot.visual.video.model=mode==='mix' ? 'ltx-2.5-22b-distilled' : 'ltx-2.5-22b-dev';
    }
    f.save();
    const plan=planVideo({...f.input,sceneRendering:'per_shot'},false);
    const track=plan.sceneRequest.audio;
    assert.equal(plan.inputs[track.path],createHash('sha256').update(fs.readFileSync(track.path)).digest('hex'));
    assert.equal(track.mode,mode);
    const {body}=await buildSceneWire(plan.sceneRequest,plan.selection.model,plan.selection.resolution);
    if (mode==='mix') {
      assert.ok(body.shots.every(shot=>shot.description.includes('All visible mouths stay closed.')));
      assert.equal(plan.sceneRequest.shots[0].dialogue,undefined);
      assert.ok(!plan.args.prompt.includes('Ready?'));
    } else {
      assert.equal(plan.sceneRequest.shots[0].dialogue[0].frame,0);
      assert.equal(JSON.parse(JSON.stringify(body)).shots[0].dialogue[0].frame,undefined);
      execFileSync('ffmpeg',['-y','-v','error','-f','lavfi','-i','sine=frequency=600:duration=0.25',track.path]);
      assert.throws(()=>planVideo({...f.input,sceneRendering:'per_shot'},false),/scene_audio_timing/);
    }
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

test('scene camera returns to its default after the insert and every shot cue reaches the wire body', async () => {
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
  const {request,providerPrompt} = build(cards);
  const {buildSceneWire} = await import('../dist/scene-video.js');
  const {body} = await buildSceneWire(request,'ltx-2.5-22b-distilled','720p');
  assert.doesNotMatch(body.prompt,/static|Dusk|Watch the lamp/);
  assert.match(body.prompt,/window side/);
  for (const i of [0,2]) {
    assert.match(body.shots[i].description,/static frame/);
    assert.match(body.shots[i].description,/Dusk light/);
    assert.match(body.shots[i].description,/Watch the lamp/);
  }
  for (const phrase of ['slowly pushes','broken seal','Settle on the seal','right profile','Close-up','eye level','Tap the brass bell twice','Rack focus from the seal to the lamp','lower eyelid','folds the letter','passing shadow']) {
    assert.ok(body.shots[1].description.includes(phrase),phrase);
    assert.ok(providerPrompt.includes(phrase),phrase);
  }
  assert.doesNotMatch(body.shots[1].description,/static frame|Dusk/);
  assert.match(body.shots[1].description,/Read the seal.*Press the signet.*At 0.5 s into this shot: A hairline crack/);
  assert.equal(body.shots[1].description.match(/Press the signet/g).length,1);
  assert.doesNotMatch(body.prompt + body.shots[2].description,/Press the signet|hairline crack/);
  const single = await buildSceneWire(build([cards[0]]).request,'ltx-2.5-22b-distilled','720p');
  assert.match(single.body.prompt,/Suspicion turns to relief/);
  assert.match(single.body.prompt,/static frame/);
  const acting = {context:'The clerk is watching.',intent:'Make the guard underestimate her.',emotion:'Panic gives way to defiance.',
    visual:'Her hand grips the lock.',direction:'Stammer on the first syllable.',vocal:'Drop to a whisper.',tags:['sighs','Sighs.'],leadInSeconds:1.5,tailOutSeconds:0.75};
  const line = {id:'l1',speaker:'miran',delivery:'on_screen',tts:'Not yet.',acting};
  const spoken = {...cards[0], narration:[line], timeline:{...cards[0].timeline,dialogueCues:[{lineId:'l1',frame:0}]}};
  for (const list of [[spoken], [spoken,...cards.slice(1)]]) {
    const directed = await buildSceneWire(build(list).request,'ltx-2.5-22b-distilled','720p');
    const first = directed.body.shots[0];
    for (const cue of [acting.intent,acting.emotion,acting.context,acting.visual,'Anticipation 1.5 seconds','reaction 0.75 seconds'])
      assert.ok(first.description.includes(cue),cue);
    assert.equal(first.dialogue[0].text,line.tts);
    assert.equal(first.dialogue[0].direction,'Stammer on the first syllable. Drop to a whisper. sighs');
    assert.ok(build(list).providerPrompt.includes(first.dialogue[0].direction));
    assert.ok(!first.description.includes(acting.vocal));
    assert.ok(!first.description.includes(line.tts));
    assert.ok(!directed.body.shots.slice(1).some(s=>s.description.includes(acting.visual)));
  }
  const exchange = {...cards[0], narration:[
    {id:'answer',speaker:'miran',delivery:'on_screen',tts:'Locked.'},
    {id:'question',speaker:'miran',delivery:'on_screen',tts:'Is it open?'}],
    timeline:{...cards[0].timeline,dialogueCues:[{lineId:'question',frame:1},{lineId:'answer',frame:20}]},
    performance:[{kind:'dialogue',group:2,character:'miran'},{kind:'action',text:'Touch the latch.'},{kind:'dialogue',group:1,character:'miran'}]};
  for (const list of [[exchange],[exchange,...cards.slice(1)]]) {
    const {request} = build(list);
    const wire = await buildSceneWire(request,'ltx-2.5-22b-distilled','720p');
    assert.deepEqual(wire.body.shots[0].dialogue.map(l=>[l.id,l.text,l.frame]),[['question','Is it open?',1],['answer','Locked.',20]]);
    assert.match(wire.body.shots[0].description,/As miran speaks\. Touch the latch\. As miran speaks\./);
    assert.doesNotMatch(wire.body.shots[0].description, /question|answer/);
    assert.doesNotMatch(wire.body.shots[0].description,/Is it open\?|Locked\./);
  }
  const film = (await import('../../skills/storyboard/references/film-techniques.js')).default;
  for (const entry of film.entries.filter(e=>e.fields.movement && e.fields.speed)) {
    defaults.camera = entry.id;
    const paced = await buildSceneWire(build([cards[0]]).request,'ltx-2.5-22b-distilled','720p');
    assert.match(paced.body.prompt, entry.fields.speed === 'slow' ? /slowly/ : /quickly/,entry.id);
  }
  defaults.camera = 'camera.static';
  delete cards[1].visual.camera.view;
  delete cards[1].visual.video.promptSource.end;
  cards[1].visual.frames = {mode:'first_last', endState:'The raven closes its claw around the sapphire.'};
  cards[1].shot.depth = {mode:'shallow',reads:1,focus:'the brass bell',sound:'near'};
  for (const attention of ['From the seal to the lamp', 'the brass bell']) {
    const checked = await buildSceneWire(build(cards).request,'ltx-2.5-22b-distilled','720p');
    assert.doesNotMatch(checked.body.prompt + checked.body.shots[1].description,/Watch the lamp/);
    assert.ok(checked.body.shots[1].description.includes('Attention: ' + attention));
    assert.match(checked.body.shots[1].description,/claw around the sapphire/);
    assert.match(checked.body.shots[2].description,/Watch the lamp/);
    cards[1].shot.techniques = [];
  }
  delete board.STRUCTURE.scenes[0].directionDefaults;
  scene.camera='Keep the camera locked throughout.';
  const legacy = build(cards).request;
  assert.ok(!legacy.sceneDirection.camera && !legacy.shots[1].framing.includes('locked'));
  assert.match(legacy.shots[2].framing,/locked/);
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
