# Font selection and glass materials

Research date: 2026-10-18. Scope: the offline storyboard and its shared review UI.

## Evidence and limits

There is no verified, comparable usage ranking covering all nine requested languages.
“Most used” and “most stylish” are different questions. The selection below combines
observed web adoption, official product/design-system choices, language coverage,
screen readability and redistributable offline files. It is a design judgment, not
a claim that each selected face ranks first in its language.

[HTTP Archive's 2025 Fonts chapter](https://almanac.httparchive.org/en/2025/fonts)
was published on 2026-01-15 and updated on 2026-02-10. Its web crawl reports Roboto,
Noto Sans JP and Inter among widely observed families. These observations measure
sampled websites/font requests, not a population-wide ranking per language.

| Language | Candidates examined | Selection and evidence |
|---|---|---|
| Korean | Pretendard, Noto Sans KR, existing Wanted Sans | Pretendard Variable 1.3.9. [KRDS uses the related Pretendard GOV family](https://www.krds.go.kr/html/site/outline/outline_03.html); this is adoption evidence, not a base-Pretendard market-share statistic. |
| English | Roboto, Open Sans, Inter, Geist | Inter 4.1. Established web adoption and UI-oriented forms; its optical-size axis supports both reading text and headings. |
| Japanese | Noto Sans JP, Pretendard JP | Noto Sans JP. The [Japanese Digital Agency typography guide](https://design.digital.go.jp/dads/foundations/typography/) explicitly adopts it; the guide was updated 2026-08-05. |
| Simplified Chinese | Noto Sans SC, MiSans, PingFang SC | Noto Sans SC. Regional glyph forms and an OFL license suitable for an offline plugin. |
| Traditional Chinese | Noto Sans TC, MiSans TC, PingFang TC | Noto Sans TC. Traditional Chinese with Taiwan forms. Not a claim of Hong Kong-specific HK coverage. |
| Vietnamese | Inter, Roboto, Noto Sans | Inter. Vietnamese is in the official language list; all vowel/tone combinations and combining marks were checked in the actual bundled file. |
| German | Inter, Roboto, Open Sans | Inter. Check umlauts, ß and ẞ, including long compound words on mobile. |
| French | Inter, Roboto, Open Sans | Inter. Check accented vowels, œ/Œ and punctuation. |
| Spanish | Inter, Roboto, Open Sans | Inter. Check ñ/Ñ, accented vowels and inverted punctuation. |

Inter's [official site](https://rsms.me/inter/) documents its language support and
variable optical sizing. The [4.1 download](https://rsms.me/inter/download/)
provides the release used here; the actual font's internal version string is
4.001 and is recorded without relabeling it.
[Pretendard's upstream](https://github.com/orioncactus/pretendard) describes its
Inter/Source Han Sans lineage, which helps the Latin/Korean combination feel
coherent. [Noto's CJK distribution guide](https://github.com/notofonts/noto-cjk/blob/main/Sans/README.md)
explains the JP/SC/TC regional variants: shared Han codepoints do not imply identical
regional glyph shapes.

[Geist](https://vercel.com/font) is a credible contemporary alternative, but Inter
offers an especially coherent pairing with Pretendard and documented Vietnamese
coverage. [MiSans](https://hyperos.mi.com/font/en/about/) has real Xiaomi adoption;
its [custom license/FAQ](https://hyperos.mi.com/font/faq) needs different treatment
from OFL. Neither alternative is rejected as unfashionable.

## Implemented typography

Inter supplies Latin letters in every stack. Pretendard supplies Korean; Noto Sans
JP, SC or TC supplies regional CJK. Font weights are variable, titles use 650 and
dialogue uses 400 with 1.8 line height. The base is 15px, dialogue 16px, shot titles
18–20px and document titles 28–36px. Code retains the existing monospace stack.

`SB_DOC.contentLanguage` selects the authored language. `SB_DOC.shotLanguages`
maps one-based shot numbers to overrides, for example `{ "3": "ja", "5": "zh-Hant" }`.
The review UI still offers English and Korean; choosing an interface language does
not translate or reassign the language of the script. Without metadata, Hangul and
kana can identify a legacy script. Han-only text is marked `und`, with SC as the
documented fallback; a region must be explicitly supplied to distinguish it.
`zh-TW` maps to TC and `zh-CN` to SC. HK/MO tags use TC as a documented fallback;
this bundle does not promise Hong Kong-specific Noto Sans HK glyph forms.

All five complete upstream fonts are bundled (19,966,240 bytes in total). No CDN,
installed-font dependency or sample-only subset is used. Only selected faces are
requested by the browser; all are copied to each portable standalone board and to
the shared channel assets. This trades disk space for reliable offline portability.
The [font manifest](../../../skills/channel/references/review-assets/fonts/manifest.json)
records pinned sources, versions, licenses, checksums, axes and glyph coverage.
The renderer waits for selected faces before measuring preview overflow; a missing
font displays a warning. Embedded video/slide files retain their own typography.

## Liquid Glass interpretation

[Apple's materials guidance](https://developer.apple.com/design/human-interface-guidelines/materials)
places Liquid Glass in the control/navigation layer and advises restraint in the
content layer. The implementation follows that hierarchy: floating rail and section
shortcuts use translucent white, a fine luminous rim, backdrop blur and soft shadows.
Shot cards are 94% opaque reading surfaces without blur. The background is a quiet,
static cool-white light field. This is a web interpretation, not Apple's native
optical refraction implementation.

Dark text and blue actions preserve the existing review semantics. Reduced
transparency/greater contrast use solid surfaces; browsers without backdrop-filter
also receive an opaque navigation surface. Reduced motion disables navigation
transitions. Print removes the glass background and navigation, expands disclosures
and restores their previous state afterward.

## Reproduce

1. `node docs/loops/009-review-typography/create-preview.cjs`
2. Serve `data/review-typography` on localhost and open
   `episodes/multilingual/storyboard/storyboard.html`.
3. Use `skills/produce/references/capture-frames.sh` with `CAPTURE_PIPE=1`,
   `CAP_W` and `CAP_H` to capture exact viewport dimensions.
4. The fixture intentionally retains content-check findings. Typography and UI
   evaluation do not certify an episode's creative or production readiness.
