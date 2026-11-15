// Landing page: hero court demo, pause and reduced motion, returning organizers, QR redirect, presets, phone, links.
const {chromium}=require('playwright'),fs=require('fs'),http=require('http'),path=require('path'),assert=require('node:assert/strict');
(async()=>{
const root=process.cwd(),server=http.createServer((req,res)=>{const u=new URL(req.url,'http://x').pathname;let file=u.startsWith('/vendor/')?u.slice(1):path.basename(u)||'index.html';if(file==='config.js'){res.setHeader('Content-Type','application/javascript');return res.end("window.SIDEOUT_CONFIG={supabaseUrl:'https://test.supabase.co',publishableKey:'sb_publishable_test'};");}try{res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.woff2')?'font/woff2':'text/html');res.end(fs.readFileSync(path.join(root,file)));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[];
async function page(opts={},seed){const c=await browser.newContext(opts);await c.route('https://test.supabase.co/**',r=>r.fulfill({status:400,contentType:'application/json',body:'{"message":"offline"}'}));if(seed)await c.addInitScript(s=>{if(!sessionStorage.getItem('seeded')){localStorage.setItem('sideout-queue-v1',s);sessionStorage.setItem('seeded','1');}},JSON.stringify(seed));const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=400)errors.push(r.status()+' '+r.url());});return p;}
const courtNames=p=>p.locator('#demo-surface .name').allTextContents();

// 1. The hero court is built, then rotates players the way the app does. Links point at the app.
const p=await page({viewport:{width:1280,height:900}});await p.goto(base+'/');
assert.equal(await p.locator('#start').getAttribute('href'),'app.html');assert.equal(await p.locator('.site .btn').getAttribute('href'),'app.html');assert.equal(await p.locator('#start').textContent(),'Start a session');
const stages=new Set();for(let i=0;i<70&&!(await p.locator('#demo-pause').isVisible());i++){stages.add(await p.locator('#demo-state').textContent());await p.waitForTimeout(40);}
for(const s of ['Painting the court…','Drawing the lines…','Raising the net…'])assert(stages.has(s),'missing stage '+s);
// The demo keeps rotating, so read one settled moment (game number, court and line together) rather than waiting for an exact game.
// A slow machine can arrive after Game 8 has already gone by.
const NAMES=['Din','Dindi','Melo','Billie','Ana','Bo','Cyrus','Dee','Eli','Fay','Gus','Hana'],four=k=>NAMES.slice(4*k%12,4*k%12+4);
const snap=await (await p.waitForFunction(()=>{const m=/^Game (\d+) in progress$/.exec(document.getElementById('demo-state').textContent);if(!m||+m[1]<8||document.querySelector('#demo .flying'))return null;
return {game:+m[1],court:[...document.querySelectorAll('#demo-surface .name')].map(n=>n.textContent),deck:[...document.querySelectorAll('#demo-deck .name')].map(n=>n.textContent)};},null,{timeout:20000})).jsonValue();
assert.deepEqual(snap.court,four(snap.game-7),'Next four walk on');assert.deepEqual(snap.deck.slice(-4),four(snap.game-8),'Finishing four go to the back');assert.equal(snap.deck.length,8);
// 2. Pause holds the court still; Play resumes.
await p.getByRole('button',{name:'Pause animation',exact:true}).click();const held=await p.locator('#demo-state').textContent();await p.waitForTimeout(6500);assert.equal(await p.locator('#demo-state').textContent(),held,'Paused demo does not rotate');
await p.getByRole('button',{name:'Play animation',exact:true}).click();await p.waitForFunction(h=>!document.getElementById('demo-state').textContent.startsWith(h.slice(0,7))||document.getElementById('demo-state').textContent!==h,held,{timeout:8000});
// 3. Court color presets recolor the TV; the phone counts down when it scrolls into view.
await p.locator('#clubs').scrollIntoViewIfNeeded();await p.getByRole('button',{name:'Red clay'}).click();
assert.equal(await p.evaluate(()=>getComputedStyle(document.getElementById('tv')).getPropertyValue('--court').trim()),'#a4473a');assert.equal(await p.getByRole('button',{name:'Red clay'}).getAttribute('aria-pressed'),'true');
await p.locator('.phone').scrollIntoViewIfNeeded();await p.waitForFunction(()=>document.getElementById('ph-count').textContent==='1 game ahead',null,{timeout:8000});
// 4. Phone layout.
await p.setViewportSize({width:390,height:844});await p.waitForTimeout(300);assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No sideways scroll on phones');

// 5. Reduced motion: a still, complete court; no pause button, nothing flies.
const r=await page({viewport:{width:1280,height:900},reducedMotion:'reduce'});await r.goto(base+'/');await r.waitForTimeout(3000);
assert.deepEqual(await courtNames(r),['Din','Dindi','Melo','Billie']);assert.equal(await r.locator('#demo-pause').isHidden(),true);assert.equal(await r.locator('#demo-state').textContent(),'Game 7 in progress');assert.equal(await r.locator('.court-lines').count(),0);

// 6. Returning organizers see their session; anyone mid-QR-session goes straight back to the app.
const session={players:[{id:'a',name:'Ana',games:1},{id:'b',name:'Bo',games:0}],queue:['a','b'],courts:[{id:1,current:[]},{id:2,current:[]}],completed:1};
const back=await page({},session);await back.goto(base+'/');assert.equal(await back.locator('#start').textContent(),'Continue your session');assert.equal(await back.locator('#saved').textContent(),'2 players and 2 courts saved on this device.');
const live=await page({},{...session,checkin:{id:'00000000-0000-4000-8000-000000000000',owner:'x'.repeat(64),seen:[]}});await live.goto(base+'/');await live.waitForURL(/app\.html$/);
await live.goto(base+'/index.html?home');assert.equal(await live.locator('h1').textContent(),'Fair open play on every court.','?home keeps the landing page');

// 7. Share your ideas opens the app's Feedback form with the topic filled in.
const ideas=await page();await ideas.goto(base+'/app.html#tournament-ideas');await ideas.locator('#feedback-dialog').waitFor({state:'visible'});
assert.equal(await ideas.locator('#feedback-message').inputValue(),'Tournament mode idea: ');assert.equal(new URL(ideas.url()).hash,'','The link hash is cleared');

assert.deepEqual(errors,[]);await browser.close();await new Promise(r=>server.close(r));
console.log('PASS landing hero builds and rotates, pause and play, presets recolor the TV, phone countdown, phone layout, reduced motion still, returning organizers, QR redirect and ?home, Share your ideas link');
})().catch(e=>{console.error(e);process.exit(1);});
