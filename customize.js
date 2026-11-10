'use strict';
// Organizer "Customize" panel: court color presets, custom colors, club/court logos, and sponsor banners.
// Relies on index.html's brand, setBrand() and node(); does nothing if brand.js did not load.
(()=>{
const B=window.SideoutBrand,S=window.SideoutSponsors;if(!B||typeof setBrand!=='function')return;
const SLOTS=[
  {key:'clubLogo',title:'Club logo',help:'Shown at the top of the organizer and player pages.',empty:'No club logo'},
  {key:'courtLogo',title:'Court logo',help:'Shown beside the number on every court.',empty:'No court logo'},
];
const PICKERS=[['court','Court'],['kitchen','Kitchen'],['apron','Surround'],['accent','Buttons']];
const IMAGE_TYPES='image/png,image/jpeg,image/webp,image/svg+xml,image/gif';
const dialog=document.createElement('dialog');dialog.id='brand-dialog';dialog.setAttribute('aria-labelledby','brand-title');
dialog.innerHTML='<form method="dialog" class="brand-form"><div class="card-head"><h2 id="brand-title">Customize</h2><button class="dark" value="done">Done</button></div>'
  +'<fieldset><legend>Court colors</legend><div id="brand-presets" class="swatches"></div><div id="brand-pickers" class="pickers"></div><p id="brand-warning" class="helper danger" role="status"></p></fieldset>'
  +'<fieldset><legend>Logos</legend><div id="brand-logos"></div><p class="helper">PNG, JPEG, WebP, SVG or GIF. Logos are resized to fit and saved in this browser. While QR check-in is on, players see them too.</p></fieldset>'
  +'<fieldset id="sponsor-fieldset"><legend>Sponsor banners</legend><p class="helper">Banners take turns at the top of the page every 8 seconds, like ads during a broadcast. Wide images work best, about 4 to 1 (for example 1200 × 300). Up to 6 banners. While QR check-in is on, players see them too.</p><div id="sponsor-list"></div><label class="upload" id="sponsor-add">Add banner<input type="file" class="sr-only" accept="'+IMAGE_TYPES+'" aria-label="Add a sponsor banner"></label></fieldset>'
  +'<p id="brand-message" class="helper" role="status"></p><button type="button" id="brand-reset" class="quiet">Reset colors and logos</button></form>';
document.body.append(dialog);
const $$=id=>document.getElementById(id),say=text=>{$$('brand-message').textContent=text;},stat=detail=>window.SideoutStats?.track('brand_changed',detail);

// Preset swatches: each is a radio drawn as a tiny court in that scheme.
const presets=$$('brand-presets');
for(const p of [...B.PRESETS,{id:'custom',name:'Custom'}]){
  const label=node('label','swatch'),input=node('input','sr-only'),mini=node('span','mini');
  input.type='radio';input.name='theme';input.value=p.id;
  if(p.colors){mini.style.setProperty('--c',p.colors.court);mini.style.setProperty('--k',p.colors.kitchen);mini.style.setProperty('--a',p.colors.apron);}else mini.classList.add('custom');
  input.onchange=()=>{if(p.colors){setBrand({...brand,colors:{...p.colors}});stat('preset');}else $$('brand-pickers').querySelector('input').focus();sync();};
  label.append(input,mini,node('span','',p.name));presets.append(label);
}
const pickers=$$('brand-pickers');
for(const [key,text] of PICKERS){
  const label=node('label','',text),input=node('input');input.type='color';input.name=key;
  input.oninput=()=>{setBrand({...brand,colors:{...brand.colors,[key]:input.value}},false);sync();};
  input.onchange=()=>{setBrand({...brand,colors:{...brand.colors,[key]:input.value}});stat('custom_color');sync();};
  label.append(input);pickers.append(label);
}

// Uploads are redrawn on a canvas, so whatever was chosen is stored as a small raster image.
// box is the largest size kept; each retry shrinks it until the image fits the byte limit.
async function toImage(file,{box,limit}){
  if(!/^image\/(png|jpeg|webp|svg\+xml|gif)$/.test(file.type))throw Error('Choose a PNG, JPEG, WebP, SVG or GIF image.');
  if(file.size>8e6)throw Error('That image is over 8 MB. Choose a smaller file.');
  const url=URL.createObjectURL(file);
  try{
    const img=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(Error('That image could not be read. Try a PNG or JPEG.'));i.src=url;});
    for(const shrink of [1,.75,.5]){
      const w=img.naturalWidth||box[0],h=img.naturalHeight||box[1],scale=Math.min(1,box[0]*shrink/w,box[1]*shrink/h),canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(w*scale));canvas.height=Math.max(1,Math.round(h*scale));canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
      let data=canvas.toDataURL('image/webp',.84);if(!data.startsWith('data:image/webp'))data=canvas.toDataURL('image/png');
      if(data.length<=limit)return data;
    }
    throw Error('That image is too detailed to store. Try a simpler or smaller version.');
  }finally{URL.revokeObjectURL(url);}
}
const logos=$$('brand-logos');
for(const slot of SLOTS){
  const row=node('div','logo-slot'),preview=node('div','logo-preview '+slot.key),img=node('img'),empty=node('span','',slot.empty),info=node('div'),upload=node('label','upload','Upload'),file=node('input','sr-only'),remove=node('button','quiet','Remove');
  img.alt='';row.dataset.slot=slot.key;file.type='file';file.accept=IMAGE_TYPES;file.setAttribute('aria-label','Upload '+slot.title.toLowerCase());remove.type='button';
  file.onchange=async()=>{const f=file.files[0];file.value='';if(!f)return;say('Saving '+slot.title.toLowerCase()+'…');try{setBrand({...brand,[slot.key]:await toImage(f,{box:[256,256],limit:110000})});say(slot.title+' saved.');stat(slot.key==='clubLogo'?'club_logo':'court_logo');}catch(e){say(e.message);}sync();};
  remove.onclick=()=>{setBrand({...brand,[slot.key]:null});say(slot.title+' removed.');stat('remove_logo');sync();};
  upload.append(file);preview.append(img,empty);info.append(node('b','',slot.title),node('p','helper',slot.help),upload,remove);row.append(preview,info);logos.append(row);
}

// Sponsor banners: add, name, link, reorder, remove.
const sponsorsOf=()=>brand.sponsors||[],setSponsors=list=>setBrand({...brand,sponsors:list});
function normalizeLink(raw){const v=raw.trim();if(!v)return null;if(/^https:\/\//i.test(v))return v;if(/^[a-z][a-z0-9+.-]*:/i.test(v))throw Error('Sponsor links must start with https://');return 'https://'+v;}
const addInput=$$('sponsor-add').querySelector('input');
addInput.onchange=async()=>{const f=addInput.files[0];addInput.value='';if(!f||!S)return;if(sponsorsOf().length>=S.MAX){say('You can have up to '+S.MAX+' sponsor banners.');return;}
  say('Saving banner…');try{const image=await toImage(f,{box:[1200,400],limit:130000}),name=(f.name.replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim()||'Sponsor').slice(0,60);
  setSponsors([...sponsorsOf(),{image,name,link:null}]);say('Banner added. Check the sponsor name below.');window.SideoutStats?.track('banner_added');}catch(e){say(e.message);}sync();};
function renderSponsors(){
  const host=$$('sponsor-list'),list=sponsorsOf();host.replaceChildren();
  list.forEach((s,i)=>{
    const row=node('div','sponsor-row'),thumb=node('img','sponsor-thumb'),fields=node('div','sponsor-fields'),name=node('input'),link=node('input'),actions=node('div','sponsor-actions'),up=node('button','quiet','Move up'),remove=node('button','quiet danger','Remove');
    thumb.src=s.image;thumb.alt='';name.value=s.name;name.maxLength=60;name.setAttribute('aria-label',`Sponsor name for banner ${i+1}`);name.placeholder='Sponsor name';
    link.value=s.link||'';link.placeholder='Link (optional), e.g. https://example.com';link.setAttribute('aria-label',`Link for banner ${i+1}`);link.inputMode='url';
    name.onchange=()=>{const v=name.value.replace(/\s+/g,' ').trim();if(!v){say('Each banner needs a sponsor name.');name.value=s.name;return;}setSponsors(list.map((x,n)=>n===i?{...x,name:v}:x));say('Sponsor name saved.');stat('banner_name');sync();};
    link.onchange=()=>{try{const v=normalizeLink(link.value);setSponsors(list.map((x,n)=>n===i?{...x,link:v}:x));say(v?'Link saved.':'Link removed.');stat('banner_link');}catch(e){say(e.message);link.value=s.link||'';}sync();};
    up.type='button';up.disabled=i===0;up.setAttribute('aria-label',`Move ${s.name} up`);up.onclick=()=>{const next=[...list];[next[i-1],next[i]]=[next[i],next[i-1]];setSponsors(next);stat('banner_order');sync();};
    remove.type='button';remove.setAttribute('aria-label',`Remove ${s.name}`);remove.onclick=()=>{setSponsors(list.filter((_,n)=>n!==i));say(s.name+' removed.');window.SideoutStats?.track('banner_removed');sync();};
    fields.append(name,link);actions.append(up,remove);row.append(thumb,fields,actions);host.append(row);
  });
  if(!list.length)host.append(node('p','helper','No sponsor banners yet.'));
  const full=!S||list.length>=S.MAX;$$('sponsor-add').classList.toggle('disabled',full);addInput.disabled=full;
}
$$('brand-reset').onclick=()=>{setBrand({...B.defaults(),sponsors:sponsorsOf()});stat('reset');say('Colors and logos reset to Sideout defaults. Sponsor banners were kept.');sync();};

// Reflect the current brand in the controls.
function sync(){
  for(const input of presets.querySelectorAll('input'))input.checked=input.value===brand.theme;
  for(const input of pickers.querySelectorAll('input'))input.value=brand.colors[input.name];
  for(const row of logos.children){const v=brand[row.dataset.slot],img=row.querySelector('img');img.hidden=!v;if(v)img.src=v;else img.removeAttribute('src');row.querySelector('span').hidden=!!v;row.querySelector('.quiet').disabled=!v;}
  $$('brand-warning').textContent=B.warnings(brand.colors).join(' ');
  renderSponsors();
}
const open=$$('customize');open.hidden=false;open.onclick=()=>{say('');sync();dialog.showModal();};
})();
