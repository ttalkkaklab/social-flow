# Adversarial test cases

An independent QA pass exercised isolated drafts through the review API after the initial implementation passed 1,395 repository tests. These cases motivated additional regression coverage.

| Probe | Initial result | Required behavior |
|---|---|---|
| Quote a later paragraph about a broken rivet and mark it as a cue at zero seconds. | The ending appeared in the blind packet. | Only ordered evidence from the actual opening can enter the packet. |
| Give a silent shot an observable first image and a private summary identifying the thief. | The packet revealed the identity. | Credit only the performed or visible evidence. |
| Change a points-card footnote from “Before noon” to “After midnight”. | The text was absent from the packet and its previous pass survived. | Include the visible words and invalidate the verdict after an edit. |
| Delay a two-second line by two seconds or change an original recording's timed transcript. | The review kept the whole line or missed the original recording entirely. | Apply the edit margin, respect the three-second boundary, verify transcript attribution and recompute freshness. |
| After the fifth edit, restore the best visible action while keeping an unrelated render explanation. | The tool rejected the restored draft unless the private explanation was reverted too. | Identify the restored opening by the reviewed evidence and preserve unrelated work. |
| Give two candidates the same hook and select D2 in the scenario file. | Checking only the type could pair the board with D1's receipt. | Resolve the chosen direction from the selected scenario and check it at handoff. |
| Replace the sentence the audience reads on an older, unclassified quote card. | The raw board update changed the entire opening while retaining an absent hook. | Recognize changes to audience-facing copy or performed cues in playback order and enroll the revised opening. |
| Add an untagged post-production bell as the only cue on a speech-only shot. | The source plan would drop the bell but it could earn a passing blind review. | Resolve sound ownership and never score a cue omitted by the episode's audio route. |
| Record three zero-risk votes on an opening whose promised payoff is false. | The public report showed a passing risk score with no evidence or separate validity warning. | Show the real risk result, witness observations and the reason this version cannot be restored. |
| Apply a Reels skip rate to an Instagram Stories audience. | The incompatible source could override the blind risk score. | Require a matching Instagram Reels surface for that metric and keep the editorial result on Stories. |
| Add a weaker editorial-only draft to two measured high-risk drafts. | The added draft could reverse which measured version was best. | Choose a winner on each metric's native scale first, then use the shared editorial score to compare those winners. |

An editorial risk score describes an opening. The implementation score in the verification report is assessed against the frozen rubric in [loop.md](loop.md).

## Live blind synopsis exercise

Six fresh AI reviewer contexts received only a Korean audience packet, its muted vertical-feed playback condition and the same five-item scoring rubric. The audience was people making snacks at home. The first three readers saw a blue title card for three seconds. Each reported that the title offered no clue about the snack or reason to stay. Their risk scores were 60, 60 and 60. The tool returned `high` at the 40-point ceiling and reserved one revision.

The author kept `cause_mystery` and opened the steamer in the first 0.6 seconds. For the rest of the window the viewer saw three rows of dumplings with only the middle row split. Three new readers independently identified the difference and wanted to know its cause. They assigned 0, 0 and 0 risk points. The tool returned `pass` with one edit used and four left. These are judgments of the written opening from AI reviewers. This exercise collected no audience play or skip events.
