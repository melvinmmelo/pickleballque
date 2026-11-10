'use strict';
// Organizer "Customize" panel: court color presets, custom colors, and club/court logo uploads.
// Relies on index.html's brand, setBrand() and node(); does nothing if brand.js did not load.
(()=>{
const B=window.SideoutBrand;if(!B||typeof setBrand!=='function')return;
const SLOTS=[
  {key:'clubLogo',title:'Club logo',help:'Shown at the top of the organizer and player pages.',empty:'No club logo'},
  {key:'courtLogo',title:'Court logo',help:'Shown beside the number on every court.',empty:'No court logo'},
];
const PICKERS=[['court','Court'],['kitchen','Kitchen'],['apron','Surround'],['accent','Buttons']];
const dialog=document.createElement('dialog');dialog.id='brand-dialog';dialog.setAttribute('aria-labelledby','brand-title');
dialog.innerHTML='<form method="dialog" class="brand-form"><div class="card-head"><h2 id="brand-title">Customize</h2><button class="dark" value="done">Done</button></div>'
  +'<fieldset><legend>Court colors</legend><div id="brand-presets" class="swatches"></div><div id="brand-pickers" class="pickers"></div><p id="brand-warning" class="helper danger" role="status"></p></fieldset>'
  +'<fieldset><legend>Logos</legend><div id="brand-logos"></div><p class="helper">PNG, JPEG, WebP, SVG or GIF. Logos are resized to fit and saved in this browser. While QR check-in is on, players see them too.</p></fieldset>'
  +'<p id="brand-message" class="helper" role="status"></p><button type="button" id="brand-reset" class="quiet">Reset to Sideout defaults</button></form>';
document.body.append(dialog);
const $$=id=>document.getElementById(id),say=text=>{$$('brand-message').textContent=text;};

// Preset swatches: each is a radio drawn as a tiny court in that scheme.
const presets=$$('brand-presets');
for(const p of [...B.PRESETS,{id:'custom',name:'Custom'}]){
  const label=node('label','swatch'),input=node('input','sr-only'),mini=node('span','mini');
  input.type='radio';input.name='theme';input.value=p.id;
  if(p.colors){mini.style.setProperty('--c',p.colors.court);mini.style.setProperty('--k',p.colors.kitchen);mini.style.setProperty('--a',p.colors.apron);}else mini.classList.add('custom');
  input.onchange=()=>{if(p.colors)setBrand({...brand,colors:{...p.colors}});else $$('brand-pickers').querySelector('input').focus();sync();};
  label.append(input,mini,node('span','',p.name));presets.append(label);
}
const pickers=$$('brand-pickers');
for(const [key,text] of PICKERS){
  const label=node('label','',text),input=node('input');input.type='color';input.name=key;
  input.oninput=()=>{setBrand({...brand,colors:{...brand.colors,[key]:input.value}},false);sync();};
  input.onchange=()=>{setBrand({...brand,colors:{...brand.colors,[key]:input.value}});sync();};
  label.append(input);pickers.append(label);
}

// Logos are redrawn on a canvas, so whatever was uploaded is stored as a small raster image.
async function toLogo(file){
  if(!/^image\/(png|jpeg|webp|svg\+xml|gif)$/.test(file.type))throw Error('Choose a PNG, JPEG, WebP, SVG or GIF image.');
  if(file.size>8e6)throw Error('That image is over 8 MB. Choose a smaller file.');
  const url=URL.createObjectURL(file);
  try{
    const img=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(Error('That image could not be read. Try a PNG or JPEG.'));i.src=url;});
    for(const max of [256,192,128]){
      const w=img.naturalWidth||max,h=img.naturalHeight||max,scale=Math.min(1,max/Math.max(w,h)),canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(w*scale));canvas.height=Math.max(1,Math.round(h*scale));canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
      let data=canvas.toDataURL('image/webp',.86);if(!data.startsWith('data:image/webp'))data=canvas.toDataURL('image/png');
      if(data.length<=110000)return data;
    }
    throw Error('That image is too detailed to store. Try a simpler version of the logo.');
  }finally{URL.revokeObjectURL(url);}
}
const logos=$$('brand-logos');
for(const slot of SLOTS){
  const row=node('div','logo-slot'),preview=node('div','logo-preview '+slot.key),img=node('img'),empty=node('span','',slot.empty),info=node('div'),upload=node('label','upload','Upload'),file=node('input','sr-only'),remove=node('button','quiet','Remove');
  img.alt='';row.dataset.slot=slot.key;file.type='file';file.accept='image/png,image/jpeg,image/webp,image/svg+xml,image/gif';file.setAttribute('aria-label','Upload '+slot.title.toLowerCase());remove.type='button';
  file.onchange=async()=>{const f=file.files[0];file.value='';if(!f)return;say('Saving '+slot.title.toLowerCase()+'…');try{setBrand({...brand,[slot.key]:await toLogo(f)});say(slot.title+' saved.');}catch(e){say(e.message);}sync();};
  remove.onclick=()=>{setBrand({...brand,[slot.key]:null});say(slot.title+' removed.');sync();};
  upload.append(file);preview.append(img,empty);info.append(node('b','',slot.title),node('p','helper',slot.help),upload,remove);row.append(preview,info);logos.append(row);
}
$$('brand-reset').onclick=()=>{setBrand(B.defaults());say('Colors and logos reset to Sideout defaults.');sync();};

// Reflect the current brand in the controls.
function sync(){
  for(const input of presets.querySelectorAll('input'))input.checked=input.value===brand.theme;
  for(const input of pickers.querySelectorAll('input'))input.value=brand.colors[input.name];
  for(const row of logos.children){const v=brand[row.dataset.slot],img=row.querySelector('img');img.hidden=!v;if(v)img.src=v;else img.removeAttribute('src');row.querySelector('span').hidden=!!v;row.querySelector('.quiet').disabled=!v;}
  $$('brand-warning').textContent=B.warnings(brand.colors).join(' ');
}
const open=$$('customize');open.hidden=false;open.onclick=()=>{say('');sync();dialog.showModal();};
})();
