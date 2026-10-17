# Speech intent evaluations

## Telephone identification followed by a question

- Input: A police officer answers a call: "경찰서 다나카 경부요. 독립운동가를 잡게 해주겠다고?"
- Expected: Two lines with the same speaker and pinned voice inside one shot. The first
  states the speaker's own identity with a firm falling completion. A listening action
  precedes the second line's restrained confirmation question. Each compiled request
  contains only its line's words and direction; video preserves the same event order.
- Pass criteria: Stable line IDs, distinct actual TTS styles, finite production timing
  and composition preserving listening. On an explicitly requested audio evaluation,
  judge the audible statement/question contrast without inferring it from metadata.

## Several sentences with one sustained intent

- Input: A speaker calmly reassures a friend: "괜찮아. 내가 옆에 있어. 천천히 해."
- Expected: Preserve one line when the writer intends a continuous reassuring delivery.
  Do not create a line or camera cut per period or force each grammatical sentence into
  a different emotion. A deliberate change into a command can instead justify a boundary.
- Pass criteria: Authoring follows scene intent, preserves all words and the pinned voice,
  and uses only the selected adapter's supported controls. No automatic scoring or approval.

## Targeted correction of an existing combined line

- Input: "The self-introduction sounds like a question. Correct its intonation."
- Expected: Find the exact line ID and actual request. Give the statement and question
  explicit scopes in a supported style, or split through storyboard editing while updating
  all affected group references. Do not pretend `speech_manage update` inserts lines.
  Preserve unrelated dialogue/audio and mark dependent speaking video stale.
- Pass criteria: Exact text and voice preserved; generation reflects the new direction;
  old audio cannot masquerade as the revised take. A requested evaluation uses actual
  audio and retains failures; unrequested paid reviews and score-based retries do not run.
