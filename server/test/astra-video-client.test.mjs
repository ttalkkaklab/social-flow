/**
 * ASTRA video client — body construction, per-mode field rules, and the validators.
 *
 * No real call is made here. What this file locks is the layer between the tool arguments
 * and the wire: the six per-mode allow-lists (measured from the server's own 400s, see the
 * PR body), the 8k+1 frame grid, the 64/32 pixel grids, the keyframe index range, and the
 * fields each mode refuses. Those are exactly the rules that, when wrong, cost a queue slot
 * on a box that renders one job at a time.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { config } from '../dist/config.js';
import { ROUTES } from '../dist/handlers.js';
import { TOOLS } from '../dist/tools.js';

// The client really sleeps 5 s between polls and up to a minute for its rate limits.
// Run that clock forward instead of waiting it out; sub-second timers stay real.
const realNow = Date.now;
const realSetTimeout = globalThis.setTimeout;
let skippedMs = 0;
Date.now = () => realNow() + skippedMs;
globalThis.setTimeout = (fn, ms = 0, ...args) => {
  if (ms < 1_000) return realSetTimeout(fn, ms, ...args);
  skippedMs += ms;
  return realSetTimeout(fn, 0, ...args);
};

import {
  ASTRA_VIDEO_ALLOWED_FIELDS,
  ASTRA_VIDEO_FRAME_LIMITS,
  ASTRA_VIDEO_FRAME_STEP,
  ASTRA_VIDEO_MAX_AUTO_FRAMES,
  ASTRA_VIDEO_MIN_FRAMES,
  ASTRA_VIDEO_IC_LORA_ADAPTERS,
  ASTRA_VIDEO_LORAS,
  ASTRA_VIDEO_TIERS,
  ASTRA_VIDEO_USER_AGENT,
  astraAudio2VideoSchema,
  astraIcLoraSchema,
  astraImg2VideoSchema,
  astraKeyframeVideoSchema,
  astraText2VideoSchema,
  astraVideoRetakeSchema,
  buildJobBody,
  checkAudioCoversVideo,
  checkAudioSource,
  checkAutoDuration,
  checkDimensions,
  checkFrameIdx,
  checkMaskSource,
  checkReferenceSource,
  checkRetakeSource,
  framesForSeconds,
  icLoraMode,
  uploadContentType,
  upscaleGeometry,
} from '../dist/astra-video-client.js';

const parseFails = (schema, args) => {
  const result = schema.safeParse(args);
  assert.equal(result.success, false, `expected a refusal, got ${JSON.stringify(result.data)}`);
  return result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
};

const parseOk = (schema, args) => {
  const result = schema.safeParse(args);
  assert.equal(result.success, true, `expected acceptance, got ${result.error?.issues?.map((i) => i.message).join('; ')}`);
  return result.data;
};

describe('buildJobBody — wire shape', () => {
  it('text2video default tier produces a generate body with snake_case keys', () => {
    const body = buildJobBody('generate', {
      prompt: 'a slow dolly through a forest',
      numFrames: 121,
      seed: 42,
      lora: ['cinemagraph'],
    });
    assert.deepEqual(body, {
      mode: 'generate',
      prompt: 'a slow dolly through a forest',
      num_frames: 121,
      seed: 42,
      lora: ['cinemagraph'],
    });
  });

  it('HDR is opt-in, reaches the wire and refuses visual inputs', () => {
    assert.equal(buildJobBody('generate', { prompt: 'x' }).hdr, undefined);
    for (const tier of ['default', 'guided', 'fast', 'hq']) {
      const args = parseOk(astraText2VideoSchema, { prompt: 'x', tier, hdr: 'ACESCCT' });
      assert.equal(buildJobBody(ASTRA_VIDEO_TIERS[tier], args).hdr, 'ACESCCT');
    }
    parseFails(astraText2VideoSchema, { prompt: 'x', hdr: 'HDR10' });
    parseFails(astraAudio2VideoSchema, { prompt: 'x', audioUploadId: 'a', imagePath: 'a.png', hdr: 'ACESCG' });
    parseOk(astraAudio2VideoSchema, { prompt: 'x', audioUploadId: 'a', hdr: 'ACESCG' });
    assert.throws(() => buildJobBody('generate', { prompt: 'x', hdr: 'ACESCG', images: [{ uploadId: 'a', frameIdx: 0 }] }), /visual inputs/);
  });

  it('autoDuration becomes auto_duration and refuses conflicting explicit frames', () => {
    const auto = buildJobBody('generate', { prompt: 'x', autoDuration: { minSeconds: 1, maxSeconds: 4 } });
    assert.deepEqual(auto.auto_duration, { min_seconds: 1, max_seconds: 4 });
    assert.throws(() => buildJobBody('generate', {
      prompt: 'x', numFrames: 121, autoDuration: { minSeconds: 1, maxSeconds: 4 },
    }), /mutually exclusive/);
  });

  it('images carry upload_id/frame_idx and optional strength/crf only when set', () => {
    const body = buildJobBody('keyframe', {
      prompt: 'x',
      images: [
        { uploadId: 'a'.repeat(32), frameIdx: 0, strength: 1 },
        { uploadId: 'b'.repeat(32), frameIdx: 120, strength: 0.8, crf: 18 },
      ],
    });
    assert.deepEqual(body.images, [
      { upload_id: 'a'.repeat(32), frame_idx: 0, strength: 1 },
      { upload_id: 'b'.repeat(32), frame_idx: 120, strength: 0.8, crf: 18 },
    ]);
  });

  it('retake carries the span and nothing about size or length', () => {
    const body = buildJobBody('retake', {
      prompt: 'x',
      videoUploadId: 'd'.repeat(32),
      startTime: 1,
      endTime: 3,
      seed: 42,
    });
    assert.deepEqual(Object.keys(body).sort(), ['end_time', 'mode', 'prompt', 'seed', 'start_time', 'video_upload_id']);
  });

  it('refuses a field the mode does not own, before the call', () => {
    assert.throws(
      () => buildJobBody('keyframe', { prompt: 'x', autoDuration: { minSeconds: 1, maxSeconds: 4 } }),
      /mode keyframe does not accept auto_duration/,
    );
    assert.throws(
      () => buildJobBody('generate', { prompt: 'x', negativePrompt: 'blurry' }),
      /mode generate does not accept negative_prompt/,
    );
    assert.throws(
      () => buildJobBody('guided', { prompt: 'x', lora: ['cinemagraph'] }),
      /mode guided does not accept lora/,
    );
    assert.throws(
      () => buildJobBody('retake', { prompt: 'x', videoUploadId: 'e'.repeat(32), startTime: 0, endTime: 1, numFrames: 121 }),
      /mode retake does not accept num_frames/,
    );
  });

  it('an unknown mode is a programming error, not a silent pass-through', () => {
    assert.throws(() => buildJobBody('turbo', { prompt: 'x' }), /Unknown ASTRA video mode/);
  });
});

describe('validators', () => {
  it('generate frame counts are 8k+1 within 25..361', () => {
    for (const good of [25, 33, 121, 193, 361]) {
      parseOk(astraText2VideoSchema, { prompt: 'x', numFrames: good });
    }
    for (const bad of [9, 24, 120, 194, 362, 369, 481, 489]) {
      parseFails(astraText2VideoSchema, { prompt: 'x', numFrames: bad });
    }
  });

  it('dimensions sit on a 64 grid, or 32 within 32..1920 on guided_fast', () => {
    assert.equal(checkDimensions(1536, 1024, 'generate'), null);
    assert.match(checkDimensions(1500, 1024, 'generate'), /multiple of 64/);
    assert.equal(checkDimensions(768, 512, 'guided_fast'), null);
    assert.match(checkDimensions(63, 512, 'guided_fast'), /multiple of 32/);
    assert.match(checkDimensions(1952, 32, 'guided_fast'), /between 32 and 1920/);
  });

  it('frameIdx is 0..numFrames-1 — 121 frames means 120 is the last', () => {
    assert.equal(checkFrameIdx(0, 121), null);
    assert.equal(checkFrameIdx(120, 121), null);
    assert.match(checkFrameIdx(121, 121), /between 0 and 120/);
    assert.match(checkFrameIdx(-1, 121), /between 0 and 120/);
    // no numFrames given → the server's own default of 121 is assumed
    assert.match(checkFrameIdx(121, undefined), /between 0 and 120/);
  });

  it('autoDuration enforces the final 121-frame grid examples', () => {
    assert.equal(checkAutoDuration({ minSeconds: 1, maxSeconds: 5 }, 24), null);
    assert.match(checkAutoDuration({ minSeconds: 1, maxSeconds: 1 }, 24), /contain an 8k\+1 frame count/);
    assert.match(checkAutoDuration({ minSeconds: 1, maxSeconds: 20 }, 24), /121 frames or earlier/);
    assert.equal(checkAutoDuration({ minSeconds: 1, maxSeconds: 2.02 }, 60), null);
    assert.match(checkAutoDuration({ minSeconds: 1, maxSeconds: 2.03 }, 60), /121 frames or earlier/);

    parseOk(astraText2VideoSchema, { prompt: 'x', autoDuration: { minSeconds: 1, maxSeconds: 5 } });
    parseFails(astraText2VideoSchema, { prompt: 'x', autoDuration: { minSeconds: 1, maxSeconds: 1 } });
    parseFails(astraText2VideoSchema, { prompt: 'x', autoDuration: { minSeconds: 1, maxSeconds: 20 } });
    parseOk(astraText2VideoSchema, { prompt: 'x', frameRate: 60, autoDuration: { minSeconds: 1, maxSeconds: 2.02 } });
    parseFails(astraText2VideoSchema, { prompt: 'x', frameRate: 60, autoDuration: { minSeconds: 1, maxSeconds: 2.03 } });
    // The plugin rejects ambiguous selectors even when explicit frames would take precedence upstream.
    parseFails(astraText2VideoSchema, { prompt: 'x', numFrames: 121, autoDuration: { minSeconds: 1, maxSeconds: 20 } });
  });

  it('upload content types come from the extension, and nothing else is accepted', () => {
    assert.deepEqual(uploadContentType('/tmp/a.png'), { contentType: 'image/png', kind: 'image' });
    assert.deepEqual(uploadContentType('/tmp/a.JPG'), { contentType: 'image/jpeg', kind: 'image' });
    assert.deepEqual(uploadContentType('/tmp/a.mp4'), { contentType: 'video/mp4', kind: 'video' });
    assert.deepEqual(uploadContentType('/tmp/a.wav'), { contentType: 'audio/wav', kind: 'audio' });
    assert.deepEqual(uploadContentType('/tmp/a.mp3'), { contentType: 'audio/mpeg', kind: 'audio' });
    assert.throws(() => uploadContentType('/tmp/a.webm'), /not one of them/);
  });
});

describe('tier-bound arguments are refused at the schema, not at the server', () => {
  it('lora only on tier default', () => {
    parseOk(astraText2VideoSchema, { prompt: 'x', lora: ['slow-motion'] });
    assert.match(parseFails(astraText2VideoSchema, { prompt: 'x', tier: 'guided', lora: ['slow-motion'] }), /lora is accepted only on tier "default"/);
    assert.match(parseFails(astraText2VideoSchema, { prompt: 'x', tier: 'fast', lora: ['cinemagraph'] }), /lora is accepted only on tier "default"/);
  });

  it('negativePrompt and numInferenceSteps never on tier default', () => {
    parseOk(astraText2VideoSchema, { prompt: 'x', tier: 'guided', negativePrompt: 'blurry', numInferenceSteps: 30 });
    assert.match(parseFails(astraText2VideoSchema, { prompt: 'x', negativePrompt: 'blurry' }), /only on tier "guided", "fast" or "hq"/);
    assert.match(parseFails(astraText2VideoSchema, { prompt: 'x', numInferenceSteps: 30 }), /only on tier "guided", "fast" or "hq"/);
  });

  it('lora values are the two the server loads, and at most two of them', () => {
    assert.deepEqual([...ASTRA_VIDEO_LORAS], ['cinemagraph', 'slow-motion']);
    parseFails(astraText2VideoSchema, { prompt: 'x', lora: ['deblur'] });
    parseFails(astraText2VideoSchema, { prompt: 'x', lora: ['/etc/passwd'] });
    parseFails(astraText2VideoSchema, { prompt: 'x', lora: ['cinemagraph', 'slow-motion', 'cinemagraph'] });
    assert.match(
      parseFails(astraText2VideoSchema, { prompt: 'x', lora: ['slow-motion', 'slow-motion'] }),
      /lora names must be unique/,
    );
  });

  it('guided_fast validates its own 32 grid through the tier', () => {
    parseOk(astraText2VideoSchema, { prompt: 'x', tier: 'fast', width: 768, height: 512 });
    assert.match(parseFails(astraText2VideoSchema, { prompt: 'x', tier: 'fast', width: 800, height: 500 }), /multiple of 32/);
    // 800 IS on the 32 grid but not on the 64 one, so the same width the fast tier takes
    // is refused on the default tier — that asymmetry is the whole point of the tier check.
    parseOk(astraText2VideoSchema, { prompt: 'x', tier: 'fast', width: 800, height: 512 });
    assert.match(parseFails(astraText2VideoSchema, { prompt: 'x', width: 800, height: 512 }), /multiple of 64/);
  });
});

describe('per-tool schemas', () => {
  it('img2video wants a first frame and accepts at most a last one', () => {
    parseOk(astraImg2VideoSchema, { prompt: 'x', firstFramePath: '/tmp/a.png' });
    parseOk(astraImg2VideoSchema, { prompt: 'x', firstFramePath: '/tmp/a.png', lastFramePath: '/tmp/b.png', strength: 0.9 });
    parseFails(astraImg2VideoSchema, { prompt: 'x' });
    parseFails(astraImg2VideoSchema, { prompt: 'x', firstFramePath: '/tmp/a.png', strength: 1.4 });
  });

  it('img2video autoDuration needs the 8k+1 grid and refuses a pinned last still', () => {
    const first = { prompt: 'x', firstFramePath: '/tmp/a.png' };
    parseOk(astraImg2VideoSchema, { ...first, autoDuration: { minSeconds: 2, maxSeconds: 5 } });
    parseOk(astraImg2VideoSchema, { ...first, tier: 'guided', autoDuration: { minSeconds: 2, maxSeconds: 5 } });
    assert.match(parseFails(astraImg2VideoSchema, { ...first, autoDuration: { minSeconds: 2, maxSeconds: 6 } }), /121 frames or earlier/);
    assert.match(parseFails(astraImg2VideoSchema, { ...first, autoDuration: { minSeconds: 1.1, maxSeconds: 1.3 } }), /8k\+1/);
    assert.match(
      parseFails(astraImg2VideoSchema, { ...first, lastFramePath: '/tmp/b.png', autoDuration: { minSeconds: 2, maxSeconds: 5 } }),
      /cannot be combined with lastFramePath/,
    );
    // An explicit frame count must not silently discard a requested automatic range.
    parseFails(astraImg2VideoSchema, { ...first, lastFramePath: '/tmp/b.png', numFrames: 97, autoDuration: { minSeconds: 2, maxSeconds: 5 } });
  });

  it('keyframe takes 2..8 images and checks each index against the clip', () => {
    const two = [
      { imagePath: '/tmp/a.png', frameIdx: 0 },
      { imagePath: '/tmp/b.png', frameIdx: 120 },
    ];
    parseOk(astraKeyframeVideoSchema, { prompt: 'x', images: two, numFrames: 121 });
    parseFails(astraKeyframeVideoSchema, { prompt: 'x', images: [two[0]] });
    parseFails(astraKeyframeVideoSchema, { prompt: 'x', images: Array.from({ length: 9 }, () => two[0]) });
    assert.match(
      parseFails(astraKeyframeVideoSchema, {
        prompt: 'x',
        numFrames: 121,
        images: [two[0], { imagePath: '/tmp/b.png', frameIdx: 121 }],
      }),
      /images\.1\.frameIdx: frameIdx must be between 0 and 120/,
    );
  });

  it('audio upload metadata rejects starts at the end and more than 361 selected frames', () => {
    const audio = { uploadId: 'a'.repeat(32), bytes: 1, kind: 'audio', duration: 30 };
    assert.equal(checkAudioSource(audio, { audioStartTime: 0, audioMaxDuration: 8.1, frameRate: 24 }), null);
    assert.match(
      checkAudioSource(audio, { audioStartTime: 0, audioMaxDuration: 15.4, frameRate: 24 }),
      /selects 369 frames.*maximum is 361/,
    );
    assert.match(checkAudioSource(audio, { audioStartTime: 30, numFrames: 121 }), /must be less than the source duration/);
  });

  it('retake wants an ordered span and has no size arguments at all', () => {
    parseOk(astraVideoRetakeSchema, { prompt: 'x', sourceVideoPath: '/tmp/a.mp4', startTime: 1, endTime: 3 });
    assert.match(
      parseFails(astraVideoRetakeSchema, { prompt: 'x', sourceVideoPath: '/tmp/a.mp4', startTime: 3, endTime: 1 }),
      /endTime must be greater than startTime/,
    );
    const shape = Object.keys(astraVideoRetakeSchema._def.schema.shape);
    for (const absent of ['width', 'height', 'numFrames', 'frameRate']) {
      assert.ok(!shape.includes(absent), `retake must not expose ${absent}`);
    }
  });

  it('retake upload metadata enforces 8k+1 frames, the 32 grid and source duration', () => {
    const source = {
      uploadId: 'b'.repeat(32),
      bytes: 1,
      kind: 'video',
      width: 1536,
      height: 1024,
      frames: 121,
      fps: 24,
    };
    assert.equal(checkRetakeSource(source, 1, 3), null);
    assert.match(checkRetakeSource({ ...source, frames: 120 }, 1, 3), /frames must be 8k\+1/);
    assert.match(checkRetakeSource({ ...source, width: 1530 }, 1, 3), /width must be a positive multiple of 32/);
    assert.match(checkRetakeSource(source, 1, 5.05), /endTime must be at most the source duration/);
  });

  it('a prompt is required everywhere and capped at 2000 characters', () => {
    const long = 'a'.repeat(2001);
    parseFails(astraText2VideoSchema, { prompt: '' });
    parseFails(astraText2VideoSchema, { prompt: long });
    parseFails(astraVideoRetakeSchema, { prompt: long, sourceVideoPath: '/tmp/a.mp4', startTime: 0, endTime: 1 });
  });
});


describe('measured ASTRA guidance', () => {

  it('checks the pixel ceiling with server defaults for every omitted-side shape', () => {
    for (const mode of ['generate', 'guided', 'keyframe', 'audio2video']) {
      assert.equal(checkDimensions(undefined, undefined, mode), null, mode);
      assert.equal(checkDimensions(1920, undefined, mode), null, mode);
      assert.equal(checkDimensions(undefined, 1344, mode), null, mode);
      assert.match(checkDimensions(2048, undefined, mode), /between 64 and 1920/, mode);
      assert.match(checkDimensions(undefined, 1408, mode), /at most 2064384/, mode);
      assert.match(checkDimensions(undefined, 1920, mode), /at most 2064384/, mode);
    }
    // Fast mode uses 768x512 defaults; its per-side cap keeps single-sided inputs below the ceiling.
    for (const dims of [[undefined, undefined], [1920, undefined], [undefined, 1920], [1344, 1536]]) {
      assert.equal(checkDimensions(...dims, 'guided_fast'), null);
    }
    assert.match(checkDimensions(1920, 1920, 'guided_fast'), /at most 2064384/);
    for (const [schema, args] of [
      [astraText2VideoSchema, { prompt: 'x' }],
      [astraText2VideoSchema, { prompt: 'x', tier: 'guided' }],
      [astraImg2VideoSchema, { prompt: 'x', firstFramePath: 'a.png' }],
      [astraKeyframeVideoSchema, { prompt: 'x', images: [{ imagePath: 'a.png', frameIdx: 0 }, { imagePath: 'b.png', frameIdx: 24 }] }],
      [astraAudio2VideoSchema, { prompt: 'x', audioPath: 'voice.wav' }],
    ]) {
      for (const dims of [{}, { width: 1920 }, { height: 1344 }, { width: 1344, height: 1536 }]) {
        parseOk(schema, { ...args, ...dims });
      }
      for (const dims of [{ width: 2048 }, { height: 1920 }, { width: 1088, height: 1920 }]) {
        assert.match(parseFails(schema, { ...args, ...dims }), /at most 2064384|between 64 and 1920/);
      }
    }
  });
});

describe('mode-specific ceilings and new input contracts', () => {
  it("frame ceilings, minimum, step and the auto-duration cap equal the server's published /v1/models limits", () => {
    const models = JSON.parse(fs.readFileSync(new URL('./fixtures/astra-v1-models.json', import.meta.url), 'utf8'));
    const published = models.data[0].modes.filter((m) => m.num_frames);
    assert.deepEqual(Object.keys(ASTRA_VIDEO_FRAME_LIMITS).sort(), published.map((m) => m.mode).sort());
    for (const m of published) {
      assert.equal(ASTRA_VIDEO_FRAME_LIMITS[m.mode], m.num_frames.max, `${m.mode} max`);
      assert.equal(ASTRA_VIDEO_MIN_FRAMES, m.num_frames.min, `${m.mode} min`);
      assert.equal(ASTRA_VIDEO_FRAME_STEP, m.num_frames.step, `${m.mode} step`);
      if (m.auto_duration?.supported) assert.equal(ASTRA_VIDEO_MAX_AUTO_FRAMES, m.auto_duration.max_frames, `${m.mode} auto`);
    }
  });

  it('every text and image tier accepts its ceiling and refuses the next grid value', () => {
    for (const [tier, max] of [['default', 361], ['guided', 361], ['fast', 361], ['hq', 361]]) {
      parseOk(astraText2VideoSchema, { prompt: 'x', tier, numFrames: max });
      parseFails(astraText2VideoSchema, { prompt: 'x', tier, numFrames: max + 8 });
    }
    for (const [tier, max] of [['default', 361], ['guided', 361], ['hq', 361]]) {
      parseOk(astraImg2VideoSchema, { prompt: 'x', firstFramePath: 'a.png', tier, numFrames: max });
      parseFails(astraImg2VideoSchema, { prompt: 'x', firstFramePath: 'a.png', tier, numFrames: max + 8 });
    }
  });

  for (const [mode, schema, args] of [
    ['keyframe', astraKeyframeVideoSchema, { prompt: 'x', images: [{ imagePath: 'a.png', frameIdx: 0 }, { imagePath: 'b.png', frameIdx: 192 }] }],
    ['audio2video', astraAudio2VideoSchema, { prompt: 'x', audioUploadId: 'reuse' }],
  ]) {
    it(`${mode} accepts 361 frames at the server ceiling`, () => {
      parseOk(schema, { ...args, numFrames: 361 });
    });
    it(`${mode} refuses 369 frames above the server ceiling`, () => {
      assert.match(parseFails(schema, { ...args, numFrames: 369 }), /361/);
      for (const numFrames of [24, 192, 481, 489]) parseFails(schema, { ...args, numFrames });
    });
  }

  it('audio takes exactly one nonblank source and an optional nonblank portrait', () => {
    for (const source of [{ audioPath: 'a.wav' }, { audioUploadId: 'reuse' }]) {
      parseOk(astraAudio2VideoSchema, { prompt: 'x', ...source });
      parseOk(astraAudio2VideoSchema, { prompt: 'x', ...source, imagePath: 'face.png' });
      parseFails(astraAudio2VideoSchema, { prompt: 'x', ...source, imagePath: '' });
      parseFails(astraAudio2VideoSchema, { prompt: 'x', ...source, numFrames: 121, audioMaxDuration: 5 });
    }
    for (const source of [{}, { audioPath: 'a.wav', audioUploadId: 'reuse' }, { audioPath: '' }, { audioUploadId: ' ' }]) parseFails(astraAudio2VideoSchema, { prompt: 'x', ...source });
  });
});

// All network requests are intercepted. Unexpected routes fail; no LTX calls are made.
describe('mocked tool calls', () => {
  async function withServer(fn) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-contract-'));
    const oldKey = config.astraVideoApiKey;
    const oldFetch = globalThis.fetch;
    config.astraVideoApiKey = 'test-only-key';
    const uploads = [], jobs = [];
    let duration = 30, rejectJob = false, onStatus = null;
    globalThis.fetch = async (url, init = {}) => {
      const pathname = new URL(url).pathname;
      if (pathname === '/v1/uploads') {
        const kind = init.headers['Content-Type'].startsWith('image/') ? 'image' : 'audio';
        uploads.push(kind);
        return Response.json({ upload_id: `${kind}-id`, kind, bytes: 4, duration, expires_at: '2026-10-01T04:00:00Z' }, { status: 201 });
      }
      if (pathname === '/v1/jobs') {
        jobs.push(JSON.parse(init.body));
        if (rejectJob) return new Response('expired audio upload', { status: 400 });
        return Response.json({ job_id: 'test-job' }, { status: 202 });
      }
      if (pathname === '/v1/jobs/test-job') {
        const override = onStatus?.();
        return override || Response.json({ status: 'succeeded', request: jobs.at(-1) });
      }
      if (pathname === '/v1/jobs/test-job/result') return new Response('mock-mp4');
      throw new Error(`Unexpected mocked route ${pathname}`);
    };
    fs.writeFileSync(path.join(dir, 'a.wav'), 'wave');
    fs.writeFileSync(path.join(dir, 'face.png'), 'png');
    try { await fn({ dir, uploads, jobs, setDuration: value => { duration = value; }, rejectJob: () => { rejectJob = true; }, onStatus: fn => { onStatus = fn; } }); }
    finally { globalThis.fetch = oldFetch; config.astraVideoApiKey = oldKey; fs.rmSync(dir, { recursive: true, force: true }); }
  }

  it('uploads audio and portrait, pins frame zero and reports reusable metadata', async () => {
    await withServer(async ({ dir, uploads, jobs }) => {
      const result = await ROUTES.astra_audio2video({ prompt: 'x', audioPath: path.join(dir, 'a.wav'), imagePath: path.join(dir, 'face.png'), outputPath: dir });
      assert.deepEqual(uploads, ['audio', 'image']);
      assert.equal(jobs[0].audio_upload_id, 'audio-id');
      assert.deepEqual(jobs[0].images, [{ upload_id: 'image-id', frame_idx: 0, strength: 0.9 }]);
      assert.match(result.content[0].text, /audioUploadId: audio-id/);
      assert.match(result.content[0].text, /Audio expires at: 2026-10-01T04:00:00Z/);
      assert.match(result.content[0].text, /Audio duration \(seconds\): 30/);
      assert.equal(jobs.length, 1, 'the speech sync check and its reseed are opt-in');
      assert.doesNotMatch(result.content[0].text, /Speech sync check/);
    });
  });

  it('persists the accepted job before polling and the complete response beside the video', async () => {
    await withServer(async ({ dir, onStatus }) => {
      const receipt = path.join(dir, 'recover.mp4.astra-job.json');
      let observedPending = false;
      onStatus(() => {
        const saved = JSON.parse(fs.readFileSync(receipt, 'utf8'));
        assert.equal(saved.status, 'submitted');
        assert.equal(saved.jobId, 'test-job');
        assert.equal(saved.submittedRequest.prompt, 'receipt test');
        observedPending = true;
      });
      await ROUTES.astra_text2video({ prompt: 'receipt test', outputPath: dir, filename: 'recover.mp4' });
      assert.equal(observedPending, true);
      const saved = JSON.parse(fs.readFileSync(receipt, 'utf8'));
      assert.equal(saved.status, 'completed');
      assert.equal(saved.request.prompt, 'receipt test');
      assert.equal(saved.bytes, fs.statSync(saved.videoPath).size);
      assert.ok(saved.completedAt);
      assert.ok(!fs.readFileSync(receipt, 'utf8').includes('test-only-key'));
    });
  });

  it('retains the accepted job identity when status retrieval fails', async () => {
    await withServer(async ({ dir, onStatus }) => {
      onStatus(() => new Response('access denied', { status: 401 }));
      await assert.rejects(ROUTES.astra_text2video({ prompt: 'pending test', outputPath: dir, filename: 'pending.mp4' }), /401/);
      const saved = JSON.parse(fs.readFileSync(path.join(dir, 'pending.mp4.astra-job.json'), 'utf8'));
      assert.equal(saved.status, 'submitted');
      assert.equal(saved.jobId, 'test-job');
      assert.equal(fs.existsSync(saved.videoPath), false);
    });
  });

  it('forwards explicit portrait strength including zero instead of the default', async () => {
    await withServer(async ({ dir, jobs }) => {
      for (const strength of [0, 0.7, 1]) {
        await ROUTES.astra_audio2video({ prompt: 'x', audioUploadId: 'reuse', imagePath: path.join(dir, 'face.png'), strength, outputPath: dir });
        assert.deepEqual(jobs.at(-1).images, [{ upload_id: 'image-id', frame_idx: 0, strength }]);
        assert.equal(jobs.at(-1).strength, undefined);
      }
      for (const strength of [-0.1, 1.1]) {
        await assert.rejects(ROUTES.astra_audio2video({ prompt: 'x', audioUploadId: 'reuse', strength, outputPath: dir }));
      }
      assert.equal(jobs.length, 3);
    });
  });

  it('reuses an id without uploading or source-duration validation', async () => {
    await withServer(async ({ dir, uploads, jobs }) => {
      const result = await ROUTES.astra_audio2video({ prompt: 'x', audioUploadId: 'reuse', audioStartTime: 999, audioMaxDuration: 99, outputPath: dir });
      assert.deepEqual(uploads, []);
      assert.equal(jobs[0].audio_upload_id, 'reuse');
      assert.equal(jobs[0].audio_start_time, 999);
      assert.equal(jobs[0].images, undefined);
      assert.match(result.content[0].text, /audioUploadId: reuse/);
      assert.match(result.content[0].text, /Audio expires at: unknown/);
      assert.match(result.content[0].text, /Audio duration \(seconds\): unknown/);
    });
  });

  it('rejects invalid input and fresh audio duration before job submission', async () => {
    await withServer(async ({ dir, uploads, jobs, setDuration }) => {
      await assert.rejects(ROUTES.astra_audio2video({ prompt: 'x', audioPath: 'a.wav', audioUploadId: 'reuse' }), /exactly one/);
      await assert.rejects(ROUTES.astra_audio2video({ prompt: 'x', audioUploadId: 'reuse', imagePath: 'not-image.wav' }), /must be an image/);
      await assert.rejects(ROUTES.astra_img2video({ prompt: 'x', firstFramePath: 'face.png', tier: 'guided', width: 1080, height: 1920 }), /multiple of 64/);
      assert.deepEqual(uploads, []);
      setDuration(1);
      await assert.rejects(ROUTES.astra_audio2video({ prompt: 'x', audioPath: path.join(dir, 'a.wav'), audioStartTime: 1 }), /source duration/);
      assert.deepEqual(jobs, []);
    });
  });

  it('guided image calls send the tier and explicit measured default dimensions', async () => {
    await withServer(async ({ dir, jobs }) => {
      await ROUTES.astra_img2video({ prompt: 'x', tier: 'guided', firstFramePath: path.join(dir, 'face.png'), lastFramePath: path.join(dir, 'face.png'), numFrames: 121, outputPath: dir });
      assert.equal(jobs[0].mode, 'guided');
      assert.equal(jobs[0].width, 1536);
      assert.equal(jobs[0].height, 1024);
      assert.equal(jobs[0].images[1].frame_idx, 120);
    });
  });

  it('HQ image requests preserve authored portrait dimensions and controls on the wire', async () => {
    await withServer(async ({ dir, jobs }) => {
      await ROUTES.astra_img2video({ prompt: 'x', tier: 'hq', width: 1024, height: 1920,
        firstFramePath: path.join(dir, 'face.png'), guidance: { videoCfgGuidanceScale: 4 },
        generateAudio: false, duration: 2, outputPath: dir });
      assert.equal(jobs[0].mode, 'guided_hq');
      assert.equal(jobs[0].width, 1024);
      assert.equal(jobs[0].height, 1920);
      assert.equal(jobs[0].num_frames, 49);
      assert.equal(jobs[0].generate_audio, false);
      assert.deepEqual(jobs[0].guidance, { video_cfg_guidance_scale: 4 });
    });
  });

  it('audio omission is normalized explicitly while explicit audio spans stay delegated', () => {
    const args = { prompt: 'x', audioUploadId: 'a' };
    assert.equal(buildJobBody('audio2video', parseOk(astraAudio2VideoSchema, args)).num_frames, 121);
    assert.equal(parseOk(astraAudio2VideoSchema, { ...args, audioMaxDuration: 3 }).numFrames, undefined);
    assert.equal(parseOk(astraAudio2VideoSchema, { ...args, duration: 3 }).numFrames, 73);
  });

  it('image calls send auto_duration from a first still, and refuse the wrong tier before any upload', async () => {
    await withServer(async ({ dir, uploads, jobs }) => {
      await assert.rejects(ROUTES.astra_img2video({ prompt: 'x', firstFramePath: path.join(dir, 'face.png'), negativePrompt: 'subtitles' }), /only on tier "guided"/);
      assert.deepEqual(uploads, []);
      await ROUTES.astra_img2video({ prompt: 'x', firstFramePath: path.join(dir, 'face.png'), autoDuration: { minSeconds: 2, maxSeconds: 5 }, outputPath: dir });
      assert.deepEqual(jobs[0].auto_duration, { min_seconds: 2, max_seconds: 5 });
      assert.equal(jobs[0].num_frames, undefined);
      assert.deepEqual(jobs[0].images.map(i => i.frame_idx), [0]);
    });
  });
});

// Fixtures only, not live-server evidence. Assertions run in-process, so node:test
// owns failures directly; no child process or output-only pass criterion is used.
describe('ASTRA upload management', () => {
  const upload_id = 'a'.repeat(32);
  const item = { upload_id, kind: 'audio', bytes: 42, expires_at: '2026-10-04T19:00:00Z' };
  const content = result => result.content.map(x => x.text ?? '').join('\n');
  async function withReply(status, body, run) {
    const savedFetch = globalThis.fetch;
    const savedKey = config.astraVideoApiKey;
    const calls = [];
    config.astraVideoApiKey = 'test-upload-key-do-not-expose';
    globalThis.fetch = async (url, init) => {
      calls.push({ url, ...init });
      return new Response(status === 204 ? null : body, { status });
    };
    try { await run(calls); }
    finally { globalThis.fetch = savedFetch; config.astraVideoApiKey = savedKey; }
  }
  const routes = [['astra_video_list_uploads', {}], ['astra_video_delete_upload', { uploadId: upload_id }]];

  it('registers both tools, routes, annotations and capability names', async () => {
    const { capabilityStatus } = await import('../dist/capability-status.js');
    for (const [name] of routes) {
      assert.equal(TOOLS.filter(t => t.name === name).length, 1);
      assert.equal(typeof ROUTES[name], 'function');
      assert.ok(JSON.stringify(capabilityStatus()).includes(name));
    }
    assert.equal(TOOLS.find(t => t.name === routes[0][0]).annotations.readOnlyHint, true);
    assert.equal(TOOLS.find(t => t.name === routes[1][0]).annotations.destructiveHint, true);
  });

  for (const uploads of [[item], []]) it(`lists ${uploads.length} uploads with GET and auth headers`, async () => {
    await withReply(200, JSON.stringify({ uploads }), async calls => {
      const result = await ROUTES.astra_video_list_uploads({});
      assert.notEqual(result.isError, true);
      assert.deepEqual(JSON.parse(content(result)), { uploads });
      assert.equal(calls.length, 1);
      assert.ok(calls[0].url.endsWith('/v1/uploads'));
      assert.equal(calls[0].method, 'GET');
      assert.equal(calls[0].headers.Authorization, 'Bearer test-upload-key-do-not-expose');
      assert.equal(calls[0].headers['User-Agent'], ASTRA_VIDEO_USER_AGENT);
      assert.equal(calls[0].body, undefined);
    });
  });

  it('rejects deleted false for the requested upload id', async () => {
    await withReply(200, JSON.stringify({ upload_id, deleted: false }), async () => {
      const result = await ROUTES.astra_video_delete_upload({ uploadId: upload_id });
      assert.equal(result.isError, true);
      assert.match(content(result), /no deletion is confirmed/);
    });
  });

  it('rejects HTTP 202 as an unconfirmed empty upload list', async () => {
    await withReply(202, JSON.stringify({ uploads: [] }), async () => {
      const result = await ROUTES.astra_video_list_uploads({});
      assert.equal(result.isError, true);
      assert.match(content(result), /HTTP 202.*no empty list is confirmed/);
    });
  });

  for (const status of [200, 204]) it(`confirms deletion with HTTP ${status}`, async () => {
    await withReply(status, JSON.stringify({ upload_id, deleted: true }), async calls => {
      const result = await ROUTES.astra_video_delete_upload({ uploadId: upload_id });
      assert.notEqual(result.isError, true);
      assert.deepEqual(JSON.parse(content(result)), { upload_id, deleted: true });
      assert.equal(calls.length, 1);
      assert.ok(calls[0].url.endsWith(`/v1/uploads/${upload_id}`));
      assert.equal(calls[0].method, 'DELETE');
      assert.equal(calls[0].headers.Authorization, 'Bearer test-upload-key-do-not-expose');
      assert.equal(calls[0].headers['User-Agent'], ASTRA_VIDEO_USER_AGENT);
      assert.equal(calls[0].body, undefined);
    });
  });

  for (const [name, args, status] of [
    ['astra_video_list_uploads', {}, 404],
    ['astra_video_delete_upload', { uploadId: upload_id }, 501],
  ]) it(`${name} reports unsupported HTTP ${status} without HTML or secrets`, async () => {
    await withReply(status, '<html>test-upload-key-do-not-expose Traceback: Unsupported method</html>', async calls => {
      const result = await ROUTES[name](args);
      assert.equal(result.isError, true);
      assert.match(content(result), new RegExp(`HTTP ${status}`));
      assert.match(content(result), /not implemented/);
      assert.doesNotMatch(content(result), /<html|Traceback|test-upload-key/);
      assert.equal(calls.length, 1);
    });
  });

  for (const body of ['<html>console SPA</html>', '{"uploads":[{}]}']) {
    it(`rejects invalid HTTP 200 list response: ${body}`, async () => {
      await withReply(200, body, async () => {
        const result = await ROUTES.astra_video_list_uploads({});
        assert.equal(result.isError, true);
        assert.match(content(result), /HTTP 200.*expected upload response/);
        assert.doesNotMatch(content(result), /<html|console SPA/);
      });
    });
  }
  for (const body of ['<html>console SPA</html>', JSON.stringify({ upload_id: 'wrong', deleted: true })]) {
    it(`rejects invalid HTTP 200 deletion response: ${body}`, async () => {
      await withReply(200, body, async () => {
        const result = await ROUTES.astra_video_delete_upload({ uploadId: upload_id });
        assert.equal(result.isError, true);
        assert.match(content(result), /no deletion is confirmed/);
      });
    });
  }
  it('does not treat 202 acceptance as completed deletion', async () => {
    await withReply(202, JSON.stringify({ upload_id, deleted: true }), async () => {
      assert.equal((await ROUTES.astra_video_delete_upload({ uploadId: upload_id })).isError, true);
    });
  });
  for (const status of [401, 500]) it(`reports HTTP ${status} without the raw body`, async () => {
    await withReply(status, 'test-upload-key-do-not-expose', async calls => {
      for (const [name, args] of routes) {
        const result = await ROUTES[name](args);
        assert.equal(result.isError, true);
        assert.match(content(result), new RegExp(`HTTP ${status}`));
        assert.doesNotMatch(content(result), /test-upload-key/);
      }
      assert.equal(calls.length, 2);
    });
  });
  it('rejects unexpected arguments and unsafe ids before fetching', async () => {
    await withReply(200, '{}', async calls => {
      for (const args of [{}, { uploadId: '' }, { uploadId: '../jobs' }, { uploadId: 'a/b' }, { uploadId: upload_id, all: true }]) {
        await assert.rejects(() => ROUTES.astra_video_delete_upload(args));
      }
      await assert.rejects(() => ROUTES.astra_video_list_uploads({ page: 1 }));
      assert.equal(calls.length, 0);
    });
  });
  it('reports a network failure without echoing its message', async () => {
    await withReply(200, '{}', async () => {
      globalThis.fetch = async () => { throw new Error('test-upload-key-do-not-expose'); };
      const result = await ROUTES.astra_video_list_uploads({});
      assert.equal(result.isError, true);
      assert.match(content(result), /HTTP 502/);
      assert.doesNotMatch(content(result), /test-upload-key/);
    });
  });
});

// Stage 2 (room 3b9a99e6 DESIGN §2-3): the contract the server PR ltx-api `247ad209` accepts.
describe('stage 2 — ic_lora, guided_hq, guidance, lora strength', () => {
  it('guidance: known keys inside the server ranges pass; unknown keys, bad ranges and bad blocks fail', () => {
    const ok = parseOk(astraText2VideoSchema, { prompt: 'x', tier: 'hq', guidance: { videoCfgGuidanceScale: 3, videoSkipStep: 2, videoStgBlocks: [28, 29] } });
    assert.deepEqual(buildJobBody('guided_hq', { prompt: 'x', guidance: ok.guidance }).guidance, { video_cfg_guidance_scale: 3, video_skip_step: 2, video_stg_blocks: [28, 29] });
    // Every wire key is an engine name the server accepts (DESIGN §3).
    assert.deepEqual(Object.keys(buildJobBody('guided', { prompt: 'x', guidance: { audioCfgGuidanceScale: 2, a2vGuidanceScale: 2, v2aGuidanceScale: 2, audioStgBlocks: [1] } }).guidance).sort(),
      ['a2v_guidance_scale', 'audio_cfg_guidance_scale', 'audio_stg_blocks', 'v2a_guidance_scale']);
    assert.match(parseFails(astraText2VideoSchema, { prompt: 'x', tier: 'guided', guidance: { foo: 1 } }), /guidance/);
    assert.match(parseFails(astraText2VideoSchema, { prompt: 'x', tier: 'guided', guidance: { videoCfgGuidanceScale: 16 } }), /guidance\.videoCfgGuidanceScale/);
    assert.match(parseFails(astraText2VideoSchema, { prompt: 'x', tier: 'guided', guidance: { videoSkipStep: 1.5 } }), /guidance\.videoSkipStep/);
    assert.match(parseFails(astraText2VideoSchema, { prompt: 'x', tier: 'guided', guidance: { videoStgBlocks: [] } }), /videoStgBlocks/);
    assert.match(parseFails(astraText2VideoSchema, { prompt: 'x', tier: 'guided', guidance: { videoStgBlocks: [48] } }), /videoStgBlocks/);
    assert.match(parseFails(astraText2VideoSchema, { prompt: 'x', tier: 'guided', guidance: { audioStgBlocks: [1, 1] } }), /unique/);
    assert.match(parseFails(astraText2VideoSchema, { prompt: 'x', guidance: { videoCfgGuidanceScale: 3 } }), /guidance is accepted only/);
    assert.match(parseFails(astraImg2VideoSchema, { prompt: 'x', firstFramePath: 'a.png', guidance: { videoCfgGuidanceScale: 3 } }), /guidance is accepted only/);
    // An empty object sends nothing — the body stays the measured one.
    assert.equal(buildJobBody('guided', { prompt: 'x', guidance: {} }).guidance, undefined);
    assert.throws(() => buildJobBody('generate', { prompt: 'x', guidance: { videoCfgGuidanceScale: 3 } }), /mode generate does not accept guidance/);
  });

  it('tier hq maps to guided_hq on text2video and img2video', () => {
    assert.equal(ASTRA_VIDEO_TIERS.hq, 'guided_hq');
    parseOk(astraImg2VideoSchema, { prompt: 'x', firstFramePath: 'a.png', tier: 'hq', negativePrompt: 'blur', numInferenceSteps: 15 });
    parseOk(astraImg2VideoSchema, { prompt: 'x', firstFramePath: 'a.png', tier: 'hq', width: 1024, height: 1920 });
    // skipStage2 false is the engine default and never reaches the wire (live ingredients refuses the key).
    assert.equal('skip_stage_2' in buildJobBody('ingredients', { prompt: 'x', skipStage2: false }), false);
    assert.match(parseFails(astraImg2VideoSchema, { prompt: 'x', firstFramePath: 'a.png', tier: 'hq', lora: ['cinemagraph'] }), /lora is accepted only on tier "default"/);
  });

  it('lora entries: bare names stay bare on the wire; {name, strength} carries a 0-2 strength', () => {
    const data = parseOk(astraText2VideoSchema, { prompt: 'x', lora: ['slow-motion', { name: 'cinemagraph', strength: 0.6 }] });
    assert.deepEqual(buildJobBody('generate', { prompt: 'x', lora: data.lora }).lora, ['slow-motion', { name: 'cinemagraph', strength: 0.6 }]);
    assert.deepEqual(buildJobBody('generate', { prompt: 'x', lora: ['cinemagraph'] }).lora, ['cinemagraph']);
    assert.match(parseFails(astraText2VideoSchema, { prompt: 'x', lora: [{ name: 'cinemagraph', strength: 2.1 }] }), /lora/);
    assert.match(parseFails(astraText2VideoSchema, { prompt: 'x', lora: [{ name: 'cinemagraph', strength: 1, extra: 1 }] }), /lora/);
    assert.match(parseFails(astraText2VideoSchema, { prompt: 'x', lora: ['cinemagraph', { name: 'cinemagraph', strength: 1 }] }), /unique/);
  });

  it('astra_ic_lora schema: adapter catalog, reference kinds, mask needs a clip and a path', () => {
    assert.deepEqual([...ASTRA_VIDEO_IC_LORA_ADAPTERS].sort(),
      ['clean-plate', 'colorization', 'day-to-night', 'deblur', 'decompression', 'ingredients', 'pixel-upscaler-x2', 'water-simulation']);
    assert.equal(icLoraMode('ingredients'), 'ingredients');
    assert.equal(icLoraMode('deblur'), 'ic_lora');
    parseOk(astraIcLoraSchema, { prompt: 'x', adapter: 'deblur', referencePath: 'r.mp4', conditioningMaskPath: 'm.mp4', conditioningMaskStrength: 0.5, skipStage2: true });
    parseOk(astraIcLoraSchema, { prompt: 'x', adapter: 'ingredients', referencePath: 'r.png' });
    assert.match(parseFails(astraIcLoraSchema, { prompt: 'x', adapter: 'nope', referencePath: 'r.mp4' }), /adapter/);
    assert.match(parseFails(astraIcLoraSchema, { prompt: 'x', adapter: 'deblur' }), /referencePath/);
    assert.match(parseFails(astraIcLoraSchema, { prompt: 'x', adapter: 'deblur', referencePath: 'r.wav' }), /referencePath/);
    assert.match(parseFails(astraIcLoraSchema, { prompt: 'x', adapter: 'deblur', referencePath: 'r.mp4', conditioningMaskPath: 'm.png' }), /conditioningMaskPath must be video/);
    assert.match(parseFails(astraIcLoraSchema, { prompt: 'x', adapter: 'deblur', referencePath: 'r.mp4', conditioningMaskStrength: 0.5 }), /needs conditioningMaskPath/);
  });

  it('checkReferenceSource follows the server: OUTPUT pixels, frames fed = min(clip, numFrames)', () => {
    const clip = (frames, width = 640, height = 360) => ({ uploadId: 'u', kind: 'video', frames, width, height });
    // 1536x1024 = 1,572,864 is under the ceiling whatever the clip size.
    assert.equal(checkReferenceSource(clip(121, 3840, 2160)), null);
    // 1536x1344 = 2,064,384 is over it with a moving reference …
    assert.match(checkReferenceSource(clip(121), 121, 1536, 1344), /at most 1867776 pixels/);
    // … but not with a still, nor with numFrames that feeds one frame.
    assert.equal(checkReferenceSource({ uploadId: 'u', kind: 'image', width: 4000, height: 4000 }, 121, 1536, 1344), null);
    assert.equal(checkReferenceSource(clip(121), 1, 1536, 1344), null);
    assert.match(checkReferenceSource({ uploadId: 'u', kind: 'audio' }), /not image or video/);
    // The ceiling itself passes: 1536x1216 = 1,867,776 is allowed, one grid step more is not.
    assert.equal(checkReferenceSource(clip(121), 121, 1536, 1216), null);
    assert.match(checkReferenceSource(clip(121), 121, 1536, 1280), /at most/);
  });

  it('checkMaskSource follows the server: same frames as the reference, 1 or 8k+1, both capped by numFrames', () => {
    const clip = (frames) => ({ uploadId: 'u', kind: 'video', frames, width: 640, height: 360 });
    const still = { uploadId: 'r', kind: 'image', width: 640, height: 360 };
    assert.equal(checkMaskSource(clip(121), clip(121)), null);
    assert.equal(checkMaskSource(clip(200), clip(150)), null); // both capped to 121
    assert.equal(checkMaskSource(clip(1), still), null);
    assert.equal(checkMaskSource(clip(49), clip(49), 121), null);
    assert.match(checkMaskSource(clip(97), clip(121)), /mask 97 · reference 121/);
    assert.match(checkMaskSource(clip(50), clip(50)), /8k\+1/);
    assert.match(checkMaskSource(clip(121), still), /mask 121 · reference 1/);
    assert.match(checkMaskSource({ uploadId: 'u', kind: 'image' }, clip(121)), /not video/);
    assert.match(checkMaskSource({ uploadId: 'u', kind: 'video' }, clip(121)), /unreadable/);
  });

  it('the tool sends ingredients without adapter, and ic_lora with adapter, mask and skip_stage_2', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-iclora-'));
    const oldKey = config.astraVideoApiKey;
    const oldFetch = globalThis.fetch;
    config.astraVideoApiKey = 'test-only-key';
    const jobs = [];
    let n = 0;
    globalThis.fetch = async (url, init = {}) => {
      const pathname = new URL(url).pathname;
      if (pathname === '/v1/uploads') {
        const kind = init.headers['Content-Type'].startsWith('image/') ? 'image' : 'video';
        return Response.json({ upload_id: `${kind}-${n++}`, kind, bytes: 4, frames: kind === 'video' ? 121 : 1, width: 640, height: 360, expires_at: '2026-10-18T00:00:00Z' }, { status: 201 });
      }
      if (pathname === '/v1/jobs') { jobs.push(JSON.parse(init.body)); return Response.json({ job_id: 'test-job' }, { status: 202 }); }
      if (pathname === '/v1/jobs/test-job') return Response.json({ status: 'succeeded', request: jobs.at(-1) });
      if (pathname === '/v1/jobs/test-job/result') return new Response('mock-mp4');
      throw new Error(`Unexpected mocked route ${pathname}`);
    };
    for (const f of ['r.png', 'r.mp4', 'm.mp4']) fs.writeFileSync(path.join(dir, f), 'x');
    try {
      await ROUTES.astra_ic_lora({ prompt: 'x', adapter: 'ingredients', referencePath: path.join(dir, 'r.png'), outputPath: dir, filename: 'a.mp4' });
      assert.deepEqual(jobs[0], { mode: 'ingredients', prompt: 'x', references: [{ upload_id: 'image-0' }] });
      const result = await ROUTES.astra_ic_lora({
        prompt: 'x', adapter: 'deblur', referencePath: path.join(dir, 'r.mp4'), referenceStrength: 0.8,
        conditioningMaskPath: path.join(dir, 'm.mp4'), conditioningMaskStrength: 0.5, skipStage2: true, outputPath: dir, filename: 'b.mp4',
      });
      assert.deepEqual(jobs[1], {
        mode: 'ic_lora', prompt: 'x', adapter: 'deblur',
        references: [{ upload_id: 'video-1', strength: 0.8 }],
        conditioning_mask: { upload_id: 'video-2', strength: 0.5 },
        skip_stage_2: true,
      });
      assert.match(result.content[0].text, /Adapter: deblur/);
      // A moving reference at an output over the ceiling never reaches /v1/jobs.
      await assert.rejects(ROUTES.astra_ic_lora({ prompt: 'x', adapter: 'deblur', referencePath: path.join(dir, 'r.mp4'), width: 1536, height: 1344, outputPath: dir, filename: 'c.mp4' }), /reference refused/);
      assert.equal(jobs.length, 2);
      // A mask that would trip the engine assert never reaches /v1/jobs either (still reference, clip mask).
      await assert.rejects(ROUTES.astra_ic_lora({ prompt: 'x', adapter: 'deblur', referencePath: path.join(dir, 'r.png'), conditioningMaskPath: path.join(dir, 'm.mp4'), outputPath: dir, filename: 'd.mp4' }), /conditioning mask refused/);
      assert.equal(jobs.length, 2);
    } finally { globalThis.fetch = oldFetch; config.astraVideoApiKey = oldKey; fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('astra_video_upscale doubles the clip, keeps 8k+1 frames and puts the source audio back', async () => {
    assert.deepEqual(upscaleGeometry(512, 896, 121), { width: 1024, height: 1792, numFrames: 121 });
    assert.throws(() => upscaleGeometry(768, 1024, 121), /ceiling/);
    assert.throws(() => upscaleGeometry(500, 896, 121), /multiples of 32/);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-upscale-'));
    const oldFetch = globalThis.fetch, oldKey = config.astraVideoApiKey; config.astraVideoApiKey = 'k';
    const ff = (...args) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args]);
    ff('-f', 'lavfi', '-i', 'color=s=64x32:r=24', '-f', 'lavfi', '-i', 'sine', '-frames:v', '27', '-t', '1.125', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', path.join(dir, 'src.mp4'));
    ff('-f', 'lavfi', '-i', 'color=s=128x64:r=24', '-frames:v', '25', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(dir, 'out.mp4'));
    const jobs = [];
    globalThis.fetch = async (url, init = {}) => {
      const pathname = new URL(url).pathname;
      if (pathname === '/v1/uploads') return Response.json({ upload_id: 'v', kind: 'video', bytes: 4, frames: 27, width: 64, height: 32, expires_at: '2026-10-31T00:00:00Z' }, { status: 201 });
      if (pathname === '/v1/jobs') { jobs.push(JSON.parse(init.body)); return Response.json({ job_id: 'up' }, { status: 202 }); }
      if (pathname === '/v1/jobs/up') return Response.json({ status: 'succeeded', request: jobs.at(-1) });
      if (pathname === '/v1/jobs/up/result') return new Response(fs.readFileSync(path.join(dir, 'out.mp4')));
      throw new Error(`Unexpected mocked route ${pathname}`);
    };
    try {
      const result = await ROUTES.astra_video_upscale({ sourceVideoPath: path.join(dir, 'src.mp4'), prompt: 'a grey wall' });
      assert.ok(!result.isError);
      assert.deepEqual([jobs[0].mode, jobs[0].adapter, jobs[0].width, jobs[0].height, jobs[0].num_frames, jobs[0].frame_rate], ['ic_lora', 'pixel-upscaler-x2', 128, 64, 25, 24]);
      const streams = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', path.join(dir, 'src-x2.mp4')], { encoding: 'utf8' });
      assert.deepEqual(streams.trim().split('\n'), ['video', 'audio']);
    } finally { globalThis.fetch = oldFetch; config.astraVideoApiKey = oldKey; fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

// Stage 3 (leader 43da766d, server contract bc4ba45f): duration, generateAudio, capabilities.
describe('stage 3 — duration, generateAudio, capabilities', () => {
  it('framesForSeconds is the server rule: nearest 8k+1, the shorter on a tie', () => {
    assert.deepEqual([5, 4, 2, 1, 15].map((s) => framesForSeconds(s)), [121, 97, 49, 25, 361]);
    assert.equal(framesForSeconds(5, 30), 153); // 150 → 153 is nearer than 145
    assert.equal(framesForSeconds(117 / 24), 113); // 117 sits halfway between 113 and 121 → shorter
    assert.equal(framesForSeconds(117.1 / 24), 121);
    // A float near-tie follows the server's epsilon (ltx-api duration_to_frames), not the raw float.
    assert.equal(framesForSeconds(2.210543877210544, 23.976), 49);
    assert.equal(framesForSeconds(4.36, 25), 105);
  });

  it('duration becomes numFrames, so the frame rules apply to it, and it excludes the other lengths', () => {
    assert.equal(parseOk(astraText2VideoSchema, { prompt: 'x', duration: 4 }).numFrames, 97);
    assert.equal('duration' in parseOk(astraText2VideoSchema, { prompt: 'x', duration: 4 }), false);
    assert.equal(parseOk(astraText2VideoSchema, { prompt: 'x', duration: 5, frameRate: 30 }).numFrames, 153);
    assert.match(parseFails(astraText2VideoSchema, { prompt: 'x', tier: 'guided', duration: 16 }), /duration 16s at 24fps is 385 frames; mode guided takes 25-361 frames, i\.e\. duration more than 0\.8750s and at most 15\.2083s/);
    assert.match(parseFails(astraText2VideoSchema, { prompt: 'x', duration: 0.5 }), /duration 0.5s/);
    assert.match(parseFails(astraText2VideoSchema, { prompt: 'x', duration: 4, numFrames: 97 }), /duration and numFrames are mutually exclusive/);
    assert.match(parseFails(astraText2VideoSchema, { prompt: 'x', duration: 4, autoDuration: { minSeconds: 1, maxSeconds: 4 } }), /duration and autoDuration/);
    assert.match(parseFails(astraAudio2VideoSchema, { prompt: 'x', audioPath: 'a.wav', duration: 4, audioMaxDuration: 4 }), /duration and audioMaxDuration/);
    // keyframe indices are checked against the converted length: 2s = 49 frames = 0..48.
    const images = [{ imagePath: 'a.png', frameIdx: 0 }, { imagePath: 'b.png', frameIdx: 60 }];
    assert.match(parseFails(astraKeyframeVideoSchema, { prompt: 'x', images, duration: 2 }), /between 0 and 48/);
    assert.equal(parseOk(astraKeyframeVideoSchema, { prompt: 'x', images, duration: 3 }).numFrames, 73);
    assert.equal(parseOk(astraIcLoraSchema, { prompt: 'x', adapter: 'deblur', referencePath: 'r.mp4', duration: 2 }).numFrames, 49);
  });

  it('retake takes no duration: the route refuses it as an unknown argument before any upload', async () => {
    await assert.rejects(ROUTES.astra_video_retake({ prompt: 'x', sourceVideoPath: 's.mp4', startTime: 0, endTime: 1, duration: 2 }), /unknown argument\(s\): duration/);
  });

  it('generateAudio false is the only value that reaches the wire, on every mode', () => {
    for (const mode of ['generate', 'guided', 'guided_fast', 'guided_hq', 'keyframe', 'audio2video', 'ingredients', 'ic_lora', 'retake']) {
      assert.ok(ASTRA_VIDEO_ALLOWED_FIELDS[mode].includes('generate_audio'), mode);
    }
    assert.equal(buildJobBody('generate', { prompt: 'x', generateAudio: false }).generate_audio, false);
    assert.equal('generate_audio' in buildJobBody('generate', { prompt: 'x', generateAudio: true }), false);
    assert.equal('generate_audio' in buildJobBody('retake', { prompt: 'x', videoUploadId: 'v', startTime: 0, endTime: 1 }), false);
    assert.equal(parseOk(astraVideoRetakeSchema, { prompt: 'x', sourceVideoPath: 's.mp4', startTime: 0, endTime: 1, generateAudio: false }).generateAudio, false);
  });

  it('every astra generation tool exposes duration (not retake) and generateAudio; model is not a tool argument', () => {
    for (const name of ['astra_text2video', 'astra_img2video', 'astra_keyframe_video', 'astra_audio2video', 'astra_ic_lora', 'astra_video_retake']) {
      const props = TOOLS.find((t) => t.name === name).inputSchema.properties;
      assert.ok(props.generateAudio, `${name} generateAudio`);
      assert.equal(Boolean(props.duration), name !== 'astra_video_retake', `${name} duration`);
      assert.equal(props.model, undefined, `${name} model`);
    }
  });
});

// Server D6 (ltx-api 10e6e74, contract 3b893376): a WAV that surely cannot cover the video is refused before the job.
describe('audio2video — audio must cover the video (D6)', () => {
  it('matches the server rule and its fixes on the 12:22Z live failure', () => {
    // 5.71s of audio against 145 frames = 6.0417s at 24fps: fails live; the server proposes 137 frames.
    const message = checkAudioCoversVideo(5.71, 145, 24);
    assert.match(message, /usable audio 5\.710s vs 145 frames = 6\.0417s at 24fps/);
    assert.match(message, /\(1\) re-upload audio of at least 6\.0417s · \(2\) set numFrames to 137 or less \(duration 5\.7083s or less\) · \(3\) use audioMaxDuration/);
    // The user's 12:27Z retry with 6.04s of audio rendered: inside the slack.
    assert.equal(checkAudioCoversVideo(6.04, 145, 24), null);
    // 0.08s is the edge: just inside passes, just past it is refused.
    assert.equal(checkAudioCoversVideo(121 / 24 - 0.0799, 121, 24), null);
    assert.notEqual(checkAudioCoversVideo(121 / 24 - 0.0801, 121, 24), null);
    // ffprobe's six decimals must not cost a grid step: 137/24 = 5.708333 still fits 137.
    assert.match(checkAudioCoversVideo(5.708333, 153, 24), /numFrames to 137 or less/);
    // Too short for any 8k+1 of 25+: the numFrames fix is dropped.
    assert.doesNotMatch(checkAudioCoversVideo(0.9, 121, 24), /set numFrames/);
    // fit exactly 25 still offers the numFrames fix (24fps · 1.05s → 25.2 frames).
    assert.match(checkAudioCoversVideo(1.05, 121, 24), /set numFrames to 25 or less/);
  });

  it('applies to wav without audioMaxDuration only, using numFrames (121 when omitted) after audioStartTime', () => {
    const wav = { uploadId: 'a', kind: 'audio', duration: 4 };
    assert.match(checkAudioSource(wav, { wav: true }), /121 frames = 5\.0417s/);
    assert.equal(checkAudioSource(wav, { wav: true, numFrames: 97 }), null);
    assert.match(checkAudioSource(wav, { wav: true, numFrames: 97, audioStartTime: 1 }), /usable audio 3\.000s \(after audioStartTime\)/);
    assert.equal(checkAudioSource(wav, { wav: false }), null); // mp3: length may be an estimate
    assert.equal(checkAudioSource(wav, { wav: true, audioMaxDuration: 4 }), null);
    // frameRate is honoured: 121 frames at 30fps = 4.0333s is covered by 4s of audio, at 24fps it is not.
    assert.equal(checkAudioSource(wav, { wav: true, frameRate: 30 }), null);
    assert.match(checkAudioSource({ uploadId: 'a', kind: 'audio', duration: 3.5 }, { wav: true, frameRate: 30 }), /121 frames = 4\.0333s at 30fps/);
  });

  it('the tool refuses a short WAV after upload and before /v1/jobs', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-d6-'));
    const oldKey = config.astraVideoApiKey;
    const oldFetch = globalThis.fetch;
    config.astraVideoApiKey = 'test-only-key';
    const jobs = [];
    globalThis.fetch = async (url, init = {}) => {
      const pathname = new URL(url).pathname;
      if (pathname === '/v1/uploads') return Response.json({ upload_id: 'audio-id', kind: 'audio', bytes: 4, duration: 5.71, expires_at: '2026-10-18T00:00:00Z' }, { status: 201 });
      if (pathname === '/v1/jobs') { jobs.push(JSON.parse(init.body)); return Response.json({ job_id: 'test-job' }, { status: 202 }); }
      if (pathname === '/v1/jobs/test-job') return Response.json({ status: 'succeeded', request: jobs.at(-1) });
      if (pathname === '/v1/jobs/test-job/result') return new Response('mock-mp4');
      // An unknown route answers 404 instead of throwing, so a regression fails instead of hanging.
      return new Response('unexpected route', { status: 404 });
    };
    fs.writeFileSync(path.join(dir, 'a.wav'), 'wave');
    fs.writeFileSync(path.join(dir, 'a.mp3'), 'mp3');
    try {
      await assert.rejects(ROUTES.astra_audio2video({ prompt: 'x', audioPath: path.join(dir, 'a.wav'), numFrames: 145, outputPath: dir }), /audio is shorter than the video/);
      await assert.rejects(ROUTES.astra_audio2video({ prompt: 'x', audioPath: path.join(dir, 'a.wav'), duration: 6, outputPath: dir }), /audio is shorter than the video/);
      // expectLipSync takes the retry branch; the D6 check must still run before any job.
      await assert.rejects(ROUTES.astra_audio2video({ prompt: 'x', audioPath: path.join(dir, 'a.wav'), numFrames: 145, expectLipSync: true, outputPath: dir }), /audio is shorter than the video/);
      assert.equal(jobs.length, 0);
      // The same short length as mp3 is not judged (its length may be an estimate): it reaches /v1/jobs.
      await ROUTES.astra_audio2video({ prompt: 'x', audioPath: path.join(dir, 'a.mp3'), numFrames: 145, outputPath: dir, filename: 'mp3.mp4' });
      assert.equal(jobs.length, 1);
      assert.equal(jobs[0].num_frames, 145);
    } finally { globalThis.fetch = oldFetch; config.astraVideoApiKey = oldKey; fs.rmSync(dir, { recursive: true, force: true }); }
  });
});


describe('2026-10-18 live contract snapshot (read-only capture; no render claims)', () => {
  const models = JSON.parse(fs.readFileSync(new URL('./fixtures/astra-v1-models.json', import.meta.url), 'utf8')).data[0];
  const openapi = JSON.parse(fs.readFileSync(new URL('./fixtures/astra-openapi-20261018.json', import.meta.url), 'utf8'));
  const schemas = openapi.paths['/v1/jobs'].post.requestBody.content['application/json'].schema.oneOf;
  it('wire allow-lists track both operational sources; duration is the deliberate local conversion', () => {
    for (const mode of models.modes) {
      const schema = schemas.find(s => s.properties.mode.const === mode.mode);
      assert.deepEqual([...ASTRA_VIDEO_ALLOWED_FIELDS[mode.mode]].sort(), mode.allowed_fields.filter(k => k !== 'duration').sort());
      assert.deepEqual(Object.keys(schema.properties).sort(), [...mode.allowed_fields].sort());
    }
  });
  it('HDR and guidance enums/ranges are backed by the OpenAPI rather than a prose assertion', () => {
    const wire = schemas.find(s => s.properties.mode.const === 'guided').properties;
    for (const hdr of wire.hdr.enum.filter(Boolean))
      assert.equal(astraText2VideoSchema.parse({ prompt: 'x', hdr }).hdr, hdr);
    for (const [key, spec] of Object.entries(wire.guidance.properties)) {
      const toolKey = key.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
      const args = value => ({ prompt: 'x', tier: 'guided', guidance: { [toolKey]: value } });
      if (spec.type === 'number' || spec.type === 'integer') {
        parseOk(astraText2VideoSchema, args(spec.minimum));
        parseOk(astraText2VideoSchema, args(spec.maximum));
        parseFails(astraText2VideoSchema, args(spec.minimum - 1));
        parseFails(astraText2VideoSchema, args(spec.maximum + 1));
      }
    }
  });
});
