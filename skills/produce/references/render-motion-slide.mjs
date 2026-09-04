#!/usr/bin/env node
/**
 * render-motion-slide.mjs — renders a motion slide (scenes-schema §motion slides) into one
 * clip per reveal group, deterministically, with no npm dependency.
 *
 *   node render-motion-slide.mjs <storyboard/slides/sN-slug.html> --out <dir> [--fps 30]
 *        [--jobs 4] [--sheet] [--png-only] [--group k] [--frame k:ms] [--keep-frames]
 *        [--segs auto|k:ms,...] [--grain 0..30]
 *
 * --grain adds film grain at the mp4 encode (default 6 — luma-only static noise, ffmpeg's
 *   noise filter with a fixed seed, so the same frames still encode to the same bytes). Grain
 *   is what keeps a flat plate from banding in 8-bit and what makes a graphic read as broadcast
 *   rather than web (slide-design.md §1). It is added here rather than drawn in the page because
 *   a noisy frame halves the PNG capture rate (measured 15 → 8 fps). 0 turns it off. --png-only
 *   frames and the --sheet PNGs never carry it. A photographic frame (h.photo, a footage clip)
 *   costs its PNG encode, not the CSS: Chrome's default PNG encoder took 233 ms per 1080×1920
 *   footage frame, and captureScreenshot's optimizeForSpeed (a faster zlib level, same pixels)
 *   takes 72 ms — the frames came out byte-identical on 133/133 (ep209 s10, 2026-09-04).
 *
 * Where the time goes on a footage slide (per frame, ep209 s10 group 1, 133 frames, M4):
 *   before 2026-09-04 — seek 64 ms · settle 123 ms · PNG 233 ms → 2.4 fps
 *   now               — seek 64 ms · settle   0 ms · PNG  72 ms → 6.8 fps on one tab, 10.4 on three
 *   The old settle waited on requestVideoFrameCallback with a 120 ms ceiling after every seek,
 *   and in headless the callback never fires (0 of 461), so every frame paid the ceiling. The
 *   frames captured with no wait at all were identical to the waited ones on 457 of 459 — the
 *   other two are the stuck-frame case shotStable handles below, and the old renderer got those
 *   wrong at random too. Re-encoding the clips to all-intra (one keyframe per frame) changed
 *   nothing — seek is not the cost, so the renderer does not do it.
 *
 * --segs hands the page its narration segment lengths (the sustain layer, slide-design.md §5):
 *   elements marked .sv stretch their meaning-bearing movement to the segment, so the clip
 *   fills the spoken sentence instead of freezing after the entrance. "auto" estimates from
 *   narration characters at the schema rate (chars / 4.5 per second) — for the storyboard
 *   design gate, which runs before any TTS exists. produce re-renders with measured ms once
 *   the narration wav is cut (optional-lanes.md §3.6). Without --segs, token durations hold
 *   and each clip freezes on its rest frame as before. The summary also reports
 *   zone_fill_pct — how much of the subtitle-free zone the painted content covers at the
 *   final rest frame — and warns under 55%.
 *
 * How it works — the seek model (docs/research/2026-08-29-motion-slide-lane):
 *   Chrome is launched ONCE (headless, --remote-debugging-pipe — CDP over fd 3/4, no puppeteer)
 *   and the page is asked for every frame at an exact time: window.__seek(tMs, g) pauses every
 *   animation and sets its currentTime, so the same (g, t) always yields the same pixels. A
 *   frame therefore depends on nothing but (g, t), which is why --jobs tabs can capture
 *   different groups at the same time and still produce the same bytes. The
 *   state rule the page follows (template head): clip k opens on groups 0..k-1 at rest, group k
 *   animates from t=0, and the last frame is group k at rest — which is exactly what the
 *   builder's `@clip` visual needs (play once, freeze on the last frame). No narration timing
 *   is needed here; produce lays clip k under narration segment k.
 *
 * Output (<dir>/):
 *   r<k>.mp4          group k's clip, k = 1..N — 30fps CFR, yuv420p, canvas size, no audio
 *   r0.png            the base state (clip 1's first frame) — for the storyboard check strip
 *   sheet/g<k>-mid.png · g<k>-end.png   (--sheet) the frames slide-reviewer reads
 *   manifest.tsv      k <TAB> frames <TAB> dur_ms <TAB> file
 *   summary JSON on stdout (jobs · fps_capture tell you whether more tabs would help).
 *
 * Contract failures the renderer stops on (exit 1): the page doesn't expose the seek API, a
 * page script threw (the exception is printed), an animation lives outside a reveal group (it
 * would keep running on the wall clock — non-deterministic), an infinite animation, an empty
 * group (a clip with no motion under a spoken sentence), fewer groups than narration segments,
 * an image or video that would not load (wrong path, or a codec this Chrome has no decoder for),
 * a capture whose size isn't the canvas, Chrome exiting mid-render, a CDP call over 30s.
 *
 * Determinism check: the same (g, t) draws the same picture, but byte-identity across renders is
 *   NOT guaranteed — Chrome's compositor leaves sub-pixel antialiasing differences on some runs
 *   even with Animation.ready awaited, and it predates this renderer. Four consecutive renders
 *   coming out byte-identical and the fifth differing is a measured outcome, so a two-run
 *   `diff -rq` gives false passes and false failures alike. Render six to eight times
 *   (--png-only --keep-frames) and count how many classes the output falls into.
 * Measured on Chrome 152 / M4: ~20 fps capture at 1080×1920 on a plate slide. A footage slide
 *   captures at 6–7 fps per tab (photographic PNGs) and 10–11 fps on three tabs — ep209 s10's
 *   459 frames in 47 s against 197 s before (full mp4 render, bench.tsv in docs/research/2026-09-04-render-perf). The mp4 encode of a finished group runs while the
 *   next group is still being captured (one encode at a time), so it no longer adds to the wall clock.
 *
 * What a page can move (template head · scenes-schema §motion slides): CSS @keyframes,
 *   data-count count-ups, a painter registered with __paint(rg, durMs, fn) that draws the
 *   frame at t (canvas/SVG — the path for rotation, traces, anything keyframes can't express),
 *   and <video data-rg data-vfrom data-vdur> seeked by currentTime. All four are functions of
 *   (g, t) alone, which is what makes a re-render draw the same picture.
 *   A footage slide (scenes.js visual.slide.treatment:"footage", slide-design.md §6.2) is that
 *   fourth path as the ground: one generated clip per group under drawn marks. The renderer
 *   reads the treatment from scenes.js, sets each clip's data-vdur to its segment length (never
 *   past what the file holds — a seek beyond the end shows the last frame), and drops the
 *   zone-fill and 2.6s-entrance warnings, which describe a plate composition, not a shot. WebGL works too — Chrome
 *   runs it on SwiftShader here, so those pixels are reproducible on the same machine rather
 *   than across machines. Video has to be H.264 or VP9; HEVC won't decode under --disable-gpu.
 *
 * Chrome: $CHROME, else the first of the macOS/Linux candidates that exists. Use real Chrome
 *   when a slide has <video> — bare Chromium ships without the H.264 decoder. Readiness: the
 *   page's __ready() awaits document.fonts.ready, every image's decode(), and each video's
 *   first frame before the first seek.
 * Exit 0 ok · 1 render/contract failure · 2 usage.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const { FORMATS, DEFAULT_FORMAT } = require(path.join(HERE, "../../platform-guide/references/formats.js"));

const USAGE = "usage: render-motion-slide.mjs <slides/sN-slug.html> --out <dir> [--fps 30] [--jobs 4] [--sheet] [--png-only] [--group k] [--frame k:ms] [--keep-frames] [--segs auto|k:ms,...] [--grain 0..30]";
const usage = msg => { console.error("✗ " + msg + "\n" + USAGE); process.exit(2); };
const CDP_TIMEOUT_MS = 30000;

// ── args ──────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
// jobs = tabs capturing at once. Capture is mostly PNG encoding, so each takes a core — stop at
// half the cores and never above 4; past that only Chrome's memory grows, not throughput.
const opt = { fps: 30, jobs: Math.max(1, Math.min(4, Math.floor((os.cpus().length || 4) / 2))),
  sheet: false, pngOnly: false, group: null, frame: null, keep: false, out: null, segs: null, grain: 6 };
const pos = [];
const intArg = (v, name, lo, hi) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < lo || n > hi) usage(`--${name} wants an integer ${lo}..${hi}, got "${v}"`);
  return n;
};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--out") opt.out = argv[++i];
  else if (a === "--fps") opt.fps = intArg(argv[++i], "fps", 1, 120);
  else if (a === "--jobs") opt.jobs = intArg(argv[++i], "jobs", 1, 16);
  else if (a === "--sheet") opt.sheet = true;
  else if (a === "--png-only") opt.pngOnly = true;
  else if (a === "--keep-frames") opt.keep = true;
  else if (a === "--grain") opt.grain = intArg(argv[++i], "grain", 0, 30);
  else if (a === "--group") opt.group = intArg(argv[++i], "group", 1, 999);
  else if (a === "--segs") {
    opt.segs = argv[++i];
    if (!opt.segs) usage('--segs wants "auto" or k:ms[,k:ms...]');
  }
  else if (a === "--frame") {
    const m = String(argv[++i] || "").match(/^(\d+):(\d+(?:\.\d+)?)$/);
    if (!m) usage(`--frame wants k:ms (e.g. 2:800), got "${argv[i]}"`);
    opt.frame = { g: parseInt(m[1], 10), t: parseFloat(m[2]) };
  }
  else if (a.startsWith("--")) usage("unknown option " + a);
  else pos.push(a);
}
const HTML = pos[0];
if (!HTML || !opt.out) usage("a slide file and --out are required");
const htmlAbs = path.resolve(HTML);
if (!fs.existsSync(htmlAbs)) usage("slide not found: " + htmlAbs);
const OUT = path.resolve(opt.out);
fs.mkdirSync(OUT, { recursive: true });

// ── format → canvas (scenes.js next to slides/ decides, like the page itself) ─
const scenesPath = path.join(path.dirname(htmlAbs), "..", "scenes.js");
global.window = {};
try { require(scenesPath); } catch (e) { console.error("✗ cannot read " + scenesPath + " — " + e.message); process.exit(1); }
const FORMAT = global.window.FORMAT || DEFAULT_FORMAT;
const preset = FORMATS[FORMAT];
if (!preset) { console.error("✗ unknown window.FORMAT " + FORMAT); process.exit(1); }
const { w: W, h: H } = preset.canvas;
const shotNo = parseInt((path.basename(htmlAbs).match(/^s(\d+)-/) || [])[1] || "0", 10);
const scene = (global.window.SCENES || [])[shotNo - 1];
const segCount = scene && Array.isArray(scene.narration) ? scene.narration.length : null;
const semanticBeats = scene && scene.visual && scene.visual.slide && Array.isArray(scene.visual.slide.motionBeats)
  ? scene.visual.slide.motionBeats.filter(b => b && Number.isInteger(Number(b.group)) && b.primitive)
  : [];
// treatment:"footage" — generated clips are the ground (slide-design.md §6.2). The renderer learns it
// from scenes.js so the SEEK-RUNTIME block stays byte-identical across the three templates.
const treatment = scene && scene.visual && scene.visual.slide ? String(scene.visual.slide.treatment || "") : "";
const isFootage = treatment === "footage";
// Footage clips play for their whole segment — the video ground's sustain layer. data-vdur becomes the
// segment length (--segs) or stays as authored, and never exceeds what the file holds: __groups() would
// otherwise report a clip length the pixels do not deliver. Returns the clips that came up short.
const footageVdurJS = mapJson => `(() => {
  const map = ${mapJson};
  const out = [];
  for (const v of document.querySelectorAll("video.footage[data-rg], video.matte[data-rg]")) {
    const rg = +v.dataset.rg, from = +v.dataset.vfrom || 0;
    const media = isFinite(v.duration) && v.duration > 0 ? Math.floor(v.duration * 1000) - from : Infinity;
    const want = map[rg] > 0 ? map[rg] : (+v.dataset.vdur || 0);
    const dur = Math.max(1, Math.min(want, media));
    if (dur < want) out.push({ rg, want, media, cls: v.className, src: v.getAttribute("src") });
    v.dataset.vdur = String(dur);
  }
  return out;
})()`;
// A seeked <video> has decoded its frame, but the compositor may keep showing the previous one.
// Measured across some forty renders of ep209 s10 (2026-09-04): the first seek after a clip
// becomes visible sometimes left frame 0 on screen while currentTime already said frame 1, and
// the picture stayed that way through any wait (0 · 26 · 60 · 120 ms) and through repeated
// captures — in the old renderer too, whose 120 ms ceiling was paid on every frame and still
// left group 1's f0001 stuck one run in four. Every later seek of the same clip came out right
// with no wait at all (457 of 459 frames identical across settles). So there is no per-frame
// settle any more; the stuck case is handled where it happens, in shotStable on a group's first
// two frames, with the kick below between the captures.
// The kick. Registering requestVideoFrameCallback on the clips is what makes a seeked frame
// reach the compositor here; the callback itself never fires in headless (0 of 461 measured),
// but a frame that stayed stuck on the previous seek was replaced after the registration and
// a short wait (2 of 2), and never by the wait alone (0 of 2, ep209 s10, 2026-09-04).
const KICK_JS = (ms) => `new Promise(r => { for (const v of document.querySelectorAll("video[data-rg]")) if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(() => {}); setTimeout(() => r(true), ${ms}); })`;

// ── --segs: narration segment lengths → the page's sustain layer (__setSegs) ─
// "auto" estimates each segment from its narration characters at the format's speaking
// rate (formats.js pacing.rate, the same number scenes-schema §per-scene fields quotes) —
// the storyboard design gate runs before any TTS exists. produce passes measured ms once
// the wav is cut. The two paths treat the band differently on purpose: an estimate may be
// clamped into it, a measurement may not. Silently raising a measured 900ms window to 1200
// would let the motion run past the cut, and the coverage check below would compare against
// the raised number and see nothing wrong — so the measured path keeps the value it was
// given and says when it sits outside the band.
const SEG_MIN_MS = 1200, SEG_MAX_MS = 9000;
let segWarn = [];
let segMap = null;
if (opt.segs === "auto") {
  if (!scene || !Array.isArray(scene.narration) || !scene.narration.length)
    usage(`--segs auto needs narration segments in scenes.js shot ${shotNo}`);
  segMap = {};
  scene.narration.forEach((n, i) => {
    const chars = String((n && (n.tts || n.sub)) || "").trim().length;
    segMap[i + 1] = Math.min(SEG_MAX_MS, Math.max(SEG_MIN_MS, Math.round(chars / preset.pacing.rate * 1000)));
  });
} else if (opt.segs) {
  segMap = {};
  for (const part of opt.segs.split(",")) {
    const m = part.match(/^(\d+):(\d+)$/);
    if (!m) usage(`--segs wants "auto" or k:ms[,k:ms...], got "${opt.segs}"`);
    const ms = +m[2];
    // Past the ceiling is a typo, not a segment — no narration segment in this lane runs that
    // long, and a clip built to it would render for minutes. Refuse loudly rather than clamp.
    if (ms > SEG_MAX_MS)
      usage(`--segs group ${m[1]} is ${ms}ms — over the ${SEG_MAX_MS}ms a narration segment runs. Seconds in the ms slot?`);
    if (ms < SEG_MIN_MS)
      segWarn.push(`--segs group ${m[1]} is ${ms}ms — under ${SEG_MIN_MS}ms a sustain reads as a flicker. Rendering it as given; check the boundary you measured`);
    segMap[+m[1]] = ms;
  }
}

// ── CDP over --remote-debugging-pipe ──────────────────────────────────────
// $CHROME wins. Otherwise walk the usual macOS/Linux spots in order — real Chrome first, because
// bare Chromium ships without the H.264 decoder and a slide with <video> renders black frames.
const CHROME_CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
  "/opt/google/chrome/chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/snap/bin/chromium",
];
const CHROME = process.env.CHROME || CHROME_CANDIDATES.find(p => fs.existsSync(p));
if (!CHROME || !fs.existsSync(CHROME)) {
  console.error("✗ Chrome not found" + (process.env.CHROME ? " at " + process.env.CHROME : "") +
    " — set CHROME= to the binary. Looked at:\n  " + CHROME_CANDIDATES.join("\n  "));
  process.exit(1);
}
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "sf-motion-"));
const chrome = spawn(CHROME, [
  // --disable-gpu is what pins canvas-2D pixels across machines, so it stays. It also leaves WebGL
  // without a context (getContext returns null), hence SwiftShader — a WebGL slide reproduces
  // inside that software backend.
  "--headless=new", "--disable-gpu", "--enable-unsafe-swiftshader", "--hide-scrollbars", "--remote-debugging-pipe",
  "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--mute-audio",
  "--allow-file-access-from-files", "--window-size=" + W + "," + H,
  "--user-data-dir=" + profile, "about:blank",
], { stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"] });
const toChrome = chrome.stdio[3], fromChrome = chrome.stdio[4];
toChrome.on("error", () => {}); fromChrome.on("error", () => {});   // EPIPE after Chrome died is reported by the exit handler, not as a third ✗ line
let stderrTail = "";
chrome.stderr.on("data", d => { stderrTail = (stderrTail + d).slice(-2000); });

const pending = new Map();           // id → { res, rej, timer }
const waiters = [];                  // one-shot event waiters
const pageErrors = [];               // Runtime.exceptionThrown descriptions — printed on failure
const captureWobble = [];            // frames whose repeated captures never agreed (shotStable)
let nextId = 1, closing = false;
let buf = Buffer.alloc(0);           // NUL-delimited JSON; decode only whole messages (UTF-8 safe)
fromChrome.on("data", chunk => {
  buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
  let i;
  while ((i = buf.indexOf(0)) >= 0) {
    const raw = buf.subarray(0, i).toString("utf8"); buf = buf.subarray(i + 1);
    let msg; try { msg = JSON.parse(raw); } catch { continue; }
    if (msg.id && pending.has(msg.id)) {
      const { res, rej, timer } = pending.get(msg.id); pending.delete(msg.id); clearTimeout(timer);
      msg.error ? rej(new Error(msg.error.message + (msg.error.data ? " — " + msg.error.data : ""))) : res(msg.result);
    } else if (msg.method === "Runtime.exceptionThrown") {
      const d = msg.params && msg.params.exceptionDetails;
      pageErrors.push((d && d.exception && d.exception.description) || (d && d.text) || "unknown page error");
    } else if (msg.method) {
      for (let k = waiters.length - 1; k >= 0; k--) {
        const wt = waiters[k];
        if (wt.method === msg.method && (!wt.sessionId || wt.sessionId === msg.sessionId)) { waiters.splice(k, 1); wt.res(msg.params); }
      }
    }
  }
});
const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
  if (closing) return rej(new Error("chrome is shutting down"));
  const id = nextId++;
  const timer = setTimeout(() => { pending.delete(id); rej(new Error(`${method} timed out after ${CDP_TIMEOUT_MS / 1000}s`)); }, CDP_TIMEOUT_MS);
  pending.set(id, { res, rej, timer });
  toChrome.write(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }) + "\0");
});
const waitEvent = (method, sessionId) => new Promise((res, rej) => {   // same timeout as a call — a hung <img src="https://…"> must not hang the renderer
  const wt = { method, sessionId, res };
  waiters.push(wt);
  setTimeout(() => { const i = waiters.indexOf(wt); if (i >= 0) { waiters.splice(i, 1); rej(new Error(`${method} did not arrive within ${CDP_TIMEOUT_MS / 1000}s — a slide resource that never loads?`)); } }, CDP_TIMEOUT_MS);
});
const shutdown = code => {
  if (closing) return; closing = true;
  for (const { rej, timer } of pending.values()) { clearTimeout(timer); rej(new Error("shutting down")); }
  pending.clear();
  try { toChrome.write(JSON.stringify({ id: nextId++, method: "Browser.close" }) + "\0"); } catch {}
  setTimeout(() => { try { chrome.kill("SIGKILL"); } catch {} fs.rmSync(profile, { recursive: true, force: true }); process.exit(code); }, 300);
};
const die = msg => {
  if (closing) return;                    // one ✗ line per failure — rejections from shutdown() itself are not a second failure
  const extra = [];
  if (pageErrors.length) extra.push("page: " + pageErrors.slice(0, 3).join(" | "));
  if (stderrTail.trim()) extra.push("chrome: " + stderrTail.trim().split("\n").slice(-3).join(" | "));
  console.error("✗ " + msg + (extra.length ? "\n  " + extra.join("\n  ") : ""));
  shutdown(1);
};
chrome.on("exit", (code, sig) => {          // Chrome dying mid-render must not read as success
  if (closing) return;
  for (const { rej, timer } of pending.values()) { clearTimeout(timer); rej(new Error("chrome exited " + (code ?? sig))); }
  pending.clear();
  die("chrome exited early (" + (code ?? sig) + ")");
});
process.on("SIGINT", () => shutdown(130));
process.on("SIGTERM", () => shutdown(143));
process.on("uncaughtException", e => die(e.message));
process.on("unhandledRejection", e => die(e && e.message ? e.message : String(e)));

const pngSize = b => ({ w: b.readUInt32BE(16), h: b.readUInt32BE(20) });

// Open one tab on the slide and hand back the evalJS/seek/shot bound to it. Parallel capture is
// just opening several — a frame is a function of (g, t), so which tab took it changes nothing.
const openPage = async () => {
  // Each tab gets its own window. A second tab in the same window is a background tab, and a
  // background tab is throttled — with a requestAnimationFrame-based wait in the loop, --jobs 3
  // died on "Runtime.evaluate timed out after 30s" (ep209 s10, 2026-09-04). A window of its own
  // is a visible tab; three of them captured 459 frames in 44 s with identical output.
  const { targetId } = await send("Target.createTarget", { url: "about:blank", newWindow: true });
  const { sessionId: sid } = await send("Target.attachToTarget", { targetId, flatten: true });
  await send("Page.enable", {}, sid);
  await send("Runtime.enable", {}, sid);
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false }, sid);
  const loaded = waitEvent("Page.loadEventFired", sid);
  await send("Page.navigate", { url: pathToFileURL(htmlAbs).href }, sid);
  await loaded;
  const evalJS = async (expression, awaitPromise = false) => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise }, sid);
    if (r.exceptionDetails) throw new Error("page error: " + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text));
    return r.result.value;
  };
  await evalJS("document.fonts.ready.then(() => true)", true);
  // __seek resolves once every animation's pause/currentTime is applied (Animation.ready) and
  // every seeking video has fired 'seeked' — compositor-thread animations otherwise drift a
  // sub-pixel between identical seeks, and a video would still show the previous frame.
  const seek = async (t, g) => {
    await evalJS(`window.__seek(${t}, ${g})`, true);
    return true;
  };
  const shot = async (file) => {
    // optimizeForSpeed picks a faster zlib level — the same pixels in a larger PNG (233 → 72 ms per
    // photographic frame). shotStable compares bytes within one run, so the level does not matter to it.
    const { data } = await send("Page.captureScreenshot", { format: "png", fromSurface: true, optimizeForSpeed: true }, sid);
    const b = Buffer.from(data, "base64");
    const s = pngSize(b);
    if (s.w !== W || s.h !== H) throw new Error(`capture ${s.w}x${s.h} ≠ ${W}x${H} — DPR or window clamp (see capture-frames.sh)`);
    fs.writeFileSync(file, b);
    return b;
  };
  // A fresh tab's first capture can land while the compositor is still rastering the first frame —
  // seen once as a clip-3 f0000 with a flat ground, no spine and a single 256px tile painted
  // (2026-09-02). A frame is a function of (g, t), so two consecutive captures that differ mean the
  // raster was not finished; capture again until two agree.
  // On a footage slide the first seek after a clip becomes visible can leave the previous frame on
  // screen — 'seeked' has fired, currentTime is right, the compositor still shows the old picture,
  // and it stays that way through any number of captures (measured across 40 renders of ep209
  // s10: f0001 of a group came out as the group's frame 0 or frame 1 by chance, in the old renderer
  // too). The kick between two captures replaces the stuck frame, so two captures agreeing after a
  // kick means the picture is the settled one. Applied to the first two frames of every group.
  const shotStable = async (file) => {
    let prev = await shot(file);
    for (let i = 0; i < 6; i++) {
      if (isFootage) await evalJS(KICK_JS(60), true);
      const next = await shot(file);
      if (next.equals(prev)) return next;
      prev = next;
    }
    // A page whose sub-pixel antialiasing wobbles between identical seeks never gives two
    // equal captures (the template head measures that wobble at 55–72 dB PSNR — invisible).
    // Keep the last frame and say so rather than failing a render over it.
    captureWobble.push(path.basename(file));
    return prev;
  };
  return { sid, evalJS, seek, shot, shotStable };
};

(async () => {
  const page = await openPage();
  const { evalJS, seek, shot, shotStable } = page;
  const api = await evalJS("typeof window.__seek === 'function' && typeof window.__groups === 'function' && typeof window.__size === 'function' && typeof window.__meta === 'function' && typeof window.__ready === 'function'");
  if (!api) return die("the page does not expose __seek/__groups/__size/__meta/__ready — built from motion-slide-template.html?" + (pageErrors.length ? " A page script threw before the API was defined:" : ""));
  // First seek only after fonts, image decodes and video first frames are all settled. Load alone
  // is not enough for an image — capture before decode finishes and the first frame comes out blank.
  await evalJS("window.__ready()", true);
  const size = await evalJS("window.__size()");
  if (size.w !== W || size.h !== H) return die(`page size ${size.w}x${size.h} ≠ format canvas ${W}x${H} (window.FORMAT=${FORMAT})`);
  const meta = await evalJS("window.__meta()");           // { hold, stray, infinite }
  if (meta.broken && meta.broken.length)
    return die(`could not load: ${meta.broken.join(", ")} — a slide's images and video are local files next to it. ` +
               `Check the path, and use H.264 or VP9 for video (HEVC does not decode under --disable-gpu)`);
  if (meta.stray > 0) return die(`${meta.stray} animation(s) live outside any [data-rg] group — they would run on the wall clock and break determinism. Put every animated element in a reveal group`);
  if (meta.infinite > 0) return die(`${meta.infinite} animation(s) are infinite (iteration-count) — a clip has to end; give them a count`);
  if (semanticBeats.length) {
    const rendered = await evalJS(`Array.from(document.querySelectorAll("[data-primitive]")).map(el => {
      const group = el.closest("[data-rg]");
      return { group: group ? Number(group.dataset.rg) : null, primitive: el.dataset.primitive || "" };
    })`);
    const expected = new Set(semanticBeats.map(b => `${Number(b.group)}\t${b.primitive}`));
    const actual = new Set(rendered.map(b => `${Number(b.group)}\t${b.primitive}`));
    for (const key of expected) if (!actual.has(key)) {
      const [group, primitive] = key.split("\t");
      return die(`motionBeats declares group ${group} primitive "${primitive}", but the rendered HTML has no matching data-primitive — use the semantic helper named in motion-slide-template.html`);
    }
    for (const key of actual) if (!expected.has(key)) {
      const [group, primitive] = key.split("\t");
      return die(`rendered HTML adds undeclared group ${group} primitive "${primitive}" — motionBeats permits one meaning-bearing movement kind per narration group`);
    }
  }
  const warn = segWarn.slice();
  // Sustain layer — hand the page its segment lengths before reading group durations, so
  // .sv elements stretch to them and __groups() reports the stretched clips. --segs keys
  // are GROUPS: on an A|B sub-reveal slide (more groups than segments) group k is no
  // longer segment k, so auto mode steps aside — produce splits the measured window at
  // the reveal point and passes per-group values instead.
  let segsApplied = false;
  if (segMap) {
    const nPre = (await evalJS("window.__groups()")).length - 1;
    if (opt.segs === "auto" && segCount != null && nPre !== segCount) {
      warn.push(`--segs auto skipped: ${nPre} reveal groups vs ${segCount} narration segments (A|B sub-reveals shift the group↔segment mapping) — pass per-group --segs k:ms, splitting the segment's measured window at the reveal point`);
    } else {
      segsApplied = await evalJS(`typeof window.__setSegs === "function" ? (window.__setSegs(${JSON.stringify(segMap)}), true) : false`);
      if (!segsApplied) {
        warn.push(`--segs given but the page has no __setSegs — a slide built from an older template; token durations stay and the tail of each segment freezes`);
      } else {
        // A key that names no group changes nothing, and the coverage check below reads an
        // unfilled group through the entrance cap, which a 1.5s entrance never trips — so the
        // mismatch has to be said here or it is said nowhere.
        const stray = Object.keys(segMap).map(Number).filter(k => k < 1 || k > nPre);
        if (stray.length)
          warn.push(`--segs names group ${stray.join(", ")} but the slide has ${nPre} — ${stray.length > 1 ? "those keys change" : "that key changes"} nothing. --segs keys are groups, not narration segments`);
        const unset = [];
        for (let k = 1; k <= nPre; k++) if (segMap[k] == null) unset.push(k);
        if (unset.length)
          warn.push(`--segs leaves group ${unset.join(", ")} without a segment length — ${unset.length > 1 ? "they keep their" : "it keeps its"} token durations while the rest stretch`);
      }
    }
  }
  // A settle sustain without --segs holds its own fallback length, and downstream that shows up
  // as a bare "over the cap" warning that names the symptom instead of the cause.
  if (!segsApplied) {
    const svw = await evalJS('document.querySelectorAll(".svw").length');
    if (svw)
      warn.push(`${svw} settle sustain element${svw > 1 ? "s" : ""} rendered with no segment length — each holds its fallback duration, so the group runs long and the sheet frames land mid-settle. Pass --segs (produce optional-lanes §3.6)`);
  }
  if (isFootage) {
    const short = await evalJS(footageVdurJS(JSON.stringify(segMap && segsApplied ? segMap : {})));
    for (const c of short)
      warn.push(`group ${c.rg} ${c.cls} ${c.src} holds ${(c.media / 1000).toFixed(1)}s but its segment runs ` +
                `${(c.want / 1000).toFixed(1)}s — the last ${((c.want - c.media) / 1000).toFixed(1)}s freeze on the clip's ` +
                `final frame; generate the clip longer (footage-lane.md §shot length)`);
  }
  const groups = await evalJS("window.__groups()");
  const N = groups.length - 1;
  if (N < 1) return die("no reveal groups — every moving element needs data-rg ≥ 1");
  for (let k = 1; k <= N; k++)
    if (groups[k].dur <= meta.hold) return die(`group ${k} has no motion (only the ${meta.hold}ms hold) — a spoken segment would get a still clip. Either move something in group ${k} or renumber the groups`);
  if (segCount != null && N < segCount) return die(`${N} reveal groups but ${segCount} narration segments in scenes.js shot ${shotNo} — segment ${N + 1} would have no clip. Add groups (segment k → group k)`);
  // Entrance cap = 2.6s of motion + the template's hold tail (slide-design.md §motion) — a narration
  // segment shorter than the clip cuts to the next clip's rest frame mid-motion, and that jump is
  // visible. With --segs the cap moves to the segment itself, and the opposite defect gets teeth:
  // a clip much shorter than its segment leaves a frozen tail on screen (the sustain layer's job).
  for (const g of groups.slice(1)) {
    const seg = segMap && segsApplied ? segMap[g.rg] : null;
    if (seg) {
      if (g.dur > seg + meta.hold + 400)
        warn.push(`group ${g.rg} clip is ${g.dur}ms — over its ${seg}ms segment; the cut to the next clip lands mid-motion`);
      else if (seg - g.dur > seg * 0.4)
        warn.push(`group ${g.rg} moves ${(g.dur / 1000).toFixed(1)}s of its ${(seg / 1000).toFixed(1)}s segment — the tail freezes ${((seg - g.dur) / 1000).toFixed(1)}s; mark a .sv sustain element (slide-design.md §5) or accept the freeze`);
    } else if (!isFootage && g.dur > 2600 + meta.hold) {
      warn.push(`group ${g.rg} clip is ${g.dur}ms — over the cap (2.6s motion + ${meta.hold}ms hold, slide-design.md §motion); a shorter segment cuts it mid-motion`);
    }
  }
  if (segCount != null && N > segCount) warn.push(`${N} reveal groups vs ${segCount} narration segments — fine only if produce §3.6 writes A|B sub-reveals for the extra clips`);
  if (opt.group != null && opt.group > N) return die(`--group ${opt.group} but the slide has ${N} groups`);
  if (opt.frame && opt.frame.g > N) return die(`--frame group ${opt.frame.g} but the slide has ${N} groups`);

  // Async so an encode overlaps the capture of the next group — spawnSync would block the event
  // loop and every tab with it. One encode at a time: x264 already takes every core it is given.
  const ffmpeg = (args) => new Promise((res, rej) => {
    const r = spawn("ffmpeg", ["-y", "-v", "error", ...args], { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    r.stderr.on("data", d => { err += d; });
    r.on("error", e => rej(new Error("ffmpeg failed: " + e.message)));
    r.on("exit", code => code === 0 ? res() : rej(new Error("ffmpeg failed: " + err.trim())));
  });

  const t0 = Date.now();
  let framesTotal = 0;
  const manifest = [];

  if (opt.frame) {                       // one frame — debugging
    const { g, t } = opt.frame;
    await seek(t, g);
    const f = path.join(OUT, `g${g}-t${t}.png`);
    await shotStable(f);
    console.log(JSON.stringify({ frame: `${g}:${t}`, file: f }));
    return shutdown(0);
  }

  await seek(0, 1);                      // base state = clip 1's first frame
  await shotStable(path.join(OUT, "r0.png"));

  const todo = opt.group != null ? [opt.group] : Array.from({ length: N }, (_, i) => i + 1);
  // Capture is split per group across tabs. A tab mostly idles while one screenshot encodes (PNG
  // encoding is where the time goes), and groups never touch each other's state.
  const jobs = Math.max(1, Math.min(opt.jobs, todo.length));
  const workers = [page];
  for (let i = 1; i < jobs; i++) workers.push(await openPage());
  // Every worker needs the same page state the first tab got: fonts and decodes settled, and
  // the segment lengths. Without the second call a group captured by tab 2..4 falls back to the
  // token durations and its .sv sustain silently does not apply — measured 2026-09-02 as a
  // count that landed at 52% of its sentence while group 1, captured by the first tab, was right.
  for (const w of workers.slice(1)) {
    await w.evalJS("window.__ready()", true);
    if (segsApplied) await w.evalJS(`window.__setSegs(${JSON.stringify(segMap)})`);
    if (isFootage) await w.evalJS(footageVdurJS(JSON.stringify(segMap && segsApplied ? segMap : {})));
  }
  const rows = new Array(todo.length);
  // Group k's frames become r<k>.mp4 as soon as its capture ends, while other tabs keep capturing.
  // A chain rather than Promise.all keeps it to one encode at a time.
  const encodeGroup = async (r) => {
    const mp4 = path.join(OUT, `r${r.k}.mp4`);
    // Grain after the yuv420p conversion so it lands on luma only (c0) — chroma stays clean, the
    // way film grain does. Static (no temporal flag): temporal grain at crf 14 cost 12.6 MB for a
    // one-second clip against 0.76 MB static and 0.09 MB clean (measured 2026-09-02). Fixed seed
    // keeps the encode reproducible.
    const grain = opt.grain > 0 ? `,noise=c0_seed=7:c0_strength=${opt.grain}:c0_flags=u` : "";
    await ffmpeg(["-framerate", String(opt.fps), "-i", path.join(r.fdir, "f%04d.png"),
                  "-vf", `scale=${W}:${H}:flags=lanczos,setsar=1,format=yuv420p${grain}`, "-r", String(opt.fps),
                  "-c:v", "libx264", "-preset", "medium", "-crf", "14", "-x264-params", "aq-mode=3", "-an", mp4]);
    if (!opt.keep) fs.rmSync(r.fdir, { recursive: true, force: true });
    r.mp4 = mp4;
  };
  let encodes = Promise.resolve();
  const captureGroup = async (w, idx) => {
    const k = todo[idx];
    const dur = groups[k].dur;
    const nF = Math.max(2, Math.round(dur / 1000 * opt.fps) + 1);
    const fdir = path.join(OUT, `frames-r${k}`);
    fs.rmSync(fdir, { recursive: true, force: true }); fs.mkdirSync(fdir, { recursive: true });
    for (let i = 0; i < nF; i++) {
      await w.seek(Math.min(i * 1000 / opt.fps, dur), k);
      await (i <= 1 ? w.shotStable : w.shot)(path.join(fdir, `f${String(i).padStart(4, "0")}.png`));
    }
    framesTotal += nF;
    rows[idx] = { k, nF, dur, fdir };
    if (!opt.pngOnly) {
      encodes = encodes.then(() => encodeGroup(rows[idx]));
      // A failed encode is reported by the await below; this handler only keeps Node from treating
      // the chain's tail as an unhandled rejection in the meantime.
      encodes.catch(() => {});
    }
  };
  // Each worker takes the next group in order — splitting up front would leave one idle, since
  // group lengths differ.
  let next = 0;
  await Promise.all(workers.map(async w => {
    for (let idx = next++; idx < todo.length; idx = next++) await captureGroup(w, idx);
  }));
  // The last encode may still be running — the manifest is written in group order once it is done.
  await encodes;
  for (const r of rows) manifest.push([r.k, r.nF, r.dur, opt.pngOnly ? r.fdir : r.mp4].join("\t"));
  if (opt.sheet) {                       // review frames — the slide-reviewer reads these
    const sdir = path.join(OUT, "sheet"); fs.mkdirSync(sdir, { recursive: true });
    for (let k = 1; k <= N; k++) {
      const dur = groups[k].dur;
      await seek(Math.round(dur / 2), k); await shot(path.join(sdir, `g${k}-mid.png`));
      await seek(dur, k);                await shot(path.join(sdir, `g${k}-end.png`));
    }
  }
  // Zone fill — measured at the final rest state (clip N's end frame, the frame the video
  // freezes on), against the subtitle-free zone. Painted content only: text rects, replaced
  // elements, and boxes with their own background or border — container divs span the zone
  // by default and would report 100% regardless of what is drawn.
  await seek(groups[N].dur, N);
  // A footage slide has no zone composition to measure — the clip fills the frame and the marks sit
  // where the picture puts them (slide-design.md §6.2), so the number is reported as null.
  const zoneFill = isFootage ? null : await evalJS(`(() => {
    const cs = getComputedStyle(document.documentElement);
    const px = v => parseFloat(cs.getPropertyValue(v)) || 0;
    const W = px("--w"), H = px("--h"), zx = px("--zone-x"), zt = px("--zone-top"), zb = px("--zone-bottom");
    const zw = W - 2 * zx, zh = H - zt - zb;
    const stage = document.getElementById("stage") || document.body;
    let x0 = 1 / 0, y0 = 1 / 0, x1 = -1 / 0, y1 = -1 / 0;
    const add = r => { if (r.width < 2 || r.height < 2) return;
      x0 = Math.min(x0, r.left); y0 = Math.min(y0, r.top);
      x1 = Math.max(x1, r.right); y1 = Math.max(y1, r.bottom); };
    const range = document.createRange();
    const walker = document.createTreeWalker(stage, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.nodeValue.trim()) continue;
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) add(r);
    }
    // A fixed layer is a ground layer, not zone content — h.photo and h.scrim cover the whole
    // canvas, and counting them reported 100%×100% for a frame carrying two captions, which is
    // exactly the composition this measurement exists to catch (measured 2026-09-02).
    const isGround = el => getComputedStyle(el).position === "fixed";
    for (const el of stage.querySelectorAll("img,video,svg,canvas"))
      if (!isGround(el)) add(el.getBoundingClientRect());
    for (const el of stage.querySelectorAll("*")) {
      const s = getComputedStyle(el);
      if (s.visibility === "hidden" || +s.opacity === 0 || s.position === "fixed") continue;
      const painted = (s.backgroundColor !== "rgba(0, 0, 0, 0)" && s.backgroundColor !== "transparent")
        || s.backgroundImage !== "none"
        || ["Top", "Right", "Bottom", "Left"].some(d => parseFloat(s["border" + d + "Width"]) > 0);
      if (painted) add(el.getBoundingClientRect());
    }
    if (x1 < x0) return { w_pct: 0, h_pct: 0 };
    const ix0 = Math.max(x0, zx), iy0 = Math.max(y0, zt);
    const ix1 = Math.min(x1, W - zx), iy1 = Math.min(y1, H - zb);
    return { w_pct: Math.round(Math.max(0, ix1 - ix0) / zw * 100),
             h_pct: Math.round(Math.max(0, iy1 - iy0) / zh * 100) };
  })()`);
  if (zoneFill && (zoneFill.w_pct < 55 || zoneFill.h_pct < 55))
    warn.push(`content fills ${zoneFill.w_pct}%×${zoneFill.h_pct}% of the zone (w×h) — under 55%; scale the composition up or pick an archetype (slide-design.md §4)`);
  // Re-read the contract after capturing. __meta() sampled once up front cannot see an animation
  // that only exists at some mid-group t — a painter that attaches a node outside [data-rg] and
  // removes it again by the rest frame. __seek pins such an animation and counts it, so the
  // count here is the whole render, not one instant.
  // Every worker keeps its own counter, so ask them all — the tab that captured the offending
  // group may not be the one this loop started from.
  const metasAfter = await Promise.all(workers.map(w => w.evalJS("window.__meta()")));
  // meta.stray is necessarily 0 here — a non-zero one already died at the pre-capture check
  // above — so the sum across workers IS the delta. Don't subtract a baseline that isn't there.
  const metaAfter = {
    stray: metasAfter.reduce((n, m) => n + m.stray, 0),
    broken: metasAfter.flatMap(m => m.broken || []),
  };
  if (metaAfter.stray > 0)
    return die(`${metaAfter.stray} frame(s) were captured with an animation running outside a ` +
               `[data-rg] group ` +
               `— a painter attaching nodes outside its group, or a video playing itself. Each was pinned to ` +
               `t=0 so the frames are still reproducible, but nothing moved where the author expected. ` +
               `Put every animated element the painter creates inside its own [data-rg] group.`);
  if (metaAfter.broken && metaAfter.broken.length > (meta.broken || []).length)
    return die(`could not load during capture: ${metaAfter.broken.join(", ")}`);
  if (captureWobble.length)
    warn.push(`${captureWobble.length} frame(s) never gave two identical captures of the same (g, t) — ` +
              `${captureWobble.slice(0, 3).join(", ")}${captureWobble.length > 3 ? ", …" : ""}. The last capture was kept. ` +
              `Sub-pixel antialiasing wobble is invisible; a torn frame is not — open those files before trusting them`);
  fs.writeFileSync(path.join(OUT, "manifest.tsv"), manifest.join("\n") + "\n");
  const sec = (Date.now() - t0) / 1000;
  const summary = { slide: path.basename(htmlAbs), format: FORMAT, canvas: `${W}x${H}`, groups: N, jobs,
    treatment: treatment || null,
    segments: segCount, durations_ms: groups.slice(1).map(g => g.dur),
    segs_ms: segMap && segsApplied ? Array.from({ length: N }, (_, i) => segMap[i + 1] || null) : null,
    zone_fill_pct: zoneFill, grain: opt.pngOnly ? null : opt.grain, frames: framesTotal,
    seconds: +sec.toFixed(2), fps_capture: +(framesTotal / sec).toFixed(1), out: OUT, warnings: warn };
  // slide-reviewer reads zone_fill_pct and the coverage warnings from this file — stdout
  // alone never reaches the delegation (slide-authoring step 4 hands the file over).
  fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify(summary, null, 1) + "\n");
  console.log(JSON.stringify(summary));
  for (const w of warn) console.error("⚠ " + w);
  shutdown(0);
})().catch(e => die(e.message));
