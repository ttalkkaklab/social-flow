import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { config } from '../dist/config.js';
import { genaiTextToVideoSchema, genaiImageToVideoSchema, buildGenaiVideoBody, generateGenaiVideo, getGenaiVideoStatus } from '../dist/astra-genai-video.js';
import { parseVideoArgs, speechVideoCapabilities } from '../dist/video-registry.js';
const base = { prompt: 'Clouds cross the sky.', model: 'ltx-2.5-22b-distilled', duration: 5, resolution: '1280x704', reserveUsd: 0 };
function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'genai-video-'));
  const fetch = globalThis.fetch, key = config.astraGenaiApiKey; config.astraGenaiApiKey = 'fixture';
  t.after(() => { globalThis.fetch = fetch; config.astraGenaiApiKey = key; fs.rmSync(dir, { recursive: true, force: true }); });
  return dir;
}
test('provider body follows the published gateway fields and preserves required null duration', () => {
  const api = JSON.parse(fs.readFileSync(new URL('./fixtures/astra-genai-openapi-20261020.json', import.meta.url)));
  const args = genaiImageToVideoSchema.parse({ ...base, duration: null, imageUri: 'https://example.com/start.png', lastFrameUri: null, cameraMotion: 'static' });
  const body = buildGenaiVideoBody(args), schema = api.components.schemas.ImageVideo;
  assert.ok(schema.required.every(key => Object.hasOwn(body, key)));
  assert.ok(Object.keys(body).every(key => Object.hasOwn(schema.properties, key)));
  assert.equal(body.duration, null); assert.equal(body.generate_audio, true); assert.equal(body.last_frame_uri, null);
  for (const input of [{ ...base, duration: undefined }, { ...base, fps: 30 }, { ...base, seed: 1 }, { ...base, model: 'ltx-2-5-pro' }]) assert.equal(genaiTextToVideoSchema.safeParse(input).success, false);
  assert.throws(() => parseVideoArgs('astra_genai_text2video', { ...base, requiredSeconds: 5 }), /not supported/);
  assert.equal(speechVideoCapabilities('astra-genai', base.model).audioConditioning, false);
  // A local start frame travels as a checked data URI; a non-HTTPS URI or two sources are refused.
  const png = path.join(os.tmpdir(), `genai-frame-${process.pid}.png`);
  fs.writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=', 'base64'));
  try { assert.match(buildGenaiVideoBody(genaiImageToVideoSchema.parse({ ...base, imagePath: png })).image_uri, /^data:image\/png;base64,/); }
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
test('I2V references retain their v2 route and frame fields, and unsupported backends never submit', async t => {
  const dir=setup(t), args={...base,imageUri:'https://example.com/start.png',lastFrameUri:'https://example.com/end.png',
    references:[{imageUri:'https://example.com/hero.png'},{imageUri:'https://example.com/room.png',background:true}],
    generateAudio:false,outputPath:dir,filename:'combined.mp4'};
  assert.equal(genaiImageToVideoSchema.safeParse({...args,model:'ltx-2.5-22b-dev'}).success,false);
  assert.equal(genaiImageToVideoSchema.safeParse({...args,duration:null}).success,false);
  assert.equal(genaiImageToVideoSchema.safeParse({...args,references:[{imageUri:args.imageUri,background:true}]}).success,false);
  let supported=false,posts=0;
  globalThis.fetch=async(url,options)=>{
    if(String(url).endsWith('/msr/capabilities'))return Response.json({image_conditioning:supported});
    if(options.method==='POST'){
      posts++;assert.ok(String(url).endsWith('/v1/ltx/v2/image-to-video'));
      const body=JSON.parse(options.body);
      assert.equal(body.image_uri,args.imageUri);assert.equal(body.last_frame_uri,args.lastFrameUri);
      assert.equal(body.model,args.model);assert.equal(body.generate_audio,false);
      assert.deepEqual(body.references,[{image_uri:args.references[0].imageUri,background:false},{image_uri:args.references[1].imageUri,background:true}]);
      return Response.json({id:'combined-job'}, {status:202});
    }
    return Response.json({id:'combined-job',status:'failed',error:'fixture'});
  };
  await assert.rejects(generateGenaiVideo('image-to-video',args),/image_references_unsupported/);
  assert.equal(posts,0);assert.equal(fs.existsSync(path.join(dir,'combined.mp4.astra-genai.json')),false);
  supported=true;
  await assert.rejects(generateGenaiVideo('image-to-video',args),error=>error.terminal===true);
  assert.equal(posts,1);
  await assert.rejects(generateGenaiVideo('image-to-video',args),error=>error.terminal===true);
  assert.equal(posts,1);
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
    : ++gets === 1 ? new Response('busy', { status: 503 }) : Response.json({ id: 'job-3', status: 'failed', error: 'oom' });
  await assert.rejects(generateGenaiVideo('text-to-video', args), error => error.terminal === true && /oom/.test(error.message));
  assert.equal(gets, 2);
});
test('completed LTX result downloads verified video and cached recovery needs no network', async t => {
  const dir = setup(t), source = path.join(dir, 'source.mp4');
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=s=64x64:d=0.1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', source]);
  const bytes = fs.readFileSync(source); let posts = 0;
  globalThis.fetch = async (url, options) => {
    if (options.method === 'POST') { posts++; return Response.json({ id: 'job-2' }); }
    if (String(url).includes('/image-to-video/job-2')) return Response.json({ id: 'job-2', status: 'completed', result: { video_url: 'https://results.example/out.mp4' } });
    assert.equal(options.headers, undefined); return new Response(bytes);
  };
  const result = await generateGenaiVideo('image-to-video', { ...base, imageUri: 'https://example.com/start.png', outputPath: dir, filename: 'clip.mp4' });
  assert.equal(result.downloaded, true); assert.equal(posts, 1);
  globalThis.fetch = async () => assert.fail('cached result must not make a request');
  assert.equal((await getGenaiVideoStatus({ receiptPath: result.receiptPath, download: true })).videoPath, result.videoPath);
  fs.writeFileSync(result.videoPath, 'changed');
  await assert.rejects(getGenaiVideoStatus({ receiptPath: result.receiptPath, download: true }), /changed/);
});

test('MSR validates slots, geometry and frame timing against its independent contract', async () => {
  const { genaiMsrSchema, buildGenaiMsrBody } = await import('../dist/astra-genai-video.js');
  const ref = { imageUri: 'https://example.com/person.png' };
  const args = { prompt: 'Person in image 1 says hello in image 2.', references: [{ ...ref, audioUri: 'https://example.com/voice.wav' }, { ...ref, background: true }], reserveUsd: 0 };
  const body = buildGenaiMsrBody(genaiMsrSchema.parse({ ...args, duration: 5 }));
  const api = JSON.parse(fs.readFileSync(new URL('./fixtures/astra-genai-openapi-20261020.json', import.meta.url)));
  assert.ok(Object.keys(body).every(key => key in api.components.schemas.MsrVideo.properties));
  assert.equal(body.duration, 5); assert.equal(body.num_frames, undefined); assert.equal(body.model, undefined);
  assert.equal(body.references[1].background, true);
  for (const extra of [{ references: Array(5).fill(ref) }, { references: Array(2).fill({ ...ref, background: true }) }, { width: 1920, height: 1920 }, { numFrames: 120 }, { duration: 5, numFrames: 121 }, { duration: 360 }, { model: base.model }, { references: [{ imagePath: 'x', imageUri: ref.imageUri }] }])
    assert.equal(genaiMsrSchema.safeParse({ ...args, ...extra }).success, false);
});

test('MSR preserves positive prompts and only sends effective negatives to an advertised backend', async t => {
  const { genaiMsrSchema, buildGenaiMsrBody } = await import('../dist/astra-genai-video.js');
  const dir = setup(t);
  const args = { prompt: 'The person says "Hello."', references: [{ imageUri: 'https://example.com/person.png' }], reserveUsd: 0, outputPath: dir, filename: 'negative.mp4' };
  const parsed = genaiMsrSchema.parse(args), body = buildGenaiMsrBody(parsed);
  assert.equal(body.prompt, args.prompt);
  assert.deepEqual(genaiMsrSchema.parse(parsed), parsed); // Planning and execution both parse.
  assert.equal(body.negative_prompt, undefined);
  assert.equal(body.guidance_scale, undefined); // Keep distilled CFG=1 unless explicitly changed.
  assert.equal(genaiMsrSchema.safeParse({ ...args, prompt: 'x'.repeat(2000) }).success, true);
  assert.equal(genaiMsrSchema.safeParse({ ...args, prompt: 'x'.repeat(2001) }).success, false);
  const negative = { ...args, negativePrompt: 'subtitles, captions', guidanceScale: 2 };
  for (const extra of [{ guidanceScale: undefined }, { guidanceScale: 1 }, { guidanceScale: 11 }, { negativePrompt: ' ' }])
    assert.equal(genaiMsrSchema.safeParse({ ...negative, ...extra }).success, false);
  for (const capability of [false, undefined]) {
    globalThis.fetch = async (url, options) => {
      assert.equal(options.method, 'GET');
      assert.ok(String(url).endsWith('/v1/ltx/msr/capabilities'));
      return Response.json({ negative_prompt: capability });
    };
    await assert.rejects(generateGenaiVideo('msr', negative), /msr_negative_unsupported/);
    assert.equal(fs.existsSync(path.join(dir, 'negative.mp4.astra-genai.json')), false);
  }
  let posts = 0;
  globalThis.fetch = async (url, options) => {
    if (String(url).endsWith('/capabilities')) return Response.json({ negative_prompt: true });
    if (options.method === 'POST') {
      posts++;
      const sent = JSON.parse(options.body);
      assert.equal(sent.negative_prompt, negative.negativePrompt);
      assert.equal(sent.guidance_scale, 2);
      assert.equal(sent.prompt, body.prompt);
      return Response.json({ id: 'negative-job' }, { status: 202 });
    }
    return Response.json({ id: 'negative-job', status: 'unrecognized' });
  };
  await assert.rejects(generateGenaiVideo('msr', negative));
  await assert.rejects(generateGenaiVideo('msr', negative));
  assert.equal(posts, 1);
});

test('MSR NAG validates controls, checks support and preserves recovery identity', async t => {
  const { genaiMsrSchema, buildGenaiMsrBody } = await import('../dist/astra-genai-video.js');
  const dir = setup(t);
  const args = { prompt: 'A teacher speaks.', references: [{ imageUri: 'https://example.com/person.png' }],
    negativePrompt: 'subtitles', guidanceScale: 1, nagScale: 11, nagAlpha: 0.25, nagTau: 2.5,
    reserveUsd: 0, outputPath: dir, filename: 'nag.mp4' };
  for (const extra of [{ nagScale: 0 }, { nagScale: 101 }, { nagScale: NaN }, { nagAlpha: -1 },
    { nagTau: 11 }, { negativePrompt: undefined }, { negativePrompt: ' ' }])
    assert.equal(genaiMsrSchema.safeParse({ ...args, ...extra }).success, false);
  const parsed = genaiMsrSchema.parse(args);
  assert.deepEqual(genaiMsrSchema.parse(parsed), parsed);
  const body = buildGenaiMsrBody(parsed);
  assert.deepEqual([body.nag_scale, body.nag_alpha, body.nag_tau], [11, 0.25, 2.5]);
  const disabled = buildGenaiMsrBody(genaiMsrSchema.parse({ ...args, guidanceScale: 2, nagScale: 0 }));
  for (const field of ['nag_scale', 'nag_alpha', 'nag_tau']) assert.equal(disabled[field], undefined);
  for (const nag of [false, undefined]) {
    globalThis.fetch = async (url, options) => {
      assert.equal(options.method, 'GET'); assert.ok(String(url).endsWith('/capabilities'));
      return Response.json({ negative_prompt: true, nag });
    };
    await assert.rejects(generateGenaiVideo('msr', args), /msr_nag_unsupported/);
    assert.equal(fs.existsSync(path.join(dir, 'nag.mp4.astra-genai.json')), false);
  }
  let posts = 0;
  globalThis.fetch = async (url, options) => {
    if (String(url).endsWith('/capabilities')) return Response.json({ negative_prompt: true, nag: true });
    if (options.method === 'POST') {
      posts++; assert.deepEqual(JSON.parse(options.body), body);
      return Response.json({ id: 'nag-job' }, { status: 202 });
    }
    return Response.json({ id: 'nag-job', status: 'unrecognized' });
  };
  await assert.rejects(generateGenaiVideo('msr', args));
  await assert.rejects(generateGenaiVideo('msr', args));
  await assert.rejects(generateGenaiVideo('msr', { ...args, nagScale: 12 }), /conflicts/);
  assert.equal(posts, 1);
});

test('MSR recovery uses the MSR route and never submits twice', async t => {
  const dir = setup(t), source = path.join(dir, 'reference.png');
  fs.writeFileSync(source, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=', 'base64'));
  const args = { prompt: 'The person says hello.', references: [{ imagePath: source, audioUri: 'https://example.com/voice.wav' }], reserveUsd: 0, outputPath: dir, filename: 'msr.mp4' };
  let posts = 0;
  globalThis.fetch = async (url, options) => {
    if (String(url).endsWith('/capabilities')) return Response.json({ msr: true, voice_references: true });
    // A gateway without the upload API keeps the inline data URI.
    if (String(url).endsWith('/v1/uploads')) return new Response('not found', { status: 404 });
    if (options.method === 'POST') {
      posts++; assert.ok(String(url).endsWith('/v1/ltx/msr'));
      assert.match(JSON.parse(options.body).references[0].image_uri, /^data:image\/png;base64,/);
      return Response.json({ id: 'msr-job' }, { status: 202 });
    }
    assert.ok(String(url).endsWith('/v1/ltx/msr/msr-job'));
    return Response.json({ id: 'msr-job', status: 'failed', error: 'fixture' });
  };
  await assert.rejects(generateGenaiVideo('msr', args), /fixture/);
  await assert.rejects(generateGenaiVideo('msr', args), /fixture/);
  assert.equal(posts, 1);
  const receiptPath = path.join(dir, 'msr.mp4.astra-genai.json');
  globalThis.fetch = async url => {
    assert.ok(String(url).endsWith('/v1/ltx/msr/msr-job'));
    return Response.json({ id: 'msr-job', status: 'processing' });
  };
  assert.equal((await getGenaiVideoStatus({ receiptPath, download: false })).status, 'processing');
});

test('MSR sends local sources as chunked file ids, leaves HTTPS alone and resumes without uploading again', async t => {
  const dir = setup(t), source = path.join(dir, 'reference.png'), wav = path.join(dir, 'voice.wav');
  fs.writeFileSync(source, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=', 'base64'));
  fs.writeFileSync(wav, Buffer.alloc(64, 1));
  const args = { prompt: 'The person says hello.', references: [{ imagePath: source, audioPath: wav }, { imageUri: 'https://example.com/place.png', background: true }],
    reserveUsd: 0, outputPath: dir, filename: 'msr.mp4' };
  const uploads = [];
  let submitted;
  globalThis.fetch = async (url, options) => {
    const route = new URL(String(url)).pathname;
    if (route.endsWith('/capabilities')) return Response.json({ msr: true, voice_references: true });
    if (route.startsWith('/v1/uploads')) {
      uploads.push(`${options.method} ${route}`);
      const id = `u${uploads.filter(call => call.endsWith('/v1/uploads')).length}`;
      if (route === '/v1/uploads') return Response.json({ upload_id: id, chunk_size: 5 * 1024 * 1024, chunks: 1 });
      if (route.endsWith('/complete')) return Response.json({ file_id: route.split('/')[3], uri: `genai-file://${route.split('/')[3]}`, expires_at: '2099-01-01T00:00:00Z' });
      return new Response(null, { status: 204 });
    }
    if (route === '/v1/ltx/msr') { submitted = JSON.parse(options.body); return Response.json({ id: 'msr-job' }, { status: 202 }); }
    return Response.json({ id: 'msr-job', status: 'failed', error: 'fixture' });
  };
  await assert.rejects(generateGenaiVideo('msr', args), /fixture/);
  assert.equal(submitted.references[0].image_uri, 'genai-file://u1');
  assert.equal(submitted.references[0].audio_uri, 'genai-file://u2');
  assert.equal(submitted.references[1].image_uri, 'https://example.com/place.png');
  assert.ok(JSON.stringify(submitted).length < 2000);
  const receipt = JSON.parse(fs.readFileSync(path.join(dir, 'msr.mp4.astra-genai.json'), 'utf8'));
  const { genaiMsrSchema, buildGenaiMsrBody } = await import('../dist/astra-genai-video.js');
  const { createHash } = await import('node:crypto');
  // The receipt binds the request as written, not the per-upload file ids.
  assert.equal(receipt.fingerprint, createHash('sha256').update(JSON.stringify(buildGenaiMsrBody(genaiMsrSchema.parse(args)))).digest('hex'));
  const before = uploads.length;
  await assert.rejects(generateGenaiVideo('msr', args), /fixture/);
  assert.equal(uploads.length, before);
});

test('an MSR 400 for a lost genai-file id uploads again and resubmits once', async t => {
  const { forgetGenaiUploads } = await import('../dist/astra-genai-upload.js');
  forgetGenaiUploads();
  const dir = setup(t), source = path.join(dir, 'reference.png');
  fs.writeFileSync(source, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=', 'base64'));
  const args = { prompt: 'The person waves.', references: [{ imagePath: source }], reserveUsd: 0, outputPath: dir, filename: 'gone.mp4' };
  let creates = 0;
  const submissions = [];
  globalThis.fetch = async (url, options) => {
    const route = new URL(String(url)).pathname;
    if (route === '/v1/uploads') { creates++; return Response.json({ upload_id: `g${creates}`, chunk_size: 4 * 1024 * 1024, chunks: 1 }, { status: 201 }); }
    if (route.endsWith('/complete')) return Response.json({ file_id: route.split('/')[3], uri: `genai-file://${route.split('/')[3]}`, expires_at: '2099-01-01T00:00:00Z' });
    if (route.startsWith('/v1/uploads')) return new Response(null, { status: 204 });
    if (route === '/v1/ltx/msr') {
      submissions.push(JSON.parse(options.body).references[0].image_uri);
      if (submissions.length === 1) return Response.json({ error: { type: 'invalid_request_error', message: 'references.0.image_uri: genai-file not found or expired' } }, { status: 400 });
      return Response.json({ id: 'msr-gone' }, { status: 202 });
    }
    return Response.json({ id: 'msr-gone', status: 'failed', error: 'fixture' });
  };
  await assert.rejects(generateGenaiVideo('msr', args), /fixture/);
  assert.deepEqual(submissions, ['genai-file://g1', 'genai-file://g2']);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'gone.mp4.astra-genai.json'), 'utf8')).jobId, 'msr-gone');
});

test('a large voice sample with no upload API is refused before anything is submitted', async t => {
  const { forgetGenaiUploads } = await import('../dist/astra-genai-upload.js');
  forgetGenaiUploads();
  const dir = setup(t), source = path.join(dir, 'reference.png'), wav = path.join(dir, 'voice.wav');
  fs.writeFileSync(source, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=', 'base64'));
  // 6.5 MB of voice is about 8.7 MB as base64; voice cannot be shrunk.
  fs.writeFileSync(wav, Buffer.alloc(6_500_000, 1));
  const args = { prompt: 'The person says hello.', references: [{ imagePath: source, audioPath: wav }], reserveUsd: 0, outputPath: dir, filename: 'big.mp4' };
  const calls = [];
  globalThis.fetch = async (url, options) => {
    const route = new URL(String(url)).pathname;
    calls.push(`${options.method} ${route}`);
    if (route.endsWith('/capabilities')) return Response.json({ msr: true, voice_references: true });
    if (route === '/v1/uploads') return new Response('not found', { status: 404 });
    return assert.fail(`unexpected ${options.method} ${route}`);
  };
  await assert.rejects(generateGenaiVideo('msr', args), /msr_body_too_large: .*nothing was submitted\. Try again later/);
  assert.ok(!calls.includes('POST /v1/ltx/msr'));
  assert.ok(!fs.existsSync(path.join(dir, 'big.mp4.astra-genai.json')));
});

test('audio-to-video follows the gateway AudioVideo contract and its data URI limits', async t => {
  const { genaiAudioToVideoSchema, buildGenaiAudioBody, genaiAudioUri, GENAI_AUDIO_DATA_URI_MAX } = await import('../dist/astra-genai-video.js');
  const dir = setup(t), wav = path.join(dir, 'line.wav');
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=d=0.2', '-ac', '1', wav]);
  const api = JSON.parse(fs.readFileSync(new URL('./fixtures/astra-genai-openapi-20261020.json', import.meta.url)));
  assert.ok(api.paths['/v1/ltx/v2/audio-to-video/{job_id}'].get);
  const schema = api.components.schemas.AudioVideo;
  const audio = { prompt: 'A presenter speaks to camera.', model: 'ltx-2.5-22b-dev', resolution: '1280x720', reserveUsd: 0 };
  const body = buildGenaiAudioBody(genaiAudioToVideoSchema.parse({ ...audio, audioPath: wav, imageUri: 'https://example.com/a.png', lastFrameUri: 'https://example.com/b.png' }));
  assert.ok(schema.required.every(key => Object.hasOwn(body, key)));
  assert.ok(Object.keys(body).every(key => Object.hasOwn(schema.properties, key)));
  assert.equal(body.audio_uri, `data:audio/wav;base64,${fs.readFileSync(wav).toString('base64')}`);
  assert.equal(body.fps, 24); assert.equal(body.last_frame_uri, 'https://example.com/b.png');
  for (const extra of [{}, { audioPath: wav, audioUri: 'https://example.com/a.wav' }, { audioPath: wav, model: 'ltx-2.5-22b-distilled' },
    { audioPath: wav, prompt: '  ' }, { audioPath: wav, duration: 6 }, { audioPath: wav, generateAudio: true }, { audioPath: wav, cameraMotion: 'static' },
    { audioPath: wav, lastFrameUri: 'https://example.com/b.png' }, { audioPath: wav, fps: 30 }])
    assert.equal(genaiAudioToVideoSchema.safeParse({ ...audio, ...extra }).success, false, JSON.stringify(Object.keys(extra)));
  assert.equal(GENAI_AUDIO_DATA_URI_MAX, 15_000_000);
  assert.ok(genaiAudioUri('data:audio/ogg;base64,' + 'A'.repeat(15_000_000)));
  assert.throws(() => genaiAudioUri('data:audio/ogg;base64,' + 'A'.repeat(15_000_004)), /15,000,000/);
  assert.throws(() => genaiAudioUri('data:audio/x-wav;base64,AAAA'), /audio\/wav/);
  assert.throws(() => genaiAudioUri(undefined, path.join(dir, 'line.flac')), /\.wav/);
});

test('MSR voice samples are optional, ride on subjects 1-2, and the capability check fails closed', async t => {
  const { genaiMsrSchema, buildGenaiMsrBody, refreshGenaiMsrVoice, genaiMsrVoiceReferences } = await import('../dist/astra-genai-video.js');
  const dir = setup(t), wav = path.join(dir, 'voice.wav');
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=d=0.2', '-ac', '1', wav]);
  const ref = { imageUri: 'https://example.com/person.png' }, msr = references => ({ prompt: 'x', reserveUsd: 0, references });
  const body = buildGenaiMsrBody(genaiMsrSchema.parse(msr([ref, { ...ref, audioPath: wav }, { ...ref, background: true }])));
  assert.equal(body.references[0].audio_uri, undefined);
  assert.equal(genaiMsrSchema.safeParse(msr([ref])).success, true);
  assert.match(body.references[1].audio_uri, /^data:audio\/wav;base64,/);
  for (const references of [[ref, { ...ref, background: true, audioPath: wav }], [ref, ref, { ...ref, audioPath: wav }],
    [{ ...ref, audioPath: wav, audioUri: 'https://example.com/v.wav' }]])
    assert.equal(genaiMsrSchema.safeParse(msr(references)).success, false);
  globalThis.fetch = async url => {
    assert.ok(String(url).endsWith('/v1/ltx/msr/capabilities'));
    return Response.json({ msr: true, voice_references: true });
  };
  assert.equal(await refreshGenaiMsrVoice(true), true);
  assert.equal(genaiMsrVoiceReferences(), true);
  globalThis.fetch = async () => new Response('Not Found', { status: 404 }); // a gateway without the route
  assert.equal(await refreshGenaiMsrVoice(true), false);
  assert.equal(genaiMsrVoiceReferences(), false);
  // Without voice support MSR is refused before anything is submitted.
  await assert.rejects(generateGenaiVideo('msr', { ...msr([{ ...ref, audioPath: wav }]), outputPath: dir, filename: 'novoice.mp4' }), /msr_voice_unsupported/);
  assert.equal(fs.existsSync(path.join(dir, 'novoice.mp4.astra-genai.json')), false);
});
