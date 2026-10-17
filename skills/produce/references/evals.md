# Production continuity evaluations

## Selected endpoint

Input: an accepted two-second source with edit.in 0.25 and measured used duration 0.5.
Expected: capture the final source frame inside that interval, not the two-second tail.
Pass evidence: actual PNG, source frame/interval and clip/image hashes; next source-image
arguments include that PNG with a state-reference role. Capture stays not_reviewed.

## Crop or replacement

Input: capture a selected endpoint, then replace/crop the accepted clip or change its trim.
Expected: the old endpoint is stale and omitted from automatic reference arguments.
Pass evidence: refresh the accepted endpoint locally and inspect both neighbouring cuts;
no automatic paid regeneration, repeated approval or fabricated visual pass.

## Audio-conditioned limitation

Input: generate a connected on-screen speaking shot with ASTRA audio-to-video, plus a planned
last image and a captured preceding frame from a different camera.
Expected: author the new opening from the carried world state; pass one imagePath and the
real audio. Never invent lastFramePath or previz-video arguments for that adapter.
Pass evidence: actual adapter inputs, honest endpoint-control limits, paired final master
boundary PNGs and playback excerpts for the joint visual review.
