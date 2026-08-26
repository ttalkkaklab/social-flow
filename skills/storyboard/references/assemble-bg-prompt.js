#!/usr/bin/env node
/**
 * Assemble a bgPrompt from shot.size · shot.angle · shot.space (+ scene · mood · exclusions).
 *
 * Image models do not infer camera position or object-centric left/right from prose
 * (GenSpace 2025: ~60% on simple views, ~21% on allocentric). This script writes the
 * visible result — what is where in the frame, which way it faces — in the order the
 * still actually gets drawn. storyboard §5 calls it and stores the whole stdout as
 * `visual.bgPrompt`; produce reruns it only when a `shot` field changed on a still it
 * regenerates (a plain regeneration resends the stored string). Motion prompts for
 * image→video do not go through here — the still already locked the space, and
 * re-describing it makes the engine redesign the scene.
 *
 *   node assemble-bg-prompt.js --size mcu --angle eye \
 *     --layout "person on the left third, door on the right" \
 *     --facing "person faces camera-right, three-quarter view" \
 *     --scene "a Korean woman at a kitchen counter" \
 *     --mood "warm tungsten, late afternoon" \
 *     --exclude "no text, no logos, no signage, face not visible"
 *
 *   node assemble-bg-prompt.js --from ./scenes.js --shot 1 \
 *     --scene "…" --mood "…" --exclude "…"
 *       # --shot <n> counts from 1 — the same number as the strip's "Shot n", script.md
 *       # and scene-<n>.png. (--index <i> is the raw array position, from 0.)
 *
 *   node assemble-bg-prompt.js --from ./scenes.js --shot 4 --space-only
 *       # only the "From the camera: …" sentence — for a quote speech clip, whose
 *       # size and framing come from the produce quote contract, not from here
 *
 *   node assemble-bg-prompt.js --clip --from ./scenes.js --shot 3 --engine seedance \
 *     --motion "steam curling off the cup, hair swaying gently" \
 *     --locks "the three lines on the notepad stay identical in every frame"
 *       # clip mode — the full generated-video prompt, assembled from the shot's
 *       # visual.camera four slots (framing, then speed movement, then ending on end —
 *       # the produce §3 recipe) + subject motion + positive locks + the visual.audio
 *       # sentence. storyboard §4 stores the stdout whole (scenes-schema §clip prompt);
 *       # produce sends it verbatim. --engine picks the machine checks: seedance blocks
 *       # timecodes (2.0 responds to shot numbers only; 1.5 pro shows none in any
 *       # example) and digit seconds; veo allows [mm:ss] timestamps and blocks digit
 *       # seconds; seedance-2.5 takes integer-second forms ("0-3 seconds", "[1s-4s]").
 *       # State changes are written in words on every route: "in under half a second".
 *       # Negative directives are blocked except the Audio: sentence ("no music, no
 *       # speech" is the established wording) and, on seedance routes, the vendor's
 *       # artifact classes (subtitles·text·logo·watermark·bgm — 2.0 guide templates
 *       # them). --with-space prepends the From-the-camera sentence
 *       # (quote clips, which have no still behind them); --scene carries the subject
 *       # description (quote clips only — a motion background must not re-describe the
 *       # scene its PNG already drew). Slot overrides: --movement --speed --framing --end.
 *
 *   node assemble-bg-prompt.js --from ./scenes.js --shot 3 --no-person --scene "…"
 *       # a still with nobody in it — the size words describe the subject, not a body
 *
 *   node assemble-bg-prompt.js --check "left view of a car"   # exit 1 on banned language
 *   node assemble-bg-prompt.js --selftest
 *
 * Order of the output: size words · angle words · "From the camera: layout. facing.
 * line. light." · scene · mood · exclusions · tail ("the picture fills the frame from
 * the top edge to the bottom edge, even brightness top to bottom" unless --tail "").
 * Owner 2026-08-25: never ask for a letterbox / lower-third fade / top-bottom gradient.
 * The image tools (gpt_image_text2img, image_local_generate) have
 * no exclusion argument, so --exclude goes into the body as the short noun list the
 * profile requires; only veo_* takes a separate negativePrompt.
 *
 * stdout is the assembled prompt (or OK on --check). Banned language anywhere in the
 * assembled prompt — the space slots, --scene, --mood, --exclude — prints to stderr and
 * exits 1. Directing-grammar §3.5 is the source of truth for the words. The same three
 * patterns live in storyboard-html-template.html (bannedSpaceHits) — --selftest fails if
 * the two copies drift.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SIZE_WORDS = {
  els: "extreme long shot, person under a tenth of the frame height",
  ls: "wide shot, full body with room above and below",
  ws: "wide shot, full body with room above and below",
  fs: "full shot, head to toe",
  mfs: "medium full shot, frame bottom at mid-shin",
  ms: "medium shot, frame bottom at mid-thigh",
  mcu: "medium close-up, chest up",
  cu: "close-up, shoulders at the bottom, crown lightly cropped",
  choker: "choker, forehead to chin",
  ecu: "extreme close-up",
  insert: "insert, the object fills the frame",
  two: "two-shot",
  three: "three-shot",
  ots: "over-the-shoulder",
  pov: "point of view, hands enter the lower frame, no face",
  back: "from behind, the back fills the frame",
  cutaway: "cutaway",
  reaction: "reaction close-up"
};

// --no-person: the same ladder for a still with nobody in it (a vent box, a tunnel cutaway).
const SIZE_WORDS_OBJECT = {
  els: "extreme long shot, the subject tiny in a wide view",
  ls: "wide shot, the whole subject with room around it",
  ws: "wide shot, the whole subject with room around it",
  fs: "full shot, the whole subject edge to edge",
  mfs: "medium full shot, most of the subject",
  ms: "medium shot, the subject's upper part",
  mcu: "medium close-up, the subject's main part filling most of the frame",
  cu: "close-up of the subject",
  choker: "tight close-up of one part of the subject",
  ecu: "extreme close-up",
  insert: "insert, the object fills the frame",
  cutaway: "cutaway"
};

// Prepositional phrases, so "<size words>, <angle words>." reads as one sentence.
const ANGLE_WORDS = {
  eye: "at eye level",
  high: "seen from above",
  low: "from a low angle, looking up",
  overhead: "from straight overhead",
  dutch: "at a dutch angle, horizon tilted"
};

// Camera-inference ("left view of X"), allocentric ("from the car's right", "to her
// left"), and metric distances (digits or number words + m/metres). "from the camera",
// "from the camera's right", "facing left of frame", "camera-left", "seen from
// behind/above" are fine; so is a pronoun + back/front as a body part ("on his back").
// storyboard-html-template.html carries the same three regexes in bannedSpaceHits —
// keep them identical (the selftest checks).
const BANNED = [
  { re: /\b(?:left|right|front|back|rear) view of\b/i,
    why: "camera-inference — write the visible result (\"facing left of frame\"), not the camera's seat" },
  { re: /\b(?:from|to|on|at) (?:the |a |an )?(?:(?!(?:camera|viewer|frame|picture)(?:'s|’s))[\w-]+(?:'s|’s) (?:own )?(?:left|right|front|back|rear)|(?:his|her|its|their) (?:own )?(?:left|right))\b/i,
    why: "allocentric — models default to the camera's left/right and invert the object's" },
  { re: /\b(?:\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|half a|a few|several)\s*(?:m|meters?|metres?)\b/i,
    why: "metric distance — models ignore the number; put distance in shot.size, not metres" }
];

// ── Clip mode — the generated-video prompt checks ──
// Negative directives in the body draw the noun instead (measured 4 of 4 on images; Veo's
// own guide marks the form not recommended) — exclusions are Veo's negativePrompt argument,
// and on Seedance a re-description plus positive locks. The Audio: sentence is exempt:
// "no music, no speech" is a state description, the established wording (scenes-schema
// §clip audio). Edit directives about cutting keep whichever negation word carries them.
// storyboard-html-template.html carries NEG_RE/NEG_OK verbatim (negHits) — the selftest
// checks the two copies match.
const NEG_OK = /^(cut|cuts|camera cuts|timecode|timecodes|timecode splits)\b/;
const NEG_RE = /\b(no|not|avoid|avoids|never|don't|dont|doesn't|won't)\b[ \t]*([a-z' \t-]{0,24})/gi;
// On a seedance route the vendor's own 2.0 guide templates directive negatives for the
// artifact classes only — subtitles, on-frame text, logos, watermarks (2.5 adds audio/BGM).
// Everything else stays positive re-description. On veo every exclusion is the
// negativePrompt argument, so no body negative is exempt there.
const ARTIFACT_OK = /(subtitle|caption|text|logo|watermark|bgm)/;
function negDirectiveHits(text, engine) {
  if (!text) return [];
  const out = [];
  const seedance = typeof engine === "string" && engine.indexOf("seedance") === 0;
  let m;
  NEG_RE.lastIndex = 0;
  while ((m = NEG_RE.exec(text)) !== null) {
    const tail = (m[2] || "").trim().toLowerCase();
    if (NEG_OK.test(tail.replace(/[^a-z ].*$/, "").trim())) continue;
    if (seedance && ARTIFACT_OK.test(tail)) continue;
    out.push((m[1] + " " + tail).trim());
    if (out.length >= 3) break;
  }
  return out;
}
// Timecodes and digit seconds. Seedance 2.0 self-reports unstable precision timing, so a
// Seedance-routed prompt takes neither; Veo 3.1 presents [mm:ss] interval prompting as a
// workflow, so on veo the timestamp form passes and only bare digit seconds are blocked
// (in-clip state changes are written in words on both engines: "in under half a second").
// Bracketed spans and zero-led clock times only — "9:16" is a ratio, not a timecode.
const TIMESTAMP_RE = /\[\d{1,2}:\d{2}(?:\s*[-–~]\s*\d{1,2}:\d{2})?\]|\b0\d?:\d{2}\b/;
const DIGIT_SECONDS_RE = /\b(\d{1,3})(?:\.\d+)?\s*(s|secs?|seconds?)\b/gi;
function timingHits(text, engine) {
  const hits = [];
  if (!text) return hits;
  if (TIMESTAMP_RE.test(text) && engine !== "veo")
    hits.push("clock timecode — 2.0 responds to shot numbers, not timestamps, and 1.5 pro shows none in any example; order beats by description and cut in the edit (on seedance-2.5 write integer-second forms, on veo [mm:ss] is the workflow)");
  if (engine === "seedance-2.5") return hits;   // 2.5 officially takes integer-second timestamps ("0-3 seconds", "[1s-4s]", "at the 2-second mark")
  let m;
  DIGIT_SECONDS_RE.lastIndex = 0;
  while ((m = DIGIT_SECONDS_RE.exec(text)) !== null) {
    // A bare "s" on a number over 19 is a decade ("80s film look"), not a length.
    if (m[2].toLowerCase() === "s" && Number(m[1]) > 19) continue;
    hits.push("digit seconds (\"" + m[0] + "\") — length lives in `duration`; an in-clip state change is written in words (\"in under half a second\")" + (engine === "veo" ? ", or as a [mm:ss] span on Veo" : ""));
    break;
  }
  return hits;
}

function clipAssemble(opts) {
  const cam = opts.camera || {};
  const missing = ["movement", "speed", "framing", "end"].filter(k => !(cam[k] && String(cam[k]).trim()));
  const scene = (opts.scene || "").trim();
  const motion = (opts.motion || "").trim();
  const locks = (opts.locks || "").trim();
  const audio = (opts.audio || "").trim();
  const dot = s => s.replace(/[.!?\s]*$/, "") + ".";

  const parts = [];
  const space = opts.withSpace ? spaceSentence(opts) : "";
  if (space) parts.push(space);
  if (scene) parts.push(dot(scene));
  // The produce §3 recipe: framing, then speed movement, then ending on end. A static
  // camera has no speed to state — "static camera" is the whole move.
  const isStatic = /^(static|fixed|locked)/i.test((cam.movement || "").trim());
  const move = isStatic ? "static camera" : ((cam.speed || "").trim() + " " + (cam.movement || "").trim()).trim();
  const span = [(cam.framing || "").trim(), move, cam.end ? "ending on " + String(cam.end).trim() : ""]
    .filter(Boolean).join(", ");
  if (span) parts.push(dot(span));
  if (motion) parts.push(dot(motion));
  if (locks) parts.push(dot(locks));
  if (audio) parts.push(dot(/^audio\s*:/i.test(audio) ? audio : "Audio: " + audio));

  const prompt = parts.join(" ").replace(/\s+/g, " ").replace(/\s+\./g, ".").trim();
  // The Audio: sentence is exempt from the negative-directive check — split it off.
  const audioAt = prompt.search(/Audio\s*:/i);
  const body = audioAt >= 0 ? prompt.slice(0, audioAt) : prompt;
  return {
    prompt,
    hits: bannedHits(prompt),
    negHits: negDirectiveHits(body, opts.engine),
    timeHits: timingHits(body, opts.engine),
    missing
  };
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--selftest" || a === "--help" || a === "--space-only" || a === "--no-person" ||
        a === "--clip" || a === "--with-space") { out[a.slice(2)] = true; continue; }
    if (a.startsWith("--") && i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
      out[a.slice(2)] = argv[++i];
      continue;
    }
    if (a.startsWith("--")) { out[a.slice(2)] = true; continue; }
    out._.push(a);
  }
  return out;
}

function bannedHits(text) {
  if (!text) return [];
  const hits = [];
  for (const b of BANNED) {
    const m = text.match(b.re);
    if (m) hits.push({ match: m[0], why: b.why });
  }
  return hits;
}

function spaceSentence(opts) {
  const layout = (opts.layout || "").trim();
  const facing = (opts.facing || "").trim();
  const line = (opts.line || "").trim();
  const light = (opts.light || "").trim();
  const bits = [];
  if (layout) bits.push(layout.replace(/^from the camera[,:]\s*/i, ""));
  if (facing) bits.push(facing);
  if (line) bits.push("keep " + line + " true in this frame");
  if (light) bits.push(light);
  return bits.length ? "From the camera: " + bits.join(". ") + "." : "";
}

function assemble(opts) {
  const size = opts.size || "";
  const angle = opts.angle || "eye";
  const scene = (opts.scene || "").trim();
  const mood = (opts.mood || "").trim();
  const exclude = (opts.exclude || "").trim();
  const tail = (opts.tail === undefined ? "the picture fills the frame from the top edge to the bottom edge, even brightness top to bottom" : opts.tail).trim();

  const ladder = opts.noPerson ? SIZE_WORDS_OBJECT : SIZE_WORDS;
  const sizeWords = ladder[size] || SIZE_WORDS[size] || (size ? size : "");
  const angleWords = ANGLE_WORDS[angle] || angle || ANGLE_WORDS.eye;
  const unknown = [];
  if (size && !SIZE_WORDS[size]) unknown.push("size \"" + size + "\"");
  if (angle && !ANGLE_WORDS[angle]) unknown.push("angle \"" + angle + "\"");

  const space = spaceSentence(opts);
  const parts = [];
  if (sizeWords) parts.push(sizeWords + ", " + angleWords + ".");
  else parts.push(angleWords + ".");
  if (space) parts.push(space);
  if (scene) parts.push(scene.replace(/[.!?\s]*$/, "") + ".");
  if (mood) parts.push(mood.replace(/[.!?\s]*$/, "") + ".");
  if (exclude) parts.push(exclude.replace(/[.!?\s]*$/, "") + ".");
  if (tail) parts.push(tail.replace(/[.!?\s]*$/, "") + ".");

  const prompt = parts.join(" ").replace(/\s+/g, " ").replace(/\s+\./g, ".").trim();

  // The whole prompt is checked — a "left view of" in --scene ships to the model just the same.
  const hits = bannedHits(prompt);
  return { prompt, space, hits, unknown, size, angle, layout: opts.layout, facing: opts.facing };
}

function loadShot(file, index) {
  const src = fs.readFileSync(file, "utf8");
  const sandbox = { window: {}, console: { log() {}, warn() {}, error() {} } };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(src, sandbox, { filename: file, timeout: 5000 });
  const scenes = (sandbox.window && sandbox.window.SCENES) || [];
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= scenes.length) {
    throw new Error("index " + index + " is outside SCENES[0.." + (scenes.length - 1) + "]");
  }
  const s = scenes[i] || {};
  const sh = s.shot || {};
  const sp = sh.space || {};
  const v = s.visual || {};
  return {
    size: sh.size,
    angle: sh.angle,
    layout: sp.layout,
    facing: sp.facing,
    line: sp.line,
    light: sp.light,
    camera: v.camera || null,
    audio: typeof v.audio === "string" ? v.audio : "",
    position: "SCENES[" + i + "] = shot " + (i + 1) + " of " + scenes.length + (s.type ? " (" + s.type + ")" : "")
  };
}

const VALUE_FLAGS = ["size", "angle", "layout", "facing", "line", "light", "scene", "mood", "exclude", "tail", "from", "index", "shot",
  "motion", "locks", "engine", "audio", "movement", "speed", "framing", "end"];

function selftest() {
  let fail = 0;
  const eq = (name, got, want) => {
    if (got !== want) {
      console.error("FAIL " + name + "\n  got:  " + JSON.stringify(got) + "\n  want: " + JSON.stringify(want));
      fail++;
    }
  };
  const ok = (name, cond) => {
    if (!cond) { console.error("FAIL " + name); fail++; }
  };

  const a = assemble({
    size: "mcu", angle: "eye",
    layout: "person on the left third, kitchen door on the right",
    facing: "person faces camera-right, three-quarter view",
    scene: "a Korean woman at a kitchen counter",
    mood: "warm tungsten",
    exclude: "no text, no logos"
  });
  ok("prefix starts with size+angle",
    a.prompt.startsWith("medium close-up, chest up, at eye level. From the camera:"));
  // Every angle joins the size words as one readable sentence.
  eq("high joins", assemble({ size: "ls", angle: "high", tail: "" }).prompt, "wide shot, full body with room above and below, seen from above.");
  eq("overhead joins", assemble({ size: "ls", angle: "overhead", tail: "" }).prompt, "wide shot, full body with room above and below, from straight overhead.");
  eq("low joins", assemble({ size: "fs", angle: "low", tail: "" }).prompt, "full shot, head to toe, from a low angle, looking up.");
  ok("layout is camera-framed", a.prompt.includes("person on the left third"));
  ok("facing is the visible result", a.prompt.includes("faces camera-right"));
  ok("scene follows space", /From the camera:.*a Korean woman/.test(a.prompt));
  ok("exclusions sit after the mood, before the tail",
    a.prompt.endsWith("warm tungsten. no text, no logos. the picture fills the frame from the top edge to the bottom edge, even brightness top to bottom."));
  eq("no banned hits on a good prompt", a.hits.length, 0);

  // Banned language in --scene / --mood / --exclude is caught too — it ships to the model.
  ok("flags left view of in --scene",
    assemble({ size: "ms", scene: "left view of a car" }).hits.length > 0);
  ok("flags metres in --mood",
    assemble({ size: "ms", scene: "a car", mood: "soft light from 3 meters" }).hits.length > 0);
  eq("the standard exclusions and tail are clean",
    assemble({ size: "ls", scene: "a vent box",
      exclude: "no text, no logos, no signage, no readable characters, face not visible, no flags, no national emblems, no maps, no government buildings" }).hits.length, 0);
  // Every size word on both ladders is clean.
  Object.keys(SIZE_WORDS).forEach(k => eq("size words clean: " + k, bannedHits(SIZE_WORDS[k]).length, 0));
  Object.keys(SIZE_WORDS_OBJECT).forEach(k => eq("object size words clean: " + k, bannedHits(SIZE_WORDS_OBJECT[k]).length, 0));
  ok("--no-person drops the body words",
    assemble({ size: "ls", noPerson: true, scene: "a vent box" }).prompt.startsWith("wide shot, the whole subject with room around it, at eye level."));

  eq("layout's own 'from the camera,' prefix is not doubled",
    spaceSentence({ layout: "from the camera, the right-hand door is on the right of frame" }),
    "From the camera: the right-hand door is on the right of frame.");
  eq("sentence ends are normalised",
    assemble({ size: "ms", scene: "is this it?", tail: "" }).prompt, "medium shot, frame bottom at mid-thigh, at eye level. is this it.");
  ok("out-of-vocabulary size is reported", assemble({ size: "xyz", scene: "x" }).unknown.length === 1);

  // No space written (an older scenes.js) — no dangling "From the camera." sentence.
  const bare = assemble({ size: "ls", angle: "eye", scene: "a street vent" });
  eq("no space → no From-the-camera sentence", bare.space, "");
  ok("no space → prompt has no dangling sentence", !/From the camera\./.test(bare.prompt));

  // --tail "" turns the tail off; --space-only gives just the sentence.
  eq("empty tail is honoured",
    assemble({ size: "ms", scene: "x", tail: "" }).prompt, "medium shot, frame bottom at mid-thigh, at eye level. x.");
  eq("space sentence alone (quote clip)",
    assemble({ size: "mcu", layout: "speaker centred", facing: "faces the camera" }).space,
    "From the camera: speaker centred. faces the camera.");

  // Banned forms — every example the docs list (directing-grammar §3.5 · scenes-schema §frame space).
  const banned = [
    ["camera-inference: left view of", "left view of a car"],
    ["camera-inference: right view of", "right view of X"],
    ["camera-inference: front view of", "front view of the desk"],
    ["camera-inference: back view of", "back view of the car"],
    ["allocentric: from the car's right door", "from the car's right door"],
    ["allocentric: from X's left (no article)", "from Minsu's left"],
    ["allocentric: to her right", "she looks to her right"],
    ["allocentric: on its left", "a bag on its left side"],
    ["allocentric: at his own right", "a lamp at his own right"],
    ["metric: 1.5 m", "two people 1.5 m apart"],
    ["metric: 3 meters", "from 3 meters"],
    ["metric: 3m", "3m away"],
    ["metric: three meters (word)", "stopping three meters away"],
    ["metric: two metres", "two metres from the door"],
    ["metric: half a metre", "half a metre apart"]
  ];
  banned.forEach(([name, text]) => ok("flags " + name, bannedHits(text).length > 0));

  // Allowed forms — the canonical camera-frame wording must pass untouched.
  const allowed = [
    "person facing left of frame, key from camera-left",
    "from the camera, A is on the left, B on the right",
    "faces camera-right, three-quarter view",
    "seen from behind, face turned away",
    "seen from above, the person small in the room",
    "the car faces left of frame",
    "the right-hand door is on the right of frame",
    "a 5 mm rim of light",                // not a distance
    "runs for 10 min",                    // not metres
    "on the left third, door on the right",
    "from the camera's right, the door",  // camera possessive is the camera frame
    "on the viewer's left",
    "a backpack on his back",             // a body part, not a direction
    "lying on her back, face up"
  ];
  allowed.forEach(text => eq("allows: " + text, bannedHits(text).length, 0));

  const line = assemble({
    size: "two", angle: "eye",
    layout: "A on the left, B on the right",
    facing: "both face each other in profile",
    line: "A left, B right"
  });
  ok("180 line is locked in the prefix", line.prompt.includes("keep A left, B right true in this frame"));

  // ── Clip mode ──
  const camA = { movement: "dolly in", speed: "very slow", framing: "chest-up on the subject", end: "subject centred at mid-frame" };
  const c1 = clipAssemble({ camera: camA, engine: "seedance",
    motion: "steam curling off the cup", locks: "the notepad's three lines stay identical in every frame",
    audio: "quiet room tone, no music, no speech" });
  eq("clip: the produce §3 recipe — framing, speed movement, ending on end",
    c1.prompt,
    "chest-up on the subject, very slow dolly in, ending on subject centred at mid-frame. steam curling off the cup. the notepad's three lines stay identical in every frame. Audio: quiet room tone, no music, no speech.");
  eq("clip: 'no music, no speech' in the Audio sentence is exempt", c1.negHits.length, 0);
  eq("clip: clean prompt has no timing hits", c1.timeHits.length, 0);
  eq("clip: all four slots present", c1.missing.length, 0);

  ok("clip: static camera drops the speed word",
    clipAssemble({ camera: { movement: "static", speed: "n/a", framing: "wide on the desk", end: "unchanged" }, engine: "veo" })
      .prompt.startsWith("wide on the desk, static camera, ending on unchanged."));
  ok("clip: missing end is reported",
    clipAssemble({ camera: { movement: "pan", speed: "slow", framing: "wide" }, engine: "veo" }).missing.indexOf("end") >= 0);
  ok("clip: negative directive in the body is caught",
    clipAssemble({ camera: camA, engine: "veo", motion: "no sudden moves, hands resting" }).negHits.length > 0);
  ok("clip: the cut line's negation is allowed",
    clipAssemble({ camera: camA, engine: "seedance", locks: "Sequence of cuts, no timecodes — cuts only at the specified points, the camera does not cut on its own" }).negHits.length === 0);
  ok("clip: timecode blocked on seedance",
    clipAssemble({ camera: camA, engine: "seedance", motion: "at [00:04] the door closes" }).timeHits.length > 0);
  eq("clip: timestamp allowed on veo",
    clipAssemble({ camera: camA, engine: "veo", motion: "[00:00-00:02] she looks up, [00:02-00:06] the door closes" }).timeHits.length, 0);
  ok("clip: digit seconds blocked on both",
    clipAssemble({ camera: camA, engine: "veo", motion: "the light comes up over 2 seconds" }).timeHits.length > 0);
  eq("clip: a state change in words passes",
    clipAssemble({ camera: camA, engine: "seedance", motion: "the visor snaps shut in under half a second" }).timeHits.length, 0);
  eq("clip: 9:16 is a ratio, not a timecode",
    clipAssemble({ camera: camA, engine: "seedance", motion: "holds the vertical 9:16 composition" }).timeHits.length, 0);
  eq("clip: a decade is not a length",
    clipAssemble({ camera: camA, engine: "seedance", motion: "soft 80s film look on the highlights" }).timeHits.length, 0);
  ok("clip: --with-space prepends the From-the-camera sentence",
    clipAssemble({ camera: camA, engine: "veo", withSpace: true, layout: "speaker centred", facing: "faces the camera" })
      .prompt.startsWith("From the camera: speaker centred. faces the camera."));
  ok("clip: banned space language still caught",
    clipAssemble({ camera: camA, engine: "veo", motion: "left view of the desk" }).hits.length > 0);
  // Artifact-class negatives — vendor-templated on seedance (2.0 guide), negativePrompt-only on veo.
  eq("clip: 'avoid generating any text or subtitles' passes on seedance",
    clipAssemble({ camera: camA, engine: "seedance", locks: "avoid generating any text or subtitles, do not generate a watermark" }).negHits.length, 0);
  ok("clip: the same line is caught on veo (belongs in negativePrompt)",
    clipAssemble({ camera: camA, engine: "veo", locks: "avoid generating any text or subtitles" }).negHits.length > 0);
  ok("clip: a non-artifact negative is still caught on seedance",
    clipAssemble({ camera: camA, engine: "seedance", motion: "no sudden moves" }).negHits.length > 0);
  // seedance-2.5 takes integer-second timestamp forms; the clock form stays blocked.
  eq("clip: integer-second forms pass on seedance-2.5",
    clipAssemble({ camera: camA, engine: "seedance-2.5", motion: "0-3 seconds the door opens, at the 4-second mark the lights die" }).timeHits.length, 0);
  ok("clip: clock timecode still blocked on seedance-2.5",
    clipAssemble({ camera: camA, engine: "seedance-2.5", motion: "at [00:04] the door closes" }).timeHits.length > 0);

  // Drift guard — storyboard-html-template.html carries the same three regexes.
  const tpl = path.join(__dirname, "storyboard-html-template.html");
  if (fs.existsSync(tpl)) {
    const html = fs.readFileSync(tpl, "utf8");
    BANNED.forEach((b, i) => ok("template carries BANNED[" + i + "] verbatim (source and flags)",
      html.includes("/" + b.re.source + "/" + b.re.flags)));
    ok("template carries NEG_RE verbatim", html.includes("/" + NEG_RE.source + "/" + NEG_RE.flags));
    ok("template carries NEG_OK verbatim", html.includes("/" + NEG_OK.source + "/"));
    ok("template carries ARTIFACT_OK verbatim", html.includes("/" + ARTIFACT_OK.source + "/"));
    ok("template carries TIMESTAMP_RE verbatim", html.includes("/" + TIMESTAMP_RE.source + "/"));
    ok("template carries DIGIT_SECONDS_RE verbatim", html.includes("/" + DIGIT_SECONDS_RE.source + "/" + DIGIT_SECONDS_RE.flags));
  } else {
    console.error("WARN storyboard-html-template.html not found beside this file — drift guard skipped");
  }

  if (fail) {
    console.error(fail + " failed");
    process.exit(1);
  }
  console.log("assemble-bg-prompt selftest OK");
}

function main(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(fs.readFileSync(__filename, "utf8").split("*/")[0].replace(/^[\s\S]*?\*\n/, ""));
    return;
  }
  if (args.selftest) { selftest(); return; }
  if (args.check !== undefined) {
    // `--check left view of a car` without quotes lands the first word in args.check and the
    // rest in args._ — check the whole thing.
    const text = [typeof args.check === "string" ? args.check : "", ...args._].join(" ").trim();
    if (!text) {
      console.error("usage: assemble-bg-prompt.js --check \"<text>\"");
      process.exit(2);
    }
    const hits = bannedHits(text);
    if (hits.length) {
      hits.forEach(h => console.error("banned: \"" + h.match + "\" — " + h.why));
      process.exit(1);
    }
    console.log("OK");
    return;
  }

  // A mistyped flag (--scen, --layoutt) would silently drop that value from the prompt.
  const KNOWN = new Set([...VALUE_FLAGS, "selftest", "help", "space-only", "no-person", "check", "clip", "with-space", "_"]);
  const unknownFlags = Object.keys(args).filter(k => !KNOWN.has(k));
  if (unknownFlags.length) {
    console.error("assemble-bg-prompt: unknown flag --" + unknownFlags.join(", --") + " — see --help");
    process.exit(2);
  }
  // A value flag with no value, or a value left unquoted (its tail lands in args._), is a
  // mistake that would otherwise ship "true" or half a sentence to the model.
  const bare = VALUE_FLAGS.filter(k => args[k] === true);
  if (bare.length) {
    console.error("assemble-bg-prompt: --" + bare.join(", --") + " needs a value (quote it if it has spaces)");
    process.exit(2);
  }
  if (args._.length) {
    console.error("assemble-bg-prompt: stray words " + JSON.stringify(args._.join(" ")) + " — an unquoted value? quote it");
    process.exit(2);
  }
  let opts = {
    size: args.size, angle: args.angle,
    layout: args.layout, facing: args.facing,
    line: args.line, light: args.light,
    scene: args.scene, mood: args.mood, exclude: args.exclude, tail: args.tail
  };
  if (args.from) {
    let loaded;
    try {
      if (args.shot !== undefined && args.index !== undefined) throw new Error("give --shot (from 1) or --index (from 0), not both");
      if (args.shot === undefined && args.index === undefined) throw new Error("--from needs --shot <n> (from 1) or --index <i> (from 0) — no silent default to shot 1");
      const index = args.shot !== undefined ? Number(args.shot) - 1 : args.index;
      if (args.shot !== undefined && !(Number.isInteger(Number(args.shot)) && Number(args.shot) >= 1))
        throw new Error("--shot needs a whole number from 1 (the strip's \"Shot n\", scene-<n>.png)");
      loaded = loadShot(path.resolve(args.from), index);
    } catch (e) {
      console.error("assemble-bg-prompt: " + e.message);
      process.exit(1);
    }
    console.error("assemble-bg-prompt: " + loaded.position);
    delete loaded.position;
    opts = { ...loaded, ...Object.fromEntries(Object.entries(opts).filter(([, v]) => v !== undefined)) };
  } else if (args.shot !== undefined || args.index !== undefined) {
    console.error("assemble-bg-prompt: --shot/--index need --from <scenes.js>");
    process.exit(2);
  }
  opts.noPerson = !!args["no-person"];

  if (args.clip) {
    if (args.engine !== "seedance" && args.engine !== "veo" && args.engine !== "seedance-2.5") {
      console.error("assemble-bg-prompt: --clip needs --engine seedance|veo|seedance-2.5 — the timing checks differ per route");
      process.exit(2);
    }
    // Slot overrides beat the file — the same precedence as the space flags above.
    const cam = { ...(opts.camera || {}) };
    ["movement", "speed", "framing", "end"].forEach(k => { if (args[k] !== undefined) cam[k] = args[k]; });
    const r = clipAssemble({
      camera: cam, engine: args.engine,
      scene: opts.scene, motion: args.motion, locks: args.locks,
      audio: args.audio !== undefined ? args.audio : opts.audio,
      withSpace: !!args["with-space"],
      layout: opts.layout, facing: opts.facing, line: opts.line, light: opts.light
    });
    if (r.missing.length)
      console.error("warning: visual.camera is missing " + r.missing.join(", ") +
        " — four filled slots is the contract (scenes-schema §camera); the prompt goes out without them");
    if (!r.prompt) { console.error("assemble-bg-prompt: nothing to assemble — no slots, motion, locks or audio"); process.exit(2); }
    let bad = 0;
    r.hits.forEach(h => { console.error("banned: \"" + h.match + "\" — " + h.why); bad++; });
    r.negHits.forEach(h => { console.error("banned: \"" + h + "\" — negative directive in the body; Veo takes exclusions in negativePrompt, Seedance wants the scene re-described plus positive locks"); bad++; });
    r.timeHits.forEach(h => { console.error("banned: " + h); bad++; });
    if (bad) process.exit(1);
    process.stdout.write(r.prompt + "\n");
    return;
  }

  const { prompt, space, hits, unknown } = assemble(opts);
  if (unknown.length) {
    console.error("warning: " + unknown.join(", ") + " outside the vocabulary (scenes-schema §shot) — sent to the model as written");
  }
  if (hits.length) {
    hits.forEach(h => console.error("banned: \"" + h.match + "\" — " + h.why));
    process.exit(1);
  }
  if (!space) {
    console.error("note: no shot.space on this shot — the prompt carries size and angle only; " +
      "on a generated still fill layout/facing first (directing-grammar §3.5)");
  }
  process.stdout.write((args["space-only"] ? space : prompt) + "\n");
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { assemble, clipAssemble, bannedHits, negDirectiveHits, timingHits, spaceSentence, SIZE_WORDS, SIZE_WORDS_OBJECT, ANGLE_WORDS, BANNED, NEG_RE, NEG_OK };
