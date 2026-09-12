#!/usr/bin/env node
/**
 * check-scenes.js — the scenes.js contract, checked from the command line.
 *
 *   check-scenes.js <storyboard dir | scenes.js>          the findings
 *   check-scenes.js <...> --json                          machine-readable
 *   check-scenes.js <...> --draft                         the story pass (storyboard §4a)
 *   check-scenes.js --selftest                            pins the rules
 *
 * ## Why a CLI checker when storyboard.html already has a check strip
 *
 * The check strip is excellent and it is the wrong shape for two jobs. It runs in a browser,
 * so a person has to open the document to see it — which means an unattended run can't consult
 * it, and neither can a reviewer agent, and neither can a build that is about to spend twelve
 * minutes on capture. This runs the structural half of the same contract with an exit code.
 *
 * **It does not duplicate the strip's measurements.** Frame overflow, hero-stat width and
 * speech rate are computed against a rendered canvas, and re-implementing them here would
 * create exactly the mirror drift `format-lint.js` exists to police. What it checks is the
 * structure — fields that must exist, values that must come from a fixed vocabulary, and
 * references that must resolve. Those are the ones that break a build rather than look wrong.
 *
 * ## Every format constant comes from the preset
 *
 * No band or count is written here. `format-resolve.js --json` is asked, and its `pacing`
 * block is the source. A fifth copy of those numbers is the last thing this repository needs.
 * Generated-video defaults come from the format preset. A channel profile may override that
 * cap and add a minimum true-motion ratio; scenes.js carries the same policy for the browser
 * check strip, and this CLI verifies that the two copies match.
 *
 * Exit codes:
 *   0  no violations (warnings may still be printed)
 *   1  at least one violation
 *   3  input error, or scenes.js does not evaluate
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const SELF_DIR = __dirname;
const FORMAT_RESOLVE = path.resolve(SELF_DIR, '..', '..', 'platform-guide', 'references', 'format-resolve.js');
/* The clip-prompt rules live where the prompts are written — required, not copied, so the
   checker and the assembler can never disagree about what a seedance prompt may say. */
const PROMPT = require(path.join(SELF_DIR, 'assemble-bg-prompt.js'));
const { scenePlan } = require('../../produce/references/seedance-route.js');

function die(msg) {
  process.stderr.write('check-scenes: ' + msg + '\n');
  process.exit(3);
}

/* ── Vocabularies ──
   The source of truth for these words is directing-grammar.md (§size, §angle) and
   scenes-schema.md (§camera, §playback order, §the four opening strategies, §the six hook
   forms). They are vocabularies, not measurements — a value outside them is a typo or an
   invented word, and produce or the assembler will reject it later at a worse moment. */
const SIZES = ['els', 'ls', 'ws', 'fs', 'mfs', 'ms', 'mcu', 'cu', 'choker', 'ecu', 'insert',
               'two', 'three', 'ots', 'pov', 'back', 'cutaway', 'reaction'];
const ANGLES = ['eye', 'low', 'high', 'dutch', 'overhead', 'ground', 'over'];
const BEATS = ['hook', 'hooking', 'drip', 'result', 'body', 'turn', 'cta'];
const LONG_FORM_BEATS = ['hooking', 'result', 'body', 'turn'];
const ARCS = ['answer-first', 'story'];
const HOOK_TYPES = ['fear', 'empathy', 'curiosity', 'spoiler'];
const HOOK_FORMS = ['paradox', 'gap', 'payoff', 'identify', 'number', 'secret'];
const TYPES = ['cover', 'hooking', 'points', 'quote', 'broll', 'outro'];
const COMPREHENSION_MODES = ['informational', 'narrative'];
const SLIDE_TREATMENTS = ['editorial', 'photo-action'];
/* User directive 2026-09-05 — it outranks every other rule in this file: nothing is drawn over
   video. No mark, arrow, ring, hatch, bracket, label or callout goes over a generated clip, a
   motion background, a b-roll or a recording. The footage treatment (one clip per sentence
   under drawn marks, 0.47–0.53) is retired. A beat that would need an arrow, a figure or a
   principle on screen is an HTML slide on the studio stage (slide-design.md §1 · §9), authored
   to the quality of docs/research/2026-09-04-rendered-object-slide/reference-slide.html. */
const FOOTAGE_RETIRED = 'treatment:"footage" is retired (user directive 2026-09-05) — nothing is drawn over video; ' +
  'an explanation beat (timeline · statistic · principle) is an editorial HTML slide on the studio stage, ' +
  'an event or a place is a motion background or a b-roll with nothing drawn on it';
const EDITORIAL_ROLES = ['evidence', 'relationship', 'mechanism', 'timeline', 'statistic', 'transition', 'verdict'];
const INFO_TYPES = ['other', 'timeline', 'statistic', 'principle'];
/* What shape the forwardable thing takes (scenes-schema.md §playback order, the `cta` beat row).
   `shot.share` is the sentence, figure or verdict a viewer would pass on as-is; `shot.shareType`
   labels it the way `shot.infoType` labels `shot.info`. `none` says the shot carries no trigger. */
const SHARE_TYPES = ['fact', 'verdict', 'line', 'checklist', 'none'];
const INFO_ROLE = { timeline: 'timeline', statistic: 'statistic', principle: 'mechanism' };
// object-move — a baked object arrives, turns or recedes (rendered-object.md · h.object); the sentence's
// value can be the object itself on any of the three types, so it is allowed on all of them.
const INFO_PRIMITIVES = {
  timeline: ['date-enter', 'range-grow', 'event-link', 'object-move', 'chart-reveal'],
  statistic: ['count-up', 'bar-grow', 'dot-fill', 'axis-draw', 'object-move', 'chart-reveal'],
  principle: ['flow-trace', 'node-enter', 'state-transform',
              'shape-enter', 'shape-draw', 'shape-travel', 'object-move'],
};
const ART_MOVES = ['travel', 'rise', 'in', 'drop', 'press', 'none'];
const ART_FILE = /^slides\/assets\/s\d+-[a-z0-9-]+\.(png|jpe?g)$/i;
const OBJECT_FILE = /^slides\/assets\/s\d+-[a-z0-9-]+\.png$/;   // a baked sheet (rendered-object.md)
const TRANSITIONS = ['jcut', 'cut', 'dissolve', 'dip', 'dip:white', 'iris', 'blur', 'zoom'];
const PUSH_RE = /^push:(l2r|r2l|u2d|d2u)$/;
const WHIP_RE = /^whip:(l2r|r2l|u2d|d2u)$/;
/* Joins that say "time or attention moved" — a jcut is the honest join inside one scene, so
   these draw the same-scene warning. push/whip/zoom say "the camera moved", which happens
   inside a scene all the time. */
const MOVED_KINDS = ['dissolve', 'dip', 'iris', 'blur'];
/* Joins that open on the previous shot's last frame — the first shot has nothing to carry. */
const CARRY_KINDS = ['jcut', 'dissolve', 'iris', 'blur', 'zoom', 'push', 'whip'];
const JOIN_VOCAB = 'jcut | cut | dissolve | dip | dip:white | iris | blur | zoom | ' +
                   'push:l2r|r2l|u2d|d2u | whip:l2r|r2l|u2d|d2u';
const SIZE_RANK = {
  els: 0, ls: 1, ws: 1, fs: 2, mfs: 3, ms: 4, mcu: 5, cu: 6, choker: 7, ecu: 8, insert: 8,
};

function parseTransition(t) {
  if (t == null || t === '') return { kind: 'missing' };
  if (TRANSITIONS.indexOf(t) !== -1) return { kind: t === 'dip:white' ? 'dip' : t, raw: t };
  if (PUSH_RE.test(t)) return { kind: 'push', raw: t };
  if (WHIP_RE.test(t)) return { kind: 'whip', raw: t };
  return null;
}

function isStillCard(scene) {
  const v = (scene && scene.visual) || {};
  if (scene && (scene.type === 'broll' || scene.type === 'outro')) return false;
  if (v.source === 'recording' || v.source === 'screencast' || v.picture === 'recording') return false;
  if (v.source === 'stock' && v.clip) return false;
  if ((v.slide && v.slide.kind !== 'camera') || v.video || v.clip || v.reuse !== undefined) return false;
  return true;
}

function spokenText(scene) {
  return (scene && Array.isArray(scene.narration) ? scene.narration : [])
    .map((seg) => String((seg && (seg.sub || seg.tts)) || ''))
    .join(' ');
}

function compactText(value) {
  return String(value || '').replace(/[\s\p{P}\p{S}]/gu, '');
}

function compactLength(value) {
  return Array.from(compactText(value)).length;
}

function readScenes(file) {
  const src = fs.readFileSync(file, 'utf8');
  const sandbox = { window: {}, console: { log() {}, warn() {}, error() {} } };
  sandbox.globalThis = sandbox;
  try {
    vm.runInNewContext(src, sandbox, { filename: file, timeout: 5000 });
  } catch (e) {
    die('scenes.js does not evaluate: ' + (e && e.message));
  }
  if (!Array.isArray(sandbox.window.SCENES)) die('scenes.js has no window.SCENES array');
  return sandbox.window;
}

/** The format contract, straight from the preset — never a copy kept here. */
function formatOf(scenesPath) {
  try {
    const out = execFileSync('node', [FORMAT_RESOLVE, scenesPath, '--json'], { encoding: 'utf8' });
    return JSON.parse(out);
  } catch (e) {
    die('format-resolve.js could not read the format: ' + (e && e.message));
  }
}

const LONG_FORMAT = 'youtube-long-16x9';
const MOTION_KINDS = ['ai-video', 'recording', 'stock-video', 'motion-slide'];
const MOTION_PROFILE_KEYS = [
  'motion_min_true', 'motion_allowed_kinds', 'motion_max_consecutive_stills',
  'motion_max_still_seconds', 'motion_require_action', 'generated_video_max',
  'max_static_ground_seconds', 'html_plate_max', 'video_budget_usd', 'hook_video',
  'length_min_seconds', 'length_max_seconds',
];
// Plugin-wide defaults (owner directives 2026-09-03 "the viewer has to feel a video", 2026-09-05
// "nothing is drawn over video", 2026-09-06 "choose each cut by purpose — caps are ceilings, not
// quotas, and hook_video defaults off"). They apply whether or not a profile declares a motion
// policy; a profile may raise, lower, or switch each one off with `off`.
const STATIC_GROUND_DEFAULT_SECONDS = 8;   // one still under its camera move may hold one cut — the top of the directing-grammar §5 length column
const HTML_PLATE_DEFAULT_MAX = 2;          // static plates on `other` beats per episode — motion slides and explanation slides sit outside the cap
const VIDEO_BUDGET_DEFAULT_USD = 10;       // generated video per episode — read by cost-preview.js
const HOOK_VIDEO_DEFAULT = false;          // content chooses the opening treatment; an explicit channel override may require video

function scalar(v) {
  if (v === undefined || v === null) return undefined;
  return String(v).trim().replace(/^(["'])(.*)\1$/, '$2');
}

/** Flat frontmatter is enough for the channel motion contract. */
function frontmatter(file) {
  const src = fs.readFileSync(file, 'utf8');
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!m) return {};
  const out = {};
  m[1].split(/\r?\n/).forEach((line) => {
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*?)\s*$/);
    if (!kv) return;
    out[kv[1]] = scalar(kv[2].replace(/\s+#.*$/, ''));
  });
  return out;
}

function findProfile(scenesPath) {
  let dir = path.dirname(path.resolve(scenesPath));
  for (let i = 0; i < 7; i++) {
    const candidate = path.join(dir, 'profile.md');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function boolValue(v, fallback, errors, field) {
  if (v === undefined || v === '') return fallback;
  if (v === true || v === 'true') return true;
  if (v === false || v === 'false') return false;
  errors.push(`${field} must be true or false`);
  return fallback;
}

function optionalNumber(v, errors, field, integer) {
  if (v === undefined || v === '' || v === 'off' || v === 'none') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || (integer && !Number.isInteger(n))) {
    errors.push(`${field} must be ${integer ? 'a non-negative integer' : 'a non-negative number'} or off`);
    return null;
  }
  return n;
}

/** Like optionalNumber, but an undeclared key takes the plugin default instead of switching off. */
function numberOrDefault(v, dflt, errors, field, integer) {
  if (v === undefined || v === '') return dflt;
  return optionalNumber(v, errors, field, integer);
}

/* `pacing` is the format preset's pacing block. The length band's default is format-derived —
   it is the only policy value this file must not carry a number for — so it arrives as an
   argument instead of a module constant. `isShort` says which band that is; an omitted flag
   reads as short-form, the way an omitted `window.FORMAT` does. */
function normalizeMotionPolicy(raw, defaultVideoMax, source, pacing, isShort) {
  const errors = [];
  const band = pacing || {};
  const shortForm = isShort !== false;
  const bandDefault = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
  const profileShape = raw && MOTION_PROFILE_KEYS.some((k) => raw[k] !== undefined);
  const sceneShape = !!raw && !profileShape;
  const pick = (profileKey, sceneKey) => profileShape ? raw[profileKey] : sceneShape ? raw[sceneKey] : undefined;
  const minRaw = scalar(pick('motion_min_true', 'minTrueMotion'));
  let minTrueMotion = null;
  if (minRaw !== undefined && minRaw !== '' && minRaw !== 'off' && minRaw !== 'none') {
    if (minRaw === 'majority') minTrueMotion = 'majority';
    else {
      const n = Number(minRaw);
      if (!Number.isFinite(n) || n <= 0 || n > 1)
        errors.push('motion_min_true/minTrueMotion must be majority, off, or a number above 0 and at most 1');
      else minTrueMotion = n;
    }
  }

  const kindsRaw = pick('motion_allowed_kinds', 'allowedKinds');
  const allowedKinds = (Array.isArray(kindsRaw) ? kindsRaw : scalar(kindsRaw || MOTION_KINDS.join(','))
    .split(','))
    .map((v) => String(v).trim()).filter(Boolean);
  const unknownKinds = allowedKinds.filter((v) => MOTION_KINDS.indexOf(v) === -1);
  if (unknownKinds.length) errors.push(`motion_allowed_kinds/allowedKinds has unknown values: ${unknownKinds.join(', ')}`);

  const maxConsecutiveStills = optionalNumber(
    scalar(pick('motion_max_consecutive_stills', 'maxConsecutiveStills')),
    errors, 'motion_max_consecutive_stills/maxConsecutiveStills', true);
  const maxStillSeconds = optionalNumber(
    scalar(pick('motion_max_still_seconds', 'maxStillSeconds')),
    errors, 'motion_max_still_seconds/maxStillSeconds', false);
  const requireAction = boolValue(
    pick('motion_require_action', 'requireAction'), false, errors,
    'motion_require_action/requireAction');
  const videoOverride = optionalNumber(
    scalar(pick('generated_video_max', 'generatedVideoMax')),
    errors, 'generated_video_max/generatedVideoMax', true);
  const maxStaticGroundSeconds = numberOrDefault(
    scalar(pick('max_static_ground_seconds', 'maxStaticGroundSeconds')), STATIC_GROUND_DEFAULT_SECONDS,
    errors, 'max_static_ground_seconds/maxStaticGroundSeconds', false);
  const htmlPlateMax = numberOrDefault(
    scalar(pick('html_plate_max', 'htmlPlateMax')), HTML_PLATE_DEFAULT_MAX,
    errors, 'html_plate_max/htmlPlateMax', true);
  const videoBudgetUsd = numberOrDefault(
    scalar(pick('video_budget_usd', 'videoBudgetUsd')), VIDEO_BUDGET_DEFAULT_USD,
    errors, 'video_budget_usd/videoBudgetUsd', false);
  /* The channel may narrow the recommended length band on short-form; the format's hard cap is
     not a channel field and stays with the preset. An absent key takes the preset's own band.
     Long-form never reads the pair, so a channel that narrows one end only does not get its
     other end filled from the 8–15 min preset and cross-checked against a shorts number.
     Every other policy key switches off with `off`, but there is no episode without a length,
     so `off` here is a mistake worth naming instead of quietly handing the preset back — the
     doc side is scenes-schema §Channel true-motion policy. */
  const bandNumber = (v, dflt, field) => {
    if (v === 'off' || v === 'none') {
      errors.push(`${field} does not take off — write a number, or drop the key to keep the preset's band`);
      return dflt;
    }
    return numberOrDefault(v, dflt, errors, field, false);
  };
  const lengthMin = shortForm ? bandNumber(
    scalar(pick('length_min_seconds', 'lengthMin')), bandDefault(band.totalMin),
    'length_min_seconds/lengthMin') : null;
  const lengthMax = shortForm ? bandNumber(
    scalar(pick('length_max_seconds', 'lengthMax')), bandDefault(band.totalMax),
    'length_max_seconds/lengthMax') : null;
  if (lengthMin !== null && lengthMax !== null && lengthMin > lengthMax)
    errors.push('length_min_seconds/lengthMin is above length_max_seconds/lengthMax');
  const hookRaw = scalar(pick('hook_video', 'hookVideo'));
  const hookVideo = hookRaw === 'off' || hookRaw === 'none' ? false
    : hookRaw === 'on' ? true
    : boolValue(hookRaw, HOOK_VIDEO_DEFAULT, errors, 'hook_video/hookVideo');

  return {
    declared: !!raw && (profileShape || sceneShape), source: source || '', errors,
    minTrueMotion, allowedKinds: [...new Set(allowedKinds)].sort(), maxConsecutiveStills,
    maxStillSeconds, requireAction,
    generatedVideoMax: videoOverride === null ? defaultVideoMax : videoOverride,
    maxStaticGroundSeconds, htmlPlateMax, videoBudgetUsd, hookVideo, lengthMin, lengthMax,
  };
}

function policyComparable(p) {
  return JSON.stringify({
    minTrueMotion: p.minTrueMotion,
    allowedKinds: p.allowedKinds,
    maxConsecutiveStills: p.maxConsecutiveStills,
    maxStillSeconds: p.maxStillSeconds,
    requireAction: p.requireAction,
    generatedVideoMax: p.generatedVideoMax,
    maxStaticGroundSeconds: p.maxStaticGroundSeconds,
    htmlPlateMax: p.htmlPlateMax,
    videoBudgetUsd: p.videoBudgetUsd,
    hookVideo: p.hookVideo,
    lengthMin: p.lengthMin,
    lengthMax: p.lengthMax,
  });
}

/* A slide that declares a movement for every narration group changes its picture every
   sentence (directive 2026-09-05) — the static-ground clock runs per group on it and it is a
   body of its own, outside the static-plate cap. */
function beatsCoverGroups(scene) {
  const segs = Array.isArray(scene && scene.narration) ? scene.narration.length : 0;
  const sl = scene && scene.visual && scene.visual.slide;
  return segs > 0 && !!sl && sl.motion === true && Array.isArray(sl.motionBeats) &&
    Array.from({ length: segs }, (_, g) => g + 1).every((g) => sl.motionBeats.some((b) => b && Number(b.group) === g));
}

/** A shot the engine bills for: a b-roll, a motion background, or a speech clip the engine
    makes. `visual.video.clip` is produce's own output record (§motion background), not a mark
    that the file was supplied — a file the user already has is the filmed lane
    (`visual.source: "recording"`), which is not a generated shot at all. */
function generatedVideo(scene) {
  const v = (scene && scene.visual) || {};
  // The shape decides, not the lane marker: a filmed shot carries none of these, so a shot
  // that has both is a malformed board the cap and the camera-slot rules still have to reject.
  return !!(scene && (scene.type === 'broll' || v.video || v.reuse !== undefined ||
                      (scene.type === 'quote' && v.clip && typeof v.clip === 'object')));
}

function motionKind(scene) {
  const v = (scene && scene.visual) || {};
  // A free stock or archive clip (scenes-schema §stock material) is a supplied moving file:
  // real motion the engine never billed for. A stock photo has no clip and stays a still.
  if (v.source === 'stock' && typeof v.clip === 'string') return 'stock-video';
  if (v.source === 'recording' || v.source === 'screencast' || v.picture === 'recording')
    return 'recording';
  // The ground decides the kind: a motion background or clip under a motion-slide overlay
  // (the cover's code-rendered title over `visual.video`) is video, not a plate.
  if (scene && (scene.type === 'broll' || v.video || v.clip || v.reuse !== undefined)) return 'ai-video';
  if (v.slide && v.slide.kind !== 'camera' && v.slide.motion === true) return 'motion-slide';
  return null;
}

/** The planned route (scenes-schema §clip prompt) — `engine` overrides the type default:
    b-roll keeps its sound so it goes to veo, a motion background discards it so seedance,
    a speech clip goes to veo_reference. The same routing as the check strip's engineOf. */
function engineOf(scene) {
  const v = (scene && scene.visual) || {};
  const named = (v.video && v.video.engine) || (v.clip && v.clip.engine) || v.engine;
  if (named === 'veo' || named === 'seedance' || named === 'host') return named;   // host: the CLI's own video tool
  if (scene && (scene.type === 'broll' || scene.type === 'quote')) return 'veo';
  return 'seedance';
}

/* What a seedance prompt may say — the vendor's grammar, not taste (video-model-selection
   §Prompt grammar · §positive locks). The body reads Chinese or English; it carries no
   timecode or digit seconds (2.0 self-reports unstable precision timing); an exclusion is
   never a directive, because this engine has no negativePrompt argument; and it closes with
   a consistency lock. The checks are assemble-bg-prompt.js's own, so a prompt that clears
   this checker is one the assembler would have written. */
function seedancePromptFindings(prompt, engine) {
  const text = String(prompt || '').trim();
  if (engine !== 'seedance' || !text) return [];
  const out = [];
  // The Audio: sentence is exempt from the negative check — "no music, no speech" is a state.
  const audioAt = text.search(/Audio\s*:/i);
  const body = audioAt >= 0 ? text.slice(0, audioAt) : text;
  PROMPT.hangulHits(text, 'seedance').forEach((h) => out.push(
    `the stored clip prompt carries Korean ("${h}") — a seedance body reads Chinese or English; Korean goes inside the quotes of a dialogue line`));
  PROMPT.negDirectiveHits(body, 'seedance').forEach((h) => out.push(
    `the stored clip prompt gives a negative directive ("${h}") — Seedance has no negativePrompt argument: re-describe the scene and put what must hold into the consistency lock`));
  PROMPT.timingHits(body, 'seedance').forEach((h) => out.push(`the stored clip prompt carries ${h}`));
  if (PROMPT.lockMissing(text, 'seedance')) out.push(
    'the stored clip prompt has no consistency lock — a seedance clip closes with the sentence that says what holds in every frame ' +
    '("the subject stays exactly consistent with the input frame; appearance, proportions and materials hold"), ' +
    'which is also the only place an exclusion can go on this engine');
  return out;
}

/** Rebuilds playback order because b-roll entries live at the array tail and use `after`. */
function playbackShots(scenes) {
  const broll = scenes.map((s, i) => ({ scene: s, index: i }))
    .filter((x) => x.scene.type === 'broll');
  const out = [];
  scenes.forEach((scene, index) => {
    if (scene.type === 'broll' || scene.type === 'outro') return;
    out.push({ scene, index });
    broll.filter((x) => Number(x.scene.after) === index).forEach((x) => out.push(x));
  });
  return out;
}

/**
 * Runs the structural contract. `fmt` is the resolved preset; every band comes from it.
 * Returns findings — `bad` is a violation, `warn` is worth a look, `later` is a machine-layer
 * field the story pass hasn't reached yet.
 *
 * `opts.draft` is storyboard §4a. The story pass has beats, feels, narration and the two hook
 * fields and nothing else, so the checks that only ask whether a machine-layer field has been
 * written yet come back as `later` instead of `bad`. Nothing else moves: a value outside a
 * vocabulary is still a violation in draft mode, and so is every beat-order rule. What §4b's
 * full run has to come back clean on is the same list it always was.
 */
function check(win, fmt, opts) {
  const scenes = win.SCENES;
  const draft = !!(opts && opts.draft);
  const out = [];
  const bad = (where, what) => out.push({ level: 'bad', where, what });
  const machine = (where, what) => out.push({ level: draft ? 'later' : 'bad', where, what });
  const warn = (where, what) => out.push({ level: 'warn', where, what });

  const pacing = fmt.pacing || {};
  const formatVideoMax = fmt.video && Number.isFinite(Number(fmt.video.generatedSecondsMax))
    ? Math.floor(Number(fmt.video.generatedSecondsMax) / 8) : 2;
  const productionMode = require('./production-mode.js');
  productionMode.check(win, { draft }).forEach(message => bad('production mode', message));
  /* Sequence → scene → shot (structure-contract.js) — the same rules storyboard_apply refuses
     to write past. A board with no window.STRUCTURE only warns here: old boards still build. */
  require('./structure-contract.js').check(win, { draft }).forEach(f => {
    if (f.level === 'bad') bad(f.where, f.what);
    else if (f.level === 'later') machine(f.where, f.what);
    else warn(f.where, f.what);
  });
  const isShort = fmt.format !== LONG_FORMAT;
  const motionPolicy = productionMode.policy((opts && opts.policy) || normalizeMotionPolicy(null, formatVideoMax, 'default', pacing, isShort), win.PRODUCTION, scenes);
  const main = scenes.filter((s) => s.type !== 'broll' && s.type !== 'outro');
  const cover = scenes.find((s) => s.type === 'cover');

  // ── Episode level ──
  if (!cover) bad('episode', 'no cover shot — every episode opens on one');
  /* The preset spells the shot band `sceneCountMin`/`sceneCountMax` (formats.js §3.2), which is
     also what the approval page's strip reads. This check asked for `shotMin`/`shotMax` — keys
     no preset has ever emitted — so it never fired until 2026-09-07. */
  if (pacing.sceneCountMin && main.length < pacing.sceneCountMin)
    warn('episode', `${main.length} main shots — the ${fmt.label} band is ${pacing.sceneCountMin}~${pacing.sceneCountMax}`);
  if (pacing.sceneCountMax && main.length > pacing.sceneCountMax)
    warn('episode', `${main.length} main shots — the ${fmt.label} band is ${pacing.sceneCountMin}~${pacing.sceneCountMax}`);

  /* Total length against the channel's band, with the preset's underneath it (`length_min_seconds`
     / `length_max_seconds`, scenes-schema §Channel true-motion policy). The two keys narrow the
     short-form band only — long-form does not read them at all and keeps the preset's own band,
     so a dual-format channel that tightens its shorts does not drag its long-form boards down.
     storyboard.html's length strip runs this same ladder over the same scenes — everything but
     the outro asset, b-roll included, because a b-roll plays — so the page and this file give one
     verdict. The hard cap belongs to the platform, not to any channel. A board with no durations
     yet is left to the per-scene `no duration` warning rather than told its total is 0. */
  const played = scenes.filter((s) => s.type !== 'outro')
    .reduce((a, s) => a + (Number(s.duration) > 0 ? Number(s.duration) : 0), 0);
  const bandFloor = isShort && Number.isFinite(motionPolicy.lengthMin) ? motionPolicy.lengthMin : pacing.totalMin;
  const bandCeil = isShort && Number.isFinite(motionPolicy.lengthMax) ? motionPolicy.lengthMax : pacing.totalMax;
  const lenTxt = (v) => `${Math.round(v * 10) / 10}s`;
  if (played > 0 && Number.isFinite(pacing.totalHard) && played > pacing.totalHard)
    bad('episode', `main body ${lenTxt(played)} — past the cap of ${lenTxt(pacing.totalHard)}`);
  else if (played > 0 && Number.isFinite(bandFloor) && Number.isFinite(bandCeil) &&
           (played < bandFloor || played > bandCeil))
    warn('episode', `main body ${lenTxt(played)} — outside the ` +
                    `${bandFloor !== pacing.totalMin || bandCeil !== pacing.totalMax ? 'channel band' : 'default'} ` +
                    `${lenTxt(bandFloor)}~${lenTxt(bandCeil)} (going over needs a design reason; ` +
                    `cap ${lenTxt(pacing.totalHard)})`);

  /* ── Comprehension contract ──
     The promise ledger in storyboard.html is useful to a person but invisible to this CLI.
     This compact contract keeps the governing question, its answer, cross-scene branches,
     and first-use term explanations beside the narration that ships. It is written in §4a,
     before any machine-layer work, so it is a hard authoring check in draft mode too. */
  const comp = win.COMPREHENSION;
  if (!comp || typeof comp !== 'object' || Array.isArray(comp)) {
    bad('episode', 'no window.COMPREHENSION — write the one question, answer, takeaway, branches, and term introductions before the scenes');
  } else {
    if (COMPREHENSION_MODES.indexOf(comp.mode) === -1)
      bad('window.COMPREHENSION', `mode "${comp.mode}" is outside ${COMPREHENSION_MODES.join(' · ')}`);

    ['question', 'answer', 'takeaway'].forEach((field) => {
      if (!String(comp[field] || '').trim())
        bad('window.COMPREHENSION', `${field} is empty — the episode cannot be compressed to one ${field}`);
    });

    const caps = { question: 35, answer: 60, takeaway: 45 };
    if (isShort) Object.keys(caps).forEach((field) => {
      const n = compactLength(comp[field]);
      if (n > caps[field])
        bad('window.COMPREHENSION', `${field} is ${n} characters — short-form cap ${caps[field]}; simplify the thought before shortening the wording`);
    });

    if (!Array.isArray(comp.branches)) {
      bad('window.COMPREHENSION', 'branches must be an array — use [] when the main question has no cross-scene detour');
    } else {
      const maxBranches = isShort ? (comp.mode === 'narrative' ? 1 : 0) : 4;
      if (comp.branches.length > maxBranches)
        bad('window.COMPREHENSION', `${comp.branches.length} cross-scene branches — ${comp.mode || 'informational'} ` +
            `${isShort ? 'short-form' : 'long-form'} cap ${maxBranches}; cut the branch or make it its own episode`);
      comp.branches.forEach((branch, i) => {
        const where = `window.COMPREHENSION.branches[${i}]`;
        if (!branch || typeof branch !== 'object') { bad(where, 'branch is not an object'); return; }
        if (!String(branch.question || '').trim()) bad(where, 'question is empty');
        const open = Number(branch.open), pay = Number(branch.pay);
        if (!Number.isInteger(open) || open < 1 || open > scenes.length) bad(where, `open ${JSON.stringify(branch.open)} is not a shot number`);
        if (!Number.isInteger(pay) || pay < 1 || pay > scenes.length) bad(where, `pay ${JSON.stringify(branch.pay)} is not a shot number`);
        if (Number.isInteger(open) && Number.isInteger(pay) && pay <= open)
          bad(where, 'pay must come after open — a same-shot question is a seam, not a cross-scene branch');
      });
    }

    if (!Array.isArray(comp.terms)) {
      bad('window.COMPREHENSION', 'terms must be an array — use [] when the narration introduces no unfamiliar term');
    } else {
      if (isShort && comp.terms.length > 3)
        bad('window.COMPREHENSION', `${comp.terms.length} unfamiliar terms — short-form cap 3; replace or remove the extras`);
      const allSpoken = scenes.map(spokenText);
      comp.terms.forEach((entry, i) => {
        const where = `window.COMPREHENSION.terms[${i}]`;
        if (!entry || typeof entry !== 'object') { bad(where, 'term is not an object'); return; }
        const term = String(entry.term || '').trim();
        const plain = String(entry.plain || '').trim();
        const firstShot = Number(entry.firstShot);
        if (!term) bad(where, 'term is empty');
        if (!plain) bad(where, 'plain is empty — write the exact easy wording used in that first shot');
        if (term && plain && term === plain) bad(where, 'plain repeats the term instead of explaining it');
        if (!Number.isInteger(firstShot) || firstShot < 1 || firstShot > scenes.length) {
          bad(where, `firstShot ${JSON.stringify(entry.firstShot)} is not a shot number`);
          return;
        }
        if (scenes[firstShot - 1] && ['broll', 'outro'].indexOf(scenes[firstShot - 1].type) !== -1)
          bad(where, `firstShot ${firstShot} has no narration`);
        const actualFirst = term ? allSpoken.findIndex((text) => text.indexOf(term) !== -1) + 1 : 0;
        if (!actualFirst) bad(where, `term "${term}" never appears in narration`);
        else if (actualFirst !== firstShot)
          bad(where, `firstShot says ${firstShot}, but "${term}" first appears in shot ${actualFirst}`);
        if (plain && allSpoken[firstShot - 1] && allSpoken[firstShot - 1].indexOf(plain) === -1)
          bad(where, `plain wording "${plain}" is not spoken in firstShot ${firstShot}`);
      });
    }

    /* Authored plates on `other` beats are optional and capped by the channel policy
       (htmlPlateMax below). Explanation beats — timeline · statistic · principle — are HTML
       slides by directive (2026-09-05) and are checked at the shot level, outside the cap. */
  }

  if (cover) {
    if (cover.arc && ARCS.indexOf(cover.arc) === -1)
      bad('cover', `arc "${cover.arc}" is outside ${ARCS.join(' · ')}`);
    if (cover.hookType && HOOK_TYPES.indexOf(cover.hookType) === -1)
      bad('cover', `hookType "${cover.hookType}" is outside ${HOOK_TYPES.join(' · ')}`);
    if (cover.hookForm && HOOK_FORMS.indexOf(cover.hookForm) === -1)
      bad('cover', `hookForm "${cover.hookForm}" is outside ${HOOK_FORMS.join(' · ')}`);
    if (!cover.hookType) warn('cover', 'no hookType — an opening with none of the four strategies');
    if (!cover.hookForm) warn('cover', 'no hookForm — the shape of the first line was never picked');
  }

  /* ── Playback order ──
     Format picks the skeleton (scenes-schema §playback order).
       short-form   hook → drip (1–n) → cta     — always. `arc` is ignored.
       long-form    two arcs walk one skeleton:
                    answer-first  cover → hooking → result → body → cta
                    story         cover → hooking → body → turn → result → cta
     A short that writes hooking/result/body/turn is a defect, not an alias. An outro asset
     is the CTA on long-form only; a short needs a spoken `beat:"cta"` as the last narrated
     shot. storyboard.html's check strip carries the same rule.

     A short-form cover may state the result. `hookType:"spoiler"` and `hookForm:"payoff"` are
     legal on every format (owner directive, the twist reveal moves forward), so the answer-dump
     check below runs on gap covers only — a result-first cover is expected to speak the answer,
     and `payoff` puts the result at 0 s the same way `spoiler` does (§the four opening
     strategies), so both fields excuse it here and in storyboard.html's promise ledger. The
     title and the description are a separate surface and stay under platform-playbook §2. */
  if (isShort && cover && cover.hookType !== 'spoiler' && cover.hookForm !== 'payoff' &&
      comp && typeof comp === 'object' && !Array.isArray(comp)) {
    const ans = compactText(comp.answer);
    if (ans.length >= 8) {
      const hookSpoken = compactText([cover.title, cover.stat, spokenText(cover)].join(' '));
      if (hookSpoken.indexOf(ans) !== -1)
        bad('cover', 'the hook dumps COMPREHENSION.answer while hookType is not "spoiler" — a gap cover ' +
                    'opens the question and the last drip completes the answer; declare hookType:"spoiler" ' +
                    'to reveal on the cover');
    }
  }

  if (isShort) {
    const mainBeats = scenes.map((s, i) => ({ i: i + 1, beat: s.beat, type: s.type }))
      .filter((s) => s.type !== 'broll' && s.type !== 'outro')
      .map((s) => ({ ...s, beat: s.beat || (s.type === 'cover' ? 'hook' : '') }));
    if (mainBeats.length) {
      if (mainBeats[0].beat !== 'hook')
        bad('episode', 'the hook beat is not the first shot — a short opens on the cover');
      const last = mainBeats[mainBeats.length - 1];
      if (last.beat !== 'cta')
        bad('episode', 'a short ends on a spoken CTA — the last narrated shot is beat:"cta" ' +
                      '(an outro asset is not the spoken close)');
      else if (!spokenText(scenes[last.i - 1]).trim())
        bad('episode', 'a short ends on a spoken CTA — the last narrated shot has no narration');
      /* An ask stays optional; a forwardable thing does not — an ask requests behaviour from the
         viewer, while a forwardable thing is one sentence, figure or verdict they can pass on
         as-is. Asking to be shared is an ask, not a trigger. */
      else if (compactLength(((scenes[last.i - 1] || {}).shot || {}).share) < 8)
        bad('episode', 'the close has no share trigger — write shot.share on the beat:"cta" shot: ' +
                      'the one sentence, figure or verdict a viewer would forward as-is');
      const dripCount = mainBeats.filter((s) => s.beat === 'drip').length;
      if (dripCount < 1)
        bad('episode', 'a short has no drip beat — after the hook, 1–n shots pay curiosity in stages ' +
                      '(beat:"drip") before the CTA');
      mainBeats.forEach((s, pos) => {
        if (LONG_FORM_BEATS.indexOf(s.beat) !== -1)
          bad('shot ' + s.i, `beat "${s.beat}" belongs to long-form — a short walks hook → drip → cta`);
        else if (!s.beat)
          bad('shot ' + s.i, 'no beat — a short labels every shot hook · drip · cta');
        else if (s.beat === 'hook' && pos !== 0)
          bad('shot ' + s.i, 'the hook beat is not the first shot — the cover opens the episode');
        else if (s.beat === 'cta' && pos !== mainBeats.length - 1)
          bad('episode', 'a beat comes after the cta — the cta is the very end');
        else if (s.beat === 'drip' && pos === 0)
          bad('shot ' + s.i, 'a short opens on the hook, not a drip');
      });
    }
  } else {
    const beated = scenes.map((s, i) => ({ i: i + 1, beat: s.beat, type: s.type }))
      .filter((s) => s.beat || s.type === 'cover' || s.type === 'outro')
      .map((s) => {
        const inferred = s.beat || (s.type === 'cover' ? 'hook' : 'cta');
        return { ...s, beat: inferred === 'drip' ? 'body' : inferred };
      });

    if (beated.length) {
      const arc = (cover && cover.arc) || 'answer-first';
      const at = (b) => beated.findIndex((s) => s.beat === b);
      const first = { hook: at('hook'), hooking: at('hooking'), result: at('result'),
                      body: at('body'), turn: at('turn'), cta: at('cta') };

      if (first.hook > 0)
        bad('episode', 'the hook beat is not the first shot — the cover opens the episode');
      if (first.hooking === -1)
        warn('episode', 'no hooking beat — the shot after the cover carries the stopped viewer to the result');
      else if (first.hook !== -1 && first.hooking !== first.hook + 1)
        warn('episode', 'hooking is not the shot right after the cover (scenes-schema §hooking)');

      if (first.cta === -1)
        warn('episode', 'no cta beat and no outro — the episode ends without the next value');
      else if (first.cta !== beated.length - 1 && beated.slice(first.cta + 1).some((s) => s.beat !== 'cta'))
        bad('episode', 'a beat comes after the cta — the cta is the very end');

      if (arc === 'story') {
        if (first.turn === -1)
          bad('episode', 'arc "story" with no turn beat — the turn is the moment someone saw it differently, ' +
                         'and the payoff has nothing to land after');
        if (first.result !== -1 && first.turn !== -1 && first.result < first.turn)
          bad('episode', 'the result comes before the turn on a story arc — a payoff shown early closes ' +
                         'the loop and takes away the reason to watch');
        if (first.result !== -1 && first.body !== -1 && first.result < first.body)
          bad('episode', 'the result comes before the body on a story arc — the build has to raise the ' +
                         'tension the payoff answers');
      } else {
        if (first.turn !== -1)
          bad('shot ' + beated[first.turn].i, 'beat "turn" on an answer-first arc — turn is story only');
        if (first.result !== -1 && first.body !== -1 && first.body < first.result)
          bad('episode', 'the body comes before the result on an answer-first arc — method before result ' +
                         'means listening to an explanation without knowing the destination');
        if (first.result === -1)
          warn('episode', 'no result beat on an answer-first arc — the finished thing is never shown properly');
      }
    }
  }

  /* ── Scene transitions — one decision per boundary ──
     Every shot after the first carries a `transition`: the join is chosen from what happens
     between the two shots (scenes-schema §scene transition — the table is an ordered decision),
     and `jcut` is that choice when the two shots are one continuous moment. There is no count
     budget: a join that fits its boundary is never one too many, and a join that does not fit
     is wrong at any count. The field is written in 4b, so in --draft it is reported as later. */
  const firstMain = scenes.findIndex((s) => s.type !== 'broll' && s.type !== 'outro');
  scenes.forEach((s, i) => {
    if (s.type === 'broll' || s.type === 'outro') return;
    const parsed = parseTransition(s.transition);
    const where = 'shot ' + (i + 1);
    if (!parsed) {
      bad(where, `transition "${s.transition}" — ${JOIN_VOCAB} (jcut = the continuity cut, sound leads; cut = smash)`);
      return;
    }
    if (parsed.kind === 'missing') {
      if (i !== firstMain)
        machine(where, 'no transition — every boundary after the first shot is a decision: ' +
                       JOIN_VOCAB + ' (scenes-schema §scene transition)');
      return;
    }
    if (i === firstMain && CARRY_KINDS.indexOf(parsed.kind) !== -1) {
      bad(where, `transition "${parsed.raw}" on the first shot — a carry opens on the previous ` +
                 'shot\'s last frame and there is none. The first shot takes dip, cut, or nothing');
      return;
    }
    const prev = scenes[i - 1];
    if (prev && prev.scene !== undefined && prev.scene === s.scene &&
        MOVED_KINDS.indexOf(parsed.kind) !== -1)
      warn(where, `a ${parsed.kind} inside scene ${s.scene} — same place and time, ` +
                  'where the jcut is the honest join');
  });

  // Validate authored edit fields before assets; incomplete draft transitions are handled above.
  if (scenes.some(s => s.edit !== undefined) && scenes.every((s,i) =>
      i === firstMain || ['broll','outro'].includes(s.type) || s.transition !== undefined)) {
    try { require('../../produce/references/edit-plan.js').preview(scenes); }
    catch (e) { bad('edit plan', e.message); }
  }

  /* Establish, then close (directing-grammar §2 · §6 rule 2). A scene that opens close — the
     mcu hook, a cu, an insert — owes the place, the head count and the distance to the next
     picture shot; fs and ms show a body, not a place, and an HTML explanation screen pays
     nothing. A warning: the reviewer weighs a written reason. */
  {
    const CLOSE_OPEN = ['mcu', 'cu', 'choker', 'ecu', 'insert'];
    const PAYS = ['els', 'ls', 'ws', 'mfs', 'two'];
    const EXPLAIN = ['data_graph', 'editorial_html', 'object_html', 'character_html'];
    const isScreen = (s) => s.shot && s.shot.render && EXPLAIN.indexOf(s.shot.render.mode) !== -1;
    const byScene = new Map();
    scenes.forEach((s, i) => {
      if (s.type === 'outro' || isScreen(s)) return;
      const key = s.scene == null ? 'shot ' + (i + 1) : String(s.scene);
      if (!byScene.has(key)) byScene.set(key, []);
      byScene.get(key).push({ s, i });
    });
    // A scene returning to a place an earlier scene already laid out with a wide carries no debt —
    // the viewer still holds the room (directing-grammar §6 rule 2). The place is sceneSlug's first half,
    // whitespace removed the way structure-contract.js keys places.
    const placeOf = (s) => String(s.sceneSlug || '').split('/')[0].replace(/\s+/g, '');
    const seenWide = new Set();
    byScene.forEach((rows, key) => {
      const first = rows[0].s.shot && rows[0].s.shot.size, second = rows[1] && rows[1].s.shot && rows[1].s.shot.size;
      const place = placeOf(rows[0].s);
      const known = place && seenWide.has(place);
      if (CLOSE_OPEN.indexOf(first) !== -1 && rows[1] && second && PAYS.indexOf(second) === -1 && !known)
        warn('shot ' + (rows[1].i + 1), `scene ${key} opens on ${first} and the next picture shot is ${second} — the close opening owes an ls/els (mfs/two for two people) that says where this is; fs and ms show a body, not a place (directing-grammar §6 rule 2)`);
      if (place && rows.some((r) => PAYS.indexOf(r.s.shot && r.s.shot.size) !== -1)) seenWide.add(place);
    });
  }

  /* Consecutive stills of the same size and angle in one scene read as a jump cut
     (30-degree / two-step-size rule). Filmed cards are the vlog exception, and so is an
     HTML explanation screen (shot.render.mode) — the whole picture changes there. */
  const isExplainScreen = (s) => s.shot && s.shot.render &&
    ['data_graph', 'editorial_html', 'object_html', 'character_html'].indexOf(s.shot.render.mode) !== -1;
  for (let i = 1; i < scenes.length; i++) {
    const prev = scenes[i - 1], cur = scenes[i];
    if (!isStillCard(prev) || !isStillCard(cur)) continue;
    if (isExplainScreen(prev) || isExplainScreen(cur)) continue;
    if (prev.scene === undefined || prev.scene !== cur.scene) continue;
    const pr = SIZE_RANK[prev.shot && prev.shot.size];
    const cr = SIZE_RANK[cur.shot && cur.shot.size];
    const pa = (prev.shot && prev.shot.angle) || 'eye';
    const ca = (cur.shot && cur.shot.angle) || 'eye';
    if (pr !== undefined && pr === cr && pa === ca)
      warn('shot ' + (i + 1), 'same size and angle as the previous still in scene ' + cur.scene +
                              ' — a jump cut. Change size by two steps or the angle (directing-grammar §6)');
  }

  // The format owns the default cap; an explicit channel motion policy may raise or lower it.
  // This is a screen-policy cap: imported generated clips count even when they cost $0.
  const videoSlots = scenes.filter((s) => generatedVideo(s));
  // Long-form counts b-roll and motion backgrounds only (§checklist); a short pays for every
  // generated cut, speech clips included, which the hook rule below enforces.
  const cappedSlots = isShort ? videoSlots : videoSlots.filter((s) => s.type !== 'quote');
  if (cappedSlots.length > motionPolicy.generatedVideoMax)
    bad('episode', `${cappedSlots.length} generated-video slots — b-roll, motion backgrounds` +
                   `${isShort ? ' and speech clips' : ''} count together and cap at ` +
                   `${motionPolicy.generatedVideoMax} ` +
                   '(channel motion policy; format default applies when the profile has no override)');

  /* ── Short-form body (owner directives 2026-09-05 · 2026-09-06) ──
     Only when the channel enables `hook_video` (off by default — content chooses the opening
     treatment) must the cover carry a motion background (`visual.video`, the cover still as the
     engine's source, the title still code-rendered on top) or a recording. Every other generated
     cut writes `visual.why` — the movement itself has to be the content, or the beat is a still
     under its camera move or an HTML motion slide. The machine layer is written in §4b, so a draft defers. */
  if (isShort && cover && motionPolicy.hookVideo) {
    const coverKind = motionKind(cover);
    if (coverKind !== 'ai-video' && coverKind !== 'recording' && coverKind !== 'stock-video')
      machine('shot 1', 'the hook is a still — on a short the cover is video: a motion background under the ' +
                        'code-rendered title (visual.video, the cover still as the source), a recording or a ' +
                        'free stock clip (visual.source — hook_video off in the profile switches this rule off)');
  }
  if (isShort && motionPolicy.hookVideo) {
    const body = videoSlots.filter((s) => s !== cover);
    // One more cut than the hook, whatever the hook is — a recorded or supplied cover does not
    // free its slot for a second generated body cut.
    if (body.length > motionPolicy.generatedVideoMax - 1)
      bad('episode', `${body.length} generated cuts after the hook — a short pays for the hook and ` +
                     `at most ${motionPolicy.generatedVideoMax - 1} more (hook_video); every other cut is a ` +
                     'still under its camera move or an HTML motion slide');
    body.forEach((s) => {
      const v = s.visual || {};
      if (!String(v.why || '').trim())
        machine('shot ' + (scenes.indexOf(s) + 1), 'a generated cut after the hook with no visual.why — on a short the ' +
                'body is a still under its camera move or an HTML motion slide; write why this cut needs the ' +
                'movement itself, or make it a still');
    });
  }

  /* ── True motion coverage ──
     A camera move over one image, a caption swap, and a new still do not qualify. The channel
     chooses which real moving sources count, and may require one visible action per shot. */
  if (!draft && (motionPolicy.minTrueMotion !== null ||
                 motionPolicy.maxConsecutiveStills !== null ||
                 motionPolicy.maxStillSeconds !== null || motionPolicy.requireAction)) {
    const played = playbackShots(scenes);
    const allowed = new Set(motionPolicy.allowedKinds);
    const qualifies = (x) => {
      const kind = motionKind(x.scene);
      if (!kind || !allowed.has(kind)) return false;
      return !motionPolicy.requireAction || !!(x.scene.visual && String(x.scene.visual.action || '').trim());
    };

    if (motionPolicy.requireAction) {
      played.forEach((x) => {
        const kind = motionKind(x.scene);
        if (kind && allowed.has(kind) && !(x.scene.visual && String(x.scene.visual.action || '').trim()))
          bad('shot ' + (x.index + 1), `${kind} counts as true motion only with visual.action under this channel policy`);
      });
    }

    const moving = played.filter(qualifies);
    if (motionPolicy.minTrueMotion !== null && played.length) {
      const required = motionPolicy.minTrueMotion === 'majority'
        ? Math.floor(played.length / 2) + 1
        : Math.ceil(played.length * motionPolicy.minTrueMotion);
      if (moving.length < required)
        bad('episode', `${moving.length}/${played.length} true-motion shots — this channel requires at least ${required}; ` +
                       'Ken Burns, camera-only movement, caption swaps, and still-image changes do not count');
    }

    let run = [], worst = [];
    played.forEach((x) => {
      if (qualifies(x)) run = [];
      else {
        run.push(x);
        if (run.length > worst.length) worst = run.slice();
      }
    });
    const runLabels = (list) => list.map((x) => x.index + 1).join('→');
    if (motionPolicy.maxConsecutiveStills !== null && worst.length > motionPolicy.maxConsecutiveStills)
      bad('episode', `${worst.length} consecutive non-motion shots (${runLabels(worst)}) — channel cap ` +
                     `${motionPolicy.maxConsecutiveStills}`);
    if (motionPolicy.maxStillSeconds !== null && worst.length) {
      const seconds = worst.reduce((sum, x) => {
        const n = Number(x.scene.duration);
        return sum + (Number.isFinite(n) && n > 0 ? n : 0);
      }, 0);
      if (seconds > motionPolicy.maxStillSeconds)
        bad('episode', `${seconds.toFixed(2)}s consecutive non-motion stretch (${runLabels(worst)}) — channel cap ` +
                       `${motionPolicy.maxStillSeconds}s`);
    }
  }

  /* ── Static ground (owner directives 2026-09-03 · 2026-09-05) ──
     A picture that stays the same while the narration runs is a slideshow, whatever moves on
     top of it — captions, a counting number, a camera drift over one still. The clock resets
     only when the picture itself changes: a generated clip (motion background, b-roll, quote
     clip), a recording, or a new still under the next sentence. Since 2026-09-05 a still under
     its camera move is the body of a short, so the limit is one cut (default 8 s, the top of the
     directing-grammar §5 length column) — a longer cut swaps the still per sentence or splits.
     An HTML plate is one picture for its whole length; a motion slide that declares a movement
     per narration group (`slide.motionBeats`) changes the picture every group, so the clock
     runs per group there. */
  if (!draft && motionPolicy.maxStaticGroundSeconds !== null) {
    const rate = (pacing && Number(pacing.rate)) || 4.5;
    const secondsOf = (scene) => {
      const n = Number(scene.duration);
      if (Number.isFinite(n) && n > 0) return n;
      const chars = (scene.narration || []).reduce((sum, seg) =>
        sum + String((seg && (seg.tts || seg.sub)) || '').replace(/\s/g, '').length, 0);
      return chars ? chars / rate + 0.85 : 0;
    };
    playbackShots(scenes).forEach((x) => {
      const scene = x.scene;
      const kind = motionKind(scene);
      if (kind === 'ai-video' || kind === 'recording' || kind === 'stock-video') return;
      const segs = Array.isArray(scene.narration) ? scene.narration.length : 0;
      const stillPerLine = segs > 1 && scene.narration.every((seg) => seg && seg.img);
      const beatPerGroup = segs > 1 && beatsCoverGroups(scene);
      const longest = (stillPerLine || beatPerGroup) ? secondsOf(scene) / segs : secondsOf(scene);
      if (longest > motionPolicy.maxStaticGroundSeconds + 0.01)
        bad('shot ' + (x.index + 1),
            `one picture stays on screen ${longest.toFixed(1)}s — channel limit ${motionPolicy.maxStaticGroundSeconds}s; ` +
            'swap the still per sentence (narration[].img), split the cut, or make it a motion slide with a movement per group');
    });
  }
  if (!draft && motionPolicy.htmlPlateMax !== null) {
    // A plate — one picture for its whole length — is capped. A motion slide with a movement
    // per narration group is a body of its own on any beat since 2026-09-05, and explanation
    // beats are HTML slides by directive; both sit outside the cap. Camera HTML is a
    // photograph renderer, governed by still-run and static-ground limits instead.
    const plates = scenes.filter((scene) => scene && scene.type !== 'outro' && scene.visual &&
      scene.visual.slide && scene.visual.slide.kind !== 'camera' &&
      !beatsCoverGroups(scene) && !INFO_ROLE[scene.shot && scene.shot.infoType]);
    if (plates.length > motionPolicy.htmlPlateMax)
      bad('episode', `${plates.length} HTML plates on other beats — channel cap ${motionPolicy.htmlPlateMax}; ` +
                     'keep plates for one-sentence verdicts, or give the slide a movement per narration group ' +
                     '(slide.motionBeats — a motion slide and an explanation slide sit outside the cap)');
  }

  // ── Shot level ──
  const brollAfters = [];
  scenes.forEach((s, i) => {
    const n = i + 1;
    const where = 'shot ' + n;
    const v = s.visual || {};
    const shot = s.shot || {};
    if ((opts && opts.requireRenderPlan) || shot.render)
      require('./render-routing.js').checkScene(s, { draft, production: win.PRODUCTION }).forEach(message => bad(where, message));

    if (!s.type) { bad(where, 'no type'); return; }
    if (TYPES.indexOf(s.type) === -1) bad(where, `type "${s.type}" is outside ${TYPES.join(' · ')}`);

    if (s.beat && BEATS.indexOf(s.beat) === -1)
      bad(where, `beat "${s.beat}" is outside ${BEATS.join(' · ')}`);
    if (shot.size && SIZES.indexOf(shot.size) === -1)
      bad(where, `shot.size "${shot.size}" is not a size word (directing-grammar §size)`);
    /* The frame cuts the subject somewhere on every shot. A 4b field, so a draft defers. */
    if (s.type !== 'outro' && !shot.size)
      machine(where, 'no shot.size — pick where the frame cuts the subject from what shot.info has to show (directing-grammar §2.1)');
    if (shot.angle && ANGLES.indexOf(shot.angle) === -1)
      bad(where, `shot.angle "${shot.angle}" is not an angle word (directing-grammar §angle)`);
    if (s.type !== 'outro' && !shot.feel)
      warn(where, 'no shot.feel — the camera was chosen without saying what it should make anyone feel');
    if (s.type !== 'outro' && s.type !== 'broll' && !String(shot.info || '').trim())
      bad(where, 'no shot.info — nothing says what the viewer newly learns here');
    if (s.type !== 'outro' && s.type !== 'broll') {
      if (!String(shot.infoType || '').trim())
        bad(where, `no shot.infoType — classify the beat as ${INFO_TYPES.join(' · ')} before choosing its visual`);
      else if (INFO_TYPES.indexOf(shot.infoType) === -1)
        bad(where, `shot.infoType "${shot.infoType}" is outside ${INFO_TYPES.join(' · ')}`);
    }
    /* The forwardable thing. Required on a short's close (checked once at episode level), free
       to appear anywhere else; the label is optional and only has to come from the vocabulary. */
    if (String(shot.shareType || '').trim() && SHARE_TYPES.indexOf(shot.shareType) === -1)
      bad(where, `shot.shareType "${shot.shareType}" is outside ${SHARE_TYPES.join(' · ')}`);

    const slide = v.slide;
    require('./slide-quality.js').checkQuality(slide, (s.narration || []).length)
      .forEach(message => bad(where, message));
    if (slide && slide.motion === true && (slide.kind || 'diagram') === 'diagram') {
      if (!String(slide.treatment || '').trim()) {
        machine(where, 'motion diagram has no slide.treatment — choose editorial when HTML owns the frame, or photo-action when the photographed subject itself changes');
      } else if (slide.treatment === 'footage') {
        bad(where, FOOTAGE_RETIRED);
      } else if (SLIDE_TREATMENTS.indexOf(slide.treatment) === -1) {
        bad(where, `slide.treatment "${slide.treatment}" is outside ${SLIDE_TREATMENTS.join(' · ')}`);
      } else if (slide.treatment === 'editorial') {
        if (EDITORIAL_ROLES.indexOf(slide.role) === -1)
          machine(where, `editorial slide.role "${slide.role}" is outside ${EDITORIAL_ROLES.join(' · ')}`);
        if (!String(slide.motif || '').trim())
          machine(where, 'editorial slide has no motif — name the episode-wide visual device that carries between authored frames');
      } else if (slide.treatment === 'photo-action') {
        if (!String(v.action || '').trim())
          machine(where, 'photo-action slide has no visual.action — name the subject or evidence change, not a camera or overlay move');
        if (!String(slide.plan || '').trim())
          machine(where, 'photo-action slide has no plan — map the subject change to each narration group');
      }
    }

    /* Timeline · statistic · principle are semantic routing decisions, not styling hints.
       They are HTML slides on the studio stage and nothing else (user directive 2026-09-05,
       above every other rule): not a still, not a clip with marks or labels over it, not a photo
       with animated annotations. The authored HTML must expose one declared meaning-bearing
       primitive for every spoken group; render-motion-slide.mjs checks those declarations
       against the rendered DOM. */
    if (INFO_ROLE[shot.infoType] && !productionMode.full(win.PRODUCTION)) {
      const expectedRole = INFO_ROLE[shot.infoType];
      const allowed = INFO_PRIMITIVES[shot.infoType];
      if (!slide) {
        machine(where, `${shot.infoType} beat has no visual.slide — it must be a seekable editorial HTML slide on the studio stage; nothing is drawn over video (directive 2026-09-05)`);
      } else if (slide.treatment === 'footage') {
        /* already reported as FOOTAGE_RETIRED above */
      } else {
        if ((slide.kind || 'diagram') !== 'diagram')
          machine(where, `${shot.infoType} beat uses kind:"${slide.kind}" — it must use kind:"diagram"`);
        if (slide.motion !== true)
          machine(where, `${shot.infoType} beat has no slide.motion:true — a still frame is not allowed`);
        if (slide.treatment !== 'editorial')
          machine(where, `${shot.infoType} beat uses treatment:"${slide.treatment}" — it must use treatment:"editorial" (an HTML slide; nothing is drawn over video)`);
        if (slide.role !== expectedRole)
          machine(where, `${shot.infoType} beat uses slide.role:"${slide.role}" — expected "${expectedRole}"`);

        const beats = slide.motionBeats;
        const segs = Array.isArray(s.narration) ? s.narration.length : 0;
        if (!Array.isArray(beats) || !beats.length) {
          machine(where, `${shot.infoType} beat has no slide.motionBeats — declare one semantic primitive per narration group`);
        } else {
          const groups = new Map();
          beats.forEach((beat, j) => {
            const at = `${where} motionBeats[${j}]`;
            if (!beat || typeof beat !== 'object' || Array.isArray(beat)) {
              machine(at, 'motion beat is not an object');
              return;
            }
            const group = Number(beat.group);
            if (!Number.isInteger(group) || group < 1) machine(at, `group ${JSON.stringify(beat.group)} is not a positive integer`);
            else groups.set(group, (groups.get(group) || 0) + 1);
            if (allowed.indexOf(beat.primitive) === -1)
              machine(at, `primitive "${beat.primitive}" is outside ${allowed.join(' · ')} for ${shot.infoType}`);
          });
          for (let group = 1; group <= segs; group++) {
            if (!groups.has(group)) machine(where, `slide.motionBeats has no group ${group} for narration[${group - 1}]`);
          }
          groups.forEach((count, group) => {
            if (count > 1) machine(where, `slide.motionBeats repeats group ${group} — one primary movement per narration group`);
          });
          if (shot.infoType === 'principle') {
            const usesShape = beats.some((b) => b && String(b.primitive || '').indexOf('shape-') === 0);
            const hasArts = Array.isArray(slide.arts) && slide.arts.length;
            if (usesShape && !hasArts)
              machine(where, 'principle shape beat has no slide.arts — ink actors sit with h.fig; rules draw the relation');
          }
        }
      }
    } else if (slide && slide.motionBeats !== undefined) {
      /* An `other` beat may declare motionBeats to sit outside html_plate_max (a movement per
         narration group). The exemption is only as good as the declaration, so the same shape
         rules apply: one primitive from the known vocabulary per group, no group repeated. */
      const beats = slide.motionBeats;
      const known = Object.keys(INFO_PRIMITIVES).reduce((acc, k) => acc.concat(INFO_PRIMITIVES[k]), [])
        .filter((x, i, a) => a.indexOf(x) === i);
      if (!Array.isArray(beats) || !beats.length) {
        machine(where, 'slide.motionBeats is empty — declare one semantic primitive per narration group, or drop the key and let the plate count against html_plate_max');
      } else {
        const groups = new Map();
        beats.forEach((beat, j) => {
          const at = `${where} motionBeats[${j}]`;
          if (!beat || typeof beat !== 'object' || Array.isArray(beat)) { machine(at, 'motion beat is not an object'); return; }
          const group = Number(beat.group);
          if (!Number.isInteger(group) || group < 1) machine(at, `group ${JSON.stringify(beat.group)} is not a positive integer`);
          else groups.set(group, (groups.get(group) || 0) + 1);
          if (known.indexOf(beat.primitive) === -1)
            machine(at, `primitive "${beat.primitive}" is outside ${known.join(' · ')}`);
        });
        groups.forEach((count, group) => {
          if (count > 1) machine(where, `slide.motionBeats repeats group ${group} — one primary movement per narration group`);
        });
      }
    }

    // Scene length against the preset band.
    const dur = Number(s.duration);
    if (s.type !== 'outro') {
      if (!Number.isFinite(dur) || dur <= 0) {
        // A b-roll is a generated shot, so the engine is billed for a length it has to be given
        // (§cut length); scenePlan rejects the shot without one.
        warn(where, 'no duration');
      } else if (pacing.sceneMin && (dur < pacing.sceneMin || dur > pacing.sceneMax)) {
        warn(where, `duration ${dur}s — the ${fmt.label} band is ${pacing.sceneMin}~${pacing.sceneMax}s`);
      }
    }

    // Narration segments — the tts spelling is what the engine actually reads.
    (s.narration || []).forEach((seg, j) => {
      if (!seg || typeof seg !== 'object') { bad(where, `narration[${j}] is not an object`); return; }
      if (!seg.tts) machine(where, `narration[${j}] has no tts — the engine reads that field`);
      if (!seg.sub) warn(where, `narration[${j}] has no sub — the subtitle falls back to tts spelling`);
      // A Korean tts line spells numbers and loanwords the way they sound (schema §narration):
      // the engine reads "1900년" and "GPU" on its own terms, the builder counts them as 4 and 3
      // characters against 4 and 3 spoken syllables, and the pronunciation is left to chance.
      // Bracketed acting tags ([whispers], [laughs]) are ElevenLabs directions, not spoken text — skipped.
      const spokenTts = typeof seg.tts === 'string' ? seg.tts.replace(/\[[^\]]*\]/g, '') : '';
      if (/[가-힣]/.test(spokenTts) && /[0-9A-Za-z]/.test(spokenTts))
        warn(where, `narration[${j}].tts has digits or Latin letters (${spokenTts.match(/[0-9A-Za-z]+/g).join(', ')}) — write them as spoken Hangul; the sub field keeps the display spelling`);
    });

    // b-roll's own contract — the parts that break the splice rather than look wrong.
    if (s.type === 'broll') {
      if ((s.narration || []).length)
        bad(where, 'b-roll carries narration — the splice uses the clip\'s own audio (absolute rule 9)');
      if (s.after === undefined || s.after === null) machine(where, 'b-roll has no `after` — nothing says where it cuts in');
      else {
        if (brollAfters.indexOf(s.after) !== -1)
          bad(where, `two b-roll slots share after: ${s.after} — the insert order is undefined`);
        brollAfters.push(s.after);
        const target = scenes[s.after];
        if (!target) bad(where, `after: ${s.after} points at no scene`);
        else if (target.type === 'quote')
          bad(where, `after: ${s.after} is a quote scene — it has no background photo to use as the source`);
      }
      if (!v.src) warn(where, 'b-roll has no src — the source still is what the previous scene showed');
    }

    // Every shot that becomes a generated video leaves the storyboard with its prompt stored
    // and its four camera slots filled — the storyboard is where that is still free to fix.
    if (generatedVideo(s) && v.reuse === undefined) {
      try { scenePlan(s); } catch (e) { machine(where, e.message); }
      // The slot rule lives in production-mode.js (shared with the approval page): a static
      // camera has no speed to state, so that one slot may stay empty (§camera).
      productionMode.missingCameraSlots(v.camera).forEach((slot) => {
        machine(where, `visual.camera.${slot} is empty — a generated shot leaves here with all four filled (speed may stay empty on a static camera)`);
      });
      // A move the viewer cannot see, or a provider camera lock under a written move (production-mode.js).
      productionMode.cameraErrors(s).forEach((e) => machine(where, e));
      const prompt = v.prompt || (v.video && v.video.prompt) ||
                     (v.clip && typeof v.clip === 'object' && v.clip.prompt);
      if (!prompt) machine(where, 'no stored clip prompt — produce sends this verbatim (scenes-schema §clip prompt)');
      else seedancePromptFindings(prompt, engineOf(s)).forEach((f) => machine(where, f));
      // A clip planned silent (generateAudio:false — every full-video cut) has nothing to describe.
      if (!v.audio && s.type !== 'quote' && !(v.video && v.video.generateAudio === false))
        warn(where, 'no visual.audio — the engine invents a soundtrack under the narration');
    }

    // A still never sits frozen under the voice (owner directive 2026-09-03). The builder's
    // Ken Burns is the floor on every still card — build-reel.sh refuses zoom=none and a bare
    // hold there — so a storyboard that asks a still to stand still is caught here first.
    if (motionKind(s) === null && s.type !== 'outro' && v.camera &&
        /^\s*(static|still|hold|none|no move(?:ment)?|fixed|lock(?:ed)?|lock-off|고정|정지)\s*$/i.test(String(v.camera.movement || '')))
      machine(where, `a still with camera.movement "${v.camera.movement}" — a still never sits frozen under the voice; ` +
                     'write dolly in / dolly out / truck / handheld, or leave camera empty for the default drift');

    // A slide names its file and everything it will draw. A still slide is not allowed.
    if (v.slide) {
      if (!v.slide.file) machine(where, 'visual.slide has no file');
      if (!v.slide.plan) warn(where, 'visual.slide has no plan — the approval screen approves that line');
      if (v.slide.motion !== true)
        machine(where, 'visual.slide has no motion:true — a still slide is not allowed');
      if (v.slide.arts != null) {
        if (!Array.isArray(v.slide.arts))
          machine(where, 'slide.arts is not an array — [{ file, prompt, group, move }]');
        else v.slide.arts.forEach((a, j) => {
          const at = `${where} slide.arts[${j}]`;
          if (!a || typeof a !== 'object' || Array.isArray(a)) {
            machine(at, 'art is not an object');
            return;
          }
          if (!a.file) machine(at, 'has no file');
          else if (!ART_FILE.test(a.file))
            machine(at, `file "${a.file}" is not slides/assets/s<shot>-<slug>.png`);
          if (a.move && ART_MOVES.indexOf(a.move) === -1)
            machine(at, `move "${a.move}" is outside ${ART_MOVES.join(' · ')}`);
          const group = Number(a.group);
          if (!Number.isInteger(group) || group < 1)
            machine(at, `group ${JSON.stringify(a.group)} is not a positive integer`);
        });
      }
      // A rendered object (rendered-object.md) is baked, not drawn — the scene names the sheet, the shape
      // and the bake keys so the sheet is reproducible and check-slide.js can find its sidecar.
      if (v.slide.object != null) {
        const ob = v.slide.object;
        const at = `${where} slide.object`;
        if (!ob || typeof ob !== 'object' || Array.isArray(ob)) machine(at, 'is not an object — { file, shape, keys, frames, plan }');
        else if (ob.renderer !== 'mesh' && ob.renderer !== 'blender') {   // mesh · blender fields are slide-quality.js's
          if (!ob.file) machine(at, 'has no file');
          else if (!OBJECT_FILE.test(ob.file)) machine(at, `file "${ob.file}" is not slides/assets/s<shot>-<slug>.png`);
          if (!ob.shape) machine(at, 'has no shape — bake-object.py --shape (disc)');
          if (!ob.keys || !ob.frames) machine(at, 'has no keys/frames — the bake-object.py arguments, so the sheet is reproducible');
          if (!ob.plan) warn(at, 'has no plan — say what the object does on which sentence');
          const segs = Array.isArray(s.narration) ? s.narration.length : 0;
          const seen = new Set();
          String(ob.frames || '').split(/\s+/).filter(Boolean).forEach(tok => {
            const m = /^(\d+):(\d+)$/.exec(tok);
            if (!m) { machine(at, `frames token "${tok}" is not g:n`); return; }
            const g = Number(m[1]), n = Number(m[2]);
            if (g < 1 || (segs && g > segs)) machine(at, `frames names group ${g} for ${segs} narration segments — the runtime counts the sidecar's groups`);
            if (n < 1) machine(at, `frames gives group ${g} no frames`);
            if (seen.has(g)) machine(at, `frames names group ${g} twice`);
            seen.add(g);
          });
          const nk = String(ob.keys || '').split(/\s+/).filter(Boolean).length;
          if (nk && seen.size && nk !== seen.size + 1)
            machine(at, `keys has ${nk} entries for ${seen.size} frames groups — bake-object.py wants groups + 1 (a start state and one per group)`);
        }
      }
      if ((v.slide.kind || 'diagram') === 'kinetic' &&
          !(Array.isArray(v.slide.arts) && v.slide.arts.length))
        warn(where, 'kinetic has no slide.arts — type-only is valid for a verdict or a cross; a supporting picture uses arts or h.disk');
    }

    // A music cue that names nothing leaves the bed where it was, silently.
    if (s.sound && s.sound.cue) {
      const cues = win.MUSIC && typeof win.MUSIC === 'object' ? Object.keys(win.MUSIC) : [];
      if (cues.indexOf(s.sound.cue) === -1)
        bad(where, `sound.cue "${s.sound.cue}" is not in window.MUSIC — the bed stays where it was`);
    }
  });

  return out;
}

function selftest() {
  let failed = 0;
  const ok = (name, cond) => {
    process.stdout.write((cond ? 'ok   ' : 'FAIL ') + name + '\n');
    if (!cond) failed++;
  };
  // The preset keys, spelled the way formats.js spells them — a fixture that invents key names
  // certifies dead code (that is how the shot band went five months without firing).
  const fmt = { format: 'shorts-9x16', label: 'test',
                pacing: { sceneMin: 4, sceneMax: 13, totalMin: 35, totalMax: 120, totalHard: 180,
                          sceneCountMin: 4, sceneCountMax: 7 },
                video: { generatedSecondsMax: 16 } };
  const fmtLong = { format: 'youtube-long-16x9', label: 'test long',
                    pacing: { sceneMin: 6, sceneMax: 20, totalMin: 480, totalMax: 900, totalHard: 1200,
                              sceneCountMin: 28, sceneCountMax: 70 },
                    video: { generatedSecondsMax: 40 } };
  // Legacy fixtures predate the static-ground and plate rules (2026-09-03); they run with the
  // two switched off and the dedicated tests further down pin them.
  const defaultPolicy = normalizeMotionPolicy({ max_static_ground_seconds: 'off', html_plate_max: 'off', hook_video: 'off' }, 2, 'test default');
  const comprehension = {
    mode: 'informational', question: '무엇이 달라졌나요?', answer: '한 가지가 달라졌어요.',
    takeaway: '한 가지만 기억하면 돼요.', branches: [], terms: []
  };
  const run = (scenes, extra, opts) => check(
    Object.assign({ SCENES: scenes, COMPREHENSION: comprehension }, extra || {}), fmt,
    Object.assign({ policy: defaultPolicy }, opts || {}));
  const runLong = (scenes, extra, opts) => check(
    Object.assign({ SCENES: scenes, COMPREHENSION: comprehension }, extra || {}), fmtLong,
    Object.assign({ policy: defaultPolicy }, opts || {}));
  const has = (findings, re) => findings.some((f) => re.test(f.what));
  const bads = (findings) => findings.filter((f) => f.level === 'bad');

  const goodShot = {
    type: 'points', duration: 6, beat: 'drip', transition: 'jcut',
    shot: { feel: 'relief', size: 'mcu', angle: 'eye', info: '한 가지 정보', infoType: 'other' },
    narration: [{ tts: '가', sub: '가' }], visual: {}
  };
  const ctaShot = Object.assign({}, goodShot, {
    beat: 'cta',
    shot: Object.assign({}, goodShot.shot, { share: '하루 한 번이면 충분해요', shareType: 'line' }),
  });
  const cover = { type: 'cover', duration: 5, beat: 'hook',
                  hookType: 'curiosity', hookForm: 'gap',
                  shot: { feel: 'x', size: 'mcu', angle: 'eye', info: '질문', infoType: 'other' },
                  narration: [{ tts: '가', sub: '가' }],
                  visual: { slide: { file: 'slides/s1-evidence.html', kind: 'diagram', motion: true,
                                     treatment: 'editorial', role: 'evidence', motif: 'signal line',
                                     quality: 'object-state-v1', subject: { kind: 'data', changes: [
                                       {group: 1, before: 'separate evidence', after: 'connected evidence', driver: 'relation'}
                                     ] },
                                     plan: 'the evidence enters' } } };
  const shortOK = [cover, goodShot, goodShot, ctaShot];

  ok('a clean episode has no violations',
     bads(run(shortOK)).length === 0);
  ok('a missing comprehension contract is a violation',
     has(bads(check({ SCENES: [cover, goodShot, goodShot, goodShot] }, fmt,
                    { policy: defaultPolicy })), /no window\.COMPREHENSION/));
  ok('an informational short cannot carry a cross-scene branch',
     has(bads(run([cover, goodShot, goodShot, goodShot], { COMPREHENSION: Object.assign({}, comprehension, {
       branches: [{ question: '곁가지는?', open: 2, pay: 3 }]
     }) })), /cross-scene branches/));
  ok('a narrative short may carry one cross-scene branch',
     !has(bads(run([cover, goodShot, goodShot, goodShot], { COMPREHENSION: Object.assign({}, comprehension, {
       mode: 'narrative', branches: [{ question: '무슨 일이 생기나요?', open: 2, pay: 3 }]
     }) })), /cross-scene branches/));
  ok('a term has to carry its plain wording in the first shot',
     has(bads(run([cover, Object.assign({}, goodShot, {
       narration: [{ tts: '모굴 계획이에요.', sub: '모굴 계획이에요.' }]
     }), goodShot, goodShot], { COMPREHENSION: Object.assign({}, comprehension, {
       terms: [{ term: '모굴', plain: '기밀 풍선 임무', firstShot: 2 }]
     }) })), /plain wording/));
  ok('a term with its same-shot explanation passes',
     !has(bads(run([cover, Object.assign({}, goodShot, {
       narration: [{ tts: '기밀 풍선 임무인 모굴 계획이에요.', sub: '기밀 풍선 임무인 모굴 계획이에요.' }]
     }), goodShot, goodShot], { COMPREHENSION: Object.assign({}, comprehension, {
       terms: [{ term: '모굴', plain: '기밀 풍선 임무', firstShot: 2 }]
     }) })), /window\.COMPREHENSION\.terms/));
  ok('a narrated shot without shot.info is a violation',
     has(bads(run([cover, Object.assign({}, goodShot, { shot: { feel: 'x', size: 'mcu', angle: 'eye', infoType: 'other' } })])), /no shot\.info/));
  ok('a shot without shot.size is a violation after the story pass, later in --draft',
     has(bads(run([cover, Object.assign({}, goodShot, { shot: { feel: 'x', angle: 'eye', info: '정보', infoType: 'other' } })])), /no shot\.size/) &&
     run([cover, Object.assign({}, goodShot, { shot: { feel: 'x', angle: 'eye', info: '정보', infoType: 'other' } })], null, { draft: true })
       .some((f) => f.level === 'later' && /no shot\.size/.test(f.what)));
  ok('a narrated shot without shot.infoType is a violation',
     has(bads(run([cover, Object.assign({}, goodShot, { shot: { feel: 'x', size: 'mcu', angle: 'eye', info: '정보' } })])), /no shot\.infoType/));
  ok('an informational short no longer needs an editorial HTML frame (plates are optional since 2026-09-03)',
     !has(bads(run([Object.assign({}, cover, { visual: {} }), goodShot, goodShot, goodShot])), /no editorial HTML frame/));
  ok('a motion diagram declares its treatment',
     has(bads(run([Object.assign({}, cover, { visual: { slide: { motion: true } } }), goodShot, goodShot, goodShot])), /no slide\.treatment/));
  ok('a rendered object names its shape and bake keys',
     has(bads(run([cover, Object.assign({}, goodShot, { visual: { slide: { file: 'slides/s2-disc.html', motion: true,
       treatment: 'editorial', role: 'statistic', motif: 'clay disc', plan: 'x',
       object: { file: 'slides/assets/s2-obj.png', plan: 'x' } } } })])), /has no shape/));
  ok('a rendered object cannot name a frames group the narration has not got',
     has(bads(run([cover, Object.assign({}, goodShot, { visual: { slide: { file: 'slides/s2-disc.html', motion: true,
       treatment: 'editorial', role: 'statistic', motif: 'clay disc', plan: 'x',
       object: { file: 'slides/assets/s2-obj.png', shape: 'disc', keys: '0,16,0 0,16,45 0,16,60', frames: '1:11 99:14', plan: 'x' } } } })])), /frames names group 99/));
  ok('a rendered object carries one key more than it has frames groups',
     has(bads(run([cover, Object.assign({}, goodShot, { visual: { slide: { file: 'slides/s2-disc.html', motion: true,
       treatment: 'editorial', role: 'statistic', motif: 'clay disc', plan: 'x',
       object: { file: 'slides/assets/s2-obj.png', shape: 'disc', keys: '0,16,0 0,16,45', frames: '1:5 2:5', plan: 'x' } } } })])), /keys has 2 entries/));
  ok('an editorial frame declares role and motif',
     has(bads(run([Object.assign({}, cover, { visual: { slide: { motion: true, treatment: 'editorial' } } }), goodShot, goodShot, goodShot])), /slide\.role|no motif/));
  const semantic = (infoType, role, motionBeats) => Object.assign({}, goodShot, {
    shot: Object.assign({}, goodShot.shot, { infoType }),
    visual: { slide: { file: `slides/s2-${infoType}.html`, kind: 'diagram', motion: true,
      treatment: 'editorial', role, motif: 'signal line', plan: 'one move per group', motionBeats } }
  });
  ok('a timeline beat cannot fall back to a still',
     has(bads(run([cover, Object.assign({}, goodShot, {
       shot: Object.assign({}, goodShot.shot, { infoType: 'timeline' })
     }), goodShot, goodShot])), /timeline beat has no visual\.slide/));
  ok('a statistic beat uses the statistic role',
     has(bads(run([cover, semantic('statistic', 'evidence', [{ group: 1, primitive: 'count-up' }]), goodShot, goodShot])), /expected "statistic"/));
  ok('a principle beat declares every narration group',
     has(bads(run([cover, Object.assign({}, semantic('principle', 'mechanism', [{ group: 1, primitive: 'flow-trace' }]), {
       narration: [{ tts: '하나', sub: '하나' }, { tts: '둘', sub: '둘' }]
     }), goodShot, goodShot])), /no group 2/));
  ok('timeline, statistic, and principle HTML contracts pass',
     ['timeline', 'statistic', 'principle'].every((infoType) => {
       const primitive = INFO_PRIMITIVES[infoType][0];
       return !has(bads(run([cover, semantic(infoType, INFO_ROLE[infoType], [{ group: 1, primitive }]), goodShot, goodShot])),
                   /beat has no|expected|motionBeats|primitive/);
     }));
  ok('a principle shape beat without arts is a violation',
     has(bads(run([cover, semantic('principle', 'mechanism', [{ group: 1, primitive: 'shape-enter' }]), goodShot, goodShot])),
         /no slide\.arts/));
  ok('a principle shape beat with arts passes', (() => {
    const s = semantic('principle', 'mechanism', [{ group: 1, primitive: 'shape-enter' }]);
    s.visual.slide.arts = [{ file: 'slides/assets/s2-actor.png', prompt: 'ink person', group: 1, move: 'rise' }];
    return !has(bads(run([cover, s, goodShot, goodShot])), /primitive|slide\.arts/);
  })());
  ok('a named-state principle may skip arts',
     !has(bads(run([cover, semantic('principle', 'mechanism', [{ group: 1, primitive: 'flow-trace' }]), goodShot, goodShot])),
          /slide\.arts/));
  /* What the assembler writes for a seedance route — English, no timecode, and closing on the
     consistency lock. The fixtures carry it whole so they model a storyboard that passes. */
  const SEEDANCE_PROMPT = 'high wide, very slow dolly in, ending on road mid-frame. ' +
    'the riders cross the valley floor. the riders and the valley stay exactly consistent with the input frame.';
  const footageScene = (over) => Object.assign({}, goodShot, {
    visual: Object.assign({ action: 'riders enter the valley',
      slide: Object.assign({ file: 'slides/s2-valley.html', kind: 'diagram', motion: true, treatment: 'footage',
        plan: '① route into the valley', labels: [],
        shots: [{ group: 1, clip: 'slides/footage/s2-g1.mp4', duration: 5, engine: 'seedance', mark: 'dashed route',
                  camera: { movement: 'dolly in', speed: 'very slow', framing: 'high wide', end: 'road mid-frame' },
                  prompt: SEEDANCE_PROMPT, audio: 'wind' }] }, (over && over.slide) || {}) }, (over && over.visual) || {})
  });
  ok('a footage slide is rejected — nothing is drawn over video (directive 2026-09-05)',
     has(bads(run([cover, footageScene(), goodShot, goodShot])), /treatment:"footage" is retired/));
  ok('a footage slide is not an ai-video kind any more', motionKind(footageScene()) === 'motion-slide');
  const videoScene = Object.assign({}, goodShot, {
    visual: { video: { engine: 'seedance', prompt: SEEDANCE_PROMPT }, action: 'riders enter the valley' } });

  // ── static ground · plate cap · budget key (owner directive 2026-09-03) ──
  const groundPolicy = normalizeMotionPolicy({ motion_min_true: 'off' }, 2, 'fixture');
  ok('the new policy keys default plugin-wide',
     groundPolicy.maxStaticGroundSeconds === 8 && groundPolicy.htmlPlateMax === 2 && groundPolicy.videoBudgetUsd === 10 &&
     groundPolicy.hookVideo === false);
  ok('a profile may set or switch the new keys off',
     normalizeMotionPolicy({ max_static_ground_seconds: 'off', html_plate_max: 1, video_budget_usd: 6.5 }, 2, 'fixture').maxStaticGroundSeconds === null &&
     normalizeMotionPolicy({ html_plate_max: 1, video_budget_usd: 6.5 }, 2, 'fixture').htmlPlateMax === 1 &&
     normalizeMotionPolicy({ video_budget_usd: 6.5 }, 2, 'fixture').videoBudgetUsd === 6.5 &&
     normalizeMotionPolicy({ hook_video: 'off' }, 2, 'fixture').hookVideo === false &&
     normalizeMotionPolicy({ hook_video: false }, 2, 'fixture').hookVideo === false &&
     normalizeMotionPolicy({ hookVideo: true }, 2, 'fixture').hookVideo === true);
  ok('hook_video on reads as true (the wording storyboard/SKILL.md uses)',
     normalizeMotionPolicy({ hook_video: 'on' }, 2, 'fixture').hookVideo === true &&
     normalizeMotionPolicy({ hook_video: 'on' }, 2, 'fixture').errors.length === 0);

  // ── channel length band (owner directive 2026-09-07) ──
  ok('an absent length key takes the format band, not off',
     normalizeMotionPolicy({ hook_video: 'off' }, 2, 'fixture', fmt.pacing).lengthMin === 35 &&
     normalizeMotionPolicy({ hook_video: 'off' }, 2, 'fixture', fmt.pacing).lengthMax === 120 &&
     normalizeMotionPolicy(null, 2, 'fixture', fmtLong.pacing).lengthMax === 900);
  ok('a channel may narrow the band from either end',
     normalizeMotionPolicy({ length_min_seconds: 40, length_max_seconds: 75 }, 2, 'fixture', fmt.pacing).lengthMin === 40 &&
     normalizeMotionPolicy({ length_min_seconds: 40, length_max_seconds: 75 }, 2, 'fixture', fmt.pacing).lengthMax === 75 &&
     normalizeMotionPolicy({ lengthMax: 75 }, 2, 'fixture', fmt.pacing).lengthMin === 35);
  ok('a band whose floor is above its ceiling is an error',
     normalizeMotionPolicy({ length_min_seconds: 90, length_max_seconds: 60 }, 2, 'fixture', fmt.pacing)
       .errors.some((e) => /length_min_seconds/.test(e)));
  ok('the band does not switch off — every other key does, this one names the mistake',
     normalizeMotionPolicy({ length_max_seconds: 'off' }, 2, 'fixture', fmt.pacing)
       .errors.some((e) => /length_max_seconds\/lengthMax does not take off/.test(e)) &&
     normalizeMotionPolicy({ length_min_seconds: 'none' }, 2, 'fixture', fmt.pacing)
       .errors.some((e) => /length_min_seconds\/lengthMin does not take off/.test(e)) &&
     normalizeMotionPolicy({ length_max_seconds: 'off' }, 2, 'fixture', fmt.pacing).lengthMax === 120);
  /* A dual-format channel narrows its shorts and nothing else. Reading one key here and
     filling the other from the 8~15 min preset used to cross-check 480 against 75 and fail
     the long-form board on a profile error it had no business reading. */
  ok('long-form reads neither band key, so one end alone stays out of its preset',
     normalizeMotionPolicy({ length_min_seconds: 45 }, 2, 'fixture', fmtLong.pacing, false).lengthMin === null &&
     normalizeMotionPolicy({ length_min_seconds: 45 }, 2, 'fixture', fmtLong.pacing, false).lengthMax === null &&
     normalizeMotionPolicy({ length_max_seconds: 75 }, 2, 'fixture', fmtLong.pacing, false).errors.length === 0);
  ok('a length-only profile counts as declaring a policy',
     MOTION_PROFILE_KEYS.indexOf('length_min_seconds') !== -1 &&
     MOTION_PROFILE_KEYS.indexOf('length_max_seconds') !== -1);
  /* The band is a verdict on the finished board, not just a parsed key — storyboard.html said so
     from the start and this file said nothing until 2026-09-07. */
  const timed = (n, d) => Array.from({ length: n }, (_, i) => Object.assign({}, i === 0 ? cover : i === n - 1 ? ctaShot : goodShot, { duration: d }));
  const bandPolicy = (raw) => normalizeMotionPolicy(raw, 2, 'fixture', fmt.pacing);
  const atLevel = (findings, level) => findings.filter((f) => f.level === level);
  ok('a short inside the band says nothing about its length',
     !has(run(timed(6, 8), null, { policy: bandPolicy({ hook_video: 'off' }) }), /main body/));
  ok('a short under the band is a warning, not a violation',
     has(atLevel(run(timed(4, 5), null, { policy: bandPolicy({ hook_video: 'off' }) }), 'warn'), /main body 20s — outside the default 35s~120s/) &&
     !has(bads(run(timed(4, 5), null, { policy: bandPolicy({ hook_video: 'off' }) })), /main body/));
  ok('a channel that narrows the band is the one quoted back',
     has(atLevel(run(timed(10, 8), null, { policy: bandPolicy({ length_max_seconds: 50 }) }), 'warn'), /main body 80s — outside the channel band 35s~50s/));
  ok('past the 180s hard cap is a violation, and no channel key moves it',
     has(bads(run(timed(24, 8), null, { policy: bandPolicy({ length_max_seconds: 300 }) })), /main body 192s — past the cap of 180s/));
  ok('the channel band is short-form only — long-form is measured against its own preset',
     !has(runLong(timed(31, 20), null, { policy: bandPolicy({ length_max_seconds: 75 }) }), /main body/) &&
     has(atLevel(runLong(timed(20, 20), null, { policy: bandPolicy({ length_max_seconds: 75 }) }), 'warn'),
         /main body 400s — outside the default 480s~900s/));
  ok('a board with no durations yet is left to the per-scene warning',
     !has(run(timed(4, 0).map((s) => { const c = Object.assign({}, s); delete c.duration; return c; }),
              null, { policy: bandPolicy({ hook_video: 'off' }) }), /main body/));
  ok('the band is part of the profile↔scenes comparison',
     policyComparable(normalizeMotionPolicy({ length_max_seconds: 75 }, 2, 'profile', fmt.pacing)) !==
     policyComparable(normalizeMotionPolicy({ lengthMax: 90 }, 2, 'scenes', fmt.pacing)) &&
     policyComparable(normalizeMotionPolicy({ length_max_seconds: 75 }, 2, 'profile', fmt.pacing)) ===
     policyComparable(normalizeMotionPolicy({ lengthMax: 75 }, 2, 'scenes', fmt.pacing)));
  ok('a still under its camera move holds one cut (8 s)',
     !has(bads(run([videoScene, goodShot, videoScene], null, { policy: groundPolicy })), /one picture stays/));
  ok('a still that holds one picture past one cut is rejected',
     has(bads(run([videoScene, Object.assign({}, goodShot, { duration: 10 }), videoScene], null, { policy: groundPolicy })), /one picture stays on screen 10\.0s/));
  ok('a motion background never holds one picture',
     !has(bads(run([videoScene, videoScene, videoScene], null, { policy: groundPolicy })), /one picture stays/));
  ok('a still per sentence resets the static-ground clock',
     !has(bads(run([videoScene, Object.assign({}, goodShot, { narration: [{ tts: '가', sub: '가', img: 'a.png' }, { tts: '나', sub: '나', img: 'b.png' }] }), videoScene],
                   null, { policy: groundPolicy })), /one picture stays/));
  ok('a motion background resets the static-ground clock',
     !has(bads(run([videoScene, Object.assign({}, goodShot, { visual: { video: { engine: 'seedance', prompt: SEEDANCE_PROMPT }, action: 'waves' } }), videoScene],
                   null, { policy: groundPolicy })), /one picture stays/));
  ok('an HTML plate longer than the limit is one picture',
     has(bads(run([videoScene, Object.assign({}, cover, { duration: 9 }), videoScene], null, { policy: groundPolicy })), /one picture stays on screen 9\.0s/));
  ok('a still per sentence past the limit is caught per sentence',
     has(bads(run([videoScene, Object.assign({}, goodShot, { duration: 20, narration: [{ tts: '가', sub: '가', img: 'a.png' }, { tts: '나', sub: '나', img: 'b.png' }] }), videoScene],
                  null, { policy: groundPolicy })), /one picture stays on screen 10\.0s/));
  const explain = (d, n) => Object.assign({}, semantic('statistic', 'statistic',
      Array.from({ length: n }, (_, g) => ({ group: g + 1, primitive: 'count-up' }))),
    { duration: d, narration: Array.from({ length: n }, () => ({ tts: '가', sub: '가' })) });
  ok('an explanation slide with a movement per group runs the static-ground clock per group',
     !has(bads(run([videoScene, explain(14, 2), videoScene], null, { policy: groundPolicy })), /one picture stays/));
  ok('an explanation slide whose one group outruns the limit is still one picture',
     has(bads(run([videoScene, explain(18, 2), videoScene], null, { policy: groundPolicy })), /one picture stays on screen 9\.0s/));
  const plateScene = (d) => Object.assign({}, cover, { type: 'points', beat: 'drip', transition: 'jcut', hookType: undefined, hookForm: undefined, duration: d });
  ok('HTML plates over the channel cap are rejected',
     has(bads(run([videoScene, plateScene(3), plateScene(3), plateScene(3)], null, { policy: groundPolicy })), /3 HTML plates on other beats — channel cap 2/));
  const cameraPlate = (d) => Object.assign({}, plateScene(d), { visual: { bg: 'images/rider.png',
    slide: { kind: 'camera', motion: true, file: 'slides/s1-rider.html', plan: 'Approach the rider.' } } });
  ok('camera photographs do not consume the text plate allowance',
     !has(bads(run([cameraPlate(3), cameraPlate(3), cameraPlate(3)], null, { policy: groundPolicy })), /HTML plates/));
  ok('camera photographs still obey the static-ground clock',
     has(bads(run([cameraPlate(9)], null, { policy: groundPolicy })), /one picture stays on screen 9\.0s/));
  ok('explanation slides sit outside the plate cap',
     !has(bads(run([videoScene, explain(3, 1), explain(3, 1), explain(3, 1)], null, { policy: groundPolicy })), /HTML plates/));
  const motionPlate = (d) => Object.assign({}, plateScene(d), { visual: { slide: Object.assign({}, cover.visual.slide,
    { motionBeats: [{ group: 1, primitive: 'count-up' }] }) } });
  ok('a motion slide with a movement per group sits outside the plate cap on any beat (directive 2026-09-05)',
     !has(bads(run([videoScene, motionPlate(3), motionPlate(3), motionPlate(3)], null, { policy: groundPolicy })), /HTML plates/));
  const badBeatPlate = Object.assign({}, plateScene(3), { visual: { slide: Object.assign({}, cover.visual.slide,
    { motionBeats: [{ group: 1, primitive: 'anything' }] }) } });
  ok('the exemption is checked — an unknown primitive on an other beat is a violation',
     has(bads(run([videoScene, badBeatPlate, goodShot], null, { policy: groundPolicy })), /primitive "anything" is outside/));
  ok('an empty motionBeats on an other beat is a violation',
     has(bads(run([videoScene, Object.assign({}, plateScene(3), { visual: { slide: Object.assign({}, cover.visual.slide, { motionBeats: [] }) } }), goodShot],
                  null, { policy: groundPolicy })), /motionBeats is empty/));

  // ── short-form body (owner directive 2026-09-05) — the hook is video, one more cut writes why ──
  const hookPolicy = normalizeMotionPolicy({ hook_video: true, motion_min_true: 'off', max_static_ground_seconds: 'off', html_plate_max: 'off' }, 2, 'fixture');
  const videoCover = Object.assign({}, cover, { visual: { bg: 'images/scene-1.png', bgPrompt: 'x',
    video: { engine: 'seedance', prompt: SEEDANCE_PROMPT }, action: 'she turns to the window' } });
  ok('a still hook on a short is rejected',
     has(bads(run([cover, goodShot, ctaShot], null, { policy: hookPolicy })), /the hook is a still/));
  ok('a motion background under the cover is the hook',
     !has(bads(run([videoCover, goodShot, ctaShot], null, { policy: hookPolicy })), /the hook is a still/));
  const videoCoverSlide = Object.assign({}, videoCover, { visual: Object.assign({}, videoCover.visual,
    { slide: Object.assign({}, cover.visual.slide, { motion: true, treatment: 'photo-action', plan: 'x' }) }) });
  ok('a motion background under a motion-slide overlay is still the hook (the ground decides)',
     !has(bads(run([videoCoverSlide, goodShot, ctaShot], null, { policy: hookPolicy })), /the hook is a still/));
  ok('the same cover does not run the static-ground clock',
     !has(bads(run([Object.assign({}, videoCoverSlide, { duration: 12 }), goodShot, ctaShot], null, { policy: groundPolicy })), /shot 1 +one picture stays/));
  ok('a recorded cover is a hook too',
     !has(bads(run([Object.assign({}, cover, { visual: { source: 'recording', clip: 'footage/s1-desk.mp4' } }), goodShot, ctaShot],
                   null, { policy: hookPolicy })), /the hook is a still/));
  ok('a draft defers the hook rule to the machine layer',
     !has(bads(run([cover, goodShot, ctaShot], null, { policy: hookPolicy, draft: true })), /the hook is a still/));
  ok('hook_video off keeps a still hook',
     !has(bads(run([cover, goodShot, ctaShot], null, { policy: normalizeMotionPolicy({ hook_video: 'off', motion_min_true: 'off', max_static_ground_seconds: 'off', html_plate_max: 'off' }, 2, 'fixture') })), /the hook is a still/));
  ok('long-form does not run the hook rule',
     !has(bads(runLong([cover, goodShot, goodShot, goodShot], null, { policy: hookPolicy })), /the hook is a still/));
  ok('a generated cut after the hook needs visual.why on a short',
     has(bads(run([videoCover, videoScene, ctaShot], null, { policy: hookPolicy })), /no visual\.why/));
  ok('visual.why clears the second cut',
     !has(bads(run([videoCover, Object.assign({}, videoScene, { visual: Object.assign({}, videoScene.visual, { why: 'the riders entering is the sentence' }) }), ctaShot],
                   null, { policy: hookPolicy })), /no visual\.why/));
  ok('the hook slot itself needs no visual.why',
     !has(bads(run([videoCover, goodShot, ctaShot], null, { policy: hookPolicy })), /no visual\.why/));
  const quoteClip = Object.assign({}, goodShot, { type: 'quote', speaker: 'the pilot',
    visual: Object.assign({}, goodShot.visual, { clip: { prompt: SEEDANCE_PROMPT, engine: 'veo' } }) });
  ok('a speech clip is a generated cut, so the hook rule reads it too',
     has(bads(run([videoCover, quoteClip, ctaShot], null, { policy: hookPolicy })), /no visual\.why/));
  ok('speech clips count against the generated-slot cap',
     has(bads(run([videoCover, quoteClip, quoteClip, ctaShot], null, { policy: hookPolicy })), /generated-video slots/));
  ok('a recorded hook does not free a second generated body cut',
     has(bads(run([Object.assign({}, cover, { visual: { source: 'recording', clip: 'footage/s1-desk.mp4' } }),
                   Object.assign({}, videoScene, { visual: Object.assign({}, videoScene.visual, { why: 'the movement is the sentence' }) }),
                   Object.assign({}, videoScene, { visual: Object.assign({}, videoScene.visual, { why: 'the movement is the sentence' }) }),
                   ctaShot], null, { policy: hookPolicy })), /generated cuts after the hook/));
  ok("produce's own clip record does not turn the checks off on a rebuild",
     has(bads(run([Object.assign({}, videoCover, { visual: Object.assign({}, videoCover.visual,
       { video: Object.assign({}, videoCover.visual.video, { clip: '.work/motion/motion-i0.mp4' }) }) }),
       Object.assign({}, videoScene, { visual: Object.assign({}, videoScene.visual,
         { video: Object.assign({}, videoScene.visual.video || {}, { clip: '.work/motion/motion-i1.mp4' }) }) }),
       videoScene, ctaShot], null, { policy: hookPolicy })), /generated cuts after the hook/));
  ok('a recording marker does not hide a generated shape from the cap',
     has(bads(run([Object.assign({}, videoCover, { visual: Object.assign({}, videoCover.visual,
       { source: 'recording', clip: 'footage/s1.mp4' }) }),
       videoScene, videoScene, ctaShot], null, { policy: hookPolicy })), /generated-video slots/));
  ok('long-form counts b-roll and motion backgrounds only, as the checklist says',
     !has(bads(runLong([cover, quoteClip, quoteClip, quoteClip, quoteClip, quoteClip, quoteClip, goodShot])),
          /generated-video slots/));

  // ── free stock material (scenes-schema §stock material) — a supplied clip with its license record ──
  const stockLicense = { provider: 'pexels', url: 'https://www.pexels.com/video/1', license: 'Pexels License',
    licenseUrl: 'https://www.pexels.com/license/', author: 'A. Filmer', attributionRequired: false,
    commercial: true, modify: true, retrievedAt: '2026-09-07' };
  const stockScene = Object.assign({}, goodShot, {
    shot: Object.assign({}, goodShot.shot, { render: { mode: 'stock_video', purpose: 'archive',
      reason: 'the actual 1961 street is the sentence', action: 'trams cross the square' } }),
    visual: { source: 'stock', clip: 'footage/s2-pexels-1.mp4', license: stockLicense } });
  ok('a stock clip with its license passes',
     !has(bads(run([videoCover, stockScene, ctaShot], null, { policy: hookPolicy })), /shot 2/));
  ok('a stock clip is not a generated slot and needs no visual.why',
     !has(bads(run([videoCover, stockScene, stockScene, ctaShot], null, { policy: hookPolicy })), /generated cuts after the hook|no visual\.why|generated-video slots/));
  ok('a stock cover is a hook',
     !has(bads(run([Object.assign({}, cover, { shot: Object.assign({}, cover.shot, { render: stockScene.shot.render }),
       visual: stockScene.visual }), goodShot, ctaShot], null, { policy: hookPolicy })), /the hook is a still/));
  ok('a stock clip does not run the static-ground clock',
     !has(bads(run([videoScene, Object.assign({}, stockScene, { duration: 12 }), videoScene], null, { policy: groundPolicy })), /one picture stays/));
  ok('a stock clip without its license record is rejected',
     has(bads(run([videoCover, Object.assign({}, stockScene, { visual: { source: 'stock', clip: 'footage/s2-pexels-1.mp4' } }), ctaShot],
                  null, { policy: hookPolicy })), /visual\.license/));
  ok('a non-commercial or share-alike license is rejected',
     has(bads(run([videoCover, Object.assign({}, stockScene, { visual: Object.assign({}, stockScene.visual,
       { license: Object.assign({}, stockLicense, { commercial: false }) }) }), ctaShot], null, { policy: hookPolicy })), /commercial must be true/) &&
     has(bads(run([videoCover, Object.assign({}, stockScene, { visual: Object.assign({}, stockScene.visual,
       { license: Object.assign({}, stockLicense, { shareAlike: true }) }) }), ctaShot], null, { policy: hookPolicy })), /share-alike/));
  ok('a credit-required license without attribution text is rejected',
     has(bads(run([videoCover, Object.assign({}, stockScene, { visual: Object.assign({}, stockScene.visual,
       { license: Object.assign({}, stockLicense, { attributionRequired: true }) }) }), ctaShot], null, { policy: hookPolicy })), /attribution text/));
  ok('a stock clip waits for its file only outside --draft',
     !has(bads(run([videoCover, Object.assign({}, stockScene, { visual: { source: 'stock', license: stockLicense } }), ctaShot],
                   null, { policy: hookPolicy, draft: true })), /visual\.clip/) &&
     has(bads(run([videoCover, Object.assign({}, stockScene, { visual: { source: 'stock', license: stockLicense } }), ctaShot],
                  null, { policy: hookPolicy })), /visual\.clip under footage/));
  ok('a portrait purpose cannot take the stock route',
     has(bads(run([videoCover, Object.assign({}, stockScene, { shot: Object.assign({}, stockScene.shot,
       { render: Object.assign({}, stockScene.shot.render, { purpose: 'portrait' }) }) }), ctaShot], null, { policy: hookPolicy })), /requires still_camera/));
  const statFootage = Object.assign({}, footageScene({ slide: { labels: ['34개'] } }), {
    shot: Object.assign({}, goodShot.shot, { infoType: 'statistic' }) });
  ok('a statistic beat on footage is rejected even with labels',
     has(bads(run([cover, statFootage])), /treatment:"footage" is retired/));
  ok('an invented arts move is caught',
     has(bads(run([cover, Object.assign({}, goodShot, {
       visual: { slide: { file: 'slides/s2-k.html', kind: 'kinetic', motion: true, plan: 'x',
         arts: [{ file: 'slides/assets/s2-k.png', group: 1, move: 'spin' }] } }
     }), goodShot, goodShot])), /move "spin"/));
  const warns = (findings) => findings.filter((f) => f.level === 'warn');
  ok('a type-only kinetic is a warning, not a violation', (() => {
    const findings = run([cover, Object.assign({}, goodShot, {
      visual: { slide: { file: 'slides/s2-k.html', kind: 'kinetic', motion: true, plan: 'x' } }
    }), goodShot, goodShot]);
    return !has(bads(findings), /slide\.arts/) && has(warns(findings), /no slide\.arts/);
  })());
  ok('a kinetic with arts is quiet on that warning',
     !has(warns(run([cover, Object.assign({}, goodShot, {
       visual: { slide: { file: 'slides/s2-k.html', kind: 'kinetic', motion: true, plan: 'x',
         arts: [{ file: 'slides/assets/s2-k.png', group: 1, move: 'travel' }] } }
     }), goodShot, goodShot])), /no slide\.arts/));
  ok('a missing cover is a violation', has(bads(run([goodShot])), /no cover/));
  ok('an invented size word is caught',
     has(bads(run([cover, Object.assign({}, goodShot, { shot: { feel: 'x', size: 'closeup' } })])), /size "closeup"/));
  ok('an invented angle word is caught',
     has(bads(run([cover, Object.assign({}, goodShot, { shot: { feel: 'x', angle: 'tilted' } })])), /angle "tilted"/));
  ok('an invented beat is caught',
     has(bads(run([cover, Object.assign({}, goodShot, { beat: 'middle' })])), /beat "middle"/));
  ok('a hookForm outside the six is caught',
     has(bads(run([Object.assign({}, cover, { hookForm: 'shock' })])), /hookForm "shock"/));

  // narration
  ok('a narration segment with no tts is a violation',
     has(bads(run([cover, Object.assign({}, goodShot, { narration: [{ sub: '가' }] })])), /no tts/));
  ok('digits or Latin letters in a Korean tts line are warned',
     has(warns(run([cover, Object.assign({}, goodShot, { narration: [{ tts: '1900년에 GPU를 썼어요', sub: '1900년에 GPU를 썼어요' }] })])), /digits or Latin letters \(1900, GPU\)/));
  ok('an ElevenLabs acting tag in a Korean tts line is not flagged as Latin',
     !has(warns(run([cover, Object.assign({}, goodShot, { narration: [{ tts: '[whispers] 천구백년에 발견됐어요', sub: '1900년에 발견됐어요' }] })])), /digits or Latin/));
  ok('a Korean tts line spelled as spoken passes',
     !has(warns(run([cover, Object.assign({}, goodShot, { narration: [{ tts: '천구백년에 지피유를 썼어요', sub: '1900년에 GPU를 썼어요' }] })])), /digits or Latin/));

  // b-roll
  const broll = { type: 'broll', after: 0, duration: 4, narration: [],
                  shot: { feel: 'x', size: 'mcu', angle: 'eye' },
                  visual: { src: 'images/scene-1.png', prompt: 'p', audio: 'a',
                            camera: { movement: 'dolly in', speed: 'slow', framing: 'chest-up', end: 'centred' } } };
  ok('a slide without motion:true is a violation',
     has(bads(run([cover, Object.assign({}, goodShot, { visual: { slide: { file: 'slides/s2-x.html', plan: 'a list' } } }), goodShot, goodShot])), /no motion:true/));
  ok('a well-formed b-roll passes', bads(run([cover, goodShot, ctaShot, broll])).length === 0);
  ok('b-roll carrying narration is a violation',
     has(bads(run([cover, goodShot, Object.assign({}, broll, { narration: [{ tts: 'x', sub: 'x' }] })])),
         /uses the clip's own audio/));
  ok('two b-roll slots on the same after is a violation',
     has(bads(run([cover, goodShot, broll, Object.assign({}, broll)])), /share after/));
  ok('b-roll after a quote scene is a violation',
     has(bads(run([Object.assign({}, cover, { type: 'quote' }), cover,
                   Object.assign({}, broll, { after: 0 })])), /quote scene/));

  // generated video
  const noSlots = Object.assign({}, goodShot, { visual: { video: { prompt: SEEDANCE_PROMPT }, audio: 'a' } });
  ok('a generated shot with empty camera slots is a violation',
     bads(run([cover, noSlots])).filter((f) => /visual\.camera\./.test(f.what)).length === 4);
  ok('a generated shot with no stored prompt is a violation',
     has(bads(run([cover, Object.assign({}, goodShot, {
       visual: { video: {}, audio: 'a',
                 camera: { movement: 'a', speed: 'b', framing: 'c', end: 'd' } } })])),
       /no stored clip prompt/));

  /* ── The seedance lane's own prompt rules (video-model-selection §Prompt grammar) ──
     The engine reads Chinese or English, has no negativePrompt argument, self-reports unstable
     precision timing, and wants the consistency lock. The checks are the assembler's own, so a
     prompt this rejects is one assemble-bg-prompt.js would have refused to write. */
  const motionScene = (prompt, over) => Object.assign({}, goodShot, {
    visual: Object.assign({ video: { prompt }, audio: 'wind',
      camera: { movement: 'dolly in', speed: 'very slow', framing: 'high wide', end: 'road mid-frame' } }, over || {}) });
  ok('a motion background with the assembled prompt passes',
     !has(bads(run([cover, motionScene(SEEDANCE_PROMPT), goodShot, goodShot])), /clip prompt/));
  ok('Korean in a seedance prompt is a violation',
     has(bads(run([cover, motionScene(SEEDANCE_PROMPT + ' 말들이 계곡을 건넌다.'), goodShot, goodShot])), /carries Korean/));
  ok('Korean inside a dialogue quote passes',
     !has(bads(run([cover, motionScene(SEEDANCE_PROMPT + ' the rider calls "이랴" once.'), goodShot, goodShot])), /carries Korean/));
  ok('a seedance prompt with no consistency lock is a violation',
     has(bads(run([cover, motionScene('high wide, very slow dolly in, ending on road mid-frame. the riders cross the valley floor.'),
                   goodShot, goodShot])), /no consistency lock/));
  ok('a negative directive in a seedance prompt is a violation',
     has(bads(run([cover, motionScene(SEEDANCE_PROMPT + ' no dust, no birds.'), goodShot, goodShot])), /negative directive/));
  ok('the artifact classes may stay negative on seedance',
     !has(bads(run([cover, motionScene(SEEDANCE_PROMPT + ' avoid generating any text or subtitles.'), goodShot, goodShot])), /negative directive/));
  ok('a timecode in a seedance prompt is a violation',
     has(bads(run([cover, motionScene(SEEDANCE_PROMPT + ' at [00:04] the riders stop.'), goodShot, goodShot])), /clock timecode/));
  ok('the same prompt on a veo route is not this check\'s business',
     !has(bads(run([cover, motionScene(SEEDANCE_PROMPT + ' 말들이 계곡을 건넌다. at [00:04] they stop.', { engine: 'veo' }),
                    goodShot, goodShot])), /carries Korean|clock timecode/));
  ok('the seedance prompt rules wait for the camera pass (--draft)',
     !has(bads(run([cover, motionScene('high wide, very slow dolly in. the riders cross.'), goodShot, goodShot], null, { draft: true })),
          /no consistency lock/));

  // ── scene transitions ──
  const dz = (over) => Object.assign({}, goodShot, over);
  ok('no transition anywhere is clean (the default is a cut)',
     bads(run(shortOK)).length === 0);
  ok('one dissolve is within budget',
     bads(run([cover, goodShot, dz({ transition: 'dissolve' }), ctaShot])).length === 0);
  ok('dip and push are valid joins',
     bads(run([cover, goodShot, dz({ transition: 'dip' }), ctaShot])).length === 0 &&
     bads(run([cover, goodShot, dz({ transition: 'push:l2r' }), ctaShot])).length === 0);
  ok('iris, blur, zoom and whip are valid joins',
     ['iris', 'blur', 'zoom', 'whip:r2l'].every((t) =>
       bads(run([cover, goodShot, dz({ transition: t }), ctaShot])).length === 0));
  ok('whip without a direction is a violation',
     has(bads(run([cover, goodShot, dz({ transition: 'whip' })])), /whip:l2r/));
  ok('three visible joins in a short are clean — there is no count budget',
     bads(run([cover, goodShot, dz({ transition: 'iris' }), dz({ transition: 'blur' }),
               dz({ transition: 'zoom' }), ctaShot])).length === 0);
  ok('a shot after the first with no transition is a violation',
     has(bads(run([cover, goodShot, dz({ transition: undefined }), ctaShot])), /no transition/));
  ok('a carry on the first shot is a violation, a dip is not',
     has(bads(run([Object.assign({}, cover, { transition: 'dissolve' }), goodShot, ctaShot])), /first shot/) &&
     !has(bads(run([Object.assign({}, cover, { transition: 'dip' }), goodShot, ctaShot])), /first shot/));
  ok('an iris inside one scene is flagged, a whip is not',
     has(run([cover, Object.assign({}, goodShot, { scene: 2 }),
              dz({ transition: 'iris', scene: 2 })]), /same place and time/) &&
     !has(run([cover, Object.assign({}, goodShot, { scene: 2 }),
               dz({ transition: 'whip:r2l', scene: 2 })]), /same place and time/));
  ok('explicit cut and jcut are clean',
     bads(run([cover, goodShot, dz({ transition: 'cut' }), dz({ transition: 'jcut' }), ctaShot])).length === 0);
  ok('a value outside the join vocabulary is a violation',
     has(bads(run([cover, goodShot, dz({ transition: 'fade' })])), /jcut \| cut \| dissolve \| dip/));
  ok('three dissolves in a short are clean',
     bads(run([cover, goodShot, dz({ transition: 'dissolve' }), dz({ transition: 'dissolve' }),
               dz({ transition: 'dissolve' }), ctaShot])).length === 0);
  ok('a dissolve on the shot after the hook is clean',
     bads(run([cover, dz({ transition: 'dissolve' }), goodShot, ctaShot])).length === 0);
  ok('a dissolve inside one scene is flagged',
     has(run([cover, Object.assign({}, goodShot, { scene: 2 }),
              dz({ transition: 'dissolve', scene: 2 })]), /same place and time/));
  ok('an explanation screen after a still of the same size is not a jump cut',
     !run([cover,
           Object.assign({}, goodShot, { scene: 2, shot: { feel: 'a', size: 'ls', angle: 'eye', info: 'one', infoType: 'other' } }),
           Object.assign({}, goodShot, { scene: 2, shot: { feel: 'b', size: 'ls', angle: 'eye', info: 'two', infoType: 'statistic', render: { mode: 'data_graph', purpose: 'compare', reason: 'x' } } })])
       .some((f) => /jump cut/.test(f.what)));
  ok('a scene opening on the mcu hook followed by an insert owes its wide',
     run([Object.assign({}, cover, { scene: 1 }), Object.assign({}, goodShot, { scene: 1, shot: { feel: 'a', size: 'insert', angle: 'eye', info: 'one', infoType: 'other' } }),
          Object.assign({}, goodShot, { scene: 2, shot: { feel: 'b', size: 'ls', angle: 'eye', info: 'two', infoType: 'other' } }), ctaShot])
       .some((f) => f.level === 'warn' && /close opening owes/.test(f.what) && f.where === 'shot 2'));
  ok('a scene returning to a place an earlier scene laid out with a wide owes nothing',
     !run([Object.assign({}, cover, { scene: 1, sceneSlug: '마당 / 아침' }),
           Object.assign({}, goodShot, { scene: 1, sceneSlug: '마당 / 아침', shot: { feel: 'a', size: 'ls', angle: 'eye', info: 'one', infoType: 'other' } }),
           Object.assign({}, goodShot, { scene: 2, sceneSlug: '마당 / 낮', shot: { feel: 'b', size: 'insert', angle: 'eye', info: 'two', infoType: 'other' } }),
           Object.assign({}, goodShot, { scene: 2, sceneSlug: '마당 / 낮', shot: { feel: 'c', size: 'mcu', angle: 'eye', info: 'three', infoType: 'other' } }), ctaShot])
       .some((f) => /close opening owes/.test(f.what)));
  ok('an ls after the mcu hook pays the debt, and an explanation screen between them is skipped',
     !run([Object.assign({}, cover, { scene: 1 }),
           Object.assign({}, goodShot, { scene: 1, shot: { feel: 'a', size: 'insert', angle: 'eye', info: 'one', infoType: 'other', render: { mode: 'data_graph', purpose: 'compare', reason: 'x' } } }),
           Object.assign({}, goodShot, { scene: 1, shot: { feel: 'b', size: 'ls', angle: 'eye', info: 'two', infoType: 'other' } }),
           Object.assign({}, goodShot, { scene: 1, shot: { feel: 'c', size: 'insert', angle: 'eye', info: 'three', infoType: 'other' } }), ctaShot])
       .some((f) => /close opening owes/.test(f.what)));
  ok('same size and angle on consecutive stills in one scene is flagged',
     has(run([cover,
              Object.assign({}, goodShot, { scene: 2, shot: { feel: 'a', size: 'ms', angle: 'eye', info: 'one', infoType: 'other' } }),
              Object.assign({}, goodShot, { scene: 2, shot: { feel: 'b', size: 'ms', angle: 'eye', info: 'two', infoType: 'other' } })]),
         /jump cut/));
  const axis = (line, azimuth, extra) => Object.assign({}, goodShot, { scene: 2,
    shot: Object.assign({}, goodShot.shot, { size: 'ms', info: 'axis ' + azimuth, space: { frame: 'camera', layout: 'A와 B', facing: '서로 마주 본다', line }, coverage: { azimuth } }, extra || {}) });
  const axisStructure = { version: 'structure-v1', scenes: [
    { no: 1, place: '방', time: '낮', event: 'A가 B를 본다', charge: { open: '-', close: '+' }, turn: '의심 → 안심', out: '가' },
    { no: 2, place: '방', time: '낮', event: 'A와 B가 마주 선다', charge: { open: '-', close: '+' }, turn: '의심 → 안심', out: '가' }
  ], sequences: [{ id: 'q1', title: '대화', purpose: '둘 사이의 긴장을 푼다', scenes: [1, 2] }] };
  ok('an unexplained line flip is a violation',
     has(bads(run([cover, axis('A left, B right', 0), axis('B left, A right', 40), ctaShot], { STRUCTURE: axisStructure })), /space\.line changes/));
  ok('a declared camera crossing with matching sides passes',
     !has(bads(run([cover, axis('A left, B right', 0), axis('B left, A right', 40, { lineCrossing: { method: 'camera_move', from: 'A left, B right', to: 'B left, A right', reason: '카메라가 화면 안에서 두 사람 사이를 지난다' } }), ctaShot], { STRUCTURE: axisStructure })), /lineCrossing|space\.line changes/));
  ok('a neutral crossing needs its marked bridge shot',
     has(bads(run([cover, axis('A left, B right', 0), Object.assign({}, goodShot, { scene: 2, shot: Object.assign({}, goodShot.shot, { size: 'ms', info: 'neutral', space: { frame: 'camera', layout: 'A와 B 정면', facing: '두 사람이 카메라를 정면으로 본다' }, lineNeutral: true, coverage: { action: 'A가 고개를 든다' } }) }), axis('B left, A right', 40, { lineCrossing: { method: 'neutral', from: 'A left, B right', to: 'B left, A right', reason: '정면 샷을 지나 새쪽으로 옮긴다', bridgeShot: 99 } }), ctaShot], { STRUCTURE: axisStructure })), /neutral crossing/));
  const intentional = (from, to, azimuth) => axis(to, azimuth, { lineCrossing: { method: 'intentional', from, to, reason: '방향 감각이 흔들리게 만든다' } });
  ok('three intentional crossings in one episode are a violation',
     has(bads(run([cover, axis('A left, B right', 0), intentional('A left, B right', 'B left, A right', 40), intentional('B left, A right', 'A left, B right', 0), intentional('A left, B right', 'B left, A right', 40), ctaShot], { STRUCTURE: axisStructure })), /3 intentional 180° crossings/));
  ok('a 30 degree bearing, an action cut and a two-step size change pass',
     bads(run([cover, axis('A left, B right', 0), axis('A left, B right', 35), ctaShot], { STRUCTURE: axisStructure })).filter(f => /adjacent picture cut|camera azimuth/.test(f.what)).length === 0 &&
     bads(run([cover, axis('A left, B right', 0), axis('A left, B right', 0, { coverage: { action: 'A가 잔을 든다' } }), ctaShot], { STRUCTURE: axisStructure })).filter(f => /adjacent picture cut|camera azimuth/.test(f.what)).length === 0 &&
     bads(run([cover, Object.assign({}, axis('A left, B right', 0), { shot: Object.assign({}, axis('A left, B right', 0).shot, { size: 'ls', coverage: undefined }) }), Object.assign({}, axis('A left, B right', 0), { shot: Object.assign({}, axis('A left, B right', 0).shot, { size: 'mfs', coverage: undefined }) }), ctaShot], { STRUCTURE: axisStructure })).filter(f => /adjacent picture cut|camera azimuth/.test(f.what)).length === 0);
  ok('a one-step change without an escape route and a 25 degree move are violations',
     has(bads(run([cover, Object.assign({}, axis('A left, B right', 0), { shot: Object.assign({}, axis('A left, B right', 0).shot, { coverage: undefined }) }), Object.assign({}, axis('A left, B right', 0), { shot: Object.assign({}, axis('A left, B right', 0).shot, { size: 'mcu', coverage: undefined }) }), ctaShot], { STRUCTURE: axisStructure })), /adjacent picture cut/) &&
     has(bads(run([cover, axis('A left, B right', 0), axis('A left, B right', 25), ctaShot], { STRUCTURE: axisStructure })), /camera azimuth changes 25/));
  ok('a crossing on a shot with no line, or on the first line, is a finding and not an escape',
     has(bads(run([cover, Object.assign({}, axis('A left, B right', 0), { shot: Object.assign({}, axis('A left, B right', 0).shot, { space: { frame: 'camera', layout: 'A와 B', facing: '서로 마주 본다' }, coverage: undefined }) }),
                   Object.assign({}, axis('A left, B right', 0), { shot: Object.assign({}, axis('A left, B right', 0).shot, { space: { frame: 'camera', layout: 'A와 B', facing: '서로 마주 본다' }, coverage: undefined, lineCrossing: { foo: 1 } }) }), ctaShot], { STRUCTURE: axisStructure })), /needs space\.line on the same shot/) &&
     has(bads(run([cover, axis('A left, B right', 0, { lineCrossing: { method: 'intentional', from: 'x', to: 'A left, B right', reason: 'r' } }), axis('A left, B right', 40), ctaShot], { STRUCTURE: axisStructure })), /first shot with a line/));
  ok('camera-continuity records wait for the story pass to end',
     !has(bads(run([cover, axis('A left, B right', 0), axis('B left, A right', 40), ctaShot], { STRUCTURE: axisStructure }, { draft: true })), /space\.line changes|adjacent picture cut/) &&
     has(run([cover, axis('A left, B right', 0), axis('B left, A right', 40), ctaShot], { STRUCTURE: axisStructure }, { draft: true }), /space\.line changes/));

  // ── playback order ──
  const beat = (b, over) => Object.assign({}, goodShot, { beat: b }, over || {});
  const longCover = Object.assign({}, cover, { arc: 'answer-first' });
  const afOK = [longCover, beat('hooking'), beat('result'), beat('body'), beat('cta')];
  ok('a well-ordered short is hook → drip → cta', bads(run(shortOK)).length === 0);
  ok('a short with no drip is a violation',
     has(bads(run([cover, ctaShot])), /no drip beat/));
  ok('hooking on a short is a violation',
     has(bads(run([cover, beat('hooking'), goodShot, ctaShot])), /belongs to long-form/));
  ok('a short without a spoken CTA is a violation',
     has(bads(run([cover, goodShot, goodShot, goodShot])), /spoken CTA/));
  ok('an outro is not the spoken CTA on a short',
     has(bads(run([cover, goodShot, goodShot, { type: 'outro', visual: {} }])), /spoken CTA/));
  // The twist reveal moves forward (owner directive) — a short-form cover may state the result.
  ok('spoiler is legal on a short',
     bads(run([Object.assign({}, cover, { hookType: 'spoiler' }), goodShot, goodShot, ctaShot])).length === 0);
  ok('payoff is legal on a short',
     bads(run([Object.assign({}, cover, { hookForm: 'payoff' }), goodShot, goodShot, ctaShot])).length === 0);
  ok('a spoiler cover may speak the answer',
     !has(bads(run([Object.assign({}, cover, {
       hookType: 'spoiler', hookForm: 'payoff',
       narration: [{ tts: '한 가지가 달라졌어요.', sub: '한 가지가 달라졌어요.' }]
     }), goodShot, goodShot, ctaShot])), /dumps COMPREHENSION\.answer/));
  ok('a payoff cover that never declares spoiler may speak the answer too',
     !has(bads(run([Object.assign({}, cover, {
       hookForm: 'payoff',
       narration: [{ tts: '한 가지가 달라졌어요.', sub: '한 가지가 달라졌어요.' }]
     }), goodShot, goodShot, ctaShot])), /dumps COMPREHENSION\.answer/));
  ok('a gap cover that speaks the answer is still a violation',
     has(bads(run([Object.assign({}, cover, {
       narration: [{ tts: '한 가지가 달라졌어요.', sub: '한 가지가 달라졌어요.' }]
     }), goodShot, goodShot, ctaShot])), /dumps COMPREHENSION\.answer/));
  ok('a beat after the cta on a short is a violation',
     has(bads(run([cover, goodShot, ctaShot, goodShot])), /after the cta/));
  ok('an unlabeled middle shot on a short is a violation',
     has(bads(run([cover, Object.assign({}, goodShot, { beat: undefined }), goodShot, ctaShot])),
         /no beat/));
  ok('result on a short is a violation',
     has(bads(run([cover, beat('result'), goodShot, ctaShot])), /belongs to long-form/));
  ok('body on a short is a violation',
     has(bads(run([cover, beat('body'), goodShot, ctaShot])), /belongs to long-form/));
  ok('a short that opens on a drip is a violation',
     has(bads(run([Object.assign({}, cover, { beat: 'drip' }), goodShot, goodShot, ctaShot])),
         /opens on the hook/));
  ok('a mute CTA on a short is a violation',
     has(bads(run([cover, goodShot, goodShot, Object.assign({}, ctaShot, { narration: [] })])),
         /no narration/));
  ok('turn on a short is a violation',
     has(bads(run([cover, beat('turn'), goodShot, ctaShot])), /belongs to long-form/));
  ok('a short with one drip is enough',
     bads(run([cover, goodShot, ctaShot])).length === 0);

  // ── the forwardable thing ──
  const noShareCta = Object.assign({}, ctaShot, { shot: Object.assign({}, goodShot.shot) });
  ok('a short whose close has no share trigger is a violation',
     has(bads(run([cover, goodShot, goodShot, noShareCta])), /share trigger/));
  ok('a share trigger under 8 letters is a violation',
     has(bads(run([cover, goodShot, goodShot, Object.assign({}, ctaShot, {
       shot: Object.assign({}, ctaShot.shot, { share: '좋아요!' }) })])), /share trigger/));
  ok('long-form does not demand a share trigger on the close',
     !has(bads(runLong([longCover, beat('hooking'), beat('result'), beat('body'), beat('cta')])),
          /share trigger/));
  ok('an invented shareType is a violation',
     has(bads(run([cover, goodShot, goodShot, Object.assign({}, ctaShot, {
       shot: Object.assign({}, ctaShot.shot, { shareType: 'forward' }) })])), /shot\.shareType "forward"/));
  ok('every shareType word passes',
     SHARE_TYPES.every((t) => !has(bads(run([cover, goodShot, goodShot, Object.assign({}, ctaShot, {
       shot: Object.assign({}, ctaShot.shot, { shareType: t }) })])), /shot\.shareType/)));

  ok('a well-ordered answer-first episode passes', bads(runLong(afOK)).length === 0);
  ok('body before result on answer-first is a violation',
     has(bads(runLong([longCover, beat('hooking'), beat('body'), beat('result'), beat('cta')])),
         /body comes before the result/));
  ok('a turn on an answer-first arc is a violation',
     has(bads(runLong([longCover, beat('hooking'), beat('turn'), beat('result'), beat('cta')])),
         /turn is story only/));
  ok('drip on long-form is read as body',
     bads(runLong([longCover, beat('hooking'), beat('result'), beat('drip'), beat('cta')])).length === 0);

  const st = Object.assign({}, cover, { arc: 'story' });
  const storyOK = [st, beat('hooking'), beat('body'), beat('turn'), beat('result'), beat('cta')];
  ok('a well-ordered story episode passes', bads(runLong(storyOK)).length === 0);
  ok('a story arc with no turn is a violation',
     has(bads(runLong([st, beat('hooking'), beat('body'), beat('result'), beat('cta')])), /no turn beat/));
  ok('the payoff before the turn is a violation',
     has(bads(runLong([st, beat('hooking'), beat('body'), beat('result'), beat('turn'), beat('cta')])),
         /result comes before the turn/));
  ok('a beat after the cta is a violation',
     has(bads(runLong([longCover, beat('hooking'), beat('result'), beat('cta'), beat('body')])),
         /after the cta/));
  ok('an episode with no cta is flagged',
     has(runLong([longCover, beat('hooking'), beat('result'), beat('body')]), /no cta beat/));
  ok('an outro scene counts as the cta on long-form',
     !has(runLong([longCover, beat('hooking'), beat('result'), beat('body'),
                   { type: 'outro', visual: {} }]), /no cta beat/));

  // the combined cap
  const three = [cover, noSlots, noSlots, noSlots];
  ok('more than two generated-video slots is a violation',
     has(bads(run(three)), /cap at 2/));
  const raisedCap = normalizeMotionPolicy({ generatedVideoMax: 4 }, 2, 'fixture');
  ok('a channel policy can raise the generated-video cap',
     !has(bads(run(three, null, { policy: raisedCap })), /cap at/));

  // ── channel true-motion policy ──
  const recorded = (over) => Object.assign({}, goodShot, {
    visual: Object.assign({ picture: 'recording', source: 'recording', action: 'open the box' }, over || {})
  });
  const motionPolicy = normalizeMotionPolicy({
    minTrueMotion: 'majority', allowedKinds: ['ai-video', 'recording'],
    maxConsecutiveStills: 1, maxStillSeconds: 6, requireAction: true, generatedVideoMax: 7,
  }, 2, 'fixture');
  ok('a majority of recorded action shots clears the channel motion policy',
     !has(bads(run([cover, recorded(), recorded(), goodShot, recorded()], null, { policy: motionPolicy })),
          /true-motion|consecutive non-motion|visual\.action/));
  ok('an all-still episode fails the minimum true-motion ratio',
     has(bads(run([cover, goodShot, goodShot, goodShot], null, { policy: motionPolicy })), /true-motion shots/));
  ok('Ken Burns on a still does not count as true motion',
     has(bads(run([cover, Object.assign({}, goodShot, {
       visual: { camera: { movement: 'dolly in' }, action: 'camera approaches' }
     }), goodShot, goodShot], null, { policy: motionPolicy })), /true-motion shots/));
  ok('a qualifying motion shot without visual.action is rejected when action is required',
     has(bads(run([cover, recorded({ action: '' }), recorded(), recorded()], null, { policy: motionPolicy })),
         /only with visual\.action/));
  ok('too many consecutive still shots are rejected',
     has(bads(run([cover, goodShot, recorded(), recorded()], null, { policy: motionPolicy })),
         /consecutive non-motion shots/));
  const secondsPolicy = normalizeMotionPolicy({ maxStillSeconds: 4, generatedVideoMax: 2 }, 2, 'fixture');
  ok('a long still stretch is rejected even without a ratio rule',
     has(bads(run([Object.assign({}, cover, { duration: 5, visual: {} }), recorded()], null, { policy: secondsPolicy })),
         /consecutive non-motion stretch/));
  const allMotionPolicy = normalizeMotionPolicy({
    minTrueMotion: 1, allowedKinds: ['motion-slide'], maxConsecutiveStills: 0,
    maxStillSeconds: 0, requireAction: true, generatedVideoMax: 2,
  }, 2, 'fixture');
  const movingSlide = (base) => Object.assign({}, base, {
    visual: { picture: 'slide', action: 'a hand places one token',
              slide: { motion: true, file: 'slides/s1-test.html', plan: 'the hand places one token' } }
  });
  ok('a zero-still channel accepts motion slides with visible actions',
     !has(bads(run([movingSlide(cover), movingSlide(goodShot)], null, { policy: allMotionPolicy })),
          /true-motion|consecutive non-motion|visual\.action/));
  ok('a zero-still channel rejects one ordinary still',
     has(bads(run([movingSlide(cover), goodShot], null, { policy: allMotionPolicy })),
         /true-motion shots|consecutive non-motion shots/));

  // music cues
  ok('a cue naming nothing in window.MUSIC is a violation',
     has(bads(run([cover, Object.assign({}, goodShot, { sound: { cue: 'tense' } })], { MUSIC: { base: {} } })),
         /not in window\.MUSIC/));
  ok('a cue that exists passes',
     !has(bads(run([cover, Object.assign({}, goodShot, { sound: { cue: 'base' } }), ctaShot], { MUSIC: { base: {} } })),
          /not in window\.MUSIC/));

  // ── sequence → scene → shot (structure-contract.js) ──
  {
    const sc = require('./structure-contract.js');
    ok('the structure vocabularies match this file\'s', SIZES.join() === sc.VOCAB.SIZES.join() &&
       ANGLES.join() === sc.VOCAB.ANGLES.join() && BEATS.join() === sc.VOCAB.BEATS.join() &&
       TYPES.join() === sc.VOCAB.TYPES.join() && INFO_TYPES.join() === sc.VOCAB.INFO_TYPES.join() &&
       SHARE_TYPES.join() === sc.VOCAB.SHARE_TYPES.join() && HOOK_TYPES.join() === sc.VOCAB.HOOK_TYPES.join() &&
       HOOK_FORMS.join() === sc.VOCAB.HOOK_FORMS.join() && ARCS.join() === sc.VOCAB.ARCS.join() &&
       TRANSITIONS.every(t => sc.VOCAB.TRANSITION_RE.test(t)) && sc.VOCAB.TRANSITION_RE.test('push:l2r') &&
       !sc.VOCAB.TRANSITION_RE.test('push:left'));
    const scene = (no, extra) => Object.assign({ no, place: '작업실', time: '낮', event: '한 사건', charge: { open: '-', close: '+' }, turn: 'x → relief' }, extra || {});
    const structure = (scenes, sequences) => ({ version: 'structure-v1', scenes, sequences: sequences ||
      [{ id: 'q1', title: '한 대목', purpose: '한 목적', scenes: scenes.map(x => x.no) }] });
    const at = (shot, no, extra) => Object.assign({}, shot, { scene: no }, extra || {});
    const wide = { shot: Object.assign({}, goodShot.shot, { size: 'ls', info: '다른 정보' }) };
    const board = [at(cover, 1), at(goodShot, 1, wide), at(goodShot, 2), at(ctaShot, 2, wide)];
    ok('a board with no STRUCTURE only warns',
       has(run(board), /no window\.STRUCTURE/) && !bads(run(board)).some(f => /STRUCTURE/.test(f.what)));
    const clean = [scene(1, { out: '가' }), scene(2, { place: '부엌', out: '가' })];
    ok('a structured board passes',
       !has(run(board, { STRUCTURE: structure(clean) }), /structure|scene \d|sequence/i));
    ok('a place that names a picture warns',
       has(run(board, { STRUCTURE: structure([clean[0], scene(2, { place: '땅속 단면 도해', out: '가' })]) }), /names a picture/));
    ok('two scenes back to back on one slugline warn',
       has(run(board, { STRUCTURE: structure([scene(1), scene(2)]) }), /same slugline/));
    ok('an event that says what the viewer learns warns',
       has(run(board, { STRUCTURE: structure([scene(1, { event: '땅속 온도의 원리가 드러난다' }), clean[1]]) }), /what the viewer learns/));
    ok('an event that chains two actions warns',
       has(run(board, { STRUCTURE: structure([scene(1, { event: '딸깍맨이 경고를 무시하고 버튼을 눌러 물을 맞는다' }), clean[1]]) }), /chains two actions/));
    ok('a turn that repeats the event warns',
       has(run(board, { STRUCTURE: structure([scene(1, { event: '광고 시간과 실제 시간이 다르다는 걸 안다', turn: '광고 시간과 실제 시간이 다르다는 걸 알게 된다' }), clean[1]]) }), /turn repeats event/));
    ok('an out the last shot does not say warns',
       has(run(board, { STRUCTURE: structure([scene(1, { out: '아무도 안 하는 말' }), clean[1]]) }), /is not said in the scene's last shot/));
    ok('a last scene with no out warns',
       has(run(board, { STRUCTURE: structure([clean[0], scene(2, { place: '부엌' })]) }), /last scene has no out/));
    ok('a payoff on the sequence\'s first scene warns',
       has(run(board, { STRUCTURE: structure(clean, [{ id: 'q1', title: 't', purpose: 'p', question: '왜?', payoff: 1, scenes: [1, 2] }]) }), /the sequence's first/));
    const five = [at(cover, 1), at(goodShot, 1, wide), at(goodShot, 2), at(goodShot, 2, wide), at(ctaShot, 3, wide)];
    const three = [scene(1, { out: '가' }), scene(2, { place: '부엌', out: '가' }), scene(3, { place: '마당', out: '가' })];
    ok('every scene turning the same way is a metronome warning', has(run(five, { STRUCTURE: structure(three) }), /metronome/));
    ok('a one-shot scene warns', has(run(five, { STRUCTURE: structure(three) }), /one shot — coverage/));
    ok('a studio place beside real places warns',
       has(run(board, { STRUCTURE: structure([clean[0], scene(2, { place: '설명 스튜디오', out: '가' })]) }), /is a studio while other scenes/));
    ok('a one-scene sequence beside others warns',
       has(run(board, { STRUCTURE: structure(clean, [{ id: 'q1', title: '앞', purpose: 'p', scenes: [1] }, { id: 'q2', title: '뒤', purpose: 'p', scenes: [2] }]) }), /one scene — a sequence/));
    ok('a question no narration asks warns',
       has(run(board, { STRUCTURE: structure(clean, [{ id: 'q1', title: 't', purpose: 'p', question: '왜 아무도 몰랐을까요', payoff: 2, scenes: [1, 2] }]) }), /is not asked/));
    ok('an out said before the shot\'s last sentence warns',
       has(run([at(cover, 1), at(goodShot, 1, Object.assign({ narration: [{ tts: '가' }, { tts: '나' }] }, wide)), at(goodShot, 2), at(ctaShot, 2, wide)], { STRUCTURE: structure(clean) }), /goes on after it/));
    ok('a whole episode in one scene warns',
       has(run([at(cover, 1), at(goodShot, 1, wide), at(goodShot, 1, { shot: Object.assign({}, goodShot.shot, { info: '둘' }) }), at(goodShot, 1, { shot: Object.assign({}, goodShot.shot, { size: 'ls', info: '셋' }) }), at(ctaShot, 1, wide)], { STRUCTURE: structure([scene(1, { out: '가' })]) }), /no cut point/));
    ok('a scene with no wide warns',
       has(run([at(cover, 1), at(goodShot, 1, { shot: Object.assign({}, goodShot.shot, { size: 'cu', info: '둘' }) }), at(goodShot, 2), at(ctaShot, 2, wide)], { STRUCTURE: structure(clean) }), /no wide/));
    ok('a shot whose scene the structure does not define fails',
       has(bads(run(board, { STRUCTURE: structure([scene(1)]) })), /scene 2 is not in STRUCTURE/));
    ok('a scene in no sequence fails',
       has(bads(run(board, { STRUCTURE: structure([scene(1), scene(2)], [{ id: 'q1', title: 't', purpose: 'p', scenes: [1] }]) })), /belongs to no sequence/));
    ok('the same charge at both ends is a nonevent warning',
       has(run(board, { STRUCTURE: structure([scene(1, { charge: { open: '+', close: '+' } }), scene(2)]) }), /nonevent/));
    ok('deepening into the same pole is a turn', !has(run(board, { STRUCTURE: structure([scene(1, { charge: { open: '-', close: '--' } }), scene(2)]) }), /nonevent|deepens/));
    ok('"++" on a "-" open is a big swing, not a violation', !has(bads(run(board, { STRUCTURE: structure([scene(1, { charge: { open: '-', close: '++' }, out: '가' }), clean[1]]) })), /charge/));
    ok('a scene split by another scene fails',
       has(bads(run([at(cover, 1), at(goodShot, 2, wide), at(goodShot, 1, wide), at(ctaShot, 2)], { STRUCTURE: structure([scene(1), scene(2)]) })), /split by another scene/));
    ok('shots that play the sequences out of order fail',
       has(bads(run(board, { STRUCTURE: structure([scene(1), scene(2)], [{ id: 'q1', title: 't', purpose: 'p', scenes: [2, 1] }]) })), /one order/));
    ok('a stale sceneSlug fails',
       has(bads(run([at(cover, 1, { sceneSlug: '다른 곳 / 밤' })].concat(board.slice(1)), { STRUCTURE: structure([scene(1), scene(2)]) })), /sceneSlug .* differs/));
    ok('one size across a scene is a coverage warning',
       has(run([at(cover, 1), at(goodShot, 1), at(goodShot, 2), at(ctaShot, 2, wide)], { STRUCTURE: structure([scene(1), scene(2)]) }), /coverage is two sizes/));
    ok('a repeated shot.info anywhere on the board is a coverage warning',
       has(run([at(cover, 1), at(goodShot, 1, { shot: Object.assign({}, goodShot.shot, { size: 'ls', info: '질문' }) }), at(goodShot, 2), at(ctaShot, 2, wide)], { STRUCTURE: structure([scene(1), scene(2)]) }), /shot\.info says what shot/));
    ok('a near-duplicate shot.info warns too',
       has(run([at(cover, 1, { shot: Object.assign({}, cover.shot, { info: '땅속 온도는 겨울에도 거의 변하지 않는다' }) }), at(goodShot, 1, Object.assign({}, wide, { shot: Object.assign({}, wide.shot, { info: '겨울에도 땅속 온도는 거의 변하지 않아요' }) })), at(goodShot, 2), at(ctaShot, 2, wide)], { STRUCTURE: structure(clean) }), /says what shot 1/));
    ok('a purpose that repeats the question warns',
       has(run(board, { STRUCTURE: structure(clean, [{ id: 'q1', title: 't', purpose: '김치가 왜 안 얼었는지 알아낸다', question: '김치가 왜 안 얼었을까', payoff: 2, scenes: [1, 2] }]) }), /purpose repeats question|says what the viewer learns/));
    ok('a payoff scene another scene out-answers warns',
       has(run([at(cover, 1, { narration: [{ tts: '한 가지가 달라졌어요' }] }), at(goodShot, 1, wide), at(goodShot, 2), at(ctaShot, 2, wide)],
               { STRUCTURE: structure(clean, [{ id: 'q1', title: 't', purpose: '한 목적', question: '왜?', payoff: 2, scenes: [1, 2] }]) }), /scene 1's lines say the answer/));
    ok('a turn pole no line carries warns',
       has(run(board, { STRUCTURE: structure([scene(1, { turn: '모른다 → 안다', out: '가' }), clean[1]]) }), /turn's "모른다" is in no line/));
    ok('a charge.open against the first feel warns',
       has(run([at(cover, 1, { shot: Object.assign({}, cover.shot, { feel: '안심 — 다 알았다' }) }), at(goodShot, 1, wide), at(goodShot, 2), at(ctaShot, 2, wide)], { STRUCTURE: structure(clean) }), /charge\.open "-" but the first shot's feel/));
    ok('a feel that flips twice inside one scene warns',
       has(run([at(cover, 1, { shot: Object.assign({}, cover.shot, { feel: '불안' }) }), at(goodShot, 1, Object.assign({}, wide, { shot: Object.assign({}, wide.shot, { feel: '안심' }) })), at(goodShot, 1, { shot: Object.assign({}, goodShot.shot, { feel: '걱정', info: '셋' }) }), at(goodShot, 1, { shot: Object.assign({}, goodShot.shot, { feel: '안도', info: '넷', size: 'ls' }) }), at(ctaShot, 2, wide)], { STRUCTURE: structure(clean) }), /flips sign \d+ times/));
    ok('a span in the lines under a one-moment time warns',
       has(run([at(cover, 1, { narration: [{ tts: '겨울 내내 묻어 뒀어요' }] }), at(goodShot, 1, wide), at(goodShot, 2), at(ctaShot, 2, wide)], { STRUCTURE: structure(clean) }), /lines speak of a span/));
    ok('an out that is not the last segment word for word warns',
       has(run([at(cover, 1), at(goodShot, 1, Object.assign({ narration: [{ tts: '지금 가' }] }, wide)), at(goodShot, 2), at(ctaShot, 2, wide)], { STRUCTURE: structure(clean) }), /word for word/));
    ok('a turn written without → warns',
       has(run(board, { STRUCTURE: structure([scene(1, { turn: '의심이 확신으로 바뀐다', out: '가' }), clean[1]]) }), /has no →/));
    ok('a question that asks two things warns',
       has(run(board, { STRUCTURE: structure(clean, [{ id: 'q1', title: 't', purpose: '한 목적', question: '세종은 왜 눈을 상하면서 몰래 글자를 지었을까', payoff: 2, scenes: [1, 2] }]) }), /asks two things/));
    ok('a purpose that chains two actions warns',
       has(run(board, { STRUCTURE: structure(clean, [{ id: 'q1', title: 't', purpose: '홀로 글자를 만든 세종이 반대를 딛고 그 글자를 세상에 낸다', scenes: [1, 2] }]) }), /purpose chains two actions/));
    ok('a shot.info an earlier shot already said out loud warns',
       has(run([at(cover, 1, { narration: [{ tts: '오늘 한 가지가 달라졌어요' }] }), at(goodShot, 1, Object.assign({}, wide, { shot: Object.assign({}, wide.shot, { info: '오늘 한 가지가 달라졌다' }) })), at(goodShot, 2), at(ctaShot, 2, wide)], { STRUCTURE: structure(clean) }), /repeats what shot 1 already said out loud/));
    ok('a gaze at something with no space.line in the scene warns',
       has(run([at(cover, 1, { shot: Object.assign({}, cover.shot, { space: { frame: 'x', layout: '단상 앞 인물들' } }) }), at(goodShot, 1, Object.assign({}, wide, { shot: Object.assign({}, wide.shot, { space: { frame: 'x', layout: '인물들', facing: '인물들은 단상을 향해 서 있음' } }) })), at(goodShot, 2), at(ctaShot, 2, wide)], { STRUCTURE: structure(clean) }), /writes space\.line/) &&
       !has(run([at(cover, 1), at(goodShot, 1, Object.assign({}, wide, { shot: Object.assign({}, wide.shot, { space: { frame: 'x', layout: 'y', facing: '인물이 카메라를 정면으로 바라봄' } }) })), at(goodShot, 2), at(ctaShot, 2, wide)], { STRUCTURE: structure(clean) }), /writes space\.line/));
    ok('a takeaway no shot says warns on a full board',
       has(run([at(cover, 1), at(goodShot, 1, wide), at(goodShot, 1, { shot: Object.assign({}, goodShot.shot, { info: '셋' }) }), at(goodShot, 2), at(ctaShot, 2, wide)], { STRUCTURE: structure(clean) }), /takeaway .* is said by no shot/) &&
       !has(run([at(cover, 1, { narration: [{ tts: '한 가지만 기억하면 돼요' }] }), at(goodShot, 1, wide), at(goodShot, 1, { shot: Object.assign({}, goodShot.shot, { info: '셋' }) }), at(goodShot, 2), at(ctaShot, 2, wide)], { STRUCTURE: structure(clean) }), /takeaway .* is said by no shot/));
    ok('a charge.close against the last feel warns',
       has(run([at(cover, 1), at(goodShot, 1, Object.assign({}, wide, { shot: Object.assign({}, wide.shot, { feel: '답답함' }) })), at(goodShot, 2), at(ctaShot, 2, wide)], { STRUCTURE: structure(clean) }), /charge\.close "\+" but the last shot's feel/));
    ok('a feel that flips twice inside a three-shot scene warns',
       has(run([at(cover, 1, { shot: Object.assign({}, cover.shot, { feel: '불안' }) }), at(goodShot, 1, Object.assign({}, wide, { shot: Object.assign({}, wide.shot, { feel: '안심' }) })), at(goodShot, 1, { shot: Object.assign({}, goodShot.shot, { feel: '걱정', info: '셋' }) }), at(ctaShot, 2, wide)], { STRUCTURE: structure(clean) }), /flips sign 2 times across 3 shots/));
    ok('an event chained with a bare -고 or -다가 warns',
       has(run(board, { STRUCTURE: structure([scene(1, { event: '청소기를 개봉해 손잡이를 쥐고 카펫 위를 한 번 밀어본다', out: '가' }), clean[1]]) }), /chains two actions/) &&
       has(run(board, { STRUCTURE: structure([scene(1, { event: '먼지통을 열다가 버튼을 두 번 눌러 먼지를 손에 묻힌다', out: '가' }), clean[1]]) }), /chains two actions/));
    ok('a span time no shot draws warns',
       has(run(board, { STRUCTURE: structure([scene(1, { time: '2주 동안', out: '가' }), clean[1]]) }), /is a span but no shot draws it/) &&
       !has(run([at(cover, 1, { narration: [{ tts: '2주 내내 청소할 때마다 꺼졌어요' }] }), at(goodShot, 1, wide), at(goodShot, 2), at(ctaShot, 2, wide)], { STRUCTURE: structure([scene(1, { time: '2주 동안', out: '가' }), clean[1]]) }), /is a span but no shot draws it/));
    ok('an umbrella place warns',
       has(run(board, { STRUCTURE: structure([scene(1, { place: '집 안', out: '가' }), clean[1]]) }), /is an umbrella, not a slugline/));
    ok('two picture shots with a person and no space.line warn',
       has(run([at(cover, 1, { shot: Object.assign({}, cover.shot, { space: { frame: 'x', layout: '사람이 손잡이를 쥔 손이 중앙' } }) }), at(goodShot, 1, Object.assign({}, wide, { shot: Object.assign({}, wide.shot, { space: { frame: 'x', layout: '사람이 왼쪽에서 청소기를 민다' } }) })), at(goodShot, 2), at(ctaShot, 2, wide)], { STRUCTURE: structure(clean) }), /picture shots with a person and no space\.line/));
    ok('a sequence whose lines never ask warns, an embedded 까 싶어서 passes',
       has(run([at(cover, 1, { narration: [{ tts: '아침이 편해지는 다섯 가지 습관이에요' }] }), at(goodShot, 1, wide), at(goodShot, 2), at(ctaShot, 2, wide)],
               { STRUCTURE: structure(clean, [{ id: 'q1', title: 't', purpose: '한 목적', question: '아침이 편해지는 습관', payoff: 2, scenes: [1, 2] }]) }), /no line in this sequence is a question/) &&
       !has(run([at(cover, 1, { narration: [{ tts: '아침이 편해지는 습관이 뭘까 싶어서 써 봤어요' }] }), at(goodShot, 1, wide), at(goodShot, 2), at(ctaShot, 2, wide)],
               { STRUCTURE: structure(clean, [{ id: 'q1', title: 't', purpose: '한 목적', question: '아침이 편해지는 습관', payoff: 2, scenes: [1, 2] }]) }), /no line in this sequence is a question/));
    ok('four scenes on one swing but for one is a metronome',
       has(run([at(cover, 1), at(goodShot, 1, wide), at(goodShot, 2), at(goodShot, 3, wide), at(goodShot, 4), at(ctaShot, 4, wide)], { STRUCTURE: structure([clean[0], clean[1], scene(3, { place: '마당', charge: { open: '+', close: '-' }, out: '가' }), scene(4, { place: '골목', out: '가' })]) }), /3 of 4 scenes turn/));
    ok('a scene that opens on a list number warns',
       has(run([at(cover, 1), at(goodShot, 1, wide), at(goodShot, 2, { narration: [{ tts: '두 번째는 환기예요' }] }), at(ctaShot, 2, wide)], { STRUCTURE: structure(clean) }), /a list number is not a 그런데/));
    ok('five scenes in a short warn',
       has(run([at(cover, 1), at(goodShot, 1, wide), at(goodShot, 2), at(goodShot, 3, wide), at(goodShot, 4), at(goodShot, 5, wide), at(ctaShot, 5)], { STRUCTURE: structure([clean[0], clean[1], scene(3, { place: '마당', out: '가' }), scene(4, { place: '골목', charge: { open: '+', close: '-' }, out: '가' }), scene(5, { place: '역', out: '가' })]) }), /5 scenes in \d+s/));
    ok('a line that says again an earlier shot.info warns',
       has(run([at(cover, 1, { shot: Object.assign({}, cover.shot, { info: '라면 한 봉지가 10원이었다' }) }), at(goodShot, 1, Object.assign({}, wide, { narration: [{ tts: '라면 한 봉지가 10원이었어요' }] })), at(goodShot, 2), at(ctaShot, 2, wide)], { STRUCTURE: structure(clean) }), /says again what shot 1's info/));
    ok('a question first heard in the payoff scene warns',
       has(run([at(cover, 1), at(goodShot, 1, wide), at(goodShot, 2, { narration: [{ tts: '왜 그럴까요' }] }), at(ctaShot, 2, wide)],
               { STRUCTURE: structure(clean, [{ id: 'q1', title: 't', purpose: '한 목적', question: '왜 그럴까요', payoff: 2, scenes: [1, 2] }]) }), /first heard in scene 2, the payoff/));
    ok('a sequence question far from COMPREHENSION.question warns',
       has(run([at(cover, 1, { narration: [{ tts: '사무실에도 이런 버튼 있나요' }] }), at(goodShot, 1, wide), at(goodShot, 2), at(ctaShot, 2, wide)],
               { STRUCTURE: structure(clean, [{ id: 'q1', title: 't', purpose: '한 목적', question: '사무실에도 이런 버튼 있나요', payoff: 2, scenes: [1, 2] }]) }), /is not COMPREHENSION\.question/));
    ok('two scenes on one slugline with different events and turns do not warn',
       !has(run(board, { STRUCTURE: structure([scene(1, { event: '로봇이 딸깍맨을 말린다', turn: '경고 → 무시', out: '가' }), scene(2, { event: '딸깍맨이 버튼을 누른다', turn: '초조 → 웃음', out: '가' })]) }), /same slugline/));
    ok('an explanation screen does not fill the wide slot',
       has(run([at(cover, 1), at(goodShot, 1, Object.assign({}, wide, { shot: Object.assign({}, wide.shot, { render: { mode: 'editorial_html', purpose: 'verdict', reason: 'r' } }) })), at(goodShot, 1, { shot: Object.assign({}, goodShot.shot, { info: '셋' }) }), at(goodShot, 2), at(ctaShot, 2, wide)], { STRUCTURE: structure(clean) }), /no wide .* an explanation screen's ls is not the wide/));
    ok('a turn read backwards warns',
       has(run([at(cover, 1, { shot: Object.assign({}, cover.shot, { feel: 'relief' }) }), at(goodShot, 1, Object.assign({}, wide, { shot: Object.assign({}, wide.shot, { feel: 'x' }) })), at(goodShot, 2), at(ctaShot, 2, wide)], { STRUCTURE: structure([scene(1, { turn: 'x → relief', out: '가' }), clean[1]]) }), /carried only by the later shots/));
    ok('a gaze on an object with no person is not a gaze',
       !has(run([at(cover, 1), at(goodShot, 1, Object.assign({}, wide, { shot: Object.assign({}, wide.shot, { space: { frame: 'x', layout: '청소기 헤드가 중앙', facing: '헤드가 문 쪽을 향해 놓임' } }) })), at(goodShot, 2), at(ctaShot, 2, wide)], { STRUCTURE: structure(clean) }), /writes space\.line/));
    ok('a close against the last shot\'s lines before the out warns',
       has(run([at(cover, 1), at(goodShot, 1, Object.assign({}, wide, { narration: [{ tts: '마음의 짐이 더 무겁게 쌓여요' }, { tts: '가' }] })), at(goodShot, 2), at(ctaShot, 2, wide)], { STRUCTURE: structure(clean) }), /lines before the out read -/));
    ok('a time-only cut whose first layout shows no time warns',
       has(run([at(cover, 1), at(goodShot, 1, wide), at(goodShot, 2, { shot: Object.assign({}, goodShot.shot, { space: { frame: 'x', layout: '인물이 옷장 앞에 선다' } }) }), at(ctaShot, 2, wide)], { STRUCTURE: structure([clean[0], scene(2, { time: '전날 밤', out: '가' })]) }), /shows no time/) &&
       !has(run([at(cover, 1), at(goodShot, 1, wide), at(goodShot, 2, { shot: Object.assign({}, goodShot.shot, { space: { frame: 'x', layout: '스탠드 불빛 아래 인물이 옷장 앞에 선다' } }) }), at(ctaShot, 2, wide)], { STRUCTURE: structure([clean[0], scene(2, { time: '전날 밤', out: '가' })]) }), /shows no time/));
    ok('an event no layout or line shows warns',
       has(run([at(cover, 1, { shot: Object.assign({}, cover.shot, { space: { frame: 'x', layout: '여자가 냉장고 문을 닫는다' } }) }), at(goodShot, 1, wide), at(goodShot, 2), at(ctaShot, 2, wide)], { STRUCTURE: structure([scene(1, { event: '남자가 온도조절판을 매만진다', out: '가' }), clean[1]]) }), /is drawn by no shot/));
    ok('a question and a statement in one shot warn',
       has(run([at(cover, 1), at(goodShot, 1, Object.assign({}, wide, { narration: [{ tts: '이게 정말 손해일까요' }, { tts: '최저임금도 올랐거든요' }] })), at(goodShot, 2), at(ctaShot, 2, wide)], { STRUCTURE: structure(clean) }), /a question to the viewer and a statement in one shot/));
    ok('an info that shares nothing with its own lines warns unless staged',
       has(run([at(cover, 1), at(goodShot, 1, Object.assign({}, wide, { narration: [{ tts: '안 돼요' }], shot: Object.assign({}, wide.shot, { info: '그가 결국 버튼을 누른다는 것' }) })), at(goodShot, 2), at(ctaShot, 2, wide)], { STRUCTURE: structure(clean) }), /shares almost nothing with the shot's own lines/) &&
       !has(run([at(cover, 1), at(goodShot, 1, Object.assign({}, wide, { narration: [{ tts: '안 돼요' }], shot: Object.assign({}, wide.shot, { info: '연출 — 그가 결국 버튼을 누른다' }) })), at(goodShot, 2), at(ctaShot, 2, wide)], { STRUCTURE: structure(clean) }), /shares almost nothing/));
    ok('an info that ends on a delivery verb warns',
       has(run([at(cover, 1), at(goodShot, 1, Object.assign({}, wide, { shot: Object.assign({}, wide.shot, { info: '가 라는 여운으로 마무리한다' }) })), at(goodShot, 2), at(ctaShot, 2, wide)], { STRUCTURE: structure(clean) }), /ends on a delivery verb/));
    ok('a share the cta shot does not say warns',
       has(run([at(cover, 1), at(goodShot, 1, wide), at(goodShot, 2), at(ctaShot, 2, Object.assign({}, wide, { shot: Object.assign({}, ctaShot.shot, { size: 'ls', info: '다른 정보', share: '전혀 다른 문장이에요' }) }))], { STRUCTURE: structure(clean) }), /is not a line this shot says/));
    ok('a long-form board with few scenes warns',
       has(run([at(cover, 1), at(goodShot, 1, wide)].concat(Array.from({ length: 8 }, (_, i) => at(goodShot, i < 4 ? 1 : 2, { shot: Object.assign({}, goodShot.shot, { info: '정보 ' + i }) }))).concat([at(ctaShot, 2, wide)]), { STRUCTURE: structure(clean), FORMAT: 'youtube-long-16x9' }), /scenes on a long-form board/));
    ok('a long-form board with one sequence warns',
       has(run([at(cover, 1), at(goodShot, 1, wide)].concat(Array.from({ length: 8 }, (_, i) => at(goodShot, i < 4 ? 1 : 2, { shot: Object.assign({}, goodShot.shot, { info: '정보 ' + i }) }))).concat([at(ctaShot, 2, wide)]), { STRUCTURE: structure(clean), FORMAT: 'youtube-long-16x9' }), /one sequence on a long-form board/));
    ok('an open against the first shot\'s lines warns',
       has(run([at(cover, 1, { narration: [{ tts: '든든하고 편안한 아침이에요' }] }), at(goodShot, 1, wide), at(goodShot, 2), at(ctaShot, 2, wide)], { STRUCTURE: structure(clean) }), /first shot's lines read \+/));
    ok('a clock time is still one moment',
       has(run([at(cover, 1, { narration: [{ tts: '겨울 내내 묻어 뒀어요' }] }), at(goodShot, 1, wide), at(goodShot, 2), at(ctaShot, 2, wide)], { STRUCTURE: structure([scene(1, { time: '새벽 2시', out: '가' }), clean[1]]) }), /lines speak of a span/));
    ok('a turn that lives only in the feel column warns',
       has(run([at(cover, 1, { shot: Object.assign({}, cover.shot, { feel: '불안 — 아직 모른다' }) }), at(goodShot, 1, Object.assign({}, wide, { shot: Object.assign({}, wide.shot, { feel: '안심 — 이제 안다' }) })), at(goodShot, 2), at(ctaShot, 2, wide)], { STRUCTURE: structure([scene(1, { turn: '불안 → 안심', out: '가' }), clean[1]]) }), /lives only in the feel column/));
    ok('a first pole denied in the first line warns',
       has(run([at(cover, 1, { narration: [{ tts: '그냥 숫자가 아니라 지혜예요' }] }), at(goodShot, 1, Object.assign({}, wide, { narration: [{ tts: '지혜가 담긴 값이에요' }] })), at(goodShot, 2), at(ctaShot, 2, wide)], { STRUCTURE: structure([scene(1, { turn: '그냥 숫자 → 지혜가 담긴 값', out: '가' }), clean[1]]) }), /appears only denied or as a what-if/));
    ok('an explanation screen unrelated to its scene warns even when a neighbour reads it back',
       has(run([at(cover, 1, { narration: [{ tts: '배터리는 38분 갔어요' }] }), at(goodShot, 1, Object.assign({}, wide, { shot: Object.assign({}, wide.shot, { info: '배터리가 광고 60분 대신 38분 간다', render: { mode: 'data_graph', purpose: 'comparison', reason: 'r' } }) })), at(goodShot, 2), at(ctaShot, 2, wide)], { STRUCTURE: structure([scene(1, { event: '화자가 먼지통을 비운다', turn: '답답 → 후련', out: '가' }), clean[1]]) }), /shares nothing with scene 1's event, turn or place/));
    ok('a hand-back shot whose staged info is a gesture warns',
       has(run([at(cover, 1), at(goodShot, 1, wide), at(goodShot, 2), at(ctaShot, 2, Object.assign({}, wide, { shot: Object.assign({}, ctaShot.shot, { size: 'ls', info: '연출 — 세종이 옅게 미소 짓는다' }) }))], { STRUCTURE: structure(clean) }), /is a gesture or a framing note/));
    ok('a purpose that binds two objects with 와/과 warns',
       has(run(board, { STRUCTURE: structure(clean, [{ id: 'q1', title: 't', purpose: '구할 방법과 점주의 심정을 세운다', scenes: [1, 2] }]) }), /binds two objects/));
    ok('a wide size on a close layout warns',
       has(run([at(cover, 1), at(goodShot, 1, Object.assign({}, wide, { shot: Object.assign({}, wide.shot, { space: { frame: 'x', layout: '정산기 앞에 선 점주의 상반신' } }) })), at(goodShot, 2), at(ctaShot, 2, wide)], { STRUCTURE: structure(clean) }), /is a close view/));
    ok('a first line that repeats the previous out warns',
       has(run([at(cover, 1), at(goodShot, 1, Object.assign({}, wide, { narration: [{ tts: '이 도시락 다 버려질까요' }] })), at(goodShot, 2, { narration: [{ tts: '이 도시락 다 버려질까요' }] }), at(ctaShot, 2, wide)], { STRUCTURE: structure([scene(1, { out: '이 도시락 다 버려질까요' }), clean[1]]) }), /repeats scene 1's out/));
    ok('an episode question no sequence holds warns on a two-sequence board',
       has(run([at(cover, 1), at(goodShot, 1, wide), at(goodShot, 2), at(ctaShot, 2, wide)], { STRUCTURE: structure(clean, [{ id: 'q1', title: 't', purpose: '한 목적', question: '왜 버릴까요', scenes: [1] }, { id: 'q2', title: 'u', purpose: '다른 목적', question: '누가 살까요', scenes: [2] }]) }), /is held by no sequence/));
    ok('a hook word the cover info names and no later shot returns to warns',
       has(run([at(cover, 1, { narration: [{ tts: '무선청소기 배터리가 광고랑 달라요' }], shot: Object.assign({}, cover.shot, { info: '배터리 스펙과 실사용이 다르다는 것' }) }), at(goodShot, 1, wide), at(goodShot, 1, { shot: Object.assign({}, goodShot.shot, { info: '셋' }) }), at(goodShot, 2), at(ctaShot, 2, wide)], { STRUCTURE: structure(clean) }), /the hook names "배터리"/));
    ok('a line late in the scene when the first peopled shot has none warns',
       has(run([at(cover, 1, { shot: Object.assign({}, cover.shot, { space: { frame: 'x', layout: '사람이 먼지통을 든다' } }) }), at(goodShot, 1, Object.assign({}, wide, { shot: Object.assign({}, wide.shot, { space: { frame: 'x', layout: '사람이 버튼을 누른다', line: '화자 왼쪽' } }) })), at(goodShot, 2), at(ctaShot, 2, wide)], { STRUCTURE: structure(clean) }), /written on a later shot but not on shot 1/));
    ok('both poles in one line warn',
       has(run([at(cover, 1, { narration: [{ tts: '뭘 놓쳤는지 몰라도 다 알아요' }] }), at(goodShot, 1, wide), at(goodShot, 2), at(ctaShot, 2, wide)], { STRUCTURE: structure([scene(1, { turn: '몰라요 → 알아요', out: '가' }), clean[1]]) }), /sit in one line/));
    ok('an event spoken but drawn by no layout warns',
       has(run([at(cover, 1, { narration: [{ tts: '화자가 2주 동안 배터리를 60분씩 써 봤어요' }], shot: Object.assign({}, cover.shot, { space: { frame: 'x', layout: '거실 소파와 창문' } }) }), at(goodShot, 1, Object.assign({}, wide, { shot: Object.assign({}, wide.shot, { space: { frame: 'x', layout: '창가의 화분' } }) })), at(goodShot, 2), at(ctaShot, 2, wide)], { STRUCTURE: structure([scene(1, { event: '화자가 2주 동안 배터리를 60분씩 써 본다', out: '가' }), clean[1]]) }), /no picture layout of the scene draws it/));
    ok('a delivery verb hidden under …는 것 warns',
       has(run([at(cover, 1), at(goodShot, 1, Object.assign({}, wide, { narration: [{ tts: '뭘 놓고 가는지 몰라서 찜찜해요' }], shot: Object.assign({}, wide.shot, { info: '나가기 전 마지막으로 소지품을 확인한다는 것' }) })), at(goodShot, 2), at(ctaShot, 2, wide)], { STRUCTURE: structure(clean) }), /hides a delivery verb/));
    ok('a staged info that restates the line warns',
       has(run([at(cover, 1), at(goodShot, 1, Object.assign({}, wide, { narration: [{ tts: '마감 직전부터 반값에 파는 할인 앱을 쓰는 가게가 늘고 있어요' }], shot: Object.assign({}, wide.shot, { info: '연출 — 손님이 폰을 보는 사이 마감 직전부터 반값에 파는 할인 앱을 쓰는 가게가 늘고 있다' }) })), at(goodShot, 2), at(ctaShot, 2, wide)], { STRUCTURE: structure(clean) }), /goes on to state what the line says/));
    ok('a branch whose open shot does not ask warns',
       has(run([at(cover, 1), at(goodShot, 1, wide), at(goodShot, 2), at(ctaShot, 2, wide)], { STRUCTURE: structure(clean), COMPREHENSION: Object.assign({}, comprehension, { branches: [{ question: '정말 몸에 해로운 걸까요', open: 2, pay: 4 }] }) }), /open says shot 2 but that shot's lines do not ask/));
    ok('a question with no payoff scene is a warning',
       has(run(board, { STRUCTURE: structure([scene(1), scene(2)], [{ id: 'q1', title: 't', purpose: 'p', question: '왜?', scenes: [1, 2] }]) }), /no payoff scene/));
    ok('three shots on one feel is a flat-stretch warning',
       has(run([at(cover, 1, { shot: Object.assign({}, cover.shot, { feel: 'same' }) }), at(goodShot, 1, { shot: Object.assign({}, goodShot.shot, { size: 'ls', feel: 'same' }) }), at(goodShot, 2, { shot: Object.assign({}, goodShot.shot, { feel: 'same' }) }), at(ctaShot, 2, wide)], { STRUCTURE: structure([scene(1), scene(2)]) }), /flat stretch/));
    const w = { SCENES: [at(cover, 1), at(goodShot, 2)], STRUCTURE: structure([scene(1), scene(2, { place: '부엌', time: '밤' })],
                [{ id: 'q1', title: '앞', purpose: 'p', scenes: [1] }, { id: 'q2', title: '뒤', purpose: 'p', scenes: [2] }]) };
    ok('sync writes the slug and, with two sequences, the sequence title',
       sc.sync(w) === 2 && w.SCENES[1].sceneSlug === '부엌 / 밤' && w.SCENES[1].sequence === '뒤' && w.SCENES[0].sequence === '앞');
    const tree = sc.outline(w, 'shots');
    ok('outline nests shots under scenes under sequences',
       tree.sequences.length === 2 && tree.sequences[1].scenes[0].shots[0].no === 2 && tree.sequences[1].scenes[0].slug === '부엌 / 밤');
  }

  // ── every generated_video cut pre-renders in 3D first (blender-previz.md §6, user directive 2026-09-11) ──
  const previzRecord = { renderer: 'blender', clip: 'previz/s2.mp4', firstFrame: 'previz/s2-f0001.png', sha256: 'b'.repeat(64),
    fps: 24, seconds: 6, camera: { movement: 'dolly in' } };
  const videoCut = (video) => Object.assign({}, goodShot, {
    shot: Object.assign({}, goodShot.shot, { render: { mode: 'generated_video', purpose: 'live_action', reason: 'the wind is the sentence',
      motionEssential: true, action: 'cloth lifts', whyNotStill: 'the change is continuous' } }),
    visual: { bg: 'images/scene-2.png', why: 'continuous motion', audio: 'wind',
      camera: { movement: 'dolly in', speed: 'slow', framing: 'medium', end: 'the gate' }, video } });
  ok('a generated_video cut without a previz is a violation after the draft',
     has(bads(run([cover, videoCut({ prompt: SEEDANCE_PROMPT }), goodShot, ctaShot])), /pre-renders its camera and blocking in 3D/));
  ok('the previz waits for the camera pass (--draft)',
     !has(bads(run([cover, videoCut({ prompt: SEEDANCE_PROMPT }), goodShot, ctaShot], null, { draft: true })), /pre-renders/));
  ok('a previz on the host lane needs handoff frame_and_prompt and nothing Seedance asks for',
     !has(bads(run([cover, videoCut({ engine: 'host', prompt: SEEDANCE_PROMPT, previz: Object.assign({}, previzRecord, { handoff: 'frame_and_prompt' }) }), goodShot, ctaShot])), /previz/) &&
     has(bads(run([cover, videoCut({ engine: 'host', prompt: SEEDANCE_PROMPT, previz: Object.assign({}, previzRecord, { handoff: 'reference_video' }) }), goodShot, ctaShot])), /takes no reference clip/));
  ok('a previz whose move contradicts the camera slot is a violation',
     has(bads(run([cover, videoCut({ engine: 'host', prompt: SEEDANCE_PROMPT, previz: Object.assign({}, previzRecord, { camera: { movement: 'arc shot' } }) }), goodShot, ctaShot])), /contradicts visual\.camera\.movement/));
  ok('a previz without a renderer or a first frame is a violation',
     has(bads(run([cover, videoCut({ engine: 'host', prompt: SEEDANCE_PROMPT, previz: Object.assign({}, previzRecord, { renderer: 'maya', firstFrame: undefined }) }), goodShot, ctaShot])), /renderer must be blender/));

  // ── the story pass (--draft) ──
  // A 4a skeleton: beats, feels, narration sentences, the two hook fields, and the close's
  // share trigger. No tts spelling, no camera slots, no stored prompt — the fields 4b writes.
  const skel = (b) => ({ type: b === 'hook' ? 'cover' : 'points', beat: b,
                         shot: Object.assign({ feel: 'x', size: 'mcu', angle: 'eye', info: '한 가지 정보', infoType: 'other' },
                                             b === 'cta' ? { share: '하루 한 번이면 충분해요' } : {}),
                         narration: [{ sub: '가' }], visual: {} });   // no transition either — 4b writes it
  const skelCover = Object.assign(skel('hook'), { hookType: 'fear', hookForm: 'gap' });
  const skeleton = [skelCover, skel('drip'), skel('drip'), skel('cta')];
  ok('a story-pass skeleton passes with --draft',
     bads(run(skeleton, null, { draft: true })).length === 0);
  ok('the same skeleton fails without --draft',
     has(bads(run(skeleton)), /no tts/));
  ok('the CLI render gate rejects a skeleton that never chose a treatment',
     has(bads(run(skeleton, null, { draft: true, requireRenderPlan: true })), /shot\.render/));
  ok('a deferred check is reported as later, not dropped',
     run(skeleton, null, { draft: true }).filter((f) => f.level === 'later').length === 7);
  ok('a skeleton shot with no transition is later in --draft, a violation without it',
     run(skeleton, null, { draft: true }).filter((f) => f.level === 'later' && /no transition/.test(f.what)).length === 3 &&
     has(bads(run(skeleton)), /no transition/));
  ok('a story-layer violation still fails with --draft',
     has(bads(runLong([Object.assign({}, skelCover, { arc: 'story' }), skel('hooking'), skel('body'),
                       skel('result'), skel('turn'), skel('cta')], null, { draft: true })),
         /result comes before the turn/));
  ok('an invented vocabulary value still fails with --draft',
     has(bads(run([skelCover, Object.assign(skel('drip'), { shot: { feel: 'x', size: 'closeup' } }),
                   skel('drip'), skel('cta')], null, { draft: true })), /size "closeup"/));

  // Bands come from the preset, never from this file. The channel length band arrives as
  // normalizeMotionPolicy's `pacing` argument for the same reason, so a literal 35 or 120
  // written as a default here has to be caught — the header at the top of the file promises it.
  const src = fs.readFileSync(__filename, 'utf8');
  ok('no length band is hardcoded here',
     !/(sceneMin|sceneMax|sceneCountMin|sceneCountMax|totalMin|totalMax|totalHard)\s*[:=]\s*\d/
       .test(src.replace(/pacing:\s*\{[^}]*\}/g, '')));

  // ── a still never sits frozen (2026-09-03) ──
  const frozenStill = Object.assign({}, goodShot, {
    visual: { camera: { movement: 'static', speed: 'very slow', framing: 'mcu', end: 'centred' } } });
  ok('a still whose camera says static is a violation',
     has(bads(run([cover, frozenStill, goodShot, ctaShot])), /never sits frozen/));
  ok('a still with a real move passes',
     !has(bads(run([cover, Object.assign({}, frozenStill, {
       visual: { camera: { movement: 'dolly in', speed: 'very slow', framing: 'mcu', end: 'centred' } } }),
       goodShot, ctaShot])), /never sits frozen/));
  ok('the same rule reads 정지 and still, not just static',
     has(bads(run([cover, Object.assign({}, frozenStill, {
       visual: { camera: { movement: '정지', speed: 'very slow', framing: 'mcu', end: 'centred' } } }),
       goodShot, ctaShot])), /never sits frozen/) &&
     has(bads(run([cover, Object.assign({}, frozenStill, {
       visual: { camera: { movement: 'still', speed: 'very slow', framing: 'mcu', end: 'centred' } } }),
       goodShot, ctaShot])), /never sits frozen/));
  ok('the frozen-still check waits for the camera pass (--draft)',
     !has(bads(run([cover, frozenStill, goodShot, ctaShot], null, { draft: true })), /never sits frozen/));

  // ── the host video tool is a route of its own (2026-09-07) ──
  ok('engine:"host" resolves to the host route, not the type default',
     engineOf({ type: 'points', visual: { video: { engine: 'host' } } }) === 'host' &&
     engineOf({ type: 'broll', visual: { engine: 'host' } }) === 'host');
  ok('a host clip prompt is not held to the Seedance grammar',
     seedancePromptFindings('she turns to the window', 'host').length === 0);

  if (failed) { process.stderr.write(failed + ' check(s) failed\n'); process.exit(1); }
  process.stdout.write('check-scenes selftest OK\n');
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.indexOf('--selftest') !== -1) return selftest();
  const target = argv.filter((a) => !a.startsWith('--'))[0];
  if (!target) die('usage: check-scenes.js <storyboard dir | scenes.js> [--draft] [--json]');
  if (!fs.existsSync(target)) die('path not found: ' + target);
  const scenesPath = fs.statSync(target).isDirectory() ? path.join(target, 'scenes.js') : target;
  if (!fs.existsSync(scenesPath)) die('scenes.js not found: ' + scenesPath);

  const draft = argv.indexOf('--draft') !== -1;
  const win = readScenes(scenesPath);
  const fmt = formatOf(scenesPath);
  const formatVideoMax = fmt.video && Number.isFinite(Number(fmt.video.generatedSecondsMax))
    ? Math.floor(Number(fmt.video.generatedSecondsMax) / 8) : 2;
  const profilePath = findProfile(scenesPath);
  const profileRaw = profilePath ? frontmatter(profilePath) : {};
  const profileHasPolicy = MOTION_PROFILE_KEYS.some((k) => profileRaw[k] !== undefined);
  const isShort = fmt.format !== LONG_FORMAT;
  const profilePolicy = normalizeMotionPolicy(profileHasPolicy ? profileRaw : null, formatVideoMax,
                                               profilePath || 'format default', fmt.pacing, isShort);
  const scenePolicy = normalizeMotionPolicy(win.MOTION_POLICY || null, formatVideoMax, 'window.MOTION_POLICY', fmt.pacing, isShort);
  const effectivePolicy = profileHasPolicy ? profilePolicy
    : normalizeMotionPolicy(null, formatVideoMax, 'format default', fmt.pacing, isShort);
  const findings = check(win, fmt, { draft, policy: effectivePolicy, requireRenderPlan: true });
  require('./render-routing.js').checkEpisode(win).forEach(what =>
    findings.push({ level: 'bad', where: 'visual direction', what }));
  // Draft validates the plan; full production also requires a current evidence-backed read.
  require('./story-contract.js').checkStory(win, { requireReview: !draft }).forEach(what =>
    findings.push({ level: 'bad', where: 'story quality', what }));

  profilePolicy.errors.forEach((what) => findings.push({ level: 'bad', where: 'profile motion policy', what }));
  scenePolicy.errors.forEach((what) => findings.push({ level: draft ? 'later' : 'bad',
                                                       where: 'window.MOTION_POLICY', what }));
  if (profileHasPolicy && !win.MOTION_POLICY) {
    findings.push({ level: draft ? 'later' : 'bad', where: 'window.MOTION_POLICY',
                    what: 'channel profile declares a motion policy — copy it into scenes.js for the browser check strip' });
  } else if (profileHasPolicy && win.MOTION_POLICY &&
             policyComparable(profilePolicy) !== policyComparable(scenePolicy)) {
    findings.push({ level: draft ? 'later' : 'bad', where: 'window.MOTION_POLICY',
                    what: 'scenes.js motion policy does not match profile.md — the channel profile wins' });
  } else if (!profileHasPolicy && win.MOTION_POLICY) {
    findings.push({ level: draft ? 'later' : 'bad', where: 'window.MOTION_POLICY',
                    what: 'scenes.js declares a motion override that profile.md does not authorize' });
  }

  /* The scenario page is an upstream input (storyboard §3.5) — written before the board and
     consumed by §4. If it changed after scenes.js did, the input moved behind its consumer,
     which is the drift `scenario-stage.md`'s freeze rule exists to stop. Clock comparison,
     so it lives here where the paths are, not in check() where the fixtures are. */
  const scenarioPath = path.join(path.dirname(scenesPath), 'scenario.md');
  if (fs.existsSync(scenarioPath) &&
      fs.statSync(scenarioPath).mtimeMs > fs.statSync(scenesPath).mtimeMs) {
    findings.push({ level: 'warn', where: 'episode',
                    what: 'scenario.md is newer than scenes.js — an upstream input changed after ' +
                          'its consumer; the board is the source of truth once §4 opens' });
  }
  const bad = findings.filter((f) => f.level === 'bad');
  const warn = findings.filter((f) => f.level === 'warn');
  const later = findings.filter((f) => f.level === 'later');

  if (argv.indexOf('--json') !== -1) {
    process.stdout.write(JSON.stringify({
      format: fmt.format, shots: win.SCENES.length, draft,
      violations: bad.length, warnings: warn.length, deferred: later.length, findings
    }, null, 2) + '\n');
    process.exit(bad.length ? 1 : 0);
  }

  const lines = ['scenes.js contract — ' + fmt.label + ' · ' + win.SCENES.length + ' shots' +
                 (draft ? ' · story pass (§4a)' : ''), ''];
  if (!findings.length) {
    lines.push('  Structure, vocabularies and references all check out.');
    lines.push('  Frame overflow, hero-stat width and speech rate are measured against the');
    lines.push('  rendered canvas — open storyboard.html for those.');
  } else {
    // One episode-wide mistake shows up once per shot, and printing it 25 times buries
    // everything else. Same finding, same level → one line naming the shots it hit.
    const groups = new Map();
    bad.concat(warn).forEach((f) => {
      const key = f.level + '\0' + f.what;
      const g = groups.get(key) || { level: f.level, what: f.what, wheres: [] };
      g.wheres.push(f.where);
      groups.set(key, g);
    });
    groups.forEach((g) => {
      const mark = g.level === 'bad' ? '!' : '·';
      if (g.wheres.length === 1) {
        lines.push('  ' + mark + ' ' + g.wheres[0].padEnd(10) + ' ' + g.what);
      } else {
        const shown = g.wheres.slice(0, 6).join(', ') + (g.wheres.length > 6 ? ` … +${g.wheres.length - 6}` : '');
        lines.push('  ' + mark + ' ×' + String(g.wheres.length).padEnd(8) + ' ' + g.what);
        lines.push('  ' + ' '.repeat(11) + shown);
      }
    });
    lines.push('');
    lines.push('  ' + bad.length + ' violation(s), ' + warn.length + ' to look at.');
  }
  if (draft) {
    lines.push('  ' + later.length + ' machine-layer check(s) deferred to §4b — run again without --draft there.');
  }
  process.stdout.write(lines.join('\n') + '\n');
  process.exit(bad.length ? 1 : 0);
}

main();
