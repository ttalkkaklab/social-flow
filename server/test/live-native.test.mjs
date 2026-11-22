import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {NativeTalk, spokenVideoRequest, talkPrompt} from '../dist/live-native.js';
import {genaiImageToVideoSchema} from '../dist/astra-genai-video.js';
import {SAMPLES} from '../dist/live-character.js';

const actor = {asset:'/host.png',voiceSample:'/voice.wav',language:'ko',voiceDirection:'Warm and relaxed.'};

test('live dialogue binds the exact line and voice reference to the on-screen host', () => {
  const words = '제 책갈피는 남색이에요.';
  const request = genaiImageToVideoSchema.parse(spokenVideoRequest(actor, talkPrompt, words));
  assert.equal(request.generateAudio, true);
  assert.equal(request.imagePath, actor.asset);
  assert.equal(request.references[0].audioPath, actor.voiceSample);
  assert.ok(request.prompt.includes(JSON.stringify(words)));
  assert.deepEqual(request.openingPositions[0].images, [1]);
  assert.throws(() => spokenVideoRequest(actor, talkPrompt, '한'.repeat(300)), /shorter line/);
});

test('plays the generated soundtrack on the video clock and rejects a silent clip', async t => {
  const dir = mkdtempSync(join(tmpdir(),'genai-live-test-'));
  const render = new NativeTalk(actor, dir, talkPrompt);
  t.after(() => { render.close(); rmSync(dir,{recursive:true,force:true}); });
  const signal = new AbortController().signal;
  for (const [name, sound] of [['spoken','sine=frequency=510'],['silent','anullsrc']]) {
    const file = join(dir,name+'.mp4');
    execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=black:s=720x1280:r=24',
      '-f','lavfi','-i',sound,'-t','0.25','-c:v','libx264','-c:a','aac',file]);
    if (name === 'silent') await assert.rejects(render.readSpeech(file,signal), /silent/);
    else {
      const {motion,pcm} = await render.readSpeech(file,signal);
      assert.equal(motion.count,6);
      assert.equal(pcm.length,6*SAMPLES*2);
      assert.ok(pcm.some(Boolean));
      render.release(motion);
    }
  }
});
