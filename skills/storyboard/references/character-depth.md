# Character depth through choices and relationships

Use while preparing fictional dramatic characters, choosing a scenario and writing scenes.
Depth means that different sides of a person become understandable through their choices.
It does not require moral ambiguity, trauma, a secret, a redemption arc or more biography.
An unchanging conviction can reveal depth through its cost. A changed person is not
automatically a complex one. Scale this work to the character's role and the user's genre;
an explainer narrator or incidental clerk does not need an inner-conflict subplot.

These are writing prompts, not required fields, quotas, scores or approval gates. Use
existing identity, cast, scene and performance fields. Never add unsupported JSON keys.

## Contents

- [Prepare an identity that can generate choices](#prepare-an-identity-that-can-generate-choices)
- [Find the episode's personal conflict](#find-the-episodes-personal-conflict)
- [Write the conflict as performance](#write-the-conflict-as-performance)
- [Preserve the performance in shots](#preserve-the-performance-in-shots)
- [Carry consequences between episodes](#carry-consequences-between-episodes)
- [Review what the audience can infer](#review-what-the-audience-can-infer)
- [Worked example](#worked-example)
- [Craft basis](#craft-basis)

## Prepare an identity that can generate choices

Read the actual shared identity before inventing episode behavior. For a new identity or
an authorized revision, use its existing fields to connect dispositions with behavior:

| Existing identity field | Useful content |
|---|---|
| `personality.traits` | The tendency alone, in a short phrase; the behavior it drives goes into `flaw`, `speech.examples` or `acting.reactions`. |
| `personality.goal` | What this person is trying to achieve beyond the immediate task. |
| `personality.motivation` | Why that goal matters to them; unknown reasons stay not_applicable. |
| `personality.flaw` | A recurring way of pursuing or protecting something that creates a cost; include their self-justification when relevant. |
| `personality.fear` | What they avoid losing, admitting or becoming, and how that affects a choice. |
| `story.relationships` | Existing counterpart ID, address and attitude, plus what they seek, conceal or protect with that person. |
| `story.background` | The character's present position and circumstances in the story world. |
| `story.past` | Only history that affects present behavior; unknown history stays unknown. |
| `story.arc` | A possible change or tested conviction, not a compulsory lesson or proof that the change already happened. |
| `speech.examples` / `acting.reactions` | How this person bargains, avoids, reassures or resists in a specific situation, beyond catchphrases and emotion labels. |

Keep each field's existing `{status, value, reason?}` wrapper and text/list type. These
are suggestions for the contents, not extra required facts. Do not retrofit an existing
character's biography, relationships or invariants merely to fit a preferred plot. Develop
an episode consistent with canon; propose a canon revision separately when needed.

## Find the episode's personal conflict

Before finalizing the causal sequence, consider the following for the principal characters.
Use only the questions that expose a useful choice; not every character needs every device.

- What do they want now, and what other value, attachment or fear makes getting it costly?
- What do they believe about themselves? Would their conduct support that belief, or expose
  a gap they explain away? An honest character need not have a hidden self-deception.
- Why would this person choose this method? What tempting alternative do they reject,
  and what do they lose by doing so? Establish only the alternatives the audience needs.
- With this particular counterpart, what are they trying to obtain, hide or protect?
  Give consequential supporting characters their own pursuit and power to respond.
- Does the ending change conduct, trust, status or the viewer's understanding? Growth,
  deterioration, refusal to change and a newly understood stable conviction are all valid.

Use `cast.want` for the immediate pursuit and relevant tension, `cast.reason` for why this
person belongs, and the existing beats/events for the actual choice and its consequence.
Keep concise development notes in storyboard.md when useful; do not duplicate the script.
An author's explanation is not evidence that the conflict reaches the audience.

When comparing scenario alternatives, prefer a meaningful difference in what the person
chooses and pays for over a different hook on the same plot. Do not force a want/need pair:
competing wants or a changing priority can supply the conflict without a prescribed cure.

## Write the conflict as performance

Build the consequential scene from a trigger, an attempted tactic, the other person's
response, and an ensuing choice or consequence. This is a causal lens, not a beat quota.
Let pressure reveal priorities: protecting a friend may cost status; accepting help may
challenge a self-image. Small social costs can be enough for a quiet scene or comedy.

Write what each speaker is doing to the listener: deflecting, testing, bargaining,
reassuring, conceding. Let the listener's response change the next move. A character who
always uses one tactic regardless of the response can become a trait demonstration.
Changing tactics need not mean changing personality or becoming more rational.

Use subtext when it fits the scene. Someone may offer practical help to avoid apologizing,
or smile while withdrawing cooperation. Supply enough context to distinguish that behavior
from a random gesture. Direct emotional speech is also valid; concealment is not a quota.
Do not append a line explaining a contradiction that actions already make legible.

Test specificity by imagining another cast member in the decisive exchange. If the words,
tactic and outcome all work unchanged despite different identities, revise the pursuit or
relationship, not just the vocabulary. Do not add arbitrary quirks to pass this test.

## Preserve the performance in shots

Keep the trigger, hesitation or interrupted tactic, choice and consequential response in
the ordered `performance`. Only include pauses or reactions that affect understanding.
Translate the current situation into existing per-line `acting.context`, `intent`,
`vocal` and `visual` when useful. These notes guide delivery; they never replace performed
events. Preserve the pinned voice while its immediate purpose and emotional restraint vary.

Frame the evidence: a withdrawn hand needs visible hands; a refusal may need the listener
in frame or a motivated reaction cut. Set the opening image before the choice and give the
action enough time. Do not start with the reconciled smile if the scene must show someone
struggling to forgive. Close-ups, sad music and generic nods cannot establish missing motive.

## Carry consequences between episodes

For serialized fiction, read the relevant prior canonical episode ending as well as the
shared identity. Establish series order from actual project material, not file timestamps.
Distinguish fixed identity, the current relationship/knowledge state and this episode's
temporary performance. Do not restart an already completed arc or restore lost trust
without an event that explains it. An episodic reset is valid when the series establishes it.

When useful, record the starting state and resulting change with source episode/event
references in the existing storyboard.md. Treat an unapproved candidate's ending as a
proposal, not established history. Missing history stays uncertain. Do not overwrite the
shared identity or another episode to persist a new draft's consequences automatically.

## Review what the audience can infer

First read only the ordered actions and actual speech, with necessary place/time cues.
Record what each principal character seems to want, what choice costs them, what their
behavior suggests about themselves and what changes between people. Cite exact events;
multiple plausible motives can be intentional. Do not insist that viewers name the author's
precise psychological label or diagnose the character.

Then compare with identities and intentions. Distinguish a clear but generic character
from an incomprehensible choice: the first calls for specificity, the second for a missing
cause. Neither a populated sheet nor a coherent plot proves depth. Review only dimensions
the story uses; no deduction for an absent trauma, confession, transformation or subplot.
Use the existing character/motivation axis and evidence refs, without a new numeric gate.

## Worked example

Illustrative fiction, not a default character or a required ending:

Flat setup: a caring supervisor helps a junior succeed. Adding a favorite food or a sad
childhood does not yet change this scene.

Developed setup: the supervisor genuinely supports the junior but equates being needed
with being a good mentor. During a rehearsal the junior answers a question unaided. The
supervisor reaches for the slide remote, offering to explain the difficult part. The
junior keeps hold of it: "Let me finish." The supervisor withdraws their hand. At the
client presentation, a question comes to the supervisor; they turn toward the junior and
wait. The junior answers, then advances the slide without checking for permission.

The offered help, resistance and later relinquishing of control supply the evidence.
The note about being needed stays off screen. A shot that shows only the supervisor's
face during the remote exchange would lose an important cue. A darker alternative could
have the supervisor interrupt again and the junior stop seeking their advice; earn that
outcome through the exchange rather than announcing a sudden personality change.

## Craft basis

- [OpenLearn: round and flat characters](https://www.open.edu/openlearn/history-the-arts/creative-writing/start-writing-fiction/content-section-1.2): contradictions can reveal complexity.
- [Scriptnotes 372](https://johnaugust.com/2018/scriptnotes-ep-372-no-writing-left-behind-transcript): wants can change; want/need is not a universal construction rule.
- [Scriptnotes 360](https://johnaugust.com/2018/scriptnotes-ep-360-relationships-transcript): interaction creates behavior beyond two separate character profiles.
- [Scriptnotes 624](https://johnaugust.com/2024/scriptnotes-episode-624-creating-empathy-for-your-characters-transcript): playable actions, emotional restraint and self-deception.

The workflow and example above synthesize craft advice; they are not an experimentally
validated formula or a prediction of audience response.
