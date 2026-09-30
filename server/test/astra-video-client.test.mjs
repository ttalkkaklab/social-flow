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
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { config } from '../dist/config.js';
import { ROUTES } from '../dist/handlers.js';
import { TOOLS } from '../dist/tools.js';

import packageMetadata from '../package.json' with { type: 'json' };

import {
  ASTRA_VIDEO_ALLOWED_FIELDS,
  ASTRA_VIDEO_FRAME_LIMITS,
  ASTRA_VIDEO_LORAS,
  ASTRA_VIDEO_MAX_PIXELS,
  ASTRA_VIDEO_TIERS,
  ASTRA_VIDEO_USER_AGENT,
  astraVideoHeaders,
  astraAudio2VideoSchema,
  astraImg2VideoSchema,
  astraKeyframeVideoSchema,
  astraText2VideoSchema,
  astraVideoRetakeSchema,
  buildJobBody,
  checkAudioSource,
  checkAutoDuration,
  checkDimensions,
  checkFrameIdx,
  checkRetakeSource,
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
  it('generate frame counts are 8k+1 within 25..193', () => {
    for (const good of [25, 33, 121, 193]) {
      parseOk(astraText2VideoSchema, { prompt: 'x', numFrames: good });
    }
    for (const bad of [9, 24, 120, 194, 201, 481, 489]) {
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
    // The final API checks the object's fields but ignores its range when numFrames is explicit.
    parseOk(astraText2VideoSchema, { prompt: 'x', numFrames: 121, autoDuration: { minSeconds: 1, maxSeconds: 20 } });
  });

  it('uses an explicit versioned User-Agent on every centralized ASTRA header set', () => {
    assert.equal(ASTRA_VIDEO_USER_AGENT, `social-flow/${packageMetadata.version}`);
    assert.deepEqual(astraVideoHeaders('secret'), {
      Authorization: 'Bearer secret',
      'User-Agent': `social-flow/${packageMetadata.version}`,
    });
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
    assert.match(
      parseFails(astraText2VideoSchema, { prompt: 'x', lora: ['slow-motion', 'slow-motion'] }),
      /lora values must be unique/,
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

  it('audio2video wants the audio path and one length control at most', () => {
    parseOk(astraAudio2VideoSchema, { prompt: 'x', audioPath: '/tmp/a.wav' });
    parseFails(astraAudio2VideoSchema, { prompt: 'x' });
    assert.match(
      parseFails(astraAudio2VideoSchema, {
        prompt: 'x',
        audioPath: '/tmp/a.wav',
        numFrames: 121,
        audioMaxDuration: 5,
      }),
      /mutually exclusive/,
    );
  });

  it('audio upload metadata rejects starts at the end and more than 193 selected frames', () => {
    const audio = { uploadId: 'a'.repeat(32), bytes: 1, kind: 'audio', duration: 30 };
    assert.equal(checkAudioSource(audio, { audioStartTime: 0, audioMaxDuration: 8.1, frameRate: 24 }), null);
    assert.match(
      checkAudioSource(audio, { audioStartTime: 0, audioMaxDuration: 8.5, frameRate: 24 }),
      /selects 201 frames.*maximum is 193/,
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
  const tool = name => TOOLS.find(t => t.name === name);

  // The README ASTRA row is the third public surface beside tools and the engine guide.
  // Keep the checks scoped to that row so unrelated model limits cannot satisfy them.
  const readmeAstraRow = () => {
    const readme = fs.readFileSync(new URL('../../README.md', import.meta.url), 'utf8');
    const rows = readme.split('\n').filter(line => line.startsWith('| Video generation | `astra_text2video`'));
    assert.equal(rows.length, 1, 'README must have one ASTRA video row');
    return rows[0];
  };
  for (const [name, pattern] of [
    ['server frame ceiling', /8k\+1, 25–193/],
    ['guided and fast client ceiling', /guided\/fast client ceiling 121/],
    ['pixel ceiling', /2,064,384-pixel ceiling/],
    ['1088x1920 refusal at every frame count', /1088×1920 exceeds the area ceiling at every frame count/],
    ['supplied audio preservation', /Clips carry 48kHz stereo AAC; `audio2video` carries the supplied sound re-encoded, rather than a newly generated track/],
    ['stereo input and mono generation failure', /Stereo \(2-channel\) input is required: mono WAV passes acceptance but fails generation/],
    ['default audio length', /With neither length argument, audio2video uses 121 frames \(~5\.04s\), not the source length/],
    ['rounded audio length', /`audioMaxDuration: 8` selects 185 frames \(~7\.71s\) at 24fps/],
    ['no audio-off argument', /There is no audio-off argument/],
  ]) {
    it(`README ASTRA documents ${name}`, () => assert.match(readmeAstraRow(), pattern));
  }

  it('image warning keeps generate and guided failure frames separate', () => {
    const description = tool('astra_img2video').description;
    const frames = mode => description.match(new RegExp(`${mode} \\(width 1280, measured at [^)]+\\) failure frames: \\{([^}]+)\\}`))?.[1].split(',').map(Number);
    assert.deepEqual(frames('generate'), [121, 129, 137]);
    assert.deepEqual(frames('guided'), [121]);
    assert.match(description, /Guided 129\/137 succeeded/);
    assert.match(description, /hypothesis, not a confirmed cause/);
  });

  it('image failure warnings use width gates and preserve measured success points', () => {
    const description = tool('astra_img2video').description;
    assert.match(description, /generate \(width 1280, measured at heights 704\/768\) failure frames/);
    assert.match(description, /guided \(width 1280, measured at height 704\) failure frames/);
    assert.match(description, /Text-only 1280x704 at 121 frames succeeded/);
    assert.match(description, /generate 1536x704 and 1536x1024 at 121 frames also succeeded/);
    const guide = fs.readFileSync(new URL('../../skills/produce/references/video-model-selection.md', import.meta.url), 'utf8');
    assert.match(guide, /generate: \{121,129,137\}\*\* at\s+width 1280 \(measured at heights 704\/768\)/);
    assert.match(guide, /guided: \{121\}\*\* at width 1280 \(measured at height 704\)/);
    assert.match(guide, /text-only\s+1280x704 at 121 frames succeeded/);
    assert.match(guide, /generate 1536x704 and 1536x1024 at\s+121 frames also succeeded/);
  });

  it('text-only tool does not advertise an image-conditioned failure band', () => {
    assert.doesNotMatch(tool('astra_text2video').description, /image-conditioned|failure frames|CUDA illegal memory access/);
  });

  it('audio inputs warn that mono is accepted but fails generation', () => {
    const audio = tool('astra_audio2video');
    assert.match(audio.description, /mono passes upload and job acceptance but fails during generation/);
    for (const name of ['audioPath', 'audioUploadId']) {
      const description = audio.inputSchema.properties[name].description;
      assert.match(description, /Stereo \(2-channel\) input required/);
      assert.match(description, /Mono WAV passes acceptance \(202\) but fails during generation/);
    }
  });

  it('audio guidance preserves the source track and explains default and rounded duration', () => {
    const audio = tool('astra_audio2video');
    assert.match(audio.description, /supplied WAV re-encoded as AAC/);
    assert.match(audio.description, /0\.99997 at zero lag/);
    assert.match(audio.description, /default is 121 frames.*not the source audio length/);
    assert.match(audio.description, /audioMaxDuration=8\.0 at 24fps rounds down to 185 frames/);
    assert.match(audio.inputSchema.properties.audioMaxDuration.description, /8 seconds selects 185 frames/);
    assert.match(audio.inputSchema.properties.audioMaxDuration.description, /both length fields are omitted.*121 frames/);
  });

  it('pixel ceiling accepts its exact boundary and rejects 1088x1920 even at 25 frames', () => {
    assert.equal(ASTRA_VIDEO_MAX_PIXELS, 2_064_384);
    assert.equal(checkDimensions(1344, 1536, 'generate'), null);
    assert.equal(checkDimensions(1024, 1920, 'generate'), null);
    assert.match(checkDimensions(1088, 1920, 'generate'), /at most 2064384/);
    assert.match(parseFails(astraText2VideoSchema, { prompt: 'x', width: 1088, height: 1920, numFrames: 25 }), /2064384/);
    for (const name of ['astra_text2video', 'astra_img2video', 'astra_keyframe_video', 'astra_audio2video']) {
      for (const axis of ['width', 'height']) {
        assert.match(tool(name).inputSchema.properties[axis].description, /1088x1920 exceeds the area ceiling at every frame count/);
      }
    }
  });

  it('image failure-band guidance adds no client rejection', () => {
    for (const numFrames of [121, 129, 137]) {
      parseOk(astraImg2VideoSchema, { prompt: 'x', firstFramePath: 'a.png', width: 1280, height: 704, numFrames });
    }
  });
});

describe('mode-specific ceilings and new input contracts', () => {
  it('pins all five mode ceilings to the measured client and server limits', () => {
    assert.deepEqual(ASTRA_VIDEO_FRAME_LIMITS, { generate: 193, guided: 121, guided_fast: 121, keyframe: 193, audio2video: 193 });
  });

  it('every text and image tier accepts its ceiling and refuses the next grid value', () => {
    for (const [tier, max] of [['default', 193], ['guided', 121], ['fast', 121]]) {
      parseOk(astraText2VideoSchema, { prompt: 'x', tier, numFrames: max });
      parseFails(astraText2VideoSchema, { prompt: 'x', tier, numFrames: max + 8 });
    }
    for (const [tier, max] of [['default', 193], ['guided', 121]]) {
      parseOk(astraImg2VideoSchema, { prompt: 'x', firstFramePath: 'a.png', tier, numFrames: max });
      parseFails(astraImg2VideoSchema, { prompt: 'x', firstFramePath: 'a.png', tier, numFrames: max + 8 });
    }
  });

  for (const [mode, schema, args] of [
    ['keyframe', astraKeyframeVideoSchema, { prompt: 'x', images: [{ imagePath: 'a.png', frameIdx: 0 }, { imagePath: 'b.png', frameIdx: 192 }] }],
    ['audio2video', astraAudio2VideoSchema, { prompt: 'x', audioUploadId: 'reuse' }],
  ]) {
    it(`${mode} accepts 193 frames at the server ceiling`, () => {
      parseOk(schema, { ...args, numFrames: 193 });
    });
    it(`${mode} refuses 201 frames above the server ceiling`, () => {
      assert.match(parseFails(schema, { ...args, numFrames: 201 }), /193/);
      for (const numFrames of [24, 192, 481, 489]) parseFails(schema, { ...args, numFrames });
    });
  }

  it('guided images only accept the measured size and reject fast and lora', () => {
    const args = { prompt: 'x', firstFramePath: 'a.png', tier: 'guided' };
    for (const dims of [{}, { width: 1536 }, { height: 1024 }, { width: 1536, height: 1024 }]) parseOk(astraImg2VideoSchema, { ...args, ...dims });
    for (const dims of [{ width: 1280, height: 704 }, { width: 1024 }, { height: 1536 }]) parseFails(astraImg2VideoSchema, { ...args, ...dims });
    parseFails(astraImg2VideoSchema, { ...args, tier: 'fast' });
    parseFails(astraImg2VideoSchema, { ...args, lora: ['cinemagraph'] });
    parseOk(astraImg2VideoSchema, { ...args, tier: 'default', width: 1280, height: 704, lora: ['cinemagraph'] });
  });

  it('audio takes exactly one nonblank source and an optional nonblank portrait', () => {
    for (const source of [{ audioPath: 'a.wav' }, { audioUploadId: 'reuse' }]) {
      parseOk(astraAudio2VideoSchema, { prompt: 'x', ...source });
      parseOk(astraAudio2VideoSchema, { prompt: 'x', ...source, imagePath: 'face.png' });
      parseFails(astraAudio2VideoSchema, { prompt: 'x', ...source, imagePath: '' });
      parseFails(astraAudio2VideoSchema, { prompt: 'x', ...source, numFrames: 121, audioMaxDuration: 5 });
    }
    for (const source of [{}, { audioPath: 'a.wav', audioUploadId: 'reuse' }, { audioPath: '' }, { audioUploadId: ' ' }]) parseFails(astraAudio2VideoSchema, { prompt: 'x', ...source });
  });

  it('advertises the same mode limits and new arguments', () => {
    for (const [name, max] of [['astra_text2video', 193], ['astra_img2video', 193], ['astra_keyframe_video', 193], ['astra_audio2video', 193]]) {
      const property = TOOLS.find(t => t.name === name).inputSchema.properties.numFrames;
      assert.equal(property.maximum, max);
      assert.match(property.description, /guided: 121/);
      assert.match(property.description, /server rejects values above 193/);
    }
    const image = TOOLS.find(t => t.name === 'astra_img2video');
    assert.deepEqual(image.inputSchema.properties.tier.enum, ['default', 'guided']);
    const audio = TOOLS.find(t => t.name === 'astra_audio2video');
    assert.deepEqual(audio.inputSchema.oneOf, [{ required: ['audioPath'] }, { required: ['audioUploadId'] }]);
    assert.ok(audio.inputSchema.properties.imagePath);
    assert.match(audio.description, /supplied WAV re-encoded as AAC/);
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
    let duration = 30, rejectJob = false;
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
      if (pathname === '/v1/jobs/test-job') return Response.json({ status: 'succeeded', request: jobs.at(-1) });
      if (pathname === '/v1/jobs/test-job/result') return new Response('mock-mp4');
      throw new Error(`Unexpected mocked route ${pathname}`);
    };
    fs.writeFileSync(path.join(dir, 'a.wav'), 'wave');
    fs.writeFileSync(path.join(dir, 'face.png'), 'png');
    try { await fn({ dir, uploads, jobs, setDuration: value => { duration = value; }, rejectJob: () => { rejectJob = true; } }); }
    finally { globalThis.fetch = oldFetch; config.astraVideoApiKey = oldKey; fs.rmSync(dir, { recursive: true, force: true }); }
  }

  it('uploads audio and portrait, pins frame zero and reports reusable metadata', async () => {
    await withServer(async ({ dir, uploads, jobs }) => {
      const result = await ROUTES.astra_audio2video({ prompt: 'x', audioPath: path.join(dir, 'a.wav'), imagePath: path.join(dir, 'face.png'), outputPath: dir });
      assert.deepEqual(uploads, ['audio', 'image']);
      assert.equal(jobs[0].audio_upload_id, 'audio-id');
      assert.deepEqual(jobs[0].images, [{ upload_id: 'image-id', frame_idx: 0 }]);
      assert.match(result.content[0].text, /audioUploadId: audio-id/);
      assert.match(result.content[0].text, /Audio expires at: 2026-10-01T04:00:00Z/);
      assert.match(result.content[0].text, /Audio duration \(seconds\): 30/);
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

  it('surfaces server refusal of reused ids', async () => {
    await withServer(async ({ uploads, rejectJob }) => {
      rejectJob();
      await assert.rejects(ROUTES.astra_audio2video({ prompt: 'x', audioUploadId: 'expired' }), /expired audio upload/);
      assert.deepEqual(uploads, []);
    });
  });

  it('rejects invalid input and fresh audio duration before job submission', async () => {
    await withServer(async ({ dir, uploads, jobs, setDuration }) => {
      await assert.rejects(ROUTES.astra_audio2video({ prompt: 'x', audioPath: 'a.wav', audioUploadId: 'reuse' }), /exactly one/);
      await assert.rejects(ROUTES.astra_audio2video({ prompt: 'x', audioUploadId: 'reuse', imagePath: 'not-image.wav' }), /must be an image/);
      await assert.rejects(ROUTES.astra_img2video({ prompt: 'x', firstFramePath: 'face.png', tier: 'guided', width: 1280, height: 704 }), /1536x1024/);
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
});
