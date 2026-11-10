'use strict';
// Feedback, bug reports, and star ratings from the organizer and player pages, read on the developer dashboard.
// Sends the message, an optional rating and contact, and a few technical details (page, app version, browser,
// screen size, and on the organizer page the number of courts and players). Player names are never sent.
(()=>{
const page=document.body.dataset.page,opener=document.getElementById('feedback-open');if(!page||!opener)return;
const STAR='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4L2.8 9.5l6.4-.8z"/></svg>';
const WORDS=['No rating yet','Poor','Fair','Good','Very good','Excellent'];
const dialog=document.createElement('dialog');dialog.id='feedback-dialog';dialog.setAttribute('aria-labelledby','feedback-title');
dialog.innerHTML='<form id="feedback-form" novalidate>'
 +'<div class="fb-head"><h2 id="feedback-title">Send feedback</h2><button type="button" class="fb-close" id="feedback-close">Close</button></div>'
 +'<fieldset class="fb-kind"><legend class="sr-only">What would you like to send?</legend><label><input type="radio" name="fb-kind" value="feedback" checked>Feedback</label><label><input type="radio" name="fb-kind" value="bug">Report a bug</label></fieldset>'
 +'<fieldset class="fb-rating" id="feedback-rating"><legend>How would you rate Sideout?</legend><div class="fb-stars">'
 +[1,2,3,4,5].map(n=>'<label><input type="radio" name="fb-rating" value="'+n+'" class="sr-only"><span class="sr-only">'+n+(n===1?' star':' stars')+'</span>'+STAR+'</label>').join('')
 +'</div><span class="fb-rating-text" id="feedback-rating-text">'+WORDS[0]+'</span></fieldset>'
 +'<label class="fb-label" for="feedback-message" id="feedback-message-label">What’s on your mind?</label><textarea id="feedback-message" maxlength="2000" rows="5"></textarea>'
 +'<label class="fb-label" for="feedback-contact">Email or phone, if you’d like a reply (optional)</label><input id="feedback-contact" maxlength="120" autocomplete="email">'
 +'<div class="fb-trap" aria-hidden="true"><label>Website<input id="feedback-website" tabindex="-1" autocomplete="off"></label></div>'
 +'<p class="fb-note">To help fix problems, the page, app version, browser and screen size are included. Player names are never sent.</p>'
 +'<p class="fb-status" id="feedback-status" role="status"></p><div class="fb-actions"><button class="fb-send" id="feedback-send">Send feedback</button></div></form>';
document.body.append(dialog);
const $=id=>document.getElementById(id),form=$('feedback-form'),say=t=>{$('feedback-status').textContent=t;};
const kind=()=>form.querySelector('input[name="fb-kind"]:checked').value,rating=()=>Number(form.querySelector('input[name="fb-rating"]:checked')?.value)||null;
function showKind(){const bug=kind()==='bug';$('feedback-title').textContent=bug?'Report a bug':'Send feedback';$('feedback-rating').hidden=bug;
  $('feedback-message-label').textContent=bug?'What went wrong? What were you doing, and what did you expect?':'What’s on your mind?';$('feedback-send').textContent=bug?'Send report':'Send feedback';}
function showStars(){const r=rating()||0;form.querySelectorAll('.fb-stars label').forEach((l,i)=>l.classList.toggle('on',i<r));$('feedback-rating-text').textContent=WORDS[r];}
form.addEventListener('change',e=>{if(e.target.name==='fb-kind')showKind();if(e.target.name==='fb-rating')showStars();say('');});
const version=(document.querySelector('script[src*="feedback.js"]')?.getAttribute('src').match(/[?&]v=([^&]+)/)||[])[1]||'';
const context=()=>({version,browser:navigator.userAgent.slice(0,200),screen:`${innerWidth}x${innerHeight}`,...(typeof window.sideoutDiagnostics==='function'?window.sideoutDiagnostics():{})});
form.onsubmit=async e=>{e.preventDefault();const message=$('feedback-message').value.trim(),contact=$('feedback-contact').value.trim(),bug=kind()==='bug';
  if(bug&&message.length<10){say('Describe what went wrong in at least 10 characters.');$('feedback-message').focus();return;}
  if(!bug&&!message&&!rating()){say('Choose a star rating or write a message.');return;}
  // Bots fill the hidden field; they get a thank-you and nothing is sent.
  if($('feedback-website').value){finish();return;}
  if(location.protocol==='file:'||!window.CheckinAPI?.configured()){say('Feedback needs the online version of Sideout. Open the website and try again.');return;}
  $('feedback-send').disabled=true;say('Sending…');
  try{await CheckinAPI.call('feedback',{p_kind:kind(),p_rating:bug?null:rating(),p_message:message||null,p_contact:contact||null,p_page:page,p_context:context()});finish();}
  catch(err){say(/could not find|does not exist|schema cache/i.test(err.message)?'Feedback isn’t available yet. Please try again later.':err.message);}
  finally{$('feedback-send').disabled=false;}};
function finish(){const bug=kind()==='bug';form.reset();showKind();showStars();say(bug?'Thanks! Your bug report was sent.':'Thanks! Your feedback was sent.');}
$('feedback-close').onclick=()=>dialog.close();
opener.onclick=()=>{say('');dialog.showModal();};
})();
