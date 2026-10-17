# Independent engineering review 1

Fresh-context engineering_review_1 agent found two P2 defects:

1. Chart readiness validates reveal timing before measured --segs replaces equal-length
   estimates. A 10s/2-segment scene with a 6s reveal incorrectly rejects actual 7s/3s timing.
2. An explanatory plan can become a still/archive cut or camera slide without a mismatch
   warning if the proxy contains enough camera motion.

The reviewer ran 29 focused tests, all passing, and inspected the earlier 2,188-test full
check. Its provisional engineering total was 74/80; objective evidence was conditional on
final full tests after material changes. This is not an acceptance result.

Fix both paths and add reproductions. Re-run the objective checks on final sources before
fresh independent assessment. Visual points cannot compensate for engineering defects.
