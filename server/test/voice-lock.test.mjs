import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
process.env.ELEVENLABS_API_KEY = 'test-key';
const { applyVoiceLock, convertVoice, voiceLockApplySchema, VOICE_LOCK_TOOLS } = await import('../dist/voice-lock.js');
const { voiceLockConfigSchema } = await import('../dist/voice-lock-config.js');
const { pcmToWav } = await import('../dist/media-utils.js');
const ffmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
const SAMPLE_URL = 'https://example.com/voice.wav';
function wav(seconds = 1) {
  const pcm = Buffer.alloc(seconds * 24000 * 2);
  for (let i = 0; i < pcm.length / 2; i++) pcm.writeInt16LE(Math.round(Math.sin(i * 0.1) * 4000), i * 2);
  return pcmToWav(pcm, 24000, 1);
}
test('STS multipart contract, PCM wrapping and no retry on failure', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    calls++;
    assert.match(url, /speech-to-speech\/voice123\?output_format=pcm_24000$/);
    assert.equal(init.headers['Content-Type'], undefined);
    assert.equal(init.body.get('model_id'), 'eleven_multilingual_sts_v2');
    assert.equal(init.body.get('remove_background_noise'), 'true');
    assert.equal(init.body.get('audio').name, 'dialogue.wav');
    return new Response(Buffer.alloc(48000), { headers: { 'request-id': 'trace' } });
  };
  try {
    const out = await convertVoice(wav(), 'voice123', true);
    assert.equal(out.audio.toString('ascii', 0, 4), 'RIFF');
    assert.equal(out.requestId, 'trace');
    globalThis.fetch = async () => { calls++; return new Response('quota', { status: 429 }); };
    await assert.rejects(convertVoice(wav(), 'voice123', true), /429/);
    assert.equal(calls, 2);
  } finally { globalThis.fetch = original; }
});
test('referenceAudioUrl takes absolute http(s) URLs only', () => {
  for (const url of [SAMPLE_URL, 'http://127.0.0.1:3000/voice.wav']) assert.equal(voiceLockConfigSchema.parse({ referenceAudioUrl: url }).referenceAudioUrl, url);
  assert.equal(voiceLockConfigSchema.parse({ referenceAudioUrl: `  ${SAMPLE_URL}  ` }).referenceAudioUrl, SAMPLE_URL);
  for (const url of ['/sample.wav', 'sample.wav', 'data/mina/voice.wav', '/Users/me/voice.wav', 'file:///Users/me/voice.wav', 'example.com/voice.wav'])
    assert.throws(() => voiceLockConfigSchema.parse({ referenceAudioUrl: url }), /absolute http\(s\) URL/, url);
  assert.equal(voiceLockConfigSchema.parse({}).referenceAudioUrl, undefined);
});
for (const scenario of ['pass', 'source-mismatch', 'output-mismatch', 'drift', 'asr-failure', 'api-failure', 'disabled', 'wrong-engine']) {
  test(`voice-lock ${scenario}: artifacts and paid-call boundary`, { skip: !ffmpeg }, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sf-voice-lock-'));
    const sourcePath = join(dir, 'in.wav'); writeFileSync(sourcePath, wav());
    let conversions = 0, transcriptions = 0;
    const input = voiceLockApplySchema.parse({ sourcePath, outputPath: join(dir, 'out'), shotId: 'S01', characterId: 'mina', expectedText: '안녕하세요', inputKind: 'single_speaker', tts: { engine: scenario === 'wrong-engine' ? 'gemini' : 'elevenlabs', voiceId: scenario === 'wrong-engine' ? 'Kore' : 'pinned', language: 'ko', speed: 1, ...(scenario === 'disabled' ? { voiceLock: { enabled: false } } : {}) } });
    try {
      const result = await applyVoiceLock(input, {
        convert: async () => { conversions++; if (scenario === 'api-failure') throw Error('API unavailable'); return { audio: wav(scenario === 'drift' ? 1.5 : 1) }; },
        transcribe: async () => {
          transcriptions++;
          if (scenario === 'asr-failure') throw Error('ASR unavailable');
          return (scenario === 'source-mismatch' && transcriptions === 1) || (scenario === 'output-mismatch' && transcriptions === 2) ? '다른 말' : '안녕하세요';
        },
      });
      assert.equal(result.status, ['pass', 'source-mismatch'].includes(scenario) ? 'passed' : scenario === 'disabled' ? 'skipped' : 'failed');
      assert.equal(conversions, ['disabled', 'wrong-engine', 'asr-failure'].includes(scenario) ? 0 : 1);
      assert.deepEqual(readFileSync(sourcePath), wav());
      assert.equal(JSON.parse(readFileSync(result.reportPath, 'utf8')).status, result.status);
      if (scenario === 'source-mismatch') assert.equal(result.warnings.length, 1);
      if (scenario === 'pass') { assert.equal(result.outputCer, 0); assert.equal(result.sourceDurationSeconds, 1); assert.ok(result.outputSha256); }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}
test('video pass copies the picture stream and preserves input across reruns', { skip: !ffmpeg }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sf-voice-lock-video-'));
  try {
    const audio = join(dir, 'audio.wav'); writeFileSync(audio, wav());
    const video = join(dir, 'source.mp4');
    const made = spawnSync('ffmpeg', ['-v','error','-f','lavfi','-i','color=c=blue:s=64x64:r=24:d=1','-i',audio,'-c:v','libx264','-c:a','aac','-shortest',video]);
    assert.equal(made.status, 0, String(made.stderr));
    const original = readFileSync(video);
    const input = voiceLockApplySchema.parse({ sourcePath:video, outputPath:join(dir,'out'), shotId:'S01', characterId:'mina', expectedText:'안녕하세요', inputKind:'single_speaker', tts:{engine:'elevenlabs',voiceId:'pinned',language:'ko',speed:1} });
    const deps = { convert:async()=>({audio:wav()}), transcribe:async()=> '안녕하세요' };
    const first = await applyVoiceLock(input,deps), second = await applyVoiceLock(input,deps);
    assert.equal(first.status,'passed'); assert.equal(second.status,'passed');
    assert.notEqual(first.reportPath,second.reportPath);
    const pictureHash = file => spawnSync('ffmpeg',['-v','error','-i',file,'-map','0:v:0','-c','copy','-f','hash','-']).stdout.toString();
    assert.equal(pictureHash(first.videoPath),pictureHash(video));
    assert.deepEqual(readFileSync(video),original);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});


test('voice lock requires the complete character sheet and advertises the same contract', () => {
  const args={sourcePath:'in.wav',outputPath:'out',shotId:'S01',characterId:'mina',expectedText:'안녕하세요',inputKind:'single_speaker'};
  const tts={engine:'elevenlabs',voiceId:'pinned',language:'ko',speed:1};
  assert.equal(voiceLockApplySchema.safeParse({...args,tts}).success,true);
  for(const key of ['engine','voiceId','language','speed']) {
    assert.equal(voiceLockApplySchema.safeParse({...args,tts:{...tts,[key]:undefined}}).success,false);
    assert.ok(VOICE_LOCK_TOOLS[0].inputSchema.properties.tts.required.includes(key));
  }
});
