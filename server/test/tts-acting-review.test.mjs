import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { reviewActing } from '../dist/tts-acting-review.js';
import { pcmToWav } from '../dist/media-utils.js';
test('legacy speech review prepares host evidence without network or score', async () => {
 const dir=mkdtempSync(join(tmpdir(),'host-audio-')); const original=globalThis.fetch;
 try {
  globalThis.fetch=async()=>{throw new Error('External evaluator must never be called');};
  const audioPath=join(dir,'take.wav');writeFileSync(audioPath,pcmToWav(Buffer.alloc(48000,10),24000,1));
  const result=await reviewActing({audioPath,expectedText:'Hello',direction:'Friendly',requestedBy:'Review the voice',outputPath:dir});
  assert.equal(result.status,'not_reviewed');assert.equal(result.score,null);
  assert.equal(result.externalEvaluationCalls,0);assert.equal(result.provider,'host');
  assert.equal(result.mediaSha256.length,64);
 } finally {globalThis.fetch=original;rmSync(dir,{recursive:true,force:true});}
});
