# Generated review UI — adversarial assessment, 2026-10-16

Result: character review **97/100**, storyboard review **96/100**. The lower
score is the release score: **96**, strictly above the requested 95. No blocking
UI defect was observed in the exercised cases.

This is an in-session adversarial self-review by the implementing agent, not an
independent reviewer, user study or accessibility certification. Scores are
judgment against the rubric below; the automated checks are reported separately.
Existing character artwork scores in review.json are unrelated to these UI scores.

## Scope and fixed rubric

Improve the plugin generators, not the supplied channel's generated index.html.
Reference input: `/Volumes/data/repository/ttalkkaklab/ttalkkak-story/social-flow/data/gate-webtoon/`.
A copy under `data/ui-review/gate-webtoon/` supplied real characters, media and
storyboard data. The original channel was not modified. No paid generation or
portal operation was performed.

| Criterion | Maximum | Character final | Storyboard final |
| --- | ---: | ---: | ---: |
| Visual finish: image scale, restraint, typography, spacing | 30 | 29 | 28 |
| Information structure: review order, detail disclosure, findability | 25 | 24 | 24 |
| Responsive behavior: phone, tablet, desktop, no horizontal page overflow | 20 | 20 | 20 |
| Accessibility and interaction: keyboard, focus, controls, language | 15 | 14 | 14 |
| Generator consistency: shared assets, refresh, preserved source data | 10 | 10 | 10 |
| Total | 100 | 97 | 96 |

A broken primary link, inaccessible modal exit, hidden audit errors, lost source
content or page overflow blocks acceptance regardless of the numerical score.

## Iterations and attempts to disprove completion

| Round | Lower score | Finding and correction |
| --- | ---: | --- |
| Baseline | 72 | Small silhouettes and fade mask obscure the feet; narrow search; fields precede reference art; dense production metadata precedes shot frames. |
| 1 | 89 | Larger unmasked gallery and artwork-first sheets work. Image links need an explicit viewing affordance. Shot grammar still dominates the frames. Added visible original-image actions and direction disclosures. |
| 2 | 94 | Actual alias interaction exposes a defect: the checks shortcut scrolls to a closed details element. The 768px rail also crowds content. Open the target itself, transfer focus and move navigation above content below 1024px. Move explanatory toolbar prose into its guide. |
| 3 | 96 | Repeat viewport, keyboard, alias and print checks. No observed blocking UI issue. Residual deductions below keep this short of 100. |

Remaining deductions: storyboard header badges are still dense; the existing shot
terminology takes some learning; gallery source art has differing backgrounds;
no screen-reader or Safari/Firefox validation was performed. The preview page's
existing production violation and warnings remain visible; this UI review does
not certify episode content, production readiness or the artwork itself.

## Executed evidence

- `cd server && npm run check`: PASS, 3,669 tests, 416 suites, zero failures,
  skips or cancellations. First attempt lacked local dependencies; `npm ci`
  restored the lockfile dependencies, then the full check passed.
- `node skills/platform-guide/references/skill-lint.js`: PASS, 16 rules / 18 skills.
- `storyboard-html.js <copied storyboard directory> --check`: PASS, shared helpers,
  template, CSS and library copies match; no refresh differences.
- Ego Lite real-page checks: cast index, character sheet and storyboard library
  alias at 320, 390, 768, 1023, 1024 and 1440 CSS pixels. No horizontal page
  overflow. Also checked storyboard index at 320/390/768/1024/1440.
- Search for 민재 yields exactly 강민재; nonsense search shows the no-results view.
- Image dialog opens from the actual image link, focuses Close, closes with
  Escape and restores focus to its originating link. English URL selection
  renders View original / Close. Source-file links remain available without JS.
- The storyboard alias retains its own URL when jumping to checks; checks opens
  and receives focus. Direction details opens. Before-print opens every details
  element; after-print restores open checks/direction and closed notes.
- Headless Chrome captures used only `capture-frames.sh`. Inspected desktop cast,
  phone character sheet, desktop/phone board and tablet cast. Local evidence:
  `data/ui-review/before.png`, `board-before-mobile.png`, `after-cast.png`,
  `after-detail-mobile.png`, `final-board-mobile.png`, `final-tablet.png`.
  Captures and copied production inputs are intentionally untracked under data/.
- `git diff --check`: PASS.

## Delivery and limits

Changed shared review.css, review.js, review-library.js and review-layout.js,
plus their design contracts. New generation and normal refresh pick up these
assets automatically. Existing HTML elsewhere does not change until refreshed.
No installed plugin cache or remote portal deployment was changed. The result
is an owner-requested local design refinement, not newly verified portal parity.
