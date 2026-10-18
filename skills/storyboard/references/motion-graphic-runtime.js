/* Deterministic SVG scenes. Geometry and labels share data; seek never reads the wall clock. */
(function(root){
'use strict';
const clamp=x=>Math.max(0,Math.min(1,x)), ease=x=>{x=clamp(x);return x*x*(3-2*x);};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function render(scene,p,{portrait=false}={}){
 const m=scene.shot.motionGraphic,c=m.content,C=root.MOTION_GRAPHICS.PALETTES[m.style.palette];
 const W=portrait?900:1600,H=portrait?1600:900,pad=portrait?64:88,wide=W-2*pad;
 const x=pad;let y=portrait?380:290;const h=portrait?850:400;
 const at=(start,end)=>ease((p-start)/(end-start));
 let out='';
 const text=(xx,yy,s,size=32,color=C.ink,weight=450,anchor='start',opacity=1)=>`<text x="${xx}" y="${yy}" font-size="${size}" font-weight="${weight}" fill="${color}" text-anchor="${anchor}" opacity="${opacity}" data-readable="true">${esc(s)}</text>`;
 const line=(a,b,d,e,color=C.soft,width=2)=>`<path d="M${a} ${b}L${d} ${e}" fill="none" stroke="${color}" stroke-width="${width}"/>`;
 const rect=(a,b,w,hh,fill=C.soft,r=12)=>`<rect x="${a}" y="${b}" width="${Math.max(0,w)}" height="${Math.max(0,hh)}" rx="${r}" fill="${fill}"/>`;
 const circle=(a,b,r,fill=C.accent)=>`<circle cx="${a}" cy="${b}" r="${r}" fill="${fill}"/>`;
 const rowsFor=(s,size,max)=>{
   const width=v=>Array.from(v).reduce((n,ch)=>n+(/[\x00-\x7f]/.test(ch)?.56:1),0)*size;
   const rows=[];
   for(const paragraph of String(s).split('\n')){
    const words=paragraph.split(' ');let row='';
    const count=Math.max(1,Math.ceil(width(paragraph)/max)),target=Math.min(max,width(paragraph)/count+size);
    for(const word of words){if(row&&width(row+' '+word)>target){rows.push(row);row='';}row+=(row?' ':'')+word;}
    if(row)rows.push(row);
   }return rows;
 };
 const wrap=(xx,yy,s,size,max,fill=C.ink,weight=450)=>rowsFor(s,size,max).map((v,i)=>text(xx,yy+i*size*1.45,v,size,fill,weight)).join('');
 const titleSize=portrait?54:58,titleY=portrait?150:130,titleRows=rowsFor(c.title,titleSize,wide);
 const header=wrap(pad,titleY,c.title,titleSize,wide,C.ink,620),subY=titleY+(titleRows.length-1)*titleSize*1.45+70;
 y=Math.max(y,subY+95);
 const footer=c.source||(m.evidence==='reenactment'?'설명용 재현 · 실제 기록 아님':m.evidence==='metaphor'?'개념을 설명하는 시각적 비유':'');
 out+=rect(0,0,W,H,C.paper,0)+header;
 if(c.subtitle)out+=wrap(pad,subY,c.subtitle,28,wide,C.muted);
 if(m.type==='comparison'){
   const max=Math.max(...c.values.map(v=>v.value)),row=h/c.values.length;
   c.values.forEach((v,i)=>{const q=at(.08+i*.07,.48+i*.06),yy=y+i*row,bar=wide*(portrait?.62:.72)*v.value/max;
     if(c.values.length>3){const start=x+(portrait?230:310),space=wide-(portrait?230:310)-(portrait?200:240);out+=text(x,yy+38,v.label,28,C.muted)+rect(start,yy+10,space,34,C.soft,4)+rect(start,yy+10,space*v.value/max*q,34,i===c.values.length-1?C.accent:C.muted,4)+text(W-pad,yy+38,`${v.value} ${c.unit}`,34,C.ink,550,'end',q);return;}
     out+=text(x,yy+25,v.label,30,C.muted)+rect(x,yy+49,wide*(portrait?.62:.72),portrait?46:36,C.soft,4)+rect(x,yy+49,bar*q,portrait?46:36,i===c.values.length-1?C.accent:C.muted,4);
     out+=text(W-pad,yy+80,`${v.value} ${c.unit}`,portrait?43:49,C.ink,550,'end',q);
   });

   if(c.values.length===2){const q=at(.64,.8),delta=c.values[1].value-c.values[0].value;out+=text(x,y+h+70,`${delta>=0?'+':''}${Number(delta.toPrecision(6))} ${c.unit}`,portrait?46:42,C.accent,550,'start',q);}
 }else if(m.type==='part_whole'){
   const q=at(.06,.35),totalY=y+(portrait?30:30),barY=totalY+90,barH=portrait?230:130;
   out+=text(x,totalY,'전체',30,C.muted)+text(W-pad,totalY,`${c.total} ${c.unit}`,72,C.ink,500,'end');
   out+=rect(x,barY,wide,barH,C.soft,0);
   let offset=x;
   c.values.forEach((v,i)=>{const width=wide*v.value/c.total,part=at(.28+i*.09,.52+i*.08),col=i===0?C.accent:C.muted;
    out+=rect(offset,barY,Math.max(0,Math.min(width,wide*q-(offset-x))),barH,i===0?col:C.muted,0);
    if(i>0)out+=line(offset,barY,offset,barY+barH,C.paper,4);
    const ly=portrait?barY+barH+120+i*160:barY+barH+85;
    const lx=portrait?x:offset+width/2;
    out+=rect(lx,ly-22,18,18,i===0?C.accent:C.muted,3);
    out+=text(lx+30,ly,v.label,28,C.muted,450,portrait?'start':'middle',part);
    out+=text(portrait?W-pad:lx,portrait?ly:ly+70,`${v.value} ${c.unit}`,portrait?48:58,C.ink,550,portrait?'end':'middle',part);
    offset+=width;
   });
 }else if(m.type==='trend'){
   const vals=c.values,max=Math.max(...vals.map(v=>v.value)),base=y+h,left=x+76,plotW=wide-76,step=plotW/(vals.length-1);
   [0,.5,1].forEach(f=>{out+=line(left,y+h*(1-f),W-pad,y+h*(1-f));out+=text(left-22,y+h*(1-f)+8,Number((max*f).toPrecision(3)),24,C.muted,450,'end');});
   const pts=vals.map((v,i)=>[left+step*i,base-h*v.value/max]),q=at(.1,.75)*(vals.length-1);
   let path=`M${pts[0][0]} ${pts[0][1]}`;
   for(let i=1;i<pts.length;i++){const a=clamp(q-i+1);if(a>0)path+=`L${pts[i-1][0]+(pts[i][0]-pts[i-1][0])*a} ${pts[i-1][1]+(pts[i][1]-pts[i-1][1])*a}`;}
   out+=`<path d="${path}" fill="none" stroke="${C.accent}" stroke-width="6" stroke-linejoin="round"/>`;
   pts.forEach(([xx,yy],i)=>{out+=text(xx,base+48,vals[i].label,24,C.muted,450,i===0?'start':i===pts.length-1?'end':'middle');if(q>=i)out+=circle(xx,yy,7)+text(xx,yy-27,vals[i].value,32,C.ink,550,i===0?'start':i===pts.length-1?'end':'middle');});
   out+=text(left-22,y-42,c.unit,24,C.muted,450,'end');
 }else if(['process','timeline'].includes(m.type)){
   const n=c.items.length,step=portrait?h/n:(wide-200)/(n-1);
   c.items.forEach((v,i)=>{const q=at(.08+i*.22,.28+i*.22),xx=portrait?x+26:x+step*i+25,yy=portrait?y+step*i:y+90;
    if(i<n-1){const progress=at(.18+i*.22,.45+i*.22);out+=line(xx,yy,portrait?xx:xx+step,portrait?yy+step:yy,C.soft,4)+line(xx,yy,portrait?xx:xx+step*progress,portrait?yy+step*progress:yy,C.accent,4);}
    out+=`<g opacity="${q}" transform="translate(0 ${24*(1-q)})">`;
    if(portrait&&m.type==='process'&&i<n-1){const handoff=at(.24+i*.22,.46+i*.22);if(handoff>0&&handoff<1){const py=yy+step*handoff;out+=rect(xx-15,py-21,30,42,C.paper,3)+line(xx-9,py-9,xx+9,py-9,C.accent,3)+line(xx-9,py,xx+9,py,C.accent,3)+line(xx-9,py+9,xx+4,py+9,C.accent,3);}}
    out+=circle(xx,yy,23,C.soft)+circle(xx,yy,23*q,C.accent)+text(xx,yy+8,i+1,23,C.paper,550,'middle',q);
    const tx=portrait?xx+65:xx-22,ty=portrait?yy-12:yy+95;
    out+=wrap(tx,ty,v.label,portrait?38:34,portrait?wide-95:step-30,C.ink,550);
    if(v.date||v.detail)out+=wrap(tx,ty+65,v.date||v.detail,27,portrait?wide-100:step-35,C.muted);
    if(portrait&&v.artifact){out+=rect(tx,ty+110,wide-120,104,C.soft,8)+line(tx+24,ty+140,tx+wide-180,ty+140,C.accent,3)+text(tx+24,ty+183,v.artifact,27,C.ink,500);}
    out+='</g>';
   });
 }else if(m.type==='relationship'){
   const cx=W/2,cy=y+h/2,rx=wide*.32,ry=h*.36,n=c.items.length;
   const pos=c.items.map((_,i)=>[cx+Math.cos(-Math.PI/2+i*Math.PI*2/n)*rx,cy+Math.sin(-Math.PI/2+i*Math.PI*2/n)*ry]);
   c.edges.forEach(([a,b],i)=>{const q=at(.2+i*.05,.55+i*.05),A=pos[a],B=pos[b];out+=line(A[0],A[1],B[0],B[1],C.soft,3);out+=line(A[0],A[1],A[0]+(B[0]-A[0])*q,A[1]+(B[1]-A[1])*q,C.accent,3);const t=clamp((p-.2-i*.05)/.5);if(t>0&&t<1)out+=circle(A[0]+(B[0]-A[0])*t,A[1]+(B[1]-A[1])*t,8);});
   pos.forEach(([xx,yy],i)=>{out+=rect(xx-110,yy-42,220,84,C.paper,14)+text(xx,yy+10,c.items[i].label,30,C.ink,550,'middle');});
 }else if(['before_after','input_output','ui_demo'].includes(m.type)){
   const vertical=portrait, gap=vertical?80:120,bw=vertical?wide:(wide-gap)/2,bh=vertical?330:300;
   const ax=x,ay=y,bx=vertical?x:x+bw+gap,by=vertical?y+bh+gap:y,q=at(.3,.62);
   out+=rect(ax,ay,bw,bh,C.soft,18)+text(ax+30,ay+54,c.inputLabel||'입력',28,C.muted);
   if(!c.mappings)out+=wrap(ax+30,ay+125,c.input,portrait?35:33,bw-60,C.ink,500);
   out+=`<g opacity="${q}" transform="translate(0 ${20*(1-q)})">`+rect(bx,by,bw,bh,C.ink,18)+text(bx+30,by+54,c.outputLabel||'결과',28,C.paper,450,'start',c.mappings?at(.66,.76):1)+(c.mappings?'':wrap(bx+30,by+125,c.output,portrait?35:33,bw-60,C.paper,500))+'</g>';
   if(c.mappings)c.mappings.forEach((item,i)=>{const t=at(.22,.66),sx=ax+30,sy=ay+125+i*68,ex=bx+30,ey=by+125+i*68;out+=text(sx,sy,item.from,30,C.muted,450,'start',1-at(.01,.08)+at(.86,1));out+=rect(sx+(ex-sx)*t-10,sy+(ey-sy)*t-36,bw-60,52,t>.8?C.ink:C.accent,6)+text(sx+(ex-sx)*t,sy+(ey-sy)*t,t>.5?item.to:item.from,30,C.paper,500);});
   const mx=vertical?W/2:x+bw+gap/2,my=vertical?ay+bh+gap/2:ay+bh/2;
   out+=line(vertical?mx:mx-24,vertical?my-24:my,vertical?mx:mx+24,vertical?my+24:my,C.accent,4);
   out+=`<path d="${vertical?`M${mx-10} ${my+12}l10 12 10-12`:`M${mx+12} ${my-10}l12 10-12 10`}" fill="none" stroke="${C.accent}" stroke-width="4"/>`;
   if(m.type==='ui_demo'){
    const buttonY=ay+bh-72;
    out+=rect(ax+30,buttonY,bw-60,49,at(.14,.3)>.5?C.accent:C.muted,8)+text(ax+bw/2,buttonY+33+(p>.27&&p<.32?3:0),c.action,24,C.paper,550,'middle');
    const cp=at(.08,.3),px=ax+bw-85,py=buttonY+140-110*cp;
    if(p>.27&&p<.36)out+=`<circle cx="${px}" cy="${buttonY+30}" r="${8+100*(p-.27)}" fill="none" stroke="${C.accent}" stroke-width="3"/>`;
    if(p<.5)out+=`<path d="M${px} ${py}l0 33 9-8 9 17 8-4-9-17 12-2z" fill="${C.paper}" stroke="${C.ink}" stroke-width="2"/>`;
   }
 }else if(m.type==='kinetic_type'){
   c.lines.forEach((s,i)=>{const q=at(.07+i*.16,.28+i*.16),yy=y+(portrait?100:20)+i*(portrait?160:120);out+=`<g opacity="${q}" transform="translate(${(1-q)*38} 0)">`+wrap(x,yy,s,portrait?62:86,wide,i===c.lines.length-1?C.accent:C.ink,580)+'</g>';});
 }else if(m.type==='layers'){
   const q=at(.16,.65),n=c.items.length;
   c.items.forEach((v,i)=>{const xx=x+wide*.1+i*25*q,yy=y+80+i*(portrait?150:75)*q,ww=wide*.75;
    out+=`<g transform="translate(${xx} ${yy}) skewY(-8)">`+rect(0,0,ww,portrait?120:100,i===n-1?C.accent:C.soft,12)+line(0,0,ww,0,C.paper,3)+text(30,64,v.label,30,i===n-1?C.paper:C.ink,500)+'</g>';});
 }else if(m.type==='simulation'){
   const simTime=clamp((p-.08)/.65)*6,arrived=Math.floor(simTime*c.arrival),served=Math.floor(simTime*c.service),count=Math.min(c.capacity,Math.max(0,arrived-served));
   const bw=portrait?wide:wide*.52,bx=x,by=y+50,cell=(bw-60)/c.capacity;
   out+=text(bx,by-10,'처리 대기',30,C.muted)+rect(bx,by+24,bw,170,C.soft,16);
   for(let i=0;i<c.capacity;i++)out+=rect(bx+24+i*cell,by+48,cell-8,122,i<count?C.accent:C.paper,6);
   out+=text(bx,by+270,`${count} / ${c.capacity}`,72,C.ink,550)+text(bx,by+320,'대기량 / 최대 용량',26,C.muted);
   const tx=portrait?x:bx+bw+90,ty=portrait?by+480:by+60;
   out+=text(tx,ty,`유입  ${c.arrival} / 초`,36,C.ink,500)+text(tx,ty+65,`처리  ${c.service} / 초`,36,C.ink,500);
   out+=text(tx,ty+145,count===c.capacity?'한도 도달':'요청 처리 중',36,C.accent,550);
   out+=text(tx,ty+215,`모형 시간 ${simTime.toFixed(1)}초`,27,C.muted);
   const active=p>.08&&p<.73,phase=(simTime*c.arrival)%1;
   out+=text(bx,by+390,`유입 ${arrived} · 처리 ${Math.min(arrived,served)} · 초과 ${Math.max(0,arrived-served-c.capacity)}`,27,C.muted);
   out+=line(bx-48,by+108,bx+24,by+108,C.accent,3)+line(bx+bw-24,by+108,bx+bw+64,by+108,C.muted,3);
   out+=text(bx-8,by-46,'유입 → 대기열 → 처리',26,C.muted);
   if(active){out+=rect(bx-48+phase*72,by+98,18,20,C.accent,3)+rect(bx+bw-24+((simTime*c.service)%1)*88,by+98,18,20,C.muted,3);}
 }
 if(footer)out+=wrap(pad,H-70,footer,portrait?28:24,wide,C.muted);
 return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 ${W} ${H}" style="font-family:MotionInter,MotionKorean,sans-serif;font-variant-numeric:tabular-nums" role="img" aria-label="${esc(c.title)}">${out}</svg>`;
}
root.MOTION_GRAPHIC_RUNTIME={render};
})(window);
