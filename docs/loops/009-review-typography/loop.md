# Multilingual typography and Liquid Glass review

Date: 2026-10-18

Target: Research fonts for Korean, English, Japanese, Simplified Chinese,
Traditional Chinese, Vietnamese, German, French and Spanish; improve the bundled
storyboard with contemporary typography and Liquid Glass styling; repeat independent
adversarial evaluation until at least 95/100 with no critical defects.

The user's explicit instruction to continue until 95 replaces the skill's default
90-point target and iteration-cap confirmation. Work is local and reversible.
No publishing or paid media generation is part of this task.

## Frozen rubric

Score additively from zero. Cite source lines, artifacts or actual command output.
Missing evidence earns zero. Never manufacture a passing score.

| Criterion | Points | Award rule |
|---|---:|---|
| Research and selection | 15 | 5 for dated primary-source adoption/popularity evidence with honest limits; 5 for all nine language choices; 5 for traceable licenses/versions |
| Multilingual implementation | 25 | 5 each: offline packaged faces; actual glyph/weight coverage; correct JP/SC/TC language routing; author language independent of UI language; stable font-ready previews |
| Visual quality | 25 | 5 each: deliberate glass navigation/material hierarchy; readable content contrast; coherent type scale/spacing; desktop composition; mobile composition. Each needs inspected screenshots, not code alone |
| Accessibility and regression | 15 | 5 each: 320–1440 widths and 200% text; keyboard/print/reduced-transparency or no-blur fallback; existing review interactions and generated-library aliases preserved |
| Objective checks | 15 | Full `cd server && npm run check` and skill-lint both exit 0 = 15, otherwise 0 |
| Scope and maintainability | 5 | 5 if changes are relevant, shared generated assets stay consistent, and documented configuration is reproducible; otherwise 0 |

Critical defects: failing objective checks, missing packaged font or license,
wrong explicit CJK region, unreadable/clipped core content, broken review controls,
or claims of completion without the corresponding evidence.

Exit requires score >= 95, no critical defects, and passing objective checks.
Independent reviewers receive the rubric and artifacts, not the implementer's
self-assessment. Reports use `ASTRA_LOOP_RESULT: score=N verdict=PASS|FAIL p0=N iter=N`.

## Design direction

The product is a working storyboard: pictures and dialogue remain the main content.
Use a quiet cool-white canvas, translucent floating navigation, a fine illuminated
rim and restrained shadows. Dense reading surfaces retain high opacity. Avoid
decorative moving highlights and blur on every card. Preserve the existing blue
action color and dark neutral text. Print uses opaque white surfaces.

Inter handles Latin text, Pretendard handles Korean, and regional Noto Sans handles
Japanese and Chinese. Use a 15px base, 16px dialogue, 20px shot headings and responsive
28–36px document title, with generous line height and limited text measure.

Layout: desktop floating rail | title and shortcuts | shot frames + dialogue.
Mobile: top navigation, title, shortcuts, then vertically stacked shots.

## Result

Independent review 1: 95/100, P0=0, objective checks passed. User target achieved.
See [result](result.md) and [independent evaluation](verify-1.md).
