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
    try { localStorage.setItem('social-flow.lang', value); } catch (_) { /* file privacy */ }
  }
  translate(lang);
  if (picker) picker.addEventListener('change', function () { translate(picker.value); });
  var search = document.querySelector('[data-search]');
  var series = document.querySelector('[data-series-filter]');
  function filter() {
    var q = (search ? search.value : '').trim().toLocaleLowerCase();
    var selected = series ? series.value : '';
    var shown = 0;
    document.querySelectorAll('[data-card]').forEach(function (card) {
      card.hidden = !card.dataset.search.includes(q) || !!(selected && card.dataset.series !== selected);
      if (!card.hidden) shown++;
    });
    var empty = document.querySelector('[data-no-results]');
    if (empty) empty.hidden = shown !== 0;
  }
  if (search) search.addEventListener('input', filter);
  if (series) series.addEventListener('change', filter);
})();
