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
  // Explicit temporal openings and hard cuts describe separate native renders.
  const anchoredCuts = cards.every((card, index) => card.timeline &&
    card.timeline.transition === (index ? 'hard_cut' : 'open') &&
    card.timeline.images?.some(pin => pin.role === 'start' && pin.frame === card.timeline.startFrame) &&
    !card.timeline.dialogueCues?.length);
  const cutVoiceover = cards.some(card => {
    const lines = orderedSpeech(card).filter(line => line.tts?.trim());
    return lines.length && lines.every(line => line.delivery === 'voiceover');
  });
  const mixedCuts = distilled && mode === 'reference' && !direction.oneTake && cutVoiceover;
  if (mixedCuts) operation = 'image';
  const perShot = distilled && operation === 'image' && cards.length > 1 && !direction.oneTake &&
    (mixedCuts || mode === 'reference' && speakers.length > 2 || anchoredCuts);
  return {speakers, operation, mode, ...(perShot ? {rendering:'per_shot'} : {}), external:!visible && physical.length > 0};
}

// Each native render binds its own speakers. A finished soundtrack uses one audio input.
function assertRenderVoiceCapacity({tool, model, scene, cards, route, rendering = route.rendering, generateAudio, limit}) {
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
  if (!limit || ['astra_genai_img2video','astra_genai_msr'].includes(tool) && model !== 'ltx-2.5-22b-distilled')
    throw new Error('scene_speech_references: the selected model cannot bind the required character voice samples');
  const perShot = rendering === 'per_shot' && !scene?.videoDirection?.oneTake;
  const groups = perShot ? cards.map(card => [card]) : [cards];
  for (const group of groups) {
    const voices = new Set(group.flatMap(orderedSpeech).filter(line => line.tts?.trim() && line.delivery !== 'voiceover').map(line => line.speaker));
    if (voices.size <= limit) continue;
    const label = group.length === 1 || scene?.no === undefined ? group[0].id : 'scene ' + scene.no;
    throw new Error('scene_render_voice_limit: ' + label + ' needs ' + voices.size + ' pinned voices; ' + tool +
      ' accepts ' + limit + ' per render. ' + (scene?.videoDirection?.oneTake || cards.length === 1 ?
        'The authored one-take has no cut for a split.' : 'Split at an authored cut or revise this shot.'));
  }
}

const personRoles = new Set(['character','face','outfit','bystander']);
const castIds = value => [].concat(value || []).map(person => typeof person === 'string' ? person : person.id);

// A scene owns the identity sources. Each adapter still receives its own wire grammar.
function projectSceneCast(scene, cards, board, boardDir, engine, audioRoute = false, perShot = false) {
  const registry = board.SB_DOC?.characters ?? [];
  const actors = Array.isArray(registry) ? registry : Object.entries(registry).map(([id, actor]) => ({...actor, id}));
  const voiceOnly = new Set(actors.filter(actor => actor.voiceOnly === true).map(actor => actor.id));
  const speakers = sceneCast(scene, cards).filter(id => !voiceOnly.has(id));
  const declaredRefs = scene.speakerReferences ?? [];
  const identities = [...new Set([...speakers, ...declaredRefs.map(ref => ref.character)])];
  if (declaredRefs.some(ref => !actors.some(actor => actor.id === ref.character)))
    throw new Error('scene_reference_owner: register the owner of every scene identity reference');
  if (scene.speakerReferences?.some(ref => voiceOnly.has(ref.character)))
    throw new Error('scene_reference_owner: a voice-only speaker has no visual identity in this scene');
  const owners = new Map();
  const canonical = file => {
    const local = path.resolve(boardDir, file);
    return fs.existsSync(local) ? fs.realpathSync(local) : local;
  };
  for (const actor of actors) for (const file of [actor.imageUrl, ...Object.values(actor.panels || {}), ...(actor.voiceReference?.imagePaths || [])]) {
    if (typeof file === 'string') owners.set(canonical(file), actor.id);
  }
  function registeredOwner(file) {
    if (!file) return;
    const source = canonical(file);
    return owners.get(source) || source.match(/[/\\]assets[/\\]characters[/\\]([^/\\]+)[/\\]/)?.[1];
  }
  function ownerOf(ref, card) {
    const registered = registeredOwner(ref.path);
    if (registered && ref.character && registered !== ref.character)
      throw new Error('scene_reference_owner: conflicting owner for ' + ref.path);
    if (registered || ref.character) return registered || ref.character;
    return speakers.find(id => ref.id === id || ref.id === id+'-face' || ref.id?.startsWith(card.id+'-'+id+'-'));
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
  const conditioning = audioRoute || scene.videoDirection?.audio && scene.videoDirection.audio.mode !== 'mix';
  const ltx = engine === 'astra-genai';
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
      return positions([...rows,...inherited], slots);
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
      updated.frames = {mode:end ? 'first_last' : start ? 'first' : 'reference', start, end};
      delete updated.bg;
      delete updated.src;
      delete updated.imagePair;
      delete updated.lastImagePath;
      if (updated.video) {
        updated.video = {...updated.video};
        delete updated.video.lastImagePath;
        delete updated.video.referenceImagePaths;
      }
      if (!perShot && timeline?.images?.some(pin=>['start','end','keyframe'].includes(pin.role)))
        throw new Error('scene_image_scope: use a scene anchor or an authored shot composition image on ' + card.id);
    }
    return {...card, visual:updated, ...(timeline ? {timeline} : {})};
  });
  for (const ref of declaredRefs) {
    const used = members.some(member => member.visual.references?.some(item => item.use !== 'image' &&
      item.character === ref.character && canonical(item.path) === canonical(ref.path)));
    if (!used) throw new Error('scene_reference_owner: no render binds the requested visual reference for ' + ref.character);
  }
  const direction = scene.videoDirection && {...scene.videoDirection,openingPositions:positions(scene.videoDirection.openingPositions, openingRefs)};
  return {members, direction, speakers, identities};
}

// Authored cards can reach scene preview before the sheet resolver supplies body paths.
function requiredCharacters(shot) {
  const inputs=shot?.visual?.characterInputs;
  return Array.isArray(inputs) ? inputs.filter(person => person && typeof person.bodyPath === 'string') : [];
}

module.exports = {requiredCharacters, sceneCast, sceneSpeechRoute, assertRenderVoiceCapacity, projectSceneCast};
