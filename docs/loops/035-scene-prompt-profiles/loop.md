# Scene prompt profiles

Evaluate the storyboard author's normal path to a model-specific prompt for one complete scene. The acceptance threshold is 95/100, zero critical findings, a green server check and passing skill lint. The score measures the implementation and its contracts. Voice fidelity and visual quality require separate listening and viewing.

| Criterion | Points | Evidence for full credit |
| --- | ---: | --- |
| Storyboard entry and scene scope | 25 | The selected model drives one authoring workflow for a complete scene. An ordered shot or dialogue edit influences the prompt. A missing capability is surfaced before execution. |
| Model and operation specificity | 25 | LTX MSR and supplied audio, FastH3 and hosted H3, Veo and both Seedance reference dialects produce distinguishable, accurate directions. Verify the behavior through normal planning. |
| Dialogue and media fidelity | 25 | Preserve approved words, speaker identity, scene ordering and named media. Reordering media and adding a video soundtrack preserve valid reference bindings. Unsupported references fail explicitly. |
| Preview and execution | 15 | Inspect the actual provider payload and test submitted-versus-previewed text, including an explicit author edit. One logical scene results in one provider request. |
| Regression coverage and documentation | 10 | Exercises adversarial fixtures, includes negative cases, keeps existing model selections working and documents reproducible usage. |

For each criterion the verifier awards points for reproduced behavior and identifies missing evidence. A silent speaker or reference swap, a hidden provider switch, an automatic scene split or submission of a different prompt from the approved preview is critical. Each verification uses a fresh reviewer and the same rubric.
