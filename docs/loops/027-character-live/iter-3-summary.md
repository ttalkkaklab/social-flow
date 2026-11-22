# Fourth iteration

The third verifier reproduced a 31-second valid speech WAV being truncated to 30 seconds and counted as complete. Check the source duration before transcoding. Retire potentially truncated cache entries. Exercise the exact 30-second boundary and one additional sample through the gateway client and speech pipeline.
