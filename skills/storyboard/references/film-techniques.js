/* Shared semantic technique catalogue. Icons explain plans; they never certify media. */
(function (root) {
  'use strict';
  const VERSION = 'film-techniques-v1';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const entries = [];
  function add(id, category, ko, en, use, instruction, glyph, fields = {}) {
    entries.push({ id, category, label: { ko, en }, use, instruction, glyph, fields });
  }
  const camera = 'M3 12h10v8H3zM13 14l5-3v10l-5-3';
  const person = 'M23 7a3 3 0 1 0 .01 0M23 13v10m-4-7h8m-4 7-3 5m3-5 3 5';
  add('camera.static','camera','고정','Static','연기·대상 변화 자체에 집중한다.','Keep camera position, angle and focal length fixed.',camera+'M8 20v9m-4 0 4-9 4 9',{movement:'static'});
  add('camera.dolly-in','camera','달리 인','Dolly in','깨달음이나 대상에 다가가는 경험을 보여 준다.','Move physically toward the subject; specify the starting crop and closer ending crop.',camera+'M19 26h10m-4-4 4 4-4 4',{movement:'dolly in'});
  add('camera.dolly-out','camera','달리 아웃','Dolly out','주변 맥락을 공개하거나 인물에게서 거리를 둔다.','Move physically away; name what enters the wider ending frame.',camera+'M29 26H19m4-4-4 4 4 4',{movement:'dolly out'});
  add('camera.slow-zoom-in','camera','슬로 줌 인','Slow zoom in','같은 시점에서 대상을 확대하며 긴장을 만든다.','Keep camera position fixed and narrow field of view slowly; perspective stays unchanged.','M3 3h26v26H3zM10 10h12v12H10zM4 4l6 6m16-6-4 6',{movement:'zoom in',speed:'slow'});
  add('camera.arc','camera','아크 샷','Arc shot','인물 주변 공간이나 첫 등장을 보여 준다.','Travel on a curved path around the subject; name the arc direction and endpoint.',person+'M6 24C-2 4 30 1 29 22m-5-3 5 3 1-6',{movement:'arc shot'});
  add('camera.follow','camera','팔로우 샷','Follow shot','인물을 따라 공간에 들어가거나 추격한다.','Follow behind the subject; preserve the planned gap and screen direction.',camera+'M23 3v8m-3-3 3 3 3-3M23 23v7',{movement:'tracking from behind'});
  add('camera.reverse-tracking','camera','리버스 트래킹','Reverse tracking','걷는 인물의 얼굴과 대화를 계속 보여 준다.','Retreat in front of the walking subject, facing them and maintaining distance.',camera+'M23 11V3m-3 3 3-3 3 3M23 23v7',{movement:'tracking backward in front of the subject'});
  add('camera.handheld','camera','핸드헬드','Handheld','현장감이나 불안한 관찰을 표현한다.','Use low-amplitude operated-camera sway; specify intensity.','M5 8l20-2 2 17-20 2zM2 2l2 2m24 24 2 2M12 12l8 4-8 4z',{movement:'handheld'});
  add('camera.whip-pan','camera','휩 팬','Whip pan','시선을 급히 돌려 두 대상을 연결한다.','Pan rapidly from the named first subject and settle on the named second subject.','M3 8h15M3 14h20M3 20h26m-6-6 6 6-6 6',{movement:'whip pan',speed:'fast'});
  add('camera.crane-up','camera','크레인 업','Crane up','장면을 닫거나 위쪽 공간을 공개한다.','Raise the camera; explicitly describe whether its look direction stays level or tilts.',camera+'M24 28V4m-4 4 4-4 4 4',{movement:'crane up'});
  add('camera.snorricam','camera','스노리캠','Snorricam','패닉 등 인물에 붙은 주관적 경험을 보여 준다.','Camera is rigidly mounted to the torso facing the face; face stays fixed in frame while background moves.','M16 2a5 5 0 1 0 .01 0M7 28v-9h18v9M11 19v-5h10v5M2 8l3-3m22 3 3-3',{movement:'handheld body-mounted facing the subject'});
  add('camera.push-past','camera','푸시 패스트','Push past','전경을 지나 숨겨진 공간을 공개한다.','Travel past the named foreground object or through an open doorway to a specified landing view.','M3 29V3h16v26M10 25l18-14m-7 0h7v7',{movement:'dolly in past foreground'});
  add('camera.rear','camera','리어 샷','Rear shot','얼굴을 숨기고 관객이 반응을 상상하게 한다.','View the subject from behind; describe the crop separately.','M16 3a6 6 0 1 0 .01 0M4 29v-7q12-12 24 0v7M13 7h6',{viewpoint:'rear'});
  add('camera.low','camera','로우 앵글','Low angle','아래에서 인물이나 물체의 높이를 강조한다.','Place camera below the subject looking upward; movement is a separate choice.','M3 26h8v4H3zM12 24 25 9m-7 2 7-2-1 7M24 4v24',{angle:'low'});
  add('camera.high','camera','하이 앵글','High angle','인물과 주변 공간을 내려다본다.','Place camera above the subject looking down; movement is a separate choice.','M3 2h8v4H3zM12 8l13 15m-7-2 7 2-1-7M24 4v24',{angle:'high'});
  add('camera.overhead','camera','오버헤드','Overhead','동선과 위치 관계를 수직 시점으로 보여 준다.','Look straight down at ninety degrees; name the readable floor layout.','M12 2h8v5h-8zM16 8v10m-4-4 4 4 4-4M3 25q13-10 26 0-13 10-26 0z',{angle:'overhead'});
  add('camera.dutch','camera','더치 앵글','Dutch angle','의도적인 불균형을 표현한다.','Tilt the horizon by the chosen angle; describe why this imbalance matters.','M3 10 25 3l6 20-22 7zM8 20l16-5',{angle:'dutch'});
  add('camera.dolly-zoom','camera','돌리 줌','Dolly zoom','인물 크기를 유지하며 배경 원근의 변화를 보여 준다.','Coordinate dolly and opposite zoom; explicitly choose in or out and hold subject screen size.','M3 4h26v24H3zM10 9h12v14H10zM1 16h8m-3-3 3 3-3 3M31 16h-8m3-3-3 3 3 3',{movement:'dolly zoom'});
  add('camera.rack-focus','camera','랙 포커스','Rack focus','서로 다른 거리의 대상 사이로 관심을 옮긴다.','Shift sharp focus from the named near subject to the named far subject, or reverse; specify both endpoints.','M3 18a7 7 0 1 0 .01 0M22 5a4 4 0 1 0 .01 0M12 14l9-5m-6 0h6v6',{focus:'rack'});
  add('camera.side-tracking','camera','사이드 트래킹','Side tracking','인물 옆에서 이동의 리듬을 보여 준다.','Move parallel beside the subject, matching speed and preserving the side view.',camera+'M3 27h26m-4-4 4 4-4 4M23 4v14',{movement:'truck parallel to the subject'});
  add('camera.pov','camera','1인칭 시점','First-person POV','관객이 인물의 눈으로 행동을 경험하게 한다.','View from the character eyes; describe visible hands and crop when needed.','M4 10V4h6M22 4h6v6M28 22v6h-6M10 28H4v-6M12 16h8M16 12v8',{viewpoint:'pov'});
  add('camera.drone-pullback','camera','드론 풀백','Drone pullback','후퇴와 상승으로 장소의 규모를 공개한다.','Travel backward and upward together; name the revealed space and final scale.','M12 10h8v8h-8zM4 5h7M21 5h7M8 5l4 5m8 0 4-5M5 27 27 5m-8 0h8v8',{movement:'aerial backward and upward'});
  add('camera.pan-left','camera','왼쪽 팬','Pan left','왼쪽 대상을 공개한다.','Rotate left in place from one named target to another.',camera+'M29 27H3m5-4-5 4 5 4',{movement:'pan left'});
  add('camera.pan-right','camera','오른쪽 팬','Pan right','오른쪽 대상을 공개한다.','Rotate right in place from one named target to another.',camera+'M3 27h26m-5-4 5 4-5 4',{movement:'pan right'});
  add('camera.tilt-up','camera','틸트 업','Tilt up','위쪽 대상을 공개한다.','Tilt upward from the starting target to the ending target.','M4 16h10v8H4zM22 28V4m-5 5 5-5 5 5M3 29h12',{movement:'tilt up'});
  add('camera.tilt-down','camera','틸트 다운','Tilt down','아래쪽 대상을 공개한다.','Tilt downward from the starting target to the ending target.','M4 4h10v8H4zM22 4v24m-5-5 5 5 5-5M3 29h12',{movement:'tilt down'});
  add('camera.eye','camera','눈높이','Eye level','인물과 같은 높이에서 관찰한다.','Keep the lens at the subject eye height.',camera+'M19 12h10M23 4v24',{angle:'eye'});
  const sizes = [
    ['els','익스트림 롱샷','Extreme long shot','공간·고립·규모','extreme long shot, subject tiny in the environment',9],
    ['ls','롱샷','Long shot','장소와 인물 위치','wide shot, full body with room above and below',21],
    ['fs','풀샷','Full shot','전신 동작·의상','full shot, head to toe',28],
    ['mfs','미디엄 풀샷','Medium full shot','허리 주변 행동·대치','medium full shot, frame bottom at mid-thigh',37],
    ['ms','미디엄 샷','Medium shot','대화·상체 행동','medium shot, waist up',44],
    ['mcu','미디엄 클로즈업','Medium close-up','대사·표정','medium close-up, chest up',56],
    ['cu','클로즈업','Close-up','얼굴의 반응','close-up, face and shoulders',75],
    ['choker','빅 클로즈업','Big close-up','얼굴의 미세한 변화','tight close-up, forehead to chin',110],
    ['ecu','익스트림 클로즈업','Extreme close-up','눈·입 등 세부','extreme close-up, a named detail fills the frame',180]
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
  const timing=[['insert','인서트 시간','Insert timing','단서·사물 확인','Start around 3–4 seconds; measure actual reading/action time.','M3 8h26v16H3zM11 12h10v8H11z'],['action','행동 시간','Action timing','이동·접촉·도착','Start around 5–7 seconds; preserve anticipation, action and response.','M3 24l8-12 7 8 11-15M3 29h26'],['dialogue','대사·감정 시간','Dialogue timing','말과 표정의 변화','Start around 7–10 seconds, then use measured speech and reaction time.','M3 4h26v18H13l-6 7v-7H3zM8 10h16M8 16h10'],['establishing','공간 소개 시간','Establishing timing','장소와 위치를 읽는 시간','Start around 5–8 seconds; allow the viewer to recognize spatial relationships.','M3 27V12l13-9 13 9v15zM12 27V16h8v11'],['long-take','롱테이크 시간','Long-take timing','연속 시간 자체가 필요한 장면','Ten seconds or longer only when motivated; verify complete movement, model limits and action coverage.','M2 16h28M3 10v12m6-12v12m6-12v12m6-12v12m6-12v12']];
  for(const [key,ko,en,use,instruction,glyph] of timing) add('timing.'+key,'timing',ko,en,use,instruction,glyph,{timing:key});
  const byId = Object.assign(Object.create(null), Object.fromEntries(entries.map(entry=>[entry.id,entry])));
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
    return selected(scene).filter(item=>item.entry).map(({entry}) => {
      if(entry.category === 'framing') return 'Opening frame: '+entry.instruction+'.';
      if(entry.fields.viewpoint || entry.fields.angle) return entry.instruction;
      if(entry.fields.focus === 'rack') return 'Stage the named near and far focus targets at distinct depths; use the authored opening focus from camera.framing.';
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
    return '<div class="technique-tiles">'+items.map(({entry,id,reason})=>'<details class="technique-tile"><summary>'+(entry?icon(entry):'')+'<span>'+esc(entry?.label[lang]||entry?.label.en||id)+'</span></summary><p>'+esc(reason)+'</p><p>'+esc(entry?.use||'Unknown technique')+'</p><p lang="en">'+esc(entry?.instruction||'')+'</p><small>'+esc(id)+'</small></details>').join('')+'</div>';
  }
  function legend(lang) {
    return '<details class="technique-library"><summary>'+ (lang==='ko'?'기법 사전 · 아이콘과 선택 기준':'Technique catalogue · icons and selection guidance')+'</summary><p>'+(lang==='ko'?'장면의 정보와 행동을 먼저 정한 뒤 기법을 고르세요. 아이콘은 계획을 설명하며 실제 영상 검증을 뜻하지 않습니다.':'Choose from the scene’s information and action. Icons describe a plan, not verified footage.')+'</p>'+['character','camera','framing','timing'].map(category=>'<h3>'+(lang==='ko'?{character:'캐릭터 참조',camera:'카메라 기법',framing:'프레임 크기',timing:'컷 시간'}[category]:{character:'Character references',camera:'Camera techniques',framing:'Frame sizes',timing:'Cut timing'}[category])+'</h3><div class="technique-tiles">'+entries.filter(e=>e.category===category).map(e=>'<details class="technique-tile"><summary>'+icon(e)+'<span>'+esc(e.label[lang]||e.label.en)+'</span></summary><p>'+esc(e.use)+'</p><p lang="en">'+esc(e.instruction)+'</p><small>'+esc(e.id)+'</small></details>').join('')+'</div>').join('')+'</details>';
  }
  const api={VERSION,entries,byId,SIZE_WORDS,SIZE_GLYPHS,validate,selected,instructions,sourceInstructions,findings,icon,tiles,legend};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.FILM_TECHNIQUES=api;
})(typeof window==='object'?window:globalThis);
