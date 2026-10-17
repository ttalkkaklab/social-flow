# Post-generation voice fixing, replace-and-resync, and cross-model practice for character voice consistency (LTX-2 / 2.3 / 2.5)

Scope note for the report writer: research date 2026-10-17. Source classes are marked as
[primary] (vendor's own docs for its own product, arXiv papers, GitHub issues, first-hand community
posts) or [vendor/aggregator blog] (third-party SEO/marketing guides, often by companies reselling
model access). Several findings come from search-result snippets where the page itself was not
fetched; those are marked "(snippet, page not fetched)". Version labels: most LTX-specific evidence
found refers to **LTX-2** (paper/benchmarks, Jan 2026) or **LTX 2.3** (community workflows and
posts, Mar–May 2026). **No source in this set directly evaluates LTX 2.5 voice behaviour**; the only
2.5-labelled item is a YouTube tutorial title. Do not read the LTX-2 numbers as LTX 2.5 numbers.
Bullets without a date come from search snippets whose publication date was not captured; treat
them as 2025–2026 third-party guides of unverified date.

## 1. Voice conversion on LTX-generated audio (RVC, Seed-VC, OpenVoice, ElevenLabs Voice Changer, Chatterbox VC): extract, convert, remux, what breaks

### Takeaway
No creator report found that applies RVC, Seed-VC, OpenVoice, Chatterbox VC or ElevenLabs Voice Changer specifically to LTX output. The established, documented "fix the voice afterwards" procedure comes from Veo 3 users: concatenate clips in an editor, export the dialogue, run it through ElevenLabs Voice Changer (speech-to-speech) against one fixed voice, and lay the converted stem back under the picture. Because speech-to-speech keeps the source timing, the procedure transfers to LTX with little change, but the source must be a clean, isolated dialogue stem.

### Cited Findings
- **Canonical workflow (Veo 3, pre-dates the 2025-10 window: 2025-08-18).** Three steps: (1) generate Veo 3 clips with a short voice and accent description in each prompt, (2) export and arrange audio in the editing timeline, (3) "Process through ElevenLabs voice changer to standardize all clips to one voice profile." No trade-offs are discussed; the article presents the method as seamless. — [ai-for-real-life (beehiiv), 2025-08-18](https://ai-for-real-life.beehiiv.com/p/the-secret-to-consistent-characters-in-veo-3-and-how-to-fix-the-voices-too)
- Same creator's TikTok version (also pre-window, Aug 2025): arrange clips in CapCut, export "just the vocals or the full video," drop the complete vocal track (or full video of all clips at once) into ElevenLabs Voice Changer, generate, re-sync and replace, then add ambience. Advises keeping the **accent** fixed in prompts even if the voice drifts slightly, because accent changes break a scene. — [TikTok @ai.for.real.life](https://www.tiktok.com/@ai.for.real.life/video/7537477893442538766)
- A Korean YouTube tutorial teaches the same idea for Veo 3: use ElevenLabs voice cloning + voice changer so the Veo 3 clip keeps its mouth shapes and intonation and only the voice changes (date not confirmed; snippet, page not fetched). — [YouTube: 구글 veo3 영상 목소리 바꿔 사용 방법 + 일레븐랩스 사용법](https://www.youtube.com/watch?v=mulcQdJC4Tw)
- **Detailed Voice Changer procedure for AI video [vendor/aggregator blog, 2026-09-20]:** (1) write an acceptance note per line (speaker, language, target voice, emotional intent, in/out points, whether the mouth is close to camera); keep original clip, clean dialogue export, transformed take and final video as separate files; (2) export only the needed dialogue range with short handles and remove/isolate music, effects, other speakers and noise; (3) test one representative line first and compare word accuracy, cadence, breath position and emotion against the source; (4) place the converted file on a new track, mute the original, align on the first clear consonant, fix drift locally before any time-stretching; (5) add room tone, breaths, music and SFX after sync is stable, match loudness after editing "not by heavy limiting"; (6) check the hardest name, emotional peak, quietest phrase and fastest mouth movement. — [seedance.tv blog, 2026-09-20](https://www.seedance.tv/blog/elevenlabs-voice-changer-video-tutorial)
- Same source: Voice Changer has a documented **5-minute maximum per request**; split longer scenes at natural pauses with 1–2 s overlap and keep a cue sheet (file names, timecodes, line text, emotion, target voice). Recommends the multilingual speech-to-speech model (stated to support 29 languages). Says the tool "does not automatically finish your video mix, repair every lip mismatch." — [seedance.tv blog, 2026-09-20](https://www.seedance.tv/blog/elevenlabs-voice-changer-video-tutorial)
- **What breaks (same source):** smeared words from clipping, overlap, heavy reverb or background music; lost emotion when the source performance is weak; drift (constant offset, duration/sample-rate mismatch, or one bad phrase); noise removal that drops breaths, adds metallic tails or clips quiet words; other speakers leaking into the conversion; voice character shifting between clips when the voice, model or source style changes. — [seedance.tv blog, 2026-09-20](https://www.seedance.tv/blog/elevenlabs-voice-changer-video-tutorial)
- ElevenLabs Voice Changer (formerly Speech-to-Speech) keeps emotion, pacing, intonation, breaths, whispers, laughs and cries and only swaps the speaker; API flow is "source file + target voice_id → transformed audio" (snippets, pages not fetched). — [Segmind blog](https://blog.segmind.com/elevenlabs-voice-changer-how-to-convert-voices-in-2026/); [Quest Studio blog](https://queststudio.io/blog/elevenlabs-voice-changer-performance-guide); [ElevenLabs voice-changer agent skill](https://mcpservers.org/agent-skills/elevenlabs/voice-changer)
- **Seed-VC** [primary]: zero-shot voice conversion (and singing VC) with real-time support; paper reports higher speaker similarity and lower WER than OpenVoice and CosyVoice in zero-shot VC. Evaluations are English/Chinese only. — [Seed-VC GitHub](https://github.com/Plachtaa/seed-vc); [arXiv 2411.09943](https://arxiv.org/html/2411.09943v1)
- A later VC paper (X-VC, 2026-04) benchmarks Seed-VC on English↔Chinese cross-lingual conversion only (snippet: Seed-VC small WER 2.82 on EN→ZH). — [arXiv 2604.12456](https://arxiv.org/pdf/2604.12456)
- **RVC** is MIT-licensed speech-to-speech conversion with known limitations around database coverage in few-shot/real-time settings (general reference). — [Wikipedia: Retrieval-based Voice Conversion](https://en.wikipedia.org/wiki/Retrieval-based_Voice_Conversion)
- Chatterbox appears only in a hobby repo pairing Chatterbox TTS cloning with Seed-VC for singing conversion; no quality evaluation found. — [GitHub 313danielscv-pixel/Clonacion-voz](https://github.com/313danielscv-pixel/Clonacion-voz)
- **Only LTX-specific voice-identity report found (generation-time, out of strict scope, LTX 2.3):** with an ID-LoRA custom-voice i2v workflow, lip sync and video were fine but the custom voice came out "choppy, broken, distorted"; the user still recognized the target voice. — [GitHub Lightricks/ComfyUI-LTXVideo issue #464](https://github.com/Lightricks/ComfyUI-LTXVideo/issues/464)

### Inferences
- The Veo 3 → Voice Changer → remux procedure is model-agnostic: it needs only a dialogue audio track whose timing already matches the mouth. LTX output satisfies that, so the same steps should apply. This transfer is an inference, not a reported LTX result.
- LTX native audio is a single mixed track (dialogue + ambience/music generated together). Given the "background music/reverb smears words" failure mode above, a vocal-separation pass (e.g., the Mel-Band RoFormer node that LTX 2.3 ComfyUI workflows already ship for isolating vocals, see Q2) before conversion is likely required, then re-adding the ambience stem after conversion.
- Speech-to-speech keeps the original prosody, so LTX's emotional delivery (and also its mispronunciations) carries through. VC fixes **timbre identity**, not pronunciation or acting. Given LTX-2's low expressiveness scores in PRISM-Bench (Q5), VC on LTX audio may produce a consistent voice with flat acting.
- Converting a whole episode's concatenated dialogue in one pass (as the Veo creator does) helps cross-clip consistency, within the 5-minute request limit.

### Gaps
- No Reddit/GitHub/Civitai report found of RVC, Seed-VC, OpenVoice, Chatterbox VC or ElevenLabs VC used on LTX-2/2.3/2.5 output specifically; Reddit-restricted searches returned no Reddit pages.
- No measured comparison (speaker similarity, WER) of these VC tools on AI-generated (as opposed to recorded human) source speech.
- No Korean-language evaluation of Seed-VC, RVC, OpenVoice or Chatterbox VC was found (see Q6).

## 2. Replace-and-resync: discard LTX audio, generate dialogue with a pinned/cloned TTS voice, lip-sync the video (LatentSync, MuseTalk, Wav2Lip, InfiniteTalk, Sync.so, HeyGen, Kling lip-sync); quality and when preferred over LTX audio-to-video

### Takeaway
On LTX, "replace the audio" is usually done by **regenerating the shot with LTX's own image+audio-to-video (ia2v) / lip-sync mode fed a TTS or recorded voice track**, not by post-hoc lip-sync on finished LTX footage. That is the structural difference from Veo/Sora, which take no audio input, so their users must fall back on voice conversion or a separate lip-sync model. For post-hoc dubbing of existing video, the 2026 open-source default is LatentSync 1.6, with MuseTalk for speed, InfiniteTalk as a heavier generative option, and LTX LipDub (an IC-LoRA on LTX 2.3) still in beta.

### Cited Findings
- **LTX audio-in routes (the LTX-native replace path):**
  - Official ComfyUI template "LTX-2.3: Image Audio to Video": takes a portrait plus a voice recording and conditions on the face and audio timing to drive mouth movement (snippet, page not fetched). — [comfy.org workflow](https://comfy.org/workflows/video_ltx2_3_ia2v-adca306765ce/)
  - RunComfy "LTX 2.3 Talking and Singing Lip Sync" workflow adds Mel-Band RoFormer vocal separation before lip-sync (snippet). — [RunComfy](https://www.runcomfy.com/comfyui-workflows/ltx-2-3-talking-and-singing-lip-sync-in-comfyui-portrait2video-sync)
  - LTX 2.3 all-in-one ComfyUI guide (2026-04-27) treats audio-to-video (load audio, describe the scene) and lipsync (start frame + audio track + performance prompt) as separate modes and advises keeping action simple for lipsync (snippet). — [awheatsandbox guide, 2026-04-27](https://awheatsandbox.com/public/guides/ltx-2-3-all-in-one-comfyui-workflow-guide-2026-04.html)
  - YouTube tutorial titled "LTX 2.5 Lip Sync in ComfyUI — Image + Audio to Talking Video" (title only; content and date not verified). — [YouTube](https://www.youtube.com/watch?v=MfxTeFQgbP0)
  - LTX 2 audio-to-video lip-sync tutorial for ComfyUI/SwarmUI. — [FurkanGozukara wiki](https://github.com/FurkanGozukara/Stable-Diffusion/wiki/LTX-2-and-Z-Image-Base-Full-Tutorial-Audio-to-Video-Lip-Sync-ComfyUI-SwarmUI-Windows-Cloud)
  - ElevenLabs integrated LTX's Audio-to-Video API as its first third-party audio-to-video model inside the ElevenLabs platform, i.e. a voice-first pipeline where the ElevenLabs voice drives LTX video (snippet; LTX's own blog, not explored in depth per scope). — [LTX Studio blog case study](https://ltx.studio/blog/ltx-audio-to-video-generation-with-elevenlabs)
- **Post-hoc lip-sync comparison [vendor/aggregator blog, 2026-05-22]:** LatentSync 1.6 = local baseline / preferred default for short social-video dubbing; KeySync = closest challenger, did not beat LatentSync in their test; MuseTalk = speed fallback (30 FPS on a V100); InfiniteTalk = "heavier video-to-video and image-to-video talking generation… not a drop-in replacement," users report slow inference and 720p memory pressure; **LTX LipDub = IC-LoRA trained on LTX 2.3 22B, gated community license, early-beta limits on clip length, language and teeth sharpness — "promising watchlist item, not yet a drop-in production default"**; Wav2Lip = dated sanity baseline. — [Instavar, 2026-05-22](https://instavar.com/research/ai-video/open-source-lip-sync-models)
- **Recurring post-hoc lip-sync failure modes (same source):** full-frame quality loss outside the mouth; mouth boxes, black-mouth artifacts, jitter, unnatural teeth; identity drift despite accurate timing; sync drift on long clips or cuts; unclear face-angle/occlusion/speaker-count requirements; hosted-service credit costs, watermarks and moderation blocks. The article targets real footage, not AI-generated clips; it suggests InfiniteTalk for generated-presenter workflows. — [Instavar, 2026-05-22](https://instavar.com/research/ai-video/open-source-lip-sync-models)
- LatentSync [primary]: audio-conditioned latent diffusion with SyncNet supervision; reported strongest lip-sync accuracy among compared methods (SyncNet trained to ~94% accuracy) (snippet). — [arXiv 2412.09262](https://arxiv.org/pdf/2412.09262)
- InfiniteTalk [primary]: "sparse-frame video dubbing"; authors report a large lip-sync lead over image-to-video baselines and note that LatentSync edits only the mouth region (snippet). — [arXiv 2508.14033](https://arxiv.org/pdf/2508.14033)
- LatentSync described as slower and more compute-hungry than most alternatives [vendor/aggregator blog] (snippet). — [Pixazo](https://www.pixazo.ai/blog/best-open-source-ai-lip-sync-models)
- **TTS replace workflow without lip-sync model [vendor/aggregator blog, 2026-05-30, Seedance 2.0/Kling focus]:** export video; record a clean 60–90 s sample; ElevenLabs Instant Voice Clone; generate each line in 1–2-sentence chunks with systematic filenames; mute the original audio; align each line to mouth movement manually; add ambience/music bed. Mentions Sync Labs and Wav2Lip for re-rendering mouths and HeyGen/D-ID for automated dubbing, without testing them. Author's opinion: viewers forgive sync in synthetic video, ~100–200 ms offset "generally acceptable." Settings: Stability 0.40–0.60; WAV 24-bit preferred. Failure modes: noisy/monotone clone source, long blocks sounding unnatural, very high stability = robotic, dialogue over full silence sounds artificial. — [MindStudio blog, 2026-05-30](https://www.mindstudio.ai/blog/elevenlabs-voice-cloning-replace-ai-generated-voices)

### Inferences
- For LTX, the cheapest consistent-voice pipeline is "pinned TTS voice → LTX ia2v/lipsync from the shot's still," because the voice is fixed before video exists and lip-sync is produced in the same generation. Post-hoc lip-sync (LatentSync/MuseTalk/InfiniteTalk) on an LTX t2v/i2v clip adds a second generative pass with the failure modes above (teeth, mouth box, identity drift), so it fits best when the LTX shot's motion must be kept exactly and only the words change.
- Manual alignment of new TTS lines to existing LTX mouth motion (MindStudio route) only works if line length and pauses roughly match the original; otherwise a lip-sync model or LTX regeneration is needed.
- Preference over LTX native text-driven audio: replace-and-resync is preferred when cross-episode voice identity matters more than the spontaneity of LTX's generated acting, given LTX-2's low speech scores in Q5.

### Gaps
- No published or community quality report of Sync.so, HeyGen, Kling lip-sync or InfiniteTalk applied specifically to LTX-generated video.
- No head-to-head of "LTX ia2v with TTS input" vs "LTX native audio + VC" vs "LTX video + LatentSync" on the same shots.
- LTX LipDub's supported languages (and whether Korean works) were not found.

## 3. Voice "bible" / casting practices: per-character reference clip, fixed voice IDs, fixed TTS settings, loudness/EQ matching, cross-episode documentation

### Takeaway
Practice converges on: one fixed voice asset per character (an ElevenLabs voice_id, a Kling element with a bound voice, a Sora cameo), a written character bible with verbatim voice wording reused in every prompt, fixed synthesis settings, and a per-line cue sheet that records source, target voice, emotion and approvals. Loudness matching and ambience re-addition happen after sync. Formal published "voice bible" templates are rare; most guidance lives in vendor tutorials.

### Cited Findings
- Keep a cue sheet per scene with file names, timecodes, line text, emotion and target voice; keep source, stem, mix and approval record; use a consistent voice, model and recording style across a scene; change one variable at a time. — [seedance.tv blog, 2026-09-20](https://www.seedance.tv/blog/elevenlabs-voice-changer-video-tutorial)
- Systematic filenames per dialogue line; fixed Stability 0.40–0.60; one to two sentences per generation; keep similar-sounding characters distinct. — [MindStudio blog, 2026-05-30](https://www.mindstudio.ai/blog/elevenlabs-voice-cloning-replace-ai-generated-voices)
- Character bible covering personality traits, vocal tone and speech quirks, reused with "the same language every time you prompt Veo 3" (snippet; attribution to this page from search summary). — [Artlist blog](https://artlist.io/blog/consistent-character-ai/)
- Reusing a detailed character description word for word helps continuity between separately generated Veo 3 scenes (stated for appearance; extending it to voice is an extrapolation) (snippet). — [Replicate blog](https://replicate.com/blog/using-and-prompting-veo-3)
- Kling 3.0 Omni elements store a named character with "voice tone, name, and description" fields and a bound voice; once bound, the voice "does not need to be specified again in the input field." Recommended reference audio: "clean background noise, moderate speech speed, neutral voice with consistent emotion and style." [primary, 2026-02-06] — [Kling VIDEO 3.0 Omni guide](https://kling.ai/quickstart/klingai-video-3-omni-model-user-guide)
- A Korean user report suggests ElevenLabs Stability and Similarity around 70% sound natural and above 80% often becomes stiff (personal experience, date not verified; snippet). — [이랜서 블로그](https://www.elancer.co.kr/blog/detail/1047)
- ElevenLabs Eleven v3 audio tags such as [French accent], [sarcastically] direct character acting at TTS time [primary, ElevenLabs Korean blog]. — [ElevenLabs blog (ko)](https://elevenlabs.io/ko/blog/eleven-v3-character-direction)
- Match loudness after editing rather than by heavy limiting; re-add room tone and breaths after sync. — [seedance.tv blog, 2026-09-20](https://www.seedance.tv/blog/elevenlabs-voice-changer-video-tutorial)
- Dialogue over complete silence sounds artificial; add an ambient bed. — [MindStudio blog, 2026-05-30](https://www.mindstudio.ai/blog/elevenlabs-voice-cloning-replace-ai-generated-voices)

### Inferences
- A workable per-character record for an LTX series: reference clip (clean, 10–30 s), TTS/VC engine + model ID, voice_id, fixed settings (stability/similarity/style), accent/age/register wording reused verbatim in prompts, target loudness, and a per-line cue sheet. This is assembled from the sources above, not a single published template.
- Fixing the voice asset outside the video model (TTS/VC voice_id) is portable across video models; model-internal bindings (Kling elements, Sora cameos) are not portable to LTX.

### Gaps
- No source gives specific loudness targets (LUFS) or EQ-matching procedures for AI-video dialogue across clips.
- No published multi-episode "voice bible" document from an AI-series creator was found.

## 4. How Veo 3/3.1, Sora 2, Kling 2.x/3, Wan 2.5/2.6, Seedance users keep voices consistent, and which techniques transfer to LTX

### Takeaway
Closed models are adding model-side voice identity: Kling 3.0 Omni binds a voice to a character element, Sora 2 cameos carry the voice for self-cameos, Wan 2.6 reference-to-video reportedly carries voice timbre from a reference clip, and Seedance 2.0 accepts reference audio as a style guide rather than an exact clone. Veo 3/3.1 has no documented voice lock, so Veo users rely on verbatim voice descriptions plus ElevenLabs Voice Changer afterwards. The transferable techniques for LTX are the model-agnostic ones: verbatim voice wording, post-hoc VC, and audio-first generation (TTS then audio-conditioned video), which LTX's ia2v mode supports.

### Cited Findings
- **Kling 3.0 Omni [primary, guide dated 2026-02-06]:** a 3–8 s video of the character supplies appearance and "the original voice"; a clear voice recording can replace the extracted voice; multi-image elements accept a voice recording; voice binding applies only to character-type subjects; VIDEO O1 did not support voice on elements; native audio is "Not Supported Yet" when a video input is used; max generation 15 s; dialogue syntax uses element tags (`@Grace says, "..."`), per-shot blocks and timestamped `Audio:` lines. Required audio length conflicts inside the guide: "≥3s" in the body vs "5-30s single-person speech audio" in the FAQ. — [Kling VIDEO 3.0 Omni guide](https://kling.ai/quickstart/klingai-video-3-omni-model-user-guide); third-party guides repeat the voice-stays-consistent claim [vendor/aggregator] — [Morphic](https://morphic.com/resources/how-to/kling-3.0), [Atlas Cloud](https://www.atlascloud.ai/blog/tips/solving-character-inconsistency-a-guide-to-kling-3.0-image-to-video-mode) (Atlas cites 3–8 s for the voice sample, contradicting the official FAQ's 5–30 s); a skeptical analysis argues the guide does not describe the element voice as selectable/auditionable/replaceable — [Sentioscope](https://sentioscope.com/fields/per-character-binding/kling-ai/), contradicted by the official guide's custom-voice upload note.
- **Sora 2:** character cameos (pets, drawings, original figures, named and reusable) were added to the Sora app in late Oct 2025 alongside clip stitching. — [The Decoder, 2025-10](https://the-decoder.com/openai-adds-character-cameos-and-video-stitching-to-its-sora-generator/). Self-cameos require a one-time video and audio recording. — [NBC News](https://www.nbcnews.com/tech/tech-news/openai-announces-sora-2-ai-video-audio-app-rcna234753). Voice carries over only for self-cameos; pets/original characters get visual identity, not a voice match [vendor/aggregator] (snippet) — [flick.art](https://flick.art/blog/img2img-consistent-character/sora); contradicted (loosely) by a Spanish report that character cameos are animated "con voces" — [marketing4ecommerce](https://marketing4ecommerce.mx/cameos-de-personajes-sora-2/). No OpenAI help-center page was retrieved.
- **Veo 3 / 3.1:** no dedicated voice-lock feature found. Community practice: put voice/accent in the character profile, reuse wording verbatim, quote dialogue, add audio cues (snippets) — [Artlist](https://artlist.io/blog/consistent-character-ai/), [Atlabs Veo 3.1 guide](https://www.atlabs.ai/blog/the-ultimate-prompting-guide-for-veo-3-1), [Magic Hour](https://magichour.ai/blog/how-to-prompt-for-speaking-in-veo-3). Veo 3.1 Ingredients-to-Video reference images anchor appearance, not voice (snippet; exact page among the Veo 3.1 guides above not verified). Then the ElevenLabs Voice Changer pass from Q1 — [beehiiv, 2025-08-18](https://ai-for-real-life.beehiiv.com/p/the-secret-to-consistent-characters-in-veo-3-and-how-to-fix-the-voices-too). One user reports Veo 3 speaking em dashes aloud and mispronouncing acronyms (snippet) — [Substack note](https://substack.com/@techysurgeon/note/c-238378922).
- **Wan 2.6 [vendor/aggregator, unverified against Alibaba docs]:** reference-to-video (wan2.6-r2v) takes a ~5 s reference video and carries appearance and voice timbre into new shots; up to three references; 5 or 10 s, 720p/1080p (snippets). — [wan26.info](https://www.wan26.info/wan/wan-2-6), [vidofy](https://vidofy.ai/en/models/wan/wan-2-6), [MindStudio Wan 2.6](https://mindstudio.ai/blog/what-is-wan-2-6-video-open-source). Figures conflict across these sites (150 reference frames vs 5 s clip; 1,000 tokens vs 1,500 characters).
- **Seedance 2.0 [vendor/aggregator]:** audio reference reads tone, pacing, cadence, accent and register and "is a style guide, not voice cloning… doesn't copy the voice sample precisely"; MP3/WAV/M4A/AAC, ≤3 audio files, ≤15 s combined, must be paired with an image or video (snippets). — [MindStudio Seedance audio reference](https://www.mindstudio.ai/blog/seed-audio-reference-seedance-video-generation-workflow), [seedance2.so](https://seedance2.so/blog/seedance-2-consistent-voice). Keep lines to ~5–10 words; lip sync reported to degrade past ~8 s; multi-person lip sync and audio distortion remain issues (snippets). — [cutout.pro Seedance 2.0 audio guide](https://www.cutout.pro/learn/blog-seedance-2-0-audio-guide/), [Magic Hour review](https://magichour.ai/blog/seedance-20-review)
- Seedance 2.0 creators who need an exact voice replace the audio with an ElevenLabs clone (Q2 workflow). — [MindStudio blog, 2026-05-30](https://www.mindstudio.ai/blog/elevenlabs-voice-cloning-replace-ai-generated-voices)

### Inferences
- Transfers to LTX: (a) verbatim voice/accent wording in every prompt; (b) post-hoc ElevenLabs/Seed-VC conversion of the whole episode's dialogue; (c) audio-first: generate the line with a pinned voice, then condition video on it, which LTX does natively via ia2v while Veo and Sora cannot.
- Does not transfer: Kling element voice binding, Sora cameos and Wan r2v voice carry-over are model-internal features. LTX's closest analogue (ID-LoRA voice identity) is generation-time and out of this note's scope; the one report found (issue #464) shows identity recognized but audio degraded.
- Reference-audio conditioning in Seedance is explicitly a style guide, so even closed models with audio input do not guarantee exact identity; post-hoc VC or TTS replacement remains the fallback across vendors.

### Gaps
- No community thread found stating explicitly "this Veo/Kling/Seedance technique also works on LTX."
- No official Alibaba or OpenAI documentation was retrieved for Wan 2.6 r2v voice or Sora character-cameo voice behaviour.

## 5. Published evaluations of speaker-identity consistency for LTX-2 / LTX 2.5 vs other models

### Takeaway
No benchmark found measures speaker-identity or voice consistency across clips for any of these models. The available joint audio-video benchmarks score speech quality, expressiveness and sync; on those, LTX-2 trails closed models by a wide margin on speech. No benchmark covers LTX 2.3 or 2.5.

### Cited Findings
- **PRISM-Bench [primary, arXiv v2 2026-09-09, ACM MM '26]** evaluates Seedance 2.0, Kling v3 Omni, Veo 3.0, Veo 3.1, Sora 2, LTX-2, Ovi, MOVA. No WER, speaker-identity, voice-consistency or timbre-consistency metric; speech is MLLM-judged (0–10). On-screen speech audio quality / expressiveness: Ground truth 8.06/8.00; Seedance 2.0 8.37/8.49; Kling v3 Omni 8.53/8.30; Veo 3.1 8.13/8.09; Veo 3.0 7.97/7.60; Sora 2 6.67/6.27; **LTX-2 5.22/3.77**; MOVA 4.31/4.59; Ovi 3.90/2.83. Final on-screen score: Seedance 2.0 97.73, Kling v3 Omni 85.99, Veo 3.1 84.11, Sora 2 69.82, **LTX-2 49.50** (best open-source on-screen), Ovi 40.15. — [arXiv 2609.04867v2](https://arxiv.org/html/2609.04867v2)
- **LTX-2 paper (self-reported, Jan 2026):** human preference rated LTX-2 well above Ovi and comparable to Veo 3 and Sora 2 for audiovisual realism/sync (snippet). — [arXiv 2601.03233](https://arxiv.org/pdf/2601.03233)
- **OmniHuman / OHBench [primary, 2026-04]** compares Veo 3.1, Sora 2, Ovi, LTX-2 on image-to-audio-video: LTX-2 strong on person-to-person interaction/listener realism (slightly above Veo 3), but its audio quality suffers; it measures identity consistency for dual-person scenes (snippet; whether "identity" includes voice not verified). — [arXiv 2604.18326v2](https://arxiv.org/html/2604.18326v2)
- **T2AV-Compass [primary]:** Veo-3.1 first (70.29), Sora-2 second (69.83); LTX-2 lower low-level visual fidelity than other open models (snippet). — [arXiv 2512.21094v3](https://arxiv.org/html/2512.21094v3)

### Inferences
- PRISM-Bench's LTX-2 expressiveness (3.77 vs ~8 for closed models) suggests that VC on LTX audio would yield a consistent timbre over weak acting, while replacing with expressive TTS (e.g., ElevenLabs v3 tags) then using LTX ia2v addresses both identity and acting. These scores are for LTX-2, not 2.3/2.5.

### Gaps
- No metric of cross-clip speaker similarity (e.g., speaker-embedding cosine across generations) was found for LTX-2, LTX 2.3, LTX 2.5, Veo, Sora, Kling, Wan or Seedance.
- No benchmark covering LTX 2.3 or LTX 2.5 audio was found.

## 6. Korean-language speech: LTX native Korean quality and which TTS/VC tools handle Korean in these pipelines

### Takeaway
Evidence on LTX Korean speech is a single anonymous Korean community post (LTX 2.3, 2026-03-09) praising Korean naturalness and lip sync while rating Wan 2.6+ higher for Korean. No objective Korean evaluation exists for LTX, Seed-VC, RVC, OpenVoice or Chatterbox. Korean creators use the same ElevenLabs Voice Changer route as English Veo users; Korean TTS vendor comparisons are mostly self-published by vendors.

### Cited Findings
- **LTX 2.3 Korean [primary community post, 2026-03-09, DCInside AI창작 minor gallery]:** title "ltx 2.3는 한국어 존나 잘하긴함"; lip sync accurate and Korean speech very natural for a still, talking character; video still smears when motion increases; better than 2.0; author says "한국어는 wan2.6 이상" (Wan 2.6+ is better for Korean). No voice-consistency or VC workflow discussed; comments not loaded. — [DCInside post](https://gall.dcinside.com/mgallery/board/view/?id=aicreate&no=60993)
- Korean explainer on LTX 2.3 notes the model card concedes some audio-generation quality degradation, especially non-dialogue ambience/SFX (snippet). — [에브리데이 AI 사용법](https://ai.quantum-city.net/43)
- Korean Veo 3 tutorial: ElevenLabs voice cloning + voice changer keeps the mouth shapes and intonation of the Veo 3 clip while changing the voice (snippet, date not verified). — [YouTube](https://www.youtube.com/watch?v=mulcQdJC4Tw)
- ElevenLabs multilingual speech-to-speech model "supports 29 languages" (Korean not named on that page). — [seedance.tv blog, 2026-09-20](https://www.seedance.tv/blog/elevenlabs-voice-changer-video-tutorial)
- ElevenLabs publishes Korean-language guidance on Eleven v3 audio tags for character acting [primary]. — [ElevenLabs blog (ko)](https://elevenlabs.io/ko/blog/eleven-v3-character-direction)
- Typecast's own blog (vendor self-comparison) recommends Typecast for Korean content and emotion, claims 700+ voices with pitch/stress/rhythm control, and says ElevenLabs is often chosen for English; it also lists Typecast, ElevenLabs and Speechify for voice cloning (snippets). — [Typecast: best AI voice tools 2026](https://typecast.ai/kr/learn/best-ai-voice-tools-2026/), [Typecast: TTS pronunciation comparison 2026](https://typecast.ai/kr/learn/tts-natural-pronunciation-comparison-2026/)
- CLOVA Dubbing (Naver) offers 117 CLOVA voices on its free plan (snippet). — [dropshot blog](https://match.dropshot.io/blog/ai-더빙이-처음이라면-나에게-맞는-tts-사이트-4-8708)
- Seed-VC and X-VC evaluations cover English and Chinese only. — [arXiv 2411.09943](https://arxiv.org/html/2411.09943v1), [arXiv 2604.12456](https://arxiv.org/pdf/2604.12456)
- Kling 3.0 Omni guide shows Chinese and English dialogue examples and lists no supported languages; Korean not mentioned. — [Kling VIDEO 3.0 Omni guide](https://kling.ai/quickstart/klingai-video-3-omni-model-user-guide)
- LTX LipDub beta notes flag language as a constraint (languages unspecified). — [Instavar, 2026-05-22](https://instavar.com/research/ai-video/open-source-lip-sync-models)

### Inferences
- For a Korean LTX pipeline, the lower-risk route is Korean TTS with a pinned voice (ElevenLabs, Typecast or CLOVA) feeding LTX ia2v, because it avoids depending on LTX's native Korean prosody and on VC tools with no Korean evaluation. This is an inference from absent evidence, not a tested result.
- Speech-to-speech conversion keeps the source's pronunciation; any Korean mispronunciation in LTX audio survives VC, so VC is a timbre fix only.

### Gaps
- No objective Korean evaluation (WER, MOS, speaker similarity) of LTX-2/2.3/2.5 native speech.
- Whether Korean is among the 29 languages of ElevenLabs' multilingual speech-to-speech model was not verified in fetched pages this session.
- No Korean evaluation of RVC, Seed-VC, OpenVoice, Chatterbox VC, or of LatentSync/MuseTalk/InfiniteTalk lip-sync on Korean speech.
- Independent (non-vendor) Korean TTS comparisons including Supertone and ElevenLabs v3 were not found; Naver blog/cafe sources on LTX character voices were not found.
