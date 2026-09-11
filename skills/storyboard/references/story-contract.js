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
    // The forwardable thing is an editorial decision the reviewer reads, so rewriting it after
    // the read has to invalidate the review the same way rewriting narration does.
    share: s.shot?.share,
    // Slide copy is burned on screen, so rewriting it changes the episode the reviewer read.
    slideLabels: s.visual?.slide?.labels, slideSubject: s.visual?.slide?.subject,
    ...(s.visual?.reuse !== undefined ? { reuse: s.visual.reuse } : {}),
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
        (s.visual?.source !== 'recording' && !s.visual?.reuse) || !text(t.source) || t.source !== (s.visual?.reuse?.clip || s.visual.clip) ||
        (Array.isArray(s.narration) && s.narration.length) || live.has(t.shot) ||
        !Array.isArray(t.groups) || !t.groups.length) {
      fail(`STORY.transcripts[${i}] requires a unique live-voice recording or reused shot, matching clip and groups`); return;
    }
    let end = 0;
    t.groups.forEach(g => {
      if (!object(g) || !text(g.text) || !Number.isFinite(g.start) || !Number.isFinite(g.end) ||
          g.start < end || g.end <= g.start || (s.visual?.reuse && g.end > s.duration)) fail(`STORY.transcripts[${i}] requires ordered timed speech`);
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
    const found = said.filter(v => v.includes(r.quote));
    if (!found.length) {
      fail(`${label} quote is not in the referenced narration`); return null;
    }
    // A quote has to carry the line it points at, not a character of it — measured against
    // the line it was found in, so a short subtitle cannot vouch for a long spoken sentence.
    // Otherwise "." matches every sentence and the reference proves nothing.
    if (found.some(v => r.quote.trim().length < Math.min(12, Math.ceil(v.trim().length / 2)))) {
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
  // A cover that states the result opens and pays its own loop in one group (owner directive,
  // the twist moves forward), so the payoff may land on the opening group itself — the same
  // exception storyboard.html grants the promise ledger, keyed off the same two fields. Any
  // other board still pays its promise after it makes it, and none may pay before.
  const revealCover = scenes.find(s => object(s) && s.type === 'cover');
  const coverReveal = !!revealCover &&
    (revealCover.hookType === 'spoiler' || revealCover.hookForm === 'payoff');
  if (opening && payoff) {
    if (position(payoff) < position(opening)) fail('STORY.payoff cannot precede the opening');
    else if (position(payoff) === position(opening) && !coverReveal)
      fail('STORY.payoff must follow the opening — only a cover that states the result ' +
           '(hookType:"spoiler" or hookForm:"payoff") pays in the opening group');
  }
  if (ending && position(ending) !== speech.length - 1) fail('STORY.ending must reference the last spoken group');
  if (payoff && ending && before(ending, payoff)) fail('STORY.ending cannot precede the payoff');
  // The person short (person-short.md): one person, one turn, a cut per sentence, and an
  // opening that lands inside the event — no name, no year, no result — before anyone is
  // introduced. Declared by STORY.person; every other board skips this block.
  if (story.person !== undefined) {
    const person = story.person;
    const names = object(person) ? [person.name, ...(Array.isArray(person.aliases) ? person.aliases : [])] : [];
    if (!object(person) || !text(person.name) ||
        (person.aliases !== undefined && !(Array.isArray(person.aliases) && person.aliases.every(text)))) {
      fail('STORY.person requires a name and optional aliases (person-short.md)');
    } else if (names.some(v => v.trim().length < 2)) {
      // A one-character alias ("이") is inside half the sentences in the language, so the
      // opening check would refuse every board — a name has to be at least two characters.
      fail('STORY.person names and aliases need at least two characters');
    } else {
      const first = speech[0]?.n;
      const said = [first?.tts, first?.sub].filter(v => text(v));
      if (said.some(v => names.some(name => v.includes(name.trim()))))
        fail('STORY.person: the opening sentence names the person — open inside the event, introduce nobody');
      // A calendar year, a century or a dated day. Four digits before 년 are always a year — an age
      // past 999 years is spelled out (천 년). Three digits are a year unless a span marker follows
      // ("300년째" · "500년 동안" · "100년 넘게") or a particle and a finite past span verb that cannot
      // take a year as its subject ("500년이 흘렀어요" · "100년이 넘었어요"). Attributive forms are
      // not exempt: "918년 넘은 탑" and "100년 묵은 성벽" read the same to a regex as a year with a
      // verb after it, so an age before a noun is written "100년 넘게 버틴 성벽" or "100년째".
      const YEAR = /(^|[^\d])(\d{4}\s*년|\d{3}\s*년(?!째|\s*(동안|넘게|만에|간|이상|가까이|가량|남짓)|(이|을|를|은|는|만|이나)\s*(흘렀|넘었|버텼|견뎠|기다렸|이어졌)))|\d+\s*세기|\d{4}\s*[-–.]\s*\d{1,2}/;
      if (said.some(v => YEAR.test(v)))
        fail('STORY.person: the opening sentence carries a year — the date comes after the scene');
      if (coverReveal || revealCover?.hookForm === 'number')
        fail('STORY.person: the first cut is a scene, not the result — no hookType:"spoiler", hookForm:"payoff" or hookForm:"number"');
      if (payoff && ending && position(payoff) === position(ending))
        fail('STORY.person: the closing scene comes after the turn — payoff and ending cannot share a group');
      scenes.forEach((s, i) => {
        const groups = Array.isArray(s.narration) ? s.narration.filter(n => text(n?.tts) || text(n?.sub)) : [];
        if (groups.length > 1)
          fail(`STORY.person: shot ${i + 1} speaks ${groups.length} sentences — the picture changes every sentence, one group per shot`);
        // Two sentences packed into one group is the same defect wearing one label. A sentence
        // closes on a period followed by a space or the end (3.5 is a decimal), or on ? / ! — unless
        // the mark ends an embedded question ("사실일까? 궁금했어요", -까·-는지·-을지·-는가) or is
        // followed by its attribution ("무슨 일이야? 하고 중얼거렸다"), a bare reporting verb
        // ("괜찮아? 물었어요") or the thought it sits in ("사실일까요? 궁금했어요" · 싶다). An ellipsis
        // pause ("설마… 진짜일까") never closes.
        // "무슨 일이야? 아무도 몰랐어요" is two sentences and two pictures, whatever the register.
        const sentences = v => (v.match(/\.(?=\s|$)|(?<!까|는지|을지|는가|던가)[?!]+(?=\s|$)(?!\s*((하고|라고|이라고|라며|하며|라는|이라는)(\s|$)|싶|궁금|물었|물어|되물|중얼|소리\s?쳤|소리\s?치|소리\s?질렀|소리\s?지르|외쳤|외치|말했|말하|되뇌))/g) || []).length;
        if (groups.some(n => Math.max(sentences(n.tts || ''), sentences(n.sub || '')) > 1))
          fail(`STORY.person: shot ${i + 1} packs two sentences into one group — split the shot`);
      });
    }
  }
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
