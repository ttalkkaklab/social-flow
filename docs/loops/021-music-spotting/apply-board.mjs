#!/usr/bin/env node
// Loop 021 application test. Copies a live episode board into a throwaway workspace, spots its
// music through the plugin's own MCP server (stdio JSON-RPC, the path a host uses), then compiles
// the sound plan and renders the music bed on synthetic cue files and a clock built from the
// planned shot lengths. Nothing is generated or spent, and the live episode is only read.
//
// Usage: node apply-board.mjs <plugin-root> <live-workspace> <channel>/<episode> <plan.json> <out-dir>
// plan.json: { direction: [note], cues: [{ name, prompt, reason, synthetic: { hz, seconds } }],
//              spots: [story_music spot], speechLufs, fps }
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const [pluginRoot, liveWorkspace, episodeName, planFile, outArg] = process.argv.slice(2);
if (!outArg) { console.error('usage: apply-board.mjs <plugin-root> <live-workspace> <channel>/<episode> <plan.json> <out-dir>'); process.exit(2); }
const require = createRequire(import.meta.url);
const refs = path.join(pluginRoot, 'skills/produce/references');
const { evaluateWindowScript } = require(path.join(pluginRoot, 'skills/_shared/scenes-vm.js'));
const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
const out = path.resolve(outArg), workspace = path.join(out, 'workspace');
const [channel, topic] = episodeName.split('/');
const relative = path.join('data', channel, 'episodes', topic);
const liveBoard = path.join(liveWorkspace, relative, 'storyboard'), board = path.join(workspace, relative, 'storyboard');
const sha = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const read = file => evaluateWindowScript(fs.readFileSync(file, 'utf8'));
const checks = [], check = (name, pass, detail) => { checks.push({ name, pass: !!pass, detail }); console.log(`${pass ? '✔' : '✗'} ${name}${detail ? ' — ' + detail : ''}`); };

// ── 1. A copy of the board and the project settings; the live files are read once each.
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(board, { recursive: true });
fs.mkdirSync(path.join(workspace, '.social-flow'), { recursive: true });
// Every live file this run reads, as [live path, copy path]: the settings, the two channel files
// project_manage expects beside them, and the board's own files.
const liveFiles = [['.social-flow/models.json', '.social-flow/models.json'],
  ...['profile.md', 'assets/catalog.md'].map(file => path.join('data', channel, file)).map(file => [file, file]),
  ...fs.readdirSync(liveBoard, { withFileTypes: true }).filter(entry => entry.isFile()).map(entry => path.join(relative, 'storyboard', entry.name)).map(file => [file, file]),
].filter(([file]) => fs.existsSync(path.join(liveWorkspace, file)));
const liveHashes = () => Object.fromEntries(liveFiles.map(([file]) => [file, fs.existsSync(path.join(liveWorkspace, file)) ? sha(path.join(liveWorkspace, file)) : 'missing']));
const liveBefore = liveHashes();
for (const [from, to] of liveFiles) { fs.mkdirSync(path.dirname(path.join(workspace, to)), { recursive: true }); fs.copyFileSync(path.join(liveWorkspace, from), path.join(workspace, to)); }
const original = read(path.join(board, 'scenes.js'));

// ── 2. The plugin's MCP server over stdio.
const server = spawn(process.execPath, [path.join(pluginRoot, 'server/dist/bundle.js')], { stdio: ['pipe', 'pipe', 'ignore'] });
let buffer = '', nextId = 0; const waiting = new Map();
server.stdout.on('data', chunk => {
  buffer += chunk;
  for (let at; (at = buffer.indexOf('\n')) >= 0;) {
    const line = buffer.slice(0, at).trim(); buffer = buffer.slice(at + 1);
    if (!line) continue;
    const message = JSON.parse(line);
    if (waiting.has(message.id)) { waiting.get(message.id)(message); waiting.delete(message.id); }
  }
});
const rpc = (method, params) => new Promise(resolve => {
  const id = ++nextId; waiting.set(id, resolve);
  server.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
});
const call = async (name, args) => {
  const { result, error } = await rpc('tools/call', { name, arguments: args });
  if (error || result.isError) throw new Error(`${name}: ${error ? error.message : result.content.map(item => item.text).join('\n')}`);
  return result.content.map(item => item.text).join('\n');
};
const spotting = text => JSON.parse(text.slice(text.indexOf('Music spotting:') + 'Music spotting:'.length));

await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'loop-021', version: '1' } });
server.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
const listed = (await rpc('tools/list', {})).result.tools.map(tool => tool.name);
check('the MCP server lists story_music', listed.includes('story_music'), `${listed.length} tools`);

// The user's earlier music feedback, saved as the channel's direction (copy of the settings only).
const status = JSON.parse(await call('project_manage', { action: 'status', workspace }));
await call('project_manage', { action: 'update', workspace, expectedRevision: status.revision,
  request: 'Record the music feedback the user gave on episodes 1 to 3',
  settings: { production: { ...status.config.production, musicDirection: plan.direction } } });

const before = spotting(await call('story_music', { path: board }));
check('before spotting every scene reads undecided', before.undecided.length === before.scenes.length && before.scenes.length > 0,
  `${before.undecided.length} of ${before.scenes.length}`);
check('spotting shows the saved direction', JSON.stringify(before.direction) === JSON.stringify(plan.direction), `${before.direction.length} notes`);

const applied = await call('story_music', { path: board, cues: plan.cues.map(({ synthetic, ...cue }) => cue), spots: plan.spots });
const after = spotting(applied);
const outline = JSON.parse(await call('storyboard_read', { path: board, level: 'outline', includeTechniques: false }));
server.kill();

const spotted = read(path.join(board, 'scenes.js'));
const decisions = spotted.STRUCTURE.scenes.map(scene => ({ scene: scene.no, ...scene.music }));
check('(i) every scene carries a decision written by story_music',
  after.undecided.length === 0 && after.mismatch.length === 0 && decisions.every(item => ['score', 'none'].includes(item.decision) && item.reason),
  decisions.map(item => `S${item.scene}:${item.decision}`).join(' '));
check('storyboard_read reports no open scene', outline.musicSpotting.undecided.length === 0 && outline.musicSpotting.mismatch.length === 0);
check('story_music changed only MUSIC and the scene decisions',
  JSON.stringify(spotted.SCENES) === JSON.stringify(original.SCENES) &&
  JSON.stringify(spotted.STRUCTURE.scenes.map(({ music, ...scene }) => scene)) === JSON.stringify(original.STRUCTURE.scenes));

// ── 3. Synthetic cue files: a steady tone per cue, so the bed can be measured.
const episode = path.join(workspace, relative), work = path.join(episode, '.work/music-test');
fs.mkdirSync(path.join(work, 'work'), { recursive: true });
const ffmpeg = args => execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-y', ...args], { maxBuffer: 1 << 28 });
for (const cue of plan.cues)
  ffmpeg(['-f', 'lavfi', '-i', `sine=frequency=${cue.synthetic.hz}:duration=${cue.synthetic.seconds}:sample_rate=48000`, '-ac', '2', path.join(work, `bgm-${cue.name}.wav`)]);

// ── 4. The sound compiler: first with cue files nobody generated here, then with receipts.
const compile = () => {
  const run = spawnSync(process.execPath, [path.join(refs, 'compile-sound-plan.js'), path.join(board, 'scenes.js'), work, path.join(workspace, 'data', channel)], { encoding: 'utf8' });
  return { status: run.status, stderr: run.stderr, ...(run.status === 0 ? JSON.parse(run.stdout.trim().split('\n').pop()) : {}) };
};
const unreceipted = compile();
check('a cue file with no receipt in this episode is reported, and the compile goes on',
  unreceipted.status === 0 && unreceipted.warnings.filter(text => /no generation receipt/.test(text)).length === plan.cues.length,
  `${(unreceipted.warnings || []).length} warning(s)`);
// Simulated music_execute receipts: what the state file holds after the cues are generated here.
fs.mkdirSync(path.join(episode, '.work/music-routing'), { recursive: true });
fs.writeFileSync(path.join(episode, '.work/music-routing/state.json'), JSON.stringify({ version: 1, openingSpendUsd: 0,
  jobs: Object.fromEntries(plan.cues.map(cue => [`simulated-${cue.name}`, { outputFile: path.join(work, `bgm-${cue.name}.wav`), planId: 'simulated',
    requestId: `simulated-${cue.name}`, assetId: cue.name, tool: 'simulated', status: 'completed', reserveUsd: 0,
    output: { sha256: sha(path.join(work, `bgm-${cue.name}.wav`)) }, updatedAt: new Date().toISOString() }])) }, null, 2));
const compiled = compile();
check('(ii-a) the sound plan compiles with no warning once the cues have receipts', compiled.status === 0 && compiled.warnings.length === 0, compiled.stderr.trim());

// ── 5. A clock from the planned shot lengths, then the real timeline renderer.
const fps = plan.fps;
let frame = 0;
const rows = spotted.SCENES.map((shot, card) => { const frames = Math.round(shot.duration * fps), row = [card, frame, frames]; frame += frames; return row; });
const length = frame / fps;
fs.writeFileSync(path.join(work, 'work/edit-timeline.tsv'), rows.map(row => row.join('\t')).join('\n') + '\n');
const separation = spotted.MUSIC.$mix?.bedSeparationLu ?? 10, limit = spotted.MUSIC.$mix?.maximumSeparationLu ?? 20;
const render = spawnSync(process.execPath, [path.join(refs, 'music-timeline.js'), 'music-timeline.json', 'work/edit-timeline.tsv', String(fps), String(length),
  String(plan.speechLufs - separation), 'work/bed.wav', String(plan.speechLufs), String(limit)], { cwd: work, encoding: 'utf8' });
check('(ii-b) the timeline renders', render.status === 0, (render.stdout + render.stderr).trim().split('\n')[0]);
const resolved = JSON.parse(fs.readFileSync(path.join(work, 'work/music-timeline-resolved.json'), 'utf8'));
check('no span loops or rests past the quiet review line', resolved.warnings.length === 0, resolved.warnings.join(' | '));

// ── 6. Signal inside every span, digital silence outside all of them.
const pcm = ffmpeg(['-i', path.join(work, 'work/bed.wav'), '-ac', '1', '-ar', '48000', '-f', 'f32le', '-']);
const samples = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.length >> 2);
const rms = (from, to) => { let sum = 0; const a = Math.round(from * 48000), b = Math.min(samples.length, Math.round(to * 48000)); for (let i = a; i < b; i++) sum += samples[i] ** 2; return Math.sqrt(sum / Math.max(1, b - a)); };
const spans = resolved.spans.map(span => ({ id: span.id, cue: span.cue, start: span.startSeconds, end: span.endSeconds,
  sourceStartSeconds: span.sourceStartSeconds ?? 0, measuredLufs: span.measuredLufs, separationLu: span.separationLu, rms: Number(rms(span.startSeconds, span.endSeconds).toFixed(5)) }));
check('(iii) every scored span has signal inside it', spans.length > 0 && spans.every(span => span.rms > 0.001 && span.separationLu <= limit),
  spans.map(span => `${span.id} ${span.start.toFixed(1)}–${span.end.toFixed(1)}s ${span.separationLu} LU under`).join(' · '));
let outsidePeak = 0, outsideSeconds = 0;
for (let i = 0; i < samples.length; i++) {
  const t = i / 48000;
  if (spans.some(span => t >= span.start - 1 / 48000 && t <= span.end + 1 / 48000)) continue;
  outsideSeconds += 1 / 48000; if (Math.abs(samples[i]) > outsidePeak) outsidePeak = Math.abs(samples[i]);
}
check('(iv) the bed is silent outside the spans', outsidePeak === 0, `peak ${outsidePeak} over ${outsideSeconds.toFixed(1)}s`);

// ── 7. The review page of the copy: each scene header carries its decision.
let page = { rendered: false };
const refresh = spawnSync(process.execPath, [path.join(pluginRoot, 'skills/storyboard/references/storyboard-html.js'), board], { encoding: 'utf8' });
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (refresh.status === 0 && fs.existsSync(chrome)) {
  const dom = spawnSync(chrome, ['--headless', '--use-mock-keychain', '--disable-gpu', '--virtual-time-budget=8000', '--dump-dom', 'file://' + path.join(board, 'storyboard.html')],
    { encoding: 'utf8', maxBuffer: 1 << 28, timeout: 120000 }).stdout || '';
  // The dumped page also holds the template's own script text; a rendered lane never contains `esc(`.
  const lanes = [...dom.matchAll(/<span class="music-lane"[^>]*>([^<]*)<\/span>/g)].map(match => match[1]).filter(text => !text.includes('esc('));
  page = { rendered: true, lanes: lanes.length, undecided: lanes.filter(text => /미정|undecided/i.test(text)).length };
  check('the review page shows a decision on every scene header and no scene as undecided',
    lanes.length >= decisions.length && page.undecided === 0, `${lanes.length} lanes`);
}

// ── 8. Every live file read: same bytes as before the run. Another session may be writing the live
// board meanwhile; then the board must still be unspotted, which is what this run would have changed.
const liveAfter = liveHashes(), moved = liveFiles.map(([file]) => file).filter(file => liveBefore[file] !== liveAfter[file]);
const live = read(path.join(liveBoard, 'scenes.js'));
const liveUnspotted = live.STRUCTURE.scenes.every(scene => scene.music === undefined) && JSON.stringify(live.MUSIC) === JSON.stringify(original.MUSIC);
check('(v) the live files are unchanged by this run', moved.length === 0 || (moved.every(file => file.endsWith('scenes.js') || file.endsWith('storyboard.html') || file.endsWith('.md')) && liveUnspotted),
  moved.length === 0 ? `${liveFiles.length} files, same sha256 before and after` : `changed meanwhile by another writer: ${moved.join(', ')}; the live MUSIC block and scene decisions are untouched`);

const covered = spans.reduce((sum, span) => sum + span.end - span.start, 0);
const summary = { date: new Date().toISOString(), board: path.join(liveBoard, 'scenes.js'), liveSha256: { before: liveBefore, after: liveAfter, changed: moved },
  copy: board, shots: spotted.SCENES.length, lengthSeconds: Number(length.toFixed(1)), musicSeconds: Number(covered.toFixed(1)), coverage: Number((covered / length).toFixed(2)),
  scenes: after.scenes, spans, compileWarningsWithoutReceipts: unreceipted.warnings, page, checks,
  limits: 'Synthetic tones stand in for the cues and planned shot lengths for the edit clock. No music was generated, nothing was spent and nobody listened.' };
fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(`\n${checks.filter(item => item.pass).length}/${checks.length} checks passed · music ${summary.musicSeconds}s of ${summary.lengthSeconds}s (${Math.round(summary.coverage * 100)}%) · ${path.join(out, 'result.json')}`);
process.exit(checks.every(item => item.pass) ? 0 : 1);
