# Iteration 2

The independent verifier reproduced the five regressions from the first review and found three additional blocking defects. The second score was 70/100. All 1,213 server tests and the 17 skill-lint rules passed.

Iteration 3 uses the same stored selection for motion shots, b-roll and speaking clips in the forecast and the managed router. Reference-video and reference-audio scenes preserve their inputs across timed and untimed requests. Local media checks reject unsupported codecs, aspect ratios and unreadable files before upload and task creation. The tool descriptions now give the current activation options, supported transports and first-frame aspect ratios.

[Independent report](verify-2.md)

In the first local-input test run, a missing mock hosting key opened the plugin's temporary tunnel for one synthetic color clip. The adapter closed it after the mocked ModelArk rejection. The corrected fixture sets both test hosting variables and mocks the upload, HEAD and task POST. The fixture uses no user footage or paid generation.
