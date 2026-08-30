/**
 * format-resolve.test.mjs — freezes the Stage 1 acceptance conditions.
 *
 * One core assertion: **an existing scenes.js with no FORMAT emits output that is
 * character-identical to today's values.** That is the machine evidence for zero
 * regression. Even when a portrait episode gains a format.env, the values the builder
 * reads equal the inline defaults, so the ffmpeg command does not change by a character.
 *
 * Rather than freezing the whole emission block as a string, compare against a
 * **per-key expectation table** (design §2.5). Freeze the block whole and the
 * acceptance condition dies every time a key is added; use it as a blind comparison
 * against the inline defaults and guard keys (0 = off) throw false positives.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const HERE = fileURLToPath(new URL('.', import.meta.url));
const REF = resolve(HERE, '../../skills/platform-guide/references');
const RESOLVE = join(REF, 'format-resolve.js');
const PRODUCE = resolve(HERE, '../../skills/produce/references');

const run = (...args) =>
  execFileSync(process.execPath, [RESOLVE, ...args], { encoding: 'utf8' });

/** Digs the emission block out as {key: value}. */
function parseEnv(sh) {
  const out = {};
  for (const m of sh.matchAll(/:\s*"\$\{([A-Z_]+):=([^}]*)\}"/g)) out[m[1]] = m[2];
  return out;
}

/**
 * Design §2.5 per-key expectation table. Three kinds.
 *   mirror — the builder has this value today. Read it back out of the file under src
 *            with a regex and compare. In stage 3 that value moved out of a literal
 *            inside the ffmpeg string into an inline default (`${W:-1080}`).
 *            The evidence moves with it — the "has not reverted to a literal" test
 *            below guards the command-string side separately.
 *   guard  — a variable we are creating this time. There is no value today to compare
 *            against, and it has to be the off value.
 *   shared — new, but both formats use the same value. The branch condition protects portrait.
 */
const SHORTS_TABLE = [
  ['W', '1080', 'mirror', { file: 'build-reel.sh', re: /^W=\$\{W:-1080\}/m }],
  ['H', '1920', 'mirror', { file: 'build-reel.sh', re: /^H=\$\{H:-1920\}/m }],
  ['FPS', '30', 'mirror', { file: 'build-reel.sh', re: /FPS=\$\{FPS:-30\}/ }],
  ['ZOOM_BASE', '1620x2880', 'mirror', { file: 'build-reel.sh', re: /^ZOOM_BASE=\$\{ZOOM_BASE:-1620x2880\}/m }],
  ['MAX_DUR', '13.0', 'mirror', { file: 'build-reel.sh', re: /MAX_DUR=\$\{MAX_DUR:-13\.0\}/ }],
  ['MAX_SCENE', '20', 'mirror', { file: 'build-screencast.sh', re: /MAX_SCENE=\$\{MAX_SCENE:-20\}/ }],
  ['TOTAL_HARD', '90', 'mirror', { file: 'build-screencast.sh', re: /BEGIN\{exit !\(t>90\)\}/ }],
  ['SUB', '1', 'mirror', { file: 'build-reel.sh', re: /SUB=\$\{SUB:-1\}/ }],
  ['BURN', '1', 'mirror', { file: 'build-reel.sh', re: /BURN=\$\{BURN:-1\}/ }],
  ['SHRINK_WARN', '3.0', 'mirror', { file: 'build-screencast.sh', re: /SHRINK_WARN=\$\{SHRINK_WARN:-3\.0\}/ }],
  ['CAP_W', '1080', 'mirror', { file: 'capture-frames.sh', re: /CAP_W="\$\{CAP_W:-1080\}"/ }],
  ['CAP_H', '1920', 'mirror', { file: 'capture-frames.sh', re: /CAP_H="\$\{CAP_H:-1920\}"/ }],
  ['OUTRO_ASSET', 'outro.mp4', 'mirror', { file: 'build-reel.sh', re: /^OUTRO_ASSET=\$\{OUTRO_ASSET:-outro\.mp4\}/m }],
  ['SUB_SIZE', '58', 'mirror', { file: 'build-reel.sh', re: /^SUB_SIZE=\$\{SUB_SIZE:-58\}/m }],
  ['SUB_ML', '250', 'mirror', { file: 'build-reel.sh', re: /^SUB_ML=\$\{SUB_ML:-250\}/m }],
  ['SUB_MR', '250', 'mirror', { file: 'build-reel.sh', re: /^SUB_MR=\$\{SUB_MR:-250\}/m }],
  ['SUB_MV', '380', 'mirror', { file: 'build-reel.sh', re: /^SUB_MV=\$\{SUB_MV:-380\}/m }],
  ['SUB_OUT', '5', 'mirror', { file: 'build-reel.sh', re: /^SUB_OUT=\$\{SUB_OUT:-5\}/m }],
  ['SUB_SHA', '1.7', 'mirror', { file: 'build-reel.sh', re: /^SUB_SHA=\$\{SUB_SHA:-1\.7\}/m }],
  // guard — the value itself means "that feature is off". There is no value today to compare against.
  ['STRICT_DIM', '0', 'guard', null],
  ['OVL_HOLD', '0', 'guard', null],
  ['BLOWUP_WARN', '0', 'guard', null],
  // shared — what protects portrait is not the value but the branch condition (cards.tsv column 5 is blank).
  ['KB_ZOOM_MIN', '1.06', 'shared', null],
  ['KB_ZOOM_MAX', '1.35', 'shared', null],
];
test('scenes.js with no FORMAT → the shorts-9x16 emission matches the table character for character', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fmt-'));
  const scenes = join(dir, 'scenes.js');
  // Same shape as today's episodes — no window.FORMAT
  writeFileSync(scenes, 'window.SCENES=[{type:"cover",title:"t"}];window.THEME={ink:"#0b1020"};\n');
  const env = parseEnv(run(scenes, '--sh'));

  for (const [key, want] of SHORTS_TABLE) {
    assert.equal(env[key], want, `the ${key} emission value differs from the table`);
  }
  // Emitting a key that is not in the table fails — stops the next person from slipping a value through.
  const known = new Set(SHORTS_TABLE.map(([k]) => k));
  const extra = Object.keys(env).filter((k) => !known.has(k));
  assert.deepEqual(extra, [], `emitted keys that are not in the table: ${extra.join(', ')}`);

  // No URL_FMT = today's behavior, where format= is not appended to the portrait URL
  assert.equal(env.URL_FMT, undefined, 'URL_FMT is not emitted for portrait');
  assert.equal(env.STRICT_AR, undefined, 'STRICT_AR is build-intro.sh only, so it is not emitted');
});

test('mirror keys really do have that value in the builder code today', () => {
  const cache = new Map();
  const read = (f) => {
    if (!cache.has(f)) cache.set(f, readFileSync(join(PRODUCE, f), 'utf8'));
    return cache.get(f);
  };
  for (const [key, want, kind, src] of SHORTS_TABLE) {
    if (kind !== 'mirror') continue;
    assert.ok(src, `${key} is a mirror but has no evidence`);
    assert.match(read(src.file), src.re, `the evidence for ${key}=${want} is gone from ${src.file}`);
  }
});

test('emitted values are not empty — blocks wiring that leaks null as an empty string', () => {
  for (const key of ['shorts-9x16', 'youtube-long-16x9']) {
    const env = parseEnv(run('--format', key, '--sh'));
    for (const [k, v] of Object.entries(env)) {
      assert.notEqual(v, '', `${key}: the ${k} emission value is empty`);
    }
  }
});

test('no scene cap for landscape filming → MAX_SCENE 999999 (neither 0 nor empty)', () => {
  const env = parseEnv(run('--format', 'youtube-long-16x9', '--sh'));
  assert.equal(env.MAX_SCENE, '999999');
  // At 0 the d>m comparison at build-screencast.sh:136 turns the warning on for every scene.
  assert.notEqual(env.MAX_SCENE, '0');
  assert.equal(env.TOTAL_HARD, '1200');
  assert.equal(env.BURN, '0', 'landscape is the clean-master + subs.srt contract');
  assert.equal(env.URL_FMT, 'wide');
  assert.equal(env.SUB_SIZE, undefined, 'with BURN=0 the six subtitle keys are not emitted');
});

test('URL fragment — empty string for portrait, &format=wide for landscape', () => {
  assert.equal(run('--format', 'shorts-9x16', '--url'), '');
  assert.equal(run('--format', 'youtube-long-16x9', '--url'), '&format=wide');
});

test('presets that have typesetting coordinates produce --json', () => {
  // Since the 2026-08-17 safe-zone measurements, landscape passes too. Whether the
  // rejection wiring is still alive is checked by the separate test below with a fake
  // preset — assert the rejection with a real preset and the test dies the moment the
  // values get filled in, and then someone fixes it by deleting the wiring.
  for (const [key, w] of [['shorts-9x16', 1080], ['youtube-long-16x9', 1920]]) {
    const j = JSON.parse(run('--format', key, '--json'));
    assert.equal(j.format, key);
    assert.equal(j.canvas.w, w);
    assert.ok(j.zone && j.fonts, `${key}: --json only comes out when typesetting coordinates exist`);
  }
});

test('sub is only required for formats where burn is on', () => {
  // 16:9 is the clean-master + subs.srt contract, so sub is null forever. Make it
  // required and --json gets rejected even after every safe zone has been measured,
  // and to clear that rejection someone copies the portrait subtitle values in —
  // the accident we were preventing opens right then.
  const { FORMATS } = require(join(REF, 'formats.js'));
  assert.equal(FORMATS['youtube-long-16x9'].burn, false);
  assert.equal(FORMATS['youtube-long-16x9'].sub, null);
  const j = JSON.parse(run('--format', 'youtube-long-16x9', '--json'));
  assert.equal(j.sub, null, '--json must come out even when sub is null');
});

test('presets without typesetting coordinates still reject --json', () => {
  // Regression test for the rejection wiring. Checked with a temporary copy, not the real preset.
  const dir = mkdtempSync(join(tmpdir(), 'fmt-'));
  const fake = join(dir, 'formats.js');
  writeFileSync(fake, [
    `const { FORMATS } = require(${JSON.stringify(join(REF, 'formats.js'))});`,
    'const F = JSON.parse(JSON.stringify(FORMATS));',
    "F['shorts-9x16'].zone = null;",
    "module.exports = { FORMATS: F, DEFAULT_FORMAT: 'shorts-9x16' };",
  ].join('\n'));
  const copy = join(dir, 'format-resolve.js');
  writeFileSync(copy, readFileSync(RESOLVE, 'utf8')
    .replace("require('./formats.js')", `require(${JSON.stringify(fake)})`));
  assert.throws(
    () => execFileSync(process.execPath, [copy, '--format', 'shorts-9x16', '--json'],
      { encoding: 'utf8', stdio: 'pipe' }),
    /provisional|null/,
    'with zone null, --json must exit 1',
  );
});

test('the BURN=1 + 16:9 combination is rejected', () => {
  assert.throws(
    () => run('--format', 'youtube-long-16x9', '--burn', '1', '--sh'),
    /BURN=1/,
    'landscape burn-in has no subtitle coordinates to burn',
  );
});

test('an unknown FORMAT value does not quietly fall back to portrait', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fmt-'));
  const scenes = join(dir, 'scenes.js');
  writeFileSync(scenes, 'window.FORMAT="tiktok-9x16";window.SCENES=[];\n');
  assert.throws(() => run(scenes, '--sh'), /unknown value/);
});

/**
 * The contract Stage 3 created — dimensions go in as variables.
 *
 * The mirror test above only looks at the inline **defaults**. Revert `$W:$H` in the
 * ffmpeg string back to `1080:1920` and the defaults stay put, so that test passes.
 * Portrait has no symptom because the values are the same, and only landscape quietly
 * renders as portrait — so we nail down the command side separately.
 */
test('the places that were made variable have not reverted to literals', () => {
  const reel = readFileSync(join(PRODUCE, 'build-reel.sh'), 'utf8');
  const cast = readFileSync(join(PRODUCE, 'build-screencast.sh'), 'utf8');
  const outro = readFileSync(join(PRODUCE, 'build-outro.sh'), 'utf8');
  const cap = readFileSync(join(PRODUCE, 'capture-frames.sh'), 'utf8');

  assert.match(reel, /scale=\$W:\$H:force_original_aspect_ratio=increase/, 'b-roll scale');
  assert.match(reel, /crop=\$W:\$H,/, 'b-roll crop');
  assert.match(reel, /scale=\$ZB:flags=lanczos,zoompan/, 'Ken Burns source');
  assert.match(reel, /:d=1:s=\$\{W\}x\$\{H\}:fps=\$FPS/, 'Ken Burns output size');
  assert.match(reel, /PlayResX: \$\{W\}\\nPlayResY: \$\{H\}/, 'ASS PlayRes');
  assert.match(reel, /Style: Sub,%s,\$\{SUB_SIZE\},/, 'ASS Fontsize');
  assert.match(reel, /,1,\$\{SUB_OUT\},\$\{SUB_SHA\},2,\$\{SUB_ML\},\$\{SUB_MR\},\$\{SUB_MV\},1/, 'ASS margins');

  // Background compositing and the shrink ratio in the filming builder belong to Stage 13,
  // so they stay portrait literals. What this guards is the other side — "Stage 3 did not
  // reach ahead and touch them".
  assert.match(cast, /scale=w=1080:h=\$\{BAND_MAX_H\}/, 'band scale is a portrait literal');
  assert.match(cast, /,pad=1080:1920:/, 'canvas padding is a portrait literal');
  assert.match(cast, /w\/1080\}'\)/, 'the shrink-ratio denominator is a portrait literal');
  assert.match(cast, /PlayResX: \$\{W\}\\nPlayResY: \$\{H\}/, 'ASS PlayRes');

  assert.match(outro, /if \[ "\$CDIM" = "\$\{W\}x\$\{H\}" \]/, 'full-frame check');
  assert.match(outro, /scale=\$ZB:flags=lanczos/, 'outro Ken Burns');

  assert.match(cap, /--window-size=\$CAP_W,\$CAP_H/, 'capture window size');
});

test('all three builders read format.env before the inline defaults', () => {
  for (const f of ['build-reel.sh', 'build-screencast.sh', 'build-outro.sh']) {
    const src = readFileSync(join(PRODUCE, f), 'utf8');
    const src_i = src.indexOf('[ -f format.env ] && . ./format.env');
    assert.ok(src_i > 0, `${f}: the format.env sourcing line is missing`);
    const fps_i = src.indexOf('FPS=${FPS:-30}');
    assert.ok(fps_i > 0 && src_i < fps_i,
      `${f}: sourcing comes after the inline defaults — format.env can never win`);
  }
  // capture-frames.sh keeps no cwd-relative fallback (intro calls it from the repo root)
  const cap = readFileSync(join(PRODUCE, 'capture-frames.sh'), 'utf8');
  assert.match(cap, /\[ -n "\$\{FORMAT_ENV:-\}" \] && \[ -f "\$FORMAT_ENV" \] && \. "\$FORMAT_ENV"/);
  assert.doesNotMatch(cap, /FORMAT_ENV:-\.work/, 'the cwd-relative fallback has come back');
});

/**
 * The contract Stage 4 created — the silent-failure gates are in place.
 *
 * A gate says nothing when it passes, so the harness cannot see whether it is there.
 * Zero stdout means the gate is quiet, not that the gate is alive. This nails the
 * existence down.
 */
test('the silent-failure gates are alive in the builders', () => {
  const reel = readFileSync(join(PRODUCE, 'build-reel.sh'), 'utf8');
  const cast = readFileSync(join(PRODUCE, 'build-screencast.sh'), 'utf8');
  const splice = readFileSync(join(PRODUCE, 'splice-clip.sh'), 'utf8');
  const outro = readFileSync(join(PRODUCE, 'build-outro.sh'), 'utf8');
  const cap = readFileSync(join(PRODUCE, 'capture-frames.sh'), 'utf8');

  // Gate 1 — canvas probe. Runs only when frame.html knows about probe (protects frozen copies).
  assert.match(reel, /probe_canvas\(\)/, 'probe function');
  assert.match(reel, /grep -q 'probe' "\$html"/, 'the probe runs only when the template knows about it');
  assert.match(reel, /ff00ff/, 'magenta corner check');

  // Gate 2 — the capture-dimension assertion sits **before** the manifest (a mismatched capture never reaches the baseline)
  const iAssert = cap.indexOf('capture dimension mismatch');
  const iManifest = cap.indexOf('MANIFEST=');
  assert.ok(iAssert > 0 && iManifest > iAssert, 'the dimension assertion is after the manifest');

  // Gate 3 — asset precheck. The strictness differs per asset.
  assert.match(reel, /assert_exact\b/, 'reel exact-match check');
  assert.match(reel, /assert_orient\b/, 'reel orientation check');
  assert.match(reel, /assert_exact "\$OUTRO_ASSET"/, 'the outro is exact match');
  assert.match(cast, /assert_exact "\$OUTRO_ASSET"/, 'screencast outro exact match');
  // Put exact match on b-roll and a perfectly fine portrait episode picks up a warning (measured with 720x1280 b-roll).
  assert.match(reel, /\[ -n "\$PBASE" \] && \[ -f "\$PBASE" \] && assert_orient/, 'b-roll gets orientation only');

  // Gate 4 — splice fragment resolution + chapter shift
  assert.match(splice, /\[ -f format\.env \] && \. \.\/format\.env/, 'splice sourcing');
  assert.match(splice, /concat 은 에러 없이 붙이고/, 'splice resolution assertion');
  assert.match(splice, /chapters-spliced\.txt/, 'chapter shift');
  assert.match(splice, /math\.ceil\(a \+ d\)/, 'chapters round up — no marker lands inside the inserted span');

  // Gate 6 — canvas comparison. The check always runs; only the report line is conditional on format.env.
  for (const [name, src] of [['build-reel', reel], ['build-screencast', cast]]) {
    assert.match(src, /RDIM=\$\(ffprobe/, `${name} measured value`);
    assert.match(src, /\[ -f format\.env \] && say "── canvas: declared/, `${name} report line is conditional`);
  }

  // build-outro else branch — portrait canvas + portrait cards only
  assert.match(outro, /\[ "\$W" = 1080 \] && \[ "\$H" = 1920 \]/, 'canvas guard');
  assert.match(outro, /\[ "\$CDW" -lt "\$CDH" \]/, 'card orientation guard');
});

test('chapters.txt only comes out when chapters.tsv exists', () => {
  const reel = readFileSync(join(PRODUCE, 'build-reel.sh'), 'utf8');
  assert.match(reel, /CHAPTSV=""; \[ -f chapters\.tsv \] && CHAPTSV=chapters\.tsv/);
  assert.match(reel, /if \[ -n "\$CHAPTSV" \] && \[ -s work\/chapstart\.tsv \]; then/);
  // Round down — a chapter boundary is a pause between sentences, so a slightly earlier timestamp is better.
  assert.match(reel, /sec = int\(\$1 \/ fps\)/, 'seconds are pulled from the absolute card frame');
  // The three requirements
  assert.match(reel, /it has to be 00:00/);
  assert.match(reel, /YouTube requires at least 3/);
  assert.match(reel, /under the 10 second minimum/);
});

/* ───────────────────────────────────────────────────────────────────────────
 * Stage 3 — landscape typesetting and the filmed-clip lane
 *
 * What this guards is the class of defect where "only landscape episodes quietly
 * fall back to portrait". Portrait keeps its values, so there is no symptom at all
 * and you cannot catch it by eye.
 * ─────────────────────────────────────────────────────────────────────────── */

const SB_TPL = resolve(HERE, '../../skills/storyboard/references/storyboard-html-template.html');

test('video-template knows landscape typesetting (&format=wide)', () => {
  const t = readFileSync(join(PRODUCE, 'video-template.html'), 'utf8');
  assert.match(t, /const wide = qs\.get\('format'\) === 'wide'/, 'format parameter');
  // html reads the canvas variables — attach the class to body alone and the window is landscape while the CSS canvas is portrait
  assert.match(t, /root\.classList\.add\('wide'\); document\.body\.classList\.add\('wide'\)/,
    'the wide class goes on both html and body');
  assert.match(t, /:root\.wide\{\s*\n?\s*--w:1920px; --h:1080px;/, 'landscape canvas tokens');
  // If a shrink step takes the baseline slot, the linter ends up comparing that against the preset
  assert.match(t, /\n  body\.wide \.cover-title\{font-size:72px/, 'landscape baseline type size');
  assert.match(t, /\.tight1 body\.wide \.cover-title\{font-size:66px\}/, 'landscape shrink step');
});

test('the canvas probe runs even with no scenes — the premise of Gate 1', () => {
  const t = readFileSync(join(PRODUCE, 'video-template.html'), 'utf8');
  const iProbe = t.indexOf("qs.get('probe') === '1'");
  const iScene = t.indexOf('const scenes = window.SCENES');
  assert.ok(iProbe > 0, 'the probe branch is missing');
  assert.ok(iProbe < iScene, 'the probe sits after scenes.js is read — it cannot run without injection');
  assert.match(t, /html\.probe,body\.probe\{background:#FF00FF\}/, 'magenta paint');
  // build-reel reads the four corners as exactly ff00ff — leftover background or text contaminates the corners
  assert.match(t, /body\.probe \.bg,body\.probe \.scrim,body\.probe \.zone/, 'layer hiding');
});

test('the filmed-scene check is per-scene, not per-episode', () => {
  const t = readFileSync(join(PRODUCE, 'video-template.html'), 'utf8');
  assert.match(t, /const isFootage = !!\(scene\.visual &&/, 'looks at one scene');
  assert.doesNotMatch(t, /SCENES\.some\([^)]*recording/, 'a check that flips the whole episode has come back');
  assert.match(t, /zone\.classList\.add\(isFootage \? 'l3' : 'top'\)/, 'lower-third branch');

  // Same for the scene-frame template — flip it per-episode here and one filmed scene makes
  // the generated scenes get checked against the filming contract too (40 characters, 5–6 characters/second)
  const sb = readFileSync(SB_TPL, 'utf8');
  assert.match(sb, /function recOf\(s\)/, 'per-scene check function');
  assert.doesNotMatch(sb, /\bvar isRec\b/, 'the per-episode isRec has come back');
  assert.match(sb, /function recTall\(s\) \{ return recOf\(s\) && !WIDE; \}/,
    'only the portrait filming lane gets the top block + recording band');
  assert.match(sb, /if \(WIDE\) probe\.style\.setProperty\("--fw", "1920px"\)/,
    'the reference side for measuring landscape overflow');
});

test('build-reel filming lane — sync cards steer around the audio machine', () => {
  const reel = readFileSync(join(PRODUCE, 'build-reel.sh'), 'utf8');
  // Column 5 is optional — zero regression means a 4-column file still runs today as it does
  assert.match(reel, /read -r -u 3 IDX SRC TARGET ZDIR OPTS/, 'cards.tsv column 5');
  assert.match(reel, /if \[ "\$SYNC" -eq 1 \]; then CPRE=0; CPOST=0; CMIN=0;/,
    'sync cards have preroll, postroll and minimum length at 0');
  // If the card loop picks the global PRE back up, only sync cards slip by 0.4 s
  assert.doesNotMatch(reel, /-v p="\$PRE"/, 'the global PRE is still inside the loop');
  assert.match(reel, /--pre "\$CPRE"/, 'reveal timing uses the card value too');
  // Run trim or atempo over it and it drifts from the picture by that much
  assert.match(reel, /MUTE=1   # bypasses the audio machine below/, 'sync skips trim and speed correction');
  assert.match(reel, /SYNCNOTE="silent clip — normalization skipped"/, 'a silent clip does not get loudnorm either');
});

test('build-reel Ken Burns — off for filmed clips, pan for landscape', () => {
  const reel = readFileSync(join(PRODUCE, 'build-reel.sh'), 'utf8');
  assert.match(reel, /if \[ "\$ZD" = "none" \]; then/, 'zoom=none');
  // What this pins is that the none branch carries no scale= — the source goes through at its
  // own resolution. The label it hands on is [vkb], the shared hand-off every zoom branch uses
  // so §7.4 can hang the scene-boundary fade off one place instead of three.
  assert.match(reel, /\$\{CUR\}format=yuv420p\[vkb\];/, 'none does not upscale the source either');
  assert.doesNotMatch(reel, /if \[ "\$ZD" = "none" \]; then[\s\S]{0,200}?scale=\$ZB/,
                      'the none branch never scales');
  assert.match(reel, /l2r\)\s+PX="\(iw-iw\/zoom\)\*\$E"/, 'pan direction formula');
  // The pan zoom cannot exceed the preset clamp — past it the field of view gets cut hard
  assert.match(reel, /-v lo="\$KB_ZOOM_MIN" -v hi="\$KB_ZOOM_MAX"/, 'pan zoom clamp');
  assert.match(reel, /KB_ZOOM_MIN=\$\{KB_ZOOM_MIN:-1\.06\}/, 'clamp inline default');
});

test('build-reel scene transition — a dissolve that costs no time', () => {
  const reel = readFileSync(join(PRODUCE, 'build-reel.sh'), 'utf8');
  assert.match(reel, /SCENE_FADE=\$\{SCENE_FADE:-0\.12\}/, 'the half-length constant');
  assert.match(reel, /enter=1\|enter=black\)\s+ENTER=black/, 'enter= turns the head transition on');
  assert.match(reel, /exit=1\|exit=black\)\s+EXITM=black/, 'exit= turns the tail fade on');

  // The whole point: both fades live inside one card's own encode, so §9 still stream-copies
  // and the 2ms drift assertion still holds. An xfade between cards would shrink the total by
  // the fade length at every seam — the failure mode the outro seam already measured.
  assert.match(reel, /FILT\+="\$\{SRCL\}null\$\{VF_FADE\}\[vout\]"/, 'the fade hangs off the shared hand-off');
  assert.match(reel, /fade=t=in:st=0:d=\$SF_D/, 'head fade starts at 0');
  assert.match(reel, /fade=t=out:st=/, 'tail fade');
  assert.doesNotMatch(reel, /xfade=transition=[a-z]+:duration=\$(SCENE_FADE|SCENE_XF|SCENE_PUSH)/,
                      'a scene boundary never uses xfade — it renumbers the tail PTS');

  // The fade can never outgrow the card it sits in: a quarter of the card is the ceiling, so a
  // one-second insert dips rather than blinking all the way through black.
  assert.match(reel, /m=dur\/4; if\(d>m\)d=m/, 'the fade is clamped to a quarter of the card');

  // §9 has to stay a stream copy — that is what keeps drift at 0 and subtitle cues in place.
  assert.match(reel, /-f concat -safe 0 -i work\/list\.txt -c copy work\/video\.mp4/,
               'cards are still joined by stream copy');
});

test('build-reel file subtitles — transcript times move onto absolute card times', () => {
  const reel = readFileSync(join(PRODUCE, 'build-reel.sh'), 'utf8');
  assert.match(reel, /if \[ -n "\$SUBSF" \]; then/, 'subs= branch');
  // An end past the card length has to be clipped — otherwise the subtitle spills over onto the next card
  assert.match(reel, /-v d="\$D" 'BEGIN\{if\(e>d\)e=d;/, 'card end clamp');
  // ASS and SRT are stamped from the same place (converting back makes the times in the two files drift)
  const iAss = reel.indexOf("printf 'Dialogue: 0,%s,%s,Sub,,0,0,0,,{\\\\fad(160,120)}%s\\n' \"$(asstime \"$ST\")\" \"$(asstime \"$EN\")\" \"$FT\"");
  assert.ok(iAss > 0, 'the ASS line for file subtitles');
  assert.match(reel, /SRTN=\$\(\(SRTN\+1\)\); NSF=\$\(\(NSF\+1\)\)/, 'file subtitles use the shared SRT numbering too');
});

test('an unknown cards.tsv option is not silently ignored', () => {
  const reel = readFileSync(join(PRODUCE, 'build-reel.sh'), 'utf8');
  // If a typo is ignored, a filmed card missing sync ships 0.4 s out of alignment and you have to catch it by eye
  assert.match(reel, /\*\) say "✗ card \$IDX: unknown cards\.tsv column-5 option — \$KV"; exit 1 ;;/);
  assert.match(reel, /unknown pan direction/, 'an unknown pan direction stops it too');
});
