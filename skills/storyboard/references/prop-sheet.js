/* Read-only offline view; edits go through storyboard_apply's atomic validation. */
(function () {
  'use strict';
  const app = document.getElementById('app'), api = window.PropContinuity;
  if (!app || !api) return;
  const doc = window.SB_DOC || {}, props = Array.isArray(doc.props) ? doc.props : [];
  const ko = document.documentElement.lang === 'ko';
  const t = (a, b) => ko ? a : b;
  const el = (tag, text, cls) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (cls) node.className = cls;
    return node;
  };
  const section = el('section', undefined, 'prop-sheet'); section.id = 'props';
  section.append(el('h2', t('소품 시트', 'Prop sheets')));
  section.append(el('p', t('이야기 시점을 선택하면 그때의 소유자와 소지자를 보여줍니다.', 'Select a story point to inspect ownership and custody at that time.')));
  const nav = document.querySelector('.review-jump');
  if (nav) { const a = el('a', t('소품', 'Props')); a.href = '#props'; nav.append(a); }
  const notes = document.getElementById('review-notes'); app.insertBefore(section, notes || null);
  if (!props.length) { section.append(el('p', t('등록한 소품이 없습니다.', 'No props registered.'))); return; }
  const findings = api.check(window);
  const errors = findings.filter(f => f.level === 'bad');
  if (findings.length) {
    const list = el('ul', undefined, 'prop-findings'); list.setAttribute('role', 'status');
    for (const f of findings) list.append(el('li', f.where + ': ' + f.what));
    section.append(list);
  }
  if (errors.length) { section.append(el('p', t('이력 오류를 수정하면 시점별 상태를 조회할 수 있습니다.', 'Fix ledger errors before querying states.'))); return; }
  const ledger = doc.propContinuity || { initial: [], events: [] };
  const points = new Map();
  const addPoint = p => { if (p) points.set(p.day + ':' + p.order, p); };
  ledger.initial.forEach(s => addPoint(s.at)); ledger.events.forEach(e => addPoint(e.at));
  (window.SCENES || []).forEach(s => (s.visual?.propUsage || []).forEach(u => { addPoint(u.start); addPoint(u.end); }));
  if (!points.size) addPoint({ day: 0, order: 0 });
  const ordered = [...points.values()].sort(api.compare);
  const stamp = p => t('극중 ', 'Story day ') + p.day + ' · ' + p.order;
  const toolbar = el('div', undefined, 'prop-controls');
  const timeLabel = el('label', t('기준 시점 ', 'As of '));
  const time = el('select'); time.id = 'prop-time'; time.setAttribute('aria-label', t('이야기 시점', 'Story point'));
  ordered.forEach((p, i) => { const o = el('option', stamp(p)); o.value = String(i); time.append(o); });
  time.value = String(ordered.length - 1); timeLabel.append(time); toolbar.append(timeLabel);
  const charLabel = el('label', t('캐릭터 ', 'Character '));
  const filter = el('select'); filter.id = 'prop-character'; filter.setAttribute('aria-label', t('소품 캐릭터', 'Prop character'));
  const all = el('option', t('전체', 'All')); all.value = ''; filter.append(all);
  for (const c of doc.characters || []) { const o = el('option', c.name || c.id); o.value = c.id; filter.append(o); }
  charLabel.append(filter); toolbar.append(charLabel); section.append(toolbar);
  const output = el('div'); output.setAttribute('aria-live', 'polite'); section.append(output);
  const charName = id => id === null ? t('없음', 'None') : id === 'unknown' ? t('모름', 'Unknown') : (doc.characters || []).find(c => c.id === id)?.name || id;
  const literal = value => value === null ? t('없음', 'None') : value === 'unknown' ? t('모름', 'Unknown') : value;
  const stateText = s => t('소유: ', 'Owner: ') + charName(s.ownerId) + ' · ' + t('소지: ', 'Holder: ') + charName(s.holderId) +
    ' · ' + t('위치: ', 'Location: ') + literal(s.location) + ' · ' + t('상태: ', 'Condition: ') + literal(s.condition);
  function draw() {
    output.replaceChildren();
    const at = ordered[Number(time.value)];
    output.append(el('p', stamp(at) + t(' 기준', ' — selected point')));
    let count = 0;
    for (const prop of props) {
      const state = api.stateAt(window, prop.id, at);
      if (filter.value && state.ownerId !== filter.value && state.holderId !== filter.value) continue;
      count++;
      const card = el('article', undefined, 'prop-card'); card.id = 'prop-' + prop.id;
      card.append(el('h3', prop.name || prop.id));
      card.append(el('p', prop.id + ' · ' + (prop.tracking || 'appearance') + ' · ' + (prop.appearanceVersion || t('외형 버전 미지정', 'Unversioned appearance')), 'prop-muted'));
      const refs = prop.references || [];
      const image = refs.find(ref => ref.condition === state.condition)?.path
        || prop.imageUrl || refs.find(ref => !ref.condition)?.path;
      if (typeof image === 'string' && !/^\s*(?:javascript|data|vbscript):/i.test(image)) {
        const img = el('img'); img.src = image; img.alt = prop.name || prop.id; img.loading = 'lazy'; card.append(img);
      }
      if (prop.description) card.append(el('p', prop.description));
      card.append(el('p', stateText(state), 'prop-state'));
      const history = el('details'); history.append(el('summary', t('변경 이력과 등장 샷', 'History and appearances')));
      const initial = ledger.initial.find(s => s.propId === prop.id);
      if (initial) history.append(el('p', stamp(initial.at) + ' · ' + t('초기 상태 · ', 'Initial state · ') + stateText(initial.state)));
      else history.append(el('p', t('과거 이력과 소지자는 확인되지 않았습니다.', 'Past history and custody have not been established.')));
      const list = el('ol');
      for (const e of ledger.events.filter(e => e.propId === prop.id).slice().sort((a, b) => api.compare(a.at, b.at))) {
        const row = el('li', stamp(e.at) + ' · ' + e.kind + ' · ' + e.reason);
        row.append(el('p', stateText(api.stateAt(window, prop.id, e.at))));
        row.append(el('small', e.recordedAt + ' · ' + e.recordedBy)); list.append(row);
      }
      history.append(list);
      (window.SCENES || []).forEach((shot, i) => {
        if (!(shot.visual?.props || []).includes(prop.id)) return;
        const row = el('p');
        const link = el('a', t('샷 ', 'Shot ') + (i + 1) + ' · ' + (shot.title || shot.id || '')); link.href = '#shot-' + (i + 1); row.append(link);
        const usage = shot.visual?.propUsage?.find(u => u.propId === prop.id);
        if (usage) row.append(el('span', ' — ' + stamp(usage.start) + ' → ' + stamp(usage.end)));
        history.append(row);
      });
      card.append(history); output.append(card);
    }
    if (!count) output.append(el('p', t('이 시점에 연결된 소품이 없습니다.', 'No linked props at this point.')));
  }
  (window.SCENES || []).forEach((shot, i) => {
    const host = document.getElementById('shot-' + (i + 1));
    if (!host || !(shot.visual?.props || []).length) return;
    const detail = el('details', undefined, 'prop-shot');
    detail.append(el('summary', t('소품 상태', 'Prop continuity')));
    for (const p of api.snapshot(window, i)) {
      const line = el('p');
      const link = el('a', p.name); link.href = '#prop-' + encodeURIComponent(p.propId); line.append(link);
      if (!p.start) { line.append(el('span', t(' · 등장만 관리', ' · Appearance only'))); detail.append(line); continue; }
      line.append(el('span', ' · ' + stamp(p.start) + ' → ' + stamp(p.end)));
      detail.append(line, el('p', t('시작 · ', 'Start · ') + stateText(p.before)), el('p', t('종료 · ', 'End · ') + stateText(p.after)));
    }
    host.append(detail);
  });
  time.addEventListener('change', draw); filter.addEventListener('change', draw); draw();
  const exportButton = el('button', t('소품 편집 데이터 내보내기', 'Export prop edit data')); exportButton.type = 'button';
  exportButton.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ props: doc.props, continuity: doc.propContinuity }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), a = el('a'); a.href = url; a.download = 'prop-sheet.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  section.append(exportButton);
  section.append(el('p', t('소품을 수정하거나 전달 사건을 추가하려면 에이전트에게 요청하세요. 내보낸 데이터는 prop-sheet CLI로 검증한 뒤 저장할 수 있습니다.', 'Ask the agent to edit a prop or record a transfer. Exported data can be validated and saved with the prop-sheet CLI.'), 'prop-muted'));
})();
