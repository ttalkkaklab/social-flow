#!/usr/bin/env node
/**
 * scenes.js 에서 표면별 한국어 텍스트를 뽑는다 — 문체 게이트(check-style.py) 입력용.
 *
 *   node extract-text.js <scenes.js 경로> [narration|subtitle|screen]
 *
 * scenes.js 는 CommonJS 모듈이 아니라 `window.SCENES` 전역 계약이다
 * (scenes-schema.md §파일 계약). 그래서 require 전에 window 를 주입한다 —
 * 이걸 빼먹으면 ReferenceError 로 죽고, 리다이렉트한 파일이 비어 게이트가
 * 조용히 통과한다.
 *
 * 표면:
 *   narration — TTS 가 읽는 문장(`narration[].tts`). 소리로 한 번 지나간다.
 *   subtitle  — 화면에 번인되는 자막(`narration[].sub`). 표기가 tts 와 다르다.
 *   screen    — 카드 텍스트: kicker·title·stat·statLabel·bullets(t·d)·footnote,
 *               quote 씬의 text·role, 슬라이드 씬의 visual.slide.labels.
 *               게시 후 수정이 불가능한 표면이다.
 *               speaker(인물 이름)는 고유명사라 뺀다.
 *
 * exit 0 정상 / 2 인자 오류 / 3 scenes.js 를 읽지 못함.
 */

const path = require("path");

const [, , file, surface = "narration"] = process.argv;
const SURFACES = ["narration", "subtitle", "screen"];

if (!file || !SURFACES.includes(surface)) {
  console.error(`usage: extract-text.js <scenes.js> [${SURFACES.join("|")}]`);
  process.exit(2);
}

global.window = {};
try {
  require(path.resolve(file));
} catch (e) {
  console.error(`extract-text: scenes.js 를 읽지 못했다 — ${e.message}`);
  process.exit(3);
}

const scenes = global.window.SCENES;
if (!Array.isArray(scenes)) {
  console.error("extract-text: window.SCENES 배열을 찾지 못했다 (scenes-schema.md 계약 확인)");
  process.exit(3);
}

// 카드 표면의 문자열 필드. 마크다운 강조(**…**)는 렌더 지시라 떼고 검사한다.
const SCREEN_KEYS = ["kicker", "title", "stat", "statLabel", "footnote", "text", "role"];
const strip = (s) => String(s).replace(/\*\*/g, "").trim();

const out = [];
for (const s of scenes) {
  if (surface === "narration" || surface === "subtitle") {
    const key = surface === "narration" ? "tts" : "sub";
    for (const seg of s.narration || []) {
      if (seg && seg[key]) out.push(strip(seg[key]));
    }
  } else {
    for (const k of SCREEN_KEYS) {
      if (s[k]) out.push(strip(s[k]));
    }
    for (const b of s.bullets || []) {
      if (b && b.t) out.push(strip(b.t));
      if (b && b.d) out.push(strip(b.d));
    }
    // 슬라이드 씬의 도형 라벨 — 화면에 그대로 나가는 글자다 (scenes-schema §슬라이드 씬)
    const sl = s.visual && s.visual.slide;
    for (const t of (sl && sl.labels) || []) {
      if (t) out.push(strip(t));
    }
  }
}

if (!out.length) {
  console.error(`extract-text: ${surface} 텍스트가 비었다 — 씬 구조를 확인하라`);
  process.exit(3);
}

// 문장 종결이 없는 조각(제목·라벨)은 마침표를 붙여 문장 단위 판정이 되게 한다.
console.log(out.map((t) => (/[.!?…]$/.test(t) ? t : `${t}.`)).join("\n"));
