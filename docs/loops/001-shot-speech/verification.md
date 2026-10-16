# Final verification — 2026-10-16

- Independent storyboard review:95/100, P0=0, iteration4; exact evidence is in the local
  episode's storyboard/speech-plan-review.json and STORY.review.
- Independent plugin review:97/100, P0=0, iteration2 (/root/plugin_critic_2).
- Required npm --prefix server run check:3701 tests passed,417 suites,0 failed.
- Required skill-lint:16 rules across19 skills passed. git diff --check passed.
- Fresh stdio MCP servers from both installed bundles list speech_manage and resolve the
  actual s0007/minjae request to d-0007. All50 installation manifest entries match source
  and the Codex/Claude Code caches. Local patch version0.112.0; existing processes not restarted.
- Browser:13 lines show speaker, delivery and stable id; no horizontal overflow; current
  review page displays0 contract violations. Draft CLI reports0 violations,46 advisory warnings;
  browser includes58 advisory checks. Story contract with current independent review:0 errors.
- Korean dialogue checker:100/100, no findings. New skill and contract prose checks passed.
- Existing clips are stale historical references. New audio/video generation, rendered lip-sync
  validation and publication were not performed. The current builder still requires one speaker
  per scene; alternating dialogue splits into consecutive shots.

Local install manifest: data/shot-speech-install.json. Backups are under
~/.local/share/social-flow/backups/shot-speech-20261016-*; scenes history is preserved in
its episode .work directory. A host session already running the old MCP bundle must reload
that plugin or reopen the session to discover the new tool.
