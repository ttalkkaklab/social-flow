'use strict';

// Media diagnostics, not a creative approval gate. Never infer a slot from a scene image.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const sha = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const SLOT_LABELS = { front: '정면', back: '후면', face: '얼굴' };
const SPECS = { front: { ratio: 2 / 3, min: .80, max: .90 }, back: { ratio: 2 / 3, min: .80, max: .90 }, face: { ratio: 1, min: .60, max: .75 } };
function localFile(folder, name) {
  if (typeof name !== 'string' || !name || path.isAbsolute(name)) return null;
  const file = path.resolve(folder, name);
  try {
    const relative = path.relative(fs.realpathSync(folder), fs.realpathSync(file));
    return relative && !relative.startsWith('..') && !path.isAbsolute(relative) && fs.statSync(file).isFile() ? file : null;
  } catch { return null; }
}
function dimensions(file) {
  const data = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', file], { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'] }));
  const { width, height } = data.streams?.[0] || {};
  if (!(width > 0 && height > 0)) throw new Error('Unreadable image dimensions');
  return { width, height };
}
function inspectPanels(folder, fallback = {}) {
  const findings = [], slots = {}, measurements = {};
  const warn = (domain, message, messageKo) => findings.push({ domain, message, messageKo });
  let manifest;
  const manifestFile = path.join(folder, 'panels.json');
  if (fs.existsSync(manifestFile)) {
    try {
      const safe = localFile(folder, 'panels.json');
      if (!safe) throw new Error('unsafe manifest path');
      manifest = JSON.parse(fs.readFileSync(safe, 'utf8'));
      if (manifest?.schemaVersion !== 1 || !manifest.panels || typeof manifest.panels !== 'object' || Array.isArray(manifest.panels)) throw new Error('expected schemaVersion:1 and panels');
    } catch (error) { warn('image-purpose', 'Invalid panels.json: ' + error.message, '이미지 등록 정보를 읽을 수 없습니다. 공용 참조 용도를 확인하세요.'); manifest = { panels: {} }; }
  } else warn('image-purpose', 'No panels.json: legacy filenames do not verify shared-character purpose', '이미지는 있지만 공용 캐릭터 참조로 등록되었는지 확인하지 않았습니다.');
  for (const [slot, spec] of Object.entries(SPECS)) {
    const entry = manifest?.panels?.[slot];
    const name = manifest ? entry?.file : fallback[slot];
    const file = localFile(folder, name);
    if (!file) { warn('image-slot', slot + ': missing or unsafe shared reference', SLOT_LABELS[slot] + ': 공용 참조 이미지가 없거나 경로가 잘못되었습니다.'); continue; }
    if (manifest && (entry.purpose !== 'character_reference' || entry.view !== slot)) {
      warn('image-purpose', slot + ': expected character_reference with matching view; image not assigned', SLOT_LABELS[slot] + ': 이미지 용도나 촬영 방향이 달라 이 칸에 표시하지 않습니다.'); continue;
    }
    slots[slot] = path.relative(folder, file).split(path.sep).join('/');
    const hash = sha(file);
    try {
      const size = dimensions(file); measurements[slot] = size;
      if (Math.abs(size.width / size.height - spec.ratio) > .01) warn('image-ratio', `${slot}: ${size.width}x${size.height}; expected ${slot === 'face' ? '1:1' : '2:3'}`, `${SLOT_LABELS[slot]}: 원본 ${size.width}×${size.height}, 권장 비율 ${slot === 'face' ? '1:1' : '2:3'}`);
    } catch { warn('image-ratio', slot + ': dimensions unavailable; not verified', SLOT_LABELS[slot] + ': 원본 크기를 읽지 못해 비율을 확인하지 않았습니다.'); }
    const framing = entry?.framing;
    const box = framing?.subjectBox;
    if (framing?.status !== 'measured' || framing.sha256 !== hash || !Array.isArray(box) || box.length !== 4 || !box.every(v => typeof v === 'number' && Number.isFinite(v)) || box[0] < 0 || box[1] < 0 || box[2] <= 0 || box[3] <= 0 || box[0] + box[2] > 1 || box[1] + box[3] > 1) {
      warn('image-framing', slot + ': subject size not reviewed or measurement stale', SLOT_LABELS[slot] + ': 인물 크기를 아직 확인하지 않았거나 확인 후 이미지가 바뀌었습니다.');
    } else {
      measurements[slot] = { ...measurements[slot], subjectHeight: box[3] };
      if (box[3] < spec.min || box[3] > spec.max) warn('image-framing', `${slot}: subject height ${Math.round(box[3] * 100)}%; expected ${spec.min * 100}–${spec.max * 100}%`, `${SLOT_LABELS[slot]}: 인물 높이 ${Math.round(box[3] * 100)}%, 권장 ${spec.min * 100}~${spec.max * 100}%`);
    }
  }
  const front = measurements.front, back = measurements.back;
  if (front && back && Math.abs(front.width / front.height - back.width / back.height) > .01) warn('image-ratio', 'Front/back aspect ratios differ', '정면과 후면의 원본 비율이 다릅니다.');
  if (front?.subjectHeight !== undefined && back?.subjectHeight !== undefined && Math.abs(front.subjectHeight - back.subjectHeight) > .03) warn('image-framing', 'Front/back subject heights differ by more than 3 percentage points', '정면과 후면의 인물 높이가 3%p 넘게 차이 납니다.');
  return { slots, findings, measurements };
}
function boardPanelFindings(win, boardDir, channelDir) {
  const entries = win?.SB_DOC?.characters || [];
  const chars = Array.isArray(entries) ? [...entries] : Object.entries(entries).map(([id, c]) => ({ ...c, id }));
  for (const id of Object.keys(win?.PRODUCTION?.cast || {})) {
    if (!chars.some(c => c?.id === id)) chars.push({ id });
  }
  const findings = [];
  const sceneFiles = (win?.SCENES || []).flatMap(s => [s.visual?.bg, s.visual?.source, s.bg]).filter(s => typeof s === 'string');
  const sceneHashes = new Set(sceneFiles.map(name => localFile(boardDir, name)).filter(Boolean).map(sha));
  for (const c of chars) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(c?.id || '')) continue;
    const folder = path.join(channelDir, 'assets', 'characters', c.id);
    if (!localFile(channelDir, path.relative(channelDir, path.join(folder, 'identity.md')))) findings.push({ characterId: c.id, domain: 'character-source', messageKo: '공용 캐릭터 설정이 없습니다. 캐스팅 전에 캐릭터 시트를 구성하세요.', message: 'Shared identity.md missing; prepare the character sheet before casting' });
    let registered;
    const manifestFile = localFile(channelDir, path.relative(channelDir, path.join(folder, 'panels.json')));
    if (manifestFile) {
      try { registered = JSON.parse(fs.readFileSync(manifestFile, 'utf8')).panels || {}; } catch { registered = {}; }
    }
    for (const [slot, entry] of Object.entries(registered || {})) {
      if (slot === 'msr') continue; // Optional derived transport reference, not a displayed canonical panel.
      const source = entry?.purpose === 'character_reference' && entry.view === slot && localFile(folder, entry.file);
      const linked = c.panels?.[slot] || (slot === 'front' && c.panels?.body);
      if (source && !(typeof linked === 'string' && linked.trim())) findings.push({
        characterId: c.id, domain: 'image-reference-missing', slot, source,
        field: `SB_DOC.characters.${c.id}.panels.${slot}`,
        messageKo: `${c.id} 배역의 ${slot} 참조가 비어 있습니다. 공용 이미지: ${source}`,
        message: `${c.id}: shared ${slot} image exists at ${source}, but storyboard panels.${slot} is empty`,
      });
    }
    for (const [slot, name] of Object.entries(c.panels || {})) {
      const file = typeof name === 'string' ? path.resolve(boardDir, name) : '';
      const shared = file && localFile(channelDir, path.relative(channelDir, file)) && localFile(folder, path.relative(folder, file));
      const view = slot === 'body' ? 'front' : slot;
      const entry = registered?.[view];
      const matches = registered === undefined || (entry?.purpose === 'character_reference' && entry.view === view && localFile(folder, entry.file) === shared);
      if (!shared || !matches || sceneHashes.has(sha(shared))) findings.push({ characterId: c.id, domain: 'image-purpose', messageKo: '장면 이미지이거나 공용 시트에 등록한 용도·방향과 다른 이미지가 연결되어 있습니다.', message: `${slot}: episode scene, non-shared image or mismatched registered slot linked as a character reference` });
    }
  }
  return findings;
}
// Resolve ownership from the episode cast, never from a transport filename or a scene image.
function sheetPanels(boardDir, ids) {
  let cast = [];
  const castFile = path.join(boardDir, 'cast.json');
  if (fs.existsSync(castFile)) {
    const value = JSON.parse(fs.readFileSync(castFile, 'utf8')).characters;
    cast = Array.isArray(value) ? value : Object.entries(value || {}).map(([id, entry]) => ({ ...entry, id }));
  }
  return new Map(ids.map(id => {
    const entry = cast.find(c => c.id === id);
    let folder;
    if (entry?.source) {
      const identity = path.resolve(boardDir, entry.source);
      folder = path.dirname(identity);
      if (path.basename(identity) !== 'identity.md' || path.basename(folder) !== id
        || path.basename(path.dirname(folder)) !== 'characters' || path.basename(path.dirname(path.dirname(folder))) !== 'assets')
        throw new Error(`cast_source_missing: ${id} needs its own assets/characters/${id}/identity.md`);
    }
    else for (let dir = boardDir; ; dir = path.dirname(dir)) {
      const candidate = path.join(dir, 'assets', 'characters', id);
      if (fs.existsSync(path.join(candidate, 'panels.json'))) { folder = candidate; break; }
      if (path.dirname(dir) === dir) break;
    }
    if (!folder) throw new Error(`character_sheet_missing: ${id} needs its shared panels.json`);
    let manifest;
    try { manifest = JSON.parse(fs.readFileSync(path.join(folder, 'panels.json'), 'utf8')); }
    catch { throw new Error(`character_sheet_missing: ${id} has an unreadable panels.json`); }
    const panels = {};
    for (const view of ['face', 'front', 'back']) {
      const panel = manifest.panels?.[view];
      const file = localFile(folder, panel?.file);
      // Older manifests omitted these tags; an explicitly different tag is never a character panel.
      if ((manifest.schemaVersion !== undefined && manifest.schemaVersion !== 1)
        || (panel?.purpose !== undefined && panel.purpose !== 'character_reference')
        || (panel?.view !== undefined && panel.view !== view) || !file)
        throw new Error(`character_panel_missing: ${id} has no ${view} panel with a valid character-reference registration`);
      panels[view] = path.relative(boardDir, file).split(path.sep).join('/');
    }
    return [id, panels];
  }));
}
function canonicalReferences(boardDir, shotId, ids, use, options = {}) {
  if (ids.length > 2) throw new Error('msr_character_limit: at most two principal characters');
  const sheets = sheetPanels(boardDir, ids);
  if (options.combined) return ids.map(id => {
    const sources = sheets.get(id);
    let folder = path.dirname(path.resolve(boardDir, sources.face));
    while (path.basename(folder) !== id || path.basename(path.dirname(folder)) !== 'characters') {
      const parent = path.dirname(folder);
      if (parent === folder) throw new Error(`character_sheet_missing: ${id} has no shared character folder`);
      folder = parent;
    }
    const entry = JSON.parse(fs.readFileSync(path.join(folder, 'panels.json'), 'utf8')).panels?.msr;
    const file = localFile(folder, entry?.file);
    if (!file || entry.purpose !== 'character_reference' || entry.view !== 'msr')
      throw new Error(`character_msr_reference_missing: ${id} needs a registered unified identity/outfit reference`);
    if (entry.sha256 !== sha(file) || ['face', 'front'].some(view => entry.sourceHashes?.[view] !== sha(path.resolve(boardDir, sources[view]))))
      throw new Error(`character_msr_reference_stale: ${id} unified reference or its canonical sources changed`);
    return { id: `${shotId}-${id}-msr`, path: path.relative(boardDir, file).split(path.sep).join('/'),
      role: 'character', use, purpose: `${id}: ONE person, exact face, hair, physique and outfit` };
  });
  const views = ids.length === 1 ? ['face', 'front', 'back'] : ['face', 'front'];
  return views.flatMap(view => ids.map(id => ({ id: `${shotId}-${id}-${view}`, path: sheets.get(id)[view],
    role: 'character', use, purpose: view === 'face' ? `${id}'s face and hair` : `${id}'s body and outfit, ${view}` })));
}
module.exports = { SPECS, dimensions, inspectPanels, boardPanelFindings, sheetPanels, canonicalReferences };
