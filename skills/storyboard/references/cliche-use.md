# Clichés: pick for what the story needs, then move one thing

User directive, 2026-11-18. A cliché is a shape the viewer already knows, so it tells them
where they are in a second and leaves the seconds for what is new. This reference says when
an episode uses the researched clichés, how to pick one without reading the whole list, where
in the writing order each kind belongs, how to move it half a step, and how the choice is
recorded so the review page shows it. It is writing guidance: no score, no quota, and zero
clichés is a valid result.

## Contents

- [When an episode uses them](#1-when-an-episode-uses-them)
- [Pick by need](#2-pick-by-need-not-by-fame)
- [Three places in the writing order](#3-three-places-in-the-writing-order)
- [Half a step](#4-half-a-step)
- [Defaults the research set](#5-defaults-the-research-set)
- [Recommend, then apply what the user picks](#6-recommend-then-apply-what-the-user-picks)
- [Record and display](#7-record-and-display)
- [Other languages and cultures](#8-other-languages-and-cultures)
- [Evidence and limits](#9-evidence-and-limits)

## 1. When an episode uses them

| Mode | Episodes | What the author does |
|---|---|---|
| `apply` | video type `drama` or `comedy`; a `custom` type whose detail names a drama, romance or comedy and no documentary; any type once the channel saved `production.clicheUse: "on"` | Makes the cliché pass while casting, writing the synopsis and writing scenes, and records the result |
| `offer` | every other type | Recommends a cliché where one would help and applies only what the user picks (§6) |
| `off` | the channel saved `production.clicheUse: "off"` | Applies none unless the user asks for one in this episode |

Romance has no video type of its own: a romance saved as `drama`, `comedy` or a `custom`
type that says so is in `apply`. A documentary hybrid stays in `offer`, because a
reconstruction of recorded events is not the place for an invented device.

Order of precedence: what the user says about this episode, then the channel's saved choice,
then the type. A type change for one episode, which the user asks for and which is recorded
under `PRODUCTION.modelSettings.overrides` ([model settings](../../_shared/model-settings.md)),
changes the mode with it, and `storyboard_apply` says so (`cliche_mode_changed`). The two
fields differ on purpose: the type is an override the user may ask for one episode, so a
board can change it; the saved choice is the channel's, so a board keeps the value its
snapshot took (`cliche_choice_kept`). Read the mode from the report of `story_cliche {path}`. Before a board exists
(a synopsis-only request), read the saved type and choice with `project_manage status` and run

```bash
node "$CLAUDE_PLUGIN_ROOT/skills/storyboard/references/cliches.js" mode drama
node "$CLAUDE_PLUGIN_ROOT/skills/storyboard/references/cliches.js" mode custom "로맨스 숏폼" --saved off
```

A board written before this record existed is not asked to go back: only a new episode board
in `apply` starts with an open record that every board write reports as undecided.

## 2. Pick by need, not by fame

Name what the story is missing, then ask for candidates that do that job. The catalogue is
never read whole: the list is long, and read top to bottom it yields the same five famous
entries every time.

| Need | The job |
|---|---|
| `meet` | brings two people together for the first time |
| `bind` | keeps people in one space or relationship so they cannot walk away |
| `obstacle` | blocks the relationship or the goal from outside |
| `secret` | creates an information gap: a secret, a hidden identity, a misunderstanding |
| `reveal` | makes the secret come out or turns the situation over |
| `parting` | causes separation or loss |
| `reunion` | brings people back together or restores what was lost |
| `closeness` | shows affection, care or growing intimacy through an act |
| `outburst` | makes anger, shock or grief physical |
| `status` | shows power, wealth, rank or standing at a glance |
| `payback` | delivers revenge, comeuppance or a reversal |
| `danger` | puts life, safety or position at risk |
| `rule` | a genre premise or supernatural rule the story runs on |
| `setting` | tells where and in what situation we are at once |
| `closing` | how an episode or story opens or closes |
| `relief` | releases tension or gets a laugh |

```bash
C="$CLAUDE_PLUGIN_ROOT/skills/storyboard/references/cliches.js"
node "$C" needs                                      # this vocabulary, the layers and the genres
node "$C" pick --need obstacle,reveal --genre romance --seed <topic> \
     --episodes data/<channel>/episodes --except data/<channel>/episodes/<topic>/storyboard
node "$C" show 45                                    # one entry in full: example works, evidence
```

`pick` needs at least one `--need`. `--genre` and `--layer` narrow it. A genre says where a
cliché usually appears (romance, family, sageuk, crime, legal, medical, office, revenge,
school, fantasy, horror); comedy is not one of them, because a comedy takes a cliché from
any of these and breaks it, and `relief` is the need for a laugh. `--genre comedy` is
accepted and narrows nothing. `--seed` (the episode's
topic) varies which candidates come up, so two episodes do not start from the same list;
`--episodes` leaves out what the channel's earlier episodes already applied, and a path
that is not a directory is an error. It prints
twelve candidates by default (`--limit` changes that), grouped by need, each with its number, layer, the step that chooses
it and a one-line description. Entries marked caution and production-practice entries are
left out (§5), and the first line says how many.

Choosing none is a decision too. When no candidate fits, write the moment without one and
record `none` with the reason, or record nothing for that slot. A cliché you know that is
not in the catalogue is recorded by name, without an id.

## 3. Three places in the writing order

Each layer is chosen at the step that can still absorb it.

| Layer | Step | Where it lands |
|---|---|---|
| `character` | Casting (§1 of the skill), before the story | The cast member's role and want in `identity.md` and `cast.json`; recorded with `character` |
| `device`, `format` | Synopsis (§2) | The causal skeleton in `scenario.md`; the sequence `question` and `payoff` it feeds |
| `scene`, `place`, `line` | Scenes and lines (§3) | `story_scene` summaries, `story_shot` stories and `shot_dialogue` lines; recorded with `scenes` |
| `directing` | Shots (§4) | `shot_icons` size, angle, move and `next` |

- **Casting.** A character type is chosen with the cast, because the cast comes before the
  story and a serial's canon cannot take a birth secret added three episodes later. Give the
  type a specific want; the type is the outline, not the person.
- **Synopsis.** Once the causal skeleton holds and [story interest](story-interest.md) is
  read, name the slots the skeleton leaves generic — why these two keep meeting, what stands
  between them, how the hidden thing comes out — as needs, and pick for each. A `secret` or
  `reveal` entry feeds the question the sequence holds open and the scene that answers it. On
  a channel that opens on a provocative event and rewinds, a familiar moment with one thing
  wrong makes the opening read at once. The opening plan itself follows
  [opening by format](opening-by-format.md).
- **Scenes.** A place or a staged moment the viewer knows saves the seconds an explanation
  would take, which matters most in a short. The speaker rules stand: one speaker per shot, at
  most four principal characters, and a line pattern borrowed from a cliché still has to be
  the line this character would say here.
- **Shots.** A directing cliché becomes ordinary shot attributes. Nothing is drawn over video
  and delivered video has no subtitles, so a cliché that depends on a caption or a mark is
  rewritten as picture and speech or dropped.

## 4. Half a step

Keep the frame the viewer recognises and move one property of it. The four that move most
cleanly:

- **who does it** — the person the viewer expects to hold the envelope is the one who is handed it;
- **what it costs** — the rescue works and the rescuer loses the thing they came for;
- **when it happens** — the confession the form saves for the end is said in the first scene;
- **who knows** — the listener already knew, and was waiting to see whether they would be told.

One move, not two. A whole step — a new rule, an unexplained term, a premise that needs its
own setup — spends the seconds the cliché was supposed to save. Write the move in `shift`.
A cliché played as the catalogue describes it is valid, and for `place` and most `scene`
entries it is the usual case; leave `shift` out then.

Three checks keep the cliché from standing in for the story:

1. A cliché's name is how you found the moment, not why the scene exists. `necessity` still
   answers what later choice, discovery or consequence loses its basis without this beat. In
   `scenario-v2` beats, `expectation` holds what the cliché makes the viewer expect and
   `change` holds the shift; neither field takes the cliché's name.
2. The device is paid for like any other event: a secret has someone it serves and someone it
   costs, and a coincidence that helps the characters happens once, early.
3. In comedy the cliché is the setup. Establish the familiar pattern and let the last action
   break it.

## 5. Defaults the research set

- **Narrative devices are on.** Birth secrets, amnesia, class gaps, childhood ties and first-love
  reunions are the entries that kept returning: they read through subtitles, and romances built
  on them charted abroad in 2025–2026.
- **Caution entries are off.** `coercion` marks contact or pursuit without consent staged as
  romance (the wrist pull, the forced kiss, the wall pin), which Korean critics named in 2016,
  the broadcast regulator cited in 2017 and overseas fans listed as tropes to retire.
  `violence` marks graphic or sexual violence of the kind the regulator sanctioned. `pick`
  leaves them out; `--include-caution` is for a story that treats the act as wrong, or for a
  user who asked. `story_cliche` records one with a warning and never refuses it.
- **A quoted line gives its pattern, not its words.** An entry marked as a line from a named
  drama is a shape — a blunt offer, a command phrased as care. Write a new line in that shape.
- **Production practice is not story material.** Entries about episode counts, product
  placement or last-minute scripts explain why clichés persist; they are never candidates.
- **Repetition is reported.** `story_cliche` names an entry an earlier episode of the channel
  already applied. Keep it when the series runs on it; otherwise pick another for the same need.
- **Evidence levels are for facts, not for use.** An entry found only on a wiki or a fan list
  is still usable in a story. Do not present an example work or a year marked † to the user
  as a checked fact.

## 6. Recommend, then apply what the user picks

In `offer` mode a cliché enters the story only by the user's choice.

1. **When to recommend.** The episode has an acted moment and the scenario leaves one of the
   needs in §2 generic — an acted scene in an advertisement, a narrative thread in a vlog or a
   music video, a custom hybrid. A claim-led explainer, tutorial or review with no acted scene
   gets no recommendation.
2. **How.** Pick as in §2 and record the candidates with `offered: true`. Present one to three
   of them with the scenario: the need, the cliché, and what it would change in the story.
   This is part of the scenario presentation, not an approval pause: writing continues
   without them.
3. **Applying.** When the user picks one, or asked for clichés in the request, write it into
   the story and record it with `basis: "user"`. Never pass `basis: "user"` for a choice the
   user did not make; an applied use without it is refused on an `offer` or `off` episode
   (`cliche_user_choice`).
4. **Unattended runs.** There is no user to pick, so record the offers, apply none and list
   them in the run report.
5. **A standing choice.** When the user says how the channel should handle clichés from now
   on — always, or never — save it in the same turn with `project_manage update` as
   `production.clicheUse` (`"on"` or `"off"`), resending the other `production` fields
   ([model settings](../../_shared/model-settings.md)). A new episode's board carries it in
   `PRODUCTION.clicheUse`, and `storyboard_apply` keeps that value when it patches
   `PRODUCTION` (`cliche_choice_kept`): the choice changes in the project settings, not on
   a board. In `apply` mode the user can still decline one episode: record `none` with that
   reason.

## 7. Record and display

`story_cliche` writes the record once the board exists (after the first `story_sequence`) and
again when scenes are written.

```json
{ "path": "…/storyboard",
  "uses": [
    { "id": 45, "scenes": [3], "shift": "the envelope is handed to the mother, not by her" },
    { "id": 228, "character": "jun" },
    { "name": "the borrowed umbrella returned years later", "need": "reunion", "scenes": [7] }
  ] }
```

- `id` is the catalogue number; `name` is filled from the catalogue in the story's language
  and is required for an entry outside it. `need` defaults to the entry's first need. `name`
  (120 characters), `shift` and `none` (300 each) are short plain text.
- `scenes` attaches a use to scenes and `character` to a cast member. A use recorded at the
  synopsis has neither yet; send it again with `scenes` once they exist.
- A use sent again keeps the fields you omit, except `offered`, which is stated on every
  write: leaving it out records the use as applied.
- `remove` drops uses by id or name; a catalogue entry's name removes that entry. To take a
  use off its scenes, remove it and record it again. `none` with a reason records that the
  episode uses no cliché and replaces the list.
- Called with `path` alone it reports and writes nothing.
- `story_cliche` is the record's only writer. `storyboard_apply` refuses a `globals` patch
  that changes `CLICHES` (`cliche_record`); a board written back whole with the block
  unchanged passes.
- Warnings carry codes: `cliche_undecided`, `cliche_unpicked`, `cliche_caution`,
  `cliche_quote`, `cliche_practice`, `cliche_repeat`, `cliche_scene_missing`,
  `cliche_not_recorded`, `cliche_matched` and `cliche_unreadable`. `cliche_unpicked` names a
  use that sits in the story without the user's pick on an episode that only recommends: a
  hand-edited file, or a type changed after the use was recorded. Record it again as
  `offered`, or with `basis: "user"` once the user picked. `cliche_matched` says a name
  spelled a catalogue entry, which is then recorded by its id so its marks and repeats are
  read. `cliche_unreadable` counts entries a hand edit left unreadable; a write does not
  keep them.
- Refusals are `cliche_user_choice`, `cliche_unknown` (no such catalogue number),
  `cliche_need`, `cliche_character` (not in `cast.json`), `story_order` (a scene that does
  not exist) and, on `storyboard_apply`, `cliche_record`. `storyboard_apply` also warns with
  `cliche_choice_kept` and `cliche_mode_changed` (§1, §6).

The record is `window.CLICHES` in `scenes.js` ([scenes schema](scenes-schema.md)). The review
page shows it in two places: a strip above the shots that lists every use with the job it
does, the scenes or character it sits on, the shift, and whether it is in the story by
default, by the user's pick or only recommended; and a lane on each scene that carries a use.
An open record reads undecided, and `none` shows its reason. The page shows what is
recorded: a use with no recorded basis reads "basis not recorded", and a scene the board no
longer has is marked. Names and shifts are story text,
so a review translation covers them like any other line
([review localization](review-localization.md)).

Every board write prints one cliché line in its digest: undecided on a new `apply` board,
then the applied and offered counts, or none with its reason. A scene reference that no
longer exists and a use without the user's pick each add a line. These are counts, not
targets.

## 8. Other languages and cultures

The catalogue comes from Korean drama. The story language rule is unchanged: text is written
in the board's language, and a use recorded without a `name` takes the catalogue's English
name on a board that is not Korean. For a channel in another language or culture, prefer the
`device` layer, which the research found to travel, and check each `scene`, `place` and
`line` entry against what that audience does and says. A cliché from the channel's own
tradition is recorded by name.

## 9. Evidence and limits

- Source: `docs/research/2026-11-18-kdrama-cliches/` — a report of 371 numbered entries with
  their sources, nine research notes and a visual summary. Catalogue ids 1–371 are the
  report's numbers; higher ids are widely known items the research could not source
  (`evidence: "unverified"`).
- The count is a count of recorded observations, not of how often a cliché is used. Of the
  371 numbered entries, 148 rest on an article whose body was opened; the others rest on wiki
  pages, fan lists and search summaries.
- The tags (layer, needs, genres, caution) are this plugin's editorial reading of each entry,
  not something the sources state.
- The half step is a practitioner's stated method (김은숙, 2011 and 2023), not a measurement.
- Nothing here has been measured on our channels: whether an episode with a recorded cliché
  holds viewers better than one without is not known.
