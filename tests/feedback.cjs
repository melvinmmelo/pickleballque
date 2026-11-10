// Feedback, bug reports, and ratings: server rules, the form on both pages, the bot trap, and the developer dashboard.
const {chromium}=require('playwright'),{PGlite}=require('@electric-sql/pglite'),fs=require('fs'),http=require('http'),path=require('path'),assert=require('node:assert/strict'),{createHash}=require('crypto');
const PARAMS={sideout_publish_live:['p_session','p_owner','p_state'],sideout_player_view:['p_session'],sideout_requests:['p_session','p_owner'],sideout_join_player:['p_session','p_id','p_name','p_secret'],sideout_my_requests:['p_session','p_id','p_secret'],sideout_create:['p_session','p_owner','p_players'],sideout_poll:['p_session','p_owner'],sideout_close:['p_session','p_owner'],sideout_analytics:['p_key','p_days'],sideout_feedback:['p_kind','p_rating','p_message','p_contact','p_page','p_context'],sideout_feedback_list:['p_key','p_days'],sideout_feedback_status:['p_key','p_id','p_status']};
const KEY='f'.repeat(64);
async function database(withFeedback){const db=new PGlite();await db.exec('create role anon;create role authenticated;');for(const f of ['session-checkin.sql','session-archives.sql','player-page.sql','nickname-hardening.sql','branding.sql','player-leave.sql','match-guesses.sql','sponsors.sql','analytics.sql',...(withFeedback?['feedback.sql']:[])])await db.exec(fs.readFileSync('supabase/'+f,'utf8'));
  await db.query("insert into sideout_private.settings(key,value) values('analytics_key_hash',$1)",[createHash('sha256').update(KEY).digest('hex')]);await db.exec('set role anon');return db;}
(async()=>{
const db=await database(true),oldDb=await database(false);
const send=(...a)=>db.query('select public.sideout_feedback($1,$2,$3,$4,$5,$6)',a);
const list=async()=>(await db.query('select public.sideout_feedback_list($1,30) as d',[KEY])).rows[0].d;

// 1. Server rules.
await assert.rejects(send('bug',null,'broken',null,'player','{}'),/at least 10 characters/);
await assert.rejects(send('feedback',null,'  ',null,'player','{}'),/rating or a message/);
await assert.rejects(send('feedback',6,null,null,'player','{}'),/1 to 5 stars/);
await assert.rejects(send('feedback',3,null,null,'admin','{}'),/Unknown page/);
await assert.rejects(send('feedback',null,'x'.repeat(2001),null,'player','{}'),/2,000 characters/);
await send('feedback',5,'  Great app  ',null,'player',JSON.stringify({version:'v',browser:'B',screen:'1x1',courts:2,players:9,waiting:1,qr:true,names:['Ali'],secret:'x'}));
let l=await list();assert.equal(l.items[0].message,'Great app');assert.deepEqual(Object.keys(l.items[0].context).sort(),['browser','courts','players','qr','screen','version','waiting'],'Unknown context keys are dropped');
await assert.rejects(db.query('select public.sideout_feedback_list($1,30)',['nope']),/Invalid analytics key/);
await assert.rejects(db.query('select public.sideout_feedback_status($1,$2,$3)',['nope',l.items[0].id,'done']),/Invalid analytics key/);
await assert.rejects(db.query('select * from sideout_private.feedback'));
await db.exec('reset role');await db.exec('delete from sideout_private.feedback');await db.exec('set role anon');

const root=process.cwd(),server=http.createServer((req,res)=>{const u=new URL(req.url,'http://x').pathname;let file=u.startsWith('/vendor/')?u.slice(1):path.basename(u)||'index.html';if(file==='config.js'){res.setHeader('Content-Type','application/javascript');return res.end("window.SIDEOUT_CONFIG={supabaseUrl:'https://test.supabase.co',publishableKey:'sb_publishable_test'};");}try{res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.woff2')?'font/woff2':'text/html');res.end(fs.readFileSync(path.join(root,file)));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[],calls=[];
async function context(on){const c=await browser.newContext();await c.route('https://test.supabase.co/rest/v1/rpc/*',async route=>{const m=route.request().url().split('/').pop(),a=route.request().postDataJSON();calls.push(m);try{if(!PARAMS[m])throw Error('function public.'+m+' does not exist');const v=PARAMS[m].map(k=>a[k]==null?null:typeof a[k]==='object'?JSON.stringify(a[k]):a[k]);const r=await on.query(`select public.${m}(${v.map((_,i)=>'$'+(i+1)).join(',')}) as data`,v);await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(r.rows[0].data)});}catch(e){await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({message:e.message})});}});return c;}
async function page(c,url=base){const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());await p.goto(url);return p;}

// 2. Organizer page: rating + message, then a bug report with counts (never names) in the context.
const p=await page(await context(db));
for(const n of ['Alicia','Bernardo','Celestine','Dominga','Evangeline']){await p.locator('#nickname').fill(n);await p.locator('#add-form button').click();}
await p.getByRole('button',{name:'Feedback',exact:true}).click();await p.locator('#feedback-dialog').waitFor({state:'visible'});
await p.getByRole('button',{name:'Send feedback',exact:true}).click();assert.equal(await p.locator('#feedback-status').textContent(),'Choose a star rating or write a message.');
await p.locator('.fb-stars label').nth(3).click();assert.equal(await p.locator('#feedback-rating-text').textContent(),'Very good');assert.equal(await p.locator('.fb-stars label.on').count(),4);
await p.locator('#feedback-message').fill('The court drawing is great on our TV.');await p.locator('#feedback-contact').fill('club@example.com');
await p.getByRole('button',{name:'Send feedback',exact:true}).click();await p.getByText('Thanks! Your feedback was sent.').waitFor();
assert.equal(await p.locator('#feedback-message').inputValue(),'','Form clears after sending');
await p.locator('label',{hasText:'Report a bug'}).click();assert.equal(await p.locator('#feedback-rating').isHidden(),true,'No rating for bug reports');assert.equal(await p.locator('#feedback-title').textContent(),'Report a bug');
await p.locator('#feedback-message').fill('short');await p.getByRole('button',{name:'Send report',exact:true}).click();assert.equal(await p.locator('#feedback-status').textContent(),'Describe what went wrong in at least 10 characters.');
await p.locator('#feedback-message').fill('Start game did nothing on court 2 after I removed court 3.');await p.getByRole('button',{name:'Send report',exact:true}).click();await p.getByText('Thanks! Your bug report was sent.').waitFor();
// Bot trap: a filled hidden field gets a thank-you and nothing is stored.
const before=calls.filter(m=>m==='sideout_feedback').length;await p.locator('#feedback-website').evaluate(i=>{i.value='spam.example';});
await p.locator('label',{hasText:'Feedback'}).first().click();await p.locator('#feedback-message').fill('Buy cheap paddles now');await p.locator('#feedback-website').evaluate(i=>{i.value='spam.example';});await p.getByRole('button',{name:'Send feedback',exact:true}).click();
await p.getByText('Thanks! Your feedback was sent.').waitFor();assert.equal(calls.filter(m=>m==='sideout_feedback').length,before,'Bot submission not sent');
await p.setViewportSize({width:390,height:844});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.locator('#feedback-close').click();
l=await list();assert.equal(l.total,2);const bug=l.items.find(i=>i.kind==='bug'),fb=l.items.find(i=>i.kind==='feedback');
assert.equal(fb.rating,4);assert.equal(fb.contact,'club@example.com');assert.equal(fb.page,'organizer');assert.equal(bug.rating,null);
assert.deepEqual([bug.context.courts,bug.context.players,bug.context.waiting,bug.context.qr],[1,5,5,false]);assert(!JSON.stringify(l.items).includes('Alicia'),'Player names never sent');

// 3. Player page: Feedback button in the header.
const g=await page(await context(db),base+'/player.html');await g.getByRole('button',{name:'Feedback',exact:true}).click();await g.locator('.fb-stars label').nth(4).click();await g.getByRole('button',{name:'Send feedback',exact:true}).click();await g.getByText('Thanks! Your feedback was sent.').waitFor();
assert.equal((await list()).items[0].page,'player');await g.setViewportSize({width:390,height:844});assert(await g.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));

// 4. Dashboard: average, breakdown, filters, Mark done.
const a=await page(await context(db),base+'/analytics.html');await a.locator('#key').fill(KEY);await a.getByRole('button',{name:'Unlock',exact:true}).click();
await a.locator('#fb-items .fb-item').first().waitFor();assert.equal(await a.locator('.fb-avg').textContent(),'4.5 / 5');assert.match(await a.locator('#fb-summary').textContent(),/2 ratings, 1 bug report, 3 open/);
assert.equal(await a.locator('#fb-items .fb-item').count(),3);await a.getByRole('button',{name:'Bugs',exact:true}).click();assert.equal(await a.locator('#fb-items .fb-item').count(),1);
assert.match(await a.locator('#fb-items .fb-meta').textContent(),/1 court, 5 players, 5 waiting/);
await a.getByRole('button',{name:'Mark done',exact:true}).click();await a.getByRole('button',{name:'Reopen',exact:true}).waitFor();assert.equal((await list()).open,2,'Status saved');
await a.getByRole('button',{name:'All',exact:true}).click();assert.match(await a.locator('#fb-items').textContent(),/Reply to: club@example\.com/);assert.equal(await a.locator('#fb-items a[href="mailto:club@example.com"]').count(),1);
await a.setViewportSize({width:390,height:844});assert(await a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));

// 5. A database without the feedback migration: the form explains, nothing breaks.
const o=await page(await context(oldDb));await o.getByRole('button',{name:'Feedback',exact:true}).click();await o.locator('.fb-stars label').nth(2).click();await o.getByRole('button',{name:'Send feedback',exact:true}).click();
await o.getByText('Feedback isn’t available yet. Please try again later.').waitFor();

assert.deepEqual(errors,[]);await browser.close();await db.close();await oldDb.close();await new Promise(r=>server.close(r));
console.log('PASS feedback validation and key lock, rating and message, bug reports with counts not names, form checks, bot trap, player page, dashboard average/breakdown/filters/mark done/reply link, mobile layout, older database message');
})().catch(e=>{console.error(e);process.exit(1);});
