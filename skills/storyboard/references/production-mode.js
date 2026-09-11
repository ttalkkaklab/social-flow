/* Shared by the planner, approval page and production preflight. */
(function (root) {
  'use strict';
  const text = value => typeof value === 'string' && !!value.trim();
  const CHOICES = ['full_video', 'video_50', 'video_30', 'hook_only'];
  const MODES = { full_video: '100% 이상', video_50: '50% 이상', video_30: '30% 이상', hook_only: '훅만 영상', hybrid: '혼합 제작 (기존 승인)' };
  const RATIOS = { full_video: 1, video_50: .5, video_30: .3 };
  const newCut = scene => eligible(scene) && !reused(scene);
  const generated = scene => !!scene.visual?.video || scene.type === 'broll' || (scene.type === 'quote' && typeof scene.visual?.clip === 'object');
  function hookScene(scenes) { return scenes.find(s => s.type === 'hooking') || scenes.find(s => s.type === 'cover') || scenes.find(newCut); }
  function coverageErrors(win) {
    const key = win.PRODUCTION?.mode, scenes = win.SCENES || [], cuts = scenes.filter(newCut);
    if (key === 'hook_only') {
      const hook = hookScene(scenes);
      return hook && newCut(hook) && generated(hook) && cuts.filter(generated).length === 1
        ? [] : ['hook_only requires only the opening hook cut to be generated video'];
    }
    if (!RATIOS[key]) return [];
    const minimum = Math.ceil(cuts.length * RATIOS[key]);
    return cuts.filter(generated).length >= minimum ? [] : [key + ' requires at least ' + minimum + ' of ' + cuts.length + ' new cuts as generated video'];
  }
  // Two HITL choices every episode with generated video records (user directive 2026-09-11):
  // which 3D renderer draws the mandatory previz, and which video model the clips are made on.
  const PREVIZ_RENDERERS = { blender: '블렌더 브릿지 — 관절 마네킹, 모션 캡처', threejs: 'three.js 페이지 — 헤드리스 크롬, 관절 없음' };
  // Seedance models that take the previz as a reference video, with the resolutions the price table prices.
  const VIDEO_MODELS = {
    'dreamina-seedance-2-0-260128': { label: 'Seedance 2.0', resolutions: ['1080p'] },
    'dreamina-seedance-2-0-fast-260128': { label: 'Seedance 2.0 fast', resolutions: ['720p'] },
    'dreamina-seedance-2-0-mini-260615': { label: 'Seedance 2.0 mini', resolutions: ['720p'] },
    'dreamina-seedance-2-5-260628': { label: 'Seedance 2.5', resolutions: ['720p', '1080p'] }
  };
  const selectionRecorded = sel => sel && ['user', 'standing'].includes(sel.kind) && text(sel.reference);
  // The four slots every generated shot stores (scenes-schema §camera); spatial-prompts.js
  // assembles the motion prompt's camera span from them, so nothing else describes the camera.
  const CAMERA_SLOTS = ['movement', 'speed', 'framing', 'end'];
  const normalize = value => String(value || '').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
  // A static camera has no speed to state (the span reads "static camera"), so that one slot may stay empty.
  const staticCamera = camera => /^(static|fixed|locked)/i.test(String(camera?.movement || '').trim());
  const missingCameraSlots = camera => CAMERA_SLOTS.filter(slot => !text(camera?.[slot]) && !(slot === 'speed' && staticCamera(camera)));
  // A move written to be invisible is a still with extra steps. ep402 (2026-09-06) asked for
  // "very small optical focus change", "gentle focus", "hold composition with subtle light
  // variation" and got clips whose every frame repeats the last; ep411 (2026-09-09) asked for
  // "slow dolly in" on wide miniature stages and read as stills on a phone. The camera slots
  // name a move the viewer can see, in vendor vocabulary: dolly in, truck right, arc shot,
  // pedestal up, at slow / steady / fast — or static, chosen, on at most a third of the shots.
  const NEUTERED = /\b(?:very|extremely|almost|ever so)\s+(?:slow|slight|small|subtle|gentle)|\b(?:barely|hardly|imperceptibl[ey]|subtle|subtly|tiny|minimal|micro|slight|slightly|gentle|gently|restrained|quiet)\b|\bhold(?:ing)?\s+(?:the\s+)?(?:composition|frame|shot)\b|\block(?:ed)?[- ]off\b|\bbreathing only\b/i;
  const WIDE = /\b(?:wide|establishing|extreme long|long shot|full[- ]body figures|small figures)\b/i;
  function cameraErrors(scene) {
    const v = scene.visual || {}, camera = v.camera || {}, errors = [];
    const span = [camera.movement, camera.speed].filter(text).join(' ');
    const hit = NEUTERED.exec(span);
    if (hit) errors.push(`visual.camera asks for a move the viewer cannot see ("${hit[0]}"); write a visible move at slow, steady or fast, or choose static`);
    if (v.video?.cameraFixed === true && !staticCamera(camera))
      errors.push(`visual.video.cameraFixed locks the provider camera while visual.camera.movement is "${camera.movement}"; drop cameraFixed or write static`);
    return errors;
  }
  // The final state is written once: the last motion beat on an acted shot, videoDesign.after otherwise.
  function finalState(design) {
    const beats = design?.motion?.kind === 'subject_action' ? design.motion.beats : null;
    return Array.isArray(beats) && beats.length ? beats[beats.length - 1]?.state : design?.after;
  }
  const STYLES = {
    'cinematic-miniature': { label: '시네마틱 미니어처 디오라마', looks: ['miniature', 'architectural'],
      prompt: 'Cinematic miniature diorama, tactile matte handcrafted surfaces, articulated miniature figures, coherent scale and soft contact shadows.' },
    'photoreal': { label: '완전 실사풍', looks: ['realistic'],
      prompt: 'Photoreal live-action cinematography: life-size human proportions, natural skin and fabric texture, real locations, physically plausible light and photographic lenses; every surface reads as a real material at real scale.' },
    'webtoon': { label: '웹툰풍', looks: ['webtoon'],
      prompt: 'Korean webtoon illustration: consistent expressive character linework, clean contour lines, controlled cel shading, illustrated backgrounds and a coherent drawn palette; skin and cloth are drawn, and the frame is one unbroken picture.' },
    // Added 2026-09-08 from the Shorts style survey (docs/research/2026-09-08-shorts-visual-styles).
    // Named studios and living artists stay out of every prompt: the image lane refuses them.
    'claymation': { label: '클레이 스톱모션', looks: ['clay'],
      prompt: 'Stop-motion claymation: matte plasticine figures and sets with visible thumbprints and slight surface imperfections, chunky simplified forms, handcrafted miniature props, warm tactile studio light and soft contact shadows; the whole frame is one sculpted scene photographed on a set.' },
    'paper-cutout': { label: '종이 컷아웃 디오라마', looks: ['papercut'],
      prompt: 'Layered paper-cut diorama: every figure, prop and backdrop is a flat cut-paper shape with visible fibre edges, stacked in separated depth layers with soft cast shadows between the layers, a muted paper palette, simple readable silhouettes and a shallow theatre-stage depth.' },
    'ink-wash': { label: '수묵화', looks: ['inkwash'],
      prompt: 'East Asian ink-wash painting: confident brushed black ink lines with wet-on-wet grey gradients on pale rice-paper texture, generous empty space, one restrained mineral accent colour, figures and places drawn in calligraphic strokes; the frame stays one painted picture.' },
    'toon-3d': { label: '3D 카툰 캐릭터', looks: ['toon3d'],
      prompt: 'Stylised 3D cartoon animation: appealing characters with large expressive eyes and simplified rounded proportions, soft subsurface skin, clean material shaders on props and sets, warm rim light and cinematic depth of field, rendered like a feature-animation frame.' },
    // Added 2026-09-09 from a user reference: a 1990s hand-painted arcade fighting/action game frame.
    // The game HUD (health bars, portraits, player names) is not part of the generated picture:
    // the image lane garbles lettering, generated video warps a static overlay, and nothing is drawn over video.
    'arcade-2d': { label: '아케이드 게임 화면', looks: ['arcade'],
      prompt: 'Hand-painted 1990s arcade game art: characters as large painted sprites with bold dark outlines, exaggerated heroic proportions and saturated colours with hard cel highlights, staged side-on in front of layered parallax backgrounds (painted foreground props, a mid-ground set, a distant painted backdrop), slightly grainy CRT-era colour and a wide stage read; the whole frame is one painted game scene and the picture holds only the stage and its characters, every frame edge kept as painted scenery.' }
  };
  // Only the miniature presets carry a bundled reference pack; every other preset is prompt-only.
  const packPresets = ['cinematic-miniature', 'spatial-explainer'];
  const ALL_LOOKS = ['archive', ...new Set(Object.values(STYLES).flatMap(s => s.looks))];
  // Explicit imported inputs, never inferred from an existing generation output.
  function reused(scene) { return scene.visual?.reuse !== undefined; }
  function reuseErrors(scene) {
    if (!reused(scene)) return [];
    const v = scene.visual || {}, r = v.reuse, errors = [];
    if (!r || typeof r !== 'object' || Array.isArray(r)) return ['visual.reuse must be an imported clip record'];
    const local = file => text(file) && !/^[a-z][a-z0-9+.-]*:|^\/\//i.test(file) && !/[\t\r\n|]/.test(file);
    if (!local(r.clip) || !/\.(mp4|mov|m4v|webm)$/i.test(r.clip)) errors.push('visual.reuse.clip must be a local, already trimmed file path');
    if (!/^[a-f0-9]{64}$/.test(r.sha256 || '')) errors.push('visual.reuse.sha256 must identify the imported file bytes');
    if (!text(r.sourceEpisode)) errors.push('visual.reuse.sourceEpisode must identify the original generated episode');
    const range = r.sourceRange;
    if (!range || !Number.isFinite(range.start) || !Number.isFinite(range.end) || range.start < 0 || range.end <= range.start ||
        !Number.isFinite(scene.duration) || scene.duration <= 0 || Math.abs(range.end - range.start - scene.duration) > .001)
      errors.push('visual.reuse.sourceRange must give original start/end seconds spanning exactly scene.duration');
    if (v.video !== undefined || v.clip !== undefined || v.source !== undefined || v.slide !== undefined || v.renderedFile !== undefined ||
        v.engine !== undefined || v.prompt !== undefined || v.bgPrompt !== undefined || v.bg !== undefined || ['broll', 'quote', 'outro'].includes(scene.type))
      errors.push('A reused clip cannot also declare a generation, recording, slide or alternate file handoff');
    if (v.picture !== 'ai-video' || v.overlay !== 'none') errors.push('Reused generated clips keep picture:ai-video and overlay:none');
    if (scene.title || scene.stat || (scene.bullets || []).length || scene.footnote)
      errors.push('Reused video allows subtitles only; clear title, stat, bullets and footnote');
    if (scene.shot?.render?.mode !== 'generated_video' || scene.shot?.render?.purpose !== 'live_action' ||
        scene.shot?.render?.motionEssential !== true || !text(scene.shot?.render?.whyNotStill) || !text(scene.shot?.render?.action) || !text(v.why))
      errors.push('Reused video needs essential live_action with action, whyNotStill and visual.why');
    errors.push(...motionErrors(scene));
    return errors;
  }
  // A supplied file — the user's recording, or a free stock clip (visual.source "stock" with a
  // clip path) — is never a generated shot; a stock photograph may still feed a generated cut.
  function eligible(scene) {
    const v = scene.visual || {};
    return scene.type !== 'outro' && !(!reused(scene) && !v.video &&
      (['recording', 'screencast'].includes(v.source) || v.picture === 'recording' ||
       (v.source === 'stock' && typeof v.clip === 'string')));
  }
  function full(production) { return production?.mode === 'full_video'; }
  // Outputs and approval metadata must not invalidate their own input signature.
  function signature(win) {
    const p = win.PRODUCTION || {};
    return JSON.stringify({ format: win.FORMAT, mode: p.mode, imageProvider: p.imageProvider, videoProvider: p.videoProvider, videoBudgetUsd: p.videoBudgetUsd,
      maxAttempts: p.maxAttempts, generationRevision: p.generationRevision, comparison: p.comparison, style: p.style,
      scenes: (win.SCENES || []).filter(eligible).map(s => {
        const v = s.visual || {}, video = { ...v.video };
        delete video.clip;
        return { type: s.type, duration: s.duration, narration: s.narration,
          ...(reused(s) ? { reuse: v.reuse } : {}),
          render: s.shot?.render, design: s.shot?.videoDesign,
          frames: v.frames, imagePair: v.imagePair, styleRole: v.styleRole, stylePack: v.stylePack,
          bg: v.bg, bgPrompt: v.bgPrompt, camera: v.camera, action: v.action, video, engine: v.engine,
          prompt: v.prompt, clip: typeof v.clip === 'object' ? v.clip : undefined,
          source: v.source, license: v.license, file: typeof v.clip === 'string' ? v.clip : undefined };
      }) });
  }
  function motionErrors(scene) {
    const d = scene.shot?.videoDesign || {}, m = d.motion, errors = [];
    if (!m || !['subject_action', 'spatial_reveal', 'archive_hold'].includes(m.kind))
      return ['videoDesign.motion.kind must be subject_action, spatial_reveal or archive_hold'];
    for (const key of ['subject', 'visibleChange'])
      if (!text(m[key])) errors.push('videoDesign.motion.' + key + ' is required');
    if (m.kind === 'archive_hold' && d.look !== 'archive') errors.push('archive_hold is only for archival evidence');
    if (m.kind !== 'subject_action' && !text(m.reason)) errors.push('Camera-only or archival shots need an explicit motion.reason');
    if (['character', 'interaction'].includes(scene.visual?.styleRole) && d.look !== 'archive' && m.kind !== 'subject_action')
      errors.push('Character and interaction shots require subject_action, not a camera-only reveal');
    if (m.kind === 'subject_action') {
      const beats = m.beats;
      if (!Array.isArray(beats) || beats.length < 2 || beats.some(b => !b || !Number.isFinite(b.at) || b.at < 0 || b.at > scene.duration || !text(b.state)) ||
          beats.some((b, i) => i && b.at <= beats[i - 1].at) || new Set(beats.map(b => b.state?.trim())).size < 2)
        errors.push('Subject action needs distinct, ordered motion.beats with seconds and visible states within the shot');
      else if (text(d.after) && normalize(d.after) !== normalize(beats[beats.length - 1].state))
        errors.push('videoDesign.after must be the last motion beat, written once; drop after or make the two identical');
      const directions = [d.action, d.continuity, scene.visual?.video?.prompt].join(' ');
      if (/keep (?:every|all) (?:person|people|characters?).{0,40}fixed|(?:people|women|characters?) (?:and door )?(?:stay|remain) fixed|only (?:very )?(?:small|subtle) (?:natural )?breathing|no new text, objects or actions/i.test(directions))
        errors.push('Subject action contradicts a global freeze or breathing-only instruction');
    }
    return errors;
  }
  function check(win, { requireSelection = false, requireApproval = false, draft = false } = {}) {
    const p = win.PRODUCTION, errors = Array.from(win.SCENES || []).flatMap((s, i) => reuseErrors(s).map(e => `shot ${i + 1}: ${e}`));
    if (!p) return requireSelection || (win.SCENES || []).some(reused)
      ? errors.concat(['Choose a production mode with a four-option cost comparison before generation']) : errors;
    if (!MODES[p.mode]) errors.push('PRODUCTION.mode must be full_video, video_50, video_30 or hook_only (hybrid is legacy)');
    // host = the CLI's own media tool (image_gen on Codex and Grok, image_to_video on Grok); absent reads as api.
    for (const key of ['imageProvider', 'videoProvider'])
      if (p[key] !== undefined && !['host', 'api'].includes(p[key])) errors.push('PRODUCTION.' + key + ' must be host or api');
    if (!Number.isFinite(p.videoBudgetUsd) || p.videoBudgetUsd < 0)
      errors.push('PRODUCTION.videoBudgetUsd must be a finite nonnegative episode cap');
    if (!Number.isInteger(p.maxAttempts) || p.maxAttempts < 1 || p.maxAttempts > 5)
      errors.push('PRODUCTION.maxAttempts must be 1–5 total attempts per clip (including the first)');
    if (requireApproval && (!p.approval || !['user', 'standing'].includes(p.approval.kind) ||
        !text(p.approval.reference) || !Number.isFinite(Date.parse(p.approval.at)) || !text(p.approval.quoteFingerprint)))
      errors.push('PRODUCTION.approval needs kind, reference, at and the approved cost quoteFingerprint');
    const chosen = p.style?.preset;
    if (chosen && chosen !== 'spatial-explainer' && !STYLES[chosen]) errors.push('Unknown PRODUCTION.style.preset');
    if (STYLES[chosen] && (!['user', 'standing'].includes(p.style.selection?.kind) ||
        !text(p.style.selection?.reference))) errors.push('Record the actual style HITL choice in PRODUCTION.style.selection');
    if (STYLES[chosen] && !packPresets.includes(chosen) && p.style.referencePack)
      errors.push('Only cinematic-miniature carries the miniature reference pack; drop referencePack for ' + chosen);
    if (draft) return errors; // Shot assets/designs are authored after the narration-only draft.
    (win.SCENES || []).forEach((s, i) => {
      if (eligible(s) && !reused(s) && s.visual?.video) cameraErrors(s).forEach(e => errors.push('shot ' + (i + 1) + ': ' + e));
    });
    // A generated cut exists → the previz renderer and the video model were put to the user
    // (blender-previz.md §6, production-mode.md §When to ask). Nothing renders or bills before that.
    const generatedCuts = (win.SCENES || []).filter(s => eligible(s) && !reused(s) && s.visual?.video && s.shot?.render?.mode === 'generated_video');
    if (generatedCuts.length) {
      if (!PREVIZ_RENDERERS[p.previz?.renderer]) errors.push('Ask which 3D previz renderer draws the generated cuts and record it in PRODUCTION.previz.renderer (blender | threejs)');
      else if (!selectionRecorded(p.previz.selection)) errors.push('Record the actual previz renderer HITL choice in PRODUCTION.previz.selection');
      const vm = p.videoModel;
      if (p.videoProvider === 'host') {
        if (vm && vm.model !== 'host') errors.push('PRODUCTION.videoModel.model must be host under videoProvider host');
      } else if (!vm || !VIDEO_MODELS[vm.model]) errors.push('Ask which video model makes the generated cuts and record it in PRODUCTION.videoModel (' + Object.keys(VIDEO_MODELS).join(' | ') + ')');
      else if (!VIDEO_MODELS[vm.model].resolutions.includes(vm.resolution)) errors.push('PRODUCTION.videoModel.resolution must be one of ' + VIDEO_MODELS[vm.model].resolutions.join(', ') + ' for ' + vm.model);
      if (vm && vm.model !== 'host' && !selectionRecorded(vm.selection)) errors.push('Record the actual video model HITL choice in PRODUCTION.videoModel.selection');
    }
    errors.push(...coverageErrors(win));
    if (!full(p)) {
      const count = (win.SCENES || []).filter(s => eligible(s) &&
        (s.visual?.video || s.type === 'broll' || (s.type === 'quote' && typeof s.visual?.clip === 'object'))).length;
      if (p.mode === 'hybrid' && ((count < 1 && !(win.SCENES || []).some(reused)) || count > 2)) errors.push('hybrid needs 1–2 generated clips or at least one reused clip with zero generation; revise conflicting channel constraints before production');
      return errors;
    }
    const style = p.style || {};
    if (style.preset !== 'spatial-explainer' && !STYLES[style.preset]) errors.push('Choose an episode visual style before full_video');
    for (const key of ['reference', 'world', 'materials', 'palette', 'lighting', 'camera'])
      if (!text(style[key])) errors.push('PRODUCTION.style.' + key + ' is required');
    (win.SCENES || []).forEach((s, i) => {
      if (!eligible(s) || reused(s)) return;
      const v = s.visual || {}, design = s.shot?.videoDesign || {};
      const bad = message => errors.push('shot ' + (i + 1) + ': ' + message);
      if (s.shot?.render?.mode !== 'generated_video' || !v.video || v.slide || (v.source && v.source !== 'stock') || v.clip)
        bad('full_video needs a narrated visual.video handoff; no slide/still substitution or b-roll splice');
      if (['broll', 'quote'].includes(s.type)) bad('full_video generated cuts use ordinary narrated cards');
      // A stock photograph (visual.source "stock") is a supplied source image: a license record, no prompt.
      if (!text(v.bg) || (!text(v.bgPrompt) && v.source !== 'stock')) bad('keep a source image path and its generation prompt');
      if (!text(v.video?.prompt)) bad('store the motion prompt before generation');
      // The host video tool (owner directive 2026-09-07) tops out at 720p and takes every full_video cut.
      const hostVideo = p.videoProvider === 'host';
      // The API lane renders at the resolution the user chose with the model (PRODUCTION.videoModel); 1080p before that record exists.
      const wantRes = hostVideo ? '720p' : (p.videoModel?.resolution || '1080p');
      if (v.video?.resolution !== wantRes || v.video?.generateAudio !== false)
        bad(hostVideo ? 'the host video tool tops out at 720p; write resolution:"720p" and generateAudio:false with separate narration'
                      : 'write the chosen model\'s resolution (' + wantRes + ') and generateAudio:false with separate narration');
      if (v.video?.engine !== (hostVideo ? 'host' : 'seedance'))
        bad(hostVideo ? 'videoProvider:host routes every full_video cut to engine:"host" (the CLI\'s own image_to_video)'
                      : 'full_video uses the priced Seedance image-to-video route');
      for (const key of ['look', 'worldId', 'before', 'action', 'continuity', 'reject'])
        if (!text(design[key])) bad('videoDesign.' + key + ' is required');
      if (design.motion?.kind !== 'subject_action' && !text(design.after)) bad('videoDesign.after is required unless the last motion beat states the final result');
      if (design.camera !== undefined) bad('videoDesign.camera is retired; the camera lives in the four visual.camera slots');
      for (const slot of missingCameraSlots(v.camera))
        bad('visual.camera.' + slot + ' is required; the motion prompt is assembled from the four slots (speed may stay empty on a static camera)');
      if (!ALL_LOOKS.includes(design.look))
        bad('videoDesign.look must be one of ' + ALL_LOOKS.join(', '));
      if (STYLES[style.preset] && design.look !== 'archive' && !STYLES[style.preset].looks.includes(design.look))
        bad('videoDesign.look conflicts with the selected episode style');
      motionErrors(s).forEach(bad);
      if (!Array.isArray(s.narration) || !s.narration.length) bad('a generated cut needs its approved narration');
      if (s.title || s.stat || (s.bullets || []).length || s.footnote || !['none', undefined].includes(v.overlay))
        bad('only burned subtitles go over full-video footage; clear title, bullets, footnote and overlays');
    });
    // Three identical set-ups in a row read as one long take that keeps restarting. A change of
    // size, angle or move needs a reason, and the reason is the next sentence (full-video.md §Shot plan).
    const run = [];
    (win.SCENES || []).forEach((s, i) => {
      if (!eligible(s)) return;
      const camera = s.visual?.camera || {}, key = normalize(camera.framing) + '|' + normalize(camera.movement);
      if (run.length && run[run.length - 1].key !== key) run.length = 0;
      run.push({ key, shot: i + 1 });
      if (run.length === 3) errors.push('shots ' + run.map(r => r.shot).join(', ') + ': the same framing and camera move three times in a row; change size, angle or move for a reason');
    });
    // A full-video episode is carried by the camera as much as by the subject. ep411 held a
    // static or slow camera on wide miniature stages for 8 of 15 shots and measured like a
    // slideshow (2026-09-09): the camera moves on at least two of every three shots, never
    // stands still twice in a row, and at least half the shots come closer than wide.
    const generated = (win.SCENES || []).map((s, i) => ({ s, shot: i + 1 })).filter(({ s }) => eligible(s) && !reused(s));
    if (generated.length >= 3) {
      const statics = generated.filter(({ s }) => staticCamera(s.visual?.camera));
      if (statics.length * 3 > generated.length)
        errors.push(`${statics.length} of ${generated.length} shots hold a static camera; a full-video episode moves the camera on at least two of every three shots`);
      generated.forEach(({ s, shot }, k) => {
        if (k && staticCamera(s.visual?.camera) && staticCamera(generated[k - 1].s.visual?.camera))
          errors.push(`shots ${generated[k - 1].shot}, ${shot}: two static cameras in a row; move on one of them`);
      });
      const wide = generated.filter(({ s }) => WIDE.test(String(s.visual?.camera?.framing || '')));
      if (wide.length * 2 > generated.length)
        errors.push(`${wide.length} of ${generated.length} shots are framed wide; small figures on a wide stage read as a still on a phone — bring at least half the shots to medium or close`);
    }
    return errors;
  }
  function policy(base, production, scenes) {
    // The episode approval authorizes these two changes only. Keep channel motion floors,
    // voice, format, factual evidence and publishing gates intact.
    if (!production || !MODES[production.mode]) return base;
    return { ...base, videoBudgetUsd: production.videoBudgetUsd,
      generatedVideoMax: production.mode === 'hook_only' ? 1 : RATIOS[production.mode] ? scenes.filter(eligible).length : Math.min(base.generatedVideoMax ?? 2, 2) };
  }
  const api = { STYLES, MODES, CHOICES, RATIOS, newCut, generated, hookScene, coverageErrors, CAMERA_SLOTS, PREVIZ_RENDERERS, VIDEO_MODELS, packPresets, ALL_LOOKS, eligible, reused, reuseErrors, full, signature, check, policy, motionErrors, missingCameraSlots, cameraErrors, staticCamera, finalState };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PRODUCTION_MODE = api;
})(typeof window === 'object' ? window : globalThis);
