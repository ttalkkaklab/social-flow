# Shooting mode — a filmed episode, and long-form's per-scene mix

Read this **once any scene of the episode is filmed by the user**. A fully generated
short-form episode — the default — never needs it. The decision itself is storyboard §1.6;
this file is what follows from a "filmed" answer.

## Contents

- [What differs in shooting mode](#what-differs-in-shooting-mode) — the `visual` contract, narration, script.md, the hand-off
- [One recorded screen is not shooting mode](#one-recorded-screen-is-not-shooting-mode) — the per-card screencast splice
- [Long-form is a third case](#long-form-is-a-third-case-one-episode-mixes-both) — mixing filmed and generated scenes

The contracts this file leans on: `references/scenes-schema.md` §filmed scenes for the data
shape, `references/shot-script-template.md` for the shooting-script document.

## What differs in shooting mode

mode**. Confirm with AskUserQuestion when unsure. What differs in shooting mode (the
`references/shot-script-template.md` contract):

- Scene `visual` is `{ source: "recording", clip, shot, action }` — §5 image generation is
  skipped entirely (the on-screen footage comes from the user's actual recording).
- narration isn't a TTS script but **the sentences to speak** — the character cap relaxes
  (40 chars per sentence recommended, derived backwards from an 8–20s scene target).
- §6 authors **script.md (the shooting script)** alongside storyboard.md.
- After approval the hand-off is **recording**, not produce (§7 branch).

#### One recorded screen is not shooting mode

"The user will record one screen for one scene" is **not** this mode. A generated,
TTS-narrated episode can splice a single window of a screen recording into one card —
`visual.source: "screencast"` (scenes-schema §screencast splice), per scene, in both formats.
Nothing else about the episode changes: the voice stays TTS, the character counts and speech
rate stay where they are, and only that card's picture comes from a file. Reach for it when
one moment has to be the real screen — the command running, the setting flipping, the result
appearing — and for nothing longer than that moment.

Shooting mode is the other thing: the user narrates while recording, their voice carries the
episode, and in short-form the whole episode goes that way.

#### Long-form is a third case — one episode mixes both

A short-form episode is either all generated or all filmed, but **for long-form, mixing
filmed and generated scenes in one episode is the normal path.** Install screens, running
results, and hands-on moments are better actually filmed; background explanation and
concept pictures are cheap and fast to generate. There's no reason to fill 12 minutes with
one kind.

So in long-form the mode isn't per-episode but **per-scene**. Decide it one scene at a time
while designing them (§4) — is this shot filmed, or made?

```
[Landscape long-form · mixed]      ← the long-form default. The user films each filmed scene into a file
[Landscape long-form · all generated]  ← topics with nothing to film (explainers, roundups)
[Landscape long-form · all filmed]     ← a demo start to finish. Treated as a special case of mixed
```

**"All filmed" is also built as the mixed lane** — one file per scene, with zero generated
scenes. Short-form's `build-screencast.sh` path (shoot straight through once, then align)
is portrait-only and can't go landscape. If the user says "I want to shoot it in one go",
let them, but ask them to split the file at scene boundaries when saving.

**Narration in a mixed shoot defaults to live voice on every scene** — the user records
every scene's lines in their own voice (`window.VOICE = "user"`, scenes-schema
§all-live-voice episodes). Alternating the user's voice with TTS inside one episode
changes the speaker partway through. In that setup script.md carries the lines for every
shot, and shots that aren't filmed scenes are voice-only recordings
(`voice/s<shot number>.wav`). An episode covered by TTS happens only when the user asks
for it.

Generated scenes then split two ways in §4 — mood, place, and people become a **generated
image**, while a diagram that only reads once text and shapes are laid out becomes a
**slide** (scenes-schema §slide scenes). A slide scene carries its plan in the
storyboard; the moving file is built at §5.6 before approval.

If even one filmed scene exists, §6 authors **`script.md` (the shooting script)** and the
hand-off after approval is filming (§7). The contract is `references/scenes-schema.md`
§filmed scenes; `references/shot-script-template.md` is the source of truth for the
document structure.
