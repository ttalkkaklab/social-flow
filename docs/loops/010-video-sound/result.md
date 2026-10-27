# Model-aware sound implementation

Local installation: 0.115.4-sound.1, registered for Codex and Claude on this Mac.
The isolated development label prevents another workspace's cache deployment from
replacing this tested build. The repository and MCP base version remain 0.115.4.
Current running clients were not restarted; start a new plugin session to load it.

Policy: native effects for capable Veo/Omni/Seedance and ordinary LTX generation
when retaining model audio; post effects for externally composed dialogue and LTX
A2V by default. Explicit A2V input effects must already exist in the supplied audio.
Audio references do not imply source-track preservation. Old silent model modes
and authored audio-off flags remain authoritative.

Implementation includes request-schema validation, board backups, source audio
extraction as one soundtrack, observed post-cue timing, duplication prevention,
finite silent-source gain and soundtrack-to-speech state restoration. Assembly
still requires usable assets; it never certifies an unheard sound as convincing.

Evidence in this directory:
- install-iteration4.json: backed-up update of source build and two plugin caches.
- final-hashes.json and final-registration.json: matching implementation files and active registration.
- final-matrix.json: 13 fresh installed adapter-routing cases.
- final-handoff.json: five real installed keyframe preparation cases.
- final-smoke.json, final-post.json, final-silent-post.json: complete FFmpeg output tests.
- final-speech-regression.json: fresh installed MCP speech compatibility.
- verify-1.md through verify-3.md: retained failed reviews and fix directives.

New paid provider renders and perceptual listening were not performed. Existing
telephone source media was preserved. Synthetic fixtures establish signal presence,
placement and preservation; perceptual review remains not_reviewed.

Final independent score: 98/100, P0=0, P1=0 (verify-4.md).
Review trajectory: 81 → 88 → 87 → 98; each failed review was retained and fixed.
Full objective gate: npm run check exit 0, 2218 tests / 196 suites pass.
Skill-lint: 16 rules across 21 skills pass. git diff --check passes.
A concurrent workspace changed the shared Claude marketplace entry during the
loop; final-marketplace.json records its backed-up correction. Both current
marketplace registrations and installed-plugin paths point to the isolated build.
