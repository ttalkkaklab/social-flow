'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const settings = require('./model-settings.js');
const { evaluateWindowScript } = require('./scenes-vm.js');
const { videoLines } = require('../storyboard/references/structure-contract.js');
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

function readVideoContext(episode, shotId, sceneNo) {
  const root = fs.realpathSync(episode);
  const boardFile = path.join(root, 'storyboard/scenes.js');
  const board = fs.existsSync(boardFile) ? evaluateWindowScript(fs.readFileSync(boardFile, 'utf8'), { filename: boardFile }) : {};
  const production = board.PRODUCTION || {};
  const snapshotFile = path.join(root, settings.SNAPSHOT_FILE);
  let snapshot;
  if (fs.existsSync(snapshotFile)) {
    snapshot = JSON.parse(fs.readFileSync(snapshotFile, 'utf8'));
    settings.validateConfig(snapshot.config, true);
    if (snapshot.version !== 1 || snapshot.revision !== hash(snapshot.config) || typeof snapshot.source !== 'string')
      throw new Error('Invalid episode model snapshot');
  }
  const scenes = board.SCENES || [];
  const members = sceneNo === undefined ? scenes.filter(s => String(s.id ?? s.shot?.id) === shotId)
    : scenes.filter(s => s.scene === sceneNo);
  if (sceneNo === undefined && members.length !== 1) throw new Error('shotId must identify exactly one storyboard shot');
  const first = members[0];
  const scene = sceneNo === undefined ? undefined : board.STRUCTURE?.scenes?.find(s => s.no === sceneNo);
  if (sceneNo !== undefined && (!scene || !first)) throw new Error('sceneNo must identify a storyboard scene with shots');
  const { resolveVideoChoice } = require('../storyboard/references/production-mode.js');
  const choice = s => resolveVideoChoice(production, s, snapshot?.config.models.video);
  let { selection, source } = choice(first);
  let shot = first;
  if (scene) {
    if (!scene.videoDirection) throw new Error('scene_video_direction_missing: author videoDirection with story_scene');
    if (members.some(s => s.shot?.render?.mode && s.shot.render.mode !== 'generated_video'))
      throw new Error('scene_video_mixed_media: keep non-generated material on its authored edit route');
    if (members.some(s => JSON.stringify(choice(s).selection) !== JSON.stringify(selection)))
      throw new Error('scene_video_selection_conflict: the scene members select different video models or operations');
    if (members.some(s => !s.id || !Number.isFinite(s.duration) || s.duration <= 0))
      throw new Error('scene_video_timing: each member needs a stable shot id and a positive duration');
    const visual = first.visual ?? {};
    const positions = scene.videoDirection.openingPositions;
    if (!Array.isArray(positions)) throw new Error('openingPositions: describe each character in the opening frame');
    const people = [...new Set(members.flatMap(s => [s.visual?.character ?? [], s.visual?.bystanders ?? []].flat()
      .map(c => typeof c === 'string' ? c : c.id)))];
    for (const id of people) if (!positions.some(p => p.character === id))
      throw new Error('openingPositions: describe where ' + id + ' starts, including an off-screen start');
    const pinned = selection.engine === 'astra-genai' && selection.model === 'ltx-2.5-22b-distilled' &&
      ['reference','image',undefined].includes(selection.operation);
    if (pinned) selection = { ...selection, operation: 'image' };
    else if (!selection.operation && selection.engine !== 'host') {
      selection = { ...selection, operation: visual.frames?.mode === 'reference' ? 'reference' : 'image' };
    }
    if (!visual.frames?.start) throw new Error('scene_video_opening_required: select the first member’s opening image');
    if (scene.videoOpeningSha256) {
      const bytes = fs.readFileSync(path.resolve(root, 'storyboard', visual.frames.start));
      if (crypto.createHash('sha256').update(bytes).digest('hex') !== scene.videoOpeningSha256)
        throw new Error('openingPositions stale: inspect the new opening frame and update story_scene.videoDirection');
    }
    const frames = pinned && visual.frames.mode === 'reference' ? { mode: 'first', start: visual.frames.start } : { ...visual.frames };
    // Only the last member can constrain the ending of a multi-shot scene.
    const last = members[members.length - 1].visual?.frames;
    if (members.length > 1) {
      delete frames.storyboardKeyframes;
      delete frames.keyframes;
      delete frames.end;
      if (frames.mode === 'first_last') frames.mode = 'first';
      if (last?.mode === 'first_last' && last.end) Object.assign(frames, {mode:'first_last', end:last.end});
    }
    const refs = [...(visual.references ?? [])];
    for (const member of members.slice(1)) {
      for (const ref of member.visual?.references ?? []) {
        if (ref.role === 'character' && ['video','both'].includes(ref.use) &&
            !refs.some(r => r.path === ref.path && ['video','both'].includes(r.use))) refs.push(ref);
      }
    }
    let references = refs;
    if (pinned) {
      const principals = positions.filter(p => p.images?.length).sort((a,b) => Math.min(...a.images) - Math.min(...b.images));
      if (principals.length && fs.existsSync(path.join(root, 'storyboard/cast.json'))) {
        const { canonicalReferences } = require('../channel/references/character-panels.js');
        const panels = canonicalReferences(path.join(root, 'storyboard'), first.id, principals.map(p => p.character), 'video',
          {combined: visual.video?.referenceLayout === 'combined'});
        for (const row of principals) {
          const owned = panels.flatMap((r,i) => ['face','front','back','msr'].some(v => r.id === first.id+'-'+row.character+'-'+v) ? [i+1] : []);
          if (JSON.stringify([...row.images].sort()) !== JSON.stringify(owned))
            throw new Error('openingPositions: '+row.character+' owns Image '+owned.join(', '));
        }
        references = [...panels, ...refs.filter(ref => ref.role !== 'character' && !panels.some(panel => panel.id === ref.id || panel.path === ref.path))];
      }
      if (references.some(ref => ref.role !== 'background' && ['both', 'video'].includes(ref.use))) {
        references = references.filter(ref => ref.role !== 'background' || ref.use === 'image');
        references.push({id:'scene-opening-background',path:frames.start,role:'background',use:'video',purpose:'Opening setting and landmark positions.'});
      }
    }
    if (frames.mode === 'reference' && !['astra-genai', 'minimax', 'heygen'].includes(selection.engine) &&
        !references.some(ref => ref.path === frames.start && ['video', 'both'].includes(ref.use))) {
      references.push({id:'scene-opening-frame',path:frames.start,role:'background',use:'video',purpose:'Opening composition and character positions.'});
    }
    shotId = first.id;
    shot = { ...first, duration: members.reduce((seconds, s) => seconds + s.duration, 0),
      narration: members.flatMap(s => s.narration ?? []), performance: undefined, edit: undefined,
      visual: { ...visual, frames, references, lastImagePath: undefined, imagePair: undefined, video: { ...visual.video, lastImagePath: undefined, referenceImagePaths: undefined, promptSource: undefined, prompt: undefined,
        speakerBindings: undefined, openingPositions: positions, openingImageSha256: undefined } } };
  }
  const overrides = production.modelSettings?.overrides || [];
  // A retired engine loads here so video_plan can refuse it as video_engine_unsupported.
  for (const change of overrides) if (change.video) settings.validateModels({ video: change.video }, true, true);
  if (snapshot || source.endsWith('_override')) settings.validateModels({ video: selection }, true, true);
  // Silent pictures and inner thoughts use I2V in an MSR project (2026-11-09), and likewise on the hosted
  // reference lanes (MiniMax, HeyGen) and the LTX API's audio lane, which only spoken shots take.
  const spoken = (shot.narration || []).filter(line => typeof line.tts === 'string' && line.tts.trim());
  const speechOnly = ['astra-genai', 'minimax', 'heygen'].includes(selection.engine) && selection.operation === 'reference' ||
    selection.engine === 'ltx-api' && selection.operation === 'audio';
  if (speechOnly &&
      !spoken.some(line => line.delivery === 'on_screen' || line.delivery === 'off_screen'))
    selection = { ...selection, operation: 'image' };
  return { episode: root, shotId, selection, source, snapshotRevision: snapshot?.revision || null,
    ...(scene ? {sceneNo, shotIds: members.map(s => s.id), sceneDirection: scene.videoDirection, sceneMembers: members} : {}),
    revision: hash({ ...(scene ? {sceneNo, direction: scene.videoDirection, members} : {}), selection, source, snapshotRevision: snapshot?.revision, overrides, imagePlan: { frames: shot.visual?.frames, references: shot.visual?.references, bg: shot.visual?.bg }, shotPrompt: shot.visual?.video?.prompt, shotLines: videoLines(shot), authorization: production.videoAuthorization,
      budget: production.videoBudgetUsd, approval: production.approval, maxAttempts: production.maxAttempts }),
    lines: videoLines(shot), production, board, shot };
}
module.exports = { readVideoContext };
