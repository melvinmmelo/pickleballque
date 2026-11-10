'use strict';
// A dismissible announcement at the top of the organizer and player pages. Change ID to show a new one;
// a dismissal is remembered per announcement in this browser.
(()=>{
const ID='tournament-2026-11',KEY='sideout-announcement-dismissed',main=document.querySelector('main');if(!main)return;
try{if(localStorage.getItem(KEY)===ID)return;}catch{}
const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
const box=el('section','announcement');box.id='announcement-bar';box.setAttribute('aria-label','Announcement');
const text=el('p','announce-text');text.append(el('span','announce-tag','Coming soon'),el('strong','','Tournament mode is on its way to Sideout.'),' Round robins, brackets and standings for club play. Tell us what you’d like it to do.');
const actions=el('div','announce-actions'),ideas=el('button','announce-ideas','Share your ideas'),dismiss=el('button','announce-dismiss','Dismiss');
ideas.type=dismiss.type='button';dismiss.setAttribute('aria-label','Dismiss the tournament mode announcement');
// Opens the Feedback form with the topic filled in, so suggestions arrive on the developer dashboard.
ideas.onclick=()=>{const opener=document.getElementById('feedback-open');if(!opener)return;opener.click();
  const kind=document.querySelector('input[name="fb-kind"][value="feedback"]');if(kind&&!kind.checked){kind.checked=true;kind.dispatchEvent(new Event('change',{bubbles:true}));}
  const msg=document.getElementById('feedback-message');if(msg){if(!msg.value)msg.value='Tournament mode idea: ';msg.focus();msg.setSelectionRange(msg.value.length,msg.value.length);}};
dismiss.onclick=()=>{try{localStorage.setItem(KEY,ID);}catch{}box.remove();};
if(!document.getElementById('feedback-open'))ideas.hidden=true;
actions.append(ideas,dismiss);box.append(text,actions);main.prepend(box);
})();
