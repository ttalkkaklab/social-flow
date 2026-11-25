# Iteration 2 summary

Score 91, FAIL, P0 = 1 (capability 6: one more stale one-speaker sentence). Report: `verify-2.md`.
Robustness 20/20 and tests 10/10; the only deductions were the stale sentence (functional −6, documentation −3).

## Fix directives and what was done for iteration 3

1. `skills/storyboard/SKILL.md:19` said "split at every speaker change". It now states the model rule: a shot
   keeps every line spoken in its view; cut where the staging, the visible evidence or the model's pinned-voice
   capacity calls for another view.
2. Optional directive, done: `skills/generate-cut-videos/SKILL.md` says that the model's limit is counted after
   the names are filled in and includes white space at the ends of the text.

## Why the sentence survived two sweeps, and what the wider sweep found

The docs are hard-wrapped, and the surviving sentences broke across a line ("every speaker / change", "one /
speaking character"). A line-based search cannot see them. The sweep was repeated on each file read as one
string with white space collapsed, with every phrasing of the old rule I could list, and the dialogue passages of
`skills/generate-cut-videos/SKILL.md` and `README.md` were read in full. Sentences that still stated or implied
one speaker per shot, all changed to the model rule:

- `skills/_shared/astra-genai.md` ("Each shot has one speaking character; split replies").
- `skills/generate-cut-videos/SKILL.md` ("in conventional OTS coverage. For a requested one-take preserve all
  speaker turns on the same card"; "the single MSR speaker's binding").
- `skills/storyboard/references/shot-boundaries.md` (two sentences on "conventional coverage").
- `skills/storyboard/references/directing-grammar.md` ("In conventional dialogue coverage, cut to the next speaker
  … An authored one-take can keep the reply").
- `skills/storyboard/references/evals.md` ("gives each speaking character separate coverage").
- `skills/review-camera/SKILL.md` (worked cases listed "two-person shots with one speaker" as the valid case).
- `README.md` ("the current single-speaker scene builder"): it now says what the code checks, that a TTS-voiced
  shot with several speakers needs each line's own audio and the composer's track
  (`skills/produce/references/check-tts-quality.js`, "Multi-speaker shots need separately attached lines").

One clarification outside the speaker rule: `CLAUDE.md`, `README.md` and `skills/generate-cut-videos/SKILL.md`
said that "a hand-written prompt" which drops the board's camera move is named (`camera_move_missing`). A probe
showed where that check runs: on a prompt saved on the board by hand or by an older version, which a scene without
`videoDirection` submits (`server/src/video-routing.ts`, `cameraDrift`). A free `args.prompt` is refused
(`scene_video_prompt`) and an authored scene `prompt` is not read for camera direction. The three sentences now
say "saved on the board", so they no longer read against "Camera direction is not read from an authored prompt".

One code change, found while writing the sentence on shared names: when a cast id equals a shot id and that shot's
picture travels as a timed frame, the cast member's short name `{id.image}` took the name and pointed at the cast
picture. The short name is no longer offered in that case (`server/src/scene-prompt.ts`, `scenePromptSlots`), so
`{id.image}` is `placeholder_unlabeled` and the cast picture keeps `{id.<role>}`. One assertion was added to the
existing case in `server/test/scene-prompt.test.mjs`, and `server/dist` was rebuilt.

## Left as it is

- A cast id equal to a shot id (P2): the skill now says that only one of two inputs keeps a shared name and that
  the template gives each name.
- A non-string `prompt` (P2) returns the schema error every tool returns for a wrong type.

## Evidence

- `cd server && HOME=$(mktemp -d) npm test`: 1364 pass, 0 fail.
- Wrap-aware search for the old rule's phrasings over `skills/`, `agents/`, `README.md`, `CLAUDE.md`, `AGENTS.md`
  and `server/src`: the remaining hits deny the rule or concern TTS voices.

## Files touched in iteration 3

`CLAUDE.md`, `README.md`, `skills/_shared/astra-genai.md`, `skills/generate-cut-videos/SKILL.md`,
`skills/review-camera/SKILL.md`, `skills/storyboard/SKILL.md`, `skills/storyboard/references/directing-grammar.md`,
`skills/storyboard/references/evals.md`, `skills/storyboard/references/shot-boundaries.md`,
`server/src/scene-prompt.ts`, `server/test/scene-prompt.test.mjs`, `server/dist/*`.
