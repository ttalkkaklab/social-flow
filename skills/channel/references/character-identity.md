# Character identity contract (schemaVersion 1)

## Contents

- [Prepare the shared sheet before episode authoring](#prepare-the-shared-sheet-before-episode-authoring)
- [Author and validate](#author-and-validate)
- [Generate and use](#generate-and-use)
- [Update without losing identity](#update-without-losing-identity)


**Automatic execution:** [Automation guidance](../../_shared/automation-guidance.md) supersedes creative quality gates, repeated approvals and review-score requirements here. Keep the concrete guidance and truthful review state. Enforce only actual runtime dependencies and the scope of external-action authorization.


Use this contract for new characters and requested character updates. `identity.md`
is the character source of truth; `profile.md` remains the channel source. Never
silently populate an existing character with the example's biography or voice.

## Prepare the shared sheet before episode authoring

Before candidate stories or scene images, inspect `assets/characters/` and read the
selected identities. Create missing identity drafts using the worked example's
structure, preserving unknown fields as pending. Export the shared sheets with
`review-library.js` immediately, even when images or voice samples are missing.
`assets/characters/<id>/index.html` is generated from the bundled review template;
never hand-author a substitute HTML page or use the episode cast section as the sheet.
If an unowned HTML page conflicts, preserve it in a sibling backup before explicitly
migrating it. Do not overwrite another active session's artifacts.

Then compile the selected identities into the episode cast. New identities use
`identity.md` as the single source; `cast.json` locates it rather than creating a
parallel `identity.json`. Resolve only missing facts needed by the next operation.
A draft sheet with pending fields or media is valid planning progress. A template
match is not a complete character, and media generation still needs authorization.

## Author and validate

Use [character-identity-example.md](character-identity-example.md) as a complete
worked example, not default values. Keep one `# Name` heading and one fenced JSON
block with `character` and `tts`. The field catalog and validator are
`../../_shared/character-identity.js`. All catalog fields must be present.

Each field is `{ "status": "confirmed", "value": ... }`, or
`{ "status": "pending", "value": null, "reason": "what is unresolved" }`.
Optional fields can use `not_applicable` with null and a meaningful reason.
Pending is an honest draft, never generation-ready. Do not invent measurements to
clear validation. Height uses cm, weight uses kg; stylized subjects may leave weight
not_applicable. Relative scale specifies what counts toward height (ears, hair, tail).
Traits pair a tendency with observable behavior. Dialogue examples demonstrate the
register and vocabulary; acting describes emotional reactions and movement.
Relationships name the other character's id, address and attitude. No relationships
is not_applicable, not a fake cast member. Record fixed landmarks with anatomical
left/right when asymmetric. Review examples and numeric/visual consistency manually:
a schema check cannot prove anatomy, personality, acting or voice quality.

Run from the installed plugin:

```bash
node "$CLAUDE_PLUGIN_ROOT/skills/channel/references/character-sheet.js" \
  "data/<channel>/assets/characters/<id>/identity.md" > /tmp/character-handoff.json
node "$CLAUDE_PLUGIN_ROOT/skills/channel/references/review-library.js" "data/<channel>"
node "$CLAUDE_PLUGIN_ROOT/skills/channel/references/review-library.js" "data/<channel>" --check
```

`character-sheet.js` is read-only and fails on incomplete identity or voice. It
compiles the identity to `character`, `tts`, four `direction` strings, and a source
SHA-256. Legacy sheets still render their original text, but must be explicitly
migrated before a new review pass. Preserve all existing prose and media on migration.
Resolve unknowns with the user, or retain pending; never retrofit a fabricated review.

## Generate and use

1. Author the identity before images. Use `direction.image` for the appearance prompt
   plus the specific panel framing. Create separate front full-body, back full-body,
   and face close-up images following [character-panels.md](character-panels.md). The front includes the head and a neutral face; the back
   faces away. Never erase a face from the front body. Match proportions, clothing,
   colors and landmarks across all panels. Keep expressions/poses as optional extras.
2. Use the host image tool where available. Generate the first panel, inspect it, then
   use it as the reference for subsequent views. Keep each panel in a separate file;
   do not feed a multi-view composite to an image/video generator.
3. Before confirming a new character voice, generate **three distinct voice candidates**
   matched to the identity. Use the selected engine/model and the same natural Korean
   sample from `speech.examples`. Present real audio with playback and wait for the
   user's explicit candidate selection. Only then persist that candidate's `tts` and
   reference audio in the identity/sheet. A pending draft must not claim a confirmed voice.
   Follow [acting prompts and auditions](../../produce/references/acting-prompts.md).
   `direction.voice` guides performance; per-line `acting` does not replace voice identity.
   Use the audition tool's read-only `plan` to extract acoustic targets and compare
   real voice-library metadata first. An optional `voiceProfile` beside `character`
   and `tts` stores explicit vocalGender, perceivedAge and a compact baselineDirection.
   Unknown voice traits stay unknown; do not infer them from names or appearance.
   Gemini audition candidates carry the derived stable `tts.voiceDirection` into
   production after selection. Keep personality as casting/review context and scene
   emotion as per-line acting; never feed the full biography to a speech model.
4. New storyboards set `SB_DOC.characterSchemaVersion = 1`. Copy each compiler result
   into `SB_DOC.characters` (add shared panel paths separately, never scene images). `direction.image` feeds still
   prompts; `direction.video` feeds motion/acting prompts; `direction.dialogue` guides
   script writing; `direction.voice` guides supported speech controls. Both board and
   assembly checks reject altered identity with stale direction. Recompile from the
   current local identity before production and compare `identitySha256`; a mismatch
   requires updating the handoff and affected assets, not just editing the hash.
5. Scene emotions, poses and temporary outfits belong to scene state, not baseline
   identity. An allowed variant needs its own references before use. Neither a scene
   state nor a prompt may contradict invariants.

## Update without losing identity

Read the current source first. Change only requested fields, increment `character.version`,
and preserve every other field and the pinned TTS. If an update conflicts with an
invariant, update the affected invariant explicitly as part of the same approved change.
Do not leave contradictory instructions. Show before/after values.

Recompile, regenerate affected panels/voice samples, and export both indexes and the
sheet. Appearance changes require checking all three panels; speech/TTS changes require
a new sample. Keep previous inputs and reviews in a sibling evidence folder. Existing
hash-bound reviews become stale on any identity/media change; never carry their score
forward. Obtain a fresh independent review on the actual revised files before recording
new hashes. Test create and update paths as well as rejected incomplete updates.
