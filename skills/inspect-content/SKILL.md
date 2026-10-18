---
name: inspect-content
description: >
  Inspects existing assets and storyboard flow; reports without editing.
  Use when the user asks to review a character, background, location, prop,
  scenario, specific shot or whole episode, including "캐릭터 확인", "배경 검토",
  "소품 연속성", "시나리오 평가", "전체 흐름 봐줘", or "inspect this storyboard".
  Channel creates reusable assets; storyboard plans new episodes; produce builds
  approved episodes; edit-speech changes lines; review-recent reports published metrics.
argument-hint: "<channel> [episode] [character, background, prop, shot or whole story]"
allowed-tools: ["mcp__social-flow__host_review", "mcp__plugin_social-flow_social-flow__host_review", "mcp__social-flow__storyboard_read", "mcp__plugin_social-flow_social-flow__storyboard_read", "mcp__social-flow__storyboard_check", "mcp__plugin_social-flow_social-flow__storyboard_check", "mcp__social-flow__location_manage", "mcp__plugin_social-flow_social-flow__location_manage", "mcp__social-flow__capability_status", "mcp__plugin_social-flow_social-flow__capability_status"]
---
Follow [host evaluation](../_shared/host-review.md) for every requested review.

**Automatic execution policy:** Read [automation guidance](../_shared/automation-guidance.md) first. Creative rules and review findings guide improvements; scores, review/hash/freeze records, CTA choices and intermediate approval steps do not block authorized work. Preserve actual external-action authorization and stop at the artifact the user requested. This policy supersedes older quality-gate wording below.

# Inspect existing content

Inspect the requested scope and report evidence. This skill does not edit assets,
generate media, approve a board, publish, or spend money. Only use read-only actions
of tools listed here. Existing failed or stale reviews remain unchanged. Return findings
in the conversation; write a report only when requested. Asset-only requests need no episode.

- [ ] Locate the requested channel and existing episode or asset. Reuse the current
  conversation's target. If several candidates match, list them and clarify the target;
  never choose another channel's similarly named character. Read the local profile and
  source files. Missing files are findings, not permission to generate replacements.
- [ ] Read plans and reference context using the scope table below. For an episode call
  `mcp__social-flow__storyboard_read` with `{path: ".../storyboard", level: "full"}`.
  Context is included by default: `reviewContext.story`, `production`, and `document`
  carry STORY, PRODUCTION and SB_DOC. Use `shotId` for `selectedShot` and its neighbour
  ids; read those neighbours in `playback`, which follows b-roll insertion and closing-outro order. `unscheduledShots` flags inserts with no valid playback position. Shot rows include ordered performance,
  resolved speech, references and media paths. `evidenceStatus: "not_verified"` is honest
  metadata, not a failed inspection. Keep the returned source hash. Display positions help the user find shots; stable
  `shotId` values identify findings across insertions. Do not assign ids to legacy boards.
- [ ] Open actual available reference and output images with the host's native image
  reader (Claude Read or Codex image viewing). A filename, URL, HTML thumbnail listing,
  generation receipt, or hash proves no visual detail. Compare pixels with the intended
  identity, environment, prop state and shot action. Record precisely which images opened.
- [ ] Check the whole story in playback order when requested, including silent action,
  character dialogue, narration, inserts and closing shots. For a single shot, also read
  its containing scene and immediate neighbours; do not claim whole-story coverage.
- [ ] Cross-check planned framing against every claimed visible actor and prop. A close
  insert cannot also prove a distant witness or a face-worn object outside the frame.
  Distinguish custody from visibility. Register objects needed to understand a causal
  link (notebooks, maps, returned payments), and require an explicit location plan for
  concealed sightlines, locked entrances and safe access. In still-camera plans, split
  sequential actions or identify the single depicted moment; camera motion does not
  animate actors. Check the rendered review page for unresolved template placeholders.
- [ ] Run read-only structural checks relevant to the scope. Separate machine findings
  from visual or narrative judgments. Re-read the board hash before reporting; if it
  changed during inspection, refresh affected context or mark the review stale.
- [ ] Report issues, coverage, limitations and the smallest proposed fixes. Stop here.

## Scope and context

| Scope | Read and compare |
|---|---|
| Character | Local `assets/characters/ID/identity.md`, its `body.png`, `back.png`, `face.png`, approved variants and the board's character handoff. Compare proportions, clothing, landmarks, acting and dialogue with confirmed identity; keep pending fields unknown. Front (`body.png`) includes the head and a neutral face; back faces away. |
| Background/location | Shot location binding, manifest revision, state, numerical camera, landmarks, reference renders and actual output. Use `mcp__social-flow__location_manage` actions `read`, `references` or `check` only. Missing binding does not prove inconsistency: inspect ordinary background references too. Check entrances, geometry, lighting and screen direction across adjacent shots. |
| Prop | Board prop sheet, appearance references, continuity ledger, shot usage and snapshots. Compare owner separately from holder, hand/location, condition and appearance version. Unknown custody is unknown. Inspect the actual prop in output images; a consistent ledger is only a consistent plan. |
| Scenario/whole board | STORY intent and review, STRUCTURE sequences/scenes, SB_DOC characters/props and PRODUCTION scope, plus every shot's action and explicit speaker lines. Check motivation, causality, legibility, setup/payoff, ending and transitions. Evaluate narrative order separately from fictional story time, especially for flashbacks. |
| Specific shot | Stable shot id and position, scene/sequence purpose, action, dialogue, camera, character/location/prop references, source/end images, existing clips and asset-bound review records. Compare intended action with available output and with neighbouring shots. |

Read [character identity](../channel/references/character-identity.md),
[location assets](../storyboard/references/location-assets.md),
[prop continuity](../storyboard/references/prop-continuity.md) and
[character scenarios](../storyboard/references/character-scenarios.md) only for the scopes needed.

For ordered action/dialogue, run the installed plugin's read-only command:

```bash
node "$CLAUDE_PLUGIN_ROOT/skills/storyboard/references/check-story.js" "PATH_TO_STORYBOARD" --text
```

For prop snapshots, run `skills/storyboard/references/prop-sheet-cli.js` from the
installed plugin with the board path and `--shot N`. N is the current display position
from the same board revision, not a stable id. Never pass `--apply` during inspection.
Use `mcp__social-flow__storyboard_check` for contract findings; a draft without generated
assets is a plan review, not a failed visual production or a visually verified result.

## Local media boundaries

Read character images directly from the selected channel's local
`assets/characters/ID/` folder using the host's native image reader. Inspect front,
back and face separately and record the actual paths opened. Metadata and hashes
alone do not prove visual consistency. If an image is missing or cannot be opened,
report **visual inspection unavailable** for that view and continue with available
text. Do not download, sync or generate replacement assets during inspection.

For video distinguish **full playback inspected**, **sampled frames inspected**, and
**not inspected**. Sampled frames cannot establish timing, motion, lip-sync or every
transition. Read [video review](../produce/references/full-video.md) when clips exist.
If the host cannot inspect playback, state that limitation. Do not automatically listen
to or score speech; speech stays `not_reviewed` unless the user specifically requests it.

## Evidence in the answer

Give a verdict for the requested scope, then findings with severity, stable shot/asset id,
actual path or quoted action/line, observation, consequence and proposed fix. State
coverage as counts (e.g. all 8 planned shots; 5 of 8 generated images opened; no clips).
Use **verified / issue / unverified / not applicable** separately for plan validity,
visual agreement and playback. Missing assets or unsupported media stay unverified.
Any score must name its rubric and unverified dimensions; do not infer a passing score
from a schema check or copy an older score onto new files. Report source hashes for
the board and inspected assets when available; no review record is written by this skill.

Acceptance examples: [inspection evaluations](references/evals.md).
