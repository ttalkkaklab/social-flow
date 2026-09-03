# Footage lane — one generated clip per sentence, wordless marks drawn over it

The procedure for `visual.slide.treatment:"footage"`. The contract is scenes-schema §footage
treatment, the look and the rubric are slide-design.md §6.2, the machine checks are
`check-scenes.js` and `check-slide.js`, and the renderer is `render-motion-slide.mjs`. This
file says what each numbered storyboard step does differently when a scene is a footage slide,
and what it costs.

Where it comes from: a reference history short measured on 2026-09-02 (114 s · 56 shots ·
median cut 1.8 s · marks on 42 of 57 sampled frames · zero labels · one subtitle line · marks
composited after generation with the ground marks behind the figures and the arrows on top),
set against our own 65 s episode (6 shots · 44% of the runtime on HTML plates · 9% of frames
with visible motion · four visual worlds in one minute). The gap was not the generation cap.
It was one visual per scene, explanation on plates instead of on the picture, and a
subtitle spec built for plates.

## Contents

- [1. When a scene is a footage slide](#1-when-a-scene-is-a-footage-slide)
- [2. Writing the scene (§4)](#2-writing-the-scene-4)
- [3. Generating the clips (§5)](#3-generating-the-clips-5)
- [4. Authoring the marks (§5.6)](#4-authoring-the-marks-56)
- [5. Build (produce)](#5-build-produce)
- [6. Traps](#6-traps)

## 1. When a scene is a footage slide

- The channel motion policy allows `ai-video`, and the beat shows **something happening** —
  people moving, a place, an action, a confrontation, a journey. On a history or story
  channel that is most drip beats. **It is the default ground for every spoken beat** since
  2026-09-03 (owner directive — "the viewer has to feel a video: image changes, animation,
  camera moves"): the plugin's static-ground limit (scenes-schema §Channel true-motion policy,
  `maxStaticGroundSeconds` 4) lets no picture hold the screen longer than one sentence, and
  a footage slide clears it by construction because every group opens a new clip.
- A statistic, a timeline or a mechanism goes on footage too, with the value as a `label` and
  the mark on what it counts; the editorial plate is for the one-sentence verdict or a figure
  that has to stand alone (`htmlPlateMax` 2 per episode). Not for a document or object
  changing inside a photograph (`photo-action`), a talking head (a `quote` clip), or the cover
  (§cover — its moving form is a motion background). One episode mixes them: footage for the
  events and the numbers, at most two plates for the verdicts.
- **A storyboard lane, not an autoproduce one.** The lane spends per sentence and puts a human
  at two places autoproduce has none — the cost gate (§3) and the marks read against the real
  clip (§4). autoproduce never plans a footage slide; a `scenes.js` handed to it that already
  carries one puts one `seedance.1-5-pro-silent.1080p` row per shot on
  `.work/cost-estimate.tsv` before its cap verdict, or the run stops there.

## 2. Writing the scene (§4)

- **One sentence, one shot.** A narration segment of 8–25 characters runs 2–5 s; that is the
  cut. A sentence that turns takes an `A|B` sub-reveal and two shots. Nothing is longer than
  a sentence; nothing is shorter than a phrase the viewer can read.
- **Per shot**, in `slide.shots[]`: the four `camera` slots (`very slow` or `static` on a
  marked shot — a mark is fixed in screen space), a `mark` phrase (or `"none"`), `duration` =
  ceil(characters / 4.5) + 1 with a floor of 4 on Seedance, `action`, `audio`, and the prompt
  assembled with `assemble-bg-prompt.js --clip --engine seedance` once the still exists.
- `slide.plan` has one entry per group — the clip and the mark. `labels` is `[]` unless a
  sentence states a number or a name the picture cannot show. `visual.action` names what the
  subjects do across the clips, not what the marks draw.
- **Character consistency.** A channel cast member goes through `visual.character` and the
  reference-panel call as on any still. A one-off protagonist has no panels: make **one
  reference still** for that person at §5 (`gpt_image_text2img` high, described once —
  face, build, dress, palette) and pass it as the `gpt_image_img2img` input for every shot's
  still. The clips inherit the face from the still. Write the reference still's path in the
  scene comment so a regeneration uses the same one.
- **Colour follows place.** The reference short keeps its mountain cuts cool grey and its
  plain cuts warm dust, and the viewer reads the geography from that alone. Name the palette
  per place in the still prompts (directing-grammar §3.5) and keep it across the shots of
  that place.
- Camera review (§4.8) reads every `shots[]` entry as a generated shot — feel served, four
  slots, a cut length that matches the sentence.

## 3. Generating the clips (§5)

Footage clips are paid calls made before approval, so three things sit in front of them:

1. **The narration loop has passed** (§4.4 at 95, P0 = 0). A sentence rewritten after the clips
   exist orphans a clip.
2. **One plan-mode delegation for every paid shot.** Hand content-reviewer plan mode the
   cover, every b-roll and motion-background scene, and **every footage shot** in one call
   (the still prompt, the clip prompt, the four camera slots, the mark) and generate nothing
   before `PLAN_REVIEW: PASS`. Twenty shots are one delegation, not twenty.
3. **The cost gate, inside the budget.** Run `cost-preview.js <storyboard dir>`. It reads the
   channel's `video_budget_usd` (plugin default $10 — every generated clip of the episode,
   billed and projected together; stills, TTS and music are outside it) and answers `!!` with
   exit 1 when the board is over it. **Fit first, then ask** — the user is shown a number that
   fits, never one to trim on the spot. The fitting ladder, cheapest loss first:
   1. **Durations from the measured windows.** Once the narration wav exists, `duration` is
      `ceil(window + 0.5)` with the Seedance floor of 4, where the window is the sentence's
      measured length plus its gap (the last sentence + 0.45 s POST) — not the
      `ceil(chars / 4.5) + 1` estimate the board was written with. The renderer does not
      time-stretch: a clip shorter than its window freezes on the last frame, so the window is
      a hard floor and anything above it is money for nothing.
   2. **Reprise before regenerate.** A beat that returns to a place already shown reuses that
      shot's clip (`reuse` — the field check-scenes and cost-preview read), the way a cut back
      to the same wall reads in a documentary; a `reuse` shot is a copied file, so
      `cost-preview.js` drops it from the forecast and the fingerprint.
   3. **Drop the B of an `A|B` sub-reveal** whose sentence reads on one picture.
   4. **Resolution stays 1080p** and the shot count stays one per sentence — the budget is
      spent on the picture quality the viewer sees, not saved by holding a picture longer.
   `footage/seedance` ≈ $0.06 a second silent — a 5 s shot is $0.29, thirty shots about $9,
   so a 40-sentence episode sits near the default budget with durations from step 1. One yes
   covers the episode's footage shots; a shot added later is asked again, against the headroom
   the preview printed.

Then, per shot, in group order:

- **The still** — `slides/footage/s<n>-g<k>.png` at the format's image size, under the §5 rules
  (photorealistic, the shot's size · angle · space through `assemble-bg-prompt.js`, no text, no
  national symbols, the reference still as img2img input when a person recurs). Log the call.
- **The clip** — `seedance_img2video` from that still, `generateAudio false`, the stored
  prompt, `duration` as written, 1080p at the format canvas → `slides/footage/s<n>-g<k>.mp4`.
  Veo only when the profile routes there (8 s, trimmed by the renderer to the segment). Log
  the call: `seedance.1-5-pro-silent.1080p<TAB><seconds><TAB>storyboard §5: footage s<n>-g<k>`.
- **Regenerate** a clip whose subject walks out of frame, whose hands or faces melt, that
  grows text or a banner with letters, or that moves the camera faster than the slot said.
  One regeneration is normal; a third attempt goes to the user with the frames.
- **The matte** (optional) — for a shot whose mark has to sit under the people (hatching over
  the ground they stand on), `produce/references/make-matte.py <clip> slides/footage/s<n>-g<k>-fg.webm`.
  It needs `rembg` (the script says how to install it) and a few minutes of CPU per shot. A
  shot whose mark is an arrow, an X or a ring beside the subject needs no matte.

## 4. Authoring the marks (§5.6)

- `references/footage-frames.sh <storyboard dir> s<n>` writes first, mid and last frames of
  every clip and a per-shot sheet of the mid frames. **Coordinates come from the mid frame**,
  in canvas pixels (1080×1920 portrait · 1920×1080 wide); a mark placed on the still is off by
  however far the generation moved the subject.
- Copy `motion-slide-template.html` to the slide file, set `SLIDE_SHOT`, and rewrite
  `renderSlide()`:

  ```js
  function renderSlide(S, h) {
    const sh = S.visual.slide.shots;
    let out = "";
    out += h.footage(1, sh[0].clip);
    out += h.mark.route(1, [[180, 1500], [420, 1180], [560, 900], [760, 620]], { dash: true });
    out += h.footage(2, sh[1].clip);
    out += h.mark.hatch(2, [[120, 980], [960, 900], [1000, 1300], [80, 1380]], { gap: 40, angle: -6, wave: true });
    out += h.matte(2, sh[1].matte);
    out += h.footage(3, sh[2].clip);
    out += h.mark.x(3, 540, 1180, { size: 90 });
    out += h.mark.ring(3, 760, 700, 130, { k: 2 });
    return out;
  }
  ```

  Every group lays its clip first, then its mark (`route` · `x` · `ring` · `hatch` · `box` ·
  `dot` · `path`), then its matte when the shot has one. `k` orders strokes inside a group
  (`--mark-lead` apart); `lead` delays a whole mark in `--lead` units. No `h.tag`, no
  `h.title`, no `h.foot`: the clip is the ground and the subtitle is the type.
- `node references/check-slide.js <storyboard dir> --require-all` — it wants every clip file
  present, `h.footage` in the render, and `visual.action` on the scene.
- Render the sheet: `render-motion-slide.mjs slides/s<n>-<slug>.html --out .work/slide-check/s<n>
  --sheet --png-only --keep-frames --segs auto`. On a footage slide the renderer plays each
  clip across its segment (a clip longer than the segment is cut, a shorter one freezes on its
  last frame — nothing is time-stretched), waits for each video frame to be presented before
  capturing, reports `zone_fill_pct: null`, and warns when a clip is shorter than its sentence. On a shot split
  with an `A|B` sub-reveal `auto` steps aside (groups outnumber segments) — pass per-group
  `--segs k:ms`, splitting that sentence's measured window at the reveal point, and give the
  two groups the same lengths with `h.footage(rg, clip, { dur })`. Expect about 2
  frames a second — a 4 s group is a minute, a 30-shot episode about half an hour. Check the
  seam yourself once: `frames-r<k>/f0000.png` equals `sheet/g<k-1>-end.png` byte for byte, and
  `f0001.png` is the new shot.
- `slide-reviewer` to ≥ 95 with P0 = 0 inside the episode's five delegations — every authored
  slide in the first, only the failed ones after (slide-authoring.md step 4). Its footage
  P0s are slide-design §6.2 (a still ground, a decorative mark, a mark off its subject or over a
  face, a second colour or a fade, the wrong layer).

## 5. Build (produce)

Nothing new in the manifest — the per-group clips enter as any motion slide's do (produce
§3.6, `--segs` with the measured segment lengths). Set `SUB_MODE=phrase` on the build line:
one line of 3–6 어절 at 92 px on the 63% line, the way the footage wants it. A 2-line 50 px
sentence under a 2-second cut reads as a caption on a photo.

## 6. Traps

- **A clip shorter than its sentence freezes on its last frame.** The renderer says which group
  and by how much; the answer is `duration` + 1 s and a regeneration, not a slower voice.
- **A fast camera under a fixed mark** drags the picture out from under it. `very slow` or
  `static` on marked shots; save the dolly for the unmarked ones.
- **Marks authored on the still** land beside the subject in the clip. Always the mid frame.
- **Do not add a `transition` to a footage scene.** The seam is already identical frames by the
  state rule and the cut lands one frame later; a dissolve on top turns a cut into a slideshow.
- **HEVC and AV1 do not decode** in the renderer's Chrome. Seedance and Veo return H.264; a
  clip converted elsewhere has to come back as H.264 mp4 or VP9 webm.
- **Two paths for the clip's own sound.** The builder discards it on a slide; if a shot's sound
  is the point (a horn, a shout), that shot is a `quote` clip or a b-roll, not a footage group.
