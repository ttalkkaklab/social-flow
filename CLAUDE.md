# social-flow — Project instructions

Channel-based short-form/long-form content pipeline Claude Code plugin.

## Contribution language (user directive, 2026-11-22)

Use English for repository contributions and GitHub communication, including
documentation, code comments, commit messages, issue and discussion posts, pull
request titles and descriptions, reviews, and replies. Follow
[the contributor style guide](CONTRIBUTING.md#style) for language-specific materials.
Use the user's language in direct conversations with them.

## Character live start (owner directive, 2026-11-22)

Before broadcasting, ask whether to start when the spoken opening, first topic segment, two spoken welcomes and ten moving standby clips are ready, show a local preview first,
or cancel. Honor the answer for that session. Use a calm fixed shot. Send the host portrait, selected voice sample and exact dialogue
to GenAI image-to-video with MSR conditioning. Play the generated voice and picture together at 720×1280. Do not offer an upscale, a dance
loop or a separate mouth composite. A user who asks for the watch link while generation is running
gets the reserved unlisted room and its actual status. Generate 3–5 second listening clips for the broadcast concept on the production GPU. Anchor both ends to the same shot. Shuffle the standby pool and avoid a repeat across shuffles. Interrupt standby on the first frame with ready speech. Play an on-air utterance through its last sample. Generate the next segment during playout from the current line, recent answers and real chat. Use the reserved topic in the opening and invite viewers to comment. While the room is live, rotate welcomes suitable for everyone and self-contained host lines while new videos render. Give ready viewer answers the next sentence boundary. Limit concurrent video requests with `maxConcurrentVideos` (default 3), prioritize viewer jobs and drop stale host results when the conversation changes. Replace held standby shots before ingest. See [Character LIVE](skills/live-character/SKILL.md).

## Local GenAI routing (owner directive, 2026-11-07)

2026-11-24: the GenAI gateway no longer binds MLX servers (`mlx-serve`,
`mlx-audio`). A local gateway on that version cannot serve `qwen-image-fast` or
the MLX `voxcpm2` binding described below. MLX images go through the direct
`mlx` lane (`mlx_image_generate` / `mlx_image_edit`); `voxcpm2` speech is served
by the production gateway, whose voices must be registered there first.

`/Volumes/data/story/insight` uses local GenAI (`http://127.0.0.1:18081`) for
`astra-genai-native` / `qwen-image-fast`, implemented by MLX Serve's
`qwen-image-2.1-turbo`. Before generation, confirm the MCP process receives
`ASTRA_GENAI_IMAGE_URL` and `ASTRA_GENAI_IMAGE_API_KEY`, and inspect
`astra_genai_catalog kind:image`. Shell variables alone do not verify a running
MCP connection. Speech has separate `ASTRA_GENAI_SPEECH_*` variables; preserve
the remote video route. Do not print or save credential values.
Codex's STDIO server also needs the six GenAI variable names in
`mcp_servers.social-flow.env_vars` (base, image and speech URL/key pairs).
Forward names without writing their values; verify a fresh connection with that
whitelist. A running server keeps its original environment until it reconnects.

An unexpected remote `baseUrl`, empty catalog or `Model capability is disabled`
requires checking the last successful receipt and restoring the local connection
before suggesting a model change. Inspect uncertain calls before retrying. When
needed, invoke this plugin's own MCP server with the correct inherited environment;
do not bypass its tools, reservations or receipts. Confirm recovery with a requested
image and its local receipt. See AGENTS.md's local GenAI connection directive.

## Researched story material and tension (user directive, 2026-11-14)

Before recommending a new story-led synopsis, read the existing real-event collection and
supplement missing decisions, consequences and counterexamples. Explicit research requests
include actual searches and opened sources; fiction is not an excuse to skip that request.
Follow `skills/storyboard/references/story-material-research.md`. Distinguish documented
events, disputed accounts and invented adaptation; search counts do not certify sufficiency.
Verify credentials in the MCP process, not only the shell. For Codex STDIO forward the name
`SERPAPI_API_KEY` in the relevant `mcp_servers.social-flow.env_vars` and test a fresh connection.

Carry costly choices, motivated secrets, competing claims and changing alliances from the
synopsis into acted scenes and visible storyboard evidence. Use `story-interest.md` as
guidance, without new score gates or compulsory twists. Synopsis-only requests stop at prose;
they do not create episode assets. Existing cast, calendar, narrator and ending rules hold.

## Synopsis reality check (user directive, 2026-11-22)

After writing or revising a synopsis, always run the
[synopsis reality check](skills/storyboard/references/synopsis-reality-check.md) before
delivery or scene development, including synopsis-only and unattended work. Verify the
facts and practical conditions the plot depends on for its place and period. Check invented
mechanisms against the established world. Apply corrections to the synopsis itself and
record the evidence and any remaining uncertainty. If a central event still depends on an
unverified assumption, keep the synopsis provisional and pause its downstream production.

## Story language (user directive, 2026-11-18)

Nothing said which language a story is written in, and every default and example was Korean.
The story language of a new episode is the one the user names for it, else the saved
`languages.speech`, else the language the channel already works in (its profile, cast voices
and earlier episodes), else the language of the request; nobody is asked. The first `story_sequence` takes it as `language`
and the board keeps it as `STORY.language` (a new episode board without the argument takes
the saved `speech`; a board that has one, or has shots, keeps its language and a different
value warns). Synopsis,
scenario, story text, summaries and lines use it, each character's `tts.language` is its
primary subtag, and prompts stay English. Untimed lines are timed in English, Chinese,
Japanese, Spanish, French, German, Vietnamese and Korean; only the Korean rate is measured,
so the others report `speechRate:"uncalibrated"` and run slow. These report; none refuses.
The review page's own menus are English and Korean. See
`skills/storyboard/references/review-localization.md`.

## Episode anticipation (user directive, 2026-11-16)

Every new or substantially revised synopsis and storyboard gets an authoring pass for
what makes the viewer want the next development. Apply
`skills/storyboard/references/episode-anticipation.md`: establish a specific promise,
change the viewer's expectation through consequential clues or attempts, pay the promise
inside the episode and show the recipient's response or changed behavior. A known outcome
can still hold a question about how it happens or what it costs. Quiet and factual work
uses discovery, application or consequence without invented conflict or withheld essentials.
Carry this progression from synopsis prose into acted scenes and shot evidence; metadata
and repeated hesitation do not count. This is the default writing process, not an automatic
review, score threshold, schema requirement or media approval. Standalone stories close
their central question; only explicit serials carry a question into another episode.

## Hook and rewind (user directive, 2026-11-17)

Support a channel's chosen series format of a provocative opening, immediate recipient
reaction, brief rewind with clear time orientation, enacted relationship context and one
catch-up into the continuing story. Follow `episode-anticipation.md` in the storyboard
references. Show why the event is surprising rather than merely calling a character strict.
The opening incident may precede its causes without revealing a held motive or confession.
Honor an explicitly requested time label as a scoped text exception; it does not authorize
dialogue subtitles. This is writing guidance, not an automatic score or generation gate.

## Promise and proof (user directive, 2026-11-18)

Episode anticipation was written for acted stories; an episode that makes a claim (explainer,
tutorial, review, advertisement) had one sentence. Such an episode promises one result in the
viewer's words, says it aloud in the opening because nothing is drawn over video, and pays
with proof the viewer can check on screen: what went in is visible in what came out, in a
picture only this subject could give, held long enough to read. A spoken claim with neither
a picture nor a source comes out, unsourced numbers and absolutes included. The middle moves
from whether it works to its limit or cost, and the ending shows someone using the result;
an ask stays optional and names one action and the place the thing really is. Follow the
claim-led section of `episode-anticipation.md`. `sequence.question`/`payoff` hold the
viewer's doubt and the proof scene. Once the shots before it have lengths, every board write
prints when the first spoken line starts, and for a natively voiced line the silence its
shot's stored length holds. This reports and never refuses. It is writing guidance, not a score, a problem-beat requirement or a deadline for
the proof: on the one channel studied the earliest proof had the fewest views. Evidence and
its limits: [promise and proof study](https://github.com/ttalkkaklab/social-flow/blob/1eabc4fb598b99135fe39a1a2be1f7dbe07fd5a9/docs/research/2026-11-18-promise-and-proof/README.md).

## Opening by format and platform (user directive, 2026-11-18)

Every new or substantially revised synopsis and storyboard plans its opening for the board's
format and the enabled SNS platforms, and the author chooses the best practice without asking.
Short-form posts one opening to every platform, built for the earliest published window (the
Reels skip rate, 3 s): the first frame shows the subject already changed or mid-action, a
spoken promise, when a line carries it, starts at once (inside the first second is the research's
inference; 3 s is the measured window) and is complete by about 3 s, and the line names
what the frame shows, since nothing is drawn over video. Per-platform first cuts are not made;
platforms differ in title, caption and cover, which carry the same promise. Long-form decides
the title and thumbnail first; the first 7 s confirm them and the next 20 s open a bigger
question (YouTube's Intro reads who is still watching at 30 s). The synopsis gives the opening
its own paragraph, `story_sequence` records it as `STORY.opening`, and every story-first board
write prints a reading of it against the format and platforms. Follow `skills/storyboard/references/opening-by-format.md`.
Evidence and its limits: [opening hooks study](https://github.com/ttalkkaklab/social-flow/tree/1eabc4fb598b99135fe39a1a2be1f7dbe07fd5a9/docs/research/2026-11-18-opening-hooks).

## Primary hook and three-second opening review (user directive, 2026-11-25)

Each new or substantially rewritten synopsis candidate and board carries one
[primary hook type](skills/storyboard/references/opening-hook-types.json). Carry the selected
scenario's ID into the board. A direct board chooses its type on the first sequence.
After authoring each synopsis and again after completing the text storyboard, give the
audience's first three seconds to three independent host readers. Revise an above-ceiling
opening, with at most five revision rounds shared by both stages and all candidates.
Report the best valid version, its evidence and unresolved findings when the allowance
runs out. Follow the [opening review](skills/storyboard/references/opening-review.md)
for scoring, recovery and synopsis-only handoff.

## Dramatic pressure and payoff (user directive, 2026-11-20)

For a new or substantially revised story-led synopsis or board, use
[story-intensity](skills/story-intensity/SKILL.md) and
[story-catharsis](skills/story-catharsis/SKILL.md) during authoring. Choose pressure tied to
a concrete choice and use a payoff that answers the frustration the story actually raises.
Apply the devices in the synopsis and in observable setup, choices and outcomes in scenes
and shots. Respect the requested tone, established canon and factual evidence. Claim-led
and quiet work can use the uncertainty, proof or discovery already present. This pass uses
the existing story fields and does not add a write gate. Research:
[pressure cases](https://github.com/ttalkkaklab/social-flow/blob/1eabc4fb598b99135fe39a1a2be1f7dbe07fd5a9/docs/research/2026-11-20-story-intensity/README.md) and
[payoff cases](https://github.com/ttalkkaklab/social-flow/blob/1eabc4fb598b99135fe39a1a2be1f7dbe07fd5a9/docs/research/2026-11-20-story-catharsis/README.md).

## Clichés as story material (user directive, 2026-11-18)

Drama, comedy and romance episodes use researched clichés by default; every other type gets a
recommendation, and a cliché enters the story only when the user picks it. Romance has no video
type, so the saved type decides: `drama` and `comedy` apply, a `custom` type applies when its
detail names a drama, romance or comedy and no documentary, and a saved `production.clicheUse`
(`on` | `off`) overrides both. The author never reads the catalogue whole:
`skills/storyboard/references/cliches.js pick --need …` returns a few candidates for what the
story is missing (a reason to meet, an obstacle, a reveal). Character types are chosen at
casting, devices at the synopsis, staged moments, places and line patterns with the scenes. The
pick is moved half a step (who does it, what it costs, when, who knows) or played as it is.
`story_cliche` records each use, each recommendation (`offered`) or `none` with its reason in
`window.CLICHES`. A new episode board on an applying type reads undecided at every board write
until a decision is recorded, and the review page shows the record above the shots and on each scene.
Entries the research found criticised (contact without consent staged as romance, graphic
violence) are left out of candidates and warned about when recorded; a quoted line gives its
pattern, not its words; production-practice entries are never candidates; a repeat across the
channel's episodes is reported. Each of these reports. A call is refused only for input the
tool cannot use and for a cliché applied on a recommending type without `basis:"user"`
(`cliche_user_choice`), which the session never passes for a choice the user did not make.
`story_cliche` is the record's only writer: `storyboard_apply` leaves the record alone
(`cliche_record`) and keeps `PRODUCTION.clicheUse` as the episode snapshot gave it
(`cliche_choice_kept`). A type change for one episode, which the user may ask for, changes the
mode and is reported (`cliche_mode_changed`). A use a hand edit put in the story without the
user's pick is reported as `cliche_unpicked`.
This is writing guidance, not a score, a quota or an approval pause, and a cliché's name never
answers `necessity`. Follow `skills/storyboard/references/cliche-use.md`. Evidence and its
limits: [K-drama cliché survey](https://github.com/ttalkkaklab/social-flow/tree/1eabc4fb598b99135fe39a1a2be1f7dbe07fd5a9/docs/research/2026-11-18-kdrama-cliches).

## Scene sound and audience effects (user directive, 2026-11-21)

Use the video model’s soundtrack for sounds made in the scene, including room
tone and actions such as steps or water hitting a surface. Describe the source
and timing in the video sound direction. If that render mode cannot make the
sound, leave the effect out of post. Preserve the selected speech and music lanes.
Generate and mix separate effects only for a planned audience cue
(`sound.effects[].audience`), such as a restrained surprise hit or a tension rise.
The builder skips untagged scene effects and uses only the music-off flags from
legacy `sfx.tsv`. See [Model-aware effects](skills/produce/references/video-sound.md).

## TikTok private upload and cover (user directive, 2026-11-18)

Every new TikTok publication starts private (Only you / SELF_ONLY). Edit and save
its cover in ego lite while private, reopen it to inspect the saved image and
profile crop, then switch that same post to Everyone and verify the public cover.
A successful upload is not public completion. If cover editing or verification is
blocked, keep the post private and report the blocker; never publish first, remove
truthful disclosures, or re-upload to work around it. Reuse the episode's existing
publishing authorization. Follow `skills/publish/references/tiktok-private-cover.md`.
This is the publishing workflow, not a new backend quality gate.

## Owner decisions (2026-10-18)


- Precedence: the later-dated directive wins, and a superseded sentence is deleted in place, not kept under a banner.
- Delivered video is subtitle-free, including speech (2026-10-17): no subtitle, caption, label or mark of any kind over a moving picture; a separate SRT only when the user asks.
- Korean style S1 findings (`check-style.py`) are suggestions, never execution gates.
- The Threads server gate is removed: the draft/body-hash binding stays, reviews are hash-bound evidence, and no score, P0 label or gate file blocks a post.
- Previz is optional; no checker refuses a generated cut without one.
- The production ratio is a planning target and cost ceiling: the band's upper bound and the budget are enforced, the lower bound is not.
- Every YouTube upload starts `private`; `youtube_update` flips it to public, and growth loops run the same sequence under the approved plan.
- Channel assets (logos, intros, growth images) follow `.social-flow/models.json` like episodes; initial image setup recommends ASTRA GenAI; video setup recommends a supported host tool.
- `treatment:"footage"` is a retired route and a hard execution error.
- An unattended run without complete settings reports `project_setup_required` and defers authoring.
- Initial style, ratio and format are asked once at project setup, then reused.
- The static-ground limit is guidance.

## Production order (owner directive, 2026-10-19; checks removed 2026-10-31; cast gate 2026-11-01)

Project setup must be ready before any episode authoring. Then characters (text + images),
the story and its shots, props (text + images), backgrounds (text + images), the shots'
images, and finally video, in that order. Explicit text-only requests stop at text, but the
episode cast comes first even then: `story_sequence` refuses to start a board inside an episode,
and `story_scene`/`story_shot` refuse to continue a story-first one, until `storyboard/cast.json` names its characters, each with `assets/characters/<id>/identity.md`
and, unless the entry is `voiceOnly` (a narrator who is never seen), its face, front and back
sheet panels (`cast_required`, `cast_source_missing`, `character_panel_missing`). Other missing
images are reported, and missing panels are made with `character_panel` under spending
authorization, never skipped or generated without it. Present the scenario before detailed text authoring; presentation does not
add an approval pause. Use the bundled storyboard HTML. Delegated authors use the same
order and deliverables. See `skills/_shared/production-workflow.md`.

## Checks removed for speed (user directive, 2026-10-31)

The story tools enforce story order, cast readiness and the primary hook contract.
`production_workflow` is an optional progress record:
stages complete in any order and no other tool reads it. Image and video plans, storyboard
writes, Blender renders and assembly no longer wait for workflow stages, independent
reviews, Blender compositions or reviewed media. `storyboard_apply` protects board
readability, story order and the primary hook. `storyboard_check` runs editorial checks on request.
review-context, review-camera, compose-blender, review-cut-images and review-cut-videos run
only when the user asks. Spending limits, generation authorization, adapter input validation,
`video_prompt_language`, `msr_character_limit` and the voice-lane rules stay. Existing
episodes are regenerated in the new order rather than migrated.

## Guided automation (owner directive, 2026-10-16)

CTA checks are removed. Creative structure, writing style,
camera direction, review scores, frozen stamps and subjective quality belong primarily
in skills as guidance, not automatic execution gates. Continue authorized work with honest findings and
`not_reviewed` or stale evidence instead of manufacturing a passing review. A user
who explicitly requests a quality-improvement loop still gets that loop; its score
does not become a prerequisite for unrelated tool execution.

Keep the minimum contracts required to execute: readable inputs, stable references,
supported adapter payloads, usable media, finite timing, concurrency and actual
spending limits. Existing authorization persists. Quality warnings do not require a
new approval: video and visual-plan findings at assembly (2026-09-14) are shown with
the output and kept in the build record, and authorized assembly proceeds without
fabricated PASS reviews or a second question. This
does not expand the requested artifact into paid generation, external uploads or
publishing that the user has not authorized. Prefer the skill's practical guidance
over mandatory metadata and arbitrary checker thresholds.
[README.md](README.md) is the source of truth for structure, skills, and the MCP tool list.

## Speech production (user directive, 2026-10-16)

Generate speech without automatic listening/scoring/STT or human approval gates. Record
`not_reviewed`, never a fabricated pass. Keep file, speaker, voice settings and timing
provenance so the user can request targeted corrections later through `edit-speech` and
`speech_manage`. This supersedes previous speech-quality and final-listening gates, including
voice-lock ASR. Follow `skills/produce/references/shot-speech.md`. Narrator and character
lines use explicit speakers; video models are replaceable adapters with declared capabilities.

## Shot expressions (user directive, 2026-11-16)

Characters smiled through scenes of alarm: the shot story names an action, the face panels and
sheets carried smiles, and nothing told the model what the face shows. `shot_characters` takes
an `expression` per on-screen character — English visible cues (brows, eyes, mouth, posture)
read from the scene's situation, silent listeners included — and `shot_image` and `shot_prompt`
write it into the image and video prompts; the video prompt asks for it to be held to the last
frame. `shot_image` warns `expression_missing` for a face without one and never refuses. A
sheet's `appearance` describes structure: `character_panel` leaves smile, grin and laugh clauses
out of the neutral face panel and reports them. The moment-before rule is about movement; the
opening face already shows the shot's emotion. See `skills/storyboard/SKILL.md` §3.

## Character sheet clothing (user directive, 2026-11-21)

For new headless front and rear panels, prefer a fitted T-shirt and short mid-thigh
shorts so the shoulders, waist and leg proportions read in both views. Match the
front when drawing the back. Keep the character's own design when clothing is integral,
inapplicable or explicitly requested for the sheet. Fitting clothes belong to the
sheet. In a shot, use the character's established outfit or the scene's wardrobe change.

## Props from the real thing (user directive, 2026-11-21)

Documents were drawn from imagination: a handwritten Korean will went onto its prop sheet as
"one off-white signed sheet, keep writing unreadable" and an exam result as a generic
certificate, and the user asked for research prop by prop, twice in three days. Nothing on the
prop path asked for it. So before a prop is described or drawn, the author looks up the real
thing: the rule or issuer's form that makes it genuine, and pictures of actual examples, saved
under `storyboard/images/research/<prop id>/` and viewed. `SB_DOC.props[].research` records
`{sources:[{url,title,image}], observed}` or `"none"` for a prop with nothing real to look up;
the description is written from `observed`, with the words the prop displays inside quotation
marks, and the prop's own picture is made from the saved real picture with the story's
particulars. Real logos, official seals and personal data stay out unless the user asks for that
real one. Every board write prints the props with no decision and those looked up without a
saved picture, `shot_image` warns `prop_research_missing`, and the review page shows the observed
facts, sources and real pictures on each prop card. Each of these reports; none refuses, and
existing prop pictures are not regenerated for this alone. Places and wardrobe deserve the same
look-up and have no report yet. Follow `skills/storyboard/references/prop-research.md`.

## Head against body (user directive, 2026-11-21)

Nothing on a character sheet sized the head against the body: the face panel is an enlarged
close-up, the front and back panels are headless, and the sheet's `proportions` reached only
those headless prompts (the Qwen route sent no sheet words at all). The head count is read from
`physical.proportions` ("7.5 heads tall", "about two heads tall", "3등신") and never guessed from
age, species or style; a range or two different counts reads as none. `shot_image` states it for each character and bystander wherever the crop
shows the body — the count, shape words and the head's length in cm, and that a face panel sets
no head size — and tells a set render's coloured figures apart as position, facing and height
only. A sheet without a count reads `head_count_missing` in `character_manage`
(`missing.headCount` and the sheet warnings), `character_panel` and `shot_image`. Each of these reports; none refuses.
The shape words come from twelve rows by head count, geometry only with no age or style label:
the rows at 1.5–2, 3, 7.5 and 8 heads follow the pages read, the rest are ours. Whether the
sentence moves Qwen or any saved model is not measured. Evidence and limits: [character proportion study](https://github.com/ttalkkaklab/social-flow/blob/1eabc4fb598b99135fe39a1a2be1f7dbe07fd5a9/docs/research/2026-11-21-head-body-proportion/README.md).

## Silence around native lines (user directive, 2026-11-16)

MSR clips kept opening and closing on a silent character: on 299 measured clips half of each
clip was silence around its line. A natively voiced clip plays exactly the requested length
and the model fills what the line does not need with silent acting. So the length follows the
line: `storyboard_read` times an untimed line from its syllables in the board's language and reports
`performanceTiming.storedExcessSeconds`, and `video_plan` returns `speechFit` with a warning
and the shortest covering request when a request runs more than half a second over. A pause
the story needs is written into the performance (a timed action, `leadInSeconds`,
`tailOutSeconds`). For clips already made, `speech_manage attach_video` returns where the
line sits (`soundtrack`) with a suggested `edit.in`/`edit.out`, and a card that plays its
clip soundtrack trims picture and sound together with those fields; assembly prints a warning
for a second or more of silence before a line. Each of these reports; none refuses, and no
trim is applied without the author. Attaching other footage removes the old trim. Filmed sync
footage keeps `in=0`. See `skills/produce/references/cinematic-edit.md`.

## Dialogue coverage (owner directive, 2026-11-28)

Each shot has at most one speaking character across on-screen speech, off-screen speech, narration and inner thoughts. Start a new shot before a different character speaks, even in the same framing. Silent listeners may remain visible. A requested one-take can have one voice. If the script needs a reply, report the conflict and retain the lines until the author chooses cuts or revises the dialogue. Scene-level pinned-voice limits still apply across cuts.
Choose the scene's visible evidence before cast/lines: speaker-facing OTS or close-ups
when the face matters, purposeful off_screen speech over listener reactions, details,
POVs or spatial views when those carry the change. Addressing a listener never requires
that listener in the crop. Preserve emotional behavior until a visible event changes it;
inspect the sequence rather than imposing shot-size quotas. Preserve the axis, eyelines,
story order, acting and line IDs.
Follow `skills/storyboard/references/dialogue-coverage.md`.

Silent and inner-thought shots use image2video rather than MSR. Mark thoughts as
`voiceover` attributed to the thinking character, generate pinned-voice TTS, measure
and compose it with the shot's action, lead-in and tail-out, then plan the full video
coverage. Keep mouths closed and use the composed TTS as assembly audio. Split mixed
physical/inner speech before generation. Missing TTS setup is reported, never replaced
with native MSR thoughts. Existing usable clips do not require regeneration.

## MSR voice and LTX default (user directive, 2026-10-30; voice optional 2026-10-31)

For MSR, identify the speaking character in the inspected opening image. Keep dialogue in
`shot_dialogue` and action in `shot_prompt`. Recompile saved action with current icons
at video planning time and report each setting's delivery route. Experimental success
is not a guarantee of model adherence, voice identity or subtitle absence.

MSR renders a cut from subject and background images; any dialogue is written in the
prompt, and MSR's own speech-and-effects soundtrack is the cut's audio. A speaker's pinned
voice sample is optional: when the speaker is subject 1 or 2 and the gateway accepts
samples, the sample rides on that subject image; otherwise the prompt voices the speaker
and the plan records a warning. A request that sends a sample to a gateway without sample
support is a hard `msr_voice_unsupported` error. There is no external TTS lane for MSR,
so its lines get no per-line TTS: `speech_manage` plans and binds an MSR shot as `native`
(line revisions, no line audio) and an edited line marks the clip stale (2026-10-31).
A cut without physical dialogue uses img2video; inner thoughts use separate timed TTS. The standalone shot adapter's default MSR references are
its sheet panels — face close-up, headless front and headless back (2026-10-31): one
character uses all three; two use each face, then each front; the shot's start image (its characters,
place and props composed by `shot_image`) takes the background slot, and the plain place picture stays out.
Three or four principals use one face per person. Four subject image slots are shared with clothing and props. Voice samples still use only the first two subjects. For a declared MSR cast, storyboard writes and video planning rebuild
the character references from the cast's shared panels.json in that same order. Missing
faces cannot fall back to a body-only picture or an old transport alias; planning reports
the missing panel. Storyboard writes also synchronize the displayed face/front/back links.
Pinned samples follow the registered panel owner even when an old voiceReference names
transport copies. On boards without a declared cast, legacy explicit image ownership stays.
`video_plan` counts MSR subject images separately from the optional background and temporal pins. `video_plan` names the panels that show one character and lays the
prompt out as the model card does: reference descriptions first, then the action, then
`Audio N (Image M): "…"` lines.

## Voice-consistent video models only (user directive, 2026-10-31)

Google Cloud Veo 3.1 is supported for non-speaking pictures and external voiceover (2026-11-21). LTX keeps its existing image, reference and supplied-audio routes. New providers declare operation and voice capabilities. Gemini Developer API Veo previews, Gemini Omni and Seedance 1.x remain retired. Every adapter in `server/src/video-registry.ts` declares a voice
lane — `reference` (a pinned per-character voice sample: `astra_genai_msr`, `seedance_reference`,
`fasth3_omni_reference`), `supplied` (the pinned TTS track drives the clip: the three
audio2video adapters) or `none`. `video_plan` refuses `voice_lane_required` when a `none`
adapter would show a character speaking (an `on_screen` line) or voice lines natively;
narration over a non-speaking picture runs on any adapter. A saved or override selection
naming a retired engine reads `migration_required` in settings and fails `video_plan` with
`video_engine_unsupported`. Their existing clips stay reusable through `visual.reuse`; never
regenerate solely to migrate. MSR keeps the contract above. Seedance binds each speaker's
image and sample in the prompt (`@Image N`/`@Audio N` on 2.5, `Image N`/`Audio N` on 2.0) and
uses a reviewed private portrait asset for a visible photoreal sheet face. Keep the saved model and casting. Follow the [Seedance character contract](skills/_shared/video-routing.md) before approval.

## One storyboard template (user directive, 2026-10-31)

`skills/storyboard/references/storyboard-html-template.html` is the storyboard design for every
episode. `storyboard-html.js` copies it with its helpers, keeping only `<title>` and the
`SB_DOC` block. Design changes go into the bundled template, not into an episode or library copy. Each shot and
`STRUCTURE` scene carries a one-sentence `summary` of its story for the review.

## Story, characters and lines, icons, images, prompt, approved video (user directive, 2026-10-31)

Once the scenario is settled, the storyboard's first step writes only the story, one layer at a
time: `story_sequence` → `story_scene` → `story_shot` (one sentence per shot). No image, speech,
prompt, camera or dialogue work happens in it. The second step sets each shot's characters with
`shot_characters` (at most two, or none), then each character's lines with `shot_dialogue`. The
third sets the attributes the review's icon row shows with `shot_icons`: render route, size,
angle, camera move, focus, depth, frame plan (`reference` is MSR) and the transition into the
next shot (`next`, stored on that shot's `transition`, which assembly reads). Each tool refuses a layer
whose parent is missing (`story_order`); `shot_characters` waits for a story with no gaps and
`shot_icons` for every shot's characters. Inside an episode a new board starts with
`story_sequence` — `storyboard_apply` does not create one — and carries
`STORY.authoring:"story-first"`; on such a board every writer refuses a shot without its story,
and lines or icon attributes before the shot's characters. Its cast comes from
`storyboard/cast.json` alone (`SB_DOC.characters` adds detail, not members), and `shot_characters`
and `shot_dialogue` repeat the cast check above; `shot_characters` refuses a `voiceOnly` character
on screen (`cast_voice_only`). Older boards keep their contract.
`production_workflow` completes a story-v2 `text_storyboard` only with every shot story and
every shot's characters written (`story_outline_required`).

The fourth step makes each picture shot's start image with `shot_image`, from its characters'
sheet panels (one character: face, headless front, headless back; two: each face, then each
front), its place and props, with a prompt built from its size, angle, depth and techniques,
the episode style and an English description. When the place's sheet names a built set
(`SB_DOC.locations[].manifest`), Image 1 is that set rendered in Blender from a camera the shot's
size and angle set, aimed at its cast's blocking, and the sheet image only gives the look
(2026-11-01); without a set the sheet image leads, with a warning. It runs
`image_plan` → `image_execute` with the saved model. An end image follows only for a
`first_last` shot (`frame:"end"`, edited from the start image). A model that takes one
picture refuses (`image_references_unsupported`); the user chooses the replacement. The storyboard stores shot action, closing state and diegetic sound as attributes before or after shot images. A video request runs `video_plan` on the current scene and its ordered shots.

On MSR the start image rides in the background slot and the plain
place picture stays out. Each shot's video then waits for the user's yes to its plan
(`video_approve {planIds}`), or their approval of every shot (`video_approve {auto:true}`);
`video_execute` refuses otherwise (`video_approval_required`). The session never records an
approval the user did not give.

## Camera moves reach the video (user directive, 2026-11-21)

The mochi_bo boards held 337 of 390 video shots and left 29 unchosen in the 2026-11-20 sample,
mostly through one `shot_icons` value mapped over every shot. Of 24 planned moves, 23 used a
hand-written prompt. Those requests need individual inspection. EP05 s0015 asked to preserve
the composition and the sampled frames hold it. EP01 s0104 requested a right pan and the
cafe doorway shifts left in the footage. On the GenAI image and MSR lanes, which take
2,000 characters, 97 of 185 board prompts ran past it (the
audio-to-video lane takes 5,000, and its prompts were rewritten by hand all the same). So
`video_plan` compiles the board prompt to the adapter's limit, leaving out design notes, the
beats' acting fields and then expressions before the camera, action or lines; beats say an
action once and drop voice direction a model does not voice. A hand-written prompt saved on the board that drops or
locks the board's move is named (`camera_move_missing`, `camera_move_contradicted`); `shot_icons`
names video shots left with no move (`camera_move_unset`) and a call that holds every video shot
it sets; board writes count unchosen moves. Each of these reports; none refuses, and no share of
moving shots is asked for. These observations cover two clips. See
`skills/storyboard/references/action-direction.md` and `skills/generate-cut-videos/SKILL.md`.

## Music spotting (user directive, 2026-11-14)

Three episodes got their music at assembly, from files made for other episodes, and the
user placed each cue by hand. So every scene on a story-first board gets a music decision
once its lines are written: `story_music` records `score` with a cue or `none`, each with
its reason, and writes the `$timeline` span. A scene nobody decided reads `undecided`;
`$timeline: []` without decisions is not a choice of silence. A `prompt` cue is generated
for its episode after the user authorizes the spend, never filled with another episode's
file, and the sound compiler reports a cue file with no `music_execute` receipt in the
episode. The user's music feedback is saved as dated notes in `production.musicDirection`
and shown at every spotting. A span can start later in its file (`sourceStartSeconds`), and
a span resting more than `maximumSeparationLu` (20) under the speech is reported. Each of
these reports; none refuses a write or a build, except input the tools cannot use: an unknown
cue, scenes that do not follow each other, or an offset that leaves no cue to play. The
receipt check reads cues the board names, so a channel bed copied in as the legacy `bgm.wav`
is outside it. See `skills/storyboard/SKILL.md` §3.

## Authored scene prompts (user directive, 2026-11-24; bounded edits 2026-11-25)

The planner composed every scene prompt from the shot cards, so the session could not adjust
its wording for a model. Every scene plan returns
`promptTemplate`, the submitted prompt with each reference number turned into a name, and
`story_scene.videoDirection.prompt` holds the edited copy. Use named references: `{castId.<role>}`,
`{castId.image}` for a single picture, `{castId.voice}`, `{referenceId.image}`,
`{shotId.image}` and the other names the plan lists in `promptSlots`. The planner fills in the
numbers of the request it submits. Compile the attributes on the scene, shots and performance beats when video is requested. A stored production prompt in `videoDirection.prompt` supplies the exact wording when present. Separate prompts require separate storyboard scenes. Archived model drafts remain readable.

The edit is bounded where a scene has a cast or natively voiced dialogue. The planner's own
sentences may be removed or reordered, and a new sentence must be one of the supported camera,
blocking or media cues. A reworded sentence or free prose is refused
(`scene_direction_unverified`); that wording goes on the scene or shot card and the prompt is
composed again. The approved lines stay word for word, in order, each introduced by its
speaker (`scene_dialogue_mismatch`, `scene_dialogue_speaker`). A scene with neither takes free
wording. Also refused: a name with no submitted reference or another brace
(`placeholder_unresolved`), a shot image sent as a timed frame (`placeholder_unlabeled`), a
typed number that names no input (`reference_unknown`), a prompt over the model's limit, an
empty prompt and an
adapter's own rule for its prompt (`prompt_refused`). `promptIssues` reports a typed number
that names an input (`label_literal`, refused under `wholeScene` and in a saved draft), a
submitted reference the prompt never names, the text-free or silent-picture sentence the
planner's own prompt carries and the author's leaves out, and white space an adapter trims
(`prompt_whitespace_normalized`). Camera direction is not read from an authored prompt for the
plan's direction record. Cast, shots and lines stay on the board as the evidence for lengths,
limits and attachment. See
[scene prompt design](docs/research/2026-11-24-video-model-prompting/scene-prompt-design.md).

## Prompt ownership and the engine interface (user directive, 2026-11-25)

A video model takes one prompt for each call, so the prompt belongs to the scene, where the
session can read and adjust it, and no request this plugin builds asks the GenAI gateway to
write one for a single call. The gateway wrote it on two paths: `shots[]` text on the GenAI
text and image adapters, and the gateway's per-shot scene route with its rendering modes. The
adapters refuse `shots`, and the per-shot route is gone (see the next section). A scene is
planned for one model call: the planner writes its one prompt, the plan returns it as
`promptTemplate`. Save its edits on the storyboard scene under the bounded-edit rules above.
On the GenAI engine the request carries those names and the gateway numbers them; other
engines' adapters keep their own wire dialect. The model paces the cuts on the GenAI scene
mode (`scene_cut_timing_model_paced`), and on the other routes the plan names each later shot
whose composition image the operation cannot send (`shot_reference_omitted`). A plan saved
under a retired rendering mode reads `video_plan_stale` at approval and execution, before any
upload; `video_status` still collects a job it had submitted.

Desktop's default provenance, `typed`, lets the app's enhancement settings rewrite a prompt.
The gateway Desktop adapters send `promptProvenance:"enhanced"` for a written prompt unless
the call names `typed`. The GenAI image adapter sends `promptExtend` false unless the call
sets it.

`video_catalog`, `image_catalog` and `music_catalog` list every adapter when called with no
argument. With an `engine`, and an `operation` or for music a `model`, they return the
matching adapters (`ltx-desktop-local` alone still answers with the app's live catalog) with their parameters as JSON Schema read from each adapter's own zod
schema: `parameters.common` holds the names that mean the same across that media type, such as
the prompt, model, seed and output path, and `parameters.options` the adapter's own. `video_plan`, `image_plan` and `music_plan` take
`engine` and `model` as a check on the saved selection. A mismatch is refused
(`model_selection_mismatch`, `image_selection_mismatch`, `music_selection_mismatch`) and a
plan never switches the selection. The video catalog reads timed images and pinned voices
from each registry entry.

That the kept routes add no words is read from the gateway's source, and no render compared
a plugin-written prompt with a gateway-written one. Record and evidence:
[loop 036](docs/loops/036-prompt-ownership/loop.md).

## GenAI through the common generation API (user directive, 2026-11-25)

Every GenAI video request goes through the gateway's common generation API: `POST
/v1/generations`, `POST /v1/generations/validate` for a scene, `GET /v1/generations/{id}` and
`GET /v1/models`. No plugin code calls the gateway's per-model LTX and MSR routes or their
capability routes any more, and the per-shot rendering mode and its shot bindings are gone
with the per-shot route. The GenAI engine has the shape of the others: the planner's scene
request, a registry adapter with its own schema, and one wire module (`astra-genai-video.ts`).

A storyboard scene on the GenAI engine is one `mode:"scene"` request (`astra_genai_scene`). The
planner composes the scene as one LTX MSR render and names each reference after the cast member
and picture it shows (`{hero.face}`, `{hero.voice}`, `{opening.image}`); the gateway numbers the
names, voiced cast first, and adds no sentence. Each shot carries its frame count and the
picture it opens on. The opening is reproduced, a later picture only guides, and the model
paces the cuts. `video_plan` uploads the files and runs `/v1/generations/validate`: a scene the
gateway numbers, times or cuts differently from the plan is refused, and the compilation is
shown beside the plan as `sceneValidation`. Execution validates once more, keeps the exact body
beside the receipt and posts it under an `X-Request-Id` derived from it, so `video_status`
recovers a lost response by replaying that body within 23 hours, which returns the first job.
The clip renders on the next 8k+1 frame count and is cut back to the storyboard's frames.

Scene mode only (the user's choice). A scene without a cast picture also sends its opening as
an `object` reference. A scene saved on `ltx-2.5-22b-dev`, a scene with a supplied soundtrack
and a line pinned to a frame are refused at planning (`scene_mode_model_unsupported`,
`scene_mode_audio_unsupported`, `scene_inputs_unsupported`), and one GenAI scene binds at most
two pinned voices across all its cuts. The production GPU budget (2026-11-26) allows two
referenced people and two character images per scene, and those people are the scene's speakers
(2026-11-27): a silent person reaches the clip through the shot pictures. The planner uses a face
and body panel for one speaker or one face each for two. Storyboard writes split at the first
authored cut that needs a third speaker. Keep shot order and dialogue, inspect the new opening and
rebase frame cues. A shot or requested one-take that needs three reports `scene_cast_exceeded`.
An ending or timed picture inside a
shot, and a panel a shot named that the scene cast leaves out, are not sent and the plan names
each (`scene_picture_omitted`, `scene_reference_omitted`) (user's choice, 2026-11-25). The gateway
caps the numbered scene prompt (2,000 characters on `ltx-2.5-22b-distilled`); a longer one is
composed again with fewer optional words, in order: repeated sentences and the long panel sentence,
design notes, timed acting beats and delivery cues, expressions, then per-shot sound, blocking,
closing states, axis and continuity. Size, angle, camera move, action and lines stay, the plan
names what went (`scene_prompt_fitted`), and a scene still over at the last step is refused before
any upload (`scene_prompt_too_long`) (user's choice, 2026-11-25). The direct tools and
the live character use the common modes `text2video`, `image2video`, `audio2video` and `msr`;
the gateway refuses at submission what its backend does not take. Clips the retired per-shot
route made keep their receipts and are still verified and assembled, each card counted as its
own render. The LTX Desktop engine (`/v1/ltx/desktop/*`) is outside this change. Record and
evidence: [loop 038](docs/loops/038-genai-common-api/loop.md).

## Per-model guidance at planning (user directive, 2026-11-25)

A vendor's guide recommends less than its API accepts, and the planner checked only the hard
limits. Every plan now carries `promptGuidance`: the writing sentence for the selected model,
the path of its model family's page under `skills/generate-cut-videos/references/` (MiniMax
H3 and FastH3, LTX-2.5 with MSR, Seedance 2.0 and 2.5) and an `advice` entry for each count
outside the range the vendor recommends. Seedance 2.0: more than four reference people or
five reference files. Seedance 2.5: more than eight picture subjects, more than five voice
subjects, or a voice sample outside 5 to 10 seconds. FastH3: more than 345 frames, where the
adapter takes 362 and the model's reference pipeline ends at 15 seconds. Each of these
reports; none refuses, and advice sits outside the manifest an approval signs, so it changes
no plan id. `video_catalog` names the page on each row as `promptReference`.

A Seedance scene of two or more shots introduces each as `Shot N:` on both series: the
2.0 guide recommends shot identifiers and calls precise timing unstable. Those plans get new ids.
An authored prompt may keep, drop or renumber the label, and a draft with the earlier
"Then cut directly." between shots still plans. MiniMax's six-section H3 prompt format was
compared with the planner's own on the local FastH3 build before any compiler change: on one
scene with two seeds each, the six-section form spoke both lines exactly twice and the planner's
once, short of the rule set before the takes, so the planner's form stays. The ranges are the vendors' statements and no Seedance or hosted H3
render was made. Record and evidence:
[loop 037](docs/loops/037-model-prompt-guidance/loop.md).

## English video prompts (user directive, 2026-10-31)

Every video prompt is English on every adapter, Seedance 2.5 included. Only dialogue uses the
video's language, inside quotation marks. `video_plan` and the Seedance adapter refuse
non-Latin letters outside quotes (`video_prompt_language`). Assembled prompts name a cast member
with a non-Latin name by character id and report a non-English voice description for translation;
`speech_manage` warns when its scene videoPrompt carries authored text in another language.

## LTX character references (user directive, 2026-11-21)

The standalone MSR and distilled I2V adapters have four subject slots. Episode scenes use the two-speaker, two-picture production budget above. Each face or outfit image uses one subject slot. List unreferenced cast members in `visual.bystanders` and unnamed people in `visual.extras`.
Choosing LTX at project setup saves `{engine:"astra-genai", operation:"reference"}`
with `resolution:"1024x576"` for 16:9 (`576x1024` for 9:16), and `video_plan` plans each
scene as one GenAI scene-mode request. GenAI submissions wait up to 15 minutes for the
gateway's acknowledgement. See `skills/_shared/astra-genai.md`.

## People in the frame (user directive, 2026-11-17)

An episode came out as fifty waist-up pictures of whoever was speaking: its shots were cut one
per line, so none showed the place, the work a character does or the person a line lands on.
Who speaks does not decide who is seen. `shot_characters` takes
`bystanders` — cast members seen without an on-screen line — and `extras`, unnamed people
described in English. `visual.character` lists the people the shot shows; a GenAI scene's video call references only those with a voiced line. A shot
shows at most four of the cast. `shot_image` draws a bystander from their face and front
panels and extras from the words; the video call references neither, since the start image
carries them, and the video planner carries them into the requested scene. A bystander with an on-screen line is
refused (`shot_bystander_speaks`). Whether a clip holds a bystander's look from the start image
alone is not measured yet.

Every board write prints the board first as counts: people in frame, shots with and without a
line, sizes, the widest shot of each scene, one person framed where a scene has several, and a
reason sentence repeated across shots. A note shared by several shots prints once. These are
counts, never targets or gates. See `skills/storyboard/SKILL.md` §3 and `dialogue-coverage.md`.

## Style ban — report-style stative verbs (user directive, 2026-08-12)

Don't close sentences with Korean endings of the
**남긴다 · 갈린다 · 나뉜다 · 남는다 · 남습니다 · 나뉩니다 · 갈립니다 · 남깁니다**
family. Wrapping a phenomenon up in a single verb is narration-style prose — an AI tell.
Name the subject and write concretely instead — "근거를 남긴다" → "근거를 적어 둔다",
"추천이 갈린다" → "미용실마다 다른 색을 권한다", "둘로 나뉜다" → "두 갈래다".

Apply D8 wherever this project calls for authored Korean prose, including content
copy and replies to users. `check-style.py` flags D8 as an S1 finding on content copy.
S1 findings are suggestions (2026-10-18). Run this scan when writing or editing a doc:

```bash
python3 - <<'PY'
import re, os, glob
pat = re.compile(r'남긴다|갈린다|갈렸다|엇갈린다|나뉜다|(?<!살아)남는다'
                 r'|갈립니다|나뉩니다|(?<!살아)남습니다|남깁니다')
roots = ['skills','agents','server/src','docs'] + glob.glob('data/*/growth/*/growth-plan.md')
files = ['README.md','CLAUDE.md']
for r in roots:
    if os.path.isfile(r): files.append(r); continue
    for dp,_,fn in os.walk(r):
        files += [os.path.join(dp,f) for f in fn
                  if f.endswith(('.md','.html','.ts','.js','.sh','.py'))]
for p in files:
    if 'korean-style.md' in p or 'check-style.py' in p: continue   # rule source of truth · fixtures
    s = open(p,encoding='utf-8',errors='replace').read()
    for m in pat.finditer(s):
        print(f"{p}: …{s[max(0,m.start()-40):m.end()+15]}…".replace('\n',' '))
PY
```

`growth-plan.md` (the standing authorization) is in the scan — it's our prose, reread
every tick. `growth-log.md` and `state.json` are not (past records, and they hold
reviewer quotes). `CLAUDE.md` quotes the banned forms in this section, so it's normal
for the scan to flag that passage.

The rule's source of truth is `skills/platform-guide/references/korean-style.md` §D8.
Exceptions: `살아남는다` (a different verb), conditionals (`나뉜다면`), spoken past
tense, and imperatives (`남겼어`·`남겨 둬`).

## Episode production choice (user directive, 2026-09-06)

New episodes follow the six-ratio contract in `skills/storyboard/references/production-mode.md`
and persist `renderRatioVersion:1`. The episode's ratio is the saved `production.mode` in
`.social-flow/models.json`; only when no value is saved does HITL offer the six choices, with
first-pass and retry-inclusive video costs, model, resolution, audio setting, explicit budget cap
and exclusions. Persist the choice in `window.PRODUCTION`. The ratio is a planning target and
the cost ceiling: the band's upper bound and the budget are enforced, the lower bound is not,
and fewer generated cuts than the target is reported, never padded with unneeded video.
Legacy approvals without that version count new cuts, rounded up; exclude reused clips, supplied
recordings/stock clips and the shared outro.
Explicit episode choices override the old 1–2 clip cap and optional-hook default.
`hook_only`, `stills_only` and `hybrid` are legacy production-mode ids for resumed boards only.
Bind approval to the final cost quote. Resume an unchanged approval.
The visual style is the saved `style.preset`; only when none is saved, ask once at project
setup for one of the visual-style presets — cinematic-miniature,
photoreal live action, webtoon, claymation, paper-cutout, ink-wash, toon-3d (added 2026-09-08
from the Shorts style survey) or arcade-2d (added 2026-09-09, a hand-painted 1990s arcade game
frame with no HUD) — and apply that choice to every new source/end image and video prompt in
either mode.
Follow `skills/storyboard/references/visual-style.md`; production mode never chooses the art style.
For cinematic-miniature only, full_video follows the spatial-explainer reference `LQZjvQ5W2ck`: consistent miniature/cutaway/
realistic materials, stable geography, deliberate camera moves and visible physical changes.
Its branch overrides the older HTML-only explanation and generated-shot cap clauses below. It
does not relax facts, voice, budget, publishing approval or the ban on
marks over video. Read the production-mode and full-video contracts linked from the skills.
Quality is reviewed against source images and actual clip playback, with asset-bound evidence;
a metadata pass alone is not proof of visual quality. Never hide a failed clip with a still,
HTML fallback, looping or freeze padding. The builder validates the approved video manifest.

## Existing video reuse (user directive, 2026-09-12)

Existing clips at 720×1280 portrait or 1280×720 landscape are eligible for reuse.
The final 1080p canvas is an output size, not a minimum for imported source files.
Measure hashes and duration locally and inspect playback to fill missing import records;
never invent provenance or reviews. Follow the `visual.reuse` contract in scenes-schema.md.
A missing legacy record or a 720p source does not authorize paid regeneration. Prefer
existing clips and local edits; a reuse-only episode has $0 new video generation cost.
New generations follow the explicitly selected model resolution, including 720p.

## Nothing is drawn over video — explanation is an HTML slide (user directive, 2026-09-05)

This is an absolute content rule: no marks and no type of any kind over a moving picture.

- **Nothing is drawn over video.** No arrow, route, X, ring, hatch, bracket, dot, label or
  callout goes over a generated clip, a motion background, a b-roll, a quote clip or a
  recording. Delivered video is subtitle-free, including speech (2026-10-17); a subtitle the
  user asks for is a separate SRT file, never type on the picture. The footage treatment
  (`treatment:"footage"`, 0.47–0.53: one clip per sentence under drawn marks) is retired —
  `check-scenes.js` and `check-slide.js` reject it.
- **A cut that needs an arrow, a figure or a principle is an HTML slide, not video.**
  `shot.infoType` timeline · statistic · principle, and any beat that would need something
  pointed at on the picture, are `kind:"diagram", motion:true, treatment:"editorial"` on the
  studio stage, with a rendered object when a thing is the subject. The quality bar is
  `skills/storyboard/examples/reference-slide.html` — lit slabs, a
  cyclorama, a baked object whose movement is the sentence, one accent, values that count
  while the sentence runs. Those slides sit outside `html_plate_max`, and the static-ground
  clock runs per reveal group on them.
- Video carries essential continuous action with no drawn explanation marks. Mood, place and
  people use still-camera motion when that conveys the cut.

## Physical subjects use 3D objects (user directive, 2026-09-06)

- Choose the shot's purpose first. People, mood and place use a high-quality still with a
  deliberate camera move. A person or physical noun alone does not require a 3D explanation.
  Match camera direction to the actual cut: introduce a face with focus-in, inspect an object
  then a face with rack focus, approach a detail, or pull back to reveal context. Foreground
  reveals and parallax require prepared layers and a clean background. Do not cycle effects
  by shot number. Record the subject, focus regions and reason in the shot plan.
- Principles, quantities, mechanisms and explanatory situations use HTML motion scenes.
  Depict physical things as recognizable, articulated 3D objects: a cart has wheels, an axle,
  a bed and a load. Labelled boxes are not substitutes. Abstract quantities may use bars.
- Give explanatory scenes a relevant environment, such as a workshop, office or supply depot.
  Plan foreground, floor and background together; black or a solid colour is not the default.
- When a narrated person helps explain the action, include a cute, authored 3D doll character
  in the same material, lighting and perspective as the objects and environment. Animate its
  relevant gesture and contact with objects. Characters are optional when objects explain it.
  A realistic character painting with separately overlaid 3D props is not this treatment.
  Prefer an acted task with anticipation, contact and release: move a piece, stamp a document,
  or pull a cart. Head bobbing and waving alone do not explain object manipulation.
- Use real mesh objects with 3D illustration or photoreal materials for new physical subjects.
  Follow `skills/storyboard/references/mesh-objects.md`; the offline runtime consumes GLB and
  articulated mesh assemblies. Flat disks, labelled boxes and moving cutouts cannot substitute
  for a physical mechanism. Abstract quantities can still use bars, type and relationship lines.
- Keep explanatory marks sparse. Character action scenes default to no drawn marks. Preserve
  useful part labels on mechanism scenes, one at a time with a short timed appearance, a small
  anchor and a legible line. A mark needs a reason beyond decoration; remove duplicate labels.
- Use `h.mark.arrow` for smooth curves with a small head following the path. Pen strokes are
  an explicit stylistic choice. Keep the object, arrow and type readable together.
- Render subject motion at the final capture frame rate. Inspect full playback and random
  seeks, including group boundaries. A schema pass alone does not establish visual quality.

## Choose each cut by purpose (user directive, 2026-09-06)

This replaces the older mandatory-video hook and fixed editorial-cut quotas.
Use `skills/storyboard/references/render-routing.md` before choosing any assets.
Every generated cut declares `shot.render.mode` — the renderer needs it — and, as guidance
for the reader, `purpose` and `reason`:
`still_camera`, `character_html`, `object_html`, `data_graph`, `motion_html`, `generated_video`,
`editorial_html`, or `stock_video` (a free stock or archive clip with its `visual.license` record, 2026-09-07).
People mentioned in narration do not automatically need 3D characters; incidental numbers
in a mechanism do not automatically need a graph. Choose the information the viewer needs.

The hook follows the same process. `hook_video` defaults off; an explicitly enabled channel
policy remains a constraint. Generated-video caps and budgets are ceilings, not quotas.
No cut is paid video merely because it opens the episode. Every generated-video choice needs
essential continuous motion and an explanation of why a still or controlled HTML action is
insufficient. Existing recordings and the shared outro retain their source.

`check-scenes.js --draft` warns about missing or contradictory choices before assets; full checks
also compare the choice with the production handoff. The approval page displays the mode and reason.
Camera HTML is still-camera motion and never counts as true subject motion. Keep the episode
budget, generation cap and no-marks-over-video rule; the static-ground limit is guidance.

## Visual direction and charts (user directive, 2026-09-06)

Read `skills/storyboard/references/visual-direction.md` before planning cuts. Do not copy
one generic render reason across the episode. Text-led quotations and verdicts use the
limited `editorial_html` route; they cannot become the whole episode by declaring motion.
Choose photographs, acted 3D processes, object mechanisms and charts from the story's needs.
Data graphs follow `skills/storyboard/references/chart-design.md` and the shared SVG renderer.
No unsupported route, substituted number card or separate PRELUDE may reach assembly.
The builder reruns source-plan checks and records its version and input hashes before encoding.

## Complete project setup (user directive, 2026-10-16)

For every storyboard or video request, establish the user's selected project directory first.
Ask and wait if it is unclear. Record a new or moved directory with `project_manage select`.
Require that directory's `project_manage status` to return `ready` before authoring or
production, including resumed work. Fill missing choices once, including music and separate
TTS (explicit none is valid), and preserve existing episode snapshots.
Use `skills/project-init/SKILL.md` for workspace initialization. Save SNS targets
and connection records, genre, models, visual style, video ratio and format in
`.social-flow/models.json`. Reuse these defaults for new episodes without repeated
preference questions; snapshot the full configuration per episode. Existing boards
and explicit episode overrides keep their choices. This supersedes older repeated
style/ratio prompts. Store credential references only; tokens stay in the external
SNS directory. Pending SNS setup does not prevent local production. Defaults and
budget ceilings do not authorize generation spending or publication.

## Directory model selection (user directive, 2026-10-16)

**Images containing text (owner directive, 2026-10-18):** Every newly generated or
edited image that must display or preserve readable text uses **GPT Image 2**
(`gpt-image-2`). This includes Hangul and other languages, signs, labels, packaging,
lettered clothing, wordmarks, posters and reference-product edits. This standing
asset-specific choice overrides saved image defaults and host-first routing. A host
tool qualifies only when its actual model is verifiably GPT Image 2; an unspecified
host-managed model does not. Otherwise use the plugin's GPT Image adapter with the
exact model ID. If unavailable, report the blocker; do not substitute Z-Image,
another GPT Image version or another model. Apply the scoped override before planning
and quoting, retain existing spending authorization, and inspect the resulting text.
Do not regenerate existing assets solely to migrate models. Code-rendered typography
is not a generated-image model call. See [image routing](skills/_shared/image-routing.md).

**Directory model selection (user directive, 2026-11-21) supersedes automatic routing.**
Once the working directory is known, follow `skills/_shared/model-settings.md`: ask
for the video type first (drama, comedy, documentary, explainer and the researched
catalog's other options), then the video model and its credentials. Ask next for the model
that makes BGM and audience-only drones, risers and stingers. Use an exact catalog model and
check its credentials, or save `models.music:{engine:"none"}` for existing music or no score.
Then ask for the image model and credentials and whether separate TTS is needed.
If yes, select its model and configure credentials;
if no, save `models.speech:{engine:"none"}` and skip TTS setup. Save all choices
in `.social-flow/models.json`, and use
those settings for subsequent episodes until the user explicitly requests a change.
Host-first is an initial recommendation, not a reason to replace a saved choice.
Snapshot settings per episode; preserve existing approved work and explicit voice
exceptions. Do not repeat model questions or silently switch engines after failures.
The type guides speech: narrator-only explainers are valid; drama normally shows
characters physically speaking, with off-screen dialogue reserved for a purpose.
Keep narrator roles, inner thoughts and messages explicit. Existing settings missing
only the type ask only that choice for a new episode; existing episode resumes retain
their original snapshot. The type is independent of the visual style and output format.
Initial setup is an explicit preference step, including on interactive autoproduce;
unattended callers without complete settings report `project_setup_required` with the missing
fields and defer authoring (status codes: `skills/_shared/model-settings.md`).

At first image setup, recommend ASTRA GenAI (`engine:"astra-genai", model:"z-image-turbo"`)
(owner directive, 2026-10-18), not local mflux. Configure `ASTRA_GENAI_API_KEY` if missing;
local generation and host image tools are explicit alternatives. Text-bearing images still
require GPT Image 2. At first video setup, a supported host video tool is recommended;
once saved, the saved choice governs every generated still, slide art, clip, candidate logo,
intro keyframe and growth-post image — channel assets follow `.social-flow/models.json` like
episodes. The storyboard records the saved providers in `window.PRODUCTION.imageProvider`
(`host` | `api`; ASTRA GenAI images are `api`) and `videoProvider` (`host` | `astra` | `api`); the fallback from a failed host call is asked for,
never silent. Host output is logged as `image.host` / `video.host` at $0 with the allowance
noted. Contracts: `skills/produce/references/still-generation.md` §1 and
`skills/produce/references/video-model-selection.md`.

## 3D previz for generated cuts (user directive 2026-09-11; optional since 2026-10-18)

A `generated_video` cut may render its camera and blocking in 3D before the video call — a
Blender previz through the `blender_*` bridge, or a three.js previz through
`skills/storyboard/references/previz-template.html` — at the cut's billed length, 24 fps, grey
proxies with one flat colour per actor and nothing else in frame. The render is stored as
`visual.video.previz` (`renderer`, `clip`, `firstFrame`, `sha256`, `fps`, `seconds`,
`camera.movement`); no checker refuses a generated cut without it. A previz helps camera and
blocking when the model takes a reference clip (Seedance 2.x `reference_video`: the previz as
`Video 1`, the source still as `Image 1`); for a `frame_and_prompt` adapter it only shapes the
still and the prompt and is advice. When a previz exists, the source still is edited from its
first frame, and its move and the shot's `visual.camera.movement` must agree; a prompt that
fights the clip drifts. Imported clips (`visual.reuse`), stock footage, recordings and the outro
carry none, and neither do b-roll and speech clips. The renderer is the
saved `production.previzRenderer` (`PRODUCTION.previz`); when none is saved, the author picks one
and records it as an assistant decision — no renderer or model question is asked. Episode video
runs through `video_catalog → video_plan → video_approve → video_execute`; a direct adapter call on a configured
episode needs `videoContext`. Contract: `skills/storyboard/references/blender-previz.md` §6 and
`production-mode.md`.

## Per-cut video models (user directive, 2026-09-13)

Cuts inherit the saved video model and resolution: `PRODUCTION.videoModel` comes from
`.social-flow/models.json` through the episode handoff (`selection.kind:'standing'`). A per-cut
change is an explicit user exception recorded in `PRODUCTION.modelSettings.overrides`;
`model:'mixed'` describes such a plan. Seedance 2.x may send the previz as
`reference_video`. Keep real API input
constraints, cost quotes and approved budgets. `modelReason` is optional.

## Local storyboard storage

Save episodes under `data/<channel>/episodes/<topic>/storyboard/`. Use the bundled
HTML template and local scenes.js. Keep approvals, research and production records
locally. Follow `skills/storyboard/references/storyboard-design.md`.

## Tests — few, one file per module (user directive, 2026-10-18)

`server/test/` grew from 9 files on 2026-08-23 to 126 files and 2,314 cases on
2026-10-18, mostly because every task added its own file named after its directive.
This section overrides the test-writing defaults of TDD, test-scenario and similar skills.
On 2026-11-02 the suite was cut again from 2,703 cases (35 s) to about 1,580 (17 s), keeping a
case only where a miss is costly: money (budgets, ledger, no re-submission), public posting,
security boundaries, data integrity, the rules this file keeps, branchy pure logic, real
regressions and the tool-surface contract.

- **One file per module.** `render-routing.js` (or `render-routing.ts`) is tested in
  `server/test/render-routing.test.mjs`. Add cases to the module's file; create a file
  only for a new module. `test-layout.test.mjs` fails on a test file whose name matches
  no module and lists the few cross-cutting exceptions.
- **Test what changed.** Add a case only for behavior the change adds or alters and no
  existing case covers. A bug fix adds one regression case. A directive is not a test
  list: don't restate CLAUDE.md or a skill as assertions, and don't test skill prose.
- **Removed behavior takes its tests with it.** When a directive drops a gate, delete
  the gate's cases. Add a "never requires X" case only after X actually came back.
- **Assert structure, not prose.** Check a finding's level or code, returned fields or
  the exit status. Match message wording only where the wording is the contract.
- **Cheapest level that proves it.** Call the function directly. Keep one spawned-CLI or
  ffmpeg case per command path, on synthetic fixtures a few frames long.
- **No real waiting.** `npm test` runs in about 30 s. Advance the clock instead of
  sleeping through polls and rate limits (see the top of `astra-video-client.test.mjs`)
  and clear every timer a case starts.
- **Hermetic runs.** `npm test` loads `server/test/isolate.mjs` into every file: it drops the
  shell's provider keys and gateway URLs and gives each file an empty home, so your own
  `~/.config/social-flow` (`.env`, `disabled-tools.json`, tokens) never changes a result.
  Blender and Chrome stay found. Every Chrome launch passes `--use-mock-keychain`: the empty home
  has no login keychain, and without the flag macOS pops a "keychain cannot be found" dialog. Run one file the same way:
  `cd server && node --import ./test/isolate.mjs --test test/<module>.test.mjs`. A provider whose
  variables use a new prefix adds it to `PROVIDER` in `isolate.mjs`.
- **Readable over DRY.** Inputs that decide the result stay in the test body. Shared
  setup is a factory with defaults, not a `beforeEach` that hides them.

Background and sources: [test design references](https://github.com/ttalkkaklab/social-flow/blob/1eabc4fb598b99135fe39a1a2be1f7dbe07fd5a9/docs/research/2026-10-18-test-class-practices/README.md).

## GitHub authentication

For this repository, prefer `TTALKKAKLAB_GITHUB_TOKEN`. Apply it to both `GH_TOKEN`
and `GITHUB_TOKEN` only in the Git/gh command environment, as described in
`AGENTS.md`. Check the account and repository push permission before publishing
branches or merging PRs. Never log, persist or embed the token in a remote URL.

## Branch strategy

```
feat/<name> | fix/<name>  (integration)  →  dev  →  staging  →  main
```

- Sprint work happens in a `feat/sprint-<N>-<name>` worktree and PRs into the integration branch.
- Promotion goes `dev → staging → main`, in that order. Never straight to `main`.
- Keep remote work branches after merge (history, rollback). Clean up local sprint branches only.

## Commits and secrets

- Never commit `.env*`, `*.pem`, `*.key`, or any credentials/secrets (already in `.gitignore`).
- Nothing under `data/` gets committed — the one exception is `data/README.md`,
  which documents the structure. Channel profiles, storyboards, images, videos,
  and branding assets are local artifacts; this repo holds only plugin code and skills.
- Conversely, `server/dist/` is a build artifact but **must be committed** — `.mcp.json`
  runs `${CLAUDE_PLUGIN_ROOT}/server/dist/bundle.js` directly with no build or install
  step. The bundle is self-contained (dependencies inlined via esbuild) because
  marketplace installs never run `npm install` — an unbundled entry dies with
  `ERR_MODULE_NOT_FOUND` there. After editing `server/src/`, run `npm run build`
  and commit dist (per-module output for tests + `bundle.js`) along with it.
- API keys are injected via shell environment variables, not `.mcp.json`.

## Multi-session caution

Multiple Claude Code sessions work in this repo at the same time.
Before committing or merging, check `git status` and recently modified files
(`find . -mmin -30`) so you don't sweep up files another session is editing.

## 워크트리 경로

워크트리는 기본 체크아웃 루트의 `.worktree/<이름>/`에 만든다. 연결된 워크트리에서도 기본 루트를 기준으로 삼는다. `AGENTS.md`의 2026-10-10 사용자 지침을 적용하며 ASTRA나 도구의 기본 경로보다 우선한다.

## Scene video generation — owner directive, 2026-11-21

Write one storyboard card per shot and compile one video request per scene. A cut to a new setup starts a shot. Continuous camera moves and entrances stay on the current card. An explicit one-take request uses one uninterrupted shot. Record each shot’s incoming transition, scene-frame interval, framing, action and image roles. Inspect the actual opening image. Describe each character’s position or off-screen starting place, their emotional change and the essential action at the visible landmark. Use the authored lines and the saved model selection, including distilled LTX first-frame and subject conditioning where supported. Scene audio spans the cuts once. Carry every designated input to the selected adapter or report its shot, role and frame before generation. See [scene generation](skills/generate-cut-videos/SKILL.md).

## Scene production — owner directive, 2026-11-23

Declare everyone who speaks in the story scene. Submit one scene with `video_plan {episode,sceneNo,requestId}`. The planner chooses an operation from the saved model and the authored inputs.

Allow up to five video generation attempts per scene in an episode, including the first. Count managed jobs by their recorded `sceneNo`. Editing the scene's shots or prompt keeps its existing attempts.

Each generated shot needs a composition image before video planning. The scene opening can cover its first shot. For each later shot, attach `referenceImage` or a start image at the opening frame of its per-shot timeline. The selected operation determines which images the provider receives.

- Use an opening image for a picture with no visible dialogue. Keep off-screen-only speech and narration on the external soundtrack. On GenAI a silent cast member's look comes from the shot pictures `shot_image` draws from the sheet panels; the scene sends no picture of them and the plan names each one it leaves out (`scene_reference_omitted`). On other engines declare visual references for silent cast members whose appearance must carry through.
- Use audio-to-video when a finished scene-length recording must drive the performance, regardless of how many people speak on it; GenAI scene mode renders its own soundtrack and refuses such a scene. Generate a fresh speaking take for a changed line. Post-render lip-sync of synthesized speech to existing footage is forbidden, including after a failed native take or a voice change.
- For authored dialogue in pinned character voices, bind each speaker's sample to their identity. A production GenAI scene references only its speakers, at most two, and at most two character pictures in total (2026-11-27): a natively voiced line needs its speaker's picture because the pinned voice rides on it. One speaker can use a face and a body panel; two use one face each. Props share the four subject slots, and the background and shot openings have their own inputs. Author a new shot within the same scene when the speaker changes. If a requested one-take needs two voices, resolve the conflict before writing its dialogue. Report the affected scene and speakers before submission if the model cannot carry them together. Preserve its shot order and scene number.
- Seedance 2.0 reference accepts up to nine images and three audio clips in one request. Its opening image guides composition. Veo can generate dialogue when the board explicitly selects `videoDirection.dialogueVoice: "model_generated"`. Its Standard/Fast asset mode accepts up to three images of one subject. The planner reports any required input the selected operation cannot send before approval.

Before generating images, save the scene's seats or standing marks, fixed landmarks, facing and camera axis in `story_scene.directionDefaults`. Compose and inspect the first shot before the other shots. `shot_image` uses the first available scene image for the physical layout of later shots in the same space. The authored shot still defines the current viewpoint, crop, expression, action phase and prop state. A built set with actor blocking takes precedence. See [scene image generation](skills/generate-cut-images/SKILL.md).

## One production prompt per storyboard scene (owner directive, 2026-11-26)

Each storyboard scene supplies one production prompt covering all its ordered shots. For generation and retakes, preserve the original scene number and all its shots in a single provider job, including in production copies (owner directive, 2026-11-27). If the model cannot render the whole scene, report the limitation. Only an explicit request to edit scene boundaries authorizes a storyboard split. A revised take reads its current storyboard prompt. Keep previous takes in the production history.
