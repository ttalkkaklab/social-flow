# Generated video — engines, prompt grammar, per-slot recipes

Read this **before the first generated-video call of an episode**. An episode whose
scenes are all still backgrounds never needs it — produce §3's cover-background recipe
is enough there.

## Contents

- [Video engines, split by job](#video-engines-split-by-job) — the face → sound → grid route between `veo_*` and `seedance_*`
- [Video prompt grammar](#video-prompt-grammar-it-differs-by-engine) — what each engine's sentence looks like
- [Per-slot recipes](#per-slot-recipes) — b-roll, motion background, quote speaking clip

Everything the storyboard already settled (the stored clip prompt, `visual.camera`,
`shot.feel`/`size`/`angle`/`space`, `visual.character`, `duration`) stays in produce §3 —
this file starts after the engine has to be chosen.

## Video engines, split by job

There are two (`veo_*` · `seedance_*`) and they're good at
different things. The decision table's source of truth is
[video-model-selection.md](references/video-model-selection.md), and the order is
**face → sound → grid**. Since the route is deterministic from facts the storyboard already
wrote (who is in the source, whether the slot uses its sound, the duration), **the storyboard
records the planned route** — `visual.engine`, or the type default (b-roll → veo, motion
background → seedance, speech clip → veo_reference) — and writes the stored prompt in that
route's grammar. This section is how you **validate** the route against those facts, not
re-decide it. The one live deviation is a missing `ARK_API_KEY` sending a Seedance-routed
motion background to Veo — the stored prompt survives that as written (no timecodes on a
Seedance route, and the positive-locks tail is harmless prose to Veo; the stored `negative`
list moves into the `negativePrompt` argument) — and the deviation goes in `build-report.md`.
A route that fails validation (a real face on a 2.x model, a 13-second Veo scene) is a
storyboard defect: send it back.

**① Who's in the shot** — price and quality come after this. The face rules engines out first.

- **A photoreal adult face**: Veo takes it (`veo_img2video`, measured 2026-08-15 — the face
  held through 4 seconds at 720p). Seedance takes it on 1.5 pro and 1.0 pro only; **2.x
  rejects it at task creation** (`InputImageSensitiveContentDetected.PrivacyInformation` — a
  rejection isn't billed, so probing the boundary is free). `veo_reference` has the same
  policy on paper but we haven't measured it.
- **A face that reads as a minor**: photo or illustration, **the Veo image lane blocks it**
  (Support code 17301594). Seedance 1.x hasn't been checked. Don't hunt for a workaround —
  redraw the shot: take the face out, or make the person an adult.
- **A shot with no visible face** (from behind, a silhouette, just hands and a screen):
  every model takes it. This is where `dreamina-seedance-2-0-260128`, the public arena's #1
  for image→video, opens up.
- **A mouthless character** (the ttalkkak-lab mouse-head type): **the one axis where the two
  engines land in opposite places.** Veo draws in a mouth that wasn't there within 0.2
  seconds (0 for 5 in practice, and not the kind of thing a negative instruction stops),
  while **Seedance 2.0 never made a mouth across a 15-second 1080p clip** (measured
  2026-08-15 — even the emotional-acting shots kept the mouse head with its two slanted
  eyes). When that face is on screen, skip Veo and go to Seedance. Leave the veo ban in
  channel profile §3 as it is, but read it as a ban on Veo rather than on the whole engine
  category.

**② Does that stretch use its sound**

- **A b-roll slot goes to Veo** — by absolute rule 9 that stretch uses the sound the clip
  came with. Veo's native audio is better, and dropping in a silent clip makes those 4
  seconds go quiet.
- **A motion background (`visual.video`) can go to Seedance** — the builder lays down the
  video track only and **throws the clip's sound away**. There's no reason to pay Veo prices
  for sound you'll discard, and Veo only makes 1080p at 8 seconds while Seedance makes
  exactly the seconds you ask for and charges for exactly that.
  `seedance_img2video` (`resolution: "1080p"` · `durationSeconds` = the length that scene
  actually uses · model `seedance-1-5-pro-251215` · `generateAudio: false`).
  Don't pass an aspect-ratio argument — the default `adaptive` follows the 1088×1920 source
  as-is, and while spelling out `9:16` gives the same result, any other value crops the
  source from the center.

**③ Do the length and resolution fit Veo's grid** — Veo makes 4, 6, or 8 seconds only, 1080p
and 4K are 8-second-only, and its audio can't be turned off. Need a length or ratio outside
that grid and it's Seedance.

Two lines that hold whichever engine you pick belong here too.

- **To reproduce a composition, use the first and last frames, not a reference image.**
  A reference carries appearance (Veo `asset`) or art style (Seedance), not composition.
  Shots that have to follow the drawing — something appearing, disappearing, changing
  pose — belong in `sourceImagePath` + `lastImagePath`, and the two PNGs are made on the
  same background with only the subject different.
- **Only Seedance transplants an art style.** Veo 3.1 has no `referenceType: "style"` at all
  (the official docs point you at the experimental 2.0 model, which can't even produce
  audio). To hand a sketch or a toon scene frame over as a style, use `seedance_reference`.

Without `ARK_API_KEY` the Seedance calls fail. Then make it with Veo as before, keeping ①'s
face clauses intact — the two engines don't block each other.

## Video prompt grammar — it differs by engine

Once the engine is picked, this is how to
write the sentences. The basis is the two vendors' official docs, written up in
[the prompt grammar research](../../docs/research/2026-08-15-veo-seedance-prompting/index.html)
and [the camera technique research](../../docs/research/2026-08-15-ai-video-camera-technique/index.html).
**The source of truth for the camera items is `references/video-model-selection.md` §Camera**;
only the summary is here.

- **Exclusions don't go in the prompt body** — Veo takes them in the `negativePrompt`
  argument, and the grammar is a comma-separated list of noun and adjective phrases
  (`text, subtitles, black bars`). Write "no ~" in the body and the model draws that noun
  instead (local images, measured: 0 for 4, and Veo's own prompt guide marks the form not
  recommended). Seedance has no such argument, so rewrite the scene description until the
  thing you want gone simply isn't in it, and close the prompt with a **positive-locks**
  paragraph — what holds in every frame, said positively, each reference given its scope
  (§positive locks). A phrase that only refuses a category ("not a game", "no CGI") gives the
  model no picture to draw and survives every reroll.
- **There's no rule about slot order** — the five-part formula that puts the camera in the
  first word appears in exactly one Google Cloud blog post; three reference documents specify
  no word order, and the Gemini API marks the camera `[Optional]`. Just worry about filling
  the slots you need.
- **Write camera vocabulary in the words that vendor uses** — on a Veo call it's `arc shot`,
  not `orbit`, and `dolly in`, not `push in` (`orbit` and `push` appear 0 times across the
  full source documents). `zoom in` narrows the angle of view without moving the camera, so
  don't use it for a shot that moves closer.
- **The move comes from the shot's declared feel, and it supports the feel rather than
  carrying it** — the storyboard picked it from the feel → technique table
  (`../storyboard/references/directing-grammar.md` §4–§5), so don't swap it here for one that
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
  in English. One move per shot is the storyboard's default; a second move only on the default
  model 1.5 Pro and only when the storyboard wrote the reason beside it (the one-move-per-shot
  advice is 2.0-only — the reason is our contract, scenes-schema §camera). The storyboard
  doesn't know the engine, so this is where that condition is enforced: when §3 routes a
  two-move shot off 1.5 Pro (Veo, Seedance 2.x), keep the first move only and write the drop
  in `build-report.md`.
- **Don't put seconds in a Seedance prompt** — the scene's `duration` sets the length and the
  edit does the cutting. The vendor notice covers 2.0 (2.5 responds to whole seconds) and
  nothing is confirmed for the default model 1.5 Pro — this rule rests on our pipeline, not
  on vendor documentation. **Veo is the opposite** — the 3.1 blog presents `[00:00-00:02]`-style
  span splitting as a workflow (blog grade — the reference docs never took it up, checked
  2026-08-25).
- **Dialogue on a Veo call is `speaker says: line` — colon, no quotation marks.** Quotes make
  the model burn the line into the frame as on-screen text (Best practices, 2026-08-24); our
  overlays already carry the subtitles, so a burned-in line is a double. Seedance keeps its
  quotes.
- **One clip is one moment** — chaining A-then-B-then-C into one short prompt is the vendor's
  own named failure ("muddled or incomplete"). The storyboard already cut the scene to one
  beat (scenes-schema §clip prompt); don't merge scenes at call time to save calls.

## Per-slot recipes

The cover background is in produce §3 (it is generated on every episode). These three
are generated only when the episode has that kind of slot.

- **b-roll (the `broll` scenes in scenes.js — max 2 slots per episode)**: animate each slot's
  `visual.src` PNG with `veo_img2video` (`aspectRatio: "9:16"` · `resolution: "1080p"` ·
  `durationSeconds: 8` · **`veo-3.1-lite-generate-preview`**). The case for lite: in the blind
  arena the Elo gap across Veo's three tiers is under 20 with overlapping confidence intervals
  (video-model-selection §Quality) — for the same image, fast costs $0.96 per 8 seconds and
  lite $0.64. **One caveat**: the arena scored video and sound together, so audio quality was
  never measured on its own. This slot is where the clip's sound gets used (absolute rule 9),
  so if a review flags the b-roll **audio** as a P0, remake that episode's clip on fast.
  Absolute rules 8·10 — the source has to be **an image you already made**, and **the cover
  itself is code-rendered** (Veo can't write Hangul).
  **Make exactly what the storyboard has** — skip a planned slot and an approved scene
  quietly disappears; add a slot that isn't there and you've broken the contract and wasted
  money.
  - **Generate 8 seconds, use what you need** — on Veo the API only allows 8 seconds at 1080p.
    The body is 1080×1920, so don't generate at 720p and upscale (user decision 2026-08-11 — if
    you need an upscale, just use 1080p). The length actually used is the storyboard broll
    scene's `duration`, and you trim the head of the original right before the splice in §6.
    **On Seedance ask for the used length directly** (`durationSeconds` = that scene's
    `duration`) — it makes only those seconds, so there is nothing to trim and nothing to pay
    for twice. Keep the 8-second original
    (**`.work/broll/broll-a<after>.mp4`**) — it's the reference point for a retrim.
    There's one reason `after` is in the filename — two slots with the same name overwrite
    each other.
  Send the scene's stored `visual.prompt` verbatim, with the stored `visual.negative` noun
  list in the `negativePrompt` argument (this slot is a Veo call). On an older scenes.js with
  no stored prompt, assemble from the `visual.camera` four slots (above), keep it **motion
  only, in English**, and add the audio instruction at the end — `dolly in`, not `push in`
  (the vocabulary rule above). For example:
  `Audio: quiet studio room tone with a faint fabric rustle, no music, no speech.`
  Re-describe the person, background, or lighting already visible in the image and the model
  redesigns the scene.
  - **Make the two slots from their own sources** — run the same PNG twice with only the
    motion changed and the same scene shows up twice, leaving the video circling in place.
    The second slot's source is the background of the scene it attaches to, and that image
    has to be a photoreal person made with gpt_image high (absolute rules 11·12).
  - **Don't use a palindrome loop** — forward plus reverse plays the sound backwards
    (absolute rule 9 makes this stretch use the video's audio).
  - This stretch doesn't go in the manifest; it gets **spliced in after the build** (end of
    §6). The builder's contract is one audio per card, so wedging in speechless audio breaks
    the speech-rate and sentence-boundary math.
- **Motion background (scenes.js's `visual.video` — inside the combined generated-video
  ceiling)**: animate that scene's `visual.bg` PNG and save it as
  **`.work/motion/motion-i<scene index>.mp4`**.
  **This is Seedance's slot** (the video engine split above) — `seedance_img2video`
  (`resolution: "1080p"` · `durationSeconds` = the length that scene uses ·
  `seedance-1-5-pro-251215` · `generateAudio: false`). Without `ARK_API_KEY`, make it with
  `veo_img2video` (`aspectRatio: "9:16"` · `resolution: "1080p"` · `durationSeconds: 8` ·
  `veo-3.1-lite-generate-preview`). Use `visual.video.prompt` verbatim as the prompt — the
  stored final clip prompt (camera span, subject motion, locks, the audio sentence; on an
  older file it holds the motion only, and the camera span is assembled from the slots). It
  never re-describes the scene — the PNG already drew it. The clip's
  sound goes unused in the build (§6's assembly lays down the video track only), so the audio
  instruction is optional. The plan gate (absolute rule 13) comes back in the same delegation
  as the b-roll. **Make exactly what the storyboard has** — 2 combined with the b-roll is the
  ceiling (scenes-schema §Motion background is the source of truth).
- **quote speaking clip** (when planned): `veo_reference` (the speaker's panel set — `face.png`
  then `body.png`, 3 images max; 9:16, 720p,
  `veo-3.1-fast-generate-preview` — lite doesn't support reference images, so fast is the
  lowest tier. The standard tier ties with fast in the arena, so there's no reason to pay 4×) —
  send the stored `visual.clip.prompt` verbatim (assembled at the storyboard with
  `--clip --with-space`, so it already carries the character description, the
  `From the camera: …` sentence, and the camera span). On an older draft prompt, assemble it
  here: the character description + the shot's space sentence (`assemble-bg-prompt.js --from
  scenes.js --shot N --space-only` — nothing when the shot wrote no `space`) + "static camera"
  + "wide chest-up framing … subject appears small in the frame" + a background unified to
  THEME dark. **Those two camera phrases are the default `visual.camera` for a quote clip, not
  a competing instruction** — a scene carrying its own `visual.camera` overrides them.
  **The reference lane rejects `negativePrompt`** (400 "Negative prompt is not supported in
  your use case", measured 2026-08-15 — the same argument works on `veo_text2video` and
  `veo_img2video`), so exclusions on this lane are written into the prompt as **positive
  description**: not "no mouth" but "below the eyes, one seamless matte white curve". Run `frame-persona-clip.py <input> .work/broll/<speaker>-palin.mp4` to unify
  the framing and make the palindrome. With several clips, hstack them side by side and
  compare the scale by eye. With no speaking clip, fall back to a static quote card (opaque
  capture).
  ①'s face clauses apply to the avatar too — with a mouthless character, don't call Veo; go
  to the static quote card. A reference carries appearance only, so **when the avatar's
  composition has to be preserved exactly, it's `veo_img2video` first/last frames, not a
  reference**.
