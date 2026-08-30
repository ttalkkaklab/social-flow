#!/usr/bin/env python3
"""Deterministic Korean AI-tell checker — the shared gate for every social-flow surface.

`korean-style.md` is the SoT for the rule definitions. This script is those
rules turned into a machine verdict, and the verdict is authoritative (agents
don't override it with their own judgment).

    python3 check-style.py --surface narration output/script.txt
    cat post.md | python3 check-style.py --surface threads -
    python3 check-style.py --surface ig --json caption.md

exit 0 pass / 1 warn (S2 accumulation) / 2 fail (S1 found) / 3 execution error /
4 skip (the text is not Korean, so these rules have nothing to say about it).

No dependencies (stdlib only). Runs as-is in the plugin distribution.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata

SURFACES = ("narration", "subtitle", "screen", "threads", "ig", "fb", "yt", "reply")

# ---------------------------------------------------------------------------
# Scope — every rule in this file is Korean. Text that isn't Korean is reported
# as out of scope, never as a pass.
# ---------------------------------------------------------------------------

# Why this guard exists: MASKS blanks Latin runs (proper nouns, abbreviations), so an
# English paragraph arrives at the rules as an empty string and every one of them finds
# nothing. That produced a silent PASS on copy stuffed with the exact tells the English
# style rules name — delve, leverage, robust, seamless, crucial, testament, "not X, it is
# Y" — 0 findings, because there was nothing left to look at. A checker that answers
# "clean" about text it cannot read is worse than no checker, so the answer is a distinct
# verdict of its own instead: SKIP, exit 4.
#
# **Why 4 and not 3.** The calling skills already spend 3 on "the gate never ran" — a
# failed extraction, a bad path, a checker whose own selftest is red (produce §gate,
# publish §1). Those mean *try again after fixing the plumbing*; SKIP means the plumbing
# worked and the checker read the text and has nothing to say about it. Reusing 3 would
# merge a fixable mistake with a permanent property of the copy.
#
# **Skipping is the damaging direction, so two conditions have to agree.** Under-reporting
# on foreign copy only loses findings the rules were never going to make; skipping Korean
# copy silently disarms the gate on the language it exists for.
#
#   1. Hangul share below HANGUL_MIN_SHARE, counted on the RAW text (masking erases the
#      Latin side, so measuring after it would compare Hangul against nothing and call
#      every language Korean), AND
#   2. fewer than HANGUL_MIN_CHARS Hangul syllables in absolute terms.
#
# The second condition is what keeps jargon-dense Korean in scope. Measured across the
# library's 28 Korean episodes: per episode the share never drops below 0.941, and the
# gate always runs on a whole surface, not a line — extract-text.js hands it every
# narration line of an episode at once. Per STRING the share does dip: two strings in the
# library fall under 0.5, the lower being "claude --plugin-dir로 이번 실행에서만
# 불러오세요." at 0.464 with 13 Hangul syllables. The absolute-count condition keeps that
# one in scope.
#
# **The count sits at 3, not at the median.** A high number reads as "keep Korean in
# scope", but it is the same number that decides how much Korean a foreign text may carry
# before it is judged by Korean rules — and *that* direction is the damaging one. At 12,
# an English paragraph carrying the tells README names passed clean with one Korean
# hashtag on it. Three syllables is below the shortest real Korean surface measured
# (a 5-syllable reply, "…하면 돼요") and above the incidental Hangul a foreign text
# carries — a hashtag, a product name, a quoted word.
#
# CJK that is NOT Korean has no Latin to dilute, so a share test alone reads it as 0/0 and
# lets it through. Japanese kana and Han characters are therefore counted on the foreign
# side of the ratio, which puts a Japanese sentence at share 0.0 where it belongs.
HANGUL_RE = re.compile(r"[가-힣]")
# Latin letters plus non-Korean CJK: kana, and Han (shared with Korean hanja, which is
# rare enough in this copy that the absolute-count condition covers the overlap).
FOREIGN_RE = re.compile(r"[A-Za-z\u3040-\u30ff\u4e00-\u9fff]")

# Thresholds from the library, all three far from the populations they separate:
#   share  — Korean episodes run 0.941~1.000; English paragraphs run 0.0.
#   chars  — three syllables: under the shortest real Korean surface (5), over a stray word.
#   floor  — under this share the Hangul is incidental however many syllables it runs to.
#            The measured gap: a Korean product name dropped into English sits at 0.025 and
#            five Korean hashtags on an English post at 0.115, while the thinnest real
#            Korean surface in the library is at 0.147.
HANGUL_MIN_SHARE = 0.5
HANGUL_MIN_CHARS = 3
HANGUL_FLOOR_SHARE = 0.13

# Below this many letters the ratio is noise — "OK!" is 0.0 and "네" is 1.0, and neither
# says what language the copy is in. Short strings are let through to the rules, which is
# the safe direction: the rules under-report on non-Korean, they never invent a finding.
SCOPE_MIN_LETTERS = 20


# A hashtag is a label, not a sentence — none of the rules can fire inside one, and a
# handful of Korean tags on an English post was enough to buy it a judgement by Korean
# rules. Dropped before the ratio is taken; the copy itself still reaches the rules whole.
HASHTAG_RE = re.compile(r"#\S+")


def hangul_share(text: str) -> tuple[float | None, int, int]:
    """(Hangul share of Hangul+foreign letters, that letter count, Hangul count).

    Measured on raw text with hashtags removed. Share is None when there are too few
    letters to judge.
    """
    text = HASHTAG_RE.sub(" ", text)
    h = len(HANGUL_RE.findall(text))
    f = len(FOREIGN_RE.findall(text))
    total = h + f
    if total < SCOPE_MIN_LETTERS:
        return None, total, h
    return h / total, total, h


def out_of_scope(text: str) -> tuple[bool, float | None, int, int]:
    """The share has to be low, and then either reading of "barely any Korean" settles it —
    too few syllables to be a sentence, or too thin a share to be anything but incidental."""
    share, letters, hangul = hangul_share(text)
    skip = (share is not None and share < HANGUL_MIN_SHARE
            and (hangul < HANGUL_MIN_CHARS or share < HANGUL_FLOOR_SHARE))
    return skip, share, letters, hangul

# ---------------------------------------------------------------------------
# Do-NOT — excluded from both detection and fixing. Masked with same-length
# spaces to preserve offsets.
# ---------------------------------------------------------------------------

# Always masked in copy checks — only values that must not be changed.
# Never add a "mask the whole chunk" mask here. Two measured incidents: masking
# a 200-char quote let slop hide inside quotation marks (a 0 score became 100),
# and masking backticks/code fences reopened the same bypass. Chunk masks all
# go to DOC_MASKS.
MASKS = (
    re.compile(r"https?://\S+"),                 # URL
    re.compile(r"#[\w가-힣]+"),                   # hashtags
    re.compile(r"[A-Za-z][A-Za-z0-9_.\-]*"),     # Latin abbreviations, proper nouns
    re.compile(r"\d[\d,.\-~%/:]*"),              # numbers, dates, units
)

# Masked additionally under --doc only. For checking internal docs that carry
# rule tables and command examples. Never enabled on produced copy — every one
# of these becomes a slop hideout.
DOC_MASKS = (
    re.compile(r"```.*?```", re.S),              # code blocks (commands, examples)
    re.compile(r"`[^`\n]+`"),                    # inline code
    re.compile(r"(?m)^\s*\|.*\|\s*$"),           # markdown table rows
    re.compile(r"(?m)^\s*>.*$"),                 # quote blocks
)

# Emoji only — arrows (→ ←) and box-drawing are document symbols, not emoji
# (the main source of false positives).
EMOJI = re.compile(
    "[\U0001F000-\U0001FAFF"   # emoticons, pictographs, transport, symbol supplement
    "☀-⛿"            # miscellaneous symbols ☀ ⚡ ⚠
    "✀-➿"            # dingbats ✅ ✂
    "⬀-⯿"            # heavy arrows, stars ⬅ ⭐
    "〰〽㊗㊙]"
)

# ---------------------------------------------------------------------------
# Patterns — (ID, severity, label, regex, threshold); threshold = only hits
# beyond this count are tallied.
# Severity maps 1:1 to the korean-style.md tables. Don't change it here alone —
# fix the doc together with it.
# ---------------------------------------------------------------------------

# With a first-person subject in front, "~야 할 것이다" is the speaker's own
# resolve, not a lecture ("나도 서류를 챙겨야 할 것이다"). D3 is S1, so this
# false positive would mean an outright block.
#
# **Do not move this into WHITELIST.** The whitelist exempts a match wholesale
# when it falls inside a whitelisted span, and this pattern's span runs up to
# 30 chars — prefix the two chars "나도" and the T1·D1·T3 inside all escape too
# (measured: all four test sentences dropped to 0 violations). That builds a
# bypass, so it lives as a lookbehind on the D3 rule itself — the exemption
# applies to D3 matches only.
# **Filtered in post-processing, not in the regex.** Python re can't do
# variable-width lookbehind (`look-behind requires fixed-width pattern`), and
# WHITELIST exempts the whole span, dropping the T1·D1·T3 inside. Filtered in
# analyze(), the same way as the C1 conjunctive adverbs.
# (The JS port supports variable-width lookbehind, so there it sits directly in
# the rule regex — behavior is the same.)
FIRST_PERSON_LEAD = re.compile(
    r"(?:내가|나도|나는|저도|저는|제가|우리가|우리도)[^.!?\n]{0,30}$")

Pattern = tuple  # (id, sev, label, regex, threshold, fix)

PATTERNS: list[Pattern] = [
    # --- Translationese T ---------------------------------------------------
    # The adnominal "~에 대한" is the same translationese ("제도에 대한 설명" → "제도 설명").
    # Requiring a trailing space sidesteps accidental stem matches in "반대한 사람"·
    # "상대한 업체" (measured false positives: 0).
    # `관해/관하여` are the same translationese. **`관한` is deliberately left out** —
    # "개인정보 보호에 관한 법률" is the standard format for statute titles and is
    # normal (T1 is S1 = reject).
    ("T1", "S1", "~에 대해(서)·~에 대한·~에 관해",
     re.compile(r"에\s*(대(해서|해|하여|한(?=\s))|관(해서|해|하여))"), 0,
     "Use the object particle directly — '제도에 대해 알아보자' → '제도를 알아보자'"),
    # Distinguish from the existence verb — "가방에 있어." is normal; only "문제에 있어서"
    # is translationese.
    ("T2", "S1", "~에 있어서", re.compile(r"에\s*있어서(?=\s*[가-힣])"), 0,
     "'~에서' or '~할 때'"),
    # '여지는' (noun 여지 + 는) is excluded — not a double passive.
    # All six series need `집` (polite ending "보여집니다") — only the 되어 series had it,
    # so the representative forms "보여집니다"·"잊혀집니다" all leaked (found in the
    # sister plugin's audit).
    ("T3", "S1", "double passive",
     # `질` is needed too — "판단되어질 수 있다"·"보여질 것이다" leaked (measured).
     re.compile(r"(되어[지진졌집질]|보여[지진졌집질]|잊혀[지진졌집질]"
                r"|쓰여[지진졌집질]|불려[지진졌집질]|모아[지진졌집질])"), 0,
     "Simple passive — '판단되어진다' → '판단한다'"),
    ("T4", "S1", "~을 가지고 있다", re.compile(r"[을를]\s*가지고\s*있"), 0,
     "Use a verb — '강점을 가지고 있다' → '강점이 있다'"),
    # Catching passive endings with only 되·진·받 lets the most common "~된다"·"~됐다"·
    # "~됩니다" all slip through (measured: "관세총국에 의해 갱신된다" undetected — found
    # in a self-attack after round 10). Adding 된·됐·됩 took 6/10 → 9/10. Excluding
    # "된장" alone leaves no remaining false positives — this is a false-positive guard,
    # not an exemption list, so it can't be used as a bypass.
    ("T5", "S2", "~에 의해 + passive",
     # A stem precedes the passive suffix — with `\S*` the first char of the word gets
     # caught too, flagging "지표에 의해 진도를"·"통계에 의해 받침이" (4 measured cases).
     # 10/14 → 14/14.
     re.compile(r"에\s*의(해|하여)\s*[가-힣]*[가-힣](되|된(?!장)|됐|됩|진|받)"), 0,
     "Make it active — '법에 의해 정해진다' → '법이 정한다'"),
    ("T6", "S2", "double particle", re.compile(r"(에서의|으로의|로의|에의|로부터의|으로부터의)"), 0,
     "Unpack into a clause — '현지에서의 생활' → '현지 생활'"),
    ("T7", "S2", "~를 통해 repeated", re.compile(r"[을를]\s*통(해서|해|하여)"), 2,
     "Only past 3 occurrences: spread some into '~로'·'~해서'"),
    ("T8", "S2", "~라는 점에서 repeated", re.compile(r"[라다]는\s*점에서"), 1,
     "'~라서'·'~니까'"),
    ("T9", "S3", "personal pronoun density", re.compile(r"\b(그|그녀|그들|그것)(는|은|가|를|의|에게|와|도)\b"), 2,
     "Drop them, or use a name/title"),
    # T10~T13 — the unimplemented items round 1 of the 2026-08-14 deep research found in
    # the correction pairs of the National Institute of Korean Language's "Public Language
    # at a Glance (revised)" (2022). **The evidence grade differs**: normative grounds, not
    # corpus measurement — no rule in this gate has ever been measured as "raising human
    # ratings" (round 2 conclusion). So severity is set only as far as each can
    # discriminate: only T10, with zero false-positive surface, rejects; the rest warn.
    # **Cite the attached PDF, not the etc_seq=699 page** — the page HTML has no rule
    # text, so opening only the URL misjudges the citation as fabricated (a trap the
    # research stepped in).
    ("T10", "S1", "~을 필요로 하다", re.compile(r"[을를]\s*필요로\s*(하|한|합|해|했|함)"), 0,
     "'~이 필요하다' — '검토를 필요로 한다' → '검토가 필요하다'"),
    # A **stem enumeration**, not a causative-suffix rule. `-시키다` is far more often a
    # legitimate causative ("아이를 등록시키다"·"차를 정지시키다"), so catching the suffix
    # leaks wholesale. These five are ones whose `-하다` form is already transitive, so
    # the causative suffix adds no meaning.
    # **When extending, first check for an intransitive use** — 증가·감소·향상 have
    # intransitives ("매출이 증가하다"), so '증가시키다' is a legitimate causative. Adding
    # it becomes a false positive straight away.
    ("T11", "S2", "unnecessary causative -시키다",
     re.compile(r"(개선|소개|금지|실현|완성)시(키|켜|킨|킬|켰|킵)"), 0,
     "Use '-하다' — '개선시킬 수 있다' → '개선할 수 있다'"),
    # Agentless passive ending. A different branch from T5 (~에 의해 + passive) — there
    # the agent is in the sentence (so it can be turned back to active); here there is
    # none at all ("주의가 요구됩니다" says nothing about who demands what of whom).
    # `(?![면고는])` is the same branch guard as D8 — conditional ("요구된다면"),
    # connective ("요구된다고 한다"), and adnominal clause ("요구된다는 지적") aren't
    # endings. **`는` matters most** — "~다는" can never be a sentence ending in Korean
    # and always modifies the following noun; with it missing, normal forms like
    # "요구된다는 지적/우려" were penalized (2026-08-14 code review, measured).
    ("T12", "S2", "agentless passive ~이 요구된다",
     re.compile(r"[이가]\s*요구(된다|됩니다|돼요|되었다|되었습니다|됐다|됐습니다|되고\s*있(다|습니다))(?![면고는])"), 0,
     "Say who has to do what — '주의가 요구됩니다' → '주의해야 합니다'"),
    # An inanimate thing speaking like a person. Of the four this is the hardest to
    # discriminate by regex, so both the subject noun and the predicate are enumerated to
    # narrow it, and severity is lowered by the uncertainty that remains (S3 = 2 points,
    # surfaces to human eyes only). The adnominal ("자료가 말해 주는 것은") is a normal
    # form, so only endings are checked. The span is `[^.!?\n]{0,60}` — avoids nested
    # quantifiers to prevent backtracking.
    ("T13", "S3", "inanimate subject + active verb",
     re.compile(r"(결과|수치|통계|자료|데이터|보고서|기록|지표)[은는이가]\s[^.!?\n]{0,60}"
                r"(말해\s*(준다|줍니다|주고\s*있(다|습니다))|웅변(한다|합니다))(?![면고는])"), 0,
     "Use '~에서 알 수 있다' — '이 결과는 ~ 말해 준다' → '이 결과에서 알 수 있다'"),

    # --- AI stock phrases D --------------------------------------------------
    # The colloquial contractions "~적으론"·"~적으로는" are the same cliché (a measured
    # miss). Only the three words are spelled out, so normal adverbs like "기본적으론"·
    # "개인적으론" stay clear.
    ("D1", "S1", "stock opener/closer words",
     re.compile(r"((?:결론|궁극|본질)적으(?:로[는은]?|론)|요컨대|종합하면|정리하자면)"), 0,
     "Delete. Say the answer in the first sentence"),
    ("D2", "S1", "significance inflation",
     # Catching only endings lets adnominals leak — "주목받는 변화"·"주목되는 대목" went
     # undetected.
     # The 평가 side is not widened: "높게 평가받는 대행사" is factual reporting, and
     # blocking it at S1 over-blocks.
     # **Adnominals split on the following noun.** "주목받는 변화" (abstract noun = slop)
     # and "주목받는 기업" (concrete noun = factual reporting) have the same shape.
     # Widening naively blocked normal sentences at S1 (5 measured cases). Same approach
     # as D7: tie the tail to an abstract-noun list so only slop remains.
     # Endings (주목된다·주목받는다) take no object and are always slop, so they stay.
     re.compile(r"(시사하는\s*바가\s*[크큽]|의미가\s*[크큽]|주목할\s*만하"
                r"|주목(된다|받는다|됩니다|받습니다)"
                r"|주목(받는|되는|받은|받고\s*있는|되고\s*있는)"
                r"\s*(변화|대목|행보|움직임|흐름|점|부분|사실|현상|추세)"
                r"|평가된다|평가받는다|귀추가\s*주목|기대를\s*모으)"), 0,
     "Replace with what and why, or delete"),
    # The lecturing form mixes two different animals, so it's split. **Severity goes only
    # as far as the pattern can actually discriminate.**
    #
    # D3 (S1) has its evidence inside the sentence. Either it's a fixed idiom (할 필요가
    # 있다·하는 것이 중요하다·명심해야) or the addressee honorific `~셔야` pins the
    # target to the reader as a grammatical marker. No false-positive risk, so rejecting
    # is safe.
    ("D3", "S1", "lecturing form",
     re.compile(r"(할\s*필요(가|성이)\s*있|하는\s*것이\s*중요"
                r"|[가-힣]{1,6}[셔서]야\s*할\s*것(이다|입니다)|명심해야)"), 0,
     "'확인할 필요가 있다' → '확인하자'"),
    # D3b (S2) can't discriminate. "기한을 지켜야 할 것이다" (lecture) and "내년에는
    # 제도가 바뀌어야 할 것이다" (forecast) have the same shape. What splits them is
    # neither predicate nor subject but the **speech act** (who the sentence addresses),
    # and nothing in the sentence marks that.
    # Constraining the tail (the predicate) rejected all 7 forecast/conditional-conclusion
    # cases (measured 7/7). So it warns instead of rejecting — news is a genre that
    # writes forecasts, and blocking them blocks the writing.
    ("D3b", "S2", "~야 할 것이다 (fix if it lectures, keep if it forecasts)",
     re.compile(r"([을를]\s*(?:[가-힣]+\s+){0,2}[가-힣]{1,6}야\s*할\s*것(이다|입니다)"
                r"|[가-힣]{2,}(?:해|하여)야\s*할\s*것(이다|입니다))"), 0,
     "If it tells others what to do, use '지키자'. If it's a forecast, leave it"),
    ("D4", "S2", "hedging",
     re.compile(r"(라고\s*할\s*수\s*있|로\s*보여진다|인\s*셈이다|라고\s*볼\s*수\s*있"
                r"|것으로\s*보(인다|입니다|이며)|것으로\s*예상|라고\s*여겨)"), 1,
     "If you can state it flat, state it flat"),
    ("D5", "S2", "hype modifiers",
     re.compile(r"(혁신적|획기적|새로운\s*지평|게임\s*체인저|판도를\s*바꿀|놀라운)"), 0,
     "Delete. Emphasize with numbers, not modifiers"),
    ("D6", "S2", "empty modifiers",
     re.compile(r"(매우|굉장히|효과적으로|원활하게|성공적으로|다양한|폭넓은|손쉽게)"), 1,
     "Delete"),
    # Press-release prose with no lexical tell and no content either — the type that kept
    # passing until the very end of the rule-expansion measurements.
    # "중요한 것은 X입니다" is caught only when X is an abstract noun — swallowing
    # concrete conclusions like "중요한 것은 접수증입니다" penalizes well-written
    # sentences (measured). "전환점을 맞" was dropped too for over-capturing factual
    # reporting.
    ("D7", "S2", "hollow rhetoric",
     re.compile(r"(물결\s*속에서|시대의?\s*흐름\s*속|균형점을\s*찾|화두로\s*떠오"
                r"|답은\s*간단합니다|핵심은\s*딱\s*하나|새로운\s*국면"
                r"|중요한\s*것은\s*(방향|본질|자세|태도|의지|마음가짐|관점|균형))"), 0,
     "Replace with concrete facts and numbers, or delete"),
    # Report-register stative verb endings — user directive (2026-08-12, second expansion
    # the same day). Catches the read-aloud register that wraps a phenomenon in one verb
    # and stops: "둘로 나뉩니다" · "추천이 갈려요" · "선택지가 남습니다" · "근거를 남긴다".
    # Quotes and reported speech ("나뉜다는 얘기야") are caught too — that's the current
    # behavior, confirmed by measurement, and the user directive says "never", so it
    # isn't loosened.
    # Not caught: adnominals ("갈리는 이유" — headline phrasing) · conditionals
    # ("나뉜다면") · colloquial past and imperatives ("후기 남겼어"·"메모 남겨 둬"·
    # "3일 남았어요").
    # '남기다' is transitive but shares the report-register ending, so it's caught too —
    # present formal only (남긴다·남깁니다). People say "적어 둔다"·"메모해 둔다".
    # The '갈-' family only word-initially or as '엇갈-' — "헷갈렸어요"·"헷갈립니다" are
    # everyday words, and matching without a boundary false-positives (found while
    # porting to fect-persona, 2026-08-12).
    ("D8", "S1", "report-register stative verb ending",
     re.compile(r"(나뉜다|나뉩니다|나뉘어요|나뉘죠|나뉘었"
                r"|(?:엇|(?<![가-힣]))갈(?:린다|립니다|려요|리죠|렸다|렸어요|렸습니다|립니까)"
                r"|(?<!살아)남습니다|(?<!살아)남는다|남긴다|남깁니다)(?!면)"), 0,
     "Make the target the subject, concretely — '추천이 갈려요' → '미용실마다 다른 색을 권해요',"
     " '근거를 남긴다' → '근거를 적어 둔다'"),

    # D9/D9b — written-register declarative endings on spoken surfaces. User directive
    # (2026-08-13): "화면이 나온다 / 주소부터 준다 / 이렇게 친다 -> 이런식의 말투는
    # 사람이 쓰는 말투가 아니잖아" (that's not how a person talks). The plain declarative
    # '-ㄴ다/-는다' is the ending of expository prose, editorials, news articles, and
    # papers (National Institute of Korean Language). It's the register of writing for an
    # unspecified audience, doesn't even carry the lowering meaning, and nobody ends
    # sentences this way talking to the colleague next to them.
    #
    # Split on final-consonant index 4 (ㄴ) — '-ㄴ다/-는다' is an **ending that attaches
    # to verbs only** (it's the very test for telling adjectives apart), so the
    # false-positive surface is small. Adjective base forms ('편하다'·'다르다'·'같다')
    # and '-이다' have a different final consonant on the preceding syllable and drop out
    # automatically.
    # Sentence-final only — connective ('간다고 했어'), adnominal ('가는 길'), and
    # conditional ('간다면') aren't targets. Closing quotes and brackets are looked past.
    ("D9", "S1", "written-register declarative ending (-ㄴ다/-는다)",
     re.compile(r"[가-힣]다(?=[\"'”’」』)\]]*\s*(?:[.!?…]|\n|$))", re.M), 0,
     "End in casual spoken form — '화면이 나온다' → '화면이 나와', '주소부터 준다' →"
     " '주소부터 줘', '이렇게 친다' → '이렇게 쳐'"),
    # D9b is the diary-style past. It's S2, but **thr=1 exempts the first hit** — S2
    # costs 7 points, so just two sentences closed this way hit 86 and fail the 90 gate.
    # What the user flagged was present-tense procedural prose, and people do write
    # '~했다' on Threads. The arithmetic was known when this went in.
    ("D9b", "S2", "diary-style past ending (-았다/었다/였다/했다)",
     re.compile(r"(았|었|였|했)다(?=[\"'”’」』)\]]*\s*(?:[.!?…]|\n|$))", re.M), 1,
     "Casual spoken form — '만들었다' → '만들었어'. One is tolerated (penalty from the second)"),

    # --- Structure and rhythm C ----------------------------------------------
    # `데,` can't be caught by enumeration — it attaches to any stem (많은데·비싼데·
    # 한데·어딘데·예쁜데…). Growing the ending list keeps leaking (measured 2026-08-11:
    # the enumeration draft missed "어딘데,"). So `<hangul>데,` is matched broadly and
    # split by **whether the preceding syllable has a final consonant** (the C1_DATA_TAIL
    # post-processing below) — the connective endings -은데/-ㄴ데/-는데 always end on a
    # syllable with one, and the bound noun '데' (갈 데, 잘 데) is written with a space,
    # so attached means ending.
    # Verification sample 9/9 detected · 0 false positives (데스크탑·데이터·"갈 데,
    # 올 데"·"기대, 실망" etc., 12 cases).
    ("C1", "S1", "comma after connective ending",
     re.compile(r"(지만|는데|면서|라서|어서|아서|으며|하며|거나|려면|더라도|해도|지요|는지),"
                r"|[가-힣]데,"), 0,
     "Drop the comma — '발전하지만, 대응은 느리다' → '발전하지만 대응은 느리다'"),
    ("C2", "S2", "negation parallelism 'A가 아니라 B'",
     re.compile(r"(이|가|은|는|도)?\s*아니라\s"), 0,
     "Just write B (promoted to S1 at 2 or more)"),
    # Only three predicates in a row. Noun lists ("여권, 비자, 계약서") are the basic
    # phrasing of the checklist genre and aren't targets — they false-positived in
    # measurement.
    ("C3", "S2", "triple listing (coordinated predicates)",
     re.compile(r"[가-힣]{2,}고\s+[가-힣]{2,}(하)?며\s+[가-힣]{2,}[한는]"
                r"|[가-힣]{2,}하고\s*,\s*[가-힣]{2,}하고\s*,\s*[가-힣]{2,}[한하]"), 0,
     "Three only when there really are three. Usually one is enough"),
    ("C6", "S2", "mechanical three-step",
     re.compile(r"(먼저|첫째|첫\s*번째).{0,120}?(다음으로|둘째|두\s*번째).{0,120}?(마지막으로|끝으로|셋째)",
                re.S), 0,
     "Only when the order truly matters"),

    # --- Assistant voice A ---------------------------------------------------
    ("A1", "S1", "tour-guide opener",
     # The colloquial invitation "~시죠" is the same opener (a measured miss).
     re.compile(r"(함께\s*알아보|알아볼까요|알아보시죠|알아봅시다"
                r"|살펴볼까요|살펴보시죠|살펴봅시다"
                r"|오늘은\s*\S{0,20}에\s*대|이번\s*시간에는)"), 0,
     "Get to the point"),
    # A short thank-you by itself is normal engagement (platform-guide principle 4,
    # golden hour). Only the stock closer that wraps up content is caught.
    ("A2", "S1", "closing pleasantry",
     # Colloquial forms with the particle dropped, like "도움 되셨나요?", leaked (measured).
     re.compile(r"(도움이?\s*되(셨|었)|참고하시기\s*바랍|참고\s*부탁|되시길\s*바랍"
                r"|읽어\s*주셔서\s*(감사|고맙)|읽어주셔서\s*(감사|고맙)"
                r"|시청해\s*주셔서|끝까지\s*(봐|읽)"
                r"|다음에도\s*(유익|좋은|알찬)|찾아뵙)"), 0,
     "Delete"),
    ("A3", "S2", "unasked-for balance",
     re.compile(r"(물론\s.{0,40}도\s*있지만|양쪽\s*모두|일장일단|장단점이\s*있)"), 0,
     "Pick a side or delete"),
    ("A4", "S1", "greeting opener / channel promo",
     # "전해 드립니다" with the standard spacing wasn't caught — only the run-together
     # form was (a measured miss).
     # Endings only — "말씀을 전해 드리려고 왔다" is normal narration.
     re.compile(r"(안녕하세요|반갑습니다|소식을\s*전해\s*드리"
                r"|전해\s*드립니다|전해드립니다"
                r"|구독과?\s*좋아요|좋아요\s*눌러|구독\s*눌러"
                r"|알림\s*설정|많은\s*관심\s*부탁)"), 0,
     "Get to the point. The outro handles channel identity"),
]

# A conjunctive adverb followed by a comma is fine ("하지만, ~"). "하지만" that the C1
# regex catches as an ending and "발전하지만" with a stem attached can only be told
# apart by looking at the whole eojeol (space-delimited word).
CONJ_ADVERBS = {
    "하지만", "그렇지만", "그런데", "한데", "그러면서", "그래서", "그러니까",
    "그러므로", "다만", "게다가",
}

# Expressions the playbook prescribes — matching a pattern isn't a violation.
#
# **Keep entries short.** The whitelist exempts a match wholesale when it falls inside
# an entry's span, so a long span becomes a slop hideout (sister-plugin measurement:
# adding a 30-char first-person pattern let the two chars "나도" exempt T1·D1·D6·T3
# entirely). Every current entry is 7 chars or less. If a wide exemption is needed,
# handle it in the rule itself, not the whitelist (see D3's FIRST_PERSON_LEAD
# post-processing).
WHITELIST = (
    # Adverb + '의' isn't a double particle — "앞으로의 변화" is natural Korean (T6
    # false positive).
    re.compile(r"(앞|뒤|이후|향후|지금|평소)으?로의"),
    # The FB case-collecting closer — playbook §5 prescription. It matches no pattern
    # today, but it's declared in advance so a future question-ending rule can't break it.
    re.compile(r"여러분은\s*어떻게\s*(하고\s*)?(계신가요|하시나요)"),
    # "다름 아니라" is a fixed idiom — not negation parallelism (C2).
    # The C2 match includes the trailing space, so the whitelist must cover it too.
    re.compile(r"다름\s*아니라\s*"),
)

# ---------------------------------------------------------------------------
# Per-surface configuration
# ---------------------------------------------------------------------------

# The off lists are the only channel for per-surface loosening — this table and the
# "Rules off" column in korean-style.md must match exactly. Never change one side alone.
SURFACE_CFG = {
    # C7 (no long sentence) is off on surfaces whose length is bound by schema — telling
    # narration cut to 8~25 chars for readability to "write longer" fights the schema.
    # D9/D9b (written-register declarative endings) are on **only for surfaces where a
    # person speaks**. Narration is dialogue bound to the 8~25-char schema, and channels
    # have places for plain-register statements (fixtures "하루만 늦어도 과태료가
    # 나온다"·"전에는 사흘이었다"); subtitles and cards are fragments, not sentences.
    # yt titles are headline register, where '-ㄴ다' is normal phrasing.
    "narration": {"emoji": 0, "len": (8, 25), "off": ("C7", "D9", "D9b")},
    "subtitle":  {"emoji": 0, "len": (0, 30), "off": ("C3", "C5", "C6", "C7", "D9", "D9b")},
    # Card text is title/label fragments, so rhythm rules don't fit. Lexical tells only.
    "screen":    {"emoji": 0, "len": None,    "off": ("C1", "C3", "C5", "C6", "C7", "T9", "D9", "D9b")},
    "threads":   {"emoji": 1, "len": None,    "off": ("C5",)},
    "ig":        {"emoji": 3, "len": None,    "off": ()},
    "fb":        {"emoji": 2, "len": None,    "off": ("C3", "C6")},
    "yt":        {"emoji": 2, "len": None,    "off": ("C1", "C3", "C5", "C6", "C7", "T9", "D9", "D9b")},
    # A4 is off — "안녕하세요" in a comment reply is the standard golden-hour opener
    # (playbook principle 4).
    "reply":     {"emoji": 1, "len": None,    "off": ("C3", "C5", "C6", "A4")},
}

# C7 threshold — "no long sentence" when the longest is under this many chars. The
# measured split point was 21/25, so a value in between. Raise it and normal list-style
# posts get caught; lower it and nothing does.
C7_FLOOR = 23

PENALTY = {"S1": 20, "S2": 7, "S3": 2}
METRIC_PENALTY = 3
WARN_BELOW = 85  # exit 1 below this score even with no S1

# ---------------------------------------------------------------------------


def mask(text: str, doc: bool = False) -> str:
    """Mask Do-NOT spans with same-length spaces (offsets preserved)."""
    out = list(text)
    for rx in MASKS + (DOC_MASKS if doc else ()):
        for m in rx.finditer(text):
            for i in range(m.start(), m.end()):
                if out[i] != "\n":
                    out[i] = " "
    return "".join(out)


def whitelist_spans(text: str) -> list[tuple[int, int]]:
    return [(m.start(), m.end()) for rx in WHITELIST for m in rx.finditer(text)]


# Direct quotes in double quotation marks. Not masked (masking makes a slop hideout) —
# instead, violations found here get a `quoted` label, are excluded from score and
# verdict, and appear only in the report. Fixing a span that relays someone else's words
# is itself distortion (korean-style.md §Do-NOT).
QUOTE_RX = re.compile(r"[\"“][^\"”]{0,400}[\"”]")

# The exemption condition is **whether the source is identified**. Got this wrong twice.
#   1st: splitting on quote share broke both ways — with a low share you could pad
#        ordinary sentences in front and pass slop through; with a high share, a short
#        post's legitimate verbatim quote got blocked. Share is an axis unrelated to
#        legitimacy.
#   2nd: switched to attribution markers, but the list was wide enough to admit
#        narrative vocabulary. "그가 말했다." "이렇게." "다음과 같습니다." — two words
#        in front passed arbitrary slop. Prefixing invented slop was easier than
#        prefixing a real quote.
# So now only **markers that point at whose words these are** count.
SOURCE_NOUNS = (
    r"(시행령|시행규칙|법률|법령|고시|공고|공문|훈령|조례|지침|약관|규정집|판결문"
    r"|보도자료|안내문|성명서|백서|매뉴얼|공안부|국세청|외교부|노동부|보건부|출입국"
    r"|대사관|영사관|세무서|관공서|당국"
    # Everyday sources. In this genre, quoting a landlord, an agent, or customer service
    # is as common as quoting an agency, and with agency nouns only those quotes were
    # blocked outright (measured: a landlord text-message quote hit exit 2 with no way
    # around — the prescription became "fix someone else's text", clashing with §Do-NOT).
    # Widening doesn't create a silent pass — exemptions surface to human eyes as exit 1.
    r"|집주인|임대인|세입자|중개인|인사팀|고객센터|상담원)"
)
# Demonstratives and generic nouns pointing at a source are excluded. The single word
# "이것에 따르면" opened the exemption (measured) — a marker that identifies nothing
# about whose words these are.
VAGUE = r"(?!(?:이것|그것|저것|여기|거기|이거|그거|이런|그런|자료|내용|정보)에\s*따르면)"
# The tail after a personal-source action form that reveals "how I found out" rather
# than "what I'm relaying". The ending alone can't split them — "받고 알았습니다"
# (occasion) and "받고 그대로 옮깁니다" (quote intro) share the ending (measured: the
# latter got blocked at exit 2). A relaying verb within the next 20 chars means intro,
# not occasion, so the exclusion is cancelled.
NOT_HEARSAY = (
    r"(?!\s*(?:을|를|랑|이랑)?\s*(?:보고|받고|읽고|확인하고|보니|듣고)"
    r"(?!.{0,20}(?:옮|붙여|인용|그대로|전문)))"
)
ATTRIBUTION = re.compile(
    r"(https?://"                                  # source link attached to the quote
    rf"|{SOURCE_NOUNS}"                            # document/statute/agency/everyday-source names
    rf"|{VAGUE}[가-힣A-Za-z0-9]{{2,}}에\s*따르면"   # "X에 따르면" — demands a source as its object
    r"|[가-힣A-Za-z0-9]{2,}이?\s*발표한"            # "X가 발표한"
    # The standard personal-source phrasing — when it also states what is being relayed
    # (a text, an email, a reply). Followed by "~를 보고/받고" it's an account of events,
    # not a quote intro ("친구가 보낸 문자를 보고 알았습니다") — how they found out, not
    # a relay, so not a marker.
    rf"|[가-힣]{{2,}}(이|가|께서|에서)\s*(보낸|보내온|보내준|남긴|준)"
    rf"\s*(문자|메시지|메일|카톡|쪽지|답변|안내|공지|글){NOT_HEARSAY}"
    rf"|[가-힣]{{2,}}(에게|한테)\s*받은\s*(문자|메시지|메일|카톡|답변|안내){NOT_HEARSAY}"
    r")"
)
# The list is tuned to the Vietnam/Korea administrative domain. **Don't grow it as
# channels grow** — a finance or IT channel's sources get exempted as-is by writing
# `X에 따르면` or a URL. Keep adding nouns and the list itself becomes a bypass (the
# moment a common word slips in, a two-char prefix passes). The list is only a
# convenience axis for channels that quote government documents often; the general axes
# are URLs and "X에 따르면", those two.

# Markers are searched within this range before and after the quote marks. 60 chars
# comfortably covers one Korean intro sentence — "공안부가 지난주 발표한 시행령 원문은
# 다음과 같습니다." (27 chars) and "원문 https://example.gov.vn/decree 에는 이렇게
# 적혀 있습니다." (48 chars) both fit.
# At 40 chars the URL intro got cut off and a legitimate quote missed its exemption
# (measured).
# Widening doesn't enable a bypass — the markers are agencies, statutes, and URLs, so
# attaching one means inventing a source that doesn't exist, and that's caught by the
# factual-distortion gate (content-reviewer P0-3), not the style gate.
ATTRIBUTION_WINDOW = 60
# The line right above the quote is a candidate regardless of distance, but only its
# **last 40 chars** are read. Opening the whole line meant dropping one agency name at
# the head of a 160-char intro exempted the quote below wholesale (measured). What
# blocks that bypass isn't the 40 but the min() structure below — the moment the range
# taken from the previous line is cut finite, it's blocked (set the constant to 0 and
# re-measure: still exit 2). What 40 protects is the other direction: when the source
# sits on the previous line and the quote is indented more than 60 chars into its own
# line, the 60-char window can't reach the previous line, and the 40-char tail saves
# that legitimate quote. Roll it back to 0 and the self-test "prev-line tail protects
# deep indentation" breaks — that fixture proves what this constant protects.
PREV_LINE_TAIL = 40


def quote_spans(text: str) -> list[tuple[int, int]]:
    """Return only the direct-quote spans whose source is identified."""
    out = []
    for m in QUOTE_RX.finditer(text):
        # Besides the 60-char distance, the **tail of the line right above** is a
        # candidate. People write the source at the end of the line above the quote,
        # not to fit within 60 chars.
        line_start = text.rfind("\n", 0, m.start()) + 1
        prev_line_start = text.rfind("\n", 0, max(line_start - 1, 0)) + 1
        prev_tail = max(prev_line_start, line_start - 1 - PREV_LINE_TAIL)
        begin = min(max(0, m.start() - ATTRIBUTION_WINDOW), prev_tail)
        before = text[begin:m.start()]
        after = text[m.end():m.end() + ATTRIBUTION_WINDOW]
        if ATTRIBUTION.search(before) or ATTRIBUTION.search(after):
            out.append((m.start(), m.end()))
    return out


def line_of(text: str, pos: int) -> int:
    return text.count("\n", 0, pos) + 1


def eojeol_at(text: str, pos: int) -> str:
    """The eojeol containing pos, punctuation stripped. For conjunctive-adverb checks."""
    a = max(text.rfind(" ", 0, pos), text.rfind("\n", 0, pos)) + 1
    b = min((i for i in (text.find(" ", pos), text.find("\n", pos)) if i != -1),
            default=len(text))
    return text[a:b].strip(" ,.!?…\n")


def sentences(masked: str) -> list[tuple[int, str]]:
    """List of (start offset, sentence). Terminal punctuation and newlines are boundaries."""
    out, start = [], 0
    for m in re.finditer(r"[.!?。…]+\s*|\n+", masked):
        piece = masked[start:m.start()].strip()
        if piece:
            out.append((start, piece))
        start = m.end()
    tail = masked[start:].strip()
    if tail:
        out.append((start, tail))
    return out


def ending_key(sentence: str) -> str | None:
    """Last 2 syllables of the sentence's final eojeol — for repeated-ending checks."""
    words = sentence.split()
    if not words:
        return None
    last = re.sub(r"[^가-힣]", "", words[-1])
    return last[-2:] if len(last) >= 2 else (last or None)


def visible_len(sentence: str) -> int:
    return len(sentence.replace(" ", ""))


def sentence_initial(masked: str, pos: int) -> bool:
    """Is the eojeol at this position sentence-initial — true when only terminal punctuation or newlines precede it."""
    head = masked[:pos].rstrip()
    return not head or head[-1] in ".!?…\n"


def jongseong_index(ch: str) -> int:
    """Final-consonant index of a hangul syllable — 0 none · 4 ㄴ · 20 ㅆ. -1 if not hangul.

    The axis D9 uses to split '-ㄴ다/-는다' (verb present declarative) from
    adjective base forms. `has_final_consonant` only sees presence, so it
    can't be used here.
    """
    code = ord(ch)
    if not 0xAC00 <= code <= 0xD7A3:
        return -1
    return (code - 0xAC00) % 28


def has_final_consonant(ch: str) -> bool:
    """Does the hangul syllable have a final consonant — the axis that splits C1's `데,` branch into ending vs. noun."""
    code = ord(ch)
    if not 0xAC00 <= code <= 0xD7A3:
        return False
    return (code - 0xAC00) % 28 != 0


def analyze(text: str, surface: str, doc: bool = False) -> dict:
    cfg = SURFACE_CFG[surface]

    # Language scope, before any rule runs. Non-Korean copy gets SKIP (exit 4), not PASS —
    # see the HANGUL_MIN_SHARE block at the top for why a pass here would be a lie.
    skip, share, letters, hangul = out_of_scope(text)
    if skip:
        return {
            "surface": surface,
            "chars": len(text),
            "sentences": 0,
            "findings": [],
            "quoted_findings": 0,
            "metrics": [],
            "score": None,
            "s1": 0, "s2": 0, "s3": 0,
            "verdict": "SKIP",
            "exit_code": 4,
            "scope": {"hangul_share": round(share, 3), "letters": letters,
                      "hangul": hangul},
        }

    masked = mask(text, doc)
    wl = whitelist_spans(text)
    qs = quote_spans(text)
    findings, metrics = [], []

    def whitelisted(a: int, b: int) -> bool:
        return any(a >= s and b <= e for s, e in wl)

    def in_quote(a: int, b: int) -> bool:
        return any(a >= s and b <= e for s, e in qs)

    for pid, sev, label, rx, thr, fix in PATTERNS:
        if pid in cfg["off"]:
            continue
        hits = [m for m in rx.finditer(masked) if not whitelisted(m.start(), m.end())]
        # C1 excludes conjunctive-adverb eojeols ("하지만, ") — adverbs, not endings.
        # The `<hangul>데,` branch is dropped when the preceding syllable has no final
        # consonant — then it's not an ending ("기대, 실망").
        if pid == "C1":
            # `한데` sentence-initially is a conjunctive adverb (= 그런데), but anywhere
            # else it's a connective ending ("싶긴 한데," — measurement showed this whole
            # branch leaking). Split by position.
            hits = [m for m in hits
                    if eojeol_at(masked, m.start()) not in CONJ_ADVERBS
                    or (eojeol_at(masked, m.start()) == "한데" and not sentence_initial(masked, m.start()))]
            hits = [m for m in hits if not (m.group().endswith("데,") and len(m.group()) == 3
                                            and not has_final_consonant(m.group()[-3]))]
        # D9 only when the preceding syllable's final consonant is ㄴ — splits off
        # '-ㄴ다/-는다' (verbs). '편하다'·'다르다'·'~이다' have a different final
        # consonant and drop out here.
        if pid == "D9":
            hits = [m for m in hits if jongseong_index(m.group()[0]) == 4]
        # The D3 family with a first-person subject in front is the speaker's own
        # resolve, not a lecture.
        if pid in ("D3", "D3b"):
            hits = [m for m in hits
                    if not FIRST_PERSON_LEAD.search(masked[:m.start()])]
        if len(hits) <= thr:
            continue
        counted = hits[thr:]
        # C2 promotes to S1 at 2 or more (korean-style.md C2 note).
        eff = "S1" if (pid == "C2" and len(counted) >= 2) else sev
        for m in counted:
            findings.append({
                "id": pid, "severity": eff, "label": label,
                "line": line_of(text, m.start()),
                "excerpt": text[max(0, m.start() - 12):m.end() + 12].replace("\n", " ").strip(),
                "fix": fix,
                "quoted": in_quote(m.start(), m.end()),
            })

    # Emoji limit. **Counted on the masked text** — counting the original voids the
    # masks. No MASKS entry covers emoji today, but DOC_MASKS' code blocks and table
    # rows do, and the moment any emoji-like mask is added this trap springs (the
    # sister plugin fect-persona actually stepped on it — chart label emoji counted
    # against the limit).
    emojis = [m for m in EMOJI.finditer(masked) if not whitelisted(m.start(), m.end())]
    if len(emojis) > cfg["emoji"]:
        findings.append({
            "id": "C4", "severity": "S1" if cfg["emoji"] == 0 else "S2",
            "label": f"emoji limit exceeded ({len(emojis)} > {cfg['emoji']})",
            "line": line_of(text, emojis[0].start()),
            "excerpt": "".join(m.group() for m in emojis[:8]),
            "fix": f"the {surface} surface limit is {cfg['emoji']}",
        })

    sents = sentences(masked)

    # Sentence length (only surfaces with a schema bound)
    if cfg["len"] and sents:
        lo, hi = cfg["len"]
        bad = [(off, s) for off, s in sents if not (lo <= visible_len(s) <= hi)]
        if bad:
            metrics.append({
                "id": "M-len", "label": f"sentence length out of range {len(bad)}/{len(sents)} ({lo}~{hi} chars)",
                "line": line_of(text, bad[0][0]), "count": len(bad), "total": len(sents),
                "detail": [f"{visible_len(s)} chars: {s[:24]}" for _, s in bad[:3]],
            })

    # C5 same sentence-ending runs — an S2 finding per the doc table (enters the score
    # tally).
    if "C5" not in cfg["off"] and len(sents) >= 3:
        keys = [ending_key(s) for _, s in sents]
        run, worst, at = 1, 1, 0
        for i in range(1, len(keys)):
            if keys[i] and keys[i] == keys[i - 1]:
                run += 1
                if run > worst:
                    worst, at = run, i
            else:
                run = 1
        # From 4 in a row — for polite explanatory channels, three '~니다' in a row is
        # normal register. Don't fight the register profile.md sets (korean-style.md
        # §Principles when fixing).
        if worst >= 4:
            findings.append({
                "id": "C5", "severity": "S2", "label": f"same sentence ending {worst} in a row",
                "line": line_of(text, sents[at][0]),
                "excerpt": sents[at][1][:40],
                "fix": "Mix the endings",
            })

    # C7 no long sentence — a piece that's nothing but short sentences.
    #
    # Two hypotheses were split with channel measurements before adding this (9 Threads
    # posts + same-age reach comparison). **"Uniform length = machine tell" was
    # rejected** — the best-performing post was actually more uniform (cv 0.13, range 9).
    # Meanwhile only the post whose same-age reach lagged 2.6x had a longest sentence of
    # 21 chars; the other 8 were all 25+.
    # So the axis is **the longest sentence, not variance**
    # (same direction as the user style guide's "the real defect of AI prose is the
    # absence of long sentences, not uniformity" — contrast corpus: long sentences per
    # 1000, AI 8.1 vs. human 91.3).
    #
    # 9 samples with 4 chars of margin is thin evidence. So it's S2, not S1 (block), and
    # surfaces to the author's eyes only. Surfaces whose schema binds length (narration
    # 8~25 chars, subtitle ≤30) and fragment surfaces (screen·yt) are off — short is
    # normal there.
    if "C7" not in cfg["off"] and len(sents) >= 5:
        longest = max((visible_len(s) for _, s in sents), default=0)
        if longest < C7_FLOOR:
            at = max(range(len(sents)), key=lambda i: visible_len(sents[i][1]))
            findings.append({
                "id": "C7", "severity": "S2",
                "label": f"no long sentence — longest is {longest} chars (all short)",
                "line": line_of(text, sents[at][0]),
                "excerpt": sents[at][1][:40],
                "fix": "Run at least one sentence long. If the piece is chopped into a list, rethink the material and hook first",
            })

    # Quoted-span violations are excluded from score and verdict — the pipeline isn't
    # halted over text that can't be fixed. They stay in the report to prompt checking
    # the original.
    live = [f for f in findings if not f.get("quoted")]
    quoted = [f for f in findings if f.get("quoted")]

    score = 100
    for f in live:
        score -= PENALTY[f["severity"]]
    for m in metrics:
        # Length deviations are penalized by ratio — charging one deviant sentence and
        # all-deviant the same 3 points passes schema violations (measured: a single
        # 1-char narration sentence was a PASS).
        if m.get("total"):
            ratio = m["count"] / m["total"]
            score -= min(15, round(15 * ratio)) + (5 if ratio > 0.5 else 0)
        else:
            score -= METRIC_PENALTY
    score = max(0, score)

    s1 = sum(1 for f in live if f["severity"] == "S1")
    exit_code = 2 if s1 else (1 if score < WARN_BELOW else 0)
    # An exemption must not become a silent pass. The checker doesn't know whether the
    # source is real — the eight chars "출처: 안내문" can drop six S1s from the verdict
    # (measured). So the fact that an exemption applied is itself raised to a human:
    # exit 0 is floored to 1 (warn), riding publish §1's existing rule ("exit 1 goes
    # verbatim into the approval prompt"). 1 isn't a block, so legitimate quotes proceed
    # to publishing.
    if quoted and exit_code == 0:
        exit_code = 1

    return {
        "surface": surface,
        "chars": len(text),
        "scope": {"hangul_share": None if share is None else round(share, 3),
                  "letters": letters, "hangul": hangul},
        "sentences": len(sents),
        "findings": findings,
        "quoted_findings": len(quoted),
        "metrics": metrics,
        "score": score,
        "s1": s1,
        "s2": sum(1 for f in live if f["severity"] == "S2"),
        "s3": sum(1 for f in live if f["severity"] == "S3"),
        "verdict": {0: "PASS", 1: "WARN", 2: "FAIL"}[exit_code],
        "exit_code": exit_code,
    }


def render(r: dict) -> str:
    # SKIP says what it could not do, and says the copy is unchecked in as many words.
    # Anyone reading this line has to come away knowing no judgement was made.
    if r["verdict"] == "SKIP":
        sc = r.get("scope") or {}
        return "\n".join([
            f"check-style — surface {r['surface']} / {r['chars']} chars",
            f"verdict SKIP · not Korean (hangul {sc.get('hangul_share')} of "
            f"{sc.get('letters')} letters and {sc.get('hangul')} syllables; "
            f"in scope needs share ≥ {HANGUL_MIN_SHARE} or ≥ {HANGUL_MIN_CHARS} syllables)",
            "",
            "  This copy was NOT checked. Every rule in check-style.py is Korean —",
            "  Korean translationese, Korean AI stock phrases, Korean sentence endings.",
            "  Nothing here says the copy reads well; it says the checker cannot read it.",
            "  A human has to judge this text, and for English the tells to hunt are the",
            "  ones README lists: delve · leverage · robust · seamless · comprehensive ·",
            "  crucial · foster · testament · landscape, and \"It's not X, it's Y\".",
        ])
    head = (f"verdict {r['verdict']} · score {r['score']}/100 · "
            f"S1 {r['s1']} S2 {r['s2']} S3 {r['s3']}")
    if r["quoted_findings"]:
        head += f" · quote-exempt {r['quoted_findings']}"
    lines = [
        f"check-style — surface {r['surface']} / {r['chars']} chars {r['sentences']} sentences",
        head,
        "",
    ]
    live = [f for f in r["findings"] if not f.get("quoted")]
    quoted = [f for f in r["findings"] if f.get("quoted")]
    if live:
        lines.append("[findings]")
        for f in live:
            lines.append(f"  {f['severity']} {f['id']} L{f['line']} {f['label']}")
            lines.append(f"      … {f['excerpt']} …")
            lines.append(f"      → {f['fix']}")
    else:
        lines.append("[findings] none")
    if quoted:
        lines.append("")
        lines.append(f"[quote exemptions: {len(quoted)} — excluded from score, verdict floors at WARN]")
        for f in quoted:
            lines.append(f"  ({f['severity']} {f['id']}) L{f['line']} {f['label']} — {f['excerpt']}")
        lines.append("  If it relays someone else's words, don't fix it. If we wrote it, drop the quotes and fix it.")
    if r["metrics"]:
        lines.append("")
        lines.append("[metrics]")
        for m in r["metrics"]:
            lines.append(f"  {m['id']} L{m['line']} {m['label']}")
            for d in m["detail"]:
                lines.append(f"      {d}")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Self-verification — run on every rule change. Three axes: does it catch slop,
# does it pass clean prose, does it avoid false positives in Do-NOT spans.
# ---------------------------------------------------------------------------

SELFTEST = [
    # --- language scope (exit 4 = SKIP) -------------------------------------------
    # English carrying the tells README bans. Before the scope guard these came back
    # PASS with 0 findings, because MASKS had blanked every Latin run.
    ("english is skipped, never passed", "narration", 4,
     "It is not merely a tool, it is a partner. In today's rapidly evolving landscape, "
     "leveraging robust and seamless solutions is crucial. Delve into the comprehensive "
     "framework that fosters innovation. It's a testament to what teams can achieve.\n"),
    # CJK that isn't Korean has no Latin to dilute the ratio — FOREIGN_RE is what stops
    # it reading as 0/0 and slipping through as Korean.
    ("japanese is skipped", "narration", 4,
     "これは日本語のナレーションです。韓国語ではありません。チェッカーは読めません。\n"),
    ("chinese is skipped", "narration", 4,
     "这是一段中文旁白，不是韩语，检查器无法阅读它。这句话应该被跳过。\n"),
    # A foreign text may carry a little Hangul — a hashtag, a product name — and that must
    # not buy it a pass. Both fixtures sit ABOVE HANGUL_MIN_CHARS on purpose: a fixture one
    # syllable under the boundary passes without ever testing the boundary, which is how the
    # hole came back once already. Five hashtags, because one is easy and a handful is not.
    ("english with korean hashtags is still skipped", "threads", 4,
     "It is not merely a tool, it is a partner. In today's rapidly evolving landscape, "
     "leveraging robust and seamless solutions is crucial. Delve into the comprehensive "
     "framework that fosters innovation. It's a testament to what teams can achieve. "
     "#한국어 #딸깍 #연구소 #버즈 #클로드\n"),
    # The same paragraph with a bare Korean product name in the prose — no hashtag to strip,
    # 5 syllables, and it still has to skip. This is what the share floor is for.
    ("english with a korean product name is still skipped", "threads", 4,
     "It is not merely a tool, it is a partner. In today's rapidly evolving landscape, "
     "leveraging robust and seamless solutions is crucial. Delve into the comprehensive "
     "framework that fosters innovation. We use 딸깍연구소 daily.\n"),
    # The thinnest real Korean surface in the library — 5 syllables at share 0.147, just
    # over the floor. The pair above and this one are what separate the two populations.
    ("short latin-dense korean stays in scope", "reply", 0,
     "ffmpeg concat demuxer로 stream copy 하면 돼요.\n"),
    # The other direction, and the one that matters more: Korean thick with Latin product
    # names stays in scope. Share 0.464 — below the ratio threshold — but 13 Hangul
    # syllables, so the absolute-count condition keeps it. This is a real library string.
    ("jargon-dense korean stays in scope", "narration", 2,
     "claude --plugin-dir로 이번 실행에서만 불러오세요.\n"
     "GitHub Pages와 Vercel입니다.\n"
     "이 제도는 개정되어졌습니다.\n"),
    # Too few letters to judge a language — let it through to the rules rather than
    # declining, since the rules under-report on foreign text but never invent findings.
    ("short strings are judged, not skipped", "screen", 0, "네, 맞아요.\n"),

    ("slop detected", "narration", 2,
     "오늘은 임시거주 제도에 대해 함께 알아볼까요.\n"
     "이 제도는 개정되어졌습니다.\n"
     "신고 기한이 중요한 의미를 가지고 있습니다.\n"
     "결론적으로 이 변화는 시사하는 바가 큽니다.\n"
     "단순한 절차가 아니라 생활의 문제입니다.\n"
     "등록이 아니라 보호의 문제입니다.\n"
     "도움이 되셨길 바랍니다.\n"),
    ("clean prose passes", "narration", 0,
     "신고 기한이 바뀌었다.\n전에는 사흘이었다.\n이제는 도착 즉시다.\n"
     "하루만 늦어도 과태료가 나온다.\n영수증을 받아 두자.\n"),
    ("no false positives", "ig", 0,
     "신고가 도착 즉시로 바뀝니다 🇻🇳\n"
     "시행일은 2026년 7월 15일, 과태료는 300만~500만 동.\n"
     "접수증 사진은 남겨두세요.\n"
     "링크는 https://example.com/guide 를 보세요.\n"
     "#베트남 #임시거주 #하노이\n"),
    ("no conjunctive-adverb false positives", "fb", 0,
     "신고 기한이 도착 즉시로 바뀝니다.\n"
     "하지만, 집주인이 대신 신고하는 관행은 그대로입니다.\n"
     "그런데, 최종 책임은 본인 몫입니다.\n"
     "여러분은 어떻게 하고 계신가요?\n"),
    # D8 report-register stative verbs — user directive (2026-08-12). All endings S1.
    ("report-register stative verbs detected", "narration", 2,
     "올가을 추천은 둘로 나뉩니다.\n"
     "미용실마다 말이 갈려요.\n"
     "선택지는 두 개가 남는다.\n"),
    # Second expansion (same day) — the '남기다' family, present formal. Transitive,
    # but the same report-register grain.
    ("report-register 남긴다 detected", "narration", 2,
     "판정 근거는 로그에 남긴다.\n"),
    ("report-register 남깁니다 detected", "narration", 2,
     "확인한 값만 문서에 남깁니다.\n"),
    # Quotes and reported speech are caught too — blocks the bypass of keeping the same
    # read-aloud register while avoiding the ending.
    ("report-register quoted form detected", "threads", 2,
     "추천이 갈린다는 게 문제야.\n"),
    # Normal colloquial, adnominal, and conditional uses of the same words aren't
    # caught — over-blocking prevention.
    ("no report-register false positives", "threads", 0,
     "휴가 사흘 남았어.\n"
     "추천이 갈리는 이유가 궁금해서 물어봤어.\n"
     "접수증은 꼭 남겨 둬.\n"
     "후기 남겼어.\n"
     "메모 남기는 게 나아.\n"
     "둘로 나뉜다면 그때 다시 보자.\n"
     "처음엔 저도 헷갈렸어요. 이름이 비슷해서 헷갈립니다.\n"),  # '헷갈리다' is an everyday word
    # '살아남다' is a different verb (1 measured over-block). On threads D9 (written-
    # register ending) catches it, so D8's lookbehind is pinned separately on narration,
    # where D9 is off.
    ("no 살아남다 false positive", "narration", 0,
     "셸을 닫아도 녹화는 살아남는다.\n"),
    # Slop that avoids lexical tells but drifts into observational endings — a type the
    # early rules missed.
    ("observational slop detected", "fb", 2,
     "이번 개정은 많은 분들에게 도움이 될 것으로 보입니다.\n"
     "다양한 사례가 보고되고 있습니다.\n"
     "앞으로의 변화가 주목됩니다.\n"),
    # The register the platform grammar demands — the checker must not drag it toward
    # written style.
    ("casual spoken style passes", "threads", 0,
     "신고 기한 바뀐 거 알아?\n"
     "예전엔 사흘이었는데 이제 도착하자마자야.\n"
     "집주인이 해주겠거니 하다가 과태료 물더라.\n"
     "너는 어떻게 하고 있어?\n"),
    # D9 — the very sentences the user pointed at are the answer key (2026-08-13).
    ("written-register declarative endings detected", "threads", 2, (
        '"예쁘게 만들어줘"라고 하면 어디서 본 것 같은 화면이 나온다.\n'
        "요즘은 주소부터 준다.\n"
        "맘에 드는 사이트 링크를 붙이고 이렇게 친다.\n"
    ), ("D9",)),
    # The four the ㄴ final-consonant filter must split off: adjective base form ·
    # connective · conditional · '-이다'.
    ("no written-register ending false positives", "threads", 0,
     "이게 훨씬 편하다.\n"
     "쟤는 내일 간다고 했어.\n"
     "네가 간다면 나도 같이 갈게.\n"
     "그건 그냥 취향 차이다.\n"
     "이 방법이 제일 빠른 길이라 나는 요즘 계속 이렇게 쓰고 있어.\n"),
    # D9b is S2 with thr=1 — three hits count as two, 86 points, exit 0. A penalty,
    # not a block.
    ("diary-past endings detected", "threads", 0, (
        "어제 밤에 데이터 옮기는 스크립트를 짜서 돌려 봤더니 삼십 분 만에 다 끝나서 로그부터 확인했다.\n"
        "남은 시간에는 그동안 밀린 문서를 정리했다.\n"
        "정리하다 보니 예전에 적어 둔 메모가 쓸모 있었다.\n"
    ), ("D9b",)),
    ("keyword-style title passes", "yt", 0,
     "베트남 임시거주 신고 도착 즉시로 변경 — 2026년 7월 시행\n"
     "사흘이던 기한이 없어졌습니다. 과태료 기준과 접수증 보관까지 정리했습니다.\n"
     "#Shorts #베트남 #임시거주\n"),
    # The three bypasses that hide slop behind chunk masks — quote marks, backticks,
    # code fences. Quote marks without attribution aren't a quote.
    ("quote-mark bypass blocked", "ig", 2,
     '"오늘은 제도에 대해 함께 알아볼까요. '
     '결론적으로 이 변화는 시사하는 바가 큽니다."\n'),
    # Narrative vocabulary that identifies no source earns no exemption. All six are
    # pinned individually — block one and the rest remain (measured: all six used to
    # pass).
    ("narrative-vocabulary bypass blocked — 그가 말했다", "ig", 2,
     '그가 말했다. "오늘은 제도에 대해 함께 알아볼까요. 결론적으로 시사하는 바가 큽니다."\n'),
    ("narrative-vocabulary bypass blocked — 이렇게", "ig", 2,
     '이렇게. "오늘은 제도에 대해 함께 알아볼까요. 결론적으로 시사하는 바가 큽니다."\n'),
    ("narrative-vocabulary bypass blocked — 다음과 같습니다", "ig", 2,
     '다음과 같습니다. "오늘은 제도에 대해 함께 알아볼까요. 결론적으로 시사하는 바가 큽니다."\n'),
    ("narrative-vocabulary bypass blocked — 전문가는 밝혔다", "ig", 2,
     '전문가는 밝혔다. "오늘은 제도에 대해 함께 알아볼까요. 결론적으로 시사하는 바가 큽니다."\n'),
    ("narrative-vocabulary bypass blocked — 적혀 있다", "ig", 2,
     '적혀 있다. "오늘은 제도에 대해 함께 알아볼까요. 결론적으로 시사하는 바가 큽니다."\n'),
    ("narrative-vocabulary bypass blocked — 인용", "ig", 2,
     '인용. "오늘은 제도에 대해 함께 알아볼까요. 결론적으로 시사하는 바가 큽니다."\n'),
    # Demonstratives and generic nouns that identify nothing aren't markers.
    ("demonstrative bypass blocked — 이것에 따르면", "ig", 2,
     '이것에 따르면 "오늘은 제도에 대해 함께 알아볼까요. 결론적으로 시사하는 바가 큽니다."\n'),
    ("generic-noun bypass blocked — 자료에 따르면", "ig", 2,
     '자료에 따르면 "오늘은 제도에 대해 함께 알아볼까요. 결론적으로 시사하는 바가 큽니다."\n'),
    # The bypass of dropping an agency name at the head of the previous line and bundling
    # slop below — outside the last 40 chars, so it doesn't count.
    ("prev-line-head agency-name bypass blocked", "ig", 2,
     '공안부 자료를 정리했습니다. 신고 기한과 과태료 기준, 접수증 보관 방식, '
     '온라인 확인 절차까지 하나씩 짚어 봤습니다.\n'
     '"오늘은 제도에 대해 함께 알아볼까요. 결론적으로 시사하는 바가 큽니다. '
     '도움이 되셨길 바랍니다."\n'),
    # Personal-source quotes are exempt too — recognizing only agencies prescribes
    # fixing someone else's text message.
    ("personal-source quote exemption — landlord", "fb", 1,
     "집주인이 보낸 문자는 이랬습니다.\n"
     '"신고는 제가 대신 했고, 접수증은 나중에 드릴게요. 급하시면 직접 가셔도 되는데, '
     '서류는 제가 가지고 있어서 같이 가셔야 합니다."\n'
     "그래서 직접 갔더니 접수 기록이 없었습니다.\n"),
    # "~를 보고 알았습니다" is how they found out, not a relay — not a marker.
    ("an account of events is not a marker", "fb", 2,
     "친구가 보낸 문자를 보고 알았습니다. 제도가 바뀐 걸 몰랐거든요.\n"
     '"오늘은 제도에 대해 함께 알아볼까요. 결론적으로 시사하는 바가 큽니다."\n'),
    # Same ending, but a relaying verb after it makes a quote intro, not an occasion.
    # When the subject is outside SOURCE_NOUNS (a friend, a boss, a senior), the action
    # form is the only path — block it and legitimate quotes get blocked.
    ("a relaying verb makes it a quote intro", "fb", 1,
     "친구가 보낸 문자를 받고 그대로 옮깁니다.\n"
     '"신고는 제가 대신 했고, 접수증은 나중에 드릴게요. 급하시면 직접 가셔도 '
     '되는데, 서류는 제가 가지고 있어서 같이 가셔야 합니다."\n'),
    ("personal-source quote exemption — action form", "fb", 1,
     "사장님이 보낸 메일 그대로입니다.\n"
     '"연차는 본인이 신청해야 하는데, 대리 신청은 인정되지 않습니다."\n'),
    # Identifying the source exempts — three paths: agency name, statute name, URL. Even
    # exempted, exit is 1 (the checker doesn't know if the source is real — the
    # exemption is raised to a human to confirm).
    ("identified-source quote exemption — agency/statute", "fb", 1,
     '공안부 시행령 원문은 이렇게 돼 있습니다.\n'
     '"신고 의무는 체류자 본인에게 있어서 대행 여부와 무관하게 판단되어진다."\n'),
    ("identified-source quote exemption — URL", "fb", 1,
     '원문 https://example.gov.vn/decree 에는 이렇게 적혀 있습니다.\n'
     '"신고 의무는 체류자 본인에게 있어서 대행 여부와 무관하게 판단되어진다."\n'),
    # An exemption can't become a silent PASS — even a short source prefix that erases
    # the S1s leaves exit at 1.
    ("exemption can't produce exit 0", "ig", 1,
     '출처: 안내문\n'
     '"오늘은 제도에 대해 함께 알아볼까요. 결론적으로 시사하는 바가 큽니다. '
     '도움이 되셨길 바랍니다."\n'),
    # The only shape PREV_LINE_TAIL protects — the source on the previous line and the
    # quote indented more than 60 chars into its own line. The 60-char window can't
    # reach the previous line; only the prev-line tail does.
    # Roll the constant back to 0 and this legitimate quote gets blocked at exit 2
    # (measured).
    ("prev-line tail protects deep indentation", "fb", 1,
     "이번에 바뀐 부분은 시행령에 그대로 나와 있습니다.\n"
     "제가 읽은 그대로 아래에 옮겨 둡니다. 손대거나 앞뒤를 자르지 않았고 번역도 "
     "하지 않았어요. 원문입니다 "
     '"신고 의무는 체류자 본인에게 있어서 대행 여부와 무관하게 판단되어진다."\n'),
    # People don't write sources to fit within 60 chars — the line right above the quote
    # exempts regardless of distance.
    ("prev-line attribution regardless of distance", "fb", 1,
     '아래는 이번에 바뀐 부분을 확인하려고 찾아본 공안부 시행령의 해당 조문 원문 '
     '그대로이며, 번역 없이 옮깁니다.\n'
     '"신고 의무는 체류자 본인에게 있어서 대행 여부와 무관하게 판단되어진다."\n'),
    ("backtick bypass blocked", "ig", 2,
     "`오늘은 제도에 대해 함께 알아볼까요. 결론적으로 시사하는 바가 큽니다.`\n"),
    ("code-fence bypass blocked", "ig", 2,
     "```\n오늘은 제도에 대해 함께 알아볼까요. 도움이 되셨길 바랍니다.\n```\n"),
    # The checklist genre's basic phrasing — a noun list is not a triple listing.
    ("noun list passes", "fb", 0,
     "여권, 비자, 계약서를 챙기세요.\n하노이, 다낭, 호치민은 절차가 다릅니다.\n"),
    # Verbatim quotes can't be fixed — no score is charged, but the exemption itself
    # shows up as a warning.
    ("quoted span excluded from score", "fb", 1,
     "공안부 시행령 원문은 이렇게 돼 있습니다.\n"
     "\"신고 의무는 체류자 본인에게 있어서 대행 여부와 무관하게 판단되어진다.\"\n"
     "쉽게 말하면 집주인이 해줬어도 책임은 본인이 집니다.\n"),
    # Slop outside the quote gets no such favor.
    ("violations outside the quote still block", "fb", 2,
     "시행령 원문은 이렇다.\n"
     "\"신고는 도착 즉시 이루어져야 한다.\"\n"
     "결론적으로 이 변화는 시사하는 바가 큽니다.\n"),
    # The exemption condition is attribution, not share — both sides of the boundary
    # are pinned.
    # ① Unattributed quote marks earn no exemption even at a low share (bypass blocked).
    ("unattributed quote gets no exemption", "ig", 2,
     "이번 개정 내용을 정리했습니다. 시행일과 과태료 기준을 아래에 적었습니다.\n"
     "접수증 보관 방법도 함께 넣었습니다. 필요한 분은 저장해두세요.\n"
     "현장에서 자주 나오는 질문도 마지막에 붙였습니다.\n"
     "\"오늘은 제도에 대해 함께 알아볼까요. 결론적으로 시사하는 바가 큽니다.\"\n"),
    # ② An attributed quote is exempt even at a high share (legitimate verbatim quote).
    ("attributed quote exempt regardless of share", "fb", 1,
     "시행령 원문입니다.\n"
     "\"거주지 이전 신고는 도착 즉시 이루어져야 하며, 신고 의무는 체류자 본인에게 "
     "있어서 집주인의 대행 여부와 무관하게 판단되어진다.\"\n"),
    # A fixed idiom is not negation parallelism.
    ("다름 아니라 passes", "threads", 0,
     "다름 아니라 어제 겪은 일인데.\n다름 아니라 신고 기한 얘기야.\n"),
    # Press-release prose with no lexical tell, just empty content.
    ("hollow rhetoric detected", "fb", 1,
     "디지털 전환의 물결 속에서 제도도 바뀝니다.\n"
     "규제와 자율의 균형점을 찾아가는 과정입니다.\n"
     "중요한 것은 방향입니다.\n"),
    # A reply's opening line — standard golden-hour engagement.
    ("reply greeting passes", "reply", 0,
     "안녕하세요, 문의 주신 부분 확인했습니다.\n접수증은 그 자리에서 줍니다.\n"),
    # A lecture has someone to order around — with only an intransitive verb it's the
    # speaker's own resolve or a forecast.
    ("no D3 resolve/forecast false positives", "fb", 0,
     "내가 가야 할 것입니다.\n언젠가는 바뀌어야 할 것입니다.\n시간이 지나야 할 것입니다.\n"
     "나도 서류를 챙겨야 할 것입니다.\n저도 신고를 다시 해야 할 것입니다.\n"),
    # The addressee honorific targets the reader even without an object.
    ("D3 addressee honorific is a lecture", "fb", 2,
     "서두르셔야 할 것입니다.\n조심하셔야 할 것입니다.\n"),
    # A branch that only the speech act can split is not rejected. News is a genre that
    # writes forecasts — at S1, all 7 normal sentence types got blocked (measured 7/7).
    ("D3b forecasts and conditional conclusions aren't rejected", "fb", 0,
     "내년에는 제도를 바꿔야 할 것이다.\n기한을 넘기면 과태료를 내야 할 것이다.\n"),
    # The other side — the branch with no false-positive risk still rejects.
    ("D3 fixed idioms are rejected", "fb", 2,
     "확인할 필요가 있습니다.\n점검하는 것이 중요합니다.\n이 점을 명심해야 한다.\n"),
    # The first-person exemption must apply to D3 only — as a span exemption, "나도"
    # becomes a bypass.
    ("first-person exemption doesn't shield other rules", "fb", 2,
     "나도 이 제도에 대해 정리해야 할 것입니다.\n"
     "저도 결론적으로 다시 봐야 할 것입니다.\n"),
    # D2 adnominals split on the following noun — a concrete noun means factual
    # reporting (this was a P0 false positive).
    ("no D2 concrete-noun false positives", "fb", 0,
     "주목받는 기업은 세 곳입니다.\n올해 주목받는 품목은 전자부품입니다.\n"
     "이번 개정으로 주목받고 있는 기업이 많습니다.\n현지에서 주목받은 사례를 소개합니다.\n"),
    ("D2 adnominal/final forms before abstract nouns", "fb", 2,
     "주목받는 변화입니다.\n주목되는 대목은 기한입니다.\n이번 개정이 주목됩니다.\n"),
    # T5: a stem precedes the passive suffix — matching a word's first char catches
    # these.
    ("no T5 word-initial false positives", "fb", 0,
     "이 지표에 의해 진도를 판단합니다.\n조사에 의해 진실이 밝혀졌습니다.\n"
     "통계에 의해 받침이 생겼습니다.\n"),
    # Round-3 recommended expansion — T1 관해 · A1 ㅂ시다 · A2 참고 부탁
    ("T1 관해 · A1 ㅂ시다 · A2 참고 부탁", "fb", 2,
     "제도에 관해 알아보겠습니다.\n같이 살펴봅시다.\n참고 부탁드립니다.\n"),
    ("no round-3 expansion false positives", "fb", 0,
     "규정에 관한 설명입니다.\n개인정보 보호에 관한 법률 조문입니다.\n"
     "서류를 챙깁시다.\n참고 자료를 첨부했습니다.\n"),
    # 5 misses from the particle-variant / colloquial-contraction sweep. Invisible when
    # only conjugated forms were checked.
    ("colloquial contractions and particle variants", "fb", 2,
     "결론적으론 그렇습니다.\n판단되어질 수 있습니다.\n확인할 필요성이 있습니다.\n"
     "같이 살펴보시죠.\n도움 되셨나요?\n구독 좋아요 눌러주세요.\n"),
    ("no colloquial-contraction false positives", "fb", 0,
     "기본적으론 맞습니다.\n개인적으론 반대입니다.\n좋아요 수가 늘었습니다.\n"
     "도움을 받았습니다.\n개인정보 보호에 관한 법률 조문입니다.\n"),
    # Misses from the conjugation sweep — the adnominal "~에 대한" and the spaced
    # "전해 드립니다".
    ("T1 adnominal · A4 spacing", "fb", 2,
     "제도에 대한 설명입니다.\n소식을 전해 드립니다.\n"),
    ("no T1/A4 accidental stem-match false positives", "fb", 0,
     "반대한 사람은 없었다.\n상대한 업체가 셋이다.\n말씀을 전해 드리려고 왔다.\n"),
    # Polite-ending double passives — `집` existed only on the 되어 stem, so the
    # representative forms leaked wholesale.
    ("T3 polite-ending double passive", "fb", 2,
     "효과가 보여집니다.\n기록이 잊혀집니다.\n규정이 쓰여집니다.\n"),
    ("no T3 split-stem false positives", "fb", 0,
     "집에 보여 준 서류다.\n잊혀 가는 관행이다.\n"),
    # D2/D3 misses on adnominals and other stems while only endings were caught. Found
    # in a real-sentence attack.
    ("D2/D3 adnominals and other stems", "fb", 2,
     "업계에서 크게 주목받는 변화다.\n가장 주목되는 대목은 기한이다.\n"
     "예약을 미리 잡아야 할 것이다.\n기한을 지켜야 할 것입니다.\n"),
    ("no D2/D3 false positives", "fb", 0,
     "관세총국 주목 대상 품목이다.\n내가 해야 할 일이 많다.\n"
     "다음에 가야 할 곳을 적었다.\n높게 평가받는 대행사를 골랐다.\n"),
    # With only 되·진·받 as passive endings, T5 misses "~된다"·"~됐다"·"~됩니다"
    # entirely.
    ("T5 common passive endings", "fb", 1,
     "검사 대상은 관세총국에 의해 갱신됩니다.\n제도가 개정안에 의해 시행됐습니다.\n"
     "절차가 고시에 의해 단축됩니다.\n"),
    ("no T5 된장 false positive", "fb", 0,
     "규정에 의해 된장 수입이 늘었다.\n그에 의해 사람들이 모였다.\n"),
    # The existence verb "있어" and the noun "여지" aren't translationese.
    ("no existence-verb false positives", "threads", 0,
     "영수증은 가방에 있어.\n지금 어디에 있어?\n다른 해석의 여지는 없다.\n"),
    # A short thank-you in a reply is golden-hour engagement (platform-guide
    # principle 4).
    ("reply thanks passes", "reply", 0,
     "알려주셔서 감사합니다.\n확인하고 바로 반영할게요.\n"),
    # Narration slop that drifts into assistant voice and mechanical listing instead of
    # lexical tells.
    ("assistant-voice narration detected", "narration", 2,
     "안녕하세요! 오늘 소식입니다.\n"
     "빠르고 간편하며 안전한 절차입니다.\n"
     "첫째로 신청서를 냅니다. 둘째로 서류를 냅니다. 마지막으로 기다립니다.\n"
     "끝까지 읽어주셔서 고맙습니다.\n"),
    # C7 no long sentence. Both fixtures are **actual published posts** — the one whose
    # same-age reach lagged 2.6x (longest 21 chars) and the best-performing one (longest
    # 30 chars). A pair with zero lexical tells yet opposite outcomes, so C7 is pinned
    # by these two.
    ("C7 no-long-sentence detected", "threads", 0, (
        "클로드코드로 스레드 자동 운영을 붙여봤어. 오늘 시간 날린 함정 세 개.\n"
        "1. 검색 기능은 앱 승인 전까지 내 글만 나와. 남의 글이 0건인 게 정상인데 버그로 착각했어.\n"
        "2. 글마다 붙은 번호가 두 종류야. 눈에 먼저 띄는 쪽을 쓰면 엉뚱한 글에 답글이 달려.\n"
        "3. 방금 올린 글 조회수가 0 이면 아직 집계 전이야. 계정 전체 숫자가 먼저 올라.\n"
        "자동화하다 이런 데서 하루 태운 사람 또 있어?\n"
    ), ("C7",)),
    # C1's `데,` branch. Ending-list enumeration kept leaking (2026-08-11 —
    # growth-post-reviewer found 2 survivors in publish copy). It attaches to any stem.
    ("C1 데-ending detected", "fb", 2,
     "일이 많은데, 시간은 없다.\n가고 싶은데, 못 갔다.\n비싼데, 살까.\n"
     "싶긴 한데, 사람이 읽는다.\n", ("C1",)),
    # The three to split off: the bound noun '데' (spaced) · nouns ending in '데' ·
    # sentence-initial '한데' (= 그런데).
    ("no C1 데 false positives", "fb", 0,
     "갈 데, 올 데를 정했다.\n기대, 실망이 반복됐다.\n받은 데이터, 보낸 데이터.\n"
     "한데, 그건 다르다.\n"),
    ("no C7 false positive (long sentence present)", "threads", 0, (
        "팔로워 2명인 계정인데 낮에 쓴 글 하나가 201명한테 갔어.\n"
        "스레드는 팔로워 안 보고 글 하나씩 뿌린다는 게 진짜더라.\n"
        "근데 좋아요 0, 댓글 0. 도달은 됐는데 아무도 반응을 안 한 거지.\n"
        "보고 그냥 지나갔다는 뜻이라 조회수보다 이게 더 신경 쓰여.\n"
        "정보만 던지고 끝낸 글이라 그럴 만도 한데 처음에 이 구간 어떻게 넘겼어?\n"
    )),

    # --- T10~T13 (unimplemented rules the 2026-08-14 deep research found in NIKL norms)
    ("T10 ~을 필요로 하다 rejected", "fb", 2,
     "이번 개정은 추가 검토를 필요로 합니다.\n"),
    # Bundling the three into one fixture gives 7+7+2=16, so 84 points — right below the
    # warn threshold (85). If any one dies the score rises and exit becomes 0, so exit
    # alone catches it.
    ("T11/T12/T13 warn", "fb", 1, (
        "접수 절차를 개선시킬 방법을 찾았어요.\n"
        "기한 전 신고에 주의가 요구됩니다.\n"
        "이 수치는 현지 물가가 얼마나 올랐는지를 말해 줍니다.\n"
    ), ("T11", "T12", "T13")),
    # T11 is a stem enumeration — catch legitimate causatives and three hits land here,
    # 79 points (exit 1).
    ("no T11 legitimate-causative false positives", "fb", 0,
     "아이를 학원에 등록시켰어요.\n차를 갓길에 정지시켰어요.\n매출을 크게 증가시켰어요.\n"),
    # T12/T13 check endings only. **Pinned by banned ID** — pinning by exit alone lets
    # one S2 (93 points) or one S3 (98 points), both exit 0, hide false positives below
    # the threshold. The `~다는` (adnominal clause) false positive actually passed
    # through that hole.
    ("no T12 adnominal/conditional/connective false positives", "fb", 0,
     "요구되는 서류가 늘었어요.\n주의가 요구된다면 그때 공지할게요.\n"
     "추가 서류가 요구된다고 해요.\n추가 서류가 요구된다는 지적이 나왔어요.\n",
     (), ("T12",)),
    ("no T13 adnominal/connective false positives", "fb", 0,
     "자료가 말해 주는 것은 분명해요.\n이 수치는 물가가 올랐다는 뜻을 말해 준다고 해요.\n"
     "이 수치는 물가가 올랐다는 뜻을 말해 준다는 점에서 중요해요.\n",
     (), ("T13",)),
]


def selftest() -> int:
    """A fixture is (name, surface, expected exit, body[, required IDs[, banned IDs]]).

    The 5th item is the **set of IDs that must be detected**. When only exit codes were
    checked, S2/S3 rules couldn't be pinned by fixtures — one hit docks only 7 or 2
    points, exit stays 0, and a rule could die silently while staying green (found while
    adding C7). So the IDs are pinned too.

    The 6th item is the reverse — the **set of IDs that must NOT fire**. Pinning a
    false-positive fixture by exit 0 alone lets S2/S3 false positives hide below the
    threshold: one S2 is 93 points, one S3 is 98, both exit 0. T12's `~다는` false
    positive (adnominal clause misread as an ending) passed the self-test through that
    hole (caught in the 2026-08-14 code review). **The lower a rule's severity, the more
    its false-positive fixtures must be pinned by ID, not exit.**
    """
    failed = 0
    for case in SELFTEST:
        name, surface, want, text = case[:4]
        want_ids = set(case[4]) if len(case) > 4 else set()
        deny_ids = set(case[5]) if len(case) > 5 else set()
        got = analyze(unicodedata.normalize("NFC", text), surface)
        got_ids = {f["id"] for f in got["findings"]}
        missing = want_ids - got_ids
        leaked = deny_ids & got_ids
        ok = got["exit_code"] == want and not missing and not leaked
        failed += 0 if ok else 1
        ids = ",".join(sorted(got_ids)) or "-"
        note = f" missing={','.join(sorted(missing))}" if missing else ""
        note += f" false-positive={','.join(sorted(leaked))}" if leaked else ""
        print(f"[{'PASS' if ok else 'FAIL'}] {name} ({surface}) "
              f"exit={got['exit_code']} expected={want} score={got['score']} found={ids}{note}")
    print(f"\n{len(SELFTEST) - failed}/{len(SELFTEST)} passed")
    return 1 if failed else 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Deterministic Korean AI-tell checker")
    p.add_argument("path", nargs="?", help="text file to check (- for stdin)")
    p.add_argument("--surface", choices=SURFACES,
                   help="surface — thresholds and disabled rules differ per surface")
    p.add_argument("--json", action="store_true", help="structured output")
    p.add_argument("--doc", action="store_true",
                   help="internal-doc mode — additionally masks markdown tables and "
                        "quote blocks. Never use on produced copy (tables become "
                        "slop hideouts)")
    p.add_argument("--selftest", action="store_true", help="self-verify the rules against built-in fixtures")
    args = p.parse_args(argv)

    if args.selftest:
        return selftest()
    if not args.path or not args.surface:
        p.error("path and --surface are required (--selftest to only verify the rules)")

    try:
        raw = sys.stdin.read() if args.path == "-" else open(args.path, encoding="utf-8").read()
    except OSError as e:
        print(f"check-style: couldn't read input — {e}", file=sys.stderr)
        return 3

    text = unicodedata.normalize("NFC", raw)
    if not text.strip():
        print("check-style: empty input", file=sys.stderr)
        return 3

    try:
        result = analyze(text, args.surface, args.doc)
    except Exception as e:  # don't let a dying gate block the pipeline
        print(f"check-style: analysis failed — {e}", file=sys.stderr)
        return 3

    print(json.dumps(result, ensure_ascii=False, indent=2) if args.json else render(result))
    return result["exit_code"]


if __name__ == "__main__":
    sys.exit(main())
