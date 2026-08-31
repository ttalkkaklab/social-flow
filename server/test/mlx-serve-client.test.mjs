/**
 * MLX Core / mlx-serve client — schema, parsers, fail-closed, and mocked HTTP.
 * No live :11234 call.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';

import { mlxServeConfigured, mlxServeUrl } from '../dist/config.js';
import { pcmToWav } from '../dist/media-utils.js';
import {
  DEFAULT_MLX_IMAGE_SIZE,
  DEFAULT_MLX_MUSIC_SECONDS,
  DEFAULT_MLX_VIDEO_FRAMES,
  DEFAULT_MLX_VIDEO_HEIGHT,
  DEFAULT_MLX_VIDEO_WIDTH,
  MAX_VIDEO_RGB_BYTES,
  MLX_VIDEO_FPS,
  editMlxImage,
  generateMlx3d,
  generateMlxImage,
  generateMlxMusic,
  generateMlxTts,
  generateMlxVideo,
  mlx3dGenerateSchema,
  mlxDownHint,
  mlxImageEditSchema,
  mlxImageGenerateSchema,
  mlxMusicGenerateSchema,
  mlxTtsGenerateSchema,
  mlxVideoGenerateSchema,
  parseGlbResponse,
  parseImageResponse,
  parseVideoResponse,
  pickModel,
  videoExceedsMemory,
  videoRgbBytes,
} from '../dist/mlx-serve-client.js';

const origFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = origFetch;
});

function jsonResponse(status, body, contentType = 'application/json') {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  const buf = Buffer.from(text);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => (String(name).toLowerCase() === 'content-type' ? contentType : null) },
    text: async () => text,
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  };
}

function bytesResponse(status, buf, contentType) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => (String(name).toLowerCase() === 'content-type' ? contentType : null) },
    text: async () => buf.toString('utf8'),
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  };
}

function tinyWav() {
  return pcmToWav(Buffer.alloc(32), 24_000, 1);
}

describe('mlx-serve config', () => {
  it('strips trailing slashes from MLX_SERVE_URL', () => {
    const prev = process.env.MLX_SERVE_URL;
    process.env.MLX_SERVE_URL = 'http://127.0.0.1:19999///';
    try {
      assert.equal(mlxServeUrl(), 'http://127.0.0.1:19999');
      assert.equal(mlxServeConfigured(), true, 'a non-default URL counts as configured');
    } finally {
      if (prev === undefined) delete process.env.MLX_SERVE_URL;
      else process.env.MLX_SERVE_URL = prev;
    }
  });
});

describe('mlx schemas', () => {
  it('image generate fills 1024² and rejects 1080', () => {
    const parsed = mlxImageGenerateSchema.parse({ prompt: 'a chair' });
    assert.equal(parsed.width, DEFAULT_MLX_IMAGE_SIZE);
    assert.equal(parsed.height, DEFAULT_MLX_IMAGE_SIZE);
    assert.equal(mlxImageGenerateSchema.safeParse({ prompt: 'x', width: 1080, height: 1920 }).success, false);
    assert.equal(mlxImageGenerateSchema.safeParse({ prompt: 'x', width: 1088, height: 1920 }).success, true);
  });

  it('image edit requires imagePath', () => {
    assert.equal(mlxImageEditSchema.safeParse({ prompt: 'make it night' }).success, false);
    assert.equal(mlxImageEditSchema.safeParse({ prompt: 'make it night', imagePath: '/tmp/a.png' }).success, true);
  });

  it('music defaults instrumental true and rejects lyrics beside it', () => {
    const parsed = mlxMusicGenerateSchema.parse({ prompt: 'lofi bed' });
    assert.equal(parsed.instrumental, true);
    assert.equal(parsed.durationSeconds, DEFAULT_MLX_MUSIC_SECONDS);
    const bad = mlxMusicGenerateSchema.safeParse({ prompt: 'song', instrumental: true, lyrics: 'la la' });
    assert.equal(bad.success, false);
    assert.match(bad.error.issues[0].message, /instrumental:true cannot be sent beside lyrics/);
    assert.equal(
      mlxMusicGenerateSchema.safeParse({ prompt: 'song', instrumental: false, lyrics: 'la la' }).success,
      true,
    );
  });

  it('tts uses input, not text, and caps length', () => {
    assert.equal(mlxTtsGenerateSchema.safeParse({ text: 'hello' }).success, false);
    assert.equal(mlxTtsGenerateSchema.safeParse({ input: 'hello' }).success, true);
    assert.equal(mlxTtsGenerateSchema.safeParse({ input: 'x'.repeat(8_001) }).success, false);
  });

  it('video rejects 1080, 8s at 1088×1920, and under 9 frames', () => {
    const ok = mlxVideoGenerateSchema.parse({ prompt: 'walk' });
    assert.equal(ok.width, DEFAULT_MLX_VIDEO_WIDTH);
    assert.equal(ok.height, DEFAULT_MLX_VIDEO_HEIGHT);
    assert.equal(ok.numFrames, DEFAULT_MLX_VIDEO_FRAMES);
    assert.equal(mlxVideoGenerateSchema.safeParse({ prompt: 'x', width: 1080, height: 1920 }).success, false);
    assert.equal(mlxVideoGenerateSchema.safeParse({ prompt: 'x', width: 1088, height: 1920, numFrames: 192 }).success, false);
    assert.equal(mlxVideoGenerateSchema.safeParse({ prompt: 'x', numFrames: 8 }).success, false);
    assert.equal(mlxVideoGenerateSchema.safeParse({ prompt: 'x', width: 768, height: 1280, numFrames: 49 }).success, true);
  });

  it('3d requires imagePath and a .glb filename', () => {
    assert.equal(mlx3dGenerateSchema.safeParse({}).success, false);
    assert.equal(mlx3dGenerateSchema.safeParse({ imagePath: '/tmp/a.png' }).success, true);
    assert.equal(mlx3dGenerateSchema.safeParse({ imagePath: '/tmp/a.png', filename: 'out.obj' }).success, false);
    assert.equal(mlx3dGenerateSchema.safeParse({ imagePath: '/tmp/a.png', filename: 'out.glb' }).success, true);
  });
});

describe('mlx parsers and pickModel', () => {
  it('pickModel prefers a ready model with the capability', () => {
    const models = [
      { id: 'chat', state: 'ready', capabilities: ['text'] },
      { id: 'flux-cold', state: 'unloaded', capabilities: ['image'] },
      { id: 'krea', state: 'ready', capabilities: ['image'] },
    ];
    assert.equal(pickModel(models, 'image')?.id, 'krea');
    assert.equal(pickModel(models, 'video'), undefined);
    assert.equal(pickModel([{ id: 'ltx', capabilities: ['video'] }], 'video')?.id, 'ltx');
  });

  it('parseImageResponse reads data[0].b64_json', () => {
    const ok = parseImageResponse(JSON.stringify({ data: [{ b64_json: 'YWJj' }] }));
    assert.equal('b64' in ok && ok.b64, 'YWJj');
    assert.equal('error' in parseImageResponse('{}'), true);
  });

  it('parseVideoResponse checks rgb8 length', () => {
    const frames = 2;
    const height = 2;
    const width = 2;
    const rgb = Buffer.alloc(frames * height * width * 3, 7);
    const ok = parseVideoResponse(
      JSON.stringify({ format: 'rgb8', frames, height, width, fps: 24, data: rgb.toString('base64') }),
    );
    assert.equal('rgb' in ok && ok.rgb.length, rgb.length);
    assert.equal('error' in parseVideoResponse(JSON.stringify({ format: 'mp4' })), true);
    const short = parseVideoResponse(
      JSON.stringify({ format: 'rgb8', frames, height, width, fps: 24, data: Buffer.alloc(3).toString('base64') }),
    );
    assert.match('error' in short ? short.error : '', /RGB length/);
  });

  it('parseGlbResponse reads data', () => {
    const ok = parseGlbResponse(JSON.stringify({ data: 'Z2xi' }));
    assert.equal('b64' in ok && ok.b64, 'Z2xi');
    assert.equal('error' in parseGlbResponse('{}'), true);
  });

  it('1088×1920×8s at 24fps exceeds the RGB cap; the default canvas does not', () => {
    assert.equal(videoExceedsMemory(1088, 1920, 192), true);
    assert.ok(videoRgbBytes(1088, 1920, 192) > MAX_VIDEO_RGB_BYTES);
    assert.equal(videoExceedsMemory(DEFAULT_MLX_VIDEO_WIDTH, DEFAULT_MLX_VIDEO_HEIGHT, DEFAULT_MLX_VIDEO_FRAMES), false);
    assert.equal(MLX_VIDEO_FPS, 24);
  });
});

describe('mlx generate — mocked fetch', () => {
  it('fails closed with the install hint when :11234 is down', async () => {
    globalThis.fetch = async () => {
      throw new Error('fetch failed');
    };
    const result = await generateMlxImage({ prompt: 'x', width: 1024, height: 1024 });
    assert.equal(result.success, false);
    assert.match(result.error, /brew install --cask mlx-core/);
    assert.match(result.error, /does not launch the app/);
    assert.match(mlxDownHint(), /MLX Core is not reachable/);
  });

  it('never sends default:true on load-model, then writes the png', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mlx-img-'));
    let modelsCalls = 0;
    const loadBodies = [];
    globalThis.fetch = async (url, opts) => {
      const path = String(url);
      if (path.endsWith('/health')) return jsonResponse(200, { ok: true });
      if (path.endsWith('/v1/models')) {
        modelsCalls += 1;
        const state = modelsCalls === 1 ? 'unloaded' : 'ready';
        return jsonResponse(200, { data: [{ id: 'krea', state, capabilities: ['image'] }] });
      }
      if (path.endsWith('/v1/load-model')) {
        loadBodies.push(JSON.parse(String(opts.body)));
        return jsonResponse(200, { ok: true });
      }
      if (path.endsWith('/v1/images/generations')) {
        const body = JSON.parse(String(opts.body));
        assert.equal(body.model, 'krea');
        assert.equal(body.size, '1024x1024');
        assert.ok(!('default' in body));
        return jsonResponse(200, { data: [{ b64_json: Buffer.from('png-bytes').toString('base64') }] });
      }
      throw new Error(`unexpected ${path}`);
    };
    try {
      const result = await generateMlxImage({
        prompt: 'a lamp',
        model: 'krea',
        width: 1024,
        height: 1024,
        outputPath: dir,
        filename: 'out.png',
      });
      assert.equal(result.success, true, result.error);
      assert.equal(readFileSync(join(dir, 'out.png')).toString(), 'png-bytes');
      assert.equal(loadBodies.length, 1);
      assert.deepEqual(loadBodies[0], { model: 'krea' });
      assert.ok(!('default' in loadBodies[0]));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('edit posts mode:edit and not multipart /v1/images/edits', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mlx-edit-'));
    const src = join(dir, 'src.png');
    writeFileSync(src, 'src-img');
    const urls = [];
    globalThis.fetch = async (url, opts) => {
      const path = String(url);
      urls.push(path);
      if (path.endsWith('/health')) return jsonResponse(200, { ok: true });
      if (path.endsWith('/v1/models')) {
        return jsonResponse(200, { data: [{ id: 'krea', state: 'ready', capabilities: ['image'] }] });
      }
      if (path.endsWith('/v1/images/generations')) {
        const body = JSON.parse(String(opts.body));
        assert.equal(body.mode, 'edit');
        assert.equal(typeof body.image, 'string');
        return jsonResponse(200, { data: [{ b64_json: Buffer.from('edited').toString('base64') }] });
      }
      throw new Error(`unexpected ${path}`);
    };
    try {
      const result = await editMlxImage({ prompt: 'night', imagePath: src, outputPath: dir, filename: 'e.png' });
      assert.equal(result.success, true, result.error);
      assert.ok(urls.every((u) => !u.includes('/v1/images/edits')));
      assert.equal(readFileSync(join(dir, 'e.png')).toString(), 'edited');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('tts reads raw WAV bytes, not res.text()', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mlx-tts-'));
    const wav = tinyWav();
    globalThis.fetch = async (url) => {
      const path = String(url);
      if (path.endsWith('/health')) return jsonResponse(200, { ok: true });
      if (path.endsWith('/v1/models')) {
        return jsonResponse(200, { data: [{ id: 'tts', state: 'ready', capabilities: ['audio'] }] });
      }
      if (path.endsWith('/v1/audio/speech')) return bytesResponse(200, wav, 'audio/wav');
      throw new Error(`unexpected ${path}`);
    };
    try {
      const result = await generateMlxTts({ input: 'hello', outputPath: dir, filename: 'v.wav' });
      assert.equal(result.success, true, result.error);
      assert.equal(readFileSync(join(dir, 'v.wav')).subarray(0, 4).toString('ascii'), 'RIFF');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('music writes a wav and refuses a JSON error body posing as success', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mlx-music-'));
    globalThis.fetch = async (url) => {
      const path = String(url);
      if (path.endsWith('/health')) return jsonResponse(200, { ok: true });
      if (path.endsWith('/v1/models')) {
        return jsonResponse(200, { data: [{ id: 'ace', state: 'ready', capabilities: ['music'] }] });
      }
      if (path.endsWith('/v1/audio/music-generations')) {
        return bytesResponse(200, Buffer.from('{"error":"nope"}'), 'application/json');
      }
      throw new Error(`unexpected ${path}`);
    };
    try {
      const result = await generateMlxMusic({
        prompt: 'bed',
        instrumental: true,
        durationSeconds: 10,
        outputPath: dir,
        filename: 'm.wav',
      });
      assert.equal(result.success, false);
      assert.match(result.error, /nope/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('3d writes a glb from data', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mlx-3d-'));
    const src = join(dir, 'in.png');
    writeFileSync(src, 'img');
    globalThis.fetch = async (url) => {
      const path = String(url);
      if (path.endsWith('/health')) return jsonResponse(200, { ok: true });
      if (path.endsWith('/v1/models')) {
        return jsonResponse(200, { data: [{ id: 'hunyuan', state: 'ready', capabilities: ['3d'] }] });
      }
      if (path.endsWith('/v1/3d/generations')) {
        return jsonResponse(200, { data: Buffer.from('glb-bytes').toString('base64') });
      }
      throw new Error(`unexpected ${path}`);
    };
    try {
      const result = await generateMlx3d({ imagePath: src, outputPath: dir, filename: 'm.glb' });
      assert.equal(result.success, true, result.error);
      assert.equal(readFileSync(join(dir, 'm.glb')).toString(), 'glb-bytes');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('video refuses an over-cap canvas before the POST', async () => {
    let posted = false;
    globalThis.fetch = async (url) => {
      const path = String(url);
      if (path.endsWith('/health')) return jsonResponse(200, { ok: true });
      if (path.endsWith('/v1/models')) {
        return jsonResponse(200, { data: [{ id: 'ltx', state: 'ready', capabilities: ['video'] }] });
      }
      if (path.endsWith('/v1/video/generations')) {
        posted = true;
        return jsonResponse(200, { format: 'rgb8' });
      }
      throw new Error(`unexpected ${path}`);
    };
    const result = await generateMlxVideo({
      prompt: 'walk',
      width: 1088,
      height: 1920,
      numFrames: 192,
    });
    assert.equal(result.success, false);
    assert.match(result.error, /over the 800MB cap/);
    assert.equal(posted, false);
  });
});
