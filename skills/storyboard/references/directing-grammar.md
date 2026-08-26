# Directing grammar — feel first, then the technique (SoT)

**What this file owns.** For every shot the storyboard writes down **what the audience should
feel or understand at that moment** (`shot.feel`), and only then picks the technique that serves
it — the shot size, the camera height, the frame space (what is where, which way it faces), the
move (on generated video), the cut length, and what the shot sounds like. This file is the source
of truth for that mapping: feel → size · angle · space · move · length · sound.
`../../produce/references/video-model-selection.md` §Camera stays the source of truth for
**engine vocabulary and routing** (which word each vendor understands, moves per cut per model);
`scenes-schema.md` owns the field contract. When the three disagree, the field contract wins on
shape, this file wins on "which technique", the engine file wins on "which word".

**Why feel comes first.** A camera choice made after the picture is a label, not a decision. The
lesson the sources repeat in different words: the size is the audience's distance from the
person, the angle is the seat you put the audience in, and the audience never notices either —
they just feel "lonely", "he's dangerous", "I'm in the room". Written down first, the feel tells
you which of the four dials to turn; written down after, it only explains what you already did.

**And in short-form the dials serve the drop-off curve, not the look of the panels.** The
variable the storyboard manages is stop · hold · satisfy · act (scenes-schema §playback order)
— the first frame that stops the thumb, the hooking that holds it, the result that pays the
promise (on a story arc, the payoff after the turn). A size or an angle is picked because it makes the viewer feel what that beat needs,
and a "cinematic" choice that doesn't serve the beat is a choice against the episode.

**Evidence grades.** Every row carries one of three marks. `[study]` — a peer-reviewed
measurement, cited in
[the camera research](../../../docs/research/2026-08-15-ai-video-camera-technique/index.html).
`[course]` — a craft rule from a filmmaking course or a practitioner's guide. `[vendor]` — the
engine's own documentation. A `[course]` rule is the craft consensus, not a measurement — it
tells you what most crews do, and it is the right default until a `[study]` row says otherwise.

Sources: the film-directing daily course, lessons L01–L06 (shot units · shot sizes ① ② · camera
angles · the 180° rule · the 30° rule, sent 2026-08-16 ~ 2026-08-21); "AI 영화 제작 가이드 —
AI 영상 퀄리티 3배 높여주는 8가지 비법" (AI Astra, YouTube `sHs0_iZJxHk`, 2026-08-21 — chapters
카메라 개요 · 무브먼트 · 앵글 · 특수기법 · 프레이밍 · 듀레이션); Higgsfield Academy's
movie-making track, 7 courses / 75 lessons (read 2026-08-24 — §9); the camera technique research
above (the `[study]` rows).

---

## 1. Four dials, four fields — never merged

| Dial | The question it answers | Field | Applies to |
|---|---|---|---|
| Size | Where does the frame cut the person — how far is the audience | `shot.size` | every shot |
| Angle | Where does the camera sit against the subject's eyes — which seat the audience gets | `shot.angle` | every shot |
| Space | What is where in the frame, and which way each thing faces | `shot.space` | every generated still; filmed shots when two people, or a person and what they look at, share the scene |
| Move | What the camera does while the shot runs, and where it stops | `visual.camera` (four slots) | generated video, and the still lane — a still's movement word picks its Ken Burns move (§4 still lane, §5 Still column) |

Size, angle and space are separate axes — size and angle `[course]`, space `[study]` (§3.5).
Keep the medium close-up and the eye level and move the person from the left third to the
right: only the space changed. Keep the person on the left at eye level and cut from a wide to
a close-up: only the size changed. Move is a fourth axis that only runs while the shot runs. Write them in their own fields so each can be judged, reused and
regenerated alone. `shot.feel` sits above all four: it is the reason they were set the way they
were.

`shot.info` and `shot.feel` are different lines — **`info` is what the viewer newly learns,
`feel` is what the viewer should feel.** "That the install is one command" is info; "relief — it
really is that short" is feel. Scene mode keys coverage on `info`; camera mode keys technique on
`feel`.

---

## 2. Size — the audience's distance

The measure is one thing: how much of the frame's height the person takes `[course]`. Far makes
the audience an observer, close makes them a participant. Wide shots carry information (where,
how many, how far apart); close shots carry feeling. Both jobs sit on the same dial.

| `shot.size` | Name (on set) | Frame bottom / what's in | What it tells or makes the audience feel | Default use | Phone distance (standing adult) | Sound that matches |
|---|---|---|---|---|---|---|
| `els` | extreme long shot (완전 풀) | person under 1/10 of the height — the place is the subject | alone · powerless · the world is big · **or** scale when the frame holds many people | openings, endings, "nobody here" | 20 m or more | space (wind, traffic, echo) loud; no human voice needed |
| `ls` | long shot · wide (와이드) | full body with room above and below, ~½ the height | where we are, how many, how far apart — the **establishing** job | the first shot of a scene; situation explanation | 5–6 m — walk, don't zoom | space forward; lines may be faint |
| `fs` | full shot (풀숏) | head to toe, almost no slack, ~90 % of the height | the whole body's action — walk, gesture, costume | action and movement starts here | ~3 m | balanced |
| `mfs` | medium full · knee shot (니숏, "cowboy") | bottom at **mid-shin** | two people talking, body plus a bit of room | two-person dialogue | — | balanced |
| `ms` | medium shot (미디엄) | bottom at **mid-thigh** — never the waist | relation, gesture with context — the dialogue default. When in doubt, start here | dialogue, explanation with hands | — | lines clean, space behind |
| `mcu` | medium close-up · bust shot (바스트) | bottom at **mid-chest** | face and hands together — the last size that shows both | news, interview, **talking-head speech, the hook cut** | — | voice clean, space well back |
| `cu` | close-up (클로즈업) | shoulder line at the bottom, **crown lightly cropped**, almost no headroom | "look at this now" — the director's command; the emotion workhorse | the one line that matters in the scene | step back 1.5–2 m and use the 2× tele — never lean in | voice and breath forward |
| `choker` | choker | forehead to chin | emotion at its peak | once, at the peak | — | breath forward |
| `ecu` | extreme close-up (완전 붙여) | eyes only, mouth only, fingertips | detail, the peak of tension | once or twice per episode | — | the detail's own sound |
| `insert` | insert (인서트) | an object, a hand, a screen — no face | the one thing that matters; one insert replaces three lines of dialogue | "the phone is ringing" | — | the object's sound |

Compositions that ride on top of the size — write them in `shot.size` when they say more than the
distance does: `two` (two-shot), `three` (three-shot), `ots` (over the shoulder), `pov` (the
character's eyes — hands enter the lower frame, no face), `back` (from behind — the face withheld),
`cutaway` (away from the action to something in the scene), `reaction` (the face that saw it).
`ws` is the legacy key for `ls` and still renders.

Rules that come with the dial `[course]`:

- **Don't cut at a joint** — not the neck, wrist, elbow, waist, knee or ankle. Cut mid-chest,
  mid-thigh, mid-shin. A joint cut reads as a severed body; a between-joints cut reads as a body
  continuing off-frame. It is the cheapest difference between an amateur frame and a pro one.
- **A close-up is made by stepping back and pulling in with the lens**, not by putting the camera
  at the face. 30 cm away the nose and forehead bulge. On a phone, 1.5–2 m and 2×; on a camera,
  ~85 mm full-frame is the convention.
- **Establish, then go close.** Lay the place and the head count with a long shot, then move in.
  Once the audience carries the room in their head, close shots can follow each other without
  anyone getting lost. If you open on a close-up anyway, **pay the debt in the next shot** — a
  wide or a medium that says where we are.
- **The close-up is a command, and a command repeated stops being heard.** One close-up (`cu`, `choker` or `ecu`) per scene
  on the one line that matters; `choker`/`ecu` once or twice in the whole episode. A run of faces
  is a run with no emphasis at all. `[study]` agrees in shape — close-up frequency is an inverted
  U (three was the peak; more did worse), and the measured effect was narrow (spontaneous talk
  about the character's inner state — not emotion, not comprehension).
- **Wide holds longer than close** — at least 1.5× (an insert at 3 s → the wide beside it at
  5 s; a shock close-up at 4 s → the establishing shot at 6 s or more; a line on a face at 7 s →
  the wide beside it at 10–11 s, which is the long-take row — so a face held 7–10 s sits next to
  a wide that runs long, or the face gets shorter). A wide frame takes longer to read because
  the eye has more to sweep; a close-up carries one piece of information and can be short. On
  generated clips the §cut length rows and this ratio both bind; on a filmed shot only the ratio
  does — a filmed scene has no cap (scenes-schema §filmed scenes), so its wide is judged against
  the close beside it, not against the table; a narrated still keeps the speech math
  (characters ÷ 4.5).
- **Sound follows the size.** Wide → space loud and lines distant; close → lines and breath
  forward. A wide shot with studio-clean dialogue reads as fake without the viewer knowing why;
  a close-up with distant sound reads as "something's off". Write it into `visual.audio` on
  generated shots and let the builder's mix follow on filmed ones.
- **Don't fake a wide by zooming out in a small room** — the frame size is right and the space
  goes flat. If you can't step back, stop at `fs`.

---

## 3. Angle — the seat you give the audience

The baseline is **the subject's eyes**, not the floor `[course]`. Standing adult ~150–165 cm,
seated on a chair ~110–120 cm, seated on the floor ~80–90 cm — the moment the subject sits, the
same tripod height becomes a high angle.

| `shot.angle` | On set | What it does | Grade |
|---|---|---|---|
| `eye` | 아이레벨 | the conversation seat; **the most trusted height for someone speaking to camera** | `[study]` eye level vs low p=.007 in 15 s talking-head clips; vs high only a trend (p=.082) |
| `high` | 부감 · 하이 | the camera above the eyes looking down — the subject shrinks and the **surroundings come in** (the small room, the crowd, the alley with no exit). Powerless · isolated · watched | `[study]` high→eye→low: bigger, stronger, bolder on all five scales, p<.001 — likability does not move |
| `low` | 앙각 · 로우 | the camera below the eyes looking up — the **comparators disappear** (sky, ceiling), the subject grows. Imposing · hero · dangerous. Pairs with a wide lens (phone 0.5×) | same study |
| `overhead` | 탑샷 · 버즈아이 | straight down, 90° — people become pieces on a map. Summary · fate · the whole situation in one frame | `[course]` |
| `dutch` | 더치 · canted | the horizon itself tilted (5–20° by convention, no fixed value). Something is wrong · drugged · lied to | `[course]` |

Rules `[course]` unless marked:

- **"High = weak, low = strong" is half the story.** What the angle changes is **how much
  information is in the frame** — high brings the surroundings in and that is what makes the
  person small; low removes the comparators and that is what makes them big. Know the
  mechanism and the exceptions follow: a high-angle subject who fills the frame alone does not
  read weak.
- **An angle speaks when it changes, not when it sits.** Eye level for the scene, then high at
  the moment the person breaks — the audience reads "broke" off the screen. A scene that is
  high-angle from start to end says nothing.
- **Dutch has a usage fee.** It lands once — "something's wrong" — and then the eye accepts the
  tilt as the new horizon and the feeling is gone; what's left is a crooked frame with no
  reason, which is what reads as cheap. **One dutch per episode, with the reason written in one
  sentence on the shot.** If the sentence won't come, the shot isn't dutch.
- **Hook cuts and speech clips stay at eye level** unless the storyboard writes a reason —
  before the narrative is established the trust axis wins, and news keeps eye level for the
  same reason (looking up or down at an interviewee is itself a bias). `[study]`
- **Design the vertical first and the angle follows** — who is above and who is below in the
  space decides the camera height on its own (the Parasite staircase, the toilet as the
  highest point in a flooded room). Don't pick "low angle here" as decoration.
- Put the angle's words into the picture prompt too (`bgPrompt`: "eye level", "seen from
  above", "low angle, looking up") — the still is where the height actually gets drawn.
  `assemble-bg-prompt.js` writes those words for you; don't type a competing height into the
  scene sentence.

---

## 3.5 Frame space — what is where, and which way it faces

Size is how far the audience stands. Angle is the seat. **Space is the floor plan of the
frame** — who sits on which side, which way they look. The still is where all three get drawn.
Leave space unwritten and the image model invents a layout from mention order (the first noun
lands on the left) and from an egocentric prior (everything faces the camera, so "its right"
comes out as the camera's left). `[study]` GenSpace (NeurIPS 2025 Datasets and Benchmarks
track, arXiv:2505.24870): GPT-4o image generation scores 59.4% on simple front/back/left/right
views, 21.2% on object-centric left/right, and metric distances ("1.5 m apart") do not move
the picture.

The field is `shot.space`. `scenes-schema.md` §frame space owns the shape; this section owns
the words that go into the still.

```js
space: {
  frame:  "camera",                                          // the only allowed value
  layout: "person on the left third, kitchen door on the right",
  facing: "person faces camera-right, three-quarter view",
  line:   "A left, B right",                                 // 180° lock — two people, or a person and what they look at
  light:  "key from camera-left"                             // optional
}
```

**The reference frame is the camera, always.** "Left" means left of the picture. Models handle
egocentric relations almost perfectly and invert allocentric ones (the object's own left/right)
because they default to drawing the subject facing the viewer. Do not ask the model to sit in
the object's shoes.

Write the **visible result**, not the camera's inferred seat:

| Don't write (the model has to infer) | Write (what the picture should show) |
|---|---|
| `left view of a car` / `right view of X` | `the car faces left of frame` / `X facing the camera` |
| `from the car's right door` | `from the camera, the right-hand door is on the right of frame` — or pick a different shot |
| `1.5 m apart` / `from 3 meters` | the size dial (`ls`, `fs`) — distance is how much of the person fills the height |
| `a boy and a girl chasing` with no layout | `from the camera: the boy on the left, the girl on the right, he faces her` |

Mention order is not a layout. Without `layout`, "a boy is chasing a girl" locks the picture to
the mention order — the first name tends to land on the left. The paper's order-locking index
is 86.4 for GPT-Image and 81.0 for Nano Banana on a 0–100 scale (|2p−100|, p = the share placed
left), so roughly nine valid outputs in ten put the first-mentioned entity on the left
(Order-to-Space Bias, arXiv:2603.03714, 2026). Name the sides.

**Two people, or a person and what they look at, lock a line.** The 180° sentence from §7
(`A left, B right`) belongs in `space.line` **and** in the still, so the generated picture
agrees with the shooting script. Keep that sentence true on every shot of the scene. Crossing
it is the same four legal cases as §7.

**Image→video does not rewrite space.** The still already drew the floor plan; a motion prompt
that re-describes people, sides, or lighting makes the engine redesign the scene (produce
absolute rule 8 · content-reviewer plan P0-7). The clip inherits `space` from the PNG. A
quote speech clip has no still, so its prompt carries the `From the camera: …` sentence
(`assemble-bg-prompt.js --space-only`) — the size and framing come from the produce quote
contract, not from here.

**Assemble, don't prose.** `assemble-bg-prompt.js` writes the prompt in this order
— size words, angle words, `From the camera: layout. facing. line. light.`, then the scene,
the mood, the exclusions (`--exclude` — the image tools have no exclusion argument, so the
noun list rides in the body) and the fill-the-frame tail (owner 2026-08-25 — no
letterbox or lower-third fade). On a still with nobody in it,
`--no-person` swaps the size ladder's body words ("full body", "chest up") for the subject's.
storyboard §5 runs it before the generation call and stores the full stdout as `bgPrompt`.
Hand-written prefixes that fight the fields are a camera-mode finding.

Rules:

- **`frame` is `camera`.** Any other value is unset.
- **`layout` names sides from the camera.** `left third` · `right of frame` · `centred` ·
  `behind her, receding`. Empty on an `insert`/`ecu` that fills the frame with one object is
  fine; empty on a cover or a two-shot is a gap.
- **`facing` is what you would see.** `faces the camera` · `faces camera-right, three-quarter` ·
  `seen from behind, face turned away` (the cover's person-contract wording). `left view of`
  and `front view of` are camera-inference and fail the assembler.
- **`line` is the 180° sentence.** Required when two people (or a person and what they look at)
  share the scene; omitted on a single-subject shot.
- **`light` is optional** and uses the same camera frame (`key from camera-left`, shadow
  falling right). Directional light is one of the few spatial cues the still actually keeps.
- **A room is drawn from three-quarters** `[course]`. Ask for a place head-on and the model has
  no reference for what sits where — the walls flatten into a backdrop and the furniture loses
  its distances. Turn the camera so two walls show at once and it reads the real gaps between
  chair, table and window. Put `shot.space.layout` on a three-quarter footing whenever the
  subject of the still is the place itself (`ls` establishing shots, `points` backgrounds with
  no person): *"three-quarter view of the room, two walls visible"*. It is the cheapest depth
  in the pipeline. A person in frame doesn't need it — the size dial already does that work.
- **Name the palette in the prompt, not in the grade** `[course]`. "Moody" and "cinematic"
  give the model nothing; three named colours do — *cool floodlight white, muted grass green
  (never neon), deep blue-black night sky*. Do it when a scene changes place or time (a
  flashback, a cut to night), and write the reason from the episode rather than from taste: the
  night stadium is dark because the story is a drama and the action happens at night. Belongs in
  `bgPrompt`'s mood text, alongside the theme colours the profile already fixes.
- **No metres, no allocentric, no camera-view phrasing** — the assembler exits 1 on those
  three anywhere in the assembled prompt (the scene and mood text included): `left view of` ·
  `from the car's right door`, `from X's left`, `to her right` · `1.5 m`, `three meters away`.
  `from the camera's right` is the camera frame and passes. Distance lives in `shot.size`;
  object-centric left/right is redrawn as a camera-frame result, or the shot is recut.

---

## 4. Move — what the camera does while the shot runs (generated video)

`[vendor]` + `[course]`. Moves live in `visual.camera` — `movement` (one move, or `static`),
`speed`, `framing` (what is held), `end` (where it stops). The move is written in the engine's
own word (video-model-selection §Camera is the vocabulary table); below, each move is listed
with the feel it serves. **A move supports the feel; it doesn't carry it alone** — the only
measured effect of a move was immersion, and only on cuts whose character wasn't set yet
(valence χ²=0.84, p=.84 · arousal p=.21 `[study]`). Size, angle, the picture itself and the
sound do the carrying; the move is what makes the audience feel they are moving with it. The
finding is a move that **contradicts** the declared feel, or a feel that was left to ride on the
move while the other dials stayed at their defaults.

| Bundle | Move (vendor word) | What it serves | Note |
|---|---|---|---|
| approach | `dolly in` | realisation · awakening · attention closing in on one thing | the camera passes through the space — fore and background flow at different speeds |
| approach | `zoom in` (lens only, slow) | pressure · quiet tension — the space compresses behind the person | not a dolly: the frame scales, the background presses onto the back |
| approach | `dolly zoom` | shock · the ground falling away — the person's size holds, the background stretches | two actions in one: the vendor table's exception. Once per episode |
| rotate · travel | `arc shot` | a first appearance · explaining the space around one person in a single move | not `orbit` (0 hits in the Veo text) |
| rotate · travel | `tracking` (follow, from behind, shoulder height) | immersion — the audience stands behind the character; moving, chasing | the most immersive of the set |
| rotate · travel | `tracking` (reverse — ahead of the subject, retreating) | walk-and-talk | keep the face framed in `framing` |
| rotate · travel | `truck` (side tracking, parallel) | the rhythm of travel — profile held, fore and background at different speeds | |
| rotate · travel | `whip pan` | a transition by camera · impact | a smear; pairs with a hard sound. Same size at both ends — see below |
| height | `pedestal up` / crane up | closing a scene — the person shrinks as the frame rises | endings |
| height | `dolly out` + rising (drone pull-back) | scale — the person stays centred, the space keeps widening | two moves; write the reason beside it, or pick one |
| height | `static` at `low` / `high` / `overhead` | see §3 — the angle does the work and the camera stays still | `static` is a decision, not an empty slot |
| viewpoint | `handheld` | presence · unease · the documentary feel — and it cuts the AI look | micro-shake only; it reads real |
| viewpoint | snorricam (camera fixed to the body) | a mind coming apart — the person locked, the world shaking | no vendor row — write `handheld` in `movement` and describe the body-locked frame in `framing` |
| viewpoint | `pov` (in `framing`: hands enter the lower frame, no face) | inside the character | |
| viewpoint | rear / `back` (in `framing`: the back fills the frame, static) | withholding the face — the audience imagines the feeling | a held laugh, a quiet reaction |
| distortion · focus | rack focus | hidden information revealed — the camera doesn't move, the focus crosses from front to back | 3–4 s, the insert length. No vendor row — `movement: static`, the focus shift goes in `framing`/`end` |
| distortion · focus | `dutch` (in `shot.angle`, camera static) | something is wrong | see §3 — one per episode, reason written |
| distortion · focus | push past (dolly through a doorway, a window) | a scene change done by camera instead of by cut | no vendor row (`push` is 0 hits in the Veo text) — `movement: dolly in`, the doorway in `framing`, the far room in `end` |
| — | `static` | the default body register; what every other move is measured against | "not moving" is a choice |

- **One move per cut.** Two moves in one clip make the model hesitate and the frame dither. The
  engine file carries the per-model nuance (the default model teaches combinations; 2.0 asks
  for one) — the storyboard writes one unless a reason sits beside the second.
- **A long take (10 s+) holds one move, no exception.**
- **A whip pan starts and ends on the same size** `[course]`. It is one continuous move, so
  opening on `ms` and landing on `cu` makes it a cut wearing a smear — it reads as an error, not
  a transition. And give the swing a budget in `speed`/`framing`: hold, then the blurred swing,
  then settle on the new subject. Left unspecified, the engine guesses the pacing and cuts away
  before the second face has arrived.
- **Write the camera apart from the scene description.** Camera slots on one side, the picture
  on the other (`bgPrompt` / the motion prompt). Fused into one paragraph, the block has to be
  rewritten for every scene; kept apart, the same camera block travels to the next scene.

### The still lane — the camera the edit fakes `[blog]`

A still costs nothing to move: the builder crops a window out of the picture and drives the
window, and to the audience that IS a camera. The lane has six moves — an eased slow zoom
(in/out, the documentary default: 3.5% over the card, easing on both ends so it starts and
stops like an operated head), a **punch** (the same span landed in 0.4s, then held — the
cover's first-frame movement), a **pan** (the window travels, straight or diagonal, with an
optional zoom drift on top — the classic Ken Burns), a **focus zoom** (the zoom arrives at the
subject instead of the frame's middle — motion that directs attention is the whole point of
the practice), a **handheld drift** (a few pixels of never-repeating wobble — the still
counterpart of the `handheld` row above), and **hold** (no move; a decision, same as
`static`). The storyboard writes the same `visual.camera.movement` words it already knows —
`dolly in`, `dolly out`, `handheld`, `truck` — and produce translates them into this lane
(produce SKILL §6 has the mapping and the knob names).

Two disciplines carry over unchanged. The move supports the declared feel — it never carries
it (the evidence base for stills is practitioner practice, not measurement, so claim even
less). And rationing: most cards keep the alternating default drift; a punch is the cover's
move; drift is spent where presence or unease is the feel, not sprinkled for "energy".

**How hard the window moves follows the beat** `[blog]`. A 46s reference short measured frame
by frame (docs/research/2026-08-26-still-photo-camera-motion) ran every still on one ladder —
the zoom rate tracks the beat's temperature, and the ten-fold spread between rows is what
makes a still read as footage. The storyboard manages it per scene through the still's
`visual.camera`: no camera written = the quiet 3.5%-per-card default; a camera with a `speed`
word puts the card on its ladder row (produce SKILL §6 converts the row to the builder knobs).

| Beat the card carries | `speed` word | Rate | On top |
|---|---|---|---|
| observe · explain (관찰·설명) | `very slow` | ~4%/s | — |
| payoff · conclusion (결론) — usually the longest cut | `slow` | ~6%/s | — |
| action · rising tension (행동·긴장) | `fast` | ~14%/s | accelerates to the cut point (`ease=in`) |
| closing question · shock (CTA·충격) | `very fast` | ~20%/s | accelerates, and the zoom converges on the face (`focus=`) |

A rate past ~6%/s outgrows the builder's default source headroom before the cut ends — the
scene image has to be generated larger (the §6 note). The ration discipline above still
holds: the two accelerating rows are spent once or twice per episode, like the close-up.

---

## 5. Feel → technique — the lookup the storyboard reads first

Write `shot.feel` in the author's own words, then find the closest row. The row is a default,
not a cage — when you leave it, write why on the shot. Length is for generated clips; a filmed
shot takes only the wide ≥ 1.5× close ratio (§2) and has no cap; a narrated still keeps the
speech math. Sound is what goes into `visual.audio` on a
generated shot and into the mix note on a filmed one. The Still column is the same feel
inside the Ken Burns lane (§4 still lane) — produce translates it into build options, and a
scene that doesn't need a move written stays on the alternating default.

| Feel (what the audience should get) | Size | Angle | Move (generated only) | Still (Ken Burns lane) | Length | Sound | Watch out |
|---|---|---|---|---|---|---|---|
| observe · understand the situation (관찰·설명) | `ls` → `ms` | `eye` | `static`, or one slow `truck` | `auto` drift, or a slow `pan` across the scene | 5–8 s | space forward, lines clear enough | the body's default register — don't decorate it |
| scale · how big this is (규모) | `els`/`ls` with many subjects | `high` or `overhead` | `static`, or `dolly out` rising | `out`, or `pan` across the expanse | 5–8 s | space loud | the same tiny person alone means loneliness, not scale — the head count flips the meaning |
| alone · powerless · the world is big (고독·무력) | `els` | `eye` or slight `high` | `static` or slow `dolly out` | slow `out` | 5–8 s | wind, room, distant machine — **no human voice** | Mad Max's cliff: the smallness says the sentence; don't narrate it on top |
| intimate · I'm in it (친밀·당사자) | `mcu` → `cu` | `eye` | `static` or very slow `dolly in` | slow `in`, `focus` on the person | 7–10 s | voice and breath forward, space gone | one close-up (`cu`·`choker`·`ecu`) per scene — spend it on the line that matters |
| quiet tension · pressure (조용한 긴장·압박) | `ms` → `mcu` | `eye` | slow `zoom in` or `static` | slow `in`, `focus` on the person | 7–10 s | room tone, no music swell | a `dolly in` opens the space instead — the wrong approach for pressure |
| realisation · awakening (각성·깨달음) | `mcu`/`cu` | `eye` | `dolly in` | `in` + `focus` at the subject | 5–7 s | the bed drops (`sound.drop`), then the line | |
| loss · letting go (상실) | `ms`/`ls` | `eye` | `dolly out` | `out` | 5–8 s | space rising, no speech | |
| unease · something is wrong (불안·불길) | `ms`/`mcu` | `dutch` (once, reason written) or `eye` | `handheld` | `hold` + `drift` | 5–7 s | room tone, an off sound | the dutch fee — once per episode |
| imposing · hero · dangerous (위압·영웅) | `fs`/`ms` | `low` (+ wide lens) | `static` or slow `dolly in` | slow `in` — the low angle is drawn in the still | 5–7 s | low end forward | `[study]`: bigger and stronger, **not** better liked |
| powerless · isolated · watched (무력·고립·감시) | `ls`/`ms` | `high` | `static` or slow `dolly out` | `out` | 5–8 s | the surroundings' sound | a subject filling a high-angle frame alone doesn't read weak |
| fate · the whole picture in one frame (운명·요약) | `ls`/`els` | `overhead` | `static` | `hold`, or slow `out` | 5–8 s | space | |
| shock · the floor drops (충격) | `mcu` | `eye` | `dolly zoom` | `punch` | 3–5 s | one hit, then nothing | once per episode |
| hidden information revealed (숨은 정보 공개) | two planes, or `insert` | `eye` | `rack focus` / `static` | `in` + `focus` at the detail | 3–4 s | the object's sound | an insert replaces three lines |
| the rhythm of travel (이동의 리듬) | `fs`/`ms` | `eye` | `truck` | `pan` in the travel's direction | 5–7 s | footsteps, passing space | |
| inside the character · immersion (몰입·1인칭) | `pov` or `tracking` from behind | `eye` | `tracking` | `in` + `drift` | 5–7 s | breathing, footsteps | |
| presence · this is real (현장감·실재) | `mcu`/`ms` | `eye` | `handheld` | `hold` + `drift` | 5–7 s | room tone | cuts the AI look |
| trust · a person telling me (신뢰 — talking head, speech clip) | `mcu` | **`eye`** | `static` | `hold` | 7–10 s | voice clean | `[study]` the default for hook cuts and quote clips |
| withhold · let them imagine (감추기·상상) | `back` | `eye` | `static` | `hold` | 5–7 s | no face — the sound does the face's job | |
| transition · impact (전환·타격) | any | `eye` | `whip pan` / push past | `punch`, or a plain cut | 3–4 s | whoosh or a hard cut | |
| closing · the end (닫힘·엔딩) | `els` | `eye` → rising | `pedestal up` / `dolly out` rising | `out` | 5–8 s | space | the person shrinks as the frame rises |
| detail · the peak of tension (디테일·긴장의 정점) | `ecu` | — | `static` | `in` + `focus` | 3–4 s | the detail's sound | once or twice per episode |

Two feelings the table doesn't hold on purpose: "cinematic" and "dynamic" are not feelings —
they are the author asking for a move without saying why. Send those back to the shot and ask
what the audience is supposed to get.

---

## 6. Sequencing and rationing — the rules across shots

`[course]` unless marked.

1. **One shot, one new piece of information** (`shot.info`). Two shots in a scene saying the
   same thing — one can go. 4–6 shots in a dialogue scene; a 35–75 s informational short has a
   floor of two sizes per scene (wide + close). The check that catches a fake: cover the `info`
   lines and read only the sizes, angles and moves down the scene. If every setup shows the
   same thing from the same distance, the scene is one viewpoint chopped into decorative cuts,
   and no wording in `info` will fix it.
2. **Establish, then close.** Long shot first, then in. A close-up opening pays its debt in the
   next shot. A run of close shots with no wide keeps the audience tense and lost at once.
3. **The close-up is rationed** — one close-up (`cu`·`choker`·`ecu`) per scene, `choker`/`ecu` once or twice per
   episode. Everything emphasised is nothing emphasised. `[course]` — the `[study]` inverted U
   agrees only in shape; its peak of three was measured on a long film, not on a 35–75 s short,
   so the counts here are the craft ration, not a measured optimum.
4. **Wide ≥ 1.5× the close** in length — generated clips against the §cut length rows as well,
   filmed shots against the close beside them only.
5. **The angle is a change, not a state.** Plan where the height moves and why.
6. **One dutch per episode, reason written.**
7. **One move per cut; `static` is a choice.** A second move only on Seedance 1.5 Pro (the
   model whose vendor teaches combinations) and only with the reason written beside it
   (scenes-schema §camera). Spend moves on openings and transitions, where the cut's character
   isn't set and immersion is what a move actually raised `[study]`.
8. **Eye level on the hook cut and every speech clip** unless a reason is written. `[study]`
9. **Sound follows size** (§2).
10. **The feel is written before the dials.** A feel written after the camera was chosen is a
    caption for the camera; the review reads it as unset.
11. **A scene keeps its `space.line`.** Two people (or a person and what they look at) lock
    "A left, B right" on the first shot of the scene; later shots of the same `scene` number
    keep that sentence unless a legal 180° crossing is written on the shot (§7 · §3.5).
12. **A story arc moves the size with the tension** (scenes-schema §playback order — cover →
    hooking → body → turn → result). Close on the moment for the cover; wide for the setup,
    which also pays the close-up's debt (rule 2); tightening through the build; the tightest
    frame of the episode at the turn; wide or full at the payoff so the whole thing is seen;
    the cover's frame again at the cta. Derived, not `[course]` — the user-relayed beat table
    (2026-08-23) fixes only the close on the moment and the full shot at the payoff; the
    tightening between them is rules 2 and 3 laid over a rising curve, and the close-up ration
    (rule 3) still holds across the arc.
13. **Give the beat after a jump its own shot.** After a hard cut into a new place, a flashback,
    or a `turn` the viewer has to catch up on, the next line lands rushed no matter how good
    the shot is — the character speaks before the audience has taken in what they just saw.
    Hold one or two seconds first, and hold them in a shot of their own: a reused frame, a
    reaction, an insert. Packing the pause and the line into one cut removes the pause; the
    generated clip plays them as one breath. On our timeline that shot is often free — a frame
    already generated for another scene, re-cut. The same split applies inside a scene whose
    dialogue is dense: separate prompts per beat, then pick the best delivery of each line
    across the batches rather than hunting for one take that nails all three.

---

## 7. Filmed shots — what the shooting script has to say

The user holds the camera, so `script.md` (rendered by `make-script.js`) prints the feel, the
size with its distance, the angle with its baseline, and the sound note per shot. The rules
below are what the script's standing notes carry `[course]`.

- **Distances by size** (standing adult, phone): `els` 20 m+, `ls` 5–6 m, `fs` ~3 m, `cu` step
  back 1.5–2 m and use 2×. Walk to change size; don't zoom.
- **Eye level means the subject's eyes.** Filming a seated person from standing height is a
  high angle 30–50 cm up, and it is why interview subjects look cowed for no reason the edit
  can find. Say the subject's eye height out loud before placing the camera; sit down with them.
- **Don't cut at a joint** (§2).
- **Two people, or a person and what they look at, make a line (the 180° rule).** Pick the side
  before the first shot, say "A on the left, B on the right" out loud, and keep that sentence
  true on every shot of the scene. Crossing it makes two people in conversation suddenly face the
  same way. The four legal crossings: the camera walks across on-shot; the subject moves and
  the line turns; a neutral shot on the line (head-on, or a cut to an object) bridges it; or it's
  deliberate — once or twice in a work, and only when confusion is the point. "The other side
  has the better light" is the mistake that produces two monologues instead of a dialogue — stay
  on the side and move closer or turn instead.
- **Re-filming the same subject: change the angle by 30° or more, or the size by two steps,
  or cut on an action** — a half-step move is the worst of both and the cut jumps. Decisively
  different, or not different at all. (The screencast lane is the exception by design: a person
  talking to camera while the screen rolls is the vlog contract — the flow of speech, not the
  continuity of the frame, governs, so the silence cuts there don't read as jumps.)
- **Sound follows size** — a wide shot may have the room; a close-up needs the voice clean.
  One mic position per sitting; move seats and the join is audible.

---

## 8. Where each value goes

| Value | Written in | Read by |
|---|---|---|
| `shot.feel` | every shot | storyboard.html (the feel line · missing-feel warning), script.md (the `느낌` line), reviewer camera mode (does the technique serve it), image mode (does the picture show it) |
| `shot.size` | every shot | storyboard.html badge · script.md (the `사이즈·앵글` line — size with its distance — and the `소리` line that follows the size) · `bgPrompt` (the size words) · `visual.camera.framing` on generated shots · reviewer camera mode (rationing, establish-then-close) |
| `shot.angle` | every shot (default `eye`) | storyboard.html badge · script.md (the same `사이즈·앵글` line — angle with the eye-height baseline) · `bgPrompt` ("eye level" / "seen from above" / "low angle") · reviewer camera mode (angle as change, dutch fee, hook at eye level) |
| `shot.space` | generated stills (filmed shots when two people, or a person and what they look at, share the scene) | `assemble-bg-prompt.js` (the spatial prefix of `bgPrompt`) · storyboard.html (the space line · missing-layout warning) · script.md (the `자리` line) · reviewer camera mode (banned language, missing layout/facing) · image mode (does the PNG match layout and facing) |
| `visual.camera` | generated shots | produce (assembles the prompt, adds nothing) · reviewer camera mode (slots, vendor words, one move, `end`) |
| `duration` | generated clips · filmed shots | generated clips: the cut-length table (scenes-schema §cut length) + wide ≥ 1.5× close · filmed shots: the ratio only (no cap) |
| `visual.audio` | generated shots | produce · reviewer sound mode (sound follows size) |

The check strip in `storyboard.html` warns on: a shot with no `shot.feel`, a `shot.size` or
`shot.angle` outside the vocabulary, more than one `cu`/`choker`/`ecu` in one scene, more than
two `choker`/`ecu` in the episode, more than one `dutch` in the episode, a close-up opening
(`cu`/`choker`/`ecu`) followed by another close size instead of a wider shot, a generated still
with no `shot.space.layout` (an `insert`/`ecu` that fills the frame with one object is exempt),
a space block written with no `frame` or with a `frame` that is not `camera`, a person on
screen with no `shot.space.facing` (a `pov` is exempt — hands, no face), two people in a scene
with no `shot.space.line` (on a generated still, a filmed shot, or any shot that wrote a space
block), and a space slot or `bgPrompt` that uses camera-inference, allocentric, or metric
language. The language check reads every shot's space slots and `bgPrompt`; the frame check
runs wherever a space block is written; the layout and facing checks run on generated stills.
Warnings, not blocks — the reviewer and the person at the approval step weigh them.

---

## 9. Sources

- Film-directing daily course, L01–L06 (2026-08-16 ~ 2026-08-21): L01 shot · scene · sequence
  (one shot per new piece of information; a close-up opening pays the establishing debt);
  L02 ELS–FS (size = psychological distance; establishing; sound follows size; wide ≥ 1.5×
  close; phone distances); L03 MS–ECU (the close-up as a command and its ration; don't cut at
  joints; step back and use tele; insert replaces dialogue); L04 angles (the seat; information
  amount, not power; baseline = the subject's eyes; angle as change; the dutch fee); L05 the
  180° rule (the line, four legal crossings, "A left, B right"); L06 the 30° rule (jump cuts,
  axial cut, cutting on action, the vlog contract).
- AI Astra, "AI 영화 제작 가이드 — AI 영상 퀄리티 3배 높여주는 8가지 비법" (YouTube
  `sHs0_iZJxHk`, 2026-08-21): camera prompts in four slots (movement · speed · framing · end);
  camera apart from the scene description; 20 moves with the feel each serves, in five bundles
  (approach · rotate/travel · height · viewpoint · distortion/focus); one move per clip; nine
  frame sizes, far = observer and close = participant; the cut-length-by-purpose table
  (scenes-schema §cut length).
- Higgsfield Academy, movie-making track — 7 courses, 75 lessons, read as lesson notes on
  2026-08-24 (`higgsfield.ai/ko/academy/courses?category=movie-making`; the lesson videos
  themselves were not transcribed): Blockbuster 4K · Santiago cinematic · AI VFX on real
  footage · AI animated short · Seedance 4K cinematic realism · evaluating AI filmmaking demos ·
  directing AI fight scenes. The rows this file took from it, all `[course]`: a room is drawn
  from three-quarters; name the palette in the prompt; a whip pan starts and ends on the same
  size and needs a timing budget; give the beat after a jump its own shot; read the camera plan
  with the `info` lines covered. The prompt-side findings (positive locks, reference scoping,
  the batch-failure ladder, sheet lighting, mid-episode state sheets) live in
  `../../produce/references/video-model-selection.md`.
- [AI video camera technique research](../../../docs/research/2026-08-15-ai-video-camera-technique/index.html)
  (2026-08-15): vendor vocabulary (Veo 12 moves, no `push`/`orbit`); move → valence/arousal not
  supported (p=.84 / p=.21), immersion yes (p=.006) on unset cuts; angle → bigger/stronger
  (p<.001), eye level most trusted in talking heads (p=.007); close-up frequency inverted U.
- Still-lane survey (2026-08-25, all `[blog]` practitioner grade — no perceptual measurements
  exist for these, so the still lane claims support-the-feel only): Ken Burns practice
  (Cloudinary · Backstage · Epidemic Sound — 5–15% zoom bands, smooth easing and restraint,
  motion that directs attention rather than decorates); punch-in as the short-form
  attention move (Premiumbeat); handheld shake on stills reading as an operated camera
  (Effect.app); 2.5D parallax as the layered extension of the same idea (Pond5 · Motion
  Array — needs foreground/background separation, deferred to the layer-split lane);
  ffmpeg zoompan integer-truncation jitter and the upscale-first fix (community consensus,
  already in the builder as the 1.5× ZOOM_BASE). The six moves were verified by frame
  measurement on ffmpeg 7.1.1 (easing curve, focus anchoring, punch land-and-hold, diagonal
  travel = W(z−1), drift wobble) before shipping.
  GPT-4o 59.4% on basic front/back/left/right views, 21.2% on allocentric (object-centric)
  left/right, metric distances unused; stating the orientation in the final image ("facing
  right/left") cuts the confusion that camera-view wording ("left view of") causes. Order Is
  Not Layout: Order-to-Space Bias in Image Generation (Zhang et al., arXiv:2603.03714, 2026):
  mention order locks the layout — T2I homogenisation index 86.4 GPT-Image · 81.0 Nano Banana ·
  91.6 Qwen-Image on a 0–100 scale (|2p−100|), the first-mentioned entity tending left.
  `assemble-bg-prompt.js` is the machine form of those two findings.
