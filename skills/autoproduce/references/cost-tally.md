# 회차 비용 원장 — 스토리보드부터 영상까지 한 파일에 적는다

한 편에 든 돈은 영상 만들 때 다 나가지 않는다. **커버 배경 한 장이 이미
$0.22 다** — 그리고 그 장은 스토리보드 단계에서, 대개 영상 만들기 며칠 전에,
다른 세션에서 만들어진다. 이미지 재생성 루프가 두 번 돌면 그 편 지출의 절반이
영상 파일이 생기기도 전에 확정된다.

그래서 원장을 **주제 디렉토리에 두고 두 스킬이 이어 적는다.** storyboard 가 첫
줄을 쓰고 produce 가 뒤를 이어 쓰고, produce §10 이 그 파일 하나로 회차 전체를
집계한다.

```
data/<채널>/episodes/<주제>/.work/cost-tally.tsv     ← 원장 (storyboard·produce 공용)
data/<채널>/episodes/<주제>/output/video/cost-report.txt  ← 집계 결과 (produce §10 이 만든다)
```

`.work/` 는 gitignore 대상이지만 스킬 어디에도 그 디렉토리를 지우는 절차가 없다.
storyboard 는 `mkdir -p .work` 로 만들어 두고 첫 줄부터 적는다.

## 줄 형식

탭 구분 세 열이다. 주석(`#`)과 빈 줄은 계산기가 넘긴다.

```
key <TAB> 수량 <TAB> 메모
```

```tsv
image.gpt-image-2.high	1	storyboard: 커버 배경 scene-1
image.local	3	storyboard: points 배경 scene-2~4
image.gpt-image-2.high	1	storyboard: §5.5 재생성 scene-1 (2라운드)
veo.lite.1080p	8	produce: b-roll a1 — 8초 생성·4초 사용
tts.local	0.412	produce: 나레이션 412자
music.lyria-clip	1	produce: BGM 30초
```

- **key** 는 `prices.tsv` 의 첫 열 그대로다. 없는 키를 지어내면 리포트가 멈춘다.
- **메모 앞에 `storyboard:` / `produce:`** 를 붙인다. 열을 늘리지 않고도 리포트
  표에서 단계가 구분된다(열을 늘리면 autoproduce 가 쓰는 형식과 갈라진다).
- **버린 것도 적는다.** 수렴 루프에서 재생성한 장, 마음에 안 들어 다시 뽑은 클립,
  길이 검사에 걸려 다시 돌린 TTS — 결과물에 안 들어가도 청구는 된다.

## 수량 — 개수가 아니라 단위의 양이다

`prices.tsv` 의 `unit` 열이 정한다. 여기서 틀리면 합계가 조용히 어긋난다.

| 키 | 단위 | 어떻게 적나 |
|---|---|---|
| `image.*` | 장 | 만든 장수 |
| `veo.*` | 초 | **생성 길이**. 8초 만들어 4초만 써도 `8` (1080p 는 8초 전용) |
| `seedance.*` | 초 | 요청한 `durationSeconds` 그대로. 응답의 `completion_tokens` 는 메모에 적어 둔다 |
| `tts.*` | 1000자 | **자수 ÷ 1000**. 412자면 `0.412` |
| `music.lyria-clip` | 클립 | 클립 개수 |

TTS 를 `412` 로 적는 실수가 가장 잦다. 로컬 엔진은 단가가 0 이라 티가 안 나지만,
Gemini 채널에서 같은 실수를 하면 그 줄이 1000배가 된다.

Veo 는 반대 방향의 착각을 부른다 — 4초만 쓰니까 4초 값이라고 적으면 실제 청구의
절반이 사라진다. 8초 생성이 1080p 의 유일한 선택지다.

## 리포트

계산기는 `cost-report.sh` 하나다. 사전 견적과 사후 집계에 같은 것을 쓴다.

```bash
REF=${CLAUDE_PLUGIN_ROOT}/skills/autoproduce/references
$REF/cost-report.sh .work/cost-tally.tsv > output/video/cost-report.txt; echo "cost_exit=$?"
```

상한을 볼 때만 `--cap <USD>` 를 붙인다(무인 저작의 사전 판정 — autoproduce §5).

## exit 읽기 — 1을 통과로 읽지 않는다

| exit | 뜻 | 할 일 |
|---|---|---|
| 0 | 정상 | 합계가 그 회차 비용이다 |
| 1 | 판정 불가 | `!!` 줄을 보고에 그대로 옮긴다 (아래) |
| 2 | 상한 초과 | 승급 취소 후 경제 기본 (autoproduce 전용) |
| 3 | 입력 오류 | 경로·형식부터 고치고 다시 |

**exit 1 은 두 갈래이고 대응이 서로 다르다.**

- `!! 알 수 없는 key` — 우리 실수다. 키 이름을 `prices.tsv` 와 맞추고 다시 돌린다.
- `!! 단가 미확인` — 벤더가 값을 공개하지 않은 항목이다. 지금 여기 해당하는 것은
  **`music.lyria-realtime`(produce §3 의 BGM) 하나**다. 이 경우 합계 줄은 그대로
  나오되 그 항목만 빠진 값이므로, 보고에 **"합계 $X + 집계 제외 1건(BGM 90초)"**
  으로 적는다. 0 으로 바꿔 적거나 줄을 지우지 않는다.

**합계 $0 을 그대로 보고하지 않는다.** `storyboard/images/*.png` 가 있는데 원장이
비어 있으면 공짜로 만든 것이 아니라 적기를 빠뜨린 것이다. 그때는 파일을 세어
사후에 채우고, 채운 사실을 보고에 적는다.

## 함께 보는 문서

- `prices.tsv` — 단가 정본. 숫자는 여기에만 있다
- `cost-report.sh` — 계산기
- `cost-tiers.md` — 모델 사다리·승급 조건·편당 상한 (무인 저작)
