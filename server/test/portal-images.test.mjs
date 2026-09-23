import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, after } from 'node:test';
const root = mkdtempSync(join(tmpdir(), 'portal-images-'));
process.env.SNS_TOKEN_DIR = join(root, 'tokens');
for (const key of ['TTALKKAKSTORY_API_URL','TTALKKAKSTORY_WORKSPACE','TTALKKAKSTORY_API_KEY','TTALKKAKSTORY_HOLDER']) delete process.env[key];
const { portalHandlers, imageUploadSchema } = await import('../dist/portal-tools.js');
const { writePortalState, readPortalState, evaluateScenesJs } = await import('../dist/portal-episode.js');
const { portalCredentialFile } = await import('../dist/config.js');
const EP = '11111111-1111-4111-8111-111111111111';
const ID = '22222222-2222-4222-8222-222222222222';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==', 'base64');
const digest = b => createHash('sha256').update(b).digest('hex');
const credFile = portalCredentialFile('test-images');
mkdirSync(join(credFile, '..'), { recursive: true });
writeFileSync(credFile, JSON.stringify({ apiUrl: 'https://portal.test', workspace: 'lab', apiKey: 'tks_test_image_upload', holder: 'test@local' }));
after(() => rmSync(root, { recursive: true, force: true }));
let serial = 0;
function setup(shots = [{ id: 's0002' }, { id: 's0001' }]) {
  const dir = join(root, 'data/test-images/episodes', `ep-${serial++}`);
  const sb = join(dir, 'storyboard'); mkdirSync(join(sb, 'images'), { recursive: true });
  const source = '// approved: keep-authored-comments\nwindow.FORMAT = "shorts-9x16";\nwindow.SB_DOC = {"narratorCharacterId":"narrator","characters":[{"id":"narrator","name":"Narrator","tts":{"engine":"supertonic","voiceId":"F1"}}]};\nwindow.SCENES = '+JSON.stringify(shots)+';\n';
  writeFileSync(join(sb, 'scenes.js'), source);
  writeFileSync(join(sb, 'images/scene-1.png'), PNG);
  writePortalState(dir, { workspace: 'lab', episodeId: EP, headRevisionNo: 3 });
  return { dir, sb, source, args: { episodeDir: dir, stage: 'board' } };
}
function transport(hook) {
  const calls = [];
  const fetch = async (url, init) => {
    const binary = init.headers['content-type'] !== 'application/json';
    const body = binary ? Buffer.from(init.body) : JSON.parse(init.body);
    const call = { url, init, body, binary }; calls.push(call);
    const custom = await hook?.(call, calls);
    const value = custom ?? { success: true, data: binary ? { id: ID, sha256: digest(body), mime: 'image/png', byteSize: body.length, created: true } : { revisionNo: body.baseRevisionNo + 1 } };
    return new Response(JSON.stringify(value), { status: value.status ?? (value.success ? 201 : 409) });
  };
  return { calls, handler: portalHandlers(fetch) };
}
test('uploads bytes with bearer, holder and length; one checkpoint links UUID by stable shot ID and roundtrips source', async () => {
  const x = setup(); const t = transport();
  const out = await t.handler.imagesUpload(x.args); assert.equal(out.isError, false, out.text);
  const result = JSON.parse(out.text); assert.deepEqual(result.skipped, [2]);
  assert.equal(t.calls.length, 2); const [upload, checkpoint] = t.calls;
  assert.match(upload.url, /episodes\/11111111-1111-4111-8111-111111111111\/images\?holder=test%40local$/);
  assert.equal(upload.init.headers.authorization, 'Bearer tks_test_image_upload');
  assert.equal(upload.init.headers['content-length'], String(PNG.length)); assert.deepEqual(upload.body, PNG);
  assert.equal(upload.init.redirect, 'error');
  assert.equal(checkpoint.body.baseRevisionNo, 3); assert.equal(checkpoint.body.scenes[0].id, 's0002');
  assert.equal(checkpoint.body.narratorCharacterId, 'narrator');
  assert.equal(checkpoint.body.characters[0].tts.voiceId, 'F1');
  assert.equal(checkpoint.body.scenes[0].portalImageId, ID); assert.equal(checkpoint.body.scenes[1].portalImageId, undefined);
  const saved = readFileSync(join(x.sb, 'scenes.js'), 'utf8'); assert.ok(saved.startsWith(x.source));
  assert.equal(checkpoint.body.documents.find(d => d.filename === 'scenes.js').content, saved);
  assert.equal(evaluateScenesJs(saved).scenes[0].portalImageId, ID);
  assert.equal(readPortalState(x.dir).headRevisionNo, 4); assert.equal(JSON.stringify(checkpoint.body.scenes).includes(x.dir), false);
  assert.equal(readFileSync(join(result.recoveryFile, '../scenes.js'), 'utf8'), x.source);
  const repeated = await t.handler.imagesUpload(x.args); assert.equal(repeated.isError, false);
  assert.equal(readFileSync(join(x.sb, 'scenes.js'), 'utf8'), saved, 'same UUID does not append again');
});
test('explicit ID selects reordered shot, legacy ordinal supported, and MIME is detected', async () => {
  const x = setup(); const t = transport();
  assert.equal((await t.handler.imagesUpload({ ...x.args, images: [{ shotId: 's0001', file: 'images/scene-1.png' }], baseRevisionNo: 5 })).isError, false);
  assert.equal(t.calls[1].body.scenes[1].portalImageId, ID); assert.equal(t.calls[1].body.baseRevisionNo, 5);
  const legacy = setup([{ no: 7 }]); const u = transport();
  assert.equal((await u.handler.imagesUpload(legacy.args)).isError, false);
  assert.equal(u.calls[1].body.scenes[0].portalImageId, ID);
});
test('all files preflight before network: empty, over-limit, wrong MIME, duplicate and unknown IDs, escapes', async () => {
  const cases = [
    x => writeFileSync(join(x.sb,'images/scene-1.png'), Buffer.alloc(0)),
    x => writeFileSync(join(x.sb,'images/scene-1.png'), Buffer.alloc(5*1024*1024+1)),
    x => writeFileSync(join(x.sb,'images/scene-1.png'), '<svg/>'),
    x => { x.args.images = [{shotId:'absent',file:'images/scene-1.png'}]; },
    x => { x.args.images = [{shotNo:1,file:'images/scene-1.png'}]; },
    x => { x.args.images = [1,2].map(() => ({shotId:'s0001',file:'images/scene-1.png'})); },
    x => { const external=join(root,'outside.png'); writeFileSync(external,PNG); symlinkSync(external,join(x.sb,'images/link.png')); x.args.images=[{shotId:'s0001',file:'images/link.png'}]; },
    x => writeFileSync(join(x.sb,'images/scene-2.png'), 'invalid second file'),
    x => writeFileSync(join(x.sb,'images/scene-1.jpg'), PNG),
  ];
  for (const change of cases) { const x=setup(); change(x); const t=transport(); const out=await t.handler.imagesUpload(x.args); assert.equal(out.isError,true,out.text); assert.equal(t.calls.length,0); assert.equal(readFileSync(join(x.sb,'scenes.js'),'utf8'),x.source); }
});
test('missing key, wrong workspace, missing base and new episode are refused without HTTP', async () => {
  for (const patch of [{workspace:'other'}, {headRevisionNo:null}, {episodeId:undefined}]) {
    const x=setup(); writePortalState(x.dir,patch); const t=transport();
    const out=await t.handler.imagesUpload(x.args); assert.equal(out.isError,true,out.text); assert.equal(t.calls.length,0);
  }
  const x=setup(); const t=transport();
  const credential=readFileSync(credFile); rmSync(credFile);
  try { assert.equal((await t.handler.imagesUpload(x.args)).isError,true); assert.equal(t.calls.length,0); } finally { writeFileSync(credFile,credential); }
});
test('partial 413/429/404/415/403 upload failures never checkpoint or advance local state', async () => {
  for (const status of [413,429,404,415,403]) {
    const x=setup(); writeFileSync(join(x.sb,'images/scene-2.png'),PNG);
    const t=transport((_, calls)=>calls.length===2?{success:false,status,error:'upload refused'}:undefined);
    const out=await t.handler.imagesUpload(x.args); assert.equal(out.isError,true); const result=JSON.parse(out.text);
    assert.equal(result.phase,'upload'); assert.equal(result.uploaded.length,1); assert.equal(t.calls.length,2);
    assert.equal(readPortalState(x.dir).headRevisionNo,3); assert.equal(readFileSync(join(x.sb,'scenes.js'),'utf8'),x.source);
  }
});
test('409 and unknown checkpoint outcomes preserve local state and give durable recovery source', async () => {
  for (const unknown of [false,true]) {
    const x=setup(); const t=transport(call=>{if(!call.binary){if(unknown)throw Error('connection reset'); return {success:false,status:409,error_code:'head_moved',error:'conflict'};}});
    const out=await t.handler.imagesUpload(x.args); const result=JSON.parse(out.text);
    assert.equal(out.isError,true); assert.equal(result.phase,'checkpoint'); assert.match(result.next,/side-pull/);
    assert.equal(evaluateScenesJs(readFileSync(result.recoveryFile,'utf8')).scenes[0].portalImageId,ID);
    assert.equal(readPortalState(x.dir).headRevisionNo,3); assert.equal(readFileSync(join(x.sb,'scenes.js'),'utf8'),x.source);
  }
});
test('concurrent local edit before checkpoint stops, after checkpoint reports remote success without overwriting', async () => {
  for (const phase of ['upload','checkpoint']) {
    const x=setup(); const t=transport(call=>{if(call.binary===(phase==='upload'))writeFileSync(join(x.sb,'scenes.js'), x.source+'// concurrent edit\n');});
    const out=await t.handler.imagesUpload(x.args); const result=JSON.parse(out.text);
    assert.equal(out.isError,true); assert.equal(result.revisionNo,phase==='checkpoint'?4:undefined);
    assert.equal(t.calls.length,phase==='checkpoint'?2:1); assert.match(readFileSync(join(x.sb,'scenes.js'),'utf8'),/concurrent edit/);
    assert.equal(readPortalState(x.dir).headRevisionNo,3);
  }
});
test('schema requires workflow stage and exactly one target selector', () => {
  assert.equal(imageUploadSchema.safeParse({episodeDir:'/tmp'}).success,false);
  for(const target of [{},{shotId:'s1',shotNo:1}])assert.equal(imageUploadSchema.safeParse({episodeDir:'/tmp',stage:'board',images:[{file:'x.png',...target}]}).success,false);
});

test('invalid checkpoint revision preserves local files and reports unknown outcome', async () => {
  for (const revisionNo of [undefined, null, 0, 3, 4.5, '4']) {
    const x = setup();
    const t = transport(call => call.binary ? undefined : { success: true, data: { revisionNo } });
    const out = await t.handler.imagesUpload(x.args);
    assert.equal(out.isError, true);
    const result = JSON.parse(out.text);
    assert.equal(result.phase, 'checkpoint');
    assert.match(result.error, /invalid revision/);
    assert.equal(readPortalState(x.dir).headRevisionNo, 3);
    assert.equal(readFileSync(join(x.sb, 'scenes.js'), 'utf8'), x.source);
  }
});

test('remote image checkpoint survives actual local write failures with recovery and an unchanged base', async (ctx) => {
  for (const failingFile of ['board', 'state']) {
    const x = setup(); const t = transport();
    const beforeState = readFileSync(join(x.dir, '.portal.json'), 'utf8');
    const original = fs.writeFileSync;
    let failures = 0;
    const mock = ctx.mock.method(fs, 'writeFileSync', function (file, ...args) {
      const name = String(file);
      if ((failingFile === 'board' && name.startsWith(join(x.sb, 'scenes.js.')) && name.endsWith('.tmp')) ||
          (failingFile === 'state' && name === join(x.dir, '.portal.json'))) {
        failures++;
        throw Object.assign(new Error('injected EACCES during local write'), { code: 'EACCES' });
      }
      return original.call(this, file, ...args);
    });
    syncBuiltinESMExports();
    let out;
    try { out = await t.handler.imagesUpload(x.args); }
    finally { mock.mock.restore(); syncBuiltinESMExports(); }
    assert.equal(failures, 1);
    assert.equal(out.isError, true);
    const result = JSON.parse(out.text);
    assert.equal(result.phase, 'local');
    assert.equal(result.revisionNo, 4);
    assert.match(result.error, /EACCES/);
    assert.match(result.next, /Portal revision saved/);
    assert.equal(t.calls.length, 2, 'exactly one upload and one successful checkpoint');
    assert.equal(readFileSync(join(x.dir, '.portal.json'), 'utf8'), beforeState);
    const recovery = readFileSync(result.recoveryFile, 'utf8');
    assert.equal(evaluateScenesJs(recovery).scenes[0].portalImageId, ID);
    assert.equal(readFileSync(join(result.recoveryFile, '../scenes.js'), 'utf8'), x.source);
    assert.equal(readFileSync(join(x.sb, 'scenes.js'), 'utf8'), failingFile === 'board' ? x.source : recovery);
  }
});
