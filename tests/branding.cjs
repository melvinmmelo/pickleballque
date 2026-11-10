// Club branding: server validation, the Customize panel, logo uploads, player-page sync, and older databases.
const {chromium}=require('playwright'),{PGlite}=require('@electric-sql/pglite'),fs=require('fs'),http=require('http'),path=require('path'),assert=require('node:assert/strict');
const PARAMS={sideout_publish_live:['p_session','p_owner','p_state'],sideout_custom_use:['p_session','p_owner','p_use','p_players'],sideout_player_view:['p_session'],sideout_requests:['p_session','p_owner'],sideout_join_player:['p_session','p_id','p_name','p_secret'],sideout_my_requests:['p_session','p_id','p_secret'],sideout_request_lineup:['p_session','p_id','p_secret','p_request','p_players'],sideout_decide:['p_session','p_owner','p_request','p_status'],sideout_create:['p_session','p_owner','p_players'],sideout_poll:['p_session','p_owner'],sideout_close:['p_session','p_owner'],sideout_set_brand:['p_session','p_owner','p_brand'],sideout_brand:['p_session']};
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
async function database(withBranding){const db=new PGlite();await db.exec('create role anon;create role authenticated;');for(const f of ['session-checkin.sql','player-page.sql','nickname-hardening.sql',...(withBranding?['branding.sql']:[])])await db.exec(fs.readFileSync('supabase/'+f,'utf8'));await db.exec('set role anon');return db;}
(async()=>{
const db=await database(true),oldDb=await database(false);
const one=async(sql,args,on=db)=>(await on.query(sql,args)).rows[0].data;

// 1. Server validation: organizer only, known keys only, safe colors and raster data URLs only.
const s1=crypto.randomUUID(),owner='a'.repeat(64);await db.query('select public.sideout_create($1,$2,$3)',[s1,owner,'[]']);
const set=b=>one('select public.sideout_set_brand($1,$2,$3) as data',[s1,owner,JSON.stringify(b)]);
const logo='data:image/png;base64,'+PNG.toString('base64');
await assert.rejects(db.query('select public.sideout_set_brand($1,$2,$3)',[s1,'b'.repeat(64),JSON.stringify({colors:{court:'#112233'}})]),/organizer key/);
await assert.rejects(set({colors:{court:'red;background:url(x)'}}),/#rrggbb/);
await assert.rejects(set({clubLogo:'data:image/svg+xml;base64,PHN2Zz4='}),/PNG, WebP or JPEG/);
await assert.rejects(set({clubLogo:'https://example.com/logo.png'}),/PNG, WebP or JPEG/);
await assert.rejects(set({clubLogo:'data:image/png;base64,'+'A'.repeat(130000)}),/PNG, WebP or JPEG|too large/);
const v1=await set({colors:{court:'#4A3D8F'},clubLogo:logo,evil:'<script>'});
const view=await one('select public.sideout_player_view($1) as data',[s1]);assert.equal(view.brandVersion,v1);
const fetched=await one('select public.sideout_brand($1) as data',[s1]);assert.deepEqual(fetched,{version:v1,brand:{colors:{court:'#4a3d8f'},clubLogo:logo}});
assert.notEqual(await set({colors:{court:'#22405f'}}),v1);assert.equal(await set(null),null);assert.equal((await one('select public.sideout_player_view($1) as data',[s1])).brandVersion,null);

const root=process.cwd(),server=http.createServer((req,res)=>{const u=new URL(req.url,'http://x').pathname;let file=u.startsWith('/vendor/')?u.slice(1):path.basename(u)||'index.html';if(file==='config.js'){res.setHeader('Content-Type','application/javascript');return res.end("window.SIDEOUT_CONFIG={supabaseUrl:'https://test.supabase.co',publishableKey:'sb_publishable_test'};");}try{res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.woff2')?'font/woff2':'text/html');res.end(fs.readFileSync(path.join(root,file)));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[],calls=[];
async function context(on){const c=await browser.newContext();await c.route('https://test.supabase.co/rest/v1/rpc/*',async route=>{const m=route.request().url().split('/').pop(),a=route.request().postDataJSON();calls.push(m);try{const v=PARAMS[m].map(k=>typeof a[k]==='object'?JSON.stringify(a[k]):a[k]);const r=await on.query(`select public.${m}(${v.map((_,i)=>'$'+(i+1)).join(',')}) as data`,v);await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(r.rows[0].data)});}catch(e){await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({message:e.message})});}});return c;}
async function page(c){const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());return p;}
const cssVar=(p,name)=>p.evaluate(n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim(),name);

// 2. Organizer: preset, custom color warning, logo uploads, persistence, and Reset session keeping branding.
const p=await page(await context(db));await p.goto(base);
for(const n of ['Ali','Bea','Cal','Dee','Eve']){await p.locator('#nickname').fill(n);await p.locator('#add-form button').click();}
await p.locator('#customize').click();await p.locator('#brand-dialog').waitFor({state:'visible'});
await p.locator('.swatch',{hasText:'Pro purple'}).click();assert.equal(await cssVar(p,'--court'),'#4a3d8f');
await p.locator('#brand-pickers input[name=court]').fill('#dddddd');assert.match(await p.locator('#brand-warning').textContent(),/hard to read/);
await p.locator('.swatch',{hasText:'Pro purple'}).click();assert.equal(await p.locator('#brand-warning').textContent(),'');
await p.locator('[data-slot=clubLogo] input[type=file]').setInputFiles({name:'notes.txt',mimeType:'text/plain',buffer:Buffer.from('hi')});await p.getByText('Choose a PNG, JPEG, WebP, SVG or GIF image.').waitFor();
await p.locator('[data-slot=clubLogo] input[type=file]').setInputFiles({name:'club.png',mimeType:'image/png',buffer:PNG});await p.getByText('Club logo saved.').waitFor();
await p.locator('[data-slot=courtLogo] input[type=file]').setInputFiles({name:'court.png',mimeType:'image/png',buffer:PNG});await p.getByText('Court logo saved.').waitFor();
await p.getByRole('button',{name:'Done',exact:true}).click();
assert.equal(await p.locator('#club-logo').isVisible(),true);assert.match(await p.locator('#club-logo').getAttribute('src'),/^data:image\/(webp|png);base64,/);
await p.locator('#add-court').click();assert.equal(await p.locator('.court .court-logo').count(),2);
await p.locator('#reset').click();await p.reload();
assert.equal(await cssVar(p,'--court'),'#4a3d8f');assert.equal(await p.locator('#club-logo').isVisible(),true);assert.equal(await p.locator('.court .court-logo').count(),1);
assert.equal(await p.evaluate(()=>state.players.length),0,'Reset session cleared players but kept branding');

// 3. Player page: same colors and logos, downloaded once and again only after a change.
for(const n of ['Ali','Bea','Cal','Dee','Eve']){await p.locator('#nickname').fill(n);await p.locator('#add-form button').click();}
await p.locator('#share-start').click();await p.locator('#share-details').waitFor({state:'visible'});
await p.waitForFunction(()=>true);const link=await p.locator('#share-link').inputValue();
const g=await page(await context(db));await g.goto(link);await g.locator('#club-logo').waitFor({state:'visible',timeout:15000});
assert.equal(await cssVar(g,'--court'),'#4a3d8f');
for(let i=0;i<3;i++){await g.locator('#refresh').click();await g.waitForTimeout(300);}
assert.equal(calls.filter(m=>m==='sideout_brand').length,1,'Logos are downloaded once, not on every refresh');
await p.locator('#customize').click();await p.locator('.swatch',{hasText:'Red clay'}).click();await p.getByRole('button',{name:'Done',exact:true}).click();
await g.waitForFunction(()=>getComputedStyle(document.documentElement).getPropertyValue('--court').trim()==='#a4473a',null,{timeout:20000});
assert.equal(calls.filter(m=>m==='sideout_brand').length,2);
await g.locator('#join-name').fill('Fay');await g.locator('#join-button').click();await p.waitForFunction(()=>state.players.length===6,null,{timeout:15000});await p.locator('.game-action').first().click();
await g.locator('#refresh').click();await g.locator('#live-courts .court-logo').first().waitFor({timeout:15000});
await g.setViewportSize({width:390,height:844});assert(await g.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
await p.waitForFunction(()=>!document.querySelector('.flying'));await p.setViewportSize({width:390,height:844});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));

// 4. A database without the branding migration: QR still works and no error is shown.
const o=await page(await context(oldDb));await o.goto(base);await o.locator('#nickname').fill('Zed');await o.locator('#add-form button').click();
await o.evaluate(()=>setBrand({...brand,colors:{...brand.colors,court:'#22405f'}}));
await o.locator('#share-start').click();await o.locator('#share-details').waitFor({state:'visible'});await o.waitForTimeout(6000);
assert.doesNotMatch(await o.locator('#share-message').textContent(),/colors and logos/);
const og=await page(await context(oldDb));await og.goto(await o.locator('#share-link').inputValue());await og.getByText(/^Live queue/).waitFor({timeout:15000});

assert.deepEqual(errors,[]);await browser.close();await db.close();await oldDb.close();await new Promise(r=>server.close(r));
console.log('PASS branding validation, presets, contrast warning, logo upload and rejection, persistence across reset, player sync with one download per change, mobile layout, older database fallback');
})().catch(e=>{console.error(e);process.exit(1);});
