'use strict';
const session=location.hash.slice(1),form=document.getElementById('join-form'),message=document.getElementById('message'),button=document.getElementById('join-button');
const key='sideout-join-'+session;let receipt;
try{receipt=JSON.parse(localStorage.getItem(key)||'null');}catch{}
if(!receipt)receipt={id:crypto.randomUUID()};
if(!/^[0-9a-f-]{36}$/i.test(session)||!CheckinAPI.configured()){form.hidden=true;message.textContent='This check-in link is unavailable. Ask the organizer to add you manually.';}
else if(receipt.name){form.hidden=true;message.textContent=`You’re checked in as ${receipt.name}. The organizer will receive your arrival automatically.`;}
form.onsubmit=async e=>{e.preventDefault();const name=document.getElementById('join-name').value.trim().replace(/\s+/g,' ');if(!name)return;button.disabled=true;message.textContent='Joining…';
try{try{localStorage.setItem(key,JSON.stringify(receipt));}catch{}
const result=await CheckinAPI.call('join',{p_session:session,p_id:receipt.id,p_name:name});receipt.name=result.name;try{localStorage.setItem(key,JSON.stringify(receipt));}catch{}form.hidden=true;message.textContent=`You’re checked in as ${result.name}! The organizer will receive your arrival automatically. Wait for your name to be called.`;
}catch(error){message.textContent=error.message;}finally{button.disabled=false;}};
