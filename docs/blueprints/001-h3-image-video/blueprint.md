# MiniMax H3 images and video on MLX and CUDA

Design proposal for social-flow and GenAI Gateway. Source checkout: social-flow `31a55adc`. Proposed aliases and HTTP routes below require implementation.

## 1. Scope and success criteria

Let a producer select H3 Image for stills and H3 Video for clips independently. A Mac running the plugin can use its local Mac worker, a configured CUDA server, or one of each for different media. Keep the existing episode plans, approvals, reference identities, output verification and receipts. Success means a producer can edit a still and render a voiced scene through the normal episode entry points on each advertised deployment, recover an interrupted job, and identify the exact model build that produced each asset.

| Operation | MLX on Apple Silicon | CUDA on NVIDIA |
| --- | --- | --- |
| H3 Image generation and edit | Integrate the community MLX port behind the gateway image adapter. Start with text and single-source editing. Measure multi-image edits. | Integrate the official H3-Image checkpoint through vLLM-Omni. Register generation and edit after separate integration tests. |
| Voice- and picture-conditioned video | Reuse the current FastH3 Omni MLX-Serve strategy. The repo documents one real image-conditioned MP4. Multi-speaker delivery still needs review. | Add a FastVideo OmniRef worker. Pin a supported checkpoint, kernel and precision for the deployed GPU. |
| Prompt-only or pinned first/last frame video | Register a distinct FL2VA profile when installed and tested. | Same operation contract, separately verified CUDA FL2VA deployment. |

The existing MiniMax hosted frame and reference adapters remain separate selections. Their quotas, timing and billing describe the hosted service. Local FastH3 is a distilled model. Record that distinction in comparisons. [Current MLX implementation](../../fasth3-omni.md) · [MiniMax H3](https://huggingface.co/MiniMaxAI/MiniMax-H3) · [H3 Image and serving recipes](https://huggingface.co/MiniMaxAI/MiniMax-H3-Image) · [MLX image port](https://github.com/felix-ab/minimax-h3-image-mlx) · [CUDA OmniRef recipe](https://haoailab.com/FastVideo/inference/fasth3_omniref/)

## 2. Producer workflow

Select a model and a named deployment in project setup. Image and video can point to different workers. Show the operations available on that deployment, its last successful smoke test and the effective limits. Preview reference order, speaker assignment, any frame rounding and the estimated reservation in the plan. Changing the deployment after approval requires a new plan. A legacy selection such as `engine:"mlx"` with the existing FastH3 pack still resolves to the same adapter. Text-bearing stills follow the project's GPT Image 2 rule.

## 3. Data and model identity

Reuse the project model settings, episode snapshot, plan, gateway job and asset receipt. No new plugin database is needed. Proposed additions:

| Record | Fields and ownership |
| --- | --- |
| Saved selection | Existing engine and model alias, optional named deployment. Image example: `{"engine":"astra-genai-native","model":"h3-image","deployment":"studio-mac"}`. Video example: `{"engine":"astra-genai","model":"h3-video-omni","deployment":"render-cuda","operation":"reference"}`. Aliases are proposed gateway registrations. |
| Deployment catalog | Deployment ID, media kind, supported operations, backend, checkpoint revision and digest, precision, runner version, device profile, operation-specific input limits, frame counts, dimensions, health and verification evidence. |
| Plan | Snapshot the resolved profile and input hashes. Record references in order with asset ID, role and character ID. Each dialogue turn has a shot ID, speaker ID, language and exact requested text. |
| Job and receipt | Stable request ID, accepted job ID, endpoint identity, profile digest, actual frame count, audio format, artifact checksum, elapsed time and peak memory when available. |

Use the existing engine to choose the transport. Resolve the named deployment server-side to an allowlisted worker. Old snapshots without this field retain their existing resolution. Do not infer the backend from the OS running the MCP client.

## 4. API and execution boundary

| Surface | Contract |
| --- | --- |
| Plugin | Extend `image_catalog/plan/execute` and `video_catalog/plan/approve/execute` at their existing registries. Reuse current reference binding and budget accounting. Keep vendor-specific prompt tags inside the serializer. |
| Discovery | Extend the image catalog and general video model catalog with the verified operations per deployment. A listed model can be installed but unhealthy, or healthy with only one tested operation. |
| Gateway images | Preserve `POST /v1/images/generations` and the verified local PNG result. Translate image edits to the worker's own edit protocol. Carry the deployment binding and request ID to the gateway. Reuse the native image adapter's single source plus ordered extra references. |
| Gateway video (proposed) | `POST /v1/h3/video/jobs` accepts request ID, deployment, profile digest, prompt, dimensions, frame count and typed ordered references. It returns job ID and state. `GET /v1/h3/video/jobs/{id}` returns status and the completed artifact handle. `GET /v1/h3/video/requests/{requestId}` recovers a lost submit response. Keep LTX MSR URLs specific to LTX. |
| Worker | Takes validated content-addressed assets or bounded uploads, runs one supported operation and returns a PNG or muxed MP4. Models, Python wheels and device kernels live on the worker. Keep the existing MLX SSE and RGB/PCM writer for its direct adapter. |

The H3 Image model advertises up to 16 input images. The existing gateway-facing plugin schema accepts one source plus nine additional references. Publish the lowest of the model, worker, gateway and plugin limits. Enable 16 only after the serializer, transport and runner pass a real ordered edit. Keep the default six-step image schedule. Reject unsupported image controls during planning. [Model card](https://huggingface.co/MiniMaxAI/MiniMax-H3-Image) · [Current image schema](../../../server/src/astra-genai-native-image.ts)

For Omni video, the upstream envelope is nine images, three video clips and three audio clips, twelve files total. Validate clip lengths and aggregate stream budgets against the pinned runner. Preserve its visual-reference requirement. Effective frame counts, dimensions, upload limits and reference ordering belong to each profile. Camera start/end pins and a voice-conditioned performance require different H3 modes. When a request needs both exact pins and speaker timbre, return the conflicting requirements at planning time. [Model card](https://huggingface.co/MiniMaxAI/MiniMax-H3) · [MLX adapter contract](../../fasth3-omni.md)

## 5. One 30-second scene

At 24 fps the edit timeline has 720 frames. Use three 240-frame shots as the common comparison fixture. Use the same approved keyframes for both video models. Image-model comparison gets a separate run.

| Shot | Timing | Ordered visual references | Voice reference and Vietnamese dialogue |
| --- | --- | --- | --- |
| S1 | 0–10 s | Miran face, kitchen-wide composition | Miran WAV: “Jun, em để chìa khóa ở đâu rồi?” |
| S2 | 10–20 s | Jun face, reverse-angle composition | Jun WAV: “Trên bàn, cạnh cái túi ấy chị.” |
| S3 | 20–30 s | Same Miran face, close-up composition | Same Miran WAV: “À, chị thấy rồi. Mình đi thôi.” |

The scene owns shot order. Each shot resolves only its speakers and references. One worker job per shot is the comparison default. A separate experiment may group adjacent shots into a native multi-shot clip where the worker supports it. Record cut timing and character swaps for that experiment. On a 243-frame output profile, allocate a three-frame edit handle per 240-frame shot. Keep the full original and trim picture and audio together for assembly. If trimming would cut speech, flag that take for review. An Omni composition image guides the shot. Only a tested frame-pinning profile promises a pinned frame.

## 6. Routing logic

```pseudo
Resolve saved engine, model, operation and deployment against the live catalog.
Intersect model, worker, transport and plugin constraints.
Bind ordered references and speaking turns by character ID.
Validate inputs and compute the render length and edit handles for each shot.
Freeze the profile and input hashes in the normal production plan.
On execution, check that the plan still matches the inputs and the deployment.
Reserve once, submit once and record the job identifier.
Verify the media file and attach the receipt to the planned shot or still.
```

Extend [image routing](../../../server/src/image-routing.ts) to resolve an operation by model and deployment and bind both in the plan. Extend [video registry](../../../server/src/video-registry.ts), planned duration, sound capabilities and prompt/voice binding together for the gateway H3 route. Keep [local strategies](../../../server/src/local-video-models.ts) as the compatibility path. Include the normal setup validator, catalog generation, episode snapshot and resume path in the same change.

## 7. Failures and recovery

Unsupported references or a stale profile fail before reservation. A missing model, incompatible GPU kernel or worker with insufficient memory marks the deployment unavailable for that request. Return the cause and the requested profile. A request ID is unique per gateway tenant and operation. Persist it before dispatch. Reusing it with the same fingerprint returns the original job; different input returns a conflict. Following a timeout, recover by request ID or job ID. If an older direct worker cannot confirm acceptance, retain the uncertain receipt and stop automatic resubmission. Check content type, dimensions, duration, audio streams and checksum before recording completion.

## 8. Deployment

Pin the worker build, model revision, tokenizer/encoder, VAE and precision in a deployment manifest. Share weights only when the component format and digest match. On a single device, start with one heavy generation at a time and benchmark concurrency for the actual image/video mix. Track cold load, warm runtime, queue time, peak resident memory or VRAM and artifact size separately. On MLX measure unified memory and swap pressure. On CUDA qualify the exact driver, GPU compute capability and kernels. Treat endpoint keys and reference assets as scoped credentials and media. Give clients artifact handles scoped to their jobs.

Both published weight agreements exclude South Korea, the EU, the UK and the US from their applicable territory. For deployment in an excluded territory, confirm the operator's separate rights before provisioning the model. Distribute adapters independently of weights. Hosted API use has its own terms. [Video weights license](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/LICENSE) · [Image weights license](https://huggingface.co/MiniMaxAI/MiniMax-H3-Image/blob/main/LICENSE)

## 9. Verification and rollout

1. Add deployment-aware discovery and a dry-run plan. Replay saved MLX, hosted MiniMax and LTX plans. Check image caps, speaker ordering, profile drift and timeout recovery in existing module tests.
2. Connect CUDA H3 Image to the image pathway. Render a text-only PNG and a source edit. Then connect MLX H3 Image to the same contract. Qualify one- and multi-reference edits separately on each deployment. Use two visibly different subjects to check reference ordering and identity preservation.
3. Add CUDA OmniRef. Replay the same three-shot Vietnamese fixture on CUDA and the existing MLX route. Verify actual speech by playback. Sampled frames or an audio stream alone do not establish speaker identity. Qualify FL2VA independently with a first/last pair.
4. Compare H3 and LTX on the same machine wherever both run, with the same script, assets, final length and common output resolution. Keep model/precision, prompt translation and native canvas in the report. Repeat multiple takes. Report blinded speaker-match ratings for S1 vs S3, speaker swaps, Vietnamese transcript errors, lip-sync and visible identity drift, plus time, memory and cost per accepted 30 seconds. Track external TTS use separately. Report any deployment that cannot run the common fixture as unmatched.

## 10. Production decisions

Enable each model/operation/deployment combination after its own end-to-end test and record the evidence in the catalog. Keep an unqualified combination visible as planned or experimental. The production owner decides the acceptable Vietnamese voice quality and cost against the current LTX workflow. Explicitly select any change to the production model, external TTS use or destination that receives character assets. A hardware change invalidates that deployment's measured performance profile.
