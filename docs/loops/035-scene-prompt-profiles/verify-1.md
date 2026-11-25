# Independent verification, round 1

Revision `f7b5cf91` scored 78/100, with three critical findings. The server passed 1,367 tests and the reviewer independently ran twelve relevant tests and seventeen skill lint rules.

| Criterion | Score |
| --- | ---: |
| Storyboard entry and scene scope | 25/25 |
| Model and operation specificity | 23/25 |
| Dialogue and media fidelity | 12/25 |
| Preview and execution | 10/15 |
| Regression coverage and documentation | 8/10 |

1. Comma attribution allowed two characters to exchange their approved lines. The validator also accepted the wrong face with the right sample and an additional spoken quote.
2. A saved FastH3 draft referred to a camera clip by its ordinal. Reversing the clip list silently changed the source. MSR accepted nonexistent image and audio numbers.
3. Two trailing spaces survived in the signed MSR plan but disappeared in the adapter schema before the provider request was serialized.

The next round must reproduce all three cases against the public planner and the final adapter payload. Offline results measure prompt and binding contracts.
