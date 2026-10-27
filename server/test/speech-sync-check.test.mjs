// Speech sync check behind astra_audio2video expectLipSync: ffmpeg-rendered fixtures where a
// "mouth" box opens with an aperiodic speech gate, plus a mocked ASTRA server that returns a
// clip that ignores the voice first and one that follows it second. No LTX calls are made.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { config } from '../dist/config.js';
import { ROUTES } from '../dist/handlers.js';
import { checkSpeechSync } from '../dist/speech-sync-check.js';

// Syllables at 3Hz, pauses on an aperiodic schedule — a periodic gate would let the
// time-shifted chance search line up again and hide the difference.
const GATE = 'gt(sin(2*PI*3*t),0)*gt(sin(2*PI*0.37*t)+sin(2*PI*0.83*t+1),0)';
const ff = (args) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args]);

// Rendered once for the file; each case reads these and writes only its own output names.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'speech-sync-'));
after(() => fs.rmSync(dir, { recursive: true, force: true }));
const file = (name) => path.join(dir, name);
ff(['-f', 'lavfi', '-i', `aevalsrc='0.5*sin(2*PI*220*t)*${GATE}':s=48000:d=6`, '-ac', '2', file('speech.wav')]);
ff(['-f', 'lavfi', '-i', `aevalsrc='0.5*sin(2*PI*220*t)*${GATE}':s=48000:d=9`, '-ac', '2', file('long.wav')]);
ff(['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', '6', file('silence.wav')]);
// A head that sways on its own clock, and a mouth that opens with the voice or never.
const clip = (name, mouth) => ff(['-f', 'lavfi', '-i', 'color=c=0xd8c8b0:s=720x1280:r=24:d=6',
  '-f', 'lavfi', '-i', 'color=c=0x705030:s=160x160:r=24:d=6',
  '-filter_complex', `[0][1]overlay=x='280+120*sin(2*PI*0.7*t)':y=300,drawbox=x=300:y=820:w=120:h=60:color=0x301010:t=fill:enable='${mouth}'`,
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-t', '6', file(name)]);
clip('synced.mp4', GATE);
clip('ignored.mp4', '0');
ff(['-i', file('synced.mp4'), '-i', file('speech.wav'), '-c:v', 'copy', '-c:a', 'aac', '-shortest', file('synced-own.mp4')]);
ff(['-i', file('synced.mp4'), '-itsoffset', '0.5', '-i', file('speech.wav'), '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-t', '6', file('synced-late.mp4')]);

test('a mouth that opens with the speech passes, one that never moves is a reseed finding', (t) => {
  const good = checkSpeechSync({ videoPath: file('synced.mp4'), audioPath: file('speech.wav') });
  assert.equal(good.status, 'follows_speech');
  assert.deepEqual(good.findings, []);
  assert.deepEqual([...good.notReviewed], ['phoneme-level lip sync', 'which visible person speaks', 'voice identity']);
  const bad = checkSpeechSync({ videoPath: file('ignored.mp4'), audioPath: file('speech.wav') });
  assert.equal(bad.status, 'no_sync');
  assert.deepEqual(bad.findings.map((f) => [f.kind, f.reseed]), [['lip_sync', true]]);
  assert.ok(good.sync.margin > bad.sync.margin + 0.2);
});

test('cut-off speech and a foreign clip track are reported without a reseed', (t) => {
  const cut = checkSpeechSync({ videoPath: file('synced.mp4'), audioPath: file('long.wav') });
  assert.deepEqual(cut.findings.map((f) => [f.kind, f.reseed]), [['speech_cut', false]]);
  const own = checkSpeechSync({ videoPath: file('synced-own.mp4'), audioPath: file('speech.wav') });
  assert.ok(own.audio.correlation > 0.9 && own.audio.lagFrames === 0, JSON.stringify(own.audio));
  assert.deepEqual(own.findings, []);
  const late = checkSpeechSync({ videoPath: file('synced-late.mp4'), audioPath: file('speech.wav') });
  assert.ok(late.findings.some((f) => f.kind === 'audio_mismatch' && !f.reseed), JSON.stringify(late.audio));
});

test('without enough speech or a readable clip the check reports not_measured and never asks for a reseed', (t) => {
  const quiet = checkSpeechSync({ videoPath: file('synced.mp4'), audioPath: file('silence.wav') });
  assert.equal(quiet.status, 'not_measured');
  assert.match(quiet.reason, /too little/);
  fs.writeFileSync(file('junk.mp4'), 'mock-mp4');
  const junk = checkSpeechSync({ videoPath: file('junk.mp4'), audioPath: file('speech.wav') });
  assert.equal(junk.status, 'not_measured');
  assert.deepEqual(junk.findings, []);
});

async function withAstra(t, results) {
  const oldKey = config.astraVideoApiKey, oldFetch = globalThis.fetch;
  config.astraVideoApiKey = 'test-only-key';
  t.after(() => { globalThis.fetch = oldFetch; config.astraVideoApiKey = oldKey; });
  const jobs = [];
  globalThis.fetch = async (url, init = {}) => {
    const route = new URL(url).pathname;
    if (route === '/v1/uploads') return Response.json({ upload_id: 'audio-id', kind: 'audio', bytes: 4, duration: 6, expires_at: '2026-10-18T00:00:00Z' }, { status: 201 });
    if (route === '/v1/jobs') { jobs.push(JSON.parse(init.body)); return Response.json({ job_id: `job-${jobs.length}` }, { status: 202 }); }
    const status = /^\/v1\/jobs\/job-(\d+)$/.exec(route);
    if (status) return results[Number(status[1]) - 1] === 'fail'
      ? Response.json({ status: 'failed', error: 'generator rc=1' })
      : Response.json({ status: 'succeeded', request: jobs[Number(status[1]) - 1] });
    const result = /^\/v1\/jobs\/job-(\d+)\/result$/.exec(route);
    if (result) return new Response(fs.readFileSync(file(results[Number(result[1]) - 1])));
    throw new Error(`Unexpected mocked route ${route}`);
  };
  return { file, jobs, dir };
}

test('expectLipSync re-renders a clip that ignored the voice with a new seed and keeps the one that follows it', async (t) => {
  const { file, jobs, dir } = await withAstra(t, ['ignored.mp4', 'synced.mp4']);
  const out = await ROUTES.astra_audio2video({ prompt: 'x', audioPath: file('speech.wav'), numFrames: 145, seed: 7, guidance: { a2vGuidanceScale: 4 }, expectLipSync: true, outputPath: dir, filename: 'line.mp4' });
  const text = out.content[0].text;
  assert.equal(jobs.length, 2);
  assert.equal(jobs[0].seed, 7);
  assert.ok(Number.isInteger(jobs[1].seed) && jobs[1].seed !== 7);
  assert.equal(jobs[1].audio_upload_id, 'audio-id', 'the same audio upload is reused');
  // The retry is the same request with a new seed: guidance must ride along on every attempt.
  for (const job of jobs) assert.deepEqual(job.guidance, { a2v_guidance_scale: 4 });
  assert.match(text, /File: .*line-attempt2\.mp4/);
  assert.match(text, /attempt 1 · seed 7 · no_sync/);
  assert.match(text, /attempt 2 \(provisional candidate\) · seed \d+ · follows_speech/);
  assert.match(text, /Not reviewed: phoneme-level lip sync/);
  const first = JSON.parse(fs.readFileSync(file('line.mp4.astra-job.json'), 'utf8'));
  assert.equal(first.status, 'completed');
  assert.equal(first.speechSync.status, 'no_sync');
  assert.equal(first.speechSync.seed, 7);
  assert.match(first.sha256, /^[a-f0-9]{64}$/);
  const candidate = JSON.parse(fs.readFileSync(file('line-attempt2.mp4.astra-job.json'), 'utf8'));
  assert.equal(candidate.selection.status, 'provisional');
  assert.deepEqual(candidate.selection.review, {camera:'not_reviewed',blocking:'not_reviewed',phonemeLipSync:'not_reviewed'});
});

test('the attempt cap keeps the best clip with its finding instead of failing', async (t) => {
  const { file, jobs, dir } = await withAstra(t, ['ignored.mp4', 'ignored.mp4', 'ignored.mp4']);
  const out = await ROUTES.astra_audio2video({ prompt: 'x', audioPath: file('speech.wav'), numFrames: 145, expectLipSync: true, maxAttempts: 1, outputPath: dir, filename: 'once.mp4' });
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].seed, undefined, 'the first attempt keeps the caller seed (none)');
  assert.match(out.content[0].text, /Still no_sync after 1 attempt/);
  assert.match(out.content[0].text, /lip_sync: no region of the picture moves with the speech/);
  await assert.rejects(ROUTES.astra_audio2video({ prompt: 'x', audioPath: file('speech.wav'), expectLipSync: true, maxAttempts: 4 }));
});

test('a retry that fails on the server keeps the clip already rendered', async (t) => {
  const { file, jobs, dir } = await withAstra(t, ['ignored.mp4', 'fail']);
  const out = await ROUTES.astra_audio2video({ prompt: 'x', audioPath: file('speech.wav'), numFrames: 145, expectLipSync: true, outputPath: dir, filename: 'kept.mp4' });
  assert.equal(jobs.length, 2);
  assert.match(out.content[0].text, /File: .*kept\.mp4/);
  assert.match(out.content[0].text, /attempt 2 failed: .*generator rc=1/);
  assert.match(out.content[0].text, /Still no_sync after 1 attempt/);
});
