#!/usr/bin/env node
'use strict';

// Static, offline views of the existing channel data. Reads local files only.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { listChannels, listStoryboards, listCharacters, characterDetail, insideReal } = require('./serve.js');
const MARKER = '<!-- social-flow:review-library:v1 -->';
const ASSETS = path.join(__dirname, 'review-assets');
const { FONT_ASSETS } = require('./review-fonts.js');
const ASSET_NAMES = ['review.css', 'review.js', ...FONT_ASSETS];
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const t = (ko, en) => `<span data-ko="${esc(ko)}" data-en="${esc(en)}">${esc(ko)}</span>`;
const rel = (from, to) => path.relative(path.dirname(from), to).split(path.sep).map(part => encodeURIComponent(part)).join('/') || './';
const { GROUPS, identityCharacter, identityErrors } = require('../../_shared/character-identity.js');
const { inspectPanels, boardPanelFindings } = require('./character-panels.js');
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
    ['characters', '캐릭터 시트', 'Character sheets', path.join(channelDir, 'assets', 'characters', 'index.html')],
    ['props', '소품 시트', 'Prop sheets', path.join(channelDir, 'assets', 'props', 'index.html')],
    ['locations', '배경 시트', 'Background sheets', path.join(channelDir, 'assets', 'locations', 'index.html')]];
  return `<!doctype html>\n${MARKER}\n<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)} · ${esc(channel)}</title><link rel="stylesheet" href="${rel(file, path.join(assets, 'review.css'))}"></head><body class="review-page">
<a class="review-skip" href="#review-content">${t("본문으로", "Skip to content")}</a><aside class="review-sidebar"><a class="review-brand" href="${rel(file, path.join(channelDir, 'index.html'))}">딸깍스토리</a><div class="review-channel">${esc(channel)}</div><nav aria-label="Navigation">${nav.map(([key, ko, en, target]) => `<a href="${rel(file, target)}"${key === section ? ' aria-current="page"' : ''}>${t(ko, en)}</a>`).join('')}</nav><footer>${t('로컬 라이브러리', 'Local library')}</footer></aside>
<main class="review-main" id="review-content" tabindex="-1"><select class="review-language" data-language aria-label="Language"><option value="ko">한국어</option><option value="en">English</option></select>${body}</main><script src="${rel(file, path.join(assets, 'review.js'))}"></script></body></html>\n`;
}
function heading(title, description) { return `<header class="review-header"><h1>${title}</h1><p>${description}</p></header>`; }
function field(name, value) { return `<div class="review-field"><dt>${name}</dt><dd>${esc(value || '—')}</dd></div>`; }
function empty(ko, en) {
  const shape = /이미지|커버/.test(ko)
    ? '<rect x="8" y="10" width="32" height="28" rx="3"/><circle cx="18" cy="20" r="3"/><path d="m10 34 10-9 7 6 5-4 6 7"/>'
    : '<path d="M7 15h13l4 5h17v20H7z"/><path d="M7 15v-5h13l4 5h14v5"/>';
  return `<div class="review-empty"><svg class="review-empty-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">${shape}</svg>${t(ko, en)}</div>`;
}
// Section pictograms remain paired with visible labels, including without JS.
function characterIcon(kind) {
  const shapes = {
    appearance: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="m4 18 5-5 4 3 3-4 4 6"/>',
    identity: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
    physical: '<path d="M8 3H4v18h4M4 7h3m-3 5h3m-3 5h3"/><circle cx="15" cy="5" r="2"/><path d="M11 12v-2h8v2m-4-2v11m0-5h4"/>',
    personality: '<path d="M20 5a5 5 0 0 0-8 1 5 5 0 0 0-8-1c-4 5 2 10 8 15 6-5 12-10 8-15Z"/>',
    speech: '<rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 11v1a7 7 0 0 0 14 0v-1M12 19v3m-4 0h8"/>',
    acting: '<rect x="3" y="3" width="18" height="18" rx="6"/><path d="M7 9h1m8 0h1m-10 5a6 6 0 0 0 10 0"/>',
    story: '<path d="M12 5v16M12 5C9 2 5 3 2 4v16c3-1 7-2 10 1 3-3 7-2 10-1V4c-3-1-7-2-10 1Z"/>',
    continuity: '<path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6Z"/><path d="m8 12 3 3 5-6"/>',
  };
  return `<svg class="character-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[kind] || shapes.identity}</svg>`;
}
function identityValue(f) {
  if (f.status !== 'confirmed') return `<span class="character-field-state">${f.status === 'pending' ? t('미정', 'Pending') : t('해당 없음', 'Not applicable')}</span><span class="character-field-reason">${esc(f.reason)}</span>`;
  return Array.isArray(f.value) ? `<ul>${f.value.map(value => `<li>${esc(value)}</li>`).join('')}</ul>` : esc(f.value);
}
function searchBox() { return `<div class="review-tools"><label>${t('검색', 'Search')} <input type="search" data-search></label></div>`; }
function zoomImage(file, target, alt) { return `<a data-image-preview href="${rel(file, target)}" aria-label="${esc(alt)} · 원본 보기 / View original">${image(file, target, alt)}<span class="review-image-action">${t("원본 보기", "View original")}</span></a>`; }
function image(file, target, alt, cover = false) { return `<img class="review-image${cover ? ' review-cover' : ''}" src="${rel(file, target)}" alt="${esc(alt)}" loading="lazy">`; }

// Reference artwork is a preview, never evidence of a completed panel set.
function characterPreview(root, folder, character, slots) {
  if (slots.front) return { file: slots.front, reference: false };
  const references = character.images.map(im => im.file)
    .filter(file => /^reference(?:-v\d+)?\.(png|jpe?g|webp)$/i.test(file))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  const file = references.find(file => regular(root, path.join(folder, file)));
  return file ? { file, reference: true } : null;
}
function voicePreview(root, file, folder, character) {
  const voice = path.join(folder, 'voice.wav');
  const available = regular(root, voice);
  const id = 'voice-' + character.id;
  return `<div class="review-voice">${available ? `<audio id="${esc(id)}" preload="none" src="${rel(file, voice)}"></audio>` : ''}<button class="review-play" type="button" data-voice-name="${esc(character.name)}"${available ? ` data-audio-toggle="${esc(id)}"` : ' disabled'} aria-label="${esc(character.name)} · ${available ? '음성 재생' : '음성 샘플 없음'}" title="${available ? '음성 재생' : '음성 샘플 없음'}"><svg class="review-play-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg><svg class="review-pause-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg></button></div>`;
}
function boardMeta(board) {
  const formats = { 'shorts-9x16': ['숏폼 · 9:16', 'Short form · 9:16'], 'youtube-long-16x9': ['롱폼 · 16:9', 'Long form · 16:9'] };
  const status = board.status === 'draft' || !board.status ? t('초안', 'Draft') : esc(board.status);
  const format = formats[board.format] ? t(...formats[board.format]) : esc(board.format || '');
  return `<div class="review-status"><span>${status}</span>${format ? `<span>${format}</span>` : ''}</div>`;
}

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
  const contentWarnings = [], structuralWarnings = [];
  const contentWarning = (characterId, domain, detail) => {
    const message = characterId + ': ' + detail;
    warnings.push(message);
    contentWarnings.push({ characterId, domain, message });
  };
  const boardWindows = new Map();
  for (const board of boards) {
    const folder = path.join(dir, 'episodes', board.topic, 'storyboard');
    const scenes = path.join(folder, 'scenes.js');
    if (!regular(dir, scenes)) continue;
    try {
      const win = require('../../autoproduce/references/cost-preview.js').readScenes(scenes);
      boardWindows.set(board.topic, win);
      for (const f of boardPanelFindings(win, folder, dir)) contentWarning(f.characterId, f.domain, board.topic + ': ' + f.message);
    } catch (error) { contentWarning(board.topic, 'character-source', error.message); }
  }
  const put = (file, body) => outputs.set(file, Buffer.from(body));
  const render = (file, title, section, body) => put(file, shell({ file, channelDir: dir, channel: channel.name, title, section, body }));
  for (const name of ASSET_NAMES) put(path.join(dir, 'assets', 'review', name), fs.readFileSync(path.join(ASSETS, name)));
  const charIndex = path.join(dir, 'assets', 'characters', 'index.html');
  const characterSlots = new Map();
  let cards = '';
  for (const character of chars) {
    const folder = path.join(dir, 'assets', 'characters', character.id);
    const file = path.join(folder, 'index.html');
    const detail = characterDetail(root, slug, character.id);
    const source = detail.identityText || '';
    const media = inspectPanels(folder, panels(character));
    const slots = media.slots;
    characterSlots.set(character.id, slots);
    for (const finding of media.findings) contentWarning(character.id, finding.domain, finding.message);
    // A symlinked image must not leak an out-of-channel file into an exported view.
    for (const key of Object.keys(slots)) if (slots[key] && !regular(dir, path.join(folder, slots[key]))) slots[key] = undefined;
    let role = identityField(source, ['역할', '설명', 'role']) || character.note || character.summary || '';
    let appearance = identityField(source, ['생김새', '외형', 'appearance']);
    let voice = null;
    let voiceError = '';
    try { voice = require('../../_shared/character-voice.js').identityVoice(source); }
    catch (error) { voiceError = error.message; contentWarning(character.id, 'voice', voiceError); }
    let characterIdentity = null, identityError = '';
    try { characterIdentity = identityCharacter(source, { ready: false }); identityError = identityErrors(characterIdentity).join("; "); if (identityError) contentWarning(character.id, 'identity', identityError); }
    catch (error) { identityError = error.message; contentWarning(character.id, 'identity', identityError); }
    if (characterIdentity) { role = characterIdentity.identity.role.value || role; appearance = characterIdentity.physical.appearance.value || appearance; }
    const review = `<p class="review-status">${identityError ? t('캐릭터 설정 보완 필요', 'Character settings incomplete') : voiceError ? t('음성 설정 필요', 'Voice settings required') : reviewStatus(dir, folder)}</p>`;
    const summary = characterIdentity?.identity.summary.value || role;
    let body = `<article class="character-sheet"><a class="review-crumb" href="../index.html">${t('캐릭터 시트 목록', 'Character sheets')}</a>`;
    body += `<header class="character-header" id="basics"><div><h1>${esc(character.name)}</h1><p class="character-intro">${esc(summary)}</p></div><div class="character-meta"><span>${t('캐릭터 ID', 'Character ID')} <b>${esc(character.id)}</b></span>${characterIdentity ? `<span>${t('설정 버전', 'Version')} <b>${characterIdentity.version}</b></span>` : ''}</div>${review}</header>`;
    body += `<nav class="character-nav" aria-label="${esc('시트 섹션 / Sheet sections')}">${[['appearance', 'appearance', '외형', 'Appearance'], ['identity', 'identity', '상세 설정', 'Specification'], ['voice', 'speech', '목소리', 'Voice']].map(([id, icon, ko, en]) => `<a href="#${id}">${characterIcon(icon)}${t(ko, en)}</a>`).join('')}</nav>`;
    body += `<section class="character-appearance" id="appearance" aria-labelledby="appearance-title"><div class="character-section-heading"><h2 id="appearance-title">${t('외형과 이미지', 'Appearance and images')}</h2>${panelStatus(slots)}</div><div class="review-panels">`;
    for (const [key, words] of Object.entries(label)) body += `<figure class="review-panel-${key}">${slots[key] ? zoomImage(file, path.join(folder, slots[key]), character.name + ' ' + words[0]) : empty('이미지 미등록', 'No image yet')}<figcaption>${t(...words)}</figcaption></figure>`;
    body += '</div>';
    body += `<details class="review-detail character-media"><summary>${t('이미지 규격과 확인 항목', 'Image format and checks')}${media.findings.length ? ` <span class="character-count">${media.findings.length}</span>` : ''}</summary><p>${t('공용 캐릭터 이미지 · 머리 없는 정면·후면 2:3, 얼굴 클로즈업 1:1. 템플릿 일치는 이미지 완성 판정이 아닙니다.', 'Shared character references · headless front/back 2:3, face close-up 1:1. Template match does not certify image readiness.')}</p>`;
    if (media.findings.length) body += `<ul class="review-media-findings">${media.findings.map(f => `<li>${t(f.messageKo || f.message, f.message)}</li>`).join('')}</ul>`;
    body += '</details>';
    const appearances = boards.filter(board => {
      const cast = boardWindows.get(board.topic)?.SB_DOC?.characters || [];
      return Array.isArray(cast) ? cast.some(c => c.id === character.id) : Object.hasOwn(cast, character.id);
    });
    if (appearances.length) body += `<p>${t('출연 에피소드', 'Episodes')} · ${appearances.map(b => `<a href="${rel(file, path.join(dir, 'episodes', b.topic, 'storyboard', 'storyboard.html'))}#cast">${esc(b.title)}</a>`).join(' · ')}</p>`;
    const extras = character.images.filter(im => !Object.values(slots).includes(im.file) && regular(dir, path.join(folder, im.file)));
    if (extras.length) body += `<details class="character-extra"><summary>${t('추가 이미지', 'Additional images')} <span class="character-count">${extras.length}</span></summary><div class="review-panels">${extras.map(im => `<figure>${zoomImage(file, path.join(folder, im.file), im.file)}<figcaption>${esc(im.file)}</figcaption></figure>`).join('')}</div></details>`;
    body += '</section>';
    if (characterIdentity) {
      body += `<section class="character-specification" id="identity" aria-labelledby="identity-title"><div class="character-section-heading"><h2 id="identity-title">${t('캐릭터 상세 설정', 'Character specification')}</h2><span>${t('항목을 눌러 접거나 펼칠 수 있습니다.', 'Select a group to collapse or expand it.')}</span></div>`;
      for (const [group, ko, en, fields] of GROUPS) {
        const pending = fields.filter(([key]) => characterIdentity[group][key].status === 'pending').length;
        body += `<details class="character-group" open><summary><h3>${characterIcon(group)}${t(ko, en)}</h3>${pending ? `<span class="character-pending">${t('미정', 'Pending')} ${pending}</span>` : ''}<span class="character-chevron" aria-hidden="true"></span></summary><dl class="character-fields">` + fields.map(([key, labelKo, labelEn]) => {
          const f = characterIdentity[group][key];
          return `<div class="character-field" data-character-field="${group}.${key}"><dt>${t(labelKo, labelEn)}</dt><dd>${identityValue(f)}</dd></div>`;
        }).join('') + '</dl></details>';
      }
      body += '</section>';
    } else {
      body += `<section class="character-specification" id="identity"><h2>${t('기본 정보', 'Basic information')}</h2><dl class="character-fields">${field(t('설명 · 역할', 'Description / role'), role)}${field(t('외형', 'Appearance'), appearance)}</dl><details class="review-detail"><summary>${t('설정 보완 항목', 'Required corrections')}</summary><p>${esc(identityError)}</p></details></section>`;
    }
    body += `<section class="character-voice" id="voice" aria-labelledby="voice-title"><h2 id="voice-title">${characterIcon('speech')}${t('캐릭터 목소리', 'Character voice')}</h2>${regular(dir, path.join(folder, 'voice.wav')) ? `<audio controls preload="metadata" aria-label="${esc(character.name)} · Voice sample" src="${rel(file, path.join(folder, 'voice.wav'))}"></audio>` : `<p class="character-notice">${t('음성 샘플 미등록', 'Voice sample not supplied')}</p>`}`;
    const sample = read(dir, path.join(folder, 'sample.txt')).trim();
    body += sample ? `<blockquote class="character-sample"><p>${esc(sample)}</p></blockquote>` : `<p class="character-notice">${t('샘플 대본 미등록', 'Sample transcript not supplied')}</p>`;
    body += `<details class="review-detail"><summary>${t('음성 설정', 'Voice settings')}</summary>${voice ? `<dl class="character-fields">${field(t('엔진', 'Engine'), voice.engine)}${field(t('음성 ID', 'Voice ID'), voice.voiceId)}${field(t('언어', 'Language'), voice.language)}${field(t('속도', 'Speed'), String(voice.speed))}</dl>` : `<p>${esc(voiceError)}</p>`}</details></section>`;
    body += `<details class="review-detail character-source"><summary>${t('캐릭터 설정 원문', 'Full character identity')}</summary><p>${t('원문에 적힌 검토 상태는 작성 당시 기록입니다. 현재 평가는 페이지 상단에서 확인하세요.', 'Review status in the source reflects when it was written. The current review appears at the top of this page.')}</p><pre class="review-source">${esc(source || '—')}</pre></details></article>`;
    render(file, character.name, 'characters', body);
    const preview = characterPreview(dir, folder, character, slots);
    cards += `<article data-card data-search="${esc((character.name + ' ' + character.id + ' ' + role).toLocaleLowerCase())}" class="review-card review-character"><a class="review-card-art" href="${rel(charIndex, file)}" aria-label="${esc(character.name)}">${preview ? image(charIndex, path.join(folder, preview.file), character.name) : empty('이미지 없음', 'No image yet')}</a><div class="review-card-body"><div class="review-card-heading"><h2><a href="${rel(charIndex, file)}">${esc(character.name)}</a></h2>${voicePreview(dir, charIndex, folder, character)}</div>${preview?.reference ? `<span class="review-reference">${t('참고 이미지', 'Reference image')}</span>` : ''}<p class="review-role">${esc(role)}</p>${review}${panelStatus(slots)}</div></article>`;
  }
  render(charIndex, 'Characters', 'characters', heading(t('캐릭터 시트', 'Character sheets'), `${chars.length} ${t('명의 캐릭터', 'characters')}`) + searchBox() + `<div class="review-grid review-catalog">${cards}</div><div data-no-results${chars.length ? ' hidden' : ''}>${empty(chars.length ? '검색 조건에 맞는 캐릭터가 없습니다.' : '등록된 캐릭터가 없습니다.', chars.length ? 'No characters match your search.' : 'No characters yet.')}</div>`);
  // Episode-owned sheets stay canonical in scenes.js; these are read-only catalogues.
  for (const [kind, ko, en, anchor] of [
    ['props', '소품 시트', 'Prop sheets', 'props'],
    ['locations', '배경 시트', 'Background sheets', 'location-sheets'],
  ]) {
    const file = path.join(dir, 'assets', kind, 'index.html');
    let items = '', count = 0;
    for (const board of boards) {
      const doc = boardWindows.get(board.topic)?.SB_DOC || {};
      const entries = Array.isArray(doc[kind]) ? doc[kind] : [];
      const folder = path.join(dir, 'episodes', board.topic, 'storyboard');
      for (const entry of entries) {
        if (!entry || typeof entry !== 'object') continue;
        count++;
        const name = entry.name || entry.id || '—';
        const reference = entry.imageUrl || (Array.isArray(entry.references) ? entry.references.find(ref => ref && !ref.condition)?.path : '');
        const target = typeof reference === 'string' && reference && !/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(reference) ? path.resolve(folder, reference) : null;
        const preview = target && regular(dir, target) ? image(file, target, name) : empty('참조 이미지 대기', 'Reference image pending');
        const fields = kind === 'locations' ? [['layout', '배치·동선', 'Layout / movement'], ['lighting', '시간·조명', 'Time / lighting'], ['invariants', '고정 요소', 'Invariants']] : [['tracking', '추적 방식', 'Tracking']];
        const details = fields.map(([key, labelKo, labelEn]) => field(t(labelKo, labelEn), Array.isArray(entry[key]) ? entry[key].join(' · ') : entry[key])).join('');
        const source = path.join(folder, 'storyboard.html');
        const link = regular(dir, source) ? `<a href="${rel(file, source)}#${anchor}">${t('스토리보드에서 보기', 'View in storyboard')}</a>` : t('검토 HTML 미등록', 'Review HTML not supplied');
        items += `<article class="review-card" data-card data-search="${esc((name + ' ' + (entry.id || '') + ' ' + board.title).toLocaleLowerCase())}">${preview}<div class="review-card-body"><h2>${esc(name)}</h2><p>${esc(board.title)} · ${esc(entry.id)}</p><p>${esc(entry.description || '')}</p><dl>${details}</dl>${link}</div></article>`;
      }
    }
    render(file, en, kind, heading(t(ko, en), t('에피소드별 시트를 모아 봅니다.', 'Browse sheets by episode.')) + searchBox() + `<div class="review-grid review-catalog">${items}</div><div data-no-results${count ? ' hidden' : ''}>${empty(count ? '검색 조건에 맞는 시트가 없습니다.' : '등록된 시트가 없습니다.', count ? 'No sheets match your search.' : 'No sheets yet.')}</div>`);
  }
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
    } else {
      const message = board.topic + ': missing/unsupported storyboard.html; run storyboard-html.js first';
      warnings.push(message); structuralWarnings.push(message);
    }
    const cover = board.cover ? path.join(root, decodeURIComponent(board.cover.replace(/^\/files\//, ''))) : null;
    cards += `<article class="review-card" data-card data-series="${esc(board.series || '')}" data-search="${esc((board.title + ' ' + board.topic + ' ' + (board.series || '')).toLocaleLowerCase())}">${available ? `<a href="${rel(boardIndex, file)}">` : '<div>'}${cover && regular(dir, cover) ? image(boardIndex, cover, board.title, true) : empty('커버 없음', 'No cover')}<div class="review-card-body"><h2>${esc(board.title)}</h2>${board.series ? `<p>${esc(board.series)}</p>` : ''}${boardMeta(board)}${available ? '' : `<p>${t('검토 HTML을 먼저 생성하세요.', 'Generate the review HTML first.')}</p>`}</div>${available ? '</a>' : '</div>'}</article>`;
  }
  const series = [...new Set(boards.map(b => b.series).filter(Boolean))];
  const filter = series.length ? `<label>${t('재생목록', 'Playlist')} <select data-series-filter><option value="" data-ko="전체" data-en="All">전체</option>${series.map(s => `<option>${esc(s)}</option>`).join('')}</select></label>` : '';
  render(boardIndex, 'Storyboards', 'storyboards', heading(t('스토리보드', 'Storyboards'), `${boards.length} ${t('편의 에피소드', 'episodes')}`) + searchBox().replace('</div>', filter + '</div>') + `<div class="review-grid review-catalog">${cards}</div><div data-no-results${boards.length ? ' hidden' : ''}>${empty(boards.length ? '검색 조건에 맞는 에피소드가 없습니다.' : '등록된 에피소드가 없습니다.', boards.length ? 'No episodes match your search.' : 'No episodes yet.')}</div>`);
  const home = path.join(dir, 'index.html');
  const latest = boards.find(board => outputs.has(path.join(dir, 'storyboards', board.topic, 'index.html')));
  let featured = '';
  if (latest) {
    const file = path.join(dir, 'storyboards', latest.topic, 'index.html');
    const cover = latest.cover ? path.join(root, decodeURIComponent(latest.cover.replace(/^\/files\//, ''))) : null;
    featured = `<section class="review-feature"><h2>${t('최근 에피소드', 'Latest episode')}</h2><a class="review-card" href="${rel(home, file)}">${cover && regular(dir, cover) ? image(home, cover, latest.title, true) : empty('커버 없음', 'No cover')}<div class="review-feature-copy"><h3>${esc(latest.title)}</h3>${latest.series ? `<p>${esc(latest.series)}</p>` : ''}${boardMeta(latest)}<span class="review-primary-link">${t('스토리보드 검토', 'Review storyboard')}</span></div></a></section>`;
  } else if (chars.length) {
    const character = chars[0];
    const folder = path.join(dir, 'assets', 'characters', character.id);
    const preview = characterPreview(dir, folder, character, characterSlots.get(character.id) || {});
    const front = preview?.file;
    featured = `<section class="review-feature"><h2>${t('캐릭터 준비', 'Character preparation')}</h2><a class="review-card" href="${rel(home, path.join(folder, 'index.html'))}">${front && regular(dir, path.join(folder, front)) ? image(home, path.join(folder, front), character.name) : empty('캐릭터 이미지를 준비 중입니다.', 'Character images are not available yet.')}<div class="review-feature-copy"><h3>${esc(character.name)}</h3><p>${esc(character.summary || '')}</p><span class="review-primary-link">${t('캐릭터 시트 검토', 'Review character sheet')}</span></div></a></section>`;
  }
  render(home, channel.name, '', heading(esc(channel.name), t('캐릭터와 에피소드를 한곳에서 검토합니다.', 'Review characters and episodes in one place.')) + featured + `<div class="review-shortcuts"><a class="review-card" href="${rel(home, charIndex)}"><h2>${t('캐릭터 시트', 'Character sheets')}</h2><span class="review-total">${chars.length}</span></a><a class="review-card" href="${rel(home, boardIndex)}"><h2>${t('스토리보드', 'Storyboards')}</h2><span class="review-total">${boards.length}</span></a></div>`);
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
  return { checkScope: 'template freshness and media diagnostics; visual identity and framing require inspection', visualReview: 'not_reviewed', changed, warnings, contentWarnings, structuralWarnings, characters: chars.length, episodes: boards.length };
}

if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    if (!args[0] || args[0].startsWith('--') || args.length > 2 || (args[1] && args[1] !== '--check')) throw new Error('Usage: review-library.js <channel directory> [--check]');
    const result = exportChannel(args[0], { check: args[1] === '--check' });
    console.log(JSON.stringify(result, null, 2));
    if (args[1] === '--check' && (result.changed.length || result.structuralWarnings.length)) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
function libraryHub(channels) {
  const style = channels.length ? `<link rel="stylesheet" href="/files/${encodeURIComponent(channels[0].slug)}/assets/review/review.css">` : '';
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>딸깍스토리 · 로컬 라이브러리</title>${style}</head><body class="review-page"><main class="review-main" style="margin-left:0"><header class="review-header"><h1>딸깍스토리</h1><p>로컬 라이브러리 / Local library</p></header><div class="review-grid">${channels.map(c => `<a class="review-card" href="/files/${encodeURIComponent(c.slug)}/index.html"><h2>${esc(c.name)}</h2><p>${c.characters} characters · ${c.storyboards} episodes</p></a>`).join('') || '<p>No channels / 채널 없음</p>'}</div></main></body></html>`;
}
module.exports = { exportChannel, panels, libraryHub };
