---
name: datago
description: >
  This skill should be used when the user asks to "공공데이터 찾아줘", "공공데이터포털 검색",
  "정부 데이터로", "data.go.kr 에서", "공공 API", "파일데이터 받아줘", "find public data",
  or when storyboard research needs official government statistics/datasets as content
  seeds. Searches data.go.kr datasets (OpenAPI + file data) with the datago_* tools,
  collects file originals (no auth) or API rows (auth key + per-API approval), and
  records them as sourced research seeds for content creation.
argument-hint: "<검색 주제> [채널]"
allowed-tools: ["Read", "Write", "Edit", "Glob", "Bash", "AskUserQuestion", "WebFetch", "WebSearch", "mcp__social-flow__datago_search", "mcp__social-flow__datago_detail", "mcp__social-flow__datago_file_download", "mcp__social-flow__datago_file_fetch", "mcp__social-flow__datago_api_call", "mcp__social-flow__naver_search"]
---

# 공공데이터 조사 — data.go.kr 을 콘텐츠 시드로

공공데이터포털에서 주제 관련 **오픈API·파일데이터를 찾아 수집하고, 출처가 달린
조사 시드로 기록**한다. 정부·공공기관 원천 데이터는 그 자체가 1차 출처다 —
같은 수치라면 기사 재인용보다 원천 데이터셋을 우선한다(교차검증 부담도 준다:
원천 1개 = 확정, 기사 2개 = 교차검증).

## 툴 지도

| 툴 | 인증 | 용도 |
|---|---|---|
| `datago_search` | 불필요 | 키워드로 데이터셋 발굴 (API·FILE 동시) |
| `datago_detail` | 불필요 | 수집 경로·메타(수정일·이용허락범위) 확보 |
| `datago_file_download` | 불필요 | 파일 원본(CSV 등) 다운로드 — **가장 빠른 경로** |
| `datago_file_fetch` | 키+활용신청 | 대용량 파일데이터를 행 단위로만 조회 (odcloud) |
| `datago_api_call` | 키+활용신청 | 표준 오픈API 호출 (실시간·조건조회형 데이터) |

인증키는 `DATA_GO_KR_API_KEY`(프로젝트 `.claude/settings.local.json`)로 주입된다.
키가 있어도 **API 별 활용신청**(포털 로그인, 대부분 자동승인)이 선행돼야 한다 —
아래 §4 참조.

## 절차

### 1. 검색 — 데이터셋 발굴

`datago_search` 로 주제어를 검색한다. 요령:

- 첫 검색은 type 생략(API·FILE 동시) — totals 로 데이터 지형을 파악한다.
- 검색어는 짧은 주제어부터("환율" → 82건), 안 좁혀지면 기관명·세부어를 병기
  ("한국은행 기준금리"). 조사 대상이 아닌 검색어 반복 변주는 금지.
- 후보 선정 기준: **수정일이 최근**이고(오래된 1회성 데이터는 시효 주의),
  제공기관이 주제의 소관 기관인 것.

### 2. 상세 — 수집 경로와 시효 확인

후보 데이터셋의 `publicDataPk`+`type` 으로 `datago_detail` 을 호출한다.
반드시 읽을 것:

- **수정일·업데이트 주기** — "수시 (1회성 데이터)" 면 데이터 기준일이 오래일 수
  있다(예: 2017년 수집 DB). 시효성 주제엔 부적합.
- **이용허락범위** — "제한 없음" 확인. 제한이 있으면 사용자에게 보고 후 판단.
- FILE → `publicDataDetailPk`(uddi), API → `requestUrls`/`docs`(활용가이드).

### 3. 수집

**FILE (기본 경로)** — `datago_file_download` 로 원본을 받는다:

- `saveDir` 는 주제 작업 중이면 `data/<채널>/<주제>/storyboard/`, 단독
  조사면 `docs/research/<YYYY-MM-DD>-<slug>/` 절대 경로.
- 응답 `encoding` 이 `euc-kr` 이면 Read 전에 변환:
  `iconv -f euc-kr -t utf-8 <파일> > <파일>.utf8.csv`
- 수십 MB 급이거나 일부 행만 필요하면 `datago_file_fetch`(활용신청 필요)로
  페이지 조회가 낫다.

**API (실시간·조건조회형)** — 파라미터 계약을 **먼저** 확인하고 호출한다:

- `datago_detail` 의 `requestUrls` 가 경로, 파라미터는 `docs`(활용가이드 문서,
  hwp/docx — WebFetch 불가면 datago_file_download 형식과 무관하게 curl 로 받아
  변환하거나 detailUrl 을 WebFetch)에서 확인.
- 파라미터 추측으로 반복 호출 금지 — 일일 트래픽(대개 1,000회)이 소진된다.

### 4. 활용신청 게이트 (수동 — 사용자 안내)

`datago_file_fetch`/`datago_api_call` 이 "등록되지 않은 인증키"(-4)·"인증 거부"를
반환하면 **키 문제가 아니라 활용신청 누락**이 대부분이다. 사용자에게 안내한다:

1. 포털 로그인 → 해당 데이터셋 상세(`detailUrl`) → **활용신청** 버튼
2. 대부분 자동승인(즉시). 승인 후 같은 호출 재시도.
3. 그래도 실패하면 마이페이지 > 개인 API 인증키의 키와 `DATA_GO_KR_API_KEY`
   일치 확인.

활용신청을 기다릴 수 없으면 FILE 은 `datago_file_download`(무인증)로 우회한다.

### 5. 시드 기록 — 출처 계약

수집 결과를 조사 문서에 기록한다 (storyboard 작업 중이면 `research.md`, 단독
조사면 `docs/research/<YYYY-MM-DD>-<slug>/public-data.md`):

```markdown
| 주장/수치 | 근거 데이터 | 데이터 기준일 | 출처 |
|---|---|---|---|
| 전국 마리나 34개소 | 해양수산부_전국 마리나 현황 (행 34) | 수정일 2025-11-12 | [data.go.kr](https://www.data.go.kr/data/15152090/fileData.do) |
```

- 출처 표기는 **기관명_데이터셋명 + 데이터 기준일 + 상세 URL** — 콘텐츠에서
  "해양수산부 공공데이터(2025)" 처럼 인용할 수 있게.
- **데이터 기준일 ≠ 수정일일 수 있다** — 파일 내용(연도 컬럼·파일명)에서 실제
  기준 시점을 확인해 기록한다. 2017년 수집 데이터를 "현재" 로 서술하면 왜곡.
- 수치 가공 시 원칙은 스토리보드 스킬과 동일: 범위는 범위로, 반올림으로 의미를
  바꾸지 않는다.

## 함정

- **수정일에 속지 말 것** — 포털 수정일은 메타데이터 갱신일이다. "전체 행 5,003 /
  2017년 수집" 데이터가 수정일 2025 로 보일 수 있다(실측 사례: 해양관광레저정보DB).
- **EUC-KR 파일** — 응답의 encodingNote 를 무시하고 바로 Read 하면 한글이 깨진
  채 인용된다. iconv 변환 후 읽는다.
- **트래픽은 유한** — api_call 은 API 별 일일 한도가 있다. 같은 조회 반복 금지,
  응답이 크면 numOfRows 류 파라미터로 줄인다.
- **검색·상세가 계속 0건/파싱 실패** — 포털 개편으로 서버 HTML 파서가 깨졌을 수
  있다. detailUrl 을 WebFetch 로 직접 확인해 조사는 계속하되, 서버
  (`server/src/datago-client.ts`) 수정 필요를 사용자에게 보고한다.
- **이용허락범위 제한 데이터** — "제한 없음" 이 아니면 상업적 콘텐츠 인용 전
  사용자 확인을 받는다.
