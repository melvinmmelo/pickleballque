// Organizer page structure: setup steps until the first game, tabs, the More menu, the attention strip,
// the floating QR code with Hide and Show, and the phone layout with the pinned Up next board.
const {chromium}=require('playwright'),{PGlite}=require('@electric-sql/pglite'),fs=require('fs'),http=require('http'),path=require('path'),assert=require('node:assert/strict');
const PARAMS={sideout_publish_live:['p_session','p_owner','p_state'],sideout_custom_use:['p_session','p_owner','p_use','p_players'],sideout_player_view:['p_session'],sideout_requests:['p_session','p_owner'],sideout_join_player:['p_session','p_id','p_name','p_secret'],sideout_my_requests:['p_session','p_id','p_secret'],sideout_request_lineup:['p_session','p_id','p_secret','p_request','p_players'],sideout_decide:['p_session','p_owner','p_request','p_status'],sideout_create:['p_session','p_owner','p_players'],sideout_poll:['p_session','p_owner'],sideout_close:['p_session','p_owner'],sideout_leave:['p_session','p_id','p_secret'],sideout_rejoin:['p_session','p_id','p_secret'],sideout_guess:['p_session','p_id','p_secret','p_game','p_team']};
(async()=>{
const db=new PGlite();await db.exec('create role anon;create role authenticated;');for(const f of ['session-checkin.sql','player-page.sql','nickname-hardening.sql','branding.sql','player-leave.sql','match-guesses.sql','player-rejoin.sql'])await db.exec(fs.readFileSync('supabase/'+f,'utf8'));await db.exec('set role anon');
const root=process.cwd(),server=http.createServer((req,res)=>{const u=new URL(req.url,'http://x').pathname;let file=u.startsWith('/vendor/')?u.slice(1):path.basename(u)||'app.html';if(file==='config.js'){res.setHeader('Content-Type','application/javascript');return res.end("window.SIDEOUT_CONFIG={supabaseUrl:'https://test.supabase.co',publishableKey:'sb_publishable_test'};");}try{res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.woff2')?'font/woff2':'text/html');res.end(fs.readFileSync(path.join(root,file)));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[];
async function context(opts={}){const c=await browser.newContext(opts);await c.route('https://test.supabase.co/rest/v1/rpc/*',async route=>{const m=route.request().url().split('/').pop(),a=route.request().postDataJSON();try{if(!PARAMS[m])throw Error('function public.'+m+' does not exist');const v=PARAMS[m].map(k=>typeof a[k]==='object'?JSON.stringify(a[k]):a[k]);const r=await db.query(`select public.${m}(${v.map((_,i)=>'$'+(i+1)).join(',')}) as data`,v);await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(r.rows[0].data)});}catch(e){await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({message:e.message})});}});return c;}
async function page(c){const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());p.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=400)errors.push(r.status()+' '+r.url());});return p;}
const p=await page(await context({viewport:{width:1280,height:900}}));await p.goto(base+'/app.html');
const add=async(...names)=>{for(const n of names){await p.locator('#nickname').fill(n);await p.locator('#add-form button').click();}};
const inside=(sel,parent)=>p.evaluate(([s,q])=>!!document.querySelector(q)?.querySelector(s),[sel,parent]);
const boxes=async(a,b)=>{const x=await p.locator(a).boundingBox(),y=await p.locator(b).boundingBox();return x.x<y.x+y.width&&y.x<x.x+x.width&&x.y<y.y+y.height&&y.y<x.y+x.height;};

// 1. A new session opens on three steps. The ways in and the courts sit inside them; Start unlocks at four players.
assert.equal(await p.locator('#start h1').textContent(),'Start your session');
assert.equal(await inside('#join','#slot-join-setup'),true);assert.equal(await inside('#courts','#slot-courts-setup'),true);
assert.equal(await p.locator('#courts .game-action').count(),0,'Courts have no Start button during setup');assert.equal(await p.locator('#start-first').isDisabled(),true);
assert.equal(await p.locator('#start-need').textContent(),'Needs 4 more players.');assert.equal(await p.locator('#next li.empty').textContent(),'Waiting for 4 more available players.');
await add('Ali','Bea','Cal');assert.equal(await p.locator('#start-need').textContent(),'Needs 1 more player.');assert.equal(await p.locator('#setup-count').textContent(),'3 players so far. The first four show on the Up next board.');
assert.deepEqual(await p.locator('#next .name').allTextContents(),['Ali','Bea','Cal']);
await p.locator('#add-court').click();assert.equal(await p.locator('#slot-courts-setup .court').count(),2,'Courts are added inside step 2');
await add('Dee','Eli');assert.equal(await p.locator('#start-need').textContent(),'Four players are ready.');assert.equal(await p.locator('#start-first').textContent(),'Start game on Court 1');

// 2. QR check-in from step 1: the code floats in the bottom right corner; Hide and Show work and are remembered.
assert.equal(await p.locator('#qr-float').isHidden(),true,'No floating code while check-in is off');
await p.locator('#share-start').click();await p.locator('#share-details').waitFor({state:'visible'});
assert.equal(await p.locator('#qr-float #share-qr svg').isVisible(),true);const spot=await p.locator('#qr-card').boundingBox();
assert(spot.x+spot.width>1280-40&&spot.y+spot.height>900-40,'The code sits in the bottom right corner');
await p.evaluate(()=>scrollTo(0,400));const moved=await p.locator('#qr-card').boundingBox();assert.equal(Math.round(moved.y),Math.round(spot.y),'It stays put while the page scrolls');await p.evaluate(()=>scrollTo(0,0));
await p.locator('#qr-hide').click();assert.equal(await p.locator('#qr-card').isHidden(),true);assert.equal(await p.locator('#qr-show').isVisible(),true);assert.equal(await p.locator('#qr-toggle').textContent(),'Show QR code');
await p.reload();assert.equal(await p.locator('#qr-card').isHidden(),true,'Hidden is remembered');assert.equal(await p.locator('#qr-show').isVisible(),true);
await p.locator('#qr-show').click();assert.equal(await p.locator('#qr-card').isVisible(),true);
await p.locator('#qr-size').click();assert((await p.locator('#share-qr').boundingBox()).width>250,'Enlarge makes the code bigger');await p.locator('#qr-size').click();
await p.locator('#qr-toggle').click();assert.equal(await p.locator('#qr-card').isHidden(),true,'The link in QR check-in hides it too');await p.locator('#qr-toggle').click();
const link=await p.locator('#share-link').inputValue();

// 3. Starting the first game moves to the live layout: courts on stage, the ways in under the Players tab.
await p.locator('#start-first').click();assert.equal(await p.locator('#start').isHidden(),true);
assert.equal(await inside('#join','#slot-join-live'),true);assert.equal(await inside('#courts','#slot-courts-live'),true);
assert.deepEqual(await p.locator('[data-court="1"] .player-chip').allTextContents(),['Ali','Bea','Cal','Dee']);assert.equal(await p.locator('[data-court="2"] .game-action').textContent(),'Start game');
assert.equal(await p.locator('#count-players').textContent(),'5');assert.equal(await p.locator('#deck-h').textContent(),'Up next');
assert.equal(await boxes('#up-next','#qr-card'),false,'The Up next board stops short of the floating code');
await p.locator('#undo').click();assert.equal(await p.locator('#start').isVisible(),true,'Undo of the first start returns to setup');await p.locator('#start-first').click();

// 4. Tabs: Players by default, Results and Saved sessions one tap away, arrow keys move between them.
assert.equal(await p.locator('#panel-players').isVisible(),true);assert.equal(await p.locator('#panel-results').isHidden(),true);
await p.locator('#tab-results').click();assert.equal(await p.locator('#panel-results').isVisible(),true);assert.equal(await p.locator('#panel-players').isHidden(),true);assert.equal(await p.locator('#tab-results').getAttribute('aria-selected'),'true');
await p.keyboard.press('ArrowRight');assert.equal(await p.locator('#panel-saved').isVisible(),true);assert.equal(await p.evaluate(()=>document.activeElement.id),'tab-saved');assert.equal(await p.locator('#archive-form').isVisible(),true);
await p.keyboard.press('ArrowRight');assert.equal(await p.locator('#panel-players').isVisible(),true,'Arrow keys wrap around');

// 5. More menu: Customize, Feedback and Reset session live there; it closes on Escape, on a tap elsewhere, and after a choice.
assert.equal(await p.locator('#more-menu').isHidden(),true);assert.equal(await p.locator('#reset').isHidden(),true);
await p.locator('#more').click();assert.equal(await p.locator('#more').getAttribute('aria-expanded'),'true');
assert.deepEqual(await p.locator('#more-menu button:visible').allTextContents().then(t=>t.filter(x=>!/usage stats/i.test(x))),['Customize','Feedback','Reset session']);
await p.keyboard.press('Escape');assert.equal(await p.locator('#more-menu').isHidden(),true);
await p.locator('#more').click();await p.locator('h2#deck-h').click();assert.equal(await p.locator('#more-menu').isHidden(),true);
await p.locator('#more').click();await p.locator('#feedback-open').click();await p.locator('#feedback-dialog').waitFor({state:'visible'});assert.equal(await p.locator('#more-menu').isHidden(),true);await p.keyboard.press('Escape');

// 6. Needs attention: a player who leaves from their phone shows above the courts; Return brings them back; a rejoin is noted too.
const g=await page(await context());await g.goto(link);await g.locator('#join-name').fill('Fay');await g.locator('#join-button').click();await g.getByText(/checked in as Fay/).waitFor();
await p.waitForFunction(()=>state.players.length===6,null,{timeout:15000});
const leave=async()=>{await g.locator('#refresh').click();await g.waitForFunction(()=>!document.getElementById('leave-box').hidden&&!document.getElementById('leave-button').disabled,null,{timeout:15000});await g.locator('#leave-button').click();};
await leave();await p.locator('#alerts .notice-row').waitFor({timeout:15000});
assert.equal(await p.locator('#alerts .notice-row .what').textContent(),'Fay left the session from their phone. Games played still count.');
assert((await p.locator('#alerts').boundingBox()).y<(await p.locator('#courts').boundingBox()).y,'The strip sits above the courts');
await p.getByRole('button',{name:'Return to queue: Fay',exact:true}).click();assert.equal(await p.locator('#alerts .notice-row').count(),0);assert.deepEqual(await p.evaluate(()=>state.queue.map(id=>player(id).name)),['Eli','Fay']);
await leave();await p.locator('#alerts .notice-row').waitFor({timeout:15000});await p.getByRole('button',{name:'OK: Fay',exact:true}).click();assert.equal(await p.locator('#alerts .notice-row').count(),0,'OK dismisses the note');
assert.deepEqual(await p.evaluate(()=>(state.left||[]).map(id=>player(id).name)),['Fay'],'OK leaves the player as Left');
await g.locator('#refresh').click();await g.locator('#rejoin-button').waitFor({state:'visible',timeout:15000});await g.locator('#rejoin-button').click();
await p.getByText('Fay rejoined from their phone and is at the end of the queue.').waitFor({timeout:15000});await p.getByRole('button',{name:'OK: Fay',exact:true}).click();

// 7. Score entry is tucked behind Add score, so courts stay short.
const height=async()=>(await p.locator('[data-court="1"]').boundingBox()).height,short=await height();
await p.locator('[data-court="1"]').getByRole('button',{name:'Add score',exact:true}).click();assert((await height())>short+60);
await p.locator('[data-court="1"]').getByRole('button',{name:'Hide score',exact:true}).click();assert.equal(Math.round(await height()),Math.round(short));

// 8. Phone: the Up next board is pinned to the bottom with the next four; Show queue opens the rest; nothing scrolls sideways.
await p.setViewportSize({width:390,height:844});await p.waitForFunction(()=>!document.querySelector('.flying'));
const bar=await p.locator('#up-next').boundingBox();assert(Math.abs(bar.y+bar.height-844)<2&&bar.height<200,'Pinned to the bottom, and small');
assert.equal(await p.locator('#lineup-editor').isHidden(),true);assert.equal(await p.locator('#next .skip').first().isHidden(),true);
await p.locator('#next-toggle').click();assert.equal(await p.locator('#lineup-editor').isVisible(),true);assert.equal(await p.locator('#next .skip').first().isVisible(),true);assert.equal(await p.locator('#next-toggle').textContent(),'Hide queue');assert.equal(await p.locator('#qr-float').isHidden(),true,'The code steps aside for the open queue');
await p.locator('#next-toggle').click();assert.equal(await boxes('#up-next','#qr-float'),false,'The code sits above the pinned board');
assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No sideways scroll on phones');

// 9. On a phone the code starts tucked away, so it never covers the court buttons unasked. The #saved link opens that tab.
const m=await page(await context({viewport:{width:390,height:844}}));await m.goto(base+'/app.html#saved');assert.equal(await m.locator('#panel-saved').isVisible(),true);
await m.locator('#tab-players').click();for(const n of ['A','B','C','D']){await m.locator('#nickname').fill(n);await m.locator('#add-form button').click();}
assert.equal(await m.locator('#up-next').isVisible(),true,'The pinned board appears once players are waiting');
await m.locator('#share-start').click();await m.locator('#share-details').waitFor({state:'visible'});
assert.equal(await m.locator('#qr-card').isHidden(),true);assert.equal(await m.locator('#qr-show').isVisible(),true);await m.locator('#qr-show').click();assert.equal(await m.locator('#qr-card').isVisible(),true);
assert(await m.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));

assert.deepEqual(errors,[]);await browser.close();await db.close();await new Promise(r=>server.close(r));
console.log('PASS setup steps until the first game, floating QR with Hide Show and Enlarge, live layout, tabs, More menu, attention strip with Return and OK, score entry on demand, pinned Up next on phones, phone QR starts tucked away');
})().catch(e=>{console.error(e);process.exit(1);});
