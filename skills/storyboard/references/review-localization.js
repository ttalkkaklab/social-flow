'use strict';

// Exact source text is the revision key. Changed copy falls back to the new source;
// translations never replace scenes.js or feed a production compiler.
(function (root) {
  const labels = { vi: 'Tiếng Việt', ko: '한국어', en: 'English', 'zh-Hans': '简体中文', ja: '日本語' };
  function validate(bundle) {
    if (!bundle || bundle.version !== 1 || !Array.isArray(bundle.languages) || !Array.isArray(bundle.entries) ||
        typeof bundle.sourceLanguage !== 'string' || !bundle.languages.includes(bundle.sourceLanguage) ||
        new Set(bundle.languages).size !== bundle.languages.length ||
        bundle.languages.some(code => !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(code)))
      throw new Error('Invalid review-localization.json language manifest');
    const sources = new Set();
    for (const entry of bundle.entries) {
      if (!entry || typeof entry.source !== 'string' || !entry.source.trim() || sources.has(entry.source) ||
          !entry.translations || typeof entry.translations !== 'object' || Array.isArray(entry.translations) ||
          Object.entries(entry.translations).some(([code, value]) => !bundle.languages.includes(code) || typeof value !== 'string' || !value.trim()))
        throw new Error('Invalid or duplicate review translation entry');
      sources.add(entry.source);
    }
    return bundle;
  }
  function reader(bundle, requested) {
    const data = bundle ? validate(bundle) : { languages: [], entries: [], sourceLanguage: '' };
    const language = data.languages.includes(requested) ? requested : data.sourceLanguage;
    const entries = new Map(data.entries.map(entry => [entry.source, entry.translations]));
    return { language, languages: data.languages, labels,
      translated: data.entries.filter(entry => entry.translations[language]).length,
      total: data.entries.length,
      text(value) {
        const source = String(value == null ? '' : value);
        return entries.get(source)?.[language] || source;
      },
    };
  }
  const api = { validate, reader, labels };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ReviewLocalization = api;
})(typeof window === 'object' ? window : globalThis);
