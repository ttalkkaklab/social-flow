import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const compiler = fileURLToPath(new URL('../../skills/produce/references/compile-sound-plan.js', import.meta.url));
const builder = fileURLToPath(new URL('../../skills/produce/references/build-reel.sh', import.meta.url));
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

  it('resolves catalog mappings and the existing mp4 SFX fallback through resolve-asset.py', () => {
    const p = room();
    mkdirSync(join(p.channel, 'assets/custom'), { recursive: true });
    writeFileSync(join(p.channel, 'assets/custom/mapped.aiff'), 'mapped');
    writeFileSync(join(p.channel, 'assets/audio/sfx/clip.mp4'), 'clip');
    writeFileSync(join(p.channel, 'assets/catalog.md'), '| kind | id | path | note |\n|---|---|---|---|\n| sfx | mapped | custom/mapped.aiff | test |\n');
    writeFileSync(join(p.board, 'scenes.js'), `
window.SFX={mapped:{asset:"mapped"},clip:{asset:"clip"}};
window.SCENES=[
  {type:"cover",duration:3,sound:{effects:[{sfx:"mapped",atSeconds:0.5}]}},
  {type:"points",duration:3,sound:{effects:[{sfx:"clip",atSeconds:1}]}}
];
`);
    const result = run(p);
    assert.equal(result.status, 0, result.stderr);
    const rows = readFileSync(join(p.work, 'sfx.tsv'), 'utf8');
    assert.match(rows, new RegExp(join(p.channel, 'assets/custom/mapped.aiff').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(rows, new RegExp(join(p.channel, 'assets/audio/sfx/clip.mp4').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });

  it('the build entrypoint compiles the current board before sourcing sound.env', () => {
    const source = readFileSync(builder, 'utf8');
    const compileAt = source.indexOf('node "$HERE/compile-sound-plan.js"');
    const sourceAt = source.indexOf('[ -f sound.env ] && . ./sound.env');
    assert.notEqual(compileAt, -1);
    assert.ok(compileAt < sourceAt, 'compile-sound-plan must run before sound.env is sourced');
  });
});
