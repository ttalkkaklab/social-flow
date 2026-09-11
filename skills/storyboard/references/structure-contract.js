/*
 * structure-contract.js — the sequence → scene → shot contract (`window.STRUCTURE`).
 *
 * One home for the three grammar units, read by check-scenes.js (node), the approval page
 * (browser) and the MCP server (createRequire at runtime), the way render-routing.js and
 * production-mode.js are shared. No clocks, no I/O.
 *
 *   window.STRUCTURE = {
 *     version: "structure-v1",
 *     sequences: [{ id, title, purpose, question, payoff, scenes: [no, …] }],
 *     scenes:    [{ no, place, time, event, charge: { open, close }, turn, out }]
 *   };
 *
 * `SCENES[]` stays flat — produce reads it by index. Each shot points at its scene with
 * `scene`; `sceneSlug` ("place / time") and `sequence` (the owning sequence's title, written
 * only when the board has two or more sequences) are derived by `sync()` and only checked here.
 *
 * Why these fields, in one line each (scenes-schema.md §structure has the long form and the
 * cut test — a scene breaks when the place changes, the time breaks, or the value turned and a
 * second event begins; never for a slide, a chart or a new subject):
 *   sequence.purpose   — one purpose per sequence, written as its tension (Frank Daniel: a
 *                        sequence is a mini-movie with its own question and resolution)
 *   sequence.question  — the question the sequence's later scenes hold open; `payoff` names
 *                        the scene where the answer completes (never the first)
 *   scene.place/time   — the slugline: one place, one continuous stretch of time (a span for a
 *                        repeated action); an explanation screen is a shot of the story scene
 *   scene.event        — the one thing that happens — one subject, one verb, on screen
 *   scene.charge       — the value at the open and at the close; equal at both ends is a
 *                        nonevent (McKee) unless the close goes deeper ("++" / "--")
 *   scene.turn         — the value that flipped, in other words than the event
 *   scene.out          — the last sentence the scene's last shot says, verbatim — the one that
 *                        forces a "그런데" or "그래서" into the next scene (scenario-craft §13);
 *                        on the last scene, the hand-back to the cover
 */
(function (root) {
  'use strict';

  const VERSION = 'structure-v1';
  const CHARGES_OPEN = ['+', '-'];
  const CHARGES_CLOSE = ['+', '-', '++', '--'];
  const SIZES = ['els', 'ls', 'ws', 'fs', 'mfs', 'ms', 'mcu', 'cu', 'choker', 'ecu', 'insert',
                 'two', 'three', 'ots', 'pov', 'back', 'cutaway', 'reaction'];
  const ANGLES = ['eye', 'low', 'high', 'dutch', 'overhead', 'ground', 'over'];
  const TYPES = ['cover', 'hooking', 'points', 'quote', 'broll', 'outro'];
  const BEATS = ['hook', 'hooking', 'drip', 'result', 'body', 'turn', 'cta'];
  const INFO_TYPES = ['other', 'timeline', 'statistic', 'principle'];
  const SHARE_TYPES = ['fact', 'verdict', 'line', 'checklist', 'none'];
  const HOOK_TYPES = ['fear', 'empathy', 'curiosity', 'spoiler'];
  const HOOK_FORMS = ['paradox', 'gap', 'payoff', 'identify', 'number', 'secret'];
  const ARCS = ['answer-first', 'story'];
  const RENDER_MODES = ['still_camera', 'character_html', 'object_html', 'data_graph', 'generated_video', 'editorial_html'];
  const TRANSITION_RE = /^(jcut|cut|dissolve|dip|dip:white|iris|blur|zoom|push:(l2r|r2l|u2d|d2u)|whip:(l2r|r2l|u2d|d2u))$/;
  /* Shots that sit in the playback line and belong to a scene. broll is spliced by `after`
     and the outro is the shared asset — neither is a shot in a scene. */
  const PLACED = s => s && s.type !== 'broll' && s.type !== 'outro';

  const text = v => typeof v === 'string' && v.trim().length > 0;
  const posInt = v => Number.isInteger(v) && v > 0;
  const compact = v => String(v == null ? '' : v).replace(/\s+/g, '');
  const bare = v => compact(v).replace(/[\p{P}\p{S}]/gu, '');
  const slugOf = sc => sc.place.trim() + ' / ' + sc.time.trim();
  /* A wide sets the place, a close pays the moment — coverage is one of each (directing-grammar §6.1–2). */
  const WIDE = ['els', 'ls', 'ws', 'fs', 'mfs'];
  const CLOSE = ['mcu', 'cu', 'choker', 'ecu', 'insert'];
  /* A place that names a picture — the scene is where the story is, the diagram is one of its shots. */
  const SCREEN_RE = /도해|그래픽|슬라이드|차트|그래프|도표|인포그래픽|diagram|slide|chart|graph|infographic/i;
  /* Predicates that say what the viewer learns, not what happens. */
  const SUMMARY_RE = /(드러난다|드러남|밝혀진다|밝혀짐|밝힌다|알게\s?된다|알려\s?준다|설명한다|설명된다|소개한다|정리한다|정리된다|보여\s?준다|보여진다|확인한다|확인된다|알아챈다|전달한다|말해\s?준다|제시한다|비교한다|비교된다|풀린다|해석한다|재해석한다|이해한다|깨닫는다|파악한다|짚는다|나타난다|짚어\s?본다|살펴본다|다룬다|잇는다|엮는다|연결한다|연결된다|실행한다|수행한다|진행한다|마무리한다|챙긴다|던진다|따라간다|훑는다|짚어\s?간다|밟아\s?간다|쫓는다|들여다본다|담는다|담아낸다|그린다|그려낸다|풀어낸다)[.!?…]*$/;
  /* A studio is a place only when the whole board lives there. */
  const STUDIO_RE = /스튜디오|studio/i;
  /* The sign of a feel — the lexicon is small on purpose; a word on neither list is neutral and skipped. */
  const NEG_RE = /불안|의아|당혹|당황|걱정|막막|두려|무서|허탈|조급|긴장|의심|체념|충격|답답|초조|겁|슬픔|슬프|짜증|분노|화남|경계|무거|씁쓸|혼란|아쉬|서운|억울|위기|절망|공포|찜찜|불편|불쾌|찝찝|막힘|위태|반대|거부|물러서지\s?않|가라앉지\s?않|짐을\s?더|무겁|쌓이|후회|손해|모자라|부족|고통|아픔|괴로|위험|허탈|막막|서러|설움|확실하지\s?않|확실치|모르겠|찜찜|머뭇|망설|찌뿌둥|멍함|멍하/;
  const POS_RE = /안심|안도|반가|짜릿|뭉클|뿌듯|든든|홀가분|상쾌|기대|희망|만족|확신|신기|통쾌|웃음|재미|감탄|이해|개운|따뜻|편안|후련|기쁨|기쁘|즐거|설렘|설레|자신감|해방|시원|감동|여유|느긋|담담|멀쩡|괜찮/;
  const signRaw = t => { if (NEG_RE.test(t) && !POS_RE.test(t)) return '-'; if (POS_RE.test(t) && !NEG_RE.test(t)) return '+'; return ''; };
  // A feel is "머리말 — 풀이": the head is the value, the tail explains it and may name the opposite pole.
  const signOf = v => { const t = String(v || ''); const head = t.split(/\s[—–-]\s|—/)[0]; return signRaw(head) || signRaw(t); };
  /* A span in the narration that a single-moment `time` does not cover. */
  const SPAN_RE = /내내|동안|마다|해마다|매일|매번|날마다|밤마다|주째|년째|달째|주간|년간/;
  const MOMENT_RE = /^(낮|밤|새벽|아침|저녁|오후|오전|정오|자정|한낮|해질녘|해 질 녘)(\s?\d{1,2}\s?시(\s?\d{1,2}\s?분)?)?$/;
  /* Two actions chained into one event. */
  // -고 is a connective unless the word is a noun that ends in 고 (냉장고 · 창고 · 광고 · 보고 · 참고 · 재고 · 금고 · 원고 · 경고 · 최고).
  const CHAIN_RE = /([가-힣](?<!냉장|창|광|보|참|재|금|원|경|최|신|제|출|예|선|피|친|물|연|그리|고)고|고서|고\s나서|한\s뒤|[가-힣]며|면서(까지|도)?|다가|아서|어서|해서|서서|[가-힣](?<!이|오|피|손|항|바|여|년|올|작|내|금|후|십|해|건|방|기|화|멀쩡|괜찮|깨끗|조용|따뜻|시원|비슷|똑같|중요|필요|가능|간단|복잡|편|불편|이상|당연|충분|분명|확실|정확|심각|위험|안전|건강|행복|답답|막막|허탈|당황|든든|뿌듯|무|미안|고마|미묘|애매)해)\s/;
  const PARALLEL_RE = /[가-힣]+도\s[가-힣]+도\s/;
  const PAIR_OBJ_RE = /[가-힣]+[와과]\s[가-힣\s]{1,20}[을를]\s/;
  const INFO_DELIVERY_RE = /(설명|확인|소개|정리|보여\s?주|보여준|전달|알려\s?주|알려준|제시|비교|마무리|실행|수행|강조|안내)[가-힣]*(는|다는|ㄴ다는)\s?(것|사실|점|내용)[.!?…]*$/;
  const TIGHT_LAYOUT_RE = /상반신|얼굴|표정|클로즈|눈동자|입가|가슴\s?위/;
  const ENUM_RE = /^(첫|두|세|네|다섯|여섯|일곱|여덟|아홉|열)\s?번째|^(마지막|다음|끝으로|셋째|넷째|둘째)[은는으]/;
  const ASKED_RE = /\?|까요|나요|[을일ㄹ]까(?![^\s.!?,]*[지고])|까\s?싶|냐고|냐는|는지\b|을지\b|죠\s?\?/;
  const UMBRELLA_RE = /^(집|집\s?안|실내|실외|야외|바깥|현장|사무실|회사|학교|건물|도시|서울|마을|동네|나라|세상|어딘가|공간|매장|매장\s?안|가게|가게\s?안|방\s?안|편의점\s?(매장\s?)?안|[가-힣]+\s?겸\s?[가-힣]+)$/;
  const ELAPSED_RE = /(뒤|후|지나|만에|이튿날|다음\s?날|째)/; const ELAPSED_CUE_RE = /날짜|달력|캘린더|시계|자막|카드|먼지|쌓인|바랜|시든|자란|변한|낡은|줄어든|늘어난|뒤|후/;
  const PERSON_RE = /사람|인물|손님|남자|여자|아이|소년|소녀|남성|여성|주인|점원|딸깍맨|로봇|세종|신하|백성|화자|리더|팀원|직원|얼굴|손이|손을|손과/;
  const ASK_RE = /왜|어떻게|언제|어디|무엇|뭘|뭐|누가|누구|얼마나|어느|어떤/g;
  const CAMERA_RE = /(카메라|렌즈|화면)[^,.·]*?(향해|향한|향하|향함|바라봄|바라보\S*|보며|보고|본다|주시)|정면[을으]?로?\s?(향해|향한|향함|바라봄|바라보\S*|본다)/g;
  const MEASURE_RE = /\d+(\.\d+)?\s?(%|퍼센트|배|명|건|원|분|초|시간|킬로|kg|그램|g|미터|m|도|개|년|배)/;
  const NIGHT_RE = /밤|새벽|저녁|자정|해\s?질/; const NIGHT_CUE_RE = /스탠드|조명|불빛|어두|깜깜|커튼|창밖|시계|달빛|취침|잠들|불을\s?끄|불이\s?꺼|밤|저녁|새벽/;
  const MORNING_RE = /아침|오전|낮|정오|한낮/; const MORNING_CUE_RE = /햇살|햇빛|아침|창으로\s?든|커튼\s?사이|알람|시계|낮|밝은|환한/;
  const EXPLAIN_MODES = ['data_graph', 'editorial_html', 'object_html', 'character_html'];
  const NO_PERSON_RE = /(인물|사람)\s?(없음|없는|없이|은\s?없|이\s?없)/g;
  const GAZE_RE = /[을를]\s?(향해|향한|향하|보며|보고|바라보|마주|쳐다보|올려다보|내려다보)|바라봄|마주\s?봄|주시/;
  const grams = v => { const c = bare(v); const g = new Set(); for (let i = 0; i < c.length - 1; i++) g.add(c.slice(i, i + 2)); return g; };
  /** Share of the smaller string's character bigrams found in the other — 1 means one contains the other. */
  function overlap(a, b) {
    const A = grams(a), B = grams(b);
    if (!A.size || !B.size) { const x = bare(a), y = bare(b); return x && y && (x.indexOf(y) !== -1 || y.indexOf(x) !== -1) ? 1 : 0; }
    let n = 0;
    A.forEach(x => { if (B.has(x)) n++; });
    return n / Math.min(A.size, B.size);
  }

  function ownerOf(structure, no) {
    return (structure.sequences || []).find(q => Array.isArray(q.scenes) && q.scenes.indexOf(no) !== -1) || null;
  }

  /** Structural findings — [{ level: 'bad' | 'warn', where, what }]. */
  function check(win) {
    const out = [];
    const bad = (where, what) => out.push({ level: 'bad', where, what });
    const warn = (where, what) => out.push({ level: 'warn', where, what });
    const shots = Array.isArray(win.SCENES) ? win.SCENES : [];
    const placed = shots.map((s, i) => ({ s, no: i + 1 })).filter(x => PLACED(x.s));
    const st = win.STRUCTURE;

    if (st === undefined) {
      warn('structure', 'no window.STRUCTURE — sequences and scenes are labels on shots only. New boards write it (scenes-schema §structure); storyboard_apply writes it for you');
      return out;
    }
    if (!st || typeof st !== 'object' || Array.isArray(st)) { bad('structure', 'window.STRUCTURE is not an object'); return out; }
    if (st.version !== VERSION) bad('structure', `STRUCTURE.version must be "${VERSION}"`);
    if (!Array.isArray(st.scenes) || !st.scenes.length) { bad('structure', 'STRUCTURE.scenes is empty — a board has at least one scene'); return out; }
    if (!Array.isArray(st.sequences) || !st.sequences.length) { bad('structure', 'STRUCTURE.sequences is empty — a board has at least one sequence, even when it has only one'); return out; }

    // ── scenes ──
    const byNo = new Map();
    st.scenes.forEach((sc, i) => {
      const where = 'scene ' + (sc && posInt(sc.no) ? sc.no : '#' + (i + 1));
      if (!sc || typeof sc !== 'object') { bad(where, 'a scene is an object'); return; }
      if (!posInt(sc.no)) bad(where, 'scene.no is a positive integer');
      else if (byNo.has(sc.no)) bad(where, 'scene.no repeats — one number, one scene');
      else byNo.set(sc.no, sc);
      if (!text(sc.place)) bad(where, 'scene.place is empty — one place (the slugline\'s location)');
      if (!text(sc.time)) bad(where, 'scene.time is empty — one continuous stretch of time (낮 · 밤 · 새벽 …)');
      if (!text(sc.event)) bad(where, 'scene.event is empty — the one thing that happens in this scene');
      const ch = sc.charge;
      if (!ch || typeof ch !== 'object') bad(where, 'scene.charge {open, close} names the value at both ends (+ / −)');
      else {
        if (CHARGES_OPEN.indexOf(ch.open) === -1) bad(where, 'scene.charge.open is "+" or "-"');
        if (CHARGES_CLOSE.indexOf(ch.close) === -1) bad(where, 'scene.charge.close is "+", "-", "++" (deeper into +) or "--" (deeper into −)');
        else if (ch.open === ch.close)
          warn(where, `charge ${ch.open} → ${ch.close}: the same value at both ends is a nonevent — flip it, deepen it ("${ch.open}${ch.open}"), or fold this scene into another (scenario-craft §2)`);
      }
      if (!text(sc.turn)) bad(where, 'scene.turn is empty — say what flipped between the open and the close');
      if (sc.out !== undefined && !text(sc.out)) bad(where, 'scene.out, when written, is the sentence the scene goes out on');
      if (text(sc.place) && SCREEN_RE.test(sc.place))
        warn(where, `place "${sc.place.trim()}" names a picture — a diagram, chart or slide is a shot inside the scene of the story it explains, not a place of its own (scenes-schema §structure)`);
      if (text(sc.event) && SUMMARY_RE.test(sc.event.trim()))
        warn(where, `event "${sc.event.trim()}" says what the viewer learns, not what happens — one subject, one verb, something that happens on screen (리더가 셋을 소집한다)`);
      else if (text(sc.event) && CHAIN_RE.test(sc.event) && bare(sc.event).length >= 18)
        warn(where, 'event chains two actions — one subject, one verb; the second action is the next scene when the value turned there, or a shot of this scene when it did not');
      if (text(sc.turn) && text(sc.event) && overlap(sc.turn, sc.event) >= 0.6)
        warn(where, 'turn repeats event — turn names the value that flipped (모른다 → 안다 · 불안 → 안심), in different words from the event');
      else if (text(sc.turn) && SUMMARY_RE.test(sc.turn.trim()))
        warn(where, `turn "${sc.turn.trim()}" ends on an awareness verb — name the value that flipped, not that something was revealed`);
    });
    if (st.scenes.length >= 3 && st.scenes.every(sc => sc && sc.charge && typeof sc.charge === 'object')) {
      const tally = new Map();
      st.scenes.forEach(sc => { const k = sc.charge.open + '→' + sc.charge.close; tally.set(k, (tally.get(k) || 0) + 1); });
      const [topK, topN] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
      if (topN === st.scenes.length || (st.scenes.length >= 4 && topN * 3 >= st.scenes.length * 2))
        warn('structure', `${topN} of ${st.scenes.length} scenes turn ${topK} — a metronome; the swing changes size and direction from scene to scene (scenario-craft §2)`);
    }
    const studio = st.scenes.filter(sc => sc && text(sc.place) && STUDIO_RE.test(sc.place));
    if (studio.length && studio.length < st.scenes.filter(sc => sc && text(sc.place)).length)
      studio.forEach(sc => warn('scene ' + sc.no, `place "${sc.place.trim()}" is a studio while other scenes have real places — an explanation stretch is anchored to a real place its facts live in (the label on the shelf, the lab bench, the counter) or to the scene it explains; a studio is a place only when the whole board lives there (scenes-schema §structure rule 2)`));

    // ── sequences ──
    const ids = new Set();
    const owned = new Map();
    const order = [];
    st.sequences.forEach((q, i) => {
      const where = 'sequence ' + (q && text(q.id) ? q.id : '#' + (i + 1));
      if (!q || typeof q !== 'object') { bad(where, 'a sequence is an object'); return; }
      if (!text(q.id)) bad(where, 'sequence.id is empty');
      else if (ids.has(q.id)) bad(where, 'sequence.id repeats');
      else ids.add(q.id);
      if (!text(q.title)) bad(where, 'sequence.title is empty — the heading the approval page draws');
      else if (st.sequences.some((o, j) => j !== i && o && compact(o.title) === compact(q.title)))
        warn(where, `sequence.title "${q.title.trim()}" repeats another sequence's — the shot label \`sequence\` and the approval page find a sequence by its title, so two alike draw the wrong purpose`);
      if (!text(q.purpose)) bad(where, 'sequence.purpose is empty — one purpose binds its scenes; two purposes are two sequences');
      else if (SUMMARY_RE.test(q.purpose.trim()))
        warn(where, `purpose "${q.purpose.trim()}" says what the viewer learns — write the tension the stretch carries (셋을 한 팀으로 만든다), not a delivery`);
      else if (text(q.question) && overlap(q.purpose, q.question) >= 0.6)
        warn(where, 'purpose repeats question with the ending changed — purpose is what the stretch does, question is what it holds open');
      else if (CHAIN_RE.test(q.purpose) && bare(q.purpose).length >= 18)
        warn(where, 'purpose chains two actions — one main verb; what the stretch does is one movement (반대를 딛고 낸다 is 세상에 낸다, the 딛고 is a scene)');
      else if (PAIR_OBJ_RE.test(q.purpose))
        warn(where, `purpose "${q.purpose.trim()}" binds two objects with 와/과 — two things to deliver are two purposes; write the one value the stretch moves (rule 8, P0-4)`);
      if (q.question !== undefined && !text(q.question)) bad(where, 'sequence.question, when written, is the dramatic question this stretch opens');
      else if (text(q.question) && ((q.question.match(ASK_RE) || []).length >= 2 || CHAIN_RE.test(q.question) || PARALLEL_RE.test(q.question)))
        warn(where, `question "${q.question.trim()}" asks two things — a sequence holds one question open and pays one; the other half is a second sequence's question, or a shot's info`);
      if (!Array.isArray(q.scenes) || !q.scenes.length) { bad(where, 'sequence.scenes lists the scene numbers it binds, in playback order'); return; }
      q.scenes.forEach(no => {
        if (!byNo.has(no)) bad(where, `sequence.scenes names scene ${no}, which STRUCTURE.scenes does not define`);
        else if (owned.has(no)) bad(where, `scene ${no} is in two sequences — a scene belongs to one`);
        else owned.set(no, q);
        order.push(no);
      });
      if (q.payoff !== undefined) {
        if (!posInt(q.payoff)) bad(where, 'sequence.payoff is the number of the scene that answers the question');
        else if (q.scenes.indexOf(q.payoff) === -1) bad(where, `sequence.payoff names scene ${q.payoff}, which is outside this sequence`);
      }
      if (text(q.question) && q.payoff === undefined)
        warn(where, 'sequence.question opened with no payoff scene — every loop names its payer (scenario-craft §5)');
      if (posInt(q.payoff) && q.scenes.length >= 2 && q.payoff === q.scenes[0])
        warn(where, `payoff is scene ${q.payoff}, the sequence's first — a question answered on arrival is the cover's hook, not this sequence's; the sequence question is the one its later scenes pay`);
      if (st.sequences.length >= 2 && q.scenes.length === 1)
        warn(where, 'one scene — a sequence is scenes bound by one purpose; a single scene is a scene of its neighbour\'s sequence, or the sequence is missing its other scenes');
      if (text(q.question)) {
        const spoken = placed.filter(x => q.scenes.indexOf(x.s.scene) !== -1)
          .map(x => (x.s.narration || []).map(seg => seg && (seg.tts || seg.sub) || '').join(' ')).join(' ');
        if (spoken && overlap(q.question, spoken) < 0.5)
          warn(where, `question "${q.question.trim()}" is not asked in this sequence's narration — a question the viewer never hears is not open; ask it in a shot, or write the one the shots actually raise`);
        else if (spoken && !placed.some(x => q.scenes.indexOf(x.s.scene) !== -1 && (x.s.narration || []).some(seg => seg && ASKED_RE.test(String(seg.tts || seg.sub || '')))))
          warn(where, `no line in this sequence is a question (…까요 · …나요 · ?) — the question is asked out loud by a shot, not paraphrased as a statement (rule 8)`);
        else if (posInt(q.payoff) && q.scenes.length >= 2) {
          // The line that asks it has to come before the payoff scene — a question first heard in the payoff has no scene left to pay it.
          const asked = placed.filter(x => q.scenes.indexOf(x.s.scene) !== -1)
            .map(x => ({ no: x.s.scene, v: Math.max(...(x.s.narration || []).map(seg => overlap(q.question, seg && (seg.tts || seg.sub) || ''))) }))
            .filter(e => e.v >= 0.5);
          if (asked.length && asked.every(e => q.scenes.indexOf(e.no) >= q.scenes.indexOf(q.payoff)))
            warn(where, `question "${q.question.trim()}" is first heard in scene ${asked[0].no}, the payoff scene or after it — the line that opens the question sits in a scene before the payoff; a question the last shot throws to the viewer is shot.share, not the sequence question (rule 8)`);
        }
        const cq = win.COMPREHENSION && win.COMPREHENSION.question;
        if (st.sequences.length === 1 && text(cq) && overlap(q.question, cq) < 0.3)
          warn(where, `question "${q.question.trim()}" is not COMPREHENSION.question ("${String(cq).trim()}") — a short's one sequence holds the episode's question; two different questions means one of them is not asked or not paid (rule 8)`);
      }
      // The payoff is where the answer lands — another scene saying markedly more of it is the tell.
      const answer = win.COMPREHENSION && win.COMPREHENSION.answer;
      const branches = win.COMPREHENSION && Array.isArray(win.COMPREHENSION.branches) ? win.COMPREHENSION.branches : [];
      if (posInt(q.payoff) && text(q.question) && st.sequences.length >= 2) {
        const br = branches.find(b => b && text(b.question) && overlap(b.question, q.question) >= 0.3);
        const payShot = br && posInt(br.pay) ? placed.find(x => x.no === br.pay) : null;
        if (payShot && payShot.s.scene !== q.payoff)
          warn(where, `payoff is scene ${q.payoff} but COMPREHENSION.branches says this question pays in shot ${br.pay}, which sits in scene ${payShot.s.scene} — one ledger; the payoff is the scene where the answer completes, not a later scene that comments on it (rule 8)`);
      }
      if (posInt(q.payoff) && text(answer) && st.sequences.length === 1) {
        const linesOf = no => placed.filter(x => x.s.scene === no)
          .map(x => (x.s.narration || []).map(seg => seg && (seg.tts || seg.sub) || '').join(' ')).join(' ');
        const paid = overlap(answer, linesOf(q.payoff));
        const best = q.scenes.map(no => ({ no, v: overlap(answer, linesOf(no)) })).sort((a, b) => b.v - a.v)[0];
        if (best && best.no !== q.payoff && paid < 0.3 && best.v >= paid + 0.15)
          warn(where, `payoff is scene ${q.payoff} but scene ${best.no}'s lines say the answer — the payoff is the scene whose lines complete COMPREHENSION.answer; when the answer lands earlier, cut that scene at its turn (rule 4) rather than moving the payoff later`);
        else {
          // Clause by clause: an answer whose first clause a scene before the payoff already says has been paid early.
          const clauses = String(answer).split(/[,，]|\s(?:그래서|그리고|그런데)\s|(?<=[가-힣])고\s/).map(c => c.trim()).filter(c => bare(c).length >= 6);
          const early = clauses.map(c => { const bestC = q.scenes.map(no => ({ no, v: overlap(c, linesOf(no)) })).sort((a, b) => b.v - a.v)[0]; return { c, bestC, atPay: overlap(c, linesOf(q.payoff)) }; })
            .filter(e => e.bestC && q.scenes.indexOf(e.bestC.no) < q.scenes.indexOf(q.payoff) && e.bestC.v >= 0.6 && e.atPay < e.bestC.v - 0.15);
          if (clauses.length >= 2 && early.length)
            warn(where, `"${early[0].c}" — a clause of COMPREHENSION.answer — is said in scene ${early[0].bestC.no}, before the payoff scene ${q.payoff}, and the payoff's lines do not say it — the answer is paid where it completes; a question the first scene answers is the cover's, not the sequence's (rule 8)`);
        }
      }
    });
    byNo.forEach((sc, no) => { if (!owned.has(no)) bad('scene ' + no, 'belongs to no sequence — every scene sits in exactly one'); });
    {
      const brs = win.COMPREHENSION && Array.isArray(win.COMPREHENSION.branches) ? win.COMPREHENSION.branches : [];
      brs.forEach((b, i) => {
        if (!b || !text(b.question) || !posInt(b.open)) return;
        const sh = placed.find(x => x.no === b.open);
        if (sh && overlap(b.question, (sh.s.narration || []).map(seg => seg && (seg.tts || seg.sub) || '').join(' ')) < 0.3)
          warn('window.COMPREHENSION.branches[' + i + ']', `open says shot ${b.open} but that shot's lines do not ask "${String(b.question).trim().slice(0, 24)}…" — open is the shot whose line raises the branch question (scenario-craft §5)`);
      });
      const cq = win.COMPREHENSION && win.COMPREHENSION.question;
      if (st.sequences.length >= 2 && text(cq) && !st.sequences.some(q => text(q.question) && overlap(q.question, cq) >= 0.3))
        warn('structure', `COMPREHENSION.question "${String(cq).trim()}" is held by no sequence — on a long-form board one sequence's question is the episode's, the others are its branches (rule 8)`);
    }
    order.forEach((no, i) => {
      const prev = i ? byNo.get(order[i - 1]) : null, cur = byNo.get(no);
      if (prev && cur && text(prev.place) && text(prev.time) && text(cur.place) && text(cur.time) && compact(slugOf(prev)) === compact(slugOf(cur))
          && !(text(prev.event) && text(cur.event) && overlap(prev.event, cur.event) < 0.3 && text(prev.turn) && text(cur.turn) && overlap(prev.turn, cur.turn) < 0.3))
        warn('scene ' + no, `follows scene ${order[i - 1]} on the same slugline ("${slugOf(cur)}") — one scene, unless the value turned and a second event began there; then event and turn have to say so, and a new subject or a new slide is not that`);
    });
    if (byNo.size === 1 && st.sequences.length > 1) bad('structure', 'one scene cannot span two sequences');

    // ── shots against the structure ──
    const shotScenes = [];
    placed.forEach(({ s, no }) => {
      const where = 'shot ' + no;
      if (s.scene === undefined) { bad(where, 'no `scene` — every shot in the playback line points at a STRUCTURE scene'); return; }
      const sc = byNo.get(s.scene);
      if (!sc) { bad(where, `scene ${s.scene} is not in STRUCTURE.scenes`); return; }
      shotScenes.push(s.scene);
      if (s.sceneSlug !== undefined && text(sc.place) && text(sc.time) && compact(s.sceneSlug) !== compact(slugOf(sc)))
        bad(where, `sceneSlug "${s.sceneSlug}" differs from scene ${s.scene} ("${slugOf(sc)}") — sync it, or drop the field and let the structure own it`);
      const owner = owned.get(s.scene);
      if (owner && s.sequence !== undefined && compact(s.sequence) !== compact(owner.title))
        bad(where, `sequence "${s.sequence}" is not the title of scene ${s.scene}'s sequence ("${owner.title}")`);
    });
    if (!placed.length) return out;

    // The playback line groups shots by scene, and its scene order is the sequence order.
    const runs = [];
    shotScenes.forEach(no => { if (!runs.length || runs[runs.length - 1] !== no) runs.push(no); });
    const seen = new Set();
    runs.forEach(no => {
      if (seen.has(no)) bad('scene ' + no, 'its shots are split by another scene — a return to a place later is a new scene number (one continuous time)');
      seen.add(no);
    });
    const expected = order.filter(no => seen.has(no));
    if (expected.join(',') !== runs.filter((no, i) => runs.indexOf(no) === i).join(','))
      bad('structure', `shots play the scenes as ${runs.join(' → ')} but the sequences list them as ${order.join(' → ')} — one order`);
    byNo.forEach((sc, no) => { if (!seen.has(no)) warn('scene ' + no, 'has no shot — a scene with nothing to show is a note, not a scene'); });

    // ── coverage inside a scene (directing-grammar §6 rules 1–3 and 11, scenario-craft §2, §13) ──
    const groups = new Map();
    placed.forEach(x => { if (byNo.has(x.s.scene)) (groups.get(x.s.scene) || groups.set(x.s.scene, []).get(x.s.scene)).push(x); });
    const infos = [];
    placed.forEach(x => {
      const k = x.s.shot && x.s.shot.info;
      if (!text(k)) return;
      const stagedK = /^연출\s?[—–-]/.test(k.trim());
      const twin = infos.find(e => bare(e.k) === bare(k) || overlap(e.k, k) >= 0.6 || (e.scene === x.s.scene && !stagedK && !e.staged && overlap(e.k, k) >= 0.4 && bare(k).length >= 12));
      if (twin) warn('shot ' + x.no, `shot.info says what shot ${twin.no}'s already said — one shot, one new piece of information; one of them can go (coverage design)`);
      else infos.push({ k, no: x.no, scene: x.s.scene, staged: stagedK });
    });
    const lastNo = runs[runs.length - 1];
    const spokenOf = x => (x.s.narration || []).map(seg => seg && (seg.tts || seg.sub) || '').join(' ');
    // shot.info names what the shot adds; an earlier shot that already said it out loud makes this shot a repeat.
    placed.forEach((x, i) => {
      const k = x.s.shot && x.s.shot.info;
      if (!text(k)) return;
      for (let j = 0; j < i; j++) {
        if (overlap(k, spokenOf(placed[j])) >= 0.6) {
          warn('shot ' + x.no, `shot.info "${k.trim()}" repeats what shot ${placed[j].no} already said out loud — info is the new thing this shot adds; the line that is new here is the info, or the shot goes`);
          break;
        }
      }
    });
    placed.forEach(x => {
      const segs = (x.s.narration || []).map(seg => seg && (seg.tts || seg.sub) || '').filter(text);
      const k = x.s.shot && x.s.shot.info;
      const staged = text(k) && /^연출\s?[—–-]/.test(k.trim());
      if (segs.length >= 2) {
        const asks = segs.filter(seg => ASKED_RE.test(seg));
        if (asks.length && asks.length < segs.length && x.s.beat !== 'hook')
          warn('shot ' + x.no, `a question to the viewer and a statement in one shot ("${asks[0].trim().slice(0, 24)}…") — that is two shots (rule 10)`);
      }
      if (text(k) && bare(k).length >= 12 && segs.length && !staged) {
        const own = overlap(k, segs.join(' '));
        const idx = placed.indexOf(x);
        const neigh = [placed[idx - 1], placed[idx + 1]].filter(Boolean).filter(y => y.s.scene === x.s.scene).map(y => overlap(k, (y.s.narration || []).map(seg => seg && (seg.tts || seg.sub) || '').join(' ')));
        if (neigh.length && Math.max(...neigh) >= own + 0.05 && Math.max(...neigh) >= 0.35)
          warn('shot ' + x.no, `shot.info "${k.trim().slice(0, 36)}…" fits a neighbour shot's lines better than its own — the info is what this shot's line says; move the info to the shot that says it, or say it here (rule 10)`);
      }
      const scO = byNo.get(x.s.scene);
      const segsNoOut = segs.filter(seg => !(scO && text(scO.out) && bare(seg) === bare(scO.out)));
      if (text(k) && bare(k).length >= 6 && segs.length && !staged && overlap(k, (segsNoOut.length ? segsNoOut : segs).join(' ')) < 0.1)
        warn('shot ' + x.no, `shot.info "${k.trim().slice(0, 40)}…" shares almost nothing with the shot's own lines — the shot's lines say its info; when the picture carries it, the info starts with "연출 —" (rule 10)`);
      const sc = byNo.get(x.s.scene);
      if (text(k) && sc && text(sc.out) && overlap(k.replace(/^연출\s?[—–-]\s?/, ''), sc.out) >= 0.4)
        warn('shot ' + x.no, `shot.info repeats the scene's out — the out is the bridge and not the shot's one new thing; info names what the shot adds before it, and a "연출 —" info names no fact the out carries (rule 7)`);
      if (text(k) && !staged && segs.length) {
        const nums = (k.match(/\d+(\.\d+)?/g) || []);
        const said = segs.join(' ');
        const missingNum = nums.find(n => said.indexOf(n) === -1 && !/[가-힣]/.test(n));
        if (missingNum && !/(한|두|세|네|다섯|여섯|일곱|여덟|아홉|열|스물|서른|마흔|쉰|예순|백|천|만|억|이십|삼십|사십|오십|육십|칠십|팔십|구십)\s?(초|분|시간|개|명|원|배|퍼센트|킬로|미터|센티|그램|피피엠|년|시|살)/.test(said))
          warn('shot ' + x.no, `shot.info carries the number ${missingNum} and the shot's lines do not say it — a number the viewer must take is said (or read on a statistic screen); an info with a figure no line gives is a note (rule 10)`);
      }
      if (text(k) && bare(k).length >= 18 && CHAIN_RE.test(k.replace(/^연출\s?[—–-]\s?/, '')) && segs.length >= 2)
        warn('shot ' + x.no, `shot.info "${k.trim().slice(0, 40)}…" chains two things under a shot that speaks ${segs.length} lines — one shot, one new thing; a "연출 —" that stages two curiosities is two shots as much as two facts are (rule 10)`);
      if (staged && segs.length && bare(k).length >= 30 && overlap(k.replace(/^연출\s?[—–-]\s?/, ''), segs.join(' ')) >= 0.3)
        warn('shot ' + x.no, `shot.info starts "연출 —" but goes on to state what the line says ("${k.trim().slice(0, 36)}…") — "연출 —" marks an info the picture carries; when the line carries a fact, the info is that fact without the prefix (rule 10)`);
      if (text(k) && !staged && INFO_DELIVERY_RE.test(k.trim()) && overlap(k, segs.join(' ')) < 0.35)
        warn('shot ' + x.no, `shot.info "${k.trim().slice(0, 40)}…" hides a delivery verb under "…는 것" and the lines do not say it — info is the fact the line says, not what the shot does (rule 10)`);
      if (text(k) && !staged && SUMMARY_RE.test(k.trim()))
        warn('shot ' + x.no, `shot.info "${k.trim().slice(0, 40)}…" ends on a delivery verb — info is the fact the viewer takes, not what the shot does; a shot whose job is staging starts its info with "연출 —" (rule 10)`);
      if (segs.length && MEASURE_RE.test(segs.join(' ')) && x.s.shot && x.s.shot.infoType && ['statistic', 'timeline', 'principle'].indexOf(x.s.shot.infoType) === -1 && x.s.shot.render && x.s.shot.render.mode === 'generated_video')
        warn('shot ' + x.no, `a measured value in the lines on a generated_video shot with infoType "${x.s.shot.infoType}" — a number the viewer must read is a statistic on an HTML screen, never video (scenes-schema §shot.infoType)`);
      if (x.s.beat === 'cta' && staged && segs.length && overlap(k.replace(/^연출\s?[—–-]\s?/, ''), segs.join(' ')) < 0.1 && /미소|표정|끄덕|바라보|돌아보|구도|프레임|카메라/.test(k))
        warn('shot ' + x.no, `the hand-back shot's info is a gesture or a framing note ("${k.trim().slice(0, 30)}…") — the hand-back's info names what this shot adds, the changed meaning of the cover's line, not the face that says it (rule 7)`);
      if (x.s.beat === 'cta' && x.s.shot && text(x.s.shot.share) && segs.length && !segs.some(seg => bare(seg) === bare(x.s.shot.share) || overlap(x.s.shot.share, seg) >= 0.6))
        warn('shot ' + x.no, `share "${String(x.s.shot.share).trim().slice(0, 30)}…" is not a line this shot says — the share is the spoken sentence viewers carry off, on the shot that says it (rule 7)`);
    });
    placed.forEach((x, i) => {
      (x.s.narration || []).map(seg => seg && (seg.tts || seg.sub) || '').filter(text).forEach(line => {
        for (let j = 0; j < i; j++) {
          if (x.s.beat === 'cta' && j === 0) continue; // the hand-back may echo the cover (rule 7)
          const k = placed[j].s.shot && placed[j].s.shot.info;
          if (text(k) && bare(line).length >= 10 && overlap(k, line) >= 0.6) {
            warn('shot ' + x.no, `line "${line.trim()}" says again what shot ${placed[j].no}'s info already gave — a shot says one new thing; drop the line, or the new fact in it is this shot's info (rule 10)`);
            break;
          }
        }
      });
    });
    // A hook that names a thing no other shot ever returns to is a promise the board dropped.
    if (placed.length >= 5 && placed[0].s.beat === 'hook') {
      const hk = placed[0].s.shot && placed[0].s.shot.info;
      if (text(hk) && !/^연출\s?[—–-]/.test(hk.trim()))
        warn('shot ' + placed[0].no, `the cover's info does not start with "연출 —" — the cover stages the question and names which drip pays it (연출 — 전개 #1이 버튼 사실을 댄다); a fact written as the cover's info is a fact a later shot then repeats (SKILL §4)`);
      const rest = placed.slice(1).map(x => spokenOf(x) + ' ' + (x.s.shot && x.s.shot.info || '') + ' ' + (x.s.shot && x.s.shot.space && x.s.shot.space.layout || '')).join(' ');
      const STOP = /^(그리고|그런데|근데|그래서|이거|이건|이게|그거|저거|뭐|왜|어떻게|언제|어디|누가|정말|진짜|사실|오늘|지금|여러분|우리|제가|내가|저는|나는|하나|둘|셋|이제|다시|아직|바로|정도|때문|얼마|어떤|무슨|모든|같은|이런|저런|그런|어느|한번|한\s?번|딱|좀|더|다|잘|안|못|또)$/;
      const words = spokenOf(placed[0]).split(/[\s,.!?…]+/).map(w => w.replace(/(에서는|에서|으로는|으로|이라고|라고|까지|부터|처럼|보다|이랑|랑|은|는|이|가|을|를|도|의|에|로|와|과|만|요)$/, '')).filter(w => /^[가-힣]{2,}$/.test(w) && !STOP.test(w) && !/(까|요|어|아|지|다|는|던|세|해|게|면|니|죠|긴|은|간|서|고|며|을|일|내내|동안|마다|처럼|보다|정도|밖에|조차|이나|이면|라면|였|았|었|겠)$/.test(w));
      const promise = bare((placed[0].s.shot && placed[0].s.shot.info || '') + ' ' + (placed[0].s.title || ''));
      const dropped = [...new Set(words)].filter(w => promise.indexOf(w) !== -1 && bare(rest).indexOf(w) === -1 && !words.some(o => o !== w && o.indexOf(w) !== -1 && bare(rest).indexOf(o) !== -1));
      if (dropped.length)
        warn('shot ' + placed[0].no, `the hook names "${dropped.slice(0, 3).join('·')}" and no later shot's line, info or layout returns to it — a hook is a promise; the thing it names is paid by a shot or leaves the hook (scenario-craft §5)`);
    }
    {
      const stagedN = placed.filter(x => x.s.shot && text(x.s.shot.info) && /^연출\s?[—–-]/.test(x.s.shot.info.trim())).length;
      if (placed.length >= 8 && stagedN * 2 > placed.length)
        warn('structure', `${stagedN} of ${placed.length} shots carry a "연출 —" info — the prefix is for a shot whose picture carries its one thing; when the line carries a fact, the info is that fact, and a board that stages half its shots has hidden its facts from the ledger (rule 10)`);
    }
    const takeaway = win.COMPREHENSION && win.COMPREHENSION.takeaway;
    if (text(takeaway) && placed.length >= 5) {
      const best = Math.max(0, ...placed.map(x => bare(spokenOf(x)).length >= 4 ? overlap(takeaway, spokenOf(x)) : 0));
      const raw = String(takeaway).split(/[\s,.!?…]+/).filter(Boolean);
      const strip = w => w.replace(/(이에요|예요|이에|예|에서는|에서|으로는|으로|이라고|라고|까지|부터|처럼|보다|이랑|랑|은|는|이|가|을|를|도|의|에|로|와|과|만|요)$/, '');
      const nounish = w => /^[가-힣]{2,}$/.test(w) && !/(까|요|어|아|지|다|는|던|세|해|게|면|니|죠|긴|은|간|서|고|며|을|일|였|았|었|겠|든|면서)$/.test(w) && !/^(하나|둘|셋|넷|다섯|여섯|일곱|여덟|아홉|열|우리|이제|그냥|기본|오늘|지금|사실|정말|진짜|작은|같은|이런|그런|모든|다른)$/.test(w);
      const toks = raw.map(strip);
      const nouns = toks.filter(w => nounish(w) && w.length >= 4)
        .concat(raw.slice(0, -1).map((w, i) => (w === toks[i] && w.length === 2 && nounish(w) && toks[i + 1].length === 2 && nounish(toks[i + 1])) ? w + toks[i + 1] : '').filter(Boolean));
      const allSaid = bare(placed.map(spokenOf).join(' '));
      const missingNoun = nouns.find(w => allSaid.indexOf(w) === -1);
      if (best >= 0.25 && missingNoun)
        warn('structure', `COMPREHENSION.takeaway names "${missingNoun}" and no line says it — the takeaway is a line the viewer hears; the thing it names is said, or the takeaway is written in the words the shots say (rule 7)`);
      if (best < 0.25)
        warn('structure', `COMPREHENSION.takeaway "${takeaway.trim()}" is said by no shot — the takeaway is a line the viewer hears, in the last scene as a rule; write the one the shots actually say, or give the last scene the shot that says it`);
    }
    if (groups.size === 1 && placed.length >= 5)
      warn('structure', `${placed.length} shots in one scene — the whole episode has no cut point; a story in one place still breaks where the value turns (scenes-schema §structure rule 4)`);
    // A scene whose place an earlier scene already laid out with a wide needs no wide of its own —
    // the viewer still holds the room (directing-grammar §6 rule 2).
    const seenWidePlace = new Set();
    groups.forEach((xs, no) => {
      const where = 'scene ' + no;
      const sc = byNo.get(no);
      const placeKey = sc && text(sc.place) ? compact(sc.place) : null;
      const placeKnown = placeKey && seenWidePlace.has(placeKey);
      const isScreen = x => x.s.shot && x.s.shot.render && EXPLAIN_MODES.indexOf(x.s.shot.render.mode) !== -1;
      const pics = xs.filter(x => !isScreen(x));
      const sizes = new Set(pics.map(x => x.s.shot && x.s.shot.size).filter(Boolean));
      if (xs.length === 1 && placed.length >= 5 && groups.size >= 2)
        warn(where, `one shot — coverage is two sizes per scene, a wide and a close; give it a second shot or fold it into a neighbour (scenes-schema §grammar units)`);
      else if (xs.length >= 2 && pics.length === 1 && placed.length >= 5)
        warn(where, `one picture shot and ${xs.length - 1} explanation screen(s) — an explanation screen's size frames the drawing and fills neither slot; coverage is two picture sizes, a wide and a close (rule 9)`);
      else if (xs.length >= 2 && sizes.size) {
        if (!WIDE.some(z => sizes.has(z)) && !placeKnown)
          warn(where, `${pics.length} picture shots and no wide (${WIDE.join('·')}) — coverage is two sizes per scene, a wide that sets the place and a close; an explanation screen's ls is not the wide (directing-grammar §6.1–2)`);
        if (!CLOSE.some(z => sizes.has(z)))
          warn(where, `${pics.length} picture shots and no close (${CLOSE.join('·')}) — coverage is two sizes per scene, a wide and a close that pays the moment (directing-grammar §6.1–3)`);
        const tight = pics.filter(x => ['cu', 'choker', 'ecu'].indexOf(x.s.shot && x.s.shot.size) !== -1).length;
        if (tight >= 2)
          warn(where, `${tight} close-ups (cu·choker·ecu) in one scene — a scene pays its moment once with one close-up; the rest is the wide, the mediums and inserts (directing-grammar §6.3)`);
      }
      if (placeKey && WIDE.some(z => sizes.has(z))) seenWidePlace.add(placeKey);
      pics.forEach(x => {
        const sz = x.s.shot && x.s.shot.size, lay = x.s.shot && x.s.shot.space && String(x.s.shot.space.layout || '');
        if (['cu', 'mcu', 'choker'].indexOf(sz) !== -1 && lay && /손(?!글씨|님)|화면|라벨|딱지|바코드|스캐너/.test(lay) && !/얼굴|표정|인물|사람|점주|손님|화자|눈|입|고개|상반신|어깨|머리|로봇|딸깍맨|캐릭터|세종|최만리|백성|연구원|아이|남자|여자/.test(lay))
          warn('shot ' + x.no, `size "${sz}" but the layout shows no face ("${lay.trim().slice(0, 30)}…") — a close-up is a face; a hand, a label or a screen filling the frame is an insert (directing-grammar §6)`);
        if (['ms', 'mcu'].indexOf(sz) !== -1 && lay && !PERSON_RE.test(lay.replace(NO_PERSON_RE, '')) && !/로봇|딸깍맨|캐릭터|세종|최만리|연구원|점원|화자|점주|손님|사람|인물/.test(lay))
          warn('shot ' + x.no, `size "${sz}" but the layout has no person ("${lay.trim().slice(0, 30)}…") — the size scale is a body (ms is the waist); a frame of objects is a wide of the place or an insert (directing-grammar §6)`);
        if (['els', 'ls', 'ws'].indexOf(sz) !== -1 && lay && TIGHT_LAYOUT_RE.test(lay) && !/전신|전경|멀리|배경|풍경|넓|방\s?전체|가게\s?전체|서 있|앉아 있/.test(lay))
          warn('shot ' + x.no, `size "${sz}" but the layout is a close view ("${lay.trim().slice(0, 30)}…") — the size is what the frame shows; a wide labelled on a close-up does not set the place (rule 9)`);
      });
      const lines = xs.map(x => x.s.shot && x.s.shot.space && x.s.shot.space.line).filter(text).map(compact);
      if (lines.length >= 2 && new Set(lines).size > 1)
        warn(where, 'space.line changes inside the scene — the 180° lock holds for the scene unless a crossing is written on the shot (directing-grammar §6.11)');
      // The out-line is spoken — it is the last sentence of the scene's last shot, not a planning note.
      const last = xs[xs.length - 1];
      const segs = (last.s.narration || []).map(seg => seg && (seg.tts || seg.sub) || '').filter(text);
      const said = bare(segs.join(' '));
      if (sc && text(sc.out) && said) {
        const o = bare(sc.out);
        if (said.indexOf(o) === -1)
          warn(where, `out "${sc.out.trim()}" is not said in the scene's last shot (shot ${last.no}) — out is the spoken sentence the scene goes out on, written verbatim, not a note (scenario-craft §13)`);
        else if (!said.endsWith(o))
          warn(where, `out "${sc.out.trim()}" is said in shot ${last.no} but the shot goes on after it — out is the last sentence the scene's last shot says; end the shot on it or move the lines that follow`);
      }
      if (sc && text(sc.out) && segs.length) {
        const lastSeg = bare(segs[segs.length - 1]);
        const o = bare(sc.out);
        if (said.endsWith(o) && lastSeg !== o)
          warn(where, `out "${sc.out.trim()}" is not the last sentence of shot ${last.no} word for word — verbatim means the segment and the out are the same string`);
      }
      const spokenAll = xs.map(x => (x.s.narration || []).map(seg => seg && (seg.tts || seg.sub) || '').join(' ')).join(' ');
      const feels = xs.map(x => x.s.shot && x.s.shot.feel).filter(text);
      const spokenOfShot = x => (x.s.narration || []).map(seg => seg && (seg.tts || seg.sub) || '').join(' ');
      if (sc && text(sc.turn) && sc.turn.indexOf('→') !== -1) {
        const poles = sc.turn.split('→').map(t => t.trim()).filter(text);
        if (poles.length === 2) {
          const sa = signOf(poles[0]), sb = signOf(poles[1]);
          if (sa && sb && sa === sb)
            warn(where, `turn "${sc.turn.trim()}" has both poles on the ${sa} side — a turn is X → not-X on one axis; two feelings of the same sign are a deepening, and the value that flipped is still unnamed (rule 6)`);
          if (/\d/.test(poles[1]) || /\d/.test(poles[0]))
            warn(where, `turn "${sc.turn.trim()}" has a number for a pole — a pole is a value (모른다·안다·불안·안심), a number filled in is the event again (rule 6)`);
        }
        const feelHeads = feels.map(f => String(f).split(/\s[—–-]\s|—/)[0].trim());
        if (poles.length === 2 && poles.every(pole => overlap(pole, spokenAll) < 0.15) && poles.every(pole => overlap(pole, feels.join(' ')) >= 0.25))
          warn(where, `turn "${sc.turn.trim()}" lives only in the feel column — no line of this scene says either pole; a turn the viewer never hears is a note, and copying two feel heads into the turn is not a turn (rule 6)`);
        else if (poles.length === 2 && poles.some(pole => overlap(pole, spokenAll) < 0.15 && feelHeads.some(h => h && overlap(pole, h) >= 0.9)))
          warn(where, `a pole of turn "${sc.turn.trim()}" is a feel head copied word for word and no line says it — write the pole in the words a shot speaks (rule 6)`);
        if (poles.length === 2) {
          poles.forEach(pole => {
            if (bare(pole).length >= 10 && xs.some(x => overlap(pole, spokenOfShot(x)) >= 0.55 && bare(spokenOfShot(x)).length >= bare(pole).length))
              warn(where, `pole "${pole}" is a line lifted from a shot, not a value — a pole is the value in a few words (경고 무시 · 사고 확인), and two characters' lines pasted as poles are a speaker change, not a flip (rule 6)`);
          });
        }
        if (poles.length === 2 && sc && text(sc.out)) {
          const stem2 = v => { const b = bare(v); return b.length >= 5 ? b.slice(0, -2) : b.length >= 3 ? b.slice(0, -1) : b; };
          const notOut = xs.map(spokenOfShot).filter(text).map(bare).map(b => b.replace(bare(sc.out), ''));
          if (stem2(poles[1]) && bare(sc.out).indexOf(stem2(poles[1])) !== -1 && !notOut.some(b => b.indexOf(stem2(poles[1])) !== -1))
            warn(where, `the second pole "${poles[1]}" is said only in the out — the out is the bridge into the next scene; the pole the scene closes on is said by a line before it (rule 6)`);
        }
        if (poles.length === 2) {
          const stem = v => { const b = bare(v); return b.length >= 5 ? b.slice(0, -2) : b.length >= 3 ? b.slice(0, -1) : b; };
          const both = xs.map(spokenOfShot).filter(text).find(line => { const b = bare(line); return stem(poles[0]) && stem(poles[1]) && b.indexOf(stem(poles[0])) !== -1 && b.indexOf(stem(poles[1])) !== -1; });
          if (both)
            warn(where, `both poles of turn "${sc.turn.trim()}" sit in one line ("${both.trim().slice(0, 30)}…") — a flip said in one breath is not heard; the first pole belongs to an earlier line and the second to a later one (rule 6)`);
          const p0full = bare(poles[0]);
          const p0 = p0full.length >= 5 ? p0full.slice(0, -2) : p0full; // stem: 얼어버린다 → 얼어버 matches 얼어버리거든요
          const hit = xs.map(spokenOfShot).filter(text).find(line => {
            const b = bare(line), i0 = b.indexOf(p0);
            if (i0 === -1) return false;
            const after = b.slice(i0 + p0.length, i0 + p0.length + 8), before = b.slice(Math.max(0, i0 - 8), i0);
            return /아니|않|없/.test(after) || /안그러면|않으면|아니면|없으면|안하면|못하면|그랬다면|했다면/.test(before);
          });
          const firstLine = (xs[0].s.narration || []).map(seg => seg && (seg.tts || seg.sub) || '').filter(text).join(' ');
          if (hit && p0 && !(bare(firstLine).indexOf(p0) !== -1 && hit !== firstLine && overlap(poles[0], firstLine) >= 0.5))
            warn(where, `the first pole "${poles[0]}" appears only denied or as a what-if ("안 그러면 …", "…가 아니라") in "${hit.trim().slice(0, 30)}…" — the scene has to open on the first pole as a fact and flip later; a pole named only to be ruled out was never the open (rule 6)`);
        }
        const half = Math.ceil(xs.length / 2);
        const headXs = xs.slice(0, half), tailXs = xs.slice(xs.length - half);
        const bag = ys => ys.map(x => spokenOfShot(x) + ' ' + (x.s.shot && x.s.shot.feel || '')).join(' ');
        poles.forEach((pole, i) => {
          const zone = i === 0 ? headXs : tailXs;
          if (overlap(pole, bag(zone)) < 0.25) {
            if (overlap(pole, spokenAll + ' ' + feels.join(' ')) < 0.25)
              warn(where, `turn's "${pole}" is in no line or feel of this scene — both poles of a turn are carried by the scene's own shots; a pole flipped in an earlier scene is not this scene's turn (rule 6)`);
            else
              warn(where, `turn's "${pole}" is carried only by the ${i === 0 ? 'later' : 'earlier'} shots — the first pole is where the scene opens and the last pole where it closes; a turn read backwards is not this scene's (rule 6)`);
          }
        });
      }
      else if (sc && text(sc.turn) && xs.length >= 2)
        warn(where, `turn "${sc.turn.trim()}" has no → — write the turn as 앞 → 뒤 in the words the shots use (의심 → 확신), so each pole can be found in a line of this scene; a turn no shot speaks is a turn the viewer never gets (rule 6)`);
      const gazes = xs.filter(x => x.s.shot && x.s.shot.space && PERSON_RE.test(String(x.s.shot.space.layout || '') + ' ' + String(x.s.shot.space.facing || '')) && GAZE_RE.test(String(x.s.shot.space.facing || '').replace(CAMERA_RE, '')));
      const pictured = xs.filter(x => x.s.shot && x.s.shot.space && text(x.s.shot.space.layout));
      const peopled = pictured.filter(x => PERSON_RE.test((x.s.shot.space.layout + ' ' + (x.s.shot.space.facing || '')).replace(NO_PERSON_RE, '')));
      if (!lines.length && pictured.length >= 2 && peopled.length >= 2 && !gazes.length)
        warn(where, `${peopled.length} picture shots with a person and no space.line — a person and what they handle or look at across two shots fix the 180° line on the first shot that has them (rule 10)`);
      if (lines.length && peopled.length && !(peopled[0].s.shot.space.line && text(peopled[0].s.shot.space.line)))
        warn(where, `space.line is written on a later shot but not on shot ${peopled[0].no}, the first picture shot with a person — the line is fixed on the first shot that has them and kept (rule 10)`);
      if (gazes.length && !lines.length && pictured.length >= 2)
        warn(where, `shot ${gazes[0].no}'s facing has someone looking at something ("${String(gazes[0].s.shot.space.facing).trim()}") but no shot of the scene writes space.line — two people, or a person and what they look at, fix the 180° line on the scene's first shot (rule 10)`);
      if (sc && sc.charge && feels.length) {
        const first = signOf(feels[0]);
        if (first && first !== sc.charge.open)
          warn(where, `charge.open "${sc.charge.open}" but the first shot's feel reads "${feels[0]}" (${first}) — open is the value the scene's first shot says and feels, not the reverse of the last scene's close`);
        else {
          const firstLines = signRaw(spokenOfShot(xs[0]));
          if (firstLines && firstLines !== sc.charge.open)
            warn(where, `charge.open "${sc.charge.open}" but the first shot's lines read ${firstLines} ("${spokenOfShot(xs[0]).trim().slice(0, 40)}…") — open is what the first shot says as well as feels (rule 6)`);
        }
        let flips = 0, prevSign = '';
        // The hand-back (beat:cta) returns to the cover's frame; its feel is the viewer's, not this scene's swing.
        xs.filter(x => x.s.beat !== 'cta').map(x => x.s.shot && x.s.shot.feel).filter(text).forEach(f => { const g = signOf(f); if (g && prevSign && g !== prevSign) flips++; if (g) prevSign = g; });
        const lastSign = signOf(feels[feels.length - 1]);
        if (lastSign && sc.charge.close && lastSign !== String(sc.charge.close)[0])
          warn(where, `charge.close "${sc.charge.close}" but the last shot's feel reads "${feels[feels.length - 1]}" (${lastSign}) — close is the value the scene's last shot says and feels; a scene that ends on the harm has closed on "-" (rule 6)`);
        if (sc.charge.close) {
          // The out is the bridge into the next scene and does not count; the lines before it do.
          const o = text(sc.out) ? bare(sc.out) : '';
          const before = segs.filter(seg => bare(seg) !== o).join(' ');
          const lineSign = signRaw(before);
          if (lineSign && lineSign !== String(sc.charge.close)[0])
            warn(where, `charge.close "${sc.charge.close}" but the last shot's lines before the out read ${lineSign} ("${before.trim().slice(0, 40)}…") — close is what the last shot says as well as feels; a scene whose last line names the harm has closed on "-" (rule 6)`);
        }
        if (xs.length >= 3 && flips >= 2)
          warn(where, `the feel flips sign ${flips} times across ${xs.length} shots — a scene turns once; cut at the second turn (rule 4), explanation shots included`);
      }
      if (sc && text(sc.time) && MOMENT_RE.test(sc.time.trim()) && SPAN_RE.test(spokenAll))
        warn(where, `time "${sc.time.trim()}" is one moment but the lines speak of a span (내내·동안·마다) — a repeated action is one scene and time is the span it covers (rule 3)`);
      const layoutsAll = xs.map(x => x.s.shot && x.s.shot.space ? [x.s.shot.space.layout, x.s.shot.space.frame].filter(text).join(' ') : '').join(' ');
      if (sc && text(sc.event) && pictured.length && overlap(sc.event, layoutsAll + ' ' + spokenAll) < 0.3)
        warn(where, `event "${sc.event.trim()}" is drawn by no shot — no layout or line of this scene shows it; the event is the one thing that happens on screen, so a shot shows it or the event is what a shot shows (rule 5)`);
      else if (sc && text(sc.event) && pictured.length >= 2 && overlap(sc.event, layoutsAll) < 0.2)
        warn(where, `event "${sc.event.trim()}" is spoken but no picture layout of the scene draws it — the event happens on screen; a layout shows the action, or the event is the action a layout shows (rule 5)`);
      xs.filter(isScreen).forEach(x => {
        const k = x.s.shot.info;
        const others = xs.filter(y => y !== x).map(spokenOfShot).join(' ');
        if (sc && text(k) && text(sc.event) && overlap(k, (sc.event + ' ' + (sc.turn || '') + ' ' + (sc.place || ''))) < 0.12)
          warn('shot ' + x.no, `an explanation screen whose info shares nothing with scene ${no}'s event, turn or place — a screen is a shot of the scene whose event it explains; a neighbour line that reads the screen's numbers back does not make it one (rule 2)`);
        else if (sc && text(k) && text(sc.event) && overlap(k, (sc.event + ' ' + (sc.turn || ''))) < 0.15 && overlap(k, others) < 0.3)
          warn('shot ' + x.no, `an explanation screen whose info shares nothing with scene ${no}'s event, turn or lines — a screen is a shot of the scene whose event it explains; a fact no scene's event explains gets the scene where it was made, or goes (rule 2)`);
      });
      if (sc && text(sc.time) && SPAN_RE.test(sc.time) && !SPAN_RE.test(spokenAll + ' ' + layoutsAll) && !/반복|몽타주|여러\s?번|번째|다시|또/.test(spokenAll + ' ' + layoutsAll))
        warn(where, `time "${sc.time.trim()}" is a span but no shot draws it — a span needs a shot that shows the repetition or the time passing (a montage, three tries, a date card); otherwise the shots are one moment and belong to the scene of that moment (rule 3)`);
      const prevNo = runs[runs.indexOf(no) - 1];
      const prevSc = prevNo !== undefined ? byNo.get(prevNo) : null;
      if (sc && prevSc && text(sc.time) && text(prevSc.time) && compact(sc.place) === compact(prevSc.place) && compact(sc.time) !== compact(prevSc.time) && pictured.length) {
        const lay = String(pictured[0].s.shot.space.layout) + ' ' + String(pictured[0].s.shot.space.frame || '');
        const t = sc.time.trim();
        if ((NIGHT_RE.test(t) && !NIGHT_CUE_RE.test(lay)) || (MORNING_RE.test(t) && !NIGHT_RE.test(t) && !MORNING_CUE_RE.test(lay)))
          warn(where, `time "${t}" breaks from scene ${prevNo}'s "${prevSc.time.trim()}" in the same place, but shot ${pictured[0].no}'s layout shows no time (a lamp, a dark window, morning light, a clock) — a transition effect is not evidence of time (rule 3)`);
      }
      if (sc && text(sc.time) && ELAPSED_RE.test(sc.time) && pictured.length && !pictured.some(x => ELAPSED_CUE_RE.test(String(x.s.shot.space.layout) + ' ' + String(x.s.shot.space.frame || ''))))
        warn(where, `time "${sc.time.trim()}" says time has passed but no picture layout of the scene shows it (a date card, a clock, dust, a changed object) — a retrospective line does not move the time (rule 3)`);
      if (sc && text(sc.place) && groups.size >= 2) {
        const mine = compact(sc.place);
        byNo.forEach((o, ono) => {
          if (ono !== no && text(o.place)) {
            const theirs = compact(o.place);
            if (theirs.length > mine.length && theirs.indexOf(mine) === 0)
              warn(where, `place "${sc.place.trim()}" is the stem of scene ${ono}'s "${o.place.trim()}" — one is an umbrella over the other, or the longer one is a picture label (마당 땅속) rather than a place a shot shows; two scenes in one place break by rule 4 and keep the place (rule 1)`);
          }
        });
      }
      if (sc && text(sc.place) && UMBRELLA_RE.test(sc.place.trim()) && groups.size >= 2)
        warn(where, `place "${sc.place.trim()}" is an umbrella, not a slugline — the slugline is the place a shot actually shows (거실, not 집 안); a place that covers other scenes' places cannot tell whether the place changed (rule 1)`);
      if (sc && no === lastNo && sc.out === undefined && groups.size >= 2)
        warn(where, 'the last scene has no out — its out is the hand-back to the cover, the line the episode ends on (scenario-craft §5, §7)');
    });

    // A pole the previous scene already flipped is not this scene's turn (rule 6).
    runs.forEach((no, i) => {
      if (!i) return;
      const cur = byNo.get(no), prev = byNo.get(runs[i - 1]);
      if (!cur || !prev || !text(cur.turn) || !text(prev.turn) || cur.turn.indexOf('→') === -1 || prev.turn.indexOf('→') === -1) return;
      const c0 = cur.turn.split('→')[0].trim(), pp = prev.turn.split('→').map(t => t.trim());
      if (bare(c0).length >= 2 && pp.some(pole => bare(pole).length >= 2 && (overlap(c0, pole) >= 0.6 || bare(pole) === bare(c0))))
        warn('scene ' + no, `turn opens on "${c0}", a pole scene ${runs[i - 1]} already turned on — a pole that flipped in the previous scene is not this scene's turn; name the value this scene's own event moves (rule 6)`);
    });
    // An out calls the next scene: a next scene that opens on a list number was not called (rule 7).
    runs.forEach((no, i) => {
      if (i === 0) return;
      const first = (groups.get(no) || [])[0];
      const seg = first && (first.s.narration || []).map(g => g && (g.tts || g.sub) || '').filter(text)[0];
      if (seg && ENUM_RE.test(seg.trim()))
        warn('scene ' + no, `opens on "${seg.trim().slice(0, 20)}…" — a list number is not a 그런데/그래서; the previous scene's out is the line that calls this one, and this scene's first line answers it (rule 7)`);
      const prevSc = byNo.get(runs[i - 1]);
      if (seg && prevSc && text(prevSc.out) && bare(seg).length >= 8 && overlap(prevSc.out, seg) >= 0.6)
        warn('scene ' + no, `its first line repeats scene ${runs[i - 1]}'s out ("${seg.trim().slice(0, 24)}…") — the out calls the next scene and the next scene answers it; saying it twice is a repeat, not a bridge (rule 7)`);
    });
    const total = placed.reduce((n, x) => n + (Number(x.s.duration) || 0), 0);
    if (String(win.FORMAT || '').indexOf('long') !== -1 && st.sequences.length < 2 && placed.length >= 10)
      warn('structure', 'one sequence on a long-form board — long-form is 2–5 sequences, each a mini-movie with its own question and payoff; one sequence over ten minutes is a short\'s structure stretched (scenes-schema §structure field table)');
    if (String(win.FORMAT || '').indexOf('long') !== -1 && groups.size < 8 && placed.length >= 10)
      warn('structure', `${groups.size} scenes on a long-form board — a 10-minute long-form holds 8–15; a stretch that is one scene per chapter has not been cut at its turns (rule 9)`);
    if (total && total <= 90 && groups.size >= 5)
      warn('structure', `${groups.size} scenes in ${Math.round(total)}s — a 45–75s short holds two to four; when places outnumber the band, the band wins: room moves inside one stretch of time are shot moves, and place is where the stretch lives (rule 9)`);
    // Three shots on one feel is a flat stretch (scenario-craft §2).
    let run = 0, prev = '';
    placed.forEach(({ s, no }) => {
      const f = compact(s.shot && s.shot.feel);
      run = f && f === prev ? run + 1 : 1;
      prev = f;
      if (run === 3) warn('shot ' + no, 'three shots in a row on the same feel — a flat stretch; the charge has to swing or deepen shot to shot (scenario-craft §2)');
    });
    return out;
  }

  /** Write the derived shot labels from the structure. Returns the number of shots touched. */
  function sync(win) {
    const st = win.STRUCTURE;
    if (!st || !Array.isArray(st.scenes)) return 0;
    const byNo = new Map(st.scenes.filter(sc => sc && posInt(sc.no)).map(sc => [sc.no, sc]));
    const multi = Array.isArray(st.sequences) && st.sequences.length > 1;
    let n = 0;
    (win.SCENES || []).forEach(s => {
      if (!PLACED(s) || s.scene === undefined) return;
      const sc = byNo.get(s.scene);
      if (!sc || !text(sc.place) || !text(sc.time)) return;
      s.sceneSlug = slugOf(sc);
      const owner = ownerOf(st, s.scene);
      if (multi && owner && text(owner.title)) s.sequence = owner.title;
      else delete s.sequence;
      n++;
    });
    return n;
  }

  /** The board as a tree — sequences → scenes → shots. `level` trims what each shot carries. */
  function outline(win, level) {
    const st = win.STRUCTURE || { sequences: [], scenes: [] };
    const shots = Array.isArray(win.SCENES) ? win.SCENES : [];
    const full = level === 'full';
    const shotRow = (s, i) => {
      const row = { no: i + 1, type: s.type, beat: s.beat, duration: s.duration };
      if (s.shot) Object.assign(row, {
        feel: s.shot.feel, info: s.shot.info, infoType: s.shot.infoType, size: s.shot.size, angle: s.shot.angle, why: s.shot.why,
        render: s.shot.render && s.shot.render.mode, share: s.shot.share,
      });
      row.narration = (s.narration || []).map(seg => seg && (seg.tts || seg.sub) || '').join(' ');
      if (s.transition) row.transition = s.transition;
      if (full) row.raw = s;
      return row;
    };
    const placed = shots.map((s, i) => ({ s, i })).filter(x => PLACED(x.s));
    const sceneRows = (Array.isArray(st.scenes) ? st.scenes : []).filter(sc => sc && typeof sc === 'object').map(sc => Object.assign({}, sc, {
      slug: text(sc.place) && text(sc.time) ? slugOf(sc) : undefined,
      shots: level === 'scenes' ? placed.filter(x => x.s.scene === sc.no).map(x => x.i + 1)
                                : placed.filter(x => x.s.scene === sc.no).map(x => shotRow(x.s, x.i)),
    }));
    const byNo = new Map(sceneRows.map(r => [r.no, r]));
    const sequences = (Array.isArray(st.sequences) ? st.sequences : []).filter(q => q && typeof q === 'object').map(q => Object.assign({}, q, {
      scenes: level === 'outline' ? (Array.isArray(q.scenes) ? q.scenes : []) : (Array.isArray(q.scenes) ? q.scenes : []).map(no => byNo.get(no) || { no, missing: true }),
    }));
    const orphans = placed.filter(x => x.s.scene === undefined || !byNo.has(x.s.scene)).map(x => shotRow(x.s, x.i));
    const spliced = shots.map((s, i) => ({ s, i })).filter(x => !PLACED(x.s)).map(x => shotRow(x.s, x.i));
    return { version: st.version, format: win.FORMAT || 'shorts-9x16', shots: shots.length,
             sequences, unplacedShots: orphans, splicedShots: spliced };
  }

  const api = { VERSION, VOCAB: { SIZES, ANGLES, TYPES, BEATS, INFO_TYPES, SHARE_TYPES, HOOK_TYPES, HOOK_FORMS, ARCS,
                                  RENDER_MODES, CHARGES_OPEN, CHARGES_CLOSE, TRANSITION_RE },
                check, sync, outline, slugOf, ownerOf };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.STRUCTURE_CONTRACT = api;
})(typeof window === 'object' ? window : globalThis);
