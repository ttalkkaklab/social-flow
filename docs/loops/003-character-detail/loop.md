# Character detail refinement

Target: 세련되고 심플하면서 가독성 높은 캐릭터 시트 상세화면을 적대적으로 평가하고 95점 이상까지 개선한다. 유형 아이콘은 유지한다.

The owner authorized iteration until 95; this explicit target replaces the skill's
90-point default and optional iteration budget. Scores assess the template, never
the character's content review. Reviewers work independently and read artifacts.

## Frozen rubric

Generic preset E. Add from zero; cite evidence. Five end-state claims each have
five checks, worth 2 points each (50 total). Unverified checks earn zero.

1. Visual hierarchy: recognizable character first; clear title/role; restrained
   palette; consistent alignment/spacing; no redundant boxed form UI.
2. Readability: readable body size/contrast; bounded line length; semantic lists;
   meaningful field grouping; clear pending/inapplicable labels.
3. Responsive layout: usable at 320, 390, 768, 1024, 1440 CSS pixels, 2 each.
4. Icons and interaction: existing type pictograms preserved; icons accompanied
   by text; visible keyboard focus; usable image preview with Escape/focus return;
   usable language and section navigation.
5. Complete truthful information: every identity field reachable; image slots
   and missing states; voice/sample state; review freshness unchanged; source
   retained without fabricating missing data.

Verifiability: 20 all-or-nothing when every claim has command/read/render evidence.
Objective checks: 15 all-or-nothing for `cd server && npm run check` and
`node skills/platform-guide/references/skill-lint.js` (P0 on failure).
Scope: 15 all-or-nothing for changes confined to detail template, its shared assets,
related tests/docs and required generated artifacts.

Pass: >=95 and zero P0 (broken execution, lost content, removed type icons).
Screenshots use capture-frames.sh. Browser interaction uses ego lite only.
Local evidence: data/character-detail-emperor/ in the main worktree.
