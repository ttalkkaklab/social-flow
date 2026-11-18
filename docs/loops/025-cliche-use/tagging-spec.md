# Tagging spec — Korean drama cliché catalogue

The spec the 2026-11-18 tagging pass followed for `skills/storyboard/references/cliche-catalog.json`:
seven batches tagged against it, then read through and corrected by hand. Kept as the record of
how `layer`, `needs`, `genres`, `caution`, `quote` and `analysis` were assigned.

You tag entries of a researched catalogue of Korean drama clichés so that a story author can
find a cliché by **what job it does in a story**. Each input line is:

`#<id> | <group> | <name> | <one-line description> | 대표작: <example works>`

For every input line, output one JSON object (one per line, JSON Lines) with exactly these keys:

```json
{"id": 45, "en": "Mother-in-law with a cash envelope", "layer": "scene", "needs": ["obstacle", "outburst"], "genres": ["romance", "family"], "caution": null, "quote": false, "analysis": false}
```

## `en`
A short English name for the cliché, 2–7 words, plain and descriptive (not a translation of the
description). Use an established fan term when one exists ("Second lead syndrome", "Wrist grab",
"Back hug", "Truck of doom", "Contract marriage", "Birth secret", "Amnesia").

## `layer` — exactly one
| value | meaning |
|---|---|
| `character` | a character type or relationship archetype (who): 재벌 2세 남주, 악녀, 돈봉투 시어머니 as a *person type*, 서브남 |
| `device` | a plot-level setup or event that spans scenes (what happens): 출생의 비밀, 기억상실, 계약 결혼, 회귀, 신분 차이 연애, 복수 설계 |
| `scene` | how one moment is staged — an action, gesture or situation inside a single scene: 손목 잡기, 물 끼얹기, 뒷목 잡고 쓰러지기, 엿듣기, 우연한 부딪침 |
| `place` | a place, prop or everyday ritual that sets the situation: 포장마차, 찜질방, 옥탑방, 소주, 라면, 병실 |
| `line` | a line of dialogue or a verbal habit |
| `directing` | camera, editing or music treatment: 슬로모션, 회전 키스샷, 같은 장면 반복 편집 |
| `format` | episode structure, production practice or packaging: 16부작, 엔딩 클리프행어, n년 후 결말, PPL, 쪽대본 |

When an entry is both a character type and a scene (e.g. "돈봉투 시어머니" described as the
scene where she offers money), choose by the description: a person type → `character`, the act → `scene`.

## `needs` — 1 to 3 values, the most important first
The job the cliché does for a story. Choose from this closed list only:

| value | the job |
|---|---|
| `meet` | brings two people together for the first time, or forces first contact |
| `bind` | keeps people in the same space or relationship so they cannot walk away: contract, cohabitation, same workplace, locked in, shared secret task |
| `obstacle` | blocks the relationship or the goal from outside: class gap, family opposition, a rival, a rule, a corrupt superior |
| `secret` | creates an information gap — a secret, hidden identity, misunderstanding, overhearing: someone knows more than someone else |
| `reveal` | makes the secret come out or turns the situation over: evidence, a witness, a DNA test, a recording, a twist |
| `parting` | causes separation or loss: breakup, illness, accident, death, sacrifice, leaving |
| `reunion` | brings people back together or restores what was lost: reunion, reconciliation, memory or status regained |
| `closeness` | shows affection, care or growing intimacy through an act: piggyback, shared umbrella, nursing, cooking for someone |
| `outburst` | makes anger, shock or grief physical: a slap, thrown water, collapsing, wailing, kneeling |
| `status` | shows power, wealth, rank or professional standing at a glance |
| `payback` | delivers revenge, comeuppance or a reversal the viewer cheers for |
| `danger` | puts life, safety or position at risk: kidnapping, threat, chase, murder, infection, a medical crisis |
| `rule` | a genre premise or supernatural rule the story runs on: regression, possession, time slip, body swap, zombie rules, a grim reaper's job |
| `setting` | tells where and in what situation we are at once: a place, prop or ritual |
| `closing` | how an episode or story opens or closes: cold open, cliffhanger, freeze-frame ending, "n years later" epilogue |
| `relief` | releases tension or gets a laugh: comic sidekicks, slapstick, a silly misunderstanding |

Guidance:
- Tag the job, not the genre. "기억상실" is `secret` + `parting` (and `reunion` when the
  description is about memory returning). "어린 시절 인연" is `bind` + `reveal`.
- A character archetype gets the job that person does in a story: 돈봉투 시어머니 → `obstacle`;
  재벌 2세 남주 → `status`; 서브남 → `obstacle`; 악녀 → `obstacle`, `secret`; 감초 조연 → `relief`.
- A line gets the job of the moment it is said in.
- Production-practice entries (`analysis: true`) still get one closest value (usually `closing`
  or `setting`); it is ignored for them.

## `genres` — 1 to 3 values
Where the cliché typically appears: `romance`, `family` (가족극·막장·신파 melodrama), `sageuk`
(historical), `crime` (수사·범죄·스릴러), `legal`, `medical`, `office` (재벌·오피스·정치),
`revenge`, `school`, `fantasy` (판타지·회귀·빙의·타임슬립·몸 바뀜), `horror` (좀비·크리처·오컬트),
or `any` when it is genre-neutral. Use `any` alone, never with others.

## `caution` — `null`, `"coercion"` or `"violence"`
- `"coercion"`: physical contact or pursuit without consent staged as romance — 손목 잡아 끌기,
  강제 키스, 벽에 밀치기(벽치기), 문을 억지로 열고 들어가기, 차로 막아서기, 술 취한 상대에게 키스,
  스토킹처럼 따라다니기, 위력으로 누르는 구애. Korean critics (경향신문 2016), the broadcast
  regulator (방심위 2017) and overseas fans criticised exactly these.
- `"violence"`: graphic violence or sexual violence that drew regulator sanctions — 생매장, 성폭행
  묘사, 집단 폭행, 자극적인 고문 묘사, 청소년의 잔혹한 폭력 묘사.
- Ordinary melodrama staging is NOT flagged: a slap, thrown water, 김치 싸대기, kneeling,
  shouting, a car accident, an illness, a villain's scheme, bullying as a plot premise without
  graphic depiction in the description.
- When in doubt between `null` and a flag, read the description: flag only when the
  description itself names the coercive or graphic act.

## `quote` — boolean
`true` only when the entry is a line (or catchphrase) from a specific, named drama — the
description or 대표작 attributes the wording to that work ("얼마면 돼?" 가을동화). A stock line
with no single source ("내 눈에 흙이 들어가기 전엔 안 돼") is `false`. Non-line entries are `false`.

## `analysis` — boolean
`true` when the entry describes a production or industry practice, a broadcast format, a
viewing statistic or a critic's meta-observation rather than something that can appear inside
a story: 쪽대본, 생방송 촬영, PPL 관행, 16부작 편성, 연장 방송, 시청률 보고 대본 수정, 숏폼용 편집,
회차 수 변화, OST 음원 발매 관행. An ending or opening convention that a writer can actually
write (엔딩 클리프행어, "n년 후" 에필로그, 1화를 사건으로 시작) is `false`.

## Rules
- Output every input id exactly once, in input order. No extra keys, no comments.
- Do not change ids. Do not invent entries.
- Judge from the name and description given; do not look anything up on the web.
