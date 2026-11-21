# Look up the real thing before drawing a prop

User directive, 2026-11-21. Two episodes drew a document from imagination: a handwritten
Korean will went onto its sheet as "one off-white signed sheet, keep writing unreadable",
and an exam result as a generic certificate. The user asked for research prop by prop
("유언장도 조사해서 비슷하게", "합격증도 실제 이미지 조사해서 유사하게"). The will then gained its
date, address, name and seal, and the certificate turned out to be a posted notice with a
two-column letterhead. So the look-up comes first, for every prop, without being asked.
This is authoring guidance with reports; nothing refuses a write or an image.

## Contents

- [Which props](#1-which-props)
- [What to find](#2-what-to-find)
- [Record it on the sheet](#3-record-it-on-the-sheet)
- [Draw the prop from the real picture](#4-draw-the-prop-from-the-real-picture)
- [In the shots](#5-in-the-shots)
- [Reports](#6-reports)

## 1. Which props

Every prop gets a decision before its description and its picture: looked up, or nothing
to look up. Look up whatever a viewer knows from real life and would notice wrong:

- documents: a will, contract, notice, certificate, diploma, exam result, receipt, bank
  slip, prescription, ID card, passport, ticket, envelope and stamp;
- money, cards, badges, uniforms and their insignia, licence plates;
- packaged goods, named dishes, devices, tools, vehicles, medical and legal equipment;
- anything tied to a period, a country, a profession or an institution.

The story's country, year and institution decide which real thing applies. A Korean
handwritten will is not an American one; a Vietnamese civil-service result is not a framed
Korean certificate. A plain bowl, a bag or an invented gadget takes `research: "none"`.
A document or recognisable object the frame shows is a prop with a sheet entry, not a
phrase in a shot prompt, so that its research travels with it.

## 2. What to find

Search with the plugin's research tools and open what they return
([search connection and reading sources](story-material-research.md#2-verify-the-search-connection)):
a snippet or a thumbnail is a lead, not a look.

1. **What makes it the real thing.** The rule or the issuer's own form: a statute, the
   agency's template, the bank's or school's specimen. It says which parts must be there
   (who signs, what is dated, what is sealed) and which cannot be (a printed form where the
   law wants handwriting). `serp_web_search`, or `naver_search` for Korean material.
2. **What it looks like.** Pictures of actual examples: `serp_image_search`
   (`gl`/`hl` for the story's country) or `naver_search type:"image"`. The search returns
   addresses, not files: download the useful ones (the host's fetch, or `curl -L -o`) into
   `storyboard/images/research/<prop id>/` and open each saved file to view it. Read
   off the paper size, colour and orientation; where the title, body, date, signature and
   seal sit; handwriting or print; letterhead, numbering, stamps and their colour; how the
   thing is folded, bound, enveloped or worn with use. An official PDF form is a picture
   too: render its page to a PNG (`pdftoppm -png`, or a browser screenshot) and save that.
3. **Whether the story's version exists.** Research can show the assumed prop is not what
   people receive: the result is announced on a list, the will is a notarised deed, the
   notice comes by registered post. Change the prop, revise the shot stories and lines that
   named the old one with the story tools, and tell the user what changed; do not keep the
   imagined one.

When no search tool reaches the server, host WebSearch is the fallback, as in the linked
section. When nothing can be searched or opened, say so and record nothing as researched.

## 3. Record it on the sheet

`SB_DOC.props[].research` ([contract](prop-continuity.md#contract-version-1)). The values
below are the will case; yours come from the pages and pictures you opened. Write the entry
with `research` and `description` first and add `imageUrl` and `references` after §4; each
`propSheet` write sends the whole sheet with the current hash.

```json
{
  "id": "will-one",
  "research": {
    "sources": [
      { "url": "https://www.easylaw.go.kr/CSP/CnpClsMain.laf?ccfNo=2&cciNo=1&cnpClsNo=1&csmSeq=234",
        "title": "자필증서에 의한 유언 — 찾기 쉬운 생활법령정보",
        "image": "images/research/will-one/easylaw-example.png" }
    ],
    "observed": "Handwritten in full by the testator on plain unlined paper: the text, the date as year, month and day, the address, the name, and a red seal impression beside the name. No printed form, letterhead or witness lines."
  },
  "description": "One thin off-white A4 sheet in an old woman's dark handwriting. Centered title \"유언장\". Body \"국밥집 건물을 미란에게 물려준다.\" Below it the date \"2026년 11월 3일\", a one-line address and the name \"윤정순\" with a small round red seal impression to its right.",
  "imageUrl": "images/props/will-one.png"
}
```

- `sources`: each page actually opened, with `url` and `title`; `image` is the saved
  picture of the real thing that was viewed, relative to the storyboard folder. An `image`
  whose file is not there counts as no picture. A picture the user supplied is a source too
  (`url` may be its path).
- `observed`: in English, what the real thing shows that the picture has to keep.
- `research: "none"`: nothing real to look up.

Then write `description` from `observed`, in English, with the story's own names, amounts
and dates. Words the prop displays go inside quotation marks in the story's language:
`shot_image` leaves a description with another script outside quotes out of the prompt.
The words on a document agree with the lines spoken about it.

## 4. Draw the prop from the real picture

Make the prop's own picture before any shot shows it: one flat, square-on view, plus one
per condition the story reaches (intact, torn, folded) as `references`.

- Give the image model the saved real picture as a reference and ask for the same layout,
  proportions and materials with the description's content: `image_plan` with
  `operation:"edit"`, the prop's id as `assetId` and the saved file as the edit's source
  (`args.imagePath` on the ASTRA GenAI and MLX adapters, `args.sourceImagesBase64` on GPT
  Image), then `image_execute`, under the existing spending authorization. Without a usable
  picture, draw from `observed` with `operation:"text"`.
- The model is the saved image model, except that a prop showing readable words follows the
  [GPT Image 2 rule](../../_shared/image-routing.md#images-containing-text-gpt-image-2-required)
  (its override's `shotId` is the prop's id), or is typeset in code and saved as a picture.
- The real structure stays; the particulars are the story's. A real institution's logo and
  official seal, a real person's name, signature, face or numbers, and working account,
  serial or registration numbers give way to invented ones of the same kind, in the same
  place, size and colour, unless the user asks for that real one. A certificate without
  any crest or seal is as wrong as one with the real crest. For banknotes and IDs read the
  issuer's reproduction rules before a flat full view.
- A found picture is for looking and for conditioning the prop's own picture. It becomes
  `imageUrl` or a `references` entry, which ride into every shot, only when its terms allow
  reuse; record them in the source's `license`.

View the result beside the saved real picture and `observed`: every required part
present and in place, words spelled as written, nothing a real one never carries. Fix the
prop picture before the shots; a wrong sheet repeats in every frame.

## 5. In the shots

`shot_image` sends the prop's picture and description; look at each frame that shows the
prop against the same notes. A wide frame cannot hold a page of text: let the shot where
the viewer must read it be a close insert, and let the others show the same paper, seal
and fold without legible words.

## 6. Reports

- Every board write prints the props with no research decision, and those researched
  without a saved picture of the real thing on disk.
- `shot_image` warns when a prop in the frame has no decision.
- The review page shows each prop's observed facts and source links, or that it is undecided.

Each of these reports; none refuses. Existing prop pictures are not regenerated for this
alone. Places, wardrobe and uniforms deserve the same look-up; no tool reports on them yet.
