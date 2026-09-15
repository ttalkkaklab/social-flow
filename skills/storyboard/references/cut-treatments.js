'use strict';

const CUT_TYPES = ['action', 'reaction', 'insert', 'document', 'map', 'scenery'];
const PEOPLE_CUT_TYPES = new Set(['action', 'reaction', 'insert']);

const BASE = {
  action: "Cut type action: a full or medium figure shot; the named character's whole body and the space the action needs are in frame; the actor and the thing acted on stay sharp.",
  reaction: "Cut type reaction: a medium or medium-close shot on the people who watch; posture and head direction carry the response; the previous cut's subject is visible only as a partial shape at a frame edge.",
  insert: 'Cut type insert: a close-up on hands, feet or one prop; the face stays outside the frame; macro distance with shallow depth of field on the point of contact; the texture of skin, cloth and the prop is the picture.',
  document: 'Cut type document: a written record as a physical object — a book, scroll, letter or ledger on a surface; three-quarter high angle; the pages carry texture and marks only, without readable characters; the frame holds only the record and its surface.',
  map: 'Cut type map: a spatial overview of the place — terrain, route and landmarks as physical relief seen from above; landmarks read as shapes without lettering; people, if any, are far specks.',
  scenery: 'Cut type scenery: a wide establishing or transition view of the place and its light; people are small distant shapes; the frame edges carry the world.'
};

const PRESET_NOTES = {
  'cinematic-miniature': {
    insert: 'At miniature scale the insert is a macro photograph of a model hand and prop: painted fingers, cloth fibre, the seam of the figure.',
    document: 'The record is a model book or scroll on a model desk with hand-cut paper edges and a tiny brush and inkstone; the tilt-shift band runs across the desk.',
    map: 'The map is the diorama itself seen from above with the tilt-shift plane on the route.',
    reaction: 'Onlooker figures keep the same figurine scale and paint finish as the main figure.'
  },
  photoreal: {
    document: 'Real paper with ink bleed and binding thread under a macro lens.',
    map: 'A period map or relief table photographed from above.'
  },
  webtoon: {
    document: 'The page is drawn as a webtoon panel with hatched paper texture.',
    insert: "Drawn hands in the episode's line weight."
  },
  claymation: {
    document: 'A clay book with thumbprinted pages.',
    insert: 'Clay hands with visible thumbprints.'
  },
  'paper-cutout': {
    document: 'A single paper sheet layer with a torn edge, lit from the side.',
    map: 'Terrain as stacked paper contour layers.'
  },
  'ink-wash': {
    document: 'The record is the painting itself: a scroll in brush strokes whose blank paper is the frame.',
    map: 'A brushed map with mountains as ink ranges and the route as the one accent line.',
    insert: 'Hands in a few calligraphic strokes; the prop in ink.'
  },
  'toon-3d': {
    document: 'A rendered prop book with clean shaders and soft rim light.'
  },
  'arcade-2d': {
    document: 'A painted scroll item held up on the stage like a game item, without text.',
    map: 'A painted stage-select overview with the route as painted terrain.',
    reaction: 'Spectator sprites at the stage edge.'
  }
};

const APPEARANCE_WORDS = [
  'armor', 'armour', 'helmet', 'boots', 'robe', 'cloak', 'sleeve', 'sleeves',
  'beard', 'hair', 'uniform', 'costume', '갑옷', '투구', '부츠', '도포', '망토',
  '소매', '수염', '머리', '제복', '복식'
];

function idsOf(ids) {
  if (Array.isArray(ids)) return ids.filter(id => typeof id === 'string' && id.trim());
  return typeof ids === 'string' && ids.trim() ? [ids] : [];
}

function cutTreatment(preset, cutType) {
  if (!CUT_TYPES.includes(cutType)) return '';
  const resolvedPreset = preset === 'spatial-explainer' ? 'cinematic-miniature' : preset;
  return [BASE[cutType], PRESET_NOTES[resolvedPreset]?.[cutType]].filter(Boolean).join(' ');
}

function castLines(cast, ids, cutType) {
  if (!PEOPLE_CUT_TYPES.has(cutType) || !cast || typeof cast !== 'object') return [];
  const entries = idsOf(ids).map(id => cast[id]).filter(entry => entry && typeof entry === 'object');
  const lines = [];
  if (cutType === 'insert') {
    for (const entry of entries) {
      if (typeof entry.name === 'string' && entry.name.trim())
        lines.push(`Only the hands, sleeves and boots of ${entry.name.trim()} are in frame.`);
    }
  }
  for (const entry of entries) {
    if (typeof entry.name === 'string' && entry.name.trim() && typeof entry.sheet === 'string' && entry.sheet.trim())
      lines.push(`Cast — ${entry.name.trim()}: ${entry.sheet}`);
  }
  return lines;
}

function defaultStyleRole(cutType, ids) {
  if (['document', 'map', 'scenery'].includes(cutType)) return 'environment';
  if (cutType === 'action') return idsOf(ids).length > 1 ? 'interaction' : 'character';
  if (cutType === 'reaction' || cutType === 'insert') return 'interaction';
  return 'environment';
}

module.exports = { CUT_TYPES, BASE, PRESET_NOTES, APPEARANCE_WORDS, cutTreatment, castLines, defaultStyleRole };
