# Iteration 1 summary

Score 76, FAIL, P0 = 1 (capability 6: stale one-speaker sentences). Report: `verify-1.md`.

## Fix directives and what was done for iteration 2

1. Trimmed prompt against "never trimmed" docs.
   - The plan input no longer trims. A prompt of white space only is `scene_prompt_empty`.
   - Five adapter families trim their own prompt in their schema (GenAI MSR, audio-to-video and Desktop, LTX
     Desktop, Veo). The plan restores the author's text after that parse, so `plan.args.prompt` is exact on every
     lane; the docs say that those adapters drop white space at the two ends when they send.
   - Tested on the MSR lane (`video-routing.test.mjs`, 'an authored scene prompt names its references…').
2. Stale one-speaker sentences replaced with the model-capacity wording:
   `skills/produce/SKILL.md:12`, `skills/produce/references/voice-continuity.md:133`,
   `skills/produce/references/shot-speech.md` (text-free sentence paragraph) and the `camera.relay` entry of
   `skills/storyboard/references/film-techniques.js`.
3. Braces. A brace that is not a name is still refused (`placeholder_unresolved`), and the tool description,
   `SKILL.md` and `CLAUDE.md` state it. Braces the board's own text carries are sent as written, so a spoken
   line with braces round-trips. A brace without its pair is refused.
4. `server/test/storyboard.test.mjs`: the existing dialogue case now writes two speakers into one shot and reads
   both back in order.
5. `server/dist` rebuilt; gate rerun.

## Defects found by my own probes and fixed

- The adapter parse saw header + body, so its own schema maximum could raise an uncoded error. The author's text
  is parsed alone; the header is counted by the resolver, which also applies the schema's UTF-16 maximum.
- A number inside a spoken line was turned into a name in the template, and reported as `label_literal`.
  Quotation marks on one line are now left alone by both.
- `Image 1.5` and `KeyImage 1` matched the label `Image 1`. Labels now need a boundary on both sides.
- Opening positions were normalized after the header was computed. They are normalized first.
- A scene without `videoDirection` returned no template and refused `prompt`. It now behaves like every other
  plan rendered in one request. A silent picture reports `silent_direction_missing` when the sentence is left out.
- Each literal label is reported once, with the name to write instead.
- The host check for `prompt` was unreachable (`video_plan` refuses a host selection earlier) and is removed,
  together with the doc claim.
- An adapter's own rule for its prompt surfaced as a raw schema error. On an authored prompt it is one coded
  line: its own code when the message has one, else `prompt_refused` (Seedance asks that a submitted reference
  video is bound as `Video 1`). An empty or oversized prompt is a one-line coded error as well.
- The docs no longer claim what the GenAI gateway's scene mode does; that lane is not deployed.

## Evidence

- Round trip: every plan made by `server/test/video-routing.test.mjs` and `server/test/scene-video.test.mjs`
  (141 plans, 12 tools) was planned again from its `promptTemplate`: identical provider prompt, no issues.
  Each was also planned with a bare sentence, the same sentence inside white space and a prompt of every offered
  name: exact text out, or `prompt_refused` on the two Seedance plans that carry a reference video. The nine
  per-shot plans carry no template and refuse `prompt` with `scene_prompt_unsupported`.
- One authored plan per tool was saved and approved: the approval shows the submitted prompt.
- `cd server && HOME=$(mktemp -d) npm test`: 1364 pass, 0 fail.
- Built server `tools/list`: 152 tools, no boolean exclusive bound, the four named tools present.

## Files touched in iteration 2

`server/src/scene-prompt.ts`, `server/src/video-routing.ts`, `server/src/tools.ts`, `server/dist/*`,
`server/test/scene-prompt.test.mjs`, `server/test/video-routing.test.mjs`, `server/test/storyboard.test.mjs`,
`CLAUDE.md`, `README.md`, `skills/generate-cut-videos/SKILL.md`, `skills/produce/SKILL.md`,
`skills/produce/references/voice-continuity.md`, `skills/produce/references/shot-speech.md`,
`skills/storyboard/references/film-techniques.js`.
