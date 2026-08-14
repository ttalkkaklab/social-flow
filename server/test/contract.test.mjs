/**
 * 툴 표면 계약 테스트 — `npm run check` (빌드 후 실행).
 *
 * 실제 API 를 부르지 않는다. 이 서버의 결함은 대부분 "호출해 보기 전에는 안 보이는
 * 계약 불일치"(라우팅 누락, 스키마에만 있고 핸들러엔 없는 인자, 정본 상수와 어긋난
 * enum, 동작 힌트와 설명의 모순)라서, 정적으로 잡을 수 있는 것부터 전부 잡는다.
 *
 * 게시 툴이 실호출로 공개 게시를 만들기 때문에 행동 평가(behavioral eval)는 여기
 * 없다 — 그건 드라이런 계층이 생긴 뒤의 일이다.
 */

import assert from 'node:assert/strict';
import { basename, dirname, join } from 'node:path';
import { describe, it } from 'node:test';

import { CHANNEL_SLUG_RE, SNS_PLATFORMS, snsCredentialFile, snsTokenDir } from '../dist/config.js';
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
import { MUSIC_GENERATION_MODES, MUSIC_SCALES } from '../dist/music-client.js';
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

/** inputSchema.properties 를 (경로, 스키마) 쌍으로 깊이 우선 평탄화한다. */
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

describe('툴 표면', () => {
  it('툴이 존재하고 이름이 고유하다', () => {
    assert.ok(TOOLS.length > 0, '툴이 하나도 없다');
    assert.equal(byName.size, TOOLS.length, '중복된 툴 이름이 있다');
  });

  for (const tool of TOOLS) {
    describe(tool.name, () => {
      it('이름이 snake_case 네임스페이스 규약을 지킨다', () => {
        assert.match(tool.name, /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/);
      });

      it('title 과 description 이 있다', () => {
        assert.equal(typeof tool.title, 'string');
        assert.ok(tool.title.trim().length > 0, 'title 이 비어 있다');
        assert.ok(tool.title.length <= 60, `title 이 너무 길다 (${tool.title.length}자)`);
        assert.ok((tool.description ?? '').trim().length >= 40, 'description 이 없거나 너무 짧다');
      });

      it('inputSchema 가 유효한 object 스키마다', () => {
        assert.equal(tool.inputSchema?.type, 'object');
        const properties = tool.inputSchema.properties ?? {};
        for (const key of tool.inputSchema.required ?? []) {
          assert.ok(key in properties, `required 에 있는 "${key}" 가 properties 에 없다`);
        }
      });

      it('모든 파라미터에 설명이 있다', () => {
        for (const [path, schema] of walkProperties(tool.inputSchema)) {
          assert.ok(
            typeof schema.description === 'string' && schema.description.trim().length > 0,
            `"${path}" 에 description 이 없다 — 모델이 무엇을 넣어야 할지 알 수 없다`,
          );
        }
      });

      it('enum 이 비어 있지 않고 default 가 enum 안에 있다', () => {
        for (const [path, schema] of walkProperties(tool.inputSchema)) {
          if (!Array.isArray(schema.enum)) continue;
          assert.ok(schema.enum.length > 0, `"${path}" 의 enum 이 비어 있다`);
          assert.equal(new Set(schema.enum).size, schema.enum.length, `"${path}" 의 enum 에 중복이 있다`);
          if (schema.default !== undefined) {
            assert.ok(
              schema.enum.includes(schema.default),
              `"${path}" 의 default(${schema.default})가 enum 밖이다`,
            );
          }
        }
      });

      it('annotations 가 있고 힌트 조합이 모순되지 않는다', () => {
        const a = tool.annotations;
        assert.ok(a, 'annotations 가 없다 — 클라이언트가 위험한 툴을 구분할 수 없다');
        assert.equal(typeof a.readOnlyHint, 'boolean');
        assert.equal(typeof a.openWorldHint, 'boolean');

        if (a.readOnlyHint) {
          // 읽기 전용에 destructive/idempotent 를 다는 것은 스펙상 무의미하다
          assert.equal(a.destructiveHint, undefined, 'readOnly 인데 destructiveHint 가 있다');
          assert.equal(a.idempotentHint, undefined, 'readOnly 인데 idempotentHint 가 있다');
        } else {
          // 쓰기 툴은 두 힌트를 기본값에 맡기지 않는다 — destructiveHint 의 기본은
          // true 라, 파일만 만드는 생성 툴이 파괴적으로 오인된다
          assert.equal(typeof a.destructiveHint, 'boolean', 'destructiveHint 를 명시해야 한다');
          assert.equal(typeof a.idempotentHint, 'boolean', 'idempotentHint 를 명시해야 한다');
        }
      });

      it('outputSchema 를 선언했다면 유효하다', () => {
        if (!tool.outputSchema) return;
        assert.equal(tool.outputSchema.type, 'object');
        const properties = tool.outputSchema.properties ?? {};
        assert.ok(Object.keys(properties).length > 0, 'properties 가 비어 있다');
        for (const key of tool.outputSchema.required ?? []) {
          assert.ok(key in properties, `outputSchema.required 의 "${key}" 가 properties 에 없다`);
        }
        for (const [key, schema] of Object.entries(properties)) {
          assert.ok(
            typeof schema.description === 'string' && schema.description.trim().length > 0,
            `outputSchema "${key}" 에 description 이 없다`,
          );
        }
      });
    });
  }
});

/**
 * 파라미터 이름 규약.
 *
 * 이름이 툴마다 흔들리면(q vs query, num vs display vs max_results) 모델은 툴을
 * 갈아탈 때마다 인자를 다시 배워야 하고, 그 비용은 잘못된 인자명 호출 →
 * -32602 왕복으로 되돌아온다. 백엔드 API 가 q/display/num 을 쓰더라도 그 환산은
 * 클라이언트 계층의 일이지 툴 표면의 일이 아니다.
 */
describe('파라미터 네이밍 규약', () => {
  const SEARCH_TOOLS = TOOLS.filter((t) => t.name.endsWith('_search'));

  it('검색 툴이 존재한다 (필터가 헛돌지 않는지 확인)', () => {
    assert.ok(SEARCH_TOOLS.length >= 5, `검색 툴이 ${SEARCH_TOOLS.length}개뿐이다 — 필터가 잘못됐을 수 있다`);
  });

  /**
   * 검색 툴이 아니어도 결과 수·페이지를 받는 툴은 같은 이름을 써야 한다.
   * `_search` 접미사에만 걸면 datago_file_fetch 처럼 이름이 다른 조회 툴이
   * 그물을 빠져나간다 — 실제로 perPage 가 그렇게 남아 있었다.
   */
  it('페이지네이션 인자 이름이 서버 전역에서 하나다', () => {
    const offenders = [];
    for (const tool of TOOLS) {
      for (const [path] of walkProperties(tool.inputSchema)) {
        const key = path.split('.').pop().replace(/\[\]$/, '');
        if (['perPage', 'pageSize', 'maxResults', 'numResults', 'count'].includes(key)) {
          offenders.push(`${tool.name}.${path}`);
        }
      }
    }
    assert.deepEqual(offenders, [], `결과 수 인자는 limit 으로 통일한다: ${offenders.join(', ')}`);
  });

  for (const tool of TOOLS) {
    it(`${tool.name}: 파라미터가 camelCase 다`, () => {
      for (const [path] of walkProperties(tool.inputSchema)) {
        const key = path.split('.').pop().replace(/\[\]$/, '');
        // gl/hl/q 같은 외부 API 표준 약어는 예외 — 바꾸면 오히려 대응이 흐려진다
        if (['gl', 'hl', 'uddi'].includes(key)) continue;
        assert.ok(
          /^[a-z][a-zA-Z0-9]*$/.test(key),
          `"${tool.name}.${path}" 가 camelCase 가 아니다 (snake_case 금지 — 서버 전역 규약은 camelCase)`,
        );
      }
    });
  }

  /**
   * 이름만 같고 뜻이 다르면 통일이 오히려 함정이다.
   *
   * 실제로 두 번 물렸다: naver_search 는 API 의 start(항목 오프셋)를 page 로
   * 그대로 넘겨 page=2 가 2번째 항목부터를 뜻했고, serp_web_search 는 오프셋을
   * limit 배수로 계산해 limit≠10 일 때 페이지가 겹쳤다. 둘 다 에러 없이 조용히
   * 중복 결과를 주는 부류라 설명에 "페이지"라고 못박아 계약을 드러낸다.
   */
  for (const tool of SEARCH_TOOLS) {
    const pageSchema = tool.inputSchema.properties?.page;
    if (!pageSchema) continue;
    it(`${tool.name}: page 가 페이지 번호임을 설명이 명시한다`, () => {
      assert.match(
        pageSchema.description ?? '',
        /페이지/,
        'page 는 항목 오프셋이 아니라 페이지 번호다 — 환산은 클라이언트가 맡고, 설명이 그 계약을 드러내야 한다',
      );
      assert.ok(
        !/오프셋|시작 위치|start/i.test(pageSchema.description ?? ''),
        'page 설명이 오프셋 의미를 드러내면 안 된다 — 툴 표면은 페이지여야 한다',
      );
    });
  }

  for (const tool of SEARCH_TOOLS) {
    it(`${tool.name}: 검색 툴 공통 인자명을 쓴다`, () => {
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
      // 중첩 객체 안의 인자도 같은 규약을 받는다 — 최상위만 보면 한 겹 아래로
      // 숨긴 q/num 이 그대로 통과한다
      for (const [path] of walkProperties(tool.inputSchema)) {
        const key = path.split('.').pop().replace(/\[\]$/, '');
        const good = banned[key];
        assert.ok(!good, `"${tool.name}.${path}" 는 검색 툴 공통 인자 "${good}" 로 통일해야 한다`);
      }
      // 검색어를 받는 툴이라면 이름은 query 이고 필수다
      assert.ok('query' in props, `${tool.name} 에 query 가 없다 — 검색 툴의 검색어 인자명은 query 다`);
      assert.ok(
        (tool.inputSchema.required ?? []).includes('query'),
        `${tool.name}.query 가 required 가 아니다`,
      );
    });
  }
});

describe('라우팅 정합', () => {
  it('정의된 모든 툴에 핸들러가 있다', () => {
    const orphans = TOOLS.filter((tool) => typeof ROUTES[tool.name] !== 'function').map((t) => t.name);
    assert.deepEqual(orphans, [], `핸들러 없는 툴: ${orphans.join(', ')}`);
  });

  it('정의되지 않은 핸들러가 없다', () => {
    const orphans = Object.keys(ROUTES).filter((name) => !byName.has(name));
    assert.deepEqual(orphans, [], `툴 정의 없는 핸들러: ${orphans.join(', ')}`);
  });

  it('ListTools 게이트가 실재하는 툴만 가리킨다', () => {
    for (const name of Object.keys(SNS_PLATFORM_BY_TOOL)) {
      assert.ok(byName.has(name), `SNS_PLATFORM_BY_TOOL 의 "${name}" 이 툴 목록에 없다`);
    }
  });
});

describe('HITL 계약', () => {
  const destructive = TOOLS.filter((t) => t.annotations?.destructiveHint === true);

  it('즉시 공개되는 툴이 하나 이상 파괴적으로 표시돼 있다', () => {
    assert.ok(destructive.length > 0);
  });

  for (const tool of destructive) {
    it(`${tool.name} — 설명이 승인 없이 호출 금지를 명시한다`, () => {
      // 힌트(기계 판독)와 설명(모델 판독)이 같은 사실을 말해야 한다.
      // 한쪽만 고치고 다른 쪽을 두면 둘 중 하나는 반드시 거짓이 된다.
      assert.match(tool.description, /⚠️/, '경고 표식이 없다');
      assert.match(tool.description, /승인 없이 호출 금지|HITL/, 'HITL 문구가 없다');
    });
  }

  it('읽기 전용 툴은 파괴적 경고를 달지 않는다', () => {
    for (const tool of TOOLS.filter((t) => t.annotations?.readOnlyHint === true)) {
      assert.ok(
        !tool.description.includes('즉시 공개'),
        `${tool.name} — readOnly 인데 설명이 "즉시 공개"라고 말한다`,
      );
    }
  });
});

describe('Threads 성장 조회 툴', () => {
  // 인사이트·검색 스코프는 게시용 토큰에 없을 수 있다 — 스코프 이름이 설명에
  // 없으면 403 을 받은 호출자가 다음 행동(재발급)을 알 수 없다.
  const scopeByTool = {
    threads_insights: 'threads_manage_insights',
    threads_search: 'threads_keyword_search',
  };

  for (const [name, scope] of Object.entries(scopeByTool)) {
    describe(name, () => {
      it('THREADS 자격증명으로 게이트된다', () => {
        assert.equal(SNS_PLATFORM_BY_TOOL[name], 'THREADS');
      });

      it('읽기 전용으로 표시돼 있다 (부작용 없음 — 승인 프롬프트 불필요)', () => {
        assert.equal(byName.get(name)?.annotations?.readOnlyHint, true);
      });

      it(`설명이 필요 스코프(${scope})를 명시한다`, () => {
        assert.ok(byName.get(name)?.description.includes(scope), `"${scope}" 문구가 없다`);
      });
    });
  }

  it('threads_search 설명이 검색 쿼터를 명시한다', () => {
    assert.match(byName.get('threads_search').description, /2,?200/, '24h 롤링 쿼터 문구가 없다');
  });
});

describe('Instagram 성장 조회 툴', () => {
  const tool = () => byName.get('instagram_insights');

  it('INSTAGRAM 자격증명으로 게이트된다', () => {
    assert.equal(SNS_PLATFORM_BY_TOOL.instagram_insights, 'INSTAGRAM');
  });

  it('읽기 전용으로 표시돼 있다 (부작용 없음 — 승인 프롬프트 불필요)', () => {
    assert.equal(tool()?.annotations?.readOnlyHint, true);
  });

  // 게시용으로 발급한 기존 토큰에는 인사이트 스코프가 없다 — 스코프 이름이
  // 설명에 없으면 에러를 받은 호출자가 무엇을 재발급해야 하는지 알 수 없다.
  it('설명이 필요 스코프(instagram_business_manage_insights)를 명시한다', () => {
    assert.ok(tool()?.description.includes('instagram_business_manage_insights'), '스코프 문구가 없다');
  });

  // 실측: FEED 미디어에 릴스 지표를 요청하면 400 으로 응답 전체가 실패한다.
  // 어느 지표가 릴스 한정인지 설명에 없으면 호출자가 이미지에서도 찾는다.
  it('설명이 릴스 전용 지표와 그 한정 조건을 함께 명시한다', () => {
    const description = tool().description;
    for (const metric of ['ig_reels_avg_watch_time', 'reels_skip_rate']) {
      assert.ok(description.includes(metric), `"${metric}" 문구가 없다`);
    }
    assert.match(description, /REELS/, '릴스 한정 조건이 없다');
  });

  // 실측: 인사이트의 follower_count 는 팔로워 100 미만 계정에서 빈 배열을
  // 돌려준다. 이 툴이 겨냥하는 게 팔로워 0인 신규 채널이라 치명적이다.
  it('설명이 팔로워 수 출처가 프로필 필드임을 명시한다', () => {
    assert.match(tool().description, /followersCount/, '팔로워 수 출처 안내가 없다');
    assert.match(tool().description, /100 미만/, '인사이트 follower_count 의 한계 경고가 없다');
  });

  it('출력 스키마가 계정·구간·계정지표·미디어를 모두 요구한다', () => {
    assert.deepEqual(tool()?.outputSchema?.required, ['account', 'period', 'user', 'media']);
  });
});

describe('YouTube 성장 조회 툴', () => {
  const tool = () => byName.get('youtube_insights');

  it('YOUTUBE 자격증명으로 게이트된다', () => {
    assert.equal(SNS_PLATFORM_BY_TOOL.youtube_insights, 'YOUTUBE');
  });

  it('읽기 전용으로 표시돼 있다 (부작용 없음 — 승인 프롬프트 불필요)', () => {
    assert.equal(tool()?.annotations?.readOnlyHint, true);
  });

  // 기존 토큰은 youtube.upload 단독으로 발급됐다 — 스코프 이름이 설명에 없으면
  // 403 을 받은 호출자가 무엇을 재발급해야 하는지 알 수 없다.
  for (const scope of ['youtube.readonly', 'yt-analytics.readonly', 'yt-analytics-monetary.readonly']) {
    it(`설명이 필요 스코프(${scope})를 명시한다`, () => {
      assert.ok(tool()?.description.includes(scope), `"${scope}" 문구가 없다`);
    });
  }

  it('설명이 Analytics 데이터 지연을 경고한다', () => {
    assert.match(tool().description, /2~3일 지연/, '지연 경고가 없다 — 최근 구간이 빈 것을 장애로 오인한다');
  });

  it('설명이 스와이프 이탈률 미제공을 명시한다', () => {
    // API 에 없는 지표를 있는 것처럼 두면 호출자가 계속 찾는다
    assert.match(tool().description, /스와이프/, '스와이프 이탈률 부재 안내가 없다');
  });
});

describe('AI 생성 콘텐츠 고지 (YouTube)', () => {
  const publish = () => byName.get('youtube_publish');

  it('containsSyntheticMedia 파라미터가 있다', () => {
    assert.ok(publish()?.inputSchema.properties.containsSyntheticMedia, '합성 미디어 고지 인자가 없다');
  });

  // 이 파이프라인은 Veo 영상·Lyria 음악을 쓴다. 기본값이 false 면 미고지 게시가
  // 기본 동작이 되고, 상습 미고지는 라벨 강제·삭제·YPP 정지 사유다.
  it('기본값이 true 다 (미고지가 기본이 되지 않는다)', () => {
    assert.equal(publish().inputSchema.properties.containsSyntheticMedia.default, true);
  });

  it('설명이 면제 사례를 알려준다 (끌 수 있는 경우를 모르면 항상 켜진다)', () => {
    assert.match(
      publish().inputSchema.properties.containsSyntheticMedia.description,
      /면제|자기 목소리|대본/,
      '면제 사례 안내가 없다',
    );
  });
});

describe('자막 별도 업로드 계약', () => {
  // 이 파이프라인은 자막을 영상에 태우지 않고 파일로 따로 올린다. 그래서 자막 파일을
  // 받는 플랫폼에는 인자가 반드시 있어야 하고, 못 받는 플랫폼(IG)에는 있으면 안 된다 —
  // IG 에 자막 인자가 생기면 호출자가 클린본을 올리고 자막이 조용히 사라진다.
  const yt = () => byName.get('youtube_publish');
  const fb = () => byName.get('facebook_publish');
  const ig = () => byName.get('instagram_publish');

  it('YouTube 가 자막 파일·언어 인자를 받는다', () => {
    assert.ok(yt()?.inputSchema.properties.captionFilePath, 'captionFilePath 가 없다');
    assert.ok(yt()?.inputSchema.properties.captionLanguage, 'captionLanguage 가 없다');
  });

  it('Facebook 이 자막 파일·로케일 인자를 받는다', () => {
    assert.ok(fb()?.inputSchema.properties.captionFilePath, 'captionFilePath 가 없다');
    assert.ok(fb()?.inputSchema.properties.captionLocale, 'captionLocale 이 없다');
  });

  it('Instagram 에는 자막 파일 인자가 없다 (플랫폼이 받지 않는다)', () => {
    assert.equal(ig()?.inputSchema.properties.captionFilePath, undefined);
  });

  it('Instagram videoUrl 설명이 번인본을 요구한다', () => {
    // 여기만 자막이 화면에 박힌 영상이다 — 설명이 없으면 클린본이 올라간다
    assert.match(ig().inputSchema.properties.videoUrl.description, /번인/, '번인본 요구가 없다');
  });

  it('YouTube 자막 설명이 force-ssl 스코프를 알린다', () => {
    // 게시용 youtube.upload 로는 captions.insert 가 거부된다 — 모르면 영상만 올라간다
    assert.match(yt().inputSchema.properties.captionFilePath.description, /force-ssl/);
  });

  it('YouTube 자막 설명이 400유닛 쿼터를 알린다', () => {
    // 업로드 1유닛과 400배 차이라 호출 빈도 판단이 달라진다
    assert.match(yt().inputSchema.properties.captionFilePath.description, /400유닛/);
  });

  it('Facebook 로케일 설명이 파일명 계약을 알린다', () => {
    // FB 는 업로드 파일명 `<이름>.<locale>.srt` 로 로케일을 판정한다
    assert.match(fb().inputSchema.properties.captionLocale.description, /ko_KR/);
  });

  it('두 툴 출력이 captionSet·captionWarning 을 노출한다', () => {
    for (const [name, tool] of [['youtube_publish', yt()], ['facebook_publish', fb()]]) {
      assert.ok(tool.outputSchema?.properties?.captionSet, `${name}: captionSet 이 없다`);
      assert.ok(tool.outputSchema?.properties?.captionWarning, `${name}: captionWarning 이 없다`);
    }
  });

  it('captionWarning 설명이 재게시를 막는다', () => {
    // 게시 API 는 비멱등 — 자막만 실패했는데 재게시하면 게시물이 중복으로 쌓인다
    for (const [name, tool] of [['youtube_publish', yt()], ['facebook_publish', fb()]]) {
      assert.match(
        tool.outputSchema.properties.captionWarning.description,
        /재업로드 금지|재게시 금지/,
        `${name}: 재게시 금지 안내가 없다`,
      );
    }
  });
});

describe('YouTube 썸네일 필수 계약', () => {
  // 미지정 업로드는 YouTube 가 임의 프레임을 커버로 뽑고, 게시 후 세로 표면은
  // API 로 되돌릴 수 없다 — 그래서 업로드 시점에 스키마가 막는다(2026-08-13).
  const yt = () => byName.get('youtube_publish');

  it('thumbnailFilePath 가 required 에 있다 (썸네일 없는 업로드 차단)', () => {
    assert.ok(yt().inputSchema.required.includes('thumbnailFilePath'), 'thumbnailFilePath 가 필수가 아니다');
  });

  it('설명이 세로 표면 한계를 알린다 (이 인자가 바꾸는 건 가로 표면뿐)', () => {
    // 쇼츠 피드·채널 쇼츠 탭의 세로 프레임(oar*)은 앱 프레임 선택으로만 바뀐다
    assert.match(yt().inputSchema.properties.thumbnailFilePath.description, /세로 (표면|프레임)/, '세로 표면 안내가 없다');
  });
});

describe('Threads 본문 링크 계약', () => {
  // 영상 회차의 Threads 는 커버 이미지 + 링크 답글이 아니라 본문 링크 한 건으로 나간다
  // (2026-08-14 전략 변경). 링크 프리뷰 카드는 media_type=TEXT 전용이라 이미지와 배타다.
  const th = () => byName.get('threads_publish');
  const props = () => th().inputSchema.properties;

  it('linkUrl 인자를 받는다 (링크 프리뷰 카드)', () => {
    assert.equal(props().linkUrl?.format, 'uri', 'linkUrl 이 없거나 uri 포맷이 아니다');
  });

  it('linkUrl·imageUrl 설명이 서로 배타임을 알린다', () => {
    // 같이 보내면 플랫폼이 컨테이너 생성 단계에서 거부한다 — 스키마 설명이 먼저 막는다
    assert.match(props().linkUrl.description, /배타/, 'linkUrl 설명에 배타 안내가 없다');
    assert.match(props().imageUrl.description, /배타/, 'imageUrl 설명에 배타 안내가 없다');
  });

  it('툴 설명이 링크 답글 전략으로 되돌아가지 않는다', () => {
    // 옛 전략("커버 이미지 본문 + 풀영상 링크 답글")이 설명에 남아 있으면
    // 호출자가 답글을 한 번 더 게시해 같은 링크가 두 번 나간다
    assert.doesNotMatch(th().description, /링크 답글|링크는 본문이 아니라/, '옛 링크 답글 전략이 설명에 남아 있다');
  });

  it('FB 와 인자 이름이 같다 (텍스트 게시의 링크 = linkUrl)', () => {
    assert.ok(byName.get('facebook_publish').inputSchema.properties.linkUrl, 'FB linkUrl 이 사라졌다');
  });
});

describe('댓글 툴 플랫폼 정합', () => {
  // 세 곳(sns-client 의 COMMENT_PLATFORMS, 툴 enum, 핸들러 zod enum)이 어긋나면
  // 스키마는 통과하는데 런타임에서 다른 플랫폼 토큰으로 새는 사고가 난다.
  const inboxEnum = byName.get('sns_comment_inbox').inputSchema.properties.platforms.items.enum;
  const replyEnum = byName.get('sns_comment_reply').inputSchema.properties.platform.enum;
  const moderateEnum = byName.get('sns_comment_moderate').inputSchema.properties.platform.enum;

  it('인박스와 답글이 같은 플랫폼 집합을 받는다', () => {
    assert.deepEqual([...inboxEnum].sort(), [...replyEnum].sort());
  });

  it('YOUTUBE 가 인박스·답글에 포함된다', () => {
    assert.ok(inboxEnum.includes('YOUTUBE'), '인박스에 YOUTUBE 가 없다');
    assert.ok(replyEnum.includes('YOUTUBE'), '답글에 YOUTUBE 가 없다');
  });

  it('숨김·좋아요는 YOUTUBE 를 받지 않는다', () => {
    // setModerationStatus 는 "되돌릴 수 있는 숨김"과 의미가 다르다 — 매핑하지 않는다
    assert.ok(!moderateEnum.includes('YOUTUBE'), 'YOUTUBE 가 숨김 대상에 들어 있다');
  });

  it('답글 툴 설명이 YouTube 의 최상위 댓글 제약을 알려준다', () => {
    assert.match(byName.get('sns_comment_reply').description, /YOUTUBE/, 'YouTube 계약 설명이 없다');
  });
});

describe('단일 출처 상수', () => {
  const enumOf = (toolName, path) => {
    const parts = path.split('.');
    let schema = byName.get(toolName).inputSchema;
    for (const part of parts) schema = schema.properties[part];
    return schema.enum;
  };

  /**
   * 검색 툴 enum·상한은 tools.ts 가 리터럴로 다시 적고 handlers.ts 는 정본 상수를
   * 참조한다. 한쪽만 고치면 툴이 광고하는 값을 zod 가 -32602 로 거절하는데,
   * 실호출 전까지 아무도 모른다. 정본과 묶어 드리프트를 빌드 시점에 잡는다.
   */
  it('naver_search enum 이 naver-client 정본과 같다', () => {
    assert.deepEqual(enumOf('naver_search', 'type'), [...NAVER_SEARCH_TYPES]);
    assert.deepEqual(enumOf('naver_search', 'sort'), [...NAVER_SORTS]);
    assert.deepEqual(enumOf('naver_search', 'imageSize'), [...NAVER_IMAGE_FILTERS]);
  });

  it('serp 검색 enum 이 serp-client 정본과 같다', () => {
    assert.deepEqual(enumOf('serp_naver_search', 'period'), [...SERP_NAVER_PERIODS]);
    assert.deepEqual(enumOf('serp_image_search', 'size'), [...IMAGE_SIZES]);
    assert.deepEqual(enumOf('serp_image_search', 'aspect'), [...IMAGE_ASPECTS]);
    assert.deepEqual(enumOf('serp_image_search', 'imageType'), [...IMAGE_TYPES]);
    assert.deepEqual(enumOf('serp_image_search', 'license'), [...IMAGE_LICENSES]);
  });

  it('검색 툴 limit 상한이 툴 설명과 정본 상수에서 일치한다', () => {
    // 설명에 적힌 "최대 N" 이 실제 상한과 다르면 모델은 지킬 수 없는 값을 보낸다
    const capInDescription = (toolName) => {
      const desc = byName.get(toolName).inputSchema.properties.limit.description ?? '';
      const m = desc.match(/최대\s*(\d+)/);
      return m ? Number(m[1]) : null;
    };
    assert.equal(capInDescription('serp_news_search'), SERP_NEWS_MAX_LIMIT);
    assert.equal(capInDescription('serp_naver_search'), SERP_NAVER_MAX_LIMIT);
    assert.equal(capInDescription('serp_image_search'), SERP_IMAGE_MAX_LIMIT);
    // 나머지 검색 툴도 같은 가드를 받는다 — 세 개만 덮으면 나머지가 드리프트한다
    assert.equal(capInDescription('serp_web_search'), 10);
    assert.equal(capInDescription('naver_search'), 30);
  });

  it('TTS 음성 enum 이 tts-client 정본과 같다', () => {
    assert.deepEqual(enumOf('tts_generate', 'voiceName'), [...TTS_VOICE_NAMES]);
    const speakerVoice = byName.get('tts_multi_speaker').inputSchema.properties.speakers.items
      .properties.voiceName.enum;
    assert.deepEqual(speakerVoice, [...TTS_VOICE_NAMES]);
  });

  it('TTS 모델 enum 이 정본과 같다', () => {
    assert.deepEqual(enumOf('tts_generate', 'model'), [...VALID_TTS_MODELS]);
  });

  it('음악 조성·모드 enum 이 music-client 정본과 같다', () => {
    assert.deepEqual(enumOf('music_generate_advanced', 'config.scale'), [...MUSIC_SCALES]);
    assert.deepEqual(enumOf('music_generate_advanced', 'config.musicGenerationMode'), [
      ...MUSIC_GENERATION_MODES,
    ]);
  });

  it('로컬 TTS 보이스·언어 enum 이 supertonic-client 정본과 같다', () => {
    assert.deepEqual(enumOf('tts_local_generate', 'voice'), [...SUPERTONIC_VOICE_NAMES]);
    assert.deepEqual(enumOf('tts_local_generate', 'lang'), [...SUPERTONIC_LANGUAGES]);
  });
});

/**
 * 두 음성 경로가 서로 다른 물건이라는 사실을 계약으로 못박는다.
 *
 * 로컬(Supertonic)과 Gemini 는 이름이 둘 다 tts_* 라 호출자가 바꿔 끼우기 쉬운데,
 * 샘플레이트(44.1kHz vs 24kHz)와 연기 지시 가능 여부가 다르다. 설명에서 그 경계가
 * 사라지면 한 영상 안에서 섞여 이어붙이기가 깨진다.
 */
describe('음성 경로 분리 (로컬 · Gemini)', () => {
  const local = byName.get('tts_local_generate');

  it('로컬 합성은 네트워크를 타지 않는다고 표시된다', () => {
    assert.equal(local.annotations.openWorldHint, false, 'openWorldHint 가 열려 있다');
    assert.equal(local.annotations.readOnlyHint, false);
  });

  it('로컬 툴 설명이 Python 런타임 요구와 설치법을 알려준다', () => {
    assert.match(local.description, /pip install supertonic/, '설치 안내가 없다');
    assert.match(local.description, /SUPERTONIC_PYTHON/, 'venv 지정 방법이 없다');
  });

  it('로컬 툴 설명이 가중치 라이선스(OpenRAIL-M)를 알린다', () => {
    // 코드는 MIT 지만 가중치는 용도 제한 조항이 붙는다 — 게시물에 실리는 음성이라 표기가 필요하다
    assert.match(local.description, /OpenRAIL-M/, '가중치 라이선스 주의가 없다');
  });

  it('두 엔진의 샘플레이트 차이를 설명이 경고한다', () => {
    assert.match(local.description, /44\.1kHz/, '로컬 출력 규격이 없다');
    assert.match(local.description, /24kHz/, 'Gemini 쪽 규격과의 차이 경고가 없다');
    assert.equal(SUPERTONIC_SAMPLE_RATE, 44_100);
  });

  it('연기가 필요한 컷은 Gemini 로 보내라고 안내한다 — 로컬엔 스타일 인자가 없다', () => {
    assert.ok(!('stylePrompt' in local.inputSchema.properties), '로컬에 stylePrompt 가 생겼다');
    assert.match(local.description, /tts_generate/, 'Gemini 경로 안내가 없다');
  });

  it('언어는 자동 감지가 아니라 인자다 (Gemini 와 반대)', () => {
    // Gemini 는 텍스트에서 언어를 감지하지만 Supertonic 은 코드로 청킹까지 결정한다
    assert.equal(local.inputSchema.properties.lang.default, DEFAULT_SUPERTONIC_LANGUAGE);
    assert.ok(!('lang' in byName.get('tts_generate').inputSchema.properties));
  });

  it('두 경로의 입력 상한이 같다 — 바꿔 낄 때 걸리지 않도록', () => {
    assert.equal(local.inputSchema.properties.text.maxLength, MAX_SUPERTONIC_INPUT_CHARS);
    assert.equal(
      byName.get('tts_generate').inputSchema.properties.text.maxLength,
      MAX_SUPERTONIC_INPUT_CHARS,
    );
  });
});

/**
 * 두 이미지 경로의 분담을 계약으로 못박는다 (음성 경로 분리와 같은 구조).
 *
 * 로컬(Z-Image)이 기본이고 텍스트 포함·고품질 건만 gpt_image 로 간다 — 이 라우팅이
 * 설명에서 사라지면 글자 든 커버가 로컬로 가서 한글 자소가 깨진 채 게시되거나,
 * 텍스트 없는 b-roll 이 전부 과금 경로로 간다. 실측 근거는
 * docs/research/2026-08-12-local-image-generation 이다.
 */
describe('이미지 경로 분리 (로컬 · OpenAI)', () => {
  const local = byName.get('image_local_generate');
  const paid = byName.get('gpt_image_text2img');

  it('로컬 생성은 네트워크를 타지 않는다고 표시된다', () => {
    assert.equal(local.annotations.openWorldHint, false, 'openWorldHint 가 열려 있다');
    assert.equal(local.annotations.readOnlyHint, false);
  });

  it('로컬 툴 설명이 mflux 설치법과 바이너리 지정 방법을 알려준다', () => {
    assert.match(local.description, /uv tool install --python 3\.12 mflux/, '설치 안내가 없다');
    assert.match(local.description, /MFLUX_ZIMAGE_BIN/, '바이너리 경로 지정 방법이 없다');
  });

  it('로컬 툴 설명이 최초 호출 대용량 다운로드를 경고한다', () => {
    // 31GB 를 모르고 부르면 "멈췄다"로 오판하고 죽인다 — 다운로드 중임을 미리 알린다
    assert.match(local.description, /31GB/, '가중치 다운로드 경고가 없다');
  });

  it('텍스트 든 이미지는 gpt_image 로 보내라고 안내한다 — 한글 실측 근거 포함', () => {
    assert.match(local.description, /gpt_image_text2img/, '과금 경로 안내가 없다');
    assert.match(local.description, /딸깍연구소/, '한글 렌더링 실측 근거가 없다');
  });

  it('gpt_image 쪽 설명이 역방향 라우팅(기본은 로컬)을 안내한다', () => {
    assert.match(paid.description, /image_local_generate/, '로컬 기본 경로 안내가 없다');
  });

  it('serp_image_search 의 생성 유도 문구가 두 경로를 모두 가리킨다', () => {
    assert.match(byName.get('serp_image_search').description, /image_local_generate/);
  });

  it('양자화 enum 이 zimage-client 정본과 같다', () => {
    assert.deepEqual(local.inputSchema.properties.quantize.enum, [...ZIMAGE_QUANTIZE_OPTIONS]);
    assert.equal(local.inputSchema.properties.quantize.default, DEFAULT_ZIMAGE_QUANTIZE);
    assert.equal(local.inputSchema.properties.steps.default, DEFAULT_ZIMAGE_STEPS);
  });

  it('해상도 제약(16의 배수)을 스키마 설명이 알려준다 — 1080×1920 함정', () => {
    // 9:16 을 1080 으로 부르는 게 가장 흔한 첫 실수다 — 걸리기 전에 설명에서 막는다
    assert.match(local.inputSchema.properties.width.description, /1088/);
    assert.equal(Number(local.inputSchema.properties.width.description.match(/multiple of (\d+)/)?.[1]), ZIMAGE_DIMENSION_STEP);
  });

  it('타임아웃이 실측 최악값을 여유 있게 덮는다', () => {
    // 실측: 1088×1920 @9스텝, 로드 74 과부하에서 462초 — 그 2배 이상을 허용해야 한다
    assert.ok(zimageTimeoutMs(1088, 1920, 9) > 462_000 * 2, '9:16 타임아웃이 실측 대비 빠듯하다');
    // 상한은 30분 — 무한정 매달리지 않는다
    assert.ok(zimageTimeoutMs(2048, 2048, 50) <= 30 * 60_000);
  });
});

describe('생성 파일 경로 안전성', () => {
  it('경로 분리자가 든 파일명을 거부한다', () => {
    // path.join 이 ../ 를 정규화해 없애므로 조립 전에 막아야 한다
    for (const bad of ['../escape.wav', 'sub/dir.wav', '..\\escape.wav', 'a/../../b.mp4']) {
      assert.throws(() => resolveOutputFile('/tmp', bad, 'audio'), /bare file name|Path traversal/);
    }
  });

  it('허용되지 않은 확장자를 거부한다', () => {
    assert.throws(() => resolveOutputFile('/tmp', 'payload.sh', 'audio'), /not allowed/);
    assert.throws(() => resolveOutputFile('/tmp', 'clip.wav', 'video'), /not allowed/);
  });
});

describe('PCM → WAV 헤더', () => {
  it('RIFF 헤더가 규격대로 조립된다', () => {
    const pcm = Buffer.alloc(960); // 48kHz 스테레오 16-bit 5ms
    const wav = pcmToWav(pcm, 48_000, 2);

    assert.equal(wav.length, 44 + pcm.length);
    assert.equal(wav.subarray(0, 4).toString(), 'RIFF');
    assert.equal(wav.subarray(8, 12).toString(), 'WAVE');
    assert.equal(wav.readUInt32LE(4), 36 + pcm.length);
    assert.equal(wav.readUInt16LE(20), 1, 'PCM 포맷 태그');
    assert.equal(wav.readUInt16LE(22), 2, '채널 수');
    assert.equal(wav.readUInt32LE(24), 48_000, '샘플레이트');
    assert.equal(wav.readUInt32LE(28), 48_000 * 2 * 2, 'byteRate');
    assert.equal(wav.readUInt16LE(32), 4, 'blockAlign');
    assert.equal(wav.readUInt16LE(34), 16, 'bitsPerSample');
    assert.equal(wav.readUInt32LE(40), pcm.length, 'dataSize');
  });

  it('모노 24kHz(TTS 규격)도 같은 규칙을 따른다', () => {
    const wav = pcmToWav(Buffer.alloc(480), 24_000, 1);
    assert.equal(wav.readUInt16LE(22), 1);
    assert.equal(wav.readUInt32LE(28), 24_000 * 1 * 2);
  });
});

describe('Threads 길이 계산', () => {
  it('이모지를 UTF-8 바이트로 센다 (.length 의 과소 계산을 없앤다)', () => {
    // 🎬 는 UTF-16 2유닛이지만 UTF-8 4바이트 — 플랫폼은 바이트로 센다
    assert.equal('🎬'.length, 2, '전제: JS .length 는 2로 센다');
    assert.equal(threadsTextLength('🎬'), 4);
    assert.equal(threadsTextLength('안녕하세요'), 5, '한글은 코드포인트 1로 센다');
    assert.equal(threadsTextLength('abc'), 3);
  });

  it('플랫폼이 거부할 캡션을 통과시키지 않는다', () => {
    const caption = '🎬'.repeat(130); // .length = 260 이지만 플랫폼 기준 520
    assert.ok(caption.length <= 500, '전제: 구식 .length 검증이라면 통과시킨다');
    assert.ok(threadsTextLength(caption) > 500, '새 계산은 거부한다');
  });
});

/**
 * 멀티 채널 토큰 해석 — 오계정 게시를 막는 안전 속성이라 정적으로 못 박는다.
 * snsTokenDir 는 모듈 로드 시점 고정이므로 env 를 바꿔 끼우지 않고, 그 값을
 * 기준점 삼아 경로 관계(기본 ≠ 채널 스코프)를 검증한다.
 */
/** 기본 경로만 덮어쓰는 env override — 채널 스코프 경로에는 적용되지 않는다(config.ts 계약). */
const DEFAULT_PATH_ENV = {
  THREADS: 'THREADS_TOKEN_FILE',
  INSTAGRAM: 'INSTAGRAM_TOKEN_FILE',
  FACEBOOK: 'FACEBOOK_PAGE_TOKEN_FILE',
  YOUTUBE: 'YOUTUBE_OAUTH_FILE',
};

describe('멀티 채널 토큰 해석', () => {
  it('채널 미지정이면 <SNS_TOKEN_DIR> 바로 아래 평면 파일(또는 env override)을 쓴다', () => {
    for (const platform of SNS_PLATFORMS) {
      const override = process.env[DEFAULT_PATH_ENV[platform]];
      if (override) {
        assert.equal(snsCredentialFile(platform), override, `${platform}: env override 가 기본 경로를 결정한다`);
      } else {
        assert.equal(dirname(snsCredentialFile(platform)), snsTokenDir, `${platform} 기본 자격증명 위치`);
      }
    }
  });

  it('채널 지정 시 그 채널 디렉토리만 본다 — 기본 토큰으로 폴백하지 않는다', () => {
    for (const platform of SNS_PLATFORMS) {
      const scoped = snsCredentialFile(platform, 'brand-a');
      const fallback = snsCredentialFile(platform);
      assert.equal(dirname(scoped), join(snsTokenDir, 'brand-a'), `${platform} 채널 스코프 경로`);
      assert.notEqual(scoped, fallback, `${platform}: 채널 지정이 기본 경로로 폴백하면 다른 브랜드 계정에 게시된다`);
      assert.equal(basename(scoped), basename(fallback), '채널 디렉토리 안에서도 파일명 규약은 동일하다');
    }
  });

  it('경로 트래버설·규약 위반 slug 를 거부한다', () => {
    const rejected = ['..', '../etc', '.', 'a/b', 'a\\b', '/abs', 'UPPER', '-lead', 'dot.dot', 'with space', 'a'.repeat(65)];
    for (const channel of rejected) {
      assert.throws(
        () => snsCredentialFile('THREADS', channel),
        /Invalid channel slug/,
        `"${channel}" 는 거부돼야 한다 — 경로 조립에 쓰이므로 통과하면 토큰 디렉토리를 벗어난다`,
      );
    }
  });

  it('data/<slug> 와 같은 kebab-case 는 통과한다', () => {
    for (const channel of ['a', 'brand-a', 'ttalkkak-lab', 'vn-life', '2026-news']) {
      assert.ok(CHANNEL_SLUG_RE.test(channel), `${channel} 은 정규 slug 다`);
      assert.doesNotThrow(() => snsCredentialFile('YOUTUBE', channel));
    }
  });
});
