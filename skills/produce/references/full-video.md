# Full-video spatial explainer

## Contents

- [Entry and scope](#entry-and-scope)
- [Reference style](#reference-style)
- [Shot plan and prompts](#shot-plan-and-prompts)
- [Generation and cost](#generation-and-cost)
- [Visual review](#visual-review)
- [Build handoff](#build-handoff)

## Entry and scope

Use only for an explicitly approved `window.PRODUCTION.mode:'full_video'`. Read
storyboard's production choice contract directly from its SKILL.md. This branch replaces
hybrid's 1–2 generated-shot cap, HTML-only explanation routing, person-required source images,
and generic photo style with the explicitly selected episode treatment. It does not change
facts, voice, language, narration approval, budget or publishing approval.

Every new scene, including cover and closing message, uses `visual.video` with separate
narration. Preserve user recordings and the shared outro. Do not splice silent b-roll into
the narration timeline. Do not substitute a camera move over a still or an HTML capture for
a failed generated clip. Missing capability or exhausted budget means hold and revise with
the user, not an invisible downgrade.

## Reference style

Follow [visual-style.md](../../storyboard/references/visual-style.md) and the episode HITL choice.
Only cinematic-miniature scenes use the bundled `tactile-miniature-v1` pack.
Photoreal and webtoon use their own prompt treatment and must not attach miniature references. Read
[STYLE.md](../../storyboard/assets/styles/tactile-miniature-v1/STYLE.md) and select
`visual.styleRole` for each scene: environment, character, interaction, transport, or
reported_story. Store `PRODUCTION.style.referencePack: "tactile-miniature-v1"`.
The pack ships actual PNG references and material, lighting, framing and content rules;
it does not depend on this machine's episode data or access to the reference video.
Authentic archival assets retain their source appearance and never inherit generated style.

`spatial-prompts.js` resolves the installed pack and emits `sourceReferenceImages`,
`sourceImageArgs`, `styleGuidePath` and `styleBinding` alongside prompts. Open the guide and
selected images, then pass the actual `sourceImageArgs.referenced_image_paths` to the built-in
image tool with the prompt. Store `styleBinding` as `visual.stylePack`; regenerate the quote
after storing it. Absolute image paths are invocation-only and are resolved again on each
machine. Add an approved character reference when continuity needs it. End-image edits use
the scene's generated start image, not the generic pack as a replacement scene.

Plan the spoken actor/action/recipient before applying the look. A style match cannot excuse
an unrelated image. After each narration edit, re-read the affected visual plan and image;
reuse only after observing that the meaning still matches. Record content findings separately
from technical and style findings before any paid image-to-video call.

The reference is https://www.youtube.com/shorts/LQZjvQ5W2ck. Observed frames show architectural
miniatures, detailed rocky locations, cutaway models and archival pictures; architecture
lifts out of a valley and the camera advances between buildings. The source does not disclose
its exact generator. These are authored reconstruction instructions, not its recovered prompts.

- Keep a topic-specific **world bible**: geometry, named landmarks, materials, palette,
  lighting and camera language. Related shots share `worldId`; edit or reuse their source
  images instead of independently inventing a new layout every time.
- `miniature`: off-white exhibition models, recognizable articulated objects, restrained
  trees, soft contact shadows. Buildings have windows, thickness and a plausible foundation.
- `architectural`: readable cutaway layers and connected parts with physical thickness.
  No label boxes standing in for physical things.
- `realistic`: detailed natural surfaces and plausible scale. Reference actual geography;
  a generated reconstruction is not documentary evidence of an event.
- `archive`: supplied/source-verified art or photos. Preserve authentic marks and details;
  do not invent a historical artwork. Generated motion cannot alter evidence-bearing content.
- Choose a look to explain the sentence, not by cycling four presets. The focal object stays
  legible on a phone. Moderate depth of field preserves the mechanism; avoid waxy surfaces,
  floating objects, harsh plastic shine, unstable windows or generic empty studio backgrounds.
- One physical action or spatial reveal per short shot: lift a building, expose a rock layer,
  let water pass, or approach a bridge. Write opening state → action → final state.
  For actions, use anticipation/contact/release where applicable. Camera motion alone may
  reveal a place but cannot replace a promised change in the subject.
- Keep the no-marks-over-video rule: no added arrows, X marks, rings, labels, badges or titles.
  Burned subtitles are the only overlay. Explain with object movement and framing. Numeric
  comparisons still require source values and must preserve the actual count/proportion;
  if a generator cannot do that accurately, stop and propose a revised cut or mode.

## Shot plan and prompts

Retain each scene's real `shot.infoType` and `shot.render.purpose`. In full-video mode its
`render.mode` is `generated_video` even for a mechanism or a place; do not relabel every
purpose as `live_action` to dodge semantic checks. Supply `render.reason`, `render.action`,
`visual.why`, four `visual.camera` slots and `visual.action`. A statistic/timeline also keeps
the source-backed `render.data` contract. Each generated scene carries:

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
    after: 'The continuous stream and rocky valley floor are fully visible.',
    camera: 'A fixed elevated three-quarter view holds the valley in the centre.',
    continuity: 'The mountain silhouette, stream route and existing trees remain fixed.',
    reject: 'Reject bending buildings, changing window counts, drifting terrain or obscured water.'
  }
}
```

Write generator-facing design/style fields in English. The `reject` field is for review;
it is not sent as a negative-only instruction to Seedance. Produce reproducible prompts:

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/storyboard/references/spatial-prompts.js storyboard/ --shot 1
```

Store `sourcePrompt` as `visual.bgPrompt` and `motionPrompt` as `visual.video.prompt` before
the final estimate and approval. The helper is read-only. It incorporates the episode style,
subject action, ending and positive geometry lock. The video prompt directs motion without
redescribing the source or inventing a second camera move. Duration is an API parameter.
If a fixed-camera change benefits from an end frame, edit the same source using
`endFramePrompt`, keep that file, and set `visual.video.lastImagePath`; the router forwards it.
Do not impose a fixed-camera end frame on a travelling-camera shot.

### Subject motion contract

Every full-video `videoDesign.motion` declares `kind`, `subject` and `visibleChange`.
Use `subject_action` for acted people, interactions and changing objects. Add at least two
ordered `beats: [{at, state}]` within the clip duration: what the subject visibly does at
those seconds, not camera positions. Choose a simple action with a visible result that fits
the narration. Preserve identity and materials while allowing pose, expression and position
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

## Generation and cost

1. Run `check-scenes.js storyboard/`, then
   `node ${CLAUDE_PLUGIN_ROOT}/skills/produce/references/check-production.js storyboard/ --selection`.
   Missing/stale approval or an estimate above the approved cap blocks all assets.
2. Generate and inspect source images at high quality. With `imageProvider:'host'`, use the
   product-provided image tool and its included allowance. If unavailable, ask before any
   separately billed image API. Keep originals under storyboard/images/. Inspect silhouette,
   topology, scale, materials and continuity before spending on motion.
3. Generate narration before final video calls to measure the required playback duration.
   Fit it within the approved shot duration and provider limit. If it needs a longer shot,
   split/replan and re-quote before generation; never stretch the clip with a loop or freeze.
4. Before **each** video call, including retries, run:
   `node ${CLAUDE_PLUGIN_ROOT}/skills/produce/references/check-production.js storyboard/ --before-call N`.
   Pass the exact `generation` arguments from `cost-preview.js --json`, resolved local
   `imagePath`, optional `lastImagePath`, and stored prompt to `mcp__social-flow__seedance_img2video`.
   The baseline is Seedance 1.5 Pro, explicit 1080p, `generateAudio:false`. Keep spoken narration
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

## Build handoff

Run `check-production.js storyboard/ --ready` before capture/build. Generate no HTML scene
captures for these cuts. Write cards with `zoom=none`; every narration segment names the same
accepted video path, without `@`, `::overlay.png`, palindrome files or still-image substitutes.
The builder reads continuous video offsets across segments, disables loops and freeze padding,
and refuses an audio-driven card longer than its clip. Prefer `enter=cut` between distinct
shots. Keep narration and burned subtitles; clear on-screen `title`, `bullets`, `stat` and
`footnote`, storing thumbnail/title copy in platform metadata instead.

`build-reel.sh` reruns the approved-quote, review and manifest gates. The normal build report,
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
