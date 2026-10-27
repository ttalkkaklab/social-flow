import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { prepareVideoSound } from '../dist/video-sound.js';
const require = createRequire(import.meta.url);
const { prepare } = require('../../skills/produce/references/prepare-source-audio.js');
const compiler = new URL('../../skills/produce/references/compile-sound-plan.js', import.meta.url).pathname;
const intent = { effects: [{ id: 'hangup', delivery: 'auto', description: 'Short Bakelite clack', trigger: 'When receiver contacts cradle, once' }] };

test('model/mode routing validates adapter payloads and preserves explicit flags and legacy cues', () => {
  for (const tool of ['veo_text2video', 'omni_text2video', 'seedance_text2video', 'astra_text2video']) {
    const p = prepareVideoSound(tool, { prompt: 'Man hangs up.' }, intent);
    assert.equal(p.sound.effects[0].delivery, 'native', tool);
    assert.equal(p.sound.audioSource, 'video');
    assert.match(p.arguments.prompt, /Bakelite clack/);
    assert.equal(p.generated, false);
    if (/seedance|astra/.test(tool)) assert.equal(p.arguments.generateAudio, true);
  }
  const a2v = prepareVideoSound('astra_audio2video', { prompt: 'Man hangs up.', audioPath: '/tmp/voice.wav' }, intent);
  assert.equal(a2v.sound.effects[0].delivery, 'post');
  assert.doesNotMatch(a2v.arguments.prompt, /Bakelite/);
  const silent = prepareVideoSound('seedance_text2video', { prompt: 'Man hangs up.', model: 'seedance-1-0-pro-250528' }, intent);
  assert.equal(silent.sound.effects[0].delivery, 'post');
  assert.equal(prepareVideoSound('seedance_text2video', { prompt: 'Man', generateAudio: false }, intent).sound.effects[0].delivery, 'post');
  assert.equal(prepareVideoSound('seedance_text2video', { prompt: 'Man' }, { effects: [{ sfx: 'old' }] }).arguments.generateAudio, false);
  assert.equal(prepareVideoSound('veo_text2video', { prompt: 'Man' }, { ...intent, audioSource: 'speech' }).sound.effects[0].delivery, 'post');
  assert.throws(() => prepareVideoSound('astra_audio2video', { prompt: 'Man', audioPath: '/tmp/a.wav' }, { effects: [{ ...intent.effects[0], delivery: 'native' }] }), /Native SFX/);
  assert.throws(() => prepareVideoSound('veo_text2video', { prompt: 'Man' }, { effects: [{ ...intent.effects[0], delivery: 'input' }] }), /Input SFX/);
  assert.throws(() => prepareVideoSound('veo_text2video', { prompt: 'Man', fakeOption: 1 }, intent), /Unsupported/);
  assert.throws(() => prepareVideoSound('seedance_text2video', { prompt: 'Man', model: 'future-model' }, intent), /Unknown/);
  assert.throws(() => prepareVideoSound('veo_text2video', {}, intent));
  assert.throws(() => prepareVideoSound('seedance_text2video', {prompt:'Man',generateAudio:false}, {audioSource:'video',effects:[]}), /silent output/);
  for (const effects of [[], [{delivery:'post',sfx:'click',atSeconds:1}]]) {
    const retained = prepareVideoSound('seedance_text2video', {prompt:'Man'}, {audioSource:'video',effects});
    assert.equal(retained.arguments.generateAudio,true,'explicit source soundtrack overrides only the silent default, including post-only and empty plans');
    assert.throws(() => prepareVideoSound('seedance_text2video', {prompt:'Man',generateAudio:false}, {audioSource:'video',effects}), /silent output/);
    assert.throws(() => prepareVideoSound('seedance_text2video', {prompt:'Man',model:'seedance-1-0-pro-250528'}, {audioSource:'video',effects}), /silent output/);
  }
  assert.throws(() => prepareVideoSound('veo_text2video', {prompt:'Man. Audio: silent'}, intent), /conflict/);
  assert.throws(() => prepareVideoSound('veo_text2video', {prompt:'Man'}, {effects:[intent.effects[0],intent.effects[0]]}), /unique/);
  const once = prepareVideoSound('veo_text2video', {prompt:'Man'}, intent);
  assert.equal(prepareVideoSound('veo_text2video', once.arguments, once.sound).arguments.prompt, once.arguments.prompt);
});

test('real audio extraction preserves source samples once, compiler omits native/input and rejects unresolved post', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sf-source-sound-'));
  try {
    const board = join(dir, 'storyboard'); mkdirSync(board);
    const video = join(dir, 'source.mp4');
    execFileSync('ffmpeg', ['-v','error','-f','lavfi','-i','color=black:size=64x64:rate=24:duration=2', '-f','lavfi','-i',"aevalsrc=if(between(t\\,1\\,1.1)\\,0.15*sin(2*PI*800*t)\\,0):s=48000:d=2", '-c:v','libx264','-c:a','aac','-shortest',video]);
    const sound = { audioSource: 'video', effects: [{ ...intent.effects[0], delivery: 'native' }] };
    const save = () => writeFileSync(join(board, 'scenes.js'), `window.SCENES=${JSON.stringify([{id:'s1',duration:2,sound}])};`);
    save(); writeFileSync(join(dir,'cards.tsv'),'0\told.wav\t1\tnone\n');
    writeFileSync(join(dir,'segs.tsv'),`0\t0\t${video}\t\t\n`);
    const evidence = prepare(dir, board);
    assert.equal(evidence.length,1);
    assert.match(readFileSync(join(dir,'cards.tsv'),'utf8'), /\.source-audio\/.*\.wav.*sync=1/);
    const expected = execFileSync('ffmpeg',['-v','error','-i',video,'-map','0:a:0','-ar','48000','-ac','2','-t','2','-f','s16le','-']);
    const actual = execFileSync('ffmpeg',['-v','error','-i',evidence[0].audio,'-f','s16le','-']);
    assert.deepEqual(actual, expected);
    prepare(dir, board); // Repeated assembly cannot layer another copy.
    assert.equal(readFileSync(join(dir,'cards.tsv'),'utf8').match(/sync=1/g).length, 1);
    const run = () => spawnSync(process.execPath,[compiler,join(board,'scenes.js'),dir,dir],{encoding:'utf8'});
    assert.equal(run().status,0);
    assert.equal(existsSync(join(dir,'sfx.tsv')),false);
    sound.effects[0].delivery='input';save();assert.equal(run().status,0);
    sound.effects[0].delivery='post';save();assert.notEqual(run().status,0);
    sound.effects[0].delivery='native';sound.audioSource='speech';save();assert.notEqual(run().status,0);
    prepare(dir, board); assert.match(readFileSync(join(dir,'cards.tsv'),'utf8'), /old.wav/);
    assert.doesNotMatch(readFileSync(join(dir,'cards.tsv'),'utf8'), /sync=1/);
    sound.audioSource='video';save();prepare(dir,board);
    const composed=readFileSync(join(dir,'cards.tsv'),'utf8').replace(/\.source-audio\/[^\t]+/, 'new-speech.wav');
    writeFileSync(join(dir,'cards.tsv'),composed);sound.audioSource='speech';save();prepare(dir,board);
    assert.match(readFileSync(join(dir,'cards.tsv'),'utf8'), /new-speech.wav/);
    assert.doesNotMatch(readFileSync(join(dir,'cards.tsv'),'utf8'), /sync=1/);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

test('native ownership rejects unmanaged and edited manifests without changing bytes; owned stale cues are removed', () => {
  const dir=mkdtempSync(join(tmpdir(),'sf-sound-owner-'));
  try {
    const source=join(dir,'scenes.js'), manifest=join(dir,'sfx.tsv');
    const write=effects=>writeFileSync(source,`window.SCENES=${JSON.stringify([{id:'s1',duration:3,sound:{audioSource:'video',effects}}])};`);
    const run=()=>spawnSync(process.execPath,[compiler,source,dir,dir],{encoding:'utf8'});
    const row='0\t0\tmanual.wav\ton\t1\t6\n';
    for(const delivery of ['native','input']) {
      write([{delivery,description:'clack',trigger:'contact'}]);
      writeFileSync(manifest,row);
      assert.notEqual(run().status,0);assert.equal(readFileSync(manifest,'utf8'),row);
    }
    rmSync(manifest);mkdirSync(join(dir,'assets/audio/sfx'),{recursive:true});
    execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','sine=duration=0.2',join(dir,'assets/audio/sfx/click.wav')]);
    write([{delivery:'post',sfx:'click',atSeconds:1}]);assert.equal(run().status,0);
    const owned=readFileSync(manifest,'utf8');
    writeFileSync(manifest,owned+row);write([{delivery:'native'}]);
    assert.notEqual(run().status,0);assert.equal(readFileSync(manifest,'utf8'),owned+row);
    writeFileSync(manifest,owned);assert.equal(run().status,0);assert.equal(existsSync(manifest),false);
    writeFileSync(source,'window.SCENES=[{id:"legacy"}];');writeFileSync(manifest,row);
    assert.equal(run().status,0);assert.equal(readFileSync(manifest,'utf8'),row);
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('complete builder keeps post SFX audible when the retained source is silent', () => {
  const dir=mkdtempSync(join(tmpdir(),'sf-silent-post-'));
  const root=new URL('../../',import.meta.url).pathname;
  try {
    execFileSync(process.execPath,[join(root,'server/test/installed-video-sound-smoke.mjs'),root,dir],{stdio:'pipe',timeout:120000});
    execFileSync(process.execPath,[join(root,'server/test/installed-post-sound-smoke.mjs'),root,dir,join(dir,'silent.json'),'--silent'],{stdio:'pipe',timeout:120000});
    const receipt=JSON.parse(readFileSync(join(dir,'silent.json'),'utf8'));
    assert.equal(receipt.silent,true);assert.ok(receipt.postRms>.001);assert.ok(receipt.beforePostRms<.0001);
  } finally {rmSync(dir,{recursive:true,force:true});}
});
