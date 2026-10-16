# Prop sheets: implementation, installation and verification

Completed on 2026-10-16. Independent adversarial scores: **75 → 93 → 98**. Final verdict: **PASS**, no reproduced critical defects. See [final evaluation](verify-3.md).

Implemented:
- Prop identity, versioned appearance references and appearance-only registration.
- Separate owner and holder, location and condition, with explicit unknown/none values.
- Initial states and typed story-time events, independent of playback order; flashbacks and per-shot assertions.
- Offline prop cards, time and character filters, history, bidirectional shot links and condition-aware images.
- Validated MCP/CLI edits with file hashes, backups and approval invalidation.
- Prop state and reference-image handoff to still, Seedance and ASTRA prompts.
- Legacy portal metadata round-trip preservation. This does not deploy a native portal prop editor.

## Installation

Both Codex and Claude Code active `social-flow/0.112.0-character.1` caches contain the combined local build. Existing character and location work was preserved. The local marketplace source contains the same build so reinstalling from that source retains all three features. This is a local development build, not a published release. New host sessions load its new skill and MCP schemas.

[Installation receipt](evidence/install.json) records the durable build, prepared plan and backups. The installer verifies content and executable permissions and refuses changed targets. No credentials were changed, and no remote repository or live episode was published.

## Evidence

| Check | Result |
|---|---|
| [Combined full build and regression suite](evidence/combined-check.log) | 3,739 tests, 417 suites, all pass |
| [Combined skill lint](evidence/combined-lint.log) | 16 rules, 19 skills, all pass |
| Source production integration | 66 tests pass |
| Merged location/prop prompt integration | 2 targeted tests pass |
| [Codex installed bundle](evidence/codex-smoke.json) | 8 checks pass |
| [Claude installed bundle](evidence/claude-smoke.json) | 8 checks pass |
| [Actual browser assertions](evidence/browser.json) | 9 checks pass |
| Korean UI style | 100/100 |

[Desktop capture](evidence/desktop.png) shows the post-damage reference and state. Browser assertions used the actual installed renderer and covered pre/post-loan and damage, reverse character lookup, appearance-only props, navigation and mobile overflow.

The demo under `data/prop-qa/` is a prop-focused test fixture, not an approved production episode; unrelated production checks on that deliberately incomplete fixture are not treated as a pass. No paid media generation or live portal write was needed. Installed bundles run without dependencies; development unit suites were run in the build workspace, and fresh MCP processes tested the actual self-contained installed bundle.

## Known limits

Concurrent MCP/CLI writers do not yet share a common lock. Hash checks and backups protect ordinary stale edits, but a simultaneous-write stress test was not completed. Full keyboard and print accessibility remain beyond the browser checks performed here. The independent reviewer deducted two points for these limits.
