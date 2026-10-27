(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SFSourceContext = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
'use strict';

// Editorial context explains why the picture exists; it is not a list of objects to draw.
const OPEN = '[EDITORIAL_CONTEXT_JSON]';
const CLOSE = '[/EDITORIAL_CONTEXT_JSON]';
const text = value => typeof value === 'string' ? value.trim() : '';
function context(scene = {}, story = {}) {
  const values = {
    spokenMeaning: (scene.narration || []).map(line => text(line.tts) || text(line.sub)).filter(Boolean).join(' '),
    shotMeaning: text(scene.shot?.info),
    visualPurpose: text(scene.shot?.render?.reason),
    storyKind: text(story.kind),
    adaptationBoundary: text(story.adaptationBoundary)
  };
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value));
}
function guidance(value) {
  if (!value || !Object.keys(value).length) return '';
  return 'Depict only the authored opening instant and its visible subjects. The opening state and camera composition control the picture; the subsequent action and completed result belong to later frames. ' +
    'The following editorial context explains the shot, not additional objects, visible writing or actions to draw. Speech may carry facts that the picture cannot show. Support that meaning through the planned depiction; do not invent a historical incident, quotation, document or causal proof to illustrate it. Respect the stated evidence and adaptation boundary. ' +
    OPEN + JSON.stringify(value) + CLOSE;
}
function withoutContext(value) {
  return String(value).replace(/\[EDITORIAL_CONTEXT_JSON\]([\s\S]*?)\[\/EDITORIAL_CONTEXT_JSON\]/g, (block, json) => {
    try {
      const parsed = JSON.parse(json);
      const keys = ['spokenMeaning', 'shotMeaning', 'visualPurpose', 'storyKind', 'adaptationBoundary'];
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Object.keys(parsed).every(key => keys.includes(key) && typeof parsed[key] === 'string') ? '' : block;
    } catch { return block; }
  });
}
return { context, guidance, withoutContext };
});
