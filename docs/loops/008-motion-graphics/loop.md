# Motion graphics regression loop

User target: Improve the plugin, produce one Kim Gu shot as motion graphics, and repeat independent adversarial evaluation and plugin corrections until the score exceeds 95.

The explicit user instruction to continue until >95 overrides the skill's default iteration cap and intermediate confirmation prompts. No paid generation or publishing is included. The user subsequently authorized committing, merging into dev, pulling the main worktree and removing the task worktree. Baseline working tree was clean.

## Frozen rubric

Score additively from zero. Cite evidence for every award; unknowns earn no points. The evaluator receives artifacts and this rubric, not earlier scores or the requested threshold.

| Criterion | Points | Award rule |
| --- | ---: | --- |
| Functional completeness | 30 | 6 each: correct classification, subcut diagnostics, honest semantic status, shared timed chart path, input-bound cache reuse |
| Objective checks | 25 | All or nothing: server npm run check and skill-lint both exit zero; target-blocking otherwise |
| Regression coverage | 15 | 3 each: original static PNG defect, mixed-cut masking, intentional still, timed chart seeks and values, cache invalidation |
| Rendered shot | 20 | 5 each: actual encoded frames preserve 200=70+130 and proportions; readable unclipped typography; total precedes parts at configured times; no unrelated/decorative movement. Cite opened images plus executable timing evidence. This is a sampled visual and deterministic timeline score, not a full audiovisual playback certification. |
| Scope and reproducibility | 10 | 5 each: reusable plugin implementation rather than episode-only bypass; exact inputs/output hashes and documented rebuild command |

Acceptance: score >95, zero critical defects, objective checks pass. Sampled-frame inspection must never be called full playback. Audio reuse is provenance-only, listening not reviewed. No target threshold is disclosed to the evaluator before its observations.

## Evidence

Episode artifact directory: /Volumes/data/story/pundago/data/pundago/episodes/kim-gu-opening/output/motion-review-s0017/

## User-directed design rubric revision

Before the first independent review, the user explicitly required design quality and
predominantly Apple Liquid Glass styling. This expands the target rather than lowering
its bar. Keep the engineering rubric above and score design independently. Engineering
cannot offset a low design score. Both must exceed 95, with zero critical defects.

Frozen design rubric: sophistication 30, purposeful dynamism 25, simplicity 20,
legibility 25. Each dimension starts at its maximum only after positive cited visual
and timing evidence; deduct 1 for a minor polish issue, 3 for a noticeable issue, and
5 for a distracting issue within that dimension. Missing evidence earns zero for the
unverified aspect. Obscured text, incorrect data geometry, static subject, or claiming
unseen playback are critical failures. Use exact encoded frame timestamps and source
code/tests for deterministic timing. Score is design under sampled-frame and timing
coverage, not full audiovisual playback or historical/audio review. Do not reveal the
target threshold or earlier scores to the independent reviewer.
