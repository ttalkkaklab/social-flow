# Location continuity implementation loop

Target: implement the agreed location-sheet / 3D set / storyboard interaction / generation reference design; install on this Mac; generate locations and iterate against adversarial review until score >=95.
User authorization: 2026-10-16, explicitly requests repeated improvement, installation and regeneration until >=95. This overrides the skill's default 90 threshold and fixed iteration cap. No paid API generation or publication is needed for the local fixture.

Frozen rubric (add from zero; each listed check earns 5 points only with executable or artifact evidence):
- Location and shot contract (25): immutable versions; validated states and IDs; shot camera binding; source/asset hash verification; stale approval rejection.
- Generation integration (25): Blender source and GLB; multi-view/shot reference renders; actual prompt argument attachment; input roles and receipts; changed-camera regeneration.
- HTML interaction (20): orbit versus shot camera separation; state/object/wall controls; camera patch export/application; reference/result comparison and responsive accessibility.
- Installed dogfood (20): installed code hashes; installed entrypoint builds location; real ego browser interactions; rendered image inspection and regeneration evidence.
- Regression/docs (10): npm run check AND skill-lint exit 0 (5); documented usable workflow and backward compatibility (5).
P0: required test failure, lost/corrupted existing user data, false approval, stale assets accepted for generation, missing actual installed generation or unusable viewer. PASS requires score >=95 AND P0=0 AND objective checks pass. Aesthetic/continuity findings must cite actual images, not only metadata. Independent fresh-context verifier gets artifacts and rubric, not worker's self-score.
