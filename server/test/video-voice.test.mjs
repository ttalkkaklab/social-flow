import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { prepareVideoVoice } from '../dist/video-voice.js';
import { videoVoiceCapabilities } from '../dist/video-registry.js';

const tts = { engine:'gemini', model:'gemini-2.5-flash-preview-tts', voiceId:'Kore', language:'ko', speed:1, voiceDirection:'Low dry voice, Seoul accent.' };
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function fixture(t) {
  const episode = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'sf-video-voice-')));
  t.after(()=>fs.rmSync(episode,{recursive:true,force:true}));
  const characters = ['hero','friend'].map((id,i)=> {
    const audioPath=path.join(episode,`${id}.wav`), imagePath=path.join(episode,`${id}.png`);
    fs.writeFileSync(audioPath,`voice-${id}`); fs.writeFileSync(imagePath,`image-${id}`);
    const voice={...tts,voiceId:i?'Puck':'Kore'};
    return {id,name:id,tts:voice,voiceReference:{path:audioPath,sha256:digest(fs.readFileSync(audioPath)),tts:voice,imagePaths:[imagePath]}};
  });
  const lines=characters.map(c=>({id:'line-'+c.id,speaker:c.id,tts:'Hello '+c.id,delivery:'on_screen'}));
  return {episode,board:{SB_DOC:{characters}},shot:{id:'s1',narration:lines,visual:{clip:{}}}};
}
test('Seedance maps speakers to existing audio order and explicit image ownership without rewriting dialogue',t=>{
  const ctx=fixture(t),[hero,friend]=ctx.board.SB_DOC.characters;
  const input={model:'dreamina-seedance-2-5-260628',prompt:'The friends exchange their authored lines.',generateAudio:true,
    referenceAudioPaths:[friend.voiceReference.path],referenceImagePaths:[friend.voiceReference.imagePaths[0],hero.voiceReference.imagePaths[0]]};
  const result=prepareVideoVoice('seedance_reference',input,ctx);
  assert.deepEqual(input.referenceAudioPaths,[friend.voiceReference.path]);
  assert.deepEqual(result.args.referenceAudioPaths,[friend.voiceReference.path,hero.voiceReference.path]);
  assert.match(result.args.prompt,/hero.*@Image 2.*@Audio 2/);
  assert.match(result.args.prompt,/friend.*@Image 1.*@Audio 1/);
  assert.match(result.args.prompt,/timbre and accent only/);
  assert.equal(result.voiceContinuity.strategy,'reference_voice');
  assert.equal(result.voiceContinuity.review.voiceIdentity,'not_reviewed');
  assert.equal(result.voiceContinuity.speakers[0].tts.voiceId,'Kore');
  assert.doesNotMatch(result.args.prompt,/voice ID.*Kore|voice.*Puck/);
});
test('2.0 references use their own syntax; missing samples produce honest warnings',t=>{
  const ctx=fixture(t);delete ctx.board.SB_DOC.characters[1].voiceReference;
  const result=prepareVideoVoice('seedance_reference',{model:'dreamina-seedance-2-0-fast-260128',prompt:'Act.',generateAudio:true},ctx);
  assert.match(result.args.prompt,/uses Audio 1/);assert.doesNotMatch(result.args.prompt,/@Audio/);
  assert.match(result.voiceContinuity.warnings.join('\n'),/friend: no pinned voice sample/);
});
test('changed sample bytes and episode voice overrides cannot silently reuse a different voice',t=>{
  const ctx=fixture(t),input={model:'dreamina-seedance-2-5-260628',prompt:'Act.',generateAudio:true};
  ctx.board.SB_DOC.characters[0].tts={...tts,voiceId:'Orus'};
  assert.throws(()=>prepareVideoVoice('seedance_reference',input,ctx),/different pinned TTS/);
  ctx.board.SB_DOC.characters[0].tts=tts;
  fs.writeFileSync(ctx.board.SB_DOC.characters[0].voiceReference.path,'changed');
  assert.throws(()=>prepareVideoVoice('seedance_reference',input,ctx),/sample bytes changed/);
});
test('silent backgrounds and voiceovers do not gain paid references or fabricated native speech',t=>{
  const ctx=fixture(t);ctx.shot.visual={video:{}};ctx.shot.narration.forEach(l=>l.delivery='voiceover');
  const result=prepareVideoVoice('seedance_reference',{model:'dreamina-seedance-2-5-260628',prompt:'Act.',generateAudio:false},ctx);
  assert.equal(result.args.prompt,'Act.');assert.equal(result.args.referenceAudioPaths,undefined);
  assert.equal(result.voiceContinuity.strategy,'external_tts');
  assert.equal(prepareVideoVoice('veo_text2video',{prompt:'Act.'},ctx).args.prompt,'Act.');
});
test('ASTRA native audio defaults on while explicit silence and supplied speech keep their contracts',t=>{
  const ctx=fixture(t);
  for (const tool of ['astra_text2video','astra_img2video','astra_keyframe_video','astra_ic_lora','astra_video_retake']) {
    for (const setting of [{},{generateAudio:true},{generateAudio:false}]) {
      const result=prepareVideoVoice(tool,{prompt:'Act.',...setting},ctx);
      assert.equal(result.voiceContinuity.strategy,setting.generateAudio===false?'external_tts':'prompt_voice');
      if (setting.generateAudio===false) assert.equal(result.args.prompt,'Act.');
      else assert.match(result.args.prompt,/Low dry voice, Seoul accent/);
      assert.equal(result.args.generateAudio,setting.generateAudio);
    }
  }
});
test('ASTRA preserves the audio-first prompt; exact waveform and lip-sync claims stay separate',t=>{
  const ctx=fixture(t);const result=prepareVideoVoice('astra_audio2video',{prompt:'Animate supplied speech.',audioUploadId:'a'},ctx);
  assert.equal(result.args.prompt,'Animate supplied speech.');assert.equal(result.voiceContinuity.strategy,'supplied_audio');
  assert.equal(videoVoiceCapabilities('astra_audio2video').suppliedSpeech,'audio_conditioned_reencoded');
  assert.equal(videoVoiceCapabilities('astra_text2video').suppliedSpeech,'unsupported');
  assert.equal(videoVoiceCapabilities('astra_audio2video').exactAudioPreservation,false);
});
test('both supplied-audio tools keep the prompt and skip native voice guidance',t=>{
  const ctx=fixture(t);
  for (const tool of ['astra_audio2video','astra_genai_audio2video']) {
    const result=prepareVideoVoice(tool,{prompt:'Animate supplied speech.',audio_uri:'data:audio/wav;base64,AA=='},ctx);
    assert.equal(result.voiceContinuity.strategy,'supplied_audio',tool);
    assert.equal(result.args.prompt,'Animate supplied speech.',tool);
    assert.ok(!result.voiceContinuity.warnings.some(w=>/use audio2video/.test(w)),tool);
  }
});
test('Veo adds stable identity but not TTS selectors; Omni rejects uploaded spoken extension',t=>{
  const ctx=fixture(t);
  const veo=prepareVideoVoice('veo_extension',{prompt:'Continue the dialogue.'},ctx);
  assert.match(veo.args.prompt,/Low dry voice, Seoul accent/);
  assert.match(veo.voiceContinuity.warnings.join(),/last second/);
  assert.equal(veo.args.seed,undefined);assert.equal(veo.args.referenceAudioPaths,undefined);
  assert.throws(()=>prepareVideoVoice('omni_extend',{prompt:'Continue.',sourceVideoPath:'video.mp4'},ctx),/previousInteractionId/);
  const omni=prepareVideoVoice('omni_extend',{prompt:'Continue.',previousInteractionId:'stored-id',seed:7},ctx);
  assert.equal(omni.args.previousInteractionId,'stored-id');assert.equal(omni.args.seed,7);
  assert.match(omni.voiceContinuity.warnings.join(),/Flow @Voice/);
});
test('speech identity, acting and reference changes alter the voice revision',t=>{
  const ctx=fixture(t);const input={prompt:'Act.'};
  const before=prepareVideoVoice('veo_text2video',input,ctx);
  ctx.shot.narration[0].acting={direction:'quiet question'};
  const after=prepareVideoVoice('veo_text2video',input,ctx);
  assert.notEqual(before.voiceContinuity.revision,after.voiceContinuity.revision);
  assert.equal(before.args.prompt,after.args.prompt,'scene acting must not overwrite stable identity');
});
test('Korean cast metadata does not break the 2.0 English/Chinese direction contract',t=>{
  const ctx=fixture(t);ctx.board.SB_DOC.characters[0].name='민재';ctx.board.SB_DOC.characters[0].tts={...tts,voiceDirection:'낮고 차분한 목소리'};
  ctx.board.SB_DOC.characters[0].voiceReference.tts=ctx.board.SB_DOC.characters[0].tts;
  const result=prepareVideoVoice('seedance_reference',{model:'dreamina-seedance-2-0-260128',prompt:'The friends talk.',generateAudio:true},ctx);
  assert.doesNotMatch(result.args.prompt,/[가-힣]/);assert.match(result.args.prompt,/hero.*Audio 1/);
  assert.match(result.voiceContinuity.speakers[0].description,/낮고/);
  assert.match(result.voiceContinuity.warnings.join(),/translation/);
});
test('broll off-screen native dialogue receives the same speaker references',t=>{
  const ctx=fixture(t);ctx.shot.visual={};ctx.shot.type='broll';ctx.shot.narration.forEach(l=>l.delivery='off_screen');
  const result=prepareVideoVoice('seedance_reference',{model:'dreamina-seedance-2-5-260628',prompt:'The friends talk.',generateAudio:true},ctx);
  assert.equal(result.args.referenceAudioPaths.length,2);assert.equal(result.voiceContinuity.strategy,'reference_voice');
});
test('missing selected audition evidence warns without substituting an older sample or blocking TTS',t=>{
  const ctx=fixture(t);delete ctx.board.SB_DOC.characters[0].voiceReference;
  ctx.board.SB_DOC.characters[0].voiceReferenceWarning='Audition manifest is missing';
  const native=prepareVideoVoice('seedance_reference',{model:'dreamina-seedance-2-5-260628',prompt:'Act.',generateAudio:true},ctx);
  assert.equal(native.args.referenceAudioPaths.length,1);assert.match(native.voiceContinuity.warnings.join(),/instead of substituting/);
  const external=prepareVideoVoice('astra_audio2video',{prompt:'Use supplied speech.',audioUploadId:'a'},ctx);
  assert.equal(external.args.prompt,'Use supplied speech.');
});

test('FastH3 native voices use Picture and Audio labels without exact lip-sync claims', t => {
  const ctx=fixture(t), [hero,friend]=ctx.board.SB_DOC.characters;
  const result=prepareVideoVoice('fasth3_omni_reference', {prompt:'Act.', referenceImagePaths:[hero.voiceReference.imagePaths[0],friend.voiceReference.imagePaths[0]]},ctx);
  assert.equal(result.voiceContinuity.strategy,'reference_voice');
  assert.match(result.args.prompt,/hero.*<Picture 1>.*<Audio 1>/);
  assert.match(result.args.prompt,/friend.*<Picture 2>.*<Audio 2>/);
  assert.equal(videoVoiceCapabilities('fasth3_omni_reference').exactAudioPreservation,false);
});
test('MSR attaches each pinned sample to the subject that shows its speaker', t => {
  const ctx = fixture(t), [hero, friend] = ctx.board.SB_DOC.characters;
  const input = { prompt: 'They talk.', reserveUsd: 0,
    references: [{ imagePath: friend.voiceReference.imagePaths[0] }, { imagePath: hero.voiceReference.imagePaths[0] }] };
  const result = prepareVideoVoice('astra_genai_msr', input, { ...ctx, msrVoice: true });
  assert.equal(input.references[0].audioPath, undefined);
  assert.deepEqual(result.args.references.map(ref => ref.audioPath), [friend.voiceReference.path, hero.voiceReference.path]);
  assert.match(result.args.prompt, /^Audio 1: friend's voice, belongs only to Image 1\.\nAudio 2: hero's voice, belongs only to Image 2\.\nThey talk\./);
  assert.equal(result.args.referenceAudioPaths, undefined);
  assert.equal(result.voiceContinuity.strategy, 'reference_voice');
  assert.equal(videoVoiceCapabilities('astra_genai_msr').voiceReference, 'backend_dependent');
});
test('MSR writes each authored line into the prompt once, with its speaker image', t => {
  const ctx = fixture(t), [hero, friend] = ctx.board.SB_DOC.characters;
  ctx.shot.narration[1].acting = { direction: 'whispering' };
  const input = { prompt: 'They talk. Hero says "Hello hero".', reserveUsd: 0,
    references: [{ imagePath: friend.voiceReference.imagePaths[0] }, { imagePath: hero.voiceReference.imagePaths[0] }] };
  const { prompt } = prepareVideoVoice('astra_genai_msr', input, { ...ctx, msrVoice: true }).args;
  assert.equal(prompt.split('Hello hero').length, 2);
  assert.match(prompt, /Image 1 speaks \(whispering\) with visible lip movement synchronized with Audio 1 while the other characters listen silently with their lips closed\. Audio 1 \(Image 1\): "Hello friend"/);
});
test('MSR voices a speaker it cannot sample from the prompt; voiceover and the retired voice mode are refused', t => {
  const ctx = fixture(t), [hero, friend] = ctx.board.SB_DOC.characters;
  const extra = path.join(ctx.episode, 'extra.png'); fs.writeFileSync(extra, 'image-extra');
  const input = { prompt: 'They talk.', reserveUsd: 0,
    references: [{ imagePath: friend.voiceReference.imagePaths[0] }, { imagePath: extra }, { imagePath: hero.voiceReference.imagePaths[0] }] };
  const third = prepareVideoVoice('astra_genai_msr', input, { ...ctx, msrVoice: true });
  assert.deepEqual(third.args.references.map(ref => ref.audioPath), [friend.voiceReference.path, undefined, undefined]);
  assert.match(third.voiceContinuity.warnings.join('\n'), /hero: MSR subject 3 takes no sample/);
  assert.match(third.args.prompt, /Image 3 speaks with visible lip movement while the other characters listen silently with their lips closed\. Image 3: "Hello hero"/);
  ctx.shot.narration[1].tts = '문 닫아';
  assert.match(prepareVideoVoice('astra_genai_msr', input, { ...ctx, msrVoice: true }).voiceContinuity.warnings.join('\n'), /captions were English/);
  const unsupported = prepareVideoVoice('astra_genai_msr', input, { ...ctx, msrVoice: false });
  assert.ok(unsupported.args.references.every(ref => ref.audioPath === undefined));
  const silent = prepareVideoVoice('astra_genai_msr', input, { ...ctx, shot: { ...ctx.shot, narration: [] }, msrVoice: false });
  assert.equal(silent.args.prompt, 'They talk.');
  ctx.shot.narration[0].delivery = 'voiceover';
  assert.throws(() => prepareVideoVoice('astra_genai_msr', input, { ...ctx, msrVoice: true }), /msr_dialogue_required/);
  ctx.shot.visual.video = { voice: 'prompt' };
  assert.throws(() => prepareVideoVoice('astra_genai_msr', input, { ...ctx, msrVoice: true }), /retired/);
});
