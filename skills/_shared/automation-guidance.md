# Production order

Follow the [production order](production-workflow.md) (user directive, 2026-10-31): only
the story order is enforced; reviews and Blender compositions run only when the user asks.
Each shot's video waits for the user's yes to that shot (`video_approve`), or their
approval of every shot. This does not authorize spending, publication or automatic speech scoring.

# Automatic work: guidance, evidence and authorization

Owner direction, 2026-10-16: keep creative principles in skills as guidance, not
mandatory executable quality gates. This policy takes precedence over older
score thresholds, review loops, creative checklists and intermediate approval
requirements in skills and reviewer instructions. Work in the
[production order](production-workflow.md): project setup, characters, the story and its
shots, props, backgrounds and images before video.

For every review follow [host evaluation](host-review.md). The executing host LLM
judges actual evidence; no external evaluation API or model fallback is used.

## Continue toward the requested artifact

Use the user's task, established choices and delegated judgment. Complete authorized
local work without making the user approve intermediate prose, candidates, camera
plans, style choices or bookkeeping. A storyboard request ends with a reviewable
storyboard; it does not automatically start media generation, spending or publishing.
Present the storyboard's scenario before detailed authoring in interactive work; this
progress update does not require approval or a pause. Prepare its character, prop and
background/location sheets before shot design, then export the shared template. These are
requested planning deliverables, not numerical quality gates. Honor an explicit request
to wait for scenario selection. An inspection request remains read-only unless the user
requests corrections.

If a preference is unspecified, make a reasonable, reversible choice and record it
as an assistant decision. Do not label it a human approval. Reuse existing explicit
choices and standing authorization; do not ask the same question again. Keep the
scope of those choices: a production budget is not publishing permission.

Exception requested by the user: the initial directory-level video type selection,
then video, speech and image model selection follow [model settings](model-settings.md),
and the initial visual style, video ratio and output format follow
[project-init](../project-init/SKILL.md). Ask for actual choices once at project setup,
persist them, and reuse them for every later episode and for channel assets (logos,
intros, growth images). Do not invent these standing preferences or let automatic
engine routing override them.

## Creative principles are review prompts

Use the relevant skill's concrete advice when it improves the work: observable
character motivation, meaningful consequences, clear spatial relations, prop
continuity, readable framing, accurate factual claims and an earned ending. Explain
material weaknesses and repair them within the task. These principles do not require
a fixed plot formula, a prescribed camera move or a machine-verifiable score.

- A CTA, its wording, position and share metadata are optional. No CTA check gates work.
- Candidate count, engines, fixed headings, beat count, research/search quotas,
  scene length, shot count, camera variation and emotional curves are suggestions.
- Review scores, P0 labels, hash freshness, freeze stamps
  and review receipts are evidence about a review, not permission to continue. Missing review means
  `not_reviewed`; changed inputs mean `stale`, never a fabricated pass.
- A reviewer describes findings and likely consequences. A score does not approve
  an artifact, reject a topic or change authorization. Preserve useful findings.
- Do not force checkers or reviewers into every automatic run. Use them for a real
  uncertainty, the user's explicit request, or an actual runtime dependency.
- A low score, stylistic preference, unsupported checker language, missing creative
  metadata or exhausted review count does not discard a topic, hold a queue item,
  or abort authoring. Continue with the best justified draft and report limitations.
- If the user explicitly requests a quality target or convergence loop, pursue that
  target honestly as this task's objective. It is not a new global acceptance rule.

## Keep checks that the next operation actually needs

A parser needs readable data; a renderer needs its actual inputs; a provider needs
supported arguments; speech needs a resolvable speaker and valid timing; an edit
needs the correct source revision. Keep those operational contracts. Resolve a
failure rather than claiming success, and continue independent work when possible.

Planning need not contain ungenerated media, image-derived focus coordinates or
encoded-output measurements. Report the stage honestly. Missing final media blocks
encoding that media, not writing or inspecting the plan. File hashes bind evidence
to bytes and help avoid stale reuse; they never prove quality on their own.

Unsupported or unknown visual/audio review capabilities are reported as limitations.
Do not claim to have watched, heard or verified an asset without doing so. Speech
quality scoring, STT and listening approval are not automatic production requirements;
follow the shot-speech contract for receipts, routing and timing.

## External actions retain their actual boundaries

Keep authorization for new paid calls, external uploads, account changes, publication
and messages to others. Check which action the user authorized, not whether an old
local file has a ceremonial approval stamp. Do not invent permission, silently extend
its scope, exceed a budget, bypass a lease/revision conflict, or duplicate an uncertain
paid or published operation. Reuse valid prior authorization.

Quality findings alone do not require another approval before authorized local assembly.
Show them with the output, including what was not reviewed. Assembly authorization
still does not authorize new paid generation or publication. A genuinely missing or
incompatible input must be fixed for an operation that cannot execute without it.
