# LTX and Veo managed video adapters

Use the same managed call for LTX and Veo. Select the adapter from saved settings, carry supported storyboard inputs into its wire schema, and report incompatible inputs before submission. Continue until an independent review scores at least 95/100 with no blocking defects.

| Criterion | Points | Evidence |
| --- | ---: | --- |
| Common call and automatic selection | 35 | Exercise the public scene and shot entry points, snapshot selection, adapter dispatch, and provider isolation. |
| Schema mapping and input preservation | 30 | Check frames, subject references, voice and sound, duration and cost against the selected provider contract. Refute silent loss and incompatible combinations. |
| Tests and lint | 25 | Full server check (20) and skill lint (5) must exit zero. |
| Structure and compatibility | 10 | Review ownership of provider policy, old caller support, approvals and retry behavior. |

Award points against the evidence within each category. A broken common call, lost required input, provider substitution, or failed objective gate blocks completion.

## Contract evidence

- Google Cloud documents one subject and up to three asset images on Veo 3.1 Standard and Fast. The planner keeps these assets separate from first and last frames. [Google reference images](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/video/generate-videos-from-references)
- The hosted LTX image route takes `image_uri` and an optional `last_frame_uri`. Its audio route takes `audio_uri`. The gateway's MSR and combined-image extensions have separate local schemas and deployment capability checks. [Hosted LTX OpenAPI](https://docs.ltx.io/openapi.json) · [Gateway contract](../../../skills/_shared/astra-genai.md)
- Public `video_plan` tests compare image bytes in serialized request bodies. The suite runs locally and does not measure visual identity in generated clips.

## Result

| Iteration | Score | Blocking defects | Outcome |
| --- | ---: | ---: | --- |
| [1](verify-1.md) | 89 | 1 | Legacy reference paths dropped. |
| [2](verify-2.md) | 90 | 3 | Transition duration, endpoint pairs and legacy cast identities. |
| [3](verify-3.md) | 93 | 1 | End frame omitted on two legacy input combinations. |
| [4](verify-4.md) | 93 | 1 | Timed Veo prompt lost the prop reference instructions. |
| [5](verify-5.md) | 93 | 1 | Separate registered props accepted as one subject. |
| [6](verify-6.md) | 96, 98 | 0 | Both independent reviews passed the agreed threshold. |

Final objective checks passed: `npm run check` built the distribution and passed all 2,048 tests, skill lint passed 17 rules on 34 skills, and `git diff --check` reported no errors. For the final run, the cover tests used Chrome Headless Shell and the Node test runner used four workers.
