---
name: upscale-video
description: >
  Upscales an existing clip 2x with the LTX pixel-upscaler-x2 IC-LoRA and checks the result against the source.
  Use when the user asks to upscale, sharpen or raise the resolution of a generated clip,
  including "이 컷 업스케일해줘", "해상도 올려줘", "2배로 키워줘" or "upscale shot 7".
  Opt-in only: the final canvas scale stays the default for 720p and smaller sources.
argument-hint: "<clip path or episode + shot id>"
allowed-tools: ["Read", "Bash", "mcp__social-flow__astra_video_upscale", "mcp__plugin_social-flow_social-flow__astra_video_upscale", "mcp__social-flow__astra_ic_lora", "mcp__plugin_social-flow_social-flow__astra_ic_lora", "mcp__social-flow__astra_video_capabilities", "mcp__plugin_social-flow_social-flow__astra_video_capabilities", "mcp__social-flow__storyboard_read", "mcp__plugin_social-flow_social-flow__storyboard_read", "mcp__social-flow__production_workflow", "mcp__plugin_social-flow_social-flow__production_workflow", "mcp__social-flow__host_review", "mcp__plugin_social-flow_social-flow__host_review"]
---

# Upscale Video

An LTX upscale renders the clip again at twice the size. It is not a scaler: the scene and
camera hold, but faces, mouths and small props can change. Run it only when the user asks,
never as a pass over every cut. A 720p or smaller clip normally goes to the final 1080 canvas
as is (CLAUDE.md 2026-09-12); this skill does not change that default.

## Routes (2026-10-30)

| Route | State | Use |
|---|---|---|
| `astra_video_upscale` (self-hosted `ASTRA_VIDEO`, IC-LoRA `pixel-upscaler-x2`) | Live, measured | The default. No per-call bill; one render at a time (54 s for 25 frames at 640x384, 92 s for 121 frames at 1024x1792). |
| `astra_ic_lora` with `adapter:"pixel-upscaler-x2"` | Live | Only when you need a field the wrapper hides, such as a conditioning mask. Then request exactly twice the source size and a matching 8k+1 `numFrames` yourself. |
| GenAI gateway (`ASTRA_GENAI_API_KEY`) | No upscale endpoint | MSR has a 2x stage of its own. Its `skip_stage_2` half-size preview (genai-gateway PR #43) is not on any deployed gateway yet, and older gateways reject the field with 400, so `astra_genai_msr` does not send it. |
| Local LTX Desktop recipe through the Mac gateway | Not available | Desktop 1.3.1 lists the `upscale` LoRA but its queue accepts only the recipes in `IC_LORA_RECIPES` (`backend/services/features/ic_lora_recipes.py` in the app). `refine-details` is the upscale recipe there and is not installed. Recheck both before proposing this route. |

## Steps

1. **Find the clip and its plan.** For an episode cut, read the shot with `storyboard_read` and
   take the actual clip path from the production record. Keep the source; the tool never
   overwrites it.
2. **Check that it fits.** The source sides must be multiples of 32, and twice the size must stay
   within 1,867,776 pixels: 512x896 → 1024x1792 and 896x512 → 1792x1024 fit; 720x1280 does not.
   When it does not fit, tell the user and leave the clip to the canvas scale. Do not shrink a
   larger clip just to feed the upscaler.
3. **Write the prompt from the shot.** Describe the subject, action, setting and light the clip
   already shows, in English. A one-word `upscale` prompt invented text and shapes in testing.
4. **Run `astra_video_upscale`** with `sourceVideoPath` and `prompt`, plus `seed` when the user
   wants to repeat a take. The tool sends the clip's own frame rate and the largest 8k+1 frame
   count (it reports dropped trailing frames) and copies the source soundtrack back unchanged.
5. **Inspect against the source** at the same frames (start, middle, end) and in playback, using
   [host evaluation](../_shared/host-review.md) when the user wants a recorded review. Look for:
   - face and age shift, hair and costume detail;
   - mouth shapes against the soundtrack on spoken lines — the picture is re-rendered but the
     audio is the original, so lip sync can break;
   - prop colour and material (testing turned a silver hairpin jade blue);
   - new text, logos or shapes that were not in the source.
   Report what changed. A completed job is not a passing review; the result stays `not_reviewed`.
6. **Swap it into an episode only when the user accepts it.** Record the source clip path and
   hash, the tool, prompt, seed and job id beside it; `review-cut-videos` checks it again only
   when the user asks for a video review.

A rejected result is reported with the reason. Do not loop new seeds without the user asking.
