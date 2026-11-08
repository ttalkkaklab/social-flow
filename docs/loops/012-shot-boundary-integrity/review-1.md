# Independent review 1

Reviewer: fresh-context adversarial_1, read-only, synthetic counterexamples against compiled module.
Score: 85/100; P0: 0. Accuracy 27/30, integrity 24/30, authoring/runtime 17/20, verification 17/20.

Findings:
1. A silent action stored only in visual.action/videoDesign disappears from sceneRuns and is timed at zero.
2. Removing that shot reports no action-removal impact.
3. Reordering dialogue events while leaving narration storage unchanged reports no speech-order change.
4. Fresh-install smoke and stale-process regression were not yet demonstrated; module hashes do not cover loaded reference modules.

Required corrections: expose unmapped actions with unknown order/time; report all removed physical evidence;
compare performed speech order; test stale disk versus loaded process and a fresh installed connection.
