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
import { MUSIC_GENERATION_MODES, MUSIC_SCALES } from '../dist/music-client.js';
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

describe('단일 출처 상수', () => {
  const enumOf = (toolName, path) => {
    const parts = path.split('.');
    let schema = byName.get(toolName).inputSchema;
    for (const part of parts) schema = schema.properties[part];
    return schema.enum;
  };

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
