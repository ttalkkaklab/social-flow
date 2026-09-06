/* Catalog-style annotations. draw() follows the supplied subject projection and timeline. */
(function(root){
  'use strict';
  const NS='http://www.w3.org/2000/svg';
  const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*x*(x*(x*6-15)+10)};
  function leader(anchor, label, side, radius=18){
    const width=220, toRight=side==='right'&&anchor[0]<label[0]+width/2;
    const end=[toRight?label[0]+width:label[0],label[1]];
    const elbow=[toRight?label[0]:label[0]+Math.min(width,Math.max(90,Math.abs(anchor[0]-label[0])*.6)),label[1]];
    const dx=elbow[0]-anchor[0],dy=elbow[1]-anchor[1],len=Math.hypot(dx,dy)||1;
    const r=Math.min(radius,len/3,Math.abs(end[0]-elbow[0])/3),direction=Math.sign(end[0]-elbow[0])||1;
    return `M${anchor[0]} ${anchor[1]} L${elbow[0]-dx/len*r} ${elbow[1]-dy/len*r} Q${elbow[0]} ${elbow[1]} ${elbow[0]+direction*r} ${elbow[1]} L${end[0]} ${end[1]}`;
  }
  function mount(svg, specs){
    const add=(tag,attrs,parent)=>{const e=document.createElementNS(NS,tag);for(const[k,v]of Object.entries(attrs))e.setAttribute(k,v);parent.appendChild(e);return e};
    const items=specs.map((s,i)=>{
      if(typeof s.project!=='function'||!Array.isArray(s.label)||s.label.length!==2||!s.label.every(Number.isFinite))throw Error('Invalid catalog callout');
      const refined=s.style==='restrained',ink=refined?'#385955':'#ded8c9';
      const group=add('g',{'data-catalog-part':s.part||String(i),'data-rg':s.group},svg);
      const under=refined?add('path',{fill:'none',stroke:'#fff8ec','stroke-width':6,'stroke-linecap':'round',pathLength:1,'stroke-dasharray':1,'stroke-opacity':.85},group):null;
      const path=add('path',{fill:'none',stroke:ink,'stroke-width':refined?2.8:2.5,'stroke-linecap':'round',pathLength:1,'stroke-dasharray':1},group);
      const halo=add('circle',{r:refined?9:15,fill:refined?'#fff8ec':'none',stroke:refined?ink:'#e3dccb','stroke-width':refined?2.5:1.5,'stroke-opacity':refined?1:.75},group);
      const ring=add('circle',{r:refined?2.5:5,fill:refined?ink:'#e9e0cb',stroke:refined?ink:'#152121','stroke-width':refined?0:2},group);
      const label=add('g',{},group),number=add('text',{x:s.label[0],y:s.label[1]+33,fill:'#bda778','font-family':'Helvetica Neue, sans-serif','font-size':23,'letter-spacing':2},label);
      number.textContent=refined?'':String(i+1).padStart(2,'0');
      const text=add('text',{x:s.label[0]+(refined?0:48),y:s.label[1]+(refined?-16:39),fill:refined?'#243f3c':'#e9e3d6','font-family':'Pretendard, Apple SD Gothic Neo, sans-serif','font-size':s.fontSize||40,'font-weight':refined?600:500,'letter-spacing':-.7,...(refined?{stroke:'#eee4d5','stroke-width':5,'paint-order':'stroke fill','stroke-linejoin':'round'}:{})},label);text.textContent=s.text;
      return {s,group,path,under,halo,ring,label};
    });
    return {draw(group,time){
      for(const item of items){const{s}=item,elapsed=group>s.group?1e6:group<s.group?-1e6:time-(s.delayMs??600),u=smooth(elapsed/(s.durationMs||1000));
        const p=s.project(),fade=s.endMs===undefined?1:1-smooth((time-s.endMs+300)/300);item.group.style.opacity=p.visible===false?'0':String(fade);
        for(const ring of [item.halo,item.ring]){ring.setAttribute('cx',p.x);ring.setAttribute('cy',p.y);ring.style.opacity=String(smooth(elapsed/220));}
        item.path.setAttribute('d',leader([p.x,p.y],s.label,s.side||'left'));item.path.style.strokeDashoffset=String(1-u);item.path.style.opacity=String(u>0?1:0);
        if(item.under){item.under.setAttribute('d',item.path.getAttribute('d'));item.under.style.strokeDashoffset=String(1-u);item.under.style.opacity=String(u>0?1:0)}
        item.label.style.opacity=String(smooth((elapsed-450)/400));item.label.setAttribute('transform','translate(0 '+(6*(1-smooth((elapsed-450)/400)))+')');
      }
    },diagnostics:()=>items.map(i=>({part:i.s.part,anchor:i.s.project(),label:i.s.label}))};
  }
  const api={mount,leader};if(typeof module==='object'&&module.exports)module.exports=api;else root.CATALOG_CALLOUTS=api;
})(typeof window==='object'?window:globalThis);
