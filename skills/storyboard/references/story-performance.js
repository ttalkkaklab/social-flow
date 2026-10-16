'use strict';

const text = x => typeof x === 'string' && !!x.trim();
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);

// Performance is ordered observable evidence. Intent/subtext is deliberately excluded.
// Speech points at the production text instead of maintaining another script copy.
function storyPerformance(win) {
  const scenes = Array.isArray(win.SCENES) ? win.SCENES : [];
  const order = [];
  scenes.forEach((s, i) => {
    if (s.type === 'outro' || s.type === 'broll') return;
    order.push(i);
    scenes.forEach((b, j) => { if (b.type === 'broll' && b.after === i) order.push(j); });
  });
  return order.flatMap(i => (Array.isArray(scenes[i].performance) ? scenes[i].performance : []).map((e, j) => {
    const s = scenes[i], n = s.narration?.[e?.group - 1];
    const transcript = (Array.isArray(win.STORY?.transcripts) ? win.STORY.transcripts : []).find(t => t?.shot === i + 1)?.groups?.[e?.group - 1];
    return { shot: i + 1, event: j + 1, kind: e?.kind, character: e?.character,
      to: e?.to, group: e?.group, quote: e?.kind === 'action' ? e.text : (n?.sub || n?.tts || transcript?.text || '') };
  }));
}

function checkPerformanceStory(win, { requireReview = true, hash } = {}) {
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
    if (s.type === 'outro') return;
    const events = Array.isArray(s.performance) ? s.performance : [];
    if (!events.length) fail('shot ' + (i + 1) + ' requires performance events');
    const groups = Array.isArray(s.narration) ? s.narration : [];
    const live = (Array.isArray(story.transcripts) ? story.transcripts : []).filter(t => t?.shot === i + 1);
    if (live.length > 1) fail('duplicate transcript for shot ' + (i + 1));
    const transcript = live[0];
    if (transcript && (groups.length || !text(transcript.source) || transcript.source !== (s.visual?.reuse?.clip || s.visual?.clip) ||
        !(s.visual?.reuse || s.visual?.source === 'recording') || !Array.isArray(transcript.groups))) fail('transcript requires matching live recording and no generated speech');
    let end = 0;
    for (const g of Array.isArray(transcript?.groups) ? transcript.groups : []) {
      if (!text(g?.text) || !Number.isFinite(g.start) || !Number.isFinite(g.end) || g.start < end || g.end <= g.start) fail('transcript requires ordered timed speech');
      end = g?.end;
    }
    const spoken = groups.length ? groups : Array.isArray(transcript?.groups) ? transcript.groups : [], seen = new Set();
    let lastGroup = 0;
    events.forEach(e => {
      if (!object(e) || !['action', 'dialogue', 'narration'].includes(e.kind)) { fail('invalid performance event'); return; }
      if (!ids.has(e.character)) fail('performance character is not cast: ' + e.character);
      used.add(e.character);
      if (e.kind === 'action') {
        if (!text(e.text) || e.group !== undefined) fail('action requires visible text and no speech group');
      } else {
        const n = spoken[e.group - 1];
        if (!Number.isInteger(e.group) || !n || seen.has(e.group) || e.group <= lastGroup) fail('speech events require ordered unique narration groups');
        seen.add(e.group); lastGroup = e.group;
        if (!text(n?.tts) && !text(n?.sub) && !text(n?.text)) fail('speech group is empty');
        if (n?.speaker !== e.character) fail('speech speaker must equal performance character');
        if (e.text !== undefined) fail('speech event must reference a group, not duplicate text');
        if (e.kind === 'dialogue' && !ids.has(e.to) && !['self', 'audience'].includes(e.to)) fail('dialogue requires a known addressee');
      }
    });
    if (seen.size !== spoken.length) fail('performance must include every speech group exactly once');
  });
  for (const id of ids) if (!used.has(id)) fail('unused STORY.cast member: ' + id);
  const events = storyPerformance(win);
  const speech = events.filter(e => e.kind !== 'action');
  if (story.expression === 'visual' && speech.length) fail('visual expression must not contain speech');
  if (story.expression === 'dialogue' && speech.some(e => e.kind === 'narration')) fail('dialogue expression cannot include narrator speech');
  if (story.expression === 'narration' && speech.some(e => e.kind === 'dialogue')) fail('narration expression cannot include dialogue');
  scenes.forEach((s, i) => {
    if (s.type !== 'outro' && !(s.narration || []).length && !(Array.isArray(story.transcripts) && story.transcripts.some(t => t?.shot === i + 1)) &&
        (!Number.isFinite(s.duration) || s.duration <= 0)) fail('silent performance shot requires a positive duration');
  });
  function ref(r, label) {
    const index = events.findIndex(e => e.shot === r?.shot && e.event === r?.event);
    const e = events[index];
    if (!object(r) || !Number.isInteger(r.shot) || !Number.isInteger(r.event) || !text(r.quote) || !e ||
        !text(e.quote) || !e.quote.includes(r.quote) || r.quote.trim().length < Math.min(12, Math.ceil(e.quote.trim().length / 2))) {
      fail(label + ' requires an exact observable event quote with 1-based shot/event'); return -1;
    }
    return index;
  }
  const opening = ref(story.opening, 'STORY.opening'), payoff = ref(story.payoff, 'STORY.payoff'), ending = ref(story.ending, 'STORY.ending');
  if (opening !== 0) fail('STORY.opening must reference the first event');
  if (ending !== events.length - 1) fail('STORY.ending must reference the last event');
  if (payoff >= 0 && (payoff < opening || payoff > ending)) fail('STORY.payoff must fall between opening and ending');
  if (payoff === opening && story.reveal !== 'upfront') fail('opening payoff requires reveal upfront');
  if (!['held', 'upfront', 'none'].includes(story.reveal)) fail('STORY.reveal is required');
  if (!['none', 'question', 'action', 'next'].includes(story.cta)) fail('invalid STORY.cta');
  if (story.cta !== 'none') {
    const ask = ref(story.ask, 'STORY.ask');
    if (ask <= payoff || !text(story.ctaReason)) fail('CTA must follow payoff and have a reason');
  } else if (story.ask != null) fail('CTA none must not declare ask');
  const shots = [...new Set(events.map(e => e.shot))], beats = Array.isArray(story.beats) ? story.beats : [];
  if (beats.length !== shots.length || new Set(beats.map(b => b?.shot)).size !== shots.length ||
      beats.some(b => !shots.includes(b?.shot) || !text(b.change) || !text(b.necessity))) fail('STORY.beats must cover every performance shot with change and necessity');
  if (!requireReview) return errors;
  const review = story.review;
  if (!object(review)) return [...errors, 'STORY.review is required before production'];
  if (review.hash !== hash) fail('STORY.review is stale; reread the current performance');
  if (review.verdict !== 'pass' || !Array.isArray(review.unresolved) || review.unresolved.length) fail('STORY.review must pass without unresolved findings');
  for (const key of ['meaning', 'progression', 'payoff', 'grounding', 'character']) {
    const item = review[key];
    if (!object(item) || !text(item.reason) || !Array.isArray(item.refs) || !item.refs.length) { fail('STORY.review.' + key + ' needs reasoning and event evidence'); continue; }
    item.refs.forEach((r, i) => ref(r, 'STORY.review.' + key + '.refs[' + i + ']'));
  }
  return errors;
}
module.exports = { storyPerformance, checkPerformanceStory };
