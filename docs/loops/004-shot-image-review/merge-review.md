# Merge review follow-up

The independent PR review found one High issue after the earlier rubric review:
12 distinct-byte images with identical pixels produced 66 pairwise findings. The
checker could exit before its piped JSON flushed, truncating output at 65,536 bytes.
The storyboard adapter also inherited a one-MiB subprocess output limit.

The fix groups connected similarity candidates, retains the complete matching-pair
count and all shot references, and includes at most eight example comparisons per
group. The wording explicitly says not every pair in a group necessarily matches.
The checker now drains stdout naturally, and the adapter allows up to 16 MiB.

Regression tests cover the dense 12-image case and actual CLI/adapter responses
larger than one MiB. Source `npm run check` passed all 1,896 tests; skill lint passed
16 rules across 21 skills. Updated per-module output and the self-contained bundle
are included in this change. The earlier reports describe their historical snapshots.

The local installation candidate preserves the newer `0.114.1-acting.2` base and
applies this fix as `0.114.1-shot-images.5`. Raw follow-up logs are under the archived
`.work/merge-*.log` paths described in [archive.md](archive.md).
