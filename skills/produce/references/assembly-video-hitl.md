# Video assembly findings and authorization

Follow [automation guidance](../../_shared/automation-guidance.md). The owner's
2026-10-16 direction replaces the earlier mandatory approval of each visual warning.
Quality findings inform the edit; they do not hold an already authorized local assembly.

When useful, inspect the current plan and media:

```bash
node "$REF/assembly-video-gate.js" check .work storyboard
```

Read `.work/assembly-video-warnings.json` if the checker produced it. Fix concrete
problems within the requested scope, or assemble the authorized inputs and explain
the remaining findings with the output. Mark unreviewed playback as unreviewed.
Do not write PASS reviews, erase evidence, invent warning approval or regenerate
paid clips merely to satisfy a quality checker.

Prior authorization still governs the actual action. A storyboard-only request does
not authorize assembly, and assembly does not authorize new paid calls or publication.
Reuse an explicit assembly request or standing authorization without asking again
because a creative warning appeared.

Missing or unreadable inputs, incompatible encoding inputs, broken manifest wiring
and actual encoder failures still need resolution before the operation can execute.
Continue independent work while resolving those dependencies. Preserve source hashes,
actual warnings, performed actions and output verification results in the build record.
A changed input makes old review evidence stale; it does not manufacture permission
or force another quality-approval ceremony.
