# Validation evidence

## Objective gate

- `cd server && npm run check`: exit 0; 2,169 tests in 196 suites passed,
  zero failures, skips or cancellations (181,041 ms). Includes TypeScript build,
  all distribution bundles, mocked HTTP tests and ffmpeg-backed shot fixtures.
- `node skills/platform-guide/references/skill-lint.js`: exit 0;
  16 rules hold across 21 skills.
- `git diff --check`: exit 0.
- Focused preparation/duration run: 26 tests passed.
- Focused HDR, conflicting selectors, audio-default and snapshot run: 6 tests passed.

## Behavioral coverage added or corrected

- HQ portrait dimensions reach the mocked job body without a landscape override.
- Authored image tier, guidance, steps, negative prompt, audio switch and LoRA strength
  survive shot preparation; keyframe/audio controls survive their selected paths.
- Unsupported tier/LoRA choices on non-image paths fail without changing the board.
- Conflicting frame/automatic lengths fail instead of dropping a selector.
- requiredSeconds conflicts with duration; HQ maps to its own duration mode.
- Text-only HDR reaches the body; HDR plus an audio portrait fails before submission.
- Edge limits and pixel limits are checked independently, including omitted dimensions.
- Audio length omission normalizes to an explicit 121-frame compatibility request.
- Both captured operational sources agree with the per-mode wire allow-lists;
  local duration-to-frames conversion is explicit. Guidance boundaries come from OpenAPI.

## Limits

No generation, visual quality comparison, HDR assembly render or newly deployed server
behavior was tested. Network writes in contract tests use mocked transports. Live access
was limited to authenticated GETs of the two contract endpoints. Their contradictory
omitted-audio-length metadata is recorded, not resolved by an invented server claim.
