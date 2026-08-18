#!/usr/bin/env node
/**
 * Pulls the per-surface Korean text out of scenes.js — input for the style gate (check-style.py).
 *
 *   node extract-text.js <path to scenes.js> [narration|subtitle|screen]
 *
 * scenes.js is not a CommonJS module, it is the `window.SCENES` global contract
 * (scenes-schema.md §file contract). So window gets injected before require —
 * skip that and it dies with a ReferenceError, the redirected file comes out
 * empty, and the gate passes without checking anything.
 *
 * Surfaces:
 *   narration — the sentences TTS reads (`narration[].tts`). Heard once, in passing.
 *   subtitle  — subtitles burned into the frame (`narration[].sub`). Spelled differently from tts.
 *   screen    — card text: kicker·title·stat·statLabel·bullets(t·d)·footnote,
 *               plus text·role on quote scenes. This surface cannot be fixed after publishing.
 *               speaker (a person's name) is left out, being a proper noun.
 *
 * exit 0 ok / 2 bad arguments / 3 could not read scenes.js.
 */

const path = require("path");

const [, , file, surface = "narration"] = process.argv;
const SURFACES = ["narration", "subtitle", "screen"];

if (!file || !SURFACES.includes(surface)) {
  console.error(`usage: extract-text.js <scenes.js> [${SURFACES.join("|")}]`);
  process.exit(2);
}

global.window = {};
try {
  require(path.resolve(file));
} catch (e) {
  console.error(`extract-text: could not read scenes.js — ${e.message}`);
  process.exit(3);
}

const scenes = global.window.SCENES;
if (!Array.isArray(scenes)) {
  console.error("extract-text: no window.SCENES array found (check the scenes-schema.md contract)");
  process.exit(3);
}

// String fields on the card surface. Markdown emphasis (**…**) is a render directive, so strip it.
const SCREEN_KEYS = ["kicker", "title", "stat", "statLabel", "footnote", "text", "role"];
const strip = (s) => String(s).replace(/\*\*/g, "").trim();

const out = [];
for (const s of scenes) {
  if (surface === "narration" || surface === "subtitle") {
    const key = surface === "narration" ? "tts" : "sub";
    for (const seg of s.narration || []) {
      if (seg && seg[key]) out.push(strip(seg[key]));
    }
  } else {
    for (const k of SCREEN_KEYS) {
      if (s[k]) out.push(strip(s[k]));
    }
    for (const b of s.bullets || []) {
      if (b && b.t) out.push(strip(b.t));
      if (b && b.d) out.push(strip(b.d));
    }
  }
}

if (!out.length) {
  console.error(`extract-text: ${surface} text is empty — check the scene structure`);
  process.exit(3);
}

// Fragments with no sentence ending (titles, labels) get a period so they are judged as sentences.
console.log(out.map((t) => (/[.!?…]$/.test(t) ? t : `${t}.`)).join("\n"));
