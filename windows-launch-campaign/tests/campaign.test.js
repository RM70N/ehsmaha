const { chromium } = require('playwright'); const { installFakeFirebase } = require('../../desktop/test/e2e/fake-firebase.js'); const start=require('./server'); const assert=require('assert');
const URL='http://127.0.0.1:8123/';
const results=[]; const ok=(n)=>{results.push('PASS '+n);console.log('PASS',n)};
const setNow=async(t)=>{await fetch(URL+'__now?t='+encodeURIComponent(t||''))};
(async()=>{
  const srv=await start(8123); const b=await chromium.launch();
  const mk=async(vp={width:1440,height:900},extra={})=>{const ctx=await b.newContext({viewport:vp,...extra});const pg=await ctx.newPage();
    await installFakeFirebase(pg,require('path').join(__dirname,'..','..','index.html')); pg._errs=[]; pg.on('pageerror',e=>pg._errs.push(String(e))); return {ctx,pg};};
  const visible=(pg)=>pg.evaluate(()=>!!document.getElementById('wlc-root'));
  const waitOpen=(pg)=>pg.waitForSelector('#wlc-root.is-open',{timeout:15000});

  // 1) active period (server time = day 3) → opens automatically, no login, medium size
  await setNow('2026-11-09T12:00:00Z');
  let {ctx,pg}=await mk(); await pg.goto(URL+'index.html'); await waitOpen(pg); await pg.waitForTimeout(1500);
  const box=await pg.evaluate(()=>{const c=document.querySelector('.wlc-card').getBoundingClientRect();return {w:c.width,h:c.height,vw:innerWidth,vh:innerHeight}});
  assert(box.w<=861&&box.w>=800,'width '+box.w); assert(box.h<=0.75*box.vh+1,'height '+box.h); assert(Math.abs(box.w/box.h-1040/590)<0.01,'ratio');
  ok('auto-open in campaign window; card '+Math.round(box.w)+'x'+Math.round(box.h)+' (<=860 wide, <=75% height, ratio 1040/590)');
  const closeBox=await pg.evaluate(()=>{const c=document.querySelector('.wlc-close').getBoundingClientRect();const s=document.querySelector('.wlc-close svg').getBoundingClientRect();return {w:c.width,h:c.height,sw:s.width}});
  assert(closeBox.w>=54&&closeBox.w<=58&&closeBox.sw>=23&&closeBox.sw<=26,JSON.stringify(closeBox)); ok('close button '+closeBox.w+'px, X '+closeBox.sw+'px');
  // 2) close with X
  await pg.click('.wlc-close'); await pg.waitForTimeout(500);
  assert(!(await visible(pg))); ok('X closes the overlay');
  const stale=await pg.evaluate(()=>({ov:document.documentElement.style.overflow,pr:document.documentElement.style.paddingRight,hit:(()=>{const e=document.elementFromPoint(innerWidth/2,innerHeight/2);return e?e.id||e.tagName:''})(),root:!!document.querySelector('.wlc-root,.wlc-backdrop')}));
  assert(stale.ov===''&&!stale.root,JSON.stringify(stale)); ok('no leftover layer / scroll lock after close (center hit: '+stale.hit+')');
  // 3) reload in same session → not shown again
  await pg.reload(); await pg.waitForTimeout(4000); assert(!(await visible(pg))); ok('reload after close in same session: not shown');
  assert((await pg.evaluate(()=>sessionStorage.getItem('ehsemha-wlc:ehsemha-windows-launch-2026:closed')))==='1'); ok('closed flag stored in sessionStorage');
  const own=pg._errs.filter(e=>!/webgl/i.test(e)); assert(own.length===0,own.join('|')); ok('no page errors from the campaign (site-side WebGL errors in headless Chromium ignored)'); await ctx.close();

  // 4) new session → shows again; Escape closes
  ({ctx,pg}=await mk()); await pg.goto(URL+'index.html'); await waitOpen(pg); await pg.keyboard.press('Escape'); await pg.waitForTimeout(500);
  assert(!(await visible(pg))); ok('new session shows again; Escape closes'); await ctx.close();

  // 5) CTA → windows-app.html (200), no new tab
  ({ctx,pg}=await mk()); await pg.goto(URL+'index.html'); await waitOpen(pg); await pg.waitForTimeout(1800);
  const pages0=ctx.pages().length;
  await Promise.all([pg.waitForURL('**/windows-app.html',{timeout:8000}),pg.click('.wlc-cta')]);
  assert(ctx.pages().length===pages0); const st=await pg.evaluate(()=>document.title); assert(/احسمها|ويندوز|Windows/i.test(st)||st.length>0);
  ok('CTA navigates to /windows-app.html (same tab), title: '+st); await ctx.close();
  // CTA on mobile (touch)
  ({ctx,pg}=await mk({width:390,height:844},{isMobile:true,hasTouch:true})); await pg.goto(URL+'index.html'); await waitOpen(pg); await pg.waitForTimeout(1800);
  await Promise.all([pg.waitForURL('**/windows-app.html',{timeout:8000}),pg.tap('.wlc-cta')]); ok('CTA works on mobile (tap)');
  await ctx.close();

  // 6) before start → not shown ; after end → not shown ; expires while open
  await setNow('2026-11-07T17:00:00Z'); ({ctx,pg}=await mk()); await pg.goto(URL+'index.html'); await pg.waitForTimeout(5000);
  assert(!(await visible(pg))); ok('before start (server 20:00 +03 on 7 Nov): not shown'); await ctx.close();
  await setNow('2026-11-22T18:00:01Z'); ({ctx,pg}=await mk()); await pg.goto(URL+'index.html'); await pg.waitForTimeout(5000);
  assert(!(await visible(pg))); ok('after end (22 Nov 21:00:01 +03): not shown'); await ctx.close();
  await setNow('2026-11-22T17:59:50Z'); ({ctx,pg}=await mk()); await pg.goto(URL+'index.html'); await waitOpen(pg);
  await pg.waitForFunction(()=>!document.getElementById('wlc-root'),null,{timeout:20000}); ok('campaign ends while open → closes automatically'); await ctx.close();
  // starts while page open (pending → scheduleStart)
  await setNow('2026-11-07T17:59:56Z'); ({ctx,pg}=await mk()); await pg.goto(URL+'index.html'); await pg.waitForTimeout(2500); assert(!(await visible(pg)));
  await waitOpen(pg); ok('opens exactly at start time for an already-open page'); await ctx.close();

  // 7) inside the Windows app → never
  await setNow('2026-11-09T12:00:00Z');
  ({ctx,pg}=await mk()); await pg.addInitScript(()=>{window.ehsmahaDesktop={isDesktopApp:true}}); await pg.goto(URL+'index.html'); await pg.waitForTimeout(5000);
  assert(!(await visible(pg))); ok('inside Windows app (ehsmahaDesktop.isDesktopApp): not shown'); await ctx.close();

  // 8) active game round / game page → not shown
  ({ctx,pg}=await mk()); await pg.addInitScript(()=>{const t=setInterval(()=>{const a=document.querySelector('.page.active'); if(a){a.classList.remove('active'); let g=document.getElementById('pg-bomb-play'); if(!g){g=document.createElement('div');g.className='page';g.id='pg-bomb-play';document.body.appendChild(g)} g.classList.add('active'); clearInterval(t)}},30)});
  await pg.goto(URL+'index.html'); await pg.waitForTimeout(5000); assert(!(await visible(pg))); ok('game page active: not shown'); await ctx.close();
  ({ctx,pg}=await mk()); await pg.goto(URL+'roulette3d.html'); await pg.waitForTimeout(3500); assert(!(await visible(pg))); ok('standalone game page: no overlay'); await ctx.close();
  // closes when player enters a game while open
  ({ctx,pg}=await mk()); await pg.goto(URL+'index.html'); await waitOpen(pg);
  await pg.evaluate(()=>{const a=document.querySelector('.page.active'); if(a) a.classList.remove('active'); let g=document.getElementById('pg-bomb-play'); if(!g){g=document.createElement('div');g.className='page';g.id='pg-bomb-play';document.body.appendChild(g)} g.classList.add('active');}); await pg.waitForFunction(()=>!document.getElementById('wlc-root'),null,{timeout:8000}); ok('overlay closes if player enters a game while it is open'); await ctx.close();

  // 8b) connected TikTok chat only (no round) must NOT block the ad
  ({ctx,pg}=await mk()); await pg.addInitScript(()=>{window.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('script');s.textContent='window.__x=1';document.head.appendChild(s)})});
  await pg.goto(URL+'index.html'); await pg.waitForFunction(()=>document.querySelector('.page.active'),null,{timeout:15000});
  await pg.evaluate(()=>{ try { homeConnections.set('x',{ws:{}}) } catch(e) { window.homeConnections=new Map([['x',{ws:{}}]]) } });
  await waitOpen(pg); ok('connected chat (no game round) does not block the overlay'); await ctx.close();

  // 9) site not altered: only 2 script tags + overlay styles prefixed
  const css=require('fs').readFileSync(require('path').join(__dirname,'..','campaign.css'),'utf8');
  const sels=css.replace(/\/\*[\s\S]*?\*\//g,'').replace(/@font-face\{[^}]*\}/g,'').replace(/@keyframes [\w-]+\{(?:[^{}]|\{[^{}]*\})*\}/g,'').replace(/@media[^{]*\{/g,'').split('{').map(x=>x.split('}').pop().trim()).filter(Boolean);
  const bad=sels.filter(s=>s.split(',').some(p=>!/\.wlc-|#wlc-/.test(p)));
  assert(bad.length===0,'unscoped selectors: '+bad.join(' | ')); ok('all CSS selectors are wlc- scoped ('+sels.length+' rules)');
  console.log('\n'+results.length+' checks passed');
  await b.close(); srv.close();
})().catch(e=>{console.error('FAIL',e.message);process.exit(1)});
