#!/usr/bin/env node
/**
 * format-resolve.js — scenes.js 의 포맷을 읽어 프리셋과 병합하고 방출한다.
 *
 *   format-resolve.js <scenes.js> --sh     빌더가 소싱할 format.env
 *   format-resolve.js <scenes.js> --json   리뷰어 위임·문서 생성용
 *   format-resolve.js <scenes.js> --url    캡처 URL 조각 (&format=wide 또는 빈 문자열)
 *   format-resolve.js --format <키> --sh   scenes.js 없이 포맷을 직접 지정 (인트로 등)
 *
 * ## 회귀 0 의 정의
 *
 * `window.FORMAT` 이 없는 기존 scenes.js 를 넣으면 shorts-9x16 방출이 나오고,
 * 그 방출의 모든 값이 오늘 빌더가 쓰는 값과 같다. 그래서 세로 회차에 format.env 가
 * 새로 생겨도 ffmpeg 명령이 한 글자도 안 바뀐다. **이것이 1단계 인수 조건이다.**
 *
 * 방출 형태가 `: "${VAR:=값}"` 인 이유는 우선순위다 — 호출자 env → format.env →
 * 빌더 인라인 기본값 순으로 이긴다. 평범한 대입(`VAR=값`)으로 쓰면 오늘 빌더 계약
 * (`${VAR:-기본값}` 이 호출자 env 를 항상 앞세운다)이 뒤집힌다.
 *
 * ## 거부하는 두 가지
 *
 * 조용히 세로로 떨어지면 12분치 캡처를 태운 뒤에야 드러나므로 여기서 exit 1 한다.
 *   ① 기하 블록(zone·fonts·sub)이 null 인 프리셋에 그 값을 요구하는 호출
 *   ② BURN=1 + 16:9 — 가로 자막 블록이 실측 전이라 태울 좌표가 없다
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const { FORMATS, DEFAULT_FORMAT } = require('./formats.js');

function die(msg) {
  process.stderr.write('format-resolve: ' + msg + '\n');
  process.exit(1);
}

/**
 * scenes.js 에서 window.FORMAT 을 꺼낸다.
 *
 * vm 샌드박스에 global.window 를 깔고 평가한다 — extract-text.js:32 가 쓰는
 * 방식과 같은 선례다. scenes.js 는 최상위에 window.SCENES / window.THEME 등을
 * 대입하는 평범한 스크립트라 이 방식으로 전부 읽힌다.
 */
function readScenes(file) {
  if (!fs.existsSync(file)) die(`scenes.js 없음: ${file}`);
  const src = fs.readFileSync(file, 'utf8');
  const sandbox = { window: {}, console: { log() {}, warn() {}, error() {} } };
  sandbox.globalThis = sandbox;
  try {
    vm.runInNewContext(src, sandbox, { filename: file, timeout: 5000 });
  } catch (e) {
    die(`scenes.js 평가 실패: ${e && e.message}`);
  }
  return sandbox.window;
}

function pickFormat(win, override) {
  if (override) {
    if (!FORMATS[override]) die(`모르는 포맷: ${override} (${Object.keys(FORMATS).join(' | ')})`);
    return override;
  }
  // 부재 = shorts-9x16. 이 폴백이 회귀 0 의 진입점이다.
  const key = win && typeof win.FORMAT === 'string' ? win.FORMAT : DEFAULT_FORMAT;
  if (!FORMATS[key]) {
    die(`scenes.js 의 window.FORMAT 이 모르는 값이다: ${JSON.stringify(key)} ` +
        `(${Object.keys(FORMATS).join(' | ')})`);
  }
  return key;
}

/** 소수 표기를 방출 표와 문자 그대로 맞춘다 — 3.0 이 "3" 으로 새면 린트가 어긋난다. */
function num(v, decimals) {
  if (decimals === undefined) return String(v);
  return Number(v).toFixed(decimals);
}

/**
 * 촬영 씬 길이 상한이 없을 때(recSceneMax: null) 쓰는 도달 불가 상수.
 *
 * build-screencast.sh:136 이 `awk 'BEGIN{exit !(d>m)}'` 라 0 은 "끔"이 아니라
 * "전 씬 경고"다(0.5초 씬도 문다). 빈 값도 안 된다 — :37 의 `${MAX_SCENE:-20}` 가
 * 20 으로 되돌려 결정이 소리 없이 사라진다. inf 는 awk 구현 의존이고 1e400 은
 * strnum 파싱에 실패해 문자열 비교로 떨어진다. 정수 표기로 고정한다.【전부 실측】
 */
const NO_SCENE_CAP = 999999;

/**
 * §2.5 방출 표 그대로. 세로 행은 오늘 값과 문자 동일하다. 가로는 프리셋이 정본이다.
 *
 * 방출 순서를 고정한다 — 단위 테스트가 문자열 전체를 대조하므로 순서가 흔들리면
 * 인수 조건이 흔들린다.
 */
function toShell(key) {
  const f = FORMATS[key];
  const L = [];
  const put = (k, v) => L.push(`: "\${${k}:=${v}}"`);
  const line = (...ks) => {
    const out = ks.map(([k, v]) => `: "\${${k}:=${v}}"`).join('; ');
    L.push(out);
  };

  line(['W', f.canvas.w], ['H', f.canvas.h], ['FPS', f.canvas.fps]);
  put('ZOOM_BASE', f.image.zoomBase);
  line(
    ['MAX_DUR', num(f.pacing.sceneMax, 1)],
    ['MAX_SCENE', f.pacing.recSceneMax === null ? NO_SCENE_CAP : f.pacing.recSceneMax],
    ['TOTAL_HARD', f.pacing.totalHard],
  );
  line(['SUB', 1], ['BURN', f.burn ? 1 : 0], ['STRICT_DIM', f.guards.strictDim]);

  const cap = [['CAP_W', f.capture.w], ['CAP_H', f.capture.h]];
  // urlFormat 부재면 URL_FMT 를 안 낸다 — 세로 URL 에 format= 이 안 붙는 것이 오늘이다.
  if (f.capture.urlFormat) cap.push(['URL_FMT', f.capture.urlFormat]);
  line(...cap);

  put('OUTRO_ASSET', f.outroAsset);
  line(
    ['OVL_HOLD', f.guards.ovlHold === 0 ? '0' : num(f.guards.ovlHold, 1)],
    ['SHRINK_WARN', num(f.guards.shrinkWarn, 1)],
    ['BLOWUP_WARN', f.guards.blowupWarn === 0 ? '0' : num(f.guards.blowupWarn, 1)],
  );
  line(
    ['KB_ZOOM_MIN', num(f.kenburns.panZoomMin, 2)],
    ['KB_ZOOM_MAX', num(f.kenburns.panZoomMax, 2)],
  );

  // 번인이 열린 포맷만 자막 6종을 낸다. BURN=0 이면 태울 곳이 없다.
  if (f.burn) {
    if (!f.sub) die(`${key}: burn=true 인데 sub 블록이 null 이다`);
    line(['SUB_SIZE', f.sub.fontSize], ['SUB_ML', f.sub.marginLR], ['SUB_MR', f.sub.marginLR]);
    line(['SUB_MV', f.sub.marginV], ['SUB_OUT', f.sub.outline], ['SUB_SHA', num(f.sub.shadow, 1)]);
  }

  // STRICT_AR 는 방출하지 않는다 — build-intro.sh 전용이고 회차 빌드가 안 읽는다.
  return L.join('\n') + '\n';
}

function toUrl(key) {
  const f = FORMATS[key];
  return f.capture.urlFormat ? `&format=${f.capture.urlFormat}` : '';
}

/**
 * 기하 블록이 null 인 프리셋으로 조판·게이트를 하려는 호출을 막는다.
 *
 * **`sub` 는 여기서 안 본다.** 그 블록은 번인 자막 좌표이고 `burn: false` 인 포맷은
 * 태울 곳이 없어 영영 null 이다(16:9 는 클린 마스터 + subs.srt 계약). `sub` 를 필수로
 * 두면 세이프존을 다 실측한 뒤에도 --json 이 거부당하고, 그 거부를 풀려고 누군가
 * 세로 자막 값을 베껴 넣게 된다 — 막으려던 사고가 그 순간 열린다.
 * 번인이 열린 포맷(`burn: true`)에서만 `sub` 를 요구한다.
 */
function assertGeometry(key, why) {
  const f = FORMATS[key];
  const need = f.burn ? ['zone', 'fonts', 'sub'] : ['zone', 'fonts'];
  const missing = need.filter((k) => f[k] === null);
  if (missing.length) {
    die(
      `${key}: ${missing.join('·')} 블록이 아직 null 이다(provisional). ${why}\n` +
      `  세이프존 실측 전이라 값이 없다. 세로 값으로 대신 돌면 12분치 캡처를 태운 뒤에야 드러난다.`,
    );
  }
}

function main(argv) {
  const args = argv.slice(2);
  let file = null;
  let override = null;
  let mode = null;
  let burn = null;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--sh' || a === '--json' || a === '--url') mode = a.slice(2);
    else if (a === '--format') override = args[++i];
    else if (a === '--burn') burn = args[++i];
    else if (a.startsWith('--')) die(`모르는 인자: ${a}`);
    else file = a;
  }
  if (!mode) die('출력 모드가 필요하다: --sh | --json | --url');
  if (!file && !override) die('scenes.js 경로 또는 --format <키> 가 필요하다');

  const win = file ? readScenes(path.resolve(file)) : {};
  const key = pickFormat(win, override);
  const f = FORMATS[key];

  // 거부 ② — 가로 번인은 태울 자막 좌표가 없다. 프리셋 burn 이 false 인데
  // 호출자가 BURN=1 을 요구하면 조용히 세로 좌표로 태우게 되므로 여기서 멈춘다.
  const wantBurn = burn === null ? (f.burn ? '1' : '0') : String(burn);
  if (wantBurn === '1' && !f.burn) {
    die(
      `${key}: BURN=1 을 요구했는데 이 포맷의 sub 블록이 null 이다.\n` +
      `  16:9 는 클린 마스터 + subs.srt 계약이라 번인이 없다. 세로 좌표로 태우면\n` +
      `  자막이 화면 밖으로 나가거나 안전영역을 침범한다.`,
    );
  }

  if (mode === 'sh') {
    process.stdout.write(toShell(key));
  } else if (mode === 'url') {
    process.stdout.write(toUrl(key));
  } else {
    // JSON 은 조판·게이트가 읽으므로 기하 블록이 살아 있어야 한다.
    assertGeometry(key, '--json 은 조판 좌표를 요구한다.');
    process.stdout.write(JSON.stringify({ format: key, ...f }, null, 2) + '\n');
  }
}

if (require.main === module) main(process.argv);

module.exports = { toShell, toUrl, pickFormat, readScenes, NO_SCENE_CAP };
