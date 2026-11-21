import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const compiler = fileURLToPath(new URL('../../skills/produce/references/compile-sound-plan.js', import.meta.url));
const roots = [];
afterEach(() => { while (roots.length) rmSync(roots.pop(), { recursive: true, force: true }); });

function room() {
  const root = mkdtempSync(join(tmpdir(), 'sound-plan-'));
  roots.push(root);
  const board = join(root, 'storyboard'), work = join(root, '.work'), channel = join(root, 'channel');
  mkdirSync(board); mkdirSync(work); mkdirSync(join(channel, 'assets/audio/sfx'), { recursive: true });
  mkdirSync(join(channel, 'assets/audio/bgm'), { recursive: true });
  return { root, board, work, channel };
}
function run(paths) {
  return spawnSync(process.execPath, [compiler, join(paths.board, 'scenes.js'), paths.work, paths.channel], { encoding: 'utf8' });
}

describe('compile-sound-plan', () => {
  it('reports a missing audience cue even when there are no sound manifests to compile', async () => {
    const { spottingDigest } = (await import('../../skills/storyboard/references/audience-effects.js')).default;
    const p = room(), board = {
      STORY: { audienceSoundVersion: 1 },
      STRUCTURE: { scenes: [{ no: 1, audienceSound: { decision: 'use', reason: 'A familiar face stops smiling.' } }] },
      SCENES: [{ id: 's0001', scene: 1, type: 'cover' }],
    };
    writeFileSync(join(p.board, 'scenes.js'), Object.entries(board).map(([key, value]) =>
      'window.' + key + '=' + JSON.stringify(value) + ';').join('\n'));
    const result = run(p);
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.warnings.length, 1);
    assert.deepEqual(output.warnings, spottingDigest(board));
    assert.equal(existsSync(join(p.work, 'sfx-spans.json')), false);
  });

  it('reports a scene with no music decision and a cue file this episode never generated, and still compiles', () => {
    const p = room();
    writeFileSync(join(p.work, 'bgm-tense.wav'), 'copied from another episode');
    writeFileSync(join(p.board, 'scenes.js'), `window.STORY={authoring:"story-first"};
window.STRUCTURE={sequences:[{id:"q1",scenes:[1,2]}],scenes:[{no:1,music:{decision:"score",reason:"r",span:"a"}},{no:2}]};
window.MUSIC={tense:{prompt:"low strings"},$timeline:[{id:"a",cue:"tense",start:{shotId:"s0001",atSeconds:0},end:{shotId:"s0001",atSeconds:"end"}}]};
window.SCENES=[{id:"s0001",type:"points",scene:1},{id:"s0002",type:"points",scene:2}];\n`);
    let result = run(p);
    assert.equal(result.status, 0, result.stderr);
    let { warnings } = JSON.parse(result.stdout);
    assert.equal(warnings.length, 2, JSON.stringify(warnings));
    assert.match(warnings[0], /1 scene\(s\) have no music decision \(scenes 2\)/);
    assert.match(warnings[1], /music cue "tense".*no generation receipt in this episode/);
    // The same bytes with a music_execute receipt in this episode are this episode's cue.
    mkdirSync(join(p.work, 'music-routing'));
    writeFileSync(join(p.work, 'music-routing/state.json'), JSON.stringify({ jobs: { a: { output: {
      sha256: createHash('sha256').update('copied from another episode').digest('hex') } } } }));
    result = run(p); ({ warnings } = JSON.parse(result.stdout));
    assert.equal(warnings.length, 1, JSON.stringify(warnings));
    assert.match(warnings[0], /no music decision/);
  });

  it('keeps markerless legacy manifests byte-identical', () => {
    const p = room();
    writeFileSync(join(p.board, 'scenes.js'), 'window.SCENES=[{type:"cover"}];\n');
    for (const file of ['bgm.tsv', 'sfx.tsv', 'amb.tsv', 'silence.tsv', 'sound.env'])
      writeFileSync(join(p.work, file), 'stale\n');
    const result = run(p);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { changed: false, reason: 'no extended sound fields', removed: [], warnings: [] });
    for (const file of ['bgm.tsv', 'sfx.tsv', 'amb.tsv', 'silence.tsv', 'sound.env'])
      assert.equal(readFileSync(join(p.work, file), 'utf8'), 'stale\n', file);
    assert.equal(existsSync(join(p.work, 'sound-plan.json')), false);
  });

  it('compiles shot-relative effects, music silence and mix settings using existing asset ids', () => {
    const p = room();
    writeFileSync(join(p.channel, 'assets/audio/sfx/whoosh.wav'), 'sfx');
    writeFileSync(join(p.work, 'bgm-tense.wav'), 'music');
    writeFileSync(join(p.board, 'scenes.js'), `
window.MUSIC={
  $mix:{targetLufs:-14,truePeakDbtp:-1,bedSeparationLu:10,minimumSeparationLu:4,
    cueCrossfadeSeconds:2,hook:{attenuationLu:6,releaseSeconds:2},
    ducking:{ratio:8,attackMs:20,releaseMs:250},endingFadeSeconds:2.2,silenceRampSeconds:0.3},
  tense:{prompt:"low strings"}
};
window.SFX={whoosh:{asset:"whoosh"}};
window.SCENES=[{type:"cover",duration:5,narration:[{tts:"a"}],sound:{
  cue:"tense",effects:[{sfx:"whoosh",atSeconds:1.25,intensity:"subtle"}],
  silence:[{startSeconds:2,endSeconds:2.8,scope:"music"}]
}}];
`);
    const result = run(p);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).changed, true);
    assert.equal(readFileSync(join(p.work, 'bgm.tsv'), 'utf8'), `0\t${join(p.work, 'bgm-tense.wav')}\n`);
    assert.equal(readFileSync(join(p.work, 'sfx.tsv'), 'utf8'), `0\t0\t${realpathSync(join(p.channel, 'assets/audio/sfx/whoosh.wav'))}\ton\t1.25\t10\n`);
    assert.equal(readFileSync(join(p.work, 'silence.tsv'), 'utf8'), '0\t2\t2.8\tmusic\n');
    const env = readFileSync(join(p.work, 'sound.env'), 'utf8');
    assert.match(env, /\$\{FINAL_LUFS:=-14\}/);
    assert.match(env, /\$\{DUCK_RELEASE:=250\}/);
  });

  it('compiles gain curves and rejects invalid timing without replacing manifests', () => {
    const p = room();
    const board = join(p.board, 'scenes.js');
    const write = points => writeFileSync(board, `window.SCENES=[{type:"cover",duration:5,sound:{musicGain:${JSON.stringify(points)}}}];`);
    write([{atSeconds:0,gainDb:-12},{atSeconds:4,gainDb:3}]);
    assert.equal(run(p).status, 0);
    const manifest = readFileSync(join(p.work, 'music-gain.tsv'), 'utf8');
    assert.match(manifest, /gainDb/);
    for (const points of [[], [{atSeconds:1,gainDb:0}], [{atSeconds:0,gainDb:13}], [{atSeconds:0,gainDb:0},{atSeconds:6,gainDb:1}]]) {
      write(points);
      assert.notEqual(run(p).status, 0);
      assert.equal(readFileSync(join(p.work, 'music-gain.tsv'), 'utf8'), manifest);
    }
    writeFileSync(board, 'window.SCENES=[{type:"cover",duration:5}];');
    assert.equal(run(p).status, 0);
    assert.equal(existsSync(join(p.work, 'music-gain.tsv')), false);
  });

  it('removes an effect on the next compile while keeping current mix settings', () => {
    const p = room();
    writeFileSync(join(p.channel, 'assets/audio/sfx/whoosh.wav'), 'sfx');
    writeFileSync(join(p.board, 'scenes.js'), 'window.MUSIC={$mix:{targetLufs:-14}};window.SFX={whoosh:{asset:"whoosh"}};window.SCENES=[{type:"cover",duration:3,sound:{effects:[{sfx:"whoosh",atSeconds:1}]}}];\n');
    const first = run(p);
    assert.equal(first.status, 0, first.stderr);
    assert.equal(existsSync(join(p.work, 'sfx.tsv')), true);
    writeFileSync(join(p.board, 'scenes.js'), 'window.MUSIC={$mix:{targetLufs:-14}};window.SCENES=[{type:"cover",duration:3}];\n');
    const second = run(p);
    assert.equal(second.status, 0, second.stderr);
    assert.equal(existsSync(join(p.work, 'sfx.tsv')), false);
    assert.match(readFileSync(join(p.work, 'sound.env'), 'utf8'), /FINAL_LUFS/);
  });

  it('keeps and warns about a human-edited compiler output when its field is removed', () => {
    const p = room();
    writeFileSync(join(p.channel, 'assets/audio/sfx/whoosh.wav'), 'sfx');
    writeFileSync(join(p.board, 'scenes.js'), 'window.MUSIC={$mix:{targetLufs:-14}};window.SFX={whoosh:{asset:"whoosh"}};window.SCENES=[{type:"cover",duration:3,sound:{effects:[{sfx:"whoosh",atSeconds:1}]}}];\n');
    const first = run(p);
    assert.equal(first.status, 0, first.stderr);
    writeFileSync(join(p.work, 'sfx.tsv'), 'human edit\n');
    writeFileSync(join(p.board, 'scenes.js'), 'window.MUSIC={$mix:{targetLufs:-14}};window.SCENES=[{type:"cover",duration:3}];\n');
    const second = run(p);
    assert.equal(second.status, 0, second.stderr);
    assert.match(second.stderr, /warning: sfx\.tsv changed after compile/);
    assert.equal(readFileSync(join(p.work, 'sfx.tsv'), 'utf8'), 'human edit\n');
    assert.deepEqual(JSON.parse(second.stdout).warnings, ['sfx.tsv changed after compile; keeping the human-edited file']);
  });
});

it('compiles audience events exactly once, rejects stale media and cleans the owned plan', async () => {
  const {boardClock} = (await import('../../skills/storyboard/references/audience-effects.js')).default;
  const p = room(), asset = join(p.channel,'assets/audio/sfx/bend.wav');
  writeFileSync(asset,'tone');
  const cue = {id:'smile',sfx:'bend',audience:{intent:'relief'},trigger:'shoulder drops',description:'pulse slows',
    atSeconds:1.4,end:{shotId:'s0002',atSeconds:0.4},fadeOutSeconds:0.1,delivery:'auto'};
  const shots = [{id:'s0001',type:'cover',duration:3,edit:{in:0.8},sound:{effects:[cue]}},{id:'s0002',type:'points',duration:2}];
  const save = () => writeFileSync(join(p.board,'scenes.js'),'window.SCENES='+JSON.stringify(shots));
  cue.audience.timingBasis=boardClock({SCENES:shots},p.board,p.channel).basis('s0001',cue,'s0002');save();
  const compiled = run(p); assert.equal(compiled.status,0,compiled.stderr);
  const filename = join(p.work,'sfx-spans.json'), plan=JSON.parse(readFileSync(filename));
  assert.equal(plan.spans.length,1); assert.equal(plan.spans[0].start.atSeconds,1.4);
  assert.equal(existsSync(join(p.work,'sfx.tsv')),false);
  writeFileSync(asset,'new tone');assert.match(run(p).stderr,/audience_timing_stale/);writeFileSync(asset,'tone');
  shots[0].sound.effects.push(null);save();assert.match(run(p).stderr,/s0001 sound.effects\[1\] must be an effect object/);shots[0].sound.effects.pop();
  cue.delivery='input'; save(); assert.match(run(p).stderr,/audience_delivery_conflict/);
  cue.delivery='post'; shots[1].duration=3;save();assert.match(run(p).stderr,/audience_timing_stale/);
  shots[0].sound.effects=[];save();assert.equal(run(p).status,0);assert.equal(existsSync(filename),false);
});

it('hands new audience material to saved music and mixes the receipted WAV only as a timed effect', async t => {
  const { boardClock } = (await import('../../skills/storyboard/references/audience-effects.js')).default;
  const { planMusic, executeMusic } = await import('../dist/music-routing.js');
  const { config } = await import('../dist/config.js');
  const p = room(), catalogFile = join(p.channel, 'assets/audio/sfx/pressure.wav');
  writeFileSync(catalogFile, 'existing channel variant');
  const cue = { id: 'held-look', sfx: 'pressure', audience: { intent: 'Her suspicion grows' },
    trigger: 'She stops smiling', description: 'Faint tension behind her words', atSeconds: 0.25 };
  const board = {
    STORY: { audienceSoundVersion: 1 },
    PRODUCTION: { modelSettings: { models: { music: { engine: 'elevenlabs', model: 'music_v2_5' } } },
      musicAuthorization: { reference: 'test', maxUsd: 1 } },
    SFX: { pressure: { prompt: 'Instrumental low drone with a soft attack', seconds: 3 } },
    SCENES: [{ id: 's0001', type: 'cover', duration: 2, sound: { audioSource: 'video', effects: [cue] } }],
  };
  const save = () => writeFileSync(join(p.board, 'scenes.js'), Object.entries(board)
    .map(([key, value]) => 'window.' + key + ' = ' + JSON.stringify(value) + ';').join('\n'));
  const row = () => boardClock(board, p.board, p.channel).row('s0001', cue);
  const { source } = row();
  assert.equal(source.kind, 'music');
  assert.equal(source.available, false);
  save();
  assert.match(run(p).stderr, /missing audience music/);
  const { directory, assetId, requestId, prompt, seconds, filename, outputPath } = source;
  const plan = planMusic({ directory, assetId, requestId, reserveUsd: 0.1,
    args: { prompt, forceInstrumental: true, musicLengthMs: seconds * 1000, filename, outputPath } });
  assert.equal(plan.tool, 'music_elevenlabs_generate');
  const key = config.elevenLabsApiKey;
  config.elevenLabsApiKey = 'test-only';
  t.after(() => { config.elevenLabsApiKey = key; });
  const previewFile = join(p.board, 'audience-review-data.js');
  writeFileSync(previewFile, '// Preview pending');
  await executeMusic({ directory: plan.directory, planId: plan.id }, async (_tool, args) => {
    mkdirSync(args.outputPath, { recursive: true });
    const file = join(args.outputPath, args.filename);
    const tone = spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-f', 'wav', file]);
    assert.equal(tone.status, 0, String(tone.stderr));
    return { content: [], musicReceipt: { audioPath: file, requestId: 'fixture' } };
  });
  const preview = (await import('../../skills/_shared/scenes-vm.js')).default.evaluateWindowScript(readFileSync(previewFile, 'utf8'));
  assert.equal(preview.AUDIENCE_CUES[0].source.available, true);
  assert.ok(Object.values(preview.AUDIENCE_PREVIEWS).some(scene => scene.entries.some(c => c.sourceHref?.endsWith('/pressure.wav'))));
  cue.audience.timingBasis = row().currentTimingBasis;
  save();
  const compiled = run(p);
  assert.equal(compiled.status, 0, compiled.stderr);
  assert.deepEqual(JSON.parse(compiled.stdout).warnings, []);
  const spans = JSON.parse(readFileSync(join(p.work, 'sfx-spans.json'))).spans;
  assert.deepEqual(spans.map(s => s.assetPath), [source.path]);
  assert.equal(existsSync(join(p.work, 'bgm.tsv')), false);
  assert.equal(existsSync(join(p.work, 'sfx.tsv')), false);

  const prepare = fileURLToPath(new URL('../../skills/produce/references/prepare-audience-texture.py', import.meta.url));
  const jobState = join(p.work, 'music-routing/state.json'), generatedState = readFileSync(jobState, 'utf8');
  const texture = spawnSync('python3', [prepare, p.root, '--job', requestId, '--target', 'texture',
    '--source-start', '0.1', '--source-duration', '1.2', '--grain', '0.195', '--ratios', '0.77,1.01,0.998',
    '--highpass', '200', '--lowpass', '1120'], { encoding: 'utf8' });
  assert.equal(texture.status, 0, texture.stderr);
  assert.equal(readFileSync(jobState, 'utf8'), generatedState, 'editing creates no new generation receipt');
  cue.sfx = 'texture';
  board.SFX.texture = { prompt: 'Hold the generated tone steady.' };
  const derived = row().source;
  const { receiptPath } = derived.derivation;
  assert.equal(derived.derivation.status, 'matched', derived.derivation.reason);
  assert.equal(derived.derivation.assetId, assetId);
  assert.equal(derived.requestId, undefined);
  assert.equal(derived.derivation.providerRequestId, 'fixture');
  cue.audience.timingBasis = row().currentTimingBasis;
  save();
  const verified = run(p);
  assert.equal(verified.status, 0, verified.stderr);
  assert.deepEqual(JSON.parse(verified.stdout).warnings, []);
  const made = JSON.parse(readFileSync(join(p.work, 'sfx-spans.json'))).spans[0];
  assert.equal(made.assetPath, derived.path);
  assert.equal(made.derivation.status, 'reproduced');
  assert.equal(made.derivation.sourceSha256, createHash('sha256').update(readFileSync(source.path)).digest('hex'));
  const proof = JSON.parse(readFileSync(receiptPath));
  const outside = join(room().root, 'elsewhere.wav'), link = join(p.root, 'link.wav');
  writeFileSync(outside, readFileSync(source.path));
  symlinkSync(outside, link);
  for (const bad of [{ ...proof, source: link }, { ...proof, providerRequestId: 'other' },
    { ...proof, grainSeconds: .1 }, { ...proof, scriptSha256: '0'.repeat(64) }]) {
    writeFileSync(receiptPath, JSON.stringify(bad));
    assert.match(run(p).stderr, /audience_derivation_invalid/);
  }
  writeFileSync(receiptPath, JSON.stringify(proof));
  const alteredState = JSON.parse(generatedState);
  alteredState.jobs[requestId].status = 'submission_unknown';
  writeFileSync(jobState, JSON.stringify(alteredState));
  assert.match(run(p).stderr, /no matching completed music request/);
  writeFileSync(jobState, generatedState);
  const altered = Buffer.concat([readFileSync(derived.path), Buffer.from([0])]);
  writeFileSync(derived.path, altered);
  assert.match(run(p).stderr, /derivative WAV hash mismatch/);
  // An editor can rehash any file. Replaying the recorded recipe still exposes different bytes.
  writeFileSync(receiptPath, JSON.stringify({ ...proof, sha256: createHash('sha256').update(altered).digest('hex') }));
  cue.audience.timingBasis = row().currentTimingBasis;
  save();
  assert.match(run(p).stderr, /audience_derivation_invalid/);

  cue.sfx = 'pressure';
  cue.audience.timingBasis = row().currentTimingBasis;
  save();
  const changed = Buffer.concat([readFileSync(source.path), Buffer.from([0])]);
  writeFileSync(source.path, changed);
  assert.match(run(p).stderr, /audience_timing_stale/);
  cue.audience.timingBasis = row().currentTimingBasis;
  save();
  assert.match(run(p).stderr, /no matching generation receipt/);
  delete board.SFX.pressure;
  assert.equal(row().source.path, realpathSync(catalogFile));
  board.SFX.pressure = { asset: 'pressure' };
  assert.equal(row().source.kind, 'catalog');
  cue.sfx = 'fresh';
  assert.equal(row().source.prompt, cue.description);
  const repeat = { ...cue, id: 'echo', description: 'Address the same suspicion later.' };
  board.SCENES[0].sound.effects.push(repeat);
  assert.deepEqual(boardClock(board, p.board, p.channel).row('s0001', repeat).source, row().source);
  cue.sfx = '../outside';
  assert.throws(row, /audience_asset_id_invalid/);
});
