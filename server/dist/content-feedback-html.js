/**
 * Recent-post feedback HTML — meant to be read through charts, bars, and funnels rather than prose.
 * No CDN chart library, so it opens offline (file://) too.
 */
export function escapeHtml(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
function fmt(value, digits = 0, suffix = '') {
    if (value == null || !Number.isFinite(value))
        return '—';
    return `${value.toFixed(digits)}${suffix}`;
}
function shortDate(iso) {
    if (!iso)
        return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime()))
        return escapeHtml(iso.slice(0, 10));
    return `${d.getMonth() + 1}.${d.getDate()}`;
}
function clip(text, n = 36) {
    const t = text.replace(/\s+/g, ' ').trim();
    return t.length <= n ? t : `${t.slice(0, n - 1)}…`;
}
function toneLabel(tone) {
    if (tone === 'ok')
        return 'Keep';
    if (tone === 'watch')
        return 'Watch';
    if (tone === 'fix')
        return 'Fix';
    return 'Pending';
}
function countTones(items) {
    return {
        ok: items.filter((i) => i.tone === 'ok').length,
        watch: items.filter((i) => i.tone === 'watch').length,
        fix: items.filter((i) => i.tone === 'fix').length,
        pending: items.filter((i) => i.tone === 'pending').length,
    };
}
function barRow(label, value, max, kind) {
    const pct = value == null || max <= 0 ? 0 : Math.min(100, (value / max) * 100);
    const show = value == null ? '' : `${pct.toFixed(0)}%`;
    return `<div class="bar-row">
    <span class="bar-lab" title="${escapeHtml(label)}">${escapeHtml(clip(label, 22))}</span>
    <span class="bar-track"><span class="bar-fill ${kind}" style="width:${pct}%"></span></span>
    <span class="bar-n">${value == null ? '—' : escapeHtml(show)}</span>
  </div>`;
}
function chartBlock(title, items, key, higherIsBetter) {
    const values = items.map((i) => i.metrics[key]).filter((n) => n != null);
    const max = Math.max(1, ...values, ...(items.map((i) => i.metrics[key]).filter((n) => n != null)));
    const rows = items
        .map((item) => barRow(item.title, item.metrics[key], max, higherIsBetter ? 'good' : 'bad'))
        .join('');
    return `<figure class="chart">
    <figcaption>${escapeHtml(title)}</figcaption>
    ${rows || '<p class="empty">no numbers yet</p>'}
  </figure>`;
}
function funnel(steps, accent) {
    const cells = steps
        .map((s, i) => `<li class="fn-step ${accent}">
      <span class="fn-i">${String(i + 1).padStart(2, '0')}</span>
      <strong>${escapeHtml(s.k)}</strong>
      <em>${escapeHtml(s.v)}</em>
      <small>${escapeHtml(s.hint)}</small>
    </li>`)
        .join('');
    return `<ol class="funnel">${cells}</ol>`;
}
function rail(step) {
    return `<div class="rail">
    <div><span>Problem</span><p>${escapeHtml(step.problem)}</p></div>
    <div><span>Hypothesis</span><p>${escapeHtml(step.hypothesis)}</p></div>
    <div><span>Next episode</span><p>${escapeHtml(step.next)}</p></div>
  </div>`;
}
function itemCard(item, metricCells) {
    const steps = item.steps.filter((s) => s.lever !== 'pending').map(rail).join('');
    const pending = item.steps.filter((s) => s.lever === 'pending');
    return `<article class="item tone-${item.tone}">
    <header>
      <span class="badge">${toneLabel(item.tone)}</span>
      <h3>${item.permalink ? `<a href="${escapeHtml(item.permalink)}">${escapeHtml(clip(item.title, 52))}</a>` : escapeHtml(clip(item.title, 52))}</h3>
      <time>${shortDate(item.publishedAt)}</time>
    </header>
    <div class="metric-grid">${metricCells}</div>
    ${pending.length ? `<p class="pending-note">${escapeHtml(pending[0].problem)}</p>` : ''}
    ${steps}
  </article>`;
}
function metricCell(k, v, vs) {
    return `<div class="mcell ${vs ?? ''}"><span>${escapeHtml(k)}</span><strong>${escapeHtml(v)}</strong></div>`;
}
function actionBoard(section) {
    const seen = new Set();
    const actions = [];
    for (const item of section.items) {
        for (const step of item.steps) {
            if (step.lever === 'pending')
                continue;
            if (seen.has(step.next))
                continue;
            seen.add(step.next);
            const leverLabel = step.lever === 'hook' ? 'Hook' : step.lever === 'retain' ? 'Retention' : step.lever === 'angle' ? 'Angle' : 'Shares';
            actions.push(`<li><b>${leverLabel}</b><span>${escapeHtml(step.next)}</span></li>`);
            if (actions.length >= 4)
                break;
        }
        if (actions.length >= 4)
            break;
    }
    if (actions.length === 0) {
        return `<aside class="board empty-board">The last ${section.items.length} episodes have no lever to pull against the median. Post one more in the same format to build up the sample.</aside>`;
    }
    return `<aside class="board"><h3>What to change next episode</h3><ol>${actions.join('')}</ol></aside>`;
}
function platformSection(section, title, accent) {
    const id = section.platform.toLowerCase();
    if (!section.available) {
        return `<section id="${id}" class="plat">
      <div class="plat-head ${accent}"><span class="idx">${section.platform === 'YOUTUBE' ? '01' : '02'}</span><h2>${escapeHtml(title)}</h2></div>
      <div class="skip-card">This channel has no ${escapeHtml(title)} token, or the insights scope is missing.<br>${escapeHtml(section.notes[0] ?? '')}</div>
    </section>`;
    }
    const tones = countTones(section.items);
    const accountLine = section.platform === 'YOUTUBE'
        ? `Subscribers ${fmt(numish(section.account?.subscriberCount))} · Videos ${fmt(numish(section.account?.videoCount))}`
        : `Followers ${fmt(numish(section.account?.followersCount))} · Media ${fmt(numish(section.account?.mediaCount))}`;
    const funnelHtml = section.platform === 'YOUTUBE'
        ? funnel([
            { k: 'Views', v: fmt(section.cohort.views, 0), hint: 'not a quality signal' },
            { k: 'Opening pass', v: fmt(section.cohort.hook, 0, '%'), hint: 'engaged / views' },
            { k: 'Retention', v: fmt(section.cohort.retain, 0, '%'), hint: 'average view percentage' },
            { k: 'Subs (channel)', v: fmt(section.cohort.channelSubRate, 2, '%'), hint: 'no per-episode number' },
        ], accent)
        : funnel([
            { k: 'Reach', v: fmt(section.cohort.reach, 0), hint: 'the non-follower audition' },
            { k: '3s stay', v: section.cohort.skip == null ? '—' : `${(100 - section.cohort.skip).toFixed(0)}%`, hint: 'the inverse of drop-off' },
            { k: 'Watch', v: fmt(section.cohort.watch, 1, 's'), hint: 'compare within the same length band' },
            { k: 'Shares', v: fmt(section.cohort.shareRate, 2, '%'), hint: 'against reach' },
        ], accent);
    const charts = section.platform === 'YOUTUBE'
        ? `${chartBlock('Opening pass %', section.items, 'hook', true)}${chartBlock('Average view %', section.items, 'retain', true)}`
        : `${chartBlock('3s drop-off % · lower is better', section.items, 'skip', false)}${chartBlock('Average watch seconds', section.items, 'watch', true)}`;
    const cards = section.items
        .map((item) => {
        if (section.platform === 'YOUTUBE') {
            return itemCard(item, metricCell('Views', fmt(item.metrics.views), vsClass(item.vsCohort.views)) +
                metricCell('Opening pass', fmt(item.metrics.hook, 0, '%'), vsClass(item.vsCohort.hook)) +
                metricCell('Retention', fmt(item.metrics.retain, 0, '%'), vsClass(item.vsCohort.retain)));
        }
        return itemCard(item, metricCell('Reach', fmt(item.metrics.reach), '') +
            metricCell('3s drop-off', fmt(item.metrics.skip, 0, '%'), vsClass(item.vsCohort.skip)) +
            metricCell('Watch', fmt(item.metrics.watch, 1, 's'), vsClass(item.vsCohort.watch)) +
            metricCell('Share rate', fmt(item.metrics.shareRate, 2, '%'), vsClass(item.vsCohort.shareRate)));
    })
        .join('');
    return `<section id="${id}" class="plat">
    <div class="plat-head ${accent}">
      <span class="idx">${section.platform === 'YOUTUBE' ? '01' : '02'}</span>
      <div>
        <h2>${escapeHtml(title)}</h2>
        <p class="acct">${escapeHtml(accountLine)} · Keep ${tones.ok} · Watch ${tones.watch} · Fix ${tones.fix} · Pending ${tones.pending}</p>
      </div>
    </div>
    <h3 class="block-label">Funnel · median of the last ${section.items.length} episodes</h3>
    ${funnelHtml}
    <h3 class="block-label">5-episode comparison</h3>
    <div class="charts">${charts}</div>
    <h3 class="block-label">Per-episode scoring</h3>
    <div class="items">${cards || '<p class="empty">no posts</p>'}</div>
    ${actionBoard(section)}
    <ul class="notes">${section.notes.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}</ul>
  </section>`;
}
function numish(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
function vsClass(vs) {
    if (vs === 'above')
        return 'up';
    if (vs === 'below')
        return 'down';
    return '';
}
export function renderFeedbackHtml(report) {
    const when = new Date(report.generatedAt);
    const whenLabel = `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}-${String(when.getDate()).padStart(2, '0')} ${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}`;
    const channel = report.channel ?? 'default token';
    return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Last ${report.limit} episodes feedback — ${escapeHtml(channel)}</title>
<style>
:root {
  --paper: #f3efe4;
  --ink: #161410;
  --mute: #6b6458;
  --line: #d9d1c3;
  --card: #fffdf7;
  --yt: #b42318;
  --ig: #9d174d;
  --ok: #3d6b4f;
  --warn: #9a6700;
  --fix: #b42318;
  --wait: #6b6458;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html { scroll-behavior: smooth; }
body {
  font-family: "Pretendard", "Apple SD Gothic Neo", "Noto Sans KR", ui-sans-serif, sans-serif;
  background: var(--paper);
  color: var(--ink);
  line-height: 1.45;
  font-size: 15px;
  word-break: keep-all;
}
.wrap { max-width: 1080px; margin: 0 auto; padding: 36px 28px 80px; }
header.hero { padding-bottom: 28px; border-bottom: 1px solid var(--line); margin-bottom: 28px; }
.kicker { font-size: 11px; letter-spacing: .16em; font-weight: 700; color: var(--mute); }
.hero h1 { font-size: 34px; letter-spacing: -.03em; line-height: 1.2; margin: 8px 0 10px; font-weight: 800; }
.hero .sub { color: var(--mute); max-width: 640px; }
.meta { display: flex; flex-wrap: wrap; gap: 8px 20px; margin-top: 16px; font-size: 13px; color: var(--mute); font-variant-numeric: tabular-nums; }
nav.jump { display: flex; gap: 8px; margin: 0 0 32px; }
nav.jump a {
  text-decoration: none; color: var(--ink); border: 1px solid var(--line);
  padding: 8px 14px; border-radius: 999px; font-size: 13px; font-weight: 600; background: var(--card);
}
.method {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 0;
  border: 1px solid var(--line); border-radius: 14px; overflow: hidden;
  margin: 0 0 36px; background: var(--card);
}
.method li { list-style: none; padding: 16px 18px; border-right: 1px solid var(--line); }
.method li:last-child { border-right: 0; }
.method b { display: block; font-size: 11px; letter-spacing: .12em; color: var(--mute); margin-bottom: 6px; }
.plat { margin-bottom: 56px; }
.plat-head { display: flex; gap: 16px; align-items: flex-end; margin-bottom: 18px; padding-bottom: 12px; border-bottom: 2px solid var(--ink); }
.plat-head.yt { border-color: var(--yt); }
.plat-head.ig { border-color: var(--ig); }
.idx { font-size: 28px; font-weight: 800; letter-spacing: -.04em; line-height: 1; }
.plat-head.yt .idx { color: var(--yt); }
.plat-head.ig .idx { color: var(--ig); }
.plat-head h2 { font-size: 26px; letter-spacing: -.02em; }
.acct { color: var(--mute); font-size: 13px; margin-top: 4px; font-variant-numeric: tabular-nums; }
.block-label { font-size: 12px; letter-spacing: .14em; text-transform: uppercase; color: var(--mute); margin: 22px 0 10px; }
.funnel { display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; list-style: none; }
.fn-step { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 14px 14px 12px; position: relative; }
.fn-step:not(:last-child)::after {
  content: ""; position: absolute; right: -14px; top: 50%; width: 10px; height: 10px;
  border-right: 2px solid var(--mute); border-top: 2px solid var(--mute);
  transform: translateY(-50%) rotate(45deg);
}
.fn-i { display: block; font-size: 11px; color: var(--mute); letter-spacing: .08em; }
.fn-step strong { display: block; margin-top: 4px; font-size: 14px; }
.fn-step em { display: block; font-style: normal; font-size: 26px; font-weight: 800; letter-spacing: -.03em; font-variant-numeric: tabular-nums; margin: 4px 0 2px; }
.fn-step.yt em { color: var(--yt); }
.fn-step.ig em { color: var(--ig); }
.fn-step small { color: var(--mute); font-size: 12px; }
.charts { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.chart { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px 10px; }
.chart figcaption { font-size: 13px; font-weight: 700; margin-bottom: 10px; }
.bar-row { display: grid; grid-template-columns: 118px 1fr 52px; gap: 8px; align-items: center; margin-bottom: 7px; }
.bar-lab { font-size: 12px; color: var(--mute); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bar-track { height: 10px; background: #ece6d8; border-radius: 99px; overflow: hidden; }
.bar-fill { display: block; height: 100%; border-radius: 99px; }
.bar-fill.good { background: var(--ok); }
.bar-fill.bad { background: var(--fix); }
.bar-n { font-size: 12px; font-variant-numeric: tabular-nums; text-align: right; }
.items { display: flex; flex-direction: column; gap: 12px; }
.item { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 14px 16px 12px; }
.item header { display: grid; grid-template-columns: auto 1fr auto; gap: 10px; align-items: baseline; margin-bottom: 10px; }
.item h3 { font-size: 15.5px; font-weight: 700; }
.item h3 a { color: inherit; text-decoration: none; border-bottom: 1px solid transparent; }
.item h3 a:hover { border-bottom-color: var(--ink); }
.item time { font-size: 12px; color: var(--mute); font-variant-numeric: tabular-nums; }
.badge { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 99px; background: #ece6d8; }
.tone-ok .badge { background: #dce8df; color: var(--ok); }
.tone-watch .badge { background: #fff1c2; color: var(--warn); }
.tone-fix .badge { background: #f8d4d0; color: var(--fix); }
.tone-pending .badge { background: #ece6d8; color: var(--wait); }
.metric-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; }
.mcell { border: 1px solid var(--line); border-radius: 10px; padding: 8px 10px; }
.mcell span { display: block; font-size: 11px; color: var(--mute); }
.mcell strong { font-size: 18px; font-variant-numeric: tabular-nums; letter-spacing: -.02em; }
.mcell.up strong { color: var(--ok); }
.mcell.down strong { color: var(--fix); }
.rail { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0; margin-top: 12px; border: 1px dashed var(--line); border-radius: 10px; overflow: hidden; }
.rail div { padding: 10px 12px; border-right: 1px dashed var(--line); }
.rail div:last-child { border-right: 0; }
.rail span { display: block; font-size: 10px; letter-spacing: .12em; color: var(--mute); margin-bottom: 4px; }
.rail p { font-size: 13.5px; }
.pending-note { margin-top: 8px; font-size: 13px; color: var(--mute); }
.board { margin-top: 18px; background: var(--ink); color: var(--paper); border-radius: 14px; padding: 16px 18px; }
.board h3 { font-size: 13px; letter-spacing: .12em; margin-bottom: 10px; color: #cfc6b6; }
.board ol { list-style: none; display: grid; gap: 8px; }
.board li { display: grid; grid-template-columns: 52px 1fr; gap: 10px; align-items: baseline; }
.board b { font-size: 12px; color: #e8c4a8; }
.empty-board { color: #cfc6b6; }
.notes { margin-top: 14px; padding-left: 18px; color: var(--mute); font-size: 12.5px; }
.skip-card, .empty { background: var(--card); border: 1px dashed var(--line); border-radius: 12px; padding: 20px; color: var(--mute); }
footer { margin-top: 40px; font-size: 12px; color: var(--mute); border-top: 1px solid var(--line); padding-top: 16px; }
@media (max-width: 800px) {
  .funnel, .charts, .method, .metric-grid, .rail { grid-template-columns: 1fr; }
  .fn-step:not(:last-child)::after { display: none; }
  .rail div { border-right: 0; border-bottom: 1px dashed var(--line); }
  .rail div:last-child { border-bottom: 0; }
  .item header { grid-template-columns: 1fr; }
}
</style>
</head>
<body>
<div class="wrap">
<header class="hero">
  <div class="kicker">REVIEW · RECENT ${report.limit}</div>
  <h1>${escapeHtml(channel)} last ${report.limit} episodes</h1>
  <p class="sub">YouTube and Instagram read through the same frame. Not a score — the lever to pull on the next episode. The comparison baseline is the median of these ${report.limit} episodes.</p>
  <div class="meta">
    <span>Written ${escapeHtml(whenLabel)}</span>
    <span>Window ${report.days} days</span>
    <span>YouTube ${report.youtube.available ? `${report.youtube.items.length} episodes` : 'none'}</span>
    <span>Instagram ${report.instagram.available ? `${report.instagram.items.length} episodes` : 'none'}</span>
  </div>
</header>
<nav class="jump">
  <a href="#youtube">01 YouTube</a>
  <a href="#instagram">02 Instagram</a>
</nav>
<ol class="method">
  <li><b>01 Problem</b>which number fell off the median</li>
  <li><b>02 Hypothesis</b>packaging, hook, retention, or shares — which one to suspect</li>
  <li><b>03 Next episode</b>change one thing and look at the same metric again</li>
</ol>
${platformSection(report.youtube, 'YouTube', 'yt')}
${platformSection(report.instagram, 'Instagram Reels', 'ig')}
<footer>social-flow · content_feedback · compares against the median of the last ${report.limit} episodes with no absolute thresholds. YouTube Analytics runs 2-3 days behind.</footer>
</div>
</body>
</html>
`;
}
