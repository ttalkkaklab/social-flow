/**
 * format-lint.test.mjs — 린터를 npm run check 에 물리는 래퍼.
 *
 * format-lint.js 자체는 skills/ 아래 있고 서버와 무관하다. 그런데 이 저장소에서
 * 자동으로 도는 관문은 `npm run check` 하나다. 래퍼가 없으면 린터는 사람이
 * 기억할 때만 도는 도구가 되고, 이중 관리 드리프트는 정확히 사람이 잊을 때 생긴다.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const LINT = resolve(HERE, '../../skills/platform-guide/references/format-lint.js');

test('인라인 미러가 프리셋과 어긋나지 않는다', () => {
  let out = '';
  try {
    out = execFileSync(process.execPath, [LINT], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    // 린터는 어긋남을 stderr 로 낸다 — 그 목록이 곧 실패 메시지여야 한다.
    assert.fail('format-lint 실패:\n' + (e.stderr || e.stdout || e.message));
  }
  assert.match(out, /미러 \d+개 일치/);
});

test('린터가 규칙을 실제로 들고 있다 — 빈 통과를 막는다', async () => {
  const { RULES } = await import(LINT);
  assert.ok(RULES.length >= 25, `규칙이 ${RULES.length}개뿐이다 — 스캔 대상이 사라졌는지 확인해라`);
  for (const r of RULES) {
    assert.ok(r.name && r.file && r.re, `규칙에 빠진 칸이 있다: ${JSON.stringify(r)}`);
  }
});

test('YouTube 설명란 상한이 바이트 기준이다 (한국어 5000자는 15,000바이트라 API 가 거절한다)', async () => {
  const { ROUTES } = await import('../dist/handlers.js');
  assert.ok(ROUTES.youtube_publish, 'youtube_publish 라우트가 없다');
  // 한국어 2000자 = 6000바이트 — 글자 수로 재면 통과하고 바이트로 재면 막힌다.
  const tooLong = '가'.repeat(2000);
  await assert.rejects(
    () => ROUTES.youtube_publish({
      videoFilePath: '/tmp/x.mp4', title: 't', caption: tooLong, thumbnailFilePath: '/tmp/x.jpg',
    }),
    /바이트/,
    '글자 수로만 재고 있다 — 한국어 롱폼 설명이 업로드를 다 태운 뒤 400 으로 죽는다',
  );
});
