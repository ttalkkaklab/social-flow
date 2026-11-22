# Review 2

The independent verifier used the storyboard authoring tools, planned per-shot rendering, inspected the adapter body and opened the exported offline board. Functionality scored 24/40, checks 25/25, regression coverage 15/15, usability 8/10 and scope 10/10.

- A focus-only insert moved focus from a ribbon to a bell. The adapter still directed attention to the clerk throughout the scene and the insert's icon still showed the clerk.
- The shot writer saved the closing pose in `visual.frames.endState`. Both the video request and the closing-state tile omitted it.
- All 2,045 server cases and skill lint passed at this revision.

ASTRA_LOOP_RESULT: score=82 verdict=FAIL p0=2 iter=2
