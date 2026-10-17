/* Deterministic SVG charts. Geometry always uses the source values and one shared scale. */
(function(root){
  'use strict';
  const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clamp = x => Math.max(0,Math.min(1,x));
  const bezier = (x1, y1, x2, y2) => {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const sampleX = t => ((ax * t + bx) * t + cx) * t;
    const sampleY = t => ((ay * t + by) * t + cy) * t;
    const sampleDX = t => (3 * ax * t + 2 * bx) * t + cx;
    return x => {
      let t = x;
      for (let i = 0; i < 8; i++) {
        const d = sampleX(t) - x;
        const dx = sampleDX(t);
        if (Math.abs(d) < 1e-6 || Math.abs(dx) < 1e-6) break;
        t = Math.min(1, Math.max(0, t - d / dx));
      }
      return sampleY(t);
    };
  };
  // Keep easing and growMs/plateMs defaults aligned with chart-slide-template --grow/--plate and bezier tokens.
  const ease = bezier(.05,.7,.1,1), geometryEase=bezier(.4,0,.2,1);
  function wrapLabel(value,limit){
    limit=Math.max(1,Math.floor(limit));const rows=[];let line='';
    for(let word of String(value).split(/\s+/).filter(Boolean)){
      const candidate=line?line+' '+word:word;
      if(Array.from(candidate).length<=limit){line=candidate;continue;}
      if(line){rows.push(line);line='';}
      let chars=Array.from(word);
      while(chars.length>limit){rows.push(chars.slice(0,limit).join(''));chars=chars.slice(limit);}
      line=chars.join('');
    }
    if(line)rows.push(line);return rows;
  }
  const colors = (surface,accent) => surface==='ink'
    ? {paper:'#152B2A',ink:'#F2F0E8',muted:'#A3B6AE',line:'#48615B',neutral:'#769086',accent:accent||'#C1E681'}
    : {paper:'#F4F1E9',ink:'#173B33',muted:'#52695F',line:'#CFD5CB',neutral:'#A4B6A9',accent:accent||'#176A53'};
  const color = s => /^#[0-9a-f]{6}$/i.test(s||'') ? s : null;
  const mix=(a,b,p)=>'#'+[1,3,5].map(i=>Math.round(parseInt(a.slice(i,i+2),16)*(1-p)+parseInt(b.slice(i,i+2),16)*p).toString(16).padStart(2,'0')).join('');
  function sectorPath(cx,cy,r,inner,start,sweep){
    if(sweep<=0)return '';
    const point=(radius,a)=>[cx+radius*Math.cos(a),cy+radius*Math.sin(a)];
    // Two arcs also represent an exact whole circle; tiny shares retain their source angle.
    const a=point(r,start),b=point(r,start+sweep/2),c=point(r,start+sweep);
    let path=`M${a} A${r},${r} 0 0 1 ${b} A${r},${r} 0 0 1 ${c}`;
    if(inner){const d=point(inner,start+sweep),e=point(inner,start+sweep/2),f=point(inner,start);path+=` L${d} A${inner},${inner} 0 0 0 ${e} A${inner},${inner} 0 0 0 ${f}`}
    else path+=` L${cx},${cy}`;
    return path+' Z';
  }
  const project=([longitude,latitude])=>[longitude*Math.PI/180*Math.cos(Math.PI/6),-Math.sin(latitude*Math.PI/180)/Math.cos(Math.PI/6)];
  function mapGeometry(geojson,width,height,padding=26){
    const polygons=g=>g.type==='Polygon'?[g.coordinates]:g.coordinates;
    const points=geojson.features.flatMap(f=>polygons(f.geometry).flatMap(poly=>poly.flatMap(ring=>ring.map(project))));
    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
    for(const [x,y] of points){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y)}
    const scale=Math.min((width-2*padding)/(maxX-minX),(height-2*padding)/(maxY-minY));
    const locate=p=>{const [x,y]=project(p);return [width/2+(x-(minX+maxX)/2)*scale,height/2+(y-(minY+maxY)/2)*scale]};
    const paths=geojson.features.map(f=>({id:f.id,path:polygons(f.geometry).map(poly=>poly.map(ring=>ring.map((p,i)=>(i?'L':'M')+locate(p).join(',')).join(' ')+' Z').join(' ')).join(' ')}));
    return {locate,paths};
  }
  function render(data,{width=728,height=660,group=1,progress=1,accent,wide=false,elapsedMs=progress*1000,growMs=1000,plateMs=400}={}){
    const glass=data.material==='liquid-glass';
    const C=glass?{paper:'#F4F6FA',ink:'#172237',muted:'#536077',line:'#D9E1EE',neutral:'#B7CBE8',accent:color(accent)||'#1764D8'}:colors(data.surface,color(accent)),v=data.values,n=v.length;
    // Keep type/stroke floors aligned with slide-design §3 and slide-legibility role floors.
    const TYPE=wide?{label:32,value:32,foot:24}:{label:44,value:44,foot:28},HAIR=wide?2:3,RULE=wide?4:6;
    const first=group<=1,p=ease(clamp(elapsedMs/(first?growMs:plateMs))),reveal=first?geometryEase(clamp(elapsedMs/growMs)):1;
    const beat=data.beats[Math.max(0,group-1)],prev=data.beats[Math.max(0,group-2)];
    const emphasis=i=>{const now=beat.focus.includes(v[i].label)?1:0,old=first?0:(prev.focus.includes(v[i].label)?1:0);return old+(now-old)*p};
    const axisNum=x=>new Intl.NumberFormat('en-US',{maximumFractionDigits:12,...(Math.abs(x)>=1e6?{notation:'compact'}:x!==0&&Math.abs(x)<1e-6?{notation:'scientific'}:{})}).format(x);
    const percent=x=>{if(x>0&&x<.0001)return x.toExponential(1);if(x<100&&x>99.9999)return '>99.9999';const gap=Math.min(Math.abs(x),Math.abs(100-x));const digits=gap?Math.min(4,Math.max(1,1-Math.floor(Math.log10(gap)))):0;return new Intl.NumberFormat('en-US',{maximumFractionDigits:digits}).format(x)};
    const num=x=>{const result=new Intl.NumberFormat('en-US',{maximumFractionDigits:data.decimals??1,...(Math.abs(x)>=1e6?{notation:'compact'}:{})}).format(x);return x!==0&&Number(result.replace(/,/g,''))===0?axisNum(x):result};
    const t=(x,y,s,size,fill=C.ink,anchor='start',weight=500,opacity=1)=>`<text data-type-role="${size===TYPE.foot?'foot':'description'}" x="${x}" y="${y}" font-size="${size}" fill="${fill}" text-anchor="${anchor}" font-weight="${weight}" opacity="${opacity}">${esc(s)}</text>`;
    const line=(x1,y1,x2,y2,stroke=C.line,w=HAIR,extra='',role='hair')=>`<line data-stroke-role="${role}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${w}" ${extra}/>`;
    const label=(x,y,s,anchor='start',size=TYPE.label,limit=Math.floor(width/size))=>
      wrapLabel(s,limit).map((row,i)=>t(x,y+i*size*1.15,row,size,C.ink,anchor)).join('');
    let out='';
    const hi=data.domain?.[1]??Math.max(0,...v.map(d=>d.value||0)),lo=data.domain?.[0]??Math.min(0,...v.map(d=>d.value||0));
    const span=hi-lo||1;
    // A consistent domain, including zero, makes group changes comparisons rather than rescaling tricks.
    if(data.chart==='bar'||data.chart==='dot'){
      const left=0,right=width-112,top=94;
      const labelRows=v.map(d=>wrapLabel(d.label,Math.floor(width/TYPE.label)).length);
      const sizes=labelRows.map(n=>n*TYPE.label*1.15+60.2),available=height-154;
      const total=sizes.reduce((a,b)=>a+b,0),space=Math.max(0,(available-total)/n);
      const x=a=>left+(a-lo)/span*right;
      for(let k=0;k<=4;k++){const value=lo+span*k/4,xx=x(value);out+=line(xx,56,xx,height-45,C.line,k===0?RULE:HAIR,'',k===0?'rule':'hair')+t(xx,32,axisNum(value),TYPE.foot,C.muted,k===0?'start':k===4?'end':'middle')}
      if(lo<0)out+=line(x(0),56,x(0),height-45,C.muted,RULE,'','rule');
      let cursor=top;
      v.forEach((d,i)=>{
        const y=cursor,hot=emphasis(i),end=x(d.value*reveal),zero=x(0);cursor+=sizes[i]+space;
        out+=label(left,y,d.label,'start',TYPE.label);
        const yy=y+(labelRows[i]-1)*TYPE.label*1.15+TYPE.label*1.15+11.2;
        if(data.chart==='bar'){
          out+=`<rect x="${Math.min(zero,end)}" y="${yy-12}" width="${Math.abs(end-zero)}" height="24" fill="${C.neutral}"/>`;
          out+=`<rect x="${Math.min(zero,end)}" y="${yy-12}" width="${Math.abs(end-zero)}" height="24" fill="${C.accent}" opacity="${hot}"/>`;
        }else{
          out+=line(zero,yy,end,yy,C.neutral,RULE,'','rule')+`<circle cx="${end}" cy="${yy}" r="10" fill="${C.ink}"/><circle cx="${end}" cy="${yy}" r="10" fill="${C.accent}" opacity="${hot}"/>`;
        }
        out+=t(width,yy+10,num(d.value),TYPE.value,C.ink,'end',700,first?p:1);
      });
    }else if(data.chart==='line'||data.chart==='histogram'){
      const left=92,right=width-24,top=58,bottom=height-105,pw=right-left,ph=bottom-top;
      const y=a=>bottom-(a-lo)/span*ph;
      for(let k=0;k<=4;k++){const value=lo+span*k/4,yy=y(value);out+=line(left,yy,right,yy,C.line,k===0?RULE:HAIR,'',k===0?'rule':'hair')+t(left-16,yy+9,axisNum(value),TYPE.foot,C.muted,'end')}
      if(data.chart==='line'){
        const dates=v.map(d=>Date.parse(d.date)),ds=dates[n-1]-dates[0],x=i=>left+(dates[i]-dates[0])/ds*pw;
        const points=v.map((d,i)=>`${x(i)},${y(d.value)}`).join(' ');
        out+=`<defs><clipPath id="chart-reveal"><rect x="${left-12}" y="0" width="${(pw+24)*reveal}" height="${height}"/></clipPath></defs><g clip-path="url(#chart-reveal)"><polyline points="${points}" fill="none" stroke="${C.ink}" stroke-width="5" stroke-linejoin="round"/>`;
        v.forEach((d,i)=>{const hot=emphasis(i);out+=`<circle cx="${x(i)}" cy="${y(d.value)}" r="${5+hot*4}" fill="${C.accent}"/>`;if(beat.focus.includes(d.label)||prev.focus.includes(d.label))out+=t(x(i),Math.max(TYPE.value*1.2,y(d.value)-23),num(d.value),TYPE.value,C.ink,i===0?'start':i===n-1?'end':'middle',700,hot)});
        out+='</g>';
        for(const i of [0,n-1])out+=t(x(i),bottom+45,v[i].date,TYPE.foot,C.muted,i===0?'start':i===n-1?'end':'middle');
      }else{
        const cell=pw/n;
        v.forEach((d,i)=>{const hot=emphasis(i),yy=y(d.value*reveal);out+=`<rect x="${left+i*cell+HAIR/2}" y="${yy}" width="${cell-HAIR}" height="${bottom-yy}" fill="${C.neutral}"/><rect x="${left+i*cell+HAIR/2}" y="${yy}" width="${cell-HAIR}" height="${bottom-yy}" fill="${C.accent}" opacity="${hot}"/>`});
        out+=t(left,bottom+45,v[0].from,TYPE.foot,C.muted)+t(right,bottom+45,v[n-1].to,TYPE.foot,C.muted,'end');
        out+=t((left+right)/2,bottom+84,data.binUnit||'',TYPE.foot,C.muted,'middle');
      }
    }else if(data.chart==='stacked-bar'){
      if(data.reveal){
        // Source values stay exact. Only the geometry and its associated label reveal.
        const R=data.reveal,at=window=>group>1?1:geometryEase(clamp((elapsedMs-window.startMs)/(window.endMs-window.startMs)));
        const totalProgress=at(R.total),barY=glass?150:105,barH=glass?(wide?180:132):(wide?150:100);
        const radius=glass?Math.min(38,barH/3):0;
        if(glass){
          out+=`<defs>
            <linearGradient id="glass-rail" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#FFFFFF" stop-opacity=".42"/><stop offset=".48" stop-color="#CFDBEB" stop-opacity=".40"/><stop offset="1" stop-color="#AABFD9" stop-opacity=".60"/></linearGradient>
            <linearGradient id="glass-spent" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#5C94DB" stop-opacity=".62"/><stop offset=".55" stop-color="${C.accent}" stop-opacity=".58"/><stop offset="1" stop-color="#4D7FBF" stop-opacity=".66"/></linearGradient>
            <linearGradient id="glass-balance" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#EAF3FF" stop-opacity=".40"/><stop offset=".5" stop-color="#B5CEEF" stop-opacity=".32"/><stop offset="1" stop-color="#A1BEDF" stop-opacity=".47"/></linearGradient>
            <linearGradient id="glass-specular" x1="0" y1="0" x2="1" y2=".3"><stop stop-color="#FFFFFF" stop-opacity=".95"/><stop offset=".35" stop-color="#FFFFFF" stop-opacity=".40"/><stop offset=".7" stop-color="#FFFFFF" stop-opacity=".08"/><stop offset="1" stop-color="#FFFFFF" stop-opacity=".62"/></linearGradient>
            <linearGradient id="glass-meniscus"><stop stop-color="#FFFFFF" stop-opacity="0"/><stop offset=".65" stop-color="#FFFFFF" stop-opacity=".12"/><stop offset="1" stop-color="#FFFFFF" stop-opacity=".82"/></linearGradient>
            <filter id="glass-depth" x="-10%" y="-40%" width="120%" height="200%"><feDropShadow dx="0" dy="9" stdDeviation="14" flood-color="#526A94" flood-opacity=".11"/><feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#FFFFFF" flood-opacity=".8"/></filter>
            <clipPath id="glass-profile"><rect x="0" y="${barY}" width="${width*totalProgress}" height="${barH}" rx="${radius}"/></clipPath>
          </defs>`;
        }
        out+=t(0,glass?54:55,glass?(R.totalLabel||'Total'):(R.totalLabel||'Total')+' '+num(data.total)+' '+data.unit,glass?(wide?34:40):(wide?48:TYPE.value),C.muted,'start',550);
        if(glass)out+=t(width,70,num(data.total)+' '+data.unit,glass?(wide?72:64):(wide?48:TYPE.value),C.ink,glass?'end':'start',750);
        if(glass){
          // The quiet ruler belongs to the quantity, and remains visible through the tint.
          out+=`<g clip-path="url(#glass-profile)" opacity=".34">`;
          for(let tick=1;tick<20;tick++){
            const x=width*tick/20;
            out+=line(x,barY+barH*.36,x,barY+barH*.64,'#859BB7',tick%5===0?2:1);
          }
          out+='</g><g filter="url(#glass-depth)">';
        }
        out+=`<rect data-mark="total" x="0" y="${barY}" width="${width*totalProgress}" height="${barH}" rx="${radius}" fill="${glass?'url(#glass-rail)':C.line}"/>`;
        if(glass)out+='</g><g clip-path="url(#glass-profile)">';
        let offset=0,labelOut='';
        v.forEach((d,i)=>{
          const window=R.parts.find(part=>part.label===d.label),q=at(window),partW=width*d.value/data.total;
          const fill=glass?`url(#${i===0?'glass-spent':'glass-balance'})`:(i===0?C.accent:C.neutral),cx=offset+partW/2;
          out+=`<rect data-mark="part" data-label="${esc(d.label)}" x="${offset}" y="${barY}" width="${partW*q}" height="${barH}" fill="${fill}"/>`;
          // Later narration groups transfer emphasis without changing measured widths.
          if(!first){
            const hot=emphasis(i);
            out+=`<rect data-mark="focus" data-label="${esc(d.label)}" x="${offset}" y="${barY}" width="${partW}" height="${barH}" fill="${C.accent}" opacity="${hot*.18}"/>`;
          }
          if(glass&&q>0&&q<1){
            // Optical response travels only with the actual quantity boundary and
            // settles away with the reveal. It never moves the measured rectangle.
            const edge=offset+partW*q,lensW=Math.min(32,partW*q);
            const response=clamp(q*8)*clamp((1-q)*12);
            out+=`<g opacity="${response}"><rect x="${edge-lensW}" y="${barY+5}" width="${lensW}" height="${barH-10}" fill="url(#glass-meniscus)"/>`;
            for(let tick=1;tick<20;tick++){
              const x=width*tick/20,distance=edge-x;
              if(x>=offset&&distance>3&&distance<44){
                const bend=Math.sin(distance/44*Math.PI)*5;
                out+=`<path d="M ${x} ${barY+barH*.36} Q ${x+bend} ${barY+barH*.5} ${x} ${barY+barH*.64} L ${x+1.5} ${barY+barH*.64} Q ${x+bend+1.5} ${barY+barH*.5} ${x+1.5} ${barY+barH*.36} Z" fill="#526E94" opacity=".22"/>`;
              }
            }
            out+='</g>';
          }
          if(q>0){
            const labelOpacity=ease(clamp((q-.90)/.10)),settle=glass?8*(1-labelOpacity):0;
            labelOut+=`<g opacity="${labelOpacity}" transform="translate(0 ${settle})">`+line(cx,barY+barH+20,cx,barY+barH+48,glass?'#879BB9':C.muted,glass?2:RULE,'',glass?'hair':'rule');
            labelOut+=t(cx,barY+barH+96,d.label,glass?(wide?36:40):(wide?36:TYPE.label),C.muted,'middle',550);
            labelOut+=t(cx,barY+barH+170,num(d.value)+' '+data.unit,glass?(wide?72:60):(wide?56:TYPE.value),C.ink,'middle',750)+'</g>';
          }
          offset+=partW;
        });
        if(glass){
          // A narrow asymmetric rim replaces the broad glossy-tube highlight.
          out+=`<rect x="3" y="${barY+3}" width="${Math.max(0,width*totalProgress-6)}" height="${barH-6}" rx="${radius-3}" fill="none" stroke="url(#glass-specular)" stroke-width="3"/>`;
          out+=`<path d="M ${radius} ${barY+7} H ${Math.max(radius,width*totalProgress-radius)}" fill="none" stroke="#FFFFFF" stroke-width="1" opacity=".5"/>`;
          let divider=0;
          v.slice(0,-1).forEach((d,i)=>{divider+=width*d.value/data.total;const q=at(R.parts.find(part=>part.label===d.label));out+=line(divider,barY+2,divider,barY+barH-2,'#FFFFFF',2,`opacity="${q*.8}"`)});
          out+=`<rect x="1" y="${barY+1}" width="${Math.max(0,width*totalProgress-2)}" height="${barH-2}" rx="${radius}" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-opacity=".35"/></g>`;
        }
        out+=labelOut;
      }else{
      const barY=90,barH=74;let x=0;
      v.forEach((d,i)=>{const w=d.value/data.total*width*reveal,hot=emphasis(i);out+=`<rect x="${x}" y="${barY}" width="${w}" height="${barH}" fill="${mix(C.neutral,C.accent,.12+.88*i/Math.max(1,n-1))}" stroke="${C.paper}" stroke-width="${HAIR}"/><rect x="${x}" y="${barY}" width="${w}" height="${barH}" fill="${C.accent}" opacity="${hot}" stroke="${C.paper}" stroke-width="${HAIR}"/>`;x+=w});
      out+=t(0,43,'0%',TYPE.foot,C.muted)+t(width,43,'100%',TYPE.foot,C.muted,'end');
      v.forEach((d,i)=>{const yy=245+i*(height-265)/n,hot=emphasis(i);out+=`<circle cx="8" cy="${yy-10}" r="6" fill="${C.accent}" opacity="${.3+.7*hot}"/>`+label(30,yy,d.label)+t(width,yy,num(d.value)+'  /  '+num(d.value/data.total*100)+'%',TYPE.value,C.ink,'end',700)});
      }
    }else if(data.chart==='donut'||data.chart==='pie'){
      const radius=Math.min(width*.235,height*.32),cx=radius+8,cy=height/2-15,inner=data.chart==='donut'?radius*.66:0;
      const keyX=width*.55,keyW=width-keyX,wrap=Math.max(1,Math.floor((keyW-23)/TYPE.label));
      const rows=v.map(d=>wrapLabel(d.label,wrap).length*TYPE.label*1.15+50);
      let start=-Math.PI/2,cursor=(height-rows.reduce((a,b)=>a+b,0))/2+28;
      v.forEach((d,i)=>{
        const share=d.value/data.total,sweep=share*Math.PI*2,hot=emphasis(i),fill=mix(C.neutral,C.accent,.12+.88*i/Math.max(1,n-1));
        out+=`<path data-mark="slice" data-share="${share}" d="${sectorPath(cx,cy,radius,inner,start,sweep*reveal)}" fill="${fill}" stroke="${C.paper}" stroke-width="${HAIR}"/>`;
        // The focus ring does not change the angle or explode a slice.
        out+=`<path d="${sectorPath(cx,cy,radius+6,radius+3,start,sweep*reveal)}" fill="${C.ink}" opacity="${hot}"/>`;
        const yy=cursor;cursor+=rows[i];
        out+=`<rect x="${keyX}" y="${yy-22}" width="8" height="48" rx="4" fill="${fill}"/>`;
        out+=label(keyX+23,yy,d.label,'start',TYPE.label,wrap);
        const valueY=yy+(wrapLabel(d.label,wrap).length-1)*TYPE.label*1.15+TYPE.label*1.15;
        out+=t(keyX+23,valueY,percent(share*100)+'%',TYPE.value,C.ink,'start',700)+(data.unit==='%'?'':t(keyX+keyW,valueY,num(d.value),TYPE.foot,C.muted,'end'));
        start+=sweep;
      });
      if(inner){
        const hotValue=indices=>indices.reduce((sum,d)=>sum+(d?d.value:0),0)/data.total*100;
        const current=hotValue(v.filter(d=>beat.focus.includes(d.label))),previous=first?current:hotValue(v.filter(d=>prev.focus.includes(d.label)));
        // Crossfade exact observations, never invent intermediate data between spoken groups.
        const centerSize=Math.max(TYPE.value,Math.min(52,inner*1.8/(Math.max(percent(previous).length,percent(current).length)+1)/.65));
        out+=t(cx,cy+12,percent(previous)+'%',centerSize,C.ink,'middle',750,first?p:1-p);
        if(!first)out+=t(cx,cy+12,percent(current)+'%',centerSize,C.ink,'middle',750,p);
      }
    }else if(data.chart==='map'){
      const missing=data.locale==='en'?'No data':'자료 없음',areaKey=data.locale==='en'?'Area ∝ value':'원의 넓이 ∝ 값';
      const m=data.map,mapH=height-215,geo=mapGeometry(m.geojson,width,mapH,32),max=Math.max(...v.map(d=>d.value||0))||1;
      const byRegion=new Map(v.map((d,i)=>[d.regionId,{...d,index:i}]));
      const shade=value=>mix(C.line,C.accent,value/max);
      out+=`<defs><pattern id="map-missing" width="9" height="9" patternUnits="userSpaceOnUse"><rect width="9" height="9" fill="${C.paper}"/><path d="M0,9 L9,0" stroke="${C.line}" stroke-width="2"/></pattern></defs>`;
      for(const region of geo.paths){
        const d=byRegion.get(region.id),measured=Number.isFinite(d?.value),hot=d?emphasis(d.index):0;
        const fill=m.mode==='choropleth'?(measured?shade(d.value):'url(#map-missing)'):C.line;
        out+=`<path data-region="${esc(region.id)}" d="${region.path}" fill="${fill}" fill-rule="evenodd" stroke="${C.paper}" stroke-width="${HAIR}" opacity="${first?.25+.75*p:1}"/>`;
        if(m.mode==='choropleth'&&d)out+=`<path data-stroke-role="hair" d="${region.path}" fill="none" fill-rule="evenodd" stroke="${C.ink}" stroke-width="${HAIR}" opacity="${hot}"/>`;
      }
      if(m.mode==='symbol'){
        // Large circles first, so smaller co-located observations remain visible. Area encodes value.
        v.map((d,i)=>({...d,index:i})).sort((a,b)=>(b.value||0)-(a.value||0)).forEach(d=>{
          const [x,y]=geo.locate([d.longitude,d.latitude]),hot=emphasis(d.index),radius=24*Math.sqrt((d.value||0)/max)*reveal;
          if(d.value===null||d.value===0)out+=`<circle data-focus="${esc(d.label)}" cx="${x}" cy="${y}" r="10" fill="none" stroke="${C.accent}" stroke-width="3" opacity="${hot}"/>`;
          if(d.value===null)out+=line(x-4,y-4,x+4,y+4,C.muted,2,'','marker')+line(x-4,y+4,x+4,y-4,C.muted,2,'','marker');
          else if(d.value===0)out+=line(x-4,y,x+4,y,C.ink,2,'','marker')+line(x,y-4,x,y+4,C.ink,2,'','marker');
          else out+=`<circle data-stroke-role="marker" data-mark="symbol" data-value="${d.value}" cx="${x}" cy="${y}" r="${radius}" fill="${C.accent}" fill-opacity="${.5+.25*hot}" stroke="${C.ink}" stroke-width="${1+hot*2}"/>`;
        });
      }
      const ly=mapH+24;
      if(m.mode==='choropleth'){
        for(let i=0;i<64;i++)out+=`<rect x="${i*3}" y="${ly}" width="3.1" height="10" fill="${shade(max*i/63)}"/>`;
        out+=t(0,ly+40,'0',TYPE.foot,C.muted)+t(192,ly+40,axisNum(max),TYPE.foot,C.muted,'end');
        out+=`<rect x="${width-180}" y="${ly-2}" width="22" height="16" fill="url(#map-missing)"/>`+t(width,ly+14,missing,TYPE.foot,C.muted,'end');
      }else{
        out+=`<circle cx="12" cy="${ly+4}" r="6" fill="${C.accent}"/><circle cx="180" cy="${ly+4}" r="12" fill="${C.accent}"/>`;
        out+=t(30,ly+13,axisNum(max/16),TYPE.foot,C.muted)+t(202,ly+13,axisNum(max/4),TYPE.foot,C.muted);
        out+=t(width,ly+14,areaKey,TYPE.foot,C.muted,'end');
      }
      // Focused regions use an ink outline; fixed-size reading rows keep labels off the geography.
      const focused=v.filter(d=>beat.focus.includes(d.label)),previous=v.filter(d=>prev.focus.includes(d.label));
      const readout=(items)=>items.map((d,i)=>{
        const cell=width/items.length,x=i*cell;
        return label(x,ly+91,d.label,'start',TYPE.label,Math.floor(cell/TYPE.label))+t(x,ly+132+(Array.from(d.label).length>12?34:0),d.value===null?missing:num(d.value)+' '+data.unit,TYPE.value,C.ink,'start',700);
      }).join('');
      out+=`<g opacity="${first?p:1-p}">${readout(first?focused:previous)}</g>`;
      if(!first)out+=`<g opacity="${p}">${readout(focused)}</g>`;
    }else if(data.chart==='timeline'){
      const dates=v.map(d=>Date.parse(d.date)),range=dates[n-1]-dates[0],top=48,bottom=height-100;
      out+=line(22,top,22,bottom,C.line,RULE,'','rule');
      v.forEach((d,i)=>{const yy=top+(dates[i]-dates[0])/range*(bottom-top),hot=emphasis(i);out+=`<circle cx="22" cy="${yy}" r="${6+hot*4}" fill="${C.accent}" opacity="${first?p:1}"/>`+t(58,yy-9,d.date,TYPE.foot,C.muted)+label(58,yy+34,d.label,'start',TYPE.label,Math.floor((width-58)/TYPE.label))});
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(beat.insight)}" style="font-family:inherit;font-variant-numeric:tabular-nums">${out}</svg>`;
  }
  const api={render,wrapLabel,colors,esc,ease,sectorPath,mapGeometry,project};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.CHART_RUNTIME=api;
})(typeof window==='object'?window:globalThis);
