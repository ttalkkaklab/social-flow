# Iteration 4 — 91, one P0

The WAV fix passed all 2,229 tests. Fresh review found a separate compressed-media
counterexample: demuxable MP3 headers with undecodable payload. Add actual strict
decode validation, require decoded samples, and test failure through the router.
