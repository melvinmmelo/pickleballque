// Coming-soon announcement: shows on both pages, Share your ideas opens a prefilled Feedback form, Dismiss sticks.
const {chromium}=require('playwright'),fs=require('fs'),http=require('http'),path=require('path'),assert=require('node:assert/strict');
(async()=>{
const root=process.cwd(),server=http.createServer((req,res)=>{const u=new URL(req.url,'http://x').pathname;let file=u.startsWith('/vendor/')?u.slice(1):path.basename(u)||'index.html';if(file==='config.js'){res.setHeader('Content-Type','application/javascript');return res.end("window.SIDEOUT_CONFIG={supabaseUrl:'https://test.supabase.co',publishableKey:'sb_publishable_test'};");}try{res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.woff2')?'font/woff2':'text/html');res.end(fs.readFileSync(path.join(root,file)));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[];
async function page(url){const c=await browser.newContext();await c.route('https://test.supabase.co/**',r=>r.fulfill({status:400,contentType:'application/json',body:'{"message":"offline"}'}));const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(url);return p;}
for(const [label,url] of [['organizer',base],['player',base+'/player.html']]){
  const p=await page(url),bar=p.locator('#announcement-bar');
  assert.equal(await bar.isVisible(),true,label+' shows the announcement');assert.match(await bar.textContent(),/Coming soon.*Tournament mode is on its way to Sideout\./);
  assert.equal(await p.evaluate(()=>document.querySelector('main').firstElementChild.id),'announcement-bar','At the top of the page');
  await p.getByRole('button',{name:'Share your ideas',exact:true}).click();await p.locator('#feedback-dialog').waitFor({state:'visible'});
  assert.equal(await p.locator('#feedback-message').inputValue(),'Tournament mode idea: ');assert.equal(await p.locator('#feedback-title').textContent(),'Send feedback');await p.locator('#feedback-close').click();
  await p.setViewportSize({width:390,height:844});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),label+' fits a phone');
  await p.getByRole('button',{name:'Dismiss the tournament mode announcement',exact:true}).click();assert.equal(await bar.count(),0);
  await p.reload();await p.waitForTimeout(200);assert.equal(await p.locator('#announcement-bar').count(),0,label+' stays dismissed after reload');
  // A new announcement id would show again; simulate by clearing the stored dismissal.
  await p.evaluate(()=>localStorage.removeItem('sideout-announcement-dismissed'));await p.reload();assert.equal(await p.locator('#announcement-bar').isVisible(),true);
}
assert.deepEqual(errors,[]);await browser.close();await new Promise(r=>server.close(r));
console.log('PASS announcement on both pages, at the top, Share your ideas opens a prefilled Feedback form, fits phones, Dismiss persists');
})().catch(e=>{console.error(e);process.exit(1);});
