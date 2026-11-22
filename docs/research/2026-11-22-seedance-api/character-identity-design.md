# Preserving a storyboard character in a Seedance request

Design proposal, 2026-11-23. Baseline `f9b6debe`.

## Incident and reproduction

A single-shot preview named one on-screen principal and showed her speaking to camera. The board identified the character and her sheet. The request author supplied a workshop photograph, a pinned voice sample and a written description of the performer. The approved plan bound the speaker to Audio 1, recorded an empty list of owned image indices and issued a warning. The execution receipt listed the same two files. The local ledger recorded one completed provider task, 120,946 completion tokens and USD 0.846622 settled. The subsequent cast review failed. The records establish that the sheet was omitted before submission. They provide no moderation decision on that sheet.

The Codex installation inspected for this incident used build `dd96e65d4385`. Its reference adapter read local image bytes into data URIs. The worktree at `f9b6debe` already resolves a sheet panel into a reviewed ModelArk image asset and supports eligible original Seedance videos. Both manifests declare plugin version `0.126.0`. Reuse the newer implementation. [Portrait registration](../../../server/src/modelark-assets.ts) · [Generation adapter](../../../server/src/seedance-client.ts)

Offline replay at the worktree revision produced the following results.

| Probe | Result |
| --- | --- |
| Original plan input, shot selector | Empty resolved cast, workshop image, one WAV, USD 0.870912 reservation quote |
| Same input with its scene selector | Same empty cast, inputs and quote |
| Serialize the shot plan through the adapter with a replacement HTTP transport | One task-create attempt reached the mock. The body contained text, the workshop image and the WAV. The two decoded media hashes matched the original input files. |
| Add an explicit face/body binding in memory and inspect portrait selection on the unclassified sheet | The selector recognized the face with `realFaceInput: true` and returned no portrait registration with the board's `false`. |

The historical receipt describes adapter inputs. The mock captured the current adapter's serialized body. Account entitlement and the provider's decision on this particular sheet remain unverified.

## Where the baseline contract broke

1. Without explicit `visual.characterInputs`, the sheet resolver returns the shot unchanged unless the board declares both reference-frame mode and a resolvable body view. The incident board specified static camera movement, an on-screen speaker and a named visual principal. It omitted both triggering fields. Selecting the reference adapter explicitly did not activate the resolver. [Character panel resolution](../../../skills/channel/references/character-panels.js) · [Selection and normalization](../../../skills/_shared/video-selection.js)
2. The planner obtains its required people from the already-resolved inputs. An empty result skips the per-person panel checks. The voice planner can still identify and bind the speaker. Rebuilding that plan at execution reproduces the same omission. [Adapter contract](../../../server/src/video-registry.ts) · [Managed routing](../../../server/src/video-routing.ts)
3. `realFaceInput` describes the supplied media in the old guide. A caller can truthfully set it to false after omitting every face. In the newer adapter the same flag also influences portrait routing. The final presence check accepts a reference video URI beginning with `asset://` without checking its review status or owner. An eligible original video also satisfies this check regardless of which principal it depicts. [Portrait selection](../../../server/src/modelark-assets.ts) · [Reference serialization](../../../server/src/seedance-client.ts)

## Design requirements

| Stage | Change | Observable result |
| --- | --- | --- |
| Determine what the viewer sees | Derive per-shot requirements from the named visual principals, structured camera subject, speaker delivery and any explicit framing. A visible, identifiable principal requires a source of facial identity even on legacy cards. Preserve body-only, hand insert, voice-only, scenery and unnamed extra cases. If a named principal's visibility or required source is ambiguous, report the affected shot, character and missing decision before producing an approvable plan. | A missing camera field cannot erase the named performer. A narrator over an empty workshop can still use the voice lane alone. |
| Resolve each required role | Extend the existing character-input resolver. Bind character ID, shot ID, role and source revision. Resolve face, body or wardrobe, location and voice independently. An approved first frame can carry identity when the production record links the character and the face-bearing source to that frame and the selected adapter actually uses it. Preserve existing image order and prompt bindings. | Another actor's face, a fitting panel, a voice sample or a workshop photo cannot satisfy a missing face. A face used in a later scene interval stays attached to its owning shot. |
| Resolve the provider representation | For a photoreal fictional sheet, reuse the private AIGC registration and its reviewed image URI. Preserve the source digest, asset ID, group, project and region. For an explicitly selected same-account original, verify its eligibility and record which approved character appearance it carries. A preset or a take already rejected for facial continuity would change the casting and requires the owner's choice. A legacy `false` flag cannot authorize raw upload of a required photoreal portrait. | An unavailable asset, missing entitlement, pending review or rejected asset yields a specific remedy. Generic provider IDs and unverified image ownership cannot satisfy the role. [BytePlus private library](https://docs.byteplus.com/en/docs/modelark/private-virtual-avatar-library-guide-preview) · [BytePlus task inputs](https://docs.byteplus.com/en/docs/modelark/create-video-generation-task-api) |
| Approve and execute | Show each required character beside the actual Image, Video and Audio slots, plus the quote. An unresolved plan may be inspected. Enable video approval and reservation after required identity sources resolve. Use the existing authorization for an unchanged approved plan. Recheck the approved source revision on execution and compare each required binding with the outgoing content parts immediately before task creation. Apply the same logic to episode-context adapter calls and automatic approvals. | Omission creates zero video tasks and consumes zero attempts. A changed sheet or changed person-to-slot assignment invalidates the old approval. A confirmed pre-submission failure releases any transient reservation. An uncertain video submission retains its receipt for reconciliation. |

Keep a compact receipt of required characters, resolved roles, ordered slots, source digests or scoped asset IDs, provider submission state and task ID. Distinguish a local missing input, an asset-library response and a video-task moderation response in user-facing messages. Record the serialized slot metadata without media bytes, credentials or signed URLs. Input verification establishes what reached the model. A later visual review can still fail even with a correctly bound face.

For this particular shot, preserve the existing workshop at Image 1. An eligible cast could bind the approved face at Image 2, the selected front body panel at Image 3 and the pinned voice at Audio 1. The prompt would use Image 1 for the set, Image 2 for facial identity and Image 3 for build or the selected wardrobe. If the face cannot be registered, report which prerequisite failed and keep the preview unsent. A different model, face or reference video changes the approved inputs and may change the price.

## Acceptance criteria

- Replay the incident fixture with both selectors, missing frame and view fields, `realFaceInput: false`, a workshop and a WAV. Expect a character-specific resolution or a structured planning error. Assert zero video POSTs and zero reservations on unresolved input.
- Give two visible actors different face assets. Swap the owners or drop one binding after approval. Expect refusal before dispatch. On the valid path, assert the exact ordered image and audio parts, including the location and the correct `asset://` URI for each face.
- Exercise a silent visible principal, a true voice-only shot and a body-only reverse angle. Verify the independently required roles for each. Add a multi-shot scene where the second principal first appears after the opening.
- Exercise pending review, denied entitlement, a stale sheet and an uncertain video submission. Check the disposition of the existing asset, reservation and job on retry. Keep historical completed takes and their accounting intact.
- Add the regression cases to the existing routing, panel and adapter test files. Verify the installed MCP bundle digest, the registration tool in a fresh session and an offline replay through that build. The existing tests for structured front/rear cards, named references, original-task eligibility and pre-submission budget release all passed on the baseline.

## Implemented behavior

Read each member card before projecting the scene. A named visual principal, person named by the camera and an on-screen speaker each establish a visible performer. A person visible in front or profile needs the sheet face and the selected body panel. A direct rear view uses the back panel. A shot that starts at the back and turns toward the lens declares `visibility: "face_visible"`. For an insert, specify `hands_only` and author any hand, prop or action reference the moment requires. A named off-screen speaker uses the pinned audio slot. Scenery alone has no cast requirement. An ambiguous card reports its shot, character and missing decision before approval. Prose cannot certify the identity in a first frame.

For the workshop shot, give the performer a front body view. Preserve the authored set in Image 1. Use the registered face in Image 2, the front panel in Image 3 and the pinned voice in Audio 1. Source ownership comes from the character’s sheet and approved registration. Each member keeps its own shot ID. The scene mapper reports a later shot and frame when the adapter cannot carry a reference at that interval.

## Approval and provider evidence

Register the chosen panel with the private library. The planner reads the receipt for the account, project and panel digest and checks its current status with GetAsset. Registration, review and video generation are separate operations. The legacy media flag cannot disable portrait routing for the canonical face. For a selected same-account original, the reviewer records the character, provider task ID and passed appearance decision in a local review file. The plan binds its digest and the original's numbered video slot. The adapter resolves the signed URL at execution. [BytePlus private library](https://docs.byteplus.com/en/docs/modelark/private-virtual-avatar-library-guide-preview) · [Asset registration](https://docs.byteplus.com/en/docs/modelark/create-asset-api?redirect=1)

The approval export, storyboard candidate and execution journal use the plan’s character bindings. Execution rebuilds the plan and checks the image owner, scoped asset ID, group and digest. Immediately before the video POST it compares each bound URI or decoded media digest with the serialized content in its approved slot. The journal records the verified slots separately from the provider task ID. It stores neither media bytes nor signed asset URLs.

## Failure and retry

| Finding | Disposition |
| --- | --- |
| Missing face, unknown view, wrong owner or missing voice | Correct the named shot or sheet and plan again. The blocked planning record carries no price, reservation or attempt. |
| No active registration or entitlement denied | Register the selected panel or resolve the account entitlement. Planning and dispatch never substitute a different face. |
| Processing, failed or uncertain asset upload | Poll or reconcile that registration by its existing ID or receipt. Inspect a rejection before submitting a revision. |
| Approved asset or panel changed | Replan and inspect the new slot mapping. A confirmed pre-submission failure releases the transient reservation and attempt. |
| Video generation rejected | Preserve the provider response, task identity when available and accounting. A new take requires a new request within the authorized budget and attempt limit. |
| Video submission uncertain | Use the existing request and provider task ID for recovery. Without a task ID, retain the reservation pending reconciliation. |

The regression in the routing suite uses both historical selectors and the direct episode adapter entry. The positive case captures the JSON sent to a mock transport and checks the exact face URI, set, body and audio bytes. Neither test uses a live generation service. A correctly submitted reference still requires visual review of the generated face. [Routing tests](../../../server/test/video-routing.test.mjs)
