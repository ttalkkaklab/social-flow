# Generated video — engines, prompt grammar, per-slot recipes

For character speech, [voice-continuity.md](voice-continuity.md) supplements the
recipes below. Use managed `video_plan` with the complete cast handoff. Its compiled
voice mapping supplements the stored prompt without changing the selected model.
Native imitation is separate from exact supplied-WAV synchronization.

Read this **before the first generated-video call of an episode**. An episode whose
scenes are all still backgrounds never needs it — produce §3's cover-background recipe
is enough there.

## Contents

- [Video engines, split by job](#video-engines-split-by-job) — the voice → face → sound route across the saved adapters
- [Video prompt grammar](#video-prompt-grammar-it-differs-by-engine) — what each engine's sentence looks like
- [Per-slot recipes](#per-slot-recipes) — b-roll, motion background, quote speaking clip
- [What the clip brought back](#what-the-clip-brought-back) — burned text, an unasked soundtrack, an invented line: the check every returned clip passes

Everything the storyboard already settled (the stored clip prompt, `visual.camera`,
`shot.feel`/`size`/`angle`/`space`, `visual.character`, `duration`) stays in produce §3 —
this file starts after the engine has to be chosen.

## Video engines, split by job

The saved video model is the route; under Grok the CLI's own `image_to_video` takes every
clip (`engine:"host"`, [video-model-selection.md](video-model-selection.md)
§The host video tool comes first), so this section applies where `PRODUCTION.videoProvider`
is `"api"` or `"astra"`. The decision table's source of truth is
[video-model-selection.md](video-model-selection.md), and the order is
**voice → face → sound**. Since the route follows from facts the storyboard already
wrote (who speaks on screen, who is in the source, whether the slot uses its sound), **the
storyboard records the planned route** — `visual.engine`, or the saved model — and writes
the stored prompt in that route's grammar. This section is how you **validate** the route
against those facts, not re-decide it. A route that fails validation (a spoken cut on an
adapter with no voice lane, a real face on a Seedance 2.x model) is a storyboard defect: send
it back. Veo, Gemini Omni and Seedance 1.x left the plugin on 2026-10-31 because none takes a
voice reference; their existing clips stay reusable through `visual.reuse`.

**① Does a character speak** — the voice lane rules adapters out first.

- **A spoken cut** — an `on_screen` line, or a native slot (`visual.clip` or a b-roll) where
  the model would voice lines with its audio on — needs a voice lane: a reference adapter
  (`astra_genai_msr`, `seedance_reference`, `fasth3_omni_reference` — a pinned per-character
  voice sample sets the speaker's timbre) or an audio2video adapter (`astra_audio2video`,
  `astra_genai_audio2video`, `astra_genai_desktop_audio2video` — the pinned TTS track drives
  the clip). `video_plan` refuses any other adapter with `voice_lane_required`. MSR's sample
  is optional: without one the prompt voices the speaker and the plan warns.
- **A non-speaking cut** — narration or voiceover over a picture nobody speaks in — runs on
  any adapter, image-to-video included.

**② Who's in the shot.**

- **A photoreal real-person face**: Dreamina Seedance 2.x **rejects it at task creation**
  (`InputImageSensitiveContentDetected.PrivacyInformation` — a rejection isn't billed, so
  probing the boundary is free). A photoreal real-person source goes to an LTX lane
  (ASTRA GenAI or ASTRA).
- **A shot with no visible face** (from behind, a silhouette, just hands and a screen):
  every model takes it, including `dreamina-seedance-2-0-260128`, the public arena's #1 for
  image→video.
- **A mouthless character** (the ttalkkak-lab mouse-head type): **Seedance 2.0 never made a
  mouth across a 15-second 1080p clip** (measured 2026-08-15 — even the emotional-acting
  shots kept the mouse head with its two slanted eyes). On any other engine, inspect the
  returned frames for an invented mouth.

**③ Does that stretch use its sound**

- **A b-roll slot runs on the saved video model with its audio on** — by absolute rule 9 that
  stretch uses the sound the clip came with; a saved model that makes no sound is reported for
  an explicit exception, not swapped. A b-roll whose characters speak is a spoken cut (①).
- For authored effects, [model-aware effects](video-sound.md) overrides the silent defaults below. Preserve the source soundtrack only when selected; pinned external speech uses post effects.
- **A motion background without source-audio intent (`visual.video`)** — the builder lays
  down the video track only and **throws the clip's sound away**, so it is generated with
  `generateAudio: false`. On Seedance that is `seedance_reference` (an optional previz as
  `referenceVideoPaths`, the still as `Image 1`, `requiredSeconds` = the length that scene
  actually uses, clamped to the model floor · the 2.x grade and resolution on the individual
  cut) (storyboard blender-previz.md §6, previz optional), or `seedance_img2video` with a
  `frame_and_prompt` previz and no reference arrays.
  Different cuts may use different models and resolutions.
  For complex-motion, reference, or fixed-voice cuts, apply video-model-selection §Seedance
  per-cut selection and use the resolved forecast generation arguments; never reset an
  escalated model to the ordinary-hook default.
  Don't pass an aspect-ratio argument — the default `adaptive` follows the 1088×1920 source
  as-is, and while spelling out `9:16` gives the same result, any other value crops the
  source from the center.

Two lines that hold whichever engine you pick belong here too.

- **To reproduce a composition, use the first and last frames, not a reference image.**
  A reference carries appearance or art style, not composition.
  Shots that have to follow the drawing — something appearing, disappearing, changing
  pose — belong in `sourceImagePath` + `lastImagePath`, and the two PNGs are made on the
  same background with only the subject different.
- **An art style travels on `seedance_reference`.** To hand a sketch or a toon scene frame
  over as a style, use that tool.

Without `ARK_API_KEY` the Seedance calls fail. The cut waits for the key or moves to the host
lane (`videoProvider:"host"`) under an explicit provider choice — never a silent engine
switch. A held cut goes in `build-report.txt` with the reason.

**④ The astra lane — our own box, when nobody is waiting.** `engine:"astra"`
([video-model-selection.md](video-model-selection.md) §ASTRA) sends the cut to our LTX-2.5
server instead of a vendor. It is opt-in per shot and never a default: a call costs no money
and 66–184s of wall clock, renders one job at a time behind a 20-job queue, and the frame
ceiling is 361 on every mode (the server's `/v1/models` limit; above 121 only some modes and sizes are measured — see the tool's numFrames description). Use it where the episode can wait; stay on
the saved API model whenever the clip is needed now. Its voice lane is `supplied` on
`astra_audio2video` and `none` on every other astra tool (①).
Which tool a cut calls is in [full-video.md](full-video.md) §Asset generation step 4.

**Every astra clip comes back with a generated AAC track unless the call passes `generateAudio: false`**,
which strips it after generation (same render time). Pass it when the board's `generateAudio:false`
says the episode lays its own narration; otherwise drop or duck the returned track in the edit.

## Video prompt grammar — it differs by engine

Once the engine is picked, this is how to write the sentences. The basis is the vendor docs
summarised in video-model-selection §Prompt grammar. **The source of truth for the camera
items is `references/video-model-selection.md` §Camera**; only the summary is here.

- **Exclusions don't go in the prompt body as "no ~"** — write "no ~" and the model draws
  that noun instead (local images, measured: 0 for 4). Rewrite the scene description until the
  thing you want gone simply isn't in it, and close the prompt with a **positive-locks**
  paragraph — what holds in every frame, said positively, each reference given its scope
  (§positive locks). A phrase that only refuses a category ("not a game", "no CGI") gives the
  model no picture to draw and survives every reroll.
- **There's no rule about slot order** — the Seedance skeleton marks even the camera slot
  `非必须` (optional). Just worry about filling the slots you need.
- **Write camera vocabulary in the pipeline's words** — `arc shot`, not `orbit`, and
  `dolly in`, not `push in` (video-model-selection §Camera). `zoom in` narrows the angle of
  view without moving the camera, so don't use it for a shot that moves closer.
- **The move comes from the shot's declared feel, and it supports the feel rather than
  carrying it** — the storyboard picked it from the feel → technique table
  (`../../storyboard/references/directing-grammar.md` §4–§5), so don't swap it here for one that
  "feels more cinematic". The empirical work never showed that moving closer changes what a
  viewer feels on its own (p=.84); what a move raised was immersion, at an opening or a
  transition. Tone is set by the background, the art direction, the size and the angle.
  **Angles have empirical support** — eye level is the default camera height for hook shots
  and speaking clips, and the `framing` slot carries the storyboard's size and angle into
  the call.
- **Seedance cameras read better written as a span** — `opening composition + move + closing
  composition`. The vendor doesn't require the form (the camera field itself is `非必须`,
  optional) — it's **the form we use on motion-background shots that have to reproduce a
  composition**. The prompt body takes only Chinese and English, so write the instructions
  in English — Korean outside a dialogue quote is ignored rather than refused, which is why
  the server rejects it before the call (`dreamina-seedance-2-5` is the one model that reads
  it). **And a seedance prompt closes on a consistency lock** — "the subject stays exactly
  consistent with the input frame; appearance, proportions and materials hold" — because that
  is where an exclusion goes on Seedance.
  One move per shot. A storyboard that still carries a second move keeps the first only;
  write the drop in `build-report.txt`.
- **Don't put seconds in a Seedance prompt** — the scene's `duration` sets the length and the
  edit does the cutting. The vendor notice covers 2.0 (2.5 responds to whole seconds); the
  rule rests on our pipeline.
- **Dialogue follows the adapter's prompt layout** — MSR's `Audio N (Image M): "…"` lines,
  which `video_plan` writes, or Seedance's speaker-to-`Audio N` mapping
  ([voice-continuity.md](voice-continuity.md)). The user requires a caption-free picture. For supplied-audio conditioning, describe speech timing and visible mouth action without repeating the dialogue in the visual prompt. Prohibit subtitles, captions and text overlays in each video request.
- **One clip is one moment** — chaining A-then-B-then-C into one short prompt comes back
  muddled, with extra cuts or dropped plot (video-model-selection §Prompt grammar). The
  storyboard already cut the scene to one beat (scenes-schema §clip prompt); don't merge
  scenes at call time to save calls.

## Per-slot recipes

The cover still is made in produce §1.5 (still-generation.md) when the episode has a
generated cover. These three are generated only when the episode has that kind of slot.

- **b-roll (the `broll` scenes in scenes.js — the selected ratio band and the explicit budget are the ceiling, produce rule 12; a channel's `generated_video_max` is a ceiling only)**: animate each slot's
  `visual.src` PNG through `video_plan` → `video_execute` on the saved video model with its
  audio on and `requiredSeconds` from the planner. A b-roll whose characters speak takes a
  voice-lane adapter (①). This slot is where the clip's sound gets used (absolute rule 9),
  so if the b-roll **audio** is the problem, report it and ask for an explicit exception before remaking on another model.
  Absolute rules 8·10 — the source has to be **an image you already made**, and **the cover
  itself is code-rendered**.
  **Make exactly what the storyboard has** — skip a planned slot and an approved scene
  quietly disappears; add a slot that isn't there and you've broken the contract and wasted
  money.

  Existing 720p clips follow the `visual.reuse` source contract, Veo, Gemini Omni and
  Seedance 1.x clips included; never regenerate one solely to migrate. New clips follow the
  selected model resolution.

  - **Ask for the used length** — `requiredSeconds` = that scene's `duration`, at the saved
    resolution; a saved 720p is not upscaled by hand, the final canvas scales it (CLAUDE.md 2026-09-12).
    The model floor can make the clip longer than the scene; trim the head of the original
    right before the splice in §6. Keep the original
    (**`.work/broll/broll-a<after>.mp4`**) — it's the reference point for a retrim.
    There's one reason `after` is in the filename — two slots with the same name overwrite
    each other.
  Send the scene's stored `visual.prompt` verbatim; its exclusions are already positive
  description in the body. On an older scenes.js with
  no stored prompt, assemble from the `visual.camera` four slots (above), keep it **motion
  only, in English**, and add the audio instruction at the end — `dolly in`, not `push in`
  (the vocabulary rule above). For example:
  `Audio: quiet studio room tone with a faint fabric rustle, no music, no speech.`
  Re-describe the person, background, or lighting already visible in the image and the model
  redesigns the scene.
  - **Make the two slots from their own sources** — run the same PNG twice with only the
    motion changed and the same scene shows up twice, leaving the video circling in place.
    The second slot's source is the background of the scene it attaches to, and that image
    has to be a gpt_image high (or host-tool) still with something for the clip to move
    (absolute rules 11·12 — a person only when the shot needs one).
  - **Don't use a palindrome loop** — forward plus reverse plays the sound backwards
    (absolute rule 9 makes this stretch use the video's audio).
  - This stretch doesn't go in the manifest; it gets **spliced in after the build** (end of
    §6). The builder's contract is one audio per card, so wedging in speechless audio breaks
    the speech-rate and sentence-boundary math.
- **Motion background (scenes.js's `visual.video` — inside the combined generated-video
  ceiling)**: animate that scene's `visual.bg` PNG and save it as
  **`.work/motion/motion-i<scene index>.mp4`**.
  **The saved video model makes it with its audio off** (`generateAudio: false` · `requiredSeconds`
  = the length that scene uses · the saved grade and resolution in `PRODUCTION.videoModel`; on
  `seedance_reference` an optional previz clip rides as the reference, on image-to-video, a host
  tool or ASTRA the previz is `frame_and_prompt` advice). Without the saved model's key the cut waits
  for it; it does not move to another engine without an explicit exception. Use `visual.video.prompt` verbatim as the prompt — the
  stored final clip prompt (camera span, subject motion, the consistency lock, the audio
  sentence; on an older file it holds the motion only, and the camera span is assembled from
  the slots). It never re-describes **the layout, facing or lighting** — the PNG already drew
  them — while the subject's identity words may stay, which is the seedance image lane's own
  pattern (§Video prompt grammar). A stored prompt that reaches here without a consistency
  lock, or with Korean outside a dialogue quote, is a storyboard defect: `check-scenes.js`
  reports it before capture and the server refuses the Korean one at the call. The clip's
  sound goes unused in the build (§6's assembly lays down the video track only), so the audio
  instruction is optional. **Make exactly what the storyboard has** — the selected ratio band and
  the budget are the ceiling, b-roll included (a channel's `generated_video_max` is a ceiling only;
  scenes-schema §Channel true-motion policy).
- **quote speaking clip** (when planned): the saved model's reference adapter as the plan
  selects — `astra_genai_msr`, `seedance_reference` or `fasth3_omni_reference` — with the
  speaker's panels in the plan's reference order and the pinned voice sample; an adapter with
  no voice lane is refused (①). Send the stored `visual.clip.prompt` verbatim (assembled at the storyboard with
  `--clip --with-space`, so it already carries the character description, the
  `From the camera: …` sentence, and the camera span). On an older draft prompt, assemble it
  here: the character description + the shot's space sentence (`assemble-bg-prompt.js --from
  scenes.js --shot N --space-only` — nothing when the shot wrote no `space`) + "static camera"
  + "wide chest-up framing … subject appears small in the frame" + a background unified to
  THEME dark. **Those two camera phrases are the default `visual.camera` for a quote clip, not
  a competing instruction** — a scene carrying its own `visual.camera` overrides them.
  Exclusions on this lane are written into the prompt as **positive
  description**: not "no mouth" but "below the eyes, one seamless matte white curve". Run `frame-persona-clip.py <input> .work/broll/<speaker>-palin.mp4` to unify
  the framing and make the palindrome. With several clips, hstack them side by side and
  compare the scale by eye. With no speaking clip, fall back to a static quote card (opaque
  capture).
  ②'s face clauses apply to the avatar too.

## What the clip brought back

A returned clip is checked before it is accepted, not after the build — `check-clip-artifacts.js`
(produce §3) runs one frame a second through OCR for burned text, compares the audio track with
what the plan asked for (`--expect silent | sound | speech`) and, when the local Qwen3-ASR is
installed, listens for a spoken line the prompt never wrote. Findings are warnings fixed within the
existing authorization, recorded with the frame time and the words; the fix is the artifact lock —
"keep it subtitle-free" in a Seedance lock (the vendor's own carve-out, video-model-selection
§positive locks), `no speech, no dialogue` in the `Audio:` sentence — off the same PNG, and a clip that keeps its text
after that is cropped or replaced, never shipped with type on the picture.
