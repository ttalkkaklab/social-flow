## 독립 검증 2차 — 90/100, FAIL

| 평가 항목 | 점수 | 확인한 근거 |
|---|---:|---|
| 기능 | 32/40 | 모찌의 캐릭터 음성, 질문에 맞는 베트남어 답변, YouTube 어댑터, TikTok 입력과 RTMPS 수신을 확인했다. 자유 질문은 33초 뒤 재생됐고 마지막 음성 프레임까지 기록됐다. `preview-04/events.jsonl:7–10`, `verification.json:66–81`, `live-youtube.ts:64–113,152–178` |
| 빌드·계약 | 25/25 | 전달받은 두 명령의 종료 코드는 0이다. 결과 파일에 2,017건 통과, 실패 0건과 스킬 규칙 17개 통과가 기록됐다. `server-check.log:2792–2795`, `skill-lint.log:1` |
| 회귀 테스트 | 15/15 | 미디어 타이밍과 실제 인코딩, 방송 수명 주기, 채팅 중복과 페이지 처리를 검사한다. `live-encoder.test.mjs:17–46`, `live-youtube.test.mjs:18–93`, `live-character.test.mjs:5–17` |
| 운영 안전성 | 8/10 | 채널·공개 범위, 키 비노출, 입력 상한, 녹화 종료는 확인했다. 방송과 스트림 연결이 실패한 뒤의 복구는 재현에 실패했다. `live-youtube.ts:100–124`, `live-encoder.ts:139–169,209–225`, `live-character.ts:247–265` |
| 변경 범위 | 10/10 | `git status --short`에서 구현, 배포 번들, 테스트, 스킬과 검토 문서를 확인했다. |

**P0 — 실제 모찌앤보 YouTube 방송이 아직 없다.** 채널이 방송 생성을 `403 livePermissionBlocked`로 거절했고 방송 ID가 없다. 11월 22일 16:34 KST 후속 작업은 예약됐다. 활성화 후 해당 채널에서 일부 공개 방송 ID, 실제 채팅 메시지와 음성 종료, YouTube `complete`를 확인해야 남은 8점을 얻는다. `youtube-attempt.log:1`, `verification.json:2–5`, `scheduled-test.json:4–8`

**수정할 결함 두 건**

1. `streamId`를 저장한 직후 연결이 실패하면 `status`와 `end`가 소유한 방송까지 조회 거부한다. 로컬 모의 API로 동일한 오류를 재현했다. 생성 단계와 연결 확인 단계를 영수증에 나눠 기록하고, 복구할 때는 다른 스트림에 연결된 경우와 아직 연결되지 않은 경우를 구분해야 한다. `created`·`ready` 상태에서 `end`가 종료 코드 0으로 돌아가는 경우도 테스트에 추가해야 한다. `server/src/live-youtube.ts:100–108,115–144`, `server/src/live-run.ts:55–63,254–269`
2. 일반 채팅에 대한 음성을 준비했거나 재생 중일 때 세션 시간이 끝나면, 음성이 끝나지 않았어도 `session_complete`를 기록할 수 있다. 대기·재생 중 잘린 답변의 ID와 상태를 기록하고, 응답을 확인하는 테스트에서는 끝까지 재생된 경우만 성공으로 집계해야 한다. `server/src/live-encoder.ts:188–208`, `server/src/live-run.ts:276–285`

ASTRA_LOOP_RESULT: score=90 verdict=FAIL p0=1 iter=2
