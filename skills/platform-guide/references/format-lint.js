#!/usr/bin/env node
/**
 * format-lint.js — 인라인 미러와 프리셋을 대조한다. 읽기 전용이다.
 *
 *   format-lint.js            어긋난 쌍을 찍고 있으면 exit 1
 *   format-lint.js --list     전 규칙과 실제 값을 찍는다 (상수 인벤토리)
 *
 * ## 왜 미러가 있는가
 *
 * 브라우저 템플릿은 formats.js 를 못 읽는다 — data/<채널>/<주제>/ 에서 플러그인
 * 루트로 가는 <script src> 경로가 없다. 셸 빌더도 node 모듈을 안 읽는다. 그래서
 * 같은 상수가 프리셋과 템플릿·빌더 두 곳에 산다. 이중 관리는 반드시 어긋나므로
 * 사람 눈이 아니라 이 린터가 대조한다.
 *
 * ## 첫 실행이 곧 인벤토리다
 *
 * 어긋난 쌍이 나오면 그건 이 작업이 만든 회귀가 아니라 **이미 있던 드리프트**다.
 * 고칠지 프리셋을 맞출지는 사람이 판정한다.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { FORMATS } = require('./formats.js');

const ROOT = path.resolve(__dirname, '../../..');
const S = FORMATS['shorts-9x16'];

const read = (rel) => {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, 'utf8');
};

/** 소수 자리를 맞춰 문자 대조한다 — 3.0 대 3 이 어긋남으로 잡히면 안 된다. */
const fix = (v, d) => Number(v).toFixed(d);

/** 파생 퍼센트: 절대px / 기준변 × 100. 폰트 비율은 소수 넷째, 나머지는 둘째. */
const pct = (px, base, d = 2) => fix((px / base) * 100, d);
const ratio = (px, base) => fix(px / base, 4);

/**
 * 규칙 하나 = { 이름, 파일, 정규식, 기대값 }.
 * 정규식의 첫 캡처 그룹이 실제 값이다. 기대값은 프리셋에서 파생한다.
 */
const RULES = [
  // ── 빌더 인라인 기본값 (미러 키) ───────────────────────────────────
  { name: 'build-reel FPS', file: 'skills/produce/references/build-reel.sh',
    re: /FPS=\$\{FPS:-(\d+)\}/, want: String(S.canvas.fps) },
  { name: 'build-reel MAX_DUR', file: 'skills/produce/references/build-reel.sh',
    re: /MAX_DUR=\$\{MAX_DUR:-([\d.]+)\}/, want: fix(S.pacing.sceneMax, 1) },
  { name: 'build-reel SUB', file: 'skills/produce/references/build-reel.sh',
    re: /\bSUB=\$\{SUB:-(\d)\}/, want: '1' },
  { name: 'build-reel BURN', file: 'skills/produce/references/build-reel.sh',
    re: /BURN=\$\{BURN:-(\d)\}/, want: S.burn ? '1' : '0' },
  { name: 'build-reel ZOOM_SPAN', file: 'skills/produce/references/build-reel.sh',
    re: /ZOOM_SPAN=\$\{ZOOM_SPAN:-([\d.]+)\}/, want: String(S.kenburns.zoomSpan) },
  { name: 'build-reel W', file: 'skills/produce/references/build-reel.sh',
    re: /^W=\$\{W:-(\d+)\}/m, want: String(S.canvas.w) },
  { name: 'build-reel H', file: 'skills/produce/references/build-reel.sh',
    re: /^H=\$\{H:-(\d+)\}/m, want: String(S.canvas.h) },
  { name: 'build-reel ZOOM_BASE', file: 'skills/produce/references/build-reel.sh',
    re: /^ZOOM_BASE=\$\{ZOOM_BASE:-(\d+x\d+)\}/m, want: S.image.zoomBase },
  { name: 'build-screencast W', file: 'skills/produce/references/build-screencast.sh',
    re: /^W=\$\{W:-(\d+)\}/m, want: String(S.canvas.w) },
  { name: 'build-screencast H', file: 'skills/produce/references/build-screencast.sh',
    re: /^H=\$\{H:-(\d+)\}/m, want: String(S.canvas.h) },
  { name: 'build-outro ZOOM_BASE', file: 'skills/produce/references/build-outro.sh',
    re: /^ZOOM_BASE=\$\{ZOOM_BASE:-(\d+x\d+)\}/m, want: S.image.zoomBase },
  { name: 'build-screencast FPS', file: 'skills/produce/references/build-screencast.sh',
    re: /FPS=\$\{FPS:-(\d+)\}/, want: String(S.canvas.fps) },
  { name: 'build-screencast MAX_SCENE', file: 'skills/produce/references/build-screencast.sh',
    re: /MAX_SCENE=\$\{MAX_SCENE:-(\d+)\}/, want: String(S.pacing.recSceneMax) },
  { name: 'build-screencast SHRINK_WARN', file: 'skills/produce/references/build-screencast.sh',
    re: /SHRINK_WARN=\$\{SHRINK_WARN:-([\d.]+)\}/, want: fix(S.guards.shrinkWarn, 1) },
  { name: 'build-screencast TOTAL_HARD', file: 'skills/produce/references/build-screencast.sh',
    re: /BEGIN\{exit !\(t>(\d+)\)\}/, want: String(S.pacing.totalHard) },
  { name: 'capture-frames CAP_W', file: 'skills/produce/references/capture-frames.sh',
    re: /CAP_W="\$\{CAP_W:-(\d+)\}"/, want: String(S.capture.w) },
  { name: 'capture-frames CAP_H', file: 'skills/produce/references/capture-frames.sh',
    re: /CAP_H="\$\{CAP_H:-(\d+)\}"/, want: String(S.capture.h) },

  // ── video-template :root 토큰 ──────────────────────────────────────
  { name: 'video-template --w', file: 'skills/produce/references/video-template.html',
    re: /--w:(\d+)px/, want: String(S.canvas.w) },
  { name: 'video-template --h', file: 'skills/produce/references/video-template.html',
    re: /--h:(\d+)px/, want: String(S.canvas.h) },
  { name: 'video-template --zone-x', file: 'skills/produce/references/video-template.html',
    re: /--zone-x:(\d+)px/, want: String(S.zone.x) },
  { name: 'video-template --zone-top', file: 'skills/produce/references/video-template.html',
    re: /--zone-top:(\d+)px/, want: String(S.zone.top) },
  { name: 'video-template --zone-bottom', file: 'skills/produce/references/video-template.html',
    re: /--zone-bottom:(\d+)px/, want: String(S.zone.bottom) },

  // ── ASS Style — 빌더 인라인과 프리셋 sub 블록 ────────────────────
  { name: 'build-reel SUB_SIZE', file: 'skills/produce/references/build-reel.sh',
    re: /^SUB_SIZE=\$\{SUB_SIZE:-(\d+)\}/m, want: String(S.sub.fontSize) },
  { name: 'build-reel SUB_ML', file: 'skills/produce/references/build-reel.sh',
    re: /^SUB_ML=\$\{SUB_ML:-(\d+)\}/m, want: String(S.sub.marginLR) },
  { name: 'build-reel SUB_MR', file: 'skills/produce/references/build-reel.sh',
    re: /^SUB_MR=\$\{SUB_MR:-(\d+)\}/m, want: String(S.sub.marginLR) },
  { name: 'build-reel SUB_MV', file: 'skills/produce/references/build-reel.sh',
    re: /^SUB_MV=\$\{SUB_MV:-(\d+)\}/m, want: String(S.sub.marginV) },
  { name: 'build-reel SUB_OUT', file: 'skills/produce/references/build-reel.sh',
    re: /^SUB_OUT=\$\{SUB_OUT:-(\d+)\}/m, want: String(S.sub.outline) },
  { name: 'build-reel SUB_SHA', file: 'skills/produce/references/build-reel.sh',
    re: /^SUB_SHA=\$\{SUB_SHA:-([\d.]+)\}/m, want: fix(S.sub.shadow, 1) },
  { name: 'build-screencast SUB_SIZE', file: 'skills/produce/references/build-screencast.sh',
    re: /^SUB_SIZE=\$\{SUB_SIZE:-(\d+)\}/m, want: String(S.sub.fontSize) },
  { name: 'build-screencast SUB_ML', file: 'skills/produce/references/build-screencast.sh',
    re: /^SUB_ML=\$\{SUB_ML:-(\d+)\}/m, want: String(S.sub.marginLR) },
  { name: 'build-screencast SUB_MR', file: 'skills/produce/references/build-screencast.sh',
    re: /^SUB_MR=\$\{SUB_MR:-(\d+)\}/m, want: String(S.sub.marginLR) },
  { name: 'build-screencast SUB_MV', file: 'skills/produce/references/build-screencast.sh',
    re: /^SUB_MV=\$\{SUB_MV:-(\d+)\}/m, want: String(S.sub.marginV) },
  { name: 'build-screencast SUB_OUT', file: 'skills/produce/references/build-screencast.sh',
    re: /^SUB_OUT=\$\{SUB_OUT:-(\d+)\}/m, want: String(S.sub.outline) },
  { name: 'build-screencast SUB_SHA', file: 'skills/produce/references/build-screencast.sh',
    re: /^SUB_SHA=\$\{SUB_SHA:-([\d.]+)\}/m, want: fix(S.sub.shadow, 1) },

  // ── 4단계 게이트가 만든 인라인 기본값 ────────────────────────────
  { name: 'build-reel OUTRO_ASSET', file: 'skills/produce/references/build-reel.sh',
    re: /^OUTRO_ASSET=\$\{OUTRO_ASSET:-([^}]+)\}/m, want: S.outroAsset },
  { name: 'build-screencast OUTRO_ASSET', file: 'skills/produce/references/build-screencast.sh',
    re: /^OUTRO_ASSET=\$\{OUTRO_ASSET:-([^}]+)\}/m, want: S.outroAsset },
  { name: 'build-reel STRICT_DIM', file: 'skills/produce/references/build-reel.sh',
    re: /^STRICT_DIM=\$\{STRICT_DIM:-(\d)\}/m, want: String(S.guards.strictDim) },
  { name: 'build-screencast STRICT_DIM', file: 'skills/produce/references/build-screencast.sh',
    re: /^STRICT_DIM=\$\{STRICT_DIM:-(\d)\}/m, want: String(S.guards.strictDim) },
  { name: 'splice-clip STRICT_DIM', file: 'skills/produce/references/splice-clip.sh',
    re: /^STRICT_DIM=\$\{STRICT_DIM:-(\d)\}/m, want: String(S.guards.strictDim) },
  { name: 'splice-clip W', file: 'skills/produce/references/splice-clip.sh',
    re: /^W=\$\{W:-(\d+)\}/m, want: String(S.canvas.w) },
  { name: 'splice-clip H', file: 'skills/produce/references/splice-clip.sh',
    re: /H=\$\{H:-(\d+)\}/, want: String(S.canvas.h) },
  // PlayRes 는 이제 캔버스 변수를 그대로 쓴다 — 프리셋 playResX 가 canvas.w 와
  // 어긋나면 자막 좌표계가 캔버스와 달라지므로 그 등식을 여기서 지킨다.
  { name: '프리셋 playResX == canvas.w', file: 'skills/platform-guide/references/formats.js',
    re: /playResX:\s*(\d+)/, want: String(S.canvas.w) },
  { name: '프리셋 playResY == canvas.h', file: 'skills/platform-guide/references/formats.js',
    re: /playResY:\s*(\d+)/, want: String(S.canvas.h) },

  // ── storyboard 콘티 템플릿 파생 퍼센트 ───────────────────────────
  { name: '콘티 .fzone left/right %', file: 'skills/storyboard/references/storyboard-html-template.html',
    re: /\.fzone \{[\s\S]{0,120}?left: ([\d.]+)%/, want: pct(S.zone.x, S.canvas.w) },
  { name: '콘티 .fzone top %', file: 'skills/storyboard/references/storyboard-html-template.html',
    re: /\.fzone \{[\s\S]{0,160}?top: ([\d.]+)%/, want: pct(S.zone.top, S.canvas.h) },
  { name: '콘티 .fzone bottom %', file: 'skills/storyboard/references/storyboard-html-template.html',
    re: /\.fzone \{[\s\S]{0,200}?bottom: ([\d.]+)%/, want: pct(S.zone.bottom, S.canvas.h) },
  { name: '콘티 .f-sub left %', file: 'skills/storyboard/references/storyboard-html-template.html',
    re: /\.f-sub \{[\s\S]{0,120}?left: ([\d.]+)%/, want: pct(S.sub.marginLR, S.canvas.w) },
  { name: '콘티 .f-sub bottom %', file: 'skills/storyboard/references/storyboard-html-template.html',
    re: /\.f-sub \{[\s\S]{0,180}?bottom: ([\d.]+)%/, want: pct(S.sub.marginV, S.canvas.h) },
  { name: '콘티 .f-sub 폰트 비율', file: 'skills/storyboard/references/storyboard-html-template.html',
    re: /\.f-sub \{[\s\S]{0,260}?font-size: calc\(var\(--fw\) \* ([\d.]+)\)/,
    want: ratio(S.sub.fontSize, S.canvas.w) },
  { name: '콘티 #fr-probe --fw', file: 'skills/storyboard/references/storyboard-html-template.html',
    re: /#fr-probe \{[^}]*--fw:\s*(\d+)px/, want: String(S.canvas.w) },

  // ── 문서에 박힌 임계·치수 ────────────────────────────────────────
  { name: 'screencast-pipeline 축소 임계', file: 'skills/produce/references/screencast-pipeline.md',
    re: /축소 배율 \(>([\d.]+)\)|> ?([\d.]+)\)[^\n]*글씨|\(>([\d.]+)\)/,
    want: fix(S.guards.shrinkWarn, 1), optional: true },
];

/**
 * 두 빌더의 ASS 헤더·Style 상호 대조. 프리셋과 별개로 **서로** 같아야 한다 —
 * 한쪽만 고치면 촬영본과 생성본의 자막이 다른 폰트·위치로 나온다.
 */
const SUB_KEYS = ['SUB_SIZE', 'SUB_ML', 'SUB_MR', 'SUB_MV', 'SUB_OUT', 'SUB_SHA'];

function crossCheckAss(issues) {
  const a = read('skills/produce/references/build-reel.sh');
  const b = read('skills/produce/references/build-screencast.sh');
  if (!a || !b) return;
  const grab = (src) => {
    const m = src.match(/printf "Style: Sub,%s,([^"]*)"/);
    return m ? m[1] : null;
  };
  const ra = grab(a);
  const rb = grab(b);

  // 인라인 기본값 층 — Style 줄이 `${SUB_MV}` 로 변수화된 뒤로는 문자 대조가 값을
  // 못 본다. 두 빌더가 같은 변수를 쓰면서 기본값만 다르면 촬영본과 생성본의 자막이
  // 다른 자리에 앉는데 Style 줄은 똑같다. 그 구멍을 여기서 막는다.
  for (const k of SUB_KEYS) {
    const re = new RegExp('^' + k + '=\\$\\{' + k + ':-([\\d.]+)\\}', 'm');
    const va = a.match(re);
    const vb = b.match(re);
    if (!va || !vb) {
      issues.push({ name: `${k} 인라인 기본값`, got: `reel ${va ? va[1] : '(없음)'} · screencast ${vb ? vb[1] : '(없음)'}`,
                    want: '두 빌더 모두 선언' });
    } else if (va[1] !== vb[1]) {
      issues.push({ name: `${k} 인라인 기본값 상호 대조`, got: `build-screencast: ${vb[1]}`, want: `build-reel: ${va[1]}` });
    }
  }

  if (ra === null || rb === null) {
    issues.push({ name: 'ASS Style 상호 대조', got: '(못 찾음)', want: '두 빌더 모두 Style: Sub 줄' });
    return;
  }
  if (ra !== rb) {
    issues.push({ name: 'ASS Style 상호 대조', got: `build-screencast: ${rb}`, want: `build-reel: ${ra}` });
  }
}

function main() {
  const listOnly = process.argv.includes('--list');
  const issues = [];
  const rows = [];

  for (const r of RULES) {
    const src = read(r.file);
    if (src === null) {
      issues.push({ name: r.name, got: '(파일 없음)', want: r.file });
      continue;
    }
    const m = src.match(r.re);
    // 캡처 그룹이 여러 개인 규칙은 처음으로 매칭된 것을 쓴다.
    let got = m ? (m.slice(1).find((x) => x !== undefined) ?? null) : null;
    // CSS 는 앞자리 0 을 생략한다(.0537). 표기 차이를 어긋남으로 읽지 않는다.
    if (got !== null && /^\.\d+$/.test(got)) got = '0' + got;
    if (got === null) {
      if (!r.optional) issues.push({ name: r.name, got: '(정규식 불일치)', want: r.want });
      continue;
    }
    rows.push({ name: r.name, got, want: r.want, ok: got === r.want });
    if (got !== r.want) issues.push({ name: r.name, got, want: r.want });
  }

  crossCheckAss(issues);

  if (listOnly) {
    for (const row of rows) {
      process.stdout.write(
        `${row.ok ? '  ' : '✗ '}${row.name.padEnd(34)} ${String(row.got).padEnd(18)} ${row.ok ? '' : '기대 ' + row.want}\n`,
      );
    }
    process.stdout.write(`\n규칙 ${rows.length}개 · 어긋남 ${issues.length}건\n`);
  }

  if (issues.length) {
    if (!listOnly) {
      process.stderr.write('format-lint: 인라인 미러가 프리셋과 어긋났다\n');
      for (const i of issues) {
        process.stderr.write(`  ✗ ${i.name}: 실제 ${i.got} · 프리셋 ${i.want}\n`);
      }
      process.stderr.write(
        '\n어느 쪽이 맞는지 사람이 판정한다 — 프리셋을 고치면 회귀 0 이 깨질 수 있다.\n',
      );
    }
    process.exit(1);
  }
  if (!listOnly) process.stdout.write(`format-lint: 미러 ${rows.length}개 일치\n`);
}

if (require.main === module) main();

module.exports = { RULES };
