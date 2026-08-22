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
data/<channel>/episodes/<topic>/output/video/cost-report.txt  ← the tally result (made by produce §10)
```

`.work/` is gitignored, but no skill has a step that deletes the directory.
storyboard creates it with `mkdir -p .work` and writes from the first line.

## Line format

Three tab-separated columns. The calculator skips comments (`#`) and blank
lines.

```
key <TAB> quantity <TAB> memo
```

```tsv
image.gpt-image-2.high	1	storyboard: cover background scene-1
image.local	3	storyboard: points backgrounds scene-2~4
image.gpt-image-2.high	1	storyboard: §5.5 regeneration scene-1 (round 2)
veo.lite.1080p	8	produce: b-roll a1 — 8s generated, 4s used
tts.local	0.412	produce: narration, 412 chars
music.lyria-clip	1	produce: BGM 30s
```

- **key** is `prices.tsv`'s first column, verbatim. Invent a key that isn't
  there and the report stops.
- **Prefix the memo with `storyboard:` / `produce:`.** The report table then
  separates the stages without adding a column (add a column and the format
  diverges from what autoproduce writes).
- **Log discards too.** Images regenerated after the §5.5 image review, clips
  redrawn because you didn't like them, TTS rerun after failing the length
  check — they don't reach the deliverable, but they do get billed.

## Quantity — an amount in the unit, not a count

`prices.tsv`'s `unit` column decides. Get this wrong and the total drifts
silently.

| Key | Unit | How to write it |
|---|---|---|
| `image.*` | image | number of images made |
| `veo.*` | second | **generated length**. Generate 8s and use only 4s, still `8` (1080p is 8s-only) |
| `seedance.*` | second | the requested `durationSeconds` as-is. Note the response's `completion_tokens` in the memo |
| `tts.*` | 1000 chars | **characters ÷ 1000**. 412 chars is `0.412` |
| `music.lyria-clip` | clip | number of clips |

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

## Related documents

- `prices.tsv` — price source of truth. The numbers live only there
- `cost-report.sh` — the calculator
- `cost-tiers.md` — model ladder, escalation conditions, per-episode cap (unattended authoring)
