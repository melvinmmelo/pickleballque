'use strict';
// Club branding shared by the organizer and player pages: court colors plus optional club and court logos.
// Everything that arrives from storage or the server goes through clean(), so only #rrggbb colors and
// small base64 PNG/WebP/JPEG data URLs ever reach the page.
window.SideoutBrand=(()=>{
const PRESETS=[
  {id:'classic',name:'Classic',colors:{court:'#2b5d8c',kitchen:'#3b74a6',apron:'#2e7553',accent:'#dcf24a'}},
  {id:'park',name:'Park green',colors:{court:'#2f6b45',kitchen:'#418556',apron:'#1f4a31',accent:'#f2e85c'}},
  {id:'pro',name:'Pro purple',colors:{court:'#4a3d8f',kitchen:'#6555b0',apron:'#262245',accent:'#9ef0da'}},
  {id:'clay',name:'Red clay',colors:{court:'#a4473a',kitchen:'#bf6152',apron:'#2c5e46',accent:'#f4e04d'}},
  {id:'night',name:'Night session',colors:{court:'#22405f',kitchen:'#2f587f',apron:'#12243a',accent:'#dcf24a'}},
];
const KEYS=['court','kitchen','apron','accent'],HEX=/^#[0-9a-f]{6}$/i,IMG=/^data:image\/(png|webp|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/,MAX_LOGO=120000,INK='#0f2438';
const defaults=()=>({theme:'classic',colors:{...PRESETS[0].colors},clubLogo:null,courtLogo:null});
const logo=v=>typeof v==='string'&&v.length<=MAX_LOGO&&IMG.test(v)?v:null;
function clean(b){
  const d=defaults();if(!b||typeof b!=='object')return d;
  const colors={};for(const k of KEYS){const v=b.colors?.[k];colors[k]=typeof v==='string'&&HEX.test(v)?v.toLowerCase():d.colors[k];}
  const preset=PRESETS.find(p=>KEYS.every(k=>p.colors[k]===colors[k]));
  return {theme:preset?preset.id:'custom',colors,clubLogo:logo(b.clubLogo),courtLogo:logo(b.courtLogo)};
}
function luminance(hex){const [r,g,b]=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.03928?v/12.92:((v+.055)/1.055)**2.4);return .2126*r+.7152*g+.0722*b;}
function contrast(a,b){const [hi,lo]=[luminance(a),luminance(b)].sort((x,y)=>y-x);return (hi+.05)/(lo+.05);}
const onAccent=accent=>contrast(INK,accent)>=contrast('#ffffff',accent)?INK:'#ffffff';
// Plain-language warnings when a color choice would make text hard to read (WCAG 4.5:1).
function warnings(colors){
  const w=[];
  if(contrast('#ffffff',colors.court)<4.5)w.push('Player names on the court may be hard to read. Choose a darker court color.');
  if(contrast('#ffffff',colors.apron)<4.5)w.push('Court numbers on the surround may be hard to read. Choose a darker surround color.');
  if(Math.max(contrast(INK,colors.accent),contrast('#ffffff',colors.accent))<4.5)w.push('Button text may be hard to read. Choose a lighter or darker button color.');
  return w;
}
function apply(b,root=document.documentElement){
  const c=b.colors;root.style.setProperty('--court',c.court);root.style.setProperty('--kitchen',c.kitchen);root.style.setProperty('--apron',c.apron);root.style.setProperty('--ball',c.accent);root.style.setProperty('--on-ball',onAccent(c.accent));
}
// Cheap change detector for deciding when to re-send branding; not a security hash.
function key(b){const s=JSON.stringify([b.colors,b.clubLogo,b.courtLogo]);let h=0;for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))|0;return s.length+':'+h;}
const isDefault=b=>key(clean(b))===key(defaults());
function load(storageKey){try{return clean(JSON.parse(localStorage.getItem(storageKey)||'null'));}catch{return defaults();}}
function save(storageKey,b){localStorage.setItem(storageKey,JSON.stringify(b));}
return {PRESETS,defaults,clean,apply,warnings,contrast,key,isDefault,load,save};
})();
