import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { after, beforeEach, describe, it } from 'node:test';
const root = mkdtempSync(join(tmpdir(), 'portal-media-'));
process.env.SNS_TOKEN_DIR = join(root, 'tokens');
for (const key of ['TTALKKAKSTORY_API_URL','TTALKKAKSTORY_WORKSPACE','TTALKKAKSTORY_API_KEY','TTALKKAKSTORY_HOLDER']) delete process.env[key];
const { uploadShotMedia, withShotMedia, withoutPortal } = await import('../dist/portal-media.js');
const { evaluateScenesJs, writePortalState } = await import('../dist/portal-episode.js');
const { ROUTES } = await import('../dist/handlers.js');
const { TOOLS } = await import('../dist/tools.js');
const dir = join(root, 'data', 'test', 'episodes', 'ep');
const ep = '11111111-1111-4111-8111-111111111111';
const ids = { image:'22222222-2222-4222-8222-222222222222',previz:'33333333-3333-4333-8333-333333333333',video:'44444444-4444-4444-8444-444444444444',narration:'55555555-5555-4555-8555-555555555555' };
const target = { episodeDir: dir, shotId: 's1', previzFile: 'previz.mp4' };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function credential() { mkdirSync(join(root,'tokens','test'),{recursive:true}); writeFileSync(join(root,'tokens','test','ttalkkakstory.json'), JSON.stringify({apiUrl:'https://portal.test', workspace:'lab', apiKey:'tks_test_media', holder:'test@here'})); }
function server({ failUpload, failCheckpoint, changedHead } = {}) {
  const events = []; let revision = 1, lastScenes;
  const fetch = async (url, init = {}) => {
    const u = new URL(url), method=init.method ?? 'GET';
    assert.equal(init.headers.authorization,'Bearer tks_test_media');
    if (method === 'GET') { events.push('head'); return Response.json({success:true,data:{id:ep, headRevisionNo: changedHead ?? revision,stage:'approved'}}); }
    if (u.pathname.endsWith('/media')) {
      const kind=u.searchParams.get('kind'); events.push(`upload:${kind}`);
      assert.equal(u.searchParams.get('holder'),'test@here');
      if (failUpload === kind) return Response.json({success:false,error:'upload failed'}, {status:413});
      return Response.json({success:true,data:{id:ids[kind],kind,mime:init.headers['content-type'],byteSize:init.body.length,sha256:sha(init.body)}}, {status:201});
    }
    const body=JSON.parse(init.body); events.push('checkpoint');
    assert.equal(body.baseRevisionNo,revision); assert.equal(body.stage,'approved');
    if(failCheckpoint) return Response.json({success:false,error:'moved',error_code:'head_moved'}, {status:409});
    lastScenes=body.scenes; revision++;
    assert.equal(JSON.stringify(body).includes(dir),false,'local media paths do not enter portal snapshots');
    return Response.json({success:true,data:{revisionNo:revision}});
  };
  return {fetch,events,scenes:()=>lastScenes};
}
beforeEach(()=>{
  rmSync(join(root,'tokens'),{recursive:true,force:true}); rmSync(dir,{recursive:true,force:true});
  mkdirSync(join(dir,'storyboard'),{recursive:true});
  writeFileSync(join(dir,'storyboard','scenes.js'),'// authored comment\nwindow.SCENES=[{id:"s1",type:"cover",title:"One"}];\nwindow.PRODUCTION={mode:"full_video"};\n');
  writePortalState(dir,{workspace:'lab',episodeId:ep,headRevisionNo:1});
  for(const file of ['previz.mp4','output.mp4','voice.wav','source.png']) writeFileSync(join(dir,file),`fixture-${file}`);
});
after(()=>rmSync(root,{recursive:true,force:true}));
describe('shot media production order',()=>{
  it('awaits previz upload AND checkpoint before generation, then links the generated output',async()=>{
    credential(); const s=server();
    const result=await withShotMedia({portal:target},'video',async()=>{s.events.push('vendor'); return {success:true,videoPath:join(dir,'output.mp4')};},r=>r.videoPath,s.fetch);
    assert.deepEqual(s.events,['head','upload:previz','checkpoint','vendor','head','upload:video','checkpoint']);
    assert.equal(result.portalMedia.kind,'video');
    assert.deepEqual(s.scenes()[0].portalMedia,{previz:ids.previz,video:ids.video});
    const source=readFileSync(join(dir,'storyboard','scenes.js'),'utf8');
    assert.ok(source.startsWith('// authored comment')); assert.equal(evaluateScenesJs(source).meta.PRODUCTION.mode,'full_video');
    assert.equal(JSON.parse(readFileSync(join(dir,'.portal.json'),'utf8')).headRevisionNo,3);
  });
  it('does not call the vendor on failed upload, failed checkpoint, or stale base',async()=>{
    credential();
    for(const scenario of [{failUpload:'previz'},{failCheckpoint:true},{changedHead:2}]) {
      const s=server(scenario);let called=false;
      await assert.rejects(withShotMedia({portal:target},'video',async()=>{called=true; return {success:true};},()=>undefined,s.fetch));
      assert.equal(called,false);
      assert.equal(readFileSync(join(dir,'storyboard','scenes.js'),'utf8').includes('portalMedia'),false);
    }
  });
  it('actual Seedance handler cannot pass a failed previz upload; exposes portal fields to callers',async()=>{
    credential(); const s=server({failUpload:'previz'}), old=globalThis.fetch;globalThis.fetch=s.fetch;
    try { await assert.rejects(ROUTES.seedance_reference({portal:target}),/upload failed/); }
    finally { globalThis.fetch=old; }
    assert.deepEqual(s.events,['head','upload:previz']);
    for(const name of ['seedance_reference','seedance_img2video','seedance_text2video','blender_render_previz','tts_generate_checked']) assert.ok(TOOLS.find(t=>t.name===name).inputSchema.properties.portal);
    assert.deepEqual(withoutPortal({portal:target,prompt:'x'}),{prompt:'x'});
  });
  it('silently skips absent credentials without files, HTTP, or changing generation behavior',async()=>{
    let calls=0;
    const r=await withShotMedia({portal:{...target,episodeDir:join(root,'missing')}},'video',async()=>{calls++;return {success:true,videoPath:'kept'};},r=>r.videoPath,()=>{throw Error('network');});
    assert.equal(calls,1);assert.deepEqual(r,{success:true,videoPath:'kept'});
    assert.deepEqual(await withShotMedia({portal:{}},'video',async()=>({success:true}),()=>undefined),{success:true});
    assert.deepEqual(await uploadShotMedia({...target,kind:'previz',file:'missing.mp4'}),{skipped:true});
  });
  it('preserves completed output on post-generation upload failure and supports explicit retry',async()=>{
    credential(); const s=server({failUpload:'video'});let calls=0;
    const result=await withShotMedia({portal:target},'video',async()=>{calls++;return {success:true,videoPath:join(dir,'output.mp4')};},r=>r.videoPath,s.fetch);
    assert.equal(calls,1);assert.equal(result.success,true);assert.match(result.portalMedia.error,/upload failed/);
    assert.equal(readFileSync(result.videoPath,'utf8'),'fixture-output.mp4');
    const next=server({changedHead:2}); // local base is now 2
    const fetch=async(url,init)=>{ if((init?.method??'GET')==='GET')return next.fetch(url,init); const u=new URL(url); if(u.pathname.endsWith('/revisions'))return Response.json({success:true,data:{revisionNo:3}}); return next.fetch(url,init); };
    assert.equal((await uploadShotMedia({...target,kind:'video',file:'output.mp4'},fetch)).kind,'video');
  });
  it('uploads completed warning narration and source images without altering other media kinds',async()=>{
    credential();const s=server();
    const r=await withShotMedia({portal:target},'narration',async()=>({success:false,status:'warning',audioPath:join(dir,'voice.wav')}),r=>r.audioPath,s.fetch);
    assert.equal(r.success,false); assert.equal(r.portalMedia.kind,'narration');
    await uploadShotMedia({...target,kind:'image',file:'source.png'},s.fetch);
    assert.equal(s.scenes()[0].portalImageId,ids.image); assert.equal(s.scenes()[0].portalMedia.narration,ids.narration);
  });
  it('oversized previz/output files are logged and skipped while production continues',async()=>{
    credential();const s=server();let calls=0;
    writeFileSync(join(dir,'large.mp4'),Buffer.alloc(10*1024*1024+1));
    const result=await withShotMedia({portal:{...target,previzFile:'large.mp4'}},'video',async()=>{calls++;return {success:true,videoPath:join(dir,'large.mp4')};},r=>r.videoPath,s.fetch);
    assert.equal(calls,1);assert.equal(result.success,true);assert.equal(result.portalMedia.reason,'oversized');
    assert.deepEqual(s.events,[],'oversized media performs no portal HTTP calls');
    const skips=readFileSync(join(dir,'.portal-media-skips.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
    assert.deepEqual(skips.map(s=>s.kind),['previz','video']);
    assert.ok(skips.every(s=>s.byteSize>s.limitBytes));
  });
  it('rejects wrong workspace, unknown targets, traversal and oversized files before uploading',async()=>{
    credential();const s=server();
    await assert.rejects(uploadShotMedia({...target,shotId:'missing',kind:'previz',file:'previz.mp4'},s.fetch),/target/);
    await assert.rejects(uploadShotMedia({...target,shotId:undefined,shotNo:1,kind:'previz',file:'previz.mp4'},s.fetch),/shotId/);
    writeFileSync(join(root,'outside.mp4'),'outside');
    await assert.rejects(uploadShotMedia({...target,kind:'previz',file:join(root,'outside.mp4')},s.fetch),/inside/);
    writeFileSync(join(dir,'large.mp4'),Buffer.alloc(10*1024*1024+1));
    const skipped=await uploadShotMedia({...target,kind:'previz',file:'large.mp4'},s.fetch);assert.equal(skipped.reason,'oversized');
    assert.match(readFileSync(join(dir,'.portal-media-skips.jsonl'),'utf8'),/large.mp4/);
    writePortalState(dir,{workspace:'other'});
    await assert.rejects(uploadShotMedia({...target,kind:'previz',file:'previz.mp4'},s.fetch),/matching/);
    assert.equal(s.events.filter(e=>e.startsWith('upload:')).length,0);
  });
});
