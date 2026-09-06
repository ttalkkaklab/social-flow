/* Deterministic SVG charts. Geometry always uses the source values and one shared scale. */
(function(root){
  'use strict';
  const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clamp = x => Math.max(0,Math.min(1,x));
  const ease = x => {x=clamp(x);return x*x*x*(x*(x*6-15)+10)};
  const colors = (surface,accent) => surface==='ink'
    ? {paper:'#152B2A',ink:'#F2F0E8',muted:'#A3B6AE',line:'#48615B',neutral:'#769086',accent:accent||'#C1E681'}
    : {paper:'#F4F1E9',ink:'#173B33',muted:'#52695F',line:'#CFD5CB',neutral:'#A4B6A9',accent:accent||'#176A53'};
  const color = s => /^#[0-9a-f]{6}$/i.test(s||'') ? s : null;
  function render(data,{width=728,height=660,group=1,progress=1,accent}={}){
    const C=colors(data.surface,color(accent)),v=data.values,n=v.length;
    const p=ease(progress/0.78),first=group<=1,reveal=first?p:1;
    const beat=data.beats[Math.max(0,group-1)],prev=data.beats[Math.max(0,group-2)];
    const emphasis=i=>{const now=beat.focus.includes(v[i].label)?1:0,old=first?0:(prev.focus.includes(v[i].label)?1:0);return old+(now-old)*p};
    const axisNum=x=>new Intl.NumberFormat('en-US',{maximumFractionDigits:12,...(Math.abs(x)>=1e6?{notation:'compact'}:x!==0&&Math.abs(x)<1e-6?{notation:'scientific'}:{})}).format(x);
    const num=x=>new Intl.NumberFormat('en-US',{maximumFractionDigits:data.decimals??1,...(Math.abs(x)>=1e6?{notation:'compact'}:{})}).format(x);
    const t=(x,y,s,size=32,fill=C.ink,anchor='start',weight=500,opacity=1)=>`<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" text-anchor="${anchor}" font-weight="${weight}" opacity="${opacity}">${esc(s)}</text>`;
    const line=(x1,y1,x2,y2,stroke=C.line,w=2,extra='')=>`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${w}" ${extra}/>`;
    const label=(x,y,s,anchor='start',size=32)=>{
      const chars=Array.from(String(s)),limit=12;
      return chars.length<=limit?t(x,y,s,size,C.ink,anchor):t(x,y,chars.slice(0,limit).join(''),size,C.ink,anchor)+t(x,y+size*1.15,chars.slice(limit).join(''),size,C.ink,anchor);
    };
    let out='';
    const hi=Math.max(0,...v.map(d=>d.value||0)),lo=Math.min(0,...v.map(d=>d.value||0));
    const span=hi-lo||1;
    // A consistent domain, including zero, makes group changes comparisons rather than rescaling tricks.
    if(data.chart==='bar'||data.chart==='dot'){
      const left=0,right=width-112,top=94;
      const sizes=v.map(d=>Array.from(d.label).length>12?118:82),available=height-154;
      const total=sizes.reduce((a,b)=>a+b,0),space=Math.max(0,(available-total)/n);
      const x=a=>left+(a-lo)/span*right;
      for(let k=0;k<=4;k++){const value=lo+span*k/4,xx=x(value);out+=line(xx,56,xx,height-45)+t(xx,32,axisNum(value),27,C.muted,k===0?'start':k===4?'end':'middle')}
      if(lo<0)out+=line(x(0),56,x(0),height-45,C.muted,3);
      let cursor=top;
      v.forEach((d,i)=>{
        const y=cursor,hot=emphasis(i),end=x(d.value*reveal),zero=x(0);cursor+=sizes[i]+space;
        out+=label(left,y,d.label,'start',32);
        const yy=y+(sizes[i]>82?84:48);
        if(data.chart==='bar'){
          out+=`<rect x="${Math.min(zero,end)}" y="${yy-12}" width="${Math.abs(end-zero)}" height="24" fill="${C.neutral}"/>`;
          out+=`<rect x="${Math.min(zero,end)}" y="${yy-12}" width="${Math.abs(end-zero)}" height="24" fill="${C.accent}" opacity="${hot}"/>`;
        }else{
          out+=line(zero,yy,end,yy,C.neutral,4)+`<circle cx="${end}" cy="${yy}" r="10" fill="${C.ink}"/><circle cx="${end}" cy="${yy}" r="10" fill="${C.accent}" opacity="${hot}"/>`;
        }
        out+=t(width,yy+10,num(d.value),42,C.ink,'end',700,first?p:1);
      });
    }else if(data.chart==='line'||data.chart==='histogram'){
      const left=92,right=width-24,top=58,bottom=height-105,pw=right-left,ph=bottom-top;
      const y=a=>bottom-(a-lo)/span*ph;
      for(let k=0;k<=4;k++){const value=lo+span*k/4,yy=y(value);out+=line(left,yy,right,yy)+t(left-16,yy+9,axisNum(value),28,C.muted,'end')}
      if(data.chart==='line'){
        const dates=v.map(d=>Date.parse(d.date)),ds=dates[n-1]-dates[0],x=i=>left+(dates[i]-dates[0])/ds*pw;
        const points=v.map((d,i)=>`${x(i)},${y(d.value)}`).join(' ');
        out+=`<defs><clipPath id="chart-reveal"><rect x="${left-12}" y="0" width="${(pw+24)*reveal}" height="${height}"/></clipPath></defs><g clip-path="url(#chart-reveal)"><polyline points="${points}" fill="none" stroke="${C.ink}" stroke-width="5" stroke-linejoin="round"/>`;
        v.forEach((d,i)=>{const hot=emphasis(i);out+=`<circle cx="${x(i)}" cy="${y(d.value)}" r="${5+hot*4}" fill="${C.accent}"/>`;if(beat.focus.includes(d.label)||prev.focus.includes(d.label))out+=t(x(i),Math.max(30,y(d.value)-23),num(d.value),34,C.ink,i===0?'start':i===n-1?'end':'middle',700,hot)});
        out+='</g>';
        for(const i of [0,n-1])out+=t(x(i),bottom+45,v[i].date,27,C.muted,i===0?'start':i===n-1?'end':'middle');
      }else{
        const cell=pw/n;
        v.forEach((d,i)=>{const hot=emphasis(i),yy=y(d.value*reveal);out+=`<rect x="${left+i*cell+1}" y="${yy}" width="${cell-2}" height="${bottom-yy}" fill="${C.neutral}"/><rect x="${left+i*cell+1}" y="${yy}" width="${cell-2}" height="${bottom-yy}" fill="${C.accent}" opacity="${hot}"/>`});
        out+=t(left,bottom+45,v[0].from,28,C.muted)+t(right,bottom+45,v[n-1].to,28,C.muted,'end');
        out+=t((left+right)/2,bottom+84,data.binUnit||'',28,C.muted,'middle');
      }
    }else if(data.chart==='stacked-bar'){
      const barY=90,barH=74;let x=0;
      v.forEach((d,i)=>{const w=d.value/data.total*width*reveal,hot=emphasis(i);out+=`<rect x="${x}" y="${barY}" width="${w}" height="${barH}" fill="${C.neutral}"/><rect x="${x}" y="${barY}" width="${w}" height="${barH}" fill="${C.accent}" opacity="${hot}"/>`;x+=w});
      out+=t(0,43,'0%',28,C.muted)+t(width,43,'100%',28,C.muted,'end');
      v.forEach((d,i)=>{const yy=245+i*(height-265)/n,hot=emphasis(i);out+=`<circle cx="8" cy="${yy-10}" r="6" fill="${C.accent}" opacity="${.3+.7*hot}"/>`+label(30,yy,d.label)+t(width,yy,num(d.value)+'  /  '+num(d.value/data.total*100)+'%',34,C.ink,'end',700)});
    }else if(data.chart==='timeline'){
      const dates=v.map(d=>Date.parse(d.date)),range=dates[n-1]-dates[0],top=48,bottom=height-100;
      out+=line(22,top,22,bottom,C.line,3);
      v.forEach((d,i)=>{const yy=top+(dates[i]-dates[0])/range*(bottom-top),hot=emphasis(i);out+=`<circle cx="22" cy="${yy}" r="${6+hot*4}" fill="${C.accent}" opacity="${first?p:1}"/>`+t(58,yy-9,d.date,29,C.muted)+label(58,yy+34,d.label,'start',38)});
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(beat.insight)}" style="font-family:inherit;font-variant-numeric:tabular-nums">${out}</svg>`;
  }
  const api={render,colors,esc,ease};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.CHART_RUNTIME=api;
})(typeof window==='object'?window:globalThis);
