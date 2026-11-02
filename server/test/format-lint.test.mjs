import { test } from 'node:test';
import assert from 'node:assert/strict';

test('YouTube uploads start private: public is rejected before any upload, unlisted and the default pass validation', async () => {
  const { ROUTES } = await import('../dist/handlers.js');
  const { TOOLS } = await import('../dist/tools.js');
  const args = { videoFilePath: '/nonexistent/x.mp4', title: 't', caption: 'c', thumbnailFilePath: '/nonexistent/x.jpg' };
  await assert.rejects(() => ROUTES.youtube_publish({ ...args, privacyStatus: 'public' }), /start private.*youtube_update/);
  for (const privacyStatus of ['unlisted', 'private', undefined]) {
    // Past the privacy check the call stops at the missing file — no token, no network.
    const result = await ROUTES.youtube_publish({ ...args, privacyStatus });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /Cannot read video file/);
  }
  assert.equal(TOOLS.find((tool) => tool.name === 'youtube_publish').inputSchema.properties.privacyStatus.default, 'private');
});

test('the YouTube description cap is measured in bytes (5000 Korean chars is 15,000 bytes and the API rejects it)', async () => {
  const { ROUTES } = await import('../dist/handlers.js');
  assert.ok(ROUTES.youtube_publish, 'no youtube_publish route');
  // 2000 Korean chars = 6000 bytes — passes a character count, fails a byte count.
  const tooLong = '가'.repeat(2000);
  await assert.rejects(
    () => ROUTES.youtube_publish({
      videoFilePath: '/tmp/x.mp4', title: 't', caption: tooLong, thumbnailFilePath: '/tmp/x.jpg',
    }),
    /bytes/,
    'it is counting characters only — a Korean long-form description burns the whole upload and then dies on a 400',
  );
});
