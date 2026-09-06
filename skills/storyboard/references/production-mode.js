/* Shared by the planner, approval page and production preflight. */
(function (root) {
  'use strict';
  const text = value => typeof value === 'string' && !!value.trim();
  const MODES = { hybrid: '혼합 제작', full_video: '전체 영상' };
  const STYLES = {
    'cinematic-miniature': { label: '시네마틱 미니어처 디오라마', looks: ['miniature', 'architectural'],
      prompt: 'Cinematic miniature diorama, tactile matte handcrafted surfaces, articulated miniature figures, coherent scale and soft contact shadows.' },
    'photoreal': { label: '완전 실사풍', looks: ['realistic'],
      prompt: 'Photoreal live-action cinematography: life-size human proportions, natural skin and fabric texture, real locations, physically plausible light and photographic lenses. No miniature, doll, illustration or cartoon treatment.' },
    'webtoon': { label: '웹툰풍', looks: ['webtoon'],
      prompt: 'Korean webtoon illustration: consistent expressive character linework, clean contour lines, controlled cel shading, illustrated backgrounds and a coherent drawn palette. No photographic skin, miniature dolls, speech balloons or panel borders.' }
  };
  function eligible(scene) {
    const v = scene.visual || {};
    return scene.type !== 'outro' && !(!v.video &&
      (['recording', 'screencast'].includes(v.source) || v.picture === 'recording'));
  }
  function full(production) { return production?.mode === 'full_video'; }
  // Outputs and approval metadata must not invalidate their own input signature.
  function signature(win) {
    const p = win.PRODUCTION || {};
    return JSON.stringify({ format: win.FORMAT, mode: p.mode, imageProvider: p.imageProvider, videoBudgetUsd: p.videoBudgetUsd,
      maxAttempts: p.maxAttempts, generationRevision: p.generationRevision, comparison: p.comparison, style: p.style,
      scenes: (win.SCENES || []).filter(eligible).map(s => {
        const v = s.visual || {}, video = { ...v.video };
        delete video.clip;
        return { type: s.type, duration: s.duration, narration: s.narration,
          render: s.shot?.render, design: s.shot?.videoDesign,
          frames: v.frames, imagePair: v.imagePair, styleRole: v.styleRole, stylePack: v.stylePack,
          bg: v.bg, bgPrompt: v.bgPrompt, camera: v.camera, action: v.action, video, engine: v.engine,
          prompt: v.prompt, clip: typeof v.clip === 'object' ? v.clip : undefined };
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
      const directions = [d.action, d.continuity, scene.visual?.video?.prompt].join(' ');
      if (/keep (?:every|all) (?:person|people|characters?).{0,40}fixed|(?:people|women|characters?) (?:and door )?(?:stay|remain) fixed|only (?:very )?(?:small|subtle) (?:natural )?breathing|no new text, objects or actions/i.test(directions))
        errors.push('Subject action contradicts a global freeze or breathing-only instruction');
    }
    return errors;
  }
  function check(win, { requireSelection = false, requireApproval = false, draft = false } = {}) {
    const p = win.PRODUCTION, errors = [];
    if (!p) return requireSelection ? ['Choose hybrid or full_video with a cost comparison before generation'] : [];
    if (!MODES[p.mode]) errors.push('PRODUCTION.mode must be hybrid or full_video');
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
    if (['photoreal', 'webtoon'].includes(chosen) && p.style.referencePack)
      errors.push('Photoreal/webtoon must not inherit the miniature reference pack');
    if (draft) return errors; // Shot assets/designs are authored after the narration-only draft.
    if (!full(p)) {
      const count = (win.SCENES || []).filter(s => eligible(s) &&
        (s.visual?.video || s.type === 'broll' || (s.type === 'quote' && typeof s.visual?.clip === 'object'))).length;
      if (p.mode === 'hybrid' && (count < 1 || count > 2)) errors.push('hybrid needs 1–2 generated clips; revise conflicting channel constraints before production');
      return errors;
    }
    const style = p.style || {};
    if (style.preset !== 'spatial-explainer' && !STYLES[style.preset]) errors.push('Choose an episode visual style before full_video');
    for (const key of ['reference', 'world', 'materials', 'palette', 'lighting', 'camera'])
      if (!text(style[key])) errors.push('PRODUCTION.style.' + key + ' is required');
    (win.SCENES || []).forEach((s, i) => {
      if (!eligible(s)) return;
      const v = s.visual || {}, design = s.shot?.videoDesign || {};
      const bad = message => errors.push('shot ' + (i + 1) + ': ' + message);
      if (s.shot?.render?.mode !== 'generated_video' || !v.video || v.slide || v.source || v.clip)
        bad('full_video needs a narrated visual.video handoff; no slide/still substitution or b-roll splice');
      if (['broll', 'quote'].includes(s.type)) bad('full_video generated cuts use ordinary narrated cards');
      if (!text(v.bg) || !text(v.bgPrompt)) bad('keep a source image path and its generation prompt');
      if (!text(v.video?.prompt)) bad('store the motion prompt before generation');
      if (v.video?.resolution !== '1080p' || v.video?.generateAudio !== false)
        bad('reference quality uses explicit 1080p and generateAudio:false with separate narration');
      if (v.video?.engine !== 'seedance') bad('spatial-explainer currently uses the priced Seedance image-to-video route');
      for (const key of ['look', 'worldId', 'before', 'action', 'after', 'camera', 'continuity', 'reject'])
        if (!text(design[key])) bad('videoDesign.' + key + ' is required');
      if (!['miniature', 'architectural', 'realistic', 'webtoon', 'archive'].includes(design.look))
        bad('videoDesign.look must be miniature, architectural, realistic, webtoon or archive');
      if (STYLES[style.preset] && design.look !== 'archive' && !STYLES[style.preset].looks.includes(design.look))
        bad('videoDesign.look conflicts with the selected episode style');
      motionErrors(s).forEach(bad);
      if (!Array.isArray(s.narration) || !s.narration.length) bad('a generated cut needs its approved narration');
      if (s.title || s.stat || (s.bullets || []).length || s.footnote || !['none', undefined].includes(v.overlay))
        bad('only burned subtitles go over full-video footage; clear title, bullets, footnote and overlays');
    });
    return errors;
  }
  function policy(base, production, scenes) {
    // The episode approval authorizes these two changes only. Keep channel motion floors,
    // voice, format, factual evidence and publishing gates intact.
    if (!production || !MODES[production.mode]) return base;
    return { ...base, videoBudgetUsd: production.videoBudgetUsd,
      generatedVideoMax: full(production) ? scenes.filter(eligible).length : Math.min(base.generatedVideoMax ?? 2, 2) };
  }
  const api = { STYLES, MODES, eligible, full, signature, check, policy, motionErrors };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PRODUCTION_MODE = api;
})(typeof window === 'object' ? window : globalThis);
