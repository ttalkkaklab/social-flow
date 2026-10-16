# Review library improvement

Target: improve the local channel home, storyboard list and character list until
an independent adversarial review scores at least 95/100 with no critical defects.
Include portrait short form and landscape long form, responsive layouts, character
reference images, and icon-only voice playback (disabled when no sample exists).
The user authorized repeated improvement to this target. No publication is requested.

Frozen rubric (2026-10-16):

| Criterion | Max | Evidence required |
| --- | ---: | --- |
| Image preservation | 30 | Full image bounds for portrait, landscape and character art; truthful missing/reference states; no CSS cropping or distortion. |
| Card size and density | 25 | Bounded card widths on large screens, useful preview sizes, aligned metadata, no oversized banner or gratuitous blank text blocks. |
| Readability | 20 | Clear titles, roles, status and format; hierarchy and contrast visible in desktop/mobile screenshots. |
| Responsive behavior | 15 | 320, 390, 768, 1024, 1440 and 1920 px layouts; no horizontal overflow; short and long form remain usable. |
| Navigation and accessibility | 10 | Real links, search, language toggle, visible keyboard focus, labeled icon controls, disabled missing audio, exclusive playback and pause/end state. |

Critical defects: cropped required artwork; inaccessible/overlapping essential
controls; broken primary navigation; incorrect reference or audio attribution;
failing required repository checks. A score alone cannot override these defects.

Objective checks: `cd server && npm run check` and
`node skills/platform-guide/references/skill-lint.js`, plus browser assertions and
captures through the repository's capture-frames.sh lane. Reviewers inspect the
artifacts independently and report additive scores with evidence. Local images,
fixtures and logs are under ignored `data/review-library-evidence/`.

Design: preserve Wanted Sans and the existing neutral workspace palette
(background #fcfcfd, text #18181b, secondary #52525b, line #e4e4e7,
action #2563eb, image stage #f4f4f5). Left-align text. Give the home one
bounded image + adjacent synopsis; use a compact image catalogue for lists.
Keep images complete, place playback beside the character name, and retain
truthful panel readiness below the role. Avoid decorative cards around counts.

    Home:       [ complete image ][ title / format / review link ]
    Catalogue:  [ image ][ image ][ image ]
                name ▶   name ▶   name ▶
                role     role     role
                status   status   status
