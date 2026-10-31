# 검증 2회차 — 76/100, P0 0, FAIL

| 기준 | 점수 | 근거 |
|---|---|---|
| 1 템플릿↔도구 필드 계약 | 25/30 | `shot_icons`가 받는 `render.purpose`를 렌더 칩이 그리지 않는다. verify-1의 세 어긋남(얼굴 행, `techniques[].reason`, `frames.reason`)은 해소됐다. |
| 2 단계 도구 정확성 | 5/20 | (1) `frames.mode`를 바꾼 뒤 영상 프롬프트가 낡아도 표시가 없다. (2) 캐스트를 바꿔도 프롬프트 경고가 없다. (3) 시작 이미지를 다시 만들어 종료 이미지를 떼도 `frames.endProps`가 그대로 있고, 템플릿이 "End props none"을 그린다. verify-1의 D1–D6은 재현되지 않는다. |
| 3 스킬 문서↔도구 | 12/15 | `tools.ts` "A new route drops the old route's move"는 still_camera 경계에서만 맞다. |
| 4 객관 게이트 | 15/15 | `npm test` exit 0(2625), 재빌드 뒤 dist 93개 파일 해시 동일. |
| 5 바뀐 동작의 테스트 | 9/10 | 27개 중 25개. `story_sequence`의 `payoff`, MSR 칩 조건이 빠졌다. |
| 6 범위·D8 | 10/10 | 범위 안, D8 0건. |

## P1/P2
1. P1 프레임 계획 변경 뒤 낡은 영상 프롬프트(전체 자동 승인에서는 유료 생성까지 갈 수 있다).
2. P1 캐스트 변경 뒤 낡은 영상 프롬프트.
3. P1 시작 이미지 교체 뒤 `frames.endProps` 잔존.
4. P2 장면 `out`을 템플릿이 그리지 않는다.
5. P2 같은 인물을 다시 넣어도 `off_screen` 줄에 안내가 없다.
6. P2 이전 승인은 다음 `video_approve` 전까지 승인 대기로 보인다.
7. P2 모든 엔진에서 입력 바이트를 읽고, ffmpeg가 없을 때 전용 오류 코드가 없다.
8. P2 장면이 생기기 전의 `payoff`를 경고 없이 받는다.
9. P2 비-MSR 레인은 `use:"image"` 참조를 설계상 숨긴다(HEAD 이전부터).

## Fix Directives
1. 낡은 영상 프롬프트 표시: 캐스트·화면 속 대사·MSR 전환·first_last 종료·이동·초점이 바뀌면 경고. 공용 도우미 하나로.
2. 시작 이미지 교체 시 `frames.endProps`도 지우고, 종료 소품 줄은 종료 이미지가 있을 때만.
3. 렌더 칩 툴팁에 `render.purpose`.
4. `tools.ts` route 변경 서술을 still_camera 경계로 고친다.
5. `payoff` 테스트, MSR 칩 조건을 함수로 빼서 테스트.
6. (점수 밖) 장면 `out` 표시, ffmpeg 없음 전용 코드, 이전 승인 뷰 재생성 검토.

ASTRA_LOOP_RESULT: score=76 verdict=FAIL p0=0 iter=2
