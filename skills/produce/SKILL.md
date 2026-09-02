---
name: produce
description: >
  Builds the video and the per-platform text from an already-approved storyboard. Use when
  the user asks to "영상 만들어", "콘텐츠 제작", "produce the video", "플랫폼별 콘텐츠 만들어", or right after
  a storyboard is approved. Turns the approved scenes.js under
  data/[channel]/episodes/[topic]/storyboard/ into a narrated 9:16 video at
  1080x1920/30fps — generated backgrounds, TTS narration, BGM with ducking, kinetic
  subtitles, brand outro — plus the Threads, Instagram, Facebook and YouTube text under
  the episode's output/, checked on a phone viewport before publishing. Where
  recording/alignment.json exists it cuts the user's own screen recording instead of
  generating scenes. Boundary — storyboard plans and stops for approval, produce starts
  after it, autoproduce runs both unattended.
argument-hint: "<channel> <topic> [platformCSV|auto]"
allowed-tools: ["Bash", "Read", "Write", "Edit", "Glob", "AskUserQuestion", "Agent", "mcp__social-flow__tts_generate", "mcp__social-flow__tts_local_generate", "mcp__social-flow__tts_elevenlabs_generate", "mcp__social-flow__tts_elevenlabs_dialogue", "mcp__social-flow__tts_list_voices", "mcp__social-flow__music_generate", "mcp__social-flow__music_generate_clip", "mcp__social-flow__suno_generate", "mcp__social-flow__suno_generate_sound", "mcp__social-flow__suno_generate_lyrics", "mcp__social-flow__suno_credits", "mcp__social-flow__image_local_generate", "mcp__social-flow__gpt_image_text2img", "mcp__social-flow__veo_img2video", "mcp__social-flow__veo_reference", "mcp__social-flow__seedance_img2video", "mcp__social-flow__seedance_reference", "mcp__social-flow__mlx_image_generate", "mcp__social-flow__mlx_image_edit", "mcp__social-flow__mlx_tts_generate", "mcp__social-flow__mlx_music_generate", "mcp__social-flow__mlx_video_generate", "mcp__social-flow__mlx_3d_generate"]
---

# Per-platform content production — data/[channel]/episodes/[topic]/output/

Turn the approved storyboard (`storyboard/scenes.js`) into a 9:16 narrated video and
per-platform text. **scenes.js is the only data source** — the video screens, the
narration, the subtitles, and the captions all come from it.

```
data/<channel>/episodes/<topic>/
├── storyboard/          # input (has to be in the approved state)
├── .work/               # intermediates (gitignore — cards/ broll/ pcm/ manifest)
└── output/
    ├── video/           # video.mp4 (clean) · video-sub.mp4 (burned-in) · subs.srt · cover.jpg · build-report.txt
    ├── threads/post.md  # 반말 (casual) body + video link on the last line (no attached image)
    ├── instagram/caption.md
    ├── facebook/post.md
    └── youtube/meta.md  # title · description · tags · thumbnail
```

## Absolute rules

1. **No distorting facts** — narration and captions only recompose facts already in
   scenes.js. Don't collapse a range to its upper bound, and don't invent numbers.
2. **No copy-paste crossposting** — "share the facts, never the sentences."
   Redesign the register, the endings, and the information density for each platform
   (the platform-guide playbook).
3. **Plain language** — screen text, narration, subtitles, captions, all of it. It has to
   land heard by ear alone. **The screen doesn't restate what the audio just said**
   (user directive 2026-08-14) — an empty `title` or `bullets` in scenes.js is not a
   defect. The render never fills an empty field on its own and never manufactures a
   caption out of the narration (scenes-schema §Screen text only when needed).
4. **Korean with no AI tells** — apply platform-guide `references/korean-style.md` to every
   visible sentence. `check-style.py` makes the call, and an S1 blocks publishing.
5. **Generated video is for mood shots and character speech only** — no reenactments, no
   real people, no national symbols, no staged news screens. Cards (static text) are
   code-rendered only.
6. **Branding belongs in the outro** — no logo or badge in the body (a brand eating the
   first 3 seconds is a skip signal).
7. **The TTS voice is fixed** — don't change a single character of profile.md §2's
   voiceName and stylePrompt.
8. **Generated video comes from an image** — don't use `veo_text2video`. The order is always
   `gpt_image_text2img` → keep the PNG in `storyboard/images/` → `veo_img2video`.
   The image is the reference point for reproducing a shot: if the video isn't right,
   rerun it off the same PNG with only the motion prompt changed. Video made straight from
   text gives a different scene every time even from the same prompt, so there's nothing
   to go back to. **Never delete `storyboard/images/*.png`** — delete them and that episode
   can't be rebuilt.
9. **Don't lay narration over a stretch where generated video plays** — that stretch uses
   **the sound the clip came with**. Put TTS on top and the two sounds fight, and the
   synthetic voice flattens the generated clip's sense of space. That scene is
   `narration: []` with no subtitles either (§6 has to push the subtitle timecodes back by
   that much). **This rule is about b-roll inserts** — on a motion-background scene
   (scenes-schema §Motion background, `visual.video`) the builder uses only the video
   track, so the clip's sound gets dropped and the narration and subtitles stay as they are.
10. **The cover's (first screen's) text is code-rendered only** — don't use **generated
   video** for the cover. **Veo can't write Hangul** (user confirmed 2026-08-11). The cover
   is a screen made of nothing but the hook title and the hero number, so broken glyphs
   write off the whole episode. Put generated video in the **stretch after the cover** as
   text-free b-roll.
   **A real recorded clip is the exception** (2026-08-15) — the broken-Hangul reason for the
   ban doesn't hold for a screencast. Laying the real result on screen (scrolling the
   finished site, running the tool) as the cover **background** with the title and numbers
   still code-rendered on top is allowed, and the movement in the first frame helps the
   hook (aiming at the 84.8–93.8% skip rates measured in practice — Veo cost 0).
   The clip has to be a user-supplied recording or an ingest artifact; don't use someone
   else's copyrighted screen.
11. **The source image for generated video needs a person in it** — a still life of objects
   gives Veo nothing to move, so the frame wobbles faintly and ends, and those 8 seconds
   look like a freeze frame. With a person in it the model produces **natural movement** —
   hair shifting, a head turning, fabric creasing — and the quality jumps. Make it photoreal.
   - **No real people** — feeding in a celebrity's or public figure's face, or a photo of a
     real person, is banned (likeness rights, reputation). Use only a **generated person**
     made with `gpt_image_text2img`.
   - **Match the person to the viewer's demographic** — the default is a Korean woman
     (user directive 2026-08-11). If channel profile §3 sets a different target, follow that.
   - **Make the source image at `quality: "high"`.** A b-roll source is Veo's input, so a
     blurry source makes a blurry video — save money here and the upgrade spend is wasted.
   - Frame it at **an angle that puts the channel's subject at the center of the screen**.
     On a hair channel the hair is the lead, so a back or 3/4 side angle works better — a
     straight-on face pulls the eye to the face and raises the risk of the person reading as
     someone real.
   - A photoreal person on screen means the video **has to carry the AI-generation
     disclosure** — `containsSyntheticMedia: true` when publishing to YouTube (the publish
     skill's contract).
12. **Don't throw the cover background PNG (the meta image) together** — the cover frame
   becomes `cover.jpg` (the YouTube thumbnail and the first screen of the IG and FB videos)
   as-is. No still lifes or abstract backgrounds unrelated to the topic — the default is one
   of two:
   **a photoreal scene with a person that shows the topic at a glance** (the person contract
   from rule 11, unchanged), or **the topic itself** (the result screen or product screenshot
   the episode is about — for dev and tool channels, where the evidence is a screen rather
   than a person. "Expertise shows in evidence, not in claims", 2026-08-15).
   Either way make it at `quality: "high"`, and if channel profile §3 sets a different art
   style, that wins. The text is still code-rendered (rule 10) — this rule is about the
   background picture.
   **A b-roll source is the same file as the background of the scene it attaches to
   (`after`)** — the photo the previous scene showed as a still starts moving, so one image
   does two jobs. For an opening b-roll (`after: 0`) that file is the cover background. For
   a body b-roll it's that points scene's background, and **that one image gets made with
   `gpt_image_text2img` (high) rather than local Z-Image** — it's veo's input, so a blurry
   source makes a blurry video, and with no person in it the model finds nothing to move
   (rule 11).
   **Generated-video slots follow the approved channel motion policy.** Count b-roll and
   motion-background scenes (`visual.video`) together. The format default is 2 and a profile
   may override it with `generated_video_max`; HTML motion slides never spend one of these
   paid slots. Produce never lowers a profile motion floor to save a call; it stops when the
   approved storyboard cannot meet both the floor and the cap. The contract's source of truth
   is scenes-schema §Channel true-motion policy.
13. **Generation that costs money runs only after the plan clears review** — the cover
   background and the b-roll need a plan in the storyboard first (source prompt, motion,
   used length + why), and only after delegating to content-reviewer **plan mode** and
   getting `PLAN_REVIEW: PASS` do you call `gpt_image_text2img` (high) or `veo_img2video`.
   On FAIL, fix the plan and delegate again — don't burn veo money on a bad source.
14. **The photo is the lead on screen — no slide (PPT) look.** Scene text lives inside the
   top and bottom bands only: points uses the top block (title + **one caption at a time** +
   source), cover uses the bottom block, and the bottom subtitles say what the narration
   says. Don't build boxes, slabs, or full-screen dims across the middle of the frame — the
   background photo showing through is what makes it a video; cover it and it's a slide
   (user's note 2026-08-12, "too PPT-ish"). Gradient scrims are off altogether
   (owner 2026-08-25 — no top/bottom bars; the template's `scrim=` parameter draws nothing).
   Since the photo has become the screen itself, make points backgrounds **photoreal shots
   of the subject** rather than metaphorical still lifes, and change the shot wherever the
   content axis changes (reusing one image leaves 40-odd seconds of body on the same still).
   On a channel whose motion policy forbids stills, the photo is source material rather than
   the finished screen: place it full-frame in `visual.slide.motion:true` and animate the
   subject or evidence named by `visual.action`. A whole-photo zoom or pan is still Ken Burns
   and does not qualify. `check-scenes.js` blocks the build before capture when this contract
   is not met.
15. **Every episode runs the final pace pass — the pass is not optional.** After the build (and
   after any clip splice) `references/speedup.sh` writes the one deliverable set and checks the
   speech rate on its retimed subtitles. The default factor is **1.2x** — build-reel normalizes
   each card's speech, but the recorded pace still reads slow in short form. A channel may set
   another factor in profile.md §2, and either way the shipped result has to stay at or below
   **6.2 spoken characters/s overall and per substantive cue**.
   The outro stays at 1.0x. What goes to `output/` is `reel-fast.mp4` ·
   `reel-sub-fast.mp4` · `subs-fast.srt`, never the pre-pass files.

## Procedure

### 1. Check the inputs

- Confirm `status: approved` in the `storyboard/storyboard.md` frontmatter — otherwise stop
  and point the user at `/social-flow:storyboard` for approval first.
- Load `data/<channel>/profile.md` (voice, theme, platforms, outro).
- **Identify the source**: three paths, decided by `window.FORMAT` and the scenes'
  `visual.source`.

  | Condition | Path |
  |---|---|
  | `recording/alignment.json` present + portrait | **Shooting edit** — `references/screencast-pipeline.md` |
  | filmed scenes (`visual.source==="recording"`) mixed in | **Mixed shooting** — this document as-is + §3.5 |
  | anything else | generated (§2–7) |

  **The shooting-edit path** follows `references/screencast-pipeline.md` §Edit procedure
  instead of §2–7 (overlay capture → edit.json → build-screencast.sh — no TTS, no generated
  backgrounds, no reveals; the voice is the user's own). The artifact names (reel.mp4 ·
  reel-sub.mp4 · subs.srt · cover.jpg · build-report.txt) are the same, so §7.5–10 (the speed
  pass, phone QA, platform text, quality gate) run unchanged — **a shooting edit ships sped up
  too**, and `speedup.sh` reads the xfade join that builder makes on its own. Use
  screencast-pipeline.md's gate table.

  **`alignment.json` + landscape doesn't work.** `build-screencast.sh`'s band constants
  (BAND_MAX_H 900 · BAND_CY 880 · BAND_MIN_Y 460) and its background compositing are
  absolute portrait pixels and can't move to a landscape canvas. If you hit this
  combination, **stop** and tell the user — saving each scene as its own file opens the
  mixed-shooting path. Run it anyway and you shoot all 12 minutes only to die at the final
  canvas check.

  **Mixed shooting** puts filmed and generated scenes on one timeline — the builder is the
  same `build-reel.sh` as a generated episode, and only the filmed scenes go through the
  extra prep in §3.5. Slide scenes (`visual.slide`) and all-live-voice episodes
  (`window.VOICE === "user"`) additionally go through §3.6 — rendering each motion-slide
  group to a clip and taking in the user's recordings (`voice/s<n>.wav`).
- Prepare the working directory: create `.work/{cards,broll,motion,pcm,fonts}` and settle
  the platform list (the CSV argument, or profile §4's publish platforms).
- **Settle the format — write `.work/format.env`. Don't skip it.**

  ```bash
  PG=${CLAUDE_PLUGIN_ROOT}/skills/platform-guide/references
  node $PG/format-resolve.js storyboard/scenes.js --sh > .work/format.env
  # profile.md §2's Playback speed — no line there, 1.2. Written once here because both
  # build-reel.sh and speedup.sh source this file, so the build's caps and the shipped
  # factor can't drift apart.
  echo ": \"\${SPEED:=<the factor from profile.md §2>}\"" >> .work/format.env
  ```

  Top-level `window.FORMAT` in `scenes.js` is the format axis, and **without it the format
  is `shorts-9x16`**. No existing episode has the key, so they all come out the same as
  today — a unit test pins the emitted values to be character-identical with the builder's
  inline defaults (`format-resolve.test.mjs`). There's one reason to write it every time
  regardless of format. Make it conditional and the first time someone forgets "write it
  only for landscape", that episode quietly builds at the portrait defaults.

  The capture calls take this file as a **command-line prefix** (§4). `export` won't carry
  it — the Bash tool starts a fresh shell per call, so an exported variable dies with that
  call. That's why the playback factor goes in here too: `build-reel.sh` sizes its speech-rate
  band and its chapter minimum from it, and §7.5's pass takes its factor from the same line, so
  the build and the ship can't disagree about the speed.
- **Don't delete `.work/cost-tally.tsv`** — it's the episode ledger where storyboard already
  wrote the image costs, and §10 totals storyboard through video out of that one file. If
  the file isn't there, start a new one from this episode, but if `storyboard/images/*.png`
  exist with no ledger, the image costs are missing from the total — §10 writes that fact
  into the report.
- **Read the episode's state before starting, and again when picking up a stopped run.**
  Produce is the long stage, so it is the one most likely to be resumed in a later session.

  ```bash
  REF=${CLAUDE_PLUGIN_ROOT}/skills/autoproduce/references
  node $REF/episode-state.js .        # from the episode directory · exit 1 = blocked
  ```

  It reports the stage and what is missing — filmed scenes with no footage, slide files never
  authored, images the scenes name that aren't on disk. Run both structural contracts too:

  ```bash
  SB=${CLAUDE_PLUGIN_ROOT}/skills/storyboard/references
  node $SB/check-scenes.js storyboard/
  node $SB/check-slide.js storyboard/ --require-all
  ```

  The second command keeps a declared motion frame from reaching production as a missing HTML
  file. Timeline, statistic, and principle slides are checked again while rendering: every
  `motionBeats` primitive (actor + hairline on a principle) must exist in that group's DOM. A missing camera slot or an
  unresolvable b-roll `after` fails the first command. Fix a blocker before the build rather
  than discovering it 12 minutes into capture. `.work/` survives between sessions on purpose,
  so a resumed run reuses the captures and TSV manifests already there.

### 2. Prepare the frame render

```bash
sed 's|</body>|<script src="./scenes.js"></script>\n</body>|' \
  ${CLAUDE_PLUGIN_ROOT}/skills/produce/references/video-template.html > .work/frame.html
cp storyboard/scenes.js storyboard/images/*.png .work/   # for file:// relative references
```

Rebuild frame.html every time you touch the template or scenes.js — skip it and you capture
the old render without knowing. Always run with absolute paths (a relative-path redirect
after `cd` fails silently).

### 3. Generate the visuals

The §6 manifest references these file paths directly, so follow the naming below.
**The cover background and the b-roll clear the plan gate first** (absolute rule 13) —
delegate the cover `bgPrompt` and the broll scenes from scenes.js plus the profile.md §3
path to content-reviewer in "plan mode", confirm `PLAN_REVIEW: PASS p0=0`, and only then
start the generation calls.

**Image engines, split by job** — the default is `image_local_generate` (local Z-Image, 0
cost per image — text-free images such as points still backgrounds; storyboard §5 already
generated them under this rule). The cover background = b-roll source stays on
`gpt_image_text2img` (high) under the quality clause, since it's both the thumbnail and
veo's input, and any image that needs lettering always goes to gpt_image (local Hangul,
measured: "딸깍연구소" came out as "달닥연구소"). `mlx_image_generate` /
`mlx_image_edit` are an optional extra local lane when MLX Core is up — they do not
replace Z-Image as the default, and they do not take Hangul. The plugin never launches
the app; a down :11234 fails closed.

**What the storyboard already settled — pass it through, don't re-decide it.** These values
arrive from scenes.js already chosen and already reviewed. Inventing a replacement at call time
means generating something nobody approved.

- **The stored clip prompt — send it verbatim.** Every generated-video shot leaves the
  storyboard with its final prompt stored (scenes-schema §clip prompt: `visual.prompt` on
  b-roll, `visual.video.prompt` on a motion background, `visual.clip.prompt` on a speech
  clip), assembled by `assemble-bg-prompt.js --clip` in the planned route's grammar and
  machine-checked there. One scene is one call, and the prompt is the reviewed artifact — the
  call adds only the arguments the API takes separately: `negativePrompt` from the stored
  `negative` noun list (Veo lanes only), the reference images from `visual.character`,
  `durationSeconds` from `duration`. **To regenerate a clip, resend the stored prompt as-is**;
  when a camera slot or the motion changed, rerun the assembler from the fields rather than
  editing the string by hand — the same discipline as `bgPrompt`.

- **`visual.camera` — the four camera slots — is the fallback assembly recipe.** On an older
  scenes.js with no stored prompt, assemble the camera part in this order — `framing`, then
  `speed movement`, then `ending on end`:

  ```
  { movement:"dolly in", speed:"very slow", framing:"chest-up on the subject", end:"subject centred at mid-frame" }
  → "chest-up on the subject, very slow dolly in, ending with the subject centred at mid-frame"
  ```

  Then append the subject motion, and for b-roll the audio line. **An empty `end` is a storyboard
  defect, not something to fill in here** — send it back. Older episodes carry a single
  `visual.motion` string instead; use that as-is.

- **`shot.feel`·`shot.size`·`shot.angle`·`shot.space` — the shot grammar.** The storyboard wrote
  what the audience should feel on each shot and chose the size, the angle and the frame space
  for it (`../storyboard/references/directing-grammar.md`). On a generated shot the `framing`
  slot already restates size and angle in the engine's words; keep that distance and height, and
  when a clip comes back drawn closer, farther, or from a different height than the slot says,
  rerun it off the same PNG rather than accepting a frame that flips the feel. **Do not
  re-describe `shot.space` in a motion prompt** — the still already drew who sits where and
  which way they face, and rewriting sides, facing, or lighting makes the engine redesign the
  scene (plan P0-7). A quote speech clip has no still, so its prompt carries the shot's
  `From the camera: …` sentence — `assemble-bg-prompt.js --from scenes.js --shot N
  --space-only` (N from 1, the strip's "Shot N") — after the character description; the size and framing phrases stay what the
  quote contract below says, since that clip is framed wide on purpose for the palindrome
  reframe. On a still the size, the angle and the space live in `bgPrompt` and were drawn at
  the storyboard stage — nothing to re-decide here. To regenerate a still, resend the stored
  `bgPrompt` as-is; when a `shot` field changed, rerun the assembler from the fields with the
  scene and mood sentences lifted from the stored string (they sit between the `From the
  camera:` sentence and the exclusions — and `--no-person` again when the stored string reads
  "the subject" instead of a body) rather than editing the string by hand.

- **`visual.character` — who is on screen.** Resolve the id to its panel directory and attach the
  panels as reference images:

  ```bash
  CH=$(python3 ../channel/references/resolve-asset.py "$CHANNEL_DIR" character claude)
  # → …/assets/characters/claude — reference set: $CH/face.png then $CH/body.png
  ```

  **Order is weight** — face first, body second, and `back.png` third only when the shot is
  back-facing. No panels yet means falling back to that character's `front.png`; a live-action
  character keeps its single image (`real.png`). Drawn character → `seedance_reference`,
  photoreal person → `veo_reference` (**3 images max**, validated in code). The full rule is
  [video-model-selection.md](references/video-model-selection.md) §6.

  **The character's voice travels the same way.** `$CH/voice.wav` is the fixed voice sample
  (`resolve-asset.py "$CHANNEL_DIR" voice claude`; §6). When the model voices the cut —
  `generateAudio: true` on `seedance_reference`, which is a b-roll slot routed to Seedance or a
  lip-synced speaking cut — pass it as `referenceAudioPaths` and bind it in the prompt right
  after the reference list: `@Image 1-2 are Claude and speak with the voice of @Audio 1`. Two
  speakers, two clips, one sentence each; `@Audio N` is the Nth entry of `referenceAudioPaths`.
  The route is `dreamina-seedance-2-5-260628` — the only model whose guide documents the
  per-character mapping, and the 2.0 series takes no audio-only input. Veo has no audio
  reference, so a speaking cut that must keep the character's voice is Seedance's. A cut voiced
  by TTS in the build needs no voice reference at all — the sample exists so the model-voiced
  lane and the TTS lane sound like the same person, which is why it is cut from the voice
  `identity.md` pins (profile §2). Imitation, not cloning: also describe the voice in words
  (gender, age, texture, pace, mood) and keep the lines in the sample's tone — the vendor's own
  FAQ says the result drifts otherwise.

  An entry written as `{ id, scope }` carries its **jurisdiction** — copy that clause into the
  prompt's reference list verbatim (`@mouse — controls the helmet and body only`). Don't
  paraphrase it and don't drop it: it is what keeps one reference from painting the rest of the
  frame, and the storyboard settled the wording where it could be reviewed (§positive locks).

- **`duration` — the used length.** On a generated clip this is what the cut needs
  (scenes-schema §cut length), not a default: an insert is 3–4s, a face carrying emotion is
  7–10s. **Ask for exactly that** — Seedance makes and bills the seconds you request, so
  `durationSeconds` is the used length, **clamped to the routed model's server floor**: 1.5
  pro takes 4–12s, so a 3-second scene requests 4 and the build cuts at the scene boundary.
  Veo's reference lane is the exception the other way, pinned at 8s, so
  there you generate 8 and trim. Handing a model more seconds than the idea holds is how the
  middle of a clip goes dead — it fills the time it is given.

**Which engine, how to word the prompt, and the recipe for each generated slot** —
[video-generation.md](references/video-generation.md). It carries the face → sound → grid
route between `veo_*` and `seedance_*`, each engine's prompt shape, and the per-slot recipes
for b-roll, motion backgrounds and quote speaking clips. **Read it before the first
generated-video call**; an episode of still backgrounds skips it whole.
`mlx_video_generate` is a separate local clip (24 fps, RAM-capped, ffmpeg mux) — it is
not on that face-policy table and is not the default. `mlx_3d_generate` writes a GLB
the builder never reads.

- **Cover background = b-roll source (one image, `storyboard/images/scene-1.png`)**:
  `gpt_image_text2img`, `size: "1088x1920"`, **`quality: "high"`**. **Photoreal style with a
  person in it** (absolute rules 11·12) — generated people only (a Korean woman by default),
  an angle that puts the channel's subject at the center, a scene that shows the topic at a
  glance. Inherit profile §3's mood, its required negative instructions, and the
  fill-the-frame tail (owner 2026-08-25 — never a letterbox or a lower-third fade), but
  swap `face not visible` for
  **`seen from behind, face turned away`** so the person is clearly visible.
  The cover capture (`bg=./scene-1.png`) and veo's input use the same file, so when the cover
  ends that photo starts moving.
- **BGM**: the storyboard already decided this. Read `window.MUSIC` and each shot's `sound`
  (scenes-schema §music cues) and turn them into files the builder can find.

  **No `window.MUSIC`** — a one-bed episode, which is the common case:
  ```bash
  ASSET=${CLAUDE_PLUGIN_ROOT}/skills/channel/references/resolve-asset.py
  if BGM=$(python3 "$ASSET" data/<channel> bgm default 2>/dev/null); then
    cp "$BGM" .work/bgm.wav
  else
    # generate only when there isn't one — to reuse it next episode, copy it to
    # assets/audio/bgm/default.wav and register it in the catalog with resolve-asset.py --ensure
    : # default: music_generate_clip (Lyria, 30s instrumental) → .work/bgm.wav
  fi
  ```

  **With `window.MUSIC`**, one file per cue. `base` (or the channel's shared bed when there is no
  `base`) becomes `.work/bgm.wav`; every other cue becomes `.work/bgm-<name>.wav`. A cue with
  `asset` comes from `resolve-asset.py <channel dir> bgm <id>` instead of being generated. Add up the durations of
  the shots each cue covers and ask `music_generate` for that many seconds — the bed then never
  loops. Past 300s the builder crossfades it onto itself, so a long-form cue is fine too, just
  more repetitive.

  Then write **`.work/bgm.tsv`** — `idx <TAB> audio-file`, one row per shot that changes the cue:
  ```
  4	bgm-tense.wav
  ```
  `idx` is the **card idx** — 0-based, the shot's array position in scenes.js, the same number
  `sfx.tsv` and `chapters.tsv` use (`broll` and `outro` are spliced in after the build and are
  not cards). Paths are relative to `.work/`.
  A shot with `sound.drop` becomes an `sfx.tsv` row per segment of that shot, audio column empty
  and `bgm` set to `off` (§sfx below). A shot with `sound.sfx` becomes one row on **seg 0** — the
  shot's first frame — with the path `resolve-asset.py <channel dir> sfx <id>` returns.

  **The level is not a knob here.** The builder measures the narration and sets the bed
  `BGM_SEP` LU under it (10 by default), clamps the bed's true peak, and stops the build if the
  voice-to-bed separation lands under 4 LU. So the prompt only has to make the bed *fit* — the
  established wording is "leaves space for a spoken voiceover, no melody in the vocal frequency
  range". Where those numbers come from, and which parts of this are evidence and which are our
  own practice: [bgm-scoring.md](references/bgm-scoring.md).

  | Job | Tool | Key |
  |---|---|---|
  | A cue that has to fit a span, or a seed to reproduce | `music_generate` / `music_generate_advanced` (5–300s) | `GEMINI_API_KEY` |
  | A bed with no span to fit | `music_generate_clip` 30s, the builder extends it | `GEMINI_API_KEY` |
  | A local instrumental bed (optional) | `mlx_music_generate` (`instrumental: true`) | MLX Core on :11234 |
  | Narration-under bed (Suno) | `suno_generate_sound` loop + BPM. `filename: "bgm.wav"` | `SUNO_API_KEY` |
  | The song IS the content | `suno_generate` (customMode; lyrics from `suno_generate_lyrics` or written) | `SUNO_API_KEY` |

  Default BGM is Lyria. `mlx_music_generate` is the $0 understudy when MLX Core is
  running — it is not the default, and unattended still takes the Lyria clip.
  Sung vocals fight the voiceover, so `suno_generate` is
  for episodes where the song itself is the piece. There is no official Suno
  API (2026-08); `suno_*` talks to sunoapi.org.

**Write one line to `.work/cost-tally.tsv` per call** — carry on the same ledger storyboard
was using. The convention's source of truth is
[cost-tally.md](../autoproduce/references/cost-tally.md).

```bash
printf 'image.gpt-image-2.high\t1\tproduce: cover background regenerated\n'          >> .work/cost-tally.tsv
printf 'veo.lite.1080p\t8\tproduce: b-roll a1 — generated 8s, used 4s\n'             >> .work/cost-tally.tsv
printf 'seedance.1-5-pro-silent.1080p\t5\tproduce: motion background i3 (completion_tokens 102960)\n' >> .work/cost-tally.tsv
printf 'music.lyria-realtime\t90\tproduce: BGM cue "base" 90s — unit price unconfirmed\n' >> .work/cost-tally.tsv
# one line per cue in window.MUSIC — a three-cue episode is three calls, not one
printf 'music.suno-generate\t1\tproduce: Suno full song, 1 call (2 tracks)\n'        >> .work/cost-tally.tsv
printf 'music.suno-sound\t1\tproduce: Suno loop BGM\n'                                >> .work/cost-tally.tsv
```

Two places where the unit is easy to get wrong.

- **For veo, write the generated length** — generate 8 seconds and use only 4 and it's still
  `8`. The API allows 1080p at 8 seconds only, and trimming doesn't reduce the bill. Write 4
  and half of that episode's video cost vanishes from the report.
- **For seedance, write the seconds you requested**, and copy the response's
  `completion_tokens` (the actual billing basis) into the memo. The price table's per-second
  value is converted from the official example price, so comparing the two later checks the
  conversion.

**BGM is an item whose unit price hasn't been confirmed.** Lyria RealTime, which
`music_generate` calls, has no row in the official price list (confirmed 2026-08-15). Write
it into the ledger anyway — write 0 or leave the line out and that episode's cost quietly
shrinks. The report exiting 1 is the correct behavior, and §10 reports it as "1 item excluded
from the total".

**Carry on the decision log too** (`.work/decisions.tsv`, started by storyboard —
[decision-log.md](../autoproduce/references/decision-log.md)). Produce is where most of the
substitutions actually happen: the music source, the voice, and every route that had to change
because a key was missing. A fallback that reaches the deliverable without a line here becomes
an unexplained difference between the storyboard's plan and the video.

```bash
printf 'produce\tmusic_source\tepisode BGM\tmusic_generate_clip\t30s Lyria clip, builder extends; rejected suno (sung vocals fight the voiceover)\n' >> .work/decisions.tsv
printf 'produce\tfallback\tmotion background i3\tveo_img2video\tARK_API_KEY absent — seedance route unreachable; recorded in build-report.md as the allowed deviation\n' >> .work/decisions.tsv
```

### 3.5 Take in the filmed clips (mixed-shooting episodes only)

Normalize the user's `footage/` files once, then hand them to the builder as cards.
The full lane — the VFR trap, the normalize command, the naming the builder expects —
is in [optional-lanes.md](references/optional-lanes.md) §3.5. **No `footage/` directory
means skip this step.**
### 3.6 Slide scenes and live-voice audio (only on episodes that have them)

Authored HTML screens get captured like any other card, and an all-live-voice episode
takes its audio from `voice/` instead of the TTS in §5. Both lanes are in
[optional-lanes.md](references/optional-lanes.md) §3.6. **No slide scene and no `voice/`
directory means skip this step.**
### 3.7 Screencast splices (only on episodes that have them)

A recorded screen spliced into a generated reel — cut, focus crop, and the splice order.
[optional-lanes.md](references/optional-lanes.md) §3.7. **No screencast in scenes.js
means skip this step.**
### 4. Capture the reveal states

Per scene, let `capture-reveals.sh` **derive the state count itself** (a person choosing how
many to shoot is how states go missing):

```bash
REF=${CLAUDE_PLUGIN_ROOT}/skills/produce/references
FORMAT_ENV="$PWD/.work/format.env" \
  $REF/capture-reveals.sh <idx> "file://$PWD/.work/frame.html?i=<idx>&alpha=1&scrim=1&dim=1" .work/cards/a<idx>r 1
```

| Scene | URL parameters (reveal= excluded) | Alpha |
|---|---|---|
| **cover (code-rendered — absolute rule 10)** | `?i=n&bg=./scene-n.png&scrim=1&dim=0` | 0 |
| points (over b-roll/motion) | `?i=n&alpha=1&scrim=1&dim=1` | 1 |
| points (still background) | `?i=n&bg=./scene-n.png&scrim=1&dim=1` | 0 |
| quote (over a speaking clip) | `?i=n&alpha=1` | 1 |
| quote (static quote card) | `?i=n&bg=…&scrim=1&dim=2` | 0 |

**A motion-background scene (`visual.video`) is the table's "points (over b-roll/motion)"
row** — the alpha capture carries only the text and §6's assembly lays the video underneath.
On an illustration-mode episode, keep `&light=1` on this scene too (ink text over a
white-keyed video — the light wash comes along in the alpha capture).

**The scrim layer is off** (owner 2026-08-25 — no top/bottom gradient bars): the template
keeps the `scrim=`/`dim=` URL parameters so existing capture commands still run, but draws
nothing for them, on any scene type (the static quote card's full wash included). Text
contrast now rides on the background itself — the fill-the-frame prompt tail plus profile
§3's mood — so when a title reads dim against its band, fix the background image, not a
scrim value.

A points reveal transition is a **caption swap** — the state count is 1 (background) +
1 (title and source) + the number of captions. Bullets don't stack into a list; only the
active caption shows (absolute rule 14).

**Illustration (light) mode — line art on white, one illustration per line** (the
`img`/`imgPrompt` in scenes-schema §narration; first case 2026-08-12, dropshipping):
- Add **`&light=1`** to every capture URL — it flips the text to ink for line art on
  white. (The white band wash it used to draw went with the scrim layer — owner 2026-08-25.)
  The cover text moves to a top anchor — **generate the cover illustration with the
  character and props small in the bottom third and the top two thirds empty** (a
  middle-anchored composition puts the stat over the face).
- The per-line illustration swap is solved by the capture — no build changes (the segment
  boundary xfade crossfades the background along with it): ① run `capture-reveals.sh` with a
  single-row illustration bg to derive the state count (recorded in reveals.tsv), then
  ② reshoot only the states whose bg differs with `capture-frames.sh` and replace them
  (**put the same `FORMAT_ENV="$PWD/.work/format.env"` prefix on these too** — miss it here
  and only the replaced cards get shot in a portrait window, so sizes disagree inside one
  episode). The mapping: on cover, r1←seg ①, r2←seg ②.
  On points, r1 (title)←seg ①, and caption r k is the illustration of the segment that reads
  that caption.
- `dim=` stays inert here too (the scrim layer is off) — and brightness isn't a question
  over a white background anyway.

Overflow check: the template writes what's left over into `document.title` as `ovf=<px>`,
and a headless `--dump-dom` run reads that title back after the page script has run
[measured 2026-08-30]. Same Chrome the captures already use, no browser tooling on top.

```bash
. .work/format.env                       # URL_FMT is empty on the portrait preset
FMT=${URL_FMT:+&format=$URL_FMT}
"${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}" --headless=new \
  --disable-gpu --dump-dom "file://$PWD/.work/frame.html?i=<idx>&reveal=<last>$FMT" \
  2>/dev/null | grep -o 'ovf=[0-9]*'
```

Run it on each scene's **last** reveal state — that one carries the most text. Anything but
`ovf=0` means the zone still spills after the template's own tight1–3 shrink, so cut the copy
or push a line into the next state.

### 5. Generate the TTS (one call per scene)

**An all-live-voice episode (`window.VOICE === "user"`) skips this whole section** — every
card's audio comes from the clips (§3.5) and `voice/` (§3.6). The style gate already
passed back in the storyboard.

**Look at the style before anything gets read aloud.** Narration passes by once with no
rewind, and subtitle and card text can't be fixed after publishing. Check the three surfaces
before the TTS calls.

```bash
PG=${CLAUDE_PLUGIN_ROOT}/skills/platform-guide/references
for S in narration subtitle screen; do
  node $PG/extract-text.js ./storyboard/scenes.js $S > .work/text-$S.txt || { echo "[$S] gate_exit=3 (extraction failed)"; continue; }
  python3 $PG/check-style.py --surface $S .work/text-$S.txt; GATE=$?
  echo "[$S] gate_exit=$GATE"
done
```

Read `gate_exit` as it is — 0 pass / 1 warning / 2 S1 detected / 3 gate never ran
(extraction failure, bad path) / 4 not Korean, so the gate declined to judge.
**Neither 3 nor 4 is a pass.** On 3, fix the path and run again. On 4 the checker read the
text and found it isn't Korean — every rule in it is Korean-specific — so that surface is
**unchecked** and a person has to read it. For English, run the tell checks listed in README and
name every unchecked surface in the approval prompt.
On a 1 with `quote-exempt N` in the header line, confirm that quote against research.md — a
video freezes the subtitles and cards in place, so an unconfirmed quote loses its quotation
marks and gets rewritten in our own words.

**Don't add `| head` or `| sed` to shrink the output.** Add one and `$?` becomes that
command's instead of the checker's, so a FAIL with 6 S1 hits shows as `gate_exit=0`
(field-tested). If you must pipe, put `set -o pipefail` in front.

On exit 2, **fix scenes.js** and start again from here — fixing only `.work/text-*.txt`
leaves it out of step with the video (scenes.js is the single source). When fixing, leave
numbers and proper nouns alone and work on the grain of the sentence.

One voice call per scene — the profile registry as it stands, and the script is the full text
of that scene's narration segments' `tts` sentences joined with periods. `.work/pcm/c<n>.wav`.
Don't split a scene into several calls by sentence (the voice varies between calls).

**profile §2 decides the engine.** A new channel's narration default is `tts_local_generate`
(Supertonic, local) — no key, no quota, and 0 cost however many times you rerun the episode,
so regenerating is free. Only lines that need a style instruction, meaning shots where an
emotion has to be acted, go to `tts_generate` (Gemini). The local side has no stylePrompt.
A profile with `engine: elevenlabs` calls `tts_elevenlabs_generate` with the profile's
voiceId · model · stability (and seed, if pinned) and leaves `outputFormat` at its default
`wav_24000` — mono 24kHz WAV, the same spec as Gemini, so the builder reads it as-is.
**Never pass an mp3_* outputFormat for narration**: build-reel.sh reads any non-RIFF audio
file as raw PCM and that card becomes noise. A scene with three or more speakers goes to
`tts_elevenlabs_dialogue` in one call (no per-speaker stitching, no 0.75s gaps). Audio tags
for acted lines (`[whispers]`, `[laughs]`) only work on `eleven_v3`, and the v3 cap is 5,000
characters per call — scenes are far under it.

**An existing profile with no engine field counts as `gemini` and keeps the voiceName written
there.** Don't switch it over just because local is the default — a channel a few episodes in
would change narrators mid-run. A move to local happens only when the user updates profile §2
and names the engine.

**Don't mix engines with different sample rates inside one video** — 44.1kHz (local) and
24kHz (Gemini · ElevenLabs default) on one timeline break the concatenation. Gemini and
ElevenLabs at `wav_24000` share a spec and can sit on one timeline; local can't join either
without resampling one side before the build. `mlx_tts_generate` is an optional local
voice when MLX Core is up — never a silent fallback for the engine pinned in profile §2.

**Length check right after generation** — anything over twice chars/4.5 gets one regeneration
at the same parameters. `tts_local_generate` and `tts_elevenlabs_generate` return the audio
length in their responses so you can use that value directly, and `tts_generate` gets measured
with ffprobe (handling Gemini TTS's anomalous output is in `references/pipeline.md` §Three TTS
failure modes).

Once the whole scene is out, write a line to the ledger. **The quantity is chars÷1000, not
the character count** — the unit price is per 1,000 characters, so writing 412 characters as
`412` inflates it 1000×. It doesn't show on the local engine at price 0, but on a Gemini
channel it becomes a wrong billing figure outright. A regenerated scene gets one more line
for its share.

```bash
# local (Supertonic) channel — 1,840 characters across all scenes
printf 'tts.local\t1.840\tproduce: narration, 5 scenes, 1840 chars\n' >> .work/cost-tally.tsv
# on a Gemini channel, use the key for the model (flash by default)
printf 'tts.gemini-flash\t1.840\tproduce: narration, 5 scenes, 1840 chars\n' >> .work/cost-tally.tsv
# on an ElevenLabs channel the quantity is the response's "Character cost" ÷ 1000 (the vendor's
# metered count — it sits below the raw character count, measured), key by model family
printf 'tts.elevenlabs\t1.120\tproduce: narration, 5 scenes, character cost 1120\n' >> .work/cost-tally.tsv
# (flash_v2_5 / v3_conversational → tts.elevenlabs-flash)
```

If the local engine fails with "Python interpreter not found" or
"No module named 'supertonic'", **stop right there and ask the user to install it.** Don't
quietly switch to Gemini — the video gets made with a changed voice, and the speaker differs
from episode to episode. The same rule covers ElevenLabs: a key, permission, quota, or
`output_format_not_allowed` error stops the run and goes to the user — no silent fallback to
another engine.

### 6. Write the manifest + build

Convert `.work/cards.tsv` and `segs.tsv` from scenes.js (tab-separated, outro excluded):

```
cards.tsv : idx <TAB> absolute audio path <TAB> target chars/sec <TAB> zoom(in|out|auto|none|punch|hold) [<TAB> options]
segs.tsv  : idx <TAB> seg (0-based) <TAB> visual <TAB> tts sentence <TAB> sub sentence
sfx.tsv   : idx <TAB> seg <TAB> audio file <TAB> bgm(on|off)          (optional)
bgm.tsv   : idx <TAB> audio file — the music cue changes at that card (optional)
chapters.tsv : idx of the chapter's first card <TAB> chapter title    (long-form)
```

**Column 4 is the still-image camera move.** All motion is eased (smoothstep) — a
constant-speed ramp starts and stops like a machine; the ease is what reads as an operated
camera (`KB_EASE=linear` restores the old ramp). `auto` alternates in/out card to card.

| zoom | What | When |
|---|---|---|
| `in` / `out` / `auto` | eased 3.5% zoom over the whole card | the default drift — `auto` unless the scene says otherwise |
| `punch` | the whole 3.5% lands in the first 0.4s (ease-out), then holds | the cover card — the hook contract wants movement inside 0–3s |
| `hold` | fixed scale, no zoom motion | the base for `drift=1` (pure handheld), or a deliberate static frame |
| `none` | no Ken Burns at all, source untouched | **a filmed clip already moves** — a zoom on top shakes the frame. Filmed cards are usually `none` + `sync=1` |

**The 5th cards.tsv column (options) is `k=v,k=v`.** It's optional, and existing 4-column
files keep working. Two-value options use `:` inside the value — `,` stays the k=v separator.

| Option | What | When |
|---|---|---|
| `sync=1` | turns off preroll, silence trim, and speed correction entirely. Normalization only | **live voice on a filmed scene** — any one of the three throws mouth and sound out of step |
| `subs=<tsv>` | supplies that card's subtitles as a file (`start<TAB>end<TAB>sentence`, seconds from the card's start) | subtitles built from a transcript — scenes that skip speech-boundary detection |
| `pan=<direction>[:scale]` | Ken Burns as a travel instead of a centre zoom (`l2r`·`r2l`·`u2d`·`d2u` + diagonals `tl2br`·`br2tl`·`tr2bl`·`bl2tr`). Column 4 `in`/`out` layers a zoom drift over the travel (the classic pan+zoom); `auto` keeps the scale fixed | scenery and wide sources. Travel = width × (scale−1) ≈ 130px at the default 1.12 — measured on portrait too, so the old landscape-only advice is dead |
| `focus=fx:fy` | zoom towards this normalized point instead of the centre (0.5:0.5 = centre). The far side of the frame shifts up to 2× the centre case — pipeline.md has the numbers | the scene has one subject and it isn't centred — the zoom should arrive at the subject, not at the frame's middle |
| `drift=1` | handheld micro-drift — two non-integer-ratio sines wobble the window a few pixels. Composes with `in`/`out`/`punch` (adds a 1.04 base scale) or `hold` (pure handheld) | presence, unease, cutting the AI look — the still counterpart of the `handheld` row in directing-grammar §4 |
| `span=<0..1.5>` | this card's total zoom span, replacing the global `ZOOM_SPAN` (0.4 = the window grows 40% over the card). Applies to `in`/`out`/`punch` and the pan zoom drift; unused on `hold`/`none` | a still whose beat wants a visible move — computed from the storyboard's `speed` word (below). Past base+`span` > `ZOOM_BASE`/canvas (base: pan scale · drift 1.04 · else 1; headroom 0.5 at the defaults) the source upscales and the build warns: raise `ZOOM_BASE` and generate the scene image at that resolution |
| `ease=smooth\|linear\|in` | this card's easing, replacing the global `KB_EASE`. `in` accelerates — an unnoticed start, fastest exactly at the cut | the ladder's accelerating rows (action/tension, CTA) — pairs with cutting away at the peak. `punch` keeps its own ease-out ramp and ignores `ease=` |
| *(omit `enter=`)* | **J-cut** — this card opens on the previous last frame for `SCENE_JCUT` (0.32s) while the next line already plays, then the picture cuts. Drops this card's silent pre-roll | omit `transition`. **Do not type `enter=jcut`** — that is the builder default on incoming spoken cards |
| `enter=cut` | smash — picture and sound change together, old silent pre-roll | `transition: "cut"` |
| `enter=dissolve` | this card opens on the previous card's last frame and melts up through it (`SCENE_XF`, 0.45s) — two pictures on screen at once | **the storyboard's `transition: "dissolve"`** — written on the card that carries the field, nothing on the card before |
| `enter=push:<l2r\|r2l\|u2d\|d2u>` | the previous card's last frame slides off in that direction and uncovers this card (`SCENE_PUSH`, 0.32s) | `transition: "push:<dir>"` — same rule, the incoming card alone |
| `enter=iris` | a circle opens out of the previous card's last frame onto this one (`SCENE_IRIS`, 0.45s) | `transition: "iris"` — the find |
| `enter=blur` | the previous last frame smears sideways and melts (`SCENE_BLUR`, 0.45s) | `transition: "blur"` — memory, hypothetical, attention leaving |
| `enter=zoom` | the previous last frame grows past the camera and thins out (`SCENE_ZOOM`, 0.32s) | `transition: "zoom"` — the camera goes *in* |
| `enter=whip:<l2r\|r2l\|u2d\|d2u>` | the previous last frame slides off smeared along that axis (`SCENE_WHIP`, 0.24s — the shortest join here) | `transition: "whip:<dir>"` — a hard swerve. Pairs with a whoosh in `sfx.tsv` |
| `exit=black` + `enter=black` (or `white`) | the card before fades its tail into the colour, this card fades its head out of it (`SCENE_FADE`, 0.12s each) | `transition: "dip"` / `"dip:white"` — two halves, one per card. `enter=1`/`exit=1` still mean black |

```
# one line for a filmed scene (live voice)
3	pcm/s3-run-cli.wav	0	none	sync=1,subs=cards/s3subs.tsv
# 슬라이드·생성 씬(사용자 녹음 나레이션 — window.VOICE) 한 줄 예: 일반 레인, sync 없음
11	pcm/s12.wav	0	none
```

**A transition is drawn inside one card, never across two.** Map `transition` from
scenes-schema §scene transition onto the table above. A `dip` is the one that takes two
halves (`exit=` on the card before, `enter=` on this one). Write nothing and the builder
J-cuts spoken cards — next line on the previous last frame, then the picture cuts. Write
`enter=cut` for a smash. First card, filmed `sync`, speechless cards, and dips keep the
old pre-roll.

The builder does it this way because a boundary xfade would break the pipeline's spine: the
total would shrink by the transition length at every seam and trip §9's 2ms drift assertion,
and xfade renumbers the tail's PTS from 0 (the measurement is written out at the outro seam
in build-reel.sh). Every carry and dip keeps the card's frame count, so the concat stays
stream-copy exact and no subtitle cue moves — verified A/B on ep07 (10 cards, two
dissolves): 64.766667s and 1943 frames both ways, identical `subs.srt` on the cards that
carry a transition, drift 0. The ban is on the seam, not on the filter: iris and blur
composite inside one card with an xfade at offset 0 over a tail exactly the join long, so
that card's length is untouched (build-reel.sh §7.4 carries the measurement). A J-cut is
allowed to drop that card's silent `PRE` (0.40 s)
because the next line occupies it. `POST` is 0.45 s.

**Word cues — `SUB_MODE=word`.** The burn-in shows **one 어절 at a time**, a hard swap every
half second, sitting on the 65% line in a 60px glyph with no fade — the subtitle grammar of
the reference short measured in docs/research/2026-08-29-one-world-word-cue (164 swaps in
85 s, 1.23 words per cue, 0.47 s median). The words get real times: the builder runs the
forced aligner once per card on the trimmed narration (`QWEN3_ASR_BIN`, about 3 s for a 7 s
card), `references/word-cues.py` maps each display word onto the heard characters through
the TTS spelling (so "2020년" lands where "이천이십 년" was said, whatever the spacing), and a
word that would flash by under `SUB_WORD_MIN` (0.28 s) is glued to the next. **Measured on
ep07**: all 27 segments aligned (23 at 100% character match, the lowest 79%), and the cue
start of every sentence-opening word sat within 0.07 s of the energy-based speech onset
(mean 0.02 s, 18 sentences — a different signal from the aligner, so this is an independent
check). Without the aligner the words spread by character count over the speech window,
and that path measured 0.42 s off on average, 1.18 s at worst — it prints a warning and is
not the lane. `subs.srt` keeps whole sentences either way (the publish tracks stay
readable); only the burn-in changes. The Word style is `SUB_WORD_SIZE` (84 — Pretendard
draws a Hangul glyph at ~0.71× the size) and `SUB_WORD_MV` (640, the 65% line); the `Sub`
style and its format-lint mirrors are untouched. Default stays `sentence` — a channel
switches with `SUB_MODE=word` on the build line, same as `ATEMPO_MIN=1`.

**The still move comes from the storyboard, not from taste.** A still's
`visual.camera.movement` (when the storyboard wrote one — directing-grammar §5's Still
column is where it picks) maps onto column 4/5 like this: `dolly in`/`zoom in` → `in` (add
`focus=` at the subject when it isn't centred), `dolly out` → `out`, `handheld` → `hold` +
`drift=1`, `truck`/pan wording → `pan=<dir>`, and the cover card takes `punch`. A still with
no camera written stays `auto` — most cards should. The same restraint as generated video:
the move supports the scene's feel, it doesn't decorate it.

**The still's `speed` word sets the size of the move.** The beat→rate ladder is
directing-grammar §4 (still lane) — `very slow`/`slow`/`fast`/`very fast` rows, with the two
fast rows adding `ease=in` and the CTA row aiming `focus=` at the face. Convert the row to
the card knob as **`span` = rate × card seconds**, reading the seconds from the finished
narration wav (`ffprobe`), not the character estimate; PRE/POST margins make the rate
approximate and the ladder's wide spacing absorbs that. Example: a 9s payoff card on the
`slow` row → `span=0.54`. A still whose camera has no `speed` (or no camera at all) keeps
the plain column-4 move at the 3.5% default.

**A slide scene's segment visuals** are the per-group clips from §3.6, one per segment,
each with the play-once prefix: segment k → `@motion/slide-s<shot number>/r<k>.mp4`
(segs.tsv paths are relative to `.work/`, the builder's working directory — the same way
the state PNGs are written `cards/a<idx>r<k>.png`), `zoom` `none`, no overlay (the slide
draws its own text). `@` is right here even though
the scene has several segments, because every segment has **its own** clip — clip k opens
on the previous rest state and freezes on its own, so the reveal xfade at the sentence
boundary crosses two identical pictures (measured 44 dB PSNR across the seam) and the
motion starts inside the pause before the sentence, where the caption contract already
puts the reveal. A sub-reveal (`A|B`) takes two clips in one segment the same way
(`@motion/slide-s5/r2.mp4|@motion/slide-s5/r3.mp4`).

```
# a motion-slide card (idx 4, three segments) — cards.tsv and segs.tsv
4	pcm/s5.wav	5.2	none
4	0	@motion/slide-s5/r1.mp4	큰 조각 하나에만 톱니바퀴가 27개예요.	큰 조각 하나에만 톱니바퀴가 27개예요.
4	1	@motion/slide-s5/r2.mp4	전체로는 30개가 남았고요.	전체로는 30개가 남았고요.
4	2	@motion/slide-s5/r3.mp4	원래는 37개였을 거라고 봐요.	원래는 37개였을 거라고 봐요.
```

A `sync` card's audio is **the wav pulled from that clip** (§3.5). The card's length is that
audio's length, so if one came from the original mov and the other from the normalized file,
the picture slips by exactly that difference.

**The segment visual for a filmed scene** is
`@.work/footage/<name>.mov::.work/cards/a<idx>.png` — play the clip once from its first frame
(`@`) with the lower-third alpha PNG over it. A live-voice scene has one segment, so `@` is
right; when a narration-covering scene has several segments, drop the `@` and repeat the same
path (the builder joins the playback with `-ss`).

The visual column: a state PNG / `video.mp4::overlay.png` (cover, speaking, motion
background) / `A|B` (sub-reveals — even a sentence that reads several bullets together brings
them on screen one at a time). **A motion-background scene**'s segment visual is
`.work/motion/motion-i<idx>.mp4::statePNG` (the alpha capture) — with several segments,
repeat the same video path (the builder joins the playback with `-ss`, pulled forward by the
xfade offset).

**The `@` prefix = play once** (`@typing.mp4`, or `@typing.mp4::badge.png`). The default video
visual fills the segment window on a loop and starts pulled forward with `-ss` so it
continues from the previous segment — behavior that assumes **a picture you can cut into
anywhere**, like b-roll. A clip where **the whole thing is one action**, such as a typing
card, breaks in two places under that: with 2+ segments it starts mid-way with the text
already typed, and even with 1 segment a window longer than the clip loops and types it all
again (measured). `@` plays from the first frame and stops on the last.
**But `@` is for a single segment only** — put one clip **across two consecutive segments**
and `@` restarts the clip at each segment boundary, resetting the typing (measured on the
2026-08-14 claude-skills episode — the second command never made it on screen). On a spanning
segment, drop the `@` and repeat the same path; the builder joins it with `-ss` continuation
(the same behavior as a motion background). If the windows sum to less than the clip, it ends
at that point without looping, so just confirm that the typing-complete time falls inside the
sum of the windows.

**`sfx.tsv` = sound that plays only in that segment's stretch**. The audio file can be a wav
or an mp4 (for a video, its sound is used), and leaving it blank with only `bgm` set to `off`
drops just the music across that stretch. The timing reference is **when that visual
appears**, not the sentence boundary — xfade starts playing the later input's 0-second mark at
the offset, so aligning to the boundary puts the sound three or four syllables ahead of the
picture. Ducking is keyed on the voice alone, so an effect doesn't push the BGM down. Volume
is `SFX_VOL` (0.85 by default) and the BGM cut ramp is `BGM_GATE_R` (0.30s by default).

**Music cues (`bgm.tsv`)** — `idx <TAB> audio file`, the bed changing at that card and staying
until the next row. `idx` is the 0-based card idx. A row for card 0 overrides `bgm.wav` as the
opening bed; without one, `bgm.wav` opens — and `bgm.wav` must exist either way (the builder
checks for it before anything else). Cue changes crossfade over `BGM_CUE_XF` (2.0s), landing the incoming cue on the card start.
Every cue is measured and gained to the same distance under the narration, so cues recorded at
different levels don't step up and down.

**Chapters (long-form)** — attach scenes.js's `chapter` string to that shot's card idx.
Don't write timestamps. The builder makes them from the measured times and checks YouTube's
three requirements (first chapter at 0:00 · 3 or more · at least 10 seconds apart), and
**stops there** if any is broken.

```bash
# scenes.js array index = card idx (0-based). Read it the same vm way as format-resolve
node -e '
const fs=require("fs"), vm=require("vm");
const sb={window:{},console:{log(){},warn(){},error(){}}}; sb.globalThis=sb;
vm.runInNewContext(fs.readFileSync("storyboard/scenes.js","utf8"), sb);
(sb.window.SCENES||[]).forEach((s,i)=>{ if(s.chapter) console.log(i+"\t"+s.chapter); });
' > .work/chapters.tsv
```

Copy the outro chosen from the catalog **under exactly the name in `format.env`'s
`OUTRO_ASSET`** — landscape is `outro-16x9.mp4`, so leaving it as `outro.mp4` means the
builder can't find it and the video goes out without an outro (and that passes as one line in
the report). Use the platform's id (`youtube`·`instagram`) if you know it, `default` if you
don't.

```bash
ASSET=${CLAUDE_PLUGIN_ROOT}/skills/channel/references/resolve-asset.py
. .work/format.env                      # read OUTRO_ASSET
OUTRO=$(python3 "$ASSET" data/<channel> outro "${PLATFORM:-default}") \
  || OUTRO=$(python3 "$ASSET" data/<channel> outro default)
cp "$OUTRO" ".work/${OUTRO_ASSET}"
# if there isn't one, generate it once with build-outro.sh → save as assets/outro/default.mp4
#   python3 "$ASSET" --ensure data/<channel> outro default outro/default.mp4
if [ -d data/<channel>/assets/fonts ]; then
  mkdir -p .work/fonts
  cp data/<channel>/assets/fonts/*.[to]tf .work/fonts/ 2>/dev/null || true
fi
```

resolve finds an old `assets/outro.mp4` too. For subtitle fonts, copy the ttf files from
`assets/fonts/` into `.work/fonts/` (woff2 won't work — without them the fontconfig fallback
still gets you publish quality).

The third column of `sfx.tsv` is a file path or a catalog id. With just an id, resolve it with
`python3 "$ASSET" data/<channel> sfx <id>`.

```bash
$REF/build-reel.sh .work    # → .work/reel.mp4 (clean) · reel-sub.mp4 (burned-in) · subs.srt · cover.jpg · build-report.txt
```

**You get two videos, not one.** This pipeline's principle is to keep subtitles out of the
video and upload them as a separate file — subtitles stay fixable after publishing, viewers
can turn them off, and YouTube even auto-translates from that file. Burned-in subtitles turn
a single typo into a re-encode and a repost. So `reel.mp4` is the clean master with no
subtitles, and `subs.srt` goes to the publish tools alongside it.

#### Splicing in the b-roll (when §3 made one — inside the approved channel cap)

The generated-video stretches get inserted **after the build finishes**, at time T where each
slot's `after` scene ends. `build-reel.sh` only splices the outro, so this is post-processing
outside the builder.

Before splicing, handle **trim + loudness normalization + BGM in a single re-encode** per
slot — cut the broll scene's `duration` (the used length) out of the 8-second original while
matching the veo sound to the body's level and laying the BGM on (generated sound is quieter
than the body — measured at mean −18 to −22dB on person sources):

```bash
BED=${CLAUDE_PLUGIN_ROOT}/skills/produce/references/bgm-bed.sh
mix_broll() {           # mix_broll <after> <used length in seconds> [cue file]
  local A=$1 USE=$2 SRC=${3:-bgm.wav}
  # Same conditioning the feature gets: the clip's own voice is normalized to -20, so the bed is
  # measured and set 10 LU under that. A raw multiplier here would put the b-roll's music at a
  # different distance from the voice than the rest of the episode, on the same bed file.
  printf '0.0000\t%s\n' "$SRC" > .work/bedcue.list
  ( cd .work && "$BED" bed-broll.wav "$USE" "$(awk -v s="${BGM_SEP:-10}" 'BEGIN{print -20 - s}')" bedcue.list )
  ffmpeg -y -i .work/broll/broll-a$A.mp4 -i .work/bed-broll.wav \
    -filter_complex "[0:a]loudnorm=I=-20:TP=-2:LRA=7[va];
      [1:a]afade=t=in:st=0:d=0.4,afade=t=out:st=$((USE-1)):d=1[bg];
      [va][bg]amix=inputs=2:duration=first:normalize=0[a]" \
    -map 0:v -map "[a]" -r 30 -c:v libx264 -profile:v high -level 4.1 -pix_fmt yuv420p \
    -c:a aac -ar 48000 -ac 2 -b:a 192k .work/broll/broll-a$A-mixed.mp4
}
mix_broll 0 4          # pass the broll scene's after and duration from scenes.js as they are
mix_broll 3 4          # if there's a second slot
```

**A b-roll stretch gets the cue that is playing where it splices in** — pass that cue's file as
the third argument. Leave it out and it plays the opening bed, which under a `tense` section is an
audible jump back to the theme in the middle of a scene.

**Don't cut the mixed file again** — the fades are pinned to its length, so cutting loses the
tail fade and shifts the BGM fade out of place. To change the length, re-mix from the
8-second original. (veo's output is 24fps, so the 30fps re-encode happens here at the same
time.)

Get the insertion time T by **accumulating the confirmed lengths up to the `after` card** from
the `card` lines in `build-report.txt`. broll and outro aren't in the manifest and broll
scenes sit at the end of the array, so **body scene index = card index** holds directly.

```bash
cardend() {   # cardend <after> — sum of confirmed lengths for cards 0..after = when that scene ends
  awk -v n="$1" -F'|' '/^card /{ split($1,a," "); if (a[2]+0 <= n) { gsub(/[^0-9.]/,"",$(NF-2)); s += $(NF-2) } }
                       END{ printf "%.3f", s }' .work/build-report.txt
}
$REF/splice-clip.sh .work \
  .work/broll/broll-a0-mixed.mp4 "$(cardend 0)" \
  .work/broll/broll-a3-mixed.mp4 "$(cardend 3)"
# → reel-spliced.mp4 · reel-sub-spliced.mp4 · subs-spliced.srt
```

- **Pass both slots in a single call.** Call the script twice and the second call re-reads
  `reel.mp4`, wiping out the first splice (the input and output names are fixed). Give both
  T values **on the original timeline** — don't pre-add the length the earlier clip will push
  out. The script does the pushing math.
- **Don't eyeball T** — a card's confirmed length (seconds after frame rounding) is when the
  scene ends. Approximate it and the last frame of that scene gets cut off.
- Splice the clean and burned-in versions **separately, at the same T with the same clip**.
  The burned-in version already has the subtitles on screen so it needs no timecode shift, and
  the builder's ASS styling is preserved (re-burning from the srt changes the font, position,
  and outline from the original).
- Each cue in `subs.srt` shifts back by **the sum of the measured lengths of the clips
  inserted before it**. Use the value **measured with ffprobe after re-encoding**, not the
  nominal length (for example 4 seconds) — frame rounding throws it off by tens of
  milliseconds, and that error accumulates to the end of the video and pushes the subtitles
  out of sync.
- **Confirm that 0 subtitle cues straddle T** (the script reports per T). A straddle drops the
  b-roll into the middle of a sentence — move that T to a sentence boundary.
- After splicing, check that **the clean and burned-in versions have the same length**. A
  mismatch means one side's pieces got cut wrong. An output length tens of milliseconds above
  "expected" is normal (each piece rounds up to a frame boundary) — with two slots there are
  three pieces, so that error grows a little.

There's one reason to keep the burned-in version (`reel-sub.mp4`) around — **Instagram has no
path for a subtitle file.** The IG Content Publishing container has no subtitle parameter, so
there, burning them into the picture is the only way to deliver subtitles. The two files are
each encoded from the same original, so both are first-generation (the clean one isn't
re-encoded), and the builder verifies that the lengths match.

### 7. The build report gate

Read `build-report.txt` and rule on it — **drift has to be 0.0000s**, and
`missing reveal state` / `last reveal state unused` mean don't proceed. The full verdict table
is in `references/pipeline.md` §Build report gate table. Total length 35–75s recommended, 90s
cap — **measured after the §7.5 speed pass**, which is the file that ships. Confirm that
`cover.jpg` is a frame where the hero number has already appeared, and if it isn't, set
`COVER_TS` past the report's cover-transition-complete time and rebuild (or just re-extract
the still at that time with ffmpeg).

### 7.5 Speed pass (required — every episode)

The final pace pass exists so every source — narration, generated clips, filmed clips, subtitles,
and chapters — follows one timeline after the build and any splice. It always runs even at 1.0x.
The builder has already normalized card speech; this pass must not undo that work.

```bash
$REF/speedup.sh .work        # → .work/reel-fast.mp4 · reel-sub-fast.mp4 · subs-fast.srt · chapters-fast.txt
$REF/speedup.sh .work 1.6    # a channel-specific rate — profile.md §2 decides, not the moment
```

- **The default is 1.2x.** A profile may choose another factor for the whole feature — narration,
  cards, filmed clips, b-roll, and BGM — but the final subtitle-rate gate still decides whether
  it can ship. A channel that wants the recorded pace writes `1.0` in profile.md §2; the pass then
  copies the build through under the `-fast` names.
- **The outro stays at 1.0x.** It's a brand asset with its own cut and sonic logo, so the pass
  finds the boundary from the outro file's own duration and rejoins the tail untouched.
- **Subtitles and chapters are retimed by the pass** (`subs-fast.srt`, `chapters-fast.txt`) —
  don't hand the build's `subs.srt` to publish; those cues belong to the un-sped timeline.
- **It reads the un-sped files and writes new names**, so running it again with another factor
  recomputes from the original instead of stacking passes.
- **The factor moves the writing-stage cap too.** The 6.2 characters/s gate measures the *sped-up*
  subtitles, so what a card may carry on the pre-pass timeline is `6.2 / factor` — **5.17 at 1.2x**.
  `build-reel.sh` derives its `RATE_HI` from the same `SPEED` and warns there, and its chapter
  minimum becomes `10 × factor` so a boundary still clears 10s after the pass. The shooting lane has
  no such normalization: a take recorded at the 5~6 characters/s standard lands at 6.0~7.2 and the
  gate rejects it, so a screencast channel either writes shorter or sets `1.0`.
- **`profile.md` §2 owns the rate.** Read the channel's speed line before running the pass; with
  no line, 1.2. A profile TTS `speed` multiplies into this, so the final SRT is checked after
  both choices have taken effect.
- The pass appends its own line to `build-report.txt`
  (`── speedup x1.20 (reel.mp4): 62.0s → 52.2s (feature …)`; an explicit 1.0 prints
  `── speedup x1.00: passed through …` instead) and exits 1 when the measured length doesn't match
  feature/factor + tail or `check-final-speech-rate.py` finds more than 6.2 characters/s.
  **No marker line or final-rate PASS line means the episode is not ready to publish**
  (pipeline.md gate table).
- **Length contracts are read after the pass.** The 35–75s recommendation and the per-channel
  length rules describe the shipped file.
- With chapters, watch for the `⚠ … under 10s` line in `build-report.txt` — at 1.2x a boundary
  that was 10s apart comes out 8.3s and YouTube drops the whole chapter list. `build-reel.sh` now
  demands `10 × factor` up front, so this only fires on a build made before that. Merge those
  chapters and rebuild.

### 8. Phone-mode QA (required before publishing)

Copy `reel-qa.html` into `.work/` and shoot it **on a phone viewport with the platform UI
overlay**, again with the headless Chrome the captures use. `?frame=1` draws the 390×844
mockup, and a 470×920 window holds the whole phone including the right action rail
[measured 2026-08-30]; `?t=` seeks, and the header line reports the time it landed on.

```bash
REF=${CLAUDE_PLUGIN_ROOT}/skills/produce/references
# FORMAT_ENV is cleared on purpose — the script sources it and would put CAP_W back
# to 1080. The QA harness is a phone mockup, not a 1080×1920 frame.
FORMAT_ENV= CAP_W=470 CAP_H=920 $REF/capture-frames.sh \
  "file://$PWD/.work/reel-qa.html?v=./reel-sub-fast.mp4&ui=ig&fit=crop&zone=1&frame=1&t=<sec>" \
  .work/qa/s<n>.png
```

One shot per scene at the reveal-complete moment, then read the PNGs. **QA runs on the final burn-in (`reel-sub-fast.mp4`)** — that's the file
that ships, and the speed pass — 1.2x by default — may make a previously readable subtitle
disappear. The
clean one has no subtitles, so you can't see clipping or intrusion, and the burned-in one is
what actually goes to IG. Check: action bar (x≈890) intrusion / subtitle centering / hero
number clipping / can you tell the topic from the first frame alone / **whether the background
photo shows through the middle of the frame** (a box or dim outside the bands is the slide
look — a violation of absolute rule 14). On a problem: fix the template → regenerate
frame.html → recapture only that state → rebuild.

### 9. Write the per-platform text

**Don't write the first sentence straight away — jot down 3 or 4 entry points first** —
something that happened, a number, a question turned back, a described scene. Write without
doing that and the model converges on the safest opening every time, so the copy passes the
gate episode after episode while the channel feed sounds like one voice throughout. The
evidence grade is low (an English-language creative-writing preprint, 1.6–2.1× diversity —
`korean-style.md` §Evidence grades).

Read the platform-guide playbook
(`../platform-guide/references/platform-playbook.md`) and rewrite per platform — Threads 1–3
lines of casual (반말) spoken register + the video link on the last line / an IG caption with
a hook in the first 125 characters and a save CTA / an FB structured body plus the first-comment
link copy / a YT keyword title, description, and #Shorts hashtag. **The provocation in the
title and first line continues the cover `hookType` in scenes.js** (fear, empathy, curiosity,
showing the ending first) — a video that opened on fear under a YT title explaining a method
sets an expectation the first 30 seconds don't meet (playbook §1 ②·§6). **Threads doesn't get
a cover image attached** — the link preview card takes that spot, so `post.md` holds the body
and the link URL only. The link slot is the IG reels permalink, whose value isn't known until
publish time — leave a placeholder like `<IG_REELS_URL>` in `post.md` and let publish fill in
the real URL. Save each under `output/<platform>/`, and finalize the video and cover with
`cp .work/reel-fast.mp4 output/video/video.mp4` ·
`cp .work/reel-sub-fast.mp4 output/video/video-sub.mp4` ·
`cp .work/subs-fast.srt output/video/subs.srt` · `cp .work/cover.jpg output/video/cover.jpg` ·
`cp .work/build-report.txt output/video/` (from here on, publish looks at `output/` only).
**The `-fast` files are the deliverables** (§7.5) — copy `reel.mp4` or `subs.srt` here and the
episode ships un-sped with subtitles on the wrong timeline. On a long-form episode the chapter
file goes over under its published name too: `cp .work/chapters-fast.txt output/video/chapters.txt`
(publish reads `output/video/chapters.txt`, so leaving the build's original there ships the
pre-speed timestamps).
**Publishing is complete only with all three files** — the clean version and the subtitle file
go to YouTube and Facebook, the burned-in version to Instagram. Miss one and the subtitles
disappear on that platform.

#### Multi-language subtitles (only when the profile lists them)

Extra `.srt` tracks beyond the channel language, and how the platforms take them:
[optional-lanes.md](references/optional-lanes.md) §From §9. **A profile with one language
skips this.**
### 10. Quality gate + completion report

Delegate artifact verification to the content-reviewer agent (Agent) — hand over video frame
screenshots (**taken from the sped-up burn-in `reel-sub-fast.mp4`** — the clean one has no subtitles, so
typos and clipping aren't visible), the per-platform copy, and scenes.js, and get back P0
detections (typos, clipping, factual mismatch, platform taboos, copy-pasted sentences,
unexplained jargon, AI tells) and axis scores. Pass the `check-style.py` path along with the
exit codes and quote-exemption counts from §5 and §9 in the delegation prompt — the reviewer
treats those numbers as the source of truth and doesn't override them with its own impression.
If the channel skips research, state that in the delegation prompt too (the reviewer converts
the facts axis to full marks).
**Fix until the tail (`CONTENT_REVIEW:`) shows copy ≥95 and P0=0 (max 3 rounds)** — if it
falls short, report the unresolved findings to the user as they are and let them decide.

**First-3-seconds check** (2026-08-15 — forced by the measured skip rates. The author does this
directly, separately from the reviewer delegation):

- [ ] Actually **watch** the 0–3s opening — is there a real subject or movement in the first
      frame, or is a single title card holding three seconds still
- [ ] Actually **listen** to the first segment's TTS — if it sounds like a robot reading,
      regenerate that segment alone (the number one cause of drop-off on faceless content is
      the opening voice quality. A skip happens within 3 seconds, so the first sentence's voice
      is the hook)

**Cost totals (required)** — turn the episode ledger into a report and put the result in the
completion report. Storyboard images through this video sit in one file, so this is where a
person sees what the episode cost, first and last. Run it the same way on the shooting-edit
(screencast) path — generation calls are rare there and the total may be near 0, but 0 being
the counted result is itself information.

```bash
REF=${CLAUDE_PLUGIN_ROOT}/skills/autoproduce/references
$REF/cost-report.sh .work/cost-tally.tsv > output/video/cost-report.txt; echo "cost_exit=$?"
cat output/video/cost-report.txt
```

**Check the hand-written tally against what the server recorded first.** The MCP server writes
`.work/events.jsonl` on every generation call by itself, so it catches the lines a session
ending mid-run never got to write.

```bash
node $REF/events-to-tally.js .        # exit 1 = the tally is short
node $REF/events-to-tally.js . --tsv >> .work/cost-tally.tsv   # append what was missing
```

ElevenLabs and Lyria RealTime come back unpriced there on purpose — the server can't see the
metered character count or an unpublished unit price, so those stay hand-written.

Read `cost_exit` as it is (the verdict's source of truth is
[cost-tally.md](../autoproduce/references/cost-tally.md) §Reading exit codes).

- **0** — the total is that episode's cost.
- **1** — copy the `!!` lines into the report verbatim. On `unknown key`, fix the key name and
  rerun; on `price unconfirmed` (currently just BGM), append **"1 item excluded from the
  total"** after the total. **Never read 1 as a pass.**
- **3** — there's no ledger. Confirm that this episode really made no generation calls, and if
  it did, count the files, backfill the ledger, and say in the report that you backfilled it.

The report shows **the stage together with the item** — what the user wants to know isn't only
the total but where it went. The `storyboard:` / `produce:` prefixes in the ledger memos make
that split.

```
Cost — what this episode ran to (storyboard → video)
  storyboard   6 images (gpt high 2 · local 4)              $0.44
    · of which 1 regenerated (§5.5 review)                   $0.22
  produce      b-roll veo lite 1080p, 8s generated          $0.64
               narration 1,840 chars (local)                $0.00
               BGM 90s                                      excluded — unit price unconfirmed
  ────────────────────────────────────────────────────────────
  total                                                     $1.08  (+ 1 item excluded)
  full report: output/video/cost-report.txt
```

**Don't just report a total of $0.** If the images exist and the total is 0, they weren't made
for free — someone skipped writing them into the ledger. An episode that used only local
images and local TTS really can be 0, and then the report shows those lines — check whether
the 0 comes from lines that are there or lines that are missing, then report it.

**Read the decision log back beside the cost.** The two answer one question together — what it
cost, and why it cost that.

```bash
$REF/decisions.sh .work/decisions.tsv        # exit 1 means a bad line, not "no decisions"
```

Put the lines whose choice differs from the storyboard's plan into the report — every
`fallback`, and any `engine_selection` or `voice_selection` marked `revised`. Those are the
places the finished video isn't what was approved, and the user should read that here rather
than notice it in the video.

On a pass, update storyboard.md to `status: produced`, present the artifact table (paths,
length, platforms) together with the cost summary, and point the user at
`/social-flow:publish`.

## Additional Resources

### Reference Files

- **`references/pipeline.md`** — build contract · report gate verdict table · the three TTS failure modes · palindrome loop · collected field-tested pitfalls
- **`references/screencast-pipeline.md`** — the shooting-edit path: edit.json contract · edit procedure · gates · pitfalls (replaces §2–7 when alignment.json exists)
- **`references/build-screencast.sh`** — the shooting-edit builder (scene cut → crop → 9:16 composite → subtitle burn-in → BGM ducking → outro, drift 0)
- **`references/cut-screencast.sh`** — the screencast-splice cutter (§3.7): one window of a screen recording → focus crop → fit onto the canvas over `THEME.ink`, warning when the picture shrinks past legibility or the clip outruns its card. One card inside an ordinary episode, not a whole-episode mode
- **`references/screencast-overlay.html`** — scene title alpha overlay renderer (top block y 190–460, scenes.js injected)
- **`references/video-template.html`** — 1080×1920 scene renderer (THEME injection · reveal · alpha · safe zone · overflow guard)
- **`references/build-reel.sh`** — the compositing pipeline SoT (silence trim → loudnorm → boundary detection → reveal xfade → Ken Burns → subtitles → outro splice)
- **`references/bgm-bed.sh`** — renders the music bed the mix lays under the voice: every cue measured and gained to one distance under the narration, a short cue crossfaded onto itself instead of butt-joined, cue changes crossfaded. Called by both builders and by the b-roll premix
- **`references/bgm-scoring.md`** — where the bed's numbers come from, which of them are published listening tests and which are our own practice, and the widely-quoted figures that failed verification
- **`references/build-outro.sh`** — generates the channel's shared outro
- **`references/speedup.sh`** — the required final pace pass (§7.5). Uses the channel's factor (1.2 default) while leaving the outro at 1.0x, retimes `subs.srt` and `chapters.txt`, verifies the measured length, and blocks a final speech rate over 6.2 characters/s. Reads the pre-pass set and writes `-fast` names, so it never stacks
- **`references/check-final-speech-rate.py`** — measures Unicode letters and numbers on `subs-fast.srt`; catches a whole-video speed factor that made otherwise valid cards too dense to follow
- **`references/splice-clip.sh`** — post-build clip insertion (b-roll up to 2 slots · series stinger). Takes several `<clip> <T>` pairs and splices them in **a single run** (split it into two calls and the first splice is erased), handles clean and burned-in separately, shifts each subtitle cue by the sum of the measured lengths of the insertions before it, and checks for cues straddling T and for matching lengths
- **`references/capture-frames.sh` / `capture-reveals.sh`** — headless capture (state count derived automatically)
- **`references/render-motion-slide.mjs`** — motion-slide renderer (§3.6): one clip per reveal group, headless Chrome over the DevTools pipe with no npm dependency, every frame seeked to an exact time so a re-render is byte-identical; `--sheet` writes the frames storyboard §5.6's design gate reads. It renders **every authored screen** — diagram, kinetic type, character act — since all it asks a page for is the seek contract
- **`references/reveal-timing.py`** — reveal timing derived backwards from the narration's pauses
- **`references/frame-persona-clip.py`** — unifies speaking-clip framing + palindrome
- **`references/reel-qa.html`** — the phone-mode QA harness (IG/YT UI mockups · crop reproduction · safe-zone guides)
- **`../autoproduce/references/events-to-tally.js`** — compares `.work/cost-tally.tsv` against `.work/events.jsonl` (the record the MCP server writes on every generation call) and prints the missing lines with `--tsv`
- **`../autoproduce/references/episode-state.js`** — the resume check: stage, next command, and the blockers that stall an episode silently (missing footage, unauthored slides, images the scenes name that aren't on disk)
- **`../autoproduce/references/decision-log.md`** — the episode decision log (`.work/decisions.tsv`) storyboard starts and produce carries on: engine, voice, music and every fallback, with what each one replaced. `decisions.sh` reads it back for the §10 report
- **`../autoproduce/references/cost-tally.md`** — the episode cost ledger convention (the file §3 and §5 write and §10 totals). The price source of truth `prices.tsv` and the calculator `cost-report.sh` sit in the same directory
- **`../channel/references/resolve-asset.py`** — looks up the shared outro, BGM, sound effects, and character sheet (catalog + default path + the old `assets/outro.mp4`)
