# Scoring the bed — the numbers, and how much each one is worth

Two kinds of statement live in this file and they are not worth the same. **Levels** come from
peer-reviewed listening tests and published delivery specs, and the builder enforces them.
**Craft** — where a cue changes, when the music drops out — has no primary source behind it;
a five-angle source sweep came back with zero verified claims on cue-unit scoring, hit points,
riser lead times, sidechain parameter values, or 2–4kHz carving. Those are written here as our
working practice, marked as such, and the way to settle them is an A/B in our own pipeline.

---

## 1. Levels — the part with evidence

**The bed sits 10 LU under the speech.** Two independent listening experiments from the same
group agree on the size and the direction: a QoMEX 2023 study (Fraunhofer IIS / AudioLabs
Erlangen) found preferred loudness differences about 5 LU smaller for music than for ambience
(p < 0.001), and JAES 67(12) 2019 puts the preferred distance at **at least 10 LU for
commentary-over-music** and at least 15 LU for commentary-over-ambience. The papers define
1 LU = 1 dB, so the number transfers to a gain directly.

**4 LU is the floor, not the target.** UK DPP's delivery spec recommends a minimum separation of
4 LU between dialogue and background, and an AES 156th Convention paper (2024) repeats it while
saying plainly that these "are only general guidelines and not strict rules". The same paper's
short-window analysis treats **speech-to-background under 0 LU** — the music no louder than the
voice — as the point where listening effort measurably climbs. Read 4 LU as the alarm line the
build refuses to cross, never as where the bed belongs.

**Carry the limits with the numbers.** Those experiments are around 20 German-speaking adults
judging 9–14 second broadcast excerpts through DNN-separated stems. Not one of our conditions —
9:16 vertical, Korean TTS, a phone speaker — is in that set, and the same paper reports the
listener explaining more variance (32.31%) than the effect it measured, concluding that "a
one-size-fits-all mixture may not be attainable". 10 LU is where we start, not an answer.

**Loudness range.** UK DPP asks programmes to aim for an LRA of no more than 18 LU and speech in
factual programmes for no more than 6 LU, both explicitly "for guidance only". Our master is
`loudnorm=I=-14:TP=-1.0:LRA=11`, which sits inside that.

**AES TD1008** (2021) recommends −18 LUFS dialog-gated for speech-carrying streams and −1 dBTP at
the codec input. Quote it only with its own scope note: the document states it **is not intended
for sound-with-picture content (OTT or on-demand video)**, so it is background, not our target.

**What the platform does after we upload.** YouTube's own help pages say Stable volume is **on by
default** for video playback and "continuously adjusting volume levels to reduce variations", and
that Voice boost "makes it easier to hear dialogue by reducing background sounds"; a separate page
says YouTube **may automatically apply** those enhancements to uploaded content. So a second round
of ducking can land on top of ours at playback, which is an argument for a bed that is already
comfortably under the voice rather than one riding the line. Meanwhile YouTube's actual upload
spec pages carry no loudness target at all — no LUFS, no dBTP (checked by fetching both pages and
searching the rendered text). The widely repeated "YouTube normalizes to −14 LUFS" is not
YouTube's published number; −14 is our house target, and it should never be attributed to them.
Instagram and TikTok publish nothing we could verify either.

## 2. What the builder does with all that

`build-reel.sh` step 9.5 measures the narration, sets the bed `BGM_SEP` LU under it (default 10;
`build-screencast.sh` uses 12 because a live voice swings more than TTS), and hands the job to
`bgm-bed.sh`. Then step 10 ducks, and step 10c measures what actually came out.

- **The gain is measured, not assumed.** Before this, the mix multiplied the channel's bed file by
  a fixed 0.28 — so the voice-to-bed distance was a property of whichever file the channel
  happened to own. Measured across 11 episodes those source beds ran **−4.2 to +1.0 dBTP**, two of
  them over full scale. Same knob, an 8 LU spread in result.
- **Static gain, never dynamic normalization.** `bgm-bed.sh` measures once and applies a plain
  `volume`. Running loudnorm's dynamic mode on a bed compresses it, and a compressed bed is
  exactly the one that crowds the voice in the gaps.
- **True peak is clamped.** If the target gain would push the bed's own peak past −1 dBTP, the
  gain is pulled back to whatever keeps it under.
- **The separation is verified.** Step 10c taps the ducked bed off before it meets the voice,
  measures both, and reports `speech − bed` in LU. Under `BGM_SEP_MIN` (4) the build **stops**;
  no wider than the resting distance means the sidechain never fired, which is a warning. The
  reading covers the whole timeline, un-ducked gaps included, so it reads conservative — it can
  understate the distance during speech, never overstate it.

**The outro keeps its fixed multiplier.** `build-outro.sh` still runs `BGM_VOL 0.30` on purpose:
it is a few seconds long, it carries its own music rather than a bed under a narration, and its
voice track can legitimately be silent — which is the one input the measurement can't take. Don't
"fix" it to match the two builders.

**The loop seam.** `-stream_loop` butt-joins the last sample to the first; a bed that does not
happen to end on its own downbeat clicks once per lap. Measured on our 90s meleon bed: 2005 → 0
in a single sample at 90.00s. `bgm-bed.sh` crossfades the bed onto itself instead
(`BGM_LOOP_XF`, 2.0s). In a synthetic reproduction the butt-join left a sample jump 4.4× the
local median at every lap; the crossfaded render left none. The better fix is still to not loop
at all — `music_generate` takes an exact length up to 300s.

## 3. Cues — this part is craft

A single bed under a whole episode is the thing this section exists to replace, and nothing in
the literature says where a cue should change. What we have is the machinery and a default.

`bgm.tsv` (`idx <TAB> audio-file`) changes the bed at a card and keeps it until the next row;
changes crossfade over `BGM_CUE_XF` (2.0s). The storyboard authors it as `sound.cue` per shot
against the named cues in `window.MUSIC` — see the scenes.js contract.

Our working defaults, all of them ours to overturn:

- **Change the cue where the episode changes what it is doing**, not on a timer — the turn out of
  the hook into the body, the turn into the close. On a 45-second short that is usually one
  change, sometimes none. Three cues in a short is scoring for its own sake.
- **A drop is louder than a hit.** `sound.drop` mutes the bed for a shot (a 0.30s ramp, not a
  cut). Spend it on the one line the episode is actually about; two drops in one short and
  neither reads.
- **The crossfade lands on the card start**, so the incoming cue arrives with the picture rather
  than after it.
- **Don't score against the narration's own rhythm.** The one BPM finding that survived
  verification is about persuasion, not retention — high-tempo instrumental beds (120–160) beat
  low-tempo and no-music in an expert-explainer misinformation-correction experiment (JCMC 2024,
  N=873), by distraction rather than comprehension, and with no effect at all on testimonial
  videos. That is a single unreplicated study in a different outcome, so it is a reason to try a
  faster bed on explainer episodes, not a rule.

## 4. Generating a bed

`music_generate` (exact length 5–300s, `bpm`, `scale`, `seed`) is the lane for a bed that has to
fit a span, and `seed` is the only reproducibility control there is. `music_generate_clip` returns
a fixed 30s clip. Both are Lyria, both instrumental-only, and both carry a SynthID watermark.

Lyria RealTime takes **weighted prompts**, not a paragraph: each is `{text, weight}`, weight can be
anything but 0, and 1.0 is the documented starting point. Weights inside one message are
normalized, so only the ratios matter — blending is what the format is for (`Piano` 2.0 +
`Meditation` 0.5 + `Live Performance` 1.0 is the vendor's own example). Prompt vocabulary comes
from three groups — instruments, genre, mood — and the vendor calls its list non-exhaustive.
Changing `bpm` or `scale` mid-stream needs a context reset, and the vendor recommends crossfading
prompt changes because transitions "can be a bit abrupt".

For our purpose the prompt has one job beyond mood: **leave the voice its band**. "leaves space for
a spoken voiceover, no melody in the vocal frequency range" is the established wording. The bed is
instrumental by construction — sung vocals fight the voiceover, which is why `suno_generate` is
for episodes where the song itself is the piece.

## 5. What did not survive

These are widely repeated and were **refuted under three-vote adversarial verification**. Don't
cite them, here or anywhere else:

- Netflix's "−27 LKFS dialog-gated, −2 dBTP" mix spec, and Netflix LRA targets of 4–18 LU / 10 LU
  for dialogue. Unanimously refuted — and this is the single most-quoted number in "cinematic
  narration mix" advice.
- Reading the DPP's 4 LU as *where the bed belongs* rather than as a floor.
- TD1008 requiring a stricter true-peak ceiling at low bitrates.
- "Speech at the same integrated loudness is perceived 2–3 dB louder than music."
- The EEG alpha-suppression and P300 figures for background music under film scenes.
- Tempo entrainment as a moderator in the background-music meta-analysis, and that
  meta-analysis's reading as evidence that music harms reading or memory. The global claim in the
  other direction — that adding a bed raises immersion or retention — is **also** unsupported:
  the adult meta-analysis finds a null global effect made of effects pointing opposite ways.
- Major/minor mode as an emotional lever: pooled SMD 0.2167 (p = 0.001) but a prediction interval
  of −0.2341 to 0.6675, which crosses zero.

Sources for §1: [QoMEX 2023](https://arxiv.org/abs/2305.19100) ·
[JAES 67(12) 2019](https://www.aes.org/publications/elibrary-page/?id=20711) ·
[AES 156th Convention 2024](https://arxiv.org/html/2405.17364v1) ·
[UK DPP / Channel 4 delivery spec v5.2](https://assets-corporate.channel4.com/_flysystem/s3/documents/2023-03/ProgrammeDeliverySpecificationFile_DPP-Channel4_v5.2.pdf) ·
[AES TD1008.1.21-9](https://aes2.org/wp-content/uploads/2024/01/20210924_TD1008_v3.13.pdf) ·
[YouTube stable volume & voice boost](https://support.google.com/youtube/answer/14106294) ·
[YouTube automatic enhancements](https://support.google.com/youtube/answer/16619284).
§3's BPM note: [JCMC 29(5) zmae007 (2024)](https://doi.org/10.1093/jcmc/zmae007).
§4: [Lyria RealTime docs](https://ai.google.dev/gemini-api/docs/music-generation).
