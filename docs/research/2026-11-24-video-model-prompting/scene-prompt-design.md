# Model-specific prompts for a complete storyboard scene

Design and implementation notes, 25 November 2026. The storyboard author approves one prompt for one scene. Rendering submits that scene in one native video request. Shot cards still describe what the viewer sees and hears as the scene unfolds. A line retake invalidates the scene take that contains it. The [research and examples](README.md) describe the provider evidence and the earlier production workflow.

## Authoring and execution

1. Read the existing scene, its ordered shot cards, character pins, lines, blocking, lens and camera moves, sound decisions, duration and frame rate. Keep the approved spoken words in their original language. Derive frame intervals from the scene clock and preserve the end-exclusive boundary. These inputs already exist on the board.
2. Resolve the saved provider, exact model and operation. Ask the adapter for its duration, frame and reference limits, available audio roles, and start/end or intermediate frame support. Report which requirement fails if the scene cannot fit. A different model, shorter scene or revised voice requirement is an editorial decision.
3. Select a writing profile by that same tuple. Give the writer the ordered action, available media roles and the model's writing examples. Generate **one English scene prompt**. It should identify the opening composition, who moves and speaks when, the visual transition at each intended cut, the final position and the continuous sound. A shot's lens or camera change belongs inside this paragraph or timeline. A speech turn belongs to exactly one actor.
4. Use stable names such as `{mina.face}`, `{mina.voice}` and `{insert.image}` in authored directions. Build a slot table from the adapter's actual outgoing media order. Resolve only recognized reference tokens in the final prompt. Preserve authored prose and literal dialogue braces. An unresolved reference token, ambiguous ID or missing required audio prevents submission. Start/end images and timestamped keyframes without numbered reference slots are described by their roles.
5. Preview the final prompt alongside the outgoing ordered references, the speaker for each line, supplied versus generated audio and timing precision. Execute the reviewed request with the same model, media and prompt. Include the submitted prompt and media evidence in the plan fingerprint. Rebuild the plan before execution. A changed model, reference or board revision needs a new preview. Store the submitted prompt and bindings with the take.

Reuse the existing scene projection, prompt profile selection, scene prompt compiler, provider adapters and video plan/execute boundary. Each writer owns its model's wording. The adapter owns the transport, allowed media roles and slot numbering. The scene planner owns the frame clock and truth about the cast. Keep an edited prompt scoped to its scene and route. On a model switch, preserve the old edit and generate a separate draft for the newly selected route. Legacy shot prompt text can be shown during migration. New authoring and retakes use the scene prompt.

## Writing profiles

| Selected route | What the writer produces | What the adapter verifies |
| --- | --- | --- |
| LTX MSR V2 | Identify visible faces by opening position. Pair each speaker's Image and Audio. Give listener reactions, literal dialogue and transitions in chronological order. | A face and its voice belong to the same cast ID. Number per the outgoing MSR inputs. A voice sample guides timbre. |
| LTX audio-to-video | Describe movement, pauses and camera coverage against the supplied performance. | Supply the approved take with its actual duration. A supplied performance and a timbre reference have different contracts. |
| Hosted MiniMax H3 reference | Name each reference image and audio in the hosted operation's documented syntax. Separate appearance, voice, blocking, dialogue and ambience. | Check the hosted model and operation, feature limits and reference bindings. A deployment alias alone does not identify its local quantization. |
| MLX FastH3 Omni | Resolve local picture and audio tags such as `<Picture 1>` and `<Audio 1>`. Keep supporting images tied to their scene beat. | Derive indices after media preparation. A reference video's soundtrack can take an audio slot before an explicit voice sample. Apply the local runner's limits. |
| Veo | Use timed beats when helpful. Describe the frame, movement and sound at each transition. Introduce literal dialogue with a speaker and colon. Reuse an approved voice description when generated casting is allowed. | Check the exact operation's duration and reference roles. A repeated voice description or seed cannot satisfy a required audio-reference or exact-take contract. |
| Seedance reference | Use the selected version's reference style, such as Image 1 for 2.0 and @Image 1 for 2.5. Bind face and voice separately and keep literal dialogue punctuation intact. | Verify roles and registered assets where required. Check each generated label against the transmitted slot table. |
| HeyGen Video 1 | Use a contained action, clearly identified speaker, short camera direction and picture/audio references on the reference operation. | Check operation-specific duration, reference counts and endpoints. Reject a scene requirement the selected operation cannot express. |

The research report links the model authors' guides, API contracts and local implementation for each row. Recheck those sources when a deployed version changes. Local catalog support, public model capability and observed output are distinct evidence.

## Example and acceptance

For the ticket-counter scene in the report, a FastH3 template can read:

> {mina.face} is Mina on the left. Match her voice to {mina.voice}. {jun.face} is Jun on the right. Match his voice to {jun.voice}. Start in a medium two-shot. Mina slides the key halfway across the counter, releases it and asks in Korean, “문 잠갔어?” Jun watches with his mouth closed. Cut to the still key as Mina's empty hand leaves frame left. Cut to Jun lifting the key and looking back at her. He replies in Korean, “응, 잠갔어.” The desk fan continues throughout.

The plan resolves these names only after enumerating the images and audio clips. On LTX audio-to-video, the same scene uses the recorded question, pause and answer for timing. Its writer directs Mina's release and Jun's pickup around those events. A prose cut cue expresses intent. An exact frame constraint requires transport support.

Start with paired fixtures for MSR and local FastH3 using the same two speakers. Swap reference order, add a video with audio, remove a speaking reference and try a literal brace-delimited line. Assert one scene request, exact dialogue, stable actor-to-media mapping, no dangling slots, the recorded preview fingerprint and explicit rejection on unsupported input. Then add hosted H3, Veo, Seedance and HeyGen profiles behind their verified operation contracts. For real takes, listen for voice identity, correct words and silence from the listener. Watch mouth movement, screen direction, key continuity and cut placement. Record failures by axis. A valid request alone cannot establish any of those perceptual results.

## Using the implementation

Read the selected adapter's `sceneWritingGuide` from `video_catalog`. For example, on a storyboard with two pinned speakers and a reference-capable model, first plan the complete scene:

```json
{"episode":"/work/episode","sceneNo":1,"requestId":"counter-preview","wholeScene":true}
```

The response contains the submitted `args.prompt` and an editable `promptTemplate` for a numbered reference operation. To preview a revision, add the edited template in the top-level `prompt` field and choose a new request ID. Keep the edit across sessions by saving it through `story_scene` in the scene's `videoDirection.promptDrafts`. Each draft records `engine`, the exact selected `model` where present, `operation` and the full `prompt`. An explicit preview overrides the matching draft for that plan. With no matching draft the planner composes from the board. Changing the selection preserves edits for the previous route. Approve and execute the resulting plan ID. The plan itself does not render media.

For FastH3 or Seedance reference mode, put ordered local motion clips in `videoDirection.motionReferencePaths`. The adapter checks its media limits. On FastH3, a video carrying sound takes an audio number before the standalone character samples. The preview lists each editable name and its submitted label in `promptSlots`. For example, `pan.mp4` supplies `{pan.motion}` and, on FastH3 with embedded audio, `{pan.soundtrack}`. Use those names in saved drafts so each reference follows its source if the clip order changes. The planner rejects ambiguous names, numeric references in saved drafts, and references the selected adapter cannot address. Keep each quoted turn next to its approved speaker. Place a voice token in that turn or keep the ownership sentence from the generated template. Keep the generated cast declarations. In a new blocking sentence, pair a named cast slot with its own actor. For directions involving multiple cast members, use their names, for example “Keep Hero’s face sharp as Guest steps back.” Use a direct attribution for edited turns, such as “Hero says to Guest” or “Guest replies to Hero”. Put complex blocking in the preceding sentence. Vocal identity comes from the cast binding. Reaction timing such as “Hold on Guest after the first spoken line” belongs in the visual direction. A rehearsal with two speakers should also try swapping only their faces and appending an extra line. For adapters that trim whitespace the preview shows the normalized provider text, while the plan retains the original edit in `authoredPrompt`. A change to the video's bytes invalidates the approved plan. For local or hosted operations that cannot accept a motion clip, planning reports the unsupported input.


### Where to write a revision

The storyboard is the authority for the cast, spoken turns and unrestricted acting or blocking prose. The planner accepts those compiled sentences for the chosen model. In a saved prompt edit, use direct speech cues and simple camera or blocking directions involving the cast. For example, “Hold on Hero until Guest finishes her last line” changes the camera timing while keeping the approved turn. If an edited direction involving an actor or a spoken turn falls outside the supported grammar, put the full direction on the relevant scene or shot card and regenerate the scene prompt. This keeps a single scene-level approval and permits detailed acting without inferring cast ownership from arbitrary English.
