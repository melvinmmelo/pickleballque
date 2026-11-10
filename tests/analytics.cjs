// Anonymous usage analytics: server validation, what the pages send (and don't), opt-outs, and the developer dashboard.
const {chromium}=require('playwright'),{PGlite}=require('@electric-sql/pglite'),fs=require('fs'),http=require('http'),path=require('path'),assert=require('node:assert/strict'),{createHash}=require('crypto');
const PARAMS={sideout_publish_live:['p_session','p_owner','p_state'],sideout_custom_use:['p_session','p_owner','p_use','p_players'],sideout_player_view:['p_session'],sideout_requests:['p_session','p_owner'],sideout_join_player:['p_session','p_id','p_name','p_secret'],sideout_my_requests:['p_session','p_id','p_secret'],sideout_create:['p_session','p_owner','p_players'],sideout_poll:['p_session','p_owner'],sideout_close:['p_session','p_owner'],sideout_archive_save:['p_id','p_owner','p_name','p_snapshot'],sideout_track:['p_events'],sideout_analytics:['p_key','p_days']};
const KEY='d'.repeat(64);
async function database(withAnalytics){const db=new PGlite();await db.exec('create role anon;create role authenticated;');for(const f of ['session-checkin.sql','session-archives.sql','player-page.sql','nickname-hardening.sql','branding.sql','player-leave.sql','match-guesses.sql','sponsors.sql',...(withAnalytics?['analytics.sql']:[])])await db.exec(fs.readFileSync('supabase/'+f,'utf8'));
  if(withAnalytics)await db.query("insert into sideout_private.settings(key,value) values('analytics_key_hash',$1)",[createHash('sha256').update(KEY).digest('hex')]);await db.exec('set role anon');return db;}
(async()=>{
const db=await database(true),oldDb=await database(false);const id=()=>crypto.randomUUID();

// 1. Server: malformed events are skipped, time is capped, reading needs the developer key, the table is private.
const d=id(),v=id();await db.query('select public.sideout_track($1)',[JSON.stringify([{kind:'visit',page:'organizer',device:d,visit:v},{kind:'active',page:'organizer',device:d,visit:v,seconds:99999},{kind:'hack',page:'organizer',device:d,visit:v},{kind:'visit',page:'admin',device:d,visit:v},{kind:'visit',page:'player',device:'x',visit:v},{kind:'brand_changed',page:'organizer',device:d,visit:v,detail:'<b>'}])]);
await db.query('select public.sideout_track($1)',[JSON.stringify(Array(26).fill({kind:'visit',page:'player',device:d,visit:v}))]);
await assert.rejects(db.query('select public.sideout_analytics($1,30)',['nope']),/Invalid analytics key/);await assert.rejects(db.query('select * from sideout_private.events'));
let r=(await db.query('select public.sideout_analytics($1,30) as d',[KEY])).rows[0].d;
assert.equal(r.visits,1);assert.equal(r.activeSeconds,3600,'Seconds capped at an hour');assert.deepEqual(r.customizations,{other:1});assert.deepEqual(r.actions,{brand_changed:1});
await db.exec('reset role');await db.exec('delete from sideout_private.events');await db.exec('set role anon');

const root=process.cwd(),server=http.createServer((req,res)=>{const u=new URL(req.url,'http://x').pathname;let file=u.startsWith('/vendor/')?u.slice(1):path.basename(u)||'index.html';if(file==='config.js'){res.setHeader('Content-Type','application/javascript');return res.end("window.SIDEOUT_CONFIG={supabaseUrl:'https://test.supabase.co',publishableKey:'sb_publishable_test'};");}try{res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.woff2')?'font/woff2':'text/html');res.end(fs.readFileSync(path.join(root,file)));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[],sent=[];
async function context(on,{track=true,gpc=false}={}){const c=await browser.newContext();await c.addInitScript(([t,g])=>{if(t)window.SIDEOUT_TRACK_LOCAL=true;if(g)Object.defineProperty(Navigator.prototype,'globalPrivacyControl',{get:()=>true});},[track,gpc]);
  await c.route('https://test.supabase.co/rest/v1/rpc/*',async route=>{const m=route.request().url().split('/').pop(),a=route.request().postDataJSON();if(m==='sideout_track')sent.push(...a.p_events);try{if(!PARAMS[m])throw Error('function public.'+m+' does not exist');const vals=PARAMS[m].map(k=>typeof a[k]==='object'?JSON.stringify(a[k]):a[k]);const res=await on.query(`select public.${m}(${vals.map((_,i)=>'$'+(i+1)).join(',')}) as data`,vals);await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(res.rows[0].data)});}catch(e){await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({message:e.message})});}});return c;}
async function page(c,url=base){const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());await p.goto(url);return p;}
const kinds=()=>sent.map(e=>e.kind);const settle=()=>new Promise(r=>setTimeout(r,400));

// 2. Organizer page: visit, actions, and on-screen time are sent, never names.
const p=await page(await context(db));await p.waitForFunction(()=>typeof intro!=='undefined'&&intro===null);
for(const n of ['Alicia','Bernardo','Celestine','Dominga','Evangeline']){await p.locator('#nickname').fill(n);await p.locator('#add-form button').click();}
await p.locator('.game-action').click();await p.getByRole('button',{name:'Finish game & rotate',exact:true}).click();await p.locator('#add-court').click();
await p.locator('#customize').click();await p.locator('.swatch',{hasText:'Pro purple'}).click();await p.getByRole('button',{name:'Done',exact:true}).click();
await p.locator('#archive-name').fill('Analytics test');await p.locator('#archive-save').click();await p.locator('#archive-message').filter({hasText:/saved in this browser/i}).waitFor();
await p.waitForTimeout(1200);await p.evaluate(()=>SideoutStats.report());await settle();
for(const k of ['visit','player_added','game_finished','court_added','brand_changed','session_saved','active'])assert(kinds().includes(k),'missing '+k);
assert.equal(sent.filter(e=>e.kind==='player_added').length,5);assert.equal(sent.find(e=>e.kind==='brand_changed').detail,'preset');
const payload=JSON.stringify(sent);for(const n of ['Alicia','Bernardo','Analytics test'])assert(!payload.includes(n),'Names never leave the page: '+n);
assert(sent.every(e=>e.page==='organizer'&&/^[0-9a-f-]{36}$/.test(e.device)&&/^[0-9a-f-]{36}$/.test(e.visit)));assert(sent.find(e=>e.kind==='active').seconds>=1);

// 3. QR check-in from a phone: the player page sends its own visit and check-in.
await p.locator('#share-start').click();await p.locator('#share-details').waitFor({state:'visible'});await p.evaluate(()=>SideoutStats.report());await settle();assert(kinds().includes('qr_started'));
const g=await page(await context(db),await p.locator('#share-link').inputValue());await g.locator('#join-name').fill('Fernanda');await g.locator('#join-button').click();await g.getByText(/checked in as Fernanda/).waitFor();
await g.evaluate(()=>SideoutStats.report());await settle();assert(sent.some(e=>e.page==='player'&&e.kind==='visit'));assert(sent.some(e=>e.page==='player'&&e.kind==='checked_in'));assert(!JSON.stringify(sent).includes('Fernanda'));

// 4. Turning stats off stops everything and forgets the ID; turning on starts fresh.
const before=sent.length;assert.equal(await p.locator('#stats-toggle').textContent(),'Turn off anonymous usage stats');
const oldDevice=await p.evaluate(()=>localStorage.getItem('sideout-device'));await p.locator('#stats-toggle').click();
assert.equal(await p.evaluate(()=>localStorage.getItem('sideout-device')),null);await p.locator('#nickname').fill('Gregorio');await p.locator('#add-form button').click();await p.evaluate(()=>SideoutStats.report());await p.reload();await settle();
assert.equal(sent.length,before,'Nothing sent after turning stats off');assert.equal(await p.locator('#stats-toggle').textContent(),'Turn on anonymous usage stats');
await p.locator('#stats-toggle').click();await p.reload();await settle();await p.evaluate(()=>SideoutStats.report());await settle();
assert(sent.length>before);assert.notEqual(sent[sent.length-1].device,oldDevice,'A new anonymous ID after turning back on');

// 5. Browser privacy signal and localhost previews send nothing.
const n0=sent.length;const gp=await page(await context(db,{gpc:true}));await gp.locator('#nickname').fill('Zed');await gp.locator('#add-form button').click();await gp.evaluate(()=>SideoutStats.report());await settle();
assert.equal(sent.length,n0);assert.equal(await gp.locator('#stats-toggle').textContent(),'Usage stats are off (browser privacy setting)');assert.equal(await gp.locator('#stats-toggle').isDisabled(),true);
const lp=await page(await context(db,{track:false}));await lp.locator('#nickname').fill('Zed');await lp.locator('#add-form button').click();await lp.evaluate(()=>SideoutStats.report());await settle();assert.equal(sent.length,n0,'Localhost previews never send');

// 6. Dashboard: locked without the key, numbers with it, range switch, mobile layout.
const a=await page(await context(db),base+'/analytics.html');await a.locator('#unlock').waitFor({state:'visible'});
await a.locator('#key').fill('wrong');await a.getByRole('button',{name:'Unlock',exact:true}).click();await a.getByText('That key didn’t work. Check the key file and try again.').waitFor();
await a.locator('#key').fill(KEY);await a.getByRole('button',{name:'Unlock',exact:true}).click();await a.locator('#report').waitFor({state:'visible'});
assert.equal(await a.locator('#users').textContent(),'3','Organizer, phone, and the fresh ID after turning stats back on');
assert.match(await a.locator('#tiles').textContent(),/Games finished1/);assert.match(await a.locator('#actions').textContent(),/QR check-ins1/);assert.match(await a.locator('#customs').textContent(),/Color preset1/);
assert.equal(await a.locator('#chart-visits svg').count(),1);await a.getByRole('button',{name:'7 days',exact:true}).click();await a.waitForFunction(()=>document.querySelectorAll('#daily-table tr').length===8);
await a.reload();await a.locator('#report').waitFor({state:'visible'});assert.equal(await a.evaluate(()=>!!localStorage.getItem('sideout-analytics-key')),true,'Key remembered on this browser');
await a.setViewportSize({width:390,height:844});assert(await a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
await a.getByRole('button',{name:'Lock and forget key',exact:true}).click();assert.equal(await a.locator('#report').isHidden(),true);assert.equal(await a.evaluate(()=>localStorage.getItem('sideout-analytics-key')),null);

// 7. A database without analytics: the app works and shows nothing about it.
const o=await page(await context(oldDb));await o.locator('#nickname').fill('Zed');await o.locator('#add-form button').click();await o.evaluate(()=>SideoutStats.report());await settle();assert.equal(await o.locator('#notice').isHidden(),true);

assert.deepEqual(errors,[]);await browser.close();await db.close();await oldDb.close();await new Promise(r=>server.close(r));
console.log('PASS analytics validation and key lock, organizer and player events without names, on-screen time, opt-out forgets the ID, privacy signal and localhost send nothing, dashboard unlock/numbers/range/mobile/forget, older database fallback');
})().catch(e=>{console.error(e);process.exit(1);});
