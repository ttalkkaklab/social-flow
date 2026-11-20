---
name: generate-cut-videos
description: >
  Writes each generated_video shot's video prompt, then makes its video after the user approves that shot (or every shot); stops before assembly. Use when videos are requested or the episode order reaches them.
argument-hint: "[episode-or-storyboard-path]"
allowed-tools: ["Read", "Write", "Edit", "Bash", "Agent", "AskUserQuestion", "mcp__social-flow__shot_prompt", "mcp__plugin_social-flow_social-flow__shot_prompt", "mcp__social-flow__storyboard_read", "mcp__plugin_social-flow_social-flow__storyboard_read", "mcp__social-flow__video_catalog", "mcp__plugin_social-flow_social-flow__video_catalog", "mcp__social-flow__video_plan", "mcp__plugin_social-flow_social-flow__video_plan", "mcp__social-flow__video_approve", "mcp__plugin_social-flow_social-flow__video_approve", "mcp__social-flow__video_execute", "mcp__plugin_social-flow_social-flow__video_execute", "mcp__social-flow__video_status", "mcp__plugin_social-flow_social-flow__video_status", "mcp__social-flow__speech_manage", "mcp__plugin_social-flow_social-flow__speech_manage", "mcp__social-flow__production_workflow", "mcp__plugin_social-flow_social-flow__production_workflow"]
---

# Generate Cut Videos

Steps 7–8 of [the production order](../_shared/production-workflow.md) (user directive
2026-10-31). Read [video model selection](../produce/references/video-model-selection.md)
and [duration planning](../produce/references/video-duration.md).

For dialogue, read [dialogue coverage](../storyboard/references/dialogue-coverage.md)
before writing prompts. Confirm the visible speaking face and silent foreground listener
in OTS; each clip has at most one speaking character, even in a readable two-shot.
Split speaker changes and set each resulting shot's size and angle before images.
Choose the attention subject independently of the speaker using the dialogue coverage
guide: intentional off_screen physical speech may accompany a hand insert, listener
reaction or spatial view. Keep its voice ownership without adding a speaking face;
screen-position bindings describe on_screen speakers only.
If coverage is wrong, return to the earlier authoring/image stages rather than patching
the prompt alone. Preserve the single MSR speaker's binding and selected voice.
Dialogue-free cuts use image2video with `frames.mode:"first"`. On LTX, request natural
ambience and action-timed effects. Use `generateAudio:false` when the edit supplies the
sound separately, and carry those cues into assembly. Thoughts use image2video with
`generateAudio:false` and character `voiceover`: generate and attach pinned
TTS, compose measured speech/action intervals and lead-in/tail-out, then plan the full
video duration. Keep mouths closed and assembly on `sound.audioSource:"speech"`.
If speech is disabled, report missing TTS setup rather than sending thoughts to MSR.
See [shot speech](../produce/references/shot-speech.md).

**Prompt.** After every picture shot has its images, write each `generated_video` shot's
prompt with `shot_prompt`. Give `action` (what moves from the opening picture), `end` (the
closing picture) and `sound` in English; the tool builds the rest from the shot's icon
attributes — camera move and speed, focus, and on an MSR shot its size, angle and depth —
and quotes its on-screen lines. It also names each character's `expression` from
`shot_characters` and asks the model to hold it to the last frame (user directive 2026-11-16).
Write `action` as visible behaviour that fits that state, name a change of expression as one
step of it, and say in `end` how the face looks when the shot closes. After generation watch
the last second: a mouth drifting back to a smile is a failed clip. MSR's lines and image bindings are added by `video_plan`.
On a speaking shot, do not close `action` or `end` on waiting or listening for an answer
unless that reaction is in the shot's performance with its seconds: the model plays it as
silence after the line, and the next shot already carries the reaction. The closing face is
a state, not extra time.
The tool records what the prompt came from; when the shot's characters, on-screen lines,
frame plan, camera, focus or MSR framing change later, the stage tools warn and the review
page marks the prompt stale. Rewrite it with `shot_prompt` before planning that shot.
MSR submits the composed opening image as a background reference; it does not pin that
image to frame zero. Do not promise exact framing from that input alone. If the actual
result repeatedly changes a required locked setup or duplicates a referenced person,
explain the limitation and prepare a scoped first-frame-conditioned alternative. Preserve
the saved model and resolution unless the user authorizes a change, and keep attempt limits.

Keep audience-only cues in `sound.effects[].audience` for post. Write scene sounds in `shot_prompt.sound` and keep the input voice track free of audience cues.

**Approval.** Plan each shot with `video_plan` (it sends the stored prompt when args name
none, and on MSR the start image rides in the background slot). Before `video_execute`,
show the user that shot's prompt, start (and end) image and cost, and ask: approve this
shot, approve every shot from now on, or change something. Record a yes with
`video_approve {planIds:[…]}` and an approve-all with `video_approve {auto:true}`, each
with the user's own words. Never call `video_approve` without their answer; `video_execute`
refuses a plan without one (`video_approval_required`). A changed prompt, image or model is
a new plan and needs a new yes unless auto is on; `video_approve` refuses a plan that went
stale before the yes (`video_plan_stale`), so plan it again and show the new one. It also
writes `storyboard/video-approvals.js`, so the review page marks each shot approved, awaiting
approval, or changed (prompt, start/end image or lines) after its yes. `render-astra-shot.js` runs only after the same yes.

**Length.** `video_plan` returns `speechFit` on a natively voiced shot. When it carries a
warning, the request is longer than the lines and timed actions need and the model will fill
the difference with silent acting. Plan the shortest covering request it names, or put the
pause the story needs into the performance; an explicit `duration` or `numFrames` copied
from another shot is the usual cause.

**Generate.** Run `video_execute` within the saved models and existing budgets; use
`video_status` after an interruption. Import usable existing clips instead of regenerating.
For a requested correction, reconcile the opening image, camera endpoints, performance,
line acting and prompt before replanning. Remove the superseded action from all of them:
an empty-handed report must not retain equipment handling, and a distant recognition
must not retain a call-and-response. Repeated camera setups keep their position, lens,
background scale and screen sides. Name each visible person's appearance, position and
speaking turn; reference panels identify one person, not additional cast members.
Trace an exit through visible free space in the opening image before choosing a screen
edge. A character cannot leave through a wall merely because the prompt says "exit left".
Inspect the entire departure interval, including the edge crossing; correct identity
does not establish a valid walking path.
After generation, inspect whether those particular corrections appear in the actual clip.
A successful receipt or an attached player does not establish correct blocking. Preserve
failed versions and distinguish generated, connected and visually verified results.
Bind dialogue-free clips with generated effects through `speech_manage attach_video`.
It selects the clip's sound on continuous sync edits and preserves the authored shot
length. On moving joins or layered edits, carry the effects into the separate mix.
Check for missing effects or unwanted voices in playback.
Bind a clip with on-screen dialogue through `speech_manage attach_video`; an MSR clip binds
as `native`, with no line audio (shot-speech.md adapter layer). Its result's `soundtrack`
says where the line sits in the clip; when it suggests a trim, listen to the clip and set
`edit.in`/`edit.out` and the shot `duration` with `storyboard_apply` instead of regenerating
or cutting a copy of the file. Before reporting that the
storyboard is connected, open the user's review page and verify that every completed
shot has a video player whose metadata loads without a media error. File existence and
`visual.video.clip` alone do not prove the page displays it. The bundled template previews
that bound source when `productionPlan.cuts` is absent; an explicit cut list takes priority.
Refresh an older review shell from the bundled template instead of inventing edit cuts
just to expose a source clip. Look at each clip before
assembly. Stop before assembly; review-cut-videos runs only when the user asks.

For the shot's actual request and prior takes, read `video_status {episode}` or
`storyboard_read.videoProduction`. Prefer omitting `args.prompt`: `shot_prompt` and
`speech_manage plan_video` share the camera/performance compiler. Keep unresolved native
speech timing explicit. Reference `preserve`/`avoid` instructions remain attached to their
image slots. A new take may carry `purpose`, `basedOnRequestId` and `changeNote`; use a
unique filename. Draft/final labels do not authorize a resolution or model switch.
Offer low-resolution drafts only when they help test an uncertain shot; reuse completed
footage and existing authorization. Refresh the shared board to compare candidates,
then use the existing attachment path. Never treat generation completion as review.
