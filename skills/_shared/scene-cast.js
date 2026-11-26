'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { orderedSpeech } = require('../storyboard/references/scene-direction.js');

// Keep the cast registry order stable across cuts, including off-screen replies.
function sceneSpeech(scene, cards, planning = false) {
  const lines = cards.flatMap(card => orderedSpeech(card).filter(line => line.tts?.trim()).map(line => ({card, line})));
  const spoken = new Set(), physical = new Set();
  const declared = scene.speakers;
  if (declared !== undefined && (!Array.isArray(declared) ||
      declared.some(id => typeof id !== 'string' || !id.trim()) || new Set(declared).size !== declared.length))
    throw new Error('scene_speaker_mismatch: list each speaker once by cast ID in scene ' + scene.no);
  for (const {card, line} of lines) {
    if (!line.speaker) {
      if (planning || declared || line.delivery === 'on_screen' || line.delivery === 'off_screen')
        throw new Error('scene_speaker_missing: identify the speaker in ' + card.id + ' ' + (line.id || line.tts));
      continue;
    }
    if (planning && !['on_screen','off_screen','voiceover'].includes(line.delivery))
      throw new Error('scene_speaker_delivery: identify the delivery of ' + line.speaker + ' in ' + card.id);
    if (line.voiceoverKind === 'inner_thought' && line.delivery !== 'voiceover')
      throw new Error('scene_speaker_delivery: inner thought ' + (line.id || line.speaker) + ' requires voiceover delivery');
    spoken.add(line.speaker);
    if (declared && !declared.includes(line.speaker)) {
      throw new Error('scene_speaker_mismatch: scene ' + scene.no + ', shot ' + card.id + ', line ' +
        (line.id || line.tts) + ' names undeclared speaker ' + line.speaker);
    }
    if (line.delivery !== 'voiceover') physical.add(line.speaker);
  }
  if (scene.speakerReferences !== undefined && !Array.isArray(scene.speakerReferences))
    throw new Error('scene_reference_owner: list the scene references by cast ID');
  if (scene.speakerReferences?.length) {
    const staged = new Set([...spoken, ...(declared ?? []), ...(scene.videoDirection?.openingPositions ?? []).map(row => row.character)]);
    for (const card of cards) {
      for (const id of [...castIds(card.visual?.character ?? card.visual?.characters), ...castIds(card.visual?.bystanders)]) staged.add(id);
      for (const item of [...(card.timeline?.images ?? []), ...(card.timeline?.openingPositions ?? []), ...(card.visual?.video?.openingPositions ?? []), ...(card.visual?.references ?? []), ...(card.visual?.characterInputs ?? [])])
        if (item.character) staged.add(item.character);
    }
    // Scene references can be declared before story_shot and shot_characters fill the cards.
    const castAssigned = cards.length > 0 && cards.every(card => card.visual?.character !== undefined || card.visual?.characters !== undefined);
    const owners = new Set();
    for (const ref of scene.speakerReferences) {
      if (!ref?.path || !ref.character || owners.has(ref.character))
        throw new Error('scene_reference_owner: each scene reference needs a path and a distinct cast ID');
      if ((planning || castAssigned) && !staged.has(ref.character))
        throw new Error('scene_reference_owner: ' + ref.character + ' does not appear or speak in scene ' + scene.no);
      owners.add(ref.character);
    }
  }
  if (planning && declared?.some(id => !spoken.has(id)))
    throw new Error('scene_speaker_mismatch: the declared speakers must match the lines of scene ' + scene.no);
  return {physical:(declared ?? [...spoken]).filter(id => physical.has(id)), visible:lines.some(({line}) => line.delivery === 'on_screen')};
}

function sceneCast(scene, cards) {
  return sceneSpeech(scene, cards).physical;
}

function sceneSpeechRoute(scene, cards, selection) {
  const {physical, visible} = sceneSpeech(scene, cards, true);
  const speakers = visible ? physical : [];
  const direction = scene.videoDirection || {};
  const track = direction.audio && direction.audio.mode !== 'mix';
  const distilled = selection.engine === 'astra-genai' && selection.model === 'ltx-2.5-22b-distilled';
  const generated = direction.dialogueVoice === 'model_generated';
  if (track && !visible) throw new Error('scene_speech_route: an external voice or a non-speaking picture uses a mix track');
  if (track && generated) throw new Error('scene_speech_route: choose recorded audio or generated dialogue for this render');
  const mode = track ? 'conditioned' : !speakers.length ? 'picture' : generated ? 'generated'
    : selection.operation === 'audio' ? 'conditioned' : 'reference';
  let operation = 'image';
  if (mode === 'conditioned') operation = 'audio';
  else if (mode === 'reference') operation = distilled && selection.operation !== 'reference' ? 'image' : 'reference';
  else if (mode === 'generated' && selection.engine === 'veo' && selection.operation === 'reference') operation = 'reference';
  const cutVoiceover = cards.some(card => {
    const lines = orderedSpeech(card).filter(line => line.tts?.trim());
    return lines.length && lines.every(line => line.delivery === 'voiceover');
  });
  const mixedCuts = distilled && mode === 'reference' && !direction.oneTake && cutVoiceover;
  if (mixedCuts) operation = 'image';
  return {speakers, operation, mode, external:!visible && physical.length > 0};
}

// Each native render binds its own speakers. A finished soundtrack uses one audio input.
function assertRenderVoiceCapacity({tool, model, scene, cards, route, generateAudio, limit, perCard = false}) {
  if (['reference','generated'].includes(route.mode) && (generateAudio === false || cards.some(card =>
      orderedSpeech(card).some(line => line.delivery !== 'voiceover' && line.tts?.trim()) &&
      require('../storyboard/references/production-mode.js').videoSlot(card)?.generateAudio === false)))
    throw new Error('scene_dialogue_audio_required: the selected native dialogue render requires its original soundtrack');
  if (route.mode !== 'reference') return;
  if (limit === undefined) {
    const entry = require('./video-catalog.json').adapters.find(adapter => adapter.tool === tool);
    const capacity = entry?.voice.maxPinnedVoicesPerRender;
    limit = typeof capacity === 'number' ? capacity : capacity?.[model];
  }
  if (!limit || ['astra_genai_img2video','astra_genai_msr','astra_genai_scene'].includes(tool) && model !== 'ltx-2.5-22b-distilled' && !(tool === 'astra_genai_scene' && model === 'minimax-h3'))
    throw new Error('scene_speech_references: the selected model cannot bind the required character voice samples');
  // One render binds the whole scene's voices. A clip the retired per-shot route made rendered each card apart (perCard).
  for (const group of perCard ? cards.map(card => [card]) : [cards]) {
    const voices = new Set(group.flatMap(orderedSpeech).filter(line => line.tts?.trim() && line.delivery !== 'voiceover').map(line => line.speaker));
    if (voices.size <= limit) continue;
    const label = group.length === 1 || scene?.no === undefined ? group[0].id : 'scene ' + scene.no;
    throw new Error('scene_render_voice_limit: ' + label + ' needs ' + voices.size + ' pinned voices; ' + tool +
      ' accepts ' + limit + ' per render. ' + (scene?.videoDirection?.oneTake || cards.length === 1 ?
        'The authored one-take has no cut for a split.' : 'Split at an authored cut or revise this shot.'));
  }
}

const {castIds, personRoles, referenceOwners, sceneReferenceGroups, referenceConflict, MAX_SCENE_CHARACTER_IMAGES} = require('./scene-references.js');

// A scene owns the identity sources. Each adapter still receives its own wire grammar.
// `perShot` reads a clip the gateway's retired per-shot route made, where each card was its own render with its own cast.
function projectSceneCast(scene, cards, board, boardDir, engine, audioRoute = false, perShot = false, model) {
  const registry = referenceOwners(board, boardDir);
  const {actors, voiceOnly, canonical, owners, registeredOwner} = registry;
  const speakers = sceneCast(scene, cards).filter(id => !voiceOnly.has(id));
  const declaredRefs = scene.speakerReferences ?? [];
  const h3 = engine === 'astra-genai' && model === 'minimax-h3';
  const visibleH3 = h3 && !declaredRefs.length ? cards.flatMap(card => castIds(card.visual?.character ?? card.visual?.characters)).filter(id => !voiceOnly.has(id)) : [];
  const identities = [...new Set([...speakers, ...declaredRefs.map(ref => ref.character), ...visibleH3])];
  if (declaredRefs.some(ref => !actors.some(actor => actor.id === ref.character)))
    throw new Error('scene_reference_owner: register the owner of every scene identity reference');
  if (scene.speakerReferences?.some(ref => voiceOnly.has(ref.character)))
    throw new Error('scene_reference_owner: a voice-only speaker has no visual identity in this scene');
  const ownerOf = (ref, card) => registry.ownerOf(ref, card, speakers);
  const conditioning = audioRoute || scene.videoDirection?.audio && scene.videoDirection.audio.mode !== 'mix';
  const ltx = engine === 'astra-genai';
  const groups = ltx && !perShot && !conditioning ? sceneReferenceGroups(scene, cards, registry) : [];
  const conflict = referenceConflict(scene, groups);
  if (conflict) throw Object.assign(new Error(conflict.message), {report:conflict});
  if (ltx && !perShot && cards.some(card => card.visual?.characterInputs?.length)) {
    const {resolveShotCharacterInputs} = require('../channel/references/character-panels.js');
    cards = cards.map(card => card.visual?.characterInputs?.length
      ? resolveShotCharacterInputs(card, boardDir, false, board.SB_DOC?.characters) : card);
  }
  const sheets = new Map();
  for (const character of identities) {
    // Resolve the same registered source used by the engine-specific character binder.
    try {
      const panels = require('../channel/references/character-panels.js').sheetPanels(boardDir,[character],new Map([[character,['face']]])).get(character);
      sheets.set(character, panels);
      for (const file of Object.values(panels)) owners.set(canonical(file), character);
    } catch (error) {
      if (engine === 'astra-genai' && !scene.videoDirection?.audio && !scene.speakerReferences?.some(ref => ref.character === character) && fs.existsSync(path.join(boardDir,'cast.json'))) throw error;
    }
  }
  const originals = new Map();
  if (engine === 'seedance' && (scene.frames !== undefined || declaredRefs.length)) {
    for (const card of cards) for (const spec of card.visual?.characterInputs ?? []) {
      if (!spec.faceTaskId || !identities.includes(spec.character)) continue;
      if (originals.has(spec.character) && originals.get(spec.character).faceTaskId !== spec.faceTaskId)
        throw new Error('scene_reference_owner: conflicting originals for ' + spec.character);
      originals.set(spec.character, spec);
    }
  }
  const references = [];
  for (const character of identities) {
    const actor = actors.find(c => c.id === character);
    let face = sheets.get(character)?.face ?? actor?.panels?.face;
    const candidates = cards.flatMap(card => [
      ...(card.timeline?.images ?? []).filter(p => p.role === 'face' && p.character === character),
      ...(card.visual?.references ?? []).filter(r => r.role === 'character' && ownerOf(r,card) === character && !/-(?:front|back)$/.test(r.id)),
    ]);
    const custom = scene.speakerReferences?.find(ref => ref.character === character);
    if (ltx && conditioning && custom)
      throw new Error('scene_inputs_unsupported: the audio-conditioned operation cannot attach the requested face for ' + character);
    if (originals.has(character)) {
      if (custom) throw new Error('scene_reference_owner: select one facial original for ' + character);
      continue;
    }
    if (custom && face && engine === 'seedance' && canonical(custom.path) !== canonical(face))
      throw new Error('scene_reference_owner: Seedance requires the registered face for ' + character);
    face = custom?.path ?? face ?? candidates[0]?.path;

    if (face && !conditioning && (ltx || scene.frames !== undefined || custom)) {
      if (registeredOwner(face) && registeredOwner(face) !== character)
        throw new Error('scene_reference_owner: ' + character + ' does not own ' + face);
      if (references.some(ref => canonical(ref.path) === canonical(face))) throw new Error('scene_reference_owner: two speakers share one face path');
      references.push({id:'scene-'+scene.no+'-'+character+'-face', character, path:face, role:'character', scope:'scene', use:'video', purpose:character+' facial identity.'});
    } else if (ltx && scene.speakers && !conditioning)
      throw new Error('character_panel_missing: scene ' + scene.no + ' speaker ' + character + ' needs a registered face');
  }
  let sceneCastIds = [...(groups[0]?.characters ?? [])];
  let panels;
  if (sceneCastIds.length) {
    const body = cards.flatMap(card => card.visual?.characterInputs ?? []).find(input => input.bodyView)?.bodyView;
    try {
      panels = require('../channel/references/character-panels.js').canonicalReferences(boardDir, 'scene-' + scene.no,
        sceneCastIds, 'video', {maxPictures:MAX_SCENE_CHARACTER_IMAGES, bodyView:body});
    } catch { /* Legacy boards can supply their own faces without shared sheets. */ }
  }
  if (panels) {
    const chosen = panels.flatMap(ref => {
      const character = sceneCastIds.find(id => ref.id === 'scene-' + scene.no + '-' + id + '-' + ref.id.split('-').at(-1));
      if (declaredRefs.some(entry => entry.character === character))
        return ref.id.endsWith('-face') ? references.filter(entry => entry.character === character) : [];
      return [{...ref, character, scope:'scene'}];
    });
    references.splice(0, references.length, ...chosen);
  } else sceneCastIds = [];
  if (scene.referenceSplitFrom && ltx && scene.videoDirection && cards[0]) {
    const first = cards[0], needed = new Set([...castIds(first.visual?.character ?? first.visual?.characters),
      ...orderedSpeech(first).filter(line => line.delivery === 'on_screen' && line.tts?.trim()).map(line => line.speaker)]);
    const missing = [...needed].filter(id => !scene.videoDirection.openingPositions?.some(row => row.character === id));
    if (missing.length) throw new Error('scene_split_opening_positions: inspect the opening of ' + first.id + ' and describe where ' + missing.join(', ') + ' starts with story_scene');
  }
  const entering = rows => !sceneCastIds.length || !rows ? rows : [...rows, ...sceneCastIds.filter(id => !rows.some(row => row.character === id))
    .map(character => ({character, images:[], position:'Not in the opening view; appears in a later shot.'}))];
  const positions = (rows, refs) => rows?.map(row => ({...row, images:ltx
    ? refs.flatMap((ref,i) => ref.character === row.character ? [i+1] : []) : row.images}));
  let openingRefs = [];
  const members = cards.map((card, index) => {
    const visual = card.visual || {};
    const castSpecified = visual.character !== undefined || visual.characters !== undefined;
    const original = castIds(visual.character ?? visual.characters);
    const active = [...new Set(orderedSpeech(card).filter(line => line.tts?.trim() && line.delivery !== 'voiceover').map(line => line.speaker))];
    const shotMarks = [...(card.timeline?.openingPositions ?? []), ...(visual.video?.openingPositions ?? [])];
    const hasShotBlocking = castSpecified && shotMarks.length > 0;
    const inheritedMarks = index === 0 ? (scene.videoDirection?.openingPositions ?? [])
      .filter(row => !shotMarks.some(mark => mark.character === row.character)) : [];
    // An empty slot list leaves a silent character in the composition without a separate face input.
    const visibleRefs = original.filter(id => !shotMarks.some(mark => mark.character === id && mark.images?.length === 0));
    const localIds = new Set([...active, ...visibleRefs, ...castIds(visual.bystanders),
      ...shotMarks.filter(row => row.images?.length || !hasShotBlocking && declaredRefs.some(ref => ref.character === row.character)).map(row => row.character),
      ...inheritedMarks.filter(row => row.images?.length || declaredRefs.some(ref => ref.character === row.character)).map(row => row.character),
      ...(visual.characterInputs ?? []).map(input => input.character),
      ...(card.timeline?.images ?? []).map(pin => pin.character),
      ...(visual.references ?? []).map(ref => ownerOf(ref,card))]);
    const localRefs = perShot && identities.length > 2 ? [
      ...active.flatMap(id => references.filter(ref => ref.character === id)),
      ...references.filter(ref => !active.includes(ref.character) && localIds.has(ref.character))
    ] : perShot && hasShotBlocking ? references.filter(ref => localIds.has(ref.character)) : references;
    const useSceneRefs = (ltx || scene.frames !== undefined || declaredRefs.length) && (!scene.videoDirection?.audio || scene.videoDirection.audio.mode === 'mix');
    const keep = ref => {
      const owner = registeredOwner(ref.path);
      if (owner && ref.character && owner !== ref.character) throw new Error('scene_reference_owner: conflicting owner for ' + ref.path);
      if (scene.frames !== undefined && ref.legacy) return false;
      if (ref.use === 'image') return true;
      if (localRefs.some(item => canonical(item.path) === canonical(ref.path))) return false;
      if (sceneCastIds.length && personRoles.has(ref.role) && sceneCastIds.includes(ownerOf(ref, card))) return false;
      if (!ref.legacy && personRoles.has(ref.role)) return true;
      const identity = ownerOf(ref,card);
      if (identity && !speakers.includes(identity) && !declaredRefs.some(item => item.character === identity)) return !ref.legacy;
      if (!personRoles.has(ref.role) && !owner) return true;
      if (ltx || scene.frames !== undefined) return false;
      return speakers.includes(ownerOf(ref,card));
    };
    const kept = (visual.references || []).filter(keep).map(ref => {
      const character = ownerOf(ref, card);
      return personRoles.has(ref.role) && character ? {...ref, character, role:ref.role === 'bystander' ? 'character' : ref.role} : ref;
    });
    const subjectRefs = useSceneRefs ? localRefs : [];
    const pins = card.timeline?.images?.filter(pin => !personRoles.has(pin.role) || keep(pin)) ?? [];
    const slots = [...pins.filter(pin => !['start','end','keyframe','location','background'].includes(pin.role)),
      ...[...subjectRefs,...kept].filter(ref => ref.use !== 'image' && !['location','background'].includes(ref.role) && !pins.some(pin => pin.path === ref.path))];
    if (!index) openingRefs = slots;
    const shotPositions = rows => {
      const inherited = index === 0 ? (scene.videoDirection?.openingPositions ?? []).filter(row =>
        declaredRefs.some(ref => ref.character === row.character) && !rows.some(local => local.character === row.character)) : [];
      return positions(index === 0 ? entering([...rows,...inherited]) : [...rows,...inherited], slots);
    };
    const timeline = card.timeline && {...card.timeline,
      ...(card.timeline.images ? {images:pins} : {}),
      ...(card.timeline.openingPositions ? {openingPositions:shotPositions(card.timeline.openingPositions)} : {})};
    const updated = {...visual, ...(ltx ? {sceneSpeakerReferences:true} : {}), ...(castSpecified ? {character:original} : {}),
      ...(visual.references || subjectRefs.length ? {references:[...subjectRefs,...kept]} : {}),
      ...(visual.characterInputs ? {characterInputs:visual.characterInputs} : {}),
      ...(visual.video?.openingPositions ? {video:{...visual.video,openingPositions:shotPositions(visual.video.openingPositions)}} : {})};
    if (originals.size && updated.character?.length) {
      updated.characterInputs = updated.character.map(character => {
        const local = updated.characterInputs?.find(spec => spec.character === character) ?? {character};
        const original = originals.get(character);
        return original && local.visibility !== 'hands_only' && local.visibility !== 'body_only' ?
          {...local,faceTaskId:original.faceTaskId,faceReviewPath:original.faceReviewPath} : local;
      });
    }
    if (updated.characterInputs?.length === 0) delete updated.characterInputs;
    if (scene.frames !== undefined) {
      const start = index === 0 ? scene.frames.start : undefined;
      const end = index === cards.length-1 ? scene.frames.end : undefined;
      const {keyframes, storyboardKeyframes} = visual.frames ?? {};
      updated.frames = {mode:end ? 'first_last' : start ? 'first' : 'reference', start, end,
        ...(engine === 'astra-genai' && keyframes !== undefined ? {keyframes} : {}),
        ...(engine === 'astra-genai' && storyboardKeyframes !== undefined ? {storyboardKeyframes} : {})};
      delete updated.bg;
      delete updated.src;
      delete updated.imagePair;
      delete updated.lastImagePath;
      if (updated.video) {
        updated.video = {...updated.video};
        delete updated.video.lastImagePath;
        delete updated.video.referenceImagePaths;
      }
      // GenAI scene mode opens each shot on its start picture and names any other picture it leaves out.
      const timed = perShot || engine === 'astra-genai' ? [] : ['start','end','keyframe'];
      if (timeline?.images?.some(pin => timed.includes(pin.role)))
        throw new Error('scene_image_scope: use a scene anchor or an authored shot composition image on ' + card.id);
    }
    return {...card, visual:updated, ...(timeline ? {timeline} : {})};
  });
  for (const ref of declaredRefs) {
    const used = members.some(member => member.visual.references?.some(item => item.use !== 'image' &&
      item.character === ref.character && canonical(item.path) === canonical(ref.path)));
    if (!used) throw new Error('scene_reference_owner: no render binds the requested visual reference for ' + ref.character);
  }
  const direction = scene.videoDirection && {...scene.videoDirection,openingPositions:positions(entering(scene.videoDirection.openingPositions), openingRefs)};
  return {members, direction, speakers, identities};
}

// Authored cards can reach scene preview before the sheet resolver supplies body paths.
function requiredCharacters(shot) {
  const inputs=shot?.visual?.characterInputs;
  return Array.isArray(inputs) ? inputs.filter(person => person && typeof person.bodyPath === 'string') : [];
}

module.exports = {requiredCharacters, sceneCast, sceneSpeechRoute, assertRenderVoiceCapacity, projectSceneCast};
