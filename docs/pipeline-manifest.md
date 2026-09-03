# The pipeline manifest — one place the stages and gates are declared

Status: implemented (2026-08-30) · SoT `skills/platform-guide/references/pipeline.js`

## The problem this closes

`formats.js` already solved one axis of this repo. Every constant of both formats sits in
one preset file, the builders and templates keep their inline mirrors because a browser
cannot `require()` a plugin path, and `format-lint.js` machine-checks the mirrors against
the preset. Nobody hand-syncs a number any more, and a mirror that drifts fails a check
instead of shipping a portrait build on a landscape canvas.

The pipeline axis had no such file. The stage ladder and the gate policy were written down
in six places, all by hand:

| Where | What it holds |
|---|---|
| `episode-state.js` `stageOf`/`nextStep` | the five-rung ladder and the next command, hard-coded |
| `storyboard/SKILL.md` §7 | the HITL approval gate, in prose |
| `produce/SKILL.md` §7 · §10 | the build-report gate and the content-reviewer gate, in prose |
| `publish/SKILL.md` §1 | the publish approval gate, in prose |
| `autoproduce/SKILL.md` §"What stands in for the human gates" | the unattended machine gates, as a table |
| `platform-guide/SKILL.md` §"Adversarial review gate" | the reviewer-to-verdict-tail contract, as a table |

Six copies of one fact, and no checker over any of them. Renumber a section in produce and
autoproduce's table still points at the old one. Add a reviewer mode and the platform-guide
table can stay a mode short for months. The drift `format-lint.js` catches on the format
axis was running unchecked on the pipeline axis.

## What was adopted, and from where

OpenMontage (`/Volumes/data/repository/zeans/social/OpenMontage`) runs thirteen declarative
YAML manifests, one per content type, each listing stages, `human_approval_default`,
`produces`, and `required_tools`; `lib/pipeline_loader.py` reads them and `lib/checkpoint.py`
refuses to write a gated stage `completed` without approval. Its strength is that the process
is data a program can read.

Its weakness is the other half of what this repo already does well. Thirteen manifests
duplicate one backbone — every one of them runs `script → scene_plan → assets → edit →
compose → publish` — and its `review_focus` entries are plain strings an agent reads with
its own eyes, with no machine verdict behind them.

So this takes the declarative layer and leaves the duplication:

- **From OpenMontage** — stages, gates, and lanes as data, in one file, read by code.
- **Kept from here** — the axis model (format × mode stays two values, not four pipelines),
  the derive-don't-store rule (`episode-state.js` still reads what the skills already write,
  and there is still no state file), and enforcement by executable checker rather than by
  schema alone.

## The design

Three files, mirroring the `formats.js` / `format-lint.js` pair that already works.

```
pipeline.js        SoT — STAGES · GATES · REVIEWERS · LANES
   ├─ episode-state.js    derives an episode's stage from STAGES (no longer hard-coded)
   └─ pipeline-lint.js    checks the prose mirrors against the SoT (read-only)
```

**`pipeline.js`** declares four things.

- `STAGES` — the ladder, each rung with a `done` predicate, the skill that finishes it, and
  the `next` command. Predicates are a three-form mini-grammar (`has:`, `status:`,
  `scenes:`) evaluated against the facts `episode-state.js` already collects.
- `GATES` — every gate in the pipeline, attended and unattended, with the skill and section
  it lives in, what it checks, and what happens on failure. The eight unattended gates
  carry autoproduce's own gate numbers so the table and the data can be compared row by row.
- `REVIEWERS` — the five reviewer agents, their surfaces, score bars, and verdict tails.
- `LANES` — produce §1's three routing paths (generated · screencast · mixed), the axis
  model written as data instead of as a table only a human reads.

**`pipeline-lint.js`** reads the SoT and checks nine rules against the prose. It never
edits: like `format-lint.js`, it prints diverging pairs and exits 1, and which side is
wrong stays a human call.

**`episode-state.js`** now imports `STAGES` and evaluates the predicates. The ladder,
the next commands, and the stage list in the `--all` renderer all come from the manifest.
Its self-test is unchanged and still passes — that identity is the acceptance condition,
the same way `format-resolve.js` had to emit output character-identical to the builder
defaults.

## What was deliberately not done

**The prose stays.** Not one gate description was deleted from a SKILL.md. The lint checks
the mirrors; it does not replace them. A skill document is where an agent learns *how* to
run a gate — the manifest only fixes *that* the gate exists, where, and what it decides.
Deleting the prose in favour of the data would trade a readable instruction for a lookup.
This is the same call `format-lint.js` made about the template mirrors.

**No per-type pipelines.** OpenMontage's thirteen manifests are the part not worth copying.
Format and mode stay orthogonal values on one pipeline; `LANES` describes the three build
paths that already exist rather than inventing new ones.

**No checkpoint file.** OpenMontage writes `project.json` and enforces gates against it.
Here the enforcement point is `episode-state.js`'s blocker list, which derives from artifacts
on disk. A second copy of the state would drift from the first — the disease `format-lint.js`
exists to police.

## Roadmap

1. ~~SoT + lint + `episode-state.js` consuming it~~ — done.
2. ~~Wire the lint into CI~~ — done: `check.yml` runs `pipeline-lint.js --selftest` and
   `episode-state.js --selftest`, so a renumbered section fails a check rather than a reading.
3. Move `blockers()`'s per-stage applicability into `GATES` once a second consumer needs it.
   One consumer is not yet an abstraction.
