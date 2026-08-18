#!/usr/bin/env node
/**
 * 슬라이드 파일 기계 검사 — storyboard §8 자가 검증용.
 *
 *   node check-slide.js <storyboard 디렉토리>            # slides/ 전부
 *   node check-slide.js <storyboard 디렉토리> s12-*.html # 한 장만
 *
 * 보는 것 (scenes-schema §슬라이드 씬 계약):
 *   1. 파일명 s<샷번호>-<slug>.html ↔ SLIDE_SHOT ↔ scenes.js visual.slide.file 삼자 일치
 *   2. 한글 문자열 리터럴이 전부 scenes.js 에 있다 — 문체 게이트(screen 표면)를
 *      통과한 적 없는 글자가 화면에 나가는 길을 막는다 (주석 속 한글은 허용)
 *   3. 결정성 — CSS animation/transition, 웹폰트 로드, Math.random/Date 금지
 *      (capture-reveals.sh 의 바이트 동일성 판정이 끝나지 않는다)
 *
 * exit 0 전부 통과 / 1 위반 있음 / 2 인자·파일 오류.
 */
const fs = require("fs");
const path = require("path");

const dir = process.argv[2];
if (!dir) { console.error("usage: check-slide.js <storyboard 디렉토리> [파일…]"); process.exit(2); }

global.window = {};
try { require(path.resolve(dir, "scenes.js")); }
catch (e) { console.error(`scenes.js 를 읽지 못했다 — ${e.message}`); process.exit(2); }
const SCENES = global.window.SCENES || [];
const sot = JSON.stringify(SCENES) + JSON.stringify(global.window.THEME || {});

const slidesDir = path.join(dir, "slides");
let files = process.argv.slice(3);
if (!files.length && fs.existsSync(slidesDir))
  files = fs.readdirSync(slidesDir).filter(f => f.endsWith(".html"));
// slides/ 가 아직 없는 것은 오류가 아니다 — §8 전(승인 전) 호출이면 미저작 목록만 보고한다.

let bad = 0;
const fail = (f, msg) => { console.error(`✗ ${f}: ${msg}`); bad++; };

for (const f of files) {
  const base = path.basename(f);
  const src = fs.readFileSync(path.join(slidesDir, base), "utf8");

  // 1) 파일명 ↔ SLIDE_SHOT ↔ scenes.js
  const mName = base.match(/^s(\d+)-[a-z0-9-]+\.html$/);
  if (!mName) { fail(base, "파일명 규약 위반 — s<샷번호>-<slug>.html"); continue; }
  const no = parseInt(mName[1], 10);
  const mShot = src.match(/const SLIDE_SHOT\s*=\s*(\d+)/);
  if (!mShot) fail(base, "SLIDE_SHOT 상수가 없다");
  else if (parseInt(mShot[1], 10) !== no)
    fail(base, `SLIDE_SHOT=${mShot[1]} 인데 파일명은 s${no}`);
  const scene = SCENES[no - 1];
  const reg = scene && scene.visual && scene.visual.slide && scene.visual.slide.file;
  if (reg !== `slides/${base}`)
    fail(base, `scenes.js ${no}번째 샷의 visual.slide.file 이 이 파일이 아니다 (${reg || "없음"})`);

  // 2) 한글 리터럴 — 주석을 걷어낸 소스의 문자열 리터럴만 본다
  const code = src
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const lits = [];
  for (const m of code.matchAll(/"([^"\\\n]*[가-힣][^"\\\n]*)"|'([^'\\\n]*[가-힣][^'\\\n]*)'/g))
    lits.push(m[1] || m[2]);
  for (const t of lits)
    if (!sot.includes(t)) fail(base, `scenes.js 에 없는 한글 리터럴 — "${t}"`);

  // 3) 결정성
  if (/animation\s*:|@keyframes|transition\s*:/.test(code))
    fail(base, "CSS 애니메이션·트랜지션 금지 — 움직임은 빌더 xfade 가 전부다");
  if (/@import|fonts\.googleapis|<link[^>]*font/i.test(code))
    fail(base, "웹폰트 로드 금지 — 로컬 폰트 스택만");
  if (/Math\.random|new Date|Date\.now/.test(code))
    fail(base, "렌더마다 달라지는 값 금지 (Math.random·Date)");

  if (!bad) console.log(`✓ ${base}`);
}

// scenes.js 쪽 역방향 — 슬라이드 씬인데 파일이 아직 없는 샷 (승인 직후엔 정상)
SCENES.forEach((s, i) => {
  const sl = s.visual && s.visual.slide;
  if (sl && sl.file && !fs.existsSync(path.join(dir, sl.file)))
    console.log(`· 샷 ${i + 1}: ${sl.file} 미저작 (승인 뒤 §8 에서 만든다)`);
});

process.exit(bad ? 1 : 0);
