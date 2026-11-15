// Players who left can rejoin with the same nickname: server rules, Rejoin from the same phone, organizer sync,
// no takeover of a departed player's nickname from another phone, and an older database without the rejoin migration.
const {chromium}=require('playwright'),{PGlite}=require('@electric-sql/pglite'),fs=require('fs'),http=require('http'),path=require('path'),assert=require('node:assert/strict');
const PARAMS={sideout_publish_live:['p_session','p_owner','p_state'],sideout_custom_use:['p_session','p_owner','p_use','p_players'],sideout_player_view:['p_session'],sideout_requests:['p_session','p_owner'],sideout_join_player:['p_session','p_id','p_name','p_secret'],sideout_my_requests:['p_session','p_id','p_secret'],sideout_request_lineup:['p_session','p_id','p_secret','p_request','p_players'],sideout_decide:['p_session','p_owner','p_request','p_status'],sideout_create:['p_session','p_owner','p_players'],sideout_poll:['p_session','p_owner'],sideout_close:['p_session','p_owner'],sideout_leave:['p_session','p_id','p_secret'],sideout_rejoin:['p_session','p_id','p_secret'],sideout_guess:['p_session','p_id','p_secret','p_game','p_team']};
async function database(withRejoin){const db=new PGlite();await db.exec('create role anon;create role authenticated;');for(const f of ['session-checkin.sql','player-page.sql','nickname-hardening.sql','branding.sql','player-leave.sql','match-guesses.sql',...(withRejoin?['player-rejoin.sql']:[])])await db.exec(fs.readFileSync('supabase/'+f,'utf8'));await db.exec('set role anon');return db;}
(async()=>{
const db=await database(true),oldDb=await database(false);
const one=async(sql,args,on=db)=>(await on.query(sql,args)).rows[0].data;

// 1. Server: only a player listed as Left can rejoin, and only with the phone's key. Their nickname can't be taken over.
const s1=crypto.randomUUID(),owner='a'.repeat(64),secret='b'.repeat(64),other='c'.repeat(64),pid=crypto.randomUUID();
const view=left=>JSON.stringify({players:[],queue:[],courts:[],completed:0,lineup:[],next:[],left});
const poll=async()=>(await one('select public.sideout_poll($1,$2) as data',[s1,owner])).arrivals;
await db.query('select public.sideout_create($1,$2,$3)',[s1,owner,'[]']);await db.query('select public.sideout_join_player($1,$2,$3,$4)',[s1,pid,'Fay',secret]);
await assert.rejects(db.query('select public.sideout_rejoin($1,$2,$3)',[s1,pid,secret]),/already back/,'Not left yet');
await assert.rejects(db.query('select public.sideout_join_player($1,$2,$3,$4)',[s1,crypto.randomUUID(),'fay',other]),/Nickname already used/,'A nickname still in play stays taken');
await db.query('select public.sideout_leave($1,$2,$3)',[s1,pid,secret]);await db.query('select public.sideout_publish($1,$2,$3)',[s1,owner,view([pid])]);
await assert.rejects(db.query('select public.sideout_rejoin($1,$2,$3)',[s1,pid,other]),/Join from this phone/);
await assert.rejects(db.query('select public.sideout_rejoin($1,$2,$3)',[s1,pid,null]),/Join from this phone/);
assert.equal((await one('select public.sideout_rejoin($1,$2,$3) as data',[s1,pid,secret])).rejoins,1);
let arrivals=await poll();assert.equal(arrivals[0].leaves,1);assert.equal(arrivals[0].rejoins,1);
await assert.rejects(db.query('select public.sideout_join_player($1,$2,$3,$4)',[s1,crypto.randomUUID(),' fay ',other]),/Nickname already used/,'A departed player’s nickname is not handed to another phone');
await assert.rejects(db.query('select public.sideout_leave($1,$2,$3)',[s1,pid,other]),/Join from this phone/);
assert.equal((await one('select public.sideout_leave($1,$2,$3) as data',[s1,pid,secret])).leaves,2,'The original phone keeps its key');
arrivals=await poll();assert.equal(arrivals.length,1,'No second check-in');assert.equal(arrivals[0].rejoins,1);
await db.query('select public.sideout_close($1,$2)',[s1,owner]);
await assert.rejects(db.query('select public.sideout_rejoin($1,$2,$3)',[s1,pid,secret]),/session has ended/);

const root=process.cwd(),server=http.createServer((req,res)=>{const u=new URL(req.url,'http://x').pathname;let file=u.startsWith('/vendor/')?u.slice(1):path.basename(u)||'app.html';if(file==='config.js'){res.setHeader('Content-Type','application/javascript');return res.end("window.SIDEOUT_CONFIG={supabaseUrl:'https://test.supabase.co',publishableKey:'sb_publishable_test'};");}try{res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.woff2')?'font/woff2':'text/html');res.end(fs.readFileSync(path.join(root,file)));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[];
async function context(on){const c=await browser.newContext();await c.route('https://test.supabase.co/rest/v1/rpc/*',async route=>{const m=route.request().url().split('/').pop(),a=route.request().postDataJSON();try{if(!PARAMS[m])throw Error('function public.'+m+' does not exist');const v=PARAMS[m].map(k=>typeof a[k]==='object'?JSON.stringify(a[k]):a[k]);const r=await on.query(`select public.${m}(${v.map((_,i)=>'$'+(i+1)).join(',')}) as data`,v);await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(r.rows[0].data)});}catch(e){await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({message:e.message})});}});return c;}
async function page(c){const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());return p;}
async function organizer(on,names){const p=await page(await context(on));await p.goto(base+'/app.html');for(const n of names){await p.locator('#nickname').fill(n);await p.locator('#add-form button').click();}await p.locator('#share-start').click();await p.locator('#share-details').waitFor({state:'visible'});return p;}
async function guest(on,link,name){const g=await page(await context(on));await g.goto(link);await g.locator('#join-name').fill(name);await g.locator('#join-button').click();await g.getByText(new RegExp('checked in as '+name)).waitFor();return g;}
const names=p=>p.evaluate(()=>({queue:state.queue.map(id=>player(id).name),left:(state.left||[]).map(id=>player(id).name)}));
async function leave(g){await g.locator('#refresh').click();await g.waitForFunction(()=>!document.getElementById('leave-box').hidden&&!document.getElementById('leave-button').disabled,null,{timeout:15000});await g.locator('#leave-button').click();}

// 2. Same phone: Fay plays a game, leaves by accident, taps Rejoin, and goes to the end of the queue with her game kept.
const p=await organizer(db,['Ali','Bea','Cal']),link=await p.locator('#share-link').inputValue(),session=await p.evaluate(()=>state.checkin.id);
const g=await guest(db,link,'Fay');await p.waitForFunction(()=>state.players.length===4,null,{timeout:15000});
await p.locator('.game-action').click();await p.getByRole('button',{name:'Finish game only',exact:true}).click();
await p.locator('#nickname').fill('Dan');await p.locator('#add-form button').click();
await leave(g);await p.waitForFunction(()=>(state.left||[]).length===1,null,{timeout:15000});assert.deepEqual((await names(p)).left,['Fay']);
await g.locator('#refresh').click();await g.getByText('You left this session',{exact:true}).waitFor({timeout:15000});
await g.getByText('Your games still count. Left by mistake? Tap Rejoin to go to the end of the queue.').waitFor();
assert.equal(await g.locator('#rejoin-button').textContent(),'Rejoin the queue as Fay');assert.equal(await g.locator('#leave-box').isHidden(),true);
await g.locator('#rejoin-button').click();await g.getByText('You’re rejoining. The organizer’s list updates within a few seconds.').waitFor();
await g.getByText('Rejoining the queue',{exact:true}).waitFor();assert.equal(await g.locator('#rejoin-button').isDisabled(),true,'One tap is enough');
await p.waitForFunction(()=>!(state.left||[]).length,null,{timeout:15000});let n=await names(p);
assert.deepEqual(n.queue,['Ali','Bea','Cal','Dan','Fay'],'Back at the end of the queue');assert.deepEqual(n.left,[]);
assert.equal(await p.evaluate(()=>player(state.queue.at(-1)).games),1,'Her game still counts');
assert.match(await p.locator('#announcement').textContent(),/Fay is back in the queue\./);
await p.waitForTimeout(6000);assert.deepEqual((await names(p)).queue,['Ali','Bea','Cal','Dan','Fay'],'The same rejoin is not applied twice');
await g.locator('#refresh').click();await g.getByText('Queue position 5.',{exact:false}).waitFor({timeout:15000});
assert.equal(await g.locator('#rejoin-box').isHidden(),true);assert.equal(await g.locator('#rejoin-message').textContent(),'');
assert.equal(await g.locator('#leave-button').textContent(),'Leave session as Fay','She can leave again later');

// 3. Another phone can't take over Fay's nickname; it is told to rejoin from her own phone. Her phone still can.
await leave(g);await p.waitForFunction(()=>(state.left||[]).length===1,null,{timeout:15000});
const fay=await p.evaluate(()=>state.players.find(x=>x.name==='Fay').id);
for(let i=0;i<100&&!((await one('select public.sideout_player_view($1) as data',[session])).state.left||[]).includes(fay);i++)await p.waitForTimeout(100);
const g2=await page(await context(db));await g2.goto(link);await g2.getByText(/Live queue, updated/).waitFor({timeout:15000});await g2.locator('#join-name').fill('FAY');await g2.locator('#join-button').click();
await g2.getByText('Fay left this session. To play again, tap Rejoin on the phone Fay joined from, or ask the organizer to tap Return.').waitFor({timeout:15000});
await g2.locator('#track-player').selectOption({label:'Fay'});await g2.getByText('Your games still count. To play again, tap Rejoin on the phone you joined from, or ask the organizer.').waitFor();
assert.equal(await g2.locator('#rejoin-box').isHidden(),true,'No Rejoin button on a phone without her key');
await p.waitForTimeout(5500);assert.deepEqual((await names(p)).left,['Fay'],'Still Left');assert.equal(await p.evaluate(()=>state.players.length),5,'No duplicate Fay');
await g.locator('#refresh').click();await g.locator('#rejoin-button').waitFor({state:'visible',timeout:15000});await g.locator('#rejoin-button').click();
await p.waitForFunction(()=>!(state.left||[]).length,null,{timeout:15000});assert.deepEqual((await names(p)).queue,['Ali','Bea','Cal','Dan','Fay'],'Her own phone can rejoin again');
// A nickname still in play stays taken.
const g3=await page(await context(db));await g3.goto(link);await g3.locator('#join-name').fill('Ali');await g3.locator('#join-button').click();await g3.getByText('Nickname already used. Choose a different nickname.').waitFor();
await g2.setViewportSize({width:390,height:844});assert(await g2.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));

// 4. A database without the rejoin migration: the phone explains instead of failing.
const o=await organizer(oldDb,['Ali','Bea','Cal']),og=await guest(oldDb,await o.locator('#share-link').inputValue(),'Gus');
await o.waitForFunction(()=>state.players.length===4,null,{timeout:15000});await leave(og);await o.waitForFunction(()=>(state.left||[]).length===1,null,{timeout:15000});
await og.locator('#refresh').click();await og.locator('#rejoin-button').waitFor({state:'visible',timeout:15000});await og.locator('#rejoin-button').click();
await og.getByText('Rejoining from your phone isn’t available for this session. Ask the organizer to return you to the queue.').waitFor();
assert.equal(await og.locator('#rejoin-button').isDisabled(),false);

assert.deepEqual(errors,[]);await browser.close();await db.close();await oldDb.close();await new Promise(r=>server.close(r));
console.log('PASS rejoin needs a Left listing and the phone’s key, Rejoin returns to the end of the queue with games kept, no double apply, rejoin again after another leave, no nickname takeover from another phone, nicknames in play stay taken, older database message');
})().catch(e=>{console.error(e);process.exit(1);});
