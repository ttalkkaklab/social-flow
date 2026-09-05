# Story quality: evidence, meaning, ending, then an optional CTA

Apply this contract to every model and authoring route, including skip-research channels,
recordings, test episodes and revisions. Read it before candidates or narration. It overrides
older requirements for a closing question, modern parallels, high-arousal emotions or a twist.
Keep existing beat identifiers and production limits: `beat:"cta"` is the closing beat,
not a requirement to ask the viewer for something.

## Contents

- [Design the content before the shots](#design-the-content-before-the-shots)
- [Examples, not reusable scripts](#examples-not-reusable-scripts)
- [Store one contract beside the actual narration](#store-one-contract-beside-the-actual-narration)
- [Gates before generation](#gates-before-generation)

## Design the content before the shots

1. Inspect the evidence before choosing the conclusion. For nonfiction, separate recorded
   action, reported speech, uncertainty and interpretation. Never bend facts to fit a moral.
   A real person's unrecorded thoughts or dialogue are not fictional staging.
2. Write what this audience will understand, reconsider or be able to do in one concrete
   sentence. A topic label, emotion label or "cooperation matters" is insufficient. Name
   the subject, what happened or works, and why this relationship matters here.
3. Choose the evidence, action, demonstration or punchline that delivers that content.
   Design the ending before polishing the opening. A resolution, demonstrated limit or
   completed joke can be an ending; no universal moral or verbatim thesis announcement is needed.
4. Create an opening whose question this ending can answer. Compare three content angles,
   not three adjectives. Pay a useful piece early. Suspense-led shorts defer the whole answer;
   answer-first long-form may show it early and sustain attention with evidence, method or limits.
5. Work backward to the indispensable developments. For each scene, name the new evidence,
   changed expectation, harder choice, consequence or earned release. Ask what becomes
   incomprehensible or unearned if it disappears. Cut repetition and decorative context.
   A reaction or pause can be necessary: explain what the viewer needs time to process.
6. Default to no CTA. If an ask helps, put it after the promise is paid and connect it to
   the actual choice or useful next action. A generic poll or next-episode teaser cannot
   substitute for this episode's answer. Never force every sentence into a cliffhanger.

Keep the seven candidate headings. Under 주제 write the specific content and its evidence
basis, separating interpretation. Use 전개 #1–#3 for necessary developments; modern parallels
are optional and need sources. 마무리 delivers the resolution. CTA contains `없음` and its
reason, or a specific optional ask and its reason. No shots or generation prompts yet.

## Examples, not reusable scripts

- History: "ships joined and helped" only lists events. A concrete angle is the change
  from calling reluctant commanders into battle to helping one whose ship is attacked.
  Verify each action; do not invent forgiveness, private thoughts or a speech about teamwork.
  Do not claim this one action explains the whole victory.
- Explanation: replace "three battery facts" with a specific observed result, its mechanism
  and limits. Only use measurements actually supplied or verified.
- Tutorial: show the useful result, the obstacle, then the step that resolves it. The supported
  answer-first format does not need artificial suspense about whether the result works.
- Fictional comedy: establish a familiar pattern and let the last action break it. The
  reinterpretation is the payoff; a motivational lesson would weaken it.
- Weak close: "Which scene do you remember?" before any answer. Stronger close: show the
  decisive action, make its relation to the opening intelligible, and stop.

These illustrate editorial choices, not newly verified historical assertions.

## Store one contract beside the actual narration

Keep question, answer and takeaway in `window.COMPREHENSION`. Add `window.STORY` to the same
`scenes.js`. References use **1-based SCENES array positions and 1-based narration groups**,
not scene labels. A quote is an exact substring of that group's `tts` or `sub`, long enough
to substantiate the decision. Do not maintain another copy of the script.

```js
window.STORY = {
  version: "story-v1", kind: "evidence", // evidence | fiction
  viewerNeed: "The specific reason this audience cares",
  thesis: "A concrete claim consistent with COMPREHENSION.takeaway",
  basis: "Research file/row references; distinguish fact from interpretation",
  opening: {shot: 1, group: 1, quote: "actual opening words"},
  payoff: {shot: 4, group: 1, quote: "actual answer or decisive action"},
  ending: {shot: 5, group: 1, quote: "actual closing words"},
  endingReason: "How the ending resolves or reinterprets the opening",
  cta: "none", // none | question | action | next
  // Otherwise add ask: {shot, group, quote}, ctaReason: "why the ask belongs"
  beats: [
    {shot: 1, change: "What the viewer now anticipates", necessity: "What removal loses"}
    // Exactly one row for EVERY narrated shot, including the close.
  ]
};
```

This field guide is not a passing fixture. Replace all placeholders and cover every narrated
shot. The checker verifies structure and references, not the truth or quality of the reasoning.

For mixed live-voice recordings, keep `narration: []` to avoid double audio. Supply review-only
`STORY.transcripts: [{shot: 2, source: "footage/s2-demo.mp4", groups:
[{text: "exact recorded words", start: 0, end: 2.4}]}]`, derived from the actual transcript.
The source must equal that shot's `visual.clip`, with `visual.source:"recording"`; times are
ordered seconds within the clip. References use these groups, and beats includes these spoken
shots. The hash includes them. This metadata does not synthesize speech or create subtitles.
Review the actual transcript, never invent it from the desired script. A silent recording
needs no transcript; any meaningful recorded speech must be included. All-live-voice episodes
already carrying approved narration keep the existing `VOICE:"user"` route.

## Gates before generation

1. Before camera work run `node check-story.js storyboard/ --draft`, or the existing
   `check-scenes.js storyboard/ --draft`. Missing story decisions, references, scene purposes
   and a CTA before payoff are hard failures even on a draft.
2. In the existing narration review, read the spoken lines before the declared thesis.
   Extract them with `check-story.js storyboard/ --text`, which merges live transcripts in
   playback order. Use `--map` privately to map sentence numbers back to shot/group references.
   Write the meaning actually understood and the earliest weak line. Then compare with
   STORY and supplied research excerpts with row identifiers. Judge four criteria with
   exact narration quotes and specific reasons: **meaning**, **progression**, **payoff**,
   **grounding**. Does it say something concrete? Does each development earn the next?
   Does the answer pay the opening before any ask? Does the interpretation fit the evidence?
3. Pass all four with no unresolved substantive findings. A score of 95 cannot waive failure.
   Use the existing reviewer and retry budget, not another scoring loop. If delegation is
   unavailable, record an explicit self-review; never pretend another model read it. Grounding
   cannot pass merely because the author says a claim is sourced. Do not repair missing
   spoken content with captions, music or slides. Stop before generation on an unresolved read.

Record the review in `STORY.review` after the read:

```js
{
  hash: "SHA-256 from check-story.js storyboard/ --hash",
  verdict: "pass", unresolved: [],
  meaning: {reason: "What these words communicate", refs: [{shot: 4, group: 1, quote: "…"}]},
  progression: {reason: "How expectations change", refs: [{shot: 2, group: 1, quote: "…"}]},
  payoff: {reason: "How the opening is paid", refs: [{shot: 4, group: 1, quote: "…"}]},
  grounding: {reason: "Research row and limits supporting this claim", refs: [{shot: 4, group: 1, quote: "…"}]}
}
```

Run `node check-story.js storyboard/` after recording the read. Full `check-scenes.js`
also requires this evidence before production. The hash covers narration, subtitles, screen
copy, order, beats, comprehension and story decisions, not review or camera/audio settings.
Vocabulary edits invalidate it: recheck the affected meaning and the whole causal chain,
record the fresh read, then update the hash. Never refresh only the hash to silence a failure.

Existing boards have no silent exemption. Derive their contract from the actual words and
review them. If passing requires rewriting approved narration, use the normal approval path;
unattended episodes stay on hold. Do not modify delivered videos or old artifacts merely to
make plugin tests pass. Report structural checks separately from editorial judgment and
observed audience results: no checker proves entertainment value or predicts completion rates.
