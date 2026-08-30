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
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import {
  CHANNEL_SLUG_RE,
  SNS_PLATFORMS,
  disabledToolPatterns,
  isToolDisabled,
  snsCredentialFile,
  snsTokenDir,
} from '../dist/config.js';
import { SNS_PLATFORM_BY_TOOL, TOOLS } from '../dist/tools.js';
import { ROUTES, threadsTextLength } from '../dist/handlers.js';
import { TTS_VOICE_NAMES, VALID_TTS_MODELS } from '../dist/tts-client.js';
import {
  DEFAULT_SUPERTONIC_LANGUAGE,
  MAX_SUPERTONIC_INPUT_CHARS,
  SUPERTONIC_LANGUAGES,
  SUPERTONIC_SAMPLE_RATE,
  SUPERTONIC_VOICE_NAMES,
} from '../dist/supertonic-client.js';
import {
  DEFAULT_ELEVENLABS_MODEL,
  DEFAULT_ELEVENLABS_OUTPUT_FORMAT,
  ELEVENLABS_DIALOGUE_MAX_INPUTS,
  ELEVENLABS_MODELS,
  ELEVENLABS_OUTPUT_FORMATS,
  ELEVENLABS_TEXT_NORMALIZATION,
  ELEVENLABS_VOICE_CATEGORIES,
  MAX_ELEVENLABS_INPUT_CHARS,
} from '../dist/elevenlabs-client.js';
import { MUSIC_GENERATION_MODES, MUSIC_SCALES } from '../dist/music-client.js';
import { DEFAULT_VIDEO_MODEL, img2VideoSchema } from '../dist/video-client.js';
import {
  DEFAULT_SEEDANCE_DURATION,
  DEFAULT_SEEDANCE_MODEL,
  DEFAULT_SEEDANCE_REFERENCE_MODEL,
  DEFAULT_SEEDANCE_RESOLUTION,
  SEEDANCE_MODEL_SPECS,
  SEEDANCE_REAL_FACE_MODELS,
  SEEDANCE_REFERENCE_MODELS,
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
  ZIMAGE_DIMENSION_STEP,
  ZIMAGE_QUANTIZE_OPTIONS,
  zimageTimeoutMs,
} from '../dist/zimage-client.js';
import {
  IMAGE_ASPECTS,
  IMAGE_LICENSES,
  IMAGE_SIZES,
  IMAGE_TYPES,
  SERP_IMAGE_MAX_LIMIT,
  SERP_NAVER_MAX_LIMIT,
  SERP_NAVER_PERIODS,
  SERP_NEWS_MAX_LIMIT,
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

  for (const tool of TOOLS) {
    describe(tool.name, () => {
      it('name follows the snake_case namespace convention', () => {
        assert.match(tool.name, /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/);
      });

      it('has a title and a description', () => {
        assert.equal(typeof tool.title, 'string');
        assert.ok(tool.title.trim().length > 0, 'title is empty');
        assert.ok(tool.title.length <= 60, `title too long (${tool.title.length} chars)`);
        assert.ok((tool.description ?? '').trim().length >= 40, 'description missing or too short');
      });

      it('inputSchema is a valid object schema', () => {
        assert.equal(tool.inputSchema?.type, 'object');
        const properties = tool.inputSchema.properties ?? {};
        for (const key of tool.inputSchema.required ?? []) {
          assert.ok(key in properties, `"${key}" is in required but not in properties`);
        }
      });

      it('every parameter has a description', () => {
        for (const [path, schema] of walkProperties(tool.inputSchema)) {
          assert.ok(
            typeof schema.description === 'string' && schema.description.trim().length > 0,
            `"${path}" has no description — the model cannot know what to pass`,
          );
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

/**
 * Parameter naming convention.
 *
 * When names wobble per tool (q vs query, num vs display vs max_results),
 * the model has to relearn arguments every time it switches tools, and that
 * cost comes back as wrong-argument calls → -32602 round trips. Even where
 * the backend API uses q/display/num, that mapping is the client layer's
 * job, not the tool surface's.
 */
describe('parameter naming convention', () => {
  const SEARCH_TOOLS = TOOLS.filter((t) => t.name.endsWith('_search'));

  it('search tools exist (the filter is not spinning empty)', () => {
    assert.ok(SEARCH_TOOLS.length >= 5, `only ${SEARCH_TOOLS.length} search tools — the filter may be wrong`);
  });

  /**
   * Even non-search tools taking result counts and pages must use the same
   * names. Hooking only on the `_search` suffix lets differently named
   * lookup tools like datago_file_fetch slip the net — perPage actually
   * survived that way.
   */
  it('pagination argument names are uniform server-wide', () => {
    const offenders = [];
    for (const tool of TOOLS) {
      for (const [path] of walkProperties(tool.inputSchema)) {
        const key = path.split('.').pop().replace(/\[\]$/, '');
        if (['perPage', 'pageSize', 'maxResults', 'numResults', 'count'].includes(key)) {
          offenders.push(`${tool.name}.${path}`);
        }
      }
    }
    assert.deepEqual(offenders, [], `result-count arguments are unified as limit: ${offenders.join(', ')}`);
  });

  for (const tool of TOOLS) {
    it(`${tool.name}: parameters are camelCase`, () => {
      for (const [path] of walkProperties(tool.inputSchema)) {
        const key = path.split('.').pop().replace(/\[\]$/, '');
        // external-API standard abbreviations like gl/hl/q are exempt — renaming them blurs the mapping
        if (['gl', 'hl', 'uddi'].includes(key)) continue;
        assert.ok(
          /^[a-z][a-zA-Z0-9]*$/.test(key),
          `"${tool.name}.${path}" is not camelCase (no snake_case — the server-wide convention is camelCase)`,
        );
      }
    });
  }

  /**
   * Same name, different meaning turns unification into a trap.
   *
   * It bit twice for real: naver_search forwarded the API's start (item
   * offset) as page, so page=2 meant "from the 2nd item", and serp_web_search
   * computed the offset as a limit multiple, overlapping pages when limit≠10.
   * Both silently return duplicate results with no error, so the description
   * pins "page" to surface the contract.
   */
  for (const tool of SEARCH_TOOLS) {
    const pageSchema = tool.inputSchema.properties?.page;
    if (!pageSchema) continue;
    it(`${tool.name}: the description states page is a page number`, () => {
      assert.match(
        pageSchema.description ?? '',
        /[Pp]age number/,
        'page is a page number, not an item offset — the client owns the mapping, and the description must surface that contract',
      );
      assert.ok(
        !/offset|start/i.test(pageSchema.description ?? ''),
        'the page description must not leak offset semantics — the tool surface is pages',
      );
    });
  }

  for (const tool of SEARCH_TOOLS) {
    it(`${tool.name}: uses the shared search-tool argument names`, () => {
      const props = tool.inputSchema.properties ?? {};
      const banned = {
        q: 'query',
        keyword: 'query',
        num: 'limit',
        max_results: 'limit',
        maxResults: 'limit',
        display: 'limit',
        perPage: 'limit',
        count: 'limit',
        start: 'page',
        sort_by: 'sort',
        sortBy: 'sort',
      };
      // arguments inside nested objects follow the same convention — checking
      // only the top level lets a q/num hidden one layer down pass untouched
      for (const [path] of walkProperties(tool.inputSchema)) {
        const key = path.split('.').pop().replace(/\[\]$/, '');
        const good = banned[key];
        assert.ok(!good, `"${tool.name}.${path}" must be unified as the shared search argument "${good}"`);
      }
      // a tool that takes search terms names them query, and query is required
      assert.ok('query' in props, `${tool.name} has no query — the search-term argument of a search tool is named query`);
      assert.ok(
        (tool.inputSchema.required ?? []).includes('query'),
        `${tool.name}.query is not required`,
      );
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
    assert.equal(isToolDisabled('veo_text2video', ['seedance_*']), false);
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

  it('the documented seedance family pattern hides exactly the three seedance tools', () => {
    const hidden = TOOLS.filter((tool) => isToolDisabled(tool.name, ['seedance_*'])).map((t) => t.name).sort();
    assert.deepEqual(hidden, ['seedance_img2video', 'seedance_reference', 'seedance_text2video']);
  });
});

describe('suno_* tools', () => {
  const SUNO = ['suno_generate', 'suno_generate_sound', 'suno_generate_lyrics', 'suno_credits'];

  it('all four suno tools are listed and routed', () => {
    for (const name of SUNO) {
      assert.ok(TOOLS.some((tool) => tool.name === name), `missing tool ${name}`);
      assert.equal(typeof ROUTES[name], 'function', `missing route ${name}`);
    }
  });

  it('suno_generate describes the third-party REST and does not claim an official Suno API', () => {
    const tool = TOOLS.find((t) => t.name === 'suno_generate');
    assert.match(tool.description, /sunoapi\.org/);
    assert.match(tool.description, /no public self-serve API/);
    assert.match(tool.description, /SUNO_API_KEY/);
    assert.match(tool.description, /does not block music_/);
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

  it('read-only tools carry no destructive warning', () => {
    for (const tool of TOOLS.filter((t) => t.annotations?.readOnlyHint === true)) {
      assert.ok(
        !tool.description.includes('immediately public'),
        `${tool.name} — readOnly yet the description says "immediately public"`,
      );
    }
  });
});

describe('Threads growth lookup tools', () => {
  // The insights/search scopes may be missing from publish-issued tokens —
  // without the scope name in the description, a caller hitting 403 cannot
  // know the next move (reissue).
  const scopeByTool = {
    threads_insights: 'threads_manage_insights',
    threads_search: 'threads_keyword_search',
  };

  for (const [name, scope] of Object.entries(scopeByTool)) {
    describe(name, () => {
      it('is gated on THREADS credentials', () => {
        assert.equal(SNS_PLATFORM_BY_TOOL[name], 'THREADS');
      });

      it('is marked read-only (no side effects — no approval prompt needed)', () => {
        assert.equal(byName.get(name)?.annotations?.readOnlyHint, true);
      });

      it(`the description names the required scope (${scope})`, () => {
        assert.ok(byName.get(name)?.description.includes(scope), `"${scope}" wording missing`);
      });
    });
  }

  it('the threads_search description states the search quota', () => {
    assert.match(byName.get('threads_search').description, /2,?200/, 'no 24h rolling quota wording');
  });
});

describe('Instagram growth lookup tool', () => {
  const tool = () => byName.get('instagram_insights');

  it('is gated on INSTAGRAM credentials', () => {
    assert.equal(SNS_PLATFORM_BY_TOOL.instagram_insights, 'INSTAGRAM');
  });

  it('is marked read-only (no side effects — no approval prompt needed)', () => {
    assert.equal(tool()?.annotations?.readOnlyHint, true);
  });

  // Tokens issued for publishing lack the insights scope — without the scope
  // name in the description, a caller hitting an error cannot know what to reissue.
  it('the description names the required scope (instagram_business_manage_insights)', () => {
    assert.ok(tool()?.description.includes('instagram_business_manage_insights'), 'scope wording missing');
  });

  // Measured: requesting reels metrics on FEED media fails the whole response
  // with a 400. Without the reels-only list in the description, callers go
  // looking for them on images too.
  it('the description names the reels-only metrics together with their condition', () => {
    const description = tool().description;
    for (const metric of ['ig_reels_avg_watch_time', 'reels_skip_rate']) {
      assert.ok(description.includes(metric), `"${metric}" wording missing`);
    }
    assert.match(description, /REELS/, 'no reels-only condition');
  });

  // Measured: the insights follower_count returns an empty array for accounts
  // with fewer than 100 followers. Fatal, since this tool targets brand-new
  // channels sitting at 0 followers.
  it('the description states the follower count comes from the profile field', () => {
    assert.match(tool().description, /followersCount/, 'no follower-count source guidance');
    assert.match(tool().description, /fewer than 100/, 'no warning about the insights follower_count limit');
  });

  it('the output schema requires account, period, user, and media', () => {
    assert.deepEqual(tool()?.outputSchema?.required, ['account', 'period', 'user', 'media']);
  });
});

describe('YouTube growth lookup tool', () => {
  const tool = () => byName.get('youtube_insights');

  it('is gated on YOUTUBE credentials', () => {
    assert.equal(SNS_PLATFORM_BY_TOOL.youtube_insights, 'YOUTUBE');
  });

  it('is marked read-only (no side effects — no approval prompt needed)', () => {
    assert.equal(tool()?.annotations?.readOnlyHint, true);
  });

  // Existing tokens were issued with youtube.upload alone — without the scope
  // name in the description, a caller hitting 403 cannot know what to reissue.
  for (const scope of ['youtube.readonly', 'yt-analytics.readonly', 'yt-analytics-monetary.readonly']) {
    it(`the description names the required scope (${scope})`, () => {
      assert.ok(tool()?.description.includes(scope), `"${scope}" wording missing`);
    });
  }

  it('the description warns about the Analytics data lag', () => {
    assert.match(tool().description, /2-3 days/, 'no lag warning — an empty recent window gets misread as an outage');
  });

  it('the description states the swipe-away rate is unavailable', () => {
    // leave a metric the API lacks looking available and callers keep hunting for it
    assert.match(tool().description, /swipe/, 'no notice that the swipe-away rate is absent');
  });
});

describe('AI-generated content disclosure (YouTube)', () => {
  const publish = () => byName.get('youtube_publish');

  it('has a containsSyntheticMedia parameter', () => {
    assert.ok(publish()?.inputSchema.properties.containsSyntheticMedia, 'no synthetic-media disclosure argument');
  });

  // This pipeline uses Veo video and Lyria music. A false default makes
  // non-disclosure the default behavior, and habitual non-disclosure is
  // grounds for forced labels, removal, and YPP suspension.
  it('defaults to true (non-disclosure never becomes the default)', () => {
    assert.equal(publish().inputSchema.properties.containsSyntheticMedia.default, true);
  });

  it('the description lists the exemptions (not knowing when to turn it off means it stays on)', () => {
    assert.match(
      publish().inputSchema.properties.containsSyntheticMedia.description,
      /exempt/,
      'no exemption guidance',
    );
  });
});

describe('separate subtitle upload contract', () => {
  // This pipeline uploads subtitles as files instead of burning them in. So the
  // platforms that take a subtitle file must have the argument, and the platform
  // that cannot (IG) must not — give IG a subtitle argument and callers upload
  // the clean master while the subtitles silently disappear.
  const yt = () => byName.get('youtube_publish');
  const fb = () => byName.get('facebook_publish');
  const ig = () => byName.get('instagram_publish');

  it('YouTube takes subtitle file and language arguments', () => {
    assert.ok(yt()?.inputSchema.properties.captionFilePath, 'no captionFilePath');
    assert.ok(yt()?.inputSchema.properties.captionLanguage, 'no captionLanguage');
  });

  it('Facebook takes subtitle file and locale arguments', () => {
    assert.ok(fb()?.inputSchema.properties.captionFilePath, 'no captionFilePath');
    assert.ok(fb()?.inputSchema.properties.captionLocale, 'no captionLocale');
  });

  it('Instagram has no subtitle file argument (the platform does not take one)', () => {
    assert.equal(ig()?.inputSchema.properties.captionFilePath, undefined);
  });

  it('the Instagram videoUrl description demands the burned-in master', () => {
    // this is the only place subtitles live in the frame — without the note, the clean master goes up
    assert.match(ig().inputSchema.properties.videoUrl.description, /burned-in/, 'no burned-in requirement');
  });

  it('the YouTube subtitle description mentions the force-ssl scope', () => {
    // captions.insert is rejected on the publish-only youtube.upload — unaware callers upload video only
    assert.match(yt().inputSchema.properties.captionFilePath.description, /force-ssl/);
  });

  it('the YouTube subtitle description mentions the 400-unit quota', () => {
    // 400x the 1-unit upload — it changes how often you would call
    assert.match(yt().inputSchema.properties.captionFilePath.description, /400 units/);
  });

  it('the Facebook locale description mentions the file-name contract', () => {
    // FB derives the locale from the uploaded file name `<name>.<locale>.srt`
    assert.match(fb().inputSchema.properties.captionLocale.description, /ko_KR/);
  });

  it('YouTube takes multi-language caption tracks (filePath + BCP-47 language per entry)', () => {
    const tracks = yt()?.inputSchema.properties.captionTracks;
    assert.ok(tracks, 'no captionTracks');
    assert.equal(tracks.type, 'array');
    assert.ok(tracks.items?.properties?.filePath, 'no items.filePath');
    assert.ok(tracks.items?.properties?.language, 'no items.language');
    assert.deepEqual(tracks.items?.required, ['filePath', 'language']);
    // one list only — passing both the single pair and the list is ambiguous
    assert.match(tracks.description, /[Mm]utually exclusive/, 'no mutual-exclusion note');
  });

  it('Facebook takes multi-language caption files (filePath + locale per entry, first = default)', () => {
    const files = fb()?.inputSchema.properties.captionFiles;
    assert.ok(files, 'no captionFiles');
    assert.equal(files.type, 'array');
    assert.ok(files.items?.properties?.filePath, 'no items.filePath');
    assert.ok(files.items?.properties?.locale, 'no items.locale');
    assert.deepEqual(files.items?.required, ['filePath', 'locale']);
    // default_locale rides on the first entry only — callers must know the order matters
    assert.match(files.description, /first/i, 'no first-entry-default note');
  });

  it('Instagram has no multi-language caption argument either', () => {
    assert.equal(ig()?.inputSchema.properties.captionTracks, undefined);
    assert.equal(ig()?.inputSchema.properties.captionFiles, undefined);
  });

  it('both tool outputs list the uploaded caption languages', () => {
    assert.ok(yt()?.outputSchema?.properties?.captionLanguages, 'youtube_publish: no captionLanguages');
    assert.ok(fb()?.outputSchema?.properties?.captionLocales, 'facebook_publish: no captionLocales');
  });

  it('both tool outputs expose captionSet and captionWarning', () => {
    for (const [name, tool] of [['youtube_publish', yt()], ['facebook_publish', fb()]]) {
      assert.ok(tool.outputSchema?.properties?.captionSet, `${name}: no captionSet`);
      assert.ok(tool.outputSchema?.properties?.captionWarning, `${name}: no captionWarning`);
    }
  });

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

  it('the description states the vertical-surface limit (this argument changes landscape surfaces only)', () => {
    // the vertical frame (oar*) in the Shorts feed and channel Shorts tab changes only via app frame selection
    assert.match(yt().inputSchema.properties.thumbnailFilePath.description, /vertical[ -](surface|frame)/, 'no vertical-surface guidance');
  });
});

describe('YouTube per-format caption contract (16:9 long-form lane)', () => {
  // One tool takes both formats, so the caption description has to split them.
  // Otherwise the model attaches #Shorts to long-form descriptions too, and
  // the video is misclassified onto the Shorts surface.
  // Why caption is the target — the youtube_publish schema has no hashtags or
  // description properties at all. The only place the #Shorts instruction can
  // live is the description line of the required caption.
  const yt = () => byName.get('youtube_publish');

  it('the #Shorts instruction sits inside the Shorts branch', () => {
    assert.match(
      yt().inputSchema.properties.caption.description,
      /9:16 Shorts[^]{0,120}#Shorts/,
      'the #Shorts instruction sits outside the Shorts branch — the model attaches it to long-form descriptions too',
    );
  });

  it('names the long-form branch', () => {
    assert.match(yt().inputSchema.properties.caption.description, /16:9|long-form/);
  });

  it('guides long-form toward chapter timestamps', () => {
    assert.match(yt().inputSchema.properties.caption.description, /chapter|timestamp/i);
  });

  it('the thumbnail description speaks to landscape long-form too', () => {
    assert.match(yt().inputSchema.properties.thumbnailFilePath.description, /landscape/);
  });
});

describe('Threads post-media contract', () => {
  // A video episode carries the video on the post itself (videoUrl), not as a
  // reply and not as a bare link (user directive 2026-08-19). One media_type per
  // post, so the three media fields are mutually exclusive.
  const th = () => byName.get('threads_publish');
  const props = () => th().inputSchema.properties;

  it('takes a videoUrl argument (video on the post)', () => {
    assert.equal(props().videoUrl?.format, 'uri', 'videoUrl missing or not uri format');
  });

  it('takes a linkUrl argument (link preview card)', () => {
    assert.equal(props().linkUrl?.format, 'uri', 'linkUrl missing or not uri format');
  });

  it('all three media descriptions state they are mutually exclusive', () => {
    // sent together, the platform rejects at container creation — the schema description blocks it first
    for (const k of ['imageUrl', 'videoUrl', 'linkUrl']) {
      assert.match(props()[k].description, /mutually exclusive/, `no exclusivity note in the ${k} description`);
    }
  });

  it('the videoUrl description asks for the burned-in copy', () => {
    // Threads has no subtitle parameter, so a clean master ships without subtitles
    assert.match(props().videoUrl.description, /subtitle-burned|burned-in/i, 'videoUrl does not ask for the burn-in');
  });

  it('the tool description does not fall back to the link-reply strategy', () => {
    // if the old strategy ("body + full-video link reply") lingers in the
    // description, callers publish one more reply and the video goes out twice
    assert.doesNotMatch(th().description, /link reply|the link in a reply/, 'the old link-reply strategy lingers in the description');
  });

  it('argument name matches IG (the video of a post = videoUrl)', () => {
    assert.ok(byName.get('instagram_publish').inputSchema.properties.videoUrl, 'IG videoUrl has vanished');
  });

  it('argument name matches FB (the link of a text post = linkUrl)', () => {
    assert.ok(byName.get('facebook_publish').inputSchema.properties.linkUrl, 'FB linkUrl has vanished');
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

  it('YOUTUBE is included in inbox and reply', () => {
    assert.ok(inboxEnum.includes('YOUTUBE'), 'no YOUTUBE in the inbox');
    assert.ok(replyEnum.includes('YOUTUBE'), 'no YOUTUBE in reply');
  });

  it('hide/like do not take YOUTUBE', () => {
    // setModerationStatus means something other than "reversible hide" — no mapping
    assert.ok(!moderateEnum.includes('YOUTUBE'), 'YOUTUBE is in the hide targets');
  });

  it('the reply tool description explains the YouTube top-level-comment constraint', () => {
    assert.match(byName.get('sns_comment_reply').description, /YOUTUBE/, 'no YouTube contract explanation');
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

  it('search-tool limit caps agree between tool descriptions and the canonical constants', () => {
    // if the "max N" written in the description differs from the real cap, the model sends values it cannot honor
    const capInDescription = (toolName) => {
      const desc = byName.get(toolName).inputSchema.properties.limit.description ?? '';
      const m = desc.match(/max\s*(\d+)/i);
      return m ? Number(m[1]) : null;
    };
    assert.equal(capInDescription('serp_news_search'), SERP_NEWS_MAX_LIMIT);
    assert.equal(capInDescription('serp_naver_search'), SERP_NAVER_MAX_LIMIT);
    assert.equal(capInDescription('serp_image_search'), SERP_IMAGE_MAX_LIMIT);
    // the remaining search tools get the same guard — cover only three and the rest drift
    assert.equal(capInDescription('serp_web_search'), 10);
    assert.equal(capInDescription('naver_search'), 30);
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

  it('music scale/mode enums match the music-client source of truth', () => {
    assert.deepEqual(enumOf('music_generate_advanced', 'config.scale'), [...MUSIC_SCALES]);
    assert.deepEqual(enumOf('music_generate_advanced', 'config.musicGenerationMode'), [
      ...MUSIC_GENERATION_MODES,
    ]);
  });

  it('local TTS voice/language enums match the supertonic-client source of truth', () => {
    assert.deepEqual(enumOf('tts_local_generate', 'voice'), [...SUPERTONIC_VOICE_NAMES]);
    assert.deepEqual(enumOf('tts_local_generate', 'lang'), [...SUPERTONIC_LANGUAGES]);
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
  });
});

/**
 * Pins as contract the fact that the two speech lanes are different things.
 *
 * Local (Supertonic) and Gemini are both named tts_*, so callers swap them
 * easily — yet the sample rate (44.1kHz vs 24kHz) and whether acted delivery
 * is possible differ. Lose that boundary in the descriptions and the two mix
 * inside one video, breaking the splice.
 */
describe('speech lane separation (local · Gemini)', () => {
  const local = byName.get('tts_local_generate');

  it('local synthesis is marked as not touching the network', () => {
    assert.equal(local.annotations.openWorldHint, false, 'openWorldHint is open');
    assert.equal(local.annotations.readOnlyHint, false);
  });

  it('the local tool description gives the Python runtime requirement and install steps', () => {
    assert.match(local.description, /pip install supertonic/, 'no install guidance');
    assert.match(local.description, /SUPERTONIC_PYTHON/, 'no venv selection method');
  });

  it('the local tool description notes the weight license (OpenRAIL-M)', () => {
    // the code is MIT but the weights carry use-based restrictions — the audio ships in posts, so it must be flagged
    assert.match(local.description, /OpenRAIL-M/, 'no weight-license caution');
  });

  it('the description warns about the sample-rate difference between the two engines', () => {
    assert.match(local.description, /44\.1kHz/, 'no local output spec');
    assert.match(local.description, /24kHz/, 'no warning about the difference from the Gemini spec');
    assert.equal(SUPERTONIC_SAMPLE_RATE, 44_100);
  });

  it('routes cuts needing acted delivery to Gemini — local has no style argument', () => {
    assert.ok(!('stylePrompt' in local.inputSchema.properties), 'a stylePrompt appeared on local');
    assert.match(local.description, /tts_generate/, 'no Gemini lane guidance');
  });

  it('language is an argument, not auto-detected (the opposite of Gemini)', () => {
    // Gemini detects the language from the text, while Supertonic uses the code even for chunking
    assert.equal(local.inputSchema.properties.lang.default, DEFAULT_SUPERTONIC_LANGUAGE);
    assert.ok(!('lang' in byName.get('tts_generate').inputSchema.properties));
  });

  it('both lanes share the same input cap — so swapping never trips', () => {
    assert.equal(local.inputSchema.properties.text.maxLength, MAX_SUPERTONIC_INPUT_CHARS);
    assert.equal(
      byName.get('tts_generate').inputSchema.properties.text.maxLength,
      MAX_SUPERTONIC_INPUT_CHARS,
    );
  });
});

/**
 * The third speech lane (ElevenLabs) is paid and account-specific, so its
 * contract is the opposite of the two above on three points: the voice is a
 * required account ID with no default, the file that comes back has to be RIFF
 * for the builder, and the voice listing is a separate keyed tool instead of a
 * server constant. Lose any of these from the surface and a profile engine
 * switch breaks at runtime.
 */
describe('speech lane separation (ElevenLabs)', () => {
  const generate = byName.get('tts_elevenlabs_generate');
  const dialogue = byName.get('tts_elevenlabs_dialogue');
  const voices = byName.get('tts_elevenlabs_voices');

  it('the three tools exist with the right behavior hints', () => {
    for (const tool of [generate, dialogue]) {
      assert.equal(tool.annotations.readOnlyHint, false);
      assert.equal(tool.annotations.openWorldHint, true, 'paid API — open world');
      assert.equal(tool.annotations.destructiveHint, false);
    }
    assert.equal(voices.annotations.readOnlyHint, true);
    assert.equal(voices.annotations.openWorldHint, true, 'account listing is an API call, not a constant');
  });

  it('voiceId is required with no default on both synthesis tools — the premade set rotates', () => {
    for (const tool of [generate]) {
      assert.ok(tool.inputSchema.required.includes('voiceId'), `${tool.name} voiceId not required`);
      assert.ok(!('default' in tool.inputSchema.properties.voiceId), `${tool.name} has a default voice`);
      assert.match(tool.inputSchema.properties.voiceId.description, /tts_elevenlabs_voices/, 'no pointer to the listing');
    }
    const item = dialogue.inputSchema.properties.inputs.items;
    assert.ok(item.required.includes('voiceId') && item.required.includes('text'));
    assert.equal(dialogue.inputSchema.properties.inputs.maxItems, ELEVENLABS_DIALOGUE_MAX_INPUTS);
    assert.ok(!('model' in dialogue.inputSchema.properties), 'dialogue is v3-only — no model argument');
  });

  it('the output contract names the RIFF default and warns that mp3 is not builder input', () => {
    for (const tool of [generate, dialogue]) {
      assert.match(tool.inputSchema.properties.outputFormat.description, /wav_24000/, `${tool.name} default not named`);
      assert.match(tool.inputSchema.properties.outputFormat.description, /RIFF/, `${tool.name} no RIFF note`);
      assert.match(tool.inputSchema.properties.outputFormat.description, /wav_44100.*Pro/, `${tool.name} no tier gate note`);
    }
    assert.match(generate.description, /RIFF/);
  });

  it('input caps: schema cap is the default model cap, the v3 cap is spelled out', () => {
    assert.equal(generate.inputSchema.properties.text.maxLength, MAX_ELEVENLABS_INPUT_CHARS);
    assert.match(generate.inputSchema.properties.text.description, /5000 on eleven_v3/);
  });

  it('routes the caller: cost vs the other lanes, dialogue vs single, voices vs tts_list_voices', () => {
    assert.match(generate.description, /tts_local_generate/, 'no free-lane pointer');
    assert.match(generate.description, /tts_elevenlabs_dialogue/, 'no dialogue pointer');
    assert.match(generate.description, /non-commercial/, 'no free-tier license caution');
    assert.match(dialogue.description, /tts_multi_speaker/, 'no Gemini 2-speaker contrast');
    assert.match(voices.description, /voices_read/, 'no permission note');
    assert.match(voices.description, /tts_list_voices/, 'no pointer to the static list');
    assert.match(byName.get('tts_list_voices').description, /tts_elevenlabs_voices/, 'the static list does not point at the third lane');
  });

  it('pagination on the voice listing uses the server-wide `limit` name', () => {
    assert.ok('limit' in voices.inputSchema.properties);
    assert.equal(voices.inputSchema.properties.limit.maximum, 100);
  });
});

/**
 * Pins the division of the two image lanes as contract (same structure as the
 * speech lane separation).
 *
 * Local (Z-Image) is the default and only text-bearing/high-quality jobs go
 * to gpt_image — lose this routing from the descriptions and a lettered cover
 * goes local and publishes with broken Korean glyphs, or every text-free
 * b-roll goes down the billed lane. The measured evidence is
 * docs/research/2026-08-12-local-image-generation.
 */
describe('image lane separation (local · OpenAI)', () => {
  const local = byName.get('image_local_generate');
  const paid = byName.get('gpt_image_text2img');

  it('local generation is marked as not touching the network', () => {
    assert.equal(local.annotations.openWorldHint, false, 'openWorldHint is open');
    assert.equal(local.annotations.readOnlyHint, false);
  });

  it('the local tool description gives the mflux install and binary override', () => {
    assert.match(local.description, /uv tool install --python 3\.12 mflux/, 'no install guidance');
    assert.match(local.description, /MFLUX_ZIMAGE_BIN/, 'no binary path override method');
  });

  it('the local tool description warns about the large first-call download', () => {
    // call it unaware of the 31GB and you misread it as "stuck" and kill it — flag the download in advance
    assert.match(local.description, /31GB/, 'no weight-download warning');
  });

  it('routes text-bearing images to gpt_image — with the measured Korean evidence', () => {
    assert.match(local.description, /gpt_image_text2img/, 'no billed-lane guidance');
    assert.match(local.description, /딸깍연구소/, 'no measured Korean-rendering evidence');
  });

  it('the gpt_image description gives the reverse routing (the default is local)', () => {
    assert.match(paid.description, /image_local_generate/, 'no local-default-lane guidance');
  });

  it('the generation nudge in serp_image_search points at both lanes', () => {
    assert.match(byName.get('serp_image_search').description, /image_local_generate/);
  });

  it('the quantization enum matches the zimage-client source of truth', () => {
    assert.deepEqual(local.inputSchema.properties.quantize.enum, [...ZIMAGE_QUANTIZE_OPTIONS]);
    assert.equal(local.inputSchema.properties.quantize.default, DEFAULT_ZIMAGE_QUANTIZE);
    assert.equal(local.inputSchema.properties.steps.default, DEFAULT_ZIMAGE_STEPS);
  });

  it('the schema description states the resolution constraint (multiple of 16) — the 1080×1920 trap', () => {
    // calling 9:16 as 1080 is the most common first mistake — the description blocks it before it trips
    assert.match(local.inputSchema.properties.width.description, /1088/);
    assert.equal(Number(local.inputSchema.properties.width.description.match(/multiple of (\d+)/)?.[1]), ZIMAGE_DIMENSION_STEP);
  });

  it('the timeout covers the measured worst case with headroom', () => {
    // measured: 1088×1920 @9 steps, 462s under load-74 overload — allow at least double that
    assert.ok(zimageTimeoutMs(1088, 1920, 9) > 462_000 * 2, 'the 9:16 timeout is tight against the measurement');
    // capped at 30 minutes — never hangs on indefinitely
    assert.ok(zimageTimeoutMs(2048, 2048, 50) <= 30 * 60_000);
  });
});

/**
 * Pins the division of the two video engines as contract (same structure as
 * the speech/image lane separations).
 *
 * Veo has native audio and local-file extension; Seedance has free lengths
 * and ratios plus far cheaper silent cuts. Lose this division from the
 * descriptions and callers grab whichever tool sits at the top of the list —
 * then a 4-second b-roll bills as 8 seconds, or a photoreal-person cover
 * routes to 2.x, which rejects face input, and the whole episode stalls.
 *
 * Enums must match the values derived from the seedance-client.ts capability
 * table — copy the list into the schema and only one side gets fixed when a
 * model is added.
 */
describe('video engine separation (Veo · Seedance)', () => {
  const t2v = byName.get('seedance_text2video');
  const i2v = byName.get('seedance_img2video');
  const ref = byName.get('seedance_reference');

  it('all three tools exist and carry generation hints', () => {
    for (const tool of [t2v, i2v, ref]) {
      assert.ok(tool, 'a seedance tool is missing');
      assert.equal(tool.annotations.readOnlyHint, false);
      assert.equal(tool.annotations.destructiveHint, false, 'a file-only generation tool is marked destructive');
      assert.equal(tool.annotations.openWorldHint, true, 'an external API call yet marked closed');
    }
  });

  it('model/resolution/ratio enums match the seedance-client source of truth', () => {
    assert.deepEqual(t2v.inputSchema.properties.model.enum, VALID_SEEDANCE_MODELS);
    assert.deepEqual(t2v.inputSchema.properties.resolution.enum, VALID_SEEDANCE_RESOLUTIONS);
    assert.deepEqual(t2v.inputSchema.properties.ratio.enum, VALID_SEEDANCE_RATIOS);
    assert.equal(t2v.inputSchema.properties.model.default, DEFAULT_SEEDANCE_MODEL);
    assert.equal(t2v.inputSchema.properties.resolution.default, DEFAULT_SEEDANCE_RESOLUTION);
    assert.equal(t2v.inputSchema.properties.durationSeconds.default, DEFAULT_SEEDANCE_DURATION);
  });

  it('the reference tool model enum is narrowed to 2.x — 1.x cannot take reference images', () => {
    assert.deepEqual(ref.inputSchema.properties.model.enum, SEEDANCE_REFERENCE_MODELS);
    assert.ok(SEEDANCE_REFERENCE_MODELS.length > 0, 'no reference-capable model at all');
    for (const model of SEEDANCE_REFERENCE_MODELS) {
      assert.notEqual(SEEDANCE_MODEL_SPECS[model].referenceImages, false);
    }
    // the default model (1.5 pro) takes no references, so it cannot be this tool's default
    assert.ok(!SEEDANCE_REFERENCE_MODELS.includes(DEFAULT_SEEDANCE_MODEL));
  });

  it('all three tools can output 9:16 — this pipeline\'s default format', () => {
    for (const tool of [t2v, i2v, ref]) {
      assert.ok(tool.inputSchema.properties.ratio.enum.includes('9:16'), `${tool.name} lacks 9:16`);
    }
  });

  it('image-input tools default ratio to adaptive — prevents the cropped-source accident', () => {
    for (const tool of [i2v, ref]) {
      assert.equal(tool.inputSchema.properties.ratio.default, 'adaptive', `${tool.name} has a source-cropping default`);
    }
    assert.match(i2v.inputSchema.properties.ratio.description, /crop/, 'no crop warning in the description');
  });

  it('the audio default is the opposite of the vendor (false) and the reason is in the description', () => {
    // this pipeline attaches narration separately via tts_*. Leave the vendor
    // default (true) and 1.5 pro doubles in price with two voice layers stacked.
    for (const tool of [t2v, i2v, ref]) {
      assert.equal(tool.inputSchema.properties.generateAudio.default, false);
    }
    assert.match(t2v.inputSchema.properties.generateAudio.description, /vendor default is true/i);
  });

  it('the real-face input constraint is in the image tool descriptions — the cover-background lane trap', () => {
    assert.match(i2v.description, /real human faces/i, 'no 2.x face-rejection warning');
    assert.match(ref.description, /real human faces/i);
    // the default model must be the one accepting real faces so the cover → b-roll lane just runs
    assert.equal(SEEDANCE_MODEL_SPECS[DEFAULT_SEEDANCE_MODEL].realFaceInput, true);
    assert.ok(SEEDANCE_REAL_FACE_MODELS.includes(DEFAULT_SEEDANCE_MODEL));
  });

  it('the two engines point at each other — a list-only caller must be able to switch', () => {
    assert.match(byName.get('veo_text2video').description, /seedance_text2video/);
    assert.match(byName.get('veo_img2video').description, /seedance_img2video/);
    assert.match(byName.get('veo_reference').description, /seedance_reference/);
    assert.match(t2v.description, /veo_text2video/);
    assert.match(i2v.description, /veo_img2video/);
    assert.match(ref.description, /veo_reference/);
  });

  it('extension, which Seedance lacks, is routed to veo_extension', () => {
    assert.ok(!byName.has('seedance_extension'), 'a seedance_extension appeared — its video input takes public URLs only');
    assert.match(byName.get('veo_extension').description, /Seedance/, 'the description does not state extension is Veo-only');
  });

  /**
   * When the tool-surface default and the actually applied zod default split,
   * every normal call omitting the argument fails — the JSON-schema default is
   * advisory and the server never reads it. `seedance_reference` really did
   * inherit the shared default (1.5 pro) and trip its own validation. Eyeball
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

  it('the reference schema\'s actual default model is 2.x — consistent with the tool-surface default', () => {
    const parsed = seedanceReferenceSchema.parse({ prompt: 'x', referenceImagePaths: ['/tmp/a.png'] });
    assert.ok(SEEDANCE_REFERENCE_MODELS.includes(parsed.model));
    assert.equal(parsed.model, ref.inputSchema.properties.model.default, 'the surface default and the actual default differ');
    assert.equal(parsed.model, DEFAULT_SEEDANCE_REFERENCE_MODEL);
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

    it('every reference-capable model has an audio spec, and the tool surface mirrors it', () => {
      for (const model of SEEDANCE_REFERENCE_MODELS) {
        const audio = SEEDANCE_MODEL_SPECS[model].referenceAudio;
        assert.notEqual(audio, false, `${model} has no reference-audio spec`);
        assert.ok(audio.clipSeconds[0] >= 2 && audio.totalSeconds >= audio.clipSeconds[1], `${model} audio limits are inconsistent`);
      }
      const prop = ref.inputSchema.properties.referenceAudioPaths;
      assert.ok(prop, 'seedance_reference has no referenceAudioPaths');
      const maxClips = Math.max(...SEEDANCE_REFERENCE_MODELS.map((m) => SEEDANCE_MODEL_SPECS[m].referenceAudio.maxClips));
      assert.equal(prop.maxItems, maxClips);
      assert.match(prop.description, /@Audio/, 'the @Audio N binding grammar is missing');
      assert.match(prop.description, /generateAudio: true/);
      assert.match(ref.description, /voice/i);
      assert.match(ref.inputSchema.properties.generateAudio.description, /referenceAudioPaths/);
      assert.deepEqual(ref.inputSchema.required, ['prompt'], 'images are no longer the only reference kind');
      assert.equal(ref.inputSchema.properties.referenceImagePaths.minItems, undefined);
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

  /**
   * The default must be a **model with quality evidence**.
   *
   * Default to a model absent from the arena (2.5, 2.0 fast, 2.0 mini,
   * 1.0 pro fast) and every argument-omitting call goes out with unverified
   * quality. To move the default there because it is cheaper or broader,
   * build the evidence first.
   */
  it('the default models are the publicly evaluated ones', () => {
    const EVALUATED = ['dreamina-seedance-2-0-260128', 'seedance-1-5-pro-251215', 'seedance-1-0-pro-250528'];
    assert.ok(EVALUATED.includes(DEFAULT_SEEDANCE_MODEL), `default model ${DEFAULT_SEEDANCE_MODEL} has no public evaluation`);
    assert.ok(EVALUATED.includes(DEFAULT_SEEDANCE_REFERENCE_MODEL), `reference default model ${DEFAULT_SEEDANCE_REFERENCE_MODEL} has no public evaluation`);
    // derive the reference default from list order and it silently changes the moment a model is inserted
    assert.notEqual(DEFAULT_SEEDANCE_REFERENCE_MODEL, undefined);
  });

  /**
   * The three Veo tiers are statistically tied in the blind arena (gaps
   * within 20 Elo, overlapping confidence intervals, order flips on the
   * silent board). So defaulting to the standard tier pays 4x for output
   * people do not even prefer.
   */
  it('the Veo default tier is not standard — no defaults that just cost 4x', () => {
    assert.equal(DEFAULT_VIDEO_MODEL, 'veo-3.1-fast-generate-preview');
    for (const name of ['veo_text2video', 'veo_img2video', 'veo_extension', 'veo_reference']) {
      const tool = byName.get(name);
      assert.equal(
        tool.inputSchema.properties.model.default,
        DEFAULT_VIDEO_MODEL,
        `the default model of ${name} differs from the video-client source of truth`,
      );
    }
  });

  /**
   * Write an exclusion into the prompt body and the very noun gets drawn
   * (measured on local images: 4 out of 4 failed). Google's prompt guide also
   * marks the instruction form as not recommended and advises noun-phrase
   * lists. So all four tools need the dedicated exclusion inlet, and the
   * description must teach the grammar — an inlet without the grammar and
   * callers write "no walls" into the field.
   */
  it('all four veo tools expose the exclusion inlet — so "no ~" stays out of the body', () => {
    for (const name of ['veo_text2video', 'veo_img2video', 'veo_extension', 'veo_reference']) {
      const prop = byName.get(name).inputSchema.properties.negativePrompt;
      assert.ok(prop, `${name} has no negativePrompt inlet`);
      assert.match(prop.description, /comma-separated/i, `the ${name} description does not teach the noun-list grammar`);
      assert.match(prop.description, /Do NOT write instructions/, `the ${name} description does not ban instruction forms`);
    }
    // the schema must actually accept it too — a description whose value gets dropped is useless
    const parsed = img2VideoSchema.safeParse({
      prompt: 'very slow push-in',
      sourceImagePath: '/tmp/x.png',
      negativePrompt: 'on-screen text, subtitles',
    });
    assert.equal(parsed.success, true);
    assert.equal(parsed.data.negativePrompt, 'on-screen text, subtitles');
  });

  /**
   * Seedance grammar differs from Veo, and that difference produces failures.
   * The vendor pinned two things in its own docs — write seconds into the
   * prompt and the result degrades (their own notice that precise-timing
   * support is unstable), and feed a three-view character sheet as reference
   * and the same person appears twice. The tool description is what gets read
   * right before the call, so this is where it takes effect.
   */
  it('the seedance tool descriptions carry the two vendor-pinned bans', () => {
    for (const name of ['seedance_text2video', 'seedance_img2video', 'seedance_reference']) {
      const desc = byName.get(name).inputSchema.properties.prompt.description;
      assert.match(desc, /timecode/i, `${name} does not state the timecode ban`);
      assert.match(desc, /English or Chinese|English \(|Korean only/i, `${name} does not state the prompt-language constraint`);
    }
    // the multi-view ban applies only to the reference tool
    assert.match(byName.get('seedance_reference').description, /multi-view/i);
    // seed promises no reproducibility — the source docs give none
    const seed = byName.get('seedance_text2video').inputSchema.properties.seed.description;
    assert.match(seed, /does not promise/i, 'the seed description promises reproducibility that does not exist');
  });

  it('cross constraints are rejected before the call — before a paid call is created', () => {
    // audio requested on a silent-only model
    assert.equal(
      seedanceText2VideoSchema.safeParse({ prompt: 'x', model: 'seedance-1-0-pro-250528', generateAudio: true }).success,
      false,
    );
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
    // 2.x has no seed
    assert.equal(
      seedanceText2VideoSchema.safeParse({ prompt: 'x', model: 'dreamina-seedance-2-0-260128', seed: 7 }).success,
      false,
    );
    // the 1.5 pro duration cap is 12 seconds
    assert.equal(seedanceText2VideoSchema.safeParse({ prompt: 'x', durationSeconds: 20 }).success, false);
    // a model that cannot take first+last frames
    assert.equal(
      seedanceImg2VideoSchema.safeParse({
        prompt: 'x',
        sourceImagePath: '/tmp/a.png',
        lastImagePath: '/tmp/b.png',
        model: 'seedance-1-0-pro-fast-251015',
      }).success,
      false,
    );
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

  it('mono 24kHz (the TTS spec) follows the same rules', () => {
    const wav = pcmToWav(Buffer.alloc(480), 24_000, 1);
    assert.equal(wav.readUInt16LE(22), 1);
    assert.equal(wav.readUInt32LE(28), 24_000 * 1 * 2);
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

  it('does not pass a caption the platform would reject', () => {
    const caption = '🎬'.repeat(130); // .length = 260 but 520 by platform count
    assert.ok(caption.length <= 500, 'premise: an old-style .length check would pass it');
    assert.ok(threadsTextLength(caption) > 500, 'the new count rejects it');
  });
});

/**
 * Multi-channel token resolution — a safety property preventing wrong-account
 * publishing, so it is pinned statically. snsTokenDir is fixed at module load,
 * so no env swapping: its value anchors the path relations verified here
 * (default ≠ channel scope).
 */
/** env override for the default path only — never applied to channel-scoped paths (the config.ts contract). */
const DEFAULT_PATH_ENV = {
  THREADS: 'THREADS_TOKEN_FILE',
  INSTAGRAM: 'INSTAGRAM_TOKEN_FILE',
  FACEBOOK: 'FACEBOOK_PAGE_TOKEN_FILE',
  YOUTUBE: 'YOUTUBE_OAUTH_FILE',
};

describe('multi-channel token resolution', () => {
  it('with no channel, the flat file right under <SNS_TOKEN_DIR> (or the env override) is used', () => {
    for (const platform of SNS_PLATFORMS) {
      const override = process.env[DEFAULT_PATH_ENV[platform]];
      if (override) {
        assert.equal(snsCredentialFile(platform), override, `${platform}: the env override decides the default path`);
      } else {
        assert.equal(dirname(snsCredentialFile(platform)), snsTokenDir, `${platform} default credential location`);
      }
    }
  });

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

  it('kebab-case like data/<slug> passes', () => {
    for (const channel of ['a', 'brand-a', 'ttalkkak-lab', 'vn-life', '2026-news']) {
      assert.ok(CHANNEL_SLUG_RE.test(channel), `${channel} is a regular slug`);
      assert.doesNotThrow(() => snsCredentialFile('YOUTUBE', channel));
    }
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
