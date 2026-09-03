# social-flow

[![check](https://github.com/ttalkkaklab/social-flow/actions/workflows/check.yml/badge.svg)](https://github.com/ttalkkaklab/social-flow/actions/workflows/check.yml)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
&nbsp;·&nbsp; Docs: [English](docs/index.en.html) · [한국어](docs/index.html)

A Claude Code plugin that runs a channel-based short-form/long-form content pipeline —
**storyboard (with generated images) → per-platform video & text production → HITL-approved
publishing** — over a `data/[channel]/episodes/[topic]/` directory tree.

A **channel** is one content brand you operate: one `data/` directory per channel, with
tone, voice, theme, and publish targets pinned in `profile.md`. Publish targets:
**Threads · Instagram (Reels) · Facebook Pages · YouTube (Shorts and long-form)**.

Video comes in two formats. The default is 9:16 short-form (1080×1920/30fps), derived
per platform; YouTube long-form uses 16:9 (1920×1080). You pick the format while
authoring the storyboard, and a single `window.FORMAT` line in `scenes.js` fixes every
build constant downstream. Long-form episodes **mix clips you film yourself with
generated scenes** — where the evidence lives on screen you film it, where the point is
a mood or a place the pipeline generates an image, and scenes that need words or
diagrams on screen become **HTML motion slides**, authored and shown as rendered
keyframes before approval. A slide that states a value —
the number counts up and the bar grows the moment its sentence starts, rendered locally
frame by frame at no cost and admitted to the build only after an adversarial design
review (`slide-reviewer`, 95-point gate) — the one free way to put movement on a body
scene on either format. A scene where something **happens** — people move, a place, an
action — is a **footage slide** (`treatment:"footage"`): one generated clip per sentence
inside the same HTML lane, with wordless accent-colour marks (a route, an X, a ring,
hatching, brackets) drawn on over the picture and, when a mark has to pass behind the
people, a subject matte laid back on top. Cuts land on sentence starts; the clips are
budgeted on the approval screen rather than counted against the generated-video cap — the
channel's `video_budget_usd` (default $10 an episode) is the ceiling, and it is the default
ground for every spoken beat: no picture may hold the screen longer than one sentence
(`max_static_ground_seconds`, default 4 s), an authored plate is a one-sentence card
(`html_plate_max`, default 2), and numbers go on the footage as labels. Narration defaults to **your own voice on every scene**, so
the shooting script (`script.md`) carries the lines for every shot — filmed shots get
what to show, what to say, and the filename to save it as; the rest are voice-only
recordings.

The video pipeline (safe zones, reveal sync, subtitle contracts) and the SNS publishing
client carry over from an earlier in-house plugin where they were verified in
production, generalized here to per-channel operation.

> **Content language.** Your channel's language is set in its `profile.md` — tone, TTS
> voice and its `lang` code, subtitle languages — and the skills write in whatever that
> says. What the pipeline is *not* yet is fully language-neutral, so here is the honest
> state of it:
>
> - **The copy style gate is Korean-only.** `check-style.py` implements Korean rules —
>   translationese, Korean AI stock phrases, Korean sentence endings. Hand it text in
>   another language and it exits **4 (SKIP)**, saying in as many words that the copy is
>   *unchecked*, never that it passed. A person has to read that copy. (It used to return
>   a clean PASS on English, which is why the SKIP verdict exists.)
> - **Korean-market research tools are optional.** Naver search and Korea's open-data
>   portal (data.go.kr) are extra sources; `serp_*` and `WebSearch` cover the rest.
> - **On-device generation has Korean-specific limits**, noted where they apply: local
>   image generation breaks Korean glyphs (text-bearing frames go to the paid path), and
>   the local STT default is tuned for Korean.
> - **The channel browser UI speaks English and Korean.** `serve.js` picks up `?lang=`,
>   then the browser's language, and falls back to English; the header carries a picker.
>   Adding a language is one entry in its `STRINGS` dictionary — the self-test fails if
>   any language is missing a key English defines.
> - **The storyboard review render speaks English and Korean too.** The template picks the
>   language the same way and puts the picker at the end of its section menu; the episode's
>   own copy stays in whatever language `scenes.js` is written in. Two things there don't
>   follow the picker: the check-strip *sentences*, which are hardcoded English (moving them
>   into the dictionary is the unfinished half of that pass), and the heuristics that read a
>   Korean sequence heading to guess a shot's playback beat — an explicit `beat:` overrides
>   those anyway.
> - **Still Korean-only: the shooting script and the research parser.** `make-script.js`
>   writes `script.md` — the page you read while filming — with Korean headings, and
>   `check-research.js` finds a research.md's verification table by Korean heading words.

## Requirements

- Node 20+, ffmpeg, Google Chrome (headless capture), python3
- `pip install supertonic` — for `tts_local_generate` (on-device voice). The first call
  downloads 385MB of weights into `~/.cache/supertonic3` (~24s). If you installed it in
  a virtualenv, point `SUPERTONIC_PYTHON` at that interpreter. Code is MIT; **the
  weights are OpenRAIL-M** (commercial use allowed, with use-based restrictions)
- `uv tool install --python 3.12 "mlx-qwen3-asr[aligner]"` — for `stt_local_transcribe`
  and ingest's Korean STT. The first call downloads ~3.4GB of Qwen3-ASR-1.7B weights
  into `~/.cache/huggingface`. Installed elsewhere, point `QWEN3_ASR_BIN` at it
- whisper.cpp (`brew install whisper-cpp`) + `~/.cache/whisper-cpp/ggml-large-v3-turbo.bin`
  — the ingest STT fallback when mlx-qwen3-asr is missing. Recording mode needs
  **Screen Recording and Microphone** permission for your terminal app
  (System Settings → Privacy & Security)
- API keys and platform credentials — see the next section for what each one unlocks

> **Load-path caveat**: the skills name MCP tools as `mcp__social-flow__*` — the server's
> logical name. A marketplace install prefixes them per plugin, so the live names read
> `mcp__plugin_social-flow_social-flow__*` (measured on Claude Code 2.1.251). Skill
> `allowed-tools` is advisory, so both spellings work; check the real names with `/mcp`
> when you call a tool by hand. `data/` is created relative to the **session cwd**, not
> the plugin root.

## API keys — what each one unlocks

The keys come in two independent groups, and **you can stop after either one**.

**Group 1 — production keys.** These make the video. `OPENAI_API_KEY` renders the
cover and any frame with text on it (local image generation garbles Korean glyphs, so
text frames go to GPT Image), and `GEMINI_API_KEY` covers generated video clips,
acted narration, and BGM. Both are optional in the strict sense — scene backgrounds
default to on-device `image_local_generate` and narration defaults to on-device
`tts_local_generate`, so a no-key run still produces a video — but without
`OPENAI_API_KEY` you lose text-bearing frames, and without `GEMINI_API_KEY` you lose
generated motion and music. For research, `SERPAPI_API_KEY` and the Naver pair are
optional too; the storyboard skill falls back to WebSearch.

**Group 2 — platform credentials (Threads · Instagram · YouTube · Facebook). Entirely
optional, and they're what turns the tool from a video maker into an operator.**

- **Set them up** and the pipeline runs end to end and keeps running on its own:
  `publish` posts directly to your accounts, and the growth skills (`grow-threads`,
  `grow-youtube`, `grow-instagram`) take over day-to-day operation on `/loop` —
  replying to comments, watching insights, joining keyword conversations, refilling
  the publish queue, and posting inside the standing authorization you approved once
  at `init`. Insight tools (`threads_insights`, `youtube_insights`,
  `instagram_insights`, `content_feedback`) start reporting real numbers, and
  `review-recent` can score your last five episodes against your own medians.
- **Skip them** and everything up to and including production still works. Research,
  storyboard, image generation, narration, the build — `produce` writes the finished
  9:16 or 16:9 video plus per-platform text into
  `data/<channel>/episodes/<topic>/output/`, and you upload those files by hand. Only
  the publishing and growth-loop half is unavailable: the nine publish/insight tools
  aren't even listed (`tools/list` shows 52 instead of 61), and the growth skills have
  nothing to drive.

Credentials are per platform, so this is not all-or-nothing — a YouTube-only setup
publishes and grows YouTube while Threads and Instagram stay manual. Add a token
later and the matching tools appear without restarting the server. The three
`setup-*` skills walk the account signup and token issuance with a browser, handing
back to you only at the steps that need a human (login, verification codes, consent
screens); `skills/publish/references/token-setup.md` documents the manual route.

Exact variable names, defaults, and file conventions:
[Environment variables & credentials](#environment-variables--credentials).

### What costs money, and what doesn't

Generation is metered by the vendor unless it runs on your own machine. Four
capabilities, four different answers:

| Capability | Free / on-device | Paid | Costs money unless… |
|---|---|---|---|
| **Images** | `image_local_generate` — Z-Image Turbo via mflux, $0. Optional: `mlx_image_*` when MLX Core is running | `gpt_image_*` — OpenAI, per image by quality | …you accept no text in the frame. Local generation breaks Korean glyphs apart, so covers and any text-bearing frame have to go to the paid path. Default stays Z-Image |
| **Video** | deterministic HTML motion slides rendered locally with headless Chrome. Optional: `mlx_video_generate` (24fps, RAM-capped) | Veo 3.1 (Gemini) per second · Seedance (ModelArk) per second | …you use the HTML motion lane. A channel can prohibit stills and still spend zero on generated video; Ken Burns does not count as true motion. mlx_video is not the default and is not on the Veo/Seedance face-policy table |
| **Speech (TTS)** | `tts_local_generate` — Supertonic 3, $0. Optional: `mlx_tts_generate` | `tts_generate` / `tts_multi_speaker` — Gemini, per 1,000 chars | …you don't need acted delivery. The local engine has no style or emotion control. mlx_tts is never a silent fallback for profile §2 |
| **Transcription (STT)** | `stt_local_transcribe` — Qwen3-ASR via mlx, $0 (whisper.cpp fallback) | none | never — there is no paid STT path here |
| **Music (BGM)** | `mlx_music_generate` when MLX Core is running | Lyria clip via Gemini (the default) | …you ship without BGM, or you have MLX Core up with a music model |

So a zero-cost run is possible: local images, local narration, local
transcription, no generated video, no BGM. What you give up is a proper cover
frame (it needs rendered text) and background music.

A realistic paid episode is small. The default economy tier spends about
**$0.26–0.29** — one high-quality cover image plus one 30-second BGM clip, with
everything else local — against a per-episode cap of $0.30 that the pipeline
enforces before spending, not after. Generated video is the expensive step: one
8-second Veo lite escalation adds roughly $0.64, which is why it stays off unless
hook metrics justify it and you raise the cap yourself.

Prices live in one file, `skills/autoproduce/references/prices.tsv`, each row
carrying its evidence grade and source. `cost-report.sh` reads only that file and
**fails rather than guessing** — an unknown price exits 1 (verdict unavailable),
never 0.

Full detail — per-capability setup for both lanes, every key's signup and billing
steps, the on-device installs, worked cost arithmetic, and how the caps work:
**[Costs & API keys](docs/guides/costs-and-keys/index.html)**
([English](docs/guides/costs-and-keys/index.en.html)).

## Install

The quickest path is the marketplace — two commands, nothing to build:

```bash
claude plugin marketplace add ttalkkaklab/social-flow
claude plugin install social-flow@social-flow
```

The MCP server ships as a self-contained bundle, so the plugin works right after
install — no `npm install` step. To hack on the plugin itself, clone instead:

```bash
git clone https://github.com/ttalkkaklab/social-flow.git
cd social-flow/server && npm install && npm run build
```

`server/dist` is committed, so a fresh clone works without building — you only build
after editing `server/src`. `npm run check` runs the build plus the tool contract
tests (`server/test/`) — no external API calls, just the tool surface: schema
validity, definition ↔ handler routing, behavior hints consistent with descriptions,
enums matching their source-of-truth constants, generated-file path safety. If you
change `server/src`, make `npm run check` pass and commit `server/dist` with it.

Load the plugin by pointing at your clone:

```bash
claude --plugin-dir /path/to/social-flow
```

### Codex CLI, Grok CLI, and Buzz

The plugin layout is Claude-compatible across CLIs, so the same repo installs there too:

```bash
# Grok CLI — skills, agents, and the MCP tools all connect (measured on grok 1.0.5)
grok plugin install https://github.com/ttalkkaklab/social-flow.git --trust

# Codex CLI — the 18 skills load; MCP tools don't wire up yet (measured on codex 0.147.0)
codex plugin marketplace add ttalkkaklab/social-flow
codex plugin add social-flow@social-flow

# Buzz — persona pack at `.plugin/plugin.json` (skills + MCP). Validate, then
# point the nest at this checkout so agents pick up the working tree, not a
# stale marketplace snapshot:
buzz pack validate /path/to/social-flow
mkdir -p ~/.buzz/packs
ln -sfn /path/to/social-flow ~/.buzz/packs/com.ttalkkaklab.social-flow
```

API keys travel the same way as under Claude — shell environment variables.

Work products accumulate under `data/` relative to the session cwd, so the convenient
setup is to start Claude Code in the directory where you want your content and add
the plugin with the flag above.

## Pipeline

```
/social-flow:channel add my-channel        # 1. channel profile (once)
/social-flow:branding my-channel           # 1.2 (optional) profile image — 4 candidates → HITL pick → 95-point convergence
/social-flow:intro my-channel              # 1.3 (optional) channel intro — 4 concepts HITL → 4s veo render → 90-point convergence (spliced after the episode as a closer)
/social-flow:setup-threads my-channel      # 1.4 (optional) SNS account setup + API tokens — browser HITL, ego lite first, Chrome fallback (per platform: setup-instagram · setup-youtube)
/social-flow:ingest my-channel record      # 1.5 (optional) screen+voice recording → timeline — an alternative research source
/social-flow:storyboard my-channel "July FX swings"   # 2. research → 3 seven-item scenarios [scored to 95] → pick → more research → scenes [narration read alone, to 95] → storyboard → [approval]
/social-flow:produce my-channel 20260729-fx           # 3. video + per-platform text
/social-flow:publish my-channel 20260729-fx           # 4. [approval] → publish → record permalinks
/social-flow:grow-threads my-channel init             # 5. (optional) Threads growth plan [approval — standing authorization]
/loop 30m /social-flow:grow-threads my-channel        #    then an autonomous growth tick every 30m (inbox replies · insights · keyword conversations · judgment-based posting — 95-point gate)
/social-flow:grow-youtube my-channel init             # 5-b. (optional) YouTube growth plan [approval — standing authorization]
/loop 1h /social-flow:grow-youtube my-channel         #     then an hourly tick (comment replies · metrics · queue refill authoring · queue publishing)
/social-flow:grow-instagram my-channel init           # 5-c. (optional) Instagram growth plan [approval — standing authorization]
/loop 1h /social-flow:grow-instagram my-channel       #     then an hourly tick (comment replies · skip-rate watch · queue refill authoring · queue publishing)
/social-flow:topic-scout my-channel                   # 1.6 topics the market has already validated — md source of truth + chart HTML
/social-flow:review-recent my-channel                 # 6. feedback HTML for the last 5 episodes (funnel · bars · next-episode levers)
```

Each step checks the previous step's output — produce stops on an unapproved
storyboard, publish stops on unfinished production, and each points you back to the
step that's missing.

Steps 1 through 3 need no platform credentials. Steps 4 onward — publishing, the
growth loops, and `review-recent` — are the half that platform tokens unlock; without
them the pipeline ends at `produce` with the finished video and per-platform text in
`output/`, ready to upload by hand.

**One topic string straight to a finished video** (steps 2–3 with no human approval):

```
/social-flow:autoproduce my-channel "July FX swings"   # research → 3 seven-item scenarios [scored to 95] → pick → more research → scenes.js [narration read alone, to 95] → images → TTS → build → output
```

The machine gates stand where the approval gates were — fact verification (3+
cross-verified claims), three seven-item scenario candidates looped to 95 with P0=0
(curiosity · fear · intrigue · comedy), the narration read on its own and looped to 95, the
copy style checker, six one-round storyboard-reviewer board
reads (copy · per-scene · vocabulary · camera · sound · images) where an unresolved P0
stops the run, build report (drift 0), content-reviewer P0=0, and a cost cap. The **economy tier is the
default**: no Veo calls at all (still backgrounds + Ken Burns), roughly $0.26–0.29
per episode (capped at $0.30); only when hook metrics fall below threshold does the
4-second cover get promoted to `veo-3.1-lite`. Authoring is capped at **2 episodes
per platform loop per day** (hard cap, counting successes and failures), and
`check-duplicate.py` compares every candidate topic against the channel's whole back
catalog to throw out rewordings of things already made. Ladder, promotion rules, and
unit prices live in `skills/autoproduce/references/`. This is also the skill the
growth loops call when they refill their own queues.

**Style gate** — wherever Korean text is produced (storyboard authoring, produce
right before TTS and per-platform copy, publish right before approval,
content-reviewer verification), `check-style.py` deterministically flags AI-sounding
prose. It catches translationese, stock phrases, assistant-register endings, and
comma-after-connective habits, tiered S1/S2/S3; any remaining S1 blocks publishing
(exit 2). Each of the 8 surfaces (narration, subtitles, card text, four platform
copies, comments) has its own thresholds and disabled rules — the gate doesn't fight
the register the playbook itself demands, like Threads banmal or Facebook's
case-collecting closers. For video surfaces, `extract-text.js` pulls the text out of
scenes.js. The rule source of truth is
`skills/platform-guide/references/korean-style.md`; the code renders the verdict and
the agent fixes the sentences.

**Storyboard adversarial reviews** — the checker catches what rules can catch; the
layer above it is what a person has to read to feel. Overused antithesis, triple
lists, sermon-style closers, a rhythm where every sentence reads at the same length.
Images are the same — a machine can check resolution, but "does this picture show
what the scene is saying" takes a reader. So the storyboard skill calls the
adversarial reviewer `storyboard-reviewer` **six times, once each**, before approval —
after a **narration read-through it loops to 95**, the reviewer reading the spoken
sentences alone, in order, before it opens anything else:

| Review | What it reads | Score is |
|---|---|---|
| Narration mode (§4.4) | the narration alone, without the picture — does the topic and the content come through | total, **looped to 95** |
| Copy mode (§4.5) | the storyboard's prose as a whole | total |
| Scene mode (§4.6) | each scene's role and context | **lowest scene** |
| Vocabulary mode (§4.7) | word choice in narration and titles | **lowest scene** |
| Camera mode (§4.8) | the shot grammar of every shot — what the audience should feel there and whether the size, angle and frame space serve it — plus the four camera slots, cut length and engine fit of every generated shot | **lowest shot** |
| Sound mode (§4.9) | clip audio, voice casting, and where the sound gets out of the way | total |
| Image mode (§5.5) | generated PNGs against scene content | total |

None of the six is a pass/fail gate — each returns findings once, they get applied, and
anything left over goes onto the human approval screen, which is the one thing that blocks.
The exception is a **motion slide**: storyboard renders its frames before approval and
delegates them to `slide-reviewer`, and the slide enters the build only when that review
scores ≥ 95 with no P0 — a convergence loop (five reviewer delegations an episode, every
slide batched in the first, failures only after), because a slide is cheap to
re-render and a generated-looking one is not worth shipping.
The per-item reviews report the **lowest-scoring** scene or shot rather than the average,
because an average lets one broken scene hide behind the good ones. The order has a
reason too — images come last because a changed sentence changes what its scene
should show, and vocabulary comes after the scene review because polishing the words
of a scene that's about to be cut is wasted work. Whatever the one round of fixes
doesn't resolve rides to the approval screen with the finding attached, and the human
decides. autoproduce has no human to decide, so there a P0 still standing after those
fixes halts authoring.

**Storyboard-first shooting flow** (for polished demos and tutorials — the order flips):

```
/social-flow:storyboard my-channel <topic> as a shooting script   # scene design + shooting script (script.md) → [approval]
/social-flow:ingest my-channel record <topic>                     # film against the script → transcription + scene alignment (alignment.json)
/social-flow:produce my-channel <topic>                           # cut the recording into a 9:16 edit (your voice + real screens, no TTS)
/social-flow:publish my-channel <topic>                           # [approval] → publish
```

## Repository layout

```
social-flow/
├── .claude-plugin/plugin.json   # Claude Code plugin manifest
├── .grok-plugin/plugin.json     # Grok CLI plugin manifest
├── .codex-plugin/plugin.json    # Codex CLI plugin manifest
├── .plugin/plugin.json          # Buzz persona pack (Open Plugin Spec)
├── personas/                    # Buzz pack persona (pipeline.persona.md)
├── .mcp.json                    # internal MCP server registration (social-flow)
├── server/                      # internal MCP server (TypeScript, stdio) — 61 tools
│   └── src/
│       ├── index.ts             # entry (publish/insights tools exposed per credential file)
│       ├── tools.ts             # tool definitions (research 8 + open data 5 + generation 18 + publish 6 + comments 3 + check 1 + growth insights 5)
│       ├── handlers.ts          # zod validation + routing
│       ├── sns-client.ts        # Threads·IG·FB·YouTube publish/comments
│       ├── serp-client.ts       # SerpApi (key masking + response slimming)
│       ├── naver-client.ts      # Naver Open API (news·blog·web·cafe…)
│       ├── datago-client.ts     # data.go.kr (search·detail·download·odcloud·standard open API)
│       ├── image-client.ts      # OpenAI GPT Image generation
│       ├── zimage-client.ts     # Z-Image Turbo on-device generation (mflux/MLX)
│       ├── mlx-serve-client.ts  # MLX Core / mlx-serve HTTP client (image·edit·tts·music·video·3d)
│       ├── qwen3-asr-client.ts  # Qwen3-ASR on-device STT (mlx-qwen3-asr CLI)
│       ├── video-client.ts      # Veo 3.1 — t2v·i2v·extension·reference
│       ├── seedance-client.ts   # Seedance — t2v·i2v·reference (BytePlus ModelArk)
│       ├── tts-client.ts        # Gemini TTS — single speaker + 2-speaker dialogue
│       ├── supertonic-client.ts # Supertonic 3 on-device TTS
│       ├── elevenlabs-client.ts # ElevenLabs TTS — single voice · multi-voice dialogue · voice list (REST)
│       ├── music-client.ts      # Lyria — 30s clips (batch) + variable length (streaming)
│       └── media-utils.ts       # path validation · base64 saves · PCM→WAV utils
├── skills/
│   ├── channel/                 # /social-flow:channel — channel & profile management
│   │   └── references/          #   resolve-asset.py (catalog lookup) · serve.js (channel browser over HTTP — pick a channel, then storyboards or characters; serves data/ so storyboard.html opens in place)
│   ├── branding/                # /social-flow:branding — channel profile image (4 candidates → HITL pick → adversarial convergence at 95)
│   ├── intro/                   # /social-flow:intro — channel intro video (4 concepts HITL → veo character acting → name reveal + sonic logo → 90-point convergence)
│   ├── setup-threads/           # /social-flow:setup-threads — Threads account setup + API hookup (browser HITL — signup·branding·Meta app·60-day token, state detection & resume)
│   │   └── references/          #   setup-playbook.md (CDP recipes · Chrome lane map · token exchange · 60-day renewal)
│   ├── setup-instagram/         # /social-flow:setup-instagram — Instagram account setup + API hookup (browser HITL — professional conversion · Instagram Login OAuth · 60-day token)
│   │   └── references/          #   setup-playbook.md (UID reserved-variable trap · tester invite path · Chrome lane map)
│   ├── setup-youtube/           # /social-flow:setup-youtube — YouTube brand channel setup + API hookup (browser HITL — advanced-features verification → channel creation → refresh_token, multi-day resume)
│   │   └── references/          #   setup-playbook.md (loopback listener · production-stage 7-day expiry trap · Chrome lane map)
│   ├── datago/                  # /social-flow:datago — open-data research → collection → seed records
│   ├── ingest/                  # /social-flow:ingest — screen recording (+voice) → timeline (recording control · STT · scene boundaries · keyframes)
│   ├── storyboard/              # /social-flow:storyboard — research → 3 seven-item scenarios looped to 95 → pick → more research → scene design → narration read-through looped to 95 → six one-round board reviews (copy · per-scene · vocabulary · camera · sound) → images → image review → approval → slides (motion slides through the slide-reviewer gate)
│   │   └── references/          #   scenes-schema.md · directing-grammar.md · motion-slide-template.html · slide-design.md (look · motion tokens · the slide-reviewer rubric) · check-slide.js · footage-lane.md (one clip per sentence, marks over it) · footage-frames.sh
│   ├── produce/                 # /social-flow:produce — video build + per-platform text
│   │   └── references/          #   build-reel.sh (SUB_MODE sentence · word · phrase) · speedup.sh (required final pace pass, 1.2 default, ≤6.2 chars/s) · bgm-bed.sh · bgm-scoring.md · video-template.html · render-motion-slide.mjs (motion slide → one clip per reveal group, no npm dependency; footage slides play a clip per group) · make-matte.py (subject matte → VP9-alpha webm, needs rembg) · QA harness
│   ├── autoproduce/             # /social-flow:autoproduce — one topic through research → 3 seven-item scenarios [scored to 95 on curiosity · fear · intrigue · comedy, auto-pick unattended] → more research → authoring [narration read alone, to 95] → video (human gates replaced by the machine gates, economy tier default)
│   │   └── references/          #   cost-tiers.md (model ladder · promotion rules) · prices.tsv (price SoT) · cost-report.sh
│   │                            #   cost-tally.md (per-episode cost ledger convention — shared by storyboard/produce)
│   ├── publish/                 # /social-flow:publish — HITL approval, then platform publishing
│   ├── grow-threads/            # /social-flow:grow-threads — one autonomous Threads growth tick (init plan = standing authorization, repeat via /loop — growth skills are per-platform)
│   │   └── references/          #   growth-playbook.md (tactics SoT) · growth-plan-template.md (plan/state schema)
│   ├── grow-youtube/            # /social-flow:grow-youtube — one autonomous YouTube growth tick (comment replies · metrics · queue refill authoring · queue publishing — only items marked queue: ready by a human or by auto-authoring)
│   │   └── references/          #   growth-playbook.md (evidence-grade notation SoT) · growth-plan-template.md
│   ├── grow-instagram/          # /social-flow:grow-instagram — one autonomous Instagram growth tick (comment replies · skip/watch metrics · queue refill authoring · queue publishing — Reels go out only with queue_instagram: ready + a public URL)
│   │   └── references/          #   growth-playbook.md (two gates · disqualification SoT) · growth-plan-template.md
│   ├── review-recent/           # /social-flow:review-recent — feedback HTML for the last 5 episodes across YouTube/Instagram (funnel · bars · problem→hypothesis→next episode)
│   ├── topic-scout/             # /social-flow:topic-scout — market-validated YouTube topics (5× channel median · chart HTML) + an SNS issues section (Threads/X/Instagram mentions · trending searches)
│   └── platform-guide/          # knowledge skill — platform grammar · video specs · Korean style SoT
│       └── references/          #   platform-playbook.md · korean-style.md · check-style.py (style gate) · check-meta.js (YouTube meta gate)
├── agents/
│   ├── brand-reviewer.md        # adversarial review of profile images & intro videos (95/90-point convergence gates)
│   ├── content-reviewer.md      # adversarial pre-publish verification (P0 gate)
│   ├── growth-post-reviewer.md  # adversarial review of growth-loop copy (AI tells · context — 95-point gate)
│   ├── slide-reviewer.md        # adversarial review of a rendered motion slide (design craft · no generated look · motion meaning · legibility — 95-point convergence gate)
│   └── storyboard-reviewer.md   # adversarial storyboard review, 8 modes — scenario (seven-item candidates) and narration (the spoken sentences alone) looped to 95, six read once each (copy AI tells / per-scene role·context / vocabulary / camera — feel·size·angle·space of every shot + the slots of generated shots / sound plan / image fit)
├── apps/
│   └── shoot-console/           # macOS SwiftUI recording console for the shooting-script flow (built locally via build-app.sh)
└── data/                        # content data root (see data/README.md)
```

## MCP tool surface (61 tools)

**`tools/list` does not show all 61.** The nine publish/insights tools
(`threads_publish` · `instagram_publish` · `facebook_publish` · `facebook_comment` ·
`youtube_publish` · `threads_insights` · `instagram_insights` · `youtube_insights` ·
`threads_search`) are exposed **only for platforms whose credential file exists** —
evaluated at list time, so adding a token makes them appear without restarting the
server. With no tokens at all you'll count 52. Hidden tools still have live handlers:
calling one directly returns a missing-token error rather than failing silently.
`content_feedback`, `youtube_topic_scout`, and `sns_issue_scout` sit outside the
platform gate and stay listed without tokens — the YouTube scout needs
`YOUTUBE_API_KEY` or channel OAuth at call time, the SNS scout needs
`SERPAPI_API_KEY`, and feedback simply skips the sections it has no token for.
(`youtube_update` is likewise always listed and errors without a token.)

| Group | Tools | Backend |
|---|---|---|
| Research | `youtube_topic_scout` | YouTube Data API — collects channels in your niche, finds videos at 5×+ their recent-upload median, and extracts topic phrases from titles (`YOUTUBE_API_KEY` first, else OAuth `youtube.readonly`) |
| Research | `sns_issue_scout` | SerpApi Google search with `site:threads.com` · `site:x.com` · `site:instagram.com`, collecting recent posts and counting topic phrases that recur across posts and platforms (+ Google trending searches). **A mention list with no engagement counts** — don't mix it into the same table as YouTube multipliers. Threads keyword search only returns your own posts before advanced access, and the Instagram Login API has no public search, so this is the only no-account path that sees all three at once |
| Research | `naver_search` | Naver Open API (25,000 calls/day free — first choice for Korean). 8 types: news·blog·web·cafe·kin (Knowledge-iN)·image·encyc·local |
| Research | `serp_web_search` / `serp_news_search` / `serp_naver_search` / `serp_image_search` / `serp_trending_now` | SerpApi (250 free/month — precision + international). naver takes where=web·news·image·video + a period filter, image takes license/size/aspect filters, trending_now returns per-country Google trending searches (4/24/48/168-hour windows, approximate volume and growth) |
| Open data | `datago_search` / `datago_detail` / `datago_file_download` | data.go.kr (no auth — search·detail·raw file) |
| Open data | `datago_file_fetch` / `datago_api_call` | odcloud · apis.data.go.kr (auth key + **per-API usage application** required) |
| Image generation | `image_local_generate` | Z-Image Turbo on-device via mflux (**no API key, no network, no billing — the default path**. Needs Apple Silicon + `uv tool install --python 3.12 mflux`; first call downloads 31GB of weights. No text inside images — Korean jamo break up) |
| Image generation | `mlx_image_generate` / `mlx_image_edit` | MLX Core / mlx-serve on loopback (**no vendor bill**. Optional lane — default stays Z-Image. Hangul still goes to gpt_image. Fail closed if :11234 is down; this plugin never launches the app. `brew install --cask mlx-core`) |
| Image generation | `gpt_image_text2img` / `gpt_image_img2img` | OpenAI GPT Image (OPENAI_API_KEY — **the text-and-quality path**: text rendering, arbitrary WIDTHxHEIGHT, up to 16 reference images, mask inpainting) |
| Video generation | `veo_text2video` / `veo_img2video` / `veo_extension` / `veo_reference` | Veo 3.1 (GEMINI_API_KEY — 720p–4k, 4/6/8s grid; **native audio, local-file extension, and live-person reference** are this engine's edge) |
| Video generation | `seedance_text2video` / `seedance_img2video` / `seedance_reference` | Seedance (ARK_API_KEY, BytePlus ModelArk — 480p–4k, **2–30s in 1-second steps** billed for what you request, 7 aspect ratios, up to 30 reference images plus reference audio — a character's fixed voice (`referenceAudioPaths`, 2.x). Audio can be turned off, so silent cuts are cheap — $0.23 for 1080p 4s vs $0.64 on Veo lite. Which engine when: [decision table](skills/produce/references/video-model-selection.md)) |
| Video generation | `mlx_video_generate` | MLX Core / mlx-serve (24fps rgb8 muxed to mp4 with ffmpeg. Default 768×1280, RAM-capped at 800MB decoded RGB. Not the default path and not on the Veo/Seedance face-policy table) |
| Voice generation | `tts_generate` / `tts_multi_speaker` / `tts_list_voices` | Gemini TTS (GEMINI_API_KEY — 30 voices, automatic language detection, saves mono 24kHz wav) |
| Voice generation | `tts_local_generate` | Supertonic 3 on-device (**no API key, no network** — 10 voices, 31 explicitly specified languages, mono 44.1kHz wav. Needs local python + `pip install supertonic`) |
| Voice generation | `mlx_tts_generate` | MLX Core / mlx-serve (raw WAV. Optional; never a silent fallback for the engine in profile §2) |
| Voice generation | `tts_elevenlabs_generate` / `tts_elevenlabs_dialogue` / `tts_elevenlabs_voices` | ElevenLabs (ELEVENLABS_API_KEY — the paid third lane: inline audio-tag acting on eleven_v3, text-to-dialogue with **up to 10 voices in one request**, per-character timestamps for subtitle sync, any cloned or Voice Library voice. Saves mono 24kHz wav by default, so the builder reads it like the Gemini lane. API rate $0.10 per 1,000 characters on v2·v3, $0.05 on flash and v3 conversational, the same on every plan; the Free tier is non-commercial) |
| Speech recognition | `stt_local_transcribe` | Qwen3-ASR on-device via mlx-qwen3-asr/MLX (**no API key, no network, no billing — the default Korean STT**. Needs Apple Silicon + `uv tool install --python 3.12 "mlx-qwen3-asr[aligner]"`; the first call downloads ~3.4GB of weights. ingest runs the same engine and falls back to whisper.cpp without it) |
| Music generation | `music_generate_clip` / `music_generate` / `music_generate_advanced` / `music_list_options` | Lyria 3 Clip (fixed 30s mp3 — the default BGM path) · Lyria RealTime (5–300s variable wav 48kHz, seed reproducibility). `GEMINI_API_KEY` |
| Music generation | `suno_generate` / `suno_generate_sound` / `suno_generate_lyrics` / `suno_credits` | sunoapi.org third-party REST (not an official Suno Inc. API). Sung full songs (2 tracks, 2–8 min) · loopable beds with BPM/key · lyrics only · remaining credits. `SUNO_API_KEY`. Autoproduce does not call these |
| Music generation | `mlx_music_generate` | MLX Core / mlx-serve (WAV. Default instrumental. Optional bed; default BGM stays Lyria) |
| 3D | `mlx_3d_generate` | MLX Core / mlx-serve (GLB from an image. This pipeline has no mesh consumer) |
| Publish | `threads_publish` / `instagram_publish` / `facebook_publish` / `facebook_comment` / `youtube_publish` / `youtube_update` | Direct platform API calls — **exposed only for platforms with a credential file** (`youtube_update` edits title/description/tags/visibility of an already-uploaded video) |
| Comment inbox | `sns_comment_inbox` / `sns_comment_reply` / `sns_comment_moderate` | Cross-platform normalized inbox · replies · hiding (no deletes). Inbox and replies cover all 4 platforms; hiding excludes YouTube (its API only offers held-for-review, which means something else) |
| Capability | `capability_status` | What this machine has configured, grouped by capability with an "N of M" count, plus the env var that would unlock each missing provider. Call it before planning anything that spends money — otherwise a missing key only surfaces when the call fails, after the plan was built around it. Reports configuration, not reachability |
| Check | `sns_account_check` | Batch /me check across tokens (token values never shown) |
| Growth insights | `threads_insights` / `threads_search` | Threads insights (account/post metrics) + public keyword search — for grow-threads (`threads_manage_insights` · `threads_keyword_search` scopes) |
| Growth insights | `youtube_insights` | Channel stats + Analytics period metrics (views · engagedViews · average view ratio · subscriber delta) + per-video metrics — for grow-youtube (`youtube.readonly` · `yt-analytics.readonly` scopes; data lags 2–3 days) |
| Growth insights | `instagram_insights` | Account period metrics (reach · views · profile visits · saves) + per-media metrics — Reels alone carry `reels_skip_rate` and `ig_reels_avg_watch_time` (hook/retention verdicts). For grow-instagram (`instagram_business_manage_insights` scope; follower count comes from the profile field) |
| Growth insights | `content_feedback` | Scores the last N episodes (default 5) against channel medians, split YouTube/Instagram, and writes a funnel/bar HTML to `data/<channel>/growth/review-recent.html`. Platforms without tokens just lose their section |

Search tools (`*_search`) share argument names — **`query` · `limit` · `page`**.
Whatever the backend API calls them (`q`, `display`, `num`, `start`), the server does
the mapping. The contract tests enforce this convention, so new search tools use the
same names.

Publish tools have no review gate of their own — **a call is an immediate public
post** — so they only run behind the publish skill's HITL approval gate. The one
exception is the growth skills' autonomous mode (grow-threads · grow-youtube ·
grow-instagram), which publishes without per-post approval, but only inside the
`growth-plan.md` standing authorization approved via HITL at init. grow-threads
decides its own posting frequency with no daily cap; in exchange, every outgoing text
passes the adversarial growth-post-reviewer at 95+ with zero P0 (the bar briefly ran
at 90 and went back to 95 — the P0 condition never moved). The two video platforms
add one more line of defense — only episodes with a queue marker in storyboard.md go
out, and the markers are per-platform (YouTube `queue: ready` · Instagram
`queue_instagram: ready`). If they shared one key, whichever loop ran first would
consume the marker and the other platform would never publish. Two things set
markers: a human, or — when the plan enables `autoproduce` — the loop itself
authoring one episode when the queue runs dry. Auto-authored episodes become `ready`
only after passing the machine gates (fact verification · three scenarios looped to
95 · the narration read alone to 95 · style · the six storyboard-reviewer board reads for copy/per-scene/vocabulary/camera/sound/images · build report ·
content-reviewer P0 · cost cap); failing any one leaves them `hold`, waiting for a
human. grow-instagram publishes only with a public HTTPS URL, and with no hosting
configured it disables both publishing and auto-authoring (the loop won't start
tunnels, and it won't spend money making a video with no way out).

All 27 generation tools run **inside this plugin — no external MCP server required**.
Two keys cover the hosted ones: OPENAI_API_KEY for images, GEMINI_API_KEY for
video/voice/music (Seedance adds ARK_API_KEY, ElevenLabs adds ELEVENLABS_API_KEY).
`image_local_generate` and `tts_local_generate` run on-device and need no key at
all. The six `mlx_*` tools talk to MLX Core on loopback through this same server —
skills never curl :11234 themselves.

Findings from porting the voice/music modules:

- **Narration bodies go to `tts_local_generate` (local); only cuts that need acting
  go to `tts_generate` (Gemini).** Measured on this machine, Supertonic runs 6.3×
  realtime on CPU alone at zero per-episode cost. It has no style/emotion controls,
  so intro lines and character dialogue belong to Gemini. Evidence and a cost
  comparison across 13 commercial APIs:
  [local TTS vs commercial APIs](docs/research/2026-08-11-local-tts-and-commercial-api/index.html) (Korean).
- **The two engines differ in sample rate — local 44.1kHz, Gemini 24kHz.** Mixing
  them in one video needs resampling. `tts_local_generate` returns audio duration in
  its response, so scene-length checks don't need a separate ffprobe call.
- **ElevenLabs is the third speech lane, opt-in per channel** (`engine: elevenlabs` in
  profile §2) — for acted cuts with inline audio tags (eleven_v3), scenes with 3+
  speakers (`tts_elevenlabs_dialogue`, one request instead of per-speaker stitching),
  and subtitle timing (`timestamps: true` writes per-character start/end seconds).
  Measured against the live API: `output_format` is a query parameter (in the body it
  is silently ignored); the default `wav_24000` comes back as a real RIFF WAV at the
  Gemini spec, so **never pass an mp3 format for narration** — build-reel.sh reads any
  non-RIFF file as raw PCM; `normalized_alignment` romanizes Korean, so the sidecar's
  `alignment` is the one to read; text-to-dialogue runs on eleven_v3 only. Background:
  [ElevenLabs API research](docs/research/2026-08-22-elevenlabs-tts-api/index.html) (Korean) ·
  [API reference](docs/api-reference/elevenlabs-tts.html).
- **The default BGM path is `music_generate_clip`** (Lyria 3, fixed 30s, ~$0.04 per
  clip). Use the `music_generate` family only when you need exact length
  (narration-fitted) or seed reproducibility.
- **`tts_multi_speaker` on the flash model often rejects short dialogue scripts**
  (`Model tried to generate text…`). The server retries 3 times; if it still fails,
  switching to `model: "gemini-2.5-pro-preview-tts"` gets it through (verified).
- Lyria's prompt policy filter is touchy — a "lo-fi/vinyl crackle" combination has
  been blocked; plain descriptions of instruments and mood pass.

## Environment variables & credentials

`.mcp.json` passes these through from your shell environment. Secrets never go into
committed files — with a variable unset, only the tools that need it return an
explicit error and everything else works.

| Variable | Required for | Default | Purpose |
|---|---|---|---|
| `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET` | naver_search | — | Naver Open API (developers.naver.com) |
| `SERPAPI_API_KEY` | serp_* | — | SerpApi key |
| `DATA_GO_KR_API_KEY` | datago_file_fetch · api_call | — | data.go.kr auth key (My Page on data.go.kr — beyond the key, each API needs a **per-API usage application**. Search/detail/download work without a key) |
| `OPENAI_API_KEY` | gpt_image_* | — | OpenAI API key (platform.openai.com/api-keys — image generation) |
| `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) | veo_* · tts_generate · tts_multi_speaker · music_* | — | Gemini API key (aistudio.google.com/apikey — video, voice, and music generation. `tts_local_generate` works without it) |
| `ARK_API_KEY` | seedance_* | — | BytePlus ModelArk API key (ai.byteplus.com/ark — the second video engine. Dreamina Seedance 2.x models additionally require **an account balance over $30 or a resource pack** to activate; 1.5 pro and 1.0 have no such gate. `veo_*` works fine without this key) |
| `SUNO_API_KEY` | suno_* | — | sunoapi.org API key (https://sunoapi.org/api-key — third-party REST, not Gemini and not an official Suno Inc. API). Unset, `music_*(Lyria)` still works |
| `SUNO_BASE_URL` | | `https://api.sunoapi.org` | Same-spec self-host or regional mirror. Other vendors use different auth/paths — do not point this there |
| `ELEVENLABS_API_KEY` | tts_elevenlabs_* | — | ElevenLabs API key (elevenlabs.io/app/settings/api-keys — a restricted key needs the `text_to_speech` permission, plus `voices_read` for `tts_elevenlabs_voices`). Unset, `tts_generate` (Gemini) and `tts_local_generate` still work |
| `ELEVENLABS_BASE_URL` | | `https://api.elevenlabs.io` | Same-spec proxy or the EU residency host (`api.eu.residency.elevenlabs.io`). Normally leave it alone |
| `ARK_BASE_URL` | | `https://ark.ap-southeast.bytepluses.com/api/v3` | ModelArk region endpoint. The video models only exist in ap-southeast-1, so normally leave it alone |
| `SUPERTONIC_PYTHON` | | `python3` | Python interpreter for local TTS. Point it at your virtualenv if you used one (e.g. `~/venvs/tts/bin/python`). No venv auto-discovery — quietly picking up a different environment per repo and changing the voice is exactly the accident this avoids |
| `QWEN3_ASR_BIN` | | `~/.local/bin/mlx-qwen3-asr` | Local STT executable. With the default uv tool install location there is nothing to set |
| `MLX_SERVE_URL` | mlx_* | `http://127.0.0.1:11234` | MLX Core / mlx-serve HTTP base. This plugin never launches the app; a down server fails closed |
| `MLX_SERVE_API_KEY` | mlx_* on a non-loopback bind | — | Optional bearer. Loopback needs no key unless the server was started with `--api-key-strict` |
| `SNS_TOKEN_DIR` | | `~/.config/social-flow` | Root directory for SNS credentials |
| `MEDIA_UPLOAD_URL` / `MEDIA_UPLOAD_API_KEY` | grow-threads image posts | — | Media hosting endpoint + key. Threads only accepts images as **public URLs**, so local files need somewhere to live. Anything works that accepts `POST` with an `x-api-key` header + raw bytes, returns `201 {data:{url}}`, and serves that url as unauthenticated public GET (the header of `skills/grow-threads/references/upload-media.sh` is the contract SoT). Unset, only the image step turns off — text posts still go out |
| `THREADS_TOKEN_FILE` and friends | | `<SNS_TOKEN_DIR>/conventional name` | Per-platform override of the default (flat) path — not applied to channel directories |

Credential file convention (mode 600, never committed) — `threads_token` ·
`instagram_token` · `facebook_page_token` · `youtube-oauth-client.json`.
**Multi-channel**: per-channel tokens live under `<SNS_TOKEN_DIR>/<channel slug>/`
with the same file names, selected by the publish tools' `channel` argument — with a
channel specified, only that directory is used, with no fallback to the flat tokens
(prevents wrong-account publishing). The flat files are the no-channel
(single-channel/legacy) path. **Only platforms with a file present get their publish
tools listed** (union of flat and channel directories). Issuance and renewal:
`skills/publish/references/token-setup.md`.

**Turning individual tools off**: two layers, env first then the JSON file.

1. Environment (per session — list these in `.mcp.json` `env` so the host passes
   them through). Highest first:
   - `SOCIAL_FLOW_TOOL_<NAME>` — one tool (`SOCIAL_FLOW_TOOL_SUNO_GENERATE=off`)
   - `SOCIAL_FLOW_TOOL_FLAGS` — several tools in one line (`suno_generate=0,veo_*=off`)
   - `SOCIAL_FLOW_TOOLS` — allowlist; if set, only the listed names/families stay on
   - `SOCIAL_FLOW_DISABLE_TOOLS` — denylist (`suno_*,seedance_*`)
2. `<SNS_TOKEN_DIR>/disabled-tools.json` — a JSON array of tool names, where a
   trailing `*` covers a family. For example `["seedance_*"]` turns off all three
   Seedance video tools while keeping `veo_*` on. Persistent across sessions.

A listed tool disappears from ListTools and direct calls get an explicit refusal.
The JSON file is read per request, so edits apply without a server restart; remove
the entry (or delete the file) to turn the tools back on. A per-tool env override
can turn one JSON-disabled tool back on for that session. Values split on commas
or whitespace; a bare `*` matches every tool.

## Documentation (docs/)

Manuals are bilingual — Korean pages with English siblings (`*.en.html`).
Full index: **[docs/index.html](docs/index.html)** (Korean) ·
**[docs/index.en.html](docs/index.en.html)** (English).

### API reference (docs/api-reference/)

Side-by-side notes on the official contracts of the 12 external APIs the internal MCP
server calls, and how this implementation honors (or deliberately narrows) each one.

- **[API reference hub](docs/api-reference/index.html)** — inventory · credential matrix · tool↔API map
- **[MCP tool spec & best practices](docs/api-reference/mcp-tools.html)** — Tool
  fields, behavior-hint decision table, 7 authoring principles, quality rubric
- **[Tool quality audit](docs/api-reference/tool-audit.html)** — scores and fixes for
  the 31 tools as of 2026-07-29 (the 30 added since are unaudited)
- Individual APIs — [Gemini TTS](docs/api-reference/gemini-tts.html) ·
  [ElevenLabs TTS](docs/api-reference/elevenlabs-tts.html) ·
  [Veo 3.1](docs/api-reference/gemini-veo.html) ·
  [Veo people & reference policy](docs/api-reference/veo-portrait.html) ·
  [Seedance](docs/api-reference/seedance.html) ·
  [Seedance people & asset policy](docs/api-reference/seedance-portrait.html) ·
  [Lyria](docs/api-reference/gemini-lyria.html) ·
  [Suno](docs/api-reference/suno.html) ·
  [OpenAI Images](docs/api-reference/openai-images.html) ·
  [SerpApi](docs/api-reference/serpapi.html) ·
  [Naver Search](docs/api-reference/naver-search.html) ·
  [data.go.kr](docs/api-reference/data-go-kr.html) ·
  [Meta Graph](docs/api-reference/meta-graph.html) ·
  [YouTube Data](docs/api-reference/youtube-data.html)

The on-device engines (`image_local_generate` · `tts_local_generate` ·
`stt_local_transcribe` · the six `mlx_*` tools) have no
external vendor contract to document, so their evidence lives in research notes instead —
[local image generation](docs/research/2026-08-12-local-image-generation/index.html) ·
[local TTS vs commercial APIs](docs/research/2026-08-11-local-tts-and-commercial-api/index.html)
(Korean).

### Guides (docs/guides/)

- **[Getting started](docs/guides/getting-started/index.html)** — install, API key
  setup, first channel, first episode.
- **[Costs & API keys](docs/guides/costs-and-keys/index.html)** — what image, video,
  TTS, and STT actually cost, the on-device alternatives that cost nothing, setup for
  both lanes, and how the per-episode cap is enforced.
- **[Improv recording guide](docs/guides/ingest-usage/index.html)** — screen
  recording (+voice) → timeline → storyboard → publish, with prep, recording tips,
  and tuning knobs.
- **[Shooting script guide](docs/guides/screencast-usage/index.html)** — the
  storyboard-first shooting flow: filming rules, alignment-drift reports, edit-screen
  layout, troubleshooting.
- **[Threads growth best practices](docs/guides/threads-growth/index.html)** —
  per-post review, the 5 ranking signals, reply culture. The commentary edition of
  grow-threads.
- **[YouTube Shorts growth best practices](docs/guides/youtube-shorts-growth/index.html)** —
  the AI-disclosure boundary, the 2027 YPP changes, myths the official docs deny. The
  commentary edition of grow-youtube.
- **[Instagram Reels growth best practices](docs/guides/instagram-growth/index.html)** —
  the two gates of account standing and per-post auditions, what ranking actually
  predicts, 9 myths that died in verification. The commentary edition of grow-instagram.
- **[Making short-form video with AI](docs/guides/ai-video-production/index.html)** —
  where the two video engines diverge, official prompt rules, and when to burn
  subtitles into the video.
- **[Marketing basics](docs/guides/marketing-basics/index.html)** — the vocabulary a
  marketing beginner needs first.
- **[Affiliate video compliance](docs/guides/affiliate-video-compliance/index.html)** —
  the five gates when promoting Shopping Connect products on YouTube; wording for
  products you haven't used and AI-character disclosure.

## Safety contract (summary)

- **Double HITL gate** — storyboard approval (before production) + publish approval
  (before going public). No publish tool call without approval. Six adversarial
  reviews run once each in front of storyboard approval; they don't block on a score,
  so the approval screen is where an unresolved finding gets its human look.
- **No fact distortion** — time-sensitive values get two independent sources; ranges
  stay ranges.
- **No cross-post copy-paste** — every platform gets its sentences redesigned.
- **No plaintext tokens** — file-based, account resolved via /me.
- **Generated visuals restricted** — mood shots and the channel's own character only.
  No real people, no national symbols, no staged news footage.

## Intended use

This plugin was built for **operating your own accounts yourself**. Publishing,
comments, and growth loops all use each platform's official API, with credentials you
issue for your own accounts.

- **Platform terms outrank this tool.** Complying with the automation and spam
  policies of Threads, Instagram, Facebook, and YouTube is on you. That's also why
  the growth loops ship with rules against engagement-begging and follow-for-follow.
- **Don't run other people's accounts with it, and don't blast the same post across
  multiple accounts.**
- **Follow AI-generated content disclosure duties** — YouTube has
  `containsSyntheticMedia`; the other platforms have their own rules.
- Generated visuals must avoid real people, national symbols, and staged news
  footage (see the safety contract).

No warranty. What this tool creates, and what happens after you publish it, is your
responsibility (see the disclaimer in LICENSE).

## License

[Apache License 2.0](LICENSE). Copyright 2026 Zeans.
