/**
 * Tool-surface contract tests — `npm run check` (runs after the build).
 *
 * No real API is called. Most defects in this server are "contract mismatches
 * invisible until you actually call" (missing routes, arguments that exist in
 * the schema but not the handler, enums drifted from the canonical constants,
 * behavior hints contradicting the description), so everything catchable
 * statically is caught here.
 *
 * There are no behavioral evals here, because the publish tools create public
 * posts on a real call — that waits for a dry-run layer.
 */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import {
  SNS_PLATFORMS,
  disabledToolPatterns,
  isToolDisabled,
  snsCredentialFile,
  snsTokenDir,
} from '../dist/config.js';
import { SERVER_INSTRUCTIONS, SNS_PLATFORM_BY_TOOL, TOOLS } from '../dist/tools.js';
import { ROUTES, apiErrorText, threadsTextLength } from '../dist/handlers.js';
import { STOCK_PROVIDERS, STOCK_MEDIA, STOCK_ORIENTATIONS, STOCK_MAX_LIMIT } from '../dist/stock-client.js';
import {
  DEFAULT_GEMINI_38_TTS_MODEL,
  GEMINI_38_TTS_MODELS,
  MAX_GEMINI_38_TTS_INPUT_CHARS,
  TTS_VOICE_NAMES,
  VALID_TTS_MODELS,
} from '../dist/tts-client.js';
import {
  DEFAULT_ELEVENLABS_MODEL,
  DEFAULT_ELEVENLABS_OUTPUT_FORMAT,
  ELEVENLABS_DIALOGUE_MAX_INPUTS,
  ELEVENLABS_MODELS,
  ELEVENLABS_OUTPUT_FORMATS,
  ELEVENLABS_TEXT_NORMALIZATION,
  ELEVENLABS_VOICE_CATEGORIES,
  MAX_ELEVENLABS_INPUT_CHARS,
  DEFAULT_ELEVENLABS_SFX_OUTPUT_FORMAT,
  ELEVENLABS_SFX_OUTPUT_FORMATS,
} from '../dist/elevenlabs-client.js';
import { MUSIC_GENERATION_MODES, MUSIC_SCALES } from '../dist/music-client.js';
import {
  DEFAULT_SEEDANCE_DURATION,
  DEFAULT_SEEDANCE_MODEL,
  DEFAULT_SEEDANCE_RESOLUTION,
  SEEDANCE_MODEL_SPECS,
  VALID_SEEDANCE_MODELS,
  VALID_SEEDANCE_RATIOS,
  VALID_SEEDANCE_RESOLUTIONS,
  seedanceImg2VideoSchema,
  seedanceReferenceSchema,
  seedanceText2VideoSchema,
} from '../dist/seedance-client.js';
import {
  DEFAULT_ZIMAGE_QUANTIZE,
  DEFAULT_ZIMAGE_STEPS,
  ZIMAGE_QUANTIZE_OPTIONS,
} from '../dist/zimage-client.js';
import {
  IMAGE_ASPECTS,
  IMAGE_LICENSES,
  IMAGE_SIZES,
  IMAGE_TYPES,
  SERP_NAVER_PERIODS,
} from '../dist/serp-client.js';
import { NAVER_IMAGE_FILTERS, NAVER_SEARCH_TYPES, NAVER_SORTS } from '../dist/naver-client.js';
import { pcmToWav, resolveOutputFile } from '../dist/media-utils.js';

const byName = new Map(TOOLS.map((tool) => [tool.name, tool]));

/** Depth-first flattening of inputSchema.properties into (path, schema) pairs. */
function walkProperties(schema, prefix = '') {
  const out = [];
  for (const [key, value] of Object.entries(schema.properties ?? {})) {
    const path = prefix ? `${prefix}.${key}` : key;
    out.push([path, value]);
    if (value && typeof value === 'object') {
      if (value.type === 'object') out.push(...walkProperties(value, path));
      if (value.type === 'array' && value.items?.type === 'object') {
        out.push(...walkProperties(value.items, `${path}[]`));
      }
    }
  }
  return out;
}

describe('tool surface', () => {
  it('tools exist and names are unique', () => {
    assert.ok(TOOLS.length > 0, 'no tools at all');
    assert.equal(byName.size, TOOLS.length, 'duplicate tool name');
  });

  // The model picks a tool by its description. Two tools with the same text leave it a coin
  // toss — acting_review, tts_review_acting and tts_review_final shared one until 0.118.3.
  it('descriptions are unique', () => {
    const seen = new Map();
    for (const tool of TOOLS) {
      assert.equal(seen.get(tool.description), undefined, `${tool.name} repeats ${seen.get(tool.description)}'s description`);
      seen.set(tool.description, tool.name);
    }
  });

  for (const tool of TOOLS) {
    describe(tool.name, () => {
      it('has a title and a description', () => {
        assert.equal(typeof tool.title, 'string');
        assert.ok(tool.title.trim().length > 0, 'title is empty');
        assert.ok(tool.title.length <= 60, `title too long (${tool.title.length} chars)`);
        assert.ok((tool.description ?? '').trim().length >= 40, 'description missing or too short');
        // Claude Code cuts an upfront tool description at 4,096 characters; the rest never reaches the model.
        assert.ok(tool.description.length <= 4096, `description too long (${tool.description.length} chars)`);
      });

      it('inputSchema is a valid object schema', () => {
        assert.equal(tool.inputSchema?.type, 'object');
        const properties = tool.inputSchema.properties ?? {};
        for (const key of tool.inputSchema.required ?? []) {
          assert.ok(key in properties, `"${key}" is in required but not in properties`);
        }
      });

      it('enums are non-empty and defaults are inside the enum', () => {
        for (const [path, schema] of walkProperties(tool.inputSchema)) {
          if (!Array.isArray(schema.enum)) continue;
          assert.ok(schema.enum.length > 0, `enum of "${path}" is empty`);
          assert.equal(new Set(schema.enum).size, schema.enum.length, `enum of "${path}" has duplicates`);
          if (schema.default !== undefined) {
            assert.ok(
              schema.enum.includes(schema.default),
              `default of "${path}" (${schema.default}) is outside the enum`,
            );
          }
        }
      });

      it('annotations exist and the hint combination is consistent', () => {
        const a = tool.annotations;
        assert.ok(a, 'no annotations — the client cannot tell dangerous tools apart');
        assert.equal(typeof a.readOnlyHint, 'boolean');
        assert.equal(typeof a.openWorldHint, 'boolean');

        if (a.readOnlyHint) {
          // destructive/idempotent hints on a read-only tool mean nothing per spec
          assert.equal(a.destructiveHint, undefined, 'readOnly yet destructiveHint is set');
          assert.equal(a.idempotentHint, undefined, 'readOnly yet idempotentHint is set');
        } else {
          // write tools must not leave the two hints to defaults — destructiveHint
          // defaults to true, so a file-only generation tool reads as destructive
          assert.equal(typeof a.destructiveHint, 'boolean', 'destructiveHint must be explicit');
          assert.equal(typeof a.idempotentHint, 'boolean', 'idempotentHint must be explicit');
        }
      });

      it('outputSchema, when declared, is valid', () => {
        if (!tool.outputSchema) return;
        assert.equal(tool.outputSchema.type, 'object');
        const properties = tool.outputSchema.properties ?? {};
        assert.ok(Object.keys(properties).length > 0, 'properties is empty');
        for (const key of tool.outputSchema.required ?? []) {
          assert.ok(key in properties, `"${key}" from outputSchema.required is not in properties`);
        }
        for (const [key, schema] of Object.entries(properties)) {
          assert.ok(
            typeof schema.description === 'string' && schema.description.trim().length > 0,
            `outputSchema "${key}" has no description`,
          );
        }
      });
    });
  }
});

describe('routing consistency', () => {
  it('every defined tool has a handler', () => {
    const orphans = TOOLS.filter((tool) => typeof ROUTES[tool.name] !== 'function').map((t) => t.name);
    assert.deepEqual(orphans, [], `tools without a handler: ${orphans.join(', ')}`);
  });

  it('no handler is undefined as a tool', () => {
    const orphans = Object.keys(ROUTES).filter((name) => !byName.has(name));
    assert.deepEqual(orphans, [], `handlers without a tool definition: ${orphans.join(', ')}`);
  });

  it('the ListTools gate points only at tools that exist', () => {
    for (const name of Object.keys(SNS_PLATFORM_BY_TOOL)) {
      assert.ok(byName.has(name), `"${name}" from SNS_PLATFORM_BY_TOOL is not in the tool list`);
    }
  });
});

/*
 * Operator tool on/off — <SNS_TOKEN_DIR>/disabled-tools.json holds a JSON array of
 * tool-name patterns. A listed tool is hidden from ListTools AND refused by CallTool
 * (a stale client tool list must not bypass the switch). The file is read per
 * request, so edits apply without a server restart.
 */
describe('tool on/off (disabled-tools.json)', () => {
  it('a pattern is an exact name or a trailing-* prefix family, nothing fancier', () => {
    assert.equal(isToolDisabled('seedance_text2video', ['seedance_*']), true);
    assert.equal(isToolDisabled('seedance_reference', ['seedance_reference']), true);
    assert.equal(isToolDisabled('astra_text2video', ['seedance_*']), false);
    assert.equal(isToolDisabled('seedance_text2video', []), false);
    // the "*" is a suffix wildcard only — it does not float mid-name
    assert.equal(isToolDisabled('tts_local_generate', ['tts_*generate']), false);
    // a bare "*" prefixes everything, i.e. turns the whole server off
    assert.equal(isToolDisabled('naver_search', ['*']), true);
  });

  it('reads a JSON string array; a missing or malformed file turns nothing off', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sf-disabled-tools-'));
    try {
      const file = join(dir, 'disabled-tools.json');
      assert.deepEqual(disabledToolPatterns(file), [], 'missing file must disable nothing');
      writeFileSync(file, JSON.stringify(['seedance_*', 'naver_search']));
      assert.deepEqual(disabledToolPatterns(file), ['seedance_*', 'naver_search']);
      writeFileSync(file, '{"seedance_*": false}'); // wrong shape — object, not array
      assert.deepEqual(disabledToolPatterns(file), [], 'malformed file must disable nothing');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('HITL contract', () => {
  const destructive = TOOLS.filter((t) => t.annotations?.destructiveHint === true);

  it('at least one immediately-public tool is marked destructive', () => {
    assert.ok(destructive.length > 0);
  });

  for (const tool of destructive) {
    it(`${tool.name} — the description forbids calling without approval`, () => {
      // The hint (machine-read) and the description (model-read) must state
      // the same fact. Fix one and leave the other, and one of them is
      // guaranteed to be a lie.
      assert.match(tool.description, /⚠️/, 'no warning marker');
      assert.match(tool.description, /never call without|HITL/, 'no HITL wording');
    });
  }
});

describe('AI-generated content disclosure (YouTube)', () => {
  const publish = () => byName.get('youtube_publish');
  // This pipeline uses generated video and Lyria music. A false default makes
  // non-disclosure the default behavior, and habitual non-disclosure is
  // grounds for forced labels, removal, and YPP suspension.
  it('defaults to true (non-disclosure never becomes the default)', () => {
    assert.equal(publish().inputSchema.properties.containsSyntheticMedia.default, true);
  });
});

describe('separate subtitle upload contract', () => {
  const yt = () => byName.get('youtube_publish');
  const fb = () => byName.get('facebook_publish');

  it('the captionWarning description blocks re-publishing', () => {
    // the publish APIs are non-idempotent — re-publish after a subtitle-only failure and posts pile up
    for (const [name, tool] of [['youtube_publish', yt()], ['facebook_publish', fb()]]) {
      assert.match(
        tool.outputSchema.properties.captionWarning.description,
        /do not re-upload|do not re-publish/,
        `${name}: no do-not-republish guidance`,
      );
    }
  });
});

describe('YouTube required-thumbnail contract', () => {
  // Without one, YouTube picks an arbitrary frame as the cover, and the
  // vertical surface cannot be reverted via the API after publishing — so the
  // schema blocks it at upload time (2026-08-13).
  const yt = () => byName.get('youtube_publish');

  it('thumbnailFilePath is in required (blocks thumbnail-less uploads)', () => {
    assert.ok(yt().inputSchema.required.includes('thumbnailFilePath'), 'thumbnailFilePath is not required');
  });
});

describe('comment tool platform consistency', () => {
  // If the three places (COMMENT_PLATFORMS in sns-client, the tool enum, the
  // handler zod enum) drift apart, the schema passes yet the call leaks onto
  // another platform's token at runtime.
  const inboxEnum = byName.get('sns_comment_inbox').inputSchema.properties.platforms.items.enum;
  const replyEnum = byName.get('sns_comment_reply').inputSchema.properties.platform.enum;
  const moderateEnum = byName.get('sns_comment_moderate').inputSchema.properties.platform.enum;

  it('inbox and reply take the same platform set', () => {
    assert.deepEqual([...inboxEnum].sort(), [...replyEnum].sort());
  });

  it('hide/like do not take YOUTUBE', () => {
    // setModerationStatus means something other than "reversible hide" — no mapping
    assert.ok(!moderateEnum.includes('YOUTUBE'), 'YOUTUBE is in the hide targets');
  });
});

describe('single-source constants', () => {
  const enumOf = (toolName, path) => {
    const parts = path.split('.');
    let schema = byName.get(toolName).inputSchema;
    for (const part of parts) schema = schema.properties[part];
    return schema.enum;
  };

  /**
   * Search-tool enums and caps are re-written as literals in tools.ts while
   * handlers.ts references the canonical constants. Fix one side only and zod
   * rejects the values the tool advertises with -32602 — and nobody knows
   * until a real call. Tying them to the source of truth catches the drift at
   * build time.
   */
  it('naver_search enums match the naver-client source of truth', () => {
    assert.deepEqual(enumOf('naver_search', 'type'), [...NAVER_SEARCH_TYPES]);
    assert.deepEqual(enumOf('naver_search', 'sort'), [...NAVER_SORTS]);
    assert.deepEqual(enumOf('naver_search', 'imageSize'), [...NAVER_IMAGE_FILTERS]);
  });

  it('serp search enums match the serp-client source of truth', () => {
    assert.deepEqual(enumOf('serp_naver_search', 'period'), [...SERP_NAVER_PERIODS]);
    assert.deepEqual(enumOf('serp_image_search', 'size'), [...IMAGE_SIZES]);
    assert.deepEqual(enumOf('serp_image_search', 'aspect'), [...IMAGE_ASPECTS]);
    assert.deepEqual(enumOf('serp_image_search', 'imageType'), [...IMAGE_TYPES]);
    assert.deepEqual(enumOf('serp_image_search', 'license'), [...IMAGE_LICENSES]);
  });

  it('stock_search enums match the stock-client source of truth', () => {
    assert.deepEqual(enumOf('stock_search', 'media'), [...STOCK_MEDIA]);
    assert.deepEqual(enumOf('stock_search', 'orientation'), [...STOCK_ORIENTATIONS]);
    assert.deepEqual(byName.get('stock_search').inputSchema.properties.providers.items.enum, [...STOCK_PROVIDERS]);
    const m = (byName.get('stock_search').inputSchema.properties.limit.description ?? '').match(/max\s*(\d+)/i);
    assert.equal(m && Number(m[1]), STOCK_MAX_LIMIT);
  });

  it('TTS voice enums match the tts-client source of truth', () => {
    assert.deepEqual(enumOf('tts_generate', 'voiceName'), [...TTS_VOICE_NAMES]);
    const speakerVoice = byName.get('tts_multi_speaker').inputSchema.properties.speakers.items
      .properties.voiceName.enum;
    assert.deepEqual(speakerVoice, [...TTS_VOICE_NAMES]);
  });

  it('the TTS model enum matches the source of truth', () => {
    assert.deepEqual(enumOf('tts_generate', 'model'), [...VALID_TTS_MODELS]);
  });

  it('the Gemini 3.8 acted TTS tool matches the Interactions client contract', () => {
    const tool = byName.get('tts_gemini_38');
    assert.ok(tool, 'tts_gemini_38 is not registered');
    assert.deepEqual(enumOf('tts_gemini_38', 'model'), [...GEMINI_38_TTS_MODELS]);
    assert.equal(tool.inputSchema.properties.model.default, DEFAULT_GEMINI_38_TTS_MODEL);
    assert.equal(tool.inputSchema.properties.turns.items.properties.text.maxLength, MAX_GEMINI_38_TTS_INPUT_CHARS);
    assert.equal(tool.inputSchema.properties.speakers.minItems, 2);
    assert.equal(tool.inputSchema.properties.speakers.maxItems, 2);
    assert.deepEqual(tool.inputSchema.properties.speakers.items.properties.voice.enum, [...TTS_VOICE_NAMES]);
    assert.doesNotMatch(tool.description, /L4az9Gb378GIycFl2nAB/, "a generic tool must not inject a channel-specific identity voice");
  });

  it('music scale/mode enums match the music-client source of truth', () => {
    assert.deepEqual(enumOf('music_generate_advanced', 'config.scale'), [...MUSIC_SCALES]);
    assert.deepEqual(enumOf('music_generate_advanced', 'config.musicGenerationMode'), [
      ...MUSIC_GENERATION_MODES,
    ]);
  });

  it('ElevenLabs model/format/normalization/category enums match the elevenlabs-client source of truth', () => {
    assert.deepEqual(enumOf('tts_elevenlabs_generate', 'model'), [...ELEVENLABS_MODELS]);
    assert.equal(byName.get('tts_elevenlabs_generate').inputSchema.properties.model.default, DEFAULT_ELEVENLABS_MODEL);
    for (const tool of ['tts_elevenlabs_generate', 'tts_elevenlabs_dialogue']) {
      assert.deepEqual(enumOf(tool, 'outputFormat'), [...ELEVENLABS_OUTPUT_FORMATS], tool);
      assert.equal(byName.get(tool).inputSchema.properties.outputFormat.default, DEFAULT_ELEVENLABS_OUTPUT_FORMAT, tool);
      assert.deepEqual(enumOf(tool, 'applyTextNormalization'), [...ELEVENLABS_TEXT_NORMALIZATION], tool);
    }
    assert.deepEqual(enumOf('tts_elevenlabs_voices', 'category'), [...ELEVENLABS_VOICE_CATEGORIES]);
    assert.deepEqual(enumOf('sfx_elevenlabs_generate', 'outputFormat'), [...ELEVENLABS_SFX_OUTPUT_FORMATS]);
    assert.equal(byName.get('sfx_elevenlabs_generate').inputSchema.properties.outputFormat.default, DEFAULT_ELEVENLABS_SFX_OUTPUT_FORMAT);
  });
});

describe('supported speech surface', () => {
  it('Gemini, ElevenLabs v4 and character auditions are listed; ElevenLabs is pinned to v4', () => {
    for (const name of ['tts_generate', 'tts_multi_speaker', 'tts_gemini_38', 'tts_list_voices', 'tts_elevenlabs_generate', 'tts_elevenlabs_dialogue', 'tts_elevenlabs_voices', 'character_voice_audition']) {
      assert.ok(byName.has(name), name);
    }
    for (const name of ['tts_elevenlabs_generate', 'tts_elevenlabs_dialogue']) {
      const props = byName.get(name).inputSchema.properties;
      assert.deepEqual(props.model.enum, ['eleven_v4']);
      assert.equal(props.model.default, 'eleven_v4');
      assert.deepEqual(props.speed.enum, [1]);
      assert.ok(props.stability && props.similarity);
      assert.equal(props.style, undefined);
    }
  });
});

describe('speech lane separation (ElevenLabs)', () => {
  const generate = byName.get('tts_elevenlabs_generate');
  const dialogue = byName.get('tts_elevenlabs_dialogue');

  it('voiceId is required with no default on both synthesis tools — the premade set rotates', () => {
    for (const tool of [generate]) {
      assert.ok(tool.inputSchema.required.includes('voiceId'), `${tool.name} voiceId not required`);
      assert.ok(!('default' in tool.inputSchema.properties.voiceId), `${tool.name} has a default voice`);
      assert.match(tool.inputSchema.properties.voiceId.description, /tts_elevenlabs_voices/, 'no pointer to the listing');
    }
    const item = dialogue.inputSchema.properties.inputs.items;
    assert.ok(item.required.includes('voiceId') && item.required.includes('text'));
    assert.equal(dialogue.inputSchema.properties.inputs.maxItems, ELEVENLABS_DIALOGUE_MAX_INPUTS);
  });

  it('input cap is the v4 provider cap', () => {
    assert.equal(generate.inputSchema.properties.text.maxLength, MAX_ELEVENLABS_INPUT_CHARS);
    assert.equal(MAX_ELEVENLABS_INPUT_CHARS, 10000);
  });
});

describe('image lane separation (local · OpenAI)', () => {
  const local = byName.get('image_local_generate');
  it('the quantization enum matches the zimage-client source of truth', () => {
    assert.deepEqual(local.inputSchema.properties.quantize.enum, [...ZIMAGE_QUANTIZE_OPTIONS]);
    assert.equal(local.inputSchema.properties.quantize.default, DEFAULT_ZIMAGE_QUANTIZE);
    assert.equal(local.inputSchema.properties.steps.default, DEFAULT_ZIMAGE_STEPS);
  });
});

/**
 * Pins the Seedance tool surface as contract. Seedance stays in the plugin only as
 * 2.x, whose reference lane takes a voice sample per speaker (2026-10-31).
 *
 * Enums must match the values derived from the seedance-client.ts capability
 * table — copy the list into the schema and only one side gets fixed when a
 * model is added.
 */
describe('Seedance 2.x tool surface', () => {
  const t2v = byName.get('seedance_text2video');
  const ref = byName.get('seedance_reference');

  it('model/resolution/ratio enums match the seedance-client source of truth', () => {
    assert.deepEqual(t2v.inputSchema.properties.model.enum, VALID_SEEDANCE_MODELS);
    assert.deepEqual(t2v.inputSchema.properties.resolution.enum, VALID_SEEDANCE_RESOLUTIONS);
    assert.deepEqual(t2v.inputSchema.properties.ratio.enum, VALID_SEEDANCE_RATIOS);
    assert.equal(t2v.inputSchema.properties.model.default, DEFAULT_SEEDANCE_MODEL);
    assert.equal(t2v.inputSchema.properties.resolution.default, DEFAULT_SEEDANCE_RESOLUTION);
    assert.equal(t2v.inputSchema.properties.durationSeconds.default, DEFAULT_SEEDANCE_DURATION);
  });

  /**
   * When the tool-surface default and the actually applied zod default split,
   * every normal call omitting the argument fails — the JSON-schema default is
   * advisory and the server never reads it. `seedance_reference` once
   * inherited a shared default it could not take and tripped its own validation. Eyeball
   * schema checks miss this, so it is verified **by parsing**.
   */
  it('a minimal call omitting arguments passes all three schemas', () => {
    const cases = [
      [seedanceText2VideoSchema, { prompt: 'x' }],
      [seedanceImg2VideoSchema, { prompt: 'x', sourceImagePath: '/tmp/a.png' }],
      [seedanceReferenceSchema, { prompt: 'x', referenceImagePaths: ['/tmp/a.png'] }],
    ];
    for (const [schema, args] of cases) {
      const parsed = schema.safeParse(args);
      assert.ok(parsed.success, `a defaults-only call was rejected: ${JSON.stringify(parsed.error?.issues)}`);
      assert.ok(VALID_SEEDANCE_MODELS.includes(parsed.data.model));
    }
  });

  it('the reference schema\'s actual default model matches the tool-surface default', () => {
    const parsed = seedanceReferenceSchema.parse({ prompt: 'x', referenceImagePaths: ['/tmp/a.png'] });
    assert.equal(parsed.model, ref.inputSchema.properties.model.default, 'the surface default and the actual default differ');
    assert.equal(parsed.model, DEFAULT_SEEDANCE_MODEL);
  });

  /**
   * Reference audio (2026-08-29) — the only way to hand a character a fixed voice
   * inside a generated clip. The vendor's limits live in the capability table, and
   * the schema must reject before the call the combinations the API would fail
   * minutes later: audio-only on 2.0, too many clips, a non wav/mp3 file, and a
   * voice reference into a silent clip (our generateAudio default is false).
   */
  describe('reference audio', () => {
    const MODEL_25 = 'dreamina-seedance-2-5-260628';
    const MODEL_20 = 'dreamina-seedance-2-0-260128';

    it('reference video mirrors the model table, needs a Video 1 binding, and rejects the wrong shape', () => {
      for (const model of VALID_SEEDANCE_MODELS) {
        const video = SEEDANCE_MODEL_SPECS[model].referenceVideos;
        assert.notEqual(video, false, `${model} has no reference-video spec`);
        assert.ok(video.clipSeconds[0] >= 2 && video.totalSeconds >= video.clipSeconds[1], `${model} video limits are inconsistent`);
      }
      const prop = ref.inputSchema.properties.referenceVideoPaths;
      assert.ok(prop, 'seedance_reference has no referenceVideoPaths');
      assert.equal(prop.maxItems, Math.max(...VALID_SEEDANCE_MODELS.map((m) => SEEDANCE_MODEL_SPECS[m].referenceVideos.maxClips)));
      assert.match(prop.description, /previz|clay/i);
      assert.match(prop.description, /MEDIA_UPLOAD_URL/);
      assert.match(ref.description, /Video 1/);
      const bound = { prompt: 'Image 1 is the first frame. Use Video 1 for the camera only. Do not reference its visual content. The subject stays consistent.', model: MODEL_20, referenceImagePaths: ['/tmp/a.png'] };
      assert.ok(seedanceReferenceSchema.safeParse({ ...bound, referenceVideoPaths: ['/tmp/previz.mp4'] }).success);
      assert.ok(seedanceReferenceSchema.safeParse({ ...bound, referenceVideoUrls: ['https://host/previz.mp4'] }).success);
      // a video alone is a reference — nothing else is required
      assert.ok(seedanceReferenceSchema.safeParse({ prompt: bound.prompt, model: MODEL_25, referenceVideoUrls: ['https://host/previz.mp4'] }).success);
      const unbound = seedanceReferenceSchema.safeParse({ ...bound, prompt: 'A courtyard at dusk, the subject stays consistent.', referenceVideoPaths: ['/tmp/previz.mp4'] });
      assert.equal(unbound.success, false);
      assert.match(unbound.error.issues[0].message, /Video 1/);
      const tooMany = seedanceReferenceSchema.safeParse({ ...bound, referenceVideoPaths: ['/1.mp4', '/2.mp4', '/3.mp4', '/4.mp4'] });
      assert.equal(tooMany.success, false);
      assert.match(tooMany.error.issues[0].message, /at most 3 reference videos/);
      const badFormat = seedanceReferenceSchema.safeParse({ ...bound, referenceVideoPaths: ['/tmp/previz.webm'] });
      assert.equal(badFormat.success, false);
      assert.match(badFormat.error.issues[0].message, /mp4 or mov/);
      const badUrl = seedanceReferenceSchema.safeParse({ ...bound, referenceVideoUrls: ['previz.mp4'] });
      assert.equal(badUrl.success, false);
    });

    it('2.5 accepts an audio-only call; 2.0 needs an image alongside', () => {
      const audioOnly = { prompt: 'x', referenceAudioPaths: ['/tmp/v.wav'], generateAudio: true };
      assert.ok(seedanceReferenceSchema.safeParse({ ...audioOnly, model: MODEL_25 }).success);
      const rejected = seedanceReferenceSchema.safeParse({ ...audioOnly, model: MODEL_20 });
      assert.equal(rejected.success, false);
      assert.match(rejected.error.issues[0].message, /audio-only/);
      assert.ok(seedanceReferenceSchema.safeParse({ ...audioOnly, model: MODEL_20, referenceImagePaths: ['/tmp/a.png'] }).success);
    });

    it('clip count, file format, silent output, and no reference at all are rejected before the call', () => {
      const base = { prompt: 'x', model: MODEL_20, referenceImagePaths: ['/tmp/a.png'], generateAudio: true };
      const tooMany = seedanceReferenceSchema.safeParse({ ...base, referenceAudioPaths: ['/1.wav', '/2.wav', '/3.wav', '/4.wav'] });
      assert.equal(tooMany.success, false);
      assert.match(tooMany.error.issues[0].message, /at most 3 reference audio/);
      const badFormat = seedanceReferenceSchema.safeParse({ ...base, referenceAudioPaths: ['/tmp/v.ogg'] });
      assert.equal(badFormat.success, false);
      assert.match(badFormat.error.issues[0].message, /wav or mp3/);
      const silent = seedanceReferenceSchema.safeParse({ ...base, generateAudio: false, referenceAudioPaths: ['/tmp/v.wav'] });
      assert.equal(silent.success, false);
      assert.deepEqual(silent.error.issues[0].path, ['generateAudio']);
      const nothing = seedanceReferenceSchema.safeParse({ prompt: 'x' });
      assert.equal(nothing.success, false);
      assert.match(nothing.error.issues[0].message, /At least one reference/);
    });
  });

  it('cross constraints are rejected before the call — before a paid call is created', () => {
    // 2.5 got 1080p on 2026-08-17 — the tier the discount campaign covers, so it must pass
    assert.equal(
      seedanceText2VideoSchema.safeParse({ prompt: 'x', model: 'dreamina-seedance-2-5-260628', resolution: '1080p' }).success,
      true,
    );
    // but 4K is 2.0-only — 2.5 never got it
    assert.equal(
      seedanceText2VideoSchema.safeParse({ prompt: 'x', model: 'dreamina-seedance-2-5-260628', resolution: '4k' }).success,
      false,
    );
    // the 2.0 duration cap is 15 seconds
    assert.equal(seedanceText2VideoSchema.safeParse({ prompt: 'x', durationSeconds: 20 }).success, false);
  });

  it('a Korean direction outside quotes is rejected on every model', () => {
    // The prompt body reads Chinese or English. Korean is not refused by the vendor — it is
    // ignored, so the shot comes back wrong after a paid wait. Reject it while it is free.
    const korean = 'the column across the middle third, very slow dolly in. 손이 미끄러진다.';
    assert.equal(seedanceText2VideoSchema.safeParse({ prompt: korean }).success, false);
    assert.equal(
      seedanceImg2VideoSchema.safeParse({ prompt: korean, sourceImagePath: '/tmp/a.png' }).success,
      false,
    );
    assert.equal(
      seedanceReferenceSchema.safeParse({ prompt: korean, referenceImagePaths: ['/tmp/a.png'] }).success,
      false,
    );
    // video prompts are English on every model, 2.5 included
    assert.equal(
      seedanceText2VideoSchema.safeParse({ prompt: korean, model: 'dreamina-seedance-2-5-260628' }).success,
      false,
    );
    // dialogue inside quotes is spoken, so it stays
    assert.equal(
      seedanceText2VideoSchema.safeParse({ prompt: 'the man leans in and says "딸깍" once.' }).success,
      true,
    );
    // and the message says what to do instead
    const issue = seedanceText2VideoSchema.safeParse({ prompt: korean }).error.issues
      .find((i) => i.path[0] === 'prompt');
    assert.match(issue.message, /video_prompt_language/);
  });

  it('the model capability table does not contradict itself', () => {
    for (const [model, spec] of Object.entries(SEEDANCE_MODEL_SPECS)) {
      assert.ok(spec.resolutions.length > 0, `${model}: resolutions is empty`);
      for (const resolution of spec.resolutions) {
        assert.ok(VALID_SEEDANCE_RESOLUTIONS.includes(resolution), `${model}: unknown resolution ${resolution}`);
      }
      const [min, max] = spec.duration;
      assert.ok(min > 0 && min <= max, `${model}: duration range is inverted`);
      // every model must accept the default duration — else a defaults call gets rejected per model
      assert.ok(
        DEFAULT_SEEDANCE_DURATION >= min && DEFAULT_SEEDANCE_DURATION <= max,
        `${model}: cannot take the default duration of ${DEFAULT_SEEDANCE_DURATION}s`,
      );
      // same for the default resolution — having to fix the resolution just because you switched models is a trap
      assert.ok(spec.resolutions.includes(DEFAULT_SEEDANCE_RESOLUTION), `${model}: cannot output the default resolution`);
    }
  });
});

describe('generated file path safety', () => {
  it('rejects file names containing path separators', () => {
    // path.join normalizes ../ away, so it must be blocked before assembly
    for (const bad of ['../escape.wav', 'sub/dir.wav', '..\\escape.wav', 'a/../../b.mp4']) {
      assert.throws(() => resolveOutputFile('/tmp', bad, 'audio'), /bare file name|Path traversal/);
    }
  });

  it('rejects disallowed extensions', () => {
    assert.throws(() => resolveOutputFile('/tmp', 'payload.sh', 'audio'), /not allowed/);
    assert.throws(() => resolveOutputFile('/tmp', 'clip.wav', 'video'), /not allowed/);
  });
});

describe('PCM → WAV header', () => {
  it('the RIFF header is assembled to spec', () => {
    const pcm = Buffer.alloc(960); // 48kHz stereo 16-bit, 5ms
    const wav = pcmToWav(pcm, 48_000, 2);

    assert.equal(wav.length, 44 + pcm.length);
    assert.equal(wav.subarray(0, 4).toString(), 'RIFF');
    assert.equal(wav.subarray(8, 12).toString(), 'WAVE');
    assert.equal(wav.readUInt32LE(4), 36 + pcm.length);
    assert.equal(wav.readUInt16LE(20), 1, 'PCM format tag');
    assert.equal(wav.readUInt16LE(22), 2, 'channel count');
    assert.equal(wav.readUInt32LE(24), 48_000, 'sample rate');
    assert.equal(wav.readUInt32LE(28), 48_000 * 2 * 2, 'byteRate');
    assert.equal(wav.readUInt16LE(32), 4, 'blockAlign');
    assert.equal(wav.readUInt16LE(34), 16, 'bitsPerSample');
    assert.equal(wav.readUInt32LE(40), pcm.length, 'dataSize');
  });
});

describe('Threads length counting', () => {
  it('counts emoji as UTF-8 bytes (removes the undercount of .length)', () => {
    // 🎬 is 2 UTF-16 units but 4 UTF-8 bytes — the platform counts bytes
    assert.equal('🎬'.length, 2, 'premise: JS .length counts 2');
    assert.equal(threadsTextLength('🎬'), 4);
    assert.equal(threadsTextLength('안녕하세요'), 5, 'Korean counts as 1 per code point');
    assert.equal(threadsTextLength('abc'), 3);
  });
});

/**
 * Multi-channel token resolution — a safety property preventing wrong-account
 * publishing, so it is pinned statically. snsTokenDir is fixed at module load,
 * so no env swapping: its value anchors the path relations verified here
 * (default ≠ channel scope).
 */
describe('multi-channel token resolution', () => {
  it('with a channel set, only that channel directory is used — no fallback to the default tokens', () => {
    for (const platform of SNS_PLATFORMS) {
      const scoped = snsCredentialFile(platform, 'brand-a');
      const fallback = snsCredentialFile(platform);
      assert.equal(dirname(scoped), join(snsTokenDir, 'brand-a'), `${platform} channel-scoped path`);
      assert.notEqual(scoped, fallback, `${platform}: a channel falling back to the default path publishes to another brand's account`);
      assert.equal(basename(scoped), basename(fallback), 'the file-name convention holds inside channel directories too');
    }
  });

  it('rejects path-traversal and convention-breaking slugs', () => {
    const rejected = ['..', '../etc', '.', 'a/b', 'a\\b', '/abs', 'UPPER', '-lead', 'dot.dot', 'with space', 'a'.repeat(65)];
    for (const channel of rejected) {
      assert.throws(
        () => snsCredentialFile('THREADS', channel),
        /Invalid channel slug/,
        `"${channel}" must be rejected — it feeds path assembly, so letting it pass escapes the token directory`,
      );
    }
  });
});

/**
 * With tool search on, Claude Code loads only tool names and these instructions at session
 * start, and it cuts the instructions at 4,096 characters. A tool name the server no longer
 * ships would send the model searching for nothing.
 */
describe('server instructions', () => {
  it('fit in what Claude Code loads at session start', () => {
    assert.ok(SERVER_INSTRUCTIONS.length > 0);
    assert.ok(SERVER_INSTRUCTIONS.length <= 4096, `${SERVER_INSTRUCTIONS.length} chars`);
  });

  it('name only tools the server ships', () => {
    const named = [...SERVER_INSTRUCTIONS.matchAll(/`([a-z][a-z0-9]*(?:_[a-z0-9]+)+)`/g)].map((m) => m[1]);
    assert.ok(named.length > 0, 'instructions name no tools');
    for (const name of named) assert.ok(byName.has(name), `instructions name unknown tool ${name}`);
  });
});

describe('apiErrorText', () => {
  it('warns that a failed publish may already be live on 5xx', () => {
    assert.match(apiErrorText({ ok: false, status: 504, body: 'Request timed out' }), /may already be live/);
  });
});

/**
 * The server version in the initialize response is a literal in index.ts.
 * Importing dist/index.js to read it would start the server on stdio, so the
 * two files are compared as text. It really was split 0.8.0 vs 0.9.0, caught
 * on 2026-08-16.
 */
describe('server version declaration', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const read = (rel) => readFileSync(join(here, '..', rel), 'utf8');

  it('the version in index.ts equals package.json', () => {
    const pkg = JSON.parse(read('package.json')).version;
    const src = read('src/index.ts');
    const declared = src.match(/name: 'social-flow', version: '([^']+)'/)?.[1];
    assert.ok(declared, "could not find the Server({ name, version }) literal in index.ts — if the declaration form changed, fix this test with it");
    assert.equal(
      declared,
      pkg,
      `the version initialize announces (${declared}) differs from the package version (${pkg}) — clients see a version that is not real`,
    );
  });
});

it('bundled MCP server dispatches reference payloads above 10 MiB', { timeout: 20_000 }, async (t) => {
  const child = spawn(process.execPath, [fileURLToPath(new URL('../dist/bundle.js', import.meta.url))], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const lines = createInterface({ input: child.stdout });
  const exited = new Promise(resolve => child.once('exit', resolve));
  t.after(async () => { lines.close(); child.kill(); await exited; });
  child.stderr.resume();
  const responses = lines[Symbol.asyncIterator]();
  const send = message => child.stdin.write(JSON.stringify(message) + '\n');
  const receive = async () => {
    const line = await responses.next();
    assert.equal(line.done, false, 'server closed before responding');
    return JSON.parse(line.value);
  };
  send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
    protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'transport-test', version: '1' },
  } });
  assert.equal((await receive()).id, 1);
  send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  // An unknown tool proves dispatch without invoking a provider or spending money.
  const request = { jsonrpc: '2.0', id: 2, method: 'tools/call', params: {
    name: 'transport_test_unknown', arguments: {
      sourceImagesBase64: Array(3).fill(Buffer.alloc(3 * 1024 * 1024).toString('base64')),
    },
  } };
  assert.ok(Buffer.byteLength(JSON.stringify(request)) > 10 * 1024 * 1024);
  send(request);
  const response = await receive();
  assert.equal(response.id, 2);
  assert.equal(response.error.code, -32602);
  send({ jsonrpc: '2.0', id: 3, method: 'ping' });
  assert.deepEqual(await receive(), { jsonrpc: '2.0', id: 3, result: {} });
});
