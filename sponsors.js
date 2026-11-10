'use strict';
// Sponsor banners shared by the organizer and player pages: validation plus a rotating banner strip,
// like the sponsor slots during a broadcast. Banners take turns every 8 seconds with a crossfade;
// dots pick one, and Pause stops the rotation (needed because the strip moves on its own).
window.SideoutSponsors=(()=>{
const IMG=/^data:image\/(png|webp|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/,MAX_IMAGE=140000,MAX=6,LINK=/^https:\/\/[^\s"'<>\\]{1,200}$/;
// Only small raster images, a 1–60 character name, and an optional https link survive.
function clean(list){
  if(!Array.isArray(list))return [];const out=[];
  for(const s of list){if(out.length>=MAX)break;if(!s||typeof s!=='object')continue;
    const image=typeof s.image==='string'&&s.image.length<=MAX_IMAGE&&IMG.test(s.image)?s.image:null,name=typeof s.name==='string'?s.name.replace(/\s+/g,' ').trim().slice(0,60):'',link=typeof s.link==='string'&&LINK.test(s.link.trim())?s.link.trim():null;
    if(image&&name)out.push({image,name,link});}
  return out;
}
function key(list){const s=JSON.stringify(list);let h=0;for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))|0;return s.length+':'+h;}
const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
function mount(host,list){
  clearInterval(host._rotation);host.replaceChildren();host.hidden=!list.length;if(!list.length)return;
  const stage=el('div','sponsor-stage'),bar=el('div','sponsor-bar');let index=0,paused=false;
  const slides=list.map((s,i)=>{const slide=s.link?el('a','sponsor-slide'):el('div','sponsor-slide');if(s.link){slide.href=s.link;slide.target='_blank';slide.rel='noopener sponsored';}
    const fill=el('img','fill'),img=el('img','main');fill.src=img.src=s.image;fill.alt='';fill.setAttribute('aria-hidden','true');img.alt=s.name;img.decoding=fill.decoding='async';slide.append(fill,img);stage.append(slide);return slide;});
  const dots=list.length>1?list.map((s,i)=>{const b=el('button','sponsor-dot');b.type='button';b.setAttribute('aria-label','Show '+s.name);b.onclick=()=>show(i);return b;}):[];
  function show(i){index=i;slides.forEach((slide,n)=>{const on=n===i;slide.classList.toggle('on',on);if(on){slide.removeAttribute('aria-hidden');slide.removeAttribute('tabindex');}else{slide.setAttribute('aria-hidden','true');if(slide.tagName==='A')slide.tabIndex=-1;}});dots.forEach((d,n)=>{d.classList.toggle('on',n===i);d.setAttribute('aria-current',n===i?'true':'false');});}
  bar.append(el('span','sponsor-label',list.length>1?'Our sponsors':'Our sponsor'),...dots);
  if(list.length>1){const toggle=el('button','sponsor-toggle','Pause');toggle.type='button';toggle.setAttribute('aria-pressed','false');toggle.onclick=()=>{paused=!paused;toggle.textContent=paused?'Play':'Pause';toggle.setAttribute('aria-pressed',String(paused));};bar.append(toggle);
    host._rotation=setInterval(()=>{if(!paused&&!document.hidden&&!host.matches(':hover,:focus-within'))show((index+1)%slides.length);},window.sideoutSponsorInterval||8000);}
  host.append(stage,bar);show(0);
}
return {clean,key,mount,MAX};
})();
