---
name: branding
description: >
  Generates and refines a channel profile image and reviews it on request. Use when the
  user asks to "프로필 이미지 만들어", "채널 로고 만들어", "브랜딩 이미지 생성", "make a channel
  profile image", "generate a channel logo", or right after /social-flow:channel add on a
  channel with no logo. Collects an image brief through AskUserQuestion, generates 4
  candidates in distinct style directions with the saved image model, opens a contact sheet
  for the human to pick a direction, refines the pick with brand-reviewer findings when a
  review is asked for, and installs the master plus platform
  resizes under data/[slug]/assets/branding/ with profile.md updated. Boundary — this
  makes the still profile image; the intro skill makes the moving opening.
argument-hint: "<channel> [extra instructions]"
allowed-tools: ["mcp__social-flow__image_catalog", "mcp__plugin_social-flow_social-flow__image_catalog", "mcp__social-flow__image_plan", "mcp__plugin_social-flow_social-flow__image_plan", "mcp__social-flow__image_execute", "mcp__plugin_social-flow_social-flow__image_execute", "mcp__social-flow__image_status", "mcp__plugin_social-flow_social-flow__image_status", "mcp__social-flow__host_review", "mcp__plugin_social-flow_social-flow__host_review", "Read", "Write", "Edit", "Glob", "Bash", "AskUserQuestion", "Agent", "mcp__social-flow__gpt_image_text2img", "mcp__plugin_social-flow_social-flow__gpt_image_text2img", "mcp__social-flow__gpt_image_img2img", "mcp__plugin_social-flow_social-flow__gpt_image_img2img"]
---
Follow [host evaluation](../_shared/host-review.md) for every requested review.

**Automatic execution policy:** Read [automation guidance](../_shared/automation-guidance.md) first. Creative rules and review findings guide improvements; scores, review/hash/freeze records, CTA choices and intermediate approval steps do not block authorized work. Preserve actual external-action authorization and stop at the artifact the user requested. This policy supersedes older quality-gate wording below.


**HITL records:** Keep the branding brief and chosen candidate in channel branding files. Preserve actual provenance in local files and reuse existing authorization. This adds no approval gate.


# Channel profile image — data/[channel]/assets/branding/

Produces the channel's profile image (logo/avatar) in this order: **brief
collection → 4 candidate generation → HITL direction pick (browser) →
concrete visual review**. The final image is the brand master used
on every platform account profile of the channel. The brand-reviewer agent's
findings are advisory: they inform revisions, and the user's pick and the requested
task decide completion — never a self-score, never a fabricated review.

## Deliverables (path contract)

```
data/<slug>/assets/branding/
├── .work/                          # candidates, iterations, selection page (not committed)
│   ├── brief.md                    # collected brief + the 4 direction prompts
│   ├── candidate-{a,b,c,d}.png     # 4 direction candidates (1024×1024)
│   ├── selection.html              # browser selection page
│   └── iter-{0..5}.png / -192.png  # convergence-loop iterations + review resizes
├── <slug>-logo-master-1024.png     # final master
├── <slug>-logo-youtube-800.png     # per-platform resizes (sips-derived)
├── <slug>-logo-instagram-320.png
└── <slug>-logo-192.png
```

## Procedure

### 1. Load the profile

Read `data/<slug>/profile.md` — if missing, stop and point to
`/social-flow:channel add`. Take §1 identity, §3 THEME (accent/accent2/ink),
and the banned subjects as fixed constraints of the brief. **If a logo already
exists**, always confirm first — the new one will diverge from the profile
already uploaded to platform accounts, and replacing it means re-uploading on
every platform.

### 2. Collect the brief (AskUserQuestion — up to 4 questions; never re-ask what's already given)

- **Subject**: mascot character (animal/object personification) | human-style
  character | abstract symbol | typography-led
- **Text in the image**: none (recommended — letters smear at small avatar
  sizes) | 2–4 letter initials | channel name
- **Background**: solid THEME ink | ink→accent gradient | scene-style (mini
  scene with props)
- **Required motifs**: objects, actions, expressions that must appear (free
  input — suggest candidates from the channel identity, accept Other)

Record the answers in `.work/brief.md` — it's the baseline document for the
review rounds and re-runs.

### 3. Generate the 4 candidates

Generate **4 distinct style directions** with the saved image model
(`.social-flow/models.json` → `models.image`; the host image tool is the recommended
initial choice at setup, an API or local engine when that is what was saved) at 1:1
(`1024x1024`) and save them as `.work/candidate-{a,b,c,d}.png`. Log the matching
`image.*` ledger row (`image.host` at $0 on a host tool). Channel assets follow the
directory model settings like episodes do; a different engine needs the user's explicit
request.
Default directions (swap per the brief):

- **A flat-mascot** — flat vector mascot, thick outlines, simple shapes
- **B render-3d** — soft 3D character render, studio lighting
- **C emblem** — minimal symbol/emblem, geometric shapes, negative space
- **D illust** — painterly illustration, texture and lighting mood

Shared prompt skeleton (identical across all 4; only the style wording changes):

- subject/motifs (from the brief) + explicit THEME hex ("dominant background #<ink>, key accent
  #<accent>") + "square 1:1 social media avatar, subject centered within the
  central 70% safe area for circular crop"
- negative prompt: "no watermark, no signature, no photo frame, no stock-photo look"
  + "no text, no letters" when text is excluded + the profile's banned subjects

### 4. HITL direction pick (browser)

1. Copy `references/selection-template.html` to `.work/selection.html` and
   sed-substitute the tokens (`{{CHANNEL}}`, `{{IMG_A}}`–`{{IMG_D}}`,
   `{{LABEL_*}}`, `{{DESC_*}}`) — the images sit in the same directory, so
   bare file names work.
2. Open it in the default browser with `open .work/selection.html` — each
   candidate shows the original plus **circular crop previews (large/small)**,
   the shape platforms actually display.
3. Get the A–D pick via AskUserQuestion. Other can carry a blend ("B, but
   with A's expression") or a full-regeneration request — for either, fold
   the adjustment into §3 and repeat (selection rounds have no cap).

### 5. Review and improve the brand image

Copy the pick to `.work/iter-0.png`. Look at it yourself at both sizes and fix what you
can see. Run the reviewer and further rounds only when the user asks for a review or a
concrete doubt needs an independent read, and only within the authorized generation budget:

1. Make the small review copy: `sips -z 192 192 iter-N.png --out iter-N-192.png`.
2. **Delegate to the brand-reviewer agent (Agent)** — pass the paths of
   iter-N.png, iter-N-192.png, profile.md, `.work/brief.md`, plus any
   unresolved findings from the previous round.
   Parse the verdict tail `BRANDING_REVIEW: score=NN p0=N verdict=PASS|FAIL`.
3. Resolve useful findings within the task, record any remaining limitations, then continue to §6. A numerical score is not a gate, and the verdict label alone starts no regeneration.
4. When a finding is worth a paid revision (the user agrees, or it is a concrete defect
   such as garbled glyphs or clipping), turn it into correction directives and revise
   with the saved image model's edit tool (`gpt_image_img2img`, `mlx_image_edit`, or the
   host tool's edit).
   - Reference = **the best image so far** (not the previous
     iteration — prevents regressions)
   - Prompt = the §3 direction prompt plus the correction directives only.
     **No full rewrites** — direction drift voids the HITL decision the user made.
   - If the same finding repeats 2 rounds in a row, change strategy:
     mask-inpaint just the problem area, or flip the prompt to remove the
     element entirely.
5. Report the chosen version and unresolved findings. Continue within the requested
   artifact and authorized generation budget; never dress up a score to pass.

### 6. Finalize, install, report

```bash
BR="data/<slug>/assets/branding"
cp "$BR/.work/iter-<final>.png" "$BR/<slug>-logo-master-1024.png"
sips -z 800 800 "$BR/<slug>-logo-master-1024.png" --out "$BR/<slug>-logo-youtube-800.png"
sips -z 320 320 "$BR/<slug>-logo-master-1024.png" --out "$BR/<slug>-logo-instagram-320.png"
sips -z 192 192 "$BR/<slug>-logo-master-1024.png" --out "$BR/<slug>-logo-192.png"
python3 ${CLAUDE_PLUGIN_ROOT}/skills/channel/references/resolve-asset.py \
  --ensure data/<slug> logo master "branding/<slug>-logo-master-1024.png" "profile logo"
```

Update the **logo asset** line in profile.md §1 to the master path (add it if
missing). Report: review findings when a review ran, iteration count, deliverable path
table + next steps — the channel intro video `/social-flow:intro <channel>`
(an intro acted by the finalized character — optional), and the main content
`/social-flow:storyboard <channel> <topic>`. State that uploading to each
platform account profile is manual work (the platform APIs don't support
profile-image replacement).

## Rules

- **Reviews are advisory** — brand-reviewer's findings inform revisions and are reported
  as they came; the user's pick and the requested task decide completion. No score
  manipulation, no fabricated review, no regeneration spent on a verdict label alone.
- **Candidates and iterations live in `.work/`** (gitignored) — only the 4
  final files go into `assets/branding/`.
- **Text in the image is excluded by default** — 2–4 letter initials only
  when the user explicitly asks.
- **No likenesses of real people or existing characters** — inherited from
  the README safety contract. Always include the profile's banned subjects in
  the negative prompt.
- The direction (style) picked at the §4 HITL step **never changes inside the
  review rounds** — if it must change, stop and return to §4 for a
  fresh pick.

## Additional Resources

### Reference Files

- **`references/selection-template.html`** — browser selection page for the 4 candidates (2×2 grid + circular crop previews, token substitution)
