// Match guesses: server rules, the player's Who wins? buttons, live counts on the organizer's courts, and older databases.
const {chromium}=require('playwright'),{PGlite}=require('@electric-sql/pglite'),fs=require('fs'),http=require('http'),path=require('path'),assert=require('node:assert/strict');
const PARAMS={sideout_publish_live:['p_session','p_owner','p_state'],sideout_custom_use:['p_session','p_owner','p_use','p_players'],sideout_player_view:['p_session'],sideout_requests:['p_session','p_owner'],sideout_join_player:['p_session','p_id','p_name','p_secret'],sideout_my_requests:['p_session','p_id','p_secret'],sideout_request_lineup:['p_session','p_id','p_secret','p_request','p_players'],sideout_decide:['p_session','p_owner','p_request','p_status'],sideout_create:['p_session','p_owner','p_players'],sideout_poll:['p_session','p_owner'],sideout_close:['p_session','p_owner'],sideout_leave:['p_session','p_id','p_secret'],sideout_guess:['p_session','p_id','p_secret','p_game','p_team']};
async function database(withGuesses){const db=new PGlite();await db.exec('create role anon;create role authenticated;');for(const f of ['session-checkin.sql','player-page.sql','nickname-hardening.sql','branding.sql','player-leave.sql',...(withGuesses?['match-guesses.sql']:[])])await db.exec(fs.readFileSync('supabase/'+f,'utf8'));await db.exec('set role anon');return db;}
(async()=>{
const db=await database(true),oldDb=await database(false);
const one=async(sql,args,on=db)=>(await on.query(sql,args)).rows[0].data;

// 1. Server rules.
const s1=crypto.randomUUID(),owner='a'.repeat(64),key='b'.repeat(64),ids=Array.from({length:6},()=>crypto.randomUUID()),game=crypto.randomUUID();
await db.query('select public.sideout_create($1,$2,$3)',[s1,owner,'[]']);for(const [i,id] of ids.entries())await db.query('select public.sideout_join_player($1,$2,$3,$4)',[s1,id,'P'+i,key]);
const publish=courts=>db.query('select public.sideout_publish_live($1,$2,$3)',[s1,owner,JSON.stringify({players:ids.map((id,i)=>({id,name:'P'+i,games:0})),queue:ids.slice(4),courts,completed:0,lineup:[],next:[]})]);
await publish([{id:1,current:ids.slice(0,4),game}]);
const guess=(who,team,g=game,secret=key)=>one('select public.sideout_guess($1,$2,$3,$4,$5) as data',[s1,who,secret,g,team]);
await assert.rejects(guess(ids[4],'A',game,'c'.repeat(64)),/Join from this phone/);
await assert.rejects(guess(ids[4],'C'),/Choose a team/);
await assert.rejects(guess(ids[0],'A'),/playing in this game/);
await assert.rejects(guess(ids[4],'A',crypto.randomUUID()),/finished/);
assert.deepEqual(await guess(ids[4],'A'),{A:1,B:0});assert.deepEqual(await guess(ids[5],'B'),{A:1,B:1});
assert.deepEqual(await guess(ids[4],'B'),{A:0,B:2},'Changing a guess moves it, not adds');
assert.deepEqual((await one('select public.sideout_poll($1,$2) as data',[s1,owner])).guesses,{[game]:{A:0,B:2}});
assert.deepEqual((await one('select public.sideout_player_view($1) as data',[s1])).guesses,{[game]:{A:0,B:2}});
await publish([{id:1,current:[]}]);await assert.rejects(guess(ids[4],'A'),/finished/);
assert.deepEqual((await one('select public.sideout_player_view($1) as data',[s1])).guesses,{},'Finished games drop out of the counts');

const root=process.cwd(),server=http.createServer((req,res)=>{const u=new URL(req.url,'http://x').pathname;let file=u.startsWith('/vendor/')?u.slice(1):path.basename(u)||'index.html';if(file==='config.js'){res.setHeader('Content-Type','application/javascript');return res.end("window.SIDEOUT_CONFIG={supabaseUrl:'https://test.supabase.co',publishableKey:'sb_publishable_test'};");}try{res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.woff2')?'font/woff2':'text/html');res.end(fs.readFileSync(path.join(root,file)));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[];
async function context(on){const c=await browser.newContext();await c.route('https://test.supabase.co/rest/v1/rpc/*',async route=>{const m=route.request().url().split('/').pop(),a=route.request().postDataJSON();try{if(!PARAMS[m])throw Error('function public.'+m+' does not exist');const v=PARAMS[m].map(k=>typeof a[k]==='object'?JSON.stringify(a[k]):a[k]);const r=await on.query(`select public.${m}(${v.map((_,i)=>'$'+(i+1)).join(',')}) as data`,v);await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(r.rows[0].data)});}catch(e){await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({message:e.message})});}});return c;}
async function page(c){const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());return p;}
async function organizer(on,names){const p=await page(await context(on));await p.goto(base);for(const n of names){await p.locator('#nickname').fill(n);await p.locator('#add-form button').click();}await p.locator('#share-start').click();await p.locator('#share-details').waitFor({state:'visible'});return p;}
async function guest(on,link,name){const g=await page(await context(on));await g.goto(link);await g.locator('#join-name').fill(name);await g.locator('#join-button').click();await g.getByText(new RegExp('checked in as '+name)).waitFor();return g;}
const label=p=>p.locator('[data-court="1"] .guess-label').textContent();
const ends=p=>p.locator('[data-court="1"] .guess-bar b').allTextContents();

// 2. Without QR check-in there is nothing to guess on, so no bar.
const local=await page(await context(db));await local.goto(base);for(const n of ['A1','A2','A3','A4']){await local.locator('#nickname').fill(n);await local.locator('#add-form button').click();}await local.locator('.game-action').click();
assert.equal(await local.locator('.guesses').count(),0);assert.match(await local.evaluate(()=>state.courts[0].game),/\S/);

// 3. Organizer and three phones: Dee plays, Eve and Fay guess.
const p=await organizer(db,['Ali','Bea','Cal']),link=await p.locator('#share-link').inputValue();
const dee=await guest(db,link,'Dee'),eve=await guest(db,link,'Eve'),fay=await guest(db,link,'Fay');
await p.waitForFunction(()=>state.players.length===6,null,{timeout:15000});await p.locator('.game-action').click();
const firstGame=await p.evaluate(()=>state.courts[0].game);
await p.waitForFunction(()=>document.querySelector('[data-court="1"] .guess-label')?.textContent==='No guesses yet on who wins',null,{timeout:15000});
for(const g of [dee,eve,fay]){await g.locator('#refresh').click();await g.locator('.pick').first().waitFor({timeout:15000});}
assert.equal(await dee.locator('.guess-note').textContent(),'You’re playing in this game.');assert.equal(await dee.locator('.pick').first().isDisabled(),true);
assert.deepEqual(await eve.locator('.pick-name').allTextContents(),['Ali & Bea','Cal & Dee']);
await eve.locator('.pick',{hasText:'Ali & Bea'}).click();await eve.waitForFunction(()=>document.querySelector('.pick.mine .pick-name')?.textContent==='Ali & Bea');
await fay.locator('.pick',{hasText:'Cal & Dee'}).click();await fay.waitForFunction(()=>document.querySelector('.pick.mine'));
await p.waitForFunction(()=>document.querySelector('[data-court="1"] .guess-label')?.textContent==='2 guesses on who wins',null,{timeout:15000});assert.deepEqual(await ends(p),['1','1']);
await eve.locator('.pick',{hasText:'Cal & Dee'}).click();await eve.waitForFunction(()=>document.querySelector('.pick.mine .pick-name')?.textContent==='Cal & Dee');
await p.waitForFunction(()=>[...document.querySelectorAll('[data-court="1"] .guess-bar b')].map(b=>b.textContent).join()==='0,2',null,{timeout:15000});assert.equal(await label(p),'2 guesses on who wins');
await eve.reload();await eve.locator('.pick.mine').waitFor({timeout:15000});assert.equal(await eve.locator('.pick.mine .pick-name').textContent(),'Cal & Dee','My guess survives a reload');

// 4. A new game starts with no guesses, and the old game's guesses are closed.
await p.getByRole('button',{name:'Finish game & rotate',exact:true}).click();assert.notEqual(await p.evaluate(()=>state.courts[0].game),firstGame);
await p.waitForFunction(()=>document.querySelector('[data-court="1"] .guess-label')?.textContent==='No guesses yet on who wins',null,{timeout:15000});
await eve.locator('#refresh').click();await eve.waitForFunction(()=>document.querySelectorAll('.pick.mine').length===0&&document.querySelectorAll('.pick').length===2,null,{timeout:15000});
await p.setViewportSize({width:390,height:844});await p.waitForFunction(()=>!document.querySelector('.flying'));assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
await eve.setViewportSize({width:390,height:844});assert(await eve.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));

// 5. A database without the guesses migration: no bar on the organizer page, no buttons on phones, no errors.
const o=await organizer(oldDb,['Ali','Bea','Cal']),og=await guest(oldDb,await o.locator('#share-link').inputValue(),'Gus');
await o.waitForFunction(()=>state.players.length===4,null,{timeout:15000});await o.locator('.game-action').click();await o.waitForTimeout(6000);
assert.equal(await o.locator('.guesses').count(),0);await og.locator('#refresh').click();await og.getByText(/^Live queue/).waitFor({timeout:15000});assert.equal(await og.locator('.pick').count(),0);

assert.deepEqual(errors,[]);await browser.close();await db.close();await oldDb.close();await new Promise(r=>server.close(r));
console.log('PASS guesses need the phone’s key, players in the game cannot guess, one changeable guess per game, live counts and split bar on courts, new game resets, guesses close when a game ends, mobile layout, older database fallback');
})().catch(e=>{console.error(e);process.exit(1);});
