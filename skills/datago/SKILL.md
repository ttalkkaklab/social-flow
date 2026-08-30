---
name: datago
description: >
  Searches data.go.kr for official Korean government datasets and files. Use when the user
  asks to "공공데이터 찾아줘", "공공데이터포털 검색", "정부 데이터로", "data.go.kr 에서", "공공 API", "파일데이터 받아줘",
  "find public data", or when storyboard research needs government statistics as content
  seeds. Searches OpenAPI and file datasets with the datago tools, pulls file originals
  (no auth) or API rows (auth key plus a per-API approval that takes time), and records
  what it finds as sourced research seeds.
argument-hint: "<search topic> [channel]"
allowed-tools: ["Read", "Write", "Edit", "Glob", "Bash", "AskUserQuestion", "WebFetch", "WebSearch", "mcp__social-flow__datago_search", "mcp__social-flow__datago_detail", "mcp__social-flow__datago_file_download", "mcp__social-flow__datago_file_fetch", "mcp__social-flow__datago_api_call", "mcp__social-flow__naver_search"]
---

# Public data research — data.go.kr as a content seed

Find and collect **open APIs and file datasets** related to a topic on the Korea
open-data portal (data.go.kr), **and record them as sourced research seeds**.
Source data from government and public bodies is itself a primary source — for the
same number, prefer the original dataset over a news article requoting it (it also
lightens the cross-check burden: 1 primary source = settled, 2 articles = cross-checked).

## Tool map

| Tool | Auth | Use |
|---|---|---|
| `datago_search` | none | find datasets by keyword (API and FILE at once) |
| `datago_detail` | none | get the collection path and metadata (last-modified, license scope) |
| `datago_file_download` | none | download the file original (CSV, etc.) — **the fastest route** |
| `datago_file_fetch` | key + 활용신청 (usage application) | page through large file datasets row by row (odcloud) |
| `datago_api_call` | key + 활용신청 (usage application) | call a standard open API (live and query-conditional data) |

The auth key is injected as `DATA_GO_KR_API_KEY` (project `.claude/settings.local.json`).
Even with a key, a **per-API 활용신청** (usage application on the portal — log in;
most are auto-approved) has to come first — see §4 below.

## Procedure

### 1. Search — find the datasets

Search a keyword with `datago_search` (the arguments match the other search tools —
`query`, `limit`, `page`). Tips:

- On the first search, omit type (API and FILE together) — read the totals to see
  the shape of the data.
- Start with a short keyword ("환율" / exchange rate → 82 hits); if that doesn't
  narrow, add the agency name or a more specific term ("한국은행 기준금리" / Bank of
  Korea base rate). Don't churn through query variations that aren't the research subject.
- Selection criteria: **recently modified** (an old one-off dataset carries staleness
  risk), and a provider that actually owns the subject.

### 2. Detail — check the collection path and staleness

Call `datago_detail` with a candidate dataset's `publicDataPk` + `type`.
Always read:

- **Last-modified date and update cycle** — "수시 (1회성 데이터)" ("as needed
  (one-off data)") means the data's own reference date can be old (e.g. a DB
  collected in 2017). Unsuitable for time-sensitive topics.
- **License scope (이용허락범위)** — confirm "제한 없음" ("no restrictions"). If
  there are restrictions, report to the user and let them decide.
- FILE → `publicDataDetailPk` (uddi); API → `requestUrls` / `docs` (the usage guide).

### 3. Collection

**FILE (the default route)** — get the original with `datago_file_download`:

- `saveDir` is `data/<channel>/episodes/<topic>/storyboard/` when working on a topic,
  or the absolute path `docs/research/<YYYY-MM-DD>-<slug>/` for standalone research.
- If the response's `encoding` is `euc-kr`, convert before reading:
  `iconv -f euc-kr -t utf-8 <file> > <file>.utf8.csv`
- For tens of MB, or when you need only some rows, paging with `datago_file_fetch`
  (needs the usage application) is better.

**API (live and query-conditional)** — check the parameter contract **first**, then call:

- `datago_detail`'s `requestUrls` is the path; the parameters are in `docs` (the
  usage guide document, hwp/docx — when WebFetch can't read it, fetch it with curl
  regardless of the datago_file_download format and convert, or WebFetch the detailUrl).
- Don't call repeatedly while guessing parameters — the daily traffic (usually 1,000
  calls) burns out.

### 4. The 활용신청 gate (manual — guide the user)

When `datago_file_fetch` / `datago_api_call` returns "등록되지 않은 인증키"
("unregistered auth key", -4) or "인증 거부" ("auth denied"), it's usually **not the
key but a missing 활용신청** (usage application). Walk the user through it:

1. Log in to the portal → the dataset's detail page (`detailUrl`) → the **활용신청**
   ("apply for use") button
2. Most are auto-approved (instantly). Retry the same call after approval.
3. If it still fails, check that the key under 마이페이지 > 개인 API 인증키
   (My Page > personal API auth key) matches `DATA_GO_KR_API_KEY`.

If the application can't be waited on, route FILE around it with
`datago_file_download` (no auth).

### 5. Record the seed — the source contract

Record what you collected in the research document (`research.md` while working on a
storyboard, or `docs/research/<YYYY-MM-DD>-<slug>/public-data.md` for standalone research):

```markdown
| Claim/number | Source data | Data reference date | Source |
|---|---|---|---|
| 34 marinas nationwide | 해양수산부_전국 마리나 현황 (34 rows) | modified 2025-11-12 | [data.go.kr](https://www.data.go.kr/data/15152090/fileData.do) |
```

- Cite as **agency name_dataset name + data reference date + detail URL** — so the
  content can quote it as "Ministry of Oceans and Fisheries public data (2025)".
- **The data reference date may not be the last-modified date** — check the actual
  reference point from the file contents (a year column, the filename) and record
  that. Describing data collected in 2017 as "current" is a distortion.
- When processing numbers, the principle matches the storyboard skill: a range stays
  a range, and rounding never changes the meaning.

## Traps

- **Don't be fooled by the last-modified date** — the portal's modified date is when
  the metadata was updated. A dataset of "5,003 total rows / collected in 2017" can
  show modified 2025 (a case measured in practice: 해양관광레저정보DB, the marine
  tourism and leisure information DB).
- **EUC-KR files** — ignore the response's encodingNote and Read it directly and the
  Korean comes out mangled in your quote. Convert with iconv, then read.
- **Traffic is finite** — api_call has a per-API daily limit. Don't repeat the same
  query; when the response is large, trim it with numOfRows-style parameters.
- **Search and detail keep returning 0 hits or failing to parse** — a portal redesign
  may have broken the server's HTML parser. Keep the research going by checking the
  detailUrl directly with WebFetch, but report to the user that the server
  (`server/src/datago-client.ts`) needs fixing.
- **License-restricted data** — if it isn't "제한 없음" ("no restrictions"), get the
  user's confirmation before quoting it in commercial content.
