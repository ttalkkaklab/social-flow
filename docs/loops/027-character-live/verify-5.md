**92/100 · FAIL · P0 1건.** 모찌앤보 채널에서 YouTube가 방송 생성 요청에 `403 livePermissionBlocked`를 반환했습니다. 실제 방송 ID가 없어 시청자 채팅 수신, 같은 메시지에 대한 음성 답변, 방송 종료를 확인할 수 없습니다. [실제 API 응답](/Volumes/data/story/mochi_bo/logs/character-live-20261121/youtube-attempt.log) · [채널 영수증](/Volumes/data/story/mochi_bo/logs/character-live-20261121/youtube-before-activation/youtube.json)

| 항목 | 점수 | 확인 결과 |
|---|---:|---|
| 기능 | 32/40 | 캐릭터 음성·애니메이션 8, 질문에 맞는 답변 재생 8, YouTube 연동 구현 8, TikTok RTMPS·운영자 이벤트 8, 실제 YouTube 방송 0. 로컬 RTMPS 수신 영상은 720×1280 H.264/AAC이며 12.031초입니다. [검증 기록](/Volumes/data/story/mochi_bo/logs/character-live-20261121/verification.json) |
| 빌드·계약 | 25/25 | 전체 테스트 2,020개 통과, 건너뜀 0개. 34개 스킬에서 린트 규칙 17개 통과. [테스트](/Volumes/data/story/mochi_bo/logs/character-live-20261121/server-check-5.log) · [린트](/Volumes/data/story/mochi_bo/logs/character-live-20261121/skill-lint-5.log) |
| 회귀 검증 | 15/15 | 모의 YouTube 채팅 조회가 계속 실패하면 CLI 종료 코드 1, 정상 조회 5회에 메시지 0건이면 종료 코드 0을 기록했습니다. [조회 실패](/Volumes/data/story/mochi_bo/logs/character-live-20261121/review5-mock-unavailable/events.jsonl) · [빈 채팅](/Volumes/data/story/mochi_bo/logs/character-live-20261121/review5-mock-quiet/events.jsonl) |
| 운영 안전성 | 10/10 | 채널·공개 범위 확인, 키 보호, 입력 제한, 녹화·종료, 미시작 방송 복구를 확인했습니다. [전용 테스트](/Volumes/data/story/mochi_bo/logs/character-live-20261121/live-tests-5.log) |
| 변경 범위 | 10/10 | 플러그인이 기존 게이트웨이 채팅·음성 경로를 사용합니다. 게이트웨이 서버 수정 없이 로컬 음성 답변이 재생됐습니다. [실행 기록](/Volumes/data/story/mochi_bo/logs/character-live-20261121/review4-success/events.jsonl) |

권한 활성화 후 예약된 일부 공개 테스트에서 실제 방송 ID, 동일한 YouTube 메시지 ID의 `speech_end`, 최종 방송 상태 `complete`를 확인하면 남은 8점을 재평가할 수 있습니다. [예약 기록](/Volumes/data/story/mochi_bo/logs/character-live-20261121/scheduled-test.json)

ASTRA_LOOP_RESULT: score=92 verdict=FAIL p0=1 iter=5
