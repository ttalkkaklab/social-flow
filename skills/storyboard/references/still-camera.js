/* Camera direction for prepared still assets. Focus is a masked optical approximation. */
(function(root){
 'use strict';
 const clamp=x=>Math.max(0,Math.min(1,x)),ease=x=>{x=clamp(x);return x*x*x*(x*(x*6-15)+10)},mix=(a,b,t)=>a+(b-a)*t;
 function state(spec,seconds){
  const q=clamp(seconds/spec.duration),u=ease(q),kind=spec.template;
  let zoom=1+.10*u,fx=.45,fy=.4;   // the default is `push` — a plain eased zoom-in
  if(kind==='pull'){zoom=mix(1.34,1,u);fx=spec.focusTo?.[0]??.35;fy=spec.focusTo?.[1]??.38}
  if(kind==='pan'){zoom=1.13;fx=mix(.26,.61,u);fy=mix(.65,.45,u)}
  if(kind==='focus-in'){zoom=1.04+.055*u;fx=spec.focusTo[0];fy=spec.focusTo[1]}
  if(kind==='rack-focus'){zoom=1.08;fx=mix(spec.focusFrom[0],spec.focusTo[0],u);fy=mix(spec.focusFrom[1],spec.focusTo[1],u)}
  if(kind==='approach'){zoom=mix(1,1.38,u);fx=spec.focusTo[0];fy=spec.focusTo[1]}
  if(kind==='reveal'||kind==='parallax'){zoom=1.10;fx=mix(.4,.6,u)}
  return {zoom,fx,fy,progress:u,focus:kind==='focus-in'?ease((q-.05)/.43):kind==='rack-focus'?ease((q-.25)/.45):1};
 }
 async function mount(canvas,spec,source,layerSources=[]){
  const decode=async src=>{const img=new Image();img.src=src;await img.decode();return img};
  const photo=await decode(source),layers=await Promise.all(layerSources.map(decode)),ctx=canvas.getContext('2d');
  const surface=()=>{const c=document.createElement('canvas');c.width=photo.width;c.height=photo.height;return c};
  const blur=surface(),bc=blur.getContext('2d');bc.drawImage(photo,0,0);bc.filter='blur(9px)';bc.drawImage(photo,0,0);bc.filter='none';
  function focused(r){
   const c=surface(),cc=c.getContext('2d'),mask=surface(),mc=mask.getContext('2d');
   const [x,y,rx,ry]=r;mc.translate(x*photo.width,y*photo.height);mc.scale(rx*photo.width,ry*photo.height);
   const g=mc.createRadialGradient(0,0,.42,0,0,1.3);g.addColorStop(0,'#fff');g.addColorStop(.6,'#ffffffc0');g.addColorStop(1,'#fff0');mc.fillStyle=g;mc.fillRect(-1.4,-1.4,2.8,2.8);
   cc.drawImage(photo,0,0);cc.globalCompositeOperation='destination-in';cc.drawImage(mask,0,0);cc.globalCompositeOperation='source-over';return c;
  }
  const focusedTo=spec.focusTo?focused(spec.focusTo):null,focusedFrom=spec.focusFrom?focused(spec.focusFrom):null;
  for(const l of layers){if(l.width!==photo.width||l.height!==photo.height)throw Error('Camera layers must share the background dimensions');const c=surface(),lc=c.getContext('2d');lc.drawImage(l,0,0);const data=lc.getImageData(0,0,c.width,c.height).data;let transparent=false;for(let i=3;i<data.length;i+=4)if(data[i]<255){transparent=true;break}if(!transparent)throw Error('Camera foreground needs actual transparency');}
  const draw=(seconds)=>{
   const s=state(spec,seconds),w=canvas.width,h=canvas.height,base=Math.max(w/photo.width,h/photo.height),dw=photo.width*base*s.zoom,dh=photo.height*base*s.zoom,x=(w-dw)*s.fx,y=(h-dh)*s.fy;
   ctx.globalAlpha=1;ctx.clearRect(0,0,w,h);
   if(spec.template==='focus-in'||spec.template==='rack-focus'){
    ctx.drawImage(blur,x,y,dw,dh);
    if(focusedFrom){ctx.globalAlpha=1-s.focus;ctx.drawImage(focusedFrom,x,y,dw,dh)}
    ctx.globalAlpha=s.focus;ctx.drawImage(focusedTo,x,y,dw,dh);ctx.globalAlpha=1;
   }else ctx.drawImage(photo,x,y,dw,dh);
   layers.forEach((layer,i)=>{const depth=spec.layers[i].depth,dx=(spec.template==='reveal'?s.progress*w*1.25:(s.progress-.5)*w*.09)*depth;ctx.drawImage(layer,x+dx,y,dw,dh)});
   return s;
  };
  return {draw,diagnostics:()=>({technique:'still-camera',template:spec.template,focusMethod:['focus-in','rack-focus'].includes(spec.template)?'feathered-region':null,layers:layers.length})};
 }
 const api={mount,state};if(typeof module==='object'&&module.exports)module.exports=api;else root.STILL_CAMERA=api;
})(typeof window==='object'?window:globalThis);
