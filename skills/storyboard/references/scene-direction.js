// Resolve the board once per scene. The offline review and the request compiler use the same scopes.
(function (root) {
  'use strict';
  const catalogue = () => typeof module === 'object' && module.exports ? require('./film-techniques.js') : root.FILM_TECHNIQUES;
  const labels = {
    camera: ['카메라', 'Camera'], axis: ['촬영 축', 'Screen axis'], continuity: ['공간 연속성', 'Continuity'],
    lighting: ['조명', 'Lighting'], attention: ['시선 흐름', 'Attention']
  };
  const movement = id => catalogue().byId[id]?.fields?.movement;
  const text = value => typeof value === 'string' ? value.trim() : '';
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
    const spoken = lines.map(line => text(line.tts)).filter(Boolean);
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
      const fields = actingFields(acting, line.delivery !== 'voiceover', new Set(), redact, accept);
      const pauses = actingPauses(acting.leadInSeconds, acting.tailOutSeconds);
      const to = text(event.to) || text(line.to);
      if (to && accept(redact(to))) fields.unshift((concise ? 'to ' : 'Addressed to ') + redact(to) + '.');
      if (pauses) fields.push(pauses);
      if (scenePrompt) for (const [index, action] of (card.performance || []).entries()) {
        if (action.kind !== 'action' || action.withGroup !== group) continue;
        const cue = actionWords(action, index);
        if (cue) fields.push(cue);
      }
      if (fields.length || card.performance?.length) {
        const who = [line.speaker, scenePrompt ? undefined : line.id].filter(Boolean).join(', ');
        const label = scenePrompt ? (who ? 'As ' + who + ' speaks' : 'During dialogue') :
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
    const actions = [card.timeline?.action, source.action, design.action, visual.action, design.motion?.visibleChange].map(text).filter(cue => {
      const key = cue.toLowerCase().replace(/[.!?\s]+$/, '');
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const fallback = [card.summary, video.prompt].map(text).filter(Boolean);
    const motion = (design.motion?.beats || []).filter(beat => text(beat?.state))
      .map(beat => (Number.isFinite(beat.at) ? 'At ' + beat.at + ' s into this shot: ' : '') + text(beat.state));
    return {actions:actions.length ? actions : fallback.slice(0,1), fallback, motion,
      blocking:text(design.before), sound:text(source.sound) || text(design.sound),
      end:text(source.end) || text(design.after) || text(visual.frames?.endState), beats};
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
    let crossed;
    const shots = cards.map(card => {
      const plan = card.shot || {}, camera = card.visual?.camera || {}, space = plan.space || {};
      const rows = {...defaults};
      if (text(plan.lineCrossing?.to)) crossed = text(plan.lineCrossing.to);
      const selected = catalogue().selected(card);
      const technique = selected.find(t => t.entry?.fields.movement);
      const move = camera.movement || technique?.entry.fields.movement;
      if (move) {
        const entry = technique?.entry.fields.movement === move ? technique.entry : catalogue().entries.find(e => e.fields.movement === move);
        const speed = camera.speed || technique?.entry.fields.speed;
        rows.camera = {value:move, id:entry?.id, source:'shot', ...(speed ? {speed} : {})};
      }
      if (plan.lineNeutral) rows.axis = {value:'Camera on the axis.', source:'shot'};
      else if (text(space.line) || crossed) rows.axis = {value:text(space.line) || crossed, source:space.line || plan.lineCrossing ? 'shot' : 'carry'};
      if (text(space.light)) rows.lighting = {value:space.light, source:'shot'};
      if (text(plan.videoDesign?.continuity)) rows.continuity = {value:plan.videoDesign.continuity, source:'shot'};
      if (defaults.attention) {
        const focus = selected.find(t => t.entry?.fields.focus);
        const from = text(focus?.from), to = text(focus?.to);
        const shift = from && to ? 'From ' + from + ' to ' + to : to || from;
        const subject = shift || (plan.depth?.mode === 'shallow' && text(plan.depth.focus)) || text(camera.view?.subject);
        if (subject) rows.attention = {value:subject, source:'shot'};
      }
      return rows;
    });
    const common = Object.fromEntries(Object.entries(defaults).filter(([key]) => shots.every(rows => rows[key]?.source === 'scene')));
    return {defaults, common, shots};
  }
  const api = {labels, movement, notes, base, resolve, withCameraDefaults, actingFields, actingPauses, orderedSpeech};
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SCENE_DIRECTION = api;
})(typeof window === 'object' ? window : globalThis);
