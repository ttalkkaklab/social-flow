'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const settings = require('./model-settings.js');
const { evaluateWindowScript } = require('./scenes-vm.js');
const { videoSlot, resolveVideoChoice } = require('../storyboard/references/production-mode.js');
const { resolveShotCharacterInputs } = require('../channel/references/character-panels.js');
const { videoLines } = require('../storyboard/references/structure-contract.js');
const { projectSceneCast, sceneSpeechRoute } = require('./scene-cast.js');
const { framePlan, imageReferences, previzHandoff } = require('../storyboard/references/render-routing.js');

// Read image and performance intent before choosing any provider parameter names.
function storyboardInputs(members, scene) {
  const images = members.flatMap(shot => shot.timeline?.images ?? []);
  const frames = members.map(framePlan);
  const temporal = images.some(p => ['start', 'keyframe', 'end'].includes(p.role));
  const reference = scene?.frames === undefined && frames.some(f => f.mode === 'reference') ||
    images.some(p => ['face', 'outfit', 'prop', 'location'].includes(p.role)) ||
    members.some(shot => imageReferences(shot).some(ref => ['video', 'both'].includes(ref.use)));
  return {
    frames: temporal || frames.some(f => f.mode !== 'reference' && (f.start || f.end)),
    opening: frames.some(f => f.start) || images.some(p => p.role === 'start'),
    reference, guide:members.some(card => card.referenceImage), audio: scene?.videoDirection?.audio,
    spoken: members.some(shot => (shot.narration ?? []).some(line =>
      line.tts?.trim() && ['on_screen', 'off_screen'].includes(line.delivery))),
  };
}

// Board media paths are relative to the storyboard. API callers may also pass absolute paths.
function seedanceMedia(shot, members = [shot]) {
  const slot = videoSlot(shot) || {};
  const fields = typeof slot.realFaceInput === 'boolean' ? {realFaceInput:slot.realFaceInput} : {};
  for (const key of ['omniReferenceTaskType', 'referenceVideoPaths', 'referenceVideoUrls', 'referenceVideoTaskIds', 'referenceAudioPaths', 'generateAudio'])
    if (slot[key] !== undefined) fields[key] = slot[key];
  const originals = [...new Set(members.flatMap(card => card.visual?.characterInputs ?? []).map(c => c.faceTaskId ?? c.face?.taskId).filter(Boolean))];
  if (originals.length) {
    if (fields.referenceVideoTaskIds !== undefined &&
        JSON.stringify(fields.referenceVideoTaskIds) !== JSON.stringify(originals))
      throw new Error('character_inputs_mismatch: use the cast’s declared face sources');
    fields.referenceVideoTaskIds = originals;
    fields.realFaceInput = true;
  }
  if (fields.generateAudio === undefined && shot.sound?.audioSource !== 'speech' &&
      shot.sound?.effects?.some(effect => ['auto','native'].includes(effect.delivery)) &&
      (shot.sound.audioSource === 'video' || !(shot.narration || []).some(line => line.tts?.trim())))
    fields.generateAudio = true;
  if (slot.previz?.clip && previzHandoff(shot) === 'reference_video')
    fields.referenceVideoPaths = [...new Set([slot.previz.clip, ...(fields.referenceVideoPaths || [])])];
  return fields;
}

const operationFor = {
  seedance: input => input.spoken || input.reference ? 'reference' : input.frames ? 'image' : input.guide ? 'reference' : 'text',
  veo: input => input.frames ? 'image' : input.reference ? 'reference' : 'text',
  'ltx-desktop-local': input => input.audio || input.spoken ? 'audio' : input.frames || input.opening ? 'image' : 'text',
  'ltx-api': input => input.audio || input.spoken ? 'audio' : 'image',
  'astra-genai': (input, model) => {
    if (input.audio) return input.audio.mode === 'mix' ? 'image' : 'audio';
    if (input.frames || input.opening && !input.spoken) return 'image';
    if (input.reference && input.spoken && model === 'ltx-2.5-22b-distilled') return 'reference';
    return input.reference || input.opening ? 'image' : 'text';
  },
};

function selectOperation(choice, members, scene) {
  if (choice.operation || !Object.hasOwn(operationFor, choice.engine)) return choice;
  const inputs = storyboardInputs(members, scene);
  if (choice.engine === 'seedance' && members.some(shot => {
    const media = seedanceMedia(shot);
    return media.omniReferenceTaskType || media.referenceVideoPaths?.length || media.referenceVideoUrls?.length || media.referenceVideoTaskIds?.length || media.referenceAudioPaths?.length;
  })) inputs.reference = true;
  return { ...choice, operation: operationFor[choice.engine](inputs, choice.model) };
}

// Older cards stored subject paths on the video settings. Normalize once so
// operation selection, shot binding and scene projection see identical inputs.
function withLegacyReferences(shot) {
  const visual = shot.visual;
  if (!visual || visual.references !== undefined) return shot;
  const references = imageReferences(shot);
  if (!references.length) return shot;
  const plan = framePlan(shot);
  const frames = visual.frames ?? (plan.start || plan.end ? plan : { mode: 'reference' });
  return { ...shot, visual: { ...visual, frames, references } };
}

const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

class MissingSceneDirection extends Error {
  constructor(members, selection, board) {
    super('scene_video_direction_missing: author videoDirection with story_scene');
    Object.assign(this, { members, selection, board });
  }
}

function readVideoContext(episode, shotId, sceneNo, selectionOnly = false) {
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
  const storedMembers = sceneNo === undefined ? scenes.filter(s => String(s.id ?? s.shot?.id) === shotId)
    : scenes.filter(s => s.scene === sceneNo);
  if (sceneNo === undefined && storedMembers.length !== 1) throw new Error('shotId must identify exactly one storyboard shot');
  let scene = sceneNo === undefined ? undefined : board.STRUCTURE?.scenes?.find(s => s.no === sceneNo);
  if (scene?.speakers !== undefined && scene.frames === undefined) scene = {...scene,frames:{}};
  if (sceneNo !== undefined && (!scene || !storedMembers.length)) throw new Error('sceneNo must identify a storyboard scene with shots');
  const choice = s => resolveVideoChoice(production, s, snapshot?.config.models.video);
  const { selection: savedSelection, source } = choice(storedMembers[0]);
  const owner = scene ?? (selectionOnly && board.STRUCTURE?.scenes?.find(s => s.no === storedMembers[0].scene));
  const speechRoute = owner && sceneSpeechRoute(owner, scene ? storedMembers : scenes.filter(card => card.scene === owner.no),
    savedSelection);
  if (scene && speechRoute?.external) {
    // Keep the original off-screen ownership on the board. The picture has no speaking mouth.
    for (let i = 0; i < storedMembers.length; i++)
      storedMembers[i] = {...storedMembers[i], narration:storedMembers[i].narration?.map(line =>
        line.delivery === 'off_screen' ? {...line,delivery:'voiceover'} : line)};
  }
  const sourceCards = storedMembers.map(raw => Object.hasOwn(operationFor, savedSelection.engine) ? withLegacyReferences(raw) : raw);
  const cast = scene && projectSceneCast(scene, sourceCards, board, path.join(root,'storyboard'), savedSelection.engine, speechRoute?.operation === 'audio');
  if (cast) scene = {...scene, videoDirection:cast.direction};
  const members = (cast?.members ?? sourceCards).map(shotWithRefs => {
    const raw = shotWithRefs;
    const seedance = savedSelection.engine === 'seedance';
    const keepCast = (selectionOnly && seedance) && !raw.visual?.characterInputs || cast && savedSelection.engine === 'astra-genai';
    let shot = keepCast ? raw : resolveShotCharacterInputs(raw, path.join(root, 'storyboard'), seedance, board.SB_DOC?.characters, cast?.speakers);
    if (savedSelection.engine === 'seedance' && ['quote', 'broll'].includes(shot.type)) {
      const slot = videoSlot(shot);
      if (slot) shot = { ...shot, visual: { ...shot.visual, video:slot } };
    }
    const frames = shot.visual?.frames;
    if (scene && frames?.start && !frames.end && frames.mode === 'reference' && speechRoute.operation !== 'reference')
      shot = {...shot, visual:{...shot.visual,frames:{...frames,mode:'first'}}};
    if (scene && scene.frames === undefined && !raw.timeline && frames?.start && !frames.end && frames.mode !== 'reference' && speechRoute.operation === 'reference')
      shot = {...shot, visual:{...shot.visual,frames:{...frames,mode:'reference'}}};
    return shot;
  });
  if (scene?.frames !== undefined && savedSelection.engine !== 'astra-genai') {
    const identities = new Map();
    for (const member of members) for (const ref of member.visual?.references ?? []) {
      if (ref.character && cast.speakers.includes(ref.character) && ref.use !== 'image') {
        const file = path.resolve(root, 'storyboard', ref.path);
        if (!identities.has(file)) identities.set(file, {...ref,scope:'scene'});
      }
    }
    for (const member of members) {
      const local = (member.visual?.references ?? []).filter(ref => !ref.character || ref.use === 'image');
      member.visual = {...member.visual, references:[...identities.values(), ...local]};
    }
    if (scene.videoDirection) {
      scene.videoDirection = {...scene.videoDirection, openingPositions:scene.videoDirection.openingPositions.map(row => ({
        ...row, images:[...identities.values()].flatMap((ref, i) => ref.character === row.character ? [i + 1] : [])
      }))};
    }
  }
  const first = members[0];
  let selection = speechRoute ? {...savedSelection,operation:speechRoute.operation} : selectOperation(savedSelection, members, scene);
  let shot = first;
  let timed = false;
  // Older single-card scenes retain their original camera and duration calculation.
  const legacyCard = scene && !scene.videoDirection && scene.speakers === undefined && !board.STORY?.authoring &&
    members.length === 1 && !first.timeline && !first.visual?.frames?.keyframes && !first.visual?.frames?.storyboardKeyframes;
  if (scene && !legacyCard) {
    if (members.some(s => s.shot?.render?.mode && s.shot.render.mode !== 'generated_video'))
      throw new Error('scene_video_mixed_media: keep non-generated material on its authored edit route');
    if (members.some(s => JSON.stringify(choice(s).selection) !== JSON.stringify(savedSelection)))
      throw new Error('scene_video_selection_conflict: the scene members select different video models or operations');
    if (members.some(s => !s.id || !Number.isFinite(s.duration) || s.duration <= 0))
      throw new Error('scene_video_timing: each member needs a stable shot id and a positive duration');
    if (!scene.videoDirection) throw new MissingSceneDirection(members, selection, board);
    const visual = first.visual ?? {};
    const positions = scene.videoDirection.openingPositions;
    if (!Array.isArray(positions)) throw new Error('openingPositions: describe each character in the opening frame');
    const people = [...new Set(members.flatMap(s => [s.visual?.character ?? [], s.visual?.bystanders ?? []].flat()
      .map(c => typeof c === 'string' ? c : c.id)))];
    for (const id of (scene.frames !== undefined ? cast.speakers : people)) if (!positions.some(p => p.character === id))
      throw new Error('openingPositions: describe where ' + id + ' starts, including an off-screen start');
    timed = Boolean(scene.frames !== undefined || members.some(s => s.referenceImage) || members.length > 1 || scene.videoDirection.audio || scene.videoDirection.keyframes?.length || scene.videoDirection.oneTake || scene.videoDirection.fps ||
      members.some(s => s.timeline || s.visual?.frames?.keyframes || s.visual?.frames?.storyboardKeyframes));
    const pinned = !scene.videoDirection.audio && selection.engine === 'astra-genai' && selection.model === 'ltx-2.5-22b-distilled' &&
      ['reference','image',undefined].includes(selection.operation);
    const authoredFrames = framePlan(first);
    const opening = scene.frames?.start ?? first.timeline?.images?.find(p => p.role === 'start')?.path ?? authoredFrames.start;
    if (!timed && !opening && !['text','audio'].includes(selection.operation) && !(['veo', 'seedance'].includes(selection.engine) && selection.operation === 'reference')) throw new Error('scene_video_opening_required: select the first member’s opening image');
    if (scene.videoOpeningSha256 && (opening || scene.frames === undefined)) {
      if (!opening) throw new Error('openingPositions stale: the legacy scene opening is missing');
      const bytes = fs.readFileSync(path.resolve(root, 'storyboard', opening));
      if (crypto.createHash('sha256').update(bytes).digest('hex') !== scene.videoOpeningSha256)
        throw new Error('openingPositions stale: inspect the new opening frame and update story_scene.videoDirection');
    }
    // A timed scene maps each original member in the planner. Only legacy single shots use this projection.
    const frames = pinned && !timed && visual.frames?.mode === 'reference' ? { mode: 'first', start: opening }
      : visual.frames ?? (!timed && (opening || authoredFrames.end) ? authoredFrames : selection.engine === 'seedance' ? undefined : {});
    const refs = [...(visual.references ?? [])];
    let references = refs;
    if (pinned && !timed) {
      if (references.some(ref => ref.role !== 'background' && ['both', 'video'].includes(ref.use))) {
        references = references.filter(ref => ref.role !== 'background' || ref.use === 'image');
        references.push({id:'scene-opening-background',path:frames.start,role:'background',use:'video',purpose:'Opening setting and landmark positions.'});
      }
    }
    if (frames?.mode === 'reference' && frames.start && !['astra-genai', 'minimax', 'heygen', 'veo', 'seedance'].includes(selection.engine) &&
        !references.some(ref => ref.path === frames.start && ['video', 'both'].includes(ref.use))) {
      references.push({id:'scene-opening-frame',path:frames.start,role:'background',use:'video',purpose:'Opening composition and character positions.'});
    }
    shotId = first.id;
    shot = { ...first, duration: members.reduce((seconds, s) => seconds + s.duration, 0),
      narration: members.flatMap(require('../storyboard/references/scene-direction.js').orderedSpeech), performance: undefined, edit: undefined,
      visual: { ...visual, frames, ...(references.length || visual.references !== undefined || selection.operation !== 'text' && !(selection.engine === 'seedance' && selection.operation === 'reference') ? {references} : {}), lastImagePath: undefined, imagePair: undefined, video: { ...visual.video, lastImagePath: undefined, referenceImagePaths: undefined, promptSource: undefined, prompt: undefined,
        speakerBindings: undefined, openingPositions: positions, openingImageSha256: undefined } } };
  }
  if (legacyCard) shotId = first.id;
  const overrides = production.modelSettings?.overrides || [];
  // A retired engine loads here so video_plan can refuse it as video_engine_unsupported.
  for (const change of overrides) if (change.video) settings.validateModels({ video: change.video }, true, true);
  // Silent pictures and inner thoughts use I2V in an MSR project (2026-11-09), and likewise on the hosted
  // reference lanes (MiniMax, HeyGen) and the LTX API's audio lane, which only spoken shots take.
  const spoken = (shot.narration || []).filter(line => typeof line.tts === 'string' && line.tts.trim());
  const speechOnly = ['astra-genai', 'minimax', 'heygen'].includes(selection.engine) && selection.operation === 'reference' ||
    selection.engine === 'ltx-api' && selection.operation === 'audio';
  if (!speechRoute && speechOnly && !scene?.videoDirection?.audio &&
      !spoken.some(line => line.delivery === 'on_screen' || line.delivery === 'off_screen'))
    selection = { ...selection, operation: 'image' };
  if (snapshot || source.endsWith('_override')) settings.validateModels({ video: speechRoute ? savedSelection : selection }, true, true);
  const media = selection.engine === 'seedance' ? seedanceMedia(shot,members) : {};
  const opening = scene?.frames !== undefined ? scene.frames.start : framePlan(first).start ||
    first.timeline?.images?.find(pin => pin.role === 'start' && pin.frame === 0)?.path;
  return { episode: root, shotId, selection, source, ...(speechRoute ? {speechRoute:{...speechRoute,opening}} : {}), snapshotRevision: snapshot?.revision || null,
    ...(scene ? {sceneNo, sceneOwnsFrames:scene.frames !== undefined, timed, shotIds: members.map(s => s.id), sceneDirection: scene.videoDirection, sceneMembers: members} : {}),
    revision: hash({ ...(Object.keys(media).length ? {seedanceMedia:media} : {}), ...(scene ? {sceneNo, speakers:scene.speakers, direction: scene.videoDirection, directionDefaults:scene.directionDefaults, members} : {}), selection, source, snapshotRevision: snapshot?.revision, overrides, imagePlan: { characterInputs:shot.visual?.characterInputs, frames: shot.visual?.frames, references: shot.visual?.references, bg: shot.visual?.bg }, shotPrompt: shot.visual?.video?.prompt, shotLines: videoLines(shot), authorization: production.videoAuthorization,
      budget: production.videoBudgetUsd, approval: production.approval, maxAttempts: production.maxAttempts }),
    lines: videoLines(shot), production, board, shot };
}
module.exports = { readVideoContext, MissingSceneDirection, selectOperation, seedanceMedia };
