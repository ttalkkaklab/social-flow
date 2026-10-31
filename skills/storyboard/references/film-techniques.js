/* Shared semantic technique catalogue. Icons explain plans; they never certify media. */
(function (root) {
  'use strict';
  const VERSION = 'film-techniques-v2';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const entries = [];
  function add(id, category, ko, en, use, instruction, glyph, fields = {}) {
    entries.push({ id, category, label: { ko, en }, use, instruction, glyph, fields });
  }
  const camera = 'M3 12h10v8H3zM13 14l5-3v10l-5-3';
  const person = 'M23 7a3 3 0 1 0 .01 0M23 13v10m-4-7h8m-4 7-3 5m3-5 3 5';
  add('camera.static','camera','고정','Static','프레임을 고정해 구도·블로킹·연기에 집중한다. 객관적 거리, 오래 붙잡아 쌓는 긴장, 뒤에 올 작은 이동을 크게 만드는 대비.','Static frame: keep camera position, angle and focal length fixed.',camera+'M8 20v9m-4 0 4-9 4 9',{movement:'static'});
  add('camera.dolly-in','camera','달리 인','Dolly in','관객을 대상 쪽으로 걸어 들어가게 한다. 깨달음, 쌓이는 긴장, 두 인물의 가까움, 사물이 중요하다는 신호.','The camera pushes in physically toward the subject from the opening crop and settles on a closer ending crop.',camera+'M19 26h10m-4-4 4 4-4 4',{movement:'dolly in'});
  add('camera.dolly-out','camera','달리 아웃','Dolly out','물러나며 맥락을 드러낸다. 숨은 인물과 규모, 생각보다 깊은 고립, 장면의 끝, 사건을 화면 밖에 두는 생략.','The camera pulls back physically from the subject and settles on a wider ending frame that shows what enters.',camera+'M29 26H19m4-4-4 4 4 4',{movement:'dolly out'});
  add('camera.slow-zoom-in','camera','슬로 줌 인','Slow zoom in','같은 자리에서 화각만 좁혀 한 대상에 주의를 모은다. 관찰자·감시·집착·고립, 컷 없이 쌓는 긴장.','Keep camera position fixed and narrow the field of view slowly toward the subject; perspective stays unchanged.','M3 3h26v26H3zM10 10h12v12H10zM4 4l6 6m16-6-4 6',{movement:'zoom in',speed:'slow'});
  add('camera.arc','camera','아크 샷','Arc shot','인물 주위를 원호로 돈다. 현업은 거의 움직이지 않는 인물의 긴장, 위협과 권력, 무리의 결속, 낭만적 정점에 쓰고, 빠르게 돌려 다급한 마음을 보인다. 어느 쪽으로 읽힐지는 앞뒤 컷이 정한다.','The camera arcs around the subject in the named direction and angle, keeping the subject centered, and settles on the named ending side.',person+'M6 24C-2 4 30 1 29 22m-5-3 5 3 1-6',{movement:'arc shot'});
  add('camera.follow','camera','팔로우 샷','Follow shot','인물 한 걸음 뒤에서 따라간다. 관객을 동행시켜 사건에 끌어들이고, 새 장소를 컷 없이 소개한다.','The camera follows behind the subject at a steady gap and height along the named path to the named stopping point.',camera+'M23 3v8m-3-3 3 3 3-3M23 23v7',{movement:'tracking from behind'});
  add('camera.reverse-tracking','camera','리버스 트래킹','Reverse tracking','걷는 인물 앞에서 뒤로 물러나며 얼굴과 대화를 계속 보여 준다(walk and talk). 긴박감, 지나가는 공간의 소개, 새 세계로의 입장.','The camera retreats in front of the walking subject, facing them at a steady distance, and stops where the walk ends.',camera+'M23 11V3m-3 3 3-3 3 3M23 23v7',{movement:'tracking backward in front of the subject'});
  add('camera.handheld','camera','핸드헬드','Handheld','손으로 든 흔들림. 주관성, 현장감과 즉시성, 혼돈, 숨 쉬듯 약하게 흔들릴 때의 친밀감.','Handheld camera with operated sway at the named intensity: subtle breathing, observational, or frantic.','M5 8l20-2 2 17-20 2zM2 2l2 2m24 24 2 2M12 12l8 4-8 4z',{movement:'handheld'});
  add('camera.whip-pan','camera','휩 팬','Whip pan','카메라를 급히 돌려 두 대상을 잇는다. 원인 → 결과, 시간·장소 전환, 코미디 타이밍, 장면의 에너지.','Whip pan fast from the named first subject, blurring through the move, and settle on the named second subject.','M3 8h15M3 14h20M3 20h26m-6-6 6 6-6 6',{movement:'whip pan',speed:'fast'});
  add('camera.crane-up','camera','크레인 업','Crane up','카메라가 올라가며 장면을 닫거나 위쪽 공간을 드러낸다. 고립과 운명, 포위, 승리 또는 불길함.','The camera rises on a crane from the opening frame, its look direction level or tilting down as named, and settles on a wider high view.',camera+'M24 28V4m-4 4 4-4 4 4',{movement:'crane up'});
  add('camera.snorricam','camera','스노리캠','Snorricam','몸에 고정한 카메라로 얼굴은 그대로, 배경만 흔들린다. 만취·약물·트라우마·패닉 같은 변성 상태와 주변에서의 고립.','Camera rigidly mounted to the torso facing the face; the face stays fixed in frame while the background sways and moves.','M16 2a5 5 0 1 0 .01 0M7 28v-9h18v9M11 19v-5h10v5M2 8l3-3m22 3 3-3',{movement:'handheld body-mounted facing the subject'});
  add('camera.push-past','camera','푸시 패스트','Push past','전경을 지나 숨은 공간으로 들어간다. 장애물로 기대를 쌓는 진입, 바깥에서 사적 공간으로, 전경 와이프로 컷을 숨기는 전환.','The camera pushes in past the named foreground object or through an open doorway and settles on the named landing view.','M3 29V3h16v26M10 25l18-14m-7 0h7v7',{movement:'dolly in past foreground'});
  add('camera.rear','camera','리어 샷','Rear shot','인물을 뒤에서 본다. 얼굴을 감춰 관객이 생각을 채우게 하고, 정보를 인물의 시야로 제한하고, 관객을 동행시킨다.','View the subject from behind at the named crop, facing the named target.','M16 3a6 6 0 1 0 .01 0M4 29v-7q12-12 24 0v7M13 7h6',{viewpoint:'rear'});
  add('camera.low','camera','로우 앵글','Low angle','아래에서 올려다본다. 높이와 규모, 이미 힘을 가진 인물의 지배·위협. 효과는 이야기 순서와 인물의 권위에 따라 달라진다.','Place the camera below the subject looking upward; show what rises behind and above the subject.','M3 26h8v4H3zM12 24 25 9m-7 2 7-2-1 7M24 4v24',{angle:'low'});
  add('camera.high','camera','하이 앵글','High angle','위에서 내려다본다. 인물 아래와 주변의 공간이 들어와 규모를 함께 보여 준다. 작아짐·취약함으로 읽힐지 내려다보는 쪽의 힘으로 읽힐지는 앞뒤 컷과 인물이 정한다(높은 카메라가 화자의 유능함 평가를 올린 실험도 있다).','Place the camera above the subject looking down; show the floor and the space around the subject.','M3 2h8v4H3zM12 8l13 15m-7-2 7 2-1-7M24 4v24',{angle:'high'});
  add('camera.overhead','camera','오버헤드','Overhead','바로 위에서 수직으로 본다. 동선과 배치의 지도, 사건의 규모나 끝난 뒤의 결과, 얼굴을 감춰야 하는 순간.','Look straight down at ninety degrees over a readable floor layout, with the horizon out of the picture.','M12 2h8v5h-8zM16 8v10m-4-4 4 4 4-4M3 25q13-10 26 0-13 10-26 0z',{angle:'overhead'});
  add('camera.dutch','camera','더치 앵글','Dutch angle','수평선을 기울인다. 불안·광기·소외처럼 무언가 어긋났다는 신호로 쓰는 관례이고, 드물게 쓸 때 힘이 있다. 숏 안에서 기울기를 바꾸면 마음이 바뀌는 순간으로 쓴다.','Tilt the horizon by the chosen angle and direction, with a strong vertical line in the frame showing the tilt.','M3 10 25 3l6 20-22 7zM8 20l16-5',{angle:'dutch'});
  add('camera.dolly-zoom','camera','돌리 줌','Dolly zoom','인물 크기는 그대로, 배경 원근만 바뀐다. 현기증, 압도적 공포, 모든 걸 다시 보게 만드는 깨달음.','Dolly and zoom in opposite directions together, holding the subject screen size while the background stretches away or rushes closer.','M3 4h26v24H3zM10 9h12v14H10zM1 16h8m-3-3 3 3-3 3M31 16h-8m3-3-3 3 3 3',{movement:'dolly zoom'});
  add('camera.rack-focus','camera','랙 포커스','Rack focus','카메라는 그대로 두고 초점만 옮겨 관심을 넘긴다. 새 정보 공개, 깨달음과 반응, 두 인물의 관계, 서스펜스.','Shift sharp focus from the near subject to the far subject, or the reverse, in a shallow depth of field on a motivated cue.','M3 18a7 7 0 1 0 .01 0M22 5a4 4 0 1 0 .01 0M12 14l9-5m-6 0h6v6',{focus:'rack'});
  add('camera.side-tracking','camera','사이드 트래킹','Side tracking','인물 옆에서 나란히 움직인다. 사건 뒤 곁에 머물기, 늘어선 대상 훑기, 거리를 둔 목격.','The camera trucks parallel beside the subject at matching speed, with foreground layers passing for parallax.',camera+'M3 27h26m-4-4 4 4-4 4M23 4v14',{movement:'truck parallel to the subject'});
  add('camera.pov','camera','1인칭 시점','First-person POV','관객이 인물의 눈으로 본다. 보는 숏과 반응 숏 사이에 끼워 인물의 발견·공포·주관을 함께 겪게 한다.','View from the character eye height, showing what the character sees.','M4 10V4h6M22 4h6v6M28 22v6h-6M10 28H4v-6M12 16h8M16 12v8',{viewpoint:'pov'});
  add('camera.drone-pullback','camera','드론 풀백','Drone pullback','뒤로 날며 오른다. 장소의 규모, 고립, 이야기를 닫는 클로징 샷.','The camera pulls back and rises together on one smooth path, from a tight start to a wide view of the place.','M12 10h8v8h-8zM4 5h7M21 5h7M8 5l4 5m8 0 4-5M5 27 27 5m-8 0h8v8',{movement:'aerial backward and upward'});
  add('camera.pan-left','camera','왼쪽 팬','Pan left','제자리에서 왼쪽으로 돈다. 움직이는 인물 따라가기, 장소 공개, 시점 팬, 숨은 위험 발견. 방향은 대상 위치와 인물 이동이 정한다.','The camera pans left across from the named first target and settles on the named second target, with a still frame at both ends.',camera+'M29 27H3m5-4-5 4 5 4',{movement:'pan left'});
  add('camera.pan-right','camera','오른쪽 팬','Pan right','제자리에서 오른쪽으로 돈다. 움직이는 인물 따라가기, 장소 공개, 시점 팬, 숨은 위험 발견. 방향은 대상 위치와 인물 이동이 정한다.','The camera pans right across from the named first target and settles on the named second target, with a still frame at both ends.',camera+'M3 27h26m-5-4 5 4-5 4',{movement:'pan right'});
  add('camera.tilt-up','camera','틸트 업','Tilt up','제자리에서 위로 고개를 든다. 높이와 규모, 이야기가 이미 힘을 실어 준 인물을 올려 잡기, 인물이 올려다보는 속도에 맞춘 공개.','The camera tilts upward from the named starting target and settles on the named ending target.','M4 16h10v8H4zM22 28V4m-5 5 5-5 5 5M3 29h12',{movement:'tilt up'});
  add('camera.tilt-down','camera','틸트 다운','Tilt down','제자리에서 아래로 내려간다. 얼굴에서 손에 든 물건으로 내려가는 발견, 높은 곳에서 인물로 내려오는 설정, 인물을 작게.','The camera tilts downward from the named starting target and settles on the named ending target.','M4 4h10v8H4zM22 4v24m-5-5 5 5 5-5M3 29h12',{movement:'tilt down'});
  add('camera.eye','camera','눈높이','Eye level','인물 눈높이의 중립 시점. 대화·인터뷰·카메라를 보고 말하는 컷의 기본이며, 실험에서 신뢰를 가장 많이 받았다.','Keep the lens level at the eye height of the named subject.',camera+'M19 12h10M23 4v24',{angle:'eye'});
  const sizes = [
    ['els','익스트림 롱샷','Extreme long shot','인물을 환경 속 작은 점으로 두어 장소·규모·고립을 보여 준다. 장면의 첫 컷이나 마지막 컷.','extreme long shot, the subject tiny within the surroundings, under a tenth of the frame height',9],
    ['ls','롱샷','Long shot','장면 첫머리의 설정샷. 어디인지, 몇 명인지, 서로 얼마나 떨어졌는지를 한 번에 보여 준다.','wide establishing shot, full body with room above and below, the surroundings readable',21],
    ['fs','풀샷','Full shot','몸 전체의 동작이 정보일 때. 걷기·춤·격투·의상, 여러 인물을 한 컷에.','full shot, head to toe, both feet in frame with a small margin below',28],
    ['mfs','미디엄 풀샷','Medium full shot','허벅지 중간 위를 잡아 허리 높이의 손과 행동을 표정과 함께 보여 준다(카우보이샷). 두 사람과 그 사이 거리에도 쓴다.','medium full shot, frame bottom at mid-thigh, hands and hips in frame',37],
    ['ms','미디엄 샷','Medium shot','허리 위를 잡아 상반신과 손짓을 보여 준다. 대화의 출발점이자, 뒤에 올 클로즈업을 아끼는 완충 크기.','medium shot, waist up',44],
    ['mcu','미디엄 클로즈업','Medium close-up','가슴 위. 표정과 작은 몸짓을 함께 보여 주는 대화의 중립 크기이자 인터뷰·카메라를 보고 말하는 컷의 기본.','medium close-up, chest up, frame bottom at mid-chest, eyes near the upper third',56],
    ['cu','클로즈업','Close-up','얼굴이 화면을 채운다. 그 순간 이야기에 중요한 감정과 반응, 결정적인 한 마디.','close-up, the face and the top of the shoulders, crown lightly cropped',75],
    ['choker','빅 클로즈업','Big close-up','이마에서 턱까지 얼굴만 꽉 채운다. 고백·붕괴처럼 감정이 숨을 곳이 없는 정점.','big close-up, the face from forehead to chin fills the frame',110],
    ['ecu','익스트림 클로즈업','Extreme close-up','눈·입·손끝·방아쇠처럼 디테일 하나가 화면을 채운다. 정점의 디테일.','extreme close-up, one named detail fills the frame',180]
  ];
  const SIZE_WORDS = {}, SIZE_GLYPHS = {};
  for (const [key,ko,en,use,instruction,height] of sizes) {
    const k=height/100, top=key==='choker'?-11:key==='ecu'?-29:2;
    let glyph = `<g transform="translate(${16-50*k} ${top}) scale(${k})"><circle cx="50" cy="15" r="12"/><path d="M31 72V46q0-12 19-12t19 12v26zM40 72v26M60 72v26"/><path d="M43 14h3m8 0h3M43 22h14"/></g>`;
    glyph = glyph.replace(/<circle /g, '<circle vector-effect="non-scaling-stroke" ').replace(/<path /g, '<path vector-effect="non-scaling-stroke" ');
    if (key === 'ecu') glyph = '<path d="M1 16Q16 1 31 16Q16 31 1 16Z"/><circle cx="16" cy="16" r="6"/><circle cx="16" cy="16" r="2"/>';
    if (key === 'choker') glyph = '<path d="M4 0V17Q16 38 28 17V0M8 9h5m6 0h5M11 23q5 3 10 0"/>';
    glyph = '<rect x="1" y="1" width="30" height="30" rx="2" opacity=".3"/>' + glyph;
    SIZE_WORDS[key]=instruction; SIZE_GLYPHS[key]=glyph;
    add('framing.'+key,'framing',ko,en,use,instruction,glyph,{size:key});
  }
  const refs=[['front','정면 전신','Front reference','전신·의상·체형','Headless front mannequin; preserve build, wardrobe and shoes.','M8 29V15h16v14M16 15v14'],['back','후면 전신','Back reference','후면·뒤돌아섬','Headless rear mannequin; preserve clothing seams and match front scale.','M8 29V15h16v14M16 15v14M11 17h10'],['face','얼굴 참조','Face reference','대사·얼굴 반응','Neutral face including hair; keep identity separate from scene lighting.','M16 3a12 12 0 1 0 .01 0M10 13h3m6 0h3M12 21h8'],['costume','의상 전용 참조','Costume reference','의상·체형 보조','Optional wardrobe variant; baseline front/back already omit the head.','M10 4 3 10l4 7 3-3v15h12V14l3 3 4-7-7-6-6 7z']];
  for(const [key,ko,en,use,instruction,glyph] of refs) add('character.'+key,'character',ko,en,use,instruction,glyph,{reference:key});
  const timing=[['insert','인서트 시간','Insert timing','단서·사물·글을 확인하는 시간. 읽을 분량이 길이를 정한다.','Generate about 3–4 seconds and trim to the measured reading time; favor the slow reader for text.','M3 8h26v16H3zM11 12h10v8H11z'],['action','행동 시간','Action timing','이동·접촉·도착. 예비동작, 동작, 반응이 다 들어가는 시간.','Start around 5–7 seconds of generation; keep anticipation, action and response, then trim in the edit.','M3 24l8-12 7 8 11-15M3 29h26'],['dialogue','대사·감정 시간','Dialogue timing','말과 표정의 변화. 실측한 대사 길이와 반응 꼬리가 길이를 정한다.','Start around 7–10 seconds when one clip voices the whole exchange; otherwise use measured speech plus the reaction tail.','M3 4h26v18H13l-6 7v-7H3zM8 10h16M8 16h10'],['establishing','공간 소개 시간','Establishing timing','장소와 위치 관계를 읽는 시간. 처음 보는 장소는 길게, 다시 찾은 장소는 짧게.','Start around 5–8 seconds for a first visit; a return to a known place runs shorter.','M3 27V12l13-9 13 9v15zM12 27V16h8v11'],['long-take','롱테이크 시간','Long-take timing','연속 시간 자체가 의미인 장면. 끊으면 의미가 깨지는 행동.','Ten seconds or longer only when motivated; keep visible action throughout and stay within the adapter limit.','M2 16h28M3 10v12m6-12v12m6-12v12m6-12v12m6-12v12']];
  for(const [key,ko,en,use,instruction,glyph] of timing) add('timing.'+key,'timing',ko,en,use,instruction,glyph,{timing:key});
  const byId = Object.assign(Object.create(null), Object.fromEntries(entries.map(entry=>[entry.id,entry])));
  // Decision notes beside each use, from docs/research/2026-10-31-directing-technique-conventions:
  // when to pass it over, what sits before or after it, what the prompt must name, how 9:16 changes it.
  const GUIDE = {
    "camera.static": {"avoid": "따라가기나 연속 공개처럼 고정으로는 낼 수 없는 효과가 필요한 비트.", "specify": "프레임 안에서 무엇이 언제 어디로 움직이는지(왼쪽 3분의 1, 가운데처럼 프레임 기준)."},
    "camera.dolly-in": {"avoid": "습관처럼 반복하는 푸시(힘이 빠진다). 엿보는 관찰자 시점이 목적이면 줌.", "pair": "고정 샷이 이어진 뒤의 약한 푸시가 크게 읽힌다.", "specify": "시작 크롭과 끝 크롭(끝에 얼굴이 화면을 어떻게 채우는지), 움직이기 시작하는 대사나 반응, 속도. 2초 안팎의 느린 푸시는 표류처럼 보인다."},
    "camera.dolly-out": {"avoid": "드러나는 내용과 그 시점이 이야기와 맞지 않을 때. 원근이 고정된 광학적 후퇴면 줌 아웃.", "pair": "장면이나 인물 이야기의 마지막 컷.", "specify": "끝 프레임에 새로 들어오는 것과 그때 인물의 크기, 속도(느리면 감정이 쌓이고 빠르면 충격·펀치라인)."},
    "camera.slow-zoom-in": {"avoid": "관객이 공간 안으로 들어가는 느낌이 목적이면 달리 인. 줌을 되풀이하면 거슬리고, 빠른 크래시 줌은 코미디 색이 있다.", "specify": "넓게 시작해 무엇이 화면을 채우며 끝나는지, 속도."},
    "camera.arc": {"avoid": "멋을 내려는 장식용 아크, 어지러운 빠른 아크. 큰 아크는 180도 선을 넘으니 다음 컷 방향을 미리 맞춘다.", "specify": "회전 방향(시계·반시계)과 각도(90°·180°·360°), 속도, 끝에서 보이는 인물의 면, 인물이 멈춰 있는지."},
    "camera.follow": {"avoid": "위협을 의도하지 않았는데 차갑고 매끄럽게 뒤따르면 감시자처럼 읽힌다. 얼굴 반응이 핵심이면 뒤에서는 가려진다.", "pair": "뒷모습 시점(camera.rear)과 함께 고르기 쉽다.", "specify": "따르는 거리와 카메라 높이, 경로·랜드마크·걷는 속도, 멈추는 끝 프레임, 뒤에서 알아볼 단서(머리·옷).", "vertical": "길·통로·복도를 따라 앞으로 나아가는 움직임이 세로 화면에 맞는다."},
    "camera.reverse-tracking": {"avoid": "습관이 된 walk and talk(관례이자 클리셰라는 비판이 있다).", "specify": "인물 수와 대열, 걷는 속도, 유지할 크기, 배경에 지나갈 장소, 멈추는 지점과 그때 보이는 것."},
    "camera.handheld": {"avoid": "관객이 공간을 파악해야 하는 추격(지리를 먼저 세웠을 때만), 연기 디테일이 필요한 클로즈업, 남용.", "specify": "강도 단계(숨쉬듯·관찰형·격렬), 따라가는 대상, 끝에 프레임이 멈추는지, 계속 읽혀야 할 얼굴이나 랜드마크."},
    "camera.whip-pan": {"avoid": "서사 없이 이음새로만 쓰는 남용.", "pair": "두 클립을 잇는 전환이면 나가는 클립과 들어오는 클립의 방향·속도·조명을 맞춘다.", "specify": "첫 대상과 둘째 대상, 방향, 돌리는 계기(고개 돌림·소리), 둘째 대상에 착지한 구도."},
    "camera.crane-up": {"avoid": "동기 없는 상승. 같은 상승이 승리와 불길함 둘 다로 읽히니 앞뒤 컷이 뜻을 정해야 한다.", "specify": "시작 프레임, 시선이 수평인지 아래로 기우는지, 드러날 공간과 끝에서 인물의 크기, 속도."},
    "camera.snorricam": {"avoid": "길게, 자주 쓰기. 영화 한 편에 한두 번, 몇 초가 관례다.", "pair": "시점 숏과 짝지어 인물이 느끼는 것과 보는 것을 대비한다.", "specify": "인물의 움직임(비틀거림·달리기)과 진행 방향, 배경 장소."},
    "camera.push-past": {"avoid": "이야기와 무관한 무동기 이동. 전환용이면 전경이 프레임을 다 가려야 컷이 튀지 않는다.", "specify": "지나칠 전경 물체와 화면 위치, 통과할 틈(문·창), 착지 뒤 피사체의 모습, 전환용인지 공개용인지."},
    "camera.rear": {"avoid": "표정이 정보인 순간을 오래 가리는 것, 위협을 의도하지 않았는데 차갑게 뒤따르는 것.", "pair": "뒤따르는 이동(camera.follow)과 함께 고르기 쉽다.", "specify": "크롭(머리·어깨/허리/전신), 카메라 높이, 인물이 바라보는 대상, 뒤에서 알아볼 단서."},
    "camera.low": {"avoid": "신뢰가 필요한 정면 발화(실험에서 로우는 눈높이보다 신뢰를 낮췄다).", "specify": "카메라 높이와 올려보는 정도, 인물 뒤·위로 보이는 것(천장·하늘·조명), 얼굴 방향(정면 응시는 위압, 측면은 영웅 쪽).", "vertical": "세로 화면은 높은 대상을 올려다보는 앵글에 위아래 공간을 넉넉히 준다. 힘으로 읽힐지는 이야기가 정한다."},
    "camera.high": {"avoid": "감시당하는 느낌은 내려다보는 인물이 있는 시점 숏에서 생긴다. 신뢰가 필요한 정면 발화는 눈높이가 낫다.", "specify": "카메라가 머리보다 얼마나 위인지, 인물 아래·주변의 바닥과 공간, 화면 속 인물 크기, 내려다보는 인물이 있으면 그 위치."},
    "camera.overhead": {"avoid": "표정이 정보인 반응·대사 컷(수직으로 내려다보면 얼굴이 화면에 들어오지 않는다).", "specify": "바닥 배치(누가 어디에서 어느 쪽을 향하는지), 바닥 재질과 그림자 방향."},
    "camera.dutch": {"avoid": "이유 없는 반복. 몇 컷에만 쓸 때 힘이 있다.", "specify": "기울기 각도와 방향(예: 15° clockwise), 처음부터 기운 숏인지 숏 안에서 기우는지, 기울어 보일 수직선(문틀·벽 모서리)."},
    "camera.dolly-zoom": {"avoid": "효과가 아주 특정하다. 그 순간 하나에만 쓴다.", "pair": "깨달음을 일으키는 대사나 소리 직후에 시작한다.", "specify": "방향(dolly in + zoom out이면 배경이 멀어지고, dolly out + zoom in이면 다가온다)과 시작 계기."},
    "camera.rack-focus": {"avoid": "습관적 사용. 두 대상이 같은 거리에 있거나 관심을 옮길 계기가 없을 때.", "specify": "가까운 대상과 먼 대상, 순서, 옮겨 가는 계기(대사·소리·동작)와 시점, 끝에 선명한 대상. shot_icons focus의 from·to에 두 대상을 영어로 적고, 얕은 심도의 focus는 처음 선명한 대상(from)과 같게 둔다."},
    "camera.side-tracking": {"avoid": "얼굴 정면이나 목적지가 핵심일 때. 전경 층이 없으면 팬과 구별되지 않는다.", "specify": "좌우 방향, 속도, 전경·중경·배경에 지나갈 것, 시작과 끝 프레임.", "vertical": "세로 화면은 좌우 이동을 과장한다. 느리게 움직이거나 카메라를 비스듬히 두어 대각선 이동으로 바꾼다."},
    "camera.pov": {"avoid": "반응이 사라질 만큼 긴 시점 숏, 보는 사람을 세우지 않은 시점 숏.", "pair": "보는 얼굴 → 시점 숏 → 반응 얼굴.", "specify": "누구의 눈인지, 눈높이, 화면 아래에 걸리는 손이나 몸, 보는 대상과 시선이 머무는 끝점, 다른 인물이 렌즈를 보는지.", "vertical": "앞으로 나아가는 길·복도 시점이 세로 화면에 맞는다."},
    "camera.drone-pullback": {"avoid": "가장 흔한 클리셰다. 장면을 닫는 순간 하나에만 쓴다.", "specify": "드러날 공간과 끝에서 인물의 크기, 느린 속도. 후퇴와 상승을 한 경로로 적는다."},
    "camera.pan-left": {"avoid": "끝에 드러날 것이 없는 팬, 너무 빠른 팬(화면 폭 하나를 7초보다 빨리 지나면 끊겨 보인다).", "specify": "출발 대상과 도착 대상, 따라가는 인물의 이동 방향, 속도.", "vertical": "세로 화면은 좌우 움직임을 과장한다. 느리게, 작게 움직인다."},
    "camera.pan-right": {"avoid": "끝에 드러날 것이 없는 팬, 너무 빠른 팬(화면 폭 하나를 7초보다 빨리 지나면 끊겨 보인다).", "specify": "출발 대상과 도착 대상, 따라가는 인물의 이동 방향, 속도.", "vertical": "세로 화면은 좌우 움직임을 과장한다. 느리게, 작게 움직인다."},
    "camera.tilt-up": {"avoid": "끝에 새 정보가 없는 틸트. 헤드룸을 맞추는 작은 틸트는 기법이 아니라 리프레이밍이다.", "specify": "시작 대상과 끝 대상, 끝에서 대상이 놓일 위치, 속도.", "vertical": "세로 화면은 높이를 보여 주는 틸트에 맞는다."},
    "camera.tilt-down": {"avoid": "약함을 의도하지 않은 인물을 내려 잡는 것, 헤드룸 맞추기를 기법으로 적는 것.", "specify": "시작 대상과 끝 대상, 끝에서 대상이 놓일 위치."},
    "camera.eye": {"avoid": "키나 자세가 다른 두 사람이 함께 있으면 누구의 눈높이인지 정해야 뜻이 생긴다.", "specify": "기준 인물과 자세(서 있음·앉음), 시선 방향(렌즈 정면, 화면 밖 왼쪽·오른쪽)."},
    "framing.els": {"avoid": "인물을 알아보거나 표정을 읽어야 하는 컷. 휴대폰 화면에서는 넓은 풍경의 힘이 줄어든다.", "pair": "감정 클로즈업과 번갈아 붙이면 장면의 강도가 유지된다.", "specify": "인물 수와 화면 속 위치, 화면 높이 대비 크기, 기준 랜드마크, 지평선 높이, 시간대·날씨.", "vertical": "건물·절벽·하늘 같은 세로 요소를 축으로 쓰고, 카메라를 비스듬히 두어 폭을 만든다. 지평선은 화면 한가운데를 피한다."},
    "framing.ls": {"avoid": "표정과 반응이 정보인 순간(클로즈업으로 좁힌다).", "pair": "설정샷 → 같은 공간 안으로 컷인 → 클로즈업이 이어진 뒤 재설정샷. 가까운 크기로 연 장면은 다음 그림 컷에서 이 크기로 공간을 보여 준다.", "specify": "인물 수, 각자의 화면 위치(좌우·앞뒤), 서로의 간격, 문·창 같은 공간 기준점. 거리는 숫자가 아니라 크기와 배치로 적는다.", "vertical": "세로 화면은 와이드로 대화를 세우기 어렵다. 인물을 옆으로 나란히 두지 말고 앞뒤로 쌓고, 카메라 쪽으로 오가게 움직인다."},
    "framing.fs": {"avoid": "표정이 핵심인 순간. 발목·무릎 같은 관절에서 자르지 않는다.", "pair": "동작의 시작은 풀샷으로 보여 주고 결과나 반응은 더 가까운 크기로 받는다.", "specify": "동작 동사, 발이 닿는 바닥, 의상, 발끝 아래 여백.", "vertical": "세로 화면은 사람 한 명을 머리부터 발끝까지 담기에 알맞다. 전신과 카우보이샷이 세로에서 가장 잘 맞는다."},
    "framing.mfs": {"avoid": "무릎 관절에서 자르는 프레임. 무릎 위를 잡는 니샷은 다른 크기다.", "pair": "대치가 시작될 때 이 크기로 손과 거리를 보이고, 긴장이 오르면 얼굴로 좁힌다.", "specify": "절단선(허벅지 중간), 손의 위치, 두 사람이면 각자의 위치와 간격.", "vertical": "세로 화면에서 전신샷과 함께 가장 잘 맞는 크기."},
    "framing.ms": {"avoid": "감정의 절정(클로즈업으로 좁힌다). 엉덩이 높이에서 자르는 프레임.", "pair": "샷/리버스샷은 양쪽 크기를 맞춘다. 한쪽만 다르게 잡으면 그 차이가 의미가 된다.", "specify": "손짓이 정보면 손이 프레임 안에 있다고 적는다. 시선 방향.", "vertical": "세로 화면에서는 같은 허리선이라도 인물이 화면 폭을 더 채워 가로 클로즈업에 가깝게 읽힌다."},
    "framing.mcu": {"avoid": "감정의 절정이나 깨달음. 그 순간은 클로즈업에 맡긴다.", "pair": "장면 대부분을 이 크기로 두면 클로즈업이 강조로 살아난다.", "specify": "시선이 렌즈 정면(직접 말하기)인지 화면 밖 상대인지.", "vertical": "세로 화면은 토킹헤드와 카메라를 보고 말하는 컷에 잘 맞는다. 눈은 위쪽 3분의 1 선 근처."},
    "framing.cu": {"avoid": "이야기 정보가 없는 클로즈업, 변화 없는 얼굴 컷의 연속. 횟수보다 감정이 실린 순간에 쓴다.", "pair": "공간을 세운 뒤에 온다. 클로즈업에서 와이드로 바꾸는 컷이 가장 크게 읽힌다.", "specify": "표정 변화(시작 → 끝), 시선 방향, 망원 렌즈.", "vertical": "가로 클로즈업을 세로에 그대로 옮기면 빅 클로즈업처럼 꽉 찬다. 광각으로 찍으면 위아래가 왜곡된다."},
    "framing.choker": {"avoid": "일상 대화. 자주 쓰면 힘이 빠진다. 눈과 입 사이만 남기는 프레임은 출처마다 정의가 다르니 이 id에 섞지 않는다.", "pair": "감정이 쌓인 뒤의 정점에 둔다. 바로 앞 컷이 같은 얼굴의 클로즈업이면 차이가 작다.", "specify": "절단선(이마·턱), 표정 변화.", "vertical": "세로 화면에서는 위아래 절단보다 얼굴 폭이 화면 폭을 채우는지로 정한다."},
    "framing.ecu": {"avoid": "관객이 무엇의 일부인지 모를 때(앞에서 공간과 인물을 먼저 보여 준다). 사물만 보이면 인서트로 적는다.", "pair": "편집이 빨라지는 절정에서 눈 클로즈업을 짧게 잇는다.", "specify": "디테일 하나의 이름, 그것이 화면을 채운다는 문장, 매크로와 얕은 심도.", "vertical": "세로 화면에서는 가로 클로즈업만으로도 이 크기에 가까워진다."},
    "timing.insert": {"avoid": "1초 분량을 3~4초로 채우는 것. 반복해서 보여 주는 인서트는 처음보다 짧게.", "specify": "읽을 대상과 분량, 첫 등장인지 반복인지, 생성 길이와 사용 길이."},
    "timing.action": {"avoid": "한 클립에 동작을 몰아넣는 것. 빠른 액션은 컷을 나눠 동작 중에 자른다.", "specify": "세 박자(예비·접촉·반응 정착)의 대략 시점, 도착 지점이 화면 안에 들어오는지."},
    "timing.dialogue": {"avoid": "한 사람 샷에 여러 줄과 반응을 길게 묶는 것(현대 대화 편집은 줄과 반응마다 샷을 준다).", "specify": "대사 원문과 발화 초, 반응이 시작되는 지점과 꼬리, 한 클립에 넣을 줄 수."},
    "timing.establishing": {"avoid": "숏폼의 첫 컷(첫 3~6초 훅과 부딪친다).", "specify": "관객이 읽어야 할 공간 관계, 첫 방문인지 재방문인지."},
    "timing.long-take": {"avoid": "움직임 없이 길이만 늘리는 것.", "specify": "연속 사건의 시작·끝 상태, 카메라 경로의 시작·끝, 어댑터 길이 상한."}
  };
  for (const [id, note] of Object.entries(GUIDE)) Object.assign(byId[id], note);
  // The video-prompt verb phrase after "The camera" (shot_prompt). LTX's documented camera words —
  // pushes in, pulls back, pans, tilts upward, static frame — where it has one; {target} is what the
  // move is aimed at (what it pushes toward or pans to, or the person it follows or circles), "the subject"
  // when none is named.
  const PROMPT = {
    'camera.static': 'holds a static frame',
    'camera.dolly-in': 'pushes in toward {target}',
    'camera.dolly-out': 'pulls back from {target}',
    'camera.slow-zoom-in': 'zooms in on {target} from a fixed position',
    'camera.arc': 'arcs around {target}, keeping it centered',
    'camera.follow': 'follows behind {target} at a steady distance',
    'camera.reverse-tracking': 'tracks backward ahead of {target}, facing it',
    'camera.handheld': 'moves handheld with {target}, with a slight natural sway',
    'camera.whip-pan': 'whip pans to {target}',
    'camera.crane-up': 'cranes up above {target}',
    'camera.snorricam': 'stays body-mounted on {target}, the face fixed in frame while the background moves',
    'camera.push-past': 'pushes in past the foreground toward {target}',
    'camera.dolly-zoom': 'makes a dolly zoom on {target}, its size held while the background stretches',
    'camera.side-tracking': 'trucks sideways alongside {target}',
    'camera.drone-pullback': 'pulls back and rises above {target}',
    'camera.pan-left': 'pans left to {target}',
    'camera.pan-right': 'pans right to {target}',
    'camera.tilt-up': 'tilts upward to {target}',
    'camera.tilt-down': 'tilts downward to {target}'
  };
  for (const [id, prompt] of Object.entries(PROMPT)) byId[id].prompt = prompt;
  // shot_icons values without a catalogue entry: composition sizes, ground/over angles, depth, still effects.
  const VALUES = {
    "size": {
      "ws": {"label": {"ko": "와이드 샷", "en": "Wide shot"}, "use": "롱샷(ls)과 같은 크기의 옛 키. 새 보드는 ls를 쓴다.", "avoid": "약어 WS는 한국 현장에서 웨스트 샷(허리 위)으로도 읽힌다.", "specify": "ls와 같다."},
      "insert": {"label": {"ko": "인서트", "en": "Insert"}, "use": "장면 안의 사물·손·화면 하나를 떼어 보여 준다. 설명 대사 없이 단서와 정보를 준다.", "avoid": "다른 장소나 다른 시간이면 컷어웨이다. 소품 위치와 조명이 본 장면과 어긋나면 연속성이 깨진다.", "pair": "공간을 보여 준 컷 뒤에 오고, 보통 그 인물의 시선 각도에서 찍는다.", "specify": "사물, 손의 주인, 상태, 화면 속 글자, 시선 각도. 얼굴이 없다는 말 대신 화면을 채우는 것만 적는다(only the hand and the phone fill the frame).", "vertical": "세로로 길쭉한 사물은 세로 화면에서 가깝고 자세하게 보인다."},
      "two": {"label": {"ko": "투샷", "en": "Two-shot"}, "use": "두 인물을 한 프레임에 담아 관계·힘·거리와 반응을 함께 보여 준다. 크기는 따로 정한다.", "avoid": "의도 없이 비좁게 채운 프레임.", "pair": "투샷으로 관계를 세운 뒤 샷/리버스샷으로 들어간다. 지속되는 투샷은 배우가 자세와 상체로 연기하게 한다.", "specify": "두 인물의 위치(좌우·앞뒤), 간격, 얼굴 방향, 절단선, 누가 말하는지.", "vertical": "옆으로 나란히 서면 얼굴을 넣기 어렵다. 한 사람은 앞, 한 사람은 뒤로 깊이를 둔다."},
      "three": {"label": {"ko": "쓰리샷", "en": "Three-shot"}, "use": "세 인물의 관계와 위계를 한 프레임에 담는다. 가운데는 권위, 고른 간격은 조화, 등을 돌린 한 명은 갈등. 와이드로 잡으면 장소도 함께 보인다.", "avoid": "샷당 주요 인물은 두 명까지다. 세 번째는 참조 이미지 없는 엑스트라로 묘사하거나 샷을 나눈다.", "pair": "와이드 쓰리샷으로 무리와 장소를 보인 뒤 싱글로 나눈다.", "specify": "세 사람의 배치(삼각형·일렬·앞뒤)와 중심인물, 절단선.", "vertical": "세로 화면에서 세 사람의 대화는 매우 어렵다. 앞·중간·뒤로 쌓는다."},
      "ots": {"label": {"ko": "오버 더 숄더", "en": "Over the shoulder"}, "use": "앞사람 어깨 너머로 상대 얼굴을 본다. 대화의 주고받음, 위치 감각, 두 인물의 연결.", "avoid": "등을 보이는 배우가 너무 많이 보여 주의를 빼앗는 각도, 리버스에서 180도 선을 넘는 것.", "pair": "두 OTS를 번갈아 샷/리버스샷을 만들고 양쪽 크기를 맞춘다. OTS에서 싱글로 빠져나오면 장면의 전환을 알린다.", "specify": "어깨 주인과 화면 쪽(좌·우), 흐린 어깨와 뒤통수, 먼 인물의 얼굴 크기와 시선, 어깨 높이 카메라.", "vertical": "앞 어깨는 화면 아래쪽, 먼 얼굴이 높이를 더 채운다. 두 OTS를 따로 만들고 시선을 맞춘다."},
      "pov": {"label": {"ko": "1인칭 시점", "en": "Point of view"}, "use": "인물의 눈높이에서 그가 보는 것. 크기는 따로 정하고 시점은 camera.pov 기법으로도 적는다.", "avoid": "보는 사람을 앞뒤 컷에서 세우지 않은 시점 숏, 반응이 사라질 만큼 긴 시점 숏.", "pair": "보는 얼굴 → 시점 숏 → 반응 얼굴.", "specify": "누구의 눈인지, 보는 대상과 거리, 화면 아래에 걸리는 손, 걸음의 흔들림.", "vertical": "앞으로 나아가는 길·복도 시점이 세로 화면에 맞는다."},
      "back": {"label": {"ko": "뒷모습", "en": "From behind"}, "use": "뒤에서 본 인물. 얼굴을 감춰 관객이 생각을 채우게 하고 인물의 시야를 함께 본다. 시점은 camera.rear로도 적고 크기는 따로 정한다.", "avoid": "표정이 정보인 순간.", "pair": "뒤따르는 이동(camera.follow)과 함께 고르기 쉽다.", "specify": "크롭(머리·어깨/허리/전신), 인물이 향하는 대상, 뒤에서 알아볼 단서(머리·옷).", "vertical": "길·통로·복도를 따라가는 추적이 세로 화면에 맞는다."},
      "cutaway": {"label": {"ko": "컷어웨이", "en": "Cutaway"}, "use": "이어지는 행동을 끊고 다른 것을 보여 준 뒤 돌아온다. 속도 조절, 이음새 감추기, 다른 시간·장소, 코미디의 펀치라인. 듣는 사람이나 반응 같은 사람도 대상이다.", "avoid": "본 행동과 관계없는 그림.", "pair": "돌아온 원래 컷에 새 의미가 붙는다.", "specify": "무엇을, 어디서(같은 장소인지 다른 시간인지), 크기, 돌아갈 컷과 잇는 시선·소리."},
      "reaction": {"label": {"ko": "리액션 샷", "en": "Reaction shot"}, "use": "화면의 행동이나 말에 반응하는 얼굴(사람·동물). 관객이 어떻게 느낄지 정하고, 대화 리듬과 코미디 타이밍을 만든다.", "avoid": "무엇에 반응하는지 보여 주는 앞 컷 없이 홀로 둔 반응.", "pair": "자극(행동·말·본 것) → 반응. 반응 얼굴의 뜻은 앞 컷이 정한다.", "specify": "반응하는 인물, 무엇에 반응하는지(화면 밖 방향과 시선), 클립 안 표정 변화(시작 → 끝), 크기.", "vertical": "세로 화면에서는 충격의 순간 얼굴로 끊어 관객이 먼저 읽게 한다."}
    },
    "angle": {
      "ground": {"label": {"ko": "지면 높이", "en": "Ground level"}, "use": "카메라를 바닥 가까이 둔다. 발과 바닥 질감, 작은 존재의 시점, 바닥에 앉거나 쓰러진 인물. 취약함이나 긴장으로 읽힐지는 앞뒤 컷이 정한다.", "avoid": "얼굴이 정보인 컷(렌즈가 수평이면 선 사람의 얼굴은 화면 위로 나간다). 위를 똑바로 올려다보는 숏은 low로 적는다.", "specify": "렌즈가 수평인지 위로 꺾였는지, 전경의 바닥·발·물체, 얼굴이 화면에 들어오는지."},
      "over": {"label": {"ko": "어깨 너머", "en": "Over the shoulder"}, "use": "앞사람 어깨 너머의 시점. 대화의 리버스 커버리지와 두 인물의 위치 관계.", "avoid": "앵글 칸에 over를 두면 로우·하이를 함께 적을 수 없다. 높이는 eye·low·high로 고르고 어깨 너머 구성은 크기 ots나 카메라 framing에 적는 편이 낫다.", "specify": "누구의 어느 어깨인지, 누구를 보는지, 리버스에서도 같은 편."}
    },
    "depth": {
      "shallow": {"label": {"ko": "얕은 심도", "en": "Shallow focus"}, "use": "한 면만 선명하게 두어 인물이나 사물을 배경에서 떼어 낸다.", "avoid": "기본값으로 깔기(흐린 배경은 기본값이 아니다). 읽을 것이 둘이면 랙 포커스나 딥포커스.", "specify": "선명한 대상(누구의 어느 눈, 어떤 물체)과 흐려질 것, 장초점 렌즈."},
      "deep": {"label": {"ko": "딥포커스", "en": "Deep focus"}, "use": "앞과 뒤의 행동을 컷 없이 한 화면에 담아 관객이 장면을 읽게 한다.", "avoid": "볼 순서를 연출하지 않은 딥포커스. 대사·움직임·빛으로 시선 순서를 짠다.", "specify": "앞·중간·뒤 면을 풀어 쓴다(sharp focus from A in the foreground through B to C in the background), 먼저 볼 대상과 그 계기."},
      "none": {"label": {"ko": "심도 선택 없음", "en": "No depth choice"}, "use": "평면 도표·글자 판처럼 초점면이 없는 그림.", "avoid": "3D 오브젝트를 렌더하는 슬라이드(심도를 고를 수 있다).", "specify": "심도 낱말을 넣지 않는다."}
    },
    "still": {
      "focus-in": {"label": {"ko": "포커스 인", "en": "Focus in"}, "use": "인물 소개. 다가가며 배경을 흐려 얼굴로 관심을 모은다.", "avoid": "인물과 같은 거리의 사물을 다르게 흐리는 그림, 소개할 인물이 없는 컷.", "specify": "얼굴(눈) 영역, 함께 선명해야 할 같은 거리의 사물, 인물을 부르는 내레이션 시점."},
      "rack-focus": {"label": {"ko": "랙 포커스", "en": "Rack focus"}, "use": "한 대상에서 다른 대상으로 관심을 옮기고 놓친 요소를 드러낸다.", "avoid": "두 대상이 같은 거리에 있거나 관심을 옮길 계기가 없을 때.", "specify": "먼저 선명한 영역과 나중 영역, 각자의 앞뒤 거리, 옮기는 계기."},
      "approach": {"label": {"ko": "어프로치", "en": "Approach"}, "use": "단서로 천천히 다가간다. 끝에서 무언가 바뀔 때 힘이 있다.", "avoid": "목적지 없는 줌, 모든 컷에 같은 다가가기.", "specify": "단서 영역, 도착 배율(업스케일 1.5배 이하), 내레이션이 단서를 말하는 시점."},
      "pull": {"label": {"ko": "풀", "en": "Pull"}, "use": "넓어지며 장소·다른 인물·고립을 드러낸다. 장면이 끝난다는 신호.", "avoid": "넓어져도 새로 드러나는 것이 없을 때.", "specify": "시작 영역과 끝 프레임, 드러나는 것."},
      "pan": {"label": {"ko": "팬", "en": "Pan"}, "use": "한 대상에서 다른 대상으로 옮기거나 화면 밖 공간을 끌어들인다.", "avoid": "원본이 이동 방향으로 화면보다 넓지 않을 때(이동 폭이 화면의 13% 안팎에 그친다), 너무 빠른 이동.", "specify": "출발·도착 영역, 원본 비율, 도착과 내레이션의 시점."},
      "tilt": {"label": {"ko": "틸트", "en": "Tilt"}, "use": "높이를 시간으로 보여 준다. 얼굴을 늦게 드러내는 리빌. 올려다보는 쪽이 힘으로 읽힐지 취약함으로 읽힐지는 앞뒤 컷이 정한다.", "avoid": "원본에 세로 여유가 없을 때(9:16 화면이면 원본이 화면보다 길쭉해야 한다).", "specify": "아래·위 영역, 도착점에서 드러나는 것."},
      "push": {"label": {"ko": "푸시", "en": "Push"}, "use": "느린 줌인. 사진 한 장 안에서 디테일로 다가간다.", "avoid": "목적지 없는 기본 줌의 반복(클리셰). 시작과 끝 프레임을 고른다.", "specify": "줌이 끝나는 대상 영역, 움직여야 하는 이유, 끝에서 바뀌는 것."},
      "reveal": {"label": {"ko": "리빌", "en": "Reveal"}, "use": "숨겨 둔 대상을 늦게 드러낸다. 전경 레이어가 비키는 방식은 준비된 레이어가 필요하다.", "avoid": "전경 와이프의 남용, 레이어 뒤 배경의 빈틈.", "specify": "전경 레이어와 그 뒤 배경, 드러나는 대상과 시점, 빠지는 방향."},
      "parallax": {"label": {"ko": "패럴랙스", "en": "Parallax"}, "use": "평면 사진을 레이어로 나눠 입체처럼 움직인다.", "avoid": "클리셰가 되기 쉽고, 그림자가 함께 움직이지 않으면 가짜처럼 보인다. 작게 움직인다.", "specify": "레이어 목록(앞 → 뒤)과 깊이, 레이어마다 뒤 배경 채움, 작은 이동량."},
      "hold": {"label": {"ko": "정지", "en": "Hold"}, "use": "프레임을 움직이지 않고 그림 하나를 붙잡는다. 펀치라인 뒤의 정적, 읽어야 할 문서·표정, 앞뒤 이동 컷 사이의 쉼표. 뒤에 오는 작은 움직임이 커 보인다.", "avoid": "보여 줄 변화가 없는 긴 컷, 연달아 붙는 정지 컷. 길게 붙잡을 이유가 없으면 짧게 끊는다.", "specify": "붙잡을 대상(focusTo 영역이 있으면 그 자리), 붙잡는 이유, 컷 길이."}
    }
  };
  const ENTRY_PREFIX = {size:'framing.', angle:'camera.'};
  const own = (o, k) => o && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : null;
  // The card for one shot_icons value: its catalogue entry when it has one, else its VALUES card.
  function guide(attribute, value) {
    const prefix = own(ENTRY_PREFIX, attribute);
    return (prefix && own(byId, prefix + value)) || own(own(VALUES, attribute), String(value));
  }
  const NOTE_LABELS = {avoid:['피할 때','Avoid'], pair:['앞뒤 컷','Neighbours'], specify:['적을 것','Name in the prompt'], vertical:['9:16','9:16']};
  function notes(card, lang) {
    return card ? Object.keys(NOTE_LABELS).filter(key => card[key]).map(key => '<p><b>'+NOTE_LABELS[key][lang==='ko'?0:1]+'</b> '+esc(card[key])+'</p>').join('') : '';
  }
  function validate(selection) {
    if (!Array.isArray(selection)) return ['shot.techniques must be an array'];
    const errors=[],seen=new Set();
    for(const item of selection) {
      if(!item || !byId[item.id]) errors.push('Unknown technique: '+String(item?.id));
      if(seen.has(item?.id)) errors.push('Duplicate technique: '+String(item?.id));
      seen.add(item?.id);
      if(typeof item?.reason!=='string'||!item.reason.trim()) errors.push('Technique needs this shot’s reason: '+String(item?.id));
    }
    return errors;
  }
  function selected(scene) { return Array.isArray(scene.shot?.techniques) ? scene.shot.techniques.map(item=>({...item,entry:byId[item?.id]})) : []; }
  function instructions(scene) { return selected(scene).filter(item=>item.entry && ['camera','framing'].includes(item.entry.category)).map(item=>item.entry.category==='framing' ? 'Opening frame: '+item.entry.instruction+'.' : item.entry.instruction).join(' '); }
  function sourceInstructions(scene) {
    return selected(scene).filter(item=>item.entry).map(({entry, from, to}) => {
      if(entry.category === 'framing') return 'Opening frame: '+entry.instruction+'.';
      if(entry.fields.viewpoint || entry.fields.angle) return entry.instruction;
      if(entry.fields.focus === 'rack') return from && to ? 'Stage '+from+' and '+to+' at clearly different distances from the camera, '+from+' in sharp focus.'
        : 'Stage the named near and far focus targets at distinct depths; use the authored opening focus from camera.framing.';
      return '';
    }).filter(Boolean).join(' ');
  }
  function findings(scene) {
    const selection=scene.shot?.techniques;
    if(selection===undefined)return [];
    const notes=validate(selection), sh=scene.shot||{}, cam=scene.visual?.camera||{};
    const chosen=selected(scene).filter(item=>item.entry);
    const frames=chosen.filter(item=>item.entry.category==='framing');
    const viewpoints=new Set(chosen.map(item=>item.entry.fields.viewpoint).filter(Boolean));
    if(viewpoints.size>1)notes.push('Conflicting viewpoints: choose one opening viewpoint; describe a deliberate viewpoint transition in camera.end.');
    if(frames.length>1)notes.push('Multiple starting frame sizes: choose one; describe the ending crop in camera.end.');
    for(const {entry} of chosen) {
      if(entry.fields.size && sh.size!==entry.fields.size)notes.push(entry.id+' conflicts with shot.size '+String(sh.size));
      if(entry.fields.angle && sh.angle!==entry.fields.angle)notes.push(entry.id+' conflicts with shot.angle '+String(sh.angle));
      if(entry.fields.movement && !String(cam.movement||'').toLowerCase().trim().startsWith(entry.fields.movement))notes.push(entry.id+' needs camera movement '+entry.fields.movement);
    }
    if(chosen.some(x=>x.entry.id==='camera.static')&&chosen.some(x=>x.entry.fields.movement&&x.entry.id!=='camera.static'))notes.push('Static camera conflicts with a selected moving-camera technique.');
    return notes;
  }
  function icon(entry) {
    const body=entry.glyph.startsWith('<')?entry.glyph:'<path d="'+entry.glyph+'"/>';
    return '<svg viewBox="0 0 32 32" width="40" height="40" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">'+body+'</svg>';
  }
  function tiles(scene,lang) {
    const items=selected(scene);
    if(!items.length)return '';
    return '<div class="technique-tiles">'+items.map(({entry,id,reason})=>'<details class="technique-tile"><summary>'+(entry?icon(entry):'')+'<span>'+esc(entry?.label[lang]||entry?.label.en||id)+'</span></summary><p>'+esc(reason)+'</p><p>'+esc(entry?.use||'Unknown technique')+'</p>'+notes(entry,lang)+'<p lang="en">'+esc(entry?.instruction||'')+'</p><small>'+esc(id)+'</small></details>').join('')+'</div>';
  }
  function legend(lang) {
    return '<details class="technique-library"><summary>'+ (lang==='ko'?'기법 사전 · 아이콘과 선택 기준':'Technique catalogue · icons and selection guidance')+'</summary><p>'+(lang==='ko'?'장면의 정보와 행동을 먼저 정한 뒤 기법을 고르세요. 아이콘은 계획을 설명하며 실제 영상 검증을 뜻하지 않습니다. 쓰임은 현업이 기대는 관례입니다. 카메라 이동의 정서 효과는 실험으로 확인되지 않았고, 앵글 효과(로우는 세 보이고 하이는 약해 보인다)는 사진을 이야기 순서로 볼 때만 나타났습니다.':'Choose from the scene’s information and action. Icons describe a plan, not verified footage. Uses are practitioners’ conventions: no experiment shows a camera move’s emotional effect, and the angle effects (low reads strong, high reads weak) appeared only when the pictures ran as a story.')+'</p>'+['character','camera','framing','timing'].map(category=>'<h3>'+(lang==='ko'?{character:'캐릭터 참조',camera:'카메라 기법',framing:'프레임 크기',timing:'컷 시간'}[category]:{character:'Character references',camera:'Camera techniques',framing:'Frame sizes',timing:'Cut timing'}[category])+'</h3><div class="technique-tiles">'+entries.filter(e=>e.category===category).map(e=>'<details class="technique-tile"><summary>'+icon(e)+'<span>'+esc(e.label[lang]||e.label.en)+'</span></summary><p>'+esc(e.use)+'</p>'+notes(e,lang)+'<p lang="en">'+esc(e.instruction)+'</p><small>'+esc(e.id)+'</small></details>').join('')+'</div>').join('')+'</details>';
  }
  const api={VERSION,entries,byId,VALUES,guide,SIZE_WORDS,SIZE_GLYPHS,validate,selected,instructions,sourceInstructions,findings,icon,tiles,legend};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.FILM_TECHNIQUES=api;
})(typeof window==='object'?window:globalThis);
