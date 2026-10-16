---
name: edit-speech
description: >
  Revises existing shot dialogue and rebuilds only affected speech and media.
  Use when the user asks to change a character's line, pronunciation, delivery or voice,
  including "7번 샷 민재 대사 수정", "이 목소리 바꿔", or "fix this line".
  Finds stable shot and line ids, preserves other characters and reports affected outputs.
  Storyboard plans a new episode; produce builds it; this skill repairs an existing one.
argument-hint: "<channel> <episode> <shot, character or quoted line> <change>"
allowed-tools: ["mcp__social-flow__speech_manage", "mcp__social-flow__tts_review_acting", "mcp__social-flow__storyboard_read", "mcp__social-flow__storyboard_check", "mcp__social-flow__tts_generate", "mcp__social-flow__tts_gemini_38", "mcp__social-flow__tts_elevenlabs_generate", "mcp__social-flow__astra_audio2video", "mcp__social-flow__seedance_reference", "mcp__social-flow__veo_reference"]
---
**Automatic execution policy:** Read [automation guidance](../_shared/automation-guidance.md) first. Creative rules and review findings guide improvements; scores, review/hash/freeze records, CTA choices and intermediate approval steps do not block authorized work. Preserve actual external-action authorization and stop at the artifact the user requested. This policy supersedes older quality-gate wording below.

# Revise shot speech

For model routing, follow [model settings](../_shared/model-settings.md). Corrections
reuse the episode's snapshot, explicit overrides and pinned speaker voice; a newer
directory default does not change an existing take's model. Change it only when
the user requests that change. Never silently fall back to another speech engine.

Use `speech_manage action:list` on the existing board. Filter by shotId, speaker id/name,
or quoted text. Shot numbers are display positions; stable shotId and lineId are the edit
addresses. If a request matches several lines, report the candidates and clarify only the
ambiguous target. Never replace every occurrence of a name or phrase across the episode.

For an older board, read its existing SB_DOC character voices and narrator from the board
or review HTML. Put that metadata in scenes.js and run `prepare` with the returned revision.
Preparation assigns ids and makes the existing narrator fallback explicit; it does not invent
new character dialogue or voices. Do not silently turn a user's dialogue into narration.

1. Use `update` with the exact lineId, expectedRevision and requested patch. Keep tts (spoken
   spelling) and sub (display spelling) in agreement. A delivery-only change does not authorize
   changing the character's identity voice. Use speaker ids, not display names, in writes.
2. Inspect `invalidated`. Old files remain available and source backups are in
   `.work/speech-history/`. Never overwrite an old take. A voice configuration change affects
   every line spoken by that character; list those lines and regenerate them as a set only
   when the user asked for that voice change.
3. Call `speech_manage action:plan_audio` for the affected line. Generate a new take
   with its returned generator and provider-ready generation arguments, preserving
   the character’s pinned settings. Attach with clean `generation.text` from
   `expectedText` and the actual tagged request in `generation.voiceSettings`.
   Do not call automatic listening, dictation, scoring or approval tools. Record the generator,
   actual voice settings, text and speed in the generation receipt. Use `attach_audio` to bind
   the file to its line revision, passing the actual generation arguments and text. Generated speech stays `not_reviewed`; that is usable output.
4. For video work read the [speech production contract](../produce/references/shot-speech.md).
   `plan_video` takes the selected adapter's documented capabilities, not a hardcoded model.
   On-screen dialogue requires audio-conditioned animation or an explicit post lip-sync
   adapter. Never silently substitute closed-mouth action. Off-screen speech and narration
   can be mixed over existing action footage. Preserve the selected model and budget; a
   change request does not authorize unrelated generations or publishing.
5. Bind the new clip with `attach_video`, current revision, selected capabilities and videoPath;
   this records the source audio hashes and clears stale status. If delivery already exists, rebuild the affected clip, audio timing, subtitles and final
   edit using produce's existing commands. Preserve unaffected takes and report their hashes.
   Do not label a script-only patch as a regenerated video. Return the changed shot/line,
   speaker, text, new files and any media still needing regeneration. No listening approval.

Generation receipts keep actual API arguments in voiceSettings. For Gemini,
which have no language argument, put the declared text language in generation.language
(e.g. ko). This is metadata, not an API parameter. Both attachment and assembly use the
same voice/language normalization rules.

Per-line `acting: {direction?: string, tags?: string[]}` is separate from the pinned
identity voice and from visible/off-screen `delivery`. Use `speech_manage` to update
acting, invalidate affected speech, and preserve unchanged takes. Follow
[acting prompts](../produce/references/acting-prompts.md).
ElevenLabs permits `eleven_v4` only; Gemini remains supported. Local TTS is removed.
An explicitly requested review/improvement loop is permitted within its scope;
normal production continues without scoring or listening approval.
