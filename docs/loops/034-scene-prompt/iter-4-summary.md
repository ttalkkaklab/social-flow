# Iteration 4 summary

Score 95, P0 = 0. Report: `verify-4.md`. The exit condition (score ≥ 95 and P0 = 0) held for a second run.
The one deduction (robustness −5) was the sibling of iteration 3's defect: the fix there emptied
`directionWarnings` for an authored prompt and left two other fields describing the prompt it replaces.

## Fix directives and what was done

1. D1, done at its root. The plan's direction record (`sourcePrompt`, `directionBindings`, `directionWarnings`)
   describes the prompt the planner composes from the board. With an authored `prompt` that text is not sent, so
   `buildVideoPlan` (`server/src/video-routing.ts`) now builds the record for the author's text on all three
   branches (compiled `promptSource`, legacy saved prompt, directed scene): `sourcePrompt` is the authored text,
   `directionBindings` leaves out the settings the planner would have written into the prompt (the image, adapter,
   assembly, guidance and unmapped entries stay), and `directionWarnings` keeps only what concerns the request
   itself (cut timing, an omitted shot picture). The compile's own warnings are not reported for a prompt that is not submitted.
   The existing case "planning compiles camera direction and refuses a caller replacing the scene prompt" in
   `server/test/video-routing.test.mjs` asserts both branches; `server/dist` was rebuilt.
   `skills/produce/references/voice-continuity.md` gained one sentence that states this.
2. Optional directive, not done, as in iteration 3: a non-string `prompt` returns the schema error every tool
   returns for a wrong type.

## Check for further fields of the same kind

Five lanes were planned twice, once composed and once with an authored prompt (a shot with `promptSource`, a
legacy saved prompt, a directed MSR scene, a directed two-speaker I2V scene, a one-speaker I2V scene). Every
string in the authored plan was searched for a sentence of the composed prompt that the submitted text does not
contain. What still carries such a sentence is there by design: `promptIssues` quotes the sentence it reports as
left out (`text_policy_missing`, `silent_direction_missing`), and `sceneRequest.shots[]` holds the board's shot
cards, which stay the evidence for lengths and limits.

## Evidence

- `cd server && HOME=$(mktemp -d) npm test` after the last edit and rebuild: 1364 pass, 0 fail, exit 0.
- Five full runs were captured after this fix. The first three failed one case each, `test/cover.test.mjs`
  "a shot cover reaches the library and reports a changed source" (`cover_chrome_failed: Chrome exited 2` from a
  headless `--dump-dom`), while the machine's load average was about 20. The last two passed. That case passes
  alone, four at once, with a temporary home and under artificial CPU load, and `server/src/cover.ts` and its test
  have no diff. Chrome's own error output was not captured in a failing run, so the cause is not identified.
- The new assertions fail on the code before the fix (`sourcePrompt` was the saved prompt and two bindings were
  `via:"prompt"`).
- A host model selection cannot drop an authored prompt: every scene plan on a host selection is refused with
  `scene_speech_route` before the host hand-off is built (nine probes: three hosts, composed and authored).

## Files touched after iteration 4

`server/src/video-routing.ts`, `server/test/video-routing.test.mjs`, `server/dist/*`,
`skills/produce/references/voice-continuity.md`.
