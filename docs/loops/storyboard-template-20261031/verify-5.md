# 검증 5회차 — 99/100, P0 0, PASS

범위: `git diff origin/dev...HEAD`(origin/dev 7965527d를 합친 뒤의 이 루프 변경). #535·#536 자체는 범위 밖이고, 둘이 만나는 템플릿 장면 띠(`musicLane` + `sceneOutHtml`)는 범위 안이다.

| 기준 | 점수 | 근거 |
|---|---|---|
| 1 템플릿↔도구 필드 계약 | 30/30 | 병합 지점을 headless Chrome으로 렌더했다. 음악 큐와 장면 마지막 말이 같은 장면 띠에 함께 그려지고 JS 예외가 없다. 시퀀스 질문·답 장면, 칩 툴팁, 프레임 계획 줄, 끝 상태, 장소·소품·종료 소품, 시작/종료 이미지 프롬프트, 승인 배지(승인됨·승인 뒤 바뀜·대기), 프롬프트 낡음 표시를 확인했다. |
| 2 단계 도구 정확성 | 20/20 | 4회차 P0(손으로 쓴 카메라의 speed·target)와 P1(시작 이미지 낡음 경고)이 고쳐졌다. `shot_icons`·`shot_characters`·`shot_image`·`shot_prompt` 무작위 400회에서 불변식 위반 0건. |
| 3 스킬 문서↔도구 | 15/15 | 문서 4개와 도구 설명이 코드와 맞는다. |
| 4 객관 게이트 | 15/15 | `npm run check:dist` exit 0, `npm test` 2627개 통과. |
| 5 바뀐 동작의 테스트 | 9/10 | 44개 중 43개. 캐스트 순서만 바꿀 때 경고가 없다는 동작에 단언이 없다. |
| 6 범위·D8 | 10/10 | 범위 안, D8 0건(루프 문서 포함). |

## P2(감점 없음)
1. 스틸 컷에 `shot_icons focus`를 직접 주면 rack-focus 기법이 스틸 효과와 함께 들어간다(origin/dev와 같은 줄).
2. `payoff`는 `question`이 있을 때만 그려진다.
3. 템플릿이 시퀀스를 제목으로 찾는다.
4. 이 빌드 전 승인은 다음 `video_approve`까지 대기로 보인다.
5. 계획 revision에 프롬프트·대사를 넣어 이전 계획은 한 번 낡은 것으로 읽힌다.
6. 그림 route가 아닌 경로로 바꿔도 시작 이미지·참조를 그대로 둔다.
7. 손으로 쓴 `dolly in past foreground`는 `camera.dolly-in` 호출 뒤에도 그대로다(기법 접두 규칙과 일치).
8. `story_scene`로 장면 배치를 바꾸면 `payoff`를 다시 검사하지 않는다.
9. reference 모드를 떠날 때 `use:"image"`로 되돌리는 방향에 단언이 없다.
10. 새 테스트가 finding 문구를 정규식으로 맞춘다(finding에 코드 필드가 없다).

ASTRA_LOOP_RESULT: score=99 verdict=PASS p0=0 iter=5
