# GenAI video through the gateway's common generation API

User directive, 2026-11-25, in the user's words: "GenAI 영상 어댑터를 게이트웨이 공통 스키마(/v1/generations)로
옮기고 다른 엔진과 같은 어댑터 구조로 정리. 적대 평가 95점 이상, P0 0개가 될 때까지 반복." It follows two
earlier requests in the same session: "무조건 이 경로로 호출하게 바꿔. 이전 경로로 호출하는거 절대 있으면
안되." (about `POST /v1/generations` `mode:"scene"`) and "genai 의 공통스키마를 사용하고 다른 모델들과
일관성 있는 구조로 개선해줘."

Classification: preset C (migration, behaviour preserved where the target keeps it), adjusted.
Test command: `cd server && HOME=$(mktemp -d) npm test` (with `npm run build` first).
Rubric frozen on 2026-11-25 after the user confirmed it. Round cap: 5, chosen by the user.
Exit: total score of at least 95 **and** zero P0 findings **and** a green test command.

## Target statement

Every ASTRA GenAI video request the plugin makes goes through the gateway's common generation
API: `POST /v1/generations`, `POST /v1/generations/validate`, `GET /v1/generations/{id}` and
`GET /v1/models`.

- A storyboard scene on the GenAI engine is sent as one `mode:"scene"` request. Its prompt names
  its inputs with `{id.role}` placeholders and the gateway numbers them. The plan is validated
  with `POST /v1/generations/validate` before approval, and its output contract comes from the
  frames the gateway resolved.
- Scene mode only (user's choice): a scene without a cast image also sends its opening image as
  an `object` reference; a scene saved on `ltx-2.5-22b-dev` or driven by a supplied soundtrack
  is refused at planning.
- The direct GenAI video tools (text-to-video, image-to-video, audio-to-video, MSR) and the live
  character's GenAI calls use the common modes `text2video`, `image2video`, `audio2video` and
  `msr`.
- No plugin source, skill script or `server/dist/bundle.js` calls the legacy routes
  `/v1/ltx/v2/text-to-video`, `/v1/ltx/v2/image-to-video`, `/v1/ltx/v2/audio-to-video`,
  `/v1/ltx/v2/scene-to-video` (with its sub-routes), `/v1/ltx/msr`, `/v1/ltx/msr/capabilities`
  or `/v1/ltx/v2/capabilities`.
- `sceneRendering:"per_shot"` and `shotBindings` are removed.
- The GenAI engine has the same shape as the other engines: the planner's engine-independent
  scene request, a registry adapter with its own schema, and one wire module for the provider.
- Money safety holds: running a plan again never submits a second job, a lost response is
  recovered without a second render, and the output is checked against the frames the gateway
  resolved.

Out of scope: the LTX Desktop engine (`/v1/ltx/desktop/*`), GenAI images and speech.

## Frozen rubric

| # | Criterion | Weight | Award rule | Evidence | P0 |
|---|---|---|---|---|---|
| 1 | Objective gate: `npm run build` succeeds, `cd server && HOME=$(mktemp -d) npm test` exits 0, and the rebuilt `server/dist` matches what is committed | 25 | All or nothing | Commands and exit codes, `git status` of `server/dist` | yes |
| 2 | No legacy route call: the route strings listed in the target occur in no call site in `server/src`, `skills` scripts or `server/dist/bundle.js` | 20 | All or nothing (grep count of call sites is 0) | grep pattern and count | yes |
| 3 | Target structure: each GenAI video adapter (text2video, image2video, audio2video, msr, scene, and the live character's use) builds a common-schema body and submits through one common client; storyboard scenes are validated with `/v1/generations/validate` at planning | 20 | 20 × conforming adapters / all GenAI video adapters, rounded down | file:line per adapter | yes |
| 4 | Money and recovery safety: (a) no second submission when a plan runs again, (b) a lost response recovered without a second render, (c) output checked against the resolved frames; each with code and a test | 15 | 15 × satisfied properties / 3, rounded down | code file:line and test file:line per property | yes |
| 5 | Real gateway evidence: a scene body built by the plugin passes the production `/v1/generations/validate` and the resolved prompt equals the plan's prompt with labels filled in | 5 | All or nothing | Transcript saved in this directory | no |
| 6 | Removed behaviour swept: `per_shot`, `shotBindings` and `scene-to-video` are gone from code, tests, skills, README and CLAUDE.md, superseded sentences deleted in place | 10 | 10 − 2 per leftover site, floor 0 | grep with file:line | no |
| 7 | Proportionate diff: tests follow one file per module, no unrelated edits, repository prose in English | 5 | All or nothing | `git diff --stat` and file review | no |

The weights sum to 100.
