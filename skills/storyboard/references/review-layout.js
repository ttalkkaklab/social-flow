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
    ['../../../assets/characters/index.html', words('캐릭터', 'Characters')]
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
  while (node && node.id !== 'cast' && node.id !== 'contract') {
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
  app.appendChild(shotSection);
  if (style) app.appendChild(style);
  app.appendChild(checks); app.appendChild(notes);
  // A <base> in the library copy changes native fragment resolution. Keep fragments
  // in this document and expand their disclosure ancestors before scrolling.
  function reveal(hash) {
    var id;
    try { id = decodeURIComponent(hash.replace(/^#/, '')); } catch (_) { return; }
    var target = document.getElementById(id); if (!target) return;
    var ancestor = target.parentElement;
    while (ancestor) { if (ancestor.tagName === 'DETAILS') ancestor.open = true; ancestor = ancestor.parentElement; }
    target.scrollIntoView();
  }
  document.addEventListener('click', function (event) {
    var a = event.target.closest('a[href^="#"]'); if (!a) return;
    event.preventDefault(); reveal(a.getAttribute('href'));
  });
  if (location.hash) reveal(location.hash);
  window.addEventListener('beforeprint', function () {
    document.querySelectorAll('details').forEach(function (el) { el.dataset.wasOpen = String(el.open); el.open = true; });
  });
  window.addEventListener('afterprint', function () {
    document.querySelectorAll('details[data-was-open]').forEach(function (el) { el.open = el.dataset.wasOpen === 'true'; delete el.dataset.wasOpen; });
  });
})();
