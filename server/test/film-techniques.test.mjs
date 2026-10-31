import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { shotSchema, readStoryboard } from '../dist/storyboard.js';
const require=createRequire(import.meta.url);
const catalog=require('../../skills/storyboard/references/film-techniques.js');
const direction=require('../../skills/storyboard/references/shot-direction.js');
const {storyboardHtml}=require('../../skills/storyboard/references/storyboard-html.js');
const compiler=require('../../skills/storyboard/references/assemble-bg-prompt.js');

test('each advertised technique has a unique semantic id and distinct illustrated glyph',()=>{
  assert.equal(new Set(catalog.entries.map(x=>x.id)).size,catalog.entries.length);
  assert.equal(new Set(catalog.entries.map(x=>x.glyph)).size,catalog.entries.length);
  for(const category of ['character','camera','framing','timing'])assert.ok(catalog.entries.some(x=>x.category===category));
  for(const id of ['dolly-in','slow-zoom-in','arc','follow','reverse-tracking','handheld','whip-pan','crane-up','snorricam','push-past','rear','low','high','overhead','dutch','dolly-zoom','rack-focus','side-tracking','pov','drone-pullback'])assert.ok(catalog.byId['camera.'+id],id);
  for(const entry of catalog.entries)for(const key of ['use','instruction','glyph'])assert.ok(entry[key].trim().length>0,entry.id+' '+key);
});
test('semantic focus survives a static camera; opposite directions render different icons',()=>{
  const scene={visual:{camera:{movement:'static',framing:'foreground envelope',end:'background face'}},shot:{techniques:[{id:'camera.static',reason:'Fixed viewpoint'},{id:'camera.rack-focus',reason:'Reveal who holds the secret'}]}};
  assert.equal(direction.cameraOf(scene,'en').key,'camera.rack-focus');
  assert.match(direction.summary(scene,0,null,'en'),/Rack focus/);
  assert.match(catalog.instructions(scene),/near subject/);
  assert.deepEqual(catalog.findings(scene),[]);
  assert.notEqual(catalog.icon(catalog.byId['camera.dolly-in']),catalog.icon(catalog.byId['camera.dolly-out']));
  assert.notEqual(catalog.icon(catalog.byId['camera.follow']),catalog.icon(catalog.byId['camera.reverse-tracking']));
  assert.match(catalog.tiles(scene,'en'),/<summary>.*Rack focus/);
});
test('tool schema preserves reasons and refuses unknown, duplicate or empty selections',()=>{
  const shot={type:'points',shot:{techniques:[{id:'camera.snorricam',reason:'Follow panic from the body'}]}};
  assert.deepEqual(shotSchema.parse(shot).shot.techniques,shot.shot.techniques);
  for(const selection of [[{id:'camera.fake',reason:'x'}],[{id:'camera.static',reason:''}],[{id:'camera.static',reason:'x'},{id:'camera.static',reason:'y'}]])assert.equal(shotSchema.safeParse({type:'points',shot:{techniques:selection}}).success,false);
  assert.ok(catalog.findings({shot:{size:'mcu',techniques:[{id:'framing.ms',reason:'show hands'}]}}).some(x=>x.includes('conflicts')));
});
test('offline export and LLM read ship the same catalogue without rewriting legacy shot metadata',()=>{
  const dir=mkdtempSync(join(tmpdir(),'sf-film-'));
  try{
    const source='window.SCENES=[{id:"s0001",type:"points",shot:{size:"ms",techniques:[{id:"framing.ms",reason:"Show upper-body action"}]}}];';
    writeFileSync(join(dir,'scenes.js'),source);storyboardHtml(dir);
    const saved=JSON.parse(readFileSync(join(dir,'film-techniques.json'),'utf8'));
    assert.deepEqual(saved.entries,catalog.entries);
    const context={window:{}};runInNewContext(readFileSync(join(dir,'film-techniques.js'),'utf8'),context);
    assert.equal(context.window.FILM_TECHNIQUES.VERSION,catalog.VERSION);
    assert.match(readFileSync(join(dir,'storyboard.html'),'utf8'),/FILM_TECHNIQUES.selected/);
    const response=readStoryboard({path:dir,level:'full',includeContext:true,includeTechniques:true});
    assert.equal(response.techniqueCatalog.entries.length,catalog.entries.length);
    assert.deepEqual(response.techniqueCatalog.selections[0].techniques,[{id:'framing.ms',reason:'Show upper-body action'}]);
    assert.equal(readFileSync(join(dir,'scenes.js'),'utf8'),source);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('canonical size words reach the actual image prompt rather than a display-only label',()=>{
  assert.match(compiler.assemble({size:'ms',scene:'a person',tail:''}).prompt,/waist up/);
  assert.match(compiler.assemble({size:'mfs',scene:'a person',tail:''}).prompt,/mid-thigh/);
  assert.doesNotMatch(compiler.assemble({size:'ms',scene:'a person',tail:''}).prompt,/mid-thigh/);
});
test('selected special technique reaches the generic video prompt',()=>{
  const result=compiler.clipAssemble({engine:'veo',camera:{movement:'handheld',speed:'steady',framing:'face centered',end:'face centered'},techniques:[{id:'camera.snorricam',reason:'Panic'}]});
  assert.match(result.prompt,/rigidly mounted to the torso/);
  const framed=compiler.clipAssemble({engine:'veo',camera:{movement:'static'},techniques:[{id:'framing.ms',reason:'Show the hands'},{id:'camera.rear',reason:'Hide the expression'}]});
  assert.equal(framed.prompt.split('Opening frame:').length-1,1);
  assert.equal(framed.prompt.split('View the subject from behind').length-1,1);
});

 test('direction changes invalidate video plans and survive the speech-planning route',()=>{
 const acting=require('../../skills/_shared/scene-acting.js');
 const a={shot:{techniques:[{id:'camera.rack-focus',reason:'Reveal the background witness'}]},visual:{camera:{movement:'static'}}};
 const b=structuredClone(a);b.shot.techniques=[{id:'camera.static',reason:'Read the face'}];
 assert.match(acting.sceneDirection(a),/Shift sharp focus/);
 assert.notDeepEqual(acting.scenePerformancePayload(a),acting.scenePerformancePayload(b));
 assert.ok(catalog.findings({shot:{techniques:[{id:'camera.dolly-in',reason:'Approach'}]},visual:{camera:{movement:'dolly out'}}}).some(x=>x.includes('needs camera movement')));
 assert.doesNotThrow(()=>catalog.findings({shot:{techniques:[null]}}));
 });

test('untrusted technique ids and repeated malformed entries cannot crash diagnostics',()=>{
  for(const id of ['toString','constructor','__proto__']) {
    assert.equal(shotSchema.safeParse({type:'points',shot:{techniques:[{id,reason:'x'}]}}).success,false);
    assert.match(catalog.findings({shot:{techniques:[{id,reason:'x'}]}}).join(),/Unknown technique/);
  }
  assert.doesNotThrow(()=>catalog.findings({shot:{techniques:[null,null,{},{}]}}));
});
test('source viewpoints and actual spatial video routes consume authored techniques',()=>{
  const spatial=require('../../skills/storyboard/references/spatial-prompts.js');
  const scene={type:'points',duration:4,shot:{videoDesign:{look:'realistic',before:'A witness stands behind a desk.',action:'The witness raises one hand.',after:'The hand is raised.',continuity:'The desk stays in place.',motion:{kind:'subject_action',subject:'witness',visibleChange:'The hand rises.',beats:[{at:0,state:'Hand down.'},{at:3,state:'The hand is raised.'}]}}},visual:{camera:{movement:'static',speed:'',framing:'Waist-up witness, focus on RUBY_RING in the foreground.',end:'After the hand rises, shift focus over two seconds from RUBY_RING to LISTENING_DETECTIVE beyond the desk.'},video:{engine:'seedance'}}};
  const board={PRODUCTION:{mode:'full_video',style:{preset:'photoreal',world:'A quiet room.',materials:'Wood and cloth.',palette:'Brown and grey.',lighting:'Window light.',camera:'Natural perspective.'}},SCENES:[scene]};
  for(const engine of ['seedance','astra']){
    scene.visual.video.engine=engine;scene.shot.techniques=[];
    const before=spatial.assemble(board,0);
    scene.shot.techniques=[{id:'camera.rack-focus',reason:'Reveal witness'},{id:'camera.rear',reason:'Hide expression'},{id:'framing.ms',reason:'Include hands'}];
    const after=spatial.assemble(board,0);
    assert.notEqual(after.motionPrompt,before.motionPrompt);
    assert.match(after.motionPrompt,/Shift sharp focus/);
    assert.match(after.sourcePrompt,/focus on RUBY_RING/);
    assert.match(after.motionPrompt,/After the hand rises, shift focus over two seconds from RUBY_RING to LISTENING_DETECTIVE/);
    assert.match(after.endFramePrompt,/LISTENING_DETECTIVE/);
    assert.match(after.sourcePrompt,/View the subject from behind/);
    assert.match(after.sourcePrompt,/distinct depths/);
    assert.match(after.sourcePrompt,/Opening frame: medium shot, waist up/);
    assert.match(after.motionPrompt,/Opening frame: medium shot, waist up/);
    assert.doesNotMatch(after.sourcePrompt,/Shift sharp focus/);
  }
  assert.match(compiler.assemble({size:'ms',scene:'a witness',techniques:scene.shot.techniques,tail:''}).prompt,/View the subject from behind/);
});

test('mutually exclusive viewpoints warn without blocking deliberate authored plans',()=>{
  const selections=[{id:'camera.rear',reason:'Hide expression'},{id:'camera.pov',reason:'See the object through actor eyes'}];
  const scene={type:'points',shot:{techniques:selections},visual:{camera:{movement:'static'}}};
  assert.equal(shotSchema.safeParse(scene).success,true,'creative contradiction remains advisory');
  assert.match(catalog.findings(scene).join(' '),/Conflicting viewpoints/);
  for(const selection of selections){
    scene.shot.techniques=[selection,{id:'camera.static',reason:'Hold viewpoint'},{id:'camera.eye',reason:'Use eye height'}];
    scene.shot.angle='eye';
    assert.deepEqual(catalog.findings(scene),[],'one viewpoint combines with movement and angle');
  }
});
