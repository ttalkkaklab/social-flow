#!/usr/bin/env node
/**
 * format-resolve.js — reads the format from scenes.js, merges it with the preset, and emits it.
 *
 *   format-resolve.js <scenes.js> --sh     format.env for builders to source
 *   format-resolve.js <scenes.js> --json   for reviewer delegation · doc generation
 *   format-resolve.js <scenes.js> --url    capture URL fragment (&format=wide or empty string)
 *   format-resolve.js --format <key> --sh  pick the format directly, no scenes.js (intro etc.)
 *
 * ## The definition of zero regression
 *
 * Feed in an existing scenes.js without `window.FORMAT` and you get the
 * shorts-9x16 emission, every value equal to what today's builders use. So
 * even though portrait episodes gain a new format.env, not one character of
 * the ffmpeg commands changes. **This is the stage-1 acceptance condition.**
 *
 * The emission form is `: "${VAR:=value}"` because of precedence — caller env
 * → format.env → builder inline default, in that winning order. A plain
 * assignment (`VAR=value`) would invert today's builder contract
 * (`${VAR:-default}` always lets caller env win).
 *
 * ## The two things it rejects
 *
 * Silently falling back to portrait only surfaces after burning 12 minutes of
 * capture, so exit 1 happens here instead.
 *   ① a call that needs geometry blocks (zone·fonts·sub) on a preset where they are null
 *   ② BURN=1 + 16:9 — the landscape subtitle block is unmeasured, so there are no coordinates to burn at
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const { FORMATS, DEFAULT_FORMAT } = require('./formats.js');

function die(msg) {
  process.stderr.write('format-resolve: ' + msg + '\n');
  process.exit(1);
}

/**
 * Pulls window.FORMAT out of scenes.js.
 *
 * Evaluates with global.window laid into a vm sandbox — the same precedent
 * extract-text.js:32 uses. scenes.js is a plain script assigning
 * window.SCENES / window.THEME etc. at top level, so this reads all of it.
 */
function readScenes(file) {
  if (!fs.existsSync(file)) die(`scenes.js not found: ${file}`);
  const src = fs.readFileSync(file, 'utf8');
  const sandbox = { window: {}, console: { log() {}, warn() {}, error() {} } };
  sandbox.globalThis = sandbox;
  try {
    vm.runInNewContext(src, sandbox, { filename: file, timeout: 5000 });
  } catch (e) {
    die(`failed to evaluate scenes.js: ${e && e.message}`);
  }
  return sandbox.window;
}

function pickFormat(win, override) {
  if (override) {
    if (!FORMATS[override]) die(`unknown format: ${override} (${Object.keys(FORMATS).join(' | ')})`);
    return override;
  }
  // Absent = shorts-9x16. This fallback is the entry point of zero regression.
  const key = win && typeof win.FORMAT === 'string' ? win.FORMAT : DEFAULT_FORMAT;
  if (!FORMATS[key]) {
    die(`window.FORMAT in scenes.js is an unknown value: ${JSON.stringify(key)} ` +
        `(${Object.keys(FORMATS).join(' | ')})`);
  }
  return key;
}

/** Matches decimal notation to the emission table exactly — 3.0 leaking out as "3" breaks the lint. */
function num(v, decimals) {
  if (decimals === undefined) return String(v);
  return Number(v).toFixed(decimals);
}

/**
 * The unreachable constant used when the filmed-scene length cap is off (recSceneMax: null).
 *
 * build-screencast.sh:136 runs `awk 'BEGIN{exit !(d>m)}'`, so 0 is not "off"
 * but "warn on every scene" (even a 0.5s scene trips it). Empty won't do
 * either — `${MAX_SCENE:-20}` at :37 restores 20 and the decision silently
 * disappears. inf is awk-implementation-dependent, and 1e400 fails strnum
 * parsing and degrades to string comparison. Pinned as an integer literal.
 * 【all field-tested】
 */
const NO_SCENE_CAP = 999999;

/**
 * The §2.5 emission table verbatim. Portrait rows are character-identical to
 * today's values. For landscape the preset is the source of truth.
 *
 * The emission order is fixed — the unit tests compare the whole string, so
 * a shifting order shakes the acceptance condition.
 */
function toShell(key) {
  const f = FORMATS[key];
  const L = [];
  const put = (k, v) => L.push(`: "\${${k}:=${v}}"`);
  const line = (...ks) => {
    const out = ks.map(([k, v]) => `: "\${${k}:=${v}}"`).join('; ');
    L.push(out);
  };

  line(['W', f.canvas.w], ['H', f.canvas.h], ['FPS', f.canvas.fps]);
  put('ZOOM_BASE', f.image.zoomBase);
  line(
    ['MAX_DUR', num(f.pacing.sceneMax, 1)],
    ['MAX_SCENE', f.pacing.recSceneMax === null ? NO_SCENE_CAP : f.pacing.recSceneMax],
    ['TOTAL_HARD', f.pacing.totalHard],
  );
  line(['SUB', 1], ['BURN', f.burn ? 1 : 0], ['STRICT_DIM', f.guards.strictDim]);

  const cap = [['CAP_W', f.capture.w], ['CAP_H', f.capture.h]];
  // No urlFormat, no URL_FMT emitted — a portrait URL without format= is today's behavior.
  if (f.capture.urlFormat) cap.push(['URL_FMT', f.capture.urlFormat]);
  line(...cap);

  put('OUTRO_ASSET', f.outroAsset);
  line(
    ['OVL_HOLD', f.guards.ovlHold === 0 ? '0' : num(f.guards.ovlHold, 1)],
    ['SHRINK_WARN', num(f.guards.shrinkWarn, 1)],
    ['BLOWUP_WARN', f.guards.blowupWarn === 0 ? '0' : num(f.guards.blowupWarn, 1)],
  );
  line(
    ['KB_ZOOM_MIN', num(f.kenburns.panZoomMin, 2)],
    ['KB_ZOOM_MAX', num(f.kenburns.panZoomMax, 2)],
  );

  // Only formats with burn-in enabled emit the six subtitle values. BURN=0 has nowhere to burn.
  if (f.burn) {
    if (!f.sub) die(`${key}: burn=true but the sub block is null`);
    line(['SUB_SIZE', f.sub.fontSize], ['SUB_ML', f.sub.marginLR], ['SUB_MR', f.sub.marginLR]);
    line(['SUB_MV', f.sub.marginV], ['SUB_OUT', f.sub.outline], ['SUB_SHA', num(f.sub.shadow, 1)]);
  }

  // STRICT_AR is not emitted — build-intro.sh only; episode builds don't read it.
  return L.join('\n') + '\n';
}

function toUrl(key) {
  const f = FORMATS[key];
  return f.capture.urlFormat ? `&format=${f.capture.urlFormat}` : '';
}

/**
 * Blocks calls that would lay out or gate against a preset whose geometry blocks are null.
 *
 * **`sub` is not checked here.** That block holds burn-in subtitle coordinates,
 * and a `burn: false` format has nowhere to burn, so it stays null forever
 * (16:9 is the clean-master + subs.srt contract). Make `sub` required and
 * --json keeps getting rejected even after the safe zone is fully measured —
 * and to clear that rejection someone copies in the portrait subtitle values.
 * The accident this exists to prevent opens at that moment. `sub` is required
 * only for formats with burn-in enabled (`burn: true`).
 */
function assertGeometry(key, why) {
  const f = FORMATS[key];
  const need = f.burn ? ['zone', 'fonts', 'sub'] : ['zone', 'fonts'];
  const missing = need.filter((k) => f[k] === null);
  if (missing.length) {
    die(
      `${key}: the ${missing.join('·')} block(s) are still null (provisional). ${why}\n` +
      `  No values exist before the safe-zone measurement. Falling back to portrait values only surfaces after burning 12 minutes of capture.`,
    );
  }
}

function main(argv) {
  const args = argv.slice(2);
  let file = null;
  let override = null;
  let mode = null;
  let burn = null;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--sh' || a === '--json' || a === '--url') mode = a.slice(2);
    else if (a === '--format') override = args[++i];
    else if (a === '--burn') burn = args[++i];
    else if (a.startsWith('--')) die(`unknown argument: ${a}`);
    else file = a;
  }
  if (!mode) die('an output mode is required: --sh | --json | --url');
  if (!file && !override) die('a scenes.js path or --format <key> is required');

  const win = file ? readScenes(path.resolve(file)) : {};
  const key = pickFormat(win, override);
  const f = FORMATS[key];

  // Rejection ② — landscape burn-in has no subtitle coordinates to burn at.
  // The preset says burn is false; if the caller demands BURN=1 it would
  // silently burn at portrait coordinates, so stop here.
  const wantBurn = burn === null ? (f.burn ? '1' : '0') : String(burn);
  if (wantBurn === '1' && !f.burn) {
    die(
      `${key}: BURN=1 was requested but this format's sub block is null.\n` +
      `  16:9 is the clean-master + subs.srt contract, so there is no burn-in. Burning at\n` +
      `  portrait coordinates puts subtitles off-screen or inside the safe zone.`,
    );
  }

  if (mode === 'sh') {
    process.stdout.write(toShell(key));
  } else if (mode === 'url') {
    process.stdout.write(toUrl(key));
  } else {
    // JSON feeds layout and gates, so the geometry blocks must be alive.
    assertGeometry(key, '--json needs layout coordinates.');
    process.stdout.write(JSON.stringify({ format: key, ...f }, null, 2) + '\n');
  }
}

if (require.main === module) main(process.argv);

module.exports = { toShell, toUrl, pickFormat, readScenes, NO_SCENE_CAP };
