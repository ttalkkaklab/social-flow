'use strict';

const CUT_TYPES = ['action', 'reaction', 'insert', 'document', 'map', 'scenery'];
const PEOPLE_CUT_TYPES = new Set(['action', 'reaction', 'insert']);

const BASE = {
  action: "Cut type action: show the planned physical action and its point of contact within the shot's camera framing; the visible actor parts and the thing acted on stay legible.",
  reaction: "Cut type reaction: show the planned response through the visible expression, posture or gesture within the shot's camera framing; include only the subjects specified for this shot.",
  insert: 'Cut type insert: concentrate on the specified hands, feet, props or their relationship; the face stays outside the frame. Follow the shot camera framing and depth plan for distance, scale and sharp planes; keep every intended detail readable.',
  document: 'Cut type document: a written record as a physical object — a book, scroll, letter or ledger on a surface; three-quarter high angle; the pages carry texture and marks only, without readable characters; the frame holds only the record and its surface.',
  map: 'Cut type map: a spatial overview of the place — terrain, route and landmarks as physical relief seen from above; landmarks read as shapes without lettering; people, if any, are far specks.',
  scenery: 'Cut type scenery: a wide establishing or transition view of the place and its light; people are small distant shapes; the frame edges carry the world.'
};

const PRESET_NOTES = {
  'cinematic-miniature': {
    insert: 'At miniature scale, visible hands and props retain model materials: painted fingers, cloth fibre and figure seams, at the authored camera distance.',
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
    insert: "Any visible hands use the episode's line weight."
  },
  claymation: {
    document: 'A clay book with thumbprinted pages.',
    insert: 'Any visible hands use clay with visible thumbprints.'
  },
  'paper-cutout': {
    document: 'A single paper sheet layer with a torn edge, lit from the side.',
    map: 'Terrain as stacked paper contour layers.'
  },
  'ink-wash': {
    document: 'The record is the painting itself: a scroll in brush strokes whose blank paper is the frame.',
    map: 'A brushed map with mountains as ink ranges and the route as the one accent line.',
    insert: 'Any visible hands use a few calligraphic strokes; props use ink.'
  },
  'toon-3d': {
    document: 'A rendered prop book with clean shaders and soft rim light.'
  },
  'arcade-2d': {
    document: 'For this document cut, a painted scroll item is held up on the stage; the stage holds only the scroll item and its painted backdrop.',
    map: 'A painted stage-select overview with the route as painted terrain.',
    reaction: 'The reacting character uses the same painted sprite treatment as the episode.',
    scenery: 'A wide establishing stage fills the frame; any people read as small distant painted sprite silhouettes while layered parallax scenery carries the arcade look.'
  }
};

const APPEARANCE_WORDS = [
  'armor', 'armour', 'helmet', 'boots', 'robe', 'cloak', 'sleeve', 'sleeves',
  'beard', 'hair', 'uniform', 'costume', '갑옷', '투구', '부츠', '도포', '망토',
  '소매', '수염', '머리카락', '제복', '복식'
];

function idsOf(ids) {
  const values = Array.isArray(ids) ? ids : ids ? [ids] : [];
  return values.map(value => typeof value === 'string' ? value : value?.id)
    .filter(id => typeof id === 'string' && id.trim());
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
        lines.push(`Show only the parts of ${entry.name.trim()} specified by the insert framing; the face stays outside the frame. Use the cast sheet for identity of visible parts only.`);
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
