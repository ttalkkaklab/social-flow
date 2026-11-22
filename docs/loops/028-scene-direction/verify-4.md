# Review 4

Functionality scored 32/40, repository checks 25/25, regression coverage 15/15, usability 8/10 and scope 10/10. The reviewer reproduced the earlier fixes on the actual request and reran six relevant cases.

- Selecting a slow zoom-in on the scene produced a zoom without its catalogue speed. The equivalent shot selection kept its pace.
- The axis checker read only shot fields. It reported a missing initial side for a crossing from the inherited scene axis, and requested an axis on a scene whose shots already shared one.

ASTRA_LOOP_RESULT: score=90 verdict=FAIL p0=0 iter=4
