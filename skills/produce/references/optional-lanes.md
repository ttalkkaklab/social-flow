# Optional lanes — filmed clips, slides and live voice, screencast splices, extra subtitle languages

Four lanes that only some episodes use. Each one is skipped whole when the episode
does not have that kind of material, so nothing here is on the common path.

## Contents

- [3.5 Take in the filmed clips](#35-take-in-the-filmed-clips-mixed-shooting-episodes-only) — a mixed-shooting episode's footage
- [3.6 Slide scenes and live-voice audio](#36-slide-scenes-and-live-voice-audio-only-on-episodes-that-have-them) — authored HTML screens and `voice/` recordings
- [3.7 Screencast splices](#37-screencast-splices-only-on-episodes-that-have-them) — a recorded screen cut into the reel
- [Multi-language subtitles](#multi-language-subtitles-only-when-the-profile-lists-them) — extra `.srt` tracks beyond the channel language

The step numbers are produce's — §3.5, §3.6 and §3.7 keep their place in the procedure,
and the subtitle lane belongs to §9.

### 3.5 Take in the filmed clips (mixed-shooting episodes only)

**Normalize once** and move the files the user saved in `footage/` into `.work/footage/`.
Don't feed the originals straight to the builder — phone and screen recordings are often
variable frame rate (VFR), and splicing them as-is pushes mouth and sound further apart as
the video goes on.

```bash
mkdir -p .work/footage .work/pcm
for SRC in footage/*.mp4 footage/*.mov footage/*.m4v; do
  [ -f "$SRC" ] || continue
  B=$(basename "${SRC%.*}")
  # the intermediate is .mov — it has to hold lossless PCM so the live voice doesn't take a
  # second generation of loss, and putting PCM in mp4 only became possible in ffmpeg 7
  # (earlier versions refuse the mux). mov is standard on every version and the builder
  # takes .mov directly.
  ffmpeg -y -v error -i "$SRC" \
    -r 30 -vsync cfr -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p \
    -c:a pcm_s16le -ar 48000 -ac 1 ".work/footage/$B.mov"
  # pull the audio **from the normalized file** — that way the card audio and the video
  # track the builder uses come from the same file
  ffmpeg -y -v error -i ".work/footage/$B.mov" -vn -ar 48000 -ac 1 ".work/pcm/$B.wav"
done
```

- **Check first** — does every `visual.clip` on the filmed scenes in scenes.js exist. If even
  one is missing, **stop there** and tell the user which file is empty. Go on without it and
  you get a video with that scene missing, and you find out later.
- **Orientation check**: a portrait clip in a landscape episode makes the builder stop at
  `STRICT_DIM=1` before the first ffmpeg. That's a reshoot, so tell the user right away.
- **Length check**: on a scene that covers narration, the clip has to be longer than
  `narration + PRE + POST`. Too short and the screen freezes at the end — cut that scene's
  script down or get the clip reshot.
- The overlay is **one alpha capture per scene** (a lower third). Reveal enumeration isn't
  used on live-voice scenes — what changes on screen is the recording, not our lettering.

  ```bash
  FORMAT_ENV="$PWD/.work/format.env" \
    $REF/capture-frames.sh "file://$PWD/.work/frame.html?i=<idx>&alpha=1&scrim=1&dim=1" .work/cards/a<idx>.png 1
  ```
- **Subtitles come from the transcript.** Transcribe the clip audio with `ingest`'s
  `transcribe.sh`, correct it, then write `.work/cards/s<idx>subs.tsv`
  (`start<TAB>end<TAB>sentence`) in seconds relative to the card's start. Pass this file as
  the 5th `cards.tsv` column `subs=` in §6 — live-voice scenes skip speech-boundary
  detection, so the subtitle times can only come from the transcript.


### 3.6 Slide scenes and live-voice audio (only on episodes that have them)

A **slide scene**'s segment visuals (`visual.slide`, scenes-schema §slide scenes) are
rendered as **one clip per reveal group** from the storyboard's slide files, not from
`frame.html`. Authoring and the design gate finished in storyboard §5.6; here you only
render and wire. Every slide is a motion slide (`motion: true`).

```bash
REF=${CLAUDE_PLUGIN_ROOT}/skills/produce/references
node $REF/render-motion-slide.mjs storyboard/slides/s<shot number>-<slug>.html \
  --out .work/motion/slide-s<shot number> --segs auto
# → .work/motion/slide-s<shot number>/r1.mp4 … rN.mp4 (30fps CFR, canvas size, no audio) + manifest.tsv
```

**Re-render with measured segment lengths once §5's TTS lands.** `--segs` feeds the
sustain layer (slide-design.md §4): `.sv` elements stretch their meaning motion to the
sentence, so the clip fills the segment instead of freezing after the entrance. `auto`
estimates from characters; after the narration wav exists, measure the real boundaries
and render again over the same `--out`:

```bash
# segment k's window = silence-midpoint k-1 → k on the card's trimmed narration
# (the same silencedetect signal reveal-timing.py reads); last segment += POST (0.45s)
ffmpeg -i .work/pcm/s<shot number>.wav -af silencedetect=n=-35dB:d=0.25 -f null - 2>&1 | grep silence_
node $REF/render-motion-slide.mjs storyboard/slides/s<shot number>-<slug>.html \
  --out .work/motion/slide-s<shot number> --segs 1:3160,2:2840,3:4210
```

`--segs` keys are **groups**, not segments. On an A|B sub-reveal slide (more groups than
segments) `auto` steps aside with a warning — split the segment's measured window at the
reveal point and pass per-group values. A slide from an older template (no `__setSegs`)
renders with a warning and keeps its token durations — the wiring below is unchanged
either way. One seam is by design: a stretched bar fill ends its Heer label delay
(220ms) after the boundary, so the cut crosses a ~98% fill into the next clip's 100%
rest frame — measured invisible at 30fps, don't chase it as a pop.

- The summary line's `groups` must equal the card's segment count (or segments + `A|B`
  sub-reveals). A mismatch is a storyboard §5.6 defect — don't paper over it here.
- Read the coverage warnings: a group frozen past 40% of its segment wants a `.sv`
  sustain in the slide (a storyboard §5.6 fix), and `zone_fill_pct` under 55% is a
  composition defect the design gate should have caught.
- The renderer reads `../scenes.js` relative to the slide, so render it **in place under
  storyboard/slides/**.
- For `shot.infoType` `timeline`, `statistic`, or `principle`, the renderer also compares every
  declared `motionBeats` entry with the rendered `data-primitive` in that group — including
  `shape-enter` · `shape-draw` · `shape-travel` on a principle frame. A missing or undeclared
  movement stops the build; changing a label or adding a decorative rise cannot pass as the
  promised explanation. A principle frame sits ink actors (`h.fig`) and draws hairlines;
  `slide.arts` files sit next to the HTML (`slides/assets/`) as local images the renderer loads.
- The clips cost nothing and are deterministic (same file → same bytes), so a re-render
  after a scenes.js fix is safe; the sheet frames from storyboard §5.6 stay in
  `storyboard/.work/slide-check/` (§5.6 runs from the storyboard directory) for comparison.
- **`slide.kind` changes nothing here.** A kinetic-type screen (`kind: "kinetic"`) and a
  character-act screen (`kind: "character"`) are the same render, the same command, the same
  `@motion/slide-s<n>/r<k>.mp4` wiring — the renderer asks a page for the seek contract and
  doesn't care what the page draws. What the kind decides is which template the storyboard
  authored from and which design section judged it. `motion === true` is required.

An **all-live-voice episode** (`window.VOICE === "user"`) generates no TTS (§5 is skipped
entirely). Filmed scenes pull their audio from the clip per §3.5; every other scene uses
the user's recording at `voice/s<shot number>.wav` (shot number = array position from 1 =
card idx + 1).

```bash
mkdir -p .work/pcm
for SRC in voice/s*.wav; do
  [ -f "$SRC" ] || continue
  # The builder handles trimming and normalization — here we only conform to 48k mono
  ffmpeg -y -v error -i "$SRC" -ar 48000 -ac 1 ".work/pcm/$(basename "$SRC")"
done
```

- **Check first** — does a voice file actually exist for every non-filmed scene that has
  narration? If even one is missing, stop and tell the user which shot is empty.
- Card contract (§6): audio = that wav, on the **normal lane** — do not set `sync=1`.
  Trimming, loudnorm, and sentence-boundary detection are all wanted here (the boundaries
  drive the reveal transitions), and with no mouth on screen there's no sync constraint.
- **Run the build with `ATEMPO_MIN=1 ATEMPO_MAX=1`** — don't apply machine speed
  correction to a human voice (provisional, 2026-08-18, measured on the first live-voice
  build). A speaking-rate REGEN recommendation is not a regeneration target here — that
  shot needs a re-record or a script change.
- If noise at the head of a recording slips under the trim threshold (-50dB) and comes out
  as dead air, trim that one card by hand — also measured on the first episode.


### 3.7 Screencast splices (only on episodes that have them)

A scene with `visual.source === "screencast"` (scenes-schema §screencast splice) is one window
of a screen recording inside an ordinary card. The recording is landscape and the card is the
episode canvas, so the cut, the crop and the fit happen here — `references/cut-screencast.sh`
does all three and hands back a canvas-sized clip the builder plays as an `@` visual. Nothing
in `build-reel.sh` changes.

```bash
REF=${CLAUDE_PLUGIN_ROOT}/skills/produce/references
mkdir -p .work/screencast
# one call per screencast scene — <at> and <focus> come from scenes.js, <card> from the
# duration you computed for that card
$REF/cut-screencast.sh footage/s3-cli-run.mp4 .work/screencast/s3.mp4 \
  --at 12.5-19.0 --focus 160:220:1400:900 --card 7 --bg "$INK"
```

- **Check first**, before any cutting — does every `visual.clip` a screencast scene names exist,
  and does every `at` window end inside that file? The script exits 1 on both, but finding out
  scene by scene is slower than telling the user once.
- `--bg` is `THEME.ink` — the pad around a clip that doesn't fill the canvas is the episode's
  own background, not black.
- **Pass `--card`**. Without it the two length warnings don't run, and a clip longer than its
  card silently loses its ending — the part the scene exists for is usually at the end.
- Read the warnings. A shrink past 3× or a blow-up past 1.5× means the card will be unreadable
  on a phone; the fix is a different `focus` in scenes.js, not a louder title over it.
- Card contract (§6): visual `@screencast/s<n>.mp4::cards/a<idx>r<k>.png` (paths in segs.tsv are
  relative to `.work/`) — the clip with that reveal state's alpha capture over it, the same
  shape a motion-background scene uses. `zoom=none`, and the audio is the scene's ordinary TTS
  on the normal lane. A scene with `sync: true` instead takes `--keep-audio`, feeds
  `.work/screencast/s<n>.wav` as the card audio with `sync=1`, and gets its subtitles from the
  transcript like any live-voice card (§3.5).
- **Several segments on one screencast card: drop the `@`** and repeat the same clip path per
  segment, changing only the overlay. `@` restarts the clip at its first frame, so on a second
  segment it would replay the cut from the top; without it the builder carries the playback
  across the reveal with `-ss`. `@` is right when the card is one segment — which is the shape
  this lane usually wants, one moment on screen.


## From §9 — the extra subtitle languages

#### Multi-language subtitles (only when the profile lists them)

When profile.md §4 has a **Subtitle languages** line naming languages beyond the
default (e.g. `ko (default) · en · vi`), translate **`output/video/subs.srt`** — the retimed
file the speed pass produced, never `.work/subs.srt` — into each extra language yourself and
save `output/video/subs.<lang>.srt` (BCP-47 code — `subs.en.srt`, `subs.vi.srt`). Rules:

- **Cue numbers and timestamps stay byte-identical** — translate the text lines only.
  The timing came from the TTS boundaries, went through the §7.5 speed pass, and holds for
  every language. Translate the un-sped `.work/subs.srt` by mistake and every extra language
  ships on the pre-speed timeline while Korean is on the right one.
- Translate what the subtitle-display column says (numbers and units as written on
  screen), not the TTS reading. Proper nouns, brand names, and on-screen figures stay
  as-is.
- Keep each cue about as long as the original — a cue that doubles in length overflows
  the two-line subtitle band on the phone surface.
- These files ride only on the platforms that take a subtitle file (YouTube ·
  Facebook). The burned-in copy stays in the default language — IG and Threads viewers
  see that one, so there is no re-render per language.

Run the D2/D9 surface check on each translated file the same way as `subs.srt` when the
language is Korean; other languages skip the Korean style gate.

Right after saving, run the style checker per surface — one Bash call, not an LLM call.

```bash
CS=${CLAUDE_PLUGIN_ROOT}/skills/platform-guide/references/check-style.py
python3 "$CS" --selftest >/dev/null 2>&1 \
  || echo "gate_exit=3 (checker missing/broken/rules red — everything below is unverified)"
for P in threads:output/threads/post.md ig:output/instagram/caption.md \
         fb:output/facebook/post.md yt:output/youtube/meta.md; do
  python3 $CS --surface ${P%%:*} ${P#*:}; echo "[${P%%:*}] gate_exit=$?"
done
```

**Once a channel has three or more episodes stacked up, measure the batch too.** The checker
above looks at one episode's copy at a time, so it **can't in principle see** the whole
channel getting stamped from one mold — individual quality and batch diversity move in
opposite directions (measured on the sibling plugin: two manuscripts differing only in subject
each scored 100/100 while overlapping at 0.77). The more episodes pile up, the more real this
axis becomes.

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/skills/platform-guide/references/check-batch.py \
  --split ../*/output/threads/post.md
```

Nothing gets rejected — you only get a ranking. `post.md` holds the body and the operational
notes in one file, so `--split` is required (without the split, the top overlaps fill up with
operational phrasing like "replyToId right after a successful reply post" — measured). Look
only at **pairs of body sections**, and rewrite any phrase in this episode that's been reused.
Don't go back and fix past episodes.

If the checker file is missing, python exits 2 — indistinguishable from a verdict of 2, so put
the existence check first. Never read a broken install as "S1 on every surface" and go rewrite
perfectly good copy.

On exit 2 (S1), fix that file and rerun. When fixing, **only take things away** — plant a
metaphor or stock phrase that wasn't there and that's a new AI tell. Leave numbers, proper
nouns, and hashtags alone (the checker already masks those spans before judging). exit 3 means
the gate never ran, so don't count it as a pass.

exit 1 splits two ways. Accumulated S2 gets fixed; `quote-exempt N` in the header line means
confirming the source — the checker excluded that violation from the score without knowing
whether the source is real. If it's a genuine quotation, leave it and note the count in the
§10 delegation prompt. Otherwise drop the quotation marks and rewrite it in our own words
(quotation marks are a place to earn an exemption, not a place to hide a sentence).
