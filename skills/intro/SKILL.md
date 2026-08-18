---
name: intro
description: >
  This skill should be used when the user asks to "인트로 영상 만들어", "채널 인트로",
  "오프닝 영상", "로고 애니메이션 영상", "make a channel intro video", "create a logo
  sting", or right after /social-flow:branding installs the channel profile image.
  Designs 4 intro concepts (character action × mood × sonic logo) for a HITL pick,
  then generates the character-acting intro with veo (mandatory video-generation path),
  reveals the channel name via a deterministic text plate, aligns a Lyria sonic logo
  to the landing frame, gates through brand-reviewer's intro mode (score ≥90, p0=0),
  and installs master/stinger/lockup/sonic assets under data/<slug>/assets/intro/.
argument-hint: "<channel> [extra instructions]"
allowed-tools: ["Read", "Write", "Edit", "Glob", "Bash", "AskUserQuestion", "Agent", "mcp__social-flow__gpt_image_text2img", "mcp__social-flow__gpt_image_img2img", "mcp__social-flow__veo_img2video", "mcp__social-flow__veo_reference", "mcp__social-flow__music_generate_clip", "mcp__social-flow__tts_generate"]
---

# Channel intro video — data/[channel]/assets/intro/

Makes the intro (logo sting) that the channel's profile character **acts in
person** — in this order: **4-concept HITL pick → veo video generation
(mandatory path) → channel-name reveal + sonic-logo alignment → adversarial
convergence (score 90) → HITL watch approval**. The channel name and tagline
must appear so a viewer knows "what channel this is" within 3 seconds, and a
memorable sonic logo is aligned to the landing frame. The design rationale
lives in `references/intro-playbook.md` — the SoT. **Read it before starting.**

## Deliverables (path contract)

```
data/<slug>/assets/intro/
├── .work/                          # intermediates (not committed)
│   ├── brief.md                    # 4 concepts + pick + veo prompt record
│   ├── lockup.html                 # lockup card instance (template substitution)
│   ├── lockup.png                  # full lockup (background+character+channel name) 1080×1920
│   ├── text-plate.png              # transparent text plate (channel-name reveal)
│   ├── char-card.png               # character card (no text — veo lastImagePath)
│   ├── open-frame.png              # (per concept) opening keyframe
│   ├── intro-raw.mp4               # veo render (regenerations: intro-raw-r2.mp4 …)
│   ├── sonic.wav                   # sonic-logo working copy
│   ├── frames/                     # review frames (from build-intro.sh)
│   └── preview.html                # browser preview (candidate/final check)
├── <slug>-intro-master.mp4         # final master (~4.8s — post-roll closing splice, trailer)
├── <slug>-intro-stinger.mp4        # stinger (≤2.5s — series opener, ultra-compact splice)
├── <slug>-intro-lockup.png         # full lockup card (reused for covers/end cards)
└── <slug>-sonic-logo.wav           # sonic logo (shared across all videos — never regenerate)
```

## Procedure

### 1. Load prerequisites

- `data/<slug>/profile.md` — if missing, stop and point to
  `/social-flow:channel add`. Take §1 identity (topic, target, content
  promise), §3 THEME, and the banned subjects as fixed constraints.
- **Logo (character) master** `assets/branding/<slug>-logo-master-1024.png` —
  if missing, stop and point to `/social-flow:branding` first (the intro is
  built on the finalized character).
- Read `references/intro-playbook.md` — the SoT for concept axes, prompt
  skeletons, and review criteria.
- If an intro already exists, always confirm first — replacing it puts the
  brand tone out of step with existing posts. An existing
  `<slug>-sonic-logo.wav` is **reused by default** (replace only on explicit
  request).
- Check whether `GEMINI_API_KEY` is set — without it `music_generate_clip`
  fails, so announce in §2 up front that the run will proceed with veo native
  sound only, no sonic logo.

### 2. Design 4 concepts → HITL pick

Design **4 distinct concepts** along the playbook §3 axes (character action ×
scene mood × sonic-logo character) — at least one must include the signature
gesture (the action that symbolizes the channel), and spread the emotional
register (energy/trust/wit/cinematic).

Present them as one AskUserQuestion with 4 options — each option is a label
(short concept name) + description (action, mood, sonic logo in one line) +
**a scene scenario in preview** (3–4 lines of what the character does at which
second). Other can carry a blend ("A's action with C's mood") or a full
redesign — fold in a blend and confirm, or build 4 fresh concepts for a redesign.

Record the confirmed concept, scenario, and prompt draft in `.work/brief.md` —
the baseline document for the convergence loop and re-runs. The tagline
(the §1 content promise compressed, 2 lines max) is also finalized here.

### 3. Capture the 3 brand cards (deterministic — logo pixels never pass through a generative model)

sed-substitute `references/lockup-template.html` into `.work/lockup.html` —
`{{INK}}`, `{{ACCENT}}`, `{{ACCENT2}}` (profile §3 hex), `{{CHANNEL_NAME}}`,
`{{TAGLINE}}` (line breaks as `<br>`), `{{LOGO_SRC}}` (the logo master — copy
into `.work/` and reference by file name). Shoot the 3 modes with the shared
produce capture script:

```bash
CAP=${CLAUDE_PLUGIN_ROOT}/skills/produce/references/capture-frames.sh
WD="data/<slug>/assets/intro/.work"
# The intro has no episode scope — we call this from the repo root and only the
# output goes under the channel, so there's no `.work/format.env` to find.
# So pass the window size directly.
# Portrait 1080×1920 equals today's default, so behavior doesn't change. For a
# landscape intro use `CAP_W=1920 CAP_H=1080` and end the URL with `&format=wide`.
CAPENV='CAP_W=1080 CAP_H=1920'
env $CAPENV $CAP "file://$PWD/$WD/lockup.html?mode=full" "$WD/lockup.png" 0
env $CAPENV $CAP "file://$PWD/$WD/lockup.html?mode=text" "$WD/text-plate.png" 1   # alpha required
env $CAPENV $CAP "file://$PWD/$WD/lockup.html?mode=char" "$WD/char-card.png" 0
```

The shell variable was renamed from `W` to `WD` — `W` now means canvas width,
and keeping the same name would confuse the reader (it isn't exported, so even
before this it never reached child processes).

Open the 3 captures with Read and check them — channel-name typos, tagline
line breaks, character crop. An error here corrupts everything downstream.

Once burned into the frame, the tagline can't be fixed. Run it through the
style gate once (the channel name is a proper noun, outside the checker's scope).

```bash
echo "<tagline>" | python3 ${CLAUDE_PLUGIN_ROOT}/skills/platform-guide/references/check-style.py --surface screen -
```

After the checker passes, delegate to the growth-post-reviewer agent on the
`standalone` surface — only a tagline that gets **score ≥95 and p0=0** goes on
screen (3 rounds max — it's a one-line copy, so to save rounds delegate 2–3
candidates together and pick).

### 4. Opening keyframe (long version only — skipped at the 4-second standard)

If the concept is scene-led (a mini scene with props, a dark studio, etc.),
generate the first frame with `gpt_image_img2img` (logo master as reference,
1080×1920) (an exception to the local-first default path — reference editing
doesn't exist in image_local_generate) — the pre-entrance state or a
silhouette, with the profile negative prompt + text exclusion, saved as
`.work/open-frame.png`. Skip it for front-facing character-entrance concepts.

### 5. Video generation (veo — mandatory path)

The body of the intro is **always made with a video-generation tool** — never
substituted by HTML captures and ffmpeg assembly alone (cards and text are
only the §7 finishing overlays).

- **Default (4-second standard — user-confirmed)**: `veo_img2video` —
  `sourceImagePath` = **`char-card.png`** (first frame = final pose card),
  aspectRatio `9:16`, resolution `720p`, durationSeconds **`4`**, model
  **`veo-3.1-lite-generate-preview`** (Lite first — 1/8 the cost). 4 seconds
  is **720p-only** and `lastImagePath` interpolation is **rejected** (measured
  400 — playbook §8.5). Put "the framing and crop never change" + "returns to
  the exact starting pose by the 3-second mark" in the prompt; ending
  alignment is guaranteed by the §7 lockup crossfade. The build upscales the
  720p source to 1080×1920. The quality (default) model is used only for the
  final single retry of the §8 escalation.
- **Long version (trailer use only)**: durationSeconds `8` + resolution
  `1080p` + `lastImagePath` = char-card (first+last interpolation; the §4
  opening keyframe may be used).
- **Mascot-acting-focused concepts**: `veo_reference` — the logo master
  (+ 1–2 other angles if available) as referenceImagePaths, 9:16. Its strength
  is keeping the character on-model.
- The prompt follows the playbook §5 L.O.G.O. skeleton: character preservation
  rules → the concept's single gesture (with per-second timing) → motion SFX
  description → "ends settled in the exact pose of the final frame, last
  second nearly static". **Exclusions go in the `negativePrompt` argument, not
  the body** — `text, letters, captions, subtitles, music, background score` +
  the profile's banned subjects as noun phrases (playbook §5).
  Save as `.work/intro-raw.mp4`.

### 6. Sonic logo

If `<slug>-sonic-logo.wav` exists, just copy it to `.work/sonic.wav` (sonic
branding = repetition). Otherwise generate the concept's sonic-logo
description (playbook §7 — rise→impact→tail, 2–3s, no vocals) with
`music_generate_clip` (Lyria) and save as `.work/sonic.wav`. If
`GEMINI_API_KEY` is unset, skip this step (veo native sound only).

**Voice tag (optional — when the user wants one)**: premix a TTS reading of
the channel name, delivered with impact, into the sting. Generate with
`tts_generate`, but fix a **tag-specific voice and delivery** in the brief (it
may differ from the channel narration voice — e.g., a male voice with a
signature delivery like "딸~~깍. 랩↗", the channel name stretched with a
rising tone. Direct stretch and intonation via the text spelling ("따알~~깍")
and stylePrompt). After trimming silence, **align the end of the reading to
the sting impact** and premix with sidechain ducking (updating
`.work/sonic.wav`), and sync `TEXT_AT` to the reading's start (text appears =
reading starts). The confirmed premix becomes the `<slug>-sonic-logo.wav`
asset — the voice tag is sonic branding too, so once confirmed it never changes.

### 7. Post-processing (build-intro.sh)

```bash
REF=${CLAUDE_PLUGIN_ROOT}/skills/intro/references
$REF/build-intro.sh "data/<slug>/assets/intro/.work"
```

Reads intro-raw.mp4 + lockup.png (+ text-plate.png · sonic.wav) from `.work/`
and builds **intro-master.mp4 · intro-stinger.mp4 · frames/**. Order:
normalization (1080×1920/30fps) → channel-name plate slide-in → real-pixel
lockup crossfade → hold → aligned sonic-logo mix (-14 LUFS). Knobs
(environment variables):

| Knob | Default | Purpose |
|---|---|---|
| `TRIM_START` | 0 | cut a stalled opening (mostly for the long version — usually unneeded at the 4s standard) |
| `TEXT_AT` / `SONIC_AT` | landing −1.2s / −0.2s | fine-tune reveal and sonic-logo timing |
| `LOCKUP_XF` / `HOLD` | 0.6 / 0.8 | lockup transition, ending hold |
| `STINGER` | 2.5 | stinger length |
| `AUDIO` / `SONIC_VOL` | native / 1.0 | drop veo audio / sonic-logo gain |

### 8. Adversarial convergence (brand-reviewer intro mode, target score ≥90 AND p0 = 0)

**Delegate to the brand-reviewer agent (Agent)** — pass the paths of
intro-master.mp4, frames/, lockup.png, profile.md, `.work/brief.md`, plus any
unresolved findings from the previous round, and state that this is
"intro video mode". Parse the verdict tail
`INTRO_REVIEW: score=NN p0=N verdict=PASS|FAIL`.

- **PASS** → §9.
- **FAIL — findings fixable in post** (stalled opening, timing misalignment,
  level balance): re-run §7 with only the knobs changed (no veo re-call — cheap).
- **FAIL — generation defects** (character off-model, near-glyphs, effect
  soup): fold the findings into the prompt via the playbook §9 correction
  table and regenerate §5. **Model escalation contract**: ① up to 2
  improvement regenerations on Lite → ② if still FAIL, **one final render on
  the default (quality) model** → ③ if still FAIL, hard cap.
- At the hard cap, report the highest-scoring version + unresolved findings
  as-is and ask: accept / keep looping / change concept (back to §2). Never
  dress up a score to pass.

### 9. HITL watch approval (browser)

Substitute `references/preview-template.html` into `.work/preview.html` —
`{{TITLE}}` "Final intro check", A = intro-master.mp4, B = intro-stinger.mp4,
with the timeline (reveal, sonic logo, lockup times) in DESC. Open it with
`open`, tell the user to **unmute and verify the sonic logo too**, then get
approval via AskUserQuestion. Fix requests route back to §7 (knobs) or §5
(regeneration) depending on their nature.

### 10. Install & report

```bash
IN="data/<slug>/assets/intro"
cp "$IN/.work/intro-master.mp4"  "$IN/<slug>-intro-master.mp4"
cp "$IN/.work/intro-stinger.mp4" "$IN/<slug>-intro-stinger.mp4"
cp "$IN/.work/lockup.png"        "$IN/<slug>-intro-lockup.png"
cp "$IN/.work/sonic.wav"         "$IN/<slug>-sonic-logo.wav"   # only if the sonic logo is new
ASSET=${CLAUDE_PLUGIN_ROOT}/skills/channel/references/resolve-asset.py
python3 "$ASSET" --ensure data/<slug> intro master  "intro/<slug>-intro-master.mp4"  "post-roll splice, trailer"
python3 "$ASSET" --ensure data/<slug> intro stinger "intro/<slug>-intro-stinger.mp4" "series opener"
python3 "$ASSET" --ensure data/<slug> intro lockup  "intro/<slug>-intro-lockup.png"  "cover, end card"
# only if the sonic logo is new
python3 "$ASSET" --ensure data/<slug> intro sonic   "intro/<slug>-sonic-logo.wav"    "shared across all videos"
```

Update the **intro assets** line in profile.md §6 (add it if missing). Report:
final score, regeneration count, timeline, deliverable path table + usage
guidance (the playbook §1 table — always state **never placed in front of
short-form content**). Note that uploading to platform channel pages
(trailer, profile intro) is manual work.

## Rules

- **The video body is always generated with veo** — card captures and ffmpeg
  handle only the finishing (text reveal, lockup guarantee, mix).
- **Never call veo before the concept is confirmed** — the pick happens on the
  4 text concepts of §2. Generating multiple video candidates to choose from
  is banned on cost.
- **Verdict authority belongs to brand-reviewer (intro mode) alone** — never
  end the loop by self-scoring. No score manipulation.
- **Channel-name and tagline text is never left to the generative model** —
  every veo call puts `text` in `negativePrompt`, and text is handled by the
  lockup card and plate (deterministic render). Writing "no text" in the body
  makes letters appear instead.
- **The sonic logo is a channel asset** — once confirmed, reuse it across all
  videos; regenerate only on the user's explicit request.
- **No concept drift after the HITL pick** — if it must change, stop the loop
  and return to §2 for a fresh pick.
- Intermediates live in `.work/` (gitignored); only the 4 final files go into
  `assets/intro/`.
- The intro is **never placed in front of short-form content** — the default
  uses are **post-roll splice** (brand closing), trailer, and series opener
  (after the hook). Follow the playbook §1 table.

## Additional Resources

### Reference Files

- **`references/intro-playbook.md`** — best-practice SoT (placement, length, concept axes, L.O.G.O. prompting, sonic logo, final-frame contract, correction table)
- **`references/lockup-template.html`** — brand lockup card (full/text/char 3 modes, for 1080×1920 headless capture)
- **`references/build-intro.sh`** — post-processing render (normalization, text reveal, lockup crossfade, sonic-logo mix, stinger derivation)
- **`references/preview-template.html`** — browser preview (2-slot video comparison — final check and candidate comparison)
