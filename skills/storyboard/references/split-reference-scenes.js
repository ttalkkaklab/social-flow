'use strict';

const path = require('node:path');
const { referenceOwners, sceneReferenceGroups, referenceConflict, castIds } = require('../../_shared/scene-references.js');
const { readVideoSnapshot } = require('../../_shared/video-selection.js');
const { resolveVideoChoice } = require('./production-mode.js');
const { orderedSpeech } = require('./scene-direction.js');
const { framePlan } = require('./render-routing.js');

const spoken = cards => [...new Set(cards.flatMap(orderedSpeech).filter(line => line.tts?.trim()).map(line => line.speaker).filter(Boolean))];

function localTimeline(timeline, offset, first) {
  if (!timeline) return;
  const shift = rows => rows.map(row => ({...row, frame:row.frame - offset}));
  return {...timeline, startFrame:timeline.startFrame - offset, endFrame:timeline.endFrame - offset,
    transition:first ? 'open' : timeline.transition,
    ...(timeline.images ? {images:shift(timeline.images)} : {}),
    ...(timeline.dialogueCues ? {dialogueCues:shift(timeline.dialogueCues)} : {})};
}

function rebaseStoryboardKeyframes(visual, shotStart, offset, fps) {
  const frames = visual?.frames;
  if (!frames?.storyboardKeyframes || frames.keyframes !== undefined) return visual;
  const storyboardKeyframes = frames.storyboardKeyframes.map(pin => {
    if (pin.startFrame === undefined) return pin;
    const frame = pin.startFrame < shotStart && pin.startSeconds !== undefined
      ? shotStart + Math.round(pin.startSeconds * fps) : pin.startFrame;
    return {...pin, startFrame:frame - offset};
  });
  return {...visual, frames:{...frames, storyboardKeyframes}};
}

function splitOpening(card) {
  return card.timeline?.images?.find(pin => pin.role === 'start')?.path ?? card.referenceImage ??
    (framePlan(card).start || undefined);
}

function bindBoundaryFrame(part, card, role, pin, sceneOwnsFrames) {
  const images = card.timeline?.images ?? [];
  const sameFrame = image => image.frame === pin.frame && ['start','end','keyframe'].includes(image.role);
  const previous = sceneOwnsFrames ? part.frames?.[role] : framePlan(card)[role];
  if (previous && previous !== pin.path || images.some(image => sameFrame(image) && image.path !== pin.path))
    throw new Error('scene_image_conflict: split ' + role + ' of ' + card.id + ' has two different pictures');
  if (sceneOwnsFrames) {
    part.frames ??= {};
    part.frames[role] = pin.path;
  }
  if (card.timeline && (!sceneOwnsFrames || images.some(sameFrame))) {
    card.timeline = {...card.timeline, images:[...images.filter(image => !sameFrame(image)), {...pin, role}]};
  } else if (!sceneOwnsFrames) {
    const frames = {...card.visual?.frames, [role]:pin.path};
    frames.mode = role === 'end' || framePlan(card).end ? 'first_last' : frames.mode ?? 'first';
    card.visual = {...card.visual, frames};
  }
}

function assignGroups(scene, groups, cards, numbers) {
  const fps = scene.videoDirection?.fps ?? 24;
  const sceneOwnsFrames = scene.frames !== undefined || scene.speakers !== undefined;
  let seconds = 0;
  const byId = new Map(cards.map(card => {
    const start = card.timeline?.startFrame ?? Math.round(seconds * fps);
    seconds += card.duration ?? 0;
    return [card.id, {card, start}];
  }));
  return groups.map((group, index) => {
    const members = group.shotIds.map(id => byId.get(id).card);
    const first = members[0], offset = byId.get(first.id).start;
    if (index && first.timeline?.transitionCue)
      throw new Error('scene_split_transition: ' + first.id + ' needs its preceding shot for the authored transition cue.');
    const nextId = groups[index + 1]?.shotIds[0], end = nextId ? byId.get(nextId).start : Infinity;
    const last = index === groups.length - 1;
    const no = numbers[index];
    const part = {...scene, no};
    if (index) part.referenceSplitFrom = scene.referenceSplitFrom ?? scene.no;
    if (!last) { delete part.out; delete part.turn; }
    const lines = spoken(members);
    if (scene.speakers) part.speakers = [...new Set([...scene.speakers.filter(id => lines.includes(id)), ...lines])];
    if (scene.speakerReferences) part.speakerReferences = scene.speakerReferences.filter(ref => group.characters.includes(ref.character));
    const start = index === 0 ? scene.frames?.start : splitOpening(first);
    if (scene.frames !== undefined || sceneOwnsFrames && start) part.frames = {...(start ? {start} : {}), ...(last && scene.frames?.end ? {end:scene.frames.end} : {})};
    if (index) delete part.videoOpeningSha256;
    if (scene.videoDirection) {
      const dir = {...scene.videoDirection};
      // A shot's own blocking describes its opening. Positions from the original scene can only describe its first frame.
      const marks = index ? first.timeline?.openingPositions ?? first.visual?.video?.openingPositions ?? [] : dir.openingPositions;
      const staged = new Set([...group.characters, ...castIds(first.visual?.bystanders)]);
      dir.openingPositions = (marks ?? []).filter(row => staged.has(row.character));
      const interior = [];
      for (const pin of dir.keyframes ?? []) {
        if (pin.frame < offset || pin.frame >= end) continue;
        if (index && pin.frame === offset) bindBoundaryFrame(part, first, 'start', pin, sceneOwnsFrames);
        else if (!last && pin.frame === end - 1) bindBoundaryFrame(part, members.at(-1), 'end', pin, sceneOwnsFrames);
        else interior.push({...pin, frame:pin.frame - offset});
      }
      if (interior.length) dir.keyframes = interior;
      else delete dir.keyframes;
      delete dir.promptDrafts;
      part.videoDirection = dir;
    }
    for (const card of members) {
      card.scene = no;
      if (!index) continue;
      if (card.timeline) card.timeline = localTimeline(card.timeline, offset, card === first);
      const visual = rebaseStoryboardKeyframes(card.visual, byId.get(card.id).start, offset, fps);
      if (visual !== card.visual) card.visual = visual;
    }
    return part;
  });
}

function waitingForCast(scene, cards) {
  return scene.speakerReferences?.length && cards.some(card => card.visual?.character === undefined &&
    card.visual?.characters === undefined && !card.timeline?.images?.some(pin => pin.character) && !spoken([card]).length);
}

function usesGenai(board, cards, saved) {
  return cards.length && cards.every(card => {
    if (card.shot?.render?.mode && card.shot.render.mode !== 'generated_video') return false;
    try { return resolveVideoChoice(board.PRODUCTION ?? {}, card, saved).selection.engine === 'astra-genai'; }
    catch { return false; } // Incomplete legacy outlines have no selected video engine.
  });
}

function renumberSceneNotes(board, numbers) {
  const globals = {};
  if (board.SB_DOC) {
    const notes = {...board.SB_DOC};
    for (const key of ['sceneNotes', 'audioNotes', 'privacy']) {
      const value = notes[key];
      if (value && typeof value === 'object' && !Array.isArray(value))
        notes[key] = Object.fromEntries(Object.entries(value).map(([id, entry]) => [numbers.get(Number(id)) ?? id, entry]));
    }
    if (JSON.stringify(notes) !== JSON.stringify(board.SB_DOC)) globals.SB_DOC = notes;
  }
  if (Array.isArray(board.CLICHES?.uses)) {
    const uses = board.CLICHES.uses.map(use => Array.isArray(use?.scenes)
      ? {...use, scenes:use.scenes.map(no => numbers.get(no) ?? no)} : use);
    if (JSON.stringify(uses) !== JSON.stringify(board.CLICHES.uses)) globals.CLICHES = {...board.CLICHES, uses};
  }
  return globals;
}

// Called inside the storyboard's compare-and-rename transaction. Shot order and IDs never change.
function splitReferenceScenes(board, previous, boardDir, includeExisting = false) {
  if (!board.STRUCTURE?.scenes?.length || !board.SCENES?.length) return [];
  const structure = board.STRUCTURE;
  const saved = readVideoSnapshot(path.dirname(boardDir))?.config.models.video;
  const registry = referenceOwners(board, boardDir);
  const findings = [];
  let nextNo = Math.max(...structure.scenes.map(scene => scene.no)) + 1;
  const scenes = [], sequences = structure.sequences.map(seq => ({...seq, scenes:[...seq.scenes]}));
  const referenced = new Set(structure.scenes.map(scene => scene.referenceSplitFrom).filter(Boolean));
  for (const original of structure.scenes) {
    const cards = board.SCENES.filter(card => card.scene === original.no);
    if (!usesGenai(board, cards, saved)) { scenes.push(original); continue; }
    let scene = original;
    const prior = previous.STRUCTURE?.scenes?.find(row => row.no === scene.no);
    const before = (previous.SCENES ?? []).filter(card => card.scene === scene.no);
    if ((scene.referenceSplitFrom || referenced.has(scene.no)) && scene.speakers && JSON.stringify(spoken(before)) !== JSON.stringify(spoken(cards)))
      scene = {...scene, speakers:spoken(cards)};
    // The outline declares faces before its cards have cast assignments. Wait for those assignments before distributing them.
    if (!includeExisting && waitingForCast(scene, cards)) {
      scenes.push(scene);
      continue;
    }
    const groups = sceneReferenceGroups(scene, cards, registry);
    const conflict = referenceConflict(scene, groups);
    if (!conflict) { scenes.push(scene); continue; }
    // An unrelated edit does not recut an archived board. An explicit repair can apply the same split.
    if (!includeExisting && prior && usesGenai(previous, before, saved) && !waitingForCast(prior, before) && JSON.stringify(groups) === JSON.stringify(sceneReferenceGroups(prior, before, referenceOwners(previous, boardDir))) &&
        prior.videoDirection?.oneTake === scene.videoDirection?.oneTake) {
      scenes.push(scene);
      continue;
    }
    // Do not duplicate a continuous track across takes. Its editor must supply each scene's audio.
    if (!conflict.splitBefore.length || scene.videoDirection?.audio) {
      const message = scene.videoDirection?.audio ? conflict.message + ' Divide the scene-length audio at the same cut before regrouping.' : conflict.message;
      findings.push({level:'bad', where:String(conflict.shotId), what:message, ...conflict});
      scenes.push(scene);
      continue;
    }
    if (!includeExisting) {
      findings.push({...conflict, level:'warn', where:'scene ' + scene.no,
        what:'The selected model cannot voice this scene in one request. The storyboard keeps its original shots.'});
      scenes.push(scene);
      continue;
    }
    if (scene.videoDirection?.prompt?.trim()) {
      findings.push({...conflict, level:'bad', code:'scene_split_prompts', where:String(conflict.shotId),
        what:'Split before ' + conflict.splitBefore.join(', ') + ' with story_scene.split and supply a complete prompt for each part.'});
      scenes.push(scene);
      continue;
    }
    require('../../_shared/scene-cast.js').sceneCast(scene, cards);
    const numbers = groups.map((_, i) => i ? nextNo++ : scene.no);
    const parts = assignGroups(scene, groups, cards, numbers);
    scenes.push(...parts);
    for (const seq of sequences) {
      const index = seq.scenes.indexOf(scene.no);
      if (index === -1) continue;
      seq.scenes.splice(index, 1, ...numbers);
      if (seq.payoff === scene.no) seq.payoff = numbers[numbers.length - 1];
    }
    findings.push({level:'warn', code:'scene_reference_split', where:'scene ' + scene.no,
      what:'Split before ' + conflict.splitBefore.join(', ') + ' to keep two speaking characters per GenAI scene. Inspect each new opening.',
      groups:groups.map((group, i) => ({sceneNo:numbers[i], ...group}))});
  }
  if (scenes.length === structure.scenes.length) {
    board.STRUCTURE = {...structure, scenes, sequences};
    return findings;
  }
  const order = [...new Set([...sequences.flatMap(sequence => sequence.scenes), ...scenes.map(scene => scene.no)])];
  const numbers = new Map(order.map((no, index) => [no, index + 1]));
  const noFor = no => numbers.get(no) ?? no;
  board.SCENES = board.SCENES.map(card => card.scene === undefined ? card : {...card, scene:noFor(card.scene)});
  board.STRUCTURE = {...structure,
    scenes:scenes.map(scene => ({...scene, no:noFor(scene.no),
      ...(scene.referenceSplitFrom ? {referenceSplitFrom:noFor(scene.referenceSplitFrom)} : {})})).sort((a,b) => a.no - b.no),
    sequences:sequences.map(sequence => ({...sequence, scenes:sequence.scenes.map(noFor),
      ...(sequence.payoff !== undefined ? {payoff:noFor(sequence.payoff)} : {})}))};
  Object.assign(board, renumberSceneNotes(board, numbers));
  for (const finding of findings) {
    if (finding.code !== 'scene_reference_split') continue;
    finding.groups = finding.groups.map(group => ({...group, sceneNo:noFor(group.sceneNo)}));
    finding.where = 'scene ' + finding.groups[0].sceneNo;
  }
  return findings;
}

module.exports = {splitReferenceScenes, renumberSceneNotes, rebaseStoryboardKeyframes, splitOpening};
