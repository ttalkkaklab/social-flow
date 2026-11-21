# 캐릭터 시트의 머리와 몸 비율

캐릭터 시트는 얼굴 클로즈업 한 장과 머리 없는 몸 두 장으로 되어 있다. 머리와 몸이 한 그림에 같이 나오는 패널이 없어서 샷 이미지를 합성할 때 머리를 몸에 얼마나 크게 얹을지 알려 주는 입력이 없었다. 시트의 `physical.proportions`(등신 · 비율)는 머리 없는 몸 패널 프롬프트에만 들어갔고 Qwen 경로의 `shot_image`는 시트 문장을 아예 빼고 보냈다.

2026-11-21에 웹 검색으로 자료를 찾아 원문을 연 것과 검색 요약만 본 것을 구분해 적는다. 우리 모델(Qwen-Image, LTX)로 잰 결과는 아직 없다.

## 원문을 읽은 자료

| 자료 | 무엇을 했나 | 한계 |
| --- | --- | --- |
| [CapCut, Grotesque Proportion Character](https://www.capcut.com/create/grotesque-proportion-character) | 같은 장면에서 비율 문장만 바꿔 여섯 번 생성했다. "exactly three heads tall"과 "exactly eight heads tall"을 포함한 여섯 문장이 4.3~5.0등신으로 나와 측정 오차(약 10%) 안이었다. 숫자를 빼고 "a big round ball, as wide as it is tall … no neck"처럼 모양을 쓰자 2.8등신이 나왔다. 글쓴이는 평범한 버전을 먼저 만들어 재 보라고 권한다 | 판매사 글이다. 캐릭터 하나, 화풍 하나, 열 번 실행이고 모델 이름이 없다 |
| [Google AI 개발자 포럼 스레드](https://discuss.ai.google.dev/t/reference-images-keep-faces-consistent-but-ignore-character-size-scale-any-way-to-control-relative-height/176840) | `gemini-3.1-flash-image`에 참조 이미지를 여럿 주면 얼굴은 유지되는데 두 인물의 키 비(1.4배)가 매번 1.1배로 나왔다. 문구 15가지와 비율을 맞춘 참조 그림도 통하지 않았다. 답글 하나가 "참조는 얼굴과 옷에만 쓰고 키와 비율에는 쓰지 말라"고 적고 숫자 대신 "머리가 상대 허리에 닿는다"처럼 몸의 기준점으로 쓰니 기대한 결과가 나왔다고 했다 | 답글 한 건의 자체 시험이다. 두 인물의 키 차이를 다뤘고 한 인물의 등신을 다루지는 않았다 |
| [Clip Studio, Model Sheets for Character Designers](https://www.clipstudio.net/how-to-draw/archives/164740) | 모델 시트의 구조도는 비율을 "머리 몇 개"로 적는다. 8¾등신에서 시작해 캐릭터를 6¾등신으로 줄이고 가슴·허리·무릎이 몇 번째 머리 칸에 오는지 선으로 표시한다. 정면·측면·후면에 같은 높이의 안내선을 긋는다 | 손으로 그리는 제작 관행이다. 생성 모델 시험이 아니다 |
| [Wikipedia, Model sheet](https://en.wikipedia.org/wiki/Model_sheet) | 모델 시트는 구조와 비율을 여러 각도에서 보여 주고 3D 모델링의 비율 기준으로도 쓴다 | 머리 수치는 없다 |
| [Wikipedia, Body proportions](https://en.wikipedia.org/wiki/Body_proportions) | 평균 성인은 7.5등신, 이상적 인물은 8등신, 영웅형은 8.5등신으로 그린다고 적는다(출처: Larsen, makingcomics.com) | 그림 관행이다. 어린이 나이별 수치는 본문에 없었다 |
| [invideo FAQ](https://invideo.io/faq/can-a-bad-character-sheet-cause-ai-character-drift-that/) | 한 장에 다 넣은 시트가 모델을 헷갈리게 했다며 얼굴 클로즈업 한 장과 몸 네 방향, 키·몸무게 숫자를 권한다 | 판매사 글이고 시험 방법을 밝히지 않았다. 머리 크기 이야기는 없다 |

## 검색 요약만 본 자료

원문을 열지 못했거나 본문이 잡히지 않았다. 근거로 쓰지 않고 방향만 참고했다.

- Toon Boom 캐릭터 비율 강의와 Tripo3D 글은 403으로 열리지 않았다. Higgsfield의 "One face per character sheet" 강의는 본문이 추출되지 않았다.
- 참조 이미지 한 장에 몸 비율과 얼굴 정체성을 같이 맡기지 말라는 글(HackerNoon), 치비는 2~3등신이라는 그림 강좌들, 머리를 줄이는 전용 보정 기능(WeShop), 이미지마다 역할을 나눠 적는 다중 참조 프롬프트(OpenAI 커뮤니티 글)가 검색 요약에 나왔다.

## 읽은 자료가 함께 가리키는 것

1. 시트에는 비율을 머리 개수로 적는다. 제작 현장의 구조도가 쓰는 단위다.
2. 머리 개수만 써서는 그림이 거의 달라지지 않았다. 모양을 말로 풀고 몸의 기준에 견줘 쓴 문장이 통했다.
3. 참조 이미지는 생김새를 옮기고 크기는 옮기지 못했다. 크기는 글로 따로 말해야 한다.
4. 프롬프트를 믿지 말고 나온 그림을 잰다.

## 플러그인에 반영한 것

- 등신은 새 필드를 만들지 않고 시트의 `physical.proportions`에서 읽는다. "7.5 heads tall", "about seven and a half heads tall", "two-head silhouette", "3등신"을 읽고 나이·종족·화풍에서 짐작하지 않는다. 어깨 너비처럼 키가 아닌 치수("2 heads wide")는 건너뛰고 범위("6-7 heads")나 서로 다른 값 두 개는 등신이 없는 것으로 본다(`skills/_shared/character-identity.js` `headsTall`).
- 2026-11-21에 `/Volumes/data/story` 아래 시트 49개에 읽기 전용으로 돌렸다. 19개에서 등신을 읽었고(2등신 8, 1.8등신 1, 7~8등신 10) 1개는 비율 문장에 숫자가 없었고 28개는 `proportions` 자체가 없었다. 1개는 예전 형식이라 읽지 못했다. 숫자를 글로 쓴 시트가 8개여서 영어 숫자 단어도 읽게 했다.
- `shot_image`는 몸이 보이는 샷마다 인물별 한 문장을 넣는다. 등신 숫자, 모양을 말하는 표현, 정수리에서 턱까지의 길이(cm)를 같이 쓰고 얼굴 패널은 확대한 그림이라 머리 크기의 기준이 아니라고 덧붙인다. Qwen 경로에도 들어간다. 클로즈업처럼 몸이 안 보이는 샷과 물건·디테일 샷에는 넣지 않는다.
- 세트 렌더를 Image 1로 쓰는 샷은 색 인형이 위치·방향·키만 알려 주고 머리 크기와 체형은 자리 표시라고 적는다. 인형 머리는 키의 0.18배(약 5.5등신)로 고정돼 있다.
- 등신이 없으면 `character_manage`(`missing.headCount`와 시트 경고), `character_panel`, `shot_image`가 `head_count_missing`으로 알린다. 거부하지 않는다.

## 등신별 모양 표현

처음에는 네 구간(3.5, 5.5, 7등신)에 표현 하나씩이었다. 같은 날 자료를 더 읽고 열두 줄로 늘렸다. 표현은 머리와 몸의 크기 관계를 먼저 말하고 자료가 그 등신에 묶어 말한 목·몸통·다리만 덧붙인다. 치비, 어린이, 영웅형 같은 나이·화풍 이름은 쓰지 않는다. 인물의 나이를 바꿔 보이게 하거나 화풍 프리셋과 부딪히기 때문이다.

| 등신 | 표현 | 근거 |
| --- | --- | --- |
| 1.75 미만 | 몸 전체보다 큰 머리, 목이 거의 없음, 통통하고 단순한 손발 | [Clip Studio 4868](https://tips.clip-studio.com/en-us/articles/4868): 1.5·2등신은 목을 안 그려도 되고 손은 통통하게, 발은 점처럼 줄인다 |
| 2.25 미만 | 몸 전체와 비슷한 키의 머리, 목이 거의 없음, 작고 둥근 몸통, 짧은 팔다리 | [Clip Studio 4863](https://tips.clip-studio.com/en-us/articles/4863): 머리가 키의 ½~⅓, 몸통은 콩·서양배 모양, 목은 자주 생략. [3448](https://tips.clip-studio.com/en-us/articles/3448)도 같은 몸통을 권한다 |
| 2.75 미만 | 아주 큰 머리, 아주 짧은 목, 작고 둥근 몸통 | 우리가 2등신과 3등신 사이를 메웠다 |
| 3.5 미만 | 키의 3분의 1쯤 되는 머리, 짧고 가는 목, 작은 몸통과 짧은 다리 | Clip Studio 4863(목이 있으면 짧고 가늘게), 4868(3등신은 목 없는 과장을 피하고 몸을 조금 길게) |
| 4.5 / 5.5 / 6.5 / 7.25 미만 | 큰 머리에서 조금 큰 머리로, 다리는 키의 절반보다 짧게 | 우리가 정했다. 읽은 자료는 이 구간을 어린이 나이로만 설명했고 서로 달랐다(다섯 살이 5등신인 글과 6등신인 글) |
| 7.75 미만 | 작은 머리, 다리가 키의 절반 | [makingcomics](https://makingcomics.com/2014/01/19/standard-proportions-human-body/): 평균 성인 7.5등신, 가랑이가 키의 절반 |
| 8.25 미만 | 작은 머리, 몸통 세 머리에 다리 네 머리 | [Wikipedia, Artistic canons of body proportions](https://en.wikipedia.org/wiki/Artistic_canons_of_body_proportions): 8등신은 몸통 3, 다리 4. [Proko](https://www.proko.com/course-lesson/human-proportions-idealistic-figures/notes)도 젖꼭지·배꼽·가랑이를 머리 하나 간격으로 둔다 |
| 8.75 미만 / 그 이상 | 작은 머리에 큰 몸, 다리가 키의 절반을 넘음 | 등신 값은 자료에 있다(Wikipedia Body proportions 8.5, makingcomics와 Wikipedia canons 9). 다리 표현은 7.5와 8의 차이가 다리 길이라는 문장에서 우리가 이어 붙였다 |

- 어깨 너비는 넣지 않았다. makingcomics는 "세 머리에 조금 못 미친다"고 하고 Proko는 2⅓이라고 해서 서로 맞지 않는다.
- AI 프롬프트 어휘를 다룬 글 셋([Neolemon](https://www.neolemon.com/guides/describing-body-types-for-ai-cartoon-characters), [OpenArt](https://openart.ai/blog/how-to-make-chibi-art-from-photo/), [AI Photo Generator](https://www.aiphotogenerator.net/blog/2026/05/make-chibi-characters-2))은 "oversized head, tiny body", "stubby limbs", "compact body"를 권한다. 시험 없이 쓴 판매사 조언이어서 방향만 참고했다.
- 실제 시트 19개에 붙여 읽어 봤다. 2등신 줄의 "몸통은 엉덩이가 가장 넓다"가 어깨가 각진 Bo와 맞지 않아 뺐고 7등신 줄의 "조금 큰 머리"는 사실적인 7등신 인물과 맞지 않아 "작은 머리"로 고쳤다.
- 같은 등신이라도 몸통이 길면 인형처럼, 다리가 길면 어른스럽게 보인다(Clip Studio 4863·3448). 표는 등신 하나에 표현 하나라 이 차이는 담지 못한다.

## 재지 않은 것

- 이 문장이 Qwen-Image나 다른 저장 모델에서 등신을 실제로 바꾸는지 재지 않았다. 모양 표현 표에서 2.5등신과 4~7등신 줄, 8.5등신 이상의 다리 표현은 우리가 정했다.
- 세트 인형의 머리를 시트 등신에 맞춰 그리면 구도 그림이 비율까지 전해 줄 수 있다. 세트 렌더와 그 해시가 달라지는 변경이라 이번에는 하지 않았다.
- 머리와 몸을 한 장에 그린 전신 패널은 비율을 그림으로 보여 주는 가장 직접적인 방법이다. 얼굴은 얼굴 패널 한 장에만 둔다는 시트 계약과 부딪혀 넣지 않았다.
- MSR 영상 프롬프트에는 넣지 않았다. 시작 이미지가 완성된 인물을 담고 있고 프롬프트가 이미 2,000자 한도에 닿는다.

확인 방법: 전신이 나온 샷에서 정수리~턱 길이와 정수리~발바닥 길이를 재서 나눈다. 손으로 잰 값은 10%쯤 흔들린다(CapCut 글의 추정). 그보다 크게 다르면 `shot_image`의 `editExisting`으로 머리 크기만 고친다.
