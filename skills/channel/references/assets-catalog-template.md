# assets catalog

두 편 이상에서 다시 쓰는 채널 공용물만 적는다.
한 편용 생성물(회차 BGM·씬 PNG·TTS)은 주제 디렉토리의 `.work/` 에 둔다.

produce·storyboard 는 `skills/channel/references/resolve-asset.py` 로
kind+id 를 경로로 바꾼다. path 는 `assets/` 기준 상대 경로다.

잘 알려진 파일은 아래 표에 행이 없어도 찾는다.

- logo / master → `branding/<slug>-logo-master-1024.png`
- intro / master·stinger·lockup·sonic → `intro/<slug>-intro-*.mp4` · `-lockup.png` · `-sonic-logo.wav`
- outro / default (또는 youtube·instagram) → `outro/default.mp4` · `outro/<플랫폼>.mp4`
- bgm / default → `audio/bgm/default.wav`
- sfx / `<id>` → `audio/sfx/<id>.wav`
- character / `<id>` → `characters/<id>/`
- still / `<id>` → `stills/<id>`

파일이 생긴 뒤에만 행을 올린다. `resolve-asset.py --ensure` 가 그 일을 한다.

| kind | id | path | note |
|---|---|---|---|
