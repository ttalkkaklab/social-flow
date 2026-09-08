#!/usr/bin/env node
/**
 * check-research.js — did the research actually close before the scenes opened?
 *
 *   check-research.js <storyboard dir | research.md>       the findings (close)
 *   check-research.js <...> --direction                     first pass — enough to offer 3 directions
 *   check-research.js <...> --json                          machine-readable
 *   check-research.js --selftest                            pins the rules and the floors
 *
 * ## What this is for
 *
 * The storyboard skill's §2 is a step with an exit, and the exit is a self-check: the same
 * agent that did the searching writes the line saying the searching was enough. That is the
 * one gate in the skill with nobody on the other side of it, and a storyboard authored while
 * the research is still open bends the facts to sentences already written.
 *
 * So this counts what is actually on the page and compares it against what the page claims.
 * The first episode it was run on had a Verified table of 11 rows under a Sufficiency line
 * saying 10 — a small drift, and exactly the kind nobody catches by reading.
 *
 * ## What it reads
 *
 * The `references/storyboard-template.md` §research.md structure:
 *
 *   ## Questions …            one row per question · Status says answered / written off
 *   ## Verified               one row per claim, numbered, with source links · ★ marks a key claim
 *   ## Messages               three rows · what a viewer living now takes away — decided before the directions
 *   ## Directions             three rows, one topic per message (`M#`) · `Chosen: D#` locks the pick (owed on close, not on --direction)
 *   ## Counter-evidence …     one row per key claim, `Claim #` naming which (ranges allowed)
 *   ## Failed verification …  what was excluded and why
 *   ## Sufficiency            the self-reported counts
 *   ## Search history         one row per search — counted against two per question
 *
 * Headings may carry a number or a word in front (`## 2. 검증 통과`, `## 사실 검증표`) — half
 * the library writes them that way, and reading only the bare template wording reported those
 * logs as having no claims at all (measured 2026-08-29: two logs went from 0 to 5 and 6 claims
 * on the heading alone).
 *
 * Which claims are key: the hook, the hero stat and the result rest on a few rows, and those
 * are the ones a counter-evidence search is owed. A log names them with ★ in the # column, or —
 * once the sentences carry `claim` — by citing them. A log that does neither is read as "every
 * row is key", and the finding says so.
 *
 * A channel whose profile skips research has no research.md at all, and that is not a defect —
 * the caller decides whether the file was supposed to exist.
 *
 * `--direction` is the first-pass gate: three verified claims, ten searches, three messages
 * and three direction rows each citing one of them, no pick and no counter-evidence yet. The
 * default run is the close: the floor, every question answered or written off, and one
 * `Chosen:` direction. On both runs a message or direction sentence that ends on ignorance
 * ("X는 아직 모른다", "미스터리로 남았다") is a violation — an episode built on one has nothing
 * to hand over at the 마무리 (user directive 2026-09-07; scenario-stage §Messages first).
 *
 * Exit codes:
 *   0  the research closes (or, with --direction, is enough to ask)
 *   1  it does not (below the floor, a question left open, no pick, a self-report that does not match)
 *   3  input error
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SELF_DIR = __dirname;
const FORMAT_RESOLVE = path.resolve(SELF_DIR, '..', '..', 'platform-guide', 'references', 'format-resolve.js');

/* ── The floors ──
   The source of truth is the storyboard skill's §2 step 4: three verified claims is the floor
   below which there is no video, a short normally leaves with five or more and a long-form
   with twelve. --selftest reads those numbers back out of SKILL.md, so a change there fails
   here rather than drifting silently. */
const FLOOR_ABSOLUTE = 3;
const FLOOR_SHORT = 5;
const FLOOR_LONG = 12;
const FLOOR_DIRECTIONS = 3;
const FLOOR_MESSAGES = 3;
const FLOOR_DIRECTION_SEARCHES = 10;

/* A sentence that ends on ignorance. Predicate forms only — "알 수 없는 물체" is a modifier and
   its predicate sits elsewhere, so it passes here and a person reads it; "알 수 없다" is the whole
   point of the sentence, and that is what the rule bans. The (?![가-힣]) tail keeps 모른다면 and
   없다는 out — a conditional or a quoted clause is not the sentence's verdict. */
const IGNORANCE = new RegExp([
  '알\\s*수(?:가|는|도)?\\s*없(?:다|어요|습니다|죠|네요|음)(?![가-힣])',
  '알\\s*길(?:이|은)?\\s*없(?:다|어요|습니다|죠)(?![가-힣])',
  '(?:모른다|모릅니다|몰라요|모르죠|모르겠(?:다|어요|습니다)|모르네요|모름|몰랐(?:다|어요|습니다))(?![가-힣])',
  '(?:밝혀|풀리|알려)지지\\s*않(?:았다|았어요|았습니다|았죠|는다|아요|습니다|죠)(?![가-힣])',
  '아무도\\s*(?:알지\\s*못(?:한다|합니다|해요|했다|했습니다))(?![가-힣])',
  '(?:미스터리|수수께끼|미제)(?:다|이다|입니다|예요|죠)(?![가-힣])',
  '(?:미스터리|수수께끼|미제)로\\s*남(?:았다|았어요|았습니다|았죠|는다|아요|습니다|은\\s*채)(?![가-힣])',
  '\\b(?:nobody|no\\s+one)\\s+knows\\b',
  '\\b(?:remains?|is|are|was|were)\\s+(?:still\\s+)?(?:an?\\s+)?(?:mystery|unknown|unsolved|unexplained)\\b',
  "\\b(?:we|they|scientists|historians)\\s+(?:still\\s+)?(?:don'?t|do\\s+not|may\\s+never)\\s+know\\b"
].join('|'), 'i');

function die(msg) {
  process.stderr.write('check-research: ' + msg + '\n');
  process.exit(3);
}

/** Pulls a `## <heading>` section's body out of the document. */
function section(src, re) {
  const lines = src.split('\n');
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i]) && re.test(lines[i])) { start = i + 1; break; }
  }
  if (start === -1) return null;
  const body = [];
  for (let i = start; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) break;
    body.push(lines[i]);
  }
  return body.join('\n');
}

/** Markdown table rows, header and separator dropped, split into trimmed cells. */
function rows(body) {
  if (!body) return [];
  return body.split('\n')
    .filter((l) => /^\s*\|/.test(l))
    .map((l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim()))
    .filter((cells, i, all) => {
      if (cells.every((c) => /^:?-+:?$/.test(c) || c === '')) return false;   // separator
      // The first surviving row is the header — drop it.
      const firstReal = all.findIndex((r) => !r.every((c) => /^:?-+:?$/.test(c) || c === ''));
      return i !== firstReal;
    });
}

/**
 * Expands "1~6", "1-6", "1, 3" into claim numbers. A number followed by a label ("2 우연") is
 * read as that number — real logs write the row that way. A cell that names no number at all
 * comes back empty, and the caller counts it as unmapped rather than as covering nothing.
 */
function claimNumbers(cell) {
  const out = new Set();
  String(cell || '').replace(/[★*]/g, '').split(/[,·]/).forEach((part) => {
    const range = part.trim().match(/^(\d+)\s*[~\-–]\s*(\d+)$/);
    if (range) {
      for (let n = Number(range[1]); n <= Number(range[2]); n++) out.add(n);
      return;
    }
    const one = part.trim().match(/^(\d+)(?:\s+\S.*)?$/);
    if (one) out.add(Number(one[1]));
  });
  return out;
}

/** The claim numbers the sentences cite — the second way a log names its key claims. */
function citedNumbers(scenes) {
  const cited = new Set();
  (scenes || []).forEach((s) => (s.narration || []).forEach((seg) => {
    if (!seg || typeof seg !== 'object') return;
    const ref = seg.claim;
    (Array.isArray(ref) ? ref : (ref === undefined || ref === null ? [] : [ref]))
      .forEach((n) => cited.add(Number(n)));
  }));
  return cited;
}

function formatOf(storyboardDir) {
  const scenes = path.join(storyboardDir, 'scenes.js');
  if (!fs.existsSync(scenes)) return null;
  try {
    return JSON.parse(execFileSync('node', [FORMAT_RESOLVE, scenes, '--json'], { encoding: 'utf8' }));
  } catch (e) {
    return null;
  }
}

/** Reads scenes.js when it sits beside research.md, for the claim cross-check. */
function readScenes(storyboardDir) {
  const file = path.join(storyboardDir, 'scenes.js');
  if (!fs.existsSync(file)) return null;
  const vm = require('vm');
  const sandbox = { window: {}, console: { log() {}, warn() {}, error() {} } };
  sandbox.globalThis = sandbox;
  try {
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file, timeout: 5000 });
  } catch (e) {
    return null;
  }
  return Array.isArray(sandbox.window.SCENES) ? sandbox.window.SCENES : null;
}

/**
 * A sentence that states a figure, a date or a quantity is one a reader can check.
 *
 * The word-end guard is a negative lookahead, not `\b` — JS word boundaries are ASCII, so
 * `/배\b/` is false on "두 배" and `/일\b/` is false on "3일", which left both branches dead.
 */
const CHECKABLE = /[0-9]|퍼센트|배(?![가-힣])|억|만\s*원|천\s*원|년|월|일(?![가-힣])/;

/**
 * Cross-checks the sentences against the table: a cited claim that no row has, research that
 * never reached the video, and figure-carrying sentences that cite nothing.
 *
 * Runs only when at least one sentence carries `claim` — an episode that never adopted the
 * field is not reported as if every sentence were missing it.
 */
function crossCheck(scenes, claims, out) {
  if (!scenes) return null;
  const cited = new Map();          // claim number → how many sentences use it
  let carrying = 0, uncited = 0;
  scenes.forEach((s, i) => {
    (s.narration || []).forEach((seg) => {
      if (!seg || typeof seg !== 'object') return;
      const ref = seg.claim;
      const nums = Array.isArray(ref) ? ref : (ref === undefined || ref === null ? [] : [ref]);
      if (nums.length) {
        carrying++;
        nums.forEach((n) => cited.set(n, (cited.get(n) || 0) + 1));
      } else if (CHECKABLE.test(String(seg.sub || seg.tts || ''))) {
        uncited++;
      }
      nums.forEach((n) => {
        if (!claims.some((c) => c.n === Number(n)))
          out.push({ level: 'bad', what: `shot ${i + 1} cites claim ${n}, which no Verified row has — ` +
                                         'the table was renumbered, or the number was invented' });
      });
    });
  });
  if (!carrying) return null;       // the field is not in use on this episode
  const unused = claims.filter((c) => !cited.has(c.n)).map((c) => c.n);
  if (unused.length)
    out.push({ level: 'warn', what: `${unused.length} verified claim(s) no sentence uses (${unused.slice(0, 6).join(', ')}` +
                                    `${unused.length > 6 ? ' …' : ''}) — research that never reached the video` });
  if (uncited)
    out.push({ level: 'warn', what: `${uncited} sentence(s) carry a figure but cite no claim — ` +
                                    'those are the ones a factual pass has to start from' });
  return { carrying, uncited, unused: unused.length };
}

function analyse(src, fmt, scenes, opts) {
  opts = opts || {};
  const directionPhase = !!opts.directionPhase;
  const out = [];
  const bad = (what) => out.push({ level: 'bad', what });
  const warn = (what) => out.push({ level: 'warn', what });

  // Headings come in both languages. The template is written in English, and roughly half the
  // library authored the document in Korean instead — "검증 표" and "검증 통과" for Verified,
  // "검색 이력" for the search history. Matching only the template's wording reported every
  // Korean log as having no research at all (measured on the whole library, first run).
  // The question heading is anchored to the start of the heading text. Matching `질문` anywhere
  // pulled in `## 보조 근거 — 지식iN (질문 그대로가 훅의 재료)` and reported the 지식iN 상담
  // sentences under it as unanswered questions.
  // A heading may start with a number (`## 2. 검증 통과`) or a word (`## 사실 검증표`) — both
  // are optional prefixes here. `검증에서 뺀 것` still does not match: the word after 검증 has to
  // be 표 or 통과.
  const NUM = '(?:\\d+[.)]\\s*)?';
  const qRows = rows(section(src, new RegExp('^##\\s+' + NUM + '(Questions?\\b|질문(\\s|$))', 'i')));
  const vRows = rows(section(src, new RegExp('^##\\s+' + NUM + '(?:[\\w가-힣]{1,8}\\s)?(Verified|검증\\s*(표|통과))', 'i')));
  const dirBody = section(src, /Directions?|시나리오\s*방향|방향성|방향\s*후보/i) || '';
  const dRows = rows(dirBody);
  const mRows = rows(section(src, new RegExp('^##\\s+' + NUM + '(Messages?(\\s|$)|메시지)', 'i')));
  const cRows = rows(section(src, /Counter-evidence|반증|역검증/i));
  const fRows = rows(section(src, /Failed\s*(verification)?|검증\s*실패|본문\s*금지|제외/i));
  const suffBody = section(src, /Sufficiency|충분성|충족/i) || '';
  const searchBody = section(src, /Search\s*history|검색\s*(이력|기록|로그)/i);

  // ── Claims ──
  // The # cell is a number, optionally bold, optionally carrying ★ (a key claim).
  const claims = vRows.filter((r) => /^\**\s*★?\s*\d+\s*★?\s*\**$/.test(r[0] || ''))
    .map((r) => ({ n: Number((r[0] || '').replace(/[^\d]/g, '')), key: /★/.test(r[0] || ''), cells: r }));
  const claimCount = claims.length;

  const isLong = fmt && fmt.format === 'youtube-long-16x9';
  const aim = isLong ? FLOOR_LONG : FLOOR_SHORT;

  if (!vRows.length) bad('no Verified table — every factual claim maps 1:1 to a row there');
  if (claimCount < FLOOR_ABSOLUTE)
    bad(`${claimCount} verified claim(s) — below the floor of ${FLOOR_ABSOLUTE}. ` +
        'Change the angle or the topic rather than padding the body');
  else if (!directionPhase && claimCount < aim)
    warn(`${claimCount} verified claim(s) — a ${isLong ? 'long-form' : 'short'} normally leaves §2 with ${aim} or more`);

  // Every claim carries a basis in one of its source columns. The layout varies between logs
  // (the template has Source 1 / Source 2; several channels use a single 출처 column), so every
  // column from the third on is searched — the # and claim columns are excluded, or a claim
  // that happens to contain "뉴스" or an acronym would stand as its own basis.
  //
  // A URL is not the only valid basis. A figure measured here (`claude mcp add --help` run
  // locally), a quotation from the document the row above already cited, a source named by
  // name (Britannica · ORAU, AKS, 한식진흥원) or an official dataset are all bases — this only
  // fires when the row names nothing at all. The acronym test is case-sensitive on purpose:
  // AKS and BBC are sources, `naver_search` in the tool column is not.
  const BASIS = /https?:\/\/|원문|실측|측정|공식|같은\s*문서|자체\s*실험|1차|백과|사전|카탈로그|위키|wiki|박물관|기록원|논문|저널|보고서|고시|법령|시행령|일보|뉴스|신문|경제|타임스|times|연합|브리핑|진흥원|연구소|재단|협회|학회|nobel/i;
  const ACRONYM = /\b[A-Z]{3,}\b/;
  claims.forEach((c) => {
    const row = c.cells.slice(2).join(' ');
    if (!BASIS.test(row) && !ACRONYM.test(row))
      warn(`claim ${c.n} names no basis — no link, no measurement, no named source`);
  });

  // ── The self-reported line against the table ──
  // Both languages: `verified claims: **18**` and `검증 주장 18건`.
  const claimed = suffBody.match(/verified claims:\s*\**\s*(\d+)/i)
    || suffBody.match(/검증(?:된|\s*통과)?\s*(?:주장|클레임)\s*:?\s*\**\s*(\d+)\s*건/);
  if (!claimed) {
    warn('the Sufficiency section does not state a verified-claim count');
  } else if (Number(claimed[1]) !== claimCount) {
    bad(`Sufficiency says ${claimed[1]} verified claims, the Verified table has ${claimCount} — ` +
        'the self-report and the page disagree');
  }

  // ── Questions ──
  if (!qRows.length) {
    bad('no question map — §2 step 1 writes it before the first search, and every row has to ' +
        'end answered or written off');
  } else {
    // A row is open when its last cell is empty or still says "not yet" — not when it fails to
    // use one of a handful of English status words. Real logs put the answer itself in that
    // cell ("**유력 이하.** 상품화 중심"), and an allow-list read every one of them as open:
    // ep06-budae-jjigae had all ten questions answered and got nine violations for it.
    // The template is English and half the library is Korean, so both vocabularies of
    // "not yet" have to be here — an English log saying `searching` must still be caught.
    const open = qRows.filter((r) => {
      const status = (r[r.length - 1] || '').replace(/\*/g, '').trim();
      return !status
        || /^[-—–?.]*$/.test(status)
        || /^(tbd|todo|open|pending|n\/?a|unknown|unanswered|미정|미확인|보류)$/i.test(status)
        || /\bsearching\b|\bin progress\b|\bnot yet\b|조사\s*중|진행\s*중|확인\s*중|확인\s*안|답\s*없음|미답|아직|다음\s*회차/i.test(status);
    });
    if (open.length)
      bad(`${open.length} question(s) end neither answered nor written off — ` +
          open.slice(0, 3).map((r) => (r[0] || '?')).join(', '));
    const answeredLine = suffBody.match(/questions answered:\s*(\d+)\s*\/\s*(\d+)/i);
    if (answeredLine && Number(answeredLine[2]) !== qRows.length)
      warn(`Sufficiency counts ${answeredLine[2]} questions, the table has ${qRows.length}`);
  }

  // ── Messages (three, decided before the directions) ──
  // §2.1b: what a viewer living now understands, reconsiders or can do after the episode —
  // three different ones, each on Verified rows. A direction is the topic cut from one of
  // them, so a log with directions and no messages wrote its topics before their reason.
  // None may be a report of ignorance — "X는 알 수 없다" hands the viewer nothing at the
  // 마무리 (user directive 2026-09-07; scenario-stage §Messages first).
  const msgIds = mRows.filter((r) => /^\**\s*M?\s*\d+\s*\**$/i.test(r[0] || ''))
    .map((r) => ({ n: Number(String(r[0] || '').replace(/[^\d]/g, '')), cells: r }));
  if (msgIds.length < FLOOR_MESSAGES)
    bad(`${msgIds.length} message(s) — §2.1b writes three before any direction: what a viewer ` +
        'living now understands, reconsiders or can do after the episode, each a different message on Verified rows');
  msgIds.forEach((m) => {
    const hit = m.cells.slice(1, -1).join(' ').match(IGNORANCE);
    if (hit)
      bad(`M${m.n} is a report of ignorance ("…${hit[0]}") — a message names what the evidence ` +
          'establishes, not what nobody knows (scenario-stage §Messages first)');
  });

  // ── Directions (three topics, one per message, one pick) ──
  // First pass (--direction) needs three rows and no pick. Close needs the same three rows
  // plus one Chosen: line (or a Status cell that says chosen). Unchosen rows stay as not used.
  const dirIds = dRows.filter((r) => /^\**\s*D?\s*\d+\s*\**$/i.test(r[0] || ''))
    .map((r) => ({ n: Number(String(r[0] || '').replace(/[^\d]/g, '')), cells: r }));
  const chosen = new Set();
  const chosenLine = dirBody.match(/Chosen\s*:?\s*\**\s*D?\s*(\d+)/i)
    || dirBody.match(/(?:선택|채택)\s*:?\s*\**\s*D?\s*(\d+)/i);
  if (chosenLine) chosen.add(Number(chosenLine[1]));
  dirIds.forEach((d) => {
    const status = (d.cells[d.cells.length - 1] || '').replace(/\*/g, '').trim();
    if (/미선택|안\s*씀|not\s*used|rejected|unused|제안|proposed/i.test(status)) return;
    if (/^(chosen|selected|picked|선택|택함|채택)/i.test(status) || /\bchosen\b/i.test(status))
      chosen.add(d.n);
  });

  if (dirIds.length < FLOOR_DIRECTIONS) {
    bad(`${dirIds.length} direction(s) — §2.1 writes three, each a different episode this topic could be`);
  } else if (!directionPhase && chosen.size === 0) {
    bad('no direction pick — §2.2 records Chosen: D# (or a Status cell that says chosen) before the second search pass');
  } else if (chosen.size > 1) {
    warn(`directions ${[...chosen].join(', ')} are all marked chosen — pick one`);
  }

  // Each direction is the topic cut from one message, and says which. The # and Status cells
  // are left out of the read so a status word or the row id never trips the ignorance rule.
  const msgNums = new Set(msgIds.map((m) => m.n));
  const citedMsgs = [];
  dirIds.forEach((d) => {
    const text = d.cells.slice(1, -1).join(' ');
    const hit = text.match(IGNORANCE);
    if (hit)
      bad(`D${d.n} is a report of ignorance ("…${hit[0]}") — the 주제 names what the evidence ` +
          'establishes, never "X는 알 수 없다" (scenario-stage §Messages first)');
    if (!msgIds.length) return;
    const cite = text.match(/\bM\s*(\d+)\b/);
    if (!cite) bad(`D${d.n} cites no message (M#) — every direction is the topic cut from one of the three messages`);
    else if (!msgNums.has(Number(cite[1]))) bad(`D${d.n} cites M${cite[1]}, which is not in the Messages table`);
    else citedMsgs.push(Number(cite[1]));
  });
  const shared = citedMsgs.filter((n, i) => citedMsgs.indexOf(n) !== i);
  if (shared.length)
    bad(`directions share a message (M${[...new Set(shared)].join(', M')}) — one topic per message, ` +
        'so a message is left with no episode; write that message a topic of its own');

  // ── Which claims are key ──
  // Two readings, and both count: ★ in the # column, and the rows the sentences cite. A claim
  // the finished script says out loud is key whether or not someone starred it, so when both
  // signals exist they union rather than one shadowing the other. With neither, every row is
  // key — and the finding says which reading it used, so a log that marks nothing is told how
  // to stop being read that way.
  const starred = claims.filter((c) => c.key).map((c) => c.n);
  const cited = citedNumbers(scenes);
  const citedClaims = claims.map((c) => c.n).filter((n) => cited.has(n));
  const keyBasis = starred.length && citedClaims.length ? 'starred + cited'
    : starred.length ? 'starred' : (citedClaims.length ? 'cited' : 'all');
  const keys = starred.length || citedClaims.length
    ? Array.from(new Set(starred.concat(citedClaims))).sort((a, b) => a - b)
    : claims.map((c) => c.n);

  // ── Counter-evidence coverage ──
  // Every key claim gets one counter-evidence search (§2 step 2). Ranges count. A row that
  // names its claim by text instead of number cannot be mapped, and while any such row exists
  // the coverage of the rest is unknown — so that is reported instead of a per-claim list.
  const covered = new Set();
  let unmapped = 0;
  cRows.forEach((r) => {
    const nums = claimNumbers(r[0]);
    if (!nums.size) unmapped++;
    nums.forEach((n) => covered.add(n));
  });
  if (directionPhase) {
    // Counter-evidence is the second pass. First pass only has to offer three directions.
  } else if (!cRows.length) {
    bad('no counter-evidence section — every key claim gets one search against itself');
  } else if (unmapped) {
    warn(`${unmapped} counter-evidence row(s) name no claim number in the first cell — ` +
         'number them (the # of the Verified row) so coverage can be counted');
  } else {
    const missing = keys.filter((n) => !covered.has(n));
    if (missing.length)
      warn(`key claim(s) ${missing.join(', ')} have no counter-evidence row` +
           (keyBasis === 'all' ? ' (no ★ and no claim citations, so every row is read as key)'
             : keyBasis === 'starred' ? ' (★ rows)'
             : keyBasis === 'cited' ? ' (rows the sentences cite)'
             : ' (★ rows and the rows the sentences cite)') +
           ' — a claim nobody searched against is a claim nobody checked');
  }

  if (!fRows.length)
    warn('no "Failed verification → excluded" rows — everything searched for held up, ' +
         'which happens, but it is worth a second look');

  // ── Search history against the question map ──
  // §2 step 2 asks two searches per question from different directions. Table rows first; a
  // log that keeps the history as a bullet list is counted by its bullets — but only the
  // bullets that name a tool or carry a query. Counting every bullet let a history that says
  // in so many words that nothing was searched clear the rule on four sentences of prose.
  const SEARCH_LINE = /naver_search|WebSearch|WebFetch|serp_|youtube_|datago_|\bAPI\b|「|"|\u201c|\u201d/;
  let searches = null;
  if (searchBody !== null) {
    searches = rows(searchBody).length
      || searchBody.split('\n').filter((l) => /^\s*[-*]\s+\S/.test(l) && SEARCH_LINE.test(l)).length;
    if (qRows.length && searches < 2 * qRows.length)
      warn(`${searches} search(es) logged for ${qRows.length} question(s) — ` +
           '§2 step 2 asks two directions per question');
  } else if (!directionPhase) {
    warn('no search history section — the checker cannot count searches against questions');
  }
  if (directionPhase) {
    const n = searches == null ? 0 : searches;
    if (n < FLOOR_DIRECTION_SEARCHES)
      bad(`${n} search(es) logged — first pass logs ten or more before offering directions. ` +
          'Three honest directions need a wide enough map, not three wordings of the same two lookups');
  }

  const trace = crossCheck(scenes, claims, out);

  return {
    claims: claimCount, keyClaims: keys.length, keyBasis, questions: qRows.length,
    messages: msgIds.length, directions: dirIds.length, chosen: [...chosen],
    phase: directionPhase ? 'direction' : 'close',
    counterRows: cRows.length, counterUnmapped: unmapped, excluded: fRows.length,
    searches, floor: FLOOR_ABSOLUTE, searchFloor: FLOOR_DIRECTION_SEARCHES, aim, traceability: trace,
    format: fmt ? fmt.format : null, findings: out
  };
}

function selftest() {
  let failed = 0;
  const ok = (name, cond) => {
    process.stdout.write((cond ? 'ok   ' : 'FAIL ') + name + '\n');
    if (!cond) failed++;
  };

  const doc = (parts) => parts.join('\n');
  const good = doc([
    '# t — research & verification log (2026-08-28)',
    '',
    '## Questions this episode has to answer',
    '| # | Question | Why | Status |',
    '|---|---|---|---|',
    '| Q1 | a | hook | answered by claim 1 |',
    '| Q2 | b | stat | written off |',
    '',
    '## Verified',
    '| # | Claim | Source 1 | Source 2 | Tool | Checked | Notes |',
    '|---|---|---|---|---|---|---|',
    '| 1 | x | [a](https://a.example) | [b](https://b.example) | WebSearch | 2026-08-28 | |',
    '| 2 | y | [a](https://a.example) | [b](https://b.example) | WebSearch | 2026-08-28 | |',
    '| 3 | z | [a](https://a.example) | [b](https://b.example) | WebSearch | 2026-08-28 | |',
    '',
    '## Messages',
    '| # | Message | Why today | On claims | Status |',
    '|---|---|---|---|---|',
    '| M1 | x-msg | now | 1 | → D1 |',
    '| M2 | y-msg | now | 2 | → D2 |',
    '| M3 | z-msg | now | 3 | → D3 |',
    '',
    '## Directions',
    '| # | Message | 주제 · question | Hook form | Hero / stake | Already verified | Still to research | Status |',
    '|---|---|---|---|---|---|---|---|',
    '| D1 | M1 | a | gap | x | 1 | — | chosen |',
    '| D2 | M2 | b | number | y | 2 | — | not used |',
    '| D3 | M3 | c | identify | z | 3 | — | not used |',
    '',
    'Chosen: D1 (2026-08-28)',
    '',
    '## Counter-evidence & freshness',
    '| Claim # | Counter | What came back | Freshness | Still current? |',
    '|---|---|---|---|---|',
    '| 1~3 | "x 아니다" | nothing | 1y | yes |',
    '',
    '## Failed verification → excluded',
    '| Claim | Reason |',
    '|---|---|',
    '| q | sources conflict |',
    '',
    '## Sufficiency',
    '',
    'verified claims: **3** (floor 3) · questions answered: 1/2 · written off: Q2.',
    '',
    '## Search history',
    '| Tool | Query | Result |',
    '|---|---|---|',
    '| naver_search(kin) | a | … |',
    '| WebSearch | a 아니다 | … |',
    '| naver_search(news) | b | … |',
    '| WebSearch | b site:go.kr | … |',
    '| naver_search(blog) | a 후기 | … |',
    '| naver_search(cafe) | a 불만 | … |',
    '| naver_search(kin) | b 왜 | … |',
    '| WebSearch | competing explanation | … |',
    '| naver_search(encyc) | a 정의 | … |',
    '| datago_search | a 통계 | … |'
  ]);

  const bads = (r) => r.findings.filter((f) => f.level === 'bad');
  const has = (r, re) => r.findings.some((f) => re.test(f.what));

  const g = analyse(good, { format: 'shorts-9x16' });
  ok('a well-formed log has no violations', bads(g).length === 0);
  ok('it counts the claims', g.claims === 3);
  ok('it counts the directions', g.directions === 3 && g.chosen[0] === 1);
  ok('three claims still warns against the short aim of 5', has(g, /normally leaves/));

  // ── Headings the library actually writes ──
  // Measured 2026-08-29: `## 2. 검증 통과` and `## 사실 검증표` both read as 0 claims before this.
  ok('a numbered Korean heading is the Verified table',
     analyse(good.replace('## Verified', '## 2. 검증 통과'), null).claims === 3);
  ok('a heading with a word in front is the Verified table',
     analyse(good.replace('## Verified', '## 사실 검증표'), null).claims === 3);
  ok('검증에서 뺀 것 is not the Verified table',
     analyse(good.replace('## Verified', '## 검증에서 뺀 것'), null).claims === 0);
  ok('a numbered question heading is the question map',
     analyse(good.replace('## Questions this episode has to answer', '## 1. 질문'), null).questions === 2);

  // ── Key claims and counter-evidence ──
  ok('a number followed by a label is read as that number', claimNumbers('2 우연').has(2));
  const textRows = good.replace('| 1~3 | "x 아니다" |', '| 의정부 단독 최초 | "x 아니다" |');
  ok('a counter row naming no number is reported as unmapped, not as covering nothing',
     has(analyse(textRows, null), /name no claim number/) && !has(analyse(textRows, null), /have no counter-evidence/));
  ok('with nothing marked, every row is read as key and the finding says so',
     has(analyse(good.replace('| 1~3 |', '| 1 |'), null), /key claim\(s\) 2, 3 have no counter-evidence row \(no ★/));
  const starred = good.replace('| 1 | x |', '| ★1 | x |').replace('| 1~3 |', '| 1 |');
  ok('★ narrows the counter-evidence check to the starred rows',
     !has(analyse(starred, null), /have no counter-evidence/) && analyse(starred, null).keyBasis === 'starred');
  ok('a starred row with no counter row is reported',
     has(analyse(starred.replace('| 2 | y |', '| ★2 | y |'), null), /key claim\(s\) 2 have no counter-evidence row \(★ rows\)/));
  const citedOnly = analyse(good.replace('| 1~3 |', '| 1 |'), null,
                            [{ type: 'points', narration: [{ tts: 'x', sub: 'x', claim: 1 }] }]);
  ok('claim citations narrow the check when nothing is starred',
     citedOnly.keyBasis === 'cited' && !has(citedOnly, /have no counter-evidence/));

  // ── Self-report in Korean ──
  ok('검증 주장 N건 is read as the verified-claim count',
     !has(analyse(good.replace('verified claims: **3** (floor 3)', '검증 주장 3건 (바닥 3)'), null), /does not state/));

  // ── Search history ──
  ok('ten searches for two questions is enough', !has(g, /search\(es\) logged/));
  const oneSearch = good.replace(
    /## Search history[\s\S]*$/,
    '## Search history\n| Tool | Query | Result |\n|---|---|---|\n| naver_search(kin) | a | … |\n'
  );
  ok('one search for two questions is reported',
     has(analyse(oneSearch, null), /1 search\(es\) logged for 2 question\(s\)/));
  ok('a missing search history is reported',
     has(analyse(good.replace('## Search history', '## Notes'), null), /no search history section/));

  ok('below the floor is a violation',
     has(analyse(good.replace(/\| 3 \| z \|.*\n/, '').replace('**3**', '**2**'), null), /below the floor/));

  ok('a self-report that disagrees with the table is a violation',
     has(analyse(good.replace('verified claims: **3**', 'verified claims: **7**'), null),
         /Sufficiency says 7/));

  const q2 = (status) => good.replace('| Q2 | b | stat | written off |', `| Q2 | b | stat | ${status} |`);
  ok('a question left open is a violation',
     has(analyse(q2('searching'), null), /neither answered nor written off/));
  ok('the Korean half of "not yet" is caught too', has(analyse(q2('조사 중'), null), /neither answered/));
  ok('an empty status is a violation', has(analyse(q2(''), null), /neither answered/));
  ok('a placeholder dash is a violation', has(analyse(q2('—'), null), /neither answered/));
  ok('TODO and unanswered are violations',
     has(analyse(q2('TODO'), null), /neither answered/) && has(analyse(q2('unanswered'), null), /neither answered/));
  // "researching" contains "searching" — the guard is anchored so a real answer survives.
  ok('an answer that merely contains a stop word passes',
     !has(analyse(q2('answered — researching turned up the 1963 launch'), null), /neither answered/));
  // Half the library answers in Korean, in the cell itself. Reading only English status words
  // reported a fully answered map as nine open questions (ep06-budae-jjigae, measured).
  ok('a Korean answer in the status cell counts as answered',
     !has(analyse(q2('**유력 이하.** 상품화 중심. 단독 최초 1차 없음'), null), /neither answered/));
  ok('a heading that merely mentions 질문 is not the question map',
     analyse(good.replace('## Questions this episode has to answer',
                          '## 보조 근거 — 지식iN (질문 그대로가 훅의 재료)'), null).questions === 0);

  ok('a missing question map is a violation',
     has(analyse(good.replace('## Questions this episode has to answer', '## Notes'), null),
         /no question map/));

  ok('a claim with no counter-evidence row is flagged',
     has(analyse(good.replace('| 1~3 |', '| 1 |'), null), /claim\(s\) 2, 3 have no counter-evidence/));
  // A source named by name is a basis — ep03 wrote `카탈로그 | Britannica · ORAU` and got flagged.
  ok('a source named by name counts as a basis',
     !has(analyse(good.replace('| 1 | x | [a](https://a.example) | [b](https://b.example) |', '| 1 | x | 카탈로그 | Britannica · ORAU |'), null),
          /claim 1 names no basis/));
  ok('an uppercase acronym counts, a lowercase tool name does not',
     !has(analyse(good.replace('| 1 | x | [a](https://a.example) | [b](https://b.example) |', '| 1 | x | AKS | - |'), null), /claim 1 names no basis/) &&
     has(analyse(good.replace('| 1 | x | [a](https://a.example) | [b](https://b.example) | WebSearch |', '| 1 | x | - | - | naver_search |'), null), /claim 1 names no basis/));

  ok('a range in the Claim # column covers every claim in it',
     [...claimNumbers('1~6')].length === 6 && claimNumbers('1~6').has(4));
  ok('a comma list is read as separate claims',
     claimNumbers('1, 3').has(1) && claimNumbers('1, 3').has(3) && !claimNumbers('1, 3').has(2));

  ok('a claim naming no basis at all is flagged',
     has(analyse(good.replace('| 1 | x | [a](https://a.example) | [b](https://b.example) | WebSearch | 2026-08-28 | |',
                              '| 1 | x | - | - | - | - | |'), null),
         /claim 1 names no basis/));
  // A local measurement or a quotation from the row above is a basis, not a gap.
  ok('a measured figure counts as a basis',
     !has(analyse(good.replace('| 1 | x | [a](https://a.example) | [b](https://b.example) |', '| 1 | x | --help 로컬 실행 실측 | 같은 공식 문서 원문 |'), null),
          /claim 1 names no basis/));

  // ── claim traceability ──
  const sc = (narr) => [{ type: 'points', narration: narr }];
  const withClaims = (narr) => analyse(good, null, sc(narr));

  ok('an episode that never adopted the field is not reported as missing it',
     bads(withClaims([{ tts: '삼십 개', sub: '30개' }])).length === 0 &&
     !has(withClaims([{ tts: '삼십 개', sub: '30개' }]), /cite no claim/));

  const cited9 = withClaims([{ tts: 'x', sub: 'x', claim: 9 }]);
  ok('a cited claim that no row has is a violation',
     has(cited9, /cites claim 9/) && bads(cited9).some((f) => /cites claim 9/.test(f.what)));

  ok('an array of claim numbers is read',
     bads(withClaims([{ tts: 'x', sub: 'x', claim: [1, 2] }])).length === 0);

  ok('research no sentence uses is reported',
     has(withClaims([{ tts: 'x', sub: 'x', claim: 1 }]), /2 verified claim\(s\) no sentence uses/));

  ok('a figure-carrying sentence citing nothing is reported',
     has(withClaims([{ tts: 'a', sub: 'a', claim: 1 }, { tts: '팔십이 조각', sub: '82조각' }]),
         /1 sentence\(s\) carry a figure but cite no claim/));

  ok('a sentence with no figure needs no claim',
     !has(withClaims([{ tts: 'a', sub: 'a', claim: 1 }, { tts: '왜 그럴까요', sub: '왜 그럴까요' }]),
          /carry a figure but cite no claim/));

  // ── Directions and --direction ──
  const noDir = good.replace(/\n## Directions[\s\S]*?(?=\n## Counter-evidence)/, '');
  ok('a missing Directions section is a violation on close',
     has(analyse(noDir, null), /no direction pick|0 direction/));
  ok('two direction rows is a violation',
     has(analyse(good.replace('| D3 | M3 | c | identify | z | 3 | — | not used |\n', ''), null),
         /2 direction/));
  const unpicked = good.replace('| D1 | M1 | a | gap | x | 1 | — | chosen |',
                               '| D1 | M1 | a | gap | x | 1 | — | proposed |')
    .replace('Chosen: D1 (2026-08-28)', '');
  ok('three rows with no pick is a violation on close',
     has(analyse(unpicked, null), /no direction pick/));
  const dirOnly = unpicked.replace(/## Counter-evidence & freshness[\s\S]*?(?=\n## Failed)/,
                                   '## Counter-evidence & freshness\n');
  ok('--direction accepts three rows and no pick, even without counter-evidence',
     bads(analyse(dirOnly, { format: 'shorts-9x16' }, null, { directionPhase: true })).length === 0);
  ok('--direction still wants three rows',
     has(analyse(dirOnly.replace('| D3 | M3 | c | identify | z | 3 | — | not used |\n', ''),
                 null, null, { directionPhase: true }), /2 direction/));
  const nine = dirOnly.replace('| datago_search | a 통계 | … |', '');
  ok('--direction wants ten searches',
     has(analyse(nine, { format: 'shorts-9x16' }, null, { directionPhase: true }),
         /ten or more/));
  ok('--direction with no search history is a violation',
     bads(analyse(dirOnly.replace('## Search history', '## Notes'),
                  { format: 'shorts-9x16' }, null, { directionPhase: true }))
       .some((f) => /ten or more/.test(f.what)));
  ok('a Korean 시나리오 방향 heading is the Directions table',
     analyse(good.replace('## Directions', '## 시나리오 방향'), null).directions === 3);

  // ── Messages — three, before the directions, and each direction cites one ──
  ok('it counts the messages', g.messages === 3);
  ok('a Korean 메시지 heading is the Messages table',
     analyse(good.replace('## Messages', '## 2. 메시지'), null).messages === 3);
  const noMsg = good.replace(/\n## Messages[\s\S]*?(?=\n## Directions)/, '');
  ok('a missing Messages section is a violation on close', has(analyse(noMsg, null), /0 message\(s\)/));
  ok('a missing Messages section is a violation on --direction',
     has(analyse(noMsg, null, null, { directionPhase: true }), /0 message\(s\)/));
  ok('with no messages the directions are not also reported as citing none',
     !has(analyse(noMsg, null), /cites no message/));
  ok('two messages is a violation',
     has(analyse(good.replace('| M3 | z-msg | now | 3 | → D3 |\n', ''), null), /2 message\(s\)/));
  ok('a direction citing no message is a violation',
     has(analyse(good.replace('| D2 | M2 | b |', '| D2 | — | b |'), null), /D2 cites no message/));
  ok('a direction citing a message that is not on the page is a violation',
     has(analyse(good.replace('| D2 | M2 | b |', '| D2 | M7 | b |'), null), /D2 cites M7/));
  ok('the M in a status word or a hero stat is not a citation',
     !has(analyse(good.replace('| D2 | M2 | b |', '| D2 | M2 | b — 5M 원 |'), null), /cites M/));

  // ── A topic is never a report of ignorance (user directive 2026-09-07) ──
  const ign = (row) => analyse(good.replace('| D1 | M1 | a |', '| D1 | M1 | ' + row + ' |'), null);
  ok('a message that ends on 모른다 is a violation',
     has(analyse(good.replace('| M1 | x-msg |', '| M1 | 무엇이 떨어졌는지는 아직 모른다 |'), null),
         /M1 is a report of ignorance/));
  ok('a direction whose 주제 says nobody knows is a violation',
     has(ign('진실은 아무도 모른다'), /D1 is a report of ignorance/));
  ok('알 수 없습니다 is caught', has(ign('그날 무엇이 있었는지는 알 수 없습니다'), /report of ignorance/));
  ok('미스터리로 남았다 is caught', has(ign('사건은 미스터리로 남았다'), /report of ignorance/));
  ok('밝혀지지 않았다 is caught', has(ign('원인은 밝혀지지 않았다'), /report of ignorance/));
  ok('an English "remains a mystery" is caught', has(ign('what fell remains a mystery'), /report of ignorance/));
  ok('"we still don\'t know" is caught', has(ign("we still don't know what fell"), /report of ignorance/));
  ok('"알 수 없는" as a modifier passes the machine check',
     !has(ign('정체를 알 수 없는 물체가 떨어진 뒤 군은 왜 설명을 바꿨나'), /report of ignorance/));
  ok('a conditional 모른다면 passes', !has(ign('변속 원리를 모른다면 오르막에서 무엇을 잃나'), /report of ignorance/));
  ok('a quoted 없다는 clause passes', !has(ign('알 수 없다는 발표가 왜 불신을 키웠나'), /report of ignorance/));
  ok('"아무도 모르게" is an adverb, not a verdict',
     !has(ign('아무도 모르게 옮겨진 상자가 왜 문제였나'), /report of ignorance/));
  ok('"아무도 모르는 곳" is a modifier',
     !has(ign('아무도 모르는 곳에 숨긴 이유가 무엇이었나'), /report of ignorance/));
  ok('"미스터리다운" is not a predicate',
     !has(ign('그 기록에는 미스터리다운 매력이 있다'), /report of ignorance/));
  ok('a promise not to leave it unsolved passes',
     !has(ign('이 사건을 미제로 남기지 않으려 무엇을 했나'), /report of ignorance/));
  ok('a past-tense 몰랐다 is caught', has(ign('그날 무엇이 떨어졌는지 아무도 몰랐다'), /report of ignorance/));
  ok('"아무도 알지 못한다" is caught', has(ign('원인은 아무도 알지 못한다'), /report of ignorance/));
  ok('the message status cell is not read for ignorance',
     !has(analyse(good.replace('| M2 | y-msg | now | 2 | → D2 |',
                               '| M2 | y-msg | now | 2 | 미제 |'), null), /M2 is a report of ignorance/));
  ok('two directions on one message is a violation',
     has(analyse(good.replace('| D2 | M2 | b |', '| D2 | M1 | b |'), null), /share a message \(M1\)/));
  ok('the status cell is not read for ignorance',
     !has(analyse(good.replace('| D2 | M2 | b | number | y | 2 | — | not used |',
                               '| D2 | M2 | b | number | y | 2 | — | 미제 |'), null), /report of ignorance/));

  // Drift guard — the floors live in the skill, and this file has to agree with it.
  const skill = path.resolve(SELF_DIR, '..', 'SKILL.md');
  if (fs.existsSync(skill)) {
    const s = fs.readFileSync(skill, 'utf8');
    ok('SKILL §2 still says three verified claims is the floor',
       /Three verified claims is the floor/i.test(s));
    ok('SKILL §2 still aims a short at five or more', /\*\*five or more\*\*/.test(s));
    ok('SKILL §2 still aims a long-form at twelve or more', /\*\*twelve or more\*\*/.test(s));
    ok('SKILL §2.1 still writes three directions', /three honest directions/i.test(s));
    ok('SKILL §2.1b still writes three messages first', /§Messages first/.test(s));
    ok('SKILL §2.1 still asks ten or more searches', /\*\*ten or more\*\*/.test(s));
    ok('SKILL still names check-research.js --direction', /check-research\.js storyboard\/ --direction/.test(s));
  } else {
    process.stderr.write('WARN storyboard SKILL.md not found — floor drift guard skipped\n');
  }

  if (failed) { process.stderr.write(failed + ' check(s) failed\n'); process.exit(1); }
  process.stdout.write('check-research selftest OK\n');
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.indexOf('--selftest') !== -1) return selftest();
  const target = argv.filter((a) => !a.startsWith('--'))[0];
  if (!target) die('usage: check-research.js <storyboard dir | research.md> [--direction] [--json]');
  if (!fs.existsSync(target)) die('path not found: ' + target);

  const isDir = fs.statSync(target).isDirectory();
  const file = isDir ? path.join(target, 'research.md') : target;
  if (!fs.existsSync(file))
    die('research.md not found: ' + file +
        ' — a channel whose profile skips research has none, and that is not a defect');

  const fmt = formatOf(isDir ? target : path.dirname(file));
  const directionPhase = argv.indexOf('--direction') !== -1;
  const result = analyse(fs.readFileSync(file, 'utf8'), fmt,
                         readScenes(isDir ? target : path.dirname(file)),
                         { directionPhase });
  const bad = result.findings.filter((f) => f.level === 'bad');
  const warn = result.findings.filter((f) => f.level === 'warn');

  if (argv.indexOf('--json') !== -1) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(bad.length ? 1 : 0);
  }

  const lines = ['research.md — ' + result.claims + ' verified claim(s) · ' +
                 result.questions + ' question(s) · ' + result.messages + ' message(s) · ' +
                 result.directions + ' direction(s)' +
                 (result.chosen.length ? ' · chosen D' + result.chosen.join(', D') : '') +
                 ' · ' + result.excluded + ' excluded', ''];
  if (!result.findings.length) {
    if (result.phase === 'direction') {
      lines.push('  First pass closes: three messages and three directions citing them are on the page,');
      lines.push('  ten or more searches are logged, and there are enough verified claims to ask which one the episode is.');
    } else {
      lines.push('  The research closes: the floor is met, a direction is picked, every question');
      lines.push('  ends answered or written off, and each claim was searched against itself.');
    }
  } else {
    bad.concat(warn).forEach((f) => lines.push('  ' + (f.level === 'bad' ? '!' : '·') + ' ' + f.what));
    lines.push('');
    lines.push('  ' + bad.length + ' violation(s), ' + warn.length + ' to look at.');
  }
  process.stdout.write(lines.join('\n') + '\n');
  process.exit(bad.length ? 1 : 0);
}

main();
