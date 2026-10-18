# 조사 결과로 고친 것과 보류한 것 (0.118.0)

[README.md](README.md)의 조사 결과를 `origin/dev` 9e0f9ea와 대조해 0.118.0에 반영했다. 고친 곳은 호스트가 실제로 읽는 자리(서버 instructions, 툴 설명문, 오류 응답, 권한 규칙)와 지침끼리 어긋난 문서다. 소유자의 작업 방식을 바꾸거나 규모가 큰 항목은 이유를 붙여 보류했다.

## 고친 것

| 항목 | 근거 | 바뀐 곳 | 검증 |
|---|---|---|---|
| MCP 서버 instructions 추가 (1,949자) | 툴 검색이 켜진 Claude Code는 세션 시작 때 툴 이름과 서버 instructions만 읽고 4,096자에서 자른다 | `server/src/tools.ts` `SERVER_INSTRUCTIONS`, `server/src/index.ts` | 계약 테스트: 4,096자 이하, 백틱으로 적은 툴 이름이 모두 실제로 있음 |
| 같은 설명문을 쓰던 툴 3개 분리 | 모델은 설명문으로 툴을 고른다. `acting_review`·`tts_review_acting`·`tts_review_final`이 한 글자도 다르지 않은 설명을 썼다 | `server/src/tools.ts` | 계약 테스트: 설명문 중복 금지, 설명문 4,096자 이하 |
| SNS 오류 응답에 다음 행동과 길이 상한 | 원본 본문만 돌려주면 에이전트가 할 일을 모르고, Claude Code는 긴 오류의 앞뒤만 보여 준다. 5xx로 실패한 게시는 이미 올라갔을 수 있다 | `server/src/handlers.ts` `apiErrorText` | 계약 테스트 3개 (403 안내, 5xx 중복 게시 경고, 4,000자 상한) |
| `allowed-tools`에 플러그인 설치 이름 병기 | Claude Code 권한 규칙은 플러그인 서버를 `mcp__plugin_<plugin>_<server>__*` 형식으로만 매칭한다. 마켓플레이스 설치본에서는 `mcp__social-flow__*`만으로 사전 승인이 하나도 맞지 않았다 | SKILL.md 20개, `skill-lint.js` 6번 규칙(두 이름이 짝을 이루는지 검사), `README.md` 설치 주의, `AGENTS.md` 툴 레인 | skill-lint 위반 0건 |
| 스킬 수 21개로 정정 | `AGENTS.md`와 `README.md`가 18개라고 적었다 | `AGENTS.md:3`, `README.md` Codex 줄, skill-lint 17번 규칙 신설 | skill-lint 위반 0건 |
| 2026-10-16 음성 지침과 어긋난 문서 4곳 | "speech proof가 없으면 조립 차단", "`acting_review`는 Gemini에 올리는 유료 평가"라는 문장이 남아 있었다. MCP로 부르면 세 툴 모두 `host_review` 준비 단계로 동작한다 | `produce/references/pipeline.md`, `produce/references/tts-quality.md`, `produce/references/shot-speech.md`, `edit-speech/SKILL.md` | 문서 대조 |

`npm run check` 2,336개 테스트, CI의 `--selftest` 체커 17개, `skill-lint.js` 17개 규칙이 모두 통과했다. `produce/SKILL.md` 줄 수는 그대로 1,349줄이다(짝 이름은 같은 줄에 넣었다).

## 조사 보고서에서 바로잡은 점

- 보고서는 `fromApi` 한 함수만 고치면 오류 응답이 정리된다고 했다. 실제로 `HTTP ${status}` 문구는 14개 파일 55곳에 있고, 대부분은 이미 본문을 자르고 키를 가린다. 원본을 그대로 넘기던 곳은 SNS 계열이 지나는 `fromApi` 하나였다.
- `produce/SKILL.md`는 dev에서 1,349줄로 늘어 lint 상한 1,350줄까지 한 줄 남았다.
- 플러그인 툴 이름 형식은 [Claude Code 권한 문서](https://code.claude.com/docs/en/permissions)에 "`<server>` takes the plugin-scoped form"으로 적혀 있다. 이 세션은 MCP 서버 연결에 실패해서 실제 매칭은 확인하지 못했다. 마켓플레이스 설치본에서 `/mcp`로 이름을 보고, 기본 권한 모드로 `grow-threads` 한 틱을 돌려 프롬프트가 뜨지 않는지 보면 확인된다.

## 보류한 것

| 항목 | 보류 이유 | 다음 단계 |
|---|---|---|
| `publish`에 `disable-model-invocation: true` | 공식 권고가 부작용 있는 워크플로에 권하는 설정이다. 그런데 description에 "올려줘"·"게시해" 같은 자연어 트리거가 일부러 들어 있고 스킬 안에 필수 승인 단계도 있다. 걸면 자연어 호출이 막히므로 소유자가 정할 일이다 | 원하면 frontmatter 한 줄. `grow-*`에는 걸지 않는다(예약 작업과 `/loop` 실행도 막힌다) |
| `_meta["anthropic/requiresUserInteraction"]` | `bypassPermissions`에서도 매번 프롬프트를 띄우고 `dontAsk`·`-p`에서는 호출을 거부한다. 상시 승인으로 도는 성장 루프가 멈추고 "기존 승인은 유지한다"는 2026-10-16 지침과도 맞지 않는다 | 어느 스킬도 사전 승인하지 않는 `sns_comment_moderate`·`youtube_update`에 한해 소유자가 판단 |
| `produce/SKILL.md` 재구성 | 날짜 박힌 덧씌우기 지시(ISO 날짜 27개)를 현재 계약 한 벌로 접는 일이다. dev에서 이 파일이 계속 편집되고 있어 충돌 위험이 크고 작업량도 크다 | 별도 PR로 진행. 접은 뒤 `SKILL_MAX_LINES`를 내린다 |
| `storyboard_apply` 입력 스키마 (71,673자) | 툴 정의 전체 46만여 자 가운데 가장 큰 몫이지만 스키마를 나누면 스토리보드 계약 전체를 건드린다 | 상세 문법을 `storyboard_read`나 참조 문서로 옮기는 설계부터 |
| 공급자 직접 툴 정리 (`veo_*`·`seedance_*`·`astra_*`·`omni_*`·`mlx_video_generate`) | `video_catalog → video_plan → video_execute` 라우팅과 역할이 겹친다. 직접 호출하는 스킬 문서가 남아 있어 툴을 숨기면 흐름이 깨질 수 있다 | 스킬 문서의 직접 호출을 라우팅으로 옮긴 뒤 `disabled-tools` 기본값 검토 |
| `music_list_options`·`scenario_check` 정리 | 어느 스킬도 언급하지 않는다. 다만 사용자가 직접 부를 수 있어 퇴역은 소유자 판단이 필요하다 | 사용 기록 확인 후 결정 |
| `blender_*` 툴 7개 사전 승인 | `storyboard`가 Blender previz에 쓰지만 `allowed-tools`에 없다. 로컬 툴이라 비용은 없지만 사전 승인은 동작 변경이다 | 소유자 확인 후 `storyboard` frontmatter에 추가 |
| JSON Schema와 zod 스키마 대조 테스트 | `tools.ts`의 스키마와 핸들러의 zod 스키마를 툴별로 묶은 목록이 없어 테스트보다 레지스트리가 먼저다 | 핸들러가 zod 스키마를 툴 이름으로 내보내게 한 뒤 키 대조 |
| `claude plugin eval` 케이스 | 실행마다 사용자 계정으로 모델을 호출한다. 한 번도 돌리지 않은 케이스는 커밋하지 않았다 | `claude plugin eval init --bare <name>`으로 시작. 스킬별 should/should-not 프롬프트에 무료 grader `tool_used: Skill`, MCP는 `evals/mocks/social-flow/<tool>.md`로 모킹 |
| `grow-threads` description의 "zero P0" 문구 | 2026-10-16 지침은 리뷰 점수를 실행 게이트에서 뺐다. 성장 루프의 리뷰가 상시 승인 조건인지는 소유자가 정한다 | 결정에 맞춰 description과 본문을 함께 고친다 |
| description 문장 구성 (워크플로 요약이 약 60%) | 트리거율을 재는 eval 없이 바꾸면 좋아졌는지 알 수 없다 | eval을 만든 뒤 비교 |
