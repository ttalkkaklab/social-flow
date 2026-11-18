/**
 * episode_cover — the episode's cover and thumbnail (docs/superpowers/specs/2026-11-18-episode-cover-design.md).
 *
 * set    records which moment of the episode the cover shows, its copy and why, in storyboard/cover.json.
 * render makes every platform file from that decision, locally and at $0: ffmpeg crops the source
 *        around its focus point, headless Chrome lays the copy out on cover-template.html, ffmpeg
 *        encodes the JPEGs under each platform's byte limit and cuts the crop previews.
 * read   reports whether the files still match the decision, its source and the template.
 *
 * Findings are warnings; the only refusals are inputs this cannot use (an unknown shot, a path
 * outside the episode, a font that cannot draw the copy, a file no platform would accept).
 */
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync, openSync, readSync, closeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { PLUGIN_ROOT, readBoard, scenesPath, shotIdSchema } from './storyboard.js';
import { readImageState } from './image-state.js';
import { workflowEpisode } from './production-workflow.js';
import { episodeHandoff } from './project.js';
const load = createRequire(import.meta.url);
const COVER_REFS = join(PLUGIN_ROOT, 'skills', 'generate-cover', 'references');
const TEMPLATE_FILE = join(COVER_REFS, 'cover-template.html');
const MOTION_FONT_DIR = join(PLUGIN_ROOT, 'skills', 'storyboard', 'references', 'motion-fonts');
const REVIEW_FONT_DIR = join(PLUGIN_ROOT, 'skills', 'channel', 'references', 'review-assets', 'fonts');
/** Bump when a change here alters the pixels for the same decision, so read reports the old files stale. */
const RENDER_VERSION = 1;
/** Platform byte limits: Instagram cover_url 8MB, Facebook thumbnails 10MB (YouTube takes 50MB). */
const LIMIT = { vertical: 8 * 1024 * 1024, landscape: 10 * 1024 * 1024 };
/** A glyph under this many pixels on a phone tile (vertical 120 px wide, long-form 160×90) is hard to read. */
const TILE_WIDTH = { vertical: 120, landscape: 160 };
const MIN_TILE_FONT_PX = 10;
const FILL = { text: [255, 255, 255], emphasis: [255, 212, 0] };
const focusSchema = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).strict();
const copySchema = z.object({
    text: z.string().trim().min(1).max(80).describe('The cover copy in the episode language, drawn by code (never by an image model)'),
    emphasis: z.string().min(1).optional().describe('One part of text drawn in the accent colour'),
}).strict();
const sourceSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('shot'), shotId: shotIdSchema }).strict(),
    z.object({ kind: z.literal('frame'), video: z.string().min(1), seconds: z.number().min(0), shotId: shotIdSchema.optional() }).strict(),
    z.object({ kind: z.literal('image'), requestId: z.string().min(1) }).strict(),
]);
const variantSchema = z.object({ source: sourceSchema.optional(), focus: focusSchema.optional(), copy: copySchema.nullable().optional() }).strict();
export const coverDecisionSchema = z.object({
    reason: z.string().trim().min(1),
    source: sourceSchema,
    focus: focusSchema.optional(),
    copy: copySchema.nullable().default(null),
    language: z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]+)*$/).optional(),
    variants: z.array(variantSchema).max(2).default([]),
}).strict();
export const episodeCoverSchema = z.object({
    path: z.string().min(1),
    action: z.enum(['set', 'render', 'read']),
    decision: coverDecisionSchema.optional(),
}).strict();
function episodeOf(path) {
    const board = readBoard(path);
    // Real paths throughout, so sources recorded relative to the episode stay inside it (macOS /var is /private/var).
    const storyboard = realpathSync(dirname(scenesPath(path)));
    const format = String(board.win.FORMAT ?? 'shorts-9x16');
    const formats = load(join(PLUGIN_ROOT, 'skills', 'platform-guide', 'references', 'formats.js')).FORMATS;
    const spec = formats[format]?.cover;
    if (!spec)
        throw new Error(`cover_format_unknown: ${format} has no cover block in formats.js`);
    return { board, storyboard, episode: dirname(storyboard), format, spec };
}
const landscape = (spec) => spec.canvases[0].w > spec.canvases[0].h;
/** A path inside the episode, following symlinks; anything outside is refused. */
function inside(episode, file, what) {
    const abs = isAbsolute(file) ? file : resolve(episode, file);
    if (!existsSync(abs) || !statSync(abs).isFile())
        throw new Error(`cover_source_missing: ${what} ${file} is not a file`);
    const real = realpathSync(abs), root = realpathSync(episode);
    if (real !== root && !real.startsWith(root + sep))
        throw new Error(`cover_source_outside: ${what} ${file} is outside the episode ${episode}`);
    return real;
}
function sha256File(file) {
    const hash = createHash('sha256'), fd = openSync(file, 'r'), buf = Buffer.alloc(1 << 20);
    try {
        for (let n; (n = readSync(fd, buf, 0, buf.length, null)) > 0;)
            hash.update(buf.subarray(0, n));
    }
    finally {
        closeSync(fd);
    }
    return hash.digest('hex');
}
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
function probe(file) {
    try {
        const out = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', file], { encoding: 'utf8', timeout: 30_000 }));
        const s = out.streams?.[0];
        if (!s?.width || !s?.height)
            throw new Error('no picture stream');
        const duration = Number(out.format?.duration);
        return { width: s.width, height: s.height, ...(Number.isFinite(duration) ? { duration } : {}) };
    }
    catch (e) {
        throw new Error(`cover_source_unreadable: ${file}: ${e.message.split('\n')[0]}`);
    }
}
// ── decision ─────────────────────────────────────────────────────────────
function episodeLanguage(ep) {
    const story = ep.board.win.STORY;
    if (typeof story?.language === 'string')
        return story.language;
    try {
        const handoff = episodeHandoff(workflowEpisode(ep.storyboard) ?? '');
        if (handoff?.LANGUAGES?.speech)
            return handoff.LANGUAGES.speech;
    }
    catch { /* no saved project */ }
    return 'ko';
}
function resolveSource(ep, input, warnings) {
    const shots = (ep.board.win.SCENES ?? []);
    const shotOf = (id) => {
        const shot = shots.find(s => s.id === id);
        if (!shot)
            throw new Error(`cover_shot_unknown: ${id} is not a shot on ${ep.board.file}`);
        return shot;
    };
    if (input.kind === 'shot') {
        const shot = shotOf(input.shotId);
        const start = shot.visual?.frames?.start;
        if (!start)
            throw new Error(`cover_shot_no_image: ${input.shotId} has no start image yet (shot_image); use a frame of its clip or make the image first`);
        if (shot.visual?.frames?.mode === 'reference')
            warnings.push({ code: 'cover_source_reference_frame', message: `${input.shotId} is an MSR shot: its start image is a background reference and the finished clip can be framed differently. Use a frame of the clip once it exists.` });
        const file = inside(ep.episode, join(ep.storyboard, start), `start image of ${input.shotId}`);
        probe(file);
        return { ...input, path: relative(ep.episode, file), sha256: sha256File(file) };
    }
    if (input.kind === 'frame') {
        if (input.shotId)
            shotOf(input.shotId);
        const file = inside(ep.episode, input.video, 'video');
        const { duration } = probe(file);
        if (duration === undefined || input.seconds >= duration)
            throw new Error(`cover_frame_outside: ${input.seconds}s is not inside ${input.video} (${duration ?? '?'}s)`);
        return { ...input, video: relative(ep.episode, file), path: relative(ep.episode, file), sha256: sha256File(file) };
    }
    const job = Object.values(readImageState(ep.episode)?.jobs ?? {}).find(j => j.requestId === input.requestId);
    if (!job || job.status !== 'completed')
        throw new Error(`cover_image_receipt_missing: no completed image_execute receipt for ${input.requestId} in ${ep.episode}`);
    const file = inside(ep.episode, job.outputFile, `image ${input.requestId}`);
    probe(file);
    return { ...input, path: relative(ep.episode, file), sha256: sha256File(file) };
}
const CJK_COUNT = new Set(['ja', 'zh']);
const copyLength = (text, language) => CJK_COUNT.has(language.split('-')[0])
    ? { n: Array.from(text.replace(/[\s\p{P}\p{S}]/gu, '')).length, unit: 'chars' }
    : { n: text.trim().split(/\s+/).length, unit: 'words' };
function youtubeTitle(ep) {
    const file = join(ep.episode, 'output', 'youtube', 'meta.md');
    if (!existsSync(file))
        return undefined;
    const lines = readFileSync(file, 'utf8').split('\n');
    const at = lines.findIndex(l => /^#{1,6}\s+title\b/i.test(l));
    if (at < 0)
        return undefined;
    return lines.slice(at + 1).find(l => l.trim() && !/^#/.test(l))?.trim();
}
function copyWarnings(ep, copy, language, label) {
    if (!copy)
        return [];
    const { n, unit } = copyLength(copy.text, language);
    const max = unit === 'chars' ? ep.spec.copyMax.chars : ep.spec.copyMax.words;
    return n > max ? [{ code: 'cover_copy_long', message: `${label}copy runs ${n} ${unit}; this format reads best at ${max} or fewer` }] : [];
}
/** Copy the title already says, checked whenever output/youtube/meta.md has a title. */
function titleWarnings(ep, decision) {
    const title = youtubeTitle(ep);
    if (!title)
        return [];
    const norm = (s) => s.normalize('NFC').toLowerCase().replace(/[\s\p{P}]/gu, '');
    return [decision, ...decision.variants].flatMap((look, i) => look.copy && norm(look.copy.text) && norm(title).includes(norm(look.copy.text))
        ? [{ code: 'cover_copy_repeats_title', message: `${i ? `variant ${VARIANT_LABELS[i]}: ` : ''}copy "${look.copy.text}" repeats the title "${title}"; the cover adds what the title does not say` }] : []);
}
function lookOf(ep, base, warnings, label) {
    if (base.copy?.emphasis && !base.copy.text.includes(base.copy.emphasis))
        throw new Error(`cover_emphasis_missing: ${label}emphasis "${base.copy.emphasis}" is not part of "${base.copy.text}"`);
    const source = resolveSource(ep, base.source, warnings);
    return { source, focus: base.focus ?? { x: 0.5, y: 0.5 }, copy: base.copy };
}
export function setCover(path, input) {
    const ep = episodeOf(path);
    if (input.variants.length && !landscape(ep.spec))
        throw new Error('cover_variants_longform_only: variants are for YouTube Test & Compare, which long-form videos have and Shorts do not');
    const warnings = [];
    const language = input.language ?? episodeLanguage(ep);
    if (input.language && input.language !== episodeLanguage(ep))
        warnings.push({ code: 'cover_language_mismatch', message: `copy language ${input.language} differs from the episode language ${episodeLanguage(ep)}` });
    const main = lookOf(ep, input, warnings, '');
    const variants = input.variants.map((v, i) => lookOf(ep, {
        source: v.source ?? input.source, focus: v.focus ?? main.focus, copy: v.copy === undefined ? main.copy : v.copy,
    }, warnings, `variant ${VARIANT_LABELS[i + 1]}: `));
    for (const [i, look] of [main, ...variants].entries()) {
        if (look.copy)
            pickFont(look.copy.text, language);
        warnings.push(...copyWarnings(ep, look.copy, language, i ? `variant ${VARIANT_LABELS[i]}: ` : ''));
        warnings.push(...sizeWarnings(ep, look, i ? `variant ${VARIANT_LABELS[i]}: ` : ''));
    }
    const decision = { version: 1, language, reason: input.reason, format: ep.format, ...main, variants };
    warnings.push(...titleWarnings(ep, decision));
    const file = join(ep.storyboard, 'cover.json');
    atomicWrite(file, JSON.stringify(decision, null, 2) + '\n');
    return { file, decision, decisionSha256: decisionSha(decision), warnings };
}
const VARIANT_LABELS = ['a', 'b', 'c'];
function atomicWrite(file, data) {
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, data);
    renameSync(tmp, file);
}
function readDecision(ep) {
    const file = join(ep.storyboard, 'cover.json');
    if (!existsSync(file))
        return undefined;
    let raw;
    try {
        raw = JSON.parse(readFileSync(file, 'utf8'));
    }
    catch (e) {
        throw new Error(`cover_decision_unreadable: ${file}: ${e.message}`);
    }
    // A hand-edited file is held to the shape set writes; its paths are checked against the episode where they are used.
    const parsed = storedDecisionSchema.safeParse(raw);
    if (!parsed.success)
        throw new Error(`cover_decision_unreadable: ${file} is not a version 1 cover decision (${parsed.error.issues[0]?.path.join('.')}: ${parsed.error.issues[0]?.message}); write it again with episode_cover set`);
    return parsed.data;
}
const storedSourceSchema = z.union([
    z.object({ kind: z.literal('shot'), shotId: shotIdSchema }).strict(),
    z.object({ kind: z.literal('frame'), video: z.string().min(1), seconds: z.number().min(0), shotId: shotIdSchema.optional() }).strict(),
    z.object({ kind: z.literal('image'), requestId: z.string().min(1) }).strict(),
].map(s => s.extend({ path: z.string().min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/) })));
const storedLookSchema = z.object({ source: storedSourceSchema, focus: focusSchema, copy: copySchema.nullable() }).strict();
const storedDecisionSchema = storedLookSchema.extend({
    version: z.literal(1), language: z.string().min(1), reason: z.string().min(1), format: z.string().min(1), variants: z.array(storedLookSchema).max(2),
}).strict();
const even = (n) => Math.max(2, Math.round(n / 2) * 2);
function cropFor(src, focus, canvas) {
    const ar = canvas.w / canvas.h;
    let w = src.width, h = src.height;
    if (w / h > ar)
        w = Math.round(h * ar);
    else
        h = Math.round(w / ar);
    const clamp = (v, max) => Math.max(0, Math.min(max, Math.round(v)));
    const x = clamp(focus.x * src.width - w / 2, src.width - w), y = clamp(focus.y * src.height - h / 2, src.height - h);
    // Never upscale past the source; only lift a source smaller than the platform minimum up to it.
    let outW = Math.min(canvas.w, w);
    const small = outW < canvas.min[0];
    if (small)
        outW = canvas.min[0];
    outW = even(outW);
    return { x, y, w, h, outW, outH: even(outW * canvas.h / canvas.w), small };
}
function sizeWarnings(ep, look, label) {
    const src = probeSource(ep, look.source);
    return ep.spec.canvases.filter(c => cropFor(src, look.focus, c).small).map(c => ({ code: 'cover_source_small',
        message: `${label}the source gives less than ${c.min[0]}×${c.min[1]} for the ${c.id} canvas and is enlarged to it; a larger source looks sharper` }));
}
function probeSource(ep, source) {
    return probe(inside(ep.episode, source.path, 'source'));
}
/** The band every vertical crop keeps: the centre 16:9 slice, or the 1:1 band once Shorts' landscape surfaces are known to keep 9:16. */
const coreBand = (spec) => spec.unverified.shortsLandscapeCrop === '9:16' ? spec.bands.support : spec.bands.core;
/** Where the copy may sit: the half of the safe area away from the subject. */
function regionFor(spec, focus) {
    if (landscape(spec)) {
        const x = spec.x ?? { x0: 0.04, x1: 0.96 }, y1 = Math.min(spec.badge?.y0 ?? 0.85, spec.bottom ?? 0.95) - 0.05;
        return focus.x >= 0.5 ? { x0: x.x0, x1: 0.48, y0: 0.08, y1, align: 'left' } : { x0: 0.52, x1: x.x1, y0: 0.08, y1, align: 'right' };
    }
    const core = coreBand(spec), x = spec.bands.x;
    return focus.y <= 0.5 ? { x0: x.x0, x1: x.x1, y0: 0.5, y1: core.y1, align: 'center' } : { x0: x.x0, x1: x.x1, y0: core.y0, y1: 0.5, align: 'center' };
}
function pickFont(text, language) {
    const motion = load(join(PLUGIN_ROOT, 'skills', 'storyboard', 'references', 'motion-font-data.js'));
    const cjk = load(join(COVER_REFS, 'cover-font-data.js'));
    const all = { ...motion, ...cjk };
    const lang = language.split('-')[0];
    const order = lang === 'ja' ? ['notosansjp', 'pretendard']
        : lang === 'zh' ? ['notosanssc', 'notosanstc']
            : /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7a3]/.test(text) ? ['paperlogy', 'pretendard'] : ['pretendard', 'paperlogy'];
    const covers = (f) => Array.from(text.normalize('NFC')).every(ch => /\s/.test(ch) || f.coverage.some(([a, b]) => ch.codePointAt(0) >= a && ch.codePointAt(0) <= b));
    const id = order.find(k => all[k] && covers(all[k]));
    if (!id) {
        const drawn = (ch) => order.some(k => all[k]?.coverage.some(([a, b]) => ch.codePointAt(0) >= a && ch.codePointAt(0) <= b));
        const missing = [...new Set(Array.from(text.normalize('NFC')).filter(ch => !/\s/.test(ch) && !drawn(ch)))];
        throw new Error(`cover_font_missing: no bundled font draws all of "${text}" in ${language}${missing.length ? ` (missing: ${missing.join(' ')})` : ''}; set the cover without copy, or add a font`);
    }
    const f = all[id];
    const dir = f.file.endsWith('.ttf') ? MOTION_FONT_DIR : REVIEW_FONT_DIR;
    const weight = f.axes.wght ? Math.min(f.axes.wght[2], 800) : f.weight;
    return { id, file: join(dir, f.file), weight };
}
// ── rendering ────────────────────────────────────────────────────────────
const CHROME_CANDIDATES = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    '/opt/google/chrome/chrome', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium',
];
export function chromePath() {
    const env = process.env.CHROME;
    if (env && existsSync(env) && statSync(env).isFile())
        return env;
    return CHROME_CANDIDATES.find(p => existsSync(p));
}
/** One headless Chrome run; --screenshot sometimes writes its file and keeps running, so a written file ends the wait. */
function chrome(args, until) {
    const bin = chromePath();
    if (!bin)
        return Promise.reject(new Error('cover_chrome_missing: Google Chrome was not found; set CHROME to the binary'));
    const profile = mkdtempSync(join(tmpdir(), 'sf-cover-chrome-'));
    return new Promise((resolveRun, reject) => {
        const child = spawn(bin, ['--headless=new', '--use-mock-keychain', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
            '--no-default-browser-check', '--allow-file-access-from-files', '--virtual-time-budget=15000', `--user-data-dir=${profile}`,
            // The page only reads local files; no host resolves, so nothing it holds can reach the network.
            '--host-resolver-rules=MAP * ~NOTFOUND', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
        let out = '', done = false;
        const finish = (error) => {
            if (done)
                return;
            done = true;
            clearInterval(poll);
            clearTimeout(timer);
            if (child.exitCode === null)
                child.kill('SIGKILL');
            rmSync(profile, { recursive: true, force: true });
            if (error)
                reject(error);
            else
                resolveRun(out);
        };
        let last = -1;
        const poll = setInterval(() => {
            if (!until || !existsSync(until))
                return;
            const size = statSync(until).size;
            if (size > 0 && size === last)
                finish();
            else
                last = size;
        }, 150);
        const timer = setTimeout(() => finish(new Error('cover_chrome_failed: Chrome did not finish within 90 s')), 90_000);
        child.stdout.on('data', d => { out += d; });
        child.on('error', e => finish(new Error(`cover_chrome_failed: ${e.message}`)));
        child.on('close', code => {
            if (until && existsSync(until))
                finish();
            else if (!until && code === 0)
                finish();
            else
                finish(new Error(`cover_chrome_failed: Chrome exited ${code}${until ? ' without writing the screenshot' : ''}`));
        });
    });
}
function ffmpeg(args) {
    try {
        execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { timeout: 120_000, stdio: ['ignore', 'ignore', 'pipe'] });
    }
    catch (e) {
        throw new Error(`cover_ffmpeg_failed: ${(e.stderr?.toString() || e.message).trim().split('\n').slice(-2).join(' ')}`);
    }
}
/** JPEG under the byte limit: the best quality that fits, else a refusal. */
export function encodeJpeg(png, out, limit) {
    for (let q = 2; q <= 12; q += 2) {
        ffmpeg(['-i', png, '-map_metadata', '-1', '-frames:v', '1', '-q:v', String(q), out]);
        const bytes = statSync(out).size;
        if (bytes <= limit)
            return { bytes, quality: q };
    }
    rmSync(out, { force: true });
    throw new Error(`cover_file_too_large: ${out} stays over ${limit} bytes at every JPEG quality`);
}
/** WCAG relative luminance of an sRGB colour. */
function luminance([r, g, b]) {
    const c = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
}
/** The copy's fill against the brightest tenth of the picture behind it. At tile size the outline
 *  shrinks under a pixel, so the fill alone has to stand off the background. */
function contrastBehind(bg, box, width, height, fills) {
    const x = Math.max(0, Math.floor(box.x0 * width)), y = Math.max(0, Math.floor(box.y0 * height));
    const w = Math.max(2, Math.min(width - x, Math.ceil((box.x1 - box.x0) * width))), h = Math.max(2, Math.min(height - y, Math.ceil((box.y1 - box.y0) * height)));
    const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', bg, '-vf', `crop=${w}:${h}:${x}:${y},scale=64:-2:flags=area`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { timeout: 30_000, maxBuffer: 1 << 24 });
    const lum = [];
    for (let i = 0; i + 2 < raw.length; i += 3)
        lum.push(luminance([raw[i], raw[i + 1], raw[i + 2]]));
    lum.sort((a, b) => a - b);
    const bright = lum[Math.floor(lum.length * 0.9)] ?? 0;
    return Math.min(...fills.map(f => (Math.max(luminance(f), bright) + 0.05) / (Math.min(luminance(f), bright) + 0.05)));
}
const templateSha = () => sha256(readFileSync(TEMPLATE_FILE));
/** The configuration as a script literal: a replacer function (so "$&" or "$'" in the copy stay text) and every
 *  character that could close the script or break a JS line escaped. */
export function injectConfig(template, config) {
    const literal = JSON.stringify(config).replace(/[<>\u2028\u2029]/g, ch => '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0'));
    return template.replace('/*COVER_CONFIG*/null', () => literal);
}
const decisionSha = (d) => sha256(JSON.stringify(d));
const storyFirst = (win) => win.STORY?.authoring === 'story-first';
export async function renderCover(path) {
    const ep = episodeOf(path);
    const decision = readDecision(ep);
    if (!decision)
        throw new Error('cover_decision_missing: write the decision with episode_cover set first');
    const dir = join(ep.episode, 'output', 'cover'), work = join(dir, '.work');
    rmSync(work, { recursive: true, force: true });
    mkdirSync(join(dir, 'previews'), { recursive: true });
    mkdirSync(work, { recursive: true });
    const template = readFileSync(TEMPLATE_FILE, 'utf8');
    const kind = landscape(ep.spec) ? 'landscape' : 'vertical';
    const files = [], previews = [], warnings = [], measurements = {};
    const sources = {}, fonts = {};
    const looks = [decision, ...decision.variants];
    for (const [i, look] of looks.entries()) {
        const label = VARIANT_LABELS[i], suffix = i ? `-${label}` : '', say = i ? `variant ${label}: ` : '';
        // The source must still be the one the decision named.
        const srcFile = inside(ep.episode, look.source.path, 'source');
        const now = sha256File(srcFile);
        if (now !== look.source.sha256)
            throw new Error(`cover_source_changed: ${look.source.path} changed after episode_cover set; set the decision again so it names what it shows`);
        sources[label] = now;
        let still = srcFile;
        if (look.source.kind === 'frame') {
            const { duration } = probe(srcFile);
            if (duration === undefined || look.source.seconds >= duration)
                throw new Error(`cover_frame_outside: ${look.source.seconds}s is not inside ${look.source.path} (${duration ?? '?'}s)`);
            still = join(work, `frame${suffix}.png`);
            ffmpeg(['-ss', String(look.source.seconds), '-i', srcFile, '-frames:v', '1', still]);
        }
        const src = probe(still);
        for (const canvas of ep.spec.canvases) {
            const crop = cropFor(src, look.focus, canvas);
            if (crop.small)
                warnings.push({ code: 'cover_source_small', message: `${say}the source gives less than ${canvas.min[0]}×${canvas.min[1]} and is enlarged to it` });
            const bg = join(work, `bg-${canvas.id}${suffix}.png`);
            ffmpeg(['-i', still, '-vf', `crop=${crop.w}:${crop.h}:${crop.x}:${crop.y},scale=${crop.outW}:${crop.outH}:flags=lanczos`, '-frames:v', '1', bg]);
            const focus = { x: (look.focus.x * src.width - crop.x) / crop.w, y: (look.focus.y * src.height - crop.y) / crop.h };
            const region = regionFor(ep.spec, focus);
            const font = look.copy ? pickFont(look.copy.text, decision.language) : undefined;
            if (font)
                fonts[relative(PLUGIN_ROOT, font.file)] = sha256File(font.file);
            const config = {
                width: crop.outW, height: crop.outH, background: pathToFileURL(bg).href,
                text: look.copy?.text ?? null, emphasis: look.copy?.emphasis ?? null, align: region.align, region,
                font: font ? { url: pathToFileURL(font.file).href, weight: font.weight } : null,
                maxFont: Math.round((kind === 'landscape' ? 0.2 * crop.outH : 0.14 * crop.outW)),
                minFont: Math.round((MIN_TILE_FONT_PX * crop.outW) / TILE_WIDTH[kind]),
            };
            const page = join(work, `page-${canvas.id}${suffix}.html`);
            writeFileSync(page, injectConfig(template, config));
            const url = pathToFileURL(page).href, size = `--window-size=${crop.outW},${crop.outH}`;
            const dom = await chrome([size, '--dump-dom', url]);
            const measured = /<script type="application\/json" id="measure">([\s\S]*?)<\/script>/.exec(dom)?.[1];
            let m;
            try {
                m = JSON.parse(measured ?? '');
            }
            catch {
                throw new Error('cover_chrome_failed: the cover page did not report its layout');
            }
            if (m.error)
                throw new Error(`cover_chrome_failed: ${m.error}`);
            // The page writes its result last; an untouched {} means its script never finished, so nothing it drew is trusted.
            if (m.width !== crop.outW || (look.copy && !m.copy))
                throw new Error('cover_chrome_failed: the cover page did not finish its layout');
            const shot = join(work, `shot-${canvas.id}${suffix}.png`);
            await chrome([size, `--screenshot=${shot}`, url], shot);
            const got = probe(shot);
            if (got.width !== crop.outW || got.height !== crop.outH)
                throw new Error(`cover_chrome_failed: the capture is ${got.width}×${got.height}, not ${crop.outW}×${crop.outH}`);
            const name = `${kind === 'landscape' ? 'thumbnail' : 'cover'}-${canvas.id}${suffix}.jpg`;
            const out = join(dir, name);
            const enc = encodeJpeg(shot, out, LIMIT[kind]);
            files.push({ name, width: crop.outW, height: crop.outH, bytes: enc.bytes, quality: enc.quality, sha256: sha256File(out), role: i ? `variant ${label}` : 'main' });
            if (!i && kind === 'vertical' && ep.spec.unverified.tiktokSavedRatio === '3:4') {
                const tt = join(dir, 'cover-3x4.jpg'), png = join(work, 'tiktok-3x4.png');
                ffmpeg(['-i', shot, '-vf', `crop=iw:ih*0.75:0:ih*0.125,scale=1080:1440:flags=lanczos`, '-frames:v', '1', png]);
                const e = encodeJpeg(png, tt, LIMIT.vertical);
                files.push({ name: 'cover-3x4.jpg', width: 1080, height: 1440, bytes: e.bytes, quality: e.quality, sha256: sha256File(tt), role: 'tiktok' });
            }
            previews.push(...cutPreviews(shot, join(dir, 'previews'), `${canvas.id}${suffix}`, kind, ep.spec));
            const measure = { canvas: canvas.id, source: look.source.path, crop, focus };
            const core = kind === 'vertical' ? coreBand(ep.spec) : undefined;
            if (core && (focus.y < core.y0 || focus.y > core.y1))
                warnings.push({ code: 'cover_focus_outside_core', message: `${say}the subject (focus y ${focus.y.toFixed(2)}) sits outside the centre band ${core.y0}–${core.y1} that every crop keeps` });
            if (look.copy && m.copy) {
                const box = m.copy.box;
                const tilePx = (m.copy.fontPx * TILE_WIDTH[kind]) / crop.outW;
                const contrast = contrastBehind(bg, box, crop.outW, crop.outH, look.copy.emphasis ? [FILL.text, FILL.emphasis] : [FILL.text]);
                Object.assign(measure, { font: font.id, fontPx: m.copy.fontPx, lines: m.copy.lines, box, tileFontPx: +tilePx.toFixed(1), tileWidth: TILE_WIDTH[kind],
                    minTileFontPx: MIN_TILE_FONT_PX, contrast: +contrast.toFixed(2), minContrast: 3 });
                if (!m.copy.fits)
                    warnings.push({ code: 'cover_copy_overflow', message: `${say}the copy does not fit its area in two lines even at the smallest legible size; shorten it` });
                if (tilePx < MIN_TILE_FONT_PX)
                    warnings.push({ code: 'cover_copy_small', message: `${say}the copy is ${tilePx.toFixed(1)} px tall on a ${TILE_WIDTH[kind]} px tile; ${MIN_TILE_FONT_PX} px or more reads` });
                if (contrast < 3)
                    warnings.push({ code: 'cover_copy_low_contrast', message: `${say}the copy stands ${contrast.toFixed(2)}:1 off the brightest part behind it; 3:1 or more reads at tile size` });
                if (kind === 'vertical') {
                    const xb = ep.spec.bands.x;
                    if (box.y0 < core.y0 - 0.002 || box.y1 > core.y1 + 0.002 || box.x0 < xb.x0 - 0.002 || box.x1 > xb.x1 + 0.002)
                        warnings.push({ code: 'cover_copy_outside_core', message: `${say}the copy leaves the centre band every crop keeps` });
                }
                else {
                    const badge = ep.spec.badge ?? { x0: 0.8, y0: 0.85 };
                    if ((box.x1 > badge.x0 && box.y1 > badge.y0) || box.y1 > (ep.spec.bottom ?? 0.95))
                        warnings.push({ code: 'cover_copy_badge', message: `${say}the copy reaches the duration badge corner or the progress bar strip` });
                }
            }
            measurements[`${canvas.id}${suffix}`] = measure;
        }
    }
    warnings.push(...titleWarnings(ep, decision));
    const copied = [];
    if (storyFirst(ep.board.win)) {
        const main = files.find(f => f.role === 'main');
        const video = join(ep.episode, 'output', 'video');
        mkdirSync(video, { recursive: true });
        copyFileSync(join(dir, main.name), join(video, 'cover.jpg'));
        copied.push('output/video/cover.jpg');
        if (kind === 'landscape') {
            copyFileSync(join(dir, main.name), join(video, 'thumbnail.jpg'));
            copied.push('output/video/thumbnail.jpg');
        }
    }
    const render = { version: 1, renderVersion: RENDER_VERSION, decisionSha256: decisionSha(decision), templateSha256: templateSha(), sources, fonts,
        format: ep.format, files, previews, measurements, warnings, copied };
    atomicWrite(join(dir, 'render.json'), JSON.stringify(render, null, 2) + '\n');
    rmSync(work, { recursive: true, force: true });
    return { dir, render };
}
function cutPreviews(shot, dir, stem, kind, spec) {
    const out = [];
    const cut = (name, vf) => { const file = join(dir, `${stem}-${name}.png`); ffmpeg(['-i', shot, '-vf', vf, '-frames:v', '1', file]); out.push(relative(dirname(dir), file)); };
    if (kind === 'landscape') {
        cut('tile-160x90', 'scale=160:90:flags=area');
        cut('sheet', 'split=2[a][b];[a]scale=640:360:flags=area,pad=820:360:0:0:black[p];[b]scale=160:90:flags=area[t];[p][t]overlay=650:135');
        return out;
    }
    const b = spec.bands;
    const band = (y) => `crop=iw:ih*${(y.y1 - y.y0).toFixed(4)}:0:ih*${y.y0.toFixed(4)}`;
    cut('grid-3x4', `${band(b.outer)},scale=120:160:flags=area`);
    cut('feed-1x1', `${band(b.support)},scale=240:240:flags=area`);
    const sheet = `[f]scale=270:480:flags=area[f2];[g]${band(b.outer)},scale=360:480:flags=area[g2];[s]${band(b.support)},scale=480:480:flags=area[s2]`;
    // Once Shorts' landscape surfaces are known to show the whole 9:16 cover there is no landscape crop to preview.
    if (spec.unverified.shortsLandscapeCrop === '9:16') {
        cut('sheet', `split=3[f][g][s];${sheet};[f2][g2][s2]hstack=3`);
        return out;
    }
    cut('landscape-16x9', `${band(b.core)},scale=320:180:flags=area`);
    cut('sheet', `split=4[f][g][s][c];${sheet};[c]${band(b.core)},scale=852:480:flags=area[c2];[f2][g2][s2][c2]hstack=4`);
    return out;
}
// ── read ─────────────────────────────────────────────────────────────────
export function readCover(path) {
    const ep = episodeOf(path);
    const story = ep.board.win.STORY;
    const plan = story?.opening?.thumbnail || story?.opening?.title ? { title: story?.opening?.title, thumbnail: story?.opening?.thumbnail } : undefined;
    const base = { format: ep.format, unverified: ep.spec.unverified, ...(plan ? { plan } : {}) };
    let decision;
    try {
        decision = readDecision(ep);
    }
    catch (e) {
        return { status: 'unreadable', reason: e.message, ...base, next: 'episode_cover set again' };
    }
    if (!decision)
        return { status: 'missing', ...base, next: 'episode_cover set: choose the moment, the copy and why' };
    const dir = join(ep.episode, 'output', 'cover'), renderFile = join(dir, 'render.json');
    if (!existsSync(renderFile))
        return { status: 'unrendered', decision, ...base, next: 'episode_cover render' };
    let render;
    try {
        render = JSON.parse(readFileSync(renderFile, 'utf8'));
        if (!Array.isArray(render.files) || !Array.isArray(render.warnings) || !Array.isArray(render.previews) || typeof render.sources !== 'object' || !render.sources)
            throw new Error('shape');
    }
    catch {
        return { status: 'unrendered', decision, ...base, next: 'episode_cover render (output/cover/render.json is unreadable)' };
    }
    const changed = [];
    if (render.decisionSha256 !== decisionSha(decision))
        changed.push('decision');
    if (render.templateSha256 !== templateSha() || render.renderVersion !== RENDER_VERSION)
        changed.push('template');
    for (const [file, sha] of Object.entries(render.fonts ?? {})) {
        const abs = join(PLUGIN_ROOT, file);
        if (!existsSync(abs) || sha256File(abs) !== sha) {
            changed.push('font');
            break;
        }
    }
    for (const [i, look] of [decision, ...decision.variants].entries()) {
        const label = VARIANT_LABELS[i];
        let now;
        try {
            now = sha256File(inside(ep.episode, look.source.path, 'source'));
        }
        catch {
            now = undefined;
        }
        if (now !== look.source.sha256 || render.sources[label] !== look.source.sha256)
            changed.push(i ? `source ${label}` : 'source');
    }
    for (const f of render.files) {
        const file = join(dir, String(f.name));
        if (dirname(file) !== dir || !existsSync(file) || sha256File(file) !== f.sha256) {
            changed.push('files');
            break;
        }
    }
    const stale = changed.length > 0;
    const kind = landscape(ep.spec) ? 'landscape' : 'vertical';
    const at = (name) => render.files.some(f => f.name === name) ? join(dir, name) : null;
    const main = render.files.find(f => f.role === 'main');
    const mainFile = main ? join(dir, main.name) : null;
    const publish = kind === 'landscape'
        ? { youtube: mainFile, facebook: mainFile, variants: render.files.filter(f => f.role.startsWith('variant')).map(f => join(dir, f.name)) }
        : { youtube: mainFile, instagram: mainFile, instagramNeedsHosting: true, facebook: mainFile,
            tiktok: ep.spec.unverified.tiktokSavedRatio === '3:4' ? at('cover-3x4.jpg') : mainFile, threads: null };
    // The title can change after the render (meta.md is written late), so its check runs again here.
    const warnings = [...render.warnings.filter(w => w.code !== 'cover_copy_repeats_title'), ...titleWarnings(ep, decision)];
    return { status: stale ? 'stale' : 'fresh', changed, decision, dir, files: render.files, previews: render.previews.map(p => join(dir, p)),
        measurements: render.measurements, warnings, publish: { ...publish, stale }, copied: render.copied, ...base,
        ...(stale ? { next: 'episode_cover render (it is local and free); set again first when the source changed' } : {}) };
}
