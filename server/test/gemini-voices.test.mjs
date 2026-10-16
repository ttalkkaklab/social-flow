import assert from 'node:assert/strict';
import { test } from 'node:test';
process.env.GEMINI_API_KEY = 'mock-key-never-sent';
const { TTS_VOICES, listTtsVoices, ttsVoicesSchema } = await import('../dist/tts-client.js');

test('curated Gemini list is offline and preserves all 30 names and traits', async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => { called = true; throw new Error('unexpected network'); };
  try {
    const result = await listTtsVoices(ttsVoicesSchema.parse({}));
    assert.equal(result.success, true);
    assert.equal(result.source, 'curated');
    assert.equal(result.voices.length, 30);
    assert.deepEqual(result.voices.map(v => [v.id, v.description]), Object.entries(TTS_VOICES));
    assert.equal(called, false);
  } finally { globalThis.fetch = originalFetch; }
});

test('Gemini library maps snake-case wire metadata and pagination without changing IDs', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: new URL(url), method: init.method });
    assert.equal(init.headers['x-goog-api-key'], 'mock-key-never-sent');
    return new Response(JSON.stringify({ voices: [{ id: 'achernar', display_name: 'Achernar', type: 'prebuilt', language_code: 'en-US', description: 'Soft', accent: 'General American' }, { id: 'voice_custom', display_name: 'Actor', type: 'prompted', language_code: 'ko-KR' }], next_page_token: 'next+page=' }));
  };
  try {
    const result = await listTtsVoices(ttsVoicesSchema.parse({ source: 'library', limit: 2, pageToken: 'prior+page=' }));
    assert.equal(result.success, true, result.error);
    assert.equal(calls[0].method, 'GET');
    assert.equal(calls[0].url.pathname, '/v1beta/voices');
    assert.equal(calls[0].url.searchParams.get('page_size'), '2');
    assert.equal(calls[0].url.searchParams.get('page_token'), 'prior+page=');
    assert.equal(calls[0].url.searchParams.has('key'), false);
    assert.equal(result.voices[0].id, 'achernar');
    assert.equal(result.voices[0].languageCode, 'en-US');
    assert.equal(result.voices[1].id, 'voice_custom');
    assert.equal(result.nextPageToken, 'next+page=');
    assert.match(result.previewNote, /does not include audio previews/);
  } finally { globalThis.fetch = originalFetch; }
});

test('library failures are reported without replacing them with the offline list', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: 'Permission denied', status: 'PERMISSION_DENIED' } }), { status: 403 });
  try {
    const result = await listTtsVoices(ttsVoicesSchema.parse({ source: 'library' }));
    assert.equal(result.success, false);
    assert.match(result.error, /Permission denied/);
    assert.equal(result.voices, undefined);
  } finally { globalThis.fetch = originalFetch; }
});

test('pagination and request bounds reject invalid input before calls', () => {
  for (const input of [{ source: 'unknown' }, { limit: 0 }, { limit: 101 }, { pageToken: 'x' }, { source: 'library', pageToken: '' }]) {
    assert.equal(ttsVoicesSchema.safeParse(input).success, false);
  }
  assert.equal(ttsVoicesSchema.parse({ source: 'library' }).limit, 30);
});
