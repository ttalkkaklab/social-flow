# Fonts for motion graphics

A motion theme assigns a family and weight to each role. Report and product themes pair a legible title with a quiet body face and aligned figures. Story themes can use a serif for the title. Channel artwork and source language guide the final choice. [Motion design system](MOTION.md)

| Family | Role |
| --- | --- |
| Paperlogy | Report, product and learning titles |
| Black Han Sans | Short campaign headlines |
| Gowun Batang | Story titles |
| Jua and Dongle | Playful display text, with Jua preferred for longer phrases |
| Space Grotesk and Roboto Flex | Latin display and numeric roles |
| Pretendard | Body text and fallback for supported glyphs |

The [motion font resolver](../../skills/storyboard/references/motion-fonts.js) checks the actual text against bundled glyph coverage. It records a whole-text fallback and reports characters the fallback cannot draw. The renderer uses the loaded font's measured width for wrapping. Check the final title at phone size, including diacritics, punctuation and figures.

Keep the accompanying license with each font file. The [motion font directory](../../skills/storyboard/references/motion-fonts/) contains the distributable assets. The [review font manifest](../../skills/channel/references/review-assets/fonts/manifest.json) lists the separate fonts used in offline review pages.
