#!/usr/bin/env node
'use strict';

// Static, offline views of the existing channel data. Never reads portal keys.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { listChannels, listStoryboards, listCharacters, characterDetail, insideReal } = require('./serve.js');
const MARKER = '<!-- social-flow:review-library:v1 -->';
const ASSETS = path.join(__dirname, 'review-assets');
const ASSET_NAMES = ['review.css', 'review.js', 'WantedSansVariable.woff2', 'OFL.txt'];
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const t = (ko, en) => `<span data-ko="${esc(ko)}" data-en="${esc(en)}">${esc(ko)}</span>`;
const rel = (from, to) => path.relative(path.dirname(from), to).split(path.sep).map(part => encodeURIComponent(part)).join('/') || './';
const label = { front: ['정면', 'Front'], back: ['후면', 'Back'], face: ['얼굴', 'Face'] };

function regular(root, file) {
  return fs.existsSync(file) && insideReal(root, file) && fs.statSync(file).isFile();
}
function read(root, file) { return regular(root, file) ? fs.readFileSync(file, 'utf8') : ''; }
function identityField(source, names) {
  const alternatives = names.join('|');
  const match = source.match(new RegExp('^\\s*(?:[-*]\\s+)?(?:\\*\\*)?(?:' + alternatives + ')(?:\\*\\*)?\\s*[:：]\\s*(.*)$', 'im'));
  return match ? match[1].trim() : '';
}
function panels(character) {
  const files = character.images.map(im => im.file);
  return {
    front: files.find(f => /^(body|front|front-body|real)\.(png|jpe?g|webp)$/i.test(f)),
    back: files.find(f => /^(back|rear)\.(png|jpe?g|webp)$/i.test(f)),
    face: files.find(f => /^(face|head|head-closeup)\.(png|jpe?g|webp)$/i.test(f)),
  };
}
function panelStatus(slots) {
  return '<div class="review-status">' + Object.entries(label).map(([key, words]) =>
    `<span class="${slots[key] ? 'review-ok' : ''}">${slots[key] ? '✓' : '○'} ${t(...words)} ${slots[key] ? t('등록됨', 'Available') : t('미등록', 'Missing')}</span>`).join('') + '</div>';
}
function reviewStatus(root, folder) {
  const fallback = t('초안 · 독립 평가 기록 없음', 'Draft · no independent review');
  const source = read(root, path.join(folder, 'review.json'));
  if (!source) return fallback;
  try {
    const review = JSON.parse(source);
    const threshold = review.threshold === undefined ? 95 : review.threshold;
    if (!Number.isInteger(threshold) || threshold < 1 || threshold > 100) return fallback;
    if (!Number.isInteger(review.score) || review.score < 0 || review.score > 100 || !Number.isInteger(review.iteration) || review.iteration < 1 || !Number.isInteger(review.critical) || review.critical < 0) return fallback;
    const reviewedFiles = ['identity.md', 'body.png', 'back.png', 'face.png'];
    for (const name of ['voice.wav', 'sample.txt', 'voice-accuracy.json']) {
      if (regular(root, path.join(folder, name)) || Object.hasOwn(review.inputHashes || {}, name)) reviewedFiles.push(name);
    }
    const current = reviewedFiles.every(name => {
      const file = path.join(folder, name);
      return regular(root, file) && review.inputHashes?.[name] === createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    });
    if (!current) return t('수정됨 · 독립 재평가 필요', 'Changed · independent review needed');
    const passed = review.score >= threshold && review.critical === 0;
    return t(`${passed ? '평가 통과' : '수정 필요'} · ${review.score}/100 · 기준 ${threshold} · ${review.iteration}차`, `${passed ? 'Review passed' : 'Revision required'} · ${review.score}/100 · threshold ${threshold} · round ${review.iteration}`);
  } catch (_) { return fallback; }
}
function shell({ file, channelDir, channel, title, section, body }) {
  const assets = path.join(channelDir, 'assets', 'review');
  const nav = [['storyboards', '스토리보드', 'Storyboards', path.join(channelDir, 'storyboards', 'index.html')],
    ['characters', '캐릭터', 'Characters', path.join(channelDir, 'assets', 'characters', 'index.html')]];
  return `<!doctype html>\n${MARKER}\n<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)} · ${esc(channel)}</title><link rel="stylesheet" href="${rel(file, path.join(assets, 'review.css'))}"></head><body class="review-page">
<aside class="review-sidebar"><a class="review-brand" href="${rel(file, path.join(channelDir, 'index.html'))}">딸깍스토리</a><div class="review-channel">${esc(channel)}</div><nav aria-label="Navigation">${nav.map(([key, ko, en, target]) => `<a href="${rel(file, target)}"${key === section ? ' aria-current="page"' : ''}>${t(ko, en)}</a>`).join('')}</nav><footer>${t('로컬 라이브러리', 'Local library')}</footer></aside>
<main class="review-main"><select class="review-language" data-language aria-label="Language"><option value="ko">한국어</option><option value="en">English</option></select>${body}</main><script src="${rel(file, path.join(assets, 'review.js'))}"></script></body></html>\n`;
}
function heading(title, description) { return `<header class="review-header"><h1>${title}</h1><p>${description}</p></header>`; }
function field(name, value) { return `<div class="review-field"><dt>${name}</dt><dd>${esc(value || '—')}</dd></div>`; }
function empty(ko, en) {
  const shape = /이미지|커버/.test(ko)
    ? '<rect x="8" y="10" width="32" height="28" rx="3"/><circle cx="18" cy="20" r="3"/><path d="m10 34 10-9 7 6 5-4 6 7"/>'
    : '<path d="M7 15h13l4 5h17v20H7z"/><path d="M7 15v-5h13l4 5h14v5"/>';
  return `<div class="review-empty"><svg class="review-empty-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">${shape}</svg>${t(ko, en)}</div>`;
}
function searchBox() { return `<div class="review-tools"><label>${t('검색', 'Search')} <input type="search" data-search></label></div>`; }
function image(file, target, alt, cover = false) { return `<img class="review-image${cover ? ' review-cover' : ''}" src="${rel(file, target)}" alt="${esc(alt)}" loading="lazy">`; }

// Guard every output component, including symlinked parents. Exporting must never
// overwrite hand-authored HTML or follow a writable symlink outside the channel.
function safeOutput(root, target) {
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Output outside channel: ' + target);
  let cursor = root;
  for (const part of relative.split(path.sep)) {
    cursor = path.join(cursor, part);
    try {
      const st = fs.lstatSync(cursor);
      if (st.isSymbolicLink()) throw new Error('Refusing output symlink: ' + cursor);
      if (cursor !== target && !st.isDirectory()) throw new Error('Output parent is not a directory: ' + cursor);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

function exportChannel(channelDirectory, { check = false } = {}) {
  const dir = path.resolve(channelDirectory);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new Error('Missing channel directory: ' + dir);
  const root = path.dirname(dir), slug = path.basename(dir);
  const channel = listChannels(root).find(c => c.slug === slug);
  if (!channel) throw new Error('Not a channel: ' + dir);
  const chars = listCharacters(root, slug);
  const boards = listStoryboards(root, slug);
  const outputs = new Map();
  const warnings = [];
  const put = (file, body) => outputs.set(file, Buffer.from(body));
  const render = (file, title, section, body) => put(file, shell({ file, channelDir: dir, channel: channel.name, title, section, body }));
  for (const name of ASSET_NAMES) put(path.join(dir, 'assets', 'review', name), fs.readFileSync(path.join(ASSETS, name)));
  const charIndex = path.join(dir, 'assets', 'characters', 'index.html');
  let cards = '';
  for (const character of chars) {
    const folder = path.join(dir, 'assets', 'characters', character.id);
    const file = path.join(folder, 'index.html');
    const detail = characterDetail(root, slug, character.id);
    const source = detail.identityText || '';
    const slots = panels(character);
    // A symlinked image must not leak an out-of-channel file into an exported view.
    for (const key of Object.keys(slots)) if (slots[key] && !regular(dir, path.join(folder, slots[key]))) slots[key] = undefined;
    const role = identityField(source, ['역할', '설명', 'role']) || character.note || character.summary || '';
    const appearance = identityField(source, ['생김새', '외형', 'appearance']);
    let voice = null;
    let voiceError = '';
    try { voice = require('../../_shared/character-voice.js').identityVoice(source); }
    catch (error) { voiceError = error.message; warnings.push(character.id + ': ' + voiceError); }
    const review = `<p class="review-status">${voiceError ? t('음성 설정 필요', 'Voice settings required') : reviewStatus(dir, folder)}</p>`;
    let body = `<a class="review-crumb" href="../index.html">${t('캐릭터 목록', 'Characters')}</a>` + heading(esc(character.name), t('여러 에피소드에서 같은 모습과 목소리를 유지합니다.', 'Keep the same appearance and voice across episodes.'));
    body += review;
    body += `<nav class="review-steps"><a href="#basics"><b>1</b>${t('기본 정보', 'Basics')}</a><a href="#appearance"><b>2</b>${t('외형', 'Appearance')}</a><a href="#voice"><b>3</b>${t('목소리', 'Voice')}</a></nav>`;
    body += `<section class="review-section" id="basics"><h2>${t('기본 정보', 'Basic information')}</h2><dl class="review-fields">${field(t('이름', 'Name'), character.name)}${field(t('캐릭터 키', 'Character key'), character.id)}${field(t('설명 · 역할', 'Description / role'), role)}</dl></section>`;
    body += `<section class="review-section" id="appearance"><h2>${t('외형과 이미지', 'Appearance and images')}</h2><p>${t('정면·후면·얼굴을 함께 두어 장면이 바뀌어도 같은 모습을 유지합니다.', 'Front, back and face references keep the character consistent.')}</p>${panelStatus(slots)}<div class="review-panels">`;
    for (const [key, words] of Object.entries(label)) body += `<figure>${slots[key] ? image(file, path.join(folder, slots[key]), character.name + ' ' + words[0]) : empty('이미지 미등록', 'No image yet')}<figcaption>${t(...words)}</figcaption></figure>`;
    body += `</div>${appearance ? `<dl>${field(t('외형 프롬프트', 'Appearance prompt'), appearance)}</dl>` : ''}`;
    const extras = character.images.filter(im => !Object.values(slots).includes(im.file) && regular(dir, path.join(folder, im.file)));
    if (extras.length) body += `<h3>${t('추가 이미지', 'Additional images')}</h3><div class="review-panels">${extras.map(im => `<figure>${image(file, path.join(folder, im.file), im.file)}<figcaption>${esc(im.file)}</figcaption></figure>`).join('')}</div>`;
    body += `</section><section class="review-section" id="voice"><h2>${t('캐릭터 목소리', 'Character voice')}</h2>${voice ? `<dl class="review-fields">${field(t('엔진', 'Engine'), voice.engine)}${field(t('음성 ID', 'Voice ID'), voice.voiceId)}${field(t('언어', 'Language'), voice.language)}${field(t('속도', 'Speed'), String(voice.speed))}</dl>` : `<p>${esc(voiceError)}</p>`}${regular(dir, path.join(folder, 'voice.wav')) ? `<audio controls preload="metadata" src="${rel(file, path.join(folder, 'voice.wav'))}"></audio>` : `<p class="review-status">${t('음성 샘플 미등록', 'Voice sample not supplied')}</p>`}</section>`;
    body += `<details class="review-detail"><summary>${t('캐릭터 설정 원문', 'Full character identity')}</summary><p>${t('원문에 적힌 검토 상태는 작성 당시 기록입니다. 현재 평가는 페이지 상단에서 확인하세요.', 'Review status in the source reflects when it was written. The current review appears at the top of this page.')}</p><pre class="review-source">${esc(source || '—')}</pre></details>`;
    render(file, character.name, 'characters', body);
    cards += `<article data-card data-search="${esc((character.name + ' ' + character.id + ' ' + role).toLocaleLowerCase())}" class="review-card"><a href="${rel(charIndex, file)}">${slots.front ? image(charIndex, path.join(folder, slots.front), character.name) : empty('정면 이미지 없음', 'No front image')}<div class="review-card-body"><h2>${esc(character.name)}</h2><p>${esc(role)}</p>${review}${panelStatus(slots)}</div></a></article>`;
  }
  render(charIndex, 'Characters', 'characters', heading(t('캐릭터', 'Characters'), `${chars.length} ${t('명의 캐릭터', 'characters')}`) + searchBox() + `<div class="review-grid">${cards}</div><div data-no-results${chars.length ? ' hidden' : ''}>${empty(chars.length ? '검색 조건에 맞는 캐릭터가 없습니다.' : '등록된 캐릭터가 없습니다.', chars.length ? 'No characters match your search.' : 'No characters yet.')}</div>`);
  const boardIndex = path.join(dir, 'storyboards', 'index.html');
  cards = '';
  for (const board of boards) {
    const folder = path.join(dir, 'episodes', board.topic, 'storyboard');
    const sourceFile = path.join(folder, 'storyboard.html');
    const file = path.join(dir, 'storyboards', board.topic, 'index.html');
    const source = read(dir, sourceFile);
    const available = source && /<head[\s>]/i.test(source) && !/<base\b/i.test(source);
    if (available) {
      // One renderer: copy the canonical shell, using a relative base for its unchanged
      // scenes.js, helper files and media. Works with both file:// and HTTP.
      const base = rel(file, path.join(folder, 'index.html')).replace(/index\.html$/, '');
      put(file, source.replace(/<head([^>]*)>/i, `<head$1>\n${MARKER}\n<base href="${esc(base)}">`));
    } else warnings.push(board.topic + ': missing/unsupported storyboard.html; run storyboard-html.js first');
    const cover = board.cover ? path.join(root, decodeURIComponent(board.cover.replace(/^\/files\//, ''))) : null;
    cards += `<article class="review-card" data-card data-series="${esc(board.series || '')}" data-search="${esc((board.title + ' ' + board.topic + ' ' + (board.series || '')).toLocaleLowerCase())}">${available ? `<a href="${rel(boardIndex, file)}">` : '<div>'}${cover && regular(dir, cover) ? image(boardIndex, cover, board.title, true) : empty('커버 없음', 'No cover')}<div class="review-card-body"><h2>${esc(board.title)}</h2><p>${esc(board.series || '')}</p><div class="review-status"><span>${esc(board.status || 'draft')}</span><span>${esc(board.format || '')}</span></div>${available ? '' : `<p>${t('검토 HTML을 먼저 생성하세요.', 'Generate the review HTML first.')}</p>`}</div>${available ? '</a>' : '</div>'}</article>`;
  }
  const series = [...new Set(boards.map(b => b.series).filter(Boolean))];
  const filter = series.length ? `<label>${t('재생목록', 'Playlist')} <select data-series-filter><option value="" data-ko="전체" data-en="All">전체</option>${series.map(s => `<option>${esc(s)}</option>`).join('')}</select></label>` : '';
  render(boardIndex, 'Storyboards', 'storyboards', heading(t('스토리보드', 'Storyboards'), `${boards.length} ${t('편의 에피소드', 'episodes')}`) + searchBox().replace('</div>', filter + '</div>') + `<div class="review-grid">${cards}</div><div data-no-results${boards.length ? ' hidden' : ''}>${empty(boards.length ? '검색 조건에 맞는 에피소드가 없습니다.' : '등록된 에피소드가 없습니다.', boards.length ? 'No episodes match your search.' : 'No episodes yet.')}</div>`);
  const home = path.join(dir, 'index.html');
  const latest = boards.find(board => outputs.has(path.join(dir, 'storyboards', board.topic, 'index.html')));
  let featured = '';
  if (latest) {
    const file = path.join(dir, 'storyboards', latest.topic, 'index.html');
    const cover = latest.cover ? path.join(root, decodeURIComponent(latest.cover.replace(/^\/files\//, ''))) : null;
    featured = `<section class="review-feature"><h2>${t('최근 에피소드', 'Latest episode')}</h2><a class="review-card" href="${rel(home, file)}">${cover && regular(dir, cover) ? image(home, cover, latest.title, true) : ''}<h3>${esc(latest.title)}</h3><p>${esc(latest.series || '')}</p><p>${esc(latest.status || 'draft')} · ${esc(latest.format || '')}</p><span class="review-primary-link">${t('스토리보드 검토', 'Review storyboard')}</span></a></section>`;
  } else if (chars.length) {
    const character = chars[0];
    const folder = path.join(dir, 'assets', 'characters', character.id);
    const front = panels(character).front;
    featured = `<section class="review-feature"><h2>${t('캐릭터 준비', 'Character preparation')}</h2><a class="review-card" href="${rel(home, path.join(folder, 'index.html'))}">${front && regular(dir, path.join(folder, front)) ? image(home, path.join(folder, front), character.name) : empty('캐릭터 이미지를 준비 중입니다.', 'Character images are not available yet.')}<h3>${esc(character.name)}</h3><p>${esc(character.summary || '')}</p><span class="review-primary-link">${t('캐릭터 시트 검토', 'Review character sheet')}</span></a></section>`;
  }
  render(home, channel.name, '', heading(esc(channel.name), t('캐릭터와 에피소드를 한곳에서 검토합니다.', 'Review characters and episodes in one place.')) + featured + `<div class="review-grid"><a class="review-card" href="${rel(home, charIndex)}"><h2>${t('캐릭터', 'Characters')}</h2><p>${chars.length}</p></a><a class="review-card" href="${rel(home, boardIndex)}"><h2>${t('스토리보드', 'Storyboards')}</h2><p>${boards.length}</p></a></div>`);
  const changed = [];
  // Preflight every target before any write. Preserve unowned files even on refresh.
  for (const [file, content] of outputs) {
    safeOutput(dir, file);
    if (fs.existsSync(file)) {
      const old = fs.readFileSync(file);
      if (file.endsWith('.html') && !old.toString('utf8').includes(MARKER)) throw new Error('Refusing to replace hand-authored HTML: ' + file);
      if (old.equals(content)) continue;
    }
    changed.push(file);
  }
  if (!check) for (const file of changed) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, outputs.get(file));
  }
  return { changed, warnings, characters: chars.length, episodes: boards.length };
}

if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    if (!args[0] || args[0].startsWith('--') || args.length > 2 || (args[1] && args[1] !== '--check')) throw new Error('Usage: review-library.js <channel directory> [--check]');
    const result = exportChannel(args[0], { check: args[1] === '--check' });
    console.log(JSON.stringify(result, null, 2));
    if (args[1] === '--check' && (result.changed.length || result.warnings.length)) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
function libraryHub(channels) {
  const style = channels.length ? `<link rel="stylesheet" href="/files/${encodeURIComponent(channels[0].slug)}/assets/review/review.css">` : '';
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>딸깍스토리 · 로컬 라이브러리</title>${style}</head><body class="review-page"><main class="review-main" style="margin-left:0"><header class="review-header"><h1>딸깍스토리</h1><p>로컬 라이브러리 / Local library</p></header><div class="review-grid">${channels.map(c => `<a class="review-card" href="/files/${encodeURIComponent(c.slug)}/index.html"><h2>${esc(c.name)}</h2><p>${c.characters} characters · ${c.storyboards} episodes</p></a>`).join('') || '<p>No channels / 채널 없음</p>'}</div></main></body></html>`;
}
module.exports = { exportChannel, panels, libraryHub };
