'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { orderedSpeech } = require('../storyboard/references/scene-direction.js');
const { imageReferences } = require('../storyboard/references/render-routing.js');

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

// Work from the authored cards, before the renderer copies the scene's references into every shot.
function sceneReferenceGroups(scene, cards, registry) {
  const hasVisibleDialogue = cards.some(card => orderedSpeech(card).some(line => line.tts?.trim() && line.delivery === 'on_screen'));
  const declared = (scene.speakerReferences ?? []).map(ref => ref.character);
  const rows = cards.map(card => {
    const visual = card.visual ?? {};
    const lines = orderedSpeech(card).filter(line => line.tts?.trim());
    const marks = [...(card.timeline?.openingPositions ?? []), ...(visual.video?.openingPositions ?? [])];
    const people = unique([
      ...castIds(visual.character ?? visual.characters),
      ...(visual.characterInputs ?? []).map(input => input.character),
      ...imageReferences(card).filter(ref => ref.use !== 'image' && (personRoles.has(ref.role) || ref.legacy))
        .map(ref => registry.ownerOf(ref, card, scene.speakers)),
      ...(card.timeline?.images ?? []).filter(pin => personRoles.has(pin.role)).map(pin => registry.ownerOf(pin, card)),
      ...marks.filter(mark => mark.images?.length).map(mark => mark.character),
      ...lines.filter(line => hasVisibleDialogue && line.delivery !== 'voiceover').map(line => line.speaker),
    ]);
    const staged = unique([...people, ...castIds(visual.bystanders), ...marks.map(mark => mark.character), ...lines.map(line => line.speaker)]);
    return {card, people:unique([...people, ...declared.filter(id => staged.includes(id))])};
  });
  // A scene-wide reference without any shot attribution cannot be dropped at a proposed cut.
  const unplaced = declared.filter(id => !rows.some(row => row.people.includes(id)));
  const opening = (scene.videoDirection?.openingPositions ?? []).filter(mark => mark.images?.length)
    .map(mark => mark.character).filter(id => !rows.some(row => row.people.includes(id)));
  if (rows.length) rows[0].people = unique([...rows[0].people, ...opening]);
  const groups = [];
  let group;
  for (const {card, people} of rows) {
    const shotPeople = unique([...people, ...unplaced]).filter(id => !registry.voiceOnly.has(id));
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
    : oversized ? 'Reblock this shot into views with at most two referenced characters.' : 'Split before ' + shotId + '.';
  const message = 'scene_cast_exceeded: scene ' + scene.no + ', shot ' + shotId + ' references ' + characters.join(', ') + '. ' + reason;
  return {code:'scene_cast_exceeded', sceneNo:scene.no, shotId, characters, groups, splitBefore:oneTake || oversized ? [] : groups.slice(1).map(g => g.shotIds[0]),
    executable:false, videoSubmitted:false, message};
}

module.exports = {MAX_SCENE_CHARACTERS, MAX_SCENE_CHARACTER_IMAGES, castIds, personRoles, referenceOwners, sceneReferenceGroups, referenceConflict};
