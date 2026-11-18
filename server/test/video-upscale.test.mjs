import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { startUpscale, controlUpscale, upscaleCatalog, upscaleStartSchema, upscaleStatus } from '../dist/video-upscale.js';

const pythonPath = execFileSync('which', ['python3'], { encoding: 'utf8' }).trim();
const worker = path.resolve(import.meta.dirname, '../dist/video-upscale-worker.py');
const fixture = dir => {
  const source = path.join(dir, 'source.mp4');
  execFileSync('ffmpeg', ['-v','error','-f','lavfi','-i','testsrc2=s=64x48:r=24:d=0.5','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=0.5','-c:v','libx264','-threads','1','-c:a','aac','-shortest',source]);
  return source;
};

test('upscale schema requires explicit adapter and paired even dimensions', () => {
  const base = { adapter: 'lanczos', sources: ['/tmp/a.mp4'], outputDirectory: '/tmp/out' };
  assert.equal(upscaleStartSchema.parse(base).fit, 'contain');
  for (const change of [{ adapter: 'unknown' }, { width: 3840 }, { width: 3839, height: 2160 }, { denoiseStrength: 2 }, { sources: [] }]) {
    assert.equal(upscaleStartSchema.safeParse({ ...base, ...change }).success, false);
  }
  assert.equal(upscaleCatalog({ pythonPath }).adapters.find(a => a.id === 'lanczos').available, true);
});

test('real worker preserves frames/audio, reuses completed clips, and refuses modified sources on resume', () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'upscale-')));
  try {
    const source = fixture(dir);
    const options = { adapter: 'lanczos', sources: [source], outputDirectory: dir, width: 128, height: 72, fit: 'cover', device: 'cpu', denoiseStrength: .3, pythonPath, modelsDirectory: dir };
    const prepared = JSON.parse(execFileSync(pythonPath, [worker, '--prepare'], { input: JSON.stringify(options), encoding: 'utf8' }));
    const job = path.join(dir, 'job'); fs.mkdirSync(job);
    fs.writeFileSync(path.join(job, 'request.json'), JSON.stringify({ version: 1, ...prepared, fingerprint: 'fixture', jobDirectory: job }));
    fs.writeFileSync(path.join(job, 'cancel'), 'stop');
    execFileSync(pythonPath, [worker, '--job', job]);
    assert.equal(upscaleStatus(job).status, 'cancelled');
    fs.unlinkSync(path.join(job, 'cancel'));
    execFileSync(pythonPath, [worker, '--job', job]);
    const complete = upscaleStatus(job);
    assert.equal(complete.status, 'completed');
    const result = complete.results[0];
    assert.equal(result.audioPacketsIdentical, true);
    assert.deepEqual([result.output.width,result.output.height,result.output.frames,result.output.fps], [128,72,12,'24/1']);
    const stat = fs.statSync(result.output.path);
    execFileSync(pythonPath, [worker, '--job', job]);
    assert.equal(fs.statSync(result.output.path).mtimeMs, stat.mtimeMs);
    fs.appendFileSync(result.output.path, 'tampered');
    assert.throws(() => execFileSync(pythonPath, [worker, '--job', job], { stdio: 'pipe' }));
    assert.match(upscaleStatus(job).error, /Completed output changed/);
    fs.truncateSync(result.output.path, stat.size);
    const requestPath = path.join(job, 'request.json');
    const originalRequest = fs.readFileSync(requestPath, 'utf8');
    fs.writeFileSync(requestPath, JSON.stringify({ ...JSON.parse(originalRequest), fit: 'contain' }));
    assert.throws(() => execFileSync(pythonPath, [worker, '--job', job], { stdio: 'pipe' }));
    assert.match(upscaleStatus(job).error, /settings changed/);
    fs.writeFileSync(requestPath, originalRequest);
    fs.appendFileSync(source, 'changed');
    assert.throws(() => execFileSync(pythonPath, [worker, '--job', job], { stdio: 'pipe' }));
    assert.match(upscaleStatus(job).error, /Source or model changed/);
    assert.equal(fs.statSync(result.output.path).size, stat.size);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('start is idempotent and cancellation does not signal unrelated processes', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'upscale-start-'));
  let job;
  try {
    const source = fixture(dir);
    const args = { adapter: 'lanczos', sources: [source], outputDirectory: dir, pythonPath };
    job = startUpscale(args).jobDirectory;
    const cancel = controlUpscale({ action: 'cancel', jobDirectory: job });
    assert.ok(cancel.cancellationRequested || cancel.status === 'completed');
    assert.equal(startUpscale(args).jobDirectory, job);
    // Wait on the actual child exit, not a fixed wall-clock sleep.
    const waitForExit = () => new Promise((resolve, reject) => {
      const started = Date.now();
      const poll = setInterval(() => {
        if (!upscaleStatus(job).processAlive) { clearInterval(poll); resolve(); }
        else if (Date.now() - started > 15000) { clearInterval(poll); reject(Error('worker did not exit')); }
      }, 25);
    });
    await waitForExit();
    const last = upscaleStatus(job);
    assert.equal(last.status, 'cancelled');
    controlUpscale({action: 'resume', jobDirectory: job});
    await waitForExit();
    assert.equal(upscaleStatus(job).status, 'completed');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// Unsupported timing must be rejected before any render begins.
test('preflight refuses variable frame timestamps', () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'upscale-vfr-')));
  try {
    const source = fixture(dir), vfr = path.join(dir, 'vfr.mp4');
    execFileSync('ffmpeg', ['-v','error','-i',source,'-vf',"setpts=if(lt(N\\,6)\\,N/(24*TB)\\,(N-6)/(12*TB)+0.25/TB)",'-fps_mode','vfr','-an','-c:v','libx264','-threads','1',vfr]);
    assert.throws(() => startUpscale({ adapter: 'lanczos', sources: [vfr], outputDirectory: dir, pythonPath }), /constant-frame-rate/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
