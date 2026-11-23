'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { orderedSpeech } = require('../storyboard/references/scene-direction.js');

// Keep the cast registry order stable across cuts, including off-screen replies.
function sceneCast(scene, cards) {
  const lines = cards.flatMap(card => orderedSpeech(card).filter(line => line.tts?.trim()).map(line => ({card, line})));
  const spoken = new Set(), physical = new Set();
  const declared = scene.speakers;
  if (declared !== undefined && (!Array.isArray(declared) || declared.length > 2 ||
      declared.some(id => typeof id !== 'string' || !id.trim()) || new Set(declared).size !== declared.length))
    throw new Error('scene_speaker_limit: declare up to two distinct speakers in scene ' + scene.no);
  if (scene.speakerReferences !== undefined) {
    const ids = new Set();
    for (const ref of scene.speakerReferences) {
      if (!ref.path || !declared?.includes(ref.character) || ids.has(ref.character))
        throw new Error('scene_reference_owner: each scene reference needs a distinct declared speaker');
      ids.add(ref.character);
    }
  }
  for (const {card, line} of lines) {
    if (!line.speaker) {
      if (declared || line.delivery === 'on_screen' || line.delivery === 'off_screen')
        throw new Error('scene_speaker_missing: identify the speaker in ' + card.id + ' ' + (line.id || line.tts));
      continue;
    }
    spoken.add(line.speaker);
    if (spoken.size > 2 || declared && !declared.includes(line.speaker)) {
      throw new Error('scene_speaker_limit: scene ' + scene.no + ', shot ' + card.id + ', line ' +
        (line.id || line.tts) + ' names ' + line.speaker + '; declare the speaker or start a new scene');
    }
    if (line.delivery !== 'voiceover') physical.add(line.speaker);
  }
  return (declared ?? [...spoken]).filter(id => physical.has(id));
}

const personRoles = new Set(['character','face','outfit','bystander']);
const castIds = value => [].concat(value || []).map(person => typeof person === 'string' ? person : person.id);

// A scene owns the identity sources. Each adapter still receives its own wire grammar.
function projectSceneCast(scene, cards, board, boardDir, engine, frameVoice = false) {
  const registry = board.SB_DOC?.characters ?? [];
  const actors = Array.isArray(registry) ? registry : Object.entries(registry).map(([id, actor]) => ({...actor, id}));
  const voiceOnly = new Set(actors.filter(actor => actor.voiceOnly === true).map(actor => actor.id));
  const speakers = sceneCast(scene, cards).filter(id => !voiceOnly.has(id));
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
  for (const character of speakers) {
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
  if (engine === 'seedance' && scene.frames !== undefined) {
    for (const card of cards) for (const spec of card.visual?.characterInputs ?? []) {
      if (!spec.faceTaskId || !speakers.includes(spec.character)) continue;
      if (originals.has(spec.character) && originals.get(spec.character).faceTaskId !== spec.faceTaskId)
        throw new Error('scene_reference_owner: conflicting originals for ' + spec.character);
      originals.set(spec.character, spec);
    }
  }
  const references = [];
  const conditioning = scene.videoDirection?.audio && scene.videoDirection.audio.mode !== 'mix';
  const ltx = engine === 'astra-genai';
  for (const character of speakers) {
    const actor = actors.find(c => c.id === character);
    let face = sheets.get(character)?.face ?? actor?.panels?.face;
    const candidates = cards.flatMap(card => [
      ...(card.timeline?.images ?? []).filter(p => p.role === 'face' && p.character === character),
      ...(card.visual?.references ?? []).filter(r => r.role === 'character' && ownerOf(r,card) === character && !/-(?:front|back)$/.test(r.id)),
    ]);
    const custom = scene.speakerReferences?.find(ref => ref.character === character);
    if (ltx && conditioning && custom)
      throw new Error('scene_inputs_unsupported: the audio-conditioned operation cannot attach the requested face for ' + character);
    // A speaking character can share an opening picture with the listener. Preserve separately requested assets.
    if (frameVoice &&
        !custom && !candidates.length && !cards.some(card => card.visual?.characterInputs?.some(spec => spec.character === character) ||
          card.visual?.references?.some(ref => ref.use !== 'image' && ownerOf(ref, card) === character))) continue;
    if (originals.has(character)) {
      if (custom) throw new Error('scene_reference_owner: select one facial original for ' + character);
      continue;
    }
    if (custom && face && engine === 'seedance' && canonical(custom.path) !== canonical(face))
      throw new Error('scene_reference_owner: Seedance requires the registered face for ' + character);
    face = custom?.path ?? face ?? candidates[0]?.path;

    if (face && !conditioning && (ltx || scene.frames !== undefined)) {
      if (registeredOwner(face) && registeredOwner(face) !== character)
        throw new Error('scene_reference_owner: ' + character + ' does not own ' + face);
      if (references.some(ref => canonical(ref.path) === canonical(face))) throw new Error('scene_reference_owner: two speakers share one face path');
      references.push({id:'scene-'+scene.no+'-'+character+'-face', character, path:face, role:'character', scope:'scene', use:'video', purpose:character+' facial identity.'});
    } else if (ltx && scene.speakers && !(scene.videoDirection?.audio && scene.videoDirection.audio.mode !== 'mix'))
      throw new Error('character_panel_missing: scene ' + scene.no + ' speaker ' + character + ' needs a registered face');
  }
  const positions = rows => rows?.map(row => ({...row, images:ltx ? references.flatMap((r,i)=>r.character === row.character ? [i+1] : []) : speakers.includes(row.character) ? row.images : []}));
  const members = cards.map((card, index) => {
    const visual = card.visual || {};
    const original = castIds(visual.character);
    const silent = original.filter(id => !speakers.includes(id));
    const useSceneRefs = (ltx || scene.frames !== undefined) && (!scene.videoDirection?.audio || scene.videoDirection.audio.mode === 'mix');
    const keep = ref => {
      const owner = registeredOwner(ref.path);
      if (owner && ref.character && owner !== ref.character) throw new Error('scene_reference_owner: conflicting owner for ' + ref.path);
      if (scene.frames !== undefined && ref.legacy) return false;
      if (ref.role === 'bystander') return false;
      if (!personRoles.has(ref.role) && !owner) return true;
      if (ltx || scene.frames !== undefined) return false;
      return speakers.includes(ownerOf(ref,card));
    };
    const kept = (visual.references || []).filter(keep);
    const subjectRefs = useSceneRefs ? references : [];
    const timeline = card.timeline && {...card.timeline,
      ...(card.timeline.images ? {images:card.timeline.images.filter(pin => !personRoles.has(pin.role) || keep(pin))} : {}),
      ...(card.timeline.openingPositions ? {openingPositions:positions(card.timeline.openingPositions)} : {})};
    const updated = {...visual, ...(ltx ? {sceneSpeakerReferences:true} : {}), ...(visual.character !== undefined ? {character:original.filter(id=>speakers.includes(id))} : {}),
      ...(silent.length ? {bystanders:[...new Set([...(visual.bystanders || []),...silent])]} : {}),
      ...(visual.references || subjectRefs.length ? {references:[...subjectRefs,...kept]} : {}),
      ...(visual.characterInputs ? {characterInputs:visual.characterInputs.filter(c=>speakers.includes(c.character))} : {}),
      ...(visual.video?.openingPositions ? {video:{...visual.video,openingPositions:positions(visual.video.openingPositions)}} : {})};
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
      if (timeline?.images?.some(pin=>['start','end','keyframe'].includes(pin.role)))
        throw new Error('scene_image_scope: use a scene anchor or an authored shot composition image for ' + card.id);
    }
    return {...card, visual:updated, ...(timeline ? {timeline} : {})};
  });
  const direction = scene.videoDirection && {...scene.videoDirection,openingPositions:positions(scene.videoDirection.openingPositions)};
  return {members, direction, speakers};
}

module.exports = {sceneCast, projectSceneCast};
