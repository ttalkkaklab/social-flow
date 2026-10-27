/* Language belongs to authored content, independently of the review UI picker. */
(function (root) {
  'use strict';
  function language(value) {
    if (typeof value !== 'string') return '';
    var tag = value.trim().replace(/_/g, '-').toLowerCase();
    if (/^zh-(hant|tw|hk|mo)(-|$)/.test(tag)) return 'zh-Hant';
    if (/^zh($|-hans|-cn|-sg)/.test(tag)) return 'zh-Hans';
    var base = tag.split('-')[0];
    return ['ko', 'en', 'ja', 'vi', 'de', 'fr', 'es'].includes(base) ? base : '';
  }
  function contentLanguage(doc, scene, index) {
    var explicit = language((doc.shotLanguages || {})[index + 1]) || language(doc.contentLanguage);
    if (explicit) return explicit;
    var text = scene ? JSON.stringify([scene.title, scene.text, scene.narration]) : String(doc.displayTitle || '');
    if (/[\u3040-\u30ff]/.test(text)) return 'ja';
    if (/[\uac00-\ud7af\u1100-\u11ff]/.test(text)) return 'ko';
    // Han alone cannot identify a region. Authors must specify zh-Hans/zh-Hant/ja.
    return 'und';
  }
  function family(lang) {
    return { ko: 'Pretendard', ja: 'Noto Sans JP', 'zh-Hans': 'Noto Sans SC', 'zh-Hant': 'Noto Sans TC' }[language(lang)] || 'Inter';
  }
  async function prepare(doc, scenes) {
    if (!root.document || !root.document.fonts) return [];
    var text = JSON.stringify([doc, scenes]);
    var families = new Set(['Inter']);
    families.add(family(contentLanguage(doc)));
    scenes.forEach(function (scene, index) { families.add(family(contentLanguage(doc, scene, index))); });
    if (/[\uac00-\ud7af]/.test(text) || root.document.documentElement.lang === 'ko') families.add('Pretendard');
    // Unlabelled Han uses the documented SC fallback; never claim inferred locale.
    if (/[\u3400-\u9fff]/.test(text) && scenes.some(function (s, i) {
      return !['ja', 'zh-Hans', 'zh-Hant'].includes(contentLanguage(doc, s, i));
    })) families.add('Noto Sans SC');
    var failures = [];
    await Promise.all(Array.from(families).map(async function (name) {
      try {
        var faces = await root.document.fonts.load('400 16px "' + name + '"');
        if (!faces.length) failures.push(name);
      }
      catch (_) { failures.push(name); }
    }));
    return failures;
  }
  function apply(doc, scenes) {
    function mark(host, lang) {
      if (!host) return;
      host.querySelectorAll('.scene-title, .speech-text, .speech-subtitle, .speech-reason, .speech-meta b, .capline, .shot-info, .shot-feel').forEach(function (node) {
        node.lang = lang;
      });
    }
    var title = root.document.querySelector('.doc-title');
    if (title) title.lang = contentLanguage(doc);
    scenes.forEach(function (scene, index) {
      mark(root.document.getElementById('shot-' + (index + 1)), contentLanguage(doc, scene, index));
    });
  }
  var api = { language: language, contentLanguage: contentLanguage, family: family, prepare: prepare, apply: apply };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ReviewTypography = api;
})(typeof window !== 'undefined' ? window : globalThis);
