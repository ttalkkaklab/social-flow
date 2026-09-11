import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtempSync,writeFileSync,readFileSync,copyFileSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const require=createRequire(import.meta.url),ref=path.resolve(import.meta.dirname,'../../skills/storyboard/references');
const {recommend,checkScene,checkEpisode}=require(path.join(ref,'render-routing.js'));
const still=()=>({type:'points',duration:8,narration:[{tts:'A portrait.',sub:'A portrait.'}],shot:{infoType:'other',render:{mode:'still_camera',purpose:'portrait',reason:'Introduce the inventor.',camera:{effect:'push',target:'face',reason:'Make the identity clear.'}}},visual:{bg:'images/portrait.png',camera:{movement:'dolly in'},slide:{kind:'camera',motion:true,file:'slides/s1-camera.html'}}});
const physical=(character=false)=>({type:'points',duration:8,shot:{infoType:'principle',render:{mode:character?'character_html':'object_html',purpose:character?'human_process':'mechanism',reason:'Show the causal action.',action:character?'The worker lifts the load onto the cart.':'The valve opens and admits water.',...(character?{actors:['worker']}:{})}},visual:{slide:{kind:'diagram',motion:true,treatment:'editorial',subject:{kind:'object'},object:{renderer:'mesh'}}}});
const graph=()=>({type:'points',duration:8,narration:[{tts:'Compare the two values.'}],shot:{infoType:'statistic',render:{mode:'data_graph',purpose:'comparison',reason:'Compare measured counts.',data:{title:'Measured counts',source:'research.md#counts',unit:'units',chart:'bar',baseline:0,beats:[{group:1,focus:['B'],insight:'B is twice A.'}],values:[{label:'A',value:16},{label:'B',value:32}]}}},visual:{slide:{kind:'diagram',motion:true,treatment:'editorial',subject:{kind:'data'},chartRenderer:'svg-v1'}}});
const video=()=>({type:'cover',shot:{infoType:'other',render:{mode:'generated_video',purpose:'live_action',reason:'The flowing fabric carries the mood.',motionEssential:true,action:'Wind lifts the fabric while the actor turns.',whyNotStill:'The changing silhouette requires continuous natural motion.'}},visual:{video:{engine:'seedance'},why:'Continuous cloth and body motion.'}});
test('the five visual routes have valid independent production handoffs',()=>{
 for(const scene of [still(),physical(true),physical(),graph(),video()])assert.deepEqual(checkScene(scene),[]);
});
test('subject nouns and incidental counts do not dictate the mode',()=>{
 assert.equal(recommend('portrait'),'still_camera');
 assert.equal(recommend('human_process'),'character_html');
 assert.equal(recommend('mechanism'),'object_html');
 assert.equal(recommend('comparison'),'data_graph');
 const s=physical();s.shot.render.reason='Explain how gears with 16 and 32 teeth mesh.';
 assert.deepEqual(checkScene(s),[]);
});
test('opening cut may be still, graph or character without a video quota',()=>{
 for(const s of [still(),graph(),physical(true)]){s.type='cover';assert.deepEqual(checkScene(s),[])}
});
test('missing choice and semantic mismatches block drafts before assets',()=>{
 const s=still();delete s.shot.render;assert.match(checkScene(s,{draft:true}).join(),/supported mode/);
 const wrong=physical();wrong.shot.render.mode='generated_video';assert.match(checkScene(wrong,{draft:true}).join(),/requires object_html/);
 const r=still();r.shot.infoType='statistic';assert.match(checkScene(r,{draft:true}).join(),/quantitative purpose/);
});
test('do not replace a portrait with a character, or add decorative actors to machinery',()=>{
 const s=still();s.shot.render.mode='character_html';assert.match(checkScene(s,{draft:true}).join(),/requires still_camera/);
 const o=physical();o.shot.render.actors=['decorative host'];assert.match(checkScene(o).join(),/decorative actors/);
 const c=physical(true);delete c.shot.render.actors;assert.match(checkScene(c).join(),/needs actors/);
});
test('HTML and video declarations cannot silently swap the chosen route',()=>{
 const s=still();s.visual.video={engine:'seedance'};assert.match(checkScene(s).join(),/cannot hand off/);
 const c=physical(true);c.visual.slide.object.renderer='sheet';assert.match(checkScene(c).join(),/real mesh/);
 const v=video();delete v.visual.why;assert.match(checkScene(v).join(),/visual.why/);
 delete v.shot.render.whyNotStill;assert.match(checkScene(v,{draft:true}).join(),/whyNotStill/);
});
test('data graphs require source values, appropriate charts and honest proportions',()=>{
 for(const field of ['source','unit','values']){const s=graph();delete s.shot.render.data[field];assert.ok(checkScene(s).length)}
 const s=graph();s.shot.render.data.baseline=10;assert.match(checkScene(s).join(),/baseline 0/);
 s.shot.render.data.values[0].value=Infinity;assert.match(checkScene(s).join(),/source values/);
 const t=graph();t.shot.render.purpose='trend';assert.match(checkScene(t).join(),/chart suited/);
 const p=graph();Object.assign(p.shot.render,{purpose:'share'});Object.assign(p.shot.render.data,{chart:'stacked-bar',total:100});assert.match(checkScene(p).join(),/sum/);
 p.shot.render.data.total=48;assert.deepEqual(checkScene(p),[]);
});
test('camera focus cannot become a generic zoom and needs measured regions by production',()=>{
 const s=still();s.shot.render.camera.effect='rack-focus';assert.deepEqual(checkScene(s,{draft:true}),[]);
 assert.match(checkScene(s).join(),/focus region|zoom anchor/);
 Object.assign(s.shot.render.camera,{focusFrom:[.3,.6,.1,.1],focusTo:[.3,.4,.1,.1]});s.visual.slide={kind:'camera',motion:true,file:'slides/s1-camera.html'};
 assert.deepEqual(checkScene(s),[]);
});
test('existing recordings and shared outro retain their source; false recording markers do not hide video',()=>{
 assert.deepEqual(checkScene({type:'outro'}),[]);
 assert.deepEqual(checkScene({type:'broll',visual:{source:'recording',clip:'footage/evidence.mp4'}}),[]);
 assert.ok(checkScene({type:'broll',visual:{source:'recording',video:{engine:'seedance'}}}).length);
});
test('normal CLI enforces routing even for a board without a new policy marker',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'routing-plan-'));
 try{const s=still();delete s.shot.render;writeFileSync(path.join(dir,'scenes.js'),'window.SCENES='+JSON.stringify([s])+';');
 const r=spawnSync(process.execPath,[path.join(ref,'check-scenes.js'),dir,'--draft','--json'],{encoding:'utf8'});
 assert.notEqual(r.status,0);assert.match(r.stdout,/shot.render: choose a supported mode/);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
test('shared camera template passes the production HTML contract',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'routing-camera-'));
 try{mkdirSync(path.join(dir,'slides/assets'),{recursive:true});const s=still();s.visual.slide={kind:'camera',motion:true,file:'slides/s1-camera.html'};
 writeFileSync(path.join(dir,'scenes.js'),'window.SCENES='+JSON.stringify([s])+';');
 copyFileSync(path.join(ref,'camera-slide-template.html'),path.join(dir,'slides/s1-camera.html'));
 copyFileSync(path.join(ref,'still-camera.js'),path.join(dir,'slides/assets/still-camera.js'));
 const r=spawnSync(process.execPath,[path.join(ref,'check-slide.js'),dir,'--require-all'],{encoding:'utf8'});
 assert.equal(r.status,0,r.stdout+r.stderr);
 }finally{rmSync(dir,{recursive:true,force:true})}
});

test('a previz clip is bound by hash, rendered at whole seconds, and named in the prompt',()=>{
 const {checkPreviz}=require(path.join(ref,'render-routing.js'));
 const good=()=>{const v=video();v.duration=5;v.visual.bg='images/scene-1.png';Object.assign(v.visual.video,{modelPurpose:'previz',modelReason:'The orbit lands on the sentence',realFaceInput:false,
  referenceImagePaths:['images/scene-1.png','characters/porter/body.png'],previz:{clip:'previz/s1.mp4',sha256:'b'.repeat(64),fps:24,seconds:5},
  prompt:'Image 1 is the first frame. Use Video 1, a 3D clay-model previz, as the only reference for camera movement, shot rhythm, subject trajectory and blocking; strictly keep its camera path and pacing. Do not reference its visual content. The red model in Video 1 is the porter from Image 2. A stone courtyard at dusk. The porter stays consistent with Image 2.'});return v};
 assert.deepEqual(checkScene(good()),[]);
 assert.deepEqual(checkPreviz(video()),[]);
 const edits=[
  [s=>{s.visual.video.previz.clip='https://x/s1.mp4'},/local mp4/],
  [s=>{delete s.visual.video.previz.sha256},/sha256/],
  [s=>{s.visual.video.previz.seconds=4.5},/whole number/],
  [s=>{s.visual.video.previz.fps=61},/24–60/],
  [s=>{s.visual.video.previz.fps=23.976},/24–60/],
  [s=>{s.visual.video.modelPurpose='reference'},/modelPurpose:"previz"/],
  [s=>{s.visual.video.referenceImagePaths=['characters/porter/body.png']},/referenceImagePaths\[0\]/],
  [s=>{s.visual.video.lastImagePath='images/scene-1-end.png'},/no end frame/],
  [s=>{s.visual.video.prompt=s.visual.video.prompt.replace('Video 1, a','the clip, a').replace('in Video 1','in the clip')},/"Video 1"/],
  [s=>{s.visual.video.prompt=s.visual.video.prompt.replace('Image 1 is the first frame. ','')},/first frame/],
  [s=>{s.visual.video.prompt=s.visual.video.prompt.replace('Do not reference its visual content. ','')},/visual content/],
  [s=>{s.shot.render.mode='still_camera'},/generated_video cut/],
 ];
 for(const [edit,pattern] of edits){const s=good();edit(s);assert.match(checkPreviz(s).join(),pattern)}
 // A draft has no hash and no prompt yet; the shape rules still hold.
 const d=good();delete d.visual.video.previz.sha256;d.visual.video.prompt='';assert.deepEqual(checkPreviz(d,{draft:true}),[]);
 d.visual.video.previz.seconds=0;assert.match(checkPreviz(d,{draft:true}).join(),/whole number/);
});
// ── free stock material (scenes-schema §stock material) ──
const routing=require(path.join(ref,'render-routing.js'));
const stockLicense=()=>({provider:'nasa',url:'https://images.nasa.gov/details/A11',license:'NASA media usage guidelines',licenseUrl:'https://www.nasa.gov/nasa-brand-center/images-and-media/',attributionRequired:false,commercial:true,modify:true,retrievedAt:'2026-09-07'});
const stockVideo=(purpose='archive')=>({type:'points',duration:6,narration:[{tts:'The launch.'}],shot:{infoType:'other',render:{mode:'stock_video',purpose,reason:'The actual 1969 launch is the sentence.',action:'The rocket clears the tower.'}},visual:{source:'stock',clip:'footage/s3-nasa-a11.mp4',license:stockLicense()}});
test('a stock clip is a route of its own: archive only, live_action/atmosphere/place as an alternative',()=>{
 assert.deepEqual(routing.modesFor('archive'),['stock_video']);
 assert.deepEqual(routing.modesFor('live_action'),['generated_video','stock_video']);
 assert.deepEqual(routing.modesFor('place'),['still_camera','stock_video']);
 assert.deepEqual(routing.modesFor('portrait'),['still_camera']);
 assert.deepEqual(checkScene(stockVideo()),[]);
 assert.deepEqual(checkScene(stockVideo('live_action')),[]);
 assert.match(checkScene(stockVideo('portrait')).join('\n'),/portrait requires still_camera/);
 assert.match(checkScene({...stockVideo(),visual:{source:'stock',license:stockLicense()}}).join('\n'),/visual\.clip under footage/);
 assert.deepEqual(checkScene({...stockVideo(),visual:{source:'stock',license:stockLicense()}},{draft:true}),[]);
});
test('full_video keeps a supplied stock clip and still refuses other substitutions',()=>{
 assert.deepEqual(checkScene(stockVideo(),{production:{mode:'full_video'}}),[]);
 assert.match(checkScene(still(),{production:{mode:'full_video'}}).join('\n'),/requires generated_video/);
});
test('the license record is checked on every stock source, photo or clip',()=>{
 const lic=stockLicense();
 assert.deepEqual(routing.checkLicense({license:lic}),[]);
 for(const [key,value,re] of [['commercial',false,/commercial must be true/],['modify',false,/modify must be true/],['shareAlike',true,/share-alike/],['url','not a url',/url must be/],['retrievedAt','yesterday',/retrievedAt/],['attributionRequired','yes',/attributionRequired/]])
  assert.match(routing.checkLicense({license:{...lic,[key]:value}}).join('\n'),re,key);
 assert.match(routing.checkLicense({license:{...lic,attributionRequired:true}}).join('\n'),/attribution text/);
 assert.deepEqual(routing.checkLicense({license:{...lic,attributionRequired:true,attribution:'NASA/KSC'}}),[]);
 const photo=still();photo.visual.source='stock';photo.visual.license=lic;
 assert.deepEqual(checkScene(photo),[]);
 photo.visual.bgPrompt='a generated prompt';
 assert.match(checkScene(photo).join('\n'),/drop bgPrompt/);
 delete photo.visual.license;
 assert.match(checkScene(photo).join('\n'),/visual\.license/);
});
