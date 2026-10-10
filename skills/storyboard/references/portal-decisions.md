# Record actual HITL answers

Episode portal calls follow [storyboard-target.md](storyboard-target.md). Local mode records answers locally and skips every remote call below, even with a key. The destination choice stays in `.storyboard-target.json` and is never included in the synced decisions array.

Keep episode answers in `storyboard/decisions.json`, a JSON array with one entry per key.
Update the matching key when the user changes an answer. Preserve the original source,
options, reason and answer time when reusing it. A reviewer score, stage or completed build
is not approval. This record adds no approval gate and grants no permission to spend or publish.

```json
[{"key":"topic_axis","value":"proceed","chosenBy":"user","source":"human-message-id","reason":"actual answer","decidedAt":"2026-10-10T00:00:00Z"}]
```

Use `chosenBy: "user"` only for an explicit human answer. Use `standing` for applicable
standing authorization and cite its file/message and exact scope in `source` and `reason`.
Use `auto` for an authorized automated choice and `imported` for imported evidence. Neither
changes the authorization needed by the skill. Do not invent a time or quote.

The next existing `portal_storyboard_save` or `portal_episode_checkpoint` sends this file as
structured decisions, including checkpoints before `scenes.js` exists. A missing file omits
the field; an empty array sends no answers. Record answers locally when no portal key exists.
The file must be a regular file of at most 10 MiB with at most 500 distinct keys. Keys accepted
by the decision-record client also work here; the portal still validates supported keys and values.
The table is guidance, not an exhaustive client allowlist.

For a hold/stop or an answer after the last checkpoint, use the existing
`portal_decision_record` with `episodeId`, the channel, an explicitly read `baseRevisionNo`
and the evidenced `decision`. Keep the local answer too. That tool does not update local files
or `.portal.json`. Before a later save, pull with `mode: "side"`, merge the returned board and
answers with intended local changes, then save with the returned base revision. A 409 means
reconcile; never advance the local head or retry blindly. A recording failure must be reported.

Pull restores canonical answers from the selected head or revision into `decisions.json`,
even with `includeDocuments: false`. Empty and older snapshots without answers yield `[]`.
Replace mode backs up changed local answers; side mode writes only `.portal-head/` and keeps
local files and their base untouched. Ordinary documents and attachments cannot replace this
file. `portal_episode_status` without status/stage/title reads the current episode; use
`portal_decision_list` for the current decisions or their history.

| Choice | Suggested key | Record |
|---|---|---|
| Topic judgment | topic_axis | proceed / re-angle / hold and the stated reason |
| Format and production input | format; mode | selected format and generated / shooting / mixed |
| Visual style | style_preset; shot_style:ID | preset and any approved shot exception |
| Render ratio and spending | production_mode; video_budget_usd; max_attempts | exact selected ratio, cap, retry limit and quoted scope |
| Previz renderer | previz_renderer | renderer and options actually offered |
| Video model | video_model; video_model:ID | selected model, resolution and selection evidence |
| Scenario and layout | scenario_choice; longform_layout | chosen candidate/layout and its reference |
| Narration approval | narration_approval | verdict, input hash and unresolved findings |
| Storyboard approval | board_approval | approval source, time and quote fingerprint |
| Assembly warnings | assembly_warning:ID | actual answer and warnings for the current inputs |
| Speech warnings at assembly | assembly_warning:ID | actual answer, take hashes and listening findings |
| Failed slide rewrite | slide_fallback:ID | choice and failed rewrite evidence |
| Queue action | queue_stamp | action, platforms and applicable standing authorization |
| Publishing approval | publish_approval | action, approved platforms and exact approval scope |

Use stable shot IDs in suffixes. Record publication outcomes with the existing
`portal_publication_record` after each successful post, before the published checkpoint.
Recording an approval never substitutes for the publish skill's actual authorization checks.

Channel answers belong in `profile.md` and their branding, intro or keyword files, not an
arbitrary episode. `portal_channel_sync` already synchronizes the profile and shared
`assets/branding/**`, `assets/intro/**`, `assets/outro/**` and `assets/sfx/**` trees. Follow its
conflict rules; keyword files outside those paths stay local. Do not claim they were uploaded.
