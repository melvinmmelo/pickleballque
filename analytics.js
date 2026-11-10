'use strict';
// Anonymous usage stats for the developer dashboard (analytics.html): page visits, seconds the page was on
// screen, and app actions. A random id per browser counts unique users; nothing else identifies anyone
// (no names, nicknames, or IP addresses are sent). Off when the visitor turns it off, when the browser asks
// not to be tracked (Do Not Track or Global Privacy Control), on local files, and on localhost previews.
window.SideoutStats=(()=>{
const OFF='sideout-stats-off',DEVICE='sideout-device',page=document.body.dataset.page;
const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const uuid=()=>{if(crypto.randomUUID)return crypto.randomUUID();const b=crypto.getRandomValues(new Uint8Array(16));b[6]=b[6]&15|64;b[8]=b[8]&63|128;const h=[...b].map(x=>x.toString(16).padStart(2,'0')).join('');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;};
const read=k=>{try{return localStorage.getItem(k);}catch{return null;}},write=(k,v)=>{try{v===null?localStorage.removeItem(k):localStorage.setItem(k,v);}catch{}};
const browserSaysNo=()=>navigator.globalPrivacyControl===true||navigator.doNotTrack==='1'||window.doNotTrack==='1';
const local=location.protocol==='file:'||(/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)&&!window.SIDEOUT_TRACK_LOCAL);
const config=window.SIDEOUT_CONFIG,reachable=!!(config&&/^https:\/\/[a-z0-9.-]+$/.test(config.supabaseUrl)&&config.publishableKey);
// Search-engine crawlers and automated browsers are not people; counting them would inflate users and visits.
const robot=!window.SIDEOUT_TRACK_LOCAL&&(navigator.webdriver===true||/bot|crawl|spider|slurp|headless|lighthouse|preview/i.test(navigator.userAgent));
const enabled=()=>!!page&&reachable&&!local&&!robot&&!browserSaysNo()&&read(OFF)!=='1';
let device=null;const visit=uuid(),queue=[];
function deviceId(){if(device)return device;const saved=read(DEVICE);device=ID.test(saved||'')?saved:uuid();write(DEVICE,device);return device;}
function track(kind,detail){if(!enabled())return;queue.push({kind,page,device:deviceId(),visit,...(detail?{detail}:{})});if(queue.length>=20)flush();}
// On-screen time: counted only while the page is visible, reported every minute and when the page is hidden.
let shownSince=document.hidden?null:performance.now(),pending=0;
function settle(){if(shownSince!==null){const now=performance.now();pending+=(now-shownSince)/1000;shownSince=now;}const s=Math.floor(Math.min(pending,3600));if(s>=1&&enabled()){pending-=s;queue.push({kind:'active',page,device:deviceId(),visit,seconds:s});}}
function flush(keepalive=false){if(!queue.length)return;const batch=queue.splice(0,25);if(!enabled())return;
  fetch(config.supabaseUrl+'/rest/v1/rpc/sideout_track',{method:'POST',keepalive,headers:{apikey:config.publishableKey,'Content-Type':'application/json'},body:JSON.stringify({p_events:batch})}).catch(()=>{});
  if(queue.length)flush(keepalive);}
function report(keepalive=false){settle();flush(keepalive);}
document.addEventListener('visibilitychange',()=>{if(document.hidden){report(true);shownSince=null;}else shownSince=performance.now();});
addEventListener('pagehide',()=>report(true));
setInterval(()=>report(),60000);
// Footer switch so anyone can turn stats off (or back on) for this browser.
function showSwitch(){const b=document.getElementById('stats-toggle');if(!b)return;b.hidden=false;
  if(browserSaysNo()){b.textContent='Usage stats are off (browser privacy setting)';b.disabled=true;return;}
  const off=read(OFF)==='1';b.textContent=off?'Turn on anonymous usage stats':'Turn off anonymous usage stats';b.setAttribute('aria-pressed',String(!off));}
document.addEventListener('click',e=>{if(e.target.id!=='stats-toggle')return;if(read(OFF)==='1'){write(OFF,null);}else{queue.length=0;pending=0;write(OFF,'1');write(DEVICE,null);device=null;}showSwitch();});
showSwitch();track('visit');
return {track,report,enabled};
})();
