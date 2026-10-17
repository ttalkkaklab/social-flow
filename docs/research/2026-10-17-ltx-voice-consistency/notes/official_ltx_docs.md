# What Lightricks officially documents about character voice consistency in LTX 2.5 (and LTX-2 / LTX-2.3)

Research date: 2026-10-17. Sources: docs.ltx.io (fetched as `.md`), the Lightricks/LTX-2 GitHub repo, Hugging Face model cards and the HF API, arXiv 2601.03233, and ltx.io blog, capability and publication pages. Each claim is tagged with the model version it applies to. "Official" means published by Lightricks (docs.ltx.io, ltx.io, github.com/Lightricks, huggingface.co/Lightricks). Third-party or community material is labelled as such.

**Headline finding (official, 2026-10-01):** "LTX-2.5 audio-to-video can also drive a clip from a recording you supply, but no LTX-2.5 feature is documented for transferring a reference voice onto new speech, so matching a specific person's voice still means ID-LoRA or Dub-It on LTX-2.3." — [LTX blog, Voice Cloning With LTX, Oct 1 2026](https://ltx.io/blog/voice-cloning-with-ltx)

Official LTX-2.5 voice levers, in summary:
1. **Within one generation:** native multi-shot keeps the voice consistent across cuts.
2. **Across generations, supplying the voice:** audio-to-video. You provide the speech track and the model generates video to it. Lightricks' own pipelines pass the original waveform through.
3. **Across generations, training the voice:** the LTX Trainer's AV-LoRA, A2A IC-LoRA and audio-only LoRA modes.

Reference-voice cloning (Dub-It's `ref_audio` tokens, and the third-party ID-LoRA) is documented only on LTX-2.3.

---

## Q1. Does LTX 2.5 generate native speech jointly with video, and how does Lightricks describe the audio branch (architecture, speaker identity, lip-sync, languages)?

### Takeaway
Yes. LTX-2.5 (and LTX-2 and LTX-2.3 before it) is one joint audio-video DiT that generates speech, foley and ambience in the same pass as the video, with lip-sync. The LTX-2 tech report describes a separate audio stream that turns 16 kHz mel input into 24 kHz stereo output, with cross-modal attention. It claims speech with natural "cadence, accent, and emotional tone" but makes **no claim about speaker identity or voice consistency** beyond what multi-shot provides inside one generation (2.5 only).

### Cited Findings
- **LTX-2.5 (2026-08):** "LTX-2.5 is an open world model with open weights... It is a single DiT-based model that runs on consumer GPUs and generates synchronized video and audio from text, image, and video inputs." — [docs: Open Source overview](https://docs.ltx.io/open-source-model/getting-started/overview)
- **LTX-2.5:** "New in 2.5" says it ships "on top of a larger, more filtered training dataset and reinforcement-learning post-training". "Video and audio are decoded by separate VAEs". It uses "a custom Gemma 4 12B text encoder", with an optional, separate prompt enhancer. — [docs: Open Source overview](https://docs.ltx.io/open-source-model/getting-started/overview)
- **LTX-2.5:** "Native multishot — a single generation can produce multiple connected shots while holding character, scene, lighting, visual style, and voice consistent across cuts." — [docs: Open Source overview](https://docs.ltx.io/open-source-model/getting-started/overview); the same sentence appears on [docs: LTX-2.5 model page](https://docs.ltx.io/models/ltx-2-5)
- **LTX-2.5 (text-to-audio):** "LTX is a joint audio-video transformer that processes both modalities in a single model". `LTXVAudioOnlyModel` "disables the video stream and audio↔video cross-attention so only the audio pathway runs". The model "splits its input into `[video, audio]` streams". — [docs: Text-to-Audio workflow](https://docs.ltx.io/open-source-model/usage-guides/text-to-audio)
- **LTX-2.5 capabilities page:** "Lip-synced speech with natural cadence and emotion, plus foley and ambience. Filtered training data and an updated vocoder reduce artifacts and dropouts." Output format: "24 kHz stereo (Audio VAE to vocoder), muxed with the generated video." The FAQ answer to "What improved in LTX-2.5's audio?" reads: "Filtered training data and an updated vocoder reduce artifacts and unexpected dropouts while tightening audio-video alignment across both text-to-video and audio-conditioned workflows." — [ltx.io: Audio generation capability](https://ltx.io/model/capabilities/audio-generation)
  - Conflict: the same page says "Gemma 3 multilingual encoder produces separate video and audio conditioning embeddings". The 2.5 docs say Gemma 4 12B ([overview](https://docs.ltx.io/open-source-model/getting-started/overview), [GitHub README](https://github.com/Lightricks/LTX-2): "Gemma 4 12B, fine-tuned for LTX... `gemma4-12b-ltx-v1`"). The capability page is probably stale on this point.
- **LTX-2.5 capabilities FAQ:** "LTX-2.5 generates lip-synced speech as part of joint generation. It does not take an existing face plus audio and re-sync the mouth. Audio-to-video can drive generation from audio, and retake can regenerate an audio track." — [ltx.io: Audio generation capability](https://ltx.io/model/capabilities/audio-generation). Conflict on the retake part is covered under Q2.
- **LTX-2 tech report** (arXiv 2601.03233v1, submitted 2026-01-06, Lightricks): describes "a 14B-parameter video stream and a 5B-parameter audio stream" (Abstract, §3.1). The Conclusion calls it "a lightweight 3B audio stream", which contradicts the 5B figure. — [arXiv 2601.03233](https://arxiv.org/abs/2601.03233)
- **LTX-2 tech report:** "Audio latents are derived from mel spectrograms at 16 kHz and encoded by a separate causal audio VAE". The VAE is extended "to natively support stereo signals by accepting two-channel mel-spectrograms". Each latent token "corresponds to approximately 1/25 seconds of audio and is represented by a 128-dimensional feature vector". A HiFi-GAN-based vocoder synthesizes "a two-channel waveform at a higher sampling rate of 24 kHz". Audio stream positional encoding: "1D RoPE ... along the temporal dimension only". — [arXiv 2601.03233](https://arxiv.org/abs/2601.03233)
  - Minor conflict: the LTX-2.3 audio guide says the audio stream's positional encoding is "2D ... (frequency and temporal)". — [ltx.io blog, A guide to LTX-2.3 audio, May 13 2026](https://ltx.io/blog/a-guide-to-ltx-2-3-audio)
- **LTX-2 tech report, speech claims:** the model synthesizes "speech that is not only synchronized with visual lip movement but also natural in its cadence, accent, and emotional tone" (§1). "Lip synchronization is primarily driven by audio" (§1). Attention maps "focus on the lip region during close-up speech" (§3.1.2). Training captions include "precise transcriptions of dialogue with speaker, language, and accent identification" (§5.1). Audio CFG uses s_t = 7 and s_m = 3; video uses 3 and 3 (§4.1). "LTX-2 is capable of generating up to 20 seconds of continuous video with synchronized stereo audio" (§6.3). No quantitative audio metrics are reported; evaluation is human preference studies. — [arXiv 2601.03233](https://arxiv.org/abs/2601.03233)
- **LTX-2 tech report:** the paper contains no audio-reference, voice-cloning or speaker-identity conditioning mechanism, and makes no voice-consistency claim. — [arXiv 2601.03233](https://arxiv.org/abs/2601.03233)
- **Languages, LTX-2.5:** the HF metadata for `Lightricks/LTX-2.5` (gated repo, created 2026-07-23, last modified 2026-10-11) lists the language tags `en, de, es, fr, ja, ko, zh, it, pt`. — [HF API: Lightricks/LTX-2.5](https://huggingface.co/api/models/Lightricks/LTX-2.5)
- **Languages, LTX-2 and LTX-2.3:** both model cards carry the same language tag list, including `ko`, but the card bodies say "**Language(s):** English". The tags and body text disagree. — [HF: Lightricks/LTX-2](https://huggingface.co/Lightricks/LTX-2); [HF: Lightricks/LTX-2.3](https://huggingface.co/Lightricks/LTX-2.3)
- **Languages, tech report §7:** "prompts in languages or dialects underrepresented in the training data may yield less accurate speech synthesis or weaker audio–visual alignment." Korean is not named anywhere in the paper. — [arXiv 2601.03233](https://arxiv.org/abs/2601.03233)
- **LTX-2.3 (2026-03-05):** "Cleaner audio — improved data filtering reduces background noise and artifacts." — [docs: API changelog 2026-03-05](https://docs.ltx.io/api-changelog/2026/3/5)

### Inferences
- The one official cross-shot voice-consistency claim for 2.5 is scoped to **"a single generation"** (multi-shot). Nothing official extends it to separate API calls or separate local runs.
- The `ko` tag is the only official signal that Korean is supported. It sits next to an "English" body statement and the §7 caveat about underrepresented languages, so Korean speech quality and voice stability are officially unverified.

### Gaps
- No official LTX-2.5 tech report or model-card body text was available. The HF repo is gated (the README returned "Access ... is restricted"), so any 2.5-specific audio architecture changes beyond "updated vocoder", "separate VAEs" and "filtered data" are undocumented in what I could read.
- No official per-language speech-quality figures, Korean included.

---

## Q2. Which official inputs can pin a voice: A2V, reference audio, prompt descriptors, seeds, image or character references, Elements, retake, extend, keyframes?

### Takeaway
On LTX-2.5 the official levers are:
- **A2V**, where you supply the speech.
- **Prompt text**: quoted dialogue, language and accent, and voice-style descriptors.
- **Multi-shot**, which holds the voice within one generation.

A reference image anchors only the **visual** identity. Lightricks' one shipped reference-voice mechanism, `LTXVSetAudioRefTokens` (`ref_audio`), belongs to the LTX-2.3 Dub-It IC-LoRA. The API has no seed or voice parameter. Retake (`replace_audio`) and extend, which carry audio context forward, exist in the API only on `ltx-2-3-pro`; LTX-2.5 shows "—" for both.

### Cited Findings
**Audio-to-video (supplying the voice)**
- **API, LTX-2.5 and 2.3:** `POST https://api.ltx.io/v2/audio-to-video`. "Supply dialogue, music, or ambient sound and the model produces visuals synchronized to the audio." `audio_uri` (required) is the "Audio file to be used as the soundtrack for the video. The audio sets the length of the generated video". Other parameters:
  - `image_uri`: optional first frame; required if there is no prompt.
  - `prompt`: optional; "If image_uri is provided, this describes how the image should be animated".
  - `resolution`, `fps` (default 24), `last_frame_uri` (requires `image_uri`), `camera_motion`.
  - `model`: `ltx-2-3-pro` (default), `ltx-2-5-fast` or `ltx-2-5-pro`.
  - Billing: "Billed per second of input audio."

  — [docs: API, Generate video from audio](https://docs.ltx.io/api-documentation/api-reference/async-video-generation/submit-audio-to-video)
- **Local ComfyUI A2V, LTX-2.5:** "You supply an audio clip — music, speech, or ambience — and the workflow holds it fixed while generating video whose motion and pacing follow the sound." "The audio drives timing and motion; the prompt supplies the visual content." The workflow file is `LTX-2.5_A2V_Two_Stage_Distilled.json`. — [docs: Audio-to-Video (open source)](https://docs.ltx.io/open-source-model/usage-guides/audio-to-video)
- **Python, LTX-2.5 repo:** `A2VidPipelineTwoStage` — "Audio-to-video generation conditioned on an input audio file". It takes the CLI arguments `--audio-path` (required), `--audio-start-time` and `--audio-max-duration`, plus chunking flags. — [GitHub: Lightricks/LTX-2 README](https://github.com/Lightricks/LTX-2); [GitHub: pipelines.md §7](https://github.com/Lightricks/LTX-2/blob/main/packages/ltx-pipelines/docs/pipelines.md)
- **Capabilities FAQ:** "An optional image can be provided as a starting frame to anchor character identity, visual style, or scene composition. A short text prompt can also be used to guide visual context while audio remains the primary driver." — [ltx.io: Audio-to-video capability](https://ltx.io/model/capabilities/audio-to-video)
- **ElevenLabs partnership (2026-01-19, LTX-2 era):** "Audio-to-video is now live in LTX and ElevenLabs' as the exclusive launch partner, with broader access rolling out January 27." Users supply "voice, dialogue, music, or sound effects — as the primary input. An optional image can anchor a character or scene". — [ltx.io blog, Lightricks Launches Audio-to-Video Generation with Exclusive ElevenLabs Partnership, Jan 19 2026](https://ltx.io/blog/ltx-audio-to-video-generation-with-elevenlabs). The case study says ElevenLabs "integrat[ed] LTX's Audio-to-Video API ... directly in their platform", and that A2V reached about 70% of video generations on ElevenLabs' Image & Video platform within 30 days. — [ltx.io case study: ElevenLabs](https://ltx.io/case-studies/how-elevenlabs-and-ltx-are-redefining-ai-powered-video-creation)

**Prompt descriptors**
- **All versions, API prompting guide:** "Describe the Audio — Clearly describe ambient sound, music, speech, or singing. Place spoken dialogue in **quotation marks**. Specify language and accent if needed." — [docs: Prompting Guide](https://docs.ltx.io/api-documentation/implementation-guides/prompting-guide)
- **Prompting guide vocabulary:**
  - "Dialogue Style — Energetic announcer · Resonant voice with gravitas · Distorted radio-style · Robotic monotone · Childlike curiosity"
  - "Volume — Whisper · Mutter · Shout · Scream"

  — [docs: Prompting Guide](https://docs.ltx.io/api-documentation/implementation-guides/prompting-guide)
- **Official example prompt in the LTX-2.5 repo README:** "...he speaks with a deep male voice and a satisfied tone, saying, 'I think it's so good.' ... The man then continues to speak, **his voice maintaining the same quality**, as he states, 'So good. So good.'" This shows voice descriptors plus an explicit continuity phrase. — [GitHub: Lightricks/LTX-2 README](https://github.com/Lightricks/LTX-2)
- **Prompting guide samples:** the official sample prompts use screenplay-style speaker cues ("Reporter: ...", "Reporter (off-screen, shouting over the noise): ...") and voice descriptions ("speaks in a deep, calm voice, drawing out each word"). — [docs: Prompting Guide](https://docs.ltx.io/api-documentation/implementation-guides/prompting-guide)

**Multi-shot (2.5 only)**
- "Keep identity consistent — reuse the same visual identifiers for recurring people or objects", and "State audio continuity — e.g. 'the piano score continues across the cut'". The guide advises "Prefer 2–4 shots in one generation". — [docs: Prompting Guide, Multi-Shot](https://docs.ltx.io/api-documentation/implementation-guides/prompting-guide)
- FAQ: "LTX-2.5 generates the shots as one connected sequence, so character, environment, lighting, voice, and visual style can carry across cuts. Describing consistent details in the prompt reinforces that continuity." — [ltx.io: Multi-shot capability](https://ltx.io/model/capabilities/multi-shot-video-generation)

**Seeds**
- The API OpenAPI spec contains no `seed` field and no voice or speaker field. The only audio field is `audio_uri`. — [docs: openapi.json](https://docs.ltx.io/openapi.json), checked by grep: 0 occurrences of `"seed"`.
- Local pipelines take `--seed` (README example `--seed 42`; Dub-It `--seed N`). — [GitHub: Lightricks/LTX-2 README](https://github.com/Lightricks/LTX-2); [docs: Dub-It](https://docs.ltx.io/open-source-model/feature-guides/audio/dub-it-beta)

**Reference audio / speaker identity tokens (LTX-2.3 Dub-It only)**
- `LTXVSetAudioRefTokens`: "Attaches an audio latent as `ref_audio` tokens on conditioning for speaker identity transfer. Also outputs a `frozen_audio` copy with `noise_mask=0`". Its parameters are `conditioning` and `audio_latent`, and it is "Used once per stage in the Dub-It two-stage pipeline". — [docs: LTX ComfyUI Nodes, Audio Identity](https://docs.ltx.io/open-source-model/integration-tools/ltx-comfy-ui-nodes)
- Dub-It: "**LTX-2.5 support is in development.** This IC-LoRA is validated on **LTX-2.3**". "`--reference-video` provides both the source video frames (for IC-LoRA conditioning) and the audio track (for speaker identity)." — [docs: Dub-It (IC-LoRA) Beta](https://docs.ltx.io/open-source-model/feature-guides/audio/dub-it-beta)
- The LTX-2.5 repo nonetheless lists `DubItPipeline` ("Dub-It — re-voice or rephrase speech with matched lips and preserved speaker identity. Distilled model.") — [docs: PyTorch API](https://docs.ltx.io/open-source-model/integration-tools/pytorch-api). The compatibility page files Dub-It under "LTX-2.3 specialized workflows" and says "Do not substitute LTX-2.5 assets unless a workflow or model card explicitly establishes compatibility." — [docs: Workflow & Asset Compatibility](https://docs.ltx.io/open-source-model/reference/workflow-asset-compatibility)
- **ID-LoRA (third party, LTX-2.3), as described on the official blog:** a "research adapter accepted to ECCV 2026" by Dahan et al. (arXiv 2603.10256). It generates "a new talking video from a reference image and about 5 seconds of reference audio".
  - Method: reference audio encoded with the LTX audio VAE and concatenated along the sequence, at "negative temporal positions" in RoPE.
  - "Identity guidance: a classifier-free guidance variant on the audio stream amplifies speaker traits such as timbre, rhythm and pronunciation".
  - The adapter is a rank-128 LoRA on the audio self-attention, audio-video cross-attention and audio FFN layers.
  - Guidance defaults: "3.0 for video, 7.0 for audio and 3.0 for identity".
  - Prompts use `[VISUAL]/[SPEECH]/[SOUNDS]` tags. `--reference-audio` expects a `.wav`.
  - "native ComfyUI support adds an `LTXVReferenceAudio` node".
  - Reported results: 0.477 speaker similarity against 0.385 for Kling 2.6 Pro on the authors' CelebV-HQ split.

  — [ltx.io blog, Voice Cloning With LTX, Oct 1 2026](https://ltx.io/blog/voice-cloning-with-ltx). Lightricks lists ID-LoRA in the LTX-2.5 page's Community Library "By AviadDahan". There is no Lightricks publication page for it, and the author's affiliation is unverified. — [ltx.io: LTX-2.5](https://ltx.io/model/ltx-2-5)

**Retake / extend / keyframes**
- **LTX-2.5 API:** "retake — / extend —" for both `ltx-2-5-fast` and `ltx-2-5-pro`. — [docs: LTX-2.5](https://docs.ltx.io/models/ltx-2-5)
- **LTX-2.3 API:** "Audio-to-video, retake, and extend require `ltx-2-3-pro`." — [docs: LTX-2.3](https://docs.ltx.io/models/ltx-2-3)
- **Retake** (`POST /v2/retake`, `model` allowed values: `ltx-2-3-pro` only):
  - `mode`: `replace_audio` | `replace_video` | `replace_audio_and_video` (default).
  - `start_time`, `duration` (at least 2 s), optional `prompt`.
  - `video_uri` has a minimum of 73 frames; output resolution is 1920x1080 or 1080x1920.

  — [docs: API, Retake](https://docs.ltx.io/api-documentation/api-reference/async-video-generation/submit-retake)
- **Extend** (`POST /v2/extend`, `ltx-2-3-pro` only): "The model uses context frames from the input to produce a seamless continuation with consistent motion and audio."
  - `duration`: 2–20 s. `mode`: `start` | `end`. `context`: up to 20 s.
  - "The sum of `context` + `duration` ... cannot exceed 505 frames (~21 seconds at 24fps)".
  - Input must be 16:9 or 9:16 with at least 73 frames.

  — [docs: API, Extend](https://docs.ltx.io/api-documentation/api-reference/async-video-generation/submit-extend)
- **Conflict:** the LTX-2.5 audio capability page says "Regenerate just the audio track of a generated clip via retake" and lists retake as supported. The docs show retake is unavailable for `ltx-2-5-*` in the API. — [ltx.io: Audio generation capability](https://ltx.io/model/capabilities/audio-generation) vs [docs: LTX-2.5](https://docs.ltx.io/models/ltx-2-5)
- **Local:** the LTX-2.5 repo ships `RetakePipeline` ("Regenerate a specific time region of an existing video") and `KeyframeInterpolationPipeline` ("Interpolate between keyframe images"). The trainer offers Audio Extension and Audio Inpainting modes (Q6). — [GitHub: Lightricks/LTX-2 README](https://github.com/Lightricks/LTX-2)

**LTX Studio Elements** — see Q5.

### Inferences
- On LTX-2.5 via the API, the only deterministic way to keep the same voice across separate generations is to **generate or record the speech outside LTX** with one fixed voice and drive each clip through `audio-to-video`. LTX then generates only the visuals and lip-sync. The ElevenLabs launch (TTS → LTX A2V) is the officially sanctioned form of this pattern.
- Prompt descriptors such as "deep male voice" and "his voice maintaining the same quality" are the only native-audio lever across separate T2V/I2V runs on 2.5. No document claims they reproduce the same timbre across generations.
- Retake `replace_audio` and extend would carry or regenerate audio in context, but only on LTX-2.3 Pro in the hosted API. Whether the local `RetakePipeline` is validated on 2.5 weights is not stated.

### Gaps
- No official statement on whether a fixed seed plus a fixed prompt reproduces the same voice locally.
- No official LTX-2.5 reference-audio or voice-prompt input of any kind (API or local). The Oct 1 2026 blog confirms this.
- I could not extract the official "Directing Dialogue and Acting" blog post (https://ltx.io/blog/directing-dialogue-and-acting); fetching it failed with a header-overflow parse error and returned script-only HTML. It may hold more dialogue-prompting guidance.

---

## Q3. Does the official A2V pipeline keep the input waveform byte-for-byte or re-synthesize it? Duration, frame, sample-rate and channel limits?

### Takeaway
In Lightricks' **local** pipelines (ComfyUI workflow and Python `A2VidPipelineTwoStage`), the supplied audio is frozen during generation and **the original waveform is re-attached to the output**. There is no audio decode, so the speech is not re-synthesized. This is a muxing property of the pipeline, not a guarantee of the model. The **API** page only says the file is "used as the soundtrack". Byte-for-byte container identity is never claimed anywhere. The output is re-encoded into MP4, and the codec is not documented.

### Cited Findings
- **Local ComfyUI, LTX-2.5:**
  - "Your original audio track is saved with the generated video, unchanged."
  - "those audio tokens are concatenated with the video latent (`LTXVConcatAVLatent`) and held **frozen** through both stages, so the model generates video to match fixed audio rather than generating new audio."
  - "only the video branch is decoded (`VAEDecodeTiled`); the **SaveVideo** node then writes that video out with your original (trimmed) audio track attached. There's no audio decode step, so the soundtrack is preserved exactly as supplied."

  — [docs: Audio-to-Video (open source)](https://docs.ltx.io/open-source-model/usage-guides/audio-to-video)
- **Python, LTX-2.5 repo:** "The input audio is encoded via the audio VAE and used as the initial audio latent, but the original audio waveform is passed through and returned in the output to preserve fidelity." — [GitHub: pipelines.md §7 A2VidPipelineTwoStage](https://github.com/Lightricks/LTX-2/blob/main/packages/ltx-pipelines/docs/pipelines.md)
- **Python source:**
  - `source_audio = Audio(waveform=decoded_audio.waveform..., sampling_rate=decoded_audio.sampling_rate)`
  - the final step calls `replace_chunks_audio(decoded, ctx.source_audio, frame_rate)`
  - a docstring reads: "Audio is the frozen source latent both stages; decoded output is the original waveform."
  - Internal inconsistency: the class docstring says Stage 2 "refines both video and audio", while pipelines.md says Stage 2 refines "the video while keeping the audio fixed". The output path returns the source waveform either way.

  — [GitHub: a2vid_two_stage.py](https://github.com/Lightricks/LTX-2/blob/main/packages/ltx-pipelines/src/ltx_pipelines/a2vid_two_stage.py)
- **Official blog (2026-04-26, LTX-2 / 2.3 checkpoints):** "This means the audio you hear in the final output is your original audio, not a re-synthesis." — [ltx.io blog, How To Generate Video from Audio With LTX-2, Apr 26 2026](https://ltx.io/blog/how-to-generate-video-from-audio)
- **API wording:** `audio_uri` is the "Audio file to be used as the soundtrack for the video". The page does not mention re-synthesis or pass-through. — [docs: API, Generate video from audio](https://docs.ltx.io/api-documentation/api-reference/async-video-generation/submit-audio-to-video)
- **API maximum audio duration** (the audio sets the output length; `duration` does not apply to A2V):

  | Model | Resolution | Max audio |
  |---|---|---|
  | `ltx-2-5-fast` | 720p, 1080p | 20 s |
  | `ltx-2-5-fast` | 1440p, 4K | 10 s |
  | `ltx-2-5-pro` | 720p, 1080p | 10 s |
  | `ltx-2-5-pro` | 1440p, 4K | 10 s |
  | `ltx-2-3-pro` | 720p, 1080p | 20 s |
  | `ltx-2-3-pro` | 1440p, 4K | 10 s |

  — [docs: API, Generate video from audio](https://docs.ltx.io/api-documentation/api-reference/async-video-generation/submit-audio-to-video); [docs: LTX-2.5](https://docs.ltx.io/models/ltx-2-5)
- **API audio formats:**
  - WAV (`audio/wav`), with codecs "AAC-LC, MP3, Vorbis, FLAC"; MP3; M4A (AAC-LC); OGG (Opus, Vorbis).
  - "AAC audio must use AAC-LC profile (1024 samples/frame). HE-AAC and HE-AACv2 ... are not supported. **PCM audio is not supported.**"
  - Size limits: Cloud Storage upload 200 MB; HTTPS URL 32 MB with a 30 s timeout; Data URI 15 MB encoded.

  — [docs: Input Formats](https://docs.ltx.io/input-formats)
- **Same PCM caveat for the open-source pipeline (blog):** "The pipeline accepts WAV, MP3, M4A, and OGG audio files. Note that PCM-encoded WAV files are not supported; use a compressed codec such as AAC-LC or FLAC." — [ltx.io blog, Apr 26 2026](https://ltx.io/blog/how-to-generate-video-from-audio). The Oct 2026 blog, by contrast, says ID-LoRA's `--reference-audio` expects a `.wav` ([Voice Cloning blog](https://ltx.io/blog/voice-cloning-with-ltx)). The two posts describe different scripts, so this is not a direct contradiction.
- **Frame grid:**
  - ComfyUI: "The frame count still resolves to `1 + a multiple of 8`, so the final duration may land slightly off the trimmed length." — [docs: Audio-to-Video (open source)](https://docs.ltx.io/open-source-model/usage-guides/audio-to-video)
  - Python: "`--num-frames` and `--audio-max-duration` are mutually exclusive... video length is derived from the effective clip ... snapped to the VAE temporal grid (`8k+1`). With `--num-frames` (or neither), audio is clipped to `--num-frames / --frame-rate`." — [GitHub: pipelines.md](https://github.com/Lightricks/LTX-2/blob/main/packages/ltx-pipelines/docs/pipelines.md)
- **Internal audio representation (LTX-2 paper):** 16 kHz mel spectrograms (two-channel/stereo) go into the audio VAE, at roughly 1/25 s per latent token. The vocoder outputs 24 kHz stereo. — [arXiv 2601.03233](https://arxiv.org/abs/2601.03233)
- **Drift tip, LTX-2.3:** "Drift most commonly occurs when the audio reference clip used for conditioning has a different duration than the target video length. Use valid LTX-2.3 frame counts and match your audio clip to those durations." — [ltx.io blog, A guide to LTX-2.3 audio](https://ltx.io/blog/a-guide-to-ltx-2-3-audio)
- **Capabilities FAQ:** "Each Audio-to-Video generation produces a short video clip matching the audio duration, up to approximately 20 seconds. Longer videos can be created by chaining multiple generations using a composable workflow." — [ltx.io: Audio-to-video capability](https://ltx.io/model/capabilities/audio-to-video)
- **Changelog (API, A2V):**
  - 2025-12-09: A2V launched "with dedicated prompt enhancement".
  - 2026-08-11: LTX-2.5 A2V "generates at 1080p on both".
  - 2026-08-18: resolution parity.
  - 2026-08-19: `fps`, `last_frame_uri` and `camera_motion` added.
  - 2026-09-02: `ltx-2-5-pro` 1440p/4K/48 fps.
  - 2026-10-12: 1:1, 3:2 and 2:3 ratios.

  — [docs: API changelog](https://docs.ltx.io/api-changelog/llms.txt), entries [2025-12-09](https://docs.ltx.io/api-changelog/2025/12/9), [2026-08-11](https://docs.ltx.io/api-changelog/2026/8/11), [2026-08-18](https://docs.ltx.io/api-changelog/2026/8/18), [2026-08-19](https://docs.ltx.io/api-changelog/2026/8/19), [2026-09-02](https://docs.ltx.io/api-changelog/2026/9/2), [2026-10-12](https://docs.ltx.io/api-changelog/2026/10/12)

### Inferences
- "Preserved" means the **decoded sample waveform** at its original sampling rate (the code keeps `decoded_audio.sampling_rate`) is muxed back in. It does not mean the input file's bytes are copied. The MP4 audio is very likely re-encoded, so byte-for-byte equality with the input should not be assumed.
- Preservation lives in Lightricks' pipeline code (`replace_chunks_audio` / `SaveVideo`), not in the model. A third-party port (MLX) or a private service might instead decode the audio latent through the vocoder, which would re-synthesize at 24 kHz and could alter timbre. This is the first thing to check locally: compare the output audio with the input.
- Because input audio is internally reduced to 16 kHz mel latents, sample rates above 16 kHz and stereo matter only to the pass-through track, not to how the model "hears" the speech.
- The hosted API probably behaves like the local pipelines, given the "soundtrack" wording and billing per second of input audio, but Lightricks does not say so explicitly.

### Gaps
- No official statement of the output audio codec or bitrate, for the API or the local pipelines.
- No official minimum audio duration, sample-rate range or channel requirement for API input.
- No official maximum audio length for local A2V. The code has chunking flags (`--chunk-pixel-frames`, `--chunk-carry-frames`, `--chunk-blend-frames`), but there is no documented ceiling or quality statement for long audio.

---

## Q4. What prompting guidance does Lightricks give for dialogue and voice (describing a voice, quoting, multiple speakers, best language, Korean)?

### Takeaway
Put dialogue in quotation marks, state the language and accent, and describe the voice with style and volume terms. For dialogue scenes, use screenplay-style speaker cues. In multi-shot, state audio continuity at every cut. Use a single take when lip-sync in one framing matters. Lightricks names no "best" language for T2V/I2V speech and says nothing about Korean. The only validated-language list is Dub-It's (EN/FR/ES/DE/RU, LTX-2.3), with the instruction to write dialogue in the target language's native script.

### Cited Findings
- "Describe the Audio — Clearly describe ambient sound, music, speech, or singing. Place spoken dialogue in quotation marks. Specify language and accent if needed." — [docs: Prompting Guide](https://docs.ltx.io/api-documentation/implementation-guides/prompting-guide); repeated in [ltx.io blog, LTX-2.5 Prompt Guide, Aug 10 2026](https://ltx.io/blog/ltx-2-5-prompt-guide)
- "When a scene involves dialogue, multiple beats, or precise timing, write it in a screenplay style, with scene headers, character cues, and quoted dialogue". Express emotion "through physical cues, not abstract labels". — [docs: Prompting Guide](https://docs.ltx.io/api-documentation/implementation-guides/prompting-guide)
- "LTX responds best to cinematic, single-subject scenes with clear camera language, consistent lighting, and well-described audio." "Keep the scene focused — a few clear characters and actions read better than a crowded frame." — [docs: Prompting Guide](https://docs.ltx.io/api-documentation/implementation-guides/prompting-guide)
- **Pacing, 2.5:** "LTX-2.5's optional duration predictor sizes the clip to the action you describe and times it as written. It won't stretch a moment or add a pause you didn't prompt for. Write the beats you want into the prompt ('she pauses', 'a beat of silence')". — [docs: Prompting Guide](https://docs.ltx.io/api-documentation/implementation-guides/prompting-guide)
- **Multi-shot, 2.5:**
  - "At every cut, say whether music / dialogue / ambience continues or changes."
  - Example: "She speaks quietly to herself, 'He's late.'"
  - "Use a single continuous take when you want unbroken camera motion, intimate performance, or dialogue that must stay lip-synced in one framing."

  — [docs: Prompting Guide](https://docs.ltx.io/api-documentation/implementation-guides/prompting-guide)
- **Cross-model prompts:** "Don't paste a prompt written for another video model (e.g. Kling or Seedance) into LTX unchanged ... tag syntax and shot-list formatting don't [carry over]". — [docs: Prompting Guide](https://docs.ltx.io/api-documentation/implementation-guides/prompting-guide)
- **Prompt enhancer (local 2.5):** "an LLM rewrite pass (the Gemma 4 E2B model)". "For direct API requests, do not use `--enhance-prompt`." "leave it off if you'd rather submit your prompt exactly as written." — [docs: Prompting Guide](https://docs.ltx.io/api-documentation/implementation-guides/prompting-guide)
- **Voice vocabulary:** "Dialogue Style — Energetic announcer · Resonant voice with gravitas · Distorted radio-style · Robotic monotone · Childlike curiosity"; "Volume — Whisper · Mutter · Shout · Scream". — [docs: Prompting Guide](https://docs.ltx.io/api-documentation/implementation-guides/prompting-guide)
- **Dub-It (LTX-2.3):**
  - Template: `[Speaker] is speaking [Language/Accent], saying: "[Dialogue]"`
  - "**Languages currently validated**: English, French, Spanish, German, Russian."
  - "**Use native script** — write dialogue in the alphabet of the target language".
  - "It does **not** translate dialogue for you."
  - "**Single speaker** — the beta IC-LoRA does not distinguish between multiple speakers."
  - Match syllable length: "Prompt too long: the model might skip words. Prompt too short: the output might sound slow and unnatural."

  — [docs: Dub-It](https://docs.ltx.io/open-source-model/feature-guides/audio/dub-it-beta); [docs: Prompting Guide](https://docs.ltx.io/api-documentation/implementation-guides/prompting-guide)
- **A2V prompting (blog, LTX-2 / 2.3):** "Write text prompts that complement the audio. A mismatch between prompt tone and audio character will produce results where the model struggles to reconcile the two conditioning signals." For "spoken-word content like podcasts, combine audio conditioning with image conditioning to maintain a consistent visual identity". — [ltx.io blog, How To Generate Video from Audio, Apr 26 2026](https://ltx.io/blog/how-to-generate-video-from-audio)
- **ID-LoRA prompting (third party, 2.3):** "[VISUAL]: ... State that the person is speaking, or the audio may come out as a voice-over." "[SPEECH]: the exact words". "[SOUNDS]: vocal qualities (volume, tone, distance from the mic) plus ambient sound". — [ltx.io blog, Voice Cloning With LTX](https://ltx.io/blog/voice-cloning-with-ltx). This tag format applies to ID-LoRA, not to base LTX-2.5, whose guide advises against tag syntax.

### Inferences
- For Korean dialogue, the closest official guidance is to put the Korean line in quotation marks, in Hangul (by analogy with Dub-It's "native script" rule), and name the language explicitly ("speaking in Korean"). This is extrapolation; it is not documented for Korean.
- For a recurring character across separate generations, the official pattern is to repeat a fixed voice descriptor block in every prompt, as in the README example. Its effect on voice stability is undocumented.

### Gaps
- No official statement on which language yields the best speech for LTX-2.5 T2V/I2V, and no Korean-specific guidance or example.
- No official guidance on assigning distinct voices to multiple speakers in one native-audio generation, beyond screenplay-style cues.

---

## Q5. Does LTX Studio offer character voice assignment, voice libraries, ElevenLabs integration or consistent voices across scenes, and how does that differ from the open model and API?

### Takeaway
LTX Studio, the hosted product, has a voice library: about 30 voices as of 2025-09. You assign a voice to a **Character Element**, and Lightricks markets this as keeping "visual and audio identity consistent across scenes". Studio also has emotion and accent/language controls and a separate script-edit voice-cloning / lip-sync tool. None of this exists as an API parameter or open-weights feature. Which engine produces Studio's voices is not stated. The ElevenLabs partnership is LTX's A2V API running inside ElevenLabs' platform, not ElevenLabs voices inside Studio.

### Cited Findings
- **Elements (2025-10-28):** "Use Character for people that appear throughout your story or campaign. You can assign them a voice and reference them with tags throughout your project." "Use Object for items without voices". — [ltx.io blog, Getting Started with Elements, Oct 28 2025](https://ltx.io/blog/getting-started-with-elements)
- **Dialogue in Studio (2026-03-24):**
  - "Character dialogue requires defining voices as part of your character Elements, then using lip sync to align on-screen mouth movements to generated audio — keeping visual and audio identity consistent across scenes."
  - "In the audio panel, assign a distinct voice from the library to each character."
  - "LTX Studio's voice library covers a range of styles, tones, and accents".

  — [ltx.io blog, How To Add AI Voiceovers & Dialogue To Videos, Mar 24 2026](https://ltx.io/blog/how-to-add-ai-voiceovers-dialogue-to-videos)
- **Voiceover (2025-09-29):**
  - "LTX Studio's voice includes 30 professionally designed voices."
  - "custom voice presets" adjust voice characteristics, and you can add specific emotions.
  - "assign unique voices to each role".
  - "Simply describe your desired accent or target language in a text prompt and the system will modify your narration accordingly."

  — [ltx.io blog, How to Create a Custom Voiceover in LTX Studio, Sep 29 2025](https://ltx.io/blog/how-to-create-a-custom-voiceover)
- **Studio script-edit / lip-sync pages (undated):**
  - "Our technology preserves the speaker's unique tone and delivery while changing what they say."
  - "The AI clones the original voice and generates new speech based on your script edits".
  - "Voice cloning, lip sync, and 175+ languages".
  - "Multi-speaker detection maintains individual character authenticity".

  — [ltx.io: Studio Text to Speech](https://ltx.io/studio/platform/text-to-speech); [ltx.io: Studio AI Lip Sync](https://ltx.io/studio/platform/ai-lip-sync)
- **ElevenLabs:** ElevenLabs "integrat[ed] LTX's Audio-to-Video API ... launched their first third-party audio-to-video model directly in their platform". ElevenLabs spans "voice, speech, sound, music, and video across 70+ languages". — [ltx.io case study: ElevenLabs](https://ltx.io/case-studies/how-elevenlabs-and-ltx-are-redefining-ai-powered-video-creation); [ltx.io blog, Jan 19 2026](https://ltx.io/blog/ltx-audio-to-video-generation-with-elevenlabs)
- **API surface:** the OpenAPI spec has no voice, speaker or voice-ID parameter. — [docs: openapi.json](https://docs.ltx.io/openapi.json)

### Inferences
- Studio's "consistent voice across scenes" most plausibly works by binding a fixed library voice (TTS) to a Character, then lip-syncing or audio-driving the video. That is the same pattern the open model supports through A2V with external TTS. The underlying engine is unstated.
- The "175+ languages" voice-cloning and lip-sync claims are Studio marketing with no named model. They should not be read as LTX-2.5 native-audio language support.

### Gaps
- Not stated: which TTS or voice-cloning engine powers Studio voices, whether Studio voices can be exported or used through the API, and whether Studio can import an ElevenLabs voice.
- I did not find an official LTX Studio help-center page or release note listing Korean voices.

---

## Q6. Are there official LoRAs, IC-LoRAs or trainer modes for audio/voice conditioning or audio-video LoRA training that could lock a voice?

### Takeaway
- **Lightricks voice adapter:** the only official one is the **Dub-It IC-LoRA**, on LTX-2.3. It takes speaker identity from the source video's audio, and LTX-2.5 support is "in development".
- **Trainer:** the official **LTX Trainer** supports LTX-2, LTX-2.3 and LTX 2.5. Its audio-capable modes are:
  - T2V/I2V AV-LoRA, with audio generated jointly
  - A2V, with audio frozen
  - T2A, audio-only
  - Audio Extension and Audio Inpainting
  - A2A IC-LoRA, "voice conversion"
  - AV2AV IC-LoRA
- **Locking a voice by training:** one official blog sentence says an AV-LoRA "can encode both the visual identity and the acoustic character of a specific subject". This is the only official statement that a LoRA can lock a voice.

### Cited Findings
- **Trainer versions:** "The trainer supports LTX-2, LTX-2.3, and LTX 2.5 through the same configuration schema — the architecture is detected automatically from the checkpoint metadata". "Joint audio + video. Train both modalities together through the model's cross-modal attention, or freeze one to condition the other". 80 GB VRAM is recommended; a low-VRAM path brings LoRA training to 32 GB. — [docs: LTX Trainer Overview](https://docs.ltx.io/open-source-model/ltx-trainer/ltx-training)
- **2.3 → 2.5 portability:** "the large majority of LoRAs and IC-LoRAs trained on LTX-2.3 run on LTX-2.5 without changes; a small number of exceptions exist, so validate an adapter previously trained before production use." — [docs: LTX Trainer Overview](https://docs.ltx.io/open-source-model/ltx-trainer/ltx-training)
- **Mode table** (Video / Audio / Conditions / Config):
  - **T2V**: Generated / Generated / — / `t2v_lora`
  - **I2V**: Generated / Generated / `first_frame` / `i2v_lora`
  - **Video Extension**: Generated / Generated / `prefix`/`suffix`
  - **A2V**: Generated / **Frozen** / — / `a2v_lora`
  - **T2A**: — / Generated / — / `t2a_lora`
  - **Audio Extension**: — / Generated / `prefix`/`suffix`
  - **Audio Inpainting**: — / Generated / `mask`
  - **A2A IC-LoRA**: — / Generated / `reference` / `a2a_ic_lora`
  - **AV2AV IC-LoRA**: Generated / Generated / `reference` (both)

  — [docs: Training Modes](https://docs.ltx.io/open-source-model/ltx-trainer/training-modes)
- **A2A IC-LoRA:** "Pre-encoded reference audio latents are concatenated to the target sequence — reference tokens participate in bidirectional self-attention but receive no noise and are excluded from loss. This enables audio style transfer, **voice conversion**, sound effect transformation, and more." The dataset uses `audio_latents/` plus `reference_audio_latents/`. — [docs: Training Modes](https://docs.ltx.io/open-source-model/ltx-trainer/training-modes)
- **T2A, Audio Extension and Audio Inpainting** use "audio-only LoRA targets — explicitly targeting `audio_attn1`, `audio_attn2`, and `audio_ff` modules". "LoRA adapters should explicitly target audio modules (e.g. `audio_attn1.to_k`) rather than short patterns like `to_k` which would also match video modules." AV2AV "uses short LoRA target patterns like `"to_k"` to match all branches". "Audio does not support `first_frame` or `spatial_crop` conditions". Audio Extension: "A span of existing audio latent frames is provided as clean conditioning, and the model generates the continuation." — [docs: Training Modes](https://docs.ltx.io/open-source-model/ltx-trainer/training-modes)
- **AV-LoRA voice claim (LTX-2.5):** "LTX-2.5 also supports audio-video LoRA training (jointly trained on audio and video data). For character workflows that include dialogue or sound, an audio-video LoRA can encode both the visual identity and the acoustic character of a specific subject." — [ltx.io blog, How to Maintain Character Consistency in AI Video, dated May 13 2026](https://ltx.io/blog/how-to-maintain-character-consistency-in-ai-video). The post is dated before the 2.5 release (Aug 11) but names LTX-2.5, so it was probably updated after publication.
- **Branded sound:** the capability page says "train an Audio-Video LoRA for a branded sound." — [ltx.io: Audio generation capability](https://ltx.io/model/capabilities/audio-generation)
- **Reference-conditioned audio IC-LoRA:** "the LTX Trainer already supports reference-conditioned audio IC-LoRA training if you want to build your own adapter." — [ltx.io blog, Voice Cloning With LTX](https://ltx.io/blog/voice-cloning-with-ltx)
- **Dub-It IC-LoRA (LTX-2.3):**
  - Files: `ltx-2.3-22b-ic-lora-dub-it-0.9.safetensors`, at [HF: Lightricks/LTX-2.3-22b-IC-LoRA-DubIt](https://huggingface.co/Lightricks/LTX-2.3-22b-IC-LoRA-DubIt).
  - What it does: "Preserves the full video except the lip region"; "Matches the original speaker's tone of voice"; "Attempts to match the delivery and emotion of the original speech".
  - Two-stage pipeline with "audio latent ... frozen (carried forward unchanged)". Stage 1 runs 8 steps, stage 2 runs 3 steps, CFG 1.

  — [docs: Dub-It](https://docs.ltx.io/open-source-model/feature-guides/audio/dub-it-beta)
- **Research behind Dub-It (Lightricks publication):** "we leverage the generative model itself to synthesize paired multilingual videos of the same speaker", using language-switching clips "ensuring consistent facial appearance and voice characteristics across languages". — [ltx.io publications: Just Dub It](https://ltx.io/publications/just-dub-it-video-dubbing-via-joint-audio-visual-diffusion)
- **Other Lightricks research (not shipped as LTX-2.5 features):**
  - **ScenA** "conditions a text-to-audio flow-matching model on multiple reference voices and a free-form prompt to generate natural multi-speaker audio scenes", using "reference latents ... concatenated with the input latents and distinguished by lightweight identity-aware positional encodings". — [ltx.io publications: ScenA](https://ltx.io/publications/scena-reference-driven-multi-speaker-audio-scene-generation-from-in-the-wild-priors)
  - **AVControl** ("built on LTX-2") includes a "who-is-talking" control. Per-speaker identity references and VAD-derived bounding-box activity maps produce "multi-person talking video with synchronized lip motion and audio". — [ltx.io publications: AVControl](https://ltx.io/publications/audio-visual-control)
- **No official speech LoRA for LTX-2.3:** the LTX-2.3 Foley LoRA generates "speech- and music-free Foley". — [docs index](https://docs.ltx.io/llms.txt)
- **Community, not official:** on the LTX-2.5 page's Community Library, "AV LoRA — Generate talking head videos ... with internalized voice characteristics" (by elix3r), "JoyAI-Echo — Generate up to 5-minute multi-shot stories with consistent character identity and voice" (by jdopensource), and ID-LoRA (by AviadDahan). — [ltx.io: LTX-2.5](https://ltx.io/model/ltx-2-5)

### Inferences
- The officially supported way to "lock" a recurring character voice inside LTX-2.5 native audio is to train an AV-LoRA (T2V/I2V mode, audio generated) on clips of that voice. Alternatives are an audio-only T2A LoRA, or an A2A IC-LoRA for voice conversion. All of these are user-trained; Lightricks publishes no pretrained voice-lock adapter for 2.5.
- Audio Extension (prefix conditioning) is in principle a way to continue an existing voice's audio. The docs document it only as a training mode, not as an inference recipe for voice continuity.

### Gaps
- No official recipe or dataset guidance for training a single-speaker voice LoRA: clip count, duration, captioning of speaker or voice, or Korean data.
- No official LTX-2.5 Dub-It weights or release date ("in development" as of the docs read on 2026-10-17).

---

## Q7. What limitations or known issues about voice drift, speaker inconsistency or audio quality does Lightricks state?

### Takeaway
The stated limitations are:
- **Multi-speaker line assignment** gets confused.
- **Drift beyond about 20 s**.
- **Weaker speech in underrepresented languages** (tech report).
- **Lower-quality non-speech audio** (model cards).
- **Single speaker only** and five validated languages for Dub-It.
- **Voice drift** when denoising audio from scratch, and **prosody leakage** when conditioning on source audio (Just Dub-It research).

LTX-2.5's only documented improvements are fewer "artifacts and unexpected dropouts" and tighter A/V alignment. There is no official statement on cross-generation voice drift for 2.5.

### Cited Findings
- **Tech report §7:**
  - "in multi-speaker scenarios, the model may inconsistently assign spoken content to characters, occasionally confusing which character should speak specific lines".
  - "generating coherent audiovisual sequences longer than roughly 20 seconds can lead to temporal drift, degraded synchronization, or reduced scene diversity".
  - Underrepresented languages "may yield less accurate speech synthesis or weaker audio–visual alignment".

  — [arXiv 2601.03233](https://arxiv.org/abs/2601.03233)
- **HF model cards, LTX-2 and LTX-2.3, Limitations:** "When generating audio without speech, the audio may be of lower quality." "Prompt following is heavily influenced by the prompting-style." "The model may fail to generate videos that matches the prompts perfectly." — [HF: Lightricks/LTX-2](https://huggingface.co/Lightricks/LTX-2); [HF: Lightricks/LTX-2.3](https://huggingface.co/Lightricks/LTX-2.3)
- **LTX-2.5 "Keep in Mind":** lists only on-screen text and complex physics as uneven. Nothing on audio. — [docs: Prompting Guide](https://docs.ltx.io/api-documentation/implementation-guides/prompting-guide)
- **Just Dub It (Lightricks research):** "When denoising from scratch (Left), the model exhibits **voice drift**, failing to preserve the speaker's vocal identity. When conditioning on the source audio to maintain identity (Middle), phonetic and prosodic patterns leak across languages, resulting in **prosody leakage**." — [ltx.io publications: Just Dub It](https://ltx.io/publications/just-dub-it-video-dubbing-via-joint-audio-visual-diffusion)
- **Dub-It, LTX-2.3:** single speaker only. Validated languages are EN, FR, ES, DE and RU. A dialogue-length mismatch makes the model skip words or slow the delivery. — [docs: Dub-It](https://docs.ltx.io/open-source-model/feature-guides/audio/dub-it-beta)
- **ID-LoRA (third party, 2.3):** "roughly 5 seconds gives the best speaker similarity, while shorter or longer clips can weaken the transfer". Room noise in the reference "is a likely cause of drift". "identity guidance is the first value worth raising if the voice drifts". — [ltx.io blog, Voice Cloning With LTX](https://ltx.io/blog/voice-cloning-with-ltx)
- **Guidance and sync knobs (local):**
  - `MultimodalGuider` offers per-modality `cfg`, `stg`, `modality_scale`, `skip_step`, `rescale`, `perturb_attn` and `cross_attn`. Its "Use Case 2: Tight lip-sync for dialogue" is "Video: Moderate CFG, moderate STG, high modality scale; Audio: Moderate CFG, low STG, high modality scale".
  - `LTXVNormalizingSampler` targets "Audio clipping and distortion". The docs warn: "Do not use this sampler for inpainting, video extension, or any workflow using masks. It may break the context audio".

  — [docs: LTX ComfyUI Nodes](https://docs.ltx.io/open-source-model/integration-tools/ltx-comfy-ui-nodes)
- **PyTorch API:** `modality_scale` 1.0–3.0, "Audio-visual sync strength. Set > 1.0 when generating with audio." — [docs: PyTorch API](https://docs.ltx.io/open-source-model/integration-tools/pytorch-api). The A2V blog notes: "Setting it to 1.0 disables modality guidance entirely". — [ltx.io blog, Apr 26 2026](https://ltx.io/blog/how-to-generate-video-from-audio)
- **Distilled CFG:** "Both stages use CFG 1. The distilled model bakes guidance into distillation, so raising CFG doesn't improve output the way it would with a standard diffusion model." — [docs: Audio-to-Video (open source)](https://docs.ltx.io/open-source-model/usage-guides/audio-to-video)
- **Visual identity across generations, the analogous official statement:** "text conditioning alone describes visual properties at a categorical level ('a woman with red hair') rather than anchoring to specific identity features. This is why text prompts don't produce consistent characters across generations." — [ltx.io blog, How to Maintain Character Consistency](https://ltx.io/blog/how-to-maintain-character-consistency-in-ai-video)

### Inferences
- The visual-identity argument (text alone is categorical) applies by analogy to voice. A prompt like "deep male voice" names a category of voice, not a specific speaker, so separate LTX-2.5 native-audio generations should be expected to drift in timbre. Lightricks does not state this for audio.
- The tech report's multi-speaker confusion is directly relevant to two-character dialogue in one generation. Keeping one speaker per clip, or driving via A2V, avoids it.

### Gaps
- No LTX-2.5-specific known-issues list for speech, voice drift or speaker swap.
- No official measurement of voice consistency across shots within LTX-2.5 multi-shot, nor across separate generations.

---

## Q8. Exact version naming and release dates

### Takeaway
LTX-2 shipped in the API from 2025-10, and its paper followed on 2026-01-06. LTX-2.3 followed on 2026-03-05, and LTX-2.5 reached the API on 2026-08-11. The API IDs are `ltx-2-*-fast` and `ltx-2-*-pro`, and open weights are named `ltx-2.5-22b-*`. LTX-2 was removed from the API in 2026-08. Voice-reference features (Dub-It, ID-LoRA) belong to 2.3. Native multi-shot voice consistency belongs to 2.5. A2V exists on 2.3 Pro and both 2.5 variants.

### Cited Findings
- **2025-10-29:** LTX Video API launch with image-to-video and text-to-video. — [docs: changelog 2025-10-29](https://docs.ltx.io/api-changelog/2025/10/29)
- **2025-11-25:** Retake endpoint. — [docs: changelog 2025-11-25](https://docs.ltx.io/api-changelog/2025/11/25)
- **2025-12-09:** Audio-to-Video API, "with dedicated prompt enhancement". — [docs: changelog 2025-12-09](https://docs.ltx.io/api-changelog/2025/12/9)
- **2026-01-06:** LTX-2 tech report, arXiv 2601.03233v1. — [arXiv 2601.03233](https://arxiv.org/abs/2601.03233)
- **2026-01-19 / 01-20 / 01-27:** ElevenLabs A2V launch partnership: live in LTX and ElevenLabs Image & Video around Jan 20, broader access Jan 27. — [ltx.io blog, Jan 19 2026](https://ltx.io/blog/ltx-audio-to-video-generation-with-elevenlabs)
- **2026-02-18:** Extend endpoint. — [docs: changelog 2026-02-18](https://docs.ltx.io/api-changelog/2026/2/18)
- **2026-03-05:** LTX-2.3 (`ltx-2-3-pro` with A2V, retake and extend; `ltx-2-3-fast` with T2V/I2V), "Cleaner audio". — [docs: changelog 2026-03-05](https://docs.ltx.io/api-changelog/2026/3/5)
- **2026-07-02 / 07-15 / 08-15–16:** LTX-2 (`ltx-2-fast`, `ltx-2-pro`) deprecated, served by 2.3 from 07-15, removed from 08-15. The removal notice is dated 08-16. — [docs: changelog 2026-07-02](https://docs.ltx.io/api-changelog/2026/7/2); [2026-08-16](https://docs.ltx.io/api-changelog/2026/8/16)
- **2026-07-23:** HF repo `Lightricks/LTX-2.5` created (gated). — [HF API: Lightricks/LTX-2.5](https://huggingface.co/api/models/Lightricks/LTX-2.5)
- **2026-08-10:** automatic duration (`"duration": null`) on `ltx-2-5-fast`. The LTX-2.5 Prompt Guide blog is dated the same day. — [docs: changelog 2026-08-10](https://docs.ltx.io/api-changelog/2026/8/10); [ltx.io blog](https://ltx.io/blog/ltx-2-5-prompt-guide)
- **2026-08-11:** LTX-2.5 (`ltx-2-5-fast` up to 4K, `ltx-2-5-pro` 720p/1080p) for T2V, I2V and A2V. "Audio-to-Video generates at 1080p on both." — [docs: changelog 2026-08-11](https://docs.ltx.io/api-changelog/2026/8/11)
- **2026-08-18 / 08-19:** A2V resolution parity and per-model maximum audio length; A2V gains `fps`, `last_frame_uri` and `camera_motion`. — [docs: changelog 2026-08-18](https://docs.ltx.io/api-changelog/2026/8/18); [2026-08-19](https://docs.ltx.io/api-changelog/2026/8/19)
- **2026-09-02:** `ltx-2-5-pro` 1440p/4K and 48 fps. — [docs: changelog 2026-09-02](https://docs.ltx.io/api-changelog/2026/9/2)
- **2026-09-07 / 09-24:** V1 endpoints (`/v1/audio-to-video` and others) deprecated; they stop working after 2026-10-26 23:59 UTC. — [docs: changelog 2026-09-24](https://docs.ltx.io/api-changelog/2026/9/24)
- **2026-10-01:** official blog states that no LTX-2.5 reference-voice transfer feature exists. — [ltx.io blog](https://ltx.io/blog/voice-cloning-with-ltx)
- **2026-10-12:** LTX-2.5 1:1, 3:2 and 2:3 on T2V, I2V and A2V. — [docs: changelog 2026-10-12](https://docs.ltx.io/api-changelog/2026/10/12)
- **Naming:**
  - Docs use "LTX-2.5". The trainer page also writes "LTX 2.5".
  - API model IDs: `ltx-2-5-fast` and `ltx-2-5-pro` ([docs: LTX-2.5](https://docs.ltx.io/models/ltx-2-5)); `ltx-2-3-fast` and `ltx-2-3-pro`.
  - Open-weights files ([GitHub README](https://github.com/Lightricks/LTX-2)):
    - transformers: `ltx-2.5-22b-dev-transformer-bf16.safetensors`, `ltx-2.5-22b-distilled-transformer-bf16.safetensors`
    - VAEs: `ltx-2.5-audio-vae-bf16.safetensors`, `ltx-2.5-video-vae-bf16.safetensors`
    - text encoder: `gemma4-12b-with-proj-ltx-2.5-bf16.safetensors`
    - optional duration head: `ltx-2.5-duration-head-bf16.safetensors`
  - The GitHub repo is still named `Lightricks/LTX-2` and calls LTX-2.5 "the recommended model". — [GitHub: Lightricks/LTX-2](https://github.com/Lightricks/LTX-2)
  - Lightricks pages show no "LTX-2.4". The ltx.io navigation lists LTX-2.5, LTX-2.3, LTX-2 and LTXV. — [ltx.io: LTX-2.5](https://ltx.io/model/ltx-2-5)

### Inferences
- Some ltx.io blog dates appear to be original publication dates even though the content was later updated. For example, the May 13 2026 character-consistency post names LTX-2.5, which was released on Aug 11. Treat blog dates as lower bounds when deciding which version a claim covers.
- The A2V implementation details in the Apr 26 2026 blog were written against LTX-2.3 checkpoints. The same pass-through statement is repeated in the current LTX-2.5 docs and repo, so it carries over to 2.5.

### Gaps
- I could not find an official LTX-2.5 announcement blog post or press release with the exact release wording (third-party coverage dates it to 2026-08-11, matching the changelog).
- The HF LTX-2.5 model card body is gated and was not read.
