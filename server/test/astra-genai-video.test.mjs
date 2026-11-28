import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { config } from '../dist/config.js';
import { astraGenaiBaseUrl } from '../dist/astra-genai-client.js';
import { genaiTextToVideoSchema, genaiImageToVideoSchema, buildGenaiVideoBody, generateGenaiVideo, getGenaiVideoStatus } from '../dist/astra-genai-video.js';
import { parseVideoArgs, speechVideoCapabilities } from '../dist/video-registry.js';
const base = { prompt: 'Clouds cross the sky.', model: 'ltx-2.5-22b-distilled', duration: 5, resolution: '1280x704', reserveUsd: 0 };
function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'genai-video-'));
  const fetch = globalThis.fetch, key = config.astraGenaiApiKey; config.astraGenaiApiKey = 'fixture';
  t.after(() => { globalThis.fetch = fetch; config.astraGenaiApiKey = key; fs.rmSync(dir, { recursive: true, force: true }); });
  return dir;
}
const route = url => new URL(String(url)).pathname;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const heroOpening = [{ character: 'hero', images: [1], position: 'standing on the left by the desk' }];
const pairOpening = [...heroOpening, { character: 'witness', images: [2], position: 'seated in the right foreground' }];

test('image-to-video body follows the common schema and leaves automatic duration to the gateway', () => {
  const args = genaiImageToVideoSchema.parse({ ...base, duration: null, imageUri: 'https://example.com/start.png', lastFrameUri: null });
  assert.deepEqual(buildGenaiVideoBody(args), {
    kind: 'video', model: base.model, mode: 'image2video',
    input: { text: base.prompt, images: [{ url: 'https://example.com/start.png' }] },
    parameters: { width: 1280, height: 704, fps: 24, generate_audio: true },
  });
  assert.equal(buildGenaiVideoBody(genaiTextToVideoSchema.parse(base), 'text-to-video').parameters.duration_seconds, 5);
  for (const input of [{ ...base, fps: 30 }, { ...base, seed: -1 }, { ...base, model: 'ltx-2-5-pro' }]) assert.equal(genaiTextToVideoSchema.safeParse(input).success, false);
  assert.throws(() => parseVideoArgs('astra_genai_text2video', { ...base, requiredSeconds: 5 }), /not supported/);
  assert.equal(speechVideoCapabilities('astra-genai', base.model).audioConditioning, false);
  assert.equal(speechVideoCapabilities('astra-genai', base.model, 'audio').audioConditioning, true);
  // A local start frame travels as a checked data URI; a non-HTTPS URI or two sources are refused.
  const png = path.join(os.tmpdir(), `genai-frame-${process.pid}.png`);
  fs.writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=', 'base64'));
  try { assert.match(buildGenaiVideoBody(genaiImageToVideoSchema.parse({ ...base, imagePath: png })).input.images[0].url, /^data:image\/png;base64,/); }
  finally { fs.rmSync(png, { force: true }); }
  for (const frame of [{ imageUri: 'file:///tmp/a.png' }, { imageUri: 'https://example.com/a.png', imagePath: png }, {}])
    assert.equal(genaiImageToVideoSchema.safeParse({ ...base, ...frame }).success, false, JSON.stringify(frame));
});
test('submission is persisted before status failure and the same receipt resumes without another POST', async t => {
  const dir = setup(t), args = { ...base, outputPath: dir, filename: 'clip.mp4' };
  let posts = 0;
  globalThis.fetch = async (url, options) => {
    if (options.method === 'POST') { posts++; return Response.json({ id: 'job-1' }, { status: 202 }); }
    const saved = JSON.parse(fs.readFileSync(path.join(dir, 'clip.mp4.astra-genai.json')));
    assert.equal(saved.jobId, 'job-1');
    return Response.json({ id: 'job-1', status: 'unrecognized' });
  };
  await assert.rejects(generateGenaiVideo('text-to-video', args));
  await assert.rejects(generateGenaiVideo('text-to-video', args));
  assert.equal(posts, 1);
  await assert.rejects(generateGenaiVideo('text-to-video', { ...args, prompt: 'changed' }), /conflicts/);
});
test('I2V references travel on the common route with their frame fields and resume without another POST', async t => {
  const dir=setup(t), args={...base,imageUri:'https://example.com/start.png',lastFrameUri:'https://example.com/end.png',
    openingPositions:heroOpening, references:[{imageUri:'https://example.com/hero.png'},{imageUri:'https://example.com/room.png',background:true}],
    generateAudio:false,outputPath:dir,filename:'combined.mp4'};
  assert.equal(genaiImageToVideoSchema.safeParse({...args,model:'ltx-2.5-22b-dev'}).success,false);
  assert.equal(genaiImageToVideoSchema.safeParse({...args,duration:null}).success,false);
  assert.equal(genaiImageToVideoSchema.safeParse({...args,references:[{imageUri:args.imageUri,background:true}]}).success,false);
  let posts=0;
  globalThis.fetch=async(url,options)=>{
    if(options.method==='POST'){
      posts++;assert.equal(route(url),'/v1/generations');
      const body=JSON.parse(options.body);
      assert.deepEqual([body.kind,body.model,body.mode],['video',args.model,'image2video']);
      assert.deepEqual(body.input.images,[{url:args.imageUri}]);assert.deepEqual(body.input.last_frame,{url:args.lastFrameUri});
      assert.equal(body.parameters.generate_audio,false);
      assert.deepEqual(body.input.references,[{url:args.references[0].imageUri,background:false},{url:args.references[1].imageUri,background:true}]);
      return Response.json({id:'combined-job'}, {status:202});
    }
    assert.equal(route(url),'/v1/generations/combined-job');
    return Response.json({id:'combined-job',status:'failed',error:{message:'fixture'}});
  };
  await assert.rejects(generateGenaiVideo('image-to-video',args),error=>error.terminal===true);
  assert.equal(posts,1);
  await assert.rejects(generateGenaiVideo('image-to-video',args),error=>error.terminal===true);
  assert.equal(posts,1);
});
test('I2V keeps the opening frame and both subject voice slots in a single request', async t => {
  const dir = setup(t);
  const refs = [1, 2].map(n => ({ imageUri: `https://example.com/${n}.png`, audioUri: `https://example.com/${n}.wav` }));
  const args = { ...base, imageUri: 'https://example.com/start.png', references: refs, openingPositions: pairOpening, outputPath: dir };
  for (const references of [[{ ...refs[0], background: true }, refs[1]], [refs[0], refs[1], refs[0]]])
    assert.equal(genaiImageToVideoSchema.safeParse({ ...args, references }).success, false);
  for (const openingPositions of [undefined, [], heroOpening, [heroOpening[0], heroOpening[0]], [{ ...heroOpening[0], images: [1, 3] }]])
    assert.equal(genaiImageToVideoSchema.safeParse({ ...args, openingPositions }).success, false);
  let posts = 0;
  globalThis.fetch = async (url, options) => {
    if (options.method === 'POST') {
      posts++;
      const body = JSON.parse(options.body);
      assert.deepEqual(body.input.images, [{ url: args.imageUri }]);
      assert.match(body.input.text, /witness \(Image 2\): seated in the right foreground/);
      assert.deepEqual(body.input.references.map(r => [r.url, r.audio.url]), refs.map(r => [r.imageUri, r.audioUri]));
      return Response.json({ id: 'pinned' }, { status: 202 });
    }
    return Response.json({ id: 'pinned', status: 'failed', error: { message: 'fixture' } });
  };
  await assert.rejects(generateGenaiVideo('image-to-video', args), e => e.terminal === true);
  assert.equal(posts, 1);
});
test('negatives travel only when set and only where the gateway has a negative pass', async t => {
  const { genaiAudioToVideoSchema, buildGenaiAudioBody } = await import('../dist/astra-genai-video.js');
  const negativePrompt = 'has_subtitles, captions, text overlays', imageUri = 'https://example.com/start.png';
  const dev = { ...base, model: 'ltx-2.5-22b-dev', negativePrompt };
  const audio = { prompt: 'A presenter speaks to camera.', model: 'ltx-2.5-22b-dev', resolution: '1280x720', reserveUsd: 0, audioUri: 'https://example.com/line.wav' };
  // The guided dev pipelines take it as is; leaving it out keeps the engine's own default negative.
  assert.equal(buildGenaiVideoBody(genaiTextToVideoSchema.parse(dev), 'text-to-video').parameters.negative_prompt, negativePrompt);
  assert.equal(buildGenaiVideoBody(genaiImageToVideoSchema.parse({ ...dev, imageUri })).parameters.negative_prompt, negativePrompt);
  assert.equal(buildGenaiAudioBody(genaiAudioToVideoSchema.parse({ ...audio, negativePrompt })).parameters.negative_prompt, negativePrompt);
  assert.equal('negative_prompt' in buildGenaiVideoBody(genaiTextToVideoSchema.parse(base), 'text-to-video').parameters, false);
  assert.equal('negative_prompt' in buildGenaiAudioBody(genaiAudioToVideoSchema.parse(audio)).parameters, false);
  // Distilled has no negative pass without references; the dev backend caps the text at 2000 characters.
  for (const bad of [{ ...base, negativePrompt }, { ...dev, negativePrompt: ' ' }, { ...dev, negativePrompt: 'x'.repeat(2001) }])
    assert.equal(genaiTextToVideoSchema.safeParse(bad).success, false, JSON.stringify(bad).slice(0, 120));
  for (const bad of [{ negativePrompt: ' ' }, { negativePrompt: 'x'.repeat(2001) }])
    assert.equal(genaiAudioToVideoSchema.safeParse({ ...audio, ...bad }).success, false);
  // The MSR guidance knobs exist only on the reference path, under the MSR pairing rule.
  const refs = { ...base, imageUri, openingPositions: heroOpening, references: [{ imageUri: 'https://example.com/hero.png' }], negativePrompt };
  for (const bad of [{ ...dev, imageUri, guidanceScale: 2 }, { ...dev, imageUri, nagScale: 11 }, { ...base, imageUri, negativePrompt }, refs,
    { ...refs, guidanceScale: 1 }, { ...refs, negativePrompt: undefined, nagScale: 11 }, { ...refs, nagScale: 11, negativePrompt: 'x'.repeat(5001) }])
    assert.equal(genaiImageToVideoSchema.safeParse(bad).success, false, JSON.stringify(bad).slice(0, 160));
  const guided = buildGenaiVideoBody(genaiImageToVideoSchema.parse({ ...refs, guidanceScale: 2 })).parameters;
  assert.deepEqual([guided.negative_prompt, guided.guidance_scale, 'nag_scale' in guided], [negativePrompt, 2, false]);
  const dir = setup(t), args = { ...refs, nagScale: 11, nagTau: 3, outputPath: dir, filename: 'negative.mp4' };
  let posts = 0, fields = [];
  globalThis.fetch = async (url, options) => {
    if (route(url) === '/v1/models') return Response.json({ data: [{ id: base.model, kind: 'video', parameters_by_mode: { image2video: fields } }] });
    if (options.method === 'POST') {
      posts++;
      const sent = JSON.parse(options.body).parameters;
      assert.deepEqual([sent.negative_prompt, sent.nag_scale, sent.nag_tau], [negativePrompt, 11, 3]);
      assert.equal('nag_alpha' in sent, false); assert.equal('guidance_scale' in sent, false);
      return Response.json({ id: 'negative-job' }, { status: 202 });
    }
    return Response.json({ id: 'negative-job', status: 'failed', error: { message: 'fixture' } });
  };
  await assert.rejects(generateGenaiVideo('image-to-video', args), /ltx_fields_unsupported/);
  assert.equal(posts, 0); assert.equal(fs.existsSync(path.join(dir, 'negative.mp4.astra-genai.json')), false);
  fields = ['negative_prompt', 'nag_scale', 'nag_tau'];
  await assert.rejects(generateGenaiVideo('image-to-video', args), error => error.terminal === true && /fixture/.test(error.message));
  assert.equal(posts, 1);
});
test('a rejected submission frees its output name; one status 5xx is polled through and a failed job is terminal', async t => {
  const dir = setup(t), args = { ...base, outputPath: dir, filename: 'clip.mp4' };
  const realSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn, ms = 0, ...rest) => realSetTimeout(fn, ms >= 1000 ? 0 : ms, ...rest);
  t.after(() => { globalThis.setTimeout = realSetTimeout; });
  globalThis.fetch = async () => Response.json({ detail: 'unsupported resolution' }, { status: 422 });
  await assert.rejects(generateGenaiVideo('text-to-video', args), error => error.terminal === true);
  assert.equal(fs.existsSync(path.join(dir, 'clip.mp4.astra-genai.json')), false);
  let gets = 0;
  globalThis.fetch = async (url, options) => options.method === 'POST' ? Response.json({ id: 'job-3' })
    : ++gets === 1 ? new Response('busy', { status: 503 }) : Response.json({ id: 'job-3', status: 'failed', error: { message: 'oom' } });
  await assert.rejects(generateGenaiVideo('text-to-video', args), error => error.terminal === true && /oom/.test(error.message));
  assert.equal(gets, 2);
  let recoveryGets = 0;
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.method, 'GET');
    return ++recoveryGets < 4 ? new Response('busy', {status:503}) : Response.json({id:'job-3', status:'cancelled'});
  };
  await assert.rejects(generateGenaiVideo('text-to-video', args, undefined, {statusRetries:3}), error => error.terminal && error.httpStatus === 200);
  assert.equal(recoveryGets, 4);
});
test('two live preparations follow the same accepted job after racing to claim its filename', async t => {
  const dir = setup(t), args = { ...base, outputPath: dir, filename: 'shared.mp4' };
  let posts = 0;
  globalThis.fetch = async (_url, options) => {
    if (options.method === 'POST') {
      posts++;
      return Response.json({ id: 'shared-job' });
    }
    return Response.json({ id: 'shared-job', status: 'failed', error: { message: 'terminal fixture' } });
  };
  const run = () => generateGenaiVideo('text-to-video', args, new AbortController().signal);
  const results = await Promise.allSettled([run(), run()]);
  assert.equal(posts, 1);
  for (const result of results) {
    assert.equal(result.status, 'rejected');
    assert.match(result.reason.message, /shared-job failed.*terminal fixture/);
  }
});

test('completed LTX result downloads verified video and cached recovery needs no network', async t => {
  const dir = setup(t), source = path.join(dir, 'source.mp4');
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=s=64x64:d=0.1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', source]);
  const bytes = fs.readFileSync(source); let posts = 0, privateResult = false;
  globalThis.fetch = async (url, options) => {
    if (options.method === 'POST') { posts++; return Response.json({ id: 'job-2' }); }
    if (route(url) === '/v1/generations/job-2') return Response.json({ id: 'job-2', status: 'succeeded', outputs: [privateResult
      ? { url: '/v1/ltx/desktop/assets/video-id/bytes', authentication: 'gateway_token' } : { url: 'https://results.example/out.mp4' }] });
    if (privateResult) assert.equal(options.headers.Authorization, 'Bearer fixture');
    else assert.equal(options.headers, undefined);
    return new Response(bytes);
  };
  const result = await generateGenaiVideo('image-to-video', { ...base, imageUri: 'https://example.com/start.png', outputPath: dir, filename: 'clip.mp4' });
  assert.equal(result.downloaded, true); assert.equal(posts, 1);
  privateResult = true;
  assert.equal((await generateGenaiVideo('image-to-video', { ...base, imageUri: 'https://example.com/start.png', outputPath: dir, filename: 'private.mp4' })).downloaded, true);
  globalThis.fetch = async () => assert.fail('cached result must not make a request');
  assert.equal((await getGenaiVideoStatus({ receiptPath: result.receiptPath, download: true })).videoPath, result.videoPath);
  fs.writeFileSync(result.videoPath, 'changed');
  await assert.rejects(getGenaiVideoStatus({ receiptPath: result.receiptPath, download: true }), /changed/);
});

test('MSR validates slots, geometry and frame timing against its independent contract', async () => {
  const { genaiMsrSchema, buildGenaiMsrBody } = await import('../dist/astra-genai-video.js');
  const ref = { imageUri: 'https://example.com/person.png' };
  const args = { prompt: 'Person in image 1 says hello in image 2.', openingPositions: heroOpening, references: [{ ...ref, audioUri: 'https://example.com/voice.wav' }, { ...ref, background: true }], reserveUsd: 0 };
  const body = buildGenaiMsrBody(genaiMsrSchema.parse({ ...args, duration: 5 }));
  assert.equal(genaiMsrSchema.safeParse({ ...args, openingPositions: undefined }).success, false);
  const objectOnly = genaiMsrSchema.parse({ ...args, references: [{ ...ref, nonCharacter: true }], openingPositions: [] });
  assert.equal(buildGenaiMsrBody(objectOnly).input.text, args.prompt);
  assert.equal(buildGenaiMsrBody(objectOnly).input.images[0].nonCharacter, undefined);
  assert.deepEqual([body.kind, body.model, body.mode], ['video', 'ltx-msr', 'msr']);
  assert.equal(body.parameters.duration_seconds, 5); assert.equal(body.parameters.num_frames, undefined);
  assert.deepEqual(body.input.images[0].audio, { url: 'https://example.com/voice.wav' });
  assert.equal(body.input.images[1].background, true);
  for (const extra of [{ references: Array(5).fill(ref) }, { references: Array(2).fill({ ...ref, background: true }) }, { width: 1920, height: 1920 }, { numFrames: 120 }, { duration: 5, numFrames: 121 }, { duration: 360 }, { model: base.model }, { references: [{ imagePath: 'x', imageUri: ref.imageUri }] }])
    assert.equal(genaiMsrSchema.safeParse({ ...args, ...extra }).success, false);
});

test('MSR preserves positive prompts and only sends effective negatives to an advertised backend', async t => {
  const { genaiMsrSchema, buildGenaiMsrBody } = await import('../dist/astra-genai-video.js');
  const dir = setup(t);
  const args = { prompt: 'The person says "Hello."', openingPositions: heroOpening, references: [{ imageUri: 'https://example.com/person.png' }], reserveUsd: 0, outputPath: dir, filename: 'negative.mp4' };
  const parsed = genaiMsrSchema.parse(args), body = buildGenaiMsrBody(parsed);
  assert.ok(body.input.text.endsWith(args.prompt));
  assert.match(body.input.text, /hero \(Image 1\): standing on the left by the desk/);
  assert.deepEqual(genaiMsrSchema.parse(parsed), parsed); // Planning and execution both parse.
  assert.equal(body.parameters.negative_prompt, undefined);
  assert.equal(body.parameters.guidance_scale, undefined); // Keep distilled CFG=1 unless explicitly changed.
  assert.equal(genaiMsrSchema.safeParse({ ...args, prompt: 'x'.repeat(2000 - (body.input.text.length - args.prompt.length)) }).success, true);
  assert.equal(genaiMsrSchema.safeParse({ ...args, prompt: 'x'.repeat(5001) }).success, false);
  const negative = { ...args, negativePrompt: 'subtitles, captions', guidanceScale: 2 };
  for (const extra of [{ guidanceScale: undefined }, { guidanceScale: 1 }, { guidanceScale: 11 }, { negativePrompt: ' ' }])
    assert.equal(genaiMsrSchema.safeParse({ ...negative, ...extra }).success, false);
  let posts = 0, fields = ['guidance_scale'];
  globalThis.fetch = async (url, options) => {
    if (route(url) === '/v1/models') return Response.json({ data: [{ id: 'ltx-msr', kind: 'video', parameters_by_mode: { msr: fields } }] });
    if (options.method === 'POST') {
      posts++;
      const sent = JSON.parse(options.body);
      assert.equal(sent.parameters.negative_prompt, negative.negativePrompt);
      assert.equal(sent.parameters.guidance_scale, 2);
      assert.equal(sent.input.text, body.input.text);
      return Response.json({ id: 'negative-job' }, { status: 202 });
    }
    return Response.json({ id: 'negative-job', status: 'unrecognized' });
  };
  await assert.rejects(generateGenaiVideo('msr', negative), /ltx_fields_unsupported/);
  assert.equal(posts, 0); assert.equal(fs.existsSync(path.join(dir, 'negative.mp4.astra-genai.json')), false);
  fields = ['negative_prompt', 'guidance_scale'];
  await assert.rejects(generateGenaiVideo('msr', negative));
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'negative.mp4.astra-genai.json'), 'utf8')).jobId, 'negative-job');
  await assert.rejects(generateGenaiVideo('msr', negative));
  assert.equal(posts, 1);
});

test('MSR NAG validates controls, checks support and preserves recovery identity', async t => {
  const { genaiMsrSchema, buildGenaiMsrBody } = await import('../dist/astra-genai-video.js');
  const dir = setup(t);
  const args = { prompt: 'A teacher speaks.', openingPositions: heroOpening, references: [{ imageUri: 'https://example.com/person.png' }],
    negativePrompt: 'subtitles', guidanceScale: 1, nagScale: 11, nagAlpha: 0.25, nagTau: 2.5,
    reserveUsd: 0, outputPath: dir, filename: 'nag.mp4' };
  for (const extra of [{ nagScale: 0 }, { nagScale: 101 }, { nagScale: NaN }, { nagAlpha: -1 },
    { nagTau: 11 }, { negativePrompt: undefined }, { negativePrompt: ' ' }])
    assert.equal(genaiMsrSchema.safeParse({ ...args, ...extra }).success, false);
  const parsed = genaiMsrSchema.parse(args);
  assert.deepEqual(genaiMsrSchema.parse(parsed), parsed);
  const body = buildGenaiMsrBody(parsed);
  assert.deepEqual([body.parameters.nag_scale, body.parameters.nag_alpha, body.parameters.nag_tau], [11, 0.25, 2.5]);
  const disabled = buildGenaiMsrBody(genaiMsrSchema.parse({ ...args, guidanceScale: 2, nagScale: 0 }));
  for (const field of ['nag_scale', 'nag_alpha', 'nag_tau']) assert.equal(disabled.parameters[field], undefined);
  let posts = 0, fields = ['negative_prompt', 'guidance_scale'];
  globalThis.fetch = async (url, options) => {
    if (route(url) === '/v1/models') return Response.json({ data: [{ id: 'ltx-msr', kind: 'video', parameters_by_mode: { msr: fields } }] });
    if (options.method === 'POST') {
      posts++; assert.deepEqual(JSON.parse(options.body), body);
      return Response.json({ id: 'nag-job' }, { status: 202 });
    }
    return Response.json({ id: 'nag-job', status: 'unrecognized' });
  };
  await assert.rejects(generateGenaiVideo('msr', args), /ltx_fields_unsupported/);
  assert.equal(posts, 0); assert.equal(fs.existsSync(path.join(dir, 'nag.mp4.astra-genai.json')), false);
  fields = ['negative_prompt', 'guidance_scale', 'nag_scale', 'nag_alpha', 'nag_tau'];
  await assert.rejects(generateGenaiVideo('msr', args));
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'nag.mp4.astra-genai.json'), 'utf8')).jobId, 'nag-job');
  await assert.rejects(generateGenaiVideo('msr', args));
  await assert.rejects(generateGenaiVideo('msr', { ...args, nagScale: 12 }), /conflicts/);
  assert.equal(posts, 1);
});

test('MSR recovery follows the common job route and never submits twice', async t => {
  const dir = setup(t), source = path.join(dir, 'reference.png');
  fs.writeFileSync(source, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=', 'base64'));
  const args = { prompt: 'The person says hello.', openingPositions: heroOpening, references: [{ imagePath: source, audioUri: 'https://example.com/voice.wav' }], reserveUsd: 0, outputPath: dir, filename: 'msr.mp4' };
  let posts = 0;
  globalThis.fetch = async (url, options) => {
    // A gateway without the upload API keeps the inline data URI.
    if (route(url) === '/v1/uploads') return new Response('not found', { status: 404 });
    if (options.method === 'POST') {
      posts++; assert.equal(route(url), '/v1/generations');
      const body = JSON.parse(options.body);
      assert.equal(body.mode, 'msr');
      assert.match(body.input.images[0].url, /^data:image\/png;base64,/);
      return Response.json({ id: 'msr-job' }, { status: 202 });
    }
    assert.equal(route(url), '/v1/generations/msr-job');
    return Response.json({ id: 'msr-job', status: 'failed', error: { message: 'fixture' } });
  };
  await assert.rejects(generateGenaiVideo('msr', args), /fixture/);
  await assert.rejects(generateGenaiVideo('msr', args), /fixture/);
  assert.equal(posts, 1);
  const receiptPath = path.join(dir, 'msr.mp4.astra-genai.json');
  globalThis.fetch = async url => {
    assert.equal(route(url), '/v1/generations/msr-job');
    return Response.json({ id: 'msr-job', status: 'running' });
  };
  assert.equal((await getGenaiVideoStatus({ receiptPath, download: false })).status, 'processing');
});

test('MSR sends local sources as chunked file ids, leaves HTTPS alone and resumes without uploading again', async t => {
  const dir = setup(t), source = path.join(dir, 'reference.png'), wav = path.join(dir, 'voice.wav');
  execFileSync('ffmpeg', ['-v','error','-f','lavfi','-i','color=s=256x128','-frames:v','1',source]);
  fs.writeFileSync(wav, Buffer.alloc(64, 1));
  const args = { prompt: 'The person says hello.', openingPositions: heroOpening, references: [{ imagePath: source, audioPath: wav }, { imageUri: 'https://example.com/place.png', background: true }],
    width:64,height:64,reserveUsd: 0, outputPath: dir, filename: 'msr.mp4' };
  const uploads = [];
  let submitted;
  globalThis.fetch = async (url, options) => {
    const at = route(url);
    if (at.startsWith('/v1/uploads')) {
      uploads.push(`${options.method} ${at}`);
      const id = `u${uploads.filter(call => call.endsWith('/v1/uploads')).length}`;
      if (at === '/v1/uploads' && id === 'u1') assert.equal(JSON.parse(options.body).size,fs.statSync(source).size);
      if (at === '/v1/uploads') return Response.json({ upload_id: id, chunk_size: 5 * 1024 * 1024, chunks: 1 });
      if (at.endsWith('/complete')) return Response.json({ file_id: at.split('/')[3], uri: `genai-file://${at.split('/')[3]}`, expires_at: '2099-01-01T00:00:00Z' });
      return new Response(null, { status: 204 });
    }
    if (at === '/v1/generations') { submitted = JSON.parse(options.body); return Response.json({ id: 'msr-job' }, { status: 202 }); }
    return Response.json({ id: 'msr-job', status: 'failed', error: { message: 'fixture' } });
  };
  await assert.rejects(generateGenaiVideo('msr', args), /fixture/);
  assert.equal(submitted.input.images[0].url, 'genai-file://u1');
  assert.equal(submitted.input.images[0].audio.url, 'genai-file://u2');
  assert.equal(submitted.input.images[1].url, 'https://example.com/place.png');
  assert.ok(JSON.stringify(submitted).length < 2000);
  const receipt = JSON.parse(fs.readFileSync(path.join(dir, 'msr.mp4.astra-genai.json'), 'utf8'));
  const { genaiMsrSchema, buildGenaiMsrBody } = await import('../dist/astra-genai-video.js');
  // The receipt binds the request as written, not the per-upload file ids.
  assert.equal(receipt.fingerprint, sha256(JSON.stringify(buildGenaiMsrBody(genaiMsrSchema.parse(args)))));
  const before = uploads.length;
  await assert.rejects(generateGenaiVideo('msr', args), /fixture/);
  assert.equal(uploads.length, before);
});

test('an MSR 400 or 422 for a lost genai-file id uploads again and resubmits once', async t => {
  const { forgetGenaiUploads } = await import('../dist/astra-genai-upload.js');
  const dir = setup(t), source = path.join(dir, 'reference.png');
  fs.writeFileSync(source, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=', 'base64'));
  for (const gone of [400, 422]) {
    forgetGenaiUploads();
    const args = { prompt: 'The person waves.', openingPositions: heroOpening, references: [{ imagePath: source }], reserveUsd: 0, outputPath: dir, filename: `gone-${gone}.mp4` };
    let creates = 0;
    const submissions = [];
    globalThis.fetch = async (url, options) => {
      const at = route(url);
      if (at === '/v1/uploads') { creates++; return Response.json({ upload_id: `g${creates}`, chunk_size: 4 * 1024 * 1024, chunks: 1 }, { status: 201 }); }
      if (at.endsWith('/complete')) return Response.json({ file_id: at.split('/')[3], uri: `genai-file://${at.split('/')[3]}`, expires_at: '2099-01-01T00:00:00Z' });
      if (at.startsWith('/v1/uploads')) return new Response(null, { status: 204 });
      if (at === '/v1/generations') {
        submissions.push(JSON.parse(options.body).input.images[0].url);
        if (submissions.length === 1) return Response.json({ error: { type: 'invalid_request_error', message: 'input.images.0.url: genai-file not found or expired' } }, { status: gone });
        return Response.json({ id: 'msr-gone' }, { status: 202 });
      }
      return Response.json({ id: 'msr-gone', status: 'failed', error: { message: 'fixture' } });
    };
    await assert.rejects(generateGenaiVideo('msr', args), /fixture/);
    assert.deepEqual(submissions, ['genai-file://g1', 'genai-file://g2'], String(gone));
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, `gone-${gone}.mp4.astra-genai.json`), 'utf8')).jobId, 'msr-gone');
  }
});

test('a large voice sample with no upload API is refused before anything is submitted', async t => {
  const { forgetGenaiUploads } = await import('../dist/astra-genai-upload.js');
  forgetGenaiUploads();
  const dir = setup(t), source = path.join(dir, 'reference.png'), wav = path.join(dir, 'voice.wav');
  fs.writeFileSync(source, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=', 'base64'));
  // 6.5 MB of voice is about 8.7 MB as base64; voice cannot be shrunk.
  fs.writeFileSync(wav, Buffer.alloc(6_500_000, 1));
  const args = { prompt: 'The person says hello.', openingPositions: heroOpening, references: [{ imagePath: source, audioPath: wav }], reserveUsd: 0, outputPath: dir, filename: 'big.mp4' };
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push(`${options.method} ${route(url)}`);
    if (route(url) === '/v1/uploads') return new Response('not found', { status: 404 });
    return assert.fail(`unexpected ${options.method} ${route(url)}`);
  };
  await assert.rejects(generateGenaiVideo('msr', args), /msr_body_too_large: .*nothing was submitted\. Try again later/);
  assert.ok(!calls.includes('POST /v1/generations'));
  assert.ok(!fs.existsSync(path.join(dir, 'big.mp4.astra-genai.json')));
});

test('audio-to-video follows the common audio2video body and its data URI limits', async t => {
  const { genaiAudioToVideoSchema, buildGenaiAudioBody, genaiAudioUri, GENAI_AUDIO_DATA_URI_MAX } = await import('../dist/astra-genai-video.js');
  const dir = setup(t), wav = path.join(dir, 'line.wav');
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=d=0.2', '-ac', '1', wav]);
  const audio = { prompt: 'A presenter speaks to camera.', model: 'ltx-2.5-22b-dev', resolution: '1280x720', reserveUsd: 0 };
  const body = buildGenaiAudioBody(genaiAudioToVideoSchema.parse({ ...audio, audioPath: wav, imageUri: 'https://example.com/a.png', lastFrameUri: 'https://example.com/b.png' }));
  // The track sets the length: no duration and no generate_audio.
  assert.deepEqual(body, { kind: 'video', model: audio.model, mode: 'audio2video',
    input: { text: audio.prompt, audio: { url: `data:audio/wav;base64,${fs.readFileSync(wav).toString('base64')}` },
      images: [{ url: 'https://example.com/a.png' }], last_frame: { url: 'https://example.com/b.png' } },
    parameters: { width: 1280, height: 720, fps: 24 } });
  globalThis.fetch=async (url,options)=>{
    if(options.method==='POST') {
      assert.equal(route(url),'/v1/generations');
      assert.equal(JSON.parse(options.body).input.audio.url,body.input.audio.url);
      return Response.json({id:'a2v-job'});
    }
    return Response.json({id:'a2v-job',status:'failed',error:{message:'fixture'}});
  };
  await assert.rejects(generateGenaiVideo('audio-to-video',{...audio,audioPath:wav,outputPath:dir,filename:'take.mp4'}),e=>e.terminal);
  const receipt=JSON.parse(fs.readFileSync(path.join(dir,'take.mp4.astra-genai.json')));
  assert.equal(receipt.conditioningAudioSha256,sha256(fs.readFileSync(wav)));
  for (const extra of [{}, { audioPath: wav, audioUri: 'https://example.com/a.wav' }, { audioPath: wav, model: 'ltx-2.5-22b-distilled', negativePrompt: 'subtitle' },
    { audioPath: wav, prompt: '  ' }, { audioPath: wav, duration: 6 }, { audioPath: wav, generateAudio: true }, { audioPath: wav, cameraMotion: 'static' },
    { audioPath: wav, lastFrameUri: 'https://example.com/b.png' }, { audioPath: wav, fps: 30 }])
    assert.equal(genaiAudioToVideoSchema.safeParse({ ...audio, ...extra }).success, false, JSON.stringify(Object.keys(extra)));
  assert.equal(GENAI_AUDIO_DATA_URI_MAX, 15_000_000);
  assert.ok(genaiAudioUri('data:audio/ogg;base64,' + 'A'.repeat(15_000_000)));
  assert.throws(() => genaiAudioUri('data:audio/ogg;base64,' + 'A'.repeat(15_000_004)), /15,000,000/);
  assert.throws(() => genaiAudioUri('data:audio/x-wav;base64,AAAA'), /audio\/wav/);
  assert.throws(() => genaiAudioUri(undefined, path.join(dir, 'line.flac')), /\.wav/);
});

test('MSR voice samples are optional and ride on subjects 1-2', async t => {
  const { genaiMsrSchema, buildGenaiMsrBody } = await import('../dist/astra-genai-video.js');
  const dir = setup(t), wav = path.join(dir, 'voice.wav');
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=d=0.2', '-ac', '1', wav]);
  const ref = { imageUri: 'https://example.com/person.png' }, msr = references => ({ prompt: 'x', reserveUsd: 0, references, openingPositions: references.filter(ref => !ref.background).map((_, i) => ({ character: 'person' + i, images: [i + 1], position: 'at desk ' + (i + 1) })) });
  const body = buildGenaiMsrBody(genaiMsrSchema.parse(msr([ref, { ...ref, audioPath: wav }, { ...ref, background: true }])));
  assert.equal(body.input.images[0].audio, undefined);
  assert.equal(genaiMsrSchema.safeParse(msr([ref])).success, true);
  assert.match(body.input.images[1].audio.url, /^data:audio\/wav;base64,/);
  for (const references of [[ref, { ...ref, background: true, audioPath: wav }], [ref, ref, { ...ref, audioPath: wav }],
    [{ ...ref, audioPath: wav, audioUri: 'https://example.com/v.wav' }]])
    assert.equal(genaiMsrSchema.safeParse(msr(references)).success, false);
});


test('local I2V rejects incompatible geometry, timing and camera controls before uploads', () => {
  const image = { ...base, imageUri: 'https://example.com/start.png' };
  for (const change of [
    { resolution: '65x64' }, { resolution: '64x65' }, { resolution: '1x1' },
    { resolution: '1920x1080' }, { resolution: '720p' }, { duration: 0 },
    { duration: 16 }, { duration: 8, fps: 48 }, { prompt: 'x'.repeat(2001) },
    { cameraMotion: 'static' }, { cameraMotion: null },
    { duration: null, lastFrameUri: 'https://example.com/end.png' },
    { duration: null, lastFramePath: '/tmp/end.png' },
  ]) assert.equal(genaiImageToVideoSchema.safeParse({ ...image, ...change }).success, false, JSON.stringify(change));
  for (const change of [{ resolution: '66x66' }, { resolution: '1080x1080' }, { duration: 15 },
    { duration: 7, fps: 50 }, { duration: null }, { duration: null, lastFrameUri: null }])
    assert.equal(genaiImageToVideoSchema.safeParse({ ...image, ...change }).success, true, JSON.stringify(change));
});

test('cancelled legacy jobs are terminal and reuse their receipt without resubmission', async t => {
  const dir = setup(t); let posts = 0;
  globalThis.fetch = async (_url, options) => {
    if (options.method === 'POST') { posts++; return Response.json({ id: 'cancelled-job' }); }
    return Response.json({ id: 'cancelled-job', status: 'cancelled', completed_at: '2026-11-10T00:00:00Z', result: { outputs: [{ media_kind: 'image', url: '/v1/ltx/desktop/assets/preview/bytes' }] } });
  };
  const args = { ...base, outputPath: dir, filename: 'cancelled.mp4' };
  for (let i = 0; i < 2; i++) await assert.rejects(generateGenaiVideo('text-to-video', args), e => e.terminal === true && /cancelled/.test(e.message));
  assert.equal(posts, 1);
});


test('private compatibility results cannot send the gateway token to foreign URLs', async t => {
  const dir = setup(t);
  for (const [i, url] of ['https://other.example/v1/ltx/desktop/assets/id/bytes',
    new URL('/v1/ltx/desktop/generations/id', astraGenaiBaseUrl()).href,
    new URL('/v1/ltx/desktop/assets/id/bytes?redirect=other', astraGenaiBaseUrl()).href].entries()) {
    let requests = 0;
    globalThis.fetch = async (_url, options) => {
      requests++;
      if (options.method === 'POST') return Response.json({ id: 'private-job' });
      if (requests > 2) assert.fail('Invalid private result was fetched');
      return Response.json({ id: 'private-job', status: 'succeeded', outputs: [{ url, authentication: 'gateway_token' }] });
    };
    await assert.rejects(generateGenaiVideo('text-to-video', { ...base, outputPath: dir, filename: `unsafe-${i}.mp4` }), /Invalid private/);
    assert.equal(requests, 2);
  }
});

test('exact frames reach the common body as num_frames with no seconds conversion', () => {
  const args = { ...base, duration: undefined, numFrames: 121 };
  const { parameters } = buildGenaiVideoBody(genaiTextToVideoSchema.parse(args), 'text-to-video');
  assert.equal(parameters.num_frames, 121);
  assert.equal(Object.hasOwn(parameters, 'duration_seconds'), false);
  for (const change of [{ duration: 5 }, { numFrames: 120 }])
    assert.equal(genaiTextToVideoSchema.safeParse({ ...args, ...change }).success, false);
});

// The gateway turns shots[] into prompt text of its own. The caller's prompt is the whole prompt (user directive 2026-11-25).
test('no GenAI video adapter takes shot text for the gateway to write a prompt from', () => {
  const shots = [{description:'Spectators wait.'},{description:'The hand presses play.',transition:'hard_cut'}];
  for (const [tool,schema,inputs] of [['astra_genai_text2video',genaiTextToVideoSchema,base],
    ['astra_genai_img2video',genaiImageToVideoSchema,{...base,imageUri:'https://example.com/open.png'}]]) {
    assert.equal(schema.safeParse({...inputs,shots}).success,false);
    assert.throws(()=>parseVideoArgs(tool,{...inputs,shots}),/Unsupported/);
    const body = buildGenaiVideoBody(schema.parse(inputs));
    assert.equal(body.input.text,base.prompt);
    assert.equal(Object.hasOwn(body.input,'shots'),false);
  }
  assert.throws(()=>parseVideoArgs('astra_genai_audio2video',{...base,audioPath:'scene.wav',shots}),/Unsupported/);
});

test('MSR verifies requested media on first download and cached recovery', async t => {
  const {msrOutputContract,checkGenaiVideoOptions} = await import('../dist/astra-genai-video.js');
  const dir=setup(t), file=path.join(dir,'wrong.mp4'), receiptPath=path.join(dir,'receipt.json');
  execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=s=64x64:r=24','-frames:v','1',file]);
  const bytes=fs.readFileSync(file), target=path.join(dir,'result.mp4');
  const expected=msrOutputContract('msr',{width:128,height:128,skipStage2:true,duration:5,frameRate:24});
  assert.deepEqual(expected,{width:64,height:64,fps:24,frames:121,audio:true});
  const receipt={version:1,baseUrl:astraGenaiBaseUrl(),operation:'msr',jobId:'job',fingerprint:'a',videoPath:target,status:'submitted',expected};
  fs.writeFileSync(receiptPath,JSON.stringify(receipt));
  globalThis.fetch=async url=>route(url)==='/v1/generations/job'
    ? Response.json({id:'job',status:'succeeded',outputs:[{url:'https://example.org/result.mp4'}]})
    : new Response(bytes);
  await assert.rejects(getGenaiVideoStatus({receiptPath,download:true}),/requested video/);
  assert.equal(fs.existsSync(target),false);
  assert.equal(JSON.parse(fs.readFileSync(receiptPath)).status,'submitted');
  fs.writeFileSync(target,bytes);
  fs.writeFileSync(receiptPath,JSON.stringify({...receipt,status:'completed',sha256:sha256(bytes)}));
  globalThis.fetch=()=>assert.fail('no network on cached recovery');
  await assert.rejects(getGenaiVideoStatus({receiptPath,download:true}),/requested video/);
  // The catalog is read row by row: a speech row of another shape does not hide the MSR row.
  const catalog=fields=>async()=>Response.json({data:[{id:'voxcpm2',kind:'speech',modes:'tts'},{id:'ltx-msr',kind:'video',parameters_by_mode:{msr:fields}}]});
  globalThis.fetch=catalog(['guidance_scale']);
  await assert.rejects(checkGenaiVideoOptions('astra_genai_msr',{referenceStrength:0.5}),/ltx_fields_unsupported.*referenceStrength/);
  globalThis.fetch=catalog(['reference_strength']);
  await checkGenaiVideoOptions('astra_genai_msr',{referenceStrength:0.5});
});

// A scene's response can be lost after the gateway made the job. Its receipt keeps the exact body and X-Request-ID,
// and replaying them returns the job the first request made instead of rendering again.
test('a scene receipt without a job is linked by one replay of its saved request inside the window', async t => {
  const dir = setup(t), receiptPath = path.join(dir, 'scene.mp4.astra-genai.json'), requestPath = path.join(dir, 'scene.generation.json');
  const saved = { kind: 'video', model: 'ltx-2.5-22b-distilled', mode: 'scene', input: { prompt: '{hero.face} waves.' }, parameters: { width: 64, height: 64, fps: 24 } };
  fs.writeFileSync(requestPath, JSON.stringify(saved));
  const receipt = { version: 1, baseUrl: astraGenaiBaseUrl(), operation: 'scene', fingerprint: 'f', videoPath: path.join(dir, 'scene.mp4'),
    requestId: 'scene-f', requestPath, submittedAt: new Date().toISOString(), status: 'submitting' };
  fs.writeFileSync(receiptPath, JSON.stringify(receipt));
  const posts = [];
  globalThis.fetch = async (url, options) => {
    if (options.method === 'POST') {
      posts.push({ at: route(url), requestId: options.headers['X-Request-ID'], body: JSON.parse(options.body) });
      return Response.json({ id: 'scene-job' }, { status: 202 });
    }
    assert.equal(route(url), '/v1/generations/scene-job');
    return Response.json({ id: 'scene-job', status: 'running' });
  };
  assert.deepEqual(await getGenaiVideoStatus({ receiptPath, download: false }), { jobId: 'scene-job', status: 'processing', downloaded: false, review: 'not_reviewed' });
  assert.deepEqual(posts, [{ at: '/v1/generations', requestId: 'scene-f', body: saved }]);
  const linked = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  assert.deepEqual([linked.jobId, linked.status], ['scene-job', 'submitted']);
  assert.equal((await getGenaiVideoStatus({ receiptPath, download: false })).jobId, 'scene-job');
  assert.equal(posts.length, 1);
  // Past the window the gateway may no longer tie the request ID to its job, so nothing is sent.
  fs.writeFileSync(receiptPath, JSON.stringify({ ...receipt, submittedAt: new Date(Date.now() - 24 * 3600_000).toISOString() }));
  globalThis.fetch = async () => assert.fail('no request after the replay window');
  await assert.rejects(getGenaiVideoStatus({ receiptPath, download: false }), /genai_replay_window_passed/);
  assert.equal(JSON.parse(fs.readFileSync(receiptPath, 'utf8')).jobId, undefined);
});

test('a new plan of the same scene sends its own request ID, so a retry after a failure is a new job', async t => {
  const dir = setup(t), face = path.join(dir, 'hero.png');
  fs.writeFileSync(face, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=', 'base64'));
  const scene = filename => ({ model: 'ltx-2.5-22b-distilled', prompt: '{hero.face} waves.', resolution: '64x64', reserveUsd: 0, outputPath: dir, filename,
    cast: [{ id: 'hero', images: [{ role: 'face', imagePath: face }] }], shots: [{ id: 's1', frames: 24, imagePath: face }] });
  const ids = [];
  globalThis.fetch = async (url, options) => {
    if (route(url) === '/v1/uploads') return new Response(null, { status: 404 });
    if (route(url) === '/v1/generations/validate')
      return Response.json({ resolved: { num_frames: 25, prompt: 'Image 1 waves.', labels: { 'hero.face': 'Image 1' }, shots: [{ id: 's1', start_frame: 0 }] }, warnings: [] });
    if (options.method === 'POST') { ids.push(options.headers['X-Request-ID']); return Response.json({ id: 'job-' + ids.length }, { status: 202 }); }
    return Response.json({ id: route(url).split('/').pop(), status: 'failed', error: { message: 'out of memory' } });
  };
  for (const filename of ['take-1.mp4', 'take-2.mp4']) await assert.rejects(generateGenaiVideo('scene', scene(filename)), /failed/);
  assert.equal(ids.length, 2);
  assert.notEqual(ids[0], ids[1]);
  assert.ok(ids.every(id => /^scene-[a-f0-9]{64}$/.test(id)));
});

test('a scene download must have the native 8k+1 frames and is cut back to the storyboard frames', async t => {
  const dir = setup(t), receiptPath = path.join(dir, 'scene.mp4.astra-genai.json'), target = path.join(dir, 'scene.mp4');
  const clip = frames => {
    const file = path.join(dir, `native-${frames}.mp4`);
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=s=64x64:r=24', '-f', 'lavfi', '-i', 'sine', '-frames:v', String(frames),
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', file]);
    return fs.readFileSync(file);
  };
  const native = clip(33), short = clip(25);
  // 28 storyboard frames render as the next 8k+1 count, 33.
  const receipt = { version: 1, baseUrl: astraGenaiBaseUrl(), operation: 'scene', fingerprint: 'f', videoPath: target, jobId: 'scene-job', status: 'submitted',
    expected: { width: 64, height: 64, fps: 24, frames: 28, audio: true }, native: { width: 64, height: 64, fps: 24, frames: 33, audio: true } };
  fs.writeFileSync(receiptPath, JSON.stringify(receipt));
  let served;
  globalThis.fetch = async url => route(url) === '/v1/generations/scene-job'
    ? Response.json({ id: 'scene-job', status: 'succeeded', outputs: [{ url: 'https://results.example/scene.mp4' }] })
    : new Response(served);
  served = short;
  await assert.rejects(getGenaiVideoStatus({ receiptPath, download: true }), /requested video frames/);
  assert.equal(fs.existsSync(target), false);
  assert.equal(JSON.parse(fs.readFileSync(receiptPath, 'utf8')).status, 'submitted');
  served = native;
  assert.equal((await getGenaiVideoStatus({ receiptPath, download: true })).videoPath, target);
  const frames = execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', target], { encoding: 'utf8' });
  assert.equal(Number(frames), 28);
  const done = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  assert.equal(done.status, 'completed');
  assert.equal(done.sha256, sha256(fs.readFileSync(target)));
  assert.equal(done.nativeSha256, sha256(native));
  assert.notEqual(done.sha256, done.nativeSha256);
  assert.deepEqual(fs.readFileSync(done.nativePath),native);
  assert.equal((await getGenaiVideoStatus({receiptPath,download:true})).nativePath,done.nativePath);
  fs.writeFileSync(done.nativePath,'changed original');
  await assert.rejects(getGenaiVideoStatus({receiptPath,download:true}), /cached native output changed/);
});
