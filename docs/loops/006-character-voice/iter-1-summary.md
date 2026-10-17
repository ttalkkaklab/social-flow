# Implementation and verification record

Character casting now reads confirmed age, explicit vocal gender, timbre, pace,
register and character context from structured identity data. Read-only plans compare
actual provider metadata, preserve unknowns, and expose the exact synthesis request.
A persistent Gemini acoustic baseline survives scene emotion. Optional Gemini 3.8
sample turns carry separate excerpt directions on the same candidate voice.
Selection verifies complete provider requests, audio hashes and unchanged identity;
no local channel candidate was automatically selected.

Regression coverage includes changed identities, unknown/conflicting metadata,
age-category boundaries, baseline preservation, overlength controls, ordered excerpt
text, unsupported adapters, baseline/acting tampering, wrong-character scores,
professional-band evidence, placeholder observations and incomplete reviewer receipts.
The final full check passed 2,064 tests across 188 suites. Skill lint passed all
16 rules across 21 skills; whitespace checks passed.

The work branch integrated dev af9111f, including its per-axis observation schema.
Character fit uses that schema without changing the five frozen weights or the 95
thresholds. A separate verdict-policy repair aligns the existing 95 professional /
no-required-correction anchor with acceptance of substantive positive observations.
Scores below 95 still need timestamped defects; below 90 still needs major/critical
evidence. Coverage, confidence and adverse-finding checks are preserved.
Older observations, scores and original verdicts remain immutable. Deterministic
re-adjudications name both the source evaluator and corrected verdict policy;
no score is raised and no defect is removed. Placeholders are rejected, but factual
listening quality remains a model judgment, not a lexical guarantee.

Personal audio, source identities, manifests, raw reviews, cost reservations and
hash audit remain in the user-authorized local artifact directory named in loop.md.
Failed, incomplete and dissenting reviews are retained. Saved ElevenLabs defaults
and original character samples are unchanged. Provider-token estimates are not
invoices; unresolved calls retain spending reservations within USD 20.

Final target verification is recorded separately after the seven audio cases finish.

Official Gemini3.8 guidance confirms immutable speaker traits belong in base-voice
selection, not turn style. Casting retains age, gender and timbre; automatically
derived delivery controls now contain only pace, register and speech habits.
Explicit authored controls remain transparent and are not silently rewritten.
