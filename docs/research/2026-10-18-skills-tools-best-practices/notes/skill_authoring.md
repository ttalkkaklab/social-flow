# Agent Skills(SKILL.md) 작성 베스트 프랙티스 — Claude Code·Claude 플러그인 기준

> 조사일 2026-10-18. 공식 문서는 원문 마크다운(`.md` 엔드포인트)을 직접 내려받아 읽었다. 인용 문구·필드명·숫자는 원문 그대로 둔다.
> 로컬 가이드(skill-creator, superpowers writing-skills, plugin-dev skill-development, ASTRA skill-author/skill-lint)도 1차 자료로 읽었고, 공식 문서와 다른 지점은 각 질문의 Cited Findings에 `— contradicted by` 형식으로 표시했다.
> 로컬 사본 상태: 동기화된 skill-creator는 upstream `anthropics/skills`와 패키징 절(408–416행)만 다르다. superpowers에 번들된 `anthropic-best-practices.md`는 공식 문서의 예전 스냅숏이다(로컬 "Solve, don't punt" ↔ 현행 "Solve, don't defer").

---

## 1. 공식 SKILL.md 구조: 필수·선택 frontmatter 필드, 글자수 제한, 이름 규칙

### Takeaway
오픈 표준(agentskills.io)은 `name`·`description` 두 필드만 필수로 두고 `license`·`compatibility`·`metadata`·`allowed-tools`를 선택 필드로 정의한다(`name` ≤64자, `description` ≤1,024자, `compatibility` ≤500자). Claude Code는 이 여섯 개에 `when_to_use`·`disable-model-invocation`·`user-invocable`·`context`·`hooks`·`paths` 같은 확장 필드를 더 받는데, 모르는 필드는 오류 없이 무시한다. 반대로 claude.ai 업로드·Skills API·`package_skill.py`는 표준 여섯 필드 외의 키를 하드 에러로 거부한다.

### Cited Findings
**표준(agentskills.io spec) 필드 표**
- `name` 필수: "Max 64 characters. Lowercase letters, numbers, and hyphens only. Must not start or end with a hyphen." 추가 규칙: "Must not contain consecutive hyphens (`--`)", "Must match the parent directory name" — [Agent Skills Specification](https://agentskills.io/specification)
- `description` 필수: "Max 1024 characters. Non-empty. Describes what the skill does and when to use it." 좋은 예 "Extracts text and tables from PDF files, fills PDF forms, and merges multiple PDFs. Use when working with PDF documents or when the user mentions PDFs, forms, or document extraction.", 나쁜 예 "Helps with PDFs." — [Spec](https://agentskills.io/specification)
- `license`(선택), `compatibility`(선택, "Must be 1-500 characters if provided", "Most skills do not need the `compatibility` field"), `metadata`(선택, "A map from string keys to string values"), `allowed-tools`(선택, "A space-separated string of tools that are pre-approved to run. Experimental. Support for this field may vary between agent implementations", 예 `allowed-tools: Bash(git:*) Bash(jq:*) Read`) — [Spec](https://agentskills.io/specification)
- 본문: "There are no format restrictions." 권장 섹션은 "Step-by-step instructions / Examples of inputs and outputs / Common edge cases" — [Spec](https://agentskills.io/specification)

**Anthropic 플랫폼 문서의 추가 제약**
- `name`: "Maximum 64 characters / Must contain only lowercase letters, numbers, and hyphens / Cannot contain XML tags / Cannot contain reserved words: "anthropic", "claude"". `description`: "Must be non-empty / Maximum 1,024 characters / Cannot contain XML tags" — [Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- 이름 형식 권장: "Consider using **gerund form** (verb + -ing)" 예 `processing-pdfs`; 허용 대안은 명사구 `pdf-processing`, 행동형 `process-pdfs`; 회피 대상은 `helper`, `utils`, `tools`, `documents`, `data`, `files`, `anthropic-helper`, `claude-tools` — [Platform BP](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- skill-creator의 `quick_validate.py`는 `ALLOWED_PROPERTIES = {'name', 'description', 'license', 'allowed-tools', 'metadata', 'compatibility'}`(84행), kebab-case, name >64자 거부, description의 `<`·`>` 거부, description >1024자 거부, compatibility >500자 거부를 코드로 검사한다 — [로컬 skill-creator/scripts/quick_validate.py](/Users/zeans/.claude/skills/synced/3ea6c425-1fea-414c-a306-24c44ce542dd_eecf7410-7280-4631-814c-696a1f9e6cd7/skill-creator/scripts/quick_validate.py)

**Claude Code frontmatter 레퍼런스 (전 필드)**
- "All fields are optional. Only `description` is recommended so Claude knows when to use the skill. A field name must match the table exactly, hyphens included: Claude Code ignores a field it doesn't recognize without reporting an error." — [Claude Code: Extend Claude with skills](https://code.claude.com/docs/en/skills)
- "Claude Code reads the frontmatter only when the opening `---` is the file's first line." YAML 파싱 실패 시 "the skill still loads with no fields set" — [CC Skills](https://code.claude.com/docs/en/skills)
- 불리언은 v2.1.218부터 `yes`/`no`/`on`/`off`/`1`/`0`도 받는다 — [CC Skills](https://code.claude.com/docs/en/skills)
- 필드별 정의(원문 요약):
  - `name`: "Command name shown in the `/` menu. Defaults to the directory name."
  - `description`: "If omitted, uses the first non-empty line of the markdown content. Put the key use case first: the combined `description` and `when_to_use` text is truncated at 1,536 characters in the skill listing"
  - `when_to_use`: 트리거 문구·예시 요청. "Appended to `description` in the skill listing and counts toward the 1,536-character cap."
  - `argument-hint`(예 `[issue-number]`), `arguments`(이름 있는 위치 인자, `$name` 치환)
  - `disable-model-invocation`: "Set to `true` to prevent Claude from automatically loading this skill." 서브에이전트 preload와 scheduled task 실행도 막는다. 기본 `false`
  - `user-invocable`: "Set to `false` when only Claude should invoke the skill" — `/` 메뉴에서 숨김. 기본 `true`
  - `allowed-tools`: "Tools Claude can use without asking permission during the turn that invokes this skill. The grant clears when you send your next message." 공백·쉼표 구분 문자열 또는 YAML 리스트
  - `disallowed-tools`: "Tools removed from Claude's available pool while this skill is active"
  - `model`: 이번 턴 동안만 적용, `inherit` 가능. `effort`: `low`/`medium`/`high`/`xhigh`/`max`
  - `context`: `fork`면 포크된 서브에이전트에서 실행. `agent`: 포크 시 서브에이전트 타입. `background`: 포크 전용, 기본 `true`(v2.1.218+)
  - `hooks`: "Hooks that Claude Code registers when the skill is invoked and keeps running for the rest of the session"
  - `paths`: "Glob patterns that limit when this skill is activated"
  - `shell`: `bash`(기본) 또는 `powershell`
  - `metadata`, `license`, `compatibility`(최대 500자): Claude Code는 받기만 하고 동작에 쓰지 않는다 — 모두 [CC Skills](https://code.claude.com/docs/en/skills)
- 호출 제어 표: 기본값은 사용자·Claude 둘 다 호출 가능하고 "Description always in context". `disable-model-invocation: true`는 "Description not in context, full skill loads when invoked". `user-invocable: false`는 사용자 호출 불가, description은 항상 컨텍스트에 있다 — [CC Skills](https://code.claude.com/docs/en/skills)
- 이름에 쓸 수 없는 문자: zero-width space·제어문자, private-use 문자, 방향 전환 문자, 일반 공백 하나 외의 공백, `<`·`>` — [CC Skills](https://code.claude.com/docs/en/skills)
- 플러그인 스킬 명령 이름: `my-plugin/skills/review/SKILL.md` → `/my-plugin:review`, `name: fancy`면 `/my-plugin:fancy` — [CC Skills](https://code.claude.com/docs/en/skills)
- "Custom commands have been merged into skills." `.claude/commands/deploy.md`와 `.claude/skills/deploy/SKILL.md` 모두 `/deploy`를 만든다 — [CC Skills](https://code.claude.com/docs/en/skills)
- 문자열 치환: `$ARGUMENTS`, `$ARGUMENTS[N]`, `$N`, `$name`, `${CLAUDE_SESSION_ID}`, `${CLAUDE_EFFORT}`, `${CLAUDE_SKILL_DIR}`, `${CLAUDE_PROJECT_DIR}`, `${CLAUDE_PLUGIN_ROOT}`, `${CLAUDE_PLUGIN_DATA}`. `${CLAUDE_SKILL_DIR}`를 본문과 `allowed-tools`의 Bash 규칙 양쪽에 쓰면 번들 스크립트를 권한 프롬프트 없이 실행할 수 있다(예 `allowed-tools: Bash(${CLAUDE_SKILL_DIR}/scripts/render.sh *)`) — [CC Skills](https://code.claude.com/docs/en/skills)

**로컬 가이드와의 차이**
- ASTRA BP §2는 `name`·`description` 제약을 공식과 같게 적고 `when_to_use` 1,536자 상한도 공식과 일치한다 — [로컬 ASTRA skill-best-practices.md 25–38행](/Users/zeans/.claude/plugins/cache/astra/astra-methodology/5.25.0/docs/development/skill-best-practices.md)
- superpowers는 "Max 1024 characters total"(97행)을 frontmatter 전체 상한처럼 적는다 — contradicted by [Spec](https://agentskills.io/specification), 표준은 `name` 64자와 `description` 1,024자를 따로 제한한다 — [로컬 writing-skills SKILL.md](/Users/zeans/.claude/plugins/cache/claude-plugins-official/superpowers/7.0.0/skills/writing-skills/SKILL.md)
- ASTRA skill-lint 8번은 "`allowed-tools` specified … absent = FAIL"로 필수 필드처럼 다루고 BP §2는 "least-privilege principle"로 설명한다 — contradicted by [CC Skills](https://code.claude.com/docs/en/skills): "It does not restrict which tools are available: every tool remains callable". 도구를 실제로 빼는 필드는 `disallowed-tools`다 — [로컬 skill-lint.md 48행](/Users/zeans/.claude/plugins/cache/astra/astra-methodology/5.25.0/commands/skill-lint.md)
- ASTRA skill-author는 `allowed-tools: Read, Write, Edit, ...`처럼 쉼표로 구분한다. Claude Code는 공백·쉼표 둘 다 받지만 표준은 "space-separated string"이다 — [로컬 skill-author SKILL.md 11행](/Users/zeans/.claude/plugins/cache/astra/astra-methodology/5.25.0/skills/skill-author/SKILL.md); [Spec](https://agentskills.io/specification)

### Inferences
- Claude Code가 모르는 필드를 조용히 무시하므로 `disable_model_invocation`(밑줄) 같은 오타는 아무 경고 없이 무효가 된다. 필드명 검증은 저자 쪽 린터가 맡아야 한다.
- claude.ai·API로도 배포할 스킬이면 frontmatter를 표준 여섯 필드로 제한하고, Claude Code 전용 기능은 플러그인 배포판에서만 쓰는 편이 안전하다.
- `allowed-tools`는 "권한 축소"가 아니라 "그 턴의 사전 승인"이다. 최소 권한이 목적이면 `disallowed-tools`나 settings의 deny 규칙을 써야 한다.

### Gaps
- XML 태그 금지와 예약어("anthropic", "claude") 금지가 Claude Code 로컬 스킬에도 강제되는지는 Claude Code 문서에 명시가 없다. 플랫폼 문서와 skill-creator 검증기에만 나온다.
- ASTRA 스킬 린트의 "13-point checklist"는 ASTRA 자체 규칙이다. Anthropic 공식 문서에 13항목 체크리스트는 없다(공식 체크리스트는 Core quality 10 + Code and scripts 8 + Testing 4 항목).

---

## 2. 모델이 제때 호출하게 하는 `description` 작성법, 그리고 under/over-triggering 증거

### Takeaway
모든 소스가 "description이 트리거의 거의 전부"라는 데 동의하고, 구체적 트리거 키워드·핵심 용례를 앞에 두라고 권한다. 그러나 문장 형태와 내용 범위는 소스마다 다르다. Anthropic 플랫폼 문서·표준은 "무엇을 하는지 + 언제 쓰는지, 3인칭"을, superpowers는 "언제 쓰는지만, 워크플로 요약 금지"를, agentskills.io는 명령형 "Use this skill when…"을, plugin-dev는 "This skill should be used when the user asks to…"를 처방한다. 현재 Claude는 under-trigger 경향이 있다는 Anthropic 측 진술이 있고, 단순 1단계 작업은 description이 완벽해도 트리거되지 않는다.

### Cited Findings
**공통 원칙**
- "The description is critical for skill selection: Claude uses it to choose the right Skill from potentially 100+ available Skills." — [Platform BP](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- "**Always write in third person**. The description is injected into the system prompt, and inconsistent point-of-view can cause discovery problems." Good: "Processes Excel files and generates reports" / Avoid: "I can help you process Excel files" / Avoid: "You can use this to process Excel files" — [Platform BP](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- 예시: "Generate descriptive commit messages by analyzing git diffs. Use when the user asks for help writing commit messages or reviewing staged changes." 나쁜 예 "Helps with documents", "Processes data", "Does stuff with files" — [Platform BP](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- Claude Code: "Put the key use case first: the combined `description` and `when_to_use` text is truncated at 1,536 characters in the skill listing" — [CC Skills](https://code.claude.com/docs/en/skills)
- Claude Code 스킬 목록 예산: "The budget scales at 1% of the model's context window. When the listing overflows, Claude Code drops descriptions starting with the skills you invoke least". 조정은 `skillListingBudgetFraction`(예 `0.02`), `SLASH_COMMAND_TOOL_CHAR_BUDGET`, 항목별 `"name-only"`(`skillOverrides`), 항목 상한 `skillListingMaxDescChars` — [CC Skills](https://code.claude.com/docs/en/skills)
- Codex: 초기 목록은 "at most 2% of the model's context window, or 8,000 characters when the context window is unknown", 스킬이 많으면 "Codex shortens skill descriptions first", `skills.max_context_tokens`로 "up to 10,000 tokens". "Front-load the key use case and trigger words so a host can still match the skill if descriptions are shortened." 템플릿 문구 "Explain exactly when this skill should and should not trigger." — [OpenAI Codex: Build skills](https://developers.openai.com/codex/skills)

**문장 형태·내용 범위를 둘러싼 충돌**
- 플랫폼 BP·표준: "Should describe both what the skill does and when to use it" — [Spec](https://agentskills.io/specification); [Platform BP](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) — contradicted by superpowers: "`description`: Third-person, describes ONLY when to use (NOT what it does) … Start with "Use when..." … **NEVER summarize the skill's process or workflow** … Keep under 500 characters if possible"(97–103행) — [로컬 writing-skills SKILL.md](/Users/zeans/.claude/plugins/cache/claude-plugins-official/superpowers/7.0.0/skills/writing-skills/SKILL.md)
- superpowers의 근거(공개 데이터 없는 내부 관찰): "Testing revealed that when a description summarizes the skill's workflow, an agent may follow the description instead of reading the full skill content. A description saying "code review between tasks" caused an agent to do ONE review, even though the skill's flowchart clearly showed TWO reviews"(154행) — [로컬 writing-skills SKILL.md](/Users/zeans/.claude/plugins/cache/claude-plugins-official/superpowers/7.0.0/skills/writing-skills/SKILL.md)
- agentskills.io: "**Use imperative phrasing.** Frame the description as an instruction to the agent: "Use this skill when..." rather than "This skill does..."" — [Optimizing skill descriptions](https://agentskills.io/skill-creation/optimizing-descriptions) — contradicted by 플랫폼 BP의 "Avoid: "You can use this to process Excel files"" 및 3인칭 원칙 — [Platform BP](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- plugin-dev: "Use the third-person (e.g. "This skill should be used when..." instead of "Use this skill when...")"(44행), 나쁜 예 "Use this skill when working with hooks.  # Wrong person, vague", "Load when user needs hook help.  # Not third person"(179–180행) — [로컬 plugin-dev skill-development SKILL.md](/Users/zeans/.claude/plugins/cache/claude-plugins-official/plugin-dev/ea10b213686c/skills/skill-development/SKILL.md) — contradicted by superpowers가 "Use when …"을 좋은 예로 제시하는 점, agentskills.io가 "Use this skill when…"을 권하는 점
- 공식 Claude Code 문서 자체의 예시는 "Summarizes uncommitted changes and flags anything risky. Use when the user asks what changed, wants a commit message, or asks to review their diff." 형태(3인칭 동사 + "Use when")다 — [CC Skills](https://code.claude.com/docs/en/skills)
- ASTRA BP §3: 3인칭, What + When, "`Use when [situation 1], [situation 2], or when user mentions "[keyword]"`", 핵심 용례를 첫 문장에 — [로컬 ASTRA skill-best-practices.md 41–63행](/Users/zeans/.claude/plugins/cache/astra/astra-methodology/5.25.0/docs/development/skill-best-practices.md)

**길이**
- 표준 하드 리밋 1,024자. agentskills.io: "A few sentences to a short paragraph is usually right" — [Optimizing descriptions](https://agentskills.io/skill-creation/optimizing-descriptions)
- skill-creator 설명 개선 프롬프트: "your description should not be more than about 100-200 words, even if that comes at the cost of accuracy. There is a hard limit of 1024 characters"(132행) — [로컬 skill-creator/scripts/improve_description.py](/Users/zeans/.claude/skills/synced/3ea6c425-1fea-414c-a306-24c44ce542dd_eecf7410-7280-4631-814c-696a1f9e6cd7/skill-creator/scripts/improve_description.py)
- superpowers: "Keep under 500 characters if possible" — [로컬 writing-skills SKILL.md 103행](/Users/zeans/.claude/plugins/cache/claude-plugins-official/superpowers/7.0.0/skills/writing-skills/SKILL.md)

**Under-triggering 증거와 대응**
- "currently Claude has a tendency to "undertrigger" skills -- to not use them when they'd be useful. To combat this, please make the skill descriptions a little bit "pushy"." 예: "… Make sure to use this skill whenever the user mentions dashboards, data visualization, internal metrics, or wants to display any kind of company data, even if they don't explicitly ask for a 'dashboard.'" — [로컬 skill-creator SKILL.md 67행](/Users/zeans/.claude/skills/synced/3ea6c425-1fea-414c-a306-24c44ce542dd_eecf7410-7280-4631-814c-696a1f9e6cd7/skill-creator/SKILL.md)
- "Err on the side of being pushy. Explicitly list contexts where the skill applies, including cases where the user doesn't name the domain directly" — [Optimizing descriptions](https://agentskills.io/skill-creation/optimizing-descriptions)
- 단순 작업은 트리거되지 않음: "Claude only consults skills for tasks it can't easily handle on its own — simple, one-step queries like "read this PDF" may not trigger a skill even if the description matches perfectly" — [로컬 skill-creator SKILL.md 398행](/Users/zeans/.claude/skills/synced/3ea6c425-1fea-414c-a306-24c44ce542dd_eecf7410-7280-4631-814c-696a1f9e6cd7/skill-creator/SKILL.md); 같은 취지 [Optimizing descriptions](https://agentskills.io/skill-creation/optimizing-descriptions)
- 정량 증거: description 최적화를 "our document-creation skills"에 돌려 "improved triggering on 5 out of 6 public skills" — [Improving skill-creator (Claude blog)](https://claude.com/blog/improving-skill-creator-test-measure-and-refine-agent-skills)
- 플러그인 eval에서 가장 흔한 첫 발견: "a `Δ` near zero with the case's `tool_used: Skill` grader failing, which means Claude isn't choosing your skill on natural phrasing" — [CC Plugin evals](https://code.claude.com/docs/en/plugin-evals)
- Claude Code 트러블슈팅(트리거 안 됨): "Check the description includes keywords users would naturally say", `What skills are available?`로 노출 확인, `/skill-name` 직접 호출, YAML 오류 시 "Claude can't match against your `description`" → `--debug`, `claude plugin validate` — [CC Skills](https://code.claude.com/docs/en/skills)
- description 소실도 under-trigger 원인: 스킬이 많으면 목록 예산 초과로 덜 쓰는 스킬의 description이 빠져 "removes the keywords Claude needs to match your request" — [CC Skills](https://code.claude.com/docs/en/skills)

**Over-triggering 대응**
- "Make the description more specific", "Add `disable-model-invocation: true` if you only want manual invocation" — [CC Skills](https://code.claude.com/docs/en/skills)
- "If should-not-trigger queries are false-triggering, the description may be too broad. Add specificity about what the skill does *not* do, or clarify the boundary between this skill and adjacent capabilities." — [Optimizing descriptions](https://agentskills.io/skill-creation/optimizing-descriptions)
- "Avoid adding specific keywords from failed queries — that's overfitting." — [Optimizing descriptions](https://agentskills.io/skill-creation/optimizing-descriptions)
- 키워드 커버리지(에러 메시지, 증상, 동의어, 도구명)와 "Describe the *problem* … not *language-specific symptoms*" — [로컬 writing-skills SKILL.md 176·202행](/Users/zeans/.claude/plugins/cache/claude-plugins-official/superpowers/7.0.0/skills/writing-skills/SKILL.md)

### Inferences
- 네 소스 모두 동의하는 최소 공통분모: (1) 1인칭·"I can" 금지, (2) 핵심 용례와 트리거 키워드를 첫 문장에, (3) 사용자가 실제로 쓸 말(파일 확장자, 에러 문구, 동의어)을 넣기, (4) 1,024자 하드 리밋 안에서 짧게. 문장 머리("Processes…" / "Use when…" / "This skill should be used when…")는 근거 데이터 없이 소스마다 다르다. 트리거 eval로 직접 비교하는 편이 확실하다.
- superpowers의 "워크플로 요약 금지"는 "무엇을 하는지" 자체를 빼라는 주장이라 공식 "what + when"과 정면으로 부딪친다. 절충안: 무엇을 다루는지(도메인·산출물)는 명사로 적고, 단계 순서·절차 요약은 빼기. 이 절충안도 검증 데이터는 없다.
- Claude Code에서는 `description`과 `when_to_use`가 합산 1,536자로 잘리고, 목록 예산(컨텍스트의 1%)을 넘기면 description 자체가 빠진다. 스킬 수가 많은 플러그인일수록 짧고 앞이 무거운 description이 유리하다.

### Gaps
- description 길이·문장 형태(3인칭 vs 명령형)와 트리거율 사이의 정량 데이터를 Anthropic이 공개한 자료는 찾지 못했다.
- superpowers의 SDO 사례(리뷰 1회 vs 2회)와 문구 테스트 결과는 공개된 실험 데이터가 없다.
- Codex 전용 description 길이 상한은 문서에서 찾지 못했다. 표준의 1,024자만 확인된다.
- ASTRA BP §12.1의 "The LLM matches English descriptions more accurately"(196행)는 출처가 없다. 미검증 주장이다. 또한 같은 문서 §14 체크리스트(240행)는 "interactive skill → Korean `description`"이라 적어 §12.1의 "All skill `description` fields are written in English"와 내부적으로도 맞지 않는다.

---

## 3. Progressive disclosure: 본문과 `references/`·`scripts/`·`assets/`의 경계, 권장 길이, 참조 깊이, 목차

### Takeaway
공식 기준은 "SKILL.md 본문 500줄 미만, 5,000토큰 미만, 참조는 SKILL.md에서 한 단계, 100줄 넘는 참조 파일에는 목차"다. 메타데이터(~100토큰)는 항상, 본문은 트리거 시, 번들 파일은 필요할 때만 로드되며 스크립트는 코드가 아니라 출력만 컨텍스트를 쓴다. Claude Code에서는 로드된 본문이 세션 내내 남아 매 턴 비용이 되고, 컴팩션 후에는 앞쪽 5,000토큰만 복원되므로 중요한 지시를 위에 둬야 한다. 로컬 가이드의 길이 기준(단어 수)은 공식과 단위·수치 모두 다르다.

### Cited Findings
**3단계 로딩**
- 표: "Level 1: Metadata | Always (at startup) | ~100 tokens per Skill", "Level 2: Instructions | When Skill is triggered | Under 5k tokens", Level 3 리소스는 필요 시 — [Agent Skills overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview)
- "When Claude runs `validate_form.py`, the script's code never loads into the context window. Only its output … consumes tokens" / "No practical limit on bundled content" — [Platform Overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview)
- 표준: "Metadata (~100 tokens) … Instructions (< 5000 tokens recommended) … Keep your main `SKILL.md` under 500 lines." — [Spec](https://agentskills.io/specification)
- "the amount of context that can be bundled into a skill is effectively unbounded" — [Anthropic Engineering: Equipping agents for the real world with Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)

**본문 길이**
- "Keep SKILL.md body under 500 lines for optimal performance / Split content into separate files when approaching this limit" — [Platform BP](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- Claude Code: "Keep `SKILL.md` under 500 lines. Move detailed reference material to separate files." 그리고 "Once a skill loads, its content stays in context across turns, so every line is a recurring token cost. State what to do rather than narrating how or why" — [CC Skills](https://code.claude.com/docs/en/skills)
- skill-creator: "SKILL.md body - In context whenever skill triggers (<500 lines ideal)" — [로컬 skill-creator SKILL.md 89–96행](/Users/zeans/.claude/skills/synced/3ea6c425-1fea-414c-a306-24c44ce542dd_eecf7410-7280-4631-814c-696a1f9e6cd7/skill-creator/SKILL.md)
- 공식 500줄 기준 — contradicted by plugin-dev: "Target 1,500-2,000 words for the body", "Keep under 3,000 words, ideally 1,500-2,000 words", Level 2 "<5k words"(82·190·329행) — [로컬 plugin-dev skill-development SKILL.md](/Users/zeans/.claude/plugins/cache/claude-plugins-official/plugin-dev/ea10b213686c/skills/skill-development/SKILL.md)
- 공식 500줄 기준 — contradicted by superpowers: "getting-started workflows: <150 words each / Frequently-loaded skills: <200 words total / Other skills: <500 words"(218–220행) — [로컬 writing-skills SKILL.md](/Users/zeans/.claude/plugins/cache/claude-plugins-official/superpowers/7.0.0/skills/writing-skills/SKILL.md)
- ASTRA BP: 500줄, 예외로 `pr-merge`(~535줄)만 인정하고 "any *new* skill exceeding 500 must extract" — [로컬 ASTRA skill-best-practices.md 17행](/Users/zeans/.claude/plugins/cache/astra/astra-methodology/5.25.0/docs/development/skill-best-practices.md)

**참조 깊이·목차**
- "Claude may partially read files when they're referenced from other referenced files. When encountering nested references, Claude might use commands like `head -100` to preview content rather than reading entire files" → "**Keep references one level deep from SKILL.md**" — [Platform BP](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- "For reference files longer than 100 lines, include a table of contents at the top. This ensures Claude can see the full scope of available information even when previewing with partial reads." — [Platform BP](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) — contradicted by skill-creator: "For large reference files (>300 lines), include a table of contents"(98행) — [로컬 skill-creator SKILL.md](/Users/zeans/.claude/skills/synced/3ea6c425-1fea-414c-a306-24c44ce542dd_eecf7410-7280-4631-814c-696a1f9e6cd7/skill-creator/SKILL.md)
- plugin-dev: 대형 참조 파일(>10k words)에는 SKILL.md에 grep 패턴을 적으라고 권한다(65행) — [로컬 plugin-dev SKILL.md](/Users/zeans/.claude/plugins/cache/claude-plugins-official/plugin-dev/ea10b213686c/skills/skill-development/SKILL.md); 플랫폼 BP의 Pattern 2도 `grep -i "revenue" reference/finance.md` 같은 "Quick search"를 보여 준다 — [Platform BP](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)

**무엇을 어디에 둘지**
- 표준: `scripts/` = 실행 코드("Be self-contained or clearly document dependencies / Include helpful error messages / Handle edge cases gracefully"), `references/` = 필요 시 읽는 문서("Keep individual reference files focused"), `assets/` = 템플릿·이미지·데이터 — [Spec](https://agentskills.io/specification)
- 플랫폼 BP 패턴 3가지: (1) 고수준 가이드 + 참조 링크, (2) 도메인별 분리(`reference/finance.md`, `sales.md` …), (3) 조건부 상세("**For tracked changes**: See [REDLINING.md]") — [Platform BP](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- 언제 읽을지를 적기: ""Read `references/api-errors.md` if the API returns a non-200 status code" is more useful than a generic "see references/ for details."" — [Agent Skills: Best practices for skill creators](https://agentskills.io/skill-creation/best-practices)
- Gotchas는 본문에: "Keep gotchas in `SKILL.md` where the agent reads them before encountering the situation. … for non-obvious issues, the agent may not recognize the trigger." — [AS Best practices](https://agentskills.io/skill-creation/best-practices)
- 템플릿: "Short templates can live inline in `SKILL.md`; for longer templates … store them in `assets/`" — [AS Best practices](https://agentskills.io/skill-creation/best-practices)
- superpowers: 별도 파일은 "Heavy reference (100+ lines)"와 "Reusable tools"만, "Code patterns (< 50 lines)"와 원칙은 인라인 — [로컬 writing-skills SKILL.md](/Users/zeans/.claude/plugins/cache/claude-plugins-official/superpowers/7.0.0/skills/writing-skills/SKILL.md)
- ASTRA BP §13.7 "Extraction boundary": "move ONLY template/reference material. Executable guards, `source` lines, decision rules, success criteria, and HITL logic stay inline in SKILL.md." — [로컬 ASTRA skill-best-practices.md](/Users/zeans/.claude/plugins/cache/astra/astra-methodology/5.25.0/docs/development/skill-best-practices.md)
- `@` 링크 금지: "`@` syntax force-loads files immediately, consuming 200k+ context before you need them."(288행) — [로컬 writing-skills SKILL.md](/Users/zeans/.claude/plugins/cache/claude-plugins-official/superpowers/7.0.0/skills/writing-skills/SKILL.md)

**Claude Code 수명주기(본문 배치에 영향)**
- "the rendered `SKILL.md` content enters the conversation as a single message and stays there across later turns. … Claude Code does not re-read the skill file on later turns, so write guidance that should apply throughout a task as standing instructions rather than one-time steps." — [CC Skills](https://code.claude.com/docs/en/skills)
- 컴팩션: "re-attaches the most recent invocation of each skill after the summary, keeping the first 5,000 tokens of each. Re-attached skills share a combined budget of 25,000 tokens", 최근 호출 순으로 채워 오래된 스킬은 통째로 빠질 수 있다. 대응: "put the most important instructions near the top of `SKILL.md`" — [CC Skills](https://code.claude.com/docs/en/skills)
- 동일 렌더링 재호출 시 두 번째 사본 대신 "already loaded" 메모만 붙는다 — [CC Skills](https://code.claude.com/docs/en/skills)

### Inferences
- 공식 기준(500줄·5,000토큰)과 plugin-dev(1,500–2,000단어)는 대략 같은 규모를 가리키지만 superpowers(<500단어, 자주 로드되는 스킬 <200단어)는 훨씬 엄격하다. superpowers 기준은 "모든 대화에 로드되는 스킬"을 전제로 한 것이라 일반 스킬에 그대로 적용할 근거는 약하다.
- Claude Code에서는 컴팩션 후 앞 5,000토큰만 살아남으므로 "500줄 미만"보다 "핵심 규칙을 앞 5,000토큰 안에"가 실제 동작에 더 직결된다.
- 목차 기준은 공식 100줄을 따르는 편이 안전하다(skill-creator의 300줄은 공식보다 느슨하다).

### Gaps
- 500줄·5,000토큰 기준의 실험 근거(성능 저하 곡선 등)는 공개 자료에서 찾지 못했다.
- "참조 한 단계" 규칙을 어겼을 때의 실패율 데이터는 없다. 근거는 `head -100` 부분 읽기 관찰뿐이다.

---

## 4. 자유도 조절: 정확한 스크립트 vs 고수준 가이드, "solve, don't defer", 시간 민감 정보, 용어 일관성, 예시 vs 규칙

### Takeaway
작업의 취약성(fragility)에 맞춰 자유도를 고른다. 여러 접근이 유효하면 텍스트 가이드(높은 자유도), 선호 패턴이 있으면 파라미터 있는 템플릿(중간), 순서·일관성이 중요하면 "정확히 이 명령을 실행"(낮은 자유도). 스크립트는 오류를 Claude에게 떠넘기지 말고 직접 처리하며, 상수에는 이유를 적는다. 날짜 조건 문장은 "Old patterns" 섹션으로 옮기고, 한 개념에는 한 용어만 쓴다. 출력 품질은 규칙 서술보다 구체적 예시·템플릿이 더 잘 전달한다. 다만 "이유를 설명하라"와 "이유를 서술하지 말고 할 일만 적어라"는 소스 간에 긴장이 있다.

### Cited Findings
**자유도**
- "Match the level of specificity to the task's fragility and variability." High freedom: "Multiple approaches are valid / Decisions depend on context / Heuristics guide the approach". Medium: "A preferred pattern exists / Some variation is acceptable / Configuration affects behavior". Low: "Operations are fragile and error-prone / Consistency is critical / A specific sequence must be followed" — 예 "Run exactly this script: `python scripts/migrate.py --verify --backup` … Do not modify the command or add additional flags." — [Platform BP](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- 비유: "Narrow bridge with cliffs on both sides … (low freedom)", "Open field with no hazards … (high freedom)" — [Platform BP](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- "Most skills have a mix. Calibrate each part independently." — [AS Best practices](https://agentskills.io/skill-creation/best-practices)
- "Provide defaults, not menus": "pick a default and mention alternatives briefly rather than presenting them as equal options" — [AS Best practices](https://agentskills.io/skill-creation/best-practices); 같은 내용 [Platform BP](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) "Avoid offering too many options"
- "Favor procedures over declarations": "A skill should teach the agent *how to approach* a class of problems, not *what to produce* for a specific instance." — [AS Best practices](https://agentskills.io/skill-creation/best-practices)
- "Aim for moderate detail": "Overly comprehensive skills can hurt more than they help … Concise, stepwise guidance with a working example tends to outperform exhaustive documentation." — [AS Best practices](https://agentskills.io/skill-creation/best-practices)
- "Prefer instructions over scripts unless you need deterministic behavior or external tooling." / "Write imperative steps with explicit inputs and outputs." — [Codex skills](https://developers.openai.com/codex/skills)

**스크립트: solve, don't defer**
- 현행 공식 제목은 "Solve, don't defer": "When writing scripts for Skills, handle error conditions rather than deferring to Claude." 나쁜 예 `# Just fail and let Claude figure it out` — [Platform BP](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices). 로컬 superpowers 사본은 예전 제목 "Solve, don't punt"(855행) — [로컬 anthropic-best-practices.md](/Users/zeans/.claude/plugins/cache/claude-plugins-official/superpowers/7.0.0/skills/writing-skills/anthropic-best-practices.md)
- 부두 상수 금지: "Configuration parameters should also be justified and documented to avoid "voodoo constants" (Ousterhout's law). If you don't know the right value, how will Claude determine it?" 예 `REQUEST_TIMEOUT = 30` 위에 근거 주석 — [Platform BP](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- 유틸리티 스크립트의 이점: "More reliable than generated code / Save tokens / Save time / Ensure consistency across uses". 실행 vs 참조 의도를 명시: "Run `analyze_form.py` to extract fields"(실행) / "See `analyze_form.py` for the field extraction algorithm"(참조), "For most utility scripts, execution is preferred" — [Platform BP](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- Plan-validate-execute: 중간 산출물(`changes.json`)을 스크립트로 검증한 뒤 실행. "When to use: Batch operations, destructive changes, complex validation rules, high-stakes operations." 검증 메시지는 구체적으로: "Field 'signature_date' not found. Available fields: …" — [Platform BP](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- 에이전트용 스크립트 설계: 대화형 프롬프트 금지("This is a hard requirement … A script that blocks on interactive input will hang indefinitely"), `--help`로 인터페이스 문서화, 무엇이 틀렸고 무엇을 기대하는지 적은 에러, JSON/CSV 같은 구조화 출력, 데이터는 stdout·진단은 stderr, 멱등성, `--dry-run`, 의미 있는 종료 코드, 안전한 기본값, 출력 크기 예측 가능("Many agent harnesses automatically truncate tool output beyond a threshold (e.g., 10-30K characters)") — [Using scripts in skills](https://agentskills.io/skill-creation/using-scripts)
- 원오프 명령은 버전 고정(`npx eslint@9.0.0`), PEP 723 인라인 의존성 + `uv run` — [AS Using scripts](https://agentskills.io/skill-creation/using-scripts)
- 반복 작업 번들링: "If all 3 test cases resulted in the subagent writing a `create_docx.py` or a `build_chart.py`, that's a strong signal the skill should bundle that script."(304행) — [로컬 skill-creator SKILL.md](/Users/zeans/.claude/skills/synced/3ea6c425-1fea-414c-a306-24c44ce542dd_eecf7410-7280-4631-814c-696a1f9e6cd7/skill-creator/SKILL.md)
- 블로그 근거: "sorting a list via token generation is far more expensive than simply running a sorting algorithm … many applications require the deterministic reliability that only code can provide." — [Eng blog](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)

**시간 민감 정보·용어**
- 나쁜 예 "If you're doing this before August 2025, use the old API." 좋은 예: "## Current method" + "## Old patterns" 안의 `<details><summary>Legacy v1 API (deprecated 2025-08)</summary>` — [Platform BP](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- "Choose one term and use it throughout the Skill" — Bad: "Mix "field", "box", "element", "control"" / "Mix "extract", "pull", "get", "retrieve"" — [Platform BP](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)

**예시 vs 규칙, 말투**
- "Examples convey the desired style and level of detail to Claude more clearly than descriptions alone." — [Platform BP](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- "provide a template. This is more reliable than describing the format in prose, because agents pattern-match well against concrete structures." — [AS Best practices](https://agentskills.io/skill-creation/best-practices)
- 템플릿 엄격도도 조절: 엄격("ALWAYS use this exact template structure") vs 유연("Here is a sensible default format, but use your best judgment") — [Platform BP](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- superpowers: "One excellent example beats many mediocre ones", 다중 언어 예시·빈칸 템플릿·인위적 예시 금지 — [로컬 writing-skills SKILL.md](/Users/zeans/.claude/plugins/cache/claude-plugins-official/superpowers/7.0.0/skills/writing-skills/SKILL.md)
- "Explain the why": "If you find yourself writing ALWAYS or NEVER in all caps, or using super rigid structures, that's a yellow flag"(302행) — [로컬 skill-creator SKILL.md](/Users/zeans/.claude/skills/synced/3ea6c425-1fea-414c-a306-24c44ce542dd_eecf7410-7280-4631-814c-696a1f9e6cd7/skill-creator/SKILL.md); "Reasoning-based instructions ("Do X because Y tends to cause Z") work better than rigid directives ("ALWAYS do X, NEVER do Y")" — [Evaluating skill output quality](https://agentskills.io/skill-creation/evaluating-skills) — contradicted by Claude Code 문서의 "State what to do rather than narrating how or why" — [CC Skills](https://code.claude.com/docs/en/skills) — 및 ASTRA "**State, don't narrate** | Write only what to do, not lengthy explanations of how or why"(20행) — [로컬 ASTRA BP](/Users/zeans/.claude/plugins/cache/astra/astra-methodology/5.25.0/docs/development/skill-best-practices.md)
- 플랫폼 BP의 반복 예시는 Claude A가 ""MUST filter" instead of "always filter,""처럼 더 강한 표현을 제안할 수 있다고 적는다 — [Platform BP](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- superpowers "Match the Form to the Failure": 압박 속 규칙 위반이면 금지문 + 합리화 표 + red flags, 출력 모양이 틀리면 "Positive recipe or contract", 필수 요소 누락이면 템플릿의 REQUIRED 슬롯, 조건부 동작이면 관찰 가능한 조건문. "In head-to-head wording tests on dispatch-prompt guidance, the prohibition arm produced clearly more of the unwanted content than the recipe arm … and trended worse than even the no-guidance control"(472행), "No nuance clauses", "Exemption clauses don't scope" — [로컬 writing-skills SKILL.md](/Users/zeans/.claude/plugins/cache/claude-plugins-official/superpowers/7.0.0/skills/writing-skills/SKILL.md)
- 말투: plugin-dev "Write the entire skill using **imperative/infinitive form** (verb-first instructions), not second person"(160행); skill-creator "Prefer using the imperative form in instructions" — 로컬 [plugin-dev SKILL.md](/Users/zeans/.claude/plugins/cache/claude-plugins-official/plugin-dev/ea10b213686c/skills/skill-development/SKILL.md), [skill-creator SKILL.md 117행](/Users/zeans/.claude/skills/synced/3ea6c425-1fea-414c-a306-24c44ce542dd_eecf7410-7280-4631-814c-696a1f9e6cd7/skill-creator/SKILL.md)
- 반드시 매번 지켜야 하는 규칙은 스킬 문장 대신 훅으로: "**Claude skipped a rule that must hold every time**: move the rule into a hook … define the hook in the skill's `hooks` frontmatter" / 판단형 지침은 "Run the tests after every edit"처럼 작업 전체에 적용되게 쓰기 — [CC Skills](https://code.claude.com/docs/en/skills)
- superpowers "Don't create for: … Mechanical constraints (if it's enforceable with regex/validation, automate it—save documentation for judgment calls)" — [로컬 writing-skills SKILL.md](/Users/zeans/.claude/plugins/cache/claude-plugins-official/superpowers/7.0.0/skills/writing-skills/SKILL.md)

### Inferences
- "이유를 설명하라"(skill-creator·agentskills.io)와 "이유를 서술하지 말라"(Claude Code 문서·ASTRA)는 둘 다 장황함을 겨냥한다. 실무 절충: 판단이 필요한 지침에는 한 줄 이유를 붙이고, 절차·명령에는 이유를 생략한다. 한 줄 이유가 대문자 MUST보다 낫다는 점은 두 진영 모두와 양립한다.
- 기계적으로 검사 가능한 규칙(형식, 금지 패턴)은 스크립트·훅·린터로 옮기고, 스킬 본문은 판단 영역에 쓰는 구성이 공식 문서(훅 권고)와 superpowers 양쪽에 부합한다.

### Gaps
- 자유도 수준별 성공률 비교 같은 정량 연구는 공식 자료에 없다.
- superpowers의 금지문 vs 레시피 비교 실험은 수치·표본이 공개되지 않았다.

---

## 5. 테스트와 반복: eval 주도 개발, 관찰, `claude plugin eval`, `/skill-doctor`, skill-creator 루프, 모델별 테스트

### Takeaway
공식 권고는 "스킬을 쓰기 전에 eval부터 만든다"이다. 스킬 없이 대표 작업을 돌려 실패를 기록하고, 시나리오 3개를 만들고, 기준선을 잰 뒤 최소한의 지시만 쓴다. 측정은 두 갈래로 한다. (1) 트리거되는가(should/should-not 쿼리, 반복 실행, 트리거율), (2) 트리거됐을 때 결과가 좋은가(스킬 있음/없음 기준선 비교, assertion 채점, 사람 리뷰). Claude Code에는 플러그인용 `claude plugin eval`(CI 게이트 가능), 사용량·비용 진단용 `/skill-doctor`, 파싱 검사용 `claude plugin validate`가 있고, 단일 스킬 반복에는 skill-creator의 eval/benchmark/description 최적화 루프가 있다.

### Cited Findings
**Eval 주도 개발(공식)**
- "**Create evaluations BEFORE writing extensive documentation.**" 5단계: "Identify gaps … Create evaluations: Build three scenarios that test these gaps … Establish baseline … Write minimal instructions … Iterate" — [Platform BP](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- 예시 eval 구조: `{"skills": [...], "query": "...", "files": [...], "expected_behavior": [...]}`. 그리고 "There is not currently a built-in way to run these evaluations. Users can create their own evaluation system." — [Platform BP](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) — contradicted by(범위·시점 차이) Claude Code의 `claude plugin eval`과 skill-creator 자동 루프 — [CC Skills](https://code.claude.com/docs/en/skills), [CC Plugin evals](https://code.claude.com/docs/en/plugin-evals)
- Claude A/Claude B 패턴: Claude A가 스킬을 설계·수정하고, 스킬을 로드한 새 인스턴스 Claude B가 실제 작업에서 테스트, 관찰 결과를 다시 A에 전달 — [Platform BP](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- 관찰 포인트: "Unexpected exploration paths", "Missed connections", "Overreliance on certain sections"(그 내용은 SKILL.md로 올릴 후보), "Ignored content"(불필요하거나 신호가 약한 파일) — [Platform BP](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- 모델별 테스트: "Claude Haiku … Does the Skill provide enough guidance? / Claude Sonnet … Is the Skill clear and efficient? / Claude Opus … Does the Skill avoid over-explaining?" 체크리스트 "Tested with Haiku, Sonnet, and Opus", "At least three evaluations created" — [Platform BP](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- 블로그: "Identify specific gaps in your agents' capabilities by running them on representative tasks … Then build skills incrementally", "ask Claude to capture its successful approaches and common mistakes into reusable context and code within a skill. If it goes off track … ask it to self-reflect on what went wrong." — [Eng blog](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)

**Claude Code의 측정 원칙**
- "Seeing a skill trigger tells you Claude found it, not that it did what you intended. … measure separately whether Claude invokes it on the prompts it should, and whether the output matches what you expect when it does." 기준선은 새 세션에서: "A fresh session matters because leftover context from authoring the skill will mask gaps in the written instructions." 개인·프로젝트 스킬은 `skillOverrides`에서 `"off"`, 플러그인 스킬은 `claude plugin eval`의 no-plugin baseline — [CC Skills](https://code.claude.com/docs/en/skills)

**`claude plugin eval`**
- 요구사항 "Claude Code v2.1.269 or later", git 2.31+ — [CC Plugin evals](https://code.claude.com/docs/en/plugin-evals)
- `claude plugin eval init`이 플러그인을 읽고 should/shouldn't 프롬프트와 grader를 제안·시험한 뒤 `evals/<case>/`를 만든다. 실행은 `claude plugin eval .` — "Each case runs three times with your plugin and three times without it, so one case is six runs." 요약표 `WITH`/`W/OUT`/`Δ`/`COST` — [CC Plugin evals](https://code.claude.com/docs/en/plugin-evals)
- 케이스 구조: `prompt.md`(frontmatter에 `max_turns`, `allowed_tools` 등) + `graders/*.md`(+선택 `case.yaml`). grader 없는 케이스는 로드 실패. 각 run은 빈 작업 디렉터리에서 시작 — [CC Plugin evals](https://code.claude.com/docs/en/plugin-evals)
- grader 타입: `regex`(`match: not_contains`, `"count:N"`), `tool_used`(`min`/`max`, 미호출 단언은 `min: 0`, `max: 0`), `tool_order`, `file_exists`, `llm`("votes PASS on the rubric in at least two of three votes"), `baseline` — [CC Plugin evals](https://code.claude.com/docs/en/plugin-evals)
- 두 arm 실행에서 `tool_used`의 `tool`이 `Skill`인 grader는 점수에서 제외하고 통과 여부만 표시한다(없으면 without-arm이 0이 되어 Δ가 부풀려지므로). "must not invoke the skill" 검사는 `arm: both`로 양쪽 채점 — [CC Plugin evals](https://code.claude.com/docs/en/plugin-evals)
- 안정적 신호를 위한 습관: 긴 출력은 `regex`로, `llm`은 짧은 출력에 구체적 PASS/FAIL 조건으로; 케이스마다 결과 grader 하나 + 과정 grader(`tool_used`/`tool_order`) 하나; `tool_used: Skill`이 통과인데 Δ가 음수면 judge부터 의심(`--judge-model sonnet`) — [CC Plugin evals](https://code.claude.com/docs/en/plugin-evals)
- MCP 모킹: `evals/mocks/<server>/<tool>.md`, `expect:`로 입력 단언, `type: agent`로 judge 모델이 서버 역할 — [CC Plugin evals](https://code.claude.com/docs/en/plugin-evals)
- "exits non-zero below a threshold so you can gate CI on it", 단일 arm 빠른 반복 `claude plugin eval . --case <case-name> --runs 1 --ablation none`(노이즈가 크므로 기본 3회로 재확인) — [CC Skills](https://code.claude.com/docs/en/skills); [CC Plugin evals](https://code.claude.com/docs/en/plugin-evals)
- 통과 기준: `--threshold <0..1>` 기본값 `1.0`, "A case passes when its with-arm score is at least this. Any case below it makes the command exit 1". run 점수는 통과한 grader 비율(가중 가능), 케이스 점수는 run 평균 — [CC Plugin evals](https://code.claude.com/docs/en/plugin-evals)
- 비용 경고: "Every eval run and every judge grader is a real model call on your account" — [CC Plugin evals](https://code.claude.com/docs/en/plugin-evals)

**`/skill-doctor`, `/doctor`, `claude plugin validate`**
- "Every skill in the skill listing adds to your context on every turn, whether or not Claude ever uses it. Run `/skill-doctor` to see what each of your skills costs and how often it gets used". 한 번도 호출되지 않은 스킬을 표시하고 비활성화 위치를 알려 준다. "requires Claude Code v2.1.252 or later" — [CC Skills](https://code.claude.com/docs/en/skills)
- `/doctor`: 스킬 목록의 컨텍스트 비용 추정과 큰 기여자 — [CC Skills](https://code.claude.com/docs/en/skills)
- frontmatter 파싱 실패 탐지: `claude plugin validate .claude/skills` 또는 `~/.claude/skills`, "Requires Claude Code v2.1.233 or later" — [CC Skills](https://code.claude.com/docs/en/skills)

**skill-creator 루프**
- 출력 품질: 테스트 프롬프트 2–3개 → `evals/evals.json` → 같은 턴에 with-skill과 baseline(새 스킬이면 `without_skill`, 개선이면 스냅숏한 `old_skill`) 서브에이전트 동시 실행 → 실행 중 assertion 작성 → `timing.json`(`total_tokens`, `duration_ms`는 알림에서만 얻을 수 있음) → grader가 `grading.json`(`text`/`passed`/`evidence`) → `aggregate_benchmark`로 pass rate·시간·토큰 mean±stddev·delta → 분석(항상 통과하는 비변별 assertion, 고분산 eval) → `eval-viewer/generate_review.py` 리뷰어 → `feedback.json` → 반복 — [로컬 skill-creator SKILL.md 141–321행](/Users/zeans/.claude/skills/synced/3ea6c425-1fea-414c-a306-24c44ce542dd_eecf7410-7280-4631-814c-696a1f9e6cd7/skill-creator/SKILL.md)
- 개선 원칙: "Generalize from the feedback", "Keep the prompt lean … read the transcripts, not just the final outputs", "Explain the why", "Look for repeated work across test cases" — [로컬 skill-creator SKILL.md 296–304행](/Users/zeans/.claude/skills/synced/3ea6c425-1fea-414c-a306-24c44ce542dd_eecf7410-7280-4631-814c-696a1f9e6cd7/skill-creator/SKILL.md)
- description 최적화: 쿼리 20개(should-trigger 8–10, should-not 8–10), near-miss 음성 쿼리 중시("Write a fibonacci function" 같은 무관 쿼리는 테스트 가치 없음), `run_loop`가 "splits the eval set into 60% train and 40% held-out test, evaluates the current description (running each query 3 times …)", 최대 5회 반복, `best_description`은 "selected by test score rather than train score to avoid overfitting" — [로컬 skill-creator SKILL.md 337–394행](/Users/zeans/.claude/skills/synced/3ea6c425-1fea-414c-a306-24c44ce542dd_eecf7410-7280-4631-814c-696a1f9e6cd7/skill-creator/SKILL.md); 임계값 기본 `trigger_threshold: float = 0.5` — [로컬 run_eval.py 192행](/Users/zeans/.claude/skills/synced/3ea6c425-1fea-414c-a306-24c44ce542dd_eecf7410-7280-4631-814c-696a1f9e6cd7/skill-creator/scripts/run_eval.py)
- agentskills.io도 같은 수치를 표준 가이드로 제시: "Aim for about 20 queries: 8-10 that should trigger and 8-10 that shouldn't", "Run each query multiple times (3 is a reasonable starting point)", 임계값 "0.5 is a reasonable default", train ~60%/validation ~40%, "Five iterations is usually enough", 최종 확인용으로 최적화에 쓰지 않은 새 쿼리 5–10개 — [Optimizing descriptions](https://agentskills.io/skill-creation/optimizing-descriptions)
- Claude Code 트리거 감지 예: `claude -p "$query" --output-format json | jq … '.type == "tool_use" and .name == "Skill" and .input.skill == $skill'` — [Optimizing descriptions](https://agentskills.io/skill-creation/optimizing-descriptions)
- 좋은 assertion: "The output file is valid JSON", "The bar chart has labeled axes" / 약한 것: "The output is good", 정확한 문구 강제처럼 brittle한 것. "Require concrete evidence for a PASS", 블라인드 비교 — [Evaluating skill output quality](https://agentskills.io/skill-creation/evaluating-skills)
- 블로그: 스킬 유형을 "capability uplift"(모델이 못 하거나 일관되게 못 하는 일)와 "encoded preference"(팀 절차를 순서대로 엮는 일)로 구분. "Capability uplift skills may become less necessary as models improve. Evals tell you when that's happened." 기본 모델이 스킬 없이 eval을 통과하면 "the skill's techniques may have been incorporated into the model's default behavior" — [skill-creator blog](https://claude.com/blog/improving-skill-creator-test-measure-and-refine-agent-skills)
- 두 eval 형식은 호환되지 않는다: "The two formats aren't interchangeable." / "neither tool reads the other's case files" — [CC Skills](https://code.claude.com/docs/en/skills); [CC Plugin evals](https://code.claude.com/docs/en/plugin-evals)

**로컬 방법론**
- superpowers: "**Writing skills IS Test-Driven Development applied to process documentation.**", "NO SKILL WITHOUT A FAILING TEST FIRST"(379행), RED(스킬 없이 압박 시나리오 → 합리화 문구를 그대로 기록) → GREEN(그 위반만 다루는 최소 스킬) → REFACTOR(새 합리화 차단). 문구 마이크로 테스트: 새 컨텍스트 1샘플/호출, "Always include a no-guidance control. If the control doesn't exhibit the failure, there is nothing to fix", "5+ reps per variant"(583행), 플래그된 일치는 사람이 직접 읽기, "Variance is a metric" — [로컬 writing-skills SKILL.md](/Users/zeans/.claude/plugins/cache/claude-plugins-official/superpowers/7.0.0/skills/writing-skills/SKILL.md); 압박 유형(시간, 매몰비용, 권위, 피로)과 메타 테스트는 [로컬 testing-skills-with-subagents.md](/Users/zeans/.claude/plugins/cache/claude-plugins-official/superpowers/7.0.0/skills/writing-skills/testing-skills-with-subagents.md)
- ASTRA: `references/evals.md`에 "## Scenario" 3개 이상(대표·엣지·오용), 없으면 skill-lint 13번 WARN — [로컬 skill-lint.md 53행](/Users/zeans/.claude/plugins/cache/astra/astra-methodology/5.25.0/commands/skill-lint.md); ASTRA BP §10은 `*-validator`→haiku, `*-reviewer`/`*-analyzer`→sonnet 규약 — [로컬 ASTRA BP](/Users/zeans/.claude/plugins/cache/astra/astra-methodology/5.25.0/docs/development/skill-best-practices.md)

### Inferences
- 공식 3시나리오는 출력 품질 eval의 하한이고, 트리거 eval은 별도로 약 20쿼리 × 3회가 표준 수치다. 둘을 섞지 말아야 한다(Claude Code 문서가 두 측정을 분리하라고 명시).
- 플러그인으로 배포하는 스킬(이 저장소의 경우)은 `claude plugin eval`이 CI 게이트까지 지원하므로 1차 도구가 된다. skill-creator 형식과 호환되지 않으므로 하나를 정해 쓰는 편이 유지비가 적다.
- "capability uplift" 스킬은 모델 교체 때마다 eval을 다시 돌려 퇴역 시점을 판단해야 한다.

### Gaps
- 공식 "Haiku/Sonnet/Opus 모두에서 테스트" 권고에 붙은 모델별 결과 데이터는 없다.
- `/skill-doctor`가 보고하는 비용 수치의 계산 방식(토큰인지 글자인지)은 문서에 자세히 나오지 않는다.
- `claude plugin eval`의 기본 `--threshold`는 1.0이라 grader 하나만 흔들려도 CI가 실패한다. 실무 임계값(문서 예시는 `0.8`)을 어떻게 잡을지에 대한 공식 권고는 찾지 못했다.

---

## 6. Agent Skills 오픈 표준(agentskills.io)과 도구 간 이식성

### Takeaway
Claude Code 스킬은 agentskills.io 오픈 표준을 따르며, 이식 가능한 필드는 `name`·`description`·`license`·`compatibility`·`metadata`·`allowed-tools`(실험적) 여섯 개다. agentskills.io 클라이언트 목록에는 Codex·Gemini CLI·Cursor·GitHub Copilot·VS Code·OpenCode 등 46개가 올라 있다. Claude Code 확장 필드와 본문 기능(`!`cmd``, `$ARGUMENTS`, `${CLAUDE_SKILL_DIR}`)은 다른 표면에서 작동하지 않는다. Codex는 `.agents/skills/`를 읽고 `agents/openai.yaml`로 호출 정책을 따로 둔다.

### Cited Findings
- "Claude Code skills follow the Agent Skills open standard, which works across multiple AI tools. Claude Code extends the standard with additional features like invocation control, subagent execution, and dynamic context injection." — [CC Skills](https://code.claude.com/docs/en/skills)
- 배포 경로별 허용 필드: Claude Code(플러그인 포함)는 표의 모든 필드, "claude.ai skill uploads, the Skills API, and packaging with `package_skill.py` from anthropics/skills"는 `name`, `description`, `license`, `compatibility`, `metadata`, `allowed-tools`만. 그 밖의 키는 하드 에러: "Unexpected key(s) in SKILL.md frontmatter: argument-hint. Allowed properties are: allowed-tools, compatibility, description, license, metadata, name" — [CC Skills](https://code.claude.com/docs/en/skills)
- "Claude Code-only body features, such as dynamic context injection, don't function in claude.ai chat or through the API." — [CC Skills](https://code.claude.com/docs/en/skills)
- 표준은 `name`이 상위 디렉터리 이름과 같아야 한다고 규정 — [Spec](https://agentskills.io/specification); Claude Code는 `name`이 선택이며 기본값이 디렉터리 이름 — [CC Skills](https://code.claude.com/docs/en/skills)
- 검증 도구: `skills-ref validate ./my-skill` — [Spec](https://agentskills.io/specification)
- 표준 발표: 블로그 상단 "as an open standard for cross-platform portability. (December 18, 2025)" — [Eng blog](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills); anthropics/skills README "This repository contains Anthropic's implementation of skills for Claude. For information about the Agent Skills standard, see agentskills.io", 템플릿은 `name: template-skill` / `description: Replace with description of the skill and when Claude should use it.` — [anthropics/skills](https://github.com/anthropics/skills)
- 클라이언트 목록(46개): Junie, ZeroClaw, Gemini CLI, Autohand Code CLI, OpenCode, OpenHands, Mux, Cursor, Amp, Letta, Firebender, Goose, GitHub Copilot, VS Code, Claude Code, Claude, ChatGPT & Codex, Piebald, Factory, pi, Databricks Genie Code, Agentman, TRAE, Spring AI, Roo Code, Mistral AI Vibe, Command Code, Ona, VT Code, Qodo, Laravel Boost, Emdash, Snowflake Cortex Code, Kiro, Workshop, Google AI Edge Gallery, nanobot, fast-agent, bub, Tabnine, Vita, Superconductor, Deep Code, Pulumi Neo, Hermes Agent, OpenClaw — [Agent Skills Client Showcase](https://agentskills.io/clients)
- 클라이언트 구현 가이드: 프로젝트 `<project>/.agents/skills/`, 사용자 `~/.agents/skills/`를 "widely-adopted convention for cross-client skill sharing"으로 권장. 관대한 검증: 이름·디렉터리 불일치나 64자 초과는 "warn, load anyway", 그러나 "Description is missing or empty → skip the skill". 이름 충돌은 결정적 우선순위 + 경고. 신뢰되지 않은 프로젝트 스킬은 신뢰 확인 후 로드 권장. 대부분 구현은 활성화 시 frontmatter를 제거하고 본문만 전달 — [How to add skills support to your agent](https://agentskills.io/client-implementation/adding-skills-support)
- Codex: 위치 `$CWD/.agents/skills`부터 레포 루트까지, `$HOME/.agents/skills`, `/etc/codex/skills`, 시스템 번들. 같은 `name` 두 개는 병합하지 않고 둘 다 표시. 선택 메타데이터 `agents/openai.yaml`의 `policy.allow_implicit_invocation`(기본 `true`) — "When `false`, Codex won't implicitly invoke the skill based on user prompt; explicit `$skill` invocation still works." `dependencies.tools`로 MCP 의존성 선언. 명시 호출은 `$skill` 또는 `/skills` — [Codex skills](https://developers.openai.com/codex/skills)
- superpowers: "Codex, Copilot CLI, and Gemini CLI all also recognize `~/.agents/skills/` as a cross-runtime alias"(12행) — [로컬 writing-skills SKILL.md](/Users/zeans/.claude/plugins/cache/claude-plugins-official/superpowers/7.0.0/skills/writing-skills/SKILL.md)
- 런타임 차이: Claude API는 "no network access and no runtime package installation", claude.ai는 npm·PyPI 설치 가능, Claude Code는 "the same network access as any other program on the user's computer". "Custom Skills do not sync across surfaces" — [Platform Overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview); [Platform BP](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- Claude Code 플러그인 배치: `skills/<name>/SKILL.md`, 매니페스트 `skills` 키는 기본 `skills/` 스캔에 추가, 루트에 `SKILL.md`만 있으면 단일 스킬. "A `CLAUDE.md` at the plugin root isn't loaded as context … To include instructions that load into Claude's context, put them in a skill." — [CC Plugins reference](https://code.claude.com/docs/en/plugins-reference)
- 경로 표기: "use relative paths from the skill root", 스크립트 실행 경로는 참조 파일 안에서도 "relative to the **skill directory root**" — [Spec](https://agentskills.io/specification); [AS Using scripts](https://agentskills.io/skill-creation/using-scripts)
- 스크립트는 인터프리터로 호출: "Invoke bundled scripts through their interpreter in the prose (`bash scripts/tool.sh`, `node scripts/tool.js`), never by bare path: some harness plugin packagers strip executable bits"(374행) — [로컬 writing-skills SKILL.md](/Users/zeans/.claude/plugins/cache/claude-plugins-official/superpowers/7.0.0/skills/writing-skills/SKILL.md)

**이식성 대응표(조사 결과 정리)**

| 의도 | Claude Code | 표준/claude.ai/API | Codex |
| - | - | - | - |
| 자동 호출 끄기 | `disable-model-invocation: true` | 해당 필드 없음(업로드 시 키 거부) | `agents/openai.yaml` → `policy.allow_implicit_invocation: false` |
| 트리거 문구 보강 | `when_to_use`(1,536자 합산) | 없음 → `description`에 포함 | 없음 → `description`에 포함 |
| 도구 사전 승인 | `allowed-tools`(턴 단위 grant) | `allowed-tools`(실험적, 공백 구분) | 문서에 언급 없음 |
| 환경 요구 | `compatibility`(동작 없음) | `compatibility` ≤500자 | 표준 따름 |
| 스킬 디렉터리 | `~/.claude/skills`, `.claude/skills`, 플러그인 `skills/` | 업로드 | `.agents/skills`, `~/.agents/skills` |

(표의 각 칸 출처: [CC Skills](https://code.claude.com/docs/en/skills), [Spec](https://agentskills.io/specification), [Codex skills](https://developers.openai.com/codex/skills))

### Inferences
- 여러 도구에서 쓸 스킬은 frontmatter를 표준 여섯 필드로 제한하고, `description` 하나에 트리거 정보를 모두 담아야 한다(`when_to_use`는 Claude Code에서만 의미가 있다).
- `allowed-tools`의 구분자는 표준이 공백 구분을 요구하므로 쉼표 구분은 Claude Code 밖에서 오동작할 수 있다.
- 본문에서 `${CLAUDE_SKILL_DIR}`·`!`cmd``를 쓰면 Claude Code 전용이 된다. 이식성이 필요하면 스킬 루트 기준 상대 경로와 `bash scripts/x.sh` 형태가 안전하다.

### Gaps
- Codex가 표준 외 frontmatter 키(예 `disable-model-invocation`)를 무시하는지 거부하는지는 Codex 문서에 명시가 없다.
- 46개 클라이언트가 `allowed-tools`·`compatibility`를 실제로 얼마나 지원하는지 비교한 자료는 찾지 못했다.

---

## 7. 안티패턴

### Takeaway
공식 문서가 명시하는 안티패턴은 Windows 경로, 선택지 과다, 시간 민감 정보, 용어 혼용, 깊은 참조 중첩, 모호한 description, 1인칭 description, 부두 상수, 오류 떠넘기기, 설치 가정, MCP 도구명 비한정이다. 로컬·커뮤니티 가이드는 여기에 "워크플로를 요약한 description"(본문을 건너뛰게 만듦), 잡동사니(kitchen-sink) 스킬, 과도한 포괄성, 서사형 예시, `@` 강제 로드를 더한다.

### Cited Findings
- Windows 경로: "Always use forward slashes in file paths, even on Windows … Windows-style paths cause errors on Unix systems." — [Platform BP](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- 선택지 과다: ""You can use pypdf, or pdfplumber, or PyMuPDF, or pdf2image, or..."" → 기본값 + 탈출구 — [Platform BP](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- 설치 가정: Bad "Use the pdf library to process the file." / Good "Install required package: `pip install pypdf`" — [Platform BP](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices); 전제조건은 SKILL.md나 `compatibility`에 명시 — [AS Using scripts](https://agentskills.io/skill-creation/using-scripts)
- MCP 도구명: "always use fully qualified tool names to avoid "tool not found" errors. Format: `ServerName:tool_name`" — [Platform BP](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- 깊은 중첩, 시간 민감 정보, 용어 혼용, 부두 상수, 오류 떠넘기기: 질문 3·4의 인용 참조 — [Platform BP](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- 모호·1인칭 description: "Helps with documents", "I can help you process Excel files" — [Platform BP](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- 워크플로 요약 description: "Descriptions that summarize workflow create a shortcut agents will take. The skill body becomes documentation agents skip." — [로컬 writing-skills SKILL.md](/Users/zeans/.claude/plugins/cache/claude-plugins-official/superpowers/7.0.0/skills/writing-skills/SKILL.md) (공개 데이터 없는 관찰, 질문 2 참고)
- 범위 설계(kitchen-sink): "Skills scoped too narrowly force multiple skills to load for a single task … Skills scoped too broadly become hard to activate precisely. A skill for querying a database and formatting the results may be one coherent unit, while a skill that also covers database administration is probably trying to do too much." — [AS Best practices](https://agentskills.io/skill-creation/best-practices); "Keep each skill focused on one job." — [Codex skills](https://developers.openai.com/codex/skills)
- 과도한 포괄성: "the agent struggles to extract what's relevant and may pursue unproductive paths triggered by instructions that don't apply to the current task" — [AS Best practices](https://agentskills.io/skill-creation/best-practices)
- 일반론만 담긴 스킬: LLM에게 도메인 맥락 없이 스킬을 생성시키면 ""handle errors appropriately," "follow best practices for authentication"" 같은 모호한 절차가 나온다 — [AS Best practices](https://agentskills.io/skill-creation/best-practices)
- 이미 아는 내용 설명: PDF가 무엇인지 설명하는 150토큰 예 vs 50토큰 예. ""Would the agent get this wrong without this instruction?" If the answer is no, cut it." — [Platform BP](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices); [AS Best practices](https://agentskills.io/skill-creation/best-practices)
- 실행 추적에서 보이는 낭비의 원인: "instructions that are too vague …, instructions that don't apply to the current task (the agent follows them anyway), or too many options presented without a clear default" — [AS Best practices](https://agentskills.io/skill-creation/best-practices)
- 과적합 수정: "Rather than put in fiddly overfitty changes, or oppressively constrictive MUSTs …" — [로컬 skill-creator SKILL.md 298행](/Users/zeans/.claude/skills/synced/3ea6c425-1fea-414c-a306-24c44ce542dd_eecf7410-7280-4631-814c-696a1f9e6cd7/skill-creator/SKILL.md)
- `context: fork` 오용: "`context: fork` only makes sense for skills with explicit instructions. If your skill contains guidelines like "use these API conventions" without a task, the subagent receives the guidelines but no actionable prompt, and returns without meaningful output." 또한 Explore/Plan 에이전트는 CLAUDE.md 없이 시작하므로 필요한 맥락을 SKILL.md에 모두 담아야 한다 — [CC Skills](https://code.claude.com/docs/en/skills)
- 부작용 있는 스킬의 자동 호출: "`disable-model-invocation: true` … Use this for workflows with side effects … like `/commit`, `/deploy`, or `/send-slack-message`. You don't want Claude deciding to deploy because your code looks ready." — [CC Skills](https://code.claude.com/docs/en/skills)
- 일회성 단계형 지시: 스킬 파일은 재독되지 않으므로 "Run the tests"보다 "Run the tests after every edit" — [CC Skills](https://code.claude.com/docs/en/skills)
- superpowers 안티패턴: 서사형 예시("In session 2025-10-03, we found …"), 다중 언어 희석, 플로차트 안의 코드, 의미 없는 라벨(helper1, step3), 테스트 없이 여러 스킬 일괄 배포 — [로컬 writing-skills SKILL.md](/Users/zeans/.claude/plugins/cache/claude-plugins-official/superpowers/7.0.0/skills/writing-skills/SKILL.md)
- ASTRA 안티패턴 10개(BP §8): Windows 경로, 시간 정보, 선택지 과다, 모호 description, 3단계 이상 중첩, 부두 상수, 오류 떠넘기기, 용어 혼용, 자기소개형 description, 비한정 MCP 도구명. skill-author는 이 중 6개를 자동 차단 — [로컬 ASTRA BP 132–143행](/Users/zeans/.claude/plugins/cache/astra/astra-methodology/5.25.0/docs/development/skill-best-practices.md); [로컬 skill-author SKILL.md 89–100행](/Users/zeans/.claude/plugins/cache/astra/astra-methodology/5.25.0/skills/skill-author/SKILL.md)
- ASTRA zsh 함정(macOS Bash 도구가 zsh로 실행됨): `mapfile` 금지, `local status` 금지, 비인용 변수 단어 분할 의존 금지, 매칭 안 될 수 있는 glob에 `ls` 금지, `grep -E`에서 PCRE lookahead 금지. 정규식은 마크다운 표가 아니라 코드 펜스에(표 안 `\|` 이스케이프가 alternation을 깨뜨림) — [로컬 ASTRA BP §13.4–13.5](/Users/zeans/.claude/plugins/cache/astra/astra-methodology/5.25.0/docs/development/skill-best-practices.md)
- 보안: "Use Skills only from trusted sources … a malicious Skill can direct Claude to invoke tools or execute code in ways that don't match the Skill's stated purpose." — [Platform Overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview); "Claude Code applies a project skill's `allowed-tools` even in a `-p` run in a folder you've never trusted. … review the `allowed-tools` of skills checked into a repository before you run Claude Code there." — [CC Skills](https://code.claude.com/docs/en/skills); "skills must not contain malware … A skill's contents should not surprise the user in their intent if described." — [로컬 skill-creator SKILL.md 111–113행](/Users/zeans/.claude/skills/synced/3ea6c425-1fea-414c-a306-24c44ce542dd_eecf7410-7280-4631-814c-696a1f9e6cd7/skill-creator/SKILL.md)

### Inferences
- 공식 안티패턴 대부분은 grep으로 기계 검사가 가능하다(백슬래시 경로, 날짜 조건문, 1인칭, 참조 파일 안의 `](references/` 링크, 비한정 MCP 도구명, 500줄 초과). ASTRA skill-lint가 이미 이 방식으로 구현돼 있으나 `allowed-tools` 필수(8번)와 언어 정책(2번)은 공식 근거가 없는 로컬 규칙이다.
- "description 워크플로 요약"과 "kitchen-sink 스킬"은 기계 검사가 어렵다. 트리거 eval(near-miss 음성 쿼리)과 실행 추적 관찰로 잡아야 한다.

### Gaps
- 안티패턴별 실패율·영향 크기를 정량화한 공식 자료는 없다.
- `ServerName:tool_name` 형식이 Claude Code 플러그인 MCP 도구(`mcp__plugin_<plugin>_<server>__<tool>` 형태)에도 그대로 권장되는지는 플랫폼 문서와 Claude Code 문서 어디에도 명시가 없다.
