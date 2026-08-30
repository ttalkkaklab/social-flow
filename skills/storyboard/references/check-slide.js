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
 *   3. 갈래(kind) — diagram(기본) · kinetic · character. 갈래마다 시작하는 템플릿이 다르고,
 *      kinetic·character 는 motion:true 를 명시해야 한다(빠지면 정지 캡처 경로로 새서 움직임이
 *      통째로 사라진다). character 는 visual.slide.acts 가 그룹마다 동작 하나를 들고 있어야 한다.
 *   4. 결정성 — 두 갈래다. scenes.js 의 visual.slide.motion 이 그 갈래를 정한다.
 *      정지 슬라이드(기본): CSS animation/transition·웹폰트·Math.random/Date·<video> 금지
 *        (capture-reveals.sh 의 바이트 동일성 판정이 끝나지 않는다)
 *      모션 슬라이드(motion:true): 움직임은 seek 로 재현돼야 한다 — window.__seek 정의 필수,
 *        transition 금지(속성이 바뀐 뒤에만 객체가 생겨 seek 가 안 된다), Date·Math.random·
 *        performance.now·requestAnimationFrame·setTimeout/setInterval 금지.
 *        @keyframes·data-count·__paint 페인터·data-rg 를 든 <video> 는 허용이다 — 넷 다
 *        render-motion-slide.mjs 가 프레임마다 (g, t) 로 세운다.
 *      양쪽 공통: 원격 URL 금지(웹폰트·이미지·영상) — 네트워크가 프레임을 정하면 재현이 끝난다.
 *        스스로 도는 그림도 금지 — gif·apng·애니메이션 webp 와 SVG SMIL 은 Animation 객체를
 *        안 만들어서 __seek 이 못 세우고 __meta().stray 로도 안 잡힌다. 그림은 png·jpg 만.
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
  motionClock: "모션 슬라이드에 시계·난수·타이머 금지 (Date·Math.random·performance.now·requestAnimationFrame·setTimeout) — 프레임은 __seek(t, g) 가 정한다. 키프레임으로 못 그리는 움직임은 __paint(rg, durMs, fn) 로 그린다",
  remoteMedia: u => `원격 URL 금지 — "${u}". 이미지·영상은 슬라이드 옆 로컬 파일만 쓴다. 네트워크가 프레임을 정하면 같은 (g, t) 가 같은 픽셀을 내지 못한다`,
  videoPlayback: "슬라이드의 <video> 에 autoplay·loop 금지 — 재생은 벽시계를 타고, 프레임은 __seek(t, g) 가 정한다",
  videoDur: "모션 슬라이드의 <video> 에 data-vdur 이 없다 — 그룹 안에서 재생할 길이(ms)가 0 이 되어 영상이 클립 내내 첫 프레임에 멈춘다",
  videoGroup: "모션 슬라이드의 <video> 에 data-rg 가 없다 — 그룹에 매이지 않은 영상은 seek 대상 밖이라 첫 프레임에 멈춘다 (data-rg · data-vdur 을 적는다)",
  animatedImage: u => `스스로 도는 이미지 금지 — "${u}". gif·apng·애니메이션 webp 는 벽시계로 돌고 __seek 이 못 세운다(document.getAnimations 에 안 잡혀 stray 로도 안 걸린다). .svg 파일은 그 안의 SMIL 을 이 검사가 못 봐서 같이 막는다 — 인라인 data:image/svg+xml 은 쓸 수 있다. 정지 그림은 png·jpg 로 넣고, 움직여야 하면 __paint 페인터나 <video> 로 쓴다`,
  smil: "SVG SMIL 애니메이션 금지 (<animate·<animateTransform·<animateMotion·<set) — 벽시계로 돌고 __seek 이 못 세운다. CSS @keyframes 나 __paint 로 옮긴다",
  staticVideo: "정지 슬라이드에 <video> 금지 — 상태 캡처는 정지 화면끼리의 xfade 다. 영상이 필요하면 scenes.js 에 slide.motion:true",
  kindVocab: k => `slide.kind "${k}" 는 ${KINDS.join(" · ")} 밖이다`,
  kindMotion: k => `kind:"${k}" 에는 motion:true 가 필요하다 — 없으면 정지 슬라이드로 캡처돼 움직임이 통째로 사라진다`,
  kindTemplate: (k, fn, tpl) => `kind:"${k}" 인데 ${fn}() 이 없다 — ${tpl} 에서 시작한다`,
  actsMissing: "kind:\"character\" 인데 visual.slide.acts 가 없다 — 그룹마다 동작 하나를 적는다",
  actsVocab: a => `동작 "${a}" 는 ${ACTS.join(" · ")} 밖이다 — 손으로 짠 움직임은 다음 렌더에서 재현되지 않는다`,
  actsShort: (n, m) => `동작 ${n}개인데 나레이션 세그먼트는 ${m}개 — 세그먼트마다 동작 하나가 있어야 클립이 채워진다`,
};

/* 저작 화면의 세 갈래와, 캐릭터 연기가 고를 수 있는 동작. 정본은 scenes-schema §저작 화면 레인과
   character-act-template.html 머리말이다 — 여기 이름을 늘리려면 템플릿의 키프레임도 같이 는다. */
const KINDS = ["diagram", "kinetic", "character"];
const ACTS = ["enter", "point", "nod", "shrug", "think", "wave", "cheer"];
const KIND_FN = { diagram: "renderSlide", kinetic: "renderKinetic", character: "renderCharacter" };
const KIND_TPL = { diagram: "motion-slide-template.html", kinetic: "kinetic-type-template.html",
                   character: "character-act-template.html" };

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
    const kind = (slide && slide.kind) || "diagram";

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

    // 3) 갈래 — 어휘, motion 명시, 시작 템플릿
    if (KINDS.indexOf(kind) === -1) fail(base, MSG.kindVocab(kind));
    else if (kind !== "diagram") {
      // motion 을 유추하지 않는다 — produce §3.6·검사 띠·정지 캡처가 전부 motion===true 로만
      // 갈라지고 kind 를 모른다. 적히지 않으면 조용히 정지 경로로 샌다.
      if (!motion) fail(base, MSG.kindMotion(kind));
      if (!new RegExp("function\\s+" + KIND_FN[kind] + "\\s*\\(").test(code))
        fail(base, MSG.kindTemplate(kind, KIND_FN[kind], KIND_TPL[kind]));
    }
    if (kind === "character") {
      const acts = (slide && slide.acts) || null;
      if (!Array.isArray(acts) || !acts.length) fail(base, MSG.actsMissing);
      else {
        acts.filter(a => ACTS.indexOf(a) === -1).forEach(a => fail(base, MSG.actsVocab(a)));
        const segs = (scene.narration || []).length;
        if (segs && acts.length < segs) fail(base, MSG.actsShort(acts.length, segs));
      }
    }

    // 4) 결정성 — 갈래별
    if (/@import|fonts\.googleapis|<link[^>]*font|@font-face[^}]*url\(\s*['"]?https?:/i.test(code))
      fail(base, MSG.webfont);
    /* 소재 URL 을 한 번에 모은다. 렌더에 실제로 그림을 앉히는 자리만 본다 — <a href> 의 출처
       링크는 프레임을 정하지 않으므로 뺀다(리뷰 medium 6). 값이 코드로 조립되는 자리
       (`${…}` · 문자열 연결)는 정적으로 알 수 없으니 건너뛴다 — 슬라이드는 innerHTML 로 마크업을
       짜는 것이 관례라 여기서 막으면 정상 저작이 걸린다(리뷰 high 3). */
    /* 값이 코드로 조립되는 자리는 정적으로 알 수 없으니 건너뛴다 — 슬라이드는 innerHTML 로
       마크업을 짜는 것이 관례다. `${…}` 와 백틱이 그 표시이고, 따옴표 연결
       ('<img src="' + S.photo + '"')은 캡처가 빈 문자열로, url("url(" + S.photo + ")") 꼴은
       공백을 낀 조각으로 떨어지는 것이 그 표시다. `+` 자체는 파일 이름에 흔한 글자라 조립의
       표시로 쓰지 않는다 — 경로에 공백은 안 쓰고(CSS url() 은 따옴표 없이 공백을 못 받는다)
       URL 은 %20 으로 인코딩한다. */
    const dynamic = u => u === "" || /\$\{|`|\s/.test(u);
    // 그림이 앉는 자리 — 확장자를 보는 것은 이것뿐이다. 영상 소스는 여기 넣지 않는다.
    const imgUrls = [];
    for (const m of code.matchAll(/<img\b[^>]*\bsrc\s*=\s*["']([^"']*)["']/gi)) imgUrls.push(m[1]);
    for (const m of code.matchAll(/<video\b[^>]*\bposter\s*=\s*["']([^"']*)["']/gi)) imgUrls.push(m[1]);
    for (const m of code.matchAll(/url\(\s*["']?([^"')]+)/gi)) imgUrls.push(m[1]);

    /* 원격 소재는 갈래를 안 가린다 — 정지든 모션이든 네트워크가 프레임을 정하면 재현이 끝난다.
       무엇을 보느냐가 아니라 무엇을 빼느냐로 짠다 — 자리를 열거하면 <script>·<iframe>·<use>
       처럼 안 적은 자리가 통째로 무검사가 된다. 빼는 것은 출처 링크(<a href>) 하나다. */
    for (const m of code.matchAll(/(?:src|href)\s*=\s*["'](https?:\/\/[^"']+)["']|url\(\s*["']?(https?:\/\/[^"')]+)/gi)) {
      const u = m[1] || m[2];
      const before = code.slice(Math.max(0, m.index - 200), m.index);
      if (/<a\b[^>]*$/i.test(before)) continue;                              // 출처 링크는 프레임을 정하지 않는다
      if (/fonts\.googleapis|\.(woff2?|ttf|otf)(\?|$)/i.test(u)) continue;   // 폰트는 webfont 규칙이 본다
      fail(base, MSG.remoteMedia(u));
    }
    /* 스스로 도는 그림 — 확장자를 허용목록으로 좁힌다. gif·apng·애니메이션 webp 는 Animation
       객체를 안 만들어서 __seek·__meta 어느 쪽에도 안 걸리고 조용히 벽시계로 돈다. .svg 파일도
       뺀다 — 그 안의 SMIL 은 이 소스 스캔이 못 본다(인라인 data:image/svg+xml 은 소스에 그대로
       있으므로 아래 SMIL 규칙이 본다). */
    const IMG_OK = /\.(png|jpe?g)$/i;
    for (const u of imgUrls) {
      if (dynamic(u)) continue;
      if (/^https?:/i.test(u)) continue;                        // 원격은 위에서 잡았다
      if (u.startsWith("#")) continue;                          // url(#id) — SVG 의 fill·clip-path·marker (리뷰 high 2)
      if (/^data:image\/(png|jpe?g|svg\+xml)[;,]/i.test(u)) continue;
      if (/\.(woff2?|ttf|otf)(\?|$)/i.test(u)) continue;        // 로컬 폰트 파일 (쿼리 포함)
      if (!IMG_OK.test(u.split("?")[0])) fail(base, MSG.animatedImage(u));
    }
    if (/<animate\b|<animateTransform\b|<animateMotion\b|<set\b/i.test(code)) fail(base, MSG.smil);
    // 속성 자리에서만 본다 — class="loop-diagram" 같은 이름을 잡지 않게 (리뷰 medium 7)
    const videoTags = code.match(/<video\b[^>]*>/gi) || [];
    for (const tag of videoTags)
      if (/(?:^|\s)(?:autoplay|loop)(?=[\s>=/])/i.test(tag)) { fail(base, MSG.videoPlayback); break; }
    if (motion) {
      if (!/window\.__seek\s*=/.test(code)) fail(base, MSG.motionSeek);
      if (/transition\s*:/.test(code)) fail(base, MSG.motionTransition);
      if (/Math\.random|new Date|Date\.now|performance\.now|requestAnimationFrame|setTimeout|setInterval/.test(code))
        fail(base, MSG.motionClock);
      for (const tag of videoTags) {
        if (!/\bdata-rg\s*=/.test(tag)) { fail(base, MSG.videoGroup); break; }
        if (!/\bdata-vdur\s*=/.test(tag)) { fail(base, MSG.videoDur); break; }
      }
    } else {
      if (/animation\s*:|@keyframes|transition\s*:/.test(code)) fail(base, MSG.staticAnim);
      if (/Math\.random|new Date|Date\.now/.test(code)) fail(base, MSG.clock);
      if (videoTags.length) fail(base, MSG.staticVideo);
    }

    if (!bad) console.log(`✓ ${base}${motion ? " (motion · " + kind + ")" : ""}`);
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
      { type: "points", title: "키네틱 제목", visual: { slide: { file: "slides/s3-kinetic.html", kind: "kinetic", motion: true, labels: ["키네틱 라벨"] } } },
      { type: "points", title: "캐릭터 제목", narration: [{ tts: "하나" }, { tts: "둘" }],
        visual: { slide: { file: "slides/s4-char.html", kind: "character", motion: true, acts: ["enter", "nod"], labels: ["캐릭터 라벨"] } } },
      { type: "points", title: "모션 없는 키네틱", visual: { slide: { file: "slides/s5-nomotion.html", kind: "kinetic", labels: ["라벨5"] } } },
      { type: "points", title: "없는 갈래", visual: { slide: { file: "slides/s6-badkind.html", kind: "collage", motion: true, labels: ["라벨6"] } } },
      { type: "points", title: "없는 동작", narration: [{ tts: "하나" }],
        visual: { slide: { file: "slides/s7-badact.html", kind: "character", motion: true, acts: ["moonwalk"], labels: ["라벨7"] } } },
      { type: "points", title: "동작이 모자란다", narration: [{ tts: "하나" }, { tts: "둘" }, { tts: "셋" }],
        visual: { slide: { file: "slides/s8-fewacts.html", kind: "character", motion: true, acts: ["enter"], labels: ["라벨8"] } } },
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
    ["s2-motion.html", `const SLIDE_SHOT = 2; window.__seek = 1; window.__paint(2, 2400, function (t) {});`, []],
    ["s2-motion.html", `const SLIDE_SHOT = 2; window.__seek = 1; <img src="assets/a.png"><video data-rg="2" data-vdur="2000" src="assets/b.mp4"></video>`, []],
    // 리뷰가 잡은 오탐들 — 정상 저작이 막히면 안 된다
    ["s2-motion.html", `const SLIDE_SHOT = 2; window.__seek = 1; <svg><path fill="url(#g)" marker-end="url(#arrow)"/></svg>`, []],
    ["s2-motion.html", "const SLIDE_SHOT = 2; window.__seek = 1; out += `<img src=\"${S.photo}\">`;", []],
    ["s2-motion.html", `const SLIDE_SHOT = 2; window.__seek = 1; el.style.backgroundImage = "url(" + S.photo + ")";`, []],
    ["s2-motion.html", `const SLIDE_SHOT = 2; window.__seek = 1; <video class="loop-diagram" data-rg="2" data-vdur="1200" src="assets/a.mp4"></video>`, []],
    ["s2-motion.html", `const SLIDE_SHOT = 2; window.__seek = 1; <a href="https://www.bok.or.kr/report">source</a>`, []],
    ["s2-motion.html", `const SLIDE_SHOT = 2; window.__seek = 1; <style>.x{background:url("data:image/svg+xml;utf8,<svg/>")}</style>`, []],
    ["s2-motion.html", `const SLIDE_SHOT = 2; window.__seek = 1; <style>@font-face{src:url(fonts/x.woff2?v=2)}</style>`, []],
    // 재리뷰가 잡은 회귀 — 2923b7b 에서 통과하던 것이 iteration 1 에서 막혔다 (high A)
    ["s2-motion.html", `const SLIDE_SHOT = 2; window.__seek = 1; out += '<img src="' + S.photo + '" alt="">';`, []],
    ["s2-motion.html", `const SLIDE_SHOT = 2; window.__seek = 1; <img src="assets/chart+2024.png">`, []],
    // 재리뷰가 잡은 미탐 — 원격 검사가 자리를 열거하다 놓친 것들 (high B)
    ["s2-motion.html", `const SLIDE_SHOT = 2; window.__seek = 1; <script src="https://cdn.example.com/chart.js"></script>`,
      [MSG.remoteMedia("https://cdn.example.com/chart.js")]],
    ["s2-motion.html", `const SLIDE_SHOT = 2; window.__seek = 1; <iframe src="https://example.com/widget"></iframe>`,
      [MSG.remoteMedia("https://example.com/widget")]],
    ["s2-motion.html", `const SLIDE_SHOT = 2; window.__seek = 1; <svg><use href="https://cdn.example.com/icons.svg#star"/></svg>`,
      [MSG.remoteMedia("https://cdn.example.com/icons.svg#star")]],
    ["s2-motion.html", `const SLIDE_SHOT = 2; window.__seek = 1; <link href="https://cdn.example.com/a.css" rel="stylesheet">`,
      [MSG.remoteMedia("https://cdn.example.com/a.css")]],
    ["s2-motion.html", `const SLIDE_SHOT = 2; window.__seek = 1; <img src="https://cdn.example.com/a+b.png">`,
      [MSG.remoteMedia("https://cdn.example.com/a+b.png")]],
    // 그리고 놓치면 안 되는 것들
    ["s2-motion.html", `const SLIDE_SHOT = 2; window.__seek = 1; <video data-rg="2" src="assets/a.mp4"></video>`, [MSG.videoDur]],
    ["s2-motion.html", `const SLIDE_SHOT = 2; window.__seek = 1; <img src="assets/a.svg">`, [MSG.animatedImage("assets/a.svg")]],
    ["s2-motion.html", `const SLIDE_SHOT = 2; window.__seek = 1; <style>@font-face{src:url(fonts/a.woff2)}</style><img src="https://cdn.example.com/z.png">`,
      [MSG.remoteMedia("https://cdn.example.com/z.png")]],
    ["s2-motion.html", `const SLIDE_SHOT = 2; window.__seek = 1; <img src="assets/a.gif">`,
      [MSG.animatedImage("assets/a.gif")]],
    ["s2-motion.html", `const SLIDE_SHOT = 2; window.__seek = 1; <img src="assets/a.webp">`,
      [MSG.animatedImage("assets/a.webp")]],
    ["s2-motion.html", `const SLIDE_SHOT = 2; window.__seek = 1; <svg><animateTransform attributeName="transform"/></svg>`,
      [MSG.smil]],
    ["s2-motion.html", `const SLIDE_SHOT = 2; window.__seek = 1; <img src="../images/scene-3.png"><style>.b{background:url(assets/b.jpg)}</style>`, []],
    ["s2-motion.html", `const SLIDE_SHOT = 2; window.__seek = 1; <img src="https://cdn.example.com/a.png">`,
      [MSG.remoteMedia("https://cdn.example.com/a.png")]],
    ["s2-motion.html", `const SLIDE_SHOT = 2; window.__seek = 1; <style>.x{background:url(https://cdn.example.com/b.jpg)}</style>`,
      [MSG.remoteMedia("https://cdn.example.com/b.jpg")]],
    ["s2-motion.html", `const SLIDE_SHOT = 2; window.__seek = 1; <video autoplay data-rg="2" data-vdur="500" src="assets/b.mp4"></video>`,
      [MSG.videoPlayback]],
    ["s2-motion.html", `const SLIDE_SHOT = 2; window.__seek = 1; <video src="assets/b.mp4"></video>`, [MSG.videoGroup]],
    ["s1-static.html", `const SLIDE_SHOT = 1; <video src="assets/b.mp4"></video>`, [MSG.staticVideo]],
    ["s1-static.html", `const SLIDE_SHOT = 1; <img src="assets/a.png">`, []],
    ["s3-kinetic.html", `const SLIDE_SHOT = 3; window.__seek = 1; function renderKinetic(S, h) {}`, []],
    ["s3-kinetic.html", `const SLIDE_SHOT = 3; window.__seek = 1; function renderSlide(S, h) {}`,
      [MSG.kindTemplate("kinetic", "renderKinetic", "kinetic-type-template.html")]],
    ["s4-char.html", `const SLIDE_SHOT = 4; window.__seek = 1; function renderCharacter(S, h) {}`, []],
    ["s5-nomotion.html", `const SLIDE_SHOT = 5; function renderKinetic(S, h) {}`, [MSG.kindMotion("kinetic")]],
    ["s6-badkind.html", `const SLIDE_SHOT = 6; window.__seek = 1;`, [MSG.kindVocab("collage")]],
    ["s7-badact.html", `const SLIDE_SHOT = 7; window.__seek = 1; function renderCharacter(S, h) {}`, [MSG.actsVocab("moonwalk")]],
    ["s8-fewacts.html", `const SLIDE_SHOT = 8; window.__seek = 1; function renderCharacter(S, h) {}`, [MSG.actsShort(1, 3)]],
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
