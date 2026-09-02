#!/usr/bin/env node
/**
 * check-meta.js — the deterministic gate on a YouTube meta.md (title · description · tags).
 *
 *   node check-meta.js output/youtube/meta.md [storyboard/scenes.js]
 *   node check-meta.js --print title|description|tags output/youtube/meta.md
 *   node check-meta.js --selftest
 *
 * exit 0 clean / 1 warnings / 2 fail / 3 the file could not be read
 *
 * What it sees: the template headings from platform-playbook §6, the title's hard limits
 * (100 characters, no angle brackets), a description whose first line repeats the title,
 * the hashtag count against the format preset, the summary voice in the description, and a
 * verbatim copy of `COMPREHENSION.answer` inside the title or the description.
 *
 * What it cannot see: a paraphrased result. exit 0 means "template + verbatim leak clean",
 * never "no spoiler" — the content-reviewer's blind read is that gate. Two of the five
 * descriptions read on 2026-09-03 gave the ending away in their own words and would pass
 * this file untouched.
 *
 * When scenes.js is not given it is looked for at ../../storyboard/scenes.js from the
 * meta.md (the episode layout), so the copy loops need no extra argument.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
// Required in process, not spawned — a child resolved off PATH dies wherever `node` isn't on it
// (launchd, `env -i`), and the failure is invisible: the hashtag rules go quiet and the
// answer-leak gate flips to the shorts default. format-resolve.js --json emits this same preset.
const { FORMATS, DEFAULT_FORMAT } = require('./formats.js');

// The space after the hashes is what separates a heading from a `#Shorts` tag on its own
// line — `#tags #로즈웰` would otherwise open the tags section and truncate the description.
const SECTION_RX = /^#{1,6}\s+(title|description|tags|publish|thumbnail)\b.*$/i;
// Any other heading closes the open section instead of pouring into it — `## 업로드 메모`
// under `## description` used to read as description text (a false answer-leak P0).
const OTHER_HEADING_RX = /^#{1,6}\s+\S/;
// YouTube Help ("Create a Short"): "add a title (max 100 characters)".
const TITLE_MAX = 100;
// An estimate, not a measurement of ours — third-party tool pages put the Shorts overlay and
// feed tile at roughly 40–50 Latin characters before the ellipsis, and Korean glyphs run
// about twice that width. Warn only.
const TITLE_FRONT = 30;
// YouTube Help ("Find playlists & videos using hashtags"): over 60 hashtags → every one ignored.
const HASHTAG_IGNORE_ALL = 60;
// platform-playbook §6.
const HASHTAG_BAND = [3, 5];
// The same floor check-scenes.js uses on the cover.
const ANSWER_MIN = 8;

// The description reporting what the video does instead of saying the thing — the main
// clause is a summary verb ("살펴봅니다", "구분해 봤어요", "정리했습니다"). Four of the five
// descriptions read on 2026-09-03 carried it; the user named it as the AI tell (same day).
const SUMMARY_VOICE = new RegExp(
  '(?:살펴|알아|짚어|들여다|따라가|따라와|구분해|정리해|풀어|확인해|비교해|다뤄|이야기해|파헤쳐)' +
  '\\s*(?:봅니다|봐요|볼게요|보겠습니다|볼까요|봤어요|봤습니다|드립니다|드려요|줍니다|줄게요|주겠습니다)' +
  '|(?:확인|정리|비교|분석|소개|설명)(?:했(?:습니다|어요|고요|죠|다(?![가-힣]))|합니다|해요|해\\s*드립니다|해\\s*드려요)' +
  '|(?:풀었|다뤘|담았|짚었)(?:습니다|어요|고요|다(?![가-힣]))',
  'u',
);

function compact(value) {
  return String(value || '').replace(/[\s\p{P}\p{S}]/gu, '');
}

function length(value) {
  return Array.from(String(value || '')).length;
}

/* ── meta.md ─────────────────────────────────────────────────────────────── */

function parseMeta(text) {
  const sections = {};
  let cur = null;
  String(text).split(/\r?\n/).forEach((line) => {
    const m = line.match(SECTION_RX);
    if (m) {
      cur = m[1].toLowerCase();
      if (!sections[cur]) sections[cur] = [];
      return;
    }
    if (OTHER_HEADING_RX.test(line)) { cur = null; return; }
    if (cur) sections[cur].push(line);
  });
  const body = (k) => (sections[k] || []).join('\n').trim();
  const titleLines = (sections.title || []).map((s) => s.trim()).filter(Boolean);
  return {
    has: (k) => Object.prototype.hasOwnProperty.call(sections, k),
    title: titleLines[0] || '',
    titleExtra: Math.max(0, titleLines.length - 1),
    description: body('description'),
    tags: body('tags'),
  };
}

function hashtagsIn(text) {
  const out = [];
  const rx = /(?:^|\s)#([\p{L}\p{N}_]+)/gu;
  let m;
  while ((m = rx.exec(text)) !== null) out.push('#' + m[1]);
  return out;
}

/* ── the checks ──────────────────────────────────────────────────────────── */

/**
 * ctx: { answer, hookType, arc, isShort, required, forbidden, scenes }
 *   scenes — 'ok' | 'missing' | 'no-comprehension'
 * returns { fails: [{id,msg}], warns: [{id,msg}], notes: [msg] }
 */
function check(meta, ctx) {
  const fails = [];
  const warns = [];
  const notes = [];
  const fail = (id, msg) => fails.push({ id, msg });
  const warn = (id, msg) => warns.push({ id, msg });

  if (!meta.has('title') || !meta.has('description')) {
    fail('template', 'no `## title` / `## description` headings — write meta.md in the platform-playbook §6 template');
    return { fails, warns, notes };
  }

  const title = meta.title;
  const titleLen = length(title);
  if (!title) fail('title-empty', 'title is empty');
  if (meta.titleExtra) warn('title-lines', `title section has ${meta.titleExtra} extra line(s) — the first line is the title, the rest is ignored`);
  if (titleLen > TITLE_MAX) fail('title-long', `title is ${titleLen} characters — YouTube's limit is ${TITLE_MAX}`);
  if (/[<>]/.test(title)) fail('title-angle', 'title contains < or > — the upload rejects it');
  if (title && titleLen > TITLE_FRONT)
    warn('title-front', `title is ${titleLen} characters — the Shorts overlay and feed tile cut off around ${TITLE_FRONT} Korean characters (estimate), so the hook has to sit in front`);

  const desc = meta.description;
  if (!desc) fail('desc-empty', 'description is empty');
  const line1 = desc.split('\n').map((s) => s.trim()).find(Boolean) || '';
  const cTitle = compact(title);
  const cLine1 = compact(line1);
  if (cTitle && cLine1) {
    if (cTitle === cLine1) fail('desc-repeat', 'description line 1 is the title again — it is the second hook, in different words (§6)');
    else if ((cTitle.length >= ANSWER_MIN && cLine1.indexOf(cTitle) !== -1) ||
             (cLine1.length >= ANSWER_MIN && cTitle.indexOf(cLine1) !== -1))
      warn('desc-repeat', 'description line 1 contains the title — say it in different words (§6)');
  }

  const tags = hashtagsIn(`${title}\n${desc}`);
  const lower = tags.map((t) => t.toLowerCase());
  if (tags.length > HASHTAG_IGNORE_ALL) fail('hashtag-over', `${tags.length} hashtags — over ${HASHTAG_IGNORE_ALL} YouTube ignores every one`);
  if (ctx.preset) warn('preset-unknown', `window.FORMAT is ${JSON.stringify(ctx.preset)} — no such preset, so the hashtag rules did not run`);
  (ctx.required || []).forEach((t) => {
    if (lower.indexOf(String(t).toLowerCase()) === -1) fail('hashtag-required', `${t} is missing — the format preset requires it`);
  });
  (ctx.forbidden || []).forEach((t) => {
    if (lower.indexOf(String(t).toLowerCase()) !== -1) fail('hashtag-forbidden', `${t} is present — the format preset forbids it`);
  });
  if (tags.length < HASHTAG_BAND[0] || tags.length > HASHTAG_BAND[1])
    warn('hashtag-band', `${tags.length} hashtags — the band is ${HASHTAG_BAND[0]}–${HASHTAG_BAND[1]} (§6)`);

  const sentences = desc.split(/(?<=[.!?…])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  // `#` 태그 줄과 §6 템플릿의 출처 블록은 본문 문장이 아니다. 블록으로 끊는 이유는
  // 본문에도 `· 항목 — 설명` 불릿이 흔해서다 — 모양으로 면제하면 그것까지 빠져나간다.
  const srcAt = desc.split('\n').findIndex((l) => /^출처\b|^출처\s*[/:]/.test(l.trim()));
  const srcBlock = srcAt === -1 ? '' : desc.split('\n').slice(srcAt).join('\n');
  const aside = (s) => s.startsWith('#') || (srcBlock !== '' && srcBlock.indexOf(s) !== -1);
  const voiced = sentences.filter((s) => !aside(s) && SUMMARY_VOICE.test(s));
  if (voiced.length)
    warn('summary-voice', `${voiced.length} sentence(s) report what the video does instead of saying the thing — "${voiced[0]}"`);

  if (ctx.scenes === 'missing') {
    warn('answer-unverified', 'scenes.js not found or not readable — neither the answer-leak nor the preset-hashtag check ran');
  } else if (ctx.scenes === 'no-comprehension') {
    warn('answer-unverified', 'scenes.js has no window.COMPREHENSION.answer — the answer-leak check did not run');
  } else {
    const cAnswer = compact(ctx.answer);
    const gapEpisode = ctx.isShort || ctx.arc === 'story';
    if (ctx.hookType === 'spoiler' || !gapEpisode) {
      notes.push('answer-first episode — the title may name the result, answer-leak check skipped');
    } else if (cAnswer.length < ANSWER_MIN) {
      warn('answer-unverified', `COMPREHENSION.answer compacts to ${cAnswer.length} characters — under ${ANSWER_MIN}, too short to search for`);
    } else if (compact(`${title} ${desc}`).indexOf(cAnswer) !== -1) {
      fail('answer-leak', 'the title or the description carries COMPREHENSION.answer verbatim — the result stays inside the video (§2)');
    } else {
      notes.push('verbatim answer leak: none (a paraphrase is the reviewer\'s blind read, not this file\'s)');
    }
  }

  return { fails, warns, notes };
}

/* ── scenes.js ───────────────────────────────────────────────────────────── */

function readScenes(file) {
  const src = fs.readFileSync(file, 'utf8');
  const sandbox = { window: {}, console: { log() {}, warn() {}, error() {} } };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(src, sandbox, { filename: file, timeout: 5000 });
  return sandbox.window;
}

function contextFrom(scenesPath) {
  const ctx = { answer: '', hookType: '', arc: '', isShort: true, required: [], forbidden: [], scenes: 'missing', preset: '' };
  if (!scenesPath || !fs.existsSync(scenesPath)) return ctx;
  let win;
  try {
    win = readScenes(scenesPath);
  } catch (e) {
    return ctx;
  }
  const key = typeof win.FORMAT === 'string' ? win.FORMAT : DEFAULT_FORMAT;
  const preset = FORMATS[key];
  if (preset) {
    ctx.isShort = key !== 'youtube-long-16x9';
    ctx.required = (preset.hashtags && preset.hashtags.required) || [];
    ctx.forbidden = (preset.hashtags && preset.hashtags.forbidden) || [];
  } else {
    ctx.preset = key;   // check() warns — an unknown format can't carry hashtag rules
  }
  const cover = (Array.isArray(win.SCENES) ? win.SCENES : []).find((s) => s && s.type === 'cover') || {};
  ctx.hookType = cover.hookType || '';
  ctx.arc = cover.arc || '';
  const comp = win.COMPREHENSION;
  if (comp && typeof comp === 'object' && !Array.isArray(comp) && String(comp.answer || '').trim()) {
    ctx.answer = String(comp.answer);
    ctx.scenes = 'ok';
  } else {
    ctx.scenes = 'no-comprehension';
  }
  return ctx;
}

function defaultScenesPath(metaPath) {
  return path.resolve(path.dirname(metaPath), '..', '..', 'storyboard', 'scenes.js');
}

/* ── report ──────────────────────────────────────────────────────────────── */

function report(file, meta, result) {
  const tags = hashtagsIn(`${meta.title}\n${meta.description}`);
  console.log(`check-meta — ${file} / title ${length(meta.title)} chars / hashtags ${tags.length}`);
  result.fails.forEach((f) => console.log(`FAIL [${f.id}] ${f.msg}`));
  result.warns.forEach((w) => console.log(`WARN [${w.id}] ${w.msg}`));
  result.notes.forEach((n) => console.log(`ok   ${n}`));
  const exit = result.fails.length ? 2 : result.warns.length ? 1 : 0;
  console.log(`CHECK_META: exit=${exit} fail=${result.fails.length} warn=${result.warns.length}`);
  return exit;
}

/* ── selftest ────────────────────────────────────────────────────────────── */

const GOOD = [
  '## title',
  '로즈웰 사건, 군은 왜 같은 날 말을 바꿨을까?',
  '',
  '## description',
  '1947년 7월 8일 아침 발표문과 그날 저녁 발표문이 정반대예요.',
  '두 장을 나란히 놓으면 어느 쪽이 거짓말인지 보여요.',
  '',
  '여러분은 어느 쪽 발표를 믿으세요?',
  '',
  '#Shorts #로즈웰 #미스터리',
  '',
  '## tags',
  '로즈웰, Roswell, UFO',
].join('\n');

const SHORT = { answer: '공개할 수 없던 모굴 계획의 풍선 잔해였다는 설명이 가장 유력해요.', hookType: 'curiosity', arc: 'story', isShort: true, required: ['#Shorts'], forbidden: [], scenes: 'ok' };

const FIXTURES = [
  ['template clean', GOOD, SHORT, 0, [], []],
  ['old layout without headings', '# 로즈웰 사건\n\n처음엔 비행 원반이었어요.\n', SHORT, 2, ['template'], []],
  ['title empty', GOOD.replace('로즈웰 사건, 군은 왜 같은 날 말을 바꿨을까?', ''), SHORT, 2, ['title-empty'], []],
  ['angle brackets', GOOD.replace('말을 바꿨을까?', '말을 바꿨을까? <1947>'), SHORT, 2, ['title-angle'], []],
  ['title over 100', GOOD.replace('로즈웰 사건, 군은 왜 같은 날 말을 바꿨을까?', '로즈웰 '.repeat(26).trim()), SHORT, 2, ['title-long'], []],
  ['long title warns', GOOD.replace('로즈웰 사건, 군은 왜 같은 날 말을 바꿨을까?', '로즈웰 사건, 군은 왜 같은 날 말을 바꿨을까? 1947년 발표문 두 장 비교'), SHORT, 1, ['title-front'], ['title-long']],
  ['description repeats the title', GOOD.replace('1947년 7월 8일 아침 발표문과 그날 저녁 발표문이 정반대예요.', '로즈웰 사건, 군은 왜 같은 날 말을 바꿨을까?'), SHORT, 2, ['desc-repeat'], []],
  ['answer verbatim in description', GOOD.replace('두 장을 나란히 놓으면 어느 쪽이 거짓말인지 보여요.', '공개할 수 없던 모굴 계획의 풍선 잔해였다는 설명이 가장 유력해요.'), SHORT, 2, ['answer-leak'], []],
  ['answer verbatim in title', GOOD.replace('로즈웰 사건, 군은 왜 같은 날 말을 바꿨을까?', '로즈웰 — 공개할 수 없던 모굴 계획의 풍선 잔해였다는 설명이 가장 유력해요'), SHORT, 2, ['answer-leak'], []],
  ['answer-first long-form may name the result', GOOD.replace('두 장을 나란히 놓으면 어느 쪽이 거짓말인지 보여요.', '공개할 수 없던 모굴 계획의 풍선 잔해였다는 설명이 가장 유력해요.').replace('#Shorts', '#역사'),
    Object.assign({}, SHORT, { isShort: false, arc: 'answer-first', required: [] }), 0, [], ['answer-leak']],
  ['story long-form keeps the gap', GOOD.replace('두 장을 나란히 놓으면 어느 쪽이 거짓말인지 보여요.', '공개할 수 없던 모굴 계획의 풍선 잔해였다는 설명이 가장 유력해요.').replace('#Shorts', '#역사'),
    Object.assign({}, SHORT, { isShort: false, arc: 'story', required: [] }), 2, ['answer-leak'], []],
  ['no COMPREHENSION warns, never passes silently', GOOD, Object.assign({}, SHORT, { answer: '', scenes: 'no-comprehension' }), 1, ['answer-unverified'], []],
  ['scenes.js missing warns', GOOD, Object.assign({}, SHORT, { scenes: 'missing' }), 1, ['answer-unverified'], []],
  ['preset-required hashtag missing', GOOD.replace('#Shorts ', ''), SHORT, 2, ['hashtag-required'], []],
  ['hashtag band', GOOD.replace('#Shorts #로즈웰 #미스터리', '#Shorts #로즈웰'), SHORT, 1, ['hashtag-band'], []],
  ['over 60 hashtags ignored', GOOD.replace('#Shorts #로즈웰 #미스터리', Array.from({ length: 61 }, (_, i) => `#t${i}`).join(' ') + ' #Shorts'), SHORT, 2, ['hashtag-over'], []],
  ['summary voice warns', GOOD.replace('두 장을 나란히 놓으면 어느 쪽이 거짓말인지 보여요.', '1947년 발표와 남은 기록을 따라가며 군이 감춘 비밀의 정체를 확인해요.'), SHORT, 1, ['summary-voice'], []],
  ['summary voice — past summary', GOOD.replace('두 장을 나란히 놓으면 어느 쪽이 거짓말인지 보여요.', '어디서 부딪히는지 다섯 턴을 그대로 담았습니다.'), SHORT, 1, ['summary-voice'], []],
  ['a concrete sentence is not summary voice', GOOD.replace('두 장을 나란히 놓으면 어느 쪽이 거짓말인지 보여요.', '기지 사령관이 서명한 종이가 아직 남아 있어요.'), SHORT, 0, [], ['summary-voice']],
  ['an adnominal past form is not summary voice', GOOD.replace('두 장을 나란히 놓으면 어느 쪽이 거짓말인지 보여요.', '군이 설명했던 문서가 아직 남아 있어요.'), SHORT, 0, [], ['summary-voice']],
  ['plain declarative summary verb', GOOD.replace('두 장을 나란히 놓으면 어느 쪽이 거짓말인지 보여요.', '남은 기록을 그대로 정리했다.'), SHORT, 1, ['summary-voice'], []],
  ['a conditional is not summary voice', GOOD.replace('두 장을 나란히 놓으면 어느 쪽이 거짓말인지 보여요.', '두 발표를 비교했다면 누구나 알아챘을 거예요.'), SHORT, 0, [], ['summary-voice']],
  ['the §6 sources line is not summary voice', GOOD.replace('여러분은 어느 쪽 발표를 믿으세요?', '출처 /\n· 미 공군 보고서 — 원문 스캔으로 확인했습니다.'), SHORT, 0, [], ['summary-voice']],
  ['a heading outside the template closes the section', GOOD.replace('#Shorts #로즈웰 #미스터리', '#Shorts #로즈웰 #미스터리\n\n## 업로드 메모\n공개할 수 없던 모굴 계획의 풍선 잔해였다는 설명이 가장 유력해요.'), SHORT, 0, [], ['answer-leak', 'summary-voice']],
  ['long-form forbids #Shorts', GOOD, Object.assign({}, SHORT, { isShort: false, arc: 'answer-first', required: [], forbidden: ['#Shorts'] }), 2, ['hashtag-forbidden'], []],
  ['extra title lines warn', GOOD.replace('## description', '두 번째 줄이 남아 있어요\n\n## description'), SHORT, 1, ['title-lines'], []],
  ['description empty', GOOD.replace('1947년 7월 8일 아침 발표문과 그날 저녁 발표문이 정반대예요.\n두 장을 나란히 놓으면 어느 쪽이 거짓말인지 보여요.\n\n여러분은 어느 쪽 발표를 믿으세요?\n\n#Shorts #로즈웰 #미스터리\n', ''), SHORT, 2, ['desc-empty'], []],
  ['description line 1 swallows the title', GOOD.replace('1947년 7월 8일 아침 발표문과 그날 저녁 발표문이 정반대예요.', '로즈웰 사건, 군은 왜 같은 날 말을 바꿨을까? 라고 묻고 싶어져요.'), SHORT, 1, ['desc-repeat'], []],
  ['a body bullet is not a sources line', GOOD.replace('두 장을 나란히 놓으면 어느 쪽이 거짓말인지 보여요.', '· 사건 개요 — 남은 기록을 전부 정리했다.'), SHORT, 1, ['summary-voice'], []],
  ['a deeper heading also closes the section', GOOD.replace('#Shorts #로즈웰 #미스터리', '#Shorts #로즈웰 #미스터리\n\n#### 업로드 메모\n공개할 수 없던 모굴 계획의 풍선 잔해였다는 설명이 가장 유력해요.'), SHORT, 0, [], ['answer-leak']],
  ['a line-start hashtag never opens a section', GOOD.replace('#Shorts #로즈웰 #미스터리', '#tags #Shorts #로즈웰'), SHORT, 0, [], ['hashtag-required', 'desc-empty']],
  ['an unknown FORMAT is never silent', GOOD.replace('#Shorts ', ''), Object.assign({}, SHORT, { required: [], preset: 'shorts-9x16-v2' }), 1, ['preset-unknown'], ['hashtag-required']],
];

/* contextFrom 은 픽스처가 ctx 를 손으로 만들어 우회하던 층이다 — scenes.js 를 실제로 읽혀 본다 */
const CTX_FIXTURES = [
  ['shorts preset resolves', 'window.FORMAT = "shorts-9x16";\nwindow.SCENES = [{ type: "cover", hookType: "curiosity", arc: "story" }];\nwindow.COMPREHENSION = { answer: "모굴 계획의 풍선 잔해였어요." };',
    { scenes: 'ok', isShort: true, preset: '', required: ['#Shorts'] }],
  ['long-form preset resolves', 'window.FORMAT = "youtube-long-16x9";\nwindow.SCENES = [{ type: "cover", hookType: "curiosity", arc: "story" }];\nwindow.COMPREHENSION = { answer: "모굴 계획의 풍선 잔해였어요." };',
    { scenes: 'ok', isShort: false, preset: '', forbidden: ['#Shorts'] }],
  ['no window.FORMAT falls back to the default preset', 'window.SCENES = [{ type: "cover" }];\nwindow.COMPREHENSION = { answer: "모굴 계획의 풍선 잔해였어요." };',
    { scenes: 'ok', isShort: true, preset: '', required: ['#Shorts'] }],
  ['an unknown FORMAT reports the key', 'window.FORMAT = "nope";\nwindow.SCENES = [{ type: "cover" }];\nwindow.COMPREHENSION = { answer: "모굴 계획의 풍선 잔해였어요." };',
    { scenes: 'ok', preset: 'nope', required: [] }],
  ['scenes.js without COMPREHENSION', 'window.FORMAT = "shorts-9x16";\nwindow.SCENES = [{ type: "cover" }];',
    { scenes: 'no-comprehension', required: ['#Shorts'] }],
  ['scenes.js that throws', 'window.SCENES = [{ type: "cover" }; // 문법 오류',
    { scenes: 'missing', required: [] }],
];

function selftest() {
  let bad = 0;
  FIXTURES.forEach(([name, text, ctx, want, mustHave, mustNot]) => {
    const r = check(parseMeta(text), ctx);
    const got = r.fails.length ? 2 : r.warns.length ? 1 : 0;
    const ids = r.fails.concat(r.warns).map((x) => x.id);
    const missing = mustHave.filter((id) => ids.indexOf(id) === -1);
    const extra = mustNot.filter((id) => ids.indexOf(id) !== -1);
    const ok = got === want && !missing.length && !extra.length;
    if (!ok) bad += 1;
    console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name} — exit ${got} (want ${want})` +
      (missing.length ? ` missing ${missing.join(',')}` : '') +
      (extra.length ? ` unexpected ${extra.join(',')}` : ''));
  });
  const os = require('os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-meta-'));
  CTX_FIXTURES.forEach(([name, src, want]) => {
    const f = path.join(dir, `${name.replace(/\W+/g, '-')}.js`);
    fs.writeFileSync(f, src, 'utf8');
    const ctx = contextFrom(f);
    const wrong = Object.keys(want).filter((k) => JSON.stringify(ctx[k]) !== JSON.stringify(want[k]));
    if (wrong.length) bad += 1;
    console.log(`[${wrong.length ? 'FAIL' : 'PASS'}] contextFrom — ${name}` +
      (wrong.length ? ` — ${wrong.map((k) => `${k}=${JSON.stringify(ctx[k])} want ${JSON.stringify(want[k])}`).join(', ')}` : ''));
  });
  fs.rmSync(dir, { recursive: true, force: true });
  const total = FIXTURES.length + CTX_FIXTURES.length;
  console.log(`${total - bad}/${total} fixtures pass`);
  return bad ? 1 : 0;
}

/* ── CLI ─────────────────────────────────────────────────────────────────── */

function usage() {
  console.error('usage: check-meta.js <output/youtube/meta.md> [storyboard/scenes.js]\n' +
                '       check-meta.js --print title|description|tags <meta.md>\n' +
                '       check-meta.js --selftest');
  return 3;
}

function main(argv) {
  if (argv.indexOf('--selftest') !== -1) return selftest();
  let printPart = null;
  const rest = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--print') { printPart = argv[i + 1]; i += 1; } else rest.push(argv[i]);
  }
  const metaPath = rest[0];
  if (!metaPath) return usage();
  let text;
  try {
    text = fs.readFileSync(metaPath, 'utf8');
  } catch (e) {
    console.error(`check-meta: cannot read ${metaPath}: ${e && e.message}`);
    return 3;
  }
  const meta = parseMeta(text);
  if (printPart) {
    if (['title', 'description', 'tags'].indexOf(printPart) === -1) return usage();
    process.stdout.write(meta[printPart] + (meta[printPart] ? '\n' : ''));
    return 0;
  }
  const scenesPath = rest[1] || defaultScenesPath(metaPath);
  const ctx = contextFrom(scenesPath);
  return report(metaPath, meta, check(meta, ctx));
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { parseMeta, check, hashtagsIn, compact };
