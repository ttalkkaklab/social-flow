import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { config } from '../dist/config.js';
import { generateFromText, generateWithReferences, seedanceReferenceSchema, seedanceImg2VideoSchema, seedanceText2VideoSchema } from '../dist/seedance-client.js';

test('a rejected task creation is terminal, a lost connection is not, and one failed status read is polled through', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seedance-'));
  const fetch = globalThis.fetch, key = config.arkApiKey, realSetTimeout = globalThis.setTimeout;
  config.arkApiKey = 'fixture';
  // The client waits 10 s between polls; run that clock forward.
  globalThis.setTimeout = (fn, ms = 0, ...args) => realSetTimeout(fn, ms >= 1000 ? 0 : ms, ...args);
  t.after(() => { globalThis.fetch = fetch; config.arkApiKey = key; globalThis.setTimeout = realSetTimeout; fs.rmSync(dir, { recursive: true, force: true }); });
  const request = seedanceText2VideoSchema.parse({ prompt: 'A boat crosses a lake.', model: 'dreamina-seedance-2-0-fast-260128', outputPath: dir, filename: 'a.mp4' });

  globalThis.fetch = async () => Response.json({ error: { code: 'InvalidParameter', message: 'bad ratio' } }, { status: 400 });
  assert.equal((await generateFromText(request)).terminal, true);
  globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
  assert.equal((await generateFromText(request)).terminal, false);

  let gets = 0;
  globalThis.fetch = async (_url, options) => options.method === 'POST' ? Response.json({ id: 'task-1' })
    : ++gets === 1 ? new Response('busy', { status: 503 }) : Response.json({ id: 'task-1', status: 'failed', error: { message: 'moderation' } });
  const failed = await generateFromText(request);
  assert.equal(failed.terminal, true); assert.equal(failed.taskId, 'task-1'); assert.equal(gets, 2);
});

test('Flash reference requests submit one edit or extension with its ModelArk field names', async t => {
  const model = 'dreamina-seedance-2-5-flash-261115';
  const base = { model, prompt: 'Edit @Video 1. Replace the red hat with a blue hat.', referenceVideoUrls: ['https://example.org/source.mp4'] };
  assert.equal(seedanceImg2VideoSchema.safeParse({ model, prompt: 'Hat', sourceImagePath: 'a.png', ratio: '9:16' }).success, false);
  assert.equal(seedanceReferenceSchema.safeParse({ ...base, referenceImagePaths: Array(11).fill('p.png') }).success, false);
  assert.equal(seedanceReferenceSchema.safeParse({ ...base, model: 'dreamina-seedance-2-0-260128', generateAudio: true, referenceAudioPaths: ['a.wav'] }).success, true);
  assert.equal(seedanceReferenceSchema.safeParse({ ...base, referenceVideoUrls: ['asset://clip-id'] }).success, true);
  assert.equal(seedanceReferenceSchema.safeParse({ ...base, referenceVideoUrls: ['file:///tmp/clip.mp4'] }).success, false);
  for (const invalid of [{durationSeconds: 8}, {ratio: '9:16'}, {referenceVideoUrls: []}, {model:'dreamina-seedance-2-0-260128'}])
    assert.equal(seedanceReferenceSchema.safeParse({ ...base, omniReferenceTaskType: 'edit', ...invalid }).success, false);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'modelark-wire-'));
  const fetch = globalThis.fetch, key = config.arkApiKey, timer = globalThis.setTimeout;
  t.after(() => { globalThis.fetch = fetch; config.arkApiKey = key; globalThis.setTimeout = timer; fs.rmSync(dir, { recursive:true, force:true }); });
  config.arkApiKey = 'fixture';
  globalThis.setTimeout = (fn, ms, ...args) => timer(fn, Math.min(1, ms), ...args);
  const source = path.join(dir, 'source.mp4');
  execFileSync('ffmpeg', ['-loglevel','error','-f','lavfi','-i','color=s=64x64:r=24:d=6','-c:v','libx264','-threads','1',source]);
  const media = fs.readFileSync(source);
  const bodies = [];
  globalThis.fetch = async (url, init) => {
    if (init.method === 'POST') { bodies.push(JSON.parse(init.body)); return Response.json({id:'cgt-fixture'}); }
    if (url.endsWith('/cgt-fixture')) return Response.json({status:'succeeded',content:{video_url:'https://example.org/result'},usage:{completion_tokens:100},duration:6});
    assert.equal(init.headers, undefined);
    return new Response(media);
  };
  for (const task of ['edit','extend']) {
    const args = seedanceReferenceSchema.parse({...base, omniReferenceTaskType:task,
      ...(task === 'extend' ? {durationSeconds:6, prompt:'Extend @Video 1 by continuing the walk.'} : {}), outputPath:dir, filename:task+'.mp4'});
    const result = await generateWithReferences(args);
    assert.equal(result.success, true, result.error);
    assert.equal(result.duration, 6);
    assert.deepEqual(fs.readFileSync(result.videoPath), media);
  }
  assert.deepEqual(bodies.map(b => [b.model, b.omni_reference_task_type, b.ratio, b.duration, b.content[1].role]), [
    [model, 'edit','adaptive',-1,'reference_video'], [model,'extend','adaptive',6,'reference_video'],
  ]);
});

test('local video validation precedes media hosting and paid creation', async t => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'seedance-input-'));
  const key=config.arkApiKey, originalUrl=process.env.MEDIA_UPLOAD_URL, originalKey=process.env.MEDIA_UPLOAD_API_KEY;
  config.arkApiKey='fixture'; process.env.MEDIA_UPLOAD_URL='https://example.org/upload'; process.env.MEDIA_UPLOAD_API_KEY='fixture';
  t.after(()=>{
    config.arkApiKey=key;
    if (originalKey===undefined) delete process.env.MEDIA_UPLOAD_API_KEY; else process.env.MEDIA_UPLOAD_API_KEY=originalKey;
    if (originalUrl===undefined) delete process.env.MEDIA_UPLOAD_URL; else process.env.MEDIA_UPLOAD_URL=originalUrl;
    fs.rmSync(dir,{recursive:true,force:true});
  });
  const calls=[];
  t.mock.method(globalThis,'fetch',async (url,options)=>{
    calls.push([url,options.method || 'GET']);
    if (url.endsWith('/upload')) return Response.json({data:{url:'https://example.org/published'}},{status:201});
    if (options.method==='HEAD') return new Response(null,{status:200});
    return Response.json({error:{message:'fixture complete'}},{status:400});
  });
  const request = async filename => generateWithReferences(seedanceReferenceSchema.parse({
    model:'dreamina-seedance-2-5-flash-261115',omniReferenceTaskType:'edit', prompt:'Edit @Video 1 to blue.',
    referenceVideoPaths:[path.join(dir,filename)],outputPath:dir
  }));
  const encode = (name, size, codec) => execFileSync('ffmpeg',['-loglevel','error','-f','lavfi','-i','color=s='+size+':r=24:d=4',
    '-c:v',codec,'-threads','1',path.join(dir,name)]);
  fs.writeFileSync(path.join(dir,'html.mp4'), '<html>upstream error</html>');
  encode('bad-codec.mp4','1280x720','mpeg4');
  encode('wide.mp4','1800x300','libx264');
  for (const file of ['html.mp4','bad-codec.mp4','wide.mp4']) {
    const rejection=await request(file);
    assert.equal(rejection.terminal,true); assert.match(rejection.error,/Unreadable|H.264|ratio/);
    assert.deepEqual(calls,[]);
  }
  encode('valid.mp4','1280x720','libx264');
  await request('valid.mp4');
  assert.deepEqual(calls.map(row=>row[1]),['POST','HEAD','POST']);
});
