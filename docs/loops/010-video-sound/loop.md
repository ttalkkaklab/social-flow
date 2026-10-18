# Model-aware sound loop

User target: select the best model-specific SFX policy, implement it in the plugin,
install on this MacBook, test and improve until an adversarial score is at least 95.
The user delegates choices and explicitly requests iteration to target; no redundant
rubric approval or arbitrary iteration cap is imposed. No publishing or GitHub mutation.

Frozen rubric (2026-10-18):

| Criterion | Points | Evidence |
|---|---:|---|
| Model/mode correctness | 30 | Real adapter schema validation; Veo/Omni native, Seedance version/flag behavior, ASTRA generate versus A2V; explicit intent respected; legacy behavior preserved. |
| Production and assembly | 30 | Authored intent reaches actual request and board; source audio survives assembly; post cues have observed timing; native/input cues not duplicated; missing or incompatible inputs fail clearly. |
| Regression | 20 | npm run check and skill-lint pass; behavioral positive and adversarial tests, actual ffmpeg audio fixtures, no unrelated changes. |
| Installed delivery | 20 | Backed-up Mac installation, source/build/installed hashes, fresh installed execution of planner and audio pipeline, reproducible receipts and honest limits. |

Pass: >=95, no P0, both objective gates pass. P0: broken required execution path,
lost original/user data, silently dropped or duplicated requested audio, unsupported
payload treated as executable, fabricated media quality/review, failing required gates.

Scores assess the plugin routing and tested audio pipeline, not a promise that each
provider generates perceptually perfect Foley. Local fixtures and existing LTX media
can establish signal preservation/timing; do not label them a new Veo/Seedance render
or native listening. Perceptual review stays not_reviewed without actual listening.
Independent read-only verifier sees files, this rubric and test/install evidence only.
Keep each failed evaluation and apply its fix directives before another evaluation.
