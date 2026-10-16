# Location continuity result

Independent result: 50 → 95, P0=0. See [verify-2.md](verify-2.md) for the additive score and limitations.

Implemented immutable Blender/GLB locations, shot state/camera bindings, hash-bound reference approval, host image argument attachment, output receipts and visual reviews. The storyboard offers orbit, shot/top views, state/object/wall inspection, camera proposal export and reference/result comparison. Camera proposals invalidate old references until rerendered and reviewed.

Installed both Codex and Claude local caches at `0.112.0-character.1`, preserving concurrent character, prop and speech updates. Existing processes retain their loaded tool registry; new sessions load the updated bundle. An independent installed MCP subprocess successfully listed and called `location_manage`. Original touched files are under each host's `plugins/location-backups/`.

Validation:
- Repository check: 3,710 tests passed; skill lint: 16 rules across 18 skills.
- Combined installed check: 19 focused location/HTML tests passed; skill lint: 16 rules across 19 skills.
- Korean additions: checker PASS, 100/100, no severity findings.
- Actual local build/render: authored workshop revisions, multiple cameras, day/night/open states and a browser-exported 30→34mm lens change. Six current shot bindings pass location readiness.
- Actual host image generation: first image rejected for invented props; second generated after prompt improvement and passed semantic layout review. Both outputs and actual input plans are under `data/location-review/`.

Review at http://127.0.0.1:8769/storyboard/storyboard.html?lang=en#locations while the local preview server runs. Artifacts and copied test logs live under `data/location-review/`; these are ignored local files. The fixture intentionally lacks narration/editorial approval and is not a publishable episode.

Limits: keyboard-only free orbit is incomplete (5-point deduction). Web GLB shading is a preview; Blender is the appearance authority. Generated surfaces/lighting are not metrically identical. No AI video clip was generated or visually certified in this run. Existing motion-previz and video review requirements remain active.

Workflow: [location-assets.md](../../../skills/storyboard/references/location-assets.md). Installation hashes: [install-latest.json](install-latest.json).
