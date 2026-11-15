// Mix players: off by default (first come, first served); when on, foursomes and partners change as games finish
// while games played stay even, nobody is moved back twice before playing, and custom groups stay together.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{
const b=await chromium.launch({headless:true,channel:'chrome'}),errors=[],url=require('node:url').pathToFileURL(require('node:path').resolve('app.html')).href;
async function open(){const c=await b.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'}),p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());await p.goto(url);return p;}
const add=async(p,n)=>{for(let i=1;i<=n;i++){await p.locator('#nickname').fill('P'+i);await p.locator('#add-form button').click();}};
const court=p=>p.locator('[data-court="1"] .player-chip').allTextContents();
const rotate=p=>p.locator('[data-court="1"]').getByRole('button',{name:'Finish game & rotate',exact:true}).click();
const key=names=>[...names].sort().join(',');
// Plays `games` games on one court through the real buttons and reports who played with whom.
async function session(p,games){const played=[await court(p)];for(let g=1;g<games;g++){await rotate(p);played.push(await court(p));}
const four=new Map(),partners={},sit={},longest={};let spread=0;
played.forEach(names=>{four.set(key(names),(four.get(key(names))||0)+1);for(const [x,y] of [[names[0],names[1]],[names[2],names[3]]]){(partners[x]??=new Set()).add(y);(partners[y]??=new Set()).add(x);}});
return {played,foursomes:four.size,sameFour:Math.max(...four.values()),fewestPartners:Math.min(...Object.values(partners).map(s=>s.size))};}

// 1. Off by default: with twelve players the same four meet again every third game, with the same partners.
let p=await open();assert.equal(await p.locator('#mix-toggle').isChecked(),false);await add(p,12);await p.locator('.game-action').click();
let s=await session(p,9);assert.equal(s.foursomes,3,'First-come order repeats three foursomes');assert.deepEqual(s.played[3],['P1','P2','P3','P4']);assert.equal(s.fewestPartners,1);
assert.deepEqual(await p.locator('#next .name').allTextContents(),['P1','P2','P3','P4'],'The board shows the same four coming back');

// 2. Turn it on: remembered on this device, announced, and it survives a reload and Reset session.
await p.locator('#more').click();await p.locator('#reset').click();
await p.locator('#mix-toggle').check();assert.equal(await p.locator('#announcement').textContent(),'Mix players is on. Foursomes and partners change as games finish.');
await p.reload();assert.equal(await p.locator('#mix-toggle').isChecked(),true);await p.locator('#more').click();await p.locator('#reset').click();assert.equal(await p.locator('#mix-toggle').isChecked(),true);

// 3. Twelve players, one court, mixing on. The first round is still first come, first served: nobody has played, so nobody may pass anyone.
await add(p,12);await p.locator('.game-action').click();
s=await session(p,18);
assert.deepEqual(s.played.slice(0,3).map(key),[['P1','P2','P3','P4'],['P5','P6','P7','P8'],['P9','P10','P11','P12']].map(key),'Round one keeps arrival order');
assert.notEqual(key(s.played[3]),key(s.played[0]),'The first four do not come back as the same four');
assert.equal(s.foursomes,18,'Every game is a different foursome');assert.equal(s.sameFour,1);assert(s.fewestPartners>=5,'Everyone gets several different partners, got '+s.fewestPartners);
// Fair: after every game, games played are within one of each other, and nobody sits more than one game longer than first-come order would have them sit.
const facts=await p.evaluate(()=>({counts:state.players.map(x=>x.games),held:(state.held||[]).length}));
assert(Math.max(...facts.counts)-Math.min(...facts.counts)<=1,'Games played stay even: '+facts.counts);
const lastSeen={};let worst=0;s.played.forEach((names,i)=>{for(const n of names){if(lastSeen[n]!==undefined)worst=Math.max(worst,i-lastSeen[n]-1);lastSeen[n]=i;}});
assert(worst<=3,'Longest sit is one game more than first-come order (2), got '+worst);
// The board never previews returning players while mixing, since their places are decided when the game ends.
assert.equal(await p.locator('#next li[title]').count(),0);

// 4. Partners change even when the foursome cannot: with four players the only variety is who partners whom.
p=await open();await p.locator('#mix-toggle').check();await add(p,4);await p.locator('.game-action').click();
const teams=[];for(let g=0;g<3;g++){const n=await court(p);teams.push(key(n.slice(0,2))+' v '+key(n.slice(2)));await rotate(p);}
assert.equal(new Set(teams).size,3,'Three games, three different pairings: '+teams.join(' | '));

// 5. A custom group is never split or re-paired by mixing.
p=await open();await p.locator('#mix-toggle').check();await add(p,12);await p.locator('.game-action').click();
await p.locator('summary').click();const ids=await p.evaluate(()=>['P12','P10','P8','P6'].map(n=>state.players.find(x=>x.name===n).id));
for(let i=0;i<4;i++)await p.locator(`[name=slot${i}]`).selectOption(ids[i]);await p.locator('#save-lineup').click();
let seen=null;for(let g=0;g<4&&!seen;g++){await rotate(p);const n=await court(p);if(n.includes('P12'))seen=n;}
assert.deepEqual(seen,['P12','P10','P8','P6'],'The custom four play together, in the teams chosen');

// 6. Turning it off returns to first come, first served, and damaged saved data about held players is dropped.
await p.locator('#mix-toggle').uncheck();assert.equal(await p.locator('#announcement').textContent(),'Mix players is off. The line is first come, first served.');
await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem('sideout-queue-v1'));s.held='oops';localStorage.setItem('sideout-queue-v1',JSON.stringify(s));});await p.reload();
assert.equal(await p.locator('#notice').isHidden(),true);assert.equal(await p.evaluate(()=>state.players.length),12);assert.equal(await p.evaluate(()=>state.held),undefined);
await p.setViewportSize({width:390,height:844});await p.locator('#next-toggle').click();assert.equal(await p.locator('#mix-toggle').isVisible(),true,'On a phone the switch is in the opened queue');
assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));

assert.deepEqual(errors,[]);await b.close();
console.log('PASS mixing is off by default and first-come order repeats foursomes, the switch is remembered, mixed sessions never repeat a foursome, games stay even and waits bounded, partners rotate, custom groups stay intact, off restores first-come order');
})().catch(e=>{console.error(e);process.exit(1);});
