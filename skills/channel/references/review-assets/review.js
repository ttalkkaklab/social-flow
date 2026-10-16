(function () {
  'use strict';
  var picker = document.querySelector('[data-language]');
  var lang = new URLSearchParams(location.search).get('lang');
  if (lang !== 'en' && lang !== 'ko') {
    try { lang = localStorage.getItem('social-flow.lang'); } catch (_) { /* file privacy */ }
  }
  if (lang !== 'en' && lang !== 'ko') lang = /^ko/.test(navigator.language) ? 'ko' : 'en';
  function translate(value) {
    document.documentElement.lang = value;
    document.querySelectorAll('[data-ko][data-en]').forEach(function (el) { el.textContent = el.dataset[value]; });
    if (picker) picker.value = value;
    document.querySelectorAll('.review-play').forEach(updateVoiceLabel);
    try { localStorage.setItem('social-flow.lang', value); } catch (_) { /* file privacy */ }
  }
  translate(lang);
  if (picker) picker.addEventListener('change', function () { translate(picker.value); });
  var search = document.querySelector('input[data-search]');
  var series = document.querySelector('[data-series-filter]');
  function filter() {
    var q = (search ? search.value : '').trim().toLocaleLowerCase();
    var selected = series ? series.value : '';
    var shown = 0;
    document.querySelectorAll('[data-card]').forEach(function (card) {
      card.hidden = !card.dataset.search.includes(q) || !!(selected && card.dataset.series !== selected);
      if (card.hidden) card.querySelectorAll('audio').forEach(function (audio) { audio.pause(); });
      if (!card.hidden) shown++;
    });
    var empty = document.querySelector('[data-no-results]');
    if (empty) empty.hidden = shown !== 0;
  }
  if (search) search.addEventListener('input', filter);
  if (series) series.addEventListener('change', filter);
  // Print the specification even if a reader collapsed a group, then restore it.
  var printState;
  window.addEventListener('beforeprint', function () {
    if (printState) return;
    printState = Array.from(document.querySelectorAll('.character-group, .character-voice details')).map(function (el) {
      var state = { el: el, open: el.open };
      el.open = true;
      return state;
    });
  });
  window.addEventListener('afterprint', function () {
    (printState || []).forEach(function (state) { state.el.open = state.open; });
    printState = null;
  });
  function updateVoiceLabel(button) {
    var ko = document.documentElement.lang === 'ko';
    var label = button.disabled
      ? (ko ? '음성 샘플 없음' : 'Voice sample unavailable')
      : button.hasAttribute('data-playing')
        ? (ko ? '음성 일시정지' : 'Pause voice')
        : (ko ? '음성 재생' : 'Play voice');
    button.title = label;
    button.setAttribute('aria-label', button.dataset.voiceName + ' · ' + label);
  }
  document.querySelectorAll('[data-audio-toggle]').forEach(function (button) {
    var audio = document.getElementById(button.dataset.audioToggle);
    function sync() {
      button.toggleAttribute('data-playing', !audio.paused && !audio.ended);
      updateVoiceLabel(button);
    }
    button.addEventListener('click', function () {
      if (!audio.paused) { audio.pause(); return; }
      document.querySelectorAll('.review-voice audio').forEach(function (other) {
        if (other !== audio) other.pause();
      });
      audio.play().catch(function () { sync(); });
    });
    ['play', 'pause', 'ended'].forEach(function (event) { audio.addEventListener(event, sync); });
    audio.addEventListener('error', function () {
      button.disabled = true;
      button.removeAttribute('data-playing');
      updateVoiceLabel(button);
    });
  });
  // Native dialog supplies focus containment, Escape and focus restoration.
  var dialog = document.createElement('dialog');
  dialog.className = 'review-lightbox';
  var close = document.createElement('button');
  close.type = 'button';
  var picture = document.createElement('img');
  var caption = document.createElement('p');
  caption.id = 'review-image-caption';
  dialog.setAttribute('aria-labelledby', caption.id);
  dialog.append(close, picture, caption);
  document.body.appendChild(dialog);
  close.addEventListener('click', function () { dialog.close(); });
  dialog.addEventListener('click', function (event) { if (event.target === dialog) dialog.close(); });
  document.querySelectorAll('[data-image-preview]').forEach(function (link) {
    link.addEventListener('click', function (event) {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      picture.src = link.href;
      picture.alt = link.querySelector('img').alt;
      caption.textContent = picture.alt;
      close.textContent = document.documentElement.lang === 'ko' ? '닫기' : 'Close';
      dialog.showModal();
    });
  });
})();
