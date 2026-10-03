// Evidence for slide-design §6. Warning thresholds do not replace the reviewer.
// This function is serialized into the capture page; keep it free of module state.
export function measureSlideDOM(groupRows) {
  const stage = document.getElementById('stage') || document.body;
  const wide = window.FORMAT === 'youtube-long-16x9';
  const hidden = el => {
    for (let p = el; p; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.display === 'none' || s.visibility === 'hidden' || s.visibility === 'collapse' || Number(s.opacity) === 0) return selector(p);
    }
    return false;
  };
  const selector = el => {
    if (el.id) return '#' + el.id;
    const parts = [];
    for (let p = el; p && p !== stage; p = p.parentElement) {
      parts.unshift(p.localName + ':nth-child(' + (Array.from(p.parentElement?.children || []).indexOf(p) + 1) + ')');
    }
    return (stage.id ? '#' + stage.id : 'body') + ' > ' + parts.join(' > ');
  };
  const owner = el => {
    const phrase = el.closest('.word,.word2');
    if (phrase) return phrase;
    const svgText = el.closest('text');
    if (svgText) return svgText;
    for (let p = el; p && p !== stage; p = p.parentElement) {
      if (!['inline', 'contents', 'inline-block'].includes(getComputedStyle(p).display)) return p;
    }
    return el;
  };
  const floor = el => {
    const role = el.closest('[data-type-role]')?.dataset.typeRole;
    // Keep role floors aligned with slide-design §3 and chart-runtime TYPE/HAIR/RULE.
    const sizes = {foot:[28,24], kicker:[34,26], description:[44,32], label:[54,40], title:[76,56], word:[124,92], word2:[68,50]};
    if (role && sizes[role]) return sizes[role][wide ? 1 : 0];
    if (el.closest('#source,.foot')) return sizes.foot[wide ? 1 : 0];
    if (el.closest('#eyebrow,.kicker')) return sizes.kicker[wide ? 1 : 0];
    if (el.closest('#insight,.desc,.sub')) return sizes.description[wide ? 1 : 0];
    if (el.closest('.word2')) return sizes.word2[wide ? 1 : 0];
    if (el.closest('.word')) return sizes.word[wide ? 1 : 0];
    // Unclassified text gets the smallest role floor; role-specific checks remain review evidence.
    return sizes.foot[wide ? 1 : 0];
  };
  const groups = new Map(), textSamples = [], strokeSamples = [];
  const excludedText = [];
  const walker = document.createTreeWalker(stage, NodeFilter.SHOW_TEXT);
  for (let node; (node = walker.nextNode());) {
    if (!node.textContent.trim() || node.parentElement.closest('script,style')) continue;
    const el = node.parentElement;
    const hiddenBy=hidden(el);
    if (hiddenBy) { excludedText.push({sel:selector(el),hiddenBy,text:node.textContent.trim()}); continue; }
    const parent = owner(el), cs = getComputedStyle(el), px = parseFloat(cs.fontSize);
    const sel = selector(el);
    const glyphs = [];
    let offset = 0;
    for (const char of node.textContent) {
      const range = document.createRange();
      range.setStart(node, offset); offset += char.length; range.setEnd(node, offset);
      const r = range.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && !/[\r\n]/.test(char)) glyphs.push({x:r.x,y:r.y,w:r.width,h:r.height,char,px});
    }
    if (!glyphs.some(g => g.char.trim())) continue;
    textSamples.push({px,sel,floor:floor(el)});
    if (!groups.has(parent)) groups.set(parent, []);
    groups.get(parent).push(...glyphs);
  }
  const text = [];
  for (const [el, glyphs] of groups) {
    const boxes = groupRows(glyphs);
    text.push({sel:selector(el),line_limit:el.matches('.word.max')?2:el.matches('.word')?3:el.matches('.word2')?2:null,lines:boxes.length,chars:Math.max(0,...boxes.map(r=>r.chars)),rows:boxes});
  }
  for (const el of stage.querySelectorAll('*')) {
    if (hidden(el) || !el.getClientRects().length) continue;
    const cs = getComputedStyle(el), sel = selector(el);
    for (const side of ['Top','Right','Bottom','Left']) {
      const px=parseFloat(cs['border'+side+'Width']);
      if (px>0 && !['none','hidden'].includes(cs['border'+side+'Style'])) strokeSamples.push({px,sel,floor:wide?2:3});
    }
    if (el instanceof SVGElement && cs.stroke !== 'none') {
      const px=parseFloat(cs.strokeWidth);
      const role=el.dataset.strokeRole;
      const strokeFloor=role==='marker'?null:role==='rule'?(wide?4:6):role==='hair'?(wide?2:3):el.localName==='line'?(wide?4:6):(wide?2:3);
      if (px>0) strokeSamples.push({px,sel,role:role||null,floor:strokeFloor});
    }
  }
  const min = items => items.length ? items.reduce((a,b)=>a.px<=b.px?a:b) : null;
  return {text,textSamples,strokeSamples,min_text_px:min(textSamples),min_stroke_px:min(strokeSamples),
    max_lines:Math.max(0,...text.map(t=>t.lines)),max_line_chars:Math.max(0,...text.map(t=>t.chars)),
    excluded_text_nodes:excludedText.length,excluded_text:excludedText};
}

export function percentileContrast(bytes) {
  if (!bytes.length) return null;
  const hist = new Uint32Array(256);
  for (const value of bytes) hist[value]++;
  const percentile = p => { let sum=0; for(let i=0;i<256;i++){sum+=hist[i];if(sum>=Math.ceil(bytes.length*p))return i;} return 255; };
  const linear = n => {const c=n/255; return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;};
  return (linear(percentile(.95))+.05)/(linear(percentile(.05))+.05);
}

export function groupTextRows(glyphs) {
    const rows = [];
    for (const g of glyphs) {
      // Compare to individual glyphs, not an ever-growing union that can bridge adjacent rows.
      let row = rows.find(r => r.glyphs.some(a => Math.min(a.y+a.h,g.y+g.h)-Math.max(a.y,g.y) >= Math.min(a.h,g.h)*.5));
      if (!row) { row = {glyphs:[]}; rows.push(row); }
      row.glyphs.push(g);
    }
    const boxes = rows.map(row => {
      const gs = row.glyphs.slice();
      while (gs.length && !gs[gs.length-1].char.trim()) gs.pop();
      if (!gs.length) return null;
      const x=Math.min(...gs.map(g=>g.x)), y=Math.min(...gs.map(g=>g.y));
      return {x,y,w:Math.max(...gs.map(g=>g.x+g.w))-x,h:Math.max(...gs.map(g=>g.y+g.h))-y,
        chars:gs.length,px:Math.min(...gs.map(g=>g.px))};
    }).filter(Boolean).sort((a,b)=>a.y-b.y);
    // Clip the overlapping edge at the halfway line; a crop must not include its neighbour.
    const bounds = boxes.map(r=>({...r}));
    boxes.forEach((r,i)=>{
      const top=i ? Math.max(r.y,(bounds[i-1].y+bounds[i-1].h+r.y)/2) : r.y;
      const bottom=i+1<bounds.length ? Math.min(r.y+r.h,(r.y+r.h+bounds[i+1].y)/2) : r.y+r.h;
      r.y=top; r.h=Math.max(0,bottom-top);
    });
    return boxes;
}
