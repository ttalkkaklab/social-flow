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

test('MSR recovery uses the MSR route and never submits twice', async t => {
  const dir = setup(t), source = path.join(dir, 'reference.png');
  fs.writeFileSync(source, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=', 'base64'));
  const args = { prompt: 'The person says hello.', references: [{ imagePath: source, audioUri: 'https://example.com/voice.wav' }], reserveUsd: 0, outputPath: dir, filename: 'msr.mp4' };
  let posts = 0;
  globalThis.fetch = async (url, options) => {
    if (String(url).endsWith('/capabilities')) return Response.json({ msr: true, voice_references: true });
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

test('audio-to-video submits and recovers on its own route, keeping the soundtrack switchless', async t => {
  const dir = setup(t), wav = path.join(dir, 'line.wav');
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=d=0.2', wav]);
  const routes = [];
  globalThis.fetch = async (url, options) => {
    routes.push(`${options.method} ${new URL(url).pathname}`);
    if (options.method === 'POST') return Response.json({ id: 'a2v-1' }, { status: 202 });
    return Response.json({ id: 'a2v-1', status: 'failed', error: { message: 'stub' } });
  };
  const args = { prompt: 'A presenter speaks.', model: 'ltx-2.5-22b-dev', resolution: '1280x720', reserveUsd: 0, audioPath: wav, outputPath: dir, filename: 'a2v.mp4' };
  await assert.rejects(generateGenaiVideo('audio-to-video', args), /a2v-1 failed/);
  assert.deepEqual(routes, ['POST /v1/ltx/v2/audio-to-video', 'GET /v1/ltx/v2/audio-to-video/a2v-1']);
  assert.equal(parseVideoArgs('astra_genai_audio2video', args).audioPath, wav);
  const { videoVoiceCapabilities } = await import('../dist/video-registry.js');
  assert.equal(videoVoiceCapabilities('astra_genai_audio2video').suppliedSpeech, 'audio_conditioned_reencoded');
  const { prepareVideoSound } = await import('../dist/video-sound.js');
  const prepared = prepareVideoSound('astra_genai_audio2video', args, { audioSource: 'video' });
  assert.equal(prepared.arguments.generateAudio, undefined); assert.equal(prepared.capabilities.inputAudio, 'preserved');
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
