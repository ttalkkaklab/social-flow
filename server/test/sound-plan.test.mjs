import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, it } from 'node:test';

const compiler = resolve('../skills/produce/references/compile-sound-plan.js');
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
  it('does not touch legacy manifests when the board has no extended sound fields', () => {
    const p = room();
    writeFileSync(join(p.board, 'scenes.js'), 'window.SCENES=[{type:"cover",sound:{sfx:"tick"}}];\n');
    writeFileSync(join(p.work, 'sfx.tsv'), 'legacy-bytes\n');
    const result = run(p);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { changed: false, reason: 'no extended sound fields' });
    assert.equal(readFileSync(join(p.work, 'sfx.tsv'), 'utf8'), 'legacy-bytes\n');
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
    assert.equal(readFileSync(join(p.work, 'sfx.tsv'), 'utf8'), `0\t0\t${join(p.channel, 'assets/audio/sfx/whoosh.wav')}\ton\t1.25\t10\n`);
    assert.equal(readFileSync(join(p.work, 'silence.tsv'), 'utf8'), '0\t2\t2.8\tmusic\n');
    const env = readFileSync(join(p.work, 'sound.env'), 'utf8');
    assert.match(env, /\$\{FINAL_LUFS:=-14\}/);
    assert.match(env, /\$\{DUCK_RELEASE:=250\}/);
  });

  it('changes mix defaults without deleting unrelated hand-authored manifests', () => {
    const p = room();
    writeFileSync(join(p.board, 'scenes.js'), 'window.MUSIC={$mix:{targetLufs:-14}};window.SCENES=[{type:"cover",duration:3}];\n');
    writeFileSync(join(p.work, 'bgm.tsv'), 'legacy-bgm\n');
    writeFileSync(join(p.work, 'sfx.tsv'), 'legacy-sfx\n');
    const result = run(p);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(join(p.work, 'bgm.tsv'), 'utf8'), 'legacy-bgm\n');
    assert.equal(readFileSync(join(p.work, 'sfx.tsv'), 'utf8'), 'legacy-sfx\n');
    assert.match(readFileSync(join(p.work, 'sound.env'), 'utf8'), /FINAL_LUFS/);
  });
});
