/* Person-short fixture for the story contract. explicitly fictional, never an episode asset.
   It exists so the shape in person-short.md is something the checker has actually passed:
   an opening inside the event (no name, no year), 원인 → 막힘 → 한 방, one sentence a shot,
   a closing picture after the blow, and a disputed record shown in the last line.
   Run: node check-story.js person-short-fixture.js --draft */
window.COMPREHENSION = {
  question: "폭풍 밤에 기름이 없는 등대가 어떻게 배를 돌려세웠나",
  answer: "등대지기가 자기 집 문짝과 이불을 등탑 위에서 태워 불빛을 냈다",
  takeaway: "불빛 하나가 배를 살렸는데, 그 배가 있었는지는 마을에서도 말이 갈려요"
};
window.STORY = {
  version: "story-v1", kind: "fiction",
  viewerNeed: "한 사람이 가진 것을 다 태워서 남을 살리는 순간을 보고 싶다",
  thesis: "가진 것을 다 태운 불빛 한 번이 배 한 척을 돌렸다",
  basis: "허구. 등대지기 박만수와 섬은 지어낸 인물과 장소다",
  person: { name: "박만수", aliases: ["만수"] },
  opening: { shot: 1, group: 1, quote: "불이 꺼진 등대 꼭대기에서 한 남자가 성냥 한 갑을 세고 있어요" },
  payoff: { shot: 6, group: 1, quote: "집에 있던 이불이랑 문짝을 다 뜯어 등탑 위에서 태웠어요" },
  ending: { shot: 9, group: 1, quote: "지금도 마을 사람 절반이 다르게 말해요" },
  endingReason: "문짝 없는 집 한 채가 마지막 그림이고, 그 배가 있었는지는 기록이 갈려 마지막 문장이 두 쪽을 그대로 보여 준다",
  cta: "question", ask: { shot: 9, group: 1, quote: "그 배가 정말 있었는지는" },
  ctaReason: "갈리는 기록을 정하지 않고 넘기면 댓글이 그 자리를 채운다",
  beats: [
    { shot: 1, change: "불 꺼진 등대와 성냥 한 갑. 무슨 일이 난 건지 알고 싶어진다", necessity: "사건 한가운데서 시작하는 첫 장면" },
    { shot: 2, change: "남자가 누구인지, 얼마나 오래 이 일을 했는지", necessity: "한 사람의 무게" },
    { shot: 3, change: "폭풍이 기름 창고를 걷어 갔다. 원인", necessity: "왜 불이 꺼졌는지" },
    { shot: 4, change: "기름 없이는 세 시간. 막힘의 크기", necessity: "시간 제한" },
    { shot: 5, change: "배가 이미 암초 길로 들어온다. 막힘이 목숨이 된다", necessity: "걸린 것" },
    { shot: 6, change: "집을 뜯어 태운다. 한 방", necessity: "이 편의 사건" },
    { shot: 7, change: "배가 돌아섰다. 한 방의 결과", necessity: "한 방이 통했는지" },
    { shot: 8, change: "문짝 없는 집 한 채. 닫는 그림", necessity: "한 방의 값" },
    { shot: 9, change: "그 배가 있었는지 마을 절반이 다르게 말한다. 갈리는 기록", necessity: "기록이 두 갈래라는 사실 자체가 마지막 정보" }
  ]
};
const line = (tts) => [{ tts, sub: tts }];
window.SCENES = [
  { type: "cover", beat: "hook", hookType: "curiosity", hookForm: "gap", title: "등대지기가 집을 태운 밤",
    shot: { info: "불 꺼진 등탑 위, 성냥을 세는 손" },
    narration: line("불이 꺼진 등대 꼭대기에서 한 남자가 성냥 한 갑을 세고 있어요.") },
  { type: "points", beat: "drip", narration: line("박만수라는 사람인데 이 등대를 서른 해 넘게 혼자 지켰어요.") },
  { type: "points", beat: "drip", narration: line("그날 밤 폭풍이 기름 창고 지붕을 통째로 걷어 갔거든요.") },
  { type: "points", beat: "drip", narration: line("기름이 없으면 등불은 세 시간을 못 버텨요.") },
  { type: "points", beat: "drip", narration: line("그런데 항구 쪽에서 배 한 척이 이미 암초 길로 들어오고 있었죠.") },
  { type: "points", beat: "drip", sound: { drop: true },
    narration: line("만수는 집에 있던 이불이랑 문짝을 다 뜯어 등탑 위에서 태웠어요.") },
  { type: "points", beat: "drip", narration: line("그 불빛이 배를 돌려세운 게 새벽 두 시였대요.") },
  { type: "points", beat: "drip", narration: line("다음 날 아침 등대 옆에는 문짝 없는 집 한 채만 서 있었어요.") },
  { type: "points", beat: "cta", shot: { share: "등대지기가 자기 집을 태워 배를 돌렸는데, 그 배가 있었는지는 마을 절반이 다르게 말한다" },
    narration: line("그 배가 정말 있었는지는 지금도 마을 사람 절반이 다르게 말해요.") }
];
