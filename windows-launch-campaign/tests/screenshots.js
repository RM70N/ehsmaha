const { chromium } = require('playwright'); const start=require('./server');
const S=require('os').tmpdir()+'/wlc-shots-'; // اللقطات تُحفظ خارج المستودع
(async()=>{
  const srv=await start(8123);
  const b=await chromium.launch();
  const run=async(name,vp,opts={})=>{
    const ctx=await b.newContext({viewport:vp,deviceScaleFactor:1,...opts.ctx});
    const pg=await ctx.newPage();
    await pg.route(u=>!/127\.0\.0\.1|localhost|file:/.test(u.toString()),r=>r.abort());
    await pg.goto('http://127.0.0.1:8123/index.html',{waitUntil:'load'});
    await pg.waitForSelector('#wlc-root.is-open',{timeout:15000});
    await pg.waitForTimeout(3500);
    await pg.screenshot({path:S+name+'.png'});
    await ctx.close();
  };
  await run('new-1024x768',{width:1024,height:768});
  await run('new-390x844',{width:390,height:844},{ctx:{isMobile:true,hasTouch:true}});
  await run('new-360x640',{width:360,height:640},{ctx:{isMobile:true,hasTouch:true}});
  await run('new-844x390',{width:844,height:390},{ctx:{isMobile:true,hasTouch:true}});
  await b.close(); srv.close();
})().catch(e=>{console.error(e);process.exit(1)});
