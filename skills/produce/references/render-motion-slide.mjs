#!/usr/bin/env node
/**
 * render-motion-slide.mjs — renders a motion slide (scenes-schema §motion slides) into one
 * clip per reveal group, deterministically, with no npm dependency.
 *
 *   node render-motion-slide.mjs <storyboard/slides/sN-slug.html> --out <dir> [--fps 30]
 *        [--sheet] [--png-only] [--group k] [--frame k:ms] [--keep-frames]
 *
 * How it works — the seek model (docs/research/2026-08-29-motion-slide-lane):
 *   Chrome is launched ONCE (headless, --remote-debugging-pipe — CDP over fd 3/4, no puppeteer)
 *   and the page is asked for every frame at an exact time: window.__seek(tMs, g) pauses every
 *   animation and sets its currentTime, so the same (g, t) always yields the same pixels. The
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
 *   summary JSON on stdout.
 *
 * Contract failures the renderer stops on (exit 1): the page doesn't expose the seek API, a
 * page script threw (the exception is printed), an animation lives outside a reveal group (it
 * would keep running on the wall clock — non-deterministic), an infinite animation, an empty
 * group (a clip with no motion under a spoken sentence), fewer groups than narration segments,
 * a capture whose size isn't the canvas, Chrome exiting mid-render, a CDP call over 30s.
 *
 * Determinism check: run twice into two dirs and `diff -rq` the frame PNGs (--keep-frames).
 * Measured on Chrome 152 / M4: ~20 fps capture at 1080×1920, 144/144 frames byte-identical.
 *
 * Chrome: $CHROME or the macOS default path. Fonts: the page waits for document.fonts.ready.
 * Exit 0 ok · 1 render/contract failure · 2 usage.
 */
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const { FORMATS, DEFAULT_FORMAT } = require(path.join(HERE, "../../platform-guide/references/formats.js"));

const USAGE = "usage: render-motion-slide.mjs <slides/sN-slug.html> --out <dir> [--fps 30] [--sheet] [--png-only] [--group k] [--frame k:ms] [--keep-frames]";
const usage = msg => { console.error("✗ " + msg + "\n" + USAGE); process.exit(2); };
const CDP_TIMEOUT_MS = 30000;

// ── args ──────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const opt = { fps: 30, sheet: false, pngOnly: false, group: null, frame: null, keep: false, out: null };
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
  else if (a === "--sheet") opt.sheet = true;
  else if (a === "--png-only") opt.pngOnly = true;
  else if (a === "--keep-frames") opt.keep = true;
  else if (a === "--group") opt.group = intArg(argv[++i], "group", 1, 999);
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

// ── CDP over --remote-debugging-pipe ──────────────────────────────────────
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
if (!fs.existsSync(CHROME)) { console.error("✗ Chrome not found at " + CHROME + " (set CHROME=)"); process.exit(1); }
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "sf-motion-"));
const chrome = spawn(CHROME, [
  "--headless=new", "--disable-gpu", "--hide-scrollbars", "--remote-debugging-pipe",
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

(async () => {
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
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
  const api = await evalJS("typeof window.__seek === 'function' && typeof window.__groups === 'function' && typeof window.__size === 'function' && typeof window.__meta === 'function'");
  if (!api) return die("the page does not expose __seek/__groups/__size/__meta — built from motion-slide-template.html?" + (pageErrors.length ? " A page script threw before the API was defined:" : ""));
  const size = await evalJS("window.__size()");
  if (size.w !== W || size.h !== H) return die(`page size ${size.w}x${size.h} ≠ format canvas ${W}x${H} (window.FORMAT=${FORMAT})`);
  const meta = await evalJS("window.__meta()");           // { hold, stray, infinite }
  if (meta.stray > 0) return die(`${meta.stray} animation(s) live outside any [data-rg] group — they would run on the wall clock and break determinism. Put every animated element in a reveal group`);
  if (meta.infinite > 0) return die(`${meta.infinite} animation(s) are infinite (iteration-count) — a clip has to end; give them a count`);
  const groups = await evalJS("window.__groups()");
  const N = groups.length - 1;
  if (N < 1) return die("no reveal groups — every moving element needs data-rg ≥ 1");
  for (let k = 1; k <= N; k++)
    if (groups[k].dur <= meta.hold) return die(`group ${k} has no motion (only the ${meta.hold}ms hold) — a spoken segment would get a still clip. Either move something in group ${k} or renumber the groups`);
  if (segCount != null && N < segCount) return die(`${N} reveal groups but ${segCount} narration segments in scenes.js shot ${shotNo} — segment ${N + 1} would have no clip. Add groups (segment k → group k)`);
  const warn = [];
  // cap = 2.6s of motion + the template's hold tail (slide-design.md §motion) — a narration segment
  // shorter than the clip cuts to the next clip's rest frame mid-motion, and that jump is visible.
  for (const g of groups) if (g.dur > 2600 + meta.hold) warn.push(`group ${g.rg} clip is ${g.dur}ms — over the cap (2.6s motion + ${meta.hold}ms hold, slide-design.md §motion); a shorter segment cuts it mid-motion`);
  if (segCount != null && N > segCount) warn.push(`${N} reveal groups vs ${segCount} narration segments — fine only if produce §3.6 writes A|B sub-reveals for the extra clips`);
  if (opt.group != null && opt.group > N) return die(`--group ${opt.group} but the slide has ${N} groups`);
  if (opt.frame && opt.frame.g > N) return die(`--frame group ${opt.frame.g} but the slide has ${N} groups`);

  const shot = async (file) => {
    const { data } = await send("Page.captureScreenshot", { format: "png", fromSurface: true }, sid);
    const b = Buffer.from(data, "base64");
    const s = pngSize(b);
    if (s.w !== W || s.h !== H) throw new Error(`capture ${s.w}x${s.h} ≠ ${W}x${H} — DPR or window clamp (see capture-frames.sh)`);
    fs.writeFileSync(file, b);
    return b;
  };
  // __seek resolves once every animation's pause/currentTime is applied (Animation.ready) —
  // compositor-thread animations otherwise drift a sub-pixel between identical seeks.
  const seek = (t, g) => evalJS(`window.__seek(${t}, ${g})`, true);
  const ffmpeg = (args) => {
    const r = spawnSync("ffmpeg", ["-y", "-v", "error", ...args], { encoding: "utf8" });
    if (r.status !== 0) throw new Error("ffmpeg failed: " + (r.stderr || r.error && r.error.message));
  };

  const t0 = Date.now();
  let framesTotal = 0;
  const manifest = [];

  if (opt.frame) {                       // one frame — debugging
    const { g, t } = opt.frame;
    await seek(t, g);
    const f = path.join(OUT, `g${g}-t${t}.png`);
    await shot(f);
    console.log(JSON.stringify({ frame: `${g}:${t}`, file: f }));
    return shutdown(0);
  }

  await seek(0, 1);                      // base state = clip 1's first frame
  await shot(path.join(OUT, "r0.png"));

  const todo = opt.group != null ? [opt.group] : Array.from({ length: N }, (_, i) => i + 1);
  for (const k of todo) {
    const dur = groups[k].dur;
    const nF = Math.max(2, Math.round(dur / 1000 * opt.fps) + 1);
    const fdir = path.join(OUT, `frames-r${k}`);
    fs.rmSync(fdir, { recursive: true, force: true }); fs.mkdirSync(fdir, { recursive: true });
    for (let i = 0; i < nF; i++) {
      await seek(Math.min(i * 1000 / opt.fps, dur), k);
      await shot(path.join(fdir, `f${String(i).padStart(4, "0")}.png`));
    }
    framesTotal += nF;
    const mp4 = path.join(OUT, `r${k}.mp4`);
    if (!opt.pngOnly) {
      ffmpeg(["-framerate", String(opt.fps), "-i", path.join(fdir, "f%04d.png"),
              "-vf", `scale=${W}:${H}:flags=lanczos,setsar=1,format=yuv420p`, "-r", String(opt.fps),
              "-c:v", "libx264", "-preset", "medium", "-crf", "14", "-x264-params", "aq-mode=3", "-an", mp4]);
      if (!opt.keep) fs.rmSync(fdir, { recursive: true, force: true });
    }
    manifest.push([k, nF, dur, opt.pngOnly ? fdir : mp4].join("\t"));
  }
  if (opt.sheet) {                       // review frames — the slide-reviewer reads these
    const sdir = path.join(OUT, "sheet"); fs.mkdirSync(sdir, { recursive: true });
    for (let k = 1; k <= N; k++) {
      const dur = groups[k].dur;
      await seek(Math.round(dur / 2), k); await shot(path.join(sdir, `g${k}-mid.png`));
      await seek(dur, k);                await shot(path.join(sdir, `g${k}-end.png`));
    }
  }
  fs.writeFileSync(path.join(OUT, "manifest.tsv"), manifest.join("\n") + "\n");
  const sec = (Date.now() - t0) / 1000;
  console.log(JSON.stringify({ slide: path.basename(htmlAbs), format: FORMAT, canvas: `${W}x${H}`, groups: N,
    segments: segCount, durations_ms: groups.slice(1).map(g => g.dur), frames: framesTotal,
    seconds: +sec.toFixed(2), fps_capture: +(framesTotal / sec).toFixed(1), out: OUT, warnings: warn }));
  for (const w of warn) console.error("⚠ " + w);
  shutdown(0);
})().catch(e => die(e.message));
