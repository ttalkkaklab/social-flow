// Resolve the board once per scene. The offline review and the request compiler use the same scopes.
(function (root) {
  'use strict';
  const catalogue = () => typeof module === 'object' && module.exports ? require('./film-techniques.js') : root.FILM_TECHNIQUES;
  const labels = {
    camera: ['카메라', 'Camera'], axis: ['촬영 축', 'Screen axis'], continuity: ['공간 연속성', 'Continuity'],
    lighting: ['기본 조명', 'Lighting'], attention: ['관객에게 보여줄 순서', 'Attention'],
    cameraPolicy: ['카메라 연출 원칙', 'Camera policy'], depthPolicy: ['심도 원칙', 'Depth policy'],
    lensPolicy: ['렌즈 원칙', 'Lens policy'], continuityChange: ['이 샷의 상태 변화', 'Continuity change'],
    shotLight: ['이 샷의 조명', 'Shot lighting'], soundPerspective: ['소리의 원근', 'Sound perspective']
  };
  const movement = id => catalogue().byId[id]?.fields?.movement;
  const text = value => typeof value === 'string' ? value.trim() : '';
  const scales = ['els','ls','ws','fs','mfs','ms','mcu','cu','choker','ecu'];
  const arrangements = ['single','two','three','group'];
  const cutRoles = ['insert','reaction','cutaway'];
  const legacyViews = {ots:'ots', pov:'pov', back:'rear'};
  // Old boards used a single choice for several independent decisions. Keep the authored
  // crop when the card gives no scale; an over-the-shoulder view implies no specific distance.
  function framing(card) {
    const plan = card.shot || {}, view = card.visual?.camera?.view || {}, size = plan.size;
    return {size:scales.includes(size) ? size : '', crop:text(view.crop) || (size && ![...scales, ...arrangements, ...cutRoles, ...Object.keys(legacyViews)].includes(size) ? text(size) : ''),
      angle:plan.angle === 'over' ? '' : plan.angle || '',
      viewpoint:view.mode || legacyViews[size] || (plan.angle === 'over' ? 'ots' : ''),
      arrangement:plan.arrangement || (arrangements.includes(size) ? size : ''),
      cutRole:plan.cutRole || (cutRoles.includes(size) ? size : '')};
  }
  function framingTerms(card) {
    const frame = framing(card);
    const view = !card.visual?.camera?.view && {ots:'over the shoulder',pov:'subjective point of view',rear:'seen from behind'}[frame.viewpoint];
    const arrangement = {single:'single subject',two:'two-shot',three:'three-shot',group:'group shot'}[frame.arrangement];
    return [view, arrangement, frame.cutRole && frame.cutRole + ' shot'].filter(Boolean);
  }
  function opticsWords(camera = {}) {
    return [camera.lensMm && camera.lensMm + ' mm lens', camera.fStop && 'f/' + camera.fStop,
      camera.focusDistanceM && 'focus distance ' + camera.focusDistanceM + ' m'].filter(Boolean).join(', ');
  }
  function actingFields(acting, includeVocal, seen, redact, accept = Boolean) {
    const words = [];
    for (const key of ['direction', 'context', 'intent', 'emotion', 'vocal', 'visual']) {
      const value = text(acting[key]);
      if (!value || seen.has(value) || (key === 'vocal' && !includeVocal)) continue;
      const cue = redact(value);
      if (!accept(cue)) continue;
      seen.add(value);
      words.push(key + ': ' + cue);
    }
    const tags = (acting.tags || []).map(redact).filter(accept);
    if (tags.length) words.push('vocal events: ' + tags.join(', '));
    return words;
  }
  const actingPauses = (lead, tail) => lead || tail ? 'Anticipation ' + (lead || 0) + ' seconds; reaction ' + (tail || 0) + ' seconds.' : '';
  function orderedSpeech(card) {
    const lines = card.narration || [];
    if (!card.performance?.length) return lines;
    const groups = new Set();
    for (const event of card.performance) {
      if ((event.kind === 'dialogue' || event.kind === 'narration') && Number.isInteger(event.group) && lines[event.group - 1])
        groups.add(event.group - 1);
    }
    lines.forEach((_, index) => groups.add(index));
    return Array.from(groups, index => lines[index]);
  }
  function notes(card, accept = Boolean, visualOnly = false, concise = false, scenePrompt = false) {
    const visual = card.visual || {}, video = visual.video || {}, source = video.promptSource || {};
    const design = card.shot?.videoDesign || {}, lines = card.narration || [];
    const spoken = lines.filter(line => line.delivery !== 'voiceover').map(line => text(line.tts)).filter(Boolean);
    const redact = cue => spoken.reduce((result,line) => result.split(line).join('the authored line'), cue);
    const beats = [], groups = new Set();
    function actionWords(event, i) {
      const cue = redact(text(event.videoDirection) || text(event.text));
      if (!cue || !accept(cue)) return;
      const duration = event.durationSeconds && !(scenePrompt && concise) ? ' for ' + event.durationSeconds + ' s' : '';
      const withLine = event.withGroup && !scenePrompt ? ' with speech group ' + event.withGroup : '';
      const label = scenePrompt ? [event.character, duration.trim()].filter(Boolean).join(' ') :
        concise ? [event.character, event.durationSeconds && event.durationSeconds+'s'].filter(Boolean).join(' ') :
        'Beat ' + (i+1) + (event.character ? ' (' + event.character + ')' : '') + duration;
      return (label || withLine ? label + withLine + ': ' : '') + cue;
    }
    function addLine(line, group, prefix, event = {}) {
      if (!line) return;
      const acting = {...line.acting};
      if (text(event.videoDirection)) acting.visual = event.videoDirection;
      // Native adapters bind vocal direction to the spoken turn. The picture carries how the actor performs it.
      if (visualOnly || line.delivery === 'voiceover') {
        delete acting.vocal; delete acting.direction; delete acting.tags;
      }
      const fields = actingFields(line.delivery === 'voiceover' ? {visual:acting.visual} : acting, line.delivery !== 'voiceover', new Set(), redact, accept);
      const pauses = actingPauses(acting.leadInSeconds, acting.tailOutSeconds);
      const to = line.delivery === 'voiceover' ? '' : text(event.to) || text(line.to);
      const listener = to && accept(redact(to)) ? redact(to) : '';
      const listenerInBeat = listener && scenePrompt && concise;
      if (listener && !listenerInBeat) fields.unshift((concise ? 'to ' : 'Addressed to ') + listener + '.');
      if (pauses) fields.push(pauses);
      if (scenePrompt) for (const [index, action] of (card.performance || []).entries()) {
        if (action.kind !== 'action' || action.withGroup !== group) continue;
        const cue = actionWords(action, index);
        if (cue) fields.push(cue);
      }
      if (line.delivery === 'voiceover') {
        if (fields.length) beats.push(fields.join(' '));
      } else if (fields.length || card.performance?.length || listenerInBeat) {
        const who = [line.speaker, scenePrompt ? undefined : line.id].filter(Boolean).join(', ');
        const label = listenerInBeat ? 'While ' + listener + ' listens, ' + (who || 'the speaker') + ' speaks' :
          scenePrompt ? (who ? 'As ' + who + ' speaks' : 'During dialogue') :
          concise ? (who || 'Line '+group) : prefix + 'line ' + group + (who ? ' (' + who + ')' : '');
        beats.push(label + (fields.length ? ': ' + fields.join(' ') : '.'));
      }
      groups.add(group);
    }
    (card.performance || []).forEach((event, i) => {
      if (event.kind !== 'action') return addLine(lines[event.group-1], event.group, 'Beat ' + (i+1) + ' with ', event);
      if (scenePrompt && lines[event.withGroup - 1]) return;
      const cue = actionWords(event, i);
      if (cue) beats.push(cue);
    });
    lines.forEach((line,i) => { if (!groups.has(i+1)) addLine(line, i+1, 'With '); });
    const seen = new Set();
    const actions = [card.timeline?.action, design.action, visual.action, design.motion?.visibleChange].map(text).filter(cue => {
      const key = cue.toLowerCase().replace(/[.!?\s]+$/, '');
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    // Historical sources fill missing attributes; a complete cached prompt never competes with current direction.
    if (!actions.length && text(source.action)) actions.push(text(source.action));
    const fallback = [card.summary].map(text).filter(Boolean);
    const motion = (design.motion?.beats || []).filter(beat => text(beat?.state))
      .map(beat => (Number.isFinite(beat.at) ? 'At ' + beat.at + ' s into this shot: ' : '') + text(beat.state));
    return {actions:actions.length ? actions : fallback.slice(0,1), fallback, motion,
      blocking:text(design.before), sound:text(card.sound?.diegetic) || text(design.sound) || text(visual.audio) || text(source.sound),
      end:text(design.after) || text(visual.frames?.endState) || text(source.end), beats};
  }
  function base(scene = {}) {
    const defaults = scene.directionDefaults || {};
    const rows = {};
    for (const key of Object.keys(labels)) {
      const value = defaults[key] || (key === 'camera' && scene.videoDirection?.camera);
      if (!value) continue;
      const fields = key === 'camera' && catalogue().byId[value]?.fields;
      rows[key] = {value, source:'scene', ...(fields?.movement ? {id:value} : {}), ...(fields?.speed ? {speed:fields.speed} : {})};
    }
    return rows;
  }
  // Readers that inspect the shot's camera can see the effective value without editing saved cards.
  function withCameraDefaults(cards, scenes) {
    if (!scenes?.length) return cards;
    const byScene = new Map(scenes.map(scene => [scene.no, base(scene).camera]));
    return cards.map(card => {
      const row = byScene.get(card?.scene), mode = card?.shot?.render?.mode;
      if (!row || (mode && mode !== 'generated_video') || text(card.visual?.camera?.movement) ||
          catalogue().selected(card).some(choice => choice.entry?.fields.movement)) return card;
      const camera = {...(row.speed ? {speed:row.speed} : {}), ...card.visual?.camera, movement:row.id ? movement(row.id) : row.value};
      const shot = row.id ? {...card.shot, techniques:[...(card.shot?.techniques || []), {id:row.id}]} : card.shot;
      return {...card, shot, visual:{...card.visual, camera}};
    });
  }
  function resolve(scene, cards) {
    const defaults = base(scene);
    let crossed, layout;
    const shots = cards.map(card => {
      const plan = card.shot || {}, camera = card.visual?.camera || {}, space = plan.space || {};
      const rows = {...defaults};
      if (text(plan.lineCrossing?.to)) crossed = text(plan.lineCrossing.to);
      const selected = catalogue().selected(card);
      const technique = selected.find(t => t.entry?.fields.movement);
      const inherited = defaults.camera;
      const qualified = text(camera.target) || text(camera.cue) || text(camera.speed);
      const move = camera.movement || technique?.entry.fields.movement || (qualified && inherited?.id && movement(inherited.id));
      if (move) {
        const entry = technique?.entry.fields.movement === move ? technique.entry : catalogue().entries.find(e => e.fields.movement === move);
        const speed = camera.speed || technique?.entry.fields.speed || (!camera.movement && !technique ? inherited?.speed : undefined);
        rows.camera = {value:move, id:entry?.id, source:'shot', ...(speed ? {speed} : {})};
      }
      if (plan.lineNeutral) rows.axis = {value:'Camera on the axis.', source:'shot'};
      else if (text(space.line) || crossed) rows.axis = {value:text(space.line) || crossed, source:space.line || plan.lineCrossing ? 'shot' : 'carry'};
      if (text(space.continuity)) layout = text(space.continuity);
      if (layout) rows.continuity = {value:layout, source:text(space.continuity) ? 'shot' : 'carry'};
      if (text(space.light)) rows.shotLight = {value:space.light, source:'shot'};
      if (text(plan.videoDesign?.continuity)) rows.continuityChange = {value:plan.videoDesign.continuity, source:'shot'};
      const perspective = card.sound?.perspective || plan.depth?.sound;
      if (perspective) rows.soundPerspective = {value:perspective, source:'shot'};
      return rows;
    });
    const common = Object.fromEntries(Object.entries(defaults).filter(([key]) => shots.every(rows => rows[key]?.source === 'scene')));
    return {defaults, common, shots};
  }
  const api = {labels, movement, scales, arrangements, cutRoles, framing, framingTerms, opticsWords, notes, base, resolve, withCameraDefaults, actingFields, actingPauses, orderedSpeech};
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SCENE_DIRECTION = api;
})(typeof window === 'object' ? window : globalThis);
