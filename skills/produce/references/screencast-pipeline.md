# 촬영(스크린캐스트) 편집 파이프라인 — 계약·게이트·함정

**스토리보드 선행 촬영 흐름**의 제작 절반. 사용자가 `storyboard/script.md`(촬영
대본)대로 화면을 녹화하면, ingest 가 전사·정합(`recording/alignment.json`)을
만들고, produce 가 이 문서의 절차로 **녹화 원본을 잘라 9:16 쇼트폼으로 편집**한다.
TTS·생성 배경 파이프라인(pipeline.md)과 달리 **음성은 사용자 육성, 화면은 실제
녹화**다 — scenes.js 는 타이틀 오버레이·플랫폼 텍스트의 원천으로만 쓰인다.

```
storyboard(대본) → 사용자 촬영(ingest record) → 전사·정합(ingest) → 편집(이 문서)
```

## 합성 지오메트리 (1080×1920)

```
y 190~460    타이틀 블록 — screencast-overlay.html 캡처 (kicker+title, 커버는 +스탯)
y ≥460       녹화 밴드 — 폭 1080 fit, 높이 상한 BAND_MAX_H(900), 중심 BAND_CY(880)
y 1380~1560  번인 자막 밴드 — build-reel.sh 와 동일 스타일 (대칭 마진 250)
```

오버레이의 y=460 하한과 빌더의 `BAND_MIN_Y=460` 은 **짝 계약**이다 — 한쪽만
바꾸면 타이틀이 녹화 밴드에 깔린다.

## edit.json 계약 (build-screencast.sh 입력)

`recording/alignment.json`(ingest 정합 산출)과 같은 구조에 `overlay` 필드만
더한 것이다 — produce 가 오버레이를 캡처한 뒤 경로를 채워 `.work/edit.json` 으로
저장한다.

```json
{
  "source": "/abs/녹화.mov",           // 원본 절대경로 (alignment.json 그대로)
  "scenes": [
    {
      "idx": 1,                        // 스토리보드 씬 번호 (1부터 — scenes.js 배열 인덱스+1)
      "start": 3.2, "end": 21.8,       // 원본 시계 컷 구간 (초) — 무음 경계에 맞춰 타이트하게
      "crop": [400, 200, 1600, 1200],  // (선택) 원본 픽셀 [x,y,w,h] — 시연 초점 영역 확대
      "overlay": "cards/t1.png",       // (선택) 타이틀 알파 PNG — produce 가 채움
      "subs": [                        // (선택) 자막 — 원본 시계, 재배치는 빌더가 한다
        { "start": 3.4, "end": 6.1, "text": "교정 표기 문장" }
      ]
    }
  ]
}
```

- **모든 시각은 원본 녹화 시계** — timeline.json 문장 타임스탬프를 그대로 옮긴다.
  최종 타임라인 재배치(씬 오프셋 가산·경계 클램프)는 빌더의 파이썬 전개가 한다.
- `subs.text` 는 **timeline.md 의 교정 표기(sub 원칙: 숫자·고유명사 원표기)** 를
  쓴다 — raw whisper 원문이 아니라 §4 교정을 거친 문장. `{}`·`\`·탭은 빌더가
  제거하므로 이스케이프 걱정은 없다.
- `crop` 홀수 좌표는 빌더가 짝수로 스냅한다(yuv420p 크로마 정렬).
- 씬 사이 전환은 **하드 컷** — 사용자가 씬 경계에서 말을 멈추고 화면을 전환했으므로
  컷이 자연스럽다. 컷 지점은 무음 안에서 잡는다(발화 중간 컷 금지).

## 편집 절차 (produce 스킬이 수행)

```bash
REF=${CLAUDE_PLUGIN_ROOT}/skills/produce/references
# ① 오버레이 렌더 준비 — video-template 과 동일한 sed 주입 (리터럴 함정도 동일)
sed 's|</body>|<script src="./scenes.js"></script>\n</body>|' \
  $REF/screencast-overlay.html > .work/overlay.html
cp storyboard/scenes.js .work/
# ② 씬별 타이틀 캡처 — ?i 는 0부터 (edit.json idx-1), 파일명은 t<idx>.png
$REF/capture-frames.sh "file://$PWD/.work/overlay.html?i=0&alpha=1" .work/cards/t1.png 1
# ③ alignment.json + overlay 경로 → .work/edit.json 작성, BGM 준비(.work/bgm.wav)
# ④ 빌드 — BG 는 THEME.ink 를 넘긴다
BG="#0b1020" $REF/build-screencast.sh .work   # → reel.mp4 · cover.jpg · build-report.txt
```

- 오버레이 캡처 후 `evaluate_script` 또는 육안으로 `window.__overflow === 0` 확인
  (긴 타이틀은 tight1~3 자동 축소 후 잔여 노출).
- BGM 은 pipeline.md 와 동일하게 `music_generate` 인스트루멘털 — 단 육성 위이므로
  빌더 기본 볼륨이 낮다(BGM_VOL 0.22).
- 아웃트로는 TTS 파이프라인과 **같은 공용 자산**(`data/<채널>/assets/outro.mp4`)
  을 `.work/outro.mp4` 로 복사한다.
- 이후 폰 모드 검수·플랫폼 텍스트·품질 게이트는 produce SKILL.md §8~10 그대로.

## 빌드 리포트 게이트 (build-report.txt)

| 리포트 항목 | 판정 |
|---|---|
| `drift` ≠ 0.0000s | **진행 금지** — 파이프라인 버그 |
| `✗ 원본에 오디오 스트림 없음` | 녹화가 -g(마이크) 없이 됐다 — 재촬영 |
| `⚠ 화면 축소 N배 (>3.0)` | 글씨 가독 확인 — crop 을 좁히거나(초점 확대) 시연 앱 폰트를 키워 재촬영 |
| `⚠ scene N 길이 > 20s` | 씬 분할(alignment 에서 두 컷으로) 또는 발화 압축 재촬영 |
| `⚠ 오버레이 파일 없음` | 캡처 누락 — ②를 다시 |
| `⚠ 본편 > 90s` | 컷을 조이거나 씬 축소 |
| 총길이 | 60~75초 권장, 90초 상한 (본편+아웃트로−0.6초) |

## 함정

- **컷 경계는 무음에서** — alignment 의 start/end 를 발화 중간에 걸치면 단어가
  잘린다. timeline.json 의 문장 타임스탬프 사이 간극(무음)에 컷을 놓는다.
  씬 시작은 첫 문장 0.2~0.4s 앞, 끝은 마지막 문장 0.3~0.6s 뒤가 자연스럽다.
- **재촬영 테이크는 뒤 테이크 채택** — 사용자가 같은 씬을 다시 말했으면 alignment
  가 마지막 테이크 구간만 컷하고 앞 테이크는 버린다 (대본의 재촬영 수칙과 짝).
- **5K 전체 화면을 그대로 밴드에 넣으면 글씨가 안 보인다** — 1080 폭으로 4.7배
  축소된다. 시연 초점이 화면 일부면 반드시 crop 을 잡아라. 빌더가 3배 초과 축소를
  경고한다.
- **crop 은 씬당 하나** — 씬 안에서 초점이 크게 이동하면 씬을 나눠 각각 crop 하는
  것이 옳다 (팬/줌 애니메이션은 v1 미지원).
- **자막은 교정 표기** — raw/transcript.json 원문을 그대로 넣으면 오인식이 화면에
  박제된다. timeline.md 교정본에서 옮긴다.
- **BGM 인스트루멘털 필수** — 보컬은 육성과 마스킹 충돌 (pipeline.md 와 동일).
- **-shortest 봉합 금지** — 빌더 밖에서 오디오·비디오를 다시 먹싱하지 않는다.
- **오버레이 html 에 body 닫는 태그 리터럴 추가 금지** — sed 주입이 그 지점을
  치환한다 (video-template 실측 사고와 동일 계약).
