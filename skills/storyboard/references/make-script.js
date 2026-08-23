#!/usr/bin/env node
/**
 * scenes.js → script.md 렌더 — 촬영 대본은 손으로 옮겨 적지 않는다 (두 벌 관리 금지).
 *
 *   node make-script.js <storyboard 디렉토리>     # 생략하면 현재 디렉토리
 *
 * scenes.js 가 SoT 다. 문안이 바뀌면 이 스크립트를 다시 돌린다 — script.md 를 직접
 * 고치면 다음 렌더가 그 수정을 지운다. 문서 구조의 정본은 shot-script-template.md.
 *
 * 레인 분기 (scenes-schema §전 씬 육성 회차):
 *   window.VOICE === "user"  → 전 샷 수록. 촬영 샷은 [파일/화면/행동/대사],
 *                              나머지는 소리만 녹음(voice/s<샷번호>.wav).
 *   VOICE 부재(TTS 회차)     → 촬영 샷만 수록 — 생성 씬은 사용자가 할 일이 없다.
 */
const fs = require("fs");
const path = require("path");

const dir = path.resolve(process.argv[2] || ".");
global.window = {};
require(path.join(dir, "scenes.js"));
const S = global.window.SCENES || [];
const FORMAT = global.window.FORMAT || "shorts-9x16";
const VOICE = global.window.VOICE === "user";
const topic = path.basename(path.dirname(dir)); // episodes/<topic>/storyboard
const channel = path.basename(path.dirname(path.dirname(path.dirname(dir))));

const mmss = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const plain = t => (t || "").replace(/\*\*/g, "");
const rec = s => s.visual && (s.visual.source === "recording" || s.visual.picture === "recording");
const slide = s => !!(s.visual && s.visual.slide);

const shots = [];
let total = 0;
S.forEach((s, i) => { shots.push({ s, no: i + 1, at: total }); total += s.duration || 0; });
const takes = shots.filter(x => rec(x.s));
const body = shots.filter(x => x.s.type !== "outro");
const voiceShots = body.filter(x => !rec(x.s) && (x.s.narration || []).length);
const list = VOICE ? body : shots.filter(x => rec(x.s) && x.s.type !== "outro");

let m = `---
topic: ${topic}
mode: mixed
format: ${FORMAT}
scenes: ${takes.length} 촬영 / ${body.length} 샷(아웃트로 제외)
target: ${mmss(total)}
generated: ${new Date().toISOString().slice(0, 10)}
---

# 촬영 대본 — ${plain(S[0] && S[0].title) || topic}

`;

if (VOICE) {
  m += `전 샷의 대사를 실었다. **촬영 ${takes.length}샷**은 화면을 조작하면서 말하고,
나머지 ${voiceShots.length}샷은 찍을 화면이 없으니 **소리만 녹음**한다.
대사 원문은 \`scenes.js\` 가 정본이고 이 문서는 그것을 읽기 좋게 옮긴 것이다 —
문장을 여기서 고치지 말고 스토리보드를 고친다.
`;
} else {
  m += `촬영 샷 ${takes.length}개만 실었다 — 나머지 씬의 나레이션은 TTS 가 맡는다.
대사 원문은 \`scenes.js\` 가 정본이다.
`;
}

m += `
## 오늘 찍을 것 (한눈에)

| 파일명 | 샷 | 무엇을 찍나 | 목표 길이 |
|---|---|---|---|
`;
takes.forEach(x => {
  m += `| \`${x.s.visual.clip}\` | 샷 ${x.no} | ${x.s.visual.shot} | ~${x.s.visual.takeSec || x.s.duration}초 |\n`;
});
if (VOICE) voiceShots.forEach(x => {
  const what = slide(x.s) ? "소리만 — 슬라이드 씬" : "소리만 — 생성 배경 씬";
  m += `| \`voice/s${x.no}.wav\` | 샷 ${x.no} | ${what} | ~${x.s.duration}초 |\n`;
});

m += `
> 파일은 전부 \`data/${channel}/episodes/${topic}/\` 아래의 위 경로에 **이 이름
> 그대로** 저장한다. 이름이 다르면 편집이 그 샷을 못 찾는다.

## 찍기 전에 한 번 읽기

- **가로(16:9)로 찍는다.** 세로 클립은 빌더가 첫 ffmpeg 전에 멈춘다.
- **이 대본을 보조 모니터에 띄우고 메인 모니터만 녹화한다.**
- **샷 하나 = 파일 하나.** 앞뒤로 1초쯤 여유를 두되 그 여유에 말을 얹지 않는다.
- **대사를 그대로 암송할 필요는 없다.** 자연스럽게 말하되 숫자와 이름은 대본 그대로
  말한다 — 그 값들이 자막과 사실 검증의 기준이다.
- **틀리면 그 샷을 처음부터 다시 찍는다.** 파일을 지우고 새로 찍는 편이 빠르다.
- 터미널·편집기 폰트를 키운다. 화면이 축소돼서 기본 크기는 안 보인다.
- 방해 금지 모드를 켠다 — 알림 배너까지 찍힌다.
- 회사명·거래처명·계정명이 보이는 탭과 파일을 미리 닫거나 가짜 값으로 바꾼다.

## 카메라를 들기 전에 — 샷마다 느낌 · 사이즈 · 앵글이 적혀 있다

- **느낌이 먼저다.** 샷마다 "관객이 여기서 무엇을 느껴야 하나"가 적혀 있고 사이즈와 앵글은
  그것을 위해 고른 값이다. 화면이 예뻐도 그 느낌이 안 나오면 다시 찍는다.
- **사이즈는 발로 바꾼다, 줌으로 바꾸지 않는다.** 서 있는 사람 기준 와이드 5~6 m · 풀숏 약 3 m ·
  익스트림 롱 20 m 이상. 클로즈업은 1.5~2 m 물러나 2배 망원으로 당긴다 — 얼굴 앞에 들이대면
  코와 이마가 튀어나온다.
- **프레임 아래 끝을 관절에 두지 않는다** — 목·손목·팔꿈치·허리·무릎·발목 말고 가슴 중간·허벅지
  중간·정강이 중간에서 자른다.
- **아이레벨의 기준은 상대의 눈이다.** 앉은 사람을 서서 찍으면 30~50 cm 위에서 내려다보는
  하이 앵글이 되고 인터뷰이가 이유 없이 위축돼 보인다. 카메라를 놓기 전에 상대 눈이 몇 cm 에
  있는지 소리 내어 말하고 같이 앉는다.
- **두 사람(또는 사람과 그가 보는 것)이 나오면 선이 생긴다.** 첫 샷 전에 한쪽을 정하고 "A 왼쪽,
  B 오른쪽"을 소리 내어 말한 뒤 그 씬이 끝날 때까지 그 문장이 뒤집히지 않게 찍는다. 반대편
  조명이 좋아도 자리를 옮기지 말고 같은 편에서 더 가까이 가거나 각도만 돌린다.
- **같은 피사체를 다시 찍을 땐 각도를 30도 이상 벌리거나 크기를 두 단계 바꾸거나 동작 중간에
  끊는다.** 반 걸음만 옮기면 컷이 튄다 — 확실히 바꾸거나 아예 안 바꾼다.
- **소리는 사이즈를 따라간다.** 와이드는 공간음이 살아도 되고 클로즈업은 목소리가 깨끗해야
  한다. 한 번 앉은 자리와 마이크를 바꾸지 않는다 — 바꾸면 붙는 자리가 들린다.
`;

const SIZE_KR = { els: "익스트림 롱(완전 풀)", ls: "롱·와이드", ws: "와이드", fs: "풀숏", mfs: "니숏(미디엄 풀)", ms: "미디엄",
                  mcu: "바스트(미디엄 클로즈업)", cu: "클로즈업", choker: "초커", ecu: "익스트림 클로즈업", insert: "인서트",
                  two: "투샷", three: "쓰리샷", ots: "어깨 너머", pov: "1인칭 시점", back: "뒷모습", cutaway: "컷어웨이", reaction: "리액션" };
const DIST_KR = { els: "20 m 이상 물러난다", ls: "5~6 m 뒤에서", ws: "5~6 m 뒤에서", fs: "약 3 m 뒤에서",
                  cu: "1.5~2 m 물러나 2배 망원으로", choker: "1.5~2 m 물러나 망원으로", ecu: "망원으로 눈·입·손끝만" };
const ANGLE_KR = { eye: "아이레벨 — 카메라를 상대 눈높이에", high: "하이 앵글(부감) — 상대 눈보다 위에서 내려다본다",
                   low: "로우 앵글(앙각) — 상대 눈보다 아래에서 올려다본다", overhead: "탑샷 — 바로 위에서 수직으로",
                   dutch: "더치 — 수평을 기울인다(이유를 샷에 적었을 때만, 회차에 한 번)" };
const SOUND_KR = { els: "공간음이 앞, 말소리는 멀어도 된다", ls: "공간음 앞, 말소리는 멀어도 된다", ws: "공간음 앞, 말소리는 멀어도 된다",
                   fs: "공간음과 말소리 균형", mfs: "균형", ms: "말소리 또렷, 공간음은 뒤", mcu: "목소리 깨끗하게, 공간음은 뒤로",
                   cu: "목소리와 숨소리가 앞", choker: "숨소리가 앞", ecu: "그 디테일의 소리", insert: "그 물체의 소리" };
const shotLine = s => {
  const sh = s.shot || {};   // no shot block at all (older files) — still print the prompt, the template flags the same shot
  const sz = sh.size ? (SIZE_KR[sh.size] || `${sh.size} (어휘 밖)`) : "";
  const dist = sh.size && DIST_KR[sh.size] ? ` — ${DIST_KR[sh.size]}` : "";
  const an = sh.angle ? (ANGLE_KR[sh.angle] || `${sh.angle} (어휘 밖)`) : "아이레벨(기본)";
  const sd = sh.size && SOUND_KR[sh.size] ? `\n**소리**: ${SOUND_KR[sh.size]}` : "";
  let out = "";
  if (sh.feel) out += `**느낌**: ${sh.feel}\n`;
  else out += `**느낌**: (적히지 않음 — 스토리보드에서 shot.feel 을 먼저 적는다)\n`;
  if (sz || sh.angle) out += `**사이즈·앵글**: ${[sz + dist, an].filter(Boolean).join(" · ")}${sd}\n`;
  return out;
};

if (VOICE) m += `
## 소리만 녹음하는 샷

찍을 화면이 없는 샷은 화면(배경 그림·슬라이드) 위에 목소리만 얹는다. **촬영 샷과
같은 자리에서 같은 마이크로 이어 녹음한다** — 자리가 바뀌면 톤이 튀어 편집에서
붙는 자리가 들린다. 샷 하나가 파일 하나이고, 문장 사이는 반 박자 쉬어 준다 —
그 쉼이 화면 전환(리빌)의 기준점이다.
`;

m += `
---
`;

let curChapter = null, curScene = null;
list.forEach(({ s, no, at }) => {
  if (s.type === "outro") return;
  if (s.chapter && s.chapter !== curChapter) {
    curChapter = s.chapter;
    m += `\n## ▶ ${curChapter}  \`${mmss(at)}\`\n`;
    curScene = null;
  }
  if (s.scene !== curScene) {
    curScene = s.scene;
    m += `\n### S#${s.scene}. ${s.sceneSlug}\n`;
  }
  const beat = { hook: "커버", hooking: "후킹", result: "결과물", body: "내용", turn: "전환", cta: "마무리" }[s.beat] || s.beat || s.type;
  m += `\n#### 샷 ${no} — ${plain(s.title) || s.type} · ${beat} · ${s.duration}초\n\n`;
  if (rec(s)) {
    m += `**저장할 파일**: \`${s.visual.clip}\`\n`;
    m += `**화면**: ${s.visual.shot}\n`;
    m += `**행동**: ${s.visual.action}\n`;
  } else if (slide(s)) {
    m += `**저장할 파일**: \`voice/s${no}.wav\` — 소리만 녹음한다\n`;
    m += `**화면**: 슬라이드 \`${s.visual.slide.file}\` (승인 뒤 제작) — ${s.visual.slide.plan}\n`;
  } else {
    m += `**저장할 파일**: \`voice/s${no}.wav\` — 소리만 녹음한다\n`;
    m += `**화면**: 만들어 둘 배경 그림 \`${s.visual.bg}\` — 찍을 것 없다\n`;
  }
  m += shotLine(s);
  if (s.shot && s.shot.info) m += `**이 샷이 전하는 것**: ${s.shot.info}\n`;
  const caps = (s.bullets || []).filter(b => b && (b.t || b.d));
  if (caps.length)
    m += `**화면에 뜰 글자**: ${caps.map(b => [plain(b.t), b.d].filter(Boolean).join(" — ")).join(" · ")}${s.footnote ? ` · 출처 «${s.footnote}»` : ""}\n`;
  else if (s.footnote) m += `**화면에 뜰 글자**: 출처 «${s.footnote}»\n`;

  const narr = s.narration || [];
  if (!narr.length) { m += `\n**대사**: (말하지 않는다)\n`; }
  else {
    m += `\n**대사**\n\n`;
    narr.forEach((n, k) => {
      const line = n.sub || n.tts;
      m += `${k + 1}. ${line}\n`;
      if (n.tts && n.sub && n.tts !== n.sub) m += `   <sub>읽기 — ${n.tts}</sub>\n`;
    });
  }
  if (rec(s)) m += `\n**끝나면**: 녹화 정지 → 위 파일명으로 저장\n`;
  m += `\n`;
});

m += `---

마지막 샷 뒤에는 공용 아웃트로가 자동으로 붙는다 — 찍을 것도 말할 것도 없다.
`;

fs.writeFileSync(path.join(dir, "script.md"), m);
console.log(`script.md 작성 완료 · ${m.split("\n").length}줄 · 촬영 ${takes.length}샷` +
  (VOICE ? ` · 소리만 ${voiceShots.length}샷` : " · TTS 회차"));
