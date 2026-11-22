import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { bindRegisteredPanels, inspectSceneInputContract, prepareSceneRequest, mapSceneInputs, SceneInputError } from '../dist/scene-video.js';
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
 data.write('data',36); data.writeUInt32LE(data.length-44,40); data.writeInt16LE(9000,44+14000*2);
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
 const blocked=await ROUTES.video_plan({...f.input,operation:'audio'});
 assert.equal(blocked.isError,true);
 const report=JSON.parse(blocked.content[0].text);
 assert.equal(report.executable,false); assert.equal(report.planId,undefined);
 assert.deepEqual(report.sceneRequest,request);
 assert.deepEqual(report.missing.map(m=>[m.input,m.frame]),[
   ['transition',42],['transition',52],
 ]);
 assert.ok(!fs.existsSync(path.join(f.episode,'.work/video-routing/plans')));
 f.members[2].visual.camera={movement:'pan right',target:'the dancers',end:'The dancers fill the frame.'};
 f.save();
 const moved=await ROUTES.video_plan({...f.input,operation:'audio'});
 assert.match(JSON.parse(moved.content[0].text).sceneRequest.prompt,/s0003 [^\n]*?pan[^\n]*Closing frame: The dancers fill the frame/i);
 for (const op of ['image','text']) {
   assert.throws(()=>planVideo({...f.input,operation:op}),e=>e.missing.some(m=>m.input==='audio') &&
     e.missing.filter(m=>m.input==='transition').length===2);
 }
 f.scene.oneTake=true; f.save();
 assert.throws(()=>planVideo(f.input),/scene_one_take/);
});

test('one-take endpoint board reaches the A2V body with a single audio file and both endpoint images',t=>{
 const f=busking(t);
 const first=f.members[0];
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
 assert.equal(planVideo({...f.input,sceneNo:undefined,shotId:first.id}).id,plan.id);
 first.timeline.images.push({role:'face',frame:0,path:'images/duo.png',character:'mai-an'});
 f.save();
 assert.throws(()=>planVideo(f.input),err=>err.missing.some(m=>m.role==='face' && m.shotId===first.id));
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
  }
  accusation.timeline.images.push({role:'end', frame:170,path:'images/ending.png'});
  answer.timeline.dialogueCues = [{lineId:'s0001-l1',frame:171}];
  f.save();
  const {request, mapped} = prepareSceneRequest(1,f.members,f.scene,f.episode,f.members.flatMap(m=>m.narration),
    {bindDialogue:false,bindOpening:false,suffix:''},captureScene);
  const wire = await readCapture(mapped);
  assert.deepEqual(wire.cuts,[{from:'s0002',to:'s0001',frame:171,transition:'hard_cut'}]);
  assert.deepEqual(wire.images.map(p=>[p.shotId,p.role,p.frame]),[
    ['s0002','start',0],['s0002','face',0],['s0002','end',170],['s0001','start',171],['s0001','face',171],
  ]);
  for (const [i, shot] of wire.shots.entries()) {
    assert.equal(shot.dialogue[0].speaker, setups[i][4]);
    assert.equal(shot.dialogue[0].text, setups[i][5]);
    assert.deepEqual(shot.openingPositions,setups[i][8]);
    assert.equal(wire.prompt.split(shot.dialogue[0].text).length,2);
    assert.equal(wire.prompt.split(shot.sound).length,2);
  }
  assert.equal(wire.shots[1].dialogue[0].frame,171);
  assert.throws(()=>planVideo(f.input), error=>{
    assert.deepEqual(error.sceneRequest,request);
    assert.deepEqual(error.missing.filter(m=>m.input==='reference').map(m=>m.frame),[0,171]);
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
  const before = fs.readFileSync(board);
  const key = config.astraGenaiApiKey, originalFetch = globalThis.fetch;
  config.astraGenaiApiKey = 'fixture';
  t.after(()=>{globalThis.fetch=originalFetch;config.astraGenaiApiKey=key});
  const route = '/v1/ltx/v2/scene-to-video', submitted = [], validated = [];
  const requestId = f.input.requestId;
  const file = '11'.repeat(16), jobId = '22'.repeat(16);
  let providerStatus = 'processing';
  globalThis.fetch = async (url,options) => {
    const pathname = new URL(url).pathname;
    if (pathname === '/v1/uploads') return Response.json({upload_id:file,chunk_size:1048576,chunks:1});
    if (options.method === 'PUT') return Response.json({});
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
  const performanceAudio=path.join(f.dir,'performance.wav'), motionPrefix=path.join(f.dir,'prefix.mp4');
  fs.writeFileSync(performanceAudio,Buffer.from('fixture-wave'));
  fs.writeFileSync(motionPrefix,Buffer.from('fixture-motion'));
  const plan = await planManagedVideo({...f.input,sceneRendering:'per_shot',shotBindings:[{
    motionPrefix,shotId:'s0002', keyframes:[{path:'images/trio.png',frame:48}], guidance:{negativePrompt:'captions',guidanceScale:2},
  },{shotId:'s0001',performanceAudio}]});
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
  assert.deepEqual(submitted[0].shots.map(s=>s.images.map(i=>i.role)),[['start','face','keyframe','end'],['start','face']]);
  assert.equal(submitted[0].shots[0].images[2].frame,48);
  assert.deepEqual(submitted[0].shots.map(s=>s.negative_prompt),['captions',undefined]);
  assert.deepEqual(submitted[0].shots.map(s=>s.opening_positions),setups.map(s=>s[8]));
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
 const input=f.input;
 assert.throws(()=>planVideo({...input,args:{...input.args,duration:8}}),/scene_video_timing/);
 await assert.rejects(planManagedVideo(input),e=>e.missing[0].input==='deployment');
 assert.ok(!fs.existsSync(path.join(f.episode,'.work/video-routing/plans')));
 enabled=true;
 const plan=await planManagedVideo(input);
 const ids=Object.fromEntries(plan.args.keyframes.map(pin=>[pin.imagePath,path.basename(pin.imagePath)]));
 const body=buildDesktopBody('keyframes',plan.args,ids);
 assert.deepEqual(body.keyframes.map(p=>[p.assetId,p.frameIndex]),[['opening.png',0],['play-contact.png',42],['ending.png',83]]);
 assert.throws(()=>mapSceneInputs({...plan.sceneRequest,cuts:[{from:'s1',to:'s2',frame:42,transition:'hard_cut'}]},plan.tool),
   error=>error.missing.length===1 && error.missing[0].input==='transition');
});

test('a saved one-take A2V request keeps the original audio, five intermediate cues and both endpoint fields', t => {
  const f = busking(t), first = f.members[0];
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
  assert.match(revised.args.prompt,/Frame 42: The dancer steps forward/);
});

test('a distilled I2V subject panel belongs to an off-screen dancer, separately from the first frame',async t=>{
 const f=busking(t), m=f.members[0];
 delete f.scene.audio; f.members.splice(1);
 m.duration=3; m.timeline.endFrame=72;
 m.timeline.action='The plaza stays empty until Mai An enters from the left.';
 m.visual.video.model='ltx-2.5-22b-distilled';
 m.timeline.images.push({role:'outfit',frame:0,path:'images/duo.png',character:'mai-an'});
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
 assert.match(plan.args.prompt,/mai-an \(Image 1\): Off screen/);
 assert.match(plan.args.prompt,/no subtitles/);
 m.timeline.images.at(-1).strength=0.25; f.save();
 assert.throws(()=>planVideo(f.input), e=>e.missing.some(i=>i.role==='outfit' && i.frame===0 && i.shotId));
});

test('a 25-frame scene retains its length for three I2V face references and for T2V', t => {
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
  assert.deepEqual(image.args.references.map(p=>path.basename(p.imagePath)),['solo.png','duo.png','trio.png']);
  shot.timeline.images = [];
  for (const owner of f.scene.openingPositions) owner.images = [];
  f.save();
  assert.equal(planVideo({...f.input,operation:'text'}).args.numFrames,25);
});

test('Veo reference-only scenes send owned face and outfit assets without a timed first frame', t => {
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
  shot.visual.video = {engine:'veo',model:'veo-3.1-fast-generate-001',resolution:'720p',operation:'reference'};
  f.save();
  const plan = planVideo({...f.input,args:{}});
  const body = buildVeoBody(plan.args);
  assert.equal(body.instances[0].referenceImages.length,2);
  assert.ok(body.instances[0].referenceImages.every(p => p.image.bytesBase64Encoded));
  assert.deepEqual(plan.imageBindings.map(b => [b.shotId,b.frame,b.role,b.character]),[
    ['s0001',0,'face','mai-an'],['s0001',0,'outfit','mai-an'],
  ]);
  assert.match(plan.args.prompt,/mai-an \(Image 1, Image 2\): Off screen/);
  shot.timeline.images = [];
  shot.visual.video.operation='text';
  f.scene.openingPositions[1].images=[];
  f.save();
  assert.throws(()=>planVideo({...f.input,args:{durationSeconds:4}}),/scene_video_timing/);
});


test('supplied scene audio binds the selected model and original file to per-shot plans', t => {
  for (const mode of ['mix','conditioning']) {
    const f=busking(t);
    f.scene.audio.mode=mode;
    for (const shot of f.members) {
      shot.visual.video.operation=mode==='mix' ? 'image' : 'audio';
      shot.visual.video.model=mode==='mix' ? 'ltx-2.5-22b-distilled' : 'ltx-2.5-22b-dev';
    }
    f.save();
    const plan=planVideo({...f.input,sceneRendering:'per_shot'},false);
    const track=plan.sceneRequest.audio;
    assert.equal(plan.inputs[track.path],createHash('sha256').update(fs.readFileSync(track.path)).digest('hex'));
    assert.equal(track.mode,mode);
  }
});
