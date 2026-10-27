# Community generation-time techniques for keeping a character's voice consistent in LTX 2.5 / LTX-2.x

Research date: 2026-10-17. Version legend used throughout: **LTX-2.0** (released 2026-01-06), **LTX-2.3** (community material from about March to June 2026), **LTX-2.5** (API launch 2026-08-11 per [fuser.studio](https://fuser.studio/articles/ltx-2-5-guide); community material from mid-August 2026). Hugging Face discussion pages show month and day but no year. Where a year is written as "2026 (inferred)", it comes from that release timeline. Dates in the Lightricks/LTX-2.5 discussions are necessarily 2026, because 2.5 shipped in August 2026, so they appear without the "(inferred)" mark. Confidence tags: **[WIDE]** = several independent users report it working; **[CAVEATS]** = confirmed but with reported failures; **[ANECDOTE]** = one user or one creator; **[VENDOR]** = Lightricks or a commercial host's claim with no independent test found; **[UNVERIFIED]** = seen only in a search-result summary, page not opened or fetch failed.

Source-access note: Reddit could not be read. `site:reddit.com` searches returned nothing relevant, `old.reddit.com` was blocked for the fetch tool, Reddit's JSON search returned a block page, and the search tool's `allowed_domains:["reddit.com"]` filter returned "domains are not accessible to our user agent". So the community evidence below comes from Hugging Face discussions, GitHub issues, Civitai, the Hugging Face forum and practitioner write-ups. Reddit threads are not represented.

## 1. Audio-first workflows (TTS / voice clone, then LTX audio-to-video)

### Takeaway
The most widely confirmed way to lock a voice is to generate the speech first and feed it to LTX as a fixed ("frozen") audio latent. The voice is then the TTS voice by construction, and the remaining risk moves from voice drift to lip-sync quality. This is [WIDE] on LTX-2.0/2.3. On LTX-2.5 there are three data points: one user's explicit frozen-latent node chain, a second user who independently got custom-audio lip sync on 2.5 with overlapping settings (workflow internals not stated), and an official 2.5 A2V example workflow. 2.5 is reported to be "much stricter" about whether it lip-syncs at all, and results depend on the seed.

### Cited Findings
**Vendor framing**
- [VENDOR] Lightricks itself names the problem: "voices change from generation to generation". Its fix is Audio-to-Video: "Once uploaded, the same voice stays consistent across every generation, even when you change shots, scenes, or camera angles." Audio sources: record in LTX, LTX's built-in TTS, or upload clips up to 20 seconds (MP3, WAV, AAC, OGG, MOV, M4A). Tips: use a start frame with the mouth closed and an expression that matches the audio's emotion; if speech is not detected, add "character speaks" or "the person talks"; for a frozen first frame or off lip sync, "try adding a short audio buffer at the beginning of your file"; match the voice's age, gender and personality to the character. Dated 2026-01-19 (LTX-2.0 era). — [LTX blog: How To Generate Video From Audio](https://ltx.io/blog/how-to-generate-video-from-audio-in-ltx)
- [VENDOR] On the LTX-2.5 API, A2V audio input is limited to 1–10 seconds, MP3 or OGG, up to 20 MB. In A2V, do not ask for ambience or music in the prompt, because it can conflict with the uploaded track. Quote known words exactly "in the language's native script" and name the language; never translate a supplied line; if the words are unknown, write "with natural lip-sync to the audio". Fast camera moves during speech "break the read", and cutting to another shot "breaks lip-sync entirely". Dated 2026-09-04. — [deAPI LTX-2.5 prompt guide](https://deapi.ai/blog/ltx-2-5-prompting-guide-multi-shot-scenes-native-audio-and-prompts-that-actually-cut)
- [VENDOR, UNVERIFIED] Lightricks' LipSync-vs-LipDub article says lip sync is built into LTX-2.3 with no adapters, and suggests LipDub plus post-production audio mixing when an exact TTS voice is required. — [LTX blog: Lipsync vs LipDub](https://ltx.io/blog/lipsync-vs-lipdub) (search summary only)

**LTX-2.5: the frozen-audio-latent recipe (the only community-confirmed 2.5 voice lock found)**
- [ANECDOTE: single report of this exact node chain] PianodogStudios opened "custom audio lipsync for ltx 2.5 just doesnt work" on Aug 15, 2026 and posted a working ComfyUI setup on Aug 16, 2026. The key idea is to treat the custom audio as a frozen audio latent, not as LipDub or reference conditioning:
  1. Load Audio → Trim Audio Duration to the video length.
  2. Trimmed audio → **LTXV Audio VAE Encode** with `ltx-2.5-audio-vae-bf16.safetensors`.
  3. Pass it through **LTXVSetAudioRefTokens** and use **only its `frozen_audio` output** (zero noise mask). The positive/negative outputs are left unused.
  4. Feed the same frozen audio into **LTXVConcatAVLatent** for both stage 1 and the stage-2 upscaled-latent pass.
  5. Sampler: plain `euler` in both stages. `euler_ancestral` was removed because it "seemed to add too much randomness".
  6. **LTXVModalityGuidance** at 3.0 made things worse, so it was bypassed.
  7. No reference conditioning for custom dialogue.
  8. All LoRAs disabled (character, voice, audio, A2V/V2A), "especially LTX 2.3 LoRAs run on 2.5".
  9. **LTXV Dual CFG Guider** with video CFG 1 and audio CFG 1.
  10. Mux the **original trimmed WAV** in Create Video, not the VAE-decoded sampled audio.
  — [HF Lightricks/LTX-2.5 discussion #44](https://huggingface.co/Lightricks/LTX-2.5/discussions/44)
- [CAVEATS] jaggy007 (Aug 19, 2026) reports "LTX 2.5 does lip-sync!" using RuneXX's workflows. The post does not say whether that workflow uses the `frozen_audio` → `LTXVConcatAVLatent` chain above, so it confirms custom-audio sync on 2.5, not that exact recipe. Settings: LTX 2.5 distilled, CFG 1, first/middle/last pinned images, a "forgiving" middle image guide at 0.3, custom audio and no modality guidance. Music with a lead vocal worked without stem separation, and 44.1 vs 48 kHz made no difference. Failures: the same configuration was "refused" on another song (the character only moved as if listening), and prompt coaching did not fix refused material; heavy wet reverb on the vocal was read as backing singers, so only the dry lead was mouthed; modality guidance deformed the mouth and face at every strength tested; one seed gave near-perfect sync and two others gave partial sync with dropped words. Verdict: LTX 2.5 is "much stricter than LTX 2.3" about deciding what to sing. — [HF #44](https://huggingface.co/Lightricks/LTX-2.5/discussions/44)
- Official workflow pointer (XiaoHeitu, Sep 1, 2026): `ComfyUI-LTXVideo\example_workflows\2.5\LTX-2.5_A2V_Two_Stage_Distilled.json`. RuneXX's collection was also linked (Sep 7). A Lightricks org member (art-alex, Aug 17, 2026) said the dubbing pipeline (`dubit.py` in the LTX-2 repo) "is still optimized for LTX 2.3" and 2.5 support would come "very soon". — [HF #44](https://huggingface.co/Lightricks/LTX-2.5/discussions/44)
- [CAVEATS] A WanGP regression report (Aug 22, 2026) says custom-audio lip sync on LTX-2.5, and on the current build's LTX-2.3, articulates "a different phoneme or word sequence" than the supplied WAV, even though the mouth moves at roughly the right times. It is "not a constant timing offset". Setup: start frame, clean speech WAV as Audio Prompt, full audio strength. JELSTUDIO (Aug 28) found it works with some seeds and not others; marcossos3-boop (Sep 1, v12.648) still saw poor sync; JELSTUDIO (Sep 4) noted LTX "tends to produce near-still images when the audio has long silences". Still open, no root cause. — [Wan2GP issue #2200](https://github.com/deepbeepmeep/Wan2GP/issues/2200)

**LTX-2.0 / 2.3 custom-audio workflows (the base the 2.5 recipe grew from)**
- [WIDE] RuneXX published "LTX-2 - I2V and T2V Basic (Custom Audio)" on Jan 18, 2026 (inferred), later retitled "Workflow - Custom audio (lipsync, sing-along etc)". Reported failures and fixes from the same thread:
  - A-2-H (Jan 27): some i2v images produced "zoom-ins with expressions instead of talking".
  - RuneXX: "if you explicitly in a sequence order prompt what you want to happen, including dialog. It seems to work better."
  - RuneXX's two-pass settings: Dev first pass with 20+ steps at CFG 4 without the distilled LoRA, then the distilled LoRA in the upscaler pass at 8 steps, CFG 1, first-frame input strength in the second pass about 0.8. For hard images, the MachineDelusions I2V adapter LoRA.
  - Forcing a 20 s render on 14 s of audio made the character keep "silently" talking (Jan 30).
  - Vertical 1080p caused colour shifts while horizontal 16:9 and 720p were fine.
  - Black frames in one-pass high-res were fixed (merermero, Mar 1) by replacing LTXV Scheduler with manual sigmas `1., 0.99375, 0.9875, 0.98125, 0.975, 0.909375, 0.725, 0.421875, 0.0`.
  — [HF Kijai/LTXV2_comfy discussion #35](https://huggingface.co/Kijai/LTXV2_comfy/discussions/35)
- [ANECDOTE] **IndexTTS2 → LTX-2 I2V custom audio** (f0rkineye, Jan 21, 2026, inferred). Speech came from an IndexTTS2 workflow, plus a camera-control LoRA (name and strength not given). Prompt: "The man says the attached audio, lips perfectly in sync". About 67 s per 3 s clip on a 5060 Ti 16GB. f0rkineye shared a modified workflow that computes the frame count from audio length plus pre/post padding: [gist](https://gist.github.com/forkineye/4d9ea730c5d9c5f086251e69c8b243b2). RuneXX said the result "looks really good". — [HF RuneXX/LTX-2-Workflows discussion #5](https://huggingface.co/RuneXX/LTX-2-Workflows/discussions/5)
- [UNVERIFIED] The Civitai "Friendly LTX-2 T2V+I2V+Lipsync – UniVibe v1.2" package bundles a VibeVoice TTS model for its lipsync path. — [Civitai](https://civitai.com/models/2294829/friendly-ltx-2-t2vi2v) (search summary only)
- [UNVERIFIED] The official ComfyUI LTX-2.3 Image+Audio-to-Video template uses LoadImage plus LoadAudio or RecordAudio; its FAQ says clean, speech-focused audio gives the most accurate mouth movement, and WAV or high-bitrate MP3 work. — [Comfy.org template](https://comfy.org/workflows/video_ltx2_3_ia2v-adca306765ce/). A Next Diffusion tutorial adds a MelBand Roformer node to isolate the vocal stem when the track has a music bed. — [Next Diffusion](https://www.nextdiffusion.ai/tutorials/ltx-2-3-image-to-video-with-custom-audio-in-comfyui). Both are search summaries only.
- [UNVERIFIED] A Kijai Hugging Face thread on custom audio describes about 1–2 minutes as realistic for one shot because "the model forgets earlier windows". The search summary did not name the thread; the closest match is [HF Kijai/LTX2.3_comfy discussion #18 (I2V & T2V with Custom Audio)](https://huggingface.co/Kijai/LTX2.3_comfy/discussions/18), but that attribution is unconfirmed.
- Community advice from the HF forum (June 10–11, 2026; LTX-2.3; Russian dialogue) ranks the routes for exact pronunciation. The top route is "Russian TTS or recording, verify stress, then LTX audio-to-video or image-audio-to-video". Second is to generate video and mux the verified audio back in. Also: put the transcript of the line in the prompt so the model treats the audio as dialogue rather than narration, because "custom audio does not always drive lip movement; some users report it behaves like voice-over". The reply names Qwen TTS or Fish Audio voice cloning feeding LTX as community practice, and says voice conversion afterwards "can change timbre but may keep the wrong stress". — [HF forum: Ltx 2.3 problem with dialogs](https://discuss.huggingface.co/t/ltx-2-3-problem-with-dialogs/176649)

### Inferences
- With a frozen audio latent the voice cannot drift, because the sampler does not regenerate the audio and the final file carries the original WAV. Cross-shot voice consistency then depends on the TTS engine's speaker stability (fixed speaker embedding, cloned reference, same settings), not on LTX.
- On 2.5 the main failure is the picture refusing to "own" the audio (listening instead of speaking, or the wrong phonemes), not a voice change. Practical mitigations seen: distilled model, CFG 1, no modality guidance, no 2.3 LoRAs, a middle image guide around 0.3, seed sweeps, dry vocals, and a transcript in the prompt.
- Audio length limits depend on the surface: API A2V 1–10 s (deAPI), LTX Studio upload ≤20 s (LTX blog), and local ComfyUI shots reported up to about 1–2 minutes with degradation. These should not be merged into one number.

### Gaps
- No source scored lip-sync accuracy across TTS engines. No LTX-2.5-specific reports were found for ElevenLabs, VibeVoice, F5-TTS, CosyVoice or Fish Speech; the only named engines are IndexTTS2 (LTX-2.0), VibeVoice (bundled, LTX-2.0) and Qwen TTS / Fish Audio (mentioned, LTX-2.3).
- No report on whether the frozen-latent recipe works with non-English speech on 2.5.
- Reddit threads on audio-first pipelines could not be read (see the source-access note).

## 2. Prompt-only methods with native audio (fixed voice wording, quoted dialogue, seed locking)

### Takeaway
No community source measured how often a fixed voice description plus a fixed seed reproduces the same voice across separate generations, and Lightricks itself says voices change between generations. Prompt technique improves delivery, language and speaker assignment, not identity. The one native mechanism said to hold a voice across cuts is LTX-2.5's multishot generation inside one clip, and that claim has no community voice test.

### Cited Findings
- [VENDOR] Lightricks: "voices change from generation to generation" is "a recurring problem", and the recommended fix is supplying audio, not prompting. — [LTX blog](https://ltx.io/blog/how-to-generate-video-from-audio-in-ltx)
- [VENDOR, UNVERIFIED] Lightricks' consistency article says each generation is stochastic ("even identical prompts produce different results") and that text descriptions are categorical and do not anchor a specific identity. The article is about visual characters. — [LTX blog: character consistency](https://ltx.io/blog/how-to-maintain-character-consistency-in-ai-video) (search summary only)
- [VENDOR, UNVERIFIED] The official LTX-2.3 prompt guide says to describe the acoustic environment and the character's voice qualities, put dialogue in quotation marks, and "(if required) mention the language and accent". — [LTX-2.3 prompt guide](https://ltx.io/model/model-blog/ltx-2-3-prompt-guide) (search summary only)
- [VENDOR, UNVERIFIED] fal.ai's LTX 2.0 launch post says the model adapts voices to the speaker's persona and context. That points to the voice following the visual character rather than staying fixed. — [fal.ai blog](https://blog.fal.ai/ltx-2-0-is-now-available-on-fal-2) (search summary only)
- Prompt mechanics for LTX-2.5 native audio (Sep 4, 2026): budget about 2.5 spoken words per second with a beat of silence at each end (a 10 s clip holds about 25 words); quote dialogue and name the language (example: "You came." spoken "in English"); in multi-shot prompts, state what the sound does at each cut. The article shows `"seed": 42` in request examples but gives no guidance on the seed's effect on voice. — [deAPI](https://deapi.ai/blog/ltx-2-5-prompting-guide-multi-shot-scenes-native-audio-and-prompts-that-actually-cut)
- The tagged format used by ID-LoRA and by a voice-LoRA trainer: `[VISUAL]` (shot, appearance, setting; state that the person is speaking "or the model may produce a voice-over"), `[SPEECH]` (exact transcript, never a summary), `[SOUNDS]` (tone, volume, mic distance, ambience). — [LTX blog: What Is ID-LoRA (Oct 1, 2026)](https://ltx.io/blog/what-is-id-lora); the same three-part caption format appears in [Oxen.ai's LTX-2 Yoda LoRA article (Jan 28, 2026)](https://ghost.oxen.ai/how-to-train-a-ltx-2-character-lora-with-oxen-ai/)
- Community prompting advice for delivery (HF forum, June 2026, LTX-2.3): capital letters are "a text convention" and were ignored for stress; write the line as performance direction for an actor; quote the dialogue; describe a pause before the key word and how it is emphasised; split long lines into short beats; describe the audio environment (close-mic speech, quiet room tone); keep the scene to one speaker, one short phrase, a close-up; check whether a Space, node or prompt enhancer rewrites the text before the model sees it. The reply calls "consistent speaker identity" a goal prompt-only control may not reach. — [HF forum thread](https://discuss.huggingface.co/t/ltx-2-3-problem-with-dialogs/176649)
- RuneXX (Jan 27, 2026, inferred, LTX-2.0): whether the model talks or narrates depends on the model; an explicit sequence-order prompt including the dialogue works better. — [HF Kijai/LTXV2_comfy #35](https://huggingface.co/Kijai/LTXV2_comfy/discussions/35)
- [VENDOR] LTX-2.5 model card: multishot generation produces shots that "hold character identity, environment, lighting, voice, and visual style across cuts". It does not say how, or how well. The card has a "9 languages" tag without naming them. — [HF Lightricks/LTX-2.5](https://huggingface.co/Lightricks/LTX-2.5)
- [UNVERIFIED] The only hands-on multishot test found checked the visual character across cuts (a woman in a yellow raincoat, cuts at 2.96 s and 6.24 s) and did not assess the voice. Other guides warn multishot is "not guaranteed identity locking" and may struggle with complex scenes. — search summary across [vuela.ai review](https://vuela.ai/models/ltx-2/review), [jxp.com review](https://www.jxp.com/ltx/blog/ltx-2-5-review), [hackernoon guide](https://hackernoon.com/ltx-25-a-complete-guide-to-lightricks-audio-video-ai-model); which page made which claim was not verified.

### Inferences
- Separate generations sample a new voice each time. Fixed voice wording (age, gender, timbre, accent, pace) and a fixed seed are likely to narrow the spread, but no one has published evidence that they keep one voice across prompts that differ in scene or dialogue. Changing the dialogue alone changes the conditioning, so a fixed seed does not guarantee the same voice.
- For LTX-2.5, putting several shots of one character into a single multishot generation is the only prompt-only route with an official voice-consistency claim. It is limited to one clip's length.

### Gaps
- No A/B test of seed locking or fixed voice descriptions across separate generations was found for any LTX version.
- No community report confirms or refutes the 2.5 multishot voice claim.
- A YouTube video titled "How to Keep Character Voices Consistent in LTX 2.3" exists ([YouTube 52Bd3ITB6kE](https://www.youtube.com/watch?v=52Bd3ITB6kE)), but the page fetch returned no description or method. It is an unread lead.

## 3. Reference-audio and LoRA methods (ID-LoRA, IC-LoRA, audio / audio-video LoRA training)

### Takeaway
On LTX-2/2.3 the community's main training-free voice lock is **ID-LoRA**, an In-Context LoRA that clones a voice from about a 5-second reference clip. It runs natively in ComfyUI via `LTXVReferenceAudio` and is [CAVEATS]: it works, with some generations still inconsistent. It is **not validated on LTX-2.5**: Lightricks says to treat it as unvalidated because 2.5 uses a different Gemma 4 text encoder. On LTX-2.5 the remaining route is a character audio-video LoRA trained with the LTX Trainer. Configs are published, but no community outcome for voice identity on 2.5 was found.

### Cited Findings
**ID-LoRA: method and numbers**
- Paper: "ID-LoRA: Identity-Driven Audio-Video Personalization with In-Context LoRA", arXiv 2603.10256, by Aviad Dahan, Moran Yanuka, Noa Kraicer, Lior Wolf and Raja Giryes; accepted to ECCV 2026. — [GitHub ID-LoRA-LTX2.3-ComfyUI](https://github.com/ID-LoRA/ID-LoRA-LTX2.3-ComfyUI); [arXiv](https://arxiv.org/html/2603.10256v1); [ID-LoRA GitHub](https://github.com/ID-LoRA/ID-LoRA)
- Mechanism: the reference audio is encoded by the Audio VAE and concatenated with the noisy target latents along the sequence; reference tokens get negative RoPE temporal positions; an "identity guidance" CFG term on the audio stream contrasts predictions with and without the reference; only audio reference tokens are prepended (no video reference), and the face comes from first-frame conditioning. The LoRA is rank 128 on audio self-attention, audio-video cross-attention and audio feed-forward, trained on about 3,000 pairs on one GPU. Reported speaker similarity 0.477 against 0.391 for the strongest cascaded baseline on the CelebV-HQ cross-video split, and better lip sync than cascaded pipelines and "a leading commercial model". — [LTX blog: What Is ID-LoRA, Oct 1, 2026](https://ltx.io/blog/what-is-id-lora)
- Legacy custom-node defaults: `identity_guidance_scale` 3.0, `stg_scale` 1.0, `av_bimodal_scale` 3.0, `lora_strength` 1.0 (range 0–2), `video_guidance_scale` 3.0, `audio_guidance_scale` 7.0, `seed` 42, `num_frames` 121, `num_inference_steps` 30 (two-stage stage 2 uses 3 fixed steps), `frame_rate` 25, `hq_mode` True (res2s sampler). Weights: `AviadDahan/LTX-2.3-ID-LoRA-CelebVHQ-3K` and `AviadDahan/LTX-2.3-ID-LoRA-TalkVid-3K` (about 1.1 GB each) on the `ltx-2.3-22b-dev` checkpoint with the Gemma 3 12B encoder. At least 24 GB VRAM; 48 GB recommended non-quantised. The repo is now deprecated in favour of native ComfyUI. — [GitHub ID-LoRA-LTX2.3-ComfyUI](https://github.com/ID-LoRA/ID-LoRA-LTX2.3-ComfyUI)
- Native ComfyUI: Kijai's [PR #13111](https://github.com/Comfy-Org/ComfyUI/pull/13111) added **LTXVReferenceAudio**, and the original ID-LoRA weights load without conversion. Inputs: `model`, `positive`, `negative`, `reference_audio` ("about 5 seconds recommended"), `audio_vae`, `identity_guidance_scale` (0–100, default 3.0; 0 disables the extra pass), and advanced `start_percent` / `end_percent` (0–1). It runs an extra forward pass without the reference at each step to strengthen identity. "Clips much shorter or longer than about 5 seconds may reduce voice identity transfer quality." — [ComfyUI docs: LTXVReferenceAudio](https://docs.comfy.org/built-in-nodes/LTXVReferenceAudio)
- [UNVERIFIED] Reference-length bounds seen only in search summaries: a third-party node listing says at least 1.8 s and no more than 15.1 s ([RunComfy node page](https://www.runcomfy.com/comfyui-nodes/ComfyUI/ltxv-reference-audio)); a user guide says a 15-second clip makes identity transfer "drop significantly" ([aistudynow](https://aistudynow.com/how-i-build-perfect-ai-lip-sync-with-ltx-2-3-and-id-lora/); the fetch failed with ECONNREFUSED, so this is unverified).

**ID-LoRA: community use (LTX-2.3)**
- [CAVEATS] RuneXX posted "Workflow - I2V & T2V with ID-LoRA for consistent voice across video generations" on Mar 25, 2026 (inferred): a 5-second reference clip gives a consistent voice; the demo "was ran with lowest strength", and higher strength gives more consistency. Apr 1: workflow updated with "higher strength at the ID-Lora node", a record-your-own-voice node and MelBandRoFormer for a cleaner reference. bushi893 (Apr 1): even with MelBandRoFormer, "consistency issues on some generations"; dots in the text produced short pauses but did not reliably control speed; "it seems it needs a slow input audio". The paper author AviadDahan (Mar 26): CelebVHQ "tends to include a higher variety of scene changes" and more background music or noise, so it should generalise better; TalkVid has more speakers, so it may cover more speaking styles; a combined checkpoint was planned. Apr 7: a long-video ID-LoRA workflow (overlapping segments) was "in testing"; an Apr 23 request for an update had no reply. — [HF Kijai/LTX2.3_comfy discussion #40](https://huggingface.co/Kijai/LTX2.3_comfy/discussions/40)
- [UNVERIFIED] A community adapter set, SyFeee/LTX-2.3-SyFe-ID-LoRA, needs an ID-LoRA-compatible LTX-2.3 pipeline; its card says identity quality depends strongly on portrait framing and face size. — [HF SyFeee](https://huggingface.co/SyFeee/LTX-2.3-SyFe-ID-LoRA) (search summary only)
- [UNVERIFIED] A comparison blog calls the r/StableDiffusion workflow by user brief_8831 (IC LoRAs + ID LoRAs + ComfyUI prompt relay) "the most complete public implementation" of LTX 2.3 character consistency. That is opinion, and it concerns faces rather than voice. — [MindStudio](https://www.mindstudio.ai/blog/bach-model-vs-ltx-2-3-ic-loras-character-consistency) (search summary only; the Reddit post itself could not be read)

**ID-LoRA and LTXVSetAudioRefTokens on LTX-2.5**
- Lightricks (Oct 1, 2026): ID-LoRA's text conditioning was trained against the Gemma 3 encoder of LTX-2/2.3, while LTX-2.5 ships a custom Gemma 4 encoder. "Treat ID-LoRA on LTX-2.5 as unvalidated and run it on LTX-2.3." To get identity control on 2.5 itself, you would port the training recipe, since ID-LoRA is trained in the LTX Trainer with an `audio_ref_only_ic` strategy and a reference-audio latents directory. — [LTX blog: What Is ID-LoRA](https://ltx.io/blog/what-is-id-lora)
- [UNVERIFIED] Sogni's LTX-2.5 reference lists the Voice ID-LoRA as LTX-2.3-only and says not to send its inputs to an LTX-2.5 model ID. — [Sogni docs](https://docs.sogni.ai/models/ltx-2-5/) (search summary only)
- `LTXVSetAudioRefTokens` is officially documented as attaching reference audio as conditioning tokens for speaker identity transfer, as part of the LTX-2.3 Dub-It pipeline. The Dub-It IC-LoRA docs say LTX-2.5 support is "in development". On 2.5 the community uses only the node's `frozen_audio` output (see section 1). — [LTX ComfyUI nodes docs](https://docs.ltx.io/open-source-model/integration-tools/ltx-comfy-ui-nodes), [Dub-It docs](https://docs.ltx.io/open-source-model/feature-guides/audio/dub-it-beta) (search summaries); [HF #44](https://huggingface.co/Lightricks/LTX-2.5/discussions/44)

**Character audio-video LoRA training (LTX Trainer / AI Toolkit)**
- [VENDOR] Lightricks' LTX-2.5 character LoRA guide (Sep 29, 2026). Voice is decided by `target_modules`:
  - The short patterns `["to_k", "to_q", "to_v", "to_out.0"]` cover the video, audio and cross-modal modules and learn the voice.
  - Video-only `attn1.*` and `attn2.*` keep dataset audio out.
  - "Mixed datasets are the trap": if half the clips carry the character's lines and half carry a soundtrack, the LoRA "may learn a blend of both".
  - Starting config: rank 32 / alpha 32; `flexible` strategy with `first_frame` probability 0.5; audio `is_generated: true`; LR 1e-4; 2000 steps; batch 1; checkpoints every 250 steps with `keep_last_n: -1`.
  - Weak identity: rank 64/128 and 3,000 steps.
  - Model files: `ltx-2.5-22b-dev-transformer-bf16.safetensors`, `gemma4-12b-with-proj-ltx-2.5-bf16.safetensors`, `ltx-2.5-audio-vae-bf16.safetensors`.
  - Hardware: Linux + CUDA (triton); 80 GB standard, 32 GB with `t2v_lora_low_vram.yaml`.
  - Inference: `LoraLoaderModelOnly` on both stage samplers, trigger token in every prompt, fixed seed while tuning.
  - Check the crop: center-cropping can cut the character out of a two-shot.
  — [LTX blog: character LoRA with LTX-2.5](https://ltx.io/blog/how-to-train-a-character-lora)
- [UNVERIFIED] RunComfy's LTX 2.5 AI-Toolkit guide: LR 1e-4, about 2000 steps, Audio Loss Multiplier 1.0 (do not raise it just because the first voice sample is weak), rank 32 / alpha 32; a one-frame preview cannot evaluate audio. — [RunComfy LTX 2.5 LoRA guide](https://www.runcomfy.com/trainer/ai-toolkit/ltx-2-5-lora-training-guide) (search summary only)
- [ANECDOTE] **Oxen.ai Yoda LoRA on LTX-2.0** (Jan 28, 2026). Voice was trained, and captions had `[VISUAL]` plus `[YODA_SPEECH]` with a word-for-word transcript; the visual text used only the name "Yoda". Clips about 5 s at 24 fps, trimmed so the speech fits inside; 20–30 videos suggested ("some work with as few as 10"). 1,000 steps, LR 2e-4, "LoRA size" 16, 960×576, about $10 of compute. "The audio and the video learn at different rates", and audio may click in before the video is learned. Results described as "encouraging", not quantified. — [Oxen.ai](https://ghost.oxen.ai/how-to-train-a-ltx-2-character-lora-with-oxen-ai/)
- Community troubleshooting for a voice LoRA (HF forum, May 26–27, 2026, LTX-2.3, Ostris AI Toolkit on RTX 5090). Ivco222's set was 27 clips of 6–10 s, `num_frames: 1`, `do_audio: true`, 5000 steps, LR 1e-4, rank/alpha 32. Replies:
  - Treat it as an AV-LoRA, not a voice-only LoRA, and do not use `num_frames: 1`; use frame counts that satisfy `% 8 == 1` (49, 73, 89).
  - Use a non-empty trigger, confirm `audio_latents/` exists, and decode and listen before long runs.
  - Write captions as trigger + voice description + "Speech: <transcript>" + "Sounds: … no music".
  - Target `to_k`, `to_q`, `to_v`, `to_out.0`, not narrow patterns like `attn1.to_k`.
  - Sanity run with 5–10 clips of 3–5 s and 300–800 steps, comparing base, LoRA off and LoRA on.
  - Failure table: distorted audio → target modules miss the audio branch; no audio effect → audio keys not loaded at inference.
  - ID-LoRA suggested as the inference-time alternative.
  - No training outcome was reported.
  — [HF forum: Training lora for LTX2.3 voice / sound only](https://discuss.huggingface.co/t/training-lora-for-ltx2-3-voice-sound-only/176239)
- [ANECDOTE, style rather than identity] The Civitai "LTX-2.3 Whisper & Soft-Spoken Audio LoRA" (plz12345, Jun 13, 2026; updated Jul 28). 74 clips by the training details or 78 by the version notes, from 8 voices (4 female, 4 male), 4 s segments (97 frames at 24 fps), ASR captions. 2,000 steps, 27 epochs, rank/alpha 32, target modules `audio_attn1, audio_attn2, video_to_audio_attn`, 192×192, strength 1.0, no trigger. The register applies to the whole clip, and breathy high frequencies are smoothed. 137 reviews rated "Very Positive". — [Civitai](https://civitai.com/models/2698739/ltx-23-whisper-and-soft-spoken-audio-lora)
- holycowdude (May 8, 2026, inferred) has "character LoRAs trained with audio" and asked for a LoRA loader in the multi-extend workflow so a character keeps speaking in the same voice. RuneXX added a global LoRA loader across all groups and tested it with a Gollum LoRA, but reported no voice-consistency result. — [HF RuneXX/LTX-2.3-Workflows discussion #131](https://huggingface.co/RuneXX/LTX-2.3-Workflows/discussions/131)

### Inferences
- The target-module advice conflicts. The HF forum reply and the Lightricks guide say to cover all branches with the short patterns; the Civitai whisper LoRA succeeded with audio-only modules for a delivery style. The difference is likely the goal: audio-only targeting changes timbre and register without touching lip sync, while a character identity LoRA that must stay in sync with the face benefits from cross-modal coverage.
- For an LTX-2.5 project today, the only voice-lock routes without new research are (a) audio-first frozen-latent A2V and (b) training a character AV-LoRA on the 2.5 dev transformer. Using ID-LoRA means dropping to LTX-2.3 for those shots.

### Gaps
- No published community result for ID-LoRA on LTX-2.5, positive or negative.
- No quantified community voice-similarity numbers for any trained voice LoRA. Only the paper's 0.477 SIM exists.
- No community dataset-size versus voice-fidelity curves. Configs vary from about 10 clips (Oxen) to 74 clips / 8 voices (Civitai).
- No reports of ID-LoRA with Korean or other non-English reference audio.

## 4. Continuity methods (extend, retake, keyframe chaining, audio tail conditioning)

### Takeaway
Community extend workflows on LTX-2.3 carry the previous segment's last ~3 seconds of video and audio forward as the reference (ReTake-style audio-video masking). The voice can continue only if it is audible in that window. Reported problems are visual and quality degradation after about 20 seconds and progressive audio fading, which a per-step loudness normalisation fixed. Voice continuity itself is claimed but has not been tested in any thread found. No LTX-2.5 extend reports about voice exist; the MLX port validates extend and retake on 2.5 but does not describe audio carry-over.

### Cited Findings
- [ANECDOTE / creator claim] RuneXX's "Extend Any Video" (Mar 13, 2026, inferred) uses LTX ReTake-style masking with KJNodes LTX AudioVideo masking on the last part of the input video. The masking is claimed to keep motion, looks and voice consistent. Details from the thread:
  - Overlap is "around 3 seconds or so" (May 5).
  - BarelyAIMedia (May 6): "the quality degrades over time no matter what I try".
  - RuneXX: use the original video's first frame as a guiding latent. LTX is trained on clips up to 20 s, with a sweet spot of 10–15 s.
  - Multi Extend has three groups, each taking the last few seconds of video and audio from the previous group, so "things not present in that reference segment, the model will forget".
  - With the MergeGreen IC-LoRA for transitions, ytrox (May 8) said "it even complete the sentence if it's cutted on dirty".
  — [HF Kijai/LTX2.3_comfy discussion #32](https://huggingface.co/Kijai/LTX2.3_comfy/discussions/32)
- [CAVEATS] In the multi-extend workflow thread (May 2026, inferred):
  - Reference frames default to 3 s and can go up to 20 s; the model knows nothing earlier.
  - RuneXX: "if a voice isn't heard in the reference frames, the next part can't know what it sounded like." Frontload the long segment because quality degrades over time.
  - **Audio fading**: in a 1m10s Gollum video the audio was "very faint after about 40–50 seconds", returning to normal when Gollum yelled. Fixed by "normalizing audio at each step" (BarelyAIMedia, May 19–20).
  - An audio-delay bug for inputs with versus without audio was fixed on May 19.
  — [HF RuneXX/LTX-2.3-Workflows discussion #131](https://huggingface.co/RuneXX/LTX-2.3-Workflows/discussions/131)
- In the ID-LoRA thread, a long-video workflow with ID-LoRA over overlapping segments was "in testing" on Apr 7, 2026, with no result posted by Apr 23. — [HF Kijai/LTX2.3_comfy #40](https://huggingface.co/Kijai/LTX2.3_comfy/discussions/40)
- RuneXX's V2V foley workflow (March 2026, LTX-2.3) adds audio to a silent video and has an extend mode of about 5–10 s. A frame-rate mismatch was blamed for timing problems, and the extend transition flickered. Combining the V2V foley and Custom Audio workflows was proposed for audio-driven V2V. — [HF RuneXX/LTX-2.3-2.5-Workflows discussion #30](https://huggingface.co/RuneXX/LTX-2.3-2.5-Workflows/discussions/30)
- [UNVERIFIED] Kijai's LTX-2.3 "V2V – Just Talk" workflow prompts lip-synced voice and sounds onto a silent video and can extend it. — [HF Kijai/LTX2.3_comfy discussion #39](https://huggingface.co/Kijai/LTX2.3_comfy/discussions/39) (search summary only)
- [VENDOR, UNVERIFIED] MimicPC advertises an "LTX2 video extend workflow with perfect audio cloning" that keeps the original speaker's voice. This is marketing with no independent test. — [MimicPC](https://www.mimicpc.com/workflows/ltx2-video-extendworkflow-with-perfect-audio-cloning-comfyui) (search summary only)
- [VENDOR, UNVERIFIED] The LTX IC-LoRA guide says the generic 2.5 workflow can freeze a reference video's audio through `LTXVSetAudioRefTokens`, so the output stays consistent with the source's sound. That is the frozen-audio use, not identity transfer. — [docs.ltx.io IC-LoRA](https://docs.ltx.io/open-source-model/usage-guides/ic-lo-ra) (search summary only)
- On LTX-2.5 the MLX port `dgrauet/ltx-2-mlx` lists `a2v`, `keyframe`, `retake` and `extend` as "validated end to end"; `ic-lora` and `lipdub` are not supported on 2.5 because Lightricks has not published 2.5 task IC-LoRAs. The README does not say whether `extend` carries the source audio. — [GitHub dgrauet/ltx-2-mlx](https://github.com/dgrauet/ltx-2-mlx)

### Inferences
- Tail-conditioned extension acts as a short-term voice memory of about 3 s by default. A segment that starts where the character is silent, or that cuts to another speaker, has no voice to copy. Raising the reference window (up to 20 s) and starting each extension inside the character's speech are the logical settings to test.
- For long dialogue, the more robust path implied by these threads is audio-first: one continuous TTS track split per segment and frozen in each extend step, so the voice never has to be "remembered". No source reports trying exactly this on 2.5.

### Gaps
- No direct voice-similarity check across extend segments in any thread.
- No LTX-2.5 extend/retake community reports on voice.
- No latent-level "audio tail" conditioning settings (overlap in latent frames, mask strengths) were published beyond the ~3 s default.

## 5. Multi-character dialogue

### Takeaway
Keeping two voices attached to the right faces is the least reliable part. An open Lightricks issue shows that labelled "Character A / Character B" prompts do not fix wrong-speaker lip sync, and that the model tends to switch speakers after every finished sentence. Mitigations reported: describe each speaker by a visible trait, use clearly distinct voices, avoid overlap, keep clips short, and use a dual-speaker IC-LoRA on 2.3. Nothing specific to 2.5 was found.

### Cited Findings
- [CAVEATS, strongest failure evidence] Issue #395, opened Jan 28, 2026 by jovan2009 on LTX 2 distilled bf16, with Image+Audio-to-Video, two characters and a pre-recorded non-English track. A and B start at the wrong times or talk over each other. Naming the characters, adding descriptions and "Character A:" / "Character B:" lines did not fix it; the user asked about masking audio to one side of the frame or mapping stereo channels to halves. Zueuk (Mar 11, 2026): the model "tends to switch characters after any finished sentence", treating the next sentence as a reply, and low-quantised GGUF versions reportedly do worse. jovan2009 (Mar 11): LTX 2.3 is better and its generated dialogue in their language is usually usable, so they stopped using pre-recorded audio, but wrong-speaker assignment persists, "especially for clips over 10 seconds"; asking for A+B+B produced A+B+A. Still open with no maintainer response. — [GitHub Lightricks/ComfyUI-LTXVideo issue #395](https://github.com/Lightricks/ComfyUI-LTXVideo/issues/395)
- [VENDOR] Lightricks' A2V tips (Jan 2026): "Start with Distinct Voices … This helps the model assign the right voice to the right character"; describe who is speaking ("the man in the red shirt says..." or "person with white hair responds"); avoid overlapping speech, such as ad-libs or several people at once; write actions in sequence. It claims "The model recognizes each voice and generates video accordingly". — [LTX blog](https://ltx.io/blog/how-to-generate-video-from-audio-in-ltx)
- [ANECDOTE] RuneXX (Jan 22, 2026, inferred, LTX-2.0 custom-audio I2V): "Seems to work with 2 talkers out of the box." No details. — [HF RuneXX/LTX-2-Workflows #5](https://huggingface.co/RuneXX/LTX-2-Workflows/discussions/5)
- [VENDOR] RunComfy hosts the "LTX 2.3 Dual Character Lip Sync LoRA" workflow; the creator is not named and no date is given. Input is a two-speaker WAV at 24 kHz with minimal noise and short natural pauses between lines, starting at the first on-screen speech, plus a medium or medium-wide two-shot with unobstructed faces turned roughly to camera. Describe "both characters distinctly". Raise `strength_model` for tighter articulation and speaker separation. Nodes: `LTXICLoRALoaderModelOnly`, `PromptRelayEncode`, `LTXVImgToVideoInplaceKJ`, `LTXVAudioVAEEncode`, `SamplerCustom` / `SamplerCustomAdvanced`, `LTXVLatentUpsampler`, `CreateVideo`, `VHS_VideoCombine`, `LTX2_NAG`. No benchmarks. — [RunComfy dual-character workflow](https://www.runcomfy.com/comfyui-workflows/ltx-2-3-dual-character-lip-sync-lora-in-comfyui-dual-speaker-animation)
- [UNVERIFIED] A Hugging Face user in an LTX-2 vertical-video lipsync thread reportedly found that saying explicitly in the prompt that the person is talking helped, and that the model "struggled far less" with a male voice input. — [HF RuneXX/LTX-2-Workflows discussion #10](https://huggingface.co/RuneXX/LTX-2-Workflows/discussions/10) (search summary only; attribution to this thread not confirmed)
- The HF forum reply lists "wrong speaker assignment" as a failure category separate from accent or pronunciation, and recommends one speaker, one short phrase and a close-up when exactness matters. — [HF forum](https://discuss.huggingface.co/t/ltx-2-3-problem-with-dialogs/176649)
- ID-LoRA takes one reference voice per generation; no source describes two reference voices in one ID-LoRA pass. — [ComfyUI docs](https://docs.comfy.org/built-in-nodes/LTXVReferenceAudio), [LTX blog](https://ltx.io/blog/what-is-id-lora)

### Inferences
- For stable two-voice scenes the safer structure follows from the failure reports: single-speaker shots (shot / reverse shot), each driven by that character's own TTS line as frozen audio, rather than a two-shot where the model has to decide who speaks. Each character's voice then stays fixed by the TTS speaker choice.
- When a two-shot is needed, keep it under about 10 seconds with clear pauses between lines and visually distinctive speaker descriptions; on 2.3 the dual-character IC-LoRA is an option.

### Gaps
- No LTX-2.5 multi-speaker reports.
- No method found that masks audio to a region of the frame or maps stereo channels to speakers; the question in #395 was unanswered.
- No reports of keeping two distinct voices stable across separate scenes with native audio (no TTS).

## 6. Known pain points (voice drift, gender/accent flips, non-English quality, artifacts) and workarounds

### Takeaway
The pain points reported most often are: voices re-rolled every generation (fixed by audio-first); lip sync refusing or mismatching custom audio, which is seed-dependent and worse on 2.5; wrong-speaker turn-taking; mispronunciation and stress errors in non-English speech; and audio fading over long extensions. No source measured Korean speech quality. The only Korean evidence is a YouTube title claiming LTX-2 "handles even Korean".

### Cited Findings
- Voice drift between generations is acknowledged by the vendor ([LTX blog](https://ltx.io/blog/how-to-generate-video-from-audio-in-ltx)). No source documented a specific gender-flip bug; the official guidance only says to match the voice's age and gender to the character (same source).
- Lip-sync refusal and mismatch: zoom-ins instead of talking on some images (LTX-2.0, [Kijai/LTXV2_comfy #35](https://huggingface.co/Kijai/LTXV2_comfy/discussions/35)); 2.5 "much stricter than LTX 2.3" and seed-dependent, with reverb read as backing vocals and modality guidance deforming the mouth ([HF #44](https://huggingface.co/Lightricks/LTX-2.5/discussions/44)); phoneme-level mismatch on 2.5, seed-dependent, and near-still frames during long silences ([Wan2GP #2200](https://github.com/deepbeepmeep/Wan2GP/issues/2200)).
- Over-length render: forcing a longer video than the audio makes the character keep "silently" talking. — [Kijai/LTXV2_comfy #35](https://huggingface.co/Kijai/LTXV2_comfy/discussions/35)
- Audio fading over chained extensions; fixed by per-step normalisation. — [RuneXX/LTX-2.3-Workflows #131](https://huggingface.co/RuneXX/LTX-2.3-Workflows/discussions/131)
- Speech rate: in the ID-LoRA workflow, dots in the text produced short pauses but did not reliably slow speech, and ID-LoRA "seems [to need] a slow input audio". — [Kijai/LTX2.3_comfy #40](https://huggingface.co/Kijai/LTX2.3_comfy/discussions/40)
- Non-English, Russian (LTX-2.3, June 2026): capitalised stress marks ignored; reads correctly sometimes and "stumbles on simple words" other times. Workarounds: performance-direction wording, a stress-marked spelling plus a syllable hint plus a plain explanation plus an acoustic cue; best is verified TTS then A2V. — [HF forum](https://discuss.huggingface.co/t/ltx-2-3-problem-with-dialogs/176649)
- Non-English, unnamed language: LTX 2's generated audio was poor in that language, so the user used pre-recorded audio; LTX 2.3's generated dialogue was "usually usable". — [GitHub issue #395](https://github.com/Lightricks/ComfyUI-LTXVideo/issues/395)
- [UNVERIFIED] Japanese and Chinese: cocktailpeanut on X says "LTX-2 can even generate videos in Japanese and Chinese" ([X post](https://x.com/cocktailpeanut/status/2014428608555528553)); a Japanese note.com guide says there are few verification reports for Japanese prompts and quality may differ from English ([note.com](https://note.com/dora5/n/n711d6486f618?hl=en)). Both are search summaries only.
- [UNVERIFIED] Korean: a Korean YouTube video titled "한국어까지 잘하는 LTX-2, Wan2GP 설치하고 내컴에서 무제한 AI 영상 만들기" ("LTX-2 that is good even at Korean…") claims Korean lip sync works. Anecdotal, not measured. — [YouTube kac-l7NZobk](https://www.youtube.com/watch?v=kac-l7NZobk) (search summary only). The LTX-2.5 HF card carries a "9 languages" tag without listing them. — [HF Lightricks/LTX-2.5](https://huggingface.co/Lightricks/LTX-2.5)
- [UNVERIFIED] A March 2026 paper reports a word error rate of 19.23% for LTX 2.3 against 40.45% for Ovi 1.1, with no per-language split. — [arXiv 2603.21986](https://arxiv.org/html/2603.21986v1) (search summary only)
- Audio spec conflict: ltx.io lists LTX-2.5 as "Dual-stream 14B video + 5B audio, 24kHz stereo" with "an updated vocoder" that reduces artifacts and dropouts ([ltx.io audio page](https://ltx.io/model/capabilities/audio-generation), search summary). The MLX port describes its output audio as stereo 48 kHz ([dgrauet/ltx-2-mlx](https://github.com/dgrauet/ltx-2-mlx)). The `mlx-community/ltx-2.5-mlx` card says the 2.5 audio VAE and vocoder (182M params) are "byte-identical to 2.3's" ([HF mlx-community/ltx-2.5-mlx](https://huggingface.co/mlx-community/ltx-2.5-mlx), search summary). That contradicts the "updated vocoder" claim and is unresolved.
- Prompt enhancers in Spaces or nodes may rewrite the dialogue text before the model sees it. — [HF forum](https://discuss.huggingface.co/t/ltx-2-3-problem-with-dialogs/176649)
- Generate Audio is off by default in some third-party tools (Fuser). — [fuser.studio](https://fuser.studio/articles/ltx-2-5-guide) (search summary)

### Inferences
- For Korean dialogue the evidence suggests generating Korean speech with a TTS whose Korean has been checked, then driving LTX with it as frozen audio and muxing the original WAV. That avoids both voice drift and the model's own pronunciation errors. How well LTX-2.5 lip-syncs to Korean phonemes is untested in public sources.
- The phoneme-mismatch reports on 2.5 suggest budgeting a seed sweep per shot when lip sync matters.

### Gaps
- No measured Korean (or other non-English) speech quality, voice consistency or lip-sync accuracy for any LTX version.
- No confirmed root cause for the 2.5 custom-audio phoneme mismatch.
- The 24 kHz vs 48 kHz and "updated vs identical vocoder" conflicts could not be resolved from primary sources.

## 7. Apple Silicon / MLX ports of LTX 2.5 audio

### Takeaway
MLX ports run LTX-2.5 with joint audio on Macs and expose audio-to-video, so the audio-first route is available locally. None of them implements reference audio (ID-LoRA / `LTXVReferenceAudio`), and `dgrauet/ltx-2-mlx` explicitly does not support IC-LoRA or LipDub on 2.5. No user has published voice-consistency results on any MLX port.

### Cited Findings
- **ddalcu/LTX-2.5-MLX-Serve-4bit**: a 4-bit MLX conversion packaged for mlx-serve, a Zig MLX server. Supports text-to-video, image-to-video (first-frame), audio-to-video and two-stage pipelines, "without Python". 36 GB on disk against 110 GB for upstream bf16, with the text encoder bundled. The upstream `vae_diffusion_decoder` and `duration_head` are not included. Documented API: `POST http://127.0.0.1:11434/v1/video/generations` with `prompt`, `num_frames`, `height`, `width`, `steps`, `seed`; no audio-input field is documented on the card. M4 Max 128 GB: 704×480, 97 frames at 24 fps, 8 steps, 2m17s end to end including the soundtrack. The license snapshot is dated 2026-08-12. No voice notes. — [HF ddalcu/LTX-2.5-MLX-Serve-4bit](https://huggingface.co/ddalcu/LTX-2.5-MLX-Serve-4bit)
- **dgrauet/ltx-2-mlx** (pure MLX port of 2.3 and 2.5). Features:
  - On 2.5, `a2v`, `keyframe`, `retake` and `extend` are validated end to end; `hdr-ic-lora` is experimental; `ic-lora` and `lipdub` are not supported on 2.5.
  - A2V CLI: `ltx-2-mlx a2v --prompt "..." --audio music.wav --frame-rate 24 -o a2v.mp4`. Python: `audio_path` on `A2VidPipelineTwoStage`.
  - Validation figures: A2V reconstructs the conditioned audio at −36.2 dB.
  - Memory: bf16 64 GB+ (32 GB with `--low-ram`), int8 32 GB+ (16 GB with `--low-ram`), int4 16 GB+. A 49-frame 2.5 retake peaks at 13.8 GB with `--low-ram`.
  - No reference-audio or ID-LoRA support.
  — [GitHub dgrauet/ltx-2-mlx](https://github.com/dgrauet/ltx-2-mlx)
- [UNVERIFIED] A fork README says full 2.5 pipeline coverage (`--distilled`, `--two-stage`, `--two-stages-hq`, keyframe, a2v, retake, extend) is auto-detected and duration can be auto-predicted via a DurationHead. — [GitHub tanis2000/ltx-2-mlx](https://github.com/tanis2000/ltx-2-mlx) (search summary)
- [UNVERIFIED] The macOS app `james-see/ltx-video-mac` routes LTX-2.5 through `dgrauet/ltx-2-mlx` and LTX-2/2.3 through `mlx-video-with-audio`; a write-up notes some LTX LoRA workflows may not work directly on the MLX audio-video path without extra conversion. A ComfyUI extension built on an MLX port (`tanis2000/comfyui-ltx2-mlx`) includes an audio-to-video node. — [GitHub james-see/ltx-video-mac](https://github.com/james-see/ltx-video-mac), [comfy.icu extension page](https://comfy.icu/extension/tanis2000__comfyui-ltx2-mlx) (search summaries)
- [UNVERIFIED] `mlx-community/ltx-2.5-mlx` (bf16, 22B) says the 2.5 audio VAE and vocoder are byte-identical to 2.3's. — [HF mlx-community/ltx-2.5-mlx](https://huggingface.co/mlx-community/ltx-2.5-mlx) (search summary)

### Inferences
- On Apple Silicon the practical voice lock for LTX-2.5 is the A2V path with a pre-generated TTS track (`dgrauet` `a2v --audio`), muxing the original WAV afterwards as the CUDA community does. Whether the MLX A2V freezes the audio latent the same way as the ComfyUI `frozen_audio` recipe is not documented; the −36.2 dB reconstruction figure means the decoded audio is close to the input but not bit-identical, which is another reason to mux the original file.
- Voice LoRA training is not available on Mac, because the LTX Trainer is Linux/CUDA only ([LTX blog](https://ltx.io/blog/how-to-train-a-character-lora)). LoRAs trained elsewhere may need conversion for MLX paths.

### Gaps
- No public reports of voice consistency, lip-sync quality or non-English speech on any MLX port.
- How the ddalcu mlx-serve API accepts input audio for A2V is undocumented on the card.
- No MLX implementation of reference-audio identity guidance was found.
