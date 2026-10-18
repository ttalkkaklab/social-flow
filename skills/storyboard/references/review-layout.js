/* Portal review layout, source: ttalkkak-story d29f1a6 (2026-10-11).
 * Rearrange existing nodes so checks, prompts, metadata and event listeners survive.
 */
(function () {
  'use strict';
  var app = document.getElementById('app');
  var shots = document.getElementById('shots');
  if (!app || !shots) return;
  var ko = document.documentElement.lang === 'ko';
  var words = function (a, b) { return ko ? a : b; };
  var doc = window.SB_DOC || {};
  document.body.classList.add('review-board');
  var sidebar = document.createElement('aside');
  sidebar.className = 'review-sidebar';
  var brand = document.createElement('a');
  brand.className = 'review-brand'; brand.textContent = '딸깍스토리';
  brand.href = '../../../index.html'; sidebar.appendChild(brand);
  var channel = document.createElement('div'); channel.className = 'review-channel';
  channel.textContent = doc.channelName || doc.channel || '';
  sidebar.appendChild(channel);
  var nav = document.createElement('nav'); nav.setAttribute('aria-label', words('탐색', 'Navigation'));
  [
    ['../../../storyboards/index.html', words('스토리보드', 'Storyboards')],
    ['../../../assets/characters/index.html', words('캐릭터 시트', 'Character sheets')],
    ['../../../assets/props/index.html', words('소품 시트', 'Prop sheets')],
    ['../../../assets/locations/index.html', words('배경 시트', 'Background sheets')]
  ].forEach(function (entry, i) {
    var a = document.createElement('a'); a.href = entry[0]; a.textContent = entry[1];
    if (!i) a.setAttribute('aria-current', 'page'); nav.appendChild(a);
  });
  sidebar.appendChild(nav);
  var footer = document.createElement('footer'); footer.textContent = words('로컬 라이브러리', 'Local library'); sidebar.appendChild(footer);
  document.body.insertBefore(sidebar, document.body.firstChild);
  function disclosure(title) {
    var box = document.createElement('details'); box.className = 'review-detail';
    var summary = document.createElement('summary'); summary.textContent = title;
    box.appendChild(summary); return box;
  }
  // Keep production grammar available without putting it ahead of the picture.
  Array.from(app.querySelectorAll('.scene')).forEach(function (scene) {
    var detail = disclosure(words('연출·카메라 상세', 'Direction / camera details'));
    detail.id = 'direction-' + scene.id;
    Array.from(scene.children).forEach(function (child) {
      if (child.matches('.shot-grammar, .shot-meta, .cmeta, .transition')) detail.appendChild(child);
    });
    if (detail.children.length > 1) scene.appendChild(detail);
  });
  var skip = document.createElement('a');
  skip.className = 'review-skip'; skip.href = '#shots';
  skip.textContent = words('샷으로 건너뛰기', 'Skip to shots');
  document.body.insertBefore(skip, sidebar);
  var header = app.querySelector('header');
  var audit = document.getElementById('audit');
  var status = audit && audit.querySelector('.count');
  var checks = disclosure(words('검사와 제작 비용', 'Checks and production costs') + (status ? ' — ' + status.textContent : ''));
  // Show existing warnings in the summary even when the detailed findings are closed.
  if (audit) checks.appendChild(audit);
  ['production-cost', 'cost'].forEach(function (id) {
    var node = document.getElementById(id); if (node) checks.appendChild(node);
  });
  var notes = disclosure(words('기획과 참고 자료', 'Plan and reference material'));
  var shotSection = document.createElement('section'); shotSection.className = 'review-shots';
  var node = shots;
  while (node && node.id !== 'cast' && node.id !== 'location-sheets' && node.id !== 'contract') {
    var next = node.nextElementSibling; shotSection.appendChild(node); node = next;
  }
  // Pull the style out of the document header and show it below the shot tree.
  var style = header && header.querySelector('.style-card');
  if (style) style.remove();
  Array.from(app.children).forEach(function (child) {
    if (child !== header && child.tagName !== 'NAV') notes.appendChild(child);
  });
  if (header) {
    Array.from(header.children).forEach(function (child) {
      if (child.matches('.meta-grid, details')) notes.insertBefore(child, notes.children[1] || null);
    });
  }
  var language = document.getElementById('lang');
  if (language && header) { language.classList.add('review-language'); header.insertBefore(language, header.firstChild); }
  var docnav = app.querySelector('.docnav');
  if (docnav) notes.insertBefore(docnav, notes.children[1] || null);
  var legend = disclosure(words('샷 속성 안내', 'Shot attribute guide'));
  var keys = shotSection.querySelectorAll('.size-key');
  if (keys.length) {
    keys[0].parentNode.insertBefore(legend, keys[0]);
    Array.from(keys).forEach(function (key) { legend.appendChild(key); });
  }
  // Explanations belong with the legend; keep preview toggles in the toolbar.
  [shots.querySelector('.aside'), shotSection.querySelector('.toolbar .legend')].forEach(function (hint) {
    if (hint && keys.length) { hint.className = 'review-guide-copy'; legend.appendChild(hint); }
  });
  app.appendChild(shotSection);
  // The planned rhythm belongs beside the shots, not hidden in planning notes.
  var rhythm = notes.querySelector('.direction-rhythm');
  if (rhythm) {
    var timing = disclosure(words('컷 길이와 흐름', 'Shot timing and rhythm'));
    timing.classList.add('review-timing');
    var timingSummary = rhythm.querySelector('p');
    if (timingSummary) timing.firstChild.textContent = timingSummary.textContent;
    timing.appendChild(rhythm);
    shots.insertAdjacentElement('afterend', timing);
  }
  if (style) app.appendChild(style);
  var locationSheets = notes.querySelector('#location-sheets');
  if (locationSheets) app.appendChild(locationSheets);
  app.appendChild(checks); app.appendChild(notes);
  checks.id = 'review-checks'; notes.id = 'review-notes';
  var jump = document.createElement('nav');
  jump.className = 'review-jump';
  jump.setAttribute('aria-label', words('검토 바로가기', 'Review sections'));
  [['shots', words('샷 보기', 'Shots')],
    ['location-sheets', words('배경·장소', 'Backgrounds / locations')],
    ['review-checks', words('검사·비용', 'Checks / costs') + (status ? ' · ' + status.textContent : '')],
    ['review-notes', words('기획·자료', 'Plan / references')]].forEach(function (entry) {
    var link = document.createElement('a'); link.href = '#' + entry[0];
    link.textContent = entry[1]; jump.appendChild(link);
  });
  app.insertBefore(jump, shotSection);
  // A <base> in the library copy changes native fragment resolution. Keep fragments
  // in this document and expand their disclosure ancestors before scrolling.
  function reveal(hash) {
    var id;
    try { id = decodeURIComponent(hash.replace(/^#/, '')); } catch (_) { return; }
    var target = document.getElementById(id); if (!target) return;
    if (target.tagName === 'DETAILS') target.open = true;
    var ancestor = target.parentElement;
    while (ancestor) { if (ancestor.tagName === 'DETAILS') ancestor.open = true; ancestor = ancestor.parentElement; }
    target.scrollIntoView();
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  }
  document.addEventListener('click', function (event) {
    var a = event.target.closest('a[href^="#"]'); if (!a) return;
    event.preventDefault(); reveal(a.getAttribute('href'));
  });
  if (location.hash) reveal(location.hash);
  // Prop sheets are inserted by the following script; resolve incoming links again after load.
  window.addEventListener('load', function () { if (location.hash) reveal(location.hash); });
  window.addEventListener('beforeprint', function () {
    document.querySelectorAll('details').forEach(function (el) { el.dataset.wasOpen = String(el.open); el.open = true; });
  });
  window.addEventListener('afterprint', function () {
    document.querySelectorAll('details[data-was-open]').forEach(function (el) { el.open = el.dataset.wasOpen === 'true'; delete el.dataset.wasOpen; });
  });
})();
