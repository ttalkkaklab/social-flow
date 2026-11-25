# Directing recurring speakers and cuts in generated video

Research date: 24 November 2026. This study compares model-author guides, provider APIs and Social Flow's installed video catalog. The examples are proposed directions for the same scene. No video was generated or auditioned for this study.

For the proposed scene-only authoring workflow, see the [scene prompt design](scene-prompt-design.md). The shot-prompt tool references below describe the research snapshot.

## Choose the input that carries the performance

| Production requirement | How to represent it |
| --- | --- |
| The actor must say the approved words with the recorded hesitation and emphasis | Supply the approved take or pinned TTS track to LTX audio-to-video. The recording sets the pace. Direct the visible movement around it. Review the exported audio and mouth movement. [LTX audio API](https://docs.ltx.io/api-documentation/api-reference/async-video-generation/submit-audio-to-video) |
| The actor should sound familiar while performing new words | Pair each actor's visual identity with their own voice sample. Give the line and performance direction to that speaker. LTX MSR V2, MiniMax H3 and Seedance reference operations can use this pattern. Timbre, wording, speaker assignment and sync can fail independently. [MSR model card](https://huggingface.co/LiconStudio/LTX-2.5-Multiple-Subject-Reference) · [H3 reference guide](https://github.com/MiniMax-AI/MiniMax-H3/blob/main/skills/h3-prompt-writing/references/ref-en.txt) · [Seedance 2.5 guide](https://ai.byteplus.com/ark/region:ap-southeast-1/docs/seedance-2-5-prompt-guide) |
| The model may cast the voice | Give the speaker a name and a reusable description of register, pace and accent. Put this line's emotion or hesitation next to the line. Google also recommends reusing the seed across scenes. This offers no audio reference against which the model can match a particular performer. [Google best practices](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/video/best-practice) |
| The next view must start on a given frame | Author a shot boundary and use a renderer or edit that actually joins at that frame. A shot number, time range, composition image or indexed image condition by itself does not cut the output stream. [Scene input contracts](../../../skills/_shared/video-routing.md#scene-frames-and-adapter-inputs) |

## One scene, three camera setups

At a quiet ticket counter, Mina slides a brass key to Jun. He waits until she lets go to pick it up. The lock of the now-empty counter is their subject of conversation. The direction below keeps a verifiable action, two voices and a continuous sound source in the same eight seconds.

| Scene frames at 24 fps, end exclusive | Framing and action | Speech and sound |
| --- | --- | --- |
| 0–72 | Medium on Mina at viewer-left. Her right hand slides the key halfway across the wood and releases it. Jun watches from viewer-right. | Mina asks in Korean, “문 잠갔어?” A desk fan runs throughout. |
| 72–120 | Hard cut to an insert. The key is still. Mina's open hand leaves frame left. Jun's hand has yet to enter. | A short scrape ends. Neither actor speaks. |
| 120–192 | Hard cut to a medium close-up on Jun at viewer-right, looking left. He lifts the key, then meets Mina's eyes. | Jun answers in Korean, “응, 잠갔어.” The same fan remains audible. |

Write one card per setup. A dolly during one view stays on that card. Record the line once with its cast ID and delivery in `shot_dialogue`. Put the movement, ending and sound in `shot_prompt`. For MSR, name everyone visible in `openingPositions` and map the speaking faces to their actual positions in the opening picture. In a two-shot, “Image 1” can be the person on the right. For an insert with speech from outside the frame, mark that line `off_screen` and describe what the visible listener does. [Voice and shot authoring](../../../skills/produce/references/voice-continuity.md)

The examples below show the intended **model-facing text**. In a managed production, let `video_plan` compile the shot cards. Inspect `sceneRequest`, `promptProfile`, final `args.prompt`, the media bindings and `voiceContinuity`. The storyboard can keep the exact frame clock even when the selected operation can send only prose. [Prompt profiles](../../../server/src/scene-prompt-profile.ts) · [Timeline compiler](../../../server/src/scene-prompt.ts)

## LTX-2.5 and Licon MSR V2

For a continuous shot, set the composition once, write in present tense and describe visible changes in order. Put a pause where it should actually happen. For a generated sequence, Lightricks suggests starting with two to four views. Write the transition in prose. At each cut specify the new framing, the returning subject and what the audience still hears. Use a continuous take for a sustained line when lip movement and facial performance matter. [Lightricks prompting guide](https://docs.ltx.io/api-documentation/implementation-guides/prompting-guide)

MSR means *Multiple Subject Reference*. A slot identifies the source of visual attributes. It gives an actor neither a permanent screen position nor a shot time. Licon's V2 adds up to two voice references, paired with the first two pictures. In the ASTRA gateway there are four subject inputs and one background input. For two speakers place both identities first, then an extra costume or prop if needed, with the background last. Give each input a single clear purpose. Keep camera language in the shot direction. One earlier project comparison found that calling a source panel a “face close-up” prompted an unwanted opening close-up. [Licon model card](https://huggingface.co/LiconStudio/LTX-2.5-Multiple-Subject-Reference) · [Project observations and slot layout](../../../skills/_shared/astra-genai.md)

```text
Image 1 is Mina in a blue cardigan. Image 2 is Jun in a grey jacket.
Image 3 supplies the ticket counter. Audio 1 is Mina's voice. Audio 2 is Jun's.
Mina stands left of the counter and Jun stands right, facing her.
Hold a medium view of Mina for about three seconds. She slides the brass key
with her right hand, lets go and asks in Korean, "문 잠갔어?" Jun listens.
Hard cut to the key resting on the wood. Mina's open hand leaves to the left.
Hard cut to Jun looking left. He lifts the key and replies in Korean,
"응, 잠갔어." A desk fan hums through both cuts.
```

For this example the two samples must also be attached to the corresponding subject inputs. The third image supplies the background. For a required opening composition use combined distilled I2V with the opening image as a temporal input and the identities as separate references. Pure MSR can recompose a supplied layout. A single generation can use indexed images to guide a particular state in time. It still interprets the transition prose. [Gateway image conditioning](../../../skills/_shared/astra-genai.md) · [Licon implementation](https://github.com/LiconStudio/ComfyUI-LTX2.5-MSR)

For a recurring voice, begin with a clean, short sample containing just that speaker in their ordinary register. Use the same audition across shots. The gateway advertises ten seconds per speaker. The project documents a five-second conditioning window in the reference ComfyUI implementation. The authors report voice blending, inherited background noise and artifacts during emotional delivery. Their cross-language observations do not establish reliable generalization. The V2 model card reports an environment-sound issue with dry samples, while a project trial found that music in a sample spread across the scene. Keep the voice reference clean and direct the audible room or action separately, then listen for both. [MSR paper, Appendix C](https://arxiv.org/html/2609.18393v1) · [Model card](https://huggingface.co/LiconStudio/LTX-2.5-Multiple-Subject-Reference) · [Project audio observations](../../../skills/_shared/astra-genai.md)

The queried MSR endpoint advertised voice references, combined image conditioning and a 2,000-character prompt budget. Preserve the speaker mapping and complete lines when shortening. In the separate `sceneRendering:"per_shot"` operation the live gateway advertised 2–32 cards, hard cuts, up to two sampled speakers per shot and estimated native line onset. Its frame-cued dialogue mode takes a supplied performance. A project can change the speaker pair at a cut. The same two slots span a single uninterrupted MSR generation. Use the supplied performance when the reply must start on frame 120. [Scene renderer contract](../../../skills/_shared/video-routing.md#scene-frames-and-adapter-inputs)

Hosted `ltx-2-5-pro` and `ltx-2-5-fast` expose different inputs through Social Flow. For A2V, supply the actual dialogue track and describe when Jun lifts the key relative to his audible reply. The adapter accepts 2–10 seconds on Pro and up to 20 seconds on Fast at 720p/1080p. Hosted I2V takes an opening and optional ending. Local Desktop, direct ASTRA and generic MLX have their own operations. Select a route with the required visual and audio inputs before porting an MSR prompt. [Hosted API](https://docs.ltx.io/api-documentation/api-reference/async-video-generation/submit-audio-to-video) · [Deployment comparison](../../../skills/_shared/video-routing.md#ltx-and-google-cloud-veo)

## MiniMax H3 and local FastH3 Omni

The hosted adapter includes H3, Highspeed, Lite and Max. In reference mode Social Flow numbers the pictures and voice samples separately. It can attach up to nine pictures and three voice samples. Each sample runs 2–15 seconds and the samples together must fit in 15 seconds. The opening composition takes another reference-picture slot. A literal first or last frame belongs to a different API operation. The provider also accepts reference video, while the managed hosted reference adapter takes images and audio. Max prompt expansion is disabled by the adapter to preserve the authored assignments. [MiniMax API](https://platform.minimax.io/docs/api-reference/video-generation-v2-create) · [Hosted adapter](../../../server/src/minimax-video.ts)

```text
Mina, viewer-left, is the woman in reference image 1. Use reference audio 1
for her speaking voice. Jun, viewer-right, is the man in reference image 2.
Use reference audio 2 for his voice. Reference image 3 sets the counter layout.
Begin on Mina sliding the key toward Jun. She lets go and asks in Korean,
"문 잠갔어?" Cut to her open hand withdrawing from the stationary key.
Cut to Jun lifting it. Looking left, he answers in Korean, "응, 잠갔어."
The fan continues at the same level. The key scrapes the wood only as it moves.
```

MiniMax also publishes a richer *prompt-rewriter* format. The base guide places shot visuals, action and dialogue together and describes environmental sound and score separately. Its full-reference guide adds subject definitions and what each reference contributes. It reuses speaker IDs across cuts, puts only language and words inside the speech tag, and marks a sentence carried over an edit. For example, `Mina (S1) asks: <d>[Korean] 문 잠갔어?</d>`. These are authoring conventions for the documented workflow. The hosted API receives a text item and typed media. Social Flow does not send six rewrite sections as six JSON fields. [MiniMax base guide](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/docs/VIDEO_PROMPT_WRITING_GUIDE_base_en.md) · [Full-reference guide](https://github.com/MiniMax-AI/MiniMax-H3/blob/main/skills/h3-prompt-writing/references/ref-en.txt)

For local FastH3 write `<Picture 1>`, `<Video 1>` and `<Audio 1>`. A camera reference should say which property to borrow, such as the path of the camera through the counter, while the still supplies the actor. Reference videos include their sound. Social Flow counts **video soundtracks before separate voice files**. With one audible reference video, Mina and Jun's two WAVs become `<Audio 2>` and `<Audio 3>`. With a silent video they remain 1 and 2. The pack accepts 9 images, 3 videos and 3 audio files, with 12 references total and at least one visual reference. [FastVideo model card](https://huggingface.co/FastVideo/FastVideo-FastH3-Omni-8-Step-V1) · [MLX adapter](../../../server/src/fasth3-omni.ts)

## Google Cloud Veo 3.1

For text generation, lead with shot scale and camera, then the subject, action, setting and light. For I2V let the opening still supply the appearance and direct movement from that state. Keep each short scene about one event. Google's timestamp examples show how to cover that event from several angles. Use the label to request pacing. A hard edit with a frame deadline still belongs in the renderer or editor. [Google directing guide](https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-veo-3-1) · [Google best practices](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/video/best-practice)

```text
[00:00-00:03] Medium shot at a ticket counter. From viewer-left Mina slides
a brass key, releases it and looks right. Mina speaks Korean in a low,
even register, with clear consonants. She asks: 문 잠갔어?
[00:03-00:05] Cut to the stationary key. Her open hand leaves frame left.
The scrape dies away. The desk fan continues.
[00:05-00:08] Reverse medium close-up. Jun lifts the key and looks left.
Jun speaks Korean in a light, slightly breathy register. He answers: 응, 잠갔어.
```

Veo has native dialogue and effects. Its Social Flow adapter has no voice-sample or supplied-speech input. For model-cast dialogue explicitly select `videoDirection.dialogueVoice:"model_generated"`. Repeat the same cast and voice description and reuse a seed where suitable. Google's blog illustrates quoted lines, while its production best-practices page recommends a colon without quotation marks to reduce accidental visible text. The example follows the latter. The current generic Social Flow dialogue formatter can still add quotes, so inspect the compiled prompt. [Google voice and dialogue guidance](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/video/best-practice) · [Scene compiler](../../../server/src/scene-prompt.ts)

Standard and Fast support the managed asset-reference route with up to three views of **one** subject in an eight-second request. Lite has no asset-reference route. For two actors use an authored opening image on the image route, or use separate views with the appropriate subject. A text or frame call may request 4, 6 or 8 seconds. None of those operations accepts two cast WAVs. [Google reference images](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/video/generate-videos-from-references) · [Model specifications](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/veo/3-1-generate) · [Social Flow Veo adapter](../../../server/src/veo-video.ts)

## Seedance 2.0 and 2.5

Give each reference a job before describing the beats. Distinguish identity, voice timbre, shot composition, movement borrowed from a video, and musical rhythm. State who moves, who speaks and which state carries into the next view. For a composite storyboard, BytePlus recommends a simple, legible sequence with few panels and describes it as guidance for the plot. For a required frame use the dedicated first/last-frame operation. For shot composition in reference mode, identify the relevant picture and the shot it should guide. [BytePlus prompting examples](https://ai.byteplus.com/resources/how-to-write-better-seedance-2-5-prompts) · [ModelArk guide](https://ai.byteplus.com/ark/region:ap-southeast-1/docs/seedance-2-5-prompt-guide)

| Installed family | Output length | Image / audio reference counts | Audio-only reference request |
| --- | --- | --- | --- |
| 2.0, Fast, Mini | 4–15 s | 9 / 3. Audio clips share 15 s. | Requires a visual reference |
| 2.5 | 4–30 s | 30 / 10. Audio clips share 30 s. | Supported |
| 2.5 Flash | 4–30 s | 10 / 5. Audio clips share 30 s. | Supported |

These counts describe accepted inputs. A multi-photo character sheet, the opening guide and any shot-specific composition guides all consume image slots. The number of audio files is not a measured count of people the model can portray distinctly. Social Flow writes `Image 1 / Audio 1` for 2.0 and `@Image 1 / @Audio 1` for 2.5. [ModelArk input contract](https://ai.byteplus.com/ark/region:ap-southeast-1/docs/create-video-generation-task-api) · [Prompt profiles](../../../server/src/scene-prompt-profile.ts)

```text
@Image 1 establishes Mina's appearance and @Audio 1 her voice timbre.
@Image 2 establishes Jun's appearance and @Audio 2 his voice timbre.
@Image 3 guides the opening two-shot. @Image 4 guides only the key insert.
Mina stands left at the ticket counter. She slides the key, releases it
and asks in Korean: {문 잠갔어?} Jun watches from the right, mouth closed.
After the release, cut to the stationary key. Mina's empty hand withdraws.
Then cut to Jun lifting the key and looking left. He replies in Korean:
{응, 잠갔어.} A desk fan continues underneath the conversation.
```

The reference operation gives this example both voices and both compositions. A numbered composition guide does not pin the opening pixel-for-pixel. Keep distinct actor, costume and sound mappings for later shots. The 2.5 guide illustrates braces around spoken words. Treat punctuation as writing guidance, and attach actual audio with the correct role in the API. If the board requires a registered face asset, inspect the resolved account-scoped asset and slot in `characterBindings`. [BytePlus guide](https://ai.byteplus.com/ark/region:ap-southeast-1/docs/seedance-2-5-prompt-guide) · [Project identity contract](../2026-11-22-seedance-api/character-identity-design.md)

## HeyGen Video 1

HeyGen recommends a contained subject, action and location, with restrained camera movement. Its examples specify lens, texture, lighting and sound. For this scene a suitable single shot is Jun lifting the key at the counter, looking left and giving his answer. Use `<Picture 1>` for Jun, `<Audio 1>` for the sample, and put the spoken line next to the action. The managed adapter offers 5–15 seconds with prompt enhancement disabled, up to 9 pictures and 3 audio files. Its image operation takes an opening and optional closing image. The public reference API documents audio input and ordering. It gives no measured recurring-speaker fidelity for this case. [HeyGen Video 1 guide](https://developers.heygen.com/docs/models/heygen-video.md) · [Managed adapter](../../../server/src/heygen-video.ts)

## Diagnose a failed take

| Observable problem | Inspect first | Change to try |
| --- | --- | --- |
| The listener speaks Mina's line | Match the compiled prompt and actual image/audio order to the opening picture. Check who is visible and which mouth moves. | Rebind by cast ID and viewer position. Keep the listener's visible action. If the blocking permits, cover the line on the speaker and cut to the listener afterward. |
| The right person speaks in a different voice | Compare the same character's sample bytes, acoustic description and selected operation across the two scenes. Check for score or another voice in the sample. | Reuse the clean audition. If the exact performance matters, use the approved recording on a supplied-audio route. |
| A reverse angle drifts or morphs instead of cutting | Determine whether timing was submitted as prose, as an intermediate image, or as a frame boundary in a render job. | Specify the cut and new composition in prose for approximate pacing. Use separate shots and an actual cut for a fixed edit. |
| Both camera angles are correct but Jun takes the key too early | Inspect the ending of the outgoing shot and the first visible state of the incoming shot. | Assign Mina's release, the stationary insert and Jun's pickup to their respective cards. Leave Jun's hand outside the insert. |
| The words change or the reply misses its cue | Check the actual line, speaker assignment, available speaking time and whether onset was estimated. | Record the approved performance with its pause. Use that track and a supported timed render for an exact cue. |

For comparative testing, keep the cast, dialogue, opening, duration and reference files fixed where supported. Change one variable per pair, such as the speaker binding, cut instruction or soundtrack on a reference video. Listen to voice identity and wording separately, then watch speaker assignment, lip sync, cut position and object continuity. A seed controls variation only within the chosen implementation. No cross-model ranking follows from these recipes.

## Availability at the time of the study

The installed catalog contained ten engine identifiers covering the families above and their deployments. The connected MCP process reported configured Google Cloud Veo, local MLX, ASTRA GenAI and ASTRA GenAI Desktop. Google project configuration did not verify quota or inference. The Desktop discovery call returned HTTP 503 with “Desktop is not configured”. The separate local Desktop adapter was also unconfigured. The local MLX model service listed `ddalcu/FastH3-Omni-MLX-Serve-8bit` as ready and returned no LTX model ID. The gateway returned the MSR and per-shot capabilities described above. The connected process reported missing credentials for hosted MiniMax, Seedance, hosted LTX, HeyGen and direct ASTRA video. Host-native handoffs depend on the host and sit outside this catalog. All runtime checks were read-only.
