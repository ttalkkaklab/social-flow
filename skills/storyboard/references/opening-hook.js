'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const catalog = require('./opening-hook-types.json');
const ids = catalog.map(row => row.id);
const isDirection = value => typeof value === 'string' && /^D[1-9]\d*$/.test(value);
const own = (object, key) => object != null && Object.hasOwn(object, key);
const bad = (code, where, message) => ({ level: 'bad', code, where, what: code + ': ' + message });

function selectionFinding(value, where = 'STORY.primaryHookType') {
  if (value === undefined || value === null || value === '') return bad('hook_type_required', where, 'select one opening hook type');
  return ids.includes(value) ? null : bad('hook_type_invalid', where, 'expected one catalog ID');
}

function checkSynopses(options) {
  const findings = [], directions = new Set();
  if (!Array.isArray(options) || !options.length)
    findings.push(bad('hook_type_required', 'synopses', 'provide at least one synopsis'));
  else options.forEach((option, index) => {
    const where = 'synopses[' + index + ']';
    const allowed = ['direction', 'text', 'primaryHookType'];
    for (const key of Object.keys(option || {})) {
      if (!allowed.includes(key)) findings.push(bad('synopsis_field', where + '.' + key, 'unknown synopsis field'));
    }
    const direction = option?.direction;
    if (!isDirection(direction) || directions.has(direction))
      findings.push(bad('synopsis_direction', where + '.direction', 'each synopsis needs a distinct direction such as D1 or D2'));
    directions.add(direction);
    if (typeof option?.text !== 'string' || !option.text.trim())
      findings.push(bad('synopsis_text', where + '.text', 'provide the complete synopsis prose'));
    const issue = selectionFinding(option?.primaryHookType, where + '.primaryHookType');
    if (issue) findings.push(issue);
  });
  return { files: [], findings, violations: findings.length, warnings: 0, ...(!findings.length ? { synopses: options.map(({direction, text, primaryHookType}) => ({direction, text, primaryHookType})) } : {}) };
}

function readSelected(directory) {
  const file = path.join(directory, 'scenario.md');
  let bytes;
  try { bytes = fs.readFileSync(file); }
  catch (error) {
    if (error.code === 'ENOENT') return { hash: null };
    throw error;
  }
  const hash = crypto.createHash('sha256').update(bytes).digest('hex');
  try {
    const source = bytes.toString('utf8');
    const { body, errors, meta } = require('./check-scenario.js').parseScenario(source);
    if (errors.length || meta.version !== 'scenario-v2' || !isDirection(meta.direction))
      throw Error(errors[0] || 'expected scenario-v2 frontmatter and its selected direction');
    const { primaryHookType } = require('./scenario-v2.js').readContract(body);
    const issue = selectionFinding(primaryHookType, 'scenario.md.primaryHookType');
    return issue ? { hash, issue } : { hash, primaryHookType, direction: meta.direction };
  } catch (error) {
    return { hash, issue: bad('hook_type_invalid', 'scenario.md', error.message) };
  }
}

function boardFinding(story, selected) {
  const issue = selectionFinding(story?.primaryHookType);
  if (issue || selected.issue) return issue || selected.issue;
  if (story.hookContractVersion !== 1) return bad('hook_type_invalid', 'STORY.hookContractVersion', 'expected version 1');
  if (selected.hash !== null && selected.primaryHookType !== story.primaryHookType)
    return bad('hook_type_conflict', 'scenario.md', 'the selected scenario and board have different opening hook types');
  return null;
}

function enrolled(story) {
  return own(story, 'primaryHookType') || own(story, 'hookContractVersion');
}

function hasReview(directory) {
  return fs.existsSync(path.join(directory, 'opening-review.json'));
}

function checkBoardHook(board, directory) {
  if (!enrolled(board.STORY) && !hasReview(directory)) return [];
  const issue = boardFinding(board.STORY, readSelected(directory));
  return issue ? [issue] : [];
}

function hasStory(board) {
  const s = board.STORY || {};
  return !!(board.SCENES?.length || board.STRUCTURE?.sequences?.length || board.STRUCTURE?.scenes?.length ||
    Object.keys(s).some(key => !['audienceSoundVersion','hookContractVersion','primaryHookType','authoring','version','language','review'].includes(key)) ||
    board.COMPREHENSION?.answer);
}

// The HTML overlay's first and later reveal groups in produce/references/video-template.html.
function visibleCardText(board, shot) {
  const theme = board.THEME || {};
  const clean = (...items) => items.flatMap(item => {
    const text = typeof item === 'number' ? String(item) : typeof item === 'string' ? item.trim() : '';
    return text ? [text.replace(/\*\*(.+?)\*\*/g, '$1')] : [];
  });
  const visual = shot.visual || {}, renderer = shot.shot?.render?.mode;
  if (visual.overlay !== 'html' || visual.reuse || visual.picture === 'ai-video' ||
      board.PRODUCTION?.mode === 'full_video' || renderer === 'generated_video' || renderer === 'stock_video') return null;
  if (shot.type === 'cover') return { first: clean(shot.kicker, shot.title), later: clean(shot.stat, shot.statLabel) };
  if (shot.type === 'quote') {
    const footage = visual.source === 'recording' || visual.picture === 'recording';
    return { first: clean(shot.speaker, shot.role, ...(footage ? [] : [shot.text])), later: [] };
  }
  if (shot.type === 'outro') return { first: clean(theme.brand, shot.title, shot.sub), later: [] };
  if (shot.type === 'points') {
    const captions = (Array.isArray(shot.bullets) ? shot.bullets : []).filter(b => typeof b?.t === 'string' && b.t.trim()).map(b => clean(b.t, b.d));
    const heading = clean(shot.title, shot.footnote);
    return { first: heading.length ? heading : captions.shift() ?? [], later: captions.flat() };
  }
  return { first: [], later: [] };
}

const pick = (item, keys) => Object.fromEntries(keys.filter(key => own(item, key)).map(key => [key, item[key]]));
const list = items => Array.isArray(items) ? items : [];

// Read the same playback order as the storyboard, including inserted footage. Ignore paths,
// provider receipts and regenerated media when the authored opening remains the same.
function openingContent(board, existingIds) {
  const sequence = board.STRUCTURE?.sequences?.[0], scenes = list(board.STRUCTURE?.scenes);
  const shots = list(board.SCENES);
  const playback = require('./structure-contract.js').outline(board,'outline').playback;
  const window = [], sceneClocks = new Map();
  let elapsed = 0;
  for (const {no} of playback) {
    if (elapsed >= 3) break;
    const shot = shots[no-1], scene = scenes.find(s => s.no === shot.scene);
    const time = shot.timeline || {}, design = shot.shot?.videoDesign || {}, video = scene?.videoDirection || {};
    const fps = Number.isFinite(video.fps) && video.fps > 0 ? video.fps : 24;
    const explicit = Number.isFinite(time.startFrame) && Number.isFinite(time.endFrame) && time.endFrame > time.startFrame;
    const duration = explicit ? (time.endFrame - time.startFrame) / fps : shot.duration;
    const known = Number.isFinite(duration) && duration > 0;
    const span = known ? Math.min(3 - elapsed, duration) : 3 - elapsed;
    const clock = sceneClocks.get(shot.scene) || 0;
    const within = offset => offset >= 0 && offset < span;
    const interval = group => group?.end > 0 && group?.start < span;
    const images = list(time.images).filter(image => !explicit || within((image.frame - time.startFrame)/fps));
    const dialogues = list(time.dialogueCues).filter(cue => !explicit || within((cue.frame - time.startFrame)/fps));
    const effects = list(shot.sound?.effects).filter(effect => within(effect?.atSeconds ?? effect?.offsetSeconds ?? effect?.offset ?? 0));
    const clip = shot.visual?.reuse?.clip ?? shot.visual?.clip;
    const transcript = list(board.STORY?.transcripts).find(row => row?.shot === no && row.source === clip);
    window.push({
      id: existingIds.has(shot.id) ? shot.id : undefined, span, summary:shot.summary,
      scene: scene && [scene.summary,scene.event], text:visibleCardText(board,shot),
      action:shot.visual?.action, design:pick(design,['before','action','after']),
      view:pick(shot.visual?.camera?.view,['subject','subjectId','mode']),
      timing:pick(shot.edit,['pre','in','out']), timeline:pick(time,['framing','action']),
      images:images.map(image => pick(image,['frame','role','cue'])), dialogueCues:dialogues.map(cue => pick(cue,['frame','lineId'])),
      lines:list(shot.narration).map(line => pick(line,['tts','sub','speaker','delivery'])),
      performance:list(shot.performance).map(event => pick(event,['kind','group','withGroup','character','to','text','durationSeconds'])),
      recorded:list(transcript?.groups).filter(interval).map(group => pick(group,['text','speaker','start','end'])),
      sounds:effects.map(effect => pick(effect,['description','cue','name','atSeconds','offsetSeconds','offset'])),
      sceneSounds:list(video.audio?.cues).filter(cue => within(cue.frame/fps-clock)).map(cue => pick(cue,['frame','action'])),
    });
    if (!known) break;
    elapsed += duration;
    sceneClocks.set(shot.scene,clock+duration);
  }
  const firstScene = scenes.find(scene => scene.no === sequence?.scenes?.[0]) || scenes[0];
  return {opening:board.STORY?.opening, thesis:board.STORY?.thesis, answer:board.COMPREHENSION?.answer, window,
    outline:!window.length ? [sequence?.purpose,sequence?.question,firstScene?.summary,firstScene?.event] : undefined};
}

function resolveBoardHook(before, after, patch, options = {}) {
  const old = before.STORY, next = after.STORY;
  const marked = enrolled(old) || hasReview(options.directory), wasStory = hasStory(before);
  const declaresStory = patch.globals?.STORY && Object.keys(patch.globals.STORY).some(key => key !== 'audienceSoundVersion');
  const fresh = !wasStory && (hasStory(after) || declaresStory);
  const idsBefore = new Set(list(before.SCENES).map(shot => shot?.id).filter(Boolean));
  const replaced = !marked && wasStory && (!isDeepStrictEqual(openingContent(before,idsBefore), openingContent(after,idsBefore)) ||
    (patch.set && !options.outline && !isDeepStrictEqual(before.SCENES?.map(s => s.summary), after.SCENES?.map(s => s.summary))));
  if (!fresh && !marked && !replaced && !enrolled(next) && options.requested === undefined)
    return {};
  const selected = readSelected(options.directory);
  const output = { selectedHash: selected.hash };
  const fail = issue => ({ ...output, issue });
  if (selected.issue) return fail(selected.issue);
  const explicitOld = own(options, 'previous');
  if (explicitOld && (options.previous !== (old?.primaryHookType ?? null) || !options.expectedSha256 || !options.requested))
    return fail(bad('hook_type_conflict', 'previousPrimaryHookType', 'reselection requires the current board SHA, old ID and new ID'));
  const damaged = marked && (old?.hookContractVersion !== 1 || !ids.includes(old?.primaryHookType));
  if (damaged && !explicitOld) return fail(boardFinding(old, selected));
  if (marked && !damaged && (!enrolled(next) || next?.hookContractVersion !== 1 || next?.primaryHookType !== old?.primaryHookType))
    return fail(bad('hook_type_conflict', 'STORY', 'preserve the saved hook fields in a raw board replacement'));
  if (!marked && own(next, 'hookContractVersion') && next.hookContractVersion !== 1)
    return fail(bad('hook_type_invalid', 'STORY.hookContractVersion', 'expected version 1'));
  const supplied = options.requested !== undefined ? options.requested : next?.primaryHookType;
  if (supplied !== undefined) {
    const issue = selectionFinding(supplied);
    if (issue) return fail(issue);
  }
  const type = supplied === undefined ? selected.primaryHookType : supplied;
  if (wasStory && !marked && type && !explicitOld)
    return fail(bad('hook_type_conflict', 'STORY', 'enroll this legacy board with story_sequence, its SHA and previousPrimaryHookType null'));
  if (marked && type !== old?.primaryHookType && !explicitOld)
    return fail(bad('hook_type_conflict', 'STORY.primaryHookType', 'reselect with the current board SHA and previous ID'));
  const story = { ...next, primaryHookType: type, hookContractVersion: 1 };
  const issue = boardFinding(story, selected);
  return issue ? fail(issue) : { ...output, story };
}

module.exports = { catalog, ids, selectionFinding, checkSynopses, readSelected, checkBoardHook, resolveBoardHook, visibleCardText };
