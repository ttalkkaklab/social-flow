/**
 * format-resolve.test.mjs — 1단계 인수 조건을 동결한다.
 *
 * 핵심 단언 하나: **FORMAT 없는 기존 scenes.js 는 오늘 값과 문자 동일한 방출을 낸다.**
 * 이것이 회귀 0 의 기계 근거다. 세로 회차에 format.env 가 새로 생겨도 빌더가 읽는
 * 값이 인라인 기본값과 같으므로 ffmpeg 명령이 한 글자도 안 바뀐다.
 *
 * 방출 블록 전체를 문자열로 얼리지 않고 **키별 기대값 표**로 대조한다(설계 §2.5).
 * 블록을 통째로 얼리면 키가 하나 늘 때마다 인수 조건이 죽고, 인라인 기본값과의
 * 맹목 비교로 쓰면 가드 키(0=끔)에서 오탐이 난다.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const HERE = fileURLToPath(new URL('.', import.meta.url));
const REF = resolve(HERE, '../../skills/platform-guide/references');
const RESOLVE = join(REF, 'format-resolve.js');
const PRODUCE = resolve(HERE, '../../skills/produce/references');

const run = (...args) =>
  execFileSync(process.execPath, [RESOLVE, ...args], { encoding: 'utf8' });

/** 방출 블록을 {키: 값} 으로 판다. */
function parseEnv(sh) {
  const out = {};
  for (const m of sh.matchAll(/:\s*"\$\{([A-Z_]+):=([^}]*)\}"/g)) out[m[1]] = m[2];
  return out;
}

/**
 * 설계 §2.5 키별 기대값 표. 갈래가 셋이다.
 *   미러 — 오늘 빌더에 값이 있다. src 의 파일에서 정규식으로 다시 읽어 대조한다.
 *          3단계에서 그 값이 ffmpeg 문자열 안의 리터럴에서 인라인 기본값(`${W:-1080}`)
 *          으로 옮겨 갔다. 근거 자리도 같이 옮긴다 — 아래 "리터럴로 안 되돌아갔다"
 *          테스트가 명령 문자열 쪽을 따로 지킨다.
 *   가드 — 이번에 새로 만드는 변수다. 대조할 오늘 값이 없고 off 값이어야 한다.
 *   공유 — 새로 만드는데 두 포맷이 같은 값을 쓴다. 분기 조건이 세로를 지킨다.
 */
const SHORTS_TABLE = [
  ['W', '1080', '미러', { file: 'build-reel.sh', re: /^W=\$\{W:-1080\}/m }],
  ['H', '1920', '미러', { file: 'build-reel.sh', re: /^H=\$\{H:-1920\}/m }],
  ['FPS', '30', '미러', { file: 'build-reel.sh', re: /FPS=\$\{FPS:-30\}/ }],
  ['ZOOM_BASE', '1620x2880', '미러', { file: 'build-reel.sh', re: /^ZOOM_BASE=\$\{ZOOM_BASE:-1620x2880\}/m }],
  ['MAX_DUR', '13.0', '미러', { file: 'build-reel.sh', re: /MAX_DUR=\$\{MAX_DUR:-13\.0\}/ }],
  ['MAX_SCENE', '20', '미러', { file: 'build-screencast.sh', re: /MAX_SCENE=\$\{MAX_SCENE:-20\}/ }],
  ['TOTAL_HARD', '90', '미러', { file: 'build-screencast.sh', re: /BEGIN\{exit !\(t>90\)\}/ }],
  ['SUB', '1', '미러', { file: 'build-reel.sh', re: /SUB=\$\{SUB:-1\}/ }],
  ['BURN', '1', '미러', { file: 'build-reel.sh', re: /BURN=\$\{BURN:-1\}/ }],
  ['SHRINK_WARN', '3.0', '미러', { file: 'build-screencast.sh', re: /SHRINK_WARN=\$\{SHRINK_WARN:-3\.0\}/ }],
  ['CAP_W', '1080', '미러', { file: 'capture-frames.sh', re: /CAP_W="\$\{CAP_W:-1080\}"/ }],
  ['CAP_H', '1920', '미러', { file: 'capture-frames.sh', re: /CAP_H="\$\{CAP_H:-1920\}"/ }],
  ['OUTRO_ASSET', 'outro.mp4', '미러', { file: 'build-reel.sh', re: /^OUTRO_ASSET=\$\{OUTRO_ASSET:-outro\.mp4\}/m }],
  ['SUB_SIZE', '58', '미러', { file: 'build-reel.sh', re: /^SUB_SIZE=\$\{SUB_SIZE:-58\}/m }],
  ['SUB_ML', '250', '미러', { file: 'build-reel.sh', re: /^SUB_ML=\$\{SUB_ML:-250\}/m }],
  ['SUB_MR', '250', '미러', { file: 'build-reel.sh', re: /^SUB_MR=\$\{SUB_MR:-250\}/m }],
  ['SUB_MV', '380', '미러', { file: 'build-reel.sh', re: /^SUB_MV=\$\{SUB_MV:-380\}/m }],
  ['SUB_OUT', '5', '미러', { file: 'build-reel.sh', re: /^SUB_OUT=\$\{SUB_OUT:-5\}/m }],
  ['SUB_SHA', '1.7', '미러', { file: 'build-reel.sh', re: /^SUB_SHA=\$\{SUB_SHA:-1\.7\}/m }],
  // 가드 — 값 자체가 "그 기능을 끔"이다. 대조할 오늘 값이 없다.
  ['STRICT_DIM', '0', '가드', null],
  ['OVL_HOLD', '0', '가드', null],
  ['BLOWUP_WARN', '0', '가드', null],
  // 공유 — 세로를 지키는 것이 값이 아니라 분기 조건(cards.tsv 5열이 빈 칸)이다.
  ['KB_ZOOM_MIN', '1.06', '공유', null],
  ['KB_ZOOM_MAX', '1.35', '공유', null],
];
test('FORMAT 없는 scenes.js → shorts-9x16 방출이 표와 문자 일치한다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fmt-'));
  const scenes = join(dir, 'scenes.js');
  // 오늘 회차와 같은 모양 — window.FORMAT 이 없다
  writeFileSync(scenes, 'window.SCENES=[{type:"cover",title:"t"}];window.THEME={ink:"#0b1020"};\n');
  const env = parseEnv(run(scenes, '--sh'));

  for (const [key, want] of SHORTS_TABLE) {
    assert.equal(env[key], want, `${key} 방출값이 표와 다르다`);
  }
  // 표에 없는 키를 방출하면 실패한다 — 다음 사람이 값을 몰래 흘리는 것을 막는다.
  const known = new Set(SHORTS_TABLE.map(([k]) => k));
  const extra = Object.keys(env).filter((k) => !known.has(k));
  assert.deepEqual(extra, [], `표에 없는 키를 방출했다: ${extra.join(', ')}`);

  // URL_FMT 부재 = 세로 URL 에 format= 이 안 붙는 오늘 동작
  assert.equal(env.URL_FMT, undefined, 'URL_FMT 는 세로에서 방출하지 않는다');
  assert.equal(env.STRICT_AR, undefined, 'STRICT_AR 는 build-intro.sh 전용이라 방출하지 않는다');
});

test('미러 키는 오늘 빌더 코드에 그 값이 실제로 있다', () => {
  const cache = new Map();
  const read = (f) => {
    if (!cache.has(f)) cache.set(f, readFileSync(join(PRODUCE, f), 'utf8'));
    return cache.get(f);
  };
  for (const [key, want, kind, src] of SHORTS_TABLE) {
    if (kind !== '미러') continue;
    assert.ok(src, `${key} 가 미러인데 근거가 없다`);
    assert.match(read(src.file), src.re, `${key}=${want} 의 근거가 ${src.file} 에서 사라졌다`);
  }
});

test('방출 값이 비어 있지 않다 — null 이 빈 문자열로 새는 배선을 막는다', () => {
  for (const key of ['shorts-9x16', 'youtube-long-16x9']) {
    const env = parseEnv(run('--format', key, '--sh'));
    for (const [k, v] of Object.entries(env)) {
      assert.notEqual(v, '', `${key}: ${k} 방출값이 비었다`);
    }
  }
});

test('가로 촬영 씬 상한 없음 → MAX_SCENE 999999 (0 도 빈 값도 아니다)', () => {
  const env = parseEnv(run('--format', 'youtube-long-16x9', '--sh'));
  assert.equal(env.MAX_SCENE, '999999');
  // 0 이면 build-screencast.sh:136 의 d>m 비교가 모든 씬에 경고를 켠다.
  assert.notEqual(env.MAX_SCENE, '0');
  assert.equal(env.TOTAL_HARD, '1200');
  assert.equal(env.BURN, '0', '가로는 클린 마스터 + subs.srt 계약이다');
  assert.equal(env.URL_FMT, 'wide');
  assert.equal(env.SUB_SIZE, undefined, 'BURN=0 이면 자막 6종을 안 낸다');
});

test('URL 조각 — 세로는 빈 문자열, 가로는 &format=wide', () => {
  assert.equal(run('--format', 'shorts-9x16', '--url'), '');
  assert.equal(run('--format', 'youtube-long-16x9', '--url'), '&format=wide');
});

test('조판 좌표가 있는 프리셋은 --json 이 나온다', () => {
  // 2026-08-17 세이프존 실측으로 가로도 통과하게 됐다. 거부 배선이 살아 있는지는
  // 아래 별도 테스트가 가짜 프리셋으로 확인한다 — 실제 프리셋으로 거부를 단언하면
  // 값이 채워지는 순간 테스트가 죽고, 그때 사람이 배선을 지우는 쪽으로 고치게 된다.
  for (const [key, w] of [['shorts-9x16', 1080], ['youtube-long-16x9', 1920]]) {
    const j = JSON.parse(run('--format', key, '--json'));
    assert.equal(j.format, key);
    assert.equal(j.canvas.w, w);
    assert.ok(j.zone && j.fonts, `${key}: 조판 좌표가 있어야 --json 이 나온다`);
  }
});

test('sub 는 burn 이 열린 포맷에서만 요구한다', () => {
  // 16:9 는 클린 마스터 + subs.srt 계약이라 sub 가 영영 null 이다. 이것을 필수로 두면
  // 세이프존을 다 실측한 뒤에도 --json 이 거부당하고, 그 거부를 풀려고 누군가 세로
  // 자막 값을 베껴 넣는다 — 막으려던 사고가 그 순간 열린다.
  const { FORMATS } = require(join(REF, 'formats.js'));
  assert.equal(FORMATS['youtube-long-16x9'].burn, false);
  assert.equal(FORMATS['youtube-long-16x9'].sub, null);
  const j = JSON.parse(run('--format', 'youtube-long-16x9', '--json'));
  assert.equal(j.sub, null, 'sub 가 null 이어도 --json 이 나와야 한다');
});

test('조판 좌표가 없는 프리셋은 여전히 --json 을 거부한다', () => {
  // 거부 배선의 회귀 테스트. 실제 프리셋이 아니라 임시 사본으로 확인한다.
  const dir = mkdtempSync(join(tmpdir(), 'fmt-'));
  const fake = join(dir, 'formats.js');
  writeFileSync(fake, [
    `const { FORMATS } = require(${JSON.stringify(join(REF, 'formats.js'))});`,
    'const F = JSON.parse(JSON.stringify(FORMATS));',
    "F['shorts-9x16'].zone = null;",
    "module.exports = { FORMATS: F, DEFAULT_FORMAT: 'shorts-9x16' };",
  ].join('\n'));
  const copy = join(dir, 'format-resolve.js');
  writeFileSync(copy, readFileSync(RESOLVE, 'utf8')
    .replace("require('./formats.js')", `require(${JSON.stringify(fake)})`));
  assert.throws(
    () => execFileSync(process.execPath, [copy, '--format', 'shorts-9x16', '--json'],
      { encoding: 'utf8', stdio: 'pipe' }),
    /provisional|null/,
    'zone 이 null 이면 --json 이 exit 1 이어야 한다',
  );
});

test('BURN=1 + 16:9 조합을 거부한다', () => {
  assert.throws(
    () => run('--format', 'youtube-long-16x9', '--burn', '1', '--sh'),
    /BURN=1/,
    '가로 번인은 태울 자막 좌표가 없다',
  );
});

test('모르는 FORMAT 값은 조용히 세로로 떨어지지 않는다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fmt-'));
  const scenes = join(dir, 'scenes.js');
  writeFileSync(scenes, 'window.FORMAT="tiktok-9x16";window.SCENES=[];\n');
  assert.throws(() => run(scenes, '--sh'), /모르는 값/);
});

/**
 * 3단계가 만든 계약 — 치수가 변수로 들어간다.
 *
 * 위 미러 테스트는 인라인 **기본값**만 본다. 누가 ffmpeg 문자열의 `$W:$H` 를 다시
 * `1080:1920` 으로 되돌려도 기본값은 그대로라 그 테스트가 통과한다. 세로는 값이 같아
 * 아무 증상이 없고 가로만 조용히 세로로 찍힌다 — 그래서 명령 쪽을 따로 못 박는다.
 */
test('변수화한 자리가 리터럴로 되돌아가지 않았다', () => {
  const reel = readFileSync(join(PRODUCE, 'build-reel.sh'), 'utf8');
  const cast = readFileSync(join(PRODUCE, 'build-screencast.sh'), 'utf8');
  const outro = readFileSync(join(PRODUCE, 'build-outro.sh'), 'utf8');
  const cap = readFileSync(join(PRODUCE, 'capture-frames.sh'), 'utf8');

  assert.match(reel, /scale=\$W:\$H:force_original_aspect_ratio=increase/, 'b-roll 스케일');
  assert.match(reel, /crop=\$W:\$H,/, 'b-roll 크롭');
  assert.match(reel, /scale=\$ZB:flags=lanczos,zoompan/, '켄번즈 소스');
  assert.match(reel, /:d=1:s=\$\{W\}x\$\{H\}:fps=\$FPS/, '켄번즈 출력 크기');
  assert.match(reel, /PlayResX: \$\{W\}\\nPlayResY: \$\{H\}/, 'ASS PlayRes');
  assert.match(reel, /Style: Sub,%s,\$\{SUB_SIZE\},/, 'ASS Fontsize');
  assert.match(reel, /,1,\$\{SUB_OUT\},\$\{SUB_SHA\},2,\$\{SUB_ML\},\$\{SUB_MR\},\$\{SUB_MV\},1/, 'ASS 마진');

  // 촬영 빌더의 배경 합성·축소 배율은 13단계 몫이라 세로 리터럴 그대로다.
  // 여기서 지키는 것은 "3단계가 앞질러 손대지 않았다"는 쪽이다.
  assert.match(cast, /scale=w=1080:h=\$\{BAND_MAX_H\}/, '밴드 스케일은 세로 리터럴');
  assert.match(cast, /,pad=1080:1920:/, '캔버스 패딩은 세로 리터럴');
  assert.match(cast, /w\/1080\}'\)/, '축소 배율 분모는 세로 리터럴');
  assert.match(cast, /PlayResX: \$\{W\}\\nPlayResY: \$\{H\}/, 'ASS PlayRes');

  assert.match(outro, /if \[ "\$CDIM" = "\$\{W\}x\$\{H\}" \]/, '풀프레임 판정');
  assert.match(outro, /scale=\$ZB:flags=lanczos/, '아웃트로 켄번즈');

  assert.match(cap, /--window-size=\$CAP_W,\$CAP_H/, '캡처 창 크기');
});

test('빌더 3종이 format.env 를 인라인 기본값보다 먼저 읽는다', () => {
  for (const f of ['build-reel.sh', 'build-screencast.sh', 'build-outro.sh']) {
    const src = readFileSync(join(PRODUCE, f), 'utf8');
    const src_i = src.indexOf('[ -f format.env ] && . ./format.env');
    assert.ok(src_i > 0, `${f}: format.env 소싱 줄이 없다`);
    const fps_i = src.indexOf('FPS=${FPS:-30}');
    assert.ok(fps_i > 0 && src_i < fps_i,
      `${f}: 소싱이 인라인 기본값 뒤에 있다 — format.env 가 영영 못 이긴다`);
  }
  // capture-frames.sh 는 cwd 상대 폴백을 두지 않는다(intro 가 저장소 루트에서 부른다)
  const cap = readFileSync(join(PRODUCE, 'capture-frames.sh'), 'utf8');
  assert.match(cap, /\[ -n "\$\{FORMAT_ENV:-\}" \] && \[ -f "\$FORMAT_ENV" \] && \. "\$FORMAT_ENV"/);
  assert.doesNotMatch(cap, /FORMAT_ENV:-\.work/, 'cwd 상대 폴백이 되살아났다');
});

/**
 * 4단계가 만든 계약 — 무성 실패 게이트가 제자리에 있다.
 *
 * 게이트는 통과할 때 아무 말도 안 하므로 하네스가 "있는지"를 못 본다. stdout 이 0 이라는
 * 것은 게이트가 조용하다는 뜻이지 게이트가 산다는 뜻이 아니다. 여기서 존재를 못 박는다.
 */
test('무성 실패 게이트가 빌더에 살아 있다', () => {
  const reel = readFileSync(join(PRODUCE, 'build-reel.sh'), 'utf8');
  const cast = readFileSync(join(PRODUCE, 'build-screencast.sh'), 'utf8');
  const splice = readFileSync(join(PRODUCE, 'splice-clip.sh'), 'utf8');
  const outro = readFileSync(join(PRODUCE, 'build-outro.sh'), 'utf8');
  const cap = readFileSync(join(PRODUCE, 'capture-frames.sh'), 'utf8');

  // 게이트 1 — 캔버스 프로브. frame.html 이 probe 를 알 때만 돈다(냉동 사본 보호).
  assert.match(reel, /probe_canvas\(\)/, '프로브 함수');
  assert.match(reel, /grep -q 'probe' "\$html"/, '프로브는 템플릿이 알 때만 돈다');
  assert.match(reel, /ff00ff/, '마젠타 모서리 판정');

  // 게이트 2 — 캡처 치수 단언이 manifest **앞**에 있다(어긋난 캡처를 기준선에 안 적는다)
  const iAssert = cap.indexOf('캡처 치수 불일치');
  const iManifest = cap.indexOf('MANIFEST=');
  assert.ok(iAssert > 0 && iManifest > iAssert, '치수 단언이 manifest 뒤에 있다');

  // 게이트 3 — 자산 선검사. 강도가 자산마다 다르다.
  assert.match(reel, /assert_exact\b/, 'reel 정확 일치 검사');
  assert.match(reel, /assert_orient\b/, 'reel 방향 검사');
  assert.match(reel, /assert_exact "\$OUTRO_ASSET"/, '아웃트로는 정확 일치');
  assert.match(cast, /assert_exact "\$OUTRO_ASSET"/, 'screencast 아웃트로 정확 일치');
  // b-roll 에 정확 일치를 걸면 멀쩡한 세로 회차가 경고를 문다(720x1280 b-roll 실측).
  assert.match(reel, /\[ -n "\$PBASE" \] && \[ -f "\$PBASE" \] && assert_orient/, 'b-roll 은 방향만');

  // 게이트 4 — splice 조각 해상도 + 챕터 시프트
  assert.match(splice, /\[ -f format\.env \] && \. \.\/format\.env/, 'splice 소싱');
  assert.match(splice, /concat 은 에러 없이 붙이고/, 'splice 해상도 단언');
  assert.match(splice, /chapters-spliced\.txt/, '챕터 시프트');
  assert.match(splice, /math\.ceil\(a \+ d\)/, '챕터는 올림 — 삽입 구간 안에 마커가 안 앉는다');

  // 게이트 6 — 캔버스 대조. 검사는 항상, 리포트 줄만 format.env 조건부.
  for (const [name, src] of [['build-reel', reel], ['build-screencast', cast]]) {
    assert.match(src, /RDIM=\$\(ffprobe/, `${name} 실측`);
    assert.match(src, /\[ -f format\.env \] && say "── 캔버스: 선언/, `${name} 리포트 줄 조건부`);
  }

  // build-outro else 가지 — 세로 캔버스 + 세로 카드 전용
  assert.match(outro, /\[ "\$W" = 1080 \] && \[ "\$H" = 1920 \]/, '캔버스 가드');
  assert.match(outro, /\[ "\$CDW" -lt "\$CDH" \]/, '카드 방향 가드');
});

test('chapters.txt 는 chapters.tsv 가 있을 때만 나온다', () => {
  const reel = readFileSync(join(PRODUCE, 'build-reel.sh'), 'utf8');
  assert.match(reel, /CHAPTSV=""; \[ -f chapters\.tsv \] && CHAPTSV=chapters\.tsv/);
  assert.match(reel, /if \[ -n "\$CHAPTSV" \] && \[ -s work\/chapstart\.tsv \]; then/);
  // 내림 — 챕터 경계는 문장 사이 쉼이라 조금 앞선 타임스탬프가 낫다.
  assert.match(reel, /sec = int\(\$1 \/ fps\)/, '카드 절대 프레임에서 초를 뽑는다');
  // 3요건
  assert.match(reel, /00:00 이어야 한다/);
  assert.match(reel, /유튜브는 3개 이상을 요구한다/);
  assert.match(reel, /10초 미만이다/);
});

/* ───────────────────────────────────────────────────────────────────────────
 * 3단계 — 가로 조판과 촬영 클립 레인
 *
 * 여기서 지키는 것은 "가로 회차만 조용히 세로로 떨어지는" 부류의 결함이다.
 * 세로는 값이 그대로라 아무 증상이 없어 눈으로는 못 잡는다.
 * ─────────────────────────────────────────────────────────────────────────── */

const SB_TPL = resolve(HERE, '../../skills/storyboard/references/storyboard-html-template.html');

test('video-template 이 가로 조판을 안다 (&format=wide)', () => {
  const t = readFileSync(join(PRODUCE, 'video-template.html'), 'utf8');
  assert.match(t, /const wide = qs\.get\('format'\) === 'wide'/, '포맷 파라미터');
  // 캔버스 변수는 html 이 읽는다 — body 에만 붙이면 창은 가로인데 CSS 캔버스가 세로다
  assert.match(t, /root\.classList\.add\('wide'\); document\.body\.classList\.add\('wide'\)/,
    'wide 클래스가 html·body 양쪽에');
  assert.match(t, /:root\.wide\{\s*\n?\s*--w:1920px; --h:1080px;/, '가로 캔버스 토큰');
  // 축소 계단이 기준값 자리를 차지하면 린트가 그것을 프리셋과 대조하게 된다
  assert.match(t, /\n  body\.wide \.cover-title\{font-size:72px/, '가로 기준 글자');
  assert.match(t, /\.tight1 body\.wide \.cover-title\{font-size:66px\}/, '가로 축소 계단');
});

test('캔버스 프로브가 씬 없이도 돈다 — 게이트 1 의 전제', () => {
  const t = readFileSync(join(PRODUCE, 'video-template.html'), 'utf8');
  const iProbe = t.indexOf("qs.get('probe') === '1'");
  const iScene = t.indexOf('const scenes = window.SCENES');
  assert.ok(iProbe > 0, '프로브 분기가 없다');
  assert.ok(iProbe < iScene, '프로브가 scenes.js 를 읽은 뒤에 있다 — 미주입 상태에서 못 돈다');
  assert.match(t, /html\.probe,body\.probe\{background:#FF00FF\}/, '마젠타 도색');
  // build-reel 은 네 모서리를 정확히 ff00ff 로 읽는다 — 배경·글자가 남으면 모서리가 오염된다
  assert.match(t, /body\.probe \.bg,body\.probe \.scrim,body\.probe \.zone/, '레이어 숨김');
});

test('촬영 씬 판정이 편 단위가 아니라 씬 단위다', () => {
  const t = readFileSync(join(PRODUCE, 'video-template.html'), 'utf8');
  assert.match(t, /const isFootage = !!\(scene\.visual &&/, '씬 하나를 본다');
  assert.doesNotMatch(t, /SCENES\.some\([^)]*recording/, '편 전체로 뒤집는 판정이 살아났다');
  assert.match(t, /zone\.classList\.add\(isFootage \? 'l3' : 'top'\)/, '로어서드 분기');

  // 콘티 템플릿도 같다 — 여기서 편 단위로 뒤집으면 촬영 씬 하나가 생성 씬까지
  // 촬영 계약(자수 40·말속도 5~6자/초)으로 검사받게 만든다
  const sb = readFileSync(SB_TPL, 'utf8');
  assert.match(sb, /function recOf\(s\)/, '씬 단위 판정 함수');
  assert.doesNotMatch(sb, /\bvar isRec\b/, '편 단위 isRec 이 되살아났다');
  assert.match(sb, /function recTall\(s\) \{ return recOf\(s\) && !WIDE; \}/,
    '세로 촬영 레인만 상단 블록 + 녹화 밴드다');
  assert.match(sb, /if \(WIDE\) probe\.style\.setProperty\("--fw", "1920px"\)/,
    '가로 넘침 실측의 기준변');
});

test('build-reel 촬영 레인 — sync 카드가 오디오 머신을 비켜 간다', () => {
  const reel = readFileSync(join(PRODUCE, 'build-reel.sh'), 'utf8');
  // 5열은 없어도 된다 — 4열 파일이 오늘 그대로 도는 것이 회귀 0 이다
  assert.match(reel, /read -r -u 3 IDX SRC TARGET ZDIR OPTS/, 'cards.tsv 5열');
  assert.match(reel, /if \[ "\$SYNC" -eq 1 \]; then CPRE=0; CPOST=0; CMIN=0;/,
    'sync 카드는 프리롤·포스트롤·최소길이가 0 이다');
  // 카드 루프가 전역 PRE 를 다시 집으면 sync 카드만 0.4초 밀린다
  assert.doesNotMatch(reel, /-v p="\$PRE"/, '루프 안에 전역 PRE 가 남았다');
  assert.match(reel, /--pre "\$CPRE"/, 'reveal 타이밍도 카드 값을 쓴다');
  // 트림·atempo 를 태우면 그만큼 화면과 어긋난다
  assert.match(reel, /MUTE=1   # 아래 오디오 머신/, 'sync 는 트림·속도 보정을 건너뛴다');
  assert.match(reel, /SYNCNOTE="무음 클립 — 정규화 생략"/, '무음 클립은 loudnorm 도 안 건다');
});

test('build-reel 켄번즈 — 촬영 클립엔 안 걸고, 가로엔 팬을 쓴다', () => {
  const reel = readFileSync(join(PRODUCE, 'build-reel.sh'), 'utf8');
  assert.match(reel, /if \[ "\$ZD" = "none" \]; then/, 'zoom=none');
  assert.match(reel, /\$\{CUR\}format=yuv420p\[vout\]/, 'none 은 소스 확대도 안 한다');
  assert.match(reel, /l2r\) PX="\(iw-iw\/zoom\)\*on\/\$ZLAST"/, '팬 방향식');
  // 팬 배율은 프리셋 clamp 를 넘지 못한다 — 넘으면 화각이 크게 잘린다
  assert.match(reel, /-v lo="\$KB_ZOOM_MIN" -v hi="\$KB_ZOOM_MAX"/, '팬 배율 clamp');
  assert.match(reel, /KB_ZOOM_MIN=\$\{KB_ZOOM_MIN:-1\.06\}/, 'clamp 인라인 기본값');
});

test('build-reel 파일 자막 — 전사본 시각을 카드 절대 시각으로 옮긴다', () => {
  const reel = readFileSync(join(PRODUCE, 'build-reel.sh'), 'utf8');
  assert.match(reel, /if \[ -n "\$SUBSF" \]; then/, 'subs= 분기');
  // 카드 길이를 넘는 끝은 잘라야 한다 — 안 그러면 다음 카드 위로 자막이 흘러간다
  assert.match(reel, /-v d="\$D" 'BEGIN\{if\(e>d\)e=d;/, '카드 끝 클램프');
  // ASS·SRT 를 같은 자리에서 찍는다(역변환하면 두 파일 시각이 어긋난다)
  const iAss = reel.indexOf("printf 'Dialogue: 0,%s,%s,Sub,,0,0,0,,{\\\\fad(160,120)}%s\\n' \"$(asstime \"$ST\")\" \"$(asstime \"$EN\")\" \"$FT\"");
  assert.ok(iAss > 0, '파일 자막의 ASS 줄');
  assert.match(reel, /SRTN=\$\(\(SRTN\+1\)\); NSF=\$\(\(NSF\+1\)\)/, '파일 자막도 SRT 통번호를 쓴다');
});

test('모르는 cards.tsv 옵션은 조용히 무시되지 않는다', () => {
  const reel = readFileSync(join(PRODUCE, 'build-reel.sh'), 'utf8');
  // 오타가 무시되면 sync 가 빠진 촬영 카드가 0.4초 어긋난 채 나가고, 그것을 눈으로 잡아야 한다
  assert.match(reel, /\*\) say "✗ card \$IDX: cards\.tsv 5열 옵션 모름 — \$KV"; exit 1 ;;/);
  assert.match(reel, /pan 방향 모름/, '모르는 팬 방향도 멈춘다');
});
