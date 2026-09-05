#!/usr/bin/env node
/**
 * 슬라이드 파일 기계 검사 — produce §3.6 자가 검증용.
 *
 *   node check-slide.js <storyboard 디렉토리>            # slides/ 전부
 *   node check-slide.js <storyboard 디렉토리> s12-*.html # 한 장만
 *   node check-slide.js <storyboard 디렉토리> --require-all # 등록된 HTML 이 전부 있어야 통과
 *   node check-slide.js --selftest                        # 규칙 고정 테스트
 *
 * 보는 것 (scenes-schema §슬라이드 씬 · §모션 슬라이드 계약):
 *   1. 파일명 s<샷번호>-<slug>.html ↔ SLIDE_SHOT ↔ scenes.js visual.slide.file 삼자 일치
 *   2. 한글 문자열 리터럴이 전부 scenes.js 에 있다 — 문체 게이트(screen 표면)를
 *      통과한 적 없는 글자가 화면에 나가는 길을 막는다 (주석 속 한글은 허용)
 *   3. 갈래(kind) — diagram(기본) · kinetic · character. 움직이는 diagram 은 treatment 로
 *      editorial(HTML 이 화면 전체를 설계) · photo-action(사진 속 대상이 실제로 바뀜) ·
 *      footage(생성 클립이 그룹마다 바탕이 되고 그 위에는 자막만 — shots 의 클립이 있어야 한다)를 가른다.
 *      2026-09-05 진 규칙 — 영상 위에는 아무것도 그리지 않는다. footage 화면이 h.mark 를 부르면 여기서 막는다.
 *      갈래마다 시작하는 템플릿이 다르다. 모든 슬라이드는 motion:true 다 — 정지 슬라이드는
 *      없다. character 는 visual.slide.acts 가 그룹마다 동작 하나를 들고 있어야 한다.
 *      사건을 연기할 때는 cast와 대상이 있는 act 객체를 써서, 누가 무엇을 했는지도 고정한다.
 *   4. 결정성 — 움직임은 seek 로 재현돼야 한다. window.__seek 정의 필수, transition 금지
 *      (속성이 바뀐 뒤에만 객체가 생겨 seek 가 안 된다), Date·Math.random·
 *      performance.now·requestAnimationFrame·setTimeout/setInterval 금지.
 *      @keyframes·data-count·__paint 페인터·data-rg 를 든 <video> 는 허용이다 — 넷 다
 *      render-motion-slide.mjs 가 프레임마다 (g, t) 로 세운다.
 *      원격 URL 금지(웹폰트·이미지·영상) — 네트워크가 프레임을 정하면 재현이 끝난다.
 *      스스로 도는 그림도 금지 — gif·apng·애니메이션 webp 와 SVG SMIL 은 Animation 객체를
 *      안 만들어서 __seek 이 못 세우고 __meta().stray 로도 안 잡힌다. 그림은 png·jpg 만.
 *   5. 재질 — box-shadow·text-shadow·drop-shadow 는 템플릿 머리의 스튜디오 판 규칙(html.studio …)
 *      만 든다. 저작 영역과 머리의 다른 규칙에서는 생성형 표식이라 막는다(그라데이션과 같은 자리 규칙).
 *   6. 구운 물체(slide.object · rendered-object.md) — 시트 png 와 사이드카 js 가 있고, 슬라이드가
 *      사이드카를 <script src> 로 읽고, render 가 h.object(rg, id) 로 앉히고, 잉크 상자가 존 안이다.
 *
 * exit 0 전부 통과 / 1 위반 있음 / 2 인자·파일 오류.
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const { FORMATS, DEFAULT_FORMAT } = require(path.join(__dirname, "../../platform-guide/references/formats.js"));   // 존 크기 — 물체의 잉크 상자 검사

const MSG = {
  name: "파일명 규약 위반 — s<샷번호>-<slug>.html",
  noShot: "SLIDE_SHOT 상수가 없다",
  shotMismatch: (got, no) => `SLIDE_SHOT=${got} 인데 파일명은 s${no}`,
  notRegistered: (no, reg) => `scenes.js ${no}번째 샷의 visual.slide.file 이 이 파일이 아니다 (${reg || "없음"})`,
  literal: t => `scenes.js 에 없는 한글 리터럴 — "${t}"`,
  mustMotion: "visual.slide 에 motion:true 가 없다 — 정지 슬라이드는 허용되지 않는다. motion-slide-template.html 에서 시작한다",
  webfont: "웹폰트 로드 금지 — 로컬 폰트 스택만",
  motionSeek: "모션 슬라이드에 window.__seek 가 없다 — motion-slide-template.html 에서 시작한다",
  motionTransition: "모션 슬라이드에 transition 금지 — 속성이 바뀐 뒤에만 객체가 생겨 seek 로 세울 수 없다. @keyframes 로 쓴다",
  motionClock: "모션 슬라이드에 시계·난수·타이머 금지 (Date·Math.random·performance.now·requestAnimationFrame·setTimeout) — 프레임은 __seek(t, g) 가 정한다. 키프레임으로 못 그리는 움직임은 __paint(rg, durMs, fn) 로 그린다",
  remoteMedia: u => `원격 URL 금지 — "${u}". 이미지·영상은 슬라이드 옆 로컬 파일만 쓴다. 네트워크가 프레임을 정하면 같은 (g, t) 가 같은 픽셀을 내지 못한다`,
  videoPlayback: "슬라이드의 <video> 에 autoplay·loop 금지 — 재생은 벽시계를 타고, 프레임은 __seek(t, g) 가 정한다",
  videoDur: "모션 슬라이드의 <video> 에 data-vdur 이 없다 — 그룹 안에서 재생할 길이(ms)가 0 이 되어 영상이 클립 내내 첫 프레임에 멈춘다",
  videoGroup: "모션 슬라이드의 <video> 에 data-rg 가 없다 — 그룹에 매이지 않은 영상은 seek 대상 밖이라 첫 프레임에 멈춘다 (data-rg · data-vdur 을 적는다)",
  animatedImage: u => `스스로 도는 이미지 금지 — "${u}". gif·apng·애니메이션 webp 는 벽시계로 돌고 __seek 이 못 세운다(document.getAnimations 에 안 잡혀 stray 로도 안 걸린다). .svg 파일은 그 안의 SMIL 을 이 검사가 못 봐서 같이 막는다 — 인라인 data:image/svg+xml 은 쓸 수 있다. 정지 그림은 png·jpg 로 넣고, 움직여야 하면 __paint 페인터나 <video> 로 쓴다`,
  smil: "SVG SMIL 애니메이션 금지 (<animate·<animateTransform·<animateMotion·<set) — 벽시계로 돌고 __seek 이 못 세운다. CSS @keyframes 나 __paint 로 옮긴다",
  kindVocab: k => `slide.kind "${k}" 는 ${KINDS.join(" · ")} 밖이다`,
  kindTemplate: (k, fn, tpl) => `kind:"${k}" 인데 ${fn}() 이 없다 — ${tpl} 에서 시작한다`,
  treatmentMissing: "motion diagram 에 visual.slide.treatment 가 없다 — HTML 이 화면 전체를 설계하면 editorial, 사진 속 대상이 실제로 바뀌면 photo-action, 생성 클립을 자막만 얹어 쓰면 footage",
  treatmentVocab: t => `slide.treatment "${t}" 는 ${TREATMENTS.join(" · ")} 밖이다`,
  footageMark: "footage 화면이 표식을 그린다(h.mark.*) — 2026-09-05 진 규칙: 영상 위에는 아무것도 그리지 않는다. 표식 코드를 지우거나, 설명 컷이면 editorial 로 만든다",
  footageAction: "footage slide 에 visual.action 이 없다 — 클립 안에서 인물·사물이 무엇을 하는지 적는다(표식이 아니라 피사체의 움직임)",
  footageShots: "footage slide 에 visual.slide.shots 가 없다 — 그룹마다 클립 하나(문장 하나 = 클립 하나·둘)를 적는다",
  footageShotsShort: (n, m) => `footage shots ${n}개인데 나레이션 세그먼트는 ${m}개 — 세그먼트마다 클립이 있어야 화면이 채워진다`,
  footageClip: f => `footage 클립이 없다 — ${f} (storyboard §5 에서 먼저 생성한다)`,
  footageClipExt: f => `footage 클립 "${f}" 는 mp4·webm 이 아니다 — 렌더러의 Chrome 은 H.264 와 VP9 만 읽는다`,
  footageUnused: f => `shots 의 클립 "${f}" 를 render 가 앉히지 않는다 — h.footage(rg, clip) 로 그 그룹의 바탕에 둔다`,
  footageNoGround: "footage slide 인데 renderSlide 가 h.footage 를 부르지 않는다 — 클립이 바탕이어야 화면이 채워진다",
  editorialRole: r => `editorial slide.role "${r}" 는 ${EDITORIAL_ROLES.join(" · ")} 밖이다`,
  editorialMotif: "editorial slide.motif 가 없다 — 에피소드 전체를 잇는 시각 장치를 적는다",
  editorialRasterOnly: "editorial 화면이 래스터 한 장과 글자만 쓴다 — 사진은 재료일 뿐, HTML 배우·관계선·문서 조각 가운데 둘 이상이 화면의 논리를 만들어야 한다",
  semanticPrimitive: (p, helper) => {
    const list = (Array.isArray(helper) ? helper : [helper]).map(n => `h.${n}()`).join(" · ");
    return `motionBeats primitive "${p}" 를 renderSlide()가 만들지 않는다 — ${list} 또는 같은 data-primitive 표식을 쓴다`;
  },
  artMove: m => `slide.arts move "${m}" 는 ${ART_MOVES.join(" · ")} 밖이다`,
  artFile: f => `slide.arts 파일이 없다 — ${f}`,
  artUnused: f => `slide.arts "${f}" 를 render 가 쓰지 않는다 — h.fig() · h.art() 또는 class="art" 로 앉힌다`,
  artExt: f => `slide.arts "${f}" 는 png·jpg 가 아니다`,
  missingFile: f => `등록된 슬라이드가 없다 — ${f}`,
  generatedStyle: "생성형 디자인 표식 금지 — 그라데이션 글자·글로우·글래스·겹친 그림자 대신 잉크·종이색·액센트 하나와 플레이트·괘선을 쓴다",
  gradientAuthored: "저작 영역(renderSlide 등)에 그라데이션 금지 — 플레이트·스크림 그라데이션은 템플릿 머리 CSS 가 이미 들고 있다(.plate · .scrim). 글자·막대·도형은 단색이다",
  roundedCard: r => `둥근 카드 표식 금지 — border-radius:${r}px 대신 여백과 헤어라인으로 구조를 만든다`,
  photoAction: "photo-action slide 에 visual.action 이 없다 — 카메라나 선이 아니라 사진 속 대상·증거가 어떻게 바뀌는지 적는다",
  actsMissing: "kind:\"character\" 인데 visual.slide.acts 가 없다 — 그룹마다 동작 하나를 적는다",
  actsVocab: a => `동작 "${a}" 는 ${ACTS.join(" · ")} 밖이다 — 손으로 짠 움직임은 다음 렌더에서 재현되지 않는다`,
  actsShort: (n, m) => `동작 ${n}개인데 나레이션 세그먼트는 ${m}개 — 세그먼트마다 동작 하나가 있어야 클립이 채워진다`,
  actObject: "캐릭터 연기 act 객체에는 action 문자열이 필요하다",
  castMissing: "여러 배우가 사건을 연기하는 act 객체에는 visual.slide.cast 가 필요하다",
  castId: id => `캐릭터 연기 act의 actor/target "${id}" 가 visual.slide.cast 에 없다`,
  objectFile: "slide.object 에 file 이 없다 — slides/assets/s<샷>-<slug>.png (bake-object.py --out)",
  objectExt: f => `slide.object 시트 "${f}" 는 png 가 아니다 — webp 는 움직이는 파일과 확장자로 못 가른다`,
  objectMissing: f => `구운 시트가 없다 — ${f} (bake-object.py 로 먼저 굽는다, rendered-object.md)`,
  objectSidecar: f => `사이드카가 없다 — ${f} (bake-object.py 가 시트 옆에 쓴다)`,
  objectSidecarBad: (f, e) => `사이드카를 읽지 못했다 — ${f}: ${e}`,
  objectInclude: f => `슬라이드가 사이드카를 안 읽는다 — scenes.js 다음에 <script src="${f}"></script>`,
  objectUnused: "slide.object 가 있는데 render 가 h.object(rg, id) 를 부르지 않는다 — 물체가 화면에 없다",
  objectId: (got, want) => `h.object 의 id "${got}" 가 시트 이름 "${want}" 와 다르다 — 사이드카의 키는 파일 이름이다`,
  objectZone: (side, px) => `물체의 잉크가 존 ${side}쪽으로 ${px}px 나간다 — h.object 의 ${side === "위" || side === "아래" ? "y" : "x"} 를 옮긴다(그림자 반그늘까지 잉크다)`,
};

/* 저작 화면의 세 갈래와, 캐릭터 연기가 고를 수 있는 동작. 정본은 scenes-schema §저작 화면 레인과
   character-act-template.html 머리말이다 — 여기 이름을 늘리려면 템플릿의 키프레임도 같이 는다. */
const KINDS = ["diagram", "kinetic", "character"];
const TREATMENTS = ["editorial", "photo-action", "footage"];
const EDITORIAL_ROLES = ["evidence", "relationship", "mechanism", "timeline", "statistic", "transition", "verdict"];
const SEMANTIC_HELPERS = {
  "date-enter": "date", "range-grow": "range", "event-link": "link",
  "count-up": "count", "bar-grow": "bar", "dot-fill": "dots", "axis-draw": "axis",
  "flow-trace": "flow", "node-enter": "node", "state-transform": "state",
  "shape-enter": ["disk", "fig", "chamber"], "shape-draw": ["ring", "stem", "bus"],
  "shape-travel": ["press", "shift"],
  "object-move": "object",
};
const ART_MOVES = ["travel", "rise", "in", "drop", "press", "none"];
const ACTS = ["enter", "point", "nod", "shrug", "think", "wave", "cheer",
  "conceal", "signal", "inspect", "gather", "surround", "bind", "escort", "release"];
const KIND_FN = { diagram: "renderSlide", kinetic: "renderKinetic", character: "renderCharacter" };
const KIND_TPL = { diagram: "motion-slide-template.html", kinetic: "kinetic-type-template.html",
                   character: "character-act-template.html" };
const EDITORIAL_ASSEMBLY = /\bh\.(?:fig|art|stem|bus|ring|disk|press|shift|flow|node|state|date|range|link|count|bar|dots|axis)\s*\(|data-primitive\s*=|class\s*=\s*["'][^"']*\b(?:art|cast|folio|packet|archive|rail|signal|relation|actor)\b/i;

function checkDir(dir, only, opts) {
  const requireAll = !!(opts && opts.requireAll);
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
  // slides/ 가 아직 없는 것은 오류가 아니다 — produce §3.6 전 호출이면 미저작 목록만 보고한다.

  let bad = 0;
  const fail = (f, msg) => { console.error(`✗ ${f}: ${msg}`); bad++; };

  for (const f of files) {
    const base = path.basename(f);
    const badBefore = bad;   // 이 파일에서 난 ✗ 만 센다 — 앞 파일이 실패해도 이 파일의 ✓ 는 찍힌다
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
      if (!new RegExp("function\\s+" + KIND_FN[kind] + "\\s*\\(").test(code))
        fail(base, MSG.kindTemplate(kind, KIND_FN[kind], KIND_TPL[kind]));
    }
    if (kind === "character") {
      const acts = (slide && slide.acts) || null;
      if (!Array.isArray(acts) || !acts.length) fail(base, MSG.actsMissing);
      else {
        const cast = Array.isArray(slide.cast) ? slide.cast : [];
        const castIds = new Set(cast.map(a => a && a.id).filter(Boolean));
        acts.forEach(a => {
          const name = typeof a === "string" ? a : a && a.action;
          if (!name) { fail(base, MSG.actObject); return; }
          if (ACTS.indexOf(name) === -1) fail(base, MSG.actsVocab(name));
          if (typeof a === "object") {
            if (!cast.length) fail(base, MSG.castMissing);
            [a.actor, a.target].filter(Boolean).forEach(id => {
              if (!castIds.has(id)) fail(base, MSG.castId(id));
            });
          }
        });
        const segs = (scene.narration || []).length;
        if (segs && acts.length < segs) fail(base, MSG.actsShort(acts.length, segs));
      }
    }
    if (motion && kind === "diagram") {
      const treatment = slide && slide.treatment;
      if (!treatment) fail(base, MSG.treatmentMissing);
      else if (TREATMENTS.indexOf(treatment) === -1) fail(base, MSG.treatmentVocab(treatment));
      else if (treatment === "editorial") {
        if (EDITORIAL_ROLES.indexOf(slide.role) === -1) fail(base, MSG.editorialRole(slide.role));
        if (!String(slide.motif || "").trim()) fail(base, MSG.editorialMotif);
      } else if (treatment === "footage") {
        if (!String(scene.visual.action || "").trim()) fail(base, MSG.footageAction);
      } else if (!String(scene.visual.action || "").trim()) {
        fail(base, MSG.photoAction);
      }
    }

    // footage — 클립이 그룹마다 있고, 파일이 있고, render 가 실제로 앉힌다(slide-design §6.2).
    // 클립은 storyboard §5 에서 이미 생성돼 있어야 한다. 표식(h.mark)은 2026-09-05 진 규칙으로 막는다.
    if (motion && kind === "diagram" && slide && slide.treatment === "footage") {
      const start = code.search(/function\s+renderSlide\s*\(|\brenderSlide\s*=\s*(?:async\s*)?\(?/);
      const stop = code.indexOf("SEEK-RUNTIME-BEGIN", start >= 0 ? start : 0);
      const drawn = start >= 0 ? code.slice(start, stop >= 0 ? stop : code.length) : code;
      const shots = Array.isArray(slide.shots) ? slide.shots : null;
      if (!shots || !shots.length) fail(base, MSG.footageShots);
      else {
        const segs = (scene.narration || []).length;
        if (segs && shots.length < segs) fail(base, MSG.footageShotsShort(shots.length, segs));
        shots.forEach((sh) => {
          [sh && sh.clip, sh && sh.matte].filter(Boolean).forEach((f) => {
            const file = String(f);
            if (!/\.(mp4|webm)$/i.test(file.split("?")[0])) fail(base, MSG.footageClipExt(file));
            if (!fs.existsSync(path.join(dir, file))) fail(base, MSG.footageClip(file));
            // 경로를 리터럴로 적었거나 shots 배열을 코드로 읽는다(sh[0].clip) — 둘 중 하나면 앉힌 것이다
            if (!drawn.includes(file.replace(/^slides\//, "")) && !/\.shots\b/.test(drawn)) fail(base, MSG.footageUnused(file));
          });
        });
      }
      if (!/\bh\.footage\s*\(/.test(drawn)) fail(base, MSG.footageNoGround);
      if (/\bh\.mark\b/.test(drawn)) fail(base, MSG.footageMark);   // 2026-09-05 진 규칙 — 영상 위 표식 금지
    }

    // editorial은 사진 위에 글자만 올리는 자리가 아니다. 사진을 쓰더라도 HTML이 논리를
    // 구성해야 한다. 이 검사는 화면을 완전히 대신하지 않으며, 그 전에 명백한 한 장 배경
    // 의존을 막는다. kinetic은 의도적으로 글자가 그림일 수 있어 이 규칙에서 뺀다.
    if (motion && kind === "diagram" && slide && slide.treatment === "editorial") {
      const start = code.search(/function\s+renderSlide\s*\(/);
      const stop = code.indexOf("SEEK-RUNTIME-BEGIN", start >= 0 ? start : 0);
      const authored = start >= 0 ? code.slice(start, stop >= 0 ? stop : code.length) : "";
      const hasRaster = /<img\b|\burl\s*\(/i.test(authored);
      if (hasRaster && !EDITORIAL_ASSEMBLY.test(authored)) fail(base, MSG.editorialRasterOnly);
    }

    // timeline · statistic · principle 장면은 선언만 모션이어선 안 된다. renderSlide()가
    // motionBeats의 프리미티브를 실제로 호출하는지 먼저 보고, 렌더러가 그룹별 DOM 표식을 다시 본다.
    const infoType = scene && scene.shot && scene.shot.infoType;
    if (["timeline", "statistic", "principle"].indexOf(infoType) !== -1 && Array.isArray(slide && slide.motionBeats)) {
      const start = code.search(/function\s+renderSlide\s*\(/);
      const stop = code.indexOf("SEEK-RUNTIME-BEGIN", start >= 0 ? start : 0);
      const authored = start >= 0 ? code.slice(start, stop >= 0 ? stop : code.length) : "";
      [...new Set(slide.motionBeats.map(b => b && b.primitive).filter(Boolean))].forEach((primitive) => {
        const helper = SEMANTIC_HELPERS[primitive];
        if (!helper) return; // check-scenes.js owns the closed vocabulary error.
        const names = Array.isArray(helper) ? helper : [helper];
        const helperCall = names.some(n => new RegExp("\\bh\\." + n + "\\s*\\(").test(authored));
        const lit = primitive.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        // 표식은 속성 리터럴(data-primitive="…")이거나 rv 헬퍼의 옵션(primitive:"…")이다 — 둘 다 DOM 에 같은 data-primitive 를 찍는다
        const marker = new RegExp("data-primitive\\s*=\\s*['\"]" + lit + "['\"]|\\bprimitive\\s*:\\s*['\"]" + lit + "['\"]");
        if (!helperCall && !marker.test(authored)) fail(base, MSG.semanticPrimitive(primitive, helper));
      });
    }

    // slide.arts — generated stills that move on the slide. File must exist by the produce
    // §3.6 check (generation happens before this). Principle sits them with h.fig; kinetic with h.art.
    if (Array.isArray(slide && slide.arts)) {
      const startFn = kind === "kinetic" ? /function\s+renderKinetic\s*\(/ :
        kind === "character" ? /function\s+renderCharacter\s*\(/ : /function\s+renderSlide\s*\(/;
      const start = code.search(startFn);
      const stop = code.indexOf("SEEK-RUNTIME-BEGIN", start >= 0 ? start : 0);
      const drawn = start >= 0 ? code.slice(start, stop >= 0 ? stop : code.length) : code;
      slide.arts.forEach((a) => {
        if (!a || !a.file) return;
        const f = String(a.file);
        if (a.move && ART_MOVES.indexOf(a.move) === -1) fail(base, MSG.artMove(a.move));
        if (!/\.(png|jpe?g)$/i.test(f.split("?")[0])) fail(base, MSG.artExt(f));
        if (!fs.existsSync(path.join(dir, f))) fail(base, MSG.artFile(f));
        const srcTail = f.replace(/^slides\//, "");
        const used = /\bh\.(art|fig)\s*\(/.test(drawn) || /class=["'][^"']*\bart\b/.test(drawn) ||
                     drawn.includes(srcTail);
        if (!used) fail(base, MSG.artUnused(f));
      });
    }

    // slide.object — 구운 물체(rendered-object.md). 시트·사이드카가 있고, 슬라이드가 사이드카를 읽고,
    // render 가 앉히고, 잉크 상자(사이드카 ink — 그림자 반그늘까지)가 존 안이다. slot 을 쓰면 세로는
    // 흐름이 정하므로 가로만 본다. x·y 가 리터럴이 아니면 존 검사는 건너뛴다.
    if (slide && slide.object) {
      const ob = slide.object;
      const f = String(ob.file || "");
      if (!f) fail(base, MSG.objectFile);
      else {
        const id = path.basename(f).replace(/\.png$/i, "");
        if (!/\.png$/i.test(f)) fail(base, MSG.objectExt(f));
        if (!fs.existsSync(path.join(dir, f))) fail(base, MSG.objectMissing(f));
        const side = f.replace(/\.png$/i, ".js");
        const sideAbs = path.resolve(dir, side);   // require 는 상대 경로를 모듈 이름으로 본다 — 절대 경로로
        let meta = null;
        if (!fs.existsSync(sideAbs)) fail(base, MSG.objectSidecar(side));
        else {
          const tail = side.replace(/^slides\//, "");
          if (!new RegExp("<script[^>]*\\bsrc\\s*=\\s*[\"']" + tail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[\"']").test(code))
            fail(base, MSG.objectInclude(tail));
          const keep = global.window; global.window = {};
          try { delete require.cache[require.resolve(sideAbs)]; require(sideAbs); meta = (global.window.SLIDE_OBJECTS || {})[id] || null; }
          catch (e) { fail(base, MSG.objectSidecarBad(side, e.message)); }
          global.window = keep;
          if (!meta) fail(base, MSG.objectSidecarBad(side, "window.SLIDE_OBJECTS[\"" + id + "\"] 가 없다"));
        }
        const start = code.search(/function\s+renderSlide\s*\(|\brenderSlide\s*=\s*(?:async\s*)?\(?/);
        const stop = code.indexOf("SEEK-RUNTIME-BEGIN", start >= 0 ? start : 0);
        const drawn = start >= 0 ? code.slice(start, stop >= 0 ? stop : code.length) : code;
        const call = drawn.match(/\bh\.object\s*\(\s*\d+\s*,\s*["']([^"']+)["']\s*(?:,\s*\{([^}]*)\})?/);
        if (!call) fail(base, MSG.objectUnused);
        else if (call[1] !== id) fail(base, MSG.objectId(call[1], id));
        else if (meta && Array.isArray(meta.ink) && meta.ink.length === 4) {
          const opt = call[2] || "";
          const num = k => { const m = opt.match(new RegExp("\\b" + k + "\\s*:\\s*(-?\\d+(?:\\.\\d+)?)")); return m ? Number(m[1]) : null; };
          const x = num("x"), y = num("y"), slot = /\bslot\s*:(?!\s*false\b)/.test(opt);   // slot:false 는 절대 배치다(런타임과 같은 판정)
          const fmt = FORMATS[global.window.FORMAT || DEFAULT_FORMAT] || FORMATS[DEFAULT_FORMAT];
          const zw = fmt.canvas.w - 2 * fmt.zone.x, zh = fmt.canvas.h - fmt.zone.top - fmt.zone.bottom;
          if (x != null) {
            if (x + meta.ink[0] < 0) fail(base, MSG.objectZone("왼", -(x + meta.ink[0])));
            if (x + meta.ink[2] > zw) fail(base, MSG.objectZone("오른", x + meta.ink[2] - zw));
          }
          if (y != null && !slot) {
            if (y + meta.ink[1] < 0) fail(base, MSG.objectZone("위", -(y + meta.ink[1])));
            if (y + meta.ink[3] > zh) fail(base, MSG.objectZone("아래", y + meta.ink[3] - zh));
          }
        }
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
       표시로 쓰지 않는다 — 값의 끝에 걸리거나 공백에 둘러싸인 `+` 만 조립으로 본다
       (`"url(" + S.photo + ")"` 의 캡처는 trim 뒤 `+ S.photo +` 다). 값은 trim 한 뒤에 보는데,
       CSS 가 허용하는 `url( a.gif )` 의 패딩 공백이 캡처에 딸려 오기 때문이다. 파일 이름 안의
       공백(`my chart.gif`)과 가운데 `+`(`chart+2024.png`)는 경로이지 조립이 아니다. */
    const dynamic = u => u === "" || /\$\{|`|^\+|\+$|\s\+\s/.test(u);
    // 그림이 앉는 자리 — 확장자를 보는 것은 이것뿐이다. 영상 소스는 여기 넣지 않는다.
    const imgUrls = [];
    for (const m of code.matchAll(/<img\b[^>]*\bsrc\s*=\s*["']([^"']*)["']/gi)) imgUrls.push(m[1].trim());
    for (const m of code.matchAll(/<video\b[^>]*\bposter\s*=\s*["']([^"']*)["']/gi)) imgUrls.push(m[1].trim());
    /* 인라인 SVG data URI 의 속은 걷어낸다 — 그레인 타일의 filter="url(%23g)" 처럼 안에 든
       url() 은 문서 안 참조라 파일이 아니다. 따옴표로 닫힌 data:image/svg+xml 만 비운다. */
    const codeNoData = code.replace(/url\(\s*(['"])data:image\/svg\+xml[\s\S]*?\1\s*\)/gi, "url($1data:image/svg+xml;utf8,$1)");
    for (const m of codeNoData.matchAll(/url\(\s*["']?([^"')]+)/gi)) imgUrls.push(m[1].trim());

    /* 원격 소재는 갈래를 안 가린다 — 정지든 모션이든 네트워크가 프레임을 정하면 재현이 끝난다.
       무엇을 보느냐가 아니라 무엇을 빼느냐로 짠다 — 자리를 열거하면 <script>·<iframe>·<use>
       처럼 안 적은 자리가 통째로 무검사가 된다. 빼는 것은 출처 링크(<a href>) 하나다. */
    const anchors = [...code.matchAll(/<a\b[^<>]*>/gi)].map(m => [m.index, m.index + m[0].length]);
    for (const m of code.matchAll(/(?<![-\w])(?:src|href)\s*=\s*["'](https?:\/\/[^"']+)["']|url\(\s*["']?(https?:\/\/[^"')]+)/gi)) {
      const u = (m[1] || m[2]).trim();
      // 출처 링크는 프레임을 정하지 않는다 — <a …> 태그 안의 href 만 건너뛴다. <a> 안에 든
      // <img src> 는 태그 밖이라 그대로 잡힌다.
      if (anchors.some(([a, b]) => m.index >= a && m.index < b)) continue;
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
    if (!motion) fail(base, MSG.mustMotion);
    else {
      if (!/window\.__seek\s*=/.test(code)) fail(base, MSG.motionSeek);
      if (/transition\s*:/.test(code)) fail(base, MSG.motionTransition);
      if (/Math\.random|new Date|Date\.now|performance\.now|requestAnimationFrame|setTimeout|setInterval/.test(code))
        fail(base, MSG.motionClock);
      for (const tag of videoTags) {
        if (!/\bdata-rg\s*=/.test(tag)) { fail(base, MSG.videoGroup); break; }
        if (!/\bdata-vdur\s*=/.test(tag)) { fail(base, MSG.videoDur); break; }
      }
      /* 그라데이션과 재질은 자리를 가린다 — 템플릿 머리 CSS 의 플레이트(빛·스크림)와 스튜디오 판의
         재질(html.studio … 규칙의 box-shadow·text-shadow·drop-shadow)은 방송 그래픽의 바탕층이라
         허용하고, 저작 영역(render 함수 ~ SEEK-RUNTIME-BEGIN)에서는 막는다. 저작 코드가 그라데이션·
         그림자를 쓰는 자리는 글자·막대·도형·카드뿐이고 그게 생성형 표식이다. */
      {
        const fnName = kind === "kinetic" ? "renderKinetic" : kind === "character" ? "renderCharacter" : "renderSlide";
        /* 화살표 대입형(const renderSlide = (S, h) => {)도 잡는다 — 선언형만 찾으면 저작 영역이
           빈 문자열이 되어 검사가 조용히 통과한다. 못 찾으면 머리 <style> 뒤부터 본다. */
        const start = code.search(new RegExp("function\\s+" + fnName + "\\s*\\(|\\b" + fnName + "\\s*=\\s*(?:async\\s*)?\\(?"));
        const headEnd = code.indexOf("</style>");
        const from = start >= 0 ? start : (headEnd >= 0 ? headEnd : 0);
        const stop = code.indexOf("SEEK-RUNTIME-BEGIN", from);
        const authored = code.slice(from, stop >= 0 ? stop : code.length);
        /* 머리 CSS 도 본다 — 템플릿이 새 부품 CSS 를 머리에 더하라고 안내하니 저작자의 손이 닿는다.
           템플릿 자신의 그라데이션은 사진 컷 스크림 하나뿐이라 그 규칙만 빼고 검사한다.
           머리는 render 함수 앞 구간이다(저작 코드가 문자열로 뱉는 <style> 과 겹치지 않게). */
        const headCss = start > 0 ? code.slice(0, start).replace(/\.scrim\s*\{[^}]*\}/g, "") : "";
        if (/\b(?:linear|conic|radial)-gradient\s*\(/i.test(authored) ||
            /\b(?:linear|conic|radial)-gradient\s*\(/i.test(headCss)) fail(base, MSG.gradientAuthored);
        /* 재질 — 셀렉터가 전부 html.studio 로 시작하는 규칙 블록만 빼고 본다. 목록에 다른 셀렉터를
           하나라도 끼우면 그 블록은 검사 대상이다(리뷰 실측 우회). render 함수가 없으면 파일 전체다. */
        const GEN = /background-clip\s*:\s*text|-webkit-background-clip\s*:\s*text|\bbox-shadow\s*:|\btext-shadow\s*:|\bbackdrop-filter\s*:|\bfilter\s*:\s*(?:drop-shadow|blur)\s*\(/i;
        /* 규칙은 <style> 안에서만 센다 — 블록 밖의 doctype·head·JS 가 첫 규칙의 셀렉터에 붙지 않게(리뷰 실측). */
        const noMat = t => t.replace(/<style[^>]*>([\s\S]*?)<\/style>/g, (m, css) => "<style>" +
          css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/([^{}]+)\{[^{}]*\}/g, (r, sel) =>
            sel.replace(/^[\s\S]*;/, "").split(",").every(s => /^\s*html(?:\.[\w-]+)*\.studio(?![\w-])/.test(s)) ? "" : r) + "</style>");
        if (start >= 0 ? (GEN.test(authored) || GEN.test(noMat(headCss))) : GEN.test(noMat(code)))
          fail(base, MSG.generatedStyle);
      }
      const radii = [...code.matchAll(/border-radius\s*:\s*(\d+(?:\.\d+)?)px/gi)].map(m => Number(m[1]));
      const cardRadius = radii.find(r => r >= 8);
      if (cardRadius !== undefined) fail(base, MSG.roundedCard(cardRadius));
    }

    if (bad === badBefore) console.log(`✓ ${base}${motion ? " (motion · " + kind + ")" : ""}`);
  }

  // scenes.js 쪽 역방향. 검토 중에는 목록만 보여주고 제작 입구에서는 --require-all로 막는다.
  SCENES.forEach((s, i) => {
    const sl = s.visual && s.visual.slide;
    if (sl && sl.file && !fs.existsSync(path.join(dir, sl.file))) {
      if (requireAll) fail(`샷 ${i + 1}`, MSG.missingFile(sl.file));
      else console.log(`· 샷 ${i + 1}: ${sl.file} 미저작 (저작 단계에서 만든다)`);
    }
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
      { type: "points", title: "모션 제목", visual: { slide: { file: "slides/s2-motion.html", motion: true, treatment: "editorial", role: "evidence", motif: "signal line", labels: ["모션 라벨"] } } },
      { type: "points", title: "키네틱 제목", visual: { slide: { file: "slides/s3-kinetic.html", kind: "kinetic", motion: true, labels: ["키네틱 라벨"] } } },
      { type: "points", title: "캐릭터 제목", narration: [{ tts: "하나" }, { tts: "둘" }],
        visual: { slide: { file: "slides/s4-char.html", kind: "character", motion: true, acts: ["enter", "nod"], labels: ["캐릭터 라벨"] } } },
      { type: "points", title: "모션 없는 키네틱", visual: { slide: { file: "slides/s5-nomotion.html", kind: "kinetic", labels: ["라벨5"] } } },
      { type: "points", title: "없는 갈래", visual: { slide: { file: "slides/s6-badkind.html", kind: "collage", motion: true, labels: ["라벨6"] } } },
      { type: "points", title: "없는 동작", narration: [{ tts: "하나" }],
        visual: { slide: { file: "slides/s7-badact.html", kind: "character", motion: true, acts: ["moonwalk"], labels: ["라벨7"] } } },
      { type: "points", title: "동작이 모자란다", narration: [{ tts: "하나" }, { tts: "둘" }, { tts: "셋" }],
        visual: { slide: { file: "slides/s8-fewacts.html", kind: "character", motion: true, acts: ["enter"], labels: ["라벨8"] } } },
      { type: "points", title: "처리 없는 도표", visual: { slide: { file: "slides/s9-notreatment.html", motion: true, labels: ["라벨9"] } } },
      { type: "points", title: "역할 없는 편집 화면", visual: { slide: { file: "slides/s10-norole.html", motion: true, treatment: "editorial", labels: ["라벨10"] } } },
      { type: "points", title: "행동 없는 사진", visual: { action: "", slide: { file: "slides/s11-noaction.html", motion: true, treatment: "photo-action", labels: ["라벨11"] } } },
      { type: "points", title: "연표", shot: { infoType: "timeline" }, narration: [{ tts: "날짜" }],
        visual: { slide: { file: "slides/s12-timeline.html", motion: true, treatment: "editorial", role: "timeline", motif: "date rail",
          motionBeats: [{ group: 1, primitive: "date-enter" }], labels: ["날짜"] } } },
      { type: "points", title: "원리", shot: { infoType: "principle" }, narration: [{ tts: "원" }],
        visual: { slide: { file: "slides/s13-principle.html", motion: true, treatment: "editorial", role: "mechanism", motif: "press",
          motionBeats: [{ group: 1, primitive: "shape-enter" }], labels: ["원"] } } },
      { type: "points", title: "누름", shot: { infoType: "principle" }, narration: [{ tts: "눌러" }],
        visual: { slide: { file: "slides/s14-travel.html", motion: true, treatment: "editorial", role: "mechanism", motif: "press",
          motionBeats: [{ group: 1, primitive: "shape-travel" }], labels: ["눌러"] } } },
      { type: "points", title: "키네틱 그림", visual: { slide: { file: "slides/s15-arts.html", kind: "kinetic", motion: true,
          arts: [{ file: "slides/assets/s15-stamp.png", prompt: "ink stamp", group: 1, move: "travel" }],
          labels: ["도장"] } } },
      { type: "points", title: "그림 이동", visual: { slide: { file: "slides/s16-badmove.html", kind: "kinetic", motion: true,
          arts: [{ file: "slides/assets/s16-x.png", prompt: "x", group: 1, move: "spin" }],
          labels: ["x"] } } },
      { type: "points", title: "줄기", shot: { infoType: "principle" }, narration: [{ tts: "선" }],
        visual: { slide: { file: "slides/s17-stem.html", motion: true, treatment: "editorial", role: "mechanism", motif: "pipe",
          motionBeats: [{ group: 1, primitive: "shape-draw" }], labels: ["선"] } } },
      { type: "points", title: "배우", shot: { infoType: "principle" }, narration: [{ tts: "사람" }],
        visual: { slide: { file: "slides/s18-fig.html", motion: true, treatment: "editorial", role: "mechanism", motif: "cast",
          motionBeats: [{ group: 1, primitive: "shape-enter" }],
          arts: [{ file: "slides/assets/s18-person.png", prompt: "ink person", group: 1, move: "rise" }],
          labels: ["사람"] } } },
      { type: "points", title: "사건 연기", narration: [{ tts: "모여" }, { tts: "포박" }],
        visual: { slide: { file: "slides/s19-story-act.html", kind: "character", motion: true,
          cast: [{ id: "masked", archetype: "masked" }, { id: "police", archetype: "police" }],
          acts: [{ action: "gather", actor: "masked" }, { action: "bind", actor: "police", target: "masked" }], labels: ["사건"] } } },
      { type: "points", title: "실사 컷", narration: [{ tts: "하나" }, { tts: "둘" }],
        visual: { action: "riders enter", slide: { file: "slides/s20-footage.html", motion: true, treatment: "footage", plan: "x", labels: [],
          shots: [{ group: 1, clip: "slides/footage/s20-g1.mp4" }, { group: 2, clip: "slides/footage/s20-g2.mp4" }] } } },
      { type: "points", title: "샷 없는 실사", narration: [{ tts: "하나" }],
        visual: { action: "x", slide: { file: "slides/s21-noshots.html", motion: true, treatment: "footage", plan: "x", labels: [] } } },
      { type: "points", title: "행동 없는 실사", narration: [{ tts: "하나" }],
        visual: { slide: { file: "slides/s22-noaction.html", motion: true, treatment: "footage", plan: "x", labels: [],
          shots: [{ group: 1, clip: "slides/footage/s22-g1.mp4" }] } } },
      { type: "points", title: "구운 물체", narration: [{ tts: "하나" }, { tts: "둘" }],
        visual: { slide: { file: "slides/s23-object.html", motion: true, treatment: "editorial", role: "statistic", motif: "disc", labels: ["물체"],
          object: { file: "slides/assets/s23-obj.png", shape: "disc", keys: "0,16,0 0,16,45 0,16,241", frames: "1:5 2:5", plan: "x" } } } },
    ];`);
  const SIDECAR = 'window.SLIDE_OBJECTS = Object.assign(window.SLIDE_OBJECTS || {}, {"s23-obj": {"file": "assets/s23-obj.png", "shape": "disc", "cell": [630, 600], "cols": 9, "n": 11, "ranges": {"1": [0, 5], "2": [5, 10]}, "ink": [49, 15, 629, 521]}});';
  const cases = [
    ["s1-static.html", `const SLIDE_SHOT = 1; const a = "정지 라벨";`, [MSG.mustMotion]],
    ["s1-static.html", `const SLIDE_SHOT = 1; <style>.x{animation:rise 1s}</style>`, [MSG.mustMotion]],
    ["s1-static.html", `const SLIDE_SHOT = 1; const t = Date.now();`, [MSG.mustMotion]],
    ["s1-static.html", `const SLIDE_SHOT = 1; const a = "없는 글자";`, [MSG.literal("없는 글자"), MSG.mustMotion]],
    ["s1-static.html", `const SLIDE_SHOT = 3;`, [MSG.shotMismatch("3", 1), MSG.mustMotion]],
    ["s2-motion.html", `const SLIDE_SHOT = 2; <style>@keyframes rise{}</style> window.__seek = () => 1;`, []],
    ["s2-motion.html", `const SLIDE_SHOT = 2; <style>@keyframes rise{}</style>`, [MSG.motionSeek]],
    ["s2-motion.html", `const SLIDE_SHOT = 2; window.__seek = 1; <style>.x{transition: opacity 1s}</style>`, [MSG.motionTransition]],
    ["s2-motion.html", `const SLIDE_SHOT = 2; window.__seek = 1; <style>.x{backdrop-filter:blur(8px);box-shadow:0 8px 20px #000}</style>`, [MSG.generatedStyle]],
    ["s2-motion.html", `const SLIDE_SHOT = 2; window.__seek = 1; <style>.x{border-radius:18px}</style>`, [MSG.roundedCard(18)]],
    // 플레이트·스크림 그라데이션은 템플릿 머리 CSS 자리(저작 영역 밖)라 통과한다
    ["s2-motion.html", `const SLIDE_SHOT = 2; window.__seek = 1; <style>.scrim{background:linear-gradient(to top,#000,transparent)}</style> function renderSlide(S, h) { return h.count(1, 3); }`, []],
    // 저작 영역의 그라데이션은 글자·막대에 쓰인 것이라 막는다
    ["s2-motion.html", `const SLIDE_SHOT = 2; window.__seek = 1; function renderSlide(S, h) { return '<style>.hero{background:linear-gradient(90deg,#f00,#00f)}</style>' + h.count(1, 3); }`, [MSG.gradientAuthored]],
    /* 화살표 대입형에서도 저작 영역을 찾아야 한다 — 선언형만 찾으면 검사가 조용히 통과했다(리뷰 실측) */
    ["s2-motion.html", `const SLIDE_SHOT = 2; window.__seek = 1; const renderSlide = (S, h) => { return '<style>.hero{background:linear-gradient(90deg,#f00,#00f)}</style>' + h.count(1, 3); };`, [MSG.gradientAuthored]],
    /* 머리 CSS 에 더한 그라데이션도 막는다 — 스크림 규칙 하나만 예외다 */
    ["s2-motion.html", `const SLIDE_SHOT = 2; window.__seek = 1; <style>.scrim{background:linear-gradient(to top,#000,transparent)} .rule{background:linear-gradient(90deg,#f00,#00f)}</style> function renderSlide(S, h) { return h.count(1, 3); }`, [MSG.gradientAuthored]],
    ["s2-motion.html", `const SLIDE_SHOT = 2; window.__seek = 1; function renderSlide(S, h) { return '<style>.x{background-clip:text}</style>'; }`, [MSG.generatedStyle]],
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
    // 그레인 타일 — data URI 안의 filter="url(%23g)" 는 문서 안 참조라 파일 검사 대상이 아니다
    ["s2-motion.html", `const SLIDE_SHOT = 2; window.__seek = 1; <style>.x{background:url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg"><filter id="g"/><rect filter="url(%23g)"/></svg>')}</style>`, []],
    ["s2-motion.html", `const SLIDE_SHOT = 2; window.__seek = 1; <style>@font-face{src:url(fonts/x.woff2?v=2)}</style>`, []],
    // 재리뷰가 잡은 회귀 — 2923b7b 에서 통과하던 것이 iteration 1 에서 막혔다 (high A)
    ["s2-motion.html", `const SLIDE_SHOT = 2; window.__seek = 1; out += '<img src="' + S.photo + '" alt="">';`, []],
    ["s2-motion.html", `const SLIDE_SHOT = 2; window.__seek = 1; <img src="assets/chart+2024.png">`, []],
    // 3차 리뷰가 잡은 미탐 — 공백이 낀 표기가 확장자 검사를 건너뛰었다 (medium 2)
    ["s2-motion.html", `const SLIDE_SHOT = 2; window.__seek = 1; <style>.x{background:url( assets/spin.gif )}</style>`,
      [MSG.animatedImage("assets/spin.gif")]],
    ["s2-motion.html", `const SLIDE_SHOT = 2; window.__seek = 1; <img src="assets/my chart.gif">`,
      [MSG.animatedImage("assets/my chart.gif")]],
    // <a> 로 시작하는 문자열 리터럴을 열린 태그로 오인했다 (low 1)
    ["s2-motion.html", `const SLIDE_SHOT = 2; window.__seek = 1; const OPEN = "<a class='src'"; <img src="https://cdn.example.com/x.png">`,
      [MSG.remoteMedia("https://cdn.example.com/x.png")]],
    // 진짜 출처 링크는 그대로 통과한다
    ["s2-motion.html", `const SLIDE_SHOT = 2; window.__seek = 1; <a href="https://www.bok.or.kr/x"><img src="assets/a.png"></a>`, []],
    // 아무것도 안 가져오는 속성은 원격으로 보지 않는다
    ["s2-motion.html", `const SLIDE_SHOT = 2; window.__seek = 1; <div data-src="https://cdn.example.com/x.png"></div>`, []],
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
    ["s2-motion.html", `const SLIDE_SHOT = 2; window.__seek = 1; function renderSlide(S, h) { return '<img src="../images/scene-3.png">'; }`,
      [MSG.editorialRasterOnly]],
    ["s2-motion.html", `const SLIDE_SHOT = 2; window.__seek = 1; function renderSlide(S, h) { return h.fig(1, 0) + '<img class="art" src="assets/a.png">'; }`, []],
    ["s2-motion.html", `const SLIDE_SHOT = 2; window.__seek = 1; <img src="https://cdn.example.com/a.png">`,
      [MSG.remoteMedia("https://cdn.example.com/a.png")]],
    ["s2-motion.html", `const SLIDE_SHOT = 2; window.__seek = 1; <style>.x{background:url(https://cdn.example.com/b.jpg)}</style>`,
      [MSG.remoteMedia("https://cdn.example.com/b.jpg")]],
    ["s2-motion.html", `const SLIDE_SHOT = 2; window.__seek = 1; <video autoplay data-rg="2" data-vdur="500" src="assets/b.mp4"></video>`,
      [MSG.videoPlayback]],
    ["s2-motion.html", `const SLIDE_SHOT = 2; window.__seek = 1; <video src="assets/b.mp4"></video>`, [MSG.videoGroup]],
    ["s1-static.html", `const SLIDE_SHOT = 1; <video src="assets/b.mp4"></video>`, [MSG.mustMotion]],
    ["s1-static.html", `const SLIDE_SHOT = 1; <img src="assets/a.png">`, [MSG.mustMotion]],
    ["s3-kinetic.html", `const SLIDE_SHOT = 3; window.__seek = 1; function renderKinetic(S, h) {}`, []],
    ["s3-kinetic.html", `const SLIDE_SHOT = 3; window.__seek = 1; function renderSlide(S, h) {}`,
      [MSG.kindTemplate("kinetic", "renderKinetic", "kinetic-type-template.html")]],
    ["s4-char.html", `const SLIDE_SHOT = 4; window.__seek = 1; function renderCharacter(S, h) {}`, []],
    ["s5-nomotion.html", `const SLIDE_SHOT = 5; function renderKinetic(S, h) {}`, [MSG.mustMotion]],
    ["s6-badkind.html", `const SLIDE_SHOT = 6; window.__seek = 1;`, [MSG.kindVocab("collage")]],
    ["s7-badact.html", `const SLIDE_SHOT = 7; window.__seek = 1; function renderCharacter(S, h) {}`, [MSG.actsVocab("moonwalk")]],
    ["s8-fewacts.html", `const SLIDE_SHOT = 8; window.__seek = 1; function renderCharacter(S, h) {}`, [MSG.actsShort(1, 3)]],
    ["s9-notreatment.html", `const SLIDE_SHOT = 9; window.__seek = 1;`, [MSG.treatmentMissing]],
    ["s10-norole.html", `const SLIDE_SHOT = 10; window.__seek = 1;`, [MSG.editorialRole(undefined), MSG.editorialMotif]],
    ["s11-noaction.html", `const SLIDE_SHOT = 11; window.__seek = 1;`, [MSG.photoAction]],
    ["s12-timeline.html", `const SLIDE_SHOT = 12; window.__seek = 1; function renderSlide(S, h) { return h.date(1, h.L(0)); }`, []],
    ["s12-timeline.html", `const SLIDE_SHOT = 12; window.__seek = 1; function renderSlide(S, h) { return h.rv(1, h.L(0)); }`,
      [MSG.semanticPrimitive("date-enter", "date")]],
    // rv 헬퍼의 primitive 옵션도 표식이다 — 렌더러가 DOM 에서 같은 data-primitive 를 본다
    ["s12-timeline.html", `const SLIDE_SHOT = 12; window.__seek = 1; function renderSlide(S, h) { return h.rv(1, h.L(0), { fx: "plate", primitive: "date-enter" }); }`, []],
    ["s13-principle.html", `const SLIDE_SHOT = 13; window.__seek = 1; function renderSlide(S, h) { return h.disk(1, {label:h.L(0)}); }`, []],
    ["s13-principle.html", `const SLIDE_SHOT = 13; window.__seek = 1; function renderSlide(S, h) { return h.fig(1, 0); }`, []],
    ["s13-principle.html", `const SLIDE_SHOT = 13; window.__seek = 1; function renderSlide(S, h) { return h.chamber(1, h.L(0)); }`, []],
    ["s13-principle.html", `const SLIDE_SHOT = 13; window.__seek = 1; function renderSlide(S, h) { return h.rv(1, h.L(0)); }`,
      [MSG.semanticPrimitive("shape-enter", ["disk", "fig", "chamber"])]],
    ["s14-travel.html", `const SLIDE_SHOT = 14; window.__seek = 1; function renderSlide(S, h) { return h.press(1); }`, []],
    ["s14-travel.html", `const SLIDE_SHOT = 14; window.__seek = 1; function renderSlide(S, h) { return h.shift(1, "<i></i>"); }`, []],
    ["s14-travel.html", `const SLIDE_SHOT = 14; window.__seek = 1; function renderSlide(S, h) { return h.rv(1, h.L(0)); }`,
      [MSG.semanticPrimitive("shape-travel", ["press", "shift"])]],
    ["s15-arts.html", `const SLIDE_SHOT = 15; window.__seek = 1; function renderKinetic(S, h) { return h.art(1, 0) + h.word(1, S.title, {fx:"in"}); }`, []],
    ["s15-arts.html", `const SLIDE_SHOT = 15; window.__seek = 1; function renderKinetic(S, h) { return h.word(1, S.title); }`,
      [MSG.artUnused("slides/assets/s15-stamp.png")]],
    ["s15-arts.html", `const SLIDE_SHOT = 15; window.__seek = 1; function renderKinetic(S, h) { return h.art(1, 0); }`,
      [MSG.artFile("slides/assets/s15-stamp.png")], "missing-asset"],
    ["s16-badmove.html", `const SLIDE_SHOT = 16; window.__seek = 1; function renderKinetic(S, h) { return h.art(1, 0); }`,
      [MSG.artMove("spin"), MSG.artFile("slides/assets/s16-x.png")]],
    ["s17-stem.html", `const SLIDE_SHOT = 17; window.__seek = 1; function renderSlide(S, h) { return h.stem(1); }`, []],
    ["s17-stem.html", `const SLIDE_SHOT = 17; window.__seek = 1; function renderSlide(S, h) { return h.bus(1); }`, []],
    ["s17-stem.html", `const SLIDE_SHOT = 17; window.__seek = 1; function renderSlide(S, h) { return h.ring(1); }`, []],
    ["s17-stem.html", `const SLIDE_SHOT = 17; window.__seek = 1; function renderSlide(S, h) { return h.rv(1, h.L(0)); }`,
      [MSG.semanticPrimitive("shape-draw", ["ring", "stem", "bus"])]],
    ["s18-fig.html", `const SLIDE_SHOT = 18; window.__seek = 1; function renderSlide(S, h) { return h.fig(1, 0); }`, []],
    ["s18-fig.html", `const SLIDE_SHOT = 18; window.__seek = 1; function renderSlide(S, h) { return h.disk(1); }`,
      [MSG.artUnused("slides/assets/s18-person.png")]],
    ["s19-story-act.html", `const SLIDE_SHOT = 19; window.__seek = 1; function renderCharacter(S, h) {}`, []],
    // footage — 클립이 바탕이고(h.footage), shots 의 파일이 있고, 코드가 shots 를 읽으면 앉힌 것이다. 표식(h.mark)은 2026-09-05 진 규칙으로 막는다
    ["s20-footage.html", `const SLIDE_SHOT = 20; window.__seek = 1; function renderSlide(S, h) { const sh = S.visual.slide.shots; return h.footage(1, sh[0].clip) + h.footage(2, sh[1].clip); }`, []],
    ["s20-footage.html", `const SLIDE_SHOT = 20; window.__seek = 1; function renderSlide(S, h) { const sh = S.visual.slide.shots; return h.footage(1, sh[0].clip) + h.mark.route(1, [[0,0],[1,1]]) + h.footage(2, sh[1].clip); }`,
      [MSG.footageMark]],
    ["s20-footage.html", `const SLIDE_SHOT = 20; window.__seek = 1; function renderSlide(S, h) { return h.mark.x(1, 1, 1); }`,
      [MSG.footageUnused("slides/footage/s20-g1.mp4"), MSG.footageUnused("slides/footage/s20-g2.mp4"), MSG.footageNoGround, MSG.footageMark]],
    ["s20-footage.html", `const SLIDE_SHOT = 20; window.__seek = 1; function renderSlide(S, h) { const sh = S.visual.slide.shots; return h.footage(1, sh[0].clip) + h.footage(2, sh[1].clip); }`,
      [MSG.footageClip("slides/footage/s20-g1.mp4"), MSG.footageClip("slides/footage/s20-g2.mp4")], "missing-asset"],
    ["s21-noshots.html", `const SLIDE_SHOT = 21; window.__seek = 1; function renderSlide(S, h) { return h.footage(1, "x.mp4"); }`, [MSG.footageShots]],
    ["s22-noaction.html", `const SLIDE_SHOT = 22; window.__seek = 1; function renderSlide(S, h) { const sh = S.visual.slide.shots; return h.footage(1, sh[0].clip); }`, [MSG.footageAction]],
    // 구운 물체 — 시트·사이드카·include·h.object·존(잉크 상자 49..629 — x 97 이면 726 ≤ 728, x 100 이면 3px 초과)
    ["s23-object.html", `const SLIDE_SHOT = 23; window.__seek = 1; <script src="assets/s23-obj.js"></script> function renderSlide(S, h) { return h.object(1, "s23-obj", { x: 97, y: 0, slot: true }); }`, []],
    ["s23-object.html", `const SLIDE_SHOT = 23; window.__seek = 1; <script src="assets/s23-obj.js"></script> function renderSlide(S, h) { return h.object(1, "s23-obj", { x: 100, y: 0, slot: true }); }`,
      [MSG.objectZone("오른", 1)]],
    ["s23-object.html", `const SLIDE_SHOT = 23; window.__seek = 1; <script src="assets/s23-obj.js"></script> function renderSlide(S, h) { return h.object(1, "s23-obj", { x: 40, y: 700 }); }`,
      [MSG.objectZone("아래", 61)]],
    // slot:false 는 slot 없음과 같다 — 키가 있다고 세로 검사를 건너뛰면 안 된다(리뷰 실측)
    ["s23-object.html", `const SLIDE_SHOT = 23; window.__seek = 1; <script src="assets/s23-obj.js"></script> function renderSlide(S, h) { return h.object(1, "s23-obj", { x: 40, y: 700, slot: false }); }`,
      [MSG.objectZone("아래", 61)]],
    ["s23-object.html", `const SLIDE_SHOT = 23; window.__seek = 1; function renderSlide(S, h) { return h.object(1, "s23-obj", { x: 97, y: 0, slot: true }); }`,
      [MSG.objectInclude("assets/s23-obj.js")]],
    ["s23-object.html", `const SLIDE_SHOT = 23; window.__seek = 1; <script src="assets/s23-obj.js"></script> function renderSlide(S, h) { return h.count(1, 3); }`,
      [MSG.objectUnused]],
    ["s23-object.html", `const SLIDE_SHOT = 23; window.__seek = 1; <script src="assets/s23-obj.js"></script> function renderSlide(S, h) { return h.object(1, "disc", { x: 97, y: 0 }); }`,
      [MSG.objectId("disc", "s23-obj")]],
    ["s23-object.html", `const SLIDE_SHOT = 23; window.__seek = 1; function renderSlide(S, h) { return h.object(1, "s23-obj", { x: 97, y: 0 }); }`,
      [MSG.objectMissing("slides/assets/s23-obj.png"), MSG.objectSidecar("slides/assets/s23-obj.js")], "missing-asset"],
    // 재질 — 템플릿 머리의 html.studio 규칙은 통과하고, 저작 영역과 머리의 다른 규칙은 막는다
    ["s2-motion.html", `const SLIDE_SHOT = 2; window.__seek = 1; <style>html.studio .band{box-shadow:0 2px 0 #000} html.studio .stage{text-shadow:0 1px 0 #000} html.studio .marks .mk{filter:drop-shadow(0 1px 1px #000)}</style> function renderSlide(S, h) { return h.count(1, 3); }`, []],
    ["s2-motion.html", `const SLIDE_SHOT = 2; window.__seek = 1; <style>html.studio .band{box-shadow:0 2px 0 #000} .card{box-shadow:0 8px 20px #000}</style> function renderSlide(S, h) { return h.count(1, 3); }`, [MSG.generatedStyle]],
    ["s2-motion.html", `const SLIDE_SHOT = 2; window.__seek = 1; function renderSlide(S, h) { return '<style>.n{text-shadow:0 4px 8px #000}</style>' + h.count(1, 3); }`, [MSG.generatedStyle]],
    // 셀렉터 목록에 html.studio 를 하나 끼워도 다른 셀렉터는 검사 대상이다(리뷰 실측 우회)
    ["s2-motion.html", `const SLIDE_SHOT = 2; window.__seek = 1; <style>.card, html.studio .band{box-shadow:0 24px 60px rgba(0,0,0,.5)}</style> function renderSlide(S, h) { return h.count(1, 3); }`, [MSG.generatedStyle]],
    // html.wide.studio 처럼 다른 클래스가 앞서도 스튜디오 규칙이다
    ["s2-motion.html", `const SLIDE_SHOT = 2; window.__seek = 1; <style>html.wide.studio .band{box-shadow:0 2px 0 #000}</style> function renderSlide(S, h) { return h.count(1, 3); }`, []],
    // 파일 첫 규칙이 스튜디오 규칙이어도 면제다 — 앞의 doctype·head 가 셀렉터에 붙지 않는다(리뷰 실측)
    ["s2-motion.html", `<!doctype html><html><head><meta charset="utf-8"><style>html.studio .band{box-shadow:0 2px 0 #000}</style> const SLIDE_SHOT = 2; window.__seek = 1; function renderSlide(S, h) { return h.count(1, 3); }`, []],
    // 규칙 앞의 CSS 주석은 셀렉터가 아니다
    ["s2-motion.html", `const SLIDE_SHOT = 2; window.__seek = 1; <style>/* 재질 */ html.studio .band{box-shadow:0 2px 0 #000}</style> function renderSlide(S, h) { return h.count(1, 3); }`, []],
  ];
  let failed = 0;
  const realErr = console.error, realLog = console.log;
  const wipeSlides = () => {
    for (const f of fs.readdirSync(slides)) fs.rmSync(path.join(slides, f), { recursive: true, force: true });
  };
  for (const [name, body, expect, flag] of cases) {
    wipeSlides();
    const need = { "s15-arts.html": ["assets/s15-stamp.png"], "s18-fig.html": ["assets/s18-person.png"],
      "s20-footage.html": ["footage/s20-g1.mp4", "footage/s20-g2.mp4"], "s22-noaction.html": ["footage/s22-g1.mp4"],
      "s23-object.html": ["assets/s23-obj.png", "assets/s23-obj.js"] }[name] || [];
    if (flag !== "missing-asset") for (const f of need) {
      fs.mkdirSync(path.dirname(path.join(slides, f)), { recursive: true });
      fs.writeFileSync(path.join(slides, f), f.endsWith(".js") ? SIDECAR : "x");   // 사이드카는 진짜 JS 여야 읽힌다
    }
    fs.writeFileSync(path.join(slides, name), body);
    const got = [];
    console.error = m => got.push(String(m)); console.log = () => {};
    checkDir(tmp, [name]);
    console.error = realErr; console.log = realLog;
    const ok = expect.length === got.length && expect.every((e, i) => got[i].endsWith(e));
    if (!ok) { failed++; realErr(`✗ selftest ${name} — expected ${JSON.stringify(expect)} got ${JSON.stringify(got)}`); }
  }
  wipeSlides();
  const missing = [];
  console.error = m => missing.push(String(m)); console.log = () => {};
  const missingCode = checkDir(tmp, [], { requireAll: true });
  console.error = realErr; console.log = realLog;
  if (missingCode !== 1 || !missing.some(m => m.includes(MSG.missingFile("slides/s12-timeline.html")))) {
    failed++; realErr(`✗ selftest --require-all — missing registered files did not fail`);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  realLog(failed ? `✗ selftest: ${failed}/${cases.length} failed` : `✓ selftest: ${cases.length}/${cases.length}`);
  return failed ? 1 : 0;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args[0] === "--selftest") process.exit(selftest());
  const dir = args[0];
  if (!dir) { console.error("usage: check-slide.js <storyboard 디렉토리> [파일…] [--require-all] | --selftest"); process.exit(2); }
  const requireAll = args.includes("--require-all");
  process.exit(checkDir(dir, args.slice(1).filter(a => a !== "--require-all"), { requireAll }));
}
