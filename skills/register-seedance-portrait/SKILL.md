---
name: register-seedance-portrait
description: >
  Registers a character sheet portrait for Seedance and saves the asset ID. Use when the user asks to register a character, reuse a ModelArk asset ID, or says “시댄스 인물 등록” or “캐릭터 얼굴 자산 등록”. Stops after asset registration.
argument-hint: "[character identity path] [panel]"
allowed-tools: ["Read", "mcp__social-flow__modelark_portrait_register", "mcp__plugin_social-flow_social-flow__modelark_portrait_register"]
---

# Register a Seedance portrait

1. Read the shared character's identity.md and panels.json. Use the face panel unless the user selected another image. Use the existing type in the sheet. For a new original fictional character use AIGC. For a real person use LivenessFace with that person's verified group ID. If the provenance is unclear, ask which applies.
2. Call modelark_portrait_register with identityPath and panel. At first use, send e.g. `{"identityPath":"/story/assets/characters/iris/identity.md","panel":"face","groupType":"AIGC"}` for a virtual character. For a real person send `groupType:"LivenessFace"` and `verifiedGroupId` from that person’s completed verification. The tool uploads the selected file to the project's ModelArk library, waits for review and writes the account-scoped receipt into identity.md. The first use needs BytePlus management credentials and virtual uploads need Advanced Creation Rights (Entry supports 50 assets). Console enterprise verification and the owner's agreement may be required.
3. On an error, read `structuredContent.code`, `nextAction` and the provider request ID. For `modelark_asset_entitlement_required`, point the user to the console to check enterprise eligibility and enable free Entry. For `modelark_asset_access_denied`, check the IAM policy and project. After registration, plan the shot with the active asset. If an existing approved plan stopped during revalidation, resume it only when the approved asset and sheet digest still match.
4. Report the ID and status. A pending receipt can be polled by calling the same tool again. A rejected asset, missing entitlement or incomplete verification stops the workflow before a video is submitted. For video production, generate-cut-videos uses the sheet image in its original reference slot and the selected voice sample in its audio slot.

The public catalog contains BytePlus presets. Registering an original photoreal fictional character uploads it to the account's private library and requires enterprise eligibility and Advanced Creation Rights. On a personal account, explain which part of the request is still possible. For a voice-only 2.5 or Flash shot, reuse the character's selected WAV directly. To use a different face, let the owner choose a preset or a qualifying same-account original. Replacing the face changes the character.

[BytePlus virtual portrait library](https://docs.byteplus.com/en/docs/modelark/private-virtual-avatar-library-guide-preview) · [Verified real-person library](https://docs.byteplus.com/en/docs/modelark/guide-preview) · [Presets and eligible originals](https://ai.byteplus.com/ark/region%3Aap-southeast-1/docs/seedance-portrait-asset-guide)
