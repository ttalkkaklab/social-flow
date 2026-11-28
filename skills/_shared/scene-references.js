'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { orderedSpeech } = require('../storyboard/references/scene-direction.js');

const {maxReferencedCharacters: MAX_SCENE_CHARACTERS, maxCharacterImages: MAX_SCENE_CHARACTER_IMAGES} = require('./genai-scene-limits.json');
const personRoles = new Set(['character', 'face', 'outfit', 'bystander']);
const castIds = value => [].concat(value || []).map(person => typeof person === 'string' ? person : person.id);
const unique = ids => [...new Set(ids.filter(Boolean))];

function referenceOwners(board, boardDir) {
  const registry = board.SB_DOC?.characters ?? [];
  const actors = Array.isArray(registry) ? registry : Object.entries(registry).map(([id, actor]) => ({...actor, id}));
  const voiceOnly = new Set(actors.filter(actor => actor.voiceOnly).map(actor => actor.id));
  const canonical = file => {
    const local = path.resolve(boardDir, file);
    return fs.existsSync(local) ? fs.realpathSync(local) : local;
  };
  const owners = new Map();
  for (const actor of actors) for (const file of [actor.imageUrl, ...Object.values(actor.panels || {}), ...(actor.voiceReference?.imagePaths || [])])
    if (typeof file === 'string') owners.set(canonical(file), actor.id);
  function registeredOwner(file) {
    if (!file) return;
    const source = canonical(file);
    return owners.get(source) || source.match(/[/\\]assets[/\\]characters[/\\]([^/\\]+)[/\\]/)?.[1];
  }
  function ownerOf(ref, card, speakers = []) {
    const registered = registeredOwner(ref.path);
    if (registered && ref.character && registered !== ref.character)
      throw new Error('scene_reference_owner: conflicting owner for ' + ref.path);
    return registered || ref.character || speakers.find(id => ref.id === id || ref.id === id+'-face' || ref.id?.startsWith(card.id+'-'+id+'-'));
  }
  return {actors, voiceOnly, canonical, owners, registeredOwner, ownerOf};
}

// A scene references the people whose voices it renders: a pinned voice rides on its speaker's picture.
// Silent people, bystanders, voice-over and voice-only speakers reach the clip through the shot pictures and the prompt.
function sceneReferenceGroups(scene, cards, registry) {
  const hasVisibleDialogue = cards.some(card => orderedSpeech(card).some(line => line.tts?.trim() && line.delivery === 'on_screen'));
  const groups = [];
  let group;
  for (const card of cards) {
    const shotPeople = hasVisibleDialogue ? unique(orderedSpeech(card)
      .filter(line => line.tts?.trim() && line.delivery !== 'voiceover').map(line => line.speaker))
      .filter(id => !registry.voiceOnly.has(id)) : [];
    const combined = unique([...(group?.characters ?? []), ...shotPeople]);
    if (!group || combined.length > MAX_SCENE_CHARACTERS) {
      group = {shotIds:[], characters:shotPeople, firstShotCharacters:shotPeople};
      groups.push(group);
    } else group.characters = combined;
    group.shotIds.push(card.id);
  }
  return groups;
}

function referenceConflict(scene, groups) {
  const oversized = groups.find(group => group.characters.length > MAX_SCENE_CHARACTERS);
  if (!oversized && groups.length < 2) return;
  const oneTake = scene.videoDirection?.oneTake;
  const group = oversized ?? groups[1];
  const shotId = group.shotIds[0];
  const characters = oversized ? group.characters : unique([...groups[0].characters, ...group.firstShotCharacters]);
  const reason = oneTake ? 'The requested one-take needs a staging decision.'
    : oversized ? 'Split this shot at each change of speaker. Keep the turns in playback order.' : 'Split before ' + shotId + '.';
  const message = 'scene_cast_exceeded: scene ' + scene.no + ', shot ' + shotId + ' references ' + characters.join(', ') + '. ' + reason;
  return {code:'scene_cast_exceeded', sceneNo:scene.no, shotId, characters, groups, splitBefore:oneTake || oversized ? [] : groups.slice(1).map(g => g.shotIds[0]),
    executable:false, videoSubmitted:false, message};
}

module.exports = {MAX_SCENE_CHARACTERS, MAX_SCENE_CHARACTER_IMAGES, castIds, personRoles, referenceOwners, sceneReferenceGroups, referenceConflict};
