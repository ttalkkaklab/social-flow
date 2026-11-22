**4차 독립 평가 결과는 91/100점이며, P0 한 건이 남았습니다.** 모찌의 베트남어 음성과 입 움직임, 자유 질문에 대한 답변, TikTok용 RTMPS 송수신은 로컬 기록에서 확인했습니다. 실제 모찌앤보 채널에서는 YouTube가 방송 생성을 `403 livePermissionBlocked`로 거부해 방송 ID가 발급되지 않았습니다. [YouTube 응답](/Volumes/data/story/mochi_bo/logs/character-live-20261121/youtube-before-activation/terminal-rejection.txt:1) · [검증 기록](/Volumes/data/story/mochi_bo/logs/character-live-20261121/verification.json:4)

| 평가 항목 | 점수 | 확인 결과 |
|---|---:|---|
| 기능 | 31/40 | 캐릭터 음성·움직임 8, 질문에 맞는 음성 답변 8, YouTube 연동 구현 7, TikTok RTMPS·운영자 이벤트 8, 실제 YouTube 방송·응답·종료 0. [자유 질문 재생](/Volumes/data/story/mochi_bo/logs/character-live-20261121/preview-04/events.jsonl:7) · [RTMPS 수신본 해시](/Volumes/data/story/mochi_bo/logs/character-live-20261121/verification.json:73) |
| 빌드·계약 | 25/25 | 서버 검사 2,019건 통과. 스킬 34개가 린트 규칙 17개를 통과했습니다. [서버 검사](/Volumes/data/story/mochi_bo/logs/character-live-20261121/server-check-4.log) · [스킬 검사](/Volumes/data/story/mochi_bo/logs/character-live-20261121/skill-lint-4.log) |
| 회귀 검증 | 15/15 | 30초 음성과 한 샘플 초과, 재생 중 종료, 방송 바인딩 중단과 복구, 채팅 중복·페이지 처리를 검사합니다. [음성 길이](/Users/zeans/orca/workspaces/social-flow/hawkfish/server/test/live-character.test.mjs:28) · [재생 중단](/Users/zeans/orca/workspaces/social-flow/hawkfish/server/test/live-encoder.test.mjs:36) · [방송·채팅](/Users/zeans/orca/workspaces/social-flow/hawkfish/server/test/live-youtube.test.mjs:80) |
| 운영 | 10/10 | 채널·공개 범위·스트림 소유권 검사, 키 전달, 입력 상한, 녹화 종료와 복구 경로를 확인했습니다. 캐시 키에는 새 버전이 들어가며, 예약 실행용 번들의 SHA-256도 현재 배포본과 일치합니다. [소유권](/Users/zeans/orca/workspaces/social-flow/hawkfish/server/src/live-youtube.ts:120) · [키 전달](/Users/zeans/orca/workspaces/social-flow/hawkfish/server/src/live-encoder.ts:139) · [캐시](/Users/zeans/orca/workspaces/social-flow/hawkfish/server/src/live-character.ts:219) |
| 범위 | 10/10 | 변경은 라이브 실행기, 플러그인 측 게이트웨이 클라이언트, 관련 문서·테스트·배포물에 집중돼 있습니다. |

**P0.** YouTube 권한이 열린 뒤 같은 채널의 일부 공개 방송에서 `live`, 실제 채팅 메시지 ID에 대응하는 음성 재생 완료, `complete`를 확인해야 합니다. 예약 작업은 등록돼 있습니다. [권한 신청 기록](/Volumes/data/story/mochi_bo/logs/character-live-20261121/youtube-access.txt:2) · [예약 기록](/Volumes/data/story/mochi_bo/logs/character-live-20261121/verification.json:51)

**P1.** 일반 `--youtube` 실행에서 모든 채팅 조회가 실패해도 오류는 로그에만 남습니다. `--youtube-probe`를 생략하면 방송 시작과 종료만으로 `session_complete`에 도달합니다. 채팅 조회에 한 번이라도 성공했는지 기록하면, 시청자가 조용했던 방송과 채팅을 전혀 읽지 못한 방송을 구분할 수 있습니다. [조회 오류 처리](/Users/zeans/orca/workspaces/social-flow/hawkfish/server/src/live-run.ts:255) · [완료 판정](/Users/zeans/orca/workspaces/social-flow/hawkfish/server/src/live-run.ts:303)

ASTRA_LOOP_RESULT: score=91 verdict=FAIL p0=1 iter=4
