# Per-episode cost ledger — storyboard through video, one file

The money an episode costs doesn't all go out at production time. **One cover
background is already $0.22** — and it's made at the storyboard stage, usually
days before the video, in a different session. Two rounds of the image
regeneration loop and half the episode's spend is committed before a video
file even exists.

So the ledger lives **in the topic directory and the two skills write it in
turn.** storyboard writes the first lines, produce continues them, and produce
§10 tallies the whole episode from that one file.

```
data/<channel>/episodes/<topic>/.work/cost-tally.tsv     ← the ledger (shared by storyboard·produce)
data/<channel>/episodes/<topic>/.work/cost-forecast.tsv  ← the video-slot projection (storyboard §6, written by cost-preview.js)
data/<channel>/episodes/<topic>/.work/cost-estimate.tsv  ← the whole-episode projection for the cap verdict (autoproduce §5)
data/<channel>/episodes/<topic>/output/video/cost-report.txt  ← the tally result (made by produce §10)
```

**Three files, three jobs — they never overwrite each other.** `cost-tally.tsv` is the only
record of money actually spent. `cost-forecast.tsv` is what approving the storyboard would
commit, and it holds generated-video slots alone. `cost-estimate.tsv` belongs to the unattended
loop's cap check and covers the whole episode. cost-preview.js reads the first and writes the
second; it never touches the third.

`.work/` is gitignored, but no skill has a step that deletes the directory.
storyboard creates it with `mkdir -p .work` and writes from the first line.

## Contents

- [Line format](#line-format)
- [Quantity — an amount in the unit, not a count](#quantity-an-amount-in-the-unit-not-a-count)
- [The report](#the-report)
- [Reading exit codes — never read 1 as a pass](#reading-exit-codes-never-read-1-as-a-pass)
- [The second record — `.work/events.jsonl`](#the-second-record-workeventsjsonl)
- [Before the money goes out — the approval-screen preview](#before-the-money-goes-out-the-approval-screen-preview)
- [Related documents](#related-documents)

## Line format

Three tab-separated columns. The calculator skips comments (`#`) and blank
lines.

```
key <TAB> quantity <TAB> memo
```

```tsv
image.gpt-image-2.high	1	produce: cover background scene-1
image.local	3	produce: points backgrounds scene-2~4
image.gpt-image-2.high	1	produce: §1.5 remake scene-1
veo.lite.1080p	8	produce: b-roll a1 — 8s generated, 4s used
tts.local	0.412	produce: narration, 412 chars
music.lyria-clip	1	produce: BGM 30s
```

- **key** is `prices.tsv`'s first column, verbatim. Invent a key that isn't
  there and the report stops.
- **Prefix the memo with the skill that made the call.** The report table then
  separates the stages without adding a column (add a column and the format
  diverges from what autoproduce writes). Since 2026-09-04 every line on the
  attended path says `produce:` — the storyboard generates nothing — and
  `storyboard:` lines survive only in episodes older than that.
- **Log discards too.** Images regenerated after the produce §1.5 image check, clips
  redrawn because you didn't like them, TTS rerun after failing the length
  check — they don't reach the deliverable, but they do get billed.

## Quantity — an amount in the unit, not a count

`prices.tsv`'s `unit` column decides. Get this wrong and the total drifts
silently.

| Key | Unit | How to write it |
|---|---|---|
| `image.*` | image | number of images made (`image.local` and `image.mlx` are $0) |
| `veo.*` | second | **generated length**. Generate 8s and use only 4s, still `8` (1080p is 8s-only) |
| `seedance.*` | second | the requested `durationSeconds` as-is. Note the response's `completion_tokens` in the memo |
| `video.mlx` | second | `numFrames` ÷ 24 (LTX is 24 fps) |
| `tts.*` | 1000 chars | **characters ÷ 1000**. 412 chars is `0.412`. `mlx_tts_generate` counts `input` |
| `music.lyria-clip` | clip | number of clips |
| `music.mlx` | second | `durationSeconds` |
| `3d.mlx` | mesh | 1 per call |

Writing TTS as `412` is the most common mistake. The local engine's price is 0
so it doesn't show, but make the same mistake on a Gemini channel and that line
inflates 1,000x.

Veo invites the opposite mistake — write 4 seconds because you only used 4,
and half the actual bill disappears. 8-second generation is 1080p's only
option.

## The report

There is one calculator: `cost-report.sh`. The same one serves the pre-spend
estimate and the post-hoc tally.

```bash
REF=${CLAUDE_PLUGIN_ROOT}/skills/autoproduce/references
$REF/cost-report.sh .work/cost-tally.tsv > output/video/cost-report.txt; echo "cost_exit=$?"
```

Add `--cap <USD>` only when checking the cap (unattended authoring's pre-spend
verdict — autoproduce §5).

## Reading exit codes — never read 1 as a pass

| exit | Meaning | What to do |
|---|---|---|
| 0 | ok | the total is the episode's cost |
| 1 | verdict unavailable | copy the `!!` lines into your report verbatim (below) |
| 2 | over the cap | cancel the escalation, back to economy baseline (autoproduce only) |
| 3 | input error | fix the path/format first, then rerun |

**exit 1 has two causes, and the responses differ.**

- `!! unknown key` — our mistake. Align the key name with `prices.tsv` and
  rerun.
- `!! price unconfirmed` — an item whose price the vendor doesn't publish.
  Right now that's exactly one: **`music.lyria-realtime` (produce §3's BGM)**.
  In this case the total line still prints, but it's missing that one item, so
  report it as **"total $X + 1 item excluded from the tally (BGM 90s)"**.
  Don't write it as 0 and don't delete the line.

**Never report a $0 total as-is.** If `storyboard/images/*.png` exist but the
ledger is empty, they weren't made for free — the logging was skipped. Count
the files, backfill the ledger, and note the backfill in your report.

## The second record — `.work/events.jsonl`

The tally above is written by hand, which means it depends on somebody remembering. The MCP
server writes its own record at the moment of each generation call, in
`.work/events.jsonl` — one JSON line per call, appended, including failed calls (a retry after
a failure can still have been billed). It lands in whichever episode directory the call's
`outputPath` sits inside; a branding or intro call, having no episode above it, writes nothing.

The two are compared with `events-to-tally.js`:

```bash
REF=${CLAUDE_PLUGIN_ROOT}/skills/autoproduce/references
node $REF/events-to-tally.js .            # per key: server vs tally vs delta · exit 1 = short
node $REF/events-to-tally.js . --tsv >> .work/cost-tally.tsv
```

**The events don't replace the tally.** The server can't see the metered character count
ElevenLabs returns in a header, has no price for Lyria RealTime, and doesn't know that a
generated clip was trimmed or thrown away — all facts a person writes into a memo. So the
tally stays the record and the events are the check on it.

## Before the money goes out — the approval-screen preview

The ledger answers "what did this cost". The person at storyboard §7 is asking a different
question: **"what does saying yes cost me?"** By then the images are already billed, and every
generated-video slot in scenes.js is still free to delete. So one script puts both numbers on
the approval screen.

```bash
REF=${CLAUDE_PLUGIN_ROOT}/skills/autoproduce/references
node $REF/cost-preview.js storyboard/            # human-readable
node $REF/cost-preview.js storyboard/ --sbdoc    # the SB_DOC.cost block to paste
```

It reads `scenes.js` for the video slots, writes the projection to `.work/cost-forecast.tsv` in
this same line format, and runs `cost-report.sh` over both files — so the estimate and the bill
come out of one calculator reading one price table.

**What it projects, and why only that.** B-roll bills `veo.lite.1080p` at 8 seconds however
short the cut is (1080p generates 8s), a motion background bills the seconds it asks Seedance
for, and a quote speech clip bills `veo.fast.1080p` at 8 (veo_reference refuses the lite model
and is pinned to 8s). `visual.engine` / `visual.video.engine` override the route. TTS and music
stay out: `music.lyria-realtime` has no published price, so including it would make every
forecast return exit 1 and show nothing.

**The snapshot goes stale, and the document says so.** `SB_DOC.cost` carries a fingerprint of
the video slots; the storyboard.html check strip recomputes it from the live `SCENES` and raises
a violation when they differ. Regenerate the block after any §7 change that touches a video
slot — the number on the approval screen has to be the number the user is approving.

## Related documents

- `prices.tsv` — price source of truth. The numbers live only there
- `cost-report.sh` — the calculator
- `cost-preview.js` — the approval-screen preview (spent + projected), writes `.work/cost-forecast.tsv`
- `board.js` — one page per channel: every episode's stage, blockers, cost and decisions (`data/<channel>/growth/board.html`)
- `cost-tiers.md` — model ladder, escalation conditions, per-episode cap (unattended authoring)
