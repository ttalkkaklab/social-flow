# Splicing in the b-roll — trim, level, bed, then the splice at each `after` scene

The procedure produce §6 hands off to when §3 made a b-roll inside the approved channel
cap, run before the §7 build report gate.

The generated-video stretches get inserted **after the build finishes**, at time T where each
slot's `after` scene ends. `build-reel.sh` only splices the outro, so this is post-processing
outside the builder.

Before splicing, handle **trim + loudness normalization + BGM in a single re-encode** per
slot — cut the broll scene's `duration` (the used length) out of the 8-second original while
matching the veo sound to the body's level and laying the BGM on (generated sound is quieter
than the body — measured at mean −18 to −22dB on person sources):

```bash
BED=${CLAUDE_PLUGIN_ROOT}/skills/produce/references/bgm-bed.sh
mix_broll() {           # mix_broll <after> <used length in seconds> [cue file]
  local A=$1 USE=$2 SRC=${3:-bgm.wav}
  # Same conditioning the feature gets: the clip's own voice is normalized to -20, so the bed is
  # measured and set 10 LU under that. A raw multiplier here would put the b-roll's music at a
  # different distance from the voice than the rest of the episode, on the same bed file.
  printf '0.0000\t%s\n' "$SRC" > .work/bedcue.list
  ( cd .work && "$BED" bed-broll.wav "$USE" "$(awk -v s="${BGM_SEP:-10}" 'BEGIN{print -20 - s}')" bedcue.list )
  ffmpeg -y -i .work/broll/broll-a$A.mp4 -i .work/bed-broll.wav \
    -filter_complex "[0:a]loudnorm=I=-20:TP=-2:LRA=7[va];
      [1:a]afade=t=in:st=0:d=0.4,afade=t=out:st=$((USE-1)):d=1[bg];
      [va][bg]amix=inputs=2:duration=first:normalize=0[a]" \
    -map 0:v -map "[a]" -r 30 -c:v libx264 -profile:v high -level 4.1 -pix_fmt yuv420p \
    -c:a aac -ar 48000 -ac 2 -b:a 192k .work/broll/broll-a$A-mixed.mp4
}
mix_broll 0 4          # pass the broll scene's after and duration from scenes.js as they are
mix_broll 3 4          # if there's a second slot
```

**A b-roll stretch gets the cue that is playing where it splices in** — pass that cue's file as
the third argument. Leave it out and it plays the opening bed, which under a `tense` section is an
audible jump back to the theme in the middle of a scene.

**Don't cut the mixed file again** — the fades are pinned to its length, so cutting loses the
tail fade and shifts the BGM fade out of place. To change the length, re-mix from the
original clip. (A 24fps veo clip gets its 30fps re-encode here at the same time.)

Get the insertion time T by **accumulating the confirmed lengths up to the `after` card** from
the `card` lines in `build-report.txt`. broll and outro aren't in the manifest and broll
scenes sit at the end of the array, so **body scene index = card index** holds directly.

```bash
cardend() {   # cardend <after> — sum of confirmed lengths for cards 0..after = when that scene ends
  awk -v n="$1" -F'|' '/^card /{ split($1,a," "); if (a[2]+0 <= n) { gsub(/[^0-9.]/,"",$(NF-2)); s += $(NF-2) } }
                       END{ printf "%.3f", s }' .work/build-report.txt
}
$REF/splice-clip.sh .work \
  .work/broll/broll-a0-mixed.mp4 "$(cardend 0)" \
  .work/broll/broll-a3-mixed.mp4 "$(cardend 3)"
# → reel-spliced.mp4 · reel-sub-spliced.mp4 · subs-spliced.srt
```

- **Pass both slots in a single call.** Call the script twice and the second call re-reads
  `reel.mp4`, wiping out the first splice (the input and output names are fixed). Give both
  T values **on the original timeline** — don't pre-add the length the earlier clip will push
  out. The script does the pushing math.
- **Don't eyeball T** — a card's confirmed length (seconds after frame rounding) is when the
  scene ends. Approximate it and the last frame of that scene gets cut off.
- Splice the clean and burned-in versions **separately, at the same T with the same clip**.
  The burned-in version already has the subtitles on screen so it needs no timecode shift, and
  the builder's ASS styling is preserved (re-burning from the srt changes the font, position,
  and outline from the original).
- Each cue in `subs.srt` shifts back by **the sum of the measured lengths of the clips
  inserted before it**. Use the value **measured with ffprobe after re-encoding**, not the
  nominal length (for example 4 seconds) — frame rounding throws it off by tens of
  milliseconds, and that error accumulates to the end of the video and pushes the subtitles
  out of sync.
- **Confirm that 0 subtitle cues straddle T** (the script reports per T). A straddle drops the
  b-roll into the middle of a sentence — move that T to a sentence boundary.
- After splicing, check that **the clean and burned-in versions have the same length**. A
  mismatch means one side's pieces got cut wrong. An output length tens of milliseconds above
  "expected" is normal (each piece rounds up to a frame boundary) — with two slots there are
  three pieces, so that error grows a little.

There's one reason to keep the burned-in version (`reel-sub.mp4`) around — **Instagram has no
path for a subtitle file.** The IG Content Publishing container has no subtitle parameter, so
there, burning them into the picture is the only way to deliver subtitles. The two files are
each encoded from the same original, so both are first-generation (the clean one isn't
re-encoded), and the builder verifies that the lengths match.

