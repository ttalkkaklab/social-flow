# Choosing the storyboard's visual style

A new episode asks for a visual style in HITL before the storyboard and its images are
written. Production mode (hybrid or full video) and style are separate choices; the two
questions may be shown together. The production-mode question carries production-mode.md's
first-pass cost, retry cost and budget cap. Do not say that the style alone changes the API
price; price follows model, length, resolution and retry count.

> 어떤 화풍으로 만들까요?
> - 시네마틱 미니어처 디오라마: 작은 모형과 인형의 질감, 영화 같은 조명으로 만듭니다.
> - 완전 실사풍: 실제 배우와 장소를 카메라로 촬영한 듯한 이미지와 영상으로 만듭니다.
> - 웹툰풍: 또렷한 선과 셀 채색으로 인물과 배경을 그립니다.
> - 클레이 스톱모션: 지문이 보이는 찰흙 인형과 세트를 한 프레임씩 찍은 듯 만듭니다.
> - 종이 컷아웃 디오라마: 오려 낸 종이를 겹쳐 세운 무대처럼 깊이와 그림자를 만듭니다.
> - 수묵화: 화선지 위 먹선과 번짐, 여백으로 인물과 장소를 그립니다.
> - 3D 카툰 캐릭터: 큰 눈과 둥근 비례의 3D 캐릭터를 극장 애니메이션처럼 렌더링합니다.

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
  preset: 'webtoon', // cinematic-miniature | photoreal | webtoon | claymation | paper-cutout | ink-wash | toon-3d
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
- None of the four presets above attaches the miniature pack; each removes `referencePack`
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
Photoreal, webtoon and the four prompt-only presets make the first image from the preset
description and reference the approved character image in later cuts.

A cut that needs an end image edits the start image with `endFramePrompt`. Start and end keep
the same style, people, costume and space. Video uses `motionPrompt`, which the helper
assembles from the four `visual.camera` slots and checks against the Seedance prompt gate.
After generation, open the image and review content and style separately. A doll-like
surface in photoreal, photographic skin in webtoon, a smooth plastic figure in claymation or a
painted-looking photo in ink-wash is a mismatch; remake it. A metadata
pass is not a visual review.

Write the chosen style's name and rendering rules in the storyboard HTML's `SB_DOC`
description. When the style changes, review the affected images, start/end pairs and video
prompts again and refresh the quote. Do not present earlier output as the new style's output.
Get approval for the changed plan before paid generation.

Full-video character scenes use articulated action in every style. Preserve face, costume and
materials while changing pose and position as planned. A miniature style reference supplies
the look, not a frozen pose. Apply the subject-motion contract in
[full-video.md](../../produce/references/full-video.md) before generating either frame.
