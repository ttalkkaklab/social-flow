# Episode decision log — why this episode was made the way it was

An episode picks an engine, a voice, a music source, a tier, a fallback. Right now none of
that survives the run. `scenes.js` gets two lines at approval (`// approved:` and
`// review:`), `build-report.md` carries the one allowed deviation, and everything else — which
engine was considered and dropped, why the b-roll went to Veo instead of Seedance, that the
motion background fell back because `ARK_API_KEY` was missing — lives only in a session
transcript nobody reads again.

That matters most exactly when something went wrong. An episode that cost triple has a reason,
and the reason is a choice somebody made two sessions ago.

```
data/<channel>/episodes/<topic>/.work/decisions.tsv
```

## The line format

Five tab-separated columns. Comments (`#`) and blank lines are skipped.

```
stage <TAB> category <TAB> subject <TAB> selected <TAB> reason
```

```tsv
storyboard	engine_selection	motion background shot 2	seedance-1-5-pro-silent-1080p	silent slot, builder discards audio — 4x cheaper than veo lite here; rejected veo.lite (pays 8s for a 4s cut)
storyboard	image_engine	points backgrounds	image_local_generate	local Z-Image, $0 — no text in frame; rejected gpt high (cost, not needed without text)
produce	voice_selection	narration TTS	tts_local	profile §2 voice, offline; rejected gemini-flash (voice changes mid-series)
produce	fallback	motion background shot 2	veo_img2video	ARK_API_KEY absent — seedance route unreachable, logged in build-report.md
```

- **stage** — `storyboard` · `produce` · `publish`. The same prefix vocabulary the cost ledger
  memo column uses, for the same reason: one file reads per stage without a sixth column.
- **category** — from the fixed list below. An invented category makes the log unreadable by
  anything but a person, so `decisions.sh --check` rejects one.
- **subject** — *what* the decision is about, in your words. **This is the key, together with
  category.** A later decision that replaces an earlier one repeats both verbatim.
- **selected** — the option taken. A tool name, model id, or short slug.
- **reason** — why, and **what was rejected and why**. A reason with no rejected alternative is
  a note, not a decision: if nothing else was possible there was no choice to record.

## Categories

| Category | For |
|---|---|
| `engine_selection` | which video engine a generated shot goes to |
| `image_engine` | local vs gpt, and the quality tier |
| `voice_selection` | TTS provider, voice, multi-speaker split |
| `music_source` | channel bed, generated cue, Suno, or none |
| `format_selection` | short-form vs long-form, filmed vs generated |
| `tier` | economy vs escalation, and the model rung inside a family |
| `fallback` | a route taken because the planned one was unreachable |
| `scope` | a scene, slot, or claim dropped, and why |
| `publish_target` | which platforms, and which ones were held back |
| `approval_policy` | a standing authorization the user gave beyond one gate |

## Append, never edit

**A decision that changes gets a new line with the same `category` and `subject`.** Don't
rewrite the old one. The file is the history of the episode, and an overwritten line turns a
change of mind into something that looks like it was always true — which is exactly the
question you'd be opening the file to answer.

```tsv
produce	voice_selection	narration TTS	tts_local	offline, profile §2 voice; rejected gemini-flash
produce	voice_selection	narration TTS	tts_elevenlabs	user asked for the warmer read; supersedes tts_local (accent on 안녕하세요 was flat)
```

`decisions.sh` reads the last line per `(category, subject)` as current and marks it `revised`.
Reword the subject and you get two decisions instead of one revision, so keep it verbatim.

## Reading it

```bash
REF=${CLAUDE_PLUGIN_ROOT}/skills/autoproduce/references
$REF/decisions.sh .work/decisions.tsv              # current decisions, superseded ones folded in
$REF/decisions.sh .work/decisions.tsv --all        # full history in order
$REF/decisions.sh .work/decisions.tsv --check      # format and category check only
```

Exit codes: `0` ok · `1` a bad category or a malformed line · `3` input error.

## What doesn't go in

Not a diary. One line per decision that **could have gone another way and will be asked about
later** — the engine, the voice, the tier, the fallback, what got cut. Not the shot list (that's
scenes.js), not the review scores (the approval comment on scenes.js), not the spend (the cost
ledger). If the only honest reason is "it's the default and nothing argued otherwise", the
decision isn't worth a line.

## Related documents

- `cost-tally.md` — the episode cost ledger, same directory, same memo-prefix convention
- `../../produce/references/video-model-selection.md` — the routing rules an `engine_selection`
  line is deciding against
