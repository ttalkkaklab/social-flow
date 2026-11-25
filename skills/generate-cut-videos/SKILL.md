---
name: generate-cut-videos
description: >
  Generates one video per scene from its ordered shots, images and sound. Stops before assembly. Use when videos are requested or the episode order reaches them.
argument-hint: "[episode-or-storyboard-path]"
allowed-tools: ["Read", "Write", "Edit", "Bash", "Agent", "AskUserQuestion", "mcp__social-flow__project_manage", "mcp__plugin_social-flow_social-flow__project_manage", "mcp__social-flow__story_scene", "mcp__plugin_social-flow_social-flow__story_scene", "mcp__social-flow__shot_prompt", "mcp__plugin_social-flow_social-flow__shot_prompt", "mcp__social-flow__storyboard_read", "mcp__plugin_social-flow_social-flow__storyboard_read", "mcp__social-flow__modelark_portrait_register", "mcp__plugin_social-flow_social-flow__modelark_portrait_register", "mcp__social-flow__video_catalog", "mcp__plugin_social-flow_social-flow__video_catalog", "mcp__social-flow__video_plan", "mcp__plugin_social-flow_social-flow__video_plan", "mcp__social-flow__video_approve", "mcp__plugin_social-flow_social-flow__video_approve", "mcp__social-flow__video_execute", "mcp__plugin_social-flow_social-flow__video_execute", "mcp__social-flow__video_status", "mcp__plugin_social-flow_social-flow__video_status", "mcp__social-flow__astra_genai_jobs", "mcp__plugin_social-flow_social-flow__astra_genai_jobs", "mcp__social-flow__speech_manage", "mcp__plugin_social-flow_social-flow__speech_manage", "mcp__social-flow__production_workflow", "mcp__plugin_social-flow_social-flow__production_workflow"]
---

# Generate Cut Videos

Declare everyone who speaks in the story scene. Submit one scene with `video_plan {episode,sceneNo,requestId}`. The planner chooses an operation from the saved model and the authored inputs.

Each generated shot needs a composition image before video planning. The scene opening can cover its first shot. For each later shot, attach `referenceImage` or a start image at the opening frame of its per-shot timeline. The selected operation determines which images the provider receives.

- Use an opening image for a picture with no visible dialogue. Keep off-screen-only speech and narration on the external soundtrack. Declare visual references for silent cast members whose appearance must carry through.
- Use audio-to-video when a finished scene-length recording must drive the performance, regardless of how many people speak on it. Generate a fresh speaking take for a changed line. Post-render lip-sync of synthesized speech to existing footage is forbidden, including after a failed native take or a voice change.
- For authored dialogue in pinned character voices, bind each speaker's sample to their identity. Distilled LTX can combine the opening, an optional ending, up to four subject images and one background. Its first two subjects can carry voice samples in each native render. With authored cuts, the per-shot renderer can change that pair inside one scene job. A one-take exceeding the selected model's capacity needs an authoring decision.
- Seedance 2.0 reference accepts up to nine images and three audio clips in one request. Its opening image guides composition. Veo can generate dialogue when the board explicitly selects `videoDirection.dialogueVoice: "model_generated"`. Its Standard/Fast asset mode accepts up to three images of one subject. The planner reports any required input the selected operation cannot send before approval.

For a character reference shot, set `visual.character` and the camera’s subject and view. The plan binds the sheet face and the front or rear body panel to that character. Use `visual.characterInputs` to specify each principal’s body view when their directions differ. For a reference-voice performance, on-screen and off-screen lines by a principal require the selected voice sample. Check the panel paths and speaker slots before approval.

For Seedance, follow [character portrait registration](../register-seedance-portrait/SKILL.md) before planning a visible face. Inspect the shot, character, asset and numbered slots in `characterBindings`. Keep existing location and prop references in prompt order. If an old card leaves the performer’s view unresolved, fix that card and plan again. For a selected original, supply the character’s `faceTaskId` and a passed cast continuity review in `faceReviewPath`. Follow the [binding and retry rules](../_shared/video-routing.md).


Steps 7–8 of [the production order](../_shared/production-workflow.md) (user directive
2026-10-31). Read [video model selection](../produce/references/video-model-selection.md)
and [duration planning](../produce/references/video-duration.md).

Use the project directory the user named or already selected for this episode. When it is unclear, ask for it and wait. Run `project_manage status` there. Complete [project setup](../project-init/SKILL.md) for the missing fields before starting the scene.

For LTX and Google Cloud Veo, call `video_plan` with the same scene and request ID. The saved model and the storyboard's frames, reference images and speech select the adapter. Set `maxCostUsd` to the authorized per-request reservation ceiling when using the gateway or bounding a hosted quote. See [LTX and Veo inputs](../_shared/video-routing.md#ltx-and-google-cloud-veo).

## Generate one scene

For a visible action that depends on a particular intermediate state, such as a hand releasing a loaded cart, inspect the image and set `story_scene.videoDirection.keyframes` with its storyboard-relative `path` and zero-based scene `frame`. The planner sends these images with the opening, ending and supported voice references in the same generation. Check the outgoing image bindings. A temporal guide conditions the picture at that moment and leaves cut timing to the model. Keep an ordinary shot composition reference untimed unless the image actually depicts a chosen moment.

For a multi-shot MSR scene, put each quoted line in the view where its speaker delivers it. Describe the cut, the next action, and whether dialogue gives way to ambience or effects. The scene planner uses each card’s duration as an approximate hold and distinguishes on-screen voices, off-screen voices and silent reactions. Near the provider’s character limit, it keeps the quotes with their shots and omits optional pacing prose. When a line must finish before a reaction, give it enough time and check its position in the submitted prompt. See the [LTX multi-shot prompting guide](https://docs.ltx.io/open-source-model/usage-guides/prompting-guide) and the [MSR reference mapping](https://huggingface.co/LiconStudio/LTX-2.5-Multiple-Subject-Reference).

For a silent Veo scene, use a start and end time for each view. For Seedance reference mode, associate each cut with the action that triggers it. Keep the speaker and their numbered voice reference beside the line. Seedance 2.0 can drift when given hard timecodes. Check `shot_reference_omitted` for any intermediate view that relies on a composition image. Compare the dialogue, visible reactions and actual cut positions in the returned video. [Google Veo prompting guide](https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-veo-3-1) · [BytePlus Seedance 2.0 prompt guide](https://docs.byteplus.com/en/docs/modelark/seedance-2-0-prompt-guide)

1. Read the scene and its shot cards in playback order with `storyboard_read`. Read the scene's opening and ending images and the image for each shot. Keep every camera setup on its own shot card. Use scene-relative frames for its image pins and incoming cut. An entrance, zoom or camera move during uninterrupted filming stays on that shot.
2. Save `videoDirection` on the scene with `story_scene` (retain its sequence, number, place, time, event and summary). Identify each person from the viewer's perspective by side, depth, posture and a landmark. Link their face and outfit panels to the same cast ID. Describe an off-screen start when appropriate. Use clothing to disambiguate people who share a desk or row. Coordinates and phrases such as “third man” make poor identifiers.
3. Write the emotional change in English. Keep the dialogue on the shot cards in the original language. Keep each shot’s framing and action in its timeline. For example, “He rises behind that same far-right desk and points across the room at Miran.” Read the scene’s `directionDefaults` and each shot’s icon choices. A shot move replaces the scene default for its interval. Use the legacy free-text `videoDirection.camera` only when no catalogue default is set. When a reveal or reaction needs a move, name the cue, direction and landing in one sentence. For example, “When Miran unfolds the letter, the camera tilts down from her face and settles on the torn corner in her hand.” Specify a fixed view when the scene depends on seeing both performances together. Leave coverage open when the cards give the scene no reason to move. Keep audience-only shock effects on the post-production cue track.
4. Call `video_plan {episode, sceneNo, requestId, wholeScene:true}` once per scene. Omit `args.prompt`. Check the actual compiled prompt, input images, speaker and voice assignments, total seconds, resolution and price. Distilled GenAI LTX uses the opening image as the temporal first frame with compatible subject references. For mixed-media scenes, keep editorial inserts on their existing route and plan continuous generated material as its own scene. A larger room or crowd in frame still needs visual review. A blocked plan lists each unsupported input with its shot and frame. Show the list and retain the storyboard. Splitting the generation or changing the input requires a new user choice.
5. Use the existing approval or record the user's approval with `video_approve`, then run `video_execute` once. For a host handoff use the returned frame, prompt and scene duration with the selected host. Resume with `video_status` and the original request ID. The scene header shows the candidate and its actual prompt. Watch the opening second, distance, posture, speaking mouth and reaction through the last line. For a planned move, follow a fixed feature such as a door jamb through the cue and check where the frame lands. Walking actors can cross a locked frame. Report any missed move, missing or swapped person, unexpected cut or incomplete dialogue.
6. Hand the accepted take to assembly once. When editing by shot card, use the observed source intervals from that take. Attaching the whole take separately to every card would repeat the scene.

A scene shares one soundtrack from frame zero, including its lead-in. Check each cut and beat against the requested scene frames. Subject panels establish identity and outfit. The shot action controls when the person enters. See the [scene input contract](../_shared/video-routing.md).

For an explicit LTX shot-manifest request, choose `sceneRendering:"single_msr"` to require one model call. Choose `per_shot` for exact cut timing or shot-specific controls. With `auto`, review the resolved mode before approval. Authored whole-scene prompts use the whole-scene route.

## Correcting a scene take

Change the relevant beat, dialogue or image on the storyboard. Regenerate the complete scene using its selected model and one reviewed request. Retain the previous candidate until the new take has been reviewed.

For dialogue, read [dialogue coverage](../storyboard/references/dialogue-coverage.md)
before writing prompts. Confirm the visible speaking face and silent foreground listener
in conventional OTS coverage. For a requested one-take preserve all speaker turns on the same card and use scene planning. Set each camera setup's size and angle before images.
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
video duration. Send the visible reaction and ongoing action to the video model. Keep the thought text and vocal direction with TTS. Keep mouths closed and assembly on `sound.audioSource:"speech"`.
If speech is disabled, report missing TTS setup rather than sending thoughts to MSR.
See [shot speech](../produce/references/shot-speech.md).

**Prompt.** Write or revise the complete scene with the saved model's writing guide from `video_catalog`. Keep dialogue, expressions, actions, camera choices and closing states on their existing shot cards. For reference voice, pair the speaking character's face and sample. On audio-to-video, time visible action to the approved recording. Include ambience in the scene sound and keep audience cues in post. Inspect `video_plan`'s complete `args.prompt`, named `promptTemplate` and reference bindings. To keep an edit, save it under the matching model and operation in the scene's `videoDirection.promptDrafts`.

**Approval.** Show the scene prompt, planned attachments, dialogue and cost. Record the user's approval with `video_approve` and execute that scene plan once. When inputs change, replan and show the updated scene under the existing approval policy.

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
`storyboard_read.videoProduction`. Review the actual complete scene prompt from `video_plan`. After an edit, compare the opening positions, the move and the final framing to the approved board. A saved route-specific template carries the same cast names even when the transmitted reference numbers change. Keep unresolved native
speech timing explicit. Reference `preserve`/`avoid` instructions remain attached to their
image slots. A new take may carry `purpose`, `basedOnRequestId` and `changeNote`; use a
unique filename. Draft/final labels do not authorize a resolution or model switch.
Offer low-resolution drafts only when they help test an uncertain shot; reuse completed
footage and existing authorization. Refresh the shared board to compare candidates,
then use the existing attachment path. Never treat generation completion as review.
