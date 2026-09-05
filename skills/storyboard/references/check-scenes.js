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
// footage (generated clips under drawn marks) retired 2026-09-05 — owner rule: nothing is drawn over
// video, and a cut that explains an arrow, a number or a principle is a full-frame HTML slide.
const RETIRED_TREATMENTS = ['footage'];
const EDITORIAL_ROLES = ['evidence', 'relationship', 'mechanism', 'timeline', 'statistic', 'transition', 'verdict'];
const INFO_TYPES = ['other', 'timeline', 'statistic', 'principle'];
const INFO_ROLE = { timeline: 'timeline', statistic: 'statistic', principle: 'mechanism' };
// object-move — a baked object arrives, turns or recedes (rendered-object.md · h.object); the sentence's
// value can be the object itself on any of the three types, so it is allowed on all of them.
const INFO_PRIMITIVES = {
  timeline: ['date-enter', 'range-grow', 'event-link', 'object-move'],
  statistic: ['count-up', 'bar-grow', 'dot-fill', 'axis-draw', 'object-move'],
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
  if (v.slide || v.video || v.clip) return false;
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

const MOTION_KINDS = ['ai-video', 'recording', 'motion-slide'];
const MOTION_PROFILE_KEYS = [
  'motion_min_true', 'motion_allowed_kinds', 'motion_max_consecutive_stills',
  'motion_max_still_seconds', 'motion_require_action', 'generated_video_max',
  'max_static_ground_seconds', 'video_budget_usd',
];
// Plugin-wide defaults (owner directive 2026-09-03 — "the viewer has to feel a video"). They
// apply whether or not a profile declares a motion policy; a profile may raise, lower, or
// switch each one off with `off`.
// 2026-09-05 진 지시 — HTML 움직이는 화면(motion-slide)은 정지 바닥 4초 셈에서 뺀다. 화살표·수치·원리를
// 설명하는 컷은 영상 대신 HTML 슬라이드로 만들라는 규칙이라, 그 화면을 「그림 한 장」으로 세면 규칙과
// 부딪힌다. 영상 컷과 멈춘 그림에는 4초가 그대로 산다.
const STATIC_GROUND_DEFAULT_SECONDS = 4;   // one picture may hold the screen this long
const VIDEO_BUDGET_DEFAULT_USD = 10;       // generated video per episode — read by cost-preview.js

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

function normalizeMotionPolicy(raw, defaultVideoMax, source) {
  const errors = [];
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
  const videoBudgetUsd = numberOrDefault(
    scalar(pick('video_budget_usd', 'videoBudgetUsd')), VIDEO_BUDGET_DEFAULT_USD,
    errors, 'video_budget_usd/videoBudgetUsd', false);

  return {
    declared: !!raw && (profileShape || sceneShape), source: source || '', errors,
    minTrueMotion, allowedKinds: [...new Set(allowedKinds)].sort(), maxConsecutiveStills,
    maxStillSeconds, requireAction,
    generatedVideoMax: videoOverride === null ? defaultVideoMax : videoOverride,
    maxStaticGroundSeconds, videoBudgetUsd,
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
    videoBudgetUsd: p.videoBudgetUsd,
  });
}

function motionKind(scene) {
  const v = (scene && scene.visual) || {};
  if (v.source === 'recording' || v.source === 'screencast' || v.picture === 'recording')
    return 'recording';
  // A footage slide is generated video under drawn marks (scenes-schema §footage treatment) — it
  // counts as ai-video for the true-motion floor, not as an authored plate.
  if (v.slide && v.slide.motion === true && v.slide.treatment === 'footage') return 'ai-video';
  if (v.slide && v.slide.motion === true) return 'motion-slide';
  if (scene && (scene.type === 'broll' || v.video || v.clip)) return 'ai-video';
  return null;
}

/** The planned route (scenes-schema §clip prompt) — `engine` overrides the type default:
    b-roll keeps its sound so it goes to veo, a motion background discards it so seedance,
    a speech clip goes to veo_reference. The same routing as the check strip's engineOf. */
function engineOf(scene) {
  const v = (scene && scene.visual) || {};
  const named = (v.video && v.video.engine) || v.engine;
  if (named === 'veo' || named === 'seedance') return named;
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
  const motionPolicy = (opts && opts.policy) || normalizeMotionPolicy(null, formatVideoMax, 'default');
  const main = scenes.filter((s) => s.type !== 'broll' && s.type !== 'outro');
  const cover = scenes.find((s) => s.type === 'cover');
  const isShort = fmt.format !== 'youtube-long-16x9';

  // ── Episode level ──
  if (!cover) bad('episode', 'no cover shot — every episode opens on one');
  if (pacing.shotMin && main.length < pacing.shotMin)
    warn('episode', `${main.length} main shots — the ${fmt.label} band is ${pacing.shotMin}~${pacing.shotMax}`);
  if (pacing.shotMax && main.length > pacing.shotMax)
    warn('episode', `${main.length} main shots — the ${fmt.label} band is ${pacing.shotMin}~${pacing.shotMax}`);

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

    /* Authored plates are not capped — since 2026-09-05 every cut that explains an arrow, a
       number or a principle is a full-frame HTML slide (owner rule), so an episode holds as many
       plates as it has explaining cuts. The html_plate_max key is gone with the footage lane. */
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
     shot. storyboard.html's check strip carries the same rule. */
  if (isShort && cover) {
    if (cover.hookType === 'spoiler')
      bad('cover', 'hookType "spoiler" dumps the ending on a short — use fear · empathy · curiosity; ' +
                  'the last drip is where the answer completes');
    if (cover.hookForm === 'payoff')
      bad('cover', 'hookForm "payoff" dumps the result on a short — use paradox · gap · identify · number · secret');
  }

  if (isShort && cover && comp && typeof comp === 'object' && !Array.isArray(comp)) {
    const ans = compactText(comp.answer);
    if (ans.length >= 8) {
      const hookSpoken = compactText([cover.title, cover.stat, spokenText(cover)].join(' '));
      if (hookSpoken.indexOf(ans) !== -1)
        bad('cover', 'the hook dumps COMPREHENSION.answer — on a short the cover opens a gap, ' +
                    'and the last drip is the first place the answer is complete');
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

  /* Consecutive stills of the same size and angle in one scene read as a jump cut
     (30-degree / two-step-size rule). Filmed cards are the vlog exception. */
  for (let i = 1; i < scenes.length; i++) {
    const prev = scenes[i - 1], cur = scenes[i];
    if (!isStillCard(prev) || !isStillCard(cur)) continue;
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
  const videoSlots = scenes.filter((s) => {
    const v = s.visual || {};
    return s.type === 'broll' || !!v.video;
  });
  if (videoSlots.length > motionPolicy.generatedVideoMax)
    bad('episode', `${videoSlots.length} generated-video slots — b-roll and motion backgrounds ` +
                   `count together and cap at ${motionPolicy.generatedVideoMax} ` +
                   '(channel motion policy; format default applies when the profile has no override)');

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

  /* ── Static ground (owner directive 2026-09-03) ──
     A picture that stays the same while the narration runs is a slideshow, whatever moves on
     top of it — captions, a counting number, a camera drift over one still. The clock resets
     only when the picture itself changes: a generated clip (motion background, b-roll, quote
     clip), a recording, or a new still under the next sentence. A still HTML plate is one
     picture for its whole length, so such a plate is a one-sentence card by construction.
     2026-09-05 진 지시로 HTML 움직이는 화면(motion-slide — visual.slide.motion:true)은 제외한다:
     설명 컷은 HTML 로 만들라는 규칙의 화면이므로 그 안의 움직임이 곧 영상이다. */
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
      if (kind === 'ai-video' || kind === 'recording' || kind === 'motion-slide') return;   // 2026-09-05 진 지시 — HTML 움직이는 화면 제외
      const segs = Array.isArray(scene.narration) ? scene.narration.length : 0;
      const stillPerLine = segs > 1 && scene.narration.every((seg) => seg && seg.img);
      const longest = stillPerLine ? secondsOf(scene) / segs : secondsOf(scene);
      if (longest > motionPolicy.maxStaticGroundSeconds + 0.01)
        bad('shot ' + (x.index + 1),
            `one picture stays on screen ${longest.toFixed(1)}s — channel limit ${motionPolicy.maxStaticGroundSeconds}s; ` +
            'give the beat a generated clip, a still per sentence, or cut the plate to one sentence');
    });
  }

  // ── Shot level ──
  const brollAfters = [];
  scenes.forEach((s, i) => {
    const n = i + 1;
    const where = 'shot ' + n;
    const v = s.visual || {};
    const shot = s.shot || {};

    if (!s.type) { bad(where, 'no type'); return; }
    if (TYPES.indexOf(s.type) === -1) bad(where, `type "${s.type}" is outside ${TYPES.join(' · ')}`);

    if (s.beat && BEATS.indexOf(s.beat) === -1)
      bad(where, `beat "${s.beat}" is outside ${BEATS.join(' · ')}`);
    if (shot.size && SIZES.indexOf(shot.size) === -1)
      bad(where, `shot.size "${shot.size}" is not a size word (directing-grammar §size)`);
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

    const slide = v.slide;
    if (slide && slide.motion === true && (slide.kind || 'diagram') === 'diagram') {
      if (!String(slide.treatment || '').trim()) {
        machine(where, 'motion diagram has no slide.treatment — choose editorial when HTML owns the frame, or photo-action when the photographed subject itself changes');
      } else if (RETIRED_TREATMENTS.indexOf(slide.treatment) !== -1) {
        bad(where, `slide.treatment "${slide.treatment}" is retired (owner rule 2026-09-05) — nothing is drawn over video; ` +
                   'make the cut a full-frame HTML slide (treatment:"editorial") or play the clip with subtitles only');
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
       They cannot fall back to a still, a clip under marks, or a photo with animated annotations. The
       authored HTML must expose one declared meaning-bearing primitive for every spoken group;
       render-motion-slide.mjs checks those declarations against the rendered DOM. */
    if (INFO_ROLE[shot.infoType]) {
      const expectedRole = INFO_ROLE[shot.infoType];
      const allowed = INFO_PRIMITIVES[shot.infoType];
      if (!slide) {
        machine(where, `${shot.infoType} beat has no visual.slide — it must be a seekable editorial diagram`);
      } else {
        if ((slide.kind || 'diagram') !== 'diagram')
          machine(where, `${shot.infoType} beat uses kind:"${slide.kind}" — it must use kind:"diagram"`);
        if (slide.motion !== true)
          machine(where, `${shot.infoType} beat has no slide.motion:true — a still frame is not allowed`);
        if (slide.treatment !== 'editorial')
          machine(where, `${shot.infoType} beat uses treatment:"${slide.treatment}" — it must use treatment:"editorial"`);
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
    }

    // Scene length against the preset band.
    const dur = Number(s.duration);
    if (s.type !== 'outro') {
      if (!Number.isFinite(dur) || dur <= 0) {
        if (s.type !== 'broll') warn(where, 'no duration');
      } else if (pacing.sceneMin && (dur < pacing.sceneMin || dur > pacing.sceneMax)) {
        warn(where, `duration ${dur}s — the ${fmt.label} band is ${pacing.sceneMin}~${pacing.sceneMax}s`);
      }
    }

    // Narration segments — the tts spelling is what the engine actually reads.
    (s.narration || []).forEach((seg, j) => {
      if (!seg || typeof seg !== 'object') { bad(where, `narration[${j}] is not an object`); return; }
      if (!seg.tts) machine(where, `narration[${j}] has no tts — the engine reads that field`);
      if (!seg.sub) warn(where, `narration[${j}] has no sub — the subtitle falls back to tts spelling`);
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
    const isGenerated = s.type === 'broll' || !!v.video ||
                        (s.type === 'quote' && v.clip && typeof v.clip === 'object');
    if (isGenerated) {
      const cam = v.camera || {};
      ['movement', 'speed', 'framing', 'end'].forEach((slot) => {
        if (!cam[slot]) machine(where, `visual.camera.${slot} is empty — a generated shot leaves here with all four filled`);
      });
      const prompt = v.prompt || (v.video && v.video.prompt) ||
                     (v.clip && typeof v.clip === 'object' && v.clip.prompt);
      if (!prompt) machine(where, 'no stored clip prompt — produce sends this verbatim (scenes-schema §clip prompt)');
      else seedancePromptFindings(prompt, engineOf(s)).forEach((f) => machine(where, f));
      if (!v.audio && s.type !== 'quote')
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
        else {
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
  const fmt = { format: 'shorts-9x16', label: 'test', pacing: { sceneMin: 4, sceneMax: 13, shotMin: 4, shotMax: 7 },
                video: { generatedSecondsMax: 16 } };
  const fmtLong = { format: 'youtube-long-16x9', label: 'test long',
                    pacing: { sceneMin: 6, sceneMax: 20, shotMin: 28, shotMax: 70 },
                    video: { generatedSecondsMax: 40 } };
  // Legacy fixtures predate the static-ground rule (2026-09-03); they run with it switched off
  // and the dedicated tests further down pin it.
  const defaultPolicy = normalizeMotionPolicy({ max_static_ground_seconds: 'off' }, 2, 'test default');
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
  const ctaShot = Object.assign({}, goodShot, { beat: 'cta' });
  const cover = { type: 'cover', duration: 5, beat: 'hook',
                  hookType: 'curiosity', hookForm: 'gap',
                  shot: { feel: 'x', size: 'mcu', angle: 'eye', info: '질문', infoType: 'other' },
                  narration: [{ tts: '가', sub: '가' }],
                  visual: { slide: { file: 'slides/s1-evidence.html', kind: 'diagram', motion: true,
                                     treatment: 'editorial', role: 'evidence', motif: 'signal line',
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
  // footage retired 2026-09-05 (owner rule: nothing is drawn over video) — a board that still
  // carries the treatment is rejected up front, and the old lane's sub-checks never run on it.
  ok('a footage slide is retired — the board is rejected with the owner rule',
     has(bads(run([cover, footageScene(), goodShot, goodShot])), /slide\.treatment "footage" is retired \(owner rule 2026-09-05\)/));
  ok('a footage slide is still refused when its shots are complete',
     has(bads(run([cover, footageScene({ slide: { shots: [{ group: 1, clip: 'slides/footage/s2-g1.mp4', duration: 5, prompt: SEEDANCE_PROMPT, audio: 'y', mark: 'z',
       camera: { movement: 'a', speed: 'b', framing: 'c', end: 'd' } }] } }), goodShot, goodShot])), /is retired/));
  ok('the retired lane runs no sub-checks of its own',
     !has(bads(run([cover, Object.assign({}, footageScene({ slide: { shots: [{ group: 1, clip: 'clips/a.mp4', duration: 2 }] } }),
       { narration: [{ tts: '가', sub: '가' }, { tts: '나', sub: '나' }] }), goodShot, goodShot])),
          /shots for \d+ narration segments|outside the slides\/footage|outside seedance|camera\./));
  ok('the treatment hint no longer offers footage',
     !has(run([cover, Object.assign({}, goodShot, { visual: { slide: { file: 'slides/s2-x.html', kind: 'diagram', motion: true, plan: 'x' } } }), goodShot, goodShot])
       .filter((f) => /no slide\.treatment/.test(f.what)), /footage/));
  ok('editorial is still the accepted treatment',
     !has(bads(run([cover, Object.assign({}, goodShot, { visual: { slide: { file: 'slides/s2-e.html', kind: 'diagram', motion: true, treatment: 'editorial',
       role: 'evidence', motif: 'ink line', plan: 'x' } } }), goodShot, goodShot], null, { policy: defaultPolicy })), /slide\.treatment/));
  ok('footage shots do not spend a generated-video slot',
     !has(bads(run([cover, footageScene(), footageScene(), footageScene()])), /generated-video slots/));
  ok('a footage slide counts as ai-video for the motion floor', motionKind(footageScene()) === 'ai-video');

  // ── static ground · budget key (2026-09-03) · plate cap gone (owner rule 2026-09-05) ──
  const groundPolicy = normalizeMotionPolicy({ motion_min_true: 'off' }, 2, 'fixture');
  ok('the new policy keys default plugin-wide',
     groundPolicy.maxStaticGroundSeconds === 4 && groundPolicy.videoBudgetUsd === 10);
  ok('a profile may set or switch the new keys off',
     normalizeMotionPolicy({ max_static_ground_seconds: 'off', video_budget_usd: 6.5 }, 2, 'fixture').maxStaticGroundSeconds === null &&
     normalizeMotionPolicy({ video_budget_usd: 6.5 }, 2, 'fixture').videoBudgetUsd === 6.5);
  ok('html_plate_max is no longer a policy key',
     groundPolicy.htmlPlateMax === undefined &&
     normalizeMotionPolicy({ motion_min_true: 'off', html_plate_max: 1 }, 2, 'fixture').htmlPlateMax === undefined &&
     normalizeMotionPolicy({ htmlPlateMax: 1 }, 2, 'fixture').htmlPlateMax === undefined);
  ok('a still that holds one picture past the limit is rejected',
     has(bads(run([footageScene(), goodShot, footageScene()], null, { policy: groundPolicy })), /one picture stays on screen 6\.0s/));
  ok('a footage slide never holds one picture',
     !has(bads(run([footageScene(), footageScene(), footageScene()], null, { policy: groundPolicy })), /one picture stays/));
  ok('a still per sentence resets the static-ground clock',
     !has(bads(run([footageScene(), Object.assign({}, goodShot, { narration: [{ tts: '가', sub: '가', img: 'a.png' }, { tts: '나', sub: '나', img: 'b.png' }] }), footageScene()],
                   null, { policy: groundPolicy })), /one picture stays/));
  ok('a motion background resets the static-ground clock',
     !has(bads(run([footageScene(), Object.assign({}, goodShot, { visual: { video: { engine: 'seedance', prompt: SEEDANCE_PROMPT }, action: 'waves' } }), footageScene()],
                   null, { policy: groundPolicy })), /one picture stays/));
  ok('an HTML motion slide is exempt from the static-ground clock (owner rule 2026-09-05)',
     !has(bads(run([footageScene(), Object.assign({}, goodShot, { duration: 12, visual: { slide: { file: 'slides/s2-e.html', kind: 'diagram', motion: true,
       treatment: 'editorial', role: 'evidence', motif: 'ink line', plan: 'x' } } }), footageScene()], null, { policy: groundPolicy })), /one picture stays/));
  ok('a still HTML plate is still one picture',
     has(bads(run([footageScene(), Object.assign({}, goodShot, { duration: 9, visual: { slide: { file: 'slides/s2-s.html', labels: ['x'] } } }), footageScene()],
                  null, { policy: groundPolicy })), /one picture stays on screen 9\.0s/));
  const plateScene = (d) => Object.assign({}, cover, { type: 'points', beat: 'drip', transition: 'jcut', hookType: undefined, hookForm: undefined, duration: d });
  ok('HTML plates are not capped per episode (owner rule 2026-09-05)',
     !has(bads(run([footageScene(), plateScene(3), plateScene(3), plateScene(3)], null, { policy: groundPolicy })), /HTML plates/));
  const statFootage = (labels) => Object.assign({}, footageScene({ slide: { labels } }), {
    shot: Object.assign({}, goodShot.shot, { infoType: 'statistic' }) });
  ok('a statistic beat on footage is refused even with labels — the value goes on an editorial diagram',
     has(bads(run([cover, statFootage(['34개'])])), /is retired/) &&
     has(run([cover, statFootage(['34개'])]).filter((f) => f.level !== 'ok'), /must use treatment:"editorial"/));
  ok('a statistic beat on footage no longer asks for labels',
     !has(bads(run([cover, statFootage([])])), /no slide\.labels/));
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
  ok('a retired footage shot is not read for its clip prompt',
     !has(bads(run([cover, footageScene({ slide: { shots: [{ group: 1, clip: 'slides/footage/s2-g1.mp4', duration: 5,
       engine: 'seedance', mark: 'z', audio: 'y', prompt: 'high wide, very slow dolly in, ending on road mid-frame. the riders cross.',
       camera: { movement: 'a', speed: 'b', framing: 'c', end: 'd' } }] } }), goodShot, goodShot])), /no consistency lock/));

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
  ok('same size and angle on consecutive stills in one scene is flagged',
     has(run([cover,
              Object.assign({}, goodShot, { scene: 2, shot: { feel: 'a', size: 'ms', angle: 'eye', info: 'one', infoType: 'other' } }),
              Object.assign({}, goodShot, { scene: 2, shot: { feel: 'b', size: 'ms', angle: 'eye', info: 'two', infoType: 'other' } })]),
         /jump cut/));

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
  ok('spoiler is forbidden on a short',
     has(bads(run([Object.assign({}, cover, { hookType: 'spoiler' }), goodShot, goodShot, ctaShot])),
         /hookType "spoiler"/));
  ok('payoff is forbidden on a short',
     has(bads(run([Object.assign({}, cover, { hookForm: 'payoff' }), goodShot, goodShot, ctaShot])),
         /hookForm "payoff"/));
  ok('a short cover that speaks the answer is a violation',
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

  // ── the story pass (--draft) ──
  // A 4a skeleton: beats, feels, narration sentences, the two hook fields. No tts spelling,
  // no camera slots, no stored prompt — the fields 4b writes.
  const skel = (b) => ({ type: b === 'hook' ? 'cover' : 'points', beat: b,
                         shot: { feel: 'x', size: 'mcu', angle: 'eye', info: '한 가지 정보', infoType: 'other' },
                         narration: [{ sub: '가' }], visual: {} });   // no transition either — 4b writes it
  const skelCover = Object.assign(skel('hook'), { hookType: 'fear', hookForm: 'gap' });
  const skeleton = [skelCover, skel('drip'), skel('drip'), skel('cta')];
  ok('a story-pass skeleton passes with --draft',
     bads(run(skeleton, null, { draft: true })).length === 0);
  ok('the same skeleton fails without --draft',
     has(bads(run(skeleton)), /no tts/));
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

  // Bands come from the preset, never from this file.
  const src = fs.readFileSync(__filename, 'utf8');
  ok('no length band is hardcoded here',
     !/sceneMin\s*[:=]\s*\d/.test(src.replace(/pacing:\s*\{[^}]*\}/g, '')));

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
  const profilePolicy = normalizeMotionPolicy(profileHasPolicy ? profileRaw : null, formatVideoMax,
                                               profilePath || 'format default');
  const scenePolicy = normalizeMotionPolicy(win.MOTION_POLICY || null, formatVideoMax, 'window.MOTION_POLICY');
  const effectivePolicy = profileHasPolicy ? profilePolicy
    : normalizeMotionPolicy(null, formatVideoMax, 'format default');
  const findings = check(win, fmt, { draft, policy: effectivePolicy });

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
