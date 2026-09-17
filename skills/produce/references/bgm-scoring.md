# Scoring the bed — the numbers, and how much each one is worth

Two kinds of statement live in this file and they are not worth the same. **Levels** come from
peer-reviewed listening tests and published delivery specs, and the builder enforces them.
**Craft** — where a cue changes, when the music drops out — has no primary source behind it;
a five-angle source sweep came back with zero verified claims on cue-unit scoring, hit points,
riser lead times, sidechain parameter values, or 2–4kHz carving. Those are written here as our
working practice, marked as such, and the way to settle them is an A/B in our own pipeline.

---

## Contents

- [1. Levels — the part with evidence](#1-levels-the-part-with-evidence)
- [2. What the builder does with all that](#2-what-the-builder-does-with-all-that)
  - [Effects and room tone — measured like the bed](#effects-and-room-tone-measured-like-the-bed)
- [3. Cues — this part is craft](#3-cues-this-part-is-craft)
- [4. Generating a bed](#4-generating-a-bed)
- [5. What did not survive](#5-what-did-not-survive)

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
- **The separation is verified — while the voice is up.** Step 10c taps the ducked bed off
  before it meets the voice and measures it twice: once gated by the voice (a sidechain gate on
  the ducker's own key and threshold, so only the bed under speech reaches the R128 integration)
  and once across the whole timeline. The gated reading is speech-to-background *during speech*,
  the quantity the listening tests above measured, and it is the one checked against
  `BGM_SEP_MIN` (4): under it the build **stops**; no wider than the resting distance means the
  sidechain never fired, which is a warning. The whole-timeline figure stays in the log; it has
  the un-ducked gaps in it and reads lower, and the distance between the two is how far the bed
  rises between sentences. Measured on one 71 s TTS episode (pundago ep421): 25.8 LU under
  speech against 14.4 LU whole-timeline, so the ducker at ratio 8 is taking about 16 LU off the
  bed while the voice is up. The guides' "deep" ducking is 6–10 dB; ours sits past that, which is
  the first A/B to run — `DUCK_RATIO`, `DUCK_ATTACK` (20 ms) and `DUCK_RELEASE` (250 ms) are env
  knobs on both builders for exactly that. Guide ranges: attack 10–20 or 30–60 ms, release
  200–500 ms and 400–700 if it pumps; all of it craft grade.
- **The hook opens over a quieter bed.** `build-reel.sh` adds `BGM_HOOK_LU` (6) to the distance
  while card 0 runs and ramps back over `BGM_HOOK_R` (2.0 s) from the start of card 1, on the
  one-bed path too. That is §3's own rule made mechanical, not evidence — measured −32.3 LUFS
  under the hook against −26.8 after the ramp on ep421. `BGM_HOOK_LU=0` turns it off.
- **A bed EQ, off by default.** `BGM_EQ=N` scoops N dB out of the bed at 250 Hz and 2.5 kHz — the
  two carve points the mixing guides name (mud under the voice, consonants). Craft grade with no
  listening test behind it, so it exists to be A/B'd, not assumed; at 4 dB it also lowers the
  bed's integrated level by about 2 LU, which the separation reading shows.
- **A cue is rendered to its span plus the handover.** `bgm-bed.sh` renders every cue but the last
  `BGM_CUE_XF` longer than its span so it has something to crossfade out of; the last cue is
  rendered to its span exactly (it used to get the extra 2 s and have them trimmed, so a cue
  generated to the span looped for them). A generated cue that comes up short is crossfaded
  onto itself at the boundary and the log says the exact span to regenerate at. The length to
  ask for: scenes.js `duration` is not what the builder cuts — a card runs its trimmed TTS plus
  about a second of padding — so add up the trimmed TTS lengths of the shots the cue covers,
  about 1 s per shot for the padding, and `BGM_CUE_XF` (2 s) for the handover; round up.

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

### Effects and room tone — measured like the bed

`sfx.tsv` effects used to play at a fixed knob (`SFX_VOL` 0.85) on top of whatever level the file
was generated at, so two effects from two prompts could land 8 LU apart — the same trap §2
describes for beds. Since 2026-09-16 step 10a measures each file in one `ebur128` pass and gains
it so its **maximum momentary loudness** (the loudest 400 ms — the figure a one-shot is heard
at, where the integrated reading of a 0.8 s whoosh is mostly its own silence) lands `SFX_SEP`
LU under the measured narration, 6 by default, pulled back when the file's own true peak would
pass −1 dBTP. The 6 is practice, not a listening test: mixing guides put effects 4–8 dB under
dialogue on the meters (the research doc's −10 ~ −20 dB range against a −6 ~ −12 dB dialogue
reference), and the ducking key is still the voice alone, so an effect never pushes the bed
down. The report prints where the loudest moment of the whole effects track landed.

Room tone (`amb.tsv`, scenes-schema §sound effects) is the third lane: rendered by `bgm-bed.sh`
exactly like the music bed — measured, gained, self-looped with a crossfade, cue changes
crossfaded, a `-` cue for silence — to `AMB_SEP` LU under the narration, 15 by default, which is
the same JAES paper's figure for ambience under commentary (§1). It is **not ducked**: the
ducker's job is to move music out of the way of a sentence, and a room that dips at every
sentence start is the pumping it was tuned to avoid. Its floor is the sound between sentences,
which is what the 0.79.0 chunk-gap work found the ear reading as a splice when it is digital
silence.

Generated effects and rooms are channel assets — `assets/audio/sfx/<id>.wav`, one
`sfx_elevenlabs_generate` call per id, reused by every later episode; the contract is
scenes-schema §sound effects.

## 3. Cues — this part is craft

A single bed can support the whole episode. Choose changes from the story's turns using
[retention-direction.md](../../storyboard/references/retention-direction.md) §4, then listen
to the final mix using §5. Cue placement is an editorial decision. Autoproduce keeps one
bed and uses supported drops and available SFX; it does not generate multiple cues.

`bgm.tsv` (`idx <TAB> audio-file`) changes the bed at a card and keeps it until the next row;
changes crossfade over `BGM_CUE_XF` (2.0s). The storyboard authors it as `sound.cue` per shot
against the named cues in `window.MUSIC` — see the scenes.js contract.

Our working defaults, all of them ours to overturn:

- **Change the cue where the episode changes what it is doing**, not on a timer — the turn out of
  the hook into the body, the turn into the close. On a 45-second short that is usually one
  change, sometimes none. Three cues in a short is scoring for its own sake.
- **A drop is louder than a hit.** `sound.drop` mutes the bed for a shot (a 0.30s ramp, not a
  cut). Spend it on the one line the episode is actually about — the peak the episode gets
  remembered by (storyboard scenario-craft §7), the `turn` on a story arc; two drops in one
  short and neither reads.
- **The bed starts out of the way and ends with air.** Under the hook, near-silence or a
  low drone — a bed that arrives loud with the first line competes with the one sentence
  that decides whether anyone stays. And don't hard-stop the music at the last word: let
  the tail ring under the closing question, which needs room to hang, not a cut to black.
  Own-channel production guide (2026-08), field practice. Since 2026-09-16 the builder does
  the first half itself (`BGM_HOOK_LU`, §2), so a quiet opening needs no drone cue and no
  drop on the cover.
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

`window.MUSIC` takes that format directly — `prompts: [{ text, weight }]` with `density` and
`brightness`, which produce sends to `music_generate_advanced` (scenes-schema §music cues). Two
cues that share their text and differ in weights move less at the crossfade than two written
from scratch.

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
The survey behind the 2026-09-16 changes — the guide ranges for ducking and EQ, the platform
figures and the generator prompt grammars, drawn as charts with an evidence grade on each
number: `docs/research/2026-09-16-bgm-direction/index.html`.
