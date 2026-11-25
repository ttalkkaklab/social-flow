# Loop 034 — scene prompt

Date: 2026-11-24. Classification: A (feature implementation). Rubric frozen before the first verification.

## Target

The social-flow scene-to-video request path withstands adversarial testing: `video_plan` takes an authored prompt with
named references, the per-shot speaker limit follows the selected model, and every tool schema is valid for the host.
Exit at score >= 95 and p0 == 0 (the user's threshold; the verifier's tail line passes at 90, so the loop branches on the
score itself). No paid generation.

Out of scope: the GenAI gateway's `mode:"scene"` lane (another repository, not yet deployed), the quality of generated
media, and commits or pull requests.

## Capabilities

1. `video_plan {prompt}` sends the author's text with each `{id.role}` / `{id.image}` / `{id.voice}` / `{shotId.image}`
   replaced by the number that reference has in the submitted request, on every lane that plans a scene, and changes
   nothing else in the author's text.
2. Every scene plan returns `promptTemplate`; planning again with it yields the identical provider prompt and no issues.
3. Refused with a code: `placeholder_unresolved`, `placeholder_unlabeled`, `prompt_too_long`, `scene_prompt_unsupported`.
   Reported in `promptIssues`: `label_literal`, `reference_unmentioned`, `line_missing`, `text_policy_missing`.
4. A shot keeps lines from several speakers; a render over the selected model's pinned-voice capacity is reported as
   `scene_render_voice_limit`.
5. No tool input schema carries a boolean `exclusiveMinimum`/`exclusiveMaximum`; the built server lists
   `astra_genai_msr`, `astra_genai_img2video`, `shot_prompt` and `video_plan`.
6. The tool description, `skills/generate-cut-videos/SKILL.md`, `CLAUDE.md` and `README.md` describe 1–4 as the code behaves.

## Rubric

| Criterion | Weight | Award rule | Evidence | P0 |
| --- | --- | --- | --- | --- |
| Functional completeness | 35 | 35 × (capabilities 1–6 verified by execution or read / 6), rounded down. A reproduced wrong number, rewritten sentence or silently dropped input fails that capability | file:line or command output per capability | yes |
| Objective gate | 20 | `cd server && HOME=$(mktemp -d) npm test` exits 0 → 20, else 0 | command + exit code | yes |
| Adversarial robustness | 20 | 20 − 5 per distinct defect the verifier reproduces with its own probes (at least 8 probes): a wrong label, an uncoded crash, a prompt changed outside its placeholders, a refusal the docs do not state, or a paid call. Floor 0 | probe input + output | yes |
| Tests cover the new behavior | 10 | 10 × (capabilities 1–5 with a test that fails when the behavior breaks / 5), rounded down | test file:line per capability | no |
| Documentation accuracy | 10 | 10 − 3 per false or unverifiable claim about this feature in the changed docs (at least 5 claims checked). Floor 0 | doc file:line vs. code file:line | no |
| Surgical changes | 5 | every changed file belongs to the target scope → 5, else 0 | `git diff --name-only` | no |

TEST_CMD: `cd server && HOME=$(mktemp -d) npm test`. Maximum iterations: 5.

## Result

Achieved. The exit condition (score ≥ 95 and P0 = 0) was met at iteration 3 and held at iteration 4. The loop
stopped there and the fifth allowed run was not used. No paid generation was run.

| Iter | Score | P0 | Objective gate | Verdict |
| --- | --- | --- | --- | --- |
| 1 | 76 | 1 | exit 0 | FAIL |
| 2 | 91 | 1 | exit 0 | FAIL |
| 3 | 95 | 0 | exit 0 | PASS |
| 4 | 95 | 0 | exit 0 | PASS |

- Iterations 1 and 2 failed on the same P0: a doc sentence still stated the removed one-speaker-per-shot rule.
  The sentences were broken across hard-wrapped lines, so a line-based search missed them; a search with white
  space collapsed found the rest.
- Iterations 3 and 4 each lost 5 points to one reproduced P2 of the same family: with an authored `prompt`, a
  plan field still described the prompt the planner would have composed (`directionWarnings` at iteration 3,
  `directionBindings` and `sourcePrompt` at iteration 4). Both were fixed after scoring, each with an assertion in
  the existing case of `server/test/video-routing.test.mjs`. The iteration-4 fix was not scored by a verifier.
- State after the last edit: `cd server && HOME=$(mktemp -d) npm test` gives 1364 pass, 0 fail. Of five full runs
  captured after the iteration-4 fix, the first three failed one case in `test/cover.test.mjs` (headless Chrome
  exited 2) under a load average of about 20, and the last two passed; `cover.ts` and its test are unchanged and
  the cause was not identified.
- Left as it is: a non-string `prompt` returns the schema error instead of a coded refusal; `label_literal` also
  names `Image 1` inside `@Image 1`; a prompt that fits only after an adapter trims its edge white space is
  refused as `prompt_too_long`.

### After the merge with dev (2026-11-25)

The scores above describe the tree before it met `dev`. While the loop ran, pull request #708 put a copy of this
branch's `scene-prompt.ts` and `video-routing.ts` on `dev` and built on it, so the merge takes `dev`'s version of
both files and of their tests. What this branch still adds is the model-rule speaker limit with its documents, the
numeric `exclusiveMinimum` fix with its contract case, two assertions (the direction record of an authored prompt,
a cast id equal to a shot id) and this record.

Pull request #709 then added the shot-manifest renderer's modes (`sceneRendering`: `auto`, `single_msr`,
`per_shot`) and merged without a conflict.

`dev` changed what capabilities 1 and 3 describe, and the merged tree follows `dev`:

- In a scene with a cast or natively voiced dialogue an edited prompt may remove or reorder the planner's
  sentences and add a supported camera, blocking or media cue. A reworded sentence or free prose is refused
  (`scene_direction_unverified`). A scene with neither still takes free wording.
- The approved lines stay word for word, in order, each introduced by its speaker (`scene_dialogue_mismatch`,
  `scene_dialogue_speaker`); the earlier `line_missing` report no longer decides this.
- White space an adapter trims is reported (`prompt_whitespace_normalized`) and the preview shows the trimmed text.
- A typed number that names no input is refused (`reference_unknown`); one that names an input is refused under
  `wholeScene` and in a saved draft. A second picture of one role is named `role-<asset id>`, and two inputs that
  would share a name are refused (`placeholder_ambiguous`).
- A plan made with a `sceneRendering` mode returns no `promptTemplate` and refuses `prompt`
  (`scene_prompt_unsupported`), `single_msr` included.

Each line above was run on the merged build. No verifier scored the merged tree. Its gate,
`cd server && HOME=$(mktemp -d) npm test`, gives 1374 pass, 0 fail.

Artifacts: `loop.md`, `verify-1.md` to `verify-4.md`, `iter-1-summary.md` to `iter-4-summary.md`.
