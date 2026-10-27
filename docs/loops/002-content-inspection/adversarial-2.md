# Cycle 2 adversarial findings — no score assigned

Reviewed against the frozen `loop.md` rubric. Artifact:
`data/review-lab/cycle-2/gate-webtoon/episodes/gate-beyond-rewrite/storyboard/scenes.js`.
Reviewer: inspect_skill agent. This agent authored inspect-content and portal image
tests, so this is a disclosed contributing-agent adversarial review, not a fresh-context
independent final evaluator. No final score or pass is issued. Parent requested stopping
after findings so a revised generation can address them.

## Evidence checked

- Read the full 17-shot plan through direct source extraction, STORY and SB_DOC,
  background registry, prop registry, ledger, candidates' selection provenance and
  authoring status. Read installed-final-2.json live MCP probe and install-2.json.
- Independently recomputed installed bundle SHA-256: matches the probe's
  `4f6ccd0d5bf5e73ab07c89124d86d1d42b59f9d54ace2482d4a102756993bccb`.
- Independently recomputed original scenes.js and three original identity.md hashes:
  all match cycle-2 provenance. Source preservation supported for these files.
- Install report records 744 verified files at each of three installations; this
  reviewer did not independently recompute all 744-file trees.
- Fresh MCP stdio probe exposes shotId, includeContext and imageView. Its full output
  carries silent action, explicit speech, references and honest not_verified flags.
- check-2.log reports 3,788 tests passed, zero failures. The final combined objective
  gate and UI artifact assessment are not certified in this interim report.
- Actual original-image observations are in `data/review-lab/reference-inspection.md`:
  9 character panels and 8 existing scene images opened. No new rewrite images,
  full playback or speech were inspected. Planning scope does not require them.

## Material planning defects

### 1. Visible glasses contradict shot cast and framing

Every shot lists smart-glasses with `visible:true` and position on Minjae's face.
Yet s0003, s0007, s0011 and s0012 declare only the other speaker in visual.character.
s0013 is explicitly a hand/key/envelope insert but still claims visible face-worn glasses.
The prompt assembler therefore receives contradictory cast/prop visibility plans.
Define on-camera actors per shot, hide off-camera props, and validate consistency.

### 2. Causal props disappear from structured usage

s0004 visibly observes Yeonhwa's bundle and Jang's notebook, but lists only glasses.
s0006 depends on showing that same notebook/red-door drawing to police, again without
a registered notebook. s0010 describes tightening the bundle knot but omits bundle
usage. s0015 uses a route-change note and s0016/17 protect destination papers without
distinct registered references or state. A clean ledger for four registered objects
does not demonstrate complete prop coverage. Register plot-bearing objects and bind
actual visible instances; keep the closed bundle distinct from background paper stocks.

### 3. One static insert cannot show the decisive sequence

s0013 has one still-camera slide and camera framing "열쇠와 봉투를 놓는 민재의 손".
Its single action requires: Minjae places both items; Jang pushes the key back; Minjae
refuses; Yeonhwa witnesses from an opposite warehouse hidden from Jang. A hand insert
cannot also communicate the separated witness and asymmetric sightline. The shot's
generic layout even requests faces/bodies while its explicit framing excludes them.
Split into legible still beats or specify a concrete multi-panel presentation that
actually preserves order. Do not label a camera push as subject motion.

### 4. Crucial background geometry is not planned

SB_DOC.backgrounds has only broad modern/office/lane/printshop descriptions and old
reference images. It does not establish the red door used as causal evidence, blocked
passage, opposite warehouse, hiding angle or intermediate bench. s0013 needs one
person to observe across the lane while remaining unseen; prose asserts that outcome
without a usable camera/space plan. s0015–17 are a warehouse interior but their
backgroundId is printshop and their per-shot reference is original scene-13, an exterior
alley. Define landmarks and positions, distinguish warehouse from printshop if different,
and name exactly what each old reference supports or contradicts.

### 5. Shot direction repeats defaults instead of resolving events

All 17 shots use dolly-in, slow, portrait-purpose still-camera routing, largely identical
left-light/axis and no-eyeline explanations. s0002 lowers glasses, removes/reveals a door
and crosses a threshold in one four-second still. s0015 passes a note, receives a mark,
observes across a lane, waits for a door closure and sets down a parcel in one still.
s0017 combines nod, pocket gesture and transport. Explicit before/after images or
separate panels are needed where temporal causality matters; one generic push does
not make these actions observable. Shot flow must be executable within no_video.

## Supported qualities and limits

The script connects witnessed route disclosure to arrest, forces relinquishment of
material benefits, and gives Yeonhwa limited trust and control over onward routing.
The closed-bundle registry now explicitly excludes the old bare paper stack. Selection
records assistant delegation and humanStoryboardApproval:false; authoring status
retains pending story review. These are honest planning records, not approval or media
quality claims. Legacy faceless fronts remain unchanged and are disclosed as references.

No P0 is asserted from this interim inspection, but the listed material defects prevent
this reviewer from endorsing a 95-point final result. Fresh regenerated output and a
fresh-context evaluator must reassess after fixes; do not carry forward this report as
a passing review or treat the target score as evidence.
