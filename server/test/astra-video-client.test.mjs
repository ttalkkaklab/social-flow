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

import {
  ASTRA_VIDEO_ALLOWED_FIELDS,
  ASTRA_VIDEO_LORAS,
  ASTRA_VIDEO_MAX_PIXELS,
  ASTRA_VIDEO_TIERS,
  astraAudio2VideoSchema,
  astraImg2VideoSchema,
  astraKeyframeVideoSchema,
  astraText2VideoSchema,
  astraVideoRetakeSchema,
  buildJobBody,
  checkDimensions,
  checkFrameIdx,
  uploadContentType,
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

describe('the five tiers/modes cover all six server modes', () => {
  it('tier map resolves to generate/guided/guided_fast', () => {
    assert.deepEqual(Object.values(ASTRA_VIDEO_TIERS), ['generate', 'guided', 'guided_fast']);
  });

  it('every mode the server has is in the allow-list table', () => {
    assert.deepEqual(
      Object.keys(ASTRA_VIDEO_ALLOWED_FIELDS).sort(),
      ['audio2video', 'generate', 'guided', 'guided_fast', 'keyframe', 'retake'],
    );
  });

  // Measured 2026-09-29: the server names the whole allow-list when it rejects an unknown key.
  it('generate alone takes lora, and does not take negative_prompt or num_inference_steps', () => {
    assert.ok(ASTRA_VIDEO_ALLOWED_FIELDS.generate.includes('lora'));
    assert.ok(!ASTRA_VIDEO_ALLOWED_FIELDS.generate.includes('negative_prompt'));
    assert.ok(!ASTRA_VIDEO_ALLOWED_FIELDS.generate.includes('num_inference_steps'));
    for (const mode of ['guided', 'guided_fast', 'keyframe', 'audio2video', 'retake']) {
      assert.ok(!ASTRA_VIDEO_ALLOWED_FIELDS[mode].includes('lora'), `${mode} must not accept lora`);
    }
  });

  it('num_generated_keyframes lives on generate and the two guided tiers only', () => {
    for (const mode of ['generate', 'guided', 'guided_fast']) {
      assert.ok(ASTRA_VIDEO_ALLOWED_FIELDS[mode].includes('num_generated_keyframes'), mode);
    }
    for (const mode of ['keyframe', 'audio2video', 'retake']) {
      assert.ok(!ASTRA_VIDEO_ALLOWED_FIELDS[mode].includes('num_generated_keyframes'), mode);
    }
  });

  it('auto_duration is absent from keyframe, audio2video and retake', () => {
    for (const mode of ['keyframe', 'audio2video', 'retake']) {
      assert.ok(!ASTRA_VIDEO_ALLOWED_FIELDS[mode].includes('auto_duration'), mode);
    }
  });
});

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

  it('never sends hdr, even though every allow-list contains it', () => {
    const body = buildJobBody('generate', { prompt: 'x', numFrames: 121 });
    assert.ok(!('hdr' in body), 'hdr must not be sent in this version');
  });

  it('autoDuration becomes auto_duration, and drops when numFrames is also given', () => {
    const auto = buildJobBody('generate', { prompt: 'x', autoDuration: { minSeconds: 1, maxSeconds: 4 } });
    assert.deepEqual(auto.auto_duration, { min_seconds: 1, max_seconds: 4 });

    const explicit = buildJobBody('generate', {
      prompt: 'x',
      numFrames: 121,
      autoDuration: { minSeconds: 1, maxSeconds: 4 },
    });
    assert.ok(!('auto_duration' in explicit), 'numFrames wins, so auto_duration is not sent');
    assert.equal(explicit.num_frames, 121);
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

  it('audio2video carries the audio id and its window', () => {
    const body = buildJobBody('audio2video', {
      prompt: 'x',
      audioUploadId: 'c'.repeat(32),
      audioStartTime: 0,
      audioMaxDuration: 5,
    });
    assert.equal(body.audio_upload_id, 'c'.repeat(32));
    assert.equal(body.audio_start_time, 0);
    assert.equal(body.audio_max_duration, 5);
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
  it('frame counts are 8k+1 within 25..481', () => {
    for (const good of [25, 33, 121, 481]) {
      parseOk(astraText2VideoSchema, { prompt: 'x', numFrames: good });
    }
    for (const bad of [9, 24, 120, 489]) {
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

  it('the area ceiling applies whatever the grid', () => {
    assert.equal(checkDimensions(1536, 1024, 'generate'), null);
    assert.match(checkDimensions(1920, 1920, 'generate'), new RegExp(`at most ${ASTRA_VIDEO_MAX_PIXELS}`));
  });

  it('frameIdx is 0..numFrames-1 — 121 frames means 120 is the last', () => {
    assert.equal(checkFrameIdx(0, 121), null);
    assert.equal(checkFrameIdx(120, 121), null);
    assert.match(checkFrameIdx(121, 121), /between 0 and 120/);
    assert.match(checkFrameIdx(-1, 121), /between 0 and 120/);
    // no numFrames given → the server's own default of 121 is assumed
    assert.match(checkFrameIdx(121, undefined), /between 0 and 120/);
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
    assert.match(parseFails(astraText2VideoSchema, { prompt: 'x', negativePrompt: 'blurry' }), /only on tier "guided" or "fast"/);
    assert.match(parseFails(astraText2VideoSchema, { prompt: 'x', numInferenceSteps: 30 }), /only on tier "guided" or "fast"/);
  });

  it('lora values are the two the server loads, and at most two of them', () => {
    assert.deepEqual([...ASTRA_VIDEO_LORAS], ['cinemagraph', 'slow-motion']);
    parseFails(astraText2VideoSchema, { prompt: 'x', lora: ['deblur'] });
    parseFails(astraText2VideoSchema, { prompt: 'x', lora: ['/etc/passwd'] });
    parseFails(astraText2VideoSchema, { prompt: 'x', lora: ['cinemagraph', 'slow-motion', 'cinemagraph'] });
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

  it('audio2video wants the audio path', () => {
    parseOk(astraAudio2VideoSchema, { prompt: 'x', audioPath: '/tmp/a.wav' });
    parseFails(astraAudio2VideoSchema, { prompt: 'x' });
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

  it('a prompt is required everywhere and capped at 2000 characters', () => {
    const long = 'a'.repeat(2001);
    parseFails(astraText2VideoSchema, { prompt: '' });
    parseFails(astraText2VideoSchema, { prompt: long });
    parseFails(astraVideoRetakeSchema, { prompt: long, sourceVideoPath: '/tmp/a.mp4', startTime: 0, endTime: 1 });
  });
});
