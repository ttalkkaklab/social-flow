# Making an episode

An episode belongs to one channel. In this walkthrough, `field-notes` is the channel and `window-light` is the episode slug. Use the same two names to resume a session. [Workspace setup](getting-started.md)

## Build the storyboard

After reviewing the synopsis, tell the assistant to use it for `window-light`. In Claude Code, the storyboard skill also takes the channel and topic directly:

```text
/social-flow:storyboard field-notes window-light
```

1. **Prepare the cast.** Reuse a channel character or describe a new one. Each visible cast member needs an identity and face, front and back images. A voice-only narrator needs an identity. If a panel is missing, the assistant identifies it and asks for any spending authorization needed to make it.
2. **Read the scene before reviewing its shots.** For “Window Light,” the scene should establish where the cup starts, what the potter does and when the glaze becomes visible. Check who speaks and what the viewer can see during each line.
3. **Open the review page.** Open `data/field-notes/episodes/window-light/storyboard/storyboard.html` in a browser. Keep its sibling files with it. Check the cast, shot order, framing, dialogue and planned sound. To request a correction, cite a shot or scene and the change you want.
4. **Approve the plan you want to produce.** A text-only board can stop at the shot plan. You can request shot images or a camera review separately. The assistant keeps the episode's saved model choices on resume.

## Produce and review the video

When the board is approved, run:

```text
/social-flow:produce field-notes window-light
```

Review the cost estimate and the proposed generated shots before authorizing paid work. The production sequence prepares the props and locations, then the shot images. For generated scenes, the assistant plans a request with the ordered shots and their sound direction. Approve the shots you want to render. The assistant can then assemble the selected footage, sound and platform copy.

Play the delivered `output/video/video.mp4` with sound. Check that the opening frame matches the promise, speech finishes before a cut, and the last shot shows the result. The master has no burned-in subtitles. Request a separate subtitle track if you need one. Read the caption or post for each target platform. For a dedicated thumbnail or platform crop, request the [cover workflow](../skills/generate-cover/SKILL.md).

## Find the files

Paths below are relative to the workspace you selected at setup.

| Path | Contents |
| --- | --- |
| `.social-flow/models.json` | Defaults for future episodes |
| `data/field-notes/profile.md` | Channel identity and editorial choices |
| `data/field-notes/assets/` | Reusable cast, voices and channel artwork |
| `data/field-notes/episodes/window-light/.work/model-settings.json` | Settings captured when this episode was created |
| `data/field-notes/episodes/window-light/storyboard/` | Cast, shot data in `scenes.js`, review page and shot assets |
| `data/field-notes/episodes/window-light/output/` | Final video, platform copy and delivery records |

## Choose a smaller task

| Request | Skill |
| --- | --- |
| Inspect a character, a prop or the sequence as it stands | [inspect-content](../skills/inspect-content/SKILL.md) |
| Check what the audience can understand or how the camera covers a scene | [review-context](../skills/review-context/SKILL.md) · [review-camera](../skills/review-camera/SKILL.md) |
| Make start images and any planned end images | [generate-cut-images](../skills/generate-cut-images/SKILL.md) |
| Render approved scenes or inspect candidate clips | [generate-cut-videos](../skills/generate-cut-videos/SKILL.md) · [review-cut-videos](../skills/review-cut-videos/SKILL.md) |
| Run planning and production together with saved choices | [autoproduce](../skills/autoproduce/SKILL.md) |

When the video and copy are ready, continue to [Publishing](publishing.md).
