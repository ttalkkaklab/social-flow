# Explicit subtitle inputs

`cards.tsv` column 5 accepts `subs=timing.tsv,subs-mode=replace`. Relative file paths
resolve from the assembly work directory. Omit `subs-mode` or use `append` to retain
the legacy automatic-plus-file behavior, including clipping and word/phrase splitting.

Replacement timing files contain `start<TAB>end<TAB>sentence`, in seconds from the
card start. Keep scenes.js and segs.tsv narration intact. The file must contain one
row per nonempty source `narration[].sub` (falling back to `tts`), in that exact order
and with exact text. An explicit empty source sub has no cue. A replacement cannot
add, remove, split, merge, reorder or rewrite the source sentences.

Times must be finite nonnegative decimal seconds, increasing within each row,
nonoverlapping, and inside the measured output card duration. The source scene
duration is an estimate, not the assembly clock. Preflight checks shape/text/order;
after trimming, the builder checks ranges against exact frame length before encoding
the card. No clipping or range tolerance applies to replacement files. Intervals
must survive ASS centisecond precision. Empty/malformed rows and ASS control characters
(`{`, `}`, `\`) are rejected; blank lines and `#` comments are allowed. The last row
can omit its final newline. SRT and ASS both use these sentence cues even when the
global `SUB_MODE` is `word` or `phrase`. Other cards keep their chosen automatic mode.
Replacement output windows round inward to shared centisecond ticks (start up, end
down), so both formats stay inside the exact frame-based card clock. A window that
collapses after this rounding is rejected. Check the final subtitle rate after rounding.

All `subs=` file bytes, including legacy append files, enter the assembly input SHA
proof and video-warning fingerprint. Changed/missing files require a fresh preflight
and any current warning approval. The builder checks the original file against that
proof again before encoding the card, and the final verifier rejects absent/stale subtitle
provenance. Checked snapshots are temporary builder files, not new source inputs.
Neither mode establishes that a timestamp matches speech: review timings against
the current WAV. Replacement does not change audio trim, tempo, visual reveal timing
or the final speech-rate cap.
