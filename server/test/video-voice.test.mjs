import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { prepareVideoVoice, resolveCharacterVoice } from '../dist/video-voice.js';
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
  return {episode,board:{SB_DOC:{characters}},shot:{id:'s1',narration:lines,visual:{clip:{},video:{speakerBindings:[
    {speaker:'hero',screenPosition:'left',description:'the person in black armor'},
    {speaker:'friend',screenPosition:'right',description:'the person in brown armor'}
  ]}}}};
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
  assert.equal(prepareVideoVoice('astra_genai_text2video',{prompt:'Act.'},ctx).args.prompt,'Act.');
});
test('an adapter without a voice lane refuses spoken cuts; silent narration b-roll still passes',t=>{
  const ctx=fixture(t);
  for (const tool of ['astra_text2video','astra_img2video','astra_genai_img2video','seedance_img2video','ltx_video_generate'])
    for (const setting of [{},{generateAudio:true},{generateAudio:false}])
      assert.throws(()=>prepareVideoVoice(tool,{prompt:'Act.',...setting},ctx),/voice_lane_required/,tool);
  ctx.shot.type='broll';ctx.shot.visual={};ctx.shot.narration.forEach(l=>l.delivery='voiceover');
  assert.throws(()=>prepareVideoVoice('astra_genai_img2video',{prompt:'Act.'},ctx),/voice_lane_required.*generateAudio:false/);
  const silent=prepareVideoVoice('astra_genai_img2video',{prompt:'Act.',generateAudio:false},ctx);
  assert.equal(silent.voiceContinuity.strategy,'external_tts');assert.equal(silent.args.prompt,'Act.');
  assert.equal(videoVoiceCapabilities('astra_genai_img2video').dialogue,'refused');
  assert.equal(videoVoiceCapabilities('seedance_reference').lane,'reference');
});
test('supplied-audio tools keep the prompt and skip native voice guidance',t=>{
  const ctx=fixture(t);
  for (const tool of ['astra_audio2video','astra_genai_audio2video','astra_genai_desktop_audio2video']) {
    const result=prepareVideoVoice(tool,{prompt:'Animate supplied speech.',audio_uri:'data:audio/wav;base64,AA=='},ctx);
    assert.equal(result.voiceContinuity.strategy,'supplied_audio',tool);
    assert.equal(videoVoiceCapabilities(tool).suppliedSpeech,'audio_conditioned_reencoded',tool);
    assert.equal(result.args.prompt,'Animate supplied speech.',tool);
    assert.ok(!result.voiceContinuity.warnings.some(w=>/use audio2video/.test(w)),tool);
  }
});
test('speech identity, acting and reference changes alter the voice revision',t=>{
  const ctx=fixture(t);const input={model:'dreamina-seedance-2-5-260628',prompt:'Act.',generateAudio:true};
  const before=prepareVideoVoice('seedance_reference',input,ctx);
  ctx.shot.narration[0].acting={direction:'quiet question'};
  const after=prepareVideoVoice('seedance_reference',input,ctx);
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

test('MSR resolves an id-only story-first cast from its selected audition and authored image ownership', t => {
  const ctx = fixture(t), folder = path.join(ctx.episode, 'assets/characters/hero');
  fs.mkdirSync(folder, { recursive: true }); fs.writeFileSync(path.join(ctx.episode, 'profile.md'), '# Channel');
  const example = fs.readFileSync(new URL('../../skills/channel/references/character-identity-example.md', import.meta.url), 'utf8');
  const doc = JSON.parse(example.match(/```json\s*\n([\s\S]*?)```/)[1]);
  const audioPath = path.join(folder, 'selected.wav'), imagePath = path.join(folder, 'face.png');
  fs.copyFileSync(ctx.board.SB_DOC.characters[0].voiceReference.path, audioPath);
  fs.writeFileSync(imagePath, 'face'); fs.writeFileSync(path.join(folder, 'voice.wav'), 'old-unselected-voice');
  const auditionPath = path.join(folder, 'audition.json'), sha256 = digest(fs.readFileSync(audioPath));
  doc.tts = tts; doc.voiceSelection = { candidateId: '1', auditionPath, audioSha256: sha256 };
  fs.writeFileSync(auditionPath, JSON.stringify({ candidates: [{ id: '1', tts, audioPath, audioSha256: sha256 }] }));
  fs.writeFileSync(path.join(folder, 'identity.md'), '# Hero\n\n```json\n' + JSON.stringify(doc) + '\n```');
  ctx.board.SB_DOC.characters = [{ id: 'hero', name: 'Hero' }]; ctx.shot.narration.length = 1;
  ctx.shot.visual.video.speakerBindings.length = 1;
  ctx.shot.visual.references = [{ path: imagePath, role: 'character', use: 'both' }];
  const input = { prompt: 'He speaks.', references: [{ imagePath }] };
  const result = prepareVideoVoice('astra_genai_msr', input, { ...ctx, msrVoice: true });
  assert.equal(result.args.references[0].audioPath, audioPath);
  assert.equal(result.voiceContinuity.speakers[0].reference.sha256, sha256);
  assert.match(result.args.prompt, /Audio 1 \(Image 1\): "Hello hero"/);
  assert.doesNotMatch(result.args.prompt, /other characters listen/);
  assert.match(result.args.prompt, /other visible mouths stay closed/);
  assert.deepEqual(ctx.board.SB_DOC.characters, [{ id: 'hero', name: 'Hero' }], 'planning does not rewrite the board');

  ctx.board.SB_DOC.characters[0].tts = { ...tts, voiceId: 'Orus' };
  const override = prepareVideoVoice('astra_genai_msr', input, { ...ctx, msrVoice: true });
  assert.equal(override.voiceContinuity.speakers[0].tts.voiceId, 'Orus');
  assert.equal(override.args.references[0].audioPath, undefined, 'never replace an episode voice with the shared voice');
  delete ctx.board.SB_DOC.characters[0].tts;
  fs.writeFileSync(audioPath, 'changed');
  assert.throws(() => prepareVideoVoice('astra_genai_msr', input, { ...ctx, msrVoice: true }), /sample bytes changed/);
  fs.rmSync(auditionPath);
  const missing = prepareVideoVoice('astra_genai_msr', input, { ...ctx, msrVoice: true });
  assert.equal(missing.args.references[0].audioPath, undefined, 'missing selected evidence cannot fall back to old voice.wav');
  assert.match(missing.voiceContinuity.warnings.join('\n'), /instead of substituting/);
});
test('MSR compiles ordered speaker/image/voice/position bindings and refuses ambiguous embedded scripts', t => {
  const ctx = fixture(t), [hero, friend] = ctx.board.SB_DOC.characters;
  ctx.shot.narration[1].acting = { direction: 'whispering' };
  const input = { prompt: 'They talk.', reserveUsd: 0,
    references: [{ imagePath: friend.voiceReference.imagePaths[0] }, { imagePath: hero.voiceReference.imagePaths[0] }] };
  const { prompt } = prepareVideoVoice('astra_genai_msr', input, { ...ctx, msrVoice: true }).args;
  assert.equal(prompt.split('Hello hero').length, 2);
  assert.match(prompt, /Turn 1: Image 2, hero at SCREEN LEFT \(the person in black armor\) speaks using Audio 2/);
  assert.match(prompt, /Turn 2: Image 1, friend at SCREEN RIGHT .*speaks \(whispering\) using Audio 1/);
  assert.match(prompt, /other visible mouths stay closed/);
  assert.match(prompt, /Audio 1 \(Image 1\): "Hello friend"/);
  for (const words of ['Image 1 says "Hello hero".', 'Friend says "Hello friend" first.', 'A note reads “Hello hero”.'])
    assert.throws(() => prepareVideoVoice('astra_genai_msr', { ...input, prompt: words }, { ...ctx, msrVoice: true }), /video_dialogue_embedded/);
  const unquoted = prepareVideoVoice('astra_genai_msr', { ...input, prompt: 'A title must not contain Hello hero.' }, { ...ctx, msrVoice: true }).args.prompt;
  assert.match(unquoted, /Audio 2 \(Image 2\): "Hello hero"/);
  const before = prepareVideoVoice('astra_genai_msr', input, { ...ctx, msrVoice: true });
  ctx.shot.visual.video.speakerBindings[0].screenPosition = 'center';
  assert.notEqual(before.voiceContinuity.revision, prepareVideoVoice('astra_genai_msr', input, { ...ctx, msrVoice: true }).voiceContinuity.revision);
  ctx.shot.visual.video.speakerBindings[0].screenPosition = 'right';
  assert.throws(() => prepareVideoVoice('astra_genai_msr', input, ctx), /video_speaker_binding_invalid/);
  delete ctx.shot.visual.video.speakerBindings;
  assert.throws(() => prepareVideoVoice('astra_genai_msr', input, ctx), /video_speaker_binding_required/);
});
test('MSR voices a speaker it cannot sample from the prompt and refuses the retired voice mode', t => {
  const ctx = fixture(t), [hero, friend] = ctx.board.SB_DOC.characters;
  const extra = path.join(ctx.episode, 'extra.png'); fs.writeFileSync(extra, 'image-extra');
  const input = { prompt: 'They talk.', reserveUsd: 0,
    references: [{ imagePath: friend.voiceReference.imagePaths[0] }, { imagePath: extra }, { imagePath: hero.voiceReference.imagePaths[0] }] };
  const third = prepareVideoVoice('astra_genai_msr', input, { ...ctx, msrVoice: true });
  assert.deepEqual(third.args.references.map(ref => ref.audioPath), [friend.voiceReference.path, undefined, undefined]);
  assert.match(third.voiceContinuity.warnings.join('\n'), /hero: MSR subject 3 takes no sample/);
  assert.match(third.args.prompt, /Image 3, hero at SCREEN LEFT .* speaks\./);
  assert.match(third.args.prompt, /Image 3: "Hello hero"/);
  ctx.shot.narration[1].tts = '문 닫아';
  assert.match(prepareVideoVoice('astra_genai_msr', input, { ...ctx, msrVoice: true }).voiceContinuity.warnings.join('\n'), /captions were English/);
  const unsupported = prepareVideoVoice('astra_genai_msr', input, { ...ctx, msrVoice: false });
  assert.ok(unsupported.args.references.every(ref => ref.audioPath === undefined));
  const silent = prepareVideoVoice('astra_genai_msr', input, { ...ctx, shot: { ...ctx.shot, narration: [] }, msrVoice: false });
  assert.match(silent.args.prompt, /^They talk\.\n\nKeep the entire video image text-free:/);
  ctx.shot.narration[0].delivery = 'voiceover';
  const voiceover = prepareVideoVoice('astra_genai_msr', input, { ...ctx, msrVoice: true });
  assert.match(voiceover.args.prompt, /hero speaks in voiceover/);
  assert.doesNotMatch(voiceover.args.prompt, /Image 3 speaks with visible lip movement/);
  ctx.shot.visual.video = { voice: 'prompt' };
  assert.throws(() => prepareVideoVoice('astra_genai_msr', input, { ...ctx, msrVoice: true }), /retired/);
});
test('MSR leaves the text-free policy after compiled dialogue, including silent shots', t => {
  const ctx = fixture(t), [hero, friend] = ctx.board.SB_DOC.characters;
  const input = { prompt: 'They talk.', references: [hero, friend].map(c => ({ imagePath: c.voiceReference.imagePaths[0] })) };
  const spoken = prepareVideoVoice('astra_genai_msr', input, { ...ctx, msrVoice: true }).args.prompt;
  assert.ok(spoken.lastIndexOf('Keep the entire video image text-free:') > spoken.indexOf('"Hello friend"'));
  assert.match(spoken, /including during speech\.$/);
  const silent = prepareVideoVoice('astra_genai_msr', input, { ...ctx, shot: { ...ctx.shot, narration: [] } }).args.prompt;
  assert.match(silent, /no subtitles, captions/);
  assert.match(silent, /including during speech\.$/);
});
test('MSR keeps a phone caller off screen without borrowing the visible listener voice', t => {
  const ctx = fixture(t), [hero, friend] = ctx.board.SB_DOC.characters;
  ctx.shot.visual = { video: {} };
  ctx.shot.narration[1].delivery = 'off_screen';
  const result = prepareVideoVoice('astra_genai_msr', { prompt: 'Hero listens to the phone.',
    references: [{ imagePath: hero.voiceReference.imagePaths[0] }] }, { ...ctx, msrVoice: true });
  assert.equal(result.args.references[0].audioPath, hero.voiceReference.path);
  assert.match(result.args.prompt, /friend speaks off screen\. Do not show this speaker or animate any visible mouth during this line\. friend: "Hello friend"/);
  assert.equal(result.voiceContinuity.speakers.find(s => s.speaker === friend.id).reference, undefined);
  assert.match(result.voiceContinuity.warnings.join(), /friend: no MSR subject image matches/);
  ctx.shot.narration = [ctx.shot.narration[1]];
  const only = prepareVideoVoice('astra_genai_msr', { prompt: 'Hero listens.', references: [] }, { ...ctx, msrVoice: true });
  assert.equal(only.voiceContinuity.strategy, 'reference_voice');
  assert.match(only.args.prompt, /friend speaks off screen/);
});

test('declared MSR cast maps pinned voices to canonical faces instead of stale transport aliases',t=>{
 const ctx=fixture(t),characters=ctx.board.SB_DOC.characters;
 fs.mkdirSync(path.join(ctx.episode,'storyboard'));
 fs.writeFileSync(path.join(ctx.episode,'storyboard/cast.json'),JSON.stringify({characters:characters.map(c=>({id:c.id,source:'../assets/characters/'+c.id+'/identity.md'}))}));
 const references=[];
 for(const c of characters){
  const folder=path.join(ctx.episode,'assets/characters',c.id);fs.mkdirSync(folder,{recursive:true});const panels={};
  for(const view of ['face','front','back']){const file=view+'.png';fs.writeFileSync(path.join(folder,file),'panel');panels[view]={file,view,purpose:'character_reference'};}
  fs.writeFileSync(path.join(folder,'panels.json'),JSON.stringify({schemaVersion:1,panels}));
  c.voiceReference.imagePaths=[path.join(ctx.episode,'deleted-transport-'+c.id+'.jpg')];
  references.push({imagePath:path.join(folder,'face.png')});
 }
 ctx.shot.visual.character=characters.map(c=>c.id);ctx.msrVoice=true;
 const result=prepareVideoVoice('astra_genai_msr',{prompt:'Exchange.',references},ctx);
 assert.deepEqual(result.voiceContinuity.speakers.map(s=>s.imageIndices),[[1],[2]]);
 assert.deepEqual(result.args.references.map(r=>r.audioPath),characters.map(c=>c.voiceReference.path));
});

test('legacy MSR cast keeps explicit voice ownership without requiring shared panels',t=>{
 const ctx=fixture(t),characters=ctx.board.SB_DOC.characters;
 ctx.shot.visual.character=characters.map(c=>c.id);
 const result=prepareVideoVoice('astra_genai_msr',{prompt:'Exchange.',references:characters.map(c=>({imagePath:c.voiceReference.imagePaths[0]}))},{...ctx,msrVoice:true});
 assert.deepEqual(result.args.references.map(r=>r.audioPath),characters.map(c=>c.voiceReference.path));
});

test('id-only voice-only speakers resolve pinned speech with pending body details',t=>{
 const ctx=fixture(t),folder=path.join(ctx.episode,'assets/characters/caller');
 fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(ctx.episode,'profile.md'),'# Channel');
 const example=fs.readFileSync(new URL('../../skills/channel/references/character-identity-example.md',import.meta.url),'utf8');
 const doc=JSON.parse(example.match(/```json\s*\n([\s\S]*?)```/)[1]);doc.tts=tts;
 doc.character.identity.age={status:'pending',reason:'Voice-only role',value:null};
 doc.character.physical.heightCm={status:'pending',reason:'Voice-only role',value:null};
 fs.writeFileSync(path.join(folder,'identity.md'),'# Caller\n\n```json\n'+JSON.stringify(doc)+'\n```');
 const warnings=[],resolved=resolveCharacterVoice({id:'caller',voiceOnly:true},ctx,warnings);
 assert.deepEqual(resolved.tts,tts);
 assert.deepEqual(warnings,[]);
});
