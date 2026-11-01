/* Shared prop ledger: browser review, MCP edits and production use this module. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PropContinuity = factory();
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';
  const VERSION = 1;
  const ACTIONS = ['transfer', 'lend', 'return', 'pick_up', 'put_down', 'lose', 'damage', 'repair', 'move', 'correct'];
  const FIELDS = ['ownerId', 'holderId', 'location', 'condition'];
  const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
  const text = x => typeof x === 'string' && x.trim().length > 0;
  const point = x => object(x) && Number.isInteger(x.day) && x.day >= 0 && Number.isInteger(x.order) && x.order >= 0;
  const compare = (a, b) => a.day - b.day || a.order - b.order;
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const unknown = () => ({ ownerId: 'unknown', holderId: 'unknown', location: 'unknown', condition: 'unknown' });
  function data(win) {
    const doc = object(win.SB_DOC) ? win.SB_DOC : {};
    return { doc, props: Array.isArray(doc.props) ? doc.props : [], ledger: doc.propContinuity };
  }
  function stateAt(win, propId, at, side = 'after') {
    if (!point(at)) throw new Error('Story point requires nonnegative integer day and order');
    const { props, ledger } = data(win);
    const prop = props.find(p => p && p.id === propId);
    if (!prop) throw new Error('Unknown prop: ' + propId);
    const initial = ledger?.initial?.find(s => s.propId === propId);
    if (!initial) return { ...unknown(), ownerId: prop.characterId || 'unknown' };
    if (compare(at, initial.at) < 0) return unknown();
    let state = { ...unknown(), ...initial.state };
    const events = (ledger.events || []).filter(e => e.propId === propId &&
      (compare(e.at, at) < 0 || (side === 'after' && compare(e.at, at) === 0)))
      .slice().sort((a, b) => compare(a.at, b.at));
    for (const event of events) state = { ...state, ...event.to };
    return state;
  }
  function check(win) {
    const { doc, props, ledger } = data(win);
    const findings = [];
    const bad = (where, what) => findings.push({ level: 'bad', where, what });
    const warn = (where, what) => findings.push({ level: 'warn', where, what });
    if (doc.props !== undefined && !Array.isArray(doc.props)) bad('props', 'props must be an array');
    if (ledger !== undefined && (!object(ledger) || ledger.version !== VERSION || !text(ledger.timelineId) ||
        !Array.isArray(ledger.initial) || !Array.isArray(ledger.events))) {
      bad('props', 'propContinuity requires version:1, timelineId, initial[] and events[]'); return findings;
    }
    const chars = new Set((Array.isArray(doc.characters) ? doc.characters : []).map(c => c?.id));
    if (props.length || ledger) {
      const seen = new Set();
      for (const c of Array.isArray(doc.characters) ? doc.characters : []) {
        if (!text(c?.id) || c.id === 'unknown' || seen.has(c.id)) bad('props', 'Characters require unique non-reserved ids (unknown is reserved)');
        seen.add(c?.id);
      }
    }
    const ids = new Set();
    for (const p of props) {
      if (!object(p) || !text(p.id) || ids.has(p.id)) { bad('props', 'Every prop needs a unique id'); continue; }
      ids.add(p.id);
      if (p.tracking !== undefined && !['appearance', 'continuity'].includes(p.tracking)) bad(p.id, 'tracking must be appearance or continuity');
      if (p.characterId != null && !chars.has(p.characterId)) bad(p.id, 'Unknown legacy owner characterId');
      if (p.tracking === 'continuity' && !ledger) bad(p.id, 'Continuity tracking requires a ledger');
      if (!ledger && p.characterId) warn(p.id, 'Legacy ownership only; holder and past history are unknown');
      if (p.references !== undefined && (!Array.isArray(p.references) || p.references.some(r => !object(r) || !text(r.path) || !text(r.version))))
        bad(p.id, 'references require path and version');
    }
    const validState = (s, where, full) => {
      if (!object(s)) { bad(where, 'state must be an object'); return; }
      for (const key of Object.keys(s)) if (!FIELDS.includes(key)) bad(where, 'Unknown state field: ' + key);
      for (const key of FIELDS) {
        if (!(key in s)) { if (full) bad(where, 'Missing state field: ' + key); continue; }
        const v = s[key];
        if (key.endsWith('Id')) {
          if (v !== null && v !== 'unknown' && !chars.has(v)) bad(where, 'Unknown character: ' + key + '=' + String(v));
        } else if (v !== null && !text(v)) bad(where, key + ' must be nonempty text, unknown or null');
      }
    };
    if (ledger) {
      const initials = new Map();
      for (const s of ledger.initial) {
        if (!object(s) || !ids.has(s.propId) || initials.has(s.propId)) { bad('props', 'Initial state requires one registered propId'); continue; }
        initials.set(s.propId, s);
        if (!point(s.at)) bad(s.propId, 'Invalid initial story point');
        validState(s.state, s.propId, true);
      }
      for (const p of props) if (p?.tracking === 'continuity' && !initials.has(p.id)) bad(p.id, 'Missing initial state');
      const eventIds = new Set(), times = new Set();
      const shots = new Set((win.SCENES || []).map(s => s?.id));
      for (const e of ledger.events) {
        if (!object(e)) { bad('props', 'event must be an object'); continue; }
        const where = 'prop event ' + (e.id || '?');
        if (!text(e.id) || eventIds.has(e.id)) bad(where, 'event id must be unique');
        eventIds.add(e.id);
        if (!ids.has(e.propId) || !initials.has(e.propId)) bad(where, 'event requires a registered prop and initial state');
        if (!point(e.at)) bad(where, 'Invalid event story point');
        else {
          const key = JSON.stringify([e.propId, e.at.day, e.at.order]);
          if (times.has(key)) bad(where, 'One atomic event per prop and story point; use a different order');
          times.add(key);
          const initial = initials.get(e.propId);
          if (point(initial?.at) && compare(e.at, initial.at) <= 0) bad(where, 'event must follow initial state');
        }
        if (!ACTIONS.includes(e.kind)) bad(where, 'Unknown event kind');
        if (!text(e.reason)) bad(where, 'Explain the action or offscreen change');
        if (!text(e.recordedAt) || !Number.isFinite(Date.parse(e.recordedAt))) bad(where, 'recordedAt requires an ISO timestamp');
        if (!text(e.recordedBy)) bad(where, 'recordedBy is required');
        validState(e.from, where + ' from', false); validState(e.to, where + ' to', false);
        if (object(e.to) && !Object.keys(e.to).length) bad(where, 'to must change at least one field');
        if (object(e.to) && object(e.from)) for (const k of Object.keys(e.to)) if (!(k in e.from)) bad(where, 'from must include changed field: ' + k);
        if (e.shotIds !== undefined && (!Array.isArray(e.shotIds) || e.shotIds.some(id => !shots.has(id)))) bad(where, 'Unknown shotIds');
      }
      if (!findings.some(f => f.level === 'bad')) {
        for (const e of ledger.events) {
          const before = stateAt(win, e.propId, e.at, 'before');
          for (const [key, value] of Object.entries(e.from)) if (!same(before[key], value)) bad(e.id, 'Stale from.' + key + ': expected ' + JSON.stringify(before[key]));
          const knownHolder = text(before.holderId) && before.holderId !== 'unknown';
          const allowed = {
            transfer: ['ownerId', 'holderId', 'location'], lend: ['holderId', 'location'],
            return: ['holderId', 'location'], pick_up: ['holderId', 'location'],
            put_down: ['holderId', 'location'], lose: ['holderId', 'location'],
            damage: ['condition'], repair: ['condition'], move: ['location'], correct: FIELDS,
          };
          for (const key of Object.keys(e.to)) if (!allowed[e.kind].includes(key)) bad(e.id, e.kind + ' cannot change ' + key);
          if (['lend', 'return', 'put_down'].includes(e.kind) && !knownHolder) bad(e.id, e.kind + ' requires a known current holder');
          if (['lend', 'return', 'pick_up'].includes(e.kind) && e.to.holderId === before.holderId) bad(e.id, 'Recipient must differ from the current holder');
          if (e.kind === 'pick_up' && knownHolder) bad(e.id, 'pick_up requires no known holder; use a handoff action');
          if ('holderId' in e.to && e.to.holderId !== before.holderId && !('location' in e.to)) bad(e.id, 'Custody change requires the new location');
          if (e.kind === 'transfer' && 'holderId' in e.to && e.to.holderId !== before.holderId && !knownHolder) bad(e.id, 'A handoff requires a known current holder; use pick_up or correct');
          if (e.kind === 'transfer' && e.to.ownerId === before.ownerId) bad(e.id, 'transfer must change the owner');
          if (!Object.keys(e.to).some(key => !same(before[key], e.to[key]))) bad(e.id, 'Event must change state');
          if (['lend', 'return', 'pick_up'].includes(e.kind) && (!text(e.to.holderId) || e.to.holderId === 'unknown')) bad(e.id, e.kind + ' requires a known holder');
          if (['lend', 'return', 'pick_up', 'put_down', 'lose', 'move', 'damage', 'repair'].includes(e.kind) && 'ownerId' in e.to && e.to.ownerId !== before.ownerId) bad(e.id, 'Only transfer or correct changes ownership');
          if (e.kind === 'transfer' && !('ownerId' in e.to)) bad(e.id, 'transfer requires ownerId');
          if (e.kind === 'put_down' && (e.to.holderId !== null || !text(e.to.location) || e.to.location === 'unknown')) bad(e.id, 'put_down requires no holder and a known location');
          if (e.kind === 'lose' && (e.to.holderId !== 'unknown' || e.to.location !== 'unknown')) bad(e.id, 'lose requires unknown holder and location');
          if (['damage', 'repair'].includes(e.kind) && (!text(e.to.condition) || e.to.condition === before.condition)) bad(e.id, e.kind + ' requires a changed condition');
          if ('condition' in e.to && !['damage', 'repair', 'correct'].includes(e.kind)) bad(e.id, 'Condition changes require damage, repair or correct');
        }
      }
    }
    for (const [i, shot] of (win.SCENES || []).entries()) {
      const where = 'shot ' + (shot?.id || i + 1), v = shot?.visual || {};
      if (v.props !== undefined && (!Array.isArray(v.props) || v.props.some(id => !ids.has(id)))) bad(where, 'visual.props must reference registered prop ids');
      if (v.propUsage === undefined) {
        if ((Array.isArray(v.props) ? v.props : []).some(id => props.find(p => p?.id === id)?.tracking === 'continuity')) bad(where, 'Tracked props require propUsage');
        continue;
      }
      if (!Array.isArray(v.propUsage)) { bad(where, 'propUsage must be an array'); continue; }
      const used = new Set();
      for (const u of v.propUsage) {
        if (!object(u) || !ids.has(u.propId) || used.has(u.propId)) { bad(where, 'propUsage requires unique registered propId'); continue; }
        used.add(u.propId);
        if (!Array.isArray(v.props) || !v.props.includes(u.propId)) bad(where, 'propUsage must also be listed in visual.props');
        if (!point(u.start) || !point(u.end) || compare(u.start, u.end) > 0) { bad(where, 'propUsage requires ordered start/end story points'); continue; }
        if (u.visible !== undefined && typeof u.visible !== 'boolean') bad(where, 'visible must be boolean');
        if (u.position !== undefined && !text(u.position)) bad(where, 'position must be text');
        for (const key of ['expectedStart', 'expectedEnd']) if (u[key] !== undefined) {
          validState(u[key], where, false);
          if (object(u[key]) && !findings.some(f => f.level === 'bad')) {
            const actual = stateAt(win, u.propId, key === 'expectedStart' ? u.start : u.end);
            for (const [field, value] of Object.entries(u[key])) if (!same(actual[field], value)) bad(where, key + '.' + field + ' contradicts the ledger');
          }
        }
      }
      for (const id of Array.isArray(v.props) ? v.props : []) if (props.find(p => p?.id === id)?.tracking === 'continuity' && !used.has(id)) bad(where, 'Missing propUsage for ' + id);
    }
    const list = x => Array.isArray(x) ? x : [];
    const shown = new Set([...(win.SCENES || []).flatMap(s => [...list(s?.visual?.props), ...list(s?.visual?.frames?.endProps)]),
      ...list(object(ledger) ? ledger.events : []).filter(e => object(e) && list(e.shotIds).length).map(e => e.propId)]);
    for (const p of props) if (object(p) && text(p.id) && !shown.has(p.id))
      warn(p.id, 'No shot links this prop yet (visual.props, frames.endProps or an event shotIds); link it to the shots it appears in, or drop it if the story does not need it');
    return findings;
  }
  // ids defaults to the shot's visual.props; an end image passes its own frames.endProps.
  // lenient: instead of throwing on ledger errors, a prop the errors concern gets no state and lists them in errors.
  function snapshot(win, index, ids, opts = {}) {
    const failures = check(win).filter(f => f.level === 'bad');
    if (failures.length && !opts.lenient) throw new Error(failures.map(f => f.where + ': ' + f.what).join('; '));
    const { props, ledger } = data(win);
    const shot = win.SCENES?.[index], visual = shot?.visual || {};
    const eventProp = new Map((Array.isArray(ledger?.events) ? ledger.events : []).filter(object).map(e => [String(e.id), e.propId]));
    // A finding concerns a prop when it names the prop, one of its events, this shot, or the whole ledger.
    const concerns = (f, id) => { const w = String(f.where).replace(/^prop event /, '').replace(/ (from|to)$/, '');
      return w === id || w === 'props' || f.where === 'shot ' + (shot?.id || index + 1) || eventProp.get(w) === id; };
    const usage = Array.isArray(visual.propUsage) ? visual.propUsage.filter(object) : [];
    return (ids || visual.props || []).map(id => {
      const prop = props.find(p => p?.id === id);
      if (!prop) throw new Error('Unknown prop: ' + id);
      const u = usage.find(item => item.propId === id);
      const errors = failures.filter(f => concerns(f, id)).map(f => f.where + ': ' + f.what);
      const at = point => { try { return u && !errors.length ? stateAt(win, prop.id, point) : null; } catch (e) { errors.push(e.message); return null; } };
      const before = at(u?.start), after = at(u?.end);
      // Best first: a reference drawn in this condition, then one of the current appearance version.
      const rank = (r, state) => (r.condition && r.condition === state?.condition ? 2 : 0) + (prop.appearanceVersion && r.version === prop.appearanceVersion ? 1 : 0);
      const refs = state => (Array.isArray(prop.references) ? prop.references : []).filter(r => object(r)).filter(r => !r.condition || r.condition === state?.condition)
        .map((r, i) => ({ r, i })).sort((a, b) => rank(b.r, state) - rank(a.r, state) || a.i - b.i).map(({ r }) => ({ ...r }));
      return { propId: prop.id, name: prop.name || prop.id, description: prop.description || '',
        appearanceVersion: prop.appearanceVersion || 'unversioned', references: refs(before), endReferences: refs(after),
        timelineId: ledger?.timelineId || null, start: u ? { ...u.start } : null, end: u ? { ...u.end } : null,
        before, after, visible: u?.visible !== false, position: u?.position || null, ...(opts.lenient ? { errors } : {}) };
    });
  }
  function prompt(win, index) {
    return snapshot(win, index).filter(p => p.visible).map(p =>
      'Prop ' + p.propId + ' (' + p.name + '), appearance ' + p.appearanceVersion + ': ' + p.description +
      (p.before ? '. Opening state ' + JSON.stringify(p.before) + '; closing state ' + JSON.stringify(p.after) : '. Appearance reference only') +
      (p.position ? '; screen position ' + p.position : '') + '.').join('\n');
  }
  return { VERSION, ACTIONS, FIELDS, compare, check, stateAt, snapshot, prompt };
});
