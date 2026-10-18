/**
 * pipeline.js — the episode pipeline's step catalog: stages, checks, lanes and reviewers
 * (Single Source of Truth)
 *
 * This file is to the pipeline axis what formats.js is to the format axis. It gathers the
 * stage ladder and the check catalog that were scattered across five SKILL.md sections and one
 * hard-coded switch statement into one place, and pipeline-lint.js machine-checks the prose
 * mirrors against it. Since the owner directive of 2026-10-16 only operational contracts stop
 * work (readable inputs, actual spending limits, real authorization); reviews and style checks
 * file findings, and the rows below say so.
 *
 * ┌ Consumers ──────────────────────────────────────────────────────────┐
 * │ episode-state.js   STAGES → an episode's stage, next step, ladder   │
 * │ pipeline-lint.js   checks the SKILL.md mirrors against here (r/o)   │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * ## Every value here is transcribed
 *
 * Nothing in this file is new policy. Each entry came out of code or a document that already
 * said it, and the grounds comment names the file and line it came from. That identity is the
 * acceptance condition: episode-state.js --selftest passes unchanged after switching to this
 * manifest, the same way format-resolve.js had to emit output character-identical to the
 * builder defaults. Change a value here only together with the prose it mirrors.
 *
 * ## Why the prose still exists
 *
 * A SKILL.md section teaches an agent *how* to run a check or review — what to put on the
 * approval screen, which findings to carry, how to word the delegation. This file fixes only
 * *that* the step exists, where it lives, and what it decides. Deleting the prose in favour of the
 * data would trade a readable instruction for a lookup, so the mirrors stay and the lint
 * checks them (the same call format-lint.js made about the template mirrors).
 */

'use strict';

/**
 * The stage ladder. A rung is finished when its `done` predicate holds; an episode's stage is
 * the highest finished rung, so evaluation runs from the top down.
 *
 * Predicate grammar — three forms, evaluated against the facts episode-state.js already
 * collects. Deliberately small: this is a ladder, not a rules engine.
 *
 *   has:<key>        ep.has[key] is truthy
 *   status:<value>   the storyboard.md frontmatter `status` equals value (lower-cased)
 *   scenes:approved  scenes.js carries the `// approved:` comment storyboard §7 writes
 *
 * `{ any: [...] }` is an OR. Transcribed from episode-state.js stageOf() as it stood on
 * 2026-08-30 — same order, same conditions.
 */
const STAGES = [
  {
    id: 'empty',
    label: 'nothing authored yet',
    skill: null,
    done: null, // the floor — reached when no higher rung holds
    next: '/social-flow:storyboard {channel} {topic}',
  },
  {
    id: 'drafted',
    label: 'scenes.js exists, not yet approved',
    skill: 'storyboard',
    done: { any: ['has:scenes'] },
    next: 'finish the storyboard and take it to the §7 approval gate',
    gate: 'storyboard-approval',
  },
  {
    id: 'approved',
    label: 'the human approved the storyboard',
    skill: 'storyboard',
    done: { any: ['status:approved', 'scenes:approved'] },
    // Two hand-offs: an episode with filmed scenes goes to the camera first (storyboard §7).
    next: {
      filmed: 'film what script.md lists, then /social-flow:produce {channel} {topic}',
      default: '/social-flow:produce {channel} {topic}',
    },
  },
  {
    id: 'produced',
    label: 'the video is built',
    skill: 'produce',
    done: { any: ['status:produced', 'has:video'] },
    next: '/social-flow:publish {channel} {topic}',
    gate: 'publish-approval',
  },
  {
    id: 'published',
    label: 'the episode is out',
    skill: 'publish',
    done: { any: ['status:published', 'has:publishLog'] },
    next: 'done — /social-flow:review-recent {channel} reads how it did',
  },
];

/**
 * Off the ladder: scenes.js exists but does not evaluate. Nothing downstream can read the
 * episode, so it gets its own stage rather than a rung.
 */
const BROKEN_STAGE = {
  id: 'broken',
  label: 'scenes.js does not evaluate',
  next: 'scenes.js does not evaluate — fix it before anything reads it',
};

/**
 * Every check in the pipeline — the step catalog.
 *
 *   kind      hitl = a person decides (authorization) · machine = a checker or a reviewer runs;
 *             `checks` says what it looks at and `onFail` what happens with the finding
 *   skill     the skill whose document runs it · section = the heading it lives under
 *   num       autoproduce's own step number, for the unattended ones (SKILL.md replacement table)
 *   replaces  which attended step this unattended one stands in for
 *
 * The attended steps were transcribed from storyboard/SKILL.md:1228, produce/SKILL.md:1221 and
 * :1380, publish/SKILL.md:158; the unattended ones from autoproduce/SKILL.md's replacement
 * table and its `(gate N)` section headings. Owner directive 2026-10-16: the score bars,
 * review-round caps, topic drops and queue holds those rows used to carry are retired —
 * a review files findings with the episode, and only operational contracts (facts that
 * cannot be supported, an unbuildable report, a spending cap, authorization) change what
 * happens next. `onFail` below reads accordingly.
 */
const GATES = [
  // ── Attended path ────────────────────────────────────────────────────
  {
    id: 'narration-approval',
    kind: 'hitl',
    skill: 'storyboard',
    section: '§4.6',
    heading: 'Narration approval',
    stage: 'drafted',
    checks: 'the human reads the whole narration joined into prose, with both review scores',
    onFail: 'the changed sentences go back through §4.4 or §4.5 inside the same caps, then present again',
  },
  {
    id: 'storyboard-approval',
    kind: 'hitl',
    skill: 'storyboard',
    section: '§7',
    heading: 'HITL approval gate',
    stage: 'drafted',
    checks: 'the human approves the storyboard, the two narration review results, and the money',
    onFail: 'apply the change request and present again — produce does not start',
  },
  {
    id: 'build-report',
    kind: 'machine',
    skill: 'produce',
    section: '§7',
    heading: 'The build report gate',
    stage: 'produced',
    checks: 'drift 0.0000s · no missing reveal state · no unused last reveal state',
    onFail: 'do not proceed — rebuild',
  },
  {
    id: 'content-review',
    kind: 'machine',
    skill: 'produce',
    section: '§10',
    heading: 'Quality gate',
    stage: 'produced',
    reviewer: 'content-reviewer',
    checks: 'content-reviewer read on request or for a concrete uncertainty; the CONTENT_REVIEW tail is filed with the episode as evidence (no score bar)',
    onFail: 'report the unresolved findings to the user and let them decide',
  },
  {
    id: 'publish-approval',
    kind: 'hitl',
    skill: 'publish',
    section: '§1',
    heading: 'HITL approval gate',
    stage: 'produced',
    checks: 'the human approves the platforms and the copy before anything gets a public URL',
    onFail: 'nothing is hosted and nothing is posted',
  },

  // ── Unattended path — the machine gates that stand in for the two HITL gates ─
  {
    id: 'facts',
    num: '1',
    kind: 'machine',
    skill: 'autoproduce',
    section: '§2',
    replaces: 'storyboard-approval',
    checks: 'time-sensitive values cross-checked against 2 independent sources · verified facts recorded in research.md',
    onFail: 'narrow unsupported claims or choose a supported candidate; a topic is dropped only when no claim in it can be supported',
  },
  {
    id: 'style',
    num: '2',
    kind: 'machine',
    skill: 'autoproduce',
    section: '§4',
    replaces: 'storyboard-approval',
    checker: 'check-style.py',
    checks: 'check-style.py run per surface; its findings are recorded with the episode',
    onFail: 'fix the concrete findings; S1 and S2 are suggestions and never abort authoring',
  },
  {
    id: 'build',
    num: '3',
    kind: 'machine',
    skill: 'autoproduce',
    section: '§8',
    replaces: 'build-report',
    checks: 'build-report.txt drift 0 · 0 missing reveals · voice-to-bed separation ≥ 4 LU',
    onFail: 'abort',
  },
  {
    id: 'quality',
    num: '4',
    kind: 'machine',
    skill: 'autoproduce',
    section: '§10',
    replaces: 'publish-approval',
    reviewer: 'content-reviewer',
    checks: 'content-reviewer read on request or for a concrete uncertainty; findings filed with the episode (no score bar)',
    onFail: 'report the findings; queue_*: hold is for a delivery failure (build or media missing), a cost cap or missing authorization, never for a score',
  },
  {
    id: 'spend',
    num: '5',
    kind: 'machine',
    skill: 'autoproduce',
    section: '§5',
    replaces: 'storyboard-approval',
    checker: 'cost-report.sh --cap',
    checks: 'cost-report.sh --cap exit 0',
    onFail: 'escalation cancelled, back to the economy baseline',
  },
  {
    id: 'review-scenario',
    num: '6a',
    kind: 'machine',
    skill: 'autoproduce',
    section: '§2.2',
    replaces: 'storyboard-approval',
    reviewer: 'storyboard-reviewer',
    mode: 'scenario',
    checks: 'the candidates judged in one batched read on curiosity · fear · intrigue · comedy; findings and scores filed, no bar',
    onFail: 'continue with the best justified candidate and report the findings; a topic is dropped only for an unsupportable premise',
  },
  {
    id: 'review-narration',
    num: '6f',
    kind: 'machine',
    skill: 'autoproduce',
    section: '§3.5',
    replaces: 'storyboard-approval',
    reviewer: 'storyboard-reviewer',
    mode: 'narration',
    checks: 'the narration alone, handed inline and read in order without the picture; findings filed, no bar and no fixed read count',
    onFail: 'repair material weaknesses within the task and report the rest; authoring continues',
  },
  {
    id: 'review-vocabulary',
    num: '6c',
    kind: 'machine',
    skill: 'autoproduce',
    section: '§3.6',
    replaces: 'storyboard-approval',
    reviewer: 'storyboard-reviewer',
    mode: 'vocabulary',
    checks: "the narration's words alone, handed inline; findings filed, no bar and no fixed read count",
    onFail: 'repair material weaknesses within the task and report the rest; authoring continues',
  },
];

/**
 * The reviewer agents and their verdict tails. Transcribed from platform-guide/SKILL.md's
 * review table and the agent definitions in agents/.
 *
 * `bar` and `rounds` are null for every reviewer since 2026-10-16: a score informs revisions
 * and never decides sending, queueing or authoring; a review runs on request or for a concrete
 * uncertainty, not a fixed number of times. A user who explicitly asks for a convergence loop
 * sets its target in that request, not here.
 */
const REVIEWERS = [
  {
    id: 'storyboard-reviewer',
    tails: ['STORYBOARD_REVIEW'],
    // scenario is one batched read on the unattended path; narration and vocabulary are reads
    // the delegator asks for. The other five modes stay in the agent for on-request reads —
    // the default flow stopped calling them in 0.50.0.
    bar: null,
    rounds: null,
    modes: ['scenario', 'narration', 'copy', 'scene', 'vocabulary', 'camera', 'sound', 'image'],
    surfaces: ['storyboard copy'],
  },
  {
    id: 'content-reviewer',
    tails: ['CONTENT_REVIEW', 'PLAN_REVIEW'],
    bar: null,
    rounds: null, // read at produce §10 on request or for a concrete uncertainty; plan mode on request only (0.50.0)
    modes: ['deliverable', 'plan'],
    surfaces: ['platform copy'],
  },
  {
    id: 'growth-post-reviewer',
    tails: ['GROWTH_POST_REVIEW'],
    bar: null,
    rounds: null,
    modes: ['post', 'reply', 'standalone'],
    surfaces: ['growth copy', 'post-publish replies', 'bio · channel description · tagline'],
  },
  {
    id: 'brand-reviewer',
    tails: ['BRANDING_REVIEW', 'INTRO_REVIEW'],
    bar: null,
    rounds: null, // a convergence loop runs only when the user asks for one (branding/intro skills)
    modes: ['profile-image', 'intro'],
    surfaces: ['channel assets'],
  },
  {
    id: 'slide-reviewer',
    tails: ['SLIDE_REVIEW'],
    bar: null,
    rounds: null, // on request only since 0.50.0 — the flow admits a slide on check-slide.js and the author's own sheet read
    modes: ['slide'],
    surfaces: ['motion slides'],
  },
];

/**
 * The three build paths produce §1 routes between. This is the axis model as data: format and
 * mode stay two orthogonal values on one pipeline, and these are the lanes their combinations
 * land in. Transcribed from produce/SKILL.md:150's routing table.
 */
const LANES = [
  {
    id: 'screencast',
    label: 'Shooting edit',
    when: 'recording/alignment.json present + portrait',
    doc: 'produce/references/screencast-pipeline.md',
    builder: 'build-screencast.sh',
    // The band constants are absolute portrait pixels — landscape has nowhere to put them.
    formats: ['shorts-9x16'],
  },
  {
    id: 'mixed',
    label: 'Mixed shooting',
    when: 'filmed scenes (visual.source === "recording") mixed in',
    doc: 'produce/SKILL.md §3.5',
    builder: 'build-reel.sh',
    formats: ['shorts-9x16', 'youtube-long-16x9'],
  },
  {
    id: 'generated',
    label: 'Generated',
    when: 'anything else',
    doc: 'produce/SKILL.md §2–7',
    builder: 'build-reel.sh',
    formats: ['shorts-9x16', 'youtube-long-16x9'],
  },
];

/** The rung ids in ladder order — the renderer draws the strip from this. */
const STAGE_IDS = STAGES.map((s) => s.id);

/** Evaluate one predicate string against the facts episode-state.js collected. */
function testPredicate(pred, facts) {
  const [kind, value] = pred.split(':');
  if (kind === 'has') return Boolean(facts.has && facts.has[value]);
  if (kind === 'status') return (facts.status || '').toLowerCase() === value;
  if (kind === 'scenes') return value === 'approved' && Boolean(facts.approved);
  throw new Error('pipeline: unknown predicate "' + pred + '"');
}

/** Is this rung finished? A `done` of null is the floor and never holds on its own. */
function stageDone(stage, facts) {
  if (!stage.done) return false;
  if (stage.done.any) return stage.done.any.some((p) => testPredicate(p, facts));
  if (stage.done.all) return stage.done.all.every((p) => testPredicate(p, facts));
  return false;
}

/**
 * The highest finished rung, or the floor. `facts` is { has, status, approved } — the caller
 * decides what is off-ladder (a missing storyboard directory, an unparseable scenes.js).
 */
function resolveStage(facts) {
  for (let i = STAGES.length - 1; i >= 0; i--) {
    if (stageDone(STAGES[i], facts)) return STAGES[i].id;
  }
  return STAGES[0].id;
}

/** The next command for a stage. `vars` fills {channel}/{topic}; `filmed` picks the hand-off. */
function nextFor(stageId, vars, filmed) {
  const stage = STAGES.find((s) => s.id === stageId);
  if (!stage) return '';
  const tpl = typeof stage.next === 'string'
    ? stage.next
    : (filmed ? stage.next.filmed : stage.next.default);
  return tpl.replace(/\{channel\}/g, vars.channel).replace(/\{topic\}/g, vars.topic);
}

const gateById = (id) => GATES.find((g) => g.id === id) || null;
const unattendedGates = () => GATES.filter((g) => g.num);

module.exports = {
  STAGES, STAGE_IDS, BROKEN_STAGE, GATES, REVIEWERS, LANES,
  resolveStage, stageDone, testPredicate, nextFor, gateById, unattendedGates,
};
