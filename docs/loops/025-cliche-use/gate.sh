#!/usr/bin/env bash
# 025 cliche-use 루프의 객관 게이트: .github/workflows/check.yml 의 단계를 그대로 돌린다 (apt-get, npm ci 제외).
# check:dist 는 커밋된 dist 와 새 빌드를 비교하므로, 작업을 커밋한 뒤에 실행한다.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
(cd server && npm run check && npm run check:dist)
git diff --exit-code skills/storyboard/references/mesh-runtime.js
git diff --exit-code skills/produce/references/animation-review-runtime.js
python3 skills/platform-guide/references/check-style.py --selftest
node skills/platform-guide/references/pipeline-lint.js --selftest
node skills/autoproduce/references/episode-state.js --selftest
node skills/storyboard/references/check-slide.js --selftest
node skills/storyboard/references/check-scenes.js --selftest
python3 skills/produce/references/snap-boundaries.py --selftest
node skills/storyboard/references/assemble-bg-prompt.js --selftest
node skills/autoproduce/references/cost-preview.js --selftest
node skills/platform-guide/references/check-meta.js --selftest
python3 skills/autoproduce/references/check-duplicate.py --selftest
python3 skills/platform-guide/references/check-batch.py --selftest
python3 skills/channel/references/resolve-asset.py --selftest
python3 skills/produce/references/check-final-speech-rate.py --selftest
node skills/storyboard/references/check-research.js --selftest
node skills/channel/references/serve.js --selftest
node skills/platform-guide/references/format-lint.js
node skills/platform-guide/references/skill-lint.js --selftest
node skills/platform-guide/references/skill-lint.js
echo "GATE OK"
