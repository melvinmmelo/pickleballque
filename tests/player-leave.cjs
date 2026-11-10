// Players leaving a session from their own phone: server rules, organizer sync, on-court timing, Return, and records.
const {chromium}=require('playwright'),{PGlite}=require('@electric-sql/pglite'),fs=require('fs'),http=require('http'),path=require('path'),assert=require('node:assert/strict');
const PARAMS={sideout_publish_live:['p_session','p_owner','p_state'],sideout_custom_use:['p_session','p_owner','p_use','p_players'],sideout_player_view:['p_session'],sideout_requests:['p_session','p_owner'],sideout_join_player:['p_session','p_id','p_name','p_secret'],sideout_my_requests:['p_session','p_id','p_secret'],sideout_request_lineup:['p_session','p_id','p_secret','p_request','p_players'],sideout_decide:['p_session','p_owner','p_request','p_status'],sideout_create:['p_session','p_owner','p_players'],sideout_poll:['p_session','p_owner'],sideout_close:['p_session','p_owner'],sideout_leave:['p_session','p_id','p_secret']};
async function database(withLeave){const db=new PGlite();await db.exec('create role anon;create role authenticated;');for(const f of ['session-checkin.sql','player-page.sql','nickname-hardening.sql','branding.sql',...(withLeave?['player-leave.sql']:[])])await db.exec(fs.readFileSync('supabase/'+f,'utf8'));await db.exec('set role anon');return db;}
(async()=>{
const db=await database(true),oldDb=await database(false);
const one=async(sql,args,on=db)=>(await on.query(sql,args)).rows[0].data;

// 1. Server: only the phone that checked in can leave; each leave raises the counter; closed sessions refuse.
const s1=crypto.randomUUID(),owner='a'.repeat(64),secret='b'.repeat(64),pid=crypto.randomUUID();
await db.query('select public.sideout_create($1,$2,$3)',[s1,owner,'[]']);await db.query('select public.sideout_join_player($1,$2,$3,$4)',[s1,pid,'Fay',secret]);
await assert.rejects(db.query('select public.sideout_leave($1,$2,$3)',[s1,pid,'c'.repeat(64)]),/Join from this phone/);
await assert.rejects(db.query('select public.sideout_leave($1,$2,$3)',[s1,pid,null]),/Join from this phone/);
assert.equal((await one('select public.sideout_leave($1,$2,$3) as data',[s1,pid,secret])).leaves,1);
assert.equal((await one('select public.sideout_leave($1,$2,$3) as data',[s1,pid,secret])).leaves,2);
assert.equal((await one('select public.sideout_poll($1,$2) as data',[s1,owner])).arrivals[0].leaves,2);
await db.query('select public.sideout_publish($1,$2,$3)',[s1,owner,JSON.stringify({players:[],queue:[],courts:[],completed:0,lineup:[],next:[],left:[pid]})]);
assert.deepEqual((await one('select public.sideout_player_view($1) as data',[s1])).state.left,[pid]);
await db.query('select public.sideout_close($1,$2)',[s1,owner]);await assert.rejects(db.query('select public.sideout_leave($1,$2,$3)',[s1,pid,secret]),/session has ended/);

const root=process.cwd(),server=http.createServer((req,res)=>{const u=new URL(req.url,'http://x').pathname;let file=u.startsWith('/vendor/')?u.slice(1):path.basename(u)||'index.html';if(file==='config.js'){res.setHeader('Content-Type','application/javascript');return res.end("window.SIDEOUT_CONFIG={supabaseUrl:'https://test.supabase.co',publishableKey:'sb_publishable_test'};");}try{res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.woff2')?'font/woff2':'text/html');res.end(fs.readFileSync(path.join(root,file)));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[];
async function context(on){const c=await browser.newContext();await c.route('https://test.supabase.co/rest/v1/rpc/*',async route=>{const m=route.request().url().split('/').pop(),a=route.request().postDataJSON();try{if(!PARAMS[m])throw Error('function public.'+m+' does not exist');const v=PARAMS[m].map(k=>typeof a[k]==='object'?JSON.stringify(a[k]):a[k]);const r=await on.query(`select public.${m}(${v.map((_,i)=>'$'+(i+1)).join(',')}) as data`,v);await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(r.rows[0].data)});}catch(e){await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({message:e.message})});}});return c;}
async function page(c){const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());return p;}
async function organizer(on,names){const p=await page(await context(on));await p.goto(base);for(const n of names){await p.locator('#nickname').fill(n);await p.locator('#add-form button').click();}await p.locator('#share-start').click();await p.locator('#share-details').waitFor({state:'visible'});return p;}
async function guest(on,link,name){const g=await page(await context(on));await g.goto(link);await g.locator('#join-name').fill(name);await g.locator('#join-button').click();await g.getByText(new RegExp('checked in as '+name)).waitFor();return g;}
const names=p=>p.evaluate(()=>({queue:state.queue.map(id=>player(id).name),left:(state.left||[]).map(id=>player(id).name),court:state.courts[0].current.map(id=>player(id).name)}));

// 2. On court: the button waits for the game to end, and a leave that arrives mid-game applies when the game is finished.
const p=await organizer(db,['Ali','Bea','Cal']),link=await p.locator('#share-link').inputValue(),session=await p.evaluate(()=>state.checkin.id);
const g=await guest(db,link,'Fay');await p.waitForFunction(()=>state.players.length===4,null,{timeout:15000});
await p.locator('.game-action').click();assert.deepEqual((await names(p)).court,['Ali','Bea','Cal','Fay']);
await g.locator('#refresh').click();await g.getByText('You can leave after your current game ends.').waitFor({timeout:15000});assert.equal(await g.locator('#leave-button').isDisabled(),true);
const fay=await p.evaluate(()=>state.players.find(x=>x.name==='Fay').id),receipt=await g.evaluate(k=>JSON.parse(localStorage.getItem(k)),'sideout-join-'+session);
await db.query('select public.sideout_leave($1,$2,$3)',[session,fay,receipt.secret]);
await p.waitForFunction(()=>window.pendingLeaves.size===1,null,{timeout:15000});assert.deepEqual((await names(p)).court,['Ali','Bea','Cal','Fay'],'Still on court until the game ends');
await p.getByRole('button',{name:'Finish game & rotate',exact:true}).click();
let n=await names(p);assert.deepEqual(n.left,['Fay']);assert.deepEqual(n.queue,['Ali','Bea','Cal']);assert.equal(await p.evaluate(id=>player(id).games,fay),1,'The finished game still counts');
await p.waitForTimeout(6000);n=await names(p);assert.deepEqual(n.left,['Fay']);assert.deepEqual(n.queue,['Ali','Bea','Cal'],'The same leave is not applied twice');

// 3. Return, then leave from the phone while waiting.
await p.getByRole('button',{name:'Return Fay to the queue',exact:true}).click();assert.deepEqual((await names(p)).queue,['Ali','Bea','Cal','Fay']);
await g.locator('#refresh').click();await g.waitForFunction(()=>!document.getElementById('leave-box').hidden&&!document.getElementById('leave-button').disabled,null,{timeout:15000});
assert.equal(await g.locator('#leave-button').textContent(),'Leave session as Fay');
await g.locator('#leave-button').click();await g.getByText('You’re leaving. The organizer’s list updates within a few seconds.').waitFor();
await p.waitForFunction(()=>(state.left||[]).length===1,null,{timeout:15000});n=await names(p);assert.deepEqual(n.left,['Fay']);assert.deepEqual(n.queue,['Ali','Bea','Cal']);
assert.match(await p.locator('#player-count').textContent(),/3 players 1 left/);
assert.equal(await p.locator('#roster tr.left td.where').textContent(),'Left');
await g.locator('#refresh').click();await g.getByText('You left this session',{exact:true}).waitFor({timeout:15000});
assert.equal(await g.locator('#leave-box').isHidden(),true);assert.equal(await g.locator('#request-card').isHidden(),true);

// 4. Records: reload keeps Left, re-adding the same name points to Return, and a saved snapshot shows who left.
await p.reload();assert.deepEqual((await names(p)).left,['Fay']);
await p.locator('#nickname').fill('fay');await p.locator('#add-form button').click();assert.match(await p.locator('#nickname').evaluate(i=>i.validationMessage),/left earlier\. Use Return/);
await p.locator('#archive-name').fill('Leave test');await p.locator('#archive-save').click();await p.getByText(/Saved in this browser/).waitFor();
await p.getByRole('button',{name:'View Leave test',exact:true}).click();assert.match(await p.locator('#archive-content').textContent(),/FayLeft|Fay1Left/);await p.locator('#archive-dismiss').click();
await p.setViewportSize({width:390,height:844});await p.waitForFunction(()=>!document.querySelector('.flying'));assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));

// 5. A database without the leave migration: the phone explains instead of failing.
const o=await organizer(oldDb,['Ali','Bea','Cal']),og=await guest(oldDb,await o.locator('#share-link').inputValue(),'Gus');
await o.waitForFunction(()=>state.players.length===4,null,{timeout:15000});await og.locator('#refresh').click();await og.locator('#leave-button').waitFor({state:'visible',timeout:15000});
await og.locator('#leave-button').click();await og.getByText('Leaving from your phone isn’t available for this session. Ask the organizer to take you off the queue.').waitFor();

assert.deepEqual(errors,[]);await browser.close();await db.close();await oldDb.close();await new Promise(r=>server.close(r));
console.log('PASS leave needs the phone’s key, counter allows repeat leaves, on-court leave waits for game end and keeps the game, Return, leave while waiting, player sees Left, records keep Left, older database message');
})().catch(e=>{console.error(e);process.exit(1);});
