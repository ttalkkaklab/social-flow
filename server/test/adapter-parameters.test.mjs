import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adapterParameters, assertSelection, COMMON_PARAMETERS } from '../dist/adapter-parameters.js';
import { VIDEO_ADAPTERS, videoCatalog } from '../dist/video-registry.js';
import { IMAGE_ADAPTERS, imageCatalog } from '../dist/image-registry.js';
import { MUSIC_ADAPTERS, musicCatalog } from '../dist/music-registry.js';
import { ROUTES } from '../dist/handlers.js';

test('every adapter\'s parameters are its schema\'s fields, the shared names apart from its own', () => {
  for (const [kind, adapters, catalog] of [['video', VIDEO_ADAPTERS, videoCatalog()], ['image', IMAGE_ADAPTERS, imageCatalog()], ['music', MUSIC_ADAPTERS, musicCatalog()]]) {
    assert.ok(catalog.adapters.length > 0, kind);
    for (const row of catalog.adapters) {
      const { common, options } = adapterParameters(adapters[row.tool].schema, kind);
      const shared = Object.keys(common.properties), own = Object.keys(options.properties);
      assert.deepEqual([...shared, ...own].sort(), [...row.fields].sort(), row.tool);
      assert.ok(shared.every(name => COMMON_PARAMETERS[kind].includes(name)), row.tool);
      assert.ok(!own.some(name => COMMON_PARAMETERS[kind].includes(name)), row.tool);
      for (const part of [common, options]) assert.ok(part.required.every(name => Object.hasOwn(part.properties, name)), row.tool);
    }
  }
});

test('a catalog call names an engine for its parameter schemas and nothing for the list it returned before', async () => {
  const read = async (name, args) => JSON.parse((await ROUTES[name](args)).content[0].text);
  for (const [name, list] of [['video_catalog', videoCatalog()], ['image_catalog', imageCatalog()], ['music_catalog', musicCatalog()]])
    assert.deepEqual(await read(name, {}), JSON.parse(JSON.stringify(list)), name);
  const image = await read('video_catalog', { engine: 'astra-genai', operation: 'image' });
  assert.deepEqual(image.adapters.map(adapter => adapter.tool), ['astra_genai_img2video']);
  assert.equal(image.adapters[0].parameters.common.properties.prompt.type, 'string');
  assert.ok(image.adapters[0].parameters.options.properties.references);
  assert.deepEqual(image.adapters[0].fields, videoCatalog().adapters.find(adapter => adapter.tool === 'astra_genai_img2video').fields);
  assert.deepEqual((await read('video_catalog', { engine: 'astra-genai' })).adapters.map(adapter => adapter.operation), ['text', 'image', 'audio', 'reference']);
  assert.deepEqual((await read('image_catalog', { engine: 'gpt-image', operation: 'edit' })).adapters.map(adapter => adapter.tool), ['gpt_image_img2img']);
  assert.deepEqual((await read('music_catalog', { engine: 'lyria', model: 'lyria-3.5' })).adapters.map(adapter => adapter.tool), ['music_generate_song']);
  await assert.rejects(ROUTES.video_catalog({ operation: 'image' }), /catalog_engine_required/);
  await assert.rejects(ROUTES.video_catalog({ engine: 'astra-genai', operation: 'extend' }), /video_adapter_unsupported/);
  await assert.rejects(ROUTES.image_catalog({ engine: 'nope' }), /image_adapter_unsupported/);
  await assert.rejects(ROUTES.music_catalog({ engine: 'lyria', model: 'nope' }), /music_adapter_unsupported/);
});

test('a named engine or model is checked against the saved selection, each media type under its own code', () => {
  const saved = { engine: 'astra-genai', model: 'ltx-2.5-22b-distilled' };
  assertSelection('video', saved, {});
  assertSelection('video', saved, saved);
  assert.throws(() => assertSelection('video', saved, { engine: 'seedance' }), /^Error: model_selection_mismatch: engine/);
  assert.throws(() => assertSelection('image', saved, { model: 'z-image-turbo' }), /^Error: image_selection_mismatch: model/);
  assert.throws(() => assertSelection('music', { engine: 'lyria' }, { model: 'lyria-3.5' }), /^Error: music_selection_mismatch: model/);
});
