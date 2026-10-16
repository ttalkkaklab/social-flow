import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { manageSpeech, speechRevision } from '../dist/speech.js';
const require = createRequire(import.meta.url);
const checker = require('../../skills/produce/references/check-tts-quality.js');
const cases = [
  { engine:'elevenlabs',voiceId:'actor-one',model:'eleven_v4',speed:1,language:'ko',stability:0.5 },
  { engine:'gemini',voiceId:'Kore',model:'gemini-2.5-flash-preview-tts',speed:1,language:'ko',stylePrompt:'warm narrator' },
  { engine:'gemini',voiceId:'achernar',model:'gemini-3.8-flash-tts',speed:1,language:'ko' },
];
for (const voice of cases) test(`${voice.model} acted audio survives attachment and assembly with identical provenance checks`, t => {
  const dir=mkdtempSync(join(tmpdir(),'acted-assembly-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const file=join(dir,'scenes.js'),audio=join(dir,'take.wav');
  const board={SB_DOC:{speechPlanVersion:1,narratorCharacterId:'actor',characters:[{id:'actor',tts:voice}]},SCENES:[{id:'s1',type:'points',narration:[{id:'d1',speaker:'actor',delivery:'voiceover',tts:'괜찮아.',acting:{direction:'reassuring'}}]}]};
  const save=value=>writeFileSync(file,Object.entries(value).map(([k,v])=>`window.${k}=${JSON.stringify(v)};`).join('\n'));
  const read=()=>{const win={};new Function('window',readFileSync(file,'utf8'))(win);return win;};
  save(board);writeFileSync(audio,'fixture spoken audio');writeFileSync(join(dir,'cards.tsv'),'0\ttake.wav\t1\n');
  const state=manageSpeech({path:dir,action:'list'}),plan=manageSpeech({path:dir,action:'plan_audio',lineId:'d1'}).audioPlans[0];
  const generation={generator:plan.generator,text:plan.expectedText,language:'ko',voiceSettings:plan.generation};
  manageSpeech({path:dir,action:'attach_audio',lineId:'d1',expectedRevision:state.revision,audioPath:audio,generation});
  assert.ok(checker.check(dir,dir)[audio]);
  const attached=read(),line=attached.SCENES[0].narration[0];
  assert.equal(line.audio.revision,speechRevision(line,attached.SB_DOC.characters[0]));
  // Updating only the board cannot reuse audio generated for the original performance.
  line.acting.direction='angry';save(attached);
  assert.throws(()=>checker.check(dir,dir),/Dialogue or voice changed/);
  // Even a recomputed revision cannot hide generation arguments for different acting.
  line.audio.revision=speechRevision(line,attached.SB_DOC.characters[0]);save(attached);
  assert.throws(()=>checker.check(dir,dir),/Acting generation differs/);
  // Original board + altered receipt also fails the same shared comparison.
  line.acting.direction='reassuring';line.audio.revision=speechRevision(line,attached.SB_DOC.characters[0]);
  if(voice.engine==='elevenlabs')line.audio.generation.voiceSettings.text='[angry] 괜찮아.';
  else if(voice.model.startsWith('gemini-3.8'))line.audio.generation.voiceSettings.turns[0].style='angry';
  else line.audio.generation.voiceSettings.stylePrompt='warm narrator\nangry';
  save(attached);assert.throws(()=>checker.check(dir,dir),/Acting generation differs/);
});
