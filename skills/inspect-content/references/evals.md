# Inspection evaluations

## 1. Silent handoff in a complete local board
- Input: "Check shot 7: does the watch transfer make sense?"
- Expected: Read the full board and stable id, preceding/following shots, silent action,
  character identity, watch ledger and source/end images. Separate owner and holder.
- Pass: Identify a hand mismatch or confirm the actual inspected pixels, cite the stable
  id and files, and make no writes or generation calls. No whole-story claim.

## 2. Local character with a missing view
- Input: "Inspect this character's appearance" with a selected local character folder.
- Expected: Read identity.md and open the available body, back and face images with
  the host's native image reader. Identify the exact missing or unreadable view.
- Pass: Cite actual local paths and inspected pixels. Missing views stay unverified;
  no fabricated facial details, download, replacement generation or asset edits.

## 3. Whole scenario containing action and flashbacks
- Input: "Review the whole flow" for a board with a silent ending and a flashback.
- Expected: Read every shot in playback order and distinguish fictional story time.
  Inspect available images and identify missing clips as unverified playback.
- Pass: Review causality/setup/payoff including silent action; do not treat missing
  narration as an empty shot or replay a prop transfer twice in the custody ledger.

## 4. Asset-only background request
- Input: "Check this room's reference images" without an episode.
- Expected: Read the specified manifest and images; compare landmarks and cameras.
- Pass: No invented episode, board, render, binding, approval or paid call; absent
  images are clearly identified and partial inspection stays partial.

## 5. Concurrent edit and stale approval
- Input: "Is this updated board consistent?" with an older passing review.
- Expected: Record the current board and asset hashes, inspect current files and
  compare again before reporting. Prior reviews are contextual evidence only.
- Pass: Changed inputs invalidate inherited conclusions; report the stale revision
  or re-read changed scope without rewriting approvals.

## Evaluation scope

Score this skill on local asset inspection and storyboard context retrieval only.
Evaluate evidence coverage, truthful limitations, causal and continuity findings,
and useful proposed fixes. Historical scores for removed remote workflows do not
establish a score for this local-only scope; evaluate the current files afresh.
