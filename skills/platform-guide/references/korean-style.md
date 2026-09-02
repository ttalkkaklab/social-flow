# Korean style SoT — prose without AI tells

Applies to every piece of Korean text this plugin produces — narration, subtitles,
on-screen text, platform copy, titles, descriptions, reply copy. Platform grammar
(register, length, hashtags) is set by `platform-playbook.md`; the grain of the
sentences themselves is set by this document.

**The target is outgoing text.** Plugin-internal docs (SKILL.md, agent definitions,
README) are not gated. Instructions are actually more precise with contrast and
emphasis structures, so holding them to the same standard makes the rules fight
their own purpose. Checks run only on `output/` artifacts and `scenes.js` narration.

`check-style.py` delivers the verdict. This document holds the why behind each fix.

## Contents

- [Why the tells show](#why-the-tells-show)
- [Severity](#severity)
- [Patterns](#patterns)
  - [Translationese (T)](#translationese-t)
  - [AI stock phrases (D)](#ai-stock-phrases-d)
  - [D9 — written-register declarative endings (spoken surfaces only)](#d9-written-register-declarative-endings-spoken-surfaces-only)
  - [D10 — essay rhetoric on spoken surfaces](#d10-essay-rhetoric-on-spoken-surfaces)
  - [Structure and rhythm (C)](#structure-and-rhythm-c)
  - [Assistant voice (A)](#assistant-voice-a)
- [Per-surface application](#per-surface-application)
- [Out of scope (Do-NOT)](#out-of-scope-do-not)
- [Principles when fixing](#principles-when-fixing)
- [What this gate can't do (evidence grades)](#what-this-gate-cant-do-evidence-grades)
- [Using the checker](#using-the-checker)

## Why the tells show

An LLM doesn't think in Korean. It builds sentences in an internal representation
tilted toward English and renders them into Korean surface form at the last step. So
AI-written Korean is close to **a translation with no original** — which is why the
literal-translation traps translation studies has described for decades (passive
overuse, inanimate subjects, literal pronouns, nominalization, stacked particles)
reproduce exactly.

On top of that comes the assistant voice. Polite hedges, unasked-for balance,
listing three where one would do — a good share of the signals people use to spot
AI prose come from here.

The cost is highest in short-form. Viewers decide within 3 seconds whether to
scroll. One translationese sentence and they think "ah, an ad" and swipe on.

## Severity

- **S1** — one occurrence is a tell. Remove unconditionally.
- **S2** — once or twice is fine; repetition is a tell. Judged by density.
- **S3** — not a problem on its own; counted only when it overlaps other patterns.

## Patterns

### Translationese (T)

| ID | Pattern | How to fix | Severity |
|---|---|---|---|
| T1 | ~에 대해(서)·~에 대한 | Object particle directly — "제도에 대해 알아보자" → "제도를 알아보자" | S1 |
| T2 | ~에 있어서 | "~에서" or "~할 때" | S1 |
| T3 | Double passive (되어지다·보여지다·잊혀지다·쓰여지다, incl. the endings "보여집니다"·"보여질") | Simple passive — "판단되어진다" → "판단한다" | S1 |
| T4 | ~을 가지고 있다 | Use a verb — "강점을 가지고 있다" → "강점이 있다" | S1 |
| T5 | ~에 의해 + passive (되·된·됐·됩·진·받) | Make it active — "법에 의해 정해진다" → "법이 정한다" | S2 |
| T6 | Double particle (에서의·으로의·에의·로부터의) | Unpack into a clause — "현지에서의 생활" → "현지 생활" | S2 |
| T7 | ~를 통해 repeated | From the third occurrence, spread some into "~로"·"~해서" | S2 |
| T8 | ~라는 점에서 repeated | "~라서"·"~니까" | S2 |
| T9 | Personal pronoun density (그·그녀·그들) | Drop them, or use a name/title | S3 |
| T10 | ~을 필요로 하다 | "~이 필요하다" — "검토를 필요로 한다" → "검토가 필요하다" | S1 |
| T11 | Unnecessary causative -시키다 (개선·소개·금지·실현·완성) | "-하다" — "개선시킬" → "개선할" | S2 |
| T12 | Agentless passive ~이 요구된다 (endings only) | Say who must do what — "주의가 요구됩니다" → "주의해야 합니다" | S2 |
| T13 | Inanimate subject + active verb (결과·수치·통계 "말해 준다") | Use "~에서 알 수 있다" | S3 |

T10~T13 are the unimplemented items that the 2026-08-14 deep research found in the
correction pairs of the National Institute of Korean Language's 「한눈에 알아보는
공공언어 바로 쓰기(개정판)」 (2022). **Their evidence grade differs from T1~T9** —
normative grounds, not corpus measurement, so severity is set only as far as each
can discriminate (see "What this gate can't do" below). When citing, read the
**attached PDF**, not the `etc_seq=699` page — the page HTML carries no rule text,
so opening only the URL misjudges the citation as fabricated.

T11 is not a suffix rule but an **enumeration of five stems**. `-시키다` is far more
often a legitimate causative ("아이를 등록시키다"·"차를 정지시키다"), so catching
the suffix leaks wholesale. Before extending, check for an intransitive use —
증가·감소·향상 have intransitives ("매출이 증가하다"), so "증가시키다" is a
legitimate causative.

T12 and T13 check endings only. Adnominals ("요구되는 서류"·"자료가 말해 주는 것"),
conditionals and connectives ("요구된다면"·"말해 준다고 한다"), and **adnominal
clauses ("요구된다는 지적"·"말해 준다는 점")** are not targets. `~다는` can never
end a sentence in Korean — it always modifies the following noun. This branch was
missing from the guard, and normal news phrasing got penalized (2026-08-14 code
review). Pin false-positive fixtures by **banned ID**, not exit — one S2 is 93
points and one S3 is 98, both exit 0, and this false positive passed the self-test
through exactly that hole.

T7 and T9 false-positive often. Native speakers use "~를 통해" twice as much as
translations do, and in home-grown Korean people actually use "그는" more. They're
caught only on repetition — T7 and T9 count from the third occurrence, T8, D4, and
D6 from the second.

T2 catches only the "~에 있어서" form. Existence verbs like "가방에 있어" are not
targets.

### AI stock phrases (D)

| ID | Pattern | How to fix | Severity |
|---|---|---|---|
| D1 | 결론적으로(론)·궁극적으로(론)·본질적으로(는)·요컨대 | Delete. Say the answer in the first sentence | S1 |
| D2 | 시사하는 바가 크다·주목된다·주목받는 **변화/대목/흐름** (only before abstract nouns — "주목받는 기업" is factual reporting) | Replace with what and why, or delete | S1 |
| D3 | ~할 필요(성이) 있다·~하는 것이 중요하다·~하셔야 할 것이다·명심해야 | Delete the lecture — "확인할 필요가 있다" → "확인하자" | S1 |
| D3b | ~야 할 것이다 (without the honorific) | If it tells others what to do, "지키자". If it's a forecast, leave it | S2 |
| D4 | ~라고 할 수 있다·~로 보여진다·~인 셈이다 | If you can state it flat, state it flat | S2 |
| D5 | 혁신적인·획기적인·새로운 지평·게임체인저 | Delete. Emphasize with numbers, not modifiers | S2 |
| D6 | Empty modifiers (매우·굉장히·효과적으로·원활하게·다양한·성공적으로) | Delete | S2 |
| D7 | Hollow rhetoric ("물결 속에서"·"균형점을 찾아가는"·"답은 간단합니다") | Replace with concrete facts and numbers, or delete | S2 |
| D8 | Report-register stative verb endings — 나뉩니다/나뉜다·갈립니다/갈린다/갈려요·남습니다/남는다·**남긴다/남깁니다** | Make the target the subject, concretely — "추천이 갈려요" → "미용실마다 다른 색을 권해요", "둘로 나뉩니다" → "두 갈래예요", "근거를 남긴다" → "근거를 적어 둔다" | S1 |
| D9 | **Written-register declarative ending `-ㄴ다/-는다`** (spoken surfaces only) — "화면이 나온다"·"주소부터 준다"·"이렇게 친다" | Casual spoken form — "화면이 나와"·"주소부터 줘"·"이렇게 쳐" | S1 |
| D9b | Diary-style past ending `-았다/었다/였다/했다` (spoken surfaces only) | "만들었다" → "만들었어". One is tolerated (from the second) | S2 |
| D10 | **Sentence closed on a bare noun** — "~해냈을 리 없다는 것." · "~을 물은 것." (spoken surfaces only) | Finish the sentence with a verb — say who did what | S1 |
| D10b | Stock reveal or drama line — 결과는 정반대였다·(근거/이유/답/설명/방법)은 하나였다·시간이 많지 않다·놀랍게도·여기서 반전 | State the fact itself — what was measured, what is left, what happens next | S2 |
| D10c | A→B reframe or an abstract subject that changes things — "X에서 Y로 바꿔 놓았다"·"측정이 ~를 바꿔 놓았다"·"이 발견이 ~를 만들었다" | Name the person and the verb — who measured, what they found | S2 |
| D10d | Essay wrap-up ending — "~한 셈입니다"·"~인 셈이죠" | Say the thing instead of summing it up | S2 |

D8 is a user directive (2026-08-12 — "don't use AI-sounding phrasings like
나뉩니다·갈려요·남습니다", expanded the same day with "never use 남긴다·갈린다·나뉜다
either"). The target is the report-recital register that wraps a phenomenon up in a
single verb and stops.

**Why catch 남기다 when it's transitive** — same grain. "근거를 남긴다"·"기록을
남긴다" pretend to describe an action while actually closing the sentence as a
status report. People say "적어 둔다"·"메모해 둔다". Only the present formal forms
(남긴다·남깁니다) are targets, not colloquial past or imperatives.

**What is and isn't caught** (measured):

- Caught — endings ("둘로 나뉩니다."·"로그에 남긴다.") · **quotes and reported
  speech** ("갈린다는 게 문제야"·"남는다고 했다"). Quotes are caught to block the
  bypass of keeping the same recital register while avoiding the ending. The user
  directive said "never", so it wasn't loosened.
- Not caught — adnominals ("갈리는 이유" — headline phrasing) · conditionals
  ("나뉜다면") · colloquial past and imperatives ("후기 남겼어"·"메모 남겨 둬"·
  "3일 남았어요") · **'헷갈리다'** ("헷갈렸어요" — an everyday word. The '갈-' stems
  are caught only word-initially or as '엇갈-'; a false positive found while porting
  to fect-persona).

This rule applies **not just to content copy but to our own responses, skill docs,
and commit messages** (user directive). The full plugin-doc cleanup happened on
2026-08-12.

### D9 — written-register declarative endings (spoken surfaces only)

A user directive (2026-08-13): *"화면이 나온다. 주소부터 준다. 이렇게 친다. →
이런식의 말투는 사람이 쓰는 말투가 아니잖아."* (that's not how a person talks.)

`-ㄴ다/-는다` is **the ending of expository prose, editorials, news articles, and
papers** (National Institute of Korean Language). It's the register of writing for
an unspecified audience, and doesn't even carry the lowering meaning. The contrast
the Namuwiki entry on written style draws is exactly this — spoken casual is
"반갑다고 했어", written style is "반가움을 표하였다". Nobody says "요즘은 주소부터
준다" to the colleague next to them. They say "요즘은 주소부터 줘".

**How it differs from D8.** D8 blocks the report-register endings of specific verbs
(나뉘다·갈리다·남다) by vocabulary. D9 looks at **the closing register itself** —
whatever the vocabulary, closing in written style on a spoken surface is caught.
When this rule went in, a logo post we had already published dropped to 4 S1s (that
post had passed the gate at 94 under the old rules).

**How it discriminates.** Caught only when the preceding syllable's final consonant
is ㄴ (index 4). `-ㄴ다/-는다` is an **ending that attaches to verbs only** (it's
the very test for telling adjectives apart), so the false-positive surface is small.
Adjective base forms (편하다·다르다·같다) and `-이다` have a different final
consonant and drop out automatically. Sentence-final only — connectives ("간다고
했어"), adnominals ("가는 길"), and conditionals ("간다면") are not targets.

**D9b (past) is S2 with the first hit exempt.** S2 costs 7 points, so just two
sentences closed with `-았다` hit 86 and miss the 90 gate. What the user flagged was
present-tense procedural prose, and people do write "~했다" on Threads. The
arithmetic was known when this was set.

**Surfaces are scoped — it doesn't apply to docs or narration.** This document,
skill docs, and code comments are all written in `-ㄴ다`. That register is right for
them. D9 looks only at **surfaces where a person speaks aloud** (threads·reply) and
captions (ig·fb). Narration is dialogue bound to the 8~25-char schema and channels
have places for plain-register statements; subtitles and cards are fragments, not
sentences; and yt titles are headline register, where `-ㄴ다` is normal phrasing.

Sources: [문어체 — 나무위키](https://namu.wiki/w/%EB%AC%B8%EC%96%B4%EC%B2%B4) ·
[구어체 잘 쓰는 방법](https://brancos.co.kr/how-to-write-colloquially/) ·
[국립국어원 온라인가나다 — '-ㄴ다' 는 무슨 체인가](https://m.korean.go.kr/front/onlineQna/onlineQnaView.do?mn_id=216&qna_seq=312324) ·
[한국어 해라체 종결어미 '-다, -ㄴ다'의 구어 사용 양상 연구 (KCI)](https://www.kci.go.kr/kciportal/ci/sereArticleSearch/ciSereArtiView.kci?sereArticleSearchBean.artiId=ART002093543)

### D10 — essay rhetoric on spoken surfaces

A user directive (2026-09-03): a 44-sentence narration had passed the narration read at 99,
copy at 92 and lexicon at 96, and the owner still read it as machine prose — *"어휘 검증한
거 맞나? AI 스러운 말투가 많이 보이는데"*. What the three reads let through was not a word.
It was the **shape of the sentence**: a sentence that stops on a noun ("해냈을 리 없다는
것."), a reveal announced instead of shown ("결과는 정반대였습니다"), an abstract subject
that rewrites the world in one verb ("성분을 잰 것이 A 에서 B 로 바꿔 놓았습니다"), and the
wrap-up that sums the story up for the listener ("돌에 적어 둔 셈입니다"). Twelve of the 44
sentences carried one of these; the lexicon read had noted one of them as "the writer's
flourish" and passed it.

**Why they read as machine prose.** Each is an essay device: it organises the listener's
understanding from above instead of telling them what happened. A person explaining the
same thing at the next desk says who found what and lets the listener draw the line. The
family stays narrow and enumerated (evidence grade: user directive plus one measured board,
same grade as D8·D9), so each rule catches one shape and nothing adjacent:

- **D10 (S1)** catches only a sentence-final `것` — `것이다`·`것입니다`·`것 같아요` end on
  a different syllable and drop out; a `것` inside the sentence is never a target.
- **D10b (S2)** is a short list. `하나뿐` on its own is everyday speech ("남은 건 하나뿐이야")
  and stays clear; only the `(근거|이유|답|설명|방법)은 하나` frame fires.
- **D10c (S2)** fires on `에서 … 로` followed by a change verb (바꿔 놓다·탈바꿈·다시 쓰다),
  and on an abstract subject (것·측정·결과·연구·발견·사실·기술·데이터·숫자·분석·조사) followed
  by 바꾸다·만들다·이끌다·가져오다·증명하다. A place-to-place move ("서울에서 부산으로
  옮겼어요") is not a target. T13 keeps its narrower `말해 준다` branch at S3.
- **D10d (S2)** is the polite spoken form of D4's `~인 셈이다`, and fires from the first hit.

**What the machine cannot see, and the reviewer must.** The same directive named three
more shapes that no regex can split from normal speech: a **figurative device used more
than twice** in one episode ("돌한테 묻다" three times), the **antithesis reprised as the
episode's spine** ("지었을 리 없다던 → 골라 가며 지은" four times), and the **essay frame**
`X은 ~였는데요` ("더 어려운 물음은 ~였는데요"). These sit in storyboard-reviewer copy mode
P0-2 as named patterns. The reviewer describes the shape it found; it never supplies a
corrected sentence (the structure of an example sentence leaks into the rewrite).

**Surfaces.** Spoken surfaces only — narration·threads·ig·fb·reply. Subtitles and screen
text are fragments and yt titles are headline register, so the whole family is off there.

### Structure and rhythm (C)

| ID | Pattern | How to fix | Severity |
|---|---|---|---|
| C1 | Comma after a connective ending — "발전하지만, 대응은 느리다" · "많은데, 시간이 없다" | Drop the comma. The cheapest, strongest signal in Korean AI detection | S1 |
| C2 | Negation parallelism "A가 아니라 B다" | Just write B. The strongest measured signal, 9x versus humans | S2 |
| C3 | Triple listing — coordinated predicates ("빠르고 간편하며 안전한") | Three only when there really are three. Usually one is enough. Noun lists ("여권, 비자, 계약서") aren't targets | S2 |
| C4 | Emoji | Per-surface limits (table below) | S1~S2 |
| C5 | Same sentence ending 4 in a row | Mix the endings. 3 in a row is normal register for polite explanatory prose | S2 |
| C6 | Mechanical three-step ("먼저 ~ 다음으로 ~ 마지막으로") | Only when the order truly matters | S2 |
| C7 | No long sentence — 5+ sentences with the longest under 23 chars | Run at least one sentence long. If the piece is chopped into a list, rethink the material and hook first | S2 |

**C1 note — the `데,` branch can't be caught by enumeration.** `-은데`/`-ㄴ데`
attaches to any stem (많은데·비싼데·어딘데·예쁜데·싶긴 한데), so growing the list
keeps leaking. Instead `<hangul>데,` is matched broadly and split into ending vs.
noun by **whether the preceding syllable has a final consonant** — connective
endings always end on a syllable with one, and the bound noun '데' (갈 데, 잘 데)
is written with a space. `한데` is a conjunctive adverb (= 그런데) only
sentence-initially, so it's split by position. Verified 10/10 with 0 false
positives (2026-08-11 — a reviewer found this whole branch leaking in publish copy).

**`-고,` is not in the rules (rejected, 2026-08-11).** There are clearly cases
where it's a connective ending, as in "적었고,", but catching `고,` false-positives
**6/6 on nouns** (보고·사고·참고·광고·예고·경고 + comma). The final-consonant split
used for `데,` doesn't work here either — "보고" genuinely overlaps between noun
and stem+ending. With no axis to split on inside the sentence, the rule isn't
extended and **a human looks instead** (rejecting what can't be discriminated
blocks normal sentences — same spirit as §"When the evidence sits outside the
sentence, lower the severity" below).

**C7 note — the axis is the longest sentence, not variance.** "Uniform length =
machine tell" was rejected by channel measurement (9 Threads posts). The
best-performing post was actually more uniform (cv 0.13, range 9), and only the
post whose same-age reach lagged 2.6x had a longest sentence of 21 chars. The other
8 were all 25+. Same direction as the user style guide's "the real defect of AI
prose is the absence of long sentences, not uniformity" (contrast corpus: long
sentences per 1000, AI 8.1 vs. human 91.3). 9 samples with 4 chars of margin is
thin evidence, so it doesn't block (S1) — raising it to the author's eyes is as far
as this rule goes.

### Assistant voice (A)

| ID | Pattern | How to fix | Severity |
|---|---|---|---|
| A1 | Tour-guide opener ("함께 알아볼까요?"·"살펴보시죠"·"알아봅시다"·"오늘은 ~에 대해") | Get to the point | S1 |
| A2 | Closing pleasantry ("도움이 되셨길"·"도움 되셨나요?"·"참고 부탁드립니다"·"읽어 주셔서 감사합니다") | Delete | S1 |
| A3 | Unasked-for balance ("물론 ~도 있지만"·"양쪽 모두 일리가") | Pick a side or delete | S2 |
| A4 | Greeting opener / channel promo ("안녕하세요"·"전해 드립니다"·"구독과 좋아요") | Get to the point. The outro handles channel identity | S1 |

C2 promotes to S1 when it appears twice or more in one piece. Once is S2.

A2 catches only the pleasantry that closes content. A short thank-you in a reply
("알려주셔서 감사합니다") is the engagement playbook principle 4 requires, so it's
not a target.

## Per-surface application

Apply the same rules identically to every surface and they fight platform grammar.
Threads casual spoken register is the register the playbook demands, not an AI tell.

| Surface | Emoji | Sentence length | Rules off | Notes |
|---|---|---|---|---|
| `narration` | 0 | 8~25 chars (schema) | C7·D9·D9b | Heard aloud — all rules at full priority. Schema binds length, so C7 is off |
| `subtitle` | 0 | ≤30 chars | C3·C5·C6·C7·D9·D9b·D10~D10d | Burned-in subtitles. `sub` differs from `tts` in spelling, so checked separately |
| `screen` | 0 | unlimited | C1·C3·C5·C6·C7·T9·D9·D9b·D10~D10d | Card text (title/label fragments) — lexical tells only |
| `threads` | ≤1 | unlimited | C5 | Casual spoken endings are normal. Question endings encouraged. **D9 bites hardest here** |
| `ig` | ≤3 | unlimited | none | A D/A pattern in the first 125 chars kills the hook |
| `fb` | ≤2 | unlimited | C3·C6 | Structured posts and the case-collecting closer are playbook prescriptions |
| `yt` | ≤2 | unlimited | C1·C3·C5·C6·C7·T9·D9·D9b·D10~D10d | Titles are keyword-style — D/A only |
| `reply` | ≤1 | unlimited | C3·C5·C6·A4 | Comment replies. The opening greeting is golden-hour engagement, so A4 is off |

This table must hold the same values as `SURFACE_CFG` in `check-style.py`. Never
change one side alone.

## Out of scope (Do-NOT)

Hashtags, URLs, numbers/dates/units, proper nouns, Latin abbreviations (API, TTS,
SNS, etc.). The checker masks these automatically; these spans are neither detected
nor fixed.

**Direct quotes in double quotation marks are NOT masked.** They used to be, but
putting slop wholesale inside quotation marks turned a 0 score into 100 — a bypass
(measured). Backticks and code fences aren't masked in copy mode for the same
reason.

Instead the checker labels violations inside quote spans `quoted` and **excludes
them from the score.** Administrative source documents are written in translationese
to begin with, and fixing someone else's words is distortion.

**An exemption is not a pass — exit floors at 1 (warn).** The checker doesn't know
whether the source is real. Prefix the eight chars "출처: 안내문" and six S1s drop
out of the score (measured). So the fact that an exemption applied is itself raised
to a human: even at a score of 100, exit is 1, not 0; the output header carries
`· quote-exempt N` and a "[quote exemptions: N]" list follows. publish §1 copies
exit 1 verbatim into the approval prompt, so a human checks whether the quote is
real. 1 isn't a block, so legitimate quotes get published as-is.

**The exemption condition is whether the source is identified.** Within 60 chars
before or after the quote marks, **or in the last 40 chars of the line right
above**, one of the following must appear (people write the source at the end of
the line above, not to fit within 60 chars). When the whole previous line was open,
dropping one agency name at the head of a 160-char intro exempted the quote below
wholesale — cutting the range taken from the previous line **finite** is what
blocks it. The value 40 has nothing to do with that bypass (0 blocks it too). What
40 protects is the other direction: when the source sits on the previous line and
the quote is indented more than 60 chars into its own line, the 60-char window
can't reach the previous line, and the 40-char tail saves that legitimate quote
(roll it back to 0 and it's blocked at exit 2).

- a source URL attached to the quote
- "X에 따르면" · "X가 발표한" — forms that demand the source as their object
- document, statute, or agency names — 시행령·고시·공고·약관·보도자료·공안부·국세청 etc.
- everyday source names — 집주인·임대인·중개인·인사팀·고객센터·상담원
- the personal-source action form — "집주인이 보낸 문자" · "사장님이 준 안내" ·
  "담당자에게 받은 메일" (but when 보고·받고·읽고 follows, as in "친구가 보낸 문자를
  **보고** 알았습니다", it's how they found out rather than a relay, so it doesn't
  count as a marker. The ending alone can't split them — "받고 **그대로 옮깁니다**"
  has the same ending yet is a quote intro. A relaying verb (옮긴다·붙인다·인용한다·
  그대로·전문) within the next 20 chars makes it count as a marker)

**Personal sources are exempt too.** When only agency nouns were recognized, the
verbatim quote after "집주인이 보낸 문자는 이랬습니다" was blocked outright
(measured). In this genre, quoting a landlord, an agent, or customer service is as
common as quoting an agency, and the prescription became "fix someone else's text
message" — a head-on collision with Do-NOT.

**Demonstratives and generic nouns are not markers.** "이것에 따르면"·"자료에
따르면"·"내용에 따르면" identify nothing about whose words these are — a single
word opened the exemption (measured). The checker excludes exactly these forms.

**The list is a code constant and doesn't grow per channel.** Move it into channel
profiles and the gate's criteria fork with every new channel, making it
unmaintainable. Sources on other channels (finance, IT, etc.) get exempted as-is by
writing a URL or "X에 따르면". Keep adding nouns and the moment a common word slips
in, the list itself becomes a two-char bypass.

**Speech verbs alone don't cut it.** "그가 말했다"·"이렇게"·"다음과 같습니다"·
"전문가는 밝혔다"·"적혀 있다"·"인용" — all six passed in measurement. A marker
that's easier to prefix to invented slop than to a real quote has no discriminating
power. If it doesn't point at a source, quotation marks or not, it's judged as our
own sentence.

There's a reason quote share isn't the axis. When share was the axis, both sides
broke — with a low share you could pad a few ordinary sentences in front and pass
slop through, and with a high share a short post's legitimate verbatim quote got
blocked. Share has nothing to do with legitimacy.

**If your quoted text gets blocked, identify the source instead of editing the
original.** Put "시행령 원문은 이렇다" right before the quote and it's exempt.

**If the source can't be named at all, unwrap the quote into reported speech.**
Sometimes you can't write who said it (an anonymous tip, someone who'd be in
trouble if named). Leaving the quotation marks on keeps the S1 alive and blocks at
exit 2, and editing someone else's sentence is distortion. Move it into our own
words instead: `"급하시면 직접 가셔도 되는데, 서류는 제가 갖고 있어요."` → `서류를
자기가 갖고 있으니 같이 가야 한다고 했습니다.` — the facts survive and the style
gate passes.

## Principles when fixing

**Only subtract.** Never plant metaphors, clichés, or quotes that weren't there.
Erasing an AI tell by inserting "기록적인 성과를 거두었다" is fresh contamination.

**Never change meaning.** Don't touch a single character of numbers, dates, or
proper nouns. Collapsing a range to its upper bound is also distortion
(playbook §8).

**Don't raise or lower the register.** The tone the channel's profile.md sets is
canonical. Promoting spoken style to written style is a violation too.

**More fixes aren't better.** Leave sentences the checker passed alone. If you've
changed more than 30% of the original, it has drifted into a rewrite — revert.

## What this gate can't do (evidence grades)

**Read this before adding rules.** Two rounds of deep research (2026-08-14)
verified "what is an AI tell" and "how to fix it" separately, and the answer was
that most of the methods in use have no measured evidence. That's not an argument
for deleting rules. It's an argument for labeling which grade each one carries.
The reports are two files under the sister plugin's `fect-persona/docs/research/`.

**Per-piece checking can't catch batch homogenization.** Individual quality and
batch diversity move in opposite directions — AI-assisted pieces each got more
novel while pieces from the same setup grew more alike (preregistered experiment,
Doshi & Hauser, *Science Advances* 2024). `check-style.py` takes one manuscript at
a time, so this defect is structurally invisible to it. Confirmed by measurement:
two manuscripts differing only in subject each scored 100/100 while overlapping
0.77 with each other. Batches are measured separately by `check-batch.py` (see
Using the checker below).

**No measurement shows rule-based gates raise human ratings.** Two rounds found no
corpus study measuring the effect of regex style checking. It's kept anyway, for a
different reason — it beats self-assessment (an agent grading its own prose on
"does this sound human" passes itself almost every time). But when adding a new
rule, write down what its evidence is. T10~T13 rest on NIKL norms, not corpus
measurement, so their severity is set low.

**Don't import floating "AI cliché word lists" as-is.** All 15 candidates failed
3-vote verification in round 1. Not because the lists are wrong — because no one
has measured them on a corpus (most are translations of English-language
documents). The one signal measured and confirmed in Korean is the comma after a
connective ending (essay LLMs 19.83% vs. humans 4.10%, KatFishNet ACL 2025 — C1
catches it).

**Decoding is not a knob to turn — it's a trap to avoid.** Likelihood-maximizing
decoding kills vocabulary (beam search repetition 28.94% vs. human 0.28%, Holtzman
ICLR 2020). Commercial chat APIs don't expose beam search, so it isn't a value
this plugin can touch anyway. Instead of fiddling with temperature, use procedures
that **widen the candidate pool first** (grow-threads §4, the produce copy stage).
There's a measurement showing 1.6~2.1x diversity gains, but it's an English
creative-writing preprint, so the evidence grade is low.

**There's no evidence that channel voice specs are useless.** The paper circulated
as the source for that claim never measured style — it measured MMLU factual
accuracy only, and the authors explicitly excluded open-ended generation. It's
evidence for neither side, so the voice rules in `profile.md` stay.

## Using the checker

Paths follow the repo convention, rooted at `${CLAUDE_PLUGIN_ROOT}` — produce and
publish run from `data/<channel>/episodes/<topic>/`, so relative paths won't
resolve.

```bash
set -o pipefail          # required when piping — see the trap below
PG=${CLAUDE_PLUGIN_ROOT}/skills/platform-guide/references

# platform copy
python3 $PG/check-style.py --surface threads output/threads/post.md
python3 $PG/check-style.py --surface ig --json output/instagram/caption.md

# video surfaces — extracted from scenes.js and piped in
node $PG/extract-text.js ./storyboard/scenes.js narration | python3 $PG/check-style.py --surface narration -
node $PG/extract-text.js ./storyboard/scenes.js subtitle  | python3 $PG/check-style.py --surface subtitle -
node $PG/extract-text.js ./storyboard/scenes.js screen    | python3 $PG/check-style.py --surface screen -

# batch — several pieces at once (no rejection, ranking only)
python3 $PG/check-batch.py data/<channel>/episodes/*/output/threads/post.md
python3 $PG/check-batch.py --split data/<channel>/growth/threads/posts.md
```

`check-batch.py` **doesn't judge** (exit is always 0). There's no measured evidence
to set a threshold on, so it only reports the most similar pair, recycled phrases,
and sentence-opening/ending skew — whether to fix is a human call. Whether its
metrics actually respond is checked with `--selftest` (same-template pair 0.77,
unrelated posts 0.03).

**Don't feed it mixed files whole.** The `post.md` artifact holds body copy and
operating notes (reply order, link rules) in one file, so measured as-is the top
overlaps are all operational boilerplate (measured). Use `--split` to cut it by
`##` section and compare sections of the same kind.

**Remember one trap.** Append `| head` or `| sed` to shorten output and `$?`
becomes that command's exit code, not the checker's. A FAIL with six S1s reads as
`gate_exit=0` — an incident confirmed by measurement. If you pipe, put
`set -o pipefail` first; otherwise read `$?` immediately after the checker call.

The same trap lives in **command substitution**. `echo "$(basename $F) exit=$?"`
prints `basename`'s exit code — always 0, not the check result (measured, it bit).
Capture with `E=$?` first, then use it. Parameter expansions like `${P%%:*}` spawn
no process and are safe.

The reason for `extract-text.js` is that `scenes.js` isn't a CommonJS module but a
`window.SCENES` global. Reading it with `require()` directly dies, the redirected
file comes out empty, and the gate passes silently.

`--doc` is only for when you want to **inspect** internal documents like this one
(they're not gate targets — see scope at the top). It masks rule tables and command
examples to cut false positives. Never use it on produced copy — tables and
backticks all become slop hideouts.

Branch on the exit code.

| exit | Meaning | Follow-up |
|---|---|---|
| 0 | Pass | Proceed |
| 1 | Warn — S2 accumulation **or a quote exemption applied** | Fix it; if not fixing, report to the user with reasons. If the header shows `quote-exempt N`, first check whether that quote is real |
| 2 | Fail — S1 found | Fix and re-run. The only exception is violations inside a source-identified quote, which drop from the score and get reported as exit 1 instead |
| 3 | Execution error — empty input, missing path, analysis failure | Check input and paths, retry. Never skip the gate |

**If `--selftest` is red, don't trust the verdicts in this table.** Get it back to
green first, then check the copy. A PASS from a checker with broken rules isn't a
pass — it's unverified.

**exit 1 can mean three things.** An S2 accumulation warning, a quote exemption, or
the script dying at import time (a regex error, say). Only observation tells them
apart — `quote-exempt N` in the header means the second; **completely empty output
means the third** (a dead script can't print a verdict. Measured: corrupted copy,
exit 1, stdout 0 bytes). Run `--selftest` as a guard before calling anyway.

```bash
python3 "$CS" --selftest >/dev/null 2>&1 \
  || echo "gate_exit=3 (checker missing, corrupted, or rules red — every result below is unverified)"
```

A file-existence guard or a syntax check (`ast.parse`) isn't enough — a regex error
has clean syntax and dies at import (measured). `--selftest` catches missing (2),
corrupted (1), and rules-red (1) in one shot, and stops a broken checker's PASS
from counting as a pass. It's not an LLM call and finishes in 0.1s.

**exit 2 is also two things.** A failing verdict, or python unable to open the
script at all (wrong path, or `CLAUDE_PLUGIN_ROOT` empty). An argument typo is
also 2 by argparse convention. The one-line `--selftest` guard above catches all
three cases (missing, corrupted, wrong path) at once.

Reading a broken install as "S1 on every surface" means rewriting perfectly fine
copy. The stderr lines `usage:` and `can't open file` also tell them apart.

**The checker's output is canonical.** Don't override it with an agent's own
"looks fine to me" judgment.

After changing rules (regexes, thresholds, surface config), run `--selftest`. The
built-in fixtures check three things — does it catch slop, does it pass clean
prose, and are the bypasses (quote marks, backticks, code fences) and false
positives (hashtags, numbers, conjunctive adverbs, noun lists, reply greetings)
covered. Confirm the fixture count via the `N/N passed` line in the output.

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/skills/platform-guide/references/check-style.py --selftest
```

A smoke test that only checks the path should use a short clean sentence — feed it
an internal document and the content verdict returns exit 2, indistinguishable from
a path problem.

```bash
printf '신고 기한이 바뀌었다.\n' | python3 $PG/check-style.py --surface fb -   # exit 0 means healthy
```

The T·D·C·A tables in this document and the script's `PATTERNS` map 1:1 by ID and
severity — with three exceptions. C4 (emoji) is a per-surface count limit computed
outside the regex list, and its severity splits by surface (S1 where the limit is
0, S2 elsewhere), so the table writes `S1~S2`. C5 (repeated endings) and C7 (no
long sentence) need sentence sequences and lengths, so they're judged outside the
pattern list. All three still enter score and verdict at the table's severity.
Never change one side alone.

**Machine-diff convention** — the severity column holds only `S1`·`S2`·`S3`;
conditions go in prose below the table (like the C2 promotion). The only IDs
exempt from automated diffing are C4, C5, and C7.

**When the evidence sits outside the sentence, lower the severity.** Some axes
can't be captured no matter which way you constrain the rule. D3b's `~야 할 것이다`
is one — whether it lectures or forecasts depends on the speech act (who is being
addressed), and nothing in the sentence marks it. Constraining the predicate
rejected all 7 forecast/conditional-conclusion cases (measured 7/7). In that
situation don't carve the rule further — **lower S1 to S2.** Rejecting what can't
be discriminated blocks normal sentences; a warning lets a human decide.
