// Sponsor banners: server validation, the Customize panel, the rotating strip, player sync, and older databases.
const {chromium}=require('playwright'),{PGlite}=require('@electric-sql/pglite'),fs=require('fs'),http=require('http'),path=require('path'),assert=require('node:assert/strict');
const PARAMS={sideout_publish_live:['p_session','p_owner','p_state'],sideout_custom_use:['p_session','p_owner','p_use','p_players'],sideout_player_view:['p_session'],sideout_requests:['p_session','p_owner'],sideout_join_player:['p_session','p_id','p_name','p_secret'],sideout_my_requests:['p_session','p_id','p_secret'],sideout_request_lineup:['p_session','p_id','p_secret','p_request','p_players'],sideout_decide:['p_session','p_owner','p_request','p_status'],sideout_create:['p_session','p_owner','p_players'],sideout_poll:['p_session','p_owner'],sideout_close:['p_session','p_owner'],sideout_set_brand:['p_session','p_owner','p_brand'],sideout_brand:['p_session'],sideout_set_sponsors:['p_session','p_owner','p_sponsors'],sideout_sponsors:['p_session']};
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
async function database(withSponsors){const db=new PGlite();await db.exec('create role anon;create role authenticated;');for(const f of ['session-checkin.sql','player-page.sql','nickname-hardening.sql','branding.sql','player-leave.sql','match-guesses.sql',...(withSponsors?['sponsors.sql']:[])])await db.exec(fs.readFileSync('supabase/'+f,'utf8'));await db.exec('set role anon');return db;}
(async()=>{
const db=await database(true),oldDb=await database(false);
const one=async(sql,args,on=db)=>(await on.query(sql,args)).rows[0].data;

// 1. Server validation.
const s1=crypto.randomUUID(),owner='a'.repeat(64),img='data:image/png;base64,'+PNG.toString('base64');await db.query('select public.sideout_create($1,$2,$3)',[s1,owner,'[]']);
const set=list=>one('select public.sideout_set_sponsors($1,$2,$3) as data',[s1,owner,JSON.stringify(list)]);
await assert.rejects(db.query('select public.sideout_set_sponsors($1,$2,$3)',[s1,'b'.repeat(64),JSON.stringify([{image:img,name:'A'}])]),/organizer key/);
for(const [bad,why] of [[[{image:img,name:'A',link:'http://x.com'}],/https/],[[{image:img,name:'A',link:'javascript:alert(1)'}],/https/],[[{image:'data:image/svg+xml;base64,PHN2Zz4=',name:'A'}],/PNG, WebP or JPEG/],[[{image:img,name:'   '}],/sponsor name/],[Array(7).fill({image:img,name:'A'}),/up to 6/]])await assert.rejects(set(bad),why);
const v1=await set([{image:img,name:'  Acme   Paddles ',link:'https://acme.example',extra:'<script>'}]);
assert.deepEqual(await one('select public.sideout_sponsors($1) as data',[s1]),{version:v1,sponsors:[{image:img,name:'Acme Paddles',link:'https://acme.example'}]});
assert.equal((await one('select public.sideout_player_view($1) as data',[s1])).sponsorsVersion,v1);
assert.equal(await set([]),null);assert.equal((await one('select public.sideout_player_view($1) as data',[s1])).sponsorsVersion,null);

const root=process.cwd(),server=http.createServer((req,res)=>{const u=new URL(req.url,'http://x').pathname;let file=u.startsWith('/vendor/')?u.slice(1):path.basename(u)||'index.html';if(file==='config.js'){res.setHeader('Content-Type','application/javascript');return res.end("window.SIDEOUT_CONFIG={supabaseUrl:'https://test.supabase.co',publishableKey:'sb_publishable_test'};");}try{res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.woff2')?'font/woff2':'text/html');res.end(fs.readFileSync(path.join(root,file)));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[],calls=[];
async function context(on){const c=await browser.newContext();await c.addInitScript(()=>{window.sideoutSponsorInterval=700;});await c.route('https://test.supabase.co/rest/v1/rpc/*',async route=>{const m=route.request().url().split('/').pop(),a=route.request().postDataJSON();calls.push(m);try{if(!PARAMS[m])throw Error('function public.'+m+' does not exist');const v=PARAMS[m].map(k=>typeof a[k]==='object'?JSON.stringify(a[k]):a[k]);const r=await on.query(`select public.${m}(${v.map((_,i)=>'$'+(i+1)).join(',')}) as data`,v);await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(r.rows[0].data)});}catch(e){await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({message:e.message})});}});return c;}
async function page(c){const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());return p;}
const banner=name=>({name,mimeType:'image/png',buffer:PNG});
const onAlt=p=>p.locator('#sponsor-strip .sponsor-slide.on img.main').getAttribute('alt');

// 2. Customize: add, name, link, reorder, remove, limit; the strip rotates, takes dots, pauses, and pauses on hover.
const p=await page(await context(db));await p.goto(base);
for(const n of ['Ali','Bea','Cal','Dee']){await p.locator('#nickname').fill(n);await p.locator('#add-form button').click();}
assert.equal(await p.locator('#sponsor-strip').isHidden(),true,'No banners, no strip');
await p.locator('#customize').click();
await p.locator('#sponsor-add input').setInputFiles(banner('acme-paddles.png'));await p.getByText('Banner added. Check the sponsor name below.').waitFor();
assert.equal(await p.locator('.sponsor-row input').first().inputValue(),'acme paddles');
await p.getByLabel('Sponsor name for banner 1').fill('Acme Paddles');await p.getByLabel('Sponsor name for banner 1').press('Tab');await p.getByText('Sponsor name saved.').waitFor();
await p.getByLabel('Link for banner 1').fill('http://acme.example');await p.getByLabel('Link for banner 1').press('Tab');await p.getByText('Sponsor links must start with https://').waitFor();
await p.getByLabel('Link for banner 1').fill('acme.example/shop');await p.getByLabel('Link for banner 1').press('Tab');await p.getByText('Link saved.').waitFor();
assert.equal(await p.getByLabel('Link for banner 1').inputValue(),'https://acme.example/shop');
await p.locator('#sponsor-add input').setInputFiles(banner('Bay_Bank.png'));await p.getByText('Banner added. Check the sponsor name below.').waitFor();
await p.getByRole('button',{name:'Move Bay Bank up',exact:true}).click();assert.deepEqual(await p.locator('.sponsor-row input[aria-label^="Sponsor name"]').evaluateAll(i=>i.map(x=>x.value)),['Bay Bank','Acme Paddles']);
for(let i=3;i<=6;i++){await p.locator('#sponsor-add input').setInputFiles(banner('extra '+i+'.png'));await p.waitForFunction(n=>document.querySelectorAll('.sponsor-row').length===n,i);}
assert.equal(await p.locator('#sponsor-add input').isDisabled(),true,'Sixth banner fills the slots');
for(let i=6;i>2;i--)await p.getByRole('button',{name:`Remove extra ${i}`,exact:true}).click();
await p.getByRole('button',{name:'Reset colors and logos',exact:true}).click();assert.equal(await p.locator('.sponsor-row').count(),2,'Reset keeps banners');
await p.getByRole('button',{name:'Done',exact:true}).click();
assert.equal(await p.locator('#sponsor-strip').isVisible(),true);assert.equal(await p.locator('#sponsor-strip .sponsor-slide').count(),2);
await p.mouse.move(5,890);const first=await onAlt(p);await p.waitForFunction(a=>document.querySelector('#sponsor-strip .sponsor-slide.on img.main').alt!==a,first,{timeout:5000});
await p.getByRole('button',{name:'Pause',exact:true}).click();const held=await onAlt(p);await p.waitForTimeout(1600);assert.equal(await onAlt(p),held,'Paused strip stays put');
await p.getByRole('button',{name:'Show Acme Paddles',exact:true}).click();assert.equal(await onAlt(p),'Acme Paddles');
assert.equal(await p.locator('#sponsor-strip a.sponsor-slide.on').getAttribute('href'),'https://acme.example/shop');assert.match(await p.locator('#sponsor-strip a.sponsor-slide.on').getAttribute('rel'),/sponsored/);
assert.equal(await p.locator('#sponsor-strip .sponsor-slide[aria-hidden="true"]').count(),1,'Hidden banner is hidden from screen readers');
await p.reload();assert.equal(await p.locator('#sponsor-strip .sponsor-slide').count(),2,'Banners persist');

// 3. Player phones: same banners, downloaded once and again only after a change.
await p.locator('#share-start').click();await p.locator('#share-details').waitFor({state:'visible'});const link=await p.locator('#share-link').inputValue();
const g=await page(await context(db));await g.goto(link);await g.locator('#sponsor-strip .sponsor-slide').first().waitFor({state:'attached',timeout:15000});
assert.deepEqual(await g.locator('#sponsor-strip img.main').evaluateAll(i=>i.map(x=>x.alt)),['Bay Bank','Acme Paddles']);
for(let i=0;i<3;i++){await g.locator('#refresh').click();await g.waitForTimeout(300);}
assert.equal(calls.filter(m=>m==='sideout_sponsors').length,1,'Banners are downloaded once, not on every refresh');
await p.locator('#customize').click();await p.getByRole('button',{name:'Remove Bay Bank',exact:true}).click();await p.getByRole('button',{name:'Done',exact:true}).click();
await g.waitForFunction(()=>document.querySelectorAll('#sponsor-strip .sponsor-slide').length===1,null,{timeout:20000});assert.equal(calls.filter(m=>m==='sideout_sponsors').length,2);
await g.setViewportSize({width:390,height:844});assert(await g.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
await p.setViewportSize({width:390,height:844});await p.waitForFunction(()=>!document.querySelector('.flying'));assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
await p.locator('#customize').click();assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.getByRole('button',{name:'Done',exact:true}).click();

// 4. A database without the sponsors migration: no error on the organizer page, no strip on phones.
const o=await page(await context(oldDb));await o.goto(base);await o.locator('#nickname').fill('Zed');await o.locator('#add-form button').click();
await o.evaluate(img=>setBrand({...brand,sponsors:[{image:img,name:'Acme',link:null}]}),img);
await o.locator('#share-start').click();await o.locator('#share-details').waitFor({state:'visible'});await o.waitForTimeout(6000);
assert.doesNotMatch(await o.locator('#share-message').textContent(),/sponsor/i);
const og=await page(await context(oldDb));await og.goto(await o.locator('#share-link').inputValue());await og.getByText(/^Live queue/).waitFor({timeout:15000});assert.equal(await og.locator('#sponsor-strip').isHidden(),true);

assert.deepEqual(errors,[]);await browser.close();await db.close();await oldDb.close();await new Promise(r=>server.close(r));
console.log('PASS sponsor validation, add/name/link/reorder/remove/limit, reset keeps banners, rotation with dots, pause and hover, links, persistence, player sync with one download per change, mobile layout, older database fallback');
})().catch(e=>{console.error(e);process.exit(1);});
