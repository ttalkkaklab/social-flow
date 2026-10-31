/* Read-only presentation of the existing shot plan. Never changes generation inputs. */
(function (root) {
  'use strict';
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const word = (lang, ko, en) => lang === 'ko' ? ko : en;
  const normalized = value => typeof value === 'string' ? value.trim().toLowerCase().replace(/[-_]+/g, ' ') : '';
  const MOVES = [
    ['helix', /\bhelix\b|\bhelical\b/, '나선 이동', 'Helix'],
    ['crash', /\bcrash zoom\b/, '크래시 줌', 'Crash zoom'],
    ['dolly-zoom', /\bdolly zoom\b/, '돌리 줌', 'Dolly zoom'],
    ['whip', /\bwhip pan\b/, '휩 팬', 'Whip pan'],
    ['crane', /\b(crane|pedestal)\b/, '수직 이동', 'Crane / pedestal'],
    ['dolly', /\bdolly\b/, '돌리', 'Dolly'],
    ['zoom', /\bzoom\b/, '줌', 'Zoom'],
    ['handheld', /\bhandheld\b/, '핸드헬드', 'Handheld'],
    ['arc', /\barc shot\b|\borbit\b/, '회전 이동', 'Arc'],
    ['pan', /\bpan\b/, '팬', 'Pan'],
    ['tilt', /\btilt\b/, '틸트', 'Tilt'],
    ['tracking', /\b(tracking|truck)\b/, '따라가기', 'Tracking / truck'],
    ['aerial', /\baerial\b|\bdrone\b/, '항공 이동', 'Aerial'],
    ['static', /^(static|fixed|locked)\b/, '고정', 'Static']
  ];
  const PATHS = {
    dolly: 'M4 7h9v10H4zM13 10l5-3v10l-5-3M4 22h21m-4-4 4 4-4 4',
    zoom: 'M4 4h24v24H4zM10 10h12v12H10zM6 6l4 4m16-4-4 4M6 26l4-4m16 4-4-4',
    crane: 'M6 23h16M14 23V9m-4 4 4-4 4 4M4 3h12v6H4z',
    arc: 'M6 22C-2 5 30 5 26 22m-6-3 6 3 3-6M13 13h6v9h-6z',
    helix: 'M8 26c-12-7 26-8 16-15S0 6 10 2m0 0H4m6-0 1 6',
    handheld: 'M5 8l20-2 2 17-20 2zM12 13l9 4-8 4zM2 3l2-2m24 27 2 2',
    pan: 'M4 16h24m-5-5 5 5-5 5M9 11l-5 5 5 5',
    tilt: 'M16 4v24m-5-5 5 5 5-5M11 9l5-5 5 5',
    focus: 'M3 16a7 7 0 1 0 14 0a7 7 0 1 0-14 0M20 16h9m-3-3 3 3-3 3',
    static: 'M5 5h15v12H5zM20 9l7-4v12l-7-4M12 17v9m-5 3 5-12 5 12',
    other: 'M4 7h24v18H4zM12 12l8 4-8 4z',
    // Still effects, one picture each: push arrows point in, pull arrows point out, approach
    // heads for an off-centre target, focus-in closes on one point, rack hands it near → far.
    'still-push': 'M4 4h24v24H4zM11 11h10v10H11zM5 5l5 5M10 7v3H7M27 5l-5 5M22 7v3h3M5 27l5-5M10 25v-3H7M27 27l-5-5M22 25v-3h3',
    'still-pull': 'M4 4h24v24H4zM11 11h10v10H11zM10 10 5 5M5 8V5h3M22 10l5-5M27 8V5h-3M10 22l-5 5M5 24v3h3M22 22l5 5M27 24v3h-3',
    'still-approach': 'M4 4h24v24H4zM17 11a4 4 0 1 0 8 0a4 4 0 1 0-8 0M8 24l9-9M17 19v-4h-4',
    'still-focus-in': 'M9 16a7 7 0 1 0 14 0a7 7 0 1 0-14 0M15 16a1 1 0 1 0 2 0a1 1 0 1 0-2 0M16 2v4M16 26v4M2 16h4M26 16h4',
    'still-rack': 'M4 21a6 6 0 1 0 12 0a6 6 0 1 0-12 0M21 9a3 3 0 1 0 6 0a3 3 0 1 0-6 0M15 16l5-4M17 12h3v3',
    'still-reveal': 'M4 6h24v20H4zM12 6v20M10 16H6M8 14l-2 2 2 2M17 16a3 3 0 1 0 6 0a3 3 0 1 0-6 0',
    'still-parallax': 'M3 4h26v24H3zM7 11h8m-2-2 2 2-2 2M7 21h16m-2-2 2 2-2 2',
    'still-hold': 'M4 6h24v20H4zM13 11v10M19 11v10'
  };
  const ROLES = { action: ['행동', 'Action'], reaction: ['반응', 'Reaction'], insert: ['인서트', 'Insert'],
    scenery: ['공간', 'Setting'], document: ['문서', 'Document'], map: ['지도', 'Map'] };
  const JOINS = { cut: ['하드컷', 'Hard cut'], jcut: ['J컷', 'J-cut'], dip: ['암전 전환', 'Dip'],
    dissolve: ['디졸브', 'Dissolve'], whip: ['휩 전환', 'Whip'], zoom: ['줌 전환', 'Zoom'],
    push: ['밀기', 'Push'], iris: ['아이리스', 'Iris'], blur: ['블러', 'Blur'] };
  function catalogue() { return typeof module === 'object' && module.exports ? require('./film-techniques.js') : root.FILM_TECHNIQUES; }
  function cameraOf(scene, lang) {
    const still = scene.shot?.render?.mode === 'still_camera';
    const camera = still ? scene.shot.render.camera : scene.visual?.camera;
    const raw = still ? camera?.effect : camera?.movement;
    const value = normalized(raw);
    let row = MOVES.find(item => item[1].test(value));
    if (still) {
      const effects = { 'focus in': ['still-focus-in', '초점 모으기', 'Focus in'], 'rack focus': ['still-rack', '초점 이동', 'Rack focus'],
        approach: ['still-approach', '다가가기', 'Approach'], push: ['still-push', '확대', 'Push'], pull: ['still-pull', '축소', 'Pull'],
        pan: ['pan', '좌우 이동', 'Pan'], tilt: ['tilt', '상하 이동', 'Tilt'],
        reveal: ['still-reveal', '가려진 곳 공개', 'Reveal'], parallax: ['still-parallax', '시차 이동', 'Parallax'],
        hold: ['still-hold', '정지', 'Hold'] };
      const effect = effects[value];
      row = effect ? [effect[0], null, effect[1], effect[2]] : null;
    }
    const authored = !still && catalogue()?.selected(scene).filter(item => item.entry?.category === 'camera');
    const specific = authored && (authored.find(item => item.entry.fields.focus) || authored.find(item => item.entry.fields.movement && item.id !== 'camera.static') || authored.find(item => item.entry.fields.viewpoint) || authored.find(item => item.entry.fields.movement));
    if (specific) row = [specific.id, null, specific.entry.label.ko, specific.entry.label.en];
    const label = row ? word(lang, row[2], row[3]) : value ? word(lang, '기타 이동', 'Custom move') : word(lang, '이동 미설정', 'Move not planned');
    return { key: row?.[0] || 'other', label, raw: typeof raw === 'string' ? raw : '',
      medium: still ? word(lang, '스틸 효과', 'Still effect') : word(lang, '카메라 계획', 'Camera plan'),
      camera: camera || {}, still };
  }
  function secondsOf(scene, doc) {
    const duration = scene.type === 'outro' && doc?.outro?.seconds !== undefined ? doc.outro.seconds : scene.duration;
    return typeof duration === 'number' && Number.isFinite(duration) && duration > 0 ? duration : null;
  }
  const seconds = value => value === null ? '?' : String(Math.round(value * 100) / 100);
  function icon(key) {
    const entry = catalogue()?.byId[key];
    if (entry) return catalogue().icon(entry);
    const family = { crash: 'zoom', 'dolly-zoom': 'zoom', whip: 'pan', tracking: 'dolly', aerial: 'arc' }[key] || key;
    return '<svg viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="' + (PATHS[family] || PATHS.other) + '"/></svg>';
  }
  function changedAxes(previous, scene, lang) {
    if (!previous) return [];
    const pairs = [
      [previous.shot?.size, scene.shot?.size, '크기', 'Size'],
      [previous.shot?.angle, scene.shot?.angle, '앵글', 'Angle'],
      [cameraOf(previous, lang).raw, cameraOf(scene, lang).raw, '이동', 'Move']
    ];
    return pairs.filter(([a, b]) => a && b && normalized(a) !== normalized(b))
      .map(([, , ko, en]) => word(lang, ko, en));
  }
  function summary(scene, index, previous, lang, doc) {
    const camera = cameraOf(scene, lang), role = ROLES[scene.shot?.cutType];
    const target = '#direction-shot-' + (index + 1);
    const duration = secondsOf(scene, doc);
    let html = '<div class="direction-summary" aria-label="' + word(lang, '샷 연출 계획', 'Shot direction plan') + '">';
    html += '<a class="direction-camera" href="' + target + '">' + icon(camera.key) + '<span>' + esc(camera.label) + '</span><small>' +
      esc([camera.medium, camera.raw, camera.camera.speed].filter(Boolean).join(' · ')) + '</small></a>';
    html += '<span>' + word(lang, '계획 ', 'Planned ') + seconds(duration) + 's</span>';
    if (role) html += '<span>' + esc(word(lang, ...role)) + '</span>';
    html += '</div>';
    const join = typeof scene.transition === 'string' ? scene.transition : '';
    const label = JOINS[join.split(':')[0]];
    const special = ['broll', 'outro'].includes(scene.type);
    const incoming = special ? word(lang, '조립 시 연결', 'Assembly join') : label ? word(lang, ...label) + (join.includes(':') ? ' · ' + join.split(':')[1] : '') :
      !previous ? word(lang, '시작', 'Opening') : join || word(lang, '전환 미설정', 'Join not planned');
    const changes = changedAxes(previous, scene, lang);
    html += '<div class="direction-join"><a href="' + target + '">' + esc(incoming) + '</a>';
    if (previous && !special && changes.length) html += '<span>' + esc(changes.join(' · ')) + word(lang, ' 변경', ' changed') + '</span>';
    if (previous && !special && scene.edit?.continuity) html += '<span>' + esc(scene.edit.continuity) + '</span>';
    return html + '</div>';
  }
  function playbackEntries(scenes) {
    const entries = scenes.map((s, i) => ({ s, i }));
    const order = entries.filter(({ s }) => !['broll', 'outro'].includes(s.type));
    for (const entry of entries.filter(({ s }) => s.type === 'broll')) {
      const after = order.findIndex(item => item.i === (entry.s.after || 0));
      order.splice(after < 0 ? order.length : after + 1, 0, entry);
    }
    return order.concat(entries.filter(({ s }) => s.type === 'outro'));
  }
  function timeline(scenes, lang, doc) {
    if (!scenes.length) return '';
    const entries = playbackEntries(scenes);
    const lengths = entries.map(({ s }) => secondsOf(s, doc)), known = lengths.filter(value => value !== null);
    const total = known.reduce((sum, n) => sum + n, 0);
    const complete = known.length === scenes.length;
    let html = '<section class="direction-rhythm" aria-label="' + word(lang, '계획 길이 흐름', 'Planned shot lengths') + '"><p><b>' + word(lang, '컷 길이', 'Shot lengths') + '</b> ';
    html += complete ? word(lang, '계획 합계 ', 'Planned total ') + seconds(total) + 's' : word(lang, '미정 ', 'Unknown ') + (scenes.length - known.length);
    html += ' <small>' + word(lang, '최종 영상 길이와 다를 수 있습니다.', 'Final timing may differ.') + '</small></p><div class="direction-rhythm-track">';
    entries.forEach(({ s: scene, i: index }, position) => {
      const length = lengths[position];
      html += '<a href="#shot-' + (index + 1) + '" class="direction-rhythm-shot" aria-label="' +
        esc(word(lang, '샷 ', 'Shot ') + (index + 1) + ': ' + (length === null ? word(lang, '길이 미정', 'length unknown') : seconds(length) + 's')) + '"><span>' + (index + 1) + '</span><i style="width:' +
        (length === null ? 0 : Math.max(2, length / Math.max(...known) * 100)) + '%"></i><span>' + seconds(length) + 's</span></a>';
    });
    return html + '</div></section>';
  }
  const api = { cameraOf, secondsOf, changedAxes, playbackEntries, summary, timeline };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SHOT_DIRECTION = api;
})(typeof window === 'object' ? window : globalThis);
