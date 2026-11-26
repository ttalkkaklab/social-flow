(function (root) {
'use strict';

const text = x => typeof x === 'string' && !!x.trim();
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const cueText = value => text(value) ? value.trim().replace(/\s+/g, ' ') : '';

// A linked action shares the speech moment even if its storage position comes earlier.
function orderedPerformance(raw) {
  const groups = new Map();
  raw.forEach((e, j) => {
    if (['dialogue', 'narration'].includes(e?.kind) && Number.isInteger(e.group) && e.group > 0)
      groups.set(e.group, groups.has(e.group) ? null : j);
  });
  const linked = new Set(raw.filter(e => e?.kind === 'action' && groups.get(e.withGroup) != null).map(e => groups.get(e.withGroup)));
  return raw.map((e, j) => {
    const anchor = e?.kind === 'action' ? groups.get(e.withGroup) : undefined;
    const moment = anchor ?? j;
    return { e, j, moment, ...(linked.has(moment) ? { together: moment + 1 } : {}),
      ...(e?.withGroup !== undefined && anchor == null ? { unresolvedTiming: true } : {}) };
  }).sort((a, b) => a.moment - b.moment || a.j - b.j);
}

// Performance is ordered observable evidence. Intent/subtext is deliberately excluded.
// Speech points at the production text instead of maintaining another script copy.
function storyPerformance(win, { audienceOnly = false } = {}) {
  const scenes = Array.isArray(win.SCENES) ? win.SCENES : [];
  const direction = typeof module === 'object' && module.exports ? require('./shot-direction.js') : root.SHOT_DIRECTION;
  const order = direction.playbackEntries(scenes).filter(row => !row.unscheduled && row.s.type !== 'outro');
  return order.flatMap(({i}) => {
    const raw = Array.isArray(scenes[i].performance) ? scenes[i].performance : [];
    return orderedPerformance(raw).map(({e, j, together, unresolvedTiming}) => {
      const s = scenes[i], validGroup = Number.isInteger(e?.group) && e.group > 0;
      const n = validGroup && Array.isArray(s.narration) ? s.narration[e.group - 1] : undefined;
      const transcriptGroups = (Array.isArray(win.STORY?.transcripts) ? win.STORY.transcripts : []).find(t => t?.shot === i + 1)?.groups;
      const transcript = validGroup && Array.isArray(transcriptGroups) ? transcriptGroups[e.group - 1] : undefined;
      const speech = [n?.tts, transcript?.text];
      const quote = e?.kind === 'action' ? (text(e.text) ? e.text : '')
        : ['dialogue', 'narration'].includes(e?.kind) ? speech.find(text) || '' : '';
      const visual = ['dialogue','narration'].includes(e?.kind) && cueText(e.videoDirection || n?.acting?.visual);
      const unresolvedVisual = visual && !raw.some(action => action?.kind === 'action' && action.withGroup === e.group &&
        text(action.text) && [cueText(action.text), cueText(action.videoDirection)].includes(visual));
      if (audienceOnly) {
        // Even a file or cast ID can identify a disguised caller. Public labels apply to this instant only.
        if (unresolvedTiming) return { shot:i + 1, event:j + 1, kind:e?.kind, quote:'', unresolvedTiming:true };
        return { shot: i + 1, event: j + 1, kind: e?.kind, quote, ...(together ? {together} : {}), ...(unresolvedVisual ? {unresolvedVisual:true} : {}),
          ...(text(e?.audience?.speaker) ? { character: e.audience.speaker } : {}),
          ...(text(e?.audience?.listener) ? { to: e.audience.listener } : {}),
          ...(['on_screen', 'off_screen', 'voiceover'].includes(n?.delivery) ? { delivery: n.delivery } : {}) };
      }
      return { shot: i + 1, ...(text(s.id) ? { shotId: s.id } : {}), event: j + 1, ...(together ? {together} : {}), ...(unresolvedTiming ? {unresolvedTiming:true} : {}),
        ...(unresolvedVisual ? {unresolvedVisual:true} : {}),
        ...(text(n?.sub) && n.sub !== quote ? {displayText:n.sub} : {}),
        ...(['dialogue', 'narration'].includes(e?.kind) && text(n?.id) ? { lineId: n.id } : {}),
        ...(['dialogue', 'narration'].includes(e?.kind) && text(n?.delivery) ? { delivery: n.delivery } : {}),
        kind: e?.kind, character: e?.character,
        to: e?.to, group: e?.group, quote, ...(!quote ? {unresolved: true} : {}) };
    });
  });
}

function sameMoment(a, b) {
  return !!a && !!b && a.shot === b.shot && (a.together ?? a.event) === (b.together ?? b.event);
}

function beatRange(beat, events) {
  function position(ref) {
    if (!object(ref) || !Number.isInteger(ref.event) || ref.event < 1) return -1;
    if (text(ref.shotId) === Number.isInteger(ref.shot)) return -1;
    return events.findIndex(e => e.event === ref.event && (text(ref.shotId) ? e.shotId === ref.shotId : e.shot === ref.shot));
  }
  if (!object(beat)) return [-1, -1];
  if (beat.start !== undefined || beat.end !== undefined) return [position(beat.start), position(beat.end)];
  return [events.findIndex(e => e.shot === beat.shot), events.findLastIndex(e => e.shot === beat.shot)];
}

function checkBeatRanges(beats, events, publicEvents, fail) {
  if (!Array.isArray(beats) || !beats.length) {
    if (events.length) fail('STORY.beats has no authored change to review');
    return;
  }
  let previousEnd = -1, previousEvidence = '';
  const indexed = beats.map((beat, i) => ({i, beat, bounds:beatRange(beat, events)}));
  // Whole-shot notes historically had no ordering constraint, including appended b-roll.
  if (beats.every(b => b && b.start === undefined && b.end === undefined))
    indexed.sort((a,b) => a.bounds[0] - b.bounds[0]);
  for (const {i, beat, bounds} of indexed) {
    const where = 'STORY.beats[' + i + ']';
    if (!object(beat) || !text(beat.change) || !text(beat.necessity)) {
      fail(where + ' needs change and necessity'); continue;
    }
    const [start, end] = bounds;
    if (start < 0 || end < start || start <= previousEnd) {
      fail(where + ' needs existing event bounds in playback order without overlap'); continue;
    }
    if (sameMoment(events[start - 1], events[start]) || sameMoment(events[end], events[end + 1]))
      fail(where + ' splits simultaneous evidence. Put the beat boundary before or after the whole moment.');
    const evidence = JSON.stringify(publicEvents.slice(start, end + 1).map((e, i, rows) =>
      [e.kind, e.character, e.to, e.delivery, e.quote.trim().replace(/\s+/g, ' '), i > 0 && sameMoment(rows[i - 1], e)]));
    if (start === previousEnd + 1 && evidence === previousEvidence)
      fail(where + ' repeats the preceding performed evidence exactly; inspect the change from the viewer’s position');
    previousEnd = end; previousEvidence = evidence;
  }
}

function checkPerformanceStory(win, { requireReview = false, hash } = {}) {
  const errors = [], fail = s => errors.push(s), story = win.STORY;
  const scenes = Array.isArray(win.SCENES) ? win.SCENES : [];
  if (!['evidence', 'fiction', 'adapted'].includes(story.kind)) fail('STORY.kind must be evidence, fiction or adapted');
  if (!['narration', 'dialogue', 'visual', 'mixed'].includes(story.expression)) fail('STORY.expression is required');
  for (const key of ['viewerNeed', 'thesis', 'basis', 'endingReason']) if (!text(story[key])) fail('STORY.' + key + ' is required');
  if (story.kind === 'adapted' && !text(story.adaptationBoundary)) fail('STORY.adaptationBoundary is required');
  const cast = Array.isArray(story.cast) ? story.cast : [], ids = new Set();
  for (const c of cast) {
    if (!object(c) || !text(c.id) || ids.has(c.id)) { fail('STORY.cast requires unique character IDs'); continue; }
    ids.add(c.id);
    for (const key of ['role', 'want', 'voice', 'source']) if (!text(c[key])) fail('STORY.cast ' + c.id + ' requires ' + key);
  }
  if (!cast.length) fail('STORY.cast is required');
  if (story.transcripts !== undefined && !Array.isArray(story.transcripts)) fail('STORY.transcripts must be an array');
  for (const t of Array.isArray(story.transcripts) ? story.transcripts : [])
    if (!Number.isInteger(t?.shot) || !scenes[t.shot - 1] || scenes[t.shot - 1].type === 'outro') fail('transcript references an invalid shot');
  const used = new Set();
  scenes.forEach((s, i) => {
    if (!object(s)) { fail('shot ' + (i + 1) + ' must be an object'); return; }
    if (s.type === 'outro') return;
    const events = Array.isArray(s.performance) ? s.performance : [];
    if (!events.length) fail('shot ' + (i + 1) + ' requires performance events');
    for (const row of orderedPerformance(events)) if (row.unresolvedTiming)
      fail('shot ' + (i + 1) + ' event ' + (row.j + 1) + ' withGroup must identify one performed speech group in this shot');
    const groups = Array.isArray(s.narration) ? s.narration : [];
    const live = (Array.isArray(story.transcripts) ? story.transcripts : []).filter(t => t?.shot === i + 1);
    if (live.length > 1) fail('duplicate transcript for shot ' + (i + 1));
    const transcript = live[0];
    if (transcript && (groups.length || !text(transcript.source) || transcript.source !== (s.visual?.reuse?.clip || s.visual?.clip) ||
        !(s.visual?.reuse || s.visual?.source === 'recording') || !Array.isArray(transcript.groups))) fail('transcript requires matching live recording and no generated speech');
    let end = 0;
    for (const g of Array.isArray(transcript?.groups) ? transcript.groups : []) {
      if (!text(g?.text) || !Number.isFinite(g.start) || !Number.isFinite(g.end) || g.start < end || g.end <= g.start ||
          (s.visual?.reuse && g.end > s.duration)) fail('transcript requires ordered timed speech within the reused clip');
      end = g?.end;
    }
    const spoken = groups.length ? groups : Array.isArray(transcript?.groups) ? transcript.groups : [], seen = new Set();
    let lastGroup = 0;
    events.forEach(e => {
      if (!object(e) || !['action', 'dialogue', 'narration'].includes(e.kind)) { fail('invalid performance event'); return; }
      // An action nobody performs is an event in the world: a door slams in the wind, the power goes out.
      const worldEvent = e.kind === 'action' && e.character === undefined;
      if (!worldEvent && !ids.has(e.character)) fail('performance character is not cast: ' + e.character);
      if (!worldEvent) used.add(e.character);
      if (e.kind === 'action') {
        if (!text(e.text) || e.group !== undefined) fail('action requires visible text and no speech group');
      } else {
        const n = spoken[e.group - 1];
        if (!Number.isInteger(e.group) || !n || seen.has(e.group) || e.group <= lastGroup) fail('speech events require ordered unique narration groups');
        seen.add(e.group); lastGroup = e.group;
        if (!text(n?.tts) && !text(n?.sub) && !text(n?.text)) fail('speech group is empty');
        if (n?.speaker !== e.character) fail('speech speaker must equal performance character');
        if (e.text !== undefined) fail('speech event must reference a group, not duplicate text');
        if (e.kind === 'dialogue' && !ids.has(e.to) && !['self', 'audience', 'unidentified'].includes(e.to)) fail('dialogue requires a known addressee or unidentified in-world listener');
      }
    });
    if (seen.size !== spoken.length) fail('performance must include every speech group exactly once');
  });
  for (const id of ids) if (!used.has(id)) fail('unused STORY.cast member: ' + id);
  const events = storyPerformance(win), publicEvents = storyPerformance(win, {audienceOnly:true});
  for (const e of events) if (e.unresolvedVisual)
    fail('shot ' + e.shot + ' event ' + e.event + ' describes a concurrent visual in its speech direction but has no matching audience action. Link it with withGroup or move an earlier action to its actual moment.');
  const speech = events.filter(e => e.kind !== 'action');
  if (story.expression === 'visual' && speech.length) fail('visual expression must not contain speech');
  if (story.expression === 'dialogue' && speech.some(e => e.kind === 'narration')) fail('dialogue expression cannot include narrator speech');
  if (story.expression === 'narration' && speech.some(e => e.kind === 'dialogue')) fail('narration expression cannot include dialogue');
  scenes.forEach((s, i) => {
    if (s && s.type !== 'outro' && !(s.narration || []).length && !(Array.isArray(story.transcripts) && story.transcripts.some(t => t?.shot === i + 1)) &&
        (!Number.isFinite(s.duration) || s.duration <= 0)) fail('silent performance shot requires a positive duration');
  });
  function ref(r, label) {
    const index = events.findIndex(e => e.shot === r?.shot && e.event === r?.event);
    const e = publicEvents[index];
    if (!object(r) || !Number.isInteger(r.shot) || !Number.isInteger(r.event) || !text(r.quote) || !e ||
        !text(e.quote) || !e.quote.includes(r.quote) || r.quote.trim().length < Math.min(12, Math.ceil(e.quote.trim().length / 2))) {
      fail(label + ' requires an exact observable event quote with 1-based shot/event'); return -1;
    }
    return index;
  }
  const opening = ref(story.opening, 'STORY.opening'), payoff = ref(story.payoff, 'STORY.payoff'), ending = ref(story.ending, 'STORY.ending');
  if (!sameMoment(events[opening], events[0])) fail('STORY.opening must reference the first event');
  if (!sameMoment(events[ending], events.at(-1))) fail('STORY.ending must reference the last event');
  if (payoff >= 0 && ((payoff < opening && !sameMoment(events[payoff], events[opening])) ||
    (payoff > ending && !sameMoment(events[payoff], events[ending])))) fail('STORY.payoff must fall between opening and ending');
  if (sameMoment(events[payoff], events[opening]) && story.reveal !== 'upfront') fail('opening payoff requires reveal upfront');
  if (!['held', 'upfront', 'none'].includes(story.reveal)) fail('STORY.reveal is required');

  checkBeatRanges(story.beats, events, publicEvents, fail);
  if (!requireReview) return errors;
  const review = story.review;
  if (!object(review)) return [...errors, 'STORY.review is absent; no prior review evidence is available'];
  if (review.hash !== hash) fail('STORY.review is stale; reread the current performance');
  if (review.verdict !== 'pass' || !Array.isArray(review.unresolved) || review.unresolved.length) fail('STORY.review reports an unresolved or non-pass result');
  for (const key of ['meaning', 'progression', 'payoff', 'grounding', 'character']) {
    const item = review[key];
    if (!object(item) || !text(item.reason) || !Array.isArray(item.refs) || !item.refs.length) { fail('STORY.review.' + key + ' needs reasoning and event evidence'); continue; }
    item.refs.forEach((r, i) => ref(r, 'STORY.review.' + key + '.refs[' + i + ']'));
  }
  return errors;
}
const api = { orderedPerformance, storyPerformance, beatRange, sameMoment, checkPerformanceStory };
if (typeof module === 'object' && module.exports) module.exports = api;
else root.StoryPerformance = api;
})(typeof window === 'object' ? window : globalThis);
