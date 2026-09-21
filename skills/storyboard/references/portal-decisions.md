# HITL decisions → portal (G1–G19)

Record the actual answer immediately in `storyboard/decisions.json`, a JSON array. Upsert by key;
keep the original source, reason, options and answer time when reusing an answer. Do not manufacture
an approval from stage, score or a successful build. `chosenBy` is `user`, `standing`, `auto`, or
`imported`; a standing/automatic decision must cite the authorization in `reason`.

```json
[{"key":"topic_axis","value":"proceed","chosenBy":"user","source":"storyboard§1.2","reason":"actual answer","decidedAt":"2026-09-21T01:00:00Z"}]
```

`portal_episode_checkpoint` and `portal_storyboard_save` read this sidecar automatically, including
before scenes.js exists. Both also accept explicit `decisions` and `publications`; explicit keys win.
Use the next existing checkpoint, without adding a new approval gate. For a hold/stop or a decision
after the last checkpoint, call `portal_decision_record` with `{decision,episodeDir}` before stopping
when the tool is present. It observes the same base-revision and lease checks. A 409 requires pull and
reconciliation, never blind retry. With no portal key keep the file and explain the unavailable mirror.
Pull writes decisions.json through the existing backup/side-copy mechanism; status with no mutation
arguments reads the current episode including `decisions` and `publications`.

| Gate | key | value / details |
|---|---|---|
| G1 storyboard §1.2 | topic_axis | proceed / re-angle / hold; reason carries the axis judgment |
| G2 storyboard §1.5 | format | shorts-9x16 / youtube-long-16x9 |
| G3 storyboard §1.5 | mode | generated / shooting / mixed |
| G4 storyboard §1.7 | style_preset; shot_style:ID | preset; full per-shot exception. options keeps the selection record |
| G5 storyboard §1.7 | production_mode; video_budget_usd; max_attempts | full_video/video_50/video_30/hook_only; number; integer |
| G6 storyboard §1.7 | previz_renderer | blender / threejs; options keeps the selection record |
| G7 storyboard §1.7 | video_model; video_model:ID | full {model,resolution,selection} object |
| G8 storyboard §2.2 | scenario_choice | D1 / D2 / D3; options includes engine and candidate rationale |
| G9 storyboard §2.4 | longform_layout | selected layout |
| G10 storyboard §4.6 | narration_approval | verdict, hash, score, reads, unresolved findings |
| G11 storyboard §7 | board_approval | kind, reference, at, quoteFingerprint |
| G12 produce assembly-video-hitl | assembly_warning:ID | accept / regenerate / swap-still; reason includes warnings |
| G13 produce §3.6 | slide_fallback:ID | ship / re-author / swap-still; reason includes the failed rewrite |
| G14 autoproduce §8 | queue_stamp | {action,platforms}; include standing authorization when autonomous |
| G15 publish §2 | publish_approval | {action,platforms,approvedBy}; each actual platform approval only |

Use stable shot IDs in suffixes. For publication outcomes send `publications:[{platform,postId,permalink,
publishedAt,approvedBy?,captionHash?}]` on the existing published checkpoint. Merely recording a decision
never spends money, changes authorization or publishes a post.

G16–G19 are channel values, not episode answers. Keep them in `profile.md` and the corresponding
branding/intro/keywords files. The portal migration reserves `projects.profile`; channel transport and
screen remain deferred in this version. Do not attach channel answers to an
arbitrary episode or put them into episode meta. Channel mapping: audience, tone, voice, visual_theme,
platforms, fact_check; branding brief/selection; intro concept; keyword phrases/banned.
