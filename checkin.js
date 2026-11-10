'use strict';
(()=>{
const panel=document.createElement('section');panel.className='card';panel.id='checkin';
panel.innerHTML='<div class="card-head"><h2>QR check-in</h2><button id="share-start" class="dark">Enable QR check-in</button></div><p id="share-message" role="status" class="helper"></p><div id="share-details" hidden><div class="share-grid"><div id="share-qr"></div><div><label for="share-link">Player link</label><input id="share-link" readonly><div class="share-actions"><button id="share-copy" class="dark">Copy link</button><a id="share-player" target="_blank" rel="noopener">Open player page</a><button id="share-stop" class="quiet danger">Close check-in</button></div><p class="helper">Players who scan join the queue within about 5 seconds while this page stays open. The QR expires after 12 hours. Anyone with the link can see nicknames, game counts and queue positions, and can ask for a custom lineup.</p></div></div></div>';
// The QR panel sits below the queue; lineup requests appear above it, only while one is waiting.
document.querySelector('.layout').after(panel);const requestsPanel=node('section','card requests');requestsPanel.innerHTML='<h2>Player lineup requests</h2><p class="helper">Approve to queue the selected four last. Finish or cancel any existing custom group first.</p><div id="player-requests"></div>';document.querySelector('.layout').before(requestsPanel);requestsPanel.hidden=true;
const message=text=>$('share-message').textContent=text;
// Background updates go through softRender so the page-load intro can finish; older pages without it just render.
const paint=()=>typeof softRender==='function'?softRender():render();
// One network task at a time. A click waits for an in-flight sync instead of being silently dropped.
let waiting=0,lock=Promise.resolve();
function exclusive(task){waiting++;const run=lock.then(()=>task()).finally(()=>{waiting--;});lock=run.catch(()=>{});return run;}
function show(){const shared=state.checkin;if(!shared)requestsPanel.hidden=true;$('share-start').hidden=!!shared;$('share-details').hidden=!shared;$('share-start').disabled=!CheckinAPI.configured();if(!shared){message(CheckinAPI.configured()?'Enable when you want players to scan and join. Manual entry always works.':'QR check-in needs the one-time Supabase connection. Manual entry is ready to use.');return;}
const url=new URL('player.html',location.href);url.hash=shared.id;$('share-link').value=url.href;$('share-player').href=url.href;
const qr=qrcode(0,'M');qr.addData(url.href);qr.make();$('share-qr').innerHTML=qr.createSvgTag({cellSize:5,margin:20,scalable:true});const svg=$('share-qr').firstElementChild;svg.style.width='240px';svg.style.maxWidth='100%';svg.setAttribute('aria-label','Scan to join this session');svg.setAttribute('role','img');
message('Check-in enabled. Waiting for arrivals.');}
$('share-start').onclick=()=>{if($('share-start').disabled||state.checkin)return;if(location.protocol==='file:'){message('Open the GitHub Pages website to enable QR check-in. A local file link cannot be opened on other phones.');return;}
$('share-start').disabled=true;return exclusive(async()=>{if(state.checkin)return;
try{const id=crypto.randomUUID(),owner=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
// Ensure browser storage works before creating a remote session.
localStorage.setItem('sideout-storage-test','1');localStorage.removeItem('sideout-storage-test');
const result=await CheckinAPI.call('create',{p_session:id,p_owner:owner,p_players:state.players.map(p=>({id:p.id,name:p.name}))});
state.checkin={id,owner,seen:state.players.map(p=>p.id),expiresAt:result.expiresAt};previous=null;persist();render();show();await publish(state.checkin);await pushBrand(state.checkin);await pushSponsors(state.checkin);
}catch(e){message(e.message);}finally{$('share-start').disabled=!CheckinAPI.configured();}});};
function poll(){if(waiting||!state.checkin||!CheckinAPI.configured()||document.hidden)return;return exclusive(sync);}
async function sync(){const shared=state.checkin;if(!shared)return false;
try{const result=await CheckinAPI.call('poll',{p_session:shared.id,p_owner:shared.owner});if(state.checkin!==shared)return;
let changed=false,changedView=false;for(const arrival of result.arrivals){if(shared.seen.includes(arrival.id))continue;const name=cleanName(arrival.name);
if(typeof arrival.id==='string'&&visibleName(name)&&!(Number(arrival.leaves)>0)&&!state.players.some(p=>p.id===arrival.id||p.name.toLocaleLowerCase()===name.toLocaleLowerCase())){state.players.push({id:arrival.id,name,games:0});state.queue.push(arrival.id);}shared.seen.push(arrival.id);changed=true;}
// Players who tapped Leave on their phone move from the queue to Left, keeping their games.
// Someone on court is listed in pendingLeaves and goes to Left when their game is finished.
const counts=result.guesses&&typeof result.guesses==='object'?result.guesses:null;if(JSON.stringify(counts)!==JSON.stringify(guessCounts)){guessCounts=counts;changedView=true;}
const departed=[];shared.leaves=shared.leaves||{};pendingLeaves.clear();
for(const arrival of result.arrivals){const id=arrival.id,count=Number(arrival.leaves)||0;if(count<=(shared.leaves[id]||0))continue;
if(state.courts.some(c=>c.current.includes(id))){pendingLeaves.add(id);continue;}
shared.leaves[id]=count;changed=true;if(state.queue.includes(id)){state.queue=state.queue.filter(x=>x!==id);state.left=[...(state.left||[]),id];if((state.lineup||[]).includes(id))state.lineup=[];state.skipped=(state.skipped||[]).filter(x=>x!==id);departed.push(player(id).name);}}
if(departed.length)$('announcement').textContent=departed.join(', ')+' left the session.';
if(changed){previous=null;persist();paint();}else if(changedView)paint();
await publish(shared);await pushBrand(shared);await pushSponsors(shared);await loadRequests(shared,result.closed);
message((result.closed?'This QR is closed or expired. Close check-in here to enable a new QR.':'Check-in is on. Arrivals are up to date.')+(departed.length?' '+departed.join(', ')+' left the session.':'')+(brandNote?' '+brandNote:''));return true;
}catch(e){message(e.message+' Manual entry still works.');return false;}}
function applyCounts(counts){let changed=false;for(const p of state.players){const used=Math.max(p.customUsed||0,counts[p.id]||0);if(used!==(p.customUsed||0)){p.customUsed=used;changed=true;}const old=previous?.players.find(x=>x.id===p.id);if(old)old.customUsed=Math.max(old.customUsed||0,used);}if(changed){persist();paint();}}
async function publish(shared){if(state.checkin!==shared)return;const counts=await CheckinAPI.call('publish_live',{p_session:shared.id,p_owner:shared.owner,p_state:{players:state.players,queue:nextOrder(),courts:state.courts,completed:state.completed,lineup:state.lineup||[],next:nextPlayers(),left:state.left||[]}});if(state.checkin===shared)applyCounts(counts);return counts;}
// Club branding goes to the shared session only when it changes. A database without the branding
// migration is detected once and skipped quietly; players then keep the default look.
const brandSent=new Map();let brandUnsupported=false,brandNote='';
async function pushBrand(shared){if(brandUnsupported||!window.SideoutBrand||typeof brand==='undefined'||!brand||state.checkin!==shared)return;const plain=SideoutBrand.isDefault(brand),key=plain?'default':SideoutBrand.key(brand);if((brandSent.get(shared.id)??'default')===key)return;brandSent.set(shared.id,key);
try{await CheckinAPI.call('set_brand',{p_session:shared.id,p_owner:shared.owner,p_brand:plain?null:{colors:brand.colors,clubLogo:brand.clubLogo,courtLogo:brand.courtLogo}});brandNote='';}catch(e){if(/set_brand|schema cache|does not exist|could not find/i.test(e.message))brandUnsupported=true;else brandNote='Players can’t see your colors and logos yet: '+e.message;}}
const pendingLeaves=window.pendingLeaves=new Set();
// Sponsor banners follow the same rule: sent only when they change, skipped quietly on databases without them.
const sponsorsSent=new Map();let sponsorsUnsupported=false;
async function pushSponsors(shared){if(sponsorsUnsupported||!window.SideoutSponsors||typeof brand==='undefined'||!brand||state.checkin!==shared)return;const list=brand.sponsors||[],key=list.length?SideoutSponsors.key(list):'none';if((sponsorsSent.get(shared.id)??'none')===key)return;sponsorsSent.set(shared.id,key);
try{await CheckinAPI.call('set_sponsors',{p_session:shared.id,p_owner:shared.owner,p_sponsors:list.length?list:null});}catch(e){if(/set_sponsors|schema cache|does not exist|could not find/i.test(e.message))sponsorsUnsupported=true;else brandNote='Players can’t see your sponsor banners yet: '+e.message;}}
let manualAttempt=null;
window.approveCustomLineup=(chosen,requestId=null)=>{const main=document.querySelector('main');main.inert=true;return exclusive(async()=>{const eligible=()=>chosen.length===4&&new Set(chosen).size===4&&chosen.every(id=>state.queue.includes(id)&&(player(id).customUsed||0)<2);
if(!requestId&&state.lineup?.length===4&&chosen.every((id,i)=>state.lineup[i]===id))return true;
if(!eligible()){$('lineup-error').textContent='Choose four waiting players with custom lineups remaining.';message('A selected player is unavailable or has used both custom lineups.');return false;}
const shared=state.checkin;
try{let counts=null;if(shared){await publish(shared);if(!eligible())throw Error('A selected player has used both custom lineups.');const signature=shared.id+chosen.join(',');if(!manualAttempt||manualAttempt.signature!==signature)manualAttempt={signature,id:crypto.randomUUID()};
if(requestId)await CheckinAPI.call('decide',{p_session:shared.id,p_owner:shared.owner,p_request:requestId,p_status:'approved'});else await CheckinAPI.call('custom_use',{p_session:shared.id,p_owner:shared.owner,p_use:manualAttempt.id,p_players:chosen});
counts=await publish(shared);if(state.checkin!==shared)throw Error('The active session changed. Refresh before trying again.');}
change(()=>{state.queue=nextOrder([],false).filter(id=>!chosen.includes(id)).concat(chosen);state.lineup=[...chosen];state.lineupAtBack=true;state.skipped=(state.skipped||[]).filter(id=>!chosen.includes(id));for(const id of chosen)player(id).customUsed=counts?counts[id]:(player(id).customUsed||0)+1;},'Custom lineup approved and queued last.');
for(const old of previous.players){const now=player(old.id);if(now)old.customUsed=now.customUsed||0;}
manualAttempt=null;if(shared)await publish(shared);return true;
}catch(e){$('lineup-error').textContent=e.message;message(e.message);return false;}}).finally(()=>{main.inert=false;});};
async function loadRequests(shared,closed){const requests=await CheckinAPI.call('requests',{p_session:shared.id,p_owner:shared.owner});if(state.checkin!==shared)return;requestsPanel.hidden=!requests.length;const list=$('player-requests');list.replaceChildren();
requests.forEach(r=>{const row=node('div','row'),info=node('div','person');info.append(node('div','name',`${player(r.requester)?.name||'Player'} requests a lineup`),node('p','helper',r.players.map(id=>player(id)?.name||'Unavailable player').join(', ')));row.append(info);
const eligible=()=>!closed&&!(state.lineup||[]).length&&r.players.length===4&&r.players.every(id=>state.queue.includes(id)&&(player(id).customUsed||0)<2);
for(const action of ['approved','declined']){const button=node('button',action==='approved'?'dark':'quiet',action==='approved'?'Approve · queue last':'Decline');button.disabled=action==='approved'&&!eligible();button.onclick=async()=>{if(button.disabled)return;button.disabled=true;try{if(action==='approved'){if(!eligible())return;await window.approveCustomLineup(r.players,r.id);}else await exclusive(()=>CheckinAPI.call('decide',{p_session:shared.id,p_owner:shared.owner,p_request:r.id,p_status:'declined'}));await exclusive(()=>loadRequests(shared,closed));}catch(e){message(e.message);}finally{button.disabled=false;}};row.append(button);}list.append(row);});}
$('share-stop').onclick=()=>{if($('share-stop').disabled||!state.checkin)return;$('share-stop').disabled=true;return exclusive(async()=>{const shared=state.checkin;if(!shared)return;
try{await CheckinAPI.call('close',{p_session:shared.id,p_owner:shared.owner});const received=await sync();if(received&&state.checkin===shared){delete state.checkin;guessCounts=null;previous=null;persist();render();show();}}
catch(e){message(e.message+' Check-in has not been closed.');}}).finally(()=>{$('share-stop').disabled=false;});};
$('share-copy').onclick=async()=>{try{await navigator.clipboard.writeText($('share-link').value);message('Join link copied.');}catch{$('share-link').select();message('Select and copy the join link above.');}};
const reset=$('reset').onclick;$('reset').onclick=()=>{if(state.checkin){message('Close QR check-in before resetting this session.');panel.scrollIntoView({behavior:'smooth'});return;}reset();};
window.addEventListener('storage',()=>{show();});
show();poll();setInterval(poll,5000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)poll();});
})();
