# Choosing the storyboard's visual style

A new episode asks for a visual style in HITL before the storyboard and its images are
written. Production mode (hybrid or full video) and style are separate choices; the two
questions may be shown together. The production-mode question carries production-mode.md's
first-pass cost, retry cost and budget cap. Do not say that the style alone changes the API
price; price follows model, length, resolution and retry count.

Every option carries a short plain-language description: what the picture looks like, in
terms the user already knows, then what kind of episode it suits (user directive, 2026-09-08).
With AskUserQuestion, the label is the preset name and the description field holds that
sentence. A familiar reference in the description is for the human reading the question only;
it never goes into a generation prompt.

> 어떤 화풍으로 만들까요?
> - 시네마틱 미니어처 디오라마 — 작은 모형 세트를 매크로 렌즈로 찍은 듯한 화면입니다. 건물·지형·장치를 잘라 보여 주는 설명, 공간이 중요한 이야기에 맞습니다.
> - 완전 실사풍 — 실제 배우와 장소를 카메라로 찍은 듯한 화면입니다. 사람의 표정과 분위기가 핵심인 이야기에 맞습니다.
> - 웹툰풍 — 네이버 웹툰처럼 또렷한 선과 셀 채색으로 그린 화면입니다. 캐릭터가 이끄는 이야기, 대사가 많은 편에 맞습니다.
> - 클레이 스톱모션 — 월레스와 그로밋 같은 찰흙 인형 애니메이션입니다. 지문 자국과 손맛이 있어 따뜻하고 귀여운 설명, 어린 시청자에게 맞습니다. 동작은 작고 느리게 갑니다.
> - 종이 컷아웃 디오라마 — 오려 낸 종이를 겹쳐 세운 그림자극 무대입니다. 지도·전투·역사 장면의 깊이감에 맞고 얼굴 표정은 약합니다.
> - 수묵화 — 화선지에 먹으로 그린 동양화입니다. 삼국지·조선사 같은 동양 역사물에 맞고 움직임은 안개·물·바람처럼 느린 것만 씁니다.
> - 3D 카툰 캐릭터 — 극장 애니메이션처럼 큰 눈과 둥근 비례의 3D 캐릭터입니다. 캐릭터가 직접 설명하는 채널, 표정이 잘 읽혀야 하는 편에 맞습니다.
> - 아케이드 게임 화면 — 90년대 오락실 액션 게임처럼 굵은 윤곽선과 진한 채색으로 그린 캐릭터가 겹겹이 세운 배경 앞에 서는 화면입니다. 신화·영웅담·대결 구도의 이야기, 인물이 크게 보여야 하는 편에 맞습니다. 상단 체력바 같은 게임 인터페이스는 안 그립니다.

When the user proposes another style, spell out its rendering rules and add a supported
preset before continuing. Without a choice, wait before authoring. Never record a
recommendation or silence as the choice. A style already chosen for this episode is not
asked again. Unattended runs need the style written in their standing plan; otherwise the
question stays pending.

## Recording the choice and writing images

Store these fields in `window.PRODUCTION.style`. `selection.reference` holds the actual answer
or the written plan that authorized the style; never copy the example as an approval record.

```js
style: {
  preset: 'webtoon', // cinematic-miniature | photoreal | webtoon | claymation | paper-cutout | ink-wash | toon-3d | arcade-2d
  selection: { kind: 'user', reference: 'ACTUAL_USER_CHOICE' },
  reference: 'Korean webtoon illustration',   // where the look comes from: a URL or one line
  world: 'A period office with a consistent desk and doorway.',
  materials: 'Drawn fabric and wood with clean cel shading.',
  palette: 'Muted ochre and blue.',
  lighting: 'Consistent illustrated window light.',
  camera: 'Readable medium shots and deliberate close-ups.'  // the episode camera language, in every motion prompt
}
```

- `cinematic-miniature`: `look` is miniature or architectural. Use the bundled
  `tactile-miniature-v1` pack and choose the `visual.styleRole` that matches the content.
- `photoreal`: `look` is realistic. Life-size human proportions, skin, cloth and lens
  rendering. Remove miniature reference images, `referencePack` and any earlier
  `visual.stylePack`.
- `webtoon`: `look` is webtoon. Keep line weight, facial proportions, cel shading and
  background rendering consistent. Remove miniature references, `referencePack` and any
  earlier `visual.stylePack`.
- `claymation`: `look` is clay. Every figure and prop is sculpted plasticine on a built set;
  keep thumbprint texture, chunky proportions and the same warm set light on every cut. Plan
  small, slow actions — a large fast gesture breaks the frame-by-frame feel in generated video.
- `paper-cutout`: `look` is papercut. Flat cut-paper shapes in separated layers with shadows
  between them; faces carry little expression, so introduce people with a still and a camera
  move and let the layers do the parallax. Keep the same paper palette and layer order per world.
- `ink-wash`: `look` is inkwash. Brushed ink on rice paper with empty space and one accent
  colour; the frame is one painting. Generated video holds only slow environment motion (mist,
  water, wind, a brush stroke appearing) — fast subject motion breaks the ink lines, so acted
  cuts stay stills with a camera move.
- `toon-3d`: `look` is toon3d. Rounded stylised 3D characters with large expressive eyes and
  clean shaders; keep each character's model, costume and colours identical across cuts by
  referencing the approved character image. Never name a studio or a living artist in a prompt;
  the image lane refuses those and the rendering rules above already carry the look.
- `arcade-2d`: `look` is arcade. A 1990s hand-painted arcade game frame: characters are large
  painted sprites with bold dark outlines and exaggerated heroic proportions, standing side-on in
  front of layered parallax backgrounds. Stage every cut like a game stage — the camera is static
  or pans sideways, never orbits, because a 2D sprite has no back side. Generated video holds a
  few strong poses per action, the way a sprite animates. The game HUD (health bars, portraits,
  player names) is never in the picture: the image lane garbles lettering, generated video warps
  a static overlay, and nothing is drawn over video. Named game companies and titles stay out of
  prompts like studios do.
- None of the five presets above attaches the miniature pack; each removes `referencePack`
  and any earlier `visual.stylePack` like photoreal and webtoon do.

Each cut first settles the narration's actor, action and recipient and its start and end
states; style does not stand in for content. Apply the chosen style to every new image,
including hybrid's still-camera cuts. HTML explanation cuts share the palette and object
treatment but keep text and figures readable. Actual archival photos and user recordings
keep their original appearance.

Both hybrid and full video can write image prompts with `spatial-prompts.js`. An image-only
cut still provides `shot.videoDesign`'s look, before, action, after and continuity, plus
`visual.camera.framing`; that metadata does not turn the cut into video. On a video shot with
`subject_action` motion the last beat is the final state and `after` may be left out. Use the returned
`sourcePrompt` for the actual image generation and link the result into the storyboard HTML.
For miniature, attach the pack's reference image with the returned `sourceImageArgs`.
Photoreal, webtoon and the five prompt-only presets make the first image from the preset
description and reference the approved character image in later cuts.

A cut that needs an end image edits the start image with `endFramePrompt`. Start and end keep
the same style, people, costume and space. Video uses `motionPrompt`, which the helper
assembles from the four `visual.camera` slots and checks against the Seedance prompt gate.
After generation, open the image and review content and style separately. A doll-like
surface in photoreal, photographic skin in webtoon, a smooth plastic figure in claymation, a
painted-looking photo in ink-wash or a soft airbrushed figure without outlines in arcade-2d is a
mismatch; remake it. A metadata
pass is not a visual review.

The storyboard page reads `PRODUCTION.style.preset` and draws the choice at the top: the preset's
sample picture from `style-samples.js` (one reading-at-a-window scene rendered in every preset,
so the reader sees the look rather than its name), the plain-language line above, the selection
record and a strip of the other presets in the same scene. Copy `style-samples.js` beside the
storyboard with `production-mode.js`; without it the page falls back to a pictogram.

Write the chosen style's name and rendering rules in the storyboard HTML's `SB_DOC`
description. When the style changes, review the affected images, start/end pairs and video
prompts again and refresh the quote. Do not present earlier output as the new style's output.
Get approval for the changed plan before paid generation.

Full-video character scenes use articulated action in every style. Preserve face, costume and
materials while changing pose and position as planned. A miniature style reference supplies
the look, not a frozen pose. Apply the subject-motion contract in
[full-video.md](../../produce/references/full-video.md) before generating either frame.
