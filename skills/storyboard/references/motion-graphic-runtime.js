/* Deterministic SVG scenes. Geometry and labels share data; seek never reads the wall clock. */
(function(root){
'use strict';
const clamp=x=>Math.max(0,Math.min(1,x)), ease=x=>{x=clamp(x);return x*x*(3-2*x);};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function render(scene,p,{portrait=false,onFont,boardTheme}={}){
 const m=scene.shot.motionGraphic,c=m.content,resolved=root.MOTION_GRAPHICS.resolveTheme(m,boardTheme),theme=resolved&&root.MOTION_GRAPHICS.THEMES[resolved.id],C=theme?.colors||root.MOTION_GRAPHICS.PALETTES[m.style.palette];
 if(theme)p=clamp(p/theme.motion.end);
 const W=portrait?900:1600,H=portrait?1600:900,pad=portrait?64:(theme?.layout.pad||88),wide=W-2*pad;
 const x=pad;let y=portrait?380:(theme?.layout.bodyY||290);const h=portrait?850:400;
 const at=(start,end)=>{const t=clamp((p-start)/(end-start));return theme?.motion.curve==='decelerate'?1-Math.pow(1-t,3):ease(t);};
 let out='';
 const fonts=root.MOTION_FONTS;
 const measureContext=theme&&root.document?.createElement('canvas').getContext('2d');
 const fontFace=(value,role,weight)=>theme?fonts.face(value,role,theme,weight):null;
 const measure=(value,size,weight=450,role='body',fixed=null)=>{
   if(theme&&portrait&&role==='body')size=Math.max(30,size);
   if(measureContext){const f=fixed||fontFace(value,role,weight);measureContext.font=`${f.weight} ${size}px ${f.family}`;return measureContext.measureText(String(value).normalize('NFC')).width;}
   return Array.from(String(value)).reduce((n,ch)=>n+(/[\x00-\x7f]/.test(ch)?.56:1),0)*size;
 };
 const text=(xx,yy,s,size=32,color=C.ink,weight=450,anchor='start',opacity=1,role='body',fixed=null)=>{
   if(theme&&portrait&&role==='body')size=Math.max(30,size);
   const numeric=role==='body'&&/^[+−-]?\d/.test(String(s));
   const f=fixed||fontFace(s,numeric?'number':role,weight);
   if(f&&onFont)onFont({text:String(s),role:numeric?'number':role,...f});
   const available=anchor==='end'?xx-pad:anchor==='middle'?2*Math.min(xx-pad,W-pad-xx):W-pad-xx;
   if(theme&&available>0){const measured=measure(s,size,weight,role,f);if(measured>available)size=Math.max(24,size*available/measured);}
   return `<text x="${xx}" y="${yy}" font-size="${size}" ${theme?'xml:space="preserve"':''} font-weight="${f?.weight||weight}" ${f?`font-family="${f.family}" data-font="${f.id}" data-font-fallback="${f.fallback}"`:''} fill="${color}" text-anchor="${anchor}" opacity="${opacity}" data-readable="true">${esc(theme?String(s??'').normalize('NFC'):String(s??''))}</text>`;
 };
 const line=(a,b,d,e,color=C.soft,width=2)=>`<path d="M${a} ${b}L${d} ${e}" fill="none" stroke="${color}" stroke-width="${width}"/>`;
 const rect=(a,b,w,hh,fill=C.soft,r=theme?.layout.radius??12)=>`<rect x="${a}" y="${b}" width="${Math.max(0,w)}" height="${Math.max(0,hh)}" rx="${r}" fill="${fill}"/>`;
 const circle=(a,b,r,fill=C.accent)=>`<circle cx="${a}" cy="${b}" r="${r}" fill="${fill}"/>`;
 const rowsFor=(s,size,max,weight=450,role='body',fixed=null)=>{
   const width=v=>measure(v,size,weight,role,fixed);
   const rows=[];
   for(const paragraph of String(s).split('\n')){
    const words=paragraph.split(' ');let row='';
    const count=Math.max(1,Math.ceil(width(paragraph)/max)),target=Math.min(max,width(paragraph)/count+size);
    for(const word of words){
      if(row&&width(row+' '+word)>target){rows.push(row);row='';}
      if(theme&&width(word)>max){for(const ch of word){if(row&&width(row+ch)>max){rows.push(row);row='';}row+=ch;}}
      else row+=(row?' ':'')+word;
    }
    if(row)rows.push(row);
   }return rows;
 };
 const wrap=(xx,yy,s,size,max,fill=C.ink,weight=450,role='body')=>{const f=fontFace(s,role,weight);return rowsFor(s,size,max,weight,role,f).map((v,i)=>text(xx,yy+i*size*(theme?1.35:1.45),v,size,fill,weight,'start',1,role,f)).join('');};
 const expressive=theme&&m.type==='kinetic_type'&&['campaign','story','playful'].includes(resolved.id);
 const titleSize=expressive?(resolved.id==='playful'?44:38):portrait?(theme&&m.type==='input_output'?48:resolved?.id==='playful'?96:Math.min(theme?.type.title||54,64)):(theme?.type.title||58),titleY=portrait?150:(theme?.layout.titleY||130),titleRows=rowsFor(c.title,titleSize,wide,theme?.type.weight||620,'title',fontFace(c.title,'title',theme?.type.weight||620));
 const header=wrap(pad,titleY,c.title,titleSize,wide,C.ink,theme?.type.weight||620,expressive&&resolved.id==='campaign'?'body':'title'),subY=titleY+(titleRows.length-1)*titleSize*1.45+70;
 y=Math.max(y,subY+95);
 const footer=c.source||(m.evidence==='reenactment'?'설명용 재현 · 실제 기록 아님':m.evidence==='metaphor'&&(!theme||m.type!=='kinetic_type')?'개념을 설명하는 시각적 비유':'');
 out+=rect(0,0,W,H,C.paper,0)+`<g letter-spacing="${expressive?0:theme?.type.tracking||0}">${header}</g>`;
 if(c.subtitle)out+=wrap(pad,subY,c.subtitle,28,wide,C.muted);
 if(theme&&m.type==='comparison'&&c.values.length<=3){
   const max=Math.max(...c.values.map(v=>v.value)),base=portrait?H-370:H-195,plotTop=y+105,plotH=base-plotTop;
   const cell=wide/c.values.length,barW=Math.min(cell*.5,portrait?150:220);
   c.values.forEach((v,i)=>{
     const q=at(.08,.58),cx=x+cell*(i+.5),height=plotH*v.value/max*q;
     out+=line(cx-barW/2,base,cx+barW/2,base,C.soft,3);
     out+=rect(cx-barW/2,base-height,barW,height,i===c.values.length-1?C.accent:C.muted,theme.layout.radius);
     const displayed=q===1?v.value:Number((v.value*q).toFixed(Number.isInteger(v.value)?0:3));
     out+=text(cx,base-height-27,displayed,portrait?64:80,C.ink,600,'middle',1,'number')+text(cx+barW/2+10,base-height-27,c.unit,30,C.muted,450);
     const labelSize=portrait?32:30,labelFont=fontFace(v.label,'body',500),labelRows=rowsFor(v.label,labelSize,cell*.88,500,'body',labelFont);
     if(measureContext&&labelRows.length>2)throw Error('Comparison label needs more than two lines; shorten the label or author a wider composition: '+v.label);
     labelRows.forEach((label,j)=>out+=text(cx,base+48+j*labelSize*1.35,label,labelSize,C.ink,500,'middle',1,'body',labelFont));
   });

   if(c.values.length===2){
     const delta=Number((c.values[1].value-c.values[0].value).toPrecision(6)),q=at(.60,.78),middle=x+wide/2;
     const a=base-plotH*c.values[0].value/max,b=base-plotH*c.values[1].value/max,mid=(a+b)/2;
     out+=`<g opacity="${q}">`+line(x+cell*.5+barW/2+12,a,x+cell*1.5-barW/2-12,b,C.muted,2);
     out+=text(middle,portrait?base+190:mid-26,`${delta>=0?'+':''}${delta} ${c.unit}`,portrait?44:30,C.accent,550,'middle')+'</g>';
   }
 }else if(m.type==='comparison'){
   const max=Math.max(...c.values.map(v=>v.value)),row=h/c.values.length;
   c.values.forEach((v,i)=>{const q=at(.08+i*.07,.48+i*.06),yy=y+i*row,bar=wide*(portrait?.62:.72)*v.value/max;
     if(c.values.length>3){const start=x+(portrait?230:310),space=wide-(portrait?230:310)-(portrait?200:240);out+=text(x,yy+38,v.label,28,C.muted)+rect(start,yy+10,space,34,C.soft,4)+rect(start,yy+10,space*v.value/max*q,34,i===c.values.length-1?C.accent:C.muted,4)+text(W-pad,yy+38,`${v.value} ${c.unit}`,34,C.ink,550,'end',q);return;}
     out+=text(x,yy+25,v.label,30,C.muted)+rect(x,yy+49,wide*(portrait?.62:.72),portrait?46:36,C.soft,4)+rect(x,yy+49,bar*q,portrait?46:36,i===c.values.length-1?C.accent:C.muted,4);
     out+=text(W-pad,yy+80,`${v.value} ${c.unit}`,portrait?43:49,C.ink,550,'end',q);
   });

   if(c.values.length===2){const q=at(.64,.8),delta=c.values[1].value-c.values[0].value;out+=text(x,y+h+70,`${delta>=0?'+':''}${Number(delta.toPrecision(6))} ${c.unit}`,portrait?46:42,C.accent,550,'start',q);}
 }else if(m.type==='part_whole'){
   const q=at(.06,.35),totalY=y+(portrait&&theme?150:30),barY=totalY+90,barH=portrait?230:130;
   out+=text(x,totalY,'전체',30,C.muted)+text(W-pad,totalY,`${c.total} ${c.unit}`,72,C.ink,500,'end');
   out+=rect(x,barY,wide,barH,C.soft,0);
   let offset=x;
   c.values.forEach((v,i)=>{const width=wide*v.value/c.total,part=theme?at(.08+i*.1,.22+i*.1):at(.28+i*.09,.52+i*.08),col=i===0?C.accent:C.muted;
    out+=rect(offset,barY,Math.max(0,Math.min(width,wide*q-(offset-x))),barH,i===0?col:C.muted,0);
    if(i>0)out+=line(offset,barY,offset,barY+barH,C.paper,4);
    if(theme){
      const cell=wide/c.values.length,sourceX=offset+width/2,cx=width>wide*.22?sourceX:x+cell*(i+.5),ly=barY+barH+100;
      out+=`<g opacity="${part}">`+line(sourceX,barY+barH+12,cx,ly-36,C.muted,2);
      const f=fontFace(v.label,'body',500),rows=rowsFor(v.label,28,cell*.9,500,'body',f);
      rows.forEach((label,j)=>out+=text(cx,ly+j*38,label,28,C.ink,500,'middle',1,'body',f));
      out+=text(cx,ly+Math.max(1,rows.length)*38+40,`${v.value} ${c.unit}`,portrait?48:56,C.accent,600,'middle',1,'number')+'</g>';
      offset+=width;return;
    }
    const ly=portrait?barY+barH+120+i*160:barY+barH+85;
    const lx=portrait?x:offset+width/2;
    out+=rect(lx,ly-22,18,18,i===0?C.accent:C.muted,3);
    out+=text(lx+30,ly,v.label,28,C.muted,450,portrait?'start':'middle',part);
    out+=text(portrait?W-pad:lx,portrait?ly:ly+70,`${v.value} ${c.unit}`,portrait?48:58,C.ink,550,portrait?'end':'middle',part);
    offset+=width;
   });
 }else if(m.type==='trend'){
   const vals=c.values,max=Math.max(...vals.map(v=>v.value)),base=y+h,left=x+76,plotW=wide-76-(theme?24:0),step=plotW/(vals.length-1);
   [0,.5,1].forEach(f=>{out+=line(left,y+h*(1-f),W-pad,y+h*(1-f));out+=text(left-22,y+h*(1-f)+8,Number((max*f).toPrecision(3)),theme?30:24,C.muted,450,'end');});
   const pts=vals.map((v,i)=>[left+step*i,base-h*v.value/max]),q=at(theme?.id==='report'?.07:.1,theme?.id==='report'?.60:.75)*(vals.length-1);
   let path=`M${pts[0][0]} ${pts[0][1]}`;
   for(let i=1;i<pts.length;i++){const a=clamp(q-i+1);if(a>0)path+=`L${pts[i-1][0]+(pts[i][0]-pts[i-1][0])*a} ${pts[i-1][1]+(pts[i][1]-pts[i-1][1])*a}`;}
   out+=`<path d="${path}" fill="none" stroke="${C.accent}" stroke-width="6" stroke-linejoin="round"/>`;
   pts.forEach(([xx,yy],i)=>{out+=text(xx,base+48,vals[i].label,theme?30:24,C.muted,450,i===0?'start':i===pts.length-1?'end':'middle');if(q>=i)out+=circle(xx,yy,7)+text(xx,yy-27,vals[i].value,32,C.ink,550,i===0?'start':i===pts.length-1?'end':'middle');});
   out+=text(left-22,y-42,c.unit,24,C.muted,450,'end');
 }else if(['process','timeline'].includes(m.type)){
   const n=c.items.length,centered=theme&&m.type==='timeline'&&!portrait,step=portrait?(theme&&m.type==='process'?Math.max(h/n,260):h/n):centered?wide/n:(wide-200)/(n-1);
   c.items.forEach((v,i)=>{const q=centered?at(i*.18,.16+i*.18):theme&&m.type==='process'?at(.04+i*.20,.22+i*.20):at(.08+i*.22,.28+i*.22),xx=portrait?x+26:centered?x+step*(i+.5):x+step*i+25,yy=portrait?y+step*i:y+90;
    if(i<n-1){const progress=centered?at(.10+i*.18,.18+i*.18):at(.18+i*.22,.45+i*.22);out+=line(xx,yy,portrait?xx:xx+step,portrait?yy+step:yy,C.soft,4)+line(xx,yy,portrait?xx:xx+step*progress,portrait?yy+step*progress:yy,C.accent,4);}
    out+=`<g opacity="${q}" transform="translate(0 ${24*(1-q)})">`;
    if(portrait&&m.type==='process'&&i<n-1){const handoff=theme?at(.18+i*.2,.32+i*.2):at(.24+i*.22,.46+i*.22);if(handoff>0&&handoff<1){const py=yy+step*handoff;out+=rect(xx-15,py-21,30,42,C.paper,3)+line(xx-9,py-9,xx+9,py-9,C.accent,3)+line(xx-9,py,xx+9,py,C.accent,3)+line(xx-9,py+9,xx+4,py+9,C.accent,3);}}
    out+=circle(xx,yy,centered?23+8*Math.sin(Math.PI*q):23,C.soft)+circle(xx,yy,23*q,C.accent)+text(xx,yy+8,i+1,23,C.paper,550,'middle',q);
    const tx=portrait?xx+65:xx-22,ty=portrait?yy-12:yy+95;
    if(centered){
      const labelFont=fontFace(v.label,'body',550),rows=rowsFor(v.label,34,step-30,550,'body',labelFont);
      rows.forEach((label,j)=>out+=text(xx,ty+j*45,label,34,C.ink,550,'middle',1,'body',labelFont));
      if(v.date||v.detail)out+=text(xx,ty+rows.length*45+20,v.date||v.detail,32,C.muted,450,'middle');
    }else{
      out+=wrap(tx,ty,v.label,portrait?38:34,portrait?wide-95:step-30,C.ink,550);
      if(v.date||v.detail)out+=wrap(tx,ty+65,v.date||v.detail,27,portrait?wide-100:step-35,C.muted);
    }
    if(portrait&&v.artifact){
      const aw=wide-120;
      if(theme&&v.artifactKind==='frames'&&v.artifactItems?.length){
        const cell=(aw-16*(v.artifactItems.length-1))/v.artifactItems.length;
        v.artifactItems.forEach((label,j)=>{const left=tx+j*(cell+16),cx=left+cell/2,kind=v.artifactVisuals?.[j];out+=rect(left,ty+110,cell,104,C.paper,3)+line(left,ty+110,left+cell,ty+110,C.soft,2);
          if(kind==='bars'){out+=line(cx-36,ty+165,cx+36,ty+165,C.muted,2)+rect(cx-30,ty+143,22,22,C.muted,1)+rect(cx+8,ty+125,22,40,C.accent,1);}
          else if(kind==='flow'){out+=line(cx-40,ty+145,cx+40,ty+145,C.accent,3)+circle(cx-40,ty+145,8,C.accent)+circle(cx,ty+145,8,C.accent)+circle(cx+40,ty+145,8,C.accent);}
          else if(kind==='check'){out+=`<path d="M${cx-20} ${ty+144}l14 15 30-32" fill="none" stroke="${C.accent}" stroke-width="5"/>`;}
          else out+=text(left+14,ty+150,String(j+1).padStart(2,'0'),20,C.muted,500);
          out+=text(left+14,ty+200,label,25,C.ink,500);
        });
      }else if(theme&&v.artifactKind==='checklist'&&v.artifactItems?.length){
        out+=rect(tx,ty+110,aw,104,C.soft,8);
        const cell=aw/v.artifactItems.length;
        v.artifactItems.forEach((label,j)=>{const left=tx+20+j*cell;out+=`<path d="M${left} ${ty+160}l7 8 14-18" stroke="${C.accent}" stroke-width="4" fill="none"/>`+text(left+30,ty+168,label,25,C.ink,500);});
      }else out+=rect(tx,ty+110,aw,104,C.soft,8)+line(tx+24,ty+140,tx+wide-180,ty+140,theme?C.muted:C.accent,theme?1:3)+text(tx+24,ty+183,v.artifact,27,C.ink,500);
    }
    out+='</g>';
   });
 }else if(m.type==='relationship'){
   const cx=W/2,cy=y+h/2,rx=wide*.32,ry=h*.36,n=c.items.length;
   const pos=c.items.map((_,i)=>[cx+Math.cos(-Math.PI/2+i*Math.PI*2/n)*rx,cy+Math.sin(-Math.PI/2+i*Math.PI*2/n)*ry]);
   c.edges.forEach(([a,b],i)=>{const q=at(.2+i*.05,.55+i*.05),A=pos[a],B=pos[b];out+=line(A[0],A[1],B[0],B[1],C.soft,3);out+=line(A[0],A[1],A[0]+(B[0]-A[0])*q,A[1]+(B[1]-A[1])*q,C.accent,3);const t=clamp((p-.2-i*.05)/.5);if(t>0&&t<1)out+=circle(A[0]+(B[0]-A[0])*t,A[1]+(B[1]-A[1])*t,8);});
   pos.forEach(([xx,yy],i)=>{out+=rect(xx-110,yy-42,220,84,C.paper,14)+text(xx,yy+10,c.items[i].label,30,C.ink,550,'middle');});
 }else if(['before_after','input_output','ui_demo'].includes(m.type)){
   const vertical=portrait, gap=vertical?80:120,bw=vertical?wide:(wide-gap)/2,bh=vertical?330:300;
   const ax=x,ay=y,bx=vertical?x:x+bw+gap,by=vertical?y+bh+gap:y,q=theme&&c.mappings?at(.01,.08):at(theme&&m.type==='ui_demo'?.4:.3,theme?.65:.62);
   const app=theme&&m.type==='ui_demo',outputPaper=app?C.soft:C.ink,outputInk=app?C.ink:C.paper;
   if(app)out+=rect(x-24,y-24,wide+48,vertical?bh*2+gap+48:bh+48,'#ffffff',theme.layout.radius);

   out+=rect(ax,ay,bw,bh,theme?'#ffffff':C.soft,theme?theme.layout.radius:18);
   if(theme){out+=line(ax+30,ay+78,ax+bw-30,ay+78,C.soft,2);}
   out+=text(ax+30,ay+54,c.inputLabel||'입력',28,C.muted);
   if(!c.mappings)out+=wrap(ax+30,ay+125,c.input,theme?42:portrait?35:33,bw-60,C.ink,500);
   out+=`<g opacity="${q}" transform="translate(0 ${20*(1-q)})">`+rect(bx,by,bw,bh,outputPaper,theme?theme.layout.radius:18)+text(bx+30,by+54,c.outputLabel||'결과',28,outputInk,450,'start',c.mappings?(theme?at(.35,.45):at(.66,.76)):1)+(c.mappings?'':wrap(bx+30,by+125,c.output,theme?42:portrait?35:33,bw-60,outputInk,500))+'</g>';
   if(theme&&c.mappings){
     const copying=c.mappings.some(item=>item.fields?.length),ghost=copying?1-.9*at(.08,.1)*(1-at(.42,.45)):1;
     c.mappings.forEach((item,i)=>out+=text(ax+30,ay+125+i*68,item.from,30,C.muted,450,'start',ghost));
   }
   if(c.mappings)c.mappings.forEach((item,i)=>{
     if(theme&&item.fields?.length){
       const local=clamp((p-.45-i*.44/c.mappings.length)/(.44/c.mappings.length)),phase=(a,b)=>ease((local-a)/(b-a));
       const sx=ax+30,sy=ay+125+i*68,ex=bx+30,ey=by+125+i*68,travel=at(.08,.45),reorder=phase(0,.7),finish=phase(.7,1);
       if(travel>0&&travel<1)out+=rect(sx-10,sy+(ey-sy)*travel-36,bw-60,52,'#ffffff',6);
       item.fields.forEach((value,fieldIndex)=>{
         const font=fontFace(value,'body',500),startOffset=measure(item.from.slice(0,item.from.indexOf(value)),30,500,'body',font),endOffset=measure(item.to.slice(0,item.to.indexOf(value)),30,500,'body',font);
         const xx=sx+(ex-sx)*travel+startOffset+(endOffset-startOffset)*reorder,yy=sy+(ey-sy)*travel+Math.sin(Math.PI*reorder)*(fieldIndex%2?26:-26);
         out+=`<g opacity="${1-finish}">`+rect(xx-8,yy-34,measure(value,30,500,'body',font)+16,48,C.accent,6)+text(xx,yy,value,30,C.paper,500)+'</g>';
       });
       out+=text(ex,ey,item.to,30,outputInk,500,'start',finish);return;
     }
const t=at(.22,.66),sx=ax+30,sy=ay+125+i*68,ex=bx+30,ey=by+125+i*68;out+=text(sx,sy,item.from,30,C.muted,450,'start',theme?1:1-at(.01,.08)+at(.86,1));out+=rect(sx+(ex-sx)*t-10,sy+(ey-sy)*t-36,bw-60,52,t>.8?C.ink:C.accent,6)+text(sx+(ex-sx)*t,sy+(ey-sy)*t,t>.5?item.to:item.from,30,C.paper,500);});
   const mx=vertical?W/2:x+bw+gap/2,my=vertical?ay+bh+gap/2:ay+bh/2;
   if(!(theme&&c.mappings&&p>.08&&p<.92)){out+=line(vertical?mx:mx-24,vertical?my-24:my,vertical?mx:mx+24,vertical?my+24:my,C.accent,4);
   out+=`<path d="${vertical?`M${mx-10} ${my+12}l10 12 10-12`:`M${mx+12} ${my-10}l12 10-12 10`}" fill="none" stroke="${C.accent}" stroke-width="4"/>`;}
   if(m.type==='ui_demo'){
    const buttonY=ay+bh-72;
    out+=rect(ax+30,buttonY,bw-60,49,at(.14,.3)>.5?C.accent:C.muted,8)+text(ax+bw/2,buttonY+33+(p>.27&&p<.32?3:0),theme&&p>.27&&p<.65?(c.processingLabel||'정리 중…'):theme&&p>=.65?(c.doneLabel||'완료'):c.action,theme?30:24,C.paper,550,'middle');
    const cp=at(.08,.3),px=ax+bw-85,py=buttonY+140-110*cp;
    if(p>.27&&p<.36)out+=`<circle cx="${px}" cy="${buttonY+30}" r="${8+100*(p-.27)}" fill="none" stroke="${C.accent}" stroke-width="3"/>`;
    if(p<.5)out+=`<path d="M${px} ${py}l0 33 9-8 9 17 8-4-9-17 12-2z" fill="${C.paper}" stroke="${C.ink}" stroke-width="2"/>`;
   }
 }else if(m.type==='kinetic_type'){
   if(theme){
     const n=c.lines.length,kind=resolved.id;
     const top=portrait?(kind==='story'?640:520):350,bottom=portrait?(kind==='story'?1100:1260):740;
     c.lines.forEach((s,i)=>{
       const step=n===1?0:(bottom-top)/(n-1);let baseline=n===1?(top+bottom)/2:top+step*i;
       const weight=theme.type.weight,f=fontFace(s,'title',weight);
       let size=kind==='playful'?(portrait?156:144):kind==='story'?(portrait?94:100):(portrait?(i===n-1?130:100):112);
       size=Math.min(size,wide*(kind==='playful'?.94:1)/Math.max(1,measure(s,size,weight,'title',f))*size);
       if(kind==='story'||kind==='playful')baseline=H*.55+(i-(n-1)/2)*size*(kind==='playful'?2.1:1.65);
       const start=(kind==='story'?.01:.08)+i*((kind==='story'?.48:.62)/Math.max(1,n)),q=at(start,Math.min(.94,start+(kind==='story'?.18:.24)));
       const centered=kind==='story',xx=centered?W/2:x,anchor=centered?'middle':'start';
       if(kind==='campaign'){
         const focus=portrait?H*.43:H*.59,settle=i===n-1?1:at(start+.19,start+.31);
         const slot=portrait?(i===n-1?1140:440+i*220):baseline;
         const heroSize=Math.min(portrait?136:120,wide/Math.max(1,measure(s,136,weight,'title',f))*136);
         const finalSize=i===n-1?heroSize:Math.min(size,portrait?80:96);
         const liveSize=heroSize+(finalSize-heroSize)*settle;
         out+=`<g opacity="${q}">`+text(xx,focus+(slot-focus)*settle,s,liveSize,i===n-1?C.accent:C.ink,weight,'start',1,'title',f)+'</g>';
       }else if(kind==='playful'){
         const selected=c.emphasis?.[i],index=selected?s.indexOf(selected):-1;
         if(index>=0&&i>0){
           const before=s.slice(0,index),after=s.slice(index+selected.length),offset=measure(before,size,weight,'title',f),chosen=measure(selected,size,weight,'title',f);
           out+=`<g opacity="${q}">`+text(xx,baseline,before,size,C.ink,weight,'start',1,'title',f)+text(xx+offset,baseline,selected,size,C.accent,weight,'start',1,'title',f)+text(xx+offset+chosen,baseline,after,size,C.ink,weight,'start',1,'title',f)+'</g>';
         }else if(index>=0){
           const before=s.slice(0,index),after=s.slice(index+selected.length),offset=measure(before,size,weight,'title',f),chosen=measure(selected,size,weight,'title',f);
           const settle=at(start+.10,start+.24),reveal=at(start+.13,start+.27),initialX=(W-chosen)/2;
           const liveX=initialX+(xx+offset-initialX)*settle,liveY=H*.53+(baseline-H*.53)*settle;
           out+=`<g opacity="${q}" transform="translate(${liveX} ${liveY})">`;
           out+=text(0,0,selected,size*(.65+.35*q),C.accent,weight,'start',1,'title',f)+'</g>';
           out+=`<g opacity="${reveal}">`+text(xx,baseline,before,size,C.ink,weight,'start',1,'title',f)+text(xx+offset+chosen,baseline,after,size,C.ink,weight,'start',1,'title',f)+'</g>';
         }else{
           const shift=(i%2?-1:1)*(1-q)*90,scale=.88+.12*q;
           out+=`<g opacity="${q}" transform="translate(${xx+shift} ${baseline}) scale(${scale})">`;
           out+=text(0,0,s,size,C.ink,weight,'start',1,'title',f)+'</g>';
         }
       }else{
         out+=`<g opacity="${q}" transform="translate(0 ${(1-q)*(kind==='story'?8:22)})">`;
         out+=text(xx,baseline,s,size,kind==='campaign'&&i===n-1?C.accent:C.ink,weight,anchor,1,'title',f)+'</g>';
       }
     });
   }else c.lines.forEach((s,i)=>{const q=at(.07+i*.16,.28+i*.16),yy=y+(portrait?100:20)+i*(portrait?160:120);out+=`<g opacity="${q}" transform="translate(${(1-q)*38} 0)">`+wrap(x,yy,s,portrait?62:86,wide,i===c.lines.length-1?C.accent:C.ink,580,'title')+'</g>';});
 }else if(m.type==='layers'){
   const q=at(.16,.65),n=c.items.length;
   c.items.forEach((v,i)=>{const xx=x+wide*.1+i*25*q,yy=y+80+i*(portrait?150:75)*q,ww=wide*.75;
    out+=`<g transform="translate(${xx} ${yy}) skewY(-8)">`+rect(0,0,ww,portrait?120:100,i===n-1?C.accent:C.soft,12)+line(0,0,ww,0,C.paper,3)+text(30,64,v.label,30,i===n-1?C.paper:C.ink,500)+'</g>';});
 }else if(m.type==='simulation'){
   const simTime=clamp((p-.08)/.65)*6,arrived=Math.floor(simTime*c.arrival),served=Math.floor(simTime*c.service),count=Math.min(c.capacity,Math.max(0,arrived-served));
   const bw=portrait?wide:wide*.52,bx=x,by=y+50,cell=(bw-60)/c.capacity;
   out+=(theme?'':text(bx,by-10,'처리 대기',30,C.muted))+rect(bx,by+24,bw,170,C.soft,16);
   for(let i=0;i<c.capacity;i++)out+=rect(bx+24+i*cell,by+48,cell-8,122,i<count?(theme&&count===c.capacity?'#b54435':C.accent):C.paper,6);
   out+=text(bx,by+270,`${count} / ${c.capacity}`,72,C.ink,550)+text(bx,by+320,'대기량 / 최대 용량',26,C.muted);
   const tx=portrait?x:bx+bw+90,ty=portrait?by+480:by+60;
   out+=text(tx,ty,`유입  ${c.arrival} / 초`,36,C.ink,500)+text(tx,ty+65,`처리  ${c.service} / 초`,36,C.ink,500);
   out+=text(tx,ty+145,count===c.capacity?'한도 도달':'요청 처리 중',36,theme&&count===c.capacity?'#b54435':C.accent,550);
   if(theme&&arrived-served>c.capacity)out+=text(tx,ty+280,`초과·거절 ${arrived-served-c.capacity}`,36,'#b54435',650);
   out+=text(tx,ty+215,`모형 시간 ${simTime.toFixed(1)}초`,27,C.muted);
   const active=p>.08&&p<.73,phase=(simTime*c.arrival)%1;
   if(!theme)out+=text(bx,by+390,`유입 ${arrived} · 처리 ${Math.min(arrived,served)} · 초과 ${Math.max(0,arrived-served-c.capacity)}`,27,C.muted);
   out+=line(bx-48,by+108,bx+24,by+108,C.accent,3)+line(bx+bw-24,by+108,bx+bw+64,by+108,C.muted,3);
   out+=text(bx-8,by-46,'유입 → 대기열 → 처리',26,C.muted);
   if(active){out+=rect(bx-48+phase*72,by+98,18,20,C.accent,3)+rect(bx+bw-24+((simTime*c.service)%1)*88,by+98,18,20,C.muted,3);}
 }
 if(footer)out+=wrap(pad,H-70,footer,portrait?28:24,wide,C.muted);
 return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 ${W} ${H}" style="font-family:MotionInter,MotionKorean,sans-serif;font-variant-numeric:tabular-nums${theme?';font-synthesis:none':''}" data-theme="${resolved?.id||'legacy'}" role="img" aria-label="${esc(c.title)}">${out}</svg>`;
}
const api={render};if(typeof module==='object'&&module.exports)module.exports=api;else root.MOTION_GRAPHIC_RUNTIME=api;
})(typeof window==='object'?window:{MOTION_GRAPHICS:require('./motion-graphics.js'),MOTION_FONTS:require('./motion-fonts.js')});
