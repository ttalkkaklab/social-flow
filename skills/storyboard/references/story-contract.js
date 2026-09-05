'use strict';

// Structural evidence checks, not an automated judgment of entertainment value.
const crypto = require('node:crypto');
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const text = x => typeof x === 'string' && x.trim().length > 0;
const canonical = x => Array.isArray(x) ? x.map(canonical) : object(x)
  ? Object.fromEntries(Object.keys(x).sort().map(k => [k, canonical(x[k])])) : x;

function storySpeech(win) {
  const scenes = Array.isArray(win.SCENES) ? win.SCENES : [];
  const transcripts = Array.isArray(win.STORY?.transcripts) ? win.STORY.transcripts : [];
  const ordered = [];
  scenes.forEach((s, i) => {
    if (s.type === 'outro' || s.type === 'broll') return;
    ordered.push({ s, shot: i + 1 });
    scenes.forEach((b, j) => { if (b.type === 'broll' && Number(b.after) === i) ordered.push({ s: b, shot: j + 1 }); });
  });
  return ordered.flatMap(({s, shot}) => {
    const live = transcripts.find(t => t?.shot === shot);
    const groups = Array.isArray(s.narration) && s.narration.length ? s.narration
      : Array.isArray(live?.groups) ? live.groups.map(g => ({tts: g?.text, sub: g?.text})) : [];
    return groups.map((n, i) => ({shot, group: i + 1, n}))
      .filter(x => text(x.n?.tts) || text(x.n?.sub));
  });
}

function storyHash(win) {
  const story = object(win.STORY) ? { ...win.STORY } : null;
  if (story) delete story.review;
  const scenes = (win.SCENES || []).map(s => ({
    type: s.type, beat: s.beat, arc: s.arc, after: s.after,
    title: s.title, stat: s.stat, bullets: s.bullets,
    narration: s.narration, info: s.shot?.info,
    // Slide copy is burned on screen, so rewriting it changes the episode the reviewer read.
    slideLabels: s.visual?.slide?.labels, slideSubject: s.visual?.slide?.subject,
    recording: s.visual?.source === 'recording' ? s.visual.clip : undefined
  }));
  return crypto.createHash('sha256').update(JSON.stringify(canonical({
    comprehension: win.COMPREHENSION, story, scenes
  }))).digest('hex');
}

function checkStory(win, { requireReview = true } = {}) {
  const errors = [], fail = message => errors.push(message);
  const story = win.STORY, scenes = Array.isArray(win.SCENES) ? win.SCENES : [];
  if (!object(story) || story.version !== 'story-v1')
    return ['window.STORY requires version story-v1; read story-quality.md before authoring'];
  for (const key of ['viewerNeed', 'thesis', 'basis', 'endingReason'])
    if (!text(story[key])) fail(`STORY.${key} must explain a concrete editorial decision`);
  if (!['evidence', 'fiction'].includes(story.kind)) fail('STORY.kind must be evidence or fiction');
  if (!['none', 'question', 'action', 'next'].includes(story.cta)) fail('STORY.cta must be none, question, action or next');
  const live = new Map();
  if (story.transcripts !== undefined && !Array.isArray(story.transcripts)) fail('STORY.transcripts must be an array');
  (Array.isArray(story.transcripts) ? story.transcripts : []).forEach((t, i) => {
    const s = scenes[t?.shot - 1];
    if (!object(t) || !Number.isInteger(t.shot) || !s || s.type === 'outro' ||
        s.visual?.source !== 'recording' || !text(t.source) || t.source !== s.visual.clip ||
        (Array.isArray(s.narration) && s.narration.length) || live.has(t.shot) ||
        !Array.isArray(t.groups) || !t.groups.length) {
      fail(`STORY.transcripts[${i}] requires a unique live-voice recording shot, matching clip and groups`); return;
    }
    let end = 0;
    t.groups.forEach(g => {
      if (!object(g) || !text(g.text) || !Number.isFinite(g.start) || !Number.isFinite(g.end) ||
          g.start < end || g.end <= g.start) fail(`STORY.transcripts[${i}] requires ordered timed speech`);
      if (object(g)) end = g.end;
    });
    live.set(t.shot, t.groups.map(g => ({ tts: g?.text, sub: g?.text })));
  });
  const speech = storySpeech(win);
  const narrated = [...new Set(speech.map(x => x.shot))].map(i => ({i}));
  function ref(r, label) {
    if (!object(r) || !Number.isInteger(r.shot) || !Number.isInteger(r.group) ||
        r.shot < 1 || r.group < 1 || !text(r.quote)) {
      fail(`${label} requires 1-based shot, group and exact quote`); return null;
    }
    const n = speech.find(x => x.shot === r.shot && x.group === r.group)?.n;
    const said = [n?.tts, n?.sub].filter(v => text(v));
    // A quote has to carry the sentence, not a character of it: half the line, at minimum.
    // Otherwise "." matches every sentence and the reference proves nothing.
    const enough = said.some(v => r.quote.trim().length >= Math.min(12, Math.ceil(v.trim().length / 2)));
    if (!said.length || !said.some(v => v.includes(r.quote))) {
      fail(`${label} quote is not in the referenced narration`); return null;
    }
    if (!enough) {
      fail(`${label} quote is too short to identify the line — quote at least half of it`); return null;
    }
    return [r.shot, r.group];
  }
  const opening = ref(story.opening, 'STORY.opening');
  const payoff = ref(story.payoff, 'STORY.payoff');
  const ending = ref(story.ending, 'STORY.ending');
  const position = a => speech.findIndex(x => x.shot === a[0] && x.group === a[1]);
  const before = (a, b) => position(a) < position(b);
  if (opening && position(opening) !== 0) fail('STORY.opening must reference the first spoken group');
  if (opening && payoff && !before(opening, payoff)) fail('STORY.payoff must follow the opening');
  if (ending && position(ending) !== speech.length - 1) fail('STORY.ending must reference the last spoken group');
  if (payoff && ending && before(ending, payoff)) fail('STORY.ending cannot precede the payoff');
  if (story.cta !== 'none') {
    const ask = ref(story.ask, 'STORY.ask');
    if (ask && payoff && !before(payoff, ask)) fail('STORY.ask must follow the paid promise');
    if (!text(story.ctaReason)) fail('STORY.ctaReason must explain why the ask helps this episode');
  } else if (story.ask != null) fail('STORY.cta none must not declare an ask');
  const beats = Array.isArray(story.beats) ? story.beats : [];
  if (beats.length !== narrated.length) fail('STORY.beats requires one row per narrated shot');
  const seen = new Set();
  beats.forEach((b, i) => {
    if (!object(b)) { fail(`STORY.beats[${i}] must be an object`); return; }
    if (!Number.isInteger(b.shot) || !narrated.some(x => x.i === b.shot) || seen.has(b.shot))
      fail(`STORY.beats[${i}] must reference a unique narrated shot`);
    seen.add(b.shot);
    for (const key of ['change', 'necessity'])
      if (!text(b[key])) fail(`STORY.beats[${i}].${key} is required`);
  });
  if (!requireReview) return errors;
  const review = story.review;
  if (!object(review)) return [...errors, 'STORY.review is required before production; a score alone is not evidence'];
  if (review.hash !== storyHash(win)) fail('STORY.review is stale; review the current narration and contract again');
  if (review.verdict !== 'pass' || !Array.isArray(review.unresolved) || review.unresolved.length)
    fail('STORY.review must pass with an empty unresolved list');
  for (const key of ['meaning', 'progression', 'payoff', 'grounding']) {
    const item = review[key];
    if (!object(item) || !text(item.reason) || !Array.isArray(item.refs) || !item.refs.length) {
      fail(`STORY.review.${key} requires reasoning and quoted narration evidence`); continue;
    }
    item.refs.forEach((r, i) => ref(r, `STORY.review.${key}.refs[${i}]`));
  }
  return errors;
}

module.exports = { checkStory, storyHash, storySpeech };
