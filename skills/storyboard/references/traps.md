# Traps — what has actually gone wrong on this skill

Read once per episode before §2. Every item here is a mistake that happened, not a
hypothetical; the section that catches each one is named inline.

- **Don't skip a narration read because you think the sentences are fine** — whoever is running
  the skill doesn't get to read their own sentences and call it good. The AI tells in your own
  writing are the ones you see least. The two reads cost a delegation each and read the narration
  inline; run them, every episode.
- **Don't add a reviewer read back to the board.** The copy, scene, camera, sound and image modes
  came out of the flow in 0.50.0 for a measured reason — a read cost 2–8 million tokens and 8–14
  minutes, and an episode ran twenty to sixty of them. The checkers and your own §4.7 · §5
  pass stand there; a mode runs only when the user asks for it by name.
- **Don't chase the number past the cap.** Narration and vocabulary get three reads each; a chain
  still short after three goes back to the scenario, not to a fourth read. Log the reads in
  storyboard.md so the count is written down.
- **Don't reorder §4.4 and §4.5** — the chain first, the words second. A word swap on a sentence
  that is about to move or be cut is wasted work, and the vocabulary read assumes the chain
  already holds. The vocabulary tail's `score` is the lowest sentence's, not the average.
- **Nothing on the board stops on a number.** The narration reads do — a chain below 95 is
  rewritten in sentences, not filed. Findings you decided not to apply, the reviewer's and your
  own, still have to reach the §7 screen in writing.
- **Don't answer a read-through finding with the picture.** "It's on screen" is the failure §4.4
  exists to catch; the fix is a spoken sentence. Self-check from the extract, not from scenes.js.
- **Don't open scenes.js while still searching** — research is two passes with the pick
  in between (§2.1 first research → §2.2 three candidates and the pick → §2.3 additional
  research, then the sufficiency check). Don't start the second pass before the pick. Don't
  offer three wordings of the same question, or three pages with the same primary engine, as
  three candidates. A hook written before the second pass is a promise you don't yet know
  you can keep (user-relayed, 2026-08-23).
- **Don't write the feel after the camera** — a `shot.feel` fitted to a move already chosen is a
  caption, not a decision, and your §4.7 pass reads it as unset. Feel, then size and angle,
  then space, then (on a generated shot) the move and the length. "Cinematic" and "dynamic" aren't feelings
  — they're a request for a move with the reason left out.
- **Don't ask the image model to infer a camera seat.** `left view of X`, `from the car's right
  door`, and `1.5 m apart` are the three forms that fail (directing-grammar §3.5). Write the
  visible result in `shot.space` and run the assembler. A motion prompt that re-describes the
  sides the still already drew redesigns the scene.
- **scenes.js isn't a living file** — after approval it's the settled version produce consumes.
  To change it during production, start from a storyboard revision and re-approval.
- **A profile rule is not episode folklore** — never call it legacy or replace it with a
  convenient format default in `storyboard.md`. When the two contracts disagree, stop before
  authoring and ask which one changes; record that choice in the revised profile or format.
- **A range stays a range** — don't shrink a numeric range to its upper bound alone (this has
  actually happened).
- **No national symbols in images** — flags, national emblems, maps, government buildings, and
  people in uniform don't get generated without prior approval.
- SerpApi counts 1 search = 1 credit (250/month free) — prefer naver_search (25,000/day) and
  WebSearch, and spend serp only on precision searches.
