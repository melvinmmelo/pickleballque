// Organizer: switching players on court, recording the winner and score, the Game results list, wins and losses,
// saved sessions, and damaged saved data.
const {chromium}=require('playwright'),fs=require('fs'),http=require('http'),path=require('path'),assert=require('node:assert/strict');
(async()=>{
const root=process.cwd(),server=http.createServer((req,res)=>{const u=new URL(req.url,'http://x').pathname;let file=u.startsWith('/vendor/')?u.slice(1):path.basename(u)||'app.html';if(file==='config.js'){res.setHeader('Content-Type','application/javascript');return res.end("window.SIDEOUT_CONFIG={supabaseUrl:'https://test.supabase.co',publishableKey:'sb_publishable_test'};");}try{res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.woff2')?'font/woff2':'text/html');res.end(fs.readFileSync(path.join(root,file)));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[];
async function page(opts={},seed){const c=await browser.newContext(opts);await c.route('https://test.supabase.co/**',r=>r.fulfill({status:400,contentType:'application/json',body:'{"message":"offline"}'}));if(seed)await c.addInitScript(s=>{if(!sessionStorage.getItem('seeded')){localStorage.setItem('sideout-queue-v1',s);sessionStorage.setItem('seeded','1');}},JSON.stringify(seed));const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());p.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=400)errors.push(r.status()+' '+r.url());});return p;}
const p=await page({viewport:{width:1280,height:900}});await p.goto(base+'/app.html');
const add=async(...names)=>{for(const n of names){await p.locator('#nickname').fill(n);await p.locator('#add-form button').click();}};
const chips=(court=1)=>p.locator(`[data-court="${court}"] .player-chip`).allTextContents();
const chip=name=>p.locator('#courts .player-chip',{hasText:new RegExp('^'+name+'$')});
const game=i=>p.evaluate(i=>state.courts[i].game,i);
const hint=()=>p.locator('[data-court="1"] .switch-hint').textContent();
const score=(court,t)=>p.locator(`[data-court="${court}"] .result .score`).nth(t);
const team=(court,t)=>p.locator(`[data-court="${court}"] .result .team`).nth(t);
const note=court=>p.locator(`[data-court="${court}"] .result-note`);
const said=()=>p.locator('#announcement').textContent();
const rows=()=>p.locator('#results-list > li');
const record=name=>p.locator('#roster tr',{has:p.locator('td:first-child',{hasText:new RegExp('^'+name+'$')})}).locator('.wl');
const finish=(label,court=1)=>p.locator(`[data-court="${court}"]`).getByRole('button',{name:label,exact:true}).click();

// 1. Switch players: tap one, then another. Changing teams starts a new game for guesses; trading spots with a partner does not.
await add('Ali','Bea','Cal','Dee','Eli');await p.locator('[data-court="1"] .game-action').click();
assert.deepEqual(await chips(),['Ali','Bea','Cal','Dee']);assert.equal(await hint(),'Tap two players to switch them.');assert.equal(await p.locator('#results').isHidden(),true);
let g=await game(0);
await chip('Ali').click();assert.equal(await chip('Ali').getAttribute('aria-pressed'),'true');assert.equal(await hint(),'Tap who Ali switches with, or tap Ali again to cancel.');
await chip('Ali').click();assert.equal(await chip('Ali').getAttribute('aria-pressed'),'false');assert.equal(await hint(),'Tap two players to switch them.');
await chip('Dee').click();await p.keyboard.press('Escape');assert.equal(await chip('Dee').getAttribute('aria-pressed'),'false','Escape cancels');
await chip('Ali').click();await chip('Cal').click();
assert.deepEqual(await chips(),['Cal','Bea','Ali','Dee']);assert.equal(await said(),'Ali and Cal switched places.');assert.equal(await hint(),'Tap two players to switch them.');
assert.equal(await p.locator('[data-court="1"] .surface').getAttribute('aria-label'),'Court 1: Cal and Bea versus Ali and Dee');
assert.notEqual(await game(0),g,'New teams are a new game for guesses');g=await game(0);
await chip('Cal').focus();await p.keyboard.press('Enter');await chip('Bea').focus();await p.keyboard.press('Enter');
assert.deepEqual(await chips(),['Bea','Cal','Ali','Dee']);assert.equal(await game(0),g,'Partners trading spots keep the same game');
assert.equal(await p.evaluate(()=>document.activeElement.textContent),'Bea','Focus stays on the player just tapped');
await p.locator('#undo').click();assert.deepEqual(await chips(),['Cal','Bea','Ali','Dee'],'Undo puts them back');

// 2. Score: the higher score is the winner. A half-typed score survives a background refresh and a reload.
await score(1,0).focus();await p.keyboard.type('1');await p.evaluate(()=>render());
assert.equal(await p.evaluate(()=>document.activeElement.dataset.keep),'c-1-score-0','Typing is not interrupted by a refresh');await p.keyboard.type('1');assert.equal(await score(1,0).inputValue(),'11');
await score(1,1).fill('7x');assert.equal(await score(1,1).inputValue(),'7','Digits only');
assert.equal(await team(1,0).getAttribute('aria-pressed'),'true');assert.equal(await team(1,1).getAttribute('aria-pressed'),'false');
await team(1,1).click();assert.equal(await note(1).textContent(),'The score decides the winner. Change the score to change it.');assert.equal(await team(1,0).getAttribute('aria-pressed'),'true');
await p.reload();assert.equal(await score(1,0).inputValue(),'11');assert.equal(await score(1,1).inputValue(),'7');
await finish('Finish game only');
assert.equal(await said(),'Cal & Bea won 11–7. Game counted. Court is now available.');
assert.equal(await rows().count(),1);assert.equal(await rows().first().locator('.when').textContent(),'Game 1 · Court 1');assert.equal(await rows().first().locator('.teams').textContent(),'Cal & BeaWon11–7Ali & Dee');
assert.equal(await p.locator('#results-count').textContent(),'1 game finished, 1 with a result');
assert.equal(await record('Cal').textContent(),'1W 0L');assert.equal(await record('Ali').textContent(),'0W 1L');assert.equal(await record('Eli').count(),0,'No record without a result');

// 3. A half-entered or tied score stops the finish. Without a score, tapping a team records just the winner.
await p.locator('[data-court="1"] .game-action').click();assert.deepEqual(await chips(),['Eli','Cal','Bea','Ali']);
assert.equal(await score(1,0).inputValue(),'','A new game starts with an empty score');
await score(1,0).fill('9');await finish('Finish game & rotate');assert.equal(await note(1).textContent(),'Enter both scores, or clear the score.');assert.deepEqual(await chips(),['Eli','Cal','Bea','Ali']);
await score(1,1).fill('9');assert.equal(await note(1).isHidden(),true);await finish('Finish game & rotate');assert.equal(await note(1).textContent(),'Scores can’t be tied. Fix the score, or clear it.');
assert.equal(await p.evaluate(()=>state.completed),1,'Nothing was counted');
await score(1,0).fill('');await score(1,1).fill('');
await team(1,1).click();assert.equal(await team(1,1).getAttribute('aria-pressed'),'true');await team(1,1).click();assert.equal(await team(1,1).getAttribute('aria-pressed'),'false');await team(1,1).click();
await finish('Finish game & rotate');assert.equal(await said(),'Bea & Ali won. Court updated. The queue is ready for the next available game.');
assert.equal(await rows().first().locator('.teams').textContent(),'Eli & CalvsBea & AliWon');assert.deepEqual(await chips(),['Dee','Eli','Cal','Bea']);

// 4. Finishing with no result still logs the game; the result can be added, edited, or cleared later.
await finish('Finish game only');assert.equal(await rows().first().locator('.when').textContent(),'Game 3 · Court 1 · No result recorded');assert.equal(await rows().first().locator('.teams').textContent(),'Dee & ElivsCal & Bea');
assert.equal(await p.locator('#results-count').textContent(),'3 games finished, 2 with a result');
await p.getByRole('button',{name:'Add result for game 3',exact:true}).click();
const edit=p.locator('#results-list .edit');await edit.locator('.score').nth(0).fill('11');await p.getByRole('button',{name:'Save result',exact:true}).click();
assert.equal(await edit.locator('.result-note').textContent(),'Enter both scores, or clear the score.');
await edit.locator('.score').nth(1).fill('9');await p.getByRole('button',{name:'Save result',exact:true}).click();
assert.equal(await said(),'Result saved for game 3.');assert.equal(await rows().first().locator('.teams').textContent(),'Dee & EliWon11–9Cal & Bea');
assert.equal(await record('Cal').textContent(),'1W 2L');assert.equal(await record('Bea').textContent(),'2W 1L');assert.equal(await record('Dee').textContent(),'1W 1L');
await p.getByRole('button',{name:'Edit result for game 2',exact:true}).click();assert.equal(await edit.locator('.team').nth(1).getAttribute('aria-pressed'),'true');
await edit.locator('.team').nth(0).click();await p.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(await rows().nth(1).locator('.teams').textContent(),'Eli & CalvsBea & AliWon','Cancel changes nothing');
await p.getByRole('button',{name:'Edit result for game 3',exact:true}).click();assert.equal(await edit.locator('.score').nth(0).inputValue(),'11');
await edit.locator('.score').nth(0).fill('');await edit.locator('.score').nth(1).fill('');await p.getByRole('button',{name:'Save result',exact:true}).click();
assert.equal(await said(),'Result cleared for game 3.');assert.equal(await record('Dee').textContent(),'0W 1L');
await p.locator('#undo').click();assert.equal(await rows().first().locator('.teams').textContent(),'Dee & EliWon11–9Cal & Bea','Undo restores the result');

// 5. Two courts: players can switch across courts, and each court records its own result.
await p.locator('#add-court').click();await add('Fay','Gus','Hal','Ivy');
await p.locator('[data-court="1"] .game-action').click();await p.locator('[data-court="2"] .game-action').click();
assert.deepEqual(await chips(1),['Ali','Dee','Eli','Cal']);assert.deepEqual(await chips(2),['Bea','Fay','Gus','Hal']);const before=[await game(0),await game(1)];
await chip('Ali').click();await chip('Gus').click();
assert.deepEqual(await chips(1),['Gus','Dee','Eli','Cal']);assert.deepEqual(await chips(2),['Bea','Fay','Ali','Hal']);
assert.notEqual(await game(0),before[0]);assert.notEqual(await game(1),before[1]);
await score(2,0).fill('5');await score(2,1).fill('11');await finish('Finish game only',2);
assert.equal(await rows().first().locator('.when').textContent(),'Game 4 · Court 2');assert.equal(await rows().first().locator('.teams').textContent(),'Bea & Fay5–11Ali & HalWon');
assert.equal(await p.locator('#results-more').isHidden(),true,'Five or fewer games need no Show all');

// 6. Saved sessions keep the results and each player's wins and losses.
await p.locator('#archive-name').fill('Results test');await p.locator('#archive-save').click();await p.getByText(/Saved in this browser/).waitFor();
await p.getByRole('button',{name:'View Results test',exact:true}).click();const saved=await p.locator('#archive-content').textContent();
assert.match(saved,/Won–Lost/);assert.match(saved,/Bea4[23]–[12]/);assert.match(saved,/Game 1 · Court 1Cal & Bea 11–7 Ali & Dee · Cal & Bea won/);assert.match(saved,/Game 2 · Court 1Eli & Cal vs Bea & Ali · Bea & Ali won/);
await p.locator('#archive-dismiss').click();

// 7. Phone width, reload, and Reset.
await p.setViewportSize({width:390,height:844});await p.waitForFunction(()=>!document.querySelector('.flying'));assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No sideways scroll on phones');
await p.reload();assert.equal(await rows().count(),4);assert.deepEqual(await chips(1),['Gus','Dee','Eli','Cal']);
await p.locator('#reset').click();assert.equal(await p.locator('#results').isHidden(),true,'Reset clears the results');

// 8. Reduced motion: switching still works.
const r=await page({viewport:{width:1280,height:900},reducedMotion:'reduce'},{players:['Ana','Bo','Cy','Di'].map((name,i)=>({id:'p'+i,name,games:0})),queue:[],courts:[{id:1,current:['p0','p1','p2','p3'],game:'g1'}],completed:0});
await r.goto(base+'/app.html');await r.getByRole('button',{name:'Ana, Team A',exact:true}).click();await r.getByRole('button',{name:'Di, Team B',exact:true}).click();
assert.deepEqual(await r.locator('.player-chip').allTextContents(),['Di','Bo','Cy','Ana']);

// 9. Damaged saved data: results and score drafts with the wrong shape are dropped, and the session still loads.
const d=await page({},{players:[{id:'a',name:'Ana',games:1}],queue:['a'],courts:[{id:1,current:[],score:'x',winner:'Z'}],completed:1,results:[{bad:1},{id:'g',n:1,court:1,ids:['a','b','c','d'],names:['Ana','Bo','Cy','Di'],score:[11,7],winner:'A'},{id:'h',n:2,court:1,ids:['a','b','c','d'],names:['Ana','Bo','Cy','Di'],score:[11,11.5],winner:'B'}]});
await d.goto(base+'/app.html');assert.equal(await d.locator('#notice').isHidden(),true);assert.equal(await d.locator('#roster tr').count(),1);
assert.equal(await d.locator('#results-list > li').count(),1);assert.equal(await d.locator('#results-list .teams').textContent(),'Ana & BoWon11–7Cy & Di');

assert.deepEqual(errors,[]);await browser.close();await new Promise(r=>server.close(r));
console.log('PASS switch players on a court and across courts, new teams restart guesses, keyboard and Escape, score decides the winner, half and tied scores stop the finish, winner only, add edit and clear results later, wins and losses, saved sessions, phone width, reduced motion, damaged data');
})().catch(e=>{console.error(e);process.exit(1);});
