# social-flow — Project instructions

Channel-based short-form/long-form content pipeline Claude Code plugin.
[README.md](README.md) is the source of truth for structure, skills, and the MCP tool list.

## Style ban — report-style stative verbs (user directive, 2026-08-12)

Don't close sentences with Korean endings of the
**남긴다 · 갈린다 · 나뉜다 · 남는다 · 남습니다 · 나뉩니다 · 갈립니다 · 남깁니다**
family. Wrapping a phenomenon up in a single verb is narration-style prose — an AI tell.
Name the subject and write concretely instead — "근거를 남긴다" → "근거를 적어 둔다",
"추천이 갈린다" → "미용실마다 다른 색을 권한다", "둘로 나뉜다" → "두 갈래다".

**The scope isn't just content copy** — skill docs, code comments, tool descriptions,
published HTML, commit messages, user responses, all of it. `check-style.py` D8(S1)
machine-blocks content copy, but **no checker runs on docs and comments**, so the
writer has to hold the line. Run this scan when writing or editing a doc:

```bash
python3 - <<'PY'
import re, os, glob
pat = re.compile(r'남긴다|갈린다|갈렸다|엇갈린다|나뉜다|(?<!살아)남는다'
                 r'|갈립니다|나뉩니다|(?<!살아)남습니다|남깁니다')
roots = ['skills','agents','server/src','docs'] + glob.glob('data/*/growth/*/growth-plan.md')
files = ['README.md','CLAUDE.md']
for r in roots:
    if os.path.isfile(r): files.append(r); continue
    for dp,_,fn in os.walk(r):
        files += [os.path.join(dp,f) for f in fn
                  if f.endswith(('.md','.html','.ts','.js','.sh','.py'))]
for p in files:
    if 'korean-style.md' in p or 'check-style.py' in p: continue   # rule source of truth · fixtures
    s = open(p,encoding='utf-8',errors='replace').read()
    for m in pat.finditer(s):
        print(f"{p}: …{s[max(0,m.start()-40):m.end()+15]}…".replace('\n',' '))
PY
```

`growth-plan.md` (the standing authorization) is in the scan — it's our prose, reread
every tick. `growth-log.md` and `state.json` are not (past records, and they hold
reviewer quotes). `CLAUDE.md` quotes the banned forms in this section, so it's normal
for the scan to flag that passage.

The rule's source of truth is `skills/platform-guide/references/korean-style.md` §D8.
Exceptions: `살아남는다` (a different verb), conditionals (`나뉜다면`), spoken past
tense, and imperatives (`남겼어`·`남겨 둬`).

## Episode production choice (user directive, 2026-09-06)

Before assets, HITL offers **100% 이상** (`full_video`), **50% 이상** (`video_50`),
**30% 이상** (`video_30`) or **훅만 영상** (`hook_only`) with first-pass and retry-inclusive video
costs, model, resolution, audio setting, explicit budget cap and exclusions. Persist the choice
in `window.PRODUCTION`. Ratios count new cuts, rounded up; exclude reused clips, supplied
recordings/stock clips and the shared outro. Hook-only generates the opening hook alone.
Explicit episode choices override the old 1–2 clip cap and optional-hook default. Keep
`hybrid` only for existing approvals. Bind approval to the final cost quote. Resume an unchanged approval.
Before storyboard authoring, ask for one of the visual-style presets — cinematic-miniature,
photoreal live action, webtoon, claymation, paper-cutout, ink-wash, toon-3d (added 2026-09-08
from the Shorts style survey) or arcade-2d (added 2026-09-09, a hand-painted 1990s arcade game
frame with no HUD) — and apply that choice to every new source/end image and video prompt in
either mode.
Follow `skills/storyboard/references/visual-style.md`; production mode never chooses the art style.
For cinematic-miniature only, full_video follows the spatial-explainer reference `LQZjvQ5W2ck`: consistent miniature/cutaway/
realistic materials, stable geography, deliberate camera moves and visible physical changes.
Its branch overrides the older HTML-only explanation, person-required video and generated-shot
cap clauses below. It does not relax facts, voice, budget, publishing approval or the ban on
marks over video. Read the production-mode and full-video contracts linked from the skills.
Quality is reviewed against source images and actual clip playback, with asset-bound evidence;
a metadata pass alone is not proof of visual quality. Never hide a failed clip with a still,
HTML fallback, looping or freeze padding. The builder validates the approved video manifest.

## Nothing is drawn over video — explanation is an HTML slide (user directive, 2026-09-05)

This outranks every other rule in the plugin, the skills and the reference docs.

- **Nothing is drawn over video.** No arrow, route, X, ring, hatch, bracket, dot, label or
  callout goes over a generated clip, a motion background, a b-roll, a quote clip or a
  recording. The burned subtitle is the only type on a moving picture. The footage treatment
  (`treatment:"footage"`, 0.47–0.53: one clip per sentence under drawn marks) is retired —
  `check-scenes.js` and `check-slide.js` reject it.
- **A cut that needs an arrow, a figure or a principle is an HTML slide, not video.**
  `shot.infoType` timeline · statistic · principle, and any beat that would need something
  pointed at on the picture, are `kind:"diagram", motion:true, treatment:"editorial"` on the
  studio stage, with a rendered object when a thing is the subject. The quality bar is
  `docs/research/2026-09-04-rendered-object-slide/reference-slide.html` — lit slabs, a
  cyclorama, a baked object whose movement is the sentence, one accent, values that count
  while the sentence runs. Those slides sit outside `html_plate_max`, and the static-ground
  clock runs per reveal group on them.
- Video carries essential continuous action with no drawn explanation marks. Mood, place and
  people use still-camera motion when that conveys the cut.

## Physical subjects use 3D objects (user directive, 2026-09-06)

- Choose the shot's purpose first. People, mood and place use a high-quality still with a
  deliberate camera move. A person or physical noun alone does not require a 3D explanation.
  Match camera direction to the actual cut: introduce a face with focus-in, inspect an object
  then a face with rack focus, approach a detail, or pull back to reveal context. Foreground
  reveals and parallax require prepared layers and a clean background. Do not cycle effects
  by shot number. Record the subject, focus regions and reason in the shot plan.
- Principles, quantities, mechanisms and explanatory situations use HTML motion scenes.
  Depict physical things as recognizable, articulated 3D objects: a cart has wheels, an axle,
  a bed and a load. Labelled boxes are not substitutes. Abstract quantities may use bars.
- Give explanatory scenes a relevant environment, such as a workshop, office or supply depot.
  Plan foreground, floor and background together; black or a solid colour is not the default.
- When a narrated person helps explain the action, include a cute, authored 3D doll character
  in the same material, lighting and perspective as the objects and environment. Animate its
  relevant gesture and contact with objects. Characters are optional when objects explain it.
  A realistic character painting with separately overlaid 3D props is not this treatment.
  Prefer an acted task with anticipation, contact and release: move a piece, stamp a document,
  or pull a cart. Head bobbing and waving alone do not explain object manipulation.
- Use real mesh objects with 3D illustration or photoreal materials for new physical subjects.
  Follow `skills/storyboard/references/mesh-objects.md`; the offline runtime consumes GLB and
  articulated mesh assemblies. Flat disks, labelled boxes and moving cutouts cannot substitute
  for a physical mechanism. Abstract quantities can still use bars, type and relationship lines.
- Keep explanatory marks sparse. Character action scenes default to no drawn marks. Preserve
  useful part labels on mechanism scenes, one at a time with a short timed appearance, a small
  anchor and a legible line. A mark needs a reason beyond decoration; remove duplicate labels.
- Use `h.mark.arrow` for smooth curves with a small head following the path. Pen strokes are
  an explicit stylistic choice. Keep the object, arrow and type readable together.
- Render subject motion at the final capture frame rate. Inspect full playback and random
  seeks, including group boundaries. A schema pass alone does not establish visual quality.

## Choose each cut by purpose (user directive, 2026-09-06)

This replaces the older mandatory-video hook and fixed editorial-cut quotas.
Use `skills/storyboard/references/render-routing.md` before choosing any assets.
Every generated cut declares `shot.render.mode`, `purpose` and `reason`:
`still_camera`, `character_html`, `object_html`, `data_graph`, `generated_video`, `editorial_html`,
or `stock_video` (a free stock or archive clip with its `visual.license` record, 2026-09-07).
People mentioned in narration do not automatically need 3D characters; incidental numbers
in a mechanism do not automatically need a graph. Choose the information the viewer needs.

The hook follows the same process. `hook_video` defaults off; an explicitly enabled channel
policy remains a constraint. Generated-video caps and budgets are ceilings, not quotas.
No cut is paid video merely because it opens the episode. Every generated-video choice needs
essential continuous motion and an explanation of why a still or controlled HTML action is
insufficient. Existing recordings and the shared outro retain their source.

`check-scenes.js --draft` blocks missing or contradictory choices before assets; full checks
also match the choice to the production handoff. The approval page displays the mode and reason.
Camera HTML is still-camera motion and never counts as true subject motion. Keep the existing
static-ground limit, episode budget, generation cap and no-marks-over-video rule.

## Visual direction and charts (user directive, 2026-09-06)

Read `skills/storyboard/references/visual-direction.md` before planning cuts. Do not copy
one generic render reason across the episode. Text-led quotations and verdicts use the
limited `editorial_html` route; they cannot become the whole episode by declaring motion.
Choose photographs, acted 3D processes, object mechanisms and charts from the story's needs.
Data graphs follow `skills/storyboard/references/chart-design.md` and the shared SVG renderer.
No unsupported route, substituted number card or separate PRELUDE may reach assembly.
The builder reruns source-plan checks and records its version and input hashes before encoding.

## Host media tools first (user directive, 2026-09-07)

When the CLI running a skill ships its own media generation, that tool comes before the
plugin's API lanes. Codex and Grok expose `image_gen` (Grok also `image_edit`), so every
generated still, slide art, candidate logo, intro keyframe and growth-post image goes there
first; Grok exposes `image_to_video` and `reference_to_video`, so every generated clip goes
there first. Claude Code has neither, so the API table applies unchanged there. The storyboard
records the detection in `window.PRODUCTION.imageProvider` and `videoProvider` (`host` | `api`);
an explicit `api` written for the episode wins, and the fallback from a failed host call is
asked for, never silent. Host output is logged as `image.host` / `video.host` at $0 with the
allowance noted. The contract is `skills/produce/references/still-generation.md` §1 and
`skills/produce/references/video-model-selection.md` §The host video tool comes first.

## AI video cuts are pre-rendered in 3D first (user directive, 2026-09-11)

Every `generated_video` cut renders its camera and blocking in 3D before any video call — a
Blender previz through the `blender_*` bridge, or a three.js previz through
`skills/storyboard/references/previz-template.html` — at the cut's billed length, 24 fps, grey
proxies with one flat colour per actor and nothing else in frame. The render is stored as
`visual.video.previz` (`renderer`, `clip`, `firstFrame`, `sha256`, `fps`, `seconds`,
`camera.movement`) and `check-scenes.js` refuses a generated cut without it. The previz gives
the video model its camera, timing and blocking: on the API lane it rides Seedance 2.x as the
reference video (`Video 1`) with the source still as `Image 1`; on a host video tool that takes
no clip it shapes the still and the prompt instead (`handoff:"frame_and_prompt"`). The source
still is edited from the previz's first frame, so the composition the clip starts on is the
composition the still has. The previz's move and the shot's `visual.camera.movement` must agree;
a prompt that fights the clip drifts. Imported clips (`visual.reuse`), stock footage, recordings
and the outro carry none, and neither do b-roll and speech clips on the Veo sound lane (no clip
input there; the reference route is the motion-background route). Two of the choices are the user's, asked with AskUserQuestion and
recorded before anything renders or bills: **which renderer** (Blender or three.js) before the
first previz render — `PRODUCTION.previz` — and **which video model** (the Seedance 2.x grades,
with `video-model-options.js`'s cost table) before any video call — `PRODUCTION.videoModel`;
`production-mode.js` refuses a board with generated cuts that lacks either record. Contract:
`skills/storyboard/references/blender-previz.md` §6 and `production-mode.md` §When to ask.

## Branch strategy

```
feat/<name> | fix/<name>  (integration)  →  dev  →  staging  →  main
```

- Sprint work happens in a `feat/sprint-<N>-<name>` worktree and PRs into the integration branch.
- Promotion goes `dev → staging → main`, in that order. Never straight to `main`.
- Keep remote work branches after merge (history, rollback). Clean up local sprint branches only.

## Commits and secrets

- Never commit `.env*`, `*.pem`, `*.key`, or any credentials/secrets (already in `.gitignore`).
- Nothing under `data/` gets committed — the one exception is `data/README.md`,
  which documents the structure. Channel profiles, storyboards, images, videos,
  and branding assets are local artifacts; this repo holds only plugin code and skills.
- Conversely, `server/dist/` is a build artifact but **must be committed** — `.mcp.json`
  runs `${CLAUDE_PLUGIN_ROOT}/server/dist/bundle.js` directly with no build or install
  step. The bundle is self-contained (dependencies inlined via esbuild) because
  marketplace installs never run `npm install` — an unbundled entry dies with
  `ERR_MODULE_NOT_FOUND` there. After editing `server/src/`, run `npm run build`
  and commit dist (per-module output for tests + `bundle.js`) along with it.
- API keys are injected via shell environment variables, not `.mcp.json`.

## Multi-session caution

Multiple Claude Code sessions work in this repo at the same time.
Before committing or merging, check `git status` and recently modified files
(`find . -mmin -30`) so you don't sweep up files another session is editing.
