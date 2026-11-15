'use strict';
// Landing page motion: the hero court is built and then rotates players like the real app; a phone counts down
// to a player's turn; the gym TV recolors with court presets and rotates sample sponsor banners.
// Every loop runs only while on screen. Reduced motion (or GSAP failing to load) shows still, complete scenes.
(()=>{
const $=id=>document.getElementById(id),el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
const motion=!!(window.gsap&&window.Flip)&&!matchMedia('(prefers-reduced-motion: reduce)').matches;
if(motion)gsap.registerPlugin(Flip);
const whenVisible=(node,onChange,threshold=.3)=>{if(!('IntersectionObserver' in window)){onChange(true);return;}new IntersectionObserver(([e])=>onChange(e.isIntersecting),{threshold}).observe(node);};

// Returning organizers see their saved session instead of a cold start.
try{const s=JSON.parse(localStorage.getItem('sideout-queue-v1')||'null');if(s&&Array.isArray(s.players)&&s.players.length){const n=s.players.length,c=Array.isArray(s.courts)?s.courts.length:1;
  $('start').textContent='Continue your session';$('saved').textContent=`${n} ${n===1?'player':'players'} and ${c} ${c===1?'court':'courts'} saved on this device.`;}}catch{}

// Hero: Court 1 and its On deck line.
const NAMES=['Din','Dindi','Melo','Billie','Ana','Bo','Cyrus','Dee','Eli','Fay','Gus','Hana'];
const demo=$('demo'),surface=$('demo-surface'),deck=$('demo-deck'),boxes=[...surface.querySelectorAll('.box')],stateEl=$('demo-state'),go=$('demo-go'),pauseBtn=$('demo-pause');
NAMES.slice(0,4).forEach((n,i)=>boxes[i].append(el('span','name',n)));NAMES.slice(4).forEach(n=>deck.append(el('span','name',n)));
let game=7,built=false,timer=null,paused=false,onScreen=false;
const running=()=>built&&!paused&&onScreen&&!document.hidden;
function schedule(seconds){clearTimeout(timer);timer=running()?setTimeout(press,seconds*1000):null;}
// Press "Finish game & rotate": the four on court go to the back of the line and the next four walk on.
function press(){timer=null;if(!running())return;stateEl.textContent=`Game ${game} counted`;
  gsap.timeline({onComplete:()=>{rotate();schedule(3.8);}}).to(go,{scale:.93,duration:.12,ease:'power2.out'}).to(go,{scale:1,duration:.3,ease:'back.out(3)'});}
function rotate(){const all=[...demo.querySelectorAll('.name')],before=Flip.getState(all),off=boxes.map(b=>b.firstElementChild),on=[...deck.children].slice(0,4);
  off.forEach(n=>deck.append(n));on.forEach((n,i)=>boxes[i].append(n));game++;stateEl.textContent=`Game ${game} in progress`;
  const moving=[...off,...on];moving.forEach(n=>n.classList.add('flying'));
  Flip.from(before,{targets:all,duration:.9,ease:'power3.inOut',stagger:.04,absolute:true,zIndex:5,onComplete:()=>moving.forEach(n=>n.classList.remove('flying'))});}
function courtLines(){const box=el('div','court-lines');for(const c of ['top','right','bottom','left','kl','kr','cl','cr'])box.append(el('span','ln '+c));return box;}
// The court is built the first time it comes into view: painted, kitchens filled, lines drawn, net raised, players walk on.
function build(){const lines=courtLines(),say=t=>()=>{stateEl.textContent=t;};surface.classList.add('building');surface.append(lines);
  gsap.timeline({defaults:{ease:'power2.out'},onComplete:()=>{surface.classList.remove('building');gsap.to(lines,{opacity:0,duration:.25,onComplete:()=>lines.remove()});stateEl.textContent=`Game ${game} in progress`;built=true;pauseBtn.hidden=false;schedule(2.4);}})
  .call(say('Painting the court…'),null,0)
  .fromTo(surface,{clipPath:'inset(0% 100% 0% 0%)'},{clipPath:'inset(0% 0% 0% 0%)',duration:.6,ease:'power1.inOut',clearProps:'clipPath'},.05)
  .from(surface.querySelectorAll('.kitchen'),{scaleX:0,duration:.35,clearProps:'transform'},.6)
  .call(say('Drawing the lines…'),null,.7)
  .from(lines.querySelectorAll('.top,.bottom'),{scaleX:0,duration:.16,stagger:.32,ease:'none'},.7)
  .from(lines.querySelectorAll('.right,.left'),{scaleY:0,duration:.16,stagger:.32,ease:'none'},.86)
  .from(lines.querySelectorAll('.kl,.kr'),{scaleY:0,duration:.28,stagger:.05},1.06)
  .from(lines.querySelectorAll('.cl,.cr'),{scaleX:0,duration:.28,stagger:.05},1.12)
  .call(say('Raising the net…'),null,1.3)
  .fromTo(surface,{'--net':0},{'--net':1,duration:.4,ease:'back.out(2)'},1.3)
  .from(boxes.map(b=>b.firstElementChild),{opacity:0,y:-12,duration:.4,stagger:.08,ease:'back.out(2)',clearProps:'all'},1.55)
  .from([...deck.children],{opacity:0,y:8,duration:.3,stagger:.04,clearProps:'all'},1.65);}
if(motion){whenVisible(demo,v=>{onScreen=v;if(v&&!built&&!demo.dataset.started){demo.dataset.started='1';build();}else if(v&&!timer)schedule(1.2);});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!timer)schedule(1.2);});
  pauseBtn.onclick=()=>{paused=!paused;pauseBtn.textContent=paused?'Play animation':'Pause animation';pauseBtn.setAttribute('aria-pressed',String(paused));if(!paused)schedule(.6);else{clearTimeout(timer);timer=null;}};}

// Players: the phone counts down to Fay's turn, then shows her on Court 2.
const STEPS=[
  {count:'2 games ahead',title:'Waiting for your turn',note:'Queue position 7. The organizer will call your game.',court:['Ana','Bo','Cyrus','Dee'],state:'Game in progress'},
  {count:'1 game ahead',title:'Waiting for your turn',note:'Queue position 3. Almost there.',court:['Eli','Gus','Hana','Ivo'],state:'Game in progress'},
  {count:'0 games ahead',title:'You’re up next',note:'A court is open. Wait for the organizer to start.',court:['','','',''],state:'Open'},
  {count:'Your turn',title:'You’re playing on Court 2',note:'Have a great game.',court:['Fay','Jules','Kai','Lia'],state:'Game in progress',me:0}];
const phoneParts=['ph-count','ph-title','ph-note'].map($),chips=['ph-a1','ph-a2','ph-b1','ph-b2'].map($);let step=0,phoneTimer=null,phoneOn=false;
// The waiting queue under the court shrinks as Fay moves up.
const QUEUES=[['Eli','Gus','Hana','Ivo','Jules','Kai','Fay'],['Jules','Kai','Fay','Lia'],['Fay','Jules','Kai','Lia'],['Mae','Nico','Oli']];
function showStep(i){const s=STEPS[i],q=$('ph-queue');q.replaceChildren(...QUEUES[i].slice(0,4).map((n,k)=>{const li=el('li',n==='Fay'?'me':'');li.append(el('span','',`${k+1}. ${n}`),el('span','',n==='Fay'?'3 games':'2 games'));return li;}));phoneParts[0].textContent=s.count;phoneParts[1].textContent=s.title;phoneParts[2].textContent=s.note;$('ph-court-state').textContent=s.state;
  chips.forEach((c,n)=>{c.textContent=s.court[n];c.classList.toggle('me',s.me===n);});}
function nextStep(){phoneTimer=null;if(!phoneOn||document.hidden)return;step=(step+1)%STEPS.length;
  gsap.timeline({onComplete:()=>{phoneTimer=setTimeout(nextStep,step===STEPS.length-1?3600:2400);}})
  .to([...phoneParts,...chips],{opacity:0,y:-8,duration:.22,stagger:.02,ease:'power1.in'})
  .call(()=>showStep(step))
  .fromTo([...phoneParts,...chips],{opacity:0,y:10},{opacity:1,y:0,duration:.35,stagger:.03,ease:'power2.out',clearProps:'all'});}
showStep(0);
if(motion)whenVisible(document.querySelector('.phone'),v=>{phoneOn=v;if(v&&!phoneTimer)phoneTimer=setTimeout(nextStep,1600);else if(!v){clearTimeout(phoneTimer);phoneTimer=null;}});

// Clubs: court color presets recolor the TV; sample sponsor banners take turns like the real strip.
const presets=window.SideoutBrand?.PRESETS||[{id:'classic',name:'Classic',colors:{court:'#2b5d8c',kitchen:'#3b74a6',apron:'#2e7553'}}];
const tv=$('tv'),swatches=$('swatches');
for(const p of presets){const b=el('button','swatch'),mini=el('span','mini');b.type='button';mini.style.setProperty('--c',p.colors.court);mini.style.setProperty('--k',p.colors.kitchen);mini.style.setProperty('--a',p.colors.apron);
  b.append(mini,el('span','',p.name));b.setAttribute('aria-pressed',String(p.id==='classic'));
  b.onclick=()=>{tv.style.setProperty('--court',p.colors.court);tv.style.setProperty('--kitchen',p.colors.kitchen);tv.style.setProperty('--apron',p.colors.apron);for(const x of swatches.children)x.setAttribute('aria-pressed',String(x===b));};
  swatches.append(b);}
const ads=[...$('tv-ads').children];let ad=0,adTimer=null;
if(motion)whenVisible(tv,v=>{clearInterval(adTimer);adTimer=v?setInterval(()=>{if(document.hidden)return;ads[ad].classList.remove('on');ad=(ad+1)%ads.length;ads[ad].classList.add('on');},3200):null;});
})();
