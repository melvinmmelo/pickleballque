'use strict';
window.CheckinAPI={
 configured(){const c=window.SIDEOUT_CONFIG;return !!(c&&/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(c.supabaseUrl)&&c.publishableKey.startsWith('sb_publishable_'));},
 async call(method,args){
  if(!this.configured())throw Error('QR check-in is not connected yet. Ask the organizer to add you manually.');
  const c=window.SIDEOUT_CONFIG;
  let response;try{response=await fetch(c.supabaseUrl+'/rest/v1/rpc/sideout_'+method,{method:'POST',headers:{apikey:c.publishableKey,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(15000)});}catch{throw Error('Cannot connect. Check your internet and try again.');}
  const data=await response.json().catch(()=>null);
  if(!response.ok)throw Error(data?.message||'Check-in service unavailable. Try again.');return data;
 }
};
