# 015 — 소품 레퍼런스를 첫 장면 이미지에 제대로 싣기

- 날짜: 2026-11-02
- 분류: Preset A(기능 구현), 대상에 맞춰 조정
- 통과 기준: 총점 95 이상 AND P0 0개 AND `TEST_CMD` exit 0 (사용자 지정, 기본 90에서 상향)
- 최대 반복: 3
- TEST_CMD: `cd server && npm run check`

## 대상 (원문)

소품시트 개선: shot_image가 prop-continuity snapshot/prompt를 쓰도록(상태별 레퍼런스, 숨김 소품 제외, 설명 문장 포함, 이미지 없는 소품 경고), 미사용 소품 경고 추가. 목표 점수 95 이상.

## 고정 루브릭

| 항목 | 배점 | 채점 규칙 | 근거 | P0 |
|---|---|---|---|---|
| 기능 완성도: ① 상태별 레퍼런스(시작 이미지는 before 상태, 끝 이미지는 after 상태의 condition에 맞는 reference) ② 숨김 소품(propUsage.visible:false) 제외 ③ 소품 설명·상태 문장이 shot_image 프롬프트에 포함 ④ 이미지 없는 소품 경고 ⑤ 어느 샷에도 연결되지 않은 소품 경고 | 40 | 40 × (구현된 기능 수 / 5), 내림. 자리표시만 있는 기능은 0 | 기능별 file:line | 예 |
| 객관 게이트: `cd server && npm run check`(빌드 + 전체 테스트) | 25 | exit 0 → 25, 그 밖은 0 | 명령 + exit code | 예 |
| 기능별 테스트: 기존 모듈 테스트 파일에 기능당 1개 이상, 새 코드 경로를 실행 | 15 | 15 × (커버된 기능 / 5), 내림 | 테스트 file:line ↔ 기능 | 아니오 |
| 문서·dist 동기화: prop-continuity.md 등 문서가 실제 동작과 일치하고 server/dist가 재빌드되어 반영 | 10 | 둘 다 충족 → 10, 하나만 → 5, 없음 → 0 | 문서 file:line, dist grep | 아니오 |
| 범위 준수: 변경 파일이 대상 범위(storyboard.ts, prop-continuity.js, check 경로, 해당 테스트, 관련 문서, dist, 이 루프 폴더) 안 | 10 | 전부 범위 안 → 10, 하나라도 밖 → 0 | `git diff --name-only` | 아니오 |
TEST_CMD 실행 방식: cd server && npm run build && /tmp/claude-501/clean-test.sh server (셸의 공급자 키·URL과 ~/.config/social-flow를 떼어 낸 env -i 환경. 기준선 origin/dev 347adf09에서 2700/2700 통과)

## Result

달성. 1회차에서 100점, P0 0개, 객관 게이트 통과(2702/2702).

| 회차 | 점수 | P0 | 객관 게이트 | 판정 |
|---|---|---|---|---|
| 1 | 100 | 0 | exit 0 | PASS |
