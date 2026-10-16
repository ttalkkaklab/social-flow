# Independent verification 2

ASTRA_LOOP_RESULT: score=95 p0=0 verdict=PASS

Scored additively from zero against the frozen rubric in loop.md. Each awarded check earns five points. Source inspection and artifact verification were read-only; only this report was written. No video-generation claim is assessed or made.

| Category | Awarded checks | Score |
| --- | --- | --- |
| Location and shot contract | Immutable revision build refusal; IDs/states validation; numeric shot-camera binding; manifest/Blend/GLB/frame/output hashes; stale approval rejection | 25/25 |
| Generation integration | Actual Blend and GLB; multiple real camera/state renders; sourceImageArgs contains location image; scoped roles and output receipt; downloaded 34mm proposal applied and rendered | 25/25 |
| HTML interaction | Orbit versus saved shot separation; state/object/wall controls; exported camera patch roundtrip | 15/20 |
| Installed dogfood | Installed hashes verified; installed entrypoint builds revision 4; actual ego interaction evidence; rendered/reference/generated images inspected and regeneration evidenced | 20/20 |
| Regression/docs | Full check and skill lint pass; documented usable workflow and old-board compatibility | 10/10 |

## Evidence checked

- Independently recomputed all 178 installed file hashes listed in install-latest.json across both host caches: zero mismatches.
- Repeated that 178-file check after the concurrent prop-session installation and refreshed install-latest.json: again zero mismatches. The final installed focused-test log reports 19 passes. installed-prompt-final.json includes the actual location start reference and a ready endpoint plan using generated v2 followed by the location end reference.
- Ran the 17 focused location tests independently: 17 pass, zero failures. Read the full-check log: 3,710 pass, zero failures; root skill lint: 16 rules across 18 skills. Installed merged-stage logs report 19 focused tests passing and lint passing across 19 skills.
- Independently ran location readiness against the current six-shot board: empty findings. This is location readiness only; the fixture has no narration/editorial approval and is explicitly not publishable.
- Inspected location-assets.js, the contract tests, prompt assembly and production pre-call integration, the unminified viewer source and CSS, and workflow documentation. Existing boards without location bindings have a passing compatibility test.
- Checked installed-roundtrip.cjs/log, the actual downloaded camera-proposal.json, and installed-mcp.json. Revision 4 has real source.blend and preview.glb files. The installed helper rejects stale references after the 34mm patch and renders new start/end images; the final board preserves this result as s0006. MCP evidence identifies location_manage in the installed bundle and reads revision 4.
- Inspected actual source s0001-8b09b1b6f9838628/start.png, generated v1 and v2, reverse s0002-c573217d465dae63/start.png, doorway s0004-308c2e1f125c101c/start.png, night s0005-d0fffd8e99f3f569/start.png, and changed-camera s0001-a8f7355e7fa2770a/start.png.
- Inspected review-v3.png: real rendered viewer, controls, and recognizable set. review-final.png captures the shot list during a startup race and does not prove the viewer. browser-evidence.json reports a ready canvas and horizontal fit at 390px, plus nonmutation and exported patch evidence. No browser was driven by this verifier.

## Findings and limits

1. **P2: keyboard access to free camera exploration is incomplete.** server/location-review-runtime.mjs:33 makes the canvas focusable, but line 37 constructs OrbitControls without listenToKeyEvents, and there is no equivalent key handler. Keyboard activation of the Top view button explains the recorded Explore status; it does not establish keyboard orbit. Native controls, labels, focus outlines, responsive layout, and result comparison exist, but the combined comparison/responsive-accessibility check does not earn its five points. Add documented keyboard rotation/pan/zoom or equivalent labeled buttons, verify a camera change and unchanged saved binding, and preserve cleanup on shot switching.
2. **Visual limitation, not a P0:** generated v1 visibly adds shelf pots, art and boxes. Generated v2 removes those additions and retains two windows, west bookshelf, central workbench/mat/toolbox, stool, single floor plant and east door. V2 still changes lighting, surface detail and apparent proportions relative to the Blender reference. The current review explicitly disclaims exact metric reconstruction; its semantic-continuity pass is supported. Use direct Blender output where exact geometry is required.
3. **Evidence housekeeping:** keep the actual viewer screenshot separately from a final shot-list screenshot, and describe keyboard evidence as button activation until free-camera keyboard support exists. Historical host-image-input-v2.json contains an earlier v1 endpoint plan; current scenes.js references and reviews v2. Do not treat that historical plan as a current generation request.

No observed required-test failure, user-data corruption, stale generation acceptance, false current approval, missing installed generation, or unusable viewer meets the frozen P0 definitions. The 95-point threshold is met; AI-video continuity remains untested.
