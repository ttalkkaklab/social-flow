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

## Where the contract breaks

1. Without explicit `visual.characterInputs`, the sheet resolver returns the shot unchanged unless the board declares both reference-frame mode and a resolvable body view. The incident board specified static camera movement, an on-screen speaker and a named visual principal. It omitted both triggering fields. Selecting the reference adapter explicitly did not activate the resolver. [Character panel resolution](../../../skills/channel/references/character-panels.js) · [Selection and normalization](../../../skills/_shared/video-selection.js)
2. The planner obtains its required people from the already-resolved inputs. An empty result skips the per-person panel checks. The voice planner can still identify and bind the speaker. Rebuilding that plan at execution reproduces the same omission. [Adapter contract](../../../server/src/video-registry.ts) · [Managed routing](../../../server/src/video-routing.ts)
3. `realFaceInput` describes the supplied media in the old guide. A caller can truthfully set it to false after omitting every face. In the newer adapter the same flag also influences portrait routing. The final presence check accepts a reference video URI beginning with `asset://` without checking its review status or owner. An eligible original video also satisfies this check regardless of which principal it depicts. [Portrait selection](../../../server/src/modelark-assets.ts) · [Reference serialization](../../../server/src/seedance-client.ts)

## Proposed changes

| Stage | Change | Observable result |
| --- | --- | --- |
| Determine what the viewer sees | Derive per-shot requirements from the named visual principals, structured camera subject, speaker delivery and any explicit framing. A visible, identifiable principal requires a source of facial identity even on legacy cards. Preserve body-only, hand insert, voice-only, scenery and unnamed extra cases. If a named principal's visibility or required source is ambiguous, report the affected shot, character and missing decision before producing an approvable plan. | A missing camera field cannot erase the named performer. A narrator over an empty workshop can still use the voice lane alone. |
| Resolve each required role | Extend the existing character-input resolver. Bind character ID, shot ID, role and source revision. Resolve face, body or wardrobe, location and voice independently. An approved first frame can carry identity when the production record links the character and the face-bearing source to that frame and the selected adapter actually uses it. Preserve existing image order and prompt bindings. | Another actor's face, a fitting panel, a voice sample or a workshop photo cannot satisfy a missing face. A face used in a later scene interval stays attached to its owning shot. |
| Resolve the provider representation | For a photoreal fictional sheet, reuse the private AIGC registration and its reviewed image URI. Preserve the source digest, asset ID, group, project and region. For an explicitly selected same-account original, verify its eligibility and record which approved character appearance it carries. A preset or a take already rejected for facial continuity would change the casting and requires the owner's choice. A legacy `false` flag cannot authorize raw upload of a required photoreal portrait. | An unavailable asset, missing entitlement, pending review or rejected asset yields a specific remedy. Generic provider IDs and unverified image ownership cannot satisfy the role. [BytePlus private library](https://docs.byteplus.com/en/docs/modelark/private-virtual-avatar-library-guide-preview) · [BytePlus task inputs](https://docs.byteplus.com/en/docs/modelark/create-video-generation-task-api) |
| Approve and execute | Show each required character beside the actual Image, Video and Audio slots, plus the quote. An unresolved plan may be inspected. Enable video approval and reservation after required identity sources resolve. Use the existing authorization for an unchanged approved plan. Recheck the approved source revision on execution and compare each required binding with the outgoing content parts immediately before task creation. Apply the same logic to episode-context adapter calls and automatic approvals. | Omission creates zero video tasks and consumes zero attempts. A changed sheet or changed person-to-slot assignment invalidates the old approval. A confirmed pre-submission failure releases any transient reservation. An uncertain video submission retains its receipt for reconciliation. |

Keep a compact receipt of required characters, resolved roles, ordered slots, source digests or scoped asset IDs, provider submission state and task ID. Distinguish a local missing input, an asset-library response and a video-task moderation response in user-facing messages. Record the serialized slot metadata without media bytes, credentials or signed URLs. Input verification establishes what reached the model. A later visual review can still fail even with a correctly bound face.

For this particular shot, preserve the existing workshop at Image 1. An eligible cast could bind the approved face at Image 2, the selected front body panel at Image 3 and the pinned voice at Audio 1. The prompt would use Image 1 for the set, Image 2 for facial identity and Image 3 for build or the selected wardrobe. If the face cannot be registered, report which prerequisite failed and keep the preview unsent. A different model, face or reference video changes the approved inputs and may change the price.

## Acceptance and rollout

- Replay the incident fixture with both selectors, missing frame and view fields, `realFaceInput: false`, a workshop and a WAV. Expect a character-specific resolution or a structured planning error. Assert zero video POSTs and zero reservations on unresolved input.
- Give two visible actors different face assets. Swap the owners or drop one binding after approval. Expect refusal before dispatch. On the valid path, assert the exact ordered image and audio parts, including the location and the correct `asset://` URI for each face.
- Exercise a silent visible principal, a true voice-only shot and a body-only reverse angle. Verify the independently required roles for each. Add a multi-shot scene where the second principal first appears after the opening.
- Exercise pending review, denied entitlement, a stale sheet and an uncertain video submission. Check the disposition of the existing asset, reservation and job on retry. Keep historical completed takes and their accounting intact.
- Add the regression cases to the existing routing, panel and adapter test files. Verify the installed MCP bundle digest, the registration tool in a fresh session and an offline replay through that build. The existing tests for structured front/rear cards, named references, original-task eligibility and pre-submission budget release all passed on the baseline.

Land the per-character planning and dispatch checks first. Then expose the same bindings in the approval view and receipt. Roll out the server bundle and its matching production instructions together. Retain the failed preview as incident evidence. A new production take needs its own authorization under the original one-attempt limit.
