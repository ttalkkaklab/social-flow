# Full video — every new scene as a generated clip

## Contents

- [Entry and scope](#entry-and-scope)
- [Episode style and looks](#episode-style-and-looks)
- [Cinematic-miniature reference](#cinematic-miniature-reference)
- [Shot plan and prompts](#shot-plan-and-prompts)
  - [Subject motion contract](#subject-motion-contract)
  - [Shot progression](#shot-progression)
- [Generation and cost](#generation-and-cost)
- [Visual review](#visual-review)
- [Build handoff](#build-handoff)
- [Revised storyboard attempts](#revised-storyboard-attempts)

## Entry and scope

Use only for an explicitly approved `window.PRODUCTION.mode:'full_video'`
([production-mode.md](../../storyboard/references/production-mode.md)). This branch replaces
hybrid's 1–2 generated-shot cap, HTML-only explanation routing, person-required source images
and generic photo style with the episode's selected style. It does not change facts, voice,
language, narration approval, budget or publishing approval.

Every new scene, including cover and closing message, uses `visual.video` with separate
narration. Preserve user recordings and the shared outro. Do not splice silent b-roll into
the narration timeline. Do not substitute a camera move over a still or an HTML capture for
a failed generated clip. Missing capability or exhausted budget means hold and revise with
the user, not an invisible downgrade.

## Episode style and looks

The style was chosen before authoring ([visual-style.md](../../storyboard/references/visual-style.md))
and lives in `PRODUCTION.style`. Every source image, end frame and motion prompt carries it,
and `production-mode.js` rejects a shot whose look is outside its preset.

| `style.preset` | `videoDesign.look` | Appearance references |
|---|---|---|
| `cinematic-miniature` | `miniature`, `architectural` | the bundled `tactile-miniature-v1` pack, one image per `visual.styleRole` |
| `photoreal` | `realistic` | approved character images from this episode; no pack |
| `webtoon` | `webtoon` | approved character images from this episode; no pack |
| `claymation` | `clay` | approved character images from this episode; no pack |
| `paper-cutout` | `papercut` | approved character images from this episode; no pack |
| `ink-wash` | `inkwash` | approved character images from this episode; no pack |
| `toon-3d` | `toon3d` | approved character images from this episode; no pack |
| `arcade-2d` | `arcade` | approved character images from this episode; no pack |
| any preset | `archive` | the supplied source itself; no generated appearance reference |

`style.reference` records where the look comes from: a URL for the miniature reference, a
one-line description otherwise. `world`, `materials`, `palette` and `lighting` are the world
bible the source prompt restates on every shot. `camera` is the episode's camera language
(lens, distance, pace); it rides inside every motion prompt's consistency lock, so all clips
are drawn with one lens. Archival assets keep their source appearance.

For cinematic-miniature, read [STYLE.md](../../storyboard/assets/styles/tactile-miniature-v1/STYLE.md),
select `visual.styleRole` (environment, character, interaction, transport, reported_story)
by the narrated subject, and store `PRODUCTION.style.referencePack: "tactile-miniature-v1"`.
`spatial-prompts.js` resolves the installed pack and returns `sourceReferenceImages`,
`sourceImageArgs`, `styleGuidePath` and `styleBinding` beside the prompts. Open the guide and
the selected image, then pass `sourceImageArgs.referenced_image_paths` to the image tool with
the prompt. Store `styleBinding` as `visual.stylePack` and regenerate the quote after storing
it. Absolute image paths are invocation-only and are resolved again on each machine. Add an
approved character reference when continuity needs it. End-image edits use the scene's
generated start image, never the pack image as a replacement scene.

Plan the spoken actor, action and recipient before applying the look. A style match cannot
excuse an unrelated image. After each narration edit, re-read the affected plan and image;
reuse only after observing that the meaning still matches. Record content findings separately
from technical and style findings before any paid image-to-video call.

## Cinematic-miniature reference

The reference is https://www.youtube.com/shorts/LQZjvQ5W2ck. Observed frames show architectural
miniatures, detailed rocky locations, cutaway models and archival pictures; architecture
lifts out of a valley and the camera advances between buildings. The source does not disclose
its generator. These are authored reconstruction instructions, not recovered prompts.

- Keep a topic-specific **world bible**: geometry, named landmarks, materials, palette,
  lighting and camera language. Related shots share `worldId`; edit or reuse their source
  images instead of inventing a new layout every time.
- `miniature`: off-white exhibition models, recognizable articulated objects, restrained
  trees, soft contact shadows. Buildings have windows, thickness and a plausible foundation.
- `architectural`: readable cutaway layers and connected parts with physical thickness.
  Physical things are modelled; a label box never stands in for one.
- `archive`: supplied or source-verified art or photos. Preserve authentic marks and details;
  do not invent a historical artwork. Generated motion cannot alter evidence-bearing content.
- Choose a look to explain the sentence, not by cycling presets. The focal object stays
  legible on a phone. Moderate depth of field preserves the mechanism; waxy surfaces, floating
  objects, harsh plastic shine, unstable windows and empty studio backgrounds are defects.
- One physical action or spatial reveal per short shot: lift a building, expose a rock layer,
  let water pass, or approach a bridge. Write opening state → action → final state, with
  anticipation, contact and release where an actor is involved. Camera motion alone may
  reveal a place; it cannot replace a promised change in the subject.
- The no-marks-over-video rule holds: no added arrows, X marks, rings, labels, badges or
  titles. Burned subtitles are the only overlay. Explain with object movement and framing.
  Numeric comparisons still require source values and the actual count or proportion; if a
  generator cannot draw that accurately, stop and propose a revised cut or mode.

The `realistic` look (photoreal), the `webtoon` look and the five prompt-only looks (`clay`,
`papercut`, `inkwash`, `toon3d`, `arcade`) follow the same world-bible and one-action rules, with the
treatment text `production-mode.js` holds for their preset. Ink-wash and claymation clips hold
only slow motion (visual-style.md); plan the acted cut as a still with a camera move when the
action is large. Arcade clips keep a static or sideways-panning camera and no HUD (visual-style.md).

## Shot plan and prompts

Retain each scene's real `shot.infoType` and `shot.render.purpose`. In full-video mode its
`render.mode` is `generated_video` even for a mechanism or a place; do not relabel every
purpose as `live_action` to dodge semantic checks. Supply `render.reason`, `render.action`,
`visual.why`, `visual.action` and the four `visual.camera` slots (scenes-schema §camera). A
statistic or timeline also keeps the source-backed `render.data` contract. Each generated
scene carries:

```js
shot: {
  infoType: 'principle',
  render: { mode: 'generated_video', purpose: 'physical_state',
    reason: 'Removing the buildings exposes the obstructed stream.',
    action: 'The buildings rise vertically and reveal the valley.' },
  videoDesign: {
    look: 'miniature', worldId: 'valley-a',
    motion: {
      kind: 'subject_action', subject: 'The apartment blocks',
      visibleChange: 'The blocks rise away and uncover the stream.',
      beats: [{ at: 0, state: 'Blocks rest on the valley floor.' },
              { at: 4, state: 'Blocks clear the stream and expose the riverbed.' }]
    },
    before: 'Apartment blocks surround the rocky stream in a mountain valley.',
    action: 'The complete building blocks rise vertically and leave the frame.',
    continuity: 'The mountain silhouette, stream route and existing trees stay fixed.',
    reject: 'Reject bending buildings, changing window counts, drifting terrain or obscured water.'
  }
},
visual: {
  camera: { framing: 'elevated three-quarter view of the whole valley', movement: 'static',
            end: 'the exposed stream centred' },   // a static camera has no speed to state
  why: 'The removal is a continuous physical change no still can show.',
  action: 'The blocks lift clear of the stream.'
}
```

One camera contract per shot: the four `visual.camera` slots, in vendor vocabulary; on a
static camera `speed` stays empty and the span reads `static camera`. `videoDesign.camera` is
retired and rejected. The final state is written once: on a `subject_action` shot it is the
last motion beat, so `after` is optional there and must repeat that beat exactly when written;
a `spatial_reveal` or `archive_hold` shot states it in `after`. Write generator-facing design
and style fields in English. The `reject` field is for review; it is never sent as a negative
instruction.

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/storyboard/references/spatial-prompts.js storyboard/ --shot 1
```

The helper is read-only. `sourcePrompt` restates the narrated meaning, the opening state, the
world bible and the framing slot; store it as `visual.bgPrompt`. `motionPrompt` goes through
the same `clipAssemble` recipe as every other clip in this pipeline: the camera span from the
four slots (`framing, speed movement, ending on end`; a static camera has no speed), the
subject action with its beats in words, a consistency lock that carries the look and the
episode camera language, and `Audio: silent`. Store it as `visual.video.prompt`. Before
returning, the helper runs the Seedance prompt gate that `check-scenes.js` runs on every
stored prompt (Korean outside dialogue quotes, a negative directive, a timecode or digit
seconds, a missing lock) and fails with the reason instead of emitting a prompt the board
would then reject. Duration is an API parameter. If a fixed-camera change benefits from an
end frame, edit the same source using `endFramePrompt`, keep that file, and set
`visual.frames.end`; the router forwards it as `lastImagePath`. Do not impose a fixed-camera
end frame on a travelling-camera shot.

### Subject motion contract

Every full-video `videoDesign.motion` declares `kind`, `subject` and `visibleChange`.
Use `subject_action` for acted people, interactions and changing objects. Add at least two
ordered `beats: [{at, state}]` within the clip duration: what the subject visibly does at
those seconds, not camera positions. The last beat is the shot's final state: the end-frame
edit and the motion prompt both end on it, and `production-mode.js` rejects an `after` that
says something else. The seconds stay in the plan for the playback review; the prompt orders
the same beats by description (at first, then, finally) because Seedance takes no clock.
Choose a simple action with a visible result that fits the narration. Preserve identity and materials while allowing pose, expression and position
to change. Miniature is a surface treatment; it does not mean frozen figurines.

Use `spatial_reveal` for a location introduction with a specific newly exposed feature and
an explicit `reason` explaining why camera motion carries the sentence. Use `archive_hold`
only with `look:'archive'` and a `reason` for preserving evidence. Do not relabel an acted
scene as a location to bypass the action requirement. Character and interaction style roles
require subject action. Other roles still require action whenever the narration promises it.

For first/end images, show different stages of the same action. A closer crop of the same
pose does not establish a subject-state change. Put the starting pose before contact and the
end pose after the result; keep intermediate movement simple. Review the pair before paying
for video. Do not invent a historically unsupported act merely to add movement.

Inspect the exact provider prompt before each call, including retries. Do not replace action
with “everyone stays fixed”, “breathing only” or “no new actions” to solve geometry defects.
Reduce the number of actors, simplify contact, shorten/split the shot or revise its source
within the approval contract. Preserve the promised action. A retry that loses that action
is still a failed clip, even if its faces and buildings look better.

### Shot progression

A full-video episode is an edit, not a list of clips. Before generating, read the shot table
as a sequence:

- Change the set-up for a reason. Introduce a place wide, move closer as the narration narrows
  to the part that matters, and return wide when the sentence needs the relationship again.
  `production-mode.js` rejects three consecutive shots with the same `framing` and
  `movement`: a third identical set-up reads as one long take that keeps restarting.
- One move per shot, in vendor vocabulary (`dolly in`, `truck`, `arc shot`, `pedestal up`,
  `static`), chosen from `shot.feel` as scenes-schema §camera describes. The move supports the
  feel; size, angle, the picture and the sound carry it.
- Continuity is a shared `worldId`, a stable `continuity` sentence and the same world bible in
  every prompt. Landmarks, materials and light hold across the cuts; the subject changes.
- Let the cut land on the subject: end a reveal on the thing the next sentence names, so the
  first frame of the next shot answers the last frame of this one.

### Camera dynamics

`production-mode.js` holds these on the four camera slots of every generated shot; ep402
(2026-09-06) and ep411 (2026-09-09) broke each one and read as slideshows.

- **A move the viewer can see.** `movement` and `speed` never carry `very slow`, `subtle`,
  `gentle`, `tiny`, `slight`, `barely`, `restrained`, `quiet`, `hold composition` or
  `breathing only`. A move written to be invisible is a still with extra steps. Write `slow`,
  `steady` or `fast` with a vendor move — `dolly in`, `truck right`, `arc shot`, `pedestal up`,
  `crane down` — or choose `static` on purpose.
- **Static is the minority.** At most one shot in three holds a static camera, never two in a
  row. The subject action carries a static shot; the other two carry the viewer.
- **Wide is the minority.** At most half the shots are framed wide. Small full-body figures
  on a wide stage move a few pixels on a phone; bring the other half to medium or close, where
  a gesture fills the frame.
- **No provider lock under a written move.** `visual.video.cameraFixed:true` is only legal with
  `movement: static`; ep402 shot 12 asked for an optical push and locked the camera at once.
- **Generate at the card length.** The beats end inside `scene.duration`; a 10-second clip for
  a 5-second card spreads the action past the cut. `check-production.js --ready` refuses a clip
  more than three seconds longer than its card unless `edit.in` skips into the action.

## Generation and cost

1. Run `check-scenes.js storyboard/`, then
   `node ${CLAUDE_PLUGIN_ROOT}/skills/produce/references/check-production.js storyboard/ --selection`.
   Missing/stale approval or an estimate above the approved cap blocks all assets.
2. Generate and inspect source images at high quality. With `imageProvider:'host'` (Codex,
   Grok — the storyboard's detection), use the CLI's own `image_gen` / `image_edit` on its
   allowance. If unavailable, ask before any separately billed image API. Keep originals under storyboard/images/. Inspect silhouette,
   topology, scale, materials and continuity before spending on motion.
3. Generate narration before final video calls to measure the required playback duration.
   Fit it within the approved shot duration and provider limit. If it needs a longer shot,
   split/replan and re-quote before generation; never stretch the clip with a loop or freeze.
4. Before **each** video call, including retries, run:
   `node ${CLAUDE_PLUGIN_ROOT}/skills/produce/references/check-production.js storyboard/ --before-call N`.
   Pass the exact `generation` arguments from `cost-preview.js --json`, resolved local
   `imagePath`, optional `lastImagePath`, and stored prompt to `mcp__social-flow__seedance_img2video`.
   Under `videoProvider:'host'` the call is the host `image_to_video` instead (source image,
   stored prompt, `duration`, 720p) and the ledger row is `video.host` for the requested seconds.
   On the API lane the baseline is Seedance 1.5 Pro, explicit 1080p, `generateAudio:false`. Keep spoken narration
   on the channel voice. An upgrade requires a priced plan and approval; never silently escalate.
5. Keep every attempt; set `visual.video.clip` to the chosen file. Append actual billed usage
   to `.work/cost-tally.tsv` immediately, including billed rejects:
   `seedance.1-5-pro-silent.1080p<TAB>5<TAB>video:shot=1:attempt=1`.
   Shot numbers start at 1; an attempt includes the first call. An uncertain bill blocks the
   next call until reconciled. Never erase ledger rows to create room for another attempt.
6. Reuse the same source for retries, adjust the action plan when necessary and re-approve a
   changed plan. Retry only the defective shot. Inspect the whole clip, not its thumbnail.

## Visual review

The quality target is the selected style's spatial clarity and material treatment,
not a promise that a model or a numeric score guarantees it. Every generated clip must have
an actual source-image read, full playback read, and start/middle/end frame reads. Use the
host's permitted media-viewing route. If full playback cannot be inspected, report that
limitation and hold; do not invent a playback review from still frames.

Write `.work/video-review.json` with exactly one accepted record per generated shot:

```json
{
  "shots": [{
    "shot": 1,
    "reviewer": "actual reviewer identifier",
    "at": "actual ISO review time",
    "planDigest": "current shotDigest(win, 0)",
    "sourceSha256": "SHA-256 of the source image bytes",
    "videoSha256": "SHA-256 of the accepted video bytes",
    "playback": true,
    "seeks": [0.1, 2.5, 4.8],
    "composition": "Describe the readable subject and framing observed.",
    "materials": "Describe the actual surfaces, edges and contact shadows.",
    "continuity": "Describe stable landmarks and any comparison to related shots.",
    "action": "Describe the observed opening, physical change and final state.",
    "camera": "Describe observed camera direction, speed and stability.",
    "motionEvidence": {
      "kind": "subject_action",
      "cameraOnly": false,
      "observedChange": "Describe the subject movement actually seen during playback.",
      "beats": [
        {"at": 0.1, "state": "Describe the observed opening subject pose."},
        {"at": 4.8, "state": "Describe the observed changed subject pose or result."}
      ]
    },
    "referenceMatch": "Compare this shot with the approved miniature/cutaway/location treatment.",
    "defects": []
  }]
}
```

These are field descriptions, not review evidence; replace them with observations. Hash helpers
`shotDigest` and `hashFile` are exported by `check-production.js`. Changing the plan, source or
clip invalidates the review. When using `lastImagePath`, also record `endSha256` for that image.
For subject action, compare subject poses and object contact against stable scene landmarks.
Camera zoom, water, light, blinking or cloth flutter cannot substitute for the planned act.
Record `motionEvidence` separately from camera evidence; camera-only motion and unchanged
subject states fail. These fields are human playback observations, not automated proof of
motion. Never fill them from the prompt or mark an unwatched clip accepted.

The gate checks hashes, playback evidence, sample times, unresolved
defects, media resolution and duration. It cannot judge aesthetics: the reviewer must reject
rubbery buildings, popping objects, sliding terrain, action discontinuity, muddy materials,
or a shot that misses the reference style even when its metadata passes.

### Measured motion

The review says a person saw the subject move; `measure-motion.js` says how much of the clip
moves. `check-production.js --ready` measures every accepted clip (cached by SHA-256 in
`.work/motion-metrics.json`) and refuses one that stands still longer than 2 seconds, repeats
the previous picture on more than half its samples, or averages under 1.8 on the proxy scale.
ep402's frozen clips measured 0.85–1.16 with every sample a repeat; ep411's quietest accepted
clips measured 2.15–2.8. The same pass reads where visible motion starts: when the action
begins after the first second and `edit.in` is still 0, set `edit.in` to the onset
([cinematic-edit.md](cinematic-edit.md)) or regenerate. A failed measurement is a failed clip;
regenerate it with a visible subject action or camera move.

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/produce/references/measure-motion.js .work/video/s07-attempt-1.mp4
```

## Build handoff

Run `check-production.js storyboard/ --ready` before capture/build. Generate no HTML scene
captures for these cuts. Write cards with `zoom=none`; every narration segment names the same
accepted video path, without `@`, `::overlay.png`, palindrome files or still-image substitutes.
The builder reads continuous video offsets across segments, disables loops and freeze padding,
and refuses a card whose source cannot cover its duration plus the outgoing live handle.
Follow [cinematic-edit.md](cinematic-edit.md): choose each join by action and continuity,
reserve its handle before quoting generation, and use the common builder for delivery.
Do not blanket-assign `cut` or replace the builder with an episode-specific concatenation script. Keep narration and burned subtitles; clear on-screen `title`, `bullets`, `stat` and
`footnote`, storing thumbnail/title copy in platform metadata instead.

`build-reel.sh` reruns the approved-quote, review and manifest gates, and `verify-assembled.js`
measures every card of the assembled reel with the same proxy: a clip card that reads as a
still, or an authored slide that repeats its picture on most samples or holds one plate past
the channel plate limit (ceiling 8 seconds), stops the build. The normal build report,
speed pass, phone QA and content review still run. Watch the final edit for timing and subject
continuity; an individually accepted clip can still cut badly with its neighbours. A failed
quality check holds the deliverable and queue. Report actual video spend separately from the
approved estimate and all other production costs.

## Revised storyboard attempts

When the user approves a revised storyboard, give it a stable `PRODUCTION.generationRevision`
identifier such as `content-v3` before quoting. Append `revision=content-v3` as a separate token
in each new video's ledger memo. The quote binds this identifier. The retry gate counts that
revision's attempts per shot; all historical rows still count toward the episode dollar cap.
Do not change the revision to bypass a failed shot's retry limit. A new revision requires a
real revised plan and its approval. Keep historical rows and their original shot numbers intact.

Existing generated inputs use [visual.reuse](../../storyboard/references/scenes-schema.md#existing-generated-clip-input-visualreuse). Skip generation steps for those shots and keep their imported-file playback review. Do not create a source image or call a video API for an imported input.
