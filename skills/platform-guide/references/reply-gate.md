# The reply gate — the machine style check, then the adversarial review

Every reply a growth loop sends passes two gates before it leaves. A reply is
person-to-person conversation, which is where AI tells get caught fastest, and a bad
one is public under the channel's own name.

## Contents

- [1. The machine gate](#1-the-machine-gate) — `check-style.py --surface reply`
- [2. The adversarial review](#2-the-adversarial-review) — the growth-post-reviewer agent
- [What to attach, per platform](#what-to-attach-per-platform) — the context the reviewer needs
- [When it never clears](#when-it-never-clears) — the skip record

## 1. The machine gate

```bash
CS=${CLAUDE_PLUGIN_ROOT}/skills/platform-guide/references/check-style.py
printf '%s\n' "$reply_copy" | python3 $CS --surface reply -; echo "gate_exit=$?"
```

exit 2 (S1) means fix, then send. The rules are
[korean-style.md](korean-style.md).

**Read the detection list even on exit 0.** S2 only deducts points and still passes, so
"green means send" kills the gate. **If C7 (no long sentence) fires, don't send as-is** —
the copy is all short sentences, so lengthen one or re-pick the subject and hook.

exit 4 is SKIP, not PASS: the text isn't Korean enough to judge, so the style score is
`n/a` and a human reads it instead.

## 2. The adversarial review

Copy that cleared the machine gate goes to the **growth-post-reviewer** agent. Delegate
the tick's reply copy **as one batch** on the `inbox_reply` surface, and include the
`growth-plan.md` and `profile.md` paths plus the self-check exit codes.

**Only copy with score ≥95 and p0=0 gets sent.**

Fix a FAIL **by deletion only**, per the correction directives — planting a simile or a
stock phrase that wasn't there is a fresh AI tell, so a rewrite that adds words makes the
next round worse.

## What to attach, per platform

Attach these with each reply. Without them the reviewer's context axis scores 0.

| Platform | Attach with each reply |
|---|---|
| Instagram | the original comment, and the caption of our post it was left on |
| YouTube | the original comment, and the title and description of our video it was left on |
| Threads | the original comment, and the text of our post it was left on |

## When it never clears

Max 3 rounds. If a reply still hasn't cleared, **don't send it** — log it in growth-log as
`skipped (gate NN)` and move on. A tick that skips one reply is a normal tick.

Spam and hate comments get no reply at all, only a mention in the next tick summary.
Hiding them is outside autonomous scope.
