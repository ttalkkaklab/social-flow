# Still generation — the images the storyboard planned

The procedure for produce §1.5. The storyboard decided every still's prompt, engine and size
and generated nothing (storyboard §5, owner directive 2026-09-04 — a plan the user rejects
must cost nothing). This file is the execution half: which engine each still goes to, how the
call is made, what disqualifies the picture that comes back, and what gets written into the
ledger.

**Nothing here re-decides the plan.** `visual.bgPrompt` arrives assembled and machine-checked;
resend it as-is. A changed `shot` field is the one reason to rerun `assemble-bg-prompt.js`, and
then only from the fields — never by editing the stored string by hand.

## Contents

- [1. Which engine, and why](#1-which-engine-and-why)
- [2. Making the calls](#2-making-the-calls)
- [3. The image check](#3-the-image-check)
- [4. The ledger](#4-the-ledger)

## 1. Which engine, and why

Measured 2026-08-12 (`docs/research/2026-08-12-local-image-generation`).

| Still | Engine | Price | Why |
|---|---|---|---|
| points backgrounds | `image_local_generate` (Z-Image) | $0 | the default; a few minutes each, so queue them sequentially |
| cover background (scene-1) | `gpt_image_text2img` `quality:"high"` | $0.22 | it is the thumbnail *and* veo's input — the quality clause |
| any screen with text in it | `gpt_image_text2img` | per quality | the local engine breaks Korean jamo ("딸깍연구소" → "달닥연구소") |
| a scene with `visual.character` | `gpt_image_img2img` | per quality | the panels are the input, not a description |

The storyboard wrote the choice into `.work/decisions.tsv` and, where a scene departs from
the default, into the scene. Follow it. **A departure invented at call time generates
something nobody approved.**

`mlx_image_generate` / `mlx_image_edit` are an optional extra local lane when MLX Core is up.
They do not replace Z-Image as the default and they do not take Hangul; the plugin never
launches the app, so a down `:11234` fails closed. On a machine without mflux,
`image_local_generate` fails with install instructions — fall back to `gpt_image_text2img`
(quality `"low"`) for that episode only, and say so in the completion report.

**Backgrounds that become video sources** — a scene with b-roll attached, a motion-background
scene — are photorealistic people on gpt high, never the local engine. Blurry or peopleless,
and those 8 seconds look like a still frame.

## 2. Making the calls

Read the size off the preset rather than typing it:

```bash
PG=${CLAUDE_PLUGIN_ROOT}/skills/platform-guide/references
node $PG/format-resolve.js storyboard/scenes.js --json | python3 -c \
  'import json,sys; f=json.load(sys.stdin); print(f["format"], f["image"])'
# shorts-9x16       {'gpt': '1088x1920', 'local': '1088x1920', …}
# youtube-long-16x9 {'gpt': '2560x1440', 'local': '2048x1152', …}
```

Portrait is 1088×1920 rather than an exact 9:16 because of gpt-image's multiple-of-16
constraint; it cover-crops onto the 1080×1920 canvas, so the 0.7% difference is ignorable.

Save each one as `storyboard/images/scene-<n>.png`, `<n>` counting from 1 — the same number
the strip calls "Shot n". Slide scenes have no still here (their screen is HTML, authored at
§3.6), and shooting mode has none at all.

**A character scene is a reference call.** Resolve the id to its panel directory and pass the
panels as input images, **face first, then body**, `back.png` third only on a back-facing shot.

```bash
CH=$(python3 ${CLAUDE_PLUGIN_ROOT}/skills/channel/references/resolve-asset.py "$CHANNEL_DIR" character claude)
```

Never merge the panels into one sheet before passing them
([video-model-selection.md](video-model-selection.md) §6). This is the same set the video
engines get in §3, and using it here is what keeps the character the same person from the
still to the clip.

**Negative directions ride in the body.** Neither `gpt_image_text2img` nor
`image_local_generate` takes an exclusion argument, so the short noun list the storyboard put
in through `--exclude` stays inside `bgPrompt`. Don't write instruction-form negatives into
the body — "no maps" draws a map (measured: 4 of 4 failed). An element that keeps coming back
gets designed out of the scene sentence instead.

## 3. The image check

**Look at the picture that came out.** Open every `images/scene-*.png` (and the
`narration[].img` files in illustration mode) once with Read against that scene's `shot.info`
and narration. The criterion is right, not pretty. No reviewer is delegated — the image review
of 0.49 cost six million tokens a read (measured) and your own look costs nothing. Shooting
mode skips this entirely.

What disqualifies an image:

- a picture unrelated to what the scene says
- a baked-in pseudo-character or a lookalike glyph
- readable text (unless the scene asked for it and went to gpt)
- a real person on a channel that generates its people
- a bright lower third that will drown the subtitles

**Remake only what fails, once.** Add the correction on top of the original prompt — don't
re-describe it wholesale, which loses the elements that had passed. Props with text engraved
on them (keyboards, calculators, signboards) can't be blocked with negative directions; taking
the object out of the composition is the answer.

**If the remake still looks wrong, don't buy a third attempt.** Put it to the user with
AskUserQuestion — the picture, what is wrong with it, and the options [ship it / one more
remake / change the scene]. Under storyboard's old §5.5 this landed on the approval screen;
after the split there is no later screen, so this is where a human looks. On the unattended
path (autoproduce §6.5) the same situation writes `queue_*: hold` at wrap-up instead.

## 4. The ledger

**One line per call, written right after the call** — batching it later loses the
regenerations. The convention is
[cost-tally.md](../../autoproduce/references/cost-tally.md).

```bash
printf 'image.gpt-image-2.high\t1\tproduce: cover background scene-1\n' >> .work/cost-tally.tsv
printf 'image.local\t3\tproduce: points backgrounds scene-2~4\n'        >> .work/cost-tally.tsv
printf 'image.gpt-image-2.high\t1\tproduce: §1.5 remake scene-1\n'      >> .work/cost-tally.tsv
```

Log local images too — the unit price is 0 so the total doesn't move, but the report showing
how many went where is what separates "image cost 0" as a tallied result from a tallying gap.
The `quality` of `gpt_image_text2img` decides the key (`high`·`medium`·`low`), and a discarded
remake still gets billed, so it gets its own line.

The storyboard's `SB_DOC.cost` is a **projection**, not a receipt — §10 compares the two, and
that comparison is only possible if every call here left a line.
