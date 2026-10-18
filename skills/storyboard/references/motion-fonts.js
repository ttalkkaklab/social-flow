/* Font roles use pinned files and cmap coverage, not an OS-dependent fallback. */
(function(root){
'use strict';
const DATA=typeof module==='object'&&module.exports?require('./motion-font-data.js'):root.MOTION_FONT_DATA;
function supports(id,value){
 const font=DATA[id];if(!font)return false;
 return Array.from(String(value).normalize('NFC')).every(ch=>/\s/.test(ch)||font.coverage.some(([a,b])=>ch.codePointAt(0)>=a&&ch.codePointAt(0)<=b));
}
function choose(value,id){
 const normalized=String(value).normalize('NFC');
 if(supports(id,normalized))return {id,family:DATA[id].family,fallback:false};
 if(supports('pretendard',normalized))return {id:'pretendard',family:DATA.pretendard.family,fallback:true,requested:id,reason:'The requested font does not cover the complete text; use bundled Pretendard for the whole text.'};
 const missing=Array.from(normalized).filter(ch=>!supports('pretendard',ch));
 throw Error('Bundled motion fonts lack glyphs: '+[...new Set(missing)].join(' ')+'; author this text with a supported font.');
}
function roles(theme){return theme.typography;}
function face(value,role,theme,weight=450){
 let id=roles(theme)[role]||roles(theme).body;
 if(role==='title'&&/^[\x00-\x7f]*$/.test(String(value)))id=roles(theme).latin||id;
 const result=choose(value,id),font=DATA[result.id];
 return {...result,weight:font.axes.wght?Math.max(font.axes.wght[0],Math.min(font.axes.wght[2],weight)):font.weight};
}
function css(){return Object.values(DATA).map(f=>`@font-face{font-family:${f.family};src:url('assets/${f.file}');font-weight:${f.axes.wght?f.axes.wght[0]+' '+f.axes.wght[2]:f.weight};font-display:block}`).join('\n');}
async function load(){
 for(const f of Object.values(DATA)){
   const faces=await root.document.fonts.load(`${f.weight} 32px ${f.family}`);
   if(!faces.length||faces.some(face=>face.status!=='loaded'))throw Error('Motion font failed to load: '+f.family);
 }
 await root.document.fonts.ready;
}
const api={DATA,supports,choose,face,css,load};
if(typeof module==='object'&&module.exports)module.exports=api;else root.MOTION_FONTS=api;
})(typeof window==='object'?window:globalThis);
