#!/usr/bin/env node
'use strict';

// Plans are editorial advice. Captured frames are byte-bound observations, not visual approvals.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { outline } = require('./structure-contract.js');
const { framePlan } = require('./render-routing.js');
const text = value => typeof value === 'string' && value.trim().length > 0;
const hash = value => createHash('sha256').update(value).digest('hex');
const fileHash = file => hash(fs.readFileSync(file));
const local = (dir, file) => {
  if (!text(file) || /^[a-z][a-z0-9+.-]*:/i.test(file)) throw new Error('expected a local media path');
  return path.resolve(dir, file);
};
const generated = s => s?.shot?.render?.mode === 'generated_video' && !s.visual?.reuse &&
  !['broll', 'outro'].includes(s.type) && s.shot?.videoDesign?.look !== 'archive';
const camera = s => s.shot?.location?.camera || null;
const hasActors = s => !!s.visual?.character?.length || !!s.visual?.character?.id ||
  !!s.shot?.location?.blocking?.actors?.length;
const closing = s => s.shot?.videoDesign?.motion?.beats?.at(-1)?.state || s.shot?.videoDesign?.after || null;
const vague = value => !text(value) || /^(대사와 동작이 시작되기 직전|(?:just )?before (?:the )?(?:action|dialogue)(?: begins)?)[.!\s]*$/i.test(value.trim());

function connections(win) {
  const shots = win.SCENES || [];
  const played = outline(win, 'outline').playback.map(row => row.no - 1);
  const groups = new Map();
  return played.map((index, position) => {
    const s = shots[index], b = s.shot?.location || {};
    const adjacent = position ? played[position - 1] : null;
    let previous = null, scope = null;
    if (text(b.continuityGroup)) {
      previous = groups.get(b.continuityGroup) ?? null;
      scope = 'explicit_group';
      groups.set(b.continuityGroup, index);
    } else if (adjacent !== null) {
      const a = shots[adjacent], ab = a.shot?.location || {};
      const samePlace = !b.id || !ab.id || b.id === ab.id;
      if (s.scene !== undefined && a.scene !== undefined) {
        if (s.scene === a.scene && samePlace) { previous = adjacent; scope = 'scene'; }
      } else if (b.id && b.id === ab.id && !['broll', 'outro'].includes(a.type)) {
        previous = adjacent; scope = 'location_inferred';
      }
    }
    if (text(b.continuityBreak) || ['broll', 'outro'].includes(s.type)) previous = null;
    return { index, previous, adjacent, scope };
  });
}

function segment(scene, dir) {
  if (!generated(scene) || scene.visual?.video?.groupPlan) throw new Error('capture requires one generated clip; inspect grouped/imported footage separately');
  const declared = scene.visual?.video?.clip;
  const clip = local(typeof declared === 'string' && declared.startsWith('.work/') ? path.dirname(dir) : dir, declared);
  const sourceIn = scene.edit?.in ?? 0, seconds = scene.duration;
  if (!Number.isFinite(sourceIn) || sourceIn < 0 || !Number.isFinite(seconds) || seconds <= 0)
    throw new Error('capture requires a finite selected duration and nonnegative edit.in');
  return { clip, sourceIn, seconds };
}

function binding(scene, selected, clipSha256) {
  return hash(JSON.stringify({ id: scene.id, ...selected, clipSha256,
    camera: scene.visual?.camera, location: scene.shot?.location,
    opening: framePlan(scene).start, before: scene.shot?.videoDesign?.before, after: closing(scene) }));
}

function observed(scene, dir) {
  const record = scene.visual?.video?.observedEnd;
  if (!record) return { status: 'missing' };
  try {
    const selected = segment(scene, dir);
    if (binding(scene, selected, fileHash(selected.clip)) !== record.binding)
      throw new Error('clip, trim, duration or shot plan changed; recapture the selected endpoint');
    const image = local(dir, record.path);
    if (fileHash(image) !== record.sha256) throw new Error('captured endpoint bytes changed');
    return { ...record, path: image, status: 'captured_not_reviewed' };
  } catch (error) { return { status: 'stale', reason: error.message }; }
}

function plan(win, index, dir, links = connections(win)) {
  const scene = win.SCENES[index];
  const link = links.find(row => row.index === index);
  if (!scene || !link) return null;
  const previous = link.previous === null ? null : win.SCENES[link.previous];
  const endpoint = previous && dir ? observed(previous, dir) : { status: 'missing' };
  const available = endpoint.status === 'captured_not_reviewed';
  const pose = (value, end = false) => {
    if (!value) return null;
    const { end: landing, ...start } = value;
    return end ? { ...start, ...landing } : start;
  };
  const sameCamera = !!previous && !!camera(scene) && !!camera(previous) &&
    (previous.visual?.camera?.movement === 'static' || !!camera(previous).end) &&
    JSON.stringify(pose(camera(scene))) === JSON.stringify(pose(camera(previous), true)) &&
    scene.visual?.camera?.framing === previous.visual?.camera?.framing;
  return {
    shotId: scene.id || null, no: index + 1, scope: previous ? link.scope : null,
    previous: previous ? { shotId: previous.id || null, no: link.previous + 1,
      plannedEnd: closing(previous), blockingEnd: (previous.shot?.location?.blocking?.actors || [])
        .map(actor => ({ id: actor.id, ...(actor.end || actor.start) })) } : null,
    opening: scene.shot?.videoDesign?.before || null,
    editContinuity: scene.edit?.continuity || null,
    continuityBreak: scene.shot?.location?.continuityBreak || null,
    observedEnd: endpoint, sameCamera,
    referenceImages: available ? [endpoint.path] : [],
    suggestedFirstFrame: available && sameCamera ? endpoint.path : null,
    evidenceStatus: 'not_reviewed',
  };
}

function sourceGuidance(p, images) {
  if (!p) return [];
  const lines = ['Depict the opening instant BEFORE this shot\'s action. Preserve room for the planned action; do not illustrate its completed result.'];
  if (p.previous) {
    if (p.previous.plannedEnd) lines.push('Preceding related shot, PLANNED closing state: ' + p.previous.plannedEnd);
    if (p.editContinuity) lines.push('Authored connection: ' + p.editContinuity);
    lines.push('Carry world positions, body orientation, gaze and prop contact forward. Resolve a repeated action or omitted move explicitly; a new camera angle changes screen directions, not the world state.');
    if (p.referenceImages.length) lines.push('Attached image ' + (images.indexOf(p.referenceImages[0]) + 1) +
      ' is the captured end of the preceding selected clip, not a character portrait or a planned ending. Use it for actor/prop state and appearance. ' +
      (p.sameCamera ? 'Continue its composition when the authored opening agrees.' : 'The current shot camera controls the new composition; reproject the same world state, rather than copying screen-left/right.'));
  }
  return lines;
}

function check(win, dir) {
  const findings = [], links = connections(win), shots = win.SCENES || [];
  const add = (index, code, what, previous) => findings.push({ level: 'warn', where: 'shot ' + (index + 1) + ' continuity',
    code, shotId: shots[index].id || null, ...(previous === undefined ? {} : { previousShotId: shots[previous].id || null }), what });
  for (const { index, previous, scope } of links) {
    const s = shots[index];
    if (!generated(s)) continue;
    if (vague(s.shot?.videoDesign?.before)) add(index, 'unspecified_opening_state',
      'Opening state is unspecified: describe actor position, orientation, hands and prop contact before the action, not just "before action".');
    if (dir && s.visual?.video?.observedEnd) {
      const end = observed(s, dir);
      if (end.status === 'stale') add(index, 'stale_observed_end', end.reason);
    }
    if (previous === null) continue;
    const a = shots[previous], b = s.shot?.location;
    if (scope !== 'explicit_group' && b) add(index, 'implicit_continuity',
      'Related cuts have no explicit continuityGroup. The connection is inferred for review; author a shared group or an intentional continuityBreak.', previous);
    if (b && (hasActors(s) || hasActors(a)) && (!b.blocking || !a.shot?.location?.blocking)) add(index, 'missing_shared_blocking',
      'Shared actor start/end blocking is absent; location checks cannot verify actor position, gaze, held props or the action axis across this cut.', previous);
    if (!text(s.edit?.continuity)) add(index, 'unspecified_cut_connection',
      'Describe what crosses this cut in edit.continuity: action phase, gaze, prop contact or an intentional time/position skip.', previous);
    if (dir && generated(a) && text(a.visual?.video?.clip) && !a.visual.video.observedEnd)
      add(index, 'uncaptured_predecessor_end',
        'The preceding accepted clip has no captured selected endpoint. Inspect/capture its edited end before authoring this opening; a planned end image is not observed footage.', previous);
    if (camera(s) && camera(a) && JSON.stringify(camera(s)) === JSON.stringify(camera(a)) &&
        text(s.visual?.camera?.framing) && text(a.visual?.camera?.framing) && s.visual.camera.framing !== a.visual.camera.framing)
      add(index, 'shared_camera_different_framing',
        'Different authored framings use the same numerical location camera. Compare the actual reference renders; use a shot camera variant or an intentional crop.', previous);
  }
  return findings;
}

function capture(win, index, dir) {
  const scene = win.SCENES[index], selected = segment(scene, dir);
  const clipSha256 = fileHash(selected.clip), key = binding(scene, selected, clipSha256);
  const stream = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0',
    '-show_entries', 'stream=avg_frame_rate,r_frame_rate,nb_read_frames', '-of', 'json', selected.clip],
  { encoding: 'utf8', timeout: 30000 })).streams?.[0];
  const [num, den] = String(stream?.avg_frame_rate).split('/').map(Number), fps = num / den;
  if (!Number.isFinite(fps) || fps <= 0 || stream.avg_frame_rate !== stream.r_frame_rate)
    throw new Error('capture requires measurable constant-frame-rate footage');
  const frame = Math.ceil((selected.sourceIn + selected.seconds) * fps - 1e-6) - 1;
  const firstFrame = Math.ceil(selected.sourceIn * fps - 1e-6);
  if (!Number.isSafeInteger(Number(stream.nb_read_frames)) || frame < firstFrame || frame < 0 || frame >= Number(stream.nb_read_frames))
    throw new Error('selected segment extends beyond the available source frames');
  const folder = path.join(dir, 'images', 'continuity');
  fs.mkdirSync(folder, { recursive: true });
  const image = path.join(folder, 'shot-' + (index + 1) + '-' + key.slice(0, 16) + '.png');
  const temp = image + '.' + process.pid + '.tmp.png';
  try {
    execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-i', selected.clip, '-an',
      '-vf', 'select=eq(n\\,' + frame + ')', '-frames:v', '1', temp], { timeout: 60000 });
    if (!fs.statSync(temp).size || fileHash(selected.clip) !== clipSha256) throw new Error('source changed during endpoint capture');
    fs.renameSync(temp, image);
  } finally { fs.rmSync(temp, { force: true }); }
  const record = { path: path.relative(dir, image), sha256: fileHash(image), binding: key,
    clip: path.relative(dir, selected.clip), clipSha256, sourceIn: selected.sourceIn, seconds: selected.seconds,
    frame, fps, sourceTime: frame / fps, basis: 'selected_source_segment', review: 'not_reviewed' };
  scene.visual.video.observedEnd = record;
  return record;
}

module.exports = { connections, plan, check, capture, observed, sourceGuidance };
if (require.main === module) (async () => {
  const args = process.argv.slice(2), target = args[0];
  if (!target) throw new Error('usage: shot-continuity.js BOARD [--shot N] [--capture --apply]');
  const file = path.resolve(fs.statSync(target).isDirectory() ? path.join(target, 'scenes.js') : target);
  const dir = path.dirname(file), original = fs.readFileSync(file, 'utf8');
  const win = require('../../_shared/scenes-vm.js').evaluateWindowScript(original, { filename: file });
  const index = args.includes('--shot') ? Number(args[args.indexOf('--shot') + 1]) - 1 : null;
  if (index !== null && (!Number.isInteger(index) || !win.SCENES[index])) throw new Error('select an existing 1-based shot');
  if (args.includes('--apply') && !args.includes('--capture')) throw new Error('--apply requires --capture');
  if (args.includes('--capture')) {
    if (index === null) throw new Error('--capture requires --shot N');
    const result = capture(win, index, dir);
    if (args.includes('--apply')) {
      const { pathToFileURL } = require('node:url');
      const { serializeBoard } = await import(pathToFileURL(path.resolve(__dirname, '../../../server/dist/storyboard.js')).href);
      if (fs.readFileSync(file, 'utf8') !== original) throw new Error('board changed during capture; refresh before applying');
      const header = (original.match(/^(?:\/\/[^\n]*\n)*/)?.[0] || '').split('\n').filter(Boolean);
      const temp = file + '.' + process.pid + '.tmp';
      try { fs.writeFileSync(temp, serializeBoard(win, header)); fs.renameSync(temp, file); }
      finally { fs.rmSync(temp, { force: true }); }
    }
    console.log(JSON.stringify(result, null, 2));
  } else console.log(JSON.stringify(index === null ? { findings: check(win, dir) } : plan(win, index, dir), null, 2));
})().catch(error => { console.error('shot-continuity: ' + error.message); process.exitCode = 1; });
