'use strict';
(()=>{
const panel=document.createElement('section');panel.className='card';panel.style.marginBottom='22px';
panel.innerHTML='<div class="card-head"><h2>Session QR check-in <span class="pill">Optional</span></h2><button id="share-start" class="dark">Enable QR check-in</button></div><p id="share-message" role="status"></p><div id="share-details" hidden><div id="share-qr" style="margin:18px 0"></div><label for="share-link">Player join link</label><input id="share-link" readonly style="margin:8px 0"><button id="share-copy">Copy link</button> <button id="share-stop" class="danger">Close check-in</button><p class="helper">Keep this organizer page open to receive arrivals. Players join automatically, usually within 5 seconds. QR expires after 12 hours. Only share the player join link.</p></div>';
document.querySelector('.layout').before(panel);
const message=text=>$('share-message').textContent=text;
let busy=false;
function show(){const shared=state.checkin;$('share-start').hidden=!!shared;$('share-details').hidden=!shared;$('share-start').disabled=!CheckinAPI.configured();if(!shared){message(CheckinAPI.configured()?'Enable when you want players to scan and join. Manual entry always works.':'QR check-in needs the one-time Supabase connection. Manual entry is ready to use.');return;}
const url=new URL('join.html',location.href);url.hash=shared.id;$('share-link').value=url.href;
const qr=qrcode(0,'M');qr.addData(url.href);qr.make();$('share-qr').innerHTML=qr.createSvgTag({cellSize:5,margin:20,scalable:true});const svg=$('share-qr').firstElementChild;svg.style.width='240px';svg.style.maxWidth='100%';svg.setAttribute('aria-label','Scan to join this session');svg.setAttribute('role','img');
message('Check-in enabled. Waiting for arrivals.');}
$('share-start').onclick=async()=>{if(busy)return;if(location.protocol==='file:'){message('Open the GitHub Pages website to enable QR check-in. A local file link cannot be opened on other phones.');return;}
busy=true;$('share-start').disabled=true;
try{const id=crypto.randomUUID(),owner=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
// Ensure browser storage works before creating a remote session.
localStorage.setItem('sideout-storage-test','1');localStorage.removeItem('sideout-storage-test');
const result=await CheckinAPI.call('create',{p_session:id,p_owner:owner,p_players:state.players.map(p=>({id:p.id,name:p.name}))});
state.checkin={id,owner,seen:state.players.map(p=>p.id),expiresAt:result.expiresAt};previous=null;persist();render();show();
}catch(e){message(e.message);}finally{busy=false;$('share-start').disabled=!CheckinAPI.configured();}};
async function poll(){if(busy||!state.checkin||!CheckinAPI.configured()||document.hidden)return;busy=true;const shared=state.checkin;
try{const result=await CheckinAPI.call('poll',{p_session:shared.id,p_owner:shared.owner});if(state.checkin!==shared)return;
let changed=false;for(const arrival of result.arrivals){if(shared.seen.includes(arrival.id))continue;
if(!state.players.some(p=>p.id===arrival.id||p.name.toLocaleLowerCase()===arrival.name.toLocaleLowerCase())){state.players.push({id:arrival.id,name:arrival.name,games:0});state.queue.push(arrival.id);}shared.seen.push(arrival.id);changed=true;}
if(changed){previous=null;persist();render();}
message(result.closed?'This QR is closed or expired. Close check-in here to enable a new QR.':'Check-in enabled · Arrivals are up to date.');return true;
}catch(e){message(e.message+' Manual entry still works.');return false;}finally{busy=false;}}
$('share-stop').onclick=async()=>{if(busy||!state.checkin)return;busy=true;$('share-stop').disabled=true;const shared=state.checkin;
try{await CheckinAPI.call('close',{p_session:shared.id,p_owner:shared.owner});busy=false;const received=await poll();if(received&&state.checkin===shared){delete state.checkin;previous=null;persist();render();show();}}
catch(e){message(e.message+' Check-in has not been closed.');}finally{busy=false;$('share-stop').disabled=false;}};
$('share-copy').onclick=async()=>{try{await navigator.clipboard.writeText($('share-link').value);message('Join link copied.');}catch{$('share-link').select();message('Select and copy the join link above.');}};
const reset=$('reset').onclick;$('reset').onclick=()=>{if(state.checkin){message('Close QR check-in before resetting this session.');panel.scrollIntoView({behavior:'smooth'});return;}reset();};
window.addEventListener('storage',()=>{show();});
show();poll();setInterval(poll,5000);
})();
