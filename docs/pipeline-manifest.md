# Episode pipeline manifest

The plugin derives an episode's stage from its local files. For example, a saved `scenes.js` marks a draft. The storyboard's approval record marks an approved plan. The manifest defines the stage order and the next command to show for each one. [Pipeline definitions](../skills/platform-guide/references/pipeline.js)

| Export | What it describes |
| --- | --- |
| `STAGES` | The ladder from empty to drafted, approved, produced and published, and the file or status evidence for each step |
| `GATES` | Where workflows check operational requirements or record review findings |
| `REVIEWERS` | The reviewer roles and their result formats |
| `LANES` | Build paths for generated material, screen recordings and mixed episodes |

The [episode-state helper](../skills/autoproduce/references/episode-state.js) reads the artifacts when reporting status. For an interrupted render or upload, use the job receipt or platform record to find the state of that individual operation. A stage label alone cannot verify provider completion or public visibility.

When changing the manifest, update the corresponding skill instructions. Run both checks from the repository root:

```sh
node skills/platform-guide/references/pipeline-lint.js --selftest
node skills/autoproduce/references/episode-state.js --selftest
```
