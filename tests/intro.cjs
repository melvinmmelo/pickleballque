// Court construction intro: plays on load, cleans up, survives background updates, yields to taps, respects reduced motion.
const {chromium}=require('playwright'),path=require('path'),url=require('url'),assert=require('node:assert/strict');
const names=['Din','Dindi','Melo','Billie','Ana','Bo'];
const seed=JSON.stringify({players:names.map((n,i)=>({id:String(i),name:n,games:0})),queue:['4','5'],courts:[{id:1,current:['0','1','2','3']},{id:2,current:[]}],completed:0});
(async()=>{const b=await chromium.launch({channel:'chrome',headless:true}),errors=[],page=url.pathToFileURL(path.resolve('index.html')).href;
async function open(opts={}){const c=await b.newContext(opts),p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));await p.addInitScript(s=>{if(!sessionStorage.getItem('seeded')){localStorage.setItem('sideout-queue-v1',s);sessionStorage.setItem('seeded','1');}},seed);await p.goto(page);return p;}

// 1. Plays the construction stages, then leaves the normal court behind.
let p=await open();assert.equal(await p.evaluate(()=>intro!==null),true);
const seen=new Set();for(let i=0;i<60&&await p.evaluate(()=>intro!==null);i++){seen.add(await p.locator('[data-court="1"] .state').textContent());await p.waitForTimeout(40);}
for(const stage of ['Painting the court…','Drawing the lines…','Raising the net…'])assert(seen.has(stage),'missing stage '+stage);
await p.waitForFunction(()=>intro===null&&!document.querySelector('.court-lines,.building'),null,{timeout:5000});
assert.equal(await p.locator('[data-court="1"] .state').textContent(),'Game in progress');
assert.deepEqual(await p.locator('[data-court="1"] .player-chip').allTextContents(),['Din','Dindi','Melo','Billie']);

// 2. A background update during the intro waits for it instead of cutting it short.
await p.reload();await p.evaluate(()=>{state.players[0].customUsed=1;softRender();});
assert.equal(await p.evaluate(()=>intro!==null&&deferred),true,'Background render deferred while the intro plays');
await p.waitForFunction(()=>intro===null,null,{timeout:5000});assert.equal(await p.locator('#roster tr').first().locator('.custom').textContent(),'1/2','Deferred render applied after the intro');

// 3. A tap during the intro takes effect at once and finishes the courts.
await p.reload();await p.getByRole('button',{name:'Finish game only',exact:true}).click();
assert.equal(await p.evaluate(()=>intro===null&&state.courts[0].current.length===0),true);
assert.equal(await p.locator('.court-lines,.building').count(),0);

// 4. Reduced motion: no intro at all.
const r=await open({reducedMotion:'reduce'});assert.equal(await r.evaluate(()=>intro),null);assert.equal(await r.locator('.court-lines').count(),0);

assert.deepEqual(errors,[]);await b.close();
console.log('PASS court construction intro: stages play, cleans up, background updates wait, taps finish it, reduced motion skips it');
})().catch(e=>{console.error(e);process.exit(1);});
