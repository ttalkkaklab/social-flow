# Video type selection and speech direction

User request, 2026-10-16: choose the video type during initial setup, explain what
each option changes, and use it in subsequent storyboards. The machine-readable
[catalog](video-types.json) supplies the localized HITL options; run
`node skills/_shared/model-settings.js types` from the plugin root to list them.
Storage, episode snapshots and explicit changes follow [model settings](model-settings.md).

## Research and scope

Reviewed 2026-10-16. [BFI's genre discussion](https://www.bfi.org.uk/features/genres-where-draw-line)
describes the limits and overlap of genre, style and format. [BFI Replay](https://replay.bfi.org.uk/)
uses documentary, comedy, interview, advertising and home-movie groupings.
[YouTube's content-planning guidance](https://support.google.com/youtube/answer/13616340?hl=en)
groups videos by format/style/tone and uses vlogs and tutorials as distinct examples.

Our eleven choices are a practical authoring catalog derived from that research,
not a universal genre standard or a copy of YouTube upload categories. Drama and
comedy are story genres; explainer and tutorial are useful production formats.
Allow hybrid detail rather than claiming those categories cannot overlap. Animation,
photoreal and miniature are visual styles and remain a separate choice. Shorts and
long-form are output formats and do not determine who speaks.

## Apply the selected type

Read `PRODUCTION.videoType` from the episode, otherwise its snapshot's
`config.videoType`. A newer directory default does not change an existing episode.

| Type | Authoring direction |
|---|---|
| drama | Develop scenes through characters speaking and acting. Visible physical speech is `on_screen`; use listener reactions and off-screen lines where they serve the scene. |
| comedy | Preserve setup, delivery, pause and response. Speech can be on-screen, physical comedy can be silent, and a deliberately narrated comedy is valid when explicitly chosen. |
| documentary | Let evidence determine the mix of narration, interview and location sound. A fully narrated documentary is valid. Keep reconstruction distinct from recorded fact. |
| explainer | Narrator-only voiceover throughout is valid. Illustrated characters do not need dialogue merely because they are visible. |
| tutorial | Show the steps and their results. Voiceover fits demonstrations; a visible presenter physically speaking uses `on_screen`. |
| review | Connect claims to use and comparison evidence. Choose direct presentation or voiceover to match the actual picture. |
| interview | Keep identifiable speaker turns, listening reactions and natural pauses. A visible interviewee's speech remains synchronized. |
| vlog | Distinguish speech to camera, conversations, retrospective voiceover and ambient moments. |
| advertisement | Choose acted scenes, product demonstrations or narration from the message. Do not force one speech mode on every advertisement. |
| music_video | Plan around the source music/performance. Singing faces require synchronized vocals; instrumental passages can remain speechless. |
| custom | Follow the user's saved detail, including hybrids. Clarify the intended speech approach when the description leaves it ambiguous. |

These are directing defaults, not quotas or score gates. In drama, never make the
whole conversation off-screen merely because lip synchronization is inconvenient.
A character can explicitly act as narrator, think, or read a message while visible:
use `voiceover` and a short `deliveryReason` where needed. A narrator addressing the
camera physically still uses `on_screen`. Preserve meaningful silent shots.
Follow [shot speech](../produce/references/shot-speech.md) for audio-driven animation.

The review shows each line in order with profile image, name, delivery and a speech
bubble. It labels narrator roles and displays `deliveryReason`. This lets the user
see the planned speech before production; it is not evidence of generated lip-sync.
