# assets catalog

Only channel-shared assets reused in two or more episodes go in here.
Single-episode artifacts (an episode's BGM, scene PNGs, TTS) go in the topic
directory's `.work/`.

produce and storyboard turn kind+id into a path with
`skills/channel/references/resolve-asset.py`. path is relative to `assets/`.

Well-known files are found even without a row in the table below.

- logo / master → `branding/<slug>-logo-master-1024.png`
- intro / master·stinger·lockup·sonic → `intro/<slug>-intro-*.mp4` · `-lockup.png` · `-sonic-logo.wav`
- outro / default (or youtube·instagram) → `outro/default.mp4` · `outro/<platform>.mp4`
- bgm / default → `audio/bgm/default.wav`
- sfx / `<id>` → `audio/sfx/<id>.wav`
- character / `<id>` → `characters/<id>/`
  — inside it: `identity.md` (the canonical description), `face.png` (face close-up),
  `body.png` (full body, front, no head), `back.png` (full body, back — optional),
  `front.png` (legacy full body with the head). The reference set handed to generation is
  face → body; never paste the panels into one sheet (`video-model-selection.md` §6)
- still / `<id>` → `stills/<id>`

A row goes up only after the file exists. `resolve-asset.py --ensure` does that job.

| kind | id | path | note |
|---|---|---|---|
