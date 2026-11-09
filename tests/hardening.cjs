// Regression tests for ways the app was broken on 2026-11-09: hostile nicknames, dropped clicks,
// lost lineup drafts, unreadable saved data, and phones with wrong clocks.
const {chromium}=require('playwright'),{PGlite}=require('@electric-sql/pglite'),fs=require('fs'),http=require('http'),path=require('path'),assert=require('node:assert/strict');
const PARAMS={sideout_publish_live:['p_session','p_owner','p_state'],sideout_custom_use:['p_session','p_owner','p_use','p_players'],sideout_publish:['p_session','p_owner','p_state'],sideout_player_view:['p_session'],sideout_requests:['p_session','p_owner'],sideout_join_player:['p_session','p_id','p_name','p_secret'],sideout_my_requests:['p_session','p_id','p_secret'],sideout_request_lineup:['p_session','p_id','p_secret','p_request','p_players'],sideout_decide:['p_session','p_owner','p_request','p_status'],sideout_create:['p_session','p_owner','p_players'],sideout_poll:['p_session','p_owner'],sideout_join:['p_session','p_id','p_name'],sideout_close:['p_session','p_owner']};
(async()=>{
const db=new PGlite();await db.exec('create role anon;create role authenticated;');
for(const f of ['session-checkin.sql','player-page.sql','nickname-hardening.sql'])await db.exec(fs.readFileSync('supabase/'+f,'utf8'));
await db.exec('set role anon');
const root=process.cwd(),server=http.createServer((req,res)=>{let file=path.basename(new URL(req.url,'http://localhost').pathname)||'index.html';if(req.url.startsWith('/vendor/'))file='vendor/'+file;if(file==='config.js'){res.setHeader('Content-Type','application/javascript');return res.end("window.SIDEOUT_CONFIG={supabaseUrl:'https://test.supabase.co',publishableKey:'sb_publishable_test'};");}try{res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(path.join(root,file)));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[];let pollDelay=0;
async function context(){const c=await browser.newContext();await c.route('https://test.supabase.co/rest/v1/rpc/*',async route=>{const method=route.request().url().split('/').pop(),args=route.request().postDataJSON();if(pollDelay&&method==='sideout_poll')await new Promise(r=>setTimeout(r,pollDelay));try{const v=PARAMS[method].map(k=>typeof args[k]==='object'?JSON.stringify(args[k]):args[k]);const r=await db.query(`select public.${method}(${v.map((_,i)=>'$'+(i+1)).join(',')}) as data`,v);await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(r.rows[0].data)});}catch(e){await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({message:e.message})});}});return c;}
async function page(c){const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());return p;}
async function organizer(names){const p=await page(await context());await p.goto(base);for(const n of names){await p.locator('#nickname').fill(n);await p.locator('#add-form button').click();}await p.locator('#share-start').click();await p.locator('#share-details').waitFor({state:'visible'});return p;}
const join=async(session,name)=>db.query('select public.sideout_join_player($1,$2,$3,$4) as data',[session,crypto.randomUUID(),name,'z'.repeat(64)]);
const names=p=>p.evaluate(()=>state.players.map(x=>x.name));

// 1. The server rejects nicknames with no visible character and normalizes spacing.
const s1=crypto.randomUUID();await db.query('select public.sideout_create($1,$2,$3)',[s1,'a'.repeat(64),'[]']);
for(const bad of [' ','﻿','​','   ﻿ ','　'])await assert.rejects(join(s1,bad),/1–30 characters/,JSON.stringify(bad));
assert.equal((await join(s1,'  Ana  Lee ')).rows[0].data.name,'Ana Lee');
assert.equal((await join(s1,'\u{1F468}‍\u{1F469}')).rows[0].data.name,'\u{1F468}‍\u{1F469}');

// 2. Even if an unpatched server lets one through, a blank arrival cannot corrupt the organizer's saved session.
{const p=await organizer(['Ali','Bea','Cal','Dee','Eve']);const session=await p.evaluate(()=>state.checkin.id);
await db.exec('reset role');await db.query('insert into sideout_private.arrivals(session_id,id,nickname) values($1,$2,$3)',[session,crypto.randomUUID(),' ']);await db.exec('set role anon');
await join(session,'Fay');await p.waitForFunction(()=>state.players.length===6,null,{timeout:15000});
await p.reload();assert.deepEqual(await names(p),['Ali','Bea','Cal','Dee','Eve','Fay']);assert.equal(await p.locator('#notice').isHidden(),true);assert.equal(await p.evaluate(()=>!!state.checkin),true);
await p.context().close();}

// 3. A session already holding a blank name loads (with a placeholder) instead of being discarded.
{const p=await page(await context());await p.goto(base);
await p.evaluate(()=>localStorage.setItem('sideout-queue-v1',JSON.stringify({players:[{id:'a',name:' ',games:3},{id:'b',name:'Bo',games:1}],queue:['a','b'],courts:[{id:1,current:[]}],completed:2})));
await p.reload();assert.deepEqual(await names(p),['Player 1','Bo']);assert.equal(await p.evaluate(()=>state.players[0].games),3);
// 4. Truly unreadable data is copied aside before anything can overwrite it.
await p.evaluate(()=>localStorage.setItem('sideout-queue-v1','{"players":"oops"}'));await p.reload();
assert.match(await p.locator('#notice').textContent(),/kept in this browser/);await p.locator('#nickname').fill('New');await p.locator('#add-form button').click();
assert.equal(await p.evaluate(()=>localStorage.getItem('sideout-queue-v1-unreadable')),'{"players":"oops"}');
// 5. A saved session this page cannot read survives saving a new one.
const odd={id:'x',name:'From a newer version',savedAt:'2026-11-01T00:00:00.000Z',snapshot:{players:'?'}};
await p.evaluate(odd=>localStorage.setItem('sideout-archives-v1',JSON.stringify([odd])),odd);await p.reload();
await p.locator('#archive-name').fill('Tonight');await p.locator('#archive-save').click();await p.getByText(/Saved in this browser/).waitFor();
const stored=await p.evaluate(()=>JSON.parse(localStorage.getItem('sideout-archives-v1')));assert.deepEqual(stored.map(a=>a.name).sort(),['From a newer version','Tonight']);
await p.context().close();}

// 6. Clicking "Queue lineup last" while a sync request is in flight waits for it instead of doing nothing.
{const p=await organizer(['Ali','Bea','Cal','Dee','Eve']);const ids=await p.evaluate(()=>state.players.map(x=>x.id));await p.locator('summary').click();
for(let i=0;i<4;i++)await p.locator(`[name=slot${i}]`).selectOption(ids[i]);
pollDelay=2500;await p.waitForRequest(r=>r.url().endsWith('sideout_poll'),{timeout:10000});await p.locator('#save-lineup').click();
await p.waitForFunction(()=>state.lineup?.length===4,null,{timeout:15000});pollDelay=0;
assert.deepEqual(await p.evaluate(()=>state.queue),[ids[4],...ids.slice(0,4)]);
// Re-submitting the same queued lineup is a no-op, not a second charge.
await p.locator('summary').click();await p.locator('#save-lineup').click();await p.waitForTimeout(500);
assert.deepEqual(await p.evaluate(()=>state.players.slice(0,4).map(x=>x.customUsed)),[1,1,1,1]);
const session=await p.evaluate(()=>state.checkin.id),counts=(await db.query('select public.sideout_player_view($1) as data',[session])).rows[0].data.counts;assert.deepEqual(ids.slice(0,4).map(id=>counts[id]),[1,1,1,1]);
await p.context().close();}

// 7. A half-finished custom lineup survives new arrivals re-rendering the page.
{const p=await organizer(['Ali','Bea','Cal','Dee','Eve']);const ids=await p.evaluate(()=>state.players.map(x=>x.id));await p.locator('summary').click();
await p.locator('[name=slot0]').selectOption(ids[2]);await p.locator('[name=slot1]').selectOption(ids[3]);
await join(await p.evaluate(()=>state.checkin.id),'Fay');await p.waitForFunction(()=>state.players.length===6,null,{timeout:15000});
assert.deepEqual(await p.locator('#lineup-fields select').evaluateAll(s=>s.map(x=>x.value)),[ids[2],ids[3],'','']);
await p.context().close();}

// 8. A player whose phone clock is 90 seconds fast still sees a live view and can send requests.
{const p=await organizer(['Ali','Bea','Cal','Dee','Eve']);const link=await p.locator('#share-link').inputValue(),c=await context();
await c.addInitScript(()=>{const real=Date.now.bind(Date);Date.now=()=>real()+90000;});const g=await page(c);await g.goto(link);
await g.locator('#join-name').fill('Fay');await g.locator('#join-button').click();await g.getByText(/checked in as Fay/).waitFor();
await p.waitForFunction(()=>state.players.length===6,null,{timeout:15000});await g.getByText(/^Live queue/).waitFor({timeout:15000});
assert.equal(await g.locator('#request-send').isDisabled(),false);
await c.close();await p.context().close();}

assert.deepEqual(errors,[]);await browser.close();await db.close();await new Promise(r=>server.close(r));
console.log('PASS invisible nicknames rejected and harmless, damaged sessions repaired or preserved, unreadable archives kept, clicks during sync honored, no double charge, lineup draft kept, clock-skewed phones stay live');
})().catch(e=>{console.error(e);process.exit(1);});
