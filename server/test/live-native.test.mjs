import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {NativeTalk, openingParts, spokenVideoRequest, talkPrompt} from '../dist/live-native.js';
import {genaiImageToVideoSchema} from '../dist/astra-genai-video.js';
import {SAMPLES} from '../dist/live-character.js';
import {LiveRenderPool, UnresolvedLiveVideo} from '../dist/live-program.js';
import {config} from '../dist/config.js';

const actor = {asset:'/host.png',voiceSample:'/voice.wav',language:'ko',voiceDirection:'Warm and relaxed.'};

test('an unknown remote job pauses admissions and a completed job with a broken download releases its slot', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'live-unresolved-'));
  const portrait = join(dir, 'host.png'), voice = join(dir, 'voice.wav');
  writeFileSync(portrait, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=', 'base64'));
  writeFileSync(voice, Buffer.alloc(44));
  const render = new NativeTalk({...actor, asset:portrait, voiceSample:voice}, dir, talkPrompt);
  const key = config.astraGenaiApiKey;
  config.astraGenaiApiKey = 'test-only';
  t.after(() => { config.astraGenaiApiKey = key; render.close(); rmSync(dir, {recursive:true, force:true}); });
  let submitted = 0, polled = 0, completed = false;
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    const path = new URL(url).pathname;
    if (path === '/asset.mp4') return new Response(null, {status:502});
    if (path === '/v1/models') return Response.json({data:[{id:'ltx-2.5-22b-distilled', parameters_by_mode:{image2video:['num_frames']}}]});
    if (path.endsWith('/uploads')) return new Response(null, {status:404});
    if (init.method === 'POST') { submitted++; return Response.json({id:'accepted-job'}); }
    assert.ok(path.endsWith('/accepted-job'));
    polled++;
    return completed ? Response.json({id:'accepted-job', status:'succeeded', outputs:[{url:'https://cdn.example/asset.mp4'}]})
      : new Response(null, {status:403});
  });
  const pool = new LiveRenderPool(1), signal = new AbortController().signal;
  const schedule = text => pool.run(true, () => render.render(text, signal));
  const results = await Promise.allSettled([schedule('안녕하세요.'), schedule('반가워요.')]);
  assert.ok(pool.paused instanceof UnresolvedLiveVideo, results[0].reason?.message);
  for (const result of results) assert.equal(result.reason, pool.paused);
  await assert.rejects(schedule('어서 오세요.'), error => error === pool.paused);
  assert.equal(JSON.parse(readFileSync(pool.paused.receiptPath)).jobId, 'accepted-job');
  assert.deepEqual([submitted, polled], [1, 1]);
  completed = true;
  const resumed = new LiveRenderPool(1);
  const clips = await Promise.allSettled(['안녕하세요.', '다음 이야기예요.'].map(text => resumed.run(false, () => render.render(text, signal))));
  assert.ok(clips.every(clip => clip.status === 'rejected' && /502/.test(clip.reason.message)));
  assert.equal(resumed.paused, undefined);
  assert.deepEqual([submitted, polled], [2, 3]);
});

test('live dialogue binds the exact line and voice reference to the on-screen host', () => {
  const words = '제 책갈피는 남색이에요.';
  const request = genaiImageToVideoSchema.parse(spokenVideoRequest(actor, talkPrompt, words));
  assert.equal(request.generateAudio, true);
  assert.equal(request.imagePath, actor.asset);
  assert.equal(request.references[0].audioPath, actor.voiceSample);
  assert.ok(request.prompt.includes(JSON.stringify(words)));
  assert.deepEqual(request.openingPositions[0].images, [1]);
  assert.throws(() => spokenVideoRequest(actor, talkPrompt, '한'.repeat(300)), /shorter line/);
  const longTopic = '오늘은 ' + '바다가 보이는 서점에서 만난 사람들 '.repeat(5) + '이야기를 해 볼게요. 여러분 생각도 댓글로 남겨 주세요.';
  const parts = openingParts(longTopic, actor.language);
  assert.ok(parts.length > 1);
  assert.equal(parts.join('').replaceAll(' ',''),longTopic.replaceAll(' ',''));
  for (const part of parts) assert.ok(spokenVideoRequest(actor, talkPrompt, part).numFrames <= 361);
});

test('plays the generated soundtrack on the video clock and rejects a silent clip', async t => {
  const dir = mkdtempSync(join(tmpdir(),'genai-live-test-'));
  const render = new NativeTalk(actor, dir, talkPrompt);
  t.after(() => { render.close(); rmSync(dir,{recursive:true,force:true}); });
  const signal = new AbortController().signal;
  for (const [name, sound] of [['spoken','sine=frequency=510'],['silent','anullsrc']]) {
    const file = join(dir,name+'.mov');
    execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=black:s=720x1280:r=24:d=0.25',
      '-f','lavfi','-i',sound+',atrim=duration=0.30','-c:v','libx264','-c:a','pcm_s16le',file]);
    if (name === 'silent') await assert.rejects(render.readSpeech(file,signal), /silent/);
    else {
      const {motion,pcm} = await render.readSpeech(file,signal);
      assert.equal(motion.count,6);
      assert.equal(pcm.length,0.30*24000*2);
      assert.ok(pcm.subarray(6*SAMPLES*2).some(Boolean));
      assert.ok(pcm.some(Boolean));
      render.release(motion);
    }
  }
});
