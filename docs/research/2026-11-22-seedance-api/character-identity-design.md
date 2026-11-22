# Seedance character identity at approval and submission

The historical preview used a single workshop photograph and a WAV for a named performer speaking to camera. Its completed task consumed 120,946 provider tokens and settled at USD 0.846622. The cast continuity review failed. The receipt contains no provider moderation decision on the performer’s face. An offline replay at `f9b6debe` reproduced a USD 0.870912 quote using both the shot and scene selectors. Earlier builds and the private-library implementation share the 0.126.0 version label.

## Determine the required inputs

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
