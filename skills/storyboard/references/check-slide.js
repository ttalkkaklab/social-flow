#!/usr/bin/env node
/**
 * 슬라이드 파일 기계 검사 — storyboard §8 자가 검증용.
 *
 *   node check-slide.js <storyboard 디렉토리>            # slides/ 전부
 *   node check-slide.js <storyboard 디렉토리> s12-*.html # 한 장만
 *   node check-slide.js --selftest                        # 규칙 고정 테스트
 *
 * 보는 것 (scenes-schema §슬라이드 씬 · §모션 슬라이드 계약):
 *   1. 파일명 s<샷번호>-<slug>.html ↔ SLIDE_SHOT ↔ scenes.js visual.slide.file 삼자 일치
 *   2. 한글 문자열 리터럴이 전부 scenes.js 에 있다 — 문체 게이트(screen 표면)를
 *      통과한 적 없는 글자가 화면에 나가는 길을 막는다 (주석 속 한글은 허용)
 *   3. 결정성 — 두 갈래다. scenes.js 의 visual.slide.motion 이 그 갈래를 정한다.
 *      정지 슬라이드(기본): CSS animation/transition·웹폰트·Math.random/Date 금지
 *        (capture-reveals.sh 의 바이트 동일성 판정이 끝나지 않는다)
 *      모션 슬라이드(motion:true): 움직임은 seek 로 재현돼야 한다 — window.__seek 정의 필수,
 *        transition 금지(속성이 바뀐 뒤에만 객체가 생겨 seek 가 안 된다), Date·Math.random·
 *        performance.now·requestAnimationFrame·setTimeout/setInterval 금지, 웹폰트 URL 금지.
 *        @keyframes 는 허용이다 — render-motion-slide.mjs 가 프레임마다 currentTime 을 세운다.
 *
 * exit 0 전부 통과 / 1 위반 있음 / 2 인자·파일 오류.
 */
const fs = require("fs");
const path = require("path");
const os = require("os");

const MSG = {
  name: "파일명 규약 위반 — s<샷번호>-<slug>.html",
  noShot: "SLIDE_SHOT 상수가 없다",
  shotMismatch: (got, no) => `SLIDE_SHOT=${got} 인데 파일명은 s${no}`,
  notRegistered: (no, reg) => `scenes.js ${no}번째 샷의 visual.slide.file 이 이 파일이 아니다 (${reg || "없음"})`,
  literal: t => `scenes.js 에 없는 한글 리터럴 — "${t}"`,
  staticAnim: "CSS 애니메이션·트랜지션 금지 — 정지 슬라이드의 움직임은 빌더 xfade 가 전부다 (모션이 필요하면 scenes.js 에 slide.motion:true)",
  webfont: "웹폰트 로드 금지 — 로컬 폰트 스택만",
  clock: "렌더마다 달라지는 값 금지 (Math.random·Date)",
  motionSeek: "모션 슬라이드에 window.__seek 가 없다 — motion-slide-template.html 에서 시작한다",
  motionTransition: "모션 슬라이드에 transition 금지 — 속성이 바뀐 뒤에만 객체가 생겨 seek 로 세울 수 없다. @keyframes 로 쓴다",
  motionClock: "모션 슬라이드에 시계·난수·타이머 금지 (Date·Math.random·performance.now·requestAnimationFrame·setTimeout) — 프레임은 __seek(t, g) 가 정한다",
};

function checkDir(dir, only) {
  global.window = {};
  const scenesFile = path.resolve(dir, "scenes.js");
  try { delete require.cache[require.resolve(scenesFile)]; require(scenesFile); }   // 캐시 키는 실경로다 — 같은 프로세스에서 두 번 읽어도(selftest) 빈 배열이 안 나오게
  catch (e) { console.error(`scenes.js 를 읽지 못했다 — ${e.message}`); return 2; }
  const SCENES = global.window.SCENES || [];
  const sot = JSON.stringify(SCENES) + JSON.stringify(global.window.THEME || {});

  const slidesDir = path.join(dir, "slides");
  let files = only.slice();
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
    if (!mName) { fail(base, MSG.name); continue; }
    const no = parseInt(mName[1], 10);
    const mShot = src.match(/const SLIDE_SHOT\s*=\s*(\d+)/);
    if (!mShot) fail(base, MSG.noShot);
    else if (parseInt(mShot[1], 10) !== no) fail(base, MSG.shotMismatch(mShot[1], no));
    const scene = SCENES[no - 1];
    const slide = scene && scene.visual && scene.visual.slide;
    const reg = slide && slide.file;
    if (reg !== `slides/${base}`) fail(base, MSG.notRegistered(no, reg));
    const motion = !!(slide && slide.motion === true);

    // 2) 한글 리터럴 — 주석을 걷어낸 소스의 문자열 리터럴만 본다
    const code = src
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    const lits = [];
    for (const m of code.matchAll(/"([^"\\\n]*[가-힣][^"\\\n]*)"|'([^'\\\n]*[가-힣][^'\\\n]*)'/g))
      lits.push(m[1] || m[2]);
    for (const t of lits)
      if (!sot.includes(t)) fail(base, MSG.literal(t));

    // 3) 결정성 — 갈래별
    if (/@import|fonts\.googleapis|<link[^>]*font|@font-face[^}]*url\(\s*['"]?https?:/i.test(code))
      fail(base, MSG.webfont);
    if (motion) {
      if (!/window\.__seek\s*=/.test(code)) fail(base, MSG.motionSeek);
      if (/transition\s*:/.test(code)) fail(base, MSG.motionTransition);
      if (/Math\.random|new Date|Date\.now|performance\.now|requestAnimationFrame|setTimeout|setInterval/.test(code))
        fail(base, MSG.motionClock);
    } else {
      if (/animation\s*:|@keyframes|transition\s*:/.test(code)) fail(base, MSG.staticAnim);
      if (/Math\.random|new Date|Date\.now/.test(code)) fail(base, MSG.clock);
    }

    if (!bad) console.log(`✓ ${base}${motion ? " (motion)" : ""}`);
  }

  // scenes.js 쪽 역방향 — 슬라이드 씬인데 파일이 아직 없는 샷 (승인 직후엔 정상)
  SCENES.forEach((s, i) => {
    const sl = s.visual && s.visual.slide;
    if (sl && sl.file && !fs.existsSync(path.join(dir, sl.file)))
      console.log(`· 샷 ${i + 1}: ${sl.file} 미저작 (승인 뒤 §8 에서 만든다)`);
  });
  return bad ? 1 : 0;
}

/* ── selftest — 규칙마다 잡히는 메시지 문자열을 고정한다(exit 코드만 보면 S2 급 구멍이 생긴다) */
function selftest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "check-slide-"));
  const slides = path.join(tmp, "slides"); fs.mkdirSync(slides);
  fs.writeFileSync(path.join(tmp, "scenes.js"), `
    window.SCENES = [
      { type: "points", title: "정지 제목", visual: { slide: { file: "slides/s1-static.html", labels: ["정지 라벨"] } } },
      { type: "points", title: "모션 제목", visual: { slide: { file: "slides/s2-motion.html", motion: true, labels: ["모션 라벨"] } } },
    ];`);
  const cases = [
    ["s1-static.html", `const SLIDE_SHOT = 1; const a = "정지 라벨";`, []],
    ["s1-static.html", `const SLIDE_SHOT = 1; <style>.x{animation:rise 1s}</style>`, [MSG.staticAnim]],
    ["s1-static.html", `const SLIDE_SHOT = 1; const t = Date.now();`, [MSG.clock]],
    ["s1-static.html", `const SLIDE_SHOT = 1; const a = "없는 글자";`, [MSG.literal("없는 글자")]],
    ["s1-static.html", `const SLIDE_SHOT = 3;`, [MSG.shotMismatch("3", 1)]],
    ["s2-motion.html", `const SLIDE_SHOT = 2; <style>@keyframes rise{}</style> window.__seek = () => 1;`, []],
    ["s2-motion.html", `const SLIDE_SHOT = 2; <style>@keyframes rise{}</style>`, [MSG.motionSeek]],
    ["s2-motion.html", `const SLIDE_SHOT = 2; window.__seek = 1; <style>.x{transition: opacity 1s}</style>`, [MSG.motionTransition]],
    ["s2-motion.html", `const SLIDE_SHOT = 2; window.__seek = 1; requestAnimationFrame(step);`, [MSG.motionClock]],
    ["s2-motion.html", `const SLIDE_SHOT = 2; window.__seek = 1; @font-face{src:url("https://x/y.woff2")}`, [MSG.webfont]],
    ["s2-motion.html", `const SLIDE_SHOT = 2; window.__seek = 1; <link rel="stylesheet" href="https://fonts.googleapis.com/css2">`, [MSG.webfont]],
  ];
  let failed = 0;
  const realErr = console.error, realLog = console.log;
  for (const [name, body, expect] of cases) {
    for (const f of fs.readdirSync(slides)) fs.unlinkSync(path.join(slides, f));
    fs.writeFileSync(path.join(slides, name), body);
    const got = [];
    console.error = m => got.push(String(m)); console.log = () => {};
    checkDir(tmp, [name]);
    console.error = realErr; console.log = realLog;
    const ok = expect.length === got.length && expect.every((e, i) => got[i].endsWith(e));
    if (!ok) { failed++; realErr(`✗ selftest ${name} — expected ${JSON.stringify(expect)} got ${JSON.stringify(got)}`); }
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  realLog(failed ? `✗ selftest: ${failed}/${cases.length} failed` : `✓ selftest: ${cases.length}/${cases.length}`);
  return failed ? 1 : 0;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args[0] === "--selftest") process.exit(selftest());
  const dir = args[0];
  if (!dir) { console.error("usage: check-slide.js <storyboard 디렉토리> [파일…] | --selftest"); process.exit(2); }
  process.exit(checkDir(dir, args.slice(1)));
}
