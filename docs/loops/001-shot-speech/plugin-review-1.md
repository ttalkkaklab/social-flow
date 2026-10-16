# Independent implementation review — iteration 1

Reviewer: /root/plugin_critic. Score 85/100; FAIL; P0=1.
Rubric: dialogue repair22/30; model independence22/25; no audio QA19/20;
board14/15; installation/tests8/10.

Findings and fixes:
- P0: same-text audio retake kept old video current. attach_audio now compares audio hashes
  and line revision with the binding, marks dependent video stale and returns invalidations.
  Regression checks both a different retake and a harmless identical reattachment.
- P1: Gemini and MLX raw arguments have no language field. generation.language is now explicit
  metadata; attachment and assembly share generationVoiceErrors. Both engine paths are tested.
- P2: primary skills and tool descriptions still prescribed automatic listening. Default
  produce/autoproduce instructions now use raw TTS and provenance; optional historical review
  tools explicitly require a user request. Speech review tools removed from default skill lists.
- Installation differed during active editing. Reinstalled both host caches and recorded a full
  hash manifest, including unchanged current files. A fresh review evaluates the final state.

This failed score is historical and is not a current pass claim.
