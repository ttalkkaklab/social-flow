import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const require=createRequire(import.meta.url);
const L=require('../../skills/storyboard/references/location-assets.js');
const C=require('../../skills/storyboard/references/location-contract.js');
const {spec,example}=require('../../skills/storyboard/references/location-example.js');
const {readScenes}=require('../../skills/autoproduce/references/cost-preview.js');
function fixture(fn){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sf-location-'));try{const files=example(dir),win=readScenes(files.board);const asset=path.join(dir,'asset');fs.mkdirSync(asset);const m=structuredClone(spec);m.assets={};for(const [k,n]of [['blend','source.blend'],['glb','preview.glb']]){fs.writeFileSync(path.join(asset,n),k);m.assets[k]={path:n,sha256:L.fileHash(path.join(asset,n))};}const manifest=path.join(asset,'location.json');fs.writeFileSync(manifest,JSON.stringify(m));const boardDir=path.dirname(files.board);L.bind(win,0,boardDir,{manifest,stateId:'day',cameraId:'wide',mustShow:['door']});fn({dir,boardDir,win,manifest,m});}finally{fs.rmSync(dir,{recursive:true,force:true});}}
function ready(f){const fingerprint=L.signature(L.context(f.win,0,f.boardDir));fs.mkdirSync(path.join(f.boardDir,'locations'));const frames={};for(const k of ['start','end']){const name='locations/'+k+'.png';fs.writeFileSync(path.join(f.boardDir,name),'fixture '+k);frames[k]={path:name,sha256:L.fileHash(path.join(f.boardDir,name))};}f.win.SCENES[0].visual.location={fingerprint,frames};L.approve(f.win,0,f.boardDir,{reviewer:'test',notes:'Synthetic fixture, not visual evidence'});}
test('example geometry has safe stable IDs and valid cameras/states',()=>assert.deepEqual(C.validate(spec),[]));
test('invalid geometry, duplicate IDs, unknown state objects and bad camera are rejected',()=>{const m=structuredClone(spec);m.objects.push(m.objects[0]);m.states.day.objects.ghost={position:[1,2,3]};m.cameras.wide.target=m.cameras.wide.position;assert.ok(C.validate(m).length>=3);});
test('old boards have no new location requirements',()=>assert.deepEqual(L.check({SCENES:[{type:'scene'}]},'/tmp',{ready:true}),[]));
test('binding resolves immutable version and refuses unknown landmarks',()=>fixture(f=>{assert.equal(L.plan(f.win,0,f.boardDir).revision,1);assert.throws(()=>L.bind(f.win,0,f.boardDir,{manifest:f.manifest,stateId:'day',cameraId:'wide',mustShow:['ghost']}),/unknown/);}));
test('generation requires renders but permits honestly unreviewed references',()=>fixture(f=>{assert.throws(()=>L.references(f.win,0,f.boardDir),/stale/);ready(f);delete f.win.SCENES[0].visual.location.approval;assert.equal(L.references(f.win,0,f.boardDir).approved,false);assert.deepEqual(L.check(f.win,f.boardDir,{ready:true}).map(x=>x.level),['warn']);}));
test('approved image args resolve actual files; camera proposal invalidates evidence',()=>fixture(f=>{ready(f);const p=L.references(f.win,0,f.boardDir);assert.equal(p.paths.length,1);assert.ok(fs.existsSync(p.paths[0]));const patch={version:1,type:'location-camera',shotId:'s0001',baseFingerprint:p.fingerprint,camera:{...p.camera,lensMm:40}};L.applyCamera(f.win,patch,f.boardDir);assert.throws(()=>L.references(f.win,0,f.boardDir),/stale/);assert.throws(()=>L.applyCamera(f.win,patch,f.boardDir),/stale/);}));
test('changed mesh, manifest or reference bytes cannot keep approval',()=>fixture(f=>{ready(f);fs.appendFileSync(path.join(f.boardDir,'locations/start.png'),'tamper');assert.throws(()=>L.references(f.win,0,f.boardDir),/bytes changed/);fs.appendFileSync(path.join(f.dir,'asset/preview.glb'),'tamper');assert.throws(()=>L.plan(f.win,0,f.boardDir),/changed location/);}));
test('state and textual camera changes invalidate reference fingerprint',()=>fixture(f=>{ready(f);f.win.SCENES[0].shot.location.stateId='night';assert.throws(()=>L.references(f.win,0,f.boardDir),/stale/);f.win.SCENES[0].shot.location.stateId='day';f.win.SCENES[0].visual.camera.framing='different';assert.throws(()=>L.references(f.win,0,f.boardDir),/stale/);}));
test('manifest asset traversal is refused',()=>fixture(f=>{f.m.assets.glb.path='../outside';fs.writeFileSync(f.manifest,JSON.stringify(f.m));assert.throws(()=>L.load(f.manifest),/escapes/);}));
test('prompt assembler attaches scoped location render; stale location cannot spend',()=>fixture(f=>{ready(f);const {assemble}=require('../../skills/storyboard/references/spatial-prompts.js');const result=assemble(f.win,0,f.boardDir);assert.ok(result.sourceImageArgs.referenced_image_paths.includes(path.join(f.boardDir,'locations/start.png')));assert.match(result.sourcePrompt,/LOCATION reference \(reference review: reviewed\)/);delete f.win.SCENES[0].visual.location.approval;const unreviewed=assemble(f.win,0,f.boardDir);assert.match(unreviewed.sourcePrompt,/reference review: not_reviewed or stale/);assert.doesNotMatch(unreviewed.sourcePrompt,/approved LOCATION/);assert.ok(result.locationBinding.frameSha256);f.win.SCENES[0].shot.location.stateId='night';assert.throws(()=>assemble(f.win,0,f.boardDir),/stale/);}));
test('preview escapes through data serialization and exposes failures instead of success',()=>fixture(f=>{ready(f);assert.equal(L.preview(f.win,f.boardDir)[0].approved,true);fs.unlinkSync(path.join(f.dir,'asset/preview.glb'));assert.ok(L.preview(f.win,f.boardDir)[0].error);}));
test('replacing image and its hash cannot inherit an old visual approval',()=>fixture(f=>{ready(f);const frame=f.win.SCENES[0].visual.location.frames.start;fs.writeFileSync(path.join(f.boardDir,frame.path),'different render');frame.sha256=L.fileHash(path.join(f.boardDir,frame.path));assert.equal(L.references(f.win,0,f.boardDir).approved,false);assert.ok(L.check(f.win,f.boardDir,{ready:true}).some(x=>x.level==='warn'&&/review missing or stale/.test(x.what)));}));
test('prototype keys and null transforms cannot pass the location contract',()=>{const m=structuredClone(spec);m.states.day.objects.door={position:null};assert.ok(C.validate(m).length);const b={id:m.id,revision:1,manifestSha256:'a'.repeat(64),stateId:'constructor',cameraId:'constructor',mustShow:[]};assert.equal(C.bindingErrors(b,m).length,2);});
test('state proposal invalidates references and an unknown state cannot be applied',()=>fixture(f=>{ready(f);const p=L.plan(f.win,0,f.boardDir);assert.throws(()=>L.applyCamera(f.win,{version:1,type:'location-state',shotId:'s0001',baseFingerprint:p.fingerprint,stateId:'constructor'},f.boardDir),/unknown/);L.applyCamera(f.win,{version:1,type:'location-state',shotId:'s0001',baseFingerprint:p.fingerprint,stateId:'night'},f.boardDir);assert.throws(()=>L.references(f.win,0,f.boardDir),/stale/);}));
test('hidden required landmark and incompatible aspect are rejected',()=>fixture(f=>{assert.throws(()=>L.bind(f.win,0,f.boardDir,{manifest:f.manifest,stateId:'open',cameraId:'wide',mustShow:['door']}),/hidden/);f.win.SCENES[0].shot.location.camera={...f.m.cameras.wide,width:640,height:960};assert.throws(()=>L.plan(f.win,0,f.boardDir),/aspect/);}));
test('states cannot move fixed architecture',()=>{const m=structuredClone(spec);m.states.day.objects['west-wall']={position:[0,0,0]};assert.ok(C.validate(m).some(x=>x.includes('fixed architecture')));});
test('receipt records real input/output hashes and rejects changed output',()=>fixture(f=>{ready(f);const out=path.join(f.boardDir,'generated.png');fs.writeFileSync(out,'generated');assert.throws(()=>L.receipt(f.win,0,f.boardDir,{provider:'host',callId:'synthetic',referencePaths:[],output:out}),/actual sent/);const refs=L.references(f.win,0,f.boardDir);L.receipt(f.win,0,f.boardDir,{provider:'host',callId:'synthetic',referencePaths:refs.paths,output:out});fs.appendFileSync(out,'changed');assert.throws(()=>L.references(f.win,0,f.boardDir),/output is stale/);}));

test('ready checks report missing, stale and nonpass result reviews without blocking valid assets',()=>fixture(f=>{
  ready(f);
  const out=path.join(f.boardDir,'generated.png');fs.writeFileSync(out,'generated');
  const refs=L.references(f.win,0,f.boardDir);
  L.receipt(f.win,0,f.boardDir,{provider:'host',callId:'synthetic',referencePaths:refs.paths,output:out});
  f.win.SCENES[0].visual.bg='generated.png';
  const warnings=()=>{const result=L.check(f.win,f.boardDir,{ready:true});assert.equal(result.filter(x=>x.level==='bad').length,0);return result.filter(x=>x.level==='warn');};
  assert.match(warnings()[0].what,/review missing or stale/);
  for(const verdict of ['warning','fail']){
    L.reviewResult(f.win,0,f.boardDir,{verdict,reviewer:'test',notes:'Synthetic review fixture'});
    assert.match(warnings()[0].what,new RegExp('review: '+verdict));
    assert.equal(L.references(f.win,0,f.boardDir).resultReview.verdict,verdict);
  }
  L.reviewResult(f.win,0,f.boardDir,{verdict:'pass',reviewer:'test',notes:'Synthetic review fixture'});
  assert.deepEqual(warnings(),[]);
  f.win.SCENES[0].visual.location.receipt.review.outputSha256='stale';
  assert.match(warnings()[0].what,/review missing or stale/);
  fs.appendFileSync(out,'changed');
  assert.ok(L.check(f.win,f.boardDir,{ready:true}).some(x=>x.level==='bad'&&/output is stale/.test(x.what)));
}));
test('missing generation receipt remains an execution error even without review requirements',()=>fixture(f=>{
  ready(f);delete f.win.SCENES[0].visual.location.approval;
  f.win.SCENES[0].visual.bg='untracked.png';
  assert.ok(L.check(f.win,f.boardDir,{ready:true}).some(x=>x.level==='bad'&&/needs a receipt/.test(x.what)));
}));

test('end frame uses valid opening receipt without review and rejects changed source bytes',()=>fixture(f=>{
  ready(f);delete f.win.SCENES[0].visual.location.approval;
  const {assemble}=require('../../skills/storyboard/references/spatial-prompts.js');
  assert.equal(assemble(f.win,0,f.boardDir).endFrameReady,false);
  const out=path.join(f.boardDir,'generated.png');fs.writeFileSync(out,'generated');
  L.receipt(f.win,0,f.boardDir,{provider:'host',callId:'synthetic',referencePaths:L.references(f.win,0,f.boardDir).paths,output:out});
  f.win.SCENES[0].visual.bg='generated.png';
  for(const verdict of [null,'warning','fail']){
    if(verdict)L.reviewResult(f.win,0,f.boardDir,{verdict,reviewer:'test',notes:'Synthetic fixture'});
    const result=assemble(f.win,0,f.boardDir);
    assert.equal(result.endFrameReady,true);
    assert.deepEqual(result.endFrameImageArgs.referenced_image_paths,[out,path.join(f.boardDir,'locations/end.png')]);
  }
  f.win.SCENES[0].visual.bg='different.png';
  assert.equal(assemble(f.win,0,f.boardDir).endFrameReady,false);
  f.win.SCENES[0].visual.bg='generated.png';fs.appendFileSync(out,'changed');
  assert.throws(()=>assemble(f.win,0,f.boardDir),/output is stale/);
}));
